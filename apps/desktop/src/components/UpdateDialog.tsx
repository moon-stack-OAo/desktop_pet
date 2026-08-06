import { useCallback, useEffect, useState } from 'react';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'ignored'
  | 'dev-skip';

export interface UpdateStatusPayload {
  phase: UpdatePhase | string;
  version?: string;
  currentVersion?: string;
  releaseNotes?: string | null;
  message?: string;
  percent?: number;
  silent?: boolean;
}

/**
 * 更新提示浮层（小窗适配）：发现更新 / 进度 / 安装
 */
export default function UpdateDialog() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = window.petAPI?.onUpdateStatus?.((payload) => {
      const p = payload as unknown as UpdateStatusPayload;
      setStatus(p);
      // 启动静默：无更新 / 忽略 / 检查中不弹
      if (p.phase === 'not-available' && p.silent) return;
      if (p.phase === 'ignored') return;
      if (p.phase === 'checking') {
        // 手动检查时显示「检查中」
        setOpen(true);
        return;
      }
      if (p.phase === 'dev-skip') {
        setOpen(true);
        return;
      }
      if (
        p.phase === 'available' ||
        p.phase === 'downloading' ||
        p.phase === 'downloaded' ||
        p.phase === 'error' ||
        (p.phase === 'not-available' && !p.silent)
      ) {
        setOpen(true);
      }
    });
    return () => {
      unsub?.();
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const onDownload = useCallback(async () => {
    setBusy(true);
    try {
      await window.petAPI?.downloadUpdate?.();
    } finally {
      setBusy(false);
    }
  }, []);

  const onInstall = useCallback(async () => {
    setBusy(true);
    try {
      await window.petAPI?.installUpdate?.();
    } finally {
      setBusy(false);
    }
  }, []);

  const onIgnore = useCallback(async () => {
    const v = status?.version;
    if (v) await window.petAPI?.ignoreUpdate?.(v);
    setOpen(false);
  }, [status?.version]);

  const onCheck = useCallback(async () => {
    setBusy(true);
    try {
      await window.petAPI?.checkUpdate?.({ manual: true });
    } finally {
      setBusy(false);
    }
  }, []);

  if (!open || !status) return null;

  const phase = status.phase;
  const percent =
    typeof status.percent === 'number'
      ? Math.max(0, Math.min(100, Math.round(status.percent)))
      : 0;

  let title = '更新';
  let body = '';
  if (phase === 'checking') {
    title = '检查更新';
    body = '正在连接…';
  } else if (phase === 'available') {
    title = '发现新版本';
    body = `${status.currentVersion || '?'} → ${status.version || '?'}`;
  } else if (phase === 'downloading') {
    title = '下载中';
    body = `${percent}%`;
  } else if (phase === 'downloaded') {
    title = '下载完成';
    body = `v${status.version || ''} 已就绪，重启后安装`;
  } else if (phase === 'not-available') {
    title = '已是最新';
    body = `当前 v${status.currentVersion || status.version || ''}`;
  } else if (phase === 'dev-skip') {
    title = '开发模式';
    body = status.message || '开发模式不检查更新';
  } else if (phase === 'error') {
    title = '更新失败';
    body = status.message || '未知错误';
  }

  return (
    <div className="update-dialog" role="dialog" aria-label="软件更新">
      <div className="update-dialog-header">
        <span className="update-dialog-title">{title}</span>
        <button
          type="button"
          className="update-dialog-close"
          onClick={close}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
      <div className="update-dialog-body">{body}</div>
      {phase === 'available' && status.releaseNotes ? (
        <div className="update-dialog-notes">{status.releaseNotes}</div>
      ) : null}
      {phase === 'downloading' ? (
        <div className="update-dialog-progress">
          <div
            className="update-dialog-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      <div className="update-dialog-actions">
        {phase === 'available' ? (
          <>
            <button
              type="button"
              className="update-btn update-btn--primary"
              disabled={busy}
              onClick={() => void onDownload()}
            >
              下载更新
            </button>
            <button
              type="button"
              className="update-btn"
              disabled={busy}
              onClick={() => void onIgnore()}
            >
              忽略此版本
            </button>
            <button type="button" className="update-btn" onClick={close}>
              稍后
            </button>
          </>
        ) : null}
        {phase === 'downloaded' ? (
          <>
            <button
              type="button"
              className="update-btn update-btn--primary"
              disabled={busy}
              onClick={() => void onInstall()}
            >
              安装并重启
            </button>
            <button type="button" className="update-btn" onClick={close}>
              稍后
            </button>
          </>
        ) : null}
        {phase === 'error' || phase === 'dev-skip' || phase === 'not-available' ? (
          <>
            {phase === 'error' ? (
              <button
                type="button"
                className="update-btn update-btn--primary"
                disabled={busy}
                onClick={() => void onCheck()}
              >
                重试
              </button>
            ) : null}
            <button type="button" className="update-btn" onClick={close}>
              关闭
            </button>
          </>
        ) : null}
        {phase === 'checking' || phase === 'downloading' ? (
          <button type="button" className="update-btn" onClick={close}>
            后台进行
          </button>
        ) : null}
      </div>
    </div>
  );
}
