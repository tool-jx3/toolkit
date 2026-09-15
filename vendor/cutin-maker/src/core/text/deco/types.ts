import type { TextDecoSpec } from '../../types';
import type { GlyphRenderer, TextDrawContext } from '../draw';

export interface TextDecorator<S extends TextDecoSpec = TextDecoSpec> {
  readonly type: S['type'];
  draw(ctx: CanvasRenderingContext2D, glyphs: GlyphRenderer, spec: S, t: number, c: TextDrawContext): void;
}
