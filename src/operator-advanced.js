const formatDuration = seconds => {
  const safe = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const rest = safe % 60
  return [hours ? `${hours} год` : '', minutes ? `${minutes} хв` : '', `${rest} с`].filter(Boolean).join(' ')
}

export const estimateCutTime = (segments = [], options = {}) => {
  const motionSeconds = segments.reduce((sum, segment) => sum + Math.max(0, Number(segment.durationSeconds) || 0), 0)
  const serviceSeconds = Math.max(0, Number(options.warmupSeconds) || 0) + segments.length * Math.max(0, Number(options.commandDelaySeconds) || 0)
  return { motionSeconds, serviceSeconds, totalSeconds: motionSeconds + serviceSeconds, label: formatDuration(motionSeconds + serviceSeconds) }
}

export const prioritizeWarnings = findings => [...(findings || [])]
  .map(item => ({ ...item, priority: item.severity === 'danger' ? 3 : Number.isFinite(item.clearance) && item.clearance <= 2 ? 2 : /прискорення|розворот/i.test(item.type) ? 2 : 1 }))
  .sort((a, b) => b.priority - a.priority || (a.lineNumber || 0) - (b.lineNumber || 0))

export const assessWire = ({ mode = 'none', continuity = true, tensionPercent = 100 } = {}) => {
  if (mode === 'none') return { level: 'attention', label: 'Датчик не підключено', action: 'Перед запуском перевірте струну вручну.' }
  if (!continuity) return { level: 'stop', label: 'Обрив струни', action: 'Зупиніть рух і нагрів; замініть або закріпіть струну.' }
  const tension = Number(tensionPercent)
  if (!Number.isFinite(tension) || tension < 70) return { level: 'stop', label: 'Слабкий натяг', action: 'Зупиніть роботу та відновіть натяг струни.' }
  if (tension < 85 || tension > 115) return { level: 'attention', label: `Натяг ${tension}%`, action: 'Перевірте натяг і калібрування датчика.' }
  return { level: 'normal', label: `Струна справна · ${tension}%`, action: 'Продовжуйте спостереження.' }
}

export const recommendHeat = ({ material = 'eps', thickness = 100, feed = 300, wireDiameter = 0.3 } = {}) => {
  const base = material === 'xps' ? 42 : material === 'epp' ? 48 : 36
  const estimate = Math.round(Math.max(15, Math.min(85, base + Number(thickness) / 25 + Number(feed) / 120 - Number(wireDiameter) * 8)))
  return { minimum: Math.max(10, estimate - 5), maximum: Math.min(90, estimate + 5), unit: '%', note: 'Початковий орієнтир для холодного налаштування; фактичний нагрів визначається пробним різом на відході.' }
}

export const createResumePlan = ({ lineNumber, command, positions }) => ({
  resumable: false,
  title: `Контрольна точка біля рядка ${lineNumber || '—'}`,
  text: [
    'Автоматичне продовження заблоковано.',
    '1. Вимкнути нагрів і з’ясувати причину паузи.',
    '2. Виконати homing та повторно встановити робочий нуль.',
    `3. Звірити координати: ${Object.entries(positions || {}).map(([axis, value]) => `${axis}${Number(value).toFixed(3)}`).join(' ')}.`,
    `4. Перевірити рядок NC ${lineNumber || '—'}: ${command || 'команду не зафіксовано'}.`,
    '5. Виконати новий холодний прогін від безпечної точки входу. Не починати різання безпосередньо із середини контуру.'
  ].join('\n')
})

export const formatCompletedRun = data => [
  'ПІДСУМКОВА ДОПОВІДЬ ГУРТ',
  `Результат: ${data.result}`,
  `Початок: ${data.startedAt || '—'}`,
  `Завершення: ${data.finishedAt || '—'}`,
  `Тривалість: ${formatDuration(data.elapsedSeconds)}`,
  `Виконано команд: ${data.completedLines || 0} із ${data.totalLines || 0}`,
  `Попереджень аналізу: ${data.warningCount || 0}; небезпек: ${data.dangerCount || 0}`,
  `Кінцеві координати: ${Object.entries(data.positions || {}).map(([axis, value]) => `${axis}${Number(value).toFixed(3)}`).join(' ')}`
].join('\n')
