/**
 * 組出一個畫面（預覽、PNG、HTML 共用）：依畫面種類呼叫各自的版面，並收集要下載的字型、用到的圖。
 */

import type { ImageRef, SocialState } from '../model';
import { sampleCanvas } from '../samples';
import { assets } from '../store';
import type { ScreenId } from '../strings';
import type { Measure } from '../text';
import { commentsScreen } from './comments';
import type { Env } from './common';
import type { Op, ScreenLayout } from './ops';
import type { ImageSource } from './paint';
import { postScreen } from './post';
import { profileScreen } from './profile';
import { storyScreen } from './story';
import { PALETTES } from './theme';

export function makeEnv(state: SocialState, measure: Measure, edit: boolean): Env {
  return { state, measure, pal: PALETTES[state.theme], fs: state.screen.fontScale, edit };
}

export interface ScreenSelection {
  postId: string;
  storyId: string;
  cell?: number;
}

/** 目前的畫面 */
export function buildScreen(env: Env, screen: ScreenId, sel: ScreenSelection): ScreenLayout {
  const d = env.state;
  const post = d.posts.find((p) => p.id === sel.postId) ?? d.posts[0];
  const story = d.stories.find((s) => s.id === sel.storyId) ?? d.stories[0];
  switch (screen) {
    case 'post':
      return postScreen(env, post);
    case 'comments':
      return commentsScreen(env, post);
    case 'story':
      return storyScreen(env, story, { selectedCell: sel.cell ?? null });
    default:
      return profileScreen(env);
  }
}

/** 畫面用到的字（字型只下載這些字需要的部分） */
export function fontLoadsOf(
  ops: readonly Op[],
): { family: string; weight: number; text: string }[] {
  const map = new Map<string, { family: string; weight: number; text: Set<string> }>();
  const walk = (list: readonly Op[]) => {
    for (const o of list) {
      if (o.t === 'group') walk(o.ops);
      else if (o.t === 'text') {
        const key = `${o.font.family}|${o.font.weight}`;
        let e = map.get(key);
        if (!e) {
          e = { family: o.font.family, weight: o.font.weight, text: new Set() };
          map.set(key, e);
        }
        for (const ch of o.text) e.text.add(ch);
      }
    }
  };
  walk(ops);
  return [...map.values()].map((e) => ({
    family: e.family,
    weight: e.weight,
    text: [...e.text].sort().join(''),
  }));
}

/** 畫面用到的資產 id */
export function assetIdsOf(ops: readonly Op[]): string[] {
  const out = new Set<string>();
  const add = (img: ImageRef | null) => {
    if (img?.kind === 'asset') out.add(img.id);
  };
  const walk = (list: readonly Op[]) => {
    for (const o of list) {
      if (o.t === 'group') walk(o.ops);
      else if (o.t === 'image' || o.t === 'avatar') add(o.img);
    }
  };
  walk(ops);
  return [...out];
}

/** 圖的來源：範例圖由程式畫、資產從已經讀好的快取拿（讀不到時 null，畫灰底或預設人像） */
export const imageSource: ImageSource = (img) =>
  img.kind === 'sample' ? sampleCanvas(img.key) : (assets.peekBitmap(img.id) ?? null);

/** 設定欄縮圖的來源（還沒讀好時 null，顯示讀取中） */
export const thumbSource = (
  img: ImageRef | null,
): ImageBitmap | HTMLCanvasElement | OffscreenCanvas | null =>
  !img ? null : img.kind === 'sample' ? sampleCanvas(img.key) : (assets.peekBitmap(img.id) ?? null);

/** 圖的來源（等讀好；調整範圍的對話框用） */
export async function loadImageSource(img: ImageRef): Promise<CanvasImageSource | null> {
  if (img.kind === 'sample') return sampleCanvas(img.key);
  return (await assets.bitmap(img.id).catch(() => undefined)) ?? null;
}
