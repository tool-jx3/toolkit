/**
 * 兩套卡（現代、奇幻）與查詢。
 */
import { FANTASY } from './fantasy';
import { MODERN } from './modern';
import type { Card, CardCat, Deck, DeckId, Mission, Tone } from './types';

export * from './types';

export const DECKS: Record<DeckId, Deck> = { modern: MODERN, fantasy: FANTASY };
export const DECK_IDS: readonly DeckId[] = ['modern', 'fantasy'];
export const isDeckId = (v: unknown): v is DeckId => v === 'modern' || v === 'fantasy';

interface DeckIndex {
  byId: Map<string, Card>;
  byCat: Map<CardCat, Card[]>;
  /** 卡在同一類裡的序號（1 起算；顯示「No. 03」） */
  no: Map<string, number>;
}

const indexes = new Map<DeckId, DeckIndex>();

function indexOf(deck: Deck): DeckIndex {
  let x = indexes.get(deck.id);
  if (x) return x;
  const byId = new Map<string, Card>();
  const byCat = new Map<CardCat, Card[]>();
  const no = new Map<string, number>();
  for (const c of deck.cards) {
    byId.set(c.id, c);
    const list = byCat.get(c.cat) ?? [];
    list.push(c);
    byCat.set(c.cat, list);
    no.set(c.id, list.length);
  }
  x = { byId, byCat, no };
  indexes.set(deck.id, x);
  return x;
}

export const getDeck = (id: DeckId): Deck => DECKS[id];
export const findCard = (deck: Deck, id: string | null | undefined): Card | null =>
  id ? (indexOf(deck).byId.get(id) ?? null) : null;
export const cardsOf = (deck: Deck, cat: CardCat): readonly Card[] =>
  indexOf(deck).byCat.get(cat) ?? [];
export const cardNo = (deck: Deck, id: string): number => indexOf(deck).no.get(id) ?? 0;
export const findMission = (deck: Deck, id: string | null | undefined): Mission | null =>
  deck.missions.find((m) => m.id === id) ?? null;
export const findTone = (deck: Deck, id: string | null | undefined): Tone | null =>
  deck.tones.find((t) => t.id === id) ?? null;
