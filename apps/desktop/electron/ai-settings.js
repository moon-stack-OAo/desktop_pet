/**
 * AI 凭证本地安全存储（B-802）
 * - apiKey：优先 Electron safeStorage 加密后写入 userData/ai-settings.json
 * - 环境变量优先于本地存储（resolve 时）
 * - 对外 load 不回传完整 key，仅 hasKey / keyHint
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('./logger');

const SETTINGS_VERSION = 1;
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const SETTINGS_FILE = 'ai-settings.json';

/**
 * @typedef {object} AiSettingsFile
 * @property {number} version
 * @property {string} [apiKeyEnc] safeStorage 加密后 base64
 * @property {string} [apiKeyPlain] 仅 encryption 不可用时
 * @property {string} [baseUrl]
 * @property {string} [model]
 */

/**
 * @typedef {object} AiSettingsPublic
 * @property {boolean} hasKey
 * @property {string} [keyHint]
 * @property {string} baseUrl
 * @property {string} model
 * @property {boolean} encryptionAvailable
 * @property {'env' | 'local' | 'none'} source
 */

/**
 * @typedef {object} AiCredentials
 * @property {string} apiKey
 * @property {string} baseUrl
 * @property {string} model
 * @property {'env' | 'local' | 'none'} source
 */

/**
 * @typedef {object} AiSettingsDeps
 * @property {() => string} getPath
 * @property {{
 *   isEncryptionAvailable: () => boolean;
 *   encryptString: (s: string) => Buffer;
 *   decryptString: (b: Buffer) => string;
 * }} safeStorage
 * @property {(msg: string, ...args: unknown[]) => void} [warn]
 */

/** @type {AiSettingsDeps | null} */
let depsOverride = null;

/** 明文无加密写入时仅 warn 一次 */
let plainKeyWarned = false;

/**
 * 测试注入依赖（路径 / safeStorage）
 * @param {AiSettingsDeps | null} deps
 */
function setAiSettingsDepsForTest(deps) {
  depsOverride = deps;
  plainKeyWarned = false;
}

/**
 * @returns {AiSettingsDeps}
 */
function getDeps() {
  if (depsOverride) return depsOverride;
  try {
    // eslint-disable-next-line global-require
    const electron = require('electron');
    const app = electron && electron.app;
    const safeStorage = electron && electron.safeStorage;
    if (app && typeof app.getPath === 'function' && safeStorage) {
      return {
        getPath: () => path.join(app.getPath('userData'), SETTINGS_FILE),
        safeStorage,
        warn: (...args) => log.warn(...args),
      };
    }
  } catch {
    /* node:test 等无 Electron 运行时 */
  }
  // 无 Electron：仅 env 可用；本地文件落到临时目录避免污染
  return {
    getPath: () =>
      path.join(os.tmpdir(), `MoonPet-${SETTINGS_FILE}`),
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw new Error('safeStorage unavailable');
      },
      decryptString: () => {
        throw new Error('safeStorage unavailable');
      },
    },
    warn: (...args) => log.warn(...args),
  };
}

/**
 * @param {string} key
 * @returns {string}
 */
function maskApiKey(key) {
  const s = String(key || '');
  if (!s) return '';
  if (s.length <= 8) return '***';
  const head = s.slice(0, Math.min(3, s.length));
  const tail = s.slice(-4);
  return `${head}***${tail}`;
}

/**
 * @returns {boolean}
 */
function isEncryptionAvailable() {
  try {
    return !!getDeps().safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath
 * @returns {AiSettingsFile}
 */
function readSettingsFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { version: SETTINGS_VERSION };
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { version: SETTINGS_VERSION };
    }
    const o = /** @type {Record<string, unknown>} */ (raw);
    /** @type {AiSettingsFile} */
    const out = {
      version:
        typeof o.version === 'number' && o.version > 0
          ? o.version
          : SETTINGS_VERSION,
    };
    if (typeof o.apiKeyEnc === 'string' && o.apiKeyEnc) {
      out.apiKeyEnc = o.apiKeyEnc;
    }
    if (typeof o.apiKeyPlain === 'string' && o.apiKeyPlain) {
      out.apiKeyPlain = o.apiKeyPlain;
    }
    if (typeof o.baseUrl === 'string' && o.baseUrl.trim()) {
      out.baseUrl = o.baseUrl.trim();
    }
    if (typeof o.model === 'string' && o.model.trim()) {
      out.model = o.model.trim();
    }
    return out;
  } catch (err) {
    const warn = getDeps().warn || log.warn;
    warn(
      '[ai-settings] 读取失败:',
      err instanceof Error ? err.message : String(err),
    );
    return { version: SETTINGS_VERSION };
  }
}

/**
 * @param {string} filePath
 * @param {AiSettingsFile} data
 */
function writeSettingsFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  /** @type {AiSettingsFile} */
  const out = { version: SETTINGS_VERSION };
  if (data.apiKeyEnc) out.apiKeyEnc = data.apiKeyEnc;
  if (data.apiKeyPlain) out.apiKeyPlain = data.apiKeyPlain;
  if (data.baseUrl) out.baseUrl = data.baseUrl;
  if (data.model) out.model = data.model;
  fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf8');
}

/**
 * 从本地文件解密 / 读取 apiKey（失败返回空串，不抛）
 * @param {AiSettingsFile} stored
 * @returns {string}
 */
function decryptLocalApiKey(stored) {
  if (!stored) return '';
  const deps = getDeps();
  if (stored.apiKeyEnc) {
    try {
      const buf = Buffer.from(stored.apiKeyEnc, 'base64');
      const plain = deps.safeStorage.decryptString(buf);
      return typeof plain === 'string' ? plain : '';
    } catch (err) {
      const warn = deps.warn || log.warn;
      warn(
        '[ai-settings] 解密 apiKey 失败:',
        err instanceof Error ? err.message : String(err),
      );
      return '';
    }
  }
  if (typeof stored.apiKeyPlain === 'string') {
    return stored.apiKeyPlain;
  }
  return '';
}

/**
 * 环境变量中的 key（不记录日志）
 * @returns {string}
 */
function envApiKey() {
  return (
    process.env.PET_AI_API_KEY || process.env.OPENAI_API_KEY || ''
  ).trim();
}

/**
 * 供 UI：不回传完整 key
 * @returns {AiSettingsPublic}
 */
function loadAiSettings() {
  const encryptionAvailable = isEncryptionAvailable();
  let stored = /** @type {AiSettingsFile} */ ({ version: SETTINGS_VERSION });
  try {
    stored = readSettingsFile(getDeps().getPath());
  } catch {
    /* ignore */
  }

  const fromEnv = envApiKey();
  const fromLocal = decryptLocalApiKey(stored);

  /** @type {'env' | 'local' | 'none'} */
  let source = 'none';
  let hasKey = false;
  /** @type {string | undefined} */
  let keyHint;

  if (fromEnv) {
    source = 'env';
    hasKey = true;
    keyHint = maskApiKey(fromEnv);
  } else if (fromLocal) {
    source = 'local';
    hasKey = true;
    keyHint = maskApiKey(fromLocal);
  }

  const baseUrl =
    (process.env.PET_AI_BASE_URL || '').trim() ||
    stored.baseUrl ||
    DEFAULT_BASE_URL;
  const model =
    (process.env.PET_AI_MODEL || '').trim() ||
    stored.model ||
    DEFAULT_MODEL;

  return {
    hasKey,
    keyHint,
    baseUrl,
    model,
    encryptionAvailable,
    source,
  };
}

/**
 * 保存设置。apiKey 空串且未 clearKey 时表示不改 key。
 * @param {{
 *   apiKey?: string;
 *   baseUrl?: string;
 *   model?: string;
 *   clearKey?: boolean;
 * }} partial
 * @returns {{ ok: boolean; error?: string }}
 */
function saveAiSettings(partial) {
  try {
    const deps = getDeps();
    const filePath = deps.getPath();
    const stored = readSettingsFile(filePath);
    /** @type {AiSettingsFile} */
    const next = {
      version: SETTINGS_VERSION,
      baseUrl: stored.baseUrl,
      model: stored.model,
      apiKeyEnc: stored.apiKeyEnc,
      apiKeyPlain: stored.apiKeyPlain,
    };

    if (partial && typeof partial.baseUrl === 'string') {
      const b = partial.baseUrl.trim();
      if (b) next.baseUrl = b;
      else delete next.baseUrl;
    }
    if (partial && typeof partial.model === 'string') {
      const m = partial.model.trim();
      if (m) next.model = m;
      else delete next.model;
    }

    if (partial && partial.clearKey === true) {
      delete next.apiKeyEnc;
      delete next.apiKeyPlain;
    } else if (
      partial &&
      typeof partial.apiKey === 'string' &&
      partial.apiKey.trim()
    ) {
      const key = partial.apiKey.trim();
      delete next.apiKeyEnc;
      delete next.apiKeyPlain;
      if (isEncryptionAvailable()) {
        try {
          const enc = deps.safeStorage.encryptString(key);
          next.apiKeyEnc = Buffer.from(enc).toString('base64');
        } catch (err) {
          return {
            ok: false,
            error:
              err instanceof Error ? err.message : '加密保存失败',
          };
        }
      } else {
        next.apiKeyPlain = key;
        if (!plainKeyWarned) {
          plainKeyWarned = true;
          const warn = deps.warn || log.warn;
          warn(
            '[ai-settings] 本机无安全加密（safeStorage 不可用），API Key 将以明文写入本地文件',
          );
        }
      }
    }

    writeSettingsFile(filePath, next);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 解析实际调用凭证：环境变量优先于本地
 * @returns {AiCredentials}
 */
function resolveAiCredentials() {
  const fromEnv = envApiKey();
  const envBase = (process.env.PET_AI_BASE_URL || '').trim();
  const envModel = (process.env.PET_AI_MODEL || '').trim();

  let stored = /** @type {AiSettingsFile} */ ({ version: SETTINGS_VERSION });
  try {
    stored = readSettingsFile(getDeps().getPath());
  } catch {
    /* ignore */
  }
  const fromLocal = decryptLocalApiKey(stored);

  const apiKey = fromEnv || fromLocal || '';
  /** @type {'env' | 'local' | 'none'} */
  let source = 'none';
  if (fromEnv) source = 'env';
  else if (fromLocal) source = 'local';

  return {
    apiKey,
    baseUrl: envBase || stored.baseUrl || DEFAULT_BASE_URL,
    model: envModel || stored.model || DEFAULT_MODEL,
    source,
  };
}

module.exports = {
  SETTINGS_VERSION,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  SETTINGS_FILE,
  maskApiKey,
  isEncryptionAvailable,
  loadAiSettings,
  saveAiSettings,
  resolveAiCredentials,
  setAiSettingsDepsForTest,
  // 测试辅助
  decryptLocalApiKey,
  readSettingsFile,
};
