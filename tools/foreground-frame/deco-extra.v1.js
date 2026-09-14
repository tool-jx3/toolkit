/*!
 * deco-extra.v1.js - more frame decorations: cobweb, chain, gears, circuit, snowcap, drips
 *
 * Registered into FrameDeco.TYPES; same signature as the plant types:
 * (ctx, render context, decoration, seeded random, [color, color2]).
 */
(function () {
  "use strict";

  const D = window.FrameDeco, TAU = Math.PI * 2;
  const { guideRuns, corners, shade, lerp } = D;

  function sweep(a0, a1) {
    let d = a1 - a0;
    while (d > Math.PI) d -= TAU;
    while (d <= -Math.PI) d += TAU;
    return d;
  }

  // Smooth wobble in [-1, 1]: two sines with random phases.
  function wobble(rand) {
    const p1 = rand() * TAU, p2 = rand() * TAU, f1 = 0.9 + rand() * 0.5, f2 = 2.1 + rand() * 1.3;
    return u => 0.65 * Math.sin(u * f1 + p1) + 0.35 * Math.sin(u * f2 + p2);
  }

  function polygon(c, outer, inner) {
    c.beginPath();
    outer.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    for (let i = inner.length - 1; i >= 0; i--) c.lineTo(inner[i][0], inner[i][1]);
    c.closePath();
  }

  function cobweb(c, g, d, rand, [c1, c2]) {
    const s = d.size, R = 150 * s, threads = 5 + Math.round(d.density * 3), rings = 3 + Math.round(d.density * 4);
    c.lineCap = "round";
    c.lineJoin = "round";
    corners(g, d).forEach((k, index) => {
      const a0 = Math.atan2(k.ey, k.ex), span = sweep(a0, Math.atan2(k.fy, k.fx));
      const angles = [];
      c.strokeStyle = c1;
      c.globalAlpha = 0.75;
      c.lineWidth = 1.3 * s;
      for (let i = 0; i < threads; i++) {
        const a = a0 + span * i / (threads - 1), len = R * (0.9 + rand() * 0.25);
        angles.push(a);
        c.beginPath();
        c.moveTo(k.x, k.y);
        c.lineTo(k.x + Math.cos(a) * len, k.y + Math.sin(a) * len);
        c.stroke();
      }
      c.globalAlpha = 0.6;
      c.lineWidth = 1 * s;
      for (let j = 1; j <= rings; j++) {
        const rr = R * j / (rings + 0.5);
        c.beginPath();
        angles.forEach((a, i) => {
          const x = k.x + Math.cos(a) * rr, y = k.y + Math.sin(a) * rr;
          if (!i) { c.moveTo(x, y); return; }
          const am = (angles[i - 1] + a) / 2, sag = rr * 0.8;
          c.quadraticCurveTo(k.x + Math.cos(am) * sag, k.y + Math.sin(am) * sag, x, y);
        });
        c.stroke();
      }
      c.globalAlpha = 1;
      if (index !== 0 || d.density < 0.4) return;
      const a = a0 + span * 0.5, hx = k.x + Math.cos(a) * R * 0.5, hy = k.y + Math.sin(a) * R * 0.5;
      const sx = hx, sy = hy + 60 * s * (0.7 + rand() * 0.7);
      c.globalAlpha = 0.7;
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(sx, sy);
      c.stroke();
      c.globalAlpha = 1;
      c.strokeStyle = c2;
      c.fillStyle = c2;
      c.lineWidth = 1.6 * s;
      for (const side of [-1, 1]) {
        for (let l = 0; l < 4; l++) {
          const ly = sy - 2 * s + l * 3 * s;
          c.beginPath();
          c.moveTo(sx, ly);
          c.quadraticCurveTo(sx + side * 9 * s, ly - 7 * s + l * 2.5 * s, sx + side * 13 * s, ly + (l - 1.5) * 4.5 * s);
          c.stroke();
        }
      }
      c.beginPath();
      c.ellipse(sx, sy + 3 * s, 5 * s, 6.5 * s, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.arc(sx, sy - 4.5 * s, 3.5 * s, 0, TAU);
      c.fill();
    });
  }

  function chain(c, g, d, rand, [c1, c2]) {
    const s = d.size, span = lerp(460, 150, d.density) * s, depth = span * 0.16, link = 24 * s;
    for (const run of guideRuns(g, d, 4)) {
      if (run.length < 2) continue;
      const total = run[run.length - 1].u, swags = Math.max(1, Math.round(total / span)), per = total / swags;
      const curve = run.map(p => {
        const sag = Math.sin(((p.u / per) % 1) * Math.PI) * depth;
        return { x: p.x - p.nx * sag, y: p.y - p.ny * sag, a: 0 };
      });
      for (let i = 1; i < curve.length; i++) {
        curve[i].a = curve[i - 1].a + Math.hypot(curve[i].x - curve[i - 1].x, curve[i].y - curve[i - 1].y);
      }
      const length = curve[curve.length - 1].a;
      let i = 0, n = 0;
      for (let a = link / 2; a < length; a += link * 0.78, n++) {
        while (i < curve.length - 2 && curve[i + 1].a < a) i++;
        const p0 = curve[i], p1 = curve[i + 1], t = (a - p0.a) / Math.max(1e-6, p1.a - p0.a);
        c.save();
        c.translate(lerp(p0.x, p1.x, t), lerp(p0.y, p1.y, t));
        c.rotate(Math.atan2(p1.y - p0.y, p1.x - p0.x));
        c.beginPath();
        c.ellipse(0, 0, link * 0.55, n % 2 ? 2.4 * s : 7 * s, 0, 0, TAU);
        c.lineWidth = 5 * s;
        c.strokeStyle = c2;
        c.stroke();
        c.lineWidth = 2.4 * s;
        c.strokeStyle = c1;
        c.stroke();
        c.restore();
      }
      for (let k = 0; k <= swags; k++) {
        const target = k * per;
        const p = run.reduce((best, q) => (Math.abs(q.u - target) < Math.abs(best.u - target) ? q : best), run[0]);
        c.beginPath();
        c.arc(p.x, p.y, 7 * s, 0, TAU);
        c.fillStyle = c2;
        c.fill();
        c.beginPath();
        c.arc(p.x, p.y, 4 * s, 0, TAU);
        c.fillStyle = c1;
        c.fill();
      }
    }
  }

  function gear(c, x, y, r, rot, fill, dark, hub) {
    const teeth = Math.max(8, Math.round(r / 5.5)), tooth = Math.min(11, r * 0.2), step = TAU / teeth;
    c.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = rot + i * step;
      [[a, r - tooth], [a + step * 0.12, r], [a + step * 0.42, r], [a + step * 0.54, r - tooth], [a + step, r - tooth]]
        .forEach(([pa, pr], j) => {
          const px = x + Math.cos(pa) * pr, py = y + Math.sin(pa) * pr;
          if (i === 0 && j === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        });
    }
    c.closePath();
    c.moveTo(x + r * 0.3, y);
    c.arc(x, y, r * 0.3, 0, TAU);
    c.fillStyle = fill;
    c.fill("evenodd");
    c.strokeStyle = dark;
    c.lineWidth = Math.max(1.2, r * 0.035);
    c.stroke();
    c.beginPath();
    c.arc(x, y, r * 0.62, 0, TAU);
    for (let i = 0; i < 5; i++) {
      const a = rot + i * TAU / 5;
      c.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
      c.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
    }
    c.stroke();
    c.beginPath();
    c.arc(x, y, r * 0.15, 0, TAU);
    c.fillStyle = hub;
    c.fill();
  }

  function gears(c, g, d, rand, [c1, c2]) {
    const s = d.size, R = 58 * s, dark = shade(c1, 0.5);
    const mesh = (r1, r2) => r1 + r2 - (Math.min(11, r1 * 0.2) + Math.min(11, r2 * 0.2)) * 0.45;
    for (const k of corners(g, d)) {
      const bx = k.x + k.dx * R * 0.3, by = k.y + k.dy * R * 0.3, rot = rand() * TAU;
      const list = [[bx, by, R, rot, c1]];
      const r2 = R * 0.62, g2 = mesh(R, r2);
      list.push([bx + k.ex * g2, by + k.ey * g2, r2, rand() * TAU, shade(c1, 1.15)]);
      if (d.density > 0.3) {
        const r3 = R * 0.46, g3 = mesh(R, r3);
        list.push([bx + k.fx * g3, by + k.fy * g3, r3, rand() * TAU, shade(c1, 0.85)]);
      }
      if (d.density > 0.7) {
        const r4 = R * 0.34, g4 = mesh(r2, r4);
        const [x2, y2] = list[1];
        list.push([x2 + k.ex * g4 * 0.7 - k.dx * g4 * 0.5, y2 + k.ey * g4 * 0.7 - k.dy * g4 * 0.5, r4, rand() * TAU, shade(c1, 1.05)]);
      }
      for (const [x, y, r, ro, fill] of list.slice().reverse()) gear(c, x, y, r, ro, fill, dark, c2);
    }
  }

  function circuit(c, g, d, rand, [c1, c2]) {
    const s = d.size, r = g.openingRect(), o = d.offset || 0;
    const band = { t: r.y0, b: 1080 - r.y1, l: r.x0, r: g.VW - r.x1 };
    c.lineCap = "round";
    c.lineJoin = "round";
    for (const run of guideRuns(g, d, 4)) {
      if (run.length < 2) continue;
      const traces = 2 + Math.round(d.density * 2), seg = lerp(220, 70, d.density) * s;
      for (let t = 0; t < traces; t++) {
        let level = rand(), next = rand() * seg, padNext = rand() * seg, depth = null, prev = null;
        const pads = [];
        c.save();
        c.shadowColor = c1;
        c.shadowBlur = 8 * g.k;
        c.strokeStyle = c1;
        c.lineWidth = 2 * s;
        c.globalAlpha = 0.85;
        c.beginPath();
        for (const p of run) {
          if (p.u >= next) {
            next = p.u + seg * (0.5 + rand());
            level = rand();
          }
          const room = Math.max(0, band[p.side] - o - 16 * s);
          const target = 8 * s + level * room;
          const stepLen = prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : 0;
          depth = depth == null ? target : depth + Math.max(-stepLen, Math.min(stepLen, target - depth));
          const x = p.x + p.nx * depth, y = p.y + p.ny * depth;
          if (prev) c.lineTo(x, y);
          else c.moveTo(x, y);
          if (p.u >= padNext) {
            pads.push([x, y]);
            padNext = p.u + seg * (0.8 + rand() * 1.6);
          }
          prev = p;
        }
        c.stroke();
        c.restore();
        for (const [x, y] of pads) {
          c.beginPath();
          c.arc(x, y, 5 * s, 0, TAU);
          c.strokeStyle = c2;
          c.lineWidth = 2 * s;
          c.stroke();
          c.beginPath();
          c.arc(x, y, 2 * s, 0, TAU);
          c.fillStyle = c1;
          c.fill();
        }
      }
    }
  }

  function snowcap(c, g, d, rand, [c1, c2]) {
    const s = d.size;
    for (const run of guideRuns(g, d, 4)) {
      if (run.length < 2) continue;
      const w1 = wobble(rand), w2 = wobble(rand), outer = [], inner = [];
      for (const p of run) {
        const up = -p.ny;
        const thick = (up < -0.5 ? 3 : 10 + 4 * w1(p.u / 60)) * s;
        const down = up > 0.5 ? (8 + 6 * w2(p.u / 45)) * s
          : up < -0.5 ? (14 + 10 * (0.5 + 0.5 * w2(p.u / 70))) * s
            : (4 + 2 * w2(p.u / 50)) * s;
        outer.push([p.x + p.nx * thick, p.y + p.ny * thick]);
        inner.push([p.x - p.nx * down, p.y - p.ny * down]);
      }
      polygon(c, outer, inner);
      c.save();
      c.shadowColor = "rgba(0,0,0,.25)";
      c.shadowBlur = 6 * g.k;
      c.shadowOffsetY = 2 * g.k;
      c.fillStyle = c1;
      c.fill();
      c.restore();
      c.strokeStyle = c2;
      c.lineWidth = 3 * s;
      c.globalAlpha = 0.6;
      c.beginPath();
      inner.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
      c.globalAlpha = 1;
      const every = lerp(110, 22, d.density) * s;
      let next = rand() * every;
      run.forEach((p, i) => {
        if (-p.ny < 0.7 || p.u < next) return;
        next = p.u + every * (0.5 + rand());
        const [x, y] = inner[i], len = (14 + Math.pow(rand(), 2) * 70) * s, w = (4 + rand() * 4) * s;
        const grad = c.createLinearGradient(x, y, x, y + len);
        grad.addColorStop(0, c1);
        grad.addColorStop(1, "rgba(255,255,255,0.2)");
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(x - w, y - 3 * s);
        c.quadraticCurveTo(x - w * 0.3, y + len * 0.4, x, y + len);
        c.quadraticCurveTo(x + w * 0.3, y + len * 0.4, x + w, y - 3 * s);
        c.closePath();
        c.fill();
        c.strokeStyle = c2;
        c.globalAlpha = 0.45;
        c.lineWidth = 1 * s;
        c.stroke();
        c.globalAlpha = 1;
      });
    }
  }

  function drips(c, g, d, rand, [c1, c2]) {
    const s = d.size;
    for (const run of guideRuns(g, d, 4)) {
      if (run.length < 2) continue;
      const w = wobble(rand), outer = [], inner = [];
      for (const p of run) {
        const lip = (6 + 4 * w(p.u / 40)) * s;
        outer.push([p.x + p.nx * 4 * s, p.y + p.ny * 4 * s]);
        inner.push([p.x - p.nx * lip, p.y - p.ny * lip]);
      }
      polygon(c, outer, inner);
      c.fillStyle = c1;
      c.fill();
      const every = lerp(140, 26, d.density) * s;
      let next = rand() * every;
      run.forEach((p, i) => {
        if (p.u < next || p.ny > 0.3) return;
        next = p.u + every * (0.4 + rand() * 1.2);
        const [x, y] = inner[i], len = (10 + Math.pow(rand(), 1.8) * 110) * s;
        const wd = (3 + rand() * 3.5) * s, bulb = wd * (1.1 + rand() * 0.5);
        c.fillStyle = c1;
        c.beginPath();
        c.moveTo(x - wd, y - 4 * s);
        c.bezierCurveTo(x - wd * 0.7, y + len * 0.45, x - bulb, y + len - bulb * 0.6, x - bulb, y + len);
        c.arc(x, y + len, bulb, Math.PI, 0, true);
        c.bezierCurveTo(x + bulb, y + len - bulb * 0.6, x + wd * 0.7, y + len * 0.45, x + wd, y - 4 * s);
        c.closePath();
        c.fill();
        c.fillStyle = c2;
        c.globalAlpha = 0.55;
        c.beginPath();
        c.ellipse(x - bulb * 0.35, y + len - bulb * 0.15, bulb * 0.22, bulb * 0.38, -0.3, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
      });
    }
  }

  Object.assign(D.TYPES, { cobweb, chain, gears, circuit, snowcap, drips });
})();
