import { app, BrowserWindow, ipcMain, protocol, net, shell, Menu } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, normalize, sep } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { openStore, runCommand } from './store.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.MIE_DEV_URL // ví dụ http://127.0.0.1:5173 khi chạy `npm run desktop:dev`
const DIST = join(here, '..', 'dist')

// Cho kiểm thử: thư mục dữ liệu riêng để không đụng dữ liệu thật.
if (process.env.MIE_USER_DATA) app.setPath('userData', process.env.MIE_USER_DATA)

// Phục vụ bản dựng qua giao thức riêng thay vì file:// để worker, wasm và fetch hoạt động như trên web.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

let store
let win

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#fbfaf8',
    title: 'Make it easier',
    show: false,
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.once('ready-to-show', () => win.show())
  // Liên kết ngoài mở bằng trình duyệt của hệ điều hành; cửa sổ app không điều hướng đi nơi khác.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const inApp = (url) => url.startsWith('app://') || (DEV_URL && url.startsWith(DEV_URL))
  win.webContents.on('will-navigate', (e, url) => {
    if (!inApp(url)) e.preventDefault()
  })
  void win.loadURL(DEV_URL ?? 'app://local/index.html')
}

app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) return app.quit()
  store = openStore(app.getPath('userData'))
  ipcMain.handle('store', (_e, method, args) => runCommand(store, method, Array.isArray(args) ? args : []))

  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    let rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '')
    let file = join(DIST, rel)
    if (file !== DIST && !file.startsWith(DIST + sep)) return new Response('Forbidden', { status: 403 })
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // Đường dẫn của router (ví dụ /documents/all): trả về trang chính. Tệp tài nguyên thiếu: 404.
      if (/\.[a-z0-9]+$/i.test(rel)) return new Response('Not found', { status: 404 })
      file = join(DIST, 'index.html')
    }
    return net.fetch(pathToFileURL(file).toString())
  })

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  )
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('will-quit', () => store?.close())
