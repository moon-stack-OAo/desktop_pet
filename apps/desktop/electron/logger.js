/**
 * 主进程轻量日志：开发保留 info/debug，生产打包默认仅 warn/error
 *
 * 开发判定：ELECTRON_DEV=1 || NODE_ENV=development || !app.isPackaged
 * 强制：PET_LOG_LEVEL=debug|info|warn|error
 */

'use strict';

/** @typedef {'debug' | 'info' | 'warn' | 'error'} LogLevel */

/** @type {Record<LogLevel, number>} */
const LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * @returns {boolean}
 */
function isDevEnv() {
  if (process.env.ELECTRON_DEV === '1') return true;
  if (process.env.NODE_ENV === 'development') return true;
  try {
    // 延迟 require，避免未 ready 时 app 异常；打包探测失败视为 dev 侧保守保留 info
    // eslint-disable-next-line global-require
    const { app } = require('electron');
    if (app && typeof app.isPackaged === 'boolean') {
      return !app.isPackaged;
    }
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * @returns {LogLevel}
 */
function resolveMinLevel() {
  const raw = (process.env.PET_LOG_LEVEL || '').toLowerCase().trim();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return isDevEnv() ? 'debug' : 'warn';
}

/** @type {LogLevel | null} */
let cachedMin = null;

/**
 * @returns {LogLevel}
 */
function getMinLevel() {
  if (cachedMin == null) {
    cachedMin = resolveMinLevel();
  }
  return cachedMin;
}

/**
 * 测试或环境变化时重置缓存（一般无需调用）
 */
function resetLogLevelCache() {
  cachedMin = null;
}

/**
 * @param {LogLevel} level
 * @returns {boolean}
 */
function shouldLog(level) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()];
}

/**
 * @param {LogLevel} level
 * @param {unknown[]} args
 */
function emit(level, args) {
  if (!shouldLog(level)) return;
  if (level === 'error') {
    console.error(...args);
  } else if (level === 'warn') {
    console.warn(...args);
  } else {
    // debug / info
    console.log(...args);
  }
}

/**
 * @param {...unknown} args
 */
function debug(...args) {
  emit('debug', args);
}

/**
 * @param {...unknown} args
 */
function info(...args) {
  emit('info', args);
}

/**
 * @param {...unknown} args
 */
function warn(...args) {
  emit('warn', args);
}

/**
 * @param {...unknown} args
 */
function error(...args) {
  emit('error', args);
}

module.exports = {
  debug,
  info,
  warn,
  error,
  shouldLog,
  getMinLevel,
  resetLogLevelCache,
  isDevEnv,
};
