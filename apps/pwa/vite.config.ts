import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const ici = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // D19 : installable depuis le navigateur, interface servie hors ligne par
    // le service worker. Les données, elles, vivent dans IndexedDB : le
    // service worker ne met **jamais** l'API en cache — une réponse d'API
    // périmée servie en silence serait pire qu'une erreur.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icone.svg'],
      manifest: {
        name: 'Aqua-Suivi — Terrain',
        short_name: 'Aqua-Suivi',
        description: 'Suivi de cycles piscicoles, même sans réseau.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7fbf8',
        theme_color: '#1f6f5f',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      // Le service worker aussi en développement : c'est là qu'on teste le
      // hors-ligne, pas seulement après un build.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(ici, 'src') },
  },
  server: { port: 5180 },
  preview: { port: 5181 },
});
