import {useEffect, useRef} from 'react';

const NO_DRAG_SEL =
  '.chat-panel, .ai-settings-panel, .update-dialog, input, textarea, button, a, [data-no-drag]';

/**
 * 无边框窗自定义拖动：左键在可拖区域按下并移动 → IPC 改窗口位置。
 * 替代 CSS -webkit-app-region:drag，避免 Windows 右键弹出系统菜单。
 */
export function useWindowDrag(): void {
  const draggingRef = useRef(false);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return;
      if (t.closest(NO_DRAG_SEL)) return;

      draggingRef.current = true;
      window.petAPI?.startWindowDrag?.(e.screenX, e.screenY);
      try {
        (e.target as Element)?.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      // 按住左键才拖
      if ((e.buttons & 1) === 0) {
        draggingRef.current = false;
        return;
      }
      window.petAPI?.moveWindowDrag?.(e.screenX, e.screenY);
    };

    const endDrag = () => {
      draggingRef.current = false;
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
