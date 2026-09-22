import { readFileSync, writeFileSync } from 'node:fs'

const [sourcePath, targetPath, blockWidthText, wireSpanText, leftGapText] = process.argv.slice(2)
if (!sourcePath || !targetPath || !blockWidthText || !wireSpanText) {
  throw new Error('Вкажіть початковий NC, новий NC, ширину блока, довжину струни та необов’язково лівий проміжок')
}

const blockWidth = Number(blockWidthText)
const wireSpan = Number(wireSpanText)
const leftGap = leftGapText === undefined ? (wireSpan - blockWidth) / 2 : Number(leftGapText)
const rightGap = wireSpan - blockWidth - leftGap
if (![blockWidth, wireSpan, leftGap, rightGap].every(Number.isFinite)
  || blockWidth <= 0 || wireSpan < blockWidth || leftGap < 0 || rightGap < 0) {
  throw new Error('Некоректні розміри установки блока і струни')
}

const source = readFileSync(sourcePath, 'utf8')
if (!/\(ZHART_ROUTE:CENTER_TOP_HOME\)/i.test(source)) {
  throw new Error('Компенсація дозволена лише для перевіреного маршруту CENTER_TOP_HOME')
}

const number = String.raw`(-?\d+(?:\.\d+)?)`
const motionPattern = new RegExp(`^(G[01]\\s+)X${number}\\s+Y${number}\\s+A${number}\\s+Z${number}(.*)$`, 'i')
const leftFactor = leftGap / blockWidth
const rightFactor = rightGap / blockWidth
const format = value => (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)
let movementCount = 0

const lines = source.split(/\r?\n/).map(line => {
  const match = line.trim().match(motionPattern)
  if (!match) return line
  const [, command, xText, yText, aText, zText, suffix] = match
  const x = Number(xText); const y = Number(yText)
  const a = Number(aText); const z = Number(zText)
  const leftX = x - (a - x) * leftFactor
  const leftY = y - (z - y) * leftFactor
  const rightA = a + (a - x) * rightFactor
  const rightZ = z + (z - y) * rightFactor
  movementCount++
  return `${command}X${format(leftX)} Y${format(leftY)} A${format(rightA)} Z${format(rightZ)}${suffix}`
})

if (movementCount < 2) throw new Error('У NC не знайдено повної траєкторії X/Y/A/Z')

const setupLine = `(Block setup: wire ${format(wireSpan)} mm, left gap ${format(leftGap)} mm, block ${format(blockWidth)} mm, right gap ${format(rightGap)} mm)`
const sourceLine = `(Wire-span compensation: preserved 200 mm cone faces; projected carriage coordinates to ${format(wireSpan)} mm)`
const insertAt = Math.max(1, lines.findIndex(line => /\(ZHART_ROUTE:CENTER_TOP_HOME\)/i.test(line)))
lines.splice(insertAt, 0, setupLine, sourceLine)

writeFileSync(targetPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf8')
console.log(JSON.stringify({ sourcePath, targetPath, blockWidth, wireSpan, leftGap, rightGap, movementCount }, null, 2))
