import { readFileSync, writeFileSync } from 'node:fs'
import { parseNcTrajectories } from '../src/nc-dxf.js'
import { validateVirtualProgram } from '../src/virtual-fluidnc.js'

const [sourcePath, targetPath] = process.argv.slice(2)
if (!sourcePath || !targetPath) throw new Error('Вкажіть початковий і новий NC-файли')

const source = readFileSync(sourcePath, 'utf8')
const lines = source.split(/\r?\n/)
const movementPattern = /^\s*G1\s+X(-?\d+(?:\.\d+)?)\s+Y(-?\d+(?:\.\d+)?)\s+A(-?\d+(?:\.\d+)?)\s+Z(-?\d+(?:\.\d+)?)/i
const movements = lines
  .map((line, lineIndex) => {
    const match = line.match(movementPattern)
    return match ? {
      lineIndex,
      x: Number(match[1]), y: Number(match[2]),
      a: Number(match[3]), z: Number(match[4])
    } : null
  })
  .filter(Boolean)

if (movements.length < 10) throw new Error('У NC недостатньо рухів')
const home = movements.at(-1)
if (Math.hypot(home.x, home.y, home.a, home.z) > 0.002) {
  throw new Error('Початковий NC не завершується у X0 Y0 A0 Z0')
}

const horizontalTailEnd = movements.length - 2
const tailHeight = movements[horizontalTailEnd].y
let horizontalTailStart = horizontalTailEnd
while (horizontalTailStart > 0) {
  const point = movements[horizontalTailStart - 1]
  if (Math.abs(point.y - tailHeight) > 0.002
    || Math.abs(point.z - tailHeight) > 0.002
    || Math.abs(point.x - point.a) > 0.002) break
  horizontalTailStart -= 1
}
const contourEnd = movements[horizontalTailStart - 1]
if (!contourEnd || contourEnd.x < 1 || contourEnd.y < 1
  || Math.abs(contourEnd.x - contourEnd.a) > 0.002
  || Math.abs(contourEnd.y - contourEnd.z) > 0.002) {
  throw new Error('Не вдалося надійно відокремити перевірений контур від старого виходу')
}

const format = value => (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)
const appendSegmented = (result, from, to, maximumStep = 10) => {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.a - from.a, to.z - from.z)
  const steps = Math.max(1, Math.ceil(length / maximumStep))
  for (let step = 1; step <= steps; step++) {
    const ratio = step / steps
    const point = Object.fromEntries(['x', 'y', 'a', 'z'].map(key => [
      key, from[key] + (to[key] - from[key]) * ratio
    ]))
    result.push(`G1 X${format(point.x)} Y${format(point.y)} A${format(point.a)} Z${format(point.z)}`)
  }
}

const output = lines.slice(0, contourEnd.lineIndex + 1)
const markerIndex = output.findIndex(line => /^\s*G21\b/i.test(line))
output.splice(markerIndex < 0 ? 1 : markerIndex, 0,
  '(ZHART_WING_EXIT:FACING_DOWN_THEN_HOME)',
  '(Verified wing contour unchanged; new exit faces down, then returns along the bottom)')

const bottomAtEnd = { x: contourEnd.x, y: 0, a: contourEnd.a, z: 0 }
const workHome = { x: 0, y: 0, a: 0, z: 0 }
appendSegmented(output, contourEnd, bottomAtEnd)
appendSegmented(output, bottomAtEnd, workHome)
output.push('M30', '%', '')
const target = output.join('\n')

const originalParsed = parseNcTrajectories(source)
const targetParsed = parseNcTrajectories(target)
const preservedCount = movements.indexOf(contourEnd) + 1
for (let index = 0; index < preservedCount; index++) {
  const originalLeft = originalParsed.leftPoints[index]
  const targetLeft = targetParsed.leftPoints[index]
  const originalRight = originalParsed.rightPoints[index]
  const targetRight = targetParsed.rightPoints[index]
  const mismatch = Math.max(
    Math.hypot(originalLeft.x - targetLeft.x, originalLeft.y - targetLeft.y),
    Math.hypot(originalRight.x - targetRight.x, originalRight.y - targetRight.y)
  )
  if (mismatch > 0.0001) throw new Error(`Перевірений контур змінено в точці ${index}`)
}

const validation = validateVirtualProgram(target, { zeroConfirmed: true, coldRun: true })
if (!validation.valid) throw new Error(validation.errors.join('; '))
writeFileSync(targetPath, target, 'utf8')
console.log(JSON.stringify({
  sourcePath,
  targetPath,
  preservedMovements: preservedCount,
  contourEnd,
  removedOldExitMovements: movements.length - preservedCount,
  newMovements: targetParsed.leftPoints.length,
  validation
}, null, 2))
