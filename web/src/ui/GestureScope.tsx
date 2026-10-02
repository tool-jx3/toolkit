/**
 * 「按下到放開算一步復原」的範圍：包住沒有 onCommit 的控制項（例如 ColorField 的調色盤），
 * 在裡面按下滑鼠／觸控時開始手勢，放開（不論放在哪裡）時結束，拖曳中的所有變更合成一步。
 *
 * React 的事件會沿著元件樹傳遞（包含 Portal 裡的彈出面板），所以調色盤彈出後的拖曳也算在裡面。
 *
 * ```tsx
 * const g = historyGesture(useSettings);
 * <GestureScope gesture={g}><ColorField value={s.color} onChange={setColor} /></GestureScope>
 * ```
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface GestureScopeProps {
  /** historyGesture(store) 的回傳值（只用到 begin、commit） */
  gesture: { begin: () => void; commit: () => void };
  children: ReactNode;
  className?: string;
}

export function GestureScope({ gesture, children, className }: GestureScopeProps) {
  const start = () => {
    gesture.begin();
    const end = () => {
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      /* 等這次放開引起的事件（含之後的 click）都處理完再結束，點色票之類的變更也算在這一步 */
      setTimeout(gesture.commit, 0);
    };
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  };
  return (
    <div className={cn('contents', className)} onPointerDownCapture={start}>
      {children}
    </div>
  );
}
