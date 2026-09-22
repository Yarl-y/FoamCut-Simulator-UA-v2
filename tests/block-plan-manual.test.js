import test from 'node:test'
import assert from 'node:assert/strict'
import { createBlockPlanFile, parseBlockPlanFile } from '../src/block-plan.js'

const blocks = [{ name: 'Блок 1', width: 580, height: 590, thickness: 100, columns: 1 }]

test('manual position and route survive save and reopen', () => {
  const created = createBlockPlanFile(blocks, 20, [], {
    manualPlacements: [{ partId: 7, blockNumber: 1, centerX: 125, centerY: 230,
      turns: 3, mirrorX: true, mirrorY: false }],
    manualRoutes: [{ blockNumber: 1, steps: [
      { type: 'point', x: 0, y: 120 },
      { type: 'section', partId: 7, entryHint: { x: 130, y: 220, side: 'left' } },
      { type: 'exitBottom' }
    ] }]
  })
  const reopened = parseBlockPlanFile(JSON.stringify(created))
  assert.equal(reopened.version, 2)
  assert.deepEqual(reopened.manualPlacements, created.manualPlacements)
  assert.deepEqual(reopened.manualRoutes, created.manualRoutes)
})

test('old block plans remain readable', () => {
  const older = { format: 'foamcut-block-plan', version: 1, blocks, corridor: 20, assignments: [] }
  const reopened = parseBlockPlanFile(JSON.stringify(older))
  assert.deepEqual(reopened.manualPlacements, [])
  assert.deepEqual(reopened.manualRoutes, [])
})
