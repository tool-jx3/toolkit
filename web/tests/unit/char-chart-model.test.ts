/**
 * 角色分析圖產生器（char-chart）的純計算（規格 docs/refactor/specs/char-chart.md）：
 * - 四象限：軸與字的位置、按兩下的範圍、按到角色（上層優先、圖片的範圍）、位置夾在畫布裡；
 * - 契合度：每軸 50 分、相同位置 100、遠了變負；兩人每頁與平均、全體平均（只算有分數的頁）；
 * - 座標碼：格式（與原作相容）、讀入的整理、套用（同名更新、新增圓點角色、上限）；
 * - 關係圖：1／2／3 人以上的排列、13 人以上畫布變大、連線的增刪（不論方向）、隨機連線、刪除線的種類；
 * - 角色：預設顏色輪流、檔名當名字、刪除角色連帶位置與連線；
 * - 讀檔整理：壞資料丟掉、id 重編、截字、色碼、指到不存在的東西丟掉、預設頁與線。
 */
import { describe, expect, it } from 'vitest';
import {
  applyShareEntries,
  type ChartState,
  clampPosition,
  createCharacter,
  DEFAULT_LEGENDS,
  DEFAULT_PAGES,
  deleteCharacter,
  deleteLegend,
  formatScore,
  groupReport,
  hitCharacter,
  hitLabel,
  imageMarkerSize,
  initialOf,
  initialState,
  LIMITS,
  labelAnchors,
  labelTargets,
  nameFromFile,
  nextColor,
  nextId,
  normalizeColor,
  normalizeState,
  PALETTE,
  pageShareCode,
  pairReport,
  pairScore,
  parseShareCode,
  type QuadPage,
  randomLinks,
  relationLayout,
  ShareCodeError,
  scoreTone,
  toggleLink,
} from '@/tools/char-chart/model';

const page = (positions: QuadPage['positions'] = {}): QuadPage => ({
  id: 'p1',
  title: 'T',
  labels: { top: 'a', bottom: 'b', left: 'c', right: 'd' },
  positions,
});

function stateWith(n: number): ChartState {
  const d = initialState();
  for (let i = 0; i < n; i++)
    d.characters.push(createCharacter(d.characters, { name: `角色${i + 1}` }));
  return d;
}

describe('四象限的位置', () => {
  it('800 × 800：軸的半長 330；標題 (400, 35)；上下軸名離端點 25；左右軸名再往內 20、在橫軸上方 20', () => {
    const a = labelAnchors(800);
    expect(a.title).toEqual({ x: 400, y: 35 });
    expect(a.top).toEqual({ x: 400, y: 95 });
    expect(a.bottom).toEqual({ x: 400, y: 705 });
    expect(a.left).toEqual({ x: 115, y: 380 });
    expect(a.right).toEqual({ x: 685, y: 380 });
  });

  it('按兩下的範圍：標題 300 × 40、軸名 150 × 30（以字為中心、邊上不算）', () => {
    expect(labelTargets(800).map((t) => [t.key, t.w, t.h])).toEqual([
      ['title', 300, 40],
      ['top', 150, 30],
      ['bottom', 150, 30],
      ['left', 150, 30],
      ['right', 150, 30],
    ]);
    expect(hitLabel({ x: 400 + 149, y: 35 + 19 })).toBe('title');
    expect(hitLabel({ x: 400 + 150, y: 35 })).toBeNull();
    expect(hitLabel({ x: 115 - 74, y: 380 + 14 })).toBe('left');
    expect(hitLabel({ x: 685, y: 380 })).toBe('right');
    expect(hitLabel({ x: 400, y: 705 })).toBe('bottom');
    expect(hitLabel({ x: 400, y: 400 })).toBeNull();
  });

  it('按到角色：圓點 15、圖片 30 以內（不含邊上）；後面的優先；不在這一頁的不算', () => {
    const d = stateWith(3);
    const [a, b, c] = d.characters;
    b.image = { id: 'aimg', name: 'b.png', width: 100, height: 300 };
    b.marker = 'image';
    const p = page({ [a.id]: { x: 0, y: 0 }, [b.id]: { x: 40, y: 0 } });
    expect(hitCharacter(d.characters, p, { x: 12, y: 0 })).toBe(b.id);
    expect(hitCharacter(d.characters, p, { x: 10, y: 0 })).toBe(a.id);
    expect(hitCharacter(d.characters, p, { x: -14, y: 0 })).toBe(a.id);
    expect(hitCharacter(d.characters, p, { x: -16, y: 0 })).toBeNull();
    /* 圖片標記 50 × 150：整張圖的範圍也算 */
    expect(hitCharacter(d.characters, p, { x: 40, y: 75 })).toBe(b.id);
    expect(hitCharacter(d.characters, p, { x: 40, y: 76 })).toBeNull();
    /* 圓點、最小範圍 */
    expect(hitCharacter([a], p, { x: 15, y: 0 })).toBeNull();
    expect(hitCharacter([a], p, { x: 15, y: 0 }, 20)).toBe(a.id);
    expect(hitCharacter([c], p, { x: 0, y: 0 })).toBeNull();
  });

  it('圖片標記寬 50、高依比例；位置夾在畫布裡', () => {
    expect(imageMarkerSize({ width: 200, height: 100 })).toEqual({ width: 50, height: 25 });
    expect(clampPosition({ x: 500, y: -401 })).toEqual({ x: 400, y: -400 });
    expect(clampPosition({ x: 12.5, y: -3 })).toEqual({ x: 12.5, y: -3 });
  });
});

describe('契合度', () => {
  it('每軸 50 分、每 20 px 一格、差 22 格扣光；相同位置 100、遠了會是負的', () => {
    expect(pairScore({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(100);
    expect(pairScore({ x: 0, y: 0 }, { x: 440, y: 0 })).toBeCloseTo(50);
    expect(pairScore({ x: -220, y: 0 }, { x: 220, y: 440 })).toBeCloseTo(0);
    expect(pairScore({ x: 0, y: 0 }, { x: 88, y: -44 })).toBeCloseTo(85);
    expect(pairScore({ x: -400, y: -400 }, { x: 400, y: 400 })).toBeCloseTo(100 - 1600 / 8.8);
  });

  it('顯示到小數一位加 %；80 以上醒目、負的另一種顏色', () => {
    expect(formatScore(85)).toBe('85.0%');
    expect(formatScore(null)).toBe('—');
    expect(scoreTone(80)).toBe('high');
    expect(scoreTone(79.9)).toBe('normal');
    expect(scoreTone(-0.1)).toBe('low');
  });

  it('兩人：每一頁一列（有人不在那一頁時沒有分數），平均只算有分數的頁', () => {
    const d = stateWith(2);
    const [a, b] = d.characters;
    d.pages[0].positions = { [a.id]: { x: 0, y: 0 }, [b.id]: { x: 88, y: 0 } };
    d.pages[1].positions = { [a.id]: { x: 0, y: 0 } };
    d.pages[2].positions = { [a.id]: { x: 0, y: 0 }, [b.id]: { x: 0, y: 0 } };
    const r = pairReport(d, a.id, b.id);
    expect(r.rows.map((x) => x.score)).toEqual([90, null, 100]);
    expect(r.rows.map((x) => x.title)).toEqual(DEFAULT_PAGES.map((p) => p.title));
    expect(r.average).toBeCloseTo(95);
    d.pages.forEach((p) => {
      p.positions = {};
    });
    expect(pairReport(d, a.id, b.id).average).toBeNull();
  });

  it('全體：每一頁所有兩兩組合（兩人都在那一頁的）的平均，再取有分數的頁的平均', () => {
    const d = stateWith(3);
    const [a, b, c] = d.characters;
    d.pages[0].positions = {
      [a.id]: { x: 0, y: 0 },
      [b.id]: { x: 88, y: 0 },
      [c.id]: { x: 0, y: 176 },
    };
    d.pages[1].positions = { [a.id]: { x: 0, y: 0 } };
    d.pages[2].positions = { [b.id]: { x: 0, y: 0 }, [c.id]: { x: 0, y: 0 } };
    const r = groupReport(d);
    /* 第 1 頁：ab 90、ac 80、bc 100 − 10 − 20 = 70 → 80 */
    expect(r.rows[0].score).toBeCloseTo(80);
    expect(r.rows[1].score).toBeNull();
    expect(r.rows[2].score).toBe(100);
    expect(r.average).toBeCloseTo(90);
  });
});

describe('座標碼', () => {
  it('這一頁有放的角色：名字、顏色、四捨五入的位置（與原作的格式相同）', () => {
    const d = stateWith(3);
    const [a, b] = d.characters;
    const p = page({ [a.id]: { x: 10.4, y: -20.6 }, [b.id]: { x: 0, y: 0 } });
    expect(pageShareCode(d, p)).toBe(
      `[{"n":"角色1","c":"${PALETTE[0]}","x":10,"y":-21},{"n":"角色2","c":"${PALETTE[1]}","x":0,"y":0}]`,
    );
    expect(pageShareCode(d, page())).toBe('[]');
  });

  it('讀入：不是 JSON 陣列、沒有可用的項目時丟錯；看不懂的項目略過；顏色不對時留空（新角色用預設色）', () => {
    expect(() => parseShareCode('hello')).toThrow(ShareCodeError);
    expect(() => parseShareCode('{"n":"a"}')).toThrow(ShareCodeError);
    expect(() => parseShareCode('[]')).toThrow(ShareCodeError);
    expect(() => parseShareCode('[{"n":"","x":1,"y":2}]')).toThrow(ShareCodeError);
    expect(
      parseShareCode(
        '[{"n":" 艾琳 ","c":"#ABC","x":1.5,"y":-2},{"n":"x","x":"1","y":2},5,{"n":"布魯斯","c":"red","x":0,"y":0}]',
      ),
    ).toEqual([
      { name: '艾琳', color: '#aabbcc', x: 1.5, y: -2 },
      { name: '布魯斯', color: '', x: 0, y: 0 },
    ]);
  });

  it('套用：名字相同的換位置、沒有的加成新角色（圓點、碼裡的顏色），位置夾在畫布裡；角色滿了就略過', () => {
    const d = stateWith(1);
    const r = applyShareEntries(d, 1, [
      { name: '角色1', color: '#000000', x: 30, y: 40 },
      { name: '新人', color: '#123456', x: 999, y: 0 },
      { name: '無色', color: '', x: 0, y: 0 },
    ]);
    expect(r).toEqual({ added: 2, updated: 1, skipped: 0 });
    expect(d.characters.map((c) => [c.name, c.color, c.marker, c.inMap])).toEqual([
      ['角色1', PALETTE[0], 'dot', true],
      ['新人', '#123456', 'dot', true],
      ['無色', PALETTE[1], 'dot', true],
    ]);
    expect(d.pages[1].positions).toEqual({
      c1: { x: 30, y: 40 },
      c2: { x: 400, y: 0 },
      c3: { x: 0, y: 0 },
    });
    expect(d.pages[0].positions).toEqual({});
    const full = stateWith(LIMITS.characters);
    expect(applyShareEntries(full, 0, [{ name: '多的', color: '', x: 0, y: 0 }])).toEqual({
      added: 0,
      updated: 0,
      skipped: 1,
    });
  });
});

describe('關係圖的排列', () => {
  it('1 人在中央；2 人左右（半徑 ÷ 1.5），連線端點在內側；3 人以上第一個在正上方、順時針，端點朝向中心', () => {
    expect(relationLayout([])).toMatchObject({ width: 1000, height: 800, radius: 280, nodes: [] });
    expect(relationLayout(['a']).nodes).toEqual([{ id: 'a', x: 500, y: 400, ax: 500, ay: 400 }]);
    const two = relationLayout(['a', 'b']).nodes;
    expect(two[0].x).toBeCloseTo(500 - 280 / 1.5);
    expect(two[0].ax).toBeCloseTo(500 - 280 / 1.5 + 60);
    expect(two[1].x).toBeCloseTo(500 + 280 / 1.5);
    expect(two[1].ax).toBeCloseTo(500 + 280 / 1.5 - 60);
    const four = relationLayout(['a', 'b', 'c', 'd']).nodes;
    expect(four[0].x).toBeCloseTo(500);
    expect(four[0].y).toBeCloseTo(120);
    expect(four[0].ay).toBeCloseTo(180);
    expect(four[1].x).toBeCloseTo(780);
    expect(four[1].y).toBeCloseTo(400);
    expect(four[2].y).toBeCloseTo(680);
    expect(four[3].x).toBeCloseTo(220);
  });

  it('12 人以內 1000 × 800；13 人起每多一人高 +50、寬 +62.5、半徑 +20', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
    expect(relationLayout(ids(12))).toMatchObject({ width: 1000, height: 800, radius: 280 });
    expect(relationLayout(ids(13))).toMatchObject({ width: 1062.5, height: 850, radius: 300 });
    expect(relationLayout(ids(20))).toMatchObject({ width: 1500, height: 1200, radius: 440 });
  });
});

describe('連線', () => {
  it('同一對（不論方向、種類）已經有線就刪掉，沒有就連一條 from → to；同一人不連', () => {
    let r = toggleLink([], 'a', 'b', 'l1');
    expect(r).toEqual({ links: [{ from: 'a', to: 'b', legend: 'l1' }], action: 'added' });
    r = toggleLink(r.links, 'b', 'a', 'l2');
    expect(r).toEqual({ links: [], action: 'removed' });
    expect(toggleLink([], 'a', 'a', 'l1').action).toBe('none');
  });

  it('隨機連線：加「人數 − 1」條沒有的線、不重複不連自己；人或線不夠時不加；最多試條數 × 20 次', () => {
    const seq = [0, 0.5, 0.5, 0.1, 0, 0, 0.9, 0.99, 0.6];
    let i = 0;
    const rnd = () => seq[i++ % seq.length];
    const out = randomLinks(['a', 'b', 'c'], ['l1', 'l2'], [], rnd);
    expect(out).toHaveLength(2);
    for (const l of out) expect(l.from).not.toBe(l.to);
    expect(new Set(out.map((l) => [l.from, l.to].sort().join())).size).toBe(2);
    expect(randomLinks(['a'], ['l1'], [])).toEqual([]);
    expect(randomLinks(['a', 'b'], [], [])).toEqual([]);
    /* 已經連滿：試完次數就停 */
    let calls = 0;
    const counting = () => {
      calls++;
      return Math.random();
    };
    expect(
      randomLinks(['a', 'b'], ['l1'], [{ from: 'a', to: 'b', legend: 'l1' }], counting),
    ).toEqual([]);
    expect(calls).toBeLessThanOrEqual(20 * 3);
  });

  it('刪掉一種線：用到它的連線一起刪；最後一種不刪', () => {
    const d = stateWith(3);
    d.relation.links = [
      { from: 'c1', to: 'c2', legend: 'l1' },
      { from: 'c2', to: 'c3', legend: 'l2' },
    ];
    expect(deleteLegend(d, 'l1')).toBe(true);
    expect(d.relation.links).toEqual([{ from: 'c2', to: 'c3', legend: 'l2' }]);
    d.relation.legends = d.relation.legends.slice(0, 1);
    expect(deleteLegend(d, d.relation.legends[0].id)).toBe(false);
  });
});

describe('角色', () => {
  it('id 依序；預設顏色是常用色裡第一個沒人用的；有圖片時標記是圖片', () => {
    const d = stateWith(2);
    expect(d.characters.map((c) => [c.id, c.color])).toEqual([
      ['c1', PALETTE[0]],
      ['c2', PALETTE[1]],
    ]);
    d.characters[0].color = PALETTE[2];
    expect(nextColor(d.characters)).toBe(PALETTE[0]);
    expect(nextColor(PALETTE.map((color) => ({ color })))).toBe(PALETTE[0]);
    const img = createCharacter(d.characters, {
      name: 'x'.repeat(60),
      image: { id: 'a1', name: 'a.png', width: 10, height: 10 },
    });
    expect(img).toMatchObject({ id: 'c3', marker: 'image', inMap: true });
    expect(img.name).toHaveLength(LIMITS.name);
    expect(nextId('p', [{ id: 'p3' }, { id: 'x9' }])).toBe('p4');
  });

  it('檔名當名字（去掉最後的副檔名）；第一個字', () => {
    expect(nameFromFile('艾琳.png')).toBe('艾琳');
    expect(nameFromFile('my.char.webp')).toBe('my.char');
    expect(nameFromFile('.hidden')).toBe('.hidden');
    expect(nameFromFile('C:\\x\\布魯斯 .jpg')).toBe('布魯斯');
    expect(initialOf('  🐱貓')).toBe('🐱');
    expect(initialOf('')).toBe('');
  });

  it('刪掉角色：每一頁的位置與關係圖的連線一起刪', () => {
    const d = stateWith(3);
    d.pages[0].positions = { c1: { x: 0, y: 0 }, c2: { x: 1, y: 1 } };
    d.pages[2].positions = { c2: { x: 1, y: 1 } };
    d.relation.links = [
      { from: 'c1', to: 'c2', legend: 'l1' },
      { from: 'c3', to: 'c1', legend: 'l1' },
      { from: 'c3', to: 'c2', legend: 'l1' },
    ];
    deleteCharacter(d, 'c2');
    expect(d.characters.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(d.pages[0].positions).toEqual({ c1: { x: 0, y: 0 } });
    expect(d.pages[2].positions).toEqual({});
    expect(d.relation.links).toEqual([{ from: 'c3', to: 'c1', legend: 'l1' }]);
  });
});

describe('讀檔整理', () => {
  it('不是物件 → 預設（三頁、五種線、沒有角色）', () => {
    const d = normalizeState(null);
    expect(d).toEqual(initialState());
    expect(d.pages).toHaveLength(3);
    expect(d.relation.legends.map((l) => l.label)).toEqual(DEFAULT_LEGENDS.map((l) => l.label));
  });

  it('壞資料丟掉、id 重複時重編、截字、色碼、圖片、標記；不存在的角色與線的資料丟掉', () => {
    const raw = {
      characters: [
        { id: 'c1', name: '甲', color: '#ABC', image: null, marker: 'image', inMap: true },
        {
          id: 'c1',
          name: '乙'.repeat(50),
          color: 'red',
          image: { id: 'abc', name: 'x', width: 10, height: 20 },
        },
        'junk',
        {
          id: 'zz',
          name: 3,
          color: '#123456',
          image: { id: '../bad', width: 1, height: 1 },
          inMap: false,
        },
      ],
      pages: [
        {
          id: 'p1',
          title: 'T'.repeat(80),
          labels: { top: '上', left: 5 },
          positions: { c1: { x: 999, y: 1 }, c2: { x: 'a', y: 0 }, c9: { x: 0, y: 0 } },
        },
        { id: 'p1', title: '二', labels: {}, positions: {} },
      ],
      relation: {
        title: 7,
        showNames: false,
        legends: [
          { id: 'l1', label: '線', color: '#00ff00', style: 'arrow' },
          { id: 'l1', label: '線2', color: 'x', style: 'zigzag' },
        ],
        links: [
          { from: 'c1', to: 'c2', legend: 'l1' },
          { from: 'c2', to: 'c1', legend: 'l2' },
          { from: 'c1', to: 'c1', legend: 'l1' },
          { from: 'c1', to: 'c3', legend: 'l1' },
          { from: 'c1', to: 'c9', legend: 'l1' },
          { from: 'c1', to: 'c2', legend: 'l9' },
        ],
      },
    };
    const d = normalizeState(raw);
    expect(
      d.characters.map((c) => [c.id, c.name.length, c.color, c.marker, c.inMap, !!c.image]),
    ).toEqual([
      ['c1', 1, '#aabbcc', 'dot', true, false],
      ['c2', LIMITS.name, PALETTE[1], 'image', true, true],
      ['c3', 0, '#123456', 'dot', false, false],
    ]);
    expect(d.pages.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(d.pages[0].title).toHaveLength(LIMITS.title);
    expect(d.pages[0].labels).toEqual({ top: '上', bottom: '', left: '', right: '' });
    expect(d.pages[0].positions).toEqual({ c1: { x: 400, y: 1 } });
    expect(d.relation.title).toBe('角色關係圖');
    expect(d.relation.showNames).toBe(false);
    expect(d.relation.legends.map((l) => [l.id, l.color, l.style])).toEqual([
      ['l1', '#00ff00', 'arrow'],
      ['l2', PALETTE[1], 'solid'],
    ]);
    /* c3 不在關係圖上，連到它的線不要；同一對只留第一條 */
    expect(d.relation.links).toEqual([{ from: 'c1', to: 'c2', legend: 'l1' }]);
  });

  it('沒有頁面、沒有線的種類時回到預設；色碼整理', () => {
    const d = normalizeState({ pages: [], relation: { legends: [] } });
    expect(d.pages).toHaveLength(3);
    expect(d.relation.legends).toHaveLength(5);
    expect(normalizeColor('#AbCdEf')).toBe('#abcdef');
    expect(normalizeColor('rgb(1,2,3)', '#000000')).toBe('#000000');
  });
});
