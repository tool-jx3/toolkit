/**
 * 擲骰紀錄：新的在最上面、每筆有時間；可以收起／顯示；全部刪除前先確認。
 */
import { ChevronDown, ChevronUp, History, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button, useConfirm } from '@/ui';
import type { LogEntry } from './logic';
import { S } from './strings';

export interface LogPanelProps {
  entries: readonly LogEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
}

export function LogPanel({ entries, open, onOpenChange, onClear }: LogPanelProps) {
  const confirm = useConfirm();
  const listId = useId();
  const titleId = useId();

  const clearAll = async () => {
    if (!entries.length) return;
    const ok = await confirm({
      title: S.log.confirmTitle,
      description: S.log.confirmDescription,
      confirmLabel: S.log.confirmLabel,
      danger: true,
    });
    if (ok) onClear();
  };

  return (
    <section
      aria-labelledby={titleId}
      data-testid="log-panel"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id={titleId}
          className="m-0 flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold"
        >
          <History aria-hidden className="size-4 text-muted" />
          {S.log.title}
          <span className="font-normal text-muted tabular-nums" data-testid="log-count">
            （{S.log.count(entries.length)}）
          </span>
        </h2>
        <Button
          size="sm"
          variant="ghost"
          icon={open ? <ChevronUp /> : <ChevronDown />}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => onOpenChange(!open)}
        >
          {open ? S.log.hide : S.log.show}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 />}
          disabled={!entries.length}
          onClick={() => void clearAll()}
        >
          {S.log.clearAll}
        </Button>
      </div>
      <div id={listId} hidden={!open}>
        {entries.length ? (
          <ol
            aria-label={S.log.title}
            data-testid="log-list"
            className="m-0 flex max-h-80 list-none flex-col gap-1 overflow-y-auto p-0 font-mono text-xs"
          >
            {entries.map((e) => (
              <li key={e.id} className="flex gap-2 border-b border-border py-1 last:border-b-0">
                <span className="shrink-0 text-muted tabular-nums">[{e.time}]</span>
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{e.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-sm text-muted">{S.log.empty}</p>
        )}
        <p className="m-0 mt-2 text-xs text-muted">{S.log.note}</p>
      </div>
    </section>
  );
}
