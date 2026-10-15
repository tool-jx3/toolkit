/**
 * EPUB 電子書（規格 F104～F113、3.13、5. D 項）：把轉換後的「則」整理成 EPUB 3——OCF 容器（mimetype 第一個、不壓縮）、
 * 套件文件（OPF 3.0）、導覽文件（nav.xhtml）與 NCX、XHTML 章節、樣式表，可選的封面、插圖與字型檔——用 fflate 打包。
 *
 * 純函式、不碰 DOM：介面在 Worker 裡呼叫（epub.worker.ts）；開不了 Worker 時在主執行緒跑，每產生一個章節檔就讓出一次。
 * 訊息的分類（旁白角色、閒聊分頁、合併）在轉換時就決定了（classify.ts），這裡只負責分章與排版。
 */
import { contrastRatio, formatHex, parseColor, type Rgba } from '@/core/color';
import { bytesToHex, sha256Sync, type ZipEntry, zipFiles } from '@/core/files';
import type { LogEntry } from '../classify';
import { isSceneBreak } from '../render/common';
import { EPUB_OUT, OUT } from '../strings';
import type { EpubFontFormat, EpubIllustration, EpubImageMime, EpubInput } from './options';
import { htmlToPlainText, htmlToXhtml, stripInvalidXml, xmlAttr, xmlText } from './xhtml';

export * from './options';

/* ---------- 小工具 ---------- */

/** 每個章節檔的內容上限（UTF-8，約）：超過時在兩個區塊之間換下一個檔 */
export const EPUB_FILE_LIMIT = 200 * 1024;

const pad = (v: number, width: number) => String(v).padStart(width, '0');

function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i += 1;
    } else n += 3;
  }
  return n;
}

const FONT_MIME: Record<EpubFontFormat, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

const imageExt = (mime: EpubImageMime): string =>
  mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'jpg';

/**
 * 白底上看得清楚的顏色（F110、5. D6）：對比不到 4.5:1 時等比例降低 RGB（色相與 HSV 彩度不變）直到 4.5:1；
 * 本來就夠深的照原樣。看不懂的顏色回傳 null。
 */
export function readableOnWhite(color: string): string | null {
  const c = parseColor(color);
  if (!c) return null;
  const base: Rgba = { r: c.r, g: c.g, b: c.b, a: 1 };
  if (contrastRatio(base, '#ffffff') >= 4.5) return formatHex(base, false);
  const scaled = (k: number): Rgba => ({
    r: Math.floor(base.r * k),
    g: Math.floor(base.g * k),
    b: Math.floor(base.b * k),
    a: 1,
  });
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(scaled(mid), '#ffffff') >= 4.5) lo = mid;
    else hi = mid;
  }
  return formatHex(scaled(lo), false);
}

/**
 * 識別碼（3.13.6、5. D9）：書名與每一則（序號、種類、分頁、發言者、內容）的 SHA-256 前 16 位元組，
 * 設成 UUID 第 8 版的格式。同一份日誌、同一個書名每次相同；匯出時間、作者、版面設定不影響。
 */
export function epubIdentifier(input: EpubInput): string {
  const parts: string[] = [input.title, '\n'];
  for (const e of input.entries)
    parts.push(`${e.num}\t${e.kind}\t${e.tab}\t${e.speaker}\t${e.lines.join('\n')}\n`);
  const b = sha256Sync(new TextEncoder().encode(parts.join(''))).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = bytesToHex(b);
  return `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** UTC，到秒（dcterms:modified 的格式） */
export const modifiedStamp = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/* ---------- 分章（3.13.3） ---------- */

export interface EpubChapter {
  title: string;
  /** 章名放在第一個檔的開頭（不分章時沒有） */
  heading: boolean;
  entries: LogEntry[];
  /** 只當章名、不出現在內文的則（依標記） */
  skip: Set<number>;
}

const CHAPTER_TITLE_CHARS = 30;

/** 會輸出的則：不在不輸出的分頁、不是隱藏的系統訊息、不是完全隱藏的閒聊 */
function outputTest(input: EpubInput): (e: LogEntry) => boolean {
  const hidden = new Set(input.hiddenTabs);
  return (e) =>
    !hidden.has(e.tab) &&
    !(e.kind === 'system' && input.hideSystem) &&
    !(e.kind === 'chat' && input.chatMode === 'hide');
}

const plainOf = (e: LogEntry): string => e.lines.map(htmlToPlainText).join('\n');

export function planChapters(input: EpubInput): EpubChapter[] {
  const isOut = outputTest(input);
  const ills = new Set(input.illustrations.map((it) => it.position));
  const hasContent = (list: readonly LogEntry[]) => list.some((e) => isOut(e) || ills.has(e.num));
  const single = (): EpubChapter[] => [
    { title: input.title, heading: false, entries: [...input.entries], skip: new Set() },
  ];

  if (input.chapters === 'tab') {
    const hidden = new Set(input.hiddenTabs);
    const out: EpubChapter[] = [];
    for (const tab of input.tabs) {
      if (hidden.has(tab)) continue;
      const list = input.entries.filter((e) => e.tab === tab);
      if (!list.some(isOut)) continue;
      out.push({
        title: tab || EPUB_OUT.untitledTab,
        heading: true,
        entries: list,
        skip: new Set(),
      });
    }
    return out;
  }

  if (input.chapters === 'count') {
    const size = Math.max(1, Math.floor(input.chapterSize) || 1);
    const out: EpubChapter[] = [];
    for (let i = 0; i < input.entries.length; i += size) {
      const list = input.entries.slice(i, i + size);
      if (!hasContent(list)) continue;
      out.push({
        title: EPUB_OUT.countChapter(list[0].num, list[list.length - 1].num),
        heading: true,
        entries: list,
        skip: new Set(),
      });
    }
    return out;
  }

  if (input.chapters === 'marker') {
    const markers = input.markers.filter(Boolean);
    if (!markers.length) return single();
    const out: EpubChapter[] = [];
    const opening: EpubChapter = {
      title: EPUB_OUT.opening,
      heading: true,
      entries: [],
      skip: new Set(),
    };
    let cur = opening;
    for (const e of input.entries) {
      if (e.kind !== 'chat' && isOut(e)) {
        const text = plainOf(e);
        if (markers.some((m) => text.includes(m))) {
          if (cur !== opening || hasContent(cur.entries)) out.push(cur);
          const line =
            text
              .split('\n')
              .map((t) => t.trim())
              .find(Boolean) ?? '';
          const chars = Array.from(line);
          const title =
            chars.length > CHAPTER_TITLE_CHARS
              ? `${chars.slice(0, CHAPTER_TITLE_CHARS).join('')}…`
              : line;
          const skip = new Set<number>();
          if (title === line && text.trim() === line) skip.add(e.num);
          cur = { title, heading: true, entries: [e], skip };
          continue;
        }
      }
      cur.entries.push(e);
    }
    if (cur === opening) return single();
    out.push(cur);
    return out;
  }

  return single();
}

/* ---------- 排版（3.13.4） ---------- */

const linesOf = (e: LogEntry): string => e.lines.map(htmlToXhtml).join('<br/>');

interface Progress {
  done: number;
}

/**
 * 一章的內容，依大小切成數個檔（每個檔的 body 內容）。產生器：每切出一個檔就交出去，
 * 呼叫端可以在兩個檔之間讓出主執行緒。用到的插圖記在 used。
 */
function* chapterBodies(
  input: EpubInput,
  ch: EpubChapter,
  used: Set<number>,
  progress: Progress,
): Generator<string> {
  const hidden = new Set(input.hiddenTabs);
  const illsAt = new Map<number, EpubIllustration[]>();
  for (const it of input.illustrations) {
    if (!input.images[it.image]) continue;
    const list = illsAt.get(it.position);
    if (list) list.push(it);
    else illsAt.set(it.position, [it]);
  }
  const colorOf = (hex: string | undefined): string | null =>
    input.nameColor === 'none' || !hex ? null : readableOnWhite(hex);

  let body = ch.heading ? `<h1 class="chapter">${xmlText(ch.title)}</h1>\n` : '';
  let bytes = utf8Bytes(body);
  let blocks = 0;
  const pending: string[] = [];
  const emit = (block: string) => {
    const b = utf8Bytes(block) + 1;
    if (blocks > 0 && bytes + b > EPUB_FILE_LIMIT) {
      pending.push(body);
      body = '';
      bytes = 0;
      blocks = 0;
    }
    body += `${block}\n`;
    bytes += b;
    blocks += 1;
  };

  const nameHtml = (speaker: string): string => {
    const c = colorOf(input.nameColors[speaker]);
    const name = xmlText(speaker);
    if (input.nameColor === 'mark' && c)
      return `<span class="mark" style="color:${c}">■</span><span class="name">${name}</span>`;
    if (input.nameColor === 'text' && c)
      return `<span class="name" style="color:${c}">${name}</span>`;
    return `<span class="name">${name}</span>`;
  };
  const dialogue = (e: LogEntry, italic: boolean) => {
    const head = e.speaker ? `${nameHtml(e.speaker)}<span class="sep">：</span>` : '';
    const text = italic ? `<span class="it">${linesOf(e)}</span>` : linesOf(e);
    return `<p class="dlg">${head}${text}</p>`;
  };
  const narration = (e: LogEntry, italic: boolean, color: string | null = null) =>
    `<p class="narr${italic ? ' it' : ''}"${color ? ` style="color:${color}"` : ''}>${linesOf(e)}</p>`;

  /* 閒聊組：一個框；太長時分成數個框（第二個起沒有標題），才不會撐爆一個檔 */
  let chat: LogEntry[] = [];
  const flushChat = () => {
    if (!chat.length) return;
    const group = chat;
    chat = [];
    if (input.chatMode === 'hide') return;
    const title =
      input.chatMode === 'collapse'
        ? input.showChatCount
          ? OUT.chatSummary(group.length)
          : OUT.chatFold
        : null;
    let box = title ? `<p class="chat-title">${xmlText(title)}</p>` : '';
    let boxBytes = utf8Bytes(box);
    let items = 0;
    for (const e of group) {
      const head = e.speaker
        ? `<span class="chat-name">${xmlText(e.speaker)}</span><span class="sep">：</span>`
        : '';
      const item = `<p>${head}${linesOf(e)}</p>`;
      const b = utf8Bytes(item);
      if (items > 0 && boxBytes + b > EPUB_FILE_LIMIT / 2) {
        emit(`<div class="chat">${box}</div>`);
        box = '';
        boxBytes = 0;
        items = 0;
      }
      box += item;
      boxBytes += b;
      items += 1;
    }
    emit(`<div class="chat">${box}</div>`);
  };

  const illustration = (it: EpubIllustration) => {
    const img = input.images[it.image];
    used.add(it.image);
    const src = `../images/ill-${pad(it.image + 1, 3)}.${imageExt(img.mime)}`;
    emit(
      `<div class="ill ill-${it.align}"><img class="ill-${it.size}" src="${src}" alt="${xmlAttr(OUT.illustrationAlt)}"/></div>`,
    );
  };

  for (const e of ch.entries) {
    progress.done += 1;
    if (!hidden.has(e.tab)) {
      if (e.kind === 'system') {
        /* 系統訊息先把閒聊組輸出（同網頁小說，第 5 節第 3 項）；隱藏時也是閒聊的分組邊界（7.1 F86） */
        flushChat();
        if (!input.hideSystem) {
          const name = e.speaker && e.speaker !== 'system' ? e.speaker : OUT.system;
          emit(
            `<div class="sys"><p class="sys-name">${xmlText(name)}</p><p class="sys-body">${linesOf(e)}</p></div>`,
          );
        }
      } else if (e.kind === 'chat') {
        chat.push(e);
      } else {
        flushChat();
        if (ch.skip.has(e.num)) {
          /* 只當章名 */
        } else if (isSceneBreak(e)) {
          emit(`<p class="scene">${EPUB_OUT.sceneBreak}</p>`);
        } else if (e.kind === 'narration') {
          emit(narration(e, false));
        } else {
          const sub = input.subNarrators[e.speaker];
          if (!sub) emit(dialogue(e, false));
          else if (sub.style === 'italic-dialogue') emit(dialogue(e, true));
          else if (sub.style === 'italic-narration') emit(narration(e, true));
          else if (sub.style === 'colored-narration') emit(narration(e, false, colorOf(sub.color)));
          else emit(narration(e, false));
        }
      }
    }
    const list = illsAt.get(e.num);
    if (list) {
      flushChat();
      for (const it of list) illustration(it);
    }
    while (pending.length) yield pending.shift()!;
  }
  flushChat();
  while (pending.length) yield pending.shift()!;
  if (blocks > 0 || (ch.heading && body)) yield body;
}

/* ---------- 文件 ---------- */

const SERIF_STACK = '"Noto Serif TC","Source Han Serif TC","Songti TC","PMingLiU",serif';
const SANS_STACK =
  '"Noto Sans TC","Source Han Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
const EMBEDDED_FONT = 'LogBook';

const safeTitle = (t: string) => stripInvalidXml(t).trim() || OUT.defaultTitle;

function xhtmlDoc(title: string, css: string, body: string, bodyAttrs = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${EPUB_OUT.lang}" xml:lang="${EPUB_OUT.lang}">
<head>
<meta charset="UTF-8"/>
<title>${xmlText(safeTitle(title))}</title>
<link rel="stylesheet" type="text/css" href="${css}"/>
</head>
<body${bodyAttrs}>
${body}</body>
</html>
`;
}

/** 樣式表（3.13.4、3.13.5）：不設背景、文字色與字級；直排時方向相關的留白換成對應的邊 */
export function epubCss(input: Pick<EpubInput, 'writing' | 'font' | 'fontFile'>): string {
  const v = input.writing === 'vertical';
  const stack = input.font === 'sans' ? SANS_STACK : SERIF_STACK;
  const family = input.fontFile ? `"${EMBEDDED_FONT}",${stack}` : stack;
  /* 區塊之間的距離（橫排：上下；直排：右左）、行內方向開頭的內距（橫排：左；直排：上） */
  const blockGap = (before: string, after: string) =>
    v ? `margin: 0 ${before} 0 ${after};` : `margin: ${before} 0 ${after} 0;`;
  const inlineStart = (len: string) => (v ? `padding-top: ${len};` : `padding-left: ${len};`);
  const boxPad = (block: string, inline: string) =>
    v ? `padding: ${inline} ${block};` : `padding: ${block} ${inline};`;
  const out: string[] = ['@charset "UTF-8";'];
  if (input.fontFile)
    out.push(
      `@font-face { font-family: "${EMBEDDED_FONT}"; src: url("fonts/book.${input.fontFile.format}"); }`,
    );
  if (v)
    out.push(
      'html { writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; -epub-writing-mode: vertical-rl; }',
    );
  out.push(
    `body { font-family: ${family}; line-height: 1.8; margin: 0; padding: 0; }`,
    'p { margin: 0; }',
    `h1.chapter { font-size: 1.4em; font-weight: bold; line-height: 1.5; ${blockGap('0', '1.5em')} page-break-after: avoid; break-after: avoid; }`,
    `.narr { ${blockGap('0', '1em')} }`,
    `.dlg { ${blockGap('0.6em', '0.6em')} ${inlineStart('1em')} text-indent: -1em; }`,
    '.name, .chat-name, .sys-name, .chat-title { font-weight: bold; }',
    `.mark { font-size: 0.85em; ${v ? 'margin-bottom' : 'margin-right'}: 0.15em; }`,
    '.it { font-style: italic; }',
    `.sys { ${blockGap('1em', '1em')} ${boxPad('0.4em', '0.8em')} border: 1px solid #999999; border-radius: 0.3em; font-size: 0.9em; page-break-inside: avoid; break-inside: avoid; }`,
    `.chat { ${blockGap('1em', '1em')} ${boxPad('0.4em', '0.8em')} border: 1px dashed #999999; border-radius: 0.3em; font-size: 0.85em; }`,
    `.chat p { ${inlineStart('1em')} text-indent: -1em; }`,
    `.chat p.chat-title { ${v ? 'padding-top' : 'padding-left'}: 0; text-indent: 0; }`,
    `.scene { ${blockGap('2em', '2em')} text-align: center; letter-spacing: 0.5em; text-indent: 0; }`,
    `.ill { ${blockGap('1em', '1em')} text-indent: 0; }`,
    '.ill-left { text-align: left; } .ill-center { text-align: center; } .ill-right { text-align: right; }',
    v
      ? '.ill img { width: auto; max-width: 100%; max-height: 100%; } img.ill-small { height: 40%; } img.ill-medium { height: 60%; } img.ill-large { height: 80%; } img.ill-full { height: 100%; }'
      : '.ill img { height: auto; max-width: 100%; } img.ill-small { width: 40%; } img.ill-medium { width: 60%; } img.ill-large { width: 80%; } img.ill-full { width: 100%; }',
    `.book-title { font-size: 1.8em; font-weight: bold; line-height: 1.4; ${blockGap('2em', '0.6em')} }`,
    `.book-subtitle { font-size: 1.1em; ${blockGap('0', '1em')} }`,
    `.book-author { ${blockGap('0', '2em')} }`,
    '.book-summary { font-size: 0.95em; }',
    '.cover-page { margin: 0; padding: 0; text-align: center; }',
    '.cover img { max-width: 100%; max-height: 100%; }',
    'nav#toc ol { list-style: none; margin: 0; padding: 0; }',
    `nav#toc li { ${blockGap('0.3em', '0.3em')} }`,
  );
  return `${out.join('\n')}\n`;
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

export interface BuildOptions {
  /** 進度 0～1 */
  onProgress?: (fraction: number) => void;
  /** 在主執行緒跑時，每產生一個章節檔就呼叫一次（讓出主執行緒）；Worker 裡不用 */
  pause?: () => Promise<void>;
}

interface ManifestItem {
  id: string;
  href: string;
  type: string;
  props?: string;
}

/** 產生 ZIP 裡的所有檔（依 3.13.1 的順序；mimetype 不壓縮、圖片與 WOFF 只打包） */
export async function buildEpubFiles(
  input: EpubInput,
  { onProgress, pause }: BuildOptions = {},
): Promise<ZipEntry[]> {
  const identifier = epubIdentifier(input);
  const title = safeTitle(input.title);
  const vertical = input.writing === 'vertical';
  const chapters = planChapters(input);
  const used = new Set<number>();
  const progress: Progress = { done: 0 };
  const total = Math.max(
    1,
    chapters.reduce((n, c) => n + c.entries.length, 0),
  );

  /* 章節檔 */
  const texts: ZipEntry[] = [];
  const textItems: ManifestItem[] = [];
  const toc: { label: string; href: string }[] = [];
  let k = 0;
  for (const ch of chapters) {
    let fi = 0;
    for (const body of chapterBodies(input, ch, used, progress)) {
      if (fi === 0) k += 1;
      fi += 1;
      const id = `c${pad(k, 3)}-${pad(fi, 2)}`;
      const href = `text/${id}.xhtml`;
      if (fi === 1) toc.push({ label: ch.heading ? ch.title : title, href });
      texts.push({ name: `OEBPS/${href}`, data: xhtmlDoc(ch.title, '../style.css', body) });
      textItems.push({ id, href, type: 'application/xhtml+xml' });
      onProgress?.(Math.min(0.9, (0.9 * progress.done) / total));
      await pause?.();
    }
  }
  onProgress?.(0.9);

  /* 封面、插圖、字型 */
  const media: ZipEntry[] = [];
  const mediaItems: ManifestItem[] = [];
  const coverHref = input.cover ? `images/cover.${imageExt(input.cover.mime)}` : null;
  if (input.cover && coverHref) {
    media.push({ name: `OEBPS/${coverHref}`, data: input.cover.bytes, level: 0 });
    mediaItems.push({
      id: 'cover-image',
      href: coverHref,
      type: input.cover.mime,
      props: 'cover-image',
    });
  }
  for (const i of [...used].sort((a, b) => a - b)) {
    const img = input.images[i];
    const href = `images/ill-${pad(i + 1, 3)}.${imageExt(img.mime)}`;
    media.push({ name: `OEBPS/${href}`, data: img.bytes, level: 0 });
    mediaItems.push({ id: `ill-${pad(i + 1, 3)}`, href, type: img.mime });
  }
  if (input.fontFile) {
    const href = `fonts/book.${input.fontFile.format}`;
    const packed = input.fontFile.format === 'woff' || input.fontFile.format === 'woff2';
    media.push({
      name: `OEBPS/${href}`,
      data: input.fontFile.bytes,
      ...(packed ? { level: 0 as const } : {}),
    });
    mediaItems.push({ id: 'font', href, type: FONT_MIME[input.fontFile.format] });
  }

  /* 封面頁、書名頁 */
  const pages: ZipEntry[] = [];
  const pageItems: ManifestItem[] = [];
  if (coverHref) {
    pages.push({
      name: 'OEBPS/cover.xhtml',
      data: xhtmlDoc(
        title,
        'style.css',
        `<div class="cover"><img src="${coverHref}" alt="${xmlAttr(title)}"/></div>\n`,
        ' epub:type="cover" class="cover-page"',
      ),
    });
    pageItems.push({ id: 'cover', href: 'cover.xhtml', type: 'application/xhtml+xml' });
  }
  const titleBody = [
    `<h1 class="book-title">${xmlText(title)}</h1>`,
    input.subtitle ? `<p class="book-subtitle">${xmlText(input.subtitle)}</p>` : '',
    input.author ? `<p class="book-author">${xmlText(input.author)}</p>` : '',
    input.summary ? `<p class="book-summary">${xmlText(input.summary)}</p>` : '',
  ]
    .filter(Boolean)
    .map((l) => `${l}\n`)
    .join('');
  pages.push({
    name: 'OEBPS/title.xhtml',
    data: xhtmlDoc(title, 'style.css', titleBody, ' epub:type="titlepage" class="titlepage"'),
  });
  pageItems.push({ id: 'titlepage', href: 'title.xhtml', type: 'application/xhtml+xml' });

  /* 導覽：沒有任何章節時，目錄指向書名頁 */
  const tocList = toc.length ? toc : [{ label: title, href: 'title.xhtml' }];
  /* 目錄頁只在 2 章以上時放進 spine；landmarks 只能連到 spine 裡的檔（epubcheck RSC-011） */
  const navInSpine = toc.length >= 2;
  const landmarks = [
    ...(coverHref ? [{ type: 'cover', href: 'cover.xhtml', label: EPUB_OUT.cover }] : []),
    ...(navInSpine ? [{ type: 'toc', href: 'nav.xhtml#toc', label: EPUB_OUT.toc }] : []),
    {
      type: 'bodymatter',
      href: toc.length ? toc[0].href : 'title.xhtml',
      label: EPUB_OUT.bodymatter,
    },
  ];
  const navBody = `<nav epub:type="toc" id="toc">
<h1>${xmlText(EPUB_OUT.toc)}</h1>
<ol>
${tocList.map((t) => `<li><a href="${xmlAttr(t.href)}">${xmlText(t.label)}</a></li>`).join('\n')}
</ol>
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
<h2>${xmlText(EPUB_OUT.landmarks)}</h2>
<ol>
${landmarks.map((l) => `<li><a epub:type="${l.type}" href="${xmlAttr(l.href)}">${xmlText(l.label)}</a></li>`).join('\n')}
</ol>
</nav>
`;
  const nav = xhtmlDoc(EPUB_OUT.toc, 'style.css', navBody);
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${EPUB_OUT.lang}">
<head>
<meta name="dtb:uid" content="${xmlAttr(identifier)}"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${xmlText(title)}</text></docTitle>
<navMap>
${tocList
  .map(
    (t, i) =>
      `<navPoint id="np-${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlText(t.label)}</text></navLabel><content src="${xmlAttr(t.href)}"/></navPoint>`,
  )
  .join('\n')}
</navMap>
</ncx>
`;

  /* 套件文件 */
  const manifest: ManifestItem[] = [
    { id: 'nav', href: 'nav.xhtml', type: 'application/xhtml+xml', props: 'nav' },
    { id: 'ncx', href: 'toc.ncx', type: 'application/x-dtbncx+xml' },
    { id: 'css', href: 'style.css', type: 'text/css' },
    ...pageItems,
    ...textItems,
    ...mediaItems,
  ];
  const spine = [
    ...(coverHref ? ['cover'] : []),
    'titlepage',
    ...(navInSpine ? ['nav'] : []),
    ...textItems.map((t) => t.id),
  ];
  const meta = [
    `<dc:identifier id="bookid">${xmlText(identifier)}</dc:identifier>`,
    `<dc:title>${xmlText(title)}</dc:title>`,
    `<dc:language>${EPUB_OUT.lang}</dc:language>`,
    input.author ? `<dc:creator>${xmlText(input.author)}</dc:creator>` : '',
    input.summary ? `<dc:description>${xmlText(input.summary)}</dc:description>` : '',
    `<meta property="dcterms:modified">${modifiedStamp(input.modified)}</meta>`,
    coverHref ? '<meta name="cover" content="cover-image"/>' : '',
    vertical ? '<meta name="primary-writing-mode" content="vertical-rl"/>' : '',
  ].filter(Boolean);
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${EPUB_OUT.lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${meta.join('\n')}
</metadata>
<manifest>
${manifest.map((m) => `<item id="${m.id}" href="${xmlAttr(m.href)}" media-type="${m.type}"${m.props ? ` properties="${m.props}"` : ''}/>`).join('\n')}
</manifest>
<spine toc="ncx"${vertical ? ' page-progression-direction="rtl"' : ''}>
${spine.map((id) => `<itemref idref="${id}"/>`).join('\n')}
</spine>
</package>
`;

  return [
    { name: 'mimetype', data: 'application/epub+zip', level: 0 },
    { name: 'META-INF/container.xml', data: CONTAINER_XML },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/toc.ncx', data: ncx },
    { name: 'OEBPS/style.css', data: epubCss(input) },
    ...pages,
    ...texts,
    ...media,
  ];
}

/** 產生 EPUB（ZIP 位元組） */
export async function buildEpub(input: EpubInput, options: BuildOptions = {}): Promise<Uint8Array> {
  const files = await buildEpubFiles(input, options);
  await options.pause?.();
  const bytes = zipFiles(files, { mtime: input.modified });
  options.onProgress?.(1);
  return bytes;
}
