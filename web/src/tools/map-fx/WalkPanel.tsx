/**
 * 設定欄的「進階 3D」分頁（規格 1.11）：做法、房間與走廊（從房間遮罩建立、清單：房名、種類、刪除）、入口、移動路線、
 * 立體的樣子（牆高、入口寬、房名顯示、地圖鋪在地上）、走過去的秒數。不含 three.js（3D 在預覽欄，WalkPreview）。
 */
import { Trash2, WandSparkles } from 'lucide-react';
import { Button, Field, IconButton, Section, Segmented, TextInput, Toggle, useToast } from '@/ui';
import { FxRangeSlider } from '@/ui/imagefx';
import {
  clearDoors,
  clearPath,
  gesture,
  removeRoom,
  roomsFromRedacts,
  selectWalk,
  setWalkOptions,
  undoPathPoint,
  updateRoom,
  useDoc,
  useWalk,
} from './store';
import { S } from './strings';
import {
  WALK_KINDS,
  WALK_LIMITS,
  WALK_RANGES,
  type WalkKind,
  type WalkRangeKey,
  type WalkRoom,
  walkTotal,
} from './walk';

function WalkSlider({ k, value, unit }: { k: WalkRangeKey; value: number; unit?: string }) {
  return (
    <FxRangeSlider
      range={WALK_RANGES[k]}
      value={value}
      unit={unit}
      onChange={gesture.live((v: number) => setWalkOptions({ [k]: v }))}
      onCommit={gesture.commit}
    />
  );
}

function RoomRow({ room, index }: { room: WalkRoom; index: number }) {
  const selected = useWalk((l) => l.selected?.kind === 'room' && l.selected.id === room.id);
  const label = S.walk.roomItem(index + 1, S.walk.kinds[room.kind], room.name.trim());
  return (
    <li
      className={`flex flex-col gap-2 rounded-md border p-2 ${selected ? 'border-accent bg-accent-soft' : 'border-border'}`}
      data-room-item={room.id}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
          onClick={() => {
            selectWalk({ kind: 'room', id: room.id });
            useWalk.setState({ tool: room.kind });
          }}
          aria-pressed={selected}
        >
          {label}
        </button>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.walk.removeRoomLabel(label)}
          icon={<Trash2 />}
          onClick={() => removeRoom(room.id)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<WalkKind>
          size="sm"
          aria-label={S.walk.kindLabel}
          value={room.kind}
          onValueChange={(v) => updateRoom(room.id, { kind: v })}
          options={WALK_KINDS.map((k) => ({ value: k, label: S.walk.kinds[k] }))}
        />
        <TextInput
          className="min-w-0 flex-1"
          aria-label={`${S.walk.roomName}（${label}）`}
          value={room.name}
          maxLength={WALK_LIMITS.name}
          placeholder={S.walk.roomNamePlaceholder}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) =>
            updateRoom(room.id, {
              name: Array.from(e.target.value.replace(/\r?\n|\r/g, ' '))
                .slice(0, WALK_LIMITS.name)
                .join(''),
            })
          }
        />
      </div>
    </li>
  );
}

export function WalkPanel() {
  const walk = useDoc((s) => s.data.walk);
  const hasImage = useDoc((s) => !!s.data.image);
  const masks = useDoc((s) => s.data.frames.filter((f) => f.kind === 'redact').length);
  const toast = useToast();
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.tabs.walk} description={S.walk.intro} persistKey="walk-intro">
        <ol
          className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm"
          aria-label={S.walk.stepsLabel}
        >
          {S.walk.steps.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        {hasImage ? null : <p className="m-0 text-sm text-warning">{S.walk.needImage}</p>}
      </Section>

      <Section
        title={S.walk.sectionRooms}
        actions={
          <span className="text-xs text-muted tabular-nums">
            {S.walk.roomCount(walk.rooms.length, WALK_LIMITS.rooms)}
          </span>
        }
        persistKey="walk-rooms"
      >
        <div className="flex flex-col gap-1.5">
          <div>
            <Button
              size="sm"
              icon={<WandSparkles />}
              disabled={!hasImage || !masks || walk.rooms.length >= WALK_LIMITS.rooms}
              onClick={() => {
                const n = roomsFromRedacts();
                toast(
                  n
                    ? { title: S.walk.fromMasksDone(n), tone: 'success' }
                    : { title: S.walk.fromMasksNone, tone: 'info' },
                );
              }}
            >
              {S.walk.fromMasks}
            </Button>
          </div>
          <p className="m-0 text-xs text-muted">{S.walk.fromMasksHint}</p>
        </div>
        {walk.rooms.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.walk.sectionRooms}>
            {walk.rooms.map((r, i) => (
              <RoomRow key={r.id} room={r} index={i} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.walk.roomsEmpty}</p>
        )}
      </Section>

      <Section
        title={S.walk.sectionDoors}
        actions={
          <span className="text-xs text-muted tabular-nums">
            {S.walk.doorCount(walk.doors.length)}
          </span>
        }
        persistKey="walk-doors"
      >
        <p className="m-0 text-sm text-muted">{S.walk.doorsHint}</p>
        <div>
          <Button size="sm" variant="ghost" disabled={!walk.doors.length} onClick={clearDoors}>
            {S.walk.clearDoors}
          </Button>
        </div>
      </Section>

      <Section
        title={S.walk.sectionPath}
        actions={
          <span className="text-xs text-muted tabular-nums" data-testid="walk-path-count">
            {S.walk.pathCount(walk.path.length)}
          </span>
        }
        persistKey="walk-path"
      >
        <p className="m-0 text-sm text-muted">{S.walk.pathHint}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!walk.path.length} onClick={undoPathPoint}>
            {S.walk.pathUndo}
          </Button>
          <Button size="sm" variant="ghost" disabled={!walk.path.length} onClick={clearPath}>
            {S.walk.clearPath}
          </Button>
        </div>
      </Section>

      <Section title={S.walk.sectionLook} persistKey="walk-look">
        <Field label={S.walk.wall}>
          <WalkSlider k="wall" value={walk.wall} unit=" px" />
        </Field>
        <Field label={S.walk.door}>
          <WalkSlider k="door" value={walk.door} unit=" px" />
        </Field>
        <Toggle
          label={S.walk.names}
          checked={walk.names}
          onCheckedChange={(v) => setWalkOptions({ names: v })}
        />
        <Toggle
          label={S.walk.floor}
          checked={walk.floor}
          onCheckedChange={(v) => setWalkOptions({ floor: v })}
        />
      </Section>

      <Section title={S.walk.sectionWalk} persistKey="walk-time">
        <Field
          label={S.walk.duration}
          hint={S.walk.durationHint(walkTotal(walk).toFixed(1).replace(/\.0$/, ''))}
        >
          <WalkSlider k="duration" value={walk.duration} unit=" 秒" />
        </Field>
      </Section>
    </div>
  );
}
