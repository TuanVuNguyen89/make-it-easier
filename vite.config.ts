/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// Bản app máy tính (Electron) tự chạy offline từ tệp trong gói: không cần service worker.
const desktop = process.env.DESKTOP === '1'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    !desktop && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Make it easier',
        short_name: 'Make it easier',
        description: 'Quản lý tài liệu và chỉnh sửa PDF ngay trong trình duyệt, không tải file lên máy chủ.',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fbfaf8',
        theme_color: '#0f6f6a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache cả wasm (qpdf), phông, tài nguyên pdf.js và các chunk công cụ để mọi công cụ chạy offline.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm,ttf,woff,woff2,json,bcmap,pfb,ttf,icc}'],
        // Dữ liệu OCR lớn (~24 MB): không precache, chỉ cache khi dùng lần đầu rồi dùng offline.
        globIgnores: ['**/pdfjs/wasm/**/*.map', '**/tesseract/**', '**/fonts/**'],
        runtimeCaching: [
          {
            // Phông tương đương dùng khi sửa chữ (~4,7 MB, 12 biến thể): cache khi dùng lần đầu, không precache.
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/fonts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'edit-fonts', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/tesseract/'),
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 40 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  // Các thư viện này được nạp lười (trong worker hoặc import động); khai báo trước để Vite không
  // tối ưu lại giữa chừng và tải lại trang khi vừa dùng công cụ lần đầu.
  optimizeDeps: {
    include: ['pdf-lib', '@pdf-lib/fontkit', 'pdfjs-dist', '@neslinesli93/qpdf-wasm', 'fflate'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
