import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from 'react';
import type {BehaviorFSM, FsmState} from '@pet/runtime';
import {info as logInfo} from '../utils/log';

/** 采样间隔 ms */
export const SYSTEM_LOAD_POLL_MS = 5_000;
/** CPU ≥ 此值触发 work（百分比） */
export const CPU_WORK_THRESHOLD = 70;
/** 内存 ≥ 此值触发 work（百分比） */
export const MEMORY_WORK_THRESHOLD = 85;
/** 低于此值且当前为系统触发的 work 时回 idle */
export const LOAD_RECOVER_THRESHOLD = 55;
/** 进入 work 后最短保持时间，避免抖动 */
export const WORK_MIN_HOLD_MS = 12_000;
/** 退出后冷却，避免刚 idle 又立刻 work */
export const WORK_COOLDOWN_MS = 30_000;

export interface UseSystemLoadWorkOptions {
  fsmRef: MutableRefObject<BehaviorFSM | null>;
  setFsmState: Dispatch<SetStateAction<FsmState | null>>;
  /** 当前宠物是否具备 work clip */
  enabled: boolean;
  onEnterWork?: (load: {cpu: number; memory: number}) => void;
}

/**
 * 系统 CPU/内存过高 → 自动 playClip('work')（咕嘎加班）。
 * 仅在 idle 时切入；不打断用户拖动 grasp / 喂食等。
 * 负载回落且保持足够时长后回 idle。
 */
export function useSystemLoadWork({
  fsmRef,
  setFsmState,
  enabled,
  onEnterWork,
}: UseSystemLoadWorkOptions): void {
  const fromSystemRef = useRef(false);
  const enteredAtRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const onEnterWorkRef = useRef(onEnterWork);
  onEnterWorkRef.current = onEnterWork;

  useEffect(() => {
    if (!enabled) {
      fromSystemRef.current = false;
      return;
    }
    if (!window.petAPI?.getSystemLoad) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const load = await window.petAPI!.getSystemLoad!();
        if (cancelled) return;
        const fsm = fsmRef.current;
        const state = fsm?.getState();
        if (!fsm || !state) {
          schedule();
          return;
        }

        const now = Date.now();
        const behavior = state.behavior;
        const clip = state.clip;
        const high =
          (load.ready && load.cpu >= CPU_WORK_THRESHOLD) ||
          load.memory >= MEMORY_WORK_THRESHOLD;
        const low =
          (!load.ready || load.cpu < LOAD_RECOVER_THRESHOLD) &&
          load.memory < LOAD_RECOVER_THRESHOLD;

        // 已离开 work：清标记
        if (fromSystemRef.current && behavior !== 'work' && clip !== 'work') {
          fromSystemRef.current = false;
        }

        if (
          high &&
          behavior === 'idle' &&
          now >= cooldownUntilRef.current
        ) {
          // 优先 playClip work；无 work 则 request hunt（池内可含 work）
          let ok = fsm.playClip('work', 'auto:system-load');
          if (!ok) {
            ok = fsm.request('hunt', 'auto:system-load');
          }
          if (ok) {
            fromSystemRef.current = true;
            enteredAtRef.current = now;
            setFsmState(fsm.getState());
            onEnterWorkRef.current?.({
              cpu: load.cpu,
              memory: load.memory,
            });
            logInfo(
              '[system] 负载偏高 → work',
              `cpu=${load.cpu}% mem=${load.memory}% ready=${load.ready}`,
            );
          }
        } else if (
          fromSystemRef.current &&
          (behavior === 'work' || clip === 'work') &&
          low &&
          now - enteredAtRef.current >= WORK_MIN_HOLD_MS
        ) {
          const ok = fsm.request('idle', 'auto:system-load-recover');
          if (ok) {
            fromSystemRef.current = false;
            cooldownUntilRef.current = now + WORK_COOLDOWN_MS;
            setFsmState(fsm.getState());
            logInfo(
              '[system] 负载回落 → idle',
              `cpu=${load.cpu}% mem=${load.memory}%`,
            );
          }
        }
      } catch {
        /* ignore */
      }
      schedule();
    };

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void tick();
      }, SYSTEM_LOAD_POLL_MS);
    };

    // 立即采一次（可能 ready=false），再进入周期
    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [enabled, fsmRef, setFsmState]);
}
