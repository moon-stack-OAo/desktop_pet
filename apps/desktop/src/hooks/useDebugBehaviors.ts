import { useEffect } from 'react';
import type { FsmState } from '@pet/runtime';
import { debug as logDebug } from '../utils/log';

/**
 * 键盘调试：数字键触发行为（验证 FSM / 多 clip）
 * 1 idle · 2 walk · 3 happy · 4 eat · 5 play · 6 sleep · 7 hungry
 */
export const KEY_BEHAVIORS: Record<string, string> = {
  '1': 'idle',
  '2': 'walk',
  '3': 'happy',
  '4': 'eat',
  '5': 'play',
  '6': 'sleep',
  '7': 'hungry',
};

export interface UseDebugBehaviorsOptions {
  chatOpen: boolean;
  feed: () => boolean;
  pat: () => boolean;
  playWith: () => boolean;
  request: (behavior: string, reason?: string) => boolean;
  state: FsmState | null;
}

/**
 * 数字键调试行为；聊天打开时跳过；eat/happy/play 同步 vitals。
 */
export function useDebugBehaviors({
  chatOpen,
  feed,
  pat,
  playWith,
  request,
  state,
}: UseDebugBehaviorsOptions): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (chatOpen) return;
      const behavior = KEY_BEHAVIORS[e.key];
      if (!behavior) return;
      e.preventDefault();
      let ok = false;
      if (behavior === 'eat') ok = feed();
      else if (behavior === 'happy') ok = pat();
      else if (behavior === 'play') ok = playWith();
      else ok = request(behavior);
      logDebug(
        `[debug] request(${behavior}) →`,
        ok,
        'state=',
        state?.behavior,
        state?.clip,
      );
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chatOpen, feed, pat, playWith, request, state]);
}
