import {
    type BehaviorFSMOptions,
    type ClipMeta,
    DEFAULT_SUSTAINED_BEHAVIORS,
    defaultSchedule,
    type FsmChangeMeta,
    type FsmState,
    inferPriority,
    type InterruptPriority,
    type PetState,
    PRIORITY_RANK,
    type ScheduleFn,
} from './types.js';

/**
 * desktop_pet 行为状态机（纯逻辑，无 DOM/Electron 依赖）
 *
 * 规则摘要：
 * 1. request(behavior)：从 behaviorMap 选存在于 clips 的候选；map 无则同名 clip 直播
 * 2. loop=false 的 clip 结束后 onClipEnded → 回到 defaultBehavior(idle)
 * 3. loop=true 且非 default、非 sustained：在 loopMinMs~loopMaxMs 超时后自动回 idle
 *    （修复 walk/dance 等永久卡住；hungry/sleep 等 sustained 不超时）
 * 4. 占位映射：若 behavior≠default 且唯一解析 clip 就是 default 的 loop clip，
 *    则记为 default（避免 spritesheet walk→idle 假离开 idle 导致调度停摆）
 * 5. 相同 behavior 默认允许重入换 clip（sameBehaviorPolicy=reenter）
 * 6. 优先级 user > ai > auto；低优先级不可打断高优先级占用
 */
export class BehaviorFSM {
  private readonly behaviorMap: Record<string, string[]>;
  private readonly clips: Record<string, ClipMeta>;
  private readonly defaultBehavior: string;
  private readonly onChange?: BehaviorFSMOptions['onChange'];
  private readonly sameBehaviorPolicy: 'reenter' | 'ignore';
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly loopMinMs: number;
  private readonly loopMaxMs: number;
  private readonly sustained: ReadonlySet<string>;
  private readonly schedule: ScheduleFn;

  private state: PetState;
  /** 取消当前 loop 超时定时器 */
  private cancelLoopTimer: (() => void) | null = null;

  constructor(options: BehaviorFSMOptions) {
    this.behaviorMap = options.behaviorMap ?? {};
    this.clips = options.clips ?? {};
    this.defaultBehavior = options.defaultBehavior ?? 'idle';
    this.onChange = options.onChange;
    this.sameBehaviorPolicy = options.sameBehaviorPolicy ?? 'reenter';
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.loopMinMs = Math.max(0, options.loopMinMs ?? 5_000);
    this.loopMaxMs = Math.max(this.loopMinMs, options.loopMaxMs ?? 12_000);
    this.sustained = new Set(
      options.sustainedBehaviors ?? DEFAULT_SUSTAINED_BEHAVIORS,
    );
    this.schedule = options.schedule ?? defaultSchedule;

    const initial = this.resolveEnter(this.defaultBehavior);
    const clip = initial?.clip ?? this.pickFallbackClip();
    const loop = this.isLoop(clip);

    this.state = {
      behavior: initial?.behavior ?? this.defaultBehavior,
      clip,
      since: this.now(),
      priority: 'auto',
      loop,
    };
    // 初始 idle 不设 loop 超时
  }

  /** 当前状态快照（不含内部 priority/loop 字段的公开形态） */
  getState(): FsmState {
    return {
      behavior: this.state.behavior,
      clip: this.state.clip,
      since: this.state.since,
    };
  }

  /** 内部完整状态（含 priority/loop，供调试/测试） */
  getPetState(): PetState {
    return { ...this.state };
  }

  /**
   * 请求进入某逻辑行为。
   * @returns 是否成功切换（含重入换 clip）
   */
  request(behavior: string, reason?: string): boolean {
    const priority = inferPriority(reason);
    if (!this.canInterrupt(priority)) {
      return false;
    }

    if (
      this.sameBehaviorPolicy === 'ignore' &&
      behavior === this.state.behavior &&
      PRIORITY_RANK[priority] <= PRIORITY_RANK[this.state.priority]
    ) {
      return false;
    }

    const resolved = this.resolveEnter(behavior);
    if (!resolved) {
      return false;
    }

    this.apply(
      resolved.behavior,
      resolved.clip,
      priority,
      reason ?? `request:${behavior}`,
    );
    return true;
  }

  /**
   * 直接播放指定 clip（须存在于 clips）。
   * behavior 记为 clip 名本身（再经占位折叠）。
   */
  playClip(clip: string, reason?: string): boolean {
    if (!this.hasClip(clip)) {
      return false;
    }
    const priority = inferPriority(reason);
    if (!this.canInterrupt(priority)) {
      return false;
    }
    const folded = this.foldPlaceholder(clip, clip);
    this.apply(
      folded.behavior,
      folded.clip,
      priority,
      reason ?? `playClip:${clip}`,
    );
    return true;
  }

  /**
   * 非 loop clip 播放结束时由渲染层调用。
   * loop clip 调用则忽略（loop 靠超时回 idle）；结束后回到 defaultBehavior。
   */
  onClipEnded(): void {
    if (this.state.loop) {
      return;
    }
    this.returnToDefault('clip-ended');
  }

  /**
   * 强制取消 loop 超时定时器（切宠 / 卸载时调用）。
   * 不改变当前 state。
   */
  dispose(): void {
    this.clearLoopTimer();
  }

  /**
   * 给定优先级是否可打断当前状态。
   * - 当前为 default(idle) 时任意来源可切入
   * - 否则需 ≥ 当前持有优先级
   */
  canInterrupt(priority: InterruptPriority): boolean {
    if (this.state.behavior === this.defaultBehavior) {
      return true;
    }
    return PRIORITY_RANK[priority] >= PRIORITY_RANK[this.state.priority];
  }

  // ── 内部 ──────────────────────────────────────────

  private apply(
    behavior: string,
    clip: string,
    priority: InterruptPriority,
    reason: string,
  ): void {
    const previous = this.getState();
    const loop = this.isLoop(clip);
    this.clearLoopTimer();
    this.state = {
      behavior,
      clip,
      since: this.now(),
      priority,
      loop,
    };
    const meta: FsmChangeMeta = {
      reason,
      previous,
      priority,
    };
    this.onChange?.(this.getState(), meta);
    this.armLoopTimeoutIfNeeded();
  }

  private returnToDefault(reason: string): void {
    const resolved = this.resolveEnter(this.defaultBehavior);
    const clip = resolved?.clip ?? this.pickFallbackClip();
    const behavior = resolved?.behavior ?? this.defaultBehavior;
    this.apply(behavior, clip, 'auto', reason);
  }

  private clearLoopTimer(): void {
    if (this.cancelLoopTimer) {
      this.cancelLoopTimer();
      this.cancelLoopTimer = null;
    }
  }

  /**
   * loop 且非 default、非 sustained → 排程回 idle。
   * duration：clip.maxDurationMs 优先，否则 [loopMinMs, loopMaxMs] 随机。
   */
  private armLoopTimeoutIfNeeded(): void {
    const { behavior, clip, loop } = this.state;
    if (!loop) return;
    if (behavior === this.defaultBehavior) return;
    if (this.sustained.has(behavior)) return;

    const clipMeta = this.clips[clip];
    let duration: number;
    if (
      typeof clipMeta?.maxDurationMs === 'number' &&
      clipMeta.maxDurationMs > 0
    ) {
      duration = clipMeta.maxDurationMs;
    } else if (this.loopMaxMs <= this.loopMinMs) {
      duration = this.loopMinMs;
    } else {
      duration =
        this.loopMinMs +
        Math.floor(this.random() * (this.loopMaxMs - this.loopMinMs + 1));
    }

    const expectedSince = this.state.since;
    this.cancelLoopTimer = this.schedule(() => {
      this.cancelLoopTimer = null;
      // 状态已变（被打断）则忽略
      if (this.state.since !== expectedSince) return;
      if (this.state.behavior === this.defaultBehavior) return;
      this.returnToDefault('auto:loop-timeout');
    }, duration);
  }

  /**
   * 解析进入某 behavior 应使用的 clip，并折叠占位映射。
   * 1) behaviorMap 有候选 → 过滤存在于 clips 的，随机选一个
   * 2) map 无/全无效 → clips 有同名则用同名
   * 3) 占位：非 default 请求最终落到 default 的 loop clip → 记为 default
   */
  private resolveEnter(
    behavior: string,
  ): { behavior: string; clip: string } | null {
    let resolved: { behavior: string; clip: string } | null = null;
    const candidates = this.behaviorMap[behavior];
    if (candidates && candidates.length > 0) {
      const valid = candidates.filter((c) => this.hasClip(c));
      if (valid.length > 0) {
        resolved = { behavior, clip: this.pickOne(valid) };
      }
    }
    if (!resolved && this.hasClip(behavior)) {
      resolved = { behavior, clip: behavior };
    }
    if (!resolved) return null;
    return this.foldPlaceholder(resolved.behavior, resolved.clip);
  }

  /**
   * 占位折叠：behavior ≠ default，且 clip === defaultBehavior 且该 clip loop
   * → 视为仍在 idle，避免 AutoScheduler 切入后永不回 idle。
   */
  private foldPlaceholder(
    behavior: string,
    clip: string,
  ): { behavior: string; clip: string } {
    if (
      behavior !== this.defaultBehavior &&
      clip === this.defaultBehavior &&
      this.isLoop(clip)
    ) {
      return { behavior: this.defaultBehavior, clip };
    }
    return { behavior, clip };
  }

  private hasClip(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.clips, name);
  }

  private isLoop(clip: string): boolean {
    return this.clips[clip]?.loop === true;
  }

  private pickOne(list: string[]): string {
    if (list.length === 1) {
      return list[0]!;
    }
    const idx = Math.floor(this.random() * list.length);
    return list[Math.min(idx, list.length - 1)]!;
  }

  /** 无任何可用 clip 时的兜底名 */
  private pickFallbackClip(): string {
    if (this.hasClip(this.defaultBehavior)) {
      return this.defaultBehavior;
    }
    const keys = Object.keys(this.clips);
    return keys[0] ?? this.defaultBehavior;
  }
}
