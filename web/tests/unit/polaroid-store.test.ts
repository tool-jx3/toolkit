/**
 * 拍立得相框產生器（polaroid）的動作與復原：
 * - 換尺寸：清掉所有筆畫、位移夾回、跑到相框外的貼紙拉回（D12），一步復原；選目前的尺寸不做事；
 * - 換照片：筆畫、貼紙、文字保留，放大回 1、置中；
 * - 放大、拖曳取景、重設位置；連續的滾輪算一步；
 * - 筆畫：一筆一步；清除這個圖層、全部清除；顯示／隱藏；上下（清單上層在前）；
 * - 貼紙：加入後選取最後一張並切到移動工具；刪除選取的那張改選最上面的；方向鍵連按算一步；中心夾在相框內。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, type Sticker, type Stroke } from '@/tools/polaroid/model';
import {
  activeLayerId,
  addStickers,
  applyPhoto,
  clearAllLayers,
  clearLayer,
  commitStroke,
  docNow,
  flushBurst,
  historyStep,
  initialPen,
  moveLayerInList,
  moveStickerInList,
  nudgeSticker,
  panPhoto,
  patchSticker,
  penNow,
  removeSticker,
  resetView,
  selectSticker,
  setAspect,
  setLayerVisible,
  setPen,
  setZoom,
  useDoc,
  usePen,
  useUi,
  wheelPhoto,
} from '@/tools/polaroid/store';

const PHOTO = { id: 'aphoto1', name: 'cat.jpg', width: 400, height: 300 };
const steps = () => useDoc.temporal.getState().pastStates.length;
const undo = () => historyStep('undo');

const stroke = (x = 10): Stroke => ({
  color: '#14b8a6',
  size: 14,
  pressure: 0.55,
  eraser: false,
  points: [x, 10, x + 20, 30],
});

const sticker = (id: string, over: Partial<Sticker> = {}): Sticker => ({
  id,
  asset: `a${id}`,
  name: `${id}.png`,
  cx: 344,
  cy: 739.5,
  width: 120,
  height: 80,
  rotation: 0,
  ...over,
});

beforeEach(() => {
  /* 復原紀錄以時間判斷連續變更：每次讀時間往後 10 ms */
  let t = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => {
    t += 10;
    return t;
  });
  flushBurst();
  useDoc.getState().replace(initialState());
  useDoc.temporal.getState().clear();
  usePen.getState().replace(initialPen());
  useUi.setState({ selectedSticker: null, drawing: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('尺寸（F02、F03、D12）', () => {
  it('換尺寸清掉所有筆畫、夾回位移、拉回貼紙；一步復原', () => {
    applyPhoto(PHOTO);
    setZoom(2);
    panPhoto(docNow().view, 0, 9999);
    commitStroke('l1', stroke());
    commitStroke('l3', stroke(50));
    addStickers([sticker('s1', { cy: 1000 })]);
    useDoc.getState().update((d) => {
      d.stickers[0].cy = 1000;
    });
    const before = steps();
    setAspect('landscape');
    expect(steps()).toBe(before + 1);
    const d = docNow();
    expect(d.layers.every((l) => l.strokes.length === 0)).toBe(true);
    expect(d.stickers[0].cy).toBe(689);
    /* 2 倍時照片高 930、範圍高 465 → 上下最多 232.5（原本 310） */
    expect(d.view.oy).toBeCloseTo(232.5, 3);
    expect(d.photo?.id).toBe('aphoto1');
    undo();
    expect(docNow().aspect).toBe('square');
    expect(docNow().layers[0].strokes).toHaveLength(1);
    expect(docNow().layers[2].strokes).toHaveLength(1);
  });

  it('選目前的尺寸不做事', () => {
    commitStroke('l1', stroke());
    const before = steps();
    setAspect('square');
    expect(steps()).toBe(before);
    expect(docNow().layers[0].strokes).toHaveLength(1);
  });
});

describe('照片（F07～F12）', () => {
  it('換照片：筆畫、貼紙、文字保留；放大回 1、置中', () => {
    applyPhoto(PHOTO);
    commitStroke('l1', stroke());
    addStickers([sticker('s1')]);
    useDoc.getState().update((d) => {
      d.caption.text = 'hi';
    });
    setZoom(3);
    applyPhoto({ ...PHOTO, id: 'aphoto2' });
    const d = docNow();
    expect(d.view).toEqual({ zoom: 1, ox: 0, oy: 0 });
    expect(d.layers[0].strokes).toHaveLength(1);
    expect(d.stickers).toHaveLength(1);
    expect(d.caption.text).toBe('hi');
    undo();
    expect(docNow().photo?.id).toBe('aphoto1');
    expect(docNow().view.zoom).toBe(3);
  });

  it('放大、拖曳、重設；沒有照片時不做事', () => {
    setZoom(2);
    expect(docNow().view.zoom).toBe(1);
    applyPhoto(PHOTO);
    setZoom(2);
    panPhoto(docNow().view, -9999, 0);
    expect(docNow().view.ox).toBeCloseTo(-516.667, 3);
    resetView();
    expect(docNow().view).toEqual({ zoom: 1, ox: 0, oy: 0 });
  });

  it('連續的滾輪算一步', () => {
    applyPhoto(PHOTO);
    const before = steps();
    wheelPhoto(-100);
    wheelPhoto(-100);
    wheelPhoto(-100);
    expect(docNow().view.zoom).toBeCloseTo(Math.exp(0.45), 10);
    flushBurst();
    expect(steps()).toBe(before + 1);
    undo();
    expect(docNow().view.zoom).toBe(1);
  });
});

describe('筆畫與圖層（F24～F32）', () => {
  it('一筆一步；清除這個圖層、全部清除', () => {
    commitStroke('l1', stroke());
    commitStroke('l1', stroke(30));
    commitStroke('l2', stroke(50));
    expect(steps()).toBe(3);
    clearLayer('l1');
    expect(docNow().layers[0].strokes).toEqual([]);
    expect(docNow().layers[1].strokes).toHaveLength(1);
    clearAllLayers();
    expect(docNow().layers.every((l) => !l.strokes.length)).toBe(true);
    undo();
    undo();
    expect(docNow().layers[0].strokes).toHaveLength(2);
  });

  it('顯示／隱藏、上下（清單上層在前）；目前的圖層跟著那個圖層走', () => {
    setLayerVisible('l2', false);
    expect(docNow().layers[1].visible).toBe(false);
    setPen({ layer: 'l1' });
    /* 清單第 2 列（l1，最下面）移到第 0 列（最上面） */
    moveLayerInList(2, 0);
    expect(docNow().layers.map((l) => l.id)).toEqual(['l2', 'l3', 'l1']);
    expect(activeLayerId()).toBe('l1');
    setPen({ layer: 'zzz' });
    expect(activeLayerId()).toBe('l2');
  });
});

describe('貼紙（F33～F39、F54）', () => {
  it('加入後選取最後一張、切到移動工具；一批算一步', () => {
    setPen({ tool: 'pen' });
    addStickers([sticker('s1'), sticker('s2')]);
    expect(steps()).toBe(1);
    expect(useUi.getState().selectedSticker).toBe('s2');
    expect(penNow().tool).toBe('move');
  });

  it('刪除選取的那張改選最上面的；刪別的不改', () => {
    addStickers([sticker('s1'), sticker('s2'), sticker('s3')]);
    selectSticker('s3');
    removeSticker('s1');
    expect(useUi.getState().selectedSticker).toBe('s3');
    removeSticker('s3');
    expect(useUi.getState().selectedSticker).toBe('s2');
    removeSticker('s2');
    expect(useUi.getState().selectedSticker).toBeNull();
  });

  it('中心夾在相框內；方向鍵連按算一步', () => {
    addStickers([sticker('s1')]);
    patchSticker('s1', { cx: -50, cy: 2000 });
    expect(docNow().stickers[0]).toMatchObject({ cx: 0, cy: 844 });
    const before = steps();
    nudgeSticker('s1', 10, 800);
    nudgeSticker('s1', 11, 800);
    nudgeSticker('s1', 12, 800);
    flushBurst();
    expect(steps()).toBe(before + 1);
    expect(docNow().stickers[0].cx).toBe(12);
  });

  it('上下（清單上層在前）', () => {
    addStickers([sticker('s1'), sticker('s2'), sticker('s3')]);
    /* 清單第 0 列（s3，最上面）往下一層 */
    moveStickerInList(0, 1);
    expect(docNow().stickers.map((s) => s.id)).toEqual(['s1', 's3', 's2']);
  });
});
