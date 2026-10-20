/**
 * 「圖片切換」模式的預覽欄（規格 F127～F133）：舞台（輸出畫面的等比縮圖，整段一直重播）、播放列、資訊列、匯出區
 * （格式、FPS、播放次數、畫質、容量上限與自動調整）。
 */
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { loadAssetBitmaps, useAssetBitmaps } from '@/core/assets';
import {
  animationFormats,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Notice,
  NumberInput,
  Slider,
  Stage,
  type StageAnyBackgroundKind,
  Toggle,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { DECK_FPS, DECK_MANY_FRAMES, type DeckFormat, deckAssetIds, LIMITS } from './deck';
import { exportDeck } from './deckExport';
import { buildTimeline, capLimitBytes, deckFrameCount, deckSegments } from './deckPlan';
import { DeckPainter, type DeckScene } from './deckRender';
import { assets, deckNow, gesture, patchDeck, useDeck } from './deckStore';
import type { PreviewHandle } from './Preview';
import { useSession } from './store';
import { DECK } from './strings';

/** 預覽背景：棋盤格（看得出透明）、黑、白、示意場景（只供預覽） */
const STAGE_BACKGROUNDS: readonly StageAnyBackgroundKind[] = ['checker', 'dark', 'light', 'scene'];

/** 預覽畫布最長邊約這麼多像素（不放大） */
const PREVIEW_SIDE = 960;

const isFpsChoice = (n: number): n is (typeof DECK_FPS)[number] =>
  (DECK_FPS as readonly number[]).includes(n);

/** 快捷鍵的 FPS（24／30／60）換成圖片切換可用的最大 FPS（60 → 30） */
const nearestFps = (fps: number) => [...DECK_FPS].reverse().find((f) => f <= fps) ?? DECK_FPS[0];

export function DeckPreview({
  exportRef,
  ref,
}: {
  exportRef: Ref<ExportPanelHandle>;
  ref?: Ref<PreviewHandle>;
}) {
  const d = useDeck((s) => s.data);
  const exporting = useSession((st) => st.exporting);
  const webpSupported = useWebpSupport();
  const ids = useMemo(() => deckAssetIds(d), [d]);
  const { bitmaps, missing } = useAssetBitmaps(assets, ids);
  const tl = useMemo(() => buildTimeline(d), [d]);
  const count = d.slides.length;

  const scene = useMemo<DeckScene>(
    () => ({
      images: d.slides.map((s) => bitmaps.get(s.image.id) ?? null),
      segs: tl.segs,
      fit: d.fit,
      bg: d.bg,
      transparent: d.transparent,
      easing: d.easing,
    }),
    [d, bitmaps, tl],
  );

  /* 預覽：整段一直重播（不看匯出的播放次數） */
  const playback = usePlayback({ duration: Math.max(tl.total, 0.0001), loop: true });
  const pb = useRef(playback);
  pb.current = playback;
  /* 加入第一張圖：從頭播放 */
  const lastCount = useRef(count);
  useEffect(() => {
    if (lastCount.current === 0 && count > 0) {
      /* 使用者設定「減少動態效果」時停在第一格，不自動播放 */
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        pb.current.pause();
        pb.current.onTimeChange(0);
      } else pb.current.onRestart();
    }
    lastCount.current = count;
  }, [count]);

  /* 畫預覽 */
  const painter = useRef<DeckPainter | null>(null);
  if (!painter.current) painter.current = new DeckPainter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const ps = Math.min(1, PREVIEW_SIDE / Math.max(d.width, d.height));
  const pw = Math.max(1, Math.round(d.width * ps));
  const ph = Math.max(1, Math.round(d.height * ps));
  const time = Math.min(playback.time, tl.total);
  // biome-ignore lint/correctness/useExhaustiveDependencies: pw、ph 改變時畫布會被清空，要重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d', { willReadFrequently: true });
    if (!ctx || !painter.current) return;
    painter.current.paint(ctx, scene, d.width, d.height, time);
  }, [scene, time, d.width, d.height, pw, ph]);

  /* 快捷鍵的匯出：先換成 WebP 與指定 FPS，等設定生效（下一次繪製）後才匯出 */
  const [pendingExport, setPendingExport] = useState(0);
  const panel = useRef<ExportPanelHandle | null>(null);
  useEffect(() => {
    if (pendingExport) panel.current?.exportNow();
  }, [pendingExport]);
  useImperativeHandle(exportRef, () => ({
    exportNow: (f?: string) => panel.current?.exportNow(f),
    cancel: () => panel.current?.cancel(),
    get busy() {
      return !!panel.current?.busy;
    },
  }));
  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (useSession.getState().exporting || !deckNow().slides.length) return;
      pb.current.toggle();
    },
    exportWith: (fps: number) => {
      if (useSession.getState().exporting) return;
      patchDeck({ fps: nearestFps(fps), ...(webpSupported ? { format: 'webp' as const } : {}) });
      setPendingExport((n) => n + 1);
    },
    seek: (t: number) => pb.current.onTimeChange(t),
    get time() {
      return pb.current.time;
    },
    get playing() {
      return pb.current.playing;
    },
  }));

  /* 匯出 */
  const formats = useMemo(
    () => animationFormats(['webp', 'apng', 'gif'], { webpSupported }),
    [webpSupported],
  );
  const exportSettings: ExportSettings = {
    format: d.format,
    fps: d.fps,
    plays: d.plays,
    scale: 1,
    quantize: d.quantize,
  };
  const frames = deckFrameCount(tl.segs, d.fps);
  /* 下載作廢：內容或輸出設定改了就清掉上次的結果 */
  const signature = JSON.stringify([
    d.slides.map((s) => [s.image.id, s.hold, s.trans, s.dur]),
    d.intro,
    d.outro,
    d.width,
    d.height,
    d.fit,
    d.bg,
    d.transparent,
    d.loopBack,
    d.easing,
    d.seed,
    d.quality,
    d.capOn,
    d.capMb,
  ]);

  const runExport = async (
    set: ExportSettings,
    { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, l?: string) => void },
  ): Promise<ExportOutput> => {
    const data = deckNow();
    if (!data.slides.length) throw new Error(DECK.needImages);
    const idList = deckAssetIds(data);
    const loaded = await loadAssetBitmaps(assets, idList);
    const gone = new Set(idList.filter((id) => !loaded.has(id)));
    if (gone.size) {
      throw new Error(DECK.missingExport(data.slides.filter((s) => gone.has(s.image.id)).length));
    }
    pb.current.pause();
    useSession.setState({ exporting: true });
    try {
      const r = await exportDeck({
        state: data,
        bitmaps: loaded,
        format: set.format as DeckFormat,
        fps: set.fps,
        plays: set.plays,
        quantize: set.quantize,
        signal,
        onProgress,
      });
      const last = r.attempts[r.attempts.length - 1];
      const details: { label: string; value: string }[] = [
        {
          label: DECK.detailPlays,
          value: set.plays ? DECK.playsTimes(set.plays) : DECK.playsInfinite,
        },
        { label: DECK.detailFps, value: `${last.fps} fps` },
      ];
      if (set.format === 'webp')
        details.push({ label: DECK.detailQuality, value: String(Math.round(last.q * 100)) });
      if (data.capOn) {
        details.push({
          label: DECK.detailAdjust,
          value: r.adjustments.length
            ? DECK.adjusted(r.attempts.length, r.adjustments.join('、'))
            : DECK.notAdjusted,
        });
      }
      if (r.over) details.push({ label: DECK.detailNote, value: DECK.stillOver });
      return {
        blob: r.result.blob,
        fileName: r.result.fileName,
        width: r.result.width,
        height: r.result.height,
        frames: r.result.frames,
        storedFrames: r.result.storedFrames,
        duration: r.result.duration,
        details,
      };
    } finally {
      useSession.setState({ exporting: false });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage<StageAnyBackgroundKind>
        width={d.width}
        height={d.height}
        aria-label={DECK.previewLabel}
        backgrounds={STAGE_BACKGROUNDS}
        defaultBackground={{ kind: 'checker' }}
      >
        <canvas
          ref={canvas}
          width={pw}
          height={ph}
          className="block size-full"
          data-testid="deck-preview"
          data-output={`${d.width}x${d.height}`}
          data-time={time.toFixed(3)}
        />
        {!count ? (
          <div
            className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-border-strong text-center text-muted"
            style={{ fontSize: 'calc(16px / var(--stage-scale, 1))' }}
            data-testid="deck-preview-empty"
          >
            {DECK.previewEmpty}
          </div>
        ) : null}
      </Stage>
      <p className="m-0 text-xs text-muted tabular-nums" data-testid="deck-stats">
        {DECK.stats(tl.total, frames, d.width, d.height)}
        {frames > DECK_MANY_FRAMES ? (
          <span className="ml-2 font-medium text-warning" data-testid="deck-many-frames">
            {DECK.manyFrames}
          </span>
        ) : null}
      </p>
      <Transport
        {...playback}
        onLoopChange={undefined}
        onRateChange={playback.setRate}
        segments={deckSegments(tl.segs)}
        legend={false}
        fps={d.fps}
        disabled={exporting || !count}
      />
      {missing.length ? (
        <Notice tone="warning">
          <span data-testid="deck-missing">
            {DECK.missingNotice(d.slides.filter((s) => missing.includes(s.image.id)).length)}
          </span>
        </Notice>
      ) : null}

      <ExportPanel
        ref={panel}
        title={DECK.exportTitle}
        formats={formats}
        settings={exportSettings}
        onSettingsChange={(next) =>
          patchDeck({
            format: next.format as DeckFormat,
            fps: isFpsChoice(next.fps) ? next.fps : nearestFps(next.fps),
            plays: next.plays,
            quantize: next.quantize,
          })
        }
        fpsOptions={DECK_FPS}
        maxPlays={LIMITS.plays.max}
        limit={d.capOn ? { bytes: capLimitBytes(d.capMb), label: DECK.capLabel } : null}
        estimate={{ width: d.width, height: d.height, frames, duration: tl.total }}
        resetKey={signature}
        extra={
          <div className="flex flex-col gap-3">
            {d.format === 'webp' ? (
              <Field label={DECK.qualityLabel} hint={DECK.qualityHint}>
                <Slider
                  aria-label={DECK.qualityLabel}
                  value={d.quality}
                  min={LIMITS.quality.min}
                  max={LIMITS.quality.max}
                  step={1}
                  precision={0}
                  onChange={gesture.live((quality) => patchDeck({ quality }))}
                  onCommit={gesture.commit}
                />
              </Field>
            ) : null}
            <Field label={DECK.capLabel} hint={DECK.capHint}>
              <div className="flex flex-wrap items-center gap-3">
                <Toggle
                  label={DECK.capToggle}
                  checked={d.capOn}
                  onCheckedChange={(capOn) => patchDeck({ capOn })}
                />
                <NumberInput
                  aria-label={`${DECK.capLabel}（${DECK.capUnit}）`}
                  value={d.capMb}
                  onChange={(capMb) => patchDeck({ capMb })}
                  min={LIMITS.cap.min}
                  max={LIMITS.cap.max}
                  step={0.5}
                  precision={2}
                  unit={DECK.capUnit}
                  disabled={!d.capOn}
                  className="w-28"
                />
              </div>
            </Field>
            <p className="m-0 text-xs text-muted">{DECK.holdNote}</p>
          </div>
        }
        onExport={runExport}
      />
    </div>
  );
}
