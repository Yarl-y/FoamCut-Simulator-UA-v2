import test from 'node:test'
import assert from 'node:assert/strict'
import { assessOperatorState } from '../src/operator-assistant.js'

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
