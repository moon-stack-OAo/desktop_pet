/**
 * 渲染层轻量日志：开发保留 info/debug，生产打包默认仅 warn/error
 *
 * 开发：import.meta.env.DEV / MODE===development / ELECTRON_DEV 注入
 * 强制：localStorage.PET_LOG_LEVEL 或 import.meta.env.VITE_PET_LOG_LEVEL
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function isDevEnv(): boolean {
  try {
    // Vite
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.DEV) return true;
      if (import.meta.env.MODE === 'development') return true;
      if (import.meta.env.VITE_ELECTRON_DEV === '1') return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function resolveMinLevel(): LogLevel {
  try {
    const fromLs =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('PET_LOG_LEVEL')
        : null;
    const fromEnv =
      typeof import.meta !== 'undefined' && import.meta.env
        ? String(import.meta.env.VITE_PET_LOG_LEVEL || '')
        : '';
    const raw = (fromLs || fromEnv || '').toLowerCase().trim();
    if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return isDevEnv() ? 'debug' : 'warn';
}

let cachedMin: LogLevel | null = null;

function getMinLevel(): LogLevel {
  if (cachedMin == null) cachedMin = resolveMinLevel();
  return cachedMin;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()];
}

function emit(level: LogLevel, args: unknown[]): void {
  if (!shouldLog(level)) return;
  if (level === 'error') {
    console.error(...args);
  } else if (level === 'warn') {
    console.warn(...args);
  } else {
    console.log(...args);
  }
}

export function debug(...args: unknown[]): void {
  emit('debug', args);
}

export function info(...args: unknown[]): void {
  emit('info', args);
}

export function warn(...args: unknown[]): void {
  emit('warn', args);
}

export function error(...args: unknown[]): void {
  emit('error', args);
}

/** @internal 测试用 */
export function resetLogLevelCache(): void {
  cachedMin = null;
}
