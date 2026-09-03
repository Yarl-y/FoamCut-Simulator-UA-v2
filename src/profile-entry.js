const boundsOf = points => ({
  minX: Math.min(...points.map(point => point.x)),
  maxX: Math.max(...points.map(point => point.x)),
  minY: Math.min(...points.map(point => point.y)),
  maxY: Math.max(...points.map(point => point.y))
})

export function orientProfile(points, orientation = 'none', pivot = null) {
  if (!points.length || orientation === 'none') return points.map(point => ({ ...point }))
  const bounds = boundsOf(points)
  const centerX = pivot?.x ?? (bounds.minX + bounds.maxX) / 2
  const centerY = pivot?.y ?? (bounds.minY + bounds.maxY) / 2
  return points.map(point => {
    const dx = point.x - centerX
    const dy = point.y - centerY
    if (orientation === 'rotate180') return { x: centerX - dx, y: centerY - dy }
    if (orientation === 'mirrorX') return { x: centerX - dx, y: point.y }
    if (orientation === 'mirrorY') return { x: point.x, y: centerY - dy }
    return { ...point }
  })
}

// Preserve correspondence through orientation and start-point changes.
export function preparePairedProfiles(left, right, orientation, side, autoStart) {
  if (!left.length || left.length !== right.length) throw new Error('Кількість парних точок не збігається')
  const bounds = boundsOf([...left, ...right])
  const pivot = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  let leftPoints = orientProfile(left, orientation, pivot)
  let rightPoints = orientProfile(right, orientation, pivot)
  if (autoStart) {
    const first = startProfileAtSide(leftPoints, side)[0]
    const index = leftPoints.findIndex(point => point.x === first.x && point.y === first.y)
    const rotate = points => [...points.slice(index), ...points.slice(0, index)]
    leftPoints = rotate(leftPoints)
    rightPoints = rotate(rightPoints)
  }
  return { leftPoints, rightPoints }
}

export function chooseEntrySide(leftPoints, rightPoints, block = {}) {
  const bounds = boundsOf([...leftPoints, ...rightPoints])
  const offsetX = Math.max(0, Number(block.offsetX) || 0)
  const offsetY = Math.max(0, Number(block.offsetY) || 0)
  const length = Math.max(0, Number(block.length) || bounds.maxX + offsetX)
  const height = Math.max(0, Number(block.height) || bounds.maxY + offsetY)
  const clearances = {
    left: bounds.minX + offsetX,
    right: length - (bounds.maxX + offsetX),
    bottom: bounds.minY + offsetY,
    top: height - (bounds.maxY + offsetY)
  }
  return Object.entries(clearances).sort((a, b) => a[1] - b[1])[0][0]
}

export function startProfileAtSide(points, side = 'right') {
  if (points.length < 2) return points.map(point => ({ ...point }))
  const values = points.map(point => side === 'left' || side === 'right' ? point.x : point.y)
  const target = side === 'left' || side === 'bottom' ? Math.min(...values) : Math.max(...values)
  const candidates = points.map((point, index) => ({ point, index })).filter(item => {
    const value = side === 'left' || side === 'right' ? item.point.x : item.point.y
    return Math.abs(value - target) <= 1e-7
  })
  const index = candidates.sort((a, b) => {
    if (side === 'left' || side === 'right') return a.point.y - b.point.y
    return a.point.x - b.point.x
  })[0]?.index || 0
  return [...points.slice(index), ...points.slice(0, index)].map(point => ({ ...point }))
}

export function createSafeLeadPoint(point, distance, side = 'right') {
  const amount = Math.max(0, Number(distance) || 0)
  if (side === 'left') return { x: point.x - amount, y: point.y }
  if (side === 'top') return { x: point.x, y: point.y + amount }
  if (side === 'bottom') return { x: point.x, y: point.y - amount }
  return { x: point.x + amount, y: point.y }
}
