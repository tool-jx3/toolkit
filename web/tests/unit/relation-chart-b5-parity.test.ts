/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 第五批和原作逐數值對照：`fixtures/relation-chart-b5-orig.json` 是用原作（Playwright 開原作的 HTML）算出來的
 * （產生的腳本：實作者暫存的 parity-orig.mjs）：
 * - b45-timeline-notes 的「第一章（時間軸）」在 15 個時間點的補間：每位角色的座標與不透明度（含交叉淡化的 1e9 id）、
 *   每條關係的類型與不透明度、每張便利貼的位置／寬高／文字／不透明度、畫布尺寸、背景圖的交叉淡化；
 * - GIF（20 fps、長邊 960、上限 600 格）與影片（長邊 1920、上限 1800 格）的取樣計畫；
 * - 互動網頁的動畫：每段步數、總張數、每段秒數（原作算了沒放進網頁；本站放進去，7.4 第 7 項）；
 * - 快照的稀疏化（假時間，原作的 snapPrune 留下哪些）。
 */
import { describe, expect, it } from 'vitest';
import { animPlanFor } from '@/tools/relation-chart/export/anim';
import { animSteps } from '@/tools/relation-chart/export/viewerAnim';
import { convertLegacy } from '@/tools/relation-chart/logic/legacy';
import { TWEEN_ID_OFFSET, tweenAt } from '@/tools/relation-chart/logic/tween';
import { normalizeSheet } from '@/tools/relation-chart/model/normalize';
import { frameDur } from '@/tools/relation-chart/model/timeline';
import type { Sheet, Timeline } from '@/tools/relation-chart/model/types';
import { pruneSnaps } from '@/tools/relation-chart/state/snapshots';

const FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc: 'utf8') => string;
};
const DIR = `${(globalThis as { process?: { cwd: () => string } }).process?.cwd()}/tests/unit/fixtures/`;
const fixture = <T>(name: string) => JSON.parse(readFileSync(`${DIR}${name}`, 'utf8')) as T;

interface OrigChar {
  id: number;
  x: number;
  y: number;
  op: number;
  flip: number | null;
}
interface OrigNote {
  id: number;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  text: string;
  op: number;
}
interface OrigFrame {
  W: number;
  H: number;
  chars: OrigChar[];
  rels: { id: number; type: number; op: number }[];
  notes: OrigNote[];
  bg: { a: number | null; b: number | null; t: number } | null;
}
const ORIG = fixture<{
  tween: Record<string, OrigFrame>;
  plan: {
    gif: { n: number; delay: number; CW: number; CH: number; poss: number[] };
    video: { n: number; delay: number; CW: number; CH: number };
  };
  viewer: { steps: number; n: number; frames: number; durs: number[] };
  prune: { input: { id: string; auto: boolean; savedAt: number }[]; kept: string[] };
}>('relation-chart-b5-orig.json');

/** 原作的 id 照用（不經過加入專案的換 id）；背景圖的「資產 id」用影格的索引代替 */
function timelineSheet(): Sheet {
  const conv = convertLegacy(fixture('relation-chart-b5-timeline.json'));
  const raw = conv.sheets[1];
  const tl = raw.tl as Timeline;
  if (raw.tl) {
    const top = conv.backgrounds.get(raw);
    tl.frames.forEach((f, k) => {
      const ref = conv.backgrounds.get(f);
      if (ref) {
        f.bg = `frame0${k}`;
      }
    });
    if (top) raw.bg = `frame0${tl.active}`;
  }
  return normalizeSheet(raw, raw.id) as Sheet;
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

describe('補間和原作逐數值相同（b45-timeline-notes，15 個時間點）', () => {
  const s = timelineSheet();
  for (const [key, o] of Object.entries(ORIG.tween)) {
    it(`p＝${key}`, () => {
      const r = tweenAt(s, Number(key));
      const fx = r.fx;
      expect([r6(r.sheet.W), r6(r.sheet.H)]).toEqual([r6(o.W), r6(o.H)]);
      /* 角色：座標、不透明度（交叉淡化的舊的那份 id 加 1e9） */
      const chars = r.sheet.chars.map((c) => ({
        id: c.id,
        x: r6(c.x),
        y: r6(c.y),
        op: r6(fx?.charOp.get(c.id) ?? 1),
        flip: fx?.charFlip.get(c.id) ?? null,
      }));
      const want = o.chars.map((c) => ({ ...c, x: r6(c.x), y: r6(c.y), op: r6(c.op) }));
      const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
      expect(chars.sort(byId)).toEqual(want.sort(byId));
      expect(chars.every((c) => c.id < TWEEN_ID_OFFSET || c.op < 1)).toBe(true);
      /* 關係：類型（這份範例每一格的類型相同）與不透明度 */
      const rels = r.sheet.rels.map((x) => ({
        id: x.id,
        type: x.type,
        op: r6(fx?.relOp.get(x.id) ?? 1),
      }));
      expect(rels.sort(byId)).toEqual(o.rels.map((x) => ({ ...x, op: r6(x.op) })).sort(byId));
      /* 便利貼：位置、寬高（原作只在兩格都有時內插）、文字、不透明度 */
      const notes = r.sheet.notes.map((n) => ({
        id: n.id,
        x: r6(n.x),
        y: r6(n.y),
        w: r6(n.w),
        h: r6(n.h),
        text: n.text,
        op: r6(fx?.noteOp.get(n.id) ?? 1),
      }));
      const wantN = o.notes.map((n) => {
        const mine = notes.find((x) => x.id === n.id);
        return {
          id: n.id,
          x: r6(n.x),
          y: r6(n.y),
          w: n.w === null ? (mine?.w ?? -1) : r6(n.w),
          h: n.h === null ? (mine?.h ?? -1) : r6(n.h),
          text: n.text,
          op: r6(n.op),
        };
      });
      expect(notes.sort(byId)).toEqual(wantN.sort(byId));
      /* 背景圖：前一張、後一張與比例（影格索引） */
      if (o.bg && fx?.bg) {
        const idx = (v: string | null) => (v ? Number(v.slice(6)) : null);
        expect([idx(fx.bg.a), idx(fx.bg.b), r6(fx.bg.t)]).toEqual([o.bg.a, o.bg.b, r6(o.bg.t)]);
      }
    });
  }
});

describe('GIF／影片的取樣計畫和原作相同', () => {
  const s = timelineSheet();
  it('GIF：65 格、每格 50 ms、960 × 785，取樣位置逐一相同', () => {
    const p = animPlanFor(s, 'gif');
    expect([p.ps.length, p.delay, p.w, p.h]).toEqual([
      ORIG.plan.gif.n,
      ORIG.plan.gif.delay,
      ORIG.plan.gif.CW,
      ORIG.plan.gif.CH,
    ]);
    expect(p.ps.map(r6)).toEqual(ORIG.plan.gif.poss);
  });
  it('影片：65 格、1100 × 900（寬高本來就是偶數）', () => {
    const p = animPlanFor(s, 'video', true);
    expect([p.ps.length, p.delay, p.w, p.h]).toEqual([
      ORIG.plan.video.n,
      ORIG.plan.video.delay,
      ORIG.plan.video.CW,
      ORIG.plan.video.CH,
    ]);
  });
});

describe('互動網頁的動畫資料和原作相同（再加上每段秒數）', () => {
  it('每段 24 步、共 73 張；每段秒數＝原作算出來的 durs', () => {
    const s = timelineSheet();
    const tl = s.tl as Timeline;
    const n = tl.frames.length;
    expect([animSteps(n), (n - 1) * animSteps(n) + 1]).toEqual([
      ORIG.viewer.steps,
      ORIG.viewer.frames,
    ]);
    expect(tl.frames.slice(0, -1).map((_f, k) => Math.round(frameDur(tl, k) * 100) / 100)).toEqual(
      ORIG.viewer.durs,
    );
  });
});

describe('快照的稀疏化和原作留下同一批（假時間）', () => {
  it('63 份自動＋2 份手動 → 留下的 id 與順序相同', () => {
    const input = ORIG.prune.input.slice().sort((a, b) => b.savedAt - a.savedAt);
    expect(pruneSnaps(input).map((e) => e.id)).toEqual(ORIG.prune.kept);
  });
});
