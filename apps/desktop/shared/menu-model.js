/**
 * 应用菜单行为项单一源（托盘原生菜单 + 渲染层右键共用文案）
 * 主进程：require('../shared/menu-model')
 * 渲染层：import menuModel from '...' 后取 .BEHAVIOR_MENU_ITEMS
 * （Vite 对 CJS 命名导入支持不完整，请用 default import）
 */

'use strict';

/**
 * @typedef {object} BehaviorMenuItem
 * @property {string} id 菜单项稳定 id
 * @property {string} label 中文展示文案
 * @property {string} behaviorId 逻辑行为 id（FSM / tray 请求）
 */

/**
 * 用户主动交互仅这 4 项；walk/sick/hunt 等由 AutoScheduler / 养成自动触发
 * @type {readonly BehaviorMenuItem[]}
 */
const BEHAVIOR_MENU_ITEMS = Object.freeze([
  Object.freeze({ id: 'eat', label: '喂食', behaviorId: 'eat' }),
  Object.freeze({ id: 'happy', label: '摸摸头', behaviorId: 'happy' }),
  Object.freeze({ id: 'play', label: '玩耍', behaviorId: 'play' }),
  Object.freeze({ id: 'sleep', label: '休息', behaviorId: 'sleep' }),
]);

module.exports = {
  BEHAVIOR_MENU_ITEMS,
};
