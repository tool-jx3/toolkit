/**
 * 範例地圖（本站自己排的；第一次開頁、「回到範例地圖」用）：地下水道的岔路。
 * 地形用簡易地形，家具、角色與怪物用 Kenney 迷你地城。
 */

import { placed } from './model/large';
import { createMap } from './model/map';
import type { Cell, Layer, TileMap } from './model/types';
import { S } from './strings';

const W = 32;
const H = 24;

export function sampleMap(): TileMap {
  const base = createMap(W, H, S.sampleMapName, S.layerNames);
  const grids = base.layers.map((l) => l.cells.slice() as Cell[]);
  const [ground, walls, props] = grids;
  const at = (x: number, y: number) => y * W + x;
  const put = (g: Cell[], x: number, y: number, t: string, r = 0, f = false) => {
    if (x >= 0 && y >= 0 && x < W && y < H) g[at(x, y)] = placed(t, r, f);
  };
  const clear = (g: Cell[], x: number, y: number) => {
    g[at(x, y)] = null;
  };
  const floor = (x0: number, y0: number, x1: number, y1: number, t: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(ground, x, y, t);
  };
  /** 房間：地板＋四周的牆 */
  const room = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    floorTile: string,
    wallTile: string,
  ) => {
    floor(x0, y0, x1, y1, floorTile);
    for (let x = x0; x <= x1; x++) {
      put(walls, x, y0, wallTile);
      put(walls, x, y1, wallTile);
    }
    for (let y = y0; y <= y1; y++) {
      put(walls, x0, y, wallTile);
      put(walls, x1, y, wallTile);
    }
  };

  /* 西邊的倉庫、東邊的看守室、中間的通道、南邊的水道大廳 */
  room(2, 2, 11, 10, 'kb:flagstone', 'kb:stonewall');
  room(20, 2, 29, 10, 'kb:wood', 'kb:brick');
  room(11, 4, 20, 8, 'kb:cobble', 'kb:stonewall');
  room(3, 13, 28, 21, 'kb:flagstone', 'kb:stonewall');
  /* 通道打通兩邊的房間：門 */
  for (let y = 5; y <= 7; y++) {
    clear(walls, 11, y);
    clear(walls, 20, y);
  }
  put(walls, 11, 6, 'kt:45', 1);
  put(walls, 20, 6, 'kt:45', 3);
  /* 往南的走道 */
  floor(15, 8, 16, 13, 'kb:cobble');
  for (let y = 8; y <= 13; y++) {
    clear(walls, 15, y);
    clear(walls, 16, y);
    put(walls, 14, y, 'kb:stonewall');
    put(walls, 17, y, 'kb:stonewall');
  }
  /* 水道（中間深、兩邊淺）與木橋 */
  for (let x = 4; x <= 27; x++) {
    put(ground, x, 16, 'kb:water');
    put(ground, x, 17, 'kb:deep');
    put(ground, x, 18, 'kb:water');
  }
  for (const y of [16, 17, 18]) {
    put(ground, 15, y, 'kb:wood', 1);
    put(ground, 16, y, 'kb:wood', 1);
  }
  for (const y of [16, 17, 18]) {
    clear(walls, 3, y);
    clear(walls, 28, y);
    put(ground, 3, y, y === 17 ? 'kb:deep' : 'kb:water');
    put(ground, 28, y, y === 17 ? 'kb:deep' : 'kb:water');
  }
  /* 倉庫：寶箱、木桶、木櫃 */
  put(props, 4, 4, 'kt:89');
  put(props, 9, 4, 'kt:82');
  put(props, 10, 4, 'kt:82');
  put(props, 10, 5, 'kt:82');
  put(props, 4, 8, 'kt:63');
  put(props, 4, 9, 'kt:75');
  put(props, 7, 7, 'kt:41');
  /* 看守室：桌椅、鐵砧、守衛 */
  put(props, 24, 5, 'kt:72');
  put(props, 23, 5, 'kt:73');
  put(props, 25, 5, 'kt:73');
  put(props, 27, 8, 'kt:74');
  put(props, 22, 8, 'kt:96');
  put(props, 26, 3, 'kt:84');
  /* 大廳：墓碑、怪物、冒險者 */
  put(props, 6, 14, 'kt:65');
  put(props, 8, 14, 'kt:64');
  put(props, 22, 20, 'kt:122');
  put(props, 25, 14, 'kt:120');
  put(props, 9, 20, 'kt:108');
  put(props, 15, 14, 'kt:98');
  put(props, 16, 14, 'kt:99');
  put(props, 26, 20, 'kt:90');
  put(props, 5, 20, 'kb:pit');

  const layers: Layer[] = base.layers.map((l, i) => ({ ...l, cells: grids[i] }));
  return { ...base, background: '#1d1f24', layers };
}
