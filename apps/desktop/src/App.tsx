import {useCallback, useEffect, useState} from 'react';
import AiSettingsPanel from './components/AiSettingsPanel';
import ChatPanel from './components/ChatPanel';
import PetStage from './components/PetStage';
import PetSpritesheet from './components/PetSpritesheet';
import PetVideo from './components/PetVideo';
import StatusOverlay from './components/StatusOverlay';
import UpdateDialog from './components/UpdateDialog';
import VitalsBar from './components/VitalsBar';
import {useChatSession} from './hooks/useChatSession';
import {useDebugBehaviors} from './hooks/useDebugBehaviors';
import {useIgnoreMouse} from './hooks/useIgnoreMouse';
import {usePetMenu} from './hooks/usePetMenu';
import {useWindowDrag} from './hooks/useWindowDrag';
import {PetProvider, usePetController} from './pet/PetContext';

function PetApp() {
  useWindowDrag();
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const {
    payload,
    status,
    setStatus,
    currentClip,
    state,
    request,
    onClipEnded,
    muted,
    toggleMuted,
    vitals,
    feed,
    pat,
    playWith,
  } = usePetController();

  // 同步主进程穿透状态（托盘/右键菜单切换时）
  useIgnoreMouse({ setStatus });

  const chat = useChatSession({
    petId: payload?.id,
    vitals,
    feed,
    pat,
    playWith,
    request,
  });

  const openAiSettings = useCallback(() => {
    setAiSettingsOpen(true);
  }, []);

  const closeAiSettings = useCallback(() => {
    setAiSettingsOpen(false);
  }, []);

  // 托盘「AI 设置…」
  useEffect(() => {
    const unsub = window.petAPI?.onOpenAiSettings?.(() => {
      openAiSettings();
    });
    return () => {
      unsub?.();
    };
  }, [openAiSettings]);

  // 对话/设置打开时保持放大窗；全部关闭后恢复宠物尺寸
  useEffect(() => {
    const uiOpen = chat.chatOpen || aiSettingsOpen;
    if (!uiOpen) {
      window.petAPI?.restorePetWindowSize?.();
    }
  }, [chat.chatOpen, aiSettingsOpen]);

  // 右键原生菜单 + Esc
  usePetMenu({
    chatOpen: chat.chatOpen,
    onCloseChat: chat.closeChat,
    vitals,
    muted,
    aiSettingsOpen,
    onCloseAiSettings: closeAiSettings,
  });

  useDebugBehaviors({
    chatOpen: chat.chatOpen,
    feed,
    pat,
    playWith,
    request,
    state,
  });

  const onAutoplayBlocked = useCallback(() => {
    setStatus('点击播放');
  }, [setStatus]);

  const onPlaying = useCallback(() => {
    // 仅清「点击播放」/解码短提示；保留加载/错误与短时反馈
    setStatus((prev) =>
      prev === '点击播放' ||
      prev.startsWith('视频') ||
      prev.includes('解码失败')
        ? ''
        : prev,
    );
  }, [setStatus]);

  const onVideoDecodeError = useCallback(
    (reason: string) => {
      setStatus(reason || '视频无法播放');
    },
    [setStatus],
  );

  const videoPreloadUrls = (() => {
    if (!payload?.clips) return undefined;
    return Object.values(payload.clips)
      .map((c) => c?.url)
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
  })();

  // 主进程托盘/右键「静音切换」
  useEffect(() => {
    const unsub = window.petAPI?.onToggleMute?.(() => {
      toggleMuted();
    });
    return () => {
      unsub?.();
    };
  }, [toggleMuted]);

  const showName = payload?.displayName;
  const isSpritesheet = payload?.renderer === 'spritesheet';
  const sheet = payload?.spritesheet;
  // 切宠瞬间 FSM 可能尚未就绪：必须回落到 idle，避免空白
  const videoSrc =
    currentClip?.url ||
    payload?.clips?.idle?.url ||
    payload?.idle?.url ||
    '';
  const loop = currentClip ? currentClip.loop === true : true;
  const clipName = state?.clip || 'idle';

  const overlayText =
    status ||
    (vitals && vitals.hunger <= 20 ? '好饿…' : '') ||
    (muted ? '已静音' : '');

  return (
    <PetStage displayName={showName}>
      {isSpritesheet && sheet?.url ? (
        <PetSpritesheet
          key={payload?.id}
          src={sheet.url}
          frameWidth={sheet.frameWidth || 128}
          frameHeight={sheet.frameHeight || 128}
          animationName={clipName}
          animations={sheet.animations}
          defaultFps={sheet.fps ?? 8}
          columns={sheet.columns}
          onEnded={onClipEnded}
          onReady={onPlaying}
          onError={() => setStatus('精灵表加载失败')}
        />
      ) : videoSrc ? (
        <PetVideo
          key={payload?.id}
          src={videoSrc}
          loop={loop}
          clipName={clipName}
          onEnded={onClipEnded}
          onAutoplayBlocked={onAutoplayBlocked}
          onPlaying={onPlaying}
          onDecodeError={onVideoDecodeError}
          preloadUrls={videoPreloadUrls}
        />
      ) : null}
      <StatusOverlay text={overlayText} />
      <VitalsBar vitals={vitals} />
      <ChatPanel
        open={chat.chatOpen && !aiSettingsOpen}
        petName={showName || payload?.id || '小宠'}
        aiMode={chat.lastMode}
        onSend={chat.handleChatSend}
        onAction={chat.handleChatAction}
        onClose={chat.closeChat}
        onOpenSettings={openAiSettings}
      />
      <AiSettingsPanel open={aiSettingsOpen} onClose={closeAiSettings} />
      <UpdateDialog />
    </PetStage>
  );
}

/**
 * 根组件：PetProvider 包裹 FSM + 舞台。
 */
export default function App() {
  return (
    <PetProvider>
      <PetApp />
    </PetProvider>
  );
}
