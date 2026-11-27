/**
 * 右側的屬性：沒選東西時是地圖概要；選了區域、通道、設備、備註時是各自的設定。
 */
import { Copy, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { historyGesture } from '@/core/storage';
import { Button, Checkbox, Field, IconButton, NumberInput, Select, Slider, TextInput } from '@/ui';
import { BREAKABLE } from '../draw/fixtures';
import { fixtureDef, ROOM_USES } from '../model/catalog';
import { layoutOf } from '../model/layout';
import { roomWidthRange, setRoomWidth, shaftFloors } from '../model/ops';
import {
  CAB_STATES,
  floorCode,
  LIMITS,
  type Moment,
  RANGES,
  type RoomUse,
  type SectionDoc,
  SHAFT_KINDS,
  WALL_TONES,
  type WallTone,
} from '../model/types';
import { docStats } from '../model/visibility';
import { S } from '../strings';
import * as act from './actions';
import { setEditor, useDoc, useEditor } from './store';

const g = historyGesture(useDoc);
const I = S.inspector;

type Phase = 'any' | Moment;
const PHASE_OPTIONS = (['any', 'before', 'after'] as const).map((v) => ({
  value: v,
  label: S.phases[v],
}));

function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <h2 className="m-0 truncate text-sm font-semibold">{title}</h2>
        {sub ? <p className="m-0 truncate text-xs text-muted">{sub}</p> : null}
      </div>
      <IconButton size="sm" icon={<X />} label={I.close} onClick={() => setEditor({ sel: null })} />
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
      <small className="block text-xs text-muted">{label}</small>
      <b className="text-base tabular-nums" data-testid={testId}>
        {value}
      </b>
    </div>
  );
}

function Overview({ doc }: { doc: SectionDoc }) {
  const st = docStats(doc);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-semibold">{I.overview}</h2>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label={I.floors} value={st.floors} testId="stat-floors" />
        <Stat label={I.rooms} value={st.rooms} testId="stat-rooms" />
        <Stat label={I.secrets} value={st.secrets} testId="stat-secrets" />
        <Stat label={I.shafts} value={st.shafts} testId="stat-shafts" />
      </div>
      <p className="m-0 text-xs text-muted">
        {I.floorsDetail(st.above, st.below)}・{I.items} {st.items}
      </p>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-muted">
        {I.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function RoomPanel({ doc, id }: { doc: SectionDoc; id: string }) {
  const found = act.findRoom(doc, id);
  if (!found) return null;
  const { room, floorId } = found;
  const floor = doc.building.floors.find((f) => f.id === floorId);
  const items = doc.items.filter((it) => it.room === id).length;
  const range = roomWidthRange(doc, id);
  const w = room.x1 - room.x0;
  return (
    <div className="flex flex-col gap-3" data-testid="room-panel">
      <Head title={I.room} sub={floor ? `${floorCode(floor.level)} ${floor.name}` : undefined} />
      <Field label={I.roomName}>
        <TextInput
          value={room.name}
          maxLength={LIMITS.name}
          data-testid="room-name"
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) => act.patchRoom(id, { name: e.target.value })}
        />
      </Field>
      {floor ? (
        <Field label={I.floorName}>
          <TextInput
            value={floor.name}
            maxLength={LIMITS.name}
            onFocus={g.begin}
            onBlur={g.commit}
            onChange={(e) => act.patchFloorName(floor.id, e.target.value)}
          />
        </Field>
      ) : null}
      <Field label={I.use} hint={I.applyUseHint}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Select
            value={room.use}
            onValueChange={(v: RoomUse) => act.patchRoom(id, { use: v })}
            options={ROOM_USES.map((u) => ({ value: u, label: S.uses[u] }))}
            data-testid="room-use"
          />
          <Button size="sm" onClick={() => act.applyRoomUse(id, room.use)} data-testid="apply-use">
            {I.applyUse}
          </Button>
        </div>
      </Field>
      <Field label={I.wall}>
        <Select
          value={room.wall}
          onValueChange={(v: WallTone) => act.patchRoom(id, { wall: v })}
          options={WALL_TONES.map((t) => ({ value: t, label: S.walls[t] }))}
        />
      </Field>
      <Field label={I.width} hint={range ? I.widthHint : I.widthFixed}>
        <NumberInput
          value={w}
          min={range?.min ?? w}
          max={range?.max ?? w}
          step={1}
          unit="格"
          disabled={!range}
          aria-label={I.width}
          onChange={(v) =>
            useDoc.getState().update((d) => {
              setRoomWidth(d, id, Math.round(v));
            })
          }
        />
      </Field>
      <Checkbox
        checked={room.secret}
        onCheckedChange={(v) => act.setRoomSecret(id, v)}
        label={
          <span className="flex flex-col">
            <span>{I.secret}</span>
            <small className="text-xs text-muted">{I.secretHint}</small>
          </span>
        }
      />
      <Checkbox
        checked={room.hideName}
        onCheckedChange={(v) => act.patchRoom(id, { hideName: v })}
        label={I.hideName}
      />
      <p className="m-0 text-xs text-muted tabular-nums">{I.roomInfo(w, items)}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" onClick={() => act.splitFloorRooms(floorId)}>
          {I.split}
        </Button>
        <Button size="sm" variant="danger" disabled={!items} onClick={() => act.clearRoomItems(id)}>
          {I.clearItems}
        </Button>
      </div>
    </div>
  );
}

function ShaftPanel({ doc, id }: { doc: SectionDoc; id: string }) {
  const s = doc.building.shafts.find((v) => v.id === id);
  if (!s) return null;
  const floors = [...doc.building.floors].sort((a, b) => b.level - a.level);
  const levelOptions = floors.map((f) => ({ value: String(f.level), label: floorCode(f.level) }));
  const through = shaftFloors(doc.building, s);
  const w = S.shafts[s.kind];
  const maxX = Math.max(
    0,
    doc.building.width - (layoutOf(doc).shafts.find((v) => v.shaft.id === id)?.w ?? 1),
  );
  return (
    <div className="flex flex-col gap-3" data-testid="shaft-panel">
      <Head title={I.shaft} sub={w} />
      <Field label={I.kind}>
        <Select
          value={s.kind}
          onValueChange={(v) => act.changeShaftKind(id, v)}
          options={SHAFT_KINDS.map((k) => ({ value: k, label: S.shafts[k] }))}
          data-testid="shaft-kind"
        />
      </Field>
      <Field label={I.x}>
        <Slider
          value={s.x}
          min={0}
          max={maxX}
          step={1}
          unit="格"
          onChange={g.live((v) =>
            act.updateShaft(id, (sh) => {
              sh.x = v;
            }),
          )}
          onCommit={g.commit}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={I.top}>
          <Select
            value={String(s.top)}
            onValueChange={(v) =>
              act.updateShaft(id, (sh) => {
                sh.top = Number(v);
                if (sh.bottom > sh.top) sh.bottom = sh.top;
              })
            }
            options={levelOptions}
          />
        </Field>
        <Field label={I.bottom}>
          <Select
            value={String(s.bottom)}
            onValueChange={(v) =>
              act.updateShaft(id, (sh) => {
                sh.bottom = Number(v);
                if (sh.top < sh.bottom) sh.top = sh.bottom;
              })
            }
            options={levelOptions}
          />
        </Field>
      </div>
      {s.kind === 'elevator' && through.length ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={I.cab}>
            <Select
              value={String(through.some((f) => f.level === s.cab) ? s.cab : through[0].level)}
              onValueChange={(v) =>
                act.updateShaft(id, (sh) => {
                  sh.cab = Number(v);
                })
              }
              options={through.map((f) => ({ value: String(f.level), label: floorCode(f.level) }))}
            />
          </Field>
          <Field label={I.cabState}>
            <Select
              value={s.cabState}
              onValueChange={(v) =>
                act.updateShaft(id, (sh) => {
                  sh.cabState = v;
                })
              }
              options={CAB_STATES.map((c) => ({ value: c, label: S.cab[c] }))}
            />
          </Field>
        </div>
      ) : null}
      <Checkbox
        checked={s.secret || s.kind === 'duct'}
        disabled={s.kind === 'duct'}
        onCheckedChange={(v) =>
          act.updateShaft(id, (sh) => {
            sh.secret = v;
          })
        }
        label={
          <span className="flex flex-col">
            <span>{I.gmOnly}</span>
            <small className="text-xs text-muted">
              {s.kind === 'duct' ? I.ductAlways : I.gmShaftHint}
            </small>
          </span>
        }
      />
      <Button variant="danger" size="sm" icon={<Trash2 />} onClick={() => act.deleteShaft(id)}>
        {S.build.delShaft}
      </Button>
    </div>
  );
}

function ItemPanel({ doc, id }: { doc: SectionDoc; id: string }) {
  const it = doc.items.find((v) => v.id === id);
  const def = it ? fixtureDef(it.kind) : undefined;
  if (!it || !def) return null;
  const phase: Phase = it.only ?? 'any';
  return (
    <div className="flex flex-col gap-3" data-testid="item-panel">
      <Head title={S.fixtures[it.kind] ?? it.kind} sub={I.item} />
      {def.styles ? (
        <Field label={I.variant}>
          <Select
            value={it.variant ?? def.styles[0]}
            onValueChange={(v) =>
              act.patchItem(id, { variant: v === def.styles?.[0] ? undefined : v })
            }
            options={def.styles.map((v) => ({ value: v, label: S.variants[v] ?? v }))}
          />
        </Field>
      ) : null}
      <Field label={I.rx}>
        <Slider
          value={Math.round(it.rx * 100)}
          min={RANGES.rx.min * 100}
          max={RANGES.rx.max * 100}
          step={1}
          unit="%"
          onChange={g.live((v) => act.patchItem(id, { rx: v / 100 }))}
          onCommit={g.commit}
        />
      </Field>
      {def.hang === 'wall' ? (
        <Field label={I.ry}>
          <Slider
            value={Math.round(it.ry * 100)}
            min={RANGES.ry.min * 100}
            max={RANGES.ry.max * 100}
            step={2}
            unit="%"
            onChange={g.live((v) => act.patchItem(id, { ry: v / 100 }))}
            onCommit={g.commit}
          />
        </Field>
      ) : null}
      <Field label={I.scale}>
        <Slider
          value={Math.round(it.scale * 100)}
          min={RANGES.scale.min * 100}
          max={RANGES.scale.max * 100}
          step={5}
          unit="%"
          onChange={g.live((v) => act.patchItem(id, { scale: v / 100 }))}
          onCommit={g.commit}
        />
      </Field>
      <Field label={I.only}>
        <Select
          value={phase}
          onValueChange={(v: Phase) => act.patchItem(id, { only: v === 'any' ? undefined : v })}
          options={PHASE_OPTIONS}
          data-testid="item-only"
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <Checkbox
          checked={it.flip}
          onCheckedChange={(v) => act.patchItem(id, { flip: v })}
          label={I.flip}
        />
        {BREAKABLE.has(it.kind) ? (
          <Checkbox
            checked={!!it.smashed}
            onCheckedChange={(v) => act.patchItem(id, { smashed: v })}
            label={I.smashed}
          />
        ) : null}
        <Checkbox
          checked={!!it.upset}
          onCheckedChange={(v) => act.patchItem(id, { upset: v })}
          label={I.upset}
        />
        <Checkbox
          checked={!!it.secret}
          onCheckedChange={(v) => act.patchItem(id, { secret: v })}
          label={I.itemSecret}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" icon={<Copy />} onClick={() => act.duplicateItem(id)}>
          {I.duplicate}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          onClick={act.deleteSelected}
          data-testid="item-delete"
        >
          {I.del}
        </Button>
      </div>
    </div>
  );
}

function NotePanel({ doc, id }: { doc: SectionDoc; id: string }) {
  const n = doc.notes.find((v) => v.id === id);
  if (!n) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="note-panel">
      <Head title={I.note} sub={n.room ? undefined : I.noteFree} />
      <Field
        label={I.text}
        labelSuffix={
          <small className="text-xs text-muted tabular-nums">
            {I.count([...n.text].length, LIMITS.note)}
          </small>
        }
      >
        <TextInput
          value={n.text}
          maxLength={LIMITS.note}
          data-testid="note-text"
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) => act.patchNote(id, { text: e.target.value })}
        />
      </Field>
      <Field label={I.noteStyle}>
        <Select
          value={n.style}
          onValueChange={(v) => act.patchNote(id, { style: v })}
          options={[
            { value: 'box', label: I.noteBox },
            { value: 'badge', label: I.noteBadge },
          ]}
        />
      </Field>
      <Field label={I.noteSize}>
        <Slider
          value={n.size}
          min={RANGES.noteSize.min}
          max={RANGES.noteSize.max}
          step={0.02}
          unit="格"
          onChange={g.live((v) => act.patchNote(id, { size: v }))}
          onCommit={g.commit}
        />
      </Field>
      <Field label={I.only}>
        <Select
          value={n.only ?? 'any'}
          onValueChange={(v: Phase) => act.patchNote(id, { only: v === 'any' ? undefined : v })}
          options={PHASE_OPTIONS}
        />
      </Field>
      <Checkbox
        checked={!!n.secret}
        onCheckedChange={(v) => act.patchNote(id, { secret: v })}
        label={I.noteSecret}
      />
      <Button size="sm" variant="danger" icon={<Trash2 />} onClick={act.deleteSelected}>
        {I.del}
      </Button>
    </div>
  );
}

export function Inspector() {
  const doc = useDoc((s) => s.data);
  const sel = useEditor((s) => s.sel);
  const audience = useEditor((s) => s.audience);
  const active = audience === 'player' ? null : sel;
  return (
    <div
      className="flex min-h-0 min-w-0 flex-col gap-3 rounded-md border border-border bg-surface p-3 lg:overflow-y-auto"
      data-testid="inspector"
    >
      {!active ? <Overview doc={doc} /> : null}
      {active?.kind === 'room' ? <RoomPanel doc={doc} id={active.id} /> : null}
      {active?.kind === 'shaft' ? <ShaftPanel doc={doc} id={active.id} /> : null}
      {active?.kind === 'item' ? <ItemPanel doc={doc} id={active.id} /> : null}
      {active?.kind === 'note' ? <NotePanel doc={doc} id={active.id} /> : null}
    </div>
  );
}
