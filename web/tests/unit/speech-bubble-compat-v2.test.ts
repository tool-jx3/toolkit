/**
 * 動態對話泡泡產生器：沒用到部分文字格式時，對話卡片整合後（第 2 版的資料）的輸出逐位元組不變（2026-10 第二步的保證）。
 *
 * 做法同 `speech-bubble-compat.test.ts`：加部分文字格式之前，先用當時的程式把第 2 版的資料（兩側的預設、
 * 樣式的其他項目、說話者與日期、卡片底與背景圖、紋理、頁首頁尾、比例畫布與最小高度、自由拖曳的位移、
 * 內建的樣式預設、整段貼上的結果）在 10 個時間點畫一次，記下所有 canvas 指令的 SHA-256
 * （`fixtures/speech-bubble-v2-golden.json`）。之後用新程式讀同一份資料（經過整理與 migrate）再畫，指令必須完全相同。
 *
 * 重新產生基準（只在加格式之前的程式上做過一次）：`SB_GOLDEN=write npx vitest run tests/unit/speech-bubble-compat-v2.test.ts`
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '../../src/core/files';
import type { MeasureFn } from '../../src/core/typeset/measure';
import {
  buildImport,
  defaultSpeakerSides,
  parseChat,
} from '../../src/tools/speech-bubble/chatImport';
import { normalizeData, type SbData } from '../../src/tools/speech-bubble/model';
import { applyPreset, PRESETS, presetOf } from '../../src/tools/speech-bubble/presets';
import { buildScene } from '../../src/tools/speech-bubble/scene';
import { applyStyleSet, BUILTIN_STYLES } from '../../src/tools/speech-bubble/stylePresets';
import { styleDefaults } from '../../src/tools/speech-bubble/styles';
import { recordCanvas } from '../helpers/canvasRecorder';

const FS = 'node:fs';
const { readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc: 'utf8') => string;
  writeFileSync: (p: string, data: string) => void;
};
const FIXTURE = new URL('./fixtures/speech-bubble-v2-golden.json', import.meta.url).pathname;
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .SB_GOLDEN === 'write';

/* 假的字寬：粗體、斜體也量得出不同（之後加格式時用同一個） */
const fakeMeasure: MeasureFn = (font, ch) => {
  const px = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const w = ch.charCodeAt(0) > 0x24f ? px : px * 0.55;
  return { w, l: 0, r: w, a: px * 0.8, d: px * 0.2 };
};

/** 卡片背景圖（假的圖片：只有寬高；畫圖指令記成 object） */
const FAKE_IMAGE = { width: 320, height: 200 } as unknown as CanvasImageSource;

type Raw = Record<string, unknown> & { bubbles: Record<string, unknown>[] };

interface GoldenCase {
  name: string;
  /** 和 base 不同的設定 */
  settings: Record<string, unknown>;
  bubbles: Record<string, unknown>[];
  image?: boolean;
  size: [number, number, number];
  hashes: string[];
}

interface Golden {
  base: Record<string, unknown>;
  cases: GoldenCase[];
}

const sha = (v: unknown) => bytesToHex(sha256Sync(new TextEncoder().encode(JSON.stringify(v))));

function capture(raw: Raw, image: boolean): { size: [number, number, number]; hashes: string[] } {
  const d = normalizeData(raw, styleDefaults, () => []);
  if (!d) throw new Error('normalize failed');
  const s = buildScene(d, fakeMeasure, image ? { image: FAKE_IMAGE } : {});
  const first = s.items[0]?.timing;
  const times = [
    0,
    0.07,
    0.18,
    first ? first.enter1 : 0.3,
    Math.max(0, s.ready - 0.01),
    s.ready,
    s.ready + 0.37,
    s.leave + 0.12,
    Math.max(0, s.duration - 0.05),
    s.duration,
  ];
  const hashes = times.map((t) => {
    const r = recordCanvas(s.width, s.height);
    s.render(r.ctx, t);
    return sha(r.log).slice(0, 24);
  });
  return { size: [s.width, s.height, Math.round(s.duration * 1e6) / 1e6], hashes };
}

/* ---------- 產生基準用的案例（只在 write 模式用；用的是加格式之前的程式） ---------- */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function makeCases(): {
  base: Record<string, unknown>;
  cases: Omit<GoldenCase, 'size' | 'hashes'>[];
} {
  const base = clone(applyPreset(PRESETS[0])) as unknown as Raw;
  const { bubbles: _b, ...baseSettings } = base;
  const diff = (s: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(s).filter(([k, v]) => JSON.stringify(baseSettings[k]) !== JSON.stringify(v)),
    );
  const cases: Omit<GoldenCase, 'size' | 'hashes'>[] = [];
  const push = (name: string, d: SbData, image = false) => {
    const { bubbles, ...rest } = clone(d) as unknown as Raw;
    cases.push({
      name,
      settings: diff(rest),
      bubbles: bubbles.map((b, j) => ({ ...b, id: `${name}-${j}` })),
      ...(image ? { image: true } : {}),
    });
  };
  const duo = () => clone(applyPreset(presetOf('chat-duo') ?? PRESETS[0]));
  const chat = (): SbData => {
    const d = duo();
    d.bubbles = d.bubbles.map((b, i) => ({
      ...b,
      speaker: i % 2 ? '小雨' : 'Kai',
      time: `下午 2:${String(10 + i).padStart(2, '0')}`,
    }));
    return d;
  };

  /* 內建的樣式預設套到兩人對話（含說話者與日期） */
  for (const s of BUILTIN_STYLES) {
    const d = chat();
    applyStyleSet(d, s);
    push(`builtin:${s.id}`, d);
  }

  /* 說話者與日期的位置 × 造型 */
  const metaStyles = ['messenger', 'chat-card', 'speech', 'thought', 'rpg', 'sticky'] as const;
  for (const meta of ['above', 'header', 'side', 'inside', 'off'] as const)
    for (const style of metaStyles) {
      const d = chat();
      d.bubbles = (['left', 'center', 'right'] as const).map((align, i) => ({
        ...d.bubbles[i % d.bubbles.length],
        style,
        align,
        colors: { ...styleDefaults(style).colors },
        icon: styleDefaults(style).icon,
        speaker: i === 1 ? '' : d.bubbles[i % d.bubbles.length].speaker,
        fmt: {
          ...(d.bubbles[0].fmt ?? {}),
          meta,
          metaColor: '#5a6b7c',
          metaScale: 0.7,
        } as never,
      }));
      push(`meta:${meta}:${style}`, d);
    }

  /* 樣式的其他項目（每一項單獨開） */
  const fmtVariants: Record<string, Record<string, unknown>> = {
    letterSpacing: { letterSpacing: 3.5 },
    negSpacing: { letterSpacing: -1.5 },
    alignCenter: { textAlign: 'center' },
    alignRight: { textAlign: 'right' },
    textDy: { textDy: 6 },
    pad: { padX: 1.6, padY: 0.6 },
    radius0: { radius: 0 },
    radius30: { radius: 30 },
    cornerPoint: { corner: 'point' },
    cornerRound: { corner: 'round' },
    border0: { borderScale: 0 },
    border25: { borderScale: 2.5 },
    shadowOn: { softShadow: 'on' },
    shadowOff: { softShadow: 'off' },
    solid: { solidShadow: true, solidColor: '#33221180', solidOffset: 7 },
    fixedWidth: { fitWidth: false },
    puff: { cloudPuff: 1.6 },
    font: {
      font: { source: 'google', family: 'Iansui', weight: 400 },
      fontSize: 27,
      lineHeight: 1.8,
    },
    metaFont: {
      meta: 'header',
      metaFont: { source: 'google', family: 'Iansui', weight: 700 },
      metaScale: 0.9,
    },
  };
  const fmtStyles = ['messenger', 'speech', 'thought', 'card', 'neon', 'window', 'hud'] as const;
  for (const [name, patch] of Object.entries(fmtVariants)) {
    const d = chat();
    d.bubbles = fmtStyles.map((style, i) => ({
      ...d.bubbles[i % d.bubbles.length],
      style,
      align: (['left', 'right', 'center'] as const)[i % 3],
      colors: { ...styleDefaults(style).colors },
      icon: styleDefaults(style).icon,
      title: i % 2 ? '標題 Title' : '',
      button: style === 'window' ? '確認' : '',
      text: 'Hello world，第一行\n第二行 很長很長的一行要換行看看效果 longer English words here',
      fmt: { ...(d.bubbles[0].fmt ?? {}), ...patch } as never,
    }));
    d.wrapWidth = 260;
    push(`fmt:${name}`, d);
  }

  /* 卡片底、背景圖、紋理、頁首頁尾、分隔線 */
  const cards: Record<string, Record<string, unknown>> = {
    color: { bg: true, color: '#f3eee4' },
    radius: { bg: true, color: '#1d1915', radius: 24 },
    paper: { bg: true, texture: 'paper', strength: 60 },
    grainDark: { bg: true, color: '#202028', texture: 'grain', strength: 80, darkBoost: true },
    crumpleNoBoost: { bg: true, color: '#202028', texture: 'crumple', darkBoost: false },
    grid: { bg: true, texture: 'grid', strength: 40 },
    dots: { bg: true, texture: 'dots' },
    lines: { bg: true, texture: 'lines', strength: 100 },
    notes: {
      bg: true,
      header: '2026.10.15（三）\n對話紀錄',
      footer: '— 完 —',
      noteAlign: 'left',
      noteColor: '#556677',
      noteSize: 18,
      divider: 'solid',
      dividerColor: '#998877',
    },
    notesRight: {
      header: '只有頁首',
      noteAlign: 'right',
      divider: 'dashed',
      noteFont: { source: 'google', family: 'Iansui', weight: 400 },
    },
    double: { footer: '頁尾', divider: 'double' },
  };
  for (const [name, patch] of Object.entries(cards)) {
    const d = chat();
    d.card = { ...d.card, ...patch } as SbData['card'];
    push(`card:${name}`, d);
  }
  for (const fit of ['cover', 'contain', 'repeat'] as const) {
    const d = chat();
    d.card = { ...d.card, bg: true, image: 'img-1', imageFit: fit, imageOpacity: 70, radius: 12 };
    push(`image:${fit}`, d, true);
  }

  /* 比例畫布、最小高度 */
  for (const [mode, anchor, minHeight] of [
    ['square', 'mc', 0],
    ['story', 'tl', 900],
    ['wide', 'br', 0],
    ['auto', 'tc', 800],
    ['auto', 'bc', 600],
    ['story', 'mc', 0],
  ] as const) {
    const d = chat();
    d.canvasMode = mode;
    d.anchor = anchor;
    d.minHeight = minHeight;
    d.card = { ...d.card, bg: true, color: '#eef2f7' };
    push(`canvas:${mode}:${anchor}:${minHeight}`, d);
  }

  /* 自由拖曳的位移 × 排列 */
  for (const arrange of ['column', 'grid', 'pile', 'swap'] as const) {
    const d = chat();
    d.arrange = arrange;
    d.bubbles = d.bubbles.map((b, i) => ({ ...b, dx: i * 23.5 - 30, dy: i % 2 ? -18 : 41 }));
    push(`offset:${arrange}`, d);
  }

  /* 整段貼上（LINE 的格式、日期的泡泡、合併連續的訊息） */
  const line = [
    '[LINE] 與 小雨 的聊天記錄',
    '儲存日期：2026/10/15 14:00',
    '',
    '2026/10/14（二）',
    '13:02\t小雨\t今天的團要開嗎？',
    '13:03\tKai\t要！我已經準備好角色卡了',
    '13:03\tKai\t"等一下\n我再看一次規則"',
    '2026/10/15（三）',
    '09:10\t小雨\t早安',
  ].join('\n');
  for (const [dates, separators, merge] of [
    ['time', true, false],
    ['datetime', false, true],
  ] as const) {
    const d = chat();
    const parse = parseChat(line);
    const counts = [...new Set(parse.messages.map((m) => m.speaker))].map((speaker) => ({
      speaker,
    }));
    d.bubbles = buildImport(
      parse,
      { sides: defaultSpeakerSides(counts), dates, separators, merge },
      d.sides,
      40,
    ).bubbles;
    push(`import:${dates}:${separators}:${merge}`, d);
  }

  /* 動畫（打字、逐行）＋卡片＋說話者 */
  for (const [textAnim, cursor, enter] of [
    ['type', 'bar', 'side'],
    ['line', 'none', 'wipe'],
    ['type', 'block', 'pop'],
  ] as const) {
    const d = chat();
    d.textAnim = textAnim;
    d.cursor = cursor;
    d.enter = enter;
    d.card = { ...d.card, bg: true, texture: 'paper', header: '頁首' };
    d.bubbles = d.bubbles.map((b, i) => ({
      ...b,
      fmt: { ...(b.fmt ?? {}), letterSpacing: i % 2 ? 2 : 0, meta: 'inside' } as never,
    }));
    push(`motion:${textAnim}:${cursor}:${enter}`, d);
  }
  return { base: baseSettings, cases };
}

describe('沒用到部分文字格式時輸出不變（第 2 版的資料）', () => {
  if (WRITE) {
    it('寫入基準', () => {
      const { base, cases } = makeCases();
      const out: Golden = {
        base,
        cases: cases.map((c) => ({
          ...c,
          ...capture({ ...base, ...c.settings, bubbles: c.bubbles } as Raw, !!c.image),
        })),
      };
      writeFileSync(FIXTURE, `${JSON.stringify(out)}\n`);
      expect(out.cases.length).toBeGreaterThan(60);
    });
    return;
  }

  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden;
  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const got = capture({ ...golden.base, ...c.settings, bubbles: c.bubbles } as Raw, !!c.image);
    expect(got.size).toEqual(c.size);
    expect(got.hashes).toEqual(c.hashes);
  });
});
