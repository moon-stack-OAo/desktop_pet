import { useContextQuit } from './useContextQuit';
import type { VitalStats } from './useVitals';

export interface UsePetMenuOptions {
  chatOpen: boolean;
  onCloseChat: () => void;
  vitals: VitalStats | null;
  muted: boolean;
  aiSettingsOpen?: boolean;
  onCloseAiSettings?: () => void;
}

/**
 * 宠物右键：委托原生 Menu.popup；Esc 关设置/聊天/退出。
 * 行为/切宠等由主进程 tray-menu 处理。
 */
export function usePetMenu({
  chatOpen,
  onCloseChat,
  vitals,
  muted,
  aiSettingsOpen = false,
  onCloseAiSettings,
}: UsePetMenuOptions): void {
  useContextQuit({
    chatOpen,
    onCloseChat,
    aiSettingsOpen,
    onCloseAiSettings,
    vitals,
    muted,
  });
}
