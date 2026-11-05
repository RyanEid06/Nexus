import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      includeAssets: ['nexus-mark.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
      manifest: {
        id: 'nexus-codebase-visualizer',
        name: 'NEXUS — Codebase Visualizer',
        short_name: 'NEXUS',
        description: 'Local-first desktop codebase visualization and analysis.',
        theme_color: '#0B0B12',
        background_color: '#0B0B12',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/nexus-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts:
      process.env.AIS_DEV_SERVER ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.K_SERVICE ||
      process.env.CLOUD_RUN_JOB ||
      process.env.DISABLE_HMR === 'true'
        ? true
        : ['localhost', '127.0.0.1', '.run.app'],
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
