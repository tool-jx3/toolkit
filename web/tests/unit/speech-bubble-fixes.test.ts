/**
 * 動態對話泡泡產生器：對話卡片＋部分文字格式驗證後的修正（規格 7.4）——
 * 雲朵大小的畫法與範圍用同一個倍數（F60）、整段貼上：時間的冒號不當名字分隔、Discord 沒有分隔符號的標頭與
 * 單獨一行的時間（D16）、加入前估算畫布高度（D21）、分隔線對齊到像素（F63）。
 */
import { describe, expect, it } from 'vitest';
import type { MeasureFn } from '../../src/core/typeset/measure';
import { colonLine, detectFormat, parseChat } from '../../src/tools/speech-bubble/chatImport';
import { drawBubble, FULL_TEXT } from '../../src/tools/speech-bubble/draw';
import { cachedUnit, layoutBubble } from '../../src/tools/speech-bubble/layout';
import { DEFAULT_FMT, MAX_BUBBLES, type SbData } from '../../src/tools/speech-bubble/model';
import { defaultData } from '../../src/tools/speech-bubble/presets';
import { buildScene, importOverflows } from '../../src/tools/speech-bubble/scene';
import { styleDefaults } from '../../src/tools/speech-bubble/styles';
import { recordCanvas } from '../helpers/canvasRecorder';

const fakeMeasure: MeasureFn = (font, ch) => {
  const px = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const w = ch.charCodeAt(0) > 0x24f ? px : px * 0.5;
  return { w, l: 0, r: w, a: px * 0.8, d: px * 0.2 };
};
const unit = cachedUnit(fakeMeasure);

/* ---------- F60 雲朵大小 ---------- */

describe('雲朵大小：畫法和外觀範圍用同一個倍數（F60）', () => {
  /** 想法泡泡畫出來（含描邊）超出本體上緣多少，與外觀範圍的上緣 */
  function cloudTop(text: string, puff: number) {
    const L = layoutBubble(
      { style: 'thought', title: '', text, icon: 'none', button: '', align: 'left' },
      {
        font: { source: 'google', family: 'Noto Sans TC', weight: 500 },
        fontSize: 22,
        lineHeight: 1.5,
        wrapWidth: 360,
        shadow: true,
        fmt: { ...DEFAULT_FMT, cloudPuff: puff },
      },
      unit,
    );
    const r = recordCanvas();
    drawBubble(
      r.ctx,
      L,
      { colors: styleDefaults('thought').colors, icon: 'none' },
      { shadow: true, u: 1, seed: 1, text: FULL_TEXT, shine: null, scan: null },
    );
    const arcs = (r.log as unknown[][]).filter((c) => c[0] === 'arc') as number[][];
    const top = Math.min(...arcs.map((a) => a[2] - a[3]));
    const lw = Math.max(1.5, 22 * 0.1);
    return { drawn: -top + lw, ext: L.ext.t };
  }

  it('長的內文（雲朵數量到上限）：0.5 倍時雲朵跟著變小，不超出外觀範圍比 1 倍時多', () => {
    const long = '幫我看一下角色卡\n第二行比較長的文字喔';
    const one = cloudTop(long, 1);
    const half = cloudTop(long, 0.5);
    const two = cloudTop(long, 2);
    /* 超出本體的部分跟著倍數（描邊的粗細不變） */
    const lw = 2.2;
    const k = (x: { drawn: number }) => (x.drawn - lw) / (one.drawn - lw);
    /* 數量取整數、1 倍以上數量本來就少（到不了上限），比例差一點 */
    expect(k(half)).toBeGreaterThan(0.45);
    expect(k(half)).toBeLessThan(0.55);
    expect(k(two)).toBeGreaterThan(1.6);
    expect(k(two)).toBeLessThan(2.4);
    /* 外觀範圍包得住（和 1 倍時一樣緊或更鬆） */
    expect(half.drawn - half.ext).toBeLessThanOrEqual(Math.max(0, one.drawn - one.ext) + 0.5);
    expect(two.drawn - two.ext).toBeLessThanOrEqual(Math.max(0, one.drawn - one.ext) + 0.5);
  });

  it('短的內文照舊：倍數越小雲朵越小', () => {
    const a = cloudTop('嗯？', 0.5);
    const b = cloudTop('嗯？', 1);
    expect(a.drawn).toBeLessThan(b.drawn);
    expect(a.drawn - a.ext).toBeLessThanOrEqual(Math.max(0, b.drawn - b.ext) + 0.5);
  });
});

/* ---------- D16 整段貼上 ---------- */

describe('整段貼上：時間的冒號與 Discord 的標頭（D16）', () => {
  it('冒號前後都是數字（時間）時不當成「名字：內容」的分隔', () => {
    expect(colonLine('阿明今天 14:30')).toBeNull();
    expect(colonLine('今天 21:03')).toBeNull();
    expect(colonLine('會議 9：30 開始')).toBeNull();
    expect(colonLine('阿明：14:30 見')).toEqual(['阿明', '14:30 見']);
    expect(colonLine('Room 1: 2 people')).toEqual(['Room 1', '2 people']);
  });

  it('Discord 沒有分隔符號的標頭：名字＋今天／昨天／日期＋時間在行尾', () => {
    const p = parseChat('阿明今天 14:30\n今天要開團嗎？\n小雨昨天 下午 9:05\n要！\n記得帶骰子');
    expect(p.format).toBe('discord');
    expect(p.messages.map((m) => [m.speaker, m.time, m.text])).toEqual([
      ['阿明', '今天 14:30', '今天要開團嗎？'],
      ['小雨', '昨天 下午 9:05', '要！'],
      ['小雨', '昨天 下午 9:05', '記得帶骰子'],
    ]);
    expect(
      parseChat('Kai 2026/10/14 21:03\nhello').messages.map((m) => [m.speaker, m.time]),
    ).toEqual([['Kai', '2026/10/14 21:03']]);
  });

  it('三行複製（名字／—／今天 21:03）：單獨一行的時間＝上一行是說話者', () => {
    const text = '阿明\n—\n今天 21:03\n第一則\n第二則\n\n小雨\n—\n今天 21:05\n收到';
    expect(detectFormat(text)).toBe('discord');
    expect(parseChat(text).messages.map((m) => [m.speaker, m.time, m.text])).toEqual([
      ['阿明', '今天 21:03', '第一則'],
      ['阿明', '今天 21:03', '第二則'],
      ['小雨', '今天 21:05', '收到'],
    ]);
    /* 沒有破折號的兩行也一樣 */
    expect(
      parseChat('阿明\n今天 21:03\n嗨').messages.map((m) => [m.speaker, m.time, m.text]),
    ).toEqual([['阿明', '今天 21:03', '嗨']]);
  });

  it('「名字：內容」裡的句子以時間結尾時不會被當成 Discord', () => {
    const text = '阿明：會議改到今天 14:30\n小雨：好';
    expect(detectFormat(text)).toBe('colon');
    expect(parseChat(text).messages.map((m) => [m.speaker, m.text])).toEqual([
      ['阿明', '會議改到今天 14:30'],
      ['小雨', '好'],
    ]);
  });
});

/* ---------- D21 加入前估算畫布高度 ---------- */

describe('整段貼上：加入之前估算畫布會不會超過上限（D21）', () => {
  const chatData = (n: number, speaker = '阿明'): SbData => {
    const d = defaultData();
    const b0 = d.bubbles[0];
    d.bubbles = Array.from({ length: n }, (_, i) => ({
      ...b0,
      id: `b${i}`,
      text: '今天的團要開嗎？我已經準備好角色卡了\n等一下再看一次規則',
      speaker,
      time: '21:03',
    }));
    return d;
  };

  it('40 則有名字的對話超過 4096 px：會超過；少的不會；自訂畫布不估', () => {
    const many = chatData(MAX_BUBBLES);
    expect(buildScene(many, fakeMeasure).overflow).toBe(true);
    const base = defaultData();
    expect(importOverflows(base, many.bubbles, 'replace', fakeMeasure)).toBe(true);
    expect(importOverflows(base, chatData(5).bubbles, 'replace', fakeMeasure)).toBe(false);
    /* 加在後面：加上現有的泡泡一起算 */
    const half = chatData(20);
    expect(importOverflows(half, chatData(20).bubbles, 'append', fakeMeasure)).toBe(true);
    expect(importOverflows(half, chatData(20).bubbles, 'replace', fakeMeasure)).toBe(false);
    expect(
      importOverflows({ ...base, canvasMode: 'fixed' }, many.bubbles, 'replace', fakeMeasure),
    ).toBe(false);
  });
});

/* ---------- F63 分隔線對齊到像素 ---------- */

describe('分隔線對齊到像素（F63）', () => {
  it('有頁首（位置不是整數）時 1 px 的線畫在像素的中間', () => {
    const d = defaultData();
    d.card = { ...d.card, header: '頁首', footer: '頁尾', noteSize: 15, divider: 'double' };
    const s = buildScene(d, fakeMeasure);
    expect(s.dividers.some((v) => !Number.isInteger(v.y))).toBe(true);
    const r = recordCanvas(s.width, s.height);
    s.render(r.ctx, s.ready);
    const ys = (r.log as unknown[][]).filter((c) => c[0] === 'moveTo').map((c) => c[2] as number);
    const lineYs = ys.filter((y) => s.dividers.some((v) => Math.abs(v.y - y) < 4.5));
    expect(lineYs.length).toBeGreaterThanOrEqual(4);
    for (const y of lineYs) expect(y - Math.floor(y)).toBeCloseTo(0.5, 9);
  });
});
