import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5180 },
  preview: { host: true, port: 5180 },
  build: { chunkSizeWarningLimit: 1500 },
});
