import { validateVirtualProgram, VirtualFluidNC } from './virtual-fluidnc.js'

export const sanitizeColdRunLine = line => String(line)
  .replace(/\bM(?:3|4)\b/gi, '')
  .replace(/\bS[-+]?\d*\.?\d+\b/gi, '')
  .replace(/\s+/g, ' ')
  .trim()

const scenario = (name, run) => {
  try {
    const detail = run()
    return { name, passed: true, detail: detail || 'Перевірку пройдено' }
  } catch (error) {
    return { name, passed: false, detail: error.message }
  }
}

export function runSafetyScenarios(profile = {}) {
  const limits = profile.limits || { X: 600, Y: 600, A: 600, Z: 600, B: 360 }
  const feed = profile.maximumFeed || 1000
  const results = [
    scenario('М’яка межа осі', () => {
      const controller = new VirtualFluidNC(limits)
      const result = controller.execute(`G90 G1 X${limits.X + 1}`)
      if (result.ok || controller.state !== 'Alarm') throw new Error('Рух поза межею не створив Alarm')
      return result.error
    }),
    scenario('E-stop блокує рух', () => {
      const controller = new VirtualFluidNC(limits)
      controller.execute('G1 X10')
      controller.emergencyStop()
      const result = controller.execute('G1 X20')
      if (result.ok || controller.positions.X !== 10) throw new Error('Після E-stop координата змінилася')
      return 'Рух зупинено, координата збережена'
    }),
    scenario('Відновлення після Alarm', () => {
      const controller = new VirtualFluidNC(limits)
      controller.emergencyStop()
      controller.execute('$X')
      controller.execute('$H')
      if (controller.state !== 'Idle' || Object.values(controller.positions).some(value => value !== 0)) throw new Error('Стан не повернувся до Idle/нуля')
      return 'Потрібні $X і $H; після них стан Idle'
    }),
    scenario('Втрата зв’язку', () => {
      const controller = new VirtualFluidNC(limits)
      controller.execute('G1 Y10')
      controller.emergencyStop('Втрачено зв’язок')
      if (controller.state !== 'Alarm' || !controller.alarm.includes('зв’язок')) throw new Error('Втрату зв’язку не зафіксовано')
      return 'Контролер перейшов у Alarm'
    }),
    scenario('Обмеження швидкості', () => {
      const report = validateVirtualProgram(`G1 X1 F${feed + 1}`, { limits, zeroConfirmed: true, maximumFeed: feed })
      if (report.valid || !report.errors.some(value => value.includes('Швидкість'))) throw new Error('Надмірну швидкість дозволено')
      return report.errors.find(value => value.includes('Швидкість'))
    }),
    scenario('Вимкнена вісь B', () => {
      const report = validateVirtualProgram('G1 B10 F100', { limits, zeroConfirmed: true, maximumFeed: feed, enabledAxes: ['X', 'Y', 'A', 'Z'] })
      if (report.valid || !report.errors.some(value => value.includes('вісь B'))) throw new Error('Рух B не заблоковано')
      return 'Команду B заблоковано'
    }),
    scenario('Холодний прогін без нагріву', () => {
      const source = 'M3 S750 G1 X10 F300'
      const sanitized = sanitizeColdRunLine(source)
      if (/\bM(?:3|4)\b|\bS\d/i.test(sanitized) || !sanitized.includes('G1 X10')) throw new Error('Команда нагріву не вилучена або рух втрачено')
      return `${source} → ${sanitized}`
    })
  ]
  return { passed: results.every(result => result.passed), results, testedAt: new Date().toISOString() }
}
