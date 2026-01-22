import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'extension'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'extension/popup/index.html'),
        sidepanel: resolve(__dirname, 'extension/sidepanel/index.html'),
        background: resolve(__dirname, 'extension/background/service-worker.ts'),
        'content-detector': resolve(__dirname, 'extension/content-scripts/detector.ts'),
        'content-injector': resolve(__dirname, 'extension/content-scripts/injector.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
});
