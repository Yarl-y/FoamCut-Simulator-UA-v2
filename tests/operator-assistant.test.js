import test from 'node:test'
import assert from 'node:assert/strict'
import { assessOperatorState, buildOperatorSignals, buildOperatorSteps } from '../src/operator-assistant.js'

const ready = {
  connected: true, simulation: false, alarm: false, running: false, hasNc: true,
  validation: { valid: true }, dynamics: { dangerCount: 0, warningCount: 0 }, machineZeroKnown: true,
  installationChecks: { block: true, wire: true, zero: true, safety: true, dryrun: true }
}

test('assistant reports normal only after all checks', () => {
  assert.equal(assessOperatorState(ready).level, 'normal')
})

test('assistant reports attention for simulation or incomplete checks', () => {
  assert.equal(assessOperatorState({ ...ready, simulation: true }).level, 'attention')
  assert.equal(assessOperatorState({ ...ready, installationChecks: { ...ready.installationChecks, safety: false } }).level, 'attention')
})

test('assistant fails closed on alarm, lost link or invalid NC', () => {
  assert.equal(assessOperatorState({ ...ready, alarm: true }).level, 'stop')
  assert.equal(assessOperatorState({ ...ready, running: true, connected: false }).level, 'stop')
  assert.equal(assessOperatorState({ ...ready, validation: { valid: false } }).level, 'stop')
})

test('assistant exposes five readable signals and ordered next steps', () => {
  const context = { ...ready, simulation: true, machineZeroKnown: false, dynamics: null }
  const signals = buildOperatorSignals(context)
  assert.deepEqual(signals.map(signal => signal.id), ['connection', 'nc', 'zero', 'checks', 'analysis'])
  assert.equal(signals.find(signal => signal.id === 'zero').state, 'attention')
  const steps = buildOperatorSteps(context)
  assert.match(steps[0], /карту встановлення/i)
  assert.ok(steps.some(step => /homing/i.test(step)))
})

test('reviewed warnings no longer block normal state but dangers always stop', () => {
  const warningContext = { ...ready, dynamics: { dangerCount: 0, warningCount: 7 }, warningsAcknowledged: true }
  assert.equal(assessOperatorState(warningContext).level, 'normal')
  assert.equal(buildOperatorSignals(warningContext).find(signal => signal.id === 'analysis').value, 'Переглянуто: 7')
  assert.equal(assessOperatorState({ ...warningContext, dynamics: { dangerCount: 1, warningCount: 0 } }).level, 'stop')
})
