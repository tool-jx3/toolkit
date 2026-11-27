/**
 * 縮圖：設備卡片（彩色樣式、置中）、範例與匯出的預覽（地圖本體或整張）。同一個鍵只畫一次。
 */
import { fixtureDef } from '../model/catalog';
import { layoutOf } from '../model/layout';
import type { SectionDoc } from '../model/types';
import { drawFixture } from './fixtures';
import { paletteOf } from './palette';
import { type Crop, drawScene, type SceneOpts, sceneRect } from './render';

const cache = new Map<string, string>();

export function fixtureThumb(kind: string, size = 96): string {
  const key = `fx:${kind}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = fixtureDef(kind);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx || !def) return '';
  const pad = 0.3;
  const span = Math.max(def.width, def.height) + pad * 2;
  const k = size / span;
  ctx.setTransform(k, 0, 0, k, size / 2, size / 2 + (def.height / 2) * k);
  drawFixture({ c: ctx, p: paletteOf('color') }, kind, { broken: false, env: 'day', ceil: null });
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** 斷面圖的縮圖（寬 width px） */
export function docThumb(
  doc: SectionDoc,
  width: number,
  o: Omit<SceneOpts, 'crop'> & { crop?: Crop },
  key?: string,
): string {
  if (key && cache.has(key)) return cache.get(key) ?? '';
  const L = layoutOf(doc);
  const crop = o.crop ?? 'map';
  const b = sceneRect(doc, L, crop);
  const k = width / b.w;
  const c = document.createElement('canvas');
  c.width = Math.round(width);
  c.height = Math.round(b.h * k);
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
  drawScene(ctx, doc, L, { ...o, crop });
  const url = c.toDataURL('image/png');
  if (key) cache.set(key, url);
  return url;
}
