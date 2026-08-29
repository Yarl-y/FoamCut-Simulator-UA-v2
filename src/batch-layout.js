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

export const createFuselageBatchLayout = (parts, settings = {}) => {
  const blockWidth = Number(settings.blockWidth) || 600
  const blockHeight = Number(settings.blockHeight) || 600
  const blockThickness = Number(settings.blockThickness) || 100
  const columns = Math.max(1, Math.floor(Number(settings.columns) || 3))
  const corridor = Math.max(0, Number(settings.corridor) || 0)
  if (!parts.length) throw new Error('У збірці немає видимих секцій фюзеляжу')
  if ([blockWidth, blockHeight, blockThickness].some(value => value <= 0)) {
    throw new Error('Розміри блока мають бути більшими за нуль')
  }

  const rows = Math.ceil(parts.length / columns)
  const cellWidth = blockWidth / columns
  const cellHeight = blockHeight / rows
  const availableWidth = cellWidth - corridor
  const availableHeight = cellHeight - corridor
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error('Безпечний коридор завеликий для вибраної сітки')
  }

  const items = parts.map((part, index) => {
    if (Number(part.span) > blockThickness) {
      throw new Error(`${part.name}: довжина секції ${Number(part.span).toFixed(1)} мм `
        + `більша за товщину блока ${blockThickness.toFixed(1)} мм`)
    }
    const sourcePoints = [...part.outerLeft, ...part.outerRight]
    const sourceBounds = boundsOf(sourcePoints)
    const width = sourceBounds.maxX - sourceBounds.minX
    const height = sourceBounds.maxY - sourceBounds.minY
    if (width > availableWidth || height > availableHeight) {
      throw new Error(`${part.name}: потрібно ${width.toFixed(1)}×${height.toFixed(1)} мм, `
        + `доступно ${availableWidth.toFixed(1)}×${availableHeight.toFixed(1)} мм`)
    }
    const column = index % columns
    const row = Math.floor(index / columns)
    const centerX = column * cellWidth + cellWidth / 2
    const centerY = blockHeight - (row * cellHeight + cellHeight / 2)
    const dx = centerX - (sourceBounds.minX + sourceBounds.maxX) / 2
    const dy = centerY - (sourceBounds.minY + sourceBounds.maxY) / 2
    return {
      part,
      index,
      row,
      column,
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

  return { blockWidth, blockHeight, blockThickness, columns, rows, corridor, cellWidth, cellHeight, items }
}

export const createMultiBlockLayouts = (parts, blocks, corridor = 20) => {
  if (!blocks.length) throw new Error('Додайте хоча б один піноблок')
  let remaining = parts.map((part, sourceIndex) => ({ ...part, batchSourceIndex: sourceIndex }))
  const layouts = []

  for (const block of blocks) {
    const selected = []
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
          corridor
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

  const stroke = side === 'left' ? '#2563eb' : '#dc2626'
  for (const item of layout.items) {
    const points = side === 'left' ? item.outerLeft : item.outerRight
    const screenPoints = [...points, points[0]].map(point => `${point.x},${layout.blockHeight - point.y}`).join(' ')
    addSvg(svg, 'polyline', {
      points: screenPoints, fill: 'none', stroke, 'stroke-width': 2,
      'vector-effect': 'non-scaling-stroke'
    })
    const innerPoints = side === 'left' ? item.innerLeft : item.innerRight
    if (innerPoints?.length) {
      addSvg(svg, 'polyline', {
        points: [...innerPoints, innerPoints[0]]
          .map(point => `${point.x},${layout.blockHeight - point.y}`).join(' '),
        fill: 'none', stroke: '#7c3aed', 'stroke-width': 1.6, 'stroke-dasharray': '5 3',
        'vector-effect': 'non-scaling-stroke'
      })
    }
    addSvg(svg, 'text', {
      x: item.bounds.minX + 4,
      y: layout.blockHeight - item.bounds.maxY + 15,
      fill: '#111827', 'font-size': 12, 'font-weight': 700
    }, `${item.index + 1}. ${item.part.name}`)
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
    const laneY = layout.blockHeight - (item.row + 1) * layout.cellHeight + edgeInset
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
    addMove(portalLeft, portalRight, `Секція ${item.index + 1}: ${item.part.name}`)
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
