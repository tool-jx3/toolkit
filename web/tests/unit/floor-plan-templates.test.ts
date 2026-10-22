/**
 * 室內平面圖的範本（規格 D10、F191～F194）：每個範本都畫得出來、「只載入格局」「放入隱藏線索」、
 * 廢墟的處理固定（同樣的種子同樣的結果）、範本的分類涵蓋規定的類型。
 *
 * 格局規則（F194）每個範本、每一層都檢查：門窗都在牆上、房間不會半重疊（巢狀的完全包在裡面）、
 * 上下相鄰的樓層至少一座樓梯或電梯位置相同、門的開門範圍（弧線掃過的扇形）與門前一格不放家具、每間房都走得到。
 */
import { describe, expect, it } from 'vitest';
import { ASSET } from '@/tools/floor-plan/model/assets';
import { emptyFloor, rectContains, rectsOverlap } from '@/tools/floor-plan/model/geometry';
import { groundFloorIndex } from '@/tools/floor-plan/model/ops';
import type { Floor, Item } from '@/tools/floor-plan/model/types';
import { computeWalls } from '@/tools/floor-plan/model/walls';
import {
  getTemplate,
  instantiateTemplate,
  TEMPLATE_GROUPS,
  TEMPLATES,
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
    /* 每條線索都找得到空位：不疊在別的家具上（2026-10） */
    for (const f of withClues) expect(cluesOnFurniture(f), f.name).toEqual([]);
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

  it('2026-10 增補：學校、警察局、寺廟、洞窟、山中小屋、圖書館、地下教團據點；分類（F190、D17）', () => {
    const group = (id: string) => getTemplate(id)?.group;
    expect(TEMPLATE_GROUPS.map((g) => g.name)).toEqual([
      '住宅',
      '公共場所',
      '野外・地下',
      '廢墟・事件',
    ]);
    expect(['studio', 'townhouse', 'mansion', 'lodge'].map(group)).toEqual(Array(4).fill('home'));
    expect(['hotel', 'hospital', 'school', 'police', 'library', 'temple'].map(group)).toEqual(
      Array(6).fill('public'),
    );
    expect(['cave', 'cult'].map(group)).toEqual(['wild', 'wild']);
    expect(['abandoned-hospital', 'ruined-house', 'crime'].map(group)).toEqual(
      Array(3).fill('ruins'),
    );
    /* 開頁載入第一個範本（F01），範本依分類的順序排 */
    expect(TEMPLATES[0].id).toBe('studio');
    const order = TEMPLATE_GROUPS.map((g) => g.id);
    const groups = TEMPLATES.map((t) => order.indexOf(t.group));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(TEMPLATES).toHaveLength(15);
    /* 恐怖調查樣式：廢墟（命案現場除外）與地下教團據點 */
    expect(TEMPLATES.filter((t) => t.theme === 'horror').map((t) => t.id)).toEqual([
      'cult',
      'abandoned-hospital',
      'ruined-house',
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

  it('洋館的密室是 GM 專用、用暗門連到酒窖；廢墟的處理每次相同', () => {
    const m = build('mansion');
    const b1 = m.find((f) => f.name === 'B1') as Floor;
    expect(b1.rooms.find((r) => r.name === '密室')?.gm).toBe(true);
    expect(b1.openings.some((o) => o.kind === 'secret')).toBe(true);
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

  it('長的線索說明斷成兩行（靠近中間的標點，沒有時正中間）', () => {
    expect(wrapClueText('短短的')).toBe('短短的');
    expect(wrapClueText('被撕下的、住宿登記表')).toBe('被撕下的、\n住宿登記表');
    expect(wrapClueText('一二三四五六七八')).toBe('一二三四\n五六七八');
  });
});
