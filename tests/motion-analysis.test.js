import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeMotionDynamics, formatMotionFindingsForAi, groupMotionFindings } from '../src/motion-analysis.js'
import { createBatchCutRoute } from '../src/batch-layout.js'

const limits = { X: 600, Y: 600, A: 600, Z: 600 }
const program = 'G90\nF300\nG1 X5 Y5 A5 Z5\nG1 X0 Y0 A0 Z0'
test('unknown work zero cannot claim physical clearance', () => {
  const report = analyzeMotionDynamics(program, { limits })
  assert.equal(report.machineZeroKnown, false)
  assert.ok(report.findings.some(f => f.type === 'Прив’язка нуля'))
  assert.ok(report.findings.some(f => f.type === 'Межа моделі X'))
  assert.ok(!report.findings.some(f => f.type === 'Машинна межа X'))
})
test('known offset distinguishes work zero from physical travel edge', () => {
  const report = analyzeMotionDynamics(program, { limits, workZeroMachine: { X: 50, Y: 50, A: 50, Z: 50 } })
  assert.equal(report.machineZeroKnown, true)
  assert.ok(!report.findings.some(f => f.type.includes('межа') || f.type.includes('Межа')))
  assert.deepEqual(report.segments.at(-1).to, { X: 0, Y: 0, A: 0, Z: 0 })
})
test('physical overtravel is still a danger with known zero', () => {
  const report = analyzeMotionDynamics('G1 X590 Y20 A20 Z20', { limits, workZeroMachine: { X: 20, Y: 20, A: 20, Z: 20 } })
  assert.ok(report.findings.some(f => f.type === 'Машинна межа X' && f.severity === 'danger'))
})
test('missing offset axis leaves physical position unknown', () => {
  assert.equal(analyzeMotionDynamics(program, { limits, workZeroMachine: { X: 0, Y: 0, A: 0 } }).machineZeroKnown, false)
})
test('grouping retains all details and worst clearance', () => {
  const findings = [5, 3, 0].map((clearance, i) => ({ severity: 'warning', type: 'Межа моделі X', clearance, lineNumber: i + 2, message: String(clearance) }))
  const [group] = groupMotionFindings(findings)
  assert.equal(group.count, 3)
  assert.equal(group.clearance, 0)
  assert.equal(group.messages.length, 3)
  assert.deepEqual(group.lines, [2, 3, 4])
})

test('rounding-size segment does not create a false 149 degree reversal', () => {
  const result = analyzeMotionDynamics('G90\nF300\nG1 X222.260 Y13.001 A222.260 Z13.001\nG1 X222.259 Y13.000 A222.259 Z13.000\nG1 X222.401 Y13.036 A222.401 Z13.036', {
    limits: { X: 600, Y: 600, A: 600, Z: 600 }, maximumFeed: 1000, acceleration: 100
  })
  assert.equal(result.findings.filter(item => item.type === 'Розворот').length, 0)
})

test('nearly stationary wire end is reported as a burn-through risk', () => {
  const result = analyzeMotionDynamics('G90\nF300\nG1 X20 Y0 A0.5 Z0', { limits })
  const risk = result.findings.find(item => item.type === 'Ризик пропалу')
  assert.equal(result.burnThroughRiskCount, 1)
  assert.equal(risk.lineNumber, 3)
  assert.match(risk.message, /X\/Y 20\.000 мм, A\/Z 0\.500 мм \(2\.5%\)/)
})

test('balanced movement of both wire ends has no burn-through warning', () => {
  const result = analyzeMotionDynamics('G90\nG1 X20 Y0 A18 Z0', { limits })
  assert.equal(result.burnThroughRiskCount, 0)
  assert.ok(!result.findings.some(item => item.type === 'Ризик пропалу'))
})

test('AI context separates and prioritizes NC findings with line numbers', () => {
  const text = formatMotionFindingsForAi({
    dangerCount: 1, warningCount: 1, maximumProgramFeed: 300,
    findings: [
      { severity: 'warning', type: 'Гострий кут', lineNumber: 20, message: 'Зміна напрямку 90°' },
      { severity: 'danger', type: 'Межа моделі X', lineNumber: 15, message: 'Запас -2 мм', clearance: -2 }
    ]
  })
  assert.match(text, /небезпек 1, попереджень 1/)
  assert.ok(text.indexOf('НЕБЕЗПЕКА') < text.indexOf('УВАГА'))
  assert.match(text, /рядки 15/)
})

test('explicit service reversal stays visible but is not a danger', () => {
  const result = analyzeMotionDynamics('G90\nG1 X10 Y0 A10 Z0\n(Контрольоване повернення по входу)\nG1 X0 Y0 A0 Z0', { limits })
  assert.equal(result.dangerCount, 0)
  assert.equal(result.advisories.length, 1)
  assert.equal(result.advisories[0].type, 'Контрольоване повернення')
  assert.match(formatMotionFindingsForAi(result), /СЛУЖБОВИЙ РУХ/)
})

test('unmarked reversal remains a danger', () => {
  const result = analyzeMotionDynamics('G90\nG1 X10 Y0 A10 Z0\nG1 X0 Y0 A0 Z0', { limits })
  assert.equal(result.dangerCount, 1)
  assert.equal(result.advisories.length, 0)
})

test('batch route labels a controlled return around a spar hole in a solid section', () => {
  const cut = [{ x: 10, y: 20 }, { x: 20, y: 20 }, { x: 10.54, y: 23.26 }, { x: 10, y: 30 }]
  const item = {
    row: 0, column: 0, index: 0, innerLeft: null, innerRight: null,
    cutLeft: cut, cutRight: cut.map(point => ({ ...point })),
    part: { name: 'Суцільна секція з отвором', straightSparRods: [{}] }
  }
  const route = createBatchCutRoute({ items: [item], rows: 1, blockWidth: 100, blockHeight: 100, corridor: 20, rowLanes: [10] })
  assert.ok(route.events.some(event => event.comment === 'Контрольоване повернення по входу'))
})
