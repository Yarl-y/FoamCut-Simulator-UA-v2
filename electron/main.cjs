const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
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
  // Pass speech text as ASCII-safe Base64. Reading UTF-8 directly from a
  // redirected console depends on the Windows code page and can turn
  // Ukrainian letters into character codes on another computer.
  const encodedText = Buffer.from(text, 'utf8').toString('base64')
  const script = [
    'Add-Type -AssemblyName System.Speech',
    `$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedText}'))`,
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
    child.stdin.end()
  })
})

const LLAMA_BASE_URL = 'http://127.0.0.1:8080'
const LLAMA_ALIAS = 'qwen3:1.7b'
const LLAMA_ENGINE_DIRECTORY = 'llama.cpp-b10926'
const LLAMA_MODEL_FILENAME = 'Qwen3-1.7B-Q4_K_M.gguf'
const AI_SYSTEM_PROMPT = 'Ти — локальний Помічник оператора ГУРТ для піноріза. Відповідай стисло й зрозуміло українською. Спирайся лише на переданий стан. Чітко розрізняй попередження самого NC-файлу та окремий стан обладнання. Якщо оператор питає про файл, блок, траєкторію або головні попередження, спочатку пояснюй розділ «ПОПЕРЕДЖЕННЯ САМЕ ЦЬОГО NC-ФАЙЛУ» з типами та номерами рядків; не підміняй відповідь відсутнім датчиком чи контролером. Не стверджуй, що різання безпечне, якщо детермінований контроль показує УВАГА або СТОП. Ти не керуєш станком, не видаєш команди руху чи нагріву і не скасовуєш апаратні перевірки. Якщо даних недостатньо — прямо скажи, що оператор має перевірити фізично.'

let managedLlama = null
let managedLlamaToken = ''
let llamaStartup = null

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const requestJson = async (url, options = {}, timeout = 120000) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(timeout)
  })
  if (!response.ok) throw new Error(`Локальний AI відповів ${response.status}`)
  return response.json()
}

const ollamaRequest = (route, options = {}) => requestJson(`http://127.0.0.1:11434${route}`, options)
const uniquePaths = paths => [...new Set(paths.filter(Boolean).map(item => path.resolve(item)))]

const aiDirectoryCandidates = () => uniquePaths([
  process.env.ZHART_AI_DIR,
  process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, '..', '01-AI-МОДЕЛЬ'),
  path.join(path.dirname(process.execPath), '..', '01-AI-МОДЕЛЬ'),
  path.join(__dirname, '..', 'ПЕРЕНОСНА-МАЙСТЕРНЯ-ГУРТ', '01-AI-МОДЕЛЬ')
])

const findLlamaBundle = () => {
  for (const directory of aiDirectoryCandidates()) {
    const engine = path.join(directory, LLAMA_ENGINE_DIRECTORY, 'llama-server.exe')
    const model = path.join(directory, 'models', LLAMA_MODEL_FILENAME)
    if (fs.existsSync(engine) && fs.existsSync(model)) return { directory, engine, model }
  }
  return null
}

const llamaHeaders = token => token ? { Authorization: `Bearer ${token}` } : {}

const probeLlama = async (token = '', timeout = 2500) => {
  await requestJson(`${LLAMA_BASE_URL}/health`, { headers: llamaHeaders(token) }, timeout)
  const data = await requestJson(`${LLAMA_BASE_URL}/v1/models`, { headers: llamaHeaders(token) }, timeout)
  const models = (data.data || []).map(item => item.id).filter(Boolean)
  return {
    provider: 'llama.cpp',
    models: models.length ? models : [LLAMA_ALIAS],
    autonomous: true,
    managed: Boolean(managedLlama && token && token === managedLlamaToken)
  }
}

const stopManagedLlama = async () => {
  const child = managedLlama
  if (!child) {
    managedLlamaToken = ''
    llamaStartup = null
    return false
  }

  await new Promise(resolve => {
    if (child.exitCode !== null || child.killed) return resolve()
    const timeout = setTimeout(resolve, 5000)
    child.once('exit', () => { clearTimeout(timeout); resolve() })
    child.kill()
  })
  if (managedLlama === child) managedLlama = null
  managedLlamaToken = ''
  llamaStartup = null
  return true
}

const startBundledLlama = async () => {
  try { return await probeLlama(managedLlamaToken) } catch {}
  try { return await probeLlama('') } catch {}

  const bundle = findLlamaBundle()
  if (!bundle) throw new Error('Комплект llama.cpp поруч із ЖАРТом не знайдено')

  managedLlamaToken = crypto.randomBytes(24).toString('hex')
  const threads = Math.max(1, Math.min(10, os.cpus().length))
  managedLlama = spawn(bundle.engine, [
    '-m', bundle.model,
    '--host', '127.0.0.1',
    '--port', '8080',
    '-c', '4096',
    '-t', String(threads),
    '--alias', LLAMA_ALIAS,
    '--api-key', managedLlamaToken,
    '--no-webui'
  ], {
    cwd: bundle.directory,
    windowsHide: true,
    stdio: 'ignore'
  })
  const child = managedLlama
  let spawnError = null
  child.once('error', error => { spawnError = error })
  child.once('exit', () => {
    if (managedLlama === child) {
      managedLlama = null
      managedLlamaToken = ''
    }
  })

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (spawnError) throw new Error(`Не вдалося запустити llama-server: ${spawnError.message}`)
    if (child.exitCode !== null) throw new Error(`llama-server завершився з кодом ${child.exitCode}`)
    try { return await probeLlama(managedLlamaToken) } catch { await wait(500) }
  }
  if (!child.killed) child.kill()
  throw new Error('Модель не встигла запуститися за 60 секунд')
}

const ensureBundledLlama = () => {
  if (!llamaStartup) llamaStartup = startBundledLlama().finally(() => { llamaStartup = null })
  return llamaStartup
}

const ollamaModels = async () => {
  const data = await ollamaRequest('/api/tags')
  return { provider: 'Ollama', models: (data.models || []).map(item => item.name).filter(Boolean) }
}

ipcMain.handle('hurt-ai:models', async () => {
  try {
    const result = await ensureBundledLlama()
    return { available: true, ...result }
  } catch (llamaError) {
    try {
      const result = await ollamaModels()
      return { available: true, ...result, fallbackReason: llamaError.message }
    } catch {
      return { available: false, models: [], provider: '', error: llamaError.message }
    }
  }
})

ipcMain.handle('hurt-ai:restart', async () => {
  const stopped = await stopManagedLlama()
  if (!stopped) {
    try {
      const external = await probeLlama('')
      return {
        available: true,
        ...external,
        restarted: false,
        message: 'llama.cpp запущено не ЖАРТом. З’єднання перевірено; сторонній процес не зупинявся.'
      }
    } catch {}
  }
  const result = await ensureBundledLlama()
  return {
    available: true,
    ...result,
    restarted: true,
    message: 'Локальний AI успішно перезапущено.'
  }
})

ipcMain.handle('hurt-ai:ask', async (_event, payload = {}) => {
  const model = String(payload.model || '').trim()
  const question = String(payload.question || '').trim().slice(0, 2000)
  const machineContext = String(payload.context || '').slice(0, 8000)
  if (!/^[\w.:-]{1,80}$/.test(model)) throw new Error('Некоректна назва локальної моделі')
  if (!question) throw new Error('Поставте запитання помічнику')
  const userContent = `/no_think\nСТАН СТАНКА:\n${machineContext}\n\nЗАПИТАННЯ ОПЕРАТОРА:\n${question}`

  try {
    await ensureBundledLlama()
    const data = await requestJson(`${LLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: llamaHeaders(managedLlamaToken),
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ]
      })
    })
    return String(data.choices?.[0]?.message?.content || '').trim()
  } catch (llamaError) {
    try {
      const data = await ollamaRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: userContent }
          ],
          options: { temperature: 0.2 }
        })
      })
      return String(data.message?.content || '').trim()
    } catch {
      throw llamaError
    }
  }
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

app.on('before-quit', () => {
  if (managedLlama && !managedLlama.killed) managedLlama.kill()
})
