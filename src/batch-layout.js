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

  parts.forEach(part => {
    if (Number(part.span) > blockThickness) {
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
    throw new Error(`не вистачає місця для ${parts.length} секцій навіть з автоповоротом 90°`)
  }
  const { shelves } = bestPacking

  let topY = blockHeight - corridor / 2
  const positionedParts = []
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
      } catch {
        deferred.push(part)
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
    throw new Error(`Не вистачає блоків для ${remaining.length} секц.: ${remaining.map(part => part.name).join(', ')}`)
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
