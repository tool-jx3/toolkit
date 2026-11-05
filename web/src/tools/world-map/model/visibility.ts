/**
 * 公開用與 GM 用：公開用拿掉 GM 專用的素材、路線、地名・備註（國與地形兩種都一樣）。
 */
import type { WorldDoc } from './types';

export type Audience = 'gm' | 'player';

export function forAudience(doc: WorldDoc, audience: Audience): WorldDoc {
  if (audience === 'gm') return doc;
  return {
    ...doc,
    objects: doc.objects.filter((o) => !o.secret),
    paths: doc.paths.filter((p) => !p.secret),
    notes: doc.notes.filter((n) => !n.secret),
  };
}

/** GM 專用的數量（公開用的 PNG 拿掉的） */
export const secretCount = (doc: WorldDoc): number =>
  doc.objects.filter((o) => o.secret).length +
  doc.paths.filter((p) => p.secret).length +
  doc.notes.filter((n) => n.secret).length;
