/**
 * 应用菜单行为项类型（与 menu-model.js 同源）
 */

export interface BehaviorMenuItem {
  /** 菜单项稳定 id */
  readonly id: string;
  /** 中文展示文案 */
  readonly label: string;
  /** 逻辑行为 id（FSM / tray 请求） */
  readonly behaviorId: string;
}

/** 喂食 / 摸摸 / 玩耍 / 休息 / 走动 */
export const BEHAVIOR_MENU_ITEMS: readonly BehaviorMenuItem[];
