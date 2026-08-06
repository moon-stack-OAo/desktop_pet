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
    v.defaultMuted = true;
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
    v.addEventListener(
      'canplaythrough',
      () => {
        warmedUrls.add(url);
        cleanup();
      },
      {once: true},
    );
    v.addEventListener(
      'error',
      () => {
        cleanup();
      },
      {once: true},
    );
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
 * 强制静音属性（Chromium autoplay 策略要求 muted + 属性位）
 */
function forceMute(video: HTMLVideoElement): void {
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
}

/**
 * 尽量播放；失败时仍 seek 到首帧，避免透明 WebM 暂停时完全看不见
 */
async function tryPlay(
  video: HTMLVideoElement,
  onPlaying?: () => void,
  onAutoplayBlocked?: () => void,
): Promise<void> {
  forceMute(video);
  try {
    await video.play();
    onPlaying?.();
    return;
  } catch (err) {
    logWarn('[renderer] autoplay 失败，尝试首帧兜底', err);
  }

  // 首帧兜底：透明窗暂停时若无画面会像「没有宠物」
  try {
    if (video.readyState >= 1) {
      video.currentTime = 0;
    } else {
      await new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener('loadeddata', done);
          resolve();
        };
        video.addEventListener('loadeddata', done, {once: true});
        window.setTimeout(done, 1500);
      });
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  // 再试一次 play（部分环境 loadeddata 后可过）
  forceMute(video);
  try {
    await video.play();
    onPlaying?.();
    return;
  } catch {
    onAutoplayBlocked?.();
  }
}

/**
 * 按 FSM clip 切换视频：src 变化时优先复用已 warm 缓存；ended → onEnded。
 * WebM 解码失败时 onDecodeError 提示（B-805）。
 * 打包后 autoplay 常被拦截：强制 muted + 首帧兜底，避免空白透明窗。
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
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  onAutoplayBlockedRef.current = onAutoplayBlocked;

  // B-902：空闲预加载同宠其它 clip
  useEffect(() => {
    if (!preloadUrls?.length) return;
    const list = preloadUrls.filter((u) => u && u !== src).slice(0, 12);
    const t = window.setTimeout(() => {
      for (const u of list) warmVideoUrl(u);
    }, 400);
    return () => window.clearTimeout(t);
  }, [preloadUrls, src]);

  // 切换 clip：更新 src / loop 并播放
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let cancelled = false;
    const shouldReload = appliedUrlRef.current !== src;
    appliedUrlRef.current = src;

    forceMute(video);
    video.loop = loop === true;

    const runPlay = () => {
      if (cancelled) return;
      void tryPlay(
        video,
        () => {
          if (!cancelled) onPlayingRef.current?.();
        },
        () => {
          if (!cancelled) onAutoplayBlockedRef.current?.();
        },
      );
    };

    if (shouldReload) {
      video.src = src;
      video.load();
      warmVideoUrl(src);
      logInfo('[renderer] 切换 clip', clipName || src);
      // 等有数据再 play，降低 NotAllowed / 空 play 失败
      const onReady = () => {
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('loadeddata', onReady);
        runPlay();
      };
      video.addEventListener('canplay', onReady, {once: true});
      video.addEventListener('loadeddata', onReady, {once: true});
      // 超时仍尝试（慢盘 / 大 webm）
      const timer = window.setTimeout(runPlay, 1200);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('loadeddata', onReady);
      };
    }

    runPlay();
    return () => {
      cancelled = true;
    };
  }, [src, loop, clipName]);

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

  /** 任意用户手势重试播放（含右键菜单打开前的点击） */
  useEffect(() => {
    const retry = () => {
      const video = videoRef.current;
      if (!video?.src) return;
      if (!video.paused && !video.ended) return;
      forceMute(video);
      void video
        .play()
        .then(() => onPlayingRef.current?.())
        .catch(() => {
          /* 仍失败则保持「点击播放」提示 */
        });
    };
    // 捕获阶段：穿透到 body 的 pointer 事件也能触发
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
    return () => {
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
    };
  }, []);

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
