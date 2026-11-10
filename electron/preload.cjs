const { contextBridge, ipcRenderer } = require('electron')

// Chỉ lộ một cổng hẹp tới kho dữ liệu; renderer không có quyền Node.
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  store: (method, args) => ipcRenderer.invoke('store', method, args),
  info: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    openReleases: () => ipcRenderer.invoke('update:openReleases'),
    onStatus: (cb) => {
      const h = (_e, s) => cb(s)
      ipcRenderer.on('update:status', h)
      return () => ipcRenderer.removeListener('update:status', h)
    },
  },
})
