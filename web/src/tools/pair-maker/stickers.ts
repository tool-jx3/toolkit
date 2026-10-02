/**
 * 貼紙的操作（純函式，回傳新的 Draft）：加入、更新、刪除、前後順序。
 * 清單第一個在最上層；新加入的放在最前面。文字記錄的貼紙用頁面座標，記在哪一頁。
 */
import { initialPlacement, type Placement } from '@/core/scene';
import {
  type Draft,
  MAX_STICKERS,
  newId,
  STICKER_START_SIDE,
  type Sticker,
  type TemplateDef,
} from './model';
import { S } from './strings';
import { activeOf } from './templates/textlog';

/** 加入一張貼紙（到上限時 null）：長邊縮放到 300 px、放在畫布（文字記錄是目前頁）中央 */
export function addSticker(
  def: TemplateDef,
  d: Draft,
  asset: string,
  name: string,
  img: { width: number; height: number },
  id = newId('s'),
): { draft: Draft; id: string } | null {
  if (d.stickers.length >= MAX_STICKERS) return null;
  const page = def.kind === 'textlog' ? activeOf(d) : undefined;
  const area =
    def.kind === 'textlog' ? { x: 0, y: 0, width: 780, height: 1080 } : def.stickerArea(d);
  const p = initialPlacement(img, area, STICKER_START_SIDE);
  const s: Sticker = {
    id,
    asset,
    name: name.slice(0, 100) || S.stickerDefaultName,
    ...p,
    shadow: false,
    outline: false,
    cite: '',
    ...(page !== undefined ? { page } : {}),
  };
  return { draft: { ...d, stickers: [s, ...d.stickers] }, id };
}

export function patchSticker(d: Draft, id: string, patch: Partial<Sticker>): Draft {
  return { ...d, stickers: d.stickers.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

/** 畫布座標的位置 → 存的位置（扣掉文字記錄看全部時的頁位移） */
export function placementToSticker(
  def: TemplateDef,
  d: Draft,
  s: Sticker,
  p: Placement,
): Partial<Sticker> {
  const o = def.stickerOffset?.(d, s) ?? { x: 0, y: 0 };
  return { cx: p.cx - o.x, cy: p.cy - o.y, width: p.width, height: p.height, rotation: p.rotation };
}

export function removeSticker(d: Draft, id: string): Draft {
  return { ...d, stickers: d.stickers.filter((s) => s.id !== id) };
}

/** 從 from 移到 to（清單位置） */
export function moveSticker(d: Draft, from: number, to: number): Draft {
  if (from === to || from < 0 || to < 0 || from >= d.stickers.length || to >= d.stickers.length)
    return d;
  const list = [...d.stickers];
  const [it] = list.splice(from, 1);
  list.splice(to, 0, it);
  return { ...d, stickers: list };
}

/** 往前（清單上方）或往後一層；到頭時不變 */
export function stepSticker(d: Draft, id: string, dir: 'front' | 'back'): Draft {
  const i = d.stickers.findIndex((s) => s.id === id);
  return moveSticker(d, i, dir === 'front' ? i - 1 : i + 1);
}
