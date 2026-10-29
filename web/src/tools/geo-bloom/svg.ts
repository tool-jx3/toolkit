/**
 * SVG（規格 3.6，新版新增）：同一份產生的資料畫成向量檔。和 PNG 的畫法一一對應（3.3、3.4），畫的順序也相同；
 * 座標取到小數 2 位、角度取到小數 3 位；同色、相鄰的線合併成一個 path（顏色都不透明，合併後看起來相同）。
 */
import type { BloomRing, BloomScene, BloomShape } from './generate';
import type { BloomConfig } from './settings';

/** 數字 → 最多 2 位小數（-0 寫成 0） */
const n2 = (v: number) => String(Number(v.toFixed(2)) || 0);
const n3 = (v: number) => String(Number(v.toFixed(3)) || 0);

const TAU = Math.PI * 2;
const point = (r: number, a: number) => `${n2(Math.cos(a) * r)} ${n2(Math.sin(a) * r)}`;

/** 從角度 a0 到 a1（順時針）的弧：拆成兩段 A（每段都小於 180°，不會有大弧的歧義） */
function arcPath(r: number, a0: number, a1: number): string {
  const mid = (a0 + a1) / 2;
  const rr = `${n2(r)} ${n2(r)} 0 0 1`;
  return `M${point(r, a0)}A${rr} ${point(r, mid)}A${rr} ${point(r, a1)}`;
}

const fillAttr = (color: string, opacity90: boolean) =>
  opacity90 ? ` fill="${color}" fill-opacity="0.9"` : ` fill="${color}"`;

/** 一層：完整的圓、弧，或摩斯環的點線（線寬、線頭另外設；圓點是實心圓） */
function ringBody(g: BloomRing, color: string, cfg: BloomConfig): string {
  if (g.code) {
    const d = (g.segs ?? []).map((sg) => arcPath(g.r, sg.a0, sg.a1)).join('');
    return d
      ? `<path d="${d}" stroke-width="${n2(cfg.lineWidth * cfg.codeWidth)}" stroke-linecap="butt"/>`
      : '';
  }
  if (!g.segs) {
    return g.span >= TAU - 1e-6 && g.a0 === 0
      ? `<circle r="${n2(g.r)}"/>`
      : `<path d="${arcPath(g.r, g.a0, g.a0 + g.span)}"/>`;
  }
  const lw = cfg.lineWidth * cfg.morseWidth;
  let d = '';
  let dots = '';
  for (const sg of g.segs) {
    if (sg.dot && cfg.morseRound) {
      const m = (sg.a0 + sg.a1) / 2;
      const rr = Math.max(lw * 0.5, ((sg.a1 - sg.a0) * g.r) / 2);
      dots += `<circle cx="${n2(Math.cos(m) * g.r)}" cy="${n2(Math.sin(m) * g.r)}" r="${n2(rr)}" fill="${color}" stroke="none"/>`;
    } else d += arcPath(g.r, sg.a0, sg.a1);
  }
  const cap = cfg.morseCap ? 'round' : 'butt';
  return (d ? `<path d="${d}" stroke-width="${n2(lw)}" stroke-linecap="${cap}"/>` : '') + dots;
}

function ringsBody(s: BloomShape, color: string, cfg: BloomConfig): string {
  const rings = s.rings ?? [];
  let out = '';
  if (s.fill && rings.length) {
    const g = rings[rings.length - 1];
    out +=
      g.span >= TAU - 1e-6 && g.a0 === 0
        ? `<circle r="${n2(g.r)}"${fillAttr(color, true)} stroke="none"/>`
        : `<path d="${arcPath(g.r, g.a0, g.a0 + g.span)}${g.span < TAU - 1e-6 ? 'Z' : ''}"${fillAttr(color, true)} stroke="none"/>`;
  }
  for (const g of rings) if (!g.hidden) out += ringBody(g, color, cfg);
  const tri = s.tri;
  if (tri) {
    const pts = [0, 1, 2].map((e) => point(tri.R, tri.rot + (e * TAU) / 3 - s.rotation));
    out += `<path d="M${pts[0]}L${pts[1]}L${pts[2]}Z"${tri.fill ? fillAttr(color, true) : ''}/>`;
  }
  if (s.bridges?.length)
    out += `<path d="${s.bridges.map((b) => `M${point(b.r0, b.a)}L${point(b.r1, b.a)}`).join('')}"/>`;
  if (s.core === 'big') {
    const vis = rings.filter((g) => !g.hidden);
    const rr = Math.max(cfg.lineWidth * 3, tri ? (tri.R / 2) * 0.85 : vis[vis.length - 1].r * 0.75);
    out += `<circle r="${n2(rr)}" fill="${color}" stroke="none"/>`;
  } else if (s.kind === 'rings' && s.core !== 'none')
    out += `<circle r="${n2(Math.max(1.5, cfg.lineWidth * 1.2))}" fill="${color}" stroke="none"/>`;
  return out;
}

function shapeBody(s: BloomShape, color: string, cfg: BloomConfig): string {
  const f = s.fill ? fillAttr(color, true) : '';
  switch (s.kind) {
    case 'circle':
      return (
        `<circle r="${n2(s.r)}"${f}/>` +
        `<circle r="${n2(Math.max(1.5, cfg.lineWidth * 1.2))}" fill="${color}" stroke="none"/>`
      );
    case 'rings':
    case 'mix':
      return ringsBody(s, color, cfg);
    case 'semi':
      return `<path d="${arcPath(s.r, 0, Math.PI)}${s.closed ? 'Z' : ''}"${f}/>`;
    case 'square':
    case 'doubleSquare': {
      const h = s.r / Math.SQRT2;
      let out = `<rect x="${n2(-h)}" y="${n2(-h)}" width="${n2(h * 2)}" height="${n2(h * 2)}"${f}/>`;
      if (s.kind === 'doubleSquare') {
        const h2 = h * 0.6;
        out += `<rect x="${n2(-h2)}" y="${n2(-h2)}" width="${n2(h2 * 2)}" height="${n2(h2 * 2)}" transform="rotate(45)"/>`;
      }
      return out;
    }
  }
}

export function bloomSvg(cfg: BloomConfig, scene: BloomScene): string {
  const { width: w, height: h } = cfg;
  const color = (accent: boolean) => (accent ? cfg.accentColor : cfg.lineColor);
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ];
  if (!cfg.transparent) out.push(`<rect width="${w}" height="${h}" fill="${cfg.background}"/>`);
  out.push(
    `<g fill="none" stroke-width="${n2(cfg.lineWidth)}" stroke-linecap="round" stroke-linejoin="round">`,
  );

  /* 線：畫的順序裡同色、相鄰的合併成一個 path（丟失的線不畫） */
  let run: string[] = [];
  let runColor = '';
  const flush = () => {
    if (run.length) out.push(`<path d="${run.join('')}" stroke="${runColor}"/>`);
    run = [];
  };
  let si = 0;
  let li = 0;
  let di = 0;
  for (const k of scene.order) {
    if (k === 'l') {
      const l = scene.lines[li++];
      if (l.dropped) continue;
      const c = color(l.accent);
      if (c !== runColor) {
        flush();
        runColor = c;
      }
      run.push(`M${n2(l.x1)} ${n2(l.y1)}L${n2(l.x2)} ${n2(l.y2)}`);
      continue;
    }
    flush();
    runColor = '';
    if (k === 'd') {
      const d = scene.dots[di++];
      out.push(
        `<circle cx="${n2(d.x)}" cy="${n2(d.y)}" r="${n2(d.r)}" fill="${color(d.accent)}"/>`,
      );
    } else {
      const s = scene.shapes[si++];
      const c = color(s.accent);
      const deg = (s.rotation * 180) / Math.PI;
      out.push(
        `<g transform="translate(${n2(s.x)} ${n2(s.y)}) rotate(${n3(deg)})" stroke="${c}">${shapeBody(s, c, cfg)}</g>`,
      );
    }
  }
  flush();
  out.push('</g>', '</svg>');
  return `${out.join('\n')}\n`;
}
