import {useEffect, useRef} from 'react';
import {info as logInfo, warn as logWarn} from '../utils/log';

export interface PetVideoProps {
  /** 当前 clip 的 pet-asset:// URL */
  src: string;
  /** 是否循环，默认 true */
  loop?: boolean;
  /** 当前 clip 名（用于日志） */
  clipName?: string;
  /** 非 loop 播放结束时回调 → FSM onClipEnded */
  onEnded?: () => void;
  /** autoplay 失败时回调（用于展示「点击播放」） */
  onAutoplayBlocked?: () => void;
  /** 成功开始播放时回调 */
  onPlaying?: () => void;
  /**
   * 解码 / 加载失败（WebM 透明或文件损坏等）
   * @param reason 简短中文原因
   */
  onDecodeError?: (reason: string) => void;
  /**
   * 可选：同宠其它 clip URL，用于空闲预加载（B-902）
   */
  preloadUrls?: string[];
}

/** 进程内已预热过的 URL，避免高频切换反复 createElement+load */
const warmedUrls = new Set<string>();

/** 预加载缓存上限（仅记录 URL 集合，不长期持有 video 元素） */
const WARM_CAP = 48;

/**
 * 用隐藏 video 触发浏览器缓存；同 URL 只 warm 一次
 */
function warmVideoUrl(url: string): void {
  if (!url || warmedUrls.has(url)) return;
  if (warmedUrls.size >= WARM_CAP) {
    // 简单 FIFO：清一半
    const half = Math.floor(WARM_CAP / 2);
    let i = 0;
    for (const u of warmedUrls) {
      warmedUrls.delete(u);
      i += 1;
      if (i >= half) break;
    }
  }
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.src = url;
    const cleanup = () => {
      v.removeAttribute('src');
      try {
        v.load();
      } catch {
        /* ignore */
      }
    };
    v.addEventListener('canplaythrough', () => {
      warmedUrls.add(url);
      cleanup();
    }, {once: true});
    v.addEventListener('error', () => {
      cleanup();
    }, {once: true});
    // 超时也标记，避免反复失败打爆
    window.setTimeout(() => {
      warmedUrls.add(url);
      cleanup();
    }, 8000);
    v.load();
  } catch {
    /* ignore */
  }
}

/**
 * 按 FSM clip 切换视频：src 变化时优先复用已 warm 缓存；ended → onEnded。
 * WebM 解码失败时 onDecodeError 提示（B-805）。
 */
export default function PetVideo({
  src,
  loop = true,
  clipName,
  onEnded,
  onAutoplayBlocked,
  onPlaying,
  onDecodeError,
  preloadUrls,
}: PetVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const appliedUrlRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onDecodeErrorRef = useRef(onDecodeError);
  onDecodeErrorRef.current = onDecodeError;

  // B-902：空闲预加载同宠其它 clip
  useEffect(() => {
    if (!preloadUrls?.length) return;
    const list = preloadUrls.filter((u) => u && u !== src).slice(0, 12);
    // 延后到下一帧，避免与当前 clip 抢带宽
    const t = window.setTimeout(() => {
      for (const u of list) warmVideoUrl(u);
    }, 400);
    return () => window.clearTimeout(t);
  }, [preloadUrls, src]);

  // 切换 clip：更新 src / loop 并播放
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const shouldReload = appliedUrlRef.current !== src;
    appliedUrlRef.current = src;

    video.loop = loop === true;
    video.muted = true;

    if (shouldReload) {
      // 已 warm 过仍设 src；浏览器可走磁盘/内存缓存，减少裸 load 成本
      video.src = src;
      video.load();
      warmVideoUrl(src);
      logInfo('[renderer] 切换 clip', clipName || src);
    } else {
      video.loop = loop === true;
    }

    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => onPlaying?.())
        .catch((err: unknown) => {
          logWarn('[renderer] autoplay 失败，等待用户交互', err);
          onAutoplayBlocked?.();
        });
    } else {
      onPlaying?.();
    }
  }, [src, loop, clipName, onAutoplayBlocked, onPlaying]);

  // ended：非 loop 时通知 FSM
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      if (video.loop) return;
      onEndedRef.current?.();
    };

    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [src]);

  // B-805：解码 / 加载错误
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleError = () => {
      const code = video.error?.code;
      const mediaMsg = video.error?.message || '';
      logWarn('[renderer] 视频解码/加载失败', clipName || src, code, mediaMsg);
      // MEDIA_ERR_DECODE=3, SRC_NOT_SUPPORTED=4
      let reason = '视频无法播放';
      if (code === 3) {
        reason = '视频解码失败（WebM/透明轨可能不兼容）';
      } else if (code === 4) {
        reason = '视频格式不受支持';
      } else if (code === 2) {
        reason = '视频网络错误';
      } else if (code === 1) {
        reason = '视频加载已中止';
      }
      onDecodeErrorRef.current?.(reason);
    };

    video.addEventListener('error', handleError);
    return () => video.removeEventListener('error', handleError);
  }, [src, clipName]);

  /** 点击舞台时重试播放（autoplay 策略兜底） */
  useEffect(() => {
    const onClick = () => {
      const video = videoRef.current;
      if (video?.paused && video.src) {
        video
          .play()
          .then(() => onPlaying?.())
          .catch(() => {
            /* 仍失败则保持提示 */
          });
      }
    };
    document.body.addEventListener('click', onClick);
    return () => document.body.removeEventListener('click', onClick);
  }, [onPlaying]);

  return (
    <video
      ref={videoRef}
      className="pet-video"
      autoPlay
      muted
      playsInline
      preload="auto"
      loop={loop === true}
    />
  );
}
