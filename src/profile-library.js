const PROFILE_CATALOG = {
  naca0012: { name: 'NACA 0012', digits: '0012' },
  naca2412: { name: 'NACA 2412', digits: '2412' },
  naca4412: { name: 'NACA 4412', digits: '4412' },
  naca4415: { name: 'NACA 4415', digits: '4415' },
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
  name: profile.name
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
  { id: 'nose', name: 'Ніс', position: 0, width: 0.18, height: 0.2, lift: 0.3 },
  { id: 'cabin', name: 'Кабіна', position: 0.28, width: 1, height: 1, lift: 0 },
  { id: 'middle', name: 'Середина', position: 0.62, width: 0.78, height: 0.72, lift: 0.04 },
  { id: 'tail', name: 'Хвіст', position: 1, width: 0.26, height: 0.28, lift: 0.2 }
]

export const fuselageSegmentEntries = defaultFuselageStations.slice(0, -1).map((station, index) => ({
  id: `${station.id}-${defaultFuselageStations[index + 1].id}`,
  name: `${station.name} → ${defaultFuselageStations[index + 1].name}`
}))

const createGliderSection = (width, height, lift, pointCount) => {
  const rawPoints = Array.from({ length: pointCount }, (_, index) => {
    const angle = Math.PI * 2 * index / pointCount
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const exponent = 2.35
    const shapedX = Math.sign(cosine) * Math.abs(cosine) ** (2 / exponent)
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

export const createGliderFuselageSegment = ({
  segmentId,
  segmentIndex: requestedSegmentIndex,
  stations = defaultFuselageStations,
  totalLength,
  maximumWidth,
  maximumHeight,
  pointCount = 200
}) => {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('Фюзеляж повинен мати щонайменше дві поперечні станції')
  }
  const normalizedStations = stations.map((station, index) => {
    const values = ['position', 'width', 'height', 'lift'].map(field => Number(station[field]))
    if (values.some(value => !Number.isFinite(value))) {
      throw new Error(`Станція ${index + 1} має некоректні параметри`)
    }
    if (values[0] < 0 || values[0] > 1 || values[1] <= 0 || values[2] <= 0) {
      throw new Error(`Станція ${index + 1}: положення має бути 0–100%, а ширина і висота — більші за нуль`)
    }
    return { ...station, position: values[0], width: values[1], height: values[2], lift: values[3] }
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
  const makeSection = station => createGliderSection(
    maximumWidth * station.width,
    maximumHeight * station.height,
    maximumHeight * station.lift,
    pointCount
  )
  const pair = normalizeProfilePair(makeSection(leftStation), makeSection(rightStation))

  return {
    ...pair,
    segmentStart: totalLength * leftStation.position,
    segmentLength: totalLength * (rightStation.position - leftStation.position),
    leftName: leftStation.name,
    rightName: rightStation.name
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

const createKeyholeRoute = (boundaryPoint, holeContour) => {
  const orderedHole = rotateContourToNearestPoint(holeContour, boundaryPoint)
  const connector = interpolateConnector(boundaryPoint, orderedHole[0])
  return [
    ...connector,
    ...orderedHole.slice(1),
    ...connector.slice(0, -1).reverse(),
    { ...boundaryPoint }
  ]
}

export const insertPairedSparHoles = (leftPoints, rightPoints, holes) => {
  const insertions = holes.map(hole => {
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
    leftResult.splice(
      hole.baseIndex + 1,
      0,
      ...createKeyholeRoute(leftPoints[hole.baseIndex], hole.left)
    )
    rightResult.splice(
      hole.baseIndex + 1,
      0,
      ...createKeyholeRoute(rightPoints[hole.baseIndex], hole.right)
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
