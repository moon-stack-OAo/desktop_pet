import {useCallback, useEffect, useRef, useState} from 'react';
import {warn as logWarn} from '../utils/log';
import {
  MUTED_STORAGE_KEY,
  parseMutedRaw,
  serializeMuted,
} from '../../shared/user-storage-migrate.js';

const DEFAULT_VOLUME = 0.6;

/**
 * 从 localStorage 读取静音状态（兼容旧 "1"/"0"，自动迁移为带 version 的 JSON）
 */
function readMuted(): boolean {
  try {
    const raw = localStorage.getItem(MUTED_STORAGE_KEY);
    const { record, migrated } = parseMutedRaw(raw);
    if (migrated) {
      writeMuted(record.muted);
    }
    return record.muted;
  } catch {
    return false;
  }
}

/**
 * 持久化静音状态（schema v1）
 */
function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, serializeMuted(muted));
  } catch {
    /* 忽略配额等错误 */
  }
}

export interface UseAudioResult {
  /** 是否静音 */
  muted: boolean;
  /** 切换静音并持久化 */
  toggleMuted: () => void;
  /** 设置静音 */
  setMuted: (muted: boolean) => void;
  /**
   * 按 clip 优先、behavior 次之查 map 播放；
   * 同 url 快速重入则 restart（currentTime=0）
   */
  playFor: (clip?: string | null, behavior?: string | null) => void;
}

/**
 * desktop_pet 音效：payload.audio.map + 静音开关（localStorage: pet-muted）
 * 切宠后 map 随 audioMap 参数更新。
 */
export function useAudio(
  audioMap: Record<string, string> | undefined | null,
): UseAudioResult {
  const [muted, setMutedState] = useState(readMuted);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  /** key → HTMLAudioElement 缓存，避免重复创建 */
  const playersRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const mapRef = useRef(audioMap);
  mapRef.current = audioMap;

  // 切宠 / map 变化时清空缓存（旧 pet-asset URL 不再使用）
  useEffect(() => {
    const prev = playersRef.current;
    prev.forEach((a) => {
      try {
        a.pause();
        a.src = '';
      } catch {
        /* ignore */
      }
    });
    playersRef.current = new Map();
  }, [audioMap]);

  // 卸载清理
  useEffect(() => {
    return () => {
      playersRef.current.forEach((a) => {
        try {
          a.pause();
          a.src = '';
        } catch {
          /* ignore */
        }
      });
      playersRef.current.clear();
    };
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeMuted(next);
    // 静音时立刻停掉正在播的
    if (next) {
      playersRef.current.forEach((a) => {
        try {
          a.pause();
        } catch {
          /* ignore */
        }
      });
    }
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted(!mutedRef.current);
  }, [setMuted]);

  const playFor = useCallback(
    (clip?: string | null, behavior?: string | null) => {
      if (mutedRef.current) return;
      const map = mapRef.current;
      if (!map) return;

      // clip 名优先，其次 behavior
      const url =
        (clip && map[clip]) || (behavior && map[behavior]) || undefined;
      if (!url) return;

      let audio = playersRef.current.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.volume = DEFAULT_VOLUME;
        audio.preload = 'auto';
        playersRef.current.set(url, audio);
      }

      try {
        // 同音效快速重入：从头播
        audio.currentTime = 0;
        void audio.play().catch((err) => {
          logWarn('[audio] 播放失败', url, err);
        });
      } catch (err) {
        logWarn('[audio] 播放异常', err);
      }
    },
    [],
  );

  return { muted, toggleMuted, setMuted, playFor };
}
