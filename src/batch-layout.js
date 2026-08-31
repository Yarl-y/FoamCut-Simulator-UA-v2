const SVG_NS = 'http://www.w3.org/2000/svg'

const boundsOf = points => ({
  minX: Math.min(...points.map(point => point.x)),
  maxX: Math.max(...points.map(point => point.x)),
  minY: Math.min(...points.map(point => point.y)),
  maxY: Math.max(...points.map(point => point.y))
})

const translate = (points, dx, dy) => points.map(point => ({
  ...point,
  x: point.x + dx,
  y: point.y + dy
}))

const rotateQuarter = points => points?.map(point => ({
  ...point,
  x: -point.y,
  y: point.x
})) || null

const orientPart = (part, rotated) => rotated
  ? {
      ...part,
      outerLeft: rotateQuarter(part.outerLeft),
      outerRight: rotateQuarter(part.outerRight),
      innerLeft: rotateQuarter(part.innerLeft),
      innerRight: rotateQuarter(part.innerRight),
      cutLeft: rotateQuarter(part.cutLeft),
      cutRight: rotateQuarter(part.cutRight)
    }
  : part

export const createFuselageBatchLayout = (parts, settings = {}) => {
  const blockWidth = Number(settings.blockWidth) || 600
  const blockHeight = Number(settings.blockHeight) || 600
  const blockThickness = Number(settings.blockThickness) || 100
  const requestedColumns = parts.length
  const corridor = Math.max(0, Number(settings.corridor) || 0)
  if (!parts.length) throw new Error('У збірці немає видимих секцій фюзеляжу')
  if ([blockWidth, blockHeight, blockThickness].some(value => value <= 0)) {
    throw new Error('Розміри блока мають бути більшими за нуль')
  }

  const dimensionTolerance = 0.001
  parts.forEach(part => {
    if (Number(part.span) - blockThickness > dimensionTolerance) {
      throw new Error(`${part.name}: довжина секції ${Number(part.span).toFixed(1)} мм `
        + `більша за товщину блока ${blockThickness.toFixed(1)} мм`)
    }
  })

  const slotAssignments = settings.slotAssignments instanceof Map ? settings.slotAssignments : new Map()
  const measure = (sourcePart, rotated) => {
    const part = orientPart(sourcePart, rotated)
    const sourceBounds = boundsOf([...part.outerLeft, ...part.outerRight])
    const width = sourceBounds.maxX - sourceBounds.minX
    const height = sourceBounds.maxY - sourceBounds.minY
    return { part, sourceBounds, width, height, rotated }
  }
  const orderMeasured = measuredParts => {
    if (!slotAssignments.size) {
      return [...measuredParts].sort((first, second) => (
        second.height - first.height || second.width - first.width
      ))
    }
    const slots = Array(parts.length).fill(null)
    const unplaced = []
    measuredParts.forEach(measured => {
      const slot = slotAssignments.get(measured.part.id)
      if (slot == null) return unplaced.push(measured)
      const index = Math.floor(Number(slot))
      if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
        throw new Error(`${measured.part.name}: закріплене місце ${index + 1} поза доступними 1–${slots.length}`)
      }
      if (slots[index]) throw new Error(`Місце ${index + 1} закріплено одночасно за двома секціями`)
      slots[index] = measured
    })
    let unplacedIndex = 0
    for (let index = 0; index < slots.length && unplacedIndex < unplaced.length; index += 1) {
      if (!slots[index]) slots[index] = unplaced[unplacedIndex++]
    }
    return slots.filter(Boolean)
  }
  const packShelves = orderedParts => {
    const shelves = []
    for (const measured of orderedParts) {
      if (measured.width + corridor > blockWidth || measured.height + corridor > blockHeight) return null
      let shelf = shelves.find(candidate => (
        candidate.items.length < requestedColumns
        && candidate.usedWidth + measured.width <= blockWidth - corridor / 2
      ))
      if (!shelf) {
        shelf = { items: [], usedWidth: corridor / 2, height: measured.height }
        shelves.push(shelf)
      }
      shelf.items.push(measured)
      shelf.usedWidth += measured.width + corridor
      shelf.height = Math.max(shelf.height, measured.height)
    }
    const usedHeight = shelves.reduce((sum, shelf) => sum + shelf.height, 0) + corridor * shelves.length
    return usedHeight <= blockHeight ? { shelves, usedHeight } : null
  }
  const packFreeRectangles = orderedParts => {
    let freeRectangles = [{ x: 0, y: 0, width: blockWidth, height: blockHeight }]
    const placed = []
    const intersects = (first, second) => !(
      second.x >= first.x + first.width || second.x + second.width <= first.x
      || second.y >= first.y + first.height || second.y + second.height <= first.y
    )
    const containedBy = (inner, outer) => (
      inner.x >= outer.x && inner.y >= outer.y
      && inner.x + inner.width <= outer.x + outer.width
      && inner.y + inner.height <= outer.y + outer.height
    )
    for (const measured of orderedParts) {
      const packedWidth = measured.width + corridor
      const packedHeight = measured.height + corridor
      const choices = freeRectangles
        .map((rectangle, index) => ({
          rectangle, index,
          shortSide: Math.min(rectangle.width - packedWidth, rectangle.height - packedHeight),
          area: rectangle.width * rectangle.height - packedWidth * packedHeight
        }))
        .filter(choice => choice.shortSide >= 0)
        .sort((a, b) => a.shortSide - b.shortSide || a.area - b.area)
      if (!choices.length) return null
      const target = choices[0].rectangle
      const occupied = { x: target.x, y: target.y, width: packedWidth, height: packedHeight }
      placed.push({
        ...measured,
        packedX: occupied.x,
        packedY: occupied.y,
        centerX: occupied.x + corridor / 2 + measured.width / 2,
        centerY: occupied.y + corridor / 2 + measured.height / 2
      })
      const split = []
      freeRectangles.forEach(rectangle => {
        if (!intersects(rectangle, occupied)) return split.push(rectangle)
        if (occupied.x > rectangle.x) split.push({
          x: rectangle.x, y: rectangle.y,
          width: occupied.x - rectangle.x, height: rectangle.height
        })
        if (occupied.x + occupied.width < rectangle.x + rectangle.width) split.push({
          x: occupied.x + occupied.width, y: rectangle.y,
          width: rectangle.x + rectangle.width - occupied.x - occupied.width, height: rectangle.height
        })
        if (occupied.y > rectangle.y) split.push({
          x: rectangle.x, y: rectangle.y,
          width: rectangle.width, height: occupied.y - rectangle.y
        })
        if (occupied.y + occupied.height < rectangle.y + rectangle.height) split.push({
          x: rectangle.x, y: occupied.y + occupied.height,
          width: rectangle.width, height: rectangle.y + rectangle.height - occupied.y - occupied.height
        })
      })
      freeRectangles = split.filter((rectangle, index) => (
        rectangle.width > 0 && rectangle.height > 0
        && !split.some((other, otherIndex) => otherIndex !== index && containedBy(rectangle, other))
      ))
    }
    const laneLevels = [...new Set(placed.map(item => item.packedY))].sort((a, b) => b - a)
    const shelves = laneLevels.map(level => ({
      items: placed.filter(item => item.packedY === level).sort((a, b) => a.packedX - b.packedX),
      height: Math.max(...placed.filter(item => item.packedY === level).map(item => item.height)),
      usedWidth: Math.max(...placed.filter(item => item.packedY === level).map(item => item.packedX + item.width))
    }))
    const positionedParts = []
    shelves.forEach((shelf, row) => shelf.items.forEach((item, column) => {
      positionedParts.push({ ...item, row, column })
    }))
    return { shelves, positionedParts }
  }
  const packBacktracking = () => {
    const sourceOrder = [...parts].sort((first, second) => {
      const firstBounds = boundsOf([...first.outerLeft, ...first.outerRight])
      const secondBounds = boundsOf([...second.outerLeft, ...second.outerRight])
      const firstArea = (firstBounds.maxX - firstBounds.minX) * (firstBounds.maxY - firstBounds.minY)
      const secondArea = (secondBounds.maxX - secondBounds.minX) * (secondBounds.maxY - secondBounds.minY)
      return secondArea - firstArea
    })
    const placed = []
    let visited = 0
    const limit = parts.length <= 10 ? 250000 : 50000
    const overlaps = candidate => placed.some(item => !(
      candidate.x >= item.x + item.measured.width + corridor
      || candidate.x + candidate.measured.width + corridor <= item.x
      || candidate.y >= item.y + item.measured.height + corridor
      || candidate.y + candidate.measured.height + corridor <= item.y
    ))
    const search = index => {
      if (index === sourceOrder.length) return true
      if (++visited > limit) return false
      const source = sourceOrder[index]
      const orientations = [measure(source, false), measure(source, true)]
        .filter((item, itemIndex, all) => itemIndex === 0 || item.width !== all[0].width || item.height !== all[0].height)
        .sort((a, b) => b.width - a.width)
      const xPositions = [...new Set([corridor / 2, ...placed.map(item => item.x + item.measured.width + corridor)])]
        .sort((a, b) => a - b)
      const yPositions = [...new Set([corridor / 2, ...placed.map(item => item.y + item.measured.height + corridor)])]
        .sort((a, b) => a - b)
      for (const measured of orientations) {
        for (const y of yPositions) {
          for (const x of xPositions) {
            if (x + measured.width + corridor / 2 > blockWidth || y + measured.height + corridor / 2 > blockHeight) continue
            const candidate = { x, y, measured }
            if (overlaps(candidate)) continue
            placed.push(candidate)
            if (search(index + 1)) return true
            placed.pop()
          }
        }
      }
      return false
    }
    if (!search(0)) return null
    const laneLevels = [...new Set(placed.map(item => item.y))].sort((a, b) => b - a)
    const shelves = laneLevels.map(level => ({
      items: placed.filter(item => item.y === level).map(item => item.measured),
      height: Math.max(...placed.filter(item => item.y === level).map(item => item.measured.height)),
      usedWidth: Math.max(...placed.filter(item => item.y === level).map(item => item.x + item.measured.width))
    }))
    const positionedParts = []
    laneLevels.forEach((level, row) => {
      placed.filter(item => item.y === level).sort((a, b) => a.x - b.x).forEach((item, column) => {
        positionedParts.push({
          ...item.measured, row, column,
          centerX: item.x + item.measured.width / 2,
          centerY: item.y + item.measured.height / 2
        })
      })
    })
    return { shelves, positionedParts, score: 0 }
  }

  const orientationCount = parts.length <= 12 ? 2 ** parts.length : 2
  let bestPacking = null
  for (let mask = 0; mask < orientationCount; mask += 1) {
    const measured = parts.map((part, index) => measure(part, Boolean(mask & (1 << index))))
    const orderCandidates = slotAssignments.size
      ? [orderMeasured(measured)]
      : [
          [...measured].sort((a, b) => b.height - a.height || b.width - a.width),
          [...measured].sort((a, b) => b.width - a.width || b.height - a.height),
          [...measured].sort((a, b) => b.width * b.height - a.width * a.height)
        ]
    for (const ordered of orderCandidates) {
      const packed = packShelves(ordered)
      if (!packed) continue
      const occupiedWidth = Math.max(...packed.shelves.map(shelf => shelf.usedWidth), 0)
      const score = packed.usedHeight * blockWidth + occupiedWidth
      if (!bestPacking || score < bestPacking.score) bestPacking = { ...packed, ordered, score }
    }
  }
  if (!bestPacking) {
    for (let mask = 0; mask < orientationCount; mask += 1) {
      const measured = parts.map((part, index) => measure(part, Boolean(mask & (1 << index))))
      const orderCandidates = slotAssignments.size
        ? [orderMeasured(measured)]
        : [
            [...measured].sort((a, b) => b.width * b.height - a.width * a.height),
            [...measured].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height)),
            [...measured].sort((a, b) => b.height - a.height || b.width - a.width)
          ]
      for (const ordered of orderCandidates) {
        const packed = packFreeRectangles(ordered)
        if (!packed) continue
        const top = Math.max(...packed.positionedParts.map(item => item.packedY + item.height + corridor))
        const right = Math.max(...packed.positionedParts.map(item => item.packedX + item.width + corridor))
        const score = top * blockWidth + right
        if (!bestPacking || score < bestPacking.score) bestPacking = { ...packed, ordered, score }
      }
    }
  }
  if (!bestPacking && !slotAssignments.size) bestPacking = packBacktracking()
  if (!bestPacking) {
    throw new Error(`не вистачає місця для ${parts.length} секцій навіть з автоповоротом 90°`)
  }
  const { shelves } = bestPacking

  let positionedParts = bestPacking.positionedParts
  if (!positionedParts) {
    let topY = blockHeight - corridor / 2
    positionedParts = []
    shelves.forEach((shelf, row) => {
      let leftX = corridor / 2
      shelf.items.forEach((measured, column) => {
        const centerX = leftX + measured.width / 2
        const centerY = topY - shelf.height / 2
        positionedParts.push({ ...measured, row, column, centerX, centerY })
        leftX += measured.width + corridor
      })
      topY -= shelf.height + corridor
    })
  }

  const spreadRowsAcrossBlock = sourceItems => {
    const rows = [...new Set(sourceItems.map(item => item.row))].sort((a, b) => a - b)
    if (!rows.length) return sourceItems
    const rowData = rows.map(row => {
      const items = sourceItems.filter(item => item.row === row).sort((a, b) => a.column - b.column)
      return { row, items, height: Math.max(...items.map(item => item.height)) }
    })
    const totalHeight = rowData.reduce((sum, row) => sum + row.height, 0)
    const rowGap = Math.max(50, corridor * 2)
    const occupiedHeight = totalHeight + rowGap * Math.max(0, rowData.length - 1)
    const outsideSpace = blockHeight - occupiedHeight
    if (outsideSpace < corridor) return sourceItems
    const bottomMargin = Math.min(rowGap, outsideSpace - corridor / 2)
    let bottomY = bottomMargin
    const rowCenters = new Map()
    ;[...rowData].reverse().forEach(row => {
      rowCenters.set(row.row, bottomY + row.height / 2)
      bottomY += row.height + rowGap
    })
    return sourceItems.map(item => {
      const row = rowData.find(candidate => candidate.row === item.row)
      const totalWidth = row.items.reduce((sum, candidate) => sum + candidate.width, 0)
      const horizontalGap = (blockWidth - totalWidth) / (row.items.length + 1)
      if (horizontalGap < corridor / 2) return { ...item, centerY: rowCenters.get(item.row) }
      let leftX = horizontalGap
      const centers = new Map()
      row.items.forEach(candidate => {
        centers.set(candidate.part.id, leftX + candidate.width / 2)
        leftX += candidate.width + horizontalGap
      })
      return {
        ...item,
        centerX: centers.get(item.part.id),
        centerY: rowCenters.get(item.row)
      }
    })
  }

  positionedParts = spreadRowsAcrossBlock(positionedParts)

  const items = positionedParts.map(({ part, sourceBounds, width, height, rotated, row, column, centerX, centerY }, slotIndex) => {
    const dx = centerX - (sourceBounds.minX + sourceBounds.maxX) / 2
    const dy = centerY - (sourceBounds.minY + sourceBounds.maxY) / 2
    return {
      part,
      index: slotIndex,
      row, column, rotated,
      dx,
      dy,
      outerLeft: translate(part.outerLeft, dx, dy),
      outerRight: translate(part.outerRight, dx, dy),
      innerLeft: part.innerLeft ? translate(part.innerLeft, dx, dy) : null,
      innerRight: part.innerRight ? translate(part.innerRight, dx, dy) : null,
      cutLeft: translate(part.cutLeft, dx, dy),
      cutRight: translate(part.cutRight, dx, dy),
      bounds: {
        minX: sourceBounds.minX + dx,
        maxX: sourceBounds.maxX + dx,
        minY: sourceBounds.minY + dy,
        maxY: sourceBounds.maxY + dy
      }
    }
  })

  const rows = shelves.length
  const columns = Math.max(1, ...shelves.map(shelf => shelf.items.length))
  const slotRects = items.map(item => ({
    index: item.index,
    minX: Math.max(0, item.bounds.minX - corridor / 2),
    maxX: Math.min(blockWidth, item.bounds.maxX + corridor / 2),
    minY: Math.max(0, item.bounds.minY - corridor / 2),
    maxY: Math.min(blockHeight, item.bounds.maxY + corridor / 2)
  }))
  const rowLanes = shelves.map((shelf, row) => {
    const rowItems = items.filter(item => item.row === row)
    return Math.max(corridor / 2, Math.min(...rowItems.map(item => item.bounds.minY)) - corridor / 2)
  })
  return {
    blockWidth, blockHeight, blockThickness, columns, rows, corridor, items, slotRects, rowLanes,
    cellWidth: blockWidth / columns, cellHeight: blockHeight / rows, adaptive: true
  }
}

export const createMultiBlockLayouts = (
  parts,
  blocks,
  corridor = 20,
  assignments = new Map(),
  slotAssignments = new Map()
) => {
  if (!blocks.length) throw new Error('Додайте хоча б один піноблок')
  const preparedParts = parts.map((part, sourceIndex) => ({ ...part, batchSourceIndex: sourceIndex }))
  let remaining = preparedParts.filter(part => !assignments.get(part.id))
  const rejectionReasons = new Map()
  const layouts = []

  for (const block of blocks) {
    const selected = preparedParts.filter(part => assignments.get(part.id) === block.id)
    if (selected.length) {
      try {
        createFuselageBatchLayout(selected, {
          blockWidth: block.width, blockHeight: block.height, blockThickness: block.thickness,
          columns: block.columns, corridor
        })
      } catch (error) {
        throw new Error(`${block.name}: закріплені секції не поміщаються — ${error.message}`)
      }
    }
    const deferred = []
    for (const part of remaining) {
      try {
        createFuselageBatchLayout([...selected, part], {
          blockWidth: block.width,
          blockHeight: block.height,
          blockThickness: block.thickness,
          columns: block.columns,
          corridor
        })
        selected.push(part)
      } catch (error) {
        deferred.push(part)
        rejectionReasons.set(part.id, error.message)
      }
    }
    remaining = deferred
    if (selected.length) {
      layouts.push({
        ...createFuselageBatchLayout(selected, {
          blockWidth: block.width,
          blockHeight: block.height,
          blockThickness: block.thickness,
          columns: block.columns,
          corridor,
          slotAssignments
        }),
        block
      })
    } else {
      layouts.push({ block, items: [], blockWidth: block.width, blockHeight: block.height,
        blockThickness: block.thickness, columns: block.columns, rows: 0, corridor })
    }
  }

  if (remaining.length) {
    throw new Error(`Не вистачає блоків для ${remaining.length} секц.: `
      + remaining.map(part => `${part.name} (${rejectionReasons.get(part.id) || 'не помістилася'})`).join('; '))
  }
  return layouts
}

const sectionNumber = item => (Number.isInteger(item.part.batchSourceIndex)
  ? item.part.batchSourceIndex
  : item.index) + 1

const addSvg = (parent, tag, attributes, text = '') => {
  const element = document.createElementNS(SVG_NS, tag)
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value))
  if (text) element.textContent = text
  parent.appendChild(element)
  return element
}

export const renderBatchLayoutPreview = (svg, layout, side) => {
  svg.replaceChildren()
  svg.setAttribute('viewBox', `0 0 ${layout.blockWidth} ${layout.blockHeight}`)
  addSvg(svg, 'rect', {
    x: 0, y: 0, width: layout.blockWidth, height: layout.blockHeight,
    fill: '#fef3c7', stroke: '#92400e', 'stroke-width': 2
  })
  if (layout.adaptive) {
    layout.slotRects.forEach(rect => addSvg(svg, 'rect', {
      x: rect.minX, y: layout.blockHeight - rect.maxY,
      width: rect.maxX - rect.minX, height: rect.maxY - rect.minY,
      fill: 'none', stroke: '#a16207', 'stroke-width': 1, 'stroke-dasharray': '7 5'
    }))
  } else {
    for (let column = 1; column < layout.columns; column += 1) {
      addSvg(svg, 'line', {
        x1: column * layout.cellWidth, y1: 0, x2: column * layout.cellWidth, y2: layout.blockHeight,
        stroke: '#a16207', 'stroke-width': 1, 'stroke-dasharray': '7 5'
      })
    }
    for (let row = 1; row < layout.rows; row += 1) {
      addSvg(svg, 'line', {
        x1: 0, y1: row * layout.cellHeight, x2: layout.blockWidth, y2: row * layout.cellHeight,
        stroke: '#a16207', 'stroke-width': 1, 'stroke-dasharray': '7 5'
      })
    }
  }

  const stroke = side === 'left' ? '#2563eb' : '#dc2626'
  for (const item of layout.items) {
    const group = addSvg(svg, 'g', {
      'data-batch-part-id': item.part.id,
      'data-batch-slot': item.index,
      class: 'batch-layout-item'
    })
    addSvg(group, 'rect', {
      x: item.bounds.minX,
      y: layout.blockHeight - item.bounds.maxY,
      width: Math.max(1, item.bounds.maxX - item.bounds.minX),
      height: Math.max(1, item.bounds.maxY - item.bounds.minY),
      fill: 'transparent', stroke: 'none'
    })
    const points = side === 'left' ? item.outerLeft : item.outerRight
    const screenPoints = [...points, points[0]].map(point => `${point.x},${layout.blockHeight - point.y}`).join(' ')
    addSvg(group, 'polyline', {
      points: screenPoints, fill: 'none', stroke, 'stroke-width': 2,
      'vector-effect': 'non-scaling-stroke'
    })
    const innerPoints = side === 'left' ? item.innerLeft : item.innerRight
    if (innerPoints?.length) {
      addSvg(group, 'polyline', {
        points: [...innerPoints, innerPoints[0]]
          .map(point => `${point.x},${layout.blockHeight - point.y}`).join(' '),
        fill: 'none', stroke: '#7c3aed', 'stroke-width': 1.6, 'stroke-dasharray': '5 3',
        'vector-effect': 'non-scaling-stroke'
      })
    }
    addSvg(group, 'text', {
      x: item.bounds.minX + 4,
      y: layout.blockHeight - item.bounds.maxY + 15,
      fill: '#111827', 'font-size': 12, 'font-weight': 700
    }, `${sectionNumber(item)}. ${item.part.name}${item.rotated ? ' · 90°' : ''}`)
  }
}

const nearestIndex = (points, target) => points.reduce((best, point, index) => {
  const distance = Math.hypot(point.x - target.x, point.y - target.y)
  return distance < best.distance ? { index, distance } : best
}, { index: 0, distance: Infinity }).index

const rotateContour = (points, index) => [
  ...points.slice(index),
  ...points.slice(0, index)
]

const permutations = items => {
  if (items.length < 2) return [items]
  return items.flatMap((item, index) => permutations([
    ...items.slice(0, index), ...items.slice(index + 1)
  ]).map(rest => [item, ...rest]))
}

const translatedItem = (item, dx, dy) => {
  const move = points => points?.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) || null
  return {
    ...item,
    dx: item.dx + dx,
    dy: item.dy + dy,
    outerLeft: move(item.outerLeft),
    outerRight: move(item.outerRight),
    innerLeft: move(item.innerLeft),
    innerRight: move(item.innerRight),
    cutLeft: move(item.cutLeft),
    cutRight: move(item.cutRight),
    bounds: {
      minX: item.bounds.minX + dx,
      maxX: item.bounds.maxX + dx,
      minY: item.bounds.minY + dy,
      maxY: item.bounds.maxY + dy
    }
  }
}

const carriageBounds = (item, setup) => {
  const leftFactor = setup.leftGap / setup.blockWidth
  const rightFactor = setup.rightGap / setup.blockWidth
  const projected = []
  item.cutLeft.forEach((left, index) => {
    const right = item.cutRight[index]
    projected.push(
      {
        x: left.x - (right.x - left.x) * leftFactor,
        y: left.y - (right.y - left.y) * leftFactor
      },
      {
        x: right.x + (right.x - left.x) * rightFactor,
        y: right.y + (right.y - left.y) * rightFactor
      }
    )
  })
  return boundsOf(projected)
}

export const optimizeBatchLayoutForCarriages = (layout, setup, limits = {}, requestedMargin = 10) => {
  const limitX = Math.min(Number(limits.x) || 600, Number(limits.a) || 600)
  const limitY = Math.min(Number(limits.y) || 600, Number(limits.z) || 600)
  const marginX = Math.min(Math.max(0, requestedMargin), limitX / 4)
  const marginY = Math.min(Math.max(0, requestedMargin), limitY / 4)
  const rows = [...new Set(layout.items.map(item => item.row))]
  const optimized = []

  for (const rowIndex of rows) {
    const rowItems = layout.items.filter(item => item.row === rowIndex)
    let best = null
    for (const order of permutations(rowItems)) {
      let previousRight = -Infinity
      const placed = []
      let valid = true
      for (const item of order) {
        const machine = carriageBounds(item, setup)
        const machineMinOffset = machine.minX - item.bounds.minX
        const machineMaxOffset = machine.maxX - item.bounds.minX
        const width = item.bounds.maxX - item.bounds.minX
        const minimumLeft = Math.max(
          layout.corridor / 2,
          marginX - machineMinOffset,
          previousRight + layout.corridor
        )
        const maximumLeft = Math.min(
          layout.blockWidth - layout.corridor / 2 - width,
          limitX - marginX - machineMaxOffset
        )
        if (minimumLeft > maximumLeft + 0.0005) {
          valid = false
          break
        }
        placed.push({ item, left: minimumLeft, maximumLeft })
        previousRight = minimumLeft + width
      }
      if (!valid) continue
      const usedWidth = previousRight + layout.corridor / 2
      if (!best || usedWidth < best.usedWidth) best = { placed, usedWidth }
    }
    if (!best) throw new Error(`ряд ${rowIndex + 1} не вміщується у ходи X/A після компенсації`)

    let nextLeft = Infinity
    for (let index = best.placed.length - 1; index >= 0; index -= 1) {
      const entry = best.placed[index]
      const width = entry.item.bounds.maxX - entry.item.bounds.minX
      entry.latestLeft = Math.min(entry.maximumLeft, nextLeft - layout.corridor - width)
      nextLeft = entry.latestLeft
    }
    best.placed.forEach((entry, column) => {
      const targetLeft = (entry.left + entry.latestLeft) / 2
      optimized.push({
        ...translatedItem(entry.item, targetLeft - entry.item.bounds.minX, 0),
        column
      })
    })
  }

  const verticallyAdjusted = []
  for (const rowIndex of rows) {
    const rowItems = optimized.filter(item => item.row === rowIndex)
    const machine = rowItems.map(item => carriageBounds(item, setup))
    const minimumMachineY = Math.min(...machine.map(bounds => bounds.minY))
    const maximumMachineY = Math.max(...machine.map(bounds => bounds.maxY))
    const minimumFaceY = Math.min(...rowItems.map(item => item.bounds.minY))
    const maximumFaceY = Math.max(...rowItems.map(item => item.bounds.maxY))
    const minimumDy = Math.max(marginY - minimumMachineY, layout.corridor / 2 - minimumFaceY)
    const maximumDy = Math.min(
      limitY - marginY - maximumMachineY,
      layout.blockHeight - layout.corridor / 2 - maximumFaceY
    )
    if (minimumDy > maximumDy + 0.0005) {
      throw new Error(`ряд ${rowIndex + 1} не вміщується у ходи Y/Z після компенсації`)
    }
    const dy = Math.max(minimumDy, Math.min(0, maximumDy))
    rowItems.forEach(item => verticallyAdjusted.push(translatedItem(item, 0, dy)))
  }

  verticallyAdjusted.sort((first, second) => first.row - second.row || first.column - second.column)
  verticallyAdjusted.forEach((item, index) => { item.index = index })
  const slotRects = verticallyAdjusted.map(item => ({
    index: item.index,
    minX: Math.max(0, item.bounds.minX - layout.corridor / 2),
    maxX: Math.min(layout.blockWidth, item.bounds.maxX + layout.corridor / 2),
    minY: Math.max(0, item.bounds.minY - layout.corridor / 2),
    maxY: Math.min(layout.blockHeight, item.bounds.maxY + layout.corridor / 2)
  }))
  const rowLanes = rows.map(row => Math.max(
    layout.corridor / 2,
    Math.min(...verticallyAdjusted.filter(item => item.row === row).map(item => item.bounds.minY)) - layout.corridor / 2
  ))
  return { ...layout, items: verticallyAdjusted, slotRects, rowLanes, carriageOptimized: true }
}

export const createBatchCutRoute = layout => {
  const orderedItems = [...layout.items].sort((first, second) => {
    if (first.row !== second.row) return first.row - second.row
    return first.row % 2 === 0
      ? first.column - second.column
      : second.column - first.column
  })
  const edgeInset = Math.max(1, layout.corridor / 2)
  const home = { x: edgeInset, y: edgeInset }
  const events = []
  const addMove = (left, right = left, comment = '') => events.push({
    left: { ...left }, right: { ...right }, comment
  })
  addMove(home, home, 'Безпечна початкова точка')
  let currentRow = layout.rows - 1

  orderedItems.forEach((item, orderIndex) => {
    const laneY = layout.rowLanes?.[item.row]
      ?? layout.blockHeight - (item.row + 1) * layout.cellHeight + edgeInset
    const rowEntryX = item.row % 2 === 0 ? edgeInset : layout.blockWidth - edgeInset
    if (orderIndex === 0 || item.row !== currentRow) {
      const transitionX = orderIndex === 0
        ? edgeInset
        : (currentRow % 2 === 0 ? layout.blockWidth - edgeInset : edgeInset)
      if (events.at(-1).left.x !== transitionX || events.at(-1).right.x !== transitionX) {
        addMove({ x: transitionX, y: events.at(-1).left.y }, { x: transitionX, y: events.at(-1).right.y })
      }
      addMove({ x: transitionX, y: laneY }, { x: transitionX, y: laneY }, `Перехід у ряд ${item.row + 1}`)
      if (transitionX !== rowEntryX) addMove({ x: rowEntryX, y: laneY }, { x: rowEntryX, y: laneY })
      currentRow = item.row
    }

    let leftCut = item.cutLeft.map(point => ({ ...point }))
    let rightCut = item.cutRight.map(point => ({ ...point }))
    const preliminaryPortalLeft = { x: leftCut[0].x, y: laneY }
    const preliminaryPortalRight = { x: rightCut[0].x, y: laneY }
    if (!item.innerLeft && !item.innerRight) {
      const startIndex = nearestIndex(leftCut, preliminaryPortalLeft)
      leftCut = rotateContour(leftCut, startIndex)
      rightCut = rotateContour(rightCut, startIndex)
    }
    const portalLeft = { x: leftCut[0].x, y: laneY }
    const portalRight = { x: rightCut[0].x, y: laneY }
    addMove(portalLeft, portalRight, `Секція ${sectionNumber(item)}: ${item.part.name}${item.rotated ? ', поворот 90°' : ''}`)
    addMove(leftCut[0], rightCut[0], 'Вхід у деталь')
    for (let index = 1; index < leftCut.length; index += 1) {
      addMove(leftCut[index], rightCut[index])
    }
    addMove(leftCut[0], rightCut[0], 'Замикання контуру')
    addMove(portalLeft, portalRight, 'Безпечний вихід у коридор')
  })

  const finalLaneY = events.at(-1).left.y
  const finalEdgeX = orderedItems.at(-1).row % 2 === 0
    ? layout.blockWidth - edgeInset
    : edgeInset
  addMove({ x: finalEdgeX, y: finalLaneY }, { x: finalEdgeX, y: finalLaneY }, 'Вихід із останнього ряду')
  addMove({ x: finalEdgeX, y: edgeInset }, { x: finalEdgeX, y: edgeInset })
  addMove(home, home, 'Повернення на початок')
  return { events, orderedItems, home }
}

const formatNumber = value => (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)

export const createBatchMach3Nc = (events, feedRate, setup = null) => {
  const lines = [
    '%',
    '(FoamCut Simulator - batch fuselage sections)',
    '(Metric units, absolute coordinates)',
    'G21',
    'G90',
    'G94',
    `F${formatNumber(feedRate)}`
  ]
  if (setup) {
    lines.splice(3, 0, `(Block setup: wire ${formatNumber(setup.wireSpan)} mm, `
      + `left gap ${formatNumber(setup.leftGap)} mm, block ${formatNumber(setup.blockWidth)} mm, `
      + `right gap ${formatNumber(setup.rightGap)} mm)`)
  }
  let previous = ''
  for (const event of events) {
    if (event.comment) lines.push(`(${event.comment.replace(/[()]/g, '')})`)
    const movement = `G1 X${formatNumber(event.left.x)} Y${formatNumber(event.left.y)} `
      + `A${formatNumber(event.right.x)} Z${formatNumber(event.right.y)}`
    if (movement !== previous) lines.push(movement)
    previous = movement
  }
  lines.push('M30', '%')
  return `${lines.join('\n')}\n`
}

export const renderBatchRouteOverlay = (svg, route, blockHeight, side) => {
  const points = route.events.map(event => side === 'left' ? event.left : event.right)
  addSvg(svg, 'polyline', {
    points: points.map(point => `${point.x},${blockHeight - point.y}`).join(' '),
    fill: 'none', stroke: '#16a34a', 'stroke-width': 1.4, 'stroke-dasharray': '4 3',
    'stroke-opacity': 0.72, 'vector-effect': 'non-scaling-stroke'
  })
  addSvg(svg, 'circle', {
    cx: route.home.x, cy: blockHeight - route.home.y, r: 4,
    fill: '#16a34a', stroke: '#ffffff', 'stroke-width': 1.5,
    'vector-effect': 'non-scaling-stroke'
  })
}

const xmlEscape = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

const mapPolyline = (points, originX, originY, scale, blockHeight) => points
  .map(point => `${(originX + point.x * scale).toFixed(2)},${(originY + (blockHeight - point.y) * scale).toFixed(2)}`)
  .join(' ')

export const createBatchSetupMapSvg = (layout, route, options = {}) => {
  const pageWidth = 1400
  const pageHeight = 980
  const panelWidth = 650
  const panelHeight = 600
  const panelTop = 165
  const margin = 35
  const scale = Math.min(panelWidth / layout.blockWidth, panelHeight / layout.blockHeight)
  const drawingWidth = layout.blockWidth * scale
  const drawingHeight = layout.blockHeight * scale
  const blockNumber = Number(options.blockNumber) || 1
  const ncFileName = options.ncFileName || `foamcut-fuselage-block-${String(blockNumber).padStart(2, '0')}.nc`
  const setup = options.blockSetup
  const setupText = setup
    ? `Струна ${setup.wireSpan.toFixed(1)} мм · лівий проміжок ${setup.leftGap.toFixed(1)} мм · правий ${setup.rightGap.toFixed(1)} мм`
    : 'Компенсація положення блока вимкнена'
  const fragments = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">`,
    `<rect width="100%" height="100%" fill="white"/>`,
    `<text x="${pageWidth / 2}" y="42" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700">Карта встановлення — ${xmlEscape(layout.block.name)}</text>`,
    `<text x="${pageWidth / 2}" y="75" text-anchor="middle" font-family="Arial" font-size="18">Блок ${layout.blockWidth} × ${layout.blockHeight} × ${layout.blockThickness} мм · коридор ${layout.corridor} мм · ${layout.items.length} секц.</text>`,
    `<text x="${pageWidth / 2}" y="104" text-anchor="middle" font-family="Arial" font-size="17">NC: ${xmlEscape(ncFileName)}</text>`,
    `<text x="${pageWidth / 2}" y="132" text-anchor="middle" font-family="Arial" font-size="16">${xmlEscape(setupText)}</text>`
  ]

  const addPanel = (side, title, originX, color) => {
    const originY = panelTop
    fragments.push(`<text x="${originX + drawingWidth / 2}" y="${originY - 14}" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="${color}">${title}</text>`)
    fragments.push(`<rect x="${originX}" y="${originY}" width="${drawingWidth}" height="${drawingHeight}" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>`)
    if (layout.adaptive) {
      layout.slotRects.forEach(rect => {
        const x = originX + rect.minX * scale
        const y = originY + (layout.blockHeight - rect.maxY) * scale
        fragments.push(`<rect x="${x}" y="${y}" width="${(rect.maxX - rect.minX) * scale}" height="${(rect.maxY - rect.minY) * scale}" fill="none" stroke="#a16207" stroke-dasharray="7 5"/>`)
      })
    } else {
      for (let column = 1; column < layout.columns; column += 1) {
        const x = originX + column * layout.cellWidth * scale
        fragments.push(`<line x1="${x}" y1="${originY}" x2="${x}" y2="${originY + drawingHeight}" stroke="#a16207" stroke-dasharray="7 5"/>`)
      }
      for (let row = 1; row < layout.rows; row += 1) {
        const y = originY + row * layout.cellHeight * scale
        fragments.push(`<line x1="${originX}" y1="${y}" x2="${originX + drawingWidth}" y2="${y}" stroke="#a16207" stroke-dasharray="7 5"/>`)
      }
    }
    const routePoints = route.events.map(event => side === 'left' ? event.left : event.right)
    fragments.push(`<polyline points="${mapPolyline(routePoints, originX, originY, scale, layout.blockHeight)}" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 4"/>`)
    layout.items.forEach(item => {
      const points = side === 'left' ? item.outerLeft : item.outerRight
      const inner = side === 'left' ? item.innerLeft : item.innerRight
      fragments.push(`<polyline points="${mapPolyline([...points, points[0]], originX, originY, scale, layout.blockHeight)}" fill="none" stroke="${color}" stroke-width="2.2"/>`)
      if (inner?.length) fragments.push(`<polyline points="${mapPolyline([...inner, inner[0]], originX, originY, scale, layout.blockHeight)}" fill="none" stroke="#7c3aed" stroke-width="1.8" stroke-dasharray="5 3"/>`)
      const bounds = boundsOf(points)
      const labelX = originX + bounds.minX * scale + 4
      const labelY = originY + (layout.blockHeight - bounds.maxY) * scale + 17
      fragments.push(`<text x="${labelX}" y="${labelY}" font-family="Arial" font-size="13" font-weight="700">${sectionNumber(item)}</text>`)
    })
    const startX = originX + route.home.x * scale
    const startY = originY + (layout.blockHeight - route.home.y) * scale
    fragments.push(`<circle cx="${startX}" cy="${startY}" r="6" fill="#16a34a" stroke="white" stroke-width="2"/>`)
    fragments.push(`<text x="${startX + 9}" y="${startY - 8}" font-family="Arial" font-size="13" font-weight="700" fill="#166534">СТАРТ ${route.home.x.toFixed(1)}; ${route.home.y.toFixed(1)} мм</text>`)
  }

  addPanel('left', 'Ліва грань X/Y', margin, '#2563eb')
  addPanel('right', 'Права грань A/Z', pageWidth - margin - drawingWidth, '#dc2626')
  const listTop = panelTop + drawingHeight + 32
  fragments.push(`<text x="${margin}" y="${listTop}" font-family="Arial" font-size="17" font-weight="700">Секції та координати нижньої лівої межі:</text>`)
  layout.items.forEach((item, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = margin + column * 680
    const y = listTop + 28 + row * 25
    const leftBounds = boundsOf(item.outerLeft)
    const rightBounds = boundsOf(item.outerRight)
    const type = item.innerLeft || item.innerRight ? 'порожниста' : 'суцільна'
    fragments.push(`<text x="${x}" y="${y}" font-family="Arial" font-size="14">${sectionNumber(item)}. ${xmlEscape(item.part.name)} · ${type}${item.rotated ? ' · поворот 90°' : ''} · X/Y ${leftBounds.minX.toFixed(1)};${leftBounds.minY.toFixed(1)} · A/Z ${rightBounds.minX.toFixed(1)};${rightBounds.minY.toFixed(1)} мм</text>`)
  })
  fragments.push(`<text x="${pageWidth / 2}" y="${pageHeight - 22}" text-anchor="middle" font-family="Arial" font-size="13" fill="#475569">Зелений пунктир — безпечний маршрут; фіолетовий пунктир — внутрішній контур, який ріжеться першим.</text>`)
  fragments.push('</svg>')
  return `${fragments.join('\n')}\n`
}
