import { useContextQuit } from './useContextQuit';
import type { VitalStats } from './useVitals';

export interface UsePetMenuOptions {
  vitals: VitalStats | null;
  muted: boolean;
}

/**
 * 宠物右键：委托原生 Menu.popup；Esc 退出。
 * 行为/切宠/AI 由主进程 tray-menu 处理。
 */
export function usePetMenu({
  vitals,
  muted,
}: UsePetMenuOptions): void {
  useContextQuit({
    vitals,
    muted,
  });
}
