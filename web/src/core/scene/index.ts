/**
 * core/scene：版型畫布（G7 介紹圖與宣傳共用）。
 *
 * 版型用「場景節點」描述畫面（矩形、線、圖片、文字、格式化文字、群組、自訂繪圖），每個節點可以帶一個點選區（hit），
 * 預覽與匯出用同一段繪圖程式（drawScene），所見即所得；點選與貼紙的拖曳控點由 `@/ui` 的 LayoutCanvas 疊在預覽上處理。
 *
 * ```ts
 * const nodes: SceneNode[] = [
 *   { kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, fill: '#f4f2ee', hit: { key: 'bg', label: '背景' } },
 *   { kind: 'image', x: 80, y: 80, w: 200, h: 200, image: bmp, circle: true, hit: { key: 'left/profile', label: '頭像' } },
 *   { kind: 'text', x: 300, y: 90, w: 600, text: '名字', font: { family: 'Noto Sans TC', weight: 700, size: 48 }, color: '#323232', shrink: 0.5 },
 * ];
 * await loadSceneFonts(nodes);                      // Google 字型只下載用到的字
 * drawScene(ctx, nodes);                            // 預覽與匯出共用
 * const regions = collectHitRegions(nodes, ctx);    // 給 LayoutCanvas
 * for (const s of stickers) drawSticker(ctx, s, images[s.id], s);
 * ```
 */
import { ensureFont } from '../fonts';
import { makeCanvas } from '../image';
import { collectFonts, drawScene, type FontUse } from './draw';
import { clearTextCache } from './text';
import type { SceneNode, Size } from './types';

export * from './draw';
export * from './sticker';
export * from './text';
export * from './types';

const requested = new Map<string, Set<string>>();

/**
 * 載入場景用到的字型（每個字型＋字重只請求還沒請求過的字）；有新載入的字時清掉字寬快取並回傳 true（呼叫端重畫）。
 */
export async function loadSceneFonts(
  nodes: readonly SceneNode[] | readonly FontUse[],
): Promise<boolean> {
  const uses: FontUse[] =
    nodes.length && 'kind' in (nodes[0] as object)
      ? collectFonts(nodes as readonly SceneNode[])
      : (nodes as FontUse[]);
  const jobs: Promise<boolean>[] = [];
  for (const u of uses) {
    if (!u.family) continue;
    const key = `${u.family}\n${u.weight}`;
    let seen = requested.get(key);
    if (!seen) {
      seen = new Set();
      requested.set(key, seen);
    }
    const fresh = Array.from(u.text).filter((ch) => ch.trim() && !seen.has(ch));
    if (!fresh.length) continue;
    for (const ch of fresh) seen.add(ch);
    jobs.push(ensureFont(u.family, u.weight, fresh.join('')));
  }
  if (!jobs.length) return false;
  await Promise.all(jobs);
  clearTextCache();
  return true;
}

/** 畫成一張新的畫布（scale：倍率，例如存檔槽的 0.2 倍預覽、PDF 的 2 倍點陣） */
export function renderScene(
  size: Size,
  nodes: readonly SceneNode[],
  { scale = 1, after }: { scale?: number; after?: (ctx: CanvasRenderingContext2D) => void } = {},
): HTMLCanvasElement | OffscreenCanvas {
  const c = makeCanvas(
    Math.max(1, Math.round(size.width * scale)),
    Math.max(1, Math.round(size.height * scale)),
  );
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(scale, scale);
  drawScene(ctx, nodes);
  after?.(ctx);
  return c;
}

/** 讀一個像素的顏色（#rrggbb；透明處當白色底，與舊版的滴管相同） */
export function pixelHex(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  x: number,
  y: number,
): string {
  const px = makeCanvas(1, 1);
  const ctx = px.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1, 1);
  const ix = Math.min(canvas.width - 1, Math.max(0, Math.floor(x)));
  const iy = Math.min(canvas.height - 1, Math.max(0, Math.floor(y)));
  ctx.drawImage(canvas, ix, iy, 1, 1, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
