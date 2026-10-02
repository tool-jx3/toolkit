/**
 * 預覽區（規格 1.7、1.8）：
 * - 畫面以 480 × 270 計算（方塊大小與字級等比縮小），平滑放大填滿預覽區；背景可選示意場景、白色、棋盤格、自選圖片。
 * - 一律重複播放，每格的時間＝該格的延遲（未四捨五入）；沒勾循環播放時每輪結束後多停約 1.2 秒。
 * - 改設定約 0.12 秒後重算並從頭播放；換效果、復原、重做立即重算。
 * - 狀態列：輸出摘要（影格數與匯出相同；秒數是檔案實際的總長）、字型載入、匯出進度與結果。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob, SIZE_WARNING_BYTES } from '@/core/files';
import { frameIndexAt, frameTableDuration } from '@/core/timeline';
import {
  type ExportFormatOption,
  ExportPanel,
  Notice,
  type NoticeTone,
  Stage,
  type StageAnyBackgroundKind,
  type StageBackground,
  Transport,
  UsageSection,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { captionSpecOf, drawCaption } from './caption';
import { effectById } from './effects';
import { exportTransition } from './exporter';
import { ensureCaptionFont, isWebFont } from './fonts';
import { mergeRuns, PREVIEW_SIZE, planOf, renderFrame, runDelayMs } from './render';
import { type ExportFormatId, type Settings, sizeOf } from './settings';
import { patch, setValue, takeImmediate, useSt } from './store';
import { S } from './strings';

const BACKGROUNDS: readonly StageAnyBackgroundKind[] = ['scene', 'light', 'checker', 'image'];

type FontState = 'ok' | 'loading' | 'missing';

/** 改設定後的預覽設定：約 0.12 秒後跟上（連續變更以最後一次為準）；換效果、復原、重做立即跟上 */
function usePreviewSettings(): Settings {
  const settings = useSt((st) => st.data);
  const [view, setView] = useState(settings);
  useEffect(() => {
    if (settings === view) return;
    if (takeImmediate()) {
      setView(settings);
      return;
    }
    const t = setTimeout(() => setView(settings), 120);
    return () => clearTimeout(t);
  }, [settings, view]);
  return view;
}

/** 字幕圖層（Google 字型先載入；約 10 秒載不到就用後備字型） */
function useCaptionLayer(view: Settings, scale: number) {
  const spec = useMemo(
    () => captionSpecOf(view, PREVIEW_SIZE.width, PREVIEW_SIZE.height, scale),
    [view, scale],
  );
  const key = spec ? JSON.stringify(spec) : '';
  const [font, setFont] = useState<FontState>('ok');
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已經包含字幕的內容與字型
  useEffect(() => {
    if (!spec || !isWebFont(spec.font)) {
      setFont('ok');
      return;
    }
    let alive = true;
    setFont('loading');
    ensureCaptionFont(spec.font, spec.text).then((ok) => {
      if (!alive) return;
      setFont(ok ? 'ok' : 'missing');
      setTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick＝字型載入完成後重畫
  const layer = useMemo(() => (spec ? drawCaption(spec) : null), [key, tick]);
  return { layer, font };
}

declare global {
  interface Window {
    __sceneTransition?: unknown;
  }
}

export function PreviewPane() {
  const view = usePreviewSettings();
  const out = sizeOf(view.size);
  const scale = PREVIEW_SIZE.width / out.width;
  const plan = useMemo(
    () => planOf(view, PREVIEW_SIZE.width, PREVIEW_SIZE.height, scale),
    [view, scale],
  );
  const { layer, font } = useCaptionLayer(view, scale);
  const runs = useMemo(() => mergeRuns(plan, layer), [plan, layer]);
  const duration = frameTableDuration(plan.frames);
  const fileMs = runs.reduce((a, r) => a + runDelayMs(r), 0);

  /* 預覽一律重複播放；檔案只播一次時每輪結尾多停 1.2 秒 */
  const playback = usePlayback({ duration, loop: true, loopGap: view.loop ? 0 : 1.2 });
  const { playing, onRestart, onTimeChange } = playback;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 設定（預覽）改變時從頭播放
  useEffect(() => {
    if (playingRef.current) onRestart();
    else onTimeChange(0);
  }, [view]);

  /* 畫目前這一格 */
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<ImageData | null>(null);
  const drawn = useRef<{ plan: unknown; layer: unknown; index: number }>({
    plan: null,
    layer: null,
    index: -1,
  });
  const index = Math.max(0, frameIndexAt(plan.frames, playback.time));
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const d = drawn.current;
    if (d.plan === plan && d.layer === layer && d.index === index) return;
    image.current ??= new ImageData(PREVIEW_SIZE.width, PREVIEW_SIZE.height);
    renderFrame(plan, plan.frames[index], layer, image.current.data);
    ctx.putImageData(image.current, 0, 0);
    drawn.current = { plan, layer, index };
  }, [plan, layer, index]);

  /* 測試與對等驗證用 */
  useEffect(() => {
    window.__sceneTransition = {
      data: () => useSt.getState().data,
      patch: (p: Partial<Settings>) => patch(p),
      preview: () => ({
        frames: plan.frames.length,
        merged: runs.length,
        fileMs,
        delays: plan.frames.map((f) => f.ms),
        runs: runs.map((r) => ({ first: r.first, count: r.count, ms: r.ms })),
      }),
      frame: () => index,
      seekFrame: (i: number) => {
        playback.pause();
        let ms = 0;
        for (let k = 0; k < i && k < plan.frames.length; k++) ms += plan.frames[k].ms;
        playback.onTimeChange(ms / 1000 + 1e-6);
      },
    };
  });

  /* 預覽背景（不存檔；取消選檔時維持原本的背景） */
  const [bg, setBg] = useState<StageBackground<StageAnyBackgroundKind>>({ kind: 'scene' });

  /* 狀態列 */
  const [exportStatus, setExportStatus] = useState<{ tone: NoticeTone; text: string } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 設定改變時回到輸出摘要
  useEffect(() => setExportStatus(null), [view]);
  const summary = S.status.summary(view.size, runs.length, fileMs / 1000, view.loop);
  const status: { tone: NoticeTone; text: string } =
    exportStatus ??
    (font === 'loading'
      ? { tone: 'progress', text: S.status.fontLoading }
      : {
          tone: font === 'missing' ? 'warning' : 'info',
          text: summary + (font === 'missing' ? S.status.fontMissing : ''),
        });

  /* 匯出 */
  const webp = useWebpSupport();
  const settings = useSt((st) => st.data);
  const format: ExportFormatId = webp ? settings.format : 'apng';
  const formats: ExportFormatOption[] = [
    {
      id: 'webp',
      label: S.formats.webp,
      description: S.formatNotes.webp,
      animated: true,
      disabled: !webp,
      disabledReason: webp ? undefined : S.noWebp,
    },
    { id: 'apng', label: S.formats.apng, description: S.formatNotes.apng, animated: true },
  ];
  const block = effectById(settings.effect).shape === 'dissolve';
  const sizeHint = format === 'webp' ? S.sizeHint.webp(block) : S.sizeHint.apng(webp, block);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage<StageAnyBackgroundKind>
        width={PREVIEW_SIZE.width}
        height={PREVIEW_SIZE.height}
        fitUpscale
        backgroundArea="content"
        aria-label={S.previewLabel}
        backgrounds={BACKGROUNDS}
        background={bg}
        onBackgroundChange={(b) => {
          if (b.kind === 'image' && !b.imageUrl) return;
          setBg(b);
        }}
      >
        <canvas
          ref={canvas}
          width={PREVIEW_SIZE.width}
          height={PREVIEW_SIZE.height}
          className="block size-full"
          data-testid="st-canvas"
        />
      </Stage>
      <Transport
        {...playback}
        frames={plan.frames}
        onRateChange={playback.setRate}
        onLoopChange={undefined}
      />
      <Notice tone={status.tone}>
        <span data-testid="st-status">{status.text}</span>
      </Notice>
      <ExportPanel
        formats={formats}
        settings={{
          format,
          fps: settings.fps,
          plays: settings.loop ? 0 : 1,
          scale: 1,
          quantize: false,
        }}
        onSettingsChange={(x) => {
          if ((x.format === 'webp' || x.format === 'apng') && x.format !== format)
            setValue('format', x.format);
        }}
        fixedFps={settings.fps}
        fixedFpsHint={S.exportedFps}
        sizeWarningHint={sizeHint}
        onExport={async (x, { signal, onProgress }) => {
          const s = useSt.getState().data;
          const fmt: ExportFormatId = x.format === 'webp' ? 'webp' : 'apng';
          setExportStatus({ tone: 'progress', text: S.status.exporting });
          try {
            const r = await exportTransition(s, fmt, {
              signal,
              onProgress: (ratio, done, total) => {
                const text = S.status.exportingFrame(done, total);
                onProgress(ratio * 0.95, text);
                setExportStatus({ tone: 'progress', text });
              },
            });
            downloadBlob(r.blob, r.fileName);
            const over = r.blob.size > SIZE_WARNING_BYTES;
            const blockShape = effectById(s.effect).shape === 'dissolve';
            const warn = over
              ? fmt === 'webp'
                ? S.status.tooBigWebp(blockShape)
                : S.status.tooBigApng(webp, blockShape)
              : '';
            setExportStatus({
              tone: over ? 'warning' : 'success',
              text: `${S.status.saved(r.fileName, s.size, r.storedFrames, r.blob.size)}${
                warn ? `　${warn}` : ''
              }${r.fontOk ? '' : S.status.fontMissing}`,
            });
            return {
              blob: r.blob,
              fileName: r.fileName,
              width: r.width,
              height: r.height,
              frames: r.frames,
              storedFrames: r.storedFrames,
              duration: r.durationMs / 1000,
            };
          } catch (e) {
            const aborted = e instanceof DOMException && e.name === 'AbortError';
            setExportStatus(
              aborted
                ? null
                : {
                    tone: 'danger',
                    text: S.status.error(e instanceof Error ? e.message : String(e)),
                  },
            );
            throw e;
          }
        }}
      />
      <UsageSection persistKey="scene-transition">
        <ul>
          {S.usage.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </UsageSection>
    </div>
  );
}
