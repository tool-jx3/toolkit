/**
 * 預覽欄：上方的工具列（顯示答案、版面）、整張圖的預覽（與下載的 PNG 同一段繪圖程式）、匯出（題目／解答 × PNG、HTML、列印）。
 */
import { Code, Download, Eye, EyeOff, LayoutGrid, LayoutList, Printer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Segmented, Stage, Toggle, useToast } from '@/ui';
import type { Puzzle } from './generate';
import type { SheetLayout } from './model';
import { downloadHtml, downloadPng, printSheet, sheetLayout, sheetOptions } from './output';
import { effectiveScale, loadSheetFonts, PNG_SCALE, paintSheet, type SheetOptions } from './sheet';
import { dataNow, step, useCrossword, useView } from './store';
import { S, type Version } from './strings';

/** 預覽 canvas 的畫素上限（大盤面降低預覽的解析度） */
const PREVIEW_PIXELS = 8_000_000;

function SheetCanvas({ puzzle, options }: { puzzle: Puzzle; options: SheetOptions }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fontTick, setFontTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載好後重排（字寬會變）
  const layout = useMemo(() => sheetLayout(puzzle, options), [puzzle, options, fontTick]);

  /* 字型載好之後重排、重畫（中文字型只下載用到的字） */
  useEffect(() => {
    let alive = true;
    void loadSheetFonts(puzzle, options).then(() => {
      if (alive) setFontTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [puzzle, options]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const scale = Math.min(
      Math.max(1, dpr),
      Math.sqrt(PREVIEW_PIXELS / (layout.width * layout.height)),
    );
    canvas.width = Math.max(1, Math.round(layout.width * scale));
    canvas.height = Math.max(1, Math.round(layout.height * scale));
    const ctx = canvas.getContext('2d');
    if (ctx) paintSheet(ctx, layout, options.fonts, scale);
  }, [layout, options.fonts]);

  const exportScale = effectiveScale(layout, PNG_SCALE);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Stage
        width={layout.width}
        height={layout.height}
        backgrounds={[]}
        aria-label={S.preview.label}
      >
        <canvas
          ref={ref}
          role="img"
          aria-label={S.preview.label}
          className="block size-full"
          data-testid="sheet-canvas"
          data-width={layout.width}
          data-height={layout.height}
          data-board={[layout.board.x, layout.board.y, layout.board.w, layout.board.h].join(',')}
        />
      </Stage>
      <p className="m-0 text-xs text-muted tabular-nums" data-testid="sheet-size">
        {S.preview.size(
          Math.round(layout.width * exportScale),
          Math.round(layout.height * exportScale),
        )}
      </p>
    </div>
  );
}

function Toolbar() {
  const showAnswers = useView((s) => s.data.showAnswers);
  const layout = useCrossword((s) => s.data.layout);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="preview-toolbar">
      <Toggle
        checked={showAnswers}
        onCheckedChange={(v) => useView.getState().patch({ showAnswers: v })}
        label={S.preview.showAnswers}
      />
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted" id="cw-layout-label">
          {S.preview.layout}
        </span>
        <Segmented<SheetLayout>
          aria-labelledby="cw-layout-label"
          value={layout}
          onValueChange={(v) =>
            step((d) => {
              d.layout = v;
            })
          }
          size="sm"
          options={[
            {
              value: 'row',
              label: S.preview.layouts.row,
              icon: <LayoutGrid />,
              ariaLabel: S.preview.layoutTitles.row,
            },
            {
              value: 'col',
              label: S.preview.layouts.col,
              icon: <LayoutList />,
              ariaLabel: S.preview.layoutTitles.col,
            },
          ]}
        />
      </div>
    </div>
  );
}

type ExportKind = 'png' | 'html' | 'print';
/** 進行中的匯出（題目與解答兩列共用：一個在處理時所有匯出按鈕都暫停） */
type ExportBusy = { version: Version; kind: ExportKind } | null;

function ExportRow({
  version,
  disabled,
  busyAll,
  setBusyAll,
}: {
  version: Version;
  disabled: boolean;
  busyAll: ExportBusy;
  setBusyAll: (b: ExportBusy) => void;
}) {
  const toast = useToast();
  const busy = busyAll?.version === version ? busyAll.kind : null;
  const label = S.export.versions[version];
  const run = async (kind: ExportKind) => {
    if (busyAll) return;
    setBusyAll({ version, kind });
    try {
      if (kind === 'print') await printSheet(dataNow(), version);
      else {
        const name = await (kind === 'png' ? downloadPng : downloadHtml)(dataNow(), version);
        toast({ title: S.export.downloaded(name), tone: 'success' });
      }
    } catch (e) {
      toast({
        title: kind === 'print' ? S.export.printFailed : S.export.failed,
        description: e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    } finally {
      setBusyAll(null);
    }
  };
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0"
      aria-label={label}
      data-testid={`export-${version}`}
    >
      <span className="inline-flex w-12 shrink-0 items-center gap-1 text-sm font-semibold text-fg">
        {version === 'answer' ? (
          <Eye className="size-4 text-muted" aria-hidden />
        ) : (
          <EyeOff className="size-4 text-muted" aria-hidden />
        )}
        {label}
      </span>
      <Button
        size="sm"
        variant={version === 'question' ? 'primary' : 'secondary'}
        icon={<Download />}
        title={S.export.pngTitle(label)}
        aria-label={`${label}：${S.export.png}`}
        loading={busy === 'png'}
        disabled={disabled || !!busyAll}
        onClick={() => void run('png')}
      >
        {S.export.png}
      </Button>
      <Button
        size="sm"
        icon={<Code />}
        title={S.export.htmlTitle(label)}
        aria-label={`${label}：${S.export.html}`}
        loading={busy === 'html'}
        disabled={disabled || !!busyAll}
        onClick={() => void run('html')}
      >
        {S.export.html}
      </Button>
      <Button
        size="sm"
        icon={<Printer />}
        title={S.export.printTitle(label)}
        aria-label={`${label}：${S.export.print}`}
        loading={busy === 'print'}
        disabled={disabled || !!busyAll}
        onClick={() => void run('print')}
      >
        {S.export.print}
      </Button>
    </fieldset>
  );
}

export function Preview() {
  const puzzle = useCrossword((s) => s.data.puzzle);
  const layout = useCrossword((s) => s.data.layout);
  const title = useCrossword((s) => s.data.title);
  const emptyColor = useCrossword((s) => s.data.emptyColor);
  const emptyTransparent = useCrossword((s) => s.data.emptyTransparent);
  const fonts = useCrossword((s) => s.data.fonts);
  const showAnswers = useView((s) => s.data.showAnswers);
  const [exportBusy, setExportBusy] = useState<ExportBusy>(null);
  const options = useMemo(
    () => sheetOptions({ layout, title, emptyColor, emptyTransparent, fonts }, showAnswers),
    [layout, title, emptyColor, emptyTransparent, fonts, showAnswers],
  );
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:[--stage-max-h:calc(100dvh-22rem)]">
      <Toolbar />
      {puzzle ? (
        <SheetCanvas puzzle={puzzle} options={options} />
      ) : (
        <p
          role="status"
          className="m-0 rounded-md border border-dashed border-border-strong px-3 py-12 text-center text-sm text-muted"
          data-testid="preview-empty"
        >
          {S.preview.empty}
        </p>
      )}
      <section
        aria-labelledby="cw-export-title"
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
        data-testid="export-panel"
      >
        <h2 id="cw-export-title" className="m-0 text-sm font-semibold text-fg">
          {S.export.title}
        </h2>
        <ExportRow
          version="question"
          disabled={!puzzle}
          busyAll={exportBusy}
          setBusyAll={setExportBusy}
        />
        <ExportRow
          version="answer"
          disabled={!puzzle}
          busyAll={exportBusy}
          setBusyAll={setExportBusy}
        />
        <p className="m-0 text-xs text-muted">{puzzle ? S.export.hint : S.export.needPuzzle}</p>
      </section>
    </div>
  );
}
