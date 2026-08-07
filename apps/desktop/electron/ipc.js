/**
 * 主进程 IPC 注册
 */

'use strict';

const { app, ipcMain } = require('electron');
const log = require('./logger');
const { handleAiChat } = require('./ai-chat');
const { loadAiSettings, saveAiSettings } = require('./ai-settings');
const { popupPetContextMenu } = require('./tray-menu');
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
 * @typedef {import('../shared/pet-payload').PetPayload} PetPayload
 * @typedef {import('../shared/pet-payload').PetCatalogItem} PetCatalogItem
 * @typedef {import('../shared/pet-payload').PetSwitchResult} PetSwitchResult
 */

/**
 * @typedef {object} IpcHost
 * @property {() => string} getCurrentPetId
 * @property {() => PetCatalogItem[]} getCatalog
 * @property {() => Promise<PetCatalogItem[]>} ensureCatalog
 * @property {(petId: string) => Promise<PetPayload>} loadPetPayload
 * @property {(petId: string) => Promise<PetSwitchResult>} switchPet
 * @property {() => boolean} getIgnoreMouse
 * @property {(ignore: boolean) => void} applyIgnoreMouse
 * @property {() => string} getPetName
 * @property {() => string} getPersonaText
 * @property {() => void} [restorePetWindowSize]
 * @property {() => import('electron').BrowserWindow | null} [getMainWindow]
 * @property {() => { displayName?: string; id?: string } | null} [getCurrentPayload]
 */

/**
 * @param {IpcHost} host
 */
function registerIpc(host) {
  ipcMain.handle(IPC.PET_GET, async (_event, petId) => {
    return host.loadPetPayload(petId || host.getCurrentPetId() || 'guga');
  });

  ipcMain.handle(IPC.PET_GET_CATALOG, async () => {
    let catalog = host.getCatalog();
    if (!catalog.length) {
      catalog = await host.ensureCatalog();
    }
    return {
      pets: catalog,
      currentId: host.getCurrentPetId(),
    };
  });

  ipcMain.handle(IPC.PET_SWITCH, async (_event, petId) => {
    return host.switchPet(petId);
  });

  ipcMain.handle(IPC.AI_CHAT, async (_event, input) => {
    try {
      return await handleAiChat(input || {}, {
        getPetName: host.getPetName,
        getPersonaText: host.getPersonaText,
      });
    } catch (err) {
      log.warn('[ai] chat 异常:', formatErr(err));
      const name = host.getPetName() || '小宠';
      return {
        reply: `${name}：脑子有点晕…稍后再聊咕～`,
        action: null,
      };
    }
  });

  ipcMain.handle(IPC.AI_GET_SETTINGS, async () => {
    try {
      return loadAiSettings();
    } catch (err) {
      log.warn('[ai] get-settings 异常:', formatErr(err));
      return {
        hasKey: false,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        encryptionAvailable: false,
        source: 'none',
      };
    }
  });

  ipcMain.handle(IPC.AI_SAVE_SETTINGS, async (_event, partial) => {
    try {
      return saveAiSettings(partial || {});
    } catch (err) {
      log.warn('[ai] save-settings 异常:', formatErr(err));
      return {
        ok: false,
        error: formatErr(err),
      };
    }
  });

  ipcMain.on(IPC.APP_QUIT, () => {
    app.quit();
  });

  // 宠物小窗右键：原生 Menu.popup（与托盘菜单同源）
  ipcMain.on(IPC.PET_POPUP_CONTEXT_MENU, (event, payload) => {
    try {
      const { BrowserWindow } = require('electron');
      const win =
        (typeof host.getMainWindow === 'function' && host.getMainWindow()) ||
        BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;

      /** @type {import('./tray-menu').TrayHost} */
      const trayHost = {
        getMainWindow: () => win,
        getTray: () => null,
        setTray: () => {},
        getCatalog: () => host.getCatalog(),
        getCurrentPetId: () => host.getCurrentPetId(),
        getCurrentPayload: () =>
          typeof host.getCurrentPayload === 'function'
            ? host.getCurrentPayload()
            : null,
        getIgnoreMouse: () => host.getIgnoreMouse(),
        switchPet: (petId) => host.switchPet(petId),
        applyIgnoreMouse: (ignore) => host.applyIgnoreMouse(!!ignore),
      };

      const opts =
        payload && typeof payload === 'object' ? payload : {};
      popupPetContextMenu(trayHost, {
        x: opts.x,
        y: opts.y,
        vitalsLabel: opts.vitalsLabel,
        muted: opts.muted,
      });
    } catch (err) {
      log.warn('[pet] popup-context-menu 失败:', formatErr(err));
    }
  });

  ipcMain.on(IPC.WINDOW_SET_IGNORE_MOUSE, (_event, ignore) => {
    host.applyIgnoreMouse(!!ignore);
  });

  ipcMain.handle(IPC.WINDOW_GET_IGNORE_MOUSE, () => host.getIgnoreMouse());

  ipcMain.on(IPC.WINDOW_RESTORE_PET_SIZE, () => {
    if (typeof host.restorePetWindowSize === 'function') {
      host.restorePetWindowSize();
    }
  });

  /**
   * 自定义拖窗状态（按 webContents.id）
   * @type {Map<number, { originX: number; originY: number; startScreenX: number; startScreenY: number }>}
   */
  const dragState = new Map();

  // 自定义拖窗：避免 -webkit-app-region:drag 在 Windows 上弹出系统菜单
  ipcMain.on(IPC.WINDOW_DRAG_START, (event, payload) => {
    try {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      const screenX =
        payload && typeof payload.screenX === 'number' ? payload.screenX : 0;
      const screenY =
        payload && typeof payload.screenY === 'number' ? payload.screenY : 0;
      const b = win.getBounds();
      dragState.set(event.sender.id, {
        originX: b.x,
        originY: b.y,
        startScreenX: screenX,
        startScreenY: screenY,
      });
    } catch (err) {
      log.warn('[window] drag-start 失败:', formatErr(err));
    }
  });

  ipcMain.on(IPC.WINDOW_DRAG_MOVE, (event, payload) => {
    try {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      const st = dragState.get(event.sender.id);
      if (!st) return;
      const screenX =
        payload && typeof payload.screenX === 'number' ? payload.screenX : 0;
      const screenY =
        payload && typeof payload.screenY === 'number' ? payload.screenY : 0;
      const nx = Math.round(st.originX + (screenX - st.startScreenX));
      const ny = Math.round(st.originY + (screenY - st.startScreenY));
      win.setPosition(nx, ny);
    } catch (err) {
      log.warn('[window] drag-move 失败:', formatErr(err));
    }
  });
}

module.exports = {
  registerIpc,
  IPC,
};
