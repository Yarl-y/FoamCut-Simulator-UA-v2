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

const sanitizeFuselageDesign = (design, label) => {
  if (design == null) return null
  const template = design?.template
  if (design?.type !== 'fuselage-template' || !template || !Array.isArray(template.stations) || template.stations.length < 2) {
    throw new Error(`${label}: некоректний параметричний опис фюзеляжу`)
  }
  const stations = template.stations.map((station, index) => ({
    id: String(station?.id || `station-${index + 1}`),
    name: String(station?.name || `Станція ${index + 1}`),
    position: finiteNumber(station?.position, `${label}, станція ${index + 1}, положення`),
    width: finiteNumber(station?.width, `${label}, станція ${index + 1}, ширина`),
    height: finiteNumber(station?.height, `${label}, станція ${index + 1}, висота`),
    lift: finiteNumber(station?.lift ?? 0, `${label}, станція ${index + 1}, підйом`),
    upperFullness: finiteNumber(station?.upperFullness ?? 1, `${label}, станція ${index + 1}, верх`),
    lowerFullness: finiteNumber(station?.lowerFullness ?? 1, `${label}, станція ${index + 1}, низ`),
    bottomFlatness: finiteNumber(station?.bottomFlatness ?? 0, `${label}, станція ${index + 1}, плоскість`)
  }))
  const sectionSettings = stations.slice(0, -1).map((station, index) => ({
    hollow: Boolean(template.sectionSettings?.[index]?.hollow),
    wallThickness: Math.max(1, finiteNumber(template.sectionSettings?.[index]?.wallThickness ?? 5, `${label}, стінка ${index + 1}`)),
    bottomThickness: Math.max(1, finiteNumber(template.sectionSettings?.[index]?.bottomThickness ?? 5, `${label}, днище ${index + 1}`))
  }))
  const tube = template.tube || {}
  return {
    type: 'fuselage-template',
    segmentIndex: Math.max(0, Math.floor(finiteNumber(design.segmentIndex ?? 0, `${label}, номер секції`))),
    template: {
      name: String(template.name || 'Фюзеляж зі збірки'),
      description: String(template.description || 'Параметричний фюзеляж зі збірки'),
      length: Math.max(1, finiteNumber(template.length, `${label}, довжина`)),
      width: Math.max(1, finiteNumber(template.width, `${label}, ширина`)),
      height: Math.max(1, finiteNumber(template.height, `${label}, висота`)),
      stations,
      sectionSettings,
      tube: {
        enabled: Boolean(tube.enabled),
        diameter: Math.max(1, finiteNumber(tube.diameter ?? 8, `${label}, діаметр трубки`)),
        clearance: Math.max(0, finiteNumber(tube.clearance ?? 0.4, `${label}, зазор трубки`)),
        height: finiteNumber(tube.height ?? 0, `${label}, висота трубки`),
        sideOffset: finiteNumber(tube.sideOffset ?? 0, `${label}, зміщення трубки`),
        start: Math.max(0, finiteNumber(tube.start ?? 0, `${label}, початок трубки`)),
        length: Math.max(1, finiteNumber(tube.length ?? 1, `${label}, довжина трубки`))
      }
    }
  }
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
    designSource: kind === 'fuselage'
      ? sanitizeFuselageDesign(part.designSource, `Деталь ${index + 1}`)
      : null,
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
