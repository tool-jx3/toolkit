/**
 * 畫布的工具列（規格 F07、F30、F50、F55）：搜尋、拖曳方式、＋始祖、自動整列。
 */
import { LayoutGrid, Plus, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, Segmented, Tooltip } from '@/ui';
import { doAddRoot, doAutoArrange, doSearch } from '../actions';
import { LIMITS } from '../model/types';
import { BoardSelect } from '../panels/BoardSection';
import { type DragMode, setPrefs, usePeopleFull, usePrefs } from '../store';
import { S } from '../strings';

export function CanvasToolbar() {
  const dragMode = usePrefs((s) => s.data.dragMode);
  const [q, setQ] = useState('');
  const full = usePeopleFull();
  const fullId = useId();
  return (
    <div
      role="toolbar"
      aria-label={S.canvasToolbar}
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-testid="canvas-toolbar"
    >
      <BoardSelect />
      <label className="relative flex min-w-0 flex-[1_1_10rem] items-center sm:flex-[0_1_14rem]">
        <Search aria-hidden className="pointer-events-none absolute left-2 size-4 text-muted" />
        <span className="sr-only">{S.search}</span>
        <input
          type="search"
          value={q}
          placeholder={S.searchPlaceholder}
          data-testid="search"
          className="h-8 w-full min-w-0 rounded-md border border-border-strong bg-bg pr-2 pl-7 text-sm text-fg outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              doSearch(q);
            }
          }}
        />
      </label>
      <Segmented<DragMode>
        aria-label={S.dragMode}
        size="sm"
        value={dragMode}
        onValueChange={(v) => setPrefs({ dragMode: v })}
        options={[
          {
            value: 'order',
            label: S.dragOrder,
            ariaLabel: S.dragModeLabel(S.dragOrder, S.dragOrderHint),
          },
          { value: 'gap', label: S.dragGap, ariaLabel: S.dragModeLabel(S.dragGap, S.dragGapHint) },
        ]}
      />
      <Button
        size="sm"
        icon={<Plus />}
        onClick={doAddRoot}
        disabled={full}
        aria-label={S.addRootLabel}
        aria-describedby={full ? fullId : undefined}
      >
        {S.addRoot}
      </Button>
      <Tooltip content={S.autoArrangeHint}>
        <Button size="sm" icon={<LayoutGrid />} onClick={doAutoArrange}>
          {S.autoArrange}
        </Button>
      </Tooltip>
      {full ? (
        <p id={fullId} className="m-0 basis-full text-xs text-warning">
          {S.peopleFull(LIMITS.people)}
        </p>
      ) : null}
    </div>
  );
}
