/**
 * IPC 通道名单一源（主进程 / 非沙箱脚本共用）
 * 运行时字符串须保持稳定，勿随意改名。
 * 注意：preload 在 sandbox=true 下不能 require 本文件，通道字面量已内联在 electron/preload.js。
 */

'use strict';

/** @type {const} */
const IPC = {
  // —— 宠物 ——
  PET_GET: 'pet:get',
  PET_GET_CATALOG: 'pet:get-catalog',
  PET_SWITCH: 'pet:switch',
  PET_READY: 'pet:ready',
  PET_REQUEST_BEHAVIOR: 'pet:request-behavior',
  PET_TOGGLE_MUTE: 'pet:toggle-mute',
  /** 渲染 → 主进程：宠物小窗右键弹出原生菜单 */
  PET_POPUP_CONTEXT_MENU: 'pet:popup-context-menu',

  // —— AI ——
  AI_CHAT: 'ai:chat',
  AI_GET_SETTINGS: 'ai:get-settings',
  AI_SAVE_SETTINGS: 'ai:save-settings',
  /** @deprecated 已改独立工具窗；保留通道名以免旧包崩溃 */
  UI_OPEN_CHAT: 'ui:open-chat',
  /** @deprecated 已改独立工具窗 */
  UI_OPEN_AI_SETTINGS: 'ui:open-ai-settings',

  // —— 工具窗（AI 对话 / 设置） ——
  /** 渲染 → 主进程：打开工具窗，payload 为 tab */
  TOOL_OPEN: 'tool:open',
  /** 渲染 → 主进程：隐藏工具窗 */
  TOOL_HIDE: 'tool:hide',
  /** 主进程 → 工具窗：切换 Tab（chat | settings） */
  TOOL_SET_TAB: 'tool:set-tab',
  /** 渲染（工具窗）→ 主进程：转发行为到宠物窗 FSM */
  PET_DISPATCH_BEHAVIOR: 'pet:dispatch-behavior',

  // —— 应用 / 窗口 ——
  APP_QUIT: 'app:quit',
  WINDOW_SET_IGNORE_MOUSE: 'window:set-ignore-mouse',
  WINDOW_GET_IGNORE_MOUSE: 'window:get-ignore-mouse',
  WINDOW_IGNORE_MOUSE_CHANGED: 'window:ignore-mouse-changed',
  /** 渲染 → 主进程：对话/设置关闭后恢复宠物窗尺寸 */
  WINDOW_RESTORE_PET_SIZE: 'window:restore-pet-size',
  /** 渲染 → 主进程：自定义拖窗开始 / 移动 / 结束（避免 app-region:drag 抢走右键） */
  WINDOW_DRAG_START: 'window:drag-start',
  WINDOW_DRAG_MOVE: 'window:drag-move',
  WINDOW_DRAG_END: 'window:drag-end',

  /** 渲染 → 主进程：系统 CPU / 内存占用（0–100） */
  SYSTEM_GET_LOAD: 'system:get-load',

  // —— 自动更新 ——
  UPDATE_GET_STATE: 'update:get-state',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_IGNORE: 'update:ignore',
  UPDATE_SET_CHECK_ON_START: 'update:set-check-on-start',
  UPDATE_GET_PREFS: 'update:get-prefs',
  UPDATE_STATUS: 'update:status',
};

module.exports = {
  IPC,
  ...IPC,
};
