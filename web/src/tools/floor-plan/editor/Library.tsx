/**
 * 素材面板：房間（預設尺寸）、門窗與牆、家具・小物（搜尋、分類）。
 * 點一下卡片＝拿起那個工具（再點一次放下）；房間與家具也可以直接拖到畫布上。
 */
import { type DragEvent, memo, useEffect, useRef } from 'react';
import { Chips, cn, Tabs, TextInput } from '@/ui';
import { drawAssetIcon, drawOpeningIcon, drawWallIcon } from '../draw/icons';
import { THEMES } from '../draw/themes';
import { ASSET_GROUPS, ASSETS, assetMatches } from '../model/assets';
import {
  CELL_M,
  OPENINGS,
  ROOM_PRESET_GROUPS,
  type RoomPreset,
  WALL_KINDS,
} from '../model/catalog';
import { round2 } from '../model/geometry';
import type { OpeningKind, WallKind } from '../model/types';
import { S } from '../strings';
import { toggleArmed } from './actions';
import { editor } from './controller';
import { type LibTab, setEditor, useEditor, usePrefs } from './store';

const Icon = memo(function Icon({ draw }: { draw: (c: HTMLCanvasElement) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) draw(ref.current);
  }, [draw]);
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
    (s) => s.tool === 'room' && s.armed?.kind === 'room' && s.armed.preset === p.id,
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
      onClick={() => toggleArmed('room', { kind: 'room', preset: p.id })}
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
    <div className="flex flex-col gap-3">
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
    <div className="flex flex-col gap-3">
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

function AssetCard({ id, name }: { id: string; name: string }) {
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
      title={name}
      data-asset={id}
    >
      <Icon draw={memoDraw(assetDraw, id, (c) => drawAssetIcon(c, id))} />
      <span className="min-w-0 text-fg">{name}</span>
    </button>
  );
}

function FurnitureTab() {
  const query = useEditor((s) => s.libQuery);
  const group = useEditor((s) => s.libGroup);
  const q = query.trim();
  const groups = ASSET_GROUPS.map((g) => ({
    ...g,
    assets: ASSETS.filter((a) => a.group === g.id && assetMatches(a, q)),
  })).filter((g) => g.assets.length && (q || group === 'all' || group === g.id));
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        type="search"
        value={query}
        placeholder={S.lib.search}
        aria-label={S.lib.search}
        onChange={(e) => setEditor({ libQuery: e.target.value })}
      />
      <Chips
        aria-label={S.lib.group}
        value={group}
        onPick={(v) => setEditor({ libGroup: v })}
        items={[
          { value: 'all', label: S.lib.all },
          ...ASSET_GROUPS.map((g) => ({ value: g.id, label: g.name })),
        ]}
      />
      {groups.length ? (
        groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-1.5">
            <h3 className="m-0 text-xs font-semibold text-muted">{g.name}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {g.assets.map((a) => (
                <AssetCard key={a.id} id={a.id} name={a.name} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="m-0 text-xs text-muted">{S.lib.noResult}</p>
      )}
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
        className="min-h-0 flex-1 [&_[role=tabpanel]]:min-h-0 [&_[role=tabpanel]]:overflow-y-auto"
        items={[
          { value: 'rooms', label: S.lib.rooms, content: <RoomsTab /> },
          { value: 'openings', label: S.lib.openings, content: <OpeningsTab /> },
          { value: 'furniture', label: S.lib.furniture, content: <FurnitureTab /> },
        ]}
      />
    </div>
  );
}
