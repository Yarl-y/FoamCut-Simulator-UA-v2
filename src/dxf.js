const TAU = Math.PI * 2

const numberValue = value => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const getValue = (pairs, code, fallback = 0) => {
  const pair = pairs.find(item => item.code === code)
  return pair ? numberValue(pair.value) : fallback
}

const getText = (pairs, code, fallback = '') => {
  const pair = pairs.find(item => item.code === code)
  return pair ? pair.value : fallback
}

const sampleArc = (centerX, centerY, radius, startAngle, sweepAngle) => {
  const segments = Math.max(8, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 36)))
  const points = []

  for (let index = 0; index <= segments; index++) {
    const angle = startAngle + sweepAngle * (index / segments)
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    })
  }

  return points
}

const sampleBulge = (start, end, bulge) => {
  if (!bulge) return [start, end]

  const dx = end.x - start.x
  const dy = end.y - start.y
  const chord = Math.hypot(dx, dy)

  if (!chord) return [start]

  const sweep = 4 * Math.atan(bulge)
  const midpointX = (start.x + end.x) / 2
  const midpointY = (start.y + end.y) / 2
  const centerDistance = chord * (1 - bulge * bulge) / (4 * bulge)
  const centerX = midpointX - dy / chord * centerDistance
  const centerY = midpointY + dx / chord * centerDistance
  const radius = Math.hypot(start.x - centerX, start.y - centerY)
  const startAngle = Math.atan2(start.y - centerY, start.x - centerX)

  return sampleArc(centerX, centerY, radius, startAngle, sweep)
}

const expandPolyline = (vertices, closed) => {
  if (vertices.length < 2) return vertices.map(({ x, y }) => ({ x, y }))

  const points = []
  const segmentCount = closed ? vertices.length : vertices.length - 1

  for (let index = 0; index < segmentCount; index++) {
    const start = vertices[index]
    const end = vertices[(index + 1) % vertices.length]
    const segment = sampleBulge(start, end, start.bulge || 0)

    if (index > 0) segment.shift()
    points.push(...segment)
  }

  return points
}

const parsePairs = text => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const pairs = []

  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10)
    if (Number.isNaN(code)) continue
    pairs.push({ code, value: lines[index + 1].trim() })
  }

  return pairs
}

const getMillimeterFactor = pairs => {
  const unitsIndex = pairs.findIndex(pair => pair.code === 9 && pair.value === '$INSUNITS')
  if (unitsIndex < 0) return { factor: 1, units: 'мм (прийнято за замовчуванням)' }

  const unitsPair = pairs.slice(unitsIndex + 1, unitsIndex + 6)
    .find(pair => pair.code === 70)
  const unitsCode = unitsPair ? numberValue(unitsPair.value) : 0
  const unitMap = {
    0: [1, 'без одиниць — прийнято мм'],
    1: [25.4, 'дюйми → мм'],
    2: [304.8, 'фути → мм'],
    4: [1, 'мм'],
    5: [10, 'см → мм'],
    6: [1000, 'м → мм']
  }
  const [factor, units] = unitMap[unitsCode] || [1, `код одиниць ${unitsCode} — прийнято мм`]
  return { factor, units }
}

const getEntityBlocks = pairs => {
  const blocks = []
  let inEntities = false
  let current = null

  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index]

    if (pair.code === 0 && pair.value === 'SECTION') {
      const sectionName = pairs[index + 1]
      inEntities = Boolean(sectionName && sectionName.code === 2 && sectionName.value === 'ENTITIES')
      continue
    }

    if (inEntities && pair.code === 0 && pair.value === 'ENDSEC') {
      if (current) blocks.push(current)
      current = null
      inEntities = false
      continue
    }

    if (!inEntities) continue

    if (pair.code === 0) {
      if (current) blocks.push(current)
      current = { type: pair.value, pairs: [] }
    } else if (current) {
      current.pairs.push(pair)
    }
  }

  return blocks
}

const parseLwPolyline = block => {
  const vertices = []
  let current = null

  for (const pair of block.pairs) {
    if (pair.code === 10) {
      if (current) vertices.push(current)
      current = { x: numberValue(pair.value), y: 0, bulge: 0 }
    } else if (current && pair.code === 20) {
      current.y = numberValue(pair.value)
    } else if (current && pair.code === 42) {
      current.bulge = numberValue(pair.value)
    }
  }

  if (current) vertices.push(current)
  const flags = getValue(block.pairs, 70)
  const closed = Boolean(flags & 1)
  return { points: expandPolyline(vertices, closed), closed }
}

const parseEllipse = block => {
  const centerX = getValue(block.pairs, 10)
  const centerY = getValue(block.pairs, 20)
  const majorX = getValue(block.pairs, 11)
  const majorY = getValue(block.pairs, 21)
  const ratio = getValue(block.pairs, 40, 1)
  const start = getValue(block.pairs, 41, 0)
  let end = getValue(block.pairs, 42, TAU)
  if (end <= start) end += TAU
  const segments = Math.max(24, Math.ceil((end - start) / (Math.PI / 36)))
  const points = []

  for (let index = 0; index <= segments; index++) {
    const angle = start + (end - start) * (index / segments)
    points.push({
      x: centerX + majorX * Math.cos(angle) - majorY * ratio * Math.sin(angle),
      y: centerY + majorY * Math.cos(angle) + majorX * ratio * Math.sin(angle)
    })
  }

  return { points, closed: Math.abs(end - start - TAU) < 1e-6 }
}

const parseSpline = block => {
  const fitPoints = []
  const controlPoints = []
  let fitPoint = null
  let controlPoint = null

  for (const pair of block.pairs) {
    if (pair.code === 11) {
      if (fitPoint) fitPoints.push(fitPoint)
      fitPoint = { x: numberValue(pair.value), y: 0 }
    } else if (fitPoint && pair.code === 21) {
      fitPoint.y = numberValue(pair.value)
    } else if (pair.code === 10) {
      if (controlPoint) controlPoints.push(controlPoint)
      controlPoint = { x: numberValue(pair.value), y: 0 }
    } else if (controlPoint && pair.code === 20) {
      controlPoint.y = numberValue(pair.value)
    }
  }

  if (fitPoint) fitPoints.push(fitPoint)
  if (controlPoint) controlPoints.push(controlPoint)
  const flags = getValue(block.pairs, 70)
  return { points: fitPoints.length > 1 ? fitPoints : controlPoints, closed: Boolean(flags & 1) }
}

const scalePath = (path, factor) => ({
  ...path,
  points: path.points.map(point => ({ x: point.x * factor, y: point.y * factor }))
})

const pointDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y)

export const orderDxfContours = (paths, tolerance = 0.01) => {
  const unused = new Set(paths.map((_, index) => index))
  const contours = []

  while (unused.size) {
    const firstIndex = unused.values().next().value
    const firstPath = paths[firstIndex]
    const contourPoints = firstPath.points.map(point => ({ ...point }))
    const sourcePathIndexes = [firstIndex]
    unused.delete(firstIndex)

    if (!firstPath.closed) {
      let connected = true

      while (connected && unused.size) {
        connected = false
        const contourStart = contourPoints[0]
        const contourEnd = contourPoints[contourPoints.length - 1]

        for (const candidateIndex of unused) {
          const candidate = paths[candidateIndex]
          const candidateStart = candidate.points[0]
          const candidateEnd = candidate.points[candidate.points.length - 1]

          if (pointDistance(contourEnd, candidateStart) <= tolerance) {
            contourPoints.push(...candidate.points.slice(1).map(point => ({ ...point })))
          } else if (pointDistance(contourEnd, candidateEnd) <= tolerance) {
            contourPoints.push(...candidate.points.slice(0, -1).reverse().map(point => ({ ...point })))
          } else if (pointDistance(contourStart, candidateEnd) <= tolerance) {
            contourPoints.unshift(...candidate.points.slice(0, -1).map(point => ({ ...point })))
          } else if (pointDistance(contourStart, candidateStart) <= tolerance) {
            contourPoints.unshift(...candidate.points.slice(1).reverse().map(point => ({ ...point })))
          } else {
            continue
          }

          unused.delete(candidateIndex)
          sourcePathIndexes.push(candidateIndex)
          connected = true
          break
        }
      }
    }

    const closed = firstPath.closed
      || pointDistance(contourPoints[0], contourPoints[contourPoints.length - 1]) <= tolerance

    if (closed && pointDistance(contourPoints[0], contourPoints[contourPoints.length - 1]) <= tolerance) {
      contourPoints.pop()
    }

    contours.push({
      points: contourPoints,
      closed,
      sourcePathIndexes,
      sourcePathCount: sourcePathIndexes.length,
      tolerance
    })
  }

  return contours
}

export const resampleDxfContour = (contour, pointCount, startIndex = 0, reverse = false) => {
  const count = Math.max(2, Math.round(pointCount))
  const source = contour.points

  if (source.length < 2) return source.map(point => ({ ...point }))

  const normalizedStart = ((Math.round(startIndex) % source.length) + source.length) % source.length
  const ordered = []

  if (contour.closed) {
    for (let offset = 0; offset < source.length; offset++) {
      const direction = reverse ? -offset : offset
      const index = (normalizedStart + direction + source.length) % source.length
      ordered.push(source[index])
    }
    ordered.push(ordered[0])
  } else {
    const openSource = reverse ? [...source].reverse() : [...source]
    ordered.push(...openSource)
  }

  const cumulative = [0]

  for (let index = 1; index < ordered.length; index++) {
    cumulative.push(cumulative[index - 1] + pointDistance(ordered[index - 1], ordered[index]))
  }

  const totalLength = cumulative[cumulative.length - 1]
  if (!totalLength) return Array.from({ length: count }, () => ({ ...ordered[0] }))

  const result = []
  const divisor = contour.closed ? count : count - 1

  for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
    const targetDistance = totalLength * sampleIndex / divisor
    let segmentIndex = 1

    while (segmentIndex < cumulative.length - 1 && cumulative[segmentIndex] < targetDistance) {
      segmentIndex++
    }

    const segmentStartDistance = cumulative[segmentIndex - 1]
    const segmentEndDistance = cumulative[segmentIndex]
    const segmentLength = segmentEndDistance - segmentStartDistance
    const ratio = segmentLength ? (targetDistance - segmentStartDistance) / segmentLength : 0
    const start = ordered[segmentIndex - 1]
    const end = ordered[segmentIndex]

    result.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio
    })
  }

  return result
}

export const parseDxf = text => {
  const pairs = parsePairs(text)
  const blocks = getEntityBlocks(pairs)
  const unitInfo = getMillimeterFactor(pairs)
  const paths = []
  const unsupported = new Set()

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    let path = null

    if (block.type === 'LINE') {
      path = {
        points: [
          { x: getValue(block.pairs, 10), y: getValue(block.pairs, 20) },
          { x: getValue(block.pairs, 11), y: getValue(block.pairs, 21) }
        ],
        closed: false
      }
    } else if (block.type === 'LWPOLYLINE') {
      path = parseLwPolyline(block)
    } else if (block.type === 'POLYLINE') {
      const vertices = []
      const flags = getValue(block.pairs, 70)
      while (blocks[index + 1] && blocks[index + 1].type === 'VERTEX') {
        index++
        const vertexBlock = blocks[index]
        vertices.push({
          x: getValue(vertexBlock.pairs, 10),
          y: getValue(vertexBlock.pairs, 20),
          bulge: getValue(vertexBlock.pairs, 42)
        })
      }
      if (blocks[index + 1] && blocks[index + 1].type === 'SEQEND') index++
      const closed = Boolean(flags & 1)
      path = { points: expandPolyline(vertices, closed), closed }
    } else if (block.type === 'ARC') {
      const start = getValue(block.pairs, 50) * Math.PI / 180
      let end = getValue(block.pairs, 51) * Math.PI / 180
      if (end <= start) end += TAU
      path = {
        points: sampleArc(
          getValue(block.pairs, 10),
          getValue(block.pairs, 20),
          Math.abs(getValue(block.pairs, 40)),
          start,
          end - start
        ),
        closed: false
      }
    } else if (block.type === 'CIRCLE') {
      path = {
        points: sampleArc(
          getValue(block.pairs, 10),
          getValue(block.pairs, 20),
          Math.abs(getValue(block.pairs, 40)),
          0,
          TAU
        ),
        closed: true
      }
    } else if (block.type === 'ELLIPSE') {
      path = parseEllipse(block)
    } else if (block.type === 'SPLINE') {
      path = parseSpline(block)
    } else if (!['VERTEX', 'SEQEND'].includes(block.type)) {
      unsupported.add(block.type)
    }

    if (path && path.points.length > 1) {
      paths.push(scalePath({ ...path, layer: getText(block.pairs, 8, '0'), type: block.type }, unitInfo.factor))
    }
  }

  if (!paths.length) throw new Error('У DXF не знайдено підтримуваних 2D-об’єктів')

  const points = paths.flatMap(path => path.points)
  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const maxY = Math.max(...points.map(point => point.y))
  const contours = orderDxfContours(paths)

  return {
    paths,
    contours,
    bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
    units: unitInfo.units,
    unsupported: [...unsupported].sort()
  }
}

export const renderDxfPreview = (svg, model, options = {}) => {
  const namespace = 'http://www.w3.org/2000/svg'
  const { minX, minY, width, height } = model.bounds
  const padding = 40
  const scale = Math.min(720 / Math.max(width, 1), 420 / Math.max(height, 1))
  const toSvgPoint = point => ({
    x: padding + (point.x - minX) * scale,
    y: 460 - (point.y - minY) * scale
  })

  svg.replaceChildren()

  for (const path of model.paths) {
    const polyline = document.createElementNS(namespace, 'polyline')
    const points = path.closed && path.points.length
      ? [...path.points, path.points[0]]
      : path.points
    const svgPoints = points.map(point => {
      const svgPoint = toSvgPoint(point)
      return `${svgPoint.x},${svgPoint.y}`
    }).join(' ')

    polyline.setAttribute('points', svgPoints)
    polyline.setAttribute('fill', 'none')
    polyline.setAttribute('stroke', '#0f766e')
    polyline.setAttribute('stroke-width', '2')
    polyline.setAttribute('stroke-linejoin', 'round')
    polyline.setAttribute('stroke-linecap', 'round')
    polyline.dataset.entity = path.type
    polyline.dataset.layer = path.layer
    svg.appendChild(polyline)
  }

  if (options.contour?.points.length) {
    const contour = options.contour
    const activePolyline = document.createElementNS(namespace, 'polyline')
    const activePoints = contour.closed
      ? [...contour.points, contour.points[0]]
      : contour.points

    activePolyline.setAttribute('points', activePoints.map(point => {
      const svgPoint = toSvgPoint(point)
      return `${svgPoint.x},${svgPoint.y}`
    }).join(' '))
    activePolyline.setAttribute('fill', 'none')
    activePolyline.setAttribute('stroke', '#2563eb')
    activePolyline.setAttribute('stroke-width', '3')
    activePolyline.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(activePolyline)

    const startIndex = ((Math.round(options.startIndex || 0) % contour.points.length)
      + contour.points.length) % contour.points.length
    const nextOffset = options.reverse ? -1 : 1
    const nextIndex = (startIndex + nextOffset + contour.points.length) % contour.points.length
    const startPoint = toSvgPoint(contour.points[startIndex])
    const nextPoint = toSvgPoint(contour.points[nextIndex])
    const directionLength = Math.hypot(nextPoint.x - startPoint.x, nextPoint.y - startPoint.y)

    if (directionLength) {
      const direction = document.createElementNS(namespace, 'line')
      const visibleLength = Math.min(24, directionLength)
      direction.setAttribute('x1', startPoint.x)
      direction.setAttribute('y1', startPoint.y)
      direction.setAttribute('x2', startPoint.x + (nextPoint.x - startPoint.x) / directionLength * visibleLength)
      direction.setAttribute('y2', startPoint.y + (nextPoint.y - startPoint.y) / directionLength * visibleLength)
      direction.setAttribute('stroke', '#22c55e')
      direction.setAttribute('stroke-width', '4')
      direction.setAttribute('stroke-linecap', 'round')
      svg.appendChild(direction)
    }

    const startMarker = document.createElementNS(namespace, 'circle')
    startMarker.setAttribute('cx', startPoint.x)
    startMarker.setAttribute('cy', startPoint.y)
    startMarker.setAttribute('r', '6')
    startMarker.setAttribute('fill', '#22c55e')
    startMarker.setAttribute('stroke', '#14532d')
    startMarker.setAttribute('stroke-width', '2')
    svg.appendChild(startMarker)
  }
}
