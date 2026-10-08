/**
 * 圖層面板（1.12）：清單（最上面的列＝最上層；顯示／隱藏、名稱、鎖頭）、點選（Ctrl／⌘ 加選、Shift 範圍）、
 * 連點兩下改名、拖曳排序（多列一起）、右鍵選單；新增圖層、群組／解散群組、刪除；不透明度、混合模式。
 */
import {
  Armchair,
  Eye,
  EyeOff,
  FolderPlus,
  Grid3x3,
  GripVertical,
  Group,
  House,
  Image as ImageIcon,
  Lock,
  Pencil,
  PenLine,
  Shapes,
  Trash2,
  Type,
  Ungroup,
} from 'lucide-react';
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ContextMenu,
  type ContextMenuState,
  cn,
  contextMenuPoint,
  Field,
  IconButton,
  Select,
  type SelectGroup,
  Slider,
  TextInput,
  useSortable,
} from '@/ui';
import { act } from '../actions';
import { contextItems } from '../editor/menu';
import {
  addEmptyLayer,
  renameLayer,
  reorderLayers,
  selectLayers,
  setLayerVisible,
  setSelectedBlend,
  setSelectedOpacity,
  unlockLayer,
} from '../engine/ops';
import { getEngine } from '../runtime';
import { type LayerRow, setEditor, useEditor } from '../stores';
import { S } from '../strings';

const KIND_ICONS: Record<LayerRow['kind'], ReactNode> = {
  cell: <Grid3x3 />,
  freehand: <PenLine />,
  group: <Group />,
  text: <Type />,
  image: <ImageIcon />,
  decor: <Armchair />,
  room: <House />,
  shape: <Shapes />,
};

const BLEND_GROUPS: { id: keyof typeof S.blend.groups; modes: string[] }[] = [
  { id: 'basic', modes: ['source-over', 'source-atop', 'destination-out', 'source-in', 'xor'] },
  {
    id: 'light',
    modes: [
      'multiply',
      'screen',
      'overlay',
      'darken',
      'lighten',
      'color-dodge',
      'color-burn',
      'hard-light',
      'soft-light',
    ],
  },
  { id: 'diff', modes: ['difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] },
];

const BLEND_OPTIONS: SelectGroup[] = BLEND_GROUPS.map((g) => ({
  label: S.blend.groups[g.id],
  options: g.modes.map((m) => ({ value: m, label: S.blend.modes[m] ?? m })),
}));

function RenameField({ row, onDone }: { row: LayerRow; onDone: () => void }) {
  const [v, setV] = useState(row.name);
  const done = useRef(false);
  const commit = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const eng = getEngine();
    if (save && eng) renameLayer(eng, row.id, v);
    onDone();
  };
  return (
    <TextInput
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => commit(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(true);
        else if (e.key === 'Escape') commit(false);
      }}
      aria-label={S.layers.renameField(row.name)}
      className="h-7 flex-1"
      data-testid="layer-rename"
    />
  );
}

export function LayersPanel({ className }: { className?: string }) {
  const layers = useEditor((s) => s.layers);
  const selectedIds = useEditor((s) => s.selectedIds);
  const sel = useEditor((s) => s.selection);
  const renamingId = useEditor((s) => s.renamingId);
  const mods = useRef({ ctrl: false, shift: false });
  const listRef = useRef<HTMLUListElement>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const selected = new Set(selectedIds);

  const clickRow = (i: number) => {
    const eng = getEngine();
    const row = layers[i];
    if (!eng || !row) return;
    const { ctrl, shift } = mods.current;
    mods.current = { ctrl: false, shift: false };
    let ids: number[];
    const last = useEditor.getState().lastClickedLayer;
    const lastIndex = last === null ? -1 : layers.findIndex((r) => r.id === last);
    if (shift && lastIndex >= 0) {
      const [a, b] = lastIndex < i ? [lastIndex, i] : [i, lastIndex];
      ids = layers.slice(a, b + 1).map((r) => r.id);
    } else if (ctrl) {
      ids = selected.has(row.id)
        ? selectedIds.filter((x) => x !== row.id)
        : [...selectedIds, row.id];
    } else ids = [row.id];
    selectLayers(eng, ids);
    setEditor({ lastClickedLayer: row.id });
  };

  const sortable = useSortable({
    count: layers.length,
    mode: 'drop',
    onMove: (from, to) => {
      const eng = getEngine();
      if (eng) reorderLayers(eng, from, to);
    },
    onClick: clickRow,
  });

  /* 改名開始時把那一列捲進畫面 */
  useEffect(() => {
    if (renamingId === null) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-layer-id="${renamingId}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [renamingId]);

  const focusRow = (i: number) => {
    const el = listRef.current?.querySelectorAll<HTMLElement>(':scope > li')[i];
    el?.focus();
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    if (sortable.keyMove(i, e)) {
      requestAnimationFrame(() => focusRow(e.key === 'ArrowUp' ? i - 1 : i + 1));
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const eng = getEngine();
    if (!eng) return;
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (to >= 0 && to < layers.length) {
      e.preventDefault();
      selectLayers(eng, [layers[to].id]);
      setEditor({ lastClickedLayer: layers[to].id });
      focusRow(to);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectLayers(eng, [layers[i].id]);
    } else if (e.key === 'F2') {
      e.preventDefault();
      setEditor({ renamingId: layers[i].id });
    }
  };

  const openMenu = (row: LayerRow, e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const eng = getEngine();
    if (!eng) return;
    if (!selected.has(row.id)) selectLayers(eng, [row.id]);
    setMenu({ ...contextMenuPoint(e), items: contextItems(eng) });
  };

  const eng = getEngine();
  const groupLabel = sel?.isGroup ? S.layers.ungroup : S.layers.group;

  return (
    <aside
      aria-label={S.layers.title}
      className={cn(
        'flex min-h-0 min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-2',
        className,
      )}
      data-testid="layers-panel"
    >
      <div className="flex items-center gap-1">
        <h2 className="mr-auto text-sm font-semibold">{S.layers.title}</h2>
        <IconButton
          size="sm"
          icon={<FolderPlus />}
          label={S.layers.add}
          onClick={() => eng && addEmptyLayer(eng)}
          data-testid="layer-add"
        />
        <IconButton
          size="sm"
          icon={sel?.isGroup ? <Ungroup /> : <Group />}
          label={groupLabel}
          disabled={!sel || (!sel.isGroup && !sel.canGroup)}
          onClick={() => (sel?.isGroup ? act.ungroup() : act.group())}
          data-testid="layer-group"
        />
        <IconButton
          size="sm"
          icon={<Trash2 />}
          label={S.layers.delete}
          disabled={!sel}
          onClick={act.delete}
          data-testid="layer-delete"
        />
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 清單的空白處：點一下取消選取（鍵盤用 Esc） */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上 */}
      <div
        className="min-h-24 flex-1 overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && eng) selectLayers(eng, []);
        }}
      >
        {layers.length ? (
          <ul
            ref={listRef}
            aria-label={S.layers.list}
            className={cn(
              'm-0 flex list-none flex-col gap-0.5 p-0',
              sortable.dragIndex !== null && 'select-none',
            )}
            data-testid="layer-list"
          >
            {layers.map((row, i) => {
              const isSel = selected.has(row.id);
              const rp = sortable.rowProps(i);
              const over = sortable.overIndex === i && sortable.dragIndex !== i;
              return (
                <li
                  key={row.id}
                  {...rp}
                  onPointerDown={(e) => {
                    mods.current = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
                    rp.onPointerDown(e);
                  }}
                  tabIndex={isSel || (!selectedIds.length && i === 0) ? 0 : -1}
                  aria-current={isSel || undefined}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onContextMenu={(e) => openMenu(row, e)}
                  data-layer-id={row.id}
                  data-selected={isSel || undefined}
                  className={cn(
                    'flex min-h-8 items-center gap-1 rounded-md border px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    isSel
                      ? 'border-accent bg-accent-soft'
                      : 'border-transparent hover:bg-surface-2',
                    !row.visible && 'opacity-60',
                    over && 'ring-2 ring-accent',
                    sortable.dragIndex === i && 'opacity-50',
                  )}
                >
                  <span
                    data-drag-handle
                    className="flex shrink-0 cursor-grab touch-none items-center text-muted"
                    title={S.layers.drag}
                  >
                    <GripVertical aria-hidden className="size-3.5" />
                  </span>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={row.visible ? <Eye /> : <EyeOff />}
                    label={row.visible ? S.layers.hide(row.name) : S.layers.show(row.name)}
                    onClick={() => eng && setLayerVisible(eng, row.id, !row.visible)}
                    noTooltip
                    data-testid="layer-eye"
                  />
                  <span
                    aria-hidden
                    className="flex shrink-0 text-muted [&_svg]:size-3.5"
                    title={S.layers.kinds[row.kind]}
                  >
                    {KIND_ICONS[row.kind]}
                  </span>
                  {renamingId === row.id ? (
                    <RenameField row={row} onDone={() => setEditor({ renamingId: null })} />
                  ) : (
                    // biome-ignore lint/a11y/noStaticElementInteractions: 連點兩下改名（鍵盤用 F2 或列上的「重新命名」）
                    <span
                      className="layer-name min-w-0 flex-1 truncate"
                      onDoubleClick={() => setEditor({ renamingId: row.id })}
                      data-testid="layer-name"
                    >
                      {row.name}
                    </span>
                  )}
                  {row.locked ? (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={<Lock />}
                      label={S.layers.locked}
                      onClick={() => eng && unlockLayer(eng, row.id)}
                      data-testid="layer-lock"
                    />
                  ) : null}
                  {renamingId !== row.id ? (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={<Pencil />}
                      label={S.layers.rename}
                      onClick={() => setEditor({ renamingId: row.id })}
                      noTooltip
                      className="opacity-60 hover:opacity-100"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 py-4 text-center text-sm text-muted">{S.layers.empty}</p>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <Field label={S.layers.opacity}>
          <Slider
            value={Math.round((sel?.opacity ?? 1) * 100)}
            onChange={(v) => eng && setSelectedOpacity(eng, v / 100)}
            min={0}
            max={100}
            unit="%"
            disabled={!sel}
          />
        </Field>
        <Field label={S.layers.blend}>
          <Select
            value={sel?.blend ?? 'source-over'}
            onValueChange={(v) => eng && setSelectedBlend(eng, v)}
            options={BLEND_OPTIONS}
            size="sm"
            disabled={!sel}
          />
        </Field>
      </div>
      <ContextMenu state={menu} onClose={() => setMenu(null)} aria-label={S.context.label} />
    </aside>
  );
}
