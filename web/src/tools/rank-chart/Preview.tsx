/**
 * 預覽：標題列（播放畫面切換）→ Stage 裡的畫布（與下載同一段繪圖程式）＋操作層（名次的點選區／擺放模式）→
 * 說明 → 遊戲面板（狀態、主要按鈕、名次按鈕、出場順序、下載）。
 */
import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Button, LayoutCanvas, Stage } from '@/ui';
import { pickRank } from './game';
import { buildLayout, type Layout } from './layout';
import { CANVAS_W, type Config, canvasHeight, type Run } from './model';
import { PlacementLayer } from './PlacementLayer';
import { PlayPanel } from './PlayPanel';
import { ctxMeasure, renderScene } from './render';
import { imageOf, thumbOf, useConfig, useGame, useSession } from './store';
import { S } from './strings';

/** 名次的點選區：揭曉後才有，只有空著的名次 */
function rankRegions(layout: Layout, run: Run | null) {
  if (run?.phase !== 'revealed') return [];
  return layout.rows
    .filter((r) => !run.ranks[r.index])
    .map((r) => ({
      key: `rank:${r.index}`,
      label: S.hotspot(r.index),
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      radius: Math.min(17, r.height * 0.17),
    }));
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** 量字用的畫布（版面計算用；與畫圖同一套字型） */
function measureLayout(c: Config): Layout {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return buildLayout(c, measureCtx ? ctxMeasure(measureCtx) : (t, s) => t.length * s);
}

export function Preview() {
  const c = useConfig((s) => s.data);
  const run = useGame((s) => s.data.run);
  const spinId = useSession((s) => s.spinId);
  const images = useSession((s) => s.images);
  const fontTick = useSession((s) => s.fontTick);
  const placing = useSession((s) => s.placing);
  const focus = useSession((s) => s.focus);
  const canvas = useRef<HTMLCanvasElement>(null);
  const H = canvasHeight(c);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick：字型載好之後重新量字
  const layout = useMemo(() => measureLayout(c), [c, fontTick]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: images、fontTick 只用來在圖與字型載好後重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    renderScene(ctx, {
      config: c,
      run,
      spinId,
      thumb: thumbOf,
      portrait: imageOf(c.portrait.photo?.id),
    });
  }, [c, run, spinId, images, fontTick, H]);

  const heading = S.heading(run?.phase ?? null);
  const regions = rankRegions(layout, run);
  const pending = run?.phase === 'revealed' && run.pending !== null ? `rank:${run.pending}` : null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2
          className="m-0 flex items-baseline gap-2 text-base font-semibold"
          data-testid="stage-heading"
        >
          {heading.title}
          <span className="text-xs font-normal tracking-wider text-muted">{heading.sub}</span>
        </h2>
        <span className="ml-auto text-xs tabular-nums text-muted" data-testid="size-badge">
          {S.sizeBadge(H)}
        </span>
        <Button
          size="sm"
          variant="secondary"
          icon={focus ? <Minimize2 /> : <Maximize2 />}
          aria-pressed={focus}
          onClick={() => useSession.setState({ focus: !focus })}
          data-testid="focus-toggle"
        >
          {focus ? S.focusOff : S.focusOn}
        </Button>
      </div>
      <Stage width={CANVAS_W} height={H} backgrounds={[]} aria-label={S.previewLabel}>
        <canvas
          ref={canvas}
          width={CANVAS_W}
          height={H}
          className="block size-full"
          data-testid="rank-canvas"
          data-size={`${CANVAS_W}x${H}`}
          data-rows={layout.rows
            .map((r) => [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(2)).join(','))
            .join(';')}
        />
        {placing && !run ? (
          <PlacementLayer layout={layout} />
        ) : (
          <LayoutCanvas
            width={CANVAS_W}
            height={H}
            regions={regions}
            activeKey={pending}
            onPick={(key) => {
              const i = Number(key.split(':')[1]);
              if (Number.isInteger(i)) pickRank(i);
            }}
            aria-label={S.hotspotsLabel}
          />
        )}
      </Stage>
      <p className="m-0 text-center text-xs text-muted" data-testid="stage-caption">
        {placing && !run ? S.captionPlacement : S.caption}
      </p>
      <PlayPanel />
    </div>
  );
}
