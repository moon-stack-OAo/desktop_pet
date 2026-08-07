/**
 * IPC 通道名常量类型（与 ipc-channels.js 同源）
 */

export interface IpcChannels {
  readonly PET_GET: 'pet:get';
  readonly PET_GET_CATALOG: 'pet:get-catalog';
  readonly PET_SWITCH: 'pet:switch';
  readonly PET_READY: 'pet:ready';
  readonly PET_REQUEST_BEHAVIOR: 'pet:request-behavior';
  readonly PET_TOGGLE_MUTE: 'pet:toggle-mute';
  readonly AI_CHAT: 'ai:chat';
  readonly AI_GET_SETTINGS: 'ai:get-settings';
  readonly AI_SAVE_SETTINGS: 'ai:save-settings';
  readonly UI_OPEN_CHAT: 'ui:open-chat';
  readonly UI_OPEN_AI_SETTINGS: 'ui:open-ai-settings';
  readonly APP_QUIT: 'app:quit';
  readonly WINDOW_SET_IGNORE_MOUSE: 'window:set-ignore-mouse';
  readonly WINDOW_GET_IGNORE_MOUSE: 'window:get-ignore-mouse';
  readonly WINDOW_IGNORE_MOUSE_CHANGED: 'window:ignore-mouse-changed';
  readonly WINDOW_RESTORE_PET_SIZE: 'window:restore-pet-size';
  readonly WINDOW_DRAG_START: 'window:drag-start';
  readonly WINDOW_DRAG_MOVE: 'window:drag-move';
  readonly UPDATE_GET_STATE: 'update:get-state';
  readonly UPDATE_CHECK: 'update:check';
  readonly UPDATE_DOWNLOAD: 'update:download';
  readonly UPDATE_INSTALL: 'update:install';
  readonly UPDATE_IGNORE: 'update:ignore';
  readonly UPDATE_SET_CHECK_ON_START: 'update:set-check-on-start';
  readonly UPDATE_GET_PREFS: 'update:get-prefs';
  readonly UPDATE_STATUS: 'update:status';
}

export type IpcChannel = IpcChannels[keyof IpcChannels];

export const IPC: IpcChannels;

export const PET_GET: IpcChannels['PET_GET'];
export const PET_GET_CATALOG: IpcChannels['PET_GET_CATALOG'];
export const PET_SWITCH: IpcChannels['PET_SWITCH'];
export const PET_READY: IpcChannels['PET_READY'];
export const PET_REQUEST_BEHAVIOR: IpcChannels['PET_REQUEST_BEHAVIOR'];
export const PET_TOGGLE_MUTE: IpcChannels['PET_TOGGLE_MUTE'];
export const AI_CHAT: IpcChannels['AI_CHAT'];
export const AI_GET_SETTINGS: IpcChannels['AI_GET_SETTINGS'];
export const AI_SAVE_SETTINGS: IpcChannels['AI_SAVE_SETTINGS'];
export const UI_OPEN_CHAT: IpcChannels['UI_OPEN_CHAT'];
export const UI_OPEN_AI_SETTINGS: IpcChannels['UI_OPEN_AI_SETTINGS'];
export const APP_QUIT: IpcChannels['APP_QUIT'];
export const WINDOW_SET_IGNORE_MOUSE: IpcChannels['WINDOW_SET_IGNORE_MOUSE'];
export const WINDOW_GET_IGNORE_MOUSE: IpcChannels['WINDOW_GET_IGNORE_MOUSE'];
export const WINDOW_IGNORE_MOUSE_CHANGED: IpcChannels['WINDOW_IGNORE_MOUSE_CHANGED'];
export const WINDOW_RESTORE_PET_SIZE: IpcChannels['WINDOW_RESTORE_PET_SIZE'];
export const WINDOW_DRAG_START: IpcChannels['WINDOW_DRAG_START'];
export const WINDOW_DRAG_MOVE: IpcChannels['WINDOW_DRAG_MOVE'];
export const UPDATE_GET_STATE: IpcChannels['UPDATE_GET_STATE'];
export const UPDATE_CHECK: IpcChannels['UPDATE_CHECK'];
export const UPDATE_DOWNLOAD: IpcChannels['UPDATE_DOWNLOAD'];
export const UPDATE_INSTALL: IpcChannels['UPDATE_INSTALL'];
export const UPDATE_IGNORE: IpcChannels['UPDATE_IGNORE'];
export const UPDATE_SET_CHECK_ON_START: IpcChannels['UPDATE_SET_CHECK_ON_START'];
export const UPDATE_GET_PREFS: IpcChannels['UPDATE_GET_PREFS'];
export const UPDATE_STATUS: IpcChannels['UPDATE_STATUS'];
