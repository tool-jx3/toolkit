/**
 * 分享連結（規格 3.4）：網址 `#m=` ＋ deflate 壓縮的 `{ v: 1, d: 內容 }`（共用 core/share）。
 * 內容＝遊玩需要的東西：標題、導言、場景（內建場景的代號或網址）、熱點（沒有代號：出現條件用索引）、遊玩設定；
 * 沒有 KP 備註、沒有圖片庫的圖。讀回時一律整理（網址是任何人都能編的輸入）：數值夾到範圍、選項不認得用預設、
 * 字串截斷、圖片只收 http(s) 網址、索引超出範圍或指到自己的丟掉、熱點最多 40 個。
 */
import { encodeShareHash, readShareHash } from '@/core/share';
import {
  BUILTIN_SCENES,
  type BuiltinSceneId,
  type ClueMapState,
  clampBox,
  cleanImageUrl,
  cleanLook,
  effectiveRequires,
  LIMITS,
  multiLine,
  oneLine,
  REQUIRE_MODES,
  SHAPES,
  urlImageName,
} from './model';

export const SHARE_KEY = 'm';
export const SHARE_VERSION = 1;
/** # 後面最多幾個字 */
export const SHARE_MAX_LENGTH = 8000;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 分享用的內容（沒有 KP 備註、代號、上傳的圖） */
export function toShared(d: ClueMapState): Record<string, unknown> {
  const index = new Map(d.spots.map((s, i) => [s.id, i]));
  return {
    title: d.title,
    intro: d.intro,
    scene:
      d.scene.kind === 'builtin'
        ? { kind: 'builtin', id: d.scene.id }
        : d.scene.kind === 'url'
          ? { kind: 'url', url: d.scene.url }
          : { kind: 'builtin', id: 'paper' },
    spots: d.spots.map((s) => ({
      name: s.name,
      shape: s.shape,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      text: s.text,
      check: s.check,
      image: s.image?.kind === 'url' ? { url: s.image.url } : null,
      req: effectiveRequires(s)
        .map((id) => index.get(id))
        .filter((i): i is number => i !== undefined),
      mode: s.mode,
      hidden: s.hidden,
    })),
    look: d.look,
  };
}

/** 內容 → `#m=…`（含 #） */
export const encodeShare = (d: ClueMapState): string =>
  encodeShareHash(toShared(d), { version: SHARE_VERSION, key: SHARE_KEY });

/** 完整的分享網址（目前的網址換掉 #） */
export function shareUrlFor(d: ClueMapState, base: string): string {
  const u = new URL(base);
  u.hash = encodeShare(d).slice(1);
  return u.toString();
}

/** 整理讀回來的內容（結構不對時 null）。熱點的代號依索引重新取（`s0`、`s1`…），沒有 KP 備註 */
export function cleanShared(raw: unknown): ClueMapState | null {
  if (!isObj(raw)) return null;
  const sc = raw.scene;
  let scene: ClueMapState['scene'] | null = null;
  if (isObj(sc) && sc.kind === 'builtin' && BUILTIN_SCENES.includes(sc.id as BuiltinSceneId))
    scene = { kind: 'builtin', id: sc.id as BuiltinSceneId };
  else if (isObj(sc) && sc.kind === 'url' && typeof sc.url === 'string') {
    const url = cleanImageUrl(sc.url);
    if (url) scene = { kind: 'url', url, name: urlImageName(url) };
  }
  if (!scene) return null;
  const given = Array.isArray(raw.spots) ? raw.spots.slice(0, LIMITS.spots) : [];
  const ids = given.map((_, i) => `s${i}`);
  const spots = given.map((r, i) => {
    const o = isObj(r) ? r : {};
    const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
    const box = clampBox({ x: num(o.x, 40), y: num(o.y, 40), w: num(o.w, 20), h: num(o.h, 15) });
    const url =
      isObj(o.image) && typeof o.image.url === 'string' ? cleanImageUrl(o.image.url) : null;
    const req = Array.isArray(o.req)
      ? [
          ...new Set(
            o.req.filter(
              (n): n is number =>
                Number.isInteger(n) &&
                (n as number) >= 0 &&
                (n as number) < given.length &&
                n !== i,
            ),
          ),
        ].map((n) => ids[n])
      : [];
    return {
      id: ids[i],
      name: oneLine(typeof o.name === 'string' ? o.name : '', LIMITS.name),
      shape: SHAPES.includes(o.shape as 'rect') ? (o.shape as 'rect' | 'ellipse') : 'rect',
      ...box,
      text: multiLine(typeof o.text === 'string' ? o.text : '', LIMITS.text),
      check: oneLine(typeof o.check === 'string' ? o.check : '', LIMITS.check),
      memo: '',
      image: url ? { kind: 'url' as const, url, name: urlImageName(url) } : null,
      locked: req.length > 0,
      requires: req,
      mode: REQUIRE_MODES.includes(o.mode as 'all') ? (o.mode as 'all' | 'any') : 'all',
      hidden: o.hidden === true,
    };
  });
  return {
    title: oneLine(typeof raw.title === 'string' ? raw.title : '', LIMITS.title),
    intro: multiLine(typeof raw.intro === 'string' ? raw.intro : '', LIMITS.intro),
    scene,
    spots,
    look: cleanLook(raw.look),
  };
}

/**
 * 網址的 # 部分 → 內容。
 * 'none'：沒有分享的內容（照常打開編輯畫面）；'broken'：有 `m=` 但讀不出來。
 */
export function readShare(hash: string): ClueMapState | 'none' | 'broken' {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h || !new URLSearchParams(h).has(SHARE_KEY)) return 'none';
  const raw = readShareHash(hash, {
    version: SHARE_VERSION,
    key: SHARE_KEY,
    maxLength: SHARE_MAX_LENGTH,
  });
  if (raw === null) return 'broken';
  return cleanShared(raw) ?? 'broken';
}
