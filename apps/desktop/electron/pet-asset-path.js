/**
 * pet-asset 协议路径解析与越界校验（纯 Node，无 Electron 依赖，便于 smoke 测试）
 *
 * URL 形态：pet-asset://asset/<相对 pets 根的路径>
 * 例：pet-asset://asset/guga/large/webm/idle.webm
 */
const path = require('path');

const PET_ASSET_SCHEME = 'pet-asset';

/**
 * 判断 target 是否落在 root 目录树内（拒绝 .. 越界与跨盘绝对路径）
 * @param {string} root
 * @param {string} target
 * @returns {boolean}
 */
function isPathInsideRoot(root, target) {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(target);
  const rel = path.relative(rootResolved, targetResolved);
  if (!rel) return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * 将请求 URL 解析为 pets 根下的安全绝对路径；非法则返回 null
 * @param {string} requestUrl
 * @param {string} petsRoot pets 资源根目录（绝对或相对均可，内部会 resolve）
 * @returns {string | null}
 */
function resolvePetAssetPath(requestUrl, petsRoot) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${PET_ASSET_SCHEME}:`) {
    return null;
  }

  /** @type {string[]} */
  let segments = [];
  // 标准形态：pet-asset://asset/guga/...
  if (parsed.hostname === 'asset') {
    segments = parsed.pathname
      .replace(/^\/+/, '')
      .split('/')
      .filter((s) => s.length > 0);
  } else if (parsed.hostname) {
    // 兼容 pet-asset://guga/large/...（hostname 作为首段）
    segments = [
      parsed.hostname,
      ...parsed.pathname.replace(/^\/+/, '').split('/').filter((s) => s.length > 0),
    ];
  } else {
    // 兼容 pet-asset:///guga/...
    segments = parsed.pathname
      .replace(/^\/+/, '')
      .split('/')
      .filter((s) => s.length > 0);
  }

  if (segments.length === 0) {
    return null;
  }

  /** @type {string[]} */
  const decoded = [];
  for (const seg of segments) {
    let part;
    try {
      part = decodeURIComponent(seg);
    } catch {
      return null;
    }
    // 禁止路径穿越与空段 / 空字节
    if (
      !part ||
      part === '.' ||
      part === '..' ||
      part.includes('\0') ||
      part.includes('/') ||
      part.includes('\\')
    ) {
      return null;
    }
    decoded.push(part);
  }

  const root = path.resolve(petsRoot);
  const target = path.resolve(root, ...decoded);
  if (!isPathInsideRoot(root, target)) {
    return null;
  }
  return target;
}

module.exports = {
  PET_ASSET_SCHEME,
  isPathInsideRoot,
  resolvePetAssetPath,
};
