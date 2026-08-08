import {useEffect, useRef} from 'react';

const NO_DRAG_SEL =
  '.update-dialog, input, textarea, button, a, [data-no-drag]';

/** 超过该像素位移才算真正拖动（避免单击/双击误触发 grasp） */
const DRAG_THRESHOLD_PX = 4;

export interface UseWindowDragOptions {
  /** 进入拖动（超过阈值）时：播 grasp 等 */
  onDragStart?: () => void;
  /** 结束拖动时（曾真正拖过） */
  onDragEnd?: () => void;
}

/**
 * 无边框窗自定义拖动：左键在可拖区域按下并移动 → IPC 改窗口位置。
 * 真正拖动时回调 onDragStart/onDragEnd（用于 grasp 动画）。
 */
export function useWindowDrag(options: UseWindowDragOptions = {}): void {
  const draggingRef = useRef(false);
  /** 已超过阈值、进入真正拖动 */
  const activeDragRef = useRef(false);
  const startScreenRef = useRef({x: 0, y: 0});
  const onDragStartRef = useRef(options.onDragStart);
  const onDragEndRef = useRef(options.onDragEnd);
  onDragStartRef.current = options.onDragStart;
  onDragEndRef.current = options.onDragEnd;

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return;
      if (t.closest(NO_DRAG_SEL)) return;

      draggingRef.current = true;
      activeDragRef.current = false;
      startScreenRef.current = {x: e.screenX, y: e.screenY};
      window.petAPI?.startWindowDrag?.(e.screenX, e.screenY);
      try {
        (e.target as Element)?.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      if ((e.buttons & 1) === 0) {
        endDrag();
        return;
      }

      if (!activeDragRef.current) {
        const dx = e.screenX - startScreenRef.current.x;
        const dy = e.screenY - startScreenRef.current.y;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          return;
        }
        activeDragRef.current = true;
        try {
          onDragStartRef.current?.();
        } catch {
          /* ignore */
        }
      }

      window.petAPI?.moveWindowDrag?.(e.screenX, e.screenY);
    };

    const endDrag = () => {
      if (!draggingRef.current) return;
      const wasActive = activeDragRef.current;
      draggingRef.current = false;
      activeDragRef.current = false;
      window.petAPI?.endWindowDrag?.();
      if (wasActive) {
        try {
          onDragEndRef.current?.();
        } catch {
          /* ignore */
        }
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', endDrag, true);
    document.addEventListener('pointercancel', endDrag, true);
    window.addEventListener('blur', endDrag);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', endDrag, true);
      document.removeEventListener('pointercancel', endDrag, true);
      window.removeEventListener('blur', endDrag);
    };
  }, []);
}
