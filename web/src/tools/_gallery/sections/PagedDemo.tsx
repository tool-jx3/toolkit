/**
 * 書頁（core/paged＋PagedViewport）的示範：一串段落自動分頁（段落不切開），放進可縮放的檢視區；
 * 「第 1 頁畫成 PNG」示範 rasterizeElement（coc-sheet 的匯出 PNG 移植時新增）。
 */
import { useEffect, useRef, useState } from 'react';
import { mmToPx, paginate, rasterizeElement, stepZoom } from '@/core/paged';
import { Button, PagedViewport, type PagedViewportHandle, Section } from '@/ui';

const PAGE = { w: 90, h: 70 };
const TEXTS = [
  '探索者們收到一封來自舊友的信。',
  '信上寫著：「請到洋館來一趟。」',
  '洋館位在霧氣終年不散的山谷裡，從車站要走上兩個小時。',
  '大廳的時鐘停在午夜十二點。',
  '樓梯的扶手上積了厚厚的灰塵，只有一道手印是新的。',
  '書房的書架上少了一本書。',
  '二樓走廊的盡頭有一扇上鎖的門，門縫裡透出微弱的光。',
  '管家說：「主人已經三天沒有出房間了。」',
];

export function PagedDemo() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const vp = useRef<PagedViewportHandle>(null);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(0);
  const [png, setPng] = useState<{ url: string; width: number; height: number } | null>(null);
  const toPng = async () => {
    const first = stage.current?.firstElementChild as HTMLElement | null;
    if (!first) return;
    const canvas = await rasterizeElement(first, { css: '', scale: 1, background: null });
    setPng({ url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
  };
  useEffect(() => {
    const h = host.current;
    const st = stage.current;
    if (!h || !st) return;
    const result = paginate({
      host: h,
      sections: [TEXTS],
      createPage: () => {
        const root = document.createElement('div');
        root.style.cssText = `width:${PAGE.w}mm;height:${PAGE.h}mm;margin:0 0 4mm;background:#f7f3ea;color:#23201c;box-shadow:0 1px 6px rgba(0,0,0,.3)`;
        const body = document.createElement('div');
        body.style.cssText =
          'box-sizing:border-box;height:100%;padding:6mm;overflow:hidden;font:11pt/1.7 serif';
        root.appendChild(body);
        return { root, body };
      },
      renderItem: (t) => {
        const p = document.createElement('p');
        p.style.margin = '0 0 2mm';
        p.textContent = t;
        return p;
      },
    });
    st.replaceChildren(...h.children);
    setPages(result.length);
  }, []);
  return (
    <Section title="書頁（core/paged 的 paginate＋PagedViewport）">
      <p className="m-0 text-sm text-muted">
        {TEXTS.length} 個段落排成 {pages}{' '}
        頁（段落不切開）。Ctrl＋滾輪以指標為中心縮放，中鍵或按住空白鍵拖曳平移。
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" onClick={() => setZoom((z) => stepZoom(z, -1) ?? z)}>
          縮小
        </Button>
        <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="secondary" onClick={() => setZoom((z) => stepZoom(z, 1) ?? z)}>
          放大
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setZoom(vp.current?.fitWidthZoom() ?? 1)}>
          配合寬度
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void toPng()}>
          第 1 頁畫成 PNG
        </Button>
      </div>
      {png ? (
        <p className="m-0 flex items-center gap-2 text-sm" data-testid="paged-demo-png">
          <img src={png.url} alt="第 1 頁的 PNG" className="h-16 border border-border" />
          {png.width} × {png.height} px（倍率 1，頁面的排版尺寸）
        </p>
      ) : null}
      <div
        ref={host}
        aria-hidden
        className="pointer-events-none fixed -left-[9999px] top-0"
        style={{ width: `${PAGE.w}mm` }}
      />
      <PagedViewport
        ref={vp}
        zoom={zoom}
        onZoomChange={setZoom}
        contentWidth={mmToPx(PAGE.w)}
        aria-label="書頁的示範"
        className="h-72 rounded-md bg-surface-2"
      >
        <div ref={stage} />
      </PagedViewport>
    </Section>
  );
}
