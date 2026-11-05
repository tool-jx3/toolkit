/**
 * 介面用的小圖：素材按鈕的圖示、地形按鈕的預覽（用地圖上同樣的花紋與圖案，跟著主題的顏色）、地圖的縮圖。
 */
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
    if (paint === FOREST) {
      const spots: [number, number][] = [
        [42, 35],
        [91, 32],
        [139, 38],
        [24, 66],
        [69, 62],
        [117, 67],
        [158, 71],
        [43, 92],
        [91, 94],
        [139, 98],
      ];
      spots.forEach(([x, y], i) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.95, 0.95);
        drawTree(ctx, deepForest(relief, 0.35), (i * 0.173) % 1, 0);
        ctx.restore();
      });
    } else if (paint === MOUNTAIN) {
      (
        [
          [49, 68],
          [99, 58],
          [139, 86],
          [72, 96],
        ] as const
      ).forEach(([x, y], i) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.9, 0.9);
        drawMountain(ctx, relief, 0.25 + i * 0.17, 0, 0);
        ctx.restore();
      });
    } else if (paint === MARSH) {
      for (const [x, y] of [
        [45, 55],
        [125, 80],
      ] as const) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.8, 0.8);
        drawReeds(ctx, buildColors(theme), relief.tree, 0);
        ctx.restore();
      }
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
