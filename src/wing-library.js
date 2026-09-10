import { removeInteriorCutLoops } from './nc-dxf.js'
import {
  createStraightSparHoleContour,
  insertPairedSparHoles,
  sparHoleFitsProfile
} from './profile-library.js'

const STORAGE_KEY = 'foamcut-imported-wing-library-v1'

const finite = (value, label) => {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${label}: некоректне число`)
  return number
}

const points = (value, label) => {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${label}: недостатньо точок`)
  return value.map((point, index) => ({
    x: finite(point?.x, `${label}, X${index + 1}`),
    y: finite(point?.y, `${label}, Y${index + 1}`)
  }))
}

const sanitizeWing = (wing, index = 0) => {
  const leftPoints = points(wing?.leftPoints, 'Профіль X/Y')
  const rightPoints = points(wing?.rightPoints, 'Профіль A/Z')
  if (leftPoints.length !== rightPoints.length) throw new Error('Кількість точок X/Y та A/Z не збігається')
  const span = finite(wing?.span, 'Довжина крила')
  if (span <= 0) throw new Error('Довжина крила має бути більшою за нуль')
  return {
    id: String(wing?.id || `wing-${Date.now()}-${index}`),
    name: String(wing?.name || `Крило ${index + 1}`).trim() || `Крило ${index + 1}`,
    span,
    leftPoints,
    rightPoints,
    sourceFile: String(wing?.sourceFile || ''),
    recoveryMethod: String(wing?.recoveryMethod || 'unknown'),
    importedAt: String(wing?.importedAt || new Date().toISOString()),
    straightSparRods: Array.isArray(wing?.straightSparRods)
      ? wing.straightSparRods.map((rod, rodIndex) => ({
          x: finite(rod?.x, `Лонжерон ${rodIndex + 1}, X`),
          y: finite(rod?.y, `Лонжерон ${rodIndex + 1}, Y`),
          diameter: Math.max(0.1, finite(rod?.diameter, `Лонжерон ${rodIndex + 1}, діаметр`)),
          centered: rod?.centered === true
        }))
      : []
  }
}

export const loadImportedWings = (storage = localStorage) => {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(data) ? data.map(sanitizeWing) : []
  } catch {
    return []
  }
}

export const saveImportedWings = (wings, storage = localStorage) => {
  const clean = wings.map(sanitizeWing)
  storage.setItem(STORAGE_KEY, JSON.stringify(clean))
  return clean
}

export const createImportedWing = data => sanitizeWing({
  ...data,
  id: data.id || `wing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  importedAt: new Date().toISOString()
})

const polygonArea = points => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length]
  return sum + point.x * next.y - next.x * point.y
}, 0) / 2)

const profileCenter = points => {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2
  }
}

export const findSmallerProfileCenter = wingData => {
  const wing = sanitizeWing(wingData)
  const leftPoints = removeInteriorCutLoops(wing.leftPoints)
  const rightPoints = removeInteriorCutLoops(wing.rightPoints)
  const side = polygonArea(leftPoints) <= polygonArea(rightPoints) ? 'left' : 'right'
  const center = profileCenter(side === 'left' ? leftPoints : rightPoints)
  return { ...center, side }
}

export const createImportedWingCutProfiles = wingData => {
  const wing = sanitizeWing(wingData)
  if (!wing.straightSparRods.length) {
    return {
      outerLeft: removeInteriorCutLoops(wing.leftPoints),
      outerRight: removeInteriorCutLoops(wing.rightPoints),
      leftPoints: wing.leftPoints.map(point => ({ ...point })),
      rightPoints: wing.rightPoints.map(point => ({ ...point }))
    }
  }

  const outerLeft = removeInteriorCutLoops(wing.leftPoints)
  const outerRight = removeInteriorCutLoops(wing.rightPoints)
  const holes = wing.straightSparRods.map((rod, index) => {
    const contour = createStraightSparHoleContour(rod)
    if (!sparHoleFitsProfile(outerLeft, contour)) {
      throw new Error(`Отвір ${index + 1} не вміщується у профілі X/Y`)
    }
    if (!sparHoleFitsProfile(outerRight, contour)) {
      throw new Error(`Отвір ${index + 1} не вміщується у профілі A/Z`)
    }
    return {
      left: contour,
      right: contour.map(point => ({ ...point }))
    }
  })
  const firstHole = wing.straightSparRods[0]
  const smallerProfile = polygonArea(outerLeft) <= polygonArea(outerRight) ? outerLeft : outerRight
  const ys = smallerProfile.map(point => point.y)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const topBand = Math.max((maxY - minY) * 0.02, 0.1)
  const topCandidates = smallerProfile
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.y >= maxY - topBand)
  const entryIndex = topCandidates.reduce((best, candidate) => (
    Math.abs(candidate.point.x - firstHole.x) < Math.abs(best.point.x - firstHole.x)
      ? candidate
      : best
  )).index
  const rotatePair = points => [
    ...points.slice(entryIndex),
    ...points.slice(0, entryIndex)
  ].map(point => ({ ...point }))
  const topEntryHoles = holes.map((hole, index) => (
    index === 0 ? { ...hole, baseIndex: 0 } : hole
  ))
  const cutPair = insertPairedSparHoles(
    rotatePair(outerLeft),
    rotatePair(outerRight),
    topEntryHoles
  )
  return {
    outerLeft,
    outerRight,
    leftPoints: cutPair.leftPoints,
    rightPoints: cutPair.rightPoints
  }
}
