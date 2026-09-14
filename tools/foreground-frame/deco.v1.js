/*!
 * deco.v1.js - decorations on the frame itself (ivy, flowers, thorns...)
 *
 * Most decorations follow a "guide": the window outline pushed outward by an
 * offset, sampled every few units. Each sample knows its outward normal and
 * which side it is on, so one sampler serves every placement ("top only",
 * "corners"...) and the "coverage" slider (growing out from the corners).
 * deco-extra.v1.js registers more types into FrameDeco.TYPES.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function shade(color, f) {
    const m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) return color;
    const n = parseInt(m[1], 16), ch = v => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  }

  // ---------------------------------------------------------------- guide

  function sampleGuide(g, offset, step) {
    const r = g.openingRect(), o = offset, pts = [];
    const push = (x, y, nx, ny, corner) => pts.push({
      x, y, nx, ny, tx: -ny, ty: nx, corner,
      side: Math.abs(ny) >= Math.abs(nx) ? (ny < 0 ? "t" : "b") : (nx > 0 ? "r" : "l"),
    });
    if (g.state.opening.shape === "ellipse") {
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, a = r.w / 2 + o, b = r.h / 2 + o;
      const n = Math.max(32, Math.round(Math.PI * (a + b) / step));
      for (let i = 0; i < n; i++) {
        const t = -0.75 * Math.PI + i / n * TAU, nx = Math.cos(t) / a, ny = Math.sin(t) / b, len = Math.hypot(nx, ny);
        const q = ((t + 0.75 * Math.PI) / (Math.PI / 2)) % 4, corner = Math.abs(q - Math.round(q)) < 0.12 ? Math.round(q) % 4 : -1;
        push(cx + Math.cos(t) * a, cy + Math.sin(t) * b, nx / len, ny / len, corner);
      }
    } else {
      const lim = Math.min(r.w, r.h) / 2, op = g.state.opening;
      const rad = i => {
        const cr = op.linkCorners ? op.corners[0] : op.corners[i];
        return cr.type === "round" ? Math.min(cr.size, lim) : 0;
      };
      const centers = [[r.x0 + rad(0), r.y0 + rad(0)], [r.x1 - rad(1), r.y0 + rad(1)],
        [r.x1 - rad(2), r.y1 - rad(2)], [r.x0 + rad(3), r.y1 - rad(3)]];
      const starts = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];
      const arc = i => {
        const R = rad(i) + o, [cx, cy] = centers[i], n = Math.max(1, Math.round(Math.max(0, R) * Math.PI / 2 / step));
        for (let k = 0; k < n; k++) {
          const t = starts[i] + k / n * Math.PI / 2;
          push(cx + Math.cos(t) * R, cy + Math.sin(t) * R, Math.cos(t), Math.sin(t), i);
        }
      };
      const edge = (ax, ay, bx, by, nx, ny) => {
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
        for (let k = 0; k < n; k++) push(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, nx, ny, -1);
      };
      const x0 = r.x0 - o, y0 = r.y0 - o, x1 = r.x1 + o, y1 = r.y1 + o;
      arc(0); edge(centers[0][0], y0, centers[1][0], y0, 0, -1);
      arc(1); edge(x1, centers[1][1], x1, centers[2][1], 1, 0);
      arc(2); edge(centers[2][0], y1, centers[3][0], y1, 0, 1);
      arc(3); edge(x0, centers[3][1], x0, centers[0][1], -1, 0);
    }
    let s = 0;
    pts.forEach((p, i) => {
      if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      p.s = s;
    });
    const last = pts[pts.length - 1];
    const L = s + Math.hypot(pts[0].x - last.x, pts[0].y - last.y);
    const apex = [0, 1, 2, 3].map(i => {
      const mine = pts.filter(p => p.corner === i);
      return mine.length ? mine[Math.floor(mine.length / 2)].s : 0;
    });
    return { pts, L, apex };
  }

  const EDGE_SIDES = { all: "tblr", top: "t", bottom: "b", topbottom: "tb", sides: "lr" };
  const CORNER_SETS = { corners: [0, 1, 2, 3], topcorners: [0, 1], bottomcorners: [2, 3] };

  // Contiguous stretches of the guide that match placement + coverage. Each point gets `u` (length along its run).
  function guideRuns(g, d, step) {
    const { pts, L, apex } = sampleGuide(g, d.offset || 0, step || 6);
    const r = g.openingRect();
    const dist = (s, i) => { const x = Math.abs(s - apex[i]) % L; return Math.min(x, L - x); };
    const near = (p, set, reach) => set.some(i => dist(p.s, i) <= reach);
    const set = CORNER_SETS[d.placement], cover = Math.max(0.05, d.coverage == null ? 1 : d.coverage);
    const keep = pts.map(p => {
      if (set) return near(p, set, Math.min(r.w, r.h) * 0.5 * cover);
      if (!(EDGE_SIDES[d.placement] || "tblr").includes(p.side)) return false;
      return cover >= 0.999 || near(p, [0, 1, 2, 3], cover * (Math.max(r.w, r.h) / 2 + Math.abs(d.offset || 0)));
    });
    const runs = [];
    const start = keep.indexOf(false);
    if (start < 0) {
      runs.push(pts.concat([pts[0]].map(p => Object.assign({}, p))));
    } else {
      let cur = null;
      for (let k = 1; k <= pts.length; k++) {
        const i = (start + k) % pts.length;
        if (keep[i]) (cur || (cur = [])).push(pts[i]);
        else if (cur) { runs.push(cur); cur = null; }
      }
      if (cur) runs.push(cur);
    }
    for (const run of runs) {
      run[0].u = 0;
      for (let i = 1; i < run.length; i++) run[i].u = run[i - 1].u + Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
    }
    return runs;
  }

  const CORNER_PICK = { corners: [0, 1, 2, 3], topcorners: [0, 1], bottomcorners: [2, 3], top: [0, 1], bottom: [2, 3] };

  // Window corners pushed outward. e = along the top/bottom edge toward the middle, f = along the side.
  function corners(g, d) {
    const r = g.openingRect(), o = d.offset || 0;
    const all = [
      { i: 0, x: r.x0 - o, y: r.y0 - o, dx: -1, dy: -1, ex: 1, ey: 0, fx: 0, fy: 1, turn: 1 },
      { i: 1, x: r.x1 + o, y: r.y0 - o, dx: 1, dy: -1, ex: -1, ey: 0, fx: 0, fy: 1, turn: -1 },
      { i: 2, x: r.x1 + o, y: r.y1 + o, dx: 1, dy: 1, ex: -1, ey: 0, fx: 0, fy: -1, turn: 1 },
      { i: 3, x: r.x0 - o, y: r.y1 + o, dx: -1, dy: 1, ex: 1, ey: 0, fx: 0, fy: -1, turn: -1 },
    ];
    const pick = CORNER_PICK[d.placement] || [0, 1, 2, 3];
    return all.filter(k => pick.includes(k.i));
  }

  // ---------------------------------------------------------------- drawing helpers

  function wavy(run, amp, wave, phase) {
    return run.map(p => {
      const w = Math.sin(p.u / wave * TAU + phase) * amp;
      return { x: p.x + p.nx * w, y: p.y + p.ny * w, p };
    });
  }

  function smooth(c, pts) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    }
    const last = pts[pts.length - 1];
    c.lineTo(last.x, last.y);
    c.stroke();
  }

  // Leaf pointing along `angle`, base at (x, y).
  function leaf(c, x, y, angle, s, fill, vein) {
    c.save();
    c.translate(x, y);
    c.rotate(angle + Math.PI / 2);
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(-s * 0.75, -s * 0.15, -s * 0.7, -s * 0.95, 0, -s * 1.3);
    c.bezierCurveTo(s * 0.7, -s * 0.95, s * 0.75, -s * 0.15, 0, 0);
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = vein;
    c.lineWidth = Math.max(0.8, s * 0.07);
    c.beginPath();
    c.moveTo(0, -s * 0.05);
    c.lineTo(0, -s * 1.05);
    c.stroke();
    c.restore();
  }

  function flower(c, x, y, rad, rot, petal, center) {
    c.fillStyle = petal;
    for (let i = 0; i < 5; i++) {
      const a = rot + i * TAU / 5;
      c.beginPath();
      c.ellipse(x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.55, rad * 0.37, a, 0, TAU);
      c.fill();
    }
    c.fillStyle = center;
    c.beginPath();
    c.arc(x, y, rad * 0.26, 0, TAU);
    c.fill();
  }

  function sparkle(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y - s);
    c.quadraticCurveTo(x, y, x + s, y);
    c.quadraticCurveTo(x, y, x, y + s);
    c.quadraticCurveTo(x, y, x - s, y);
    c.quadraticCurveTo(x, y, x, y - s);
    c.fill();
  }

  // ---------------------------------------------------------------- plant types

  // (ctx, render context, decoration, seeded random, [color, color2])
  const TYPES = {
    ivy(c, g, d, rand, [c1, c2]) {
      const s = d.size;
      c.lineCap = "round";
      c.lineJoin = "round";
      for (const run of guideRuns(g, d, 6)) {
        if (run.length < 3) continue;
        const phase = rand() * TAU, main = wavy(run, 7 * s, 90 * s, phase);
        c.strokeStyle = c1;
        c.lineWidth = 3.2 * s;
        smooth(c, main);
        c.globalAlpha = 0.8;
        c.lineWidth = 1.6 * s;
        smooth(c, wavy(run, 10 * s, 140 * s, phase + 2));
        c.globalAlpha = 1;
        const spacing = lerp(64, 15, d.density) * s;
        let next = rand() * spacing, flip = 1;
        for (const q of main) {
          if (q.p.u < next) continue;
          next = q.p.u + spacing * (0.6 + rand() * 0.8);
          flip = -flip;
          const ang = Math.atan2(q.p.ty, q.p.tx) + flip * (Math.PI / 2 - 0.35 + rand() * 0.7);
          const px = q.x + Math.cos(ang) * 5 * s, py = q.y + Math.sin(ang) * 5 * s;
          c.strokeStyle = c1;
          c.lineWidth = 1.4 * s;
          c.beginPath();
          c.moveTo(q.x, q.y);
          c.lineTo(px, py);
          c.stroke();
          leaf(c, px, py, ang, (12 + rand() * 12) * s, shade(c2, 0.78 + rand() * 0.42), shade(c1, 0.85));
          if (rand() < 0.04 + 0.1 * d.density) {
            const cx = q.x + Math.cos(ang) * 12 * s, cy = q.y + Math.sin(ang) * 12 * s;
            c.lineWidth = 1.1 * s;
            c.beginPath();
            for (let t = 0; t <= 1.001; t += 0.05) {
              const a = ang + Math.PI + t * 4 * Math.PI, rr = 9 * s * (1 - t * 0.85);
              if (t === 0) c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
              else c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            c.stroke();
          }
        }
      }
    },

    flowers(c, g, d, rand, [c1, c2]) {
      const s = d.size, spacing = lerp(150, 26, d.density) * s;
      for (const run of guideRuns(g, d, 6)) {
        let next = rand() * spacing;
        for (const p of run) {
          if (p.u < next) continue;
          next = p.u + spacing * (0.5 + rand());
          const j = (rand() - 0.5) * 24 * s;
          flower(c, p.x + p.nx * j, p.y + p.ny * j, (7 + rand() * 6) * s, rand() * TAU, shade(c1, 0.9 + rand() * 0.15), c2);
        }
      }
    },

    thorns(c, g, d, rand, [c1, c2]) {
      const s = d.size;
      c.lineCap = "round";
      for (const run of guideRuns(g, d, 5)) {
        if (run.length < 3) continue;
        const phase = rand() * TAU;
        for (const k of [0, 1]) {
          const stem = wavy(run, 9 * s, 110 * s, phase + k * Math.PI);
          c.strokeStyle = c1;
          c.fillStyle = c1;
          c.lineWidth = (k ? 2 : 2.8) * s;
          smooth(c, stem);
          const every = lerp(42, 12, d.density) * s;
          let next = rand() * every, side = 1;
          for (let i = 1; i < stem.length; i++) {
            const q = stem[i];
            if (q.p.u < next) continue;
            next = q.p.u + every;
            side = -side;
            const dx = q.x - stem[i - 1].x, dy = q.y - stem[i - 1].y, len = Math.hypot(dx, dy) || 1;
            const tx = dx / len, ty = dy / len, nx = -ty * side, ny = tx * side, h = 7 * s, w = 2.2 * s;
            c.beginPath();
            c.moveTo(q.x - tx * w, q.y - ty * w);
            c.lineTo(q.x + nx * h + tx * h * 0.5, q.y + ny * h + ty * h * 0.5);
            c.lineTo(q.x + tx * w, q.y + ty * w);
            c.fill();
          }
        }
        const budEvery = lerp(280, 80, d.density) * s;
        let next = rand() * budEvery;
        c.fillStyle = c2;
        for (const p of run) {
          if (p.u < next) continue;
          next = p.u + budEvery * (0.6 + rand() * 0.8);
          c.beginPath();
          c.arc(p.x, p.y, 4.5 * s, 0, TAU);
          c.fill();
        }
      }
    },

    sakura(c, g, d, rand, [c1, c2]) {
      const s = d.size, r = g.openingRect();
      const reach = Math.min(r.w, r.h) * 0.55 * Math.max(0.2, d.coverage) * s;
      c.lineCap = "round";
      c.lineJoin = "round";
      const cluster = (x, y) => {
        for (let i = 0, n = 1 + Math.floor(rand() * (1 + d.density * 3)); i < n; i++) {
          flower(c, x + (rand() - 0.5) * 22 * s, y + (rand() - 0.5) * 22 * s, (8 + rand() * 6) * s,
            rand() * TAU, shade(c2, 0.94 + rand() * 0.1), shade(c2, 0.72));
        }
      };
      const branch = (x, y, ang, len, width, depth) => {
        const segs = 6, pts = [[x, y, ang]];
        let a = ang, px = x, py = y;
        for (let i = 1; i <= segs; i++) {
          a += (rand() - 0.5) * 0.35;
          px += Math.cos(a) * len / segs;
          py += Math.sin(a) * len / segs;
          pts.push([px, py, a]);
        }
        c.strokeStyle = c1;
        for (let i = 1; i < pts.length; i++) {
          c.lineWidth = Math.max(1, width * (1 - (i - 1) / segs * 0.75));
          c.beginPath();
          c.moveTo(pts[i - 1][0], pts[i - 1][1]);
          c.lineTo(pts[i][0], pts[i][1]);
          c.stroke();
        }
        pts.forEach(([bx, by, ba], i) => {
          if (depth > 1 && i >= 2 && i < segs && rand() < 0.5) {
            branch(bx, by, ba + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.4), len * 0.5, width * 0.55, depth - 1);
          }
          if (i >= 2 && (i === segs || rand() < 0.2 + d.density * 0.4)) cluster(bx, by);
        });
      };
      for (const k of corners(g, d)) {
        branch(k.x, k.y, Math.atan2(k.ey, k.ex) + k.turn * 0.18, reach, 9 * s, 3);
        branch(k.x, k.y, Math.atan2(k.fy, k.fx) - k.turn * 0.25, reach * 0.55, 6 * s, 2);
      }
    },

    grass(c, g, d, rand, [c1, c2]) {
      const s = d.size, every = lerp(16, 4, d.density) * s;
      for (const run of guideRuns(g, d, 3)) {
        let next = 0;
        for (const p of run) {
          if (p.u < next) continue;
          next = p.u + every * (0.5 + rand());
          const h = (16 + rand() * 34) * s, lean = (rand() - 0.5) * 0.9, w = 3.2 * s, ix = -p.nx, iy = -p.ny;
          c.fillStyle = rand() < 0.5 ? c1 : c2;
          c.beginPath();
          c.moveTo(p.x - p.tx * w, p.y - p.ty * w);
          c.quadraticCurveTo(p.x + ix * h * 0.6, p.y + iy * h * 0.6, p.x + ix * h + p.tx * lean * h, p.y + iy * h + p.ty * lean * h);
          c.quadraticCurveTo(p.x + ix * h * 0.5 + p.tx * w, p.y + iy * h * 0.5 + p.ty * w, p.x + p.tx * w, p.y + p.ty * w);
          c.fill();
        }
      }
    },

    stars(c, g, d, rand, [c1, c2]) {
      const s = d.size, r = g.openingRect();
      const band = { t: r.y0, b: 1080 - r.y1, l: r.x0, r: g.VW - r.x1 };
      const every = lerp(120, 18, d.density) * s;
      c.shadowBlur = 8 * g.k;
      for (const run of guideRuns(g, Object.assign({}, d, { offset: 0 }), 6)) {
        let next = rand() * every;
        for (const p of run) {
          if (p.u < next) continue;
          next = p.u + every * (0.4 + rand() * 1.2);
          const depth = Math.max(4, band[p.side] - 4) * rand() + (d.offset || 0);
          const col = rand() < 0.65 ? c1 : c2;
          c.fillStyle = col;
          c.shadowColor = col;
          c.globalAlpha = 0.5 + rand() * 0.5;
          sparkle(c, p.x + p.nx * depth, p.y + p.ny * depth, (2.5 + Math.pow(rand(), 2) * 9) * s);
        }
      }
    },
  };

  function drawAll(g) {
    for (const d of g.state.decorations || []) {
      const fn = TYPES[d.type];
      if (!d.on || !fn || !g.visible(d)) continue;
      const rand = mulberry32(hash(d.type) ^ Math.imul((d.seed | 0) + 1, 2654435761));
      g.ctx.save();
      if (d.clipFrame) {
        g.ctx.beginPath();
        g.traceFrame(g.ctx);
        g.ctx.clip("evenodd");
      }
      fn(g.ctx, g, d, rand, [g.color(d.color), g.color(d.color2)]);
      g.ctx.restore();
    }
  }

  window.FrameDeco = { TYPES, drawAll, guideRuns, corners, wavy, smooth, shade, sparkle, lerp };
})();
