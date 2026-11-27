/**
 * 斷面圖產生器：匯出的尺寸（長邊、VTT 的格子、上限）、檔名、事件前後；專案檔往返、壞掉的資料、原作的作業 JSON。
 */
import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '@/core/storage';
import {
  exportSize,
  floodFor,
  pairEnvs,
  pngName,
  safeTitle,
  tooLarge,
} from '@/tools/cross-section/draw/export';
import { blankDoc } from '@/tools/cross-section/model/factory';
import { layoutOf } from '@/tools/cross-section/model/layout';
import {
  fromOriginal,
  isOriginalFile,
  normalizeDoc,
  OriginalFileError,
} from '@/tools/cross-section/model/normalize';
import { addFloor } from '@/tools/cross-section/model/ops';
import { SAMPLE_IDS, sampleDoc } from '@/tools/cross-section/model/samples';

describe('匯出的尺寸', () => {
  it('整張：長邊照選的 px、短邊照比例；圖框的留白（上 3.8、下 2.1、左右 1.5 格）', () => {
    const d = blankDoc();
    addFloor(d, 'below');
    addFloor(d, 'below');
    /* 世界 42 × 32 格，加圖框 45 × 37.9 */
    expect(layoutOf(d).world).toMatchObject({ w: 42, h: 32 });
    expect(exportSize(d, 'sheet', 2400, 48)).toEqual({
      width: 2400,
      height: 2021,
      cols: 45,
      rows: 38,
    });
    expect(exportSize(d, 'map', 1600, 48)).toEqual({
      width: 1600,
      height: 1219,
      cols: 42,
      rows: 32,
    });
    d.frame = false;
    expect(exportSize(d, 'sheet', 3600, 48)).toMatchObject({ width: 3600 });
  });

  it('VTT：地圖本體的格數 × 每格的 px（整數格，每格對齊）', () => {
    const d = blankDoc();
    for (const px of [48, 50, 64, 70, 96, 100]) {
      const s = exportSize(d, 'vtt', 2400, px);
      expect(s).toEqual({ width: 42 * px, height: 20 * px, cols: 42, rows: 20 });
    }
    d.building.width = 48;
    d.building.rooftop = false;
    expect(exportSize(d, 'vtt', 2400, 64)).toMatchObject({ width: 54 * 64, height: 18 * 64 });
  });

  it('超過 16,777,216 像素的不能選（48 寬、12 層、每格 100 px）', () => {
    const d = blankDoc();
    d.building.width = 48;
    while (d.building.floors.length < 12) addFloor(d, 'below');
    expect(tooLarge(exportSize(d, 'vtt', 2400, 100))).toBe(true);
    expect(tooLarge(exportSize(d, 'vtt', 2400, 48))).toBe(false);
    expect(tooLarge(exportSize(d, 'sheet', 3600, 48))).toBe(false);
  });

  it('淹水、事件前後、檔名', () => {
    const d = blankDoc();
    expect(floodFor(d, false)).toBe(0);
    expect(floodFor(d, true)).toBe(34);
    d.floodLevel = 60;
    expect(floodFor(d, true)).toBe(60);
    expect(pairEnvs('night')).toEqual(['night', 'after']);
    expect(pairEnvs('after')).toEqual(['day', 'after']);
    d.title = '地下/研究所:A';
    expect(pngName(d, { audience: 'player', env: 'blackout' })).toBe(
      '地下_研究所_A_PL用_停電・緊急照明.png',
    );
    expect(pngName(d, { audience: 'gm', env: 'day' }, '事件後')).toBe(
      '地下_研究所_A_GM用_事件後.png',
    );
    expect(safeTitle('   ')).toBe('新的斷面圖');
  });
});

describe('專案檔', () => {
  it('存了再讀回來相同（範例全部）', () => {
    for (const id of SAMPLE_IDS) {
      const d = sampleDoc(id);
      const text = serializeProject('cross-section', 1, d);
      const p = parseProject(text, 'cross-section');
      expect(p.version).toBe(1);
      expect(normalizeDoc(p.data)).toEqual(d);
    }
  });

  it('壞掉的資料：認不出來回傳 null；範圍外的值夾回去、不認得的設備拿掉、重複的 id 換掉、超過 12 層的不讀', () => {
    expect(normalizeDoc(null)).toBeNull();
    expect(normalizeDoc({ building: {} })).toBeNull();
    expect(normalizeDoc({ building: { floors: [{ level: 'x' }] } })).toBeNull();
    const d = blankDoc();
    const raw = JSON.parse(JSON.stringify(d));
    raw.style = 'neon';
    raw.env = 'midnight';
    raw.floodLevel = 500;
    raw.wear = -5;
    raw.building.width = 41;
    raw.building.storey = 9;
    raw.building.floors[0].level = 0;
    raw.building.floors[1].rooms[1].id = raw.building.floors[1].rooms[0].id;
    raw.items.push({ id: 'z', room: raw.building.floors[0].rooms[0].id, kind: 'ufo', rx: 0.5 });
    raw.items.push({
      id: 'y',
      room: raw.building.floors[0].rooms[0].id,
      kind: 'tank',
      rx: 9,
      scale: 'x',
    });
    for (let i = 2; i < 16; i++)
      raw.building.floors.push({ id: `f${i}`, level: i + 1, name: '', rooms: [] });
    raw.train = { cars: [1] };
    const n = normalizeDoc(raw);
    expect(n).not.toBeNull();
    if (!n) return;
    expect(n.style).toBe('color');
    expect(n.env).toBe('day');
    expect(n.floodLevel).toBe(100);
    expect(n.wear).toBe(0);
    expect(n.building.width).toBe(40);
    expect(n.building.storey).toBe(6);
    expect(n.building.floors).toHaveLength(12);
    expect(n.building.floors.some((f) => f.level === 1)).toBe(true);
    const ids = n.building.floors.flatMap((f) => f.rooms.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(n.items.some((it) => it.kind === 'ufo')).toBe(false);
    expect(n.items.find((it) => it.id === 'y')).toMatchObject({ rx: 0.95, scale: 1 });
    expect(n.train).toEqual({ cars: [1] });
  });
});

/** 原作格式的作業 JSON（欄位是原作的格式；內容是測試自己寫的） */
function originalFile() {
  return {
    format: 'kiin-cross-section-studio',
    schema: 1,
    version: '1.0',
    mode: 'vertical',
    title: '測試大樓',
    subtitle: 'TEST',
    style: 'noir',
    environment: 'after',
    skyTheme: 'storm',
    floodEnabled: true,
    floodLevel: 40,
    age: 50,
    seed: 77,
    showGrid: false,
    showLabels: true,
    showElevation: true,
    showFrame: false,
    building: {
      widthCells: 36,
      floorHeightCells: 5,
      hasRoof: true,
      roofStyle: 'pitched',
      floors: [
        {
          id: 'f1',
          code: '1F',
          level: 1,
          label: '一樓',
          rooms: [
            {
              id: 'r1',
              name: '甲',
              preset: 'biolab',
              wallTone: 'tile',
              secret: false,
              labelPrivate: false,
              startOpen: true,
              x0: 0,
              x1: 16,
            },
            {
              id: 'r2',
              name: '乙',
              preset: 'office',
              wallTone: 'wood',
              secret: false,
              labelPrivate: false,
              startOpen: false,
              x0: 19,
              x1: 36,
            },
          ],
        },
        {
          id: 'f2',
          code: 'B1F',
          level: -1,
          label: '地下',
          rooms: [
            {
              id: 'r3',
              name: '丙',
              preset: 'altar',
              wallTone: 'stone',
              secret: true,
              labelPrivate: true,
              startOpen: false,
              x0: 0,
              x1: 36,
            },
          ],
        },
      ],
      shafts: [
        {
          id: 's1',
          type: 'elevator',
          xCell: 16,
          widthCells: 3,
          fromLevel: 1,
          toLevel: -1,
          cabLevel: -1,
          cabState: 'broken',
          secret: false,
        },
        {
          id: 's2',
          type: 'vent-duct',
          xCell: 34,
          widthCells: 1,
          fromLevel: 1,
          toLevel: -1,
          secret: true,
        },
      ],
    },
    train: { cars: [{ id: 'c1', type: 'locomotive', rooms: [] }] },
    items: [
      {
        id: 'i1',
        mode: 'vertical',
        roomId: 'r1',
        asset: 'bio-tank',
        rx: 0.3,
        ry: 1,
        mount: 'floor',
        scale: 1.2,
        flip: true,
        phase: 'common',
        variant: 'default',
        secret: false,
        brokenAfter: false,
        toppled: true,
      },
      {
        id: 'i2',
        mode: 'vertical',
        roomId: 'r2',
        asset: 'window-framed',
        rx: 0.8,
        ry: 0.4,
        mount: 'wall',
        scale: 1,
        flip: false,
        phase: 'before',
        variant: 'default',
        secret: true,
        brokenAfter: true,
        toppled: false,
      },
      {
        id: 'i3',
        mode: 'vertical',
        roomId: 'r1',
        asset: 'lab-bench',
        rx: 0.7,
        ry: 1,
        mount: 'floor',
        scale: 1,
        flip: false,
        phase: 'after',
        variant: 'galley',
      },
      { id: 'i4', mode: 'vertical', roomId: 'r2', asset: 'dining-table', rx: 0.5 },
      { id: 'i5', mode: 'horizontal', roomId: 'c1r', asset: 'loco-console', rx: 0.5 },
    ],
    annotations: [
      {
        id: 'a1',
        mode: 'vertical',
        x: 30,
        y: 8,
        text: '祭壇',
        variant: 'badge',
        size: 0.5,
        phase: 'after',
        secret: true,
        roomId: 'r3',
        rx: 0.8,
        ry: 0.5,
      },
      { id: 'a2', mode: 'horizontal', x: 1, y: 1, text: '車', variant: 'box' },
    ],
  };
}

describe('原作的作業 JSON', () => {
  it('認得出來：有 format 標記，或沒有 format 但有原作格式的樓層', () => {
    const raw = originalFile();
    expect(isOriginalFile(raw)).toBe(true);
    expect(isOriginalFile({ ...raw, format: undefined })).toBe(true);
    expect(isOriginalFile({ ...raw, format: 'something-else' })).toBe(false);
    expect(isOriginalFile({ building: { floors: [{ area: 1 }] } })).toBe(false);
    expect(isOriginalFile(sampleDoc('manor'))).toBe(false);
  });

  it('讀得懂的照讀：構造、區域、通道、設備（出現時機、倒下、破損、樣式）、備註', () => {
    const { doc, skipped } = fromOriginal(originalFile());
    expect(doc).toMatchObject({
      title: '測試大樓',
      subtitle: 'TEST',
      style: 'noir',
      env: 'after',
      sky: 'storm',
      flood: true,
      floodLevel: 40,
      wear: 50,
      seed: 77,
      grid: false,
      frame: false,
    });
    expect(doc.building).toMatchObject({ width: 36, storey: 5, roof: 'gable', rooftop: true });
    const [f1, b1] = doc.building.floors;
    expect(f1).toMatchObject({ level: 1, name: '一樓' });
    expect(f1.rooms.map((r) => [r.name, r.use, r.wall, r.x0, r.x1, !!r.open])).toEqual([
      ['甲', 'lab', 'tile', 0, 16, true],
      ['乙', 'office', 'wood', 19, 36, false],
    ]);
    /* B1F 的一整間被電梯分成兩段：丙在右邊那段、左邊那段補一間空房（原作同樣的整理規則） */
    const altar = b1.rooms.find((r) => r.name === '丙');
    expect(altar).toMatchObject({ use: 'ritual', secret: true, hideName: true, x0: 19, x1: 36 });
    expect(b1.rooms.find((r) => r !== altar)).toMatchObject({ use: 'empty', x0: 0, x1: 16 });
    expect(
      doc.building.shafts.map((s) => [s.kind, s.x, s.top, s.bottom, s.cabState, s.secret]),
    ).toEqual([
      ['elevator', 16, 1, -1, 'fallsAfter', false],
      ['duct', 34, 1, -1, 'normal', true],
    ]);
    expect(doc.items.map((it) => it.kind)).toEqual(['tank', 'window', 'bench']);
    expect(doc.items[0]).toMatchObject({ rx: 0.3, scale: 1.2, flip: true, upset: true });
    expect(doc.items[0].only).toBeUndefined();
    expect(doc.items[1]).toMatchObject({ only: 'before', secret: true, smashed: true, ry: 0.4 });
    expect(doc.items[2]).toMatchObject({ only: 'after', variant: 'kitchen' });
    expect(doc.notes).toHaveLength(1);
    expect(doc.notes[0]).toMatchObject({
      text: '祭壇',
      style: 'badge',
      only: 'after',
      secret: true,
      rx: 0.8,
    });
    expect(doc.notes[0].room).toBe(altar?.id);
    expect(skipped).toEqual({ items: 2, notes: 1, floors: 0, width: null });
    expect(doc.train).toBeUndefined();
  });

  it('建築寬換成最接近的可選寬度；重複的樓層、超過 12 層的不讀', () => {
    const raw = originalFile();
    raw.building.widthCells = 60;
    raw.building.floors.push({ ...raw.building.floors[0], id: 'dup' });
    const { doc, skipped } = fromOriginal(raw);
    expect(doc.building.width).toBe(48);
    expect(skipped.width).toBe(60);
    expect(skipped.floors).toBe(1);
    expect(doc.building.floors[0].rooms.every((r) => r.x1 <= 48)).toBe(true);
  });

  it('橫向車廂的作業檔、沒有樓層的檔案：讀不了（說明原因）', () => {
    expect(() => fromOriginal({ ...originalFile(), mode: 'horizontal' })).toThrow(
      OriginalFileError,
    );
    expect(() => fromOriginal({ ...originalFile(), mode: 'horizontal' })).toThrow('train');
    const empty = originalFile();
    empty.building.floors = [];
    expect(() => fromOriginal(empty)).toThrow('empty');
  });
});
