/**
 * 把圖片放進頭像或格子（選檔、拖放、貼上都走這裡；規格 F04、F13、F14）。要在 ToolShell 裡面用（通知）。
 * - 目標是頭像：第一張換成頭像；
 * - 目標是某一格：第一張放那一格，其餘依序放進後面沒有圖片的格子；
 * - 沒有目標：從頭依序放進沒有圖片的格子；不夠時在最後加格子（到上限）。
 */
import { useToast } from '@/ui';
import { loadReviewImage, loadReviewImages } from './images';
import { LIMITS } from './model';
import { fillImages, setProfileImage, type Target } from './store';
import { S } from './strings';

const isImageFile = (f: File) =>
  f.type.startsWith('image/') || (!f.type && /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.name));

export function usePlaceImages() {
  const toast = useToast();
  const reject = (files: readonly File[]) => {
    if (files.length)
      toast({ title: S.notImage(files.map((f) => f.name).join('、')), tone: 'danger' });
  };
  const place = async (files: readonly File[], target: Target | null): Promise<void> => {
    const images = files.filter(isImageFile);
    reject(files.filter((f) => !isImageFile(f)));
    if (!images.length) return;
    if (target?.kind === 'profile') {
      try {
        const r = await loadReviewImage(images[0]);
        setProfileImage(r.ref);
        toast({ title: S.avatarSet, tone: 'success', replace: true });
        if (!r.persisted) toast({ title: S.imageNotSaved, tone: 'warning' });
      } catch {
        toast({ title: S.decodeError(images[0].name), tone: 'danger' });
      }
      return;
    }
    const { loaded, failed } = await loadReviewImages(images.slice(0, LIMITS.cells));
    if (failed.length) toast({ title: S.decodeError(failed.join('、')), tone: 'danger' });
    if (loaded.some((l) => !l.persisted)) toast({ title: S.imageNotSaved, tone: 'warning' });
    if (!loaded.length) return;
    const r = fillImages(
      loaded.map((l) => l.ref),
      target?.kind === 'cell' ? target.id : null,
    );
    if (r.ids.length)
      toast({ title: S.imagesPlaced(r.ids.length), tone: 'success', replace: true });
    const dropped = r.dropped + Math.max(0, images.length - LIMITS.cells);
    if (dropped) toast({ title: S.imagesDropped(dropped), tone: 'warning' });
  };
  return { place, reject };
}
