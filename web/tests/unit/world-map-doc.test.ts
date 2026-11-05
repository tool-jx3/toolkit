/**
 * 世界地圖產生器：專案檔的往返與整理、原作作業檔的讀入、公開用不含 GM 專用（規格 F51、F68、F71、F72、3.14、3.15）。
 */
import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '@/core/storage';
import { blankDoc, newNote, newObject, newPath, newRegion } from '@/tools/world-map/model/factory';
import { fromOriginal, normalizeDoc, OriginalFileError } from '@/tools/world-map/model/normalize';
import { sampleDoc } from '@/tools/world-map/model/samples';
import { forAudience, secretCount } from '@/tools/world-map/model/visibility';

describe('專案檔（F71、3.14）', () => {
  it('存成專案檔再讀回來，內容完全相同', () => {
    const d = sampleDoc('continent');
    d.objects[0].secret = true;
    d.notes[0].curve = 40;
    d.settings.gridType = 'hex';
    const text = serializeProject('world-map', 1, d);
    const back = normalizeDoc(parseProject(text, 'world-map').data);
    expect(back).toEqual(d);
  });

  it('數值夾在範圍裡、壞掉的項目略過、數量照上限截斷、id 重複時換新', () => {
    const d = blankDoc();
    const raw = JSON.parse(JSON.stringify(d));
    raw.objects = [
      { ...newObject('castle', 5000, -3), size: 999, rotation: 720, id: 'same' },
      { ...newObject('nope', 10, 10) },
      { ...newObject('town', 10, 10), id: 'same' },
    ];
    raw.regions = [
      {
        ...newRegion('a', 'red', [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
      },
    ];
    raw.paths = [
      { ...newPath('road', [{ x: 0, y: 0 }]) },
      {
        ...newPath('wall', [
          { x: 0, y: 0 },
          { x: 9, y: 9 },
        ]),
        smooth: true,
      },
    ];
    raw.notes = Array.from({ length: 400 }, () => newNote('x', 1, 1));
    raw.settings.kmPer100 = -5;
    raw.theme = 'neon';
    const n = normalizeDoc(raw)!;
    expect(n.objects.map((o) => o.kind)).toEqual(['castle', 'town']);
    expect(n.objects[0]).toMatchObject({ x: 1536, y: 0, size: 130, rotation: 180 });
    expect(n.objects[0].id).not.toBe(n.objects[1].id);
    expect(n.regions).toEqual([]);
    expect(n.paths.length).toBe(1);
    expect(n.paths[0].smooth).toBe(false);
    expect(n.notes.length).toBe(300);
    expect(n.settings.kmPer100).toBe(0.01);
    expect(n.theme).toBe('parchment');
  });

  it('四種尺寸都收；其他格數不收；版本 1 的路線補上旅程的預設', () => {
    for (const [cols, rows] of [
      [128, 80],
      [128, 72],
      [96, 96],
      [80, 128],
    ]) {
      const d = blankDoc(cols, rows);
      d.paths = [
        newPath('road', [
          { x: 0, y: 0 },
          { x: 9, y: 9 },
        ]),
      ];
      expect(normalizeDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
    }
    expect(normalizeDoc(blankDoc(100, 100))).toBeNull();
    const v1 = JSON.parse(JSON.stringify(blankDoc()));
    v1.paths = [
      {
        id: 'p',
        kind: 'sea',
        name: '',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        width: 3,
        smooth: true,
        secret: false,
      },
    ];
    expect(normalizeDoc(v1)!.paths[0]).toMatchObject({
      difficulty: 'normal',
      access: 'auto',
      simpleCalc: false,
    });
    expect(normalizeDoc(v1)!.paths[0].travelMode).toBeUndefined();
    v1.paths[0].travelMode = 'horse';
    v1.paths[0].dailyKm = 5000;
    expect(normalizeDoc(v1)!.paths[0]).toMatchObject({ travelMode: 'horse', dailyKm: 1000 });
  });

  it('地形的長度不對時整份不收；地表壞掉時從地形推算', () => {
    const d = blankDoc();
    expect(normalizeDoc({ ...d, terrain: '012' })).toBeNull();
    const t = `3${'0'.repeat(d.terrain.length - 1)}`;
    const n = normalizeDoc({ ...d, terrain: t, ground: 'x' })!;
    expect(n.ground[0]).toBe('1');
  });
});

describe('原作的作業檔（F72、3.15）', () => {
  const N = 128 * 80;
  const raw = () => ({
    format: 'kiin-world-atelier',
    version: 1,
    title: '測試的世界',
    seed: 99,
    theme: 'night',
    terrain: Array.from({ length: N }, (_, i) => (i === 0 ? 3 : i === 1 ? 5 : 0)),
    regions: [
      {
        name: '國',
        color: '#AABBCC',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 0, y: 100 },
        ],
        font: 'sans',
        labelSize: 40,
      },
    ],
    objects: [{ key: 'port', x: 10, y: 20, portSide: 'left', name: '港', secret: true }],
    paths: [
      {
        kind: 'river',
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
        ],
        width: 7,
      },
      {
        kind: 'road',
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
        ],
        travelMode: 'horse',
        dailyKm: 80,
      },
    ],
    notes: [{ text: '海', x: 30, y: 30, size: 20 }],
    settings: {
      frame: false,
      terrainDetails: false,
      fontStyle: 'rounded',
      gridType: 'hex',
      kmPer100: 25,
    },
    export: { width: 3200, audience: 'gm' },
  });

  it('欄位對應、沒有地表時推算、沒記畫法時當自由筆刷', () => {
    const r = fromOriginal(raw());
    expect(r.doc.title).toBe('測試的世界');
    expect(r.doc.theme).toBe('night');
    expect(r.doc.drawMode).toBe('free');
    expect(r.doc.terrain.slice(0, 3)).toBe('350');
    expect(r.doc.ground.slice(0, 3)).toBe('550');
    expect(r.doc.regions[0]).toMatchObject({
      name: '國',
      color: '#aabbcc',
      font: 'sans',
      labelSize: 40,
    });
    expect(r.doc.objects[0]).toMatchObject({
      kind: 'port',
      dock: 'left',
      name: '港',
      secret: true,
    });
    expect(r.doc.paths.map((p) => [p.kind, p.width])).toEqual([
      ['river', 7],
      ['road', 3],
    ]);
    expect(r.doc.settings).toMatchObject({
      frame: false,
      details: false,
      font: 'rounded',
      gridType: 'hex',
      kmPer100: 25,
    });
    expect(r.exportWidth).toBe(3200);
    expect(r.exportAudience).toBe('gm');
    expect(r.doc.paths[1]).toMatchObject({
      travelMode: 'horse',
      dailyKm: 80,
      difficulty: 'normal',
      access: 'auto',
      simpleCalc: false,
    });
    expect(r.doc.paths[0].travelMode).toBeUndefined();
    expect(r.doc.paths[0].dailyKm).toBeUndefined();
    expect(normalizeDoc(r.doc)).toEqual(r.doc);
  });

  it('版本、地形、地表不對時丟出說明', () => {
    expect(() => fromOriginal({ ...raw(), version: 2 })).toThrow(OriginalFileError);
    expect(() => fromOriginal({ ...raw(), terrain: [1, 2] })).toThrow('地形');
    expect(() => fromOriginal({ ...raw(), ground: Array(N).fill(3) })).toThrow('地表');
    expect(() => fromOriginal({ format: 'other' })).toThrow(OriginalFileError);
  });
});

describe('公開用不含 GM 專用（F51、F68）', () => {
  it('拿掉 GM 專用的素材、路線、地名；國與地形不變', () => {
    const d = sampleDoc('continent');
    d.objects[1].secret = true;
    d.paths[0].secret = true;
    d.notes[0].secret = true;
    const p = forAudience(d, 'player');
    expect(secretCount(d)).toBe(3);
    expect(p.objects.length).toBe(d.objects.length - 1);
    expect(p.paths.length).toBe(d.paths.length - 1);
    expect(p.notes.length).toBe(d.notes.length - 1);
    expect(p.regions).toBe(d.regions);
    expect(p.terrain).toBe(d.terrain);
    expect(forAudience(d, 'gm')).toBe(d);
  });
});
