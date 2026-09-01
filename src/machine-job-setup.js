const MOTION_AXES = ['X', 'Y', 'A', 'Z']

const withoutComments = line => String(line)
  .replace(/\([^)]*\)/g, '')
  .replace(/;.*$/, '')
  .trim()

const readNumber = (line, letter) => {
  const match = line.match(new RegExp(`\\b${letter}([-+]?\\d*\\.?\\d+)`, 'i'))
  return match ? Number(match[1]) : null
}

const readBlockSetup = source => {
  const match = String(source).match(/Block setup:\s*wire\s+([-+]?\d*\.?\d+)\s*mm,\s*left gap\s+([-+]?\d*\.?\d+)\s*mm,\s*block\s+([-+]?\d*\.?\d+)\s*mm,\s*right gap\s+([-+]?\d*\.?\d+)\s*mm/i)
  if (!match) return null
  return { wireSpan: Number(match[1]), leftGap: Number(match[2]), blockWidth: Number(match[3]), rightGap: Number(match[4]) }
}

export function analyzeMachineJob(source, options = {}) {
  const limits = options.limits || {}
  const positions = Object.fromEntries(MOTION_AXES.map(axis => [axis, 0]))
  const ranges = Object.fromEntries(MOTION_AXES.map(axis => [axis, { minimum: 0, maximum: 0 }]))
  let absolute = true
  let feed = Math.max(1, Number(options.defaultFeed) || 300)
  let distance = 0
  let estimatedMinutes = 0
  let movements = 0

  String(source || '').split(/\r?\n/).forEach(rawLine => {
    const line = withoutComments(rawLine).toUpperCase()
    if (!line) return
    if (/\bG90\b/.test(line)) absolute = true
    if (/\bG91\b/.test(line)) absolute = false
    const requestedFeed = readNumber(line, 'F')
    if (Number.isFinite(requestedFeed) && requestedFeed > 0) feed = requestedFeed
    if (!/\bG(?:0|1)\b/.test(line)) return
    const next = { ...positions }
    MOTION_AXES.forEach(axis => {
      const value = readNumber(line, axis)
      if (Number.isFinite(value)) next[axis] = absolute ? value : positions[axis] + value
    })
    const segmentDistance = Math.hypot(...MOTION_AXES.map(axis => next[axis] - positions[axis]))
    distance += segmentDistance
    estimatedMinutes += segmentDistance / feed
    Object.assign(positions, next)
    MOTION_AXES.forEach(axis => {
      ranges[axis].minimum = Math.min(ranges[axis].minimum, positions[axis])
      ranges[axis].maximum = Math.max(ranges[axis].maximum, positions[axis])
    })
    movements += 1
  })

  const configured = options.block || {}
  const fromNc = readBlockSetup(source)
  const blockWidth = Math.max(0, Number(fromNc?.blockWidth ?? configured.width) || 0)
  const wireSpan = Math.max(blockWidth, Number(fromNc?.wireSpan ?? configured.wireSpan) || blockWidth)
  const parsedLeftGap = Number(fromNc?.leftGap)
  const parsedRightGap = Number(fromNc?.rightGap)
  const leftGap = Math.max(0, Number.isFinite(parsedLeftGap) ? parsedLeftGap : (wireSpan - blockWidth) / 2)
  const rightGap = Math.max(0, Number.isFinite(parsedRightGap) ? parsedRightGap : wireSpan - blockWidth - leftGap)
  const violations = []
  MOTION_AXES.forEach(axis => {
    const limit = Math.max(0, Number(limits[axis]) || 0)
    if (ranges[axis].minimum < 0) violations.push(`${axis}: мінімум ${ranges[axis].minimum.toFixed(3)} мм нижче нуля`)
    if (limit && ranges[axis].maximum > limit) violations.push(`${axis}: максимум ${ranges[axis].maximum.toFixed(3)} мм перевищує хід ${limit} мм`)
  })

  return {
    ranges, movements, distance, feed, estimatedMinutes, violations,
    safe: movements > 0 && violations.length === 0,
    blockSetup: { wireSpan, blockWidth, leftGap, rightGap, source: fromNc ? 'NC' : 'interface' }
  }
}

export function formatMachineSetupCard(report, options = {}) {
  const block = options.block || {}
  const format = value => Number(value || 0).toFixed(3)
  const time = report.estimatedMinutes < 1
    ? `${Math.max(1, Math.round(report.estimatedMinutes * 60))} с`
    : `${Math.floor(report.estimatedMinutes)} хв ${Math.round((report.estimatedMinutes % 1) * 60)} с`
  return [
    report.safe ? 'ГОТОВО ДО ХОЛОСТОГО ПРОГОНУ' : 'ПОТРІБНА КОРЕКЦІЯ ПЕРЕД ЗАПУСКОМ',
    `Блок: ${Number(block.length) || 0} × ${Number(block.height) || 0} × ${report.blockSetup.blockWidth} мм`,
    `Струна: ${report.blockSetup.wireSpan} мм = лівий проміжок ${format(report.blockSetup.leftGap)} + блок ${report.blockSetup.blockWidth} + правий проміжок ${format(report.blockSetup.rightGap)}`,
    'Нижній контрольний кут блока: X0 / Y0 — точка встановлення робочого нуля',
    `Профіль усередині блока: відступ по довжині ${Number(block.offsetX) || 0} мм; по висоті ${Number(block.offsetY) || 0} мм`,
    ...MOTION_AXES.map(axis => `${axis}: ${format(report.ranges[axis].minimum)}…${format(report.ranges[axis].maximum)} мм`),
    `Синхронних рухів: ${report.movements}; шлях: приблизно ${format(report.distance)} мм; час: приблизно ${time} при F${report.feed}`,
    ...(report.violations.length ? report.violations.map(value => `НЕБЕЗПЕКА: ${value}`) : ['Межі осей: перевірено, виходу за дозволений хід немає']),
    '',
    'ПОРЯДОК УСТАНОВКИ',
    '1. Встановити та закріпити блок за наведеними розмірами.',
    '2. Підвести холодну струну до нижнього контрольного кута блока.',
    '3. Встановити робочий нуль X/Y/A/Z.',
    '4. Перевірити E-stop і кінцевики.',
    '5. Виконати повний холодний прогін без нагрівання.',
    '6. Лише після перевірки дозволяти реальне різання.'
  ].join('\n')
}
