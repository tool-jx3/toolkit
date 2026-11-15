/**
 * 劇本骨架抽卡的卡片資料的型別。卡片全部是本站自己寫的（繁中）；結構參考 Kadan（Xelltis エノキ）的卡片種類與抽卡的偏好，
 * 卡文一張都沒有沿用（規格 docs/refactor/specs/plot-deck.md 第 3 節）。
 */

/** 兩套卡 */
export type DeckId = 'modern' | 'fantasy';

/**
 * 卡的種類：
 * - core 體驗的核心、intro 導入、obstacle 障礙、truth 真相、ending 結局（故事的骨架）
 * - stage 舞台、tone 氣氛卡（依氣氛換名字）、clue 線索、npc NPC
 * - relation 關係、secret 秘密（每個 PC 各一張）
 */
export type CardCat =
  | 'core'
  | 'intro'
  | 'obstacle'
  | 'truth'
  | 'ending'
  | 'stage'
  | 'tone'
  | 'clue'
  | 'npc'
  | 'relation'
  | 'secret';

export const CARD_CATS: readonly CardCat[] = [
  'core',
  'intro',
  'obstacle',
  'truth',
  'ending',
  'stage',
  'tone',
  'clue',
  'npc',
  'relation',
  'secret',
];

/** PC 的卡（在「PC 與 NPC」一步抽） */
export const PC_CATS: readonly CardCat[] = ['relation', 'secret'];
export const isPcCat = (c: CardCat): boolean => c === 'relation' || c === 'secret';

/** 體驗的核心的問題（每一張都一樣） */
export const CORE_QUESTION = '這份感受最強烈的一幕（高潮）會是怎樣的場面？';

/** 全部的題材／氣氛都合 */
export const ANY = '*';

/** 真相和其他卡的相性：prefer＝合得來（真相抽到後 ×4）、avoid＝合不來（不會抽到） */
export interface CardLinks {
  prefer?: Partial<Record<CardCat, readonly string[]>>;
  avoid?: Partial<Record<CardCat, readonly string[]>>;
}

export interface Card {
  /** 這套卡裡唯一的 id（存檔用，不顯示） */
  id: string;
  cat: CardCat;
  title: string;
  /** 說明 */
  text: string;
  /** 卡上的問題（體驗的核心是共通的問題） */
  question: string;
  /** 回答的例子（「隨機回答」從這裡挑；體驗的核心＝高潮的例子） */
  answers: readonly string[];
  /** 合的題材（`*`＝全部；沒給＝全部） */
  missions?: readonly string[];
  /** 合的氣氛（`*`＝全部；沒給＝全部）。體驗的核心與氣氛卡只屬於一種氣氛 */
  tones?: readonly string[];
  /** 體驗的核心：合的真相與結局（id） */
  truths?: readonly string[];
  endings?: readonly string[];
  /** 真相：劇情大綱裡的真相（`{tone}`＝氣氛卡、`{stage}`＝舞台） */
  synopsis?: string;
  /** 真相：和其他卡的相性 */
  links?: CardLinks;
  /** 導入：接在「PC 們」後面的說法（例：「在打工的第一天」） */
  via?: string;
  /** 氣氛卡：在真相的句子裡怎麼稱呼（例：「多出來的那位房客」）；沒給時用「標題」 */
  ref?: string;
  /** 舞台：場所的種類 */
  kinds?: readonly string[];
  /** 障礙、線索、NPC、導入：適合的場所的種類（舞台的種類都不合時很少抽到） */
  fits?: readonly string[];
}

export interface Mission {
  id: string;
  name: string;
  /** 一句話說明（題材是「做什麼的故事」） */
  desc: string;
}

export interface Tone {
  id: string;
  name: string;
  desc: string;
  /** 這個氣氛的氣氛卡叫什麼（例：怪奇・恐怖＝怪異） */
  slot: string;
  /** 劇情大綱裡帶出氣氛卡的一句（`{title}`＝卡名） */
  opener: string;
}

export interface Deck {
  id: DeckId;
  name: string;
  /** 舞台等四類卡的卡包名稱（卡片一覽的統計） */
  pack: string;
  /** 劇情大綱的「捲入這起事件」的說法 */
  incident: string;
  /** 「NPC 的名字」的例子（欄位的提示） */
  npcPlaceholder: string;
  /** 「空著的隨機填」替還沒取名的 NPC 取的名字 */
  names: readonly string[];
  missions: readonly Mission[];
  tones: readonly Tone[];
  cards: readonly Card[];
}

/** 卡的建構（資料檔用；只是讓資料短一點） */
export function card(
  cat: CardCat,
  id: string,
  title: string,
  text: string,
  question: string,
  answers: readonly string[],
  extra: Partial<Omit<Card, 'id' | 'cat' | 'title' | 'text' | 'question' | 'answers'>> = {},
): Card {
  return { id: `${cat}.${id}`, cat, title, text, question, answers, ...extra };
}
