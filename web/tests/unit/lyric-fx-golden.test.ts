/**
 * 「散落」沒有用到逐句手動調整時，排位置與畫面和加入這個功能之前完全相同（lyric-fx 規格 F82、D29）。
 *
 * 基準（tests/unit/fixtures/lyric-fx-golden.json）是在加入逐句手動調整之前的程式（commit d06ae8e）上用這個檔案產生的：
 * `LYRIC_FX_GOLDEN_WRITE=1 npx vitest run tests/unit/lyric-fx-golden.test.ts`。
 * 比對的是：
 * - plan 的輸出（每一句的位置、角度、折行、整塊、時間；完整內容〔含每個字、透視、抖動〕的 SHA-256）；
 * - 幾個時間點畫出來的 canvas 指令（tests/helpers/canvasRecorder：指令相同＝像素相同）的 SHA-256。
 * 量字用固定寬度（roughMeasure），和字型、環境無關。
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '@/core/files';
import {
  buildLyricLines,
  type LyricFxLine,
  type LyricPlanOptions,
  roughMeasure,
} from '@/core/lyricfx';
import {
  drawScatter,
  planScatter,
  type ScatterPlan,
  type ScatterSettings,
  scatterDefaults,
  scatterLock,
} from '@/core/lyricfx/styles/scatter';
import { SAMPLE_LYRICS } from '@/tools/lyric-fx/sample';
import { recordCanvas } from '../helpers/canvasRecorder';

const FS = 'node:fs';
const { existsSync, readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, enc: 'utf8') => string;
  writeFileSync: (p: string, data: string) => void;
};
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .LYRIC_FX_GOLDEN_WRITE === '1';
const FIXTURE = new URL('./fixtures/lyric-fx-golden.json', import.meta.url).pathname;
const env = roughMeasure();

const lrc = (n: number, gap: number, text: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => {
    const t = 1 + i * gap;
    const m = Math.floor(t / 60);
    return `[${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(2).padStart(5, '0')}]${text(i)}`;
  }).join('\n');

interface Case {
  name: string;
  lines: LyricFxLine[];
  settings: Partial<ScatterSettings>;
  seed: number;
  size: { width: number; height: number };
  options?: LyricPlanOptions;
}

const lines = (text: string, opts: Parameters<typeof buildLyricLines>[1] = {}) =>
  buildLyricLines(text, opts).lines;

function cases(): Case[] {
  const sample = lines(SAMPLE_LYRICS);
  const both = lines(SAMPLE_LYRICS, { language: 'both' });
  const latin = lines(
    lrc(10, 2.2, (i) => `Line number ${i + 1} sings along the quiet road tonight`),
  );
  const crowded = lines(
    lrc(
      36,
      0.6,
      (i) => `第${i + 1}句很長很長的歌詞在畫面上擠來擠去看看放不放得下${'啦'.repeat(i % 7)}`,
    ),
  );
  const base: Omit<Case, 'name' | 'lines' | 'settings'> = {
    seed: 20261021,
    size: { width: 1920, height: 1080 },
  };
  /* 鎖定第 4 句（在 1920 × 1080 記下），再換到直式畫面 */
  const lockPlan = planScatter(sample, scatterDefaults(), base.seed, base.size, env) as ScatterPlan;
  const lock = scatterLock(lockPlan, sample[3].key);
  const locked = sample.map((l, i) => (i === 3 ? { ...l, lock } : l));
  return [
    { name: 'sample-default', lines: sample, settings: {}, ...base },
    {
      name: 'sample-preview2-bright-partition',
      lines: sample,
      settings: { preview: 2, keepDim: false, partition: true },
      ...base,
    },
    {
      name: 'sample-region-center-preview2',
      lines: sample,
      settings: { preview: 2 },
      ...base,
      options: { region: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 } },
    },
    {
      name: 'both-languages',
      lines: both,
      settings: { fontSize: 60, angleMin: -25, angleMax: 15 },
      ...base,
      seed: 99,
    },
    {
      name: 'latin-stroke-no-glow-no-persp',
      lines: latin,
      settings: { glow: false, perspective: false, strokeWidth: 2, spacing: -1.5 },
      ...base,
      seed: 4242,
    },
    {
      name: 'portrait-locked',
      lines: locked,
      settings: { preview: 1 },
      ...base,
      size: { width: 1080, height: 1920 },
    },
    {
      name: 'crowded-rewrap-fallback',
      lines: crowded,
      settings: { fontSize: 80, preview: 2, angleMin: -30, angleMax: 30 },
      ...base,
      seed: 7,
    },
    {
      name: 'untimed',
      lines: lines('沒有時間的第一行\n第二行比較長一點點\nthird line'),
      settings: {},
      ...base,
      size: { width: 1280, height: 720 },
    },
  ];
}

const sha = (v: unknown) =>
  bytesToHex(
    sha256Sync(
      new TextEncoder().encode(
        JSON.stringify(v, (_k, x) =>
          x instanceof Map
            ? undefined
            : typeof x === 'number' && !Number.isFinite(x)
              ? String(x)
              : x,
        ),
      ),
    ),
  );

/** 畫的時間點：每一句開始後 0.05、0.6、1.7 秒（前 6 句）＋開頭與最後 */
function timesOf(p: ScatterPlan): number[] {
  const ts = [0, 0.3];
  for (const l of p.lines.slice(0, 6)) ts.push(l.start + 0.05, l.start + 0.6, l.start + 1.7);
  const last = p.lines[p.lines.length - 1];
  if (last) ts.push(last.start + 3, last.start + 30);
  return ts.map((t) => Math.round(t * 1000) / 1000);
}

function snapshot(c: Case) {
  const s = { ...scatterDefaults(), ...c.settings };
  const p = planScatter(c.lines, s, c.seed, c.size, env, c.options);
  const summary = p.lines.map((l) => ({
    key: l.key,
    x: l.x,
    y: l.y,
    angle: l.angle,
    rows: l.rows,
    box: l.box,
    start: l.start,
    interval: l.interval,
    slotBorn: l.slotBorn,
    fadeStart: Number.isFinite(l.fadeStart) ? l.fadeStart : null,
    fadeEnd: Number.isFinite(l.fadeEnd) ? l.fadeEnd : null,
    overlapped: l.overlapped,
    locked: l.locked,
  }));
  const frames = timesOf(p).map((t) => {
    const rec = recordCanvas(c.size.width, c.size.height);
    drawScatter(rec.ctx, t, p, s, { x: 0, y: 0, ...c.size });
    return { t, calls: rec.log.length, sha: sha(rec.log) };
  });
  return { name: c.name, plan: sha(p), summary, frames };
}

describe('沒有逐句手動調整時，plan 與畫面和改版前完全相同', () => {
  const all = cases().map(snapshot);
  if (WRITE) {
    writeFileSync(FIXTURE, `${JSON.stringify(all, null, 1)}\n`);
    it.skip('寫入基準', () => {});
    return;
  }
  const golden: ReturnType<typeof snapshot>[] = existsSync(FIXTURE)
    ? JSON.parse(readFileSync(FIXTURE, 'utf8'))
    : [];
  it('基準有 8 種情形、每種都有畫面', () => {
    expect(golden).toHaveLength(8);
    for (const g of golden) expect(g.frames.length).toBeGreaterThan(5);
  });
  for (const snap of all)
    it(snap.name, () => {
      const g = golden.find((x) => x.name === snap.name);
      expect(g, snap.name).toBeTruthy();
      expect(snap.summary).toEqual(g?.summary);
      expect(snap.plan).toBe(g?.plan);
      expect(snap.frames).toEqual(g?.frames);
    });
});
