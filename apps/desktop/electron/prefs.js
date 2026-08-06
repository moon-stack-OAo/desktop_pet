/**
 * 统一桌面偏好：userData/desktop-prefs.json
 * 分区：{ pet: {...}, update: {...} }
 *
 * 兼容迁移（一次性读旧文件写回新文件）：
 * - pet-prefs.json → pet
 * - update-prefs.json → update
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const log = require('./logger');

/**
 * @typedef {{ currentPetId?: string; ignoreMouse?: boolean }} PetPrefs
 * @typedef {{ checkOnStart: boolean; lastCheckDate: string; ignoredVersion: string }} UpdatePrefs
 * @typedef {{ pet: PetPrefs; update: UpdatePrefs }} DesktopPrefs
 */

/** @returns {UpdatePrefs} */
function defaultUpdatePrefs() {
  return { checkOnStart: true, lastCheckDate: '', ignoredVersion: '' };
}

/** @returns {DesktopPrefs} */
function defaultPrefs() {
  return {
    pet: {},
    update: defaultUpdatePrefs(),
  };
}

function getPrefsPath() {
  return path.join(app.getPath('userData'), 'desktop-prefs.json');
}

function getLegacyPetPrefsPath() {
  return path.join(app.getPath('userData'), 'pet-prefs.json');
}

function getLegacyUpdatePrefsPath() {
  return path.join(app.getPath('userData'), 'update-prefs.json');
}

/**
 * @param {string} filePath
 * @returns {Record<string, unknown> | null}
 */
function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return /** @type {Record<string, unknown>} */ (data);
    }
  } catch (err) {
    log.warn('[prefs] 读取失败:', filePath, err instanceof Error ? err.message : String(err));
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {PetPrefs}
 */
function normalizePetSection(raw) {
  /** @type {PetPrefs} */
  const pet = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return pet;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (typeof o.currentPetId === 'string' && o.currentPetId) {
    pet.currentPetId = o.currentPetId;
  }
  if (typeof o.ignoreMouse === 'boolean') {
    pet.ignoreMouse = o.ignoreMouse;
  }
  return pet;
}

/**
 * @param {unknown} raw
 * @returns {UpdatePrefs}
 */
function normalizeUpdateSection(raw) {
  const base = defaultUpdatePrefs();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    checkOnStart: o.checkOnStart !== false,
    lastCheckDate:
      typeof o.lastCheckDate === 'string' ? o.lastCheckDate : '',
    ignoredVersion:
      typeof o.ignoredVersion === 'string' ? o.ignoredVersion : '',
  };
}

/**
 * 从统一文件或旧文件组装 prefs；若仅有旧文件则迁移写回新路径
 * @returns {DesktopPrefs}
 */
function loadDesktopPrefs() {
  const pathNew = getPrefsPath();
  const existing = readJsonFile(pathNew);
  if (existing) {
    // 兼容：若有人把旧扁平字段直接写进新文件
    const petFromNested = existing.pet;
    const petFromFlat =
      !petFromNested &&
      (typeof existing.currentPetId === 'string' ||
        typeof existing.ignoreMouse === 'boolean')
        ? existing
        : null;
    return {
      pet: normalizePetSection(petFromNested ?? petFromFlat),
      update: normalizeUpdateSection(
        existing.update ??
          (typeof existing.checkOnStart === 'boolean' ||
          typeof existing.lastCheckDate === 'string' ||
          typeof existing.ignoredVersion === 'string'
            ? existing
            : undefined),
      ),
    };
  }

  const legacyPet = readJsonFile(getLegacyPetPrefsPath());
  const legacyUpdate = readJsonFile(getLegacyUpdatePrefsPath());

  if (!legacyPet && !legacyUpdate) {
    return defaultPrefs();
  }

  /** @type {DesktopPrefs} */
  const migrated = {
    pet: normalizePetSection(legacyPet),
    update: normalizeUpdateSection(legacyUpdate),
  };

  try {
    fs.writeFileSync(pathNew, JSON.stringify(migrated, null, 2), 'utf8');
    log.info(
      '[prefs] 已从旧文件迁移到 desktop-prefs.json',
      legacyPet ? 'pet-prefs' : '',
      legacyUpdate ? 'update-prefs' : '',
    );
  } catch (err) {
    log.warn(
      '[prefs] 迁移写回失败（内存中仍可用旧数据）:',
      err instanceof Error ? err.message : String(err),
    );
  }

  return migrated;
}

/**
 * 完整写回（保留未知分区字段时由调用方先 load 再 merge）
 * @param {DesktopPrefs} prefs
 */
function writeDesktopPrefs(prefs) {
  try {
    const next = {
      pet: normalizePetSection(prefs?.pet),
      update: normalizeUpdateSection(prefs?.update),
    };
    fs.writeFileSync(getPrefsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    log.warn(
      '[prefs] 写入 desktop-prefs 失败:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * @returns {PetPrefs}
 */
function readPetPrefs() {
  return loadDesktopPrefs().pet;
}

/**
 * 合并写入 pet 分区
 * @param {Partial<PetPrefs>} patch
 * @returns {PetPrefs}
 */
function writePetPrefs(patch) {
  const all = loadDesktopPrefs();
  all.pet = { ...all.pet, ...patch };
  // 去掉 undefined
  if (all.pet.currentPetId === undefined) delete all.pet.currentPetId;
  if (all.pet.ignoreMouse === undefined) delete all.pet.ignoreMouse;
  writeDesktopPrefs(all);
  return all.pet;
}

/**
 * @returns {UpdatePrefs}
 */
function readUpdatePrefs() {
  return loadDesktopPrefs().update;
}

/**
 * 合并写入 update 分区
 * @param {Partial<UpdatePrefs>} partial
 * @returns {UpdatePrefs}
 */
function writeUpdatePrefs(partial) {
  const all = loadDesktopPrefs();
  all.update = normalizeUpdateSection({ ...all.update, ...partial });
  writeDesktopPrefs(all);
  return all.update;
}

module.exports = {
  getPrefsPath,
  loadDesktopPrefs,
  writeDesktopPrefs,
  readPetPrefs,
  writePetPrefs,
  readUpdatePrefs,
  writeUpdatePrefs,
  defaultUpdatePrefs,
};
