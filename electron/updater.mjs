// Cập nhật phiên bản mới từ GitHub Releases (electron-updater). Chỉ hoạt động khi app đã đóng gói.
import { app, ipcMain, shell } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater
export const RELEASES_URL = 'https://github.com/TuanVuNguyen89/make-it-easier/releases/latest'

/** macOS chưa ký số thì không tự cài được bản mới: chỉ báo có bản mới và mở trang tải về. */
const canSelfInstall = () => process.platform !== 'darwin'

export function setupUpdater(getWindow) {
  /** @type {{state: string, version?: string, percent?: number, error?: string}} */
  let status = { state: 'idle' }
  const push = (next) => {
    status = { ...next }
    getWindow()?.webContents.send('update:status', status)
  }

  // Cho kiểm thử: máy chủ cập nhật giả thay cho GitHub.
  const testFeed = process.env.MIE_UPDATE_URL
  if (testFeed) {
    autoUpdater.setFeedURL({ provider: 'generic', url: testFeed })
    autoUpdater.forceDevUpdateConfig = true
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('checking-for-update', () => push({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => push({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => push({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => push({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => push({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (e) => push({ state: 'error', error: String(e?.message ?? e).split('\n')[0].slice(0, 300) }))

  const check = async () => {
    if (!app.isPackaged && !testFeed) return push({ state: 'unsupported' }) // chạy từ mã nguồn: không có gì để cập nhật
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      /* lỗi đã được báo qua sự kiện 'error' */
    }
  }

  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:check', check)
  ipcMain.handle('update:download', async () => {
    if (!canSelfInstall()) return void shell.openExternal(RELEASES_URL)
    try {
      await autoUpdater.downloadUpdate()
    } catch {
      /* đã báo qua 'error' */
    }
  })
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(false, true))
  ipcMain.handle('update:openReleases', () => shell.openExternal(RELEASES_URL))

  // Kiểm tra im lặng một lần sau khi mở app (không tự tải, không làm phiền).
  if (!testFeed) setTimeout(() => void check(), 8000)
}
