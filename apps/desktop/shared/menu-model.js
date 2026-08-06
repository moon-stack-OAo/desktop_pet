/**
 * 应用菜单行为项单一源（托盘原生菜单 + 渲染层右键共用文案）
 * 纯数据，主进程 CJS / 渲染层均可消费
 */

'use strict';

/**
 * @typedef {object} BehaviorMenuItem
 * @property {string} id 菜单项稳定 id
 * @property {string} label 中文展示文案
 * @property {string} behaviorId 逻辑行为 id（FSM / tray 请求）
 */

/**
 * 喂食 / 摸摸 / 玩耍 / 休息 / 走动
 * 托盘与右键顺序、文案须一致
 * @type {readonly BehaviorMenuItem[]}
 */
const BEHAVIOR_MENU_ITEMS = Object.freeze([
  Object.freeze({ id: 'eat', label: '喂食', behaviorId: 'eat' }),
  Object.freeze({ id: 'happy', label: '摸摸头', behaviorId: 'happy' }),
  Object.freeze({ id: 'play', label: '玩耍', behaviorId: 'play' }),
  Object.freeze({ id: 'sleep', label: '休息', behaviorId: 'sleep' }),
  Object.freeze({ id: 'walk', label: '走动', behaviorId: 'walk' }),
]);

module.exports = {
  BEHAVIOR_MENU_ITEMS,
};
