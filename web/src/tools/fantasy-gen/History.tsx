/**
 * 最近產生的紀錄：每一批一列（時間、產生器、條件、筆數、開頭幾筆），可以放回來（可以復原）或複製；清除前先確認。
 */
import { Copy, History as HistoryIcon, Trash2, Undo2 } from 'lucide-react';
import { useMemo } from 'react';
import { Button, Section, useConfirm } from '@/ui';
import { clearHistory, copyHistory, restoreHistory } from './actions';
import { partsText } from './engine';
import { sanitizeHistory, TOOL_ID } from './logic';
import { useHistory } from './store';
import { S } from './strings';

/** 「11/6 14:30」 */
export function when(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

const PREVIEW = 3;
const PREVIEW_CHARS = 40;
const short = (t: string) => {
  const line = t.split('\n')[0];
  return line.length > PREVIEW_CHARS ? `${line.slice(0, PREVIEW_CHARS)}…` : line;
};

export function History() {
  const raw = useHistory((s) => s.data.history);
  const history = useMemo(() => sanitizeHistory(raw), [raw]);
  const confirm = useConfirm();

  return (
    <Section
      title={S.history.title}
      persistKey={`${TOOL_ID}:history`}
      defaultOpen={false}
      actions={
        history.length ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            onClick={async () => {
              if (
                await confirm({
                  title: S.history.clearTitle,
                  description: S.history.clearDescription,
                  confirmLabel: S.history.clearConfirm,
                  danger: true,
                })
              )
                clearHistory();
            }}
          >
            {S.history.clear}
          </Button>
        ) : null
      }
    >
      {history.length ? (
        <ol aria-label={S.history.aria} className="m-0 flex list-none flex-col gap-2 p-0">
          {history.map((e) => {
            const time = when(e.at);
            return (
              <li
                key={e.id}
                data-testid="history-entry"
                className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface-2 p-2"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <HistoryIcon aria-hidden className="size-4 shrink-0 text-muted" />
                  <span className="text-sm font-medium text-fg tabular-nums">{time}</span>
                  <span className="min-w-0 text-sm text-muted">
                    {[e.label, e.detail, S.history.count(e.results.length)]
                      .filter(Boolean)
                      .join('・')}
                  </span>
                  <span className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Undo2 />}
                      aria-label={S.history.restoreLabel(time)}
                      onClick={() => void restoreHistory(e.id)}
                    >
                      {S.history.restore}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Copy />}
                      aria-label={S.history.copyLabel(time)}
                      onClick={() => void copyHistory(e.id)}
                    >
                      {S.history.copy}
                    </Button>
                  </span>
                </div>
                <ul className="m-0 list-none p-0 text-sm text-fg">
                  {e.results.slice(0, PREVIEW).map((r, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 紀錄裡的一批不會重排
                    <li key={i} className="break-words">
                      {short(partsText(r.parts))}
                    </li>
                  ))}
                  {e.results.length > PREVIEW ? (
                    <li className="text-muted">{S.history.more(e.results.length)}</li>
                  ) : null}
                </ul>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="m-0 text-sm text-muted">{S.history.empty}</p>
      )}
    </Section>
  );
}
