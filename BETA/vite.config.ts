import { defineConfig } from 'vite';
import { resolve } from 'path';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [
    glsl({
      include: ['**/*.glsl', '**/*.vert', '**/*.frag'],
      compress: false,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@webgl': resolve(__dirname, 'src/webgl'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    open: '/polygon.html',
  },
  preview: { port: 4173 },
  build: {
    target: 'es2020',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        terminal: resolve(__dirname, 'terminal.html'),
        dossier: resolve(__dirname, 'dossier.html'),
        scenes: resolve(__dirname, 'scenes.html'),
        ryokan: resolve(__dirname, 'scene-ryokan.html'),
        shanghai: resolve(__dirname, 'scene-shanghai.html'),
        quiet: resolve(__dirname, 'scene-quiet.html'),
        polygon: resolve(__dirname, 'polygon.html'),
        intro: resolve(__dirname, 'intro.html'),
      },
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  publicDir: 'public',
  optimizeDeps: {
    include: ['three', 'gsap', 'howler'],
  },
});