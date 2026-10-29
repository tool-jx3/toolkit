/**
 * 室內平面圖產生器送來的圖（2026-10-29，map-fx F84；floor-plan F267）：開頁時讀共用的交接資料（core/handoff，IndexedDB），
 * 有的話問要不要換上（useConfirm）——取消就丟掉；讀過一次就刪掉，過期的（超過一天）開頁時清掉。
 * 送來的「1 格幾 px」在範圍裡時一起改房間遮罩 ZIP 的格子大小（不列入復原的偏好）。
 */
import { useEffect } from 'react';
import { takeHandoff } from '@/core/handoff';
import { storeImage } from '@/core/imagefx';
import { useConfirm, useToast } from '@/ui';
import { snapRange } from './model';
import { assets, docNow, setImage, setPrefs } from './store';
import { S } from './strings';

/** 寄件的工具（平面圖產生器）與交接的鍵 */
export const HANDOFF_FROM = 'floor-plan';
export const HANDOFF_TO = 'map-fx';

/** StrictMode 的開發模式會把 effect 跑兩次：一個分頁只讀一次 */
let started = false;

export function FloorPlanHandoff() {
  const confirm = useConfirm();
  const toast = useToast();
  useEffect(() => {
    if (started) return;
    started = true;
    void (async () => {
      const h = await takeHandoff(HANDOFF_TO);
      if (!h || h.from !== HANDOFF_FROM) return;
      const hasImage = !!docNow().image;
      const ok = await confirm({
        title: hasImage ? S.handoff.replaceTitle : S.handoff.loadTitle,
        description: S.handoff.desc(h.name, hasImage),
        confirmLabel: hasImage ? S.handoff.replace : S.handoff.load,
        danger: hasImage,
      });
      if (!ok) return;
      const r = await storeImage(assets, h.blob, h.name, S);
      if (!r.ok) {
        toast({ title: S.imageFailed, description: r.reason, tone: 'danger' });
        return;
      }
      setImage(r.ref);
      const raw = h.meta?.gridPx;
      const grid = typeof raw === 'number' ? snapRange('grid', raw, -1) : -1;
      const notes: string[] = [];
      if (grid > 0 && grid === raw) {
        setPrefs({ grid });
        notes.push(S.handoff.grid(grid));
      }
      if (!r.persisted) notes.push(S.imageNotSaved);
      toast({
        title: S.handoff.loaded(h.name),
        description: notes.join('') || undefined,
        tone: r.persisted ? 'success' : 'warning',
      });
    })();
  }, [confirm, toast]);
  return null;
}
