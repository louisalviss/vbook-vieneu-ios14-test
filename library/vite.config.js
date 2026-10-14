import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/vbook-vieneu-ios14-test/library/',
  plugins: [VitePWA({
    registerType: 'prompt',
    includeAssets: ['icons/book.svg'],
    manifest: {
      name: 'VBook Web · VieNeu staging',
      short_name: 'VBook Offline',
      description: 'Đọc EPUB và tổng hợp giọng nói tiếng Việt tại máy',
      lang: 'vi', start_url: '/vbook-vieneu-ios14-test/library/', scope: '/vbook-vieneu-ios14-test/library/', display: 'standalone',
      background_color: '#101415', theme_color: '#101415',
      icons: [{src:'icons/book.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,json,wasm,data,svg,png,epub,webmanifest}'],
      maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
      navigateFallback: '/vbook-vieneu-ios14-test/library/index.html',
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: false
    }
  })],
  build: { target: 'es2020', outDir: 'dist', sourcemap: false }
});
