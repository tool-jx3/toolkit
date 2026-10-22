/**
 * 室內平面圖產生器：分享連結（規格 F215～F217、3.7、D27～D30）與房間編號圓標（F218、F219、3.8、D31、D32）。
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/core/color';
import { encodeShareHash } from '@/core/share';
import { getTheme } from '@/tools/floor-plan/draw/themes';
import { isAsset } from '@/tools/floor-plan/model/assets';
import { THEME_IDS } from '@/tools/floor-plan/model/catalog';
import {
  clueCount,
  emptyFloor,
  floorBounds,
  visibleFloor,
} from '@/tools/floor-plan/model/geometry';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import { isRoomNumber, numberRooms } from '@/tools/floor-plan/model/numbering';
import {
  encodeMapHash,
  packProject,
  playerProject,
  readMapHash,
  SHARE_MAX_LENGTH,
  unpackProject,
} from '@/tools/floor-plan/model/share';
import type { Floor, Project, Rect, Room, TextLabel } from '@/tools/floor-plan/model/types';
import { instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';

const project = (id: string, clues = false): Project => ({
  name: TEMPLATES.find((t) => t.id === id)?.name ?? id,
  theme: 'clean',
  showSize: 'ping',
  showNames: true,
  floors: instantiateTemplate(id, { structureOnly: false, clues }) as Floor[],
  active: 0,
});

/** id 不比（連結裡不放 id） */
const noIds = (p: Project) =>
  JSON.parse(JSON.stringify(p, (k, v) => (k === 'id' ? undefined : v))) as Project;

const roundTrip = (hash: string): Project | null => {
  const r = readMapHash(hash);
  return r.kind === 'ok' ? normalizeProject(r.raw, isAsset) : null;
};

describe('分享連結的格式（3.7）', () => {
  it('完整連結：往返之後地圖相同（id 換新）', () => {
    for (const t of TEMPLATES) {
      const p = normalizeProject(project(t.id, true), isAsset) as Project;
      p.active = p.floors.length - 1;
      const { hash, tooLong } = encodeMapHash(p, 'full');
      expect(tooLong, t.id).toBe(false);
      expect(hash.startsWith('#m='), t.id).toBe(true);
      const back = roundTrip(hash);
      expect(back && noIds(back), t.id).toEqual(noIds(p));
      const r = readMapHash(hash);
      expect(r.kind === 'ok' && r.pl, t.id).toBe(false);
    }
  });

  it('範本載入後就是整理過的資料：整理（normalize）不再改動，所以分享連結往返後和載入的一模一樣（2026-10-22，7.18）', () => {
    /* e2e 用載入後的 store 比對（沒有先整理）：範本裡寫 `hideLabel = false` 之類整理會拿掉的值，往返後就對不上 */
    for (const t of TEMPLATES)
      for (const clues of [false, true]) {
        const p = project(t.id, clues);
        expect(noIds(normalizeProject(p, isAsset) as Project), t.id).toEqual(noIds(p));
      }
  });

  it('變短：不放 id；門窗的 side＝1、hinge＝0，家具的 rot＝0 與預設大小不寫', () => {
    const p = project('studio');
    const packed = JSON.stringify(packProject(p));
    expect(packed).not.toContain('"id"');
    expect(packed).not.toContain('"side":1');
    expect(packed).not.toContain('"hinge":0');
    expect(packed).not.toContain('"rot":0');
    const f = (packProject(p) as { floors: { items: Record<string, unknown>[] }[] }).floors[0];
    /* 預設大小的家具不寫 w、h；改過大小的才寫 */
    const sized = f.items.filter((i) => 'w' in i);
    expect(f.items.length - sized.length).toBeGreaterThan(sized.length);
    /* 讀回時補回來 */
    const raw = unpackProject(packProject(p)) as {
      floors: { items: { w: number; h: number }[] }[];
    };
    expect(raw.floors[0].items.map((i) => [i.w, i.h])).toEqual(
      p.floors[0].items.map((i) => [i.w, i.h]),
    );
  });

  it('改過大小、轉過方向的家具：寫 w、h、rot', () => {
    const p = normalizeProject(
      {
        floors: [
          {
            rooms: [],
            items: [
              { id: 'a', t: 'bed_single', x: 1, y: 1, w: 2, h: 4, rot: 0 },
              { id: 'b', t: 'bed_single', x: 5, y: 1, w: 4, h: 2, rot: 90 },
              { id: 'c', t: 'bed_single', x: 9, y: 1, w: 3, h: 5, rot: 0 },
            ],
          },
        ],
      },
      isAsset,
    ) as Project;
    const items = (packProject(p) as { floors: { items: Record<string, unknown>[] }[] }).floors[0]
      .items;
    expect(items.map((i) => [i.w ?? '-', i.h ?? '-', i.rot ?? 0])).toEqual([
      ['-', '-', 0],
      ['-', '-', 90],
      [3, 5, 0],
    ]);
    expect(noIds(roundTrip(encodeMapHash(p, 'full').hash) as Project)).toEqual(noIds(p));
  });

  it('太長（# 後面超過 8,000 字）時不產生連結', () => {
    const p = normalizeProject(
      {
        name: '很大的地圖',
        floors: [
          {
            texts: Array.from({ length: 800 }, (_, i) => ({
              x: i,
              y: i % 7,
              text: `${(i * 2654435761) % 1000003}-${(i * 40503) % 9973}`,
            })),
          },
        ],
      },
      isAsset,
    ) as Project;
    const r = encodeMapHash(p, 'full');
    expect(r.length).toBeGreaterThan(SHARE_MAX_LENGTH);
    expect(r.tooLong).toBe(true);
  });

  it('壞掉的連結：沒有 m＝none；讀不出來、版本不對、太長＝broken', () => {
    expect(readMapHash('').kind).toBe('none');
    expect(readMapHash('#s=abc').kind).toBe('none');
    expect(readMapHash('#m=abc').kind).toBe('broken');
    const ok = encodeMapHash(project('studio'), 'full').hash;
    expect(readMapHash(ok.slice(0, ok.length - 40)).kind).toBe('broken');
    expect(readMapHash(encodeShareHash({ floors: [] }, { version: 2, key: 'm' })).kind).toBe(
      'broken',
    );
    expect(readMapHash(`#m=${'A'.repeat(SHARE_MAX_LENGTH)}`).kind).toBe('broken');
    /* 內容不是地圖（沒有 floors）：讀得出來，但整理時是 null */
    const notMap = readMapHash(encodeShareHash({ hello: 1 }, { version: 1, key: 'm' }));
    expect(notMap.kind).toBe('ok');
    expect(notMap.kind === 'ok' && normalizeProject(notMap.raw, isAsset)).toBeNull();
  });
});

describe('PL 用連結（F216）', () => {
  it('洋館（含隱藏線索）：GM 專用的房間只留牆框，GM 的東西、暗門、線索、GM 筆記都不在連結裡', () => {
    const p = normalizeProject(project('mansion', true), isAsset) as Project;
    const gmRooms = p.floors.flatMap((f) => f.rooms.filter((r) => r.gm));
    const notes = p.floors.flatMap((f) => f.rooms.map((r) => r.note).filter(Boolean));
    const clueTexts = p.floors.flatMap((f) => f.texts.filter((t) => t.clue).map((t) => t.text));
    const clueLabels = p.floors.flatMap((f) =>
      f.items.filter((i) => i.clue && i.label).map((i) => i.label as string),
    );
    const secrets = p.floors.flatMap((f) => f.openings.filter((o) => o.kind === 'secret'));
    expect(gmRooms.length).toBeGreaterThan(0);
    expect(secrets.length).toBeGreaterThan(0);
    expect(clueTexts.length + clueLabels.length).toBeGreaterThan(0);

    const { hash } = encodeMapHash(p, 'pl');
    const r = readMapHash(hash);
    expect(r.kind === 'ok' && r.pl).toBe(true);
    const text = JSON.stringify(r.kind === 'ok' ? r.raw : null);
    /* PL 看得到的字（同名的房間、標籤、文字）不算 */
    const visible = new Set(
      p.floors.flatMap((f) => {
        const v = visibleFloor(f, true, true);
        return [
          ...v.rooms.flatMap((x) => [x.name, x.plName ?? '']),
          ...v.items.map((x) => x.label ?? ''),
          ...v.texts.map((x) => x.text),
        ];
      }),
    );
    for (const g of gmRooms)
      if (g.name && !visible.has(g.name)) expect(text, g.name).not.toContain(`"${g.name}"`);
    for (const n of notes) expect(text).not.toContain(JSON.stringify(n).slice(1, -1));
    for (const c of [...clueTexts, ...clueLabels])
      if (!visible.has(c)) expect(text, c).not.toContain(`"${c}"`);
    expect(text).not.toContain('"secret"');
    expect(text).not.toContain('"clue"');
    expect(text).not.toContain('"note"');
    expect(text).not.toContain('"plName"');

    const back = roundTrip(hash) as Project;
    p.floors.forEach((f, i) => {
      const pl = visibleFloor(f, true, true);
      const b = back.floors[i];
      /* 位置與數量＝PL 檢視（藏起線索） */
      expect(b.rooms.map((x) => [x.x, x.y, x.w, x.h, !!x.gm])).toEqual(
        pl.rooms.map((x) => [x.x, x.y, x.w, x.h, !!x.masked]),
      );
      expect(b.rooms.filter((x) => x.gm).every((x) => x.name === '' && !x.color && !x.note)).toBe(
        true,
      );
      expect(b.openings.length).toBe(pl.openings.length);
      expect(b.items.length).toBe(pl.items.length);
      expect(b.texts.length).toBe(pl.texts.length);
      expect(b.walls.length).toBe(pl.walls.length);
      expect([...b.items, ...b.texts, ...b.walls, ...b.openings].some((x) => x.gm)).toBe(false);
    });
  });

  it('PL 名字換成名字；拿掉了什麼的計數', () => {
    const room = (id: string, x: number, extra: Partial<Room> = {}): Room => ({
      id,
      x,
      y: 0,
      w: 4,
      h: 4,
      name: id,
      cat: 'living',
      ...extra,
    });
    const f: Floor = {
      ...emptyFloor('1F'),
      rooms: [
        room('客廳', 0, { plName: '？？？', note: '真正的入口' }),
        room('密室', 4, { gm: true, note: '祭壇', color: '#ff0000' }),
        room('衣櫃', 5, { w: 2, h: 2 }),
      ],
      openings: [
        { id: 'o1', kind: 'secret', o: 'v', x: 4, y: 1, len: 1.5, side: 1, hinge: 0 },
        { id: 'o2', kind: 'door', o: 'h', x: 1, y: 4, len: 1.5, side: 1, hinge: 0, gm: true },
      ],
      items: [
        { id: 'i1', t: 'key', x: 1, y: 1, w: 0.5, h: 0.5, rot: 0, clue: true },
        { id: 'i2', t: 'key', x: 5, y: 1, w: 0.5, h: 0.5, rot: 0 },
      ],
      texts: [{ id: 't1', x: 2, y: 2, text: '血跡', clue: true }],
    };
    const p: Project = {
      name: 'x',
      theme: 'clean',
      showSize: 'none',
      showNames: true,
      floors: [f],
      active: 0,
    };
    const { project: pl, removed } = playerProject(p);
    expect(pl.floors[0].rooms).toEqual([
      { id: '客廳', x: 0, y: 0, w: 4, h: 4, name: '？？？', cat: 'living' },
      { id: '密室', x: 4, y: 0, w: 4, h: 4, name: '', cat: 'living', gm: true },
    ]);
    /* 隱藏線索的個數和線索開關的通知同一個算法：一件小物＋說明算一個（7.7） */
    expect(removed).toEqual({ gmRooms: 1, gmThings: 3, secretDoors: 1, clues: 1, notes: 2 });
    expect(removed.clues).toBe(clueCount(p.floors));
    /* 原本的地圖不變 */
    expect(p.floors[0].rooms[0].plName).toBe('？？？');
  });
});

describe('房間編號（F219）', () => {
  const room = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Partial<Room> = {},
  ) => ({ id, x, y, w, h, name: id, cat: 'living', ...extra }) as Room;
  const base = (): Floor => ({
    ...emptyFloor('1F'),
    rooms: [
      room('C', 0, 4, 10, 6),
      room('B', 6, 0, 4, 4),
      room('A', 0, 0, 6, 4),
      room('G', 10, 0, 6, 6, { gm: true }),
      room('N', 11, 1, 2, 2),
      room('D', 0, 10, 1, 1),
      room('H', 4, 10, 4, 4, { hideLabel: true }),
    ],
    texts: [
      { id: 'old1', x: 3, y: 3, text: '7', badge: true },
      { id: 'old2', x: 3, y: 3, text: ' 12 ', badge: true, gm: true },
      { id: 'keep1', x: 3, y: 3, text: 'A', badge: true },
      { id: 'keep2', x: 3, y: 3, text: '3' },
    ],
  });

  it('上緣由上到下、同一高度由左到右；PL 看得到的先編，GM 專用（與裡面的房間）接在後面', () => {
    const r = numberRooms(base());
    expect(r).not.toBeNull();
    if (!r) return;
    expect([r.count, r.gm]).toEqual([6, 2]);
    const badges = r.texts.filter((t) => isRoomNumber(t));
    expect(badges.map((t) => [t.text, t.x, t.y, !!t.gm, t.size, t.badge])).toEqual([
      /* 左上角往內 0.25 格：圓的直徑 0.9 → 中心 0.7 */
      ['1', 0.7, 0.7, false, 0.6, true],
      ['2', 6.7, 0.7, false, 0.6, true],
      ['3', 0.7, 4.7, false, 0.6, true],
      /* 1×1 的房間放在中央 */
      ['4', 0.5, 10.5, false, 0.6, true],
      ['5', 10.7, 0.7, true, 0.6, true],
      ['6', 11.7, 1.7, true, 0.6, true],
    ]);
    /* 原本的純數字圓標拿掉；其他文字、非數字的圓標留著 */
    expect(r.texts.filter((t) => !isRoomNumber(t)).map((t) => t.id)).toEqual(['keep1', 'keep2']);
  });

  it('兩位數的圓標比較寬，左邊仍在房間裡', () => {
    const rooms = Array.from({ length: 12 }, (_, i) => room(`r${i}`, i * 4, 0, 4, 4));
    const r = numberRooms({ ...emptyFloor('1F'), rooms });
    const t12 = r?.texts.find((t) => t.text === '12') as TextLabel;
    expect(t12.x).toBeGreaterThan(44.7);
    expect(t12.y).toBe(0.7);
  });

  it('沒有可以編號的房間時 null', () => {
    expect(numberRooms(emptyFloor('1F'))).toBeNull();
    expect(
      numberRooms({ ...emptyFloor('1F'), rooms: [room('h', 0, 0, 4, 4, { hideLabel: true })] }),
    ).toBeNull();
  });

  it('純數字的圓標才算編號（前後空白不算）', () => {
    expect(isRoomNumber({ text: '12', badge: true })).toBe(true);
    expect(isRoomNumber({ text: ' 3 ', badge: true })).toBe(true);
    expect(isRoomNumber({ text: '12' })).toBe(false);
    expect(isRoomNumber({ text: 'B1', badge: true })).toBe(false);
    /* 全形數字也算（7.7） */
    expect(isRoomNumber({ text: '１２', badge: true })).toBe(true);
    expect(isRoomNumber({ text: '1２', badge: true })).toBe(true);
    const r = numberRooms({
      ...emptyFloor('1F'),
      rooms: [room('A', 0, 0, 4, 4)],
      texts: [{ id: 'z', x: 1, y: 1, text: '１', badge: true }],
    });
    expect(r?.texts.map((t) => t.text)).toEqual(['1']);
  });
});

describe('圓標的顏色（3.8）', () => {
  it('五種樣式：字和圓的對比 ≥ 4.5；圓或外圍的邊和背景的對比 ≥ 3', () => {
    for (const id of THEME_IDS) {
      const t = getTheme(id);
      expect(contrastRatio(t.badge.text, t.badge.fill), id).toBeGreaterThanOrEqual(4.5);
      const edge = Math.max(contrastRatio(t.badge.fill, t.bg), contrastRatio(t.badge.ring, t.bg));
      expect(edge, id).toBeGreaterThanOrEqual(3);
      /* 邊和圓也分得開 */
      expect(contrastRatio(t.badge.ring, t.badge.fill), id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('匯出範圍含圓標的外框（3.8、7.7）', () => {
  const withTexts = (texts: TextLabel[]): Floor => ({
    ...emptyFloor('1F'),
    rooms: [{ id: 'r', x: 0, y: 0, w: 6, h: 6, name: 'r', cat: 'living' }],
    texts,
  });

  it('大的圓標：上緣（含外圍的邊）在範圍裡', () => {
    const b = floorBounds(
      withTexts([{ id: 'a', x: 3, y: -1.45, text: 'A', size: 4, badge: true }]),
    ) as Rect;
    /* 直徑 6、邊 0.16 × 4 的一半 0.32 */
    expect(b.y).toBeLessThanOrEqual(-1.45 - 3 - 0.32 + 1e-9);
  });

  it('長條的圓標：右端在範圍裡（中日文一個字算 1 個字級寬）', () => {
    const b = floorBounds(
      withTexts([{ id: 'a', x: 8, y: 3, text: '入口在這裡往右走', size: 1, badge: true }]),
    ) as Rect;
    expect(b.x + b.w).toBeGreaterThanOrEqual(8 + (8 + 0.7) / 2 + 0.08 - 1e-9);
  });

  it('一般文字照舊用大略的 4 × 1 格', () => {
    const b = floorBounds(withTexts([{ id: 'a', x: 3, y: -1.45, text: 'A', size: 4 }])) as Rect;
    expect(b.y).toBeCloseTo(-1.95);
  });
});

describe('圓標的資料（F218、3.5）', () => {
  it('badge 只在 true 時留著；舊的資料沒有 badge＝一般文字', () => {
    const p = normalizeProject(
      {
        floors: [
          {
            texts: [
              { id: 'a', x: 1, y: 1, text: '1', badge: true },
              { id: 'b', x: 1, y: 1, text: '2', badge: 'yes' },
              { id: 'c', x: 1, y: 1, text: '3' },
            ],
          },
        ],
      },
      isAsset,
    ) as Project;
    expect(p.floors[0].texts.map((t) => t.badge ?? false)).toEqual([true, false, false]);
  });

  it('分享連結帶著圓標', () => {
    const p = normalizeProject(
      { floors: [{ texts: [{ id: 'a', x: 1, y: 1, text: '1', badge: true, size: 0.6 }] }] },
      isAsset,
    ) as Project;
    expect(roundTrip(encodeMapHash(p, 'full').hash)?.floors[0].texts[0]).toMatchObject({
      text: '1',
      badge: true,
      size: 0.6,
    });
  });
});
