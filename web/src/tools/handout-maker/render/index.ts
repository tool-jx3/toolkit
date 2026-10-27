/**
 * 畫一張線索道具（預覽與匯出同一段程式，規格 3.3）：依主題剪出外形，畫底、內容與框。
 * 整張以畫面 px 排版，畫布大小＝寬高 × 倍率。
 */
import { makeCanvas } from '@/core/image';
import { DECOR_SANS, DECOR_SERIF, FONT_SPECS, type FontNeed } from '../fonts';
import { parseSms, plainText } from '../markup';
import { type Handout, resolveFontId, THEME_FIELDS } from '../model';
import { S } from '../strings';
import type { AnyCanvas, Ctx } from './canvas';
import { type PaintEnv, Painter, type PaintResult } from './painter';
import { THEME_PAINTERS, terminalHeader } from './themes';

export type { AnyCanvas, Ctx } from './canvas';
export type { PaintEnv, PaintResult } from './painter';
export { terminalHeader } from './themes';

/** 畫在 ctx 上（ctx 已經是 W × scale、H × scale 的畫布；這裡會清空並設定倍率） */
export function paintHandout(ctx: Ctx, h: Handout, env: PaintEnv): PaintResult {
  const painter = THEME_PAINTERS[h.theme];
  ctx.save();
  ctx.setTransform(env.scale, 0, 0, env.scale, 0, 0);
  ctx.clearRect(0, 0, h.width, h.height);
  ctx.beginPath();
  painter.shape(ctx, h.width, h.height);
  ctx.clip();
  const p = new Painter(ctx, h, env);
  painter.paint(p);
  ctx.restore();
  return { overflow: p.overflow };
}

/** 輸出的像素大小 */
export const outputSize = (h: Pick<Handout, 'width' | 'height'>, scale: number) => ({
  width: Math.max(1, Math.round(h.width * scale)),
  height: Math.max(1, Math.round(h.height * scale)),
});

/** 畫成一張新的畫布 */
export function renderHandout(
  h: Handout,
  env: PaintEnv,
): { canvas: AnyCanvas; result: PaintResult } {
  const size = outputSize(h, env.scale);
  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  const result = paintHandout(ctx, h, env);
  return { canvas, result };
}

/** 這張用到的字（字型只下載這些字需要的部分） */
export function fontNeeds(h: Handout): FontNeed[] {
  const spec = FONT_SPECS[resolveFontId(h)];
  const fields = THEME_FIELDS[h.theme];
  const body =
    h.theme === 'sms'
      ? parseSms(h.body)
          .map((m) => m.text)
          .join('')
      : plainText(h.body);
  const boldBody = h.theme === 'status' || h.theme === 'wanted';
  const regular = [
    boldBody ? '' : body,
    h.theme === 'terminal' ? `${terminalHeader(h.extra.prompt, h.title)}> _` : '',
    h.theme === 'newspaper' ? h.extra.dateline : '',
    h.theme === 'status' ? h.extra.label : '',
    h.theme === 'email'
      ? `${h.extra.from}${h.extra.to}${h.extra.date}${S.mailFrom}${S.mailTo}${S.mailDate}`
      : '',
  ].join('');
  const bold = [
    fields.title ? h.title : '',
    boldBody ? body : '',
    h.theme === 'sms' ? h.extra.contact : '',
    h.theme === 'email' ? (Array.from(h.extra.from)[0] ?? '').toUpperCase() : '',
  ].join('');
  const needs: FontNeed[] = [];
  if (regular.trim()) needs.push({ family: spec.family, weight: spec.regular, text: regular });
  if (bold.trim()) needs.push({ family: spec.family, weight: spec.bold, text: bold });
  if (h.theme === 'window' && h.title.trim())
    needs.push({ family: DECOR_SANS, weight: 600, text: h.title });
  if (h.theme === 'newspaper' && h.extra.masthead.trim())
    needs.push({ family: DECOR_SERIF, weight: 900, text: h.extra.masthead });
  if (h.theme === 'newspaper' && h.title.trim())
    needs.push({ family: spec.family, weight: 900, text: h.title });
  if (h.theme === 'wanted' && h.extra.heading.trim())
    needs.push({ family: DECOR_SERIF, weight: 900, text: h.extra.heading });
  if (h.theme === 'polaroid' && !h.image)
    needs.push({ family: DECOR_SANS, weight: 400, text: S.noPhoto });
  return needs;
}

/** 縮圖：長邊 longSide px 的畫布（清單、範例用） */
export function renderThumb(
  h: Handout,
  longSide: number,
  image: PaintEnv['image'] = null,
  bgImage: PaintEnv['bgImage'] = null,
): AnyCanvas {
  const scale = longSide / Math.max(h.width, h.height);
  return renderHandout(h, { scale, image, bgImage }).canvas;
}
