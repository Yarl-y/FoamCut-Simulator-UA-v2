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

const FUSELAGE_STATIONS = [
  { id: 'nose', name: 'Ніс', position: 0, width: 0.18, height: 0.2, lift: 0.3 },
  { id: 'cabin', name: 'Кабіна', position: 0.28, width: 1, height: 1, lift: 0 },
  { id: 'middle', name: 'Середина', position: 0.62, width: 0.78, height: 0.72, lift: 0.04 },
  { id: 'tail', name: 'Хвіст', position: 1, width: 0.26, height: 0.28, lift: 0.2 }
]

export const fuselageSegmentEntries = FUSELAGE_STATIONS.slice(0, -1).map((station, index) => ({
  id: `${station.id}-${FUSELAGE_STATIONS[index + 1].id}`,
  name: `${station.name} → ${FUSELAGE_STATIONS[index + 1].name}`
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
  totalLength,
  maximumWidth,
  maximumHeight,
  pointCount = 200
}) => {
  const segmentIndex = fuselageSegmentEntries.findIndex(segment => segment.id === segmentId)
  if (segmentIndex < 0) throw new Error('Невідома секція фюзеляжу')
  const leftStation = FUSELAGE_STATIONS[segmentIndex]
  const rightStation = FUSELAGE_STATIONS[segmentIndex + 1]
  const makeSection = station => createGliderSection(
    maximumWidth * station.width,
    maximumHeight * station.height,
    maximumHeight * station.lift,
    pointCount
  )
  const pair = normalizeProfilePair(makeSection(leftStation), makeSection(rightStation))

  return {
    ...pair,
    segmentLength: totalLength * (rightStation.position - leftStation.position),
    leftName: leftStation.name,
    rightName: rightStation.name
  }
}

export const transformLibraryProfile = (points, {
  chord,
  sweep = 0,
  twistDegrees = 0,
  twistAxisPercent = 25
}) => {
  const axisX = chord * twistAxisPercent / 100
  const angle = twistDegrees * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)

  return points.map(point => {
    const scaledX = point.x * chord
    const scaledY = point.y * chord
    const relativeX = scaledX - axisX
    return {
      x: sweep + axisX + relativeX * cosine - scaledY * sine,
      y: relativeX * sine + scaledY * cosine
    }
  })
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
    rightPoints: translate(rightPoints)
  }
}
