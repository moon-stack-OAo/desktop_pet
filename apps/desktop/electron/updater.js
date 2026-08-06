/**
 * 自动更新（electron-updater + GitHub Releases）
 * 策略参考 count_down_tool：启动延迟、每日一次、忽略版本、手动检查、进度事件
 */
const { app, ipcMain } = require('electron');
const log = require('./logger');
const {
  readUpdatePrefs,
  writeUpdatePrefs,
} = require('./prefs');
const { IPC } = require('../shared/ipc-channels');

/** @type {import('electron').BrowserWindow | null} */
let targetWindow = null;
/** @type {import('electron-updater').AppUpdater | null} */
let autoUpdater = null;

let initialized = false;
let ipcRegistered = false;
let checking = false;
let downloading = false;
/** 启动检查定时器是否已排程（避免重建窗口重复调度） */
let startupCheckScheduled = false;
/** 本次检查是否为手动（手动时不尊重 ignoredVersion） */
let lastCheckWasManual = false;

/** @type {{ version: string; releaseNotes?: string | null } | null} */
let pendingUpdate = null;

/**
 * @typedef {{ checkOnStart: boolean; lastCheckDate: string; ignoredVersion: string }} UpdatePrefs
 */

/**
 * @param {unknown} err
 * @returns {string}
 */
function formatErr(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * @param {string} channel
 * @param {unknown} payload
 */
function send(channel, payload) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  try {
    targetWindow.webContents.send(channel, payload);
  } catch {
    /* ignore */
  }
}

/** @returns {import('electron-updater').AppUpdater | null} */
function getAutoUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    // eslint-disable-next-line global-require
    const mod = require('electron-updater');
    autoUpdater = mod.autoUpdater;
    return autoUpdater;
  } catch (err) {
    log.warn('[updater] electron-updater 不可用:', formatErr(err));
    return null;
  }
}

/**
 * @param {import('electron-updater').AppUpdater} au
 */
function bindUpdaterEvents(au) {
  au.autoDownload = false;
  au.autoInstallOnAppQuit = true;
  au.allowPrerelease = false;

  au.on('checking-for-update', () => {
    checking = true;
    send(IPC.UPDATE_STATUS, { phase: 'checking' });
  });

  au.on('update-available', (info) => {
    checking = false;
    const version = info?.version || '';
    const prefs = readUpdatePrefs();
    if (
      !lastCheckWasManual &&
      prefs.ignoredVersion &&
      prefs.ignoredVersion === version
    ) {
      log.info('[updater] 忽略版本', version);
      send(IPC.UPDATE_STATUS, {
        phase: 'ignored',
        version,
        currentVersion: app.getVersion(),
      });
      return;
    }

    /** @type {string | null} */
    let releaseNotes = null;
    if (typeof info?.releaseNotes === 'string') {
      releaseNotes = info.releaseNotes;
    } else if (Array.isArray(info?.releaseNotes)) {
      releaseNotes = info.releaseNotes
        .map((/** @type {unknown} */ n) => {
          if (n && typeof n === 'object' && 'note' in n) {
            return String(/** @type {{ note?: unknown }} */ (n).note ?? n);
          }
          return String(n);
        })
        .join('\n');
    }

    pendingUpdate = { version, releaseNotes };
    send(IPC.UPDATE_STATUS, {
      phase: 'available',
      version,
      releaseNotes,
      currentVersion: app.getVersion(),
    });
  });

  au.on('update-not-available', (info) => {
    checking = false;
    pendingUpdate = null;
    send(IPC.UPDATE_STATUS, {
      phase: 'not-available',
      silent: !lastCheckWasManual,
      version: info?.version || app.getVersion(),
      currentVersion: app.getVersion(),
    });
  });

  au.on('error', (err) => {
    checking = false;
    downloading = false;
    log.warn('[updater] 错误:', err?.message || err);
    send(IPC.UPDATE_STATUS, {
      phase: 'error',
      message: err?.message || String(err),
    });
  });

  au.on('download-progress', (p) => {
    downloading = true;
    send(IPC.UPDATE_STATUS, {
      phase: 'downloading',
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    });
  });

  au.on('update-downloaded', (info) => {
    downloading = false;
    send(IPC.UPDATE_STATUS, {
      phase: 'downloaded',
      version: info?.version || pendingUpdate?.version || '',
      currentVersion: app.getVersion(),
    });
  });
}

/**
 * @param {{ manual?: boolean }} [opts]
 */
async function checkForUpdates(opts = {}) {
  const manual = opts.manual === true;
  lastCheckWasManual = manual;

  const au = getAutoUpdater();
  if (!au) {
    send(IPC.UPDATE_STATUS, { phase: 'error', message: '更新模块不可用' });
    return { ok: false, error: 'updater-unavailable' };
  }
  if (!app.isPackaged) {
    send(IPC.UPDATE_STATUS, {
      phase: 'dev-skip',
      message: '开发模式不检查更新',
      currentVersion: app.getVersion(),
    });
    return { ok: false, error: 'dev-mode' };
  }
  if (checking || downloading) {
    return { ok: false, error: 'busy' };
  }

  writeUpdatePrefs({ lastCheckDate: todayStr() });

  try {
    const result = await au.checkForUpdates();
    return { ok: true, updateInfo: result?.updateInfo || null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(IPC.UPDATE_STATUS, { phase: 'error', message });
    return { ok: false, error: message };
  }
}

async function downloadUpdate() {
  const au = getAutoUpdater();
  if (!au) return { ok: false, error: 'updater-unavailable' };
  if (!app.isPackaged) return { ok: false, error: 'dev-mode' };
  if (downloading) return { ok: false, error: 'busy' };
  try {
    downloading = true;
    send(IPC.UPDATE_STATUS, { phase: 'downloading', percent: 0 });
    await au.downloadUpdate();
    return { ok: true };
  } catch (err) {
    downloading = false;
    const message = err instanceof Error ? err.message : String(err);
    send(IPC.UPDATE_STATUS, { phase: 'error', message });
    return { ok: false, error: message };
  }
}

function quitAndInstall() {
  const au = getAutoUpdater();
  if (!au) return { ok: false, error: 'updater-unavailable' };
  // isSilent=false, isForceRunAfter=true
  setImmediate(() => {
    au.quitAndInstall(false, true);
  });
  return { ok: true };
}

/**
 * @param {string} [version]
 */
function ignoreVersion(version) {
  if (version && typeof version === 'string') {
    writeUpdatePrefs({ ignoredVersion: version });
    pendingUpdate = null;
    send(IPC.UPDATE_STATUS, { phase: 'ignored', version });
  }
  return { ok: true };
}

function getUpdateState() {
  return {
    packaged: app.isPackaged,
    currentVersion: app.getVersion(),
    checking,
    downloading,
    pendingUpdate,
    prefs: readUpdatePrefs(),
  };
}

/**
 * 启动后延迟检查（默认 4s，每天最多一次）
 * 进程生命周期内只排程一次，避免 createWindow 重建时重复 setTimeout。
 */
function scheduleStartupCheck() {
  if (!app.isPackaged) {
    log.info('[updater] 开发态跳过启动检查');
    return;
  }
  // portable 便携版更新通道有限，启动不自动检查（仍可手动）
  if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE) {
    log.info('[updater] portable 模式跳过启动检查');
    return;
  }
  if (startupCheckScheduled) {
    return;
  }
  const prefs = readUpdatePrefs();
  if (!prefs.checkOnStart) {
    log.info('[updater] 已关闭启动检查');
    return;
  }
  if (prefs.lastCheckDate === todayStr()) {
    log.info('[updater] 今日已检查，跳过');
    return;
  }

  startupCheckScheduled = true;
  setTimeout(() => {
    void checkForUpdates({ manual: false });
  }, 4000);
}

function registerUpdaterIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle(IPC.UPDATE_GET_STATE, () => getUpdateState());
  ipcMain.handle(IPC.UPDATE_CHECK, async (_e, opts) =>
    checkForUpdates({ manual: opts?.manual !== false }),
  );
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => downloadUpdate());
  ipcMain.handle(IPC.UPDATE_INSTALL, () => quitAndInstall());
  ipcMain.handle(IPC.UPDATE_IGNORE, (_e, version) => ignoreVersion(version));
  ipcMain.handle(IPC.UPDATE_SET_CHECK_ON_START, (_e, enabled) => {
    writeUpdatePrefs({ checkOnStart: !!enabled });
    return readUpdatePrefs();
  });
  ipcMain.handle(IPC.UPDATE_GET_PREFS, () => readUpdatePrefs());
}

/**
 * 切换 / 清空更新状态的推送目标窗口（重建窗或 closed 时调用）
 * @param {import('electron').BrowserWindow | null} win
 */
function setTargetWindow(win) {
  targetWindow = win && !win.isDestroyed() ? win : null;
}

/**
 * 主进程在 createWindow 之后调用
 * @param {import('electron').BrowserWindow} win
 */
function setupAutoUpdate(win) {
  setTargetWindow(win);
  registerUpdaterIpc();

  if (!initialized) {
    initialized = true;
    const au = getAutoUpdater();
    if (au) {
      bindUpdaterEvents(au);
      log.info(
        '[updater] 已初始化 packaged=',
        app.isPackaged,
        'version=',
        app.getVersion(),
      );
    }
  }

  scheduleStartupCheck();
}

/**
 * 托盘/菜单触发手动检查
 */
function requestManualCheck() {
  void checkForUpdates({ manual: true });
}

module.exports = {
  setupAutoUpdate,
  setTargetWindow,
  scheduleStartupCheck,
  checkForUpdates,
  requestManualCheck,
  downloadUpdate,
  quitAndInstall,
  ignoreVersion,
  getUpdateState,
  readUpdatePrefs,
  writeUpdatePrefs,
};
