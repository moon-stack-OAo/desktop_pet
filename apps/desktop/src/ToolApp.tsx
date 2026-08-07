import { useCallback, useEffect, useState } from 'react';
import AiSettingsPanel from './components/AiSettingsPanel';
import ChatPanel from './components/ChatPanel';
import type { ChatSourceMode } from './components/ChatPanel';

export type ToolTab = 'chat' | 'settings';

/**
 * AI 工具窗根：Tab 切换「对话 / 设置」
 */
export default function ToolApp() {
  const [tab, setTab] = useState<ToolTab>('chat');
  const [petName, setPetName] = useState('小宠');
  const [lastMode, setLastMode] = useState<ChatSourceMode | null>(null);

  // 主进程推送 Tab
  useEffect(() => {
    const unsub = window.petAPI?.onToolTab?.((t) => {
      setTab(t === 'settings' ? 'settings' : 'chat');
    });
    return () => {
      unsub?.();
    };
  }, []);

  // 读取当前宠物名
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pet = await window.petAPI?.getPet?.();
        if (cancelled || !pet) return;
        setPetName(pet.displayName || pet.id || '小宠');
      } catch {
        /* ignore */
      }
    })();
    const unsub = window.petAPI?.onReady?.((payload) => {
      setPetName(payload.displayName || payload.id || '小宠');
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const handleChatSend = useCallback(async (message: string) => {
    if (!window.petAPI?.chat) {
      return {
        reply: '对话不可用',
        action: null as string | null,
        mode: 'unknown' as ChatSourceMode,
        source: 'unknown' as ChatSourceMode,
      };
    }
    try {
      const result = await window.petAPI.chat(message);
      const mode: ChatSourceMode =
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
        action: null as string | null,
        mode: 'unknown' as ChatSourceMode,
        source: 'unknown' as ChatSourceMode,
        errorKind: isTimeout ? 'timeout' : isNetwork ? 'network' : 'unknown',
      };
    }
  }, []);

  const handleChatAction = useCallback((action: string) => {
    // 转发到宠物窗 FSM（与 useChatSession 一致）
    if (action === 'eat') {
      window.petAPI?.requestBehavior?.('eat');
      return;
    }
    if (action === 'happy' || action === 'headpat') {
      window.petAPI?.requestBehavior?.('happy');
      return;
    }
    if (action === 'play') {
      window.petAPI?.requestBehavior?.('play');
      return;
    }
    window.petAPI?.requestBehavior?.(action);
  }, []);

  const closeTool = useCallback(() => {
    window.petAPI?.hideToolWindow?.();
  }, []);

  const openSettings = useCallback(() => {
    setTab('settings');
  }, []);

  // Esc 关窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTool();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeTool]);

  return (
    <div className="tool-app">
      <header className="tool-titlebar">
        <div className="tool-titlebar-main">
          <span className="tool-titlebar-dot" aria-hidden />
          <div className="tool-titlebar-text">
            <span className="tool-titlebar-title">AI 助手</span>
            <span className="tool-titlebar-sub">{petName}</span>
          </div>
        </div>
        <button
          type="button"
          className="tool-titlebar-close"
          aria-label="关闭"
          title="关闭"
          onClick={closeTool}
        >
          ×
        </button>
      </header>

      <div className="tool-tabs" role="tablist" aria-label="AI 工具">
        <div className="tool-tabs-track">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            className={
              tab === 'chat' ? 'tool-tab tool-tab--active' : 'tool-tab'
            }
            onClick={() => setTab('chat')}
          >
            对话
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'settings'}
            className={
              tab === 'settings' ? 'tool-tab tool-tab--active' : 'tool-tab'
            }
            onClick={() => setTab('settings')}
          >
            设置
          </button>
        </div>
      </div>

      <div className="tool-body">
        <ChatPanel
          open={tab === 'chat'}
          petName={petName}
          aiMode={lastMode}
          onSend={handleChatSend}
          onAction={handleChatAction}
          onClose={closeTool}
          onOpenSettings={openSettings}
        />
        <AiSettingsPanel open={tab === 'settings'} onClose={closeTool} />
      </div>
    </div>
  );
}
