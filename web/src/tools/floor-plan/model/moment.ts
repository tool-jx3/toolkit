/**
 * 事件前後（2026-11-12 參考 KIIN「マップ制作スタジオ」v3.0 的「状態差分」，規格 F329～F336、3.20）。
 *
 * 一張地圖有「事件前」「事件後」兩種狀態：
 * - 家具、文字、自由線、手畫的牆、門窗可以設出現的時機 `only`（只在事件前／只在事件後；沒有＝兩種都有）。
 * - 家具的「事件後倒下・翻亂」（`upset`）、門窗的「事件後破損」（`smashed`）只在事件後畫出來。
 * - 地圖的「事件後才停電」（`blackout`）：事件前沒有夜色，事件後照夜的暗度（沒設時 55%）。
 * - 房間不分狀態：兩種狀態的格局、牆一樣，匯出的圖用兩種狀態合起來的範圍（疊圖對得齊）。
 *
 * `momentFloor` 把一層整理成某一種狀態看得到的樣子（拿掉另一種狀態才有的東西；事件前拿掉 `upset`、`smashed`），
 * 之後照一般的規則（PL／GM 檢視、隱藏線索…）畫。沒有用到這些設定的樓層原樣傳回（輸出逐指令不變）。
 */
import { NIGHT_DEFAULT } from './catalog';
import type { Floor, Moment, Project } from './types';

export const MOMENTS: readonly Moment[] = ['before', 'after'];
export const isMoment = (v: unknown): v is Moment => v === 'before' || v === 'after';

/** 事件後沒設夜的暗度時用的暗度（同「夜的暗度 55%」的按鈕） */
export const BLACKOUT_NIGHT = NIGHT_DEFAULT;

/** 這張地圖目前顯示的狀態 */
export const momentOf = (p: Pick<Project, 'moment'>): Moment =>
  p.moment === 'after' ? 'after' : 'before';

/** 這個東西在這個狀態看得到嗎 */
export const shownIn = (o: { only?: Moment }, m: Moment): boolean => !o.only || o.only === m;

/** 這一層有沒有用到事件前後的設定 */
export function floorUsesMoments(f: Floor): boolean {
  return (
    f.items.some((i) => i.only || i.upset) ||
    f.openings.some((o) => o.only || o.smashed) ||
    f.walls.some((w) => w.only) ||
    f.texts.some((t) => t.only) ||
    !!f.lines?.some((l) => l.only)
  );
}

/** 這張地圖有沒有用到事件前後的設定（匯出的狀態、檔名、分享連結的狀態只在有用到時出現） */
export const usesMoments = (p: Pick<Project, 'floors' | 'blackout'>): boolean =>
  !!p.blackout || p.floors.some(floorUsesMoments);

/** 拿掉 `upset`、`smashed`（事件前的樣子） */
function calm<T extends { upset?: boolean; smashed?: boolean }>(o: T): T {
  if (!o.upset && !o.smashed) return o;
  const { upset: _u, smashed: _s, ...rest } = o;
  return rest as T;
}

/**
 * 這一層在某個狀態看得到的樣子。已經整理過的（`shownAt`）、沒有用到事件前後的照原樣傳回。
 * 事件前：拿掉只在事件後的東西與 `upset`、`smashed`；事件後：拿掉只在事件前的東西。
 */
export function momentFloor(f: Floor, m: Moment): Floor {
  if (f.shownAt || !floorUsesMoments(f)) return f;
  const keep = <T extends { only?: Moment }>(o: T) => shownIn(o, m);
  const before = m === 'before';
  return {
    ...f,
    walls: f.walls.filter(keep),
    openings: f.openings.filter(keep).map((o) => (before ? calm(o) : o)),
    items: f.items.filter(keep).map((i) => (before ? calm(i) : i)),
    texts: f.texts.filter(keep),
    ...(f.lines ? { lines: f.lines.filter(keep) } : {}),
    shownAt: m,
  };
}

/** 這個狀態的夜的暗度（事件後才停電：事件前沒有、事件後沒設時 55%） */
export function momentNight(p: Pick<Project, 'night' | 'blackout'>, m: Moment): number | undefined {
  if (!p.blackout) return p.night;
  return m === 'after' ? (p.night ?? BLACKOUT_NIGHT) : undefined;
}

/**
 * 整張地圖在某個狀態的樣子（演出、立體圖等拿整個專案的地方用）：每一層 `momentFloor`、夜的暗度換成這個狀態的值。
 * 沒有用到事件前後時原樣傳回。
 */
export function momentProject(p: Project, m: Moment): Project {
  if (!usesMoments(p)) return p;
  const { blackout: _b, night: _n, ...rest } = p;
  const night = momentNight(p, m);
  return {
    ...rest,
    ...(night ? { night } : {}),
    floors: p.floors.map((f) => momentFloor(f, m)),
  };
}

/**
 * 只剩一種狀態的地圖（PL 用的分享連結，F335）：另一種狀態才有的東西拿掉、`only` 拿掉（剩下的都看得到）；
 * 事件前拿掉 `upset`、`smashed`（是事件後才會發生的事，留著就是劇透）；停電換成這個狀態的夜的暗度；
 * 事件後的連結寫 `moment: 'after'`（打開時顯示事件後，倒下・破損照畫）。原本的地圖不動。
 */
export function singleMomentProject(p: Project, m: Moment): { project: Project; removed: number } {
  if (!usesMoments(p)) return { project: p, removed: 0 };
  let removed = 0;
  const strip = <T extends { only?: Moment }>(list: readonly T[]): T[] =>
    list.flatMap((o) => {
      if (!shownIn(o, m)) {
        removed++;
        return [];
      }
      if (!o.only) return [o];
      const { only: _o, ...rest } = o;
      return [rest as T];
    });
  const floors = p.floors.map((f): Floor => {
    const before = m === 'before';
    const out: Floor = {
      ...f,
      walls: strip(f.walls),
      openings: strip(f.openings).map((o) => (before ? calm(o) : o)),
      items: strip(f.items).map((i) => (before ? calm(i) : i)),
      texts: strip(f.texts),
    };
    if (f.lines) {
      const lines = strip(f.lines);
      if (lines.length) out.lines = lines;
      else delete out.lines;
    }
    return out;
  });
  const { blackout: _b, night: _n, moment: _m, ...rest } = p;
  const night = momentNight(p, m);
  return {
    project: {
      ...rest,
      ...(night ? { night } : {}),
      ...(m === 'after' ? { moment: 'after' as const } : {}),
      floors,
    },
    removed,
  };
}

/** 另一種狀態才有的東西的個數（分享對話框、匯出的說明用） */
export function momentOnlyCount(p: Pick<Project, 'floors'>, m: Moment): number {
  let n = 0;
  for (const f of p.floors)
    for (const list of [f.walls, f.openings, f.items, f.texts, f.lines ?? []])
      for (const o of list as { only?: Moment }[]) if (o.only && o.only !== m) n++;
  return n;
}
