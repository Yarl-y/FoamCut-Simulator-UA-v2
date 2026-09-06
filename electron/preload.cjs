const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hurtSpeech', {
  isAvailable: () => ipcRenderer.invoke('hurt-speech:is-available'),
  speak: (text, rate) => ipcRenderer.invoke('hurt-speech:speak', { text, rate })
})

contextBridge.exposeInMainWorld('hurtAi', {
  models: () => ipcRenderer.invoke('hurt-ai:models'),
  ask: (model, question, context) => ipcRenderer.invoke('hurt-ai:ask', { model, question, context })
})
