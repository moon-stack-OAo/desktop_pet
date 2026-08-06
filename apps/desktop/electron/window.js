/**
 * 主窗口：创建、尺寸、点击穿透
 */

'use strict';

const path = require('path');
const { app, BrowserWindow, screen } = require('electron');
const log = require('./logger');
const { writePetPrefs } = require('./prefs');
const { IPC } = require('../shared/ipc-channels');

/**
 * @param {unknown} err
 * @returns {string}
 */
function formatErr(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 计算主显示器工作区右下角位置（避开任务栏）
 * @param {number} w
 * @param {number} h
 * @param {number} [margin=16]
 */
function getBottomRightPosition(w, h, margin = 16) {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const x = Math.round(area.x + area.width - w - margin);
  const y = Math.round(area.y + area.height - h - margin);
  return { x, y };
}

/**
 * @typedef {object} WindowHost
 * @property {() => import('electron').BrowserWindow | null} getMainWindow
 * @property {(win: import('electron').BrowserWindow | null) => void} setMainWindow
 * @property {() => boolean} getIgnoreMouse
 * @property {(v: boolean) => void} setIgnoreMouse
 * @property {() => import('../shared/pet-payload').PetPayload | null} getCurrentPayload
 * @property {(p: import('../shared/pet-payload').PetPayload | null) => void} setCurrentPayload
 * @property {() => void} [onRebuildTrayMenu]
 * @property {() => string} [getCurrentPetId]
 */

/**
 * 应用点击穿透
 * @param {boolean} ignore
 * @param {WindowHost} host
 * @param {{ persist?: boolean; notify?: boolean }} [opts]
 */
function applyIgnoreMouse(ignore, host, opts = {}) {
  const next = !!ignore;
  host.setIgnoreMouse(next);
  const mainWindow = host.getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(next, { forward: true });
  }
  if (opts.persist !== false) {
    writePetPrefs({ ignoreMouse: next });
  }
  if (opts.notify !== false && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.WINDOW_IGNORE_MOUSE_CHANGED, next);
  }
  if (typeof host.onRebuildTrayMenu === 'function') {
    host.onRebuildTrayMenu();
  }
  log.info('[window] 点击穿透 =', next);
}

/**
 * 应用 payload 到窗口尺寸与标题
 * @param {import('../shared/pet-payload').PetPayload} petPayload
 * @param {WindowHost} host
 * @param {import('electron').Tray | null} [tray]
 */
function applyWindowChrome(petPayload, host, tray) {
  const mainWindow = host.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const w = Math.max(140, Math.min(280, petPayload.size?.width || 180));
  const h = Math.max(140, Math.min(280, petPayload.size?.height || 180));
  try {
    mainWindow.setContentSize(w, h);
  } catch {
    mainWindow.setSize(w, h);
  }
  const title = petPayload.displayName || petPayload.id || 'desktop_pet';
  mainWindow.setTitle(title);
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(`desktop_pet · ${title}`);
  }
}

/**
 * @param {import('../shared/pet-payload').PetPayload} petPayload
 * @param {WindowHost} host
 */
function createWindow(petPayload, host) {
  host.setCurrentPayload(petPayload);
  const w = Math.max(140, Math.min(280, petPayload.size?.width || 180));
  const h = Math.max(140, Math.min(280, petPayload.size?.height || 180));
  const { x, y } = getBottomRightPosition(w, h);
  const ignoreMouseEvents = host.getIgnoreMouse();

  const mainWindow = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    title: petPayload.displayName || petPayload.id || 'desktop_pet',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  host.setMainWindow(mainWindow);

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setPosition(x, y);

  // 打包态强制 loadFile，避免误设 NODE_ENV=development 去连 Vite
  let isPackaged = false;
  try {
    isPackaged = app.isPackaged === true;
  } catch {
    isPackaged = false;
  }
  const isDev =
    !isPackaged &&
    (process.env.ELECTRON_DEV === '1' ||
      process.env.NODE_ENV === 'development');
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    const htmlPath = path.join(__dirname, '../dist-renderer/index.html');
    mainWindow.loadFile(htmlPath).catch((err) => {
      log.error('[window] loadFile 失败:', htmlPath, formatErr(err));
    });
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error('[window] 页面加载失败:', code, desc, url);
  });

  if (ignoreMouseEvents) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  mainWindow.webContents.on('did-finish-load', () => {
    const payload = host.getCurrentPayload();
    if (payload) {
      mainWindow.webContents.send(IPC.PET_READY, payload);
    }
    mainWindow.webContents.send(
      IPC.WINDOW_IGNORE_MOUSE_CHANGED,
      host.getIgnoreMouse(),
    );
  });

  mainWindow.on('closed', () => {
    host.setMainWindow(null);
    try {
      const { setTargetWindow } = require('./updater');
      if (typeof setTargetWindow === 'function') {
        setTargetWindow(null);
      }
    } catch {
      /* ignore */
    }
  });

  try {
    const { setupAutoUpdate } = require('./updater');
    setupAutoUpdate(mainWindow);
  } catch (err) {
    log.warn('[updater] 初始化失败:', formatErr(err));
  }
}

module.exports = {
  getBottomRightPosition,
  applyIgnoreMouse,
  applyWindowChrome,
  createWindow,
};
