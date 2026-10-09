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
  loopsToSvgPath,
  MAP_GRID_TYPES,
  type MapGridType,
  mapGrid,
  nearestSnap,
  type Point,
  pixelToAxial,
  squareCellAt,
  squareCorners,
  squareDistance,
  squareEdgeRuns,
  squareGridLines,
  squareNeighbors,
  subtractSpans,
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

/** 選項直接寫種類的代號（同一頁上面的示範已經有「方格」等選項，名稱不重複） */
const MAP_GRID_LABELS: Record<MapGridType, string> = {
  square: 'square',
  'hex-flat': 'hex-flat',
  'hex-flat-fit': 'hex-flat-fit',
  'hex-pointy': 'hex-pointy',
  'hex-pointy-fit': 'hex-pointy-fit',
};

/**
 * mapGrid（地圖編輯器的網格種類）：點格子塗色、同色的格子合成一個外框（evenodd，挖空的洞）、滑鼠附近的吸附點。
 */
export function MapGridDemo() {
  const [type, setType] = useState<MapGridType>('hex-flat');
  const [cells, setCells] = useState<Map<string, { col: number; row: number }>>(() => new Map());
  const [snap, setSnap] = useState<Point | null>(null);
  const g = mapGrid(type, 28);
  const d = loopsToSvgPath(g.outline([...cells.values()]));

  const toPoint = (e: PointerEvent<SVGSVGElement>) =>
    clientToCanvas(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), W, H);

  return (
    <Section title="地圖的網格種類（core/grid 的 mapGrid）">
      <Segmented
        value={type}
        onValueChange={(v) => {
          setType(v);
          setCells(new Map());
        }}
        options={MAP_GRID_TYPES.map((v) => ({ value: v, label: MAP_GRID_LABELS[v] }))}
        size="sm"
        aria-label="網格種類"
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full max-w-80 cursor-crosshair rounded-sm bg-surface-2"
        role="img"
        aria-label="點格子塗色（再點一次擦掉），同色的格子合成一個外框；青色方框是最近的吸附點"
        onPointerMove={(e) => {
          const p = toPoint(e);
          setSnap(
            nearestSnap(g.snapPoints(p.x, p.y), p.x, p.y, 10, {
              intersection: true,
              center: true,
              midpoint: true,
            }),
          );
        }}
        onPointerLeave={() => setSnap(null)}
        onPointerDown={(e) => {
          const p = toPoint(e);
          const c = g.cellAt(p.x, p.y);
          const key = g.cellKey(c.col, c.row);
          setCells((prev) => {
            const next = new Map(prev);
            if (next.has(key)) next.delete(key);
            else next.set(key, c);
            return next;
          });
        }}
        data-testid="map-grid-demo"
      >
        <title>地圖的網格種類</title>
        {d ? (
          <path
            d={d}
            fill="var(--accent)"
            fillOpacity={0.5}
            fillRule="evenodd"
            stroke="var(--accent)"
          />
        ) : null}
        <path
          d={g
            .gridLines({ left: 0, top: 0, right: W, bottom: H })
            .map((l) => `M${l.map((q) => `${q.x} ${q.y}`).join('L')}`)
            .join('')}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
        {snap ? (
          <rect
            x={snap.x - 4}
            y={snap.y - 4}
            width={8}
            height={8}
            fill="none"
            stroke="#00bcd4"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>
      <p className="m-0 text-sm tabular-nums" data-testid="map-grid-demo-info">
        已塗 {cells.size} 格；外框 {g.outline([...cells.values()]).length} 條迴圈
      </p>
      <p className="m-0 text-xs text-muted">
        mapGrid(種類, 大小)
        把方格與四種六角格包成同一組介面：cellAt、cellPath、outline（合併外框）、neighbors、
        snapPoints（交點、格子中心、邊的中點）、snapDelta（整格移動）、gridLines。地圖編輯器用。
      </p>
    </Section>
  );
}

const EDGE_COLS = 10;
const EDGE_ROWS = 6;
const EDGE_CELL = 30;
/** 0＝空、1＝房間 A、2＝房間 B（點一下輪流換） */
const EDGE_START = [
  '1111122200',
  '1111122200',
  '1111122200',
  '1111111100',
  '1111111100',
  '0000000000',
].map((row) => Array.from(row, Number));
const EDGE_FILL = ['transparent', 'var(--accent)', 'var(--warning)'];

/**
 * squareEdgeRuns＋subtractSpans（室內平面圖的自動牆壁）：格子的主人決定每條邊——兩個房間之間是內牆（細）、
 * 房間與外面之間是外牆（粗）；同一條線上相鄰、同種類的邊接成一段。「門」把第一段內牆中間切開 1 格。
 */
export function EdgeRunsDemo() {
  const [cells, setCells] = useState(EDGE_START);
  const [door, setDoor] = useState(true);
  const runs = squareEdgeRuns(
    { x0: 0, y0: 0, x1: EDGE_COLS, y1: EDGE_ROWS },
    (x, y) => cells[y]?.[x] || null,
    (a, b) => (a === b ? null : a && b ? 'int' : 'ext'),
  );
  const firstInt = runs.find((r) => r.kind === 'int');
  const pieces = runs.flatMap((r) => {
    if (!door || r !== firstInt) return [r];
    const mid = Math.floor((r.a + r.b) / 2);
    return subtractSpans([r], [[mid, mid + 1]]);
  });
  const S = EDGE_CELL;
  return (
    <Section title="自動牆壁（core/grid 的 squareEdgeRuns、subtractSpans）">
      <Field label="在第一段內牆開一扇門（subtractSpans）" layout="inline">
        <Toggle checked={door} onCheckedChange={setDoor} />
      </Field>
      <svg
        viewBox={`-6 -6 ${EDGE_COLS * S + 12} ${EDGE_ROWS * S + 12}`}
        className="block w-full max-w-80 cursor-pointer rounded-sm bg-surface-2"
        role="img"
        aria-label="點格子輪流換成房間 A、房間 B、空白；牆會自動重算"
        data-testid="edge-runs-demo"
      >
        <title>自動牆壁</title>
        {cells.flatMap((row, y) =>
          row.map((v, x) => (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: 固定大小的格子
              key={`${x},${y}`}
              x={x * S}
              y={y * S}
              width={S}
              height={S}
              fill={EDGE_FILL[v]}
              fillOpacity={v ? 0.35 : 0}
              stroke="var(--border)"
              strokeWidth={0.5}
              onPointerDown={() =>
                setCells((prev) =>
                  prev.map((r, yy) =>
                    yy === y ? r.map((c, xx) => (xx === x ? (c + 1) % 3 : c)) : r,
                  ),
                )
              }
            />
          )),
        )}
        {pieces.map((r) => (
          <line
            key={`${r.o}${r.c}:${r.a}-${r.b}`}
            x1={(r.o === 'h' ? r.a : r.c) * S}
            y1={(r.o === 'h' ? r.c : r.a) * S}
            x2={(r.o === 'h' ? r.b : r.c) * S}
            y2={(r.o === 'h' ? r.c : r.b) * S}
            stroke="var(--text)"
            strokeWidth={r.kind === 'ext' ? 6 : 3}
            strokeLinecap="square"
            pointerEvents="none"
          />
        ))}
      </svg>
      <p className="m-0 text-sm tabular-nums" data-testid="edge-runs-demo-info">
        外牆 {pieces.filter((r) => r.kind === 'ext').length} 段、內牆{' '}
        {pieces.filter((r) => r.kind === 'int').length} 段
      </p>
    </Section>
  );
}
