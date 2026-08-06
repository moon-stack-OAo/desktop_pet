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

  // —— AI ——
  AI_CHAT: 'ai:chat',
  AI_GET_SETTINGS: 'ai:get-settings',
  AI_SAVE_SETTINGS: 'ai:save-settings',

  // —— 应用 / 窗口 ——
  APP_QUIT: 'app:quit',
  WINDOW_SET_IGNORE_MOUSE: 'window:set-ignore-mouse',
  WINDOW_GET_IGNORE_MOUSE: 'window:get-ignore-mouse',
  WINDOW_IGNORE_MOUSE_CHANGED: 'window:ignore-mouse-changed',

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
