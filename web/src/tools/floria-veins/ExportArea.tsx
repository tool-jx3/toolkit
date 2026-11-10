/**
 * 匯出區（規格 F50～F52）：共用的匯出面板（PNG、倍率），範圍（這張／全部排成一張／全部各一張）、背景、複製圖片。
 */
import { ClipboardCopy } from 'lucide-react';
import { type Ref, useMemo } from 'react';
import { copyImage } from '@/core/files';
import {
  Button,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Segmented,
  useToast,
} from '@/ui';
import { exportEach, exportOne, exportSize, exportTiled, renderOne, renderTiled } from './exporter';
import {
  activeNow,
  docNow,
  EXPORT_SCALES,
  type ExportScale,
  type ExportTarget,
  prefsNow,
  useActive,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';

const TARGETS: readonly ExportTarget[] = ['one', 'tiled', 'each'];

export function ExportArea({ exportRef }: { exportRef?: Ref<ExportPanelHandle> }) {
  const prefs = usePrefs((p) => p.data);
  const active = useActive();
  const canvases = useDoc((s) => s.data.canvases);
  const toast = useToast();
  const size = exportSize(prefs.exportTarget, active, canvases);
  const set = (p: Partial<typeof prefs>) => usePrefs.getState().patch(p);
  const options = () => {
    const p = prefsNow();
    return { scale: p.exportScale, layers: p.layers, transparent: p.exportTransparent };
  };
  const hidden = Object.values(prefs.layers).some((v) => !v);

  const settings: ExportSettings = {
    format: 'png',
    fps: 10,
    plays: 0,
    scale: prefs.exportScale,
    quantize: false,
  };
  const formats = useMemo(
    () => [{ id: 'png', label: S.exporting.formatPng, description: S.exporting.formatPngDesc }],
    [],
  );
  const resetKey = useMemo(
    () => ({
      v: prefs.exportTarget === 'one' ? active : canvases,
      target: prefs.exportTarget,
      layers: prefs.layers,
      bg: prefs.exportTransparent,
    }),
    [prefs.exportTarget, prefs.layers, prefs.exportTransparent, active, canvases],
  );

  const copy = async () => {
    const o = options();
    const r = await copyImage(
      (prefsNow().exportTarget === 'one'
        ? renderOne(activeNow(), o)
        : renderTiled(docNow().canvases, o)
      ).then((x) => x.blob),
    );
    toast(
      r.ok
        ? { title: S.exporting.copied, tone: 'success' }
        : { title: S.exporting.copyFailed, tone: 'warning' },
    );
  };

  return (
    <ExportPanel
      ref={exportRef}
      title={S.exporting.title}
      formats={formats}
      baseSize={size}
      scaleOptions={EXPORT_SCALES}
      settings={settings}
      onSettingsChange={(n) =>
        set({
          exportScale: (EXPORT_SCALES as readonly number[]).includes(n.scale)
            ? (n.scale as ExportScale)
            : 1,
        })
      }
      resetKey={resetKey}
      extra={
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={S.exporting.target}>
            <Segmented<ExportTarget>
              value={prefs.exportTarget}
              onValueChange={(v) => set({ exportTarget: v })}
              options={TARGETS.map((t) => ({
                value: t,
                label: S.exporting.targets[t],
                ariaLabel: S.exporting.targetAria[t],
              }))}
              fullWidth
            />
          </Field>
          <Field label={S.exporting.background} hint={S.exporting.sizeHint}>
            <Segmented<'white' | 'transparent'>
              value={prefs.exportTransparent ? 'transparent' : 'white'}
              onValueChange={(v) => set({ exportTransparent: v === 'transparent' })}
              options={[
                { value: 'white', label: S.exporting.white },
                { value: 'transparent', label: S.exporting.transparent },
              ]}
            />
          </Field>
          {hidden ? <p className="m-0 text-xs text-warning">{S.exporting.layersNote}</p> : null}
          {prefs.exportTarget !== 'each' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                icon={<ClipboardCopy />}
                data-testid="copy-image"
                onClick={() => void copy()}
              >
                {S.exporting.copy}
              </Button>
              <span className="text-xs text-muted">{S.exporting.copyHint}</span>
            </div>
          ) : null}
        </div>
      }
      onExport={(st, ctx) => {
        const o = { ...options(), scale: st.scale };
        const t = prefsNow().exportTarget;
        if (t === 'each') return exportEach(docNow().canvases, o, ctx);
        if (t === 'tiled') return exportTiled(docNow().canvases, o);
        return exportOne(activeNow(), o);
      }}
    />
  );
}
