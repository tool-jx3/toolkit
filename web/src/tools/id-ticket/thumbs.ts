/**
 * 範本清單的縮圖：用目前的欄位、樣式、照片畫每一款的正面（證件）或整張票（票券），縮到方格裡。
 */
import { rrect } from './kit';
import { CARD_RADIUS_U, cardUnits, type IdTicketState } from './model';
import { drawIdFace, drawTicket, ticketSize } from './render';
import { assets } from './store';
import { type IdTemplateId, idTemplate, type TicketTemplateId } from './templates';

/** 縮圖畫布的像素 */
export const THUMB = { w: 180, h: 160 } as const;
const MARGIN = 10;

export function drawThumb(
  ctx: CanvasRenderingContext2D,
  doc: IdTicketState,
  value: string,
  idPhoto: CanvasImageSource | null,
): void {
  ctx.clearRect(0, 0, THUMB.w, THUMB.h);
  ctx.save();
  if (doc.kind === 'id') {
    const s: IdTicketState = { ...doc, idTemplate: value as IdTemplateId };
    const { w, h } = cardUnits(idTemplate(s.idTemplate).orientation);
    const k = Math.min((THUMB.w - MARGIN * 2) / w, (THUMB.h - MARGIN * 2) / h);
    ctx.translate((THUMB.w - w * k) / 2, (THUMB.h - h * k) / 2);
    ctx.scale(k, k);
    ctx.beginPath();
    rrect(ctx, 0, 0, w, h, CARD_RADIUS_U);
    ctx.clip();
    drawIdFace(ctx, s, 'front', { preview: false, photo: idPhoto });
  } else {
    const s: IdTicketState = { ...doc, ticketTemplate: value as TicketTemplateId };
    const { width, height } = ticketSize(s);
    const k = Math.min((THUMB.w - MARGIN * 2) / width, (THUMB.h - MARGIN * 2) / height);
    ctx.translate((THUMB.w - width * k) / 2, (THUMB.h - height * k) / 2);
    ctx.scale(k, k);
    const id = doc.ticketPhotos[s.ticketTemplate]?.image.id;
    drawTicket(ctx, s, { preview: false, photo: (id && assets.peekBitmap(id)) || null });
  }
  ctx.restore();
}
