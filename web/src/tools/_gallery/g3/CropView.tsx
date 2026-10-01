/**
 * 「立繪工作台」預覽：嵌在預覽上的裁切框（Stage 的拖曳平移與不按 Ctrl 的滾輪縮放＋CropFrame）
 * ＋剪影效果（applySilhouetteEffects，畫在角色後面、不改變半透明像素）。
 */
import { Download, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { downloadBlob } from '@/core/files';
import {
  applySilhouetteEffects,
  canvasToBlob,
  getImageData,
  imageOpaqueBounds,
  imageOpaqueSpanInRows,
  outlineLayers,
} from '@/core/image';
import { clampSpan } from '@/core/layout';
import { historyGesture } from '@/core/storage';
import { Button, CropFrame, Stage } from '@/ui';
import { FIGURE_COLORS, makeFigure } from './art';
import { useG3, useG3Preview } from './store';

const FIG = { width: 700, height: 1200 };

export function CropView() {
  const s = useG3((st) => st.data);
  const update = useG3((st) => st.update);
  const zoom = useG3Preview((st) => st.data.cropZoom);
  const pan = useG3Preview((st) => st.data.cropPan);
  const setPreview = useG3Preview((st) => st.patch);
  const g = useMemo(() => historyGesture(useG3), []);
  const figure = useMemo(() => makeFigure(FIG.width, FIG.height, FIGURE_COLORS[1]), []);
  const view = useRef<HTMLCanvasElement>(null);
  const out = useRef<HTMLCanvasElement>(null);

  /* 角色範圍與頭部中心（上方約 35% 的左右界中點） */
  const geo = useMemo(() => {
    const b = imageOpaqueBounds(figure) ?? { x: 0, y: 0, ...FIG };
    const span = imageOpaqueSpanInRows(figure, b.y, b.y + Math.max(20, b.height * 0.35));
    return { bounds: b, head: span ? (span.left + span.right) / 2 : b.x + b.width / 2 };
  }, [figure]);

  const H = Math.round(geo.bounds.height * (s.range / 100));
  const W = Math.round(H * (s.aspect === '3:4' ? 0.75 : 1));
  const baseX = geo.head - W / 2;
  const rect = {
    x: Math.round(clampSpan(baseX + s.offset, W, FIG.width)),
    y: Math.round(clampSpan(geo.bounds.y, H, FIG.height)),
    width: W,
    height: H,
  };

  useEffect(() => {
    const ctx = view.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, FIG.width, FIG.height);
    ctx.drawImage(figure, 0, 0);
  }, [figure]);

  /* 裁切結果＋效果（所見即所得：這張就是下載的內容） */
  const renderResult = () => {
    const c = document.createElement('canvas');
    c.width = rect.width;
    c.height = rect.height;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    ctx.drawImage(figure, -rect.x, -rect.y);
    if (s.effect !== 'none') {
      const px = getImageData(c);
      const fx = applySilhouetteEffects(
        px,
        outlineLayers(s.effect, {
          color: s.effectColor,
          width: s.effectWidth,
          blur: s.effectBlur,
          offset: s.effectOffset,
          opacity: s.effectOpacity,
        }),
      );
      ctx.putImageData(new ImageData(fx.data, fx.width, fx.height), 0, 0);
    }
    return c;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: renderResult 只依這些值
  useEffect(() => {
    const c = out.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const r = renderResult();
    c.width = r.width;
    c.height = r.height;
    ctx.drawImage(r, 0, 0);
  }, [
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    s.effect,
    s.effectColor,
    s.effectWidth,
    s.effectBlur,
    s.effectOffset,
    s.effectOpacity,
  ]);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Stage
          width={FIG.width}
          height={FIG.height}
          aria-label="裁切框預覽"
          dragPan
          wheelZoom="plain"
          zoomBase="fit"
          zoomRange={[0.2, 5]}
          wheelFactors={[1.1, 0.9]}
          zoom={zoom}
          onZoomChange={(z) => setPreview({ cropZoom: z === 'fit' ? 1 : z })}
          pan={pan}
          onPanChange={(p) => setPreview({ cropPan: p })}
          backgrounds={['checker', 'dark', 'light']}
          toolbarExtra={
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw />}
              onClick={() => setPreview({ cropZoom: 1, cropPan: { x: 0, y: 0 } })}
            >
              歸位
            </Button>
          }
        >
          <canvas ref={view} width={FIG.width} height={FIG.height} className="block size-full" />
          <CropFrame
            width={FIG.width}
            height={FIG.height}
            rect={rect}
            label="可以左右拖曳"
            onMove={(r, phase) => {
              if (phase === 'start') g.begin();
              else if (phase === 'end') g.commit();
              else
                update((d) => {
                  d.offset = Math.round(r.x - baseX);
                });
            }}
          />
        </Stage>
        <div className="flex flex-col gap-1">
          <div className="checker flex min-h-40 items-center justify-center overflow-hidden rounded-md border border-border p-2">
            <canvas ref={out} className="block max-h-72 max-w-full" data-testid="crop-result" />
          </div>
          <p className="m-0 text-xs text-muted tabular-nums" data-testid="crop-info">
            {rect.width} × {rect.height}・左上 ({rect.x}, {rect.y})
          </p>
          <Button
            size="sm"
            icon={<Download />}
            onClick={async () =>
              downloadBlob(await canvasToBlob(renderResult()), 'crop-demo_crop.png')
            }
          >
            下載裁切結果
          </Button>
        </div>
      </div>
      <p className="m-0 text-xs text-muted">
        在空白處拖曳平移、直接滾輪縮放（20%～500%，以符合畫面為
        100%）；裁切框只能左右拖曳，聚焦時可用 ← →。
      </p>
    </div>
  );
}
