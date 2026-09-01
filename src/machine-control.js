const AXES = ['X', 'Y', 'A', 'Z', 'B']

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

  let port = null
  let reader = null
  let writer = null
  let readBuffer = ''
  let statusTimer = 0
  let jobToken = 0
  let paused = false
  let running = false
  const pending = []
  const positions = Object.fromEntries(AXES.map(axis => [axis, 0]))

  const log = (message, kind = '') => {
    const stamp = new Date().toLocaleTimeString('uk-UA')
    consoleOutput.textContent += `${stamp}  ${message}\n`
    consoleOutput.scrollTop = consoleOutput.scrollHeight
    controllerMessage.textContent = message
    controllerMessage.dataset.kind = kind
  }

  const setState = state => {
    machineState.textContent = state
    machineState.dataset.state = state.toLowerCase()
  }

  const renderPositions = () => {
    AXES.forEach(axis => {
      const output = root.querySelector(`[data-machine-position="${axis}"]`)
      if (output) output.textContent = Number(positions[axis] || 0).toFixed(3)
    })
  }

  const parseStatus = line => {
    if (!line.startsWith('<')) return
    const state = line.slice(1).split('|')[0]
    setState(state === 'Idle' ? 'Готовий' : state === 'Run' ? 'Виконується' : state === 'Hold' ? 'Пауза' : state)
    const coords = line.match(/(?:MPos|WPos):([^|>]+)/)?.[1]?.split(',').map(Number)
    if (coords) AXES.forEach((axis, index) => { if (Number.isFinite(coords[index])) positions[axis] = coords[index] })
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
      if (mode.value === 'simulation') { positions[axis] += distance; renderPositions() }
    } catch (error) { log(error.message, 'error') }
  }))

  el('machineHome').addEventListener('click', () => send('$H').catch(error => log(error.message, 'error')))
  el('machineUnlock').addEventListener('click', () => send('$X').catch(error => log(error.message, 'error')))
  el('machineZero').addEventListener('click', async () => {
    try {
      const response = await send('G10 L20 P1 X0 Y0 A0 Z0 B0')
      if (response !== 'ok') throw new Error(response)
      AXES.forEach(axis => { positions[axis] = 0 }); renderPositions(); log('Робочий нуль X/Y/A/Z/B встановлено', 'success')
    } catch (error) { log(error.message, 'error') }
  })

  loadCurrentNc.addEventListener('click', () => {
    ncText.value = getNcText?.() || ''
    log(ncText.value ? 'Поточний NC завантажено у пульт' : 'У Simulator ще немає готового NC', ncText.value ? 'success' : 'error')
  })
  ncFile.addEventListener('change', async () => {
    const file = ncFile.files?.[0]
    if (!file) return
    ncText.value = await file.text()
    log(`Відкрито ${file.name}`, 'success')
  })

  run.addEventListener('click', async () => {
    if (running && paused) {
      paused = false; await writeRaw('~'); setState('Виконується'); pause.textContent = 'Пауза'; log('Виконання продовжено'); return
    }
    if (running) return
    try {
      if (!ncText.value.trim()) throw new Error('Спочатку завантажте NC')
      if (mode.value !== 'simulation' && !interlock.checked) throw new Error('Не підтверджено E-stop, кінцевики та холодний прогін')
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
    } catch (error) { setState('Помилка'); log(error.message, 'error') }
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

  renderPositions()
  mode.dispatchEvent(new Event('change'))
}
