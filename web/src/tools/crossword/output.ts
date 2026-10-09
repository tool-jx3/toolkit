/**
 * 匯出（規格 3.7～3.10）：PNG（2 倍）、HTML、列印。題目版與解答版各一份。
 */
import { downloadBlob, downloadText, safeFileName } from '@/core/files';
import { type FontValue, findGoogleFont, googleFontCssUrl, uploadedFontFile } from '@/core/fonts';
import { escapeHtmlAttr } from '@/core/html';
import { canvasToBlob } from '@/core/image';
import { printPages } from '@/core/paged';
import type { Puzzle } from './generate';
import { type HtmlFonts, sheetHtml } from './html';
import {
  type CrosswordData,
  DEFAULT_TITLE,
  FONT_ROLES,
  type FontRole,
  titleOrDefault,
} from './model';
import {
  canvasMeasure,
  effectiveScale,
  layoutSheet,
  loadSheetFonts,
  PNG_SCALE,
  paintSheet,
  type SheetLayoutResult,
  type SheetOptions,
} from './sheet';
import { S, type Version } from './strings';

/** 目前的資料 → 畫圖的選項 */
export function sheetOptions(
  d: Pick<CrosswordData, 'layout' | 'title' | 'emptyColor' | 'emptyTransparent' | 'fonts'>,
  reveal: boolean,
): SheetOptions {
  return {
    reveal,
    layout: d.layout,
    title: d.title,
    emptyColor: d.emptyColor,
    emptyTransparent: d.emptyTransparent,
    fonts: {
      title: d.fonts.title.family,
      grid: d.fonts.grid.family,
      clues: d.fonts.clues.family,
    },
    labels: S.sheet,
  };
}

let probe: CanvasRenderingContext2D | null = null;

/** 量字用的 canvas（共用一個） */
export function measureContext(): CanvasRenderingContext2D {
  if (!probe) probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('無法建立畫布');
  return probe;
}

export function sheetLayout(puzzle: Puzzle, o: SheetOptions): SheetLayoutResult {
  return layoutSheet(puzzle, o, canvasMeasure(measureContext(), o.fonts));
}

/** 排版＋畫圖（倍率會依 canvas 的上限降低） */
export function renderSheet(puzzle: Puzzle, o: SheetOptions, scale = PNG_SCALE) {
  const layout = sheetLayout(puzzle, o);
  const s = effectiveScale(layout, scale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(layout.width * s));
  canvas.height = Math.max(1, Math.round(layout.height * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  paintSheet(ctx, layout, o.fonts, s);
  return { canvas, layout, scale: s };
}

/** 檔名：<標題>_題目.png、<標題>_解答.html… */
export function exportFileName(title: string, version: Version, ext: 'png' | 'html'): string {
  const base = safeFileName(titleOrDefault(title), { fallback: DEFAULT_TITLE });
  return `${base}_${S.export.fileSuffix[version]}.${ext}`;
}

/** 文件標題：<標題>（題目）／<標題>（解答） */
export const docTitle = (title: string, version: Version): string =>
  `${titleOrDefault(title)}（${S.export.versions[version]}）`;

export async function sheetPngBlob(puzzle: Puzzle, o: SheetOptions): Promise<Blob> {
  await loadSheetFonts(puzzle, o);
  return canvasToBlob(renderSheet(puzzle, o).canvas);
}

export async function downloadPng(d: CrosswordData, version: Version): Promise<string> {
  if (!d.puzzle) throw new Error(S.export.needPuzzle);
  const o = sheetOptions(d, version === 'answer');
  const name = exportFileName(d.title, version, 'png');
  downloadBlob(await sheetPngBlob(d.puzzle, o), name);
  return name;
}

/* ---------- HTML ---------- */

const bytesToBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const fontMime = (name: string) => {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'woff2'
    ? 'font/woff2'
    : ext === 'woff'
      ? 'font/woff'
      : ext === 'otf'
        ? 'font/otf'
        : 'font/ttf';
};

/** HTML 檔要帶的字型：Google 字型的 <link>、上傳字型的 @font-face（data URL） */
export async function htmlFonts(fonts: Record<FontRole, FontValue>): Promise<HtmlFonts> {
  const links = new Set<string>();
  const faces: string[] = [];
  const done = new Set<string>();
  for (const role of FONT_ROLES) {
    const f = fonts[role];
    if (done.has(`${f.source}:${f.family}`)) continue;
    done.add(`${f.source}:${f.family}`);
    if (f.source === 'google' && findGoogleFont(f.family))
      links.add(`<link rel="stylesheet" href="${escapeHtmlAttr(googleFontCssUrl(f.family))}">\n`);
    else if (f.source === 'upload') {
      const file = await uploadedFontFile(f.family);
      if (file)
        faces.push(
          `@font-face{font-family:"${f.family.replace(/["\\]/g, '')}";src:url(data:${fontMime(file.meta.fileName)};base64,${bytesToBase64(file.data)})}`,
        );
    }
  }
  return { links: [...links].join(''), faces: faces.join('\n') };
}

export async function downloadHtml(d: CrosswordData, version: Version): Promise<string> {
  if (!d.puzzle) throw new Error(S.export.needPuzzle);
  const o = sheetOptions(d, version === 'answer');
  const html = sheetHtml(d.puzzle, o, docTitle(d.title, version), await htmlFonts(d.fonts));
  const name = exportFileName(d.title, version, 'html');
  downloadText(html, name, 'text/html;charset=utf-8');
  return name;
}

/* ---------- 列印 ---------- */

const PRINT_CSS = `.cw-print{box-sizing:border-box;width:100%;height:100%;padding:10mm;display:flex;align-items:center;justify-content:center}
.cw-print img{display:block;max-width:100%;max-height:100%;object-fit:contain}`;

/** 列印：整張圖放進一頁 A4（橫的圖用橫向）；dryRun 不真的呼叫 print()（測試用） */
export async function printSheet(d: CrosswordData, version: Version, dryRun = false) {
  if (!d.puzzle) throw new Error(S.export.needPuzzle);
  const o = sheetOptions(d, version === 'answer');
  await loadSheetFonts(d.puzzle, o);
  const { canvas, layout } = renderSheet(d.puzzle, o);
  const landscape = layout.width > layout.height;
  const size = landscape ? { w: 297, h: 210 } : { w: 210, h: 297 };
  const url = canvas.toDataURL('image/png');
  return printPages({
    title: docTitle(d.title, version),
    css: `${PRINT_CSS}\n.cw-print{width:${size.w}mm;height:${size.h}mm}`,
    pages: [
      `<div class="cw-print"><img src="${url}" alt="${escapeHtmlAttr(docTitle(d.title, version))}"></div>`,
    ],
    size,
    dryRun,
  });
}
