/**
 * 室內平面圖：範本的後台類房間預設「只有 GM 看得到」（2026-10，原作 v1.12；規格 F225、D34）。
 *
 * 規則：照範本裡的標記（GM_DEFAULT_ROOMS：範本 id → 樓層 → 房間名稱），不照房間種類——同樣是「辦公」，
 * 警察局的所長室有線索、要讓 PL 逛，圖書館的館員辦公室才是員工區。
 * 對象是員工區、機房、後台、私室這類「第一次走進去不該一眼就看到」的地方；有線索的房間與一進門就看得到的房間不放。
 */
import { describe, expect, it } from 'vitest';
import { visibleFloor } from '@/tools/floor-plan/model/geometry';
import type { Floor } from '@/tools/floor-plan/model/types';
import { getTemplate, instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { GM_DEFAULT_ROOMS } from '@/tools/floor-plan/templates/gmDefaults';

const build = (id: string, opts = {}) => instantiateTemplate(id, opts) as Floor[];
const gmNames = (floors: Floor[]) =>
  floors.flatMap((f) => f.rooms.filter((r) => r.gm).map((r) => `${f.name}/${r.name}`)).sort();

/** 範本本來就寫死的 GM 專用房間（隱藏的密室…） */
const BUILT_IN: Record<string, string[]> = {
  mansion: ['B1/密室'],
  library: ['B1/禁書庫'],
  /* 不規則的洞室由好幾塊長方形拼成：封印之間 3 塊 */
  cave: ['洞窟/封印之間', '洞窟/封印之間', '洞窟/封印之間'],
  cult: ['B1/獻祭室'],
  'abandoned-hospital': ['B1/祕密實驗室'],
};

/** 預設 GM 專用的房間（這一批新加的） */
const DEFAULTS: Record<string, string[]> = {
  mansion: ['1F/傭人房', 'B1/鍋爐室'],
  hotel: ['1F/廚房'],
  hospital: ['2F/器材室'],
  police: ['1F/備勤室', '1F/槍械室'],
  library: ['1F/館員辦公室', 'B1/倉庫', 'B1/機房'],
  temple: ['1F/廟公房'],
  cult: ['1F/後倉'],
  'abandoned-hospital': ['2F/器材室', 'B1/廢棄物間', 'B1/鍋爐室'],
};

describe('範本的預設 GM 專用房間（F225、D34）', () => {
  it('標記表裡的每個範本、樓層、房間都存在，而且同一層的房間名稱只有一間（不會標錯）', () => {
    for (const [id, byFloor] of Object.entries(GM_DEFAULT_ROOMS)) {
      expect(getTemplate(id), id).toBeTruthy();
      const raw = getTemplate(id)?.build() ?? [];
      for (const [floor, names] of Object.entries(byFloor)) {
        const f = raw.find((x) => x.name === floor);
        expect(f, `${id} ${floor}`).toBeTruthy();
        for (const n of names)
          expect(
            f?.rooms.filter((r) => r.name === n),
            `${id} ${floor} ${n}`,
          ).toHaveLength(1);
      }
    }
  });

  it('載入範本後，標記的房間 gm: true，其他房間照舊（原本的密室仍是 GM 專用）', () => {
    for (const t of TEMPLATES) {
      const want = [...(BUILT_IN[t.id] ?? []), ...(DEFAULTS[t.id] ?? [])].sort();
      expect(gmNames(build(t.id)), t.id).toEqual(want);
    }
  });

  it('沒有標記的範本（套房、命案現場、透天厝…）載入的結果和以前完全一樣：沒有任何房間有 gm', () => {
    for (const id of ['studio', 'crime', 'townhouse', 'lodge', 'school', 'ruined-house']) {
      for (const f of build(id))
        for (const r of f.rooms) expect(r.gm, `${id} ${r.name}`).toBeUndefined();
    }
    /* 沒有任何欄位被動到：標記的房間以外，房間的資料和範本原始的一樣 */
    for (const t of TEMPLATES) {
      const raw = t.build();
      const got = build(t.id);
      raw.forEach((f, i) => {
        const marked = GM_DEFAULT_ROOMS[t.id]?.[f.name] ?? [];
        f.rooms.forEach((r, j) => {
          const g = got[i].rooms[j];
          const { id: _id, ...rest } = g;
          expect(rest, `${t.id} ${f.name} ${r.name}`).toEqual(
            marked.includes(r.name) ? { ...r, gm: true } : r,
          );
        });
        expect(got[i].items.length).toBe(f.items.length);
        expect(got[i].openings.length).toBe(f.openings.length);
        expect(got[i].texts.length).toBe(f.texts.length);
      });
    }
  });

  it('只載入格局、放入隱藏線索時也一樣；線索不會放進預設 GM 專用的房間', () => {
    for (const t of TEMPLATES) {
      const want = [...(BUILT_IN[t.id] ?? []), ...(DEFAULTS[t.id] ?? [])].sort();
      expect(gmNames(build(t.id, { structureOnly: true })), `${t.id} 格局`).toEqual(want);
      expect(gmNames(build(t.id, { clues: true })), `${t.id} 線索`).toEqual(want);
      const marked = new Set(
        Object.entries(GM_DEFAULT_ROOMS[t.id] ?? {}).flatMap(([f, ns]) =>
          ns.map((n) => `${f}/${n}`),
        ),
      );
      for (const c of t.clues)
        expect(marked.has(`${c.floor}/${c.room}`), `${t.id} ${c.room}`).toBe(false);
    }
  });

  it('PL 檢視：預設 GM 專用的房間只剩牆框（沒有名字），裡面的家具藏起來', () => {
    for (const [id, names] of Object.entries(DEFAULTS)) {
      const floors = build(id);
      for (const n of names) {
        const [fl, name] = n.split('/');
        const f = floors.find((x) => x.name === fl) as Floor;
        const r = f.rooms.find((x) => x.name === name);
        expect(r?.gm, n).toBe(true);
        const v = visibleFloor(f, true, true);
        const shown = v.rooms.find((x) => x.id === r?.id);
        expect(shown?.masked, n).toBe(true);
        expect(shown?.name, n).toBe('');
        /* 房間裡（中心在裡面）的家具在 PL 檢視裡都不見 */
        if (r)
          for (const it of v.items)
            expect(
              it.x + it.w / 2 > r.x &&
                it.x + it.w / 2 < r.x + r.w &&
                it.y + it.h / 2 > r.y &&
                it.y + it.h / 2 < r.y + r.h,
              `${n} ${it.t}`,
            ).toBe(false);
      }
    }
  });

  it('標記的房間名字都會顯示（不是不顯示名字的拼接小塊），而且不在線索的房間裡', () => {
    for (const [id, byFloor] of Object.entries(GM_DEFAULT_ROOMS)) {
      for (const f of build(id)) {
        for (const n of byFloor[f.name] ?? []) {
          const r = f.rooms.find((x) => x.name === n);
          expect(r?.hideLabel, `${id} ${n}`).toBeFalsy();
          expect(r?.noWall, `${id} ${n}`).toBeFalsy();
        }
      }
    }
  });

  it('共 14 間、8 個範本', () => {
    const n = Object.values(DEFAULTS).reduce((s, a) => s + a.length, 0);
    expect(n).toBe(14);
    expect(Object.keys(GM_DEFAULT_ROOMS).sort()).toEqual(Object.keys(DEFAULTS).sort());
    expect(
      Object.values(GM_DEFAULT_ROOMS).reduce(
        (s, byFloor) => s + Object.values(byFloor).reduce((t, a) => t + a.length, 0),
        0,
      ),
    ).toBe(14);
  });
});
