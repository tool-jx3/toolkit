/**
 * 圖框與標題欄（本站自己的版面）：外框兩道線；上方左邊是小標「建築斷面圖」、作品名（明朝）、副標題・環境・淹水；
 * 上方右邊是給誰看的標籤（GM 用／PL 用／公開差分用）；下方左邊是比例與樓層數，右邊是比例尺（0、2、4 m）。
 * 也包括左邊的樓層標示（樓層代號、樓板的高度、GL ±0.0）。
 */
import type { Layout, Rect } from '../model/layout';
import { type Audience, CELL_M, type EnvId, floorCode, type SectionDoc } from '../model/types';
import { S } from '../strings';
import { box, type Kit, poly, seg } from './kit';
import { alpha } from './palette';
import { drawText, fitText, SANS, SERIF, textWidth } from './text';

/** 圖框的留白（格）：上（標題欄）、下、左右 */
export const SHEET_PAD = {
  framed: { top: 3.8, bottom: 2.1, side: 1.5 },
  plain: { top: 0.8, bottom: 0.8, side: 0.6 },
} as const;

/** 整張紙的範圍 */
export function sheetRect(L: Layout, framed: boolean): Rect {
  const pad = framed ? SHEET_PAD.framed : SHEET_PAD.plain;
  const w = L.world;
  return {
    x: w.x - pad.side,
    y: w.y - pad.top,
    w: w.w + pad.side * 2,
    h: w.h + pad.top + pad.bottom,
  };
}

const fmtM = (v: number) => {
  const r = Math.round(v * 10) / 10;
  if (Math.abs(r) < 0.05) return '±0.0';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}`;
};

/** 左邊的樓層標示：代號、樓板的高度（以 GL 為 0）、GL 的記號 */
export function drawElevation(k: Kit, L: Layout): void {
  const { p } = k;
  for (const f of L.floors) {
    const my = f.y0 + (f.y1 - f.y0) / 2;
    const under = f.floor.level < 0;
    const bg = under ? p.earth[0] : p.paper;
    const fg = under && !p.dark && p.id === 'color' ? '#f1e9d2' : p.ink;
    seg(k, -0.45, f.y0, 0, f.y0, 0.04);
    box(k, -3.45, my - 0.6, 2.65, 1.2, bg, 0.04, p.ink, 0.18);
    drawText(k.c, floorCode(f.floor.level), -2.12, my - 0.02, {
      size: 0.56,
      weight: 700,
      align: 'center',
      baseline: 'middle',
      color: fg,
    });
    drawText(k.c, `FL ${fmtM((L.glY - f.y1) * CELL_M)}`, -2.12, my + 0.38, {
      size: 0.22,
      align: 'center',
      baseline: 'middle',
      color: alpha(fg, 0.8),
    });
  }
  const gx = -0.55;
  poly(k, [gx, L.glY, gx - 0.4, L.glY - 0.4, gx + 0.4, L.glY - 0.4], p.brass, 0.03);
  box(k, -3.7, L.glY - 0.7, 2.6, 0.6, p.paper, 0.035, p.ink, 0.14);
  drawText(k.c, 'GL ±0.0', -2.4, L.glY - 0.39, {
    size: 0.36,
    weight: 700,
    align: 'center',
    baseline: 'middle',
    color: p.ink,
  });
}

export interface FrameInfo {
  audience: Audience;
  env: EnvId;
  flood: number;
}

export function drawFrame(k: Kit, doc: SectionDoc, sheet: Rect, info: FrameInfo): void {
  const { c, p } = k;
  const x0 = sheet.x + 0.55;
  const y0 = sheet.y + 0.55;
  const w = sheet.w - 1.1;
  const h = sheet.h - 1.1;
  box(k, x0, y0, w, h, null, 0.05, alpha(p.ink, 0.55));
  box(k, x0 + 0.16, y0 + 0.16, w - 0.32, h - 0.32, null, 0.02, alpha(p.ink, 0.35));
  const left = sheet.x + 1.1;
  const right = sheet.x + sheet.w - 1.1;
  /* 右上：給誰看 */
  const tag = S.frame.audience[info.audience];
  const tw = textWidth(c, tag, { size: 0.34, weight: 700 }) + 0.6;
  box(
    k,
    right - tw,
    sheet.y + 1.0,
    tw,
    0.62,
    info.audience === 'gm' ? alpha(p.gm, 0.2) : null,
    0.035,
    p.ink,
    0.1,
  );
  drawText(c, tag, right - tw / 2, sheet.y + 1.32, {
    size: 0.34,
    weight: 700,
    align: 'center',
    baseline: 'middle',
    color: p.ink,
  });
  const room = right - tw - 0.6 - left;
  drawText(c, S.frame.caption, left, sheet.y + 1.3, {
    size: 0.32,
    color: alpha(p.ink, 0.72),
    tracking: 0.35,
  });
  drawText(
    c,
    fitText(c, doc.title, room, { size: 1.02, weight: 600, family: SERIF }),
    left,
    sheet.y + 2.42,
    {
      size: 1.02,
      weight: 600,
      family: SERIF,
      color: p.ink,
    },
  );
  const meta = [doc.subtitle, S.envs[info.env], info.flood > 0 ? S.frame.flood(info.flood) : '']
    .filter(Boolean)
    .join('　·　');
  drawText(c, fitText(c, meta, sheet.w - 2.2, { size: 0.36 }), left, sheet.y + 3.12, {
    size: 0.36,
    color: alpha(p.ink, 0.7),
  });
  /* 下方：比例、樓層數、比例尺 */
  const fy = sheet.y + sheet.h - 1.05;
  const above = doc.building.floors.filter((f) => f.level > 0).length;
  const below = doc.building.floors.length - above;
  drawText(c, S.frame.scale(above, below), left, fy, {
    size: 0.32,
    color: alpha(p.ink, 0.65),
    family: SANS,
  });
  const unit = 1 / CELL_M;
  const sx = right - 4 * unit;
  c.lineWidth = 0.05;
  c.strokeStyle = p.ink;
  c.beginPath();
  c.moveTo(sx, fy - 0.08);
  c.lineTo(sx + 4 * unit, fy - 0.08);
  for (const m of [0, 2, 4]) {
    c.moveTo(sx + m * unit, fy - 0.3);
    c.lineTo(sx + m * unit, fy + 0.06);
  }
  c.stroke();
  box(k, sx, fy - 0.16, 2 * unit, 0.08, p.ink, 0);
  for (const m of [0, 2, 4])
    drawText(c, m === 4 ? '4 m' : String(m), sx + m * unit, fy + 0.42, {
      size: 0.28,
      align: m === 0 ? 'left' : m === 4 ? 'right' : 'center',
      color: p.ink,
    });
}
