/**
 * 室內平面圖的範本（規格 D10、F191～F194）：每個範本都畫得出來、「只載入格局」「放入隱藏線索」、
 * 廢墟的處理固定（同樣的種子同樣的結果）、範本的分類涵蓋規定的類型。
 *
 * 格局規則（F194）每個範本、每一層都檢查：門窗都在牆上、房間不會半重疊（巢狀的完全包在裡面）、
 * 上下相鄰的樓層至少一座樓梯或電梯位置相同、門的開門範圍（弧線掃過的扇形）與門前一格不放家具、每間房都走得到。
 */
import { describe, expect, it } from 'vitest';
import { ASSET } from '@/tools/floor-plan/model/assets';
import { CAT } from '@/tools/floor-plan/model/catalog';
import {
  UPSTREAM_ITEMS_V105,
  UPSTREAM_ITEMS_V106,
  UPSTREAM_ITEMS_V110,
} from '@/tools/floor-plan/model/compat';
import { emptyFloor, rectContains, rectsOverlap } from '@/tools/floor-plan/model/geometry';
import { groundFloorIndex } from '@/tools/floor-plan/model/ops';
import type { Floor, Item } from '@/tools/floor-plan/model/types';
import { computeWalls } from '@/tools/floor-plan/model/walls';
import {
  getTemplate,
  instantiateTemplate,
  TEMPLATE_GROUPS,
  TEMPLATES,
  templateGroups,
} from '@/tools/floor-plan/templates';
import { findSpot, wrapClueText } from '@/tools/floor-plan/templates/clues';
import {
  blockedDoors,
  cluesOnFurniture,
  doorsToNowhere,
  FRONT,
  halfOverlaps,
  itemsAcrossWalls,
  linkKey,
  links,
  openingsOffWall,
  overlappingItems,
  overlappingWalls,
  stuckOpenings,
  unreachableRooms,
} from '../helpers/floorPlanLayout';

const build = (id: string, opts = {}) => instantiateTemplate(id, opts) as Floor[];

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('範本 %s', (id, tpl) => {
  const floors = build(id);

  it('有名字、說明、樓層；家具都在目錄裡；id 不重複', () => {
    expect(tpl.name).toBeTruthy();
    expect(tpl.description).toBeTruthy();
    expect(floors.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const f of floors) {
      for (const it of f.items) expect(ASSET[it.t], it.t).toBeTruthy();
      for (const o of [...f.rooms, ...f.items, ...f.openings, ...f.walls, ...f.texts]) {
        expect(ids.has(o.id)).toBe(false);
        ids.add(o.id);
      }
    }
  });

  describe.each(floors.map((f) => [f.name, f] as const))('格局規則（F194）：%s', (_name, f) => {
    it('門窗都在牆上（自動牆或手畫的牆）', () => {
      expect(openingsOffWall(f)).toEqual([]);
    });

    it('房間不會半重疊（不是分開就是完全包在裡面）', () => {
      expect(halfOverlaps(f)).toEqual([]);
    });

    it('門的開門範圍（扇形）與門前一格沒有家具', () => {
      expect(blockedDoors(f)).toEqual([]);
    });

    it('沒有重疊的牆（手畫的牆不疊在自動牆或別的手畫牆上）', () => {
      expect(overlappingWalls(f)).toEqual([]);
    });

    it('門窗不卡在牆裡（不和別的門窗重疊、不跨過牆的接點）', () => {
      expect(stuckOpenings(f)).toEqual([]);
    });

    it('家具不穿過牆', () => {
      expect(itemsAcrossWalls(f)).toEqual([]);
    });

    it('家具不重疊（畫在底下的、桌上的小物除外；2026-10-22 依 7.18）', () => {
      expect(overlappingItems(f)).toEqual([]);
    });

    it('地面層以外的門兩側都是房間（不開到半空中）', () => {
      if (floors.indexOf(f) === groundFloorIndex(floors)) return;
      expect(doorsToNowhere(f)).toEqual([]);
    });

    it('和下一層之間，樓梯或電梯至少有一座位置相同', () => {
      const i = floors.indexOf(f);
      if (i === 0) return;
      const below = new Set(links(floors[i - 1]).map(linkKey));
      expect(
        links(f).some((it) => below.has(linkKey(it))),
        `${floors[i - 1].name}→${f.name}`,
      ).toBe(true);
    });
  });

  it('每間房都走得到（從 1F 外面經過門、開口與樓梯）', () => {
    expect(unreachableRooms(floors)).toEqual([]);
  });

  it('只載入格局：沒有家具與文字；房間、門窗照舊', () => {
    const bare = build(id, { structureOnly: true });
    expect(bare.every((f) => f.items.length === 0 && f.texts.length === 0)).toBe(true);
    expect(bare.map((f) => f.rooms.length)).toEqual(floors.map((f) => f.rooms.length));
  });

  it('放入隱藏線索：每條線索一件小物＋一段說明，都標成線索，放在指定的房間裡', () => {
    const withClues = build(id, { clues: true });
    for (const c of tpl.clues) {
      const f = withClues.find((x) => x.name === c.floor) as Floor;
      const room = f.rooms.find((r) => r.name === c.room);
      expect(room, `${c.floor} ${c.room}`).toBeTruthy();
      const item = f.items.find((it) => it.clue && it.t === c.t && room && rectContains(room, it));
      expect(item, `${c.room} ${c.t}`).toBeTruthy();
      const text = f.texts.find((t) => t.clue && t.text.replace('\n', '') === c.text);
      expect(text, c.text).toBeTruthy();
    }
    const total = withClues.reduce((n, f) => n + f.items.filter((i) => i.clue).length, 0);
    expect(total).toBe(tpl.clues.length);
    /* 線索小物也照 F194：不放在門的開門範圍與門前一格（複驗發現透天厝 1F 的「刀」在開口前） */
    for (const f of withClues) expect(blockedDoors(f), f.name).toEqual([]);
    /* 每條線索都找得到空位：不疊在別的家具上（2026-10）、線索小物彼此也不疊（7.18） */
    for (const f of withClues) expect(cluesOnFurniture(f), f.name).toEqual([]);
    for (const f of withClues) expect(overlappingItems(f), f.name).toEqual([]);
  });

  it('線索 3～5 條，每條都有說明，房間都存在（規格 D10）', () => {
    expect(tpl.clues.length).toBeGreaterThanOrEqual(3);
    expect(tpl.clues.length).toBeLessThanOrEqual(5);
    for (const c of tpl.clues) {
      expect(c.text.trim(), c.room).toBeTruthy();
      const f = floors.find((x) => x.name === c.floor);
      expect(
        f?.rooms.some((r) => r.name === c.room),
        `${c.floor} ${c.room}`,
      ).toBe(true);
    }
  });
});

describe('格局規則的檢查本身（抓得到違規）', () => {
  /** 兩間房：A (0,0,6,4)、B (6,0,4,4)；A 的南邊對外有一扇門 */
  const plan = (): Floor => ({
    ...emptyFloor('1F'),
    rooms: [
      { id: 'a', x: 0, y: 0, w: 6, h: 4, name: 'A', cat: 'living' },
      { id: 'b', x: 6, y: 0, w: 4, h: 4, name: 'B', cat: 'bedroom' },
    ],
    openings: [{ id: 'o', kind: 'door', o: 'h', x: 1, y: 4, len: 1.5, side: -1, hinge: 0 }],
  });
  const chair = (x: number, y: number): Item => ({ id: 'c', t: 'chair', x, y, w: 1, h: 1, rot: 0 });

  it('開門範圍（扇形）裡、門前一格裡的家具；扇形外面、地毯不算', () => {
    const f = plan();
    expect(blockedDoors(f)).toEqual([]);
    f.items = [chair(1.6, 2.8)];
    expect(blockedDoors(f)).toHaveLength(1);
    /* 扇形的外接方塊的角落（離鉸鍊超過門寬）不算 */
    f.items = [chair(2.2, 2)];
    expect(blockedDoors(f)).toEqual([]);
    /* 門外（不開門的那一側）一格以內 */
    f.items = [chair(1.5, 4.6)];
    expect(blockedDoors(f)).toHaveLength(1);
    f.items = [{ id: 'r', t: 'rug', x: 0, y: 2, w: 4, h: 3, rot: 0 }];
    expect(blockedDoors(f)).toEqual([]);
    /* 雙開門：兩端各一片 */
    f.openings = [{ id: 'o', kind: 'door2', o: 'h', x: 1, y: 4, len: 3, side: -1, hinge: 0 }];
    f.items = [chair(3, 2)];
    expect(blockedDoors(f)).toHaveLength(1);
  });

  it('線索的空位不放在門前一格（開口也算；複驗發現線索小物落在開口前 0.85 格）', () => {
    /* A 的左邊被床佔滿，只剩靠 B 的那一側；A、B 之間的牆上有開口 (6, 1)～(6, 3) */
    const f = {
      name: '1F',
      rooms: [
        { x: 0, y: 0, w: 6, h: 4, name: 'A', cat: 'living' },
        { x: 6, y: 0, w: 4, h: 4, name: 'B', cat: 'bedroom' },
      ],
      walls: [],
      openings: [{ kind: 'open', o: 'v', x: 6, y: 1, len: 2, side: 1, hinge: 0 }],
      items: [{ t: 'bed', x: 0, y: 0, w: 4.2, h: 4, rot: 0 }],
      texts: [],
    } as unknown as Parameters<typeof findSpot>[0];
    const spot = findSpot(f, f.rooms[0], 0.6, 0.6);
    const front = { x: 6 - FRONT, y: 1, w: FRONT * 2, h: 2 };
    if (spot) expect(rectsOverlap({ ...spot, w: 0.6, h: 0.6 }, front)).toBe(false);
  });

  it('走得到：沒有門的房間走不到；窗戶不能走；樓梯接到上一層', () => {
    const f = plan();
    expect(unreachableRooms([f])).toEqual(['1F：B']);
    f.openings.push({ id: 'w', kind: 'window', o: 'v', x: 6, y: 1, len: 2, side: 1, hinge: 0 });
    expect(unreachableRooms([f])).toEqual(['1F：B']);
    f.openings.push({ id: 'd', kind: 'sliding', o: 'v', x: 6, y: 3, len: 1, side: 1, hinge: 0 });
    expect(unreachableRooms([f])).toEqual([]);
    const up: Floor = {
      ...emptyFloor('2F'),
      rooms: [{ id: 'u', x: 0, y: 0, w: 6, h: 4, name: 'U', cat: 'hall' }],
    };
    expect(unreachableRooms([f, up])).toEqual(['2F：U']);
    const stairs = { id: 's', t: 'stairs', x: 3, y: 0, w: 2, h: 4, rot: 0 };
    f.items = [stairs];
    up.items = [{ ...stairs, id: 't' }];
    expect(unreachableRooms([f, up])).toEqual([]);
  });

  it('重疊的牆：手畫的牆疊在自動牆上、兩道手畫牆疊在一起；畫在分區線上或只碰到端點不算', () => {
    const f = plan();
    expect(overlappingWalls(f)).toEqual([]);
    /* A、B 之間的內牆 x＝6 上再畫一道玻璃牆 */
    f.walls = [{ id: 'g', x1: 6, y1: 1, x2: 6, y2: 3, kind: 'glass' }];
    expect(overlappingWalls(f)).toHaveLength(1);
    /* B 不產生牆時 x＝6 是分區線，玻璃牆畫在上面可以 */
    f.rooms[1].noWall = true;
    expect(overlappingWalls(f)).toEqual([]);
    /* 兩道手畫牆疊在一起；只在端點相接不算 */
    f.walls.push({ id: 'h', x1: 6, y1: 2.5, x2: 6, y2: 4, kind: 'int' });
    expect(overlappingWalls(f)).toHaveLength(1);
    f.walls[1] = { id: 'h', x1: 6, y1: 3, x2: 6, y2: 4, kind: 'int' };
    expect(overlappingWalls(f)).toEqual([]);
  });

  it('卡在牆裡的門窗：門窗重疊、跨過 T 字接點；門窗的端點在接點上不算', () => {
    const f = plan();
    expect(stuckOpenings(f)).toEqual([]);
    /* 北邊的外牆 y＝0 上，跨過 A、B 之間的牆（x＝6）的窗 */
    f.openings.push({ id: 'w', kind: 'window', o: 'h', x: 5, y: 0, len: 2, side: 1, hinge: 0 });
    expect(stuckOpenings(f)).toEqual(['1F：window@h5,0 × 牆 v6:0-4']);
    /* 端點剛好在接點上：可以 */
    f.openings[1] = { ...f.openings[1], x: 4 };
    expect(stuckOpenings(f)).toEqual([]);
    /* 和同一條線上的門重疊 */
    f.openings.push({ id: 'x', kind: 'door', o: 'h', x: 2, y: 4, len: 1.5, side: 1, hinge: 0 });
    expect(stuckOpenings(f)).toEqual(['1F：door@h1,4 × door@h2,4']);
  });

  it('線索小物疊在家具上', () => {
    const f = plan();
    f.items = [
      { id: 'b', t: 'bed_single', x: 0, y: 0, w: 2, h: 4, rot: 0 },
      { id: 'k', t: 'key', x: 1, y: 1, w: 0.9, h: 0.45, rot: 0, clue: true },
      { id: 'r', t: 'rug', x: 3, y: 0, w: 2, h: 2, rot: 0 },
      { id: 'm', t: 'memo', x: 3.5, y: 0.5, w: 0.8, h: 0.6, rot: 0, clue: true },
    ];
    expect(cluesOnFurniture(f)).toEqual(['1F：key(1,1,0.9×0.45) × bed_single(0,0,2×4)']);
  });

  it('家具重疊（7.18：三合院的床壓在衣櫃上）；畫在底下的、整個放在桌面上的小物不算，只碰到邊不算', () => {
    const f = plan();
    const mk = (id: string, t: string, x: number, y: number, w: number, h: number): Item => ({
      id,
      t,
      x,
      y,
      w,
      h,
      rot: 0,
    });
    /* 床與衣櫃疊在一起 */
    f.items = [mk('b', 'bed_single', 0, 0, 2, 4), mk('w', 'wardrobe', 1.5, 3, 3, 1.2)];
    expect(overlappingItems(f)).toEqual(['1F：bed_single(0,0,2×4) × wardrobe(1.5,3,3×1.2)']);
    /* 只碰到邊 */
    f.items = [mk('b', 'bed_single', 0, 0, 2, 4), mk('w', 'wardrobe', 2, 3, 3, 1.2)];
    expect(overlappingItems(f)).toEqual([]);
    /* 地毯、血跡（畫在底下）上面放家具 */
    f.items = [
      mk('r', 'rug', 0, 0, 4, 3),
      mk('c', 'chair', 1, 1, 1, 1),
      mk('x', 'blood', 0.5, 0.5, 2, 2),
    ];
    expect(overlappingItems(f)).toEqual([]);
    /* 祭壇上的蠟燭、桌上的筆電：整個在桌面上才算放在上面；超出桌面、或底下不是桌面類的家具都算重疊 */
    f.items = [mk('a', 'altar', 0, 0, 3, 1.6), mk('c', 'candle', 0.2, 0.4, 0.8, 0.8)];
    expect(overlappingItems(f)).toEqual([]);
    f.items = [mk('a', 'altar', 0, 0, 3, 1.6), mk('c', 'candle', 2.6, 0.4, 0.8, 0.8)];
    expect(overlappingItems(f)).toHaveLength(1);
    f.items = [mk('d', 'office_desk', 0, 0, 2.4, 1.4), mk('l', 'laptop', 0.4, 0.2, 1.2, 0.9)];
    expect(overlappingItems(f)).toEqual([]);
    f.items = [mk('b', 'bed_single', 0, 0, 2, 4), mk('k', 'key', 0.5, 1, 0.9, 0.45)];
    expect(overlappingItems(f)).toHaveLength(1);
    /* 椅子推進桌子底下也算（範本裡的椅子都和桌子分開放） */
    f.items = [mk('t', 'table_round', 0, 0, 1.8, 1.8), mk('c', 'chair', 1.6, 0.4, 1, 1)];
    expect(overlappingItems(f)).toHaveLength(1);
  });

  it('門窗不在牆上、房間半重疊', () => {
    const f = plan();
    f.openings.push({ id: 'x', kind: 'door', o: 'h', x: 1, y: 2, len: 1.5, side: 1, hinge: 0 });
    expect(openingsOffWall(f)).toEqual(['1F：door@h1,2']);
    f.rooms.push({ id: 'c', x: 5, y: 1, w: 3, h: 2, name: 'C', cat: 'wet' });
    expect(halfOverlaps(f)).toEqual(['1F：A / C', '1F：B / C']);
  });
});

describe('範本目錄', () => {
  it('類型涵蓋住宅、洋館、飯店、醫院、廢墟（派工的 D 項）', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'studio',
        'townhouse',
        'mansion',
        'hotel',
        'hospital',
        'abandoned-hospital',
        'ruined-house',
      ]),
    );
  });

  it('分類（F190、D17；2026-10 第三批後半 F237、D53）：13 類，一個範本可以放在好幾類，「全部」依主要分類的順序', () => {
    expect(TEMPLATE_GROUPS.map((g) => g.name)).toEqual([
      '住宅',
      '住宿・餐飲',
      '醫療・研究',
      '公共場所',
      '商店・辦公',
      '娛樂・表演',
      '交通・運輸',
      '工業・設施',
      '軍警・保全',
      '宗教・古蹟',
      '野外・地下',
      '廢墟・事件',
      '奇幻・科幻',
    ]);
    const inGroup = (g: string) =>
      TEMPLATES.filter((t) => templateGroups(t).includes(g as never)).map((t) => t.id);
    expect(Object.fromEntries(TEMPLATE_GROUPS.map((g) => [g.id, inGroup(g.id)]))).toEqual({
      home: [
        'studio',
        'townhouse',
        'mansion',
        'lodge',
        'apartment',
        'house',
        'sanheyuan',
        'japanese-house',
        'ruined-house',
        'crime',
      ],
      lodging: ['lodge', 'hotel', 'ryokan', 'speakeasy', 'diner', 'tavern'],
      medical: ['hospital', 'hospital-annex', 'lab', 'asylum', 'abandoned-hospital'],
      public: [
        'school',
        'library',
        'club-building',
        'museum',
        'funeral-home',
        'police',
        'temple',
        'abandoned-school',
      ],
      commerce: [
        'diner',
        'office',
        'konbini',
        'detective',
        'shopping-street',
        'night-market',
        'parking',
      ],
      leisure: [
        'speakeasy',
        'club-building',
        'museum',
        'night-market',
        'theatre',
        'karaoke',
        'campsite',
      ],
      transport: ['station', 'subway', 'parking', 'ferry', 'warehouse'],
      industry: ['factory', 'warehouse', 'construction', 'sewer', 'mine', 'abandoned-factory'],
      military: ['lab', 'police', 'military-base', 'prison'],
      sacred: [
        'sanheyuan',
        'japanese-house',
        'funeral-home',
        'temple',
        'shrine',
        'church',
        'castle',
      ],
      wild: ['lodge', 'sewer', 'cave', 'cult', 'campsite', 'mine', 'dungeon'],
      ruins: [
        'asylum',
        'detective',
        'construction',
        'cult',
        'mine',
        'abandoned-hospital',
        'ruined-house',
        'abandoned-factory',
        'abandoned-school',
        'crime',
      ],
      fantasy: ['castle', 'dungeon', 'spaceship', 'tavern', 'wizard-tower'],
    });
    /* 其他分類不重複、不等於主要分類；每一類至少 4 個 */
    for (const t of TEMPLATES) {
      expect(new Set(templateGroups(t)).size, t.id).toBe(templateGroups(t).length);
      expect(t.also ?? [], t.id).not.toContain(t.group);
    }
    for (const g of TEMPLATE_GROUPS) expect(inGroup(g.id).length, g.id).toBeGreaterThanOrEqual(4);
    /* 開頁載入第一個範本（F01），範本依主要分類的順序排 */
    expect(TEMPLATES[0].id).toBe('studio');
    const order = TEMPLATE_GROUPS.map((g) => g.id);
    const groups = TEMPLATES.map((t) => order.indexOf(t.group));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(TEMPLATES).toHaveLength(56);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(56);
    expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(56);
    /* 恐怖調查樣式：主要分類是廢墟的（命案現場除外）與地下教團據點 */
    expect(TEMPLATES.filter((t) => t.theme === 'horror').map((t) => t.id)).toEqual([
      'cult',
      'abandoned-hospital',
      'ruined-house',
      'abandoned-factory',
      'abandoned-school',
    ]);
  });

  const roomNames = (fs: Floor[]) => fs.flatMap((f) => f.rooms.map((r) => r.name));
  const itemTypes = (fs: Floor[]) => new Set(fs.flatMap((f) => f.items.map((i) => i.t)));

  it('學校：兩層教室＋屋頂；教室、走廊、樓梯、保健室、理化教室', () => {
    const fs = build('school');
    expect(fs.map((f) => f.name)).toEqual(['1F', '2F', '屋頂']);
    const names = roomNames(fs);
    for (const n of ['保健室', '理化教室', '屋頂', '走廊', '樓梯間'])
      expect(
        names.some((x) => x.includes(n)),
        n,
      ).toBe(true);
    expect(names.filter((x) => x.endsWith('班')).length).toBeGreaterThanOrEqual(3);
    for (const t of ['school_desk', 'lectern', 'whiteboard', 'lab_bench'])
      expect(itemTypes(fs).has(t), t).toBe(true);
  });

  it('警察局：值班台、偵訊室（單向玻璃）、拘留室（鐵欄杆）、證物室（上鎖）、辦公室', () => {
    const [f] = build('police');
    const names = f.rooms.map((r) => r.name);
    for (const n of [
      '大廳・值班台',
      '偵訊室',
      '觀察室',
      '留置室 1',
      '留置室 2',
      '證物室',
      '辦公室',
    ])
      expect(names, n).toContain(n);
    expect(f.walls.some((w) => w.kind === 'glass')).toBe(true);
    expect(f.walls.some((w) => w.kind === 'bars')).toBe(true);
    expect(f.openings.filter((o) => o.kind === 'locked').length).toBeGreaterThanOrEqual(2);
    expect(f.items.some((i) => i.t === 'reception')).toBe(true);
  });

  it('寺廟：廟埕、前殿、天井、正殿、廂房、金爐', () => {
    const [f] = build('temple');
    const names = f.rooms.map((r) => r.name);
    for (const n of ['廟埕', '前殿', '天井', '正殿', '金爐']) expect(names, n).toContain(n);
    expect(names.filter((x) => x.includes('廂')).length).toBeGreaterThanOrEqual(2);
    expect(f.items.some((i) => i.t === 'altar')).toBe(true);
  });

  it('洞窟：不規則的洞室（很多段岩壁）、地底湖、祭壇，封印的洞室是 GM 專用、用暗門連起來', () => {
    const [f] = build('cave');
    const walls = computeWalls(f).runs.filter((r) => r.kind === 'rock');
    expect(walls.length).toBeGreaterThan(40);
    expect(f.rooms.some((r) => r.cat === 'water' && r.name === '地底湖')).toBe(true);
    expect(f.items.some((i) => i.t === 'altar')).toBe(true);
    const sealed = f.rooms.filter((r) => r.name === '封印之間');
    expect(sealed.length).toBeGreaterThan(0);
    expect(sealed.every((r) => r.gm)).toBe(true);
    expect(f.openings.some((o) => o.kind === 'secret')).toBe(true);
    /* 一個洞室由好幾塊長方形拼成：名字只寫在最大的那一塊 */
    const altar = f.rooms.filter((r) => r.name === '祭壇');
    expect(altar.length).toBeGreaterThan(1);
    expect(altar.filter((r) => !r.hideLabel)).toHaveLength(1);
  });

  it('山中小屋、圖書館、地下教團據點：樓層與主要的房間', () => {
    const lodge = build('lodge');
    expect(lodge.map((f) => f.name)).toEqual(['1F', '2F']);
    expect(roomNames(lodge)).toEqual(expect.arrayContaining(['客廳', '廚房', '客房 1', '露台']));
    const lib = build('library');
    expect(lib.map((f) => f.name)).toEqual(['B1', '1F']);
    expect(roomNames(lib)).toEqual(expect.arrayContaining(['大廳・服務台', '閉架書庫', '禁書庫']));
    expect(lib[0].rooms.find((r) => r.name === '禁書庫')?.gm).toBe(true);
    const cult = build('cult');
    expect(cult.map((f) => f.name)).toEqual(['B1', '1F']);
    expect(roomNames(cult)).toEqual(expect.arrayContaining(['舊書店', '集會廳', '牢房 1']));
  });

  it('廢墟的處理每次相同', () => {
    const strip = (fs: Floor[]) =>
      fs.map((f) => [f.openings.map((o) => o.kind), f.items.map((i) => [i.t, i.x, i.y])]);
    expect(strip(build('abandoned-hospital'))).toEqual(strip(build('abandoned-hospital')));
    expect(
      build('abandoned-hospital')
        .flatMap((f) => f.openings)
        .some((o) => o.kind === 'brokenwin' || o.kind === 'boarded'),
    ).toBe(true);
  });

  it('沒有這個範本時 null；getTemplate 找得到', () => {
    expect(instantiateTemplate('nope')).toBeNull();
    expect(getTemplate('hotel')?.name).toBe('商務飯店');
  });

  it('長的線索說明斷成兩行（有指定斷點時照斷點；沒有時靠近中間的標點，再沒有時正中間）', () => {
    expect(wrapClueText('短短的')).toBe('短短的');
    expect(wrapClueText('短短的', 1)).toBe('短短的');
    expect(wrapClueText('被撕下的、住宿登記表')).toBe('被撕下的、\n住宿登記表');
    expect(wrapClueText('一二三四五六七八')).toBe('一二三四\n五六七八');
    expect(wrapClueText('多出一個名字的族譜', 4)).toBe('多出一個\n名字的族譜');
    /* 斷點在頭尾（沒有意義）時照沒有斷點的規則 */
    expect(wrapClueText('一二三四五六七八', 0)).toBe('一二三四\n五六七八');
    expect(wrapClueText('一二三四五六七八', 8)).toBe('一二三四\n五六七八');
  });
});

/* ---------- 線索文字（2026-10-22 依 7.18） ---------- */

describe('線索文字：斷行在詞的邊界、錯字、用字（7.18）', () => {
  const all = TEMPLATES.flatMap((t) => t.clues.map((c) => ({ id: t.id, ...c })));
  /** 線索放不下一行時的兩行 */
  const two = (id: string, text: string) => {
    const c = all.find((x) => x.id === id && x.text === text);
    return c ? wrapClueText(c.text, c.br) : null;
  };

  it('7 個字以上的說明都有指定斷點（範本目錄的「/」），斷點在字的中間、說明裡沒有留下「/」', () => {
    expect(all.length).toBeGreaterThan(200);
    for (const c of all) {
      const n = Array.from(c.text).length;
      expect(c.text, c.id).not.toContain('/');
      if (n < 7) continue;
      expect(c.br, `${c.id} ${c.text}`).toBeGreaterThan(0);
      expect(c.br, `${c.id} ${c.text}`).toBeLessThan(n);
      /* 斷開之後每一行至少一個字，接回來和原文相同 */
      expect(wrapClueText(c.text, c.br).replace('\n', ''), c.id).toBe(c.text);
    }
  });

  it('驗證者列的 7 則斷在詞中間的換行，改到詞的邊界（監獄的兩則在 7.19 換了說法，斷點照新的）', () => {
    expect(two('sanheyuan', '多出一個名字的族譜')).toBe('多出一個\n名字的族譜');
    expect(two('japanese-house', '穿軍服的男人的照片')).toBe('穿軍服的\n男人的照片');
    expect(two('japanese-house', '夾在唱片封套裡的信')).toBe('夾在唱片\n封套裡的信');
    expect(two('lab', '主任的研究日誌')).toBe('主任的\n研究日誌');
    expect(two('karaoke', '點歌單上沒聽過的歌名')).toBe('點歌單上\n沒聽過的歌名');
    expect(two('prison', '床板底下刻著日期')).toBe('床板底下\n刻著日期');
    expect(two('prison', '會客時遞來的照片')).toBe('會客時\n遞來的照片');
  });

  it('第二行不以「的」開頭：「的」跟著前面的修飾語（D60、7.19）', () => {
    for (const c of all) {
      if (!c.br) continue;
      const second = wrapClueText(c.text, c.br).split('\n')[1];
      expect(second.startsWith('的'), `${c.id} ${c.text}`).toBe(false);
    }
    /* 7.18 列的三則：「卡車司機的」「放學後來屋頂」「挖出來的東西」 */
    expect(two('diner', '店長和卡車司機的合照')).toBe('店長和卡車司機的\n合照');
    expect(two('school', '紙條上寫著「放學後來屋頂」')).toBe('紙條上寫著\n「放學後來屋頂」');
    expect(two('construction', '挖出東西的現場照')).toBe('挖出東西的\n現場照');
  });

  it('錯字與不通的說明改掉：「真的的」「寫在餐巾紙上的求救」', () => {
    expect(all.some((c) => c.text.includes('真的的'))).toBe(false);
    expect(all.some((c) => c.text.includes('寫在餐巾紙上的求救'))).toBe(false);
    expect(two('theatre', '開了刃的道具刀')).toBe('開了刃的\n道具刀');
    expect(two('diner', '寫著「救命」的餐巾紙')).toBe('寫著「救命」的\n餐巾紙');
  });

  it('範本裡的字（名稱、說明、房間名稱、GM 筆記、文字、標籤、線索）用「祕」「汙」「布」，溫泉是「露天溫泉」', () => {
    const texts = TEMPLATES.flatMap((t) => {
      const floors = build(t.id, { clues: true });
      return [
        t.name,
        t.description,
        ...t.clues.map((c) => c.text),
        ...floors.flatMap((f) => [
          f.name,
          ...f.rooms.flatMap((r) => [r.name, r.plName ?? '', r.note ?? '']),
          ...f.texts.map((x) => x.text),
          ...f.items.map((i) => i.label ?? ''),
        ]),
      ].map((s) => `${t.id}：${s}`);
    });
    expect(texts.filter((s) => /[秘污佈]|風呂/.test(s))).toEqual([]);
    const ryokan = build('ryokan').flatMap((f) => f.rooms.map((r) => r.name));
    expect(ryokan).toContain('露天溫泉');
  });
});

/* ---------- 線索文字：不沿用原作的說法、斷點不讓說明縮小（2026-10-22 依 7.19） ---------- */

describe('線索文字：套房、辦公大樓、洞窟換成本站自己的東西與說法；斷點不讓說明縮成 0.34（7.19）', () => {
  /** 載入（放入隱藏線索）後的說明：[文字, 字級] */
  const placed = (id: string) =>
    build(id, { clues: true }).flatMap((f) =>
      f.texts.filter((t) => t.clue).map((t) => [t.text.replace('\n', ''), t.size] as const),
    );
  const clueOf = (id: string) => getTemplate(id)?.clues ?? [];

  it('套房的三則線索是縮時相機、便利貼、信封；辦公大樓的會議室是錄音筆；洞窟的洞口是登山扣環', () => {
    expect(clueOf('studio').map((c) => [c.room, c.t, c.text])).toEqual([
      ['臥室', 'camera', '對準床鋪的縮時相機'],
      ['客廳', 'memo', '電視背面的便利貼'],
      ['廚房', 'papers', '冷凍格深處的信封'],
    ]);
    expect(clueOf('office').find((c) => c.room === '會議室')).toMatchObject({
      t: 'recorder',
      text: '桌底黏著的錄音筆',
    });
    expect(clueOf('cave').find((c) => c.room === '洞口')).toMatchObject({
      t: 'tools',
      text: '岩縫裡卡著的登山扣環',
    });
  });

  it('套房（開頁的範本）、山中小屋、監獄：7.18 的斷點縮到 0.34 的 5 則都回到 0.42', () => {
    expect(placed('studio')).toEqual([
      ['對準床鋪的縮時相機', 0.42],
      ['電視背面的便利貼', 0.42],
      ['冷凍格深處的信封', 0.42],
    ]);
    const lodge = new Map(placed('lodge'));
    expect(lodge.get('少一把的鑰匙串')).toBe(0.42);
    expect(lodge.get('塞進門縫的警告')).toBe(0.42);
    const prison = new Map(placed('prison'));
    expect(prison.get('床板底下刻著日期')).toBe(0.42);
    expect(prison.get('會客時遞來的照片')).toBe(0.42);
  });

  it('範本裡沒有兩則一樣的線索說明（同一個範本裡）', () => {
    for (const t of TEMPLATES) {
      const texts = t.clues.map((c) => c.text);
      expect(new Set(texts).size, t.id).toBe(texts.length);
    }
  });
});

/* ---------- 2026-10 第三批後半：新增的 41 個範本（F237～F239） ---------- */

/** 新範本（目錄裡的順序）與每一層的名稱 */
const NEW_FLOORS: Record<string, string[]> = {
  apartment: ['1F', '4F', '頂樓'],
  house: ['B1', '1F', '2F'],
  sanheyuan: ['1F'],
  'japanese-house': ['B1', '1F'],
  ryokan: ['1F', '2F'],
  speakeasy: ['B1', '1F'],
  diner: ['1F'],
  'hospital-annex': ['1F', '2F'],
  lab: ['B2', 'B1', '1F'],
  asylum: ['B1', '1F'],
  'club-building': ['1F', '2F'],
  museum: ['B1', '1F'],
  'funeral-home': ['1F'],
  office: ['1F', '8F', '屋頂'],
  konbini: ['1F'],
  detective: ['1F', '2F'],
  'shopping-street': ['1F'],
  'night-market': ['1F'],
  theatre: ['B1', '1F'],
  karaoke: ['1F'],
  station: ['B1', '1F'],
  subway: ['B2', 'B1', '1F'],
  parking: ['B2', 'B1', '1F'],
  ferry: ['B1', '1F', '2F'],
  factory: ['1F', '2F'],
  warehouse: ['1F'],
  construction: ['1F', '2F'],
  sewer: ['B1', '1F'],
  'military-base': ['B1', '1F'],
  prison: ['1F'],
  shrine: ['1F'],
  church: ['B1', '1F'],
  castle: ['B1', '1F', '2F'],
  campsite: ['1F'],
  mine: ['B1', '1F'],
  'abandoned-factory': ['1F', '2F'],
  'abandoned-school': ['1F', '2F', '屋頂'],
  dungeon: ['B1'],
  spaceship: ['1F'],
  tavern: ['1F', '2F'],
  'wizard-tower': ['1F', '2F', '3F'],
};
const NEW_IDS = Object.keys(NEW_FLOORS);

describe('2026-10 第三批後半的範本（F237～F239）', () => {
  it('41 個新範本：樓層的名稱與順序（下一層在左邊）、載入後在地面層', () => {
    expect(NEW_IDS).toHaveLength(41);
    expect(TEMPLATES.map((t) => t.id).filter((id) => NEW_IDS.includes(id))).toEqual(NEW_IDS);
    for (const id of NEW_IDS) {
      const fs = build(id);
      expect(
        fs.map((f) => f.name),
        id,
      ).toEqual(NEW_FLOORS[id]);
      const g = groundFloorIndex(fs);
      expect(fs[g].name, id).toBe(NEW_FLOORS[id].includes('1F') ? '1F' : NEW_FLOORS[id][0]);
    }
  });

  it('每個新範本都有 GM 專用的房間（寫死的密室或預設的後台）、3～5 條線索、至少 6 間有名字的房間', () => {
    for (const id of NEW_IDS) {
      const fs = build(id);
      expect(
        fs.some((f) => f.rooms.some((r) => r.gm)),
        id,
      ).toBe(true);
      const tpl = getTemplate(id);
      expect(tpl?.clues.length, id).toBeGreaterThanOrEqual(3);
      expect(tpl?.clues.length, id).toBeLessThanOrEqual(5);
      const named = fs.flatMap((f) => f.rooms.filter((r) => !r.hideLabel));
      expect(named.length, id).toBeGreaterThanOrEqual(6);
      /* GM 專用的房間有 GM 筆記或是預設的後台（筆記寫在寫死的密室） */
      expect(fs.some((f) => f.rooms.some((r) => r.gm && r.note)) || id === 'konbini', id).toBe(
        true,
      );
    }
  });

  it('用到第二批的門窗、牆、房間種類與第三批前半的家具、貼牆素材', () => {
    const fs = NEW_IDS.flatMap((id) => build(id));
    const kinds = new Set(fs.flatMap((f) => f.openings.map((o) => o.kind)));
    for (const k of ['steel', 'firedoor', 'gate', 'big2', 'revolve', 'sealed', 'platewin'])
      expect(kinds.has(k as never), k).toBe(true);
    const walls = new Set([
      ...fs.flatMap((f) => f.walls.map((w) => w.kind)),
      ...fs.flatMap((f) => f.rooms.flatMap((r) => (r.wall ? [r.wall] : []))),
    ]);
    for (const k of ['stone', 'sound', 'cracked']) expect(walls.has(k as never), k).toBe(true);
    const cats = new Set(fs.flatMap((f) => f.rooms.map((r) => r.cat)));
    for (const c of [
      'engawa',
      'studio',
      'stone',
      'industrial',
      'grate',
      'platform',
      'track',
      'road',
      'rooftop',
      'slab',
      'dirt',
      'gravel',
      'shipdeck',
    ])
      expect(cats.has(c as never), c).toBe(true);
    const items = new Set(fs.flatMap((f) => f.items.map((i) => i.t)));
    const newFurniture = new Set([
      ...UPSTREAM_ITEMS_V105,
      ...UPSTREAM_ITEMS_V106,
      ...UPSTREAM_ITEMS_V110,
      'wall_graffiti',
      'wall_claws',
      'wall_blood',
      'wall_mold',
    ]);
    expect([...items].filter((t) => newFurniture.has(t)).length).toBeGreaterThanOrEqual(150);
    expect([...items].filter((t) => ASSET[t]?.wall).length).toBeGreaterThanOrEqual(7);
  });

  it('台灣的場景：三合院（公媽廳、護龍、禾埕）、夜市（攤位）、老街（騎樓）、日式宿舍（緣側、防空壕）', () => {
    const names = (id: string) => build(id).flatMap((f) => f.rooms.map((r) => r.name));
    expect(names('sanheyuan')).toEqual(expect.arrayContaining(['公媽廳', '灶腳', '禾埕', '暗間']));
    expect(names('night-market').filter((n) => n.endsWith('攤')).length).toBeGreaterThanOrEqual(8);
    expect(names('shopping-street')).toEqual(expect.arrayContaining(['騎樓', '老街', '神壇']));
    const jp = build('japanese-house');
    expect(jp[1].rooms.some((r) => r.cat === 'engawa')).toBe(true);
    expect(jp[0].rooms.find((r) => r.name === '防空壕')?.gm).toBe(true);
  });

  it('幾個範本的特徵：月台門、鐵軌、甲板、石牆、鐵欄杆、隔音牆', () => {
    /* 地下鐵：B2 月台的玻璃牆上有自動門（月台門），隧道口開著 */
    const [b2] = build('subway');
    expect(b2.walls.filter((w) => w.kind === 'glass')).toHaveLength(2);
    expect(b2.openings.filter((o) => o.kind === 'auto')).toHaveLength(8);
    /* 車站：兩條鐵軌、島式月台、停在第二線的電車 */
    const station = build('station')[1];
    expect(station.rooms.filter((r) => r.cat === 'track')).toHaveLength(2);
    expect(station.items.some((i) => i.t === 'train_car')).toBe(true);
    /* 渡輪：三層、甲板的外圍是欄杆 */
    const ferry = build('ferry');
    expect(ferry[2].rooms.some((r) => r.cat === 'shipdeck')).toBe(true);
    expect(computeWalls(ferry[2]).runs.some((r) => r.kind === 'rail')).toBe(true);
    /* 古城（2026-10-22 依 7.18 重新設計）：房間的牆與手畫的城牆都是石牆；門樓與內牆、水牢是格柵門 */
    const [castleB1, castle1F] = build('castle');
    expect(computeWalls(castle1F).runs.filter((r) => r.kind === 'stone').length).toBeGreaterThan(
      10,
    );
    expect(castle1F.walls.filter((w) => w.kind === 'stone').length).toBeGreaterThanOrEqual(5);
    expect(castle1F.openings.filter((o) => o.kind === 'gate')).toHaveLength(2);
    expect(castleB1.openings.filter((o) => o.kind === 'gate')).toHaveLength(1);
    /* 監獄：9 間舍房「不產生牆」，前面是鐵欄杆＋格柵門 */
    const [prison] = build('prison');
    expect(prison.rooms.filter((r) => r.name.startsWith('舍房') && r.noWall)).toHaveLength(9);
    expect(prison.openings.filter((o) => o.kind === 'gate').length).toBeGreaterThanOrEqual(10);
    /* KTV：包廂的牆是隔音牆 */
    const [ktv] = build('karaoke');
    expect(ktv.rooms.filter((r) => r.wall === 'sound')).toHaveLength(8);
    /* 辦公大樓：大廳的旋轉門 */
    expect(build('office')[0].openings.some((o) => o.kind === 'revolve')).toBe(true);
  });

  it('廢墟（廢棄工廠、廢校）：弄舊的結果每次相同，牆上有貼牆素材', () => {
    for (const id of ['abandoned-factory', 'abandoned-school']) {
      const strip = (fs: Floor[]) =>
        fs.map((f) => [f.openings.map((o) => o.kind), f.items.map((i) => [i.t, i.x, i.y])]);
      expect(strip(build(id)), id).toEqual(strip(build(id)));
      const fs = build(id);
      expect(
        fs.flatMap((f) => f.openings).some((o) => o.kind === 'brokenwin' || o.kind === 'boarded'),
        id,
      ).toBe(true);
      expect(fs.flatMap((f) => f.items).filter((i) => ASSET[i.t]?.wall).length, id).toBeGreaterThan(
        3,
      );
    }
  });

  it('地下停車場：停車格的方向跟著車頭（北排 0°、南排 180°，擋輪桿在車頭那一邊；2026-10-22 依 7.18）', () => {
    for (const f of build('parking').filter((x) => x.name !== '1F')) {
      const stalls = f.items.filter((i) => i.t === 'parking_stall');
      const cars = f.items.filter((i) => ['car', 'van', 'suv'].includes(i.t));
      expect(cars.length, f.name).toBeGreaterThan(0);
      /* 停在格子裡的車（B1 南排最東邊那台停在格子外面）：格子和車同一個方向 */
      const parked = cars.filter((c) => stalls.some((x) => rectContains(x, c)));
      expect(parked.length, f.name).toBeGreaterThan(0);
      for (const c of parked)
        expect(stalls.find((x) => rectContains(x, c))?.rot, `${f.name} ${c.t}(${c.x},${c.y})`).toBe(
          c.rot,
        );
      expect(stalls.filter((s) => s.y < 10).every((s) => s.rot === 0)).toBe(true);
      expect(stalls.filter((s) => s.y > 10).every((s) => s.rot === 180)).toBe(true);
    }
  });
});

/* ---------- 2026-10-22 依 7.18 整個重新設計的 5 個範本（和原作的範本太像） ---------- */

describe('重新設計的範本（7.18）：洋館、太空船、古城、神社、地下迷宮', () => {
  const named = (fs: Floor[]) =>
    fs.flatMap((f) => f.rooms.filter((r) => !r.hideLabel).map((r) => `${f.name}/${r.name}`));
  const linkOf = (f: Floor, t: string) => f.items.filter((i) => i.t === t).map(linkKey);

  it('洋館：L 形的 B1／1F／2F；禮拜堂、玻璃溫室、傭人用的後樓梯（三層對齊）；食品庫的暗門 → 祕密通道 → 地下祭室（GM 專用），禮拜堂的地板暗門也對到地下祭室', () => {
    const [b1, g, u] = build('mansion');
    expect([b1.name, g.name, u.name]).toEqual(['B1', '1F', '2F']);
    expect(named([g])).toEqual(
      expect.arrayContaining([
        '1F/玄關大廳',
        '1F/會客室',
        '1F/吸菸室',
        '1F/禮拜堂',
        '1F/溫室',
        '1F/配膳室',
        '1F/後樓梯',
        '1F/管家室',
      ]),
    );
    expect(g.rooms.find((r) => r.name === '溫室')?.wall).toBe('glass');
    /* L 形：1F 室內的房間只佔外接框的八成以下（其餘是庭園） */
    const indoor = g.rooms.filter((r) => !CAT[r.cat].outdoor);
    const x0 = Math.min(...indoor.map((r) => r.x));
    const x1 = Math.max(...indoor.map((r) => r.x + r.w));
    const y0 = Math.min(...indoor.map((r) => r.y));
    const y1 = Math.max(...indoor.map((r) => r.y + r.h));
    const area = indoor.reduce((s, r) => s + r.w * r.h, 0);
    expect(area / ((x1 - x0) * (y1 - y0))).toBeLessThan(0.8);
    /* 後樓梯三層、大樓梯 1F～2F 位置相同 */
    const back = linkOf(b1, 'stairs');
    expect(back).toHaveLength(1);
    expect(linkOf(g, 'stairs')).toEqual(expect.arrayContaining(back));
    expect(linkOf(u, 'stairs')).toEqual(linkOf(g, 'stairs'));
    expect(b1.openings.filter((o) => o.kind === 'secret')).toHaveLength(1);
    expect(
      b1.rooms
        .filter((r) => r.gm && r.note)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['地下祭室', '祕密通道'].sort());
    const trap = (f: Floor) => f.items.find((i) => i.t === 'trapdoor') as Item;
    expect(trap(g).gm).toBe(true);
    expect(linkKey(trap(g))).toBe(linkKey(trap(b1)));
  });

  it('太空船：一層的環形；環狀走廊是一間大房間，交誼艙、水耕艙、廚房、補給倉庫、生物實驗室放在它裡面；焊死的第 7 實驗艙是 GM 專用', () => {
    const [f] = build('spaceship');
    const ring = f.rooms.find((r) => r.name === '環狀走廊') as Floor['rooms'][number];
    expect(
      f.rooms
        .filter((r) => r !== ring && rectContains(ring, r))
        .map((r) => r.name)
        .sort(),
    ).toEqual(['交誼艙', '廚房', '水耕艙', '生物實驗室', '補給倉庫'].sort());
    expect(f.rooms.find((r) => r.name === '第 7 實驗艙')?.gm).toBe(true);
    expect(f.openings.filter((o) => o.kind === 'sealed')).toHaveLength(1);
    expect(f.openings.some((o) => o.kind === 'platewin')).toBe(true);
    expect(f.openings.filter((o) => o.kind === 'auto').length).toBeGreaterThanOrEqual(6);
  });

  it('古城：B1～2F 主塔的螺旋梯三層對齊；外庭、內庭、門樓、堤道與湖；B1 暗門後的密道、祕密碼頭、地下水道是 GM 專用', () => {
    const fs = build('castle');
    expect(fs.map((f) => f.name)).toEqual(['B1', '1F', '2F']);
    const spiral = fs.map((f) => linkOf(f, 'spiral'));
    expect(spiral[0]).toHaveLength(1);
    expect(spiral[1]).toEqual(spiral[0]);
    expect(spiral[2]).toEqual(spiral[0]);
    expect(named([fs[1]])).toEqual(
      expect.arrayContaining(['1F/外庭', '1F/內庭', '1F/南門樓', '1F/堤道', '1F/湖', '1F/守衛廳']),
    );
    expect(fs[1].rooms.filter((r) => r.cat === 'water').length).toBeGreaterThan(1);
    expect(fs[0].openings.filter((o) => o.kind === 'secret')).toHaveLength(1);
    expect(
      fs[0].rooms
        .filter((r) => r.gm && r.note)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['密道', '祕密碼頭'].sort());
  });

  it('神社：沿著山坡的三段境內，之間是石垣與兩座石階；一排小鳥居通往稻荷社；封印的岩戶後面的岩屋是 GM 專用', () => {
    const [f] = build('shrine');
    expect(named([f])).toEqual(
      expect.arrayContaining([
        '1F/下段境內',
        '1F/中段境內',
        '1F/上段境內',
        '1F/磐座',
        '1F/外陣',
        '1F/內陣',
        '1F/緣側',
        '1F/稻荷社',
      ]),
    );
    expect(f.walls.filter((w) => w.kind === 'stone').length).toBeGreaterThanOrEqual(4);
    expect(f.items.filter((i) => i.t === 'ext_stairs')).toHaveLength(2);
    expect(f.items.filter((i) => i.t === 'torii').length).toBeGreaterThanOrEqual(9);
    expect(f.openings.filter((o) => o.kind === 'sealed')).toHaveLength(1);
    const cave = f.rooms.filter((r) => r.name === '岩屋');
    expect(cave.length).toBeGreaterThan(0);
    expect(cave.every((r) => r.gm)).toBe(true);
  });

  it('地下迷宮：只有 B1；迴廊是一間大房間，房間都放在它裡面（沒蓋到的格子是往內捲的迴廊）；地底河與石橋、暗門、封印的門後的玄室（GM 專用）', () => {
    const fs = build('dungeon');
    expect(fs.map((f) => f.name)).toEqual(['B1']);
    const [f] = fs;
    const hall = f.rooms.find((r) => r.name === '迴廊') as Floor['rooms'][number];
    expect(
      f.rooms.filter((r) => r !== hall && rectContains(hall, r)).length,
    ).toBeGreaterThanOrEqual(13);
    expect(f.rooms.find((r) => r.name === '地底河')?.cat).toBe('water');
    expect(f.items.some((i) => i.t === 'stone_bridge')).toBe(true);
    expect(f.openings.filter((o) => o.kind === 'secret')).toHaveLength(1);
    expect(f.openings.filter((o) => o.kind === 'sealed')).toHaveLength(1);
    expect(f.rooms.find((r) => r.name === '玄室')?.gm).toBe(true);
  });
});
