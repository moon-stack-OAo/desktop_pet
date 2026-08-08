/** 与 guga behaviorMap 对齐的核心行为名 */
export type CoreBehaviorName =
    | 'idle'
    | 'walk'
    | 'hungry'
    | 'eat'
    | 'sleep'
    | 'play'
    | 'sick'
    | 'happy'
    | 'hunt'
    | 'grasp';

/** 可直接播放的扩展 clip 名（clips 中存在即可） */
export type ExtendedClipName =
    | 'headpat'
    | 'grasp'
    | 'dance'
    | 'spin'
    | 'rest'
    | 'work'
    | 'study'
    | 'watch'
    | 'music'
    | 'milktea'
    | 'peek'
    | 'walkout'
    | 'farewell'
    | 'question'
    | 'angry'
    | string;

/** 逻辑行为名（核心 + 扩展） */
export type BehaviorName = CoreBehaviorName | ExtendedClipName;

/** 触发来源优先级：user > ai > auto */
export type InterruptPriority = 'user' | 'ai' | 'auto';

/** 中断优先级数值（越大越高） */
export const PRIORITY_RANK: Record<InterruptPriority, number> = {
    auto: 0,
    ai: 1,
    user: 2,
};

/**
 * 默认「持续态」行为：loop 也不自动超时回 idle（由养成/用户主动结束）
 * 其它 loop 行为（walk/happy/play/dance…）会在 loopMaxMs 内强制回 default
 */
export const DEFAULT_SUSTAINED_BEHAVIORS: readonly string[] = [
    'hungry',
    'sleep',
    'sick',
    /** 拖动抓起：松手前保持 grasp.webm，不因 loop 超时回 idle */
    'grasp',
    /** 系统负载触发的加班：由负载回落逻辑结束，不因 loop 超时打断 */
    'work',
];

/** FSM 对外状态快照 */
export type FsmState = {
    /** 当前逻辑行为 */
    behavior: string;
    /** 当前播放的 clip 名 */
    clip: string;
    /** 进入该状态的时间戳（ms） */
    since: number;
};

/** FSM 内部完整状态 */
export type PetState = FsmState & {
    /** 当前持有者的优先级（用于打断判定） */
    priority: InterruptPriority;
    /** 当前 clip 是否循环 */
    loop: boolean;
};

/** FSM 变更元信息 */
export type FsmChangeMeta = {
    reason: string;
    previous: FsmState;
    priority: InterruptPriority;
};

/** clip 元数据（与 schema VideoClip 对齐的最小子集） */
export type ClipMeta = {
    loop?: boolean;
    /**
     * 可选：该 clip 作为 loop 播放时的最长时长（ms），覆盖 FSM 全局 loopMin/Max
     */
    maxDurationMs?: number;
};

/** 调度延迟的可注入实现；返回取消函数 */
export type ScheduleFn = (callback: () => void, ms: number) => () => void;

/**
 * behaviorMap 中单个 clip 候选：
 * - string：等权
 * - { clip, weight }：加权（weight 越大越容易被选中）
 */
export type BehaviorClipCandidate =
    | string
    | {
    clip: string;
    /** 选取权重，默认 1；须 > 0 */
    weight?: number;
};

/** BehaviorFSM 构造选项 */
export type BehaviorFSMOptions = {
    /** behavior → clip 候选列表（可带 weight） */
    behaviorMap: Record<string, BehaviorClipCandidate[]>;
    /** 可用 clip 集合 */
    clips: Record<string, ClipMeta>;
    /** 默认行为，缺省 idle */
    defaultBehavior?: string;
    /** 状态变更回调 */
    onChange?: (state: FsmState, meta: FsmChangeMeta) => void;
    /**
     * 同 behavior 重复 request 策略：
     * - reenter：允许重入并换 clip（默认，适合 happy 等）
     * - ignore：忽略相同 behavior 的重复请求
     */
    sameBehaviorPolicy?: 'reenter' | 'ignore';
    /** 随机数源，便于单测；默认 Math.random */
    random?: () => number;
    /** 时钟，便于单测；默认 Date.now */
    now?: () => number;
    /**
     * loop 非 default、非 sustained 行为的最短时长 ms（默认 5000）
     * 与 loopMaxMs 构成超时区间，防止 walk/dance 等永久卡住
     */
    loopMinMs?: number;
    /** loop 行为最长时长 ms（默认 12000） */
    loopMaxMs?: number;
    /**
     * 不因 loop 超时自动回 idle 的行为（默认 hungry/sleep/sick）
     */
    sustainedBehaviors?: readonly string[];
    /**
     * 定时器注入；默认 setTimeout。单测可注入假时钟。
     * 返回取消函数。
     */
    schedule?: ScheduleFn;
};

/** 自主调度候选：可带权重与冷却 */
export type AutoBehaviorCandidate = {
    /** 逻辑行为名 */
    name: string;
    /** 选取权重，默认 1；越大越容易被选中 */
    weight?: number;
    /** 成功触发后冷却 ms，默认 0（不冷却） */
    cooldownMs?: number;
};

/** 自主调度器选项 */
export type AutoSchedulerOptions = {
    /** 最小间隔 ms，默认 8000；兼容别名 minIntervalMs */
    minMs?: number;
    /** 最大间隔 ms，默认 20000；兼容别名 maxIntervalMs */
    maxMs?: number;
    /** 最小间隔别名（与 minMs 等价） */
    minIntervalMs?: number;
    /** 最大间隔别名（与 maxMs 等价） */
    maxIntervalMs?: number;
    /**
     * 候选自主行为。
     * - string[]：等权、无冷却（向后兼容）
     * - AutoBehaviorCandidate[]：权重 + 冷却
     * 默认 walk（高权）+ happy/play（中低权）
     */
    behaviors?: Array<string | AutoBehaviorCandidate>;
    /** 随机数源 */
    random?: () => number;
    /** 时钟，便于单测冷却；默认 Date.now */
    now?: () => number;
};

/** 自主调度器句柄 */
export type AutoScheduler = {
    start: () => void;
    stop: () => void;
    isRunning: () => boolean;
};

/** 从 reason 字符串推断优先级 */
export function inferPriority(reason?: string): InterruptPriority {
    if (!reason) return 'user';
    const r = reason.toLowerCase();
    if (r === 'auto' || r.startsWith('auto:') || r.startsWith('auto/')) return 'auto';
    if (r === 'ai' || r.startsWith('ai:') || r.startsWith('ai/')) return 'ai';
    return 'user';
}

/** 默认 setTimeout 调度 */
export function defaultSchedule(callback: () => void, ms: number): () => void {
    const id = setTimeout(callback, ms);
    return () => clearTimeout(id);
}

/** 默认自主候选：walk 高权，happy/play 中低权，各自冷却避免狂切 */
export const DEFAULT_AUTO_BEHAVIORS: readonly AutoBehaviorCandidate[] = [
    {name: 'walk', weight: 5, cooldownMs: 12_000},
    {name: 'happy', weight: 2, cooldownMs: 25_000},
    {name: 'play', weight: 2, cooldownMs: 25_000},
];
