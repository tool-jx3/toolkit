/**
 * 「圖片切換」模式的狀態（規格 F135、F136）：
 * - useDeck：圖片清單與每張的設定、一次設定、頭尾演出、整體設定、匯出設定（自動儲存、可以復原；連續變更 0.4 秒內算一步，
 *   拖曳排序放開才記一步）；
 * - 圖片原檔存在 IndexedDB 的圖片庫（core/assets），狀態只記圖片 id。
 */
import { type AssetImageRef, createAssetStore, referencedAssetIds } from '@/core/assets';
import { createToolStore, historyGesture } from '@/core/storage';
import {
  type DeckEdge,
  type DeckSlide,
  type DeckState,
  deckAssetIds,
  fitFirstSize,
  initialDeck,
  newUid,
  normalizeDeck,
} from './deck';

export const DECK_TOOL_ID = 'bg-motion-deck';
/** 自動儲存與專案檔的資料版本（資料結構改變時加 1 並提供轉換） */
export const DECK_VERSION = 1;

/** 圖片庫（和動態效果模式共用同一個工具的圖片庫；內容用雜湊命名，不會互相覆蓋） */
export const assets = createAssetStore('bg-motion');

export const useDeck = createToolStore<DeckState>(DECK_TOOL_ID, initialDeck(), {
  version: DECK_VERSION,
  migrate: (persisted) => normalizeDeck(persisted),
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDeck.getState().data;
  const fixed = normalizeDeck(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDeck.getState().replace(fixed);
  useDeck.temporal.getState().clear();
}

/** 滑桿、數字欄、拖曳：放開（離開）才記一步 */
export const gesture = historyGesture(useDeck);

export const deckNow = (): DeckState => useDeck.getState().data;

/** 一次變更＝一步復原（手勢中除外；0.4 秒內連續的變更合成一步） */
export function edit(recipe: (d: DeckState) => void): void {
  useDeck.getState().update((d) => {
    recipe(d as DeckState);
  });
}

/**
 * 一個獨立的動作＝一步復原（加入、複製、移除、上移下移、全部套用、隨機分配、重新抽籤）：用手勢包起來，
 * 不會和 0.4 秒內的前一個變更合併。已經在手勢裡（拖曳排序一整次、鍵盤 Alt＋↑／↓）時照原樣，
 * 不提早結束外面的手勢。
 */
export function editStep(recipe: (d: DeckState) => void): void {
  if (useDeck.inGesture()) {
    edit(recipe);
    return;
  }
  useDeck.beginGesture();
  edit(recipe);
  useDeck.endGesture();
}

/** 復原／重做（手勢中不做事） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useDeck.inGesture()) return;
  const t = useDeck.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
export const referencedImages = (): Set<string> =>
  referencedAssetIds(useDeck, (d: DeckState) => deckAssetIds(d));

/**
 * 換掉整份內容（重設、開啟專案檔；可以復原）。獨立成一步復原：用手勢包起來，
 * 不會和 0.4 秒內的前一個變更合併（重設之後馬上開啟專案檔，復原會回到重設後的樣子）。
 */
export const resetDeck = (next: DeckState = initialDeck()): void => {
  useDeck.beginGesture();
  useDeck.getState().replace(next);
  useDeck.endGesture();
};

/* ---------- 清單的編輯 ---------- */

export const patchSlide = (uid: string, patch: Partial<Omit<DeckSlide, 'uid' | 'image'>>): void =>
  edit((d) => {
    const s = d.slides.find((x) => x.uid === uid);
    if (s) Object.assign(s, patch);
  });

export function moveSlide(from: number, to: number): void {
  const n = deckNow().slides.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
  editStep((d) => {
    const [x] = d.slides.splice(from, 1);
    d.slides.splice(to, 0, x);
  });
}

export const removeSlide = (uid: string): void =>
  editStep((d) => {
    const i = d.slides.findIndex((x) => x.uid === uid);
    if (i >= 0) d.slides.splice(i, 1);
  });

export const duplicateSlide = (uid: string, copyUid: string): void =>
  editStep((d) => {
    const i = d.slides.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    const s = d.slides[i];
    d.slides.splice(i + 1, 0, { ...s, uid: copyUid, image: { ...s.image } });
  });

/**
 * 把圖片接在清單最後面：帶入一次設定的秒數與效果；清單原本是空的時，輸出尺寸照第一張（F112、F123）。
 * 一次加入多張算一步復原。
 */
export const appendSlides = (refs: readonly AssetImageRef[]): void => {
  if (!refs.length) return;
  editStep((d) => {
    const wasEmpty = d.slides.length === 0;
    for (const ref of refs) {
      d.slides.push({
        uid: newUid(),
        image: { ...ref },
        hold: d.bulk.hold,
        trans: d.bulk.trans,
        dur: d.bulk.dur,
      });
    }
    if (wasEmpty) {
      const r = fitFirstSize(refs[0].width, refs[0].height);
      d.width = r.width;
      d.height = r.height;
    }
  });
};

export const patchEdge = (which: 'intro' | 'outro', patch: Partial<DeckEdge>): void =>
  edit((d) => {
    Object.assign(d[which], patch);
  });

export const patchBulk = (patch: Partial<DeckState['bulk']>): void =>
  edit((d) => {
    Object.assign(d.bulk, patch);
  });

/** 全部套用：一次設定的三個值寫進每一張 */
export const applyBulk = (): void =>
  editStep((d) => {
    for (const s of d.slides) {
      s.hold = d.bulk.hold;
      s.trans = d.bulk.trans;
      s.dur = d.bulk.dur;
    }
  });

/** 重新抽籤：種子換成 0～999 的整數亂數（和目前不同） */
export const newSeed = (cur: number): number => {
  let s = Math.floor(Math.random() * 1000);
  if (s === cur) s = (s + 1 + Math.floor(Math.random() * 998)) % 1000;
  return s;
};

export const rerollSeed = (): void =>
  editStep((d) => {
    d.seed = newSeed(d.seed);
  });

/** 隨機分配：每張的切換效果都設成「隨機」，並重新抽籤 */
export const randomAssign = (): void =>
  editStep((d) => {
    for (const s of d.slides) s.trans = 'random';
    d.seed = newSeed(d.seed);
  });

export const patchDeck = (patch: Partial<DeckState>): void =>
  edit((d) => {
    Object.assign(d, patch);
  });
