const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hurtSpeech', {
  isAvailable: () => ipcRenderer.invoke('hurt-speech:is-available'),
  speak: (text, rate) => ipcRenderer.invoke('hurt-speech:speak', { text, rate })
})
