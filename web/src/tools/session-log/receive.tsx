/**
 * 團期行事曆送來的團（F117）：開頁時看瀏覽器裡有沒有交接資料（@/core/sessions 的 log），有就問要不要加進表格。
 * 加入＝照匯入的規則整理（身分依自己的名字推測、識別碼、狀態）後加在最後，選取並亮起；讀完刪掉交接資料。
 * 「稍後再說」不刪，下次開頁再問。沒有交接資料時什麼都不做（紀錄簿原本的行為不變）。
 */
import { useEffect } from 'react';
import {
  clearPendingLogImport,
  logRowFromImportItem,
  primaryDate,
  readPendingLogImport,
} from '@/core/sessions';
import { useChoice, useConfirm } from '@/ui';
import { textImportColumnKeys } from './importReport';
import { existingDupKeys, finishPartialRows, sessionDupKey } from './importSheet';
import { notify } from './notify';
import { applyImport, currentSelf, useLog } from './store';
import { S } from './strings';

/** 交接資料只在開頁時檢查一次（開發模式的 StrictMode 會掛載兩次） */
let checked = false;

export function CalendarPending(): null {
  const choose = useChoice();
  const confirm = useConfirm();
  useEffect(() => {
    if (checked) return;
    checked = true;
    void (async () => {
      const payload = readPendingLogImport();
      if (payload === null) return;
      if (payload === 'broken') {
        const ok = await confirm({
          title: S.calendar.brokenTitle,
          description: S.calendar.brokenDescription,
          confirmLabel: S.calendar.brokenConfirm,
          cancelLabel: S.calendar.brokenCancel,
          danger: true,
        });
        if (ok) clearPendingLogImport();
        return;
      }
      const items = payload.items.filter((it) => it && typeof it === 'object');
      const rows = finishPartialRows(items.map(logRowFromImportItem), currentSelf());
      if (!rows.length) {
        clearPendingLogImport();
        return;
      }
      const existing = existingDupKeys(useLog.getState().data.rows);
      const dup = rows.some((r) => {
        const k = sessionDupKey(r);
        return k && existing.has(k);
      });
      const how = await choose({
        title: S.calendar.title(rows.length),
        description: (
          <span className="flex flex-col gap-1.5">
            <span>{S.calendar.lead}</span>
            <span className="flex flex-col" data-testid="calendar-pending-items">
              {rows.map((r) => (
                <span key={r.id}>{S.calendar.item(String(r.scenario ?? ''), primaryDate(r))}</span>
              ))}
            </span>
            {dup ? (
              <span className="text-warning" data-testid="calendar-pending-dup">
                {S.calendar.duplicate}
              </span>
            ) : null}
          </span>
        ),
        choices: [
          { value: 'add', label: S.calendar.add },
          { value: 'discard', label: S.calendar.discard, variant: 'danger' },
        ],
        cancelLabel: S.calendar.later,
      });
      if (how === 'discard') clearPendingLogImport();
      if (how !== 'add') return;
      applyImport({
        rows,
        target: 'append',
        columns: null,
        ensureKeys: textImportColumnKeys(rows),
      });
      clearPendingLogImport();
      notify({ title: S.calendar.added(rows.length), tone: 'success' });
    })();
  }, [choose, confirm]);
  return null;
}
