/**
 * 總覽 PNG 的版面（規格 3.5，KP 用）：把場景圖（加上所有熱點的輪廓與編號）和全部線索排成場景節點（core/scene）。
 * 排版只靠「量字寬」的函式（env.measure），單元測試可以用假的字寬；畫圖時由 canvas 量。數值都是 1 倍時的 px。
 */
import type { FontUse } from '@/core/scene/draw';
import { wrapPlain } from '@/core/scene/text';
import type { SceneNode, TextFont } from '@/core/scene/types';
import {
  type ClueMapState,
  effectiveRequires,
  imageKey,
  paragraphs,
  type SceneRef,
  type Spot,
  sceneAspect,
  spotLabel,
} from './model';
import { S } from './strings';

export const OVERVIEW_FONT = 'Noto Sans TC';

export const OV = {
  width: 1200,
  pad: 48,
  bg: '#f6f3ec',
  ink: '#1f2328',
  muted: '#5b6670',
  border: '#d8d2c4',
  cardBorder: '#ddd6c6',
  chipBg: '#efe9db',
  check: '#9a5b00',
  dark: '#1f2328',
  missing: '#cfc9ba',
  cardGap: 16,
  cardPad: 20,
  badge: 28,
  cardBadge: 36,
} as const;

export interface OverviewEnv {
  /** 字寬（含字型） */
  measure: (font: TextFont, text: string) => number;
  /** 圖片（imageKey）；讀不到的是 null */
  image: (key: string) => CanvasImageSource | null;
  /** 圖片的實際寬高（讀不到時 null） */
  imageSize: (key: string) => { width: number; height: number } | null;
}

export interface OverviewLayout {
  width: number;
  height: number;
  nodes: SceneNode[];
}

const font = (size: number, weight = 400): TextFont => ({ family: OVERVIEW_FONT, size, weight });

/** 單行放不下時截斷加「…」 */
function ellipsize(env: OverviewEnv, f: TextFont, text: string, maxWidth: number): string {
  if (env.measure(f, text) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && env.measure(f, `${chars.join('')}…`) > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

/** 逐字換行後的行數 */
const lineCount = (env: OverviewEnv, f: TextFont, text: string, width: number): number =>
  wrapPlain(text, width, 'char', (ch) => env.measure(f, ch)).length;

/** 熱點在場景上的標示顏色：編號圓標底色（需要解鎖的是深色） */
function badgeNodes(x: number, y: number, n: number, dark: boolean, accent: string): SceneNode[] {
  return [
    {
      kind: 'rect',
      x,
      y,
      w: OV.badge,
      h: OV.badge,
      circle: true,
      fill: dark ? OV.dark : accent,
      stroke: { color: '#ffffff', width: 2 },
    },
    {
      kind: 'text',
      x,
      y,
      w: OV.badge,
      h: OV.badge,
      text: String(n),
      font: font(16, 700),
      color: dark ? '#ffffff' : '#000000',
      align: 'center',
      valign: 'middle',
    },
  ];
}

export function layoutOverview(d: ClueMapState, env: OverviewEnv): OverviewLayout {
  const W = OV.width;
  const PAD = OV.pad;
  const CW = W - PAD * 2;
  const nodes: SceneNode[] = [{ kind: 'rect', x: 0, y: 0, w: W, h: 1, fill: OV.bg }];
  let y: number = PAD;

  /* 標題與導言 */
  const titleFont = font(40, 700);
  const title = d.title.trim() || S.overview.defaultTitle;
  const titleLines = lineCount(env, titleFont, title, CW);
  nodes.push({
    kind: 'text',
    x: PAD,
    y,
    w: CW,
    text: title,
    font: titleFont,
    color: OV.ink,
    wrap: 'char',
    lineHeight: 1.2,
  });
  y += titleLines * 48;
  const intro = d.intro.trim();
  if (intro) {
    y += 8;
    const f = font(20);
    nodes.push({
      kind: 'text',
      x: PAD,
      y,
      w: CW,
      text: intro,
      font: f,
      color: OV.muted,
      wrap: 'char',
      lineHeight: 1.5,
    });
    y += lineCount(env, f, intro, CW) * 30;
  }
  y += 24;

  /* 場景與熱點 */
  const sceneKey = imageKey(d.scene);
  const size = env.imageSize(sceneKey);
  const aspect = size ? size.width / size.height : sceneAspect(d.scene);
  const sceneH = Math.round(CW / aspect);
  const sceneImg = env.image(sceneKey);
  if (sceneImg) {
    nodes.push({
      kind: 'image',
      x: PAD,
      y,
      w: CW,
      h: sceneH,
      image: sceneImg,
      fit: 'cover',
      radius: 12,
    });
  } else {
    nodes.push({ kind: 'rect', x: PAD, y, w: CW, h: sceneH, fill: OV.missing, radius: 12 });
    nodes.push({
      kind: 'text',
      x: PAD,
      y,
      w: CW,
      h: sceneH,
      text: S.overview.imageMissing,
      font: font(24),
      color: OV.muted,
      align: 'center',
      valign: 'middle',
    });
  }
  nodes.push({
    kind: 'rect',
    x: PAD,
    y,
    w: CW,
    h: sceneH,
    radius: 12,
    stroke: { color: OV.border, width: 1 },
  });
  const accent = d.look.accent;
  d.spots.forEach((s) => {
    const sx = PAD + (s.x / 100) * CW;
    const sy = y + (s.y / 100) * sceneH;
    const sw = (s.w / 100) * CW;
    const sh = (s.h / 100) * sceneH;
    const dash = s.hidden ? [10, 6] : undefined;
    if (s.shape === 'ellipse') {
      nodes.push({
        kind: 'custom',
        draw: (ctx) => {
          ctx.beginPath();
          ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = `${accent}2e`;
          ctx.fill();
          ctx.setLineDash(dash ?? []);
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = accent;
          ctx.stroke();
        },
      });
    } else {
      nodes.push({ kind: 'rect', x: sx, y: sy, w: sw, h: sh, fill: `${accent}2e` });
      nodes.push({
        kind: 'rect',
        x: sx,
        y: sy,
        w: sw,
        h: sh,
        stroke: { color: '#ffffff', width: 3, dash },
      });
      nodes.push({
        kind: 'rect',
        x: sx,
        y: sy,
        w: sw,
        h: sh,
        stroke: { color: accent, width: 2, dash },
      });
    }
  });
  d.spots.forEach((s, i) => {
    const sx = PAD + (s.x / 100) * CW;
    const sy = y + (s.y / 100) * sceneH;
    const bx = Math.min(Math.max(sx + 4, PAD), PAD + CW - OV.badge);
    const by = Math.min(Math.max(sy + 4, y), y + sceneH - OV.badge);
    nodes.push(...badgeNodes(bx, by, i + 1, effectiveRequires(s).length > 0, accent));
  });
  y += sceneH + 12;
  nodes.push({
    kind: 'text',
    x: PAD,
    y,
    w: CW,
    text: S.overview.legend,
    font: font(14),
    color: OV.muted,
    wrap: 'char',
    lineHeight: 20 / 14,
  });
  y += lineCount(env, font(14), S.overview.legend, CW) * 20 + 28;

  /* 線索一覽 */
  nodes.push({
    kind: 'text',
    x: PAD,
    y,
    w: CW,
    text: S.overview.heading(d.spots.length),
    font: font(28, 700),
    color: OV.ink,
    lineHeight: 36 / 28,
  });
  y += 36 + 16;
  if (!d.spots.length) {
    nodes.push({
      kind: 'text',
      x: PAD,
      y,
      w: CW,
      text: S.overview.none,
      font: font(20),
      color: OV.muted,
      lineHeight: 1.5,
    });
    y += 30 + 8;
  }
  const nameOf = (s: Spot) => spotLabel(s, d.spots.indexOf(s));
  d.spots.forEach((s, i) => {
    y = layoutCard(nodes, env, d, s, i, y, nameOf);
    y += OV.cardGap;
  });
  const height = Math.round((d.spots.length ? y - OV.cardGap : y) + PAD);
  nodes[0] = { kind: 'rect', x: 0, y: 0, w: W, h: height, fill: OV.bg };
  return { width: W, height, nodes };
}

/** 一個熱點的卡片；回傳卡片下緣的 y */
function layoutCard(
  nodes: SceneNode[],
  env: OverviewEnv,
  d: ClueMapState,
  s: Spot,
  index: number,
  top: number,
  nameOf: (s: Spot) => string,
): number {
  const PAD = OV.pad;
  const CW = OV.width - PAD * 2;
  const x0 = PAD;
  const inner = CW - OV.cardPad * 2;
  const hasImage = !!s.image;
  const imgKey = s.image ? imageKey(s.image) : '';
  const imgSource = s.image ? env.image(imgKey) : null;
  const imgSize = s.image ? env.imageSize(imgKey) : null;
  let imgW = 0;
  let imgH = 0;
  if (hasImage && imgSource && imgSize) {
    const k = Math.min(240 / imgSize.width, 180 / imgSize.height);
    imgW = Math.round(imgSize.width * k);
    imgH = Math.round(imgSize.height * k);
  } else if (hasImage) {
    imgW = 240;
    imgH = 160;
  }
  const textW = inner - (hasImage ? imgW + 20 : 0);
  const body: SceneNode[] = [];
  let y = top + OV.cardPad;
  const tx = x0 + OV.cardPad;

  /* 編號圓標＋名稱 */
  const nameFont = font(24, 700);
  const name = nameOf(s);
  const nameW = textW - OV.cardBadge - 12;
  const nameLines = lineCount(env, nameFont, name, nameW);
  const nameH = nameLines * 32;
  const headH = Math.max(OV.cardBadge, nameH);
  body.push(
    {
      kind: 'rect',
      x: tx,
      y,
      w: OV.cardBadge,
      h: OV.cardBadge,
      circle: true,
      fill: effectiveRequires(s).length ? OV.dark : d.look.accent,
    },
    {
      kind: 'text',
      x: tx,
      y,
      w: OV.cardBadge,
      h: OV.cardBadge,
      text: String(index + 1),
      font: font(18, 700),
      color: effectiveRequires(s).length ? '#ffffff' : '#000000',
      align: 'center',
      valign: 'middle',
    },
    {
      kind: 'text',
      x: tx + OV.cardBadge + 12,
      y: y + (headH - nameH) / 2,
      w: nameW,
      text: name,
      font: nameFont,
      color: OV.ink,
      wrap: 'char',
      lineHeight: 32 / 24,
    },
  );
  y += headH;

  /* 標籤 */
  const chips: string[] = [];
  if (s.hidden) chips.push(S.overview.tagHidden);
  const req = effectiveRequires(s);
  if (req.length) {
    const names = req
      .map((id) => d.spots.findIndex((o) => o.id === id))
      .filter((i) => i >= 0)
      .map((i) => `${i + 1} ${nameOf(d.spots[i])}`)
      .join('、');
    chips.push(S.overview.tagNeeds(names, s.mode === 'any'));
  }
  if (chips.length) {
    y += 10;
    const cf = font(14, 500);
    let cx = tx;
    for (const c of chips) {
      const label = ellipsize(env, cf, c, textW - 20);
      const w = Math.ceil(env.measure(cf, label)) + 20;
      if (cx > tx && cx + w > tx + textW) {
        cx = tx;
        y += 32;
      }
      body.push(
        { kind: 'rect', x: cx, y, w, h: 24, fill: OV.chipBg, radius: 12 },
        {
          kind: 'text',
          x: cx,
          y,
          w,
          h: 24,
          text: label,
          font: cf,
          color: OV.muted,
          align: 'center',
          valign: 'middle',
        },
      );
      cx += w + 8;
    }
    y += 24;
  }

  /* 線索文字 */
  const paras = paragraphs(s.text);
  const bf = font(20);
  if (paras.length) y += 12;
  paras.forEach((p, i) => {
    if (i) y += 10;
    body.push({
      kind: 'text',
      x: tx,
      y,
      w: textW,
      text: p,
      font: bf,
      color: OV.ink,
      wrap: 'char',
      lineHeight: 1.5,
    });
    y += lineCount(env, bf, p, textW) * 30;
  });

  /* 檢定提示 */
  const check = s.check.trim();
  if (check) {
    y += 10;
    const f = font(18);
    const t = `${S.overview.check}${check}`;
    body.push({
      kind: 'text',
      x: tx,
      y,
      w: textW,
      text: t,
      font: f,
      color: OV.check,
      wrap: 'char',
      lineHeight: 26 / 18,
    });
    y += lineCount(env, f, t, textW) * 26;
  }

  /* KP 備註 */
  const memo = s.memo.trim();
  if (memo) {
    y += 10;
    const f = font(18);
    const t = `${S.overview.memo}${memo}`;
    const n = lineCount(env, f, t, textW - 12);
    body.push(
      { kind: 'rect', x: tx, y, w: 3, h: n * 26, fill: OV.border },
      {
        kind: 'text',
        x: tx + 12,
        y,
        w: textW - 12,
        text: t,
        font: f,
        color: OV.muted,
        wrap: 'char',
        lineHeight: 26 / 18,
      },
    );
    y += n * 26;
  }

  /* 線索圖片（卡片右側） */
  let bottom = y;
  if (hasImage) {
    const ix = x0 + CW - OV.cardPad - imgW;
    const iy = top + OV.cardPad;
    body.push({ kind: 'rect', x: ix, y: iy, w: imgW, h: imgH, fill: '#f1ede2', radius: 8 });
    if (imgSource)
      body.push({
        kind: 'image',
        x: ix,
        y: iy,
        w: imgW,
        h: imgH,
        image: imgSource,
        fit: 'contain',
        radius: 8,
      });
    else
      body.push({
        kind: 'text',
        x: ix,
        y: iy,
        w: imgW,
        h: imgH,
        text: S.overview.imageMissing,
        font: font(14),
        color: OV.muted,
        align: 'center',
        valign: 'middle',
      });
    bottom = Math.max(bottom, iy + imgH);
  }
  const cardBottom = bottom + OV.cardPad;
  nodes.push(
    {
      kind: 'rect',
      x: x0,
      y: top,
      w: CW,
      h: cardBottom - top,
      fill: '#ffffff',
      radius: 12,
      stroke: { color: OV.cardBorder, width: 1 },
    },
    ...body,
  );
  return cardBottom;
}

/** 總覽用到的字（載入字型用） */
export function overviewFontUses(d: ClueMapState): FontUse[] {
  const text = [
    d.title,
    d.intro,
    S.overview.defaultTitle,
    S.overview.legend,
    S.overview.heading(d.spots.length),
    S.overview.none,
    S.overview.tagHidden,
    S.overview.tagNeeds('', false),
    S.overview.check,
    S.overview.memo,
    S.overview.imageMissing,
    '0123456789',
    ...d.spots.flatMap((s, i) => [s.name, spotLabel(s, i), s.text, s.check, s.memo]),
  ].join('');
  return [
    { family: OVERVIEW_FONT, weight: 400, text },
    { family: OVERVIEW_FONT, weight: 500, text },
    { family: OVERVIEW_FONT, weight: 700, text },
  ];
}

export type { SceneRef };
