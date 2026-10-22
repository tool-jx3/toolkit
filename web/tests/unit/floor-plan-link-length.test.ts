// @vitest-environment jsdom
/**
 * 室內平面圖：分享連結的長度（規格 3.7、D30、D41、7.13）。規格寫的字數由這個測試量；範本或欄位改了、數字變了，
 * 先照測試的結果更正規格 3.7、D41 的數字再改這裡。
 *
 * 量法（和人在畫面上看到的「內容 N 字」同一條路）：開頁的地圖（彩色、面積不顯示）→ 範本對話框的載入
 * （`loadTemplate`，格局＋家具，放入隱藏線索與否看各項）→ 分享對話框用的 `encodeMapHash`，取 # 後面的字數。
 * 「完整」＝GM 用的完整連結，「PL 用」＝拿掉 GM 專用的東西與隱藏線索的連結。
 * 房間編號＝每一層都按過「替這一層的房間編號」。
 * （D30 的舊數字是用 `instantiateTemplate` 直接組地圖量的：專案名稱、面積顯示不同，會差幾個字。）
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as act from '@/tools/floor-plan/editor/actions';
import { starterProject, useProject } from '@/tools/floor-plan/editor/store';
import { encodeMapHash, SHARE_MAX_LENGTH } from '@/tools/floor-plan/model/share';
import { TEMPLATES } from '@/tools/floor-plan/templates';

const length = (mode: 'full' | 'pl') => encodeMapHash(useProject.getState().data, mode).length;

/** 開新的頁面 → 載入範本 */
function loadFresh(id: string, clues: boolean): void {
  useProject.getState().replace(starterProject());
  act.loadTemplate(id, { structureOnly: false, clues });
}

/** 每一層都按「替這一層的房間編號」 */
function numberEveryFloor(): void {
  const n = useProject.getState().data.floors.length;
  for (let i = 0; i < n; i++) {
    useProject.getState().update((p) => {
      p.active = i;
    });
    act.numberRoomsOnFloor();
  }
}

interface Row {
  id: string;
  /** 完整連結（沒放隱藏線索） */
  full: number;
  /** PL 用連結 */
  pl: number;
  /** 完整連結（放入隱藏線索） */
  fullClues: number;
  /** 放入隱藏線索、每一層都編號：完整 */
  fullNumbered: number;
  /** 放入隱藏線索、每一層都編號：PL 用 */
  plNumbered: number;
}

const rows: Row[] = [];

beforeAll(() => {
  act.bindUi(
    () => {},
    async () => true,
    null,
  );
  for (const t of TEMPLATES) {
    loadFresh(t.id, false);
    const full = length('full');
    const pl = length('pl');
    loadFresh(t.id, true);
    const fullClues = length('full');
    numberEveryFloor();
    rows.push({
      id: t.id,
      full,
      pl,
      fullClues,
      fullNumbered: length('full'),
      plNumbered: length('pl'),
    });
  }
});

const range = (pick: (r: Row) => number): [number, number] => {
  const v = rows.map(pick);
  return [Math.min(...v), Math.max(...v)];
};

describe('分享連結的長度（3.7、D41）', () => {
  it('56 個範本都量到了（2026-10 第三批後半 15 → 56）；最短是套房、最長是洋館（2026-10-22 依 7.18 重新設計後仍是洋館）', () => {
    expect(rows.map((r) => r.id)).toEqual(TEMPLATES.map((t) => t.id));
    expect(rows).toHaveLength(56);
    const by = (pick: (r: Row) => number, f: (...n: number[]) => number) =>
      rows.find((r) => pick(r) === f(...rows.map(pick)))?.id;
    expect(by((r) => r.full, Math.min)).toBe('studio');
    expect(by((r) => r.full, Math.max)).toBe('mansion');
    /* PL 用連結最短的是便利商店（後場三間預設 GM 專用，只剩牆框） */
    expect(by((r) => r.pl, Math.min)).toBe('konbini');
  });

  it('完整連結 944～4,213 字（放入隱藏線索 1,196～4,568；2026-10-22 依 7.19 換了線索文字，最短的套房 1,182 → 1,196）；PL 用連結 942～3,421 字', () => {
    expect(range((r) => r.full)).toEqual([944, 4213]);
    expect(range((r) => r.fullClues)).toEqual([1196, 4568]);
    expect(range((r) => r.pl)).toEqual([942, 3421]);
  });

  it('放入隱藏線索後每一層都「依序編號」：完整 1,274～4,882（7.19 之前 1,258）、PL 用 1,012～3,684 字；上限 8,000 字約是最長的 1.6 倍', () => {
    expect(range((r) => r.fullNumbered)).toEqual([1274, 4882]);
    expect(range((r) => r.plNumbered)).toEqual([1012, 3684]);
    for (const r of rows)
      for (const n of [r.full, r.fullClues, r.pl, r.fullNumbered, r.plNumbered])
        expect(n, r.id).toBeLessThan(SHARE_MAX_LENGTH);
    expect(SHARE_MAX_LENGTH / 4882).toBeCloseTo(1.6, 1);
  });

  describe('洋館（完整、沒放隱藏線索）', () => {
    const data = () => useProject.getState().data;
    const select = (active: number) =>
      useProject.getState().update((p) => {
        p.active = active;
      });
    const stoneEverywhere = () =>
      useProject.getState().update((p) => {
        for (const f of p.floors) for (const r of f.rooms) r.wall = 'stone';
      });

    it('4,213 字；B1、1F、2F 共 44 間房（2026-10-22 依 7.18 重新設計；庭園的拼接小塊也算）；載入後選著的是 1F', () => {
      loadFresh('mansion', false);
      expect(length('full')).toBe(4213);
      expect(data().floors.map((f) => f.name)).toEqual(['B1', '1F', '2F']);
      expect(data().floors.reduce((n, f) => n + f.rooms.length, 0)).toBe(44);
      expect(data().active).toBe(1);
    });

    it('B1 打開「顯示內部」＋24 字（載入後從 1F 切到 B1 再打開；連結裡有 active，這個範本選著的樓層變了本身不差字數，同樣選著 B1 量也是＋24）', () => {
      loadFresh('mansion', false);
      const base = length('full');
      select(0);
      const onB1 = length('full') - base;
      act.setShowInside(true);
      /* showInside＋疊上來的樓層（1F）的順序 */
      expect(data().floors[0]).toMatchObject({ showInside: true, inside: data().floors[1].id });
      expect(length('full') - base).toBe(24);
      loadFresh('mansion', false);
      select(0);
      const baseB1 = length('full');
      expect(baseB1 - base).toBe(onB1);
      act.setShowInside(true);
      expect(length('full') - baseB1).toBe(24);
    });

    it('44 間房都設石牆＋16 字；先開再關「顯示內部」（疊上來的樓層的選擇留在資料裡）之後再設是＋27 字', () => {
      loadFresh('mansion', false);
      const base = length('full');
      stoneEverywhere();
      expect(length('full') - base).toBe(16);
      /* 驗證者的順序：切到 B1 → 開 → 關 →（房間都設石牆）；關掉之後 `inside` 還在，加上選著的樓層變了，一共比單獨設多 11 字 */
      loadFresh('mansion', false);
      select(0);
      act.setShowInside(true);
      act.setShowInside(false);
      expect(data().floors[0].inside).toBe(data().floors[1].id);
      stoneEverywhere();
      expect(length('full') - base).toBe(27);
    });
  });
});
