/**
 * 空白圖板中央的提示與「新增始祖」按鈕（規格 F07）。一張圖板滿 2,000 人時按鈕停用並提示
 * （空白的圖板沒有人，通常不會滿；和工具列的「＋始祖」、人物面板的加人按鈕共用同一套判斷）。
 */
import { Plus } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/ui';
import { doAddRoot } from '../actions';
import { LIMITS } from '../model/types';
import { usePeopleFull } from '../store';
import { S } from '../strings';

export function EmptyState() {
  const full = usePeopleFull();
  const fullId = useId();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div
        data-overlay
        className="pointer-events-auto flex max-w-sm flex-col items-center gap-2.5 rounded-xl border border-border bg-surface px-6 py-7 text-center shadow-2"
      >
        <h2 className="m-0 text-lg font-semibold">{S.emptyTitle}</h2>
        <p className="m-0 text-sm leading-relaxed text-muted">{S.emptyBody}</p>
        <Button
          variant="primary"
          icon={<Plus />}
          onClick={doAddRoot}
          disabled={full}
          aria-describedby={full ? fullId : undefined}
        >
          {S.emptyAdd}
        </Button>
        {full ? (
          <p id={fullId} className="m-0 text-xs text-warning">
            {S.peopleFull(LIMITS.people)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
