/**
 * 貼文（規格 3.4）：帳號列 → 照片框（輪播膠囊）→（新式）圓點列 → 按鈕列 → 內文。畫面單位、寬 390。
 */
import { type Post, RATIO_VALUE } from '../model';
import { S } from '../strings';
import {
  collapseCaption,
  ellipsize,
  type FontSpec,
  layoutLines,
  linkTokens,
  type Run,
} from '../text';
import {
  avatar,
  badgeRun,
  type Env,
  linesToOps,
  STATUS_H,
  statusBar,
  W,
  withAlpha,
} from './common';
import type { Hit, Op, Rect, ScreenLayout } from './ops';
import { INHERIT_LH, ui } from './theme';

export interface PostOptions {
  /** 換成第幾張照片（HTML 的輪播用；不給＝post.current） */
  current?: number;
  /** HTML：沒有照片時照片框只是灰底（同原作） */
  viewer?: boolean;
}

export interface PostLayout {
  ops: Op[];
  hits: Hit[];
  height: number;
  parts: {
    header: Rect;
    media: Rect;
    /** 換照片時會變的範圍：照片框＋圓點（新式在照片下面、舊式在按鈕列中間） */
    carousel: Rect;
    actions: Rect;
    body: Rect;
    /** 留言圖示（HTML 打開留言面板） */
    comment: Rect | null;
  };
}

const PAD = 12;

/** 圓點（最多 5 個；目前那張是主色） */
function dots(env: Env, cx: number, cy: number, n: number, idx: number): Op[] {
  const k = Math.min(5, n);
  const total = k * 6 + (k - 1) * 4;
  const ops: Op[] = [];
  for (let i = 0; i < k; i++) {
    const on = i === Math.min(idx, 4);
    ops.push({
      t: 'circle',
      cx: cx - total / 2 + 3 + i * 10,
      cy,
      r: 3,
      fill: on ? env.pal.accent : withAlpha(env.pal.sec, 0.45),
    });
  }
  return ops;
}

/** 一則貼文（不含狀態列），從 y 開始 */
export function layoutPost(env: Env, post: Post, y0: number, opts: PostOptions = {}): PostLayout {
  const { pal, fs, measure } = env;
  const pr = env.state.profile;
  const ops: Op[] = [];
  const hits: Hit[] = [];
  const photos = post.photos;
  const n = photos.length;
  const idx = Math.max(0, Math.min(opts.current ?? post.current, Math.max(0, n - 1)));
  const inline = post.countStyle === 'inline';

  /* ---- 帳號列（高 56） ---- */
  const avD = pr.ring ? 36 : 32;
  const cy = y0 + 28;
  ops.push(...avatar(pr.avatar, PAD + avD / 2, cy, 32, pal, pr.ring));
  const moreX = W - PAD - 24;
  ops.push({ t: 'icon', name: 'more', x: moreX, y: cy - 12, size: 24, color: pal.ink });
  let metaRight = moreX - 10;
  if (post.follow) {
    const f = ui(14 * fs, 600);
    const bw = measure(S.screen.follow, f) + 24;
    const bx = moreX - 10 - bw;
    ops.push({ t: 'rect', x: bx, y: cy - 16, w: bw, h: 32, r: 8, fill: pal.btn });
    ops.push({
      t: 'text',
      x: bx + bw / 2,
      y: cy - 16,
      lh: 32,
      text: S.screen.follow,
      font: f,
      color: pal.ink,
      align: 'center',
    });
    metaRight = bx - 10;
  }
  const metaX = PAD + avD + 10;
  const metaW = Math.max(20, metaRight - metaX);
  const userFont = ui(14 * fs, 600);
  const userLh = 17.5 * fs;
  const subLh = 15 * fs;
  const metaH = userLh + (post.location ? subLh : 0);
  const metaTop = y0 + (56 - metaH) / 2;
  {
    const collab = post.collab ? `${S.screen.collabJoin}${post.collab}` : '';
    const badgeW = pr.verified ? 18 : 0;
    const collabW = collab ? measure(collab, userFont) : 0;
    /* 帳號與共同貼文都放不下時兩邊都省略：帳號至少留一半的寬度（同原作兩段都可以省略） */
    const nameW = measure(pr.username, userFont);
    const userW = Math.max(16, metaW - badgeW - collabW, Math.min(nameW, (metaW - badgeW) / 2));
    const name = ellipsize(pr.username, userW, userFont, measure);
    const runs: Run[] = [{ text: name, font: userFont, color: pal.ink }];
    if (pr.verified) runs.push(badgeRun(userFont, 14));
    if (collab) {
      const room = metaW - measure(name, userFont) - badgeW;
      runs.push({
        text: ellipsize(collab, Math.max(16, room), userFont, measure),
        font: userFont,
        color: pal.ink,
      });
    }
    const lines = layoutLines(runs, 10_000, measure);
    ops.push(...linesToOps(lines.slice(0, 1), metaX, metaTop, userLh, pal));
    if (post.location) {
      const sf = ui(12 * fs);
      ops.push({
        t: 'text',
        x: metaX,
        y: metaTop + userLh,
        lh: subLh,
        text: ellipsize(post.location, metaW, sf, measure),
        font: sf,
        color: pal.ink,
      });
    }
  }
  const header: Rect = { x: 0, y: y0, width: W, height: 56 };

  /* ---- 照片框 ---- */
  const mediaTop = y0 + 56;
  const mediaH = W / RATIO_VALUE[post.ratio];
  const media: Rect = { x: 0, y: mediaTop, width: W, height: mediaH };
  const cur = photos[idx];
  if (cur) {
    ops.push({
      t: 'group',
      clip: media,
      ops: [
        { t: 'rect', x: 0, y: mediaTop, w: W, h: mediaH, fill: pal.ph },
        {
          t: 'image',
          img: cur.image,
          x: 0,
          y: mediaTop,
          w: W,
          h: mediaH,
          place: cur.place,
          fallback: pal.ph,
        },
      ],
    });
  } else {
    ops.push({ t: 'rect', x: 0, y: mediaTop, w: W, h: mediaH, fill: pal.ph });
    if (!opts.viewer) {
      const tf = ui(13 * fs);
      const th = 13 * fs * INHERIT_LH;
      const block = 28 + 8 + th;
      const top = mediaTop + (mediaH - block) / 2;
      ops.push({
        t: 'icon',
        name: 'camera',
        x: W / 2 - 14,
        y: top,
        size: 28,
        color: pal.sec,
        sw: 1.6,
      });
      ops.push({
        t: 'text',
        x: W / 2,
        y: top + 36,
        lh: th,
        text: S.screen.addPhoto,
        font: tf,
        color: pal.sec,
        align: 'center',
      });
    }
  }
  if (n > 1) {
    const f = ui(12 * fs, 600);
    const label = `${idx + 1}/${n}`;
    const plh = 12 * fs * INHERIT_LH;
    const h = plh + 6;
    const w = measure(label, f) + 18;
    const x = W - 14 - w;
    const y = mediaTop + 14;
    ops.push({ t: 'rect', x, y, w, h, r: Math.min(13, h / 2), fill: 'rgba(18,18,18,0.7)' });
    ops.push({
      t: 'text',
      x: x + w / 2,
      y: y + 3,
      lh: plh,
      text: label,
      font: f,
      color: '#ffffff',
      align: 'center',
    });
  }
  hits.push({ key: 'media', label: S.hits.media, box: media });

  /* ---- 圓點列（新式） ---- */
  let y = mediaTop + mediaH;
  if (inline && n > 1) {
    ops.push(...dots(env, W / 2, y + 15, n, idx));
    y += 18;
  }

  /* ---- 按鈕列（高 46） ---- */
  const actTop = y;
  const acy = actTop + 23;
  const numFont = ui(14 * fs, 600);
  let x = PAD;
  let comment: Rect | null = null;
  const item = (icon: Op, count: string): Rect => {
    const start = x;
    ops.push(icon);
    x += 24;
    if (inline && count) {
      x += 5;
      ops.push({
        t: 'text',
        x,
        y: acy - 9 * fs,
        lh: 18 * fs,
        text: count,
        font: numFont,
        color: pal.ink,
      });
      x += measure(count, numFont);
    }
    const box = { x: start - 4, y: actTop, width: x - start + 8, height: 46 };
    x += 14;
    return box;
  };
  item(
    post.liked
      ? { t: 'icon', name: 'heart', x, y: acy - 12, size: 24, color: pal.red, fill: pal.red }
      : { t: 'icon', name: 'heart', x, y: acy - 12, size: 24, color: pal.ink },
    post.likes,
  );
  if (!post.commentsOff) {
    comment = item(
      { t: 'icon', name: 'comment', x, y: acy - 12, size: 24, color: pal.ink },
      post.comments,
    );
  }
  if (post.showRepost)
    item({ t: 'icon', name: 'repost', x, y: acy - 12, size: 24, color: pal.ink }, post.reposts);
  if (post.showShare)
    item({ t: 'icon', name: 'send', x, y: acy - 12, size: 24, color: pal.ink }, post.shares);
  ops.push(
    post.saved
      ? {
          t: 'icon',
          name: 'bookmark',
          x: W - PAD - 24,
          y: acy - 12,
          size: 24,
          color: pal.ink,
          fill: pal.ink,
        }
      : { t: 'icon', name: 'bookmark', x: W - PAD - 24, y: acy - 12, size: 24, color: pal.ink },
  );
  if (!inline && n > 1) ops.push(...dots(env, W / 2, acy, n, idx));
  if (comment) hits.push({ key: 'open-comments', label: S.hits.openComments, box: comment });
  const actions: Rect = { x: 0, y: actTop, width: W, height: 46 };
  y = actTop + 46;

  /* ---- 內文（左右 14、下 14；每一塊之間 5） ---- */
  const bodyTop = y;
  const bx = 14;
  const bw = W - 28;
  const lh = 18 * fs;
  const f = ui(14 * fs);
  const b = ui(14 * fs, 600);
  const blocks: ((top: number) => number)[] = [];
  if (post.likedBy) {
    blocks.push((top) => {
      const lines = layoutLines(
        [
          { text: post.likedBy, font: b, color: pal.ink },
          { text: S.screen.likedByAnd, font: f, color: pal.ink },
          { text: S.screen.likedByOthers, font: b, color: pal.ink },
          { text: S.screen.likedByTail, font: f, color: pal.ink },
        ],
        bw - 26,
        measure,
      );
      const h = Math.max(20, lines.length * lh);
      ops.push(...avatar(null, bx + 10, top + h / 2, 20, pal));
      ops.push(...linesToOps(lines, bx + 26, top + (h - lines.length * lh) / 2, lh, pal));
      return h;
    });
  } else if (!inline && post.likes) {
    blocks.push((top) => {
      const lines = layoutLines(
        [{ text: S.screen.likesLine(post.likes), font: b, color: pal.ink }],
        bw,
        measure,
      );
      ops.push(...linesToOps(lines, bx, top, lh, pal));
      return lines.length * lh;
    });
  }
  if (post.caption) {
    blocks.push((top) => {
      const cut = post.collapse
        ? collapseCaption(post.caption)
        : { text: post.caption, more: false };
      const runs: Run[] = [{ text: pr.username, font: b, color: pal.ink }];
      if (pr.verified) runs.push(badgeRun(b, 14));
      runs.push({ text: ' ', font: f, color: pal.ink });
      for (const t of linkTokens(cut.text))
        runs.push({ text: t.text, font: f, color: t.link ? pal.link : pal.ink });
      if (cut.more) runs.push({ text: S.screen.more, font: f, color: pal.sec });
      const lines = layoutLines(runs, bw, measure);
      ops.push(...linesToOps(lines, bx, top, lh, pal));
      return lines.length * lh;
    });
  }
  if (!inline && post.comments && !post.commentsOff) {
    blocks.push((top) => {
      const lines = layoutLines(
        [{ text: S.screen.viewAll(post.comments), font: f, color: pal.sec }],
        bw,
        measure,
      );
      ops.push(...linesToOps(lines, bx, top, lh, pal));
      const box = {
        x: bx,
        y: top,
        width: Math.max(...lines.map((l) => l.width)),
        height: lines.length * lh,
      };
      hits.push({ key: 'open-comments', label: S.hits.openComments, box });
      return lines.length * lh;
    });
  }
  if (post.time) {
    blocks.push((top) => {
      const tf: FontSpec = ui(12 * fs);
      const lines = layoutLines([{ text: post.time, font: tf, color: pal.sec }], bw, measure);
      ops.push(...linesToOps(lines, bx, top, lh, pal));
      return lines.length * lh;
    });
  }
  let by = bodyTop;
  blocks.forEach((fn, i) => {
    if (i) by += 5;
    by += fn(by);
  });
  by += 14;
  const body: Rect = { x: 0, y: bodyTop, width: W, height: by - bodyTop };
  const carousel: Rect = {
    x: 0,
    y: mediaTop,
    width: W,
    height: inline ? mediaH + (n > 1 ? 18 : 0) : actTop + 46 - mediaTop,
  };
  return {
    ops,
    hits,
    height: by - y0,
    parts: { header, media, carousel, actions, body, comment },
  };
}

/** 貼文畫面：狀態列＋貼文 */
export function postScreen(
  env: Env,
  post: Post,
  opts: PostOptions = {},
): ScreenLayout & { post: PostLayout } {
  const top = env.state.screen.status ? STATUS_H : 0;
  const ops: Op[] = [];
  if (env.state.screen.status) ops.push(...statusBar(env, 0, env.pal.ink));
  const p = layoutPost(env, post, top, opts);
  ops.push(...p.ops);
  const height = top + p.height;
  return {
    width: W,
    height,
    background: env.pal.bg,
    ops,
    hits: p.hits,
    parts: {
      status: { x: 0, y: 0, width: W, height: top },
      header: p.parts.header,
      media: p.parts.media,
      carousel: p.parts.carousel,
      actions: p.parts.actions,
      body: p.parts.body,
      ...(p.parts.comment ? { comment: p.parts.comment } : {}),
    },
    post: p,
  };
}
