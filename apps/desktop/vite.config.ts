import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Plugin} from 'vite';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 开发态：shared/*.js 是 CJS（module.exports），浏览器 ESM 命名导入会报
 * “does not provide an export named 'MUTED_STORAGE_KEY'” → 整页白屏。
 * build 有 commonjsOptions；dev 需本插件把 shorthand exports 转成 export { ... }。
 */
function sharedCjsNamedExports(): Plugin {
  return {
    name: 'shared-cjs-named-exports',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/');
      if (!/\/shared\/[^/]+\.js$/.test(file)) return null;
      if (!/\bmodule\.exports\b/.test(code)) return null;

      const match = code.match(
        /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?\s*$/,
      );
      if (!match) return null;

      const names = match[1]
        .split(',')
        .map((part) => {
          const t = part.trim();
          if (!t || t.startsWith('//') || t.startsWith('/*')) return '';
          // 支持 `foo` / `foo: bar`
          const key = t.split(':')[0].trim();
          return /^[A-Za-z_$][\w$]*$/.test(key) ? key : '';
        })
        .filter(Boolean);

      if (!names.length) return null;

      const body = code.replace(
        /module\.exports\s*=\s*\{[\s\S]*?\}\s*;?\s*$/,
        '',
      );
      return {
        code: `${body}\nexport { ${names.join(', ')} };\nexport default { ${names.join(', ')} };\n`,
        map: null,
      };
    },
  };
}

// Electron file 协议需要相对路径 base；outDir 相对 apps/desktop
// shared/*.js 为 CJS（主进程 require），须纳入 commonjs 转换供渲染层 ESM 命名导入
export default defineConfig({
  plugins: [react(), sharedCjsNamedExports()],
  base: './',
  server: {
    // 与 wait-on / free-port 约定 5173；启动前 scripts/free-port.js 会尝试释放
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        tool: path.resolve(__dirname, 'tool.html'),
      },
    },
    commonjsOptions: {
      include: [/node_modules/, /shared[\\/]/],
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    // 避免预构建时把 shared CJS 吃成 default-only
    exclude: [],
  },
});
