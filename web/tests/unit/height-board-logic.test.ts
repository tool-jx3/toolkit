/**
 * 立繪身高比較板（height-board）的純邏輯：規格 3.1 的換算表、F11／F12 的盤面範圍、F07 的新角色位置、
 * F24／F25 的排列、兩條線的限制、清單篩選與排序、3.2 匯出尺寸的五個量測值、檔名、專案資料檢查。
 */
import { describe, expect, it } from 'vitest';
import {
  arrangeByHeight,
  arrangeEvenly,
  boardRange,
  type Character,
  clampBottomLine,
  clampTopLine,
  duplicateOf,
  exportFileName,
  exportLayout,
  exportPoint,
  fileStamp,
  formatHeight,
  formatPercent,
  geometry,
  isFiltering,
  isValidHeight,
  listRows,
  moveListRow,
  moveOrder,
  nameFromFile,
  nextX,
  placeDropped,
  placeInRow,
  resolveName,
  sanitizeBoard,
} from '../../src/tools/height-board/logic';

/* 規格 3.1 的測試圖：A＝200 × 400（內容 100 × 300 位於 (50, 60)）、B＝300 × 300（內容 150 × 200）、C＝1000 × 2000 整張不透明 */
const CROP = {
  A: { x: 50, y: 60, width: 100, height: 300 },
  B: { x: 75, y: 50, width: 150, height: 200 },
  C: { x: 0, y: 0, width: 1000, height: 2000 },
};

let seq = 0;
function char(img: keyof typeof CROP, height: number, patch: Partial<Character> = {}): Character {
  seq++;
  return {
    id: `c${seq}`,
    name: `${img}${seq}`,
    height,
    x: 0,
    top: 0,
    bottom: 100,
    visible: true,
    imageId: `img-${img}`,
    crop: CROP[img],
    ...patch,
  };
}

/** 依預設排列（第一位 5 cm，之後間隔 5 cm）放好 */
function inRow(list: Character[]): Character[] {
  const xs = placeInRow(
    5,
    list.map((c) => geometry(c).width),
  );
  return list.map((c, i) => ({ ...c, x: xs[i] }));
}

describe('名稱預設值（F05）', () => {
  it('去掉路徑與最後一個副檔名', () => {
    expect(nameFromFile('立繪.v2.png')).toBe('立繪.v2');
    expect(nameFromFile('C:\\fakepath\\小明.png')).toBe('小明');
    expect(nameFromFile('dir/sub/角色A.webp')).toBe('角色A');
    expect(nameFromFile('沒有副檔名')).toBe('沒有副檔名');
  });
  it('以「.」開頭時保留全名；空白時「未命名」', () => {
    expect(nameFromFile('.png')).toBe('.png');
    expect(nameFromFile('.hidden.png')).toBe('.hidden');
    expect(nameFromFile('')).toBe('未命名');
    expect(nameFromFile('   .png')).toBe('未命名');
  });
  it('確認時名稱欄空白（含只有空白字元）改用推得的名稱', () => {
    expect(resolveName('', '小明')).toBe('小明');
    expect(resolveName('　 ', '小明')).toBe('小明');
    expect(resolveName(' 阿花 ', '小明')).toBe('阿花');
  });
});

describe('身高（F03、主控裁定 1～1000）', () => {
  it('1～1000、0.1 為單位', () => {
    for (const ok of ['1', '160', '160.2', '1000', '0.1e1', '999.9'])
      expect(isValidHeight(ok)).toBe(true);
    for (const bad of ['', '0', '160.25', '1001', '0.5', '-5', 'abc'])
      expect(isValidHeight(bad)).toBe(false);
  });
  it('顯示：四捨五入到 0.1、去掉多餘的 0', () => {
    expect(formatHeight(160)).toBe('160');
    expect(formatHeight(160.25)).toBe('160.3');
    expect(formatHeight(152.04)).toBe('152');
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('身高換算（3.1）', () => {
  const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 2);
  it('A 160 cm：圖寬約 53.33 cm，上緣 160、下緣 0', () => {
    const g = geometry(char('A', 160));
    close(g.width, 53.333);
    close(g.imageTop, 160);
    close(g.imageBottom, 0);
    close(g.pxPerCm, 1.875);
  });
  it('B 120 cm：圖寬 90 cm', () => {
    const g = geometry(char('B', 120));
    close(g.width, 90);
    close(g.imageTop, 120);
    close(g.imageBottom, 0);
  });
  it('C 190 cm：圖寬 95 cm', () => {
    const g = geometry(char('C', 190));
    close(g.width, 95);
    close(g.imageTop, 190);
  });
  it('C 180 cm、10%／90%：圖寬 112.5、上緣 202.5、下緣 −22.5', () => {
    const g = geometry(char('C', 180, { top: 10, bottom: 90 }));
    close(g.width, 112.5);
    close(g.imageTop, 202.5);
    close(g.imageBottom, -22.5);
    /* 世界座標：y＝−高度 */
    close(g.box.y, -202.5);
    close(g.box.height, 225);
  });
  it('C 160 cm、0%／80%：圖寬 100、上緣 160、下緣 −40', () => {
    const g = geometry(char('C', 160, { top: 0, bottom: 80 }));
    close(g.width, 100);
    close(g.imageTop, 160);
    close(g.imageBottom, -40);
  });
});

describe('盤面範圍（F11、F12）', () => {
  it('上緣：最大值 × 1.06 與 180 比較、進位到 10', () => {
    expect(boardRange([char('C', 190)]).top).toBe(210);
    expect(boardRange([char('A', 160)]).top).toBe(180);
    expect(boardRange([char('C', 180, { top: 10, bottom: 90 })]).top).toBe(220);
    expect(boardRange([]).top).toBe(180);
    /* 「(最大值與 180 取大) × 1.06」會變成 200：不是這個規則 */
    expect(boardRange([char('A', 175)]).top).toBe(190);
    expect(boardRange([char('A', 170)]).top).toBe(190);
    expect(boardRange([char('A', 169)]).top).toBe(180);
  });
  it('下緣：有圖沉到地面以下時取最低的圖片下緣', () => {
    expect(boardRange([char('A', 160)]).bottom).toBe(0);
    expect(boardRange([char('A', 160), char('C', 160, { bottom: 80 })]).bottom).toBeCloseTo(-40);
  });
  it('寬度：最右側右緣＋8 cm，至少 120', () => {
    expect(boardRange([]).width).toBe(120);
    expect(boardRange(inRow([char('A', 160)])).width).toBe(120);
    expect(boardRange(inRow([char('A', 160), char('B', 120)])).width).toBeCloseTo(161.333, 2);
  });
  it('隱藏的角色不算', () => {
    const list = inRow([char('A', 160), char('C', 400, { visible: false })]);
    expect(boardRange(list)).toEqual({ top: 180, bottom: 0, width: 120 });
  });
});

describe('新角色的位置（F07）', () => {
  it('一般加入：顯示中角色的最右緣往右 5 cm；沒有時 5 cm', () => {
    expect(nextX([])).toBe(5);
    const list = inRow([char('A', 160), char('B', 120)]);
    expect(nextX(list)).toBeCloseTo(158.333, 2);
    /* 隱藏的角色不影響 */
    expect(nextX([...list, char('C', 190, { x: 500, visible: false })])).toBeCloseTo(158.333, 2);
    expect(nextX([char('C', 190, { x: 500, visible: false })])).toBe(5);
  });
  it('批次：依序往右接（間隔 5 cm）', () => {
    expect(placeInRow(10, [50, 90, 20])).toEqual([10, 65, 160]);
  });
  it('拖放：第一張中心對準放開的位置（左緣不小於 0）；之後以前一張寬度推算（主控裁定：維持舊行為）', () => {
    const xs = placeDropped(100, [90, 50]);
    expect(xs[0]).toBe(55);
    /* 前寬 90、後寬 50：間距 25 cm */
    expect(xs[1] - (xs[0] + 90)).toBe(25);
    expect(placeDropped(10, [60])).toEqual([0]);
  });
});

describe('排列（F24、F25）', () => {
  const a = char('A', 160, { x: 100 });
  const b = char('B', 120, { x: 20 });
  const c = char('C', 190, { x: 300 });
  const h = char('C', 150, { x: 999, visible: false });
  it('等間隔：依目前由左到右的順序，第一位 5 cm、間隔 5 cm，隱藏的不動', () => {
    const out = arrangeEvenly([a, b, c, h]);
    const byId = Object.fromEntries(out.map((x) => [x.id, x.x]));
    expect(byId[b.id]).toBe(5);
    expect(byId[a.id]).toBeCloseTo(5 + 90 + 5, 6);
    expect(byId[c.id]).toBeCloseTo(100 + 53.3333 + 5, 3);
    expect(byId[h.id]).toBe(999);
    /* 前後順序不變 */
    expect(out.map((x) => x.id)).toEqual([a.id, b.id, c.id, h.id]);
  });
  it('按身高：先由高到矮、再由矮到高', () => {
    const desc = arrangeByHeight([a, b, c, h], 'desc');
    const order = (list: Character[]) =>
      list
        .filter((x) => x.visible)
        .sort((p, q) => p.x - q.x)
        .map((x) => x.id);
    expect(order(desc)).toEqual([c.id, a.id, b.id]);
    expect(desc.find((x) => x.id === c.id)?.x).toBe(5);
    expect(order(arrangeByHeight([a, b, c, h], 'asc'))).toEqual([b.id, a.id, c.id]);
    expect(desc.find((x) => x.id === h.id)?.x).toBe(999);
  });
});

describe('兩條基準線（F17、F29、F30）', () => {
  it('頭頂線 ≤ 腳底線 − 5%、腳底線 ≥ 頭頂線 ＋ 5%，都在 0～100', () => {
    expect(clampTopLine(40, 100)).toBe(40);
    expect(clampTopLine(98, 100)).toBe(95);
    expect(clampTopLine(-3, 100)).toBe(0);
    expect(clampTopLine(30, 20)).toBe(15);
    expect(clampBottomLine(50, 0)).toBe(50);
    expect(clampBottomLine(10, 30)).toBe(35);
    expect(clampBottomLine(120, 0)).toBe(100);
  });
});

describe('前後順序與清單（F34、F36、F40～F42）', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const ids = (l: { id: string }[]) => l.map((x) => x.id).join('');
  it('置底、下移一層、上移一層、置頂；到頭時不變', () => {
    expect(ids(moveOrder(list, 'c', 'back'))).toBe('cabd');
    expect(ids(moveOrder(list, 'c', 'backward'))).toBe('acbd');
    expect(ids(moveOrder(list, 'b', 'forward'))).toBe('acbd');
    expect(ids(moveOrder(list, 'b', 'front'))).toBe('acdb');
    expect(ids(moveOrder(list, 'a', 'back'))).toBe('abcd');
    expect(ids(moveOrder(list, 'a', 'backward'))).toBe('abcd');
    expect(ids(moveOrder(list, 'd', 'front'))).toBe('abcd');
    expect(ids(moveOrder(list, 'd', 'forward'))).toBe('abcd');
  });
  it('清單（最前面的在最上面）的拖曳排序換算成陣列', () => {
    /* 清單：d c b a。把第 0 列（d）拖到第 2 列 → 清單 c b d a → 陣列 a d b c */
    expect(ids(moveListRow(list, 0, 2))).toBe('adbc');
    expect(ids(moveListRow(list, 3, 0))).toBe('bcda');
  });
  it('篩選：名稱包含（不分大小寫）、只列顯示中；清單最前面的在最上面', () => {
    const chars = [
      char('A', 160, { name: 'Alice' }),
      char('B', 120, { name: '小明', visible: false }),
      char('C', 190, { name: 'ALAN' }),
    ];
    expect(listRows(chars, { query: '', visibleOnly: false }).map((c) => c.name)).toEqual([
      'ALAN',
      '小明',
      'Alice',
    ]);
    expect(listRows(chars, { query: 'al', visibleOnly: false }).map((c) => c.name)).toEqual([
      'ALAN',
      'Alice',
    ]);
    expect(listRows(chars, { query: '', visibleOnly: true })).toHaveLength(2);
    expect(listRows(chars, { query: '明', visibleOnly: true })).toHaveLength(0);
    expect(isFiltering({ query: '', visibleOnly: false })).toBe(false);
    expect(isFiltering({ query: 'a', visibleOnly: false })).toBe(true);
    expect(isFiltering({ query: '', visibleOnly: true })).toBe(true);
  });
  it('複製：名稱加字尾、放在原角色右緣往右 5 cm', () => {
    const a = char('A', 160, { x: 10, top: 5, bottom: 95 });
    const copy = duplicateOf(a, 'copy', '（複本）');
    expect(copy).toMatchObject({
      id: 'copy',
      name: `${a.name}（複本）`,
      height: 160,
      top: 5,
      bottom: 95,
      imageId: a.imageId,
    });
    expect(copy.x).toBeCloseTo(10 + geometry(a).width + 5, 6);
  });
});

describe('匯出 PNG 的尺寸（3.2 的量測表）', () => {
  const A = () => char('A', 160);
  const B = () => char('B', 120);
  const C = () => char('C', 190);
  it('只有 A：156 × 354，1.875 px/cm', () => {
    const l = exportLayout(inRow([A()]));
    expect(l).toMatchObject({ width: 156, height: 354 });
    expect(l?.pxPerCm).toBeCloseTo(1.875, 6);
  });
  it('A＋B：334 × 354', () => {
    const l = exportLayout(inRow([A(), B()]));
    expect(l).toMatchObject({ width: 334, height: 354 });
    expect(l?.pxPerCm).toBeCloseTo(1.875, 6);
  });
  it('A＋B＋C：2929 × 2265，約 10.53 px/cm；刻度欄 147 px、上下邊 27 px、A 的左緣 x≈231', () => {
    const list = inRow([A(), B(), C()]);
    const l = exportLayout(list);
    expect(l).toMatchObject({ width: 2929, height: 2265, gutter: 147, margin: 27 });
    expect(l?.pxPerCm).toBeCloseTo(10.526, 3);
    if (!l) throw new Error('no layout');
    expect(exportPoint(l, list[0].x, 0).x).toBeCloseTo(231, 0);
    /* 地面線在下邊往上 27 px、210 cm 的線在上邊往下 27 px */
    expect(exportPoint(l, 0, 0).y).toBeCloseTo(2265 - 27, 0);
    expect(exportPoint(l, 0, 210).y).toBe(27);
  });
  it('只有 C、身高 20 cm：受 4,000 萬像素上限限制（約 2981 × 13792、74.5 px/cm）', () => {
    const l = exportLayout(inRow([char('C', 20)]));
    expect(l?.width).toBeCloseTo(2981, -1);
    expect(l?.height).toBeCloseTo(13792, -1);
    expect(l?.pxPerCm).toBeCloseTo(74.5, 0);
  });
  it('只有 C、160 cm、腳底線 80%：1300 × 2252、10 px/cm，含地面以下 40 cm', () => {
    const l = exportLayout(inRow([char('C', 160, { bottom: 80 })]));
    expect(l).toMatchObject({ width: 1300, height: 2252, bottom: -40, top: 180 });
    expect(l?.pxPerCm).toBeCloseTo(10, 6);
  });
  it('隱藏的角色不匯出、全部隱藏時 null', () => {
    expect(exportLayout([char('A', 160, { visible: false })])).toBeNull();
    expect(exportLayout([])).toBeNull();
    const l = exportLayout(inRow([A(), char('C', 190, { visible: false })]));
    expect(l).toMatchObject({ width: 156, height: 354 });
  });
  it('檔名：height-board_YYYYMMDD-HHMM.png（本機時間）', () => {
    const d = new Date(2026, 9, 1, 15, 51, 7);
    expect(exportFileName(d)).toBe('height-board_20261001-1551.png');
    expect(fileStamp(new Date(2026, 0, 2, 3, 4))).toBe('height-board_20260102-0304');
  });
});

describe('專案資料檢查', () => {
  it('合法的資料原樣讀回；數值夾到範圍', () => {
    const a = char('A', 160, { x: 5 });
    expect(sanitizeBoard({ characters: [a] })).toEqual({ characters: [a] });
    const odd = { ...a, height: 5000, x: -3, top: 99, bottom: 50, visible: undefined };
    expect(sanitizeBoard({ characters: [odd] })?.characters[0]).toMatchObject({
      height: 1000,
      x: 0,
      top: 95,
      bottom: 100,
      visible: true,
    });
  });
  it('格式不對時 null', () => {
    expect(sanitizeBoard(null)).toBeNull();
    expect(sanitizeBoard({})).toBeNull();
    expect(sanitizeBoard({ characters: [{ id: 'x' }] })).toBeNull();
    const a = char('A', 160);
    expect(sanitizeBoard({ characters: [a, { ...a }] })).toBeNull();
    expect(
      sanitizeBoard({ characters: [{ ...a, crop: { x: 0, y: 0, width: 0, height: 1 } }] }),
    ).toBeNull();
  });
});
