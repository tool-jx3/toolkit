/**
 * 內建的圖塊組：本站的簡易圖塊、Kenney 的 Scribble Dungeons 與 Tiny Dungeon（CC0）。
 * 圖塊的 id 固定（存檔、專案檔靠它）；名稱、分類、排列是本站的。
 */
import scribbleUrl from '../assets/kenney-scribble/atlas.webp?url';
import tinyUrl from '../assets/kenney-tiny/tilemap.png?url';
import type { TileDef } from '../model/types';
import { BASIC_SET, BASIC_SRC, basicDefs, paintBasicAtlas } from './basic';
import {
  SCRIBBLE_SET,
  SCRIBBLE_SRC,
  SCRIBBLE_TILES,
  TINY_SET,
  TINY_SRC,
  TINY_TILES,
} from './kenney';

export interface BuiltinSet {
  id: string;
  /** 預設名稱（使用者可以改名，記在圖庫） */
  name: string;
  tiles: readonly TileDef[];
}

export const BASIC_NAMES: Record<string, string> = {
  flagstone: '石板地',
  cobble: '碎石路',
  wood: '木地板',
  dirt: '泥土',
  grass: '草地',
  sand: '沙地',
  water: '淺水',
  deep: '深水',
  lava: '岩漿',
  ice: '冰面',
  stonewall: '石牆',
  brick: '磚牆',
  woodwall: '木牆',
  rock: '岩壁',
  void: '黑暗',
  pit: '坑洞',
};

export const BUILTIN_SETS: readonly BuiltinSet[] = [
  { id: BASIC_SET, name: '簡易地形', tiles: basicDefs(BASIC_NAMES) },
  { id: SCRIBBLE_SET, name: 'Kenney 塗鴉地城', tiles: SCRIBBLE_TILES },
  { id: TINY_SET, name: 'Kenney 迷你地城', tiles: TINY_TILES },
];

const BY_ID = new Map<string, TileDef>(
  BUILTIN_SETS.flatMap((s) => s.tiles.map((t) => [t.id, t] as const)),
);
const SET_IDS = new Set(BUILTIN_SETS.map((s) => s.id));

export const builtinTile = (id: string): TileDef | undefined => BY_ID.get(id);
export const isBuiltinSet = (id: string): boolean => SET_IDS.has(id);
export const isBuiltinSrc = (src: string): boolean => src.startsWith('builtin:');

/** 預設的畫筆：簡易地形的第一個 */
export const DEFAULT_TILE = BUILTIN_SETS[0].tiles[0].id;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load ${url}`));
    img.src = url;
  });
}

/** 內建圖塊組的圖（瀏覽器裡呼叫；載入失敗的那一組沒有圖） */
export async function loadBuiltinImages(): Promise<Map<string, CanvasImageSource>> {
  const out = new Map<string, CanvasImageSource>();
  out.set(BASIC_SRC, paintBasicAtlas());
  const [scribble, tiny] = await Promise.allSettled([loadImage(scribbleUrl), loadImage(tinyUrl)]);
  if (scribble.status === 'fulfilled') out.set(SCRIBBLE_SRC, scribble.value);
  if (tiny.status === 'fulfilled') out.set(TINY_SRC, tiny.value);
  return out;
}
