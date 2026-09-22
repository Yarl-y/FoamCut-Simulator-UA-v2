import { readFileSync, writeFileSync } from 'node:fs'
import { parseNcTrajectories, recoverNcProfiles } from '../src/nc-dxf.js'

const [sourcePath, targetPath] = process.argv.slice(2)
if (!sourcePath || !targetPath) {
  throw new Error('Вкажіть початковий і новий NC-файли')
}

const source = readFileSync(sourcePath, 'utf8')
const parsed = parseNcTrajectories(source)
const recovered = recoverNcProfiles(source, parsed.leftPoints, parsed.rightPoints)
const centerX = points => {
  const values = points.map(point => point.x)
  return (Math.min(...values) + Math.max(...values)) / 2
}
const home = {
  X: centerX(recovered.leftPoints),
  Y: Math.max(...parsed.leftPoints.map(point => point.y)),
  A: centerX(recovered.rightPoints),
  Z: Math.max(...parsed.rightPoints.map(point => point.y))
}
const motionPattern = /^G1\s+X(-?\d+(?:\.\d+)?)\s+Y(-?\d+(?:\.\d+)?)\s+A(-?\d+(?:\.\d+)?)\s+Z(-?\d+(?:\.\d+)?)/i
const moves = source.split(/\r?\n/).flatMap(line => {
  const match = line.trim().match(motionPattern)
  return match ? [{ X: Number(match[1]), Y: Number(match[2]), A: Number(match[3]), Z: Number(match[4]) }] : []
})
const same = (first, second) => ['X', 'Y', 'A', 'Z'].every(axis => Math.abs(first[axis] - second[axis]) < 0.0005)
const topCandidates = moves
  .map((move, index) => ({ move, index }))
  .filter(({ move }) => Math.abs(move.Y - home.Y) < 0.0005 && Math.abs(move.Z - home.Z) < 0.0005)
if (topCandidates.length < 2) throw new Error('Не знайдено старий верхній підхід і повернення')
const oldTopEntry = topCandidates[1].move
const firstTopEntry = moves.findIndex(move => same(move, oldTopEntry))
const lastTopEntry = moves.findLastIndex(move => same(move, oldTopEntry))
if (firstTopEntry < 0 || lastTopEntry <= firstTopEntry + 1) {
  throw new Error('Не вдалося відокремити робочу траєкторію від старого підходу')
}
const format = value => (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)
const movement = move => `G1 X${format(move.X - home.X)} Y${format(move.Y - home.Y)} A${format(move.A - home.A)} Z${format(move.Z - home.Z)}`
const feed = source.match(/^F\s*(\d+(?:\.\d+)?)/mi)?.[1] || '300'
const cuttingMoves = moves.slice(firstTopEntry + 1, lastTopEntry + 1)
const output = [
  '%',
  '(Zhart CAD/CAM Studio UA - serial cone from top-centre work zero)',
  '(ZHART_ROUTE:CENTER_TOP_HOME)',
  '(IMPORTANT: Ref Home first; then set WORK X/Y/A/Z zero above the centre of the block)',
  `(Source: ${sourcePath.split(/[\\/]/).at(-1)})`,
  `(Removed old lower-corner service moves; preserved ${cuttingMoves.length} cutting/approach moves)`,
  'G21',
  'G90',
  'G94',
  `F${Number(feed).toFixed(3)}`,
  'G1 X0.000 Y0.000 A0.000 Z0.000',
  ...cuttingMoves.map(movement),
  'G1 X0.000 Y0.000 A0.000 Z0.000',
  'M30',
  '%',
  ''
].join('\n')

writeFileSync(targetPath, output, 'utf8')
console.log(JSON.stringify({ sourcePath, targetPath, home, moves: cuttingMoves.length + 2 }, null, 2))
