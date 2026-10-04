/**
 * 匯出（規格 1.9、3.6）：共用匯出區（APNG、GIF、WebP 動圖，PNG 目前畫面；FPS、尺寸、循環、減色、預估、進度與取消、結果卡）
 * 與 3D 模型（GLB）。動圖用共用的 exportAnimation：每一格由 3D 引擎轉到該格的角度後擷取。
 */
import { Box } from 'lucide-react';
import { useMemo, useState } from 'react';
import { downloadBlob, formatBytes } from '@/core/files';
import { type AnimationSource, exportAnimation } from '@/core/timeline';
import {
  animationFormats,
  Button,
  type ExportContext,
  type ExportFormatOption,
  type ExportOutput,
  ExportPanel,
  type ExportSettings,
  Section,
  useWebpSupport,
} from '@/ui';
import { getEngine, notify } from './actions';
import { CANVAS_SIZE, type ExportFormatId, FPS_CHOICES, type Kind, SCALE_CHOICES } from './model';
import { exportPlan } from './plan';
import { edit, settingsNow, useSession, useSettings } from './store';
import { S } from './strings';

/** 處理量上限（寬 × 高 × 影格數） */
export const PIXEL_BUDGET = 220_000_000;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export function ExportArea({ kind }: { kind: Kind }) {
  const s = useSettings((st) => st.data);
  const { error, exporting, seed } = useSession();
  const webpSupported = useWebpSupport();
  const [glbBusy, setGlbBusy] = useState(false);
  const ex = s.export;
  const plan = exportPlan(kind, s.spin, ex.fps);
  const size = Math.round(CANVAS_SIZE * ex.scale);

  const formats = useMemo<ExportFormatOption[]>(
    () =>
      animationFormats(['apng', 'gif', 'webp', 'png'], { webpSupported }).map((f) =>
        f.id === 'png' ? { ...f, label: S.exp.formats.png, description: S.exp.pngHint } : f,
      ),
    [webpSupported],
  );
  /* 設定改了就清掉上次的結果 */
  const signature = useMemo(() => JSON.stringify([kind, s, seed]), [kind, s, seed]);

  const run = async (
    set: ExportSettings,
    { signal, onProgress }: ExportContext,
  ): Promise<ExportOutput> => {
    const engine = getEngine();
    const issue = useSession.getState().error;
    if (!engine?.build) throw new Error(issue ? S.err[issue] : S.exp.noBuild);
    const now = settingsNow();
    const format = set.format as ExportFormatId;
    const p = exportPlan(engine.build.kind, now.spin, set.fps);
    const still = format === 'png';
    const source: AnimationSource = {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      duration: still ? 0 : p.duration,
      loop: true,
      stillTime: 0,
      render: (ctx, t) => {
        const c = ctx as CanvasRenderingContext2D;
        if (still) engine.captureCurrent(c, c.canvas.width, c.canvas.height);
        else engine.captureFrame(p, Math.round(t * p.fps), c, c.canvas.width, c.canvas.height);
      },
    };
    useSession.setState({ exporting: true });
    engine.beginCapture();
    try {
      const r = await exportAnimation(source, {
        format,
        fps: set.fps,
        plays: set.plays,
        scale: set.scale,
        quantize: set.quantize,
        background: now.background.transparent ? null : now.background.color,
        fileName: still ? S.exp.stillBase : S.exp.fileBase,
        signal,
        onProgress: (ratio, label) => {
          const m = /^產生影格 (\d+)／(\d+)/.exec(label);
          onProgress(ratio, m ? S.exp.progress(Number(m[1]), Number(m[2])) : label);
        },
      });
      notify({ title: S.exp.exported(r.fileName), tone: 'success' });
      return {
        blob: r.blob,
        fileName: r.fileName,
        width: r.width,
        height: r.height,
        frames: r.frames,
        storedFrames: r.storedFrames,
        duration: r.duration,
        details: still
          ? undefined
          : [
              { label: S.exp.details.kind, value: S.exp.kinds[p.kind] },
              {
                label: S.exp.details.frames,
                value: `${p.frames} 格・${set.fps} FPS・每格 ${Math.round(1000 / set.fps)} ms`,
              },
            ],
      };
    } catch (e) {
      if (isAbort(e) || signal.aborted) notify({ title: S.exp.cancelled, tone: 'warning' });
      throw e;
    } finally {
      engine.endCapture();
      useSession.setState({ exporting: false });
    }
  };

  const glb = async () => {
    const engine = getEngine();
    if (!engine?.build) {
      notify({ title: error ? S.err[error] : S.exp.noBuild, tone: 'danger' });
      return;
    }
    setGlbBusy(true);
    try {
      const bytes = await engine.glb();
      if (!bytes) throw new Error(S.exp.noBuild);
      const name = `${S.exp.stillBase}.glb`;
      downloadBlob(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'model/gltf-binary' }),
        name,
      );
      notify({ title: S.exp.glbDone(name, formatBytes(bytes.byteLength)), tone: 'success' });
    } catch (e) {
      notify({
        title: S.exp.glbFailed(e instanceof Error ? e.message : String(e)),
        tone: 'danger',
      });
    } finally {
      setGlbBusy(false);
    }
  };

  const still = ex.format === 'png';
  return (
    <div className="flex flex-col gap-3">
      <ExportPanel
        title={S.exp.title}
        formats={formats}
        settings={{
          format: ex.format,
          fps: ex.fps,
          plays: ex.plays,
          scale: ex.scale,
          quantize: ex.quantize,
        }}
        onSettingsChange={(next) =>
          edit((d) => {
            d.export.format = next.format as ExportFormatId;
            d.export.fps = next.fps;
            d.export.plays = next.plays;
            d.export.scale = next.scale;
            d.export.quantize = next.quantize;
          })
        }
        baseSize={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
        fpsOptions={FPS_CHOICES}
        scaleOptions={SCALE_CHOICES}
        estimate={
          still ? null : { width: size, height: size, frames: plan.frames, duration: plan.duration }
        }
        pixelBudget={{ max: PIXEL_BUDGET, message: S.exp.budget }}
        resetKey={signature}
        extra={
          <div className="flex flex-col gap-1 text-xs text-muted" data-testid="export-plan">
            {still ? null : (
              <p className="m-0">
                {plan.kind === 'spin' ? S.exp.lead.spin(plan.cycle.toFixed(2)) : S.exp.lead.shake}
              </p>
            )}
            <p className="m-0">{S.exp.camera}</p>
          </div>
        }
        onExport={run}
      />
      <Section title={S.exp.glbTitle} fixed description={S.exp.glbLead}>
        <Button
          icon={<Box />}
          onClick={() => void glb()}
          loading={glbBusy}
          disabled={exporting || glbBusy || !!error}
          className="self-start"
        >
          {S.exp.glbButton}
        </Button>
      </Section>
    </div>
  );
}
