const finiteNumber = (value, label) => {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${label} має некоректне число`)
  return number
}

const readPoints = (points, label) => {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error(`${label}: недостатньо точок`)
  }
  return points.map((point, index) => ({
    x: finiteNumber(point?.x, `${label}, X точки ${index + 1}`),
    y: finiteNumber(point?.y, `${label}, Y точки ${index + 1}`)
  }))
}

const readFeatureList = (features, fields, label) => {
  if (features == null) return []
  if (!Array.isArray(features)) throw new Error(`${label}: некоректний список`)
  return features.map((feature, index) => Object.fromEntries(
    fields.map(field => [field, finiteNumber(feature?.[field], `${label} ${index + 1}, ${field}`)])
  ))
}

const sanitizePart = (part, index) => {
  const kind = part?.kind
  if (!['wing', 'fuselage'].includes(kind)) throw new Error(`Деталь ${index + 1}: невідомий тип`)
  const side = kind === 'wing' ? part.side : null
  if (kind === 'wing' && !['left', 'right'].includes(side)) {
    throw new Error(`Деталь ${index + 1}: невідома сторона крила`)
  }
  const cutLeft = readPoints(part.cutLeft, `Деталь ${index + 1}, X/Y`)
  const cutRight = readPoints(part.cutRight, `Деталь ${index + 1}, A/Z`)
  const span = Math.max(0.001, finiteNumber(part.span, `Деталь ${index + 1}, довжина`))
  if (cutLeft.length !== cutRight.length) {
    throw new Error(`Деталь ${index + 1}: кількість точок X/Y та A/Z не збігається`)
  }

  return {
    id: Number.isInteger(part.id) && part.id > 0 ? part.id : index + 1,
    kind,
    side,
    name: String(part.name || `Деталь ${index + 1}`),
    span,
    outerLeft: readPoints(part.outerLeft, `Деталь ${index + 1}, зовнішній X/Y`),
    outerRight: readPoints(part.outerRight, `Деталь ${index + 1}, зовнішній A/Z`),
    innerLeft: part.innerLeft ? readPoints(part.innerLeft, `Деталь ${index + 1}, внутрішній X/Y`) : null,
    innerRight: part.innerRight ? readPoints(part.innerRight, `Деталь ${index + 1}, внутрішній A/Z`) : null,
    cutLeft,
    cutRight,
    straightSparRods: readFeatureList(
      kind === 'fuselage'
        ? (part.straightSparRods || []).map(rod => ({ ...rod, start: rod.start ?? 0, length: rod.length ?? span }))
        : part.straightSparRods,
      kind === 'fuselage' ? ['x', 'y', 'diameter', 'start', 'length'] : ['x', 'y', 'diameter'],
      `Деталь ${index + 1}, лонжерони`
    ),
    servoChannels: readFeatureList(
      part.servoChannels,
      ['rootX', 'rootY', 'rootDiameter', 'tipX', 'tipY', 'tipDiameter'],
      `Деталь ${index + 1}, канали`
    ),
    offsets: {
      x: finiteNumber(part.offsets?.x ?? 0, `Деталь ${index + 1}, зміщення X`),
      y: finiteNumber(part.offsets?.y ?? 0, `Деталь ${index + 1}, зміщення Y`),
      z: finiteNumber(part.offsets?.z ?? 0, `Деталь ${index + 1}, зміщення Z`)
    },
    visible: part.visible !== false
  }
}

export const createAssemblyFile = parts => ({
  format: 'foamcut-assembly',
  version: 1,
  savedAt: new Date().toISOString(),
  parts: parts.map(sanitizePart)
})

export const parseAssemblyFile = text => {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Файл не є коректним JSON')
  }
  if (data?.format !== 'foamcut-assembly' || data?.version !== 1) {
    throw new Error('Це не файл збірки FoamCut Simulator')
  }
  if (!Array.isArray(data.parts) || !data.parts.length) {
    throw new Error('Файл збірки не містить деталей')
  }
  return { parts: data.parts.map(sanitizePart) }
}
