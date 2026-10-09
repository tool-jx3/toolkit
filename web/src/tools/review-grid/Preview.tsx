/**
 * 預覽欄：匯出列（下載 PNG、大小）→ Stage 裡的畫布（與下載同一份版面）＋點選區（LayoutCanvas）→ 說明。
 * 也負責把圖片拖到預覽上的某一格（整個視窗的拖放）與 Ctrl＋V 貼上（滑鼠指著的格子，沒有時是選取的格子）。
 */
import { Download } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { drawScene, type HitRegion, hitRegionAt } from '@/core/scene';
import {
  Button,
  isEditableTarget,
  LayoutCanvas,
  Notice,
  Segmented,
  Stage,
  useToast,
  WindowDrop,
} from '@/ui';
import { loadBitmaps, useImageBitmaps } from './images';
import { cardFontUses, layoutCard } from './layout';
import { imageIds } from './model';
import { layoutEnv, loadCardFonts, outputScale, renderCardPng } from './render';
import { revealSection } from './reveal';
import {
  type ExportScale,
  reviewNow,
  select,
  selectedCellOf,
  type Target,
  usePrefs,
  useReview,
  useUi,
} from './store';
import { S } from './strings';
import { usePlaceImages } from './usePlaceImages';

const regionKey = (t: Target): string => (t.kind === 'profile' ? 'profile' : `cell:${t.id}`);
const targetOf = (key: string | null | undefined): Target | null =>
  key === 'profile'
    ? { kind: 'profile' }
    : key?.startsWith('cell:')
      ? { kind: 'cell', id: key.slice(5) }
      : null;

export function PreviewArea() {
  const d = useReview((s) => s.data);
  const selectedId = useUi((s) => s.selectedId);
  const { bitmaps, missing } = useImageBitmaps(imageIds(d));
  const { place } = usePlaceImages();

  /* 字型：用到的字載入後重新排版（字寬會變） */
  const fontsKey = useMemo(() => JSON.stringify(cardFontUses(d)), [d]);
  const [fontTick, setFontTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontsKey 代表用到的字
  useEffect(() => {
    let alive = true;
    void loadCardFonts(reviewNow()).then((changed) => {
      if (changed && alive) setFontTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [fontsKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 在字型載好後重新排版
  const layout = useMemo(() => layoutCard(d, layoutEnv(bitmaps)), [d, bitmaps, fontTick]);

  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (c.width !== layout.width) c.width = layout.width;
    if (c.height !== layout.height) c.height = layout.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    drawScene(ctx, layout.nodes);
  }, [layout]);

  const regions = useMemo<HitRegion[]>(() => {
    const out: HitRegion[] = [];
    if (layout.profile) out.push({ key: 'profile', label: S.regionProfile, box: layout.profile });
    layout.cells.forEach((c, i) => {
      const cell = d.cells.find((x) => x.id === c.id);
      out.push({
        key: `cell:${c.id}`,
        label: S.regionCell(i + 1, cell?.title.trim() ?? ''),
        box: c.box,
        radius: d.view === 'list' ? 24 : undefined,
      });
    });
    return out;
  }, [layout, d.cells, d.view]);

  const selected = selectedCellOf(d, selectedId);

  /* 拖放與貼上：畫面座標 → 預覽上的目標 */
  const targetAt = (clientX: number, clientY: number): Target | null => {
    const c = canvas.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = ((clientX - r.left) / r.width) * layout.width;
    const y = ((clientY - r.top) / r.height) * layout.height;
    return targetOf(hitRegionAt(regions, x, y)?.key);
  };

  const live = useRef({ place, selected });
  live.current = { place, selected };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      /* 在文字欄裡貼上文字時照常貼上 */
      if (isEditableTarget(e.target) && dt.types.includes('text/plain')) return;
      e.preventDefault();
      const hover = useUi.getState().hover;
      const target: Target = hover ?? { kind: 'cell', id: live.current.selected.id };
      void live.current.place(files, target);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ExportBar width={layout.width} height={layout.height} />
      <div
        className="[--stage-max-h:75dvh] lg:[--stage-max-h:none]"
        onPointerOver={(e) => {
          const key = (e.target as Element).closest?.('[data-region]')?.getAttribute('data-region');
          const t = targetOf(key);
          const cur = useUi.getState().hover;
          if ((t ? regionKey(t) : null) !== (cur ? regionKey(cur) : null))
            useUi.setState({ hover: t });
        }}
        onPointerLeave={() => useUi.setState({ hover: null })}
      >
        <Stage
          width={layout.width}
          height={layout.height}
          backgrounds={[]}
          aria-label={S.previewLabel}
        >
          <canvas
            ref={canvas}
            width={layout.width}
            height={layout.height}
            className="block size-full"
            data-testid="card-canvas"
            data-size={`${layout.width}x${layout.height}`}
          />
          <LayoutCanvas
            width={layout.width}
            height={layout.height}
            regions={regions}
            activeKey={`cell:${selected.id}`}
            aria-label={S.previewLabel}
            onPick={(key) => {
              const t = targetOf(key);
              if (t?.kind === 'cell') {
                select(t.id);
                revealSection('rg-cell-editor');
              } else if (t?.kind === 'profile') revealSection('rg-profile');
            }}
          />
        </Stage>
      </div>
      {missing.length ? <Notice tone="warning">{S.imagesMissing}</Notice> : null}
      <p className="m-0 text-xs text-muted" data-testid="preview-hint">
        {S.hint}
      </p>
      {/* 不先濾掉不是圖片的檔：同一批的結果合成一則通知（規格 F14） */}
      <WindowDrop
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files, at) => void place(files, targetAt(at.clientX, at.clientY))}
      />
    </div>
  );
}

function ExportBar({ width: baseW, height: baseH }: { width: number; height: number }) {
  const toast = useToast();
  const scale = usePrefs((s) => s.data.scale);
  const [busy, setBusy] = useState(false);
  /* 輸出大小：版面 × 倍率（太大時自動降低，見 outputScale） */
  const s = outputScale(baseW, baseH, scale);
  const width = Math.max(1, Math.round(baseW * s));
  const height = Math.max(1, Math.round(baseH * s));
  const download = async () => {
    setBusy(true);
    try {
      const now = reviewNow();
      const images = await loadBitmaps(imageIds(now));
      const want = usePrefs.getState().data.scale;
      const r = await renderCardPng(now, images, want);
      const name = `${now.view === 'grid' ? S.fileGrid : S.fileList}.png`;
      downloadBlob(r.blob, name);
      toast({ title: S.downloadDone(name), tone: 'success' });
      if (r.scale < want - 1e-6)
        toast({ title: S.scaleReduced(r.scale.toFixed(2)), tone: 'warning' });
    } catch {
      toast({ title: S.downloadFailed, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label={S.exportTitle}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      data-testid="export-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          onClick={() => void download()}
          loading={busy}
          disabled={busy}
        >
          {S.downloadPng}
        </Button>
        <Segmented<'1' | '2'>
          aria-label={S.scale}
          size="sm"
          value={String(scale) as '1' | '2'}
          onValueChange={(v) => usePrefs.getState().patch({ scale: Number(v) as ExportScale })}
          options={[
            { value: '1', label: '1×', ariaLabel: S.scaleAria(1) },
            { value: '2', label: '2×', ariaLabel: S.scaleAria(2) },
          ]}
        />
        <span className="ml-auto text-sm tabular-nums text-muted" data-testid="export-size">
          {S.exportSize(width, height)}
        </span>
      </div>
      <p className="m-0 text-xs text-muted">{S.exportNote}</p>
    </section>
  );
}
