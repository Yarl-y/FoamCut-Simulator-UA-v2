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
