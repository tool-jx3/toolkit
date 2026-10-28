/**
 * 色票櫃（規格 1.1）：設定欄（角色的新增、範例、從立繪補取色、全部清除；總覽櫃的排序、分組、每列幾位、
 * 顯示名字／代表色）與預覽欄（圓形頭像的格子：點頭像編輯、點色塊複製色碼、拖曳卡片調整順序；整櫃存成 PNG）。
 */
import { Download, Eraser, ImagePlus, Pipette, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadAssetBitmaps, useAssetBitmaps } from '@/core/assets';
import { COLOR_FAMILY_SWATCHES } from '@/core/colornames';
import { copyText, downloadBlob, fileNameWithExt, pickFiles } from '@/core/files';
import {
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogClose,
  Field,
  Notice,
  NumberInput,
  Section,
  Segmented,
  Select,
  Toggle,
  Tooltip,
  useChoice,
  useSortable,
  useToast,
} from '@/ui';
import { AvatarThumb } from './Avatar';
import {
  colorLabel,
  copyTextOf,
  dateStamp,
  familyOf,
  groupCharacters,
  isGrouped,
  type KeyRole,
  type PartColor,
  roleColors,
  roomLeft,
  sortCharacters,
} from './characters';
import { openEditor, startJob } from './flow';
import { type Bar, type FamilyKey, imageIds, LIMITS, MAX_BARS, type ShelfSort } from './logic';
import { saveProjectNow } from './project';
import { CHECKER_CSS } from './RoleSlots';
import { SAMPLES, sampleBar, sampleImage } from './samples';
import { chipsOf, familyLabel, renderShelfPng } from './shelfRender';
import { actions, assets, settingsNow, shelfOf, useSettings } from './store';
import { S } from './strings';

const SORTS: ShelfSort[] = ['hair', 'eye', 'light', 'name', 'manual'];

const nameOf = (bar: Bar, i: number) => (bar.name ?? '').trim() || S.characterN(i + 1);

/* ---------- 設定欄 ---------- */

export function ShelfSettings({
  onStatus,
}: {
  onStatus: (s: { tone: 'success' | 'warning' | 'danger'; text: string } | null) => void;
}) {
  const bars = useSettings((s) => s.data.bars);
  const shelf = useSettings((s) => shelfOf(s.data));
  const choose = useChoice();
  const toast = useToast();
  const [refillOpen, setRefillOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const n = bars.length;

  const addFiles = async () => {
    const files = await pickFiles({ accept: 'image/*', multiple: true });
    if (files.length) startJob({ kind: 'add', files });
  };

  const loadSamples = async () => {
    const room = roomLeft(settingsNow().bars);
    if (!room) {
      toast({ title: S.samplesFull, tone: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const list: Bar[] = [];
      for (const spec of SAMPLES.slice(0, room)) {
        const blob = await sampleImage(spec);
        const r = await assets.add(blob);
        list.push(sampleBar(spec, { id: r.id, width: 600, height: 800 }));
      }
      actions.addCharacters(list);
      toast({ title: S.samplesLoaded(list.length), tone: 'success' });
    } finally {
      setLoading(false);
    }
  };

  const clearAll = async () => {
    const v = await choose({
      title: S.clearTitle,
      description: S.clearDesc(n),
      choices: [
        { value: 'save', label: S.clearSave, variant: 'secondary' },
        { value: 'clear', label: S.clearConfirm, variant: 'danger' },
      ],
    });
    if (v === 'save') {
      await saveProjectNow();
      return;
    }
    if (v !== 'clear') return;
    actions.clearCharacters();
    onStatus({ tone: 'success', text: S.cleared });
  };

  return (
    <>
      <Section
        title={
          <>
            {S.sectionCharacters}{' '}
            <span
              className="text-xs font-normal text-muted tabular-nums"
              data-testid="character-count"
            >
              {S.characterCount(n, MAX_BARS)}
            </span>
          </>
        }
        fixed
        description={S.addCharactersHint}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={<ImagePlus />}
            disabled={n >= MAX_BARS}
            title={n >= MAX_BARS ? S.listFull(MAX_BARS) : undefined}
            onClick={() => void addFiles()}
          >
            {S.addCharacters}
          </Button>
          <Button
            icon={<Sparkles />}
            loading={loading}
            disabled={n >= MAX_BARS}
            onClick={() => void loadSamples()}
          >
            {S.loadSamples}
          </Button>
          <Button
            icon={<Pipette />}
            disabled={!bars.some((b) => b.image)}
            onClick={() => setRefillOpen(true)}
          >
            {S.refill}
          </Button>
          <Button variant="danger" icon={<Eraser />} disabled={!n} onClick={() => void clearAll()}>
            {S.clearAll}
          </Button>
        </div>
      </Section>
      <Section title={S.sectionShelf} fixed>
        <Field label={S.sort} hint={S.sortHints[shelf.sort]}>
          <Select<ShelfSort>
            value={shelf.sort}
            onValueChange={(sort) => actions.patchShelf({ sort })}
            options={SORTS.map((v) => ({ value: v, label: S.sortLabels[v] }))}
          />
        </Field>
        <Field label={S.group} hint={S.groupHint} layout="inline">
          <Toggle
            checked={shelf.group}
            disabled={shelf.sort !== 'hair' && shelf.sort !== 'eye'}
            onCheckedChange={(group) => actions.patchShelf({ group })}
          />
        </Field>
        <Field label={S.columns} hint={S.columnsHint}>
          <NumberInput
            value={shelf.columns}
            onChange={(columns) => actions.patchShelf({ columns })}
            min={LIMITS.shelfColumns.min}
            max={LIMITS.shelfColumns.max}
            step={1}
          />
        </Field>
        <Field label={S.showNames} layout="inline">
          <Toggle
            checked={shelf.showNames}
            onCheckedChange={(showNames) => actions.patchShelf({ showNames })}
          />
        </Field>
        <Field label={S.showTheme} layout="inline">
          <Toggle
            checked={shelf.showTheme}
            onCheckedChange={(showTheme) => actions.patchShelf({ showTheme })}
          />
        </Field>
      </Section>
      {refillOpen ? <RefillDialog onClose={() => setRefillOpen(false)} /> : null}
    </>
  );
}

/** 從立繪補取色：選部位與角色 */
function RefillDialog({ onClose }: { onClose: () => void }) {
  const bars = useSettings((s) => s.data.bars);
  const { bitmaps } = useAssetBitmaps(assets, imageIds({ bars }));
  const [role, setRole] = useState<KeyRole>('eye');
  const usable = bars.filter((b) => b.image);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(usable.filter((b) => !roleColors(b, 'eye').length).map((b) => b.id)),
  );
  const all = usable.length > 0 && usable.every((b) => picked.has(b.id));
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={S.refillTitle}
      description={S.refillDesc}
      size="lg"
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button
            variant="primary"
            disabled={!picked.size}
            onClick={() => {
              const ids = bars.filter((b) => picked.has(b.id)).map((b) => b.id);
              onClose();
              startJob({ kind: 'refill', role, ids });
            }}
          >
            {S.refillStart(picked.size)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<KeyRole>
            aria-label={S.refillRole}
            value={role}
            onValueChange={(r) => {
              setRole(r);
              setPicked(new Set(usable.filter((b) => !roleColors(b, r).length).map((b) => b.id)));
            }}
            options={[
              { value: 'hair', label: S.roles.hair },
              { value: 'eye', label: S.roles.eye },
            ]}
          />
          <Button
            size="sm"
            disabled={!usable.length}
            onClick={() => setPicked(all ? new Set() : new Set(usable.map((b) => b.id)))}
          >
            {all ? S.refillNone : S.refillAll}
          </Button>
        </div>
        {usable.length ? null : <p className="m-0 text-sm text-muted">{S.refillEmpty}</p>}
        <ul
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 p-0"
          aria-label={S.refillPick}
        >
          {bars.map((b, i) => {
            const has = roleColors(b, role).length > 0;
            return (
              <li key={b.id}>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-1.5 text-sm',
                    b.image ? 'border-border' : 'border-dashed border-border opacity-60',
                    picked.has(b.id) && 'border-accent bg-accent-soft',
                  )}
                  title={b.image ? undefined : S.refillNoImage}
                >
                  <Checkbox
                    checked={picked.has(b.id)}
                    disabled={!b.image}
                    className="min-w-0 flex-1"
                    onCheckedChange={(v) =>
                      setPicked((p) => {
                        const next = new Set(p);
                        if (v) next.add(b.id);
                        else next.delete(b.id);
                        return next;
                      })
                    }
                    label={
                      <span className="flex min-w-0 items-center gap-2">
                        <AvatarThumb
                          bar={b}
                          bitmap={b.image ? (bitmaps.get(b.image.id) ?? null) : null}
                          size={32}
                        />
                        <span className="min-w-0 flex-1 truncate">{nameOf(b, i)}</span>
                        {has ? (
                          <span className="shrink-0 text-xs text-muted">{S.refillHas}</span>
                        ) : null}
                      </span>
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}

/* ---------- 預覽欄：總覽櫃 ---------- */

function Chip({
  role,
  colors,
  label,
}: {
  role: 'hair' | 'eye' | 'theme';
  colors: PartColor[];
  label: string;
}) {
  const toast = useToast();
  const base = 'block size-6 rounded-full border border-black/15';
  const shape = role === 'theme' ? 'rounded-md' : 'rounded-full';
  if (!colors.length)
    return (
      <span
        role="img"
        aria-label={S.chipEmpty(label)}
        title={S.chipEmpty(label)}
        className={cn('block size-6 border-[1.5px] border-dashed border-border-strong', shape)}
        data-chip={role}
        data-empty
      />
    );
  const text = copyTextOf(colors);
  const codes = colors.map((c) => colorLabel(c, S.noneLabel)).join(' / ');
  const bg =
    colors.length === 1
      ? colors[0].none
        ? CHECKER_CSS
        : colors[0].color
      : `linear-gradient(90deg, ${colors
          .map((c, i) => {
            const v = c.none ? '#e5e5e5' : c.color;
            return `${v} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`;
          })
          .join(', ')})`;
  return (
    <Tooltip content={`${label}：${codes}`}>
      <button
        type="button"
        aria-label={text ? S.chipCopy(label, text) : S.chipNone(label)}
        className={cn(
          base,
          shape,
          'outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-focus',
        )}
        style={{ background: bg }}
        data-chip={role}
        data-codes={text ?? ''}
        onClick={async () => {
          if (!text) {
            toast({ title: S.nothingToCopy, tone: 'info', replace: true });
            return;
          }
          const ok = await copyText(text);
          toast(
            ok
              ? { title: S.copied, description: text, tone: 'success', replace: true }
              : { title: S.copyFailed, tone: 'danger', replace: true },
          );
        }}
      />
    </Tooltip>
  );
}

/** 色系小標前的圓點 */
function FamilyDot({ family }: { family: FamilyKey | null }) {
  const style =
    family && family !== 'twotone' && family !== 'oddeye' && family !== 'other'
      ? { background: COLOR_FAMILY_SWATCHES[family] }
      : family === 'twotone'
        ? { background: 'linear-gradient(90deg, #d94040 50%, #3f86e0 50%)' }
        : family === 'oddeye'
          ? { background: 'linear-gradient(90deg, #3f86e0 50%, #e8b33c 50%)' }
          : undefined;
  return (
    <span
      aria-hidden
      className={cn(
        'block size-3.5 shrink-0 rounded-full',
        style ? 'border border-black/15' : 'border-[1.5px] border-dashed border-border-strong',
      )}
      style={style}
    />
  );
}

/**
 * 卡片上直接改名字：Enter 或離開欄位時套用（記一步復原），Esc 還原成原本的名字。
 * 沒有名字時顯示「未命名」（淡色的提示字，存成圖片時也寫「未命名」）。
 */
function NameField({ bar, label }: { bar: Bar; label: string }) {
  const saved = bar.name ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  /* Enter 之後的離開欄位不要再套用一次 */
  const pending = useRef<string | null>(null);
  const commit = () => {
    const next = pending.current;
    pending.current = null;
    setDraft(null);
    if (next !== null && next !== saved) actions.patchCharacter(bar.id, { name: next });
  };
  return (
    <input
      type="text"
      aria-label={S.shelfNameLabel(label)}
      value={draft ?? saved}
      placeholder={S.unnamed}
      maxLength={LIMITS.name}
      autoComplete="off"
      spellCheck={false}
      title={saved.trim() || S.unnamed}
      className="w-full min-w-0 truncate rounded-sm border border-transparent bg-transparent px-1 text-center text-xs text-fg outline-none placeholder:text-muted hover:border-border focus:border-accent focus:bg-surface"
      onChange={(e) => {
        pending.current = e.target.value;
        setDraft(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          /* 還原，不關掉其他東西 */
          e.preventDefault();
          e.stopPropagation();
          pending.current = null;
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      onBlur={commit}
    />
  );
}

const chipLabel = (role: 'hair' | 'eye' | 'theme') =>
  role === 'theme' ? S.themeColor : S.roles[role];

export function ShelfPreview({
  status,
  onStatus,
}: {
  status: { tone: 'success' | 'warning' | 'danger'; text: string } | null;
  onStatus: (s: { tone: 'success' | 'warning' | 'danger'; text: string } | null) => void;
}) {
  const bars = useSettings((s) => s.data.bars);
  const shelf = useSettings((s) => shelfOf(s.data));
  const { bitmaps, missing } = useAssetBitmaps(assets, imageIds({ bars }));
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const sorted = useMemo(() => sortCharacters(bars, shelf.sort), [bars, shelf.sort]);
  const groups = useMemo(
    () => groupCharacters(sorted, shelf.sort, shelf.group),
    [sorted, shelf.sort, shelf.group],
  );
  const grouped = isGrouped(shelf.sort, shelf.group);
  const flat = groups.flatMap((g) => g.bars);
  const role: KeyRole = shelf.sort === 'eye' ? 'eye' : 'hair';
  const indexOf = new Map(bars.map((b, i) => [b.id, i]));

  const sortable = useSortable({
    count: flat.length,
    axis: 'xy',
    mode: 'drop',
    /* 放在卡片之間的空白、櫃子外面＝不移動；拖曳中按 Esc 取消 */
    cancelOnGap: true,
    escapeCancels: true,
    onMove: (from, to) => {
      const ids = flat.map((b) => b.id);
      const [m] = ids.splice(from, 1);
      ids.splice(to, 0, m);
      actions.setOrder(ids);
      if (shelfOf(settingsNow()).sort !== 'manual') {
        actions.patchShelf({ sort: 'manual' });
        toast({ title: S.shelfMovedManual, tone: 'info', replace: true });
      }
    },
    onClick: (i) => {
      const b = flat[i];
      if (b) openEditor(b.id);
    },
  });

  useEffect(() => {
    if (status) {
      const t = setTimeout(() => onStatus(null), 8000);
      return () => clearTimeout(t);
    }
  }, [status, onStatus]);

  const save = async () => {
    if (!bars.length) {
      onStatus({ tone: 'warning', text: S.nothingToSave });
      return;
    }
    setSaving(true);
    try {
      const map = await loadAssetBitmaps(assets, imageIds({ bars }));
      const out = await renderShelfPng(bars, shelf, map);
      const name = fileNameWithExt(`${S.shelfFile}_${dateStamp()}`, 'png');
      downloadBlob(out.blob, name);
      onStatus({ tone: 'success', text: S.savedFile(name, out.width, out.height) });
    } catch {
      onStatus({ tone: 'danger', text: S.saveFailedImage });
    } finally {
      setSaving(false);
    }
  };

  /*
   * 不分組：一個格子（每列幾位＝自動時依寬度排）；分組：每個色系一個方塊、方塊依序排開（一位的色系不會佔一整列），
   * 方塊裡每列最多「每列幾位」位（自動時能排幾位就排幾位）
   */
  const gridStyle = grouped
    ? shelf.columns
      ? { gridTemplateColumns: `repeat(${shelf.columns}, 6.5rem)` }
      : undefined
    : shelf.columns
      ? { gridTemplateColumns: `repeat(${shelf.columns}, minmax(0, 1fr))` }
      : { gridTemplateColumns: 'repeat(auto-fill, minmax(6.5rem, 1fr))' };

  let k = 0;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section
        className="min-h-48 rounded-lg border border-border bg-surface p-3"
        aria-label={S.shelfLabel}
        data-testid="shelf"
        data-sort={shelf.sort}
      >
        {!bars.length ? (
          <p className="m-0 py-10 text-center text-sm text-muted">{S.shelfEmpty}</p>
        ) : (
          <div className={grouped ? 'flex flex-wrap items-start gap-3' : 'flex flex-col'}>
            {groups.map((g) => (
              <section
                key={`${g.family ?? 'none'}-${g.bars[0]?.id}`}
                aria-label={grouped ? familyLabel(g.family, role) : undefined}
                data-group={grouped ? (g.family ?? 'none') : undefined}
                className={
                  grouped
                    ? 'flex min-w-0 max-w-full flex-col gap-2 rounded-lg border border-border p-2'
                    : undefined
                }
              >
                {grouped ? (
                  <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-fg">
                    <FamilyDot family={g.family} />
                    {familyLabel(g.family, role)}
                    <span className="text-xs font-normal text-muted tabular-nums">
                      {g.bars.length}
                    </span>
                  </h3>
                ) : null}
                <ul
                  className={cn(
                    'm-0 min-w-0 list-none gap-2 p-0',
                    gridStyle ? 'grid' : 'flex flex-wrap',
                  )}
                  style={gridStyle}
                >
                  {g.bars.map((bar) => {
                    const i = k++;
                    const listIndex = indexOf.get(bar.id) ?? 0;
                    const name = nameOf(bar, listIndex);
                    const bmp = bar.image ? (bitmaps.get(bar.image.id) ?? null) : null;
                    return (
                      <li
                        key={bar.id}
                        {...sortable.rowProps(i)}
                        data-character={bar.id}
                        data-name={(bar.name ?? '').trim()}
                        data-index={i}
                        data-dragging={sortable.dragIndex === i || undefined}
                        data-over={
                          sortable.overIndex === i && sortable.dragIndex !== i ? true : undefined
                        }
                        data-family={familyOf(bar, role) ?? 'none'}
                        className={cn(
                          'flex min-w-0 flex-col items-center gap-1.5 rounded-lg border bg-surface-2 px-1.5 py-2 transition-colors',
                          grouped && 'w-[6.5rem]',
                          sortable.dragIndex === i ? 'border-accent opacity-50' : 'border-border',
                          sortable.overIndex === i &&
                            sortable.dragIndex !== i &&
                            'ring-2 ring-accent',
                        )}
                      >
                        <button
                          type="button"
                          data-drag-handle
                          aria-label={S.openEditor(name)}
                          className="touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          onClick={(e) => {
                            /* 滑鼠的點一下交給拖曳排序（沒拖就放開＝打開）；鍵盤與輔助工具在這裡 */
                            if (e.detail === 0) openEditor(bar.id);
                          }}
                          onKeyDown={(e) => {
                            sortable.keyMove(i, e);
                          }}
                        >
                          <AvatarThumb bar={bar} bitmap={bmp} size={64} />
                        </button>
                        {shelf.showNames ? <NameField bar={bar} label={name} /> : null}
                        <div className="flex items-center gap-1">
                          {chipsOf(bar, shelf.showTheme).map((c) => (
                            <Chip
                              key={c.role}
                              role={c.role}
                              colors={c.colors}
                              label={chipLabel(c.role)}
                            />
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
      {bars.length ? <p className="m-0 text-xs text-muted">{S.shelfDragHint}</p> : null}
      {missing.length ? <Notice tone="warning">{S.imagesMissing}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          loading={saving}
          disabled={saving}
          onClick={() => void save()}
        >
          {S.savePng}
        </Button>
      </div>
      {status ? (
        <Notice tone={status.tone}>
          <span data-testid="shelf-status">{status.text}</span>
        </Notice>
      ) : null}
    </div>
  );
}
