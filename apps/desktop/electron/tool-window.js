/**
 * AI 工具窗：对话 / 设置独立 BrowserWindow（hide 复用）
 */

'use strict';

const path = require('path');
const { app, BrowserWindow, screen } = require('electron');
const log = require('./logger');
const { IPC } = require('../shared/ipc-channels');

/** @type {import('electron').BrowserWindow | null} */
let toolWindow = null;
/** @type {'chat' | 'settings'} */
let pendingTab = 'chat';
/** 应用退出中：允许真正关闭工具窗 */
let isAppQuitting = false;

/**
 * @param {unknown} err
 * @returns {string}
 */
function formatErr(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * @param {unknown} tab
 * @returns {'chat' | 'settings'}
 */
function normalizeTab(tab) {
  return tab === 'settings' ? 'settings' : 'chat';
}

/**
 * 开发 / 生产加载地址
 * @param {import('electron').BrowserWindow} win
 */
function loadToolPage(win) {
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
    const url = `${devServerUrl.replace(/\/$/, '')}/tool.html`;
    log.info('[tool-window] 开发模式加载:', url);
    return win.loadURL(url);
  }
  const htmlPath = path.join(__dirname, '../dist-renderer/tool.html');
  log.info('[tool-window] 加载本地页面:', htmlPath);
  return win.loadFile(htmlPath);
}

/**
 * 向工具窗推送当前 Tab
 * @param {import('electron').BrowserWindow} win
 * @param {'chat' | 'settings'} tab
 */
function sendTab(win, tab) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send(IPC.TOOL_SET_TAB, tab);
  } catch (err) {
    log.warn('[tool-window] sendTab 失败:', formatErr(err));
  }
}

/**
 * 创建工具窗（仅内部）
 * @returns {import('electron').BrowserWindow}
 */
function createToolWindow() {
  const primary = screen.getPrimaryDisplay();
  const area = primary.workArea;
  const width = 360;
  const height = 480;
  const x = Math.round(area.x + (area.width - width) / 2);
  const y = Math.round(area.y + (area.height - height) / 2);

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 320,
    minHeight: 400,
    show: false,
    // 无边框；拖动/关闭由渲染层自定义标题栏承担
    frame: false,
    transparent: false,
    resizable: true,
    // Windows 无边框可拖边缩放
    thickFrame: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    hasShadow: true,
    backgroundColor: '#12141c',
    title: 'MoonPet · AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  try {
    win.setMenu(null);
  } catch {
    /* ignore */
  }
  win.setMenuBarVisibility(false);

  // 关闭时 hide 复用，避免闪烁与 window-all-closed 误退
  win.on('close', (e) => {
    if (isAppQuitting) return;
    e.preventDefault();
    if (!win.isDestroyed()) {
      win.hide();
    }
  });

  win.on('closed', () => {
    if (toolWindow === win) {
      toolWindow = null;
    }
  });

  win.webContents.on('did-finish-load', () => {
    sendTab(win, pendingTab);
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error('[tool-window] 页面加载失败:', code, desc, url);
  });

  loadToolPage(win).catch((err) => {
    log.error('[tool-window] 加载失败:', formatErr(err));
  });

  if (
    process.env.ELECTRON_OPEN_DEVTOOLS === '1' &&
    process.env.ELECTRON_DEV === '1'
  ) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

/**
 * 打开 / 显示工具窗并切到指定 Tab
 * @param {{ getMainWindow?: () => import('electron').BrowserWindow | null }} [_host]
 * @param {{ tab?: 'chat' | 'settings' }} [opts]
 * @returns {import('electron').BrowserWindow | null}
 */
function openToolWindow(_host, opts = {}) {
  pendingTab = normalizeTab(opts.tab);
  try {
    if (!toolWindow || toolWindow.isDestroyed()) {
      toolWindow = createToolWindow();
    }
    const win = toolWindow;
    if (!win || win.isDestroyed()) return null;

    if (win.isMinimized()) {
      try {
        win.restore();
      } catch {
        /* ignore */
      }
    }
    win.show();
    win.focus();
    // 已加载完成时立即推 Tab；首次加载由 did-finish-load 再推一次
    if (!win.webContents.isLoading()) {
      sendTab(win, pendingTab);
    }
    log.info('[tool-window] open tab=', pendingTab);
    return win;
  } catch (err) {
    log.warn('[tool-window] open 失败:', formatErr(err));
    return null;
  }
}

/**
 * 隐藏工具窗（不销毁）
 */
function hideToolWindow() {
  if (!toolWindow || toolWindow.isDestroyed()) return;
  try {
    toolWindow.hide();
  } catch {
    /* ignore */
  }
}

/**
 * 应用退出前销毁工具窗
 */
function destroyToolWindow() {
  isAppQuitting = true;
  if (!toolWindow || toolWindow.isDestroyed()) {
    toolWindow = null;
    return;
  }
  try {
    toolWindow.removeAllListeners('close');
    toolWindow.destroy();
  } catch {
    /* ignore */
  }
  toolWindow = null;
}

/**
 * @returns {import('electron').BrowserWindow | null}
 */
function getToolWindow() {
  if (toolWindow && !toolWindow.isDestroyed()) return toolWindow;
  return null;
}

/**
 * @param {boolean} quitting
 */
function setToolWindowQuitting(quitting) {
  isAppQuitting = !!quitting;
}

module.exports = {
  openToolWindow,
  hideToolWindow,
  destroyToolWindow,
  getToolWindow,
  setToolWindowQuitting,
};
