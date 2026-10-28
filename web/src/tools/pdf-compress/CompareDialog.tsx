/**
 * 前後比對（F30，本站 D10）：同一頁的原檔與壓縮後並排（窄畫面上下），換頁、放大 2 倍（兩邊一起捲動）。
 * 頁面在預覽用的 Worker 裡畫成 ImageBitmap，畫在 canvas 上。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatBytes, readAsBytes } from '@/core/files';
import { isBigFile } from '@/core/pdf';
import { Dialog, DialogClose, IconButton, Notice, Segmented } from '@/ui';
import { bigThreshold, viewer } from './actions';
import { getItem } from './store';
import { S } from './strings';

type Zoom = 'fit' | 'double';

interface Rendered {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

function PageCanvas({
  page,
  label,
  testId,
}: {
  page: Rendered | null | 'failed';
  label: string;
  testId: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !page || page === 'failed') return;
    c.width = page.width;
    c.height = page.height;
    c.getContext('2d')?.drawImage(page.bitmap, 0, 0);
  }, [page]);
  if (page === 'failed') return <p className="m-0 p-4 text-sm text-muted">{S.compareFailed}</p>;
  if (!page) return <p className="m-0 p-4 text-sm text-muted">{S.compareLoading}</p>;
  return (
    <canvas
      ref={ref}
      aria-label={label}
      data-testid={testId}
      className="block h-auto w-full bg-white"
    />
  );
}

export function CompareDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const item = id ? getItem(id) : undefined;
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [before, setBefore] = useState<Rendered | null | 'failed'>(null);
  const [after, setAfter] = useState<Rendered | null | 'failed'>(null);
  const [opened, setOpened] = useState(false);
  const paneA = useRef<HTMLDivElement>(null);
  const paneB = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  /* 開啟兩份文件；每次開啟都從第 1 頁、符合寬度開始 */
  useEffect(() => {
    if (!id) return;
    const it = getItem(id);
    if (!it?.result) return;
    let alive = true;
    setOpened(false);
    setPage(1);
    setPages(0);
    setZoom('fit');
    (async () => {
      const v = viewer();
      /* 大檔：File／Blob 照原樣交給預覽的 Worker（分段讀），不整份讀進來 */
      const big = isBigFile(it.size, bigThreshold());
      const [a, b] = big
        ? [it.file, it.result!]
        : await Promise.all([readAsBytes(it.file), readAsBytes(it.result!)]);
      const ra = await v.open(`${id}:a`, a, it.password);
      await v.open(`${id}:b`, b, null);
      if (!alive) return;
      setPages(ra.pages);
      setOpened(true);
    })().catch(() => {
      if (alive) {
        setBefore('failed');
        setAfter('failed');
      }
    });
    return () => {
      alive = false;
      void viewer().close(`${id}:a`);
      void viewer().close(`${id}:b`);
    };
  }, [id]);

  /* 畫目前這一頁 */
  useEffect(() => {
    if (!id || !opened) return;
    let alive = true;
    setBefore(null);
    setAfter(null);
    const width = Math.min(
      2400,
      Math.round(
        (paneA.current?.clientWidth || 600) *
          (window.devicePixelRatio || 1) *
          (zoom === 'double' ? 2 : 1),
      ),
    );
    const v = viewer();
    const draw = async (which: 'a' | 'b', set: (r: Rendered | 'failed') => void) => {
      try {
        const r = await v.render(`${id}:${which}`, page, width);
        if (alive) set(r);
        else r.bitmap.close();
      } catch {
        if (alive) set('failed');
      }
    };
    void draw('a', setBefore);
    void draw('b', setAfter);
    return () => {
      alive = false;
    };
  }, [id, opened, page, zoom]);

  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
    to.scrollTop = from.scrollTop;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  const go = (d: number) => setPage((p) => Math.min(Math.max(1, p + d), Math.max(1, pages)));

  /* ← →：換頁（焦點在欄位、選項上時不搶） */
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input,textarea,select,[role="radiogroup"],[role="radio"]')) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      setPage((p) => Math.min(Math.max(1, p + d), Math.max(1, pages)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, pages]);

  const paneClass = 'max-h-[60dvh] overflow-auto rounded-md border border-border';
  const innerStyle = zoom === 'double' ? { width: '200%' } : undefined;

  return (
    <Dialog
      open={!!id && !!item}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={item ? S.compareTitle(item.name) : ''}
      size="xl"
      footer={<DialogClose>{S.compareClose}</DialogClose>}
    >
      <div className="flex flex-col gap-3" data-testid="compare">
        {item?.missingFonts.length ? (
          <Notice tone="info">
            <span data-testid="compare-fonts-hint">{S.fontsHint}</span>
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <IconButton
            label={S.comparePrev}
            icon={<ChevronLeft />}
            variant="secondary"
            disabled={page <= 1}
            onClick={() => go(-1)}
          />
          <output className="min-w-24 text-center text-sm tabular-nums" data-testid="compare-page">
            {pages ? S.comparePage(page, pages) : '…'}
          </output>
          <IconButton
            label={S.compareNext}
            icon={<ChevronRight />}
            variant="secondary"
            disabled={page >= pages}
            onClick={() => go(1)}
          />
          <span className="ml-auto" />
          <Segmented<Zoom>
            value={zoom}
            onValueChange={setZoom}
            size="sm"
            aria-label={S.compareZoom}
            options={[
              { value: 'fit', label: S.compareFit },
              { value: 'double', label: S.compareDouble },
            ]}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <figure className="m-0 flex min-w-0 flex-col gap-1">
            <figcaption className="text-xs text-muted">
              {item ? S.compareBefore(formatBytes(item.report?.originalBytes ?? item.size)) : ''}
            </figcaption>
            <div
              ref={paneA}
              className={paneClass}
              onScroll={() => sync(paneA.current, paneB.current)}
            >
              <div style={innerStyle}>
                <PageCanvas page={before} label={S.compareBeforeLabel} testId="compare-before" />
              </div>
            </div>
          </figure>
          <figure className="m-0 flex min-w-0 flex-col gap-1">
            <figcaption className="text-xs text-muted">
              {item ? S.compareAfter(formatBytes(item.report?.outputBytes ?? 0)) : ''}
            </figcaption>
            <div
              ref={paneB}
              className={paneClass}
              onScroll={() => sync(paneB.current, paneA.current)}
            >
              <div style={innerStyle}>
                <PageCanvas page={after} label={S.compareAfterLabel} testId="compare-after" />
              </div>
            </div>
          </figure>
        </div>
      </div>
    </Dialog>
  );
}
