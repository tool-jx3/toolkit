/**
 * 小地圖：畫布縮圖、角色點、目前看得到的範圍框；點／拖＝移動視角、滾輪＝縮放、×＝關閉。
 */
import { X } from 'lucide-react';
import { useRef } from 'react';
import { charRingColor, PALETTES, sheetCtx } from '../engine/geom';
import type { Sheet } from '../model/types';
import { setPrefs, useUi } from '../state/store';
import { S } from '../strings';
import { centerOn, hostRect, zoomBy } from './view';

const MAX_W = 150;
const MAX_H = 110;

export function Minimap({
  sheet,
  pad,
  viewW,
  viewH,
}: {
  sheet: Sheet;
  pad: number;
  viewW: number;
  viewH: number;
}) {
  const view = useUi((u) => u.view);
  const ref = useRef<SVGSVGElement>(null);
  /* 畫布框的大小（視角一變就重畫，順便重量） */
  const hr = hostRect();
  const host = { w: hr?.width ?? 0, h: hr?.height ?? 0 };
  const k = Math.min(MAX_W / viewW, MAX_H / viewH);
  const w = Math.max(40, viewW * k);
  const h = Math.max(30, viewH * k);
  const ctx = sheetCtx(sheet);
  const pal = PALETTES[sheet.settings.palette];
  /* 看得到的範圍（SVG 座標） */
  const vx = -view.x / view.zoom;
  const vy = -view.y / view.zoom;
  const vw = host.w / view.zoom;
  const vh = host.h / view.zoom;
  const goto = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = (clientX - r.left) / k - pad;
    const y = (clientY - r.top) / k - pad;
    centerOn(x, y);
  };
  return (
    <div
      data-rc-overlay
      className="absolute right-2 bottom-2 z-10 rounded-md border border-border bg-surface/90 p-1 shadow-1"
      data-testid="minimap"
    >
      <svg
        ref={ref}
        width={w}
        height={h}
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="block cursor-pointer touch-none"
        role="img"
        aria-label={S.view.minimapLabel}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          goto(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons) goto(e.clientX, e.clientY);
        }}
        onWheel={(e) => {
          zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }}
      >
        <title>{S.view.minimapLabel}</title>
        <rect x={0} y={0} width={viewW} height={viewH} fill={pal.bg} />
        <rect
          x={pad}
          y={pad}
          width={sheet.W}
          height={sheet.H}
          fill={pal.panel}
          stroke={pal.guide}
          strokeWidth={2 / k}
        />
        {sheet.chars.map((c) => (
          <circle
            key={c.id}
            cx={c.x + pad}
            cy={c.y + pad}
            r={Math.max(3 / k, 18)}
            fill={charRingColor(ctx, c)}
          />
        ))}
        <rect
          x={vx}
          y={vy}
          width={vw}
          height={vh}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2 / k}
        />
      </svg>
      <button
        type="button"
        className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border border-border bg-surface text-muted hover:text-fg [&_svg]:size-3"
        aria-label={S.view.minimapClose}
        title={S.view.minimapClose}
        onClick={() => setPrefs({ minimap: false })}
        data-testid="minimap-close"
      >
        <X />
      </button>
    </div>
  );
}
