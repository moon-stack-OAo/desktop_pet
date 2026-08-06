import {useCallback, useEffect, useRef, useState} from 'react';
import {
  parseVitalsRaw,
  serializeVitals,
  vitalsStorageKey,
  type VitalsRecord,
} from '../../shared/user-storage-migrate.js';

/** 本地养成数值：0 最饿/最差，100 最满（运行时不含 version） */
export type VitalStats = {
  hunger: number;
  mood: number;
  updatedAt: number;
};

/** 衰减：每 30s 饥饿 -2；每 60s 心情 -1 */
const HUNGER_INTERVAL_MS = 30_000;
const HUNGER_STEP = 2;
const MOOD_INTERVAL_MS = 60_000;
const MOOD_STEP = 1;

/** 定时 tick 间隔（ms） */
const TICK_MS = 5_000;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function toStats(record: VitalsRecord): VitalStats {
  return {
    hunger: record.hunger,
    mood: record.mood,
    updatedAt: record.updatedAt,
  };
}

/**
 * 按 updatedAt 补算离线/间隔衰减。
 * 结算后 updatedAt 推到已消耗的周期边界（保留零头）。
 */
export function applyDecay(stats: VitalStats, now = Date.now()): VitalStats {
  const elapsed = Math.max(0, now - stats.updatedAt);
  if (elapsed <= 0) return stats;

  const hungerTicks = Math.floor(elapsed / HUNGER_INTERVAL_MS);
  const moodTicks = Math.floor(elapsed / MOOD_INTERVAL_MS);
  if (hungerTicks === 0 && moodTicks === 0) {
    return stats;
  }

  // 推进量取两周期已结算的较大值，零头留到下次 tick
  const settleMs = Math.max(
    hungerTicks * HUNGER_INTERVAL_MS,
    moodTicks * MOOD_INTERVAL_MS,
  );

  return {
    hunger: clamp(stats.hunger - hungerTicks * HUNGER_STEP),
    mood: clamp(stats.mood - moodTicks * MOOD_STEP),
    updatedAt: stats.updatedAt + settleMs,
  };
}

function readStats(petId: string): VitalStats {
  try {
    const raw = localStorage.getItem(vitalsStorageKey(petId));
    const { record, migrated } = parseVitalsRaw(raw);
    const base = toStats(record);
    const decayed = applyDecay(base);
    // 迁移或衰减后写回带 version 的 schema
    if (
      migrated ||
      decayed.hunger !== base.hunger ||
      decayed.mood !== base.mood ||
      decayed.updatedAt !== base.updatedAt
    ) {
      writeStats(petId, decayed);
    }
    return decayed;
  } catch {
    const { record } = parseVitalsRaw(null);
    return toStats(record);
  }
}

function writeStats(petId: string, stats: VitalStats): void {
  try {
    localStorage.setItem(vitalsStorageKey(petId), serializeVitals(stats));
  } catch {
    /* 忽略配额等 */
  }
}

export interface UseVitalsResult {
  vitals: VitalStats | null;
  /** 喂食：hunger+30，mood+5 */
  feed: () => void;
  /** 摸摸头：mood+10 */
  pat: () => void;
  /** 玩耍：mood+15 */
  play: () => void;
  /** 手动写入（调试用） */
  setVitals: (patch: Partial<Pick<VitalStats, 'hunger' | 'mood'>>) => void;
}

/**
 * 本地养成：按 petId 分存 localStorage（key: pet-vitals:{petId}），
 * schema 带 version，旧数据自动迁移；定时衰减；切宠时切换存储。
 */
export function useVitals(petId: string | undefined | null): UseVitalsResult {
  const [vitals, setVitalsState] = useState<VitalStats | null>(null);
  const petIdRef = useRef(petId);
  petIdRef.current = petId;
  const vitalsRef = useRef<VitalStats | null>(null);
  vitalsRef.current = vitals;

  // 切宠 / 首次：读盘并补衰减
  useEffect(() => {
    if (!petId) {
      setVitalsState(null);
      return;
    }
    const next = readStats(petId);
    writeStats(petId, next);
    setVitalsState(next);
  }, [petId]);

  const commit = useCallback((next: VitalStats) => {
    const id = petIdRef.current;
    if (!id) return;
    const stamped = { ...next, updatedAt: Date.now() };
    writeStats(id, stamped);
    setVitalsState(stamped);
  }, []);

  // 定时 tick：衰减
  useEffect(() => {
    if (!petId) return;
    const tick = () => {
      const id = petIdRef.current;
      const cur = vitalsRef.current;
      if (!id || !cur) return;
      const decayed = applyDecay(cur);
      if (
        decayed.hunger !== cur.hunger ||
        decayed.mood !== cur.mood ||
        decayed.updatedAt !== cur.updatedAt
      ) {
        writeStats(id, decayed);
        setVitalsState(decayed);
      }
    };
    const t = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(t);
  }, [petId]);

  const feed = useCallback(() => {
    const cur = vitalsRef.current;
    if (!cur) return;
    commit({
      ...cur,
      hunger: clamp(cur.hunger + 30),
      mood: clamp(cur.mood + 5),
    });
  }, [commit]);

  const pat = useCallback(() => {
    const cur = vitalsRef.current;
    if (!cur) return;
    commit({
      ...cur,
      mood: clamp(cur.mood + 10),
    });
  }, [commit]);

  const play = useCallback(() => {
    const cur = vitalsRef.current;
    if (!cur) return;
    commit({
      ...cur,
      mood: clamp(cur.mood + 15),
    });
  }, [commit]);

  const setVitals = useCallback(
    (patch: Partial<Pick<VitalStats, 'hunger' | 'mood'>>) => {
      const cur = vitalsRef.current;
      if (!cur) return;
      commit({
        ...cur,
        hunger:
          patch.hunger !== undefined ? clamp(patch.hunger) : cur.hunger,
        mood: patch.mood !== undefined ? clamp(patch.mood) : cur.mood,
      });
    },
    [commit],
  );

  return { vitals, feed, pat, play, setVitals };
}
