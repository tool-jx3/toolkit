/**
 * 差分標籤（F66～F71、規格 3.9）：徽章、並排、軌道、純文字款。尺寸以單位計、乘上標籤大小倍率。
 * 名稱與英文標示用標籤字型（粗體）。
 */
import { drawIcon, roundRectPath } from './icons';
import { BASE_H, type LabelSetting, type Margin, type VariantItem } from './model';
import { contrastText, fontCssOf, type G, rgba, spacedText, spacedWidth } from './render';

const TAU = Math.PI * 2;

/** 擺放：左右類距畫布邊 30 單位，上方類在上邊距 ≥ 標籤高＋16 時放在上方框帶正中間，否則距上緣 30（下方同理） */
export const LABEL_PAD = 30;

export function indicatorCenter(
  label: Pick<LabelSetting, 'pos' | 'x' | 'y'>,
  box: { w: number; h: number },
  margin: Margin,
  VW: number,
): { cx: number; cy: number } {
  if (label.pos === 'free') return { cx: label.x * VW, cy: label.y * BASE_H };
  const pad = LABEL_PAD;
  const side = label.pos[1];
  const cx = side === 'l' ? pad + box.w / 2 : side === 'r' ? VW - pad - box.w / 2 : VW / 2;
  const cy =
    label.pos[0] === 't'
      ? margin.t >= box.h + 16
        ? margin.t / 2
        : pad + box.h / 2
      : margin.b >= box.h + 16
        ? BASE_H - margin.b / 2
        : BASE_H - pad - box.h / 2;
  return { cx, cy };
}

interface Box {
  w: number;
  h: number;
  textW?: number;
  nameW?: number;
  pad?: number;
  inner?: number;
  segs?: { item: VariantItem; w: number }[];
}

type Style = {
  measure: (g: G, s: number, family: string) => Box;
  draw: (g: G, x: number, y: number, box: Box, s: number, family: string) => void;
};

const setFont = (g: G, px: number, family: string) => {
  g.ctx.font = fontCssOf(px, true, family);
};
const measureOf = (g: G) => (s: string) => g.ctx.measureText(s).width;
const exported = (g: G) => g.state.variants.items.filter((i) => i.on);
const iconImage = (g: G, item: { icon: string; iconAsset: string | null }) =>
  item.icon === 'custom' && item.iconAsset ? g.env.image(item.iconAsset) : undefined;

const badge: Style = {
  measure(g, s, family) {
    const ind = g.state.variants.label;
    const slot = g.slot;
    setFont(g, 34 * s, family);
    let textW = g.ctx.measureText(slot.name).width;
    if (ind.showSub && slot.sub) {
      setFont(g, 14 * s, family);
      textW = Math.max(textW, spacedWidth(measureOf(g), slot.sub, 14 * s * 0.18));
    }
    const icon = slot.icon === 'none' ? 0 : 44 * s + 12 * s;
    return { w: 20 * s + icon + textW + 26 * s, h: 76 * s, textW };
  },
  draw(g, x, y, box, s, family) {
    const ctx = g.ctx;
    const ind = g.state.variants.label;
    const slot = g.slot;
    ctx.beginPath();
    roundRectPath(ctx, x, y, box.w, box.h, box.h / 2);
    ctx.fillStyle = rgba(slot.accent, ind.bgAlpha);
    ctx.fill();
    /* 背景濃度低於 35% 時用文字色，否則依強調色自動黑白 */
    const fg = ind.bgAlpha < 0.35 ? slot.text : contrastText(slot.accent);
    const cy = y + box.h / 2;
    let tx = x + 20 * s;
    if (slot.icon !== 'none') {
      drawIcon(ctx, slot.icon, tx + 22 * s, cy, 22 * s, fg, iconImage(g, slot));
      tx += 44 * s + 12 * s;
    }
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    const sub = ind.showSub && slot.sub;
    const textW = box.textW ?? 0;
    setFont(g, 34 * s, family);
    spacedText(ctx, slot.name, tx + textW / 2, sub ? cy - 8 * s : cy + 1 * s, 0, 'center', 'fill');
    if (sub) {
      setFont(g, 14 * s, family);
      spacedText(ctx, slot.sub, tx + textW / 2, cy + 19 * s, 14 * s * 0.18, 'center', 'fill');
    }
  },
};

const tabs: Style = {
  measure(g, s, family) {
    setFont(g, 24 * s, family);
    const segs = exported(g).map((item) => {
      const icon = item.icon === 'none' ? 0 : 28 * s + 8 * s;
      return { item, w: 14 * s * 2 + icon + g.ctx.measureText(item.name).width };
    });
    const inner = 5 * s;
    return { w: segs.reduce((sum, seg) => sum + seg.w, 0) + inner * 2, h: 56 * s, segs, inner };
  },
  draw(g, x, y, box, s, family) {
    const ctx = g.ctx;
    const ind = g.state.variants.label;
    const cur = g.slot;
    const inner = box.inner ?? 0;
    ctx.beginPath();
    roundRectPath(ctx, x, y, box.w, box.h, box.h / 2);
    ctx.fillStyle = rgba(cur.frame2, ind.bgAlpha * 0.85);
    ctx.fill();
    ctx.lineWidth = 1.5 * s;
    ctx.strokeStyle = rgba(cur.text, 0.3);
    ctx.stroke();
    let sx = x + inner;
    const segH = box.h - inner * 2;
    for (const seg of box.segs ?? []) {
      const active = seg.item.id === cur.id;
      if (active) {
        ctx.beginPath();
        roundRectPath(ctx, sx, y + inner, seg.w, segH, segH / 2);
        ctx.fillStyle = cur.accent;
        ctx.fill();
      }
      const fg = active ? contrastText(cur.accent) : rgba(cur.text, 0.5);
      let tx = sx + 14 * s;
      const cy = y + box.h / 2;
      if (seg.item.icon !== 'none') {
        drawIcon(ctx, seg.item.icon, tx + 14 * s, cy, 14 * s, fg, iconImage(g, seg.item));
        tx += 36 * s;
      }
      setFont(g, 24 * s, family);
      ctx.fillStyle = fg;
      ctx.textBaseline = 'middle';
      spacedText(ctx, seg.item.name, tx, cy + 1 * s, 0, 'left', 'fill');
      sx += seg.w;
    }
  },
};

const dial: Style = {
  measure(g, s) {
    return { w: 224 * s, h: (g.state.variants.label.showSub ? 184 : 164) * s };
  },
  draw(g, x, y, box, s, family) {
    const ctx = g.ctx;
    const ind = g.state.variants.label;
    const cur = g.slot;
    if (ind.bgAlpha > 0) {
      ctx.beginPath();
      roundRectPath(ctx, x, y, box.w, box.h, 20 * s);
      ctx.fillStyle = rgba(cur.frame2, ind.bgAlpha * 0.85);
      ctx.fill();
      ctx.lineWidth = 1.5 * s;
      ctx.strokeStyle = rgba(cur.accent, 0.6);
      ctx.stroke();
    }
    const cx = x + box.w / 2;
    const horizon = y + 112 * s;
    const R = 80 * s;
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = rgba(cur.text, 0.5);
    ctx.setLineDash([2 * s, 9 * s]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, horizon, R, Math.PI, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = cur.text;
    ctx.beginPath();
    ctx.moveTo(cx - R - 16 * s, horizon);
    ctx.lineTo(cx + R + 16 * s, horizon);
    ctx.stroke();
    const items = exported(g);
    items.forEach((item, i) => {
      const a = Math.PI + (Math.PI * (i + 0.5)) / items.length;
      const px = cx + Math.cos(a) * R;
      const py = horizon + Math.sin(a) * R;
      if (item.id !== cur.id) {
        ctx.beginPath();
        ctx.arc(px, py, 5 * s, 0, TAU);
        ctx.fillStyle = rgba(cur.text, 0.45);
        ctx.fill();
        return;
      }
      ctx.save();
      ctx.shadowColor = cur.accent;
      ctx.shadowBlur = 18 * s * g.k;
      drawIcon(
        ctx,
        item.icon === 'none' ? 'star' : item.icon,
        px,
        py,
        24 * s,
        cur.accent,
        iconImage(g, item),
      );
      ctx.restore();
    });
    ctx.fillStyle = cur.text;
    ctx.textBaseline = 'middle';
    setFont(g, 28 * s, family);
    spacedText(ctx, cur.name, cx, horizon + 30 * s, 0, 'center', 'fill');
    if (ind.showSub && cur.sub) {
      setFont(g, 13 * s, family);
      ctx.fillStyle = cur.accent;
      spacedText(ctx, cur.sub, cx, horizon + 58 * s, 13 * s * 0.2, 'center', 'fill');
    }
  },
};

const label: Style = {
  measure(g, s, family) {
    const ind = g.state.variants.label;
    const slot = g.slot;
    setFont(g, 42 * s, family);
    const nameW = spacedWidth(measureOf(g), slot.name, 42 * s * 0.15);
    const sub = ind.showSub && slot.sub;
    const pad = ind.bgAlpha > 0 ? 12 * s : 0;
    return {
      w: nameW + (56 * s + 18 * s) * 2 + pad * 2,
      h: 42 * s * 1.25 + (sub ? 26 * s : 0) + pad * 2,
      nameW,
      pad,
    };
  },
  draw(g, x, y0, box0, s, family) {
    const ctx = g.ctx;
    const ind = g.state.variants.label;
    const slot = g.slot;
    const pad = box0.pad ?? 0;
    if (ind.bgAlpha > 0) {
      ctx.beginPath();
      roundRectPath(ctx, x, y0, box0.w, box0.h, 10 * s);
      ctx.fillStyle = rgba(slot.frame2, ind.bgAlpha);
      ctx.fill();
      ctx.lineWidth = 1.5 * s;
      ctx.strokeStyle = rgba(slot.accent, 0.7 * ind.bgAlpha);
      ctx.stroke();
    }
    const y = y0 + pad;
    const h = box0.h - pad * 2;
    const cx = x + box0.w / 2;
    const nameY = y + 42 * s * 0.62;
    ctx.fillStyle = slot.text;
    ctx.textBaseline = 'middle';
    setFont(g, 42 * s, family);
    spacedText(ctx, slot.name, cx, nameY, 42 * s * 0.15, 'center', 'fill');
    ctx.strokeStyle = slot.accent;
    ctx.fillStyle = slot.accent;
    ctx.lineWidth = 2 * s;
    const nameW = box0.nameW ?? 0;
    for (const dir of [-1, 1]) {
      const near = cx + dir * (nameW / 2 + 18 * s);
      const far = near + dir * 56 * s;
      ctx.beginPath();
      ctx.moveTo(near, nameY);
      ctx.lineTo(far, nameY);
      ctx.stroke();
      const d = 5 * s;
      ctx.beginPath();
      ctx.moveTo(far, nameY - d);
      ctx.lineTo(far + d, nameY);
      ctx.lineTo(far, nameY + d);
      ctx.lineTo(far - d, nameY);
      ctx.closePath();
      ctx.fill();
    }
    if (ind.showSub && slot.sub) {
      setFont(g, 15 * s, family);
      spacedText(ctx, slot.sub, cx, y + h - 11 * s, 15 * s * 0.3, 'center', 'fill');
    }
  },
};

const STYLES: Partial<Record<LabelSetting['style'], Style>> = { badge, tabs, dial, label };

export function drawIndicator(g: G): void {
  const v = g.state.variants;
  const ind = v.label;
  const style = STYLES[ind.style];
  if (!v.enabled || !style) return;
  const ctx = g.ctx;
  const s = ind.scale;
  const family = g.env.fontFamily(ind.font);
  ctx.save();
  const box = style.measure(g, s, family);
  const { cx, cy } = indicatorCenter(ind, box, g.state.opening.margin, g.VW);
  style.draw(g, cx - box.w / 2, cy - box.h / 2, box, s, family);
  ctx.restore();
  g.hits.push({ id: 'indicator', cx, cy, w: box.w, h: box.h, rotation: 0 });
}
