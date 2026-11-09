const { contextBridge, ipcRenderer } = require('electron')

// Chỉ lộ một cổng hẹp tới kho dữ liệu; renderer không có quyền Node.
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  store: (method, args) => ipcRenderer.invoke('store', method, args),
})
