import test from 'node:test'
import assert from 'node:assert/strict'
import { createFuselageBatchLayout } from '../src/batch-layout.js'
import { createGliderFuselageSegment } from '../src/profile-library.js'

const centerX = points => (
  Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x))
) / 2

const bounds = points => ({
  minY: Math.min(...points.map(point => point.y)),
  maxY: Math.max(...points.map(point => point.y)),
  width: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
})

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

test('adjacent fuselage sections can have different roofs while sharing bottom and lower sides', () => {
  const stations = [
    { name: 'Початок', position: 0, width: 0.5, height: 0.5, lift: 0.1, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 },
    { name: 'Стик', position: 0.5, width: 1, height: 1, lift: 0.2, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 },
    { name: 'Кінець', position: 1, width: 0.6, height: 0.6, lift: 0, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 }
  ]
  const sectionSettings = [
    { jointBase: 'bottom', startScale: 1, endScale: 1.2 },
    { jointBase: 'bottom', startScale: 0.8, endScale: 1 }
  ]
  const common = { stations, sectionSettings, totalLength: 200, maximumWidth: 100, maximumHeight: 100, pointCount: 80 }
  const first = createGliderFuselageSegment({ ...common, segmentIndex: 0 })
  const second = createGliderFuselageSegment({ ...common, segmentIndex: 1 })
  const largeJoint = bounds(first.rightPoints)
  const smallJoint = bounds(second.leftPoints)

  assert.ok(Math.abs(largeJoint.width - 100) < 1e-6)
  assert.ok(Math.abs(smallJoint.width - 100) < 1e-6)
  assert.ok(Math.abs((largeJoint.maxY - largeJoint.minY) - 120) < 1e-6)
  assert.ok(Math.abs((smallJoint.maxY - smallJoint.minY) - 80) < 1e-6)
  assert.ok(Math.abs(bounds(first.leftPoints).minY - largeJoint.minY) < 1e-9)
  assert.ok(Math.abs(smallJoint.minY - bounds(second.rightPoints).minY) < 1e-9)
  assert.ok(Math.abs(largeJoint.minY - smallJoint.minY) < 1e-9)
  first.rightPoints.forEach((point, index) => {
    if (point.y <= largeJoint.minY + 70) {
      assert.ok(Math.abs(point.x - second.leftPoints[index].x) < 1e-9)
      assert.ok(Math.abs(point.y - second.leftPoints[index].y) < 1e-9)
    }
  })
})

test('inner cavity ceiling can stay level while the outer roof slopes', () => {
  const stations = [
    { name: 'Початок', position: 0, width: 1, height: 1, lift: 0, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 },
    { name: 'Кінець', position: 1, width: 1, height: 1, lift: 0, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 }
  ]
  const segment = createGliderFuselageSegment({
    stations,
    segmentIndex: 0,
    sectionSettings: [{
      hollow: true,
      wallThickness: 5,
      bottomThickness: 5,
      ceilingThickness: 5,
      jointBase: 'bottom',
      startScale: 1.2,
      endScale: 0.8,
      innerStartCeilingHeight: 72,
      innerEndCeilingHeight: 72
    }],
    totalLength: 100,
    maximumWidth: 100,
    maximumHeight: 100,
    hollow: true,
    pointCount: 80
  })
  const outerLeft = bounds(segment.leftPoints)
  const outerRight = bounds(segment.rightPoints)
  const innerLeft = bounds(segment.innerLeftPoints)
  const innerRight = bounds(segment.innerRightPoints)

  assert.ok(outerLeft.maxY - outerRight.maxY > 39)
  assert.ok(Math.abs(innerLeft.maxY - innerRight.maxY) < 1e-9)
  assert.ok(Math.abs(innerLeft.maxY - (outerLeft.minY + 72)) < 1e-9)
})

test('outer roof can be lowered below the former 72 percent limit', () => {
  const stations = [
    { name: 'Початок', position: 0, width: 1, height: 1, lift: 0, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 },
    { name: 'Кінець', position: 1, width: 1, height: 1, lift: 0, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 }
  ]
  const segment = createGliderFuselageSegment({
    stations,
    segmentIndex: 0,
    sectionSettings: [{ jointBase: 'bottom', startScale: 0.35, endScale: 1 }],
    totalLength: 100,
    maximumWidth: 100,
    maximumHeight: 100,
    pointCount: 80
  })
  const lowered = bounds(segment.leftPoints)

  assert.ok(Math.abs((lowered.maxY - lowered.minY) - 35) < 1e-6)
  assert.ok(Math.abs(lowered.width - 100) < 1e-6)
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
