/** 生成法共用的型別 */
import type { GridPoint } from './lights';
import type { Mask } from './mask';

export interface Room {
  /** 左上角的欄、列 */
  x: number;
  y: number;
  /** 寬、高（格） */
  w: number;
  h: number;
}

export interface Corridor {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** true：先橫後直；false：先直後橫 */
  horizontalFirst: boolean;
}

/** 一個生成法的結果：地板遮罩、房間（沒有房間的生成法是 null）、走道（只有房間＋走道記錄）、火光的交點 */
export interface Generated {
  mask: Mask;
  rooms: Room[] | null;
  corridors: Corridor[];
  lights: GridPoint[];
}

/** 房間的火光：房間左上角往內一格的格線交點（規格 F23） */
export const roomLights = (rooms: readonly Room[]): GridPoint[] =>
  rooms.map((r) => ({ x: r.x + 1, y: r.y + 1 }));
