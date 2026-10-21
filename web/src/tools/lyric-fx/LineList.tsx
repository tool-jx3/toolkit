/**
 * 逐句調整（規格 F10～F15）：每一句的時間、文字（與翻譯）、跳到這一句、重抽、鎖定、還原；全部重新抽位置、清除逐句調整。
 */
import { Crosshair, Dices, Eraser, Lock, LockOpen, RotateCcw, Shuffle } from 'lucide-react';
import { memo } from 'react';
import type { LyricRow } from '@/core/lyricfx';
import { Button, IconButton, Section, useConfirm, withShortcut } from '@/ui';
import {
  clearOverrides,
  rerollAll,
  rerollLine,
  revertLine,
  setOverride,
  toggleLock,
} from './actions';
import { seekPreview } from './Preview';
import { builtLines, styleOf } from './scene';
import { useSession, useSettings } from './store';
import { S } from './strings';
import { CommitInput, TimeInput } from './widgets';

const Row = memo(function Row({
  row,
  n,
  offset,
  locked,
  lockable,
  disabled,
}: {
  row: LyricRow;
  n: number;
  offset: number;
  locked: boolean;
  /** 風格能鎖定（有 lock）：沒有時不顯示「鎖定」 */
  lockable: boolean;
  disabled: boolean;
}) {
  const skipped = row.skipped;
  const hasTr = !!(row.tr || row.original.tr);
  return (
    <li
      className="flex min-w-0 flex-col gap-1.5 border-b border-border py-2 last:border-b-0"
      data-testid="line-row"
      data-key={row.key}
      data-skipped={skipped ?? undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="w-7 shrink-0 text-right font-mono text-xs text-muted">{n}</span>
        <TimeInput
          value={row.t}
          aria-label={S.lines.time(n)}
          className="w-24 shrink-0 font-mono"
          disabled={disabled}
          testId="line-time"
          onCommit={(v) =>
            setOverride(row.key, { t: Math.abs(v - row.original.t) < 0.005 ? undefined : v })
          }
        />
        <span className="flex min-w-0 flex-1 flex-wrap gap-1 text-xs">
          {skipped ? (
            <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-muted">
              {S.lines.skipped[skipped]}
            </span>
          ) : null}
          {row.edited ? (
            <span className="rounded-sm bg-accent-soft px-1.5 py-0.5">{S.lines.edited}</span>
          ) : null}
          {locked ? (
            <span className="rounded-sm bg-warning-soft px-1.5 py-0.5">{S.lines.locked}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <IconButton
            size="sm"
            variant="ghost"
            label={S.lines.seek(n)}
            icon={<Crosshair />}
            onClick={() => seekPreview(Math.max(0, row.t + offset - 0.5))}
          />
          {!skipped ? (
            <>
              <IconButton
                size="sm"
                variant="ghost"
                label={S.lines.reroll(n)}
                icon={<Dices />}
                disabled={disabled || locked}
                onClick={() => rerollLine(row.key)}
                data-testid="line-reroll"
              />
              {lockable || locked ? (
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={locked ? S.lines.unlock(n) : S.lines.lock(n)}
                  icon={locked ? <Lock /> : <LockOpen />}
                  pressed={locked}
                  disabled={disabled}
                  onClick={() => toggleLock(row.key)}
                  data-testid="line-lock"
                />
              ) : null}
            </>
          ) : null}
          {row.edited ? (
            <IconButton
              size="sm"
              variant="ghost"
              label={S.lines.revert(n)}
              icon={<RotateCcw />}
              disabled={disabled}
              onClick={() => revertLine(row.key)}
            />
          ) : null}
        </span>
      </div>
      <CommitInput
        value={row.text}
        aria-label={S.lines.text(n)}
        disabled={disabled}
        className={skipped ? 'opacity-60' : undefined}
        data-testid="line-text"
        onCommit={(v) => setOverride(row.key, { text: v === row.original.text ? undefined : v })}
      />
      {hasTr ? (
        <CommitInput
          value={row.tr}
          aria-label={S.lines.tr(n)}
          placeholder={S.lines.trPlaceholder}
          disabled={disabled}
          className="text-sm"
          onCommit={(v) => setOverride(row.key, { tr: v === row.original.tr ? undefined : v })}
        />
      ) : null}
    </li>
  );
});

export function LineList() {
  const s = useSettings((st) => st.data);
  const exporting = useSession((st) => st.exporting);
  const confirm = useConfirm();
  const built = builtLines(s);
  const rows = built.rows;
  const overrides = s.overrides;
  const editedCount = rows.filter((r) => r.edited).length;
  const lockedCount = rows.filter((r) => overrides[r.key]?.lock).length;
  const anyOverride = Object.keys(overrides).length > 0;
  const lockable = !!styleOf(s).lock;
  return (
    <Section title={S.lines.section} description={S.lines.description} persistKey="lyric-fx:lines">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={<Shuffle />}
            onClick={rerollAll}
            disabled={exporting}
            title={withShortcut(S.lines.rerollAll, 'g')}
            data-testid="reroll-all"
          >
            {S.lines.rerollAll}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Eraser />}
            disabled={exporting || !anyOverride}
            data-testid="clear-overrides"
            onClick={async () => {
              if (
                await confirm({
                  title: S.lines.clearTitle,
                  description: S.lines.clearText,
                  danger: true,
                })
              )
                clearOverrides();
            }}
          >
            {S.lines.clear}
          </Button>
          <span className="text-xs text-muted" data-testid="lines-summary">
            {S.lines.count(editedCount, lockedCount)}
          </span>
        </div>
        <p className="m-0 text-xs text-muted">
          {S.lines.rerollAllHint}　{S.lines.seed(s.seed)}
        </p>
        {rows.length ? (
          <ol
            className="m-0 max-h-[32rem] min-w-0 list-none overflow-y-auto rounded-md border border-border bg-surface-2 px-2"
            data-testid="line-list"
          >
            {rows.map((r, i) => (
              <Row
                key={r.key}
                row={r}
                n={i + 1}
                offset={s.lyrics.offset}
                locked={!!overrides[r.key]?.lock}
                lockable={lockable}
                disabled={exporting}
              />
            ))}
          </ol>
        ) : (
          <p className="m-0 text-sm text-muted">{S.lines.empty}</p>
        )}
      </div>
    </Section>
  );
}
