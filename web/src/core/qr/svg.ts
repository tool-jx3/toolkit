/**
 * 有樣式的 QR code 場景 → SVG 檔的文字（向量；中間的圖以 data: 網址嵌進去，同原作的 saveAsBlob）。
 */
import { formatHex, parseColor } from '../color';
import { escapeHtmlAttr } from '../html';
import type { QrFill, QrScene } from './style';

const num = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** 顏色拆成 #rrggbb 與不透明度（SVG 1.1 的閱讀器不一定認得 #rrggbbaa） */
function colorAttrs(color: string, attr: string, opacityAttr: string): string {
  const c = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const hex = formatHex({ ...c, a: 1 }, false);
  return c.a < 1 ? `${attr}="${hex}" ${opacityAttr}="${num(c.a)}"` : `${attr}="${hex}"`;
}

export interface QrSvgOptions {
  /** 中間的圖（data: 網址）；場景有圖的位置時才放 */
  imageHref?: string;
  /** 倍率：寫在 width、height（viewBox 不變） */
  scale?: number;
}

export function qrSceneToSvg(scene: QrScene, options: QrSvgOptions = {}): string {
  const k = options.scale ?? 1;
  const defs: string[] = [];
  const ids = new Map<QrFill, string>();
  const paint = (f: QrFill, attr: 'fill'): string => {
    if (f.kind === 'solid') return colorAttrs(f.color, attr, `${attr}-opacity`);
    let id = ids.get(f);
    if (!id) {
      id = `qr-gradient-${ids.size}`;
      ids.set(f, id);
      const stops = f.stops
        .map(
          (s) =>
            `<stop offset="${num(s.offset * 100)}%" ${colorAttrs(s.color, 'stop-color', 'stop-opacity')}/>`,
        )
        .join('');
      defs.push(
        f.kind === 'linear'
          ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(f.x1)}" y1="${num(f.y1)}" x2="${num(f.x2)}" y2="${num(f.y2)}">${stops}</linearGradient>`
          : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(f.cx)}" cy="${num(f.cy)}" fx="${num(f.cx)}" fy="${num(f.cy)}" r="${num(f.r)}">${stops}</radialGradient>`,
      );
    }
    return `${attr}="url(#${id})"`;
  };

  const body: string[] = [];
  const bg = scene.background;
  if (bg) {
    const rx = bg.rx > 0 ? ` rx="${num(bg.rx)}"` : '';
    body.push(
      `<rect x="${num(bg.x)}" y="${num(bg.y)}" width="${num(bg.width)}" height="${num(bg.height)}"${rx} ${paint(bg.fill, 'fill')}/>`,
    );
  }
  for (const layer of scene.layers) {
    if (!layer.d) continue;
    const rule = layer.rule === 'evenodd' ? ' fill-rule="evenodd"' : '';
    body.push(`<path d="${layer.d}"${rule} ${paint(layer.fill, 'fill')}/>`);
  }
  if (scene.image && options.imageHref) {
    const href = escapeHtmlAttr(options.imageHref);
    const r = scene.image;
    body.push(
      `<image href="${href}" xlink:href="${href}" x="${num(r.x)}" y="${num(r.y)}" width="${num(r.width)}" height="${num(r.height)}"/>`,
    );
  }
  const crisp = scene.crisp ? ' shape-rendering="crispEdges"' : '';
  return [
    '<?xml version="1.0" standalone="no"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(scene.width * k)}" height="${num(scene.height * k)}" viewBox="0 0 ${num(scene.width)} ${num(scene.height)}"${crisp}>`,
    defs.length ? `<defs>${defs.join('')}</defs>` : '',
    ...body,
    '</svg>',
    '',
  ]
    .filter((s, i, a) => s || i === a.length - 1)
    .join('\n');
}
