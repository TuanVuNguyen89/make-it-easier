// Dựng giao diện cho app máy tính: giống bản web nhưng không có service worker/PWA.
import { spawnSync } from 'node:child_process'

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, DESKTOP: '1' }, shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
run('npm', ['run', 'assets'])
run('npx', ['tsc', '-b'])
run('npx', ['vite', 'build'])
