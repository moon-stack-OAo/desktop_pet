import { useEffect, useRef } from 'react';
import type { VitalStats } from './useVitals';

export interface UseContextQuitOptions {
  /** 生命值：右键菜单顶部状态行 */
  vitals?: VitalStats | null;
  /** 静音：右键菜单静音项文案 */
  muted?: boolean;
}

/**
 * 右键：主进程原生 Menu.popup；Esc：退出。
 */
export function useContextQuit(options: UseContextQuitOptions = {}): void {
  const { vitals = null, muted = false } = options;

  const vitalsRef = useRef(vitals);
  const mutedRef = useRef(muted);
  vitalsRef.current = vitals;
  mutedRef.current = muted;

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      // 必须拦截系统/Chromium 默认菜单（无边框窗上尤其容易冒出原生项）
      e.preventDefault();
      e.stopPropagation();
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, .update-dialog')) {
        return;
      }
      const v = vitalsRef.current;
      const h = v ? Math.round(v.hunger) : '—';
      const m = v ? Math.round(v.mood) : '—';
      window.petAPI?.popupContextMenu?.({
        x: e.clientX,
        y: e.clientY,
        vitalsLabel: `状态：饱食 ${h} / 心情 ${m}`,
        muted: mutedRef.current,
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      window.petAPI?.quit();
    };

    // 捕获阶段优先于默认行为
    document.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
