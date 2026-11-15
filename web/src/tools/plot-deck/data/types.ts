/**
 * 劇本骨架抽卡的卡片資料的型別。卡片全部是本站自己寫的（繁中）；抽卡的偏好（權重）參考 Kadan（Xelltis エノキ），
 * 卡的主題、卡名與文字都是本站的（規格 docs/refactor/specs/plot-deck.md 第 3 節、D2）。
 */

/** 兩套卡 */
export type DeckId = 'modern' | 'fantasy';

/**
 * 卡的種類：
 * - core 餘韻、intro 導入、obstacle 障礙、truth 真相、ending 結局
 * - stage 舞台、tone 焦點（依氣氛換名字）、clue 線索、npc NPC
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

/** PC 的卡（在「角色」那一步抽） */
export const PC_CATS: readonly CardCat[] = ['relation', 'secret'];
export const belongsToPc = (c: CardCat): boolean => c === 'relation' || c === 'secret';

/** 餘韻的提問（每一張都一樣） */
export const CORE_QUESTION = '想像玩到最後那一幕：PC 們在哪裡、正在做什麼？';

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
  /** 卡上的提問（餘韻是共通的提問） */
  question: string;
  /** 回答的例子（「給個例子」從這裡挑；餘韻＝高潮的例子） */
  answers: readonly string[];
  /** 合的題材（`*`＝全部；沒給＝全部） */
  missions?: readonly string[];
  /** 合的氣氛（`*`＝全部；沒給＝全部）。餘韻與焦點只屬於一種氣氛 */
  tones?: readonly string[];
  /** 餘韻：合的真相與結局（id） */
  truths?: readonly string[];
  endings?: readonly string[];
  /** 真相：故事梗概的「幕後」一段（`{tone}`＝焦點、`{stage}`＝舞台） */
  synopsis?: string;
  /** 真相：和其他卡的相性 */
  links?: CardLinks;
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
  /** 這個氣氛的焦點叫什麼（例：陰森的焦點叫「怪談」） */
  slot: string;
  /** 故事梗概裡帶出焦點的一句（`{title}`＝卡名） */
  opener: string;
}

export interface Deck {
  id: DeckId;
  name: string;
  /** 舞台等四類卡的卡包名稱（卡庫的統計） */
  pack: string;
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
