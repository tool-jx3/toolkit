/**
 * 角色清單的純邏輯（色票櫃與配色卡共用；不依賴 React 與 DOM）：部位的顏色、雙色與異色瞳、色系、
 * 色票櫃的排序與分組、複製色碼的文字、新增角色時的部位、色碼表與色票櫃 PNG 的內容。
 * 規格：docs/refactor/specs/color-palette.md 1.1～1.3。
 */
import { cieLightness, parseColor } from '@/core/color';
import { COLOR_FAMILIES, colorFamily } from '@/core/colornames';
import {
  type Bar,
  barOf,
  type FamilyKey,
  LIMITS,
  MAX_BARS,
  newId,
  type PartRole,
  type Segment,
  type ShelfSort,
  segmentOf,
} from './logic';

/** 色票櫃上有色塊、會排序與分組的部位 */
export type KeyRole = 'hair' | 'eye';

/** 一個顏色（「無」也算一個，但沒有色碼） */
export interface PartColor {
  color: string;
  none: boolean;
}

/** 某個部位的所有顏色（依清單順序） */
export function roleColors(bar: Pick<Bar, 'segments'>, role: PartRole): PartColor[] {
  return bar.segments
    .filter((s) => s.role === role)
    .map((s) => ({ color: s.color, none: !!s.none }));
}

/** 真的有顏色的（不是「無」） */
export const realColors = (list: readonly PartColor[]): string[] =>
  list.filter((c) => !c.none).map((c) => c.color);

/** 雙色（髮色）／異色瞳（瞳色）：真的有顏色的有兩個以上（和原作相同；「無」不算） */
export function isMultiColor(bar: Pick<Bar, 'segments'>, role: KeyRole): boolean {
  return realColors(roleColors(bar, role)).length >= 2;
}

/** 這個部位用的色系清單：髮色有「雙色」、瞳色有「異色瞳」，最後是「其他」 */
export function familiesFor(role: KeyRole): FamilyKey[] {
  return [...COLOR_FAMILIES, role === 'hair' ? 'twotone' : 'oddeye', 'other'];
}

/**
 * 自動判斷的色系：沒有這個部位時 null；只有「無」時「其他」；兩色以上時雙色／異色瞳；其他依第一個顏色。
 */
export function autoFamily(list: readonly PartColor[], role: KeyRole): FamilyKey | null {
  if (!list.length) return null;
  const real = realColors(list);
  if (!real.length) return 'other';
  if (real.length > 1) return role === 'hair' ? 'twotone' : 'oddeye';
  return colorFamily(real[0]);
}

/** 色系（有手動指定時用指定的；沒有這個部位時 null） */
export function familyOf(bar: Bar, role: KeyRole): FamilyKey | null {
  const list = roleColors(bar, role);
  if (!list.length) return null;
  const manual = role === 'hair' ? bar.hairFamily : bar.eyeFamily;
  if (manual && familiesFor(role).includes(manual)) return manual;
  return autoFamily(list, role);
}

/** 第一個真的有顏色的（排序、代表色的退路用） */
const firstReal = (list: readonly PartColor[]): string | null => realColors(list)[0] ?? null;

/**
 * 「亮度」排序與代表色的退路：代表色 → 第一個髮色 → 第一個有顏色的部位。都沒有時 null。
 */
export function keyColorOf(bar: Bar): string | null {
  if (bar.theme && parseColor(bar.theme)) return bar.theme;
  const hair = firstReal(roleColors(bar, 'hair'));
  if (hair) return hair;
  return bar.segments.find((s) => !s.none)?.color ?? null;
}

const lightness = (hex: string | null) => (hex ? cieLightness(hex) : -1);

const collator = new Intl.Collator('zh-Hant-TW', { numeric: true, sensitivity: 'base' });

/**
 * 色票櫃的排序（同分時保持清單的順序）：
 * - light：代表色（沒有時用髮色、再沒有時用第一個部位）的明度由亮到暗；都沒有的放最後。
 * - hair／eye：色系的順序（紅 → … → 白 → 雙色／異色瞳 → 其他），同一色系裡依第一個顏色的明度由亮到暗；
 *   沒有這個部位的放最後。
 * - name：名字（筆畫與數字依自然順序）；沒有名字的放最後。
 * - manual：清單的順序（自己拖曳）。
 */
export function sortCharacters(bars: readonly Bar[], sort: ShelfSort): Bar[] {
  const indexed = bars.map((bar, i) => ({ bar, i }));
  const by = (cmp: (a: Bar, b: Bar) => number) =>
    indexed.sort((a, b) => cmp(a.bar, b.bar) || a.i - b.i).map((x) => x.bar);
  if (sort === 'manual') return bars.slice();
  if (sort === 'name') {
    return by((a, b) => {
      const na = (a.name ?? '').trim();
      const nb = (b.name ?? '').trim();
      if (!na !== !nb) return na ? -1 : 1;
      return na ? collator.compare(na, nb) : 0;
    });
  }
  if (sort === 'light') {
    return by((a, b) => lightness(keyColorOf(b)) - lightness(keyColorOf(a)));
  }
  const role: KeyRole = sort;
  const order = familiesFor(role);
  const rank = (f: FamilyKey | null) => (f ? order.indexOf(f) : order.length);
  return by((a, b) => {
    const fa = familyOf(a, role);
    const fb = familyOf(b, role);
    const r = rank(fa) - rank(fb);
    if (r) return r;
    if (!fa) return 0;
    return lightness(firstReal(roleColors(b, role))) - lightness(firstReal(roleColors(a, role)));
  });
}

export interface ShelfGroup {
  /** 色系（null＝沒有這個部位） */
  family: FamilyKey | null;
  bars: Bar[];
}

/** 依色系分組（排好序的清單；只有依髮色、瞳色排序時才分組）：每組連續、空的色系不出現 */
export function groupCharacters(
  sorted: readonly Bar[],
  sort: ShelfSort,
  group: boolean,
): ShelfGroup[] {
  if (!group || (sort !== 'hair' && sort !== 'eye'))
    return [{ family: null, bars: sorted.slice() }];
  const out: ShelfGroup[] = [];
  for (const bar of sorted) {
    const f = familyOf(bar, sort);
    const last = out[out.length - 1];
    if (last && last.family === f) last.bars.push(bar);
    else out.push({ family: f, bars: [bar] });
  }
  return out;
}

/** 分組的時候有沒有標題（沒有分組時只有一組、family 也是 null） */
export const isGrouped = (sort: ShelfSort, group: boolean) =>
  group && (sort === 'hair' || sort === 'eye');

/**
 * 點色塊複製的文字：真的有顏色的色碼（大寫，以「, 」分隔，和原作相同）；全部是「無」或沒有時 null。
 */
export function copyTextOf(list: readonly PartColor[]): string | null {
  const codes = realColors(list).map((c) => c.toUpperCase());
  return codes.length ? codes.join(', ') : null;
}

/** 色碼的顯示（大寫；「無」顯示「無」） */
export const colorLabel = (c: PartColor, noneLabel: string): string =>
  c.none ? noneLabel : c.color.toUpperCase();

/* ---------- 新增角色、編輯部位 ---------- */

export interface NewCharacter {
  name: string;
  image: Bar['image'];
  avatar: Bar['avatar'];
  hair: PartColor[];
  eye: PartColor[];
}

/** 新增角色時的部位：髮色在上、瞳色在下，比例都是 1；倍率＝當下的基準倍率 */
export function createCharacter(c: NewCharacter, baseScale: number): Bar {
  const parts = (list: readonly PartColor[], role: PartRole) =>
    list
      .slice(0, LIMITS.roleColors)
      .map((p) => segmentOf(newId('seg'), p.color, 1, { role, none: p.none }));
  return barOf(newId('bar'), baseScale, [...parts(c.hair, 'hair'), ...parts(c.eye, 'eye')], {
    name: c.name.trim().slice(0, LIMITS.name),
    image: c.image ?? null,
    avatar: c.avatar ?? null,
  });
}

/** 清單還能加幾位 */
export const roomLeft = (bars: readonly unknown[]): number => Math.max(0, MAX_BARS - bars.length);

/**
 * 加一個部位：髮色、瞳色加在同一部位的最後一個後面（沒有時：髮色放最前面、瞳色放在髮色後面），
 * 其他部位加在最後。髮色、瞳色各最多 5 個、其他最多 30 個（超過時不變）。
 */
export function addPart(
  segments: readonly Segment[],
  role: PartRole,
  color: string,
  extra: Partial<Pick<Segment, 'memo' | 'none'>> = {},
): Segment[] {
  const count = segments.filter((s) =>
    role === 'hair' || role === 'eye' ? s.role === role : s.role !== 'hair' && s.role !== 'eye',
  ).length;
  const max = role === 'hair' || role === 'eye' ? LIMITS.roleColors : LIMITS.otherParts;
  if (count >= max) return segments.slice();
  const seg = segmentOf(newId('seg'), color, 1, { role, ...extra });
  const next = segments.slice();
  const lastOf = (r: PartRole) => {
    for (let i = next.length - 1; i >= 0; i--) if (next[i].role === r) return i;
    return -1;
  };
  if (role === 'hair' || role === 'eye') {
    let at = lastOf(role);
    if (at < 0 && role === 'eye') at = lastOf('hair');
    next.splice(at + 1, 0, seg);
  } else next.push(seg);
  return next;
}

/** 部位分成三群（編輯視窗的三個區塊）：髮色、瞳色、其他（含沒有標部位的舊段） */
export function partGroups(segments: readonly Segment[]): {
  hair: Segment[];
  eye: Segment[];
  other: Segment[];
} {
  return {
    hair: segments.filter((s) => s.role === 'hair'),
    eye: segments.filter((s) => s.role === 'eye'),
    other: segments.filter((s) => s.role !== 'hair' && s.role !== 'eye'),
  };
}

/* ---------- 自動取色（圓形頭像裡最常出現的顏色） ---------- */

/**
 * 圓形頭像裡的主色（原作的「自動取色」）：頭像縮成 size × size（原作 48）後，只看離中心 0.4 倍邊長以內、
 * 透明度 200 以上的像素，RGB 各取前 3 位元分格，出現最多的那一格的平均色。沒有可算的像素時 #888888。
 */
export function dominantInCircle(px: {
  data: ArrayLike<number>;
  width: number;
  height: number;
}): string {
  const { data, width: w, height: h } = px;
  const s = Math.min(w, h);
  const lim = (s * 0.4) ** 2;
  const bins = new Map<number, [number, number, number, number]>();
  let best: [number, number, number, number] | null = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - w / 2 + 0.5;
      const dy = y - h / 2 + 0.5;
      if (dx * dx + dy * dy > lim) continue;
      const i = (y * w + x) * 4;
      if (data[i + 3] < 200) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      let e = bins.get(k);
      if (!e) {
        e = [0, 0, 0, 0];
        bins.set(k, e);
      }
      e[0] += r;
      e[1] += g;
      e[2] += b;
      e[3]++;
    }
  }
  /* 出現最多的格（同樣多時取先出現的格，和原作的 Map 走訪順序相同） */
  for (const e of bins.values()) if (!best || e[3] > best[3]) best = e;
  if (!best) return '#888888';
  const hex = (v: number) =>
    Math.round(v / best![3])
      .toString(16)
      .padStart(2, '0');
  return `#${hex(best[0])}${hex(best[1])}${hex(best[2])}`;
}

/**
 * 滴管：原圖 (x, y) 附近 3 × 3 的平均色（透明度 200 以上的像素才算，和原作相同）；點在圖外或周圍全是透明時 null。
 */
export function sampleAverage(
  px: { data: ArrayLike<number>; width: number; height: number },
  x: number,
  y: number,
): string | null {
  if (x < 0 || y < 0 || x >= px.width || y >= px.height) return null;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let yy = cy - 1; yy <= cy + 1; yy++) {
    if (yy < 0 || yy >= px.height) continue;
    for (let xx = cx - 1; xx <= cx + 1; xx++) {
      if (xx < 0 || xx >= px.width) continue;
      const i = (yy * px.width + xx) * 4;
      if (px.data[i + 3] < 200) continue;
      r += px.data[i];
      g += px.data[i + 1];
      b += px.data[i + 2];
      n++;
    }
  }
  if (!n) return null;
  const hex = (v: number) =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** 色碼欄的輸入（#RGB、#RRGGBB，可以不打 #）→ 小寫 #rrggbb；看不懂時 null（和原作相同） */
export function parseHexText(text: string): string | null {
  let t = String(text).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t))
    t = t
      .split('')
      .map((c) => c + c)
      .join('');
  return /^[0-9a-f]{6}$/i.test(t) ? `#${t.toLowerCase()}` : null;
}

/** 檔名用的今天（yyyymmdd） */
export const dateStamp = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** 圖上的日期（yyyy.mm.dd） */
export const dateText = (d = new Date()) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
