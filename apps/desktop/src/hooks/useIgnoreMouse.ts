import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface UseIgnoreMouseOptions {
  /** 短时状态提示（开启穿透时） */
  setStatus?: Dispatch<SetStateAction<string>>;
}

export interface UseIgnoreMouseResult {
  ignoreMouse: boolean;
  setIgnoreMouse: Dispatch<SetStateAction<boolean>>;
  /** 切换穿透并同步主进程；开启时短时提示 */
  toggleIgnoreMouse: () => void;
}

const THROUGH_HINT = '点击穿透已开 · 托盘可关';
const THROUGH_HINT_MS = 2_000;

/**
 * 点击穿透：初始值 + 托盘同步 + 右键切换。
 */
export function useIgnoreMouse(
  options: UseIgnoreMouseOptions = {},
): UseIgnoreMouseResult {
  const { setStatus } = options;
  const [ignoreMouse, setIgnoreMouse] = useState(false);
  const ignoreMouseRef = useRef(ignoreMouse);
  ignoreMouseRef.current = ignoreMouse;

  useEffect(() => {
    let cancelled = false;
    void window.petAPI?.getIgnoreMouse?.().then((v) => {
      if (!cancelled) setIgnoreMouse(!!v);
    });
    const unsub = window.petAPI?.onIgnoreMouseChanged?.((v) => {
      setIgnoreMouse(!!v);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const toggleIgnoreMouse = useCallback(() => {
    const next = !ignoreMouseRef.current;
    setIgnoreMouse(next);
    window.petAPI?.setIgnoreMouse?.(next);
    if (!setStatus) return;
    if (next) {
      setStatus(THROUGH_HINT);
      window.setTimeout(() => {
        setStatus((s) => (s === THROUGH_HINT ? '' : s));
      }, THROUGH_HINT_MS);
    } else {
      setStatus('');
    }
  }, [setStatus]);

  return { ignoreMouse, setIgnoreMouse, toggleIgnoreMouse };
}
