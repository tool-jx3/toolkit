/**
 * HTML 檔的畫面（規格 3.8、D6）：用與 PNG 相同的畫法把每個畫面畫成 2 倍的圖（有照片的 JPEG 0.92、其他 PNG），
 * 組成 ViewerDoc 交給 viewer.ts。「只有這個畫面」與「全部」的內容見 F89、F90。
 */
import { loadAssetBitmaps } from '@/core/assets';
import { safeFileName } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import type { ExportOutput } from '@/ui';
import { paintToCanvas } from './exporter';
import { loadFonts } from './fonts';
import { ownerOf, type Post, type SocialState } from './model';
import { layoutSheet } from './render/comments';
import { type Env, STATUS_H, W } from './render/common';
import { chatPieces, dmListScreen } from './render/dm';
import { feedScreen, layoutTray } from './render/feed';
import type { Hit, Op, Rect, ScreenLayout } from './render/ops';
import { createCanvasMeasure } from './render/paint';
import { layoutPost, pillOps, postScreen } from './render/post';
import { profileScreen } from './render/profile';
import { assetIdsOf, fontLoadsOf, makeEnv, type ScreenSelection } from './render/screens';
import { storyScreen, U } from './render/story';
import { ui } from './render/theme';
import { assets } from './store';
import { S, type ScreenId } from './strings';
import type { VCar, VComments, VImg, ViewerDoc, VLayer, VScreen, VSpot, VStory } from './viewer';
import { viewerHtml } from './viewer';

export type HtmlScope = 'one' | 'all';

/** HTML 裡的圖是幾倍 */
export const VIEWER_SCALE = 2;
const TOP_H = 44;

/** 「‹ 帳號／貼文」那一列（全部時貼文畫面的上方，固定在上面；帳號是貼文的帳號） */
function topBar(env: Env, username: string): ScreenLayout {
  const { pal } = env;
  const small = ui(12, 400);
  const big = ui(16, 700);
  const ops: Op[] = [
    { t: 'rect', x: 0, y: 0, w: W, h: TOP_H, fill: pal.bg },
    { t: 'icon', name: 'back', x: 10, y: 9, size: 26, color: pal.ink, sw: 2.2 },
    {
      t: 'text',
      x: W / 2,
      y: 5.2,
      lh: 14.4,
      text: username.toUpperCase(),
      font: small,
      color: pal.sec,
      align: 'center',
    },
    {
      t: 'text',
      x: W / 2,
      y: 19.6,
      lh: 19.2,
      text: S.screen.postsTitle,
      font: big,
      color: pal.ink,
      align: 'center',
    },
  ];
  return { width: W, height: TOP_H, background: pal.bg, ops, hits: [], parts: {} };
}

interface Piece {
  layout: ScreenLayout;
  part?: { y: number; height: number };
  photo: boolean;
  /** 透明的背景（面板上方的圓角、輪播的膠囊） */
  clear?: boolean;
}

/** 這次的匯出 */
interface Job {
  env: Env;
  /** 每畫一張圖加 1（進度；取消時丟出 AbortError） */
  tick: () => void;
  /** 這次的 HTML 有哪些畫面（連到不存在的畫面的按鈕不放） */
  screens: Set<string>;
}

async function toImg(job: Job, p: Piece): Promise<VImg> {
  const layout = p.clear ? { ...p.layout, background: 'rgba(0,0,0,0)' } : p.layout;
  const canvas = paintToCanvas(layout, VIEWER_SCALE, p.part);
  const blob = await canvasToBlob(
    canvas,
    p.photo ? 'image/jpeg' : 'image/png',
    p.photo ? 0.92 : undefined,
  );
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  job.tick();
  return { src, w: layout.width, h: p.part?.height ?? layout.height };
}

const rel = (r: Rect, top: number): Rect => ({ ...r, y: r.y - top });

/** 畫面的一段（y 起、高 height） */
const slice = (layout: ScreenLayout, y: number, height: number) => ({
  layout,
  part: { y, height },
});

/**
 * 一張圖最高幾個畫面單位（2 倍時 8,000 px）：Firefox／Safari 的畫布單邊上限 32,767 px、iOS 還有面積上限，
 * 會一直變長的地方（首頁動態的貼文、留言清單、對話的訊息）分段畫。
 */
export const MAX_PIECE_H = 4000;

/** 畫面的一段畫成幾張圖（每張不超過 MAX_PIECE_H，接起來就是原本那一段） */
async function pieces(
  job: Job,
  layout: ScreenLayout,
  y: number,
  height: number,
  photo: boolean,
): Promise<VImg[]> {
  const n = Math.max(1, Math.ceil(height / MAX_PIECE_H));
  const step = Math.ceil(height / n);
  const out: VImg[] = [];
  for (let i = 0; i < n; i++) {
    const top = y + i * step;
    const h = Math.min(step, y + height - top);
    if (h > 0) out.push(await toImg(job, { ...slice(layout, top, h), photo }));
  }
  return out;
}

/** 指令包成一個畫面（寬 width、高 height） */
function opsLayout(env: Env, ops: Op[], width: number, height: number): ScreenLayout {
  return { width, height, background: env.pal.bg, ops, hits: [], parts: {} };
}

/**
 * 一則貼文的輪播（兩張以上時；F91、F130）：每張照片、膠囊、圓點各畫一張。
 * top＝貼文在來源畫面的上緣、layerTop＝這一層的圖在來源畫面的上緣。
 */
async function carFor(job: Job, post: Post, top: number, layerTop: number): Promise<VCar | null> {
  const { env } = job;
  const n = post.photos.length;
  if (n < 2) return null;
  const at = (k: number) => {
    const l = layoutPost(env, post, top, { viewer: true, noPill: true, current: k });
    return { l, layout: opsLayout(env, l.ops, W, top + l.height) };
  };
  const base = at(post.current).l.parts;
  const media = base.media;
  const pills = Array.from({ length: n }, (_, k) =>
    pillOps(env, `${k + 1}/${n}`, W - 14, media.y + 14),
  );
  const pw = Math.max(...pills.map((p) => p.box.width));
  const ph = pills[0].box.height;
  const pillRect: Rect = { x: W - 14 - pw, y: media.y + 14, width: pw, height: ph };
  const photos: VImg[] = [];
  const dotsImgs: VImg[] = [];
  const pillImgs: VImg[] = [];
  for (let k = 0; k < n; k++) {
    const { l, layout } = at(k);
    photos.push(await toImg(job, { ...slice(layout, media.y, media.height), photo: true }));
    const d = l.parts.dots;
    if (d) dotsImgs.push(await toImg(job, { ...slice(layout, d.y, d.height), photo: false }));
    pillImgs.push(
      await toImg(job, {
        layout: {
          width: pw,
          height: ph,
          background: '',
          ops: [{ t: 'group', tx: -pillRect.x, ty: -pillRect.y, ops: pills[k].ops }],
          hits: [],
          parts: {},
        },
        photo: false,
        clear: true,
      }),
    );
  }
  return {
    rect: rel(media, layerTop),
    photos,
    pill: { rect: rel(pillRect, layerTop), imgs: pillImgs },
    dots: base.dots ? { rect: rel(base.dots, layerTop), imgs: dotsImgs } : null,
    index: Math.max(0, Math.min(post.current, n - 1)),
    label: S.viewer.carousel(n),
  };
}

/** 留言圖示（與舊式的「查看全部」）→ 打開留言面板 */
function commentSpots(post: Post, index: number, hits: readonly Hit[], top: number): VSpot[] {
  if (post.commentsOff) return [];
  return hits
    .filter((h) => h.key === 'open-comments')
    .map((h) => ({
      rect: rel(h.box, top),
      attr: `data-open="${index}"`,
      label: S.viewer.openComments,
    }));
}

/** 一則貼文的畫面（狀態列、（全部時）上方列、貼文＋輪播＋留言按鈕） */
async function postLayers(
  job: Job,
  post: Post,
  index: number,
  withTop: boolean,
): Promise<VLayer[]> {
  const { env } = job;
  const full = postScreen(env, post, { viewer: true, noPill: true });
  const statusH = env.state.screen.status ? STATUS_H : 0;
  const layers: VLayer[] = [];
  if (statusH) layers.push({ img: await toImg(job, { ...slice(full, 0, statusH), photo: false }) });
  if (withTop) {
    layers.push({
      img: await toImg(job, {
        layout: topBar(env, ownerOf(env.state, post).username),
        photo: false,
      }),
      sticky: 'top',
      spots: [
        { rect: { x: 0, y: 0, width: 52, height: TOP_H }, attr: 'data-back', label: S.viewer.back },
      ],
    });
  }
  const img = await toImg(job, {
    ...slice(full, statusH, full.height - statusH),
    photo: true,
  });
  const car = await carFor(job, post, statusH, statusH);
  layers.push({
    img,
    spots: commentSpots(post, index, full.hits, statusH),
    cars: car ? [car] : [],
  });
  return layers;
}

/** 留言面板（打開時是蓋在畫面上的面板；把手＋標題、清單、下方分開） */
async function commentsOverlay(
  job: Job,
  post: Post,
  index: number,
  opened: boolean,
): Promise<VComments> {
  const { env } = job;
  const sheet = layoutSheet(env, post, 0, { rounded: true });
  const layout: ScreenLayout = {
    width: W,
    height: sheet.height,
    background: env.pal.elev,
    ops: sheet.ops,
    hits: [],
    parts: {},
  };
  const { head, list, foot } = sheet.parts;
  return {
    id: `ov-c-${index}`,
    opened,
    head: await toImg(job, { ...slice(layout, head.y, head.height), photo: false, clear: true }),
    list: await pieces(job, layout, list.y, list.height, false),
    foot: foot ? await toImg(job, { ...slice(layout, foot.y, foot.height), photo: false }) : null,
    background: env.pal.elev,
    closeLabel: S.viewer.close,
  };
}

async function storyOverlay(
  job: Job,
  j: number,
  o: { opened: boolean; closable: boolean; auto: boolean },
): Promise<VStory> {
  const { env } = job;
  const st = env.state.stories[j];
  const l = storyScreen(env, st, { viewer: { autoplay: o.auto, closable: o.closable } });
  const img = await toImg(job, { layout: l, photo: true });
  const bars = o.auto && l.parts.bars ? l.parts.bars : null;
  const count = Math.max(1, Math.min(12, st.count));
  return {
    id: `ov-s-${j}`,
    ...o,
    img,
    bars: bars
      ? { rect: bars, count, current: Math.max(1, Math.min(count, st.current)), gap: U }
      : null,
    close: o.closable ? (l.parts.close ?? null) : null,
    closeLabel: S.viewer.close,
  };
}

/** 底部分頁列的按鈕：首頁 → 首頁動態、訊息 → 訊息列表、大頭貼 → 個人頁（這次的 HTML 有那個畫面、不是自己時） */
function navSpots(job: Job, hits: readonly Hit[], top: number, self: string): VSpot[] {
  const target: Record<string, [string, string]> = {
    'nav:feed': ['s-feed', S.viewer.toFeed],
    'nav:dm': ['s-dms', S.viewer.toDms],
    'nav:profile': ['s-account', S.viewer.toProfile],
  };
  const out: VSpot[] = [];
  for (const h of hits) {
    const t = target[h.key];
    if (!t || t[0] === self || !job.screens.has(t[0])) continue;
    out.push({ rect: rel(h.box, top), attr: `data-go="${t[0]}"`, label: t[1] });
  }
  return out;
}

/** 限時動態的 id → 第幾則（逗號分隔；HTML 的 data-story） */
const storyIndexes = (state: SocialState, ids: readonly string[]): string =>
  ids
    .map((id) => state.stories.findIndex((s) => s.id === id))
    .filter((i) => i >= 0)
    .join(',');

/** 個人頁（依內容加高；底部分頁列另外一張、固定在下面） */
async function profileLayers(job: Job, links: boolean): Promise<VLayer[]> {
  const { env } = job;
  const l = profileScreen(env, { viewer: true });
  const nav = l.parts.nav;
  const bodyH = nav ? nav.y : l.height;
  const spots: VSpot[] = [];
  if (links)
    for (const h of l.hits) {
      if (h.key.startsWith('post:')) {
        const i = env.state.posts.findIndex((p) => p.id === h.key.slice(5));
        if (i >= 0)
          spots.push({
            rect: h.box,
            attr: `data-go="s-post-${i}"`,
            label: S.viewer.openPost(i + 1),
          });
      } else if (h.key.startsWith('story:')) {
        const id = h.key.slice(6);
        const j = storyIndexes(env.state, [id]);
        const title = env.state.account.highlights.find((x) => x.story === id)?.title ?? '';
        if (j)
          spots.push({ rect: h.box, attr: `data-story="${j}"`, label: S.viewer.openStory(title) });
      }
    }
  const layers: VLayer[] = [
    { img: await toImg(job, { ...slice(l, 0, bodyH), photo: true }), spots },
  ];
  if (nav) {
    layers.push({
      img: await toImg(job, { ...slice(l, nav.y, nav.height), photo: false }),
      sticky: 'bottom',
      spots: navSpots(job, l.hits, nav.y, 's-account'),
    });
  }
  return layers;
}

/**
 * 首頁動態（依內容加高）：狀態列、上方列（訊息 → 訊息列表）、限時動態列（可以橫向捲動，點了接著看）、
 * 貼文（輪播、留言）、底部分頁列（固定在下面）。
 */
async function feedLayers(job: Job): Promise<VLayer[]> {
  const { env } = job;
  const l = feedScreen(env, { viewer: true });
  const layers: VLayer[] = [];
  const statusH = l.parts.status.height;
  if (statusH) layers.push({ img: await toImg(job, { ...slice(l, 0, statusH), photo: false }) });
  const top = l.parts.top;
  const dm = l.hits.find((h) => h.key === 'feed:dm');
  layers.push({
    img: await toImg(job, { ...slice(l, top.y, top.height), photo: false }),
    spots:
      dm && job.screens.has('s-dms')
        ? [{ rect: rel(dm.box, top.y), attr: 'data-go="s-dms"', label: S.viewer.toDms }]
        : [],
  });
  /* 限時動態列：整條畫成一張（比畫面寬時可以左右捲動，F128） */
  const tray = layoutTray(env, 0);
  layers.push({
    img: await toImg(job, {
      layout: opsLayout(env, tray.ops, Math.max(W, tray.contentWidth), tray.height),
      photo: true,
    }),
    view: W,
    spots: tray.items.flatMap((it) => {
      const j = storyIndexes(env.state, it.stories);
      return j
        ? [
            {
              rect: it.box,
              attr: `data-story="${j}"`,
              label: S.viewer.openStories(it.owner, it.stories.length),
            },
          ]
        : [];
    }),
  });
  /*
   * 貼文：一則一張（從上一則的下緣或限時動態列下面的線開始，含之間的 8），貼文多時也不會變成一張超高的圖；
   * 沒有貼文時是說明那一段。
   */
  const posts = l.parts.posts;
  let from = posts.y - 0.5;
  for (const fp of l.posts) {
    const to = fp.top + fp.layout.height;
    const car = await carFor(job, fp.post, fp.top, from);
    layers.push({
      img: await toImg(job, { ...slice(l, from, to - from), photo: true }),
      spots: commentSpots(fp.post, fp.index, fp.layout.hits, from),
      cars: car ? [car] : [],
    });
    from = to;
  }
  const end = posts.y + posts.height;
  if (end - from > 0.01)
    for (const img of await pieces(job, l, from, end - from, false)) layers.push({ img });
  const nav = l.parts.nav;
  layers.push({
    img: await toImg(job, { ...slice(l, nav.y, nav.height), photo: false }),
    sticky: 'bottom',
    spots: navSpots(job, l.hits, nav.y, 's-feed'),
  });
  return layers;
}

/** 訊息列表（依內容加高）：‹（有上一個畫面時）、每個對話 → 那個對話 */
async function dmListLayers(job: Job, withBack: boolean): Promise<VLayer[]> {
  const { env } = job;
  const l = dmListScreen(env, { viewer: true });
  const spots: VSpot[] = [];
  for (const h of l.hits) {
    if (h.key === 'dm:back' && withBack)
      spots.push({ rect: h.box, attr: 'data-back', label: S.viewer.back });
    else if (h.key.startsWith('thread:')) {
      const i = env.state.dm.threads.findIndex((t) => t.id === h.key.slice(7));
      if (i >= 0 && job.screens.has(`s-dm-${i}`))
        spots.push({ rect: h.box, attr: `data-go="s-dm-${i}"`, label: h.label });
    }
  }
  return [{ img: await toImg(job, { layout: l, photo: true }), spots }];
}

/** 對話：上方（‹）、訊息（可以捲動，打開時在最下面）、下方 */
async function dmChat(job: Job, i: number, withBack: boolean): Promise<VScreen['fill']> {
  const { env } = job;
  const p = chatPieces(env, env.state.dm.threads[i]);
  const back = p.head.hits.find((h) => h.key === 'dm:back');
  return {
    head: {
      img: await toImg(job, { layout: p.head, photo: true }),
      spots: back && withBack ? [{ rect: back.box, attr: 'data-back', label: S.viewer.back }] : [],
    },
    body: (await pieces(job, p.body, 0, p.body.height, true)).map((img) => ({ img })),
    foot: { img: await toImg(job, { layout: p.foot, photo: false }) },
    background: env.pal.bg,
  };
}

/** 這次要用到的所有版面（等字型與照片用） */
function allLayouts(env: Env): ScreenLayout[] {
  const out: ScreenLayout[] = [
    profileScreen(env, { viewer: true }),
    feedScreen(env, { viewer: true }),
  ];
  const tray = layoutTray(env, 0);
  out.push(opsLayout(env, tray.ops, Math.max(W, tray.contentWidth), tray.height));
  for (const p of env.state.posts) {
    out.push(postScreen(env, p, { viewer: true }));
    out.push(topBar(env, ownerOf(env.state, p).username));
    const s = layoutSheet(env, p, 0, { rounded: true });
    out.push({ width: W, height: s.height, background: '', ops: s.ops, hits: [], parts: {} });
  }
  for (const st of env.state.stories)
    out.push(storyScreen(env, st, { viewer: { autoplay: true, closable: true } }));
  out.push(dmListScreen(env, { viewer: true }));
  for (const t of env.state.dm.threads) {
    const p = chatPieces(env, t);
    out.push(p.head, p.body, p.foot);
  }
  return out;
}

export function htmlFileName(
  state: SocialState,
  screen: ScreenId,
  scope: HtmlScope,
  sel: ScreenSelection,
): string {
  const base = safeFileName(state.profile.username, { fallback: 'socialpost' });
  if (scope === 'all') return `${base}-all.html`;
  if (screen === 'profile') return `${base}-profile.html`;
  if (screen === 'feed') return `${base}-feed.html`;
  if (screen === 'dm') return `${base}-dm.html`;
  if (screen === 'story')
    return `${base}-story-${
      Math.max(
        0,
        state.stories.findIndex((s) => s.id === sel.storyId),
      ) + 1
    }.html`;
  const n =
    Math.max(
      0,
      state.posts.findIndex((p) => p.id === sel.postId),
    ) + 1;
  return `${base}-${screen}-${n}.html`;
}

export function htmlTitle(state: SocialState, screen: ScreenId, scope: HtmlScope): string {
  const u = state.profile.username;
  return scope === 'all' ? S.htmlTitle.all(u) : S.htmlTitle[screen](u);
}

/** 這次會畫幾張圖（進度用） */
function countImages(
  state: SocialState,
  screen: ScreenId,
  scope: HtmlScope,
  postIndex: number,
): number {
  const status = state.screen.status ? 1 : 0;
  const car = (p: Post) => (p.photos.length > 1 ? p.photos.length * 3 : 0);
  const post = (p: Post, top: boolean) => status + (top ? 1 : 0) + 1 + car(p);
  const comments = (p: Post) => (p.commentsOff ? 0 : 3);
  const profile = 1 + (state.account.nav ? 1 : 0);
  const inFeed = state.posts.filter((p) => p.inFeed);
  const feed = status + 3 + Math.max(1, inFeed.length) + inFeed.reduce((n, p) => n + car(p), 0);
  const stories = state.stories.length;
  const dm = 1 + state.dm.threads.length * 3;
  if (scope === 'all')
    return (
      feed +
      profile +
      state.posts.reduce((n, p) => n + post(p, true) + comments(p), 0) +
      stories +
      dm
    );
  const p = state.posts[postIndex];
  if (screen === 'feed') return feed + inFeed.reduce((n, x) => n + comments(x), 0) + stories;
  if (screen === 'post') return post(p, false) + comments(p);
  if (screen === 'comments') return post(p, false) + 3;
  if (screen === 'story') return 1;
  if (screen === 'dm') return dm;
  return profile;
}

export async function exportHtml(
  state: SocialState,
  screen: ScreenId,
  sel: ScreenSelection,
  scope: HtmlScope,
  {
    signal,
    onProgress,
  }: { signal?: AbortSignal; onProgress?: (ratio: number, label?: string) => void } = {},
): Promise<ExportOutput & { doc: ViewerDoc }> {
  /* 字型：先用暫時的量字收集用到的字，載好後用新的量字重排 */
  const env0 = makeEnv(state, createCanvasMeasure(), false);
  const first = allLayouts(env0);
  await loadFonts(fontLoadsOf(first.flatMap((l) => l.ops)));
  const env = makeEnv(state, createCanvasMeasure(), false);
  await loadAssetBitmaps(assets, assetIdsOf(allLayouts(env).flatMap((l) => l.ops)));

  const postIndex = Math.max(
    0,
    state.posts.findIndex((p) => p.id === sel.postId),
  );
  const total = Math.max(1, countImages(state, screen, scope, postIndex));
  let done = 0;
  const planned = new Set<string>();
  if (scope === 'all') {
    planned.add('s-feed');
    planned.add('s-account');
    state.posts.forEach((_, i) => {
      planned.add(`s-post-${i}`);
    });
  } else if (screen === 'feed') planned.add('s-feed');
  else if (screen === 'profile') planned.add('s-account');
  const threadIndex = Math.max(
    0,
    state.dm.threads.findIndex((t) => t.id === sel.threadId),
  );
  /* 私訊：全部、只有這個畫面的訊息列表時有訊息列表與每個對話；只有這個畫面的對話時只有那個對話 */
  const dmAll = scope === 'all' || (screen === 'dm' && sel.dmView !== 'chat');
  if (dmAll) {
    planned.add('s-dms');
    state.dm.threads.forEach((_, i) => {
      planned.add(`s-dm-${i}`);
    });
  } else if (screen === 'dm') planned.add(`s-dm-${threadIndex}`);
  const job: Job = {
    env,
    screens: planned,
    tick: () => {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      done++;
      onProgress?.(Math.min(0.98, done / total), S.exportingHtml(Math.min(done, total), total));
    },
  };

  const screens: VScreen[] = [];
  const comments: VComments[] = [];
  const stories: VStory[] = [];
  const post = state.posts[postIndex];
  const allStories = async () => {
    for (let j = 0; j < state.stories.length; j++)
      stories.push(await storyOverlay(job, j, { opened: false, closable: true, auto: true }));
  };
  if (scope === 'all') {
    screens.push({ id: 's-feed', hidden: false, layers: await feedLayers(job) });
    screens.push({ id: 's-account', hidden: true, layers: await profileLayers(job, true) });
    for (let i = 0; i < state.posts.length; i++) {
      const p = state.posts[i];
      screens.push({ id: `s-post-${i}`, hidden: true, layers: await postLayers(job, p, i, true) });
      if (!p.commentsOff) comments.push(await commentsOverlay(job, p, i, false));
    }
    await allStories();
    screens.push({ id: 's-dms', hidden: true, layers: await dmListLayers(job, true) });
    for (let i = 0; i < state.dm.threads.length; i++)
      screens.push({ id: `s-dm-${i}`, hidden: true, layers: [], fill: await dmChat(job, i, true) });
  } else if (screen === 'dm') {
    if (dmAll) {
      screens.push({ id: 's-dms', hidden: false, layers: await dmListLayers(job, false) });
      for (let i = 0; i < state.dm.threads.length; i++)
        screens.push({
          id: `s-dm-${i}`,
          hidden: true,
          layers: [],
          fill: await dmChat(job, i, true),
        });
    } else
      screens.push({
        id: `s-dm-${threadIndex}`,
        hidden: false,
        layers: [],
        fill: await dmChat(job, threadIndex, false),
      });
  } else if (screen === 'feed') {
    screens.push({ id: 's-feed', hidden: false, layers: await feedLayers(job) });
    for (let i = 0; i < state.posts.length; i++) {
      const p = state.posts[i];
      if (p.inFeed && !p.commentsOff) comments.push(await commentsOverlay(job, p, i, false));
    }
    await allStories();
  } else if (screen === 'post') {
    screens.push({
      id: `s-post-${postIndex}`,
      hidden: false,
      layers: await postLayers(job, post, postIndex, false),
    });
    if (!post.commentsOff) comments.push(await commentsOverlay(job, post, postIndex, false));
  } else if (screen === 'comments') {
    if (post.sheet.backdrop) {
      screens.push({
        id: `s-post-${postIndex}`,
        hidden: false,
        layers: await postLayers(job, post, postIndex, false),
      });
      comments.push(await commentsOverlay(job, post, postIndex, true));
    } else {
      const sheet = layoutSheet(env, post, 0, { rounded: false });
      const layout: ScreenLayout = {
        width: W,
        height: sheet.height,
        background: env.pal.elev,
        ops: sheet.ops,
        hits: [],
        parts: {},
      };
      const { head, list, foot } = sheet.parts;
      screens.push({
        id: `s-comments-${postIndex}`,
        hidden: false,
        layers: [],
        plain: {
          head: await toImg(job, { ...slice(layout, head.y, head.height), photo: false }),
          list: await pieces(job, layout, list.y, list.height, false),
          foot: foot
            ? await toImg(job, { ...slice(layout, foot.y, foot.height), photo: false })
            : null,
          background: env.pal.elev,
        },
      });
    }
  } else if (screen === 'story') {
    const j = Math.max(
      0,
      state.stories.findIndex((s) => s.id === sel.storyId),
    );
    stories.push(await storyOverlay(job, j, { opened: true, closable: false, auto: false }));
  } else {
    screens.push({ id: 's-account', hidden: false, layers: await profileLayers(job, false) });
  }
  const doc: ViewerDoc = {
    title: htmlTitle(state, screen, scope),
    theme: state.theme,
    screens,
    comments,
    stories,
  };
  const html = viewerHtml(doc);
  onProgress?.(1);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  /* 結果卡的尺寸：第一個畫面的圖（2 倍；橫向捲動的那一層以畫面寬計） */
  const main =
    screens[0]?.layers.reduce((a, l) => ({ w: W, h: a.h + l.img.h }), { w: 0, h: 0 }) ??
    (stories[0] ? { w: stories[0].img.w, h: stories[0].img.h } : { w: W, h: 0 });
  const plain = screens[0]?.plain;
  const fill = screens[0]?.fill;
  const sum = (list: readonly VImg[]) => list.reduce((n, x) => n + x.h, 0);
  const h = plain
    ? plain.head.h + sum(plain.list) + (plain.foot?.h ?? 0)
    : fill
      ? fill.head.img.h + sum(fill.body.map((x) => x.img)) + fill.foot.img.h
      : main.h;
  return {
    blob,
    fileName: htmlFileName(state, screen, scope, sel),
    width: Math.round((main.w || W) * VIEWER_SCALE),
    height: Math.round(h * VIEWER_SCALE),
    details: [
      {
        label: S.htmlScreens,
        value: S.htmlScreensValue(screens.length + stories.length + comments.length),
      },
    ],
    doc,
  };
}
