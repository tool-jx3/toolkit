/**
 * AI 誤判梗圖產生器（ai-fail）的純計算：規格的數字規則。
 * - 畫布尺寸（原圖長邊 1200、四捨五入、至少 1；1:1、3:4、4:3；沒有照片 1000 × 1000）；
 * - 照片鋪滿置中、平移與放大的夾值（一律蓋滿）、放大以畫布中心為準；
 * - 改比例時框的換算（位置大小分開乘、字級與線寬乘較小的比值後四捨五入、線寬至少 1）；
 * - 畫框（兩點拉出、門檻「大於 12」）、控制點（±半徑、優先順序）、點選（最上層、含邊上）、縮放下限 24；
 * - 標籤位置（上方／框內、靠左／置中／靠右、上方放不下時放進框內）；
 * - 上下層（清單反向、移動）、新框的 id 與預設；
 * - 讀檔整理（壞資料丟掉、夾範圍、色碼、40 字、位置夾回蓋滿）；
 * - 繪圖：方框與標籤的呼叫（顏色、線寬、字型、位置）。
 */
import { describe, expect, it } from 'vitest';
import {
  bigEnough,
  canvasSize,
  centeredView,
  clampPhotoPosition,
  clipLabel,
  coverRect,
  createBox,
  DEFAULT_COLOR,
  DEFAULT_LABEL_FONT,
  HANDLES,
  handlePoint,
  hitBox,
  hitHandle,
  initialState,
  labelPlacement,
  listToDraw,
  type MemeBox,
  type MemeState,
  moveLayer,
  NEW_BOX,
  nextBoxId,
  normalizeColor,
  normalizeState,
  panView,
  photoRect,
  rectFromPoints,
  resizeWithHandle,
  scaleBoxes,
  zoomView,
} from '@/tools/ai-fail/model';
import { drawBox, drawMeme, labelText } from '@/tools/ai-fail/render';

const box = (over: Partial<MemeBox> = {}): MemeBox => ({
  ...createBox({ x: 100, y: 200, width: 300, height: 150 }, 'b1'),
  ...over,
});

describe('畫布尺寸（規格 3.1）', () => {
  it('原圖：長邊 1200，短邊四捨五入、至少 1；小照片也放大', () => {
    expect(canvasSize('native', { width: 4000, height: 3000 })).toEqual({
      width: 1200,
      height: 900,
    });
    expect(canvasSize('native', { width: 300, height: 500 })).toEqual({ width: 720, height: 1200 });
    expect(canvasSize('native', { width: 10, height: 10 })).toEqual({ width: 1200, height: 1200 });
    expect(canvasSize('native', { width: 1000, height: 333 })).toEqual({
      width: 1200,
      height: 400,
    });
    expect(canvasSize('native', { width: 1, height: 5000 })).toEqual({ width: 1, height: 1200 });
  });
  it('沒有照片時原圖是 1000 × 1000；固定比例不看照片', () => {
    expect(canvasSize('native', null)).toEqual({ width: 1000, height: 1000 });
    for (const photo of [null, { width: 4000, height: 3000 }]) {
      expect(canvasSize('1:1', photo)).toEqual({ width: 1000, height: 1000 });
      expect(canvasSize('3:4', photo)).toEqual({ width: 900, height: 1200 });
      expect(canvasSize('4:3', photo)).toEqual({ width: 1200, height: 900 });
    }
  });
});

describe('照片：鋪滿、平移、放大', () => {
  const canvas = { width: 1000, height: 1000 };
  const photo = { width: 400, height: 300 };

  it('鋪滿：取兩個比值中較大的、置中（超出的裁掉）', () => {
    const r = coverRect(canvas, photo);
    expect(r.height).toBeCloseTo(1000);
    expect(r.width).toBeCloseTo(1333.333, 2);
    expect(r.x).toBeCloseTo(-166.667, 2);
    expect(r.y).toBeCloseTo(0);
    expect(centeredView(canvas, photo)).toEqual({ zoom: 1, x: r.x, y: r.y });
    /* 原圖比例：剛好等於畫布 */
    expect(coverRect({ width: 1200, height: 900 }, photo)).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 900,
    });
  });

  it('夾值：左緣 ≤ 0、右緣 ≥ 畫布寬（上下相同）', () => {
    const r = { x: 50, y: -2000, width: 2000, height: 1500 };
    expect(clampPhotoPosition(canvas, r)).toEqual({ x: 0, y: -500 });
    expect(clampPhotoPosition(canvas, { ...r, x: -1200, y: 10 })).toEqual({ x: -1000, y: 0 });
  });

  it('平移：從按下時的位置加位移、夾回蓋滿；放大 1 倍時只能沿長邊移動', () => {
    const start = centeredView(canvas, photo);
    const a = panView(canvas, photo, start, 100, 80);
    expect(a.x).toBeCloseTo(start.x + 100);
    expect(a.y).toBe(0);
    expect(panView(canvas, photo, start, 9999, 0).x).toBe(0);
    expect(panView(canvas, photo, start, -9999, 0).x).toBeCloseTo(-333.333, 2);
  });

  it('放大：畫布中心對著照片上的同一點，再夾值；倍率夾在 1～4', () => {
    const v1 = centeredView(canvas, photo);
    const v2 = zoomView(canvas, photo, v1, 2);
    const r2 = photoRect(canvas, photo, v2);
    expect(r2.width).toBeCloseTo(2666.667, 2);
    /* 置中時中心點仍在照片的正中央 */
    expect((500 - r2.x) / r2.width).toBeCloseTo(0.5);
    expect((500 - r2.y) / r2.height).toBeCloseTo(0.5);
    /* 平移到左上角再放大：夾值讓左上角仍是 0 */
    const corner = panView(canvas, photo, v2, 9999, 9999);
    expect(corner).toMatchObject({ x: 0, y: 0 });
    const v3 = zoomView(canvas, photo, corner, 3);
    expect(v3.zoom).toBe(3);
    const r3 = photoRect(canvas, photo, v3);
    /* 中心點 (500, 500) 原本對著照片的 500/2666.67 處，放大後仍對著同一處 */
    expect((500 - r3.x) / r3.width).toBeCloseTo(500 / r2.width);
    /* 縮回 1 倍：夾回蓋滿 */
    const back = zoomView(canvas, photo, v3, 1);
    expect(back.y).toBe(0);
    expect(back.x).toBeLessThanOrEqual(0);
    expect(back.x).toBeGreaterThanOrEqual(-333.334);
    expect(zoomView(canvas, photo, v1, 9).zoom).toBe(4);
    expect(zoomView(canvas, photo, v1, 0.2).zoom).toBe(1);
  });
});

describe('改比例時框的換算（規格 F13）', () => {
  it('位置大小分開乘、字級與線寬乘較小的比值後四捨五入、線寬至少 1', () => {
    const from = { width: 1200, height: 900 };
    const to = { width: 900, height: 1200 };
    const [a, b] = scaleBoxes(
      [
        box({ x: 120, y: 90, width: 300, height: 150 }),
        box({ id: 'b2', fontSize: 14, lineWidth: 1 }),
      ],
      from,
      to,
    );
    expect(a).toMatchObject({ x: 90, y: 120, width: 225, height: 200, fontSize: 30, lineWidth: 3 });
    /* 14 × 0.75 = 10.5 → 11；1 × 0.75 → 1 */
    expect(b).toMatchObject({ fontSize: 11, lineWidth: 1 });
    /* 放大時可能超出滑桿範圍（照舊保留） */
    const [c] = scaleBoxes(
      [box({ fontSize: 72, lineWidth: 10 })],
      { width: 1000, height: 1000 },
      { width: 1200, height: 1200 },
    );
    expect(c).toMatchObject({ fontSize: 86, lineWidth: 12 });
  });
  it('不四捨五入位置；其他欄位不變', () => {
    const [a] = scaleBoxes(
      [box({ x: 100, label: '貓', color: '#ff0000' })],
      { width: 1000, height: 1000 },
      { width: 900, height: 1200 },
    );
    expect(a.x).toBeCloseTo(90);
    expect(a.y).toBeCloseTo(240);
    expect(a).toMatchObject({ label: '貓', color: '#ff0000', id: 'b1' });
  });
});

describe('畫框、控制點與點選', () => {
  it('兩點拉出（任何方向）；寬高都要大於 12', () => {
    expect(rectFromPoints({ x: 300, y: 50 }, { x: 100, y: 250 })).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 200,
    });
    expect(bigEnough({ width: 12, height: 100 })).toBe(false);
    expect(bigEnough({ width: 100, height: 12 })).toBe(false);
    expect(bigEnough({ width: 12.01, height: 12.01 })).toBe(true);
  });

  it('新框的預設與 id', () => {
    expect(NEW_BOX).toEqual({
      label: 'object',
      color: '#59b64c',
      lineWidth: 4,
      fontSize: 40,
      labelPos: 'top',
      align: 'left',
    });
    expect(nextBoxId([])).toBe('b1');
    expect(nextBoxId([{ id: 'b3' }, { id: 'b1' }, { id: 'x9' }])).toBe('b4');
  });

  it('八個控制點：四角與四邊中點', () => {
    const b = { x: 10, y: 20, width: 100, height: 50 };
    expect(HANDLES.map((h) => handlePoint(b, h))).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 45 },
      { x: 110, y: 70 },
      { x: 60, y: 70 },
      { x: 10, y: 70 },
      { x: 10, y: 45 },
    ]);
  });

  it('按到控制點：周圍 ±半徑的正方形、取最近的', () => {
    const b = { x: 100, y: 100, width: 200, height: 100 };
    expect(hitHandle(b, { x: 115, y: 85 }, 16)).toBe('nw');
    expect(hitHandle(b, { x: 117, y: 100 }, 16)).toBeNull();
    expect(hitHandle(b, { x: 300, y: 216 }, 16)).toBe('se');
    expect(hitHandle(b, { x: 200, y: 150 }, 16)).toBeNull();
    expect(hitHandle(b, { x: 200, y: 106 }, 16)).toBe('n');
    /* 小框：好幾個控制點都在範圍內時取最近的 */
    const tiny = { x: 100, y: 100, width: 24, height: 24 };
    expect(hitHandle(tiny, { x: 112, y: 100 }, 28)).toBe('n');
    expect(hitHandle(tiny, { x: 103, y: 101 }, 28)).toBe('nw');
    expect(hitHandle(tiny, { x: 124, y: 113 }, 28)).toBe('e');
  });

  it('點選：最上層優先、邊上也算', () => {
    const list = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 },
    ];
    expect(hitBox(list, { x: 60, y: 60 })).toBe(1);
    expect(hitBox(list, { x: 10, y: 10 })).toBe(0);
    expect(hitBox(list, { x: 150, y: 150 })).toBe(1);
    expect(hitBox(list, { x: 151, y: 150 })).toBe(-1);
  });

  it('控制點縮放：對邊不動、寬高至少 24、不翻面', () => {
    const b = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeWithHandle(b, 'se', 50, 20)).toEqual({ x: 100, y: 100, width: 250, height: 120 });
    expect(resizeWithHandle(b, 'w', 30, 0)).toEqual({ x: 130, y: 100, width: 170, height: 100 });
    expect(resizeWithHandle(b, 'nw', 500, 500)).toEqual({ x: 276, y: 176, width: 24, height: 24 });
    expect(resizeWithHandle(b, 'e', -500, 0)).toEqual({ x: 100, y: 100, width: 24, height: 100 });
    expect(resizeWithHandle(b, 'n', 0, -40)).toEqual({ x: 100, y: 60, width: 200, height: 140 });
  });
});

describe('標籤位置（規格 3.4、F30）', () => {
  it('上方：字底在框上緣往上 6 px；靠左／置中／靠右對齊框的邊', () => {
    expect(labelPlacement(box())).toEqual({
      inside: false,
      x: 100,
      y: 194,
      align: 'left',
      baseline: 'bottom',
    });
    expect(labelPlacement(box({ align: 'center' }))).toMatchObject({ x: 250, y: 194 });
    expect(labelPlacement(box({ align: 'right' }))).toMatchObject({ x: 400, y: 194 });
  });
  it('框內：內距 max(10, 線寬 × 2 ＋ 4)，字頂在上緣往下一個內距', () => {
    expect(labelPlacement(box({ labelPos: 'inside' }))).toEqual({
      inside: true,
      x: 112,
      y: 212,
      align: 'left',
      baseline: 'top',
    });
    expect(labelPlacement(box({ labelPos: 'inside', lineWidth: 1 }))).toMatchObject({
      x: 110,
      y: 210,
    });
    expect(
      labelPlacement(box({ labelPos: 'inside', align: 'right', lineWidth: 10 })),
    ).toMatchObject({
      x: 376,
      y: 224,
    });
    expect(labelPlacement(box({ labelPos: 'inside', align: 'center' }))).toMatchObject({ x: 250 });
  });
  it('上方放不下（上緣 − 6 − 字級 < 0）時放進框內，設定不變', () => {
    expect(labelPlacement(box({ y: 46 })).inside).toBe(false);
    expect(labelPlacement(box({ y: 45.9 }))).toMatchObject({ inside: true, y: 45.9 + 12 });
    expect(labelPlacement(box({ y: 30, fontSize: 20 })).inside).toBe(false);
    expect(labelPlacement(box({ y: -50 })).inside).toBe(true);
  });
});

describe('上下層', () => {
  it('清單上層在前：第 i 列＝畫的順序 n − 1 − i', () => {
    expect([0, 1, 2].map((i) => listToDraw(3, i))).toEqual([2, 1, 0]);
  });
  it('移動：先拿出再插入，夾在範圍內', () => {
    expect(moveLayer(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveLayer(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveLayer(['a', 'b'], 1, 5)).toEqual(['a', 'b']);
    expect(moveLayer(['a', 'b'], 0, 5)).toEqual(['b', 'a']);
    expect(moveLayer(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
  it('清單的拖曳換算成畫的順序（反向清單的移動＝畫的順序反向的移動）', () => {
    const draw = ['D', 'C', 'B', 'A'];
    const list = [...draw].reverse();
    const movedList = moveLayer(list, 0, 2);
    expect(moveLayer(draw, listToDraw(4, 0), listToDraw(4, 2))).toEqual([...movedList].reverse());
  });
});

describe('讀檔整理（規格 3.6）', () => {
  it('看不懂的資料回到初始值', () => {
    expect(normalizeState(null)).toEqual(initialState());
    expect(normalizeState({ aspect: 'x', boxes: 'no', font: 3 })).toEqual(initialState());
    expect(initialState().font).toEqual(DEFAULT_LABEL_FONT);
    expect(DEFAULT_LABEL_FONT).toEqual({ source: 'google', family: 'Noto Sans TC', weight: 400 });
  });
  it('框：壞的丟掉、夾範圍、色碼、40 字、id 不重複', () => {
    const d = normalizeState({
      aspect: '4:3',
      boxes: [
        {
          id: 'b1',
          x: 1,
          y: 2,
          width: 0,
          height: 30,
          label: '😀'.repeat(50),
          color: '#ABC',
          lineWidth: 0,
          fontSize: 999,
          labelPos: 'x',
          align: 'right',
        },
        { id: 'b1', x: 'a', y: 2, width: 3, height: 4 },
        { id: 'b1', x: 5, y: 6, width: 70, height: 80, color: 'red', lineWidth: 6.4 },
        'junk',
      ],
    });
    expect(d.aspect).toBe('4:3');
    expect(d.boxes).toHaveLength(2);
    expect(d.boxes[0]).toMatchObject({
      id: 'b1',
      width: 1,
      height: 30,
      color: '#aabbcc',
      lineWidth: 1,
      fontSize: 400,
      labelPos: 'top',
      align: 'right',
    });
    expect(Array.from(d.boxes[0].label)).toHaveLength(40);
    expect(d.boxes[1]).toMatchObject({
      id: 'b2',
      color: DEFAULT_COLOR,
      lineWidth: 6,
      label: '',
      fontSize: 40,
    });
  });
  it('照片與位置：位置夾回蓋滿、倍率夾在 1～4', () => {
    const d = normalizeState({
      aspect: '1:1',
      photo: { id: 'aabc', name: 'cat.jpg', width: 400, height: 300 },
      view: { zoom: 7, x: 500, y: -99999 },
    });
    expect(d.photo).toEqual({ id: 'aabc', name: 'cat.jpg', width: 400, height: 300 });
    expect(d.view.zoom).toBe(4);
    expect(d.view.x).toBe(0);
    expect(d.view.y).toBeCloseTo(1000 - 4000);
    expect(normalizeState({ photo: { id: '../x', width: 1, height: 1 } }).photo).toBeNull();
    expect(normalizeState({ photo: { id: 'a1', width: 0, height: 1 } }).photo).toBeNull();
  });
  it('色碼、標籤', () => {
    expect(normalizeColor('#59B64C')).toBe('#59b64c');
    expect(normalizeColor('#fff')).toBe('#ffffff');
    expect(normalizeColor('rgb(0,0,0)')).toBe(DEFAULT_COLOR);
    expect(clipLabel('a'.repeat(41))).toHaveLength(40);
  });
  it('字型：不認得的來源用預設；字重取整百', () => {
    expect(
      normalizeState({ font: { source: 'local', family: 'Arial', weight: 650 } }).font,
    ).toEqual({
      source: 'local',
      family: 'Arial',
      weight: 700,
    });
    expect(normalizeState({ font: { source: 'cdn', family: 'X' } }).font).toEqual(
      DEFAULT_LABEL_FONT,
    );
  });
});

/** 記錄 canvas 呼叫的假 context */
function fakeCtx() {
  const calls: { op: string; args: unknown[]; state: Record<string, unknown> }[] = [];
  const state: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        calls.push({ op: prop, args, state: { ...state } });
      };
    },
    set(_t, prop: string, v) {
      state[prop] = v;
      return true;
    },
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, calls };
}

describe('繪圖（規格 3.2～3.4）', () => {
  it('方框：顏色、線寬、位置；標籤：同色、字型、對齊與位置', () => {
    const { ctx, calls } = fakeCtx();
    drawBox(ctx, box({ align: 'center', label: '貓 0.98' }), DEFAULT_LABEL_FONT);
    const stroke = calls.find((c) => c.op === 'strokeRect');
    expect(stroke?.args).toEqual([100, 200, 300, 150]);
    expect(stroke?.state).toMatchObject({ strokeStyle: '#59b64c', lineWidth: 4 });
    const text = calls.find((c) => c.op === 'fillText');
    expect(text?.args).toEqual(['貓 0.98', 250, 194]);
    expect(text?.state).toMatchObject({
      fillStyle: '#59b64c',
      textAlign: 'center',
      textBaseline: 'bottom',
    });
    expect(String(text?.state.font)).toMatch(/^400 40px "Noto Sans TC"/);
  });
  it('沒有標籤時不畫字；照片畫在目前的位置與大小、最先畫', () => {
    const { ctx, calls } = fakeCtx();
    const d: MemeState = {
      ...initialState(),
      aspect: '1:1',
      photo: { id: 'a1', name: '', width: 400, height: 300 },
      view: { zoom: 1, x: -100, y: 0 },
      boxes: [box({ label: '' }), box({ id: 'b2', label: 'object' })],
    };
    drawMeme(ctx, d, {} as CanvasImageSource);
    const ops = calls
      .map((c) => c.op)
      .filter((o) => ['clearRect', 'drawImage', 'strokeRect', 'fillText'].includes(o));
    expect(ops).toEqual(['clearRect', 'drawImage', 'strokeRect', 'strokeRect', 'fillText']);
    const img = calls.find((c) => c.op === 'drawImage');
    expect(img?.args.slice(1).map((v) => Math.round(Number(v) * 1000) / 1000)).toEqual([
      -100, 0, 1333.333, 1000,
    ]);
    expect(labelText(d)).toBe('object');
  });
});
