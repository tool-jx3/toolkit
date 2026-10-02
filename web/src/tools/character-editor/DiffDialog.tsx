/**
 * 差異確認（F09～F15）：差異清單（3.2）、勾選、覆寫勾選的項目、全部覆寫、關閉不套用。
 * 每一列與每個值都帶 data-* 屬性（欄位、列名、兩側的值、標示變更的部分），測試與對等驗證直接讀。
 */
import { Button, Checkbox, cn, Dialog } from '@/ui';
import {
  type CharacterItem,
  displayValue,
  type FieldDiff,
  groupDiffs,
  type ImportDiff,
  type ImportSource,
  type ItemDiff,
  type ItemPart,
} from './logic';
import { S } from './strings';

/** 標示為變更的樣式（醒目：主色粗體＋淡底） */
const CHANGED = 'rounded-sm bg-accent-soft px-0.5 font-semibold text-accent';

function EmptyMark({ changed }: { changed: boolean }) {
  return (
    <span
      data-empty=""
      data-changed={changed || undefined}
      className={cn('italic', changed ? CHANGED : 'text-muted')}
    >
      {S.diff.empty}
    </span>
  );
}

function SideCaption({ side }: { side: 'current' | 'incoming' }) {
  return (
    <div className="mb-0.5 text-xs text-muted">
      {side === 'current' ? S.diff.current : S.diff.incoming}
    </div>
  );
}

function FieldSide({ diff, side }: { diff: FieldDiff; side: 'current' | 'incoming' }) {
  const text = displayValue(diff[side]);
  return (
    <div className="min-w-0" data-side={side}>
      <SideCaption side={side} />
      {text === null ? (
        <EmptyMark changed />
      ) : (
        <div
          data-text=""
          data-changed=""
          className={cn(
            'max-h-[120px] overflow-auto whitespace-pre-wrap break-words text-sm',
            'rounded-sm bg-accent-soft px-1 font-semibold text-accent',
          )}
        >
          {text}
        </div>
      )}
    </div>
  );
}

function Part({ part, value, changed }: { part: ItemPart; value: unknown; changed: boolean }) {
  const text = displayValue(value);
  return (
    <span data-part={part} data-changed={changed || undefined}>
      {text === null ? (
        <EmptyMark changed={changed} />
      ) : (
        <span className={cn('break-words', changed && CHANGED)}>{text}</span>
      )}
    </span>
  );
}

function ItemSide({ diff, side }: { diff: ItemDiff; side: 'current' | 'incoming' }) {
  const item: CharacterItem | null = diff[side];
  const changed = (p: ItemPart) => diff.changed.includes(p);
  return (
    <div className="min-w-0" data-side={side}>
      <SideCaption side={side} />
      {item === null ? (
        <EmptyMark changed />
      ) : (
        <dl className="m-0 grid grid-cols-1 gap-x-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-0.5">
          <dt className="text-xs leading-5 text-muted">{S.diff.parts.label}</dt>
          <dd className="m-0 min-w-0">
            <Part part="label" value={item.label} changed={changed('label')} />
          </dd>
          {diff.list === 'status' ? (
            <>
              <dt className="text-xs leading-5 text-muted">{S.diff.statusValues}</dt>
              <dd className="m-0 min-w-0">
                <Part part="value" value={item.value} changed={changed('value')} />
                <span className="text-muted"> / </span>
                <Part part="max" value={item.max} changed={changed('max')} />
              </dd>
            </>
          ) : (
            <>
              <dt className="text-xs leading-5 text-muted">{S.diff.parts.value}</dt>
              <dd className="m-0 min-w-0">
                <Part part="value" value={item.value} changed={changed('value')} />
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

function DiffRow({
  diff,
  checked,
  onToggle,
}: {
  diff: ImportDiff;
  checked: boolean;
  onToggle: () => void;
}) {
  const fieldName = diff.kind === 'field' ? S.fields[diff.field] : S.lists[diff.list].title;
  const blank = diff.kind === 'item' && diff.title === null;
  const title = diff.kind === 'field' ? fieldName : (diff.title ?? S.diff.blankLabel);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 鍵盤用列裡的勾選框操作；點整列只是滑鼠的方便（F12）
    // biome-ignore lint/a11y/noStaticElementInteractions: 同上
    <div
      data-diff-row=""
      data-diff-field={diff.kind === 'field' ? diff.field : diff.list}
      data-diff-id={diff.id}
      data-checked={checked || undefined}
      onClick={(e) => {
        if ((e.target as Element).closest('[role="checkbox"]')) return;
        onToggle();
      }}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors',
        checked ? 'border-accent bg-surface-2' : 'border-border hover:bg-surface-2',
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={diff.kind === 'field' ? fieldName : `${fieldName}：${title}`}
        className="mt-1"
      />
      <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[minmax(5rem,9rem)_minmax(0,1fr)] sm:gap-3">
        <div
          data-diff-title=""
          data-blank={blank || undefined}
          className={cn(
            'min-w-0 whitespace-pre-wrap break-words pt-0.5 text-sm font-medium',
            blank && 'text-muted',
          )}
        >
          {title}
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
          {diff.kind === 'field' ? (
            <FieldSide diff={diff} side="current" />
          ) : (
            <ItemSide diff={diff} side="current" />
          )}
          <span aria-hidden className="pt-5 text-muted">
            →
          </span>
          {diff.kind === 'field' ? (
            <FieldSide diff={diff} side="incoming" />
          ) : (
            <ItemSide diff={diff} side="incoming" />
          )}
        </div>
      </div>
    </div>
  );
}

export interface DiffDialogProps {
  source: ImportSource;
  diffs: readonly ImportDiff[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onApplySelected: () => void;
  onApplyAll: () => void;
  onClose: () => void;
}

export function DiffDialog({
  source,
  diffs,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  onApplySelected,
  onApplyAll,
  onClose,
}: DiffDialogProps) {
  const groups = groupDiffs(diffs);
  const row = (d: ImportDiff) => (
    <DiffRow key={d.id} diff={d} checked={selected.has(d.id)} onToggle={() => onToggle(d.id)} />
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={S.diff.title}
      description={S.diff.source(source)}
      size="xl"
      flush
      className="max-h-[min(760px,92dvh)]!"
      /* 強制回應：點外面不關（勾到一半的選擇不會因為誤觸而丟掉）；Esc 與關閉鈕＝不套用（F15、F41） */
      dismissOnOutside={false}
    >
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <Button size="sm" onClick={onSelectAll}>
          {S.diff.selectAll}
        </Button>
        <Button size="sm" onClick={onClear}>
          {S.diff.selectNone}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={onApplySelected}
          disabled={selected.size === 0}
        >
          {S.diff.applySelected}
        </Button>
        <Button size="sm" variant="danger" onClick={onApplyAll}>
          {S.diff.applyAll}
        </Button>
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {S.diff.count(selected.size, diffs.length)}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-4 py-3" data-testid="diff-list">
        {groups.map((g, i) =>
          g.list ? (
            <section
              key={g.list}
              aria-label={S.diff.groupAria(g.list)}
              className="flex flex-col gap-1.5 rounded-lg border border-border p-2"
              data-diff-group={g.list}
            >
              <h3 className="m-0 px-1 text-sm font-semibold">{S.lists[g.list].title}</h3>
              {g.diffs.map(row)}
            </section>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: 沒有標題的群組（一般欄位、聊天面板）只依位置區分
            <div key={i} className="flex flex-col gap-2">
              {g.diffs.map(row)}
            </div>
          ),
        )}
      </div>
    </Dialog>
  );
}
