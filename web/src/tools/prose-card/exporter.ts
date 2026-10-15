/**
 * 匯出：讀好圖片與字型（只下載用到的字）→ 重新分頁 → 每一頁畫成 PNG（1 倍 1200 × 1600 或 2 倍 2400 × 3200）。
 * 下載、ZIP、分享都用這裡做出的檔案。
 */
import { canvasToBlob } from '@/core/image';
import { loadSceneFonts } from '@/core/scene';
import { buildBackground } from './background';
import { fileBase, type ProseState, pageFileName } from './model';
import { measureContext, type PageEnv, pageNodes, planPages, renderPage } from './render';
import { assets } from './store';
import { S } from './strings';

export interface RenderedPage {
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

async function bitmapOf(id: string | undefined | null) {
  if (!id) return null;
  const b = await assets.bitmap(id).catch(() => undefined);
  return b ? { source: b as CanvasImageSource, width: b.width, height: b.height } : null;
}

/** 讀好圖片與字型後的分頁結果（匯出用） */
export async function prepare(s: ProseState) {
  const photo = s.layout === 'photo' ? await bitmapOf(s.photo.image?.id) : null;
  const bgImage = s.bg.kind === 'image' ? await bitmapOf(s.bg.image?.id) : null;
  const env: PageEnv = { photo, measure: measureContext() };
  let plan = planPages(s);
  /* 字型載入後字寬會變：再分一次頁（最多兩次就穩定，用到的字不會變） */
  for (let i = 0; i < 2; i++) {
    const nodes = plan.pages.flatMap((_, k) => pageNodes(s, plan, k, env));
    if (!(await loadSceneFonts(nodes))) break;
    plan = planPages(s);
  }
  return { plan, env, bgImage };
}

/** 畫出指定的頁（預設全部） */
export async function renderPages(
  s: ProseState,
  scale: number,
  {
    indices,
    signal,
    onProgress,
  }: {
    indices?: readonly number[];
    signal?: AbortSignal;
    onProgress?: (ratio: number, label?: string) => void;
  } = {},
): Promise<RenderedPage[]> {
  const { plan, env, bgImage } = await prepare(s);
  const total = plan.pages.length;
  const list = (indices ?? plan.pages.map((_, i) => i)).filter((i) => i >= 0 && i < total);
  const background = buildBackground(s.bg, bgImage, scale);
  const base = fileBase(s.title, S.fileBase);
  const out: RenderedPage[] = [];
  for (const [k, i] of list.entries()) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    onProgress?.(k / list.length, S.pageCaption(i + 1, total));
    const canvas = renderPage(background as CanvasImageSource, pageNodes(s, plan, i, env), scale);
    out.push({
      name: pageFileName(base, i, total),
      blob: await canvasToBlob(canvas, 'image/png'),
      width: canvas.width,
      height: canvas.height,
    });
  }
  onProgress?.(1);
  return out;
}

/** 這個瀏覽器能不能分享圖片檔（手機的分享選單） */
export function canShareFiles(): boolean {
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    return nav.canShare({
      files: [new File([new Uint8Array(1)], 'test.png', { type: 'image/png' })],
    });
  } catch {
    return false;
  }
}
