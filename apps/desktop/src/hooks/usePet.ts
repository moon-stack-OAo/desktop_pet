import {type Dispatch, type SetStateAction, useCallback, useEffect, useState} from 'react';
import {error as logError, info as logInfo, warn as logWarn} from '../utils/log';

export type PetLoadStatus =
  | 'loading'
  | 'ready'
  | 'error'
  | 'no-api'
  | 'switching';

export interface UsePetResult {
  /** 当前宠物载荷 */
  pet: PetPayload | null;
  /** 加载态文案（空字符串表示无需展示） */
  status: string;
  /** 细粒度状态，便于组件分支 */
  loadStatus: PetLoadStatus;
  /** 设置状态文案（如 autoplay 失败提示）；支持函数式更新 */
  setStatus: Dispatch<SetStateAction<string>>;
  /** 切换宠物 */
  switchPet: (petId: string) => Promise<boolean>;
  /** 目录缓存 */
  catalog: PetCatalog | null;
  /** 刷新目录 */
  refreshCatalog: () => Promise<void>;
}

/**
 * 判断 payload 是否可渲染（video clips / spritesheet 图）
 */
function isValidPayload(payload: PetPayload | null | undefined): boolean {
  if (!payload) return false;
  if (payload.renderer === 'spritesheet') {
    return !!(
      payload.spritesheet?.url ||
      payload.clips?.idle?.url ||
      payload.idle?.url
    );
  }
  if (payload.clips && Object.keys(payload.clips).length > 0) {
    return !!(payload.clips.idle?.url || payload.idle?.url);
  }
  return !!payload.idle?.url;
}

/**
 * 统一宠物加载：onReady 可持续推送（含切宠）；getPet 兜底。
 */
export function usePet(): UsePetResult {
  const [pet, setPet] = useState<PetPayload | null>(null);
  const [status, setStatus] = useState('加载中…');
  const [loadStatus, setLoadStatus] = useState<PetLoadStatus>('loading');
  const [catalog, setCatalog] = useState<PetCatalog | null>(null);

  const applyPet = useCallback((payload: PetPayload | null | undefined) => {
    if (!isValidPayload(payload)) {
      setStatus(
        payload?.loadMeta?.userMessage ||
          (payload?.renderer === 'spritesheet'
            ? '未找到精灵表'
            : '未找到可用视频'),
      );
      setLoadStatus('error');
      logError('[renderer] 无效 payload', payload);
      return;
    }
    setPet(payload!);
    setLoadStatus('ready');
    const meta = payload!.loadMeta;
    if (meta?.degraded && meta.userMessage) {
      setStatus(meta.userMessage);
      logWarn(
        '[renderer] 降级/回退加载',
        meta.mode,
        meta.userMessage,
        meta.detail || '',
      );
    } else {
      setStatus('');
    }
    const clipCount = payload!.clips
      ? Object.keys(payload!.clips).length
      : 0;
    logInfo(
      '[renderer] 已加载',
      payload!.displayName || payload!.id,
      `renderer=${payload!.renderer || 'video'}`,
      `clips=${clipCount}`,
      meta?.mode ? `load=${meta.mode}` : '',
      payload!.renderer === 'spritesheet'
        ? payload!.spritesheet?.url
        : payload!.idle?.url || payload!.clips?.idle?.url,
    );
  }, []);

  const refreshCatalog = useCallback(async () => {
    if (!window.petAPI?.getCatalog) return;
    try {
      const cat = await window.petAPI.getCatalog();
      setCatalog(cat);
    } catch (err) {
      logWarn('[renderer] getCatalog 失败', err);
    }
  }, []);

  const switchPet = useCallback(
    async (petId: string) => {
      if (!window.petAPI?.switchPet) {
        setStatus('不支持切换宠物');
        return false;
      }
      if (pet?.id === petId) return true;
      setLoadStatus('switching');
      setStatus('切换中…');
      try {
        const result = await window.petAPI.switchPet(petId);
        if (!result?.ok) {
          setStatus(result?.error || '切换失败');
          setLoadStatus(pet ? 'ready' : 'error');
          return false;
        }
        // 主进程会再发 pet:ready；若同包返回 payload 也可立即应用
        if (result.payload) {
          applyPet(result.payload);
        }
        await refreshCatalog();
        return true;
      } catch (err) {
        logError('[renderer] switchPet 失败', err);
        setStatus('切换失败');
        setLoadStatus(pet ? 'ready' : 'error');
        return false;
      }
    },
    [applyPet, pet, refreshCatalog],
  );

  useEffect(() => {
    if (!window.petAPI) {
      setStatus('desktop_pet React 渲染层（无 petAPI）');
      setLoadStatus('no-api');
      return;
    }

    let cancelled = false;
    /** B-903：onReady 已成功应用后，忽略滞后的 getPet 失败，避免闪错误 status */
    let readyApplied = false;
    let unsubReady: (() => void) | void;

    // 切宠后会多次推送，始终应用最新 payload
    if (window.petAPI.onReady) {
      unsubReady = window.petAPI.onReady((payload) => {
        if (cancelled) return;
        readyApplied = true;
        applyPet(payload);
        void refreshCatalog();
      });
    }

    if (window.petAPI.getPet) {
      window.petAPI
        .getPet()
        .then((payload) => {
          if (cancelled) return;
          // onReady 可能已先到：仍 apply 最新（同 id 覆盖无害）
          readyApplied = true;
          applyPet(payload);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          logError('[renderer] getPet 失败', err);
          // 若 onReady 已成功，勿用 getPet 失败盖掉 ready
          if (readyApplied) return;
          setStatus((prev) => (prev === '加载中…' ? '加载失败' : prev));
          setLoadStatus((s) => (s === 'loading' ? 'error' : s));
        });
    }

    void refreshCatalog();

    return () => {
      cancelled = true;
      if (typeof unsubReady === 'function') unsubReady();
    };
  }, [applyPet, refreshCatalog]);

  return {
    pet,
    status,
    loadStatus,
    setStatus,
    switchPet,
    catalog,
    refreshCatalog,
  };
}
