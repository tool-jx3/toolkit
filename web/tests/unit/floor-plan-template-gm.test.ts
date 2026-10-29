/**
 * 室內平面圖：範本的後台類房間預設「只有 GM 看得到」（2026-10，原作 v1.12；規格 F225、D37）。
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

/**
 * 範本本來就寫死的 GM 專用房間（隱藏的密室…）。2026-10 第三批後半：新範本每個都有一間以上
 * （公寓鎖著的 B 戶整戶、研究所的 B2 整層、拼起來的洞室與地道是好幾塊）。
 */
const BUILT_IN: Record<string, string[]> = {
  /* 2026-10-22 依 7.18 重新設計：食品庫的暗門後面的祕密通道與地下祭室 */
  mansion: ['B1/地下祭室', 'B1/祕密通道'],
  library: ['B1/禁書庫'],
  /* 不規則的洞室由好幾塊長方形拼成：封印之間 3 塊 */
  cave: ['洞窟/封印之間', '洞窟/封印之間', '洞窟/封印之間'],
  cult: ['B1/獻祭室'],
  'abandoned-hospital': ['B1/祕密實驗室'],
  apartment: [
    '4F/B 主臥室',
    '4F/B 客廳',
    '4F/B 浴室',
    '4F/B 臥室',
    '4F/B 走道',
    '4F/B 陽台',
    '4F/B 餐廳',
  ],
  house: ['B1/密室'],
  sanheyuan: ['1F/暗間'],
  'japanese-house': ['B1/防空壕'],
  ryokan: ['2F/櫻之間'],
  speakeasy: ['B1/逃生地道', 'B1/逃生地道'],
  diner: ['1F/冷凍庫'],
  'hospital-annex': ['2F/特別病房'],
  lab: [
    'B2/收容室 A',
    'B2/收容室 B',
    'B2/收容室 C',
    'B2/樓梯・電梯',
    'B2/焚化室',
    'B2/紀錄室',
    'B2/觀察走廊',
  ],
  asylum: ['B1/特別治療室'],
  'club-building': ['2F/廢社的社辦'],
  museum: ['B1/未登錄品庫'],
  'funeral-home': ['1F/舊停柩室'],
  office: ['8F/社長的密室'],
  detective: ['2F/密室'],
  'shopping-street': ['1F/神壇後室'],
  'night-market': ['1F/鐵皮倉庫'],
  theatre: ['B1/奈落深處'],
  karaoke: ['1F/VIP 包廂'],
  gym: ['1F/舊三溫暖室'],
  station: ['B1/封閉的舊通道'],
  subway: ['B1/工作通道', 'B2/廢棄月台'],
  parking: ['B2/封鎖區'],
  ferry: ['B1/船底密艙'],
  factory: ['2F/密封儲藏室'],
  warehouse: ['1F/改裝貨櫃'],
  construction: ['1F/開挖區'],
  sewer: ['B1/祭壇空洞'],
  'military-base': ['B1/封鎖的實驗區'],
  prison: ['1F/獨居房'],
  shrine: ['1F/岩屋', '1F/岩屋'],
  church: ['B1/封印的納骨堂'],
  castle: ['B1/地下水道', 'B1/密道', 'B1/祕密碼頭'],
  campsite: ['1F/廢屋'],
  mine: ['B1/最深處', 'B1/最深處', 'B1/最深處'],
  'abandoned-factory': ['2F/密封儲藏室'],
  'abandoned-school': ['1F/準備室'],
  dungeon: ['B1/玄室'],
  spaceship: ['1F/第 7 實驗艙'],
  tavern: ['2F/密室'],
  'wizard-tower': ['3F/召喚室'],
};

/**
 * 預設 GM 專用的房間（第一批的 8 個範本 15 間＋第三批後半的新範本 56 間；2026-10-22 依 7.18 重新設計的
 * 洋館、神社、古城、太空船照新的格局重選；2026-10-29 跟進原作 v1.15 的健身房 2 間）
 */
const DEFAULTS: Record<string, string[]> = {
  mansion: ['1F/管家室', '2F/女僕房', 'B1/機房'],
  hotel: ['1F/廚房'],
  hospital: ['2F/器材室'],
  police: ['1F/備勤室', '1F/槍械室'],
  library: ['1F/館員辦公室', 'B1/倉庫', 'B1/機房'],
  temple: ['1F/廟公房'],
  cult: ['1F/後倉'],
  'abandoned-hospital': ['2F/器材室', 'B1/廢棄物間', 'B1/鍋爐室'],
  apartment: ['1F/洗衣店後場'],
  house: ['B1/機房'],
  'japanese-house': ['1F/女傭房'],
  ryokan: ['1F/員工室', '1F/廚房', '2F/備品室'],
  speakeasy: ['B1/撲克室'],
  diner: ['1F/員工休息室', '1F/廚房'],
  'hospital-annex': ['1F/機房', '1F/汙物室', '1F/遺體安置室', '2F/值班室'],
  lab: ['1F/警衛室', 'B1/監控室'],
  asylum: ['1F/廚房', '1F/藥局'],
  'club-building': ['1F/管理員室'],
  museum: ['1F/學藝員室', 'B1/機房', 'B1/燻蒸室'],
  'funeral-home': ['1F/冷藏室', '1F/遺體化妝室'],
  office: ['1F/機房', '1F/警衛室', '8F/伺服器室'],
  konbini: ['1F/倉庫', '1F/冷藏庫', '1F/員工休息室'],
  detective: ['1F/當舖倉庫', '2F/臥室'],
  theatre: ['1F/售票處', '1F/舞台監督室'],
  karaoke: ['1F/員工室', '1F/廚房'],
  gym: ['1F/員工室', '1F/儲藏室'],
  station: ['1F/售票處'],
  subway: ['B1/站務室'],
  parking: ['B2/機房'],
  ferry: ['1F/船員室', '2F/船長室', 'B1/機艙'],
  factory: ['1F/鍋爐室'],
  warehouse: ['1F/守衛亭'],
  'military-base': ['1F/彈藥庫'],
  prison: ['1F/監控室'],
  shrine: ['1F/內陣', '1F/宮司宅'],
  church: ['1F/臥室'],
  castle: ['2F/城主寢室', 'B1/衛兵室'],
  'abandoned-factory': ['1F/鍋爐室'],
  spaceship: ['1F/主機艙', '1F/指揮官寢室'],
  tavern: ['1F/廚房', '2F/老闆的房間'],
  'wizard-tower': ['2F/寢室'],
};

describe('範本的預設 GM 專用房間（F225、D37）', () => {
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

  it('共 73 間、41 個範本（第一批 15 間、8 個範本＋第三批後半 56 間、32 個範本＋健身房 2 間）', () => {
    const n = Object.values(DEFAULTS).reduce((s, a) => s + a.length, 0);
    expect(n).toBe(73);
    expect(Object.keys(GM_DEFAULT_ROOMS).sort()).toEqual(Object.keys(DEFAULTS).sort());
    expect(
      Object.values(GM_DEFAULT_ROOMS).reduce(
        (s, byFloor) => s + Object.values(byFloor).reduce((t, a) => t + a.length, 0),
        0,
      ),
    ).toBe(73);
    /* 第三批後半：新範本每個都有 GM 專用的房間（寫死的密室或預設的後台） */
    for (const t of TEMPLATES) {
      if (
        [
          'studio',
          'townhouse',
          'lodge',
          'hotel',
          'hospital',
          'school',
          'police',
          'temple',
          'ruined-house',
          'crime',
        ].includes(t.id)
      )
        continue;
      expect(gmNames(build(t.id)).length, t.id).toBeGreaterThan(0);
    }
  });
});
