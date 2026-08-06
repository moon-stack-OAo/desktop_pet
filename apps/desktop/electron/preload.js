/**
 * 预加载脚本：向渲染进程暴露安全 API
 */
const { contextBridge, ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipc-channels');

contextBridge.exposeInMainWorld('petAPI', {
  /** 主动拉取宠物配置 */
  /** @param {string} [petId] */
  getPet: (petId) => ipcRenderer.invoke(IPC.PET_GET, petId),

  /** 宠物目录与当前 id */
  getCatalog: () => ipcRenderer.invoke(IPC.PET_GET_CATALOG),

  /**
   * 切换宠物；成功时主进程会再推送 pet:ready
   * @param {string} petId
   */
  switchPet: (petId) => ipcRenderer.invoke(IPC.PET_SWITCH, petId),

  /** 主进程推送就绪事件；返回取消订阅函数 */
  /** @param {(payload: import('../shared/pet-payload').PetPayload) => void} callback */
  onReady: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {import('../shared/pet-payload').PetPayload} payload */
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC.PET_READY, handler);
    return () => ipcRenderer.removeListener(IPC.PET_READY, handler);
  },

  /**
   * 主进程（托盘等）请求行为；返回取消订阅
   * @param {(behavior: string) => void} callback
   */
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

  /**
   * 主进程菜单请求切换静音；返回取消订阅
   * @param {() => void} callback
   */
  onToggleMute: (callback) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.PET_TOGGLE_MUTE, handler);
    return () => ipcRenderer.removeListener(IPC.PET_TOGGLE_MUTE, handler);
  },

  /**
   * AI 对话：主进程使用当前宠物 persona；可选传 vitals
   * @param {string} message
   * @param {import('../shared/pet-payload').PetChatContext} [context]
   * @returns {Promise<import('../shared/pet-payload').PetChatResult>}
   */
  chat: (message, context) =>
    ipcRenderer.invoke(IPC.AI_CHAT, {
      message: typeof message === 'string' ? message : '',
      vitals: context && context.vitals ? context.vitals : undefined,
    }),

  /** AI 设置（无完整 key，仅 hasKey / keyHint） */
  getAiSettings: () => ipcRenderer.invoke(IPC.AI_GET_SETTINGS),

  /**
   * 保存 AI 设置
   * @param {import('../shared/pet-payload').AiSettingsSaveInput} [partial]
   */
  saveAiSettings: (partial) =>
    ipcRenderer.invoke(IPC.AI_SAVE_SETTINGS, partial || {}),

  /** 退出应用 */
  quit: () => ipcRenderer.send(IPC.APP_QUIT),

  /**
   * 设置窗口点击穿透（true=穿透到下方窗口）
   * 开启后宠物窗收不到点击，须用托盘「点击穿透」关闭
   * @param {boolean} ignore
   */
  setIgnoreMouse: (ignore) => {
    ipcRenderer.send(IPC.WINDOW_SET_IGNORE_MOUSE, !!ignore);
  },

  /** 当前是否点击穿透 */
  getIgnoreMouse: () => ipcRenderer.invoke(IPC.WINDOW_GET_IGNORE_MOUSE),

  /**
   * 主进程通知穿透状态变化（托盘切换等）；返回取消订阅
   * @param {(ignore: boolean) => void} callback
   */
  onIgnoreMouseChanged: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {unknown} ignore */
    const handler = (_event, ignore) => callback(!!ignore);
    ipcRenderer.on(IPC.WINDOW_IGNORE_MOUSE_CHANGED, handler);
    return () =>
      ipcRenderer.removeListener(IPC.WINDOW_IGNORE_MOUSE_CHANGED, handler);
  },

  // —— 自动更新 ——
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
   * 订阅更新状态；返回取消订阅
   * @param {(payload: import('../shared/pet-payload').UpdateStatusPayload) => void} callback
   */
  onUpdateStatus: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {import('../shared/pet-payload').UpdateStatusPayload} payload */
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC.UPDATE_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, handler);
  },
});
