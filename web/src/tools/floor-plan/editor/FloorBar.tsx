/**
 * 樓層列：每層一個分頁（按兩下改名）、新增樓層、改名、複製、左右移動、刪除。
 */
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, cn, IconButton } from '@/ui';
import { S } from '../strings';
import * as act from './actions';
import { useProject } from './store';

function RenameInput({
  index,
  initial,
  onDone,
}: {
  index: number;
  initial: string;
  onDone: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && ref.current) act.renameFloor(index, ref.current.value);
    onDone();
  };
  return (
    <input
      ref={ref}
      type="text"
      defaultValue={initial}
      maxLength={60}
      aria-label={S.floors.renameLabel}
      className="h-8 w-24 rounded-sm border border-border-strong bg-surface px-2 text-sm text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      data-testid="floor-rename"
    />
  );
}

export function FloorBar() {
  const floors = useProject((s) => s.data.floors);
  const active = useProject((s) => s.data.active);
  const [renaming, setRenaming] = useState(-1);
  const n = floors.length;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="floor-bar">
      <div role="tablist" aria-label={S.floors.label} className="flex min-w-0 flex-wrap gap-1">
        {floors.map((f, i) =>
          renaming === i ? (
            <RenameInput key={f.id} index={i} initial={f.name} onDone={() => setRenaming(-1)} />
          ) : (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={cn(
                'h-8 min-w-12 rounded-sm border px-3 text-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
                i === active
                  ? 'border-accent bg-accent-soft font-semibold text-fg'
                  : 'border-border bg-surface text-muted hover:bg-surface-3 hover:text-fg',
              )}
              onClick={() => act.switchFloor(i)}
              onDoubleClick={() => setRenaming(i)}
              data-floor={i}
            >
              {f.name || '—'}
            </button>
          ),
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus />}
        onClick={act.addFloor}
        data-testid="floor-add"
      >
        {S.floors.add}
      </Button>
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Pencil />}
          label={S.floors.rename}
          onClick={() => setRenaming(active)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Copy />}
          label={S.floors.duplicate}
          onClick={act.duplicateFloor}
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<ChevronLeft />}
          label={S.floors.left}
          disabled={active === 0}
          onClick={() => act.moveFloor(-1)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<ChevronRight />}
          label={S.floors.right}
          disabled={active === n - 1}
          onClick={() => act.moveFloor(1)}
        />
        <IconButton
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          label={S.floors.remove}
          disabled={n <= 1}
          onClick={() => void act.removeFloor()}
          data-testid="floor-remove"
        />
      </div>
    </div>
  );
}
