/**
 * 動態對話泡泡產生器：沒用到新功能時，既有的輸出逐位元組不變（2026-10 整合對話卡片時的保證）。
 *
 * 做法：整合前用舊程式把 28 組範本與各種造型、位置、動畫、排列的資料（第 1 版的資料格式）在幾個時間點畫一次，
 * 記下所有 canvas 指令的 SHA-256（`fixtures/speech-bubble-v1-golden.json`）。現在用新程式讀同一份第 1 版的資料
 * （經過整理與 migrate）再畫一次，指令必須完全相同——指令相同，APNG／GIF／WebP／PNG 的每一格像素就相同。
 *
 * 重新產生基準（只在整合前的舊程式上做過一次）：`SB_GOLDEN=write npx vitest run tests/unit/speech-bubble-compat.test.ts`
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '../../src/core/files';
import type { MeasureFn } from '../../src/core/typeset/measure';
import { normalizeData, STYLE_IDS } from '../../src/tools/speech-bubble/model';
import { applyPreset, PRESETS } from '../../src/tools/speech-bubble/presets';
import { buildScene } from '../../src/tools/speech-bubble/scene';
import { styleDefaults } from '../../src/tools/speech-bubble/styles';
import { recordCanvas } from '../helpers/canvasRecorder';

const FS = 'node:fs';
const { readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc: 'utf8') => string;
  writeFileSync: (p: string, data: string) => void;
};
const FIXTURE = new URL('./fixtures/speech-bubble-v1-golden.json', import.meta.url).pathname;
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .SB_GOLDEN === 'write';

const fakeMeasure: MeasureFn = (font, ch) => {
  const px = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const w = ch.charCodeAt(0) > 0x24f ? px : px * 0.55;
  return { w, l: 0, r: w, a: px * 0.8, d: px * 0.2 };
};

type Raw = Record<string, unknown> & { bubbles: Record<string, unknown>[] };

interface GoldenCase {
  name: string;
  /** 和 base 不同的設定 */
  settings: Record<string, unknown>;
  bubbles: Record<string, unknown>[];
  size: [number, number, number];
  hashes: string[];
}

interface Golden {
  base: Record<string, unknown>;
  cases: GoldenCase[];
}

const sha = (v: unknown) => bytesToHex(sha256Sync(new TextEncoder().encode(JSON.stringify(v))));

/** 一個場景在幾個代表時間點的指令雜湊 */
function capture(raw: Raw): { size: [number, number, number]; hashes: string[] } {
  const d = normalizeData(raw, styleDefaults, () => []);
  if (!d) throw new Error('normalize failed');
  const s = buildScene(d, fakeMeasure);
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

/* ---------- 產生基準用的案例（只在 write 模式用；用的是整合前的舊程式） ---------- */

function makeCases(): {
  base: Record<string, unknown>;
  cases: Omit<GoldenCase, 'size' | 'hashes'>[];
} {
  const strip = (d: Raw, tag: string) => {
    const { bubbles, ...rest } = d;
    return {
      settings: rest,
      bubbles: bubbles.map((b, j) => ({ ...b, id: `${tag}-${j}` })),
    };
  };
  const base = { ...(applyPreset(PRESETS[0]) as unknown as Raw) };
  const { bubbles: _b, ...baseSettings } = base;
  const diff = (s: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(s).filter(([k, v]) => JSON.stringify(baseSettings[k]) !== JSON.stringify(v)),
    );
  const cases: Omit<GoldenCase, 'size' | 'hashes'>[] = [];
  PRESETS.forEach((p, i) => {
    const x = strip(applyPreset(p) as unknown as Raw, `p${i}`);
    cases.push({ name: `preset:${p.id}`, settings: diff(x.settings), bubbles: x.bubbles });
  });
  const bubble = (style: (typeof STYLE_IDS)[number], align: string, extra = {}) => ({
    style,
    title: '標題 Title',
    text: '第一行文字\nSecond line 很長很長的一行要換行看看效果如何呢',
    icon: styleDefaults(style).icon,
    button: '確認',
    align,
    colors: styleDefaults(style).colors,
    ...extra,
  });
  for (const style of STYLE_IDS)
    for (const align of ['left', 'center', 'right'])
      cases.push({
        name: `style:${style}:${align}`,
        settings: diff({ ...baseSettings, idle: 'none' }),
        bubbles: [{ ...bubble(style, align), id: `s-${style}-${align}` }],
      });
  for (const style of STYLE_IDS)
    cases.push({
      name: `noshadow:${style}`,
      settings: diff({ ...baseSettings, shadow: false, fontSize: 31, lineHeight: 1.85 }),
      bubbles: [{ ...bubble(style, 'left', { title: '' }), id: `n-${style}` }],
    });
  const enters = [
    'pop',
    'fade',
    'zoom',
    'side',
    'left',
    'right',
    'up',
    'down',
    'wipe',
    'unroll',
    'glitch',
    'drop',
    'spin',
  ];
  const exits = [
    'none',
    'fade',
    'zoom',
    'pop',
    'side',
    'left',
    'right',
    'up',
    'down',
    'wipe',
    'unroll',
    'glitch',
    'fall',
    'spin',
  ];
  const idles = ['none', 'float', 'breathe', 'sway', 'shake', 'shine', 'scan', 'flicker', 'glitch'];
  enters.forEach((enter, i) => {
    cases.push({
      name: `motion:${enter}`,
      settings: diff({
        ...baseSettings,
        enter,
        exit: exits[i % exits.length],
        idle: idles[i % idles.length],
        textAnim: ['with', 'fade', 'type', 'line'][i % 4],
        cursor: ['none', 'block', 'bar'][i % 3],
        typeSpeed: 9 + i,
      }),
      bubbles: [
        { ...bubble('messenger', 'left'), id: `m${i}-a` },
        { ...bubble('toast', 'right', { text: '短' }), id: `m${i}-b` },
        { ...bubble('rpg', 'center'), id: `m${i}-c` },
      ],
    });
  });
  const three = [
    { ...bubble('card', 'left'), id: 'a1' },
    { ...bubble('speech', 'right', { text: 'Hi' }), id: 'a2' },
    { ...bubble('sticky', 'center'), id: 'a3' },
    { ...bubble('neon', 'left', { title: '' }), id: 'a4' },
  ];
  for (const arrange of ['column', 'grid', 'pile', 'swap'])
    for (const order of ['list', 'random'])
      cases.push({
        name: `arrange:${arrange}:${order}`,
        settings: diff({
          ...baseSettings,
          arrange,
          order,
          columns: 3,
          gap: 22,
          indent: 90,
          exitTogether: order === 'random',
        }),
        bubbles: three,
      });
  for (const anchor of ['tl', 'mc', 'br'])
    cases.push({
      name: `fixed:${anchor}`,
      settings: diff({
        ...baseSettings,
        canvasMode: 'fixed',
        width: 500,
        height: 300,
        margin: 10,
        anchor,
      }),
      bubbles: three,
    });
  cases.push({
    name: 'auto:margin',
    settings: diff({
      ...baseSettings,
      margin: 0,
      wrapWidth: 120,
      font: { source: 'google', family: 'Iansui', weight: 700 },
    }),
    bubbles: three,
  });
  return { base: baseSettings, cases };
}

describe('沒用到新功能時輸出不變（第 1 版的資料）', () => {
  if (WRITE) {
    it('寫入基準', () => {
      const { base, cases } = makeCases();
      const out: Golden = {
        base,
        cases: cases.map((c) => ({
          ...c,
          ...capture({ ...base, ...c.settings, bubbles: c.bubbles } as Raw),
        })),
      };
      writeFileSync(FIXTURE, `${JSON.stringify(out)}\n`);
      expect(out.cases.length).toBeGreaterThan(100);
    });
    return;
  }

  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden;
  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const got = capture({ ...golden.base, ...c.settings, bubbles: c.bubbles } as Raw);
    expect(got.size).toEqual(c.size);
    expect(got.hashes).toEqual(c.hashes);
  });
});
