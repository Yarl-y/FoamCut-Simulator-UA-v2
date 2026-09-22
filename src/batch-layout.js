import { createPairedHollowCutPath, insertPairedSparHoles } from './profile-library.js'

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

const transformQuarter = (points, turns = 0, mirrorX = false, mirrorY = false) => {
  let result = points?.map(point => ({ ...point,
    x: mirrorX ? -point.x : point.x,
    y: mirrorY ? -point.y : point.y
  })) || null
  for (let turn = 0; turn < turns; turn += 1) result = rotateQuarter(result)
  return result
}

const centerXOf = points => {
  const bounds = boundsOf(points)
  return (bounds.minX + bounds.maxX) / 2
}

const alignFuselageFaces = part => {
  if (part.kind !== 'fuselage') return part
  const leftShift = -centerXOf(part.outerLeft)
  const rightShift = -centerXOf(part.outerRight)
  const shift = (points, dx) => points?.map(point => ({ ...point, x: point.x + dx })) || null
  return {
    ...part,
    outerLeft: shift(part.outerLeft, leftShift),
    outerRight: shift(part.outerRight, rightShift),
    innerLeft: shift(part.innerLeft, leftShift),
    innerRight: shift(part.innerRight, rightShift),
    cutLeft: shift(part.cutLeft, leftShift),
    cutRight: shift(part.cutRight, rightShift),
    sparHolePairs: part.sparHolePairs?.map(hole => ({
      left: shift(hole.left, leftShift), right: shift(hole.right, rightShift)
    }))
  }
}

const orientPartManual = (sourcePart, turns = 0, mirrorX = false, mirrorY = false) => {
  const part = alignFuselageFaces(sourcePart)
  const move = points => transformQuarter(points, turns, mirrorX, mirrorY)
  const oriented = turns || mirrorX || mirrorY ? {
    ...part,
    outerLeft: move(part.outerLeft), outerRight: move(part.outerRight),
    innerLeft: move(part.innerLeft), innerRight: move(part.innerRight),
    cutLeft: move(part.cutLeft), cutRight: move(part.cutRight),
    sparHolePairs: part.sparHolePairs?.map(hole => ({ left: move(hole.left), right: move(hole.right) }))
  } : part
  if (oriented.straightSparRods?.length && !oriented.sparHolePairs?.length) {
    throw new Error(`${oriented.name}: отвори трубок відсутні в даних секції; NC заблоковано`)
  }
  if (!oriented.innerLeft || !oriented.innerRight) return oriented
  // Rebuild after rotation: rotating the old cut would leave the cavity entry
  // on the old bottom, which is now a side of the section.
  const hollow = createPairedHollowCutPath(
    oriented.outerLeft, oriented.outerRight, oriented.innerLeft, oriented.innerRight
  )
  const cut = oriented.sparHolePairs?.length
    ? insertPairedSparHoles(hollow.leftPoints, hollow.rightPoints, oriented.sparHolePairs)
    : hollow
  return { ...oriented, cutLeft: cut.leftPoints, cutRight: cut.rightPoints }
}

const orientPart = (sourcePart, rotated) => orientPartManual(sourcePart, rotated ? 1 : 0)

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
    throw new Error(`не вистачає місця для ${parts.length} секцій з обраним зазором`)
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

// Placement only. Positions are chosen from the edges of already placed
// envelopes, not from a row/column grid. Cutting order is deliberately absent.
export const createFreeFuselageLayout = (parts, settings = {}) => {
  const blockWidth = Number(settings.blockWidth)
  const blockHeight = Number(settings.blockHeight)
  const blockThickness = Number(settings.blockThickness)
  const corridor = Math.max(0, Number(settings.corridor) || 0)
  if (!parts.length) throw new Error('У збірці немає видимих секцій фюзеляжу')
  if (![blockWidth, blockHeight, blockThickness].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Розміри блока мають бути більшими за нуль')
  }
  const margin = corridor / 2
  const variants = parts.map(source => {
    if (Number(source.span) - blockThickness > 0.001) {
      throw new Error(`${source.name}: довжина секції більша за товщину блока`)
    }
    return [false, true].map(rotated => {
      const part = orientPart(source, rotated)
      const sourceBounds = boundsOf([...part.outerLeft, ...part.outerRight])
      return {
        part, rotated, sourceBounds,
        width: sourceBounds.maxX - sourceBounds.minX,
        height: sourceBounds.maxY - sourceBounds.minY
      }
    }).filter((variant, index, all) => index === 0
      || Math.abs(variant.width - all[0].width) > 0.001
      || Math.abs(variant.height - all[0].height) > 0.001)
  })
  for (const choices of variants) {
    if (!choices.some(choice => choice.width + corridor <= blockWidth + 0.001
      && choice.height + corridor <= blockHeight + 0.001)) {
      throw new Error(`${choices[0].part.name}: секція не вміщується у блок навіть після повороту`)
    }
  }

  const indices = parts.map((_, index) => index)
  const area = index => variants[index][0].width * variants[index][0].height
  const orders = [
    [...indices].sort((a, b) => area(b) - area(a)),
    [...indices].sort((a, b) => Math.max(variants[b][0].width, variants[b][0].height)
      - Math.max(variants[a][0].width, variants[a][0].height)),
    [...indices].sort((a, b) => variants[b][0].height - variants[a][0].height),
    [...indices].sort((a, b) => variants[b][0].width - variants[a][0].width),
    indices
  ]
  const score = placed => {
    const maxX = Math.max(margin, ...placed.map(item => item.x + item.variant.width))
    const maxY = Math.max(margin, ...placed.map(item => item.y + item.variant.height))
    return (maxX - margin) * (maxY - margin) + maxY * 0.01 + maxX * 0.001
  }
  const fits = (candidate, placed) => candidate.x >= margin - 0.001
    && candidate.y >= margin - 0.001
    && candidate.x + candidate.variant.width <= blockWidth - margin + 0.001
    && candidate.y + candidate.variant.height <= blockHeight - margin + 0.001
    && placed.every(other => (
      candidate.x >= other.x + other.variant.width + corridor - 0.001
      || other.x >= candidate.x + candidate.variant.width + corridor - 0.001
      || candidate.y >= other.y + other.variant.height + corridor - 0.001
      || other.y >= candidate.y + candidate.variant.height + corridor - 0.001
    ))
  let best = null
  for (const order of orders) {
    let beam = [[]]
    for (const index of order) {
      const next = []
      for (const placed of beam) {
        for (const variant of variants[index]) {
          const xs = new Set([margin])
          const ys = new Set([margin])
          placed.forEach(other => {
            xs.add(other.x + other.variant.width + corridor)
            xs.add(other.x - variant.width - corridor)
            ys.add(other.y + other.variant.height + corridor)
            ys.add(other.y - variant.height - corridor)
          })
          for (const x of xs) for (const y of ys) {
            const candidate = { index, variant, x, y }
            if (fits(candidate, placed)) next.push([...placed, candidate])
          }
        }
      }
      if (!next.length) { beam = []; break }
      next.sort((a, b) => score(a) - score(b))
      beam = next.slice(0, 24)
    }
    if (beam.length && (!best || score(beam[0]) < score(best))) best = beam[0]
  }
  if (!best) throw new Error(`не знайдено розкладки для ${parts.length} секцій із зазором ${corridor} мм`)
  // Keep the geometry unchanged, but spend unused block area on wider passages.
  // Expanding offsets (never shrinking them) preserves every proven clearance.
  const minPlacedX = Math.min(...best.map(item => item.x))
  const minPlacedY = Math.min(...best.map(item => item.y))
  const stretch = (axis, minimum, limit) => {
    const candidates = best.filter(item => item[axis] > minimum + 0.001)
    if (!candidates.length) return 1
    return Math.max(1, Math.min(...candidates.map(item => (
      (limit - margin - item.variant[axis === 'x' ? 'width' : 'height'] - minimum)
        / (item[axis] - minimum)
    ))))
  }
  const stretchX = stretch('x', minPlacedX, blockWidth)
  const stretchY = stretch('y', minPlacedY, blockHeight)
  const items = best.map(({ variant, x: packedX, y: packedY }, index) => {
    const x = margin + (packedX - minPlacedX) * stretchX
    const y = margin + (packedY - minPlacedY) * stretchY
    const { part, sourceBounds, rotated } = variant
    const dx = x - sourceBounds.minX
    const dy = y - sourceBounds.minY
    return {
      part, index, row: null, column: null, rotated, dx, dy,
      sourcePart: parts[best[index].index],
      outerLeft: translate(part.outerLeft, dx, dy),
      outerRight: translate(part.outerRight, dx, dy),
      innerLeft: part.innerLeft ? translate(part.innerLeft, dx, dy) : null,
      innerRight: part.innerRight ? translate(part.innerRight, dx, dy) : null,
      cutLeft: translate(part.cutLeft, dx, dy),
      cutRight: translate(part.cutRight, dx, dy),
      bounds: { minX: x, maxX: x + variant.width, minY: y, maxY: y + variant.height }
    }
  })
  return {
    blockWidth, blockHeight, blockThickness, corridor, items,
    freePlacement: true, adaptive: true, rows: 0, columns: 0, rowLanes: [],
    slotRects: items.map(item => ({
      index: item.index,
      minX: Math.max(0, item.bounds.minX - margin),
      maxX: Math.min(blockWidth, item.bounds.maxX + margin),
      minY: Math.max(0, item.bounds.minY - margin),
      maxY: Math.min(blockHeight, item.bounds.maxY + margin)
    }))
  }
}

export const applyManualFuselageLayout = (layout, placements = new Map()) => {
  if (!layout.freePlacement) throw new Error('Ручний розклад працює з вільною розкладкою')
  const margin = layout.corridor / 2
  const items = layout.items.map(item => {
    const setting = placements.get(item.part.id)
    if (!setting) return item
    const source = item.sourcePart || item.part
    const turns = ((Math.floor(Number(setting.turns) || 0) % 4) + 4) % 4
    const mirrorX = Boolean(setting.mirrorX)
    const mirrorY = Boolean(setting.mirrorY)
    const part = orientPartManual(source, turns, mirrorX, mirrorY)
    const sourceBounds = boundsOf([...part.outerLeft, ...part.outerRight])
    const centerX = Number(setting.centerX)
    const centerY = Number(setting.centerY)
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      throw new Error(`${part.name}: ручні координати некоректні`)
    }
    const dx = centerX - (sourceBounds.minX + sourceBounds.maxX) / 2
    const dy = centerY - (sourceBounds.minY + sourceBounds.maxY) / 2
    return {
      ...item, part, dx, dy, rotated: turns % 2 === 1,
      manualTurns: turns, manualMirrorX: mirrorX, manualMirrorY: mirrorY,
      outerLeft: translate(part.outerLeft, dx, dy), outerRight: translate(part.outerRight, dx, dy),
      innerLeft: part.innerLeft ? translate(part.innerLeft, dx, dy) : null,
      innerRight: part.innerRight ? translate(part.innerRight, dx, dy) : null,
      cutLeft: translate(part.cutLeft, dx, dy), cutRight: translate(part.cutRight, dx, dy),
      bounds: {
        minX: sourceBounds.minX + dx, maxX: sourceBounds.maxX + dx,
        minY: sourceBounds.minY + dy, maxY: sourceBounds.maxY + dy
      }
    }
  })
  for (const item of items) {
    if (item.bounds.minX < margin - 0.001 || item.bounds.maxX > layout.blockWidth - margin + 0.001
      || item.bounds.minY < margin - 0.001 || item.bounds.maxY > layout.blockHeight - margin + 0.001) {
      throw new Error(`${item.part.name}: секція виходить за межі блока із запасом ${margin} мм`)
    }
  }
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      const a = items[first].bounds
      const b = items[second].bounds
      if (!(a.minX >= b.maxX + layout.corridor - 0.001
        || b.minX >= a.maxX + layout.corridor - 0.001
        || a.minY >= b.maxY + layout.corridor - 0.001
        || b.minY >= a.maxY + layout.corridor - 0.001)) {
        throw new Error(`${items[first].part.name} і ${items[second].part.name}: перетин або коридор менший за ${layout.corridor} мм`)
      }
    }
  }
  return { ...layout, items, manualPlacement: true,
    slotRects: items.map(item => ({ index: item.index,
      minX: Math.max(0, item.bounds.minX - margin), maxX: Math.min(layout.blockWidth, item.bounds.maxX + margin),
      minY: Math.max(0, item.bounds.minY - margin), maxY: Math.min(layout.blockHeight, item.bounds.maxY + margin)
    })) }
}

export const createMultiBlockLayouts = (
  parts,
  blocks,
  corridor = 20,
  assignments = new Map(),
  slotAssignments = new Map(),
  options = {}
) => {
  const freePlacement = options.placementMode === 'free' || options.placementMode === 'manual'
  const createLayout = freePlacement ? createFreeFuselageLayout : createFuselageBatchLayout
  if (!blocks.length) throw new Error('Додайте хоча б один піноблок')
  const preparedParts = parts.map((part, sourceIndex) => ({ ...part, batchSourceIndex: sourceIndex }))
  let remaining = preparedParts.filter(part => !assignments.get(part.id))
  const rejectionReasons = new Map()
  const layouts = []

  for (const block of blocks) {
    const selected = preparedParts.filter(part => assignments.get(part.id) === block.id)
    if (selected.length) {
      try {
        createLayout(selected, {
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
        createLayout([...selected, part], {
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
      const layout = createLayout(selected, {
          blockWidth: block.width,
          blockHeight: block.height,
          blockThickness: block.thickness,
          columns: block.columns,
          corridor,
          slotAssignments
        })
      layouts.push({
        ...(options.placementMode === 'manual'
          ? applyManualFuselageLayout(layout, options.manualPlacements || new Map()) : layout),
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
  const outside = layout.manualPlacement ? 5 : 0
  svg.setAttribute('viewBox', `${-outside} ${-outside} ${layout.blockWidth + outside * 2} ${layout.blockHeight + outside * 2}`)
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
    for (const hole of item.part.sparHolePairs || []) {
      const holePoints = side === 'left' ? hole.left : hole.right
      if (!holePoints?.length) continue
      const located = holePoints.map(point => ({ x: point.x + item.dx, y: point.y + item.dy }))
      addSvg(group, 'polyline', {
        points: [...located, located[0]]
          .map(point => `${point.x},${layout.blockHeight - point.y}`).join(' '),
        fill: 'none', stroke: '#047857', 'stroke-width': 2.5,
        'vector-effect': 'non-scaling-stroke'
      })
    }
    addSvg(group, 'text', {
      x: item.bounds.minX + 4,
      y: layout.blockHeight - item.bounds.maxY + 15,
      fill: '#111827', 'font-size': 12, 'font-weight': 700
    }, `${sectionNumber(item)}. ${item.part.name}`
      + (item.manualTurns ? ` · ${item.manualTurns * 90}°` : item.rotated ? ' · 90°' : '')
      + (item.manualMirrorX || item.manualMirrorY ? ' · переверн.' : ''))
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
  const addMove = (left, right = left, comment = '') => {
    const previous = events.at(-1)
    if (previous && previous.left.x === left.x && previous.left.y === left.y
      && previous.right.x === right.x && previous.right.y === right.y) return
    events.push({ left: { ...left }, right: { ...right }, comment })
  }
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
    addMove(leftCut[0], rightCut[0], item.innerLeft ? 'Короткий вхід знизу до порожнини' : 'Вхід у деталь')
    for (let index = 1; index < leftCut.length; index += 1) {
      let comment = ''
      const hasSparHoleRoute = Boolean(item.part.straightSparRods?.length)
      const hasKnownInternalRoute = item.innerLeft || item.innerRight || hasSparHoleRoute
      if (hasKnownInternalRoute && index >= 2) {
        const previousDelta = [
          leftCut[index - 1].x - leftCut[index - 2].x, leftCut[index - 1].y - leftCut[index - 2].y,
          rightCut[index - 1].x - rightCut[index - 2].x, rightCut[index - 1].y - rightCut[index - 2].y
        ]
        const currentDelta = [
          leftCut[index].x - leftCut[index - 1].x, leftCut[index].y - leftCut[index - 1].y,
          rightCut[index].x - rightCut[index - 1].x, rightCut[index].y - rightCut[index - 1].y
        ]
        const lengths = [Math.hypot(...previousDelta), Math.hypot(...currentDelta)]
        const cosine = previousDelta.reduce((sum, value, axis) => sum + value * currentDelta[axis], 0) / Math.max(lengths[0] * lengths[1], 1e-9)
        const angle = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI
        const controlledReturnThreshold = hasSparHoleRoute ? 135 : 170
        if (angle >= controlledReturnThreshold) comment = 'Контрольоване повернення по входу'
      }
      addMove(leftCut[index], rightCut[index], comment)
    }
    addMove(leftCut[0], rightCut[0], 'Одне замикання зовнішнього контуру')
    addMove(portalLeft, portalRight, 'Вихід тією ж стежкою у коридор')
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

const pointInsideContour = (point, polygon) => {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]
    const b = polygon[previous]
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

const manualCutFromApproach = (item, approach, hint = null) => {
  const leftOuter = item.outerLeft
  const rightOuter = item.outerRight
  if (!leftOuter.length || leftOuter.length !== rightOuter.length) {
    throw new Error(`${item.part.name}: зовнішні контури X/Y та A/Z не синхронні`)
  }
  const visible = (start, end, contour) => {
    for (let index = 1; index < 20; index += 1) {
      const ratio = index / 20
      if (pointInsideContour({ x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio }, contour)) return false
    }
    return true
  }
  const side = hint?.side === 'right' ? 'right' : 'left'
  const candidates = leftOuter.map((left, index) => {
    const right = rightOuter[index]
    if (!visible(approach, left, leftOuter) || !visible(approach, right, rightOuter)) return null
    const closest = side === 'left' ? left : right
    const hintDistance = hint && Number.isFinite(hint.x) && Number.isFinite(hint.y)
      ? Math.hypot(closest.x - hint.x, closest.y - hint.y) : 0
    return { index, score: Math.max(Math.hypot(left.x - approach.x, left.y - approach.y),
      Math.hypot(right.x - approach.x, right.y - approach.y)) + hintDistance * 2 }
  }).filter(Boolean).sort((a, b) => a.score - b.score)
  if (!candidates.length) throw new Error(`${item.part.name}: з вибраної точки немає прямого видимого входу до профілю`)
  const outerStartIndex = candidates[0].index
  const outerLeft = leftOuter[outerStartIndex]
  const outerRight = rightOuter[outerStartIndex]
  if (!item.innerLeft || !item.innerRight) {
    const left = rotateContour(leftOuter, outerStartIndex)
    const right = rotateContour(rightOuter, outerStartIndex)
    const holes = item.part.sparHolePairs?.map(hole => ({
      left: translate(hole.left, item.dx, item.dy), right: translate(hole.right, item.dx, item.dy)
    })) || []
    const cut = holes.length ? insertPairedSparHoles(left, right, holes) : { leftPoints: left, rightPoints: right }
    return { left: cut.leftPoints, right: cut.rightPoints, outerStartIndex }
  }
  if (item.innerLeft.length !== item.innerRight.length) {
    throw new Error(`${item.part.name}: внутрішні контури X/Y та A/Z не синхронні`)
  }
  const innerCandidates = item.innerLeft.map((left, index) => {
    const right = item.innerRight[index]
    const wallOnly = (outerPoint, innerPoint, outerContour, innerContour) => {
      for (let step = 1; step < 20; step += 1) {
        const ratio = step / 20
        const point = { x: outerPoint.x + (innerPoint.x - outerPoint.x) * ratio,
          y: outerPoint.y + (innerPoint.y - outerPoint.y) * ratio }
        if (!pointInsideContour(point, outerContour) || pointInsideContour(point, innerContour)) return false
      }
      return true
    }
    if (!wallOnly(outerLeft, left, leftOuter, item.innerLeft)
      || !wallOnly(outerRight, right, rightOuter, item.innerRight)) return null
    return { index, score: Math.max(Math.hypot(left.x - outerLeft.x, left.y - outerLeft.y),
      Math.hypot(right.x - outerRight.x, right.y - outerRight.y)) }
  }).filter(Boolean).sort((a, b) => a.score - b.score)
  if (!innerCandidates.length) throw new Error(`${item.part.name}: не знайдено короткої щілини до порожнини`)
  const cut = createPairedHollowCutPath(leftOuter, rightOuter, item.innerLeft, item.innerRight, {
    outerStartIndex, innerStartIndex: innerCandidates[0].index
  })
  const holes = item.part.sparHolePairs?.map(hole => ({
    left: translate(hole.left, item.dx, item.dy), right: translate(hole.right, item.dx, item.dy)
  })) || []
  const withHoles = holes.length ? insertPairedSparHoles(cut.leftPoints, cut.rightPoints, holes) : cut
  return { left: withHoles.leftPoints, right: withHoles.rightPoints, outerStartIndex }
}

export const rebaseManualRouteMargin = (steps, blockWidth, blockHeight, from = 20, to = 5) => {
  if (!Array.isArray(steps) || !Number.isFinite(blockWidth) || !Number.isFinite(blockHeight)) {
    throw new Error('Немає коректного маршруту для оновлення')
  }
  if (steps.some(step => step.type === 'trimBottom')) {
    throw new Error('Старе нижнє торцювання треба видалити з маршруту вручну')
  }
  let changed = 0
  const remap = (value, maximum) => {
    if (Math.abs(value + from) < 0.51) { changed += 1; return -to }
    if (Math.abs(value - maximum - from) < 0.51) { changed += 1; return maximum + to }
    return value
  }
  return { steps: steps.map(step => step.type === 'point'
    ? { ...step, x: remap(Number(step.x), blockWidth), y: remap(Number(step.y), blockHeight) }
    : { ...step }), changed }
}

// Experimental free-layout router. A rectilinear visibility grid is built from
// actual section envelopes, not rows. Every portal must be reachable without
// entering another section's envelope; otherwise no NC may be produced.
export const createFreeBatchRoute = (layout, options = {}) => {
  if (!layout.freePlacement) throw new Error('Цей пошук маршруту призначений для вільної розкладки')
  const items = layout.items
  if (!items.length) throw new Error('У блоці немає секцій')
  const clearance = Math.max(1, layout.corridor / 8)
  const laneGap = Math.max(clearance + 0.5, layout.corridor / 2)
  const manualSteps = Array.isArray(options.steps) ? options.steps : null
  const outsideMargin = manualSteps ? 5 : 0
  const home = manualSteps ? { x: -outsideMargin, y: -outsideMargin } : { x: 0, y: 0 }
  const exitSteps = (manualSteps || []).filter(step => step.type === 'exitBottom')
  if (exitSteps.length > 1 || (exitSteps.length && manualSteps.at(-1).type !== 'exitBottom')) {
    throw new Error('Вихід униз може бути лише останнім кроком маршруту')
  }
  const exitPoint = exitSteps.length ? { x: layout.blockWidth + outsideMargin, y: -outsideMargin } : null
  const manualPortals = new Map()
  if (manualSteps) {
    let approach = home
    manualSteps.forEach(step => {
      if (step.type === 'point') approach = { x: Number(step.x), y: Number(step.y) }
      if (step.type === 'home') approach = home
      if (step.type === 'section') manualPortals.set(String(step.partId), approach)
    })
  }
  const portals = items.map(item => {
    const firstLeft = item.cutLeft[0]
    const firstRight = item.cutRight[0]
    if (!firstLeft || !firstRight || item.cutLeft.length !== item.cutRight.length) {
      throw new Error(`${item.part.name}: несинхронні профілі X/Y та A/Z`)
    }
    if (!manualSteps && Math.abs(firstLeft.y - firstRight.y) > 0.5) {
      throw new Error(`${item.part.name}: початок X/Y та A/Z не на одній висоті — горизонтальний вхід неможливий`)
    }
    if (manualSteps) return manualPortals.get(String(item.part.id)) || home
    const y = item.bounds.minY - laneGap
    if (y < -0.001) throw new Error(`${item.part.name}: під входом немає місця для коридору`)
    return { x: (firstLeft.x + firstRight.x) / 2, y }
  })
  const waypoints = (manualSteps || []).filter(step => step.type === 'point').map(step => ({
    x: Number(step.x), y: Number(step.y)
  }))
  if (exitPoint) waypoints.push(exitPoint)
  const outsidePoint = waypoints.find(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < -outsideMargin || point.x > layout.blockWidth + outsideMargin
    || point.y < -outsideMargin || point.y > layout.blockHeight + outsideMargin)
  if (outsidePoint) {
    throw new Error(`Контрольна точка (${outsidePoint.x}; ${outsidePoint.y}) поза полем −${outsideMargin}…${layout.blockWidth + outsideMargin} / −${outsideMargin}…${layout.blockHeight + outsideMargin} мм. Якщо це старий маршрут 20 мм, натисніть «Оновити відступ 20→5»`)
  }
  const unique = values => [...new Set(values.filter(Number.isFinite).map(value => +value.toFixed(4)))].sort((a, b) => a - b)
  const xs = unique([-outsideMargin, 0, layout.blockWidth, layout.blockWidth + outsideMargin,
    ...portals.map(point => point.x), ...waypoints.map(point => point.x),
    ...items.flatMap(item => [item.bounds.minX - clearance - 0.1, item.bounds.maxX + clearance + 0.1])])
    .filter(value => value >= -outsideMargin && value <= layout.blockWidth + outsideMargin)
  const ys = unique([-outsideMargin, 0, layout.blockHeight, layout.blockHeight + outsideMargin,
    ...portals.map(point => point.y), ...waypoints.map(point => point.y),
    ...items.flatMap(item => [item.bounds.minY - clearance - 0.1, item.bounds.maxY + clearance + 0.1])])
    .filter(value => value >= -outsideMargin && value <= layout.blockHeight + outsideMargin)
  const width = xs.length
  const indexOf = (x, y) => ys.findIndex(value => Math.abs(value - y) < 0.0001) * width
    + xs.findIndex(value => Math.abs(value - x) < 0.0001)
  const inside = (x, y, bounds) => x > bounds.minX - clearance && x < bounds.maxX + clearance
    && y > bounds.minY - clearance && y < bounds.maxY + clearance
  const blocked = (x, y) => items.some(item => inside(x, y, item.bounds))
  const valid = ys.flatMap(y => xs.map(x => !blocked(x, y)))
  const routeBetween = (from, to) => {
    const start = indexOf(from.x, from.y)
    const goal = indexOf(to.x, to.y)
    if (start < 0 || goal < 0 || !valid[start] || !valid[goal]) return null
    const distance = Array(valid.length).fill(Infinity)
    const previous = Array(valid.length).fill(-1)
    const queue = []
    const push = (node, cost) => {
      queue.push({ node, cost })
      let child = queue.length - 1
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2)
        if (queue[parent].cost <= cost) break
        queue[child] = queue[parent]
        child = parent
      }
      queue[child] = { node, cost }
    }
    const pop = () => {
      const root = queue[0]
      const tail = queue.pop()
      if (queue.length) {
        let parent = 0
        while (parent * 2 + 1 < queue.length) {
          let child = parent * 2 + 1
          if (child + 1 < queue.length && queue[child + 1].cost < queue[child].cost) child += 1
          if (queue[child].cost >= tail.cost) break
          queue[parent] = queue[child]
          parent = child
        }
        queue[parent] = tail
      }
      return root
    }
    distance[start] = 0
    push(start, 0)
    while (queue.length) {
      const { node, cost } = pop()
      if (cost > distance[node] + 0.0001) continue
      if (node === goal) break
      const xIndex = node % width
      const yIndex = Math.floor(node / width)
      const neighbors = [
        xIndex > 0 ? node - 1 : -1,
        xIndex + 1 < width ? node + 1 : -1,
        yIndex > 0 ? node - width : -1,
        yIndex + 1 < ys.length ? node + width : -1
      ]
      for (const next of neighbors) {
        if (next < 0 || !valid[next]) continue
        const nextX = xs[next % width]
        const nextY = ys[Math.floor(next / width)]
        const midpointX = (xs[xIndex] + nextX) / 2
        const midpointY = (ys[yIndex] + nextY) / 2
        if (blocked(midpointX, midpointY)) continue
        const step = Math.abs(nextX - xs[xIndex]) + Math.abs(nextY - ys[yIndex])
        if (cost + step >= distance[next] - 0.0001) continue
        distance[next] = cost + step
        previous[next] = node
        push(next, distance[next])
      }
    }
    if (!Number.isFinite(distance[goal])) return null
    const path = []
    for (let node = goal; node >= 0; node = previous[node]) {
      path.push({ x: xs[node % width], y: ys[Math.floor(node / width)] })
      if (node === start) break
    }
    path.reverse()
    const simplified = path.filter((point, index) => index === 0 || index === path.length - 1
      || Math.abs((point.x - path[index - 1].x) * (path[index + 1].y - point.y)
        - (point.y - path[index - 1].y) * (path[index + 1].x - point.x)) > 0.0001)
    return { path: simplified, length: distance[goal] }
  }
  const nodes = [home, ...portals, ...waypoints]
  const paths = nodes.map((from, first) => nodes.map((to, second) => first === second
    ? { path: [from], length: 0 } : routeBetween(from, to)))
  for (let index = 0; index < items.length; index += 1) {
    if (!paths[0][index + 1]) throw new Error(`${items[index].part.name}: вхід недоступний — змініть розкладку або коридор`)
  }
  const indices = items.map((_, index) => index)
  const angular = [...indices].sort((a, b) => Math.atan2(portals[a].y - layout.blockHeight / 2,
    portals[a].x - layout.blockWidth / 2) - Math.atan2(portals[b].y - layout.blockHeight / 2,
    portals[b].x - layout.blockWidth / 2))
  const greedy = first => {
    const remaining = new Set(indices)
    const order = []
    let current = first
    while (remaining.size) {
      const next = [...remaining].sort((a, b) => (paths[current][a + 1]?.length ?? Infinity)
        - (paths[current][b + 1]?.length ?? Infinity))[0]
      order.push(next)
      remaining.delete(next)
      current = next + 1
    }
    return order
  }
  let candidates = [
    { kind: 'павутина', order: greedy(0), petals: false },
    { kind: 'по периметру', order: angular, petals: false },
    { kind: 'по периметру навпаки', order: [...angular].reverse(), petals: false },
    { kind: 'ромашка', order: [...indices].sort((a, b) => paths[0][a + 1].length
      - paths[0][b + 1].length), petals: true }
  ]
  if (manualSteps) {
    const selected = manualSteps.filter(step => step.type === 'section').map(step => step.partId)
    if (selected.length !== items.length || new Set(selected).size !== items.length
      || selected.some(id => !items.some(item => String(item.part.id) === String(id)))) {
      throw new Error(`Ручний маршрут має відвідати кожну з ${items.length} секцій рівно один раз`)
    }
    let waypointIndex = 0
    const steps = manualSteps.map(step => {
      if (step.type === 'home') return { type: 'home', node: 0 }
      if (step.type === 'point') return { type: 'point', node: items.length + 1 + waypointIndex++ }
      if (step.type === 'exitBottom') return { type: 'exitBottom', node: items.length + waypoints.length }
      const index = items.findIndex(item => String(item.part.id) === String(step.partId))
      return { type: 'section', index, node: index + 1, entryHint: step.entryHint || null }
    })
    candidates = [{ kind: 'ручний', steps, order: steps.filter(step => step.type === 'section')
      .map(step => step.index), petals: false }]
  }
  const costOf = candidate => {
    if (candidate.steps) {
      let cost = 0
      let current = 0
      for (const step of candidate.steps) {
        const link = paths[current][step.node]
        if (!link) return Infinity
        cost += link.length
        if (step.type === 'exitBottom') return cost + layout.blockWidth + outsideMargin * 2
        current = step.node
      }
      return cost + (paths[current][0]?.length ?? Infinity)
    }
    let cost = 0
    let current = 0
    for (const index of candidate.order) {
      const next = index + 1
      const link = candidate.petals ? paths[0][next] : paths[current][next]
      if (!link) return Infinity
      cost += link.length
      if (candidate.petals) cost += paths[next][0]?.length ?? Infinity
      current = candidate.petals ? 0 : next
    }
    return cost + (candidate.petals ? 0 : paths[current][0]?.length ?? Infinity)
  }
  candidates.forEach(candidate => { candidate.corridorLength = costOf(candidate) })
  const chosen = candidates.filter(candidate => Number.isFinite(candidate.corridorLength))
    .sort((a, b) => a.corridorLength - b.corridorLength)[0]
  if (!chosen) throw new Error('Жоден із варіантів коридору не дістається всіх секцій')
  const events = []
  const add = (left, right = left, comment = '', activeIndex = -1) => {
    const last = events.at(-1)
    if (last && Math.hypot(last.left.x - left.x, last.left.y - left.y,
      last.right.x - right.x, last.right.y - right.y) < 0.0001) return
    events.push({ left: { ...left }, right: { ...right }, comment, activeIndex })
  }
  const follow = path => path.slice(1).forEach(point => add(point))
  add(home, home, manualSteps
    ? 'ПРОБНИЙ МАРШРУТ: перевірити карту, симуляцію та холодний прогін. Технічний нуль: 5 мм ліворуч і нижче блока'
    : 'ПРОБНИЙ МАРШРУТ: перевірити карту, симуляцію та холодний прогін. Робочий нуль: край блока')
  let current = 0
  const visitSteps = chosen.steps || chosen.order.map(index => ({ type: 'section', index, node: index + 1 }))
  for (const step of visitSteps) {
    const next = step.node
    const link = paths[current][next]
    if (!link) throw new Error('У ручному маршруті є непрохідний перехід')
    follow(link.path)
    current = next
    if (step.type === 'exitBottom') {
      add(home, undefined, 'Поза блоком: горизонтально до технічного нуля, без торцювання')
      current = 0
      continue
    }
    if (step.type !== 'section') continue
    const index = step.index
    const item = items[index]
    if (manualSteps) {
      const cut = manualCutFromApproach(item, portals[index], step.entryHint)
      add(cut.left[0], cut.right[0], `Секція ${sectionNumber(item)}: вхід з вибраної точки`, index)
      for (let pointIndex = 1; pointIndex < cut.left.length; pointIndex += 1) {
        add(cut.left[pointIndex], cut.right[pointIndex], '', index)
      }
      add(cut.left[0], cut.right[0], 'Зовнішній контур замкнено один раз', index)
      add(portals[index], portals[index], 'Вихід у ту саму точку маршруту', index)
      continue
    }
    const laneY = portals[index].y
    const leftPortal = { x: item.cutLeft[0].x, y: laneY }
    const rightPortal = { x: item.cutRight[0].x, y: laneY }
    add(leftPortal, rightPortal, `Секція ${sectionNumber(item)}: короткий вхід`, index)
    item.cutLeft.forEach((point, pointIndex) => add(point, item.cutRight[pointIndex], '', index))
    add(item.cutLeft[0], item.cutRight[0], 'Замкнути зовнішній контур один раз', index)
    add(leftPortal, rightPortal, 'Вийти тією ж короткою щілиною', index)
    add(portals[index], portals[index], '', index)
    if (chosen.petals) {
      follow(paths[current][0].path)
      current = 0
    }
  }
  if (current) follow(paths[current][0].path)
  // A moving hot wire occupies the whole span between its two faces. Check
  // sampled sweep, not just two endpoint polylines, against every other part.
  for (let eventIndex = 1; eventIndex < events.length; eventIndex += 1) {
    const before = events[eventIndex - 1]
    const after = events[eventIndex]
    const leftMotion = Math.hypot(after.left.x - before.left.x, after.left.y - before.left.y)
    const rightMotion = Math.hypot(after.right.x - before.right.x, after.right.y - before.right.y)
    if (after.activeIndex >= 0 && before.activeIndex === after.activeIndex
      && Math.max(leftMotion, rightMotion) > 0.5 && Math.min(leftMotion, rightMotion) < 0.001) {
      throw new Error(`${items[after.activeIndex].part.name}: один кінець струни стоїть, поки другий рухається; Закон КОНУСУ порушено`)
    }
    const motion = Math.max(leftMotion, rightMotion)
    const samples = Math.max(1, Math.ceil(motion / 4))
    for (let step = 0; step <= samples; step += 1) {
      const time = step / samples
      const left = { x: before.left.x + (after.left.x - before.left.x) * time,
        y: before.left.y + (after.left.y - before.left.y) * time }
      const right = { x: before.right.x + (after.right.x - before.right.x) * time,
        y: before.right.y + (after.right.y - before.right.y) * time }
      for (let fraction = 0; fraction <= 4; fraction += 1) {
        const ratio = fraction / 4
        const x = left.x + (right.x - left.x) * ratio
        const y = left.y + (right.y - left.y) * ratio
        const collided = items.findIndex((item, index) => index !== after.activeIndex
          && index !== before.activeIndex && inside(x, y, item.bounds))
        if (collided >= 0) {
          throw new Error(`струна може зачепити ${items[collided].part.name} біля руху ${eventIndex}; NC заблоковано`)
        }
      }
    }
  }
  return { events, orderedItems: chosen.order.map(index => items[index]), home,
    strategy: chosen.kind, candidates: candidates.map(({ kind, corridorLength }) => ({ kind, corridorLength })) }
}

const formatNumber = value => (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)

export const createBatchMach3Nc = (events, feedRate, setup = null) => {
  const lines = [
    '%',
    '(Zhart CAD/CAM Studio UA - batch fuselage sections)',
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
  fragments.push(`<text x="${pageWidth / 2}" y="${pageHeight - 22}" text-anchor="middle" font-family="Arial" font-size="13" fill="#475569">Зелений пунктир — розрахований маршрут; перед різом обов'язкові симуляція й холодний прогін.</text>`)
  fragments.push('</svg>')
  return `${fragments.join('\n')}\n`
}
