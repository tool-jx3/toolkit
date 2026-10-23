/**
 * 逐句調整（規格 F10～F15、F75～F81）：每一句的時間、文字（與翻譯）、跳到這一句、重抽、鎖定、還原、手動調整（「調整」展開的欄位）；
 * 全部重新抽位置、清除逐句調整。選取的句（預覽上點選或按「調整」）在清單裡標出、展開它的欄位。
 */
import {
  Crosshair,
  Dices,
  Eraser,
  Lock,
  LockOpen,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
} from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { LyricRow } from '@/core/lyricfx';
import { Button, cn, IconButton, Section, useConfirm, withShortcut } from '@/ui';
import {
  clearOverrides,
  rerollAll,
  rerollLine,
  revertLine,
  selectLine,
  setOverride,
  toggleLock,
} from './actions';
import { AdjustFields } from './LineAdjust';
import { seekPreview } from './Preview';
import { adjustSupport, builtLines, placementOf, styleOf } from './scene';
import { settingsNow, useSession, useSettings } from './store';
import { S } from './strings';
import { CommitInput, TimeInput } from './widgets';

const SECTION_KEY = 'lyric-fx:lines';
const readOpen = (): boolean => {
  try {
    return localStorage.getItem(`trpg-toolkit:section:${SECTION_KEY}`) !== '0';
  } catch {
    return true;
  }
};

/** 按「調整」：選取這一句、預覽跳到它完整出現的時間（再按一次取消選取） */
function toggleAdjust(row: LyricRow, offset: number): void {
  if (useSession.getState().selected === row.key) {
    selectLine(null);
    return;
  }
  selectLine(row.key, 'list');
  const pl = placementOf(settingsNow(), useSession.getState().fontTick, row.key, 0);
  seekPreview(pl ? pl.shownAt : Math.max(0, row.t + offset + 0.5));
}

const Row = memo(function Row({
  row,
  n,
  offset,
  locked,
  lockable,
  adjustable,
  adjusted,
  selected,
  disabled,
}: {
  row: LyricRow;
  n: number;
  offset: number;
  locked: boolean;
  /** 風格能鎖定（有 lock）：沒有時不顯示「鎖定」 */
  lockable: boolean;
  /** 風格支援逐句的手動調整（有 adjust）：沒有時不顯示「調整」 */
  adjustable: boolean;
  adjusted: boolean;
  selected: boolean;
  disabled: boolean;
}) {
  const skipped = row.skipped;
  const hasTr = !!(row.tr || row.original.tr);
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-1.5 border-b border-border py-2 last:border-b-0',
        selected && '-mx-2 rounded-md bg-accent-soft px-2 ring-2 ring-accent ring-inset',
      )}
      data-testid="line-row"
      data-key={row.key}
      data-skipped={skipped ?? undefined}
      data-selected={selected ? '' : undefined}
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
          {adjusted ? (
            <span className="rounded-sm bg-accent-soft px-1.5 py-0.5" data-testid="line-adjusted">
              {S.lines.adjusted}
            </span>
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
              {adjustable ? (
                <IconButton
                  size="sm"
                  variant={selected ? 'secondary' : 'ghost'}
                  label={S.lines.adjust(n)}
                  icon={<SlidersHorizontal />}
                  pressed={selected}
                  onClick={() => toggleAdjust(row, offset)}
                  data-testid="line-adjust-toggle"
                />
              ) : null}
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
      {selected && adjustable && !skipped ? (
        <AdjustFields rowKey={row.key} n={n} text={row.text} />
      ) : null}
    </li>
  );
});

export function LineList() {
  const s = useSettings((st) => st.data);
  const exporting = useSession((st) => st.exporting);
  const selected = useSession((st) => st.selected);
  const revealTick = useSession((st) => st.revealTick);
  const confirm = useConfirm();
  const built = builtLines(s);
  const rows = built.rows;
  const overrides = s.overrides;
  const editedCount = rows.filter((r) => r.edited).length;
  const lockedCount = rows.filter((r) => overrides[r.key]?.lock).length;
  const adjustedCount = rows.filter((r) => overrides[r.key]?.adjust).length;
  const anyOverride = Object.keys(overrides).length > 0;
  const lockable = !!styleOf(s).lock;
  const adjustable = Object.values(adjustSupport(s)).some(Boolean);
  const [open, setOpen] = useState(readOpen);
  const list = useRef<HTMLOListElement>(null);

  /*
   * 從預覽選取：展開這個區塊、清單自己捲到那一句。只捲清單（不用 scrollIntoView）：手機寬度時整頁是一欄，
   * 捲動頁面會讓預覽在拖曳中跑掉。
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在預覽上選取時（revealTick 變了）捲動
  useEffect(() => {
    if (!revealTick || !selected) return;
    setOpen(true);
    requestAnimationFrame(() => {
      const ol = list.current;
      const el = [...(ol?.querySelectorAll<HTMLElement>('[data-testid="line-row"]') ?? [])].find(
        (x) => x.dataset.key === selected,
      );
      if (!ol || !el) return;
      const a = ol.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      if (b.top < a.top) ol.scrollTop -= a.top - b.top;
      else if (b.bottom > a.bottom) ol.scrollTop += Math.min(b.bottom - a.bottom, b.top - a.top);
    });
  }, [revealTick]);

  return (
    <Section
      title={S.lines.section}
      description={S.lines.description}
      persistKey={SECTION_KEY}
      open={open}
      onOpenChange={setOpen}
    >
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
            {S.lines.count(editedCount, lockedCount, adjustedCount)}
          </span>
        </div>
        <p className="m-0 text-xs text-muted">
          {S.lines.rerollAllHint}　{S.lines.seed(s.seed)}
        </p>
        {rows.length ? (
          <ol
            ref={list}
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
                adjustable={adjustable}
                adjusted={!!overrides[r.key]?.adjust}
                selected={selected === r.key}
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
