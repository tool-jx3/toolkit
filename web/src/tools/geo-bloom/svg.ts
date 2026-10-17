/**
 * SVG（規格 3.6，新版新增）：同一份產生的資料畫成向量檔。和 PNG 的畫法一一對應（3.3、3.4），
 * 座標取到小數 2 位、角度取到小數 3 位；同色、相鄰的線合併成一個 path（顏色都不透明，合併後看起來相同）。
 */
import type { BloomScene, BloomShape } from './generate';
import type { BloomConfig } from './settings';

/** 數字 → 最多 2 位小數（-0 寫成 0） */
const n2 = (v: number) => String(Number(v.toFixed(2)) || 0);
const n3 = (v: number) => String(Number(v.toFixed(3)) || 0);

const point = (r: number, a: number) => `${n2(Math.cos(a) * r)} ${n2(Math.sin(a) * r)}`;

/** 從角度 a0 到 a1（順時針）的弧：拆成兩段 A（每段都小於 180°，不會有大弧的歧義） */
function arcPath(r: number, a0: number, a1: number): string {
  const mid = (a0 + a1) / 2;
  const rr = `${n2(r)} ${n2(r)} 0 0 1`;
  return `M${point(r, a0)}A${rr} ${point(r, mid)}A${rr} ${point(r, a1)}`;
}

const fillAttr = (color: string, opacity90: boolean) =>
  opacity90 ? ` fill="${color}" fill-opacity="0.9"` : ` fill="${color}"`;

function shapeBody(s: BloomShape, color: string, lineWidth: number): string {
  const f = s.fill ? fillAttr(color, true) : '';
  switch (s.kind) {
    case 'circle':
      return (
        `<circle r="${n2(s.r)}"${f}/>` +
        `<circle r="${n2(Math.max(1.5, lineWidth * 1.2))}" fill="${color}" stroke="none"/>`
      );
    case 'rings': {
      const rings = s.rings ?? [];
      return rings
        .map((r, i) => {
          const fill = i === rings.length - 1 && s.fill ? fillAttr(color, false) : '';
          return `<circle r="${n2(r)}"${fill}/>`;
        })
        .join('');
    }
    case 'semi':
      return `<path d="${arcPath(s.r, 0, Math.PI)}${s.closed ? 'Z' : ''}"${f}/>`;
    case 'mix': {
      const rings = s.rings ?? [];
      let out = rings
        .map((r, i) => {
          const arc = s.arcs?.[i];
          return arc
            ? `<path d="${arcPath(r, arc.start, arc.start + arc.span)}"/>`
            : `<circle r="${n2(r)}"/>`;
        })
        .join('');
      if (s.fill && rings.length)
        out += `<path d="${arcPath(rings[rings.length - 1], 0, Math.PI)}Z" fill="${color}" stroke="none"/>`;
      return out;
    }
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

  /* 線：同色、相鄰的合併成一個 path（順序不變） */
  let run: string[] = [];
  let runColor = '';
  const flush = () => {
    if (run.length) out.push(`<path d="${run.join('')}" stroke="${runColor}"/>`);
    run = [];
  };
  for (const l of scene.lines) {
    const c = color(l.accent);
    if (c !== runColor) {
      flush();
      runColor = c;
    }
    run.push(`M${n2(l.x1)} ${n2(l.y1)}L${n2(l.x2)} ${n2(l.y2)}`);
  }
  flush();

  for (const d of scene.dots)
    out.push(`<circle cx="${n2(d.x)}" cy="${n2(d.y)}" r="${n2(d.r)}" fill="${color(d.accent)}"/>`);

  for (const s of scene.shapes) {
    const c = color(s.accent);
    const deg = (s.rotation * 180) / Math.PI;
    out.push(
      `<g transform="translate(${n2(s.x)} ${n2(s.y)}) rotate(${n3(deg)})" stroke="${c}">${shapeBody(s, c, cfg.lineWidth)}</g>`,
    );
  }
  out.push('</g>', '</svg>');
  return `${out.join('\n')}\n`;
}
