/**
 * core/grid 的示範：方格／六角格（平頂、尖頂、網格化）的無限格線、滑鼠所在的格子與鄰格、
 * 點一下設起點、顯示到起點的距離與座標文字。
 */
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import {
  type Axial,
  axialCenter,
  axialDistance,
  clientToCanvas,
  type HexOrientation,
  hexCorners,
  hexGridPolylines,
  hexMetrics,
  hexNeighbors,
  pixelToAxial,
  squareCellAt,
  squareCorners,
  squareDistance,
  squareGridLines,
  squareNeighbors,
} from '@/core/grid';
import { Field, Section, Segmented, Toggle } from '@/ui';

type Kind = 'square' | HexOrientation;
const W = 320;
const H = 200;
const SIZE = 32;

const KIND_OPTIONS = [
  { value: 'square', label: '方格' },
  { value: 'flat', label: '六角格（平頂）' },
  { value: 'pointy', label: '六角格（尖頂）' },
] as const;

export function GridDemo() {
  const [kind, setKind] = useState<Kind>('flat');
  const [fit, setFit] = useState(false);
  const [hover, setHover] = useState<Axial | null>(null);
  const [origin, setOrigin] = useState<Axial>({ q: 2, r: 1 });
  const ref = useRef<HTMLCanvasElement>(null);
  const m = kind === 'square' ? null : hexMetrics(SIZE, { orientation: kind, fit });

  const cellAt = (x: number, y: number): Axial => {
    if (!m) {
      const c = squareCellAt(x, y, SIZE);
      return { q: c.col, r: c.row };
    }
    return pixelToAxial(x, y, m);
  };
  const corners = (a: Axial) =>
    m ? hexCorners(axialCenter(a.q, a.r, m), m) : squareCorners(a.q, a.r, SIZE);
  const distance = (a: Axial, b: Axial) =>
    m ? axialDistance(a, b) : squareDistance(a.q - b.q, a.r - b.r, 'chebyshev');

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#b79ce0';
    const muted = css.getPropertyValue('--border-strong').trim() || '#666';
    ctx.clearRect(0, 0, W, H);
    const fill = (a: Axial, alpha: number) => {
      const p = corners(a);
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (const v of p.slice(1)) ctx.lineTo(v.x, v.y);
      ctx.closePath();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    if (hover) {
      const nb = m
        ? hexNeighbors(hover.q, hover.r, m.orientation)
        : squareNeighbors(hover.q, hover.r).map((c) => ({ q: c.col, r: c.row }));
      for (const n of nb) fill(n, 0.25);
      fill(hover, 0.55);
    }
    fill(origin, 1);
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const view = { left: 0, top: 0, right: W, bottom: H };
    if (m) {
      for (const line of hexGridPolylines(view, m)) {
        ctx.moveTo(line[0].x, line[0].y);
        for (const v of line.slice(1)) ctx.lineTo(v.x, v.y);
      }
    } else {
      for (const s of squareGridLines(view, SIZE)) {
        ctx.moveTo(s.from.x, s.from.y);
        ctx.lineTo(s.to.x, s.to.y);
      }
    }
    ctx.stroke();
  });

  const toCell = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = clientToCanvas(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), W, H);
    return cellAt(p.x, p.y);
  };

  return (
    <Section title="格子幾何（core/grid）">
      <Field label="形狀">
        <Segmented
          value={kind}
          onValueChange={(v) => {
            setKind(v);
            setHover(null);
          }}
          options={KIND_OPTIONS}
          size="sm"
        />
      </Field>
      <Field label="網格化（CCFOLIA 用）" layout="inline">
        <Toggle checked={fit} onCheckedChange={setFit} disabled={kind === 'square'} />
      </Field>
      <canvas
        ref={ref}
        width={W}
        height={H}
        className="block w-full max-w-80 cursor-crosshair rounded-sm bg-surface-2"
        aria-label="格子幾何的示範：滑過看所在的格子與鄰格，點一下設為起點"
        role="img"
        onPointerMove={(e) => setHover(toCell(e))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => setOrigin(toCell(e))}
      />
      <p className="m-0 text-sm tabular-nums" data-testid="grid-demo-info">
        起點 ({origin.q}, {origin.r})
        {hover
          ? `　滑鼠所在 (${hover.q}, ${hover.r})，距離 ${distance(hover, origin)} 格`
          : '　把滑鼠移到格子上'}
      </p>
      <p className="m-0 text-xs text-muted">
        像素↔格子（pixelToAxial、squareCellAt）、鄰格（hexNeighbors）、步數距離（axialDistance；方格用切比雪夫）、
        可見範圍的格線（hexGridPolylines：每格只畫 3 條邊）。網格產生器、距離量尺與地圖編輯器共用。
      </p>
    </Section>
  );
}
