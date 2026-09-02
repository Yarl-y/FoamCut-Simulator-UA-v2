const SVG_NS = 'http://www.w3.org/2000/svg'

const svgElement = (tag, attributes, parent) => {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  parent.appendChild(element)
  return element
}

const sectionCenterX = points => {
  const values = points.map(point => point.x)
  return (Math.min(...values) + Math.max(...values)) / 2
}

const partGeometry = part => {
  const offsets = part.offsets || { x: 0, y: 0, z: 0 }

  if (part.kind === 'fuselage') {
    const leftCenter = sectionCenterX(part.outerLeft)
    const rightCenter = sectionCenterX(part.outerRight)
    return {
      root: part.outerLeft.map(point => ({
        x: offsets.x,
        y: point.y + offsets.y,
        z: point.x - leftCenter + offsets.z
      })),
      tip: part.outerRight.map(point => ({
        x: part.span + offsets.x,
        y: point.y + offsets.y,
        z: point.x - rightCenter + offsets.z
      }))
    }
  }

  const direction = part.side === 'left' ? -1 : 1
  return {
    root: part.outerLeft.map(point => ({
      x: point.x + offsets.x,
      y: point.y + offsets.y,
      z: offsets.z
    })),
    tip: part.outerRight.map(point => ({
      x: point.x + offsets.x,
      y: point.y + offsets.y,
      z: direction * part.span + offsets.z
    }))
  }
}

export const renderAssemblyView = (svg, parts, camera = {}, measurement = null) => {
  svg.replaceChildren()
  svg.__foamcutSnapPoints = []
  const visibleParts = parts.filter(part => part.visible)
  if (!visibleParts.length) {
    svgElement('text', {
      x: 400,
      y: 250,
      'text-anchor': 'middle',
      fill: '#6b7280',
      'font-size': 18
    }, svg).textContent = 'Додайте деталі до збірки'
    return { visibleCount: 0 }
  }

  const geometries = visibleParts.map(part => ({ part, ...partGeometry(part) }))
  const allPoints = geometries.flatMap(geometry => [...geometry.root, ...geometry.tip])
  const yaw = (Number(camera.yaw) || 0) * Math.PI / 180
  const pitch = (Number(camera.pitch) || 0) * Math.PI / 180
  const rotate = point => {
    const yawX = point.x * Math.cos(yaw) - point.z * Math.sin(yaw)
    const yawDepth = point.x * Math.sin(yaw) + point.z * Math.cos(yaw)
    return {
      x: yawX,
      y: point.y * Math.cos(pitch) - yawDepth * Math.sin(pitch)
    }
  }
  const rotated = allPoints.map(rotate)
  const minX = Math.min(...rotated.map(point => point.x))
  const maxX = Math.max(...rotated.map(point => point.x))
  const minY = Math.min(...rotated.map(point => point.y))
  const maxY = Math.max(...rotated.map(point => point.y))
  const scale = Math.min(720 / Math.max(maxX - minX, 1), 420 / Math.max(maxY - minY, 1))
    * Math.max(0.2, Number(camera.zoom) || 1)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const project = point => {
    const rotatedPoint = rotate(point)
    return [
      400 + (rotatedPoint.x - centerX) * scale + (Number(camera.panX) || 0),
      250 - (rotatedPoint.y - centerY) * scale + (Number(camera.panY) || 0)
    ]
  }
  svg.__foamcutSnapPoints = allPoints.map(point => ({ world: point, screen: project(point) }))
  const colors = {
    left: { stroke: '#2563eb', fill: '#60a5fa' },
    right: { stroke: '#dc2626', fill: '#f87171' },
    fuselage: { stroke: '#b45309', fill: '#fbbf24' },
    selected: { stroke: '#059669', fill: '#34d399' },
    inner: { stroke: '#7c3aed', fill: '#c4b5fd' }
  }

  const continuousSpars = new Map()
  for (const { part } of geometries) {
    if (part.kind !== 'wing') continue
    const direction = part.side === 'left' ? -1 : 1
    for (const rod of part.straightSparRods || []) {
      const x = rod.x + part.offsets.x
      const y = rod.y + part.offsets.y
      const firstZ = part.offsets.z
      const secondZ = direction * part.span + part.offsets.z
      const key = `${x.toFixed(3)}:${y.toFixed(3)}:${rod.diameter.toFixed(3)}`
      const current = continuousSpars.get(key) || {
        x, y, diameter: rod.diameter, minZ: Infinity, maxZ: -Infinity, segments: 0
      }
      current.minZ = Math.min(current.minZ, firstZ, secondZ)
      current.maxZ = Math.max(current.maxZ, firstZ, secondZ)
      current.segments += 1
      continuousSpars.set(key, current)
    }
  }

  for (const rod of continuousSpars.values()) {
    if (rod.segments < 2) continue
    const first = project({ x: rod.x, y: rod.y, z: rod.minZ })
    const second = project({ x: rod.x, y: rod.y, z: rod.maxZ })
    svgElement('line', {
      x1: first[0], y1: first[1], x2: second[0], y2: second[1],
      stroke: '#111827', 'stroke-width': Math.max(2, rod.diameter * scale),
      'stroke-opacity': '0.32', 'stroke-linecap': 'round'
    }, svg)
  }

  for (const { part, root, tip } of geometries) {
    const partGroup = svgElement('g', {
      'data-assembly-part-id': part.id,
      class: 'assembly-model-part'
    }, svg)
    const color = part.previewInner
      ? colors.inner
      : part.previewSelected || part.assemblySelected
      ? colors.selected
      : colors[part.kind === 'fuselage' ? 'fuselage' : part.side]
    const step = Math.max(1, Math.floor(Math.min(root.length, tip.length) / 64))

    for (let index = 0; index < Math.min(root.length, tip.length); index += step) {
      const next = (index + step) % Math.min(root.length, tip.length)
      const polygon = [root[index], root[next], tip[next], tip[index]].map(project)
      svgElement('polygon', {
        points: polygon.map(point => point.join(',')).join(' '),
        fill: color.fill,
        'fill-opacity': '0.16',
        stroke: color.stroke,
        'stroke-opacity': '0.22',
        'stroke-width': '0.8'
      }, partGroup)
    }

    for (const profile of [root, tip]) {
      svgElement('polyline', {
        points: [...profile, profile[0]].map(point => project(point).join(',')).join(' '),
        fill: 'none',
        stroke: color.stroke,
        'stroke-width': '2.2'
      }, partGroup)
    }

    if (part.kind === 'wing') {
      const direction = part.side === 'left' ? -1 : 1
      for (const rod of part.straightSparRods || []) {
        const first = project({
          x: rod.x + part.offsets.x,
          y: rod.y + part.offsets.y,
          z: part.offsets.z
        })
        const second = project({
          x: rod.x + part.offsets.x,
          y: rod.y + part.offsets.y,
          z: direction * part.span + part.offsets.z
        })
        svgElement('line', {
          x1: first[0], y1: first[1], x2: second[0], y2: second[1],
          stroke: '#111827', 'stroke-width': Math.max(2, rod.diameter * scale),
          'stroke-opacity': '0.72', 'stroke-linecap': 'round'
        }, partGroup)
      }
      for (const channel of part.servoChannels || []) {
        const first = project({
          x: channel.rootX + part.offsets.x,
          y: channel.rootY + part.offsets.y,
          z: part.offsets.z
        })
        const second = project({
          x: channel.tipX + part.offsets.x,
          y: channel.tipY + part.offsets.y,
          z: direction * part.span + part.offsets.z
        })
        svgElement('line', {
          x1: first[0], y1: first[1], x2: second[0], y2: second[1],
          stroke: '#f97316', 'stroke-width': '4', 'stroke-dasharray': '7 4',
          'stroke-opacity': '0.8'
        }, partGroup)
      }
    }

    if (part.kind === 'fuselage') {
      if (part.innerLeft && part.innerRight) {
        const innerGeometry = partGeometry({
          ...part,
          outerLeft: part.innerLeft,
          outerRight: part.innerRight
        })
        for (const profile of [innerGeometry.root, innerGeometry.tip]) {
          svgElement('polyline', {
            points: [...profile, profile[0]].map(point => project(point).join(',')).join(' '),
            fill: 'none', stroke: '#7c3aed', 'stroke-width': '2', 'stroke-dasharray': '6 3'
          }, partGroup)
        }
      }
      for (const rod of part.straightSparRods || []) {
        const first = project({
          x: part.offsets.x + (rod.start || 0),
          y: rod.y + part.offsets.y,
          z: rod.x + part.offsets.z
        })
        const second = project({
          x: part.offsets.x + (rod.start || 0) + (rod.length || part.span),
          y: rod.y + part.offsets.y,
          z: rod.x + part.offsets.z
        })
        svgElement('line', {
          x1: first[0], y1: first[1], x2: second[0], y2: second[1],
          stroke: '#111827', 'stroke-width': Math.max(2, rod.diameter * scale),
          'stroke-opacity': '0.8', 'stroke-linecap': 'round'
        }, partGroup)
      }
    }

    const labelPoint = project(root[0])
    svgElement('text', {
      x: labelPoint[0] + 6,
      y: labelPoint[1] - 7,
      fill: color.stroke,
      'font-size': '13',
      'font-weight': '700'
    }, partGroup).textContent = part.name
  }

  if (measurement?.points?.length) {
    const screens = measurement.points.map(project)
    screens.forEach(screen => svgElement('circle', {
      cx: screen[0], cy: screen[1], r: 5,
      fill: '#16a34a', stroke: '#ffffff', 'stroke-width': 2
    }, svg))
    if (screens.length === 2) {
      const [first, second] = measurement.points
      const dx = second.x - first.x
      const dy = second.y - first.y
      const dz = second.z - first.z
      const distance = Math.hypot(dx, dy, dz)
      svgElement('line', {
        x1: screens[0][0], y1: screens[0][1], x2: screens[1][0], y2: screens[1][1],
        stroke: '#16a34a', 'stroke-width': 2.5, 'stroke-dasharray': '8 4'
      }, svg)
      const fontSize = Math.max(14, Math.min(42, Number(measurement.fontSize) || 22))
      const labelX = Math.max(110, Math.min(690, (screens[0][0] + screens[1][0]) / 2))
      const labelY = Math.max(fontSize * 2, Math.min(470 - fontSize, (screens[0][1] + screens[1][1]) / 2))
      const distanceLabel = svgElement('text', {
        x: labelX,
        y: labelY - fontSize * 0.35,
        'text-anchor': 'middle', fill: '#166534', 'font-size': fontSize, 'font-weight': 800,
        stroke: '#ffffff', 'stroke-width': 4, 'paint-order': 'stroke'
      }, svg)
      distanceLabel.textContent = `Відстань: ${distance.toFixed(2)} мм`
      const deltaLabel = svgElement('text', {
        x: labelX,
        y: labelY + fontSize * 0.8,
        'text-anchor': 'middle', fill: '#166534', 'font-size': fontSize * 0.72, 'font-weight': 700,
        stroke: '#ffffff', 'stroke-width': 4, 'paint-order': 'stroke'
      }, svg)
      deltaLabel.textContent = `ΔX ${dx.toFixed(2)} · ΔY ${dy.toFixed(2)} · ΔZ ${dz.toFixed(2)} мм`
    }
  }

  return { visibleCount: visibleParts.length }
}
