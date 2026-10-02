/**
 * 轉換：把「則」的清單依設定組成完整的 HTML 文件（3.1、3.2），依則數／大小／固定檔數分割（3.9），
 * 部落格貼文版（3.10），預覽（3.11）。
 */
import type { LogEntry } from '../classify';
import type { SplitRule } from '../settings';
import { ccfoliaBody, ccfoliaRules } from './ccfolia';
import {
  AvatarRegistry,
  type ChunkContext,
  type Decls,
  documentTitle,
  esc,
  fontSetup,
  footerHtml,
  headerHtml,
  IconSprite,
  type PartInfo,
  type RenderOptions,
  scopedRules,
  styleSafe,
} from './common';
import { novelBody, novelRules } from './novel';
import { timelineBody, timelineRules } from './timeline';

export type { OutputLabels, RenderIllustration, RenderOptions } from './common';
export { novelNameColumnEm } from './novel';
export { displayWidth, timelineNameColumnEm } from './timeline';

export type DocumentMode = 'page' | 'blog';

export interface DocumentOptions extends PartInfo {
  mode: DocumentMode;
  /** 預覽：每則帶訊息序號（3.11） */
  numbers?: boolean;
  /** 部落格貼文版：外層容器與頭像樣式名稱的後綴 */
  idSuffix?: string;
}

/** 部落格貼文版的固定後綴：由「檔名主體＋第幾檔」算出，同樣輸入每次相同、不同檔不同 */
export function blogIdSuffix(fileBase: string, part: number): string {
  const seed = `${fileBase}#${part}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0).toString(36).padStart(6, '0').slice(-6);
}

const PREVIEW_NUMBER_RULES = (style: RenderOptions['style']): [string, Decls][] => [
  ['& [data-log-num]', { position: 'relative' }],
  [
    '& [data-log-num]::after',
    {
      content: '"#" attr(data-log-num)',
      position: 'absolute',
      top: style === 'ccfolia' ? '4px' : '-8px',
      right: style === 'ccfolia' ? '8px' : '-30px',
      color: '#888888',
      'font-size': '0.7em',
      'font-weight': 'normal',
      'font-style': 'normal',
      'font-family': 'ui-monospace,Consolas,monospace',
      'line-height': 1.4,
      'letter-spacing': 'normal',
      'text-indent': '0',
      opacity: 0.6,
      background: 'rgba(0,0,0,0.3)',
      padding: '2px 6px',
      'border-radius': '3px',
      'pointer-events': 'none',
      'white-space': 'nowrap',
    },
  ],
];

/** 一個檔（或預覽）的完整 HTML */
export function renderDocument(
  entries: readonly LogEntry[],
  o: RenderOptions,
  doc: DocumentOptions,
): string {
  const blog = doc.mode === 'blog';
  const suffix = blog ? (doc.idSuffix ?? 'blog') : '';
  const id = blog ? `lc-log-${suffix}` : 'lc-log';
  const scope = `#${id}`;
  const ctx: ChunkContext = {
    o,
    entries,
    numbers: !!doc.numbers,
    avatars: new AvatarRegistry(blog ? `lc-av-${suffix}-` : 'lc-av-'),
    icons: new IconSprite(blog ? `lc-ic-${suffix}-` : 'lc-ic-'),
  };
  const f = fontSetup(o.fontUrl, o.fontFamily);
  let body: string;
  let rules: [string, Decls][];
  if (o.style === 'timeline') {
    body = timelineBody(ctx);
    rules = timelineRules(ctx, f);
  } else if (o.style === 'ccfolia') {
    body = ccfoliaBody(ctx);
    rules = ccfoliaRules(ctx, f);
  } else {
    body = novelBody(ctx);
    rules = novelRules(ctx, f);
  }
  if (doc.numbers) rules.push(...PREVIEW_NUMBER_RULES(o.style));
  const css = styleSafe(`${f.faceCss}${scopedRules(scope, rules)}${ctx.avatars.css(scope)}`);
  const link = f.link ? `<link rel="stylesheet" href="${esc(f.link)}">` : '';
  const inner = `${ctx.icons.defs()}<div class="lc-box">${headerHtml(ctx, doc)}<main class="lc-body">${body}</main>${footerHtml(ctx, doc)}</div>`;
  const wrapClass = `lc-wrap lc-${o.style}`;
  if (blog) {
    return `<meta charset="UTF-8">\n<style>${css}</style>\n<div id="${id}" class="${wrapClass}">${link}${inner}</div>`.trim();
  }
  const page = styleSafe(`html,body{margin:0;padding:0;background:${o.palette.pageBg}}`);
  return `<!DOCTYPE html>\n<html lang="${esc(o.labels.lang)}">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(documentTitle(ctx, doc))}</title>\n${link ? `${link}\n` : ''}<style>${page}${css}</style>\n</head>\n<body>\n<div id="${id}" class="${wrapClass}">${inner}</div>\n</body>\n</html>\n`;
}

/* ---------- 分割（3.9） ---------- */

/** UTF-8 位元組數 */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

/**
 * 依大小分割：一則一則加入目前這一檔，「這一檔的完整 HTML」超過上限時換下一檔；單一則就超過時它自己一檔。
 * 量大小時頁碼用最大的位數（實際的檔一定不會比量的大）。為了大日誌也快，用倍增＋二分找出每一檔能放到哪一則
 * （加入一則不會讓檔案變小），結果與一則一則加入相同：每檔不超過上限，而且下一則放不進去才換檔。
 */
export function splitBySize(
  entries: readonly LogEntry[],
  limitBytes: number,
  measure: (slice: readonly LogEntry[]) => number,
): LogEntry[][] {
  const chunks: LogEntry[][] = [];
  const n = entries.length;
  let i = 0;
  while (i < n) {
    const fits = (k: number) => measure(entries.slice(i, i + k)) <= limitBytes;
    if (!fits(1)) {
      chunks.push([entries[i]]);
      i += 1;
      continue;
    }
    let good = 1;
    let bad = -1;
    let step = 1;
    while (i + good < n) {
      const next = Math.min(n - i, good + step);
      if (fits(next)) {
        good = next;
        step *= 2;
      } else {
        bad = next;
        break;
      }
    }
    if (bad > 0) {
      while (bad - good > 1) {
        const mid = (good + bad) >> 1;
        if (fits(mid)) good = mid;
        else bad = mid;
      }
    }
    chunks.push(entries.slice(i, i + good));
    i += good;
  }
  return chunks;
}

/** 依分割規則切成數個檔的「則」 */
export function splitEntries(
  entries: readonly LogEntry[],
  rule: SplitRule,
  o: RenderOptions,
): LogEntry[][] {
  if (!entries.length) return [[]];
  if (rule.method === 'count') {
    const out: LogEntry[][] = [];
    for (let i = 0; i < entries.length; i += rule.value) out.push(entries.slice(i, i + rule.value));
    return out;
  }
  if (rule.method === 'files') {
    const per = Math.ceil(entries.length / rule.value);
    const out: LogEntry[][] = [];
    for (let i = 0; i < rule.value; i++) {
      const start = i * per;
      if (start >= entries.length) break;
      out.push(entries.slice(start, start + per));
    }
    return out;
  }
  if (rule.method === 'size') {
    const big = Math.max(2, entries.length);
    return splitBySize(entries, rule.value * 1024, (slice) =>
      utf8Length(renderDocument(slice, o, { mode: 'page', part: big, total: big })),
    );
  }
  return [entries.slice()];
}

export interface ConvertResult {
  /** 每個檔的「則」 */
  parts: LogEntry[][];
  /** 每個檔的 HTML（下載用，不含訊息序號） */
  pages: string[];
  fileBase: string;
  options: RenderOptions;
}

/** 轉換（F69）：依分割規則產生每個檔的 HTML */
export function convertLog(
  entries: readonly LogEntry[],
  o: RenderOptions,
  rule: SplitRule,
  fileBase: string,
): ConvertResult {
  const parts = splitEntries(entries, rule, o);
  const total = parts.length;
  const pages = parts.map((p, i) => renderDocument(p, o, { mode: 'page', part: i + 1, total }));
  return { parts, pages, fileBase, options: o };
}

/** 第 index 檔的部落格貼文版（3.10） */
export function blogPage(result: ConvertResult, index: number): string {
  const total = result.parts.length;
  return renderDocument(result.parts[index], result.options, {
    mode: 'blog',
    part: index + 1,
    total,
    idSuffix: blogIdSuffix(result.fileBase, index + 1),
  });
}

/* ---------- 檔名（3.2） ---------- */

export function downloadNames(fileBase: string, total: number) {
  const split = total > 1;
  return {
    page: (i: number) => (split ? `${fileBase}_part${i + 1}.html` : `${fileBase}.html`),
    blog: (i: number) => (split ? `${fileBase}_part${i + 1}_web.html` : `${fileBase}_web.html`),
    zip: `${fileBase}_all.zip`,
    blogZip: `${fileBase}_web_all.zip`,
  };
}

/* ---------- 預覽（F72～F75、3.11） ---------- */

export interface PreviewRange {
  start: number;
  /** 0＝全部 */
  limit: number;
}

/** 預覽區段的修正（F74）：起始小於 1 或不是數字當成 1；超過總則數時改成「總則數 − 則數 + 1」（不小於 1） */
export function clampPreviewStart(start: number, total: number, limit: number): number {
  let s = Number.isFinite(start) ? Math.trunc(start) : 1;
  if (s < 1) s = 1;
  if (s > total) s = Math.max(1, total - (limit || total) + 1);
  return s;
}

export function previewSlice(
  entries: readonly LogEntry[],
  range: PreviewRange,
): { slice: readonly LogEntry[]; start: number; last: number } {
  const total = entries.length;
  const start = clampPreviewStart(range.start, total, range.limit);
  if (!range.limit) return { slice: entries, start, last: total };
  const slice = entries.slice(start - 1, start - 1 + range.limit);
  return { slice, start, last: Math.min(total, start - 1 + slice.length) };
}

/** 預覽頁：範圍內的則轉成單一頁（不分割），帶訊息序號；範圍外的插圖不出現 */
export function renderPreview(
  entries: readonly LogEntry[],
  o: RenderOptions,
  numbers: boolean,
): string {
  return renderDocument(entries, o, { mode: 'page', part: 1, total: 1, numbers });
}
