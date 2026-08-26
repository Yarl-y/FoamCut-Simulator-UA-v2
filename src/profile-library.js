const PROFILE_CATALOG = {
  naca0012: { name: 'NACA 0012', digits: '0012' },
  naca2412: { name: 'NACA 2412', digits: '2412' },
  naca4412: { name: 'NACA 4412', digits: '4412' },
  naca4415: { name: 'NACA 4415', digits: '4415' }
}

export const profileLibraryEntries = Object.entries(PROFILE_CATALOG).map(([id, profile]) => ({
  id,
  name: profile.name
}))

const cosineStations = count => Array.from(
  { length: count },
  (_, index) => (1 - Math.cos(Math.PI * index / (count - 1))) / 2
)

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
