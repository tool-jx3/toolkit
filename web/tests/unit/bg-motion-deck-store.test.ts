/**
 * 圖片切換模式的清單編輯（F115、F116、F119、F120、F136）：排序、複製、移除、全部套用、隨機分配、重新抽籤、復原。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { type DeckSlide, initialDeck, normalizeDeck } from '@/tools/bg-motion/deck';
import {
  appendSlides,
  applyBulk,
  deckNow,
  duplicateSlide,
  historyStep,
  moveSlide,
  newSeed,
  patchBulk,
  patchDeck,
  patchEdge,
  patchSlide,
  randomAssign,
  removeSlide,
  rerollSeed,
  resetDeck,
  useDeck,
} from '@/tools/bg-motion/deckStore';

const slide = (i: number): DeckSlide => ({
  uid: `u${i}`,
  image: { id: `img${i}`, name: `p${i}.png`, width: 100, height: 50 },
  hold: 1.5,
  trans: 'fade',
  dur: 0.8,
});

const names = () => deckNow().slides.map((s) => s.image.name);

beforeEach(() => {
  resetDeck({ ...initialDeck(), slides: [slide(1), slide(2), slide(3)] });
  useDeck.temporal.getState().clear();
});

describe('清單的編輯', () => {
  it('排序：第 from 張移到 to 的位置，每張的設定跟著圖走', () => {
    patchSlide('u1', { hold: 9, trans: 'flip' });
    moveSlide(0, 2);
    expect(names()).toEqual(['p2.png', 'p3.png', 'p1.png']);
    expect(deckNow().slides[2]).toMatchObject({ hold: 9, trans: 'flip' });
    moveSlide(2, 0);
    expect(names()).toEqual(['p1.png', 'p2.png', 'p3.png']);
  });

  it('排序：範圍外或原位不做事', () => {
    moveSlide(0, 0);
    moveSlide(-1, 1);
    moveSlide(1, 7);
    expect(names()).toEqual(['p1.png', 'p2.png', 'p3.png']);
    expect(useDeck.temporal.getState().pastStates).toHaveLength(0);
  });

  it('複製：在原列下面多一列一模一樣的（同一張圖、同樣的設定，新的識別碼）', () => {
    patchSlide('u2', { hold: 4, trans: 'wipeL', dur: 2 });
    duplicateSlide('u2', 'copy');
    const s = deckNow().slides;
    expect(s.map((x) => x.uid)).toEqual(['u1', 'u2', 'copy', 'u3']);
    expect(s[2]).toMatchObject({ hold: 4, trans: 'wipeL', dur: 2 });
    expect(s[2].image).toEqual(s[1].image);
    expect(s[2].image).not.toBe(s[1].image);
  });

  it('移除', () => {
    removeSlide('u2');
    expect(names()).toEqual(['p1.png', 'p3.png']);
    removeSlide('nope');
    expect(names()).toEqual(['p1.png', 'p3.png']);
    removeSlide('u1');
    removeSlide('u3');
    expect(deckNow().slides).toEqual([]);
  });

  it('全部套用：一次設定的三個值寫進每一張（已個別設定的也被蓋掉）', () => {
    patchSlide('u2', { hold: 7, trans: 'circle', dur: 3 });
    patchBulk({ hold: 2.5, trans: 'zoomOut', dur: 0.4 });
    /* 只改一次設定不動到已有的圖片 */
    expect(deckNow().slides[0]).toMatchObject({ hold: 1.5, trans: 'fade', dur: 0.8 });
    applyBulk();
    for (const s of deckNow().slides)
      expect(s).toMatchObject({ hold: 2.5, trans: 'zoomOut', dur: 0.4 });
  });

  it('隨機分配：每張都是「隨機」並換種子；重新抽籤只換種子', () => {
    patchDeck({ seed: 5 });
    randomAssign();
    expect(deckNow().slides.map((s) => s.trans)).toEqual(['random', 'random', 'random']);
    expect(deckNow().seed).not.toBe(5);
    expect(deckNow().seed).toBeGreaterThanOrEqual(0);
    expect(deckNow().seed).toBeLessThan(1000);
    patchSlide('u1', { trans: 'fade' });
    const before = deckNow().seed;
    rerollSeed();
    expect(deckNow().seed).not.toBe(before);
    expect(deckNow().slides[0].trans).toBe('fade');
  });

  it('newSeed：0～999 的整數且不等於目前的', () => {
    for (let i = 0; i < 200; i++) {
      const s = newSeed(i % 1000);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1000);
      expect(s).not.toBe(i % 1000);
    }
  });

  it('頭尾演出', () => {
    patchEdge('intro', { trans: 'zoomIn', dur: 2 });
    patchEdge('outro', { trans: 'blur' });
    expect(deckNow().intro).toEqual({ trans: 'zoomIn', dur: 2 });
    expect(deckNow().outro).toEqual({ trans: 'blur', dur: 0.8 });
  });
});

describe('復原／重做（F136）', () => {
  /* 連續變更 0.4 秒內算一步：測試裡等一下再改下一步 */
  const wait = () => new Promise((r) => setTimeout(r, 450));

  it('每個編輯可以復原、重做', async () => {
    moveSlide(0, 1);
    await wait();
    removeSlide('u3');
    await wait();
    patchSlide('u2', { hold: 8 });
    expect(names()).toEqual(['p2.png', 'p1.png']);
    historyStep('undo');
    expect(deckNow().slides.find((s) => s.uid === 'u2')?.hold).toBe(1.5);
    historyStep('undo');
    expect(names()).toEqual(['p2.png', 'p1.png', 'p3.png']);
    historyStep('undo');
    expect(names()).toEqual(['p1.png', 'p2.png', 'p3.png']);
    historyStep('redo');
    expect(names()).toEqual(['p2.png', 'p1.png', 'p3.png']);
  });

  it('0.4 秒內連續的變更算一步', () => {
    patchSlide('u1', { hold: 2 });
    patchSlide('u1', { hold: 2.5 });
    patchSlide('u1', { hold: 3 });
    expect(useDeck.temporal.getState().pastStates).toHaveLength(1);
    historyStep('undo');
    expect(deckNow().slides[0].hold).toBe(1.5);
  });
});

describe('清單的動作各算一步復原（F136）：0.4 秒內連續做也不合併', () => {
  const steps = () => useDeck.temporal.getState().pastStates.length;

  it('加入、複製、移除、上移下移、隨機分配、重新抽籤：連續做各自一步', () => {
    appendSlides([{ id: 'imgA', name: 'a.png', width: 100, height: 50 }]);
    appendSlides([{ id: 'imgB', name: 'b.png', width: 100, height: 50 }]);
    duplicateSlide('u1', 'copy1');
    removeSlide('u2');
    moveSlide(0, 1);
    moveSlide(1, 0);
    randomAssign();
    rerollSeed();
    expect(steps()).toBe(8);
    /* 一步一步復原回去 */
    for (let i = 0; i < 8; i++) historyStep('undo');
    expect(deckNow().slides.map((s) => s.uid)).toEqual(['u1', 'u2', 'u3']);
    expect(deckNow().seed).toBe(0);
  });

  it('全部套用：改一次設定之後馬上按，各自一步；沒有變化時不記', () => {
    applyBulk();
    expect(steps()).toBe(0);
    patchBulk({ hold: 3 });
    applyBulk();
    expect(steps()).toBe(2);
    historyStep('undo');
    expect(deckNow().slides.map((s) => s.hold)).toEqual([1.5, 1.5, 1.5]);
    expect(deckNow().bulk.hold).toBe(3);
  });

  it('加入：帶入一次設定；清單原本是空的時尺寸照第一張', () => {
    resetDeck({ ...initialDeck(), bulk: { hold: 2.5, trans: 'zoomOut', dur: 0.3 } });
    useDeck.temporal.getState().clear();
    appendSlides([
      { id: 'big', name: 'big.png', width: 1600, height: 900 },
      { id: 'small', name: 'small.png', width: 100, height: 100 },
    ]);
    const d = deckNow();
    expect(d.slides.map((s) => [s.image.name, s.hold, s.trans, s.dur])).toEqual([
      ['big.png', 2.5, 'zoomOut', 0.3],
      ['small.png', 2.5, 'zoomOut', 0.3],
    ]);
    expect(new Set(d.slides.map((s) => s.uid)).size).toBe(2);
    expect([d.width, d.height]).toEqual([800, 450]);
    /* 已經有圖時不再改尺寸 */
    patchDeck({ width: 123, height: 77 });
    appendSlides([{ id: 'x', name: 'x.png', width: 2000, height: 1000 }]);
    expect([deckNow().width, deckNow().height]).toEqual([123, 77]);
  });

  it('拖曳排序的手勢中（live 模式一次拖曳呼叫很多次 moveSlide）整次只算一步', () => {
    useDeck.beginGesture();
    moveSlide(0, 1);
    moveSlide(1, 2);
    moveSlide(2, 1);
    expect(useDeck.inGesture()).toBe(true);
    useDeck.endGesture();
    expect(steps()).toBe(1);
    expect(names()).toEqual(['p2.png', 'p1.png', 'p3.png']);
    historyStep('undo');
    expect(names()).toEqual(['p1.png', 'p2.png', 'p3.png']);
  });

  it('同一個動作在手勢裡呼叫不會提早結束外面的手勢', () => {
    useDeck.beginGesture();
    removeSlide('u3');
    expect(useDeck.inGesture()).toBe(true);
    useDeck.endGesture();
    expect(steps()).toBe(1);
  });
});

describe('重設與開啟專案檔（resetDeck）', () => {
  it('連續兩次整份換掉（重設、開啟）也各自是一步復原，不會合併', () => {
    resetDeck(initialDeck());
    resetDeck({ ...initialDeck(), slides: [slide(7)] });
    expect(useDeck.temporal.getState().pastStates).toHaveLength(2);
    historyStep('undo');
    expect(deckNow().slides).toEqual([]);
    historyStep('undo');
    expect(deckNow().slides.map((s) => s.uid)).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('讀進來的內容先整理', () => {
  it('normalizeDeck 之後的狀態可以直接放進 store', () => {
    const d = normalizeDeck({
      slides: [{ image: { id: 'x', name: 'x.png', width: 5, height: 5 } }],
    });
    resetDeck(d);
    expect(deckNow().slides).toHaveLength(1);
    expect(deckNow().slides[0]).toMatchObject({ hold: 1.5, trans: 'fade', dur: 0.8 });
  });
});
