import type {BehaviorFSM} from './behavior-fsm.js';
import {
  DEFAULT_AUTO_BEHAVIORS,
  type AutoBehaviorCandidate,
  type AutoScheduler,
  type AutoSchedulerOptions,
} from './types.js';

/** 规范化候选：string → 等权无冷却；缺省 weight=1、cooldownMs=0 */
function normalizeCandidates(
  raw: AutoSchedulerOptions['behaviors'],
): AutoBehaviorCandidate[] {
  if (!raw?.length) {
    return DEFAULT_AUTO_BEHAVIORS.map((c) => ({...c}));
  }
  return raw.map((item) => {
    if (typeof item === 'string') {
      return {name: item, weight: 1, cooldownMs: 0};
    }
    const name = String(item.name || '').trim();
    const weight =
      typeof item.weight === 'number' && item.weight > 0 ? item.weight : 1;
    const cooldownMs =
      typeof item.cooldownMs === 'number' && item.cooldownMs > 0
        ? item.cooldownMs
        : 0;
    return {name, weight, cooldownMs};
  }).filter((c) => c.name.length > 0);
}

/**
 * 自主行为定时器：在 minMs~maxMs 随机间隔 request 候选行为。
 * 仅当 FSM 当前为 idle（default）且可被 auto 打断时才会触发。
 *
 * 支持权重选取 + 每行为冷却，避免只 walk 或狂切。
 * 依赖 BehaviorFSM 的 loop 超时回 idle，否则 walk(loop) 切入后将永不 idle。
 */
export function createAutoScheduler(
  fsm: BehaviorFSM,
  options: AutoSchedulerOptions = {},
): AutoScheduler {
  const minMs = options.minMs ?? options.minIntervalMs ?? 8_000;
  const maxMs = Math.max(
    minMs,
    options.maxMs ?? options.maxIntervalMs ?? 20_000,
  );
  const candidates = normalizeCandidates(options.behaviors);
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;

  /** 行为名 → 冷却结束时间戳 */
  const cooldownUntil = new Map<string, number>();

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

  /**
   * 按权重从「未在冷却中」的候选中选取；全冷却则回退到全部候选。
   */
  const pickBehavior = (): string | null => {
    if (candidates.length === 0) return null;
    const t = now();
    const ready = candidates.filter((c) => {
      const until = cooldownUntil.get(c.name) ?? 0;
      return t >= until;
    });
    const pool = ready.length > 0 ? ready : candidates;
    if (pool.length === 1) return pool[0]!.name;

    let total = 0;
    for (const c of pool) total += c.weight ?? 1;
    if (total <= 0) return pool[0]!.name;

    let r = random() * total;
    for (const c of pool) {
      r -= c.weight ?? 1;
      if (r <= 0) return c.name;
    }
    return pool[pool.length - 1]!.name;
  };

  const markCooldown = (name: string): void => {
    const c = candidates.find((x) => x.name === name);
    const ms = c?.cooldownMs ?? 0;
    if (ms > 0) {
      cooldownUntil.set(name, now() + ms);
    }
  };

  const tick = (): void => {
    if (!running) return;

    const state = fsm.getState();
    // 仅在 idle 时尝试自主行为，避免打断用户/AI 动画
    if (state.behavior === 'idle' && fsm.canInterrupt('auto')) {
      const behavior = pickBehavior();
      if (behavior) {
        const ok = fsm.request(behavior, 'auto');
        if (ok) markCooldown(behavior);
      }
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
