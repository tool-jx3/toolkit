/**
 * 小地圖：畫布縮圖、角色點、目前看得到的範圍框；點／拖＝移動視角、滾輪＝縮放、×＝關閉。
 * 拖曳與磁鐵跑著時角色點跟著工作副本走（最多每 120 ms 一次）。
 */
import { X } from 'lucide-react';
import { useRef, useSyncExternalStore } from 'react';
import { charRingColor, PALETTES, sheetCtx } from '../engine/geom';
import { labelColor, labelInfo } from '../engine/labels';
import type { Sheet } from '../model/types';
import { setPrefs, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { displaySheet, liveTick, subscribeLiveTick } from './live';
import { centerOn, zoomBy } from './view';

/** 小地圖的最大尺寸（窄畫面縮小，不要蓋住太多畫布） */
const MAX = { wide: [150, 110], narrow: [90, 66] } as const;

export function Minimap({
  sheet,
  pad,
  viewW,
  viewH,
  host,
}: {
  sheet: Sheet;
  pad: number;
  viewW: number;
  viewH: number;
  /** 畫布框的大小（編輯畫面量好傳進來；render 裡量會強迫排版） */
  host: { w: number; h: number };
}) {
  const view = useUi((u) => u.view);
  const ref = useRef<SVGSVGElement>(null);
  useSyncExternalStore(subscribeLiveTick, liveTick, liveTick);
  const labels = useProject((s) => s.data.labels);
  const shown = displaySheet(sheet);
  /* 收合中的成員以收合節點的一顆點代表 */
  const info = labelInfo(sheetCtx(shown, labels));
  const chars = info.colHidden.size
    ? shown.chars.filter((c) => !info.colHidden.has(c.id))
    : shown.chars;
  const [maxW, maxH] = host.w && host.w < 560 ? MAX.narrow : MAX.wide;
  const k = Math.min(maxW / viewW, maxH / viewH);
  const w = Math.max(40, viewW * k);
  const h = Math.max(30, viewH * k);
  const ctx = sheetCtx(sheet, labels);
  const dot = Math.max(3 / k, 18);
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
        {chars.map((c) => (
          <circle key={c.id} cx={c.x + pad} cy={c.y + pad} r={dot} fill={charRingColor(ctx, c)} />
        ))}
        {[...info.colGroups.values()].map((g) => (
          <circle
            key={`g${g.id}`}
            cx={g.x + pad}
            cy={g.y + pad}
            r={dot * 1.7}
            fill={labelColor(ctx, g.lbl)}
            data-testid="minimap-group"
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
