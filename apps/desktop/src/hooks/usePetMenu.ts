import { useCallback, useEffect, useMemo, useState } from 'react';
import { BEHAVIOR_MENU_ITEMS } from '../../shared/menu-model.js';
import type { ContextMenuItem } from '../components/ContextMenu';
import type { VitalStats } from './useVitals';
import { useContextQuit, type ContextMenuState } from './useContextQuit';

export interface UsePetMenuOptions {
  chatOpen: boolean;
  onCloseChat: () => void;
  catalog: PetCatalog | null;
  payloadId: string | undefined;
  vitals: VitalStats | null;
  muted: boolean;
  ignoreMouse: boolean;
  feed: () => boolean;
  pat: () => boolean;
  playWith: () => boolean;
  request: (behavior: string, reason?: string) => boolean;
  switchPet: (petId: string) => Promise<boolean>;
  toggleMuted: () => void;
  toggleIgnoreMouse: () => void;
  /** 打开 AI 设置面板 */
  onOpenAiSettings?: () => void;
  aiSettingsOpen?: boolean;
  onCloseAiSettings?: () => void;
}

export interface UsePetMenuResult {
  menu: ContextMenuState;
  menuItems: ContextMenuItem[];
  closeMenu: () => void;
  handleCloseMenu: () => void;
}

/**
 * 右键菜单：行为项（共享模型）+ 静音/穿透/切宠/更新/退出。
 */
export function usePetMenu({
  chatOpen,
  onCloseChat,
  catalog,
  payloadId,
  vitals,
  muted,
  ignoreMouse,
  feed,
  pat,
  playWith,
  request,
  switchPet,
  toggleMuted,
  toggleIgnoreMouse,
  onOpenAiSettings,
  aiSettingsOpen = false,
  onCloseAiSettings,
}: UsePetMenuOptions): UsePetMenuResult {
  const { menu, closeMenu } = useContextQuit({
    chatOpen,
    onCloseChat,
    aiSettingsOpen,
    onCloseAiSettings,
  });
  const [showPetPicker, setShowPetPicker] = useState(false);

  // 关闭菜单时收起切换列表
  useEffect(() => {
    if (!menu.open) setShowPetPicker(false);
  }, [menu.open]);

  const handleCloseMenu = useCallback(() => {
    setShowPetPicker(false);
    closeMenu();
  }, [closeMenu]);

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (showPetPicker) {
      const pets = catalog?.pets ?? [];
      const items: ContextMenuItem[] = [
        {
          id: 'back',
          label: '← 返回',
          onClick: () => setShowPetPicker(false),
        },
        { id: 'sep-pets', label: '', separator: true },
      ];
      for (const p of pets) {
        const current = p.id === (payloadId || catalog?.currentId);
        const label = p.displayName || p.id;
        items.push({
          id: `pet-${p.id}`,
          label: current ? `✓ ${label}` : label,
          onClick: () => {
            // 先关菜单再切，避免小窗内菜单挡住切回后的 video 首帧
            setShowPetPicker(false);
            closeMenu();
            void switchPet(p.id);
          },
        });
      }
      if (pets.length === 0) {
        items.push({
          id: 'empty',
          label: '（暂无宠物）',
          disabled: true,
        });
      }
      return items;
    }

    const h = vitals ? Math.round(vitals.hunger) : '—';
    const m = vitals ? Math.round(vitals.mood) : '—';

    const behaviorHandlers: Record<string, () => void> = {
      eat: () => {
        feed();
      },
      happy: () => {
        pat();
      },
      play: () => {
        playWith();
      },
      sleep: () => {
        request('sleep');
      },
      walk: () => {
        request('walk');
      },
    };

    const behaviorItems: ContextMenuItem[] = BEHAVIOR_MENU_ITEMS.map(
      (item) => ({
        id: item.id,
        label: item.label,
        onClick: behaviorHandlers[item.behaviorId] ?? (() => request(item.behaviorId)),
      }),
    );

    return [
      {
        id: 'status',
        label: `状态：饱食 ${h} / 心情 ${m}`,
        disabled: true,
      },
      { id: 'sep-status', label: '', separator: true },
      ...behaviorItems,
      { id: 'sep1', label: '', separator: true },
      {
        id: 'mute',
        label: muted ? '取消静音' : '静音',
        onClick: () => toggleMuted(),
      },
      {
        id: 'click-through',
        label: ignoreMouse ? '✓ 点击穿透' : '点击穿透',
        onClick: () => toggleIgnoreMouse(),
      },
      {
        id: 'switch',
        label: '切换宠物 →',
        onClick: () => setShowPetPicker(true),
      },
      {
        id: 'ai-chat',
        label: 'AI 对话',
        onClick: () => {
          void window.petAPI?.getIgnoreMouse?.().then((v) => {
            if (v) window.petAPI?.setIgnoreMouse?.(false);
          });
          // 与托盘一致：通知主进程放大 + 打开（无托盘通道时本地双击逻辑由 onOpenAiSettings 旁路）
          // 右键菜单在渲染层：直接由 App 的 chat.openChat 更合适，这里发自定义事件
          window.dispatchEvent(new CustomEvent('pet:open-chat'));
        },
      },
      {
        id: 'ai-settings',
        label: 'AI 设置…',
        onClick: () => onOpenAiSettings?.(),
      },
      {
        id: 'update',
        label: '检查更新',
        onClick: () => {
          void window.petAPI?.checkUpdate?.({ manual: true });
        },
      },
      { id: 'sep2', label: '', separator: true },
      {
        id: 'quit',
        label: '退出',
        onClick: () => window.petAPI?.quit(),
      },
    ];
  }, [
    catalog,
    closeMenu,
    feed,
    ignoreMouse,
    muted,
    onOpenAiSettings,
    pat,
    payloadId,
    playWith,
    request,
    showPetPicker,
    switchPet,
    toggleIgnoreMouse,
    toggleMuted,
    vitals,
  ]);

  return { menu, menuItems, closeMenu, handleCloseMenu };
}
