import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Electron file 协议需要相对路径 base；outDir 相对 apps/desktop
// shared/*.js 为 CJS（主进程 require），须纳入 commonjs 转换供渲染层 ESM 命名导入
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
    commonjsOptions: {
      include: [/node_modules/, /shared[\\/]/],
      transformMixedEsModules: true,
    },
  },
});
