import { useEffect, useRef } from 'react';
import type { VitalStats } from './useVitals';

export interface UseContextQuitOptions {
  /** 对话面板是否打开；Esc 优先关聊天 */
  chatOpen?: boolean;
  /** 关闭对话面板 */
  onCloseChat?: () => void;
  /** AI 设置是否打开；Esc 优先于聊天关闭 */
  aiSettingsOpen?: boolean;
  onCloseAiSettings?: () => void;
  /** 生命值：右键菜单顶部状态行 */
  vitals?: VitalStats | null;
  /** 静音：右键菜单静音项文案 */
  muted?: boolean;
}

/**
 * 右键：主进程原生 Menu.popup；Esc：设置 → 聊天 → 退出。
 */
export function useContextQuit(options: UseContextQuitOptions = {}): void {
  const {
    chatOpen = false,
    onCloseChat,
    aiSettingsOpen = false,
    onCloseAiSettings,
    vitals = null,
    muted = false,
  } = options;

  const chatOpenRef = useRef(chatOpen);
  const onCloseChatRef = useRef(onCloseChat);
  const aiSettingsOpenRef = useRef(aiSettingsOpen);
  const onCloseAiSettingsRef = useRef(onCloseAiSettings);
  const vitalsRef = useRef(vitals);
  const mutedRef = useRef(muted);
  chatOpenRef.current = chatOpen;
  onCloseChatRef.current = onCloseChat;
  aiSettingsOpenRef.current = aiSettingsOpen;
  onCloseAiSettingsRef.current = onCloseAiSettings;
  vitalsRef.current = vitals;
  mutedRef.current = muted;

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      // 必须拦截系统/Chromium 默认菜单（无边框窗上尤其容易冒出原生项）
      e.preventDefault();
      e.stopPropagation();
      const t = e.target as HTMLElement | null;
      // 聊天 / 设置面板内不弹应用菜单
      if (t?.closest?.('.chat-panel, .ai-settings-panel, input, textarea')) {
        return;
      }
      const v = vitalsRef.current;
      const h = v ? Math.round(v.hunger) : '—';
      const m = v ? Math.round(v.mood) : '—';
      window.petAPI?.popupContextMenu?.({
        x: e.clientX,
        y: e.clientY,
        vitalsLabel: `状态：饱食 ${h} / 心情 ${m}`,
        muted: mutedRef.current,
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (aiSettingsOpenRef.current) {
        onCloseAiSettingsRef.current?.();
        return;
      }
      if (chatOpenRef.current) {
        onCloseChatRef.current?.();
        return;
      }
      window.petAPI?.quit();
    };

    // 捕获阶段优先于默认行为
    document.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
