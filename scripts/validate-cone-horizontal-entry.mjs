import { readFileSync } from 'node:fs'
import { parseNcBlockSetup, parseNcTrajectories } from '../src/nc-dxf.js'
import { validateVirtualProgram } from '../src/virtual-fluidnc.js'

const [sourcePath, expectedLargeText = '200'] = process.argv.slice(2)
if (!sourcePath) throw new Error('Вкажіть NC-файл')
const expectedLarge = Number(expectedLargeText)
if (!(expectedLarge > 0)) throw new Error('Очікуваний великий профіль має бути більшим за нуль')
const source = readFileSync(sourcePath, 'utf8')
const setup = parseNcBlockSetup(source)
const parsed = parseNcTrajectories(source)
if (!setup) throw new Error('У NC немає установки блока')

const interpolate = (left, right, ratio) => ({
  x: left.x + (right.x - left.x) * ratio,
  y: left.y + (right.y - left.y) * ratio
})
const leftFaces = parsed.leftPoints.map((point, index) => interpolate(
  point,
  parsed.rightPoints[index],
  setup.leftGap / setup.wireSpan
))
const rightFaces = parsed.leftPoints.map((point, index) => interpolate(
  point,
  parsed.rightPoints[index],
  (setup.leftGap + setup.blockWidth) / setup.wireSpan
))
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y)
const bounds = points => ({
  width: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)),
  height: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y))
})

let identicalPrefixEnd = 0
for (let index = 0; index < leftFaces.length; index++) {
  if (distance(leftFaces[index], rightFaces[index]) > 0.002) break
  identicalPrefixEnd = index
}
const identicalPrefix = leftFaces.slice(0, identicalPrefixEnd + 1)
let holeClosure = null
for (let start = 1; start < identicalPrefix.length - 3; start++) {
  for (let end = start + 3; end < identicalPrefix.length; end++) {
    if (distance(identicalPrefix[start], identicalPrefix[end]) > 0.002) continue
    if (!holeClosure || end - start > holeClosure.end - holeClosure.start) holeClosure = { start, end }
  }
}
if (!holeClosure) throw new Error('Не знайдено горизонтальний замкнений цикл отвору')
const holeStart = holeClosure.start
const holeEnd = holeClosure.end
const holePoints = identicalPrefix.slice(holeStart, holeEnd + 1)
const holeBounds = bounds(holePoints)
const outerCandidates = []
for (let start = holeEnd + 1; start < leftFaces.length - 3; start++) {
  for (let end = start + 3; end < leftFaces.length; end++) {
    if (distance(leftFaces[start], leftFaces[end]) > 0.002
      || distance(rightFaces[start], rightFaces[end]) > 0.002) continue
    const large = bounds(leftFaces.slice(start, end + 1))
    const small = bounds(rightFaces.slice(start, end + 1))
    if (large.width > 100 && large.height > 100 && small.width > 20 && small.height > 20) {
      outerCandidates.push({ start, end, large, small })
    }
  }
}
const outerLoop = outerCandidates.sort((first, second) => {
  const firstError = Math.abs(first.large.width - expectedLarge) + Math.abs(first.large.height - expectedLarge)
    + Math.abs(first.small.width - 61.354) + Math.abs(first.small.height - 61.354)
  const secondError = Math.abs(second.large.width - expectedLarge) + Math.abs(second.large.height - expectedLarge)
    + Math.abs(second.small.width - 61.354) + Math.abs(second.small.height - 61.354)
  if (Math.abs(firstError - secondError) > 0.001) return firstError - secondError
  return Math.abs((first.end - first.start) - 200) - Math.abs((second.end - second.start) - 200)
})[0]
if (!outerLoop) throw new Error('Не знайдено замкнені зовнішні профілі')
const outerLeftBounds = outerLoop.large
const outerRightBounds = outerLoop.small
const transitionLeft = leftFaces.slice(holeEnd, outerLoop.start + 1)
const transitionRight = rightFaces.slice(holeEnd, outerLoop.start + 1)
const smallLowestOffset = transitionRight.reduce((selected, point, index, points) => (
  point.y < points[selected].y ? index : selected
), 0)
const tiltReadyLeft = transitionLeft[smallLowestOffset]
const tiltReadyRight = transitionRight[smallLowestOffset]
const holeTop = transitionLeft[0]
const outerLeftStart = transitionLeft.at(-1)
const outerRightStart = transitionRight.at(-1)
const transitionStepDistances = transitionLeft.slice(1).map((point, index) => ({
  large: distance(transitionLeft[index], point),
  small: distance(transitionRight[index], transitionRight[index + 1])
}))
const exitLeft = leftFaces.slice(outerLoop.end)
const exitRight = rightFaces.slice(outerLoop.end)
const exitStepDistances = exitLeft.slice(1).map((point, index) => ({
  large: distance(exitLeft[index], point),
  small: distance(exitRight[index], exitRight[index + 1])
}))
const monotonicExit = (points) => points.slice(1).every((point, index) => point.y >= points[index].y - 0.002)
const finalLeft = leftFaces.at(-1)
const finalRight = rightFaces.at(-1)
const virtual = validateVirtualProgram(source, {
  zeroConfirmed: true,
  coldRun: true,
  allowNegativeWorkCoordinates: true
})

const report = {
  setup,
  movements: parsed.leftPoints.length,
  horizontalHolePhase: {
    lastIndex: identicalPrefixEnd,
    holeStart,
    holeEnd,
    maximumFaceMismatchMm: Math.max(...identicalPrefix.map((point, index) => distance(point, rightFaces[index]))),
    holeBounds
  },
  angleRebuild: {
    largeDeltaY: tiltReadyLeft.y - holeTop.y,
    smallDeltaY: tiltReadyRight.y - holeTop.y,
    finalSharedRiseLarge: outerLeftStart.y - tiltReadyLeft.y,
    finalSharedRiseSmall: outerRightStart.y - tiltReadyRight.y,
    minimumLargeStep: Math.min(...transitionStepDistances.map(step => step.large)),
    minimumSmallStep: Math.min(...transitionStepDistances.map(step => step.small)),
    maximumCorridorOffset: Math.max(
      ...transitionLeft.map(point => Math.abs(point.x)),
      ...transitionRight.map(point => Math.abs(point.x))
    )
  },
  outerBounds: { start: outerLoop.start, end: outerLoop.end, large: outerLeftBounds, small: outerRightBounds },
  directExit: {
    maximumCorridorOffset: Math.max(
      ...exitLeft.map(point => Math.abs(point.x)),
      ...exitRight.map(point => Math.abs(point.x))
    ),
    minimumLargeStep: Math.min(...exitStepDistances.map(step => step.large)),
    minimumSmallStep: Math.min(...exitStepDistances.map(step => step.small)),
    monotonicLarge: monotonicExit(exitLeft),
    monotonicSmall: monotonicExit(exitRight)
  },
  final: { large: finalLeft, small: finalRight },
  virtual
}

const checks = [
  ['horizontal entry and hole', identicalPrefixEnd === holeEnd],
  ['hole 50.4 x 50.4', Math.abs(holeBounds.width - 50.4) < 0.01 && Math.abs(holeBounds.height - 50.4) < 0.01],
  ['large rises while small descends', tiltReadyLeft.y - holeTop.y > 40 && tiltReadyRight.y - holeTop.y <= -19 && tiltReadyRight.y - holeTop.y >= -25],
  ['both ends keep moving during angle rebuild', Math.min(...transitionStepDistances.map(step => step.large)) > 0.1 && Math.min(...transitionStepDistances.map(step => step.small)) > 0.1],
  ['angle rebuild stays in original corridor', Math.max(...transitionLeft.map(point => Math.abs(point.x)), ...transitionRight.map(point => Math.abs(point.x))) < 0.002],
  ['both ends rise 25 mm to outer control points', Math.abs(outerLeftStart.y - tiltReadyLeft.y - 25) < 0.01 && Math.abs(outerRightStart.y - tiltReadyRight.y - 25) < 0.01],
  [`large outer ${expectedLarge} x ${expectedLarge}`, Math.abs(outerLeftBounds.width - expectedLarge) < 0.01 && Math.abs(outerLeftBounds.height - expectedLarge) < 0.01],
  ['small outer 61.354 x 61.354', Math.abs(outerRightBounds.width - 61.354) < 0.02 && Math.abs(outerRightBounds.height - 61.354) < 0.02],
  ['direct exit stays in corridor and never returns to hole', Math.max(...exitLeft.map(point => Math.abs(point.x)), ...exitRight.map(point => Math.abs(point.x))) < 0.002 && monotonicExit(exitLeft) && monotonicExit(exitRight)],
  ['both ends keep moving during direct exit', Math.min(...exitStepDistances.map(step => step.large)) > 0.1 && Math.min(...exitStepDistances.map(step => step.small)) > 0.1],
  ['returns to work zero', distance(finalLeft, { x: 0, y: 0 }) < 0.002 && distance(finalRight, { x: 0, y: 0 }) < 0.002],
  ['virtual validation', virtual.valid]
]
report.checks = checks
console.log(JSON.stringify(report, null, 2))
if (checks.some(([, valid]) => !valid)) process.exitCode = 1
