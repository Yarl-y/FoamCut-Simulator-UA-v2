import test from 'node:test'
import assert from 'node:assert/strict'
import { assessWire, createResumePlan, estimateCutTime, formatCompletedRun, prioritizeWarnings, recommendHeat, simulationDelayMs } from '../src/operator-advanced.js'

test('cut time includes motion and service delay', () => {
  const result = estimateCutTime([{ durationSeconds: 10 }, { durationSeconds: 20 }], { warmupSeconds: 5, commandDelaySeconds: 1 })
  assert.equal(result.totalSeconds, 37)
  assert.equal(result.label, '37 с')
})

test('simulation delay follows motion time and stays responsive', () => {
  assert.equal(simulationDelayMs(0.001), 4)
  assert.equal(simulationDelayMs(2), 100)
  assert.equal(simulationDelayMs(100), 250)
})

test('danger and low-clearance warnings are prioritized', () => {
  const result = prioritizeWarnings([
    { severity: 'warning', type: 'Кут', lineNumber: 2 },
    { severity: 'danger', type: 'Межа', lineNumber: 9 },
    { severity: 'warning', type: 'Межа', clearance: 1, lineNumber: 5 }
  ])
  assert.deepEqual(result.map(item => item.priority), [3, 2, 1])
})

test('wire monitor fails closed and heating advice stays bounded', () => {
  assert.equal(assessWire({ mode: 'simulation', continuity: false }).level, 'stop')
  assert.equal(assessWire({ mode: 'simulation', continuity: true, tensionPercent: 100 }).level, 'normal')
  const heat = recommendHeat({ material: 'xps', thickness: 500, feed: 3000, wireDiameter: 0.1 })
  assert.ok(heat.minimum >= 10 && heat.maximum <= 90)
})

test('resume is a non-executable safety plan and run report is complete', () => {
  const plan = createResumePlan({ lineNumber: 12, command: 'G1 X10', positions: { X: 10 } })
  assert.equal(plan.resumable, false)
  assert.match(plan.text, /Автоматичне продовження заблоковано/)
  const report = formatCompletedRun({ result: 'OK', elapsedSeconds: 65, completedLines: 10, totalLines: 10, positions: { X: 1 } })
  assert.match(report, /1 хв 5 с/)
  assert.match(report, /10 із 10/)
})
