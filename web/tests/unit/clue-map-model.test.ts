/**
 * 調查熱點圖（clue-map）的內容與規則：整理（讀回自動儲存、專案檔）、位置與大小、出現條件與「永遠不會出現」、範例。
 * 規格 2.、3.1、3.3、3.7、F10～F25、F30～F33、F40～F44。
 */
import { describe, expect, it } from 'vitest';
import {
  assetIds,
  blankState,
  boxAround,
  boxFromDrag,
  type ClueMapState,
  clampBox,
  cleanImageUrl,
  defaultBox,
  imageUrlProblem,
  isUnlocked,
  LIMITS,
  newSpot,
  normalizeState,
  oneLine,
  paragraphs,
  reachableIds,
  removeSpotFrom,
  type Spot,
  trimBox,
  unreachable,
  usesUploadedImages,
} from '@/tools/clue-map/model';
import { SAMPLE_IDS, sampleState } from '@/tools/clue-map/sample';

const spot = (id: string, patch: Partial<Spot> = {}): Spot =>
  newSpot(id, 'rect', { x: 10, y: 10, w: 20, h: 15 }, id, patch);

describe('文字', () => {
  it('單行：換行與控制字元換成空白，截到上限（以字元計，不拆開代理對）', () => {
    expect(oneLine('a\nb\tc\u0001d', 20)).toBe('a b c d');
    expect(oneLine('😀'.repeat(5), 3)).toBe('😀😀😀');
  });

  it('線索文字分段：空行分段、段內換行保留、前後空白行去掉', () => {
    expect(paragraphs('甲\n乙\n\n丙')).toEqual(['甲\n乙', '丙']);
    expect(paragraphs('\n\n甲\n\n\n\n乙\n\n')).toEqual(['甲', '乙']);
    expect(paragraphs('甲\r\n \r\n乙')).toEqual(['甲', '乙']);
    expect(paragraphs('   \n\n  ')).toEqual([]);
    expect(paragraphs('')).toEqual([]);
  });

  it('圖片網址：只收 http(s)', () => {
    expect(cleanImageUrl(' https://example.com/a.png ')).toBe('https://example.com/a.png');
    expect(cleanImageUrl('http://example.com/a.png')).toBe('http://example.com/a.png');
    expect(cleanImageUrl('javascript:alert(1)')).toBeNull();
    expect(cleanImageUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(cleanImageUrl('')).toBeNull();
    expect(cleanImageUrl(`https://e.com/${'a'.repeat(2001)}`)).toBeNull();
    /* 剛好 2000 字（以字元計）收，2001 字不收 */
    expect(cleanImageUrl(`https://e.com/${'a'.repeat(2000 - 14)}`)).not.toBeNull();
    expect(cleanImageUrl(`https://e.com/${'a'.repeat(2001 - 14)}`)).toBeNull();
  });

  it('網址欄的檢查：空白、不是 http(s) 是 invalid，超過 2000 字是 long（輸入欄不截斷，F04）', () => {
    expect(imageUrlProblem('https://example.com/a.png')).toBeNull();
    expect(imageUrlProblem('')).toBe('invalid');
    expect(imageUrlProblem('   \n')).toBe('invalid');
    expect(imageUrlProblem('example.com/a.png')).toBe('invalid');
    expect(imageUrlProblem('javascript:alert(1)')).toBe('invalid');
    expect(imageUrlProblem('https://')).toBe('invalid');
    expect(imageUrlProblem(`https://e.com/${'a'.repeat(2001 - 14)}`)).toBe('long');
    expect(imageUrlProblem(`  https://e.com/${'a'.repeat(5000)}  `)).toBe('long');
    /* 以字元計：2000 個字元但超過 2000 個 UTF-16 單位的網址仍然收 */
    expect(imageUrlProblem(`https://e.com/${'😀'.repeat(2000 - 14)}`)).toBeNull();
  });
});

describe('位置與大小', () => {
  it('clampBox：寬高夾在 [1.5, 100]、位置夾在場景內、小數 2 位', () => {
    expect(clampBox({ x: -5, y: 200, w: 0.2, h: 150 })).toEqual({ x: 0, y: 0, w: 1.5, h: 100 });
    expect(clampBox({ x: 95, y: 95, w: 20, h: 10 })).toEqual({ x: 80, y: 90, w: 20, h: 10 });
    expect(clampBox({ x: 10.12345, y: 20.5678, w: 30.111, h: 5.999 })).toEqual({
      x: 10.12,
      y: 20.57,
      w: 30.11,
      h: 6,
    });
  });

  it('trimBox：調整大小超出場景的部分切掉（對邊不動），不是整個框往內推', () => {
    /* 左邊的控點往左拉出場景：右邊不動 */
    expect(trimBox({ x: -8, y: 10, w: 39.67, h: 20 })).toEqual({ x: 0, y: 10, w: 31.67, h: 20 });
    /* 右下角拉出場景 */
    expect(trimBox({ x: 80, y: 90, w: 40, h: 30 })).toEqual({ x: 80, y: 90, w: 20, h: 10 });
    /* 全在場景內：不變；切到比最小值還小：用最小值 */
    expect(trimBox({ x: 10, y: 10, w: 20, h: 20 })).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    expect(trimBox({ x: -30, y: 10, w: 30.5, h: 20 })).toMatchObject({ x: 0, w: 1.5 });
  });

  it('新增的預設位置：矩形 22% × 16%；橢圓是正圓（邊長＝較短邊的 20%）；往右下錯開、每 6 個回到中央', () => {
    expect(defaultBox('rect', 1.5, 0)).toMatchObject({ w: 22, h: 16 });
    /* 3:2 的橫圖：高 20% ＝ 160 px（800 高），寬 = 160 / 1200 ＝ 13.33% */
    const e = defaultBox('ellipse', 1.5, 0);
    expect(e.h).toBe(20);
    expect(e.w).toBeCloseTo(13.33, 2);
    /* 直圖：寬 20% */
    const tall = defaultBox('ellipse', 0.5, 0);
    expect(tall.w).toBe(20);
    expect(tall.h).toBe(10);
    const a = defaultBox('rect', 1.5, 0);
    const b = defaultBox('rect', 1.5, 1);
    expect(b.x - a.x).toBeCloseTo(4, 5);
    expect(b.y - a.y).toBeCloseTo(4, 5);
    expect(defaultBox('rect', 1.5, 6)).toEqual(a);
  });

  it('點一下（拖曳範圍任一邊 < 1.5%）：以點為中心放預設大小；拖曳：取兩點圍出的範圍', () => {
    const around = boxAround('rect', 1.5, 50, 50);
    expect(around).toEqual({ x: 39, y: 42, w: 22, h: 16 });
    expect(boxFromDrag('rect', 1.5, { x: 50, y: 50 }, { x: 50.5, y: 70 })).toEqual(around);
    expect(boxFromDrag('rect', 1.5, { x: 60, y: 70 }, { x: 20, y: 30 })).toEqual({
      x: 20,
      y: 30,
      w: 40,
      h: 40,
    });
    /* 在邊緣點一下：夾在場景內 */
    expect(boxAround('rect', 1.5, 0, 0)).toEqual({ x: 0, y: 0, w: 22, h: 16 });
  });
});

describe('整理（讀回自動儲存、專案檔）', () => {
  it('壞掉的資料給預設；缺的欄位補預設；正確的資料原樣', () => {
    expect(normalizeState(null)).toEqual(blankState());
    expect(normalizeState('x')).toEqual(blankState());
    const sample = sampleState();
    expect(normalizeState(sample)).toEqual(sample);
    expect(normalizeState(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
  });

  it('數值夾到範圍、選項不認得用預設、字串截斷', () => {
    const s = normalizeState({
      title: 'x'.repeat(100),
      intro: 'y'.repeat(900),
      scene: { kind: 'builtin', id: 'nope' },
      look: { theme: 'neon', accent: 'red', progress: 'x', reveal: 'yes' },
      spots: [
        {
          id: 'abc123',
          name: 'n'.repeat(80),
          shape: 'star',
          x: 'abc',
          y: -50,
          w: 500,
          h: 0,
          text: 't'.repeat(3000),
          check: 'c'.repeat(100),
          memo: 'm'.repeat(2000),
          mode: 'some',
          hidden: 'x',
        },
      ],
    });
    expect(Array.from(s.title)).toHaveLength(LIMITS.title);
    expect(Array.from(s.intro)).toHaveLength(LIMITS.intro);
    expect(s.scene).toEqual({ kind: 'builtin', id: 'paper' });
    expect(s.look).toEqual(blankState().look);
    const p = s.spots[0];
    expect(p.id).toBe('abc123');
    expect(Array.from(p.name)).toHaveLength(LIMITS.name);
    expect(p.shape).toBe('rect');
    expect(p).toMatchObject({ x: 0, y: 0, w: 100, h: 1.5 });
    expect(Array.from(p.text)).toHaveLength(LIMITS.text);
    expect(Array.from(p.check)).toHaveLength(LIMITS.check);
    expect(Array.from(p.memo)).toHaveLength(LIMITS.memo);
    expect(p.mode).toBe('all');
    expect(p.hidden).toBe(false);
  });

  it('熱點最多 40 個；代號重複或不合格時重新取代號；出現條件只留存在的、不含自己的', () => {
    const many = Array.from({ length: 55 }, (_, i) => ({ id: `s${i}x`, name: `n${i}` }));
    expect(normalizeState({ spots: many }).spots).toHaveLength(LIMITS.spots);
    const s = normalizeState({
      spots: [
        { id: 'aaa', name: 'A', requires: ['aaa', 'bbb', 'zzz', 'bbb', 7], locked: true },
        { id: 'aaa', name: 'B' },
        { id: 'Bad Id!', name: 'C' },
      ],
    });
    const ids = s.spots.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('aaa');
    expect(ids[1]).not.toBe('aaa');
    expect(ids[2]).toMatch(/^h[a-z0-9]{6}$/);
    /* 'bbb' 不存在、'aaa' 是自己 */
    expect(s.spots[0].requires).toEqual([]);
  });

  it('圖片參照：只收合格的（網址只收 http(s)；上傳的圖要有合格的代號）', () => {
    const s = normalizeState({
      scene: { kind: 'url', url: 'javascript:alert(1)' },
      spots: [
        { id: 'a1x', image: { kind: 'url', url: 'https://e.com/a.png' } },
        { id: 'b1x', image: { kind: 'asset', id: 'a b', name: 'x', width: 1, height: 1 } },
        { id: 'c1x', image: { kind: 'asset', id: 'a123', name: 'x.png', width: 10, height: 20 } },
      ],
    });
    expect(s.scene).toEqual({ kind: 'builtin', id: 'paper' });
    expect(s.spots[0].image).toEqual({ kind: 'url', url: 'https://e.com/a.png', name: 'a.png' });
    expect(s.spots[1].image).toBeNull();
    expect(s.spots[2].image).toEqual({
      kind: 'asset',
      id: 'a123',
      name: 'x.png',
      width: 10,
      height: 20,
    });
  });

  it('用到的資產代號、是否用到上傳的圖', () => {
    const d: ClueMapState = {
      ...blankState(),
      scene: { kind: 'asset', id: 'aS', name: 's', width: 1, height: 1 },
      spots: [
        spot('a1x', { image: { kind: 'asset', id: 'aI', name: 'i', width: 1, height: 1 } }),
        spot('b1x', { image: { kind: 'url', url: 'https://e.com/x.png', name: 'x.png' } }),
      ],
    };
    expect(assetIds(d)).toEqual(['aS', 'aI']);
    expect(usesUploadedImages(d)).toBe(true);
    expect(usesUploadedImages(blankState())).toBe(false);
    expect(
      usesUploadedImages({
        ...d,
        scene: { kind: 'url', url: 'https://e.com/s.png', name: 's' },
        spots: [d.spots[1]],
      }),
    ).toBe(false);
  });
});

describe('出現條件', () => {
  const found = (...ids: string[]) => new Set(ids);

  it('沒有開啟、或沒指定任何熱點＝成立', () => {
    expect(isUnlocked(spot('a', { locked: false, requires: ['x'] }), found())).toBe(true);
    expect(isUnlocked(spot('a', { locked: true, requires: [] }), found())).toBe(true);
  });

  it('all：全部找到才成立；any：找到其中一個就成立', () => {
    const all = spot('a', { locked: true, requires: ['x', 'y'], mode: 'all' });
    expect(isUnlocked(all, found('x'))).toBe(false);
    expect(isUnlocked(all, found('x', 'y'))).toBe(true);
    const any = spot('a', { locked: true, requires: ['x', 'y'], mode: 'any' });
    expect(isUnlocked(any, found())).toBe(false);
    expect(isUnlocked(any, found('y'))).toBe(true);
  });

  it('連鎖：A → B → C 依序出現；循環等待與等不存在出現的熱點都「永遠不會出現」', () => {
    const chain = [
      spot('a'),
      spot('b', { locked: true, requires: ['a'] }),
      spot('c', { locked: true, requires: ['b'] }),
    ];
    expect([...reachableIds(chain)].sort()).toEqual(['a', 'b', 'c']);
    expect(unreachable(chain)).toEqual([]);

    const cycle = [
      spot('a', { locked: true, requires: ['b'] }),
      spot('b', { locked: true, requires: ['a'] }),
      spot('c', { locked: true, requires: ['b'] }),
      spot('d'),
    ];
    expect(unreachable(cycle)).toEqual([
      { id: 'a', blockers: ['b'] },
      { id: 'b', blockers: ['a'] },
      { id: 'c', blockers: ['b'] },
    ]);

    /* any：有一個會出現就夠；all：一個出不來就整個出不來 */
    const mixed = [
      spot('a'),
      spot('x', { locked: true, requires: ['x'] }),
      spot('p', { locked: true, requires: ['a', 'x'], mode: 'any' }),
      spot('q', { locked: true, requires: ['a', 'x'], mode: 'all' }),
    ];
    expect(unreachable(mixed).map((u) => u.id)).toEqual(['x', 'q']);
    expect(unreachable(mixed)[1].blockers).toEqual(['x']);
  });

  it('刪除熱點時其他熱點的條件裡的它一併拿掉（條件空了＝一開始就看得到，不會悄悄變成永遠不出現）', () => {
    const spots = [
      spot('a'),
      spot('b'),
      spot('c', { locked: true, requires: ['a', 'b'], mode: 'all' }),
    ];
    const after = removeSpotFrom(spots, 'a');
    expect(after.map((s) => s.id)).toEqual(['b', 'c']);
    expect(after[1].requires).toEqual(['b']);
    const none = removeSpotFrom(after, 'b');
    expect(none[0].requires).toEqual([]);
    expect(isUnlocked(none[0], new Set())).toBe(true);
    expect(unreachable(none)).toEqual([]);
  });
});

describe('範例（書房）', () => {
  const s = sampleState();
  const byId = (id: string) => s.spots.find((x) => x.id === id) as Spot;

  it('8 個熱點、內建場景「書房」、標題與導言', () => {
    expect(s.spots).toHaveLength(8);
    expect(s.scene).toEqual({ kind: 'builtin', id: 'study' });
    expect(s.title).toBe('舊書房的調查');
    expect(s.intro).not.toBe('');
    expect(s.spots.map((x) => x.name)).toEqual([
      '書桌',
      '書架',
      '壁爐',
      '窗戶',
      '掛畫',
      '書桌抽屜',
      '牆後保險箱',
      '地毯下的暗格',
    ]);
  });

  it('一個先找到別的線索才出現、一個要先找到兩個（全部）、一個隱藏熱點', () => {
    expect(byId(SAMPLE_IDS.drawer)).toMatchObject({
      locked: true,
      requires: [SAMPLE_IDS.shelf],
      mode: 'all',
    });
    expect(byId(SAMPLE_IDS.safe)).toMatchObject({
      locked: true,
      requires: [SAMPLE_IDS.painting, SAMPLE_IDS.drawer],
      mode: 'all',
    });
    expect(s.spots.filter((x) => x.hidden).map((x) => x.id)).toEqual([SAMPLE_IDS.hatch]);
    expect(byId(SAMPLE_IDS.hatch).shape).toBe('ellipse');
    expect(s.spots.filter((x) => !x.locked && !x.hidden)).toHaveLength(5);
  });

  it('每個熱點都有線索文字、都有 KP 備註；沒有永遠不會出現的熱點；位置都在場景內', () => {
    for (const x of s.spots) {
      expect(x.text.trim(), x.name).not.toBe('');
      expect(x.memo.trim(), x.name).not.toBe('');
      expect(x.x).toBeGreaterThanOrEqual(0);
      expect(x.y).toBeGreaterThanOrEqual(0);
      expect(x.x + x.w).toBeLessThanOrEqual(100.001);
      expect(x.y + x.h).toBeLessThanOrEqual(100.001);
    }
    expect(unreachable(s.spots)).toEqual([]);
    expect(reachableIds(s.spots).size).toBe(8);
  });
});
