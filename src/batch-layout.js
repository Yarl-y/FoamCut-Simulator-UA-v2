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
