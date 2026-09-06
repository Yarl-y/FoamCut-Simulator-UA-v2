export const assessOperatorState = context => {
  const checks = context.installationChecks || {}
  const missingChecks = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name)
  const stopReasons = []
  if (context.alarm) stopReasons.push('Контролер повідомив аварію')
  if (context.running && !context.connected) stopReasons.push('Під час виконання втрачено зв’язок')
  if (context.validation?.valid === false) stopReasons.push('NC не пройшов перевірку')
  if (context.dynamics?.dangerCount > 0) stopReasons.push(`Аналіз знайшов небезпек: ${context.dynamics.dangerCount}`)
  if (context.wire?.level === 'stop') stopReasons.push(context.wire.label)
  if (stopReasons.length) return {
    level: 'stop', label: 'СТОП', reason: stopReasons.join('. '),
    action: 'Не запускайте або негайно зупиніть рух. Усуньте причину, повторіть перевірку та холодний прогін.'
  }

  const warnings = []
  if (context.simulation) warnings.push('Працюємо в симуляції — фізичний стан станка не підтверджено')
  else if (!context.connected) warnings.push('Контролер не підключено')
  if (!context.hasNc) warnings.push('NC ще не завантажено')
  if (context.hasNc && !context.validation) warnings.push('NC ще не перевірено')
  if (context.dynamics?.warningCount > 0 && !context.warningsAcknowledged) warnings.push(`Не переглянуто попереджень аналізу: ${context.dynamics.warningCount}`)
  if (!context.machineZeroKnown) warnings.push('Прив’язка робочого нуля до машинних координат невідома')
  if (missingChecks.length) warnings.push(`Не підтверджено дій оператора: ${missingChecks.length}`)
  if (context.wire?.level === 'attention') warnings.push(context.wire.label)
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

export const buildOperatorSignals = context => {
  const checks = context.installationChecks || {}
  const checkValues = Object.values(checks)
  const checkedCount = checkValues.filter(Boolean).length
  const analysis = context.dynamics
  return [
    {
      id: 'connection', label: 'Зв’язок',
      state: context.simulation ? 'attention' : context.connected ? 'normal' : 'stop',
      value: context.simulation ? 'Симуляція' : context.connected ? 'Контролер підключено' : 'Немає зв’язку'
    },
    {
      id: 'nc', label: 'NC-програма',
      state: !context.hasNc ? 'attention' : context.validation?.valid === false ? 'stop' : context.validation?.valid ? 'normal' : 'attention',
      value: !context.hasNc ? 'Не завантажено' : context.validation?.valid === false ? 'Є помилки' : context.validation?.valid ? 'Перевірено' : 'Очікує перевірки'
    },
    {
      id: 'zero', label: 'Машинний нуль',
      state: context.machineZeroKnown ? 'normal' : 'attention',
      value: context.machineZeroKnown ? 'Прив’язка відома' : 'Прив’язка невідома'
    },
    {
      id: 'checks', label: 'Дії оператора',
      state: checkValues.length > 0 && checkedCount === checkValues.length ? 'normal' : 'attention',
      value: `${checkedCount} із ${checkValues.length}`
    },
    {
      id: 'analysis', label: 'Аналіз рухів',
      state: !analysis ? 'attention' : analysis.dangerCount ? 'stop' : analysis.warningCount && !context.warningsAcknowledged ? 'attention' : 'normal',
      value: !analysis ? 'Не виконано' : analysis.dangerCount ? `Небезпек: ${analysis.dangerCount}` : analysis.warningCount
        ? `Переглянуто: ${analysis.warningCount}` : 'Без зауважень'
    },
    {
      id: 'wire', label: 'Струна', state: context.wire?.level || 'attention',
      value: context.wire?.label || 'Немає даних'
    }
  ]
}

export const buildOperatorSteps = context => {
  const steps = []
  if (!context.hasNc) steps.push('Завантажити NC-програму.')
  else if (!context.validation) steps.push('Перевірити NC-програму.')
  else if (!context.validation.valid) steps.push('Виправити помилки NC та виконати перевірку повторно.')
  if (!context.dynamics) steps.push('Підготувати карту встановлення й виконати аналіз рухів.')
  else if (context.dynamics.dangerCount) steps.push('Усунути всі небезпеки, зазначені в аналізі рухів.')
  else if (context.dynamics.warningCount && !context.warningsAcknowledged) steps.push('Розгорнути групи попереджень, переглянути всі спрацювання та підтвердити їх розгляд.')
  if (!context.machineZeroKnown) steps.push('Біля станка виконати homing і внести машинні координати робочого нуля.')
  const missing = Object.entries(context.installationChecks || {}).filter(([, done]) => !done)
  if (missing.length) steps.push(`Завершити фізичні дії оператора: ${missing.length}.`)
  if (context.simulation) steps.push('Для реальної роботи підключити контролер; симуляція не підтверджує стан обладнання.')
  if (context.wire?.level === 'stop') steps.unshift(context.wire.action)
  else if (context.wire?.level === 'attention') steps.push(context.wire.action)
  if (!steps.length) steps.push(context.running ? 'Спостерігати за виконанням і тримати E-stop доступним.' : 'Виконати контрольований запуск за технологічною картою.')
  return steps
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
