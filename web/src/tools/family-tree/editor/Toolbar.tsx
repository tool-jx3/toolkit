/**
 * 畫布的工具列（規格 F07、F30、F50、F55）：搜尋、拖曳方式、＋始祖、自動整列。
 */
import { LayoutGrid, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Button, Segmented, Tooltip } from '@/ui';
import { doAddRoot, doAutoArrange, doSearch } from '../actions';
import { type DragMode, setPrefs, usePrefs } from '../store';
import { S } from '../strings';

export function CanvasToolbar() {
  const dragMode = usePrefs((s) => s.data.dragMode);
  const [q, setQ] = useState('');
  return (
    <div
      role="toolbar"
      aria-label={S.canvasToolbar}
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-testid="canvas-toolbar"
    >
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
          { value: 'order', label: S.dragOrder, ariaLabel: S.dragOrderHint },
          { value: 'gap', label: S.dragGap, ariaLabel: S.dragGapHint },
        ]}
      />
      <Button size="sm" icon={<Plus />} onClick={doAddRoot} aria-label={S.addRootLabel}>
        {S.addRoot}
      </Button>
      <Tooltip content={S.autoArrangeHint}>
        <Button size="sm" icon={<LayoutGrid />} onClick={doAutoArrange}>
          {S.autoArrange}
        </Button>
      </Tooltip>
    </div>
  );
}
