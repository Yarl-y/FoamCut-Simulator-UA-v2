const AXES = ['X', 'Y', 'A', 'Z']
const MIN_DIRECTION_SEGMENT_MM = 0.01
const MIN_SYNCHRONY_SEGMENT_MM = 1
const BURN_THROUGH_DANGER_RATIO = 0.05
const BURN_THROUGH_WARNING_RATIO = 0.25

const cleanLine = line => String(line).replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim().toUpperCase()
const valueOf = (line, letter) => {
  const value = Number(line.match(new RegExp(`\\b${letter}([-+]?\\d*\\.?\\d+)`))?.[1])
  return Number.isFinite(value) ? value : null
}

const createSynchronyZones = segments => {
  const zones = []
  let zone = null
  const finish = () => { if (zone) zones.push(zone); zone = null }
  segments.forEach((segment, index) => {
    const longDistance = Math.max(segment.leftDistance, segment.rightDistance)
    if (longDistance < MIN_SYNCHRONY_SEGMENT_MM || segment.synchronyRatio >= BURN_THROUGH_WARNING_RATIO) {
      finish()
      return
    }
    const severity = segment.synchronyRatio <= BURN_THROUGH_DANGER_RATIO ? 'danger' : 'warning'
    if (!zone) zone = { startLine: segment.lineNumber, endLine: segment.lineNumber, startIndex: index,
      endIndex: index, count: 0, durationSeconds: 0, leftDistance: 0, rightDistance: 0,
      worstSynchronyRatio: 1, slowerSide: segment.slowerSide, severity: 'warning' }
    zone.endLine = segment.lineNumber
    zone.endIndex = index
    zone.count += 1
    zone.durationSeconds += segment.durationSeconds
    zone.leftDistance += segment.leftDistance
    zone.rightDistance += segment.rightDistance
    if (segment.synchronyRatio < zone.worstSynchronyRatio) {
      zone.worstSynchronyRatio = segment.synchronyRatio
      zone.slowerSide = segment.slowerSide
    }
    if (severity === 'danger') zone.severity = 'danger'
  })
  finish()
  return zones
}

export function analyzeMotionDynamics(source, options = {}) {
  const maximumFeed = Math.max(1, Number(options.maximumFeed) || 1000)
  const accelerationLimit = Math.max(1, Number(options.acceleration) || 100)
  const limits = options.limits || {}
  const nearLimitDistance = Math.max(1, Number(options.nearLimitDistance) || 10)
  const machineZeroKnown = AXES.every(axis => typeof options.workZeroMachine?.[axis] === 'number'
    && Number.isFinite(options.workZeroMachine[axis]))
  const position = Object.fromEntries(AXES.map(axis => [axis, 0]))
  const segments = []
  const findings = []
  const advisories = []
  if (!machineZeroKnown) findings.push({ severity: 'warning', lineNumber: '—', type: 'Прив’язка нуля',
    message: 'Машинне положення робочого нуля невідоме. Фізичний запас до меж не перевірено; межі 0…хід нижче — лише модель симулятора.' })
  let absolute = true
  let feed = Math.min(300, maximumFeed)
  let nextMovementRole = ''

  String(source || '').split(/\r?\n/).forEach((raw, rawIndex) => {
    if (/\(\s*Безпечний вихід у коридор\s*\)/i.test(raw)) nextMovementRole = 'Безпечний вихід у коридор'
    else if (/\(\s*Контрольоване повернення по входу\s*\)/i.test(raw)) nextMovementRole = 'Контрольоване повернення'
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
    const movementRole = nextMovementRole
    nextMovementRole = ''
    const leftDistance = Math.hypot(delta.X, delta.Y)
    const rightDistance = Math.hypot(delta.A, delta.Z)
    const longerSideDistance = Math.max(leftDistance, rightDistance)
    const shorterSideDistance = Math.min(leftDistance, rightDistance)
    const synchronyRatio = longerSideDistance > 1e-9 ? shorterSideDistance / longerSideDistance : 1
    const slowerSide = leftDistance <= rightDistance ? 'X/Y' : 'A/Z'
    const segment = { lineNumber: rawIndex + 1, command: line, from, to, delta, distance, feed, durationSeconds, velocity,
      movementRole, leftDistance, rightDistance, synchronyRatio, slowerSide }
    segments.push(segment)
    Object.assign(position, to)

    if (feed > maximumFeed) findings.push({ severity: 'danger', lineNumber: segment.lineNumber, type: 'Швидкість', message: `F${feed} перевищує дозволені F${maximumFeed}` })
    AXES.forEach(axis => {
      const limit = Math.max(0, Number(limits[axis]) || 0)
      const coordinate = to[axis] + (machineZeroKnown ? options.workZeroMachine[axis] : 0)
      const clearance = limit ? Math.min(coordinate, limit - coordinate) : Infinity
      const type = `${machineZeroKnown ? 'Машинна межа' : 'Межа моделі'} ${axis}`
      const message = `${axis}: робоча ${to[axis].toFixed(3)} мм; ${machineZeroKnown ? 'машинна' : 'модельна'} ${coordinate.toFixed(3)} мм; запас ${clearance.toFixed(3)} мм`
      if (clearance < 0) findings.push({ severity: 'danger', lineNumber: segment.lineNumber, type, clearance, message })
      else if (clearance <= nearLimitDistance) findings.push({ severity: 'warning', lineNumber: segment.lineNumber, type, clearance, message })
    })
  })

  const synchronyZones = createSynchronyZones(segments)
  synchronyZones.forEach(zone => {
    const isDanger = zone.severity === 'danger'
    findings.push({ severity: zone.severity, lineNumber: zone.startLine, type: 'Ризик пропалу', synchronyRatio: zone.worstSynchronyRatio,
      message: `Зона рядків ${zone.startLine}–${zone.endLine}: ${zone.count} рухів, орієнтовно ${zone.durationSeconds.toFixed(1)} с; X/Y ${zone.leftDistance.toFixed(1)} мм, A/Z ${zone.rightDistance.toFixed(1)} мм; найменша синхронність ${(zone.worstSynchronyRatio * 100).toFixed(1)}%, повільніший ${zone.slowerSide}. ${isDanger ? 'Не починайте різ без виправлення або окремої перевірки.' : 'Перевірте нагрів, компенсацію пропалу та розподіл точок пробним різом.'}` })
  })

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1]
    const current = segments[index]
    const previousLength = Math.hypot(...AXES.map(axis => previous.delta[axis]))
    const currentLength = Math.hypot(...AXES.map(axis => current.delta[axis]))
    // Sub-hundredth millimetre steps commonly appear after NC rounding. Their
    // direction is numerically unstable and must not create a false reversal.
    if (previousLength < MIN_DIRECTION_SEGMENT_MM || currentLength < MIN_DIRECTION_SEGMENT_MM) continue
    const dot = AXES.reduce((sum, axis) => sum + previous.delta[axis] * current.delta[axis], 0)
    const cosine = Math.max(-1, Math.min(1, dot / Math.max(previousLength * currentLength, 1e-9)))
    const turnAngle = Math.acos(cosine) * 180 / Math.PI
    const velocityChange = Math.hypot(...AXES.map(axis => current.velocity[axis] - previous.velocity[axis]))
    const transitionSeconds = Math.max(0.02, Math.min(0.25, previous.durationSeconds / 2, current.durationSeconds / 2))
    const requiredAcceleration = velocityChange / transitionSeconds
    current.turnAngle = turnAngle
    current.requiredAcceleration = requiredAcceleration
    if (turnAngle >= 135 && current.movementRole) advisories.push({ severity: 'info', lineNumber: current.lineNumber, type: current.movementRole, message: `Позначений службовий рух; зміна напрямку ${turnAngle.toFixed(1)}°` })
    else if (turnAngle >= 135) findings.push({ severity: 'danger', lineNumber: current.lineNumber, type: 'Розворот', message: `Зміна напрямку ${turnAngle.toFixed(1)}° без проміжної плавної точки` })
    else if (turnAngle >= 90) findings.push({ severity: 'warning', lineNumber: current.lineNumber, type: 'Гострий кут', message: `Зміна напрямку ${turnAngle.toFixed(1)}°` })
    if (requiredAcceleration > accelerationLimit) findings.push({ severity: 'warning', lineNumber: current.lineNumber, type: 'Прискорення', message: `Орієнтовно ${requiredAcceleration.toFixed(1)} мм/с² при дозволених ${accelerationLimit}` })
  }

  return {
    machineZeroKnown,
    segments,
    findings,
    advisories,
    synchronyZones,
    safe: !findings.some(item => item.severity === 'danger'),
    warningCount: findings.filter(item => item.severity === 'warning').length,
    dangerCount: findings.filter(item => item.severity === 'danger').length,
    maximumProgramFeed: Math.max(0, ...segments.map(segment => segment.feed)),
    burnThroughRiskCount: synchronyZones.length,
    worstSynchronyRatio: Math.min(1, ...segments
      .filter(segment => Math.max(segment.leftDistance, segment.rightDistance) >= MIN_SYNCHRONY_SEGMENT_MM)
      .map(segment => segment.synchronyRatio))
  }
}

export function groupMotionFindings(findings) {
  const groups = new Map()
  for (const item of findings) {
    const key = `${item.severity}:${item.type}`
    if (!groups.has(key)) groups.set(key, { ...item, count: 0, lines: [], messages: [] })
    const group = groups.get(key)
    group.count++
    group.lines.push(item.lineNumber)
    group.messages.push(`Рядок ${item.lineNumber}: ${item.message}`)
    if (Number.isFinite(item.clearance) && (!Number.isFinite(group.clearance) || item.clearance < group.clearance)) {
      group.clearance = item.clearance
      group.message = item.message
    }
  }
  return [...groups.values()]
}

export function formatMotionFindingsForAi(analysis, limit = 12) {
  if (!analysis) return 'Аналіз NC ще не виконано.'
  if (!analysis.findings?.length && !analysis.advisories?.length) return 'Попереджень і небезпек аналізу NC не знайдено.'
  const severityWeight = { danger: 2, warning: 1 }
  const groups = groupMotionFindings(analysis.findings).sort((left, right) =>
    (severityWeight[right.severity] || 0) - (severityWeight[left.severity] || 0)
    || (Number(left.clearance) || Infinity) - (Number(right.clearance) || Infinity)
    || right.count - left.count)
  const rows = groups.slice(0, limit).map(group => {
    const lines = [...new Set(group.lines)].slice(0, 5).join(', ')
    return `${group.severity === 'danger' ? 'НЕБЕЗПЕКА' : 'УВАГА'} — ${group.type}; спрацювань ${group.count}; рядки ${lines}; ${group.message}`
  })
  const serviceRows = (analysis.advisories || []).slice(0, limit).map(item => `СЛУЖБОВИЙ РУХ — ${item.type}; рядок ${item.lineNumber}; ${item.message}`)
  return `Підсумок: небезпек ${analysis.dangerCount}, попереджень ${analysis.warningCount}, службових рухів ${(analysis.advisories || []).length}, зон ризику пропалу ${analysis.burnThroughRiskCount || 0}, найбільша подача F${analysis.maximumProgramFeed}.\n${[...rows, ...serviceRows].join('\n')}`
}
