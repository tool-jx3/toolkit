/**
 * 預覽欄：預覽畫面（Stage＋canvas＋拖曳層）、播放列、目前影格 PNG、狀態列與進度、匯出區。
 */
import { ImageDown } from 'lucide-react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import { canvasToBlob } from '@/core/image';
import type { Box } from '@/core/layout';
import {
  Button,
  LayoutEditor,
  type LayoutItem,
  Notice,
  Stage,
  type StageAnyBackgroundKind,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { ExportArea } from './ExportArea';
import { type ElementId, elementBounds, elementOrder, isFollowing } from './geometry';
import { characterAspect, renderScene, Scratch, textMeasurer } from './render';
import { type Runtime, useRuntime } from './runtime';
import { RANGE } from './settings';
import { edit, settingsNow, useLm, usePreview } from './store';
import { S } from './strings';
import { fileStem, totalDuration } from './timing';

const BACKGROUNDS: readonly StageAnyBackgroundKind[] = ['checker', 'scene', 'dark', 'light'];

const clampTo = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

export interface PreviewHandle {
  readonly time: number;
  readonly playing: boolean;
  seek: (t: number) => void;
  setPlaying: (on: boolean) => void;
}

/** 量字用的畫布（點選範圍） */
let measureCtx: CanvasRenderingContext2D | null = null;
const measurer = () => {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  return measureCtx ? textMeasurer(measureCtx) : null;
};

/** 依拖曳的位移改設定（F150）：dx、dy 是畫布 px；跟隨進度條的角色改微調值 */
function applyDrag(id: ElementId, start: ReturnType<typeof settingsNow>, dx: number, dy: number) {
  const W = start.canvas.width;
  const H = start.canvas.height;
  const k = H / 360;
  edit((d) => {
    if (id === 'character') {
      if (isFollowing(start)) {
        d.character.followX = clampTo(start.character.followX + dx / k, RANGE.followOffsetXInput);
        d.character.followY = clampTo(start.character.followY + dy / k, RANGE.followOffsetYInput);
      } else {
        d.character.x = clampTo(start.character.x + (dx / W) * 100, RANGE.posInput);
        d.character.y = clampTo(start.character.y + (dy / H) * 100, RANGE.posInput);
      }
    } else if (id === 'loader') {
      d.loader.x = clampTo(start.loader.x + (dx / W) * 100, RANGE.posInput);
      d.loader.y = clampTo(start.loader.y + (dy / H) * 100, RANGE.posInput);
    } else if (id === 'percent') {
      d.bar.percentX = clampTo(start.bar.percentX + dx / k, RANGE.percentXInput);
      d.bar.percentY = clampTo(start.bar.percentY + dy / k, RANGE.percentYInput);
    } else {
      d.text[id].x = clampTo(start.text[id].x + (dx / W) * 100, RANGE.posInput);
      d.text[id].y = clampTo(start.text[id].y + (dy / H) * 100, RANGE.posInput);
    }
  });
}

function Capabilities() {
  const webp = useWebpSupport();
  const items: [string, boolean][] = [
    [S.capabilities.input, typeof createImageBitmap === 'function'],
    [S.capabilities.apng, true],
    [S.capabilities.webp, webp],
    [S.capabilities.gif, true],
  ];
  return (
    <ul
      aria-label={S.capabilities.aria}
      className="m-0 flex list-none flex-wrap gap-1.5 p-0"
      data-testid="capabilities"
    >
      {items.map(([label, ok]) => (
        <li
          key={label}
          data-ok={ok || undefined}
          className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted"
        >
          <span aria-hidden className={ok ? 'text-success' : 'text-warning'}>
            {ok ? '●' : '▲'}
          </span>{' '}
          {label}
          <span className="sr-only">：{ok ? S.capabilities.ok : S.capabilities.limited}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusArea() {
  const status = useRuntime((st) => st.status);
  const busy = useRuntime((st) => st.busy);
  const progress = useRuntime((st) => st.progress);
  const exporting = useRuntime((st) => st.exporting);
  /* 處理中（載入、匯出）整頁標示忙碌 */
  useEffect(() => {
    document.body.setAttribute('aria-busy', String(busy > 0 || exporting));
  }, [busy, exporting]);
  return (
    <div className="flex flex-col gap-2">
      <Capabilities />
      <Notice tone={status.tone}>
        <span data-testid="status" data-tone={status.tone}>
          {status.text}
        </span>
      </Notice>
      {busy > 0 ? (
        <div className="flex flex-col gap-1" data-testid="work-progress">
          <span className="text-xs text-muted">{progress.label}</span>
          <div
            role="progressbar"
            aria-label={progress.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.ratio * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round(progress.ratio * 100)}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Preview({ handle }: { handle: RefObject<PreviewHandle | null> }) {
  const s = useLm((st) => st.data);
  const media = useRuntime((st) => st.media);
  const rate = usePreview((st) => st.data.rate);
  const patchPreview = usePreview((st) => st.patch);
  const total = totalDuration(s);
  const playback = usePlayback({ duration: total, loop: true, rate });
  const canvas = useRef<HTMLCanvasElement>(null);
  const scratch = useMemo(() => new Scratch(), []);
  const [fontTick, setFontTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  /* 字型：用到的字型載入後重畫 */
  const fontKey = `${s.text.top.font.family}|${s.text.top.font.weight}|${s.text.bottom.font.family}|${s.text.bottom.font.weight}|${s.text.top.text}${s.text.bottom.text}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在字型或文字改變時載入
  useEffect(() => {
    let alive = true;
    const st = settingsNow();
    Promise.all(
      [st.text.top, st.text.bottom].map((b) => ensureFont(b.font.family, b.font.weight, b.text)),
    ).then(() => {
      if (alive) setFontTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [fontKey]);

  /* 畫預覽 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    renderScene(ctx, s, media, playback.time, scratch);
  }, [s, media, playback.time, scratch, fontTick]);

  /* 預覽開場／結尾、對齊整圈長度的跳轉 */
  const seek = useRuntime((st: Runtime) => st.seek);
  const { onTimeChange, play } = playback;
  useEffect(() => {
    if (!seek) return;
    onTimeChange(seek.t);
    if (seek.play) play();
  }, [seek, onTimeChange, play]);

  const state = useRef({ playback });
  state.current = { playback };
  useEffect(() => {
    handle.current = {
      get time() {
        return state.current.playback.time;
      },
      get playing() {
        return state.current.playback.playing;
      },
      seek: (t) => state.current.playback.onTimeChange(t),
      setPlaying: (on) => state.current.playback.onPlayingChange(on),
    };
  }, [handle]);

  /* 拖曳層：各元素的範圍（依目前的預覽時間） */
  const m = measurer();
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 讓字型載入後重新量字
  const bounds = useMemo(
    () =>
      m ? elementBounds(s, playback.time, characterAspect(media), m.measure, m.measureLabel) : {},
    [s, playback.time, media, m, fontTick],
  );
  const following = isFollowing(s);
  const items: LayoutItem[] = elementOrder(s)
    .filter((id) => bounds[id])
    .map((id) => {
      const b = bounds[id]!;
      return {
        id,
        label: S.preview.elements[id],
        box: { x: b.left, y: b.top, width: b.width, height: b.height },
        attachedTo: id === 'percent' || (id === 'character' && following) ? 'loader' : undefined,
      };
    });
  const drag = useRef<{
    id: ElementId;
    box: Box;
    start: ReturnType<typeof settingsNow>;
    resume: boolean;
  } | null>(null);
  const onChange = (id: string, box: Box, change: { phase: string }) => {
    const eid = id as ElementId;
    if (change.phase === 'start') {
      const resume = playback.playing;
      if (resume) playback.pause();
      useLm.beginGesture();
      drag.current = { id: eid, box, start: settingsNow(), resume };
      return;
    }
    if (change.phase === 'nudge') {
      const cur = items.find((it) => it.id === id)?.box;
      if (cur) applyDrag(eid, settingsNow(), box.x - cur.x, box.y - cur.y);
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (change.phase === 'move') applyDrag(d.id, d.start, box.x - d.box.x, box.y - d.box.y);
    if (change.phase === 'end') {
      useLm.endGesture();
      drag.current = null;
      if (d.resume) playback.play();
    }
  };

  const W = s.canvas.width;
  const H = s.canvas.height;
  const savePng = async () => {
    const c = canvas.current;
    if (!c) return;
    const blob = await canvasToBlob(c, 'image/png');
    downloadBlob(blob, `${fileStem(settingsNow().export.fileName)}-frame.png`);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted tabular-nums" data-testid="canvas-size">
          {S.preview.size(W, H)}
        </span>
        <Button size="sm" icon={<ImageDown />} onClick={() => void savePng()}>
          {S.preview.framePng}
        </Button>
      </div>
      <Stage<StageAnyBackgroundKind>
        width={W}
        height={H}
        aria-label={S.preview.stage}
        backgrounds={BACKGROUNDS}
        defaultBackground={{ kind: 'checker' }}
      >
        <canvas
          ref={canvas}
          width={W}
          height={H}
          className="block size-full"
          data-testid="lm-canvas"
        />
        <LayoutEditor
          width={W}
          height={H}
          items={items}
          selectedId={selected}
          onSelect={setSelected}
          onChange={onChange}
          guides={false}
          snap={{ canvas: s.canvas.snapCanvas, items: s.canvas.snapItems }}
          hitPadding={5}
          aria-label={S.preview.editor}
        />
      </Stage>
      <Transport
        {...playback}
        onLoopChange={undefined}
        fps={s.export.fps}
        rate={rate}
        onRateChange={(r) => {
          playback.setRate(r);
          patchPreview({ rate: r });
        }}
      />
      <StatusArea />
      <ExportArea />
    </div>
  );
}
