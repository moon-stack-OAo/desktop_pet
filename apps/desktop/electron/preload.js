/**
 * 预加载脚本：向渲染进程暴露安全 API
 *
 * 注意：webPreferences.sandbox=true 时，preload **只能** require('electron') 等受限模块，
 * 不能 require 项目内相对路径（如 ../shared/ipc-channels），否则 petAPI 注入失败 → 空白窗。
 * 通道名须与 shared/ipc-channels.js 保持一致。
 */
const { contextBridge, ipcRenderer } = require('electron');

/** @type {typeof import('../shared/ipc-channels').IPC} */
const IPC = {
  PET_GET: 'pet:get',
  PET_GET_CATALOG: 'pet:get-catalog',
  PET_SWITCH: 'pet:switch',
  PET_READY: 'pet:ready',
  PET_REQUEST_BEHAVIOR: 'pet:request-behavior',
  PET_TOGGLE_MUTE: 'pet:toggle-mute',
  PET_POPUP_CONTEXT_MENU: 'pet:popup-context-menu',
  AI_CHAT: 'ai:chat',
  AI_GET_SETTINGS: 'ai:get-settings',
  AI_SAVE_SETTINGS: 'ai:save-settings',
  UI_OPEN_CHAT: 'ui:open-chat',
  UI_OPEN_AI_SETTINGS: 'ui:open-ai-settings',
  TOOL_OPEN: 'tool:open',
  TOOL_HIDE: 'tool:hide',
  TOOL_SET_TAB: 'tool:set-tab',
  PET_DISPATCH_BEHAVIOR: 'pet:dispatch-behavior',
  APP_QUIT: 'app:quit',
  WINDOW_SET_IGNORE_MOUSE: 'window:set-ignore-mouse',
  WINDOW_GET_IGNORE_MOUSE: 'window:get-ignore-mouse',
  WINDOW_IGNORE_MOUSE_CHANGED: 'window:ignore-mouse-changed',
  WINDOW_RESTORE_PET_SIZE: 'window:restore-pet-size',
  WINDOW_DRAG_START: 'window:drag-start',
  WINDOW_DRAG_MOVE: 'window:drag-move',
  WINDOW_DRAG_END: 'window:drag-end',
  UPDATE_GET_STATE: 'update:get-state',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_IGNORE: 'update:ignore',
  UPDATE_SET_CHECK_ON_START: 'update:set-check-on-start',
  UPDATE_GET_PREFS: 'update:get-prefs',
  UPDATE_STATUS: 'update:status',
};

contextBridge.exposeInMainWorld('petAPI', {
  /** @param {string} [petId] */
  getPet: (petId) => ipcRenderer.invoke(IPC.PET_GET, petId),

  getCatalog: () => ipcRenderer.invoke(IPC.PET_GET_CATALOG),

  /** @param {string} petId */
  switchPet: (petId) => ipcRenderer.invoke(IPC.PET_SWITCH, petId),

  /** @param {(payload: import('../shared/pet-payload').PetPayload) => void} callback */
  onReady: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {import('../shared/pet-payload').PetPayload} payload */
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC.PET_READY, handler);
    return () => ipcRenderer.removeListener(IPC.PET_READY, handler);
  },

  /** @param {(behavior: string) => void} callback */
  onBehaviorRequest: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {unknown} behavior */
    const handler = (_event, behavior) => {
      if (typeof behavior === 'string' && behavior) {
        callback(behavior);
      }
    };
    ipcRenderer.on(IPC.PET_REQUEST_BEHAVIOR, handler);
    return () => ipcRenderer.removeListener(IPC.PET_REQUEST_BEHAVIOR, handler);
  },

  /** @param {() => void} callback */
  onToggleMute: (callback) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.PET_TOGGLE_MUTE, handler);
    return () => ipcRenderer.removeListener(IPC.PET_TOGGLE_MUTE, handler);
  },

  /**
   * @param {string} message
   * @param {import('../shared/pet-payload').PetChatContext} [context]
   * @returns {Promise<import('../shared/pet-payload').PetChatResult>}
   */
  chat: (message, context) =>
    ipcRenderer.invoke(IPC.AI_CHAT, {
      message: typeof message === 'string' ? message : '',
      vitals: context && context.vitals ? context.vitals : undefined,
    }),

  getAiSettings: () => ipcRenderer.invoke(IPC.AI_GET_SETTINGS),

  /** @param {import('../shared/pet-payload').AiSettingsSaveInput} [partial] */
  saveAiSettings: (partial) =>
    ipcRenderer.invoke(IPC.AI_SAVE_SETTINGS, partial || {}),

  /**
   * 打开 AI 工具窗
   * @param {'chat' | 'settings'} [tab]
   */
  openToolWindow: (tab) => {
    const t = tab === 'settings' ? 'settings' : 'chat';
    ipcRenderer.send(IPC.TOOL_OPEN, t);
  },

  /** 隐藏 AI 工具窗 */
  hideToolWindow: () => {
    ipcRenderer.send(IPC.TOOL_HIDE);
  },

  /**
   * 工具窗 Tab 切换（主进程推送）
   * @param {(tab: 'chat' | 'settings') => void} callback
   */
  onToolTab: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {unknown} tab */
    const handler = (_event, tab) => {
      callback(tab === 'settings' ? 'settings' : 'chat');
    };
    ipcRenderer.on(IPC.TOOL_SET_TAB, handler);
    return () => ipcRenderer.removeListener(IPC.TOOL_SET_TAB, handler);
  },

  /**
   * 工具窗请求宠物行为（主进程转发到宠物窗）
   * @param {string} behavior
   */
  requestBehavior: (behavior) => {
    if (typeof behavior === 'string' && behavior) {
      ipcRenderer.send(IPC.PET_DISPATCH_BEHAVIOR, behavior);
    }
  },

  quit: () => ipcRenderer.send(IPC.APP_QUIT),

  /**
   * 宠物小窗右键：主进程 Menu.popup（可画出窗 bounds）
   * @param {{ x?: number; y?: number; vitalsLabel?: string; muted?: boolean }} [payload]
   */
  popupContextMenu: (payload) => {
    ipcRenderer.send(IPC.PET_POPUP_CONTEXT_MENU, payload || {});
  },

  /** @param {boolean} ignore */
  setIgnoreMouse: (ignore) => {
    ipcRenderer.send(IPC.WINDOW_SET_IGNORE_MOUSE, !!ignore);
  },

  getIgnoreMouse: () => ipcRenderer.invoke(IPC.WINDOW_GET_IGNORE_MOUSE),

  /** 对话/设置关闭后恢复宠物默认窗尺寸 */
  restorePetWindowSize: () => {
    ipcRenderer.send(IPC.WINDOW_RESTORE_PET_SIZE);
  },

  /**
   * 自定义拖窗：左键按下时传入屏幕坐标
   * @param {number} screenX
   * @param {number} screenY
   */
  startWindowDrag: (screenX, screenY) => {
    ipcRenderer.send(IPC.WINDOW_DRAG_START, {
      screenX: Number(screenX) || 0,
      screenY: Number(screenY) || 0,
    });
  },

  /**
   * 拖动中：传入当前屏幕坐标
   * @param {number} screenX
   * @param {number} screenY
   */
  moveWindowDrag: (screenX, screenY) => {
    ipcRenderer.send(IPC.WINDOW_DRAG_MOVE, {
      screenX: Number(screenX) || 0,
      screenY: Number(screenY) || 0,
    });
  },

  /** 拖动结束（松手 / blur） */
  endWindowDrag: () => {
    ipcRenderer.send(IPC.WINDOW_DRAG_END);
  },

  /** @param {() => void} callback */
  onOpenChat: (callback) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.UI_OPEN_CHAT, handler);
    return () => ipcRenderer.removeListener(IPC.UI_OPEN_CHAT, handler);
  },

  /** @param {() => void} callback */
  onOpenAiSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.UI_OPEN_AI_SETTINGS, handler);
    return () => ipcRenderer.removeListener(IPC.UI_OPEN_AI_SETTINGS, handler);
  },

  /** @param {(ignore: boolean) => void} callback */
  onIgnoreMouseChanged: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {unknown} ignore */
    const handler = (_event, ignore) => callback(!!ignore);
    ipcRenderer.on(IPC.WINDOW_IGNORE_MOUSE_CHANGED, handler);
    return () =>
      ipcRenderer.removeListener(IPC.WINDOW_IGNORE_MOUSE_CHANGED, handler);
  },

  getUpdateState: () => ipcRenderer.invoke(IPC.UPDATE_GET_STATE),
  /** @param {{ manual?: boolean }} [opts] */
  checkUpdate: (opts) =>
    ipcRenderer.invoke(IPC.UPDATE_CHECK, opts || { manual: true }),
  downloadUpdate: () => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  /** @param {string} version */
  ignoreUpdate: (version) => ipcRenderer.invoke(IPC.UPDATE_IGNORE, version),
  /** @param {boolean} enabled */
  setCheckUpdateOnStart: (enabled) =>
    ipcRenderer.invoke(IPC.UPDATE_SET_CHECK_ON_START, enabled),
  getUpdatePrefs: () => ipcRenderer.invoke(IPC.UPDATE_GET_PREFS),
  /**
   * @param {(payload: import('../shared/pet-payload').UpdateStatusPayload) => void} callback
   */
  onUpdateStatus: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {import('../shared/pet-payload').UpdateStatusPayload} payload */
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC.UPDATE_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, handler);
  },
});
