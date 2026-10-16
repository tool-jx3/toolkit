/**
 * 限時動態（規格 3.7）：360 × 640（cqw ＝ 3.6）。背景 → 格子與照片 → 貼紙 → 上下陰影、狀態列、進度條、帳號列、下方介面。
 */
import {
  BG_PRESETS,
  type ChipSticker,
  cellCount,
  imageSize,
  isBgPreset,
  LAYOUT_GRID,
  type Sticker,
  type Story,
} from '../model';
import { S } from '../strings';
import { ellipsize, layoutLines } from '../text';
import { avatar, type Env, statusIcons, withAlpha } from './common';
import type { Hit, LinearPaint, Op, Paint, Rect, ScreenLayout } from './ops';
import { CHIP_COLORS, contrastText, MUSIC_ART, rgba, STORY_FONT_SPECS, ui } from './theme';

export const SW = 360;
export const SH = 640;
export const U = SW / 100;

/** CSS 的 linear-gradient(160deg, …) 在 rect 上的起點與終點 */
export function gradient160(r: Rect, stops: readonly (readonly [number, string])[]): LinearPaint {
  const a = (160 * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(r.width * dx) + Math.abs(r.height * dy);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return {
    linear: {
      x0: cx - (dx * len) / 2,
      y0: cy - (dy * len) / 2,
      x1: cx + (dx * len) / 2,
      y1: cy + (dy * len) / 2,
      stops,
    },
  };
}

/** 背景（色票 id 的漸層或單色）塗在 rect */
export function bgPaint(bg: string, r: Rect): Paint {
  if (isBgPreset(bg)) return gradient160(r, BG_PRESETS[bg].stops);
  return bg;
}

/** 格子的位置（看得到的格子） */
export function cellRects(st: Story): Rect[] {
  const { cols, rows } = LAYOUT_GRID[st.layout];
  const g = st.gap * U;
  const cw = (SW - (cols - 1) * g) / cols;
  const ch = (SH - (rows - 1) * g) / rows;
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: c * (cw + g), y: r * (ch + g), width: cw, height: ch });
  return out;
}

/* ---------- 貼紙 ---------- */

export interface StickerLayout {
  /** 貼紙原本的大小（縮放 1 時；中心在 0,0） */
  w: number;
  h: number;
  /** 以中心為原點的指令 */
  ops: Op[];
}

const chipPrefix = (k: ChipSticker): string =>
  k.type === 'mention' ? '@' : k.type === 'hashtag' ? '#' : '';

/** 標籤類的字：提及加 @、標籤加 #（已經有的不重複），全部大寫 */
export const chipText = (k: ChipSticker): string =>
  (chipPrefix(k) + k.text.replace(/^[@#]/, '')).toUpperCase();

export function layoutSticker(env: Env, k: Sticker): StickerLayout {
  const { measure } = env;
  const ops: Op[] = [];
  switch (k.type) {
    case 'text': {
      const spec = STORY_FONT_SPECS[k.font];
      const size = spec.size * U;
      const font = { family: spec.family, weight: spec.weight, size, italic: spec.italic };
      const lh = spec.lh * size;
      const padX = 0.32 * size;
      const padY = 0.06 * size;
      const neon = k.font === 'neon';
      const textColor = neon
        ? '#ffffff'
        : k.bg === 'solid'
          ? contrastText(k.color)
          : k.bg === 'soft'
            ? '#ffffff'
            : k.color;
      const lines = layoutLines(
        [{ text: k.text || ' ', font, color: textColor }],
        90 * U - padX * 2,
        measure,
      );
      const w = Math.max(...lines.map((l) => l.width), 0) + padX * 2;
      const h = lines.length * lh;
      const fill = neon
        ? null
        : k.bg === 'solid'
          ? k.color
          : k.bg === 'soft'
            ? rgba(k.color, 0.55)
            : null;
      const boxH = size * 1.45 + padY * 2;
      lines.forEach((line, i) => {
        const lw = line.width + padX * 2;
        const lx = k.align === 'left' ? -w / 2 : k.align === 'right' ? w / 2 - lw : -lw / 2;
        const top = -h / 2 + i * lh;
        if (fill && line.width > 0)
          ops.push({
            t: 'rect',
            x: lx,
            y: top + (lh - boxH) / 2,
            w: lw,
            h: boxH,
            r: 0.28 * size,
            fill,
          });
        for (const r of line.runs) {
          if (!r.text) continue;
          ops.push({
            t: 'text',
            x: lx + padX + r.x,
            y: top,
            lh,
            text: r.text,
            font,
            color: textColor,
            glow: neon
              ? { color: k.color, blurs: [0.06 * size, 0.2 * size, 0.45 * size, 0.9 * size] }
              : undefined,
          });
        }
      });
      return { w, h, ops };
    }
    case 'emoji': {
      const font = ui(18 * U);
      const w = Math.max(18 * U * 0.6, measure(k.text, font));
      const h = 18 * U;
      ops.push({
        t: 'text',
        x: 0,
        y: -h / 2,
        lh: h,
        text: k.text,
        font,
        color: '#ffffff',
        align: 'center',
      });
      return { w, h, ops };
    }
    case 'mention':
    case 'hashtag':
    case 'location':
    case 'link': {
      const size = 6 * U;
      const font = ui(size, 800);
      const text = chipText(k);
      const tw = measure(text, font);
      const icon = k.type === 'location' ? 'mapPin' : k.type === 'link' ? 'link' : null;
      const iconW = icon ? 6 * U + 1.2 * U : 0;
      const padX = 3.4 * U;
      const padY = 2.2 * U;
      const lh = size * 1.1;
      const w = tw + iconW + padX * 2;
      const h = lh + padY * 2;
      const [c0, c1] = CHIP_COLORS[k.type];
      const grad = (x0: number, x1: number): LinearPaint => ({
        linear: {
          x0,
          y0: 0,
          x1,
          y1: 0,
          stops: [
            [0, c0],
            [1, c1],
          ],
        },
      });
      if (k.style === 'white')
        ops.push({
          t: 'rect',
          x: -w / 2,
          y: -h / 2,
          w,
          h,
          r: 2.2 * U,
          fill: '#ffffff',
          shadow: { color: 'rgba(0,0,0,0.12)', blur: 2 * U, y: 0.4 * U },
        });
      else if (k.style === 'color')
        ops.push({
          t: 'rect',
          x: -w / 2,
          y: -h / 2,
          w,
          h,
          r: 2.2 * U,
          fill: grad(-w / 2, w / 2),
          shadow: { color: 'rgba(0,0,0,0.12)', blur: 2 * U, y: 0.4 * U },
        });
      let x = -w / 2 + padX;
      const clear = k.style === 'clear';
      const shadow = clear ? { color: 'rgba(0,0,0,0.25)', blur: 2 * U } : undefined;
      if (icon) {
        ops.push({
          t: 'icon',
          name: icon,
          x,
          y: -3 * U,
          size: 6 * U,
          color: k.style === 'white' ? c0 : '#ffffff',
          sw: 2.4,
          shadow,
        });
        x += iconW;
      }
      ops.push({
        t: 'text',
        x,
        y: -lh / 2,
        lh,
        text,
        font,
        color: k.style === 'white' ? grad(x, x + tw) : '#ffffff',
        shadow,
      });
      return { w, h, ops };
    }
    case 'music': {
      const w = 64 * U;
      const pad = 2.6 * U;
      const art = 13 * U;
      const h = art + pad * 2;
      const dark = k.dark;
      ops.push({
        t: 'rect',
        x: -w / 2,
        y: -h / 2,
        w,
        h,
        r: 3.2 * U,
        fill: dark ? 'rgba(20,20,20,0.85)' : '#ffffff',
        shadow: { color: 'rgba(0,0,0,0.18)', blur: 3 * U, y: 0.6 * U },
      });
      const ax = -w / 2 + pad;
      const ay = -art / 2;
      if (k.image)
        ops.push({
          t: 'image',
          img: k.image,
          x: ax,
          y: ay,
          w: art,
          h: art,
          r: 1.6 * U,
          fallback: MUSIC_ART[0],
        });
      else
        ops.push({
          t: 'rect',
          x: ax,
          y: ay,
          w: art,
          h: art,
          r: 1.6 * U,
          fill: {
            linear: {
              x0: ax,
              y0: ay,
              x1: ax + art,
              y1: ay + art,
              stops: [
                [0, MUSIC_ART[0]],
                [1, MUSIC_ART[1]],
              ],
            },
          },
        });
      const ink = dark ? '#ffffff' : '#000000';
      const eqW = 0.9 * U * 3 + 0.7 * U * 2;
      const tx = ax + art + 3 * U;
      const tw = w / 2 - pad - eqW - 3 * U - tx;
      const tf = ui(4 * U, 700);
      const af = ui(3.5 * U);
      const tl = 4 * U * 1.25;
      const al = 3.5 * U * 1.25;
      const top = -(tl + al) / 2;
      ops.push({
        t: 'text',
        x: tx,
        y: top,
        lh: tl,
        text: ellipsize(k.title, tw, tf, measure),
        font: tf,
        color: ink,
      });
      ops.push({
        t: 'text',
        x: tx,
        y: top + tl,
        lh: al,
        text: ellipsize(k.artist, tw, af, measure),
        font: af,
        color: withAlpha(ink, 0.6),
      });
      const eh = 4.5 * U;
      const ex = w / 2 - pad - eqW;
      [0.5, 1, 0.7].forEach((r, i) => {
        ops.push({
          t: 'rect',
          x: ex + i * (0.9 * U + 0.7 * U),
          y: eh / 2 - eh * r,
          w: 0.9 * U,
          h: eh * r,
          r: 0.5 * U,
          fill: ink,
        });
      });
      return { w, h, ops };
    }
    case 'question': {
      const w = 66 * U;
      const padT = 8 * U;
      const pad = 4 * U;
      const tf = ui(4.8 * U, 700);
      const tlh = 4.8 * U * 1.3;
      const lines = layoutLines(
        [{ text: k.title || ' ', font: tf, color: contrastText(k.color) }],
        w - pad * 2,
        measure,
      );
      const titleH = lines.length * tlh;
      const hf = ui(3.8 * U);
      const ih = 3.8 * U * 1.45 + 3.2 * U * 2;
      const h = padT + titleH + 3 * U + ih + pad;
      const top = -h / 2;
      ops.push({
        t: 'rect',
        x: -w / 2,
        y: top,
        w,
        h,
        r: 4 * U,
        fill: k.color,
        shadow: { color: 'rgba(0,0,0,0.18)', blur: 3 * U, y: 0.6 * U },
      });
      lines.forEach((l, i) => {
        for (const r of l.runs)
          ops.push({
            t: 'text',
            x: -l.width / 2 + r.x,
            y: top + padT + i * tlh,
            lh: tlh,
            text: r.text,
            font: tf,
            color: r.color,
          });
      });
      const iy = top + padT + titleH + 3 * U;
      ops.push({
        t: 'rect',
        x: -w / 2 + pad,
        y: iy,
        w: w - pad * 2,
        h: ih,
        r: 2.4 * U,
        fill: 'rgba(0,0,0,0.06)',
      });
      ops.push({
        t: 'text',
        x: 0,
        y: iy + 3.2 * U,
        lh: 3.8 * U * 1.45,
        text: ellipsize(k.hint, w - pad * 2 - 6.4 * U, hf, measure),
        font: hf,
        color: 'rgba(0,0,0,0.45)',
        align: 'center',
      });
      /* 上緣中央的大頭貼（白框） */
      const ar = 5.5 * U;
      ops.push({ t: 'circle', cx: 0, cy: top, r: ar + 0.8 * U, fill: '#ffffff' });
      ops.push(...avatar(env.state.profile.avatar, 0, top, ar * 2, env.pal));
      return { w, h, ops };
    }
    default: {
      const nat = imageSize(k.image);
      const s = Math.min(1, (60 * U) / nat.width, (60 * U) / nat.height);
      const w0 = nat.width * s;
      const h0 = nat.height * s;
      const b = k.frame ? 1.6 * U : 0;
      const w = w0 + b * 2;
      const h = h0 + b * 2;
      if (k.frame)
        ops.push({
          t: 'rect',
          x: -w / 2,
          y: -h / 2,
          w,
          h,
          r: 1 * U,
          fill: '#ffffff',
          shadow: { color: 'rgba(0,0,0,0.25)', blur: 3 * U, y: 0.6 * U },
        });
      ops.push({ t: 'image', img: k.image, x: -w0 / 2, y: -h0 / 2, w: w0, h: h0, fit: 'contain' });
      return { w, h, ops };
    }
  }
}

/* ---------- 畫面 ---------- */

export interface StoryOptions {
  /** 選取中的格子（編輯中、兩格以上時畫框） */
  selectedCell?: number | null;
  /** HTML：目前那段的進度條從 0 開始（檢視程式讓它跑滿）；關閉鈕可以點 */
  viewer?: { autoplay: boolean; closable: boolean };
  /** 不畫這些貼紙（編輯中拖曳時由操作層畫）；目前不用 */
  hideStickers?: readonly string[];
}

export function storyScreen(
  env: Env,
  st: Story,
  opts: StoryOptions = {},
): ScreenLayout & { stickers: Map<string, StickerLayout> } {
  const { fs, state, measure } = env;
  const pr = state.profile;
  const ops: Op[] = [];
  const hits: Hit[] = [];
  const parts: Record<string, Rect> = {};
  const full: Rect = { x: 0, y: 0, width: SW, height: SH };

  /* 背景與格子 */
  ops.push({ t: 'rect', x: 0, y: 0, w: SW, h: SH, fill: bgPaint(st.bg, full) });
  const rects = cellRects(st);
  const n = cellCount(st.layout);
  if (st.gap > 0) ops.push({ t: 'rect', x: 0, y: 0, w: SW, h: SH, fill: st.gapColor });
  rects.forEach((r, i) => {
    const c = st.cells[i];
    if (c?.image) {
      ops.push({
        t: 'group',
        clip: r,
        ops: [
          { t: 'rect', x: r.x, y: r.y, w: r.width, h: r.height, fill: bgPaint(st.bg, r) },
          { t: 'image', img: c.image, x: r.x, y: r.y, w: r.width, h: r.height, place: c.place },
        ],
      });
    } else {
      if (st.gap > 0)
        ops.push({ t: 'rect', x: r.x, y: r.y, w: r.width, h: r.height, fill: bgPaint(st.bg, r) });
      if (env.edit) {
        ops.push({
          t: 'rect',
          x: r.x + 0.5,
          y: r.y + 0.5,
          w: r.width - 1,
          h: r.height - 1,
          fill: 'rgba(255,255,255,0.08)',
          stroke: { color: 'rgba(255,255,255,0.45)', width: 1, dash: [4, 3] },
        });
        const tf = ui(3.4 * U);
        const tl = 3.4 * U * 1.45;
        const block = 28 + U + tl;
        const top = r.y + (r.height - block) / 2;
        ops.push({
          t: 'icon',
          name: 'plus',
          x: r.x + r.width / 2 - 14,
          y: top,
          size: 28,
          color: 'rgba(255,255,255,0.85)',
        });
        ops.push({
          t: 'text',
          x: r.x + r.width / 2,
          y: top + 28 + U,
          lh: tl,
          text: S.screen.addPhoto,
          font: tf,
          color: 'rgba(255,255,255,0.85)',
          align: 'center',
        });
      }
    }
    hits.push({ key: `cell:${i}`, label: S.hits.cell(i + 1), box: r });
    parts[`cell${i}`] = r;
  });
  if (env.edit && n > 1 && opts.selectedCell != null && rects[opts.selectedCell]) {
    const r = rects[opts.selectedCell];
    ops.push({
      t: 'rect',
      x: r.x + 1,
      y: r.y + 1,
      w: r.width - 2,
      h: r.height - 2,
      stroke: { color: env.pal.accent, width: 2 },
    });
  }

  /* 貼紙 */
  const layouts = new Map<string, StickerLayout>();
  for (const k of st.stickers) {
    const l = layoutSticker(env, k);
    layouts.set(k.id, l);
    if (opts.hideStickers?.includes(k.id)) continue;
    ops.push({
      t: 'group',
      tx: (k.x / 100) * SW,
      ty: (k.y / 100) * SH,
      rot: k.rot,
      scale: k.scale,
      ops: l.ops,
    });
  }

  /* 上方 */
  const status = state.screen.status;
  if (status || st.showTop)
    ops.push({
      t: 'rect',
      x: 0,
      y: 0,
      w: SW,
      h: 26 * U,
      fill: {
        linear: {
          x0: 0,
          y0: 0,
          x1: 0,
          y1: 26 * U,
          stops: [
            [0, 'rgba(0,0,0,0.38)'],
            [1, 'rgba(0,0,0,0)'],
          ],
        },
      },
    });
  if (status) {
    const size = 4.3 * U * fs;
    const boxH = Math.max(size, 3.2 * U);
    const cy = 3.2 * U + boxH / 2;
    ops.push({
      t: 'text',
      x: 8.6 * U,
      y: cy - size / 2,
      lh: size,
      text: state.screen.clock,
      font: ui(size, 600),
      color: '#ffffff',
    });
    if (state.screen.icons)
      ops.push(...statusIcons(SW - 6.5 * U, cy, '#ffffff', state.screen.battery, (3.2 * U) / 12));
  }
  if (st.showTop) {
    const top = status ? 13.5 * U : 2.4 * U;
    const count = Math.max(1, Math.min(12, st.count));
    const cur = Math.max(1, Math.min(count, st.current));
    const x0 = 2.2 * U;
    const gap = U;
    const segW = (SW - x0 * 2 - gap * (count - 1)) / count;
    const bh = 0.65 * U;
    for (let i = 0; i < count; i++) {
      const x = x0 + i * (segW + gap);
      ops.push({
        t: 'rect',
        x,
        y: top,
        w: segW,
        h: bh,
        r: 0.4 * U,
        fill: 'rgba(255,255,255,0.35)',
      });
      const ratio =
        i + 1 < cur ? 1 : i + 1 === cur ? (opts.viewer?.autoplay ? 0 : st.progress / 100) : 0;
      if (ratio > 0)
        ops.push({ t: 'rect', x, y: top, w: segW * ratio, h: bh, r: 0.4 * U, fill: '#ffffff' });
      if (i + 1 === cur) parts.bar = { x, y: top, width: segW, height: bh };
    }
    /* 帳號列 */
    const ht = top + 2.6 * U;
    const av = 8.8 * U;
    const cy = ht + av / 2;
    const shadow = { color: 'rgba(0,0,0,0.2)', blur: 1.4 * U };
    ops.push(...avatar(pr.avatar, 3.4 * U + av / 2, cy, av, env.pal));
    const close = { x: SW - 2.4 * U - 6.6 * U, y: cy - 3.3 * U, size: 6.6 * U };
    const more = { x: close.x - 2.4 * U - 6.6 * U, y: close.y, size: 6.6 * U };
    ops.push({
      t: 'icon',
      name: 'close',
      x: close.x,
      y: close.y,
      size: close.size,
      color: '#ffffff',
      shadow,
    });
    ops.push({
      t: 'icon',
      name: 'more',
      x: more.x,
      y: more.y,
      size: more.size,
      color: '#ffffff',
      shadow,
    });
    parts.close = {
      x: close.x - 6,
      y: close.y - 6,
      width: close.size + 12,
      height: close.size + 12,
    };
    const tsize = 3.9 * U * fs;
    const uf = ui(tsize, 600);
    const tf = ui(tsize);
    const tl = tsize * 1.3;
    let x = 3.4 * U + av + 2.4 * U;
    const room = more.x - 2.4 * U - x;
    const timeW = st.time ? measure(st.time, tf) + 2.4 * U : 0;
    const badgeW = pr.verified ? 13 + 1.2 * U : 0;
    const name = ellipsize(pr.username, Math.max(20, room - timeW - badgeW), uf, measure);
    ops.push({
      t: 'text',
      x,
      y: cy - tl / 2,
      lh: tl,
      text: name,
      font: uf,
      color: '#ffffff',
      shadow,
    });
    x += measure(name, uf);
    if (pr.verified) {
      x += 1.2 * U;
      ops.push({ t: 'circle', cx: x + 6.5, cy, r: 6.5, fill: env.pal.accent });
      ops.push({ t: 'icon', name: 'check', x, y: cy - 6.5, size: 13, color: '#ffffff', sw: 3 });
      x += 13;
    }
    if (st.time) {
      x += 2.4 * U;
      ops.push({
        t: 'text',
        x,
        y: cy - tl / 2,
        lh: tl,
        text: ellipsize(st.time, Math.max(10, more.x - 2.4 * U - x), tf, measure),
        font: tf,
        color: 'rgba(255,255,255,0.75)',
        shadow,
      });
    }
  }

  /* 下方 */
  if (st.bottom !== 'none') {
    ops.push({
      t: 'rect',
      x: 0,
      y: SH - 30 * U,
      w: SW,
      h: 30 * U,
      fill: {
        linear: {
          x0: 0,
          y0: SH - 30 * U,
          x1: 0,
          y1: SH,
          stops: [
            [0, 'rgba(0,0,0,0)'],
            [1, 'rgba(0,0,0,0.32)'],
          ],
        },
      },
    });
    const x0 = 3.4 * U;
    const x1 = SW - 3.4 * U;
    if (st.bottom === 'reply') {
      const ih = 12 * U;
      const cy = SH - 3 * U - ih / 2;
      const ic = 7 * U;
      const g = 4.4 * U;
      const sendX = x1 - ic;
      const heartX = sendX - g - ic;
      const inputW = heartX - g - x0;
      ops.push({
        t: 'rect',
        x: x0 + 0.5,
        y: cy - ih / 2 + 0.5,
        w: inputW - 1,
        h: ih - 1,
        r: 6 * U,
        stroke: { color: 'rgba(255,255,255,0.7)', width: 1 },
      });
      const tsize = 3.9 * U * fs;
      const f = ui(tsize);
      ops.push({
        t: 'text',
        x: x0 + 4.6 * U,
        y: cy - tsize * 0.7,
        lh: tsize * 1.4,
        text: ellipsize(S.screen.sendMessage, inputW - 9.2 * U, f, measure),
        font: f,
        color: '#ffffff',
      });
      ops.push({ t: 'icon', name: 'heart', x: heartX, y: cy - ic / 2, size: ic, color: '#ffffff' });
      ops.push({ t: 'icon', name: 'send', x: sendX, y: cy - ic / 2, size: ic, color: '#ffffff' });
    } else {
      const items = [
        ['heart', S.screen.ownHighlight],
        ['send', S.screen.ownSend],
        ['more', S.screen.ownMore],
      ] as const;
      const isz = 6.4 * U;
      const lsize = 2.9 * U * fs;
      const lf = ui(lsize);
      const itemH = isz + 0.8 * U + lsize * 1.3;
      const rowH = Math.max(7 * U, itemH);
      const cy = SH - 3 * U - rowH / 2;
      const vr = 3.5 * U;
      for (let i = 0; i < 3; i++) {
        const cx = x0 + vr + i * (7 * U - 2.2 * U);
        ops.push({ t: 'circle', cx, cy, r: vr, fill: '#000000' });
        ops.push(...avatar(null, cx, cy, 7 * U - U, env.pal));
      }
      const lx = x0 + 7 * U + 2 * (7 * U - 2.2 * U) + 3.4 * U;
      const af = ui(3.6 * U * fs, 600);
      ops.push({
        t: 'text',
        x: lx,
        y: cy - 3.6 * U * fs * 0.7,
        lh: 3.6 * U * fs * 1.4,
        text: S.screen.activity,
        font: af,
        color: '#ffffff',
      });
      items.forEach(([icon, label], i) => {
        const iw = 14 * U;
        const ix = x1 - (3 - i) * iw - (2 - i) * 2 * U;
        const top = cy - itemH / 2;
        ops.push({
          t: 'icon',
          name: icon,
          x: ix + iw / 2 - isz / 2,
          y: top,
          size: isz,
          color: '#ffffff',
        });
        ops.push({
          t: 'text',
          x: ix + iw / 2,
          y: top + isz + 0.8 * U,
          lh: lsize * 1.3,
          text: label,
          font: lf,
          color: '#ffffff',
          align: 'center',
        });
      });
    }
  }
  return { width: SW, height: SH, background: '#000000', ops, hits, parts, stickers: layouts };
}
