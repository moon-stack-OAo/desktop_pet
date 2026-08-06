import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Electron file 协议需要相对路径 base；outDir 相对 apps/desktop
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    sourcemap: true,
  },
});
