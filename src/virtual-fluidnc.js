export const VIRTUAL_AXES = ['X', 'Y', 'A', 'Z', 'B']

const cleanLine = source => source
  .replace(/\([^)]*\)/g, '')
  .replace(/;.*$/, '')
  .trim()

export class VirtualFluidNC {
  constructor(limits = {}, startPositions = {}) {
    this.positions = Object.fromEntries(VIRTUAL_AXES.map(axis => [axis, Number(startPositions[axis]) || 0]))
    this.limits = Object.fromEntries(VIRTUAL_AXES.map(axis => [axis, Math.max(0, Number(limits[axis]) || (axis === 'B' ? 360 : 600))]))
    this.absolute = true
    this.state = 'Idle'
    this.alarm = ''
  }

  setLimits(limits) {
    VIRTUAL_AXES.forEach(axis => { this.limits[axis] = Math.max(0, Number(limits[axis]) || this.limits[axis]) })
  }

  home() {
    VIRTUAL_AXES.forEach(axis => { this.positions[axis] = 0 })
    this.state = 'Idle'
    this.alarm = ''
  }

  unlock() {
    this.alarm = ''
    this.state = 'Idle'
  }

  emergencyStop(reason = 'Аварійний стоп') {
    this.alarm = reason
    this.state = 'Alarm'
  }

  execute(source) {
    const line = cleanLine(source).toUpperCase()
    if (!line) return { ok: true, positions: { ...this.positions }, state: this.state }
    if (line === '$X') { this.unlock(); return this.result() }
    if (line === '$H') { this.home(); return this.result() }
    if (this.alarm) return this.result(false, this.alarm)
    if (/\bG90\b/.test(line)) this.absolute = true
    if (/\bG91\b/.test(line)) this.absolute = false
    if (/\bG10\b/.test(line) && /\bL20\b/.test(line)) {
      VIRTUAL_AXES.forEach(axis => { if (new RegExp(`${axis}[-+]?\\d`).test(line)) this.positions[axis] = 0 })
      return this.result()
    }

    const jog = line.startsWith('$J=')
    const move = jog || /\bG(?:0|1)\b/.test(line)
    if (!move) return this.result()
    const incremental = jog ? /\bG91\b/.test(line) : !this.absolute
    const targets = { ...this.positions }
    VIRTUAL_AXES.forEach(axis => {
      const match = line.match(new RegExp(`${axis}([-+]?\\d*\\.?\\d+)`))
      if (!match) return
      const value = Number(match[1])
      if (Number.isFinite(value)) targets[axis] = incremental ? targets[axis] + value : value
    })
    for (const axis of VIRTUAL_AXES) {
      if (targets[axis] < 0 || targets[axis] > this.limits[axis]) {
        this.emergencyStop(`ALARM: ${axis}=${targets[axis].toFixed(3)} мм поза межами 0…${this.limits[axis]} мм`)
        return this.result(false, this.alarm)
      }
    }
    this.positions = targets
    this.state = 'Run'
    return this.result()
  }

  result(ok = true, error = '') {
    return { ok, error, positions: { ...this.positions }, state: this.state, absolute: this.absolute }
  }
}

export function validateVirtualProgram(source, options = {}) {
  const limits = options.limits || {}
  const controller = new VirtualFluidNC(limits, options.startPositions)
  const errors = []
  const warnings = []
  let movements = 0
  let maximumFeed = 0
  let heatingCommands = 0
  const enabledAxes = new Set(options.enabledAxes || VIRTUAL_AXES)
  const lines = String(source || '').split(/\r?\n/)

  lines.forEach((line, index) => {
    const cleaned = cleanLine(line).toUpperCase()
    if (!cleaned) return
    if (/\bM(?:3|4)\b/.test(cleaned)) heatingCommands += 1
    VIRTUAL_AXES.forEach(axis => {
      if (!enabledAxes.has(axis) && new RegExp(`${axis}[-+]?\\d*\\.?\\d+`).test(cleaned)) {
        errors.push(`Рядок ${index + 1}: використано вимкнену вісь ${axis}`)
      }
    })
    const feed = Number(cleaned.match(/\bF([-+]?\d*\.?\d+)/)?.[1])
    if (Number.isFinite(feed)) maximumFeed = Math.max(maximumFeed, feed)
    if (/\bG(?:0|1)\b/.test(cleaned) || cleaned.startsWith('$J=')) movements += 1
    const result = controller.execute(cleaned)
    if (!result.ok && !errors.some(value => value.includes(result.error))) errors.push(`Рядок ${index + 1}: ${result.error}`)
  })

  if (!String(source || '').trim()) errors.push('NC порожній')
  if (!options.zeroConfirmed) errors.push('Робочий нуль не підтверджено')
  const feedLimit = Math.max(1, Number(options.maximumFeed) || 1000)
  if (maximumFeed > feedLimit) errors.push(`Швидкість F${maximumFeed} перевищує дозволені ${feedLimit} мм/хв`)
  if (heatingCommands && options.coldRun) warnings.push(`Холодний прогін вилучить ${heatingCommands} команд(и) нагріву`)
  if (!movements && String(source || '').trim()) warnings.push('У NC не знайдено команд руху G0/G1')

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    movements,
    maximumFeed,
    heatingCommands,
    finalPositions: { ...controller.positions }
  }
}
