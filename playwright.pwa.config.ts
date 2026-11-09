import { defineConfig, devices } from '@playwright/test'

// Kiểm thử bản build (service worker chỉ có trong bản build, không có trong dev server).
export default defineConfig({
  testDir: 'tests/pwa',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    timeout: 240_000,
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
})
