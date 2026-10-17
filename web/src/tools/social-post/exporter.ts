/**
 * PNG（規格 F85～F88、3.1）：目前的畫面以倍率畫在 canvas（與預覽同一段程式，不畫編輯用的框）。
 * 先等字型（只下載用到的字）與照片讀好，再用新的量字排一次版（字型載好後字寬可能不同）。
 */
import { loadAssetBitmaps } from '@/core/assets';
import { canvasToBlob, makeCanvas } from '@/core/image';
import type { ExportOutput } from '@/ui';
import { loadFonts } from './fonts';
import type { SocialState } from './model';
import type { ScreenLayout } from './render/ops';
import { createCanvasMeasure, paintScreen } from './render/paint';
import {
  assetIdsOf,
  buildScreen,
  fontLoadsOf,
  imageSource,
  makeEnv,
  type ScreenSelection,
} from './render/screens';
import { assets } from './store';
import type { ScreenId } from './strings';

const two = (n: number) => String(n).padStart(2, '0');

/** 年月日-時分秒（本機時間） */
export function stamp(now: Date): string {
  return `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

const SLUG: Record<ScreenId, string> = {
  post: 'post',
  comments: 'comments',
  story: 'story',
  profile: 'profile',
};

/** 目前的畫面是第幾則（貼文、留言＝第幾則貼文；限時動態＝第幾則；個人頁沒有） */
export function screenIndex(
  state: SocialState,
  screen: ScreenId,
  sel: ScreenSelection,
): number | null {
  if (screen === 'profile') return null;
  if (screen === 'story')
    return (
      Math.max(
        0,
        state.stories.findIndex((s) => s.id === sel.storyId),
      ) + 1
    );
  return (
    Math.max(
      0,
      state.posts.findIndex((p) => p.id === sel.postId),
    ) + 1
  );
}

/** `socialpost-<post／comments／story／profile>[-<第幾則>]-<年月日-時分秒>.png` */
export function pngFileName(screen: ScreenId, index: number | null, now: Date): string {
  return `socialpost-${SLUG[screen]}${index ? `-${index}` : ''}-${stamp(now)}.png`;
}

/** 輸出用的版面：等字型載好後用新的量字重排、等照片讀好 */
export async function outputLayout(
  state: SocialState,
  build: (env: ReturnType<typeof makeEnv>) => ScreenLayout,
): Promise<ScreenLayout> {
  const first = build(makeEnv(state, createCanvasMeasure(), false));
  await loadFonts(fontLoadsOf(first.ops));
  const layout = build(makeEnv(state, createCanvasMeasure(), false));
  await loadAssetBitmaps(assets, assetIdsOf(layout.ops));
  return layout;
}

/** 畫面畫成 canvas（整張或從 y 開始的一段） */
export function paintToCanvas(
  layout: ScreenLayout,
  scale: number,
  part?: { y: number; height: number },
): HTMLCanvasElement | OffscreenCanvas {
  const w = Math.max(1, Math.round(layout.width * scale));
  const h = Math.max(1, Math.round((part?.height ?? layout.height) * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('無法建立畫布');
  paintScreen(ctx, layout, scale, imageSource, { offsetY: part?.y ?? 0 });
  return canvas;
}

export async function exportPng(
  state: SocialState,
  screen: ScreenId,
  sel: ScreenSelection,
  scale: number,
  now = new Date(),
): Promise<ExportOutput> {
  const layout = await outputLayout(state, (env) => buildScreen(env, screen, sel));
  const canvas = paintToCanvas(layout, scale);
  const blob = await canvasToBlob(canvas, 'image/png');
  return {
    blob,
    fileName: pngFileName(screen, screenIndex(state, screen, sel), now),
    width: canvas.width,
    height: canvas.height,
  };
}
