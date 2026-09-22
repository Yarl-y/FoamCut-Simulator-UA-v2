import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFuselageBatchLayout, createFreeFuselageLayout,
  createMultiBlockLayouts, createBatchCutRoute, createFreeBatchRoute,
  applyManualFuselageLayout, rebaseManualRouteMargin
} from '../src/batch-layout.js'
import { createPairedHollowCutPath } from '../src/profile-library.js'

const rectangle = (width, height) => [
  { x: -width / 2, y: 0 }, { x: width / 2, y: 0 },
  { x: width / 2, y: height }, { x: -width / 2, y: height }
]

const hollowPart = id => {
  const outer = rectangle(80, 50)
  const inner = rectangle(30, 20).map(point => ({ ...point, y: point.y + 15 }))
  const cut = createPairedHollowCutPath(outer, outer, inner, inner)
  return {
    id, kind: 'fuselage', name: `Секція ${id}`, span: 100,
    outerLeft: outer, outerRight: outer,
    innerLeft: inner, innerRight: inner,
    cutLeft: cut.leftPoints, cutRight: cut.rightPoints,
    straightSparRods: []
  }
}

const samePoint = (first, second) => first.x === second.x && first.y === second.y
const segmentCount = (events, first, second) => events.slice(1).filter((event, index) => {
  const previous = events[index]
  return (samePoint(previous.left, first) && samePoint(event.left, second))
    || (samePoint(previous.left, second) && samePoint(event.left, first))
}).length

test('free placement does not impose a six-section rotation or a row grid', () => {
  const layout = createFreeFuselageLayout(
    Array.from({ length: 9 }, (_, index) => hollowPart(index + 1)),
    { blockWidth: 600, blockHeight: 600, blockThickness: 100, corridor: 20 }
  )
  assert.equal(layout.items.length, 9)
  assert.equal(layout.freePlacement, true)
  assert.equal(layout.rows, 0)
  assert.equal(layout.columns, 0)
  for (const item of layout.items) {
    assert.ok(item.bounds.minX >= 10 && item.bounds.maxX <= 590)
    assert.ok(item.bounds.minY >= 10 && item.bounds.maxY <= 590)
    if (!item.rotated) continue
    const bottom = Math.min(...item.outerLeft.map(point => point.y))
    assert.equal(item.cutLeft[0].y, bottom, 'cavity entry is rebuilt at the new bottom')
  }
  for (let index = 0; index < layout.items.length; index += 1) {
    for (let next = index + 1; next < layout.items.length; next += 1) {
      const first = layout.items[index].bounds
      const second = layout.items[next].bounds
      assert.ok(first.minX >= second.maxX + 20 || second.minX >= first.maxX + 20
        || first.minY >= second.maxY + 20 || second.minY >= first.maxY + 20)
    }
  }
})

test('bottom corridor and cavity slit are crossed twice; exterior only once', () => {
  const layout = createFuselageBatchLayout([hollowPart(1)], {
    blockWidth: 150, blockHeight: 150, blockThickness: 100, corridor: 20
  })
  const item = layout.items[0]
  const route = createBatchCutRoute(layout)
  const start = item.cutLeft[0]
  const portal = { x: start.x, y: layout.rowLanes[item.row] }
  assert.equal(segmentCount(route.events, portal, start), 2)
  const firstConnectorPoint = item.cutLeft[1]
  assert.equal(segmentCount(route.events, start, firstConnectorPoint), 2)
  for (let index = 0; index < item.outerLeft.length; index += 1) {
    const next = (index + 1) % item.outerLeft.length
    assert.equal(segmentCount(route.events, item.outerLeft[index], item.outerLeft[next]), 1)
  }
  for (let index = 1; index < route.events.length; index += 1) {
    assert.ok(!samePoint(route.events[index - 1].left, route.events[index].left))
  }
})

test('multi-block planner can use free placement without generating a row order', () => {
  const layouts = createMultiBlockLayouts(
    [hollowPart(1), hollowPart(2), hollowPart(3)],
    [{ id: 1, name: 'Блок 1', width: 300, height: 250, thickness: 100 }],
    20, new Map(), new Map(), { placementMode: 'free' }
  )
  assert.equal(layouts.length, 1)
  assert.equal(layouts[0].freePlacement, true)
  assert.equal(layouts[0].items.length, 3)
  assert.deepEqual(layouts[0].rowLanes, [])
})

test('free route compares corridor strategies and visits every section once', () => {
  const layout = createFreeFuselageLayout(
    Array.from({ length: 4 }, (_, index) => hollowPart(index + 1)),
    { blockWidth: 580, blockHeight: 590, blockThickness: 100, corridor: 20 }
  )
  const route = createFreeBatchRoute(layout)
  assert.equal(route.orderedItems.length, 4)
  assert.equal(new Set(route.orderedItems.map(item => item.part.id)).size, 4)
  assert.equal(route.candidates.length, 4)
  assert.ok(route.candidates.some(candidate => Number.isFinite(candidate.corridorLength)))
  assert.deepEqual(route.events[0].left, route.home)
  assert.deepEqual(route.events.at(-1).left, route.home)
  for (const item of layout.items) {
    for (let index = 0; index < item.outerLeft.length; index += 1) {
      const next = (index + 1) % item.outerLeft.length
      assert.equal(segmentCount(route.events, item.outerLeft[index], item.outerLeft[next]), 1)
    }
  }
})

test('manual layout can move, turn and mirror a section while rejecting overlap', () => {
  const layout = createFreeFuselageLayout([hollowPart(1), hollowPart(2)],
    { blockWidth: 350, blockHeight: 350, blockThickness: 100, corridor: 20 })
  const placements = new Map([[1, { centerX: 100, centerY: 100, turns: 1, mirrorX: true }],
    [2, { centerX: 250, centerY: 250, turns: 2, mirrorY: true }]])
  const manual = applyManualFuselageLayout(layout, placements)
  assert.equal(manual.items[0].manualTurns, 1)
  assert.equal(manual.items[0].manualMirrorX, true)
  assert.equal(manual.items[1].manualMirrorY, true)
  assert.throws(() => applyManualFuselageLayout(layout, new Map([
    [1, { centerX: 100, centerY: 100 }], [2, { centerX: 110, centerY: 100 }]
  ])), /перетин|коридор/)
})

test('manual route follows operator section order and optional branch to block edge', () => {
  const layout = createFreeFuselageLayout([hollowPart(1), hollowPart(2)],
    { blockWidth: 350, blockHeight: 350, blockThickness: 100, corridor: 20 })
  const steps = [{ type: 'section', partId: 2 }, { type: 'home' },
    { type: 'point', x: 0, y: 100 }, { type: 'section', partId: 1 }]
  const route = createFreeBatchRoute(layout, { steps })
  assert.equal(route.strategy, 'ручний')
  assert.deepEqual(route.orderedItems.map(item => item.part.id), [2, 1])
  assert.equal(route.candidates.length, 1)
  assert.throws(() => createFreeBatchRoute(layout, { steps: [{ type: 'section', partId: 1 }] }),
    /кожну/)
})

test('manual exit stays below block and returns horizontally to technical home', () => {
  const layout = createFreeFuselageLayout([hollowPart(1)],
    { blockWidth: 350, blockHeight: 350, blockThickness: 100, corridor: 20 })
  const manual = applyManualFuselageLayout(layout, new Map([[1,
    { centerX: 175, centerY: 180, turns: 0 }]]))
  const route = createFreeBatchRoute(manual, { steps: [
    { type: 'section', partId: 1 }, { type: 'exitBottom' }
  ] })
  assert.deepEqual(route.home, { x: -5, y: -5 })
  assert.deepEqual(route.events.at(-1).left, route.home)
  assert(route.events.some(event => event.left.x === 355 && event.left.y === -5))
  assert(route.events.at(-1).comment.includes('без торцювання'))
  assert.throws(() => createFreeBatchRoute(manual, { steps: [
    { type: 'exitBottom' }, { type: 'section', partId: 1 }
  ] }), /останнім/)
})

test('manual solid section retains its paired tube hole in the route', () => {
  const outer = rectangle(80, 50)
  const hole = [0, 90, 180, 270].map(degrees => ({
    x: 25 + 3 * Math.cos(degrees * Math.PI / 180),
    y: 25 + 3 * Math.sin(degrees * Math.PI / 180)
  }))
  const part = { id: 8, kind: 'fuselage', name: 'Суцільна з трубкою', span: 100,
    outerLeft: outer, outerRight: outer, innerLeft: null, innerRight: null,
    cutLeft: outer, cutRight: outer, straightSparRods: [{ diameter: 6 }],
    sparHolePairs: [{ left: hole, right: hole }] }
  const layout = createFreeFuselageLayout([part],
    { blockWidth: 200, blockHeight: 200, blockThickness: 100, corridor: 20 })
  const manual = applyManualFuselageLayout(layout, new Map([[8,
    { centerX: 100, centerY: 100, turns: 0 }]]))
  const route = createFreeBatchRoute(manual, { steps: [{ type: 'section', partId: 8 }] })
  assert(route.events.some(event => Math.abs(event.left.x - 128) < 0.001
    && Math.abs(event.left.y - 100) < 0.001))
  assert.throws(() => createFreeFuselageLayout([{ ...part, sparHolePairs: [] }],
    { blockWidth: 200, blockHeight: 200, blockThickness: 100, corridor: 20 }), /отвори трубок відсутні/)
})

test('old 20 mm waypoints can be deliberately rebased to 5 mm without changing sections', () => {
  const steps = [{ type: 'point', x: -20, y: 150 }, { type: 'section', partId: 3 },
    { type: 'point', x: 620, y: -20 }, { type: 'exitBottom' }]
  const result = rebaseManualRouteMargin(steps, 600, 600)
  assert.equal(result.changed, 3)
  assert.deepEqual(result.steps[0], { type: 'point', x: -5, y: 150 })
  assert.deepEqual(result.steps[2], { type: 'point', x: 605, y: -5 })
  assert.deepEqual(result.steps[1], steps[1])
  assert.deepEqual(steps[0], { type: 'point', x: -20, y: 150 })
})
