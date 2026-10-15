/**
 * 角色分析圖產生器（char-chart）的頭像範圍（2026-10，規格 F78～F80）：
 * - 套用位置算一步復原、可以重做；套用一樣的位置不記一步；置中（預設）存成 null；
 * - 換圖片、拿掉圖片時回到置中；存專案檔時讀不到圖片的角色一起拿掉；
 * - 開著調整頭像的對話框時刪掉角色、換掉全部內容：對話框關掉；
 * - 資料版本 2（舊的版本 1 存檔、專案檔照常讀：沒有這個欄位＝置中）；
 * - 畫關係圖：沒調整過的頭像照舊取中央的正方形（drawImage 的參數與以前完全相同），調整過的照位置取那一塊。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placedCrop } from '@/core/image';
import { initialState, REL, relationLayout } from '@/tools/char-chart/model';
import { dropMissingImages } from '@/tools/char-chart/project';
import { drawRelation } from '@/tools/char-chart/render';
import {
  addCharacter,
  chartNow,
  closeAvatar,
  DATA_VERSION,
  flushNudge,
  historyStep,
  openAvatar,
  removeCharacter,
  replaceAll,
  setAvatar,
  setCharacterImage,
  useChart,
  usePrefs,
  useUi,
} from '@/tools/char-chart/store';

const steps = () => useChart.temporal.getState().pastStates.length;
const WIDE = { id: 'awide', name: 'w.png', width: 240, height: 120 };

beforeEach(() => {
  let t = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => {
    t += 10;
    return t;
  });
  flushNudge();
  replaceAll(initialState());
  useChart.temporal.getState().clear();
  usePrefs.getState().replace(usePrefs.initial);
});

describe('頭像範圍：狀態與復原', () => {
  it('資料版本是 2；新角色沒有頭像範圍', () => {
    expect(DATA_VERSION).toBe(2);
    addCharacter({ name: 'a', image: WIDE }, null);
    expect(chartNow().characters[0].avatar).toBeNull();
  });

  it('套用位置：一步復原、可以重做；一樣的位置不記一步；夾在蓋滿的範圍；置中存成 null', () => {
    addCharacter({ name: 'a', image: WIDE }, null);
    const before = steps();
    setAvatar('c1', { zoom: 2, x: 9, y: 0.25, turns: 0 });
    expect(chartNow().characters[0].avatar).toEqual({ zoom: 2, x: 1.5, y: 0.25, turns: 0 });
    expect(steps()).toBe(before + 1);
    setAvatar('c1', { zoom: 2, x: 1.5, y: 0.25, turns: 0 });
    expect(steps()).toBe(before + 1);
    historyStep('undo');
    expect(chartNow().characters[0].avatar).toBeNull();
    historyStep('redo');
    expect(chartNow().characters[0].avatar).toEqual({ zoom: 2, x: 1.5, y: 0.25, turns: 0 });
    setAvatar('c1', { zoom: 1, x: 0, y: 0, turns: 0 });
    expect(chartNow().characters[0].avatar).toBeNull();
    expect(steps()).toBe(before + 2);
  });

  it('沒有圖片的角色、找不到的角色：不改', () => {
    addCharacter({ name: 'a' }, null);
    const before = steps();
    setAvatar('c1', { zoom: 2, x: 0, y: 0, turns: 0 });
    setAvatar('c9', { zoom: 2, x: 0, y: 0, turns: 0 });
    expect(chartNow().characters[0].avatar).toBeNull();
    expect(steps()).toBe(before);
  });

  it('換圖片、拿掉圖片時回到置中（復原時位置跟著回來）', () => {
    addCharacter({ name: 'a', image: WIDE }, null);
    setAvatar('c1', { zoom: 3, x: 0.5, y: 0, turns: 1 });
    setCharacterImage('c1', { ...WIDE, id: 'aother' });
    expect(chartNow().characters[0].avatar).toBeNull();
    historyStep('undo');
    expect(chartNow().characters[0].avatar).toEqual({ zoom: 3, x: 0.5, y: 0, turns: 1 });
    setCharacterImage('c1', null);
    expect(chartNow().characters[0]).toMatchObject({ image: null, avatar: null, marker: 'dot' });
  });

  it('存專案檔時讀不到圖片的角色：頭像範圍一起拿掉', () => {
    addCharacter({ name: 'a', image: WIDE }, null);
    setAvatar('c1', { zoom: 2, x: 0, y: 0, turns: 0 });
    const r = dropMissingImages(chartNow(), new Set([WIDE.id]));
    expect(r.data.characters[0]).toMatchObject({ image: null, avatar: null });
  });

  it('調整頭像的對話框：刪掉那個角色、換掉全部內容時關掉', () => {
    addCharacter({ name: 'a', image: WIDE }, null);
    openAvatar('c1');
    expect(useUi.getState().avatarFor).toBe('c1');
    removeCharacter('c1');
    expect(useUi.getState().avatarFor).toBeNull();
    historyStep('undo');
    openAvatar('c1');
    replaceAll(initialState());
    expect(useUi.getState().avatarFor).toBeNull();
    openAvatar('c1');
    closeAvatar();
    expect(useUi.getState().avatarFor).toBeNull();
  });
});

/** 記下 drawImage 的參數（其他畫布的方法都不做事；量字寬回傳 10） */
function recorder() {
  const draws: unknown[][] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key) {
      if (key in target) return target[key as string];
      if (key === 'drawImage') return (...a: unknown[]) => draws.push(a);
      if (key === 'measureText') return () => ({ width: 10 });
      return () => undefined;
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, draws };
}

describe('頭像範圍：畫關係圖', () => {
  it('沒調整過：取中央的正方形，drawImage 的參數與以前的算法完全相同', () => {
    const tall = { id: 'atall', name: 't.png', width: 333, height: 1000 };
    addCharacter({ name: 'a', image: WIDE }, null);
    addCharacter({ name: 'b', image: tall }, null);
    addCharacter({ name: 'c', image: WIDE }, null);
    const bmp = { width: 1, height: 1 } as unknown as ImageBitmap;
    const { ctx, draws } = recorder();
    drawRelation(
      ctx,
      chartNow(),
      new Map([
        [WIDE.id, bmp],
        [tall.id, bmp],
      ]),
    );
    const L = relationLayout(['c1', 'c2', 'c3']);
    const R = REL.nodeRadius;
    const old = (im: { width: number; height: number }, n: { x: number; y: number }) => {
      const side = Math.min(im.width, im.height);
      return [
        bmp,
        (im.width - side) / 2,
        (im.height - side) / 2,
        side,
        side,
        n.x - R,
        n.y - R,
        R * 2,
        R * 2,
      ];
    };
    expect(draws).toEqual([old(WIDE, L.nodes[0]), old(tall, L.nodes[1]), old(WIDE, L.nodes[2])]);
  });

  it('調整過：照位置取那一塊（放大 2 倍、往右移到底＝最左邊）', () => {
    addCharacter({ name: 'a', image: WIDE }, null);
    setAvatar('c1', { zoom: 2, x: 1.5, y: 0, turns: 0 });
    const bmp = {} as ImageBitmap;
    const { ctx, draws } = recorder();
    drawRelation(ctx, chartNow(), new Map([[WIDE.id, bmp]]));
    const n = relationLayout(['c1']).nodes[0];
    const R = REL.nodeRadius;
    const c = placedCrop(WIDE, { width: R * 2, height: R * 2 }, chartNow().characters[0].avatar!);
    expect(c).toMatchObject({ x: 0, y: 30, width: 60, height: 60 });
    expect(draws).toEqual([[bmp, 0, 30, 60, 60, n.x - R, n.y - R, R * 2, R * 2]]);
  });
});
