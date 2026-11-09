/**
 * 演出的時間軸（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」畫面下方的演出タイムライン，F319～F322）：
 * 共用的播放列（Transport、usePlayback）＋「下一步」「全部公開」，下面每一步一張卡片（開始前、每一條路線、整層公開、
 * 所有路線之後的房間）：點卡片的標題看那一步完成的樣子；路線的順序（往前、往後、刪掉）；這一步公開的房間的晶片
 * （拖到別一步、選公開的時機）；「＋ 這條路線順便公開…」；最後一欄「點了才公開」。
 */
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  SkipForward,
  X,
} from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, cn, IconButton, Select, Transport, usePlayback } from '@/ui';
import { revealText, roomName } from '../draw/stage';
import { roomKey } from '../model/route';
import { roomHasPointClosed } from '../model/shape';
import { isStageRoom, type StageStep, type StageTimeline, stepAt } from '../model/stage';
import type { Project } from '../model/types';
import { S } from '../strings';
import { notify } from './actions';
import { ROOM_DRAG_TYPE, startRoomDrag } from './StagePanel';
import {
  deleteRoute,
  dropRoom,
  moveAfter,
  moveRoute,
  revealAll,
  type StageDropTarget,
  stopPreview,
} from './stageActions';
import { type StagePlayer, setStage, timelineOf, useStage } from './stageStore';
import { useProject } from './store';

const EPS = 1e-4;

/** 0:01.7（分：秒，到小數一位；原作的時間碼） */
const timecode = (t: number) => {
  const tenths = Math.round(t * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

const stepEnd = (s: StageStep) => Math.max(s.start, s.start + s.duration - EPS);

/** 路線的起點、終點所在的房間名 */
function endsOf(p: Project, tl: StageTimeline, s: StageStep): [string, string] {
  const r = s.route;
  const f = r ? p.floors.find((x) => x.id === r.floor) : null;
  const at = (x: number, y: number) =>
    f ? [...f.rooms].reverse().find((q) => roomHasPointClosed(q, x, y))?.name : undefined;
  void tl;
  return [(r && at(r.x1, r.y1)) || S.stage.somewhere, (r && at(r.x2, r.y2)) || S.stage.somewhere];
}

const floorNameOf = (p: Project, id: string) => p.floors.find((f) => f.id === id)?.name || '—';

export function StageDock() {
  const p = useProject((s) => s.data);
  const tl = timelineOf(p);
  const closed = useStage((s) => s.dockClosed);
  return (
    <section
      aria-label={S.stage.timeline}
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-2"
      data-testid="stage-dock"
    >
      <StageTransport tl={tl} closed={closed} />
      {closed ? null : tl.steps.length < 2 && !tl.manual.length ? (
        <p className="m-0 h-[9.5rem] px-1 py-2 text-xs text-muted" data-testid="stage-empty">
          {S.stage.emptyTimeline}
        </p>
      ) : (
        <StageSteps p={p} tl={tl} />
      )}
    </section>
  );
}

/** 預覽速度（原作的再生速度 0.5～2 倍；只影響播放，匯出照 1 倍） */
const STAGE_RATES = [0.5, 2] as const;

/** 每一步的卡片（只在「現在第幾步」改變時重畫，播放時不跟著每一格重畫） */
function StageSteps({ p, tl }: { p: Project; tl: StageTimeline }) {
  const current = useStage((s) => (s.preview ? stepAt(tl, s.time) : -1));
  const jump = (k: number) => useStage.getState().player?.jump(k);
  return (
    <ol
      className="m-0 flex h-[9.5rem] list-none items-start gap-2 overflow-auto p-0 pb-1"
      data-testid="stage-steps"
    >
      {tl.steps.map((s, k) => (
        <StepCard
          key={`${s.kind}-${s.route?.id ?? s.revealRooms[0] ?? s.revealFloors[0] ?? 'start'}`}
          p={p}
          tl={tl}
          step={s}
          k={k}
          current={k === current}
          onJump={jump}
        />
      ))}
      {tl.ctx.rooms.length ? <ManualCard p={p} tl={tl} /> : null}
    </ol>
  );
}

/** 播放列（共用的 Transport＋usePlayback）與「下一步」「全部公開」；播放的控制掛到演出的狀態 */
function StageTransport({ tl, closed }: { tl: StageTimeline; closed: boolean }) {
  const playback = usePlayback({ duration: tl.total, loop: false, autoPlay: false });
  const stopAt = useRef<number | null>(null);
  const wasPlaying = useRef(false);
  const pb = useRef(playback);
  pb.current = playback;
  const tlRef = useRef(tl);
  tlRef.current = tl;

  /* 播放的時間寫進演出的狀態（畫布、快捷鍵用） */
  useEffect(() => {
    setStage({ time: playback.time, playing: playback.playing });
    if (stopAt.current !== null && playback.time >= stopAt.current - EPS) {
      const t = stopAt.current;
      stopAt.current = null;
      pb.current.pause();
      pb.current.onTimeChange(t);
    }
    if (
      wasPlaying.current &&
      !playback.playing &&
      playback.time >= tlRef.current.total - EPS &&
      tlRef.current.total > 0
    )
      notify(S.stage.finished, 'success', { replace: true });
    wasPlaying.current = playback.playing;
  }, [playback.time, playback.playing]);

  const ensure = useCallback((): boolean => {
    const t = tlRef.current;
    if (!t.playable) {
      notify(S.stage.nothing, 'warning', { replace: true });
      return false;
    }
    if (t.steps.length < 2) {
      setStage({ preview: true, revealAll: false });
      notify(S.stage.manualOnly, 'info', { replace: true });
      return false;
    }
    return true;
  }, []);

  const player = useMemo<StagePlayer>(() => {
    const seek = (t: number) => {
      pb.current.onTimeChange(t);
      setStage({ preview: true, revealAll: false });
    };
    const play = () => {
      if (!ensure()) return;
      stopAt.current = null;
      setStage({ preview: true, revealAll: false });
      pb.current.play();
    };
    const pause = () => {
      stopAt.current = null;
      pb.current.pause();
    };
    const jump = (k: number) => {
      const t = tlRef.current;
      const s = t.steps[Math.max(0, Math.min(t.steps.length - 1, k))];
      if (!s) return;
      pause();
      seek(stepEnd(s));
    };
    return {
      play,
      pause,
      toggle: () => (pb.current.playing ? pause() : play()),
      seek,
      jump,
      next: () => {
        if (!ensure()) return;
        const t = tlRef.current;
        const st = useStage.getState();
        const time = st.preview ? pb.current.time : 0;
        let k = stepAt(t, time);
        if (!st.preview || time >= stepEnd(t.steps[k]) - 0.01) k += 1;
        if (k >= t.steps.length) {
          notify(S.stage.atEnd, 'info', { replace: true });
          return;
        }
        const s = t.steps[k];
        const from = st.preview && time > s.start && time < stepEnd(s) ? time : s.start;
        pb.current.pause();
        pb.current.onTimeChange(from);
        setStage({ preview: true, revealAll: false });
        stopAt.current = stepEnd(s);
        pb.current.play();
        notify(S.stage.stepCount(k, t.steps.length - 1), 'info', { replace: true });
      },
      prev: () => {
        const t = tlRef.current;
        const st = useStage.getState();
        if (!st.preview) return;
        const k = stepAt(t, pb.current.time);
        const done = pb.current.time >= stepEnd(t.steps[k]) - 0.01;
        jump(Math.max(0, done ? k - 1 : k - 1));
      },
      rewind: () => {
        stopAt.current = null;
        pb.current.pause();
        pb.current.onTimeChange(0);
        stopPreview();
      },
      reset: () => {
        stopAt.current = null;
        pb.current.pause();
        pb.current.onTimeChange(0);
      },
    };
  }, [ensure]);

  useEffect(() => {
    setStage({ player });
    return () => {
      player.pause();
      setStage({ player: null, preview: false, time: 0, playing: false });
    };
  }, [player]);

  const segments = useMemo(
    () =>
      tl.steps.length > 1
        ? tl.steps.map((s, k) => ({
            id: `s${k}`,
            label: k ? S.stage.stepN(k) : S.stage.startStep,
            start: s.start,
            end: s.start + s.duration,
            color:
              s.kind === 'route'
                ? 'var(--danger)'
                : s.kind === 'start'
                  ? 'var(--text-muted)'
                  : 'var(--success)',
          }))
        : [],
    [tl],
  );
  const frames = useMemo(
    () =>
      tl.steps.length > 1
        ? tl.steps.map((s) => ({ ms: Math.max(1, s.duration * 1000) }))
        : undefined,
    [tl],
  );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Transport
        className="min-w-0 flex-1 basis-72"
        time={playback.time}
        duration={tl.total}
        playing={playback.playing}
        onTimeChange={player.seek}
        onPlayingChange={(on) => (on ? player.play() : player.pause())}
        onRestart={() => {
          if (!ensure()) return;
          player.seek(0);
          player.play();
        }}
        onRewind={player.rewind}
        segments={segments}
        frames={frames}
        legend={false}
        rate={playback.rate}
        onRateChange={playback.setRate}
        rateRange={STAGE_RATES}
        rateStep={0.25}
        disabled={tl.steps.length < 2}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          icon={<SkipForward />}
          onClick={player.next}
          title={S.stage.nextTip}
          data-testid="stage-next"
        >
          {S.stage.next}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Eye />}
          onClick={revealAll}
          title={S.stage.revealAllTip}
          data-testid="stage-reveal-all"
        >
          {S.stage.revealAll}
        </Button>
        <IconButton
          size="sm"
          variant="ghost"
          icon={closed ? <ChevronUp /> : <ChevronDown />}
          label={closed ? S.stage.expand : S.stage.collapse}
          onClick={() => setStage({ dockClosed: !closed })}
          aria-expanded={!closed}
        />
      </div>
    </div>
  );
}

function useDrop(target: StageDropTarget | null) {
  const [over, setOver] = useState(false);
  if (!target) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(ROOM_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        setOver(false);
        const key = e.dataTransfer.getData(ROOM_DRAG_TYPE);
        if (!key) return;
        e.preventDefault();
        dropRoom(key, target);
      },
    },
  };
}

function StepCard({
  p,
  tl,
  step: s,
  k,
  current,
  onJump,
}: {
  p: Project;
  tl: StageTimeline;
  step: StageStep;
  k: number;
  current: boolean;
  onJump: (k: number) => void;
}) {
  const n = tl.steps.length - 1;
  const target: StageDropTarget | null =
    s.kind === 'route' && s.route
      ? { kind: 'route', id: s.route.id }
      : s.kind === 'room'
        ? { kind: 'after', before: s.revealRooms[0] ?? null }
        : null;
  const drop = useDrop(target);
  const afterKeys = tl.steps.filter((x) => x.kind === 'room').map((x) => x.revealRooms[0]);
  const plan = p.stage;
  return (
    <li
      className={cn(
        'flex w-44 shrink-0 flex-col gap-1 rounded-md border p-1.5 text-xs',
        current ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2',
        drop.over && 'ring-2 ring-accent',
      )}
      data-stage-step={k}
      data-kind={s.kind}
      {...drop.props}
    >
      <button
        type="button"
        className="flex flex-col items-start gap-0.5 rounded-sm px-1 py-0.5 text-left hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        aria-current={current ? 'step' : undefined}
        onClick={() => onJump(k)}
        data-stage-jump={k}
      >
        <span className="flex w-full justify-between tabular-nums text-muted">
          <span>{timecode(s.start)}</span>
          <span>{s.duration.toFixed(1)}s</span>
        </span>
        <span className="flex w-full justify-between font-semibold">
          <span>{k ? S.stage.stepN(k) : S.stage.startStep}</span>
          <span className="text-muted">{k ? `${k}/${Math.max(1, n)}` : 'START'}</span>
        </span>
      </button>
      {s.kind === 'start' ? (
        <p className="m-0 px-1 text-muted">
          {S.stage.startSummary(tl.ctx.rooms.length, plan?.floors?.length ?? 0)}
        </p>
      ) : s.route ? (
        <RouteChip p={p} tl={tl} step={s} />
      ) : (
        <p className="m-0 px-1 text-muted">{S.stage.noMove}</p>
      )}
      {s.revealFloors.map((id) => (
        <span key={id} className="rounded-sm bg-success-soft px-1.5 py-0.5 text-success">
          {S.stage.floorChip(floorNameOf(p, id))}
        </span>
      ))}
      {s.revealRooms.map((key) => (
        <RoomChip
          key={key}
          p={p}
          tl={tl}
          k={key}
          order={s.kind === 'room' ? afterKeys.indexOf(key) : -1}
          last={afterKeys.length - 1}
        />
      ))}
      {k > 0 && !s.revealRooms.length && !s.revealFloors.length ? (
        <span className="px-1 text-muted">{S.stage.noReveal}</span>
      ) : null}
      {s.kind === 'route' && s.route ? <AddRoom p={p} tl={tl} step={s} /> : null}
    </li>
  );
}

function RouteChip({ p, tl, step: s }: { p: Project; tl: StageTimeline; step: StageStep }) {
  const r = s.route;
  if (!r) return null;
  const i = s.routeIndex;
  const [a, b] = endsOf(p, tl, s);
  const hop = s.hops[0];
  const lastHop = s.hops[s.hops.length - 1];
  return (
    <div
      className="flex flex-col gap-0.5 rounded-sm border border-danger px-1.5 py-1"
      data-stage-route={r.id}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-danger">
          {S.stage.routeChip(i + 1, floorNameOf(p, r.floor))}
        </span>
        <span className="flex">
          <IconButton
            size="sm"
            variant="ghost"
            icon={<ChevronLeft />}
            label={S.stage.moveLeft}
            disabled={i <= 0}
            onClick={() => moveRoute(r.id, -1)}
          />
          <IconButton
            size="sm"
            variant="ghost"
            icon={<ChevronRight />}
            label={S.stage.moveRight}
            disabled={i >= tl.ctx.routes.length - 1}
            onClick={() => moveRoute(r.id, 1)}
          />
          <IconButton
            size="sm"
            variant="ghost"
            icon={<X />}
            label={S.stage.deleteRoute}
            onClick={() => deleteRoute(r.id)}
          />
        </span>
      </div>
      {hop && lastHop ? (
        <span className="text-muted" data-stage-stairs>
          {S.stage.stairsTag(
            S.stage.hopKinds[hop.link.kind],
            tl.ctx.route.floors[hop.fromLevel]?.name || '—',
            tl.ctx.route.floors[lastHop.toLevel]?.name || '—',
          )}
        </span>
      ) : null}
      <span className="truncate">{S.stage.routeFromTo(a, b)}</span>
    </div>
  );
}

/** 這一步公開的房間的晶片（拖到別一步改公開的時機；公開的時機也可以在左邊的清單改） */
function RoomChip({
  p,
  tl,
  k: key,
  order,
  last,
}: {
  p: Project;
  tl: StageTimeline;
  k: string;
  order: number;
  last: number;
}) {
  const { floor, name } = roomName(p, key);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 拖到別一步只是捷徑，同一件事可以在左邊清單的選單做
    <div
      className="flex flex-col gap-1 rounded-sm bg-surface px-1.5 py-0.5 shadow-1"
      draggable
      onDragStart={(e) => startRoomDrag(e, key)}
      title={`${S.stage.dragChip}（${revealText(tl.info.get(key))}）`}
      data-stage-chip={key}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="min-w-0 truncate">
          ［{floor}］{name}
        </span>
        {order >= 0 ? (
          <span className="flex shrink-0">
            <IconButton
              size="sm"
              variant="ghost"
              icon={<ChevronLeft />}
              label={S.stage.orderUp}
              disabled={order <= 0}
              onClick={() => moveAfter(key, -1)}
            />
            <IconButton
              size="sm"
              variant="ghost"
              icon={<ChevronRight />}
              label={S.stage.orderDown}
              disabled={order >= last}
              onClick={() => moveAfter(key, 1)}
            />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** 「＋ 這條路線順便公開…」（還沒藏的會先藏起來） */
function AddRoom({ p, tl, step: s }: { p: Project; tl: StageTimeline; step: StageStep }) {
  const r = s.route;
  if (!r) return null;
  const opts: { value: string; label: string }[] = [];
  for (const f of [...tl.ctx.route.floors].reverse())
    for (const room of f.rooms) {
      const key = roomKey(f.id, room.id);
      if (!isStageRoom(room) || s.revealRooms.includes(key)) continue;
      opts.push({
        value: key,
        label: `［${f.name || '—'}］${room.name || S.stage.unnamed}${tl.info.has(key) ? '' : S.stage.addRoomHide}`,
      });
    }
  if (!opts.length) return null;
  void p;
  return (
    <Select
      size="sm"
      value=""
      placeholder={S.stage.addRoom}
      onValueChange={(key) => {
        if (key) dropRoom(key, { kind: 'route', id: r.id });
      }}
      options={opts}
      aria-label={S.stage.addRoomLabel}
      data-stage-add={r.id}
    />
  );
}

/** 「點了才公開」的房間 */
function ManualCard({ p, tl }: { p: Project; tl: StageTimeline }) {
  const drop = useDrop({ kind: 'manual' });
  return (
    <li
      className={cn(
        'flex w-44 shrink-0 flex-col gap-1 rounded-md border border-dashed border-border p-1.5 text-xs',
        drop.over && 'ring-2 ring-accent',
      )}
      data-stage-step="manual"
      {...drop.props}
    >
      <p className="m-0 px-1 font-semibold">{S.stage.manualCol}</p>
      <p className="m-0 px-1 text-muted">{S.stage.manualHint}</p>
      {tl.manual.map((key) => (
        <RoomChip key={key} p={p} tl={tl} k={key} order={-1} last={0} />
      ))}
    </li>
  );
}
