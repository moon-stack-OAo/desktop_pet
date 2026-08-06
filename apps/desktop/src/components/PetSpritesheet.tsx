import {useEffect, useMemo, useRef, useState} from 'react';
import {error as logError} from '../utils/log';

/**
 * 精灵表帧定位约定（与 pets/SPRITESHEET_TEMPLATE.md 对齐）
 *
 * 网格按 **行优先（row-major）** 排列：从左到右、从上到下。
 * 帧像素原点始终用线性索引计算：
 *   linear = base + frameIndex
 *   sx = (linear % columns) * frameWidth
 *   sy = floor(linear / columns) * frameHeight
 *
 * base 的解析（二选一，优先 row）：
 * 1. **行模式** — 配置了 `row`（number）：
 *      base = row * columns + (start ?? column ?? 0)
 *    - `start` / `column` 表示该行起始列（默认 0）
 *    - 例：`{ "row": 1, "frames": 4 }` → 第 1 行连续 4 帧
 * 2. **线性模式** — 未配置 `row`：
 *      base = start ?? 0
 *    - 例：`{ "start": 8, "frames": 4 }` → 全局第 8 帧起连续 4 帧
 *
 * `columns`：优先 props/配置；否则 `floor(naturalWidth / frameWidth)`（至少 1）。
 * 占位 idle `{ row: 0, frames: 1 }` 仍走单帧静态路径（不切 canvas）。
 */

/** 单条动画定义（与 pet.json / 主进程 payload 对齐） */
export interface SpritesheetAnimDef {
  row?: number;
  start?: number;
  frames?: number;
  loop?: boolean;
  fps?: number;
  column?: number;
  [key: string]: unknown;
}

export interface PetSpritesheetProps {
  /** 精灵表图片 pet-asset:// URL */
  src: string;
  /** 帧宽 */
  frameWidth: number;
  /** 帧高 */
  frameHeight: number;
  /** 当前动画名（对应 animations key / FSM clip） */
  animationName?: string;
  /** 全部动画 */
  animations?: Record<string, SpritesheetAnimDef>;
  /** 表级默认 fps */
  defaultFps?: number;
  /** 列数（可选；线性索引与 row→base 换算用） */
  columns?: number;
  /** 非 loop 动画播完时回调 → FSM onClipEnded */
  onEnded?: () => void;
  /** 图片加载成功 */
  onReady?: () => void;
  /** 图片加载失败 */
  onError?: () => void;
}

/** 解析动画在精灵表上的起始线性帧索引（行优先） */
export function resolveAnimBaseIndex(
  anim: SpritesheetAnimDef,
  cols: number,
): number {
  const safeCols = Math.max(1, cols);
  if (typeof anim.row === 'number') {
    const col0 =
      typeof anim.start === 'number'
        ? anim.start
        : typeof anim.column === 'number'
          ? anim.column
          : 0;
    return anim.row * safeCols + col0;
  }
  return typeof anim.start === 'number' ? anim.start : 0;
}

/** 线性帧索引 → 源矩形左上角（行优先） */
export function frameSourceOrigin(
  linearIndex: number,
  frameWidth: number,
  frameHeight: number,
  cols: number,
): {sx: number; sy: number} {
  const safeCols = Math.max(1, cols);
  return {
    sx: (linearIndex % safeCols) * frameWidth,
    sy: Math.floor(linearIndex / safeCols) * frameHeight,
  };
}

/**
 * 页面 / 文档是否视为「可见」（B-901：hidden 时停 rAF）
 */
function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

/**
 * 精灵表渲染：单帧整图浮动 / 多帧 canvas 切片动画。
 */
export default function PetSpritesheet({
  src,
  frameWidth,
  frameHeight,
  animationName = 'idle',
  animations,
  defaultFps = 8,
  columns,
  onEnded,
  onReady,
  onError,
}: PetSpritesheetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const [pageVisible, setPageVisible] = useState(isDocumentVisible);

  const anim = useMemo((): SpritesheetAnimDef => {
    const fromMap = animations?.[animationName] ?? animations?.idle;
    if (fromMap) return fromMap;
    return {row: 0, frames: 1, loop: true, fps: defaultFps};
  }, [animations, animationName, defaultFps]);

  const frameCount = Math.max(1, typeof anim.frames === 'number' ? anim.frames : 1);
  const isStatic = frameCount <= 1;

  // B-901：document.hidden / visibilitychange 时停 rAF
  useEffect(() => {
    const onVis = () => setPageVisible(isDocumentVisible());
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 加载图片
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      onReady?.();
    };
    img.onerror = () => {
      if (cancelled) return;
      imgRef.current = null;
      logError('[renderer] 精灵表加载失败', src);
      onError?.();
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, onReady, onError]);

  // 多帧：canvas + rAF 切片；不可见时不跑 rAF
  useEffect(() => {
    if (isStatic) return;
    if (!pageVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const fw = frameWidth > 0 ? frameWidth : 128;
    const fh = frameHeight > 0 ? frameHeight : 128;
    canvas.width = fw;
    canvas.height = fh;

    const fps =
      typeof anim.fps === 'number' && anim.fps > 0 ? anim.fps : defaultFps;
    const frameDuration = 1000 / fps;
    const loop = anim.loop !== false;

    const getCols = (img: HTMLImageElement) => {
      if (typeof columns === 'number' && columns > 0) return columns;
      return Math.max(1, Math.floor(img.naturalWidth / fw) || 1);
    };

    let frameIndex = 0;
    let lastTs = 0;
    let rafId = 0;
    let ended = false;

    const draw = (img: HTMLImageElement, index: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cols = getCols(img);
      const linear = resolveAnimBaseIndex(anim, cols) + index;
      const {sx, sy} = frameSourceOrigin(linear, fw, fh, cols);
      ctx.clearRect(0, 0, fw, fh);
      ctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
    };

    const tick = (ts: number) => {
      if (!isDocumentVisible()) {
        // 竞态：visibility 已变但 effect 尚未 teardown
        return;
      }
      const img = imgRef.current;
      if (!img || !img.complete || img.naturalWidth === 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (!lastTs) lastTs = ts;
      const elapsed = ts - lastTs;
      if (elapsed >= frameDuration) {
        const steps = Math.floor(elapsed / frameDuration);
        lastTs += steps * frameDuration;
        frameIndex += steps;
        if (frameIndex >= frameCount) {
          if (loop) {
            frameIndex = frameIndex % frameCount;
          } else {
            frameIndex = frameCount - 1;
            draw(img, frameIndex);
            if (!ended) {
              ended = true;
              onEndedRef.current?.();
            }
            return;
          }
        }
        draw(img, frameIndex);
      } else if (frameIndex === 0 && lastTs === ts) {
        draw(img, 0);
      }
      rafId = requestAnimationFrame(tick);
    };

    // 图片可能已缓存
    if (imgRef.current?.complete) {
      draw(imgRef.current, 0);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    isStatic,
    pageVisible,
    src,
    frameWidth,
    frameHeight,
    frameCount,
    anim,
    defaultFps,
    columns,
    animationName,
  ]);

  if (isStatic) {
    // 单帧：整图 contain + 轻微上下浮动
    return (
      <div className="pet-spritesheet pet-spritesheet--static" aria-hidden>
        <img
          className="pet-spritesheet-img"
          src={src}
          alt=""
          draggable={false}
          onLoad={() => onReady?.()}
          onError={() => onError?.()}
        />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="pet-spritesheet pet-spritesheet--canvas"
      aria-hidden
    />
  );
}
