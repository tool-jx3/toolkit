/**
 * 右欄的棋子清單（規格 1.5）：標題與「確定，換下一位 NPC」、摘要、手動修改中的提示、預覽、原文的讀法、
 * 一個棋子一列的清單、加一個棋子、修改選取的棋子。
 */
import { CheckCheck, Plus, RotateCcw } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { Button, cn, Notice, revealInScroller, Section, useConfirm } from '@/ui';
import { addPiece, confirmCurrent, rebuild } from './actions';
import { type PieceView, readPieceAt, viewsOf } from './derived';
import { Editor } from './Editor';
import { Preview, SourceView } from './Preview';
import { Badge, StatusLine, Thumb } from './parts';
import { select, useDoc, useUi } from './store';
import { S } from './strings';

/** 清單的欄：行、立繪、名稱（窄畫面時狀態放在名稱下面）、狀態、聊天面板 */
const ROW_GRID =
  'grid-cols-[2rem_2rem_minmax(0,1fr)_3.5rem] sm:grid-cols-[2.5rem_2.25rem_minmax(6rem,12rem)_minmax(0,1fr)_4rem]';

function lineMark(v: PieceView): string {
  const c = v.piece;
  if (c.from === 'kept') return '✓';
  if (c.from === 'paste') return '⧉';
  return c.line ? String(c.line) : '＋';
}

function Row({
  v,
  i,
  selected,
  onKey,
}: {
  v: PieceView;
  i: number;
  selected: boolean;
  onKey: (ev: KeyboardEvent<HTMLDivElement>, i: number) => void;
}) {
  const c = v.piece;
  const faces = v.faces.filter((f) => f.image).length;
  const lines = v.commands.split('\n').filter((s) => s.trim()).length;
  const status = c.status.map((s) => `${s.label} ${s.value}${s.max ? `/${s.max}` : ''}`).join('　');
  const mark = lineMark(v);
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-index={i}
      onClick={() => select(i)}
      onKeyDown={(ev) => onKey(ev, i)}
      className={cn(
        'grid cursor-pointer items-center gap-x-2 gap-y-0.5 border-b border-border px-2 py-1.5 text-xs outline-none',
        ROW_GRID,
        'hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
        selected && 'bg-accent-soft',
      )}
      data-testid="piece"
    >
      <span
        className="text-muted tabular-nums"
        data-role="line"
        title={
          c.from === 'kept'
            ? S.markKept
            : c.from === 'paste'
              ? S.markPasted
              : c.line
                ? undefined
                : S.markHand
        }
      >
        {mark}
      </span>
      <span className="row-span-2 flex h-9 w-8 items-end justify-center self-start sm:row-span-1 sm:self-center">
        {v.portrait ? (
          <Thumb image={v.portrait} className="h-9 w-8 border-0 bg-transparent" />
        ) : null}
      </span>
      <span className="min-w-0 truncate" data-role="name">
        <span className={c.name ? 'text-fg' : 'text-muted'}>{c.name || S.noNameRow}</span>
        {!c.name ? <Badge tone="warn">{S.badgeNoName}</Badge> : null}
        {faces ? <Badge tone="accent">{S.badgeFaces(faces)}</Badge> : null}
        {v.active ? <Badge>{S.badgeBoard}</Badge> : null}
      </span>
      <span
        className="col-start-3 min-w-0 truncate text-muted sm:col-start-auto"
        data-role="status"
      >
        {status}
      </span>
      <span
        className="col-start-4 row-start-1 text-right text-muted tabular-nums sm:col-start-auto sm:row-start-auto"
        data-role="palette"
      >
        {lines ? S.paletteLines(lines) : '—'}
      </span>
    </div>
  );
}

export function ListPanel() {
  const doc = useDoc((s) => s.data);
  const confirm = useConfirm();
  const selected = useUi((s) => s.selected);
  const views = viewsOf(doc);
  const index = Math.min(selected, views.length - 1);
  const listRef = useRef<HTMLDivElement>(null);
  const view = index >= 0 ? (views[index] ?? null) : null;
  const read = index >= 0 ? readPieceAt(doc, index) : null;
  const withImage = views.filter((v) => v.portrait).length;
  const kept = doc.edited ? 0 : doc.kept.length;
  const canConfirm = !!(doc.edited || views.length > doc.kept.length);

  /* 選取改變時（鍵盤移動）讓那一列露出來 */
  useEffect(() => {
    if (index < 0) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (row && listRef.current?.contains(document.activeElement)) {
      row.focus({ preventScroll: true });
    }
    if (row) revealInScroller(row);
  }, [index]);

  const onKey = (ev: KeyboardEvent<HTMLDivElement>, i: number) => {
    const go = (j: number) => {
      ev.preventDefault();
      const k = Math.max(0, Math.min(views.length - 1, j));
      select(k);
      listRef.current?.querySelector<HTMLElement>(`[data-index="${k}"]`)?.focus();
    };
    if (ev.key === 'ArrowDown') go(i + 1);
    else if (ev.key === 'ArrowUp') go(i - 1);
    else if (ev.key === 'Home') go(0);
    else if (ev.key === 'End') go(views.length - 1);
    else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      select(i);
    }
  };

  const doRebuild = async () => {
    const title = doc.kept.length ? S.rebuildKeptTitle : S.rebuildTitle;
    if (await confirm({ title, confirmLabel: S.rebuildConfirm, danger: true })) rebuild();
  };

  const doConfirm = () => {
    if (!confirmCurrent()) return;
    const box = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="memo"], [data-testid="table"]',
    );
    box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box?.focus({ preventScroll: true });
  };

  return (
    <Section
      title={<span data-testid="list-title">{S.listTitle(views.length)}</span>}
      fixed
      actions={
        <Button
          size="sm"
          variant="primary"
          icon={<CheckCheck />}
          disabled={!canConfirm}
          onClick={doConfirm}
        >
          {S.confirm}
        </Button>
      }
    >
      {views.length ? (
        <p className="m-0 text-xs text-muted" data-testid="list-summary">
          {kept ? S.summaryKept(kept, views.length - kept) : ''}
          {S.summaryImages(withImage, views.length - withImage)}
        </p>
      ) : null}
      <p className="m-0 text-xs text-muted">{S.confirmHint}</p>
      {doc.edited ? (
        <Notice
          tone="info"
          action={
            <Button size="sm" icon={<RotateCcw />} onClick={() => void doRebuild()}>
              {S.rebuild}
            </Button>
          }
        >
          <span data-testid="edited-note">{S.edited}</span>
        </Notice>
      ) : null}
      <StatusLine area="list" />

      <Preview view={view} />
      {read ? <SourceView piece={read} /> : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <div
          aria-hidden
          className={cn(
            'grid gap-x-2 border-b border-border bg-surface-2 px-2 py-1.5 text-xs text-muted',
            ROW_GRID,
          )}
        >
          <span>{S.colLine}</span>
          <span>{S.colImage}</span>
          <span>
            {S.colName}
            <span className="sm:hidden">／{S.colStatus}</span>
          </span>
          <span className="hidden sm:block">{S.colStatus}</span>
          <span className="text-right">{S.colPalette}</span>
        </div>
        {views.length ? (
          <div
            ref={listRef}
            role="listbox"
            aria-label={S.tableLabel}
            className="max-h-[420px] overflow-y-auto"
            data-testid="piece-list"
            tabIndex={index < 0 ? 0 : -1}
            onFocus={(ev) => {
              if (ev.target === ev.currentTarget && index < 0) {
                select(0);
                requestAnimationFrame(() =>
                  listRef.current?.querySelector<HTMLElement>('[data-index="0"]')?.focus(),
                );
              }
            }}
          >
            {views.map((v, i) => (
              <Row
                // biome-ignore lint/suspicious/noArrayIndexKey: 棋子沒有 id，位置就是它的身分
                key={i}
                v={v}
                i={i}
                selected={i === index}
                onKey={onKey}
              />
            ))}
          </div>
        ) : (
          <p className="m-0 px-3 py-4 text-center text-sm text-muted" data-testid="empty-list">
            {doc.mode === 'table' ? S.emptyTable : S.emptyMemo}
          </p>
        )}
      </div>
      <div>
        <Button size="sm" icon={<Plus />} onClick={addPiece}>
          {S.addPiece}
        </Button>
      </div>

      {view ? <Editor i={index} view={view} count={views.length} /> : null}
    </Section>
  );
}
