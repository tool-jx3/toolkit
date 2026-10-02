/**
 * 分頁 04「匯出」（規格 1.12）：共用匯出區（APNG、WebP、GIF、MP4、AVI；尺寸、FPS、WebP 品質、預估、進度與取消、結果卡）
 * 與互動 HTML。
 */
import { Code2, ExternalLink } from 'lucide-react';
import { type Ref, useEffect, useMemo, useState } from 'react';
import { canEncodeMp4 } from '@/core/video';
import {
  animationFormats,
  Button,
  type ExportContext,
  type ExportFormatOption,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Section,
  Select,
  useConfirm,
  useWebpSupport,
} from '@/ui';
import { blockingIssue, notify } from './actions';
import { CONFIRM_PIXELS, exportFile, isVideo, outputSize, planFor } from './exporter';
import { HtmlDialog, openInteractivePreview } from './HtmlDialog';
import { resolveAssets } from './media';
import {
  type ExportFormatId,
  FPS_CHOICES,
  SCALE_CHOICES,
  type Settings,
  WEBP_QUALITY_CHOICES,
} from './model';
import { framePlan, timelineDuration, videoFramePlan } from './motion';
import { edit, settingsNow, useSession, useSettings } from './store';
import { S } from './strings';

/** 這個瀏覽器能不能編 MP4（檢查前當成可以） */
function useMp4Support(): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    let alive = true;
    canEncodeMp4().then(
      (v) => alive && setOk(v),
      () => alive && setOk(false),
    );
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export function ExportTab({ exportRef }: { exportRef?: Ref<ExportPanelHandle> }) {
  const s = useSettings((st) => st.data);
  const exporting = useSession((st) => st.exporting);
  const webpSupported = useWebpSupport();
  const mp4Supported = useMp4Support();
  const confirm = useConfirm();
  const [htmlOpen, setHtmlOpen] = useState(false);
  const format = s.export.format;

  const formats = useMemo<ExportFormatOption[]>(() => {
    const image = animationFormats(['apng', 'webp', 'gif'], { webpSupported }).map((f) => ({
      ...f,
      label: S.exp.formats[f.id as 'apng' | 'webp' | 'gif'].label,
      description: S.exp.formats[f.id as 'apng' | 'webp' | 'gif'].description,
      /* 循環由「無限循環」決定；APNG 一律無損 */
      supportsLoop: false,
      supportsQuantize: false,
      supportsColors: false,
    }));
    return [
      ...image,
      {
        id: 'mp4',
        label: S.exp.formats.mp4.label,
        description: S.exp.formats.mp4.description,
        animated: true,
        disabled: !mp4Supported,
        disabledReason: mp4Supported ? undefined : S.exp.mp4Unsupported,
      },
      {
        id: 'avi',
        label: S.exp.formats.avi.label,
        description: S.exp.formats.avi.description,
        animated: true,
      },
    ];
  }, [webpSupported, mp4Supported]);

  const fps = format === 'gif' ? Math.min(50, s.export.fps) : s.export.fps;
  const plan = planFor(s, format, fps);
  const size = outputSize(s, format, s.export.scale);
  const imageFrames = framePlan(s, s.export.fps).length;
  const videoFrames = videoFramePlan(s, s.export.fps).length;
  const signature = useMemo(() => JSON.stringify({ ...s, ui: null }), [s]);

  const runExport = async (
    set: ExportSettings,
    { signal, onProgress }: ExportContext,
  ): Promise<ExportOutput> => {
    const now: Settings = settingsNow();
    const issue = blockingIssue(now);
    if (issue) {
      notify({ title: issue, tone: 'danger' });
      throw new Error(issue);
    }
    const f = set.format as ExportFormatId;
    const out = outputSize(now, f, set.scale);
    const frames = planFor(now, f, set.fps).length;
    const pixels = out.width * out.height * frames;
    if (
      pixels > CONFIRM_PIXELS &&
      !(await confirm({
        title: S.exp.bigTitle,
        description: S.exp.bigText(Math.round(pixels / 1_000_000)),
        confirmLabel: S.exp.bigConfirm,
      }))
    )
      throw new DOMException('已取消', 'AbortError');
    useSession.setState({ exporting: true });
    try {
      const assets = await resolveAssets(now);
      const r = await exportFile({
        settings: now,
        assets,
        format: f,
        fps: set.fps,
        scale: set.scale,
        webpQuality: now.export.webpQuality,
        signal,
        onProgress,
      });
      notify({ title: S.toast.exported(S.exp.formats[f].label), tone: 'success' });
      return {
        ...r,
        details: [
          { label: S.exp.details.size, value: `${now.canvas.width} × ${now.canvas.height}` },
          { label: S.exp.details.time, value: `${(timelineDuration(now) / 1000).toFixed(2)} 秒` },
          { label: S.exp.details.frames, value: `${frames} 格・${set.fps} FPS` },
        ],
      };
    } catch (e) {
      if (isAbort(e) || signal.aborted) notify({ title: S.toast.cancelled, tone: 'warning' });
      throw e;
    } finally {
      useSession.setState({ exporting: false });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.exp.lead}</p>
      <ExportPanel
        ref={exportRef}
        title={S.exp.title}
        formats={formats}
        settings={{ format, fps: s.export.fps, plays: 0, scale: s.export.scale, quantize: false }}
        onSettingsChange={(next) =>
          edit((d) => {
            d.export.format = next.format as ExportFormatId;
            d.export.fps = next.fps;
            d.export.scale = next.scale;
          })
        }
        baseSize={{ width: s.canvas.width, height: s.canvas.height }}
        fpsOptions={FPS_CHOICES}
        scaleOptions={SCALE_CHOICES}
        estimate={{
          width: size.width,
          height: size.height,
          frames: plan.length,
          duration: timelineDuration(s) / 1000,
        }}
        resetKey={signature}
        extra={
          <div className="flex flex-col gap-2">
            {format === 'webp' ? (
              <Field label={S.exp.webpQuality} hint={S.exp.webpQualityHint}>
                <Select
                  value={String(s.export.webpQuality)}
                  onValueChange={(v) =>
                    edit((d) => {
                      d.export.webpQuality = Number(v);
                    })
                  }
                  options={WEBP_QUALITY_CHOICES.map((q) => ({
                    value: String(q),
                    label: String(Math.round(q * 100)),
                  }))}
                  disabled={exporting}
                />
              </Field>
            ) : null}
            <p className="m-0 text-xs text-muted tabular-nums" data-testid="frame-counts">
              {S.exp.counts(imageFrames, videoFrames, s.export.fps)}
            </p>
            {S.exp.notes.map((n) => (
              <p key={n} className="m-0 text-xs text-muted">
                {n}
              </p>
            ))}
            {isVideo(format) ? (
              <p className="m-0 text-xs text-muted">{S.bg.transparentHint}</p>
            ) : null}
          </div>
        }
        onExport={runExport}
      />
      <Section title={S.exp.htmlTitle} fixed description={S.exp.htmlLead}>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Code2 />}
            variant="primary"
            onClick={() => setHtmlOpen(true)}
            disabled={exporting}
          >
            {S.exp.htmlButton}
          </Button>
          <Button
            icon={<ExternalLink />}
            onClick={() => void openInteractivePreview()}
            disabled={exporting}
          >
            {S.exp.htmlTry}
          </Button>
        </div>
      </Section>
      <p className="m-0 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
        {S.exp.resume}
      </p>
      <HtmlDialog open={htmlOpen} onOpenChange={setHtmlOpen} />
    </div>
  );
}
