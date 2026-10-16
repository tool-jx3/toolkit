/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 便利貼（F190）與圖表節點（F192f）：畫法、字級、斷行、外擴、分層匯出、動作（新增、拖曳、改大小、關閉進便利貼庫、放回）。
 * 預期值取自原作（研究筆記的 notes1：自動字級、noteSnap、隱藏紙面的 markup、改大小、刪除後的紀錄）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editorSvg, exportLayers, exportSvg, viewerSvg } from '@/tools/relation-chart/engine/chart';
import { sheetCtx } from '@/tools/relation-chart/engine/geom';
import {
  noteAutoFontSize,
  noteFontSize,
  noteLook,
  noteSvg,
  noteWrapLines,
} from '@/tools/relation-chart/engine/notes';
import { makeChar } from '@/tools/relation-chart/model/factory';
import {
  emptySheet,
  initialProject,
  normalizeProject,
} from '@/tools/relation-chart/model/normalize';
import { noteSnap } from '@/tools/relation-chart/model/notes';
import type { Note, Project, Sheet } from '@/tools/relation-chart/model/types';
import {
  addChartNote,
  addNote,
  closeNote,
  deleteBinItem,
  moveNote,
  resizeNote,
  restoreNote,
} from '@/tools/relation-chart/state/noteActions';
import { setUi, useProject } from '@/tools/relation-chart/state/store';

const note = (o: Partial<Note> = {}): Note => ({
  id: 130,
  text: '',
  x: 500,
  y: 500,
  w: 200,
  h: 200,
  size: null,
  locked: false,
  bare: false,
  chart: null,
  ...o,
});
const noImg = () => null;
const sheetWith = (notes: Note[], o: Partial<Sheet> = {}) => {
  const s = emptySheet(1, 1, { W: 1100, H: 900, ...o });
  s.notes = notes;
  return s;
};

describe('字級與斷行（原作的 noteAutoFontSize、noteWrapLines、noteSnap）', () => {
  it('自動字級：空白依大小、短字放大、長字縮小（和原作相同）', () => {
    const mk = (text: string, w: number, h: number) => noteAutoFontSize({ text, w, h });
    expect(mk('', 200, 200)).toBe(15);
    expect(mk('', 100, 100)).toBe(8);
    expect(mk('', 500, 500)).toBe(28);
    expect(mk('短', 200, 200)).toBe(28);
    expect(mk('這是一段比較長的文字，看看會不會縮小字級。'.repeat(3), 200, 200)).toBe(17);
    expect(mk('x'.repeat(400), 200, 200)).toBe(9);
    expect(mk('第一行\n第二行比較長一點的文字', 200, 200)).toBe(28);
  });

  it('字級的順序：個別 → 分頁預設 → 自動', () => {
    const s = sheetWith([]);
    const ctx = sheetCtx(s);
    expect(noteFontSize(ctx, note({ text: '短' }))).toBe(28);
    s.settings.defStickySize = 20;
    expect(noteFontSize(sheetCtx(s), note({ text: '短' }))).toBe(20);
    expect(noteFontSize(sheetCtx(s), note({ text: '短', size: 12 }))).toBe(12);
  });

  it('寬高吸到 50 的倍數、至少 100', () => {
    expect([10, 74, 75, 125, undefined, 1000].map((v) => noteSnap(v, 200))).toEqual([
      100, 100, 100, 150, 200, 1000,
    ]);
  });

  it('斷行：先照換行切段、段內逐字塞（空行保留）', () => {
    expect(noteWrapLines('一二三四五\n\nab', 45, 1)).toEqual(['一二三', '四五', '', 'ab']);
  });
});

describe('畫法', () => {
  it('隱藏紙面：紙面與分隔線透明、文字加紙色描邊、命中框貼著文字（座標和原作相同）', () => {
    const n = note({
      x: 595.8757798081864,
      y: 522.5445087419675,
      w: 300,
      h: 250,
      size: 22,
      bare: true,
      locked: true,
      text: '第一行\n第二行比較長一點的文字',
    });
    const s = sheetWith([n]);
    const svg = noteSvg(sheetCtx(s), n, { look: noteLook('dark'), ui: {} });
    expect(svg).toContain('class="note-node note-bare"');
    expect(svg).toContain('--nb-fill:#2a2a2a;--nb-edge:#393939');
    expect(svg).toContain(
      '<rect class="note-paper" x="445.9" y="397.5" width="300.0" height="250.0" rx="3" fill="rgba(0,0,0,0)" stroke="#393939" stroke-opacity="0" stroke-width="1.5"/>',
    );
    expect(svg).toContain(
      '<line class="note-sep" x1="445.9" y1="425.5" x2="745.9" y2="425.5" stroke="#393939" stroke-opacity="0" stroke-width="1"/>',
    );
    expect(svg).toContain(
      '<rect class="note-hit" x="454.0" y="429.6" width="250.0" height="63.4" fill="rgba(0,0,0,0)"/>',
    );
    expect(svg).toContain(
      '<text x="458.0" y="452.5" font-size="22" fill="#ffffff" stroke="#2a2a2a" stroke-width="4.84" paint-order="stroke" stroke-linejoin="round" xml:space="preserve">第一行</text>',
    );
    expect(svg).toContain('y="482.2"');
    /* 釘選＝沒有把手；小圓鈕三顆 */
    expect(svg).not.toContain('note-grip');
    expect(svg.match(/class="note-btn"/g)).toHaveLength(3);
  });

  it('一般便利貼：紙色、紙邊、把手；淺色配色', () => {
    const n = note({ text: '測試' });
    const dark = noteSvg(sheetCtx(sheetWith([n])), n, { look: noteLook('dark'), ui: {} });
    expect(dark).toContain('fill="#2a2a2a" stroke="#393939"');
    expect(dark).toContain('class="note-grip"');
    const light = noteSvg(sheetCtx(sheetWith([n])), n, { look: noteLook('light'), ui: {} });
    expect(light).toContain('fill="#e0e0e0" stroke="#a1a1a1"');
    expect(light).toContain('fill="#121212"');
  });

  it('放不下的字：最後一行最後一個字換成「…」', () => {
    const n = note({ text: '一二三四五六七八九十'.repeat(20), size: 40, w: 100, h: 100 });
    const svg = noteSvg(sheetCtx(sheetWith([n])), n, { look: noteLook('dark'), ui: null });
    expect(svg).toMatch(/…<\/text><\/g><\/g>$/);
    expect(svg.match(/<text /g)).toHaveLength(1);
  });

  it('沒有便利貼：不出便利貼層（第一～三批的輸出不變）', () => {
    const s = sheetWith([]);
    expect(editorSvg(s, { href: noImg, font: 'sans' }).svg).not.toContain('layer-notes');
    expect(exportLayers(s, { href: noImg, font: 'sans' }).layers.map((l) => l.id)).not.toContain(
      'layer-notes',
    );
  });

  it('便利貼畫在最上層；匯出與互動網頁沒有小圓鈕、把手、命中框；分層匯出多一層「便利貼」', () => {
    const s = sheetWith([note({ text: 'A', bare: true }), note({ id: 131, x: 300, text: 'B' })]);
    s.chars.push(makeChar(1, '主角', 500, 500, { defNo: 1 }));
    const ed = editorSvg(s, { href: noImg, font: 'sans' }).svg;
    expect(ed.indexOf('layer-notes')).toBeGreaterThan(ed.indexOf('layer-legend'));
    expect(ed).toContain('note-btn');
    for (const out of [
      exportSvg(s, { href: noImg, font: 'sans' }),
      viewerSvg(s, { href: noImg, font: 'sans' }),
    ]) {
      expect(out).toContain('<g class="layer-notes">');
      for (const ui of ['note-btn', 'note-grip', 'note-hit', '--nb-fill'])
        expect(out).not.toContain(ui);
    }
    const L = exportLayers(s, { href: noImg, font: 'sans' });
    expect(L.layers.at(-1)).toMatchObject({ id: 'layer-notes', label: '便利貼' });
  });

  it('畫布外的便利貼：畫面外擴（溢出＋96）、不畫出血框；畫布下方多一行說明', () => {
    const s = sheetWith([note({ x: 1100 + 300, y: 400 })]);
    const r = editorSvg(s, { href: noImg, font: 'sans' });
    expect(r.parts.bleed).toBe(0);
    expect(r.pad).toBe(1400 + 100 - 1100 + 96);
    expect(r.svg).not.toContain('canvas-bleed-frame');
    expect(r.svg).toContain(
      '有 1 張便利貼在畫布外：互動網頁看得到，但 .png 只裁畫布、不會包含它們。',
    );
    /* 互動網頁的可視範圍＝畫布 ∪ 便利貼，外加 16（原作 viewerViewBox；不是四邊等量的外擴） */
    const v = viewerSvg(s, { href: noImg, font: 'sans' });
    expect(v).toContain(`viewBox="-16 -16 ${1500 + 32} ${900 + 32}"`);
  });

  it('編輯中的便利貼：文字讓位給輸入框（note-editing）', () => {
    const s = sheetWith([note({ text: 'x' })]);
    const svg = editorSvg(s, { href: noImg, font: 'sans', ui: { noteEdit: 130 } }).svg;
    expect(svg).toContain('class="note-node note-editing"');
  });
});

describe('圖表節點', () => {
  function project(): Project {
    const s = emptySheet(1, 1, { W: 1100, H: 900 });
    s.chars.push(
      makeChar(1, '甲', 300, 300, { defNo: 1, color: '#ff0000' }),
      makeChar(2, '乙', 600, 300, { defNo: 2 }),
    );
    const p = normalizeProject({
      sheets: [s],
      active: 0,
      labels: [],
      nextId: 100,
      font: 'sans',
      radarTpls: [
        {
          id: 50,
          name: '能力',
          chart: 'radar',
          shape: 'poly',
          rings: 4,
          valMode: 'raw',
          shared: false,
          axes: [
            { id: 51, label: '力', max: 100, unit: '' },
            { id: 52, label: '速', max: 100, unit: '' },
            { id: 53, label: '智', max: 100, unit: '' },
          ],
        },
      ],
    }) as Project;
    const v1 = p.library.find((e) => e.id === p.sheets[0].chars[0].lib)?.variants[0];
    v1?.radars.push(
      { tpl: 50, state: '戰前', vals: { 51: 80 } },
      { tpl: 50, state: '戰後', vals: { 51: 30 } },
    );
    return p;
  }
  const render = (p: Project, n: Note) =>
    noteSvg(sheetCtx(p.sheets[0]), n, {
      look: noteLook('dark'),
      ui: null,
      radarTpls: p.radarTpls,
      library: p.library,
    });

  it('標題、圖、圖例（A 的第 2 個狀態＝「名字・狀態」、自訂外框色）；範本不存在／沒有數值時說明', () => {
    const p = project();
    const chart = { tpl: 50, a: 1, b: 2, stA: 1, stB: 0, legend: true };
    const svg = render(p, note({ text: '對照\n第二行不畫', w: 400, h: 400, chart }));
    expect(svg).toContain('class="note-node chart-node"');
    expect(svg).toContain('font-size="14" font-weight="700" fill="#ffffff">對照</text>');
    expect(svg).not.toContain('第二行不畫');
    expect(svg).toContain('class="radar-svg"');
    expect(svg).toContain('>甲・戰後</text>');
    expect(svg).toContain('r="4.5" fill="#ff0000"');
    /* 乙沒有數值：只有一組 */
    expect(svg.match(/r="4.5"/g)).toHaveLength(1);
    expect(render(p, note({ chart: { ...chart, tpl: 999 } }))).toContain('>範本不存在</text>');
    expect(render(p, note({ chart: { ...chart, a: 2, b: 0 } }))).toContain('>尚無數值</text>');
    expect(render(p, note({ chart: { ...chart, legend: false } }))).not.toContain('r="4.5"');
  });
});

describe('動作', () => {
  beforeEach(() => {
    /* 同一毫秒的連續變更會合併成一步復原：每次讀時間都往前走 */
    let t = 1e12;
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 10));
    const p = initialProject();
    p.sheets[0].W = 1100;
    p.sheets[0].H = 900;
    useProject.getState().replace(p);
    setUi({ sel: [] });
  });
  const notes = () => useProject.getState().data.sheets[0].notes;
  const bin = () => useProject.getState().data.noteBin;

  it('新增：4 × 4、畫布中央 ±40；尺寸範本 n × n；開著對齊格線時邊吸格線', () => {
    addNote(undefined, () => 0.75);
    expect(notes()[0]).toMatchObject({ w: 200, h: 200, x: 570, y: 470, text: '' });
    addNote(3, () => 0.5);
    expect(notes()[1]).toMatchObject({ w: 150, h: 150, x: 550, y: 450 });
    useProject.getState().update((d) => {
      d.sheets[0].settings.gridSnap = true;
    });
    addNote(3, () => 0.5);
    /* 左上角 475、375 → 吸到 500、400（間距 50） */
    expect(notes()[2]).toMatchObject({ x: 575, y: 475 });
  });

  it('改大小：左上角固定、吸 50 的倍數、最小 100（原作實測：200 × 200 拖 (+80, +30) → 300 × 250）', () => {
    const id = addNote(undefined, () => 0.5);
    const n = notes()[0];
    const left = n.x - n.w / 2;
    const top = n.y - n.h / 2;
    resizeNote(id, left, top, left + 280, top + 230);
    expect(notes()[0]).toMatchObject({ w: 300, h: 250, x: left + 150, y: top + 125 });
    resizeNote(id, left, top, left + 10, top - 50);
    expect(notes()[0]).toMatchObject({ w: 100, h: 100 });
  });

  it('拖曳：不夾在畫布內；對齊格線＝邊吸格線（格線間距）', () => {
    const id = addNote(undefined, () => 0.5);
    moveNote(id, 2000, -300);
    expect(notes()[0]).toMatchObject({ x: 2000, y: -300 });
    useProject.getState().update((d) => {
      d.sheets[0].settings.gridSnap = true;
      d.sheets[0].settings.gridStep = 40;
    });
    moveNote(id, 517, 233);
    /* 寬 200：左緣 417 → 400、上緣 133 → 120 */
    expect(notes()[0]).toMatchObject({ x: 500, y: 220 });
  });

  it('關閉＝進便利貼庫（最新的在前、最多 60 筆、可以復原）；點紀錄＝放回並移出紀錄；刪除模式＝只刪紀錄', () => {
    const id = addNote(undefined, () => 0.5);
    useProject.getState().update((d) => {
      d.sheets[0].notes[0].text = '第一行\n第二行';
      d.sheets[0].notes[0].size = 22;
      d.sheets[0].notes[0].bare = true;
    });
    closeNote(id);
    expect(notes()).toHaveLength(0);
    expect(bin()[0]).toMatchObject({
      text: '第一行\n第二行',
      w: 200,
      h: 200,
      size: 22,
      bare: true,
    });
    useProject.temporal.getState().undo();
    expect(notes()).toHaveLength(1);
    expect(bin()).toHaveLength(0);
    useProject.temporal.getState().redo();
    const binId = bin()[0].id;
    const back = restoreNote(binId, () => 0.5);
    expect(back).not.toBe(id);
    expect(bin()).toHaveLength(0);
    expect(notes()[0]).toMatchObject({ text: '第一行\n第二行', size: 22, bare: true, x: 550 });
    for (let i = 0; i < 62; i++) closeNote(addNote());
    expect(bin()).toHaveLength(60);
    const first = bin()[0].id;
    deleteBinItem(first);
    expect(bin()).toHaveLength(59);
    expect(notes()).toHaveLength(1);
  });

  it('圖表節點：8 × 8、範本＝第一份、A＝唯一選取的角色', () => {
    useProject.getState().update((d) => {
      d.sheets[0].chars.push(makeChar(7, '甲', 100, 100, { defNo: 1 }));
      d.radarTpls.push({
        id: 50,
        name: '',
        chart: 'radar',
        shape: 'poly',
        rings: 4,
        valMode: 'raw',
        shared: false,
        axes: [],
      });
    });
    setUi({ sel: [7] });
    addChartNote({}, () => 0.5);
    expect(notes()[0]).toMatchObject({
      w: 400,
      h: 400,
      chart: { tpl: 50, a: 7, b: 0, stA: 0, stB: 0, legend: true },
    });
  });
});
