const pointDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y)

const stripDuplicateEnd = points => {
  if (points.length > 2 && pointDistance(points[0], points.at(-1)) <= 0.001) {
    return points.slice(0, -1)
  }
  return points
}

const removeRetracedExcursions = points => {
  const result = points.map(point => ({ ...point }))
  let changed = true

  while (changed) {
    changed = false

    for (let start = 1; start < result.length - 3; start++) {
      for (let end = result.length - 2; end >= start + 2; end--) {
        if (pointDistance(result[start], result[end]) <= 0.01) {
          result.splice(start + 1, end - start - 1)
          changed = true
          break
        }
      }
      if (changed) break
    }
  }

  return result
}

const findLongestClosedSegment = points => {
  let best = null

  for (let start = 0; start < points.length - 3; start++) {
    for (let end = points.length - 1; end >= start + 3; end--) {
      if (pointDistance(points[start], points[end]) <= 0.01) {
        const candidate = stripDuplicateEnd(
          removeRetracedExcursions(points.slice(start, end + 1))
        )
        if (candidate.length >= 3 && (!best || candidate.length > best.points.length)) {
          best = { points: candidate }
        }
      }
    }
  }

  if (!best) return { points: points.map(point => ({ ...point })), closed: false }
  return {
    points: best.points.map(point => ({ ...point })),
    closed: true
  }
}

export const extractEmbeddedNcProfiles = text => {
  const coordinate = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)'
  const pattern = new RegExp(
    `\\(FOAMCUT_PROFILE\\s+X(${coordinate})\\s+Y(${coordinate})\\s+A(${coordinate})\\s+Z(${coordinate})\\)`,
    'gi'
  )
  const leftPoints = []
  const rightPoints = []

  for (const match of text.matchAll(pattern)) {
    leftPoints.push({ x: Number(match[1]), y: Number(match[2]) })
    rightPoints.push({ x: Number(match[3]), y: Number(match[4]) })
  }

  return leftPoints.length >= 2 ? { leftPoints, rightPoints } : null
}

export const recoverNcProfiles = (text, leftTrajectory, rightTrajectory) => {
  const embedded = extractEmbeddedNcProfiles(text)
  if (embedded) {
    return { ...embedded, leftClosed: true, rightClosed: true, method: 'embedded' }
  }

  const left = findLongestClosedSegment(leftTrajectory)
  const right = findLongestClosedSegment(rightTrajectory)
  return {
    leftPoints: left.points,
    rightPoints: right.points,
    leftClosed: left.closed,
    rightClosed: right.closed,
    method: left.closed && right.closed ? 'detected' : 'full'
  }
}

const dxfNumber = value => {
  const normalized = Math.abs(value) < 0.0000005 ? 0 : value
  return Number(normalized.toFixed(6)).toString()
}

export const createDxfPolyline = (points, layer, closed = true) => {
  const cleanPoints = closed ? stripDuplicateEnd(points) : points
  if (cleanPoints.length < 2) throw new Error('Недостатньо точок для створення DXF')

  const lines = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1015',
    '9', '$INSUNITS', '70', '4',
    '9', '$MEASUREMENT', '70', '1',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE',
    '100', 'AcDbEntity',
    '8', layer,
    '100', 'AcDbPolyline',
    '90', String(cleanPoints.length),
    '70', closed ? '1' : '0'
  ]

  for (const point of cleanPoints) {
    lines.push('10', dxfNumber(point.x), '20', dxfNumber(point.y))
  }

  lines.push('0', 'ENDSEC', '0', 'EOF')
  return `${lines.join('\n')}\n`
}

export const createPreviewModel = (points, closed) => {
  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const maxY = Math.max(...points.map(point => point.y))
  const contour = {
    points: points.map(point => ({ ...point })),
    closed,
    sourcePathIndexes: [0],
    sourcePathCount: 1,
    tolerance: 0.01
  }

  return {
    paths: [{ points: contour.points, closed, layer: 'RECOVERED_PROFILE', type: 'LWPOLYLINE' }],
    contours: [contour],
    bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
    units: 'мм',
    unsupported: []
  }
}
