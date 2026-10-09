/**
 * 下載 HTML（規格 3.9）：一個獨立的網頁檔（樣式寫在檔案裡），版面與尺寸同 PNG（sheet.ts 的 SHEET）。
 * 上傳的字型以 data URL 放進 @font-face；Google 字型用 <link> 載入（離線時用備用字型）；電腦字型只寫名稱。
 */
import { fontFamilyCss } from '@/core/fonts';
import { escapeHtml, escapeHtmlAttr } from '@/core/html';
import { clueLists, hintRuns, type PlacedWord, type Puzzle, puzzleCells } from './generate';
import { boardSize, cardWidth, cellChar, SHEET, SHEET_COLORS, type SheetOptions } from './sheet';

export interface HtmlFonts {
  /** 放進 <head> 的 <link>（Google 字型） */
  links: string;
  /** @font-face（上傳的字型） */
  faces: string;
}

const px = (n: number) => `${+n.toFixed(2)}px`;

function sheetCss(o: SheetOptions, width: number): string {
  const S = SHEET;
  const C = SHEET_COLORS;
  const row = o.layout === 'row';
  const t = o.emptyTransparent;
  return `*{box-sizing:border-box;margin:0;padding:0}
body{background:${C.page};color:${C.text};font-family:${fontFamilyCss(o.fonts.clues)};line-height:1.5;padding:${px(S.outer)};min-width:max-content}
.sheet{width:${px(width)};padding:${px(S.cardPad)};margin:0 auto;background:${C.page}}
.sheet-title{display:flex;justify-content:center;align-items:center;gap:${px(S.badgeGap)};padding-bottom:${px(S.titlePadBottom)};margin-bottom:${px(S.titleMarginBottom)};border-bottom:1px solid ${C.subtle};font-family:${fontFamilyCss(o.fonts.title)};text-align:center}
.sheet-title h1{font-size:${px(S.titleSize)};font-weight:800;line-height:1.5;overflow-wrap:anywhere}
.sheet-title .badge{font-size:${px(S.badgeSize)};font-weight:800;color:${C.primary};white-space:nowrap}
.sheet-body{display:flex;gap:${px(S.layoutGap)};${row ? 'flex-direction:row;align-items:flex-start' : 'flex-direction:column;align-items:center'}}
.board-wrap{flex:none;padding:${px(S.wrapPad)};border:1px solid ${C.subtle};border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.04);background:${C.page}}
.board{display:grid;width:max-content;${t ? 'gap:0;padding:0;background:transparent' : `gap:${px(S.gap)};padding:${px(S.boardPad)};background:${o.emptyColor};border-radius:4px`};font-family:${fontFamilyCss(o.fonts.grid)}}
.cell{position:relative;width:${px(S.cell)};height:${px(S.cell)};display:flex;align-items:center;justify-content:center;font-size:${px(S.cellText)};font-weight:700;color:${C.text}}
.cell.on{background:${C.cell}${t ? `;border:1px solid ${C.cellBorder}` : ''}}
.cell .n{position:absolute;top:2px;left:4px;font-size:${px(S.cellNum)};font-weight:700;line-height:1;color:${C.muted}}
.clues{display:grid;grid-template-columns:1fr 1fr;gap:${px(S.columnGap)};${row ? 'flex:1;min-width:0' : 'width:100%'}}
.clues h2{display:flex;font-size:18px;font-weight:700;padding-bottom:${px(S.headerPadBottom)};margin-bottom:${px(S.headerMarginBottom)};border-bottom:${px(S.headerRule)} solid ${C.subtle}}
.clues h2 span{font-size:${px(S.headerSize)};padding:4px 12px;border-radius:8px}
.across h2 span{background:${C.acrossBg};color:${C.acrossText}}
.down h2 span{background:${C.downBg};color:${C.downText}}
.clues ol{list-style:none;display:flex;flex-direction:column;gap:${px(S.clueGap)}}
.clues li{display:flex;gap:${px(S.clueNumGap)};align-items:flex-start;font-size:${px(S.clueSize)};line-height:1.6;word-break:keep-all;overflow-wrap:anywhere}
.clues .num{flex:none;min-width:${px(S.clueNumWidth)};text-align:right;font-weight:700;color:${C.muted};margin-top:.1rem}
.clues strong{font-weight:700;color:${o.reveal ? C.primary : C.danger}}
@media print{body{padding:0}}`;
}

function boardHtml(puzzle: Puzzle, reveal: boolean): string {
  const cells = puzzleCells(puzzle);
  const out: string[] = [];
  for (const row of cells)
    for (const cell of row) {
      if (!cell) {
        out.push('<div class="cell"></div>');
        continue;
      }
      const num = cell.num ? `<span class="n">${cell.num}</span>` : '';
      const ch = reveal ? `<span>${escapeHtml(cellChar(cell.char))}</span>` : '';
      out.push(`<div class="cell on">${num}${ch}</div>`);
    }
  return `<div class="board" style="grid-template-columns:repeat(${puzzle.width},${px(SHEET.cell)})">${out.join('')}</div>`;
}

function clueHtml(words: readonly PlacedWord[], reveal: boolean): string {
  return words
    .map((w) => {
      const text = hintRuns(w.hint, w.answer, reveal)
        .map((r) => (r.answer ? `<strong>${escapeHtml(r.text)}</strong>` : escapeHtml(r.text)))
        .join('');
      return `<li><span class="num">${w.num}.</span><span class="text">${text}</span></li>`;
    })
    .join('');
}

/** 整個 HTML 檔 */
export function sheetHtml(
  puzzle: Puzzle,
  o: SheetOptions,
  docTitle: string,
  fonts: HtmlFonts = { links: '', faces: '' },
): string {
  const { across, down } = clueLists(puzzle);
  const title = o.title.trim();
  const head =
    title || o.reveal
      ? `<header class="sheet-title">${title ? `<h1>${escapeHtml(title)}</h1>` : ''}${o.reveal ? `<span class="badge">${escapeHtml(o.labels.answerBadge)}</span>` : ''}</header>`
      : '';
  return `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(docTitle)}</title>
${fonts.links}<style>${fonts.faces}
${sheetCss(o, cardWidth(boardSize(puzzle, o.emptyTransparent).w, o.layout))}</style>
</head>
<body>
<main class="sheet" aria-label="${escapeHtmlAttr(docTitle)}">
${head}
<div class="sheet-body">
<div class="board-wrap">${boardHtml(puzzle, o.reveal)}</div>
<div class="clues">
<section class="across"><h2><span>${escapeHtml(o.labels.across)}</span></h2><ol>${clueHtml(across, o.reveal)}</ol></section>
<section class="down"><h2><span>${escapeHtml(o.labels.down)}</span></h2><ol>${clueHtml(down, o.reveal)}</ol></section>
</div>
</div>
</main>
</body>
</html>
`;
}
