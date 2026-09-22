const lednicerCoordinates = (upper, lower) => [
  ...upper.slice().reverse(),
  ...lower.slice(1)
]

const PROFILE_CATALOG = {
  naca0012: { name: 'NACA 0012', digits: '0012', description: 'Симетричний профіль для пілотажних крил, стабілізаторів і кіля.', use: 'Пілотаж та оперення', thickness: 12 },
  naca2412: { name: 'NACA 2412', digits: '2412', description: 'Універсальний передбачуваний профіль для навчальних і моторних моделей.', use: 'Тренер та універсальна модель', thickness: 12 },
  naca4412: { name: 'NACA 4412', digits: '4412', description: 'Підйомний профіль для спокійних моделей із доброю несучою здатністю.', use: 'Повільний стабільний політ', thickness: 12 },
  naca4415: { name: 'NACA 4415', digits: '4415', description: 'Товстіший підйомний профіль із місцем для міцного лонжерона.', use: 'Вантажне та міцне крило', thickness: 15 },
  clarky: {
    name: 'Clark Y', description: 'Простий і передбачуваний профіль із майже пласким низом, зручний для тренера.', use: 'Навчальна модель', thickness: 11.7,
    coordinates: lednicerCoordinates(
      [[0,0],[0.001,0.003727],[0.004,0.008924],[0.012,0.017858],[0.03,0.033022],[0.06,0.048757],[0.1,0.062998],[0.16,0.077571],[0.22,0.086143],[0.3,0.09068],[0.38,0.091521],[0.46,0.088643],[0.54,0.082371],[0.62,0.073206],[0.7,0.061433],[0.78,0.047628],[0.86,0.031974],[0.92,0.019116],[0.96,0.010023],[0.98,0.005334],[1,0.000599]],
      [[0,0],[0.001,-0.005942],[0.004,-0.010513],[0.012,-0.016973],[0.03,-0.022606],[0.06,-0.027128],[0.1,-0.029379],[0.16,-0.030255],[0.22,-0.029145],[0.3,-0.026308],[0.38,-0.023361],[0.46,-0.020435],[0.54,-0.017491],[0.62,-0.014555],[0.7,-0.011617],[0.78,-0.008679],[0.86,-0.005741],[0.92,-0.003537],[0.96,-0.002068],[0.98,-0.001334],[1,-0.000599]]
    )
  },
  naca23012: {
    name: 'NACA 23012', description: 'Універсальний профіль для моторних моделей із помірним опором.', use: 'Моторна модель', thickness: 12,
    coordinates: [[1.00003,0.00126],[0.98914,0.00302],[0.95693,0.00812],[0.90482,0.01602],[0.83506,0.02597],[0.7507,0.03712],[0.65541,0.04854],[0.55335,0.05924],[0.44897,0.06811],[0.34681,0.07402],[0.25131,0.07597],[0.16604,0.0732],[0.0923,0.06265],[0.0373,0.04324],[0.00628,0.0203],[0,0],[0.01557,-0.01401],[0.04915,-0.02248],[0.09868,-0.02922],[0.16483,-0.0366],[0.24869,-0.04283],[0.34418,-0.0451],[0.4465,-0.04371],[0.55117,-0.03945],[0.6536,-0.03327],[0.7493,-0.02607],[0.83407,-0.01866],[0.9042,-0.0118],[0.95661,-0.00621],[0.98901,-0.00254],[0.99997,-0.00126]]
  },
  e205: {
    name: 'Eppler E205', description: 'Планерний профіль для спокійного ефективного польоту на малих числах Рейнольдса.', use: 'Планер', thickness: 10.48,
    coordinates: [[1,0],[0.98649,0.00174],[0.94916,0.00778],[0.89175,0.01668],[0.81684,0.02786],[0.72866,0.04088],[0.63204,0.0547],[0.53217,0.06782],[0.4341,0.07785],[0.34101,0.08214],[0.25496,0.0797],[0.17764,0.07111],[0.11157,0.05811],[0.05937,0.04211],[0.02292,0.02461],[0.00331,0.00766],[0.00002,0.00055],[0.01065,-0.00988],[0.04291,-0.01776],[0.09534,-0.02252],[0.16627,-0.02436],[0.2529,-0.02384],[0.35149,-0.02168],[0.45751,-0.01859],[0.56591,-0.01516],[0.67149,-0.0118],[0.76911,-0.00876],[0.854,-0.00614],[0.92195,-0.0038],[0.97017,-0.00125],[1,0]]
  },
  mh32: {
    name: 'MH 32', description: 'Тонкий профіль для швидших планерів і динамічного польоту.', use: 'Швидкісний планер', thickness: 8.7,
    coordinates: [[1,0],[0.987065,0.0015],[0.950351,0.006778],[0.893624,0.01577],[0.820891,0.02722],[0.736094,0.039227],[0.642591,0.049941],[0.543827,0.058523],[0.444111,0.064366],[0.347419,0.066605],[0.257469,0.064769],[0.17749,0.058864],[0.110324,0.049074],[0.058053,0.036107],[0.022057,0.021177],[0.003007,0.006467],[0.000005,0.000185],[0.001206,-0.002372],[0.004765,-0.004941],[0.026042,-0.011983],[0.06926,-0.018049],[0.131245,-0.02142],[0.209858,-0.02216],[0.302022,-0.020744],[0.403781,-0.017795],[0.510588,-0.013927],[0.617582,-0.009742],[0.719772,-0.005836],[0.812224,-0.002712],[0.890261,-0.000732],[0.949659,0.000079],[0.987012,0.000125],[1,0]]
  },
  s1223: {
    name: 'Selig S1223', description: 'Дуже підйомний профіль для малих швидкостей; потребує уважної перевірки режиму різання.', use: 'Вантажне або повільне крило', thickness: 15.8,
    coordinates: [[1,0],[0.99417,0.00494],[0.98075,0.01646],[0.95884,0.02853],[0.92639,0.04116],[0.88406,0.05427],[0.83277,0.06749],[0.77369,0.08044],[0.70823,0.09277],[0.63798,0.10412],[0.56465,0.11425],[0.49025,0.12303],[0.41721,0.13011],[0.34777,0.13447],[0.28347,0.13505],[0.22541,0.13037],[0.17286,0.12026],[0.12591,0.10598],[0.08545,0.08879],[0.05223,0.06965],[0.02694,0.04966],[0.01028,0.02954],[0.00155,0.01033],[0.00005,0.00178],[0.00264,-0.0112],[0.01718,-0.0155],[0.04627,-0.01532],[0.08787,-0.01202],[0.1402,-0.00563],[0.20278,0.00535],[0.27673,0.01928],[0.36044,0.03358],[0.45139,0.04618],[0.54639,0.05534],[0.64176,0.05976],[0.73344,0.05872],[0.81729,0.05219],[0.88928,0.04088],[0.94573,0.02624],[0.98255,0.0106],[1,0]]
  },
  e325: {
    name: 'Eppler E325', description: 'S-подібний профіль, призначений для безхвостих схем і літаючих крил.', use: 'Літаюче крило', thickness: 13.5,
    coordinates: lednicerCoordinates(
      [[0.00001,-0.00041],[0.00021,0.00241],[0.00484,0.012],[0.02641,0.03092],[0.06417,0.04936],[0.11687,0.06478],[0.18292,0.07493],[0.26112,0.078],[0.3505,0.07381],[0.44889,0.06411],[0.55259,0.05108],[0.65692,0.03709],[0.75639,0.02428],[0.8451,0.01414],[0.91733,0.00719],[0.9684,0.00258],[1,0]],
      [[0.00001,-0.00041],[0.0002,-0.00166],[0.00108,-0.00327],[0.00414,-0.00595],[0.00814,-0.00837],[0.03981,-0.0191],[0.09215,-0.02875],[0.16288,-0.03743],[0.24798,-0.04541],[0.34282,-0.05189],[0.44313,-0.05588],[0.54467,-0.05681],[0.64309,-0.05428],[0.73412,-0.0477],[0.81571,-0.03546],[0.88807,-0.02112],[0.94645,-0.00935],[0.96867,-0.00504],[1,0]]
    )
  },
  sd7037: {
    name: 'SD7037',
    coordinates: [
      [1, 0], [0.99672, 0.00042], [0.98707, 0.0018], [0.97146, 0.00436],
      [0.95041, 0.00811], [0.9245, 0.01295], [0.89425, 0.01865], [0.86015, 0.0249],
      [0.82261, 0.03141], [0.78201, 0.03788], [0.73865, 0.04413], [0.69294, 0.05011],
      [0.64539, 0.05572], [0.59655, 0.06085], [0.54693, 0.06538], [0.49706, 0.06917],
      [0.44745, 0.07211], [0.39862, 0.0741], [0.35101, 0.07504], [0.30508, 0.07488],
      [0.26125, 0.07358], [0.21989, 0.07113], [0.18137, 0.06754], [0.14601, 0.06286],
      [0.1141, 0.05715], [0.08586, 0.05049], [0.06146, 0.043], [0.04102, 0.03486],
      [0.02462, 0.02632], [0.01232, 0.0177], [0.00418, 0.00936], [0.00021, 0.00185],
      [0.00127, -0.00393], [0.00806, -0.00839], [0.02038, -0.01227],
      [0.038, -0.01541], [0.06074, -0.01777], [0.08844, -0.01934],
      [0.12084, -0.02017], [0.15765, -0.02032], [0.1985, -0.01987],
      [0.24296, -0.01891], [0.29055, -0.01754], [0.34071, -0.01586],
      [0.39288, -0.01396], [0.44643, -0.0119], [0.50074, -0.00976],
      [0.55519, -0.0076], [0.60914, -0.00549], [0.66197, -0.00349],
      [0.71305, -0.00168], [0.76178, -0.00014], [0.80752, 0.00104],
      [0.84964, 0.00182], [0.88756, 0.0022], [0.92071, 0.00218],
      [0.94859, 0.00185], [0.97077, 0.00132], [0.9869, 0.00071],
      [0.99671, 0.00021]
    ]
  }
}

export const profileLibraryEntries = Object.entries(PROFILE_CATALOG).map(([id, profile]) => ({
  id,
  name: profile.name,
  description: profile.description || '',
  use: profile.use || '',
  thickness: profile.thickness || Number(profile.digits?.slice(2)) || null
}))

const cosineStations = count => Array.from(
  { length: count },
  (_, index) => (1 - Math.cos(Math.PI * index / (count - 1))) / 2
)

const resampleClosedPoints = (points, pointCount) => {
  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    return Math.hypot(next.x - point.x, next.y - point.y)
  })
  const perimeter = segments.reduce((sum, length) => sum + length, 0)
  const result = []
  let segmentIndex = 0
  let segmentStartDistance = 0

  for (let index = 0; index < pointCount; index++) {
    const targetDistance = perimeter * index / pointCount
    while (
      segmentIndex < segments.length - 1
      && segmentStartDistance + segments[segmentIndex] < targetDistance
    ) {
      segmentStartDistance += segments[segmentIndex]
      segmentIndex++
    }
    const start = points[segmentIndex]
    const end = points[(segmentIndex + 1) % points.length]
    const segmentLength = segments[segmentIndex] || 1
    const ratio = (targetDistance - segmentStartDistance) / segmentLength
    result.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio
    })
  }

  return result
}

const nacaSurfacePoint = (x, camber, camberPosition, thickness, upper) => {
  const thicknessY = 5 * thickness * (
    0.2969 * Math.sqrt(x)
    - 0.1260 * x
    - 0.3516 * x ** 2
    + 0.2843 * x ** 3
    - 0.1036 * x ** 4
  )
  let camberY = 0
  let slope = 0

  if (camber > 0 && camberPosition > 0) {
    if (x < camberPosition) {
      camberY = camber / camberPosition ** 2
        * (2 * camberPosition * x - x ** 2)
      slope = 2 * camber / camberPosition ** 2 * (camberPosition - x)
    } else {
      camberY = camber / (1 - camberPosition) ** 2
        * ((1 - 2 * camberPosition) + 2 * camberPosition * x - x ** 2)
      slope = 2 * camber / (1 - camberPosition) ** 2 * (camberPosition - x)
    }
  }

  const angle = Math.atan(slope)
  const sign = upper ? 1 : -1
  return {
    x: x - sign * thicknessY * Math.sin(angle),
    y: camberY + sign * thicknessY * Math.cos(angle)
  }
}

export const createLibraryProfile = (profileId, pointCount = 200) => {
  const profile = PROFILE_CATALOG[profileId]
  if (!profile) throw new Error('Невідомий профіль бібліотеки')

  if (profile.coordinates) {
    return resampleClosedPoints(
      profile.coordinates.map(([x, y]) => ({ x, y })),
      pointCount
    )
  }

  const camber = Number(profile.digits[0]) / 100
  const camberPosition = Number(profile.digits[1]) / 10
  const thickness = Number(profile.digits.slice(2)) / 100
  const upperCount = Math.ceil(pointCount / 2)
  const lowerCount = pointCount - upperCount + 1
  const upperStations = cosineStations(upperCount).reverse()
  const lowerStations = cosineStations(lowerCount)
  const upper = upperStations.map(x => nacaSurfacePoint(x, camber, camberPosition, thickness, true))
  const lower = lowerStations.map(x => nacaSurfacePoint(x, camber, camberPosition, thickness, false))

  return [...upper, ...lower.slice(1)]
}

export const defaultFuselageStations = [
  { id: 'nose', name: 'Ніс', position: 0, width: 0.18, height: 0.2, lift: 0.3, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 },
  { id: 'cabin', name: 'Кабіна', position: 0.28, width: 1, height: 1, lift: 0, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 },
  { id: 'middle', name: 'Середина', position: 0.62, width: 0.78, height: 0.72, lift: 0.04, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 },
  { id: 'tail', name: 'Хвіст', position: 1, width: 0.26, height: 0.28, lift: 0.2, upperFullness: 1, lowerFullness: 1, bottomFlatness: 0 }
]

export const fuselageSegmentEntries = defaultFuselageStations.slice(0, -1).map((station, index) => ({
  id: `${station.id}-${defaultFuselageStations[index + 1].id}`,
  name: `${station.name} → ${defaultFuselageStations[index + 1].name}`
}))

const createGliderSection = (
  width,
  height,
  lift,
  pointCount,
  { upperFullness = 1, lowerFullness = 1, bottomFlatness = 0 } = {}
) => {
  const rawPoints = Array.from({ length: pointCount }, (_, index) => {
    const angle = Math.PI * 2 * index / pointCount
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const lowerHalf = sine < 0
    const exponent = 2.35 + (lowerHalf ? bottomFlatness * 6 : 0)
    const fullness = lowerHalf ? lowerFullness : upperFullness
    const fullnessFactor = 1 - (1 - fullness) * Math.abs(sine) ** 0.65
    const shapedX = Math.sign(cosine) * Math.abs(cosine) ** (2 / exponent) * fullnessFactor
    const shapedY = Math.sign(sine) * Math.abs(sine) ** (2 / exponent)
    const lowerScale = shapedY < 0 ? 0.78 : 1
    return {
      x: shapedX * width / 2,
      y: shapedY * lowerScale * height / 2
    }
  })
  const minX = Math.min(...rawPoints.map(point => point.x))
  const maxX = Math.max(...rawPoints.map(point => point.x))
  const minY = Math.min(...rawPoints.map(point => point.y))
  const maxY = Math.max(...rawPoints.map(point => point.y))

  return rawPoints.map(point => ({
    x: (point.x - minX) * width / (maxX - minX),
    y: (point.y - minY) * height / (maxY - minY) + lift
  }))
}

const centerSectionHorizontally = points => {
  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const centerX = (minX + maxX) / 2
  return points.map(point => ({ ...point, x: point.x - centerX }))
}

const alignSectionVertically = (points, base) => {
  if (base === 'station') return { points, shiftY: 0 }
  const minimum = Math.min(...points.map(point => point.y))
  const maximum = Math.max(...points.map(point => point.y))
  const anchor = base === 'bottom' ? minimum : base === 'top' ? maximum : (minimum + maximum) / 2
  return {
    points: points.map(point => ({ ...point, y: point.y - anchor })),
    shiftY: -anchor
  }
}

// Keep the bottom and the useful lower side walls unchanged while moving only
// the roof.  This lets two neighbouring parts share their bottom and sides,
// but still have a deliberate step or slope on top.
const reshapeSectionRoof = (points, roofScale, fixedSideRatio = 0.7) => {
  const minimum = Math.min(...points.map(point => point.y))
  const maximum = Math.max(...points.map(point => point.y))
  const height = maximum - minimum
  const targetHeight = height * roofScale
  // Above 70% keep the full lower 70% intact. For a lower requested roof,
  // reduce the fixed side portion automatically so the contour remains valid.
  const effectiveFixedRatio = roofScale > fixedSideRatio
    ? fixedSideRatio
    : roofScale * 0.8
  const fixedHeight = height * effectiveFixedRatio
  const shoulder = minimum + fixedHeight
  const movableHeight = height - fixedHeight
  const targetMovableHeight = targetHeight - fixedHeight
  return points.map(point => ({
    ...point,
    y: point.y <= shoulder
      ? point.y
      : shoulder + (point.y - shoulder) * targetMovableHeight / movableHeight
  }))
}

export const createGliderFuselageSegment = ({
  segmentId,
  segmentIndex: requestedSegmentIndex,
  stations = defaultFuselageStations,
  totalLength,
  maximumWidth,
  maximumHeight,
  hollow = false,
  wallThickness = 5,
  bottomThickness = 5,
  ceilingThickness = wallThickness,
  sectionSettings = null,
  pointCount = 200
}) => {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('Фюзеляж повинен мати щонайменше дві поперечні станції')
  }
  const normalizedStations = stations.map((station, index) => {
    const values = [
      Number(station.position), Number(station.width), Number(station.height), Number(station.lift),
      Number(station.upperFullness ?? 1), Number(station.lowerFullness ?? 1),
      Number(station.bottomFlatness ?? 0)
    ]
    if (values.some(value => !Number.isFinite(value))) {
      throw new Error(`Станція ${index + 1} має некоректні параметри`)
    }
    if (
      values[0] < 0 || values[0] > 1 || values[1] <= 0 || values[2] <= 0
      || values[4] <= 0 || values[5] <= 0 || values[6] < 0 || values[6] > 1
    ) {
      throw new Error(`Станція ${index + 1}: положення має бути 0–100%, а ширина і висота — більші за нуль`)
    }
    return {
      ...station,
      position: values[0], width: values[1], height: values[2], lift: values[3],
      upperFullness: values[4], lowerFullness: values[5], bottomFlatness: values[6]
    }
  })
  for (let index = 1; index < normalizedStations.length; index++) {
    if (normalizedStations[index].position <= normalizedStations[index - 1].position) {
      throw new Error('Положення станцій повинні зростати від носа до хвоста')
    }
  }
  const legacySegmentIndex = fuselageSegmentEntries.findIndex(segment => segment.id === segmentId)
  const segmentIndex = Number.isInteger(requestedSegmentIndex)
    ? requestedSegmentIndex
    : legacySegmentIndex
  if (segmentIndex < 0 || segmentIndex >= normalizedStations.length - 1) {
    throw new Error('Невідома секція фюзеляжу')
  }
  const leftStation = normalizedStations[segmentIndex]
  const rightStation = normalizedStations[segmentIndex + 1]
  const geometrySettings = sectionSettings?.[segmentIndex] || {}
  const jointBase = ['bottom', 'center', 'top'].includes(geometrySettings.jointBase)
    ? geometrySettings.jointBase
    : 'station'
  const startScale = Math.max(0.1, Number(geometrySettings.startScale) || 1)
  const endScale = Math.max(0.1, Number(geometrySettings.endScale) || 1)
  const innerStartCeilingHeight = geometrySettings.innerStartCeilingHeight != null
    && geometrySettings.innerStartCeilingHeight !== ''
    && Number.isFinite(Number(geometrySettings.innerStartCeilingHeight))
    ? Number(geometrySettings.innerStartCeilingHeight)
    : null
  const innerEndCeilingHeight = geometrySettings.innerEndCeilingHeight != null
    && geometrySettings.innerEndCeilingHeight !== ''
    && Number.isFinite(Number(geometrySettings.innerEndCeilingHeight))
    ? Number(geometrySettings.innerEndCeilingHeight)
    : null
  const stationDimensions = station => ({
    width: maximumWidth * station.width,
    height: maximumHeight * station.height,
    lift: maximumHeight * station.lift
  })
  const makeSection = (station, roofScale) => {
    const dimensions = stationDimensions(station)
    const section = createGliderSection(
      dimensions.width, dimensions.height, dimensions.lift, pointCount, station
    )
    return reshapeSectionRoof(section, roofScale)
  }
  // Fuselage stations share one longitudinal centreline.  Center each face
  // before the common positive-coordinate translation; otherwise profiles of
  // different widths are aligned by their left edges and a straight tube
  // becomes diagonal through the foam block.
  const alignedLeft = alignSectionVertically(centerSectionHorizontally(makeSection(leftStation, startScale)), jointBase)
  const alignedRight = alignSectionVertically(centerSectionHorizontally(makeSection(rightStation, endScale)), jointBase)
  const pair = normalizeProfilePair(alignedLeft.points, alignedRight.points)
  let innerLeftPoints = null
  let innerRightPoints = null

  if (hollow) {
    const sharedSettings = stationIndex => {
      const candidates = [stationIndex - 1, stationIndex]
        .map(index => sectionSettings?.[index])
        .filter(settings => settings?.hollow)
      if (!candidates.length) {
        candidates.push({ wallThickness, bottomThickness, ceilingThickness })
      }
      return {
        wall: Math.max(...candidates.map(settings => Number(settings.wallThickness ?? wallThickness))),
        bottom: Math.max(...candidates.map(settings => Number(settings.bottomThickness ?? bottomThickness))),
        ceiling: Math.max(...candidates.map(settings => Number(settings.ceilingThickness ?? settings.wallThickness ?? ceilingThickness)))
      }
    }
    const makeInnerSection = (station, stationIndex, label, alignedOuter, explicitCeilingHeight) => {
      const dimensions = stationDimensions(station)
      const { wall, bottom, ceiling } = sharedSettings(stationIndex)
      if (![wall, bottom, ceiling].every(value => Number.isFinite(value) && value > 0)) {
        throw new Error('Товщина стінки, днища та стелі повинна бути більшою за нуль')
      }
      const innerWidth = dimensions.width - wall * 2
      const outerMinimum = Math.min(...alignedOuter.points.map(point => point.y))
      const outerMaximum = Math.max(...alignedOuter.points.map(point => point.y))
      const outerHeight = outerMaximum - outerMinimum
      const ceilingHeight = explicitCeilingHeight ?? (outerHeight - ceiling)
      const innerHeight = ceilingHeight - bottom
      if (innerWidth < 2 || innerHeight < 2) {
        throw new Error(`${label}: недостатньо місця для порожнини при заданій товщині`)
      }
      if (ceilingHeight > outerHeight - 1) {
        throw new Error(`${label}: стеля порожнини виходить за зовнішній верх профілю`)
      }
      const inner = centerSectionHorizontally(createGliderSection(
        innerWidth,
        innerHeight,
        outerMinimum + bottom,
        pointCount,
        station
      ))
      return inner.map(point => ({
        x: point.x + pair.translation.x,
        y: point.y + pair.translation.y
      }))
    }
    innerLeftPoints = makeInnerSection(leftStation, segmentIndex, leftStation.name, alignedLeft, innerStartCeilingHeight)
    innerRightPoints = makeInnerSection(rightStation, segmentIndex + 1, rightStation.name, alignedRight, innerEndCeilingHeight)
  }

  return {
    ...pair,
    innerLeftPoints,
    innerRightPoints,
    segmentStart: totalLength * leftStation.position,
    segmentLength: totalLength * (rightStation.position - leftStation.position),
    leftName: leftStation.name,
    rightName: rightStation.name,
    jointBase,
    startScale,
    endScale,
    innerStartCeilingHeight,
    innerEndCeilingHeight
  }
}

const transformPhysicalPoint = (point, {
  chord,
  sweep = 0,
  twistDegrees = 0,
  twistAxisPercent = 25
}) => {
  const axisX = chord * twistAxisPercent / 100
  const angle = twistDegrees * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const relativeX = point.x - axisX

  return {
    x: sweep + axisX + relativeX * cosine - point.y * sine,
    y: relativeX * sine + point.y * cosine
  }
}

export const transformLibraryProfile = (points, options) => {
  const { chord } = options

  return points.map(point => transformPhysicalPoint({
    x: point.x * chord,
    y: point.y * chord
  }, options))
}

export const createSparHoleContour = ({
  chord,
  positionPercent,
  height,
  diameter,
  sweep = 0,
  twistDegrees = 0,
  twistAxisPercent = 25,
  pointCount = 32
}) => Array.from({ length: pointCount }, (_, index) => {
  const angle = Math.PI * 2 * index / pointCount
  return transformPhysicalPoint({
    x: chord * positionPercent / 100 + Math.cos(angle) * diameter / 2,
    y: height + Math.sin(angle) * diameter / 2
  }, { chord, sweep, twistDegrees, twistAxisPercent })
})

export const createStraightSparHoleContour = ({
  x,
  y,
  diameter,
  pointCount = 32
}) => Array.from({ length: pointCount }, (_, index) => {
  const angle = Math.PI * 2 * index / pointCount
  return {
    x: x + Math.cos(angle) * diameter / 2,
    y: y + Math.sin(angle) * diameter / 2
  }
})

const pointInsidePolygon = (point, polygon) => {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)
        / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (crosses) inside = !inside
  }
  return inside
}

export const sparHoleFitsProfile = (profilePoints, holeContour) => holeContour.every(
  point => pointInsidePolygon(point, profilePoints)
)

export const holeFitsFuselageMaterial = (outerPoints, innerPoints, holeContour) => (
  sparHoleFitsProfile(outerPoints, holeContour)
  && (!innerPoints || holeContour.every(point => !pointInsidePolygon(point, innerPoints)))
)

const interpolateConnector = (start, end, segmentCount = 6) => Array.from(
  { length: segmentCount },
  (_, index) => {
    const ratio = (index + 1) / segmentCount
    return {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio
    }
  }
)

const rotatePoints = (points, startIndex) => [
  ...points.slice(startIndex),
  ...points.slice(0, startIndex)
].map(point => ({ ...point }))

export const createPairedHollowCutPath = (
  outerLeft,
  outerRight,
  innerLeft,
  innerRight,
  options = {}
) => {
  if (
    outerLeft.length !== outerRight.length
    || innerLeft.length !== innerRight.length
    || !outerLeft.length
    || !innerLeft.length
  ) {
    throw new Error('Контури порожнистої секції повинні мати синхронні точки X/Y та A/Z')
  }
  let bottomIndex = 0
  outerLeft.forEach((point, index) => {
    if (point.y < outerLeft[bottomIndex].y) bottomIndex = index
  })
  if (Number.isInteger(options.outerStartIndex)
    && options.outerStartIndex >= 0 && options.outerStartIndex < outerLeft.length) {
    bottomIndex = options.outerStartIndex
  }
  const buildSide = (outer, inner) => {
    const orderedOuter = rotatePoints(outer, bottomIndex)
    let innerBottomIndex = 0
    inner.forEach((point, index) => {
      if (point.y < inner[innerBottomIndex].y) innerBottomIndex = index
    })
    if (Number.isInteger(options.innerStartIndex)
      && options.innerStartIndex >= 0 && options.innerStartIndex < inner.length) {
      innerBottomIndex = options.innerStartIndex
    }
    const orderedInner = rotatePoints(inner, innerBottomIndex)
    const outerStart = orderedOuter[0]
    const innerStart = orderedInner[0]
    const connector = interpolateConnector(outerStart, innerStart)
    return [
      { ...outerStart },
      ...connector,
      ...orderedInner.slice(1),
      { ...innerStart },
      ...connector.slice(0, -1).reverse().map(point => ({ ...point })),
      { ...outerStart },
      ...orderedOuter.slice(1)
    ]
  }
  return {
    leftPoints: buildSide(outerLeft, innerLeft),
    rightPoints: buildSide(outerRight, innerRight)
  }
}

const rotateContourToNearestPoint = (points, target) => {
  let nearestIndex = 0
  let nearestDistance = Infinity
  points.forEach((point, index) => {
    const distance = Math.hypot(point.x - target.x, point.y - target.y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })
  const ordered = [...points.slice(nearestIndex), ...points.slice(0, nearestIndex)]
  return [...ordered, { ...ordered[0] }]
}

const createKeyholeRoute = (boundaryPoint, orderedHole) => {
  const connector = interpolateConnector(boundaryPoint, orderedHole[0])
  return [
    ...connector,
    ...orderedHole.slice(1),
    ...connector.slice(0, -1).reverse(),
    { ...boundaryPoint }
  ]
}

export const insertPairedSparHoles = (leftPoints, rightPoints, holes) => {
  if (!leftPoints.length || leftPoints.length !== rightPoints.length
    || holes.some(hole => !hole.left.length || hole.left.length !== hole.right.length)) {
    throw new Error('Для отворів потрібні відповідні парні точки обох профілів')
  }
  const insertions = holes.map(hole => {
    if (Number.isInteger(hole.baseIndex)
      && hole.baseIndex >= 0
      && hole.baseIndex < leftPoints.length) {
      return { ...hole, baseIndex: hole.baseIndex }
    }
    const leftCenter = hole.left.reduce((center, point) => ({
      x: center.x + point.x / hole.left.length,
      y: center.y + point.y / hole.left.length
    }), { x: 0, y: 0 })
    let baseIndex = 0
    let nearestDistance = Infinity
    leftPoints.forEach((point, index) => {
      const distance = Math.hypot(point.x - leftCenter.x, point.y - leftCenter.y)
      if (distance < nearestDistance) {
        nearestDistance = distance
        baseIndex = index
      }
    })
    return { ...hole, baseIndex }
  }).sort((first, second) => second.baseIndex - first.baseIndex)
  const leftResult = leftPoints.map(point => ({ ...point }))
  const rightResult = rightPoints.map(point => ({ ...point }))

  for (const hole of insertions) {
    // One angular phase for both faces, not two independently chosen entries.
    const orderedLeft = rotateContourToNearestPoint(hole.left, leftPoints[hole.baseIndex])
    const holeIndex = hole.left.indexOf(orderedLeft[0])
    const orderedRight = rotatePoints(hole.right, holeIndex)
    orderedRight.push({ ...orderedRight[0] })
    leftResult.splice(
      hole.baseIndex + 1,
      0,
      ...createKeyholeRoute(leftPoints[hole.baseIndex], orderedLeft)
    )
    rightResult.splice(
      hole.baseIndex + 1,
      0,
      ...createKeyholeRoute(rightPoints[hole.baseIndex], orderedRight)
    )
  }

  return { leftPoints: leftResult, rightPoints: rightResult }
}

export const normalizeProfilePair = (leftPoints, rightPoints) => {
  const allPoints = [...leftPoints, ...rightPoints]
  const minX = Math.min(...allPoints.map(point => point.x))
  const minY = Math.min(...allPoints.map(point => point.y))
  const translate = points => points.map(point => ({
    x: point.x - minX,
    y: point.y - minY
  }))

  return {
    leftPoints: translate(leftPoints),
    rightPoints: translate(rightPoints),
    translation: { x: -minX, y: -minY }
  }
}
