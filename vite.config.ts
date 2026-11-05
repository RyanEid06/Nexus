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
      includeAssets: ['nexus-mark.svg'],
      manifest: {
        name: 'NEXUS — Codebase Visualizer',
        short_name: 'NEXUS',
        description: 'Local-first desktop codebase visualization and analysis.',
        theme_color: '#0B0B12',
        background_color: '#0B0B12',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/nexus-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
