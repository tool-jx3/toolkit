/**
 * 縮圖（名單、預設外觀、實際大小）：用小圖（長邊 256）與縮圖用的小遮罩畫一個小棋子（和匯出同一段繪製）；
 * 大圖只解碼目前的棋子與最近用過的幾張（sources.ts），名單有 60 張大圖時也不會吃掉 1 GB 以上的記憶體。
 */
import { useEffect, useState } from 'react';
import type { Look, TokenItem } from './model';
import { type Drawable, renderToken } from './render';
import {
  hasThumbMask,
  loadImageLite,
  loadThumbMask,
  peekImageLite,
  peekThumbMask,
} from './sources';
import { tokenPad } from './store';
import { requestTexture } from './textures';

export interface ThumbCustom {
  frame: Drawable | null;
  frameId: string | null;
  mask: Drawable | null;
}

/** 畫一個棋子的縮圖到 ctx（size × size；size 最好不要超過 256） */
export function drawTokenThumb(
  ctx: CanvasRenderingContext2D,
  token: TokenItem | null,
  look: Look,
  size: number,
  custom: ThumbCustom,
  { labels = true }: { labels?: boolean } = {},
): void {
  const lite = token?.image ? (peekImageLite(token.image.id) ?? null) : null;
  const popMask = token?.mask && token.popOn ? peekThumbMask(token.mask.id) : null;
  renderToken(
    ctx,
    {
      N: size,
      pad: tokenPad(look, token),
      look,
      token,
      cacheFrame: false,
      noLabels: !labels,
    },
    {
      image: lite?.thumb ?? null,
      size: token?.image ?? null,
      popMask,
      texture: requestTexture(look.texture, look.texSeed),
      customFrame: look.frame === 'custom' ? custom.frame : null,
      customFrameId: custom.frameId,
      customMask: custom.mask,
    },
  );
}

/** 名單裡每個棋子的小圖與縮圖用的遮罩都做好（做好一個就加 1） */
export function useLoadedTokens(tokens: readonly TokenItem[], feather: number): number {
  const [tick, setTick] = useState(0);
  const key = tokens
    .map((t) => `${t.image?.id ?? ''}:${t.mask?.id ?? ''}`)
    .join('|')
    .concat(`#${feather}`);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只看圖片與遮罩的 id、柔邊
  useEffect(() => {
    let alive = true;
    const bump = () => {
      if (alive) setTick((t) => t + 1);
    };
    for (const t of tokens) {
      if (!t.image) continue;
      if (!peekImageLite(t.image.id)) void loadImageLite(t.image).then(bump);
      if (t.mask && !hasThumbMask(t.mask.id, feather))
        void loadThumbMask(t.mask, t.image, feather).then(bump);
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return tick;
}
