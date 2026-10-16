/**
 * 個人頁（規格 3.6）：狀態列 → 上方列 → 大頭貼與數字 → 簡介 → 按鈕 → 精選動態 → 分頁列 → 貼文格狀 →（底部分頁列）。
 * 底部分頁列開著時畫面固定 390 × 844（格狀放不下的裁掉）；關掉時依內容加高。HTML（viewer）時依內容加高、底部分頁列接在最後。
 */
import { storyCover } from '../model';
import { S } from '../strings';
import { ellipsize, type FontSpec, layoutLines, linkTokens, type Run } from '../text';
import { avatar, type Env, linesToOps, PHONE_H, STATUS_H, statusBar, W } from './common';
import type { Hit, Op, Rect, ScreenLayout } from './ops';
import { ui } from './theme';

const PAD = 16;
export const NAV_H = 84;
export const GRID_GAP = 2;
export const GRID_CELL = (W - GRID_GAP * 2) / 3;

export interface ProfileOptions {
  /** HTML：依內容加高、底部分頁列接在最後 */
  viewer?: boolean;
}

/** 三個數字在寬度裡左右分散（space-between） */
function stats(env: Env, x: number, y: number, w: number): { ops: Op[]; height: number } {
  const { pal, fs, measure, state } = env;
  const a = state.account;
  const nf = ui(17 * fs, 700);
  const lf = ui(14 * fs);
  const nl = 17 * fs * 1.2;
  const ll = 14 * fs * 1.2;
  const cols = [
    [a.posts, S.screen.statPosts],
    [a.followers, S.screen.statFollowers],
    [a.following, S.screen.statFollowing],
  ] as const;
  const widths = cols.map(([n, l]) => Math.max(measure(n, nf), measure(l, lf)));
  const free = Math.max(0, w - widths.reduce((s, v) => s + v, 0));
  const ops: Op[] = [];
  let cx = x;
  cols.forEach(([n, l], i) => {
    ops.push({ t: 'text', x: cx, y, lh: nl, text: n, font: nf, color: pal.ink });
    ops.push({ t: 'text', x: cx, y: y + nl, lh: ll, text: l, font: lf, color: pal.ink });
    cx += widths[i] + free / 2;
  });
  return { ops, height: nl + ll };
}

export function profileScreen(env: Env, opts: ProfileOptions = {}): ScreenLayout {
  const { pal, fs, measure, state } = env;
  const a = state.account;
  const pr = state.profile;
  const ops: Op[] = [];
  const hits: Hit[] = [];
  const parts: Record<string, Rect> = {};
  let y = 0;
  if (state.screen.status) {
    ops.push(...statusBar(env, 0, pal.ink));
    y = STATUS_H;
  }
  parts.status = { x: 0, y: 0, width: W, height: y };

  /* ---- 上方列（高 44） ---- */
  {
    const cy = y + 22;
    const right: Op[] = [];
    let rx = W - PAD;
    const icons = a.own ? (['menu', 'plusSquare'] as const) : (['more'] as const);
    icons.forEach((name, i) => {
      if (i) rx -= 22;
      rx -= 24;
      right.push({ t: 'icon', name, x: rx, y: cy - 12, size: 24, color: pal.ink });
    });
    ops.push(...right);
    const room = rx - 6 - PAD;
    const f = ui(22 * fs, 700);
    let x = PAD;
    if (a.private) {
      ops.push({ t: 'icon', name: 'lock', x, y: cy - 9, size: 18, color: pal.ink });
      x += 18 + 4;
    }
    const extra = (a.own ? 14 + 4 : 0) + (pr.verified ? 18 + 4 : 0);
    const name = ellipsize(pr.username, Math.max(20, room - (x - PAD) - extra), f, measure);
    const lh = 22 * fs * 1.3;
    ops.push({ t: 'text', x, y: cy - lh / 2, lh, text: name, font: f, color: pal.ink });
    x += measure(name, f) + 4;
    if (a.own) {
      ops.push({ t: 'icon', name: 'chevronDown', x, y: cy - 7, size: 14, color: pal.ink, sw: 2.6 });
      x += 14 + 4;
    }
    if (pr.verified) {
      ops.push({ t: 'circle', cx: x + 9, cy, r: 9, fill: pal.accent });
      ops.push({ t: 'icon', name: 'check', x, y: cy - 9, size: 18, color: '#ffffff', sw: 3 });
    }
    y += 44;
  }

  /* ---- 大頭貼與數字 ---- */
  {
    const top = y + 10;
    const box = pr.ring ? 84 : 86;
    const rightX = PAD + box + 20;
    const rightW = W - PAD - rightX;
    /* 右邊的高：名稱（＋6）＋數字 */
    const nf = ui(15 * fs, 600);
    const nameLh = 15 * fs * 1.45;
    const nameH = pr.name ? nameLh + 6 : 0;
    const statH = 17 * fs * 1.2 + 14 * fs * 1.2;
    const rightH = nameH + statH;
    const rowH = Math.max(box, rightH);
    const acy = top + rowH / 2;
    ops.push(...avatar(pr.avatar, PAD + box / 2, acy, pr.ring ? 80 : 86, pal, pr.ring));
    if (a.own) {
      const px = PAD + box + 2 - 26;
      const py = top + (rowH - box) / 2 + box - 26;
      ops.push({ t: 'circle', cx: px + 13, cy: py + 13, r: 13, fill: pal.bg });
      ops.push({ t: 'circle', cx: px + 13, cy: py + 13, r: 10, fill: pal.ink });
      ops.push({ t: 'icon', name: 'plus', x: px + 6, y: py + 6, size: 14, color: pal.bg, sw: 3 });
    }
    let ry = top + (rowH - rightH) / 2;
    if (pr.name) {
      ops.push({
        t: 'text',
        x: rightX,
        y: ry,
        lh: nameLh,
        text: ellipsize(pr.name, rightW, nf, measure),
        font: nf,
        color: pal.ink,
      });
      ry += nameH;
    }
    const st = stats(env, rightX, ry, rightW - 8);
    ops.push(...st.ops);
    y = top + rowH;
    parts.row = { x: 0, y: top - 10, width: W, height: rowH + 10 };
  }

  /* ---- 簡介（上 10、左右 16；每一塊之間 2） ---- */
  {
    const top = y + 10;
    const bw = W - PAD * 2;
    const f = ui(14 * fs);
    const lh = 18 * fs;
    let by = top;
    let first = true;
    const block = (h: number) => {
      by += h;
      first = false;
    };
    const gapBefore = (g = 2) => {
      if (!first) by += g;
    };
    if (a.category) {
      gapBefore();
      const lines = layoutLines([{ text: a.category, font: f, color: pal.sec }], bw, measure);
      ops.push(...linesToOps(lines, PAD, by, lh, pal));
      block(lines.length * lh);
    }
    if (a.bio) {
      gapBefore();
      const runs: Run[] = linkTokens(a.bio).map((t) => ({
        text: t.text,
        font: f,
        color: t.link ? pal.link : pal.ink,
      }));
      const lines = layoutLines(runs, bw, measure);
      ops.push(...linesToOps(lines, PAD, by, lh, pal));
      block(lines.length * lh);
    }
    if (a.link) {
      gapBefore();
      const lf: FontSpec = ui(14 * fs, 600);
      ops.push({
        t: 'icon',
        name: 'link',
        x: PAD,
        y: by + lh / 2 - 7,
        size: 14,
        color: pal.link,
        sw: 2.4,
      });
      ops.push({
        t: 'text',
        x: PAD + 18,
        y: by,
        lh,
        text: ellipsize(a.link, bw - 18, lf, measure),
        font: lf,
        color: pal.link,
      });
      block(lh);
    }
    if (a.mutual) {
      gapBefore(8);
      const mf = ui(13 * fs);
      const mlh = 16 * fs;
      const lines = layoutLines([{ text: a.mutual, font: mf, color: pal.ink }], bw - 28, measure);
      const h = Math.max(20, lines.length * mlh);
      ops.push(...avatar(null, PAD + 10, by + h / 2, 20, pal));
      ops.push(...linesToOps(lines, PAD + 28, by + (h - lines.length * mlh) / 2, mlh, pal));
      block(h);
    }
    y = by;
    parts.bio = { x: 0, y: top - 10, width: W, height: by - top + 10 };
  }

  /* ---- 按鈕（上 14；高 34） ---- */
  {
    const top = y + 14;
    const f = ui(14 * fs, 600);
    const ico = 34;
    const bw = (W - PAD * 2 - ico - 12) / 2;
    const labels = a.own
      ? [S.screen.editProfile, S.screen.shareProfile]
      : [S.screen.followBtn, S.screen.message];
    labels.forEach((l, i) => {
      const x = PAD + i * (bw + 6);
      const blue = !a.own && i === 0;
      ops.push({ t: 'rect', x, y: top, w: bw, h: 34, r: 8, fill: blue ? pal.accent : pal.btn });
      ops.push({
        t: 'text',
        x: x + bw / 2,
        y: top,
        lh: 34,
        text: ellipsize(l, bw - 12, f, measure),
        font: f,
        color: blue ? '#ffffff' : pal.ink,
        align: 'center',
      });
    });
    const ix = W - PAD - ico;
    ops.push({ t: 'rect', x: ix, y: top, w: ico, h: 34, r: 8, fill: pal.btn });
    ops.push({
      t: 'icon',
      name: 'addUser',
      x: ix + 9,
      y: top + 9,
      size: 16,
      color: pal.ink,
      sw: 2.2,
    });
    y = top + 34;
    parts.buttons = { x: 0, y: top - 14, width: W, height: 48 };
  }

  /* ---- 精選動態（上 16） ---- */
  if (a.showHL) {
    const top = y + 16;
    const tf = ui(12 * fs);
    const tl = 12 * fs * 1.45;
    const items: Op[] = [];
    let x = PAD;
    a.highlights.forEach((h, i) => {
      const linked = h.story ? state.stories.find((s) => s.id === h.story) : undefined;
      const cover = h.image ?? (linked ? storyCover(linked) : null);
      items.push({
        t: 'circle',
        cx: x + 32,
        cy: top + 32,
        r: 31.5,
        stroke: { color: pal.line, width: 1 },
      });
      if (cover)
        items.push({
          t: 'image',
          img: cover,
          x: x + 4,
          y: top + 4,
          w: 56,
          h: 56,
          circle: true,
          fallback: pal.ph,
        });
      else items.push({ t: 'circle', cx: x + 32, cy: top + 32, r: 28, fill: pal.ph });
      items.push({
        t: 'text',
        x: x + 32,
        y: top + 64 + 6,
        lh: tl,
        text: ellipsize(h.title, 70, tf, measure),
        font: tf,
        color: pal.ink,
        align: 'center',
      });
      if (linked && x < W)
        hits.push({
          key: `story:${linked.id}`,
          label: S.hits.story(h.title || String(i + 1)),
          box: { x, y: top, width: 64, height: 64 + 6 + tl },
          circle: false,
        });
      x += 64 + 16;
    });
    if (a.own) {
      items.push({
        t: 'circle',
        cx: x + 32,
        cy: top + 32,
        r: 31.5,
        stroke: { color: pal.line, width: 1 },
      });
      items.push({
        t: 'icon',
        name: 'plus',
        x: x + 19,
        y: top + 19,
        size: 26,
        color: pal.ink,
        sw: 1.8,
      });
      items.push({
        t: 'text',
        x: x + 32,
        y: top + 70,
        lh: tl,
        text: S.screen.newHighlight,
        font: tf,
        color: pal.ink,
        align: 'center',
      });
    }
    const h = 64 + 6 + tl;
    ops.push({ t: 'group', clip: { x: 0, y: top, width: W, height: h }, ops: items });
    y = top + h;
    parts.highlights = { x: 0, y: top - 16, width: W, height: h + 16 };
  }

  /* ---- 分頁列（上 14；高 44＋下邊線） ---- */
  {
    const top = y + 14;
    const cw = W / 3;
    (['grid', 'play', 'tagged'] as const).forEach((name, i) => {
      ops.push({
        t: 'icon',
        name,
        x: cw * i + cw / 2 - 12,
        y: top + 10,
        size: 24,
        color: i === 0 ? pal.ink : pal.sec,
        sw: name === 'grid' ? 1.8 : 2,
      });
    });
    ops.push({ t: 'rect', x: 0, y: top + 44, w: W, h: 1, fill: pal.line });
    ops.push({ t: 'rect', x: 0, y: top + 44, w: cw, h: 1, fill: pal.ink });
    y = top + 45;
    parts.tabs = { x: 0, y: top - 14, width: W, height: 59 };
  }

  /* ---- 格狀 ---- */
  const gridTop = y;
  const cells: Op[] = [];
  let count = 0;
  const cellRect = (i: number): Rect => ({
    x: (i % 3) * (GRID_CELL + GRID_GAP),
    y: gridTop + Math.floor(i / 3) * (GRID_CELL + GRID_GAP),
    width: GRID_CELL,
    height: GRID_CELL,
  });
  state.posts.forEach((p, pi) => {
    const r = cellRect(count++);
    cells.push({ t: 'rect', x: r.x, y: r.y, w: r.width, h: r.height, fill: pal.ph });
    const first = p.photos[0];
    if (first)
      cells.push({
        t: 'image',
        img: first.image,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        place: p.thumb,
        fallback: pal.ph,
      });
    if (p.photos.length > 1)
      cells.push({
        t: 'icon',
        name: 'multi',
        x: r.x + r.width - 6 - 18,
        y: r.y + 6,
        size: 18,
        color: '#ffffff',
        fill: '#ffffff',
        shadow: { color: 'rgba(0,0,0,0.45)', blur: 2 },
      });
    hits.push({ key: `post:${p.id}`, label: S.hits.post(pi + 1), box: r });
  });
  for (const g of a.grid) {
    const r = cellRect(count++);
    cells.push({ t: 'rect', x: r.x, y: r.y, w: r.width, h: r.height, fill: pal.ph });
    cells.push({
      t: 'image',
      img: g.image,
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      fallback: pal.ph,
    });
  }
  const anyPhoto = state.posts.some((p) => p.photos.length) || a.grid.length > 0;
  if (!anyPhoto)
    while (count < a.placeholders) {
      const r = cellRect(count++);
      cells.push({ t: 'rect', x: r.x, y: r.y, w: r.width, h: r.height, fill: pal.ph });
    }
  const rows = Math.ceil(count / 3);
  const gridH = rows ? rows * GRID_CELL + (rows - 1) * GRID_GAP : 0;

  const phone = a.nav && !opts.viewer;
  const height = phone ? PHONE_H : gridTop + gridH + (a.nav ? NAV_H : 0);
  const gridBottom = phone ? PHONE_H - NAV_H : gridTop + gridH;
  ops.push({
    t: 'group',
    clip: { x: 0, y: gridTop, width: W, height: Math.max(0, gridBottom - gridTop) },
    ops: cells,
  });
  parts.grid = { x: 0, y: gridTop, width: W, height: Math.max(0, gridBottom - gridTop) };
  /* 裁掉的格子不能點 */
  for (const h of hits)
    if (h.key.startsWith('post:') && h.box.y >= gridBottom) h.box = { ...h.box, height: 0 };

  /* ---- 底部分頁列 ---- */
  if (a.nav) {
    const top = gridBottom;
    ops.push({ t: 'rect', x: 0, y: top, w: W, h: NAV_H, fill: pal.bg });
    ops.push({ t: 'rect', x: 0, y: top, w: W, h: 1, fill: pal.line });
    const slot = W / 5;
    const cy = top + 27;
    (['home', 'play', 'send', 'search'] as const).forEach((name, i) => {
      ops.push({ t: 'icon', name, x: slot * (i + 0.5) - 13, y: cy - 13, size: 26, color: pal.ink });
    });
    const ax = slot * 4.5;
    ops.push({ t: 'circle', cx: ax, cy, r: 13 + 3.5, fill: pal.ink });
    ops.push({ t: 'circle', cx: ax, cy, r: 13 + 2, fill: pal.bg });
    ops.push(...avatar(pr.avatar, ax, cy, 26, pal));
    parts.nav = { x: 0, y: top, width: W, height: NAV_H };
  }
  return {
    width: W,
    height,
    background: pal.bg,
    ops,
    hits: hits.filter((h) => h.box.height > 0),
    parts,
  };
}
