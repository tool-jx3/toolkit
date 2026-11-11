/**
 * 聚光（第五批；參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的「スポットライト焦点」，規格 F134）：
 * 只強調一個泳道、一個地點或真相，其他的淡化。時間切片打開時，那一刻沒有在進行的也淡化。
 * 選項與比對都只用這個檢視看得到的資料（PL 檢視不會出現真相的地點；指到這個檢視沒有的值時＝沒有聚光）。純計算。
 */
import { covers, placeKey } from './alibi';
import { eventSpan } from './layout';
import type { VisibleDoc, VisibleEvent, VisibleLink } from './visible';

/** ''＝沒有聚光；'truth'＝真相；'lane:<泳道 id>'；'place:<地點>' */
export type Spot = string;

export interface SpotOption {
  value: Spot;
  label: string;
  group: 'all' | 'truth' | 'lane' | 'place';
}

/** 這個檢視有沒有「真相」可以強調（GM 檢視；PL 檢視要有看得到的真相或調查後公開的事件） */
function hasTruthLike(vdoc: VisibleDoc): boolean {
  if (vdoc.audience === 'gm')
    return vdoc.events.some((e) => e.scope || e.gm || e.opened) || !!vdoc.truths?.length;
  return !!vdoc.truths?.length || vdoc.events.some((e) => e.opened);
}

/** 看得到的地點（事件與看得到的真相；同樣的地點只列一次，用第一次出現的寫法；依時間軸上的順序） */
export function spotPlaces(vdoc: VisibleDoc): string[] {
  const out = new Map<string, string>();
  for (const e of [...vdoc.events, ...(vdoc.truths ?? [])]) {
    const p = e.place.trim();
    if (!p || e.masked) continue;
    const k = placeKey(p);
    if (!out.has(k)) out.set(k, p);
  }
  return [...out.values()];
}

/** 聚光的選項（labels：真相、泳道、地點的寫法） */
export function spotOptions(
  vdoc: VisibleDoc,
  labels: {
    none: string;
    truth: string;
    lane: (name: string) => string;
    place: (name: string) => string;
    untitled: string;
  },
): SpotOption[] {
  const out: SpotOption[] = [{ value: '', label: labels.none, group: 'all' }];
  if (hasTruthLike(vdoc)) out.push({ value: 'truth', label: labels.truth, group: 'truth' });
  for (const l of vdoc.lanes)
    out.push({
      value: `lane:${l.id}`,
      label: labels.lane(l.name.trim() || labels.untitled),
      group: 'lane',
    });
  for (const p of spotPlaces(vdoc))
    out.push({ value: `place:${placeKey(p)}`, label: labels.place(p), group: 'place' });
  return out;
}

/** 這個檢視裡有效的聚光（沒有這個選項時 ''） */
export function validSpot(vdoc: VisibleDoc, spot: Spot | undefined): Spot {
  if (!spot) return '';
  if (spot === 'truth') return hasTruthLike(vdoc) ? spot : '';
  if (spot.startsWith('lane:')) {
    const id = spot.slice(5);
    return vdoc.lanes.some((l) => l.id === id) ? spot : '';
  }
  if (spot.startsWith('place:')) {
    const k = spot.slice(6);
    return spotPlaces(vdoc).some((p) => placeKey(p) === k) ? spot : '';
  }
  return '';
}

/** 聚光的比對（沒有聚光時 null＝全部照常） */
export function spotMatcher(
  vdoc: VisibleDoc,
  raw: Spot | undefined,
): ((e: VisibleEvent) => boolean) | null {
  const spot = validSpot(vdoc, raw);
  if (!spot) return null;
  if (spot === 'truth') {
    const gm = vdoc.audience === 'gm';
    return (e) => !!e.truthOf || !!e.opened || (gm && (!!e.scope || e.gm));
  }
  if (spot.startsWith('lane:')) {
    const id = spot.slice(5);
    const lane = vdoc.lanes.find((l) => l.id === id);
    const ids = new Set([id, ...vdoc.lanes.filter((l) => l.parentId === id).map((l) => l.id)]);
    const name = lane?.name.trim() ?? '';
    return (e) => ids.has(e.laneId) || (!!name && !e.masked && e.people.includes(name));
  }
  const k = spot.slice(6);
  return (e) => !e.masked && !!e.place.trim() && placeKey(e.place) === k;
}

/** 聚光在泳道上時：那條泳道（與子泳道）的 id（列的名稱淡化用；其他聚光 null） */
export function spotLanes(vdoc: VisibleDoc, raw: Spot | undefined): Set<string> | null {
  const spot = validSpot(vdoc, raw);
  if (!spot.startsWith('lane:')) return null;
  const id = spot.slice(5);
  return new Set([id, ...vdoc.lanes.filter((l) => l.parentId === id).map((l) => l.id)]);
}

/** 時間切片的比對：v 這一刻正在進行的事件（背景也算） */
export function sliceMatcher(
  vdoc: VisibleDoc,
  v: number | null,
): ((e: VisibleEvent) => boolean) | null {
  if (v === null) return null;
  return (e) => {
    const s = eventSpan(vdoc.mode, e, vdoc);
    return !!s && covers({ ...s, point: e.kind === 'point' }, v);
  };
}

/**
 * 強調的事件（聚光與時間切片都要符合；兩個都沒有時 null＝全部照常）。
 * 回傳的是畫出來的那一筆的 id（真相是事件 id＋::truth）。
 */
export function litIds(
  vdoc: VisibleDoc,
  spot: Spot | undefined,
  sliceV: number | null,
): Set<string> | null {
  const a = spotMatcher(vdoc, spot);
  const b = sliceMatcher(vdoc, sliceV);
  if (!a && !b) return null;
  const out = new Set<string>();
  for (const e of [...vdoc.events, ...(vdoc.truths ?? [])])
    if ((!a || a(e)) && (!b || b(e))) out.add(e.id);
  return out;
}

/** 關聯線：一端強調的線照常（其他淡化） */
export const linkLit = (lit: ReadonlySet<string> | null, k: Pick<VisibleLink, 'from' | 'to'>) =>
  !lit || lit.has(k.from) || lit.has(k.to);
