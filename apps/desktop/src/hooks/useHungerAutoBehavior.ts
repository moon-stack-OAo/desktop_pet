import {
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
    useEffect,
    useRef,
} from 'react';
import type {BehaviorFSM, FsmState} from '@pet/runtime';
import type {VitalStats} from './useVitals';
import {info as logInfo} from '../utils/log';

/** 饥饿阈值：≤ 此值自动进入 hungry */
export const HUNGER_AUTO_THRESHOLD = 20;
/** 饱食恢复：> 此值且当前为 hungry 时可回 idle */
export const HUNGER_RECOVER_THRESHOLD = 50;

/** 心情极低：≤ 此值且 idle 时自动 sick（不与 hungry 冲突） */
export const MOOD_SICK_THRESHOLD = 20;
/** 心情恢复：> 此值且因 mood 进入的 sick 可回 idle */
export const MOOD_RECOVER_THRESHOLD = 40;

export interface UseHungerAutoBehaviorOptions {
    vitals: VitalStats | null;
    fsmState: FsmState | null;
    fsmRef: MutableRefObject<BehaviorFSM | null>;
    setFsmState: Dispatch<SetStateAction<FsmState | null>>;
    /** 进入 hungry 时短提示（可选） */
    onEnterHungry?: () => void;
}

/**
 * vitals → 自动行为：
 * - hunger≤20 且 idle → hungry（优先于 mood sick）
 * - hunger>50 且 hungry → idle
 * - mood≤20 且 idle 且非饥饿态 → sick（reason auto:mood）
 * - mood>40 且因 mood 进入的 sick → idle
 */
export function useHungerAutoBehavior({
                                          vitals,
                                          fsmState,
                                          fsmRef,
                                          setFsmState,
                                          onEnterHungry,
                                      }: UseHungerAutoBehaviorOptions): void {
    /** 是否因 mood 自动进入 sick（恢复时只清这类 sick） */
    const sickFromMoodRef = useRef(false);
    const onEnterHungryRef = useRef(onEnterHungry);
    onEnterHungryRef.current = onEnterHungry;

    useEffect(() => {
        if (!vitals || !fsmState) return;
        const fsm = fsmRef.current;
        if (!fsm) return;

        const behavior = fsmState.behavior;

        // ── 饥饿优先 ──────────────────────────────────
        if (
            vitals.hunger <= HUNGER_AUTO_THRESHOLD &&
            behavior === 'idle'
        ) {
            const ok = fsm.request('hungry', 'auto:hunger');
            if (ok) {
                sickFromMoodRef.current = false;
                setFsmState(fsm.getState());
                onEnterHungryRef.current?.();
                logInfo('[vitals] 自动 hungry，hunger=', vitals.hunger);
            }
            return;
        }

        if (
            vitals.hunger > HUNGER_RECOVER_THRESHOLD &&
            behavior === 'hungry'
        ) {
            const ok = fsm.request('idle', 'auto:hunger-recover');
            if (ok) {
                setFsmState(fsm.getState());
                logInfo('[vitals] 饱食回 idle，hunger=', vitals.hunger);
            }
            return;
        }

        // 已在 hungry 时不抢 mood sick
        if (behavior === 'hungry') {
            return;
        }

        // ── 心情极低 → sick ───────────────────────────
        if (
            vitals.mood <= MOOD_SICK_THRESHOLD &&
            behavior === 'idle' &&
            vitals.hunger > HUNGER_AUTO_THRESHOLD
        ) {
            const ok = fsm.request('sick', 'auto:mood');
            if (ok) {
                sickFromMoodRef.current = true;
                setFsmState(fsm.getState());
                logInfo('[vitals] 自动 sick（mood），mood=', vitals.mood);
            }
            return;
        }

        // 心情恢复：仅清因 mood 进入的 sick
        if (
            vitals.mood > MOOD_RECOVER_THRESHOLD &&
            behavior === 'sick' &&
            sickFromMoodRef.current
        ) {
            const ok = fsm.request('idle', 'auto:mood-recover');
            if (ok) {
                sickFromMoodRef.current = false;
                setFsmState(fsm.getState());
                logInfo('[vitals] mood 恢复回 idle，mood=', vitals.mood);
            }
        }

        // 非 mood 来源的 sick 离开后重置标记
        if (behavior !== 'sick' && sickFromMoodRef.current) {
            sickFromMoodRef.current = false;
        }
    }, [vitals, fsmState, fsmRef, setFsmState]);
}
