import test from 'node:test'
import assert from 'node:assert/strict'
import { createFuselageBatchLayout } from '../src/batch-layout.js'
import { createGliderFuselageSegment } from '../src/profile-library.js'

const centerX = points => (
  Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x))
) / 2

test('fuselage stations of different widths share one longitudinal centreline', () => {
  const segment = createGliderFuselageSegment({
    segmentIndex: 0,
    stations: [
      { name: 'Мала', position: 0, width: 0.3, height: 0.5, lift: 0, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 },
      { name: 'Велика', position: 1, width: 1, height: 1, lift: 0, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 }
    ],
    totalLength: 100,
    maximumWidth: 120,
    maximumHeight: 100,
    hollow: true,
    wallThickness: 5,
    bottomThickness: 5,
    ceilingThickness: 5,
    pointCount: 80
  })

  assert.ok(Math.abs(centerX(segment.leftPoints) - centerX(segment.rightPoints)) < 1e-9)
  assert.ok(Math.abs(centerX(segment.innerLeftPoints) - centerX(segment.innerRightPoints)) < 1e-9)
  assert.ok(Math.abs(centerX(segment.leftPoints) - centerX(segment.innerLeftPoints)) < 1e-9)
})

test('batch rotation keeps a legacy straight tube point aligned on both faces', () => {
  const part = {
    id: 1,
    kind: 'fuselage',
    name: 'Нерівні старі профілі',
    span: 50,
    outerLeft: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 20 }, { x: 0, y: 20 }],
    outerRight: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }],
    innerLeft: null,
    innerRight: null,
    cutLeft: [{ x: 40, y: 10 }],
    cutRight: [{ x: 20, y: 10 }]
  }
  const layout = createFuselageBatchLayout([part], {
    blockWidth: 40,
    blockHeight: 100,
    blockThickness: 50,
    corridor: 0
  })
  const item = layout.items[0]

  assert.equal(item.rotated, true)
  assert.ok(Math.abs(item.cutLeft[0].x - item.cutRight[0].x) < 1e-9)
  assert.ok(Math.abs(item.cutLeft[0].y - item.cutRight[0].y) < 1e-9)
})
