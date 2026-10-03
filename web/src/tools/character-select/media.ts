/**
 * 畫圖用的圖片（預覽、匯出）與互動 HTML 的產生流程。
 */
import { readAsDataUrl } from '@/core/files';
import { uploadedFontFile } from '@/core/fonts';
import { blockingIssue, demoBitmap } from './actions';
import { demoIndexOf, isDemoImage } from './demo';
import { ensureCanvasFonts } from './exporter';
import { bakeHtmlImages, buildInteractiveHtml, htmlFont, widgetId } from './html';
import type { Settings } from './model';
import type { RenderAssets } from './render';
import { assets } from './store';

/** 把設定用到的圖片全部讀好（匯出、互動 HTML 用） */
export async function resolveAssets(s: Settings): Promise<RenderAssets> {
  const ids = [
    ...new Set([
      ...s.characters.map((c) => c.image),
      ...(s.background.image ? [s.background.image] : []),
    ]),
  ];
  const map = new Map<string, ImageBitmap | null>();
  await Promise.all(
    ids.map(async (id) => {
      const p = isDemoImage(id) ? demoBitmap(demoIndexOf(id)) : assets.bitmap(id);
      map.set(id, (await p.catch(() => undefined)) ?? null);
    }),
  );
  return {
    character: (i) => map.get(s.characters[i]?.image ?? '') ?? null,
    background:
      s.background.type === 'image' && s.background.image
        ? (map.get(s.background.image) ?? null)
        : null,
  };
}

/** 預覽用（已解碼的圖；還沒讀到的是 null） */
export function previewAssets(
  s: Settings,
  images: Record<string, ImageBitmap | null>,
): RenderAssets {
  return {
    character: (i) => images[s.characters[i]?.image ?? ''] ?? null,
    background:
      s.background.type === 'image' && s.background.image
        ? (images[s.background.image] ?? null)
        : null,
  };
}

/** 上傳字型的 data URL 與 CSS 的 format() */
async function uploadedFontData(
  family: string,
): Promise<{ dataUrl: string; format: string } | null> {
  const f = await uploadedFontFile(family);
  if (!f) return null;
  const bytes = new Uint8Array(f.data);
  const sig = String.fromCharCode(...bytes.subarray(0, 4));
  const [mime, format] =
    sig === 'wOFF'
      ? ['font/woff', 'woff']
      : sig === 'wOF2'
        ? ['font/woff2', 'woff2']
        : sig === 'OTTO'
          ? ['font/otf', 'opentype']
          : ['font/ttf', 'truetype'];
  return { dataUrl: await readAsDataUrl(new Blob([bytes], { type: mime })), format };
}

/** 互動 HTML（規格 3.11）：檢查 → 讀圖 → 套好效果的圖 → 字型 → 組程式碼。有問題時丟錯（訊息可直接顯示） */
export async function generateHtml(s: Settings): Promise<{ snippet: string; standalone: string }> {
  const issue = blockingIssue(s);
  if (issue) throw new Error(issue);
  const resolved = await resolveAssets(s);
  await ensureCanvasFonts(s);
  const uploaded = s.font.source === 'upload' ? await uploadedFontData(s.font.family) : null;
  const baked = await bakeHtmlImages(s, resolved, async () => {
    const blob = s.background.image ? await assets.get(s.background.image) : undefined;
    return blob ? readAsDataUrl(blob) : null;
  });
  return buildInteractiveHtml(s, baked, htmlFont(s, uploaded), widgetId());
}
