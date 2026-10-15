/**
 * GIF「只寫變化的範圍」（core/encode 的 cropFrames，2026-10 起預設開）的 E2E 共用檢查。
 *
 * 同一個頁面、同一組設定匯出兩次：先設測試注入點 `window.__gifCropFrames = false`（core/encode/client.ts，
 * 照改版前每格寫整格），再拿掉（預設）。比對兩個檔案：
 * - 尺寸、播放次數、影格數、每格延遲不變；改版前每一格都是整格；
 * - 合成後的每一格逐像素相同：測試用的解析器（tests/helpers/gif.ts）與 Chromium 的 ImageDecoder 各比一次；
 * - 有裁的時候（全不透明、共用調色盤）檔案變小、至少一格只有變化的範圍；沒裁的時候（有透明像素、每格各自減色）逐位元組相同。
 */
import { expect, type Page } from '@playwright/test';
import { composeGif, type GifFrame, type GifInfo, parseGif } from './gif';

const HOOK = '__gifCropFrames';

/** 用同一組設定匯出兩次：before＝改版前（每格寫整格）、after＝預設（只寫變化的範圍） */
export async function exportGifBeforeAfter(
  page: Page,
  exportGif: () => Promise<Uint8Array>,
): Promise<{ before: Uint8Array; after: Uint8Array }> {
  await page.evaluate((k) => {
    (window as unknown as Record<string, unknown>)[k] = false;
  }, HOOK);
  const before = await exportGif();
  await page.evaluate((k) => {
    delete (window as unknown as Record<string, unknown>)[k];
  }, HOOK);
  const after = await exportGif();
  return { before, after };
}

const isFull = (info: GifInfo) => (f: GifFrame) =>
  f.x === 0 && f.y === 0 && f.width === info.width && f.height === info.height;

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** 傳進頁面用的 base64（分段轉字串，大檔也不會超過參數個數上限） */
function base64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface GifCropSummary {
  /** 影格數（檔案裡） */
  frames: number;
  /** 只寫了變化範圍的影格數 */
  cropped: number;
  /** 檔案大小（位元組） */
  before: number;
  after: number;
}

/** Chromium 的 ImageDecoder 解碼兩個檔案，回傳格數與畫面不同的格（應該是空的） */
async function browserDiff(page: Page, before: Uint8Array, after: Uint8Array) {
  return page.evaluate(
    async ({ a, b }) => {
      const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      // biome-ignore lint/suspicious/noExplicitAny: ImageDecoder 還沒有型別
      const open = async (data: Uint8Array): Promise<any> => {
        // biome-ignore lint/suspicious/noExplicitAny: ImageDecoder 還沒有型別
        const d = new (window as any).ImageDecoder({ data, type: 'image/gif' });
        await d.tracks.ready;
        await d.completed;
        return d;
      };
      const da = await open(bytes(a));
      const db = await open(bytes(b));
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      // biome-ignore lint/suspicious/noExplicitAny: ImageDecoder 還沒有型別
      const pixels = async (d: any, i: number) => {
        const { image } = await d.decode({ frameIndex: i });
        canvas.width = image.displayWidth;
        canvas.height = image.displayHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        image.close();
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const n = da.tracks.selectedTrack.frameCount as number;
      const differ: number[] = [];
      for (let i = 0; i < n; i++) {
        const pa = await pixels(da, i);
        const pb = await pixels(db, i);
        let ok = pa.length === pb.length;
        for (let k = 0; ok && k < pa.length; k++) if (pa[k] !== pb[k]) ok = false;
        if (!ok) differ.push(i);
      }
      const out = { frames: n, framesAfter: db.tracks.selectedTrack.frameCount as number, differ };
      da.close();
      db.close();
      return out;
    },
    { a: base64(before), b: base64(after) },
  );
}

/**
 * 比對改版前與預設的兩個 GIF（見檔頭）。cropped：預期有沒有裁（全不透明、共用調色盤的工具為 true）。
 */
export async function expectSameGifFrames(
  page: Page,
  before: Uint8Array,
  after: Uint8Array,
  { cropped }: { cropped: boolean },
): Promise<GifCropSummary> {
  const a = parseGif(before);
  const b = parseGif(after);
  expect([b.width, b.height, b.loopCount]).toEqual([a.width, a.height, a.loopCount]);
  expect(b.frames.length).toBe(a.frames.length);
  expect(b.frames.map((f) => f.delayCs)).toEqual(a.frames.map((f) => f.delayCs));
  expect(a.frames.every(isFull(a)), '改版前每一格都是整格').toBe(true);
  const nCropped = b.frames.filter((f) => !isFull(b)(f)).length;
  if (cropped) {
    expect(isFull(b)(b.frames[0]), '第一格整格').toBe(true);
    expect(nCropped, '至少一格只寫變化的範圍').toBeGreaterThan(0);
    expect(after.length).toBeLessThan(before.length);
  } else {
    expect(same(after, before), '沒裁時逐位元組相同').toBe(true);
  }
  const fa = composeGif(a);
  const fb = composeGif(b);
  expect(
    fa.findIndex((f, i) => !same(f, fb[i])),
    '合成後畫面不同的格',
  ).toBe(-1);
  expect(await browserDiff(page, before, after)).toEqual({
    frames: a.frames.length,
    framesAfter: a.frames.length,
    differ: [],
  });
  return { frames: a.frames.length, cropped: nCropped, before: before.length, after: after.length };
}
