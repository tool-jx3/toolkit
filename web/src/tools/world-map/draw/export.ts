/**
 * 匯出 PNG：寬 1536／2400／3200／4096 px（高照地圖的比例）；公開用不畫 GM 專用的素材、路線與地名・備註
 * （國與地形兩種都一樣）。選取框、控制點、畫到一半的線都不會出現（PNG 是另外畫的）。
 */
import { ensureFont } from '@/core/fonts';
import { gridOf } from '../model/terrain';
import { CELL, type FontStyle, type WorldDoc } from '../model/types';
import { FONT_FAMILY } from './labels';
import { type Audience, deriveDoc, renderMap } from './render';

export const EXPORT_WIDTHS = [1536, 2400, 3200, 4096] as const;
export type ExportWidth = (typeof EXPORT_WIDTHS)[number];
export const DEFAULT_EXPORT_WIDTH: ExportWidth = 2400;

export const exportSize = (doc: Pick<WorldDoc, 'cols' | 'rows'>, width: number) => ({
  width,
  height: Math.round((width * doc.rows) / doc.cols),
});

/** 地圖上用到的字（只下載用到的字） */
export function mapText(doc: WorldDoc): string {
  return [
    doc.title,
    doc.settings.subtitle,
    'N0123456789.,km[GM] ',
    ...doc.regions.map((r) => r.name),
    ...doc.objects.map((o) => o.name),
    ...doc.notes.map((n) => n.text),
  ].join('');
}

/** 畫之前先載好用到的字型（載不到時用替代字型，不會卡住） */
export async function ensureMapFonts(doc: WorldDoc): Promise<void> {
  const styles = new Set<FontStyle>([doc.settings.font, 'sans']);
  for (const r of doc.regions) if (r.font !== 'auto') styles.add(r.font);
  for (const n of doc.notes) if (n.font !== 'auto') styles.add(n.font);
  const text = mapText(doc);
  await Promise.all(
    [...styles].flatMap((s) =>
      s === 'rounded'
        ? [ensureFont(FONT_FAMILY[s], 400, text, { timeoutMs: 5000 })]
        : [500, 600, 700].map((w) => ensureFont(FONT_FAMILY[s], w, text, { timeoutMs: 5000 })),
    ),
  );
}

export { secretCount } from '../model/visibility';

export function renderPngCanvas(
  doc: WorldDoc,
  width: number,
  audience: Audience,
): HTMLCanvasElement {
  const { height } = exportSize(doc, width);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const k = width / (doc.cols * CELL);
  ctx.scale(k, k);
  const d = deriveDoc(doc, () => gridOf(doc));
  renderMap(ctx, doc, d, { audience, scale: k, vector: true });
  return c;
}

export function safeTitle(title: string): string {
  return (
    title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\p{Cc}/gu, '_')
      .trim()
      .slice(0, 70) || '世界地圖'
  );
}

export const pngName = (doc: WorldDoc, audience: Audience): string =>
  `${safeTitle(doc.title)}_${audience === 'gm' ? 'GM用' : '公開用'}.png`;
