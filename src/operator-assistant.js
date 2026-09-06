export const assessOperatorState = context => {
  const checks = context.installationChecks || {}
  const missingChecks = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name)
  const stopReasons = []
  if (context.alarm) stopReasons.push('Контролер повідомив аварію')
  if (context.running && !context.connected) stopReasons.push('Під час виконання втрачено зв’язок')
  if (context.validation?.valid === false) stopReasons.push('NC не пройшов перевірку')
  if (context.dynamics?.dangerCount > 0) stopReasons.push(`Аналіз знайшов небезпек: ${context.dynamics.dangerCount}`)
  if (stopReasons.length) return {
    level: 'stop', label: 'СТОП', reason: stopReasons.join('. '),
    action: 'Не запускайте або негайно зупиніть рух. Усуньте причину, повторіть перевірку та холодний прогін.'
  }

  const warnings = []
  if (context.simulation) warnings.push('Працюємо в симуляції — фізичний стан станка не підтверджено')
  else if (!context.connected) warnings.push('Контролер не підключено')
  if (!context.hasNc) warnings.push('NC ще не завантажено')
  if (context.hasNc && !context.validation) warnings.push('NC ще не перевірено')
  if (context.dynamics?.warningCount > 0) warnings.push(`Попереджень аналізу: ${context.dynamics.warningCount}`)
  if (!context.machineZeroKnown) warnings.push('Прив’язка робочого нуля до машинних координат невідома')
  if (missingChecks.length) warnings.push(`Не підтверджено дій оператора: ${missingChecks.length}`)
  if (warnings.length) return {
    level: 'attention', label: 'УВАГА', reason: warnings.join('. '),
    action: context.simulation
      ? 'Можна аналізувати файл. Реальний запуск дозволяйте лише біля станка після всіх фізичних перевірок.'
      : 'Завершіть указані перевірки, після чого повторіть аналіз і холодний прогін.'
  }

  return {
    level: 'normal', label: 'НОРМА', reason: context.running ? 'Параметри в нормі, завдання виконується' : 'Перевірки завершено, аварійних ознак немає',
    action: context.running ? 'Спостерігайте за струною, каретками та звуком станка; тримайте E-stop доступним.' : 'Можна переходити до наступного контрольованого етапу за технологічною картою.'
  }
}

export const formatOperatorReport = ({ assessment, context, positions, journal }) => [
  'ПОМІЧНИК ОПЕРАТОРА ГУРТ',
  `Час: ${new Date().toLocaleString('uk-UA')}`,
  `Стан: ${assessment.label}`,
  `Причина: ${assessment.reason}`,
  `Порада: ${assessment.action}`,
  `Режим: ${context.simulation ? 'симуляція' : 'реальний контролер'}`,
  `Координати: ${Object.entries(positions).map(([axis, value]) => `${axis}${Number(value).toFixed(3)}`).join(' ')}`,
  '', 'Останні події:',
  ...(journal.slice(-20).map(entry => `${entry.time} [${entry.type}] ${entry.message} · ${entry.coordinates}`))
].join('\n')
