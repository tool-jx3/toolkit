/**
 * 室內平面圖的範本（規格 D2）：每個範本都畫得出來、門窗都在牆上、房間不會半重疊、上下樓的樓梯與電梯對齊、
 * 「只載入格局」「放入隱藏線索」、廢墟的處理固定（同樣的種子同樣的結果）、範本的分類涵蓋規定的類型。
 */
import { describe, expect, it } from 'vitest';
import { ASSET, VERTICAL_LINKS } from '@/tools/floor-plan/model/assets';
import { rectContains, rectsOverlap } from '@/tools/floor-plan/model/geometry';
import type { Floor } from '@/tools/floor-plan/model/types';
import { wallLines } from '@/tools/floor-plan/model/walls';
import { getTemplate, instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { wrapClueText } from '@/tools/floor-plan/templates/clues';

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

  it('門窗都在牆上（自動牆或手畫的牆）', () => {
    for (const f of floors) {
      const lines = wallLines(f);
      for (const o of f.openings) {
        const line = o.o === 'h' ? o.y : o.x;
        const a = o.o === 'h' ? o.x : o.y;
        const onWall = lines.some(
          (r) =>
            r.o === o.o &&
            Math.abs(r.c - line) < 1e-6 &&
            a >= r.a - 1e-6 &&
            a + o.len <= r.b + 1e-6,
        );
        expect(onWall, `${f.name} ${o.kind} @${o.o}${o.x},${o.y}`).toBe(true);
      }
    }
  });

  it('房間不會半重疊（不是分開就是完全包在裡面）', () => {
    for (const f of floors)
      for (let i = 0; i < f.rooms.length; i++)
        for (let j = i + 1; j < f.rooms.length; j++) {
          const a = f.rooms[i];
          const b = f.rooms[j];
          if (!rectsOverlap(a, b)) continue;
          expect(rectContains(a, b) || rectContains(b, a), `${f.name}: ${a.name} / ${b.name}`).toBe(
            true,
          );
        }
  });

  it('上下相鄰的樓層，樓梯與電梯至少有一座位置相同', () => {
    for (let i = 1; i < floors.length; i++) {
      const key = (f: Floor) =>
        f.items
          .filter((it) => VERTICAL_LINKS.has(it.t))
          .map((it) => `${it.x},${it.y},${it.w},${it.h}`);
      const below = new Set(key(floors[i - 1]));
      expect(
        key(floors[i]).some((k) => below.has(k)),
        `${floors[i - 1].name}→${floors[i].name}`,
      ).toBe(true);
    }
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
    expect(new Set(TEMPLATES.map((t) => t.group))).toEqual(new Set(['home', 'facility', 'ruins']));
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
