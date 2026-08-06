import type {VitalStats} from '../hooks/useVitals';

export interface VitalsBarProps {
  vitals: VitalStats | null;
}

/**
 * 底部极淡双进度条：饱食 / 心情，不挡宠物。
 */
export default function VitalsBar({ vitals }: VitalsBarProps) {
  if (!vitals) return null;
  return (
    <div className="vitals-bar" aria-hidden>
      <div className="vitals-row">
        <span className="vitals-label">🍽</span>
        <div className="vitals-track">
          <div
            className="vitals-fill vitals-fill--hunger"
            style={{ width: `${vitals.hunger}%` }}
          />
        </div>
      </div>
      <div className="vitals-row">
        <span className="vitals-label">♥</span>
        <div className="vitals-track">
          <div
            className="vitals-fill vitals-fill--mood"
            style={{ width: `${vitals.mood}%` }}
          />
        </div>
      </div>
    </div>
  );
}
