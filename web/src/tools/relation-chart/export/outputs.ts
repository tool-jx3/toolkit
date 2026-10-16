/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 匯出（規格 3.1～3.3、3.5）：PNG（可去背）、分層 SVG（Inkscape 圖層）、分層 PSD、互動網頁；
 * 多張分頁打包成 ZIP。檔名規則照原作。
 */
import { loadAgPsd } from '@/core/decode';
import { safeFileName, zipFiles } from '@/core/files';
import { exportLayers, exportSvg } from '../engine/chart';
import { esc, FONT_STACKS, sheetName } from '../engine/geom';
import type { FontKey, Label, Sheet } from '../model/types';
import { svgToCanvas, svgToPng } from './raster';
import { viewerHtml } from './viewer';

export type ExportFormat = 'png' | 'svg' | 'psd' | 'html';

export interface ExportInput {
  sheets: readonly Sheet[];
  font: FontKey;
  labels: readonly Label[];
  /** 資產 id → data URI */
  uris: ReadonlyMap<string, string>;
  transparent: boolean;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
}

/** 用到內建角色圖示時，SVG 裡的出處註解 */
export const ICON_CREDIT =
  '角色圖示改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0）https://paitei4234.itch.io/relationshipchartmaker ・ https://creativecommons.org/licenses/by-nc-sa/4.0/';

const MULTI_BASE: Record<ExportFormat, string> = {
  png: '關係圖包',
  svg: '關係圖包_SVG',
  psd: '關係圖包_PSD',
  html: '角色關係圖_互動檢視',
};

/** 預設檔名（不含副檔名） */
export function defaultExportBase(
  format: ExportFormat,
  sheets: readonly Pick<Sheet, 'name' | 'defNo'>[],
  transparent: boolean,
): string {
  if (sheets.length !== 1) return MULTI_BASE[format];
  const name = sheetName(sheets[0]);
  if (format === 'png') return transparent ? `${name}_去背圖` : name;
  if (format === 'html') return `${name}_互動檢視`;
  return name;
}

/** 副檔名 */
export function exportExt(format: ExportFormat, count: number): string {
  if (format === 'html') return 'html';
  return count > 1 ? 'zip' : format;
}

const fileBase = (s: string) => safeFileName(s, { fallback: '關係圖' });

/** ZIP 裡同名的加「 (2)」 */
function uniqueNames(names: readonly string[], ext: string): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const base = fileBase(n);
    let name = `${base}.${ext}`;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base} (${k}).${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}

const hrefOf = (uris: ReadonlyMap<string, string>) => (id: string) => uris.get(id) ?? null;

/** PNG 一張 */
export async function sheetPng(sheet: Sheet, input: ExportInput): Promise<Blob> {
  const svg = exportSvg(sheet, {
    href: hrefOf(input.uris),
    font: input.font,
    transparent: input.transparent,
  });
  return await svgToPng(svg, sheet.W, sheet.H);
}

/** 圖片同時寫 href 與 xlink:href（舊的軟體只認後者） */
const withXlink = (s: string) =>
  s.replace(/<image\b([^>]*?)\shref="([^"]*)"/g, '<image$1 href="$2" xlink:href="$2"');

/** 分層 SVG 一張 */
export function sheetLayeredSvg(sheet: Sheet, input: ExportInput): string {
  const L = exportLayers(sheet, { href: hrefOf(input.uris), font: input.font });
  const body = L.layers
    .map(
      (l) =>
        `<g inkscape:groupmode="layer" inkscape:label="${esc(l.label)}" id="${l.id}">${withXlink(l.body)}</g>`,
    )
    .join('\n');
  const usesIcons = body.includes('class="av-icon"');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" font-family="${esc(FONT_STACKS[input.font] ?? FONT_STACKS.sans)}">
${usesIcons ? `<!-- ${ICON_CREDIT} -->\n` : ''}<defs>${withXlink(L.defs)}</defs>
${body}
</svg>
`;
}

/** 分層 PSD 一張：每層各自點陣化成畫布大小的透明圖層 */
export async function sheetPsd(sheet: Sheet, input: ExportInput): Promise<Uint8Array> {
  const L = exportLayers(sheet, { href: hrefOf(input.uris), font: input.font });
  const fontAttr = esc(FONT_STACKS[input.font] ?? FONT_STACKS.sans);
  const open = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" font-family="${fontAttr}"><defs>${L.defs}</defs>`;
  const children: { name: string; imageData: ImageData }[] = [];
  for (const l of L.layers) {
    const canvas = await svgToCanvas(`${open}${l.body}</svg>`, L.W, L.H);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    children.push({
      name: l.label,
      imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    });
  }
  const flat = await svgToCanvas(`${open}${L.layers.map((l) => l.body).join('')}</svg>`, L.W, L.H);
  const composite = (flat.getContext('2d') as CanvasRenderingContext2D).getImageData(
    0,
    0,
    flat.width,
    flat.height,
  );
  const { writePsdUint8Array } = await loadAgPsd();
  return writePsdUint8Array(
    {
      width: flat.width,
      height: flat.height,
      imageData: composite,
      children: children.map((c) => ({ name: c.name, left: 0, top: 0, imageData: c.imageData })),
    },
    { generateThumbnail: false },
  );
}

/** 匯出（names：ZIP 裡用的分頁名） */
export async function buildExport(
  format: ExportFormat,
  input: ExportInput,
  base: string,
): Promise<ExportResult> {
  const sheets = input.sheets;
  const ext = exportExt(format, sheets.length);
  const fileName = `${fileBase(base)}.${ext}`;
  if (format === 'html') {
    const html = viewerHtml(sheets, input);
    return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), fileName };
  }
  const one = async (s: Sheet): Promise<{ data: Uint8Array; type: string }> => {
    if (format === 'png') {
      const b = await sheetPng(s, input);
      return { data: new Uint8Array(await b.arrayBuffer()), type: 'image/png' };
    }
    if (format === 'svg')
      return {
        data: new TextEncoder().encode(sheetLayeredSvg(s, input)),
        type: 'image/svg+xml',
      };
    return { data: await sheetPsd(s, input), type: 'image/vnd.adobe.photoshop' };
  };
  if (sheets.length === 1) {
    const r = await one(sheets[0]);
    return { blob: new Blob([r.data as BlobPart], { type: r.type }), fileName };
  }
  const names = uniqueNames(
    sheets.map((s) => sheetName(s)),
    format,
  );
  const entries: { name: string; data: Uint8Array; level?: 0 }[] = [];
  for (let i = 0; i < sheets.length; i++) {
    const r = await one(sheets[i]);
    entries.push({ name: names[i], data: r.data, level: format === 'png' ? 0 : undefined });
  }
  const zip = zipFiles(entries);
  return { blob: new Blob([zip], { type: 'application/zip' }), fileName };
}
