/**
 * 「立繪工作台」預覽：身高板（PanZoomViewport＋core/ruler＋WindowDrop＋core/assets）。
 * 世界座標：x 是 cm（往右）、y 是「負的高度 cm」（往下為正，所以地面 y＝0、180 cm 在 y＝−180）。
 */
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createAssetStore, useAssetBitmap } from '@/core/assets';
import { imageOpaqueBounds, type Rect } from '@/core/image';
import { type Box, hitTest } from '@/core/layout';
import { ceilTo, RULER_STYLE, rulerTicks } from '@/core/ruler';
import { historyGesture } from '@/core/storage';
import {
  Button,
  IconButton,
  isFormControlTarget,
  type PanZoomView,
  PanZoomViewport,
  type PanZoomViewportHandle,
  useToast,
  WindowDrop,
} from '@/ui';
import { FIGURE_COLORS, makeFigure } from './art';
import { type DemoCharacter, useG3, useG3Preview } from './store';

export const boardAssets = createAssetStore('_gallery-g3');

interface Sprite {
  image: CanvasImageSource;
  /** 去掉透明留白後的範圍（門檻 16） */
  crop: Rect;
}

const FIG = { width: 300, height: 600 };

function useSprites(chars: readonly DemoCharacter[]) {
  const figures = useMemo(
    () => FIGURE_COLORS.map((c, i) => makeFigure(FIG.width, FIG.height, c, { hat: i === 2 })),
    [],
  );
  const crops = useMemo(
    () => figures.map((f) => imageOpaqueBounds(f, 16) ?? { x: 0, y: 0, ...FIG }),
    [figures],
  );
  /* 使用者拖進來的圖（資產庫）：只示範第一張 */
  const dropped = chars.find((c) => c.assetId);
  const bmp = useAssetBitmap(boardAssets, dropped?.assetId);
  const droppedCrop = useMemo(
    () =>
      bmp
        ? (imageOpaqueBounds(bmp, 16) ?? { x: 0, y: 0, width: bmp.width, height: bmp.height })
        : null,
    [bmp],
  );
  return (c: DemoCharacter): Sprite | null => {
    if (c.assetId)
      return bmp && droppedCrop && c.assetId === dropped?.assetId
        ? { image: bmp, crop: droppedCrop }
        : null;
    return { image: figures[c.art % figures.length], crop: crops[c.art % crops.length] };
  };
}

/** 角色在世界座標的範圍（腳底在地面） */
function charBox(c: DemoCharacter, sp: Sprite | null): Box {
  const crop = sp?.crop ?? { x: 0, y: 0, width: 1, height: 2 };
  const w = (crop.width / crop.height) * c.height;
  return { x: c.x, y: -c.height, width: w, height: c.height };
}

export function BoardView() {
  const chars = useG3((s) => s.data.characters);
  const update = useG3((s) => s.update);
  const zoom = useG3Preview((s) => s.data.boardZoom);
  const selected = useG3Preview((s) => s.data.boardSelected);
  const setPreview = useG3Preview((s) => s.patch);
  const toast = useToast();
  const sprite = useSprites(chars);
  const vp = useRef<PanZoomViewportHandle>(null);
  const g = useMemo(() => historyGesture(useG3), []);
  const [hover, setHover] = useState<{ x: number; y: number; id: string | null } | null>(null);

  const shown = chars.filter((c) => c.visible);
  const boxes = shown.map((c) => ({ id: c.id, c, box: charBox(c, sprite(c)) }));
  const top = ceilTo(Math.max(180, ...shown.map((c) => c.height * 1.06)), 10);
  const right = Math.max(120, ...boxes.map((b) => b.box.x + b.box.width + 8));
  const world: Box = { x: 0, y: -top, width: right, height: top };

  const draw = (ctx: CanvasRenderingContext2D, v: PanZoomView) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, v.width, v.height);
    const ticks = rulerTicks({
      min: 0,
      max: top,
      step: 10,
      majorEvery: 50,
      scale: v.scale,
      floor: 0,
    });
    /* view.world 是延伸到畫面右緣的範圍（extend="x"） */
    const x0 = v.toScreen(v.world.x, 0).x;
    const x1 = v.toScreen(v.world.x + v.world.width, 0).x;
    for (const t of ticks) {
      const y = Math.round(v.toScreen(0, -t.value).y) + 0.5;
      ctx.strokeStyle = RULER_STYLE[t.kind].line;
      ctx.lineWidth = RULER_STYLE[t.kind].widthRatio;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    for (const b of boxes) {
      const sp = sprite(b.c);
      if (!sp) continue;
      const p = v.toScreen(b.box.x, b.box.y);
      ctx.drawImage(
        sp.image,
        sp.crop.x,
        sp.crop.y,
        sp.crop.width,
        sp.crop.height,
        p.x,
        p.y,
        b.box.width * v.scale,
        b.box.height * v.scale,
      );
    }
    const sel = boxes.find((b) => b.id === selected);
    if (sel) {
      const p = v.toScreen(sel.box.x, sel.box.y);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - 2, p.y - 2, sel.box.width * v.scale + 4, sel.box.height * v.scale + 4);
      ctx.setLineDash([]);
    }
    const hov = boxes.find((b) => b.id === hover?.id);
    if (hov) {
      const y = v.toScreen(0, hov.box.y).y;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const drawRuler = (ctx: CanvasRenderingContext2D, v: PanZoomView) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 58, v.height);
    ctx.strokeStyle = '#bcbcbc';
    ctx.beginPath();
    ctx.moveTo(57.5, 0);
    ctx.lineTo(57.5, v.height);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of rulerTicks({
      min: 0,
      max: top,
      step: 10,
      majorEvery: 50,
      scale: v.scale,
      floor: 0,
      fontPx: 11,
    })) {
      if (t.label === null) continue;
      const y = v.toScreen(0, -t.value).y;
      ctx.fillStyle = RULER_STYLE[t.kind].text;
      ctx.font = `${RULER_STYLE[t.kind].weight} 11px "Noto Sans TC", sans-serif`;
      ctx.fillText(t.label, 50, y);
    }
  };

  /* ← →：選取的角色移動螢幕 1 px（Shift 10 px） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || e.ctrlKey || e.metaKey || e.altKey || isFormControlTarget(e.target)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"],[role="menu"]')) return;
      const v = vp.current?.getView();
      if (!v) return;
      e.preventDefault();
      const dx = ((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1)) / v.scale;
      update((d) => {
        const c = d.characters.find((x) => x.id === selected);
        if (c) c.x = Math.max(0, c.x + dx);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, update]);

  const hitAt = (wx: number, wy: number) => hitTest(boxes, wx, wy);
  const height = (wy: number) => -wy;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <IconButton label="縮小" icon={<Minus />} onClick={() => vp.current?.zoomBy(1 / 1.25)} />
        <button
          type="button"
          className="h-8 min-w-14 rounded-md px-1 text-xs tabular-nums text-muted hover:bg-surface-2 hover:text-fg"
          aria-label={`目前倍率 ${Math.round(zoom * 100)}%，按一下回到 100%`}
          data-testid="board-zoom"
          onClick={() => vp.current?.zoomTo(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="放大" icon={<Plus />} onClick={() => vp.current?.zoomBy(1.25)} />
        <Button size="sm" icon={<Maximize2 />} onClick={() => vp.current?.fitWidth({ max: 1 })}>
          符合寬度
        </Button>
        <span className="ml-auto text-xs text-muted tabular-nums" data-testid="board-pointer">
          {hover ? `游標：${hover.x.toFixed(1)} cm、高 ${hover.y.toFixed(1)} cm` : '游標不在盤面上'}
        </span>
      </div>
      <PanZoomViewport
        ref={vp}
        aria-label="身高比較盤面"
        world={world}
        baseScale="fit-height"
        zoom={zoom}
        onZoomChange={(z) => setPreview({ boardZoom: z })}
        minZoom={0.2}
        maxZoom={4}
        padding={{ top: 14, bottom: 14, left: 8, right: 8 }}
        align={{ x: 'start', y: 'end' }}
        extend="x"
        gutter={{ width: 58, draw: drawRuler }}
        draw={draw}
        onPointerDown={(p) => {
          const hit = hitAt(p.wx, p.wy);
          if (!hit) return;
          setPreview({ boardSelected: hit.id });
          const startX = hit.c.x;
          const startW = p.wx;
          let began = false;
          return {
            cursor: 'move',
            onMove: (q) => {
              if (!began) {
                g.begin();
                began = true;
              }
              update((d) => {
                const c = d.characters.find((x) => x.id === hit.id);
                if (c) c.x = Math.max(0, startX + q.wx - startW);
              });
            },
            onEnd: () => {
              if (began) g.commit();
            },
          };
        }}
        onEmptyClick={() => setPreview({ boardSelected: null })}
        onHover={(p) =>
          setHover(p ? { x: p.wx, y: height(p.wy), id: hitAt(p.wx, p.wy)?.id ?? null } : null)
        }
        getCursor={(p) => (hitAt(p.wx, p.wy) ? 'move' : undefined)}
        getTooltip={(p) => {
          const h = hitAt(p.wx, p.wy);
          return h ? `${h.c.name}　${Number(h.c.height.toFixed(1))} cm` : null;
        }}
        className="h-[min(52dvh,460px)]"
      />
      <p className="m-0 text-xs text-muted">
        滾輪以游標為中心縮放、Shift＋滾輪橫向捲動；拖曳空白處、中鍵或按住空白鍵拖曳平移；點角色選取後可拖曳或用
        ← → 移動。 把圖片檔拖進視窗就會加到放開的位置。
      </p>
      <WindowDrop
        accept="image/*"
        hint="示範：加到放開的位置（身高 150 cm）"
        onDrop={async (files, at) => {
          const w = vp.current?.clientToWorld(at.clientX, at.clientY);
          const { id, persisted, reason } = await boardAssets.add(files[0]);
          update((d) => {
            d.characters = d.characters.filter((c) => !c.assetId);
            d.characters.push({
              id: `drop-${id}`,
              name: files[0].name.replace(/\.[^.]+$/, '') || '未命名',
              height: 150,
              x: Math.max(0, (w?.x ?? 5) - 20),
              visible: true,
              art: 0,
              assetId: id,
            });
          });
          if (!persisted)
            toast({
              title:
                reason === 'quota'
                  ? '瀏覽器空間不足，圖片無法自動保存'
                  : '這個瀏覽器無法自動保存圖片',
              tone: 'warning',
            });
        }}
      />
    </div>
  );
}
