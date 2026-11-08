/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages では https://<user>.github.io/study-log/ で配信されるので base を合わせる
const base = '/study-log/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // KaTeX のフォントもオフライン用に保存しておく
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
      manifest: {
        name: '学習記録',
        short_name: '学習記録',
        description: '毎日1問の学習記録とストリーク',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#58cc02',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        // 共有メニューから送られたテキストを ?share=1&text=... で受け取る（サーバー不要の GET 方式）
        share_target: {
          action: `${base}?share=1`,
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    environment: 'node',
  },
})
