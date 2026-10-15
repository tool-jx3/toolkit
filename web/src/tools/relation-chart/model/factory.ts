/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見上一層的 UPSTREAM_LICENSE。
 *
 * 新的角色、關係類型、關係線的預設值（原作的 addTag、新增角色的預設欄位）。
 */
import type { Char, Rel, RelType } from './types';

export const makeChar = (
  id: number,
  name: string,
  x: number,
  y: number,
  o: Partial<Char> = {},
): Char => ({
  id,
  name,
  x,
  y,
  defNo: 0,
  level: 0,
  locked: false,
  relIgnore: false,
  color: 'auto',
  nameColor: 'auto',
  avatar: null,
  icon: null,
  noAvatar: false,
  shape: '',
  noBorder: false,
  noBg: false,
  borderOn: false,
  bgOn: false,
  size: null,
  nameSize: null,
  borderW: null,
  labels: [],
  ...o,
});

export const makeType = (id: number, label: string, o: Partial<RelType> = {}): RelType => ({
  id,
  label,
  color: 'auto',
  outlineColor: 'auto',
  lineStyle: 'solid',
  capStyle: 'arrow',
  lineW: null,
  outlineW: null,
  mag: 3,
  hidden: false,
  hideInLegend: false,
  pairSkip: false,
  ...o,
});

export const makeRel = (
  id: number,
  from: number,
  to: number,
  type: number,
  o: Partial<Rel> = {},
): Rel => ({
  id,
  from,
  to,
  type,
  both: false,
  note: '',
  labelT: null,
  curveDir: 0,
  flipName: false,
  flipNote: false,
  pairSkip: false,
  mag: 0,
  selfAng: null,
  ...o,
});

/** 「未命名關係 N」（N＝目前最大的編號＋1） */
export function unnamedTypeLabel(types: readonly RelType[]): string {
  const prefix = '未命名關係';
  let max = 0;
  for (const t of types) {
    if (!t.label.startsWith(prefix)) continue;
    const rest = t.label.slice(prefix.length).trim();
    if (/^\d+$/.test(rest)) max = Math.max(max, Number.parseInt(rest, 10));
  }
  return `${prefix}${max + 1}`;
}

/** 複製關係類型的名稱：「名稱（複製 N）」（N＝已有的最大編號＋1） */
export function copyTypeLabel(label: string, types: readonly RelType[]): string {
  const rawBase = String(label || '')
    .replace(/\s*(（複製\d*）)+$/, '')
    .trim();
  const base = rawBase || String(label || '未命名關係').trim();
  const escBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escBase}（複製(\\d+)?）$`);
  let maxNo = 0;
  for (const t of types) {
    const m = String(t.label || '').match(re);
    if (m) {
      const n = m[1] ? Number(m[1]) || 0 : 1;
      if (n > maxNo) maxNo = n;
    }
  }
  return `${base}（複製${maxNo + 1}）`;
}

/** 複製角色時的名字：結尾數字＋1（沒有數字的接 2） */
export function copyName(name: string, existing: readonly { name: string }[]): string {
  if (!name) return '';
  const b = name.replace(/\d+$/, '') || name;
  let m = 1;
  for (const k of existing) {
    if (!k.name?.startsWith(b)) continue;
    const rest = k.name.slice(b.length);
    if (rest === '') m = Math.max(m, 1);
    else if (/^\d+$/.test(rest)) m = Math.max(m, Number.parseInt(rest, 10));
  }
  return b + (m + 1);
}
