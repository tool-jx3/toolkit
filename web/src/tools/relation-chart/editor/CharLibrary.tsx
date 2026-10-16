/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 檔案庫 › 角色庫（F057；原作的 renderCharLibList、renderLibDetail、LIB_ACTIONS、openLibVariantEdit）：
 * 清單（條目）、左欄（說明、只看未使用、用標籤篩選、詳情：變體清單、改名、加到本分頁、新增變體）、
 * 三個模式（匯入當前分頁、複製、刪除）。
 */
import { Copy, FolderInput, Plus, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Dialog, IconButton, TextArea, Toggle, useToast } from '@/ui';
import { sheetCtx } from '../engine/geom';
import { charHasLabel } from '../model/charLabels';
import { makeChar } from '../model/factory';
import { charLibUsage, entryName, VARIANT_KEYS, variantName } from '../model/library';
import type { Char, CharEntry, Project, Variant } from '../model/types';
import { useImageUrls } from '../state/images';
import {
  addEntryToSheet,
  addLibVariant,
  copyEntry,
  copyVariant,
  deleteEntries,
  deleteVariant,
  renameVariant,
  reorderEntries,
} from '../state/libActions';
import { activeIndex, setUi, usePrefs, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { useSheet } from './hooks';
import type { LibAction } from './LabelLibrary';
import { EntryList, type EntryRow, useThumbSize } from './LibEntries';
import { CharThumb } from './thumbs';

const C = S.charLib;

export const CHAR_ACTIONS: readonly LibAction[] = [
  { key: 'import', icon: <FolderInput />, tip: C.act.import },
  { key: 'copy', icon: <Copy />, tip: C.act.copy },
  { key: 'del', icon: <Trash2 />, tip: C.act.del, tone: 'danger' },
];

/** 變體畫成縮圖用的「角色」 */
export function variantAsChar(e: CharEntry, v: Variant): Char {
  const c = makeChar(v.id, v.name, 0, 0, { lib: e.id, vari: v.id });
  for (const k of VARIANT_KEYS) (c as unknown as Record<string, unknown>)[k] = v[k];
  c.font = e.font;
  return c;
}

/** 角色庫用到的圖（每件變體的頭像、框庫）的網址 */
function useLibHref() {
  const library = useProject((s) => s.data.library);
  const frames = useProject((s) => s.data.frames);
  const ids = useMemo(() => {
    const out: string[] = [];
    for (const e of library) for (const v of e.variants) if (v.avatar) out.push(v.avatar.img);
    for (const f of frames) out.push(f.id);
    return out;
  }, [library, frames]);
  const urls = useImageUrls(ids);
  return (id: string) => urls.get(id) ?? null;
}

/** 目前畫面上的條目（搜尋、只看未使用、標籤篩選） */
function visibleEntries(
  p: Pick<Project, 'library' | 'sheets'>,
  q: string,
  unused: boolean,
  labelId: number | null,
): CharEntry[] {
  const { variant } = charLibUsage(p.sheets);
  const needle = q.trim().toLowerCase();
  return p.library.filter(
    (e) =>
      (!needle || e.variants.some((v) => v.name.toLowerCase().includes(needle))) &&
      (!unused || e.variants.some((v) => !variant.get(v.id))) &&
      (labelId === null || e.variants.some((v) => charHasLabel(v, labelId))),
  );
}

const usageText = (sheets: number, variants: number) =>
  [C.usage(sheets), variants > 1 ? C.variants(variants) : ''].filter(Boolean).join(' · ');

export function CharLibList({ query }: { query: string }) {
  const p = useProject((s) => s.data);
  const sheet = useSheet();
  const grouped = usePrefs((s) => s.data.libGroup);
  const unused = useUi((u) => u.libUnused);
  const labelId = useUi((u) => u.libLabelFilter);
  const size = useThumbSize();
  const href = useLibHref();
  const ctx = useMemo(
    () => sheetCtx(sheet, p.labels, { font: p.font, fonts: p.fonts, frames: p.frames }),
    [sheet, p.labels, p.font, p.fonts, p.frames],
  );
  const usage = useMemo(() => charLibUsage(p.sheets), [p.sheets]);
  const here = usage.onSheet(activeIndex(p));
  const bySheet = useMemo(
    () => p.sheets.map((s) => new Set(s.chars.map((c) => c.lib))),
    [p.sheets],
  );
  const list = visibleEntries(p, query, unused, labelId);
  const rows: EntryRow[] = list.map((e) => ({
    id: e.id,
    name: entryName(p, e),
    thumb: e.variants[0] ? (
      <CharThumb ctx={ctx} c={variantAsChar(e, e.variants[0])} href={href} size={size} />
    ) : null,
    meta: usageText(usage.entry.get(e.id) ?? 0, e.variants.length),
    onSheet: here.has(e.id),
    sheets: bySheet.flatMap((set, i) => (set.has(e.id) ? [i] : [])),
  }));
  const click = (id: number) => {
    const u = useUi.getState();
    if (u.libMode === 'import') addEntryToSheet(id);
    else if (u.libMode === 'copy') copyEntry(id);
    else if (u.libMode === 'del') {
      deleteEntries([id]);
      if (u.libPick === id) setUi({ libPick: null });
    } else setUi({ libPick: u.libPick === id ? null : id });
  };
  return (
    <EntryList
      rows={rows}
      sheets={p.sheets}
      grouped={grouped}
      sig={`${query}|${unused}|${labelId}|${grouped}`}
      empty={unused ? C.noUnused : C.empty}
      label={C.listLabel}
      onClick={click}
      onReorder={reorderEntries}
      onDeleteMany={(ids) => deleteEntries(ids)}
      groupDelText={(s, n) => (s === null ? C.groupDelUnused(n) : C.groupDelSheet(s, n))}
    />
  );
}

/* ---------- 左欄 ---------- */

/** 改變體名稱（可以換行：Shift＋Enter；Enter＝確定；可以清空） */
function RenameDialog({
  title,
  note,
  value,
  multiline,
  onClose,
  onSave,
}: {
  title: string;
  note: string;
  value: string;
  multiline: boolean;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const save = () => {
    onSave(text);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} size="sm">
      <div className="flex flex-col gap-2">
        <TextArea
          value={text}
          rows={multiline ? 2 : 1}
          aria-label={C.varEditName}
          onChange={(e) => setText(multiline ? e.target.value : e.target.value.replace(/\n/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              save();
            }
          }}
          data-testid="var-name"
        />
        <p className="text-xs text-muted">{note}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{S.layout.cancel}</Button>
          <Button variant="primary" onClick={save} data-testid="var-name-ok">
            {S.rich.linkOk}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export { RenameDialog };

function EntryDetail({ e }: { e: CharEntry }) {
  const p = useProject((s) => s.data);
  const sheet = useSheet();
  const mode = useUi((u) => u.libMode);
  const href = useLibHref();
  const [editing, setEditing] = useState<Variant | null>(null);
  const ctx = useMemo(
    () => sheetCtx(sheet, p.labels, { font: p.font, fonts: p.fonts, frames: p.frames }),
    [sheet, p.labels, p.font, p.fonts, p.frames],
  );
  const usage = charLibUsage(p.sheets);
  const here = new Set(sheet.chars.map((c) => c.vari));
  const clickVariant = (v: Variant) => {
    if (mode === 'import') addEntryToSheet(e.id, v.id);
    else if (mode === 'copy') copyVariant(e.id, v.id);
    else if (mode === 'del') deleteVariant(e.id, v.id);
    else setEditing(v);
  };
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2"
      data-testid="lib-detail"
    >
      <div className="flex items-center gap-2">
        {e.variants[0] ? (
          <CharThumb ctx={ctx} c={variantAsChar(e, e.variants[0])} href={href} size={36} />
        ) : null}
        <span className="min-w-0 flex-1 truncate font-semibold">{entryName(p, e)}</span>
        <span
          className="rounded-full bg-surface-3 px-2 text-xs tabular-nums"
          title={C.detailVariants}
        >
          {e.variants.length}
        </span>
        <IconButton
          size="sm"
          icon={<X />}
          label={S.labels.deselect}
          onClick={() => setUi({ libPick: null })}
        />
      </div>
      <p className="text-xs text-muted">{C.varList}</p>
      <ul className="flex flex-col gap-1">
        {e.variants.map((v) => {
          const n = usage.variant.get(v.id) ?? 0;
          return (
            <li
              key={v.id}
              className={`flex items-center gap-2 ${n ? '' : 'opacity-60'}`}
              data-testid="lib-variant"
            >
              <CharThumb ctx={ctx} c={variantAsChar(e, v)} href={href} size={28} />
              <button
                type="button"
                className="min-w-0 flex-1 truncate rounded-sm px-1 text-left text-sm hover:bg-surface-3"
                title={mode ? undefined : C.varEditTip}
                onClick={() => clickVariant(v)}
                data-testid="lib-variant-name"
              >
                {variantName(e, v)}
              </button>
              {here.has(v.id) ? <span className="text-xs text-accent">✓</span> : null}
              <span className="text-xs text-muted tabular-nums" title={C.varCountTip}>
                {n}
              </span>
              <IconButton
                size="sm"
                icon={<Plus />}
                label={C.addToSheet}
                onClick={() => addEntryToSheet(e.id, v.id)}
                data-testid="lib-variant-add"
              />
            </li>
          );
        })}
      </ul>
      <Button
        size="sm"
        className="self-start"
        onClick={() => addLibVariant(e.id)}
        data-testid="lib-add-variant"
      >
        {C.addVariant}
      </Button>
      {editing ? (
        <RenameDialog
          title={C.varEditTitle}
          note={C.varEditNote}
          value={editing.name}
          multiline
          onClose={() => setEditing(null)}
          onSave={(t) => renameVariant(e.id, editing.id, t)}
        />
      ) : null}
    </div>
  );
}

export function CharLibSide() {
  const library = useProject((s) => s.data.library);
  const labels = useProject((s) => s.data.labels);
  const mode = useUi((u) => u.libMode);
  const pick = useUi((u) => u.libPick);
  const unused = useUi((u) => u.libUnused);
  const labelId = useUi((u) => u.libLabelFilter);
  const toast = useToast();
  const entry = pick !== null ? library.find((e) => e.id === pick) : undefined;
  const label = labelId !== null ? labels.find((l) => l.id === labelId) : undefined;
  const hint =
    mode === 'import'
      ? C.hintImport
      : mode === 'copy'
        ? C.hintCopy
        : mode === 'del'
          ? C.hintDel
          : C.hintNew;
  return (
    <div className="flex flex-col gap-2" data-testid="charlib-side">
      <p className="text-xs text-muted" data-testid="lib-hint">
        {hint}
      </p>
      <div title={C.unusedTip}>
        <Toggle
          checked={unused}
          onCheckedChange={(v) => setUi({ libUnused: v })}
          label={C.unused}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          icon={<Tag />}
          title={C.labelFilterTip}
          variant={label ? 'primary' : 'secondary'}
          aria-pressed={label !== undefined}
          onClick={() => {
            if (label) setUi({ libLabelFilter: null });
            else if (!labels.length) toast({ title: S.labels.empty, tone: 'info' });
            else setUi({ libLabelPick: true, libTab: 'labels', libMode: null });
          }}
          data-testid="lib-label-filter"
        >
          {label ? C.labelFilterOn(label.text) : C.labelFilter}
        </Button>
      </div>
      {entry ? (
        <EntryDetail key={entry.id} e={entry} />
      ) : mode === null ? (
        <p className="text-xs text-muted">{C.detailHint}</p>
      ) : null}
    </div>
  );
}
