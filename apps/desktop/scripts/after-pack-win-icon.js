/**
 * electron-builder afterPack：在 Windows 上用 rcedit 写入 exe 图标。
 * 保持 signAndEditExecutable=false 可避免 CI 完整签名链路失败，
 * 但会跳过默认的 set-icon；因此在此单独补图标。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPackWinIcon(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appOutDir = context.appOutDir;
  const productFilename =
    (context.packager &&
      context.packager.appInfo &&
      context.packager.appInfo.productFilename) ||
    'MoonPet';
  const exePath = path.join(appOutDir, `${productFilename}.exe`);
  if (!fs.existsSync(exePath)) {
    console.warn('[after-pack-win-icon] exe not found:', exePath);
    return;
  }

  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    console.warn('[after-pack-win-icon] icon not found:', iconPath);
    return;
  }

  /** @type {string[]} */
  const searchRoots = [];
  if (process.env.LOCALAPPDATA) {
    searchRoots.push(
      path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign'),
    );
  }
  if (process.env.ELECTRON_BUILDER_CACHE) {
    searchRoots.push(path.join(process.env.ELECTRON_BUILDER_CACHE, 'winCodeSign'));
  }
  // monorepo / 扁平 node_modules
  searchRoots.push(
    path.join(__dirname, '../../../node_modules/app-builder-bin'),
    path.join(__dirname, '../node_modules/app-builder-bin'),
  );

  /** @type {string | null} */
  let rcedit = null;
  for (const root of searchRoots) {
    if (!root || !fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length && !rcedit) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          stack.push(p);
        } else if (/^rcedit(-x64)?\.exe$/i.test(ent.name)) {
          rcedit = p;
          break;
        }
      }
    }
    if (rcedit) break;
  }

  if (!rcedit) {
    // 最后手段：让 app-builder 调 rcedit（与 electron-builder 内部一致）
    try {
      const appBuilder = require('app-builder-bin');
      const bin =
        (appBuilder && (appBuilder.path || appBuilder)) ||
        path.join(
          __dirname,
          '../../../node_modules/app-builder-bin/win/x64/app-builder.exe',
        );
      const binPath = typeof bin === 'string' ? bin : String(bin);
      if (fs.existsSync(binPath)) {
        execFileSync(
          binPath,
          [
            'rcedit',
            '--args',
            JSON.stringify([exePath, '--set-icon', iconPath]),
          ],
          { stdio: 'inherit', windowsHide: true },
        );
        console.log('[after-pack-win-icon] set icon via app-builder ok:', exePath);
        return;
      }
    } catch (err) {
      console.warn(
        '[after-pack-win-icon] app-builder rcedit failed:',
        err && err.message ? err.message : err,
      );
    }
    console.warn(
      '[after-pack-win-icon] rcedit not found; skip set-icon (exe may keep default Electron icon)',
    );
    return;
  }

  try {
    execFileSync(rcedit, [exePath, '--set-icon', iconPath], {
      stdio: 'inherit',
      windowsHide: true,
    });
    console.log('[after-pack-win-icon] set icon ok:', exePath);
  } catch (err) {
    console.warn(
      '[after-pack-win-icon] rcedit failed:',
      err && err.message ? err.message : err,
    );
  }
};
