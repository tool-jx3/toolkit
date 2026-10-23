/**
 * PL 檢視時不能改的區塊上面的一行提示（規格 F86、D29）：「切回 GM 檢視才能編輯」。
 * 沒有按鈕（「切回 GM 檢視」的按鈕只在「人物」分頁，頁面上只有一個）。
 */
import { Lock } from 'lucide-react';
import { S } from '../strings';

export function PlLock() {
  return (
    <p data-testid="pl-lock" className="m-0 mb-2 flex items-center gap-1.5 text-xs text-muted">
      <Lock aria-hidden className="size-3.5 shrink-0" />
      {S.plNeedGm}
    </p>
  );
}
