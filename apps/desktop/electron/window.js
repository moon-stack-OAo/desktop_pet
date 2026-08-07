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
 * 取用于锚定桌宠的显示器：优先光标所在屏，否则主屏。
 * 多屏时固定主屏右下角会导致用户在副屏「有托盘无小窗」。
 * @returns {Electron.Display}
 */
function getAnchorDisplay() {
  try {
    const point = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(point);
    if (d) return d;
  } catch {
    /* ignore */
  }
  return screen.getPrimaryDisplay();
}

/**
 * 计算工作区右下角位置（避开任务栏）
 * @param {number} w
 * @param {number} h
 * @param {number} [margin=16]
 * @param {Electron.Display | null} [display]
 */
function getBottomRightPosition(w, h, margin = 16, display = null) {
  const d = display || getAnchorDisplay();
  const area = d.workArea;
  const x = Math.round(area.x + area.width - w - margin);
  const y = Math.round(area.y + area.height - h - margin);
  return { x, y, displayId: d.id };
}

/**
 * 若窗口完全不在任一显示器工作区内，则挪到锚定屏右下角。
 * @param {import('electron').BrowserWindow} win
 * @param {{ w?: number; h?: number }} [size]
 * @returns {boolean} 是否调整了位置
 */
function ensureWindowOnScreen(win, size = {}) {
  if (!win || win.isDestroyed()) return false;
  const b = win.getBounds();
  const w = size.w || b.width;
  const h = size.h || b.height;
  const displays = screen.getAllDisplays();
  const visible = displays.some((d) => {
    const a = d.workArea;
    // 至少 40% 面积落在某工作区内视为可见
    const ix = Math.max(b.x, a.x);
    const iy = Math.max(b.y, a.y);
    const ax = Math.min(b.x + b.width, a.x + a.width);
    const ay = Math.min(b.y + b.height, a.y + a.height);
    const inter = Math.max(0, ax - ix) * Math.max(0, ay - iy);
    return inter >= w * h * 0.4;
  });
  if (visible) return false;
  const { x, y } = getBottomRightPosition(w, h);
  win.setBounds({ x, y, width: w, height: h });
  log.info('[window] 已拉回可见区', `${x},${y} ${w}x${h}`);
  return true;
}

/**
 * 是否开启「调试实心底」：PET_SOLID_BG=1 时用粉色不透明窗，用于确认合成链路
 * @returns {boolean}
 */
function isSolidBgDebug() {
  return process.env.PET_SOLID_BG === '1' || process.env.PET_SOLID_BG === 'true';
}

/**
 * 真正把窗拉到前台（Windows 透明窗上单独 show() 有时仍 isVisible=false）
 * @param {import('electron').BrowserWindow} win
 * @param {{ focus?: boolean }} [opts]
 */
function forceShowWindow(win, opts = {}) {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.isMinimized()) win.restore();
  } catch {
    /* ignore */
  }
  try {
    win.setOpacity(1);
  } catch {
    /* ignore */
  }
  // 部分 Windows + 透明窗：先 showInactive 再 show 更稳
  try {
    win.showInactive();
  } catch {
    /* ignore */
  }
  win.show();
  try {
    // 勿用 screen-saver：部分多屏/全屏游戏场景会把窗合成到「看不见」的层
    win.setAlwaysOnTop(true, 'pop-up-menu');
  } catch {
    try {
      win.setAlwaysOnTop(true);
    } catch {
      /* ignore */
    }
  }
  try {
    win.moveTop();
  } catch {
    /* ignore */
  }
  if (opts.focus !== false) {
    try {
      win.focus();
    } catch {
      /* ignore */
    }
  }
}

/**
 * 仅 PET_SOLID_BG=1 时注入粉底，用于排查窗位置
 * @param {import('electron').BrowserWindow} win
 */
function injectVisibilityChrome(win) {
  if (!win || win.isDestroyed()) return;
  if (!isSolidBgDebug()) return;
  const css = `html,body,#root,.stage{background:#ff69b4 !important;}`;
  win.webContents
    .insertCSS(css)
    .then(() => {
      log.info('[window] PET_SOLID_BG=1：已注入粉底');
    })
    .catch((err) => {
      log.warn('[window] insertCSS 失败:', formatErr(err));
    });
}

/**
 * 强制显示主窗：关穿透、恢复最小化、校正屏外、置顶聚焦。
 * 供托盘单击 / 「显示」/ 启动兜底使用，解决「有托盘无小窗」。
 * @param {WindowHost} host
 * @param {{ relocate?: boolean; focus?: boolean }} [opts]
 * @returns {import('electron').BrowserWindow | null}
 */
function revealMainWindow(host, opts = {}) {
  const mainWindow = host.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (host.getIgnoreMouse()) {
    applyIgnoreMouse(false, host);
  }
  const { w, h } = resolvePetWindowSize(host.getCurrentPayload());
  // relocate 默认 true：托盘唤回时挪到光标所在屏；启动兜底可传 false 只 show
  if (opts.relocate !== false) {
    const { x, y } = getBottomRightPosition(w, h);
    try {
      mainWindow.setBounds({ x, y, width: w, height: h });
    } catch {
      try {
        mainWindow.setSize(w, h);
        mainWindow.setPosition(x, y);
      } catch {
        /* ignore */
      }
    }
  }
  ensureWindowOnScreen(mainWindow, { w, h });
  forceShowWindow(mainWindow, { focus: opts.focus !== false });
  const b = mainWindow.getBounds();
  // 已在目标位置且可见时降噪，避免托盘连点刷屏
  if (opts.quiet !== true) {
    log.info(
      '[window] reveal',
      `${b.x},${b.y} ${b.width}x${b.height}`,
      'visible=',
      mainWindow.isVisible(),
      'opacity=',
      typeof mainWindow.getOpacity === 'function' ? mainWindow.getOpacity() : '?',
    );
  }
  return mainWindow;
}

/**
 * 启动后延迟检查：若仍不可见则强制 reveal（透明窗 ready-to-show 偶发无效）
 * @param {WindowHost} host
 * @param {number[]} [delaysMs]
 */
function scheduleVisibilityWatchdog(host, delaysMs = [400, 1200, 3000]) {
  for (const ms of delaysMs) {
    setTimeout(() => {
      try {
        const win = host.getMainWindow();
        if (!win || win.isDestroyed()) return;
        if (win.isVisible() && !win.isMinimized()) {
          if (ms === delaysMs[0]) {
            try {
              win.setAlwaysOnTop(true, 'pop-up-menu');
              win.moveTop();
            } catch {
              /* ignore */
            }
          }
          return;
        }
        log.warn(
          '[window] 可见性看门狗触发',
          `t=${ms}ms`,
          'visible=',
          win.isVisible(),
          'minimized=',
          win.isMinimized(),
        );
        revealMainWindow(host, { relocate: true, focus: true });
      } catch (err) {
        log.warn('[window] 看门狗失败:', formatErr(err));
      }
    }, ms);
  }
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
 * 宠物默认窗尺寸（与 payload.size 对齐）
 * @param {{ size?: { width?: number; height?: number } } | null | undefined} petPayload
 */
function resolvePetWindowSize(petPayload) {
  const w = Math.max(140, Math.min(280, petPayload?.size?.width || 180));
  const h = Math.max(140, Math.min(280, petPayload?.size?.height || 180));
  return { w, h };
}

/**
 * 对话 / AI 设置时放大窗口，便于操作小面板
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | null }} host
 * @param {{ width?: number; height?: number }} [opts]
 */
function expandWindowForUi(host, opts = {}) {
  const mainWindow = host.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const w = Math.max(280, opts.width || 320);
  const h = Math.max(320, opts.height || 380);
  try {
    mainWindow.setContentSize(w, h);
  } catch {
    mainWindow.setSize(w, h);
  }
  mainWindow.setAlwaysOnTop(true);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/**
 * 恢复宠物默认尺寸
 * @param {WindowHost} host
 * @param {import('electron').Tray | null} [tray]
 */
function restorePetWindowSize(host, tray) {
  const petPayload = host.getCurrentPayload();
  if (!petPayload) return;
  applyWindowChrome(petPayload, host, tray || null);
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
  const { w, h } = resolvePetWindowSize(petPayload);
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
  const { w, h } = resolvePetWindowSize(petPayload);
  const pos = getBottomRightPosition(w, h);
  const { x, y } = pos;
  const ignoreMouseEvents = host.getIgnoreMouse();
  log.info(
    '[window] 创建于',
    `${x},${y} ${w}x${h}`,
    'displayId=',
    pos.displayId,
    'screens=',
    screen.getAllDisplays().length,
  );

  const solidBg = isSolidBgDebug();
  const mainWindow = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    // 先不 show，等 ready-to-show，避免透明空窗闪一下
    show: false,
    // PET_SOLID_BG=1：关闭透明，粉色底，用于确认「窗是否真在屏上」
    transparent: !solidBg,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    // 无边框窗禁用系统窗口菜单（右键标题区/拖拽区时的原生菜单）
    autoHideMenuBar: true,
    backgroundColor: solidBg ? '#ff69b4' : '#00000000',
    title: petPayload.displayName || petPayload.id || 'desktop_pet',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  try {
    mainWindow.setMenu(null);
  } catch {
    /* ignore */
  }

  host.setMainWindow(mainWindow);

  mainWindow.setMenuBarVisibility(false);
  try {
    mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
  } catch {
    mainWindow.setAlwaysOnTop(true);
  }
  // Windows 多屏上 visibleOnFullScreen 偶发把透明窗画到错误层，默认关闭
  if (process.env.PET_ALL_WORKSPACES === '1') {
    try {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {
      /* 部分平台不支持 */
    }
  }
  mainWindow.setPosition(x, y);
  if (solidBg) {
    log.info('[window] PET_SOLID_BG=1：不透明调试窗（粉底）');
  }

  // 透明窗：ready-to-show 时强制 show（Windows 上仅 show() 可能仍 invisible）
  mainWindow.once('ready-to-show', () => {
    if (mainWindow.isDestroyed()) return;
    ensureWindowOnScreen(mainWindow, { w, h });
    forceShowWindow(mainWindow, { focus: true });
    const b = mainWindow.getBounds();
    log.info(
      '[window] ready-to-show',
      `${b.x},${b.y} ${b.width}x${b.height}`,
      'visible=',
      mainWindow.isVisible(),
    );
  });

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
    log.info('[window] 开发模式加载:', devServerUrl);
    mainWindow
      .loadURL(devServerUrl)
      .then(() => {
        if (mainWindow.isDestroyed()) return;
        ensureWindowOnScreen(mainWindow, { w, h });
        forceShowWindow(mainWindow, { focus: true });
        log.info(
          '[window] loadURL 完成',
          'visible=',
          mainWindow.isVisible(),
          'bounds=',
          JSON.stringify(mainWindow.getBounds()),
        );
      })
      .catch((err) => {
        log.error('[window] loadURL 失败:', devServerUrl, formatErr(err));
      });
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    const htmlPath = path.join(__dirname, '../dist-renderer/index.html');
    log.info('[window] 加载本地页面:', htmlPath);
    mainWindow
      .loadFile(htmlPath)
      .then(() => {
        if (mainWindow.isDestroyed()) return;
        ensureWindowOnScreen(mainWindow, { w, h });
        forceShowWindow(mainWindow, { focus: true });
        log.info(
          '[window] loadFile 完成',
          'visible=',
          mainWindow.isVisible(),
        );
      })
      .catch((err) => {
        log.error('[window] loadFile 失败:', htmlPath, formatErr(err));
      });
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error('[window] 页面加载失败:', code, desc, url);
  });

  mainWindow.webContents.on('dom-ready', () => {
    const b = mainWindow.getBounds();
    log.info(
      '[window] dom-ready bounds=',
      `${b.x},${b.y} ${b.width}x${b.height}`,
      'visible=',
      mainWindow.isVisible(),
    );
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
    injectVisibilityChrome(mainWindow);
    // 再次确保可见（多显示器/任务栏场景）
    ensureWindowOnScreen(mainWindow, { w, h });
    forceShowWindow(mainWindow, { focus: false });
    log.info(
      '[window] did-finish-load',
      'visible=',
      mainWindow.isVisible(),
    );
  });

  // 转发渲染层 console，便于排查「窗在但无宠物」
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 || /error|fail|解码|autoplay|pet-asset|已加载|无效/i.test(message)) {
      log.info('[renderer-console]', message);
    }
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
  getAnchorDisplay,
  ensureWindowOnScreen,
  forceShowWindow,
  revealMainWindow,
  scheduleVisibilityWatchdog,
  injectVisibilityChrome,
  isSolidBgDebug,
  resolvePetWindowSize,
  applyIgnoreMouse,
  applyWindowChrome,
  expandWindowForUi,
  restorePetWindowSize,
  createWindow,
};
