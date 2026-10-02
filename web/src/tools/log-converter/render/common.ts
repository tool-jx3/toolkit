/**
 * 成品 HTML 的共用部分（規格 3.1、3.2、3.7、3.8、3.10、3.11）：選項型別、CSS（全部限定在外層容器之內）、
 * 頭像的嵌入（同一張圖只嵌一次、沒用到的不嵌）、字型、插圖、標題區、頁尾、預覽的訊息序號。
 * 三種樣式的版面在 novel.ts、timeline.ts、ccfolia.ts。
 */
import { cleanFontName, cssUrl, quoteFontFamily } from '@/core/css';
import { escapeHtml, escapeHtmlAttr } from '@/core/html';
import type { LogEntry } from '../classify';
import type {
  ChatMode,
  DialogueLayout,
  NarrationMode,
  OutputStyle,
  Palette,
  SubNarratorStyle,
  TabColor,
  TabStyle,
} from '../settings';

/** 成品內建字樣（F92；新版自訂的繁中字樣） */
export interface OutputLabels {
  lang: string;
  defaultTitle: string;
  system: string;
  notice: string;
  /** 小說、時間軸的閒聊摺疊標題（顯示數量時） */
  chatSummary: (count: number) => string;
  /** CCFOLIA 風格的閒聊摺疊標題 */
  chatFold: string;
  chatFoldCount: (count: number) => string;
  illustrationAlt: string;
  /** 分割頁碼 */
  page: (part: number, total: number) => string;
}

export type IllustrationSize = 'small' | 'medium' | 'large' | 'full';
export type IllustrationAlign = 'left' | 'center' | 'right';

export interface RenderIllustration {
  /** 插在第幾則之後 */
  position: number;
  src: string;
  size: IllustrationSize;
  align: IllustrationAlign;
}

export interface RenderOptions {
  style: OutputStyle;
  /** 成品標題（已依 3.2 決定） */
  title: string;
  subtitle: string;
  summary: string;
  fontUrl: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  pageWidth: number;
  novelTypography: boolean;
  palette: Palette;
  narrationMode: NarrationMode;
  narrationCenter: boolean;
  subNarrators: Readonly<Record<string, { style: SubNarratorStyle; color: string }>>;
  nameColors: Readonly<Record<string, string>>;
  /** 不輸出的分頁（F55） */
  hiddenTabs: ReadonlySet<string>;
  tabStyles: Readonly<Record<string, TabStyle>>;
  /** 分頁配色（F62）；關閉時 null */
  tabColors: Readonly<Record<string, TabColor>> | null;
  chatMode: ChatMode;
  showChatCount: boolean;
  hideSystem: boolean;
  longNameWrap: boolean;
  dialogueLayout: DialogueLayout;
  /** 接續版面的分隔（已含結尾的半形空白） */
  separator: string;
  illustrations: readonly RenderIllustration[];
  /** 發言者的頭像（使用者上傳／網址，否則新格式的代表頭像） */
  profileImages: Readonly<Record<string, string>>;
  /** 逐則頭像（F30 開啟時）：日誌裡的原圖 → 輸出用的圖；關閉時 null */
  messageImages: Readonly<Record<string, string>> | null;
  labels: OutputLabels;
}

/* ---------- CSS ---------- */

export type Decls = Record<string, string | number | null | undefined | false>;

const declText = (decls: Decls, important = true): string =>
  Object.entries(decls)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '')
    .map(([k, v]) => `${k}:${v}${important ? ' !important' : ''}`)
    .join(';');

/**
 * 限定在外層容器之內的規則：選擇器裡的「&」換成容器（例：`& .lc-box`）。
 * 每個宣告都加 !important，貼進部落格時不容易被版型的樣式蓋掉。
 */
export function scopedRules(scope: string, rules: readonly (readonly [string, Decls])[]): string {
  return rules
    .map(([sel, decls]) => {
      const body = declText(decls);
      if (!body) return '';
      const selector = sel
        .split(',')
        .map((s) => s.trim().replace(/&/g, scope))
        .join(',');
      return `${selector}{${body}}`;
    })
    .join('');
}

/** 行內樣式（同樣加 !important，才能蓋過樣式表裡的 !important） */
export function inlineStyle(decls: Decls): string {
  const body = declText(decls);
  return body ? ` style="${escapeHtmlAttr(body)}"` : '';
}

/** 放進 <style> 的文字不能出現 `</`（會提早結束 style 元素） */
export const styleSafe = (css: string): string => css.replace(/<\//g, '<\\/');

/** #rrggbb → rgba(r,g,b,a) */
export function hexAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* ---------- 字型（F34、F35、3.2） ---------- */

export const DEFAULT_FONT_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&family=Noto+Serif+TC:wght@400;700&display=swap';
export const SANS_STACK = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
export const SERIF_STACK = '"Noto Serif TC","Songti TC","PMingLiU",serif';

export interface FontSetup {
  /** 以樣式表連結載入的網址 */
  link: string | null;
  /** 直接放進樣式的 @font-face */
  faceCss: string;
  sans: string;
  serif: string;
}

/** 自訂字型網址／名稱 → 字型連結與字型堆疊。名稱加不加引號都可以（第 5 節第 5 項） */
export function fontSetup(fontUrl: string, fontFamily: string): FontSetup {
  const url = fontUrl.trim();
  let link: string | null = DEFAULT_FONT_URL;
  let faceCss = '';
  if (url) {
    if (/^@font-face/i.test(url)) {
      link = null;
      faceCss = url;
    } else if (/^@import/i.test(url)) {
      const m = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/i.exec(url);
      link = m ? m[1] : null;
    } else link = url;
  }
  const name = cleanFontName(fontFamily);
  const custom = name ? `${quoteFontFamily(name)},` : '';
  return { link, faceCss, sans: `${custom}${SANS_STACK}`, serif: `${custom}${SERIF_STACK}` };
}

/* ---------- 圖示（本站自己畫的；每種只定義一次，用 <use> 引用） ---------- */

const ICON_PATHS = {
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.6"/><circle cx="15.5" cy="8.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="8.5" cy="15.5" r="1.6"/><circle cx="15.5" cy="15.5" r="1.6"/>',
  person:
    '<circle cx="12" cy="8.5" r="4.2"/><path d="M3.8 20.5c.4-4.3 3.9-6.8 8.2-6.8s7.8 2.5 8.2 6.8z"/>',
  book: '<path d="M12 6.6C10 5 7 4.5 3.5 5v13.2c3.5-.5 6.5 0 8.5 1.6 2-1.6 5-2.1 8.5-1.6V5C17 4.5 14 5 12 6.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6.6v13.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  chat: '<path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8.5L6 20.6V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export class IconSprite {
  private readonly used = new Set<IconName>();
  constructor(private readonly prefix: string) {}

  /** 圖示（引用一次定義的 symbol） */
  use(name: IconName, size: number): string {
    this.used.add(name);
    return `<svg class="lc-ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false"><use href="#${this.prefix}${name}"/></svg>`;
  }

  /** 用到的圖示的定義（放在外層容器開頭） */
  defs(): string {
    if (!this.used.size) return '';
    const symbols = [...this.used]
      .map((n) => `<symbol id="${this.prefix}${n}" viewBox="0 0 24 24">${ICON_PATHS[n]}</symbol>`)
      .join('');
    return `<svg class="lc-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${symbols}</defs></svg>`;
  }
}

/* ---------- 頭像（3.8：同一張圖只嵌一次；沒用到的不嵌） ---------- */

export class AvatarRegistry {
  private readonly ids = new Map<string, number>();
  constructor(private readonly prefix: string) {}

  /** 這張圖的 class（第一次用到時登記） */
  classOf(url: string): string {
    let id = this.ids.get(url);
    if (id === undefined) {
      id = this.ids.size;
      this.ids.set(url, id);
    }
    return `${this.prefix}${id}`;
  }

  /** 頭像元素（有無障礙名稱）；沒有圖時回傳 fallback */
  html(
    url: string | null | undefined,
    name: string,
    fallback: string,
    extraClass = 'lc-av',
  ): string {
    if (!url) return fallback;
    return `<div class="${extraClass} ${this.classOf(url)}" role="img" aria-label="${escapeHtmlAttr(name)}"></div>`;
  }

  css(scope: string): string {
    if (!this.ids.size) return '';
    let out = '';
    for (const [url, id] of this.ids)
      out += `${scope} .${this.prefix}${id}{background-image:${cssUrl(url)} !important}`;
    return out;
  }

  get size(): number {
    return this.ids.size;
  }
}

/* ---------- 一個分割檔的轉換環境 ---------- */

export interface ChunkContext {
  o: RenderOptions;
  entries: readonly LogEntry[];
  /** 預覽：帶訊息序號（下載一律不帶） */
  numbers: boolean;
  avatars: AvatarRegistry;
  icons: IconSprite;
}

export const numAttr = (ctx: ChunkContext, e: LogEntry): string =>
  ctx.numbers ? ` data-log-num="${e.num}"` : '';

export const isHidden = (ctx: ChunkContext, e: LogEntry): boolean => ctx.o.hiddenTabs.has(e.tab);

export const tabColorOf = (ctx: ChunkContext, tab: string): TabColor | null =>
  ctx.o.tabColors ? (ctx.o.tabColors[tab] ?? null) : null;

/** 每一則用哪張頭像（3.8）：逐則頭像 → 使用者為發言者指定的 → 代表頭像 */
export function avatarFor(ctx: ChunkContext, e: LogEntry): string | null {
  const { messageImages, profileImages } = ctx.o;
  if (messageImages && e.avatar && messageImages[e.avatar]) return messageImages[e.avatar];
  return profileImages[e.speaker] || null;
}

/** 字數（名稱欄寬、名稱過長時換行） */
export const charCount = (s: string): number => Array.from(s).length;

/** 名稱超過 10 個字時可以換行（F48，第 5 節第 4 項修正） */
export const NAME_WRAP_CHARS = 10;
export const wrapsName = (ctx: ChunkContext, name: string): boolean =>
  ctx.o.longNameWrap && charCount(name) > NAME_WRAP_CHARS;

export const esc = escapeHtml;

/** 擲骰、系統訊息的名稱：沒有發言者或是 system 時用代表系統的名稱 */
export const systemName = (ctx: ChunkContext, speaker: string): string =>
  speaker && speaker !== 'system' ? speaker : ctx.o.labels.system;

/** 一行文字是不是「***」（小說的場景分隔；第 5 節第 15 項：整則去頭尾空白後是「***」才算） */
export function isSceneBreak(e: LogEntry): boolean {
  if (e.lines.length !== 1) return false;
  const text = e.lines[0]
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text === '***';
}

/** 這個檔裡「對話」的發言者（閒聊的名稱顏色、時間軸的名稱欄寬） */
export function dialogueSpeakers(entries: readonly LogEntry[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.kind !== 'dialogue' || !e.speaker || seen.has(e.speaker)) continue;
    seen.add(e.speaker);
    out.push(e.speaker);
  }
  return out;
}

/* ---------- 插圖（3.7） ---------- */

const ILL_WIDTH: Record<string, string> = {
  small: '400px',
  medium: '600px',
  large: '800px',
  full: '100%',
};
const ILL_ALIGN: Record<string, string> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

export function illustrationHtml(ctx: ChunkContext, ill: RenderIllustration): string {
  return `<div class="lc-ill"${inlineStyle({ 'justify-content': ILL_ALIGN[ill.align] ?? 'center' })}><img src="${escapeHtmlAttr(ill.src)}" alt="${escapeHtmlAttr(ctx.o.labels.illustrationAlt)}"${inlineStyle({ 'max-width': ILL_WIDTH[ill.size] ?? '600px' })}></div>`;
}

/** 插圖依「插在第幾則之後」分組（同一位置依新增順序） */
export function illustrationsByPosition(
  list: readonly RenderIllustration[],
): Map<number, RenderIllustration[]> {
  const map = new Map<number, RenderIllustration[]>();
  for (const ill of list) {
    const arr = map.get(ill.position);
    if (arr) arr.push(ill);
    else map.set(ill.position, [ill]);
  }
  return map;
}

/** 依序走過這個檔的每一則；每則之後插入位置相符的插圖（以全域訊息序號，第 5 節第 6 項修正） */
export function walk(
  ctx: ChunkContext,
  onEntry: (e: LogEntry) => void,
  onIllustration: (ill: RenderIllustration) => void,
): void {
  const ills = illustrationsByPosition(ctx.o.illustrations);
  for (const e of ctx.entries) {
    onEntry(e);
    const list = ills.get(e.num);
    if (list) for (const ill of list) onIllustration(ill);
  }
}

/* ---------- 標題區、頁尾 ---------- */

export interface PartInfo {
  part: number;
  total: number;
}

export function headerHtml(ctx: ChunkContext, part: PartInfo): string {
  const { title, subtitle, summary } = ctx.o;
  const h = part.total > 1 ? `${title} #${part.part}` : title;
  return `<header class="lc-head"><h1>${esc(h)}</h1>${subtitle ? `<p class="lc-sub">${esc(subtitle)}</p>` : ''}${summary ? `<p class="lc-sum">${esc(summary)}</p>` : ''}</header>`;
}

export const footerHtml = (ctx: ChunkContext, part: PartInfo): string =>
  part.total > 1
    ? `<footer class="lc-foot">${esc(ctx.o.labels.page(part.part, part.total))}</footer>`
    : '';

export const documentTitle = (ctx: ChunkContext, part: PartInfo): string =>
  part.total > 1 ? `${ctx.o.title} (Part ${part.part})` : ctx.o.title;
