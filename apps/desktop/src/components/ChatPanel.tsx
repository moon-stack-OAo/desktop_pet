import {type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState,} from 'react';

export type ChatSourceMode = 'local' | 'cloud' | 'unknown';

export interface ChatMessage {
  id: string;
  role: 'user' | 'pet';
  text: string;
  /** 宠物回复来源徽标 */
  source?: ChatSourceMode;
}

export interface ChatPanelProps {
  open: boolean;
  petName: string;
  /** 最近一次对话来源（标题徽标） */
  aiMode?: ChatSourceMode | null;
  /** 发送后返回回复与可选行为 / 来源 */
  onSend: (message: string) => Promise<{
    reply: string;
    action?: string | null;
    mode?: ChatSourceMode;
    source?: ChatSourceMode;
    errorKind?: string;
  }>;
  /** 收到 action 时触发 FSM */
  onAction?: (action: string) => void;
  onClose: () => void;
  /** 打开 AI 设置面板 */
  onOpenSettings?: () => void;
}

function modeLabel(mode: ChatSourceMode | null | undefined): string {
  if (mode === 'cloud') return '云端';
  if (mode === 'local') return '本地';
  return '—';
}

const MAX_HISTORY = 8;

/**
 * 小气泡对话面板：输入 + 发送 + 最近历史；区域 no-drag。
 */
export default function ChatPanel({
  open,
  petName,
  aiMode,
  onSend,
  onAction,
  onClose,
  onOpenSettings,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessionMode, setSessionMode] = useState<ChatSourceMode | null>(
    aiMode ?? null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    if (aiMode) setSessionMode(aiMode);
  }, [aiMode]);

  // 打开时聚焦输入
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  // 滚动到底
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, messages, busy]);

  const push = useCallback(
    (role: 'user' | 'pet', text: string, source?: ChatSourceMode) => {
      idRef.current += 1;
      const item: ChatMessage = {
        id: `m-${idRef.current}`,
        role,
        text,
        source,
      };
      setMessages((prev) => {
        const next = [...prev, item];
        return next.length > MAX_HISTORY
          ? next.slice(next.length - MAX_HISTORY)
          : next;
      });
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || busy) return;
      setInput('');
      push('user', text);
      setBusy(true);
      try {
        const result = await onSend(text);
        const reply =
          result?.reply && String(result.reply).trim()
            ? String(result.reply).trim()
            : '……';
        const src: ChatSourceMode =
          result?.mode === 'cloud' || result?.source === 'cloud'
            ? 'cloud'
            : result?.mode === 'local' || result?.source === 'local'
              ? 'local'
              : 'unknown';
        setSessionMode(src);
        push('pet', reply, src);
        const action = result?.action;
        if (action && typeof action === 'string' && action !== 'null') {
          onAction?.(action);
        }
      } catch {
        setSessionMode('unknown');
        push('pet', `${petName}：网络有点卡…咕～`, 'unknown');
      } finally {
        setBusy(false);
      }
    },
    [busy, input, onAction, onSend, petName, push],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!open) return null;

  return (
    <div
      className="chat-panel"
      role="dialog"
      aria-label={`${petName} 对话`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="chat-panel-header">
        <span className="chat-panel-title">和 {petName} 聊天</span>
        <span
          className={
            sessionMode === 'cloud'
              ? 'chat-mode-badge chat-mode-badge--cloud'
              : sessionMode === 'local'
                ? 'chat-mode-badge chat-mode-badge--local'
                : 'chat-mode-badge'
          }
          title={
            sessionMode === 'cloud'
              ? '当前为云端 AI 回复'
              : sessionMode === 'local'
                ? '当前为本地规则回复（无 Key 或已降级）'
                : '发送后显示本地 / 云端'
          }
        >
          {modeLabel(sessionMode)}
        </span>
        {onOpenSettings ? (
          <button
            type="button"
            className="chat-panel-settings"
            aria-label="AI 设置"
            title="AI 设置"
            onClick={onOpenSettings}
          >
            ⚙
          </button>
        ) : null}
        <button
          type="button"
          className="chat-panel-close"
          aria-label="关闭"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="chat-panel-list" ref={listRef}>
        {messages.length === 0 ? (
          <div className="chat-panel-hint">
            说点什么吧～
            <br />
            标题「本地/云端」表示 AI 模式
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'user'
                  ? 'chat-bubble chat-bubble--user'
                  : 'chat-bubble chat-bubble--pet'
              }
            >
              {m.role === 'pet' && m.source ? (
                <span
                  className={
                    m.source === 'cloud'
                      ? 'chat-msg-source chat-msg-source--cloud'
                      : m.source === 'local'
                        ? 'chat-msg-source chat-msg-source--local'
                        : 'chat-msg-source'
                  }
                >
                  {modeLabel(m.source)}
                </span>
              ) : null}
              {m.text}
            </div>
          ))
        )}
        {busy ? (
          <div className="chat-bubble chat-bubble--pet chat-bubble--busy">
            …
          </div>
        ) : null}
      </div>
      <form className="chat-panel-form" onSubmit={(e) => void handleSubmit(e)}>
        <input
          ref={inputRef}
          className="chat-panel-input"
          type="text"
          value={input}
          maxLength={200}
          placeholder="说点什么…"
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="chat-panel-send"
          disabled={busy || !input.trim()}
        >
          发送
        </button>
      </form>
    </div>
  );
}
