import { t } from '../i18n';

export interface FontDef {
  id: string;
  label: string;
  family: string;
  weight: number;
  /** この書体で袋文字にするときの縁取り太さ倍率。細い書体ほど大きく */
  strokeScale: number;
  recommendedMaxChars: number;
}

/* label は getter。切り替えた言語で読み直せるよう、描画のたびに t() を引く。 */
export const FONTS: FontDef[] = [
  { id: 'noto-black',   get label() { return t('font.noto-black'); },  family: '"Noto Sans JP"',       weight: 900, strokeScale: 1.0, recommendedMaxChars: 20 },
  { id: 'mplus-round',  get label() { return t('font.mplus-round'); }, family: '"M PLUS Rounded 1c"',  weight: 800, strokeScale: 1.0, recommendedMaxChars: 20 },
  { id: 'reggae',       get label() { return t('font.reggae'); },      family: '"Reggae One"',         weight: 400, strokeScale: 0.8, recommendedMaxChars: 12 },
  { id: 'rocknroll',    get label() { return t('font.rocknroll'); },   family: '"RocknRoll One"',      weight: 400, strokeScale: 1.1, recommendedMaxChars: 16 },
  { id: 'shippori-b1',  get label() { return t('font.shippori-b1'); }, family: '"Shippori Mincho B1"', weight: 800, strokeScale: 1.2, recommendedMaxChars: 16 },
  { id: 'dotgothic',    get label() { return t('font.dotgothic'); },   family: '"DotGothic16"',        weight: 400, strokeScale: 1.4, recommendedMaxChars: 12 },
  /* 【TRPG Toolkit 収録時の追加】繁体字中国語の書体。
   * 上流の6書体は日本語用で、繁体字にしかない字形（骰・擾など）は持っていても
   * 字形の慣習が日本語のものになる。繁中UIで使うぶんにはこちらが素直。 */
  { id: 'noto-tc',      get label() { return t('font.noto-tc'); },      family: '"Noto Sans TC"',              weight: 900, strokeScale: 1.0, recommendedMaxChars: 20 },
  { id: 'serif-tc',     get label() { return t('font.serif-tc'); },     family: '"Noto Serif TC"',             weight: 900, strokeScale: 1.2, recommendedMaxChars: 16 },
  { id: 'wenkai-tc',    get label() { return t('font.wenkai-tc'); },    family: '"LXGW WenKai TC"',            weight: 700, strokeScale: 1.3, recommendedMaxChars: 14 },
  { id: 'choco-tc',     get label() { return t('font.choco-tc'); },     family: '"Chocolate Classical Sans"',  weight: 400, strokeScale: 1.2, recommendedMaxChars: 14 },
  { id: 'cactus-tc',    get label() { return t('font.cactus-tc'); },    family: '"Cactus Classical Serif"',    weight: 400, strokeScale: 1.3, recommendedMaxChars: 14 },
];

export const DEFAULT_FONT_ID = 'noto-black';

export function getFont(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** ctx.font に渡す文字列を組む */
export function fontString(font: FontDef, sizePx: number): string {
  return `${font.weight} ${sizePx}px ${font.family}, sans-serif`;
}

/**
 * 書体CSSは Google Fonts から読み込む。
 *
 * 【TRPG Toolkit 収録時の変更点】
 * 上流は @fontsource を同梱して自前配信していた（fonts.googleapis.com に到達
 * できない環境でも動く／閲覧者のIPを第三者に渡さない、という設計）。この合輯では
 * ビルド成果物をリポジトリに入れるため、16MB・723ファイルになる同梱をやめて CDN
 * 参照に切り替えている。合輯の他のツールも Tailwind・pako・フォントを CDN から
 * 読み込んでいる。
 *
 * Google Fonts の CSS も unicode-range で分割されているため、実際に落ちてくるのは
 * 使った文字が入っているチャンクだけ、という性質は変わらない。
 */
const FONT_CSS: Record<string, string> = {
  'noto-black': 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@900&display=swap',
  'mplus-round': 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@800&display=swap',
  'reggae': 'https://fonts.googleapis.com/css2?family=Reggae+One&display=swap',
  'rocknroll': 'https://fonts.googleapis.com/css2?family=RocknRoll+One&display=swap',
  'shippori-b1': 'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&display=swap',
  'dotgothic': 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap',
  /* 繁体字中国語。weights は fonts.googleapis.com/css2 で実在を確認済み
   * （存在しない太さを混ぜると、その family の @font-face が丸ごと落ちる）。 */
  'noto-tc': 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@900&display=swap',
  'serif-tc': 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@900&display=swap',
  'wenkai-tc': 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@700&display=swap',
  'choco-tc': 'https://fonts.googleapis.com/css2?family=Chocolate+Classical+Sans&display=swap',
  'cactus-tc': 'https://fonts.googleapis.com/css2?family=Cactus+Classical+Serif&display=swap',
};

const cssLoaded = new Map<string, Promise<void>>();
const loadedRanges = new Map<string, Set<string>>();

function loadCss(fontId: string): Promise<void> {
  let p = cssLoaded.get(fontId);
  if (!p) {
    const href = FONT_CSS[fontId];
    // 失敗してもフォールバック書体で描き続ける
    p = href
      ? new Promise<void>((resolve) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.addEventListener('load', () => resolve());
          link.addEventListener('error', () => resolve());
          document.head.append(link);
        })
      : Promise.resolve();
    cssLoaded.set(fontId, p);
  }
  return p;
}

/**
 * 書体 + 必要な文字だけをロードする。
 * 日本語Webフォントは unicode-range で分割配信されるため、
 * document.fonts.load の第2引数に実テキストを渡すのが必須。
 */
export async function ensureFont(font: FontDef, text: string): Promise<void> {
  await loadCss(font.id);
  const key = `${font.weight} 100px ${font.family}`;
  try {
    await document.fonts.load(key, text || 'A');
  } catch {
    /* 未対応環境ではフォールバック */
  }
  let set = loadedRanges.get(font.id);
  if (!set) {
    set = new Set();
    loadedRanges.set(font.id, set);
  }
  for (const ch of text) set.add(ch);
}

/** 開発時アサート用。ensureFont 未実行の文字があると豆腐になる */
export function isFontReady(font: FontDef, text: string): boolean {
  const set = loadedRanges.get(font.id);
  if (!set) return false;
  for (const ch of text) {
    if (ch.trim() === '') continue;
    if (!set.has(ch)) return false;
  }
  return true;
}

export function assertFontReady(font: FontDef, text: string): void {
  if (import.meta.env?.DEV && !isFontReady(font, text)) {
    console.warn(`[fonts] 尚未跑過 ensureFont() 就開始繪製：${font.id} / "${text}" — 可能會變成豆腐字（□）`);
  }
}
