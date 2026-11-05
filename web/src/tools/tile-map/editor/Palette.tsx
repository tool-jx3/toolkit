/**
 * 調色盤：選圖塊組（或全部）、內建圖塊組的分類、圖塊清單。
 * 點一下換畫筆；Ctrl／⌘／Shift 點選好幾個（排序用），拖曳到同一組的別的圖塊前後排序；
 * 焦點在圖塊上時 Alt＋←→ 移一格、Alt＋↑↓ 移三格，Ctrl＋A 選這一組全部，Esc 取消。順序存在圖庫（每張地圖共用）。
 */
import { Settings2 } from 'lucide-react';
import {
  type DragEvent,
  type KeyboardEvent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Chips, cn, Select } from '@/ui';
import { spanOf } from '../model/large';
import { moveInOrder } from '../model/library';
import type { TileDef } from '../model/types';
import { drawThumb } from '../render/draw';
import { S } from '../strings';
import * as act from './actions';
import { setLibrary } from './persist';
import { libraryNow, setEditor, useEditor, useLibrary, usePrefs } from './store';
import { imageFor, type PaletteSet, paletteSets, useImages } from './tiles';

const THUMB = 44;
const CAT_ORDER = ['floor', 'wall', 'prop', 'character', 'item'];

const TileThumb = memo(function TileThumb({ def, version }: { def: TileDef; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 圖片讀好（version）時重畫
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(THUMB * dpr);
    if (c.width !== size) c.width = size;
    if (c.height !== size) c.height = size;
    ctx.clearRect(0, 0, size, size);
    const img = imageFor(def.src);
    if (img) drawThumb(ctx, def, img, size);
  }, [def, version]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="block size-11"
      style={{ imageRendering: def.pixel ? 'pixelated' : 'auto' }}
    />
  );
});

export function Palette() {
  const lib = useLibrary((s) => s.lib);
  const setId = usePrefs((s) => s.data.set);
  const cat = usePrefs((s) => s.data.cat);
  const patch = usePrefs((s) => s.patch);
  const tile = useEditor((s) => s.tile);
  const organize = useEditor((s) => s.organize);
  const anchor = useEditor((s) => s.organizeAnchor);
  const version = useImages((s) => s.version);
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; set: string } | null>(null);
  const [dropMark, setDropMark] = useState<{ id: string; after: boolean } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 圖庫一變就重算
  const sets = useMemo(() => paletteSets(), [lib]);
  const current = sets.find((s) => s.id === setId);
  const effectiveSet = current ? current.id : 'all';
  const cats = useMemo(() => {
    if (!current?.builtin) return [];
    const present = new Set(current.tiles.map((t) => t.cat ?? 'custom'));
    return CAT_ORDER.filter((c) => present.has(c));
  }, [current]);
  const effectiveCat = cats.length > 1 && cats.includes(cat) ? cat : 'all';
  const shown: PaletteSet[] = current ? [current] : sets;
  const visible = shown.flatMap((s) =>
    s.tiles
      .filter((t) => effectiveCat === 'all' || t.cat === effectiveCat)
      .map((t) => ({ t, set: s.id })),
  );

  const reorder = (
    setOf: string,
    moving: string[],
    target: string,
    after: boolean,
    focus?: string,
  ) => {
    const s = sets.find((x) => x.id === setOf);
    if (!s) return;
    const l = libraryNow();
    const order = moveInOrder(
      s.tiles,
      l.order[setOf] ?? s.tiles.map((t) => t.id),
      moving,
      target,
      after,
    );
    setLibrary({ ...l, order: { ...l.order, [setOf]: order } });
    if (focus)
      requestAnimationFrame(() =>
        grid.current
          ?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(focus)}"]`)
          ?.focus({ preventScroll: true }),
      );
  };

  const click = (t: TileDef, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const siblings = visible.filter((v) => v.set === t.set).map((v) => v.t.id);
      let next = organize.filter((id) => siblings.includes(id));
      if (e.shiftKey && anchor && siblings.includes(anchor)) {
        const a = siblings.indexOf(anchor);
        const b = siblings.indexOf(t.id);
        next = [...new Set([...next, ...siblings.slice(Math.min(a, b), Math.max(a, b) + 1)])];
        setEditor({ organize: next });
      } else {
        next = next.includes(t.id) ? next.filter((id) => id !== t.id) : [...next, t.id];
        setEditor({ organize: next, organizeAnchor: t.id });
      }
      return;
    }
    act.chooseTile(t.id);
  };

  const onKey = (t: TileDef, e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      setEditor({ organize: visible.filter((v) => v.set === t.set).map((v) => v.t.id) });
      return;
    }
    if (e.key === 'Escape' && organize.length) {
      e.preventDefault();
      e.stopPropagation();
      setEditor({ organize: [] });
      return;
    }
    if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const siblings = visible.filter((v) => v.set === t.set).map((v) => v.t.id);
    const i = siblings.indexOf(t.id);
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const step = e.key === 'ArrowUp' || e.key === 'ArrowDown' ? 3 : 1;
    const target = siblings[i + dir * step];
    if (!target) return;
    reorder(t.set, organize.includes(t.id) ? organize : [t.id], target, dir > 0, t.id);
  };

  const dragProps = (t: TileDef) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLButtonElement>) => {
      const moving = organize.includes(t.id) ? organize : [t.id];
      if (!organize.includes(t.id)) setEditor({ organize: [t.id], organizeAnchor: t.id });
      setDrag({ id: t.id, set: t.set });
      e.dataTransfer.setData('application/x-tile-map-tile', moving.join(','));
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!drag || drag.set !== t.set || organize.includes(t.id)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = e.currentTarget.getBoundingClientRect();
      const after = e.clientX >= r.left + r.width / 2;
      if (dropMark?.id !== t.id || dropMark.after !== after) setDropMark({ id: t.id, after });
    },
    onDragLeave: () => setDropMark((m) => (m?.id === t.id ? null : m)),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (drag && drag.set === t.set) {
        const r = e.currentTarget.getBoundingClientRect();
        reorder(
          t.set,
          organize.length ? organize : [drag.id],
          t.id,
          e.clientX >= r.left + r.width / 2,
        );
      }
      setDrag(null);
      setDropMark(null);
    },
    onDragEnd: () => {
      setDrag(null);
      setDropMark(null);
    },
  });

  const emptyText =
    current && !current.builtin && !current.tiles.length ? S.palette.emptySet : S.palette.empty;

  return (
    <section
      aria-labelledby="tm-palette"
      className="flex min-h-0 flex-col gap-2"
      data-testid="palette"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="tm-palette" className="m-0 text-sm font-semibold">
          {S.palette.heading}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          icon={<Settings2 />}
          onClick={() =>
            setEditor({ dialog: 'sets', managed: current && !current.builtin ? current.id : null })
          }
          data-testid="manage-sets"
        >
          {S.palette.manage}
        </Button>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 只是接住下拉選單上的 F2（改名的捷徑） */}
      <div
        onKeyDown={(e) => {
          if (e.key === 'F2' && current) {
            e.preventDefault();
            setEditor({ dialog: 'sets', managed: current.id });
          }
        }}
      >
        <Select
          aria-label={S.palette.set}
          value={effectiveSet}
          onValueChange={(v) => {
            patch({ set: v, cat: 'all' });
            setEditor({ organize: [] });
            const s = sets.find((x) => x.id === v);
            const t = s?.tiles[0];
            if (t && !s.tiles.some((x) => x.id === useEditor.getState().tile)) act.chooseTile(t.id);
          }}
          options={[
            { value: 'all', label: S.palette.all },
            ...sets.map((s) => ({ value: s.id, label: `${s.name}（${s.tiles.length}）` })),
          ]}
          data-testid="palette-set"
        />
      </div>
      {cats.length > 1 ? (
        <Chips
          aria-label={S.palette.category}
          items={[
            { value: 'all', label: S.palette.allCats },
            ...cats.map((c) => ({ value: c, label: S.palette.cats[c] ?? c })),
          ]}
          value={effectiveCat}
          onPick={(v: string) => {
            patch({ cat: v });
            setEditor({ organize: [] });
          }}
        />
      ) : null}
      <div className="min-h-0 overflow-y-auto rounded-md border border-border bg-surface-2 p-1 lg:flex-1">
        {visible.length ? (
          // biome-ignore lint/a11y/useSemanticElements: 一組圖塊按鈕，不是表單分組
          <div
            ref={grid}
            role="group"
            aria-label={S.palette.grid}
            className="grid grid-cols-[repeat(auto-fill,minmax(2.9rem,1fr))] gap-1"
            data-testid="tile-grid"
          >
            {visible.map(({ t }) => {
              const [w, h] = spanOf(t);
              const label = S.palette.tile(t.name, w, h);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cn(
                    'checker relative flex aspect-square items-center justify-center rounded-sm border focus-visible:focus-ring',
                    t.id === tile ? 'border-accent ring-2 ring-accent' : 'border-border',
                    organize.includes(t.id) &&
                      'outline-2 outline-dashed outline-offset-1 outline-warning',
                    dropMark?.id === t.id &&
                      (dropMark.after
                        ? 'border-r-4 border-r-accent'
                        : 'border-l-4 border-l-accent'),
                  )}
                  aria-label={label}
                  aria-pressed={t.id === tile}
                  title={label}
                  data-tile={t.id}
                  onClick={(e) => click(t, e)}
                  onKeyDown={(e) => onKey(t, e)}
                  {...dragProps(t)}
                >
                  <TileThumb def={t} version={version} />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="m-0 p-3 text-sm text-muted" data-testid="palette-empty">
            {emptyText}
          </p>
        )}
      </div>
      <p className="m-0 text-xs text-muted">{S.palette.hint}</p>
    </section>
  );
}
