/**
 * 主进程 IPC 注册
 */

'use strict';

const { app, ipcMain } = require('electron');
const log = require('./logger');
const { handleAiChat } = require('./ai-chat');
const { loadAiSettings, saveAiSettings } = require('./ai-settings');
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

  ipcMain.on(IPC.WINDOW_SET_IGNORE_MOUSE, (_event, ignore) => {
    host.applyIgnoreMouse(!!ignore);
  });

  ipcMain.handle(IPC.WINDOW_GET_IGNORE_MOUSE, () => host.getIgnoreMouse());

  ipcMain.on(IPC.WINDOW_RESTORE_PET_SIZE, () => {
    if (typeof host.restorePetWindowSize === 'function') {
      host.restorePetWindowSize();
    }
  });
}

module.exports = {
  registerIpc,
  IPC,
};
