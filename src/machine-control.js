import { validateVirtualProgram, VirtualFluidNC, VIRTUAL_AXES } from './virtual-fluidnc.js'
import { calculateCalibratedSteps, createControllerPlan } from './controller-setup.js'

const AXES = VIRTUAL_AXES
const STATUS_AXES = ['X', 'Y', 'Z', 'A', 'B']

const stripForColdRun = line => line
  .replace(/\bM(?:3|4)\b/gi, '')
  .replace(/\bS[-+]?\d*\.?\d+\b/gi, '')
  .replace(/\s+/g, ' ')
  .trim()

export function initializeMachineControl({ getNcText }) {
  const root = document.getElementById('machineControlWorkspace')
  if (!root) return

  const el = id => root.querySelector(`#${id}`)
  const mode = el('machineMode')
  const connect = el('machineConnect')
  const connection = el('machineConnection')
  const machineState = el('machineState')
  const controllerMessage = el('machineControllerMessage')
  const consoleOutput = el('machineConsole')
  const ncText = el('machineNcText')
  const ncFile = el('machineNcFile')
  const loadCurrentNc = el('machineLoadCurrentNc')
  const run = el('machineRun')
  const pause = el('machinePause')
  const stop = el('machineStop')
  const reset = el('machineReset')
  const coldRun = el('machineColdRun')
  const interlock = el('machineInterlock')
  const progress = el('machineProgress')
  const progressText = el('machineProgressText')
  const jogStep = el('machineJogStep')
  const jogFeed = el('machineJogFeed')
  const heat = el('machineHeat')
  const command = el('machineCommand')
  const sendCommand = el('machineSendCommand')
  const profileInputs = Object.fromEntries(AXES.map(axis => [axis, el(`machineLimit${axis}`)]))
  const saveProfile = el('machineSaveProfile')
  const estop = el('machineVirtualEstop')
  const clearEstop = el('machineVirtualClearEstop')
  const loseConnection = el('machineVirtualDisconnect')
  const validateNc = el('machineValidateNc')
  const validationReport = el('machineValidationReport')
  const maximumFeed = el('machineMaximumFeed')
  const acceleration = el('machineAcceleration')
  const axisBEnabled = el('machineAxisBEnabled')
  const stepsInputs = Object.fromEntries(AXES.map(axis => [axis, el(`machineSteps${axis}`)]))
  const directionInputs = Object.fromEntries(AXES.map(axis => [axis, el(`machineDirection${axis}`)]))
  const journalBody = el('machineJournalBody')
  const downloadJournal = el('machineDownloadJournal')
  const clearJournal = el('machineClearJournal')
  const setupController = el('setupControllerModel')
  const setupNotes = el('setupControllerNotes')
  const setupStatus = el('setupStatus')
  const setupExport = el('setupExportPlan')
  const setupYaml = el('setupGenerateYaml')

  let port = null
  let reader = null
  let writer = null
  let readBuffer = ''
  let statusTimer = 0
  let jobToken = 0
  let paused = false
  let running = false
  let zeroConfirmed = false
  const pending = []
  const positions = Object.fromEntries(AXES.map(axis => [axis, 0]))
  const getLimits = () => Object.fromEntries(AXES.map(axis => [axis, Math.max(0, Number(profileInputs[axis].value) || 0)]))
  const virtualController = new VirtualFluidNC(getLimits())
  const journal = []

  const getProfile = () => ({
    limits: getLimits(),
    maximumFeed: Math.max(1, Number(maximumFeed.value) || 1000),
    acceleration: Math.max(1, Number(acceleration.value) || 100),
    axisBEnabled: axisBEnabled.checked,
    stepsPerMm: Object.fromEntries(AXES.map(axis => [axis, Math.max(0.001, Number(stepsInputs[axis].value) || 1)])),
    reversed: Object.fromEntries(AXES.map(axis => [axis, directionInputs[axis].checked]))
  })

  const renderJournal = () => {
    journalBody.replaceChildren(...journal.slice(-120).reverse().map(entry => {
      const row = document.createElement('tr')
      ;[entry.time, entry.type, entry.message, entry.coordinates].forEach(value => {
        const cell = document.createElement('td')
        cell.textContent = value
        row.appendChild(cell)
      })
      return row
    }))
  }

  const addJournal = (type, message) => {
    journal.push({
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString('uk-UA'),
      type,
      message,
      coordinates: AXES.map(axis => `${axis}${Number(positions[axis]).toFixed(3)}`).join(' ')
    })
    renderJournal()
  }

  const getSetupChecks = () => Object.fromEntries(
    [...root.querySelectorAll('[data-setup-check]')].map(input => [input.dataset.setupCheck, input.checked])
  )

  const renderSetupStatus = () => {
    const checks = getSetupChecks()
    const done = Object.values(checks).filter(Boolean).length
    const total = Object.keys(checks).length
    const controllerKnown = setupController.value !== 'unknown'
    setupStatus.className = done === total && controllerKnown ? 'setup-status ready' : 'setup-status'
    setupStatus.textContent = controllerKnown
      ? `Виконано ${done} із ${total} перевірок. План можна зберігати; YAML очікує карту контактів.`
      : `Виконано ${done} із ${total} перевірок. Спочатку визначимо контролер після приїзду станка.`
    setupYaml.disabled = true
  }

  const log = (message, kind = '') => {
    const stamp = new Date().toLocaleTimeString('uk-UA')
    consoleOutput.textContent += `${stamp}  ${message}\n`
    consoleOutput.scrollTop = consoleOutput.scrollHeight
    controllerMessage.textContent = message
    controllerMessage.dataset.kind = kind
    addJournal(kind || 'INFO', message)
  }

  const setState = state => {
    machineState.textContent = state
    machineState.dataset.state = state.toLowerCase()
  }

  const renderPositions = () => {
    AXES.forEach(axis => {
      const output = root.querySelector(`[data-machine-position="${axis}"]`)
      if (output) output.textContent = Number(positions[axis] || 0).toFixed(3)
      root.querySelector(`[data-limit-min="${axis}"]`)?.classList.toggle('active', positions[axis] <= 0.0001)
      root.querySelector(`[data-limit-max="${axis}"]`)?.classList.toggle('active', positions[axis] >= getLimits()[axis] - 0.0001)
    })
  }

  const runValidation = () => {
    const report = validateVirtualProgram(ncText.value, {
      limits: getLimits(), startPositions: positions, maximumFeed: maximumFeed.value,
      zeroConfirmed, coldRun: coldRun.checked,
      enabledAxes: axisBEnabled.checked ? AXES : AXES.filter(axis => axis !== 'B')
    })
    const final = AXES.map(axis => `${axis}${report.finalPositions[axis].toFixed(3)}`).join(' ')
    validationReport.className = report.valid ? 'machine-validation valid' : 'machine-validation invalid'
    validationReport.textContent = [
      report.valid ? 'NC перевірено: запуск дозволено' : 'NC не готовий до запуску',
      `Рухів: ${report.movements}; найбільша швидкість: F${report.maximumFeed || 0}`,
      `Кінцева позиція: ${final}`,
      ...report.errors.map(value => `ПОМИЛКА: ${value}`),
      ...report.warnings.map(value => `УВАГА: ${value}`)
    ].join('\n')
    return report
  }

  const parseStatus = line => {
    if (!line.startsWith('<')) return
    const state = line.slice(1).split('|')[0]
    setState(state === 'Idle' ? 'Готовий' : state === 'Run' ? 'Виконується' : state === 'Hold' ? 'Пауза' : state)
    const coords = line.match(/(?:MPos|WPos):([^|>]+)/)?.[1]?.split(',').map(Number)
    if (coords) STATUS_AXES.forEach((axis, index) => { if (Number.isFinite(coords[index])) positions[axis] = coords[index] })
    renderPositions()
  }

  const handleLine = line => {
    const value = line.trim()
    if (!value) return
    parseStatus(value)
    if (value === 'ok' || value.startsWith('error:') || value.startsWith('ALARM:')) {
      pending.shift()?.(value)
      if (value !== 'ok') log(value, 'error')
    } else if (!value.startsWith('<')) log(`FluidNC: ${value}`)
  }

  const readLoop = async () => {
    const decoder = new TextDecoder()
    try {
      while (reader) {
        const { value, done } = await reader.read()
        if (done) break
        readBuffer += decoder.decode(value, { stream: true })
        const lines = readBuffer.split(/\r?\n/)
        readBuffer = lines.pop() || ''
        lines.forEach(handleLine)
      }
    } catch (error) {
      log(`Зв’язок перервано: ${error.message}`, 'error')
    }
  }

  const writeRaw = async value => {
    if (mode.value === 'simulation') return
    if (!writer) throw new Error('Контролер не підключено')
    await writer.write(new TextEncoder().encode(value))
  }

  const send = async value => {
    const line = value.trim()
    if (!line) return 'ok'
    if (mode.value === 'simulation') {
      log(`SIM → ${line}`)
      await new Promise(resolve => setTimeout(resolve, 18))
      virtualController.setLimits(getLimits())
      const result = virtualController.execute(line)
      Object.assign(positions, result.positions)
      renderPositions()
      if (!result.ok) { setState('Alarm'); return result.error }
      if (result.state === 'Run') setState('Виконується')
      return 'ok'
    }
    await writeRaw(`${line}\n`)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Немає відповіді на: ${line}`)), 12000)
      pending.push(response => { clearTimeout(timeout); resolve(response) })
    })
  }

  const disconnect = async () => {
    jobToken += 1
    clearInterval(statusTimer)
    statusTimer = 0
    try { await reader?.cancel() } catch {}
    try { reader?.releaseLock() } catch {}
    try { writer?.releaseLock() } catch {}
    try { await port?.close() } catch {}
    reader = null; writer = null; port = null
    connect.textContent = 'Підключити'
    connection.textContent = mode.value === 'simulation' ? 'Симуляція' : 'Не підключено'
    setState('Не підключено')
  }

  const connectSerial = async () => {
    if (!('serial' in navigator)) throw new Error('Web Serial недоступний у цьому середовищі')
    port = await navigator.serial.requestPort()
    await port.open({ baudRate: 115200 })
    reader = port.readable.getReader()
    writer = port.writable.getWriter()
    readLoop()
    connection.textContent = 'USB підключено'
    connect.textContent = 'Відключити'
    setState('Очікування')
    statusTimer = setInterval(() => writeRaw('?').catch(() => {}), 350)
    log('USB-з’єднання з FluidNC встановлено', 'success')
  }

  mode.addEventListener('change', async () => {
    await disconnect()
    const simulation = mode.value === 'simulation'
    connection.textContent = simulation ? 'Симуляція' : 'Не підключено'
    connect.disabled = simulation
    interlock.disabled = simulation
    interlock.checked = simulation
    setState(simulation ? 'Готовий' : 'Не підключено')
    zeroConfirmed = false
    log(simulation ? 'Увімкнено безпечний режим симуляції' : 'Оберіть USB-порт Root Controller')
  })

  connect.addEventListener('click', async () => {
    try { port ? await disconnect() : await connectSerial() } catch (error) { await disconnect(); log(error.message, 'error') }
  })

  root.querySelectorAll('[data-jog-axis]').forEach(button => button.addEventListener('click', async () => {
    const axis = button.dataset.jogAxis
    const distance = Number(jogStep.value) * Number(button.dataset.jogDirection)
    const feed = Math.max(1, Number(jogFeed.value) || 300)
    try {
      if (mode.value !== 'simulation' && !interlock.checked) throw new Error('Спочатку підтвердьте готовність E-stop і холодний прогін')
      const response = await send(`$J=G91 ${axis}${distance.toFixed(3)} F${feed.toFixed(0)}`)
      if (response !== 'ok') throw new Error(response)
    } catch (error) { log(error.message, 'error') }
  }))

  el('machineHome').addEventListener('click', async () => {
    try {
      const response = await send('$H')
      if (response !== 'ok') throw new Error(response)
      setState('Готовий'); log('Пошук дому завершено, координати обнулено', 'success')
      zeroConfirmed = true
    } catch (error) { log(error.message, 'error') }
  })
  el('machineUnlock').addEventListener('click', async () => {
    try {
      const response = await send('$X')
      if (response !== 'ok') throw new Error(response)
      setState('Готовий'); log('Alarm скинуто', 'success')
    } catch (error) { log(error.message, 'error') }
  })
  el('machineZero').addEventListener('click', async () => {
    try {
      const response = await send('G10 L20 P1 X0 Y0 A0 Z0 B0')
      if (response !== 'ok') throw new Error(response)
      if (mode.value !== 'simulation') AXES.forEach(axis => { positions[axis] = 0 })
      renderPositions(); log('Робочий нуль X/Y/A/Z/B встановлено', 'success')
      zeroConfirmed = true
    } catch (error) { log(error.message, 'error') }
  })

  loadCurrentNc.addEventListener('click', () => {
    ncText.value = getNcText?.() || ''
    log(ncText.value ? 'Поточний NC завантажено у пульт' : 'У Simulator ще немає готового NC', ncText.value ? 'success' : 'error')
    runValidation()
  })
  ncFile.addEventListener('change', async () => {
    const file = ncFile.files?.[0]
    if (!file) return
    ncText.value = await file.text()
    log(`Відкрито ${file.name}`, 'success')
    runValidation()
  })

  run.addEventListener('click', async () => {
    if (running && paused) {
      paused = false; await writeRaw('~'); setState('Виконується'); pause.textContent = 'Пауза'; log('Виконання продовжено'); return
    }
    if (running) return
    try {
      if (!ncText.value.trim()) throw new Error('Спочатку завантажте NC')
      if (mode.value !== 'simulation' && !interlock.checked) throw new Error('Не підтверджено E-stop, кінцевики та холодний прогін')
      const validation = runValidation()
      if (!validation.valid) throw new Error(validation.errors.join('; '))
      const lines = ncText.value.split(/\r?\n/).map(line => coldRun.checked ? stripForColdRun(line) : line.trim()).filter(Boolean)
      const token = ++jobToken
      running = true; paused = false; pause.disabled = false; stop.disabled = false; run.disabled = true; setState('Виконується')
      for (let index = 0; index < lines.length && token === jobToken; index += 1) {
        while (paused && token === jobToken) await new Promise(resolve => setTimeout(resolve, 50))
        const response = await send(lines[index])
        if (response !== 'ok') throw new Error(response)
        progress.value = index + 1; progress.max = lines.length
        progressText.textContent = `${index + 1} / ${lines.length}`
      }
      if (token === jobToken) { setState('Готовий'); log('NC виконано', 'success') }
    } catch (error) { setState(virtualController.alarm ? 'Alarm' : 'Помилка'); log(error.message, 'error') }
    finally { running = false; paused = false; pause.disabled = true; stop.disabled = true; run.disabled = false; pause.textContent = 'Пауза' }
  })

  pause.addEventListener('click', async () => {
    if (!running) return
    paused = !paused
    await writeRaw(paused ? '!' : '~')
    setState(paused ? 'Пауза' : 'Виконується')
    pause.textContent = paused ? 'Продовжити' : 'Пауза'
  })
  stop.addEventListener('click', async () => {
    jobToken += 1; running = false; paused = false
    try { await writeRaw('!'); await writeRaw('\x18') } catch {}
    setState('Зупинено'); log('Завдання зупинено оператором', 'error')
  })
  reset.addEventListener('click', async () => {
    jobToken += 1; running = false; paused = false; progress.value = 0; progressText.textContent = '0 / 0'
    try { await writeRaw('\x18') } catch {}
    setState(mode.value === 'simulation' ? 'Готовий' : 'Очікування'); log('Стан пульта скинуто')
  })

  sendCommand.addEventListener('click', async () => {
    try { const response = await send(command.value); log(`← ${response}`); command.value = '' } catch (error) { log(error.message, 'error') }
  })
  command.addEventListener('keydown', event => { if (event.key === 'Enter') sendCommand.click() })
  heat.addEventListener('click', () => log('Нагрів заблокований до затвердження силової схеми Root Controller', 'error'))

  saveProfile.addEventListener('click', () => {
    virtualController.setLimits(getLimits())
    try { localStorage.setItem('foamcut-machine-profile', JSON.stringify(getProfile())) } catch {}
    log('Профіль віртуального станка збережено', 'success')
  })
  estop.addEventListener('click', () => {
    if (mode.value !== 'simulation') return
    jobToken += 1; running = false; paused = false
    virtualController.emergencyStop()
    setState('Alarm'); log('ALARM: натиснуто віртуальний E-stop', 'error')
  })
  clearEstop.addEventListener('click', () => {
    if (mode.value !== 'simulation') return
    virtualController.unlock(); setState('Готовий'); log('Віртуальний E-stop скинуто', 'success')
  })
  loseConnection.addEventListener('click', () => {
    if (mode.value !== 'simulation') return
    jobToken += 1; running = false; paused = false
    virtualController.emergencyStop('Втрачено зв’язок із контролером')
    setState('Alarm'); connection.textContent = 'Зв’язок втрачено'; log('ALARM: змодельовано втрату зв’язку', 'error')
  })
  validateNc.addEventListener('click', runValidation)
  ncText.addEventListener('input', () => { validationReport.textContent = 'NC змінено — виконайте перевірку ще раз'; validationReport.className = 'machine-validation' })
  coldRun.addEventListener('change', runValidation)
  downloadJournal.addEventListener('click', () => {
    const payload = {
      format: 'FoamCut Simulator execution journal', version: 1,
      exportedAt: new Date().toISOString(), profile: getProfile(), entries: journal
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `foamcut-journal-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click()
    URL.revokeObjectURL(url)
  })
  clearJournal.addEventListener('click', () => { journal.length = 0; renderJournal(); log('Журнал поточного сеансу очищено') })

  root.querySelectorAll('[data-calibrate-axis]').forEach(button => button.addEventListener('click', () => {
    const axis = button.dataset.calibrateAxis
    const commanded = el(`setupCommanded${axis}`)
    const measured = el(`setupMeasured${axis}`)
    const result = root.querySelector(`[data-calibration-result="${axis}"]`)
    try {
      const value = calculateCalibratedSteps(stepsInputs[axis].value, commanded.value, measured.value)
      stepsInputs[axis].value = value.toFixed(4)
      result.textContent = `${value.toFixed(4)} кроків/мм — застосовано до профілю`
      result.dataset.kind = 'success'
      log(`Калібрування ${axis}: ${value.toFixed(4)} кроків/мм`, 'success')
    } catch (error) {
      result.textContent = error.message
      result.dataset.kind = 'error'
    }
  }))
  root.querySelectorAll('[data-setup-check]').forEach(input => input.addEventListener('change', renderSetupStatus))
  setupController.addEventListener('change', renderSetupStatus)
  setupExport.addEventListener('click', () => {
    const plan = createControllerPlan({
      profile: getProfile(), controller: setupController.value,
      checks: getSetupChecks(), notes: setupNotes.value
    })
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'foamcut-controller-setup-plan.json'
    link.click()
    URL.revokeObjectURL(url)
    log('План першого підключення збережено', 'success')
  })
  setupYaml.addEventListener('click', () => log('YAML заблокований до визначення плати та контактів', 'error'))

  try {
    const saved = JSON.parse(localStorage.getItem('foamcut-machine-profile') || 'null')
    if (saved) {
      const savedLimits = saved.limits || saved
      AXES.forEach(axis => {
        if (Number.isFinite(Number(savedLimits[axis]))) profileInputs[axis].value = savedLimits[axis]
        if (Number.isFinite(Number(saved.stepsPerMm?.[axis]))) stepsInputs[axis].value = saved.stepsPerMm[axis]
        directionInputs[axis].checked = Boolean(saved.reversed?.[axis])
      })
      if (Number.isFinite(Number(saved.maximumFeed))) maximumFeed.value = saved.maximumFeed
      if (Number.isFinite(Number(saved.acceleration))) acceleration.value = saved.acceleration
      if (typeof saved.axisBEnabled === 'boolean') axisBEnabled.checked = saved.axisBEnabled
    }
  } catch {}

  renderSetupStatus()
  renderPositions()
  mode.dispatchEvent(new Event('change'))
}
