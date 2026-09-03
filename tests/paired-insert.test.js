import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createStraightSparHoleContour, insertPairedSparHoles } from '../src/profile-library.js'
import { preparePairedProfiles } from '../src/profile-entry.js'
import { recoverNcProfiles, removeInteriorCutLoops, detectCircularHoles } from '../src/nc-dxf.js'
import { validateVirtualProgram } from '../src/virtual-fluidnc.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
const left = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 80 }, { x: 0, y: 80 }]
const right = [{ x: 80, y: 10 }, { x: 280, y: 10 }, { x: 280, y: 60 }, { x: 80, y: 60 }]
const rods = [{ x: 150, y: 30, diameter: 13 }, { x: 230, y: 35, diameter: 21 }]
const holes = rods.map(rod => ({ left: createStraightSparHoleContour(rod), right: createStraightSparHoleContour(rod) }))
const pair = insertPairedSparHoles(left, right, holes)

test('every point on each bore has identical coordinates and diameter on both faces', () => {
  assert.equal(pair.leftPoints.length, pair.rightPoints.length)
  for (const hole of holes) for (const point of hole.left) {
    const index = pair.leftPoints.findIndex(p => Math.hypot(p.x - point.x, p.y - point.y) < 1e-8)
    assert.ok(index >= 0)
    near(pair.rightPoints[index].x, point.x)
    near(pair.rightPoints[index].y, point.y)
  }
})

test('shared transforms and entry rotation keep straight bores straight', () => {
  for (const orientation of ['none', 'rotate180', 'mirrorX', 'mirrorY']) {
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const result = preparePairedProfiles(pair.leftPoints, pair.rightPoints, orientation, side, true)
      const equalCount = result.leftPoints.filter((p, i) => Math.hypot(p.x - result.rightPoints[i].x, p.y - result.rightPoints[i].y) < 1e-8).length
      assert.ok(equalCount >= 64, `${orientation}/${side}: ${equalCount}`)
    }
  }
})

test('invalid pairs fail closed', () => {
  assert.throws(() => insertPairedSparHoles(left, right.slice(1), holes))
  assert.throws(() => preparePairedProfiles(left, [], 'none', 'left', true))
})

// Exercise the actual UI path/envelope functions without a browser or machine.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const field = value => ({ value })
const context = vm.createContext({
  profileLengthOffsetInput: field(0), profileHeightOffsetInput: field(0),
  foamLengthInput: field(600), foamHeightInput: field(600), foamWidthInput: field(400),
  leadDistanceInput: field(0), cutPassModeInput: field('single'),
  wireSpanInput: field(500), blockSafeGapInput: field(50),
  blockPlacementModeInput: field('auto'), blockLeftGapInput: field(50),
  machineLimitInputs: Object.fromEntries(['x', 'y', 'a', 'z'].map(axis => [axis, field(600)]))
})
vm.runInContext(source.slice(source.indexOf('const interpolateMove ='), source.indexOf('const updateGeneratedNcPreview ='))
  + '\n globalThis.api = { buildCuttingPath, projectProfilesToCarriages, calculateBlockSetup, validateMachineEnvelope, createMach3Nc };', context)

test('paired approach stages stay aligned even if one boundary move is zero length', () => {
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const l = context.api.buildCuttingPath(left, 'single', side, true)
    const r = context.api.buildCuttingPath(right, 'single', side, true)
    assert.equal(l.length, r.length)
    assert.deepEqual(JSON.parse(JSON.stringify(l.at(-1))), { x: 0, y: 0 })
    assert.deepEqual(JSON.parse(JSON.stringify(r.at(-1))), { x: 0, y: 0 })
  }
})

test('compensation preserves identical bore points; envelope rejects 601.630 mm', () => {
  const setup = context.api.calculateBlockSetup()
  assert.equal(setup.wireSpan, 500)
  const projected = context.api.projectProfilesToCarriages(pair.leftPoints, pair.rightPoints, setup)
  pair.leftPoints.forEach((point, i) => {
    if (Math.hypot(point.x - pair.rightPoints[i].x, point.y - pair.rightPoints[i].y) < 1e-8) {
      near(projected.leftPoints[i].x, point.x)
      near(projected.rightPoints[i].x, point.x)
      near(projected.leftPoints[i].y, point.y)
      near(projected.rightPoints[i].y, point.y)
    }
  })
  const result = context.api.validateMachineEnvelope({ leftPoints: [{ x: 0, y: 0 }, { x: 601.630, y: 10 }], rightPoints: right, blockSetup: setup })
  assert.equal(result.valid, false)
  assert.equal(result.ranges.x.maximum, 601.630)
})

test('original straight-wing NC: 150% insert, 400 mm span, 500 mm towers', { skip: !process.env.FOAMCUT_TEST_NC }, () => {
  const text = readFileSync(process.env.FOAMCUT_TEST_NC, 'utf8')
  // This fixture is absolute metric G0/G1 with all four coordinates per move.
  assert.match(text, /G90/)
  assert.doesNotMatch(text, /G91/)
  const moves = text.split(/\r?\n/).filter(line => /^G0?[01](?=[\sXYAZ])/i.test(line))
    .map(line => Object.fromEntries([...line.matchAll(/([XYAZ])\s*(-?\d+(?:\.\d+)?)/gi)].map(m => [m[1].toUpperCase(), Number(m[2])])))
  assert.ok(moves.length > 100)
  const recovered = recoverNcProfiles(text, moves.map(p => ({ x: p.X, y: p.Y })), moves.map(p => ({ x: p.A, y: p.Z })))
  const exterior = removeInteriorCutLoops(recovered.leftPoints)
  const detected = detectCircularHoles(recovered.leftPoints)
  assert.equal(detected.length, 2)
  const root = exterior.map(p => ({ x: detected[0].x + (p.x - detected[0].x) * 1.5, y: detected[0].y + (p.y - detected[0].y) * 1.5 }))
  const rebuilt = insertPairedSparHoles(root, exterior, detected.map(rod => ({ left: createStraightSparHoleContour(rod), right: createStraightSparHoleContour(rod) })))
  const ordered = preparePairedProfiles(rebuilt.leftPoints, rebuilt.rightPoints, 'none', 'left', true)
  const setup = context.api.calculateBlockSetup()
  const projected = context.api.projectProfilesToCarriages(ordered.leftPoints, ordered.rightPoints, setup)
  context.profileLengthOffsetInput.value = Math.ceil(10 - Math.min(...projected.leftPoints.map(p => p.x), ...projected.rightPoints.map(p => p.x)))
  context.profileHeightOffsetInput.value = Math.ceil(10 - Math.min(...projected.leftPoints.map(p => p.y), ...projected.rightPoints.map(p => p.y)))
  context.leadDistanceInput.value = 10
  const path = context.api.projectProfilesToCarriages(
    context.api.buildCuttingPath(ordered.leftPoints, 'single', 'left', true),
    context.api.buildCuttingPath(ordered.rightPoints, 'single', 'left', true), setup)
  const validation = context.api.validateMachineEnvelope({ ...path, blockSetup: setup })
  console.log(JSON.stringify({ setup, offsetX: context.profileLengthOffsetInput.value, offsetY: context.profileHeightOffsetInput.value, ranges: validation.ranges }))
  assert.equal(validation.valid, true, validation.errors.join('; '))
  const nc = context.api.createMach3Nc({ ...path, blockSetup: setup, feedRate: 300,
    sourceLeftPoints: ordered.leftPoints, sourceRightPoints: ordered.rightPoints })
  const report = validateVirtualProgram(nc, { zeroConfirmed: true, coldRun: true })
  assert.equal(report.valid, true, report.errors.join('; '))
  assert.deepEqual(report.finalPositions, { X: 0, Y: 0, A: 0, Z: 0, B: 0 })
})
