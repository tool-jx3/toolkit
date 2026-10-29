/**
 * 室內平面圖產生器：2026-10-29 跟進原作 v1.15（`ff87286`，2026-10-27；規格 F243～F250、3.13、D61～D65）。
 * - 雙開拉門（`slidingc`）：資料、畫法（左右兩側、翻過來都不超出範圍、PL 檢視、切開牆）、專案檔與分享連結；
 * - 家具 8 種：尺寸（和原作逐一相同）、分類、標籤、靠牆轉向、畫法（尺寸隨 `size` 改變時重複的部分跟著變）；
 * - 健身房範本；
 * - 讀原作 v1.15 實際存的地圖檔（`tests/fixtures/floor-plan-upstream-v115.trpgmap.json`：用跑起來的原作 v1.15，
 *   在空白地圖上自己畫的兩個房間、放新的家具與雙開拉門，按「保存」存出來的檔，沒有照抄原作的範本）。
 */
import { describe, expect, it } from 'vitest';
import { FURNITURE_DRAW } from '@/tools/floor-plan/draw/furniture';
import { drawOpening, furnStyle } from '@/tools/floor-plan/draw/render';
import { THEMES } from '@/tools/floor-plan/draw/themes';
import { ASSET, assetMatches, isAsset } from '@/tools/floor-plan/model/assets';
import {
  DOUBLE_DOORS,
  isOpeningKind,
  OPEN,
  OPENINGS,
  SWING_DOORS,
} from '@/tools/floor-plan/model/catalog';
import {
  type CompatReport,
  compatCounts,
  UPSTREAM_ITEMS_V115,
  UPSTREAM_OPENINGS,
} from '@/tools/floor-plan/model/compat';
import {
  emptyFloor,
  floorBounds,
  openingReach,
  openingRect,
  visibleFloor,
} from '@/tools/floor-plan/model/geometry';
import { type NormalizeReport, normalizeProject } from '@/tools/floor-plan/model/normalize';
import { encodeMapHash, readMapHash } from '@/tools/floor-plan/model/share';
import type { Floor, Opening, OpeningKind, Project } from '@/tools/floor-plan/model/types';
import { computeWalls } from '@/tools/floor-plan/model/walls';
import { S } from '@/tools/floor-plan/strings';
import { getTemplate, instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { TEMPLATE_TAGS } from '@/tools/floor-plan/templates/tags';
import fixtureText from '../fixtures/floor-plan-upstream-v115.trpgmap.json?raw';
import { openingsOffWall } from '../helpers/floorPlanLayout';

const THEME_IDS = ['clean', 'mono', 'blueprint', 'paper', 'horror'] as const;

/* ---------- 記錄呼叫的假 canvas：路徑與矩形的點換算成世界座標 ---------- */

type M = [number, number, number, number, number, number];
interface Rec {
  ops: string[];
  pts: [number, number][];
}

function recorder(): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { ops: [], pts: [] };
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`NaN point ${x},${y}`);
    rec.pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  };
  const arc = (cx: number, cy: number, rx: number, ry: number, rot: number) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      add(
        cx + ex * Math.cos(rot) - ey * Math.sin(rot),
        cy + ex * Math.sin(rot) + ey * Math.cos(rot),
      );
    }
  };
  const impl: Record<string, (...a: number[]) => unknown> = {
    save: () => stack.push([...m]),
    restore: () => {
      m = stack.pop() ?? m;
    },
    translate: (x, y) => {
      m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y];
    },
    rotate: (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = [
        m[0] * c + m[2] * s,
        m[1] * c + m[3] * s,
        -m[0] * s + m[2] * c,
        -m[1] * s + m[3] * c,
        m[4],
        m[5],
      ];
    },
    scale: (x, y) => {
      m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]];
    },
    moveTo: (x, y) => add(x, y),
    lineTo: (x, y) => add(x, y),
    quadraticCurveTo: (a, b, x, y) => {
      add(a, b);
      add(x, y);
    },
    bezierCurveTo: (_a, _b, _c, _d, x, y) => add(x, y),
    arcTo: (a, b, x, y) => {
      add(a, b);
      add(x, y);
    },
    rect: (x, y, w, h) => {
      add(x, y);
      add(x + w, y + h);
    },
    fillRect: (x, y, w, h) => {
      add(x, y);
      add(x + w, y + h);
    },
    strokeRect: (x, y, w, h) => {
      add(x, y);
      add(x + w, y + h);
    },
    arc: (x, y, r) => arc(x, y, r, r, 0),
    ellipse: (x, y, rx, ry, rot) => arc(x, y, rx, ry, rot),
    measureText: () => ({ width: 1 }),
  };
  const ctx = new Proxy(
    {},
    {
      get(_t, k: string) {
        if (k in impl)
          return (...a: number[]) => {
            rec.ops.push(k);
            return impl[k](...a);
          };
        return (..._a: unknown[]) => {
          rec.ops.push(k);
        };
      },
      set(_t, k, v) {
        if (k === 'fillStyle' || k === 'strokeStyle') rec.ops.push(`${String(k)}=${String(v)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, rec };
}

const box = (pts: [number, number][]) => ({
  x0: Math.min(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])),
  x1: Math.max(...pts.map((p) => p[0])),
  y1: Math.max(...pts.map((p) => p[1])),
});

const theme = THEMES.clean;
const LW = 0.05;

const drawDoor = (op: Opening, opts = { playerView: false, editor: false }, t = 0.34) => {
  const { ctx, rec } = recorder();
  drawOpening(ctx, op, t, theme, LW, opts);
  return rec;
};
const door = (kind: OpeningKind, extra: Partial<Opening> = {}): Opening => ({
  id: 'x',
  kind,
  o: 'h',
  x: 3,
  y: 5,
  len: OPEN[kind].len,
  side: 1,
  hinge: 0,
  ...extra,
});

/* ---------- 雙開拉門 ---------- */

describe('雙開拉門（F243、3.13.1）', () => {
  it('資料：門的一種、預設寬 3 格、不是會開的門也不是兩片門板的門；開門的範圍 0.5 格；有名稱；排在雙片拉門後面', () => {
    expect(OPEN.slidingc).toEqual({ id: 'slidingc', group: 'door', len: 3 });
    expect(isOpeningKind('slidingc')).toBe(true);
    expect(SWING_DOORS.has('slidingc')).toBe(false);
    expect(DOUBLE_DOORS.has('slidingc')).toBe(false);
    expect(openingReach({ kind: 'slidingc', len: 3 })).toBe(0.5);
    expect(S.openings.slidingc).toBe('雙開拉門');
    expect(OPENINGS).toHaveLength(25);
    const doors = OPENINGS.filter((o) => o.group === 'door').map((o) => o.id);
    expect(doors.indexOf('slidingc')).toBe(doors.indexOf('sliding2') + 1);
    expect(UPSTREAM_OPENINGS.slidingc).toBe('slidingc');
  });

  it('畫法：每種方向（橫、直）× 兩側 × 兩種鉸鍊 × 寬度都畫得出東西、不超出「開門的範圍」；和其他拉門不同', () => {
    for (const o of ['h', 'v'] as const)
      for (const side of [1, -1] as const)
        for (const hinge of [0, 1] as const)
          for (const len of [1.5, 3, 5]) {
            const op = door('slidingc', { o, side, hinge, len });
            const rec = drawDoor(op, { playerView: true, editor: false });
            expect(rec.pts.length).toBeGreaterThan(0);
            const b = box(rec.pts);
            const lim = openingRect(op, Math.max(openingReach(op), 0.34 * 0.75));
            const pad = 0.2;
            expect(b.x0).toBeGreaterThanOrEqual(lim.x - pad);
            expect(b.y0).toBeGreaterThanOrEqual(lim.y - pad);
            expect(b.x1).toBeLessThanOrEqual(lim.x + lim.w + pad);
            expect(b.y1).toBeLessThanOrEqual(lim.y + lim.h + pad);
          }
    const sig = (k: OpeningKind) => drawDoor(door(k, { len: 3 })).ops.join();
    for (const k of ['sliding', 'sliding2', 'auto', 'door2', 'door'] as const)
      expect(sig('slidingc'), k).not.toBe(sig(k));
  });

  it('畫法：兩片門板在中間合起來（中間留縫）、箭頭畫在開的那一側（side 翻過來就在另一邊）', () => {
    const at = (side: 1 | -1) => drawDoor(door('slidingc', { side, len: 4 })).pts;
    const up = at(1);
    const down = at(-1);
    /* side 1：箭頭在線的下方（y 大），side −1：在上方；牆線是 y＝5 */
    expect(Math.max(...up.map((p) => p[1]))).toBeGreaterThan(5.2);
    expect(Math.min(...down.map((p) => p[1]))).toBeLessThan(4.8);
    /* 兩片門板不重疊：左半的點都在中線（x＝5）左邊、右半在右邊的區段各有 */
    expect(up.some((p) => p[0] < 4.9)).toBe(true);
    expect(up.some((p) => p[0] > 5.1)).toBe(true);
  });

  it('PL 檢視照畫（不是秘密）；設成只有 GM 看得到時 PL 檢視不畫；五種樣式都畫得出來', () => {
    const op = door('slidingc');
    expect(drawDoor(op, { playerView: true, editor: true }).ops.length).toBeGreaterThan(0);
    expect(drawDoor({ ...op, gm: true }, { playerView: true, editor: true }).ops).toEqual([]);
    for (const id of THEME_IDS) {
      const { ctx, rec } = recorder();
      drawOpening(ctx, op, 0.34, THEMES[id], LW, { playerView: false, editor: false });
      expect(rec.pts.length, id).toBeGreaterThan(0);
    }
  });

  it('切開牆；專案檔與分享連結帶著；匯出的範圍算進去', () => {
    const f: Floor = {
      ...emptyFloor('1F'),
      rooms: [{ id: 'a', x: 0, y: 0, w: 10, h: 8, name: 'A', cat: 'living' }],
      openings: [{ ...door('slidingc', { x: 3, y: 0 }), id: 'd1' }],
    };
    const runs = computeWalls(f).runs.filter((r) => r.o === 'h' && r.c === 0);
    expect(runs.map((r) => [r.a, r.b])).toEqual([
      [0, 3],
      [6, 10],
    ]);
    expect(openingsOffWall(f)).toEqual([]);
    const p: Project = {
      name: '拉門',
      theme: 'clean',
      showSize: 'none',
      showNames: true,
      floors: [f],
      active: 0,
    };
    /* 專案檔的整理：不認得的種類才會丟掉，雙開拉門留著 */
    const report: NormalizeReport = { droppedItems: 0 };
    const norm = normalizeProject(JSON.parse(JSON.stringify(p)), isAsset, report) as Project;
    expect(norm.floors[0].openings.map((o) => o.kind)).toEqual(['slidingc']);
    expect(compatCounts(report.compat as CompatReport).openings).toBe(0);
    /* 分享連結（完整與 PL 用）來回 */
    for (const mode of ['full', 'pl'] as const) {
      const { hash } = encodeMapHash(p, mode);
      const back = readMapHash(hash);
      expect(back.kind, mode).toBe('ok');
      if (back.kind !== 'ok') continue;
      const q = normalizeProject(back.raw, isAsset) as Project;
      expect(
        q.floors[0].openings.map((o) => o.kind),
        mode,
      ).toEqual(['slidingc']);
    }
    /* 匯出的外接範圍：往牆外多算 0.5 格（開門的範圍，同其他拉門） */
    const up: Floor = { ...f, openings: [{ ...f.openings[0], side: -1 }] };
    expect(floorBounds(up)).toEqual({ x: 0, y: -0.5, w: 10, h: 8.5 });
  });
});

/* ---------- 家具 8 種 ---------- */

/** 原作 v1.15 的尺寸（格）與本站的分類、名稱；尺寸逐一和原作相同（讀原作的檔，大小才對得上） */
const NEW_ITEMS: [string, string, number, number, string][] = [
  ['squat_rack', 'leisure', 3, 2.4, '深蹲架'],
  ['cable_machine', 'leisure', 3, 2.4, '滑輪訓練機'],
  ['rowing_machine', 'leisure', 1.2, 4.4, '划船機'],
  ['yoga_mat', 'leisure', 1.2, 3.6, '瑜珈墊'],
  ['wash_station', 'bath', 1.6, 2, '澡堂洗身區'],
  ['urinal', 'bath', 0.9, 0.8, '小便斗'],
  ['squat_toilet', 'bath', 1, 1.6, '蹲式馬桶'],
  ['trough_sink', 'bath', 4, 1.2, '長型洗手台'],
];

describe('家具 8 種（F244、3.13.2）', () => {
  it('代號與原作 v1.15 相同、尺寸逐一相同、放進「娛樂・運動」與「衛浴」、名稱用本站的說法', () => {
    expect([...UPSTREAM_ITEMS_V115].sort()).toEqual(NEW_ITEMS.map((x) => x[0]).sort());
    for (const [id, group, w, h, name] of NEW_ITEMS) {
      const a = ASSET[id];
      expect([a.group, a.w, a.h, a.name], id).toEqual([group, w, h, name]);
      expect(typeof FURNITURE_DRAW[id], id).toBe('function');
    }
  });

  it('標籤與搜尋：用名稱、別名、#標籤都找得到；公共的洗手間設備有 #公共', () => {
    const find = (q: string) => Object.keys(ASSET).filter((id) => assetMatches(ASSET[id], q));
    expect(find('深蹲')).toEqual(['squat_rack']);
    expect(find('龍門架')).toEqual(['cable_machine']);
    expect(find('瑜伽')).toEqual(['yoga_mat']);
    expect(find('大浴場')).toEqual(['wash_station']);
    expect(find('蹲式馬桶')).toEqual(['squat_toilet']);
    for (const id of ['squat_rack', 'cable_machine', 'rowing_machine', 'yoga_mat'])
      expect(ASSET[id].tags, id).toEqual(expect.arrayContaining(['indoor', 'leisure']));
    for (const id of ['wash_station', 'urinal', 'squat_toilet', 'trough_sink'])
      expect(ASSET[id].tags, id).toContain('public');
    expect(find('#公共')).toEqual(
      expect.arrayContaining(['wash_station', 'urinal', 'squat_toilet', 'trough_sink']),
    );
  });

  it('靠牆時背面朝牆：洗手間的 4 種與深蹲架、滑輪訓練機（本站補強，D62）；划船機、瑜珈墊沒有方向', () => {
    for (const id of [
      'wash_station',
      'urinal',
      'squat_toilet',
      'trough_sink',
      'squat_rack',
      'cable_machine',
    ])
      expect(ASSET[id].orient, id).toBe(true);
    for (const id of ['rowing_machine', 'yoga_mat']) expect(ASSET[id].orient, id).toBeUndefined();
  });

  it('畫法：五種樣式、預設大小與放大縮小（寬、深各 0.5～2 倍）都畫得出來，點不超出外框', () => {
    for (const [id, , w, h] of NEW_ITEMS)
      for (const theme of THEME_IDS)
        for (const [sw, sh] of [
          [1, 1],
          [0.5, 1],
          [1, 0.5],
          [2, 1],
          [1, 2],
        ]) {
          const { ctx, rec } = recorder();
          FURNITURE_DRAW[id](ctx, furnStyle(THEMES[theme], LW), w * sw, h * sh, { label: '1' });
          expect(rec.pts.length, `${id} ${theme}`).toBeGreaterThan(0);
          const b = box(rec.pts);
          expect(b.x0, id).toBeGreaterThanOrEqual(-0.3);
          expect(b.y0, id).toBeGreaterThanOrEqual(-0.3);
          expect(b.x1, id).toBeLessThanOrEqual(w * sw + 0.3);
          expect(b.y1, id).toBeLessThanOrEqual(h * sh + 0.3);
        }
  });

  it('澡堂洗身區與長型洗手台：寬度加倍時重複的部分（水龍頭、浴凳）跟著加倍', () => {
    const count = (id: string, w: number, h: number) => {
      const { ctx, rec } = recorder();
      FURNITURE_DRAW[id](ctx, furnStyle(theme, LW), w, h, {});
      return rec.ops.filter((o) => o === 'arc').length;
    };
    expect(count('wash_station', 3.2, 2)).toBeGreaterThan(count('wash_station', 1.6, 2) * 1.8);
    expect(count('trough_sink', 4, 1.2)).toBeGreaterThan(count('trough_sink', 2, 1.2));
  });
});

/* ---------- 健身房範本 ---------- */

describe('健身房範本（F245、3.13.3）', () => {
  const tpl = getTemplate('gym');
  const [floor] = instantiateTemplate('gym', { clues: false }) as Floor[];
  const withClues = (instantiateTemplate('gym', { clues: true }) as Floor[])[0];

  it('娛樂・表演（也在商店・辦公），照「全部」的順序排在 KTV 後面；標籤、一層、線索 4 條', () => {
    expect(tpl?.name).toBe('健身房');
    expect([tpl?.group, tpl?.also]).toEqual(['leisure', ['commerce']]);
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids.indexOf('gym')).toBe(ids.indexOf('karaoke') + 1);
    expect(TEMPLATE_TAGS.gym).toEqual(['modern', 'indoor', 'public', 'leisure', 'hidden', 'gm']);
    expect(floor).toBeDefined();
    expect(tpl?.clues).toHaveLength(4);
    expect(withClues.items.filter((i) => i.clue)).toHaveLength(4);
  });

  it('新家具 8 種與雙開拉門都用到；員工室與儲藏室預設 GM 專用，舊三溫暖室寫死 GM 專用、暗門通進去', () => {
    const used = new Set(floor.items.map((i) => i.t));
    for (const [id] of NEW_ITEMS) expect(used.has(id), id).toBe(true);
    expect(floor.openings.some((o) => o.kind === 'slidingc')).toBe(true);
    const gm = floor.rooms.filter((r) => r.gm).map((r) => r.name);
    expect(gm.sort()).toEqual(['員工室', '儲藏室', '舊三溫暖室'].sort());
    expect(floor.rooms.find((r) => r.name === '舊三溫暖室')?.note).toBeTruthy();
    expect(floor.openings.filter((o) => o.kind === 'secret')).toHaveLength(1);
    /* 線索不放進 GM 專用的房間 */
    for (const c of tpl?.clues ?? []) expect(gm).not.toContain(c.room);
  });

  it('配置：面街（西邊）的有氧區、入口大廳（自動門）、玻璃隔間的瑜珈教室；東側是更衣室、淋浴間與廁所', () => {
    const by = (name: string) => floor.rooms.find((r) => r.name === name);
    expect(['有氧區', '入口大廳', '瑜珈教室'].map((n) => by(n)?.x)).toEqual([10, 10, 10]);
    expect(by('瑜珈教室')?.wall).toBe('glass');
    expect(floor.openings.some((o) => o.kind === 'auto' && o.o === 'v' && o.x === 10)).toBe(true);
    for (const n of ['男更衣室', '女更衣室', '男淋浴間', '女淋浴間', '男廁', '女廁'])
      expect((by(n)?.x ?? 0) >= 42, n).toBe(true);
    /* 尺寸和本站其他的範本相當（約 22 m × 15 m，加上街道） */
    expect(Math.max(...floor.rooms.map((r) => r.x + r.w))).toBe(60);
    expect(Math.max(...floor.rooms.map((r) => r.y + r.h))).toBe(30);
  });
});

/* ---------- 讀原作 v1.15 實際存的地圖檔 ---------- */

describe('讀原作 v1.15 存的地圖檔（F246、2.2.1）', () => {
  const raw = JSON.parse(fixtureText);
  const report: NormalizeReport = { droppedItems: 0 };
  const p = normalizeProject(raw, isAsset, report) as Project;
  const f = p.floors[0];

  it('原作的存檔格式：app、v、tool（v1.15）、沒有新欄位', () => {
    expect([raw.app, raw.v, raw.tool]).toEqual(['indoor-map-maker', 1, 'v1.15']);
    expect(Object.keys(raw.floors[0]).sort()).toEqual(
      ['id', 'items', 'name', 'openings', 'rooms', 'texts', 'walls'].sort(),
    );
  });

  it('新家具 8 種、雙開拉門都照讀：沒有略過、沒有換成相近的種類（通知裡沒有項目）', () => {
    expect(p).not.toBeNull();
    expect(report.droppedItems).toBe(0);
    expect(compatCounts(report.compat as CompatReport)).toEqual({
      converted: 0,
      items: 0,
      openings: 0,
      settings: 0,
    });
    expect(f.items.map((i) => i.t).sort()).toEqual(NEW_ITEMS.map((x) => x[0]).sort());
    expect(f.openings.map((o) => o.kind).sort()).toEqual(['sliding2', 'slidingc', 'slidingc']);
    expect(f.rooms.map((r) => [r.name, r.cat])).toEqual([
      ['訓練室', 'public'],
      ['洗身區・廁所', 'wet'],
    ]);
  });

  it('位置、大小、方向、翻轉、標籤、隱藏線索、GM 專用都留著；尺寸和本站的目錄相同', () => {
    const it = (t: string) => f.items.find((i) => i.t === t);
    for (const [id, , w, h] of NEW_ITEMS) {
      const i = it(id);
      const turned = i?.rot === 90 || i?.rot === 270;
      expect([i?.w, i?.h], id).toEqual(turned ? [h, w] : [w, h]);
    }
    expect(it('squat_rack')).toMatchObject({ x: 2.5, y: 2.75, clue: true });
    expect(it('rowing_machine')).toMatchObject({ label: '朝練用' });
    expect(it('yoga_mat')).toMatchObject({ rot: 90, x: 2.3, y: 8.45 });
    expect(it('wash_station')).toMatchObject({ flip: true });
    expect(it('urinal')).toMatchObject({ gm: true });
  });

  it('雙開拉門在牆上、切開牆；PL 檢視裡 GM 專用的小便斗藏起來', () => {
    expect(openingsOffWall(f)).toEqual([]);
    const door = f.openings.find((o) => o.kind === 'slidingc' && o.o === 'v');
    expect(door).toMatchObject({ x: 17, y: 6.5, len: 3 });
    const cut = computeWalls(f).runs.filter((r) => r.o === 'v' && r.c === 17);
    expect(cut.map((r) => [r.a, r.b])).toEqual([
      [1, 6.5],
      [9.5, 13],
    ]);
    const pl = visibleFloor(f, true, false);
    expect(pl.items.map((i) => i.t)).not.toContain('urinal');
    expect(visibleFloor(f, false, false).items.map((i) => i.t)).toContain('urinal');
  });
});
