import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
} from 'react';
import type { BehaviorFSM, FsmState } from '@pet/runtime';
import type { VitalStats } from './useVitals';
import { info as logInfo } from '../utils/log';

/** 饥饿阈值：≤ 此值自动进入 hungry */
export const HUNGER_AUTO_THRESHOLD = 20;
/** 饱食恢复：> 此值且当前为 hungry 时可回 idle */
export const HUNGER_RECOVER_THRESHOLD = 50;

export interface UseHungerAutoBehaviorOptions {
  vitals: VitalStats | null;
  fsmState: FsmState | null;
  fsmRef: MutableRefObject<BehaviorFSM | null>;
  setFsmState: Dispatch<SetStateAction<FsmState | null>>;
}

/**
 * vitals → 自动行为：hunger≤20 且 idle → hungry；hunger>50 且 hungry → idle。
 */
export function useHungerAutoBehavior({
  vitals,
  fsmState,
  fsmRef,
  setFsmState,
}: UseHungerAutoBehaviorOptions): void {
  useEffect(() => {
    if (!vitals || !fsmState) return;
    const fsm = fsmRef.current;
    if (!fsm) return;

    if (
      vitals.hunger <= HUNGER_AUTO_THRESHOLD &&
      fsmState.behavior === 'idle'
    ) {
      const ok = fsm.request('hungry', 'auto:hunger');
      if (ok) {
        setFsmState(fsm.getState());
        logInfo('[vitals] 自动 hungry，hunger=', vitals.hunger);
      }
      return;
    }

    if (
      vitals.hunger > HUNGER_RECOVER_THRESHOLD &&
      fsmState.behavior === 'hungry'
    ) {
      const ok = fsm.request('idle', 'auto:hunger-recover');
      if (ok) {
        setFsmState(fsm.getState());
        logInfo('[vitals] 饱食回 idle，hunger=', vitals.hunger);
      }
    }
  }, [vitals, fsmState, fsmRef, setFsmState]);
}
