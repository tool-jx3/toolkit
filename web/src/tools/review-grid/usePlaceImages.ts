/**
 * 把圖片放進頭像或格子（選檔、拖放、貼上都走這裡；規格 F04、F13、F14）。要在 ToolShell 裡面用（通知）。
 * - 目標是頭像：第一張換成頭像；
 * - 目標是某一格：第一張放那一格，其餘依序放進後面沒有圖片的格子；
 * - 沒有目標：從頭依序放進沒有圖片的格子；不夠時在最後加格子（到上限）。
 * 不是圖片的檔也交進來（拖放區不先濾掉），同一批的結果合成一則通知（notices.ts）。
 */
import { useToast } from '@/ui';
import { loadReviewImage, loadReviewImages } from './images';
import { LIMITS } from './model';
import { placeNotice } from './notices';
import { fillImages, setProfileImage, type Target } from './store';

export const isImageFile = (f: File): boolean =>
  f.type.startsWith('image/') || (!f.type && /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.name));

export function usePlaceImages() {
  const toast = useToast();
  /**
   * @param max 最多用幾張（單一格的圖片欄、頭像：1；多的不用）
   */
  const place = async (
    files: readonly File[],
    target: Target | null,
    { max }: { max?: number } = {},
  ): Promise<void> => {
    const notImages = files.filter((f) => !isImageFile(f)).map((f) => f.name);
    const all = files.filter(isImageFile);
    const images = all.slice(0, max ?? LIMITS.cells);
    const show = (r: Parameters<typeof placeNotice>[0]) => {
      const n = placeNotice(r);
      if (n) toast({ ...n, replace: true });
    };
    if (target?.kind === 'profile') {
      let placed = 0;
      let failed: string[] = [];
      let notSaved = false;
      if (images[0]) {
        try {
          const r = await loadReviewImage(images[0]);
          setProfileImage(r.ref);
          placed = 1;
          notSaved = !r.persisted;
        } catch {
          failed = [images[0].name];
        }
      }
      show({ target: 'profile', placed, notImages, failed, dropped: 0, notSaved });
      return;
    }
    const { loaded, failed } = images.length
      ? await loadReviewImages(images)
      : { loaded: [], failed: [] };
    const r = loaded.length
      ? fillImages(
          loaded.map((l) => l.ref),
          target?.kind === 'cell' ? target.id : null,
        )
      : { ids: [], dropped: 0 };
    show({
      target: 'cells',
      placed: r.ids.length,
      notImages,
      failed,
      dropped: r.dropped + (max === undefined ? all.length - images.length : 0),
      notSaved: loaded.some((l) => !l.persisted),
    });
  };
  return { place };
}
