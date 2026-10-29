/**
 * 屬性面板：沒有選取時是地圖設定；選了一個東西時是它的屬性；選了好幾個時是共同的開關與動作。
 * 文字欄、數字欄從聚焦到離開算一步復原；調色盤按下到放開算一步。
 */
import { Link2, ListOrdered, Lock, LockOpen, RotateCw, Shuffle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  GestureScope,
  IconButton,
  NumberInput,
  Segmented,
  Select,
  Slider,
  TextArea,
  TextInput,
  Toggle,
} from '@/ui';
import { getTheme, roomFill } from '../draw/themes';
import { ASSET } from '../model/assets';
import {
  CAT,
  CATEGORIES,
  isWallKind,
  OPENINGS,
  ROOM_WALL_KINDS,
  SIZE_MODES,
  SWING_DOORS,
  THEME_IDS,
  TOKEN_GRID_OPACITY,
  WALL_KINDS,
  WEAR_DEFAULT,
} from '../model/catalog';
import { clamp, metersText, meterText, pingText, roomArea, round2 } from '../model/geometry';
import { getObj, rotateItem } from '../model/ops';
import { CORNERS, L_MIN } from '../model/shape';
import type { Item, Opening, Room, SelRef, TextLabel, Wall } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { currentFloor, useEditor, usePrefs, useProject } from './store';
import { TokenGridSelect } from './TokenGridSelect';

const g = historyGesture(useProject);

/** 文字、數字欄：聚焦到離開算一步 */
function Typing({ children }: { children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只追蹤裡面欄位的聚焦（復原的一步），不是互動元素
    <div
      className="contents"
      onFocus={() => {
        act.flushNudge();
        g.begin();
      }}
      onBlur={g.commit}
    >
      {children}
    </div>
  );
}

function Head({ kicker, title, tools }: { kicker: string; title: string; tools?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="m-0 text-xs text-muted">{kicker}</p>
        <p className="m-0 truncate text-base font-semibold" data-testid="props-title">
          {title}
        </p>
      </div>
      {tools ? <div className="flex shrink-0 gap-0.5">{tools}</div> : null}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <p className="m-0 text-xs text-muted tabular-nums" data-testid="props-readout">
      {label}　<span className="text-fg">{value}</span>
    </p>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">{children}</div>;
}

function CommonButtons({ order = false }: { order?: boolean }) {
  return (
    <>
      {order ? (
        <>
          <Button size="sm" onClick={() => act.reorderSelection(true)}>
            {S.props.front}
          </Button>
          <Button size="sm" onClick={() => act.reorderSelection(false)}>
            {S.props.back}
          </Button>
        </>
      ) : null}
      <Button size="sm" onClick={act.duplicateSelection}>
        {S.props.duplicate}
      </Button>
      <Button size="sm" variant="danger" onClick={() => void act.deleteSelection()}>
        {S.props.delete}
      </Button>
    </>
  );
}

/** 顏色：自訂色或「自動」（依種類的顏色）；改回自動的按鈕 */
function ColorRow({
  value,
  auto,
  onChange,
  label = S.props.color,
}: {
  value?: string;
  auto: string;
  onChange: (v: string | undefined) => void;
  label?: string;
}) {
  return (
    <Field label={label} hint={value ? undefined : S.props.colorAuto}>
      <div className="flex min-w-0 items-center gap-2">
        <GestureScope gesture={g}>
          <ColorField
            value={value ?? auto}
            onChange={(v) => onChange(v)}
            className="min-w-0 flex-1"
          />
        </GestureScope>
        <Button size="sm" variant="ghost" disabled={!value} onClick={() => onChange(undefined)}>
          {S.props.colorReset}
        </Button>
      </div>
    </Field>
  );
}

function flagToggle<T extends object>(
  ref: SelRef,
  key: keyof T & string,
  label: string,
  on: boolean,
) {
  return (
    <Field label={label} layout="inline">
      <Toggle
        checked={on}
        onCheckedChange={(v) =>
          act.editObj(ref, (o) => {
            const r = o as unknown as Record<string, unknown>;
            if (v) r[key] = true;
            else delete r[key];
          })
        }
      />
    </Field>
  );
}

const setOpt = <T,>(o: T, key: keyof T, v: T[keyof T] | undefined) => {
  if (v === undefined || v === '' || v === false) delete o[key];
  else o[key] = v;
};

/** 棋子方格（F220）：大小、顏色、不透明度 */
function TokenGridFields() {
  const p = useProject((s) => s.data);
  const theme = getTheme(p.theme);
  const update = act.updateProject;
  const opacity = Math.round((p.tokenGridOpacity ?? TOKEN_GRID_OPACITY) * 100);
  return (
    <>
      <Field label={S.props.tokenGrid} hint={S.props.tokenGridHint}>
        <TokenGridSelect testId="token-grid-size" />
      </Field>
      {p.tokenGrid ? (
        <>
          <ColorRow
            label={S.props.tokenGridColor}
            value={p.tokenGridColor}
            auto={theme.wall.startsWith('#') ? theme.wall.slice(0, 7) : '#2b2f37'}
            onChange={(v) =>
              update((d) => {
                if (v) d.tokenGridColor = v.slice(0, 7);
                else delete d.tokenGridColor;
              })
            }
          />
          <Typing>
            <Field label={S.props.tokenGridOpacity}>
              <Slider
                value={opacity}
                min={10}
                max={100}
                step={5}
                unit="%"
                aria-label={S.props.tokenGridOpacity}
                onChange={(v) =>
                  update((d) => {
                    const o = Math.round(clamp(v, 10, 100)) / 100;
                    if (o === TOKEN_GRID_OPACITY) delete d.tokenGridOpacity;
                    else d.tokenGridOpacity = o;
                  })
                }
              />
            </Field>
          </Typing>
        </>
      ) : null}
    </>
  );
}

function MapProps() {
  const p = useProject((s) => s.data);
  const prefs = usePrefs((s) => s.data);
  const f = p.floors[p.active];
  const update = act.updateProject;
  return (
    <>
      <Head kicker={S.props.mapTitle} title={p.name || S.untitled} />
      <Typing>
        <Field label={S.props.mapName}>
          <TextInput
            value={p.name}
            maxLength={120}
            placeholder={S.props.mapNamePh}
            onChange={(e) =>
              update((d) => {
                d.name = e.target.value;
              })
            }
          />
        </Field>
      </Typing>
      <Field label={S.props.style}>
        <Select
          value={p.theme}
          onValueChange={(v) =>
            update((d) => {
              d.theme = v;
            })
          }
          options={THEME_IDS.map((id) => ({ value: id, label: S.themes[id] }))}
        />
      </Field>
      <Field label={S.props.showNames} layout="inline">
        <Toggle
          checked={p.showNames !== false}
          onCheckedChange={(v) =>
            update((d) => {
              d.showNames = v;
            })
          }
        />
      </Field>
      <Field label={S.props.sizeLabel}>
        <Select
          value={p.showSize}
          onValueChange={(v) =>
            update((d) => {
              d.showSize = v;
            })
          }
          options={SIZE_MODES.map((m) => ({ value: m, label: S.sizeModes[m] }))}
        />
      </Field>
      <Field label={S.props.grid} layout="inline">
        <Toggle checked={prefs.grid} onCheckedChange={act.toggleGrid} />
      </Field>
      <Field label={S.props.ghost} layout="inline">
        <Toggle
          checked={prefs.ghost}
          onCheckedChange={(v) =>
            usePrefs.getState().update((d) => {
              d.ghost = v;
            })
          }
        />
      </Field>
      <TokenGridFields />
      <KiinFields />
      <FloorFields />
      <p className="m-0 border-t border-border pt-3 text-xs text-muted" data-testid="map-stats">
        {f.name}：{S.props.stats(f.rooms.length, f.items.length, f.openings.length)}
      </p>
      <p className="m-0 text-xs text-muted">{S.props.mapTip}</p>
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <Button
          size="sm"
          icon={<ListOrdered />}
          onClick={act.numberRoomsOnFloor}
          data-testid="number-rooms"
          className="self-start"
        >
          {S.props.numberRooms}
        </Button>
        <p className="m-0 text-xs text-muted">{S.props.numberRoomsHint}</p>
      </div>
    </>
  );
}

/** 2026-10-29（參考 KIIN）：家具跟著房間、座標標示、紙的污漬與摺痕 */
function KiinFields() {
  const p = useProject((s) => s.data);
  const strength = Math.round((p.wear ?? WEAR_DEFAULT) * 100);
  return (
    <>
      <Field label={S.props.follow} layout="inline" hint={S.props.followHint}>
        <Toggle checked={!p.fixedFurniture} onCheckedChange={act.setFollowFurniture} />
      </Field>
      <Field label={S.props.coords} layout="inline" hint={S.props.coordsHint}>
        <Toggle checked={!!p.coords} onCheckedChange={act.setCoords} />
      </Field>
      <Field label={S.props.wear} layout="inline" hint={S.props.wearHint}>
        <Toggle checked={!!p.wear} onCheckedChange={act.setWear} />
      </Field>
      {p.wear ? (
        <div className="flex items-end gap-2">
          <Typing>
            <Field label={S.props.wearStrength} className="min-w-0 flex-1">
              <Slider
                value={strength}
                min={10}
                max={100}
                step={5}
                unit="%"
                aria-label={S.props.wearStrength}
                onChange={(v) => act.setWearStrength(v / 100)}
              />
            </Field>
          </Typing>
          <Button
            size="sm"
            icon={<Shuffle />}
            onClick={act.shuffleWear}
            data-testid="wear-shuffle"
            className="shrink-0"
          >
            {S.props.wearShuffle}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** L 形房間（F259）：形狀、缺角、缺角的寬與深 */
function RoomShapeFields({ r }: { r: Room }) {
  const ref: SelRef = { type: 'room', id: r.id };
  const small = r.w < L_MIN || r.h < L_MIN;
  return (
    <>
      <Field label={S.props.shape} hint={small && !r.cut ? S.props.shapeTooSmall : undefined}>
        <Segmented
          size="sm"
          value={r.cut ? 'l' : 'rect'}
          disabled={r.locked}
          onValueChange={(v) => act.setRoomShape(r.id, v === 'l')}
          options={[
            { value: 'rect', label: S.props.shapes.rect },
            { value: 'l', label: S.props.shapes.l, disabled: small },
          ]}
        />
      </Field>
      {r.cut ? (
        <>
          <Field label={S.props.cutCorner}>
            <Segmented
              size="sm"
              value={r.cut.c}
              disabled={r.locked}
              onValueChange={(v) => act.setRoomCut(ref.id, { c: v })}
              options={CORNERS.map((c) => ({ value: c, label: S.props.corners[c] }))}
            />
          </Field>
          <Typing>
            <FieldRow columns={2}>
              <Field label={S.props.cutW}>
                <NumberInput
                  value={r.cut.w}
                  step={1}
                  min={1}
                  max={r.w - 1}
                  unit={S.props.cells}
                  disabled={r.locked}
                  onChange={(v) => act.setRoomCut(ref.id, { w: v })}
                />
              </Field>
              <Field label={S.props.cutH}>
                <NumberInput
                  value={r.cut.h}
                  step={1}
                  min={1}
                  max={r.h - 1}
                  unit={S.props.cells}
                  disabled={r.locked}
                  onChange={(v) => act.setRoomCut(ref.id, { h: v })}
                />
              </Field>
            </FieldRow>
          </Typing>
        </>
      ) : null}
    </>
  );
}

/** 房間的牆種類（F228）：室內房間才有（戶外的房間外圍照種類） */
function RoomWallField({ r }: { r: Room }) {
  if (CAT[r.cat]?.outdoor)
    return <p className="m-0 text-xs text-muted">{S.props.roomWallOutdoor}</p>;
  return (
    <Field label={S.props.roomWall} hint={S.props.roomWallHint}>
      <Select
        value={r.wall ?? AUTO}
        onValueChange={(v) =>
          act.editObj<Room>({ type: 'room', id: r.id }, (o) => {
            if (v === AUTO || !isWallKind(v)) delete o.wall;
            else o.wall = v;
          })
        }
        options={[
          { value: AUTO, label: S.props.roomWallAuto },
          ...ROOM_WALL_KINDS.map((k) => ({ value: k, label: S.walls[k] })),
          /* 原作的檔裡可能有選單沒列的種類（欄杆、圍籬）：照樣顯示 */
          ...(r.wall && !ROOM_WALL_KINDS.includes(r.wall)
            ? [{ value: r.wall, label: S.walls[r.wall] }]
            : []),
        ]}
        data-testid="room-wall"
      />
    </Field>
  );
}

const AUTO = 'auto';

/** 這一層的設定：外觀層的「顯示內部」（F230；有兩層以上時才顯示） */
function FloorFields() {
  const p = useProject((s) => s.data);
  const f = p.floors[p.active];
  const others = p.floors.filter((o) => o !== f);
  if (!f || !others.length) return null;
  const inside = others.find((o) => o.id === f.inside) ?? others[0];
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3" data-testid="floor-fields">
      <p className="m-0 text-xs font-semibold text-muted">{S.props.floorTitle(f.name)}</p>
      <Field label={S.props.showInside} layout="inline" hint={S.props.showInsideHint}>
        <Toggle checked={!!f.showInside} onCheckedChange={act.setShowInside} />
      </Field>
      {f.showInside ? (
        <Field label={S.props.insideFloor}>
          <Select
            value={inside.id}
            onValueChange={act.setInsideFloor}
            options={others.map((o) => ({ value: o.id, label: o.name || '—' }))}
            data-testid="inside-floor"
          />
        </Field>
      ) : null}
    </div>
  );
}

function RoomProps({ r }: { r: Room }) {
  const ref: SelRef = { type: 'room', id: r.id };
  const theme = getTheme(useProject((s) => s.data.theme));
  const area = roomArea(r);
  const edit = (fn: (o: Room) => void) => act.editObj<Room>(ref, fn);
  const num = (label: string, key: 'x' | 'y' | 'w' | 'h', min?: number) => (
    <Field label={label}>
      <NumberInput
        value={r[key]}
        step={1}
        min={min}
        unit={S.props.cells}
        disabled={r.locked}
        onChange={(v) => {
          const value = Math.max(min ?? -Infinity, Math.round(v));
          /* 寬、深：家具跟著房間（F254）、L 形的缺角夾到合法的大小 */
          if (key === 'w' || key === 'h') {
            const misfit = act.resizeRoom(r.id, { x: r.x, y: r.y, w: r.w, h: r.h, [key]: value });
            if (misfit) act.notify(S.msg.followMisfit(misfit), 'warning');
          } else
            edit((o) => {
              o[key] = value;
            });
        }}
      />
    </Field>
  );
  return (
    <>
      <Head
        kicker={S.props.room}
        title={r.name || '—'}
        tools={
          <>
            <IconButton
              size="sm"
              variant="ghost"
              icon={r.locked ? <Lock /> : <LockOpen />}
              label={r.locked ? S.props.unlock : S.props.lock}
              pressed={!!r.locked}
              onClick={act.toggleLock}
            />
            <IconButton
              size="sm"
              variant="ghost"
              icon={<RotateCw />}
              label={S.props.rotate}
              disabled={r.locked}
              onClick={act.rotateSelection}
            />
          </>
        }
      />
      <Typing>
        <Field label={S.props.name}>
          <TextInput
            value={r.name}
            maxLength={200}
            data-focus="name"
            onChange={(e) =>
              edit((o) => {
                o.name = e.target.value;
              })
            }
          />
        </Field>
        <Field label={S.props.plName} hint={S.props.plNameNote}>
          <TextInput
            value={r.plName ?? ''}
            maxLength={200}
            placeholder={S.props.plNamePh}
            onChange={(e) => edit((o) => setOpt(o, 'plName', e.target.value))}
          />
        </Field>
      </Typing>
      <Field label={S.props.category}>
        <Select
          value={r.cat}
          onValueChange={(v) =>
            edit((o) => {
              o.cat = v;
            })
          }
          options={CATEGORIES.map((c) => ({ value: c.id, label: S.categories[c.id] }))}
        />
      </Field>
      <Readout
        label={S.props.area}
        value={
          r.cut
            ? S.props.areaL(
                metersText(r.w, r.h),
                metersText(r.cut.w, r.cut.h),
                round2(area),
                pingText(area),
              )
            : `${metersText(r.w, r.h)} · ${round2(area)}㎡ · ${pingText(area)}`
        }
      />
      <Typing>
        <FieldRow columns={2}>
          {num(S.props.x, 'x')}
          {num(S.props.y, 'y')}
          {num(S.props.w, 'w', r.cut ? L_MIN : 1)}
          {num(S.props.h, 'h', r.cut ? L_MIN : 1)}
        </FieldRow>
      </Typing>
      <RoomShapeFields r={r} />
      {r.locked ? <p className="m-0 text-xs text-muted">{S.props.lockedNote}</p> : null}
      <ColorRow
        value={r.color}
        auto={roomFill(theme, { cat: r.cat }, true)}
        onChange={(v) => edit((o) => setOpt(o, 'color', v))}
      />
      {flagToggle<Room>(ref, 'gm', S.props.gmOnly, !!r.gm)}
      {flagToggle<Room>(ref, 'hideLabel', S.props.hideLabel, !!r.hideLabel)}
      {flagToggle<Room>(ref, 'noWall', S.props.noWall, !!r.noWall)}
      <RoomWallField r={r} />
      <Typing>
        <Field label={S.props.note}>
          <TextArea
            rows={3}
            value={r.note ?? ''}
            placeholder={S.props.notePh}
            onChange={(e) => edit((o) => setOpt(o, 'note', e.target.value))}
          />
        </Field>
      </Typing>
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <Button
          size="sm"
          icon={<Sparkles />}
          onClick={() => act.arrangeRoomFurniture(r.id)}
          data-testid="arrange-room"
          className="self-start"
        >
          {S.props.arrange}
        </Button>
        <p className="m-0 text-xs text-muted">{S.props.arrangeHint}</p>
      </div>
      <Actions>
        {r.lx || r.ly ? (
          <Button
            size="sm"
            onClick={() =>
              edit((o) => {
                delete o.lx;
                delete o.ly;
              })
            }
          >
            {S.props.labelReset}
          </Button>
        ) : null}
        <CommonButtons order />
      </Actions>
    </>
  );
}

function ItemProps({ it }: { it: Item }) {
  const ref: SelRef = { type: 'item', id: it.id };
  const theme = getTheme(useProject((s) => s.data.theme));
  const edit = (fn: (o: Item) => void) => act.editObj<Item>(ref, fn);
  const num = (label: string, key: 'x' | 'y' | 'w' | 'h', min?: number) => (
    <Field label={label}>
      <NumberInput
        value={it[key]}
        step={0.25}
        precision={2}
        min={min}
        unit={S.props.cells}
        onChange={(v) =>
          edit((o) => {
            o[key] = Math.max(min ?? -Infinity, round2(v));
          })
        }
      />
    </Field>
  );
  return (
    <>
      <Head kicker={S.props.item} title={ASSET[it.t]?.name ?? it.t} />
      <Typing>
        <Field label={S.props.labelText}>
          <TextInput
            value={it.label ?? ''}
            maxLength={200}
            placeholder={S.props.labelPh}
            data-focus="label"
            onChange={(e) => edit((o) => setOpt(o, 'label', e.target.value))}
          />
        </Field>
      </Typing>
      <Field label={S.props.rotation}>
        <Segmented
          value={String(it.rot || 0)}
          onValueChange={(v) => edit((o) => rotateItem(o, Number(v) - (o.rot || 0)))}
          options={[0, 90, 180, 270].map((d) => ({ value: String(d), label: `${d}°` }))}
          size="sm"
        />
      </Field>
      <Typing>
        <FieldRow columns={2}>
          {num(S.props.x, 'x')}
          {num(S.props.y, 'y')}
          {num(S.props.w, 'w', 0.25)}
          {num(S.props.h, 'h', 0.25)}
        </FieldRow>
      </Typing>
      <Readout label={S.props.area} value={metersText(it.w, it.h)} />
      {flagToggle<Item>(ref, 'flip', S.props.flip, !!it.flip)}
      <ColorRow
        value={it.color}
        auto={theme.furn.paper.startsWith('#') ? theme.furn.paper : '#ffffff'}
        onChange={(v) => edit((o) => setOpt(o, 'color', v))}
      />
      {flagToggle<Item>(ref, 'gm', S.props.gmOnly, !!it.gm)}
      {flagToggle<Item>(ref, 'clue', S.props.clue, !!it.clue)}
      <Actions>
        <CommonButtons order />
      </Actions>
    </>
  );
}

function OpeningProps({ o }: { o: Opening }) {
  const ref: SelRef = { type: 'opening', id: o.id };
  const edit = (fn: (x: Opening) => void) => act.editObj<Opening>(ref, fn);
  return (
    <>
      <Head kicker={S.props.opening} title={S.openings[o.kind]} />
      <Field label={S.props.openingKind}>
        <Select
          value={o.kind}
          onValueChange={(v) =>
            edit((x) => {
              x.kind = v;
            })
          }
          options={[
            {
              label: S.lib.doors,
              options: OPENINGS.filter((x) => x.group === 'door').map((x) => ({
                value: x.id,
                label: S.openings[x.id],
              })),
            },
            {
              label: S.lib.windows,
              options: OPENINGS.filter((x) => x.group === 'window').map((x) => ({
                value: x.id,
                label: S.openings[x.id],
              })),
            },
          ]}
          data-focus="kind"
        />
      </Field>
      <Typing>
        <Field label={S.props.len}>
          <NumberInput
            value={o.len}
            step={0.25}
            precision={2}
            min={0.5}
            unit={S.props.cells}
            onChange={(v) =>
              edit((x) => {
                x.len = Math.max(0.5, round2(v));
              })
            }
          />
        </Field>
      </Typing>
      <Readout label={S.props.len} value={`${meterText(o.len)}m`} />
      {SWING_DOORS.has(o.kind) || o.kind === 'folding' ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={act.flipSwing}>
            {S.props.swingFlip}
          </Button>
          <Button size="sm" onClick={act.flipHinge}>
            {S.props.hingeFlip}
          </Button>
        </div>
      ) : null}
      {flagToggle<Opening>(ref, 'gm', S.props.gmOnly, !!o.gm)}
      <Actions>
        <CommonButtons />
      </Actions>
    </>
  );
}

function WallProps({ w }: { w: Wall }) {
  const ref: SelRef = { type: 'wall', id: w.id };
  return (
    <>
      <Head kicker={S.props.wall} title={S.walls[w.kind]} />
      <Field label={S.props.wallKind}>
        <Select
          value={w.kind}
          onValueChange={(v) =>
            act.editObj<Wall>(ref, (x) => {
              x.kind = v;
            })
          }
          options={WALL_KINDS.map((k) => ({ value: k.id, label: S.walls[k.id] }))}
          data-focus="kind"
        />
      </Field>
      <Readout
        label={S.props.length}
        value={`${meterText(Math.hypot(w.x2 - w.x1, w.y2 - w.y1))}m`}
      />
      {flagToggle<Wall>(ref, 'gm', S.props.gmOnly, !!w.gm)}
      <Actions>
        <CommonButtons />
      </Actions>
    </>
  );
}

function TextProps({ t }: { t: TextLabel }) {
  const ref: SelRef = { type: 'text', id: t.id };
  const theme = getTheme(useProject((s) => s.data.theme));
  const edit = (fn: (x: TextLabel) => void) => act.editObj<TextLabel>(ref, fn);
  return (
    <>
      <Head kicker={S.props.text} title={t.text.split('\n')[0] || '—'} />
      <Typing>
        <Field label={S.props.textBody}>
          <TextArea
            rows={2}
            value={t.text}
            data-focus="text"
            onChange={(e) =>
              edit((x) => {
                x.text = e.target.value;
              })
            }
          />
        </Field>
        <Field label={S.props.textSize}>
          <NumberInput
            value={t.size || 0.7}
            step={0.1}
            min={0.3}
            max={4}
            precision={2}
            unit={S.props.cells}
            onChange={(v) =>
              edit((x) => {
                x.size = clamp(round2(v), 0.3, 4);
              })
            }
          />
        </Field>
      </Typing>
      <Field label={S.props.bold} layout="inline">
        <Toggle
          checked={t.bold !== false}
          onCheckedChange={(v) =>
            edit((x) => {
              if (v) delete x.bold;
              else x.bold = false;
            })
          }
        />
      </Field>
      <Field label={S.props.textStyle}>
        <Segmented
          size="sm"
          aria-label={S.props.textStyle}
          value={t.badge ? 'badge' : 'plain'}
          onValueChange={(v) =>
            edit((x) => {
              if (v === 'badge') x.badge = true;
              else delete x.badge;
            })
          }
          options={[
            { value: 'plain', label: S.props.textStyles.plain },
            { value: 'badge', label: S.props.textStyles.badge },
          ]}
        />
      </Field>
      <ColorRow
        value={t.color}
        auto={theme.label.startsWith('#') ? theme.label : '#252930'}
        onChange={(v) => edit((x) => setOpt(x, 'color', v))}
      />
      {flagToggle<TextLabel>(ref, 'gm', S.props.gmOnly, !!t.gm)}
      {flagToggle<TextLabel>(ref, 'clue', S.props.clue, !!t.clue)}
      <Actions>
        <CommonButtons />
      </Actions>
    </>
  );
}

function MultiProps({
  refs,
}: {
  refs: { type: SelRef['type']; id: string; obj: Record<string, unknown> }[];
}) {
  const gm = refs.every((r) => r.obj.gm);
  const clueTargets = refs.filter((r) => r.type === 'item' || r.type === 'text');
  const clue = clueTargets.length > 0 && clueTargets.every((r) => r.obj.clue);
  const rooms = refs.filter((r) => r.type === 'room');
  const locked = rooms.length > 0 && rooms.every((r) => r.obj.locked);
  return (
    <>
      <Head kicker={S.props.multi(refs.length)} title="" />
      <Field label={S.props.gmOnly} layout="inline">
        <Toggle checked={gm} onCheckedChange={act.toggleGm} />
      </Field>
      {clueTargets.length ? (
        <Field label={S.props.clue} layout="inline">
          <Toggle checked={clue} onCheckedChange={act.toggleClue} />
        </Field>
      ) : null}
      {rooms.length === 2 && refs.length === 2 ? (
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            icon={<Link2 />}
            onClick={act.connectSelection}
            data-testid="connect-rooms"
            className="self-start"
          >
            {S.props.connect}
          </Button>
          <p className="m-0 text-xs text-muted">{S.props.connectHint}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {rooms.length ? (
          <>
            <Button size="sm" onClick={act.toggleLock}>
              {locked ? S.props.unlock : S.props.lock}
            </Button>
            <Button size="sm" onClick={act.rotateSelection}>
              {S.props.rotate}
            </Button>
          </>
        ) : refs.some((r) => r.type === 'item') ? (
          <>
            <Button size="sm" onClick={act.rotateSelection}>
              {S.props.rotate}
            </Button>
            <Button size="sm" onClick={act.flipSelection}>
              {S.mini.flip}
            </Button>
          </>
        ) : null}
      </div>
      <p className="m-0 text-xs text-muted">{S.props.multiNote}</p>
      <Actions>
        <CommonButtons order />
      </Actions>
    </>
  );
}

export function PropsPanel() {
  const sel = useEditor((s) => s.sel);
  useProject((s) => s.data);
  const f = currentFloor();
  const objs = sel
    .map((s) => ({
      ...s,
      obj: getObj(f, s.type, s.id) as unknown as Record<string, unknown> | null,
    }))
    .filter((s): s is typeof s & { obj: Record<string, unknown> } => !!s.obj);
  let body: ReactNode;
  if (!objs.length) body = <MapProps />;
  else if (objs.length > 1) body = <MultiProps refs={objs} />;
  else {
    const { type, obj } = objs[0];
    if (type === 'room') body = <RoomProps key={objs[0].id} r={obj as unknown as Room} />;
    else if (type === 'item') body = <ItemProps key={objs[0].id} it={obj as unknown as Item} />;
    else if (type === 'opening')
      body = <OpeningProps key={objs[0].id} o={obj as unknown as Opening} />;
    else if (type === 'wall') body = <WallProps key={objs[0].id} w={obj as unknown as Wall} />;
    else body = <TextProps key={objs[0].id} t={obj as unknown as TextLabel} />;
  }
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-surface p-3"
      data-testid="props-panel"
    >
      {body}
    </div>
  );
}
