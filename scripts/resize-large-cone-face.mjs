import { readFileSync, writeFileSync } from 'node:fs'
import { parseNcBlockSetup, parseNcTrajectories } from '../src/nc-dxf.js'

const [sourcePath, targetPath, targetWidthText = '200', targetHeightText = '200'] = process.argv.slice(2)
if (!sourcePath || !targetPath) throw new Error('Вкажіть початковий і новий NC-файли')
const targetWidth = Number(targetWidthText)
const targetHeight = Number(targetHeightText)
if (!(targetWidth > 0) || !(targetHeight > 0)) throw new Error('Нові габарити мають бути більшими за нуль')

const source = readFileSync(sourcePath, 'utf8')
const setup = parseNcBlockSetup(source)
if (!setup) throw new Error('У NC немає коректної установки блока')
if (!/\(ZHART_ROUTE:CENTER_TOP_HOME\)/i.test(source)) throw new Error('Очікується маршрут CENTER_TOP_HOME')

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
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const minX = Math.min(...xs); const maxX = Math.max(...xs)
  const minY = Math.min(...ys); const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

const closedIntervals = []
for (let start = 1; start < leftFaces.length - 3; start++) {
  for (let end = start + 3; end < leftFaces.length - 1; end++) {
    if (distance(leftFaces[start], leftFaces[end]) > 0.002
      || distance(rightFaces[start], rightFaces[end]) > 0.002) continue
    const leftBounds = bounds(leftFaces.slice(start, end + 1))
    const rightBounds = bounds(rightFaces.slice(start, end + 1))
    closedIntervals.push({ start, end, count: end - start + 1, leftBounds, rightBounds })
  }
}

const shapeIntervals = closedIntervals.filter(item => {
  const leftRatio = item.leftBounds.width / item.leftBounds.height
  const rightRatio = item.rightBounds.width / item.rightBounds.height
  return leftRatio >= 0.8 && leftRatio <= 1.2 && rightRatio >= 0.8 && rightRatio <= 1.2
})
const maximumLeftWidth = Math.max(...shapeIntervals.map(item => item.leftBounds.width))
const outer = shapeIntervals
  .filter(item => item.leftBounds.width >= maximumLeftWidth * 0.99
    && item.rightBounds.width > 1 && item.rightBounds.height > 1)
  .sort((first, second) => first.count - second.count)[0]
if (!outer) throw new Error('Не вдалося відокремити зовнішній контур конуса')

const hole = closedIntervals
  .filter(item => item.end <= outer.start
    && item.leftBounds.width > 1
    && item.leftBounds.width < outer.leftBounds.width * 0.5
    && Math.max(...leftFaces.slice(item.start, item.end + 1)
      .map((point, offset) => distance(point, rightFaces[item.start + offset]))) < 0.01)
  .sort((first, second) => second.count - first.count)[0]
if (!hole) throw new Error(`Не вдалося відокремити наскрізний отвір; зовнішній контур ${outer.start}…${outer.end}, ${outer.leftBounds.width.toFixed(3)} × ${outer.leftBounds.height.toFixed(3)} мм`)

const outerCenter = {
  x: (outer.leftBounds.minX + outer.leftBounds.maxX) / 2,
  y: (outer.leftBounds.minY + outer.leftBounds.maxY) / 2
}
const scaleX = targetWidth / outer.leftBounds.width
const scaleY = targetHeight / outer.leftBounds.height
const resizeOuterPoint = point => ({
  x: outerCenter.x + (point.x - outerCenter.x) * scaleX,
  y: outerCenter.y + (point.y - outerCenter.y) * scaleY
})
const resizedLeft = leftFaces.map(point => ({ ...point }))
for (let index = outer.start; index <= outer.end; index++) resizedLeft[index] = resizeOuterPoint(leftFaces[index])

const newJunction = resizedLeft[outer.start]
const interpolate = (first, second, ratio) => ({
  x: first.x + (second.x - first.x) * ratio,
  y: first.y + (second.y - first.y) * ratio
})
// Preserve the proven horizontal home-to-hole route byte-for-byte at the foam
// faces. Rebuild only the transition after the unchanged hole and the exit.
const transitionRight = rightFaces.slice(hole.end, outer.start + 1)
const tiltReadyOffset = transitionRight.reduce((selected, point, index, points) => (
  point.y < points[selected].y ? index : selected
), 0)
const tiltReadyIndex = hole.end + tiltReadyOffset
const tiltReadyLeft = { x: newJunction.x, y: newJunction.y - 25 }
for (let index = hole.end + 1; index < outer.start; index++) {
  if (index <= tiltReadyIndex) {
    const ratio = (index - hole.end) / Math.max(1, tiltReadyIndex - hole.end)
    resizedLeft[index] = interpolate(leftFaces[hole.end], tiltReadyLeft, ratio)
  } else {
    const ratio = (index - tiltReadyIndex) / Math.max(1, outer.start - tiltReadyIndex)
    resizedLeft[index] = interpolate(tiltReadyLeft, newJunction, ratio)
  }
}
for (let index = outer.end + 1; index < resizedLeft.length - 1; index++) {
  const ratio = (index - outer.end) / (resizedLeft.length - 1 - outer.end)
  resizedLeft[index] = interpolate(newJunction, { x: 0, y: 0 }, ratio)
}

const projectedLeft = []
const projectedRight = []
const leftFactor = setup.leftGap / setup.blockWidth
const rightFactor = setup.rightGap / setup.blockWidth
for (let index = 0; index < resizedLeft.length; index++) {
  const left = resizedLeft[index]
  const right = rightFaces[index]
  projectedLeft.push({
    x: left.x - (right.x - left.x) * leftFactor,
    y: left.y - (right.y - left.y) * leftFactor
  })
  projectedRight.push({
    x: right.x + (right.x - left.x) * rightFactor,
    y: right.y + (right.y - left.y) * rightFactor
  })
}

const format = value => (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)
const feed = source.match(/^F\s*(\d+(?:\.\d+)?)/mi)?.[1] || '300'
const output = [
  '%',
  `(Zhart CAD/CAM Studio UA - serial cone, large face resized to ${format(targetWidth)} x ${format(targetHeight)} mm)`,
  `(Block setup: wire ${format(setup.wireSpan)} mm, left gap ${format(setup.leftGap)} mm, block ${format(setup.blockWidth)} mm, right gap ${format(setup.rightGap)} mm)`,
  '(ZHART_ROUTE:CENTER_TOP_HOME)',
  `(Large outer face only: ${format(targetWidth)} x ${format(targetHeight)} mm; small outer face and through-hole unchanged)`,
  `(Source: ${sourcePath.split(/[\\/]/).at(-1)})`,
  'G21', 'G90', 'G94', `F${Number(feed).toFixed(3)}`,
  ...projectedLeft.map((left, index) => {
    const right = projectedRight[index]
    return `G1 X${format(left.x)} Y${format(left.y)} A${format(right.x)} Z${format(right.y)}`
  }),
  'M30', '%', ''
].join('\n')
writeFileSync(targetPath, output, 'utf8')

console.log(JSON.stringify({
  sourcePath, targetPath, setup,
  outer: { start: outer.start, end: outer.end, before: outer.leftBounds, targetWidth, targetHeight, scaleX, scaleY },
  hole: { start: hole.start, end: hole.end, bounds: hole.leftBounds },
  movements: projectedLeft.length
}, null, 2))
