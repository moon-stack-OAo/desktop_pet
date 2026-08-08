/**
 * electron-builder afterPack：在 Windows 上写入 exe 图标。
 * signAndEditExecutable=false 会跳过 builder 内置 set-icon，必须在此补写。
 *
 * 优先 npm 包 `rcedit`（自带 rcedit-x64.exe，CI 无需 winCodeSign 缓存）；
 * 失败则 throw，避免静默产出仍带 Electron 默认图标的安装包。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * @returns {string | null} rcedit-x64 / rcedit.exe 绝对路径
 */
function resolveBundledRcedit() {
  try {
    const pkgJson = require.resolve('rcedit/package.json', {
      paths: [path.join(__dirname, '..'), path.join(__dirname, '../../..')],
    });
    const binDir = path.join(path.dirname(pkgJson), 'bin');
    const x64 = path.join(binDir, 'rcedit-x64.exe');
    if (fs.existsSync(x64)) return x64;
    const x86 = path.join(binDir, 'rcedit.exe');
    if (fs.existsSync(x86)) return x86;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @returns {string | null}
 */
function findCachedRcedit() {
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
  for (const root of searchRoots) {
    if (!root || !fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) stack.push(p);
        else if (/^rcedit(-x64)?\.exe$/i.test(ent.name)) return p;
      }
    }
  }
  return null;
}

/**
 * @param {string} exePath
 * @param {string} iconPath
 */
function setIcon(exePath, iconPath) {
  const rcedit = resolveBundledRcedit() || findCachedRcedit();
  if (!rcedit) {
    throw new Error(
      '[after-pack-win-icon] rcedit not found (install devDependency rcedit or winCodeSign cache)',
    );
  }
  execFileSync(rcedit, [exePath, '--set-icon', iconPath], {
    stdio: 'inherit',
    windowsHide: true,
  });
  console.log('[after-pack-win-icon] set icon ok:', exePath, 'via', rcedit);
}

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
    throw new Error(`[after-pack-win-icon] exe not found: ${exePath}`);
  }

  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    throw new Error(`[after-pack-win-icon] icon not found: ${iconPath}`);
  }

  setIcon(exePath, iconPath);
};
