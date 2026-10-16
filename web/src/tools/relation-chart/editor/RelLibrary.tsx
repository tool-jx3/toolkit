/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 檔案庫 › 關係庫（F092；原作的 renderRelLibList、openRelVariantEdit）：條目＝一個關係概念、變體＝同一概念的不同樣式。
 * 分頁上的關係類型綁著一件變體；改了分頁上的類型就同步到其他分頁穿同一件的（model/library 的 syncLibrary）。
 */
import { Copy, FolderInput, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton, Toggle, useToast } from '@/ui';
import { sheetCtx } from '../engine/geom';
import { makeType } from '../model/factory';
import { REL_KEYS, relLibUsage } from '../model/library';
import type { Project, RelEntry, RelType, RelVariant } from '../model/types';
import {
  addRelLibVariant,
  addRelVariantToSheet,
  copyRelEntry,
  copyRelVariant,
  deleteRelEntries,
  deleteRelVariant,
  renameRelVariant,
  reorderRelEntries,
} from '../state/libActions';
import { setUi, usePrefs, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { binSheets, RenameDialog, usageText } from './CharLibrary';
import { useSheet } from './hooks';
import type { LibAction } from './LabelLibrary';
import { EntryList, type EntryRow, useThumbSize } from './LibEntries';
import { TypeSample } from './thumbs';

const R = S.relLib;
const C = S.charLib;

export const REL_ACTIONS: readonly LibAction[] = [
  { key: 'import', icon: <FolderInput />, tip: C.act.import },
  { key: 'copy', icon: <Copy />, tip: C.act.copy },
  { key: 'del', icon: <Trash2 />, tip: C.act.del, tone: 'danger' },
];

/** 變體畫成樣本用的「關係類型」 */
function variantAsType(v: RelVariant): RelType {
  const t = makeType(v.id, v.label);
  for (const k of REL_KEYS) (t as unknown as Record<string, unknown>)[k] = v[k];
  return t;
}

const relName = (v: RelVariant | undefined) =>
  (v?.label ?? '').replace(/\s*\n+\s*/g, ' ').trim() || S.relLib.unnamed;

/** 目前畫面上的條目（搜尋、只看未使用〔分頁庫也算在用，同角色庫〕） */
function visible(
  p: Pick<Project, 'relLibrary' | 'sheets' | 'sheetLib'>,
  q: string,
  unused: boolean,
) {
  const { variant, variantBin } = relLibUsage(p.sheets, binSheets(p));
  const needle = q.trim().toLowerCase();
  return p.relLibrary.filter(
    (e) =>
      (!needle || e.variants.some((v) => v.label.toLowerCase().includes(needle))) &&
      (!unused || e.variants.some((v) => !variant.get(v.id) && !variantBin.get(v.id))),
  );
}

export function RelLibList({ query }: { query: string }) {
  const p = useProject((s) => s.data);
  const sheet = useSheet();
  const grouped = usePrefs((s) => s.data.libGroup);
  const unused = useUi((u) => u.libUnused);
  const size = useThumbSize();
  const ctx = useMemo(() => sheetCtx(sheet, p.labels), [sheet, p.labels]);
  const { sheets, sheetLib } = p;
  const usage = useMemo(() => relLibUsage(sheets, binSheets({ sheetLib })), [sheets, sheetLib]);
  const bySheet = useMemo(
    () => p.sheets.map((s) => new Set(s.types.map((t) => t.lib))),
    [p.sheets],
  );
  const here = new Set(sheet.types.map((t) => t.lib));
  const rows: EntryRow[] = visible(p, query, unused).map((e) => ({
    id: e.id,
    name: relName(e.variants[0]),
    thumb: e.variants[0] ? (
      <TypeSample
        ctx={ctx}
        t={variantAsType(e.variants[0])}
        width={Math.round(size * 1.8)}
        height={size}
      />
    ) : null,
    meta: usageText(usage.entry.get(e.id) ?? 0, usage.entryBin.get(e.id) ?? 0, e.variants.length),
    onSheet: here.has(e.id),
    sheets: bySheet.flatMap((set, i) => (set.has(e.id) ? [i] : [])),
  }));
  const click = (id: number) => {
    const u = useUi.getState();
    if (u.libMode === 'import') addRelVariantToSheet(id);
    else if (u.libMode === 'copy') copyRelEntry(id);
    else if (u.libMode === 'del') {
      deleteRelEntries([id]);
      if (u.libPick === id) setUi({ libPick: null });
    } else setUi({ libPick: u.libPick === id ? null : id });
  };
  return (
    <EntryList
      rows={rows}
      sheets={p.sheets}
      grouped={grouped}
      sig={`${query}|${unused}|${grouped}`}
      empty={unused ? R.noUnused : R.empty}
      label={R.listLabel}
      onClick={click}
      onReorder={reorderRelEntries}
      onDeleteMany={(ids) => deleteRelEntries(ids)}
      groupDelText={(s, n) => (s === null ? R.groupDelUnused(n) : R.groupDelSheet(s, n))}
    />
  );
}

function RelEntryDetail({ e }: { e: RelEntry }) {
  const p = useProject((s) => s.data);
  const sheet = useSheet();
  const mode = useUi((u) => u.libMode);
  const toast = useToast();
  const [editing, setEditing] = useState<RelVariant | null>(null);
  const ctx = useMemo(() => sheetCtx(sheet, p.labels), [sheet, p.labels]);
  const usage = relLibUsage(p.sheets, binSheets(p));
  const here = new Set(sheet.types.map((t) => t.vari));
  const add = (v: RelVariant) => {
    if (!addRelVariantToSheet(e.id, v.id)) toast({ title: R.already, tone: 'info' });
  };
  const clickVariant = (v: RelVariant) => {
    if (mode === 'import') addRelVariantToSheet(e.id, v.id);
    else if (mode === 'copy') copyRelVariant(e.id, v.id);
    else if (mode === 'del') deleteRelVariant(e.id, v.id);
    else setEditing(v);
  };
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2"
      data-testid="lib-detail"
    >
      <div className="flex items-center gap-2">
        {e.variants[0] ? <TypeSample ctx={ctx} t={variantAsType(e.variants[0])} /> : null}
        <span className="min-w-0 flex-1 truncate font-semibold">{relName(e.variants[0])}</span>
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
          const bin = usage.variantBin.get(v.id) ?? 0;
          const n = (usage.variant.get(v.id) ?? 0) + bin;
          return (
            <li
              key={v.id}
              className={`flex items-center gap-2 ${n ? '' : 'opacity-60'}`}
              data-testid="lib-variant"
            >
              <TypeSample ctx={ctx} t={variantAsType(v)} width={44} height={18} />
              <button
                type="button"
                className="min-w-0 flex-1 truncate rounded-sm px-1 text-left text-sm hover:bg-surface-3"
                title={mode ? undefined : C.varEditTip}
                onClick={() => clickVariant(v)}
                data-testid="lib-variant-name"
              >
                {relName(v)}
              </button>
              {here.has(v.id) ? <span className="text-xs text-accent">✓</span> : null}
              <span
                className="text-xs text-muted tabular-nums"
                title={bin ? `${C.varCountTip} · ${C.usageBin(bin)}` : C.varCountTip}
              >
                {n}
              </span>
              <IconButton
                size="sm"
                icon={<Plus />}
                label={R.addToSheet}
                onClick={() => add(v)}
                data-testid="lib-variant-add"
              />
            </li>
          );
        })}
      </ul>
      <Button
        size="sm"
        className="self-start"
        onClick={() => addRelLibVariant(e.id)}
        data-testid="lib-add-variant"
      >
        {C.addVariant}
      </Button>
      <p className="text-xs text-muted">{R.hint}</p>
      {editing ? (
        <RenameDialog
          title={C.varEditTitle}
          note={R.varEditNote}
          value={editing.label}
          multiline={false}
          onClose={() => setEditing(null)}
          onSave={(t) => renameRelVariant(e.id, editing.id, t)}
        />
      ) : null}
    </div>
  );
}

export function RelLibSide() {
  const relLibrary = useProject((s) => s.data.relLibrary);
  const mode = useUi((u) => u.libMode);
  const pick = useUi((u) => u.libPick);
  const unused = useUi((u) => u.libUnused);
  const entry = pick !== null ? relLibrary.find((e) => e.id === pick) : undefined;
  const hint =
    mode === 'import'
      ? R.hintImport
      : mode === 'copy'
        ? R.hintCopy
        : mode === 'del'
          ? R.hintDel
          : R.hintNew;
  return (
    <div className="flex flex-col gap-2" data-testid="rellib-side">
      <p className="text-xs text-muted" data-testid="lib-hint">
        {hint}
      </p>
      <Toggle checked={unused} onCheckedChange={(v) => setUi({ libUnused: v })} label={C.unused} />
      {entry ? (
        <RelEntryDetail key={entry.id} e={entry} />
      ) : mode === null ? (
        <p className="text-xs text-muted">{R.detailHint}</p>
      ) : null}
    </div>
  );
}
