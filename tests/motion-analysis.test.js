import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeMotionDynamics, groupMotionFindings } from '../src/motion-analysis.js'

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
