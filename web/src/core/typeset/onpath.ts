/**
 * 沿路徑排字：每個字沿著軌跡依序排列，方向跟著切線旋轉（字頭朝行進方向的左手邊）。
 *
 * 第 i 個字的中心放在路徑長「前面所有字的前進寬度＋字距的總和＋本字寬 ÷ 2」處；
 * 字身中心再沿法線往字頭方向移 offset（例如 offset＝字級 ÷ 2 時字的底邊貼在路徑上）。
 * 閉合路徑（圓、方、三角）上字比一圈長時繼續繞下一圈（會和開頭的字重疊）。
 * 畫面座標下順時針繞行時，左手邊是外側：字頭朝外。
 */
import { closePath, cumulativeLengths, type Path, pointAtLength } from '../path';

export interface PathGlyphPlacement {
  /** 字身中心 */
  x: number;
  y: number;
  /** 字的旋轉（弧度，切線方向；0＝正立往右排） */
  angle: number;
  /** 字中心在路徑上的長度位置（未繞圈前） */
  s: number;
}

export interface LayoutOnPathOptions {
  /** 閉合路徑（超過一圈時繞圈；預設 true）。不閉合時超出終點的字夾在終點。 */
  closed?: boolean;
  /** 字距（px），加在相鄰兩字之間 */
  tracking?: number;
  /** 第一個字之前空出的長度（px） */
  start?: number;
  /** 字身中心離路徑的距離（往字頭方向為正） */
  offset?: number;
  /**
   * 整體旋轉（弧度，以 center 為中心，正數順時針），例如圖形每格轉一個角度。
   * 字的位置與角度一起轉。
   */
  rotate?: number;
  center?: { x: number; y: number };
}

/** 依各字的前進寬度沿路徑排字 */
export function layoutOnPath(
  path: Path,
  advances: readonly number[],
  {
    closed = true,
    tracking = 0,
    start = 0,
    offset = 0,
    rotate = 0,
    center = { x: 0, y: 0 },
  }: LayoutOnPathOptions = {},
): PathGlyphPlacement[] {
  const pts = closed ? closePath(path) : path.slice();
  const lengths = cumulativeLengths(pts);
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  const out: PathGlyphPlacement[] = [];
  let pos = start;
  advances.forEach((adv, i) => {
    const s = pos + adv / 2;
    const p = pointAtLength(pts, s, { lengths, closed });
    /* 字頭方向＝切線轉 −90°（畫面座標）：(ty, −tx) */
    let x = p.x + p.ty * offset;
    let y = p.y - p.tx * offset;
    if (rotate) {
      const dx = x - center.x;
      const dy = y - center.y;
      x = center.x + dx * cos - dy * sin;
      y = center.y + dx * sin + dy * cos;
    }
    out.push({ x, y, angle: p.angle + rotate, s });
    pos += adv + (i < advances.length - 1 ? tracking : 0);
  });
  return out;
}
