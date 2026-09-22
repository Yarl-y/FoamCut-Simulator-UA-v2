import { readFileSync, writeFileSync } from 'node:fs'
import { parseNcBlockSetup, parseNcTrajectories } from '../src/nc-dxf.js'

const [sourcePath, targetPath] = process.argv.slice(2)
if (!sourcePath || !targetPath) throw new Error('Вкажіть початковий і новий NC-файли')
const source = readFileSync(sourcePath, 'utf8')
const setup = parseNcBlockSetup(source)
if (!setup) throw new Error('У NC немає коректної установки блока')

const parsed = parseNcTrajectories(source)
const leftFaces = []
const rightFaces = []
const pointAt = (left, right, ratio) => ({
  x: left.x + (right.x - left.x) * ratio,
  y: left.y + (right.y - left.y) * ratio
})
for (let index = 0; index < parsed.leftPoints.length; index++) {
  const left = parsed.leftPoints[index]
  const right = parsed.rightPoints[index]
  leftFaces.push(pointAt(left, right, setup.leftGap / setup.wireSpan))
  rightFaces.push(pointAt(left, right, (setup.leftGap + setup.blockWidth) / setup.wireSpan))
}

const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y)
const bounds = points => {
  const xs = points.map(point => point.x); const ys = points.map(point => point.y)
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  }
}
const intervals = []
for (let start = 1; start < leftFaces.length - 3; start++) {
  for (let end = start + 3; end < leftFaces.length - 1; end++) {
    if (distance(leftFaces[start], leftFaces[end]) > 0.002
      || distance(rightFaces[start], rightFaces[end]) > 0.002) continue
    intervals.push({
      start, end, count: end - start + 1,
      leftBounds: bounds(leftFaces.slice(start, end + 1)),
      rightBounds: bounds(rightFaces.slice(start, end + 1))
    })
  }
}
const shapeIntervals = intervals.filter(item => {
  const leftRatio = item.leftBounds.width / item.leftBounds.height
  const rightRatio = item.rightBounds.width / item.rightBounds.height
  return leftRatio >= 0.8 && leftRatio <= 1.2 && rightRatio >= 0.8 && rightRatio <= 1.2
})
const maximumWidth = Math.max(...shapeIntervals.map(item => item.leftBounds.width))
const outer = shapeIntervals
  .filter(item => item.leftBounds.width >= maximumWidth * 0.99)
  .sort((first, second) => first.count - second.count)[0]
if (!outer) throw new Error('Не вдалося знайти зовнішні профілі')

const hole = intervals
  .filter(item => item.end <= outer.start
    && item.leftBounds.width > 1
    && item.leftBounds.width < outer.leftBounds.width * 0.5
    && Math.max(...leftFaces.slice(item.start, item.end + 1)
      .map((point, offset) => distance(point, rightFaces[item.start + offset]))) < 0.01)
  .sort((first, second) => second.count - first.count)[0]
if (!hole) throw new Error('Не вдалося знайти спільний наскрізний отвір')

const rotateClosedPair = (left, right, startIndex) => {
  const leftUnique = left.slice(0, -1)
  const rightUnique = right.slice(0, -1)
  const rotatedLeft = [...leftUnique.slice(startIndex), ...leftUnique.slice(0, startIndex)]
  const rotatedRight = [...rightUnique.slice(startIndex), ...rightUnique.slice(0, startIndex)]
  return {
    left: [...rotatedLeft, { ...rotatedLeft[0] }],
    right: [...rotatedRight, { ...rotatedRight[0] }]
  }
}

const holeLeft = leftFaces.slice(hole.start, hole.end + 1)
const holeRight = rightFaces.slice(hole.start, hole.end + 1)
const holeTopIndex = holeLeft.slice(0, -1)
  .reduce((selected, point, index, points) => point.y > points[selected].y ? index : selected, 0)
const holeLoop = rotateClosedPair(holeLeft, holeRight, holeTopIndex)
const outerLeft = leftFaces.slice(outer.start, outer.end + 1)
const outerRight = rightFaces.slice(outer.start, outer.end + 1)
const rotateClosedAtTopCentre = points => {
  const unique = points.slice(0, -1)
  const candidates = []
  for (let index = 0; index < unique.length; index++) {
    const next = (index + 1) % unique.length
    const first = unique[index]; const second = unique[next]
    if (Math.min(first.x, second.x) > 0 || Math.max(first.x, second.x) < 0) continue
    const deltaX = second.x - first.x
    const ratio = Math.abs(deltaX) < 1e-9 ? 0 : -first.x / deltaX
    if (ratio < -1e-6 || ratio > 1 + 1e-6) continue
    candidates.push({
      index,
      next,
      point: { x: 0, y: first.y + (second.y - first.y) * ratio }
    })
  }
  const selected = candidates.sort((first, second) => second.point.y - first.point.y)[0]
  if (!selected) throw new Error('Не вдалося знайти верхню точку профілю на осі коридору')
  const ordered = []
  for (let offset = 0; offset < unique.length; offset++) {
    ordered.push({ ...unique[(selected.next + offset) % unique.length] })
  }
  return [selected.point, ...ordered, { ...selected.point }]
}
const resampleClosed = (points, count) => {
  const cumulative = [0]
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative.at(-1) + distance(points[index - 1], points[index]))
  }
  const total = cumulative.at(-1)
  const sampled = []
  let segment = 1
  for (let index = 0; index < count; index++) {
    const target = total * index / (count - 1)
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment += 1
    const firstDistance = cumulative[segment - 1]
    const segmentLength = cumulative[segment] - firstDistance
    const ratio = segmentLength < 1e-9 ? 0 : (target - firstDistance) / segmentLength
    sampled.push(pointAt(points[segment - 1], points[segment], ratio))
  }
  sampled[0] = { ...points[0] }
  sampled[sampled.length - 1] = { ...points[0] }
  return sampled
}
const outerPointCount = Math.max(outerLeft.length, outerRight.length)
const outerLoop = {
  left: resampleClosed(rotateClosedAtTopCentre(outerLeft), outerPointCount),
  right: resampleClosed(rotateClosedAtTopCentre(outerRight), outerPointCount)
}
if (outerLoop.left.length !== outerLoop.right.length) {
  throw new Error('Зовнішні профілі мають різну кількість синхронних точок')
}

const routeLeft = [{ x: 0, y: 0 }]
const routeRight = [{ x: 0, y: 0 }]
const appendPairedMove = (leftTarget, rightTarget, maximumStep = 10) => {
  const leftStart = routeLeft.at(-1); const rightStart = routeRight.at(-1)
  const steps = Math.max(1, Math.ceil(Math.max(
    distance(leftStart, leftTarget), distance(rightStart, rightTarget)
  ) / maximumStep))
  for (let step = 1; step <= steps; step++) {
    const ratio = step / steps
    routeLeft.push(pointAt(leftStart, leftTarget, ratio))
    routeRight.push(pointAt(rightStart, rightTarget, ratio))
  }
}
const appendLoop = loop => {
  for (let index = 1; index < loop.left.length; index++) {
    routeLeft.push({ ...loop.left[index] })
    routeRight.push({ ...loop.right[index] })
  }
}

const holeTop = holeLoop.left[0]
// Enter and leave the through-hole with a horizontal wire: both faces use
// exactly the same coordinates at every point of this part of the route.
appendPairedMove(holeTop, holeTop)
appendLoop(holeLoop)
const outerLeftStart = outerLoop.left[0]
const outerRightStart = outerLoop.right[0]

// Rebuild the wire angle while both ends remain in motion. Starting at the
// horizontal hole-top point, the large-profile end rises while the small end
// descends roughly 20-25 mm. Then both ends rise by 25 mm to their outer
// control points and immediately continue around the outer profiles.
const sharedRise = 25
const tiltReadyLeft = { x: outerLeftStart.x, y: outerLeftStart.y - sharedRise }
const tiltReadyRight = { x: outerRightStart.x, y: outerRightStart.y - sharedRise }
appendPairedMove(tiltReadyLeft, tiltReadyRight)
appendPairedMove(outerLeftStart, outerRightStart)
appendLoop(outerLoop)

// Leave directly from the completed outer control points. Both ends remain
// inside the original X/A=0 access corridor and become horizontal at home.
appendPairedMove({ x: 0, y: 0 }, { x: 0, y: 0 })

const leftFactor = setup.leftGap / setup.blockWidth
const rightFactor = setup.rightGap / setup.blockWidth
const carriageLeft = []
const carriageRight = []
for (let index = 0; index < routeLeft.length; index++) {
  const left = routeLeft[index]; const right = routeRight[index]
  carriageLeft.push({
    x: left.x - (right.x - left.x) * leftFactor,
    y: left.y - (right.y - left.y) * leftFactor
  })
  carriageRight.push({
    x: right.x + (right.x - left.x) * rightFactor,
    y: right.y + (right.y - left.y) * rightFactor
  })
}

const format = value => (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)
const feed = source.match(/^F\s*(\d+(?:\.\d+)?)/mi)?.[1] || '300'
const output = [
  '%',
  '(Zhart CAD/CAM Studio UA - serial cone with horizontal through-hole entry)',
  `(Block setup: wire ${format(setup.wireSpan)} mm, left gap ${format(setup.leftGap)} mm, block ${format(setup.blockWidth)} mm, right gap ${format(setup.rightGap)} mm)`,
  '(ZHART_ROUTE:CENTER_TOP_HOME)',
  '(Hole entry and cut: horizontal wire, identical movement on both block faces)',
  '(Angle rebuild stays inside the original X/A=0 access corridor)',
  '(Large end rises while small end descends; neither end waits)',
  '(Final outer approach: both ends rise 25 mm to their control points)',
  '(After the outer cut: direct shortest exit to home; no return to the hole)',
  `(Source: ${sourcePath.split(/[\\/]/).at(-1)})`,
  'G21', 'G90', 'G94', `F${Number(feed).toFixed(3)}`,
  ...carriageLeft.map((left, index) => {
    const right = carriageRight[index]
    return `G1 X${format(left.x)} Y${format(left.y)} A${format(right.x)} Z${format(right.y)}`
  }),
  'M30', '%', ''
].join('\n')
writeFileSync(targetPath, output, 'utf8')
console.log(JSON.stringify({
  sourcePath, targetPath, setup, movements: carriageLeft.length,
  hole: { start: hole.start, end: hole.end, top: holeTop, points: holeLoop.left.length },
  outer: {
    start: outer.start,
    end: outer.end,
    points: outerLoop.left.length,
    entry: { left: outerLoop.left[0], right: outerLoop.right[0] },
    tiltReady: { left: tiltReadyLeft, right: tiltReadyRight },
    transitionFromHole: {
      largeDeltaY: tiltReadyLeft.y - holeTop.y,
      smallDeltaY: tiltReadyRight.y - holeTop.y,
      sharedRise
    }
  }
}, null, 2))
