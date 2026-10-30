/**
 * 搜尋與篩選（規格 F91）：工具列下方的篩選面板與「篩選中」的提示。
 * 時間軸：沒符合的淡化或藏起來；年表：只列符合的。選項只用這個檢視看得到的資料（PL 檢視不會出現 GM 專用的名稱）；
 * GM 檢視與 PL 檢視各自記住自己的篩選（PL 檢視的輸入欄不會留著 GM 檢視打的字）。
 */
import { Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { Button, Chips, Field, IconButton, Segmented, TextInput } from '@/ui';
import {
  effectiveFilter,
  type FilterState,
  filterOptions,
  type GmFilter,
  isFiltering,
  matchingIds,
} from '../model/filter';
import { clearFilter, filterOf, setFilter, setPrefs, usePrefs } from '../store';
import { S } from '../strings';
import { useVisibleDoc } from './shared';

/** 地點、角色的按鈕最多列幾個（其他的用文字搜尋） */
const MAX_CHIPS = 60;

/** 目前的檢視的篩選與符合的數目 */
export function useFilterState() {
  const vdoc = useVisibleDoc();
  const viewMode = usePrefs((s) => s.data.viewMode);
  const all = usePrefs((s) => s.data.filter);
  const filter: FilterState = useMemo(
    () => filterOf({ filter: all } as Parameters<typeof filterOf>[0], viewMode),
    [all, viewMode],
  );
  const ids = useMemo(() => matchingIds(vdoc, filter), [vdoc, filter]);
  const active = useMemo(() => isFiltering(effectiveFilter(vdoc, filter)), [vdoc, filter]);
  return { vdoc, filter, ids, active, total: vdoc.events.length };
}

const toggle = (list: readonly string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export function FilterBar() {
  const open = usePrefs((s) => s.data.filterOpen);
  const hide = usePrefs((s) => s.data.filterHide);
  const { vdoc, filter, ids, active, total } = useFilterState();
  const gmView = vdoc.audience === 'gm';
  const opts = useMemo(() => filterOptions(vdoc, S.untitled), [vdoc]);
  if (!open && !active) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="filter-bar">
      {active ? (
        <div
          role="status"
          data-testid="filter-status"
          className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-accent bg-accent-soft px-2.5 py-1.5 text-xs text-fg"
        >
          <Search aria-hidden className="size-3.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">{S.filterStatus(ids?.size ?? total, total)}</span>
          {!open ? (
            <Button size="sm" variant="ghost" onClick={() => setPrefs({ filterOpen: true })}>
              {S.filterEdit}
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" data-testid="filter-clear" onClick={clearFilter}>
            {S.filterClear}
          </Button>
        </div>
      ) : null}
      {open ? (
        <section
          aria-label={S.filterTitle}
          data-testid="filter-panel"
          className="flex max-h-[45dvh] min-w-0 flex-col gap-2.5 overflow-y-auto rounded-lg border border-border bg-surface p-3"
        >
          <div className="flex min-w-0 items-start gap-2">
            <Field label={S.filterText} className="min-w-0 flex-1">
              <TextInput
                value={filter.text}
                type="search"
                data-field="filter-text"
                placeholder={gmView ? S.filterTextHintGm : S.filterTextHint}
                onChange={(e) => setFilter({ text: e.target.value })}
              />
            </Field>
            <IconButton
              size="sm"
              variant="ghost"
              className="mt-6"
              label={S.filterClose}
              icon={<X />}
              onClick={() => setPrefs({ filterOpen: false })}
            />
          </div>
          {opts.lanes.length || opts.main ? (
            <Field label={S.filterLanes} hint={S.filterLanesHint}>
              <Chips
                aria-label={S.filterLanes}
                values={filter.lanes}
                items={[
                  ...(opts.main ? [{ value: '', label: S.main }] : []),
                  ...opts.lanes.map((l) => ({
                    value: l.id,
                    label: l.depth ? `└ ${l.name}` : l.name,
                  })),
                ]}
                onPick={(v) => setFilter({ lanes: toggle(filter.lanes, v) })}
              />
            </Field>
          ) : null}
          {opts.categories.length ? (
            <Field label={S.filterCategories}>
              <Chips
                aria-label={S.filterCategories}
                values={filter.categories}
                items={[
                  ...opts.categories.map((c) => ({ value: c.id, label: c.name })),
                  ...(opts.uncategorized ? [{ value: '', label: S.noCategory }] : []),
                ]}
                onPick={(v) => setFilter({ categories: toggle(filter.categories, v) })}
              />
            </Field>
          ) : null}
          {opts.places.length ? (
            <Field
              label={S.filterPlaces}
              hint={opts.places.length > MAX_CHIPS ? S.filterMore(MAX_CHIPS) : undefined}
            >
              <Chips
                aria-label={S.filterPlaces}
                values={filter.places}
                items={chipList(opts.places, filter.places)}
                onPick={(v) => setFilter({ places: toggle(filter.places, v) })}
              />
            </Field>
          ) : null}
          {opts.people.length ? (
            <Field
              label={S.filterPeople}
              hint={opts.people.length > MAX_CHIPS ? S.filterMore(MAX_CHIPS) : undefined}
            >
              <Chips
                aria-label={S.filterPeople}
                values={filter.people}
                items={chipList(opts.people, filter.people)}
                onPick={(v) => setFilter({ people: toggle(filter.people, v) })}
              />
            </Field>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            {gmView ? (
              <Field label={S.filterGm}>
                <Segmented<GmFilter>
                  size="sm"
                  value={filter.gm}
                  onValueChange={(v) => setFilter({ gm: v })}
                  options={[
                    { value: 'all', label: S.filterGmAll },
                    { value: 'only', label: S.filterGmOnly },
                    { value: 'none', label: S.filterGmNone },
                  ]}
                />
              </Field>
            ) : null}
            <Field label={S.filterMode} hint={S.filterModeHint}>
              <Segmented<'dim' | 'hide'>
                size="sm"
                value={hide ? 'hide' : 'dim'}
                onValueChange={(v) => setPrefs({ filterHide: v === 'hide' })}
                options={[
                  { value: 'dim', label: S.filterDim },
                  { value: 'hide', label: S.filterHide },
                ]}
              />
            </Field>
            {active ? null : <p className="m-0 pb-1 text-xs text-muted">{S.filterIdle(total)}</p>}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** 按鈕最多 MAX_CHIPS 個；已經選的一定列出來 */
function chipList(all: readonly string[], picked: readonly string[]): string[] {
  const head = all.slice(0, MAX_CHIPS);
  return [...head, ...picked.filter((p) => !head.includes(p) && all.includes(p))];
}
