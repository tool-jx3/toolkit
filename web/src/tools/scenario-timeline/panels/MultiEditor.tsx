/**
 * 選了好幾個事件時的「事件」分頁（規格 F90）：選了幾個、一起改泳道／分類／GM 專用、兩個時加上關聯線、一起刪除。
 * 每個操作一步復原。PL 檢視：只顯示數目與標題（停用）。
 */
import { Link2, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Button, Field, Select } from '@/ui';
import type { VisibleDoc } from '../model/visible';
import { addLink, deleteEvents, displayOrder, select, updateEvents, useDoc } from '../store';
import { S } from '../strings';

const MAIN = '__main';
const NONE = '__none';
const MIXED = '__mixed';
const SHOWN = 6;

/** 全部一樣時那個值，不一樣時 MIXED */
function common<T>(list: readonly T[]): T | typeof MIXED {
  return list.every((x) => x === list[0]) ? list[0] : MIXED;
}

export function MultiEditor({ ids, vdoc, pl }: { ids: string[]; vdoc: VisibleDoc; pl: boolean }) {
  const doc = useDoc((s) => s.data);
  const set = new Set(ids);
  /* PL 檢視只算 PL 看得到的 */
  const events = (pl ? vdoc.events : doc.events).filter((e) => set.has(e.id));
  const lanesSrc = pl ? vdoc.lanes : doc.lanes;
  const catsSrc = pl ? vdoc.categories : doc.categories;
  const shownIds = events.map((e) => e.id);
  const lane = common(events.map((e) => e.laneId || MAIN));
  const cat = common(events.map((e) => e.categoryId || NONE));
  const gm = common(events.map((e) => (e.gm ? 'yes' : 'no')));
  const laneOptions = useMemo(
    () => [
      { value: MAIN, label: S.main },
      ...displayOrder(lanesSrc).map((l) => ({
        value: l.id,
        label: `${l.parentId ? '　' : ''}${l.name.trim() || S.untitled}${l.gm ? '（GM）' : ''}`,
      })),
    ],
    [lanesSrc],
  );
  const catOptions = useMemo(
    () => [
      { value: NONE, label: S.noCategory },
      ...catsSrc.map((c) => ({ value: c.id, label: c.name.trim() || S.untitled })),
    ],
    [catsSrc],
  );
  const mixed = { value: MIXED, label: S.multiMixed, disabled: true };
  const [a, b] = events;
  return (
    <div className="flex flex-col gap-3" data-testid="multi-editor">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-sm font-semibold text-fg" data-testid="multi-count">
          {S.multiCount(events.length)}
        </p>
        <ul className="m-0 flex list-disc flex-col pl-5 text-xs text-muted">
          {events.slice(0, SHOWN).map((e) => (
            <li key={e.id} className="truncate">
              {e.title.trim() || S.untitled}
            </li>
          ))}
          {events.length > SHOWN ? (
            <li className="list-none">{S.multiMore(events.length - SHOWN)}</li>
          ) : null}
        </ul>
        <p className="m-0 text-xs text-muted">{S.multiHint}</p>
      </div>
      <Field label={S.fLane}>
        <Select
          value={lane}
          disabled={pl}
          data-field="multi-lane"
          onValueChange={(v) => {
            if (v === MIXED) return;
            updateEvents(shownIds, (e) => {
              e.laneId = v === MAIN ? '' : v;
            });
          }}
          options={lane === MIXED ? [mixed, ...laneOptions] : laneOptions}
        />
      </Field>
      <Field label={S.fCategory}>
        <Select
          value={cat}
          disabled={pl}
          data-field="multi-category"
          onValueChange={(v) => {
            if (v === MIXED) return;
            updateEvents(shownIds, (e) => {
              e.categoryId = v === NONE ? '' : v;
            });
          }}
          options={cat === MIXED ? [mixed, ...catOptions] : catOptions}
        />
      </Field>
      {pl ? null : (
        <Field label={S.fGm} hint={S.multiGmHint}>
          <Select
            value={gm}
            data-field="multi-gm"
            onValueChange={(v) => {
              if (v === MIXED) return;
              updateEvents(shownIds, (e) => {
                e.gm = v === 'yes';
              });
            }}
            options={[
              ...(gm === MIXED ? [mixed] : []),
              { value: 'yes', label: S.multiGmYes },
              { value: 'no', label: S.multiGmNo },
            ]}
          />
        </Field>
      )}
      {!pl && events.length === 2 && a && b ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Link2 />}
            data-testid="multi-link"
            onClick={() => addLink(a.id, b.id)}
          >
            {S.multiLink(a.title.trim() || S.untitled, b.title.trim() || S.untitled)}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          disabled={pl}
          data-testid="multi-delete"
          onClick={() => deleteEvents(shownIds)}
        >
          {S.multiDelete(events.length)}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => select(null)}>
          {S.deselect}
        </Button>
      </div>
    </div>
  );
}
