/**
 * 作圖預覽時的測量顯示（規格 F039）：白字黑框的格數、黑底白線的寸法線，大小固定在螢幕上（除以縮放）。
 * 產生的物件都是預覽（不存檔、不能點），由引擎在每次預覽更新時整批換掉。
 */
import { Circle, type FabricObject, FabricText, Line } from 'fabric';
import { fmtCells, labelAngle, type Pt, segmentAngle } from '../geometry';
import type { MapObj } from './objects';

const PREVIEW = {
  selectable: false,
  evented: false,
  objectCaching: false,
  excludeFromExport: true,
} as const;

function mark<T extends FabricObject>(o: T): T {
  (o as unknown as MapObj).isPreview = true;
  return o;
}

export class Hud {
  out: FabricObject[] = [];
  constructor(
    private zoom: number,
    private cellSize: number,
  ) {}

  private label(text: string, x: number, y: number, angle = 0): void {
    const z = this.zoom || 1;
    this.out.push(
      mark(
        new FabricText(text, {
          left: x,
          top: y,
          originX: 'center',
          originY: 'center',
          fontSize: 20 / z,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: '#ffffff',
          stroke: '#000000',
          strokeWidth: 4 / z,
          paintFirst: 'stroke',
          angle,
          ...PREVIEW,
        }),
      ),
    );
  }

  /** 黑色外框＋白線的細線（背景深淺都看得見） */
  seg(x1: number, y1: number, x2: number, y2: number, dashed = false): void {
    const z = this.zoom || 1;
    const make = (w: number, color: string) =>
      mark(
        new Line([x1, y1, x2, y2], {
          stroke: color,
          strokeWidth: w / z,
          strokeLineCap: 'round',
          strokeDashArray: dashed ? [6 / z, 4 / z] : null,
          ...PREVIEW,
        }),
      );
    this.out.push(make(3, 'rgba(0,0,0,0.85)'), make(1, '#ffffff'));
  }

  private dimH(x1: number, x2: number, y: number, text: string): void {
    if (Math.abs(x2 - x1) < 1) return;
    const t = 6 / (this.zoom || 1);
    this.seg(x1, y, x2, y);
    this.seg(x1, y - t, x1, y + t);
    this.seg(x2, y - t, x2, y + t);
    this.label(text, (x1 + x2) / 2, y - 9 / (this.zoom || 1), 0);
  }

  private dimV(y1: number, y2: number, x: number, text: string): void {
    if (Math.abs(y2 - y1) < 1) return;
    const t = 6 / (this.zoom || 1);
    this.seg(x, y1, x, y2);
    this.seg(x - t, y1, x + t, y1);
    this.seg(x - t, y2, x + t, y2);
    this.label(text, x - 9 / (this.zoom || 1), (y1 + y2) / 2, -90);
  }

  /** 外接框：上方寬、左側高 */
  box(left: number, top: number, w: number, h: number): void {
    if (w < 1 && h < 1) return;
    const gap = 16 / (this.zoom || 1);
    this.dimH(left, left + w, top - gap, fmtCells(w, this.cellSize));
    this.dimV(top, top + h, left - gap, fmtCells(h, this.cellSize));
  }

  /** 正圓：中心到游標的虛線＋「r <格數>」 */
  radius(cx: number, cy: number, px: number, py: number): void {
    const r = Math.hypot(px - cx, py - cy);
    if (r < 1) return;
    this.seg(cx, cy, px, py, true);
    this.label(`r ${fmtCells(r, this.cellSize)}`, (cx + px) / 2, (cy + py) / 2, 0);
  }

  /** 一段：寬、高（＋沿線的長度與角度） */
  segment(x1: number, y1: number, x2: number, y2: number, withLength = true): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    this.box(Math.min(x1, x2), Math.min(y1, y2), Math.abs(dx), Math.abs(dy));
    if (!withLength) return;
    const off = 12 / (this.zoom || 1);
    const mx = (x1 + x2) / 2 + (dy / len) * off;
    const my = (y1 + y2) / 2 + (-dx / len) * off;
    this.label(
      `${fmtCells(len, this.cellSize)} 格 ∠${segmentAngle(dx, dy)}°`,
      mx,
      my,
      labelAngle(dx, dy),
    );
  }

  /** 曲線：控制點（白點）與連線（虛線）；封閉時從最後一點連回第一點 */
  controlPolygon(points: readonly Pt[], current: Pt | null, closed: boolean): void {
    if (!points.length) return;
    const z = this.zoom || 1;
    const all = current ? [...points, current] : [...points];
    for (let i = 0; i < all.length - 1; i++)
      this.seg(all[i].x, all[i].y, all[i + 1].x, all[i + 1].y, true);
    if (closed && all.length >= 2) {
      const last = all[all.length - 1];
      this.seg(last.x, last.y, all[0].x, all[0].y, true);
    }
    for (const p of points)
      this.out.push(
        mark(
          new Circle({
            left: p.x,
            top: p.y,
            originX: 'center',
            originY: 'center',
            radius: 4 / z,
            fill: '#ffffff',
            stroke: '#000000',
            strokeWidth: 1.5 / z,
            ...PREVIEW,
          }),
        ),
      );
  }
}

/** 物件標成預覽（不存檔、不能點） */
export function asPreview<T extends FabricObject>(o: T): T {
  o.set({ ...PREVIEW });
  return mark(o);
}
