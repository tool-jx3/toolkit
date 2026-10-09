/**
 * 排行榜產生器（rank-chart）的純計算：規格的數字規則。
 * - 亂數（拒絕取樣）與洗牌、開始時決定的出場順序（K 位、不重複）；
 * - 選名次、再確認、確定（已有人的名次不能選、不能改）、完成；抽選的候選；
 * - 存下來的這一局的整理（抽選中 → 揭曉、壞資料丟出錯誤）；出場順序、沒出場的角色、卡片顯示的角色；
 * - 標題的組法（英數字與中文之間自動加空格）、開始前的檢查、名單的小規則、檔名；
 * - 設定的整理（字數、範圍、選項、id 重複、照片缺尺寸）；
 * - 照片的幾何（正方形裁切 ⇄ 放大＋位置、排名者照片的填滿／完整顯示與位置）；
 * - 版面（逐字換行、自動縮小與「…」、標題預算、名次列、卡片、擺放的點擊判斷、附錄）——數值與原作相同；
 * - 原作設定檔的助詞（收尾子音）。
 */
import { describe, expect, it } from 'vitest';
import {
  buildLayout,
  cardBox,
  cardLimited,
  fitText,
  type Measure,
  missingAppendixHeight,
  missingCell,
  placementHit,
  resizeHandlePoint,
  rowParts,
  wrapText,
} from '@/tools/rank-chart/layout';
import {
  appearanceOrder,
  beginSpin,
  type Config,
  chooseRank,
  commitRank,
  cropRect,
  defaultConfig,
  displayCharId,
  fileNamePart,
  fitLongSide,
  joinWords,
  missingCharacters,
  nameFromFile,
  normalizeConfig,
  parseNames,
  portraitRect,
  type Rng,
  type Run,
  RunError,
  randomInt,
  rectToCrop,
  revealSpin,
  sanitizeRun,
  shuffled,
  spinInterval,
  spinPool,
  startProblem,
  startRun,
  THEMES,
  themeColors,
  titleParts,
} from '@/tools/rank-chart/model';
import { hasFinalConsonant, particleFor } from '@/tools/rank-chart/project';

/** 與對照腳本相同的亂數（LCG） */
const lcg = (seed: number): Rng => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
};
const seq = (values: number[]): Rng => {
  let i = 0;
  return () => values[i++];
};

/** 假的量字：每個字寬＝字級 × 0.5（全形字 × 1） */
const measure: Measure = (t, size) =>
  Array.from(t).reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.5), 0);

const config = (over: Partial<Config> = {}): Config => ({ ...defaultConfig(), ...over });

describe('亂數與洗牌', () => {
  it('randomInt：拒絕取樣（落在最後不完整的一段時重抽）', () => {
    const n = 3;
    const limit = 0x100000000 - (0x100000000 % n);
    expect(randomInt(n, seq([limit, 0xffffffff, 7]))).toBe(7 % 3);
    expect(randomInt(1, seq([123]))).toBe(0);
    expect(() => randomInt(0)).toThrow(RangeError);
  });

  it('shuffled：Fisher–Yates，從最後一張往前換（同一個亂數序列結果相同）', () => {
    const a = shuffled([1, 2, 3, 4, 5], lcg(42));
    const b = shuffled([1, 2, 3, 4, 5], lcg(42));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
    /* 亂數全是 0：每一步都和第一張換 → 2,3,4,5,1 */
    expect(shuffled([1, 2, 3, 4, 5], () => 0)).toEqual([2, 3, 4, 5, 1]);
  });

  it('對照腳本的種子 12345：10 位抽 6 位的出場順序與原作相同（Juliet > Foxtrot > Echo > Charlie > Bravo > Alpha）', () => {
    const names = [
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
      'Foxtrot',
      'Golf',
      'Hotel',
      'India',
      'Juliet',
    ];
    const c = config({
      characters: names.map((n, i) => ({
        id: `c${i + 1}`,
        name: n,
        photo: null,
        thumb: null,
        crop: { zoom: 1, x: 0, y: 0 },
      })),
    });
    const run = startRun(c, lcg(12345));
    expect(run.deck.map((id) => c.characters.find((ch) => ch.id === id)?.name)).toEqual([
      'Juliet',
      'Foxtrot',
      'Echo',
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
  });
});

describe('遊戲', () => {
  const c = config({ slots: 3 });
  const begin = (r: Run) => revealSpin(beginSpin(r) as Run);

  it('開始：K 位、不重複、都在名單裡；名次全空、between', () => {
    const run = startRun(c, lcg(1), new Date('2026-10-09T00:00:00Z'));
    expect(run.deck).toHaveLength(3);
    expect(new Set(run.deck).size).toBe(3);
    expect(run.deck.every((id) => c.characters.some((ch) => ch.id === id))).toBe(true);
    expect(run).toMatchObject({
      ranks: [null, null, null],
      turn: 0,
      phase: 'between',
      pending: null,
      startedAt: '2026-10-09T00:00:00.000Z',
    });
  });

  it('選名次：揭曉前不理、超出範圍不理；再確認時先標成待確定、可以改選；確定後鎖住', () => {
    let run = startRun(c, lcg(2));
    expect(chooseRank(run, 0, true).kind).toBe('ignored');
    expect(beginSpin({ ...run, phase: 'revealed' })).toBeNull();
    run = begin(run);
    expect(run.phase).toBe('revealed');
    expect(chooseRank(run, 3, true).kind).toBe('ignored');
    expect(chooseRank(run, -1, true).kind).toBe('ignored');
    const p = chooseRank(run, 1, true);
    expect(p.kind).toBe('pending');
    if (p.kind !== 'pending') return;
    const p2 = chooseRank(p.run, 2, true);
    expect(p2.kind === 'pending' && p2.run.pending).toBe(2);
    const done = commitRank(p.run, new Date(0)) as Run;
    expect(done.ranks[1]).toEqual({ id: run.deck[0], drawIndex: 1 });
    expect(done).toMatchObject({
      turn: 1,
      phase: 'between',
      pending: null,
      lastId: run.deck[0],
      finishedAt: null,
    });
    /* 已經有人的名次 */
    const again = begin(done);
    expect(chooseRank(again, 1, true).kind).toBe('filled');
    expect(commitRank({ ...again, pending: 1 })).toBeNull();
    expect(commitRank(again)).toBeNull();
  });

  it('不再確認：選了就直接確定；最後一位確定後 complete、記下完成時間', () => {
    let run = startRun(c, lcg(3));
    for (const i of [2, 0, 1]) {
      run = begin(run);
      const r = chooseRank(run, i, false, new Date('2026-10-09T01:00:00Z'));
      expect(r.kind).toBe('commit');
      if (r.kind === 'commit') run = r.run;
    }
    expect(run.phase).toBe('complete');
    expect(run.finishedAt).toBe('2026-10-09T01:00:00.000Z');
    expect(run.ranks.map((e) => e?.drawIndex)).toEqual([2, 3, 1]);
    expect(beginSpin(run)).toBeNull();
  });

  it('抽選的候選：還沒放進名次的所有角色（包括不會出場的）；換圖的間隔 70 ＋ 160t² ms', () => {
    let run = begin(startRun(c, lcg(4)));
    const r = chooseRank(run, 0, false);
    if (r.kind === 'commit') run = r.run;
    const pool = spinPool(c, run);
    expect(pool).toHaveLength(c.characters.length - 1);
    expect(pool.some((ch) => ch.id === run.deck[0])).toBe(false);
    expect(spinInterval(0)).toBe(70);
    expect(spinInterval(1)).toBe(230);
    expect(spinInterval(0.5)).toBe(110);
  });

  it('出場順序（揭曉的那位才算）、卡片顯示的角色、完成後沒出場的角色（名單順序）', () => {
    let run = startRun(c, lcg(5));
    expect(appearanceOrder(c, run)).toEqual([]);
    expect(displayCharId(null, 'x')).toBeNull();
    expect(displayCharId(run, 'x')).toBeNull();
    const spin = beginSpin(run) as Run;
    expect(displayCharId(spin, 'spin-id')).toBe('spin-id');
    expect(appearanceOrder(c, spin)).toEqual([]);
    run = revealSpin(spin);
    expect(displayCharId(run, null)).toBe(run.deck[0]);
    expect(appearanceOrder(c, run).map((ch) => ch.id)).toEqual([run.deck[0]]);
    expect(missingCharacters(c, run)).toEqual([]);
    for (const i of [1, 0, 2]) {
      if (run.phase !== 'revealed') run = begin(run);
      const r = chooseRank(run, i, false);
      if (r.kind === 'commit') run = r.run;
      if (run.phase === 'between') expect(displayCharId(run, null)).toBe(run.lastId);
    }
    expect(displayCharId(run, null)).toBe(run.ranks[0]?.id);
    const missing = missingCharacters(c, run).map((ch) => ch.id);
    expect(missing).toEqual(
      c.characters.filter((ch) => !run.deck.includes(ch.id)).map((ch) => ch.id),
    );
    expect(missing).toHaveLength(7);
  });

  it('整理存下來的這一局：抽選中 → 揭曉；待確定的名次已有人或不在揭曉時丟掉；壞資料丟出 RunError', () => {
    let run = begin(startRun(c, lcg(6)));
    const r = chooseRank(run, 2, false);
    if (r.kind === 'commit') run = r.run;
    const spinning = beginSpin(run) as Run;
    const fixed = sanitizeRun(JSON.parse(JSON.stringify({ ...spinning, pending: 2 })), c);
    expect(fixed?.phase).toBe('revealed');
    expect(fixed?.pending).toBeNull();
    expect(sanitizeRun({ ...revealSpin(spinning), pending: 0 }, c)?.pending).toBe(0);
    expect(sanitizeRun(null, c)).toBeNull();
    const bad = (patch: Partial<Run> | Record<string, unknown>) => () =>
      sanitizeRun({ ...run, ...patch }, c);
    expect(bad({ deck: run.deck.slice(0, 2) })).toThrow(RunError);
    expect(bad({ deck: [run.deck[0], run.deck[0], run.deck[1]] })).toThrow(RunError);
    expect(bad({ deck: ['nobody', run.deck[1], run.deck[2]] })).toThrow(RunError);
    expect(bad({ turn: 2 })).toThrow(RunError);
    expect(bad({ ranks: [{ id: run.deck[1], drawIndex: 1 }, null, null] })).toThrow(RunError);
    expect(bad({ phase: 'weird' as never })).toThrow(RunError);
    expect(() => sanitizeRun('x', c)).toThrow(RunError);
    /* 名單改了（出場的角色不在了） */
    expect(() => sanitizeRun(run, { ...c, characters: c.characters.slice(1) })).toThrow(RunError);
  });
});

describe('標題、檢查與名單', () => {
  it('joinWords：英數字與英數字／中文、日文之間加空格，中文接中文、標點直接接；韓文前後不自動加；以空白開頭時一律隔一格', () => {
    expect(joinWords('小明', '的盲選排行')).toBe('小明的盲選排行');
    expect(joinWords('Kim', '的盲選排行')).toBe('Kim 的盲選排行');
    expect(joinWords('小明', 'presents')).toBe('小明 presents');
    expect(joinWords('Kim', 'presents')).toBe('Kim presents');
    expect(joinWords('小明', '：')).toBe('小明：');
    expect(joinWords('김씨', '가 말아주는')).toBe('김씨가 말아주는');
    expect(joinWords('김씨', ' 말아주는')).toBe('김씨 말아주는');
    expect(joinWords('小明', '   ')).toBe('小明');
    /* 韓文（諺文）前後不自動加空白：助詞直接接在英數字後面（對等驗證 7.1） */
    expect(joinWords('Kim', '이 말아주는')).toBe('Kim이 말아주는');
    expect(joinWords('2024', '가')).toBe('2024가');
    expect(joinWords('K-pop', '가 말아주는')).toBe('K-pop가 말아주는');
    expect(joinWords('지수', 'abc')).toBe('지수abc');
    /* 日文照舊 */
    expect(joinWords('Kim', 'の')).toBe('Kim の');
    expect(joinWords('あ', 'B')).toBe('あ B');
  });

  it('存檔的字數上限比輸入欄多留助詞與空白的位置（連接文字 42、主題 81），讀回時不會截掉', () => {
    const n = normalizeConfig({
      intro: `가 ${'x'.repeat(45)}`,
      subject: '가'.repeat(90),
      name: 'n'.repeat(40),
    });
    expect(Array.from(n.intro)).toHaveLength(42);
    expect(Array.from(n.subject)).toHaveLength(81);
    expect(Array.from(n.name)).toHaveLength(30);
  });

  it('titleParts：名字空白時「我」、主題空白時「角色」；問題空白時沒有第三行', () => {
    expect(titleParts(config())).toEqual({
      first: '小明的盲選排行',
      second: '○○○○ 登場角色',
      third: '能交往嗎？',
    });
    expect(titleParts(config({ name: ' ', subject: '', question: '  ', intro: '' }))).toEqual({
      first: '我',
      second: '角色',
      third: '',
    });
  });

  it('開始前的檢查：名字 → 主題 → 沒有角色 → 有角色沒名稱 → 格數比人數多', () => {
    expect(startProblem(config())).toBeNull();
    expect(startProblem(config({ name: '  ' }))?.kind).toBe('name');
    expect(startProblem(config({ subject: '' }))?.kind).toBe('subject');
    expect(startProblem(config({ characters: [] }))?.kind).toBe('empty');
    const c = config();
    c.characters[3] = { ...c.characters[3], name: ' ' };
    expect(startProblem(c)).toEqual({ kind: 'unnamed', tab: 'pool', id: c.characters[3].id });
    expect(startProblem(config({ slots: 11 }))).toEqual({ kind: 'slots', tab: 'rules' });
  });

  it('一次輸入名字、檔名當名稱、匯出檔名', () => {
    expect(parseNames(` 阿光 \r\n\n小雨\n   \n${'x'.repeat(60)}`)).toEqual([
      '阿光',
      '小雨',
      'x'.repeat(50),
    ]);
    expect(nameFromFile('承恩.final.png', '角色')).toBe('承恩.final');
    expect(nameFromFile('.png', '角色')).toBe('角色');
    expect(fileNamePart('a/b:c*?"<>|d ')).toBe('a_b_c______d');
    expect(fileNamePart('   ')).toBe('rank-chart');
    expect(Array.from(fileNamePart('字'.repeat(80)))).toHaveLength(55);
  });
});

describe('設定的整理', () => {
  it('預設值：小明、6 格、1.8 秒、要再確認、4:5、奶油玫瑰、10 位範例', () => {
    const d = defaultConfig(true);
    expect(d).toMatchObject({
      slots: 6,
      spinMs: 1800,
      confirmRank: true,
      autoNext: false,
      reducedMotion: true,
      format: '4:5',
      theme: 'cream',
    });
    expect(d.characters.map((c) => c.name)).toHaveLength(10);
    expect(d.overlay).toEqual({ x: 0.5, y: 0.06, size: 0.58 });
    expect(themeColors(d)).toEqual(THEMES.cream);
    expect(themeColors({ theme: 'custom', customTheme: { ...THEMES.lilac } })).toEqual(
      THEMES.lilac,
    );
  });

  it('壞資料：字數截斷（以字元計）、數值夾範圍、選項不認得用預設、id 重複重編、照片缺尺寸當沒有', () => {
    const n = normalizeConfig({
      name: '😀'.repeat(40),
      intro: '  前後空白  ',
      slots: 99,
      spinMs: 1234,
      confirmRank: 'yes',
      format: '16:9',
      theme: 'neon',
      customTheme: { bg: '#ABCDEF', ink: 'red' },
      portrait: {
        photo: { id: 'p', width: 0, height: 10 },
        fit: 'contain',
        zoom: 9,
        x: -5,
        y: '0.5',
      },
      overlay: { x: 2, y: -1, size: 0.05 },
      characters: [
        {
          id: 'a',
          name: 'A',
          photo: { id: 'img', width: 10, height: 20 },
          thumb: 't',
          crop: { zoom: 9, x: 2, y: -3 },
        },
        { id: 'a', name: 'B', thumb: 't2' },
        { id: 'bad id!', name: 'C' },
        null,
      ],
    });
    expect(Array.from(n.name)).toHaveLength(30);
    expect(n.intro).toBe('  前後空白  ');
    expect(n).toMatchObject({
      slots: 20,
      spinMs: 1800,
      confirmRank: true,
      format: '4:5',
      theme: 'cream',
    });
    expect(n.customTheme.bg).toBe('#abcdef');
    expect(n.customTheme.ink).toBe(THEMES.cream.ink);
    expect(n.portrait).toEqual({ photo: null, fit: 'contain', zoom: 3, x: -1, y: 0.5 });
    expect(n.overlay).toEqual({ x: 1, y: 0, size: 0.2 });
    expect(n.characters).toHaveLength(3);
    expect(n.characters[0]).toMatchObject({
      id: 'a',
      photo: { id: 'img', width: 10, height: 20 },
      thumb: 't',
      crop: { zoom: 4, x: 1, y: -1 },
    });
    expect(n.characters[1].id).not.toBe('a');
    expect(n.characters[1].thumb).toBeNull();
    expect(n.characters[2].id).toMatch(/^c_/);
    expect(normalizeConfig(null).characters).toHaveLength(10);
    expect(
      normalizeConfig({ characters: Array.from({ length: 130 }, () => ({ name: 'x' })) })
        .characters,
    ).toHaveLength(120);
  });
});

describe('照片的幾何', () => {
  it('正方形裁切：邊長＝短邊 ÷ 放大；位置 −1 靠右下、+1 靠左上；反函式來回相同', () => {
    const img = { width: 400, height: 300 };
    expect(cropRect(img, { zoom: 1, x: 0, y: 0 })).toEqual({
      x: 50,
      y: 0,
      width: 300,
      height: 300,
    });
    expect(cropRect(img, { zoom: 1, x: 1, y: 0 })).toEqual({ x: 0, y: 0, width: 300, height: 300 });
    expect(cropRect(img, { zoom: 1, x: -1, y: 0 })).toEqual({
      x: 100,
      y: 0,
      width: 300,
      height: 300,
    });
    expect(cropRect(img, { zoom: 2, x: 0, y: -1 })).toEqual({
      x: 125,
      y: 150,
      width: 150,
      height: 150,
    });
    for (const crop of [
      { zoom: 1.5, x: 0.3, y: -0.7 },
      { zoom: 4, x: -1, y: 1 },
      { zoom: 1, x: 0, y: 0 },
    ]) {
      const back = rectToCrop(img, cropRect(img, crop));
      expect(back.zoom).toBeCloseTo(crop.zoom, 9);
      expect(back.x).toBeCloseTo(crop.x, 9);
      if (crop.zoom > 1) expect(back.y).toBeCloseTo(crop.y, 9);
    }
    /* 範圍太小時夾在放大 4 倍 */
    expect(rectToCrop(img, { x: 0, y: 0, width: 10, height: 10 }).zoom).toBe(4);
  });

  it('排名者照片：填滿／完整顯示 × 放大，位置相對於超出的部分', () => {
    const panel = { x: 518, y: 363.2, width: 512, height: 898.8 };
    const img = { width: 1200, height: 900 };
    const cover = portraitRect(panel, img, { fit: 'cover', zoom: 1, x: 0, y: 0 });
    expect(cover.height).toBeCloseTo(898.8);
    expect(cover.width).toBeCloseTo(1198.4);
    expect(cover.x).toBeCloseTo(518 - (1198.4 - 512) / 2);
    const right = portraitRect(panel, img, { fit: 'cover', zoom: 1, x: 1, y: 0 });
    expect(right.x).toBeCloseTo(518);
    const contain = portraitRect(panel, img, { fit: 'contain', zoom: 1, x: 0, y: -1 });
    expect(contain.width).toBeCloseTo(512);
    expect(contain.y).toBeCloseTo(363.2);
  });

  it('長邊縮小', () => {
    expect(fitLongSide(3000, 1500, 1500)).toEqual({ width: 1500, height: 750 });
    expect(fitLongSide(800, 600, 1500)).toEqual({ width: 800, height: 600 });
  });
});

describe('版面（與原作相同的數值）', () => {
  it('逐字換行與自動縮小：放不下時一次減 1 px，到下限還放不下就截短加「…」', () => {
    const m = (s: string) => s.length * 10;
    expect(wrapText(m, 'abcdefg', 35)).toEqual(['abc', 'def', 'g']);
    expect(wrapText(m, 'ab\ncd', 100)).toEqual(['ab', 'cd']);
    const f = fitText(measure, 'abcdefghij', 50, 20, 10, 1, 700);
    expect(f.size).toBe(10);
    expect(f.lines).toEqual(['abcdefghij']);
    const g = fitText(measure, 'abcdefghijklmnopqrstuvwxyz', 50, 20, 10, 1, 700);
    expect(g.size).toBe(10);
    expect(g.lines).toEqual(['abcdefghi…']);
    expect(g.height).toBeCloseTo(12.8);
  });

  it('預設（4:5、6 格、標題各一行）：標題位置、分隔線、名次列', () => {
    const l = buildLayout(config(), measure);
    expect(l.H).toBe(1350);
    expect([l.first.size, l.second.size, l.third.size]).toEqual([33, 58, 49]);
    expect(l.secondY).toBeCloseTo(91 + 33 * 1.28 + 11);
    expect(l.headerBottom).toBeCloseTo(315.2);
    expect(l.bodyY).toBeCloseTo(363.2);
    expect(l.bodyH).toBeCloseTo(898.8);
    expect(l.right).toEqual({ x: 518, y: l.bodyY, width: 512, height: l.bodyH });
    expect(l.rows).toHaveLength(6);
    expect(l.rows[0].height).toBeCloseTo((898.8 - 50) / 6);
    expect(l.rows[1].y - l.rows[0].y).toBeCloseTo(l.rows[0].height + 10);
    /* 名次少時一列最高 142 */
    expect(buildLayout(config({ slots: 2 }), measure).rows[0].height).toBe(142);
    /* 13 格以上間距 6 */
    const l13 = buildLayout(config({ slots: 13 }), measure);
    expect(l13.rows[1].y - l13.rows[0].y - l13.rows[0].height).toBeCloseTo(6);
  });

  it('標題太長時整組縮小到預算（1:1 且 11 格以上 175、其他 1:1 245、13 格以上 270、其他 360）', () => {
    const long = config({
      subject: '長'.repeat(40),
      question: '問'.repeat(40),
      format: '1:1',
      slots: 12,
    });
    const l = buildLayout(long, measure);
    expect(l.first.height + l.second.height + l.third.height).toBeCloseTo(175);
    const l2 = buildLayout({ ...long, format: '9:16', slots: 13 }, measure);
    expect(l2.first.height + l2.second.height + l2.third.height).toBeCloseTo(270);
  });

  it('卡片：寬 × 大小、上限（寬 − 44、max(75, 高 − 210)）；沒有排名者照片時置中、34%；有照片時照設定', () => {
    const c = config();
    const l = buildLayout(c, measure);
    const b = cardBox(l, c);
    expect(b.s).toBeCloseTo(512 * 0.58);
    expect(b.label).toBeCloseTo(Math.max(48, b.s * 0.23));
    expect(b.x).toBeCloseTo(518 + 22 + (468 - b.s) / 2);
    expect(b.y).toBeCloseTo(l.bodyY + 25 + (l.bodyH - b.h - 108) * 0.34);
    const big = cardBox(l, { ...c, overlay: { ...c.overlay, size: 0.9 } });
    expect(big.s).toBeCloseTo(460.8);
    const withPhoto = {
      ...c,
      portrait: { ...c.portrait, photo: { id: 'p', width: 10, height: 10 } },
      overlay: { x: 0, y: 1, size: 0.58 },
    };
    const p = cardBox(l, withPhoto);
    expect(p.x).toBeCloseTo(540);
    expect(p.y).toBeCloseTo(l.bodyY + 25 + (l.bodyH - p.h - 108));
    /* 正方形、20 格：高度不夠時變小 */
    const sq = config({ format: '1:1', slots: 20, overlay: { x: 0.5, y: 0.06, size: 0.9 } });
    const ls = buildLayout(sq, measure);
    expect(cardBox(ls, sq).s).toBeCloseTo(Math.max(75, ls.bodyH - 210));
    expect(cardLimited(ls, sq)).toBe(true);
    expect(cardLimited(l, c)).toBe(false);
  });

  it('擺放的點擊判斷：右下控點 ±36 → 卡片（上 26、左右下 13）→ 右欄的照片；右欄外不算', () => {
    const c = config();
    const l = buildLayout(c, measure);
    const b = cardBox(l, c);
    const h = resizeHandlePoint(b);
    expect(placementHit(l, b, { x: h.x + 35, y: h.y - 35 })).toBe('resize');
    expect(placementHit(l, b, { x: b.x + 10, y: b.y - 25 })).toBe('card');
    expect(placementHit(l, b, { x: b.x - 13, y: b.y + 10 })).toBe('card');
    expect(placementHit(l, b, { x: b.x - 14, y: b.y + 10 })).toBe('photo');
    expect(placementHit(l, b, { x: 520, y: l.bodyY + 5 })).toBe('photo');
    expect(placementHit(l, b, { x: 300, y: 600 })).toBeNull();
  });

  it('名次列的位置、附錄（一列 8 位，高 120 ＋ 列數 × 162 ＋ 38）', () => {
    const p = rowParts({ x: 50, y: 0, width: 440, height: 141.4 });
    expect(p.pad).toBe(13);
    expect(p.s).toBe(108);
    expect(p.imageX).toBe(50 + 48 + 13);
    expect(p.numSize).toBe(33);
    expect(p.tx).toBe(111 + 108 + 18);
    expect(p.tw).toBe(490 - 237 - 33);
    expect(missingAppendixHeight(0)).toBe(0);
    expect(missingAppendixHeight(2)).toBe(320);
    expect(missingAppendixHeight(9)).toBe(482);
    expect(missingCell(1350, 9)).toEqual({ x: 172, y: 1350 + 112 + 162 });
  });
});

describe('原作設定檔的助詞', () => {
  it('收尾子音：韓文字、單獨的子音／母音、數字、英文字', () => {
    expect(hasFinalConsonant('김씨')).toBe(false);
    expect(hasFinalConsonant('등장인물')).toBe(true);
    expect(hasFinalConsonant('ㄱ')).toBe(true);
    expect(hasFinalConsonant('ㅏ')).toBe(false);
    expect(hasFinalConsonant('3')).toBe(true);
    expect(hasFinalConsonant('2')).toBe(false);
    expect(hasFinalConsonant('Kim')).toBe(true);
    expect(hasFinalConsonant('Lee!!')).toBe(false);
  });

  it('助詞：auto 依收尾子音選이／가；이、가照用；with／topic／object／subject；none 沒有', () => {
    expect(particleFor('김씨', 'auto')).toBe('가');
    expect(particleFor('박준', 'auto')).toBe('이');
    expect(particleFor('김씨', '이')).toBe('이');
    expect(particleFor('등장인물', 'with')).toBe('과');
    expect(particleFor('친구', 'with')).toBe('와');
    expect(particleFor('친구', 'topic')).toBe('는');
    expect(particleFor('등장인물', 'object')).toBe('을');
    expect(particleFor('친구', 'subject')).toBe('가');
    expect(particleFor('친구', 'none')).toBe('');
  });
});
