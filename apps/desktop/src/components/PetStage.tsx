import type {ReactNode} from 'react';

export interface PetStageProps {
  /** 可选淡显示名称（debug / 很淡，不挡宠物） */
  displayName?: string;
  children: ReactNode;
}

/**
 * 舞台容器：整区可拖拽（-webkit-app-region: drag）。
 */
export default function PetStage({ displayName, children }: PetStageProps) {
  return (
    <div className="stage" title="拖拽移动 · 双击对话 · 右键菜单">
      {displayName ? (
        <div className="badge" aria-hidden>
          {displayName}
        </div>
      ) : null}
      {children}
    </div>
  );
}
