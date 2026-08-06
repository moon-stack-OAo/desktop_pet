import {
    createContext,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {BehaviorFSM, createAutoScheduler, type FsmState,} from '@pet/runtime';
import {useAudio} from '../hooks/useAudio';
import {useHungerAutoBehavior} from '../hooks/useHungerAutoBehavior';
import {type PetLoadStatus, usePet} from '../hooks/usePet';
import {useVitals, type VitalStats} from '../hooks/useVitals';
import {info as logInfo} from '../utils/log';

/** 动作短时反馈展示时长（ms） */
const FEEDBACK_STATUS_MS = 2_000;
/** 不应被反馈定时器清空的持久/错误类 status（精确匹配） */
const PERSISTENT_STATUS = new Set([
  '加载中…',
  '加载失败',
  '未找到可用视频',
  '未找到精灵表',
  '精灵表加载失败',
  '点击播放',
  '切换中…',
  '切换失败',
  '不支持切换宠物',
  'desktop_pet React 渲染层（无 petAPI）',
]);

/** 降级/拒载等动态文案：反馈定时器结束时勿清掉 */
function isPersistentStatus(text: string): boolean {
  if (PERSISTENT_STATUS.has(text)) return true;
  if (text.includes('降级') || text.includes('默认资源')) return true;
  if (text.startsWith('无法加载')) return true;
  return false;
}

/** 控制器：供菜单 / 键盘调试触发行为 */
export interface PetController {
  /** 请求进入某逻辑行为（user 优先级） */
  request: (behavior: string, reason?: string) => boolean;
  /** 直接播放指定 clip */
  playClip: (clip: string, reason?: string) => boolean;
  /** 当前 FSM 状态 */
  state: FsmState | null;
  /** 宠物载荷 */
  payload: PetPayload | null;
  /** 加载态文案 */
  status: string;
  loadStatus: PetLoadStatus;
  setStatus: Dispatch<SetStateAction<string>>;
  /** 当前 clip 的播放元数据（url / loop） */
  currentClip: PetClipInfo | null | undefined;
  /** 非 loop clip 结束时由 PetVideo 调用 */
  onClipEnded: () => void;
  /** 切换宠物 */
  switchPet: (petId: string) => Promise<boolean>;
  /** 宠物目录 */
  catalog: PetCatalog | null;
  /** 是否静音 */
  muted: boolean;
  /** 切换静音（localStorage: pet-muted） */
  toggleMuted: () => void;
  /** 本地养成数值（按 petId 分存） */
  vitals: VitalStats | null;
  /** 喂食：行为 + 数值；reason 影响 FSM 优先级 */
  feed: (reason?: string) => boolean;
  /** 摸摸头：行为 + 心情 */
  pat: (reason?: string) => boolean;
  /** 玩耍：行为 + 心情 */
  playWith: (reason?: string) => boolean;
}

const PetContext = createContext<PetController | null>(null);

export interface PetProviderProps {
  children: ReactNode;
}

/**
 * 提供 payload + BehaviorFSM + AutoScheduler。
 * 渲染进程内驱动行为；主进程只负责数据与 quit。
 * 切宠时通过 pet.id 变化重建 FSM。
 */
export function PetProvider({ children }: PetProviderProps) {
  const {
    pet,
    status,
    loadStatus,
    setStatus,
    switchPet,
    catalog,
  } = usePet();
  const [fsmState, setFsmState] = useState<FsmState | null>(null);
  const fsmRef = useRef<BehaviorFSM | null>(null);
  /** 短时反馈定时器：2s 后清空，避免盖住错误/autoplay 文案 */
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTextRef = useRef<string | null>(null);

  // 音效：随切宠更换 map
  const { muted, toggleMuted, playFor } = useAudio(pet?.audio?.map);
  const playForRef = useRef(playFor);
  playForRef.current = playFor;

  /**
   * 短时 status 提示（E5）：feed/pat/play 等无 clip 时仍给用户可见反馈。
   * 2s 后仅在仍是本条反馈时清空；不覆盖/不清除持久错误类文案。
   */
  const flashStatus = useCallback(
    (text: string, ms = FEEDBACK_STATUS_MS) => {
      if (!text) return;
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      feedbackTextRef.current = text;
      setStatus(text);
      feedbackTimerRef.current = setTimeout(() => {
        feedbackTimerRef.current = null;
        if (feedbackTextRef.current !== text) return;
        feedbackTextRef.current = null;
        setStatus((prev) => {
          if (isPersistentStatus(prev)) return prev;
          if (prev === text) return '';
          return prev;
        });
      }, ms);
    },
    [setStatus],
  );

  // 切宠 / 卸载时清反馈定时器
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      feedbackTextRef.current = null;
    };
  }, [pet?.id]);

  // 本地养成：按 petId 分存
  const {
    vitals,
    feed: feedVitals,
    pat: patVitals,
    play: playVitals,
  } = useVitals(pet?.id);

  // payload 就绪后创建 FSM；卸载时清理
  useEffect(() => {
    const isSpritesheet = pet?.renderer === 'spritesheet';

    /** video：用 clips；spritesheet：用 animations keys 作为 clips（loop 来自 animation） */
    const clipMeta: Record<string, { loop?: boolean }> = {};
    if (isSpritesheet && pet?.spritesheet?.animations) {
      for (const [name, anim] of Object.entries(pet.spritesheet.animations)) {
        const loop =
          anim && typeof anim === 'object' && 'loop' in anim
            ? anim.loop === true
            : name === 'idle';
        clipMeta[name] = { loop };
      }
    }
    if (pet?.clips) {
      for (const [name, info] of Object.entries(pet.clips)) {
        if (!clipMeta[name]) {
          clipMeta[name] = { loop: info.loop === true };
        }
      }
    }

    if (Object.keys(clipMeta).length === 0) {
      fsmRef.current = null;
      setFsmState(null);
      return;
    }

    // 保证至少有 idle
    if (!clipMeta.idle) {
      clipMeta.idle = { loop: true };
    }

    const fsm = new BehaviorFSM({
      behaviorMap: pet?.behaviorMap ?? {},
      clips: clipMeta,
      defaultBehavior: 'idle',
      // loop 非 idle/hungry 等在 5–12s 超时回 idle（见 @pet/runtime）
      loopMinMs: 5_000,
      loopMaxMs: 12_000,
      onChange: (state, meta) => {
        setFsmState(state);
        // 仅在 clip 实际变化时播音效，避免同状态冗余
        if (state.clip !== meta.previous.clip) {
          playForRef.current(state.clip, state.behavior);
        }
      },
    });
    fsmRef.current = fsm;
    setFsmState(fsm.getState());
    // 初始进入不强制播音效（多为 idle，无映射）

    // 真实 walk clip，或 behaviorMap.walk 指向「非 idle 折叠」的有效 clip 时启动调度。
    // 纯占位 walk→idle 会被 FSM fold 为 idle，request 仍可成功但无视觉变化；仍启调度无害。
    const hasWalk =
      !!clipMeta.walk ||
      (pet?.behaviorMap?.walk ?? []).some((c) => !!clipMeta[c]);
    let scheduler: ReturnType<typeof createAutoScheduler> | null = null;
    if (hasWalk) {
      scheduler = createAutoScheduler(fsm, {
        minMs: 8_000,
        maxMs: 20_000,
        behaviors: ['walk'],
      });
      scheduler.start();
      logInfo(
        '[renderer] AutoScheduler 已启动（walk）',
        `renderer=${pet?.renderer || 'video'}`,
      );
    }

    return () => {
      scheduler?.stop();
      fsm.dispose();
      fsmRef.current = null;
    };
  }, [pet]);

  const request = useCallback((behavior: string, reason?: string) => {
    const fsm = fsmRef.current;
    if (!fsm) return false;
    const ok = fsm.request(behavior, reason ?? `user:${behavior}`);
    if (ok) {
      // onChange 会更新 state 并触发音效；同步一次以防严格模式下竞态
      setFsmState(fsm.getState());
    }
    return ok;
  }, []);

  const playClip = useCallback((clip: string, reason?: string) => {
    const fsm = fsmRef.current;
    if (!fsm) return false;
    const ok = fsm.playClip(clip, reason ?? `user:clip:${clip}`);
    if (ok) setFsmState(fsm.getState());
    return ok;
  }, []);

  /**
   * 喂食：优先播 eat；即使 clips/behaviorMap 缺 eat（多数 spritesheet 占位），
   * 仍更新养成值，并用短时 status 反馈（E5）。
   */
  const feed = useCallback(
    (reason = 'user:eat') => {
      const ok = request('eat', reason);
      feedVitals();
      flashStatus(ok ? '已喂食' : '已喂食 · 饱食↑');
      return ok;
    },
    [request, feedVitals, flashStatus],
  );

  /** 摸摸头：动作可失败，心情仍涨 + 短时反馈 */
  const pat = useCallback(
    (reason = 'user:happy') => {
      const ok = request('happy', reason);
      patVitals();
      flashStatus(ok ? '摸摸头 · 心情↑' : '心情↑');
      return ok;
    },
    [request, patVitals, flashStatus],
  );

  /** 玩耍：动作可失败，心情仍涨 + 短时反馈 */
  const playWith = useCallback(
    (reason = 'user:play') => {
      const ok = request('play', reason);
      playVitals();
      flashStatus(ok ? '玩耍中' : '玩耍 · 心情↑');
      return ok;
    },
    [request, playVitals, flashStatus],
  );

  // 托盘等主进程菜单 → 渲染进程 FSM；喂食/互动同步 vitals
  useEffect(() => {
    const unsub = window.petAPI?.onBehaviorRequest?.((behavior) => {
      if (behavior === 'eat') {
        const ok = feed();
        logInfo(`[renderer] 托盘 feed →`, ok);
        return;
      }
      if (behavior === 'happy') {
        const ok = pat();
        logInfo(`[renderer] 托盘 pat →`, ok);
        return;
      }
      if (behavior === 'play') {
        const ok = playWith();
        logInfo(`[renderer] 托盘 play →`, ok);
        return;
      }
      const ok = request(behavior, `tray:${behavior}`);
      logInfo(`[renderer] 托盘 request(${behavior}) →`, ok);
    });
    return () => {
      unsub?.();
    };
  }, [request, feed, pat, playWith]);

  useHungerAutoBehavior({
    vitals,
    fsmState,
    fsmRef,
    setFsmState,
  });

  const onClipEnded = useCallback(() => {
    fsmRef.current?.onClipEnded();
    if (fsmRef.current) {
      setFsmState(fsmRef.current.getState());
    }
  }, []);

  const currentClip = useMemo((): PetClipInfo | null | undefined => {
    if (!pet?.clips || !fsmState?.clip) return null;
    // 无对应 clip 时返回 null（避免 noUncheckedIndexedAccess 下 undefined 漏处理）
    return pet.clips[fsmState.clip] ?? null;
  }, [pet, fsmState]);

  const value = useMemo<PetController>(
    () => ({
      request,
      playClip,
      state: fsmState,
      payload: pet,
      status,
      loadStatus,
      setStatus,
      currentClip,
      onClipEnded,
      switchPet,
      catalog,
      muted,
      toggleMuted,
      vitals,
      feed,
      pat,
      playWith,
    }),
    [
      request,
      playClip,
      fsmState,
      pet,
      status,
      loadStatus,
      setStatus,
      currentClip,
      onClipEnded,
      switchPet,
      catalog,
      muted,
      toggleMuted,
      vitals,
      feed,
      pat,
      playWith,
    ],
  );

  return <PetContext.Provider value={value}>{children}</PetContext.Provider>;
}

/** 读取 PetController；须在 PetProvider 内使用 */
export function usePetController(): PetController {
  const ctx = useContext(PetContext);
  if (!ctx) {
    throw new Error('usePetController 须在 PetProvider 内使用');
  }
  return ctx;
}
