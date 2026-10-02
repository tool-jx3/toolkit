/**
 * log-converter 附件（docs/refactor/specs/log-converter.examples.json）的 36 組案例：
 * - 案例的「設定」→ 新版的設定、這份日誌的選擇、頭像、插圖；
 * - 附件的「區塊」→ 套用第 7 節裁定（第 5 節第 1、2、3 項修正）後的預期；
 * - 比對前把兩邊整理成同一個形狀（單元測試不比顏色；e2e 在 Chromium 裡比計算後的顏色）。
 */
import type {
  LcSettings,
  Palette,
  SubNarratorStyle,
  TabStyle,
} from '../../src/tools/log-converter/settings';

export interface LcCase {
  編號: string;
  說明: string;
  輸入檔: string[];
  輸出樣式: '小說' | '時間軸' | 'CCFOLIA 風格';
  設定: Record<string, unknown>;
  載入後: {
    標題: string;
    副標題: string;
    旁白角色選單: string[];
    旁白角色: string;
    閒聊分頁選單: string[];
    閒聊分頁: string | null;
    檔案提示: string | null;
    已載入檔案: { 檔名: string; 則數: number; 分頁: string[] }[] | null;
  };
  轉換結果: string;
  預覽區段: { 起: number; 迄: number; 共: number };
  下載: LcDownload[];
}

export interface LcDownload {
  按鈕: string;
  檔名: string;
  ZIP內容?: string[];
  部落格貼文版?: boolean;
  頁面?: Record<string, string>;
  標題區?: Record<string, string | null>;
  區塊?: Record<string, unknown>[];
}

export interface LcAttachment {
  比對用配色: Record<string, unknown> & { 名稱顏色: Record<string, string> };
  樣本日誌: Record<string, string>;
  樣本圖片: Record<string, string>;
  案例: LcCase[];
}

export const PALETTE_FIELDS: Record<keyof Palette, string> = {
  systemBg: '系統訊息背景',
  systemBorder: '系統訊息邊框',
  systemText: '系統訊息文字',
  narrationBg: '旁白背景',
  narrationText: '旁白文字',
  pageBg: '頁面背景',
  containerBg: '容器背景',
  text: '文字',
  accent: '強調色',
};

export const STYLE_OF = { 小說: 'novel', 時間軸: 'timeline', 'CCFOLIA 風格': 'ccfolia' } as const;

const SUB_STYLE: Record<string, SubNarratorStyle> = {
  '旁白（斜體）': 'italic-narration',
  '旁白（一般）': 'narration',
  '對話（斜體）': 'italic-dialogue',
  '旁白（指定顏色）': 'colored-narration',
};

const ILL_SIZE: Record<string, 'small' | 'medium' | 'large' | 'full'> = {
  小: 'small',
  中: 'medium',
  大: 'large',
  滿版: 'full',
};
const ILL_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  靠左: 'left',
  置中: 'center',
  靠右: 'right',
};

/** 直接引用網址的頭像在案例裡沒有寫網址；測試用這個 */
export const EXTERNAL_AVATAR_URL = 'https://example.com/chen-zhiming.png';

export interface CaseSetup {
  style: 'novel' | 'timeline' | 'ccfolia';
  settings: Partial<LcSettings>;
  /** 名稱顏色：'compare'＝附件的比對用名稱顏色；'log'＝載入時的初始值 */
  nameColors: 'compare' | 'log';
  narrator?: string;
  chatTab?: null;
  hiddenTabs: string[];
  tabStyles: Record<string, TabStyle> | 'all-label';
  title?: string;
  subtitle?: string;
  summary?: string;
  useLogImages?: boolean;
  uploads: Record<string, { kind: 'file'; image: string } | { kind: 'external'; url: string }>;
  illustrations: {
    position: string;
    source: 'file' | 'url';
    image?: string;
    url?: string;
    size: 'small' | 'medium' | 'large' | 'full';
    align: 'left' | 'center' | 'right';
  }[];
  renames: Record<string, string>;
}

export function caseSetup(att: LcAttachment, c: LcCase): CaseSetup {
  const s = c.設定;
  const settings: Partial<LcSettings> = {};
  if (s.比對用配色) {
    const palette = {} as Palette;
    for (const [k, field] of Object.entries(PALETTE_FIELDS))
      palette[k as keyof Palette] = String(att.比對用配色[field]);
    settings.palette = palette;
    settings.colorPreset = 'custom';
  }
  if (s.閒聊 === '全部顯示') settings.chatMode = 'show';
  if (s.閒聊 === '完全隱藏') settings.chatMode = 'hide';
  if (s.系統訊息 === '隱藏') settings.hideSystem = true;
  if (s.合併同人連續對話) settings.mergeConsecutive = true;
  if (s.小說排版微調) settings.novelTypography = true;
  if (s.對話版面 === '接續') settings.dialogueLayout = 'inline';
  if (typeof s.分隔 === 'string') {
    const m = /自訂「(.*)」/.exec(s.分隔);
    if (m) {
      settings.separatorType = 'custom';
      settings.customSeparator = m[1];
    } else settings.separatorType = 'space';
  }
  if (s.名稱過長時換行) settings.longNameWrap = true;
  if (s.顯示閒聊數量 === false) settings.showChatCount = false;
  if (s.旁白顯示 === '獨立區塊') settings.narrationMode = 'block';
  if (s.旁白顯示 === '不區分') settings.narrationMode = 'plain';
  if (s.置中) settings.narrationCenter = true;
  if (s.分頁顏色) {
    settings.tabColorsEnabled = true;
    settings.tabColors = Object.fromEntries(
      Object.entries(s.分頁顏色 as Record<string, [string, string | null]>).map(
        ([tab, [text, bg]]) => [tab, { text, bg }],
      ),
    );
  }
  if (s.副旁白) {
    settings.subNarrators = Object.entries(s.副旁白 as Record<string, string>).map(
      ([speaker, v]) => {
        const [name, color] = v.split(' ');
        return { speaker, style: SUB_STYLE[name], color: color ?? '#a0a7b4' };
      },
    );
  }
  if (typeof s.分割 === 'string') {
    const [kind, value] = s.分割.split(' ');
    const n = Number.parseInt(value, 10);
    if (kind === '依則數') Object.assign(settings, { splitMethod: 'count', splitCount: n });
    if (kind === '固定檔數') Object.assign(settings, { splitMethod: 'files', splitFiles: n });
    if (kind === '依大小') Object.assign(settings, { splitMethod: 'size', splitSizeKb: n });
  }
  if (s.部落格貼文版) settings.blogMode = true;
  if (s.字型網址) settings.fontUrl = String(s.字型網址);
  if (s.字型名稱) settings.fontFamily = String(s.字型名稱);
  if (s.字級) settings.fontSize = Number(s.字級);
  if (s.行距) settings.lineHeight = Number(s.行距);
  if (s.頁寬) settings.pageWidth = Number(s.頁寬);
  if (typeof s.圖片品質 === 'string')
    settings.quality = s.圖片品質.startsWith('最小') ? 'low' : 'original';

  const uploads: CaseSetup['uploads'] = {};
  for (const [speaker, v] of Object.entries((s.頭像 ?? {}) as Record<string, string>)) {
    if (v.startsWith('上傳 ')) uploads[speaker] = { kind: 'file', image: v.slice(3) };
    else uploads[speaker] = { kind: 'external', url: EXTERNAL_AVATAR_URL };
  }
  if (Object.values(uploads).some((u) => u.kind === 'external')) settings.keepExternalUrl = true;

  let ills = s.插圖;
  if (ills === '同 L16') ills = att.案例.find((x) => x.編號 === 'L16')!.設定.插圖;
  const illustrations: CaseSetup['illustrations'] = ((ills ?? []) as Record<string, unknown>[]).map(
    (it) => ({
      position: String(it.位置 ?? ''),
      source: it.網址 ? 'url' : 'file',
      image: it.檔案 as string | undefined,
      url: it.網址 as string | undefined,
      size: ILL_SIZE[String(it.大小 ?? '中')] ?? 'medium',
      align: ILL_ALIGN[String(it.對齊 ?? '置中')] ?? 'center',
    }),
  );

  return {
    style: STYLE_OF[c.輸出樣式],
    settings,
    nameColors: s.名稱顏色 === '比對用（見最上方）' ? 'compare' : 'log',
    narrator: typeof s.旁白角色 === 'string' ? s.旁白角色 : undefined,
    chatTab: s.閒聊分頁 === '不使用' ? null : undefined,
    hiddenTabs: (s.隱藏分頁 as string[] | undefined) ?? [],
    tabStyles:
      s.分頁樣式 === '全部標出分頁'
        ? 'all-label'
        : Object.fromEntries(
            Object.entries((s.分頁樣式 ?? {}) as Record<string, string>).map(([t, v]) => [
              t,
              v === '標出分頁' ? 'label' : v === '通知框' ? 'notice' : 'none',
            ]),
          ),
    title: typeof s.標題 === 'string' ? s.標題 : undefined,
    subtitle: typeof s.副標題 === 'string' ? s.副標題 : undefined,
    summary: typeof s.摘要 === 'string' ? s.摘要 : undefined,
    useLogImages: s.逐則頭像 === false ? false : undefined,
    uploads,
    illustrations,
    renames: (s.分頁改名 as Record<string, string> | undefined) ?? {},
  };
}

/* ---------- 第 7 節裁定後的預期 ---------- */

type Block = Record<string, unknown>;

/** 第 5 節第 3 項：小說的系統訊息不再插到閒聊組前面（遇到系統訊息時先輸出閒聊組） */
function systemAfterChat(blocks: Block[]): Block[] {
  const out = blocks.map((b) =>
    b.種類 === '分頁區段' ? { ...b, 內容: systemAfterChat(b.內容 as Block[]) } : b,
  );
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i].種類 === '擲骰' && String(out[i + 1].種類).startsWith('閒聊')) {
      [out[i], out[i + 1]] = [out[i + 1], out[i]];
      i++;
    }
  }
  return out;
}

/** 第 5 節第 2 項：時間軸的副旁白依原本順序（L13 的附件是舊版錯置的順序） */
const L13_ORDER = [2, 0, 1, 3, 5, 4, 6, 7, 8, 9, 10, 11, 13, 12];

const 預設 = '預設圖示';
const ccfRow = (種類: string, 名稱: string, 行: string[], 頭像: string = 預設): Block => ({
  種類,
  名稱,
  名稱顯示: true,
  頭像,
  行,
  斜體: false,
  對齊: '靠左',
});

/**
 * 第 5 節第 1 項：旁白角色真的選 GM。legacy-edge 的第一位發言者是林曉雨，舊版選到林曉雨（附件 L24、L25），
 * 修正後 GM 是旁白、林曉雨是一般對話，則數與區塊都不同；這兩組的預期依規格 2.5 重新推得。
 */
const L24_FIXED: Block[] = [
  ccfRow('對話', '林曉雨', ['我先開口。']),
  ccfRow('旁白列', 'GM', ['好，請說。']),
  ccfRow('擲骰', '陳志明', ['我要擲 2d6 看看運氣。'], '骰子圖示🎲'),
  ccfRow('對話', '陳志明', ['cc<=40 小寫指令']),
  ccfRow('對話', '陳志明', ['粗體 與 斜體']),
  ccfRow('擲骰', '系統', ['[ 林曉雨 ] HP : 11 → 9'], '骰子圖示🎲'),
  ccfRow('對話', '林曉雨', ['「好痛！」']),
  ccfRow('對話', '林曉雨', ['「誰在那裡？」']),
  ccfRow('對話', '林曉雨', ['（筆記：樓梯第三階會響）']),
  ccfRow('對話', '林曉雨', ['「我上去看看。」']),
];
const tlDialogue = (名稱: string, 行: string[]): Block => ({
  種類: '對話',
  版面: '欄位對齊',
  名稱,
  名稱欄寬: '68px',
  頭像: 預設,
  行,
  斜體: false,
});
const L25_FIXED: Block[] = [
  tlDialogue('林曉雨', ['我先開口。']),
  { 種類: '旁白', 圖示: 預設, 段落: [{ 行: ['好，請說。'], 斜體: false }] },
  { 種類: '擲骰', 名稱: '陳志明', 內容: ['我要擲 2d6 看看運氣。'] },
  tlDialogue('陳志明', ['cc<=40 小寫指令', '粗體 與 斜體']),
  { 種類: '擲骰', 名稱: '系統', 內容: ['[ 林曉雨 ] HP : 11 → 9'] },
  tlDialogue('林曉雨', ['「好痛！」', '「誰在那裡？」']),
  tlDialogue('林曉雨', ['（筆記：樓梯第三階會響）']),
  tlDialogue('林曉雨', ['「我上去看看。」']),
];

export interface Expected {
  /** 旁白角色（載入後） */
  narrator: string;
  /** 預覽區段 */
  range: { 起: number; 迄: number; 共: number };
  /** 已套用裁定的區塊；null 表示這個下載沒有區塊（ZIP） */
  blocks: (d: LcDownload) => Block[] | null;
  /** 這組的區塊不比顏色（名稱顏色未指定，或依裁定重新推得） */
  colorless: boolean;
}

export function expectedFor(c: LcCase): Expected {
  const style = STYLE_OF[c.輸出樣式];
  if (c.編號 === 'L24')
    return {
      narrator: 'GM',
      range: { 起: 1, 迄: 10, 共: 10 },
      blocks: () => L24_FIXED,
      colorless: true,
    };
  if (c.編號 === 'L25')
    return {
      narrator: 'GM',
      range: { 起: 1, 迄: 8, 共: 8 },
      blocks: () => L25_FIXED,
      colorless: true,
    };
  return {
    narrator: c.載入後.旁白角色,
    range: c.預覽區段,
    colorless: String(c.設定.名稱顏色 ?? '').startsWith('未指定'),
    blocks: (d) => {
      if (!d.區塊) return null;
      /* 分割頁碼的字樣由新版自訂（F92，可接受差異） */
      let blocks = (d.區塊 as Block[]).map((b) =>
        b.種類 === '頁尾'
          ? { ...b, 文字: String(b.文字).replace(/^Page (\d+) of (\d+)$/, '第 $1 頁，共 $2 頁') }
          : b,
      );
      if (c.編號 === 'L13') blocks = L13_ORDER.map((i) => blocks[i]);
      if (style === 'novel') blocks = systemAfterChat(blocks);
      if (c.編號 === 'L05') {
        /* 接續版面合併後的第二則：規格 F49「之後的行各自換行」（附件抽出時把兩行接在一起） */
        blocks = blocks.map((b) =>
          b.種類 === '對話' &&
          b.名稱 === '林曉雨' &&
          JSON.stringify(b.行) === '["「有人在嗎？」我先敲兩下門，再探頭進去看。"]'
            ? { ...b, 行: ['「有人在嗎？」', '我先敲兩下門，再探頭進去看。'] }
            : b,
        );
      }
      return blocks;
    },
  };
}

/* ---------- 比對 ---------- */

const COLOR_KEYS = new Set([
  '名稱顏色',
  '文字顏色',
  '背景',
  '框線色',
  '摘要顏色',
  '分頁標籤顏色',
  '文字區背景',
]);
const MEASURE_KEYS = new Set(['名稱換行']);

export interface CompareOptions {
  /** 比顏色與量測值（e2e 在 Chromium 裡） */
  colors: boolean;
  /** 字級（名稱欄寬 em → px） */
  fontSize: number;
}

/** 圖片（頭像、插圖）的識別：附件是 {編號, 格式, 寬, 高, 中心色}；抽出來的是 {src} */
export type ImageRefs = Map<number, Record<string, unknown>>;

/**
 * 附件的區塊與抽出來的區塊整理成同一個形狀。圖片換成「編號」（依第一次出現的順序，
 * 頭像與插圖共用一套編號），每個編號的實際內容另外收在 refs，讓呼叫端檢查格式、尺寸與中心色。
 */
export function normalizeBlocks(
  blocks: Block[],
  o: CompareOptions,
  side: 'expected' | 'actual',
  refs: ImageRefs = new Map(),
): unknown[] {
  const ids = new Map<string, number>();
  const image = (v: unknown): unknown => {
    if (!v || typeof v !== 'object') return v;
    const rec = v as Record<string, unknown>;
    if (side === 'expected') {
      const id = Number(rec.編號);
      refs.set(id, rec);
      return rec.格式 === '外部網址' ? { 編號: id, 外部網址: true } : { 編號: id };
    }
    const src = String(rec.src ?? '');
    if (!ids.has(src)) ids.set(src, ids.size + 1);
    const id = ids.get(src)!;
    refs.set(id, { src });
    return /^https?:/.test(src) ? { 編號: id, 外部網址: true } : { 編號: id };
  };
  const norm = (b: Block): Block => {
    const out: Block = {};
    for (const [k, v] of Object.entries(b)) {
      if (!o.colors && (COLOR_KEYS.has(k) || MEASURE_KEYS.has(k))) continue;
      if (k === '名稱欄寬' && typeof v === 'string' && v.endsWith('em'))
        out[k] = `${Number.parseFloat(v) * o.fontSize}px`;
      else if (k === '頭像' || k === '圖片') out[k] = image(v);
      else if (k === '內容' && Array.isArray(v) && v.length && typeof v[0] === 'object')
        out[k] = (v as Block[]).map(norm);
      else if ((k === '段落' || k === '訊息') && Array.isArray(v))
        out[k] = (v as Block[]).map(norm);
      else out[k] = v;
    }
    return out;
  };
  return blocks.map(norm);
}

/**
 * 附件「未收錄的樣本」的長團 [main].html：新格式、單一分頁 main、標題「長團 [メイン]」，第 i 則（從 0 起）
 * 由 GM／林曉雨／陳志明 輪流發言，內文「第 i+1 則訊息。」，時間從 2026-09-27T10:00:00Z 起每則加 1 秒，
 * 頭像沿用霧港燈塔系列（取自樣本的 style）。
 */
export function longLog(att: LcAttachment, n = 1200): string {
  const all = att.樣本日誌['霧港燈塔 [all].html'];
  const style = /<style>[\s\S]*?<\/style>/.exec(all)![0];
  const who = [
    { name: 'GM', color: '#888888', av: 0 },
    { name: '林曉雨', color: '#e91e63', av: 1 },
    { name: '陳志明', color: '#2196f3', av: 3 },
  ];
  const t0 = Date.parse('2026-09-27T10:00:00Z');
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    const w = who[i % 3];
    const time = new Date(t0 + i * 1000).toISOString();
    rows.push(
      `<article class="message" data-channel="main"><div class="avatar avatar-image-${w.av}"></div><div class="message-content"><header><span class="speaker" style="--speaker-color: ${w.color};">${w.name}</span><time datetime="${time}">x</time></header><p class="message-text">第 ${i + 1} 則訊息。</p></div></article>`,
    );
  }
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>長團 [メイン]</title>${style}</head><body><h1 class="log-title">長團 [メイン]</h1><main>${rows.join('\n')}</main></body></html>`;
}

/** rgb(r, g, b) → #rrggbb（附件的顏色與色碼比對用） */
export function rgbToHex(rgb: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return rgb;
  return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
}
