/**
 * 地圖的載入（F01～F04）：選檔、拖放、貼上都走共用的 loadImageFiles（core/imagefx）——只用第一張圖片、
 * 換上時演出框、出處與 3D 的房間清空。範例地圖與示範演出（含 3D 的範例）見 sample.ts。
 */
import { canvasToBlob } from '@/core/image';
import { type BatchNotice, loadImageFiles as loadFxImageFiles, storeImage } from '@/core/imagefx';
import { demoFrames, demoWalk, drawSample } from './sample';
import { assets, setImage } from './store';
import { S } from './strings';

export type { BatchNotice } from '@/core/imagefx';

/** 選檔、拖放、貼上：用第一張圖片；回傳要顯示的通知（沒有要說的時 null） */
export const loadImageFiles = (files: readonly File[]): Promise<BatchNotice | null> =>
  loadFxImageFiles(files, assets, (ref) => setImage(ref), S);

/** 範例地圖（demo＝一起放示範演出的框與出處） */
export async function loadSample(demo: boolean): Promise<BatchNotice | null> {
  try {
    const canvas = await drawSample();
    const blob = await canvasToBlob(canvas, 'image/png');
    const r = await storeImage(assets, blob, S.sampleName, S);
    if (!r.ok) return { title: S.imageFailed, description: r.reason, tone: 'danger' };
    setImage(
      r.ref,
      demo ? { frames: demoFrames(), credit: S.demoCredit, tool: demoWalk() } : undefined,
    );
    return r.persisted
      ? null
      : { title: S.imageApplied(S.sampleName), description: S.imageNotSaved, tone: 'warning' };
  } catch {
    return { title: S.imageFailed, description: S.sampleFailed, tone: 'danger' };
  }
}
