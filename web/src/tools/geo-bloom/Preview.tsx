/**
 * 預覽欄：舞台（Worker 畫好的預覽，大畫布時縮小）、產生、種子、固定種子、統計，以及匯出區（PNG、SVG）。
 */
import { Shuffle } from 'lucide-react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { deviceResolutionLimits } from '@/core/image';
import {
  Button,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  Field,
  Kbd,
  Notice,
  Stage,
  TextInput,
  Toggle,
} from '@/ui';
import { createPreviewer, exportPng, exportSvg, type PreviewResult } from './client';
import type { BloomStats } from './generate';
import { exportFileName, SEED_MAX_LENGTH, type Settings } from './settings';
import { regenerate, setOption, setSetting, settingsNow, useSettings } from './store';
import { S } from './strings';

interface Shown {
  stats: BloomStats;
  scale: number;
  /** 這張預覽是哪一組設定畫的 */
  settings: Settings;
}

/** 依最新的設定在 Worker 裡畫預覽，畫好才換上 */
function usePreview(canvas: RefObject<HTMLCanvasElement | null>) {
  const settings = useSettings((st) => st.data);
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const previewer = useRef<ReturnType<typeof createPreviewer> | null>(null);

  useEffect(() => {
    const p = createPreviewer(
      (r: PreviewResult, s) => {
        const c = canvas.current;
        const ctx = c?.getContext('2d');
        if (c && ctx) {
          c.width = r.width;
          c.height = r.height;
          ctx.drawImage(r.image, 0, 0);
        }
        if ('close' in r.image && typeof r.image.close === 'function') r.image.close();
        setShown({ stats: r.stats, scale: r.scale, settings: s });
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
    previewer.current = p;
    return () => {
      p.dispose();
      previewer.current = null;
    };
  }, [canvas]);

  /* 宣告在建立 previewer 的 effect 後面：開頁時同一輪就送出第一張 */
  useEffect(() => {
    previewer.current?.request(settings);
  }, [settings]);

  const ready = shown?.settings === settings;
  /* 畫超過 0.3 秒才顯示「繪製中…」（一般的設定一下就畫好，不閃） */
  useEffect(() => {
    if (ready) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(t);
  }, [ready]);

  return { settings, shown, ready, slow, error };
}

function SeedRow() {
  const seed = useSettings((st) => st.data.seed);
  const lockSeed = useSettings((st) => st.data.lockSeed);
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Button
          variant="primary"
          icon={<Shuffle />}
          aria-keyshortcuts="Space"
          title={S.generateHint}
          onClick={regenerate}
          data-testid="generate"
        >
          {S.generate}
          <span aria-hidden className="hidden lg:inline-flex">
            <Kbd>Space</Kbd>
          </span>
        </Button>
        <Field label={S.seed} className="min-w-40 flex-1">
          <TextInput
            value={seed}
            maxLength={SEED_MAX_LENGTH}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setSetting('seed', e.currentTarget.value.slice(0, SEED_MAX_LENGTH))}
            data-testid="seed"
          />
        </Field>
      </div>
      <p className="m-0 -mt-1 text-xs text-muted">{S.seedHint}</p>
      <Field label={S.lockSeed} hint={S.lockSeedHint} layout="inline">
        <Toggle checked={lockSeed} onCheckedChange={(on) => setOption('lockSeed', on)} />
      </Field>
    </div>
  );
}

export function Preview({ exportRef }: { exportRef: RefObject<ExportPanelHandle | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { settings, shown, ready, slow, error } = usePreview(canvas);
  const { width, height } = settings;
  const limits = deviceResolutionLimits();
  const tooBig = !!limits.maxPixels && width * height > limits.maxPixels;
  const formats = useMemo(
    () => [
      { id: 'png', label: S.formatPng, description: S.formatPngDesc },
      { id: 'svg', label: S.formatSvg, description: S.formatSvgDesc },
    ],
    [],
  );

  const onExport = async (
    st: { format: string },
    { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, l?: string) => void },
  ): Promise<ExportOutput> => {
    const s = settingsNow();
    const t0 = performance.now();
    onProgress(0.1, st.format === 'svg' ? S.formatSvg : S.formatPng);
    const blob = st.format === 'svg' ? await exportSvg(s, signal) : await exportPng(s, signal);
    onProgress(1);
    return {
      blob,
      fileName: exportFileName(s.seed, st.format === 'svg' ? 'svg' : 'png'),
      width: s.width,
      height: s.height,
      details: [{ label: S.exportTime, value: S.seconds(performance.now() - t0) }],
    };
  };

  const percent = shown && shown.scale < 1 ? Math.round(shown.scale * 100) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className="relative"
        data-testid="bloom-preview"
        data-ready={ready ? 'true' : 'false'}
        data-shapes={shown?.stats.shapes}
        data-lines={shown?.stats.lines}
        data-dots={shown?.stats.dots}
      >
        <Stage width={width} height={height} aria-label={S.previewLabel}>
          <canvas ref={canvas} className="block size-full" data-testid="bloom-canvas" />
        </Stage>
        {slow ? (
          <span
            role="status"
            className="absolute top-12 left-3 rounded-md bg-surface/90 px-2 py-1 text-xs text-fg shadow-1"
          >
            {S.drawing}
          </span>
        ) : null}
      </div>
      <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
        <span data-testid="bloom-stats">
          {shown ? S.stats(shown.stats.shapes, shown.stats.lines, shown.stats.dots) : '　'}
        </span>
        <span data-testid="bloom-size">{S.sizeInfo(width, height)}</span>
        {percent !== null ? <span data-testid="bloom-scaled">{S.scaledNote(percent)}</span> : null}
      </p>
      {error ? <Notice tone="danger">{S.previewFailed(error)}</Notice> : null}
      <SeedRow />
      {tooBig ? (
        <Notice tone="warning">
          <span data-testid="device-limit">{S.deviceLimit(width, height)}</span>
        </Notice>
      ) : null}
      <ExportPanel
        ref={exportRef}
        formats={formats}
        defaultSettings={{ format: 'png' }}
        resetKey={settings}
        sizeWarningHint={S.sizeWarningHint}
        onExport={onExport}
      />
    </div>
  );
}
