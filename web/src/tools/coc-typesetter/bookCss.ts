/**
 * 紙面的樣式（畫面、列印、列印用 HTML 共用；規格 3.2～3.4）。
 * 紙張的大小、留白、基本字級、行高、段落間距照舊版（分頁接近）；配色與標題、框、表格、封面、目錄的外觀是新版自己的設計（5. D1）。
 * 選擇器都在 `.book`（＋紙張、配色的 class）底下，不會影響工具的介面。
 */
import { googleFontCssUrl } from '@/core/fonts';
import { PAPER_SIZES } from '@/core/paged';
import type { PaperId, ThemeId } from './model';

/** 紙張的版面（mm、pt；規格 3.2） */
export const PAPER_LAYOUT: Record<
  PaperId,
  { top: number; bottom: number; side: number; fontPt: number; head: number }
> = {
  A5: { top: 18, bottom: 18, side: 16, fontPt: 9, head: 9 },
  B5: { top: 22, bottom: 21, side: 19, fontPt: 9.5, head: 11 },
  A4: { top: 25, bottom: 23, side: 22, fontPt: 10.5, head: 12 },
};

/** 配色（規格 3.3；新版自訂） */
export const THEMES: Record<ThemeId, Record<string, string>> = {
  mono: {
    ink: '#161616',
    muted: '#6b6b6b',
    accent: '#161616',
    num: '#161616',
    tint: '#efefef',
    tint2: '#f6f6f6',
    rule: '#c6c6c6',
    rule2: '#8f8f8f',
    'san-bg': '#e6e6e6',
    'san-ink': '#161616',
    warn: '#161616',
    'cover-bg': '#ffffff',
    'cover-ink': '#161616',
    'cover-sub': '#6b6b6b',
    'cover-line': '#bdbdbd',
  },
  antique: {
    ink: '#2b221c',
    muted: '#7a6a5c',
    accent: '#8a2e22',
    num: '#8a2e22',
    tint: '#f5ede2',
    tint2: '#f9f4ed',
    rule: '#dccdb9',
    rule2: '#b39d82',
    'san-bg': '#f3dfd8',
    'san-ink': '#7d2618',
    warn: '#8a2e22',
    'cover-bg': '#efe5d3',
    'cover-ink': '#2b221c',
    'cover-sub': '#8a2e22',
    'cover-line': 'rgba(138,46,34,.35)',
  },
  night: {
    ink: '#1d2330',
    muted: '#687186',
    accent: '#233f6b',
    num: '#a8832f',
    tint: '#edf1f7',
    tint2: '#f4f6f9',
    rule: '#c9d1de',
    rule2: '#94a3bb',
    'san-bg': '#e3e9f3',
    'san-ink': '#233f6b',
    warn: '#a33a2c',
    'cover-bg': '#141b2b',
    'cover-ink': '#eef1f7',
    'cover-sub': '#c9a85c',
    'cover-line': 'rgba(201,168,92,.4)',
  },
};

/** 紙面用的 class（列印文件的 body 也用這個） */
export const bookClass = (paper: PaperId, theme: ThemeId): string =>
  `book paper-${paper.toLowerCase()} theme-${theme}`;

const paperCss = (Object.keys(PAPER_LAYOUT) as PaperId[])
  .map((id) => {
    const p = PAPER_LAYOUT[id];
    const s = PAPER_SIZES[id];
    return `.book.paper-${id.toLowerCase()}{--pw:${s.w}mm;--ph:${s.h}mm;--mt:${p.top}mm;--mb:${p.bottom}mm;--ms:${p.side}mm;--fs:${p.fontPt}pt;--hd:${p.head}mm}`;
  })
  .join('\n');

const themeCss = (Object.keys(THEMES) as ThemeId[])
  .map(
    (id) =>
      `.book.theme-${id}{${Object.entries(THEMES[id])
        .map(([k, v]) => `--${k}:${v}`)
        .join(';')}}`,
  )
  .join('\n');

export const BOOK_CSS = `
.book{--serif:"Noto Serif TC","Source Han Serif TC","Songti TC","PMingLiU",serif;
  --sans:"Noto Sans TC","Source Han Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;
  color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.book *,.book *::before,.book *::after{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
${paperCss}
${themeCss}

/* 頁面 */
.book .page{position:relative;width:var(--pw);height:var(--ph);background:#fff;overflow:hidden;
  font-family:var(--serif);font-size:var(--fs);font-weight:400;line-height:1.8;contain:layout paint;text-align:left}
.book .page-head{position:absolute;top:var(--hd);left:var(--ms);right:var(--ms);display:flex;justify-content:space-between;align-items:baseline;gap:1em;
  padding-bottom:1mm;border-bottom:.4pt solid var(--rule);
  font-family:var(--sans);font-size:.72em;line-height:1.3;color:var(--muted);letter-spacing:.1em;white-space:nowrap;overflow:hidden}
.book .page-head span{overflow:hidden;text-overflow:ellipsis}
.book .ph-chap b{font-weight:700;color:var(--num);margin-right:.6em;letter-spacing:.04em}
.book .page-foot{position:absolute;bottom:calc(var(--hd) - 1mm);left:var(--ms);right:var(--ms);text-align:right;
  font-family:var(--sans);font-size:.8em;font-weight:700;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:.06em}
.book .page.even .page-foot{text-align:left}
.book .page-body{position:absolute;top:var(--mt);bottom:var(--mb);left:var(--ms);right:var(--ms);overflow:hidden;
  text-align:justify;text-justify:inter-character;line-break:strict;word-break:normal;overflow-wrap:anywhere;hanging-punctuation:allow-end}
.book .page-body>:first-child{margin-top:0!important}
.book .page-body>:last-child{margin-bottom:0}

/* 內文 */
.book .page-body p{margin:0 0 .65em}
.book .page-body p.flow-last-line{text-align-last:justify}
.book .page-body p.flow-joined{margin-bottom:0}
.book .page-body ul,.book .page-body ol{margin:0 0 .65em;padding-left:1.5em}
/* 本站的基本樣式（Tailwind preflight）把清單符號拿掉、圖片改成區塊：紙面與列印文件都回到瀏覽器預設，量到的高度才會一樣（F57、F75） */
.book .page-body ul,.book .page-body ol{list-style:revert}
.book .page-body li::marker{color:var(--accent)}
.book .page-body li.flow-cont{list-style:none}
.book .page-body strong{font-family:var(--sans);font-weight:700}
.book .page-body em{font-style:normal;text-emphasis:filled dot;-webkit-text-emphasis:filled dot;
  text-emphasis-position:under right;-webkit-text-emphasis-position:under right}
.book .page-body a{color:inherit;text-decoration:none}
.book .page-body hr{border:0;border-top:.6pt solid var(--rule2);width:36%;margin:1.4em auto}
.book .page-body code{font-family:var(--sans);background:var(--tint2);padding:0 .25em;border-radius:2pt}
.book .page-body pre{font-family:var(--sans);background:var(--tint2);border-left:1.5pt solid var(--rule);padding:.6em .8em;white-space:pre-wrap;margin:0 0 .8em}
.book .page-body pre code{background:none;padding:0}
.book .page-body blockquote{margin:0 0 .65em;padding-left:1em;border-left:1.5pt solid var(--rule)}
.book .page-body img{max-width:100%;display:revert;vertical-align:revert}

/* 標題 */
.book .page-body h1,.book .page-body h2,.book .page-body h3,.book .page-body h4,.book .page-body h5,.book .page-body h6{
  font-family:var(--sans);font-weight:700;color:var(--ink);text-align:left;line-height:1.45}
.book .page-body h1{font-size:1.9em;margin:1.2em 0 .8em;text-align:center;letter-spacing:.08em}
.book .page-body h2{display:flex;align-items:center;gap:.55em;font-size:1.45em;margin:2em 0 1em;padding:.4em 0 .45em;
  border-top:2pt solid var(--accent);border-bottom:.5pt solid var(--rule2);letter-spacing:.06em}
.book .page-body h2 .ch-no{flex:none;min-width:1.9em;padding:.06em .3em;background:var(--accent);color:#fff;border-radius:1.5pt;
  font-size:.8em;line-height:1.35;text-align:center;letter-spacing:.04em;font-variant-numeric:tabular-nums}
.book .page-body h2 .ch-tx{flex:1;min-width:0}
.book .page-body h3{display:flex;align-items:baseline;gap:.5em;font-size:1.15em;margin:1.7em 0 .6em;padding-bottom:.15em;border-bottom:.6pt dotted var(--rule2)}
.book .page-body h3 .sc-mk{flex:none;width:.48em;height:.48em;background:var(--accent);transform:rotate(45deg);position:relative;top:-.1em}
.book .page-body h4{font-size:1.02em;margin:1.2em 0 .3em}
.book .page-body h5,.book .page-body h6{font-size:1em;margin:1em 0 .2em}

/* 技能、理智檢定 */
.book .skill{font-family:var(--sans);font-weight:700;color:var(--accent)}
.book .san{font-family:var(--sans);font-weight:700;font-size:.9em;color:var(--san-ink);background:var(--san-bg);
  border-bottom:.8pt solid var(--san-ink);padding:.05em .35em 0;border-radius:.2em .2em 0 0;white-space:nowrap}

/* 描述 */
.book .desc{margin:1.1em 0;padding:.5em 1em .65em;background:var(--tint);border-top:.8pt solid var(--accent);border-bottom:.8pt solid var(--accent)}
.book .desc-label{font-family:var(--sans);font-size:.72em;font-weight:700;letter-spacing:.3em;line-height:1.6;color:var(--accent);margin-bottom:.15em}
.book .desc-body>:last-child,.book .box-body>:last-child,.book .judge-body>:last-child{margin-bottom:0}

/* 檢定 */
.book .judge{margin:1em 0}
.book .judge-head{display:flex;align-items:baseline;gap:.45em;font-family:var(--sans);font-weight:700;line-height:1.6;text-align:left}
.book .judge-mark{flex:none;font-size:.62em;color:var(--accent);position:relative;top:-.1em}
.book .judge-body{margin:.2em 0 0 .25em;padding-left:1em;border-left:1pt dotted var(--rule2)}
.book .judge.flow-cont>.judge-body{margin-top:0}

/* 框 */
.book .box{margin:1.1em 0;padding:.6em 1em .7em}
.book .box-label{font-family:var(--sans);font-weight:700;font-size:.74em;letter-spacing:.22em;line-height:1.6;margin-bottom:.35em;color:var(--accent);text-align:left}
.book .box-kp{background:var(--tint2);border-left:3pt solid var(--accent)}
.book .box-pl{border:.8pt solid var(--ink);padding-top:0}
.book .box-pl>.box-label{margin:0 -1.35em .55em;padding:.3em 1.35em;background:var(--ink);color:#fff}
.book .box-note{background:var(--tint);border-radius:3pt}
.book .box-note>.box-label{color:var(--muted)}
.book .box-warn{border:.8pt solid var(--warn);border-top-width:3pt}
.book .box-warn>.box-label{color:var(--warn)}

/* 資料表 */
.book .page-body table{width:100%;border-collapse:collapse;margin:.9em 0 1.1em;font-size:.86em;line-height:1.5;border:.6pt solid var(--rule2)}
.book .page-body th{font-family:var(--sans);font-weight:700;color:var(--ink);background:var(--tint);padding:.36em .55em;border-bottom:.8pt solid var(--accent);letter-spacing:.04em}
.book .page-body th:not([align]){text-align:left}
.book .page-body td{padding:.32em .55em;border-bottom:.3pt solid var(--rule);vertical-align:top}
.book .page-body tbody tr:last-child td{border-bottom:0}

/* 標題區（沒有封面時） */
.book .titleblock{margin:0 0 2em;padding-bottom:1em;border-bottom:1.4pt solid var(--accent)}
.book .tb-title{font-family:var(--serif);font-weight:700;font-size:2.3em;line-height:1.35;letter-spacing:.06em;text-align:left}
.book .tb-sub{font-family:var(--sans);color:var(--muted);letter-spacing:.12em;margin-top:.3em;text-align:left}
.book .tb-author{font-family:var(--sans);letter-spacing:.1em;margin:.8em 0 1em;text-align:left}

/* 概要（封面與標題區共用） */
.book .spec{display:grid;grid-template-columns:1fr 1fr;column-gap:6mm;margin:0;font-size:.86em;line-height:1.5;text-align:left}
.book .spec-item{display:flex;align-items:baseline;gap:.7em;min-width:0;padding:.45em 0 .5em;border-bottom:.4pt dashed var(--line,var(--rule))}
.book .spec-item.wide{grid-column:1/-1}
.book .spec-item dt{flex:none;width:5.4em;font-family:var(--sans);font-size:.8em;font-weight:700;letter-spacing:.12em;color:var(--label,var(--accent))}
.book .spec-item dd{flex:1;min-width:0;margin:0;font-family:var(--sans)}

/* 封面 */
.book .page.cover{background:var(--cover-bg);color:var(--cover-ink)}
.book .cover-inner{position:absolute;inset:0;padding:calc(var(--mt) + 5mm) calc(var(--ms) + 6mm) calc(var(--mb) + 4mm);
  display:flex;flex-direction:column;align-items:center;text-align:center}
.book .cv-frame{position:absolute;inset:calc(var(--ms) * .55);border:.6pt solid var(--cover-line);pointer-events:none}
.book .cv-top{font-family:var(--sans);font-size:.7em;letter-spacing:.5em;color:var(--cover-sub)}
.book .cv-main{width:100%;margin-top:24%}
.book .cv-title{font-family:var(--serif);font-weight:700;font-size:3.1em;line-height:1.3;letter-spacing:.08em;margin:0;text-align:center}
.book .cv-sub{font-family:var(--sans);letter-spacing:.2em;color:var(--cover-sub);margin-top:1em}
.book .cv-orn{display:flex;justify-content:center;gap:.7em;margin:2em 0 1.5em}
.book .cv-orn span{width:.42em;height:.42em;background:var(--cover-sub);transform:rotate(45deg)}
.book .cv-author{font-family:var(--sans);letter-spacing:.2em}
.book .cover .spec{width:100%;margin-top:auto;--line:var(--cover-line);--label:var(--cover-sub)}
.book .cover .skill{color:inherit}

/* 目錄 */
.book .page-body h2.toc-title{flex-direction:column;align-items:flex-start;gap:0}
.book .toc-mark{font-size:.45em;font-weight:400;letter-spacing:.45em;color:var(--muted);line-height:1.6}
.book .toc-item{display:flex;align-items:baseline;gap:.5em;font-family:var(--sans);line-height:1.9;color:inherit;text-decoration:none;text-align:left}
.book .toc-item .n{flex:none;width:2em;font-weight:700;color:var(--num);font-variant-numeric:tabular-nums}
.book .toc-item .t{flex:0 1 auto;min-width:0}
.book .toc-item .dots{flex:1 1 1em;min-width:1em;border-bottom:.8pt dotted var(--rule2);position:relative;top:-.3em}
.book .toc-item .pg{flex:none;font-variant-numeric:tabular-nums;font-weight:700}
.book .toc-item.lv2{margin-top:.45em;font-weight:700}
.book .toc-item.lv3{padding-left:2.5em;font-size:.9em;color:var(--muted)}
.book .toc-item.lv3 .n{display:none}
.book .toc-item.lv3 .pg{font-weight:400}
.book .pb{display:none}

@media screen{
  .book .page{margin:0 auto 16px;box-shadow:0 1px 2px rgba(0,0,0,.08),0 6px 20px rgba(0,0,0,.12)}
  .book .page.overflow{outline:2px solid #e0443a;outline-offset:2px}
}
@media print{
  .book .page{margin:0;box-shadow:none;break-after:page;page-break-after:always}
  .book .page:last-child{break-after:auto;page-break-after:auto}
}
`;

/** 紙面用的 Google Fonts（Noto Serif TC、Noto Sans TC 的 400、700） */
export const PAPER_FONTS = [
  { family: 'Noto Serif TC', weights: [400, 700] },
  { family: 'Noto Sans TC', weights: [400, 700] },
] as const;

export const paperFontLinks = (): string =>
  `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>${PAPER_FONTS.map(
    (f) =>
      `<link rel="stylesheet" href="${googleFontCssUrl(f.family, f.weights).replace(/&/g, '&amp;')}">`,
  ).join('')}`;

/** 畫面上的編輯用標示（列印、列印用 HTML 不含） */
export const EDITOR_PAPER_CSS = `
.coc-preview .book .page:not(.cover) [data-line]{cursor:pointer}
.coc-preview .book .cover,.coc-preview .book .titleblock{cursor:pointer}
.coc-preview .book .is-cursor{outline:1.5px solid var(--accent);outline-offset:3px;border-radius:1px}
`;
