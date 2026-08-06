import type {BehaviorFSM} from './behavior-fsm.js';
import type {AutoScheduler, AutoSchedulerOptions} from './types.js';

/**
 * 自主行为定时器：在 minMs~maxMs 随机间隔 request 候选行为。
 * 仅当 FSM 当前为 idle（default）且可被 auto 打断时才会触发。
 *
 * 依赖 BehaviorFSM 的 loop 超时回 idle，否则 walk(loop) 切入后将永不 idle。
 */
export function createAutoScheduler(
  fsm: BehaviorFSM,
  options: AutoSchedulerOptions = {},
): AutoScheduler {
  const minMs = options.minMs ?? 8_000;
  const maxMs = Math.max(minMs, options.maxMs ?? 20_000);
  const behaviors = options.behaviors?.length ? options.behaviors : ['walk'];
  const random = options.random ?? Math.random;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const nextDelay = (): number => {
    const span = maxMs - minMs;
    if (span <= 0) return minMs;
    return minMs + Math.floor(random() * (span + 1));
  };

  const pickBehavior = (): string => {
    if (behaviors.length === 1) return behaviors[0]!;
    const idx = Math.floor(random() * behaviors.length);
    return behaviors[Math.min(idx, behaviors.length - 1)]!;
  };

  const tick = (): void => {
    if (!running) return;

    const state = fsm.getState();
    // 仅在 idle 时尝试自主行为，避免打断用户/AI 动画
    if (state.behavior === 'idle' && fsm.canInterrupt('auto')) {
      const behavior = pickBehavior();
      fsm.request(behavior, 'auto');
    }

    timer = setTimeout(tick, nextDelay());
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      timer = setTimeout(tick, nextDelay());
    },
    stop(): void {
      running = false;
      clear();
    },
    isRunning(): boolean {
      return running;
    },
  };
}
