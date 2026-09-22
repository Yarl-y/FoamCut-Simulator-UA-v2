import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createImportedWing,
  createImportedWingCutProfiles,
  createWingLibraryBackup,
  findSmallerProfileCenter,
  mergeWingLibraries,
  parseWingLibraryBackup
} from '../src/wing-library.js'
import { createLibraryProfile } from '../src/profile-library.js'

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
  const smallerTop = Math.max(...cut.outerRight.map(point => point.y))
  assert.ok(Math.abs(cut.rightPoints[0].y - smallerTop) < 0.01)
  assert.ok(Math.abs(cut.rightPoints[0].x - 50) < 0.01)
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

test('offline wing mode cuts the lower surface and spar holes before returning over the upper surface', () => {
  const wing = createImportedWing({
    name: 'Просте крило',
    span: 600,
    cutStrategy: 'wing-single',
    leftPoints: ellipse(50, 40, 45, 15),
    rightPoints: ellipse(50, 40, 30, 10),
    straightSparRods: [
      { x: 45, y: 40, diameter: 5 },
      { x: 60, y: 40, diameter: 7 }
    ]
  })

  const cut = createImportedWingCutProfiles(wing)
  const noseIndex = cut.leftPoints.findIndex(point => Math.abs(point.x - 5) < 0.01)
  const holeIndices = [
    { x: 45, radius: 2.5 },
    { x: 60, radius: 3.5 }
  ].map(hole => cut.leftPoints.findIndex(
    point => Math.abs(Math.hypot(point.x - hole.x, point.y - 40) - hole.radius) < 0.01
  ))

  assert.ok(Math.abs(cut.leftPoints[0].x - 95) < 0.01, 'the route must start at the trailing edge')
  assert.ok(cut.leftPoints[1].y < 40, 'the route must leave along the lower surface')
  assert.ok(noseIndex > 0)
  assert.ok(holeIndices.every(index => index > 0 && index < noseIndex), 'all holes must branch from the lower first surface')
  assert.equal(cut.holeEntrySurface, 'lower')
})

test('offline wing mode recognizes a sharp trailing edge when the nose points right', () => {
  const points = createLibraryProfile('naca0012', 120).map(point => ({
    x: (1 - point.x) * 100,
    y: point.y * 100 + 20
  }))
  const wing = createImportedWing({
    name: 'Крило носиком праворуч',
    span: 600,
    cutStrategy: 'wing-single',
    leftPoints: points,
    rightPoints: points,
    straightSparRods: [{ x: 60, y: 20, diameter: 4 }]
  })

  const cut = createImportedWingCutProfiles(wing)
  const noseIndex = cut.leftPoints.findIndex(point => point.x > 99.9)
  const firstHolePoint = cut.leftPoints.findIndex(
    point => Math.abs(Math.hypot(point.x - 60, point.y - 20) - 2) < 0.01
  )

  assert.ok(cut.leftPoints[0].x < 0.1, 'the sharp left edge must be selected as trailing edge')
  assert.ok(cut.leftPoints[1].y < 20, 'the first surface must be the lower surface')
  assert.ok(noseIndex > 0)
  assert.ok(firstHolePoint > 0 && firstHolePoint < noseIndex)
})

test('portable wing library preserves geometry, holes and parametric design', () => {
  const wing = createImportedWing({
    id: 'trainer-wing',
    name: 'Крило тренера',
    span: 800,
    leftPoints: ellipse(60, 20, 55, 18),
    rightPoints: ellipse(45, 18, 40, 12),
    straightSparRods: [{ x: 45, y: 18, diameter: 6, centered: false }],
    design: {
      type: 'parametric-wing',
      rootProfileId: 'naca2412',
      rootChord: 300,
      tipProfileId: 'naca0012',
      tipChord: 150,
      sweep: 40,
      twist: -2
    }
  })

  const restored = parseWingLibraryBackup(JSON.stringify(createWingLibraryBackup([wing])))

  assert.equal(restored.length, 1)
  assert.equal(restored[0].name, 'Крило тренера')
  assert.equal(restored[0].leftPoints.length, 80)
  assert.equal(restored[0].straightSparRods[0].diameter, 6)
  assert.equal(restored[0].design.rootChord, 300)
  assert.equal(restored[0].design.twist, -2)
})

test('library import updates matching ids and keeps local-only wings', () => {
  const first = createImportedWing({
    id: 'same', name: 'Стара назва', span: 400,
    leftPoints: ellipse(20, 20, 15, 8), rightPoints: ellipse(20, 20, 10, 5)
  })
  const local = createImportedWing({
    id: 'local', name: 'Місцеве', span: 300,
    leftPoints: ellipse(20, 20, 15, 8), rightPoints: ellipse(20, 20, 10, 5)
  })
  const update = createImportedWing({
    id: 'same', name: 'Оновлена назва', span: 450,
    leftPoints: ellipse(20, 20, 15, 8), rightPoints: ellipse(20, 20, 10, 5)
  })

  const merged = mergeWingLibraries([first, local], [update])

  assert.equal(merged.length, 2)
  assert.equal(merged.find(wing => wing.id === 'same').name, 'Оновлена назва')
  assert.equal(merged.find(wing => wing.id === 'local').name, 'Місцеве')
})

test('library import rejects unrelated json', () => {
  assert.throws(() => parseWingLibraryBackup('{"version":1,"wings":[]}'), /не підтримуваний/)
})
