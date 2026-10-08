/**
 * core/grid：方格與六角格的幾何、座標文字、距離、點擊判定、外框。
 * 數值照舊版（違法建築的 TRPG 實驗室的網格產生器、量尺、地圖編輯器）；舊版的對照值是在改寫時逐一比對過的。
 */
import { describe, expect, it } from 'vitest';
import {
  axialCenter,
  axialDistance,
  axialToOddq,
  canvasRgba,
  clientToCanvas,
  colorAlpha,
  colParity,
  columnLetters,
  exceedsCanvasLimit,
  formatCoord,
  gridLineDash,
  hexCoordIndex,
  hexCoordLabel,
  hexCorners,
  hexCornersFromAnchor,
  hexDistance,
  hexEdgeNeighbors,
  hexGridPolylines,
  hexMetrics,
  hexNeighbors,
  hexOutline,
  hexSerial,
  hexSheet,
  hexSheetCcfoliaCells,
  hexSheetCells,
  hexSheetCenter,
  hexSheetHasCell,
  hexSheetMissingEdges,
  hexSnapDelta,
  hexSnapPoints,
  linkEdges,
  loopsToSvgPath,
  nearestPoint,
  oddqOffset,
  oddqStepDistance,
  oddqStraightDistance,
  oddqToAxial,
  orientPoint,
  type Point,
  pixelToAxial,
  squareCellAt,
  squareCellCenter,
  squareCellRect,
  squareCoordIndex,
  squareCoordLabel,
  squareCorners,
  squareDistance,
  squareGridLines,
  squareNeighbors,
  squareOutline,
  squareSerial,
  squareSheetLines,
  squareSheetSize,
  squareSnapDelta,
  squareSnapPoints,
} from '@/core/grid';

const close = (a: Point, b: Point, eps = 1e-9) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

describe('方格', () => {
  it('像素 → 格子（落在格線上算右邊／下面那一格，負數也可以）', () => {
    expect(squareCellAt(0, 0, 48)).toEqual({ col: 0, row: 0 });
    expect(squareCellAt(47.9, 48, 48)).toEqual({ col: 0, row: 1 });
    expect(squareCellAt(-1, -48.5, 48)).toEqual({ col: -1, row: -2 });
  });

  it('中心、縮小後的範圍、四個角', () => {
    expect(squareCellCenter(2, 1, 48)).toEqual({ x: 120, y: 72 });
    expect(squareCellRect(1, 0, 48)).toEqual({ x: 48, y: 0, width: 48, height: 48 });
    /* 縮小 80%：四周各留 4.8 px */
    const r = squareCellRect(1, 2, 48, 0.8);
    expect(r.x).toBeCloseTo(52.8);
    expect(r.y).toBeCloseTo(100.8);
    expect(r.width).toBeCloseTo(38.4);
    expect(squareCorners(1, 1, 10)).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ]);
  });

  it('四鄰格、吸附點、拖曳吸附', () => {
    expect(squareNeighbors(3, 4)).toEqual([
      { col: 4, row: 4 },
      { col: 2, row: 4 },
      { col: 3, row: 5 },
      { col: 3, row: 3 },
    ]);
    expect(squareSnapPoints(30, 70, 48)).toEqual([
      { x: 48, y: 48, type: 'intersection' },
      { x: 24, y: 72, type: 'center' },
      { x: 24, y: 48, type: 'midpoint' },
      { x: 48, y: 72, type: 'midpoint' },
    ]);
    expect(squareSnapDelta(70, -30, 48)).toEqual({ colDelta: 1, rowDelta: -1, dx: 48, dy: -48 });
  });

  it('整張的尺寸與格線：直線 cols＋1 條、橫線 rows＋1 條，落在格子邊界上', () => {
    expect(squareSheetSize(15, 10, 48)).toEqual({ width: 720, height: 480 });
    const lines = squareSheetLines(3, 2, 10);
    expect(lines).toHaveLength(4 + 3);
    expect(lines[0]).toEqual({ from: { x: 0, y: 0 }, to: { x: 0, y: 20 } });
    expect(lines[3]).toEqual({ from: { x: 30, y: 0 }, to: { x: 30, y: 20 } });
    expect(lines[6]).toEqual({ from: { x: 0, y: 20 }, to: { x: 30, y: 20 } });
  });

  it('可見範圍的格線（四周多一格）', () => {
    const lines = squareGridLines({ left: 0, top: 0, right: 100, bottom: 50 }, 50);
    /* 直線 c＝−1～3（5 條）、橫線 r＝−1～2（4 條） */
    expect(lines).toHaveLength(9);
    expect(lines[0]).toEqual({ from: { x: -50, y: -50 }, to: { x: -50, y: 100 } });
  });
});

describe('六角格的尺寸', () => {
  it('一般：欄距＝size × √3 ÷ 2（正六角形）；網格化：欄距＝size', () => {
    const m = hexMetrics(48);
    expect(m.step).toBeCloseTo(41.5692, 4);
    expect(m.dx).toBeCloseTo(13.8564, 4);
    expect(m.dy).toBe(24);
    expect(m.width).toBeCloseTo(55.4256, 4);
    expect(m.height).toBe(48);
    const fit = hexMetrics(48, { fit: true });
    expect([fit.step, fit.width, fit.height]).toEqual([48, 64, 48]);
    const pointy = hexMetrics(48, { orientation: 'pointy', fit: true });
    expect([pointy.width, pointy.height]).toEqual([48, 64]);
  });

  it('角的順序：平頂從左上順時針，尖頂是對調 x、y；縮小以中心為準', () => {
    const m = hexMetrics(48, { fit: true });
    const c = hexCorners({ x: 100, y: 100 }, m);
    expect(c).toEqual([
      { x: 84, y: 76 },
      { x: 116, y: 76 },
      { x: 132, y: 100 },
      { x: 116, y: 124 },
      { x: 84, y: 124 },
      { x: 68, y: 100 },
    ]);
    const half = hexCorners({ x: 100, y: 100 }, m, 0.5);
    expect(half[2]).toEqual({ x: 116, y: 100 });
    const p = hexCorners({ x: 100, y: 50 }, hexMetrics(48, { orientation: 'pointy', fit: true }));
    /* 尖頂：上面那個角在中心正上方 2dx */
    expect(p[5]).toEqual({ x: 100, y: 18 });
    expect(p[2]).toEqual({ x: 100, y: 82 });
  });

  it('從左上角算的六個角與從中心算的相同（到浮點誤差）', () => {
    for (const fit of [false, true]) {
      for (const orientation of ['flat', 'pointy'] as const) {
        const m = hexMetrics(37, { fit, orientation });
        const anchor = { x: 12.5, y: 7 };
        const center = orientPoint({ x: anchor.x + m.step / 3, y: anchor.y + 37 / 2 }, orientation);
        const a = hexCornersFromAnchor(anchor, m);
        const b = hexCorners(center, m);
        for (const [i, p] of a.entries()) expect(close(p, b[i], 1e-9)).toBe(true);
      }
    }
  });
});

describe('六角格的軸座標（地圖編輯器）', () => {
  const cases = [
    { orientation: 'flat' as const, fit: false },
    { orientation: 'flat' as const, fit: true },
    { orientation: 'pointy' as const, fit: false },
    { orientation: 'pointy' as const, fit: true },
  ];

  it('原點：(0, 0) 格的外接框左上角在 (0, 0)', () => {
    for (const o of cases) {
      const m = hexMetrics(48, o);
      expect(close(axialCenter(0, 0, m), { x: m.width / 2, y: m.height / 2 })).toBe(true);
    }
    /* 平頂網格化：q 往右 48、往下半格；r 往下一格 */
    const m = hexMetrics(48, { fit: true });
    expect(axialCenter(1, 0, m)).toEqual({ x: 80, y: 48 });
    expect(axialCenter(0, 1, m)).toEqual({ x: 32, y: 72 });
    /* 尖頂網格化：q 往右一格寬、r 往下並往右半格 */
    const p = hexMetrics(48, { orientation: 'pointy', fit: true });
    expect(axialCenter(1, 0, p)).toEqual({ x: 72, y: 32 });
    expect(axialCenter(0, 1, p)).toEqual({ x: 48, y: 80 });
  });

  it('像素 → 格子：中心與中心附近的點都回到同一格', () => {
    for (const o of cases) {
      const m = hexMetrics(30, o);
      for (let q = -4; q <= 4; q++) {
        for (let r = -4; r <= 4; r++) {
          const c = axialCenter(q, r, m);
          expect(pixelToAxial(c.x, c.y, m)).toEqual({ q, r });
          expect(pixelToAxial(c.x + 3, c.y - 4, m)).toEqual({ q, r });
        }
      }
    }
  });

  it('第 i 條邊的外側就是第 i 個鄰格（兩格中心的中點＝邊的中點）', () => {
    for (const o of cases) {
      const m = hexMetrics(40, o);
      const center = axialCenter(2, -1, m);
      const corners = hexCorners(center, m);
      const dirs = hexEdgeNeighbors(o.orientation);
      hexNeighbors(2, -1, o.orientation).forEach((n, i) => {
        expect(n).toEqual({ q: 2 + dirs[i].q, r: -1 + dirs[i].r });
        const nc = axialCenter(n.q, n.r, m);
        const a = corners[i];
        const b = corners[(i + 1) % 6];
        expect(
          close(
            { x: (center.x + nc.x) / 2, y: (center.y + nc.y) / 2 },
            { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            1e-9,
          ),
        ).toBe(true);
      });
    }
  });

  it('步數距離；拖曳吸附回到整格的位移', () => {
    expect(axialDistance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(axialDistance({ q: -2, r: 3 }, { q: 1, r: -1 })).toBe(4);
    for (const o of cases) {
      const m = hexMetrics(36, o);
      const a = axialCenter(0, 0, m);
      const b = axialCenter(3, -2, m);
      const d = hexSnapDelta(b.x - a.x + 2, b.y - a.y - 3, m);
      expect([d.colDelta, d.rowDelta]).toEqual([3, -2]);
      expect(close({ x: d.dx, y: d.dy }, { x: b.x - a.x, y: b.y - a.y })).toBe(true);
    }
  });

  it('吸附點：7 格 × （中心 1＋角 6＋邊的中點 6）', () => {
    const pts = hexSnapPoints(10, 10, hexMetrics(48));
    expect(pts).toHaveLength(7 * 13);
    expect(pts.filter((p) => p.type === 'center')).toHaveLength(7);
  });

  it('可見範圍的格線：每格一條 4 點折線（3 條邊）', () => {
    const m = hexMetrics(48, { fit: true });
    const lines = hexGridPolylines({ left: 0, top: 0, right: 200, bottom: 100 }, m);
    expect(lines.length).toBeGreaterThan(20);
    for (const l of lines) expect(l).toHaveLength(4);
    /* 平頂：左上 → 右上 → 右 → 右下 */
    const pm = hexMetrics(48, { orientation: 'pointy' });
    const pl = hexGridPolylines({ left: 0, top: 0, right: 100, bottom: 100 }, pm)[0];
    /* 尖頂：從上面的角開始 */
    expect(pl[0].x).toBeCloseTo((pl[3].x + pl[0].x) / 2);
  });
});

describe('odd-q 偏移座標（量尺）', () => {
  it('與軸座標互換、奇偶', () => {
    expect(colParity(-1)).toBe(1);
    expect(colParity(-2)).toBe(0);
    for (let c = -5; c <= 5; c++)
      for (let r = -5; r <= 5; r++) {
        const a = oddqToAxial(c, r);
        expect(axialToOddq(a.q, a.r)).toEqual({ col: c, row: r });
      }
    const m = hexMetrics(48, { fit: true });
    expect(oddqOffset(1, 0, m)).toEqual({ x: 48, y: 24 });
    expect(oddqOffset(-1, -1, m)).toEqual({ x: -48, y: -24 });
  });
});

describe('座標文字', () => {
  it('欄的英文字母', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetters)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
    expect(columnLetters(-1)).toBe('');
  });

  it('5 種格式（A1 的字母不受起始編號影響；0101 負數當 0、3 位數照寫）', () => {
    expect(formatCoord(2, 3, 'hyphen', 1)).toBe('3-4');
    expect(formatCoord(2, 3, 'comma', 0)).toBe('2,3');
    expect(formatCoord(2, 3, 'zero', 1)).toBe('0304');
    expect(formatCoord(-1, 120, 'zero', 0)).toBe('00120');
    expect(formatCoord(0, 3, 'letter', 1)).toBe('A4');
    expect(formatCoord(0, 3, 'letter', 0)).toBe('A3');
    expect(formatCoord(5, 5, 'serial', 0, 42)).toBe('42');
  });

  it('方格：起點四角與流水號', () => {
    const o = { cols: 4, rows: 3, format: 'hyphen' as const, start: 0 as const };
    expect(squareCoordIndex(0, 0, 4, 3, 'br')).toEqual({ dc: 3, dr: 2 });
    expect(squareCoordLabel(0, 0, { ...o, origin: 'tl' })).toBe('0-0');
    expect(squareCoordLabel(0, 0, { ...o, origin: 'tr' })).toBe('3-0');
    expect(squareCoordLabel(0, 0, { ...o, origin: 'bl' })).toBe('0-2');
    expect(squareCoordLabel(1, 2, { ...o, origin: 'bl', format: 'letter', start: 1 })).toBe('B1');
    expect(squareSerial(1, 2, 4, 1)).toBe(10);
    expect(squareCoordLabel(3, 2, { ...o, origin: 'tl', format: 'serial', start: 1 })).toBe('12');
  });

  it('六角格：壓縮與以半列計、起點在下面時的翻轉（舊版的規則）', () => {
    const base = { cols: 3, rows: 4, origin: 'tl' as const };
    /* 壓縮：列號＝⌊半列 ÷ 2⌋ */
    expect(hexCoordIndex(1, 3, { ...base, rowMode: 'compress' })).toEqual({ dc: 1, dr: 1 });
    expect(hexCoordIndex(1, 3, { ...base, origin: 'bl', rowMode: 'compress' })).toEqual({
      dc: 1,
      dr: 0,
    });
    /* 以半列計：同一欄同奇偶的最大半列往回數，奇數欄再加 2 */
    expect(hexCoordIndex(1, 1, { ...base, rowMode: 'half' })).toEqual({ dc: 1, dr: 1 });
    expect(hexCoordIndex(1, 1, { ...base, origin: 'br', rowMode: 'half' })).toEqual({
      dc: 1,
      dr: 4,
    });
    expect(hexCoordIndex(0, 2, { ...base, origin: 'bl', rowMode: 'half' })).toEqual({
      dc: 0,
      dr: 0,
    });
  });

  it('六角格的流水號：預設排法連續編號', () => {
    /* 3 欄 × 3 半列（不錯開）：第 0、2 欄各 2 格、第 1 欄 1 格 → 0～4 */
    const sheet = hexSheet({
      cols: 3,
      rows: 3,
      size: 48,
      orientation: 'flat',
      fit: false,
      shift: false,
    });
    const labels = hexSheetCells(sheet, false).map((c) =>
      hexCoordLabel(c.col, c.row, {
        cols: 3,
        rows: 3,
        origin: 'tl',
        rowMode: 'compress',
        format: 'serial',
        start: 0,
        serialRows: 3,
      }),
    );
    expect(labels).toEqual(['0', '1', '2', '3', '4']);
    expect(hexSerial(2, 1, { rows: 3, origin: 'bl', start: 1 })).toBe(5);
  });
});

describe('距離', () => {
  it('方格 5 種算法', () => {
    expect(squareDistance(3, -4, 'manhattan')).toBe(7);
    expect(squareDistance(3, -4, 'chebyshev')).toBe(4);
    expect(squareDistance(2, 2, 'ceil')).toBe(3);
    expect(squareDistance(2, 2, 'round')).toBe(3);
    expect(squareDistance(2, 2, 'floor')).toBe(2);
    expect(squareDistance(1, 1, 'round')).toBe(1);
  });

  it('六角格：步數（odd-q、原點在偶數欄）與直線近似（＋0.14 後四捨五入）', () => {
    expect(oddqStepDistance(0, 0)).toBe(0);
    expect(oddqStepDistance(1, 0)).toBe(1);
    expect(oddqStepDistance(1, -1)).toBe(1);
    expect(oddqStepDistance(1, 1)).toBe(2);
    expect(oddqStepDistance(-1, -1)).toBe(1);
    expect(oddqStepDistance(2, -1)).toBe(2);
    expect(oddqStepDistance(0, 3)).toBe(3);
    expect(oddqStraightDistance(1, -1)).toBe(1);
    expect(oddqStraightDistance(2, 0)).toBe(2);
    expect(oddqStraightDistance(3, 0)).toBe(3);
    expect(oddqStraightDistance(4, 1)).toBe(4);
    expect(hexDistance(1, 1, 'steps')).toBe(2);
    expect(hexDistance(1, 1, 'straight')).toBe(2);
  });
});

describe('一整張六角格（網格產生器）', () => {
  it('畫布尺寸（四捨五入）與 CCFOLIA 的格數（檔名）', () => {
    const o = { cols: 15, rows: 21, size: 48, shift: false };
    expect(hexSheet({ ...o, orientation: 'flat', fit: false })).toMatchObject({
      width: 637,
      height: 528,
    });
    const fit = hexSheet({ ...o, orientation: 'flat', fit: true });
    expect([fit.width, fit.height]).toEqual([768, 528]);
    expect(hexSheetCcfoliaCells(fit)).toEqual({ cols: 30, rows: 22 });
    const pointy = hexSheet({ ...o, orientation: 'pointy', fit: false });
    expect([pointy.width, pointy.height, pointy.cols, pointy.rows]).toEqual([384, 887, 21, 15]);
    const pointyFit = hexSheet({ ...o, orientation: 'pointy', fit: true });
    expect([pointyFit.width, pointyFit.height]).toEqual([384, 1056]);
    expect(hexSheetCcfoliaCells(pointyFit)).toEqual({ cols: 16, rows: 42 });
  });

  it('格子的有無（奇偶）、順序、外圈、中心', () => {
    expect(hexSheetHasCell(0, 0, false)).toBe(true);
    expect(hexSheetHasCell(0, 1, false)).toBe(false);
    expect(hexSheetHasCell(0, 1, true)).toBe(true);
    expect(hexSheetHasCell(-1, -1, false)).toBe(true);
    const sheet = hexSheet({
      cols: 2,
      rows: 3,
      size: 48,
      orientation: 'flat',
      fit: true,
      shift: false,
    });
    expect(hexSheetCells(sheet, false)).toEqual([
      { col: 0, row: 0, inside: true },
      { col: 0, row: 2, inside: true },
      { col: 1, row: 1, inside: true },
    ]);
    const outer = hexSheetCells(sheet, true);
    expect(outer[0]).toEqual({ col: -1, row: -1, inside: false });
    expect(outer.filter((c) => c.inside)).toHaveLength(3);
    /* 網格化：第 0 欄中心 x＝(1/6 ＋ 1/3) × 48 ＋ 24＝48 */
    expect(hexSheetCenter(sheet, 0, 0)).toEqual({ x: 48, y: 24 });
    expect(hexSheetCenter(sheet, 1, 1)).toEqual({ x: 96, y: 48 });
  });

  it('只畫 3 條邊時要自己補的邊：鄰格不在範圍內才補', () => {
    const sheet = hexSheet({
      cols: 2,
      rows: 3,
      size: 48,
      orientation: 'flat',
      fit: false,
      shift: false,
    });
    expect(hexSheetMissingEdges(sheet, false, 0, 0)).toEqual({
      bottom: false,
      lowerRight: false,
      upperRight: true,
    });
    expect(hexSheetMissingEdges(sheet, false, 1, 1)).toEqual({
      bottom: true,
      lowerRight: true,
      upperRight: true,
    });
  });
});

describe('點擊判定', () => {
  it('最近的點；距離相同取先出現的；超過上限是 null（剛好等於還算）', () => {
    const pts = [
      { x: 0, y: 0, id: 'a' },
      { x: 10, y: 0, id: 'b' },
    ];
    expect(nearestPoint(pts, 4, 0)?.id).toBe('a');
    expect(nearestPoint(pts, 5, 0)?.id).toBe('a');
    expect(nearestPoint(pts, 6, 0)?.id).toBe('b');
    expect(nearestPoint(pts, 10, 3, 3)?.id).toBe('b');
    expect(nearestPoint(pts, 10, 3.1, 3)).toBeNull();
    expect(nearestPoint([], 0, 0)).toBeNull();
  });

  it('滑鼠位置 → 畫布座標（CSS 縮放）', () => {
    expect(
      clientToCanvas(150, 75, { left: 100, top: 50, width: 200, height: 100 }, 400, 200),
    ).toEqual({
      x: 100,
      y: 50,
    });
  });
});

describe('外框（填色合併）', () => {
  it('方格：2 × 2 是一個迴圈；中間空一格的 3 × 3 是兩個迴圈（外框＋洞）', () => {
    const block = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ];
    const loops = squareOutline(block, 10);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(8);
    const ring = [];
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 3; r++) if (c !== 1 || r !== 1) ring.push({ col: c, row: r });
    expect(squareOutline(ring, 10)).toHaveLength(2);
    expect(
      loopsToSvgPath([
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      ]),
    ).toBe('M 0 0 L 1 0 L 1 1 z');
  });

  it('六角格：一格 6 點；相鄰兩格 10 點', () => {
    const m = hexMetrics(48, { fit: true });
    expect(hexOutline([{ q: 0, r: 0 }], m)[0]).toHaveLength(6);
    const two = hexOutline(
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      m,
    );
    expect(two).toHaveLength(1);
    expect(two[0]).toHaveLength(10);
    expect(linkEdges([])).toEqual([]);
  });
});

describe('畫布小工具', () => {
  it('線型與 rgba 字串（透明度寫到小數 4 位）', () => {
    expect(gridLineDash('solid', 2)).toEqual([]);
    expect(gridLineDash('dashed', 2)).toEqual([8, 6]);
    expect(gridLineDash('dotted', 2)).toEqual([2, 5]);
    expect(canvasRgba('#00e5ff')).toBe('rgba(0,229,255,1.0000)');
    expect(canvasRgba('#ff008080')).toBe('rgba(255,0,128,0.5020)');
    expect(canvasRgba('#ff008080', 0.5)).toBe('rgba(255,0,128,0.2510)');
    expect(canvasRgba('#ff008080', 1, 1)).toBe('rgba(255,0,128,1.0000)');
    expect(colorAlpha('#00000000')).toBe(0);
  });

  it('畫布上限', () => {
    expect(exceedsCanvasLimit(720, 720)).toBe(false);
    expect(exceedsCanvasLimit(32768, 10)).toBe(true);
    expect(exceedsCanvasLimit(8200, 8200)).toBe(false);
    expect(exceedsCanvasLimit(20000, 20000)).toBe(true);
    expect(exceedsCanvasLimit(0, 10)).toBe(true);
  });
});
