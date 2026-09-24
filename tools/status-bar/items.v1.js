/*!
 * items.v1.js - art for the "wears away" effect: items beside a bar, and cracks on the bar (no UI, no state)
 *
 * Every item is drawn in five frames: 0 = intact, 1-3 = more and more damaged, 4 = gone.
 * deco.v1.js picks the frame from the remaining ratio.
 *
 * Adding an item: write draw(frame, colors) returning SVG markup in a 48 x 48 box, register it
 * in ITEMS below, and add its name to BarPresets.ITEM_TYPES. The markup ends up in a data: URL
 * (BarShapes.svgUrl), so attributes use single quotes.
 */
(function () {
  "use strict";

  const S = window.BarShapes;
  const n = v => String(Math.round(v * 10) / 10);
  const GRAY = "#6e6e76";

  function hexToRgb(hex) {
    let h = String(hex || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
    const v = parseInt(h.slice(0, 6), 16) || 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }

  function svg(defs, body) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'>"
      + (defs ? `<defs>${defs}</defs>` : "") + body + "</svg>";
  }

  const vGrad = (id, stops) => `<linearGradient id='${id}' x1='0' y1='0' x2='0' y2='1'>`
    + stops.map(([o, c]) => `<stop offset='${o}' stop-color='${c}'/>`).join("") + "</linearGradient>";

  const glowGrad = (id, color, alpha, from) => `<radialGradient id='${id}'><stop offset='${from || 0}' stop-color='${color}' stop-opacity='${n(alpha * 100) / 100}'/>`
    + `<stop offset='1' stop-color='${color}' stop-opacity='0'/></radialGradient>`;

  // A crack: a dark line with a thin light edge beside it, like broken glass.
  function crack(d, dark) {
    const common = "fill='none' stroke-linecap='round' stroke-linejoin='round'";
    return `<path d='${d}' ${common} stroke='${dark}' stroke-width='1.6'/>`
      + `<path d='${d}' ${common} stroke='#ffffff' stroke-opacity='.45' stroke-width='.6' transform='translate(.7 .5)'/>`;
  }

  function starPath(cx, cy, outer, inner) {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? inner : outer, a = Math.PI / 5 * i - Math.PI / 2;
      d += (i ? "L" : "M") + n(cx + r * Math.cos(a)) + " " + n(cy + r * Math.sin(a));
    }
    return d + "Z";
  }

  // ---------------------------------------------------------------- gem: cracks, chips, shatters

  const GEM = "M14 7H34L43 18L24 43L5 18Z";

  function gem(f, c) {
    const fade = [0, 0, 0.15, 0.4, 0.6][f];
    const hi = mix(mix(c.c1, "#ffffff", 0.45), GRAY, fade), mid = mix(c.c1, GRAY, fade), lo = mix(c.c2, GRAY, fade);
    const dark = mix(c.c2, "#000000", 0.6);
    if (f === 4) {
      const shard = (d, col) => `<path d='${d}' fill='${col}' stroke='${dark}' stroke-width='.6' stroke-linejoin='round'/>`;
      return svg("", `<path d='${GEM}' fill='none' stroke='${c.c1}' stroke-opacity='.4' stroke-width='1.2' stroke-dasharray='3 2.5' stroke-linejoin='round'/>`
        + shard("M7 44L11 38L14 43Z", mid) + shard("M16 45L20 39.5L23 44Z", lo) + shard("M26 44L29 38L33 44.5Z", hi)
        + shard("M35 45L39.5 40L41 44.5Z", mid) + shard("M20 34L23 31L24 36Z", lo));
    }
    const chip = f >= 2
      ? "<mask id='m'><rect width='48' height='48' fill='#fff'/><path d='M34.5 6L44 17.5L38 15.5L35.5 11Z' fill='#000'/>"
        + (f >= 3 ? "<path d='M24 44L19.5 37L25 36.5Z' fill='#000'/>" : "") + "</mask>"
      : "";
    let body = `<path d='${GEM}' fill='url(#g)' stroke='${dark}' stroke-width='1' stroke-linejoin='round'/>`
      + "<path d='M14 7H34L43 18H5Z' fill='#ffffff' fill-opacity='.16'/>"
      + `<path d='M5 18H43M14 7L18 18L24 7L30 18L34 7M18 18L24 43L30 18' fill='none' stroke='${dark}' stroke-opacity='.45' stroke-width='.8' stroke-linejoin='round'/>`;
    if (f <= 2) body += `<path d='M16 9L21 9L17.5 15Z' fill='#ffffff' fill-opacity='${f === 2 ? 0.35 : 0.75}'/>`;
    if (f === 0) body += "<path d='M39 1.5L40 5L43.5 6L40 7L39 10.5L38 7L34.5 6L38 5Z' fill='#ffffff' fill-opacity='.9'/>";
    const cracks = [];
    if (f >= 1) cracks.push("M31 9L28.5 14L32 18.5L28 24L30 29");
    if (f >= 2) cracks.push("M9 20L14.5 23L13 28L18 31", "M28.5 14L24 15.5");
    if (f >= 3) cracks.push("M20 9L22 14L19 19L22 24L20 31L23 37", "M32 18.5L37 21", "M22 24L27 26");
    body += cracks.map(d => crack(d, dark)).join("");
    const defs = vGrad("g", [[0, hi], [0.45, mid], [1, lo]]) + chip;
    return svg(defs, chip ? `<g mask='url(#m)'>${body}</g>` : body);
  }

  // ---------------------------------------------------------------- flower: wilts, droops, drops its petals

  function flower(f, c) {
    const wither = [0, 0.2, 0.45, 0.75, 1][f];
    const brown = "#7a5636";
    const petal = mix(c.c1, brown, wither), edge = mix(c.c2, "#3e2a1c", wither);
    const stem = mix("#4f9a52", "#8a7a40", wither), leaf = mix("#5fae5c", "#9a7a44", wither);
    const droop = [0, 8, 24, 48, 64][f];
    const keep = [[0, 1, 2, 3, 4], [0, 1, 2, 4], [0, 2, 4], [0, 2], []][f];
    const center = mix("#f2c94c", brown, wither);
    const petals = keep.map(i => `<ellipse cx='24' cy='7.2' rx='${n(4.8 - wither)}' ry='${n(6.8 - wither * 1.8)}'`
      + ` transform='rotate(${i * 72} 24 14)' fill='${petal}' stroke='${edge}' stroke-width='.8'/>`).join("");
    const head = `<g transform='rotate(${droop} 24 22)'>${petals}`
      + `<circle cx='24' cy='14' r='${f === 4 ? 3 : 4.2}' fill='${center}' stroke='${mix(center, "#000000", 0.3)}' stroke-width='.8'/></g>`;
    const fallen = [[12, 44.5, -20], [35, 45, 25], [19, 45.5, 10], [30, 44, -35]].slice(0, f)
      .map(([x, y, r]) => `<ellipse cx='${x}' cy='${y}' rx='3.4' ry='1.5' transform='rotate(${r} ${x} ${y})' fill='${mix(c.c1, brown, 0.6)}'/>`).join("");
    const stemPath = f >= 3 ? "M24 45C25 37 21 29 24 22" : "M24 45C24 37 23.5 29 24 22";
    const leafPath = f >= 3 ? "M23.5 37C20 36 15 40 12 42C17 42 21 40 23.5 37Z" : "M24 36C19 31 14 33 11 31C14 37 19 38 24 36Z";
    const glow = f === 0 ? "<circle cx='24' cy='14' r='14' fill='url(#l)'/>" : "";
    return svg(glowGrad("l", c.c1, 0.4), glow
      + `<path d='${stemPath}' fill='none' stroke='${stem}' stroke-width='2.2' stroke-linecap='round'/>`
      + `<path d='${leafPath}' fill='${leaf}'/>` + fallen + head);
  }

  // ---------------------------------------------------------------- moon: wanes from full to new

  // The lit part of a moon of radius 15 at (24, 24), lit from the right. frac: 1 = full, 0 = new.
  function moonLit(frac) {
    const k = 2 * frac - 1;
    const tail = Math.abs(k) < 1e-6 ? "L24 9" : `A${n(Math.abs(k) * 15)} 15 0 0 ${k > 0 ? 1 : 0} 24 9`;
    return `M24 9A15 15 0 0 1 24 39${tail}Z`;
  }

  function moon(f, c) {
    const lit = mix(c.c1, "#fff6dc", 0.6), crater = mix(c.c1, "#ffffff", 0.2);
    const frac = [1, 0.72, 0.5, 0.24, 0][f];
    const glowA = [0.55, 0.38, 0.22, 0.1, 0][f];
    let defs = glowGrad("g", c.c1, glowA, 0.55)
      + `<radialGradient id='s' cx='.62' cy='.38' r='.75'><stop offset='0' stop-color='#ffffff'/><stop offset='1' stop-color='${lit}'/></radialGradient>`;
    let body = glowA > 0 ? "<circle cx='24' cy='24' r='23' fill='url(#g)'/>" : "";
    body += `<circle cx='24' cy='24' r='15' fill='${mix(c.c2, "#05060c", 0.65)}' stroke='${mix(c.c1, GRAY, 0.3)}'`
      + ` stroke-opacity='${f === 4 ? 0.6 : 0.35}' stroke-width='1'/>`;
    if (frac > 0) {
      defs += `<clipPath id='c'><path d='${moonLit(frac)}'/></clipPath>`;
      body += "<g clip-path='url(#c)'><circle cx='24' cy='24' r='15' fill='url(#s)'/>"
        + [[19, 19, 3], [28, 29, 4], [31, 17, 2], [20, 31, 2]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${crater}' fill-opacity='.35'/>`).join("")
        + "</g>";
    } else {
      body += "<circle cx='9' cy='9' r='.9' fill='#ffffff' fill-opacity='.5'/><circle cx='40' cy='38' r='.7' fill='#ffffff' fill-opacity='.4'/>";
    }
    return svg(defs, body);
  }

  // ---------------------------------------------------------------- star: its light fades out

  function star(f, c) {
    const col = mix(mix(c.c1, "#ffffff", 0.35), GRAY, [0, 0.1, 0.35, 0.6, 0.85][f]);
    const glowA = [0.6, 0.4, 0.18, 0.06, 0][f];
    const size = [13, 12, 11, 9.5, 9][f];
    const ray = [21, 15, 8, 0, 0][f];
    let body = glowA > 0 ? "<circle cx='24' cy='24' r='23' fill='url(#g)'/>" : "";
    if (ray) {
      const a = 24 - ray, b = 24 + ray;
      body += `<path d='M24 ${n(a)}L25.2 22.8L${n(b)} 24L25.2 25.2L24 ${n(b)}L22.8 25.2L${n(a)} 24L22.8 22.8Z' fill='#ffffff' fill-opacity='${[0.85, 0.6, 0.3][f]}'/>`;
    }
    if (f < 4) {
      body += `<path d='${starPath(24, 25, size, size * 0.45)}' fill='${col}' stroke='${mix(col, "#ffffff", 0.5)}' stroke-width='.8' stroke-linejoin='round'/>`
        + `<circle cx='24' cy='24.5' r='3.2' fill='#ffffff' fill-opacity='${[0.95, 0.75, 0.4, 0.15][f]}'/>`;
    } else {
      body += `<path d='${starPath(24, 25, size, size * 0.45)}' fill='none' stroke='${GRAY}' stroke-opacity='.55' stroke-width='1.1' stroke-dasharray='2.5 2' stroke-linejoin='round'/>`
        + "<circle cx='14' cy='38' r='.8' fill='#ffffff' fill-opacity='.35'/><circle cx='34' cy='41' r='.6' fill='#ffffff' fill-opacity='.3'/><circle cx='29' cy='37' r='.5' fill='#ffffff' fill-opacity='.25'/>";
    }
    return svg(glowGrad("g", c.c1, glowA), body);
  }

  // ---------------------------------------------------------------- candle: burns down and goes out

  function candle(f, c) {
    const h = [25, 20, 15, 10, 8][f];
    const top = 42 - h;
    const wax = mix(c.c1, "#ffffff", 0.35);
    const defs = `<linearGradient id='w' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${wax}'/><stop offset='.55' stop-color='${c.c1}'/><stop offset='1' stop-color='${c.c2}'/></linearGradient>`
      + glowGrad("g", "#ffcf66", [0.55, 0.42, 0.3, 0.16, 0][f]);
    let body = "";
    if (f < 4) body += `<circle cx='24' cy='${top - 8}' r='${[16, 13, 10, 7][f]}' fill='url(#g)'/>`;
    body += "<ellipse cx='24' cy='43' rx='13' ry='3' fill='#5d6170'/><ellipse cx='24' cy='42.2' rx='10' ry='2' fill='#7a7f90'/>"
      + `<rect x='16' y='${top}' width='16' height='${h}' rx='2' fill='url(#w)'/>`
      + `<ellipse cx='24' cy='${top + 0.6}' rx='8' ry='1.8' fill='${mix(wax, "#ffffff", 0.3)}'/>`
      + `<rect x='17.4' y='${top}' width='2.6' height='${Math.min(7, h - 2)}' rx='1.3' fill='${wax}'/>`
      + `<rect x='27' y='${top}' width='2.4' height='${Math.min(4, h - 2)}' rx='1.2' fill='${wax}'/>`
      + `<path d='M24 ${top}V${top - 3}' stroke='#2a2420' stroke-width='1.2' stroke-linecap='round'/>`;
    if (f < 4) {
      const s = [1, 0.8, 0.6, 0.38][f], base = top - 2.2;
      const flame = (fh, fw, color) => `<path d='M24 ${n(base - fh)}Q${n(24 + fw * 1.35)} ${n(base - fh * 0.35)} 24 ${n(base)}`
        + `Q${n(24 - fw * 1.35)} ${n(base - fh * 0.35)} 24 ${n(base - fh)}Z' fill='${color}'/>`;
      body += flame(13 * s, 4.6 * s, "#ff9a3c") + flame(7.8 * s, 2.5 * s, "#fff1b8");
    } else {
      body += `<path d='M24 ${top - 3}C21 ${top - 7} 27 ${top - 10} 24 ${top - 14}C21 ${top - 18} 26 ${top - 20} 24 ${top - 24}'`
        + " fill='none' stroke='#a3a8b3' stroke-opacity='.6' stroke-width='1.4' stroke-linecap='round'/>"
        + `<circle cx='24' cy='${top - 3}' r='.9' fill='#ff5a2a'/>`;
    }
    return svg(defs, body);
  }

  // ---------------------------------------------------------------- heart: cracks, then breaks in two

  const HEART = "M24 42C10 31 4 24 4 16.4C4 10.6 8.6 6 14.2 6C18.2 6 22 8.4 24 12C26 8.4 29.8 6 33.8 6C39.4 6 44 10.6 44 16.4C44 24 38 31 24 42Z";
  const SPLIT = "L22 17L25.5 21L22.5 26L25 30L23 35L24 42";

  function heart(f, c) {
    const fade = [0, 0, 0.2, 0.45, 0][f];
    const top = mix(mix(c.c1, "#ffffff", 0.3), GRAY, fade), bottom = mix(c.c2, GRAY, fade), dark = mix(c.c2, "#000000", 0.55);
    if (f === 4) {
      return svg("", `<path d='${HEART}' fill='none' stroke='${c.c1}' stroke-opacity='.45' stroke-width='1.3' stroke-dasharray='3 2.5'/>`
        + `<path d='M16 44L19 40L21 44.5Z' fill='${bottom}'/><path d='M27 44.5L30 40.5L32 44Z' fill='${top}'/>`);
    }
    let defs = vGrad("g", [[0, top], [1, bottom]]);
    const shape = `<path d='${HEART}' fill='url(#g)' stroke='${dark}' stroke-width='1'/>`
      + (f <= 1 ? "<ellipse cx='14.5' cy='14' rx='4.5' ry='3' transform='rotate(-30 14.5 14)' fill='#ffffff' fill-opacity='.45'/>" : "");
    if (f === 3) {
      defs += `<clipPath id='l'><path d='M0 0H24V12${SPLIT}V48H0Z'/></clipPath><clipPath id='r'><path d='M48 0H24V12${SPLIT}V48H48Z'/></clipPath>`;
      return svg(defs, `<g transform='translate(-2.6 1) rotate(-9 24 42)'><g clip-path='url(#l)'>${shape}</g></g>`
        + `<g transform='translate(2.6 1) rotate(9 24 42)'><g clip-path='url(#r)'>${shape}</g></g>`);
    }
    let body = shape;
    if (f === 1) body += crack("M24 12L22 17L25.5 21L22.5 26", dark);
    if (f === 2) body += crack("M24 12L22 17L25.5 21L22.5 26L25 30L23 35L24 41", dark) + crack("M22.5 26L18 28", dark);
    return svg(defs, body);
  }

  const ITEMS = { gem, flower, moon, star, candle, heart };

  // Five data: URLs (frame 0-4) for one bar, or "none" when the bar has no item.
  function frames(type, colors) {
    const draw = ITEMS[type];
    return [0, 1, 2, 3, 4].map(f => (draw ? S.svgUrl(draw(f, colors)) : "none"));
  }

  // ---------------------------------------------------------------- cracks on the bar

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Cracks over a bar of w x h pixels. Stages add up (the same seed redraws the earlier impacts):
  // 1-3 = one more impact each, 4 = shattered (the bar is empty by then, so it also darkens).
  function crackUrl(w, h, stage, seed, color, alpha) {
    const rand = rng(seed * 7919 + 17);
    const reach = Math.max(h * 1.4, Math.min(w * 0.22, 70));
    const step = Math.max(4, h * 0.35);
    let d = "";
    const ray = (x, y, angle, len) => {
      const steps = Math.max(3, Math.round(len / step));
      d += `M${n(x)} ${n(y)}`;
      for (let i = 0; i < steps; i++) {
        const a = angle + (rand() - 0.5) * 0.9;
        x += Math.cos(a) * len / steps;
        y += Math.sin(a) * len / steps;
        d += `L${n(x)} ${n(y)}`;
      }
    };
    const spots = [[0.66 + rand() * 0.2, 5], [0.38 + rand() * 0.16, 6], [0.1 + rand() * 0.16, 6], [0.5 + rand() * 0.4, 7]];
    for (let s = 0; s < Math.min(stage, 4); s++) {
      const [fx, count] = spots[s];
      const x = fx * w, y = h * (0.3 + rand() * 0.4);
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2 + rand() * 0.8;
        // Rays along the bar run longer: a bar is wide and thin.
        const along = Math.abs(Math.cos(angle));
        ray(x, y, angle, reach * (s === 3 ? 1.3 : 1) * (0.45 + 0.55 * along) * (0.6 + rand() * 0.5));
      }
    }
    const sw = Math.max(0.9, Math.min(2, h * 0.07));
    const shade = stage >= 4 ? "<rect width='100%' height='100%' fill='#000' fill-opacity='.3'/>" : "";
    return S.svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${n(w)}' height='${n(h)}' viewBox='0 0 ${n(w)} ${n(h)}'>`
      + `<defs><path id='k' d='${d}' fill='none' stroke-linecap='round' stroke-linejoin='round'/></defs>${shade}`
      + `<use href='#k' stroke='${color}' stroke-opacity='${alpha}' stroke-width='${n(sw)}'/>`
      + `<use href='#k' stroke='#ffffff' stroke-opacity='${n(alpha * 45) / 100}' stroke-width='${n(sw * 0.45)}' transform='translate(.6 .6)'/></svg>`);
  }

  window.BarItems = { ITEMS, frames, crackUrl, mix };
})();
