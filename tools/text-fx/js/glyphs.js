/* 文字演出產生器：逐字預先畫好的小畫布（sprite）
 *
 * 每個字分成三張：
 *   halo  ─ 光暈（只在字形外側，字形本體挖空）
 *   body  ─ 陰影（字形本體挖空）＋外側外框＋外框＋填色，在同一張裡疊好
 *   flash ─ 字形剪影（填色＋外框範圍）塗白，給閃白效果用
 * 淡入淡出時整張 body 一起變透明，所以半透明的字裡不會透出外框或陰影。 */
import { makeCanvas } from './core.js';

const FAR = 4096; // 陰影技巧：把形狀畫在畫布外，只留下陰影

function silhouette(x, ch, ox, oy, strokeTotal) {
  x.fillText(ch, ox, oy);
  if (strokeTotal > 0) {
    x.lineWidth = strokeTotal * 2;
    x.strokeText(ch, ox, oy);
  }
}

function fillStyleFor(x, fill, grad, ox, oy) {
  if (fill.type !== 'gradient') return fill.color;
  const stops = fill.colors.filter(Boolean);
  if (stops.length < 2) return stops[0] || fill.color;
  let g;
  if (grad.kind === 'v') g = x.createLinearGradient(0, oy + grad.y0, 0, oy + grad.y1);
  else g = x.createLinearGradient(ox + grad.x0, oy + grad.y0, ox + grad.x1, oy + grad.y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

/* 畫一個字的三張 sprite。
 * m: 量測結果；central: 字身中心在基線上方的距離；style: 已換算成 px 的樣式；grad: 漸層範圍（相對筆位） */
export function paintGlyph(ch, css, m, adv, central, style, grad, italic) {
  if (!ch.trim()) return null;
  const sw = style.stroke ? style.stroke.w : 0;
  const ow = style.outer ? style.outer.w : 0;
  const strokeTotal = sw + ow;
  const shadowExt = style.shadow ? style.shadow.blur * 1.5 + Math.max(Math.abs(style.shadow.x), Math.abs(style.shadow.y)) : 0;
  const haloExt = style.glow ? style.glow.spread * 1.7 : 0;
  const pad = Math.ceil(strokeTotal + Math.max(shadowExt, haloExt) + 3);
  const slant = italic ? Math.ceil((m.a + m.d) * 0.25) : 0;
  const left = Math.ceil(Math.max(m.l, 0)) + pad + slant;
  const top = Math.ceil(Math.max(m.a, 0)) + pad;
  const w = left + Math.ceil(Math.max(m.r, adv * 0.5)) + pad + slant;
  const h = top + Math.ceil(Math.max(m.d, 0)) + pad;
  const ox = left, oy = top;

  const prep = x => {
    x.font = css;
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    x.lineJoin = 'round';
    x.lineCap = 'round';
    x.miterLimit = 2;
  };

  /* body */
  const body = makeCanvas(w, h);
  const b = body.getContext('2d');
  prep(b);
  if (style.shadow) {
    b.save();
    b.shadowColor = style.shadow.color;
    b.shadowBlur = style.shadow.blur;
    b.shadowOffsetX = style.shadow.x + FAR;
    b.shadowOffsetY = style.shadow.y;
    b.fillStyle = '#000';
    b.strokeStyle = '#000';
    silhouette(b, ch, ox - FAR, oy, strokeTotal);
    b.restore();
    b.globalCompositeOperation = 'destination-out';
    b.fillStyle = '#000';
    b.strokeStyle = '#000';
    silhouette(b, ch, ox, oy, strokeTotal);
    b.globalCompositeOperation = 'source-over';
  }
  if (style.outer) {
    b.lineWidth = strokeTotal * 2;
    b.strokeStyle = style.outer.color;
    b.strokeText(ch, ox, oy);
  }
  if (style.stroke) {
    b.lineWidth = sw * 2;
    b.strokeStyle = style.stroke.color;
    b.strokeText(ch, ox, oy);
  }
  const fillA = style.fill.opacity;
  if (fillA < 1 && strokeTotal > 0) {
    /* 塗色半透明時，先把字形內側的外框挖掉：透明的地方就是透明，不是外框色 */
    b.globalCompositeOperation = 'destination-out';
    b.fillStyle = '#000';
    b.fillText(ch, ox, oy);
    b.globalCompositeOperation = 'source-over';
  }
  if (fillA > 0) {
    b.globalAlpha = fillA;
    b.fillStyle = fillStyleFor(b, style.fill, grad, ox, oy);
    b.fillText(ch, ox, oy);
    b.globalAlpha = 1;
  }

  /* halo */
  let halo = null;
  if (style.glow) {
    halo = makeCanvas(w, h);
    const g = halo.getContext('2d');
    prep(g);
    g.shadowColor = style.glow.color;
    g.shadowBlur = style.glow.spread;
    g.shadowOffsetX = FAR;
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    silhouette(g, ch, ox - FAR, oy, strokeTotal);
    silhouette(g, ch, ox - FAR, oy, strokeTotal); // 疊兩次讓強度 1 就有明顯的光
    g.shadowColor = 'transparent';
    g.globalCompositeOperation = 'destination-out';
    silhouette(g, ch, ox, oy, strokeTotal);
  }

  const art = {
    body, halo, w, h,
    px: ox + adv / 2, py: oy - central, // 樞紐點（字身中心）在 sprite 內的位置
    _flash: null,
    flash() {
      if (!this._flash) {
        const c = makeCanvas(w, h);
        const x = c.getContext('2d');
        prep(x);
        x.fillStyle = '#fff';
        x.strokeStyle = '#fff';
        silhouette(x, ch, ox, oy, strokeTotal);
        this._flash = c;
      }
      return this._flash;
    }
  };
  return art;
}
