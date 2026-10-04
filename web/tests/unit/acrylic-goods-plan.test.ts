/**
 * 壓克力周邊工房（acrylic-goods）的數值規則：燈光位置（3.5）、立牌底面圖（3.2）、搖搖樂的尺寸、碰撞牆、零件、重力（3.3）、
 * 立體透視的圖層深度與底座（3.4）、匯出的影格計畫與搖晃角度（3.6）、設定的清理（2.）與圖片的檔名（F69）。
 */
import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  IMAGE_NAME_MAX,
  imageIdsOf,
  normalizeKind,
  normalizeSettings,
  RANGE,
  turn,
  withImageName,
} from '@/tools/acrylic-goods/model';
import {
  baseImageSize,
  circlePoints,
  dioramaBase,
  EXPORT_PHYSICS_RATIO,
  exportPlan,
  frameAngle,
  frameExtent,
  GRAVITY_LIMIT,
  gravityFor,
  gyroGravity,
  keyLightPosition,
  layerZ,
  partBody,
  partCount,
  SHAKE_MAX_ANGLE,
  shakerAngle,
  shakerBoundary,
  shakerDims,
  shakerWalls,
  spawnPoint,
  squarePoints,
  WALL_THICKNESS,
} from '@/tools/acrylic-goods/plan';

describe('燈光（3.5）', () => {
  it('打光盤 (x, y) → 主光 (x × 400, 300, y × 400)；預設 (0.5, 0.5) ＝ 舊版的 (200, 300, 200)', () => {
    expect(keyLightPosition({ x: 0.5, y: 0.5 })).toEqual([200, 300, 200]);
    expect(keyLightPosition({ x: -1, y: 0 })).toEqual([-400, 300, 0]);
  });
});

describe('立牌（3.2）', () => {
  it('底面圖：圓形、方形時長邊縮放到底座大小 × 1.8；依圖形狀時原尺寸', () => {
    expect(baseImageSize(200, 100, 'circle', 150)).toEqual({ width: 270, height: 135 });
    expect(baseImageSize(100, 400, 'square', 100)).toEqual({ width: 45, height: 180 });
    expect(baseImageSize(200, 100, 'contour', 150)).toEqual({ width: 200, height: 100 });
  });
});

describe('搖搖樂（3.3）', () => {
  it('尺寸：外框 1.5 倍厚、空隙 0.8 倍、零件 0.4 倍，零件在空隙中央（厚度 20 → z 23）', () => {
    expect(shakerDims(20)).toEqual({
      frameDepth: 30,
      gap: 16,
      coverZ: 31,
      partDepth: 8,
      partZ: 23,
    });
  });

  it('碰撞範圍：圓形 32 邊形、方形 4 點、依圖片＝外框 × 比例', () => {
    const c = shakerBoundary('circle', 200, 85, null);
    expect(c).toHaveLength(32);
    expect(Math.hypot(c[5].x, c[5].y)).toBeCloseTo(85, 9);
    expect(shakerBoundary('square', 200, 50, null)).toEqual(squarePoints(50));
    expect(shakerBoundary('image', 999, 50, [{ x: 10, y: -20 }])).toEqual([{ x: 5, y: -10 }]);
    expect(circlePoints(10, 4)[1].y).toBeCloseTo(10, 9);
  });

  it('碰撞牆：每段一面、牆的內側貼著邊界、兩端各長 5、高度＝空隙', () => {
    const dims = shakerDims(20);
    const walls = shakerWalls(squarePoints(85), dims);
    expect(walls).toHaveLength(4);
    for (const w of walls) {
      const dist = Math.hypot(w.x, w.y);
      expect(dist - WALL_THICKNESS / 2).toBeCloseTo(85, 6);
      expect(w.halfLength).toBeCloseTo(90, 9);
      expect(w.halfDepth).toBe(8);
      expect(w.z).toBe(23);
    }
    /* 太短的段（< 0.5）略過 */
    expect(
      shakerWalls(
        [
          { x: 0, y: 0 },
          { x: 0.2, y: 0 },
          { x: 10, y: 10 },
        ],
        dims,
      ),
    ).toHaveLength(2);
  });

  it('零件：球半徑＝縮放後寬高的大者 ÷ 2 × 0.8，質量＝寬 × 高 ÷ 100', () => {
    const b = partBody({ minX: -50, maxX: 50, minY: -25, maxY: 25 }, 50);
    expect(b).toEqual({ radius: 20, mass: 12.5, width: 50, height: 25 });
  });

  it('零件出現在外框中央、寬高各一半的範圍；總數只算有圖的', () => {
    expect(frameExtent('circle', 200, null)).toEqual({ width: 200, height: 200 });
    expect(frameExtent('image', 200, { minX: -30, maxX: 30, minY: -10, maxY: 50 })).toEqual({
      width: 60,
      height: 60,
    });
    expect(spawnPoint({ width: 200, height: 100 }, () => 0)).toEqual({ x: -50, y: -25 });
    expect(spawnPoint({ width: 200, height: 100 }, () => 1)).toEqual({ x: 50, y: 25 });
    expect(
      partCount([
        { image: 'a', qty: 3 },
        { image: null, qty: 5 },
        { image: 'b', qty: 2 },
      ]),
    ).toBe(5);
  });

  it('重力：搖晃的力＋鏡頭的下方 × 3000；陀螺儀時改用傾斜 × 30；各方向夾在 ±15000', () => {
    expect(gravityFor({ x: 0, y: 0 }, { x: 0, y: -1 }, null)).toEqual({ x: 0, y: -3000 });
    expect(gravityFor({ x: 100000, y: -5 }, { x: 0, y: -1 }, null)).toEqual({
      x: GRAVITY_LIMIT,
      y: -3005,
    });
    expect(gravityFor({ x: 10, y: 0 }, { x: 0, y: -1 }, { gamma: 10, beta: 90 })).toEqual({
      x: 310,
      y: -2700,
    });
    /* 傾斜夾在 ±90 度 */
    expect(gyroGravity({ gamma: 120, beta: -170 })).toEqual({ x: 2700, y: 2700 });
  });
});

describe('立體透視（3.4）', () => {
  it('第一張（清單最上面）在最前面，整組以 0 為中心', () => {
    expect([0, 1, 2].map((i) => layerZ(i, 3, 40))).toEqual([40, 0, -40]);
    expect([0, 1].map((i) => layerZ(i, 2, 40))).toEqual([20, -20]);
    expect(layerZ(0, 1, 40)).toBe(0);
  });
  it('底座：寬＝外框的左右範圍＋兩側邊距；深＝（張數 − 1）× 間距＋厚度＋兩側邊距', () => {
    const b = dioramaBase(
      [
        { minX: -100, maxX: 80, minY: 0, maxY: 0 },
        { minX: -60, maxX: 120, minY: 0, maxY: 0 },
      ],
      40,
      20,
      30,
    );
    expect(b).toEqual({ width: 280, depth: 40 + 20 + 60 });
  });
});

describe('匯出（3.6）', () => {
  it('轉一圈：一圈的長度＝2π ÷（速度 × 0.6），不轉時以速度 4 計；格數＝長度 × FPS 四捨五入', () => {
    const p = exportPlan('stand', 0, 20);
    expect(p.kind).toBe('spin');
    expect(p.cycle).toBeCloseTo((2 * Math.PI) / 2.4, 9);
    expect(p.frames).toBe(52);
    expect(p.duration).toBeCloseTo(2.6, 9);
    expect(exportPlan('diorama', 1, 20).frames).toBe(209);
    expect(exportPlan('stand', 10, 20).frames).toBe(21);
    expect(exportPlan('stand', 4, 30).frames).toBe(79);
  });
  it('搖搖樂：4.5 秒 × FPS（20 FPS 是 90 格）', () => {
    expect(exportPlan('shaker', 7, 20)).toMatchObject({ kind: 'shake', frames: 90, duration: 4.5 });
    expect(exportPlan('shaker', 0, 15).frames).toBe(68);
  });
  it('每格的角度：轉一圈從 0 開始、最後一格不回到 360°；搖晃最大 60°、從 0 開始', () => {
    const p = exportPlan('stand', 0, 20);
    expect(frameAngle(p, 0)).toBe(0);
    expect(frameAngle(p, 13)).toBeCloseTo(Math.PI / 2, 9);
    expect(frameAngle(p, 51)).toBeLessThan(2 * Math.PI);
    expect(shakerAngle(0)).toBe(0);
    let max = 0;
    for (let i = 0; i <= 1000; i++) max = Math.max(max, Math.abs(shakerAngle(i / 1000)));
    expect(max).toBeCloseTo(SHAKE_MAX_ANGLE, 3);
    /* 前半往一邊、後半往另一邊 */
    expect(shakerAngle(0.25)).toBeGreaterThan(0);
    expect(shakerAngle(0.75)).toBeLessThan(0);
    expect(frameAngle(exportPlan('shaker', 0, 20), 45)).toBeCloseTo(shakerAngle(0.5), 12);
  });
  it('匯出時物理每格前進影格時間的 1/3（20 FPS ＝ 1/60 秒，與舊版相同）', () => {
    expect((1 / 20) * EXPORT_PHYSICS_RATIO).toBeCloseTo(1 / 60, 12);
  });
});

describe('設定的清理', () => {
  it('不像設定時 null；空物件得到預設值', () => {
    expect(normalizeSettings(null)).toBeNull();
    expect(normalizeSettings([1])).toBeNull();
    expect(normalizeSettings({})).toEqual(defaultSettings());
  });
  it('數值夾在範圍、取整數；選項不合法時用預設', () => {
    const s = normalizeSettings({
      stand: { baseSize: 9999, baseShape: 'star', outline: 'separate', base: false },
      shaker: { frameSize: 1, padding: 70.6, parts: [{ id: 'a', image: 'x', qty: 99, scale: 5 }] },
      material: { thickness: 3, margin: 51, finish: 'matte' },
      light: { x: 3, y: 4, key: 9, ambient: -1 },
      background: { color: '#ABCDEF', transparent: true },
      spin: 11,
      export: { format: 'mp4', fps: 60, scale: 3, plays: 2, quantize: true },
    })!;
    expect(s.stand).toMatchObject({
      baseSize: 400,
      baseShape: 'circle',
      outline: 'separate',
      base: false,
    });
    expect(s.shaker.frameSize).toBe(RANGE.frameSize[0]);
    expect(s.shaker.padding).toBe(71);
    expect(s.shaker.parts[0]).toEqual({ id: 'a', image: 'x', qty: 20, scale: 20 });
    expect(s.material).toEqual({ thickness: 5, margin: 50, finish: 'matte' });
    /* 打光盤的點夾進單位圓 */
    expect(s.light).toEqual({ x: 0.6, y: 0.8, key: 2, ambient: 0 });
    expect(s.background).toEqual({ color: '#abcdef', transparent: true });
    expect(s.spin).toBe(10);
    expect(s.export).toEqual({ format: 'apng', fps: 20, scale: 1, plays: 2, quantize: true });
  });
  it('圖層：偏移夾在 ±2000、旋轉換成 0／90／180／270；重複的 id 換掉', () => {
    const s = normalizeSettings({
      diorama: {
        layers: [
          { id: 'a', image: null, x: 5000, y: -12.4, rotation: -90 },
          { id: 'a', image: 'img', x: 0, y: 0, rotation: 450 },
        ],
      },
    })!;
    expect(s.diorama.layers[0]).toMatchObject({ id: 'a', x: 2000, y: -12, rotation: 270 });
    expect(s.diorama.layers[1].id).not.toBe('a');
    expect(s.diorama.layers[1].rotation).toBe(90);
  });
  it('水平旋轉 ±90°', () => {
    expect(turn(0, -90)).toBe(270);
    expect(turn(270, 90)).toBe(0);
    expect(turn(90, 90)).toBe(180);
  });
  it('周邊種類不合法時是立牌；用到的圖不含示範圖', () => {
    expect(normalizeKind('shaker')).toBe('shaker');
    expect(normalizeKind('mug')).toBe('stand');
    const s = defaultSettings();
    s.stand.front = 'demo:hero';
    s.stand.back = 'abc';
    s.shaker.parts = [{ id: 'p', image: 'abc', qty: 1, scale: 100 }];
    s.diorama.layers = [{ id: 'l', image: 'def', x: 0, y: 0, rotation: 0 }];
    expect(imageIdsOf(s)).toEqual(['abc', 'def']);
    expect(imageIdsOf(s, true)).toEqual(['demo:hero', 'abc', 'def']);
  });
  it('檔名（F69）：只留用到的圖、去掉前後空白、最多 IMAGE_NAME_MAX 字；不是字串的拿掉', () => {
    const long = 'x'.repeat(IMAGE_NAME_MAX + 20);
    const s = normalizeSettings({
      stand: { front: 'abc', back: 'def', baseImage: 'ghi' },
      names: {
        abc: '  char.png ',
        def: long,
        ghi: 42,
        unused: 'old.png',
        'demo:hero': '示範',
      },
    })!;
    expect(s.names).toEqual({ abc: 'char.png', def: 'x'.repeat(IMAGE_NAME_MAX) });
    expect(normalizeSettings({ names: 'nope' })!.names).toEqual({});
  });
  it('檔名（F69）：放進新的圖時記下檔名，順便拿掉沒用到的圖的檔名', () => {
    const s = defaultSettings();
    s.stand.front = 'abc';
    s.names = { abc: 'front.png', gone: 'old.png' };
    expect(withImageName(s, 'def', ' back.png ')).toEqual({ abc: 'front.png', def: 'back.png' });
    /* 同一張圖（同一個 id）用最後一次的檔名；空的檔名不記 */
    expect(withImageName(s, 'abc', 'again.png')).toEqual({ abc: 'again.png' });
    expect(withImageName(s, 'def', '  ')).toEqual({ abc: 'front.png' });
  });
});
