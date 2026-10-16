/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 第五批：時間軸的補間（logic/tween）和原作量到的數值對照（研究筆記 b45-scripts 的 tl1、tl4、tl5）：
 * - tl1：移動的角色 550 → 750，p＝0.25／0.5／0.75 時 575／650／725；退場的不透明度 0.75／0／0、進場的 0／0／0.75。
 * - tl4：便利貼寬 200 → 300、換字：0.25 時新字 0.125、舊字 0.875（舊的 id 加 1e9）、寬 212.5；只在第 2 格的便利貼 0／0／0.75。
 * - tl5：關係類型 陌生 → 朋友 → 摯友：原作在過場一開始就換成下一格（第 1 格的類型看不到）；本站過半才換（7.4 第 4 項）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chartParts } from '@/tools/relation-chart/engine/chart';
import { maxFrameSize, TWEEN_ID_OFFSET, tweenAt } from '@/tools/relation-chart/logic/tween';
import { emptySheet, initialProject } from '@/tools/relation-chart/model/normalize';
import type { Sheet } from '@/tools/relation-chart/model/types';
import {
  addChar,
  addType,
  deleteChars,
  linkClick,
  startLink,
  updateChar,
  updateRel,
} from '@/tools/relation-chart/state/actions';
import { addNote, updateNote } from '@/tools/relation-chart/state/noteActions';
import { activeSheet, setUi, updateProject, useProject } from '@/tools/relation-chart/state/store';
import {
  addFrameAfter,
  convertToTimeline,
  copyFrameAt,
  switchFrame,
} from '@/tools/relation-chart/state/tlActions';

beforeEach(() => {
  let t = 1e12;
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 10));
  setUi({ sel: [], panel: null, focus: null, readonly: false, tlPos: null, link: null });
});

function start(n = 2): number[] {
  const s = emptySheet(1, 1, { W: 1100, H: 900 });
  useProject.getState().replace({ ...initialProject(), sheets: [s], nextId: 10 });
  const ids: number[] = [];
  for (let i = 0; i < n; i++) ids.push(addChar(() => 0.5));
  ids.forEach((id, i) => {
    updateChar(id, (c) => {
      c.x = 550;
      c.y = 200 + i * 200;
    });
  });
  useProject.temporal.getState().clear();
  return ids;
}

const sheet = (): Sheet => activeSheet();
const charAt = (p: number, id: number, opts = {}) => {
  const r = tweenAt(sheet(), p, opts);
  const c = r.sheet.chars.find((x) => x.id === id);
  return { x: c?.x, y: c?.y, op: c ? (r.fx?.charOp.get(id) ?? 1) : null };
};

describe('補間：角色（原作 tl1）', () => {
  it('座標用 easeInOutQuad 內插；只在一格的角色前半淡出、後半淡入', () => {
    const [mover, gone] = start(2);
    convertToTimeline();
    copyFrameAt(0);
    updateChar(mover, (c) => {
      c.x = 750;
    });
    deleteChars([gone]);
    const added = addChar(() => 0.3);
    switchFrame(0);
    const got = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
      x: charAt(p, mover).x,
      gone: charAt(p, gone).op ?? 0,
      added: charAt(p, added).op ?? 0,
    }));
    expect(got).toEqual([
      { x: 550, gone: 1, added: 0 },
      { x: 575, gone: 0.75, added: 0 },
      { x: 650, gone: 0, added: 0 },
      { x: 725, gone: 0, added: 0.75 },
      { x: 750, gone: 0, added: 1 },
    ]);
  });

  it('保持格不會卡住：每條軌道從前一個關鍵影格補到下一個關鍵影格', () => {
    const [a] = start(1);
    convertToTimeline();
    addFrameAfter(); /* 第 2 格保持 */
    copyFrameAt(1); /* 第 3 格：關鍵 */
    updateChar(a, (c) => {
      c.x = 950;
    });
    switchFrame(0);
    /* 0 → 2 一整段：p＝1 是一半（ease(0.5)＝0.5） */
    expect(charAt(1, a).x).toBe(750);
    expect(charAt(0.5, a).x).toBeCloseTo(550 + 400 * 0.125, 6);
  });

  it('換了變體：交叉淡化（舊的 id 加 1e9）；開翻轉動畫＝前半舊的壓扁、後半新的展開', () => {
    const [a] = start(1);
    convertToTimeline();
    copyFrameAt(0);
    /* 第 2 格換一件新的變體（名字不同） */
    updateProject((p) => {
      const s = p.sheets[0];
      const c = s.chars[0];
      const e = p.library.find((x) => x.id === c.lib);
      if (!e) return;
      const v = { ...e.variants[0], id: p.nextId++, name: '變身後' };
      e.variants.push(v);
      c.vari = v.id;
      c.name = '變身後';
    });
    switchFrame(0);
    const r = tweenAt(sheet(), 0.25);
    const both = r.sheet.chars.filter((c) => c.id === a || c.id === a + TWEEN_ID_OFFSET);
    expect(both.map((c) => [c.name, r.fx?.charOp.get(c.id)])).toEqual([
      ['變身後', 0.125],
      ['', 0.875],
    ]);
    const f1 = tweenAt(sheet(), 0.25, { flip: true });
    expect(f1.sheet.chars.map((c) => c.name)).toEqual(['']);
    expect(f1.fx?.charFlip.get(a)).toBeCloseTo(0.75, 6);
    const f2 = tweenAt(sheet(), 0.75, { flip: true });
    expect(f2.sheet.chars.map((c) => c.name)).toEqual(['變身後']);
    expect(f2.fx?.charFlip.get(a)).toBeCloseTo(0.75, 6);
  });

  it('補間關：直接畫最近的一格（0.49 → 第 1 格、0.51 → 第 2 格）', () => {
    const [a] = start(1);
    convertToTimeline();
    copyFrameAt(0);
    updateChar(a, (c) => {
      c.x = 750;
    });
    switchFrame(0);
    expect(charAt(0.49, a, { tweenOff: true }).x).toBe(550);
    expect(charAt(0.51, a, { tweenOff: true }).x).toBe(750);
    expect(tweenAt(sheet(), 0.51, { tweenOff: true }).fx).toBeNull();
  });
});

describe('補間：關係線（原作 tl5 的修正）', () => {
  it('類型不同：過半才換成下一格的（原作一開始就換，第 1 格的類型播放時看不到）', () => {
    const [a, b] = start(2);
    const t1 = addType();
    const t2 = addType();
    startLink(t1);
    linkClick(a);
    linkClick(b);
    setUi({ link: null });
    const relId = activeSheet().rels[0].id;
    convertToTimeline();
    copyFrameAt(0);
    updateRel(relId, (r) => {
      r.type = t2;
    });
    switchFrame(0);
    const typeAt = (p: number) => tweenAt(sheet(), p).sheet.rels.find((r) => r.id === relId)?.type;
    expect([0, 0.05, 0.45, 0.5, 0.95, 1].map(typeAt)).toEqual([t1, t1, t1, t2, t2, t2]);
  });
});

describe('補間：便利貼（原作 tl4）', () => {
  it('位置與寬高內插；文字不同＝交叉淡化；只在第 2 格的 0／0／0.75', () => {
    start(0);
    convertToTimeline();
    const id = addNote(4, () => 0.5);
    updateNote(id, (n) => {
      n.text = '第一句字幕';
      n.x = 200;
    });
    copyFrameAt(0);
    updateNote(id, (n) => {
      n.text = '第二句字幕';
      n.w = 300;
      n.x = 600;
    });
    const only = addNote(2, () => 0.5);
    switchFrame(0);
    const at = (p: number, fade = true) => {
      const r = tweenAt(sheet(), p, { noteFade: fade });
      return r.sheet.notes.map((n) => [n.id, n.text, n.w, n.x, r.fx?.noteOp.get(n.id) ?? 1]);
    };
    expect(at(0.25)).toEqual([
      [id, '第二句字幕', 212.5, 250, 0.125],
      [id + TWEEN_ID_OFFSET, '第一句字幕', 212.5, 250, 0.875],
      [only, '', 100, expect.any(Number), 0],
    ]);
    expect(at(0.75).map((x) => x[4])).toEqual([0.875, 0.125, 0.75]);
    /* 文字交叉淡化關＝過半換字 */
    expect(at(0.45, false)[0].slice(0, 2)).toEqual([id, '第一句字幕']);
    expect(at(0.55, false)[0].slice(0, 2)).toEqual([id, '第二句字幕']);
  });
});

describe('補間：畫布、背景圖與畫法', () => {
  it('畫布尺寸用主時間內插；背景圖：前一張留著、後一張淡入；GIF 的輸出尺寸＝所有影格的最大值', () => {
    start(1);
    convertToTimeline();
    updateProject((p) => {
      p.sheets[0].bg = 'bg-a';
    });
    copyFrameAt(0);
    updateProject((p) => {
      p.sheets[0].W = 1300;
      p.sheets[0].H = 700;
      p.sheets[0].bg = 'bg-b';
    });
    switchFrame(0);
    const r = tweenAt(sheet(), 0.5);
    expect([r.sheet.W, r.sheet.H]).toEqual([1200, 800]);
    expect(r.fx?.bg).toEqual({ a: 'bg-a', b: 'bg-b', t: 0.5 });
    expect(maxFrameSize(sheet())).toEqual({ W: 1300, H: 900 });
    const parts = chartParts(r.sheet, {
      mode: 'export',
      href: (x) => `u:${x}`,
      font: 'sans',
      tween: r.fx,
    });
    expect(parts.bgImage).toContain('href="u:bg-a"');
    expect(parts.bgImage).toContain('href="u:bg-b"');
    expect(parts.bgImage).toContain('opacity="0.500"');
  });

  it('退場的角色、線在畫出來的 SVG 裡帶不透明度', () => {
    const [a, b] = start(2);
    const t1 = addType();
    startLink(t1);
    linkClick(a);
    linkClick(b);
    setUi({ link: null });
    convertToTimeline();
    copyFrameAt(0);
    deleteChars([b]);
    switchFrame(0);
    const r = tweenAt(sheet(), 0.25);
    const parts = chartParts(r.sheet, {
      mode: 'export',
      href: () => null,
      font: 'sans',
      tween: r.fx,
    });
    expect(parts.nodes).toContain('<g opacity="0.750">');
    expect(parts.edges).toContain('<g opacity="0.750">');
    /* 沒有補間＝和以前一模一樣 */
    const plain = chartParts(sheet(), { mode: 'export', href: () => null, font: 'sans' });
    expect(plain.nodes).not.toContain('opacity="0.750"');
  });
});
