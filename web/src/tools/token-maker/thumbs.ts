/**
 * 縮圖（名單、預設外觀）：用已經讀好的圖片與遮罩畫一個小棋子（和匯出同一段繪製；沒讀好的先不畫圖片）。
 */
import { useEffect, useState } from 'react';
import type { Look, TokenItem } from './model';
import { type Drawable, renderToken } from './render';
import { loadImageWork, loadMask, peekImageWork, peekMask, softMaskCanvas } from './sources';
import { tokenPad } from './store';
import { requestTexture } from './textures';

export interface ThumbCustom {
  frame: Drawable | null;
  frameId: string | null;
  mask: Drawable | null;
}

/** 畫一個棋子的縮圖到 ctx（size × size） */
export function drawTokenThumb(
  ctx: CanvasRenderingContext2D,
  token: TokenItem | null,
  look: Look,
  size: number,
  custom: ThumbCustom,
  { labels = true }: { labels?: boolean } = {},
): void {
  const work = token?.image ? (peekImageWork(token.image.id) ?? null) : null;
  const mask = token?.mask ? (peekMask(token.mask.id) ?? null) : null;
  renderToken(
    ctx,
    {
      N: size,
      pad: tokenPad(look, token, mask),
      look,
      token,
      cacheFrame: false,
      noLabels: !labels,
    },
    {
      image: work?.bitmap ?? null,
      size: token?.image ?? null,
      popMask: mask && token?.popOn ? softMaskCanvas(mask, look.feather) : null,
      texture: requestTexture(look.texture, look.texSeed),
      customFrame: look.frame === 'custom' ? custom.frame : null,
      customFrameId: custom.frameId,
      customMask: custom.mask,
    },
  );
}

/** 名單裡每個棋子的圖片與遮罩都讀好（讀好一個就加 1） */
export function useLoadedTokens(tokens: readonly TokenItem[]): number {
  const [tick, setTick] = useState(0);
  const key = tokens.map((t) => `${t.image?.id ?? ''}:${t.mask?.id ?? ''}`).join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只看圖片與遮罩的 id
  useEffect(() => {
    let alive = true;
    const bump = () => {
      if (alive) setTick((t) => t + 1);
    };
    for (const t of tokens) {
      if (t.image && !peekImageWork(t.image.id)) void loadImageWork(t.image).then(bump);
      if (t.mask && !peekMask(t.mask.id)) void loadMask(t.mask).then(bump);
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return tick;
}
