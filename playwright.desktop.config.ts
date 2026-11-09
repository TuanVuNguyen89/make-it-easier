import { defineConfig } from '@playwright/test'

// Kiểm thử app Electron thật (cần màn hình; trên máy không có màn hình dùng xvfb-run).
export default defineConfig({
  testDir: 'tests/desktop',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
})
