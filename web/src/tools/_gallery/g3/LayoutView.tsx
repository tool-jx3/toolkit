/**
 * 「立繪工作台」預覽：頭像版面（Stage＋canvas 作畫＋LayoutEditor 疊在上面）。
 * 預覽與下載用同一段 drawIcon（所見即所得）；圖片、名字牌、HO 牌可以點選、拖曳，名字牌與 HO 牌有右下角控點。
 */
import { Copy, Download, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { copyImage, downloadBlob } from '@/core/files';
import { canvasToBlob, fillPattern, roundRectPath, roundRectPath2D } from '@/core/image';
import { type Box, clampBoxPosition, percentToBox } from '@/core/layout';
import { historyGesture } from '@/core/storage';
import { Button, IconButton, LayoutEditor, type LayoutItem, Stage, useToast } from '@/ui';
import { FIGURE_COLORS, makeFigure } from './art';
import { type G3Settings, LAYOUT_DEFAULTS, useG3, useG3Preview } from './store';

export const ICON_SIZE = 512;
const FIGURE = { width: 400, height: 800 };

const inner = (s: G3Settings): Box => ({
  x: s.frameWidth,
  y: s.frameWidth,
  width: ICON_SIZE - 2 * s.frameWidth,
  height: ICON_SIZE - 2 * s.frameWidth,
});

/** 圖片的範圍（內側區域的 %）：寬 ＝ 58% × 倍率，高依原圖比例，中心在 imageCenter */
export function imageBox(s: G3Settings): Box {
  const f = inner(s);
  const w = 58 * s.imageScale;
  const h = ((w / 100) * f.width * (FIGURE.height / FIGURE.width) * 100) / f.height;
  return { x: s.imageCenter.x - w / 2, y: s.imageCenter.y - h / 2, width: w, height: h };
}

function drawIcon(ctx: CanvasRenderingContext2D, s: G3Settings, figure: HTMLCanvasElement) {
  const S = ICON_SIZE;
  ctx.clearRect(0, 0, S, S);
  /* 外框（漸層） */
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#e8604c');
  g.addColorStop(0.5, '#f0a23c');
  g.addColorStop(1, '#b84a8c');
  ctx.fillStyle = g;
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, S, S, 37);
  ctx.fill();
  /* 內側：底色＋花紋＋圖片，全部裁在內側圓角矩形裡 */
  const f = inner(s);
  const clip = roundRectPath2D(f.x, f.y, f.width, f.height, 25);
  ctx.save();
  ctx.clip(clip);
  ctx.fillStyle = '#fff4ec';
  ctx.fillRect(f.x, f.y, f.width, f.height);
  if (s.pattern !== 'none')
    fillPattern(ctx, s.pattern, clip, { color: '#b84a8c', opacity: 0.14, size: 20 });
  const im = percentToBox(imageBox(s), f);
  ctx.drawImage(figure, im.x, im.y, im.width, im.height);
  ctx.restore();
  /* 名字牌（直排） */
  const n = percentToBox(s.name, f);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.beginPath();
  roundRectPath(ctx, n.x, n.y, n.width, n.height, 12);
  ctx.fill();
  const chars = Array.from('艾莉絲');
  const fs = Math.min(n.width * 0.62, (n.height * 0.8) / chars.length);
  ctx.fillStyle = '#1f2937';
  ctx.font = `700 ${fs}px "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    ctx.fillText(
      ch,
      n.x + n.width / 2,
      n.y + n.height / 2 + (i - (chars.length - 1) / 2) * fs * 1.15,
    );
  });
  /* HO 牌 */
  const h = percentToBox(s.ho, f);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  roundRectPath(ctx, h.x, h.y, h.width, h.height, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.min(h.height * 0.55, 20)}px "Noto Sans TC", sans-serif`;
  ctx.fillText('HO1', h.x + h.width / 2, h.y + h.height / 2);
}

const fmt = (b: Box) =>
  `左上 (${b.x.toFixed(1)}%, ${b.y.toFixed(1)}%)・${b.width.toFixed(1)} × ${b.height.toFixed(1)}`;

export function LayoutView() {
  const s = useG3((st) => st.data);
  const update = useG3((st) => st.update);
  const selected = useG3Preview((st) => st.data.layoutSelected);
  const setPreview = useG3Preview((st) => st.patch);
  const toast = useToast();
  const figure = useMemo(
    () => makeFigure(FIGURE.width, FIGURE.height, FIGURE_COLORS[0], { hat: true }),
    [],
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  const g = useMemo(() => historyGesture(useG3), []);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawIcon(ctx, s, figure);
  }, [s, figure]);

  const items: LayoutItem[] = [
    {
      id: 'image',
      label: '圖片',
      box: imageBox(s),
      clipToFrame: true,
      clamp: (b) => clampBoxPosition(b, { minX: -20, maxX: 120, minY: -20, maxY: 120 }, 'center'),
    },
    {
      id: 'name',
      label: '名字牌',
      box: s.name,
      resizable: true,
      limits: { minWidth: 8, maxWidth: 80, minHeight: 6, maxHeight: 80 },
      clamp: (b) =>
        clampBoxPosition(b, { minX: -10, maxX: 110 - b.width, minY: -10, maxY: 110 - b.height }),
    },
    {
      id: 'ho',
      label: 'HO 牌',
      box: s.ho,
      resizable: true,
      limits: { minWidth: 8, maxWidth: 80, minHeight: 6, maxHeight: 80 },
      clamp: (b) =>
        clampBoxPosition(b, { minX: -10, maxX: 110 - b.width, minY: -10, maxY: 110 - b.height }),
    },
  ];

  const setBox = (id: string, b: Box) =>
    update((d) => {
      if (id === 'image') d.imageCenter = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      else if (id === 'name') d.name = b;
      else if (id === 'ho') d.ho = b;
    });
  const zoomImage = (dir: 1 | -1) =>
    update((d) => {
      d.imageScale = Math.min(
        3,
        Math.max(0.35, Math.round((d.imageScale + dir * 0.08) * 100) / 100),
      );
    });
  const exportBlob = () => {
    const c = document.createElement('canvas');
    c.width = ICON_SIZE;
    c.height = ICON_SIZE;
    const ctx = c.getContext('2d');
    if (ctx) drawIcon(ctx, s, figure);
    return canvasToBlob(c);
  };
  const sel = items.find((it) => it.id === selected);

  return (
    <div className="flex flex-col gap-2">
      <Stage
        width={ICON_SIZE}
        height={ICON_SIZE}
        aria-label="頭像版面預覽"
        defaultBackground={{ kind: 'dark' }}
      >
        <canvas ref={canvas} width={ICON_SIZE} height={ICON_SIZE} className="block size-full" />
        <LayoutEditor
          width={ICON_SIZE}
          height={ICON_SIZE}
          frame={inner(s)}
          units="percent"
          items={items}
          selectedId={selected}
          onSelect={(id) => setPreview({ layoutSelected: id })}
          onChange={(id, box, { phase }) => {
            if (phase === 'start') g.begin();
            if (phase !== 'start' && phase !== 'end') setBox(id, box);
            if (phase === 'end') g.commit();
          }}
          nudgeStep={0.2}
          nudgeShiftStep={2}
          safeArea={{
            x: ICON_SIZE * 0.07,
            y: ICON_SIZE * 0.07,
            width: ICON_SIZE * 0.86,
            height: ICON_SIZE * 0.86,
          }}
          aria-label="頭像版面"
        />
      </Stage>
      <div className="flex flex-wrap items-center gap-1">
        <IconButton label="圖片縮小" icon={<ZoomOut />} onClick={() => zoomImage(-1)} />
        <IconButton label="圖片放大" icon={<ZoomIn />} onClick={() => zoomImage(1)} />
        <span className="text-xs text-muted tabular-nums" data-testid="image-scale">
          圖片 {Math.round(s.imageScale * 100)}%
        </span>
        <Button
          size="sm"
          icon={<RotateCcw />}
          onClick={() => {
            update((d) => Object.assign(d, structuredClone(LAYOUT_DEFAULTS)));
            setPreview({ layoutSelected: 'name' });
          }}
        >
          重設版面
        </Button>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            icon={<Copy />}
            onClick={async () => {
              const r = await copyImage(exportBlob());
              toast(
                r.ok
                  ? { title: '已複製圖片', tone: 'success' }
                  : { title: '無法複製圖片，請改用「下載 PNG」', tone: 'warning' },
              );
            }}
          >
            複製圖片
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Download />}
            onClick={async () => downloadBlob(await exportBlob(), 'icon-demo.png')}
          >
            下載 PNG
          </Button>
        </div>
      </div>
      <p className="m-0 text-xs text-muted" data-testid="layout-summary" aria-live="polite">
        {sel ? `選取：${sel.label}｜${fmt(sel.box)}` : '沒有選取物件（點預覽上的物件來選取）'}
      </p>
    </div>
  );
}
