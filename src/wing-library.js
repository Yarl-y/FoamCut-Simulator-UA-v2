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
          diameter: Math.max(0.1, finite(rod?.diameter, `Лонжерон ${rodIndex + 1}, діаметр`))
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
