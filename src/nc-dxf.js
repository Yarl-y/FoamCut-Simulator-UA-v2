const pointDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y)

const stripDuplicateEnd = points => {
  if (points.length > 2 && pointDistance(points[0], points.at(-1)) <= 0.001) {
    return points.slice(0, -1)
  }
  return points
}

const trimMirroredApproach = points => {
  let start = 0
  let end = points.length - 1

  while (end - start >= 4 && pointDistance(points[start + 1], points[end - 1]) <= 0.01) {
    start++
    end--
  }

  return points.slice(start, end + 1)
}

const findLongestClosedSegment = points => {
  let best = null

  for (let start = 0; start < points.length - 3; start++) {
    for (let end = points.length - 1; end >= start + 3; end--) {
      if (pointDistance(points[start], points[end]) <= 0.01) {
        const candidate = stripDuplicateEnd(
          trimMirroredApproach(points.slice(start, end + 1))
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

export const detectCircularHoles = points => {
  const candidates = []
  for (let start = 0; start < points.length - 12; start++) {
    for (let end = start + 12; end < Math.min(points.length, start + 96); end++) {
      if (pointDistance(points[start], points[end]) > 0.02) continue
      const loop = points.slice(start, end + 1)
      const xs = loop.map(point => point.x)
      const ys = loop.map(point => point.y)
      const minX = Math.min(...xs); const maxX = Math.max(...xs)
      const minY = Math.min(...ys); const maxY = Math.max(...ys)
      const width = maxX - minX; const height = maxY - minY
      if (width < 1 || height < 1 || width > 100 || height > 100) continue
      const ratio = width / height
      if (ratio < 0.85 || ratio > 1.15) continue
      const x = (minX + maxX) / 2
      const y = (minY + maxY) / 2
      const diameter = (width + height) / 2
      if (!candidates.some(hole => Math.hypot(hole.x - x, hole.y - y) < diameter * 0.2)) {
        candidates.push({ x, y, diameter, pointCount: loop.length })
      }
      break
    }
  }
  return candidates
    .sort((first, second) => first.x - second.x)
    .map(({ x, y, diameter }) => ({ x, y, diameter }))
}

export const removeInteriorCutLoops = points => {
  if (points.length < 4) return points.map(point => ({ ...point }))
  const profileWidth = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
  const intervals = []
  for (let start = 0; start < points.length - 12; start++) {
    for (let end = points.length - 1; end >= start + 12; end--) {
      if (pointDistance(points[start], points[end]) > 0.02) continue
      const segment = points.slice(start, end + 1)
      const width = Math.max(...segment.map(point => point.x)) - Math.min(...segment.map(point => point.x))
      if (width > 0 && width < profileWidth * 0.25 && end - start < points.length * 0.55) {
        intervals.push({ start, end })
      }
      break
    }
  }
  const outerIntervals = intervals.filter(interval => !intervals.some(other => (
    other !== interval && other.start <= interval.start && other.end >= interval.end
  )))
  const removed = new Set()
  outerIntervals.forEach(({ start, end }) => {
    for (let index = start + 1; index <= end; index++) removed.add(index)
  })
  return points.filter((point, index) => !removed.has(index)).map(point => ({ ...point }))
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

  const minX = Math.min(...cleanPoints.map(point => point.x))
  const maxX = Math.max(...cleanPoints.map(point => point.x))
  const minY = Math.min(...cleanPoints.map(point => point.y))
  const maxY = Math.max(...cleanPoints.map(point => point.y))

  const lines = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$EXTMIN', '10', dxfNumber(minX), '20', dxfNumber(minY), '30', '0',
    '9', '$EXTMAX', '10', dxfNumber(maxX), '20', dxfNumber(maxY), '30', '0',
    '9', '$MEASUREMENT', '70', '1',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '1',
    '0', 'LAYER', '2', layer, '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'POLYLINE',
    '8', layer,
    '66', '1',
    '70', closed ? '1' : '0',
    '10', '0', '20', '0', '30', '0'
  ]

  for (const point of cleanPoints) {
    lines.push(
      '0', 'VERTEX',
      '8', layer,
      '10', dxfNumber(point.x),
      '20', dxfNumber(point.y),
      '30', '0',
      '70', '0'
    )
  }

  lines.push('0', 'SEQEND', '8', layer)
  lines.push('0', 'ENDSEC', '0', 'EOF')
  return `${lines.join('\r\n')}\r\n`
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
