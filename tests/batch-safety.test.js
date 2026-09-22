import test from 'node:test'
import assert from 'node:assert/strict'
import { validateManualBatchNc } from '../src/batch-safety.js'

const limits = { x: 600, y: 600, a: 600, z: 600 }
const straight = '%\nG21\nG90\nF300\nG1 X0 Y0 A0 Z0\nG1 X100 Y100 A100 Z100\nM30\n%\n'

test('an overhanging blank is allowed when actual carriage path is safe', () => {
  const result = validateManualBatchNc({ nc: straight, limits })
  assert.equal(result.valid, true)
})

test('unequal wire-end travel remains visible as a warning without blocking NC', () => {
  const nc = '%\nG21\nG90\nF300\nG1 X0 Y0 A0 Z0\nG1 X0.01 Y0 A10 Z0\nM30\n%\n'
  const result = validateManualBatchNc({ nc, blockWidth: 500, blockHeight: 500, limits })
  assert.equal(result.valid, true)
  assert.equal(result.errors.length, 0)
  assert(result.warnings.some(warning => warning.includes('ризику пропалу')))
})
