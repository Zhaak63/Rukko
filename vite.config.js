import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  envDir: '..',
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    allowedHosts: true,
    hmr: false,
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
