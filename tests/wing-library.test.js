import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createImportedWing,
  createImportedWingCutProfiles,
  findSmallerProfileCenter
} from '../src/wing-library.js'

const ellipse = (centerX, centerY, radiusX, radiusY, count = 80) => Array.from(
  { length: count },
  (_, index) => {
    const angle = Math.PI * 2 * index / count
    return {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY
    }
  }
)

test('restored tapered detail adds a straight through-hole to both cutting faces', () => {
  const wing = createImportedWing({
    name: 'Конус',
    span: 200,
    leftPoints: ellipse(50, 40, 45, 35),
    rightPoints: ellipse(50, 40, 30, 24),
    straightSparRods: [{ x: 50, y: 40, diameter: 12 }]
  })

  const cut = createImportedWingCutProfiles(wing)

  assert.equal(cut.leftPoints.length, cut.rightPoints.length)
  assert.ok(cut.leftPoints.length > cut.outerLeft.length)
  assert.ok(cut.rightPoints.length > cut.outerRight.length)
  const firstHolePoint = cut.leftPoints.findIndex(
    point => Math.abs(Math.hypot(point.x - 50, point.y - 40) - 6) < 0.01
  )
  assert.ok(firstHolePoint > 0 && firstHolePoint <= 7, 'the hole must be cut before the exterior perimeter')
  assert.ok(cut.rightPoints.some(point => Math.abs(Math.hypot(point.x - 50, point.y - 40) - 6) < 0.01))
})

test('restored detail rejects a through-hole that does not fit the smaller face', () => {
  const wing = createImportedWing({
    name: 'Конус',
    span: 200,
    leftPoints: ellipse(50, 40, 45, 35),
    rightPoints: ellipse(50, 40, 12, 10),
    straightSparRods: [{ x: 65, y: 40, diameter: 8 }]
  })

  assert.throws(
    () => createImportedWingCutProfiles(wing),
    /Отвір 1 не вміщується у профілі A\/Z/
  )
})

test('through-hole can bind to the bounding-box centre of the smaller face', () => {
  const wing = createImportedWing({
    name: 'Зміщений конус',
    span: 200,
    leftPoints: ellipse(50, 40, 45, 35),
    rightPoints: ellipse(52, 43, 20, 15)
  })

  assert.deepEqual(findSmallerProfileCenter(wing), { x: 52, y: 43, side: 'right' })
})
