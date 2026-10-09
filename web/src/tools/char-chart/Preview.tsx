/**
 * 預覽欄：圖表切換（四象限／關係圖）→ Stage 裡的畫布（與下載同一段繪圖程式）＋操作層 →
 * 四象限的換頁列 → 操作說明 → 匯出列（下載 PNG、大小）。
 */
import {
  ChartNetwork,
  ChartScatter,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { downloadBlob, safeFileName } from '@/core/files';
import { Button, IconButton, Notice, Segmented, Stage, useConfirm, useToast } from '@/ui';
import { loadBitmaps, useImageBitmaps } from './images';
import {
  type ChartKind,
  type ChartState,
  imageIds,
  LIMITS,
  mapMembers,
  QUAD,
  relationLayout,
} from './model';
import { QuadLayer } from './QuadLayer';
import { RelationLayer } from './RelationLayer';
import {
  type Bitmaps,
  drawQuadrant,
  drawRelation,
  ensureChartFonts,
  quadrantText,
  relationSize,
  relationText,
  renderQuadrantPng,
  renderRelationPng,
} from './render';
import {
  activeLegendOf,
  addPage,
  canAddPage,
  chartNow,
  currentPageIndex,
  deletePage,
  type ExportScale,
  goPage,
  pageIndexOf,
  setChart,
  useChart,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

export function PreviewArea() {
  const chart = usePrefs((s) => s.data.chart);
  const d = useChart((s) => s.data);
  const { bitmaps, missing } = useImageBitmaps(imageIds(d));
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Segmented<ChartKind>
        aria-label={S.chart}
        value={chart}
        onValueChange={setChart}
        fullWidth
        options={[
          {
            value: 'quadrant',
            label: S.charts.quadrant,
            ariaLabel: S.chartAria.quadrant,
            icon: <ChartScatter />,
          },
          {
            value: 'relation',
            label: S.charts.relation,
            ariaLabel: S.chartAria.relation,
            icon: <ChartNetwork />,
          },
        ]}
      />
      {chart === 'quadrant' ? (
        <QuadrantPreview d={d} bitmaps={bitmaps} />
      ) : (
        <RelationPreview d={d} bitmaps={bitmaps} />
      )}
      {missing.length ? <Notice tone="warning">{S.imagesMissing}</Notice> : null}
      <ExportBar chart={chart} d={d} />
    </div>
  );
}

/** 字型載好之後重畫（中文字型只下載用到的字） */
function useFontTick({ bold, regular }: { bold: string; regular: string }): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void ensureChartFonts({ bold, regular }).then(() => {
      if (alive) setTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [bold, regular]);
  return tick;
}

function QuadrantPreview({ d, bitmaps }: { d: ChartState; bitmaps: Bitmaps }) {
  const pageIndex = pageIndexOf(
    d,
    usePrefs((s) => s.data.page),
  );
  const page = d.pages[pageIndex];
  const canvas = useRef<HTMLCanvasElement>(null);
  const fontTick = useFontTick(quadrantText(d.characters, page));
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載好後重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawQuadrant(ctx, d.characters, page, bitmaps);
  }, [d.characters, page, bitmaps, fontTick]);
  const placed = d.characters.filter((c) => page.positions[c.id]).length;
  return (
    <>
      <Stage
        width={QUAD.size}
        height={QUAD.size}
        backgrounds={[]}
        aria-label={S.previewLabel('quadrant')}
      >
        <canvas
          ref={canvas}
          width={QUAD.size}
          height={QUAD.size}
          className="block size-full"
          data-testid="quad-canvas"
          data-size={`${QUAD.size}x${QUAD.size}`}
          data-page={pageIndex}
        />
        <QuadLayer page={page} characters={d.characters} />
      </Stage>
      <PageBar index={pageIndex} count={d.pages.length} />
      <p className="m-0 text-xs text-muted" data-testid="preview-hint">
        {d.characters.length && placed ? S.hintQuadrant : S.hintQuadrantEmpty}
      </p>
    </>
  );
}

function PageBar({ index, count }: { index: number; count: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const onAdd = () => {
    if (addPage()) toast({ title: S.pageAdded, tone: 'success', replace: true });
    else toast({ title: S.pageLimit(LIMITS.pages), tone: 'warning', replace: true });
  };
  const onDelete = async () => {
    if (count <= 1) {
      toast({ title: S.lastPage, tone: 'warning', replace: true });
      return;
    }
    const ok = await confirm({
      title: S.deletePageTitle,
      description: S.deletePageDesc,
      confirmLabel: S.deletePageConfirm,
      danger: true,
    });
    if (ok && deletePage(currentPageIndex()))
      toast({ title: S.pageDeleted, tone: 'success', replace: true });
  };
  return (
    <nav
      aria-label={S.pageBar}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5"
      data-testid="page-bar"
    >
      <IconButton
        label={S.prevPage}
        icon={<ChevronLeft />}
        variant="ghost"
        disabled={index <= 0}
        onClick={() => goPage(index - 1)}
      />
      <span
        className="min-w-24 text-center text-sm font-semibold tabular-nums"
        data-testid="page-indicator"
        aria-live="polite"
      >
        {S.pageOf(index + 1, count)}
      </span>
      <IconButton
        label={S.nextPage}
        icon={<ChevronRight />}
        variant="ghost"
        disabled={index >= count - 1}
        onClick={() => goPage(index + 1)}
      />
      <span className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" icon={<Plus />} onClick={onAdd} disabled={!canAddPage()}>
          {S.addPage}
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => void onDelete()}>
          {S.deletePage}
        </Button>
      </span>
    </nav>
  );
}

function RelationPreview({ d, bitmaps }: { d: ChartState; bitmaps: Bitmaps }) {
  const members = mapMembers(d.characters);
  const layout = relationLayout(members.map((c) => c.id));
  const size = relationSize(d);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fontTick = useFontTick(relationText(d));
  const linkFrom = useUi((s) => s.linkFrom);
  const legendId = usePrefs((s) => s.data.legend);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載好後重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawRelation(ctx, d, bitmaps);
  }, [d, bitmaps, size.width, size.height, fontTick]);
  const from = members.find((c) => c.id === linkFrom);
  const legend = activeLegendOf(d.relation.legends, legendId);
  return (
    <>
      <Stage
        width={size.width}
        height={size.height}
        backgrounds={[]}
        aria-label={S.previewLabel('relation')}
      >
        <canvas
          ref={canvas}
          width={size.width}
          height={size.height}
          className="block size-full"
          data-testid="rel-canvas"
          data-size={`${size.width}x${size.height}`}
        />
        <RelationLayer layout={layout} members={members} title={d.relation.title} />
      </Stage>
      <p className="m-0 text-xs text-muted" data-testid="preview-hint">
        {!members.length
          ? S.hintRelationEmpty
          : from
            ? S.hintRelationFrom(from.name || S.noName)
            : S.hintRelation(legend?.label || S.noLabel)}
      </p>
    </>
  );
}

function ExportBar({ chart, d }: { chart: ChartKind; d: ChartState }) {
  const toast = useToast();
  const scale = usePrefs((s) => s.data.scale);
  const [busy, setBusy] = useState(false);
  const pageIndex = pageIndexOf(
    d,
    usePrefs((s) => s.data.page),
  );
  const base = chart === 'quadrant' ? { width: QUAD.size, height: QUAD.size } : relationSize(d);
  const width = Math.floor(base.width * scale);
  const height = Math.floor(base.height * scale);
  const download = async () => {
    setBusy(true);
    try {
      const now = chartNow();
      const bitmaps = await loadBitmaps(imageIds(now));
      const s = usePrefs.getState().data.scale;
      let blob: Blob;
      let title: string;
      if (chart === 'quadrant') {
        const page = now.pages[currentPageIndex()];
        blob = await renderQuadrantPng(now.characters, page, bitmaps, s);
        title = page.title.trim() || S.fileQuadrant;
      } else {
        blob = await renderRelationPng(now, bitmaps, s);
        title = now.relation.title.trim() || S.fileRelation;
      }
      const name = `${safeFileName(title, { fallback: chart === 'quadrant' ? S.fileQuadrant : S.fileRelation })}.png`;
      downloadBlob(blob, name);
      toast({ title: S.downloadDone(name), tone: 'success' });
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
      data-page={chart === 'quadrant' ? pageIndex : undefined}
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
