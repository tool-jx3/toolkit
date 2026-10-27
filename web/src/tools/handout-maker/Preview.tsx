/**
 * 預覽區（規格 F24～F28）：舞台上的畫布（以 2 倍像素畫，和匯出 2 倍的同一段程式）、內容超出畫面與圖片找不到的提醒、
 * 共用的匯出區（PNG、倍率、這一張／清單裡全部）與「複製圖片」。
 */
import { ClipboardCopy } from 'lucide-react';
import { type Ref, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAssetImage } from '@/core/assets';
import { copyImage } from '@/core/files';
import {
  Button,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Notice,
  Segmented,
  Stage,
  useToast,
} from '@/ui';
import { exportAll, exportOne, renderPng } from './exporter';
import { useEnsureFonts, useFontTick } from './fonts';
import { type ExportScale, SCALES } from './model';
import { type Ctx, fontNeeds, paintHandout } from './render';
import type { ImageCache } from './render/images';
import {
  activeNow,
  assets,
  docNow,
  type ExportTarget,
  setPrefs,
  useActive,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';

/** 預覽畫布的倍率（＝匯出 2 倍） */
export const PREVIEW_SCALE = 2;

const TARGETS: readonly ExportTarget[] = ['one', 'all'];

export function Preview({ exportRef }: { exportRef: Ref<ExportPanelHandle> }) {
  const h = useActive();
  const count = useDoc((s) => s.data.items.length);
  const prefs = usePrefs((p) => p.data);
  const toast = useToast();
  const img = useAssetImage(assets, h.image?.id);
  const bg = useAssetImage(assets, h.bg.image?.id);
  const needs = useMemo(() => fontNeeds(h), [h]);
  useEnsureFonts(needs);
  const tick = useFontTick();
  const cache = useRef<ImageCache>(new Map());
  const canvas = useRef<HTMLCanvasElement>(null);
  const [overflow, setOverflow] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 是字型載好後重畫
  useLayoutEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d') as Ctx | null | undefined;
    if (!c || !ctx) return;
    const r = paintHandout(ctx, h, {
      scale: PREVIEW_SCALE,
      image: img.bitmap,
      bgImage: bg.bitmap,
      cache: cache.current,
    });
    setOverflow(r.overflow);
  }, [h, img.bitmap, bg.bitmap, tick]);

  const copy = async () => {
    const cur = activeNow();
    const r = await copyImage(renderPng(cur, prefs.scale).then((x) => x.blob));
    toast(r.ok ? { title: S.copied, tone: 'success' } : { title: S.copyFailed, tone: 'warning' });
  };

  const settings: ExportSettings = {
    format: 'png',
    fps: 10,
    plays: 0,
    scale: prefs.scale,
    quantize: false,
  };
  const formats = useMemo(
    () => [{ id: 'png', label: S.formatPng, description: S.formatPngDesc }],
    [],
  );
  const items = useDoc((s) => s.data.items);
  const resetKey = useMemo(
    () => ({ v: prefs.target === 'all' ? items : h, target: prefs.target }),
    [prefs.target, items, h],
  );
  const missing = img.status === 'missing' || bg.status === 'missing';

  return (
    <>
      <Stage width={h.width} height={h.height} aria-label={S.previewLabel} className="shrink-0">
        <canvas
          ref={canvas}
          width={Math.round(h.width * PREVIEW_SCALE)}
          height={Math.round(h.height * PREVIEW_SCALE)}
          className="block size-full"
          role="img"
          aria-label={S.previewLabel}
          data-testid="handout-canvas"
          data-theme={h.theme}
          data-size={`${h.width}x${h.height}`}
          data-overflow={overflow ? 'true' : 'false'}
        />
      </Stage>
      {overflow ? (
        <Notice tone="warning">
          <span data-testid="overflow-notice">{S.overflow}</span>
        </Notice>
      ) : null}
      {missing ? <Notice tone="warning">{S.imageMissing}</Notice> : null}
      <ExportPanel
        ref={exportRef}
        title={S.exportTitle}
        formats={formats}
        baseSize={{ width: h.width, height: h.height }}
        scaleOptions={[...SCALES]}
        settings={settings}
        onSettingsChange={(n) =>
          setPrefs({
            scale: (SCALES as readonly number[]).includes(n.scale) ? (n.scale as ExportScale) : 2,
          })
        }
        resetKey={resetKey}
        extra={
          <div className="flex min-w-0 flex-col gap-3">
            <Field label={S.target} hint={prefs.target === 'all' ? S.allHint(count) : undefined}>
              <Segmented<ExportTarget>
                value={prefs.target}
                onValueChange={(v) => setPrefs({ target: v })}
                options={TARGETS.map((t) => ({
                  value: t,
                  label: S.targets[t],
                  ariaLabel: S.targetAria[t],
                }))}
                fullWidth
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                icon={<ClipboardCopy />}
                title={S.copyHint}
                data-testid="copy-image"
                onClick={() => void copy()}
              >
                {S.copyImage}
              </Button>
              <span className="text-xs text-muted">{S.copyHint}</span>
            </div>
          </div>
        }
        onExport={(st, ctx) =>
          prefs.target === 'all'
            ? exportAll(docNow().items, st.scale, ctx)
            : exportOne(activeNow(), st.scale)
        }
      />
    </>
  );
}
