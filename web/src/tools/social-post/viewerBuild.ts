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
import type { Post, SocialState } from './model';
import { layoutSheet } from './render/comments';
import { type Env, STATUS_H, W } from './render/common';
import type { Hit, Op, Rect, ScreenLayout } from './render/ops';
import { createCanvasMeasure } from './render/paint';
import { postScreen } from './render/post';
import { profileScreen } from './render/profile';
import { assetIdsOf, fontLoadsOf, makeEnv, type ScreenSelection } from './render/screens';
import { storyScreen } from './render/story';
import { ui } from './render/theme';
import { assets } from './store';
import { S, type ScreenId } from './strings';
import type { VComments, VImg, ViewerDoc, VLayer, VScreen, VSpot, VStory } from './viewer';
import { viewerHtml } from './viewer';

export type HtmlScope = 'one' | 'all';

/** HTML 裡的圖是幾倍 */
export const VIEWER_SCALE = 2;
const TOP_H = 44;

/** 「‹ 帳號／貼文」那一列（全部時貼文畫面的上方，固定在上面） */
function topBar(env: Env): ScreenLayout {
  const { pal, state } = env;
  const small = ui(12, 400);
  const big = ui(16, 700);
  const name = state.profile.username.toUpperCase();
  const ops: Op[] = [
    { t: 'rect', x: 0, y: 0, w: W, h: TOP_H, fill: pal.bg },
    { t: 'icon', name: 'back', x: 10, y: 9, size: 26, color: pal.ink, sw: 2.2 },
    {
      t: 'text',
      x: W / 2,
      y: 5.2,
      lh: 14.4,
      text: name,
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
  /** 透明的背景（面板上方的圓角） */
  clear?: boolean;
}

async function toImg(p: Piece): Promise<VImg> {
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
  return { src, w: layout.width, h: p.part?.height ?? layout.height };
}

const rel = (r: Rect, top: number): Rect => ({ ...r, y: r.y - top });

/** 一則貼文的畫面（狀態列、（全部時）上方列、貼文＋輪播＋留言按鈕） */
async function postLayers(
  env: Env,
  post: Post,
  index: number,
  withTop: boolean,
  tick: () => void,
): Promise<VLayer[]> {
  const full = postScreen(env, post, { viewer: true });
  const statusH = env.state.screen.status ? STATUS_H : 0;
  const layers: VLayer[] = [];
  if (statusH) {
    layers.push({
      img: await toImg({ layout: full, part: { y: 0, height: statusH }, photo: false }),
    });
    tick();
  }
  if (withTop) {
    layers.push({
      img: await toImg({ layout: topBar(env), photo: false }),
      sticky: 'top',
      spots: [
        { rect: { x: 0, y: 0, width: 52, height: TOP_H }, attr: 'data-back', label: S.viewer.back },
      ],
    });
    tick();
  }
  const body = { y: statusH, height: full.height - statusH };
  const spots: VSpot[] = full.hits
    .filter((h: Hit) => h.key === 'open-comments' && !post.commentsOff)
    .map((h) => ({
      rect: rel(h.box, statusH),
      attr: `data-open="${index}"`,
      label: S.viewer.openComments,
    }));
  const img = await toImg({ layout: full, part: body, photo: true });
  tick();
  const layer: VLayer = { img, spots };
  if (post.photos.length > 1) {
    const rect = full.parts.carousel;
    const slides: VImg[] = [];
    for (let k = 0; k < post.photos.length; k++) {
      const v = postScreen(env, post, { viewer: true, current: k });
      slides.push(
        await toImg({ layout: v, part: { y: rect.y, height: rect.height }, photo: true }),
      );
      tick();
    }
    layer.car = {
      rect: rel(rect, statusH),
      hit: rel(full.parts.media, statusH),
      slides,
      index: Math.max(0, Math.min(post.current, post.photos.length - 1)),
      prev: S.viewer.prev,
      next: S.viewer.next,
    };
  }
  layers.push(layer);
  return layers;
}

/** 留言面板（打開時是蓋在畫面上的面板；把手＋標題、清單、下方分開） */
async function commentsOverlay(
  env: Env,
  post: Post,
  index: number,
  opened: boolean,
  tick: () => void,
): Promise<VComments> {
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
  const out: VComments = {
    id: `ov-c-${index}`,
    opened,
    head: await toImg({
      layout,
      part: { y: head.y, height: head.height },
      photo: false,
      clear: true,
    }),
    list: await toImg({ layout, part: { y: list.y, height: list.height }, photo: false }),
    foot: foot
      ? await toImg({ layout, part: { y: foot.y, height: foot.height }, photo: false })
      : null,
    background: env.pal.elev,
    closeLabel: S.viewer.close,
  };
  tick();
  return out;
}

async function storyOverlay(
  env: Env,
  j: number,
  o: { opened: boolean; closable: boolean; auto: boolean },
  tick: () => void,
): Promise<VStory> {
  const st = env.state.stories[j];
  const l = storyScreen(env, st, { viewer: { autoplay: o.auto, closable: o.closable } });
  const img = await toImg({ layout: l, photo: true });
  tick();
  return {
    id: `ov-s-${j}`,
    ...o,
    img,
    bar: o.auto ? (l.parts.bar ?? null) : null,
    close: o.closable ? (l.parts.close ?? null) : null,
    closeLabel: S.viewer.close,
  };
}

/** 個人頁（依內容加高；底部分頁列另外一張、固定在下面） */
async function profileLayers(env: Env, links: boolean, tick: () => void): Promise<VLayer[]> {
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
        const j = env.state.stories.findIndex((s) => s.id === h.key.slice(6));
        const title =
          env.state.account.highlights.find((x) => x.story === h.key.slice(6))?.title ?? '';
        if (j >= 0)
          spots.push({ rect: h.box, attr: `data-story="${j}"`, label: S.viewer.openStory(title) });
      }
    }
  const layers: VLayer[] = [
    { img: await toImg({ layout: l, part: { y: 0, height: bodyH }, photo: true }), spots },
  ];
  tick();
  if (nav) {
    layers.push({
      img: await toImg({ layout: l, part: { y: nav.y, height: nav.height }, photo: false }),
      sticky: 'bottom',
    });
    tick();
  }
  return layers;
}

/** 這次要用到的所有版面（等字型與照片用） */
function allLayouts(env: Env): ScreenLayout[] {
  const out: ScreenLayout[] = [profileScreen(env, { viewer: true }), topBar(env)];
  for (const p of env.state.posts) {
    out.push(postScreen(env, p, { viewer: true }));
    const s = layoutSheet(env, p, 0, { rounded: true });
    out.push({ width: W, height: s.height, background: '', ops: s.ops, hits: [], parts: {} });
  }
  for (const st of env.state.stories)
    out.push(storyScreen(env, st, { viewer: { autoplay: true, closable: true } }));
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

  const total =
    scope === 'all'
      ? 2 +
        state.posts.reduce((n, p) => n + 3 + (p.photos.length > 1 ? p.photos.length : 0) + 1, 0) +
        state.stories.length
      : 6;
  let done = 0;
  const tick = () => {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    done++;
    onProgress?.(Math.min(0.98, done / total), S.exportingHtml(Math.min(done, total), total));
  };

  const screens: VScreen[] = [];
  const comments: VComments[] = [];
  const stories: VStory[] = [];
  const postIndex = Math.max(
    0,
    state.posts.findIndex((p) => p.id === sel.postId),
  );
  const post = state.posts[postIndex];
  if (scope === 'all') {
    screens.push({ id: 's-home', hidden: false, layers: await profileLayers(env, true, tick) });
    for (let i = 0; i < state.posts.length; i++) {
      const p = state.posts[i];
      screens.push({
        id: `s-post-${i}`,
        hidden: true,
        layers: await postLayers(env, p, i, true, tick),
      });
      if (!p.commentsOff) comments.push(await commentsOverlay(env, p, i, false, tick));
    }
    for (let j = 0; j < state.stories.length; j++)
      stories.push(await storyOverlay(env, j, { opened: false, closable: true, auto: true }, tick));
  } else if (screen === 'post') {
    screens.push({
      id: `s-post-${postIndex}`,
      hidden: false,
      layers: await postLayers(env, post, postIndex, false, tick),
    });
    if (!post.commentsOff) comments.push(await commentsOverlay(env, post, postIndex, false, tick));
  } else if (screen === 'comments') {
    if (post.sheet.backdrop) {
      screens.push({
        id: `s-post-${postIndex}`,
        hidden: false,
        layers: await postLayers(env, post, postIndex, false, tick),
      });
      comments.push(await commentsOverlay(env, post, postIndex, true, tick));
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
          head: await toImg({ layout, part: { y: head.y, height: head.height }, photo: false }),
          list: await toImg({ layout, part: { y: list.y, height: list.height }, photo: false }),
          foot: foot
            ? await toImg({ layout, part: { y: foot.y, height: foot.height }, photo: false })
            : null,
          background: env.pal.elev,
        },
      });
      tick();
    }
  } else if (screen === 'story') {
    const j = Math.max(
      0,
      state.stories.findIndex((s) => s.id === sel.storyId),
    );
    stories.push(await storyOverlay(env, j, { opened: true, closable: false, auto: false }, tick));
  } else {
    screens.push({ id: 's-home', hidden: false, layers: await profileLayers(env, false, tick) });
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
  /* 結果卡的尺寸：第一個畫面的圖（2 倍） */
  const main =
    screens[0]?.layers.reduce((a, l) => ({ w: l.img.w, h: a.h + l.img.h }), { w: 0, h: 0 }) ??
    (stories[0] ? { w: stories[0].img.w, h: stories[0].img.h } : { w: W, h: 0 });
  const plain = screens[0]?.plain;
  const h = plain ? plain.head.h + plain.list.h + (plain.foot?.h ?? 0) : main.h;
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
