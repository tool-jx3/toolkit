/**
 * SF 證件的預覽與匯出（規格 1.11～1.16）：
 * - 一張畫布（預覽＝匯出的畫法；掛繩孔與掛繩照「掛繩」的選擇）；可以點的字、照片、條碼、執照的格子、DNA 條；
 * - 裝飾圖：在預覽上拖曳移動、拉右下角縮放（共用的 LayoutEditor；選取的那張在最上面，其他的在字的下面）；
 * - 匯出 1 倍／2 倍的 PNG（卡片外形以外透明）。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAssetBitmaps, useAssetImage } from '@/core/assets';
import type { Box } from '@/core/layout';
import {
  ExportPanel,
  type ExportSettings,
  Field,
  LayoutEditor,
  type LayoutItem,
  Notice,
  Segmented,
  Stage,
} from '@/ui';
import { exportSf } from './exporter';
import { requestFonts, useFontTick } from './fonts';
import { fontUses, type Region } from './kit';
import { SF_CARD_TOP } from './lanyard';
import { RegionLayer, Strap } from './Preview';
import { afterPaint } from './schedule';
import { sfBlank } from './sf/defs';
import { elementRect } from './sf/draw';
import { spotFraction } from './sf/media';
import { sfAssetIds } from './sf/model';
import {
  renderSf,
  SF_PREVIEW_SCALE,
  SF_SCALES,
  sfCodeBox,
  sfCodeDensity,
  sfPhotoSource,
  sfPixels,
  sfSize,
  sfStrapExtent,
} from './sf/render';
import {
  assets,
  currentElements,
  docNow,
  gesture,
  patchElement,
  removeElement,
  setPrefs,
  useDoc,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

/** 「只在預覽」的掛繩：同證件的掛繩，依孔的寬度放大（孔寬 260 ÷ 71.5） */
const SF_STRAP_U = 260 / 71.5;
const DOM_STRAP_H = 110;

export function SfPreview() {
  const s = useDoc((st) => st.data);
  const sf = s.sf;
  const prefs = usePrefs((p) => p.data);
  const photo = useAssetImage(assets, sf.photo?.image.id);
  const others = useAssetBitmaps(
    assets,
    sfAssetIds(sf).filter((id) => id !== sf.photo?.image.id),
  );
  const tick = useFontTick();
  const ref = useRef<HTMLCanvasElement>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const def = sfBlank(sf.blank);
  const lanyard = prefs.lanyard;
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  const version = useMemo(
    () => ({ sf, bitmap: photo.bitmap, bitmaps: others.bitmaps, lanyard }),
    [sf, photo.bitmap, others.bitmaps, lanyard, tick],
  );
  const drawn = useRef<object | null>(null);
  const paint = useCallback(() => {
    const canvas = ref.current;
    if (!canvas || drawn.current === version) return;
    drawn.current = version;
    const fonts = new Map<string, Set<string>>();
    const r = renderSf(
      version.sf,
      SF_PREVIEW_SCALE,
      {
        preview: true,
        photo: sfPhotoSource(version.sf.photo, version.bitmap),
        image: (id) => version.bitmaps.get(id) ?? null,
        fonts,
        lanyard: version.lanyard,
      },
      canvas,
    );
    requestFonts(fontUses(fonts));
    setRegions((prev) => (sameRegions(prev, r.regions) ? prev : r.regions));
    const spot = spotFraction(r.logoSpot);
    const ui = useUi.getState();
    if (JSON.stringify(ui.spot) !== JSON.stringify(spot)) useUi.setState({ spot });
    const code = sfCodeBox(r.regions);
    if (JSON.stringify(ui.sfCode) !== JSON.stringify(code)) useUi.setState({ sfCode: code });
  }, [version]);
  const latest = useRef(paint);
  latest.current = paint;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換範本、掛繩時馬上畫（畫法在 latest 裡）
  useLayoutEffect(() => {
    latest.current();
  }, [sf.blank, lanyard]);
  useEffect(() => afterPaint(paint), [paint]);

  const size = sfSize(sf, lanyard);
  const top = sfStrapExtent(lanyard);
  /* 「只在預覽」的掛繩（DOM）：卡片往下挪，掛繩停在卡片外形的上緣 */
  const domStrap = lanyard === 'preview';
  const cardTop = SF_CARD_TOP[sf.blank];
  const domOff = domStrap ? Math.max(0, Math.round(DOM_STRAP_H * SF_STRAP_U) - cardTop) : 0;
  const stageH = size.h + domOff;
  return (
    <>
      <Stage width={size.w} height={stageH} aria-label={S.previewSf} className="shrink-0">
        {domStrap ? (
          <Strap
            color={sf.style.accent}
            width={size.w}
            u={SF_STRAP_U}
            top={domOff + cardTop - DOM_STRAP_H * SF_STRAP_U}
          />
        ) : null}
        <div
          className="absolute left-0"
          style={{ top: domOff, width: size.w, height: size.h }}
          onPointerDown={(e) => {
            if (!(e.target as HTMLElement).closest('[data-layout-item]'))
              useUi.setState({ element: null });
          }}
        >
          <canvas
            ref={ref}
            className="block size-full"
            data-testid="sf-canvas"
            data-template={sf.blank}
          />
          <ElementLayer W={def.w} H={def.h} oy={top} below />
          <RegionLayer regions={regions} ox={0} oy={top} hasPhoto={!!sf.photo} />
          <ElementLayer W={def.w} H={def.h} oy={top} />
        </div>
      </Stage>
      <p className="m-0 px-1 text-xs text-muted">{S.previewHint}</p>
      {photo.status === 'missing' || others.missing.length ? (
        <Notice tone="warning">{S.photoMissing}</Notice>
      ) : null}
      <SfExport />
    </>
  );
}

const sameRegions = (a: readonly Region[], b: readonly Region[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.kind === b[i].kind &&
      r.key === b[i].key &&
      Math.round(r.x) === Math.round(b[i].x) &&
      Math.round(r.y) === Math.round(b[i].y) &&
      Math.round(r.w) === Math.round(b[i].w) &&
      Math.round(r.h) === Math.round(b[i].h),
  );

/**
 * 裝飾圖的操作層：below＝沒選取的（在字的下面，點得到沒被字蓋住的地方）；沒有 below＝選取的那張（在最上面，
 * 被照片或字蓋住也拖得到）。
 */
function ElementLayer({ W, H, oy, below }: { W: number; H: number; oy: number; below?: boolean }) {
  const doc = useDoc((s) => s.data);
  const sel = useUi((s) => s.element);
  const list = currentElements(doc);
  const start = useRef<{ x: number; y: number; w: number; h: number; size: number } | null>(null);
  const items: LayoutItem[] = list
    .filter((e) => (below ? e.id !== sel : e.id === sel))
    .map((e) => {
      const r = elementRect(e, W, H);
      return {
        id: e.id,
        label: e.image.name || S.sectionElements,
        box: { x: r.x, y: r.y + oy, width: r.w, height: r.h },
        resizable: !below,
      };
    });
  if (!items.length) return null;
  const onChange = (id: string, box: Box, ch: { phase: string; op: 'move' | 'resize' }) => {
    const el = currentElements().find((e) => e.id === id);
    if (!el) return;
    if (ch.phase === 'start') {
      gesture.begin();
      const r = elementRect(el, W, H);
      start.current = { x: r.x, y: r.y, w: r.w, h: r.h, size: el.size };
      return;
    }
    const st = start.current ?? { ...elementRect(el, W, H), size: el.size };
    if (ch.op === 'resize') {
      const f = Math.max(box.width / st.w, box.height / st.h);
      const w = st.w * f;
      const h = st.h * f;
      patchElement(id, {
        size: st.size * f,
        x: (st.x + w / 2) / W,
        y: (st.y + h / 2) / H,
      });
    } else
      patchElement(id, {
        x: (box.x + box.width / 2) / W,
        y: (box.y - oy + box.height / 2) / H,
      });
    if (ch.phase === 'end' || ch.phase === 'nudge') {
      start.current = null;
      gesture.commit();
    }
  };
  return (
    <LayoutEditor
      width={W}
      height={H + oy}
      items={items}
      selectedId={sel}
      onSelect={(id) => useUi.setState({ element: id })}
      onChange={onChange}
      onDelete={below ? undefined : removeElement}
      onEscape={() => useUi.setState({ element: null })}
      keyboard={!below}
      guides={!below}
      nudgeStep={2}
      aria-label={S.elementsLayer}
    />
  );
}

function SfExport() {
  const s = useDoc((st) => st.data);
  const prefs = usePrefs((p) => p.data);
  const settings: ExportSettings = { format: 'png', fps: 20, plays: 0, scale: 1, quantize: false };
  const resetKey = useMemo(
    () => ({ sf: s.sf, k: prefs.sfScale, l: prefs.lanyard }),
    [s.sf, prefs.sfScale, prefs.lanyard],
  );
  const formats = useMemo(
    () => [{ id: 'png', label: S.formats.png, description: S.formatDescSf }],
    [],
  );
  const out = sfPixels(s.sf, prefs.sfScale, prefs.lanyard);
  const codeBox = useUi((u) => u.sfCode);
  const dense = sfCodeDensity(s.sf, codeBox, prefs.sfScale);
  return (
    <ExportPanel
      title={S.exportTitle}
      formats={formats}
      settings={settings}
      resetKey={resetKey}
      extra={
        <div className="flex min-w-0 flex-col gap-3">
          <Field
            label={S.sfScale}
            hint={<span data-testid="export-dims">{S.outputSize(out.width, out.height)}</span>}
          >
            <Segmented<string>
              value={String(prefs.sfScale)}
              onValueChange={(v) => setPrefs({ sfScale: Number(v) })}
              options={SF_SCALES.map((k) => {
                const p = sfPixels(s.sf, k, prefs.lanyard);
                return { value: String(k), label: S.sfScales(k, p.width, p.height) };
              })}
              fullWidth
            />
          </Field>
          {dense?.dense ? (
            <div data-testid="sf-code-dense">
              <Notice tone="warning">
                {S.sfCodeDense(dense.kind, dense.module, prefs.sfScale)}
              </Notice>
            </div>
          ) : null}
        </div>
      }
      onExport={(_set, ctx) =>
        exportSf(docNow(), { scale: prefs.sfScale, lanyard: prefs.lanyard }, ctx)
      }
    />
  );
}
