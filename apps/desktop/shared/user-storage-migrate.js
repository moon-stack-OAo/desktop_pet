/**
 * 渲染层 localStorage schema 迁移（纯函数，可单测）
 * - vitals: pet-vitals:{petId}
 * - muted: pet-muted
 */

'use strict';

/** 当前 vitals schema 版本 */
const VITALS_SCHEMA_VERSION = 1;
/** 当前 muted schema 版本 */
const MUTED_SCHEMA_VERSION = 1;

const DEFAULT_HUNGER = 80;
const DEFAULT_MOOD = 70;

/**
 * @param {number} n
 * @param {number} [min]
 * @param {number} [max]
 */
function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {string} petId
 * @returns {string}
 */
function vitalsStorageKey(petId) {
  return `pet-vitals:${petId}`;
}

const MUTED_STORAGE_KEY = 'pet-muted';

/**
 * @typedef {{ version: number; hunger: number; mood: number; updatedAt: number }} VitalsRecord
 * @typedef {{ version: number; muted: boolean }} MutedRecord
 */

/**
 * @param {number} [now]
 * @returns {VitalsRecord}
 */
function defaultVitalsRecord(now = Date.now()) {
  return {
    version: VITALS_SCHEMA_VERSION,
    hunger: DEFAULT_HUNGER,
    mood: DEFAULT_MOOD,
    updatedAt: now,
  };
}

/**
 * 将任意历史 vitals JSON 迁移到当前版本
 * - 无 version：v0 扁平 { hunger, mood, updatedAt }
 * - version 未知：尽量抽取字段后写为当前版
 * @param {unknown} parsed
 * @param {number} [now]
 * @returns {{ record: VitalsRecord; migrated: boolean }}
 */
function migrateVitalsRecord(parsed, now = Date.now()) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { record: defaultVitalsRecord(now), migrated: true };
  }
  const o = /** @type {Record<string, unknown>} */ (parsed);
  const version = typeof o.version === 'number' ? o.version : 0;

  const hunger = clamp(
    Number(o.hunger !== undefined && o.hunger !== null ? o.hunger : DEFAULT_HUNGER),
  );
  const mood = clamp(
    Number(o.mood !== undefined && o.mood !== null ? o.mood : DEFAULT_MOOD),
  );
  const updatedAt =
    typeof o.updatedAt === 'number' && o.updatedAt > 0 ? o.updatedAt : now;

  if (version === VITALS_SCHEMA_VERSION) {
    return {
      record: { version: VITALS_SCHEMA_VERSION, hunger, mood, updatedAt },
      migrated: false,
    };
  }

  // v0 或未来未知版本：归一到当前
  return {
    record: { version: VITALS_SCHEMA_VERSION, hunger, mood, updatedAt },
    migrated: true,
  };
}

/**
 * 解析 localStorage 原始字符串
 * @param {string | null} raw
 * @param {number} [now]
 * @returns {{ record: VitalsRecord; migrated: boolean }}
 */
function parseVitalsRaw(raw, now = Date.now()) {
  if (!raw) {
    return { record: defaultVitalsRecord(now), migrated: false };
  }
  try {
    const parsed = JSON.parse(raw);
    return migrateVitalsRecord(parsed, now);
  } catch {
    return { record: defaultVitalsRecord(now), migrated: true };
  }
}

/**
 * 序列化为当前 schema
 * @param {Omit<VitalsRecord, 'version'> | VitalsRecord} stats
 * @returns {string}
 */
function serializeVitals(stats) {
  return JSON.stringify({
    version: VITALS_SCHEMA_VERSION,
    hunger: clamp(Number(stats.hunger)),
    mood: clamp(Number(stats.mood)),
    updatedAt:
      typeof stats.updatedAt === 'number' && stats.updatedAt > 0
        ? stats.updatedAt
        : Date.now(),
  });
}

/**
 * 迁移 muted：
 * - 旧：纯字符串 "1" / "0"
 * - 新：JSON { version: 1, muted: boolean }
 * @param {string | null} raw
 * @returns {{ record: MutedRecord; migrated: boolean }}
 */
function parseMutedRaw(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return {
      record: { version: MUTED_SCHEMA_VERSION, muted: false },
      migrated: false,
    };
  }

  // 旧 schema：单字符
  if (raw === '1' || raw === '0') {
    return {
      record: { version: MUTED_SCHEMA_VERSION, muted: raw === '1' },
      migrated: true,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const o = /** @type {Record<string, unknown>} */ (parsed);
      const version = typeof o.version === 'number' ? o.version : 0;
      const muted = o.muted === true || o.muted === 1 || o.muted === '1';
      return {
        record: { version: MUTED_SCHEMA_VERSION, muted: !!muted },
        migrated: version !== MUTED_SCHEMA_VERSION,
      };
    }
  } catch {
    /* fallthrough */
  }

  // 无法识别：默认非静音并视为需迁移写回
  return {
    record: { version: MUTED_SCHEMA_VERSION, muted: false },
    migrated: true,
  };
}

/**
 * @param {boolean} muted
 * @returns {string}
 */
function serializeMuted(muted) {
  return JSON.stringify({
    version: MUTED_SCHEMA_VERSION,
    muted: !!muted,
  });
}

module.exports = {
  VITALS_SCHEMA_VERSION,
  MUTED_SCHEMA_VERSION,
  DEFAULT_HUNGER,
  DEFAULT_MOOD,
  MUTED_STORAGE_KEY,
  vitalsStorageKey,
  defaultVitalsRecord,
  migrateVitalsRecord,
  parseVitalsRaw,
  serializeVitals,
  parseMutedRaw,
  serializeMuted,
  clamp,
};
