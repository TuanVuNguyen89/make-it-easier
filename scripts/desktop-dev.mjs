// Chạy app máy tính ở chế độ phát triển: máy chủ Vite + Electron trỏ vào đó.
import { spawn } from 'node:child_process'

const shell = process.platform === 'win32'
const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit', shell, env: { ...process.env, DESKTOP: '1' } })
const url = 'http://127.0.0.1:5173'
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(url)).ok) break
  } catch { /* chưa sẵn sàng */ }
  await new Promise((r) => setTimeout(r, 300))
}
const app = spawn('npx', ['electron', '.'], { stdio: 'inherit', shell, env: { ...process.env, MIE_DEV_URL: url } })
const stop = () => { vite.kill(); app.kill() }
app.on('exit', () => { vite.kill(); process.exit(0) })
process.on('SIGINT', stop)
