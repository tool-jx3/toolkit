/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 修改畫布尺寸（原作的 openCanvasSizePanel）：寬、高、九宮格基準點；預覽框（舊畫布、角色點、新範圍），
 * 四角四邊拖曳改大小、框內拖曳＝平移；重設；確定後角色跟著新原點平移。
 */
import { useRef, useState } from 'react';
import { type Anchor, AnchorGrid, anchorAxes, Button, Dialog, Field, NumberInput } from '@/ui';
import { resizeCanvas } from '../../logic/layout';
import type { Sheet } from '../../model/types';
import { editSheet } from '../../state/actions';
import { setUi, useUi } from '../../state/store';
import { S } from '../../strings';
import { useSheet } from '../hooks';
import { fitView } from '../view';

const C = S.canvas;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const AX = { left: 0, center: 0.5, right: 1, top: 0, bottom: 1 } as const;

function rectFor(sheet: Sheet, w: number, h: number, anchor: Anchor): Rect {
  const a = anchorAxes(anchor);
  return {
    x: Math.round((sheet.W - w) * AX[a.x]),
    y: Math.round((sheet.H - h) * AX[a.y]),
    w,
    h,
  };
}

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function Preview({ sheet, rect, onRect }: { sheet: Sheet; rect: Rect; onRect: (r: Rect) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ h: Handle; px: number; py: number; r: Rect } | null>(null);
  const minX = Math.min(0, rect.x);
  const minY = Math.min(0, rect.y);
  const maxX = Math.max(sheet.W, rect.x + rect.w);
  const maxY = Math.max(sheet.H, rect.y + rect.h);
  const m = Math.max(maxX - minX, maxY - minY) * 0.08 + 10;
  const vb = { x: minX - m, y: minY - m, w: maxX - minX + m * 2, h: maxY - minY + m * 2 };
  const k = vb.w / 320;
  const toSvg = (cx: number, cy: number) => {
    const el = ref.current;
    const r = el?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const s = Math.max(vb.w / r.width, vb.h / r.height);
    const ox = (r.width - vb.w / s) / 2;
    const oy = (r.height - vb.h / s) / 2;
    return { x: vb.x + (cx - r.left - ox) * s, y: vb.y + (cy - r.top - oy) * s };
  };
  const start = (h: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    drag.current = { h, px: p.x, py: p.y, r: rect };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e.clientX, e.clientY);
    const dx = Math.round(p.x - d.px);
    const dy = Math.round(p.y - d.py);
    let { x, y, w, h } = d.r;
    if (d.h === 'move') {
      x += dx;
      y += dy;
    } else {
      if (d.h.includes('e')) w = Math.max(0, w + dx);
      if (d.h.includes('s')) h = Math.max(0, h + dy);
      if (d.h.includes('w')) {
        const nw = Math.max(0, w - dx);
        x += w - nw;
        w = nw;
      }
      if (d.h.includes('n')) {
        const nh = Math.max(0, h - dy);
        y += h - nh;
        h = nh;
      }
    }
    onRect({ x, y, w, h });
  };
  const hs = 9 * k;
  const handles: [Handle, number, number][] = [
    ['nw', rect.x, rect.y],
    ['n', rect.x + rect.w / 2, rect.y],
    ['ne', rect.x + rect.w, rect.y],
    ['e', rect.x + rect.w, rect.y + rect.h / 2],
    ['se', rect.x + rect.w, rect.y + rect.h],
    ['s', rect.x + rect.w / 2, rect.y + rect.h],
    ['sw', rect.x, rect.y + rect.h],
    ['w', rect.x, rect.y + rect.h / 2],
  ];
  const cursor: Record<Handle, string> = {
    move: 'move',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
  };
  return (
    <svg
      ref={ref}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className="h-56 w-full touch-none rounded-md border border-border bg-surface-2"
      role="img"
      aria-label={C.previewLabel}
      onPointerMove={move}
      onPointerUp={() => {
        drag.current = null;
      }}
      data-testid="canvas-preview"
    >
      <rect x={0} y={0} width={sheet.W} height={sheet.H} fill="var(--surface-3)" />
      {sheet.chars.map((c) => (
        <circle key={c.id} cx={c.x} cy={c.y} r={Math.max(4 * k, 14)} fill="var(--text-muted)" />
      ))}
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="var(--accent-soft)"
        stroke="var(--accent)"
        strokeWidth={2 * k}
        strokeDasharray={`${6 * k} ${4 * k}`}
        style={{ cursor: 'move' }}
        onPointerDown={start('move')}
      />
      <line
        x1={rect.x + rect.w / 2 - 8 * k}
        y1={rect.y + rect.h / 2}
        x2={rect.x + rect.w / 2 + 8 * k}
        y2={rect.y + rect.h / 2}
        stroke="var(--accent)"
        strokeWidth={1.5 * k}
      />
      <line
        x1={rect.x + rect.w / 2}
        y1={rect.y + rect.h / 2 - 8 * k}
        x2={rect.x + rect.w / 2}
        y2={rect.y + rect.h / 2 + 8 * k}
        stroke="var(--accent)"
        strokeWidth={1.5 * k}
      />
      {handles.map(([h, x, y]) => (
        <rect
          key={h}
          x={x - hs / 2}
          y={y - hs / 2}
          width={hs}
          height={hs}
          fill="var(--surface)"
          stroke="var(--accent)"
          strokeWidth={1.5 * k}
          style={{ cursor: cursor[h] }}
          onPointerDown={start(h)}
        />
      ))}
    </svg>
  );
}

function Body({ onDone }: { onDone: () => void }) {
  const sheet = useSheet();
  const [anchor, setAnchor] = useState<Anchor>('center');
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: sheet.W, h: sheet.H });
  const setSize = (w: number, h: number) => setRect(rectFor(sheet, w, h, anchor));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={C.width}>
          <NumberInput
            value={rect.w}
            min={0}
            max={100000}
            unit="px"
            onChange={(v) => setSize(Math.round(v), rect.h)}
            data-testid="canvas-w"
          />
        </Field>
        <Field label={C.height}>
          <NumberInput
            value={rect.h}
            min={0}
            max={100000}
            unit="px"
            onChange={(v) => setSize(rect.w, Math.round(v))}
            data-testid="canvas-h"
          />
        </Field>
        <Field label={C.anchor}>
          <AnchorGrid
            value={anchor}
            onValueChange={(a) => {
              setAnchor(a);
              setRect(rectFor(sheet, rect.w, rect.h, a));
            }}
          />
        </Field>
      </div>
      <Preview sheet={sheet} rect={rect} onRect={setRect} />
      <p className="text-xs text-muted">{C.hint}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setRect({ x: 0, y: 0, w: sheet.W, h: sheet.H })}>
          {C.reset}
        </Button>
        <Button onClick={onDone}>{S.layout.cancel}</Button>
        <Button
          variant="primary"
          onClick={() => {
            editSheet((s) => resizeCanvas(s as Sheet, rect));
            onDone();
            requestAnimationFrame(fitView);
          }}
          data-testid="canvas-ok"
        >
          {C.ok}
        </Button>
      </div>
    </div>
  );
}

export function CanvasDialog() {
  const open = useUi((u) => u.dialog === 'canvas');
  const close = () => setUi({ dialog: null });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={C.title} size="md">
      {open ? <Body onDone={close} /> : null}
    </Dialog>
  );
}
