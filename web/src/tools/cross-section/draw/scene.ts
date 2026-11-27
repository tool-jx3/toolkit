/**
 * 畫哪一邊（縱向的建築斷面、橫向的連結車廂）的轉接：編輯畫面、匯出、縮圖都從這裡畫。
 * 建築照第一批的 drawScene（沒有用到第二批的東西時畫法逐指令相同）；列車是 drawTrainScene。
 */
import { type Layout, layoutOf, type Rect } from '../model/layout';
import { type TrainLayout, trainLayoutOf } from '../model/trainLayout';
import type { SectionDoc, Train } from '../model/types';
import { type Crop, drawScene, type SceneOpts, sceneRect } from './render';
import { drawTrainScene } from './train';

/** 這份作品正在畫的那一邊 */
export type Plan = { kind: 'building'; L: Layout } | { kind: 'train'; t: Train; T: TrainLayout };

export function planOf(doc: SectionDoc, arrange?: Train['arrange']): Plan {
  if (doc.mode === 'train' && doc.train)
    return { kind: 'train', t: doc.train, T: trainLayoutOf(doc.train, arrange) };
  return { kind: 'building', L: layoutOf(doc) };
}

export const worldOf = (plan: Plan): Rect => (plan.kind === 'train' ? plan.T.world : plan.L.world);

/** 這張圖的範圍（世界座標） */
export function docRect(doc: SectionDoc, crop: Crop, plan: Plan = planOf(doc)): Rect {
  return sceneRect(doc, { world: worldOf(plan) }, crop);
}

export function drawDoc(
  c: CanvasRenderingContext2D,
  doc: SectionDoc,
  o: SceneOpts,
  plan: Plan = planOf(doc),
): void {
  if (plan.kind === 'train') drawTrainScene(c, doc, plan.t, plan.T, o);
  else drawScene(c, doc, plan.L, o);
}
