/**
 * 畫證件與票券（預覽與匯出同一套畫法，規格 3.1、3.3）：
 * - 證件：一面畫在成品（卡片：裁掉出血、圓角外透明）或含出血（印刷：58 × 90 mm、白底）的畫布上；
 * - 票券：票本身畫在透明的圖層上，再放到墊紙上（墊紙：四邊 46、圓角 34）；
 * - 畫的時候順便記下可以點的範圍（Region）與用到的字型。
 */
import { makeCanvas } from '@/core/image';
import { mix, tint } from './colors';
import { employee, highschool, press, university } from './faces/cards1';
import { detective, member, police } from './faces/cards2';
import type { IdEnv, IdFaces } from './faces/common';
import { TICKET_DRAWINGS, type TicketEnv, ticketPalette } from './faces/tickets';
import { type Ctx, type FontUse, fontUses, type PhotoSource, type Region, rrect } from './kit';
import {
  BLEED_U,
  CARD_RADIUS_U,
  captionOf,
  cardUnits,
  formatAmount,
  type IdExportMode,
  type IdTicketState,
  type Photo,
  receiptTotals,
  SAFE_U,
  type Side,
  UNITS_PER_MM,
} from './model';
import { qrMatrix } from './qr';
import {
  ID_TEMPLATES,
  type IdTemplate,
  type IdTemplateId,
  idTemplate,
  QR_KEY,
  TICKET_TEMPLATES,
  type TicketTemplate,
  ticketTemplate,
} from './templates';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export const FACES: Record<IdTemplateId, IdFaces> = {
  employee,
  highschool,
  university,
  press,
  police,
  member,
  detective,
};

/** 預覽畫布的解析度（設計單位的幾倍） */
export const PREVIEW_SCALE = 3;
/** 票券預覽的解析度 */
export const TICKET_PREVIEW_SCALE = 2;
/** 墊紙：票的四周留 46、圓角 34（票券單位） */
export const MAT_PAD = 46;
export const MAT_RADIUS = 34;

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

function photoSource(
  photo: Photo | null | undefined,
  bitmap: CanvasImageSource | null,
): PhotoSource | null {
  if (!photo || !bitmap) return null;
  return { bitmap, width: photo.image.width, height: photo.image.height, place: photo.place };
}

/* ======================================================================
 * 證件
 * ==================================================================== */

/** 會員卡的自動漸層（主題色算出來的上、下兩色） */
export const autoGradient = (c: string): [string, string] => [
  tint(c, 0.55),
  mix(tint(c, 0.85), '#fff8ec', 0.5),
];

/** 欄位的名稱（任何一款證件有這個欄位就用那一款的名稱） */
function idLabel(key: string, tpl: IdTemplate): string {
  const own = tpl.fields.find((f) => f.key === key);
  if (own) return own.label;
  for (const t of ID_TEMPLATES) {
    const f = t.fields.find((x) => x.key === key);
    if (f) return f.label;
  }
  return key;
}

export function idQrContent(s: IdTicketState, tpl: IdTemplate = idTemplate(s.idTemplate)): string {
  return (
    (s.idValues[QR_KEY] ?? '').trim() || (s.idValues[tpl.codeKey] ?? '').trim() || tpl.qrFallback
  );
}

export interface FaceDrawOptions {
  preview: boolean;
  photo: CanvasImageSource | null;
  fonts?: Map<string, Set<string>>;
}

/** 在 ctx 目前的變換下（原點＝成品左上角、單位＝設計單位）畫一面；回傳可以點的範圍 */
export function drawIdFace(ctx: Ctx, s: IdTicketState, side: Side, o: FaceDrawOptions): Region[] {
  const tpl = idTemplate(s.idTemplate);
  const style = s.idStyles[tpl.id];
  const { w, h } = cardUnits(tpl.orientation);
  const auto = autoGradient(style.color);
  const regions: Region[] = [];
  const env: IdEnv = {
    ctx,
    preview: o.preview,
    value: (k) => s.idValues[k] ?? '',
    label: (k) => idLabel(k, tpl),
    photo: photoSource(s.idPhoto, o.photo),
    regions,
    fonts: o.fonts,
    baseInverse: ctx.getTransform().inverse(),
    W: w,
    H: h,
    B: BLEED_U,
    S: SAFE_U,
    c: style.color,
    dk: style.dark,
    g1: style.g1 ?? auto[0],
    g2: style.g2 ?? auto[1],
    tpl,
    qrContent: idQrContent(s, tpl),
    code: s.idValues[tpl.codeKey] ?? '',
  };
  ctx.save();
  FACES[tpl.id][side](env);
  ctx.restore();
  return regions;
}

/**
 * 一面的畫布：
 * - 'card'：成品大小、圓角外透明；
 * - 'print'：含出血、白底（印刷廠裁切用）。
 * scale＝每個設計單位幾個像素（匯出 600 dpi ≈ 4.295、預覽 3）。
 */
export function renderIdFace(
  s: IdTicketState,
  side: Side,
  scale: number,
  mode: IdExportMode,
  o: Omit<FaceDrawOptions, 'fonts'>,
  size?: { width: number; height: number },
): { canvas: AnyCanvas; regions: Region[] } {
  const tpl = idTemplate(s.idTemplate);
  const { w, h } = cardUnits(tpl.orientation);
  const bleed = mode === 'print' ? BLEED_U : 0;
  const width = size?.width ?? Math.round((w + bleed * 2) * scale);
  const height = size?.height ?? Math.round((h + bleed * 2) * scale);
  const canvas = makeCanvas(width, height);
  const ctx = ctx2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (mode === 'print') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.scale(scale, scale);
  ctx.translate(bleed, bleed);
  if (mode === 'card') {
    ctx.beginPath();
    rrect(ctx, 0, 0, w, h, CARD_RADIUS_U);
    ctx.clip();
  }
  const regions = drawIdFace(ctx, s, side, o);
  return { canvas, regions };
}

/** 畫一次（不顯示）收集用到的字型與字：預覽與匯出前先載好 */
export function idFontUses(s: IdTicketState): FontUse[] {
  const fonts = new Map<string, Set<string>>();
  const c = makeCanvas(1, 1);
  const ctx = ctx2d(c);
  for (const side of ['front', 'back'] as const) {
    ctx.save();
    drawIdFace(ctx, s, side, { preview: true, photo: null, fonts });
    ctx.restore();
  }
  return fontUses(fonts);
}

/* ======================================================================
 * 票券
 * ==================================================================== */

export function ticketSize(
  s: IdTicketState,
  tpl: TicketTemplate = ticketTemplate(s.ticketTemplate),
) {
  const d = TICKET_DRAWINGS[tpl.id];
  return {
    width: d.width,
    height: d.height({ items: s.receiptItems.length, receiptPhoto: s.receiptPhoto }),
  };
}

/** 含墊紙（或不含）的大小 */
export function ticketStageSize(s: IdTicketState, mat: boolean) {
  const t = ticketSize(s);
  const pad = mat ? MAT_PAD * 2 : 0;
  return { width: t.width + pad, height: t.height + pad };
}

export function ticketQrContent(s: IdTicketState, tpl: TicketTemplate): string {
  const v = s.ticketValues[tpl.id] ?? {};
  return (v[QR_KEY] ?? '').trim() || (v[tpl.codeKey] ?? '').trim() || 'TICKET';
}

/** 證件印出來 QR code 每格至少幾 mm（再小手機多半掃不到） */
export const QR_MIN_MODULE_MM = 0.3;
/** 票券 1 倍時 QR code 每格至少幾 px */
export const QR_MIN_MODULE_PX = 2;

export interface QrDensity {
  /** 一邊幾格 */
  modules: number;
  /** 每格多大：證件是印出來的 mm，票券是 1 倍時的 px */
  module: number;
  unit: 'mm' | 'px';
  /** 太密（可能掃不到） */
  dense: boolean;
}

/** 目前這一款的 QR code 有多密；沒有 QR code 的範本 null */
export function qrDensity(s: IdTicketState): QrDensity | null {
  const id = s.kind === 'id';
  const tpl = id ? idTemplate(s.idTemplate) : ticketTemplate(s.ticketTemplate);
  if (!tpl.qr) return null;
  const content = id
    ? idQrContent(s, tpl as IdTemplate)
    : ticketQrContent(s, tpl as TicketTemplate);
  const m = qrMatrix(content);
  if (!m) return null;
  const inner = (tpl.qr.size - tpl.qr.pad * 2) / m.size;
  const module = id ? inner / UNITS_PER_MM : inner;
  return {
    modules: m.size,
    module,
    unit: id ? 'mm' : 'px',
    dense: module < (id ? QR_MIN_MODULE_MM : QR_MIN_MODULE_PX),
  };
}

/** 在 ctx 目前的變換下（原點＝票的左上角、單位＝票券單位）畫票；回傳可以點的範圍 */
export function drawTicket(ctx: Ctx, s: IdTicketState, o: FaceDrawOptions): Region[] {
  const tpl = ticketTemplate(s.ticketTemplate);
  const values = s.ticketValues[tpl.id] ?? {};
  const regions: Region[] = [];
  const env: TicketEnv = {
    ctx,
    preview: o.preview,
    value: (k) => values[k] ?? '',
    label: (k) => tpl.fields.find((f) => f.key === k)?.label ?? k,
    photo: tpl.photo ? photoSource(s.ticketPhotos[tpl.id], o.photo) : null,
    regions,
    fonts: o.fonts,
    baseInverse: ctx.getTransform().inverse(),
    tpl,
    p: ticketPalette(s.theme.c1, s.theme.c2),
    caption: (k) => captionOf(s, tpl, k),
    code: values[tpl.codeKey] ?? '',
    qrContent: ticketQrContent(s, tpl),
    items: s.receiptItems,
    totals: receiptTotals(s.receiptItems, values.rc_discount ?? ''),
    receiptPhoto: s.receiptPhoto,
    fmt: formatAmount,
  };
  ctx.save();
  TICKET_DRAWINGS[tpl.id].draw(env);
  ctx.restore();
  return regions;
}

/** 票本身（四周透明）的畫布 */
export function renderTicketLayer(
  s: IdTicketState,
  scale: number,
  o: Omit<FaceDrawOptions, 'fonts'>,
): { canvas: AnyCanvas; regions: Region[] } {
  const { width, height } = ticketSize(s);
  const canvas = makeCanvas(Math.round(width * scale), Math.round(height * scale));
  const ctx = ctx2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);
  const regions = drawTicket(ctx, s, o);
  return { canvas, regions };
}

/** 墊紙的顏色 */
export const matColor = (s: IdTicketState): string => ticketPalette(s.theme.c1, s.theme.c2).mat;

/** 票放到墊紙上（mat＝false 時只有票、四周透明） */
export function composeTicket(
  s: IdTicketState,
  layer: AnyCanvas,
  scale: number,
  mat: boolean,
): AnyCanvas {
  if (!mat) return layer;
  const pad = Math.round(MAT_PAD * scale);
  const out = makeCanvas(layer.width + pad * 2, layer.height + pad * 2);
  const ctx = ctx2d(out);
  ctx.beginPath();
  rrect(ctx, 0, 0, out.width, out.height, MAT_RADIUS * scale);
  ctx.fillStyle = matColor(s);
  ctx.fill();
  ctx.drawImage(layer, pad, pad);
  return out;
}

export function ticketFontUses(s: IdTicketState): FontUse[] {
  const fonts = new Map<string, Set<string>>();
  const ctx = ctx2d(makeCanvas(1, 1));
  drawTicket(ctx, s, { preview: true, photo: null, fonts });
  return fontUses(fonts);
}

/** 範本縮圖用到的字型（每一款證件的正面、每一款票券） */
export function thumbFontUses(s: IdTicketState, kind: IdTicketState['kind']): FontUse[] {
  const fonts = new Map<string, Set<string>>();
  const ctx = ctx2d(makeCanvas(1, 1));
  if (kind === 'id')
    for (const t of ID_TEMPLATES)
      drawIdFace(ctx, { ...s, idTemplate: t.id }, 'front', { preview: false, photo: null, fonts });
  else
    for (const t of TICKET_TEMPLATES)
      drawTicket(ctx, { ...s, ticketTemplate: t.id }, { preview: false, photo: null, fonts });
  return fontUses(fonts);
}

/** 目前類別用到的字型 */
export const fontUsesOf = (s: IdTicketState): FontUse[] =>
  s.kind === 'id' ? idFontUses(s) : ticketFontUses(s);

/* ======================================================================
 * GIF：票微微浮起、一道光掃過（規格 3.5）
 * ==================================================================== */

export const GIF_FRAMES = 48;
export const GIF_DELAY_MS = 70;

/** 第 i 格的狀態：上下位移（像素，往上為負）、陰影、光的位置（0～1，null＝沒有光） */
export function gifFrameState(i: number, scale: number) {
  const t = i / GIF_FRAMES;
  const wave = Math.sin(t * Math.PI * 2);
  const lift = Math.max(3, Math.round(4 * scale));
  const sweep = t / 0.5;
  return {
    dy: -Math.round(wave * lift),
    shadowAlpha: 0.2 - wave * 0.03,
    shadowBlur: Math.round((30 + wave * 6) * scale),
    shadowY: Math.round((16 + wave * 4) * scale),
    /* 前半段光從左上掃到右下（平滑的 S 形） */
    shine: sweep <= 1 ? sweep * sweep * (3 - 2 * sweep) : null,
  };
}

/** GIF 的倍率：墊紙＋票的長邊縮到 long 以內、最多 2 倍 */
export function gifScale(s: IdTicketState, long: number): number {
  const st = ticketStageSize(s, true);
  return Math.min(2, long / Math.max(st.width, st.height));
}

/**
 * 畫 GIF 的一格到 out（out 的大小＝含墊紙的大小 × 倍率）：墊紙底（方角）→ 陰影 → 票（浮起、有光的那幾格加上光）。
 */
export function drawGifFrame(
  out: Ctx,
  width: number,
  height: number,
  s: IdTicketState,
  layer: AnyCanvas,
  shine: AnyCanvas,
  scale: number,
  i: number,
): void {
  const st = gifFrameState(i, scale);
  const sctx = ctx2d(shine);
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, shine.width, shine.height);
  sctx.drawImage(layer, 0, 0);
  if (st.shine !== null) {
    const tw = shine.width;
    const th = shine.height;
    const L = tw + th;
    const c = -0.25 * L + st.shine * 1.5 * L;
    const band = 0.09 * L;
    const g = sctx.createLinearGradient(c - band, (c - band) * 0.35, c + band, (c + band) * 0.35);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.globalCompositeOperation = 'source-atop';
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, tw, th);
    sctx.globalCompositeOperation = 'source-over';
  }
  out.save();
  out.fillStyle = matColor(s);
  out.fillRect(0, 0, width, height);
  out.shadowColor = `rgba(60,40,30,${st.shadowAlpha.toFixed(3)})`;
  out.shadowBlur = st.shadowBlur;
  out.shadowOffsetY = st.shadowY;
  const pad = Math.round(MAT_PAD * scale);
  out.drawImage(shine, pad, pad + st.dy);
  out.restore();
}
