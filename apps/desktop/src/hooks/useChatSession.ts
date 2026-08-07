import { useCallback, useEffect, useState } from 'react';
import type { VitalStats } from './useVitals';

export type ChatMode = 'local' | 'cloud' | 'unknown';

export interface ChatSendResult {
  reply: string;
  action: string | null;
  mode: ChatMode;
  source: ChatMode;
  errorKind?: PetChatResult['errorKind'];
  notice?: string;
}

export interface UseChatSessionOptions {
  /** 切宠时关闭对话 */
  petId?: string | null;
  vitals: VitalStats | null;
  feed: (reason?: string) => boolean;
  pat: (reason?: string) => boolean;
  playWith: (reason?: string) => boolean;
  request: (behavior: string, reason?: string) => boolean;
  /** 打开对话前关闭菜单等 */
  onBeforeOpen?: () => void;
}

export interface UseChatSessionResult {
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  /** 打开对话面板 */
  openChat: () => void;
  closeChat: () => void;
  handleChatSend: (message: string) => Promise<ChatSendResult>;
  handleChatAction: (action: string) => void;
  /** 最近一次成功对话的来源（用于标题徽标） */
  lastMode: ChatMode | null;
}

/**
 * 对话面板：开关状态、发送（含降级文案）、动作分发、双击打开。
 */
export function useChatSession({
  petId,
  vitals,
  feed,
  pat,
  playWith,
  request,
  onBeforeOpen,
}: UseChatSessionOptions): UseChatSessionResult {
  const [chatOpen, setChatOpen] = useState(false);
  const [lastMode, setLastMode] = useState<ChatMode | null>(null);

  const closeChat = useCallback(() => setChatOpen(false), []);

  // 切宠时关闭对话
  useEffect(() => {
    setChatOpen(false);
    setLastMode(null);
  }, [petId]);

  /** 打开对话：关穿透（由主进程托盘侧处理）+ 通知前处理 */
  const openChat = useCallback(() => {
    onBeforeOpen?.();
    setChatOpen(true);
  }, [onBeforeOpen]);

  // 双击宠物打开对话面板
  useEffect(() => {
    const onDblClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest?.(
          '.chat-panel, .ai-settings-panel, .context-menu, input, button, textarea',
        )
      ) {
        return;
      }
      e.preventDefault();
      // 双击时若穿透已开，先请求关闭穿透
      void window.petAPI?.getIgnoreMouse?.().then((v) => {
        if (v) window.petAPI?.setIgnoreMouse?.(false);
      });
      openChat();
    };
    document.addEventListener('dblclick', onDblClick);
    return () => document.removeEventListener('dblclick', onDblClick);
  }, [openChat]);

  // 托盘「AI 对话」+ 右键菜单 CustomEvent
  useEffect(() => {
    const unsub = window.petAPI?.onOpenChat?.(() => {
      openChat();
    });
    const onCustom = () => openChat();
    window.addEventListener('pet:open-chat', onCustom);
    return () => {
      unsub?.();
      window.removeEventListener('pet:open-chat', onCustom);
    };
  }, [openChat]);

  const handleChatSend = useCallback(
    async (message: string): Promise<ChatSendResult> => {
      if (!window.petAPI?.chat) {
        return {
          reply: '对话不可用',
          action: null,
          mode: 'unknown',
          source: 'unknown',
        };
      }
      try {
        const result = await window.petAPI.chat(message, {
          vitals: vitals
            ? { hunger: vitals.hunger, mood: vitals.mood }
            : undefined,
        });
        const mode: ChatMode =
          result.mode === 'cloud' || result.source === 'cloud'
            ? 'cloud'
            : result.mode === 'local' || result.source === 'local'
              ? 'local'
              : 'local';
        setLastMode(mode);
        return {
          reply: result.reply,
          action: result.action ?? null,
          mode,
          source: mode,
          errorKind: result.errorKind,
          notice: result.notice,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout =
          /timeout|abort|超时/i.test(msg) ||
          (err instanceof Error && err.name === 'AbortError');
        const isNetwork = /network|fetch|econn|enotfound/i.test(msg);
        const reply = isTimeout
          ? '云端超时，请稍后再试…咕～'
          : isNetwork
            ? '网络异常，暂时连不上云端…咕～'
            : '对话失败，请稍后再试…咕～';
        setLastMode('unknown');
        return {
          reply,
          action: null,
          mode: 'unknown',
          source: 'unknown',
          errorKind: isTimeout ? 'timeout' : isNetwork ? 'network' : 'unknown',
        };
      }
    },
    [vitals],
  );

  const handleChatAction = useCallback(
    (action: string) => {
      // 对话触发的动作走 ai 优先级（inferPriority 认 ai: 前缀）
      if (action === 'eat') {
        feed('ai:chat:eat');
        return;
      }
      if (action === 'happy' || action === 'headpat') {
        pat('ai:chat:happy');
        return;
      }
      if (action === 'play') {
        playWith('ai:chat:play');
        return;
      }
      request(action, `ai:chat:${action}`);
    },
    [feed, pat, playWith, request],
  );

  return {
    chatOpen,
    setChatOpen,
    openChat,
    closeChat,
    handleChatSend,
    handleChatAction,
    lastMode,
  };
}
