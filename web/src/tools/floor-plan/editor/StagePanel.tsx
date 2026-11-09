/**
 * 演出的面板（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的「04 演出」面板，F313～F328）：
 * - 畫布左上的演出工具（藏起來／公開、移動路線、平移畫面）；
 * - 右邊（屬性面板的位置）：自動產生演出、① 藏起來、② 移動路線、③ 播放與匯出、演出的四個步驟；
 * - 左邊（素材面板的位置）：全部樓層的房間與公開時機（藏起來／公開、放大、公開時機的選單、拖到時間軸）。
 */
import {
  Eye,
  EyeOff,
  Flag,
  Hand,
  Play,
  Route,
  SkipForward,
  Sparkles,
  Trash2,
  Undo2,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';
import type { DragEvent } from 'react';
import { Button, cn, Field, IconButton, REWIND_LABEL, Select, UsageSection } from '@/ui';
import { revealText } from '../draw/stage';
import { roomKey } from '../model/route';
import { stackLevels } from '../model/stack';
import { isFloorStageHidden, isStageRoom } from '../model/stage';
import type { Room, StageWhen } from '../model/types';
import { ST } from '../stageStrings';
import { editor } from './controller';
import {
  autoGenerate,
  clearHidden,
  clearRoutes,
  clearStart,
  hideFloor,
  type StageCamera,
  type StagePlayView,
  setFloorHidden,
  setHide,
  setStageCameraMode,
  setStagePlayView,
  setStageTool,
  setWhen,
  undoRoute,
} from './stageActions';
import { timelineOf } from './stageCache';
import { type StageTool, setStage, useStage } from './stageStore';
import { usePrefs, useProject } from './store';

/** 房間的晶片拖曳時帶的資料型別（時間軸收） */
export const ROOM_DRAG_TYPE = 'application/x-floor-plan-stage-room';

export function startRoomDrag(e: DragEvent, key: string): void {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(ROOM_DRAG_TYPE, key);
  e.dataTransfer.setData('text/plain', key);
}

const TOOLS: { id: StageTool; icon: React.ReactNode; label: string }[] = [
  { id: 'hide', icon: <EyeOff />, label: ST.toolHide },
  { id: 'route', icon: <Route />, label: ST.toolRoute },
  { id: 'hand', icon: <Hand />, label: ST.toolHand },
];

/** 畫布左上的演出工具 */
export function StageToolStrip() {
  const tool = useStage((s) => s.tool);
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={ST.tools}
      className="absolute top-2 left-2 z-10 flex flex-col gap-0.5 rounded-md border border-border bg-surface p-1 shadow-1"
      data-testid="stage-tools"
    >
      {TOOLS.map((t) => (
        <IconButton
          key={t.id}
          size="sm"
          variant="ghost"
          icon={t.icon}
          label={t.label}
          pressed={tool === t.id}
          onClick={() => setStageTool(t.id)}
          data-stage-tool={t.id}
        />
      ))}
    </div>
  );
}

function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="m-0 text-sm font-semibold">{title}</p>
      {hint ? <p className="m-0 text-xs text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

/** 公開時機的選單的選項（「指定的路線不見了」也列出來） */
export function whenOptions(routes: number, current: string) {
  const opts: { value: string; label: string }[] = [{ value: 'auto', label: ST.whenAuto }];
  for (let i = 0; i < routes; i++) opts.push({ value: `#${i}`, label: ST.whenRoute(i + 1) });
  opts.push({ value: 'after', label: ST.whenAfter }, { value: 'manual', label: ST.whenManual });
  if (!opts.some((o) => o.value === current)) opts.push({ value: current, label: ST.info.missing });
  return opts;
}

/** 房間的公開時機：選單的值 ↔ 存的值 */
export function whenValue(when: StageWhen | undefined, routeIds: readonly string[]): string {
  if (!when) return 'auto';
  if (when.startsWith('route:')) {
    const i = routeIds.indexOf(when.slice(6));
    return i >= 0 ? `#${i}` : when;
  }
  return when;
}

export function whenFrom(v: string, routeIds: readonly string[]): StageWhen | 'auto' {
  if (v.startsWith('#')) {
    const id = routeIds[Number(v.slice(1))];
    return id ? `route:${id}` : 'after';
  }
  if (v === 'auto' || v === 'after' || v === 'manual') return v;
  return 'after';
}

/** 右邊：演出的面板 */
export function StagePanel() {
  const p = useProject((s) => s.data);
  const tool = useStage((s) => s.tool);
  const start = useStage((s) => s.start);
  const player = useStage((s) => s.player);
  const playing = useStage((s) => s.playing);
  const playView = usePrefs((s) => s.data.stageView ?? 'board');
  const camera = usePrefs((s) => s.data.stageCamera ?? 'follow');
  const tl = timelineOf(p);
  const levels = stackLevels(p.floors);
  const startRoom = start
    ? p.floors.find((f) => f.id === start.floor)?.rooms.find((r) => r.id === start.room)
    : null;
  const startFloor = start ? p.floors.find((f) => f.id === start.floor) : null;
  const active = p.floors[p.active];
  const routes = tl.ctx.routes.length;
  return (
    <div className="flex flex-col gap-3" data-testid="stage-panel">
      <div className="min-w-0">
        <p className="m-0 text-xs text-muted">{ST.kicker}</p>
        <p className="m-0 text-base font-semibold" data-testid="props-title">
          {ST.title}
        </p>
      </div>
      <p className="m-0 text-xs text-muted">{ST.lead}</p>
      <Button variant="primary" icon={<Sparkles />} onClick={autoGenerate} data-testid="stage-auto">
        {ST.auto}
      </Button>
      <p className="-mt-1 m-0 text-xs text-muted">{ST.autoHint}</p>

      <Step title={ST.step1} hint={ST.step1Hint}>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            icon={<EyeOff />}
            aria-pressed={tool === 'hide'}
            variant={tool === 'hide' ? 'primary' : 'secondary'}
            onClick={() => setStageTool('hide')}
            data-testid="stage-tool-hide"
          >
            {ST.toolHide}
          </Button>
        </div>
        <p className="m-0 text-xs font-semibold text-muted">{ST.floors}</p>
        <div className="flex flex-wrap gap-1.5" data-testid="stage-floors">
          {[...levels].reverse().map(({ floor }) => {
            const on = isFloorStageHidden(p, floor.id);
            return (
              <Button
                key={floor.id}
                size="sm"
                variant={on ? 'primary' : 'secondary'}
                icon={on ? <EyeOff /> : <Eye />}
                aria-pressed={on}
                aria-label={ST.floorToggle(floor.name || '—', on)}
                onClick={() => setFloorHidden(floor.id, !on)}
                data-stage-floor={floor.id}
              >
                {floor.name || '—'}
              </Button>
            );
          })}
        </div>
        <p className="m-0 text-xs text-muted">{ST.floorsHint}</p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            onClick={() => hideFloor()}
            disabled={!active}
            data-testid="stage-hide-floor"
          >
            {ST.hideFloor(active?.name || '—')}
          </Button>
          <Button size="sm" variant="ghost" onClick={clearHidden} data-testid="stage-clear-hidden">
            {ST.clearHidden}
          </Button>
        </div>
      </Step>

      <Step title={ST.step2} hint={ST.step2Hint}>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            icon={<Route />}
            aria-pressed={tool === 'route'}
            variant={tool === 'route' ? 'primary' : 'secondary'}
            onClick={() => setStageTool('route')}
            data-testid="stage-tool-route"
          >
            {ST.toolRoute}
          </Button>
        </div>
        {startRoom ? (
          <div
            className="flex items-center gap-2 rounded-md border border-accent bg-accent-soft px-2 py-1.5 text-xs"
            data-testid="stage-start"
          >
            <Flag aria-hidden className="size-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              {ST.start(startFloor?.name || '—', startRoom.name || ST.unnamed)}
            </span>
            <IconButton
              size="sm"
              variant="ghost"
              icon={<X />}
              label={ST.clearStart}
              onClick={clearStart}
            />
          </div>
        ) : null}
        <p className="m-0 text-xs text-muted" data-testid="stage-route-count">
          {ST.routes(routes)}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            icon={<Undo2 />}
            onClick={undoRoute}
            disabled={!routes}
            data-testid="stage-undo-route"
          >
            {ST.undoRoute}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            onClick={clearRoutes}
            disabled={!routes}
            data-testid="stage-clear-routes"
          >
            {ST.clearRoutes}
          </Button>
        </div>
      </Step>

      <Step title={ST.step3}>
        <Field label={ST.playView}>
          <Select<StagePlayView>
            value={playView}
            onValueChange={setStagePlayView}
            options={(['board', 'stack', 'keep'] as const).map((v) => ({
              value: v,
              label: ST.playViews[v],
            }))}
            data-testid="stage-play-view"
          />
        </Field>
        <Field label={ST.camera}>
          <Select<StageCamera>
            value={camera}
            onValueChange={setStageCameraMode}
            options={(['follow', 'fixed'] as const).map((v) => ({
              value: v,
              label: ST.cameras[v],
            }))}
            data-testid="stage-camera"
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="primary"
            icon={<Play />}
            disabled={!player}
            onClick={() => player?.toggle()}
            data-testid="stage-play"
          >
            {playing ? ST.pause : ST.play}
          </Button>
          <Button
            size="sm"
            icon={<SkipForward />}
            disabled={!player}
            onClick={() => player?.next()}
            title={ST.nextTip}
          >
            {ST.next}
          </Button>
          <Button size="sm" variant="ghost" disabled={!player} onClick={() => player?.rewind()}>
            {REWIND_LABEL}
          </Button>
        </div>
        <Button
          icon={<Video />}
          onClick={() => setStage({ exportOpen: true })}
          data-testid="stage-export-open"
        >
          {ST.exportOpen}
        </Button>
      </Step>

      <UsageSection title={ST.guideTitle} persistKey="floor-plan-stage">
        <ol>
          {ST.guide.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted">{ST.guideNote}</p>
      </UsageSection>
    </div>
  );
}

/** 左邊：全部樓層的房間與公開時機 */
export function StageRooms() {
  const p = useProject((s) => s.data);
  const tl = timelineOf(p);
  const routeIds = tl.ctx.routes.map((r) => r.id);
  const levels = [...stackLevels(p.floors)].reverse();
  const preview = useStage((s) => s.preview);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-surface p-3"
      data-testid="stage-rooms"
    >
      <div>
        <p className="m-0 text-base font-semibold">{ST.listTitle}</p>
        <p className="m-0 text-xs text-muted">{ST.listLead}</p>
      </div>
      {levels.map(({ floor }) => {
        const rooms = floor.rooms.filter((r) => isStageRoom(r));
        const hidden = rooms.filter((r) => tl.info.has(roomKey(floor.id, r.id))).length;
        return (
          <section
            key={floor.id}
            className="flex flex-col gap-1.5"
            data-stage-list-floor={floor.id}
          >
            <p className="m-0 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
              {ST.listFloor(floor.name || '—', hidden, rooms.length)}
              {isFloorStageHidden(p, floor.id) ? (
                <span className="rounded-sm bg-accent-soft px-1 text-accent">{ST.badgeFloor}</span>
              ) : null}
              {floor.secret ? (
                <span className="rounded-sm bg-surface-3 px-1">{ST.secretFloor}</span>
              ) : null}
            </p>
            {rooms.length ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {rooms.map((r) => (
                  <RoomRow
                    key={r.id}
                    floorId={floor.id}
                    room={r}
                    routeIds={routeIds}
                    preview={preview}
                  />
                ))}
              </ul>
            ) : (
              <p className="m-0 text-xs text-muted">{ST.listNone}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RoomRow({
  floorId,
  room,
  routeIds,
  preview,
}: {
  floorId: string;
  room: Room;
  routeIds: string[];
  preview: boolean;
}) {
  const p = useProject((s) => s.data);
  const tl = timelineOf(p);
  const key = roomKey(floorId, room.id);
  const info = tl.info.get(key);
  const entry = p.stage?.rooms?.find((e) => e.floor === floorId && e.room === room.id);
  const name = room.name || ST.unnamed;
  const value = whenValue(entry?.when, routeIds);
  return (
    <li
      className={cn(
        'flex flex-col gap-1 rounded-md border px-2 py-1.5',
        info ? 'border-accent bg-accent-soft' : 'border-border',
      )}
      draggable
      onDragStart={(e) => startRoomDrag(e, key)}
      title={ST.dragChip}
      data-stage-room={key}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {info ? (
          <EyeOff aria-hidden className="size-3.5 shrink-0 text-accent" />
        ) : (
          <Eye aria-hidden className="size-3.5 shrink-0 text-muted" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setHide(floorId, room, !info)}
          disabled={preview}
          data-testid="stage-room-toggle"
        >
          {info ? ST.show : ST.hide}
        </Button>
        <IconButton
          size="sm"
          variant="ghost"
          icon={<ZoomIn />}
          label={`${ST.focus}：${name}`}
          onClick={() => editor.stage?.focusRoom(floorId, room)}
        />
      </div>
      {info ? (
        <>
          <span className="text-xs text-accent">{revealText(info)}</span>
          <Select
            size="sm"
            value={value}
            onValueChange={(v) => setWhen(key, whenFrom(v, routeIds))}
            options={whenOptions(routeIds.length, value)}
            aria-label={ST.whenOf(name)}
            data-stage-when={key}
          />
        </>
      ) : null}
    </li>
  );
}
