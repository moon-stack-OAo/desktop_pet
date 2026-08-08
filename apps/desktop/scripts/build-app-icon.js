/**
 * 用 build/icon-*.png 组装 Windows PNG-in-ICO（icon.ico），并同步 tray.png。
 * 优先使用已导出的各尺寸 PNG；缺失尺寸再从最大可用源图缩放。
 *
 * 依赖：本机 ImageMagick `magick`（仅缺层时需要）。
 *
 * 用法：
 *   node apps/desktop/scripts/build-app-icon.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const buildDir = path.resolve(__dirname, '../build');
const icoOut = path.join(buildDir, 'icon.ico');
const trayOut = path.join(buildDir, 'tray.png');
const tmp = path.join(
  process.env.TEMP || process.env.TMPDIR || '/tmp',
  'moonpet-icon-build',
);

/** ICO 需要的尺寸（Windows 常见；256 为上限常用值） */
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

/**
 * @param {number} size
 */
function preferredPng(size) {
  return path.join(buildDir, `icon-${size}.png`);
}

function largestSource() {
  const candidates = [512, 256, 128, 64]
    .map((s) => preferredPng(s))
    .concat([path.join(buildDir, 'icon.png')]);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {string[]} args
 */
function magick(args) {
  execFileSync('magick', args, { stdio: 'inherit' });
}

/**
 * @param {number} size
 * @param {string} src
 * @param {string} out
 */
function resizeFrom(src, size, out) {
  const args = [
    src,
    '-background',
    'none',
    '-alpha',
    'set',
    '-filter',
    'Lanczos',
    '-resize',
    `${size}x${size}`,
  ];
  if (size <= 64) args.push('-unsharp', '0x0.75+0.75+0.02');
  args.push('-define', 'png:color-type=6', out);
  magick(args);
}

/**
 * Windows Vista+：ICO 内嵌 PNG
 * @param {string[]} pngFiles
 * @param {string} outPath
 */
function buildPngIco(pngFiles, outPath) {
  const images = pngFiles.map((p) => {
    const data = fs.readFileSync(p);
    if (data[0] !== 0x89 || data[1] !== 0x50) {
      throw new Error('not png: ' + p);
    }
    const w = data.readUInt32BE(16);
    const h = data.readUInt32BE(20);
    return { w, h, data, path: p };
  });

  const count = images.length;
  const headerSize = 6;
  let offset = headerSize + 16 * count;
  const offsets = [];
  for (const img of images) {
    offsets.push(offset);
    offset += img.data.length;
  }

  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(count, 4);
  for (let i = 0; i < count; i++) {
    const img = images[i];
    const dir = headerSize + i * 16;
    buf[dir] = img.w >= 256 ? 0 : img.w;
    buf[dir + 1] = img.h >= 256 ? 0 : img.h;
    buf[dir + 2] = 0;
    buf[dir + 3] = 0;
    buf.writeUInt16LE(1, dir + 4);
    buf.writeUInt16LE(32, dir + 6);
    buf.writeUInt32LE(img.data.length, dir + 8);
    buf.writeUInt32LE(offsets[i], dir + 12);
    img.data.copy(buf, offsets[i]);
  }
  fs.writeFileSync(outPath, buf);
  return images;
}

function main() {
  if (!fs.existsSync(buildDir)) {
    console.error('missing build dir:', buildDir);
    process.exit(1);
  }

  const srcFallback = largestSource();
  if (!srcFallback) {
    console.error('no icon source png in', buildDir);
    process.exit(1);
  }

  fs.mkdirSync(tmp, { recursive: true });

  /** @type {string[]} */
  const layers = [];
  /** @type {string[]} */
  const notes = [];

  for (const size of ICO_SIZES) {
    const ready = preferredPng(size);
    if (fs.existsSync(ready)) {
      layers.push(ready);
      notes.push(`${size}: file`);
      continue;
    }
    const out = path.join(tmp, `i${size}.png`);
    resizeFrom(srcFallback, size, out);
    layers.push(out);
    notes.push(`${size}: scaled←${path.basename(srcFallback)}`);
  }

  // tray：优先现成 32
  const icon32 = preferredPng(32);
  if (fs.existsSync(icon32)) {
    fs.copyFileSync(icon32, trayOut);
    notes.push('tray: copy icon-32.png');
  } else {
    resizeFrom(srcFallback, 32, trayOut);
    notes.push('tray: scaled');
  }

  // icon.png 与 icon-256 对齐（若存在 256）
  const icon256 = preferredPng(256);
  const iconPng = path.join(buildDir, 'icon.png');
  if (fs.existsSync(icon256)) {
    fs.copyFileSync(icon256, iconPng);
    notes.push('icon.png: copy icon-256.png');
  }

  const images = buildPngIco(layers, icoOut);
  console.log(
    '[build-app-icon] icon.ico',
    images.map((i) => `${i.w}x${i.h}`).join(', '),
    'bytes=',
    fs.statSync(icoOut).size,
  );
  for (const n of notes) console.log(' ', n);
}

main();
