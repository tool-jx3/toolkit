/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 影格列（F028；原作的 renderFrameBar、tlLanesHtml、setupFrameDrag、openFrameDurPanel）：時間軸分頁才出現，在畫布下、分頁列上。
 * - 上排：播放速度（點一下換下一檔）、新增影格（延續上一格）、複製模式、刪除模式；右邊補間開關、縮小／放大時間軸。
 * - 影格標記：點一下＝切到這一格編輯（模式中＝複製／刪除）、拖曳換順序、按兩下＝影格播放時間。
 * - 四條圖層軌道：名稱、眼睛、鎖；每一格一個格子（菱形＝關鍵影格、短橫線＝保持；點一下切換）。
 * - 下排：共用的播放列（Transport＋usePlayback；時間軸上每一格一個標記，時間寫「目前 / 總格數」）。
 * 唯讀瀏覽時只能切影格與播放（7.4 第 10 項）。
 */
import {
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Minus,
  Plus,
  Spline,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Popover } from 'radix-ui';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  cn,
  IconButton,
  Slider,
  Transport,
  useConfirm,
  usePlayback,
  useSortable,
} from '@/ui';
import { OptionalNumberInput } from '@/ui/OptionalNumberInput';
import {
  frameDur,
  holds,
  posAt,
  secondsAt,
  TL_LANES,
  TWEEN_UNITS_PER_SEC,
  tlDuration,
  tlSpeed,
} from '../model/timeline';
import type { Timeline, TlLane } from '../model/types';
import { TL_UI_RESET } from '../state/actions';
import { setPrefs, setUi, usePrefs, useUi } from '../state/store';
import {
  addFrameAfter,
  copyFrameAt,
  cycleTlSpeed,
  deleteFrameAt,
  moveFrameTo,
  setFrameDur,
  setTlLane,
  setTlPos,
  switchFrame,
  toggleFrameKey,
} from '../state/tlActions';
import { S } from '../strings';
import { useSheet } from './hooks';
import { stopSim } from './sim';

const T = S.tl;
/** 預設的每格秒數（1 ÷ 0.85，取到 0.01） */
const DEF_DUR = Math.round(100 / TWEEN_UNITS_PER_SEC) / 100;
/** 影格標記的寬（clamp(720 ÷ 格數, 26, 72) × 縮放，原作） */
const markWidth = (n: number, zoom: number) =>
  Math.max(26, Math.min(72, 720 / Math.max(1, n))) * zoom;

/** 影格播放時間（按兩下影格標記；點外面＝確定、Esc＝取消，原作） */
function DurPanel({
  tl,
  k,
  val,
  setVal,
  finish,
}: {
  tl: Timeline;
  k: number;
  val: number | null;
  setVal: (v: number | null) => void;
  finish: (ok: boolean) => void;
}) {
  const f = tl.frames[k];
  if (!f) return null;
  return (
    <div className="flex w-[min(17rem,calc(100vw-2rem))] flex-col gap-2" data-testid="tl-dur">
      <div className="text-sm font-semibold">{T.durTitle}</div>
      <div className="text-xs">
        {T.frameLabel(f.no)}
        <b className="ml-1.5 text-accent" data-testid="tl-dur-value">
          {val ? T.durValue(val) : T.durAuto(DEF_DUR)}
        </b>
      </div>
      <Slider
        value={Math.min(5, Math.max(0.2, val ?? DEF_DUR))}
        min={0.2}
        max={5}
        step={0.1}
        unit={T.seconds}
        showInput={false}
        onChange={(v) => setVal(Math.round(v * 100) / 100)}
        aria-label={T.durTitle}
      />
      <div className="flex items-center gap-2">
        <OptionalNumberInput
          value={val}
          onChange={(v) =>
            setVal(
              v === null || v <= 0
                ? null
                : Math.min(600, Math.max(0.05, Math.round(v * 100) / 100)),
            )
          }
          min={0.05}
          max={600}
          step={0.05}
          precision={2}
          unit={T.seconds}
          placeholder={T.durAuto(DEF_DUR)}
          size="sm"
          aria-label={T.durTitle}
          className="w-28"
        />
      </div>
      <p className="text-xs text-muted">{T.durHint}</p>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setVal(null)}>
          {T.durReset}
        </Button>
        <Button size="sm" onClick={() => finish(false)}>
          {T.durCancel}
        </Button>
        <Button size="sm" variant="primary" onClick={() => finish(true)} data-testid="tl-dur-ok">
          {T.durOk}
        </Button>
      </div>
    </div>
  );
}

/** 一條軌道的表頭：名稱、眼睛、鎖 */
function LaneHead({ tl, lane, ro }: { tl: Timeline; lane: TlLane; ro: boolean }) {
  const hid = tl.hidden.includes(lane);
  const lock = tl.locked.includes(lane);
  const nm = T.lane[lane];
  return (
    <div className="flex h-6 items-center gap-0.5 pr-1" data-testid={`tl-lane-${lane}`}>
      <span className={cn('min-w-0 flex-1 truncate text-xs', hid ? 'text-muted line-through' : '')}>
        {nm}
      </span>
      <IconButton
        size="sm"
        className="size-6"
        icon={hid ? <EyeOff /> : <Eye />}
        label={`${nm}：${T.laneEye}`}
        pressed={!hid}
        disabled={ro}
        onClick={() => setTlLane('hidden', lane, !hid)}
        data-testid={`tl-eye-${lane}`}
      />
      <IconButton
        size="sm"
        className="size-6"
        icon={lock ? <Lock /> : <LockOpen />}
        label={`${nm}：${T.laneLock}`}
        pressed={lock}
        disabled={ro}
        onClick={() => setTlLane('locked', lane, !lock)}
        data-testid={`tl-lock-${lane}`}
      />
    </div>
  );
}

export function FrameBar() {
  const sheet = useSheet();
  const tl = sheet.tl;
  if (!tl) return null;
  return <Bar tl={tl} key={sheet.id} />;
}

function Bar({ tl }: { tl: Timeline }) {
  const ro = useUi((u) => u.readonly);
  const mode = useUi((u) => u.tlMode);
  const zoom = useUi((u) => u.tlZoom);
  const tlPos = useUi((u) => u.tlPos);
  const tweenOff = usePrefs((p) => p.data.tweenOff);
  const confirm = useConfirm();
  const [durFor, setDurFor] = useState<number | null>(null);
  const [durVal, setDurVal] = useState<number | null>(null);
  const finishDur = (ok: boolean) => {
    if (durFor === null) return;
    if (ok) setFrameDur(durFor, durVal);
    setDurFor(null);
  };
  const n = tl.frames.length;
  const multi = n >= 2;
  const markW = markWidth(n, zoom);
  const dur = tlDuration(tl);
  const pb = usePlayback({ duration: dur, loop: false, autoPlay: false });
  /** 預覽中（播放或拖過時間軸）：時間軸的時間 → 位置 → 畫布 */
  const preview = useRef(false);
  const pbRef = useRef(pb);
  pbRef.current = pb;
  const tlRef = useRef(tl);
  tlRef.current = tl;

  /* 影格列收起（換了分頁、轉回一般分頁、換掉整個專案、復原到別的分頁）：預覽與模式跟著結束（原作 switchSheet） */
  useEffect(() => () => setUi(TL_UI_RESET), []);

  /* 只剩一格：刪除模式關掉（原作） */
  useEffect(() => {
    if (!multi && mode === 'del') setUi({ tlMode: null });
  }, [multi, mode]);

  /* 播放器的時間 → 預覽位置 */
  useEffect(() => {
    if (!preview.current) return;
    setTlPos(posAt(tlRef.current, pb.time), pb.playing);
  }, [pb.time, pb.playing]);

  /* 回到編輯（切影格、改影格、切分頁）：停下來，時間軸回到目前影格 */
  useEffect(() => {
    if (tlPos !== null) return;
    preview.current = false;
    const p = pbRef.current;
    if (p.playing) p.pause();
    p.onTimeChange(secondsAt(tlRef.current, tlRef.current.active));
  }, [tlPos]);

  /* 改了速度、秒數、格數：預覽位置不跳（同一個影格位置換算成新的時間） */
  const timing = `${tl.speed}|${tl.frames.map((f) => f.dur ?? 0).join(',')}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: timing＝換算的依據
  useEffect(() => {
    const p = useUi.getState().tlPos;
    pbRef.current.onTimeChange(secondsAt(tlRef.current, p ?? tlRef.current.active));
  }, [timing]);

  const enterPreview = () => {
    if (preview.current) return;
    preview.current = true;
    stopSim();
    pbRef.current.onTimeChange(secondsAt(tl, useUi.getState().tlPos ?? tl.active));
  };

  /* 點影格標記：依模式＝複製／刪除，否則切到那一格編輯（預覽中＝回到編輯） */
  const clickMark = (k: number) => {
    if (mode === 'del' && !ro) {
      deleteFrameAt(k);
      return;
    }
    if (mode === 'copy' && !ro) {
      copyFrameAt(k);
      return;
    }
    stopSim();
    switchFrame(k);
  };
  const sort = useSortable({
    count: n,
    mode: 'drop',
    axis: 'xy',
    disabled: ro || !!mode,
    onMove: (from, to) => moveFrameTo(from, to),
    onClick: clickMark,
  });

  /* 目前位置最近的一格（預覽中跟著時間軸） */
  const hl = Math.round(tlPos ?? tl.active);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current?.querySelector<HTMLElement>(`[data-mark="${hl}"]`);
    const box = track.current;
    if (!el || !box) return;
    const a = el.offsetLeft;
    const b = a + el.offsetWidth;
    if (a < box.scrollLeft || b > box.scrollLeft + box.clientWidth)
      box.scrollLeft = (a + b) / 2 - box.clientWidth / 2;
  }, [hl]);

  const toggleKey = async (k: number, lane: TlLane) => {
    const f = tl.frames[k];
    if (!f || k === 0 || ro || tl.locked.includes(lane)) return;
    if (!holds(f, lane)) {
      const ok = await confirm({
        title: T.holdTitle,
        description: T.holdConfirm(f.no, T.lane[lane]),
        confirmLabel: T.holdOk,
      });
      if (!ok) return;
    }
    toggleFrameKey(k, lane);
  };

  const markers = useMemo(
    () => tl.frames.map((f, k) => ({ time: secondsAt(tl, k), label: T.frameLabel(f.no) })),
    [tl],
  );
  const specs = useMemo(
    () => tl.frames.map((_f, k) => ({ ms: k < n - 1 ? frameDur(tl, k) * 1000 : 1 })),
    [tl, n],
  );
  const speed = tlSpeed(tl);

  const markEl = (k: number): ReactNode => {
    const f = tl.frames[k];
    const rp = sort.rowProps(k);
    const tip = T.frameTip(f.no) + (f.dur ? T.frameDurTip(f.dur) : '');
    const el = (
      // biome-ignore lint/a11y/useSemanticElements: 拖曳排序的列（useSortable 不從 <button> 開始拖）
      <div
        key={f.id}
        {...rp}
        role="button"
        tabIndex={0}
        title={tip}
        aria-label={tip}
        aria-current={k === tl.active && tlPos === null ? 'true' : undefined}
        data-mark={k}
        className={cn(
          'grid h-7 shrink-0 cursor-pointer select-none place-items-center rounded-sm border text-xs tabular-nums',
          k === hl
            ? 'border-accent bg-accent-soft font-semibold text-fg'
            : 'border-border bg-surface-2 text-muted hover:text-fg',
          sort.dragIndex === k ? 'opacity-50' : '',
          sort.overIndex === k && sort.dragIndex !== k ? 'outline-2 outline-accent' : '',
          mode === 'del' ? 'hover:border-danger hover:text-danger' : '',
        )}
        style={{ width: markW }}
        onKeyDown={(e) => {
          if (sort.keyMove(k, e)) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            clickMark(k);
          }
        }}
        onDoubleClick={() => {
          if (mode || ro) return;
          setDurVal(f.dur);
          setDurFor(k);
        }}
        data-testid="tl-mark"
      >
        {f.no}
      </div>
    );
    if (durFor !== k) return el;
    return (
      <Popover.Root
        key={f.id}
        open
        onOpenChange={(o) => {
          /* 點外面＝確定（原作） */
          if (!o) finishDur(true);
        }}
      >
        <Popover.Anchor asChild>{el}</Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={6}
            className="z-50 rounded-md border border-border bg-surface p-3 shadow-2"
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              finishDur(false);
            }}
          >
            <DurPanel tl={tl} k={k} val={durVal} setVal={setDurVal} finish={finishDur} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  };

  return (
    <section
      aria-label={T.bar}
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-1.5"
      data-testid="frame-bar"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant={speed === 1 ? 'secondary' : 'primary'}
          className="min-w-[3.25rem] tabular-nums"
          title={T.speed}
          aria-label={`${T.speed}：${T.speedLabel(speed)}`}
          disabled={!multi || ro}
          onClick={cycleTlSpeed}
          data-testid="tl-speed"
        >
          {T.speedLabel(speed)}
        </Button>
        {ro ? null : (
          <>
            <IconButton
              size="sm"
              icon={<Plus />}
              label={T.addTip}
              onClick={() => {
                stopSim();
                addFrameAfter();
              }}
              data-testid="tl-add"
            />
            <IconButton
              size="sm"
              icon={<Copy />}
              label={T.copyMode}
              pressed={mode === 'copy'}
              onClick={() => setUi({ tlMode: mode === 'copy' ? null : 'copy' })}
              data-testid="tl-copy-mode"
            />
            <IconButton
              size="sm"
              icon={<Trash2 />}
              label={multi ? T.delMode : T.keepOne}
              pressed={mode === 'del'}
              disabled={!multi}
              onClick={() => setUi({ tlMode: mode === 'del' ? null : 'del' })}
              data-testid="tl-del-mode"
            />
          </>
        )}
        <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted" aria-live="polite">
          {mode === 'copy'
            ? T.copyMode
            : mode === 'del'
              ? T.delMode
              : tlPos !== null
                ? T.preview
                : ''}
        </span>
        <IconButton
          size="sm"
          icon={<Spline />}
          label={tweenOff ? T.tweenOff : T.tweenOn}
          pressed={!tweenOff}
          onClick={() => setPrefs({ tweenOff: !tweenOff })}
          data-testid="tl-tween"
        />
        <IconButton
          size="sm"
          icon={<ZoomOut />}
          label={T.zoomOut}
          onClick={() => setUi({ tlZoom: Math.max(0.4, zoom / 1.25) })}
          data-testid="tl-zoom-out"
        />
        <IconButton
          size="sm"
          icon={<ZoomIn />}
          label={T.zoomIn}
          onClick={() => setUi({ tlZoom: Math.min(3, zoom * 1.25) })}
          data-testid="tl-zoom-in"
        />
      </div>
      <div className="flex min-w-0 gap-1">
        <div className="flex w-[7.5rem] shrink-0 flex-col gap-0.5 sm:w-[9rem]">
          <div className="flex h-7 items-center text-xs text-muted">{T.marks}</div>
          {TL_LANES.map((lane) => (
            <LaneHead key={lane} tl={tl} lane={lane} ro={ro} />
          ))}
        </div>
        <div
          ref={track}
          className="min-w-0 flex-1 overflow-x-auto pb-0.5"
          onWheel={(e) => {
            if (e.deltaY && e.currentTarget.scrollWidth > e.currentTarget.clientWidth)
              e.currentTarget.scrollLeft += e.deltaY;
          }}
          data-testid="tl-track"
        >
          <div className="flex w-max flex-col gap-0.5">
            <div className="flex gap-0.5" role="toolbar" aria-label={T.marks}>
              {tl.frames.map((_f, k) => markEl(k))}
            </div>
            {TL_LANES.map((lane) => {
              const locked = tl.locked.includes(lane);
              const hid = tl.hidden.includes(lane);
              return (
                <div key={lane} className={cn('flex gap-0.5', hid ? 'opacity-50' : '')}>
                  {tl.frames.map((f, k) => {
                    const held = k > 0 && holds(f, lane);
                    const cur = k === tl.active;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={cn(
                          'grid h-6 shrink-0 place-items-center rounded-sm border text-muted [&_svg]:size-3',
                          cur ? 'border-accent' : 'border-transparent',
                          k === 0 || locked || ro
                            ? 'cursor-default'
                            : 'hover:bg-surface-2 hover:text-fg',
                        )}
                        style={{ width: markW }}
                        title={
                          k === 0 ? T.firstTip : locked ? T.lockedTip : held ? T.holdTip : T.keyTip
                        }
                        aria-label={T.cell(f.no, T.lane[lane], !held)}
                        aria-disabled={k === 0 || locked || ro || undefined}
                        onClick={() => void toggleKey(k, lane)}
                        data-testid={`tl-cell-${lane}`}
                        data-key={held ? undefined : ''}
                      >
                        {held ? <Minus /> : <Diamond className="fill-current" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Transport
        time={pb.time}
        duration={dur}
        playing={pb.playing}
        disabled={!multi}
        onTimeChange={(t) => {
          enterPreview();
          pb.onTimeChange(t);
        }}
        onPlayingChange={(on) => {
          if (on) {
            enterPreview();
            pb.play();
          } else pb.pause();
        }}
        onRestart={() => {
          enterPreview();
          pb.onRestart();
        }}
        markers={markers}
        frames={specs}
        formatTime={(t) => String(Math.min(n, Math.floor(posAt(tl, t) + 1e-6) + 1))}
        className="border-0 bg-transparent p-0"
      />
    </section>
  );
}
