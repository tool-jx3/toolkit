/**
 * 照片在框裡的位置（F20、F51；規格第 4 節、3.9）。位置存成共用的 `FramePlacement`（D11：以蓋滿為 1 的縮放、
 * 框寬高為 1 的位移、轉了幾個 90°），操作照原作的做法：
 *
 * 原作記的是 object-position——照片在「可以移動的範圍」裡的比例（每一邊 0～1，0.5＝置中、0＝照片的左緣／上緣貼齊框），
 * 縮放（滾輪、捏合、滑桿）、框換了大小（換比例、換版面、間距）時這個比例不變。所以拖到邊之後再放大、縮小，
 * 貼齊的那一邊仍貼齊；位置一定在蓋滿的範圍裡。
 *
 * - 有可以移動的範圍的那一邊：比例由位移算（位移＝（0.5 − 比例）× 多出來的長度，以框的長度為 1）。
 * - 剛好放得下（縮放 1 倍時蓋滿的那一邊）：位移一定是 0，比例另外記在 `ax`／`ay`（原作也記著，之後放大時回到原來那一側；
 *   0.5 時不記）。藏起來的格子（換版面）兩邊都記，再出現時照比例放（見 model 的 `relayoutStory`）。
 *
 * 純函式（不依賴 React 與畫布）；框只看寬高比（任何大小都可以）。
 */
import { coverScale, type FramePlacement } from '@/core/image';

/** 照片在框裡的縮放上限（蓋滿＝1；原作 1～5） */
export const ZOOM_MAX = 5;

export interface PhotoPlace extends FramePlacement {
  /** 剛好放得下的那一邊記著的比例（0～1；沒有記＝0.5） */
  ax?: number;
  ay?: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 每一邊的比例（原作的 object-position，0～1） */
export interface Anchor {
  x: number;
  y: number;
}

/** 多出來的長度小於這個（框的長度為 1）就當成剛好放得下 */
const EPS = 1e-6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampZoom = (z: number) => clamp(Number.isFinite(z) ? z : 1, 1, ZOOM_MAX);
const turnsOf = (t: number) => ((Math.round(t) % 4) + 4) % 4;

/** 照片（轉過之後、依縮放）比框多出來的長度（框的寬、高為 1） */
function overflow(img: Size, box: Size, zoom: number, turns: number): Anchor {
  const odd = turnsOf(turns) % 2 === 1;
  const iw = odd ? img.height : img.width;
  const ih = odd ? img.width : img.height;
  if (!(iw > 0 && ih > 0 && box.width > 0 && box.height > 0)) return { x: 0, y: 0 };
  const s = coverScale(img, box.width, box.height, turns) * zoom;
  return { x: (iw * s) / box.width - 1, y: (ih * s) / box.height - 1 };
}

/** 位置 → 每一邊的比例 */
export function anchorOf(img: Size, box: Size, p: PhotoPlace): Anchor {
  const o = overflow(img, box, clampZoom(p.zoom), p.turns);
  const axis = (over: number, pos: number, mem: number | undefined) =>
    over > EPS ? clamp(0.5 - pos / over, 0, 1) : (mem ?? 0.5);
  return { x: axis(o.x, p.x, p.ax), y: axis(o.y, p.y, p.ay) };
}

/** 比例 → 位置（縮放 1～5；剛好放得下的那一邊位移 0、比例記在 ax／ay） */
export function placeAt(img: Size, box: Size, a: Anchor, zoom: number, turns: number): PhotoPlace {
  const z = clampZoom(zoom);
  const o = overflow(img, box, z, turns);
  const p: PhotoPlace = {
    zoom: z,
    x: o.x > EPS ? (0.5 - a.x) * o.x : 0,
    y: o.y > EPS ? (0.5 - a.y) * o.y : 0,
    turns: turnsOf(turns),
  };
  if (!(o.x > EPS) && a.x !== 0.5) p.ax = a.x;
  if (!(o.y > EPS) && a.y !== 0.5) p.ay = a.y;
  return p;
}

/** 縮放（滾輪、捏合、滑桿、+／-）：比例不變（原作的錨點） */
export function zoomPlace(img: Size, box: Size, p: PhotoPlace, zoom: number): PhotoPlace {
  return placeAt(img, box, anchorOf(img, box, p), zoom, p.turns);
}

/** 框換了大小（換比例、換版面、間距）：比例不變 */
export function refitPlace(img: Size, from: Size, to: Size, p: PhotoPlace): PhotoPlace {
  return placeAt(img, to, anchorOf(img, from, p), p.zoom, p.turns);
}

/**
 * 夾回蓋滿的範圍（開檔、還原；拖曳的起點）：縮放 1～5、位移不露出框外；有可以移動的範圍的那一邊不留 ax／ay。
 * 沒有變化時回傳同一個物件。
 */
export function fitPlace(img: Size, box: Size, p: PhotoPlace): PhotoPlace {
  const zoom = clampZoom(p.zoom);
  const turns = turnsOf(p.turns);
  const o = overflow(img, box, zoom, turns);
  const x = o.x > EPS ? clamp(p.x, -o.x / 2, o.x / 2) : 0;
  const y = o.y > EPS ? clamp(p.y, -o.y / 2, o.y / 2) : 0;
  const keepAx = !(o.x > EPS) && p.ax !== undefined;
  const keepAy = !(o.y > EPS) && p.ay !== undefined;
  if (
    zoom === p.zoom &&
    turns === p.turns &&
    x === p.x &&
    y === p.y &&
    keepAx === (p.ax !== undefined) &&
    keepAy === (p.ay !== undefined)
  )
    return p;
  const out: PhotoPlace = { zoom, x, y, turns };
  if (keepAx) out.ax = p.ax;
  if (keepAy) out.ay = p.ay;
  return out;
}

/** 拖曳、方向鍵：從看得到的位置（夾回範圍後）移動 (dx, dy)（框的寬高為 1），夾在範圍裡 */
export function movePlace(img: Size, box: Size, p: PhotoPlace, dx: number, dy: number): PhotoPlace {
  const start = fitPlace(img, box, p);
  return fitPlace(img, box, { ...start, x: start.x + dx, y: start.y + dy });
}
