/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 檔案庫的「標籤庫」頁籤（原作的 renderLabelLibList、renderLibSide、標籤的模式與徽章）：
 * - 左欄：輸入欄（Enter＝新增；編輯模式＝覆蓋載入的標籤）、標籤顏色、說明、選中標籤的三個開關與收合、
 *   標籤與陣營框的顯示設定（F173，這張分頁）。
 * - 右欄：標籤（色點、名稱、使用人數、狀態徽章〔點＝關掉那個狀態〕），依分頁分組、搜尋、拖曳換順序（同一組內）。
 * - 模式（下方的小圓鈕）：新增未命名、編輯、隱藏、引力、陣營框、刪除。
 */
import { EyeOff, Group, Magnet, Maximize2, Minimize2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  ColorField,
  Field,
  IconButton,
  Section,
  Segmented,
  Select,
  Slider,
  TextInput,
  Toggle,
  useConfirm,
  useSortable,
} from '@/ui';
import { sheetCtx, sheetName } from '../engine/geom';
import { labelColor } from '../engine/labels';
import { charLabelIds } from '../model/charLabels';
import { LEGEND_POSITIONS } from '../model/normalize';
import { allChars } from '../model/timeline';
import type { CharEntry, ColorValue, Label, LegendPos, Sheet, SheetSettings } from '../model/types';
import {
  createLabel,
  deleteLabel,
  deleteLabels,
  editLabel,
  reorderLabels,
  setCollapsed,
  updateLabel,
  updateSettings,
} from '../state/actions';
import {
  gesture,
  holdHistory,
  type LibMode,
  releaseHistory,
  setUi,
  usePrefs,
  useProject,
  useUi,
} from '../state/store';
import { S } from '../strings';
import { FrameSelect } from './FrameUi';
import { useSheet } from './hooks';
import { kickSim } from './sim';

const L = S.labels;

/* ---------- 模式 ---------- */

export interface LibAction {
  key: 'add' | LibMode;
  icon: ReactNode;
  tip: string;
  tone?: 'danger';
}

export const LABEL_ACTIONS: readonly LibAction[] = [
  { key: 'add', icon: <Plus />, tip: L.act.add },
  { key: 'edit', icon: <Pencil />, tip: L.act.edit },
  { key: 'hide', icon: <EyeOff />, tip: L.act.hide },
  { key: 'pull', icon: <Magnet />, tip: L.act.pull },
  { key: 'zone', icon: <Group />, tip: L.act.zone },
  { key: 'del', icon: <Trash2 />, tip: L.act.del, tone: 'danger' },
];

/** 小圓鈕：新增＝馬上加；其他＝切換模式（互斥，再按＝關閉） */
export function runLabelAction(key: LibAction['key']): void {
  const u = useUi.getState();
  if (key === 'add') {
    const id = createLabel('', u.libColor);
    setUi({ libSel: u.libMode ? u.libSel : id });
    return;
  }
  const on = u.libMode !== key;
  setUi({ libMode: on ? key : null, libEdit: null });
}

/* ---------- 標籤的使用情形 ---------- */

/** 全專案掛著這個標籤的角色數（D26）、各分頁有沒有人用（時間軸分頁的每一格都算，原作 libSheetUsageMap） */
export function labelUsage(sheets: readonly Sheet[], library: readonly CharEntry[]) {
  /* 人數＝角色庫裡有幾個人掛著（任何一件變體有就算；原作的 labelUsageCount，第三批起照原作，D26） */
  const count = new Map<number, number>();
  for (const e of library) {
    const ids = new Set(e.variants.flatMap((v) => v.labels));
    for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  }
  const bySheet = sheets.map(() => new Set<number>());
  sheets.forEach((s, i) => {
    for (const c of allChars(s)) for (const id of charLabelIds(c)) bySheet[i].add(id);
  });
  return { count, bySheet };
}

/* ---------- 右欄：標籤 ---------- */

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'gap-1 px-2 py-0.5 text-xs',
  md: 'gap-1.5 px-2.5 py-1 text-sm',
  lg: 'gap-2 px-3 py-1.5 text-base',
};
const DOT: Record<'sm' | 'md' | 'lg', string> = { sm: 'size-2.5', md: 'size-3', lg: 'size-3.5' };

function Chip({
  l,
  color,
  count,
  rowProps,
  onKeyDown,
  dragging,
}: {
  l: Label;
  color: string;
  count: number;
  rowProps: object;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  dragging: boolean;
}) {
  const level = usePrefs((p) => p.data.libLevel);
  const size = usePrefs((p) => p.data.libSize);
  const sel = useUi((u) => u.libSel === l.id && u.libMode === null);
  const editing = useUi((u) => u.libEdit === l.id && u.libMode === 'edit');
  const focused = useUi((u) => u.focus?.kind === 'label' && u.focus.id === l.id);
  const badge = (key: 'hidden' | 'noPull' | 'zone', icon: ReactNode) =>
    l[key] ? (
      <button
        type="button"
        className="relative grid size-4 shrink-0 place-items-center rounded-sm text-muted hover:text-fg [&_svg]:size-3"
        title={L.badge[key]}
        aria-label={L.badge[key]}
        onClick={(e) => {
          e.stopPropagation();
          updateLabel(l.id, { [key]: false });
          kickSim(0.6);
        }}
        data-testid={`label-badge-${key}`}
      >
        {icon}
        {key === 'noPull' ? (
          <span className="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-current" aria-hidden />
        ) : null}
      </button>
    ) : null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: 要能從整顆標籤拖曳排序（按鈕不能開始拖）
    <div
      {...rowProps}
      role="button"
      tabIndex={0}
      title={level === 'min' ? `${l.text}（${L.usage(count)}）` : L.usageTip(count)}
      onKeyDown={onKeyDown}
      className={`flex max-w-full cursor-pointer select-none items-center rounded-full border ${SIZE[size]} ${
        sel || editing ? 'border-accent ring-2 ring-accent/40' : 'border-border'
      } ${focused ? 'bg-accent/15' : 'bg-surface-2'} ${l.hidden ? 'opacity-50' : ''} ${
        dragging ? 'shadow-2' : ''
      }`}
      data-testid="label-item"
      data-label-id={l.id}
    >
      <span
        className={`${DOT[size]} shrink-0 rounded-full border border-border`}
        style={{ background: color }}
        aria-hidden
      />
      {level === 'min' ? (
        <span className="sr-only">{l.text}</span>
      ) : (
        <span className="min-w-0 truncate" data-testid="label-item-text">
          {l.text}
        </span>
      )}
      {level === 'detail' ? (
        <span className="shrink-0 text-muted tabular-nums" data-testid="label-item-count">
          {count}
        </span>
      ) : null}
      {badge('hidden', <EyeOff />)}
      {badge('noPull', <Magnet />)}
      {badge('zone', <Group />)}
    </div>
  );
}

/** 刪除模式的墓碑：刪掉的標籤原地留一顆劃掉的灰晶片（版面不位移，連點不會點到遞補上來的下一顆） */
function GhostChip({ text }: { text: string }) {
  const size = usePrefs((p) => p.data.libSize);
  return (
    <span
      className={`flex max-w-full select-none items-center rounded-full border border-dashed border-border opacity-30 ${SIZE[size]}`}
      aria-hidden
      data-testid="label-ghost"
    >
      <span className="min-w-0 truncate line-through">{text}</span>
    </span>
  );
}

interface Row {
  id: number;
  text: string;
}

function ChipGroup({
  title,
  items,
  rows,
  counts,
  onDeleteGroup,
}: {
  title: string | null;
  items: Label[];
  /** 刪除模式凍結的順序（刪掉的＝墓碑）；null＝照 items */
  rows: readonly Row[] | null;
  counts: ReadonlyMap<number, number>;
  onDeleteGroup: (() => void) | null;
}) {
  const sheet = useSheet();
  const mode = useUi((u) => u.libMode);
  const ctx = useMemo(() => sheetCtx(sheet), [sheet]);
  const ids = items.map((l) => l.id);
  const click = (id: number) => {
    const u = useUi.getState();
    const l = items.find((x) => x.id === id);
    if (!l) return;
    /* 角色庫的「用標籤篩選」：挑了就回角色庫 */
    if (u.libLabelPick) {
      setUi({ libLabelFilter: id, libLabelPick: false, libTab: 'chars', libMode: null });
      return;
    }
    if (u.libMode === null) setUi({ libSel: u.libSel === id ? null : id });
    else if (u.libMode === 'edit') setUi({ libEdit: id, libColor: l.color });
    else if (u.libMode === 'del') {
      deleteLabel(id);
      if (u.libSel === id) setUi({ libSel: null });
    } else {
      const key = u.libMode === 'hide' ? 'hidden' : u.libMode === 'pull' ? 'noPull' : 'zone';
      updateLabel(id, { [key]: !l[key] });
      kickSim(0.6);
    }
  };
  const sortable = useSortable({
    count: items.length,
    axis: 'xy',
    disabled: mode !== null,
    onMove: (from, to) => reorderLabels(ids, from, to),
    onMoveStart: () => holdHistory('lib'),
    onMoveEnd: () => releaseHistory('lib'),
    onClick: (i) => click(ids[i]),
  });
  return (
    <div className="flex flex-col gap-1.5" data-testid="label-group">
      {title !== null ? (
        <div className="flex items-center gap-2 border-b border-border pb-0.5">
          <span className="min-w-0 truncate text-xs font-semibold text-muted">{title}</span>
          {onDeleteGroup ? (
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              onClick={onDeleteGroup}
              data-testid="label-group-delete"
            >
              {S.lib.groupDelAll}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {(rows ?? items).map((r) => {
          const i = ids.indexOf(r.id);
          const l = items[i];
          if (!l) return <GhostChip key={r.id} text={r.text} />;
          return (
            <Chip
              key={l.id}
              l={l}
              color={labelColor(ctx, l)}
              count={counts.get(l.id) ?? 0}
              rowProps={sortable.rowProps(i)}
              dragging={sortable.dragIndex === i}
              onKeyDown={(e) => {
                if (sortable.keyMove(i, e)) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  click(l.id);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

interface Sec {
  key: string;
  title: string | null;
  list: Label[];
  sheet: number | null;
}

export function LabelList({ query }: { query: string }) {
  const labels = useProject((s) => s.data.labels);
  const sheets = useProject((s) => s.data.sheets);
  const grouped = usePrefs((p) => p.data.labelsBySheet);
  const mode = useUi((u) => u.libMode);
  const confirm = useConfirm();
  const library = useProject((s) => s.data.library);
  const { count, bySheet } = useMemo(() => labelUsage(sheets, library), [sheets, library]);
  const frozen = useRef<{ sig: string; secs: Sec[] } | null>(null);
  const q = query.trim().toLowerCase();
  const items = q ? labels.filter((l) => l.text.toLowerCase().includes(q)) : labels;
  if (mode !== 'del') frozen.current = null;
  if (!labels.length && !frozen.current) return <p className="text-sm text-muted">{L.empty}</p>;
  if (!items.length && !frozen.current) return <p className="text-sm text-muted">{L.noMatch}</p>;
  const secs: Sec[] = [];
  if (grouped) {
    sheets.forEach((s, i) => {
      const list = items.filter((l) => bySheet[i].has(l.id));
      if (list.length) secs.push({ key: `s${s.id}`, title: sheetName(s), list, sheet: i });
    });
    const unused = items.filter((l) => !bySheet.some((b) => b.has(l.id)));
    if (unused.length)
      secs.push({ key: 'unused', title: S.lib.groupUnused, list: unused, sheet: null });
  } else secs.push({ key: 'all', title: null, list: items, sheet: null });
  /* 刪除模式：進模式（或換了搜尋、分組）時記下版面，之後刪掉的留墓碑；模式中新增的接在最後 */
  let shown: (Sec & { rows: readonly Row[] | null })[] = secs.map((s) => ({ ...s, rows: null }));
  if (mode === 'del') {
    const sig = `${q}|${grouped ? 1 : 0}`;
    if (frozen.current?.sig !== sig) frozen.current = { sig, secs };
    const live = new Map(labels.map((l) => [l.id, l]));
    const seen = new Set<number>();
    shown = frozen.current.secs.map((s) => {
      const rows = s.list.map((l) => ({ id: l.id, text: l.text }));
      for (const r of rows) seen.add(r.id);
      const list = rows.flatMap((r) => live.get(r.id) ?? []);
      return { ...s, list, rows };
    });
    const extra = items.filter((l) => !seen.has(l.id));
    if (extra.length) shown.push({ key: 'new', title: null, list: extra, sheet: null, rows: null });
  }
  return (
    <section className="flex flex-col gap-3" aria-label={L.listLabel} data-testid="label-list">
      {shown.map((s) => (
        <ChipGroup
          key={s.key}
          title={s.title}
          items={s.list}
          rows={s.rows}
          counts={count}
          onDeleteGroup={
            mode === 'del' && grouped && s.title !== null && s.list.length
              ? async () => {
                  const ok = await confirm({
                    title:
                      s.sheet === null
                        ? L.groupDelUnused(s.list.length)
                        : L.groupDelSheet(sheetName(sheets[s.sheet]), s.list.length),
                    confirmLabel: S.lib.groupDelAll,
                    danger: true,
                  });
                  if (ok) deleteLabels(s.list.map((l) => l.id));
                }
              : null
          }
        />
      ))}
    </section>
  );
}

/* ---------- 左欄 ---------- */

/** 標籤顏色：色彩欄＋「自動」 */
function LabelColor({ value, onChange }: { value: ColorValue; onChange: (v: ColorValue) => void }) {
  const sheet = useSheet();
  const auto = sheetCtx(sheet).pal.auto;
  const isAuto = value === 'auto';
  return (
    <div className="flex items-center gap-1" data-testid="label-color">
      <ColorField
        value={isAuto ? auto : value}
        onChange={onChange}
        aria-label={L.color}
        className="min-w-0 flex-1"
      />
      <button
        type="button"
        className={`shrink-0 rounded-sm border px-1.5 text-xs ${isAuto ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg'}`}
        aria-pressed={isAuto}
        onClick={() => onChange('auto')}
      >
        {L.auto}
      </button>
    </div>
  );
}

/** 這個標籤的頭像框（框庫是空的時不出現；第三批 F058） */
function LabelFrame({ l }: { l: Label }) {
  const has = useProject((s) => s.data.frames.length > 0);
  if (!has) return null;
  return (
    <Field label={S.frame.lblLabel} hint={S.frame.lblHint}>
      <FrameSelect
        kind="label"
        value={l.frame}
        onChange={(v) => updateLabel(l.id, { frame: v ?? '' })}
        testId="label-frame"
      />
    </Field>
  );
}

/** 選中的標籤：三個開關、頭像框、收合 */
function LabelDetail({ l }: { l: Label }) {
  const sheet = useSheet();
  const members = sheet.chars.filter((c) => charLabelIds(c).includes(l.id)).length;
  const collapsed = sheet.collapsed.includes(l.id);
  const flag = (key: 'hidden' | 'noPull' | 'zone', v: boolean) => {
    updateLabel(l.id, { [key]: v });
    kickSim(0.6);
  };
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2"
      data-testid="label-detail"
    >
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full border border-border"
          style={{ background: labelColor(sheetCtx(sheet), l) }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-semibold">{l.text}</span>
        <IconButton
          size="sm"
          icon={<X />}
          label={L.deselect}
          onClick={() => setUi({ libSel: null })}
        />
      </div>
      <Toggle checked={l.hidden} onCheckedChange={(v) => flag('hidden', v)} label={L.flagHidden} />
      <LabelFrame l={l} />
      <Toggle checked={!l.noPull} onCheckedChange={(v) => flag('noPull', !v)} label={L.flagPull} />
      <Toggle checked={l.zone} onCheckedChange={(v) => flag('zone', v)} label={L.flagZone} />
      {l.zone && members ? (
        <Button
          size="sm"
          className="self-start"
          icon={collapsed ? <Maximize2 /> : <Minimize2 />}
          onClick={() => setCollapsed(l.id, !collapsed)}
          data-testid="label-collapse"
        >
          {collapsed ? L.expand : L.collapse}
        </Button>
      ) : null}
      <p className="text-xs text-muted">
        {!members ? `${L.noMembersHere} ` : ''}
        {l.zone ? `${L.collapseHint} ` : ''}
        {l.hidden && !l.noPull ? L.faction : L.quickHint}
      </p>
    </div>
  );
}

export function LabelSide() {
  const labels = useProject((s) => s.data.labels);
  const mode = useUi((u) => u.libMode);
  const selId = useUi((u) => u.libSel);
  const editId = useUi((u) => u.libEdit);
  const color = useUi((u) => u.libColor);
  const grouped = usePrefs((p) => p.data.labelsBySheet);
  const [text, setText] = useState('');
  const editing = mode === 'edit' && editId !== null ? labels.find((l) => l.id === editId) : null;
  const sel = mode === null && selId !== null ? labels.find((l) => l.id === selId) : null;
  /* 編輯模式點了標籤＝文字載入輸入欄（換了編輯對象才載入，打字中不會被蓋掉） */
  const editText = editing?.text;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在換編輯對象時載入
  useEffect(() => {
    if (editText !== undefined) setText(editText);
  }, [editId]);
  const picking = useUi((u) => u.libLabelPick);
  const hint = picking
    ? S.charLib.labelPickHint
    : mode === 'edit'
      ? L.hintEdit
      : mode === 'hide'
        ? L.hintHide
        : mode === 'pull'
          ? L.hintPull
          : mode === 'zone'
            ? L.hintZone
            : mode === 'del'
              ? L.hintDel
              : L.hintNew;
  return (
    <div className="flex flex-col gap-2" data-testid="label-side">
      <TextInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={mode === 'edit' ? L.editPh : L.newPh}
        aria-label={mode === 'edit' ? L.editPh : L.newPh}
        className="h-8 text-sm"
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (editing) {
            editLabel(editing.id, text, color);
            setUi({ libEdit: null });
            setText('');
          } else if (mode !== 'edit' && text.trim()) {
            setText('');
            createLabel(text, color);
          }
        }}
        data-testid="label-new"
      />
      <Field label={L.color}>
        <LabelColor value={color} onChange={(v) => setUi({ libColor: v })} />
      </Field>
      {editing ? <LabelFrame l={editing} /> : null}
      <p className="text-xs text-muted" data-testid="label-hint">
        {hint}
        {mode === null && labels.length > 1
          ? ` ${S.lib.dragTip}${grouped ? S.lib.dragInGroup : ''}`
          : ''}
      </p>
      {sel ? <LabelDetail l={sel} /> : null}
      <LabelDisplaySettings />
    </div>
  );
}

/* ---------- 標籤與陣營框的顯示（F173，這張分頁） ---------- */

const set =
  <K extends keyof SheetSettings>(key: K) =>
  (v: SheetSettings[K]) =>
    updateSettings((s) => {
      (s as SheetSettings)[key] = v;
    });

function LabelDisplaySettings() {
  const sheet = useSheet();
  const s = sheet.settings;
  const D = S.lblDisp;
  const legendOptions = LEGEND_POSITIONS.map((v) => ({ value: v, label: S.legendPos[v] }));
  const step = (
    key: 'zoneThick' | 'zoneLink' | 'zoneLayerStep',
    label: string,
    text: (v: number) => string,
  ) => (
    <Field label={label}>
      <Slider
        min={0}
        max={10}
        step={1}
        value={s[key]}
        valueText={text}
        onChange={gesture.live((v: number) => {
          updateSettings((d) => {
            d[key] = v;
          });
        })}
        onCommit={gesture.commit}
        aria-label={label}
      />
    </Field>
  );
  return (
    <Section
      title={D.title}
      description={D.titleHint}
      persistKey="relation-chart:lib-disp"
      defaultOpen={false}
    >
      <div className="flex flex-col gap-3" data-testid="label-display">
        <Toggle
          checked={s.showLabelNodes}
          onCheckedChange={(v) => {
            set('showLabelNodes')(v);
            kickSim(0.6);
          }}
          label={D.showLabelNodes}
        />
        <p className="-mt-2 text-xs text-muted">{D.showLabelNodesHint}</p>
        <Toggle
          checked={s.showFreeLbls}
          onCheckedChange={set('showFreeLbls')}
          label={D.showFreeLbls}
        />
        <Field label={D.lblNodeScale}>
          <Slider
            min={50}
            max={200}
            step={5}
            unit="%"
            value={Math.round(s.lblNodeScale * 100)}
            onChange={gesture.live((v: number) =>
              updateSettings((d) => {
                d.lblNodeScale = v / 100;
              }),
            )}
            onCommit={gesture.commit}
            aria-label={D.lblNodeScale}
          />
        </Field>
        <Toggle
          checked={s.viewerHiddenLbls}
          onCheckedChange={set('viewerHiddenLbls')}
          label={D.viewerHiddenLbls}
        />
        <p className="-mt-2 text-xs text-muted">{D.viewerHiddenLblsHint}</p>
        <Toggle checked={s.showZones} onCheckedChange={set('showZones')} label={D.showZones} />
        <p className="-mt-2 text-xs text-muted">{D.showZonesHint}</p>
        <Toggle
          checked={s.zoneOutline}
          onCheckedChange={set('zoneOutline')}
          label={D.zoneOutline}
        />
        <Field label={D.zoneEdgeW}>
          <Slider
            min={0.5}
            max={8}
            step={0.5}
            precision={1}
            value={s.zoneEdgeW}
            onChange={gesture.live((v: number) =>
              updateSettings((d) => {
                d.zoneEdgeW = v;
              }),
            )}
            onCommit={gesture.commit}
            aria-label={D.zoneEdgeW}
          />
        </Field>
        <Field label={D.zoneFillOp}>
          <Slider
            min={2}
            max={60}
            step={1}
            unit="%"
            value={Math.round(s.zoneFillOp * 100)}
            onChange={gesture.live((v: number) =>
              updateSettings((d) => {
                d.zoneFillOp = v / 100;
              }),
            )}
            onCommit={gesture.commit}
            aria-label={D.zoneFillOp}
          />
        </Field>
        {step('zoneThick', D.zoneThick, (v) =>
          v === 0 ? D.zoneThickEnds[0] : v === 10 ? D.zoneThickEnds[1] : String(v),
        )}
        {step('zoneLink', D.zoneLink, (v) =>
          v === 0 ? D.zoneLinkEnds[0] : v === 10 ? D.zoneLinkEnds[1] : String(v),
        )}
        {step('zoneLayerStep', D.zoneLayerStep, (v) => (v === 0 ? D.zoneLayerOff : String(v)))}
        <Field label={D.zoneOverlap} hint={D.zoneOverlapHint}>
          <Segmented
            size="sm"
            value={s.zoneBlend ? 'blend' : 'solid'}
            onValueChange={(v) => set('zoneBlend')(v === 'blend')}
            options={[
              { value: 'blend', label: D.zoneBlend },
              { value: 'solid', label: D.zoneSolid },
            ]}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle
            checked={s.showLblLegend}
            onCheckedChange={set('showLblLegend')}
            label={D.showLblLegend}
          />
          <Select
            size="sm"
            value={s.lblLegendPos}
            onValueChange={(v) => set('lblLegendPos')(v as LegendPos)}
            options={legendOptions}
            aria-label={D.lblLegendPos}
            className="ml-auto w-32"
          />
        </div>
        <p className="-mt-2 text-xs text-muted">{D.lblLegendHint}</p>
      </div>
    </Section>
  );
}
