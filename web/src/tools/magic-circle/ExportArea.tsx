/**
 * 匯出區（規格 1.11、5. D9）：共用 ExportPanel。PNG／靜態 WebP＝播放頭的畫面；GIF、APNG、動態 WebP＝整段動畫。
 * 長度、FPS、循環、透明背景與時間軸／畫布分頁共用同一個設定。
 */
import { type RefObject, useMemo } from 'react';
import { createFrameCanvas, drawFrame, exportAnimation, frameCount } from '@/core/timeline';
import {
  type ExportFormatOption,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Slider,
  Toggle,
  useWebpSupport,
} from '@/ui';
import { bridge, edit, notify } from './actions';
import {
  EXPORT_FORMAT_IDS,
  type ExportFormatId,
  exportFrames,
  exportSizeOf,
  isAnimated,
  MAX_FRAMES,
  PIXEL_BUDGET,
  SCALE_OPTIONS,
  stillBaseName,
} from './exportRules';
import { clamp } from './geometry';
import { fileBase, type McProject, RANGE } from './model';
import { renderScene } from './render';
import { projectNow, usePrefs, useProject } from './store';
import { S } from './strings';

const abortError = () => new DOMException('已取消', 'AbortError');

async function stillWebp(
  p: McProject,
  time: number,
  scale: number,
  quality: number,
  signal: AbortSignal,
): Promise<Blob> {
  const { width, height } = exportSizeOf(p, scale);
  const { canvas, ctx } = createFrameCanvas(width, height);
  await drawFrame(
    ctx,
    {
      width: p.document.width,
      height: p.document.height,
      duration: p.animation.duration,
      render: (c, t) => renderScene(c, p, t, { pixelScale: scale }),
    },
    time,
    { scale },
  );
  if (signal.aborted) throw abortError();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', clamp(quality, 1, 100) / 100),
  );
  if (blob?.type !== 'image/webp') throw new Error(S.export.noWebp);
  return blob;
}

/** 匯出（按下當時的作品與設定） */
export async function runExport(
  s: ExportSettings,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, l?: string) => void },
): Promise<ExportOutput> {
  const p = projectNow();
  const prefs = usePrefs.getState().data;
  const format = s.format as ExportFormatId;
  const scale = s.scale;
  const time = bridge.time();
  const base = fileBase(p.document.name);
  const { width, height } = exportSizeOf(p, scale);
  const render = (ctx: Parameters<typeof renderScene>[0], t: number) =>
    renderScene(ctx, p, t, { pixelScale: scale });
  const stillDetails = [{ label: S.export.resultTime, value: `${time.toFixed(2)} 秒` }];
  try {
    if (format === 'webp-still') {
      onProgress(0.5, S.export.step.still);
      const blob = await stillWebp(p, time, scale, prefs.webpQuality, signal);
      onProgress(1, S.export.step.still);
      notify(S.msg.exportDone, 'success');
      return {
        blob,
        fileName: `${stillBaseName(base, time)}.webp`,
        width,
        height,
        details: stillDetails,
      };
    }
    if (format === 'png') {
      const r = await exportAnimation(
        {
          width: p.document.width,
          height: p.document.height,
          duration: p.animation.duration,
          stillTime: time,
          render,
        },
        { format: 'png', scale, fileName: stillBaseName(base, time), signal, onProgress },
      );
      notify(S.msg.exportDone, 'success');
      return {
        blob: r.blob,
        fileName: r.fileName,
        width: r.width,
        height: r.height,
        details: stillDetails,
      };
    }
    const fps = clamp(Math.round(s.fps), RANGE.fps[0], RANGE.fps[1]);
    const frames = exportFrames(p.animation.duration, fps);
    const label = S.export.formats[format].label;
    const r = await exportAnimation(
      {
        width: p.document.width,
        height: p.document.height,
        duration: frames.length / fps,
        frames,
        stillTime: 0,
        render,
      },
      {
        format,
        fps,
        plays: s.plays,
        scale,
        quantize: format === 'apng' && s.quantize,
        webpQuality: clamp(prefs.webpQuality, 1, 100) / 100,
        gifLocalPalettes: true,
        fileName: base,
        maxFrames: MAX_FRAMES,
        signal,
        onProgress: (ratio, l) =>
          onProgress(ratio, ratio < 1 ? `${S.export.step.frames(label)}` : l),
      },
    );
    notify(S.msg.exportDone, 'success');
    return {
      blob: r.blob,
      fileName: r.fileName,
      width: r.width,
      height: r.height,
      frames: r.frames,
      storedFrames: r.storedFrames,
      duration: r.duration,
    };
  } catch (e) {
    if ((e instanceof DOMException && e.name === 'AbortError') || signal.aborted) {
      notify(S.msg.exportCancelled);
      throw abortError();
    }
    throw e;
  }
}

export function ExportArea({ exportRef }: { exportRef?: RefObject<ExportPanelHandle | null> }) {
  const doc = useProject((st) => st.data.document);
  const anim = useProject((st) => st.data.animation);
  const prefs = usePrefs((st) => st.data);
  const webp = useWebpSupport();
  const formats: ExportFormatOption[] = useMemo(
    () =>
      EXPORT_FORMAT_IDS.map((id) => {
        const off = (id === 'webp' || id === 'webp-still') && !webp;
        const f = S.export.formats[id];
        return {
          id,
          label: f.label,
          description: f.description,
          animated: isAnimated(id),
          supportsLoop: isAnimated(id),
          supportsQuantize: id === 'apng',
          disabled: off,
          disabledReason: off ? S.export.webpUnsupported : undefined,
        };
      }),
    [webp],
  );
  const settings: ExportSettings = {
    format: prefs.exportFormat,
    fps: anim.fps,
    plays: anim.plays,
    scale: prefs.exportScale,
    quantize: prefs.quantize,
  };
  const animated = isAnimated(prefs.exportFormat);
  const out = exportSizeOf(useProject.getState().data, prefs.exportScale);
  const n = frameCount(anim.duration, anim.fps);
  const tooMany = animated && n > MAX_FRAMES;
  return (
    <ExportPanel
      ref={exportRef}
      formats={formats}
      settings={settings}
      onSettingsChange={(next) => {
        usePrefs.getState().update((d) => {
          d.exportFormat = next.format as ExportFormatId;
          d.exportScale = next.scale;
          d.quantize = next.quantize;
        });
        if (next.fps !== anim.fps || next.plays !== anim.plays)
          edit((d) => {
            d.animation.fps = Math.round(clamp(next.fps, RANGE.fps[0], RANGE.fps[1]));
            d.animation.plays = Math.round(clamp(next.plays, RANGE.plays[0], RANGE.plays[1]));
          });
      }}
      baseSize={{ width: doc.width, height: doc.height }}
      scaleOptions={SCALE_OPTIONS}
      fpsInput={{ min: RANGE.fps[0], max: RANGE.fps[1] }}
      loopHint={S.export.loopHint}
      estimate={
        animated
          ? { width: out.width, height: out.height, frames: n, duration: n / anim.fps }
          : null
      }
      pixelBudget={
        animated
          ? tooMany
            ? { max: 0, message: S.export.tooManyFrames(n) }
            : { max: PIXEL_BUDGET, message: S.export.tooHeavy }
          : null
      }
      extra={
        <>
          <Field label={S.export.transparent} layout="inline" hint={S.export.transparentHint}>
            <Toggle
              checked={doc.transparent}
              onCheckedChange={(on) =>
                edit((d) => {
                  d.document.transparent = on;
                })
              }
            />
          </Field>
          {prefs.exportFormat === 'webp' || prefs.exportFormat === 'webp-still' ? (
            <Field label={S.export.quality} hint={S.export.qualityHint}>
              <Slider
                value={prefs.webpQuality}
                onChange={(v) =>
                  usePrefs.getState().update((d) => {
                    d.webpQuality = Math.round(clamp(v, 1, 100));
                  })
                }
                min={1}
                max={100}
                step={1}
              />
            </Field>
          ) : null}
          {prefs.exportFormat === 'gif' ? (
            <p className="m-0 text-xs text-muted">{S.export.gifNote}</p>
          ) : null}
          {!animated ? (
            <p className="m-0 text-xs text-muted" data-testid="still-note">
              {S.export.stillNote(prefs.playhead.toFixed(2))}
            </p>
          ) : null}
        </>
      }
      onExport={runExport}
    />
  );
}
