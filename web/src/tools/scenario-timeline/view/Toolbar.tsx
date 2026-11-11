/**
 * 預覽欄的工具列（規格 F15、F30、F32、F50、F61、F91）：時間軸／年表、GM／PL、縮小、放大、全覽、篩選、＋事件。
 */
import { Funnel, Maximize2, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo } from 'react';
import { Button, IconButton, Segmented, Select, useMediaQuery, withShortcut } from '@/ui';
import { effectiveFilter, filterCount } from '../model/filter';
import { type Audience, povLanes } from '../model/visible';
import { BUTTON_STEP, zoomState } from '../model/window';
import { setPrefs, useDoc, usePrefs, useUi, type ViewKind } from '../store';
import { S } from '../strings';
import { addEventNow } from './actions';
import { useFilterState } from './FilterBar';
import { timelineApi } from './Timeline';

/** 目前的檢視：還沒選過時，窄畫面（< 640 px）是年表 */
export function useEffectiveView(): ViewKind {
  const view = usePrefs((s) => s.data.view);
  const wide = useMediaQuery('(min-width: 640px)', true);
  return view ?? (wide ? 'timeline' : 'chronicle');
}

const ALL = '__all';

/** PL 檢視的人物別（F118）：全體公開，或某個人物看到的（他自己的偽裝與伏字的真相） */
function PovSelect() {
  const doc = useDoc((s) => s.data);
  const pov = usePrefs((s) => s.data.pov ?? '');
  const people = useMemo(() => povLanes(doc), [doc]);
  if (!people.length) return null;
  const value = people.some((l) => l.id === pov) ? pov : ALL;
  return (
    <Select
      size="sm"
      aria-label={S.povSelect}
      value={value}
      className="w-auto max-w-[11rem]"
      data-testid="pov-select"
      onValueChange={(v) => setPrefs({ pov: v === ALL ? '' : v })}
      options={[
        { value: ALL, label: S.povAll },
        ...people.map((l) => ({ value: l.id, label: S.povOption(l.name.trim() || S.untitled) })),
      ]}
    />
  );
}

export function Toolbar() {
  const view = useEffectiveView();
  const viewMode = usePrefs((s) => s.data.viewMode);
  const mode = useDoc((s) => s.data.mode);
  const calendar = useDoc((s) => s.data.calendar);
  const era = useDoc((s) => s.data.era);
  const win = useUi((s) => s.win);
  const filterOpen = usePrefs((s) => s.data.filterOpen);
  const fs = useFilterState();
  const nFilter = filterCount(effectiveFilter(fs.vdoc, fs.filter));
  const pl = viewMode === 'pl';
  const zs = win ? zoomState(mode, win, { era, calendar }) : { canIn: true, canOut: true };
  return (
    <div
      role="toolbar"
      aria-label={S.toolbar}
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-testid="toolbar"
    >
      <Segmented<ViewKind>
        aria-label={S.view}
        size="sm"
        value={view}
        onValueChange={(v) => setPrefs({ view: v })}
        options={[
          { value: 'timeline', label: S.viewTimeline },
          { value: 'chronicle', label: S.viewChronicle },
        ]}
      />
      <Segmented<Audience>
        aria-label={S.viewMode}
        size="sm"
        value={viewMode}
        onValueChange={(v) => setPrefs({ viewMode: v })}
        options={[
          { value: 'gm', label: 'GM', ariaLabel: S.viewGm },
          { value: 'pl', label: 'PL', ariaLabel: S.viewPl },
        ]}
      />
      {pl ? <PovSelect /> : null}
      {view === 'timeline' ? (
        <div className="flex items-center gap-0.5">
          <IconButton
            size="sm"
            variant="ghost"
            label={withShortcut(S.zoomOut, '-')}
            icon={<ZoomOut />}
            disabled={!zs.canOut}
            onClick={() => timelineApi.current?.zoom(1 / BUTTON_STEP)}
            data-testid="zoom-out"
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={withShortcut(S.zoomIn, '+')}
            icon={<ZoomIn />}
            disabled={!zs.canIn}
            onClick={() => timelineApi.current?.zoom(BUTTON_STEP)}
            data-testid="zoom-in"
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={withShortcut(S.fit, '0')}
            icon={<Maximize2 />}
            onClick={() => timelineApi.current?.fit()}
            data-testid="fit"
          />
        </div>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        icon={<Funnel />}
        aria-expanded={filterOpen}
        aria-label={nFilter ? S.filterButtonN(nFilter) : S.filterButton}
        data-testid="filter-toggle"
        className={nFilter ? 'border-accent' : undefined}
        onClick={() => setPrefs({ filterOpen: !filterOpen })}
      >
        {S.filterShort}
        {nFilter ? (
          <span className="ml-0.5 rounded-full bg-accent px-1.5 text-[11px] leading-4 font-semibold text-accent-contrast tabular-nums">
            {nFilter}
          </span>
        ) : null}
      </Button>
      <Button
        size="sm"
        icon={<Plus />}
        className="ml-auto"
        disabled={pl}
        aria-label={S.addEventLabel}
        title={pl ? S.needGm : withShortcut(S.addEventLabel, 'n')}
        onClick={addEventNow}
        data-testid="add-event"
      >
        {S.addEvent}
      </Button>
    </div>
  );
}
