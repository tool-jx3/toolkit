/* 文字演出產生器：共用小工具（數學、緩動曲線、決定性亂數、顏色）
 * TRPG Toolkit 原創工具，MIT 授權。 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/* ---------- 決定性亂數 ----------
 * 由整數組合（字序、時間桶、用途編號）雜湊出 [0,1) 的值。
 * 不用 Math.random：同一組設定每次畫出來的影格都要一模一樣。 */
export function hashUnit(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) ^ 0x3c6ef372, 0x9e3779b1);
  h ^= Math.imul((b | 0) + 0x1b873593, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= Math.imul((c | 0) + 0x5bd1e995, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/* 對稱亂數 [-1,1) */
export const hashSigned = (a, b, c) => hashUnit(a, b, c) * 2 - 1;

/* 依固定頻率分桶：雜訊、抖動的亂數每秒只換固定次數，不跟著輸出 fps 變。 */
export const timeSlot = (t, perSecond) => Math.floor(t * perSecond + 1e-6);

/* 由字串得到穩定的整數種子 */
export function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}

/* ---------- 緩動曲線 ----------
 * 同一條曲線同時決定位移、縮放、模糊與不透明度。 */
function bounceOut(u) {
  const n = 7.5625, d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) { u -= 1.5 / d; return n * u * u + 0.75; }
  if (u < 2.5 / d) { u -= 2.25 / d; return n * u * u + 0.9375; }
  u -= 2.625 / d; return n * u * u + 0.984375;
}
export const EASE = {
  out: u => 1 - (1 - u) ** 3,                                       // 緩停
  snap: u => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),                     // 急停
  smooth: u => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2), // 平滑（S 形）
  back: u => { const k = 1.70158; return 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2; }, // 過衝
  spring: u => (u <= 0 ? 0 : u >= 1 ? 1 : 2 ** (-10 * u) * Math.sin((u * 10 - 0.75) * (TAU / 3)) + 1), // 彈簧振盪
  bounce: bounceOut,                                                // 落地彈跳
  linear: u => u,                                                   // 等速
  in: u => u * u * u,                                               // 緩起
  /* 以下兩條不給使用者選，只當作個別效果的「自動」曲線 */
  slam: u => (u <= 0 ? 0 : 2 ** (10 * u - 10)),                     // 急起（壓回一線用）
  glide: u => 1 - (1 - u) ** 4                                      // 展開段用
};

export const CURVE_CHOICES = [
  ['auto', '自動（依效果）'],
  ['out', '緩停'],
  ['snap', '急停'],
  ['smooth', '平滑（S 形）'],
  ['back', '過衝回彈'],
  ['spring', '彈簧振盪'],
  ['bounce', '落地彈跳'],
  ['linear', '等速'],
  ['in', '緩起']
];

/* ---------- 顏色 ---------- */
export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return [255, 255, 255];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(a)})`;
}

/* ---------- 其他 ---------- */
export const isBlankChar = ch => ch === ' ' || ch === '　' || ch === '\t';
export const nextFrame = () => new Promise(r => setTimeout(r, 0));

export function deepClone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}
/* 只把 patch 有的欄位疊上去（物件遞迴、陣列整個替換） */
export function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      deepMerge(base[k], v);
    } else {
      base[k] = Array.isArray(v) ? v.slice() : v;
    }
  }
  return base;
}
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

/* 畫布：一律用 DOM canvas（各瀏覽器都能 drawImage） */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* 這個瀏覽器的 2D 畫布支不支援 filter（模糊）。不支援時改用縮小再放大的近似模糊。 */
export const CANVAS_FILTER_OK = (() => {
  try {
    const x = document.createElement('canvas').getContext('2d');
    x.filter = 'blur(2px)';
    return x.filter === 'blur(2px)';
  } catch { return false; }
})();
