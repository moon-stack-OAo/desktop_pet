import { type FormEvent, useCallback, useEffect, useState } from 'react';

export interface AiSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

function sourceLabel(source: AiCredentialSource | undefined): string {
  if (source === 'env') return '环境变量';
  if (source === 'local') return '本地保存';
  return '未配置';
}

/**
 * AI Key / Base URL / Model 配置面板（小窗适配）
 */
export default function AiSettingsPanel({
  open,
  onClose,
}: AiSettingsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [keyHint, setKeyHint] = useState('');
  const [source, setSource] = useState<AiCredentialSource>('none');
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');

  const refresh = useCallback(async () => {
    if (!window.petAPI?.getAiSettings) {
      setStatus('设置 API 不可用');
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const s = await window.petAPI.getAiSettings();
      setHasKey(!!s.hasKey);
      setKeyHint(s.keyHint || '');
      setSource(s.source || 'none');
      setEncryptionAvailable(s.encryptionAvailable !== false);
      setBaseUrl(s.baseUrl || 'https://api.openai.com/v1');
      setModel(s.model || 'gpt-4o-mini');
      setApiKey('');
    } catch {
      setStatus('读取设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const onSave = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!window.petAPI?.saveAiSettings || saving) return;
      setSaving(true);
      setStatus('');
      try {
        const partial: AiSettingsSaveInput = {
          baseUrl: baseUrl.trim(),
          model: model.trim(),
        };
        const key = apiKey.trim();
        if (key) partial.apiKey = key;
        const r = await window.petAPI.saveAiSettings(partial);
        if (!r?.ok) {
          setStatus(r?.error || '保存失败');
          return;
        }
        setStatus('已保存');
        setApiKey('');
        await refresh();
      } catch {
        setStatus('保存失败');
      } finally {
        setSaving(false);
      }
    },
    [apiKey, baseUrl, model, refresh, saving],
  );

  const onClearKey = useCallback(async () => {
    if (!window.petAPI?.saveAiSettings || saving) return;
    setSaving(true);
    setStatus('');
    try {
      const r = await window.petAPI.saveAiSettings({ clearKey: true });
      if (!r?.ok) {
        setStatus(r?.error || '清除失败');
        return;
      }
      setStatus('已清除本地 Key');
      setApiKey('');
      await refresh();
    } catch {
      setStatus('清除失败');
    } finally {
      setSaving(false);
    }
  }, [refresh, saving]);

  if (!open) return null;

  return (
    <div
      className="ai-settings-panel"
      role="dialog"
      aria-label="AI 设置"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="ai-settings-header">
        <span className="ai-settings-title">AI 设置</span>
        <button
          type="button"
          className="ai-settings-close"
          aria-label="关闭"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="ai-settings-body">
        {loading ? (
          <div className="ai-settings-meta">加载中…</div>
        ) : (
          <>
            <div className="ai-settings-meta">
              <span>
                Key：
                {hasKey
                  ? keyHint
                    ? `已配置（${keyHint}）`
                    : '已配置'
                  : '未配置'}
              </span>
              <span>来源：{sourceLabel(source)}</span>
              <span>
                加密：{encryptionAvailable ? '可用' : '不可用（明文）'}
              </span>
            </div>
            {source === 'env' ? (
              <div className="ai-settings-hint">
                当前优先使用环境变量 Key；本地保存不会覆盖 env。
              </div>
            ) : null}
            {!encryptionAvailable ? (
              <div className="ai-settings-hint ai-settings-hint--warn">
                本机无安全加密，Key 将明文写入本地（仅本机）。
              </div>
            ) : null}

            <form
              className="ai-settings-form"
              onSubmit={(e) => void onSave(e)}
            >
              <label className="ai-settings-field">
                <span>API Key</span>
                <input
                  className="ai-settings-input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  placeholder={hasKey ? '留空则不修改' : 'sk-…'}
                  disabled={saving}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
              <label className="ai-settings-field">
                <span>Base URL</span>
                <input
                  className="ai-settings-input"
                  type="text"
                  value={baseUrl}
                  disabled={saving}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </label>
              <label className="ai-settings-field">
                <span>Model</span>
                <input
                  className="ai-settings-input"
                  type="text"
                  value={model}
                  disabled={saving}
                  onChange={(e) => setModel(e.target.value)}
                />
              </label>
              <div className="ai-settings-actions">
                <button
                  type="submit"
                  className="ai-settings-btn ai-settings-btn--primary"
                  disabled={saving}
                >
                  保存
                </button>
                <button
                  type="button"
                  className="ai-settings-btn"
                  disabled={saving || !hasKey || source === 'env'}
                  title={
                    source === 'env'
                      ? 'Key 来自环境变量，请在系统中取消设置'
                      : '清除本地保存的 Key'
                  }
                  onClick={() => void onClearKey()}
                >
                  清除 Key
                </button>
              </div>
            </form>
            {status ? (
              <div className="ai-settings-status" role="status">
                {status}
              </div>
            ) : null}
            <div className="ai-settings-hint">
              优先级：环境变量 &gt; 本地加密存储。Key 不进仓库、不写日志明文。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
