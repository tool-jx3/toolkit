/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器的資料與純計算（規格 docs/refactor/specs/relation-chart.md）：讀檔整理、名稱規則、關係表、
 * 排列與對齊、磁鐵、原作專案檔的轉換、範例。
 */
import { describe, expect, it } from 'vitest';
import { charRadius, displayName, sheetCtx, sheetName } from '@/tools/relation-chart/engine/geom';
import { applyAlign, canDistribute } from '@/tools/relation-chart/logic/align';
import { forceStep } from '@/tools/relation-chart/logic/force';
import {
  applyLayout,
  fitCanvasToContent,
  reorderKeepSlots,
  resizeCanvas,
  separateAll,
  shuffleSeats,
} from '@/tools/relation-chart/logic/layout';
import {
  convertLegacy,
  findProjectJson,
  isLegacyProject,
  legacyCropToPlacement,
} from '@/tools/relation-chart/logic/legacy';
import { buildSample, SAMPLES } from '@/tools/relation-chart/logic/samples';
import {
  buildRelTable,
  parseBatchPaste,
  parseRelTable,
  planImport,
  relLabelNorm,
} from '@/tools/relation-chart/logic/table';
import {
  copyName,
  copyTypeLabel,
  makeChar,
  makeRel,
  makeType,
  unnamedTypeLabel,
} from '@/tools/relation-chart/model/factory';
import {
  emptySheet,
  initialProject,
  normalizeProject,
  normalizeRel,
  normalizeType,
  safeColor,
  smallestFree,
} from '@/tools/relation-chart/model/normalize';
import type { Sheet } from '@/tools/relation-chart/model/types';

function sheetWith(n: number, W = 1000, H = 1000): Sheet {
  const s = emptySheet(1, 1, { W, H });
  for (let i = 0; i < n; i++)
    s.chars.push(makeChar(i + 1, `角色${i + 1}`, W / 2, H / 2, { defNo: i + 1 }));
  return s;
}

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('讀檔整理（3.8）', () => {
  it('第一次開：一張 1000 × 1000 的空白分頁', () => {
    const p = initialProject();
    expect(p.sheets).toHaveLength(1);
    expect(p.sheets[0]).toMatchObject({ W: 1000, H: 1000, chars: [], rels: [], types: [] });
    expect(sheetName(p.sheets[0])).toBe('分頁1');
  });

  it('null 不是 0：線的外框、標籤位置、自我關係角度留空＝自動', () => {
    const t = normalizeType({ id: 1, label: 'a', outlineW: null, lineW: null }, 1);
    expect(t?.outlineW).toBeNull();
    expect(t?.lineW).toBeNull();
    const r = normalizeRel({ id: 2, from: 1, to: 1, type: 1, labelT: null, selfAng: null }, 2);
    expect(r?.labelT).toBeNull();
    expect(r?.selfAng).toBeNull();
    expect(normalizeType({ id: 1, outlineW: 0 }, 1)?.outlineW).toBe(0);
  });

  it('顏色只收 auto 與色碼', () => {
    expect(safeColor('#ABC')).toBe('#aabbcc');
    expect(safeColor('#11223344')).toBe('#11223344');
    expect(safeColor('red')).toBe('auto');
    expect(safeColor(undefined)).toBe('auto');
  });

  it('壞掉的資料：關係指到不存在的角色被拿掉、座標壞掉的放中央、重複的角色只留第一個', () => {
    const p = normalizeProject({
      sheets: [
        {
          id: 1,
          W: 800,
          H: 600,
          chars: [
            { id: 1, name: 'A', x: 'oops', y: 10 },
            { id: 1, name: 'B', x: 5, y: 5 },
          ],
          types: [{ id: 9, label: 'T' }],
          rels: [
            { id: 3, from: 1, to: 2, type: 9 },
            { id: 4, from: 1, to: 77, type: 9 },
          ],
        },
      ],
      active: 5,
      labels: [{ id: 50, text: '甲' }],
    });
    expect(p).not.toBeNull();
    const s = p?.sheets[0] as Sheet;
    expect(s.chars.map((c) => c.name)).toEqual(['A']);
    expect(Number.isFinite(s.chars[0].x)).toBe(true);
    expect(s.rels).toHaveLength(0);
    expect(p?.active).toBe(0);
    expect(normalizeProject('nope')).toBeNull();
  });

  it('最小未用的編號', () => {
    expect(smallestFree([1, 2, 4])).toBe(3);
    expect(smallestFree([])).toBe(1);
  });
});

describe('名稱規則', () => {
  it('未命名關係 N、複製的名稱、複製角色的名字', () => {
    expect(unnamedTypeLabel([])).toBe('未命名關係1');
    expect(unnamedTypeLabel([makeType(1, '未命名關係1'), makeType(2, '未命名關係3')])).toBe(
      '未命名關係4',
    );
    expect(copyTypeLabel('朋友', [makeType(1, '朋友')])).toBe('朋友（複製1）');
    expect(
      copyTypeLabel('朋友（複製1）', [makeType(1, '朋友'), makeType(2, '朋友（複製1）')]),
    ).toBe('朋友（複製2）');
    expect(copyName('角色2', [{ name: '角色2' }])).toBe('角色3');
    expect(copyName('阿明', [{ name: '阿明' }, { name: '阿明2' }])).toBe('阿明3');
    expect(displayName(makeChar(1, '', 0, 0, { defNo: 7 }))).toBe('角色7');
    expect(displayName(makeChar(1, '甲\n乙', 0, 0))).toBe('甲 乙');
  });
});

describe('關係表（3.6）', () => {
  it('TSV、標題列、引號、空白列、來源或目標空白', () => {
    const t = parseRelTable(
      '來源\t目標\t關係\t備註\n阿明\t小美\t喜歡\t"第一行\n第二行"\n\n\t小美\t朋友\n小美\t阿明\n',
    );
    expect(t.sep).toBe('TSV');
    expect(t.header).toBe(true);
    expect(t.rows).toEqual([
      { from: '阿明', to: '小美', rel: '喜歡', note: '第一行\n第二行' },
      { from: '小美', to: '阿明', rel: '', note: '' },
    ]);
    expect(t.bad).toHaveLength(1);
  });

  it('與原作的 parseRelTableText 相同的結果（對照原作實際輸出）', () => {
    const t = parseRelTable(
      '來源\t目標\t關係\t備註\n阿明\t小美\t喜歡\t"一\n二"\n\t乙\t朋友\n乙,丙\n小美\t阿明\t\n',
    );
    expect(t).toEqual({
      rows: [
        { from: '阿明', to: '小美', rel: '喜歡', note: '一\n二' },
        { from: '小美', to: '阿明', rel: '', note: '' },
      ],
      bad: [3, 4],
      header: true,
      sep: 'TSV',
    });
  });

  it('CSV（半形或全形逗號）、沒有標題', () => {
    const t = parseRelTable('A,B,友\nB，C，敵');
    expect(t.header).toBe(false);
    expect(t.rows.map((r) => [r.from, r.to, r.rel])).toEqual([
      ['A', 'B', '友'],
      ['B', 'C', '敵'],
    ]);
  });

  it('計畫：新角色、沿用、新關係類型、寫法幾乎相同', () => {
    const chars = [makeChar(1, '阿明', 0, 0)];
    const types = [makeType(1, 'Friend')];
    const plan = planImport(parseRelTable('阿明,小美,ｆｒｉｅｎｄ\n小美,小華,喜歡'), chars, types);
    expect(plan.newNames).toEqual(['小美', '小華']);
    expect(plan.relLabels).toEqual(['ｆｒｉｅｎｄ', '喜歡']);
    expect(plan.existingUsed).toBe(1);
    expect(plan.similar).toEqual([['Friend', 'ｆｒｉｅｎｄ']]);
    expect(relLabelNorm(' Ａ-b ')).toBe('ab');
  });

  it('複製：標題列、雙向拆兩列、自我關係一列、換行收成空白', () => {
    const chars = [makeChar(1, '甲\n乙', 0, 0), makeChar(2, '丙', 0, 0)];
    const types = [makeType(5, '友情')];
    const rels = [makeRel(1, 1, 2, 5, { both: true, note: 'x\ty' }), makeRel(2, 2, 2, 5)];
    const t = buildRelTable(chars, rels, types);
    expect(t.text.split('\n')).toEqual([
      '來源\t目標\t關係\t備註',
      '甲 乙\t丙\t友情\tx y',
      '丙\t甲 乙\t友情\tx y',
      '丙\t丙\t友情\t',
    ]);
    expect(t.lines).toBe(3);
    expect(t.both).toBe(1);
  });

  it('批次建立的貼上：試算表一欄、多欄取第一欄、頓號與換行', () => {
    expect(parseBatchPaste('甲\n乙\n丙')).toEqual({ cells: ['甲', '乙', '丙'], usedCols: false });
    expect(parseBatchPaste('甲\t1\n"乙\n二"\t2')).toEqual({
      cells: ['甲', '乙\n二'],
      usedCols: true,
    });
    expect(parseBatchPaste('甲、乙、丙').cells).toEqual(['甲', '乙', '丙']);
  });
});

describe('排列（3.3）', () => {
  it('圓形：都在畫布內、不重疊、記住陣型', () => {
    const s = sheetWith(8);
    const ctx = sheetCtx(s);
    expect(applyLayout(ctx, 'circle')).toBe(true);
    expect(s.settings.lastLayout).toBe('circle');
    for (const c of s.chars) {
      const r = charRadius(ctx, c);
      expect(c.x - r).toBeGreaterThanOrEqual(0);
      expect(c.x + r).toBeLessThanOrEqual(1000);
    }
    for (let i = 0; i < s.chars.length; i++)
      for (let j = i + 1; j < s.chars.length; j++) {
        const a = s.chars[i];
        const b = s.chars[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(charRadius(ctx, a) * 2);
      }
  });

  it('釘選的角色不動；重要度高的在圓形的內圈', () => {
    const s = sheetWith(9);
    s.chars[0].locked = true;
    s.chars[0].x = 100;
    s.chars[0].y = 100;
    s.chars[1].level = 3;
    applyLayout(sheetCtx(s), 'circle');
    expect([s.chars[0].x, s.chars[0].y]).toEqual([100, 100]);
    const d = (i: number) => Math.hypot(s.chars[i].x - 500, s.chars[i].y - 500);
    expect(d(1)).toBeLessThan(d(5));
  });

  it('水平排列：同一排 y 相同', () => {
    const s = sheetWith(4);
    applyLayout(sheetCtx(s), 'line');
    expect(new Set(s.chars.map((c) => Math.round(c.y))).size).toBe(1);
  });

  it('隨機散布用給的亂數；解開重疊', () => {
    const s = sheetWith(5);
    applyLayout(sheetCtx(s), 'random', seq([0.1, 0.9, 0.5, 0.3, 0.7, 0.2]));
    const ctx = sheetCtx(s);
    separateAll(ctx);
    expect(new Set(s.chars.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`)).size).toBe(5);
  });

  it('打亂座位：只換位置、不全部留在原地；釘選的不動', () => {
    const s = sheetWith(3);
    s.chars.forEach((c, i) => {
      c.x = 100 + i * 200;
    });
    s.chars[2].locked = true;
    expect(shuffleSeats(s.chars, () => 0.99)).toBe(true);
    expect(s.chars.map((c) => c.x)).toEqual([300, 100, 500]);
    expect(shuffleSeats([s.chars[2]])).toBe(false);
  });

  it('清單換順序：未釘選的角色接手位置', () => {
    const s = sheetWith(3);
    s.chars.forEach((c, i) => {
      c.x = 100 * (i + 1);
    });
    reorderKeepSlots(s.chars, 0, 2);
    expect(s.chars.map((c) => [c.id, c.x])).toEqual([
      [2, 100],
      [3, 200],
      [1, 300],
    ]);
  });

  it('畫布貼合內容：四周 60 px、最小 200 × 200；修改畫布尺寸時角色跟著平移', () => {
    const s = sheetWith(1);
    s.chars[0].x = 400;
    s.chars[0].y = 300;
    s.chars[0].name = '';
    const ctx = sheetCtx(s);
    expect(fitCanvasToContent(ctx)).toBe(true);
    expect([s.W, s.H]).toEqual([212, 212]);
    expect(s.chars[0].x).toBeCloseTo(60 + charRadius(ctx, s.chars[0]));
    resizeCanvas(s, { x: -50, y: 10, w: 400, h: 300 });
    expect([s.W, s.H]).toEqual([400, 300]);
    expect(s.chars[0].x).toBeCloseTo(60 + charRadius(ctx, s.chars[0]) + 50);
  });
});

describe('對齊與分佈（F110）', () => {
  it('選取的角色彼此對齊；均分至少 3 位', () => {
    const s = sheetWith(3);
    s.chars.forEach((c, i) => {
      c.x = 100 + i * 150 + (i === 2 ? 300 : 0);
      c.y = 200 + i * 50;
    });
    const ctx = sheetCtx(s);
    applyAlign(ctx, s.chars, 'top', false);
    expect(new Set(s.chars.map((c) => c.y)).size).toBe(1);
    expect(canDistribute(s.chars)).toBe(true);
    applyAlign(ctx, s.chars, 'distH', false);
    expect(s.chars[1].x).toBeCloseTo((s.chars[0].x + s.chars[2].x) / 2);
    expect(canDistribute(s.chars.slice(0, 2))).toBe(false);
  });

  it('以畫布為對象：整組平移到畫布邊', () => {
    const s = sheetWith(2);
    s.chars[0].x = 300;
    s.chars[1].x = 500;
    const ctx = sheetCtx(s);
    applyAlign(ctx, s.chars, 'left', true);
    expect(s.chars[0].x - charRadius(ctx, s.chars[0])).toBeCloseTo(0);
    expect(s.chars[1].x - s.chars[0].x).toBeCloseTo(200);
  });
});

describe('磁鐵（F109）', () => {
  it('有關係的兩人往理想距離靠近；釘選的不動', () => {
    const s = sheetWith(3);
    s.types.push(makeType(9, 'T'));
    s.chars[0].x = 100;
    s.chars[1].x = 900;
    s.chars[2].locked = true;
    s.chars[2].x = 500;
    s.chars[2].y = 900;
    s.rels.push(makeRel(1, 1, 2, 9));
    const ctx = sheetCtx(s);
    const vel = new Map();
    const d0 = s.chars[1].x - s.chars[0].x;
    for (let i = 0; i < 60; i++) forceStep(ctx, vel, 1, new Set());
    expect(s.chars[1].x - s.chars[0].x).toBeLessThan(d0);
    expect([s.chars[2].x, s.chars[2].y]).toEqual([500, 900]);
  });
});

describe('原作的專案檔（3.9）', () => {
  const legacy = {
    app: 'CharRelDiagram',
    format: 7,
    activeSheetIdx: 1,
    labels: [{ id: 3, text: '學生' }],
    prefs: { light: true },
    library: [
      {
        id: 106,
        variants: [
          {
            id: 107,
            name: '主角',
            color: '#ff0000',
            icon: 'star',
            image: 'images/lib_106_v107.png',
            imageSrc: 'images/lib_106_v107_src.png',
            crop: { zoom: 1.5, ox: 10, oy: -5 },
            labels: [3],
          },
          { id: 108, name: '主角（便服）' },
        ],
      },
      { id: 110, variants: [{ id: 111, name: '配角', size: 80 }] },
    ],
    sheets: [
      { id: 1, name: '', W: 1000, H: 1000, relTypes: [], chars: [], rels: [] },
      {
        id: 2,
        name: '本篇',
        W: 1100,
        H: 900,
        bgImage: 'images/bg_s2.png',
        relTypes: [
          { id: 101, label: '戀愛', color: '#e0607e', lineStyle: 'dashed', capStyle: 'heart' },
        ],
        settings: { legendPos: 'online', spacingMode: 'far', focusDim: 0.3 },
        chars: [
          { id: 1, libId: 106, varId: 107, x: 550, y: 430, level: 2 },
          { id: 2, libId: 110, varId: 111, x: 300, y: 300 },
        ],
        rels: [
          { id: 11, from: 1, to: 2, relTypeId: 101, both: true, labelT: 0.3, curveDir: -1 },
          { id: 12, from: 2, to: 9, relTypeId: 101 },
        ],
        notes: [{ id: 5, text: 'x' }],
      },
    ],
  };

  it('辨認、找 project.json（最淺的那個）', () => {
    expect(isLegacyProject(legacy)).toBe(true);
    expect(isLegacyProject({ format: 'trpg-toolkit-project', tool: 'x', data: {} })).toBe(false);
    const files = new Map<string, Uint8Array>([
      ['a/b/project.json', new Uint8Array()],
      ['a/project.json', new Uint8Array()],
    ]);
    expect(findProjectJson(files)).toEqual({ path: 'a/project.json', base: 'a/' });
  });

  it('轉換：角色外觀取自角色庫、關係類型、設定、略過的內容', () => {
    const r = convertLegacy(legacy);
    expect(r.sheets).toHaveLength(2);
    expect(r.activeIdx).toBe(1);
    expect(r.light).toBe(true);
    const s = r.sheets[1];
    expect(s.settings.palette).toBe('light');
    expect(s.settings).toMatchObject({
      legendPos: 'bottom',
      showRelName: true,
      spacingPct: 145,
      focusDim: 0.3,
    });
    expect(s.chars.map((c) => [c.name, c.color, c.icon, c.level, c.size])).toEqual([
      ['主角', '#ff0000', 'star', 2, null],
      ['配角', 'auto', null, 0, 80],
    ]);
    expect(s.chars[0].labels).toEqual([3]);
    expect(s.types[0]).toMatchObject({ label: '戀愛', lineStyle: 'dashed', capStyle: 'heart' });
    expect(s.rels).toHaveLength(1);
    expect(s.rels[0]).toMatchObject({ both: true, labelT: 0.3, curveDir: -1 });
    expect(r.backgrounds.get(s)).toBe('images/bg_s2.png');
    expect(r.avatars.get(s)?.get(1)).toEqual({
      img: 'images/lib_106_v107.png',
      src: 'images/lib_106_v107_src.png',
      crop: { zoom: 1.5, ox: 10, oy: -5 },
    });
    expect(r.skipped).toEqual(expect.arrayContaining(['便利貼']));
  });

  it('原作的裁切換算成圖片在框裡的位置', () => {
    expect(legacyCropToPlacement(400, 400, { zoom: 1, ox: 0, oy: 0 })).toEqual({
      zoom: 1,
      x: 0,
      y: 0,
      turns: 0,
    });
    const p = legacyCropToPlacement(400, 300, { zoom: 2, ox: 0, oy: 0 });
    expect(p?.zoom).toBeCloseTo(2);
    expect(p?.x).toBeCloseTo(0);
    expect(legacyCropToPlacement(0, 0, null)).toBeNull();
  });
});

describe('範例（3.7）', () => {
  it('四個範例都有角色與關係，id 不重複', () => {
    expect(SAMPLES.map((s) => s.key)).toEqual(['story', 'family', 'types', 'mind']);
    for (const s of SAMPLES) {
      const sh = buildSample(s.key);
      expect(sh.chars.length).toBeGreaterThan(3);
      expect(sh.rels.length).toBeGreaterThan(3);
      expect(new Set(sh.chars.map((c) => c.id)).size).toBe(sh.chars.length);
      expect(sh.rels.every((r) => sh.types.some((t) => t.id === r.type))).toBe(true);
    }
    const story = buildSample('story');
    expect(story.rels.some((r) => r.from === r.to)).toBe(true);
  });
});
