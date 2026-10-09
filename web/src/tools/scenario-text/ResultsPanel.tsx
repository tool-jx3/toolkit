/**
 * 右欄的清單（規格 1.6～1.8）：標題列與摘要、手動修改中的提示、送出時的樣子、一則一列的清單、修改選取的一則、確定。
 */
import { ArrowDown, ArrowUp, CheckCheck, CopyPlus, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import {
  Button,
  cn,
  Field,
  Notice,
  revealInScroller,
  Section,
  Select,
  TextArea,
  TextInput,
  useConfirm,
} from '@/ui';
import {
  addEntryBelow,
  confirmBatch,
  deleteEntry,
  moveEntry,
  rebuild,
  resetEntryTitle,
  setEntryFace,
  setEntryImage,
  setEntrySpeaker,
  setEntryText,
  setEntryTitle,
} from './actions';
import { entriesOf, type ListEntry, lookupOf } from './derived';
import { Preview } from './Preview';
import { Badge, ImageSelect, StatusLine, Thumb, useImageDrop } from './parts';
import { faceMissing, findFace, imageOf, type Lookup, titleOf, withFace } from './resolve';
import { select, useDoc, useUi } from './store';
import { S } from './strings';

const NONE = '__none__';
/** 清單的欄：行、圖、標題、本文（窄畫面時本文放在標題下面） */
const ROW_GRID =
  'grid-cols-[2rem_1.75rem_minmax(0,1fr)] sm:grid-cols-[2.5rem_2rem_minmax(5rem,10rem)_minmax(0,1fr)]';

/** 目前的清單與選取（選取超出範圍時夾回來，例如復原之後） */
export function useSelection(): { list: readonly ListEntry[]; index: number } {
  const doc = useDoc((s) => s.data);
  const selected = useUi((s) => s.selected);
  const list = entriesOf(doc);
  const index = Math.min(selected, list.length - 1);
  return { list, index };
}

function Row({
  e,
  i,
  L,
  mode,
  selected,
  onKey,
}: {
  e: ListEntry;
  i: number;
  L: Lookup;
  mode: 'script' | 'heading';
  selected: boolean;
  onKey: (ev: KeyboardEvent<HTMLDivElement>, i: number) => void;
}) {
  const shown = titleOf(e, L);
  const img = imageOf(e, L);
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
      data-testid="entry"
    >
      <span className="text-muted tabular-nums" data-role="line">
        {e.line ?? '＋'}
      </span>
      <span className="row-span-2 flex h-9 w-7 items-end justify-center self-start sm:row-span-1 sm:self-center">
        {img ? <Thumb image={img} className="h-9 w-7 border-0 bg-transparent" /> : null}
      </span>
      <span className="min-w-0 truncate" data-role="title">
        <span className={shown ? 'text-fg' : 'text-muted'}>{shown || S.emptyTitle}</span>
        {e.face && shown !== withFace(e.title, e.face) ? (
          <Badge tone="accent">{S.badgeFace(e.face)}</Badge>
        ) : null}
        {e.image === 'none' ? (
          <Badge>{S.badgeNoImage}</Badge>
        ) : e.image && e.image !== 'auto' ? (
          <Badge tone="accent">{S.badgeOwnImage}</Badge>
        ) : null}
        {e.kind === 'unknown' && !e.speakerId ? <Badge tone="warn">{S.badgeUnknown}</Badge> : null}
        {faceMissing(e, L) ? <Badge tone="warn">{S.badgeFaceMissing}</Badge> : null}
        {e.kind === 'narration' ? <Badge>{S.badgeNarration[mode]}</Badge> : null}
      </span>
      <span
        className="col-start-3 min-w-0 break-all whitespace-pre-wrap sm:col-start-auto"
        data-role="text"
      >
        {e.text}
      </span>
    </div>
  );
}

function Editor({ e, i, count }: { e: ListEntry; i: number; count: number }) {
  const doc = useDoc((s) => s.data);
  const L = lookupOf(doc);
  const sp = L.speaker(e.speakerId);
  const drop = useImageDrop((id) => setEntryImage(i, id), 'list');
  const faceOptions = [
    { value: NONE, label: S.edFaceBase },
    ...(sp?.faces ?? []).filter((f) => f.label).map((f) => ({ value: f.label, label: f.label })),
    ...(e.face && !findFace(sp, e.face) ? [{ value: e.face, label: S.edFaceMissing(e.face) }] : []),
  ];
  return (
    <section
      {...drop.handlers}
      aria-label={S.editorTitle}
      data-testid="editor"
      data-over={drop.over || undefined}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3',
        drop.over && 'border-accent bg-accent-soft',
      )}
    >
      <h3 className="m-0 text-xs font-normal text-muted">{S.editorTitle}</h3>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label={S.edTitle}>
          <TextInput
            value={titleOf(e, L)}
            placeholder={S.edTitlePlaceholder}
            onChange={(ev) => setEntryTitle(i, ev.target.value)}
          />
        </Field>
        <Field label={S.edSpeaker}>
          <Select
            value={sp ? sp.id : NONE}
            onValueChange={(v) => setEntrySpeaker(i, v === NONE ? null : v)}
            options={[
              { value: NONE, label: S.edNoSpeaker },
              ...doc.speakers.map((s) => ({ value: s.id, label: s.name || S.noName })),
            ]}
          />
        </Field>
        <Field label={S.edFace}>
          <Select
            value={e.face || NONE}
            disabled={!sp}
            onValueChange={(v) => setEntryFace(i, v === NONE ? '' : v)}
            options={faceOptions}
          />
        </Field>
      </div>
      {e.titleCustom && sp ? (
        <div>
          <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={() => resetEntryTitle(i)}>
            {S.edTitleReset}
          </Button>
        </div>
      ) : null}
      <Field label={S.edImage}>
        <ImageSelect
          images={doc.images}
          value={e.image}
          onChange={(v) => setEntryImage(i, v ?? 'none')}
          label={S.edImage}
          area="list"
          lead={[
            { value: 'auto', label: S.edImageAuto },
            { value: 'none', label: S.edImageNone },
          ]}
        />
      </Field>
      <Field label={S.edText}>
        <TextArea rows={3} value={e.text} onChange={(ev) => setEntryText(i, ev.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<ArrowUp />} disabled={i <= 0} onClick={() => moveEntry(i, -1)}>
          {S.edUp}
        </Button>
        <Button
          size="sm"
          icon={<ArrowDown />}
          disabled={i >= count - 1}
          onClick={() => moveEntry(i, 1)}
        >
          {S.edDown}
        </Button>
        <Button size="sm" icon={<CopyPlus />} onClick={() => addEntryBelow(i)}>
          {S.edAdd}
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => deleteEntry(i)}>
          {S.edDelete}
        </Button>
      </div>
    </section>
  );
}

export function ResultsPanel() {
  const doc = useDoc((s) => s.data);
  const confirm = useConfirm();
  const { list, index } = useSelection();
  const L = lookupOf(doc);
  const listRef = useRef<HTMLDivElement>(null);
  const withImage = list.filter((e) => imageOf(e, L)).length;
  const entry = index >= 0 ? (list[index] ?? null) : null;

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
      const k = Math.max(0, Math.min(list.length - 1, j));
      select(k);
      listRef.current?.querySelector<HTMLElement>(`[data-index="${k}"]`)?.focus();
    };
    if (ev.key === 'ArrowDown') go(i + 1);
    else if (ev.key === 'ArrowUp') go(i - 1);
    else if (ev.key === 'Home') go(0);
    else if (ev.key === 'End') go(list.length - 1);
    else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      select(i);
    }
  };

  const doRebuild = async () => {
    if (await confirm({ title: S.rebuildTitle, confirmLabel: S.rebuildConfirm, danger: true })) {
      rebuild();
    }
  };

  return (
    <Section
      title={<span data-testid="list-title">{S.listTitle(list.length)}</span>}
      fixed
      actions={
        list.length ? (
          <span className="text-xs text-muted" data-testid="list-summary">
            {S.listSummary(withImage, list.length - withImage)}
          </span>
        ) : null
      }
    >
      {doc.edited ? (
        <Notice
          tone="info"
          action={
            <Button size="sm" icon={<RotateCcw />} onClick={() => void doRebuild()}>
              {S.rebuild}
            </Button>
          }
        >
          <span data-testid="edited-note">{S.editedNote}</span>
        </Notice>
      ) : null}

      <Preview entry={entry} />

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
            {S.colTitle}
            <span className="sm:hidden">／{S.colText}</span>
          </span>
          <span className="hidden sm:block">{S.colText}</span>
        </div>
        {list.length ? (
          <div
            ref={listRef}
            role="listbox"
            aria-label={S.tableLabel}
            className="max-h-[420px] overflow-y-auto"
            data-testid="entry-list"
            tabIndex={index < 0 ? 0 : -1}
            onFocus={(ev) => {
              /* 清單本身拿到焦點（還沒有選取）時，選第一則 */
              if (ev.target === ev.currentTarget && index < 0) {
                select(0);
                requestAnimationFrame(() =>
                  listRef.current?.querySelector<HTMLElement>('[data-index="0"]')?.focus(),
                );
              }
            }}
          >
            {list.map((e, i) => (
              <Row
                // biome-ignore lint/suspicious/noArrayIndexKey: 清單的一則沒有 id，位置就是它的身分
                key={i}
                e={e}
                i={i}
                L={L}
                mode={doc.opts.mode}
                selected={i === index}
                onKey={onKey}
              />
            ))}
          </div>
        ) : (
          <p className="m-0 px-3 py-4 text-center text-sm text-muted" data-testid="empty-list">
            {S.emptyList}
          </p>
        )}
      </div>

      {entry ? <Editor e={entry} i={index} count={list.length} /> : null}

      <StatusLine area="list" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button icon={<CheckCheck />} disabled={!list.length} onClick={() => confirmBatch()}>
          {S.confirmBatch}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{S.confirmHint}</p>
    </Section>
  );
}
