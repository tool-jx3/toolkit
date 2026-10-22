/**
 * 室內平面圖產生器：2026-10 第三批（家具擴充、貼牆素材、標籤搜尋；規格 F232～F236、3.11、D46～D51）。
 * - 目錄：381 種、24 類、尺寸、標籤；
 * - 畫法：每一種都有、五種樣式都畫得出來（用記錄呼叫的假 canvas：沒有例外、畫得出東西、不超出外框太多、彼此不同）；
 * - 搜尋：名稱、#標籤、組合、全形＃、建議；範本的標籤；
 * - 貼牆素材：吸到牆線、跟著牆的方向、畫在牆的上面。
 */
import { describe, expect, it } from 'vitest';
import { FURNITURE_DRAW } from '@/tools/floor-plan/draw/furniture';
import { drawFloor, furnStyle } from '@/tools/floor-plan/draw/render';
import { THEMES } from '@/tools/floor-plan/draw/themes';
import {
  ASSET,
  ASSET_GROUPS,
  ASSETS,
  type AssetInfo,
  assetMatches,
  isWallMounted,
  VERTICAL_LINKS,
} from '@/tools/floor-plan/model/assets';
import {
  UPSTREAM_ITEMS_V105,
  UPSTREAM_ITEMS_V106,
  UPSTREAM_ITEMS_V110,
  UPSTREAM_WALL_ITEMS,
} from '@/tools/floor-plan/model/compat';
import { itemGhost, snapToWall } from '@/tools/floor-plan/model/snap';
import {
  isTagId,
  matchesQuery,
  queryWords,
  TAG,
  TAG_AXES,
  TAGS,
  type TagId,
  tagSuggestions,
} from '@/tools/floor-plan/model/tags';
import type { Floor } from '@/tools/floor-plan/model/types';
import { wallLines } from '@/tools/floor-plan/model/walls';
import { TEMPLATES } from '@/tools/floor-plan/templates';
import { TEMPLATE_TAGS, templateTags } from '@/tools/floor-plan/templates/tags';

const UPSTREAM_NEW = [...UPSTREAM_ITEMS_V105, ...UPSTREAM_ITEMS_V106, ...UPSTREAM_ITEMS_V110];
/** 本站自己加的貼牆素材 */
const OWN = ['wall_graffiti', 'wall_claws', 'wall_blood', 'wall_mold'];
const NEW_IDS = new Set([...UPSTREAM_NEW, ...OWN]);
const NEW = ASSETS.filter((a) => NEW_IDS.has(a.id));
const THEME_IDS = ['clean', 'mono', 'blueprint', 'paper', 'horror'] as const;

/* ---------- 記錄呼叫的假 canvas：點換算成家具自己的座標 ---------- */

type M = [number, number, number, number, number, number];
interface Rec {
  ops: string[];
  pts: [number, number][];
  paints: number;
}

function recorder(): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { ops: [], pts: [], paints: 0 };
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`NaN point ${x},${y}`);
    rec.pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  };
  const arc = (cx: number, cy: number, rx: number, ry: number, rot: number) => {
    if (!(rx >= 0) || !(ry >= 0)) throw new Error(`negative radius ${rx},${ry}`);
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
      rec.paints++;
      add(x, y);
      add(x + w, y + h);
    },
    strokeRect: (x, y, w, h) => {
      rec.paints++;
      add(x, y);
      add(x + w, y + h);
    },
    arc: (x, y, r) => arc(x, y, r, r, 0),
    ellipse: (x, y, rx, ry, rot) => arc(x, y, rx, ry, rot),
    fill: () => {
      rec.paints++;
    },
    stroke: () => {
      rec.paints++;
    },
    fillText: () => {
      rec.paints++;
    },
    measureText: () => ({ width: 1 }),
  };
  const ctx = new Proxy(
    {},
    {
      get(_t, k: string) {
        if (k in impl)
          return (...a: number[]) => {
            rec.ops.push(
              `${k}(${a.map((v) => (typeof v === 'number' ? v.toFixed(3) : '')).join(',')})`,
            );
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

function drawAsset(a: AssetInfo, theme: (typeof THEME_IDS)[number], icon = false): Rec {
  const { ctx, rec } = recorder();
  const S = furnStyle(THEMES[theme], 0.05);
  FURNITURE_DRAW[a.id](ctx, S, a.w, a.h, { label: '1', icon });
  return rec;
}

/* ---------- 目錄 ---------- */

describe('家具目錄（F232、3.11）', () => {
  it('381 種、24 類；原作新增的 234 種代號相同，另有本站的貼牆素材 4 種', () => {
    expect(ASSETS.length).toBe(381);
    expect(ASSET_GROUPS.length).toBe(24);
    expect(new Set(ASSETS.map((a) => a.id)).size).toBe(381);
    expect(NEW.length).toBe(238);
    for (const id of NEW_IDS) expect(ASSET[id], id).toBeDefined();
    /* 每一類都有東西、分類都存在 */
    for (const g of ASSET_GROUPS)
      expect(
        ASSETS.some((a) => a.group === g.id),
        g.id,
      ).toBe(true);
    for (const a of ASSETS)
      expect(
        ASSET_GROUPS.some((g) => g.id === a.group),
        a.id,
      ).toBe(true);
  });

  it('名稱不重複、不是空的', () => {
    const names = ASSETS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    for (const a of ASSETS) expect(a.name.trim().length, a.id).toBeGreaterThan(0);
  });

  it('尺寸合理：每邊 0.12～24 m（0.25～48 格）；人物 0.5～1.8 m、怪物 ≤ 5 m、車輛 ≥ 1 m 寬', () => {
    for (const a of ASSETS) {
      expect(Math.min(a.w, a.h), a.id).toBeGreaterThanOrEqual(0.25);
      expect(Math.max(a.w, a.h), a.id).toBeLessThanOrEqual(48);
    }
    for (const a of ASSETS.filter((x) => x.group === 'people')) {
      if (a.id.startsWith('monster')) expect(Math.max(a.w, a.h), a.id).toBeLessThanOrEqual(10);
      else if (a.id.startsWith('npc_') || a.id === 'enemy_humanoid') {
        expect(Math.min(a.w, a.h) * 0.5, a.id).toBeGreaterThanOrEqual(0.5);
        expect(Math.max(a.w, a.h) * 0.5, a.id).toBeLessThanOrEqual(1.8);
      }
    }
    for (const id of ['car', 'suv', 'van', 'truck', 'police_car', 'ambulance', 'fire_truck'])
      expect(ASSET[id].w * 0.5, id).toBeGreaterThanOrEqual(1.8);
    /* 鐵軌的軌距約 1.07 m：鐵軌、枕木、轉轍器至少 2 m 寬 */
    for (const id of ['rail_track', 'sleepers', 'rail_switch'])
      expect(ASSET[id].w).toBeGreaterThanOrEqual(4);
  });

  it('貼牆素材：9 種（原作的 5 種＋本站的 4 種），橫的（長邊沿著牆）', () => {
    const wall = ASSETS.filter((a) => a.wall).map((a) => a.id);
    expect(wall.sort()).toEqual([...UPSTREAM_WALL_ITEMS, ...OWN].sort());
    for (const id of wall) {
      expect(isWallMounted(id)).toBe(true);
      expect(ASSET[id].w).toBeGreaterThanOrEqual(ASSET[id].h);
      expect(ASSET[id].group).toBe('wall');
    }
    expect(isWallMounted('sofa2')).toBe(false);
  });

  it('上下樓層的連接：樓梯、電梯之外，往地下的樓梯、地板的暗門、梯子、戶外逃生梯、戶外樓梯、施工便梯', () => {
    expect([...VERTICAL_LINKS].sort()).toEqual(
      [
        'stairs',
        'stairs_u',
        'spiral',
        'elevator',
        'stairs_down',
        'trapdoor',
        'ladder',
        'fire_escape',
        'ext_stairs',
        'temp_stairs',
      ].sort(),
    );
  });
});

/* ---------- 畫法 ---------- */

describe('家具的畫法（F232、D47）', () => {
  it('每一種都有畫法', () => {
    for (const a of ASSETS) expect(typeof FURNITURE_DRAW[a.id], a.id).toBe('function');
    expect(Object.keys(FURNITURE_DRAW).length).toBe(ASSETS.length);
  });

  it('新的 238 種 × 五種樣式：沒有例外、畫得出東西、點不超出外框 0.45 格以上（素材面板的圖示也一樣）', () => {
    let calls = 0;
    const out: string[] = [];
    for (const a of NEW)
      for (const theme of THEME_IDS)
        for (const icon of [false, true]) {
          const rec = drawAsset(a, theme, icon);
          calls++;
          expect(rec.paints, `${a.id} ${theme}`).toBeGreaterThan(0);
          const bad = rec.pts.filter(
            ([x, y]) => x < -0.45 || y < -0.45 || x > a.w + 0.45 || y > a.h + 0.45,
          );
          if (bad.length && theme === 'clean' && !icon)
            out.push(
              `${a.id} ${bad.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).slice(0, 3)}`,
            );
        }
    expect(out).toEqual([]);
    expect(calls).toBe(238 * 5 * 2);
  });

  it('既有的 143 種五種樣式也照樣畫得出來（gap 色加進來之後沒有壞掉）', () => {
    for (const a of ASSETS.filter((x) => !NEW_IDS.has(x.id)))
      for (const theme of THEME_IDS) expect(drawAsset(a, theme).paints, a.id).toBeGreaterThan(0);
  });

  it('每一種的畫法都不一樣（呼叫的順序與座標）', () => {
    const sig = new Map<string, string>();
    for (const a of ASSETS) {
      const s = drawAsset(a, 'clean').ops.join(';');
      const dup = sig.get(s);
      expect(dup, `${a.id} 和 ${dup} 畫得一樣`).toBeUndefined();
      sig.set(s, a.id);
    }
  });

  it('只用樣式的顏色：換樣式時顏色跟著換（除了固定的黑白小字與號誌）', () => {
    const same: string[] = [];
    for (const a of NEW) {
      const a1 = drawAsset(a, 'clean').ops.filter((o) => o.includes('Style='));
      const a2 = drawAsset(a, 'horror').ops.filter((o) => o.includes('Style='));
      /* 只用呼叫端設好的線色（樣式的 ink）畫的不算 */
      if (a1.length && a1.join() === a2.join()) same.push(a.id);
    }
    expect(same).toEqual([]);
  });
});

/* ---------- 標籤與搜尋 ---------- */

describe('標籤（F234、D48）', () => {
  it('5 個軸、40 個標籤，代號與名稱都不重複', () => {
    expect(TAG_AXES.map((a) => a.id)).toEqual(['era', 'env', 'use', 'state', 'theme']);
    expect(TAGS.length).toBe(40);
    expect(new Set(TAGS.map((t) => t.id)).size).toBe(40);
    expect(new Set(TAGS.map((t) => t.name)).size).toBe(40);
    for (const ax of TAG_AXES)
      expect(
        TAGS.some((t) => t.axis === ax.id),
        ax.id,
      ).toBe(true);
  });

  it('每一件家具都有標籤，標籤都存在、不重複', () => {
    for (const a of ASSETS) {
      expect(a.tags.length, a.id).toBeGreaterThan(0);
      expect(new Set(a.tags).size, a.id).toBe(a.tags.length);
      for (const t of a.tags) expect(isTagId(t), `${a.id} ${t}`).toBe(true);
    }
    /* 平均每件 2 個以上 */
    const avg = ASSETS.reduce((s, a) => s + a.tags.length, 0) / ASSETS.length;
    expect(avg).toBeGreaterThan(2);
  });

  it('每個標籤都有東西用到（家具或範本）', () => {
    const used = new Set<TagId>([
      ...ASSETS.flatMap((a) => a.tags),
      ...Object.values(TEMPLATE_TAGS).flat(),
    ]);
    for (const t of TAGS) expect(used.has(t.id), t.id).toBe(true);
  });

  it('範本：56 個都有標籤（至少兩個軸）', () => {
    for (const t of TEMPLATES) {
      const tags = templateTags(t.id);
      expect(tags.length, t.id).toBeGreaterThan(1);
      for (const x of tags) expect(isTagId(x), `${t.id} ${x}`).toBe(true);
      expect(new Set(tags.map((x) => TAG[x].axis)).size, t.id).toBeGreaterThanOrEqual(2);
    }
    expect(Object.keys(TEMPLATE_TAGS).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
  });
});

describe('搜尋（F46、F234、F235）', () => {
  const find = (q: string) => ASSETS.filter((a) => assetMatches(a, q)).map((a) => a.id);

  it('名稱、別名、代號', () => {
    expect(find('單人床')).toEqual(['bed_single']);
    expect(find('消防')).toEqual(expect.arrayContaining(['extinguisher', 'hydrant', 'fire_truck']));
    expect(find('npc_')).toHaveLength(18);
    expect(find('ATM')).toEqual(['atm']);
  });

  it('#標籤：只看標籤；全形的＃也可以；只有 # 時全部', () => {
    const rail = find('#鐵道');
    expect(rail).toEqual(expect.arrayContaining(['rail_track', 'train_car', 'npc_station']));
    for (const id of rail) expect(ASSET[id].tags).toContain('railway');
    expect(find('＃鐵道')).toEqual(rail);
    /* 「#床」不是標籤：沒有結果（名稱有床的不算） */
    expect(find('#床')).toEqual([]);
    expect(find('#')).toHaveLength(381);
    /* 代號也可以：#railway */
    expect(find('#railway')).toEqual(rail);
  });

  it('組合：每個詞都要符合（#標籤＋#標籤、#標籤＋名稱）', () => {
    const both = find('#戶外 #恐怖');
    expect(both.length).toBeGreaterThan(0);
    for (const id of both) {
      expect(ASSET[id].tags).toContain('outdoor');
      expect(ASSET[id].tags).toContain('horror');
    }
    expect(find('#和風 燈')).toEqual(['lantern', 'andon']);
    expect(find('#貼牆 血')).toEqual(['wall_blood']);
    expect(find('zzz')).toEqual([]);
  });

  it('一般的詞也比對標籤名稱（打「鐵道」也找得到鐵道類）', () => {
    expect(find('鐵道')).toEqual(expect.arrayContaining(find('#鐵道')));
  });

  it('打 # 時的建議：名稱開頭的先列、前面的詞保留', () => {
    const used = new Set(ASSETS.flatMap((a) => a.tags));
    const s = tagSuggestions('#地', used);
    expect(s?.prefix).toBe('');
    expect(s?.tags[0].name).toBe('地下');
    const s2 = tagSuggestions('車 ＃屋', used);
    expect(s2?.prefix).toBe('車 ');
    expect(s2?.tags.map((t) => t.name)).toEqual(['屋頂']);
    expect(tagSuggestions('車', used)).toBeNull();
    expect(tagSuggestions('#', used)?.tags).toHaveLength(12);
  });

  it('範本的搜尋：#地下、名稱、說明', () => {
    const tpl = (q: string) =>
      TEMPLATES.filter((t) =>
        matchesQuery(
          { text: [t.name, t.description, t.id], tags: templateTags(t.id) },
          queryWords(q),
        ),
      ).map((t) => t.id);
    /* 2026-10 第三批後半：範本 15 → 56 個 */
    expect(tpl('#地下')).toEqual([
      'mansion',
      'house',
      'japanese-house',
      'speakeasy',
      'lab',
      'asylum',
      'library',
      'museum',
      'theatre',
      'station',
      'subway',
      'parking',
      'sewer',
      'military-base',
      'church',
      'castle',
      'cave',
      'cult',
      'mine',
      'abandoned-hospital',
      'dungeon',
    ]);
    expect(tpl('#GM專用 #多樓層')).toHaveLength(32);
    expect(tpl('醫院')).toEqual(['hospital', 'hospital-annex', 'abandoned-hospital']);
    expect(tpl('#廢墟 #住家')).toEqual(['ruined-house']);
    expect(tpl('#鐵道')).toEqual(['station', 'subway']);
    expect(tpl('#地下 #交通')).toEqual(['station', 'subway', 'parking']);
    expect(tpl('#和風')).toEqual(['japanese-house', 'ryokan', 'shrine']);
    expect(tpl('#奇幻')).toEqual(['castle', 'dungeon', 'tavern', 'wizard-tower']);
    expect(tpl('#宗教 #戶外')).toEqual([
      'sanheyuan',
      'shopping-street',
      'night-market',
      'temple',
      'shrine',
    ]);
  });
});

/* ---------- 靠牆自動轉向的名單（7.16） ---------- */

describe('靠牆自動轉向（F90、D47、7.16）', () => {
  it('原作會靠牆轉向的 `pod`（人形培養槽）也會；本站另外加的 `bed_canopy`、`register` 保留', () => {
    for (const id of ['pod', 'bed_canopy', 'register']) expect(ASSET[id].orient, id).toBe(true);
  });

  it('拿著 `pod` 靠近牆：背面朝牆並貼齊（上牆 0°、下牆 180°、左牆 270°，同其他靠牆的家具）', () => {
    const floor: Floor = {
      id: 'f',
      name: '1F',
      rooms: [{ id: 'r', x: 0, y: 0, w: 10, h: 8, name: '房', cat: 'living' }],
      walls: [],
      openings: [],
      items: [],
      texts: [],
    };
    const lines = wallLines(floor);
    expect(itemGhost(lines, 5, 1.2, { t: 'pod', rot: 0 })).toMatchObject({ rot: 0, y: 0 });
    expect(itemGhost(lines, 5, 6.8, { t: 'pod', rot: 0 })).toMatchObject({ rot: 180, y: 6.2 });
    expect(itemGhost(lines, 1.2, 4, { t: 'pod', rot: 0 })).toMatchObject({ rot: 270, x: 0 });
    /* 離牆遠時不轉；按 R 之後（manual）不再自動轉 */
    expect(itemGhost(lines, 5, 4, { t: 'pod', rot: 0 }).rot).toBe(0);
    expect(itemGhost(lines, 5, 6.8, { t: 'pod', rot: 0, manual: true }).rot).toBe(0);
  });
});

/* ---------- 貼牆素材 ---------- */

describe('貼牆素材（F233、D49）', () => {
  /* 一間 10×8 的房間：外牆 y＝0、y＝8、x＝0、x＝10 */
  const floor: Floor = {
    id: 'f',
    name: '1F',
    rooms: [{ id: 'r', x: 0, y: 0, w: 10, h: 8, name: '房', cat: 'living' }],
    walls: [],
    openings: [],
    items: [],
    texts: [],
  };
  const lines = wallLines(floor);

  it('拿著放：長邊的中心線吸到橫的牆線（0°），直的牆轉 90°', () => {
    const g = itemGhost(lines, 4, 0.6, { t: 'crack_wall', rot: 0 });
    expect(g).toEqual({ t: 'crack_wall', rot: 0, x: 2.5, y: -0.4, w: 3, h: 0.8 });
    const v = itemGhost(lines, 9.5, 4, { t: 'crack_wall', rot: 0 });
    expect(v).toEqual({ t: 'crack_wall', rot: 90, x: 9.6, y: 2.5, w: 0.8, h: 3 });
    /* 中心線剛好在牆線上 */
    expect(v.x + v.w / 2).toBe(10);
  });

  it('離牆線太遠時不吸（照游標放）；Alt 不吸', () => {
    const g = itemGhost(lines, 5, 4, { t: 'wall_hole', rot: 0 });
    expect(g).toEqual({ t: 'wall_hole', rot: 0, x: 4, y: 3.5, w: 2, h: 1 });
    const free = itemGhost(lines, 4, 0.6, { t: 'wall_hole', rot: 0 }, true);
    expect([free.x, free.y + 0]).toEqual([3, 0]);
  });

  it('按 R 轉過（manual）之後只找同方向的牆', () => {
    /* 轉成 90°（直的），游標在上面的橫牆附近：沒有直的牆在附近 → 不吸 */
    const g = itemGhost(lines, 4, 0.5, { t: 'crack_wall', rot: 90, manual: true });
    expect(g.rot).toBe(90);
    expect(g.y).toBe(-1);
    /* 靠近左邊的直牆 → 吸過去 */
    expect(itemGhost(lines, 0.6, 4, { t: 'crack_wall', rot: 90, manual: true })).toMatchObject({
      rot: 90,
      x: -0.4,
    });
  });

  it('沿著牆的位置對齊 0.25 格、夾在牆段裡；比牆段長時置中', () => {
    expect(snapToWall(lines, { x: 9, y: -0.2, w: 3, h: 0.8 }, true)).toEqual({
      o: 'h',
      x: 7,
      y: -0.4,
      w: 3,
      h: 0.8,
    });
    const short = wallLines({
      ...floor,
      rooms: [{ id: 'r', x: 0, y: 0, w: 2, h: 2, name: '', cat: 'living' }],
    });
    expect(snapToWall(short, { x: 0, y: -0.3, w: 3, h: 0.8 }, true)).toMatchObject({ x: -0.5 });
  });

  it('畫在牆的上面：牆的顏色先畫，血手印的顏色後畫（一般的家具在牆的下面）', () => {
    const theme = THEMES.clean;
    const ops = (t: string) => {
      const { ctx, rec } = recorder();
      const a = ASSET[t];
      drawFloor(
        ctx,
        { ...floor, items: [{ id: 'i', t, x: 3, y: -a.h / 2, w: a.w, h: a.h, rot: 0 }] },
        {
          theme,
          zoom: 24,
          showSize: 'none',
          hideNames: false,
          playerView: false,
          hideClues: false,
          editor: false,
          grid: false,
        },
      );
      return rec.ops;
    };
    const o = ops('wall_blood');
    const wallFill = o.lastIndexOf(`fillStyle=${theme.wall}`);
    const blood = o.indexOf(`fillStyle=${theme.furn.blood}`);
    expect(wallFill).toBeGreaterThan(-1);
    expect(blood).toBeGreaterThan(wallFill);
    /* 一般的家具（血跡）在牆的下面 */
    const o2 = ops('blood');
    expect(o2.indexOf(`fillStyle=${theme.furn.blood}`)).toBeLessThan(
      o2.indexOf(`fillStyle=${theme.wall}`),
    );
  });
});
