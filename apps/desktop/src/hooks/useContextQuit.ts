import {useCallback, useEffect, useRef, useState} from 'react';

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
}

export interface UseContextQuitOptions {
  /** 对话面板是否打开；Esc 优先关聊天 */
  chatOpen?: boolean;
  /** 关闭对话面板 */
  onCloseChat?: () => void;
  /** AI 设置是否打开；Esc 优先于聊天关闭 */
  aiSettingsOpen?: boolean;
  onCloseAiSettings?: () => void;
}

/**
 * 右键打开自定义 HTML 菜单；Esc：设置 → 聊天 → 菜单 → 退出。
 */
export function useContextQuit(options: UseContextQuitOptions = {}): {
  menu: ContextMenuState;
  openMenu: (x: number, y: number) => void;
  closeMenu: () => void;
} {
  const {
    chatOpen = false,
    onCloseChat,
    aiSettingsOpen = false,
    onCloseAiSettings,
  } = options;
  const chatOpenRef = useRef(chatOpen);
  const onCloseChatRef = useRef(onCloseChat);
  const aiSettingsOpenRef = useRef(aiSettingsOpen);
  const onCloseAiSettingsRef = useRef(onCloseAiSettings);
  chatOpenRef.current = chatOpen;
  onCloseChatRef.current = onCloseChat;
  aiSettingsOpenRef.current = aiSettingsOpen;
  onCloseAiSettingsRef.current = onCloseAiSettings;

  const [menu, setMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });

  const openMenu = useCallback((x: number, y: number) => {
    setMenu({ open: true, x, y });
  }, []);

  const closeMenu = useCallback(() => {
    setMenu((m) => (m.open ? { ...m, open: false } : m));
  }, []);

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
      setMenu({ open: true, x: e.clientX, y: e.clientY });
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
      setMenu((m) => {
        if (m.open) {
          return { ...m, open: false };
        }
        window.petAPI?.quit();
        return m;
      });
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

  return { menu, openMenu, closeMenu };
}
