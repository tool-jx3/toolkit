/* 文字演出產生器：裝飾（線條、框、色帶、膠帶）與整張背景
 *
 * 形狀先以「文字區塊左上角為原點」計算，用來算出裝飾佔多少空間（置中、自動縮小都要算進去），
 * 放到畫面上之後再平移成絕對座標。 */
import { rgba, clamp01, makeCanvas } from './core.js';

export const DECO_CHOICES = [
  ['none', '無'],
  ['band', '柔光色帶'],
  ['tape', '警示膠帶'],
  ['roundBox', '圓角底框'],
  ['frame', '標題長框'],
  ['rails', '上下雙線'],
  ['underline', '底線'],
  ['dashes', '兩側短線'],
  ['sideBar', '側邊直條'],
  ['corners', '四角框']
];
/* 「包住文字」的裝飾：先開場，文字晚一點才出現 */
export const WRAP_DECOS = new Set(['band', 'tape', 'roundBox', 'frame']);
/* 線條類裝飾：可以套用文字的外框 */
export const LINE_DECOS = new Set(['frame', 'rails', 'underline', 'dashes', 'sideBar', 'corners']);

/* 自動換行時，裝飾沿著行方向要預留多少（以目前字級 S 計） */
export function decoAlongReserve(d, S, k) {
  const gap = d.gap * S, ext = d.extend * S, lw = d.lineWidth * k;
  switch (d.kind) {
    case 'rails': case 'underline': return 2 * ext;
    case 'dashes': return 2 * (gap + Math.max(ext, 0.2 * S));
    case 'sideBar': return gap + lw;
    case 'roundBox': case 'frame': case 'corners': return 2 * gap + 2 * lw;
    default: return 0;
  }
}

/* 線條外框（「跟文字一樣的外框」） */
function lineHalo(d, txt, k) {
  if (!d.outline || !LINE_DECOS.has(d.kind)) return 0;
  return (txt.stroke && txt.stroke.on ? txt.stroke.width : 0) * k + (txt.outer && txt.outer.on ? txt.outer.width : 0) * k;
}

/* 裝飾形狀（區塊座標）。blk: composeBlock 的結果。 */
export function decoShape(d, blk, S, k, vertical, txt) {
  if (!d || d.kind === 'none') return null;
  const w = blk.w, h = blk.h;
  const mb = blk.mainBox, sb = blk.subBox;
  const gap = d.gap * S;
  const lw = Math.max(0, d.lineWidth * k);
  const ext = d.extend * S;
  const halo = lineHalo(d, txt, k);
  const sh = { kind: d.kind, lw, halo, gap, S, k, vertical };
  let bx0, by0, bx1, by1, fullAlong = false;
  const lineBox = lines => {
    const r = lw / 2 + halo;
    bx0 = Math.min(...lines.map(l => Math.min(l.x0, l.x1))) - r;
    bx1 = Math.max(...lines.map(l => Math.max(l.x0, l.x1))) + r;
    by0 = Math.min(...lines.map(l => Math.min(l.y0, l.y1))) - r;
    by1 = Math.max(...lines.map(l => Math.max(l.y0, l.y1))) + r;
  };
  switch (d.kind) {
    case 'band': {
      if (!vertical) { sh.a0 = -gap; sh.a1 = h + gap; by0 = sh.a0; by1 = sh.a1; bx0 = 0; bx1 = w; }
      else { sh.a0 = -gap; sh.a1 = w + gap; bx0 = sh.a0; bx1 = sh.a1; by0 = 0; by1 = h; }
      fullAlong = true;
      break;
    }
    case 'tape': {
      const T = Math.max(2, d.tapeWidth * k);
      sh.T = T;
      if (!vertical) {
        sh.tapes = [{ a0: -gap - T, a1: -gap, flow: -1 }, { a0: h + gap, a1: h + gap + T, flow: 1 }];
        by0 = -gap - T; by1 = h + gap + T; bx0 = 0; bx1 = w;
      } else {
        sh.tapes = [{ a0: w + gap, a1: w + gap + T, flow: -1 }, { a0: -gap - T, a1: -gap, flow: 1 }];
        bx0 = -gap - T; bx1 = w + gap + T; by0 = 0; by1 = h;
      }
      fullAlong = true;
      break;
    }
    case 'roundBox': {
      sh.rect = { x: -gap, y: -gap, w: w + 2 * gap, h: h + 2 * gap };
      sh.r = Math.min(d.radius * S, sh.rect.w / 2, sh.rect.h / 2);
      bx0 = sh.rect.x - lw / 2; by0 = sh.rect.y - lw / 2; bx1 = sh.rect.x + sh.rect.w + lw / 2; by1 = sh.rect.y + sh.rect.h + lw / 2;
      break;
    }
    case 'frame': {
      /* 只框主文字；靠副文字那一側的留白最多是兩者間距的一半 */
      const limitSide = sb ? Math.min(gap, blk.gapPx / 2) : gap;
      let x0 = mb.x - gap, x1 = mb.x + mb.w + gap, y0 = mb.y - gap, y1 = mb.y + mb.h + gap;
      if (sb) {
        if (!vertical) { if (sb.y > mb.y) y1 = mb.y + mb.h + limitSide; else y0 = mb.y - limitSide; }
        else if (sb.x < mb.x) x0 = mb.x - limitSide; else x1 = mb.x + mb.w + limitSide;
      }
      sh.rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      sh.extend = ext;
      sh.corner = d.corner || 'none';
      const r = lw / 2 + halo;
      bx0 = x0 - r; bx1 = x1 + r; by0 = y0 - r; by1 = y1 + r;
      break;
    }
    case 'rails': {
      sh.lines = !vertical
        ? [{ x0: -ext, y0: -gap, x1: w + ext, y1: -gap }, { x0: -ext, y0: h + gap, x1: w + ext, y1: h + gap }]
        : [{ x0: w + gap, y0: -ext, x1: w + gap, y1: h + ext }, { x0: -gap, y0: -ext, x1: -gap, y1: h + ext }];
      sh.grow = 'center';
      lineBox(sh.lines);
      break;
    }
    case 'underline': {
      if (!vertical) {
        const y = sb && sb.y > mb.y ? (mb.y + mb.h + sb.y) / 2 : mb.y + mb.h + gap;
        sh.lines = [{ x0: -ext, y0: y, x1: w + ext, y1: y }];
      } else {
        const x = sb && sb.x < mb.x ? (sb.x + sb.w + mb.x) / 2 : mb.x - gap;
        sh.lines = [{ x0: x, y0: -ext, x1: x, y1: h + ext }];
      }
      sh.grow = 'start';
      lineBox(sh.lines);
      break;
    }
    case 'dashes': {
      const len = Math.max(ext, 0.2 * S);
      if (!vertical) {
        const y = mb.y + mb.h / 2;
        sh.lines = [{ x0: -gap, y0: y, x1: -gap - len, y1: y }, { x0: w + gap, y0: y, x1: w + gap + len, y1: y }];
      } else {
        const x = mb.x + mb.w / 2;
        sh.lines = [{ x0: x, y0: -gap, x1: x, y1: -gap - len }, { x0: x, y0: h + gap, x1: x, y1: h + gap + len }];
      }
      sh.grow = 'start';
      lineBox(sh.lines);
      break;
    }
    case 'sideBar': {
      sh.lines = !vertical
        ? [{ x0: -gap - lw / 2, y0: 0, x1: -gap - lw / 2, y1: h }]
        : [{ x0: w, y0: -gap - lw / 2, x1: 0, y1: -gap - lw / 2 }];
      sh.grow = 'start';
      lineBox(sh.lines);
      break;
    }
    case 'corners': {
      sh.rect = { x: -gap, y: -gap, w: w + 2 * gap, h: h + 2 * gap };
      sh.arm = 0.28 * Math.min(sh.rect.w, sh.rect.h);
      const r = lw / 2 + halo;
      bx0 = sh.rect.x - r; by0 = sh.rect.y - r; bx1 = sh.rect.x + sh.rect.w + r; by1 = sh.rect.y + sh.rect.h + r;
      break;
    }
    default: return null;
  }
  /* 裝飾佔的空間（文字框以外的部分）。橫貫畫面的色帶、膠帶不算行方向的寬度。 */
  const e = { l: Math.max(0, -bx0), t: Math.max(0, -by0), r: Math.max(0, bx1 - w), b: Math.max(0, by1 - h) };
  if (fullAlong) { if (!vertical) { e.l = 0; e.r = 0; } else { e.t = 0; e.b = 0; } }
  sh.ext = e;
  return sh;
}

/* 放到畫面上：平移成絕對座標，延伸長框夾在畫面邊緣（左右邊距的一半）以內 */
export function placeDeco(sh, ox, oy, W, H, marginX, marginY) {
  if (!sh) return null;
  const p = { ...sh };
  const mv = r => ({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h });
  if (sh.rect) p.rect = mv(sh.rect);
  if (sh.lines) p.lines = sh.lines.map(l => ({ x0: l.x0 + ox, y0: l.y0 + oy, x1: l.x1 + ox, y1: l.y1 + oy }));
  if (sh.kind === 'band') { p.a0 = sh.a0 + (sh.vertical ? ox : oy); p.a1 = sh.a1 + (sh.vertical ? ox : oy); }
  if (sh.tapes) p.tapes = sh.tapes.map(t => ({ ...t, a0: t.a0 + (sh.vertical ? ox : oy), a1: t.a1 + (sh.vertical ? ox : oy) }));
  if (sh.kind === 'frame' && sh.extend > 0) {
    const r = p.rect;
    if (!sh.vertical) {
      const lim0 = Math.min(r.x, marginX / 2), lim1 = Math.max(r.x + r.w, W - marginX / 2);
      const x0 = Math.max(lim0, r.x - sh.extend), x1 = Math.min(lim1, r.x + r.w + sh.extend);
      p.rect = { x: x0, y: r.y, w: x1 - x0, h: r.h };
    } else {
      const lim0 = Math.min(r.y, marginY / 2), lim1 = Math.max(r.y + r.h, H - marginY / 2);
      const y0 = Math.max(lim0, r.y - sh.extend), y1 = Math.min(lim1, r.y + r.h + sh.extend);
      p.rect = { x: r.x, y: y0, w: r.w, h: y1 - y0 };
    }
  }
  p.W = W; p.H = H;
  return p;
}

/* ---------- 繪製 ---------- */
function lineStyles(d, txt, k, lw) {
  const out = [];
  if (d.outline && LINE_DECOS.has(d.kind)) {
    const sw = txt.stroke && txt.stroke.on ? txt.stroke.width * k : 0;
    const ow = txt.outer && txt.outer.on ? txt.outer.width * k : 0;
    if (ow > 0) out.push({ w: lw + 2 * (sw + ow), color: txt.outer.color });
    if (sw > 0) out.push({ w: lw + 2 * sw, color: txt.stroke.color });
  }
  out.push({ w: lw, color: d.lineColor });
  return out;
}

function strokePasses(ctx, passes, square, pathFn) {
  ctx.lineCap = square ? 'square' : 'butt';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 4;
  for (const p of passes) {
    if (p.w <= 0) continue;
    ctx.lineWidth = p.w;
    ctx.strokeStyle = p.color;
    ctx.beginPath();
    pathFn();
    ctx.stroke();
  }
}

function seg(ctx, passes, square, x0, y0, x1, y1) {
  if (Math.hypot(x1 - x0, y1 - y0) < 0.5) return;
  strokePasses(ctx, passes, square, () => { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); });
}

/* 沿著矩形周長（從起點順時針）畫出 len 長的折線 */
function perimeterPath(ctx, r, startCorner, len) {
  const pts = startCorner === 'tr'
    ? [[r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y], [r.x + r.w, r.y]]
    : [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y]];
  ctx.moveTo(pts[0][0], pts[0][1]);
  let left = len;
  for (let i = 1; i < pts.length && left > 0; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay);
    if (left >= L) { ctx.lineTo(bx, by); left -= L; } else { const f = left / L; ctx.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f); left = 0; }
  }
  if (len >= 2 * (r.w + r.h) - 0.01) ctx.closePath();
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 柔光色帶的圖（上下柔邊 × 左右淡出），一個場景只畫一次 */
function bandImage(sh, d) {
  if (sh._img) return sh._img;
  const vertical = sh.vertical;
  const along = vertical ? sh.H : sh.W;
  const across = Math.max(1, Math.round(sh.a1 - sh.a0));
  const c = vertical ? makeCanvas(across, along) : makeCanvas(along, across);
  const x = c.getContext('2d');
  const soft = clamp01(d.softEdge);
  const g1 = vertical ? x.createLinearGradient(0, 0, across, 0) : x.createLinearGradient(0, 0, 0, across);
  const base = rgba(d.fillColor, d.fillAlpha);
  const clear = rgba(d.fillColor, 0);
  if (soft > 0) {
    g1.addColorStop(0, clear);
    g1.addColorStop(Math.min(0.5, soft), base);
    g1.addColorStop(Math.max(0.5, 1 - soft), base);
    g1.addColorStop(1, clear);
  } else { g1.addColorStop(0, base); g1.addColorStop(1, base); }
  x.fillStyle = g1;
  x.fillRect(0, 0, c.width, c.height);
  const side = clamp01(d.sideFade);
  if (side > 0) {
    const g2 = vertical ? x.createLinearGradient(0, 0, 0, along) : x.createLinearGradient(0, 0, along, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(Math.min(0.5, side), 'rgba(0,0,0,1)');
    g2.addColorStop(Math.max(0.5, 1 - side), 'rgba(0,0,0,1)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = g2;
    x.fillRect(0, 0, c.width, c.height);
  }
  sh._img = c;
  return c;
}

/* 斜紋膠帶的單一圖樣（一個週期），流動時平移 */
function tapePattern(ctx, sh, d) {
  if (sh._pat) return sh._pat;
  const T = sh.T;
  const period = Math.max(4, Math.round(T * 1.3));
  const tile = makeCanvas(period, Math.ceil(T));
  const x = tile.getContext('2d');
  x.fillStyle = d.tapeA;
  x.fillRect(0, 0, tile.width, tile.height);
  x.fillStyle = d.tapeB;
  for (let i = -2; i <= 2; i++) {
    const o = i * period;
    x.beginPath();
    x.moveTo(o, 0); x.lineTo(o + period / 2, 0); x.lineTo(o + period / 2 - T, T); x.lineTo(o - T, T); x.closePath();
    x.fill();
  }
  sh._pat = { tile, period };
  return sh._pat;
}

/* 畫裝飾。
 * st: { pin（登場進度，已套緩停）, pout（收場進度，已套緩起）, t（絕對秒數）, alpha, dx, dy,
 *       scale、cx、cy（只有圓角底框跟著整塊縮放） } */
export function drawDeco(ctx, sh, d, txt, st) {
  if (!sh) return;
  const mode = d.anim;
  let alpha = st.alpha;
  let pin = 1, pout = 0;
  if (mode === 'fade') alpha *= st.pin * (1 - st.pout);
  else if (mode === 'grow') { pin = st.pin; pout = st.pout; }
  if (alpha <= 0.002) return;
  const presence = pin * (1 - pout);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(st.dx, st.dy);
  const passes = lineStyles(d, txt, sh.k, sh.lw);
  const square = d.outline && LINE_DECOS.has(d.kind);
  const W = sh.W, H = sh.H;

  switch (sh.kind) {
    case 'band': {
      if (presence <= 0.001) break;
      const img = bandImage(sh, d);
      const mid = (sh.a0 + sh.a1) / 2;
      const span = (sh.a1 - sh.a0) * presence;
      if (!sh.vertical) ctx.drawImage(img, 0, mid - span / 2, W, span);
      else ctx.drawImage(img, mid - span / 2, 0, span, H);
      break;
    }
    case 'tape': {
      const { tile, period } = tapePattern(ctx, sh, d);
      sh.tapes.forEach((tp, i) => {
        /* 上方（直書右側）從右滑入、往左離開；下方（左側）從左滑入、往右離開 */
        const sign = tp.flow;
        const slide = sign < 0 ? (1 - pin) - pout : -(1 - pin) + pout;
        const off = slide * (sh.vertical ? H : W);
        const flowOff = (((sign * d.tapeSpeed * sh.k * st.t) % period) + period) % period;
        ctx.save();
        if (!sh.vertical) {
          ctx.beginPath(); ctx.rect(0, tp.a0, W, tp.a1 - tp.a0); ctx.clip();
          ctx.translate(off, 0);
          for (let x = -period * 2 + flowOff; x < W + period; x += period) ctx.drawImage(tile, x, tp.a0, period, tp.a1 - tp.a0);
        } else {
          ctx.beginPath(); ctx.rect(tp.a0, 0, tp.a1 - tp.a0, H); ctx.clip();
          ctx.translate(0, off);
          ctx.translate(tp.a1, 0);
          ctx.rotate(Math.PI / 2);
          for (let x = -period * 2 + flowOff; x < H + period; x += period) ctx.drawImage(tile, x, 0, period, tp.a1 - tp.a0);
        }
        ctx.restore();
        /* 閃爍：0.5 秒一輪、約 35% 的時間變暗；兩條錯開半輪 */
        const ph = ((st.t / 0.5 + i * 0.5) % 1 + 1) % 1;
        if (d.tapeBlink > 0 && ph < 0.35) {
          ctx.save();
          ctx.fillStyle = `rgba(0,0,0,${clamp01(d.tapeBlink)})`;
          if (!sh.vertical) { ctx.translate(off, 0); ctx.fillRect(0, tp.a0, W, tp.a1 - tp.a0); }
          else { ctx.translate(0, off); ctx.fillRect(tp.a0, 0, tp.a1 - tp.a0, H); }
          ctx.restore();
        }
      });
      break;
    }
    case 'roundBox': {
      if (presence <= 0.001) break;
      ctx.translate(st.cx, st.cy); ctx.scale(st.scale, st.scale); ctx.translate(-st.cx, -st.cy);
      const r = sh.rect;
      let x = r.x, y = r.y, w = r.w, h = r.h;
      if (!sh.vertical) { w = r.w * presence; x = r.x + (r.w - w) / 2; } else { h = r.h * presence; y = r.y + (r.h - h) / 2; }
      ctx.beginPath();
      roundRectPath(ctx, x, y, w, h, sh.r);
      ctx.fillStyle = rgba(d.fillColor, d.fillAlpha);
      ctx.fill();
      if (sh.lw > 0) { ctx.lineWidth = sh.lw; ctx.strokeStyle = d.lineColor; ctx.stroke(); }
      break;
    }
    case 'frame': {
      const r = sh.rect;
      const fillA = d.fillAlpha * presence;
      if (fillA > 0.001) { ctx.fillStyle = rgba(d.fillColor, fillA); ctx.fillRect(r.x, r.y, r.w, r.h); }
      const per = 2 * (r.w + r.h);
      const len = per * presence;
      if (len > 0.5 && sh.lw > 0) {
        ctx.lineJoin = 'miter';
        for (const p of passes) {
          if (p.w <= 0) continue;
          ctx.lineWidth = p.w; ctx.strokeStyle = p.color; ctx.lineCap = square ? 'square' : 'butt';
          ctx.beginPath();
          perimeterPath(ctx, r, sh.vertical ? 'tr' : 'tl', len);
          ctx.stroke();
        }
      }
      if (sh.corner !== 'none' && presence > 0.01) {
        const s = Math.max(sh.lw * 3, 0.08 * sh.S);
        ctx.save();
        ctx.globalAlpha *= presence;
        ctx.fillStyle = d.lineColor;
        for (const [cx, cy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]) {
          ctx.beginPath();
          if (sh.corner === 'diamond') { ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy); ctx.closePath(); }
          else ctx.rect(cx - s / 2, cy - s / 2, s, s);
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }
    case 'rails': case 'underline': case 'dashes': case 'sideBar': {
      for (const l of sh.lines) {
        const L = Math.hypot(l.x1 - l.x0, l.y1 - l.y0) || 1;
        const ux = (l.x1 - l.x0) / L, uy = (l.y1 - l.y0) / L;
        let a = 0, b = L;
        if (sh.grow === 'center') { const half = L / 2 * presence; a = L / 2 - half; b = L / 2 + half; }
        else { b = L * pin; a = L * pout; } // 從起點畫出；收場時起點往前收（線像「穿過去」消失）
        if (b - a > 0.5) seg(ctx, passes, square, l.x0 + ux * a, l.y0 + uy * a, l.x0 + ux * b, l.y0 + uy * b);
      }
      break;
    }
    case 'corners': {
      if (presence <= 0.001) break;
      const r = sh.rect;
      const off = 0.4 * sh.S * (1 - presence);
      const arm = sh.arm * presence;
      const pts = [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x + r.w, r.y + r.h, -1, -1], [r.x, r.y + r.h, 1, -1]];
      for (const [cx, cy, sx, sy] of pts) {
        const x = cx - sx * off, y = cy - sy * off;
        strokePasses(ctx, passes, square, () => { ctx.moveTo(x + sx * arm, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * arm); });
      }
      break;
    }
    default: break;
  }
  ctx.restore();
}

/* ---------- 整張背景 ---------- */
export const BACKDROP_CHOICES = [
  ['none', '無（透明）'], ['solid', '單色'], ['vignette', '暗角'], ['bottom', '下方漸層'], ['top', '上方漸層']
];

export function drawBackdrop(ctx, bg, W, H, amount) {
  if (!bg || bg.kind === 'none') return;
  const a = clamp01(bg.alpha) * clamp01(amount);
  if (a <= 0.001) return;
  const c = bg.color;
  ctx.save();
  if (bg.kind === 'solid') {
    ctx.fillStyle = rgba(c, a);
  } else if (bg.kind === 'vignette') {
    const r0 = 0.2 * Math.min(W, H);
    const r1 = Math.hypot(W / 2, H / 2);
    const g = ctx.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1);
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(0.45, rgba(c, a * 0.45));
    g.addColorStop(1, rgba(c, a));
    ctx.fillStyle = g;
  } else if (bg.kind === 'bottom') {
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(1, rgba(c, a));
    ctx.fillStyle = g;
  } else if (bg.kind === 'top') {
    const g = ctx.createLinearGradient(0, H * 0.55, 0, 0);
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(1, rgba(c, a));
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
