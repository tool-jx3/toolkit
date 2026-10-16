/**
 * 動態對話泡泡產生器：泡泡裡的部分文字格式（2026-10 第二步，規格 F70～F74、3.15）——
 * 資料（第 3 版、migrate、內文格式的整理）、版面（格式化的字寬、換行、對齊、字距）、繪圖（粗體、斜體、刪除線、底線、
 * 文字顏色、螢光筆、整個泡泡的斜體／刪除線／底線）、逐字出現（格式跟著字）、復原（一次套用＝一步）、樣式檔。
 * 字寬用假的量測（全形＝字級、半形＝0.5 字級；粗體 × 1.25）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { docText, plainDoc, type RichDoc, type RichRun } from '../../src/core/richtext';
import type { MeasureFn } from '../../src/core/typeset/measure';
import { buildImport, parseChat } from '../../src/tools/speech-bubble/chatImport';
import { drawBubble, FULL_TEXT, type TextState } from '../../src/tools/speech-bubble/draw';
import {
  type BubbleLayout,
  cachedUnit,
  type LayoutInput,
  layoutBubble,
} from '../../src/tools/speech-bubble/layout';
import {
  BASE_SETTINGS,
  bubbleDoc,
  DEFAULT_FMT,
  type Fmt,
  MAX_TEXT,
  normalizeBubble,
  normalizeData,
  normalizeFmt,
  richContent,
} from '../../src/tools/speech-bubble/model';
import { defaultData } from '../../src/tools/speech-bubble/presets';
import { buildScene } from '../../src/tools/speech-bubble/scene';
import {
  addBubble,
  DATA_VERSION,
  duplicateBubble,
  flushTextHistory,
  normalize,
  setBubbleRich,
  useSb,
} from '../../src/tools/speech-bubble/store';
import {
  captureStyle,
  parseStyleFile,
  styleFileJson,
} from '../../src/tools/speech-bubble/stylePresets';
import { styleDefaults } from '../../src/tools/speech-bubble/styles';
import { recordCanvas } from '../helpers/canvasRecorder';

const boldFont = (font: string) => /(?:^|\s)[7-9]00\s/.test(font);
const fakeMeasure: MeasureFn = (font, ch) => {
  const px = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const w = (ch.charCodeAt(0) > 0x24f ? px : px * 0.5) * (boldFont(font) ? 1.25 : 1);
  return { w, l: 0, r: w, a: px * 0.8, d: px * 0.2 };
};
const unit = cachedUnit(fakeMeasure);

const run = (text: string, more: Partial<RichRun> = {}): RichRun => ({
  text,
  bold: false,
  color: '',
  ...more,
});
const doc = (...lines: RichRun[][]): RichDoc => ({ lines: lines.map((runs) => ({ runs })) });

const input = (o: Partial<LayoutInput> = {}): LayoutInput => ({
  style: 'messenger',
  title: '',
  text: '你好',
  icon: 'none',
  button: '',
  align: 'left',
  ...o,
});
const withRich = (rich: RichDoc, o: Partial<LayoutInput> = {}): LayoutInput =>
  input({ text: docText(rich), rich, ...o });
const base = {
  font: { source: 'google' as const, family: 'Noto Sans TC', weight: 500 },
  fontSize: 20,
  lineHeight: 1.5,
  wrapWidth: 200,
  shadow: true,
};
const lay = (b: LayoutInput, f: Partial<Fmt> = {}, wrapWidth = 200): BubbleLayout =>
  layoutBubble(b, { ...base, wrapWidth, fmt: { ...DEFAULT_FMT, ...f } }, unit);

const COLORS = { fill: '#ffffff', border: '#000000', text: '#222222', accent: '#3366ff' };
const draw = (L: BubbleLayout, text: TextState = FULL_TEXT) => {
  const r = recordCanvas();
  drawBubble(
    r.ctx,
    L,
    { colors: COLORS, icon: 'none' },
    { shadow: false, u: 1, seed: 1, text, shine: null, scan: null },
  );
  return r.log as unknown[][];
};

/** 每次 fillText 時的字型與顏色 */
function texts(log: unknown[][]) {
  let font = '';
  let fill = '';
  const out: { s: string; font: string; fill: string; x: number }[] = [];
  for (const c of log) {
    if (c[0] === '=' && c[1] === 'font') font = String(c[2]);
    if (c[0] === '=' && c[1] === 'fillStyle') fill = String(c[2]);
    if (c[0] === 'fillText') out.push({ s: String(c[1]), font, fill, x: Number(c[2]) });
  }
  return out;
}
/** fillText 之後（字的上面）與之前（字的下面）畫的矩形 */
function rects(log: unknown[][]) {
  const first = log.findIndex((c) => c[0] === 'fillText');
  const last = log.map((c) => c[0]).lastIndexOf('fillText');
  let fill = '';
  const before: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  const after: typeof before = [];
  log.forEach((c, i) => {
    if (c[0] === '=' && c[1] === 'fillStyle') fill = String(c[2]);
    if (c[0] !== 'fillRect') return;
    const r = { x: c[1] as number, y: c[2] as number, w: c[3] as number, h: c[4] as number, fill };
    if (i < first) before.push(r);
    else if (i > last) after.push(r);
  });
  return { before, after };
}

/* ---------- 資料 ---------- */

describe('資料第 3 版：內文的格式', () => {
  it('整理：留下粗體、斜體、刪除線、底線、顏色、螢光筆；字級、字型、段落屬性丟掉', () => {
    const rich = {
      lines: [
        {
          runs: [
            run('粗', { bold: true }),
            run('體', { color: '#FF0000', size: 40, font: 'X', italic: true }),
          ],
          align: 'center',
          pageBreak: true,
        },
        { runs: [run('b', { underline: true, strike: true, highlight: '#FFF0A8' })] },
      ],
    };
    const b = normalizeBubble({ style: 'messenger', text: '粗體\nb', rich }, styleDefaults);
    expect(b.rich).toEqual(
      doc(
        [run('粗', { bold: true }), run('體', { color: '#ff0000', italic: true })],
        [run('b', { strike: true, underline: true, highlight: '#fff0a8' })],
      ),
    );
  });

  it('和內文不一致、格式壞掉、沒有任何格式時不留 rich', () => {
    const r = doc([run('甲', { bold: true })]);
    expect(normalizeBubble({ text: '乙', rich: r }, styleDefaults).rich).toBeUndefined();
    expect(
      normalizeBubble(
        { text: '甲', rich: { lines: [{ runs: [{ text: '甲', bold: 'x' }] }] } },
        styleDefaults,
      ).rich,
    ).toBeUndefined();
    const plain = normalizeBubble({ text: '甲', rich: doc([run('甲')]) }, styleDefaults);
    expect('rich' in plain).toBe(false);
    expect(normalizeBubble({ text: '甲', rich: r }, styleDefaults).rich).toEqual(r);
  });

  it('編輯區的內容 → 內文與格式；超過字數上限時截掉（格式不算字數）', () => {
    expect(richContent(doc([run('一'), run('二', { bold: true })], []))).toEqual({
      text: '一二\n',
      rich: doc([run('一'), run('二', { bold: true })], []),
    });
    expect(richContent(doc([run('一二')]))).toEqual({ text: '一二' });
    const long = doc([run('字'.repeat(MAX_TEXT + 30), { italic: true })]);
    const c = richContent(long);
    expect(Array.from(c.text)).toHaveLength(MAX_TEXT);
    expect(c.rich && docText(c.rich)).toBe(c.text);
    expect(bubbleDoc({ text: '甲\n乙' })).toEqual(plainDoc('甲\n乙', ''));
    expect(bubbleDoc({ text: '甲', rich: doc([run('甲', { bold: true })]) })).toEqual(
      doc([run('甲', { bold: true })]),
    );
    /* rich 和內文不一致（不該發生）：照內文顯示 */
    expect(bubbleDoc({ text: '乙', rich: doc([run('甲', { bold: true })]) })).toEqual(
      plainDoc('乙', ''),
    );
  });

  it('第 2 版的資料照常讀：整個泡泡的斜體、刪除線、底線補 false；整理兩次相同', () => {
    expect(DATA_VERSION).toBe(3);
    const v2 = JSON.parse(JSON.stringify(defaultData()));
    for (const b of v2.bubbles) {
      delete b.fmt.italic;
      delete b.fmt.strike;
      delete b.fmt.underline;
    }
    const d = normalize(v2)!;
    for (const b of d.bubbles) {
      expect(b.fmt).toMatchObject({ italic: false, strike: false, underline: false });
      expect('rich' in b).toBe(false);
    }
    expect(d.sides.left.fmt.italic).toBe(false);
    d.bubbles[0] = {
      ...d.bubbles[0],
      text: '甲乙',
      rich: doc([run('甲', { bold: true }), run('乙')]),
    };
    const once = normalize(JSON.parse(JSON.stringify(d)))!;
    expect(once.bubbles[0].rich).toEqual(doc([run('甲', { bold: true }), run('乙')]));
    expect(normalize(JSON.parse(JSON.stringify(once)))).toEqual(once);
    expect(normalizeFmt({ italic: 'yes', strike: true })).toMatchObject({
      italic: false,
      strike: true,
      underline: false,
    });
  });

  it('整段貼上產生純文字的泡泡', () => {
    const d = defaultData();
    const r = buildImport(
      parseChat('甲：**一**\n乙：二'),
      { sides: { 甲: 'left', 乙: 'right' }, dates: 'none', separators: false, merge: false },
      d.sides,
      40,
    );
    expect(r.bubbles.every((b) => !('rich' in b))).toBe(true);
    expect(r.bubbles[0].text).toBe('**一**');
  });
});

/* ---------- 版面 ---------- */

describe('版面：格式化的字寬與換行', () => {
  it('只有顏色、刪除線、底線、螢光筆：換行與位置和沒有格式時完全相同', () => {
    const text = '第一行文字很長很長很長很長很長很長\nSecond line words';
    const rich = doc(
      [run('第一行', { color: '#ff0000' }), run('文字很長很長很長很長很長很長', { strike: true })],
      [run('Second ', { underline: true }), run('line words', { highlight: '#fff0a8' })],
    );
    const a = lay(input({ text }), {}, 150);
    const b = lay(withRich(rich), {}, 150);
    expect(b.lines.map((l) => [l.chars.join(''), l.x, l.w, l.cy])).toEqual(
      a.lines.map((l) => [l.chars.join(''), l.x, l.w, l.cy]),
    );
    expect([b.w, b.h]).toEqual([a.w, a.h]);
    expect(b.lines[0].fx?.[0].color).toBe('#ff0000');
    expect(b.lines[0].fx?.[3].strike).toBe(true);
    expect(a.lines[0].fx).toBeUndefined();
  });

  it('粗體的字用粗體量；換行照粗體的寬度', () => {
    const rich = doc([run('aaaa '), run('bbbb', { bold: true })]);
    const one = lay(withRich(rich), {}, 200);
    expect(one.lines).toHaveLength(1);
    expect(one.lines[0].w).toBe(4 * 10 + 10 + 4 * 12.5);
    expect(one.lines[0].adv.slice(4)).toEqual([10, 12.5, 12.5, 12.5, 12.5]);
    expect(one.lines[0].fx?.[5].font).toMatch(/^700 20px /);
    /* 沒有格式時放得下（90），粗體時放不下（100） */
    expect(lay(input({ text: 'aaaa bbbb' }), {}, 95).lines).toHaveLength(1);
    expect(lay(withRich(rich), {}, 95).lines.map((l) => l.chars.join(''))).toEqual([
      'aaaa',
      'bbbb',
    ]);
  });

  it('字距與部分格式並用；靠右對齊依格式化後的行寬', () => {
    const rich = doc([run('ab'), run('cd', { bold: true })]);
    const L = lay(withRich(rich), { letterSpacing: 2, textAlign: 'right', fitWidth: false }, 200);
    expect(L.lines[0].adv).toEqual([12, 12, 14.5, 14.5]);
    expect(L.lines[0].w).toBe(53);
    const plain = lay(input({ text: 'abcd' }), {
      letterSpacing: 2,
      textAlign: 'right',
      fitWidth: false,
    });
    /* 行的右緣對齊同一個地方 */
    expect(L.lines[0].x + L.lines[0].w).toBeCloseTo(plain.lines[0].x + plain.lines[0].w, 9);
  });

  it('整個泡泡的斜體：字型加 italic；刪除線、底線套到每個字', () => {
    const L = lay(input({ text: '甲乙' }), { italic: true, underline: true });
    expect(L.lines[0].fx?.map((x) => [x.font.startsWith('italic 500 20px'), x.underline])).toEqual([
      [true, true],
      [true, true],
    ]);
    const S2 = lay(withRich(doc([run('甲', { bold: true }), run('乙')])), { strike: true });
    expect(S2.lines[0].fx?.map((x) => [x.font.startsWith('700'), x.strike])).toEqual([
      [true, true],
      [false, true],
    ]);
  });

  it('內文最後的空白照舊不排（格式也一起去掉）', () => {
    const rich = doc([run('甲 ', { bold: true })], [run(' ', { underline: true })]);
    const L = lay(withRich(rich));
    expect(L.lines.map((l) => l.chars.join(''))).toEqual(['甲']);
    expect(L.lines[0].fx).toHaveLength(1);
  });
});

/* ---------- 繪圖 ---------- */

describe('繪圖：部分格式', () => {
  it('粗體、斜體各用自己的字型；顏色空白的字用泡泡的內文色', () => {
    const rich = doc([
      run('一'),
      run('二', { bold: true }),
      run('三', { italic: true, color: '#ff0000' }),
      run('四', { bold: true, italic: true }),
    ]);
    const t = texts(draw(lay(withRich(rich))));
    expect(t.map((x) => [x.s, x.font.split(' "')[0], x.fill])).toEqual([
      ['一', '500 20px', '#222222'],
      ['二', '700 20px', '#222222'],
      ['三', 'italic 500 20px', '#ff0000'],
      ['四', 'italic 700 20px', '#222222'],
    ]);
    expect(t[1].x).toBe(t[0].x + 20);
  });

  it('刪除線、底線畫在字的上面；螢光筆畫在字的下面；相鄰同色的合成一條', () => {
    const rich = doc([
      run('一二', { underline: true, highlight: '#fff0a8' }),
      run('三', { underline: true, strike: true, color: '#ff0000', highlight: '#fff0a8' }),
      run('四'),
    ]);
    const L = lay(withRich(rich));
    const { before, after } = rects(draw(L));
    const line = L.lines[0];
    expect(before).toEqual([
      { x: line.x, y: line.cy - 20 * 0.62, w: 60, h: 20 * 1.24, fill: '#fff0a8' },
    ]);
    const thick = 20 * 0.055;
    /* 先刪除線、再底線 */
    expect(after).toEqual([
      { x: line.x + 40, y: line.cy + 20 * 0.06 - thick / 2, w: 20, h: thick, fill: '#ff0000' },
      { x: line.x, y: line.cy + 20 * 0.52 - thick / 2, w: 40, h: thick, fill: '#222222' },
      { x: line.x + 40, y: line.cy + 20 * 0.52 - thick / 2, w: 20, h: thick, fill: '#ff0000' },
    ]);
  });

  it('整個泡泡的刪除線：整行一條', () => {
    const L = lay(input({ text: '甲乙丙' }), { strike: true });
    const { after } = rects(draw(L));
    expect(after.map((r) => [r.x, r.w])).toEqual([[L.lines[0].x, 60]]);
  });

  it('沒有格式時和以前的畫法完全相同（不分段）', () => {
    const L = lay(input({ text: '甲乙丙' }));
    expect(texts(draw(L)).map((x) => x.s)).toEqual(['甲乙丙']);
  });
});

describe('逐字出現：第 n 個字出現時就是它自己的格式', () => {
  it('只畫出現的字；裝飾只到出現的字', () => {
    const rich = doc([
      run('ab'),
      run('c', { bold: true, underline: true }),
      run('d', { underline: true }),
    ]);
    const L = lay(withRich(rich));
    const st: TextState = { ...FULL_TEXT, visible: 3 };
    const log = draw(L, st);
    expect(texts(log).map((x) => [x.s, x.font.split(' "')[0]])).toEqual([
      ['ab', '500 20px'],
      ['c', '700 20px'],
    ]);
    const { after } = rects(log);
    expect(after.map((r) => [r.x, r.w])).toEqual([[L.lines[0].x + 20, 12.5]]);
    expect(texts(draw(L, { ...FULL_TEXT, visible: 0 }))).toEqual([]);
  });
});

describe('場景：要載入的粗體字', () => {
  it('部分粗體的字加進粗體字型要載入的字', () => {
    const d = defaultData();
    d.bubbles = [
      {
        ...d.bubbles[0],
        text: '一二三',
        rich: doc([run('一'), run('二', { bold: true }), run('三')]),
      },
    ];
    const s = buildScene(d, fakeMeasure);
    expect(s.fontLoads[1].weight).toBe(700);
    expect(s.fontLoads[1].text).toContain('二');
    expect(s.fontLoads[0].text).toContain('一二三');
  });
});

/* ---------- 編輯：復原、新增、複製 ---------- */

describe('編輯：復原（一次套用＝一步）、新增、複製', () => {
  beforeEach(() => {
    flushTextHistory();
    const d = defaultData();
    d.bubbles = [
      { ...d.bubbles[0], id: 'x', text: '一二三' },
      { ...d.bubbles[1], id: 'y' },
    ];
    useSb.getState().replace(d);
    useSb.temporal.getState().clear();
  });
  const past = () => useSb.temporal.getState().pastStates.length;
  const bx = () => useSb.getState().data.bubbles.find((b) => b.id === 'x')!;

  it('套用格式（內文不變）：馬上記成一步；打字：連續的合成一步', async () => {
    /* 同一毫秒內的兩次變更 store 會合成一步（實際操作不會這麼快）：兩次套用之間隔幾毫秒 */
    const tick = () => new Promise((r) => setTimeout(r, 5));
    setBubbleRich('x', doc([run('一', { bold: true }), run('二三')]));
    expect(past()).toBe(1);
    expect(bx().rich).toEqual(doc([run('一', { bold: true }), run('二三')]));
    await tick();
    setBubbleRich('x', doc([run('一', { bold: true }), run('二三', { italic: true })]));
    expect(past()).toBe(2);
    setBubbleRich('x', doc([run('一', { bold: true }), run('二三四', { italic: true })]));
    setBubbleRich('x', doc([run('一', { bold: true }), run('二三四五', { italic: true })]));
    expect(bx().text).toBe('一二三四五');
    flushTextHistory();
    expect(past()).toBe(3);
    useSb.temporal.getState().undo();
    expect(bx().text).toBe('一二三');
    useSb.temporal.getState().undo();
    expect(bx().rich).toEqual(doc([run('一', { bold: true }), run('二三')]));
    useSb.temporal.getState().undo();
    expect(bx().rich).toBeUndefined();
  });

  it('只改顏色（調色盤拖曳）：連續的合成一步；拿掉所有格式＝沒有 rich', () => {
    setBubbleRich('x', doc([run('一二三', { color: '#110000' })]));
    setBubbleRich('x', doc([run('一二三', { color: '#220000' })]));
    setBubbleRich('x', doc([run('一二三', { color: '#330000' })]));
    flushTextHistory();
    expect(past()).toBe(1);
    setBubbleRich('x', doc([run('一二三')]));
    expect('rich' in bx()).toBe(false);
    expect(bx().text).toBe('一二三');
  });

  it('新增泡泡的內文是純文字；複製照抄格式', () => {
    setBubbleRich('x', doc([run('一', { bold: true }), run('二三')]));
    const nid = addBubble('x')!;
    const added = useSb.getState().data.bubbles.find((b) => b.id === nid)!;
    expect(added.text).toBe('新的泡泡');
    expect('rich' in added).toBe(false);
    const did = duplicateBubble('x')!;
    const dup = useSb.getState().data.bubbles.find((b) => b.id === did)!;
    expect(dup.rich).toEqual(doc([run('一', { bold: true }), run('二三')]));
  });
});

describe('樣式預設與樣式檔：整個泡泡的斜體、刪除線、底線', () => {
  it('跟著三側的預設存進樣式、寫進檔案再讀回', () => {
    const d = defaultData();
    d.sides.left.fmt = { ...d.sides.left.fmt, italic: true, underline: true };
    const set = captureStyle(d);
    const back = parseStyleFile(styleFileJson({ ...set, id: 's1', name: '斜體' } as never, null));
    expect(back.style.sides.left.fmt).toMatchObject({
      italic: true,
      strike: false,
      underline: true,
    });
    /* 沒有這些欄位的舊樣式檔：補 false */
    const old = JSON.parse(
      styleFileJson({ ...captureStyle(defaultData()), id: 's2', name: '舊' } as never, null),
    );
    delete old.sides.left.fmt.italic;
    expect(parseStyleFile(JSON.stringify(old)).style.sides.left.fmt.italic).toBe(false);
    expect(BASE_SETTINGS.sides.left.fmt.italic).toBe(false);
    expect(
      normalizeData(JSON.parse(JSON.stringify(d)), styleDefaults, () => [])?.sides.left.fmt.italic,
    ).toBe(true);
  });
});
