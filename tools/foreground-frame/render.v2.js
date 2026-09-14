/*!
 * render.v2.js - draws one foreground frame (optionally for one variant)
 *
 * Drawing order (back to front):
 *   window tint -> window effect -> window shadow -> frame fill + grain
 *   -> "back" layers -> lines -> corner ornaments -> decorations
 *   -> variant label -> "front" layers
 *
 * The frame is "the whole canvas minus the window", filled with the even-odd
 * rule. Lines are cut out of stroke bands around the window path, so they
 * follow every corner shape (round, scoop, notch...) without offset math.
 */
(function () {
  "use strict";

  const BASE_H = 1080;
  const TAU = Math.PI * 2;
  // Per corner, clockwise from top-left: [incoming edge direction, outgoing edge direction].
  const CORNER_DIRS = [[[0, -1], [1, 0]], [[1, 0], [0, 1]], [[0, 1], [-1, 0]], [[-1, 0], [0, -1]]];

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- geometry

  function virtualWidth(size) {
    return BASE_H * size.w / size.h;
  }

  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  // Suggested CCFolia foreground size in grid units (1 unit = 24px).
  function gridUnits(w, h) {
    if (w % 24 === 0 && h % 24 === 0 && w / 24 <= 64) return { w: w / 24, h: h / 24, exact: true };
    const g = gcd(w, h), a = w / g, b = h / g;
    if (a <= 64 && b <= 64) {
      const k = Math.max(1, Math.round(48 / a));
      return { w: a * k, h: b * k, exact: true };
    }
    return { w: 48, h: Math.round(48 * h / w), exact: false };
  }

  function openingRect(state) {
    const VW = virtualWidth(state.size), m = state.opening.margin;
    let x0 = clamp(m.l, 0, VW), x1 = clamp(VW - m.r, 0, VW);
    let y0 = clamp(m.t, 0, BASE_H), y1 = clamp(BASE_H - m.b, 0, BASE_H);
    if (x1 - x0 < 8) { const c = (x0 + x1) / 2; x0 = c - 4; x1 = c + 4; }
    if (y1 - y0 < 8) { const c = (y0 + y1) / 2; y0 = c - 4; y1 = c + 4; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  function cornerAt(opening, i) {
    return opening.linkCorners ? opening.corners[0] : opening.corners[i];
  }

  function traceWindow(ctx, state) {
    const o = state.opening, r = openingRect(state);
    if (o.shape === "ellipse") {
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
      ctx.moveTo(r.x1, cy);
      ctx.ellipse(cx, cy, r.w / 2, r.h / 2, 0, 0, TAU);
      ctx.closePath();
      return;
    }
    const points = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
    const limit = Math.min(r.w, r.h) / 2;
    for (let i = 0; i < 4; i++) {
      const corner = cornerAt(o, i);
      const [px, py] = points[i], [din, dout] = CORNER_DIRS[i];
      const s = corner.type === "square" ? 0 : clamp(corner.size, 0, limit);
      const ax = px - din[0] * s, ay = py - din[1] * s;
      const bx = px + dout[0] * s, by = py + dout[1] * s;
      if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
      if (s === 0) continue;
      if (corner.type === "round") {
        ctx.arcTo(px, py, bx, by, s);
      } else if (corner.type === "chamfer") {
        ctx.lineTo(bx, by);
      } else if (corner.type === "scoop") {
        const a0 = Math.atan2(ay - py, ax - px), a1 = Math.atan2(by - py, bx - px);
        let d = a1 - a0;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        ctx.arc(px, py, s, a0, a1, d < 0);
      } else if (corner.type === "notch") {
        ctx.lineTo(ax + dout[0] * s, ay + dout[1] * s);
        ctx.lineTo(bx, by);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
  }

  // pad > 0 grows the rectangle past the canvas (used as a shadow caster).
  function traceOuter(ctx, state, pad) {
    const VW = virtualWidth(state.size), p = pad || 0;
    const r = p ? 0 : clamp(state.opening.outerRadius, 0, BASE_H / 2);
    const x0 = -p, y0 = -p, x1 = VW + p, y1 = BASE_H + p;
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x1, y0, x1, y1, r);
    ctx.arcTo(x1, y1, x0, y1, r);
    ctx.arcTo(x0, y1, x0, y0, r);
    ctx.arcTo(x0, y0, x1, y0, r);
    ctx.closePath();
  }

  // Fill or clip with "evenodd".
  function traceFrame(ctx, state, pad) {
    traceOuter(ctx, state, pad);
    traceWindow(ctx, state);
  }

  // ---------------------------------------------------------------- colors

  function resolveColor(ref, slot) {
    if (typeof ref === "string" && ref[0] === "#") return ref;
    return slot[ref] || "#000000";
  }

  function hexToRgb(hex) {
    let h = String(hex || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function contrastText(hex) {
    const [r, g, b] = hexToRgb(hex).map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#1b1b1f" : "#ffffff";
  }

  // ---------------------------------------------------------------- variants

  // The colors and window treatment in effect: the palette, overridden by a variant when variants are on.
  function resolveSlot(state, id) {
    const slot = Object.assign({ id: "base", name: "", sub: "", icon: "none", iconAsset: null,
      tint: "#000000", tintAlpha: 0, effect: "none", effectAmount: 0 }, state.palette);
    if (!state.variants.enabled) return slot;
    const items = state.variants.items;
    const item = items.find(i => i.id === id) || items.find(i => i.on) || items[0];
    if (!item) return slot;
    Object.assign(slot, { id: item.id, name: item.name, sub: item.sub, icon: item.icon, iconAsset: item.iconAsset,
      tint: item.tint, tintAlpha: item.tintAlpha, effect: item.effect, effectAmount: item.effectAmount });
    if (item.useColors) Object.assign(slot, { frame1: item.frame1, frame2: item.frame2, accent: item.accent, text: item.text });
    return slot;
  }

  function isVisible(state, obj, slotId) {
    return !(state.variants.enabled && obj.hideIn && obj.hideIn[slotId]);
  }

  // ---------------------------------------------------------------- scratch canvases

  const scratches = [];

  function scratch(i, w, h) {
    let canvas = scratches[i];
    if (!canvas) canvas = scratches[i] = document.createElement("canvas");
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    return { canvas, ctx };
  }

  let grainCanvas = null;

  function grain() {
    if (grainCanvas) return grainCanvas;
    const size = 256;
    grainCanvas = document.createElement("canvas");
    grainCanvas.width = grainCanvas.height = size;
    const ctx = grainCanvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    const rand = mulberry32(20260913);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.round(128 + (rand() - 0.5) * 230);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return grainCanvas;
  }

  // ---------------------------------------------------------------- frame

  function drawTint(g) {
    const { ctx, slot } = g;
    if (!(slot.tintAlpha > 0)) return;
    ctx.save();
    ctx.beginPath();
    traceWindow(ctx, g.state);
    ctx.fillStyle = rgba(slot.tint, slot.tintAlpha);
    ctx.fill();
    ctx.restore();
  }

  // Inner shadow: a huge frame shape outside the window casts its blur inward.
  function drawShadow(g) {
    const { ctx, state, slot } = g, sh = state.frame.shadow;
    if (!sh.on || sh.opacity <= 0 || sh.size <= 0) return;
    ctx.save();
    ctx.beginPath();
    traceWindow(ctx, state);
    ctx.clip();
    ctx.beginPath();
    traceFrame(ctx, state, Math.max(g.VW, BASE_H));
    ctx.shadowColor = rgba(resolveColor(sh.color, slot), sh.opacity);
    ctx.shadowBlur = sh.size * g.k;   // shadowBlur ignores the transform
    ctx.fillStyle = "#000";
    ctx.fill("evenodd");
    ctx.restore();
  }

  function frameFillStyle(g) {
    const { ctx, state, slot, VW } = g, f = state.frame;
    if (f.fill === "solid") return slot.frame1;
    if (f.fill === "radial") {
      const cx = VW / 2, cy = BASE_H / 2;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(VW, BASE_H) / 2);
      grad.addColorStop(0.35, slot.frame1);
      grad.addColorStop(1, slot.frame2);
      return grad;
    }
    // CSS-style angle: 0 = toward the top, 180 = toward the bottom.
    const a = f.angle * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
    const half = (Math.abs(VW * dx) + Math.abs(BASE_H * dy)) / 2;
    const grad = ctx.createLinearGradient(VW / 2 - dx * half, BASE_H / 2 - dy * half,
      VW / 2 + dx * half, BASE_H / 2 + dy * half);
    grad.addColorStop(0, slot.frame1);
    grad.addColorStop(1, slot.frame2);
    return grad;
  }

  function drawFill(g) {
    const { ctx, state } = g, f = state.frame;
    if (f.fill === "none") return;
    ctx.save();
    ctx.beginPath();
    traceFrame(ctx, state);
    ctx.clip("evenodd");
    ctx.globalAlpha = f.opacity;
    ctx.fillStyle = frameFillStyle(g);
    ctx.fillRect(0, 0, g.VW, BASE_H);
    if (f.grain > 0) {
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = f.opacity * f.grain * 0.6;
      ctx.fillStyle = ctx.createPattern(grain(), "repeat");
      ctx.fillRect(0, 0, g.VW, BASE_H);
    }
    ctx.restore();
  }

  // A line [inner, outer] units away from a path, kept only on the frame side.
  function drawBand(g, trace, inner, outer, color) {
    if (outer <= inner) return;
    const { canvas, ctx: c } = scratch(0, g.W, g.H);
    c.setTransform(g.k, 0, 0, g.k, 0, 0);
    c.lineJoin = "miter";
    c.miterLimit = 10;
    c.beginPath();
    trace(c);
    c.strokeStyle = color;
    c.lineWidth = outer * 2;
    c.stroke();
    if (inner > 0) {
      c.globalCompositeOperation = "destination-out";
      c.lineWidth = inner * 2;
      c.stroke();
    }
    c.globalCompositeOperation = "destination-in";
    c.beginPath();
    traceFrame(c, g.state);
    c.fill("evenodd");
    c.globalCompositeOperation = "source-over";
    g.ctx.save();
    g.ctx.setTransform(1, 0, 0, 1, 0, 0);
    g.ctx.drawImage(canvas, 0, 0);
    g.ctx.restore();
  }

  function drawLines(g) {
    const { state, slot } = g, inner = state.frame.innerLine, outer = state.frame.outerLine;
    if (inner.on && inner.width > 0) {
      const color = resolveColor(inner.color, slot);
      const win = c => traceWindow(c, state);
      drawBand(g, win, inner.gap, inner.gap + inner.width, color);
      if (inner.double) {
        const start = inner.gap + inner.width + Math.max(3, inner.width * 1.5);
        drawBand(g, win, start, start + inner.width, color);
      }
    }
    if (outer.on && outer.width > 0) {
      drawBand(g, c => traceOuter(c, state), outer.gap, outer.gap + outer.width, resolveColor(outer.color, slot));
    }
  }

  // Local space: the window corner is the origin and the window lies toward +x / +y.
  const ORNAMENTS = {
    bracket(ctx, s, gap) {
      const e = -gap;
      ctx.beginPath();
      ctx.moveTo(e, e + s);
      ctx.lineTo(e, e);
      ctx.lineTo(e + s, e);
      ctx.stroke();
    },
    diamond(ctx, s, gap) {
      const c = -gap, h = s / 2;
      ctx.beginPath();
      ctx.moveTo(c, c - h); ctx.lineTo(c + h, c); ctx.lineTo(c, c + h); ctx.lineTo(c - h, c);
      ctx.closePath();
      ctx.fill();
      const o = h * 1.7;
      ctx.beginPath();
      ctx.moveTo(c, c - o); ctx.lineTo(c + o, c); ctx.lineTo(c, c + o); ctx.lineTo(c - o, c);
      ctx.closePath();
      ctx.stroke();
    },
    star(ctx, s, gap) {
      const sparkle = (x, y, r) => {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y);
        ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.fill();
      };
      const c = -gap;
      sparkle(c, c, s / 2);
      sparkle(c + s * 0.55, c - s * 0.1, s * 0.16);
      sparkle(c - s * 0.1, c + s * 0.55, s * 0.16);
    },
    dots(ctx, s, gap) {
      const c = -gap;
      const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
      dot(c, c, s * 0.14);
      dot(c + s * 0.5, c, s * 0.09);
      dot(c, c + s * 0.5, s * 0.09);
      dot(c + s * 0.9, c, s * 0.055);
      dot(c, c + s * 0.9, s * 0.055);
    },
    flourish(ctx, s, gap) {
      const c = -gap;
      ctx.beginPath();
      for (const swap of [false, true]) {
        const P = (x, y) => swap ? [c + y, c + x] : [c + x, c + y];
        ctx.moveTo(...P(s * 0.12, 0));
        ctx.bezierCurveTo(...P(s * 0.35, -s * 0.26), ...P(s * 0.6, s * 0.24), ...P(s * 0.92, -s * 0.02));
        ctx.moveTo(...P(s * 0.45, -s * 0.02));
        ctx.bezierCurveTo(...P(s * 0.52, -s * 0.16), ...P(s * 0.68, -s * 0.16), ...P(s * 0.7, -s * 0.06));
      }
      ctx.stroke();
      const h = s * 0.12;
      ctx.beginPath();
      ctx.moveTo(c, c - h); ctx.lineTo(c + h, c); ctx.lineTo(c, c + h); ctx.lineTo(c - h, c);
      ctx.closePath();
      ctx.fill();
      for (const [x, y] of [[c + s * 0.92, c - s * 0.02], [c - s * 0.02, c + s * 0.92]]) {
        ctx.beginPath();
        ctx.arc(x, y, s * 0.045, 0, TAU);
        ctx.fill();
      }
    },
  };

  function drawOrnaments(g) {
    const { ctx, state, slot } = g, o = state.frame.ornament, draw = ORNAMENTS[o.type];
    if (!draw || o.size <= 0) return;
    const r = openingRect(state);
    const points = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle = resolveColor(o.color, slot);
    ctx.lineWidth = o.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    points.forEach(([px, py], i) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(i * Math.PI / 2);
      draw(ctx, o.size, o.gap);
      ctx.restore();
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- text & icons

  const ROTATE_IN_VERTICAL = "ー―‐－-~～〜…‥「」『』（）()【】〈〉《》[]<>＜＞";

  function fontStack(key, name, env) {
    const fonts = window.FramePresets.FONTS;
    if (typeof key === "string" && key.startsWith("font:")) {
      const family = env.fontFamilies[key.slice(5)];
      if (family) return `"${family}",${fonts.gothic.stack}`;
    }
    if (key === "name" && name) return `"${String(name).replace(/"/g, "")}",${fonts.gothic.stack}`;
    return (fonts[key] || fonts.gothic).stack;
  }

  function setFont(ctx, px, bold, stack) {
    ctx.font = `${bold ? 700 : 400} ${px}px ${stack}`;
  }

  function spacedWidth(ctx, text, spacing) {
    if (!spacing) return ctx.measureText(text).width;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    return Math.max(0, w - spacing);
  }

  // mode: "fill" | "stroke"
  function spacedText(ctx, text, x, y, spacing, align, mode) {
    const w = spacedWidth(ctx, text, spacing);
    let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.textAlign = "left";
    if (!spacing) { ctx[mode + "Text"](text, cx, y); return; }
    for (const ch of text) {
      ctx[mode + "Text"](ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawIcon(g, item, cx, cy, r, color) {
    const ctx = g.ctx, kind = item.icon;
    const circle = (x, y, rad) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill(); };
    const rays = (x, y, from, to, a0, a1, count) => {
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const a = count === 1 ? a0 : a0 + (a1 - a0) * i / (count - 1);
        ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from);
        ctx.lineTo(x + Math.cos(a) * to, y + Math.sin(a) * to);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = r * 0.14;
    if (kind === "sun") {
      circle(cx, cy, r * 0.42);
      rays(cx, cy, r * 0.64, r * 0.94, 0, TAU * 7 / 8, 8);
    } else if (kind === "sunrise" || kind === "sunset") {
      const horizon = cy + r * 0.25;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - r * 1.5, cy - r * 1.5, r * 3, horizon - (cy - r * 1.5));
      ctx.clip();
      circle(cx, horizon, r * 0.5);
      if (kind === "sunrise") rays(cx, horizon, r * 0.7, r * 0.98, Math.PI * 1.1, Math.PI * 1.9, 5);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.95, horizon);
      ctx.lineTo(cx + r * 0.95, horizon);
      if (kind === "sunset") {
        ctx.moveTo(cx - r * 0.55, horizon + r * 0.32);
        ctx.lineTo(cx + r * 0.55, horizon + r * 0.32);
        ctx.moveTo(cx - r * 0.25, horizon + r * 0.62);
        ctx.lineTo(cx + r * 0.25, horizon + r * 0.62);
      } else {
        ctx.moveTo(cx - r * 0.28, horizon + r * 0.62);
        ctx.lineTo(cx, horizon + r * 0.38);
        ctx.lineTo(cx + r * 0.28, horizon + r * 0.62);
      }
      ctx.stroke();
    } else if (kind === "moon") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - r * 2, cy - r * 2, r * 4, r * 4);
      ctx.arc(cx + r * 0.36, cy - r * 0.26, r * 0.56, 0, TAU);
      ctx.clip("evenodd");
      circle(cx - r * 0.05, cy, r * 0.72);
      ctx.restore();
      const s = r * 0.2, x = cx + r * 0.62, y = cy + r * 0.42;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.quadraticCurveTo(x, y, x + s, y);
      ctx.quadraticCurveTo(x, y, x, y + s);
      ctx.quadraticCurveTo(x, y, x - s, y);
      ctx.quadraticCurveTo(x, y, x, y - s);
      ctx.fill();
    } else if (kind === "star") {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.38 : r * 0.9;
        ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
    } else if (kind === "cloud") {
      circle(cx - r * 0.38, cy + r * 0.12, r * 0.36);
      circle(cx + r * 0.02, cy - r * 0.1, r * 0.5);
      circle(cx + r * 0.46, cy + r * 0.16, r * 0.32);
      ctx.beginPath();
      roundRect(ctx, cx - r * 0.74, cy + r * 0.1, r * 1.52, r * 0.38, r * 0.19);
      ctx.fill();
    } else if (kind === "custom") {
      const img = g.env.images.get(item.iconAsset);
      if (img && img.complete && img.naturalWidth) {
        const sc = Math.min(r * 2 / img.naturalWidth, r * 2 / img.naturalHeight);
        const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
        ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      }
    } else if (window.FrameIcons && window.FrameIcons[kind]) {
      window.FrameIcons[kind](ctx, cx, cy, r);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- variant label

  function enabledItems(state) {
    return state.variants.items.filter(i => i.on);
  }

  const INDICATORS = {
    badge: {
      measure(g, s, stack) {
        const ctx = g.ctx, ind = g.state.variants.label, slot = g.slot;
        setFont(ctx, 34 * s, true, stack);
        let textW = ctx.measureText(slot.name).width;
        if (ind.showSub && slot.sub) {
          setFont(ctx, 14 * s, true, stack);
          textW = Math.max(textW, spacedWidth(ctx, slot.sub, 14 * s * 0.18));
        }
        const icon = slot.icon === "none" ? 0 : 44 * s + 12 * s;
        return { w: 20 * s + icon + textW + 26 * s, h: 76 * s, textW };
      },
      draw(g, x, y, box, s, stack) {
        const ctx = g.ctx, ind = g.state.variants.label, slot = g.slot;
        ctx.beginPath();
        roundRect(ctx, x, y, box.w, box.h, box.h / 2);
        ctx.fillStyle = rgba(slot.accent, ind.bgAlpha);
        ctx.fill();
        const fg = ind.bgAlpha < 0.35 ? slot.text : contrastText(slot.accent);
        const cy = y + box.h / 2;
        let tx = x + 20 * s;
        if (slot.icon !== "none") {
          drawIcon(g, slot, tx + 22 * s, cy, 22 * s, fg);
          tx += 44 * s + 12 * s;
        }
        ctx.fillStyle = fg;
        ctx.textBaseline = "middle";
        const sub = ind.showSub && slot.sub;
        setFont(ctx, 34 * s, true, stack);
        spacedText(ctx, slot.name, tx + box.textW / 2, sub ? cy - 8 * s : cy + 1 * s, 0, "center", "fill");
        if (sub) {
          setFont(ctx, 14 * s, true, stack);
          spacedText(ctx, slot.sub, tx + box.textW / 2, cy + 19 * s, 14 * s * 0.18, "center", "fill");
        }
      },
    },
    tabs: {
      measure(g, s, stack) {
        const ctx = g.ctx;
        setFont(ctx, 24 * s, true, stack);
        const segs = enabledItems(g.state).map(item => {
          const icon = item.icon === "none" ? 0 : 28 * s + 8 * s;
          return { item, w: 14 * s * 2 + icon + ctx.measureText(item.name).width };
        });
        const inner = 5 * s;
        return { w: segs.reduce((sum, seg) => sum + seg.w, 0) + inner * 2, h: 56 * s, segs, inner };
      },
      draw(g, x, y, box, s, stack) {
        const ctx = g.ctx, ind = g.state.variants.label, cur = g.slot;
        ctx.beginPath();
        roundRect(ctx, x, y, box.w, box.h, box.h / 2);
        ctx.fillStyle = rgba(cur.frame2, ind.bgAlpha * 0.85);
        ctx.fill();
        ctx.lineWidth = 1.5 * s;
        ctx.strokeStyle = rgba(cur.text, 0.3);
        ctx.stroke();
        let sx = x + box.inner;
        const segH = box.h - box.inner * 2;
        for (const seg of box.segs) {
          const active = seg.item.id === cur.id;
          if (active) {
            ctx.beginPath();
            roundRect(ctx, sx, y + box.inner, seg.w, segH, segH / 2);
            ctx.fillStyle = cur.accent;
            ctx.fill();
          }
          const fg = active ? contrastText(cur.accent) : rgba(cur.text, 0.5);
          let tx = sx + 14 * s;
          const cy = y + box.h / 2;
          if (seg.item.icon !== "none") {
            drawIcon(g, seg.item, tx + 14 * s, cy, 14 * s, fg);
            tx += 36 * s;
          }
          setFont(ctx, 24 * s, true, stack);
          ctx.fillStyle = fg;
          ctx.textBaseline = "middle";
          spacedText(ctx, seg.item.name, tx, cy + 1 * s, 0, "left", "fill");
          sx += seg.w;
        }
      },
    },
    dial: {
      measure(g, s) {
        return { w: 224 * s, h: (g.state.variants.label.showSub ? 184 : 164) * s };
      },
      draw(g, x, y, box, s, stack) {
        const ctx = g.ctx, ind = g.state.variants.label, cur = g.slot;
        if (ind.bgAlpha > 0) {
          ctx.beginPath();
          roundRect(ctx, x, y, box.w, box.h, 20 * s);
          ctx.fillStyle = rgba(cur.frame2, ind.bgAlpha * 0.85);
          ctx.fill();
          ctx.lineWidth = 1.5 * s;
          ctx.strokeStyle = rgba(cur.accent, 0.6);
          ctx.stroke();
        }
        const cx = x + box.w / 2, horizon = y + 112 * s, R = 80 * s;
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = rgba(cur.text, 0.5);
        ctx.setLineDash([2 * s, 9 * s]);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, horizon, R, Math.PI, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = cur.text;
        ctx.beginPath();
        ctx.moveTo(cx - R - 16 * s, horizon);
        ctx.lineTo(cx + R + 16 * s, horizon);
        ctx.stroke();
        const items = enabledItems(g.state);
        items.forEach((item, i) => {
          const a = Math.PI + Math.PI * (i + 0.5) / items.length;
          const px = cx + Math.cos(a) * R, py = horizon + Math.sin(a) * R;
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
          drawIcon(g, item, px, py, 24 * s, cur.accent);
          ctx.restore();
        });
        ctx.fillStyle = cur.text;
        ctx.textBaseline = "middle";
        setFont(ctx, 28 * s, true, stack);
        spacedText(ctx, cur.name, cx, horizon + 30 * s, 0, "center", "fill");
        if (ind.showSub && cur.sub) {
          setFont(ctx, 13 * s, true, stack);
          ctx.fillStyle = cur.accent;
          spacedText(ctx, cur.sub, cx, horizon + 58 * s, 13 * s * 0.2, "center", "fill");
        }
      },
    },
    label: {
      measure(g, s, stack) {
        const ctx = g.ctx, ind = g.state.variants.label, slot = g.slot;
        setFont(ctx, 42 * s, true, stack);
        const nameW = spacedWidth(ctx, slot.name, 42 * s * 0.15);
        const sub = ind.showSub && slot.sub;
        const pad = ind.bgAlpha > 0 ? 12 * s : 0;
        return { w: nameW + (56 * s + 18 * s) * 2 + pad * 2, h: 42 * s * 1.25 + (sub ? 26 * s : 0) + pad * 2, nameW, pad };
      },
      draw(g, x, y, box, s, stack) {
        const ctx = g.ctx, ind = g.state.variants.label, slot = g.slot;
        // A name plate keeps the label readable when it sits on top of frame lines.
        if (ind.bgAlpha > 0) {
          ctx.beginPath();
          roundRect(ctx, x, y, box.w, box.h, 10 * s);
          ctx.fillStyle = rgba(slot.frame2, ind.bgAlpha);
          ctx.fill();
          ctx.lineWidth = 1.5 * s;
          ctx.strokeStyle = rgba(slot.accent, 0.7 * ind.bgAlpha);
          ctx.stroke();
        }
        y += box.pad;
        box = Object.assign({}, box, { h: box.h - box.pad * 2 });
        const cx = x + box.w / 2, nameY = y + 42 * s * 0.62;
        ctx.fillStyle = slot.text;
        ctx.textBaseline = "middle";
        setFont(ctx, 42 * s, true, stack);
        spacedText(ctx, slot.name, cx, nameY, 42 * s * 0.15, "center", "fill");
        ctx.strokeStyle = ctx.fillStyle = slot.accent;
        ctx.lineWidth = 2 * s;
        for (const dir of [-1, 1]) {
          const near = cx + dir * (box.nameW / 2 + 18 * s), far = near + dir * 56 * s;
          ctx.beginPath();
          ctx.moveTo(near, nameY);
          ctx.lineTo(far, nameY);
          ctx.stroke();
          const d = 5 * s;
          ctx.beginPath();
          ctx.moveTo(far, nameY - d); ctx.lineTo(far + d, nameY); ctx.lineTo(far, nameY + d); ctx.lineTo(far - d, nameY);
          ctx.closePath();
          ctx.fill();
        }
        if (ind.showSub && slot.sub) {
          setFont(ctx, 15 * s, true, stack);
          spacedText(ctx, slot.sub, cx, y + box.h - 11 * s, 15 * s * 0.3, "center", "fill");
        }
      },
    },
  };

  function drawIndicator(g) {
    const v = g.state.variants, ind = v.label, style = INDICATORS[ind.style];
    if (!v.enabled || !style) return;
    const ctx = g.ctx, s = ind.scale, stack = fontStack(ind.font, ind.fontName, g.env);
    ctx.save();
    const box = style.measure(g, s, stack);
    let cx, cy;
    if (ind.pos === "free") {
      cx = ind.x * g.VW;
      cy = ind.y * BASE_H;
    } else {
      const pad = 30, m = g.state.opening.margin;
      const side = ind.pos[1];
      cx = side === "l" ? pad + box.w / 2 : side === "r" ? g.VW - pad - box.w / 2 : g.VW / 2;
      // Sit in the middle of a thick top/bottom band (cinema, novel) when it fits.
      if (ind.pos[0] === "t") cy = m.t >= box.h + 16 ? m.t / 2 : pad + box.h / 2;
      else cy = m.b >= box.h + 16 ? BASE_H - m.b / 2 : BASE_H - pad - box.h / 2;
    }
    style.draw(g, cx - box.w / 2, cy - box.h / 2, box, s, stack);
    ctx.restore();
    g.hits.push({ id: "indicator", cx, cy, w: box.w, h: box.h, rotation: 0 });
  }

  // ---------------------------------------------------------------- layers

  function layerText(layer, slot) {
    /* 佔位符同時接受日文與繁體中文寫法：日文是原版與既有專案檔的寫法，必須保留；
     繁中是本 repo 介面提示所顯示的寫法。 */
    return String(layer.text || "").replace(/\{(差分|時間帯)\}/g, slot.name).replace(/\{(英語|英文)\}/g, slot.sub);
  }

  function recolored(env, img, assetId, color) {
    const key = assetId + "|" + color;
    let canvas = env.recolorCache.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const c = canvas.getContext("2d");
      c.drawImage(img, 0, 0);
      c.globalCompositeOperation = "source-in";
      c.fillStyle = color;
      c.fillRect(0, 0, canvas.width, canvas.height);
      env.recolorCache.set(key, canvas);
    }
    return canvas;
  }

  function drawImageLayer(g, layer) {
    const img = g.env.images.get(layer.asset);
    if (!img || !img.complete || !img.naturalWidth) return null;
    const ctx = g.ctx, iw = img.naturalWidth, ih = img.naturalHeight;
    const src = layer.recolor && layer.recolor !== "none"
      ? recolored(g.env, img, layer.asset, resolveColor(layer.recolor, g.slot)) : img;
    if (layer.fit === "stretch") {
      ctx.drawImage(src, 0, 0, g.VW, BASE_H);
      return null;
    }
    if (layer.fit === "cover") {
      const sc = Math.max(g.VW / iw, BASE_H / ih);
      ctx.drawImage(src, (g.VW - iw * sc) / 2, (BASE_H - ih * sc) / 2, iw * sc, ih * sc);
      return null;
    }
    if (layer.fit === "tile") {
      const pattern = ctx.createPattern(src, "repeat");
      pattern.setTransform(new DOMMatrix()
        .translate(layer.x * g.VW, layer.y * BASE_H).rotate(layer.rotation).scale(layer.scale));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, g.VW, BASE_H);
      return null;
    }
    const w = iw * layer.scale, h = ih * layer.scale, cx = layer.x * g.VW, cy = layer.y * BASE_H;
    ctx.translate(cx, cy);
    ctx.rotate(layer.rotation * Math.PI / 180);
    if (layer.flip) ctx.scale(-1, 1);
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    return { cx, cy, w, h, rotation: layer.rotation };
  }

  function drawTextLayer(g, layer) {
    const ctx = g.ctx, text = layerText(layer, g.slot), px = layer.size;
    const lines = text.split("\n");
    setFont(ctx, px, layer.bold, fontStack(layer.font, layer.fontName, g.env));
    ctx.textBaseline = "middle";
    const spacing = layer.spacing * px, lineH = px * 1.3, colW = px * 1.35, charH = px * (1 + layer.spacing);
    let w, h;
    if (layer.vertical) {
      w = lines.length * colW;
      h = Math.max(...lines.map(l => [...l].length)) * charH;
    } else {
      w = Math.max(...lines.map(l => spacedWidth(ctx, l, spacing)));
      h = lines.length * lineH;
    }
    const cx = layer.x * g.VW, cy = layer.y * BASE_H;
    ctx.translate(cx, cy);
    ctx.rotate(layer.rotation * Math.PI / 180);
    if (layer.flip) ctx.scale(-1, 1);
    ctx.lineJoin = "round";
    ctx.lineWidth = layer.strokeWidth * 2;
    ctx.strokeStyle = resolveColor(layer.strokeColor, g.slot);
    ctx.fillStyle = resolveColor(layer.color, g.slot);
    const modes = layer.strokeWidth > 0 ? ["stroke", "fill"] : ["fill"];
    modes.forEach((mode, pass) => {
      // The shadow is cast once, by whichever pass comes first.
      if (pass === 0 && layer.shadow > 0) {
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = layer.shadow * g.k;
      } else {
        ctx.shadowColor = "transparent";
      }
      lines.forEach((l, i) => {
        if (!layer.vertical) {
          const x = layer.align === "left" ? -w / 2 : layer.align === "right" ? w / 2 : 0;
          spacedText(ctx, l, x, -h / 2 + lineH * (i + 0.5), spacing, layer.align, mode);
          return;
        }
        ctx.textAlign = "center";
        const x = w / 2 - colW * (i + 0.5);
        [...l].forEach((ch, j) => {
          const y = -h / 2 + charH * (j + 0.5);
          if (ROTATE_IN_VERTICAL.includes(ch)) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.PI / 2);
            ctx[mode + "Text"](ch, 0, 0);
            ctx.restore();
          } else {
            ctx[mode + "Text"](ch, x, y);
          }
        });
      });
    });
    return { cx, cy, w: Math.max(w, 24), h: Math.max(h, 24), rotation: layer.rotation };
  }

  function drawLayers(g, order) {
    for (const layer of g.state.layers) {
      if (layer.order !== order || !layer.visible || !g.visible(layer)) continue;
      const ctx = g.ctx;
      ctx.save();
      if (layer.clip === "frame" || layer.clip === "window") {
        ctx.beginPath();
        if (layer.clip === "frame") { traceFrame(ctx, g.state); ctx.clip("evenodd"); }
        else { traceWindow(ctx, g.state); ctx.clip(); }
      }
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend || "source-over";
      const hit = layer.kind === "image" ? drawImageLayer(g, layer) : drawTextLayer(g, layer);
      ctx.restore();
      if (hit) g.hits.push(Object.assign({ id: layer.id }, hit));
    }
  }

  // ---------------------------------------------------------------- preview scenery

  // A sample landscape drawn behind the preview only (never exported).
  const SCENERY = {
    morning: { sky: [["#9fcbe8", 0], ["#f6d7b8", 0.6], ["#f4b98f", 1]], far: "#9fb2c1", near: "#7f9a78", house: "#5b5048", sun: ["#fff1c9", 0.2, 0.42] },
    day: { sky: [["#4ea4e0", 0], ["#a8d6f3", 0.6], ["#e3f3fb", 1]], far: "#80a7c4", near: "#6d9a5e", house: "#4f4a45", sun: ["#fffbe8", 0.66, 0.24] },
    evening: { sky: [["#3d3368", 0], ["#b75a6e", 0.5], ["#f39a55", 1]], far: "#6a4a6e", near: "#3f3240", house: "#2a2229", lit: "#ffc86b", sun: ["#ffc07a", 0.8, 0.5] },
    night: { sky: [["#05081a", 0], ["#15204a", 0.6], ["#2b3668", 1]], far: "#1e2748", near: "#10162a", house: "#0b0f1d", lit: "#ffd27a", moon: true },
    overcast: { sky: [["#7f8a96", 0], ["#aab3bc", 0.6], ["#c4cad0", 1]], far: "#6f7a84", near: "#5c6e57", house: "#403d3b", lit: "#f1d9a6" },
    snowy: { sky: [["#aebfce", 0], ["#d7e0e8", 0.7], ["#e9eef2", 1]], far: "#c3ced8", near: "#f2f5f8", house: "#56504c", lit: "#ffd9a0" },
  };
  const SCENE_OF = {
    morning: "morning", day: "day", evening: "evening", night: "night", sunny: "day", cloudy: "overcast", rain: "overcast",
    fog: "overcast", storm: "overcast", snow: "snowy", winter: "snowy", autumn: "evening", madness: "night",
  };

  function sceneryFor(state, id) {
    return state.variants.enabled ? SCENE_OF[id] || "day" : "day";
  }

  function drawScenery(c, w, h, key) {
    const L = SCENERY[key] || SCENERY.day, u = h / 900;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    const sky = c.createLinearGradient(0, 0, 0, h);
    for (const [color, stop] of L.sky) sky.addColorStop(stop, color);
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    if (L.moon) {
      const rand = mulberry32(7);
      c.fillStyle = "#ffffff";
      for (let i = 0; i < 140; i++) {
        c.globalAlpha = 0.25 + rand() * 0.75;
        c.beginPath();
        c.arc(rand() * w, rand() * h * 0.6, (0.5 + rand() * 1.5) * u, 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
      c.save();
      c.shadowColor = "rgba(255,240,200,.8)";
      c.shadowBlur = 40 * u;
      c.fillStyle = "#fdf3d0";
      c.beginPath();
      c.arc(w * 0.74, h * 0.24, h * 0.055, 0, TAU);
      c.fill();
      c.restore();
    }
    if (L.sun) {
      const [color, sx, sy] = L.sun;
      c.save();
      c.shadowColor = color;
      c.shadowBlur = 70 * u;
      c.fillStyle = color;
      c.beginPath();
      c.arc(sx * w, sy * h, h * 0.065, 0, TAU);
      c.fill();
      c.restore();
    }
    c.fillStyle = L.far;
    c.beginPath();
    c.moveTo(0, h * 0.6);
    for (const [px, py] of [[0.12, 0.48], [0.25, 0.58], [0.4, 0.45], [0.55, 0.56], [0.7, 0.47], [0.85, 0.57], [1, 0.5]]) {
      c.lineTo(px * w, py * h);
    }
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.fill();
    c.fillStyle = L.near;
    c.beginPath();
    c.moveTo(0, h * 0.76);
    c.bezierCurveTo(w * 0.3, h * 0.66, w * 0.6, h * 0.8, w, h * 0.7);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.fill();
    const hx = w * 0.26, base = h * 0.75, hw = w * 0.1, hh = h * 0.11;
    c.fillStyle = L.house;
    c.fillRect(hx, base - hh, hw, hh + h * 0.04);
    c.beginPath();
    c.moveTo(hx - hw * 0.12, base - hh);
    c.lineTo(hx + hw / 2, base - hh - hh * 0.75);
    c.lineTo(hx + hw * 1.12, base - hh);
    c.closePath();
    c.fill();
    c.fillRect(hx + hw * 0.7, base - hh - hh * 0.75, hw * 0.12, hh * 0.5);
    if (L.lit) {
      c.save();
      c.fillStyle = L.lit;
      c.shadowColor = L.lit;
      c.shadowBlur = 18 * u;
      for (const [wx, wy] of [[0.16, 0.3], [0.62, 0.3], [0.16, 0.62], [0.62, 0.62]]) {
        c.fillRect(hx + hw * wx, base - hh + hh * wy, hw * 0.2, hh * 0.2);
      }
      c.restore();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- entry points

  // env: { images: Map<id, HTMLImageElement>, recolorCache: Map, fontFamilies: { id: family } }
  // Returns hit boxes (virtual units) in paint order: back layers, label, front layers.
  function render(ctx, state, env, slotId, width, height) {
    const slot = resolveSlot(state, slotId);
    const g = {
      ctx, state, env, slot, W: width, H: height, k: height / BASE_H, VW: virtualWidth(state.size), hits: [],
      openingRect: () => openingRect(state),
      traceWindow: c => traceWindow(c, state),
      traceFrame: c => traceFrame(c, state),
      color: ref => resolveColor(ref, slot),
      visible: obj => isVisible(state, obj, slot.id),
    };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(g.k, 0, 0, g.k, 0, 0);
    drawTint(g);
    if (window.FrameEffects) window.FrameEffects.draw(g);
    drawShadow(g);
    drawFill(g);
    drawLayers(g, "back");
    drawLines(g);
    drawOrnaments(g);
    if (window.FrameDeco) window.FrameDeco.drawAll(g);
    drawIndicator(g);
    drawLayers(g, "front");
    ctx.restore();
    return g.hits;
  }

  function drawGrid(ctx, state, width, height) {
    const u = gridUnits(state.size.w, state.size.h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    for (let i = 1; i < u.w; i++) {
      const x = Math.round(width * i / u.w) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let j = 1; j < u.h; j++) {
      const y = Math.round(height * j / u.h) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.stroke();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.stroke();
    ctx.restore();
  }

  function drawSelection(ctx, hit, k) {
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.translate(hit.cx, hit.cy);
    ctx.rotate(hit.rotation * Math.PI / 180);
    ctx.lineWidth = 2 / k;
    ctx.setLineDash([6 / k, 5 / k]);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(-hit.w / 2, -hit.h / 2, hit.w, hit.h);
    ctx.lineDashOffset = 5.5 / k;
    ctx.strokeStyle = "#6b70ff";
    ctx.strokeRect(-hit.w / 2, -hit.h / 2, hit.w, hit.h);
    ctx.restore();
  }

  function hitTest(hits, vx, vy) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i], a = -h.rotation * Math.PI / 180;
      const dx = vx - h.cx, dy = vy - h.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= h.w / 2 + 6 && Math.abs(ly) <= h.h / 2 + 6) return h;
    }
    return null;
  }

  window.FrameRender = {
    BASE_H, render, drawGrid, drawSelection, hitTest, virtualWidth, gridUnits, openingRect,
    resolveSlot, drawScenery, sceneryFor,
  };
})();
