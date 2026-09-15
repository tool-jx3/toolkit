import type { TextDecoSpec } from '../../types';
import type { GlyphRenderer, TextDrawContext } from '../draw';
import { extrudeDecorator } from './extrude';
import { fillDecorator } from './fill';
import { glowDecorator } from './glow';
import { knockoutDecorator } from './knockout';
import { offsetCopyDecorator } from './offsetCopy';
import { patternDecorator } from './pattern';
import { shadowDecorator } from './shadow';
import { strokeDecorator } from './stroke';
import type { TextDecorator } from './types';

export type { TextDecorator } from './types';

/** 追加は 1ファイル + この 1行 */
const REGISTRY: TextDecorator<any>[] = [
  strokeDecorator,
  fillDecorator,
  extrudeDecorator,
  shadowDecorator,
  glowDecorator,
  offsetCopyDecorator,
  patternDecorator,
  knockoutDecorator,
];

const BY_TYPE = new Map<string, TextDecorator<any>>(REGISTRY.map((d) => [d.type, d]));

export function getDecorator(type: string): TextDecorator<any> | undefined {
  return BY_TYPE.get(type);
}

/** decorations を背面から順に適用する */
export function applyDecorations(
  ctx: CanvasRenderingContext2D,
  glyphs: GlyphRenderer,
  decorations: TextDecoSpec[],
  t: number,
  c: TextDrawContext,
): void {
  for (const spec of decorations) {
    const deco = BY_TYPE.get(spec.type);
    if (!deco) {
      if (import.meta.env?.DEV) console.warn(`[deco] 未註冊的裝飾器：${spec.type}`);
      continue;
    }
    deco.draw(ctx, glyphs, spec as any, t, c);
  }
}
