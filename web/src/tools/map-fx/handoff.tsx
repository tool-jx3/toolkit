/**
 * 室內平面圖產生器送來的圖（2026-10-29，map-fx F84；floor-plan F267）：讀共用的交接資料（core/handoff，IndexedDB），
 * 有的話問要不要換上（useConfirm）——取消就丟掉；讀過一次就刪掉，過期的（超過一天）開頁時清掉。
 * 送來的「1 格幾 px」在範圍裡時一起改房間遮罩 ZIP 的格子大小（不列入復原的偏好）。
 * 送來房間的範圍（`meta.rooms`，2026-10-29，F85）時改成三選一：讀入並建立房間遮罩／只讀入圖／取消；
 * 房間遮罩和換圖是同一步復原（共用的 setImage 帶 frames）。沒有房間的範圍（舊版的平面圖、沒有有名字的房間）時照舊問。
 *
 * 兩種開法：
 * - 平面圖產生器在點擊的當下開的分頁：網址的 # 帶 `handoff=<id>`，圖晚一點才寫好——顯示「正在接收」等那一筆
 *   （`waitHandoff`：平面圖還在畫就繼續等；平面圖說失敗了馬上通知；平面圖沒有回應超過約 10 秒就通知等不到）。
 *   # 讀到就從網址拿掉（重新整理不會再等一次；那時圖已經到了的話照下面的方式問）。
 * - 直接開（或重新整理）：有一天內的交接資料就問（`takeHandoff`）。
 */
import { useEffect, useState } from 'react';
import {
  type Handoff,
  readHandoffId,
  readHandoffRooms,
  takeHandoff,
  waitHandoff,
} from '@/core/handoff';
import { LIMITS, newFrameId, storeImage } from '@/core/imagefx';
import { Notice, useChoice, useConfirm, useToast } from '@/ui';
import { masksFromPlan, snapRange } from './model';
import { assets, docNow, prefsNow, setImage, setPrefs } from './store';
import { S } from './strings';

/** 寄件的工具（平面圖產生器）與交接的鍵 */
export const HANDOFF_FROM = 'floor-plan';
export const HANDOFF_TO = 'map-fx';

/** StrictMode 的開發模式會把 effect 跑兩次：一個分頁只讀一次 */
let started = false;

/** 網址的 #handoff=… 拿掉（不重新載入、不留歷史紀錄） */
function clearHash() {
  try {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  } catch {
    /* 拿不掉也沒關係：重新整理時照「直接開」處理 */
  }
}

export function FloorPlanHandoff() {
  const confirm = useConfirm();
  const choose = useChoice();
  const toast = useToast();
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (started) return;
    started = true;
    const apply = async (h: Handoff) => {
      const hasImage = !!docNow().image;
      const title = hasImage ? S.handoff.replaceTitle : S.handoff.loadTitle;
      /* 房間的範圍（F85）：有效的房間數、做得出來的遮罩數（框的上限） */
      const rooms = readHandoffRooms(h.meta);
      const n = rooms?.list.length ?? 0;
      const made = Math.min(n, LIMITS.frames);
      let withRooms = false;
      if (rooms && n > 0) {
        const how = await choose({
          title,
          description: S.handoff.descRooms(h.name, hasImage, n, made),
          choices: [
            {
              value: 'image',
              label: S.handoff.imageOnly(hasImage),
              variant: hasImage ? 'danger' : 'secondary',
            },
            {
              value: 'rooms',
              label: S.handoff.withRooms(hasImage, made),
              variant: hasImage ? 'danger' : 'primary',
            },
          ],
        });
        if (!how) return;
        withRooms = how === 'rooms';
      } else {
        const ok = await confirm({
          title,
          description: S.handoff.desc(h.name, hasImage),
          confirmLabel: hasImage ? S.handoff.replace : S.handoff.load,
          danger: hasImage,
        });
        if (!ok) return;
      }
      const r = await storeImage(assets, h.blob, h.name, S);
      if (!r.ok) {
        toast({ title: S.imageFailed, description: r.reason, tone: 'danger' });
        return;
      }
      const masks =
        withRooms && rooms
          ? masksFromPlan(
              rooms,
              { width: r.ref.width, height: r.ref.height },
              prefsNow().defaults.redact,
              (taken) => newFrameId(taken),
            ).frames
          : [];
      setImage(r.ref, masks.length ? { frames: masks } : undefined);
      const raw = h.meta?.gridPx;
      const grid = typeof raw === 'number' ? snapRange('grid', raw, -1) : -1;
      const notes: string[] = [];
      if (masks.length) notes.push(S.handoff.madeMasks(masks.length));
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
    };
    void (async () => {
      const id = readHandoffId(location.hash);
      if (!id) {
        const h = await takeHandoff(HANDOFF_TO);
        if (h && h.from === HANDOFF_FROM) await apply(h);
        return;
      }
      clearHash();
      setWaiting(true);
      const r = await waitHandoff(HANDOFF_TO, id);
      setWaiting(false);
      if (r.status === 'ok') {
        if (r.handoff.from === HANDOFF_FROM) await apply(r.handoff);
        return;
      }
      toast({
        title: r.status === 'failed' ? S.handoff.failedTitle : S.handoff.timeoutTitle,
        description: S.handoff.retry,
        tone: 'warning',
        duration: 10_000,
      });
    })();
  }, [confirm, choose, toast]);
  return waiting ? (
    <div data-testid="handoff-waiting">
      <Notice tone="progress">{S.handoff.waiting}</Notice>
    </div>
  ) : null;
}
