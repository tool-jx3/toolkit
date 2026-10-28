/**
 * 首頁動態（規格 3.11）：狀態列 → 上方列（字、⌄、通知、訊息）→ 限時動態列（我的、朋友的；同一個帳號合成一個圈）→
 * 貼文（照貼文清單的順序，只放「在首頁動態顯示」的）→ 底部分頁列（首頁是實心的）。
 * 預覽與 PNG 是 390 × 844（放不下的貼文裁掉、限時動態列超出畫面的裁掉）；HTML（viewer）依內容加高、限時動態列可以橫向捲動。
 */
import { friendGroups, myStoryList, type Owner, type Post, type Story } from '../model';
import { S } from '../strings';
import { ellipsize } from '../text';
import { avatar, type Env, NAV_H, navBar, PHONE_H, STATUS_H, statusBar, W } from './common';
import type { Hit, Op, Rect, ScreenLayout } from './ops';
import { layoutPost, type PostLayout } from './post';
import { INHERIT_LH, RING_STOPS, ui } from './theme';

/** 上方列的高 */
export const FEED_TOP_H = 50;
/** 左上角的字的字型（本站自己挑的手寫英文字型；D24） */
export const LOGO_FAMILY = 'Caveat';
/** 限時動態列：每一項的寬、間隔、左右與上下的內距、圈的直徑 */
const ITEM_W = 74;
const ITEM_GAP = 14;
const TRAY_PAD_X = 12;
const TRAY_PAD_T = 6;
const TRAY_PAD_B = 12;
const CIRCLE = 70;
/** 貼文之間 */
const POST_GAP = 8;

export type RingState = 'new' | 'seen' | 'none';

/** 限時動態列的一項 */
export interface TrayItem {
  /** 點了接著看的限時動態（id，照順序） */
  stories: string[];
  box: Rect;
}

export interface TrayLayout {
  ops: Op[];
  height: number;
  /** 所有項目排開的寬（超過 390 時 HTML 可以橫向捲動） */
  contentWidth: number;
  items: TrayItem[];
}

/** 一個圈（左上角 x、y；70 × 70）：new＝漸層外圈、seen＝灰色細框、none＝沒有框（大頭貼大一點，＋號） */
function circle(env: Env, x: number, y: number, owner: Owner | null, ring: RingState): Op[] {
  const { pal } = env;
  const img = owner ? owner.avatar : env.state.profile.avatar;
  const cx = x + CIRCLE / 2;
  const cy = y + CIRCLE / 2;
  const R = CIRCLE / 2;
  const ops: Op[] = [];
  if (ring === 'new') {
    ops.push({
      t: 'circle',
      cx,
      cy,
      r: R,
      fill: { linear: { x0: cx - R, y0: cy + R, x1: cx + R, y1: cy - R, stops: RING_STOPS } },
    });
    ops.push({ t: 'circle', cx, cy, r: R - 3, fill: pal.bg });
    ops.push(...avatar(img, cx, cy, CIRCLE - 12, pal));
  } else if (ring === 'seen') {
    ops.push({ t: 'circle', cx, cy, r: R, fill: pal.line });
    ops.push({ t: 'circle', cx, cy, r: R - 2, fill: pal.bg });
    ops.push(...avatar(img, cx, cy, CIRCLE - 12, pal));
  } else {
    ops.push(...avatar(img, cx, cy, CIRCLE - 6, pal));
    /* 右下角的＋（22，白框 3） */
    const px = x + CIRCLE - 11;
    const py = y + CIRCLE - 11;
    ops.push({ t: 'circle', cx: px, cy: py, r: 11, fill: pal.bg });
    ops.push({ t: 'circle', cx: px, cy: py, r: 8, fill: pal.accent });
    ops.push({
      t: 'icon',
      name: 'plus',
      x: px - 6,
      y: py - 6,
      size: 12,
      color: '#ffffff',
      sw: 2.8,
    });
  }
  return ops;
}

const ringOf = (list: readonly Story[]): RingState =>
  !list.length ? 'none' : list.every((s) => s.seen) ? 'seen' : 'new';

/** 限時動態列（從 y0 開始；不裁切） */
export function layoutTray(env: Env, y0: number): TrayLayout {
  const { pal, fs, measure, state } = env;
  const ops: Op[] = [];
  const items: TrayItem[] = [];
  const lf = ui(12 * fs);
  const llh = 12 * fs * INHERIT_LH;
  const height = TRAY_PAD_T + CIRCLE + 5 + llh + TRAY_PAD_B;
  const entries: { owner: Owner | null; label: string; list: Story[] }[] = [
    { owner: null, label: S.screen.myStory, list: myStoryList(state) },
    ...friendGroups(state).map((g) => ({
      owner: g.owner,
      label: g.owner.username || 'friend',
      list: g.stories,
    })),
  ];
  entries.forEach((e, i) => {
    const x = TRAY_PAD_X + i * (ITEM_W + ITEM_GAP);
    const top = y0 + TRAY_PAD_T;
    ops.push(...circle(env, x + (ITEM_W - CIRCLE) / 2, top, e.owner, ringOf(e.list)));
    ops.push({
      t: 'text',
      x: x + ITEM_W / 2,
      y: top + CIRCLE + 5,
      lh: llh,
      text: ellipsize(e.label, ITEM_W, lf, measure),
      font: lf,
      color: pal.ink,
      align: 'center',
    });
    if (e.list.length)
      items.push({
        stories: e.list.map((s) => s.id),
        box: { x, y: top, width: ITEM_W, height: CIRCLE + 5 + llh },
      });
  });
  const contentWidth = TRAY_PAD_X * 2 + entries.length * ITEM_W + (entries.length - 1) * ITEM_GAP;
  return { ops, height, contentWidth, items };
}

export interface FeedOptions {
  /** HTML：依內容加高（貼文全部畫）、底部分頁列接在最後；沒有照片的貼文是灰底 */
  viewer?: boolean;
}

export interface FeedLayout extends ScreenLayout {
  tray: TrayLayout & { top: number };
  /** 首頁動態裡的貼文（index＝在貼文清單的第幾則；top＝貼文的上緣） */
  posts: { index: number; post: Post; top: number; layout: PostLayout }[];
}

/** 上方列：左邊的字＋⌄、右邊的通知（紅點）與訊息（未讀數） */
function topBar(env: Env, y: number): { ops: Op[]; dm: Rect } {
  const { pal, fs, measure, state } = env;
  const f = state.feed;
  const ops: Op[] = [];
  const cy = y + FEED_TOP_H / 2;
  const size = 30 * fs;
  const lf = { family: LOGO_FAMILY, weight: 700, size };
  const dmX = W - 14 - 26;
  const heartX = dmX - 20 - 26;
  const logo = ellipsize(f.logo, heartX - 20 - 16 - 16, lf, measure);
  /* 字的框（行高 1，上方多 4）垂直置中 */
  const ly = cy - (size + 4) / 2 + 4;
  if (logo) ops.push({ t: 'text', x: 16, y: ly, lh: size, text: logo, font: lf, color: pal.ink });
  const cx = 16 + (logo ? measure(logo, lf) : 0) + 4;
  ops.push({ t: 'icon', name: 'chevronDown', x: cx, y: cy - 6, size: 12, color: pal.ink, sw: 2.6 });
  const iy = cy - 13;
  ops.push({ t: 'icon', name: 'heart', x: heartX, y: iy, size: 26, color: pal.ink });
  if (f.heartDot) {
    /* 紅點（8，含 1.5 的底色框；右上角） */
    ops.push({ t: 'circle', cx: heartX + 26 + 1 - 4, cy: iy + 4, r: 4, fill: pal.bg });
    ops.push({ t: 'circle', cx: heartX + 26 + 1 - 4, cy: iy + 4, r: 2.5, fill: pal.red });
  }
  ops.push({ t: 'icon', name: 'send', x: dmX, y: iy, size: 26, color: pal.ink });
  if (f.dmBadge) {
    /* 未讀數：高 18（＋1.5 的底色框）、左右 5、紅底白字 11／700；右上角超出圖示 */
    const bf = ui(11, 700);
    const w = Math.max(18, measure(f.dmBadge, bf) + 10) + 3;
    const h = 21;
    const bx = dmX + 26 + 9 - w;
    const by = iy - 6;
    ops.push({ t: 'rect', x: bx, y: by, w, h, r: h / 2, fill: pal.bg });
    ops.push({ t: 'rect', x: bx + 1.5, y: by + 1.5, w: w - 3, h: 18, r: 9, fill: pal.red });
    ops.push({
      t: 'text',
      x: bx + w / 2,
      y: by + 1.5,
      lh: 18,
      text: f.dmBadge,
      font: bf,
      color: '#ffffff',
      align: 'center',
    });
  }
  return { ops, dm: { x: dmX - 6, y: iy - 6, width: 38, height: 38 } };
}

export function feedScreen(env: Env, opts: FeedOptions = {}): FeedLayout {
  const { pal, fs, state } = env;
  const ops: Op[] = [];
  const hits: Hit[] = [];
  const parts: Record<string, Rect> = {};
  let y = 0;
  if (state.screen.status) {
    ops.push(...statusBar(env, 0, pal.ink));
    y = STATUS_H;
  }
  parts.status = { x: 0, y: 0, width: W, height: y };
  const top = topBar(env, y);
  ops.push(...top.ops);
  hits.push({ key: 'feed:dm', label: S.hits.feedDm, box: top.dm });
  parts.top = { x: 0, y, width: W, height: FEED_TOP_H };
  y += FEED_TOP_H;

  /* 限時動態列（超出畫面的裁掉；HTML 另外畫成可以橫向捲動的一張） */
  const tray = layoutTray(env, y);
  ops.push({ t: 'group', clip: { x: 0, y, width: W, height: tray.height }, ops: tray.ops });
  tray.items.forEach((it) => {
    if (it.box.x < W)
      hits.push({
        key: `tray:${it.stories.join(',')}`,
        label: S.hits.tray(it.stories.length),
        box: { ...it.box, width: Math.min(it.box.width, W - it.box.x) },
      });
  });
  parts.tray = { x: 0, y, width: W, height: tray.height };
  const trayTop = y;
  y += tray.height;
  ops.push({ t: 'rect', x: 0, y, w: W, h: 0.5, fill: pal.line });
  y += 0.5;

  /* 貼文 */
  const postsTop = y;
  const list: Op[] = [];
  const posts: FeedLayout['posts'] = [];
  state.posts.forEach((p, index) => {
    if (!p.inFeed) return;
    if (posts.length) y += POST_GAP;
    const l = layoutPost(env, p, y, { viewer: opts.viewer });
    list.push(...l.ops);
    posts.push({ index, post: p, top: y, layout: l });
    y += l.height;
  });
  if (!posts.length) {
    const lh = 14 * fs * INHERIT_LH;
    list.push({
      t: 'text',
      x: W / 2,
      y: y + 60,
      lh,
      text: S.screen.feedEmpty,
      font: ui(14 * fs),
      color: pal.sec,
      align: 'center',
    });
    y += 60 + lh + 60;
  }
  const phone = !opts.viewer;
  const height = phone ? PHONE_H : y + NAV_H;
  const navTop = phone ? PHONE_H - NAV_H : y;
  ops.push({
    t: 'group',
    clip: { x: 0, y: postsTop, width: W, height: Math.max(0, navTop - postsTop) },
    ops: list,
  });
  parts.posts = { x: 0, y: postsTop, width: W, height: Math.max(0, navTop - postsTop) };
  const nav = navBar(env, navTop, 'feed');
  ops.push(...nav.ops);
  hits.push(...nav.hits);
  parts.nav = { x: 0, y: navTop, width: W, height: NAV_H };
  return {
    width: W,
    height,
    background: pal.bg,
    ops,
    hits,
    parts,
    tray: { ...tray, top: trayTop },
    posts,
  };
}
