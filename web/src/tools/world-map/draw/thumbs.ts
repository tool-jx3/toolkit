/**
 * 介面用的小圖：素材按鈕的圖示、地形按鈕的預覽（用地圖上同樣的花紋與圖案，跟著主題的顏色）、地圖的縮圖。
 */

import { hash3 } from '../model/relief';
import { gridOf } from '../model/terrain';
import {
  CELL,
  FOREST,
  MARSH,
  MOUNTAIN,
  type Paint,
  type ThemeId,
  type WorldDoc,
} from '../model/types';
import { drawAsset } from './assets';
import { drawMountain, drawReeds, drawTree } from './marks';
import { buildColors, deepForest, reliefColors, THEMES } from './palette';
import { type Audience, deriveDoc, renderMap } from './render';
import { surfaceTile, TILE, tilePattern } from './surface';

const urls = new Map<string, string>();
function cachedUrl(key: string, make: () => string): string {
  let u = urls.get(key);
  if (!u) {
    if (urls.size > 200) urls.delete(urls.keys().next().value!);
    u = make();
    urls.set(key, u);
  }
  return u;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 素材的圖示（72 × 76 的範圍，2 倍解析度） */
export function assetIconUrl(kind: string, theme: ThemeId): string {
  return cachedUrl(`a:${kind}:${theme}`, () => {
    const c = canvas(144, 152);
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.scale(2, 2);
    ctx.translate(36, 40);
    drawAsset(ctx, kind, { theme });
    return c.toDataURL('image/png');
  });
}

/** 地形按鈕預覽的森林：三排樹的基準高度 */
const THUMB_TREE_ROWS = [30, 62, 94];
/** 山：後排兩座大的、前排三座（x、y、縮放） */
const THUMB_PEAKS: readonly (readonly [number, number, number])[] = [
  [64, 62, 0.95],
  [122, 66, 0.88],
  [32, 100, 0.74],
  [92, 104, 0.82],
  [152, 98, 0.76],
];
/** 濕地：三叢蘆葦 */
const THUMB_REEDS: readonly (readonly [number, number])[] = [
  [36, 44],
  [96, 76],
  [150, 48],
];

/** 地形按鈕的預覽（180 × 112） */
export function terrainThumbUrl(paint: Paint, theme: ThemeId): string {
  return cachedUrl(`t:${paint}:${theme}`, () => {
    const c = canvas(180, 112);
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    const ground = paint === FOREST || paint === MOUNTAIN ? 1 : (paint as 1 | 4 | 5 | 6);
    ctx.fillStyle = THEMES[theme].surface[ground];
    ctx.fillRect(0, 0, 180, 112);
    const tile = surfaceTile(ground, 701, 1);
    const p = tilePattern(ctx, tile, TILE * 0.55);
    if (p) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = p;
      ctx.fillRect(0, 0, 180, 112);
      ctx.fillRect(0, 0, 180, 112);
    }
    const relief = reliefColors(theme);
    const stamp = (x: number, y: number, k: number, draw: () => void) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      draw();
      ctx.restore();
    };
    if (paint === FOREST) {
      /* 三排交錯、每 36 px 一棵，位置與樣式用雜湊稍微打散；由上往下畫（前面的蓋住後面的） */
      const leaves = deepForest(relief, 0.35);
      THUMB_TREE_ROWS.forEach((y, row) => {
        for (let col = 0, x = row % 2 ? 40 : 22; x < 180; x += 36, col++) {
          const dx = (hash3(col, row, 11) - 0.5) * 6;
          const dy = (hash3(col, row, 23) - 0.5) * 4;
          stamp(x + dx, y + dy, 0.9, () => drawTree(ctx, leaves, hash3(col, row, 37), 0));
        }
      });
    } else if (paint === MOUNTAIN) {
      for (const [x, y, k] of THUMB_PEAKS)
        stamp(x, y, k, () => drawMountain(ctx, relief, hash3(x, y, 5), 0, 0));
    } else if (paint === MARSH) {
      const ui = buildColors(theme);
      for (const [x, y] of THUMB_REEDS) stamp(x, y, 0.72, () => drawReeds(ctx, ui, relief.tree, 0));
    }
    return c.toDataURL('image/png');
  });
}

/** 整張地圖的縮圖（範本卡片、主題的預覽、匯出的預覽）；key 是 null 時不快取 */
export function docThumbUrl(
  doc: WorldDoc,
  width: number,
  key: string | null,
  audience: Audience = 'player',
): string {
  const make = () => {
    const W = doc.cols * CELL;
    const k = width / W;
    const c = canvas(width, Math.round(doc.rows * CELL * k));
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.scale(k, k);
    renderMap(
      ctx,
      doc,
      deriveDoc(doc, () => gridOf(doc)),
      {
        audience,
        scale: Math.max(0.5, k),
        vector: false,
      },
    );
    return c.toDataURL('image/png');
  };
  return key === null ? make() : cachedUrl(`d:${key}:${width}`, make);
}
