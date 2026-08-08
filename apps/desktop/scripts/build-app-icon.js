/**
 * 组装 Windows 应用 / NSIS 安装包图标。
 *
 * - 优先使用 build/icon-{16,32,48,64,128,256,512}.png
 * - 小尺寸（≤48）写入 **32bpp BMP ICO 项**（NSIS / 资源管理器兼容好）
 * - 64+ 与 256 写入 **PNG-in-ICO**（清晰、带 8-bit alpha）
 * - tray.png ← icon-32.png
 *
 * 用法：node apps/desktop/scripts/build-app-icon.js
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

/** @type {number[]} */
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
/** ≤ 此值用 BMP 项（NSIS Setup / 资源管理器高 DPI 更稳；64 覆盖 200% 缩放） */
const BMP_MAX = 64;

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
 * @param {string} src
 * @param {number} size
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
 * 解码 PNG 为 {w,h,rgba}（RGBA 行优先，仅依赖 magick 输出 RGBA raw）
 * @param {string} pngPath
 */
function pngToRgba(pngPath) {
  const rawPath = path.join(tmp, `${path.basename(pngPath)}.rgba`);
  // %w %h 与 RGBA 像素
  const meta = execFileSync(
    'magick',
    [pngPath, '-format', '%w %h', 'info:'],
    { encoding: 'utf8' },
  ).trim();
  const [ws, hs] = meta.split(/\s+/);
  const w = Number(ws);
  const h = Number(hs);
  execFileSync(
    'magick',
    [pngPath, '-alpha', 'set', '-depth', '8', `rgba:${rawPath}`],
    { stdio: 'pipe' },
  );
  const rgba = fs.readFileSync(rawPath);
  if (rgba.length !== w * h * 4) {
    throw new Error(
      `rgba size mismatch ${pngPath}: got ${rgba.length}, expect ${w * h * 4}`,
    );
  }
  return { w, h, rgba };
}

/**
 * ICO 内嵌 32bpp BMP（含 1-bit AND mask，Windows / NSIS 通用）
 * @param {{w:number,h:number,rgba:Buffer}} img
 */
function rgbaToBmpIcoEntry(img) {
  const { w, h, rgba } = img;
  const xorStride = w * 4;
  const xorSize = xorStride * h;
  // AND mask：每行 32-bit 对齐
  const andStride = Math.ceil(w / 32) * 4;
  const andSize = andStride * h;
  const headerSize = 40;
  const buf = Buffer.alloc(headerSize + xorSize + andSize);

  // BITMAPINFOHEADER；biHeight = 2*h 表示含 mask
  buf.writeUInt32LE(40, 0);
  buf.writeInt32LE(w, 4);
  buf.writeInt32LE(h * 2, 8);
  buf.writeUInt16LE(1, 12); // planes
  buf.writeUInt16LE(32, 14); // bit count
  buf.writeUInt32LE(0, 16); // BI_RGB
  buf.writeUInt32LE(xorSize + andSize, 20);
  buf.writeInt32LE(0, 24);
  buf.writeInt32LE(0, 28);
  buf.writeUInt32LE(0, 32);
  buf.writeUInt32LE(0, 36);

  // XOR：BGRA，底行在前
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const si = (srcY * w + x) * 4;
      const di = headerSize + y * xorStride + x * 4;
      const r = rgba[si];
      const g = rgba[si + 1];
      const b = rgba[si + 2];
      const a = rgba[si + 3];
      buf[di] = b;
      buf[di + 1] = g;
      buf[di + 2] = r;
      buf[di + 3] = a;
    }
  }

  // AND mask：alpha=0 为 1（透明）
  const andOff = headerSize + xorSize;
  buf.fill(0, andOff, andOff + andSize);
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const a = rgba[(srcY * w + x) * 4 + 3];
      if (a === 0) {
        const byteIndex = andOff + y * andStride + (x >> 3);
        buf[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }
  return buf;
}

/**
 * @param {{size:number, pngPath:string, useBmp:boolean}[]} layers
 * @param {string} outPath
 */
function buildIco(layers, outPath) {
  const entries = layers.map((layer) => {
    if (layer.useBmp) {
      const rgba = pngToRgba(layer.pngPath);
      if (rgba.w !== layer.size || rgba.h !== layer.size) {
        // 允许非严格，但记录
      }
      const data = rgbaToBmpIcoEntry(rgba);
      return { w: layer.size, h: layer.size, data, kind: 'bmp' };
    }
    const data = fs.readFileSync(layer.pngPath);
    if (data[0] !== 0x89 || data[1] !== 0x50) {
      throw new Error(`not png: ${layer.pngPath}`);
    }
    return { w: layer.size, h: layer.size, data, kind: 'png' };
  });

  const count = entries.length;
  const headerSize = 6;
  let offset = headerSize + 16 * count;
  const offsets = [];
  for (const e of entries) {
    offsets.push(offset);
    offset += e.data.length;
  }

  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(count, 4);
  for (let i = 0; i < count; i++) {
    const e = entries[i];
    const dir = headerSize + i * 16;
    buf[dir] = e.w >= 256 ? 0 : e.w;
    buf[dir + 1] = e.h >= 256 ? 0 : e.h;
    buf[dir + 2] = 0;
    buf[dir + 3] = 0;
    buf.writeUInt16LE(1, dir + 4);
    buf.writeUInt16LE(32, dir + 6);
    buf.writeUInt32LE(e.data.length, dir + 8);
    buf.writeUInt32LE(offsets[i], dir + 12);
    e.data.copy(buf, offsets[i]);
  }
  fs.writeFileSync(outPath, buf);
  return entries;
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

  /** @type {{size:number, pngPath:string, useBmp:boolean}[]} */
  const layers = [];
  /** @type {string[]} */
  const notes = [];

  for (const size of ICO_SIZES) {
    let pngPath = preferredPng(size);
    if (!fs.existsSync(pngPath)) {
      pngPath = path.join(tmp, `i${size}.png`);
      resizeFrom(srcFallback, size, pngPath);
      notes.push(`${size}: scaled←${path.basename(srcFallback)}`);
    } else {
      notes.push(`${size}: file`);
    }
    layers.push({ size, pngPath, useBmp: size <= BMP_MAX });
  }

  const icon32 = preferredPng(32);
  if (fs.existsSync(icon32)) {
    fs.copyFileSync(icon32, trayOut);
    notes.push('tray: copy icon-32.png');
  } else {
    resizeFrom(srcFallback, 32, trayOut);
    notes.push('tray: scaled');
  }

  const icon256 = preferredPng(256);
  const iconPng = path.join(buildDir, 'icon.png');
  if (fs.existsSync(icon256)) {
    fs.copyFileSync(icon256, iconPng);
    notes.push('icon.png: copy icon-256.png');
  }

  const entries = buildIco(layers, icoOut);
  console.log(
    '[build-app-icon] icon.ico bytes=',
    fs.statSync(icoOut).size,
    entries.map((e) => `${e.w}:${e.kind}`).join(' '),
  );
  for (const n of notes) console.log(' ', n);
}

main();
