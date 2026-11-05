/**
 * 圖塊的定義與圖片（執行中）：
 * - 定義：內建的 → 圖庫的 → 地圖記的（圖庫刪掉了、或專案檔帶來的）。
 * - 圖片：內建的開頁時載入；自訂的放在資產庫（IndexedDB，依內容產生 id），第一次用到時讀出來，讀好了重畫。
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { type CustomSet, libraryTiles, orderedTiles } from '../model/library';
import type { TileDef, TileMap } from '../model/types';
import { BUILTIN_SETS, builtinTile, isBuiltinSrc, loadBuiltinImages } from '../tiles/builtin';
import { libraryNow, mapNow, TOOL_ID, useLibrary } from './store';

export const assets = createAssetStore(TOOL_ID);

/* ---------- 定義 ---------- */

let libIndex: Map<string, TileDef> = new Map();
let libIndexOf: unknown = null;
function libraryIndex(): Map<string, TileDef> {
  const lib = libraryNow();
  if (libIndexOf !== lib) {
    libIndex = new Map(libraryTiles(lib).map((t) => [t.id, t]));
    libIndexOf = lib;
  }
  return libIndex;
}

/** 圖塊的定義（map：要一起查的地圖，預設目前的） */
export function tileDef(
  id: string | null | undefined,
  map: Pick<TileMap, 'defs'> = mapNow(),
): TileDef | undefined {
  if (!id) return undefined;
  return builtinTile(id) ?? libraryIndex().get(id) ?? map.defs[id];
}

export const isBuiltinTile = (id: string): boolean => !!builtinTile(id);

/** 調色盤上的圖塊組（內建、自訂）；hidden 的內建組不列 */
export interface PaletteSet {
  id: string;
  name: string;
  builtin: boolean;
  tiles: TileDef[];
}

export function paletteSets(includeHidden = false): PaletteSet[] {
  const lib = libraryNow();
  const out: PaletteSet[] = [];
  for (const s of BUILTIN_SETS) {
    if (!includeHidden && lib.hidden.includes(s.id)) continue;
    out.push({
      id: s.id,
      name: lib.names[s.id] ?? s.name,
      builtin: true,
      tiles: orderedTiles(s.tiles, lib.order[s.id]),
    });
  }
  for (const s of lib.sets) out.push(customPaletteSet(s, lib.order[s.id]));
  return out;
}

function customPaletteSet(s: CustomSet, order?: readonly string[]): PaletteSet {
  return {
    id: s.id,
    name: s.name,
    builtin: false,
    tiles: orderedTiles(
      s.imports.flatMap((i) => i.tiles),
      order,
    ),
  };
}

export function setName(id: string): string {
  const lib = libraryNow();
  const b = BUILTIN_SETS.find((s) => s.id === id);
  if (b) return lib.names[id] ?? b.name;
  return lib.sets.find((s) => s.id === id)?.name ?? '';
}

/* ---------- 圖片 ---------- */

/** 圖片讀好了就 +1（畫布、縮圖跟著重畫） */
export const useImages = create<{ version: number }>(() => ({ version: 0 }));
const bump = () => useImages.setState((s) => ({ version: s.version + 1 }));

let builtin = new Map<string, CanvasImageSource>();
const loading = new Set<string>();
const missing = new Set<string>();

export async function loadBuiltins(): Promise<void> {
  builtin = await loadBuiltinImages();
  bump();
}

/** 這張來源圖（同步；還沒讀好時 undefined，讀好了會重畫） */
export function imageFor(src: string): CanvasImageSource | undefined {
  if (isBuiltinSrc(src)) return builtin.get(src);
  const bmp = assets.peekBitmap(src);
  if (bmp) return bmp;
  if (!loading.has(src) && !missing.has(src)) {
    loading.add(src);
    void assets
      .bitmap(src)
      .then((b) => {
        if (!b) missing.add(src);
        loading.delete(src);
        bump();
      })
      .catch(() => {
        missing.add(src);
        loading.delete(src);
      });
  }
  return undefined;
}

/** 這些圖片先讀好（開頁、開專案檔之後） */
export async function preloadImages(srcs: Iterable<string>): Promise<string[]> {
  const list = [...new Set(srcs)].filter((s) => !isBuiltinSrc(s));
  const { missing: gone } = await assets.preload(list);
  for (const s of gone) missing.add(s);
  for (const s of list) if (!gone.includes(s)) missing.delete(s);
  bump();
  return gone;
}

/** 剛加進資產庫的圖不再當成「找不到」 */
export function forgetMissing(src: string): void {
  missing.delete(src);
}

/** 地圖與圖庫用到的自訂圖片 */
export function usedImages(maps: Iterable<Pick<TileMap, 'defs'>>): Set<string> {
  const out = new Set<string>();
  for (const m of maps)
    for (const d of Object.values(m.defs)) if (!isBuiltinSrc(d.src)) out.add(d.src);
  for (const t of libraryTiles(libraryNow())) if (!isBuiltinSrc(t.src)) out.add(t.src);
  return out;
}

/** 圖庫一變，定義的索引跟著換（tileDef 自己會比對；這裡只為了重畫） */
useLibrary.subscribe(bump);
