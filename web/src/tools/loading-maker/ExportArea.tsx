/**
 * 匯出區（F152～F166）：長度與總長的組成、格式、FPS、播放次數、WebP 品質、GIF 透明判定、檔名、預估、
 * 處理量上限；匯出後直接下載並在狀態列說明。下方是「專案檔含素材」（F04）。
 */
import { gifAlphaThresholdInclusive, MAX_PLAYS } from '@/core/encode';
import { downloadBlob, formatBytes } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import { type AnimationSource, exportAnimation } from '@/core/timeline';
import {
  animationFormats,
  type ExportOutput,
  ExportPanel,
  type ExportSettings,
  Field,
  NumberInput,
  Slider,
  TextInput,
  Toggle,
  useWebpSupport,
} from '@/ui';
import { renderScene, Scratch } from './render';
import { setStatus, useRuntime } from './runtime';
import { type ExportFormat, PIXEL_BUDGET, RANGE } from './settings';
import { edit, settingsNow, useLm } from './store';
import { S } from './strings';
import { breakdown, lengthLabel } from './summary';
import { exportFrames, fileStem, formatExt, progressDuration, totalDuration } from './timing';

const FORMAT_LABEL: Record<ExportFormat, string> = { apng: 'APNG', webp: 'WebP', gif: 'GIF' };

/** 匯出：用按下當時的設定與素材（匯出中改設定不影響） */
async function runExport(
  set: ExportSettings,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, l?: string) => void },
): Promise<ExportOutput> {
  const s = settingsNow();
  const media = useRuntime.getState().media;
  const format = set.format as ExportFormat;
  useRuntime.setState({ exporting: true });
  try {
    await Promise.all(
      [s.text.top, s.text.bottom].map((b) => ensureFont(b.font.family, b.font.weight, b.text)),
    );
    const frames = exportFrames(s, set.fps);
    const scratch = new Scratch();
    const source: AnimationSource = {
      width: s.canvas.width,
      height: s.canvas.height,
      duration: totalDuration(s),
      frames,
      stillTime: 0,
      render: (ctx, t) => renderScene(ctx, s, media, t, scratch),
    };
    const stem = fileStem(s.export.fileName);
    const r = await exportAnimation(source, {
      format,
      fps: set.fps,
      plays: set.plays,
      quantize: format === 'apng' && set.quantize,
      webpQuality: s.export.quality,
      gifAlphaThreshold: gifAlphaThresholdInclusive(s.export.gifThreshold),
      fileName: stem,
      maxFrames: 100_000,
      signal,
      onProgress: (ratio, label) => onProgress(ratio, label),
    });
    const fileName = `${stem}.${formatExt(format)}`;
    downloadBlob(r.blob, fileName);
    setStatus('success', S.status.exported(FORMAT_LABEL[format], formatBytes(r.blob.size)));
    return {
      blob: r.blob,
      fileName,
      width: r.width,
      height: r.height,
      frames: r.frames,
      storedFrames: r.storedFrames,
      duration: r.duration,
    };
  } catch (e) {
    if ((e instanceof DOMException && e.name === 'AbortError') || signal.aborted)
      setStatus('warning', S.status.exportCancelled);
    else setStatus('danger', e instanceof Error ? e.message : String(e));
    throw e;
  } finally {
    useRuntime.setState({ exporting: false });
  }
}

export function ExportArea() {
  const s = useLm((st) => st.data);
  const webp = useWebpSupport();
  const ex = s.export;
  const keyframeMode = s.loader.type === 'bar' && s.bar.mode === 'keyframes';
  const frames = exportFrames(s).length;
  const panelSettings: ExportSettings = {
    format: ex.format,
    fps: ex.fps,
    plays: ex.plays,
    scale: 1,
    quantize: ex.quantize,
  };
  return (
    <>
      <ExportPanel
        formats={animationFormats(['apng', 'webp', 'gif'], { webpSupported: webp })}
        settings={panelSettings}
        onSettingsChange={(next) =>
          edit((d) => {
            d.export.format = next.format as ExportFormat;
            d.export.fps = Math.round(Math.min(RANGE.fps[1], Math.max(RANGE.fps[0], next.fps)));
            d.export.plays = Math.round(Math.min(MAX_PLAYS, Math.max(0, next.plays)));
            d.export.quantize = next.quantize;
          })
        }
        fpsInput={{ min: RANGE.fps[0], max: RANGE.fps[1], hint: S.export.fpsHint }}
        maxPlays={MAX_PLAYS}
        loopHint={S.export.loopHint}
        estimate={{
          width: s.canvas.width,
          height: s.canvas.height,
          frames,
          duration: totalDuration(s),
        }}
        pixelBudget={{ max: PIXEL_BUDGET, message: S.status.tooHeavy }}
        extra={
          <>
            <Field label={lengthLabel(s)}>
              {keyframeMode ? (
                <output
                  className="flex h-9 items-center text-sm text-fg tabular-nums"
                  data-testid="length-readonly"
                >
                  {S.export.lengthReadonly(progressDuration(s).toFixed(2))}
                </output>
              ) : (
                <NumberInput
                  value={s.duration}
                  onChange={(v) =>
                    edit((d) => {
                      d.duration = v;
                    })
                  }
                  min={RANGE.duration[0]}
                  max={RANGE.duration[1]}
                  step={0.05}
                  precision={6}
                  unit="秒"
                  className="w-40"
                />
              )}
            </Field>
            <p className="m-0 -mt-1 text-xs text-muted tabular-nums" data-testid="breakdown">
              {breakdown(s)}
            </p>
            {ex.format === 'webp' ? (
              <Field label={S.export.quality} hint={S.export.qualityHint}>
                <Slider
                  value={ex.quality}
                  onChange={(v) =>
                    edit((d) => {
                      d.export.quality = v;
                    })
                  }
                  min={RANGE.quality[0]}
                  max={RANGE.quality[1]}
                  step={0.01}
                />
              </Field>
            ) : null}
            {ex.format === 'gif' ? (
              <Field label={S.export.gifThreshold} hint={S.export.gifThresholdHint}>
                <Slider
                  value={ex.gifThreshold}
                  onChange={(v) =>
                    edit((d) => {
                      d.export.gifThreshold = Math.round(v);
                    })
                  }
                  min={RANGE.gifThreshold[0]}
                  max={RANGE.gifThreshold[1]}
                />
              </Field>
            ) : null}
            <Field label={S.export.fileName} hint={S.export.fileNameHint(fileStem(ex.fileName))}>
              <TextInput
                value={ex.fileName}
                maxLength={200}
                onChange={(e) =>
                  edit((d) => {
                    d.export.fileName = e.target.value;
                  })
                }
              />
            </Field>
          </>
        }
        onExport={runExport}
      />
      <Field label={S.export.includeAssets} layout="inline" hint={S.export.includeAssetsHint}>
        <Toggle
          checked={ex.includeAssets}
          onCheckedChange={(v) =>
            edit((d) => {
              d.export.includeAssets = v;
            })
          }
        />
      </Field>
    </>
  );
}
