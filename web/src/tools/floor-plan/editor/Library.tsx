/**
 * 素材面板：房間（預設尺寸）、門窗與牆、家具・小物（搜尋、分類）。
 * 點一下卡片＝拿起那個工具（再點一次放下）；房間與家具也可以直接拖到畫布上。
 * 2026-10 第三批：家具 381 種、24 類；搜尋可以打名稱或 `#標籤`，搜尋欄與分類固定在上面（F234）；
 * 卡片的圖示捲到看得到的地方才畫（D50）。
 */
import { type DragEvent, memo, useEffect, useMemo, useRef } from 'react';
import { cn, Select, Tabs, TextInput } from '@/ui';
import { drawAssetIcon, drawOpeningIcon, drawWallIcon } from '../draw/icons';
import { THEMES } from '../draw/themes';
import { ASSET_GROUPS, ASSETS, type AssetInfo, assetMatches } from '../model/assets';
import {
  CELL_M,
  OPENINGS,
  ROOM_PRESET_GROUPS,
  type RoomPreset,
  WALL_KINDS,
} from '../model/catalog';
import { round2 } from '../model/geometry';
import { queryWords, type TagId, tagSuggestions, tagText } from '../model/tags';
import type { OpeningKind, WallKind } from '../model/types';
import { S } from '../strings';
import { toggleArmed } from './actions';
import { editor } from './controller';
import { lazyDraw } from './lazyIcons';
import { type LibTab, setEditor, useEditor, usePrefs } from './store';

/**
 * 卡片的小圖示。`lazy`：捲到看得到（含素材面板上下各 300 px）時才畫（家具 381 種，一打開分頁就全部畫會卡一下，D50；
 * 觀察範圍要指定成捲動容器、在畫面內的先畫、預先畫的分批，見 lazyIcons.ts）。
 */
const Icon = memo(function Icon({
  draw,
  lazy = false,
}: {
  draw: (c: HTMLCanvasElement) => void;
  lazy?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const paint = () => {
      draw(el);
      el.dataset.drawn = '1';
    };
    if (!lazy) {
      paint();
      return;
    }
    return lazyDraw(el, paint);
  }, [draw, lazy]);
  return <canvas ref={ref} aria-hidden className="size-11 shrink-0 rounded-sm bg-white" />;
});

const cardClass = (active: boolean) =>
  cn(
    'flex min-w-0 items-center gap-2 rounded-md border p-1.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
    active
      ? 'border-accent bg-accent-soft'
      : 'border-border bg-surface hover:border-border-strong hover:bg-surface-3',
  );

const mText = (w: number, h: number) => `${round2(w * CELL_M)}×${round2(h * CELL_M)}m`;

function startDrag(e: DragEvent, payload: NonNullable<typeof editor.dragAsset>) {
  editor.dragAsset = payload;
  e.dataTransfer.setData('text/plain', payload.kind === 'item' ? payload.t : payload.preset);
  e.dataTransfer.effectAllowed = 'copy';
}

function endDrag() {
  editor.dragAsset = null;
  editor.requestRender();
}

function RoomCard({ p }: { p: RoomPreset }) {
  const active = useEditor(
    (s) =>
      (s.tool === 'room' || s.tool === 'lroom') &&
      s.armed?.kind === 'room' &&
      s.armed.preset === p.id,
  );
  const name = S.presets[p.id];
  return (
    <button
      type="button"
      className={cardClass(active)}
      aria-pressed={active}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'room', preset: p.id })}
      onDragEnd={endDrag}
      onClick={() =>
        /* L 形房間工具（J）拿著時照樣用 L 形（2026-10-29，F258） */
        toggleArmed(useEditor.getState().tool === 'lroom' ? 'lroom' : 'room', {
          kind: 'room',
          preset: p.id,
        })
      }
      title={`${name} ${mText(p.w, p.h)}`}
      data-room={p.id}
    >
      <span
        aria-hidden
        className="size-6 shrink-0 rounded-sm border border-border-strong"
        style={{ background: THEMES.clean.fills[p.cat] ?? '#ffffff' }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-fg">{name}</span>
        <span className="text-muted tabular-nums">{mText(p.w, p.h)}</span>
      </span>
    </button>
  );
}

function RoomsTab() {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="m-0 text-xs text-muted">{S.lib.roomsNote}</p>
      {ROOM_PRESET_GROUPS.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5">
          <h3 className="m-0 text-xs font-semibold text-muted">{S.presetGroups[g.id]}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {g.items.map((p) => (
              <RoomCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const openingDraw = new Map<OpeningKind, (c: HTMLCanvasElement) => void>();
const wallDraw = new Map<WallKind, (c: HTMLCanvasElement) => void>();
const assetDraw = new Map<string, (c: HTMLCanvasElement) => void>();
const memoDraw = <K,>(
  m: Map<K, (c: HTMLCanvasElement) => void>,
  k: K,
  f: (c: HTMLCanvasElement) => void,
) => {
  let fn = m.get(k);
  if (!fn) {
    fn = f;
    m.set(k, fn);
  }
  return fn;
};

function OpeningCard({ kind }: { kind: OpeningKind }) {
  const group = OPENINGS.find((o) => o.id === kind)?.group ?? 'door';
  const tool = group === 'window' ? 'window' : 'door';
  const active = useEditor(
    (s) => s.tool === tool && s.armed?.kind === 'opening' && s.armed.type === kind,
  );
  return (
    <button
      type="button"
      className={cardClass(active)}
      aria-pressed={active}
      onClick={() => toggleArmed(tool, { kind: 'opening', type: kind, hinge: 0 })}
      data-opening={kind}
    >
      <Icon draw={memoDraw(openingDraw, kind, (c) => drawOpeningIcon(c, kind))} />
      <span className="min-w-0 text-fg">{S.openings[kind]}</span>
    </button>
  );
}

function WallCard({ kind }: { kind: WallKind }) {
  const active = useEditor(
    (s) => s.tool === 'wall' && s.armed?.kind === 'wall' && s.armed.type === kind,
  );
  return (
    <button
      type="button"
      className={cardClass(active)}
      aria-pressed={active}
      onClick={() => toggleArmed('wall', { kind: 'wall', type: kind })}
      data-wall={kind}
    >
      <Icon draw={memoDraw(wallDraw, kind, (c) => drawWallIcon(c, kind))} />
      <span className="min-w-0 text-fg">{S.walls[kind]}</span>
    </button>
  );
}

function OpeningsTab() {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <h3 className="m-0 text-xs font-semibold text-muted">{S.lib.doors}</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {OPENINGS.filter((o) => o.group === 'door').map((o) => (
          <OpeningCard key={o.id} kind={o.id} />
        ))}
      </div>
      <h3 className="m-0 text-xs font-semibold text-muted">{S.lib.windows}</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {OPENINGS.filter((o) => o.group === 'window').map((o) => (
          <OpeningCard key={o.id} kind={o.id} />
        ))}
      </div>
      <h3 className="m-0 text-xs font-semibold text-muted">{S.lib.walls}</h3>
      <p className="m-0 text-xs text-muted">{S.lib.wallsNote}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {WALL_KINDS.map((w) => (
          <WallCard key={w.id} kind={w.id} />
        ))}
      </div>
    </div>
  );
}

function AssetCard({ a }: { a: AssetInfo }) {
  const id = a.id;
  const active = useEditor(
    (s) => s.tool === 'place' && s.armed?.kind === 'item' && s.armed.t === id,
  );
  return (
    <button
      type="button"
      className={cardClass(active)}
      aria-pressed={active}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'item', t: id })}
      onDragEnd={endDrag}
      onClick={() => toggleArmed('place', { kind: 'item', t: id, rot: 0, manual: false })}
      title={`${a.name}\n${tagText(a.tags)}`}
      data-asset={id}
    >
      <Icon lazy draw={memoDraw(assetDraw, id, (c) => drawAssetIcon(c, id))} />
      <span className="min-w-0 text-fg">{a.name}</span>
    </button>
  );
}

/** 家具用到的標籤（`#` 的建議只列這些） */
const USED_TAGS: ReadonlySet<TagId> = new Set(ASSETS.flatMap((a) => a.tags));

function FurnitureTab() {
  const query = useEditor((s) => s.libQuery);
  const group = useEditor((s) => s.libGroup);
  const input = useRef<HTMLInputElement>(null);
  const matched = useMemo(() => {
    const words = queryWords(query);
    return ASSETS.filter((a) => assetMatches(a, words));
  }, [query]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of matched) m.set(a.group, (m.get(a.group) ?? 0) + 1);
    return m;
  }, [matched]);
  const groupId = group === 'all' || ASSET_GROUPS.some((g) => g.id === group) ? group : 'all';
  const groups = ASSET_GROUPS.filter((g) => groupId === 'all' || groupId === g.id)
    .map((g) => ({ ...g, assets: matched.filter((a) => a.group === g.id) }))
    .filter((g) => g.assets.length);
  const shown = groups.reduce((n, g) => n + g.assets.length, 0);
  /* 「其他分類還有 N 件符合」只在有搜尋字時說（只選分類時全部都「符合」，每選一類都出現是雜訊，7.16） */
  const searching = queryWords(query).length > 0;
  const elsewhere = searching ? matched.length - shown : 0;
  const suggest = tagSuggestions(query, USED_TAGS);
  const pickTag = (name: string) => {
    if (!suggest) return;
    setEditor({ libQuery: `${suggest.prefix}#${name} ` });
    input.current?.focus();
  };
  return (
    <div className="flex flex-col gap-3">
      {/* 搜尋欄與分類固定在上面（捲動時一直看得到，F234）；面板自己沒有上方的留白（Library 的 tabpanel pt-0），
          留白放在這一條裡，所以貼齊面板頂端、卡片不會從它上面露出來（7.16） */}
      <div
        className="sticky top-0 z-10 flex flex-col gap-1.5 bg-surface pt-3 pb-1.5"
        data-testid="library-search"
      >
        <TextInput
          ref={input}
          type="search"
          value={query}
          placeholder={S.lib.searchHint}
          aria-label={S.lib.search}
          onChange={(e) => setEditor({ libQuery: e.target.value })}
        />
        <Select
          size="sm"
          aria-label={S.lib.group}
          value={groupId}
          onValueChange={(v) => setEditor({ libGroup: v })}
          options={[
            { value: 'all', label: S.lib.groupOption(S.lib.all, matched.length) },
            ...ASSET_GROUPS.map((g) => ({
              value: g.id,
              label: S.lib.groupOption(g.name, counts.get(g.id) ?? 0),
            })),
          ]}
        />
        {suggest?.tags.length ? (
          <fieldset className="m-0 flex flex-wrap gap-1 border-0 p-0" aria-label={S.lib.tagSuggest}>
            {suggest.tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg hover:border-accent focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                onClick={() => pickTag(t.name)}
                data-tag={t.id}
              >
                #{t.name}
              </button>
            ))}
          </fieldset>
        ) : null}
      </div>
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5" data-group={g.id}>
          <h3 className="m-0 text-xs font-semibold text-muted">{g.name}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {g.assets.map((a) => (
              <AssetCard key={a.id} a={a} />
            ))}
          </div>
        </div>
      ))}
      {!shown ? <p className="m-0 text-xs text-muted">{S.lib.noResult}</p> : null}
      {elsewhere > 0 ? (
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {S.lib.elsewhere(elsewhere)}
          <button
            type="button"
            className="font-medium text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            onClick={() => setEditor({ libGroup: 'all' })}
          >
            {S.lib.searchAll}
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function Library() {
  const tab = usePrefs((s) => s.data.libTab);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-surface p-2 max-lg:max-h-[75dvh]"
      data-testid="library"
    >
      <Tabs
        aria-label={S.lib.label}
        value={tab}
        onValueChange={(v) =>
          usePrefs.getState().update((d) => {
            d.libTab = v as LibTab;
          })
        }
        className="min-h-0 flex-1 [&_[role=tabpanel]]:min-h-0 [&_[role=tabpanel]]:overflow-y-auto [&_[role=tabpanel]]:pt-0"
        items={[
          { value: 'rooms', label: S.lib.rooms, content: <RoomsTab /> },
          { value: 'openings', label: S.lib.openings, content: <OpeningsTab /> },
          { value: 'furniture', label: S.lib.furniture, content: <FurnitureTab /> },
        ]}
      />
    </div>
  );
}
