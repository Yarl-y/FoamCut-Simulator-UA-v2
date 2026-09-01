const AXES = ['X', 'Y', 'A', 'Z']

const cleanLine = line => String(line).replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim().toUpperCase()
const valueOf = (line, letter) => {
  const value = Number(line.match(new RegExp(`\\b${letter}([-+]?\\d*\\.?\\d+)`))?.[1])
  return Number.isFinite(value) ? value : null
}

export function analyzeMotionDynamics(source, options = {}) {
  const maximumFeed = Math.max(1, Number(options.maximumFeed) || 1000)
  const accelerationLimit = Math.max(1, Number(options.acceleration) || 100)
  const limits = options.limits || {}
  const nearLimitDistance = Math.max(1, Number(options.nearLimitDistance) || 10)
  const position = Object.fromEntries(AXES.map(axis => [axis, 0]))
  const segments = []
  const findings = []
  let absolute = true
  let feed = Math.min(300, maximumFeed)

  String(source || '').split(/\r?\n/).forEach((raw, rawIndex) => {
    const line = cleanLine(raw)
    if (!line) return
    if (/\bG90\b/.test(line)) absolute = true
    if (/\bG91\b/.test(line)) absolute = false
    const requestedFeed = valueOf(line, 'F')
    if (requestedFeed && requestedFeed > 0) feed = requestedFeed
    if (!/\bG(?:0|1)\b/.test(line)) return
    const from = { ...position }
    const to = { ...position }
    AXES.forEach(axis => {
      const value = valueOf(line, axis)
      if (value !== null) to[axis] = absolute ? value : from[axis] + value
    })
    const delta = Object.fromEntries(AXES.map(axis => [axis, to[axis] - from[axis]]))
    const distance = Math.hypot(...AXES.map(axis => delta[axis]))
    if (distance <= 1e-9) { Object.assign(position, to); return }
    const durationSeconds = distance / Math.max(feed, 1) * 60
    const velocity = Object.fromEntries(AXES.map(axis => [axis, delta[axis] / Math.max(durationSeconds, 1e-9)]))
    const segment = { lineNumber: rawIndex + 1, command: line, from, to, delta, distance, feed, durationSeconds, velocity }
    segments.push(segment)
    Object.assign(position, to)

    if (feed > maximumFeed) findings.push({ severity: 'danger', lineNumber: segment.lineNumber, type: 'Швидкість', message: `F${feed} перевищує дозволені F${maximumFeed}` })
    AXES.forEach(axis => {
      const limit = Math.max(0, Number(limits[axis]) || 0)
      const clearance = limit ? Math.min(to[axis], limit - to[axis]) : Infinity
      if (clearance >= 0 && clearance <= nearLimitDistance) findings.push({ severity: 'warning', lineNumber: segment.lineNumber, type: `Межа ${axis}`, message: `${axis}=${to[axis].toFixed(3)} мм, запас лише ${clearance.toFixed(3)} мм` })
    })
  })

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1]
    const current = segments[index]
    const previousLength = Math.hypot(...AXES.map(axis => previous.delta[axis]))
    const currentLength = Math.hypot(...AXES.map(axis => current.delta[axis]))
    const dot = AXES.reduce((sum, axis) => sum + previous.delta[axis] * current.delta[axis], 0)
    const cosine = Math.max(-1, Math.min(1, dot / Math.max(previousLength * currentLength, 1e-9)))
    const turnAngle = Math.acos(cosine) * 180 / Math.PI
    const velocityChange = Math.hypot(...AXES.map(axis => current.velocity[axis] - previous.velocity[axis]))
    const transitionSeconds = Math.max(0.02, Math.min(0.25, previous.durationSeconds / 2, current.durationSeconds / 2))
    const requiredAcceleration = velocityChange / transitionSeconds
    current.turnAngle = turnAngle
    current.requiredAcceleration = requiredAcceleration
    if (turnAngle >= 135) findings.push({ severity: 'danger', lineNumber: current.lineNumber, type: 'Розворот', message: `Зміна напрямку ${turnAngle.toFixed(1)}° без проміжної плавної точки` })
    else if (turnAngle >= 90) findings.push({ severity: 'warning', lineNumber: current.lineNumber, type: 'Гострий кут', message: `Зміна напрямку ${turnAngle.toFixed(1)}°` })
    if (requiredAcceleration > accelerationLimit) findings.push({ severity: 'warning', lineNumber: current.lineNumber, type: 'Прискорення', message: `Орієнтовно ${requiredAcceleration.toFixed(1)} мм/с² при дозволених ${accelerationLimit}` })
  }

  return {
    segments,
    findings,
    safe: !findings.some(item => item.severity === 'danger'),
    warningCount: findings.filter(item => item.severity === 'warning').length,
    dangerCount: findings.filter(item => item.severity === 'danger').length,
    maximumProgramFeed: Math.max(0, ...segments.map(segment => segment.feed))
  }
}
