/**
 * 欄位管理（F38～F41、F44）：新增欄位面板（可選欄位、自訂欄位、建立自訂欄位）、移除欄位面板、重設欄位。
 * 兩個面板同時只開一個；面板的 × 或 Esc 關閉。
 */
import { Columns3, Plus, RotateCcw, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, DialogClose, Field, IconButton, TextInput } from '@/ui';
import { COLUMN_DESCRIPTIONS, columnLabel, extraColumns } from './columns';
import { notify } from './notify';
import {
  addCustomColumnAction,
  closePanel,
  hideColumnAction,
  resetColumnsAction,
  showColumnAction,
  togglePanel,
  useLog,
  useUi,
} from './store';
import { S } from './strings';

function CustomColumnDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [label, setLabel] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setLabel('');
  }, [open]);
  const create = () => {
    const name = label.trim();
    if (!name) {
      onOpenChange(false);
      return;
    }
    addCustomColumnAction(name);
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.columns.customDialogTitle}
      description={S.columns.customDialogDesc}
      size="sm"
      initialFocus={input}
      footer={
        <>
          <DialogClose>{S.dialog.cancel}</DialogClose>
          <Button variant="primary" onClick={create} disabled={!label.trim()}>
            {S.columns.customCreateButton}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Field label={S.columns.customLabel}>
          <TextInput
            ref={input}
            value={label}
            placeholder={S.columns.customPlaceholder}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function PanelFrame({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-sm font-semibold">{title}</h3>
          <p className="m-0 text-xs text-muted">{description}</p>
        </div>
        <IconButton
          label={S.columns.close}
          icon={<X />}
          size="sm"
          variant="ghost"
          onClick={closePanel}
        />
      </div>
      {children}
    </section>
  );
}

function AddPanel() {
  const data = useLog((s) => s.data);
  const [customOpen, setCustomOpen] = useState(false);
  const shown = new Set(data.columns.map((c) => c.key));
  return (
    <PanelFrame
      title={S.columns.addTitle}
      description={S.columns.addDesc}
      testId="add-column-panel"
    >
      <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {extraColumns(data).map((col) => {
          const added = shown.has(col.key);
          const label = columnLabel(col);
          return (
            <li key={col.key}>
              <button
                type="button"
                disabled={added}
                onClick={() => showColumnAction(col)}
                aria-label={
                  added ? `${label}（${S.columns.added}）` : `${S.columns.addOne}「${label}」`
                }
                className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left hover:border-accent disabled:cursor-default disabled:opacity-60 disabled:hover:border-border"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted">
                    {COLUMN_DESCRIPTIONS[col.key] ?? S.columns.customDesc}
                  </span>
                </span>
                <span
                  className={
                    added
                      ? 'shrink-0 text-xs text-muted'
                      : 'shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent'
                  }
                >
                  {added ? S.columns.added : S.columns.addOne}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div>
        <Button size="sm" icon={<Plus />} onClick={() => setCustomOpen(true)}>
          {S.columns.customCreate}
        </Button>
      </div>
      <CustomColumnDialog open={customOpen} onOpenChange={setCustomOpen} />
    </PanelFrame>
  );
}

function RemovePanel() {
  const columns = useLog((s) => s.data.columns);
  return (
    <PanelFrame
      title={S.columns.removeTitle}
      description={S.columns.removeDesc}
      testId="remove-column-panel"
    >
      <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0 sm:grid-cols-3 xl:grid-cols-5">
        {columns
          .filter((c) => !c.locked)
          .map((c) => (
            <li key={c.key}>
              <Checkbox
                checked
                onCheckedChange={(v) => {
                  if (!v) hideColumnAction(c.key);
                }}
                label={columnLabel(c)}
              />
            </li>
          ))}
      </ul>
    </PanelFrame>
  );
}

export function ColumnTools() {
  const panel = useUi((s) => s.panel);

  /* Esc 關閉面板（F44；對話框裡的 Esc 交給對話框） */
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"],[role="alertdialog"]'))
        return;
      closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          icon={<Plus />}
          aria-expanded={panel === 'add'}
          variant={panel === 'add' ? 'primary' : 'secondary'}
          onClick={() => togglePanel('add')}
        >
          {S.columns.add}
        </Button>
        <Button
          size="sm"
          icon={<Columns3 />}
          aria-expanded={panel === 'remove'}
          variant={panel === 'remove' ? 'primary' : 'secondary'}
          onClick={() => togglePanel('remove')}
        >
          {S.columns.remove}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          onClick={() => {
            resetColumnsAction();
            notify({ title: S.columns.resetDone, tone: 'success' });
          }}
        >
          {S.columns.reset}
        </Button>
      </div>
      {panel === 'add' ? <AddPanel /> : null}
      {panel === 'remove' ? <RemovePanel /> : null}
    </div>
  );
}
