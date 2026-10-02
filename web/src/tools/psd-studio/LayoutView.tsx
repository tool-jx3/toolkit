/**
 * 配置檢視（F21～F29）：房間依 CCFOLIA 盤面的座標、PSD 依圖層位置，畫調色後的低解析度縮圖。
 * - 拖曳平移（移動超過 4 px 才算拖曳，放開不算點擊；第 5 節第 12 項）、滾輪以游標為中心縮放（×1.15／×0.85，第 29 項）；
 * - 點一下選取、點兩下開啟檢視器；看不見的不能點、依旋轉後的範圍判斷、透明處穿透（第 7 節裁定）；
 * - PSD 依不透明度、混合模式、遮色片、剪裁合成（第 7 節裁定；匯出仍是原始像素）；
 * - 鍵盤：方向鍵平移、＋／－縮放、0 回到中央。
 */
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTheme } from '@/ui';
import { alphaAt, hitPsd, hitRoom, type PsdPlaced, ROOM_CELL_PX, type RoomLayout } from './layout';
import type { Asset, Camera, Mode } from './store';
import { S } from './strings';
import { getThumbCanvas, getThumbSource, useThumbVersion } from './thumbs';

export const ZOOM_MIN = 0.01;
export const ZOOM_MAX = 10;
export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
const DRAG_THRESHOLD = 4;
const PAN_STEP = 40;

/** PSD 的混合模式 → canvas 的合成方式（不支援的照一般） */
const BLEND_OPS: Record<string, GlobalCompositeOperation> = {
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'linear dodge': 'lighter',
};

export interface LayoutViewProps {
  mode: Mode;
  assets: readonly Asset[];
  isVisible: (a: Asset) => boolean;
  selectedId: string | null;
  camera: Camera;
  onCamera: (c: Camera) => void;
  showGrid: boolean;
  room: RoomLayout | null;
  psd: { width: number; height: number } | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  /** 數字改變時把整個盤面（PSD 文件）縮放到符合畫面 */
  fitSignal?: number;
}

interface Size {
  w: number;
  h: number;
  dpr: number;
}

const css = (el: Element, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

export function LayoutView(props: LayoutViewProps) {
  const { mode, assets, isVisible, selectedId, camera, onCamera, showGrid, room, psd } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0, dpr: 1 });
  const version = useThumbVersion();
  const [theme] = useTheme();
  const cam = useRef(camera);
  cam.current = camera;
  const latest = useRef(props);
  latest.current = props;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight, dpr: window.devicePixelRatio || 1 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scaleOf = (z: number) => (mode === 'room' ? ROOM_CELL_PX * z : z);
  const origin = (c: Camera) => ({ x: size.w / 2 + c.x, y: size.h / 2 + c.y });
  /** 畫面座標 → 世界座標（房間：格；PSD：文件 px，左上角 (0,0)） */
  const toWorld = (sx: number, sy: number) => {
    const o = origin(cam.current);
    const s = scaleOf(cam.current.zoom);
    const wx = (sx - o.x) / s;
    const wy = (sy - o.y) / s;
    return mode === 'psd' && psd
      ? { x: wx + psd.width / 2, y: wy + psd.height / 2 }
      : { x: wx, y: wy };
  };

  /* 符合畫面：盤面或文件放進畫面（留一點邊） */
  const fitRef = useRef(props.fitSignal ?? 0);
  useEffect(() => {
    const sig = props.fitSignal ?? 0;
    if (sig === fitRef.current || !size.w || !size.h) return;
    fitRef.current = sig;
    const content =
      mode === 'psd' && psd
        ? { w: psd.width, h: psd.height }
        : room
          ? { w: room.field.width * ROOM_CELL_PX, h: room.field.height * ROOM_CELL_PX }
          : null;
    if (!content) return;
    const zoom = clampZoom(Math.min(size.w / content.w, size.h / content.h) * 0.92);
    onCamera({ x: 0, y: 0, zoom });
  }, [props.fitSignal, size, mode, psd, room, onCamera]);

  /* ---------- 作畫 ---------- */

  // biome-ignore lint/correctness/useExhaustiveDependencies: version、theme 變了就重畫
  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    const W = Math.round(size.w * size.dpr);
    const H = Math.round(size.h * size.dpr);
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const accent = css(c, '--accent', '#7c5cff');
    const border = css(c, '--border', '#444');
    const muted = css(c, '--text-muted', '#999');
    const o = origin(camera);
    const s = scaleOf(camera.zoom);

    if (mode === 'psd' && psd) {
      const left = o.x - (psd.width / 2) * s;
      const top = o.y - (psd.height / 2) * s;
      /* 文件範圍：深色棋盤格（透明處） */
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, psd.width * s, psd.height * s);
      ctx.clip();
      const ca = css(c, '--checker-a', '#2a2a2e');
      const cb = css(c, '--checker-b', '#202024');
      ctx.fillStyle = ca;
      ctx.fillRect(left, top, psd.width * s, psd.height * s);
      ctx.fillStyle = cb;
      const cell = 12;
      for (let y = 0; y * cell < psd.height * s; y++) {
        for (let x = (y % 2) as number; x * cell < psd.width * s; x += 2) {
          ctx.fillRect(left + x * cell, top + y * cell, cell, cell);
        }
      }
      ctx.restore();
      /* 圖層先合成到透明的畫布上（混合模式才不會跟棋盤格混） */
      const layer = document.createElement('canvas');
      layer.width = W;
      layer.height = H;
      const lc = layer.getContext('2d')!;
      lc.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      lc.imageSmoothingQuality = 'high';
      drawPsdStack(lc, assets, isVisible, left, top, s, W, H, size.dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0);
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.strokeRect(left - 0.5, top - 0.5, psd.width * s + 1, psd.height * s + 1);
      const sel = assets.find((a) => a.id === selectedId && a.layer);
      if (sel?.layer) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          left + sel.layer.left * s,
          top + sel.layer.top * s,
          sel.width * s,
          sel.height * s,
        );
      }
      return;
    }

    if (!room?.hasObjects) {
      ctx.fillStyle = muted;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(S.noRoomData, size.w / 2, size.h / 2);
      return;
    }
    if (showGrid) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = o.x - Math.ceil(o.x / s) * s;
      for (let x = startX; x <= size.w; x += s) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, size.h);
      }
      const startY = o.y - Math.ceil(o.y / s) * s;
      for (let y = startY; y <= size.h; y += s) {
        const py = Math.round(y) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(size.w, py);
      }
      if (s >= 3) ctx.stroke();
    }
    /* 盤面範圍（虛線） */
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = muted;
    ctx.strokeRect(
      o.x - (room.field.width / 2) * s,
      o.y - (room.field.height / 2) * s,
      room.field.width * s,
      room.field.height * s,
    );
    ctx.restore();
    const byId = new Map(assets.map((a) => [a.id, a]));
    for (const ob of room.objects) {
      const a = byId.get(ob.assetId);
      if (!a || !isVisible(a)) continue;
      const img = getThumbCanvas(a.id);
      const w = ob.width * s;
      const h = ob.height * s;
      ctx.save();
      ctx.translate(o.x + (ob.x + ob.width / 2) * s, o.y + (ob.y + ob.height / 2) * s);
      if (ob.angle) ctx.rotate((ob.angle * Math.PI) / 180);
      if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
      if (a.id === selectedId) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }
  }, [mode, assets, isVisible, selectedId, camera, showGrid, room, psd, size, version, theme]);

  /* ---------- 指標 ---------- */

  const press = useRef<{ id: number; x: number; y: number; cam: Camera; moved: boolean } | null>(
    null,
  );

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const hit = (sx: number, sy: number): string | null => {
    const p = latest.current;
    const w = toWorld(sx, sy);
    const visibleById = (id: string) => {
      const a = p.assets.find((x) => x.id === id);
      return !!a && p.isVisible(a);
    };
    const alpha = (id: string, u: number, v: number) => {
      const src = getThumbSource(id);
      if (!src) return 255;
      return alphaAt(src.masked ?? src.src, u, v);
    };
    if (p.mode === 'psd') {
      const list: PsdPlaced[] = p.assets
        .filter((a) => a.layer)
        .map((a) => ({
          id: a.id,
          left: a.layer!.left,
          top: a.layer!.top,
          width: a.width,
          height: a.height,
        }));
      return hitPsd(list, w.x, w.y, visibleById, alpha)?.id ?? null;
    }
    if (!p.room) return null;
    return hitRoom(p.room.objects, w.x, w.y, visibleById, alpha)?.assetId ?? null;
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    canvas.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    press.current = { id: e.pointerId, x: p.x, y: p.y, cam: cam.current, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    const p = local(e);
    const dx = p.x - pr.x;
    const dy = p.y - pr.y;
    if (!pr.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    pr.moved = true;
    onCamera({ ...pr.cam, x: pr.cam.x + dx, y: pr.cam.y + dy });
  };
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    press.current = null;
    if (pr.moved || e.button !== 0) return;
    const p = local(e);
    const id = hit(p.x, p.y);
    if (id) props.onSelect(id);
  };
  const onDoubleClick = (e: { clientX: number; clientY: number }) => {
    const p = local(e);
    const id = hit(p.x, p.y);
    if (id) props.onOpen(id);
  };

  /* 滾輪：以游標為中心縮放（頁面不捲動） */
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      zoomAt(e.deltaY < 0 ? 1.15 : 0.85, px, py);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  });

  const zoomAt = (factor: number, px: number, py: number) => {
    const c0 = cam.current;
    const zoom = clampZoom(c0.zoom * factor);
    const k = zoom / c0.zoom;
    /* 游標下的點不動：新原點＝游標 −（游標 − 舊原點）× k */
    const ox = size.w / 2 + c0.x;
    const oy = size.h / 2 + c0.y;
    const nx = px - (px - ox) * k;
    const ny = py - (py - oy) * k;
    onCamera({ x: nx - size.w / 2, y: ny - size.h / 2, zoom });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const c0 = cam.current;
    if (e.key === 'ArrowLeft') onCamera({ ...c0, x: c0.x + PAN_STEP });
    else if (e.key === 'ArrowRight') onCamera({ ...c0, x: c0.x - PAN_STEP });
    else if (e.key === 'ArrowUp') onCamera({ ...c0, y: c0.y + PAN_STEP });
    else if (e.key === 'ArrowDown') onCamera({ ...c0, y: c0.y - PAN_STEP });
    else if (e.key === '+' || e.key === '=') zoomAt(1.2, size.w / 2, size.h / 2);
    else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.2, size.w / 2, size.h / 2);
    else if (e.key === '0') onCamera({ x: 0, y: 0, zoom: 1 });
    else return;
    e.preventDefault();
  };

  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label={S.layoutCanvas(mode)}
        data-testid="layout-canvas"
        data-zoom={camera.zoom.toFixed(4)}
        data-cam-x={camera.x.toFixed(1)}
        data-cam-y={camera.y.toFixed(1)}
        className="block size-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-focus active:cursor-grabbing"
        style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/** PSD 的圖層依序合成（assets 是由上到下；畫的時候由下到上）；剪裁遮色片以 source-atop 合到底下的圖層 */
function drawPsdStack(
  ctx: CanvasRenderingContext2D,
  assets: readonly Asset[],
  isVisible: (a: Asset) => boolean,
  left: number,
  top: number,
  s: number,
  W: number,
  H: number,
  dpr: number,
) {
  const layers = assets.filter((a) => a.layer).reverse();
  const draw = (target: CanvasRenderingContext2D, a: Asset) => {
    const src = getThumbCanvas(a.id, true);
    if (!src || !a.layer) return;
    target.drawImage(
      src,
      left + a.layer.left * s,
      top + a.layer.top * s,
      a.width * s,
      a.height * s,
    );
  };
  for (let i = 0; i < layers.length; i++) {
    const base = layers[i];
    /* 往上收集剪裁到這一層的圖層 */
    const clipped: Asset[] = [];
    let j = i + 1;
    while (j < layers.length && layers[j].layer?.clipping) {
      clipped.push(layers[j]);
      j++;
    }
    const meta = base.layer!;
    if (isVisible(base)) {
      const op = BLEND_OPS[meta.blendMode] ?? 'source-over';
      const shown = clipped.filter(isVisible);
      if (shown.length) {
        const group = document.createElement('canvas');
        group.width = W;
        group.height = H;
        const g = group.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.imageSmoothingQuality = 'high';
        draw(g, base);
        g.globalCompositeOperation = 'source-atop';
        for (const c of shown) {
          g.globalAlpha = c.layer!.opacity;
          draw(g, c);
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = meta.opacity;
        ctx.globalCompositeOperation = op;
        ctx.drawImage(group, 0, 0);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = meta.opacity;
        ctx.globalCompositeOperation = op;
        draw(ctx, base);
        ctx.restore();
      }
    }
    i = j - 1;
  }
}
