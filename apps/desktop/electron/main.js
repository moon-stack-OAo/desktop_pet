/**
 * desktop_pet 主进程：生命周期编排
 */

'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const log = require('./logger');
const { readPetPrefs, writePetPrefs } = require('./prefs');
const {
  ENV_PET_ID,
  registerPetAssetSchemePrivileges,
  registerPetAssetProtocol,
  loadPetPayload,
  loadCatalog,
  resolveStartupPetId,
} = require('./pet-loader');
const {
  applyIgnoreMouse,
  applyWindowChrome,
  createWindow,
  restorePetWindowSize,
  revealMainWindow,
  scheduleVisibilityWatchdog,
} = require('./window');
const {
  openToolWindow,
  hideToolWindow,
  destroyToolWindow,
  setToolWindowQuitting,
} = require('./tool-window');
const { createTray, rebuildTrayMenu } = require('./tray-menu');
const { registerIpc } = require('./ipc');
const { IPC } = require('../shared/ipc-channels');

// 桌宠视频需静音自动播放；打包后 Chromium 默认策略易拦截 → 透明窗像「没有宠物」
// 须在 app ready 之前
try {
  app.commandLine.appendSwitch(
    'autoplay-policy',
    'no-user-gesture-required',
  );
} catch {
  /* ignore */
}

// 部分 GPU 驱动下透明窗整窗不合成；PET_DISABLE_GPU=1 时走软件合成排查
if (
  process.env.PET_DISABLE_GPU === '1' ||
  process.env.PET_DISABLE_GPU === 'true'
) {
  try {
    app.disableHardwareAcceleration();
    log.info('[main] PET_DISABLE_GPU=1：已禁用硬件加速');
  } catch {
    /* ignore */
  }
}

// 须在 app ready 之前注册特权
registerPetAssetSchemePrivileges();

// 去掉默认应用菜单，避免无边框窗右键弹出系统/原生菜单
try {
  Menu.setApplicationMenu(null);
} catch {
  /* ignore */
}

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {import('electron').Tray | null} */
let tray = null;
/** 当前宠物 id */
let currentPetId = 'guga';
/** @type {import('../shared/pet-payload').PetCatalogItem[]} */
let catalogCache = [];
/** @type {import('../shared/pet-payload').PetPayload | null} */
let currentPayload = null;
/** 是否忽略鼠标事件（点击穿透） */
let ignoreMouseEvents = false;

/**
 * @returns {import('./window').WindowHost & import('./tray-menu').TrayHost}
 */
function buildHost() {
  return {
    getMainWindow: () => mainWindow,
    setMainWindow: (win) => {
      mainWindow = win;
      // 主窗关闭后：销毁隐藏的工具窗并退出（否则 getAllWindows 仍有工具窗不触发 all-closed）
      if (!win && process.platform !== 'darwin') {
        setToolWindowQuitting(true);
        destroyToolWindow();
        app.quit();
      }
    },
    getTray: () => tray,
    setTray: (t) => {
      tray = t;
    },
    getIgnoreMouse: () => ignoreMouseEvents,
    setIgnoreMouse: (v) => {
      ignoreMouseEvents = v;
    },
    getCurrentPayload: () => currentPayload,
    setCurrentPayload: (p) => {
      currentPayload = p;
    },
    getCatalog: () => catalogCache,
    getCurrentPetId: () => currentPetId,
    onRebuildTrayMenu: () => {
      rebuildTrayMenu(buildHost());
    },
    switchPet: (petId) => switchPet(petId),
    applyIgnoreMouse: (ignore) => {
      applyIgnoreMouse(ignore, buildHost());
    },
  };
}

/**
 * 读取上次选择的宠物
 * @returns {string | null}
 */
function readPrefsPetId() {
  const data = readPetPrefs();
  if (typeof data.currentPetId === 'string' && data.currentPetId) {
    return data.currentPetId;
  }
  return null;
}

/**
 * @param {string} petId
 */
function writePrefsPetId(petId) {
  writePetPrefs({ currentPetId: petId });
}

/**
 * @param {string} petId
 */
async function switchPet(petId) {
  if (!petId || typeof petId !== 'string') {
    return { ok: false, error: '无效的宠物 id' };
  }
  const targetId = petId.trim();
  if (!targetId) {
    return { ok: false, error: '无效的宠物 id' };
  }
  try {
    // 切宠强制重载，避免缓存/同引用导致渲染层不刷新（尤其 video ↔ spritesheet）
    const payload = await loadPetPayload(targetId, { force: true });
    currentPetId = payload.id || targetId;
    currentPayload = payload;
    writePrefsPetId(currentPetId);
    applyWindowChrome(payload, buildHost(), tray);
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 关穿透 + 拉回可见区，避免切宠后点不到、误以为没切回去
      try {
        const { revealMainWindow } = require('./window');
        revealMainWindow(buildHost());
      } catch {
        if (ignoreMouseEvents) {
          applyIgnoreMouse(false, buildHost());
        }
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
      }
      mainWindow.webContents.send(IPC.PET_READY, payload);
    }
    rebuildTrayMenu(buildHost());
    log.info(
      '[pet] 已切换:',
      currentPetId,
      payload.displayName,
      'renderer=',
      payload.renderer,
    );
    return { ok: true, payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('[pet] 切换失败:', targetId, message);
    return { ok: false, error: message };
  }
}

app.whenReady().then(async () => {
  registerPetAssetProtocol();
  registerIpc({
    getCurrentPetId: () => currentPetId,
    getCatalog: () => catalogCache,
    ensureCatalog: async () => {
      catalogCache = await loadCatalog();
      return catalogCache;
    },
    loadPetPayload,
    switchPet,
    getIgnoreMouse: () => ignoreMouseEvents,
    applyIgnoreMouse: (ignore) => {
      applyIgnoreMouse(ignore, buildHost());
    },
    getPetName: () =>
      currentPayload?.displayName || currentPayload?.id || '小宠',
    getPersonaText: () =>
      (currentPayload?.ai && currentPayload.ai.personaText) || '',
    restorePetWindowSize: () => {
      restorePetWindowSize(buildHost(), tray);
    },
    openToolWindow: (opts) => {
      openToolWindow(buildHost(), opts || {});
    },
    hideToolWindow: () => {
      hideToolWindow();
    },
    // 右键原生菜单需要窗体与当前载荷
    getMainWindow: () => mainWindow,
    getCurrentPayload: () => currentPayload,
  });

  try {
    catalogCache = await loadCatalog();
    currentPetId = resolveStartupPetId(
      catalogCache.map((p) => p.id),
      readPrefsPetId(),
    );
    log.info(
      '[pet] 启动宠物 id=',
      currentPetId,
      'ENV_PET_ID=',
      ENV_PET_ID || '(无)',
    );
    /** @type {import('../shared/pet-payload').PetPayload} */
    let payload;
    try {
      payload = await loadPetPayload(currentPetId);
    } catch (loadErr) {
      // 启动时非 guga 拒载 → 回退 guga，避免直接退出
      if (currentPetId !== 'guga') {
        log.warn(
          '[pet] 启动宠加载失败，回退 guga:',
          loadErr instanceof Error ? loadErr.message : String(loadErr),
        );
        payload = await loadPetPayload('guga');
      } else {
        throw loadErr;
      }
    }
    currentPayload = payload;
    currentPetId = payload.id || currentPetId;
    writePrefsPetId(currentPetId);
    log.info(
      '[pet] 已加载:',
      payload.displayName,
      'renderer=',
      payload.renderer,
      'clips=',
      Object.keys(payload.clips || {}).length,
      payload.renderer === 'spritesheet'
        ? `sheet=${payload.spritesheet?.url}`
        : `idle=${payload.idle?.url}`,
    );

    const prefs = readPetPrefs();
    if (prefs.ignoreMouse === true) {
      ignoreMouseEvents = true;
    }
    const host = buildHost();
    createWindow(payload, host);
    createTray(host);
    // 启动后立即再 reveal 一次：Windows 透明窗 ready-to-show/show 偶发不生效
    // （日志可见 dom-ready visible=false，托盘已有却无小窗）
    setTimeout(() => {
      try {
        revealMainWindow(host, { relocate: false, focus: true });
      } catch (e) {
        log.warn(
          '[window] 启动 reveal 失败:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }, 0);
    scheduleVisibilityWatchdog(host);
    // 点击穿透 + skipTaskbar：看起来像「启动无响应」——托盘气泡已在 createTray 中提示
  } catch (err) {
    log.error('[pet] 加载失败:', err);
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && currentPayload) {
      createWindow(currentPayload, buildHost());
    }
  });
});

// 工具窗 close 时 hide 复用，不会单独触发退出。
// 主窗关闭见 buildHost.setMainWindow(null)。
app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    app.quit();
  }
});

app.on('before-quit', () => {
  setToolWindowQuitting(true);
  destroyToolWindow();
});
