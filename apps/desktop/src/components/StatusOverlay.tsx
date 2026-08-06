export interface StatusOverlayProps {
  /** 状态文案；空则不渲染 */
  text: string;
}

/**
 * 加载中 / 错误 / 点击播放 等半透明提示。
 */
export default function StatusOverlay({ text }: StatusOverlayProps) {
  if (!text) return null;
  return <div className="status">{text}</div>;
}
