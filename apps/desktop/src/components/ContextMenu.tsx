import {useEffect, useRef} from 'react';

export interface ContextMenuItem {
  /** 唯一键 */
  id: string;
  /** 中文标签 */
  label: string;
  /** 分隔线 */
  separator?: boolean;
  /** 禁用（只读展示） */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

export interface ContextMenuProps {
  /** 是否可见 */
  open: boolean;
  /** 视口坐标 */
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** 关闭菜单 */
  onClose: () => void;
  /** 点击后保持菜单打开的项 id（如进入子级） */
  stayOpenIds?: string[];
}

/**
 * 自定义右键菜单：半透明深色、圆角；区域 no-drag。
 */
export default function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
  stayOpenIds = [],
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 下一帧再监听，避免打开时的同一次点击立刻关掉
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onPointerDown, true);
    };
  }, [open, onClose]);

  // 菜单贴边：双帧测量，尽量不超出小窗
  useEffect(() => {
    if (!open || !ref.current) return;
    const pad = 4;

    const clamp = () => {
      if (!ref.current) return;
      const node = ref.current;
      // 先放到目标点再量尺寸，避免 max-height 未生效时测偏
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      const rect = node.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(rect.width, Math.max(0, vw - pad * 2));
      const h = Math.min(rect.height, Math.max(0, vh - pad * 2));
      const maxX = Math.max(pad, vw - w - pad);
      const maxY = Math.max(pad, vh - h - pad);
      const nx = Math.max(pad, Math.min(x, maxX));
      const ny = Math.max(pad, Math.min(y, maxY));
      node.style.left = `${nx}px`;
      node.style.top = `${ny}px`;
    };

    clamp();
    // 字体/滚动条生效后再校正一次
    const raf = window.requestAnimationFrame(clamp);
    return () => window.cancelAnimationFrame(raf);
  }, [open, x, y, items]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="context-menu-sep" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            className={
              item.disabled
                ? 'context-menu-item context-menu-item--disabled'
                : 'context-menu-item'
            }
            role="menuitem"
            disabled={item.disabled === true}
            onClick={() => {
              if (item.disabled) return;
              item.onClick?.();
              if (!stayOpenIds.includes(item.id)) {
                onClose();
              }
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
