const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

const RHVOICE_NAME = 'Volodymyr'
const speechScript = [
  'Add-Type -AssemblyName System.Speech',
  '$text = [Console]::In.ReadToEnd()',
  '$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  `$voice.SelectVoice('${RHVOICE_NAME}')`,
  '$voice = $null'
].join('; ')
let activeSpeech = null

const runPowerShell = ({ script, input = '' }) => new Promise((resolve, reject) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe']
  })
  let errorText = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { errorText += chunk })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve(true) : reject(new Error(errorText.trim() || `PowerShell exited with ${code}`)))
  child.stdin.end(input, 'utf8')
})

ipcMain.handle('hurt-speech:is-available', async () => {
  try { await runPowerShell({ script: speechScript }); return true } catch { return false }
})

ipcMain.handle('hurt-speech:speak', async (_event, payload = {}) => {
  const text = String(payload.text || '').slice(0, 1000)
  if (!text) return false
  if (activeSpeech && !activeSpeech.killed) activeSpeech.kill()
  const rate = Math.max(-10, Math.min(10, Math.round((Number(payload.rate) || 0.95) * 10 - 10)))
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$text = [Console]::In.ReadToEnd()',
    '$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    `$voice.SelectVoice('${RHVOICE_NAME}')`,
    `$voice.Rate = ${rate}`,
    '$voice.Speak($text)'
  ].join('; ')
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe']
    })
    activeSpeech = child
    let errorText = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { errorText += chunk })
    child.once('error', reject)
    child.once('exit', code => {
      if (activeSpeech === child) activeSpeech = null
      code === 0 ? resolve(true) : reject(new Error(errorText.trim() || `PowerShell exited with ${code}`))
    })
    child.stdin.end(text, 'utf8')
  })
})

const ollamaRequest = async (route, options = {}) => {
  const response = await fetch(`http://127.0.0.1:11434${route}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(120000)
  })
  if (!response.ok) throw new Error(`Локальний AI відповів ${response.status}`)
  return response.json()
}

ipcMain.handle('hurt-ai:models', async () => {
  try {
    const data = await ollamaRequest('/api/tags')
    return { available: true, models: (data.models || []).map(item => item.name).filter(Boolean) }
  } catch {
    return { available: false, models: [] }
  }
})

ipcMain.handle('hurt-ai:ask', async (_event, payload = {}) => {
  const model = String(payload.model || '').trim()
  const question = String(payload.question || '').trim().slice(0, 2000)
  const machineContext = String(payload.context || '').slice(0, 8000)
  if (!/^[\w.:-]{1,80}$/.test(model)) throw new Error('Некоректна назва локальної моделі')
  if (!question) throw new Error('Поставте запитання помічнику')
  const data = await ollamaRequest('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      messages: [
        {
          role: 'system',
          content: 'Ти — локальний Помічник оператора ГУРТ для піноріза. Відповідай стисло й зрозуміло українською. Спирайся лише на переданий стан. Чітко розрізняй попередження самого NC-файлу та окремий стан обладнання. Якщо оператор питає про файл, блок, траєкторію або головні попередження, спочатку пояснюй розділ «ПОПЕРЕДЖЕННЯ САМЕ ЦЬОГО NC-ФАЙЛУ» з типами та номерами рядків; не підміняй відповідь відсутнім датчиком чи контролером. Не стверджуй, що різання безпечне, якщо детермінований контроль показує УВАГА або СТОП. Ти не керуєш станком, не видаєш команди руху чи нагріву і не скасовуєш апаратні перевірки. Якщо даних недостатньо — прямо скажи, що оператор має перевірити фізично.'
        },
        { role: 'user', content: `СТАН СТАНКА:\n${machineContext}\n\nЗАПИТАННЯ ОПЕРАТОРА:\n${question}` }
      ],
      options: { temperature: 0.2 }
    })
  })
  return String(data.message?.content || '').trim()
})

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    title: 'Жарт CAD/CAM Studio UA',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  window.removeMenu()
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
