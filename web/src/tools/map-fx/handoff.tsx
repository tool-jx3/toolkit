/**
 * 室內平面圖產生器送來的圖（2026-10-29，map-fx F84；floor-plan F267）：讀共用的交接資料（core/handoff，IndexedDB），
 * 有的話問要不要換上（useConfirm）——取消就丟掉；讀過一次就刪掉，過期的（超過一天）開頁時清掉。
 * 送來的「1 格幾 px」在範圍裡時一起改房間遮罩 ZIP 的格子大小（不列入復原的偏好）。
 * 送來房間的範圍（`meta.rooms`，2026-10-29，F85）時改成三選一：讀入並建立房間遮罩／只讀入圖／取消；
 * 房間遮罩和換圖是同一步復原（共用的 setImage 帶 frames）。沒有房間的範圍（舊版的平面圖、沒有有名字的房間）時照舊問。
 *
 * 2026-11-05 起世界地圖產生器（world-map）也送圖過來：網址的 # 另外帶 `from=world-map`（還在等的時候就知道是誰送的），
 * 讀到之後看交接資料的 from 決定介面上的稱呼；世界地圖沒有房間的範圍與格子，只問要不要讀入。
 * 同一天起圖塊地圖編輯器（tile-map，F88）也送圖過來（`from=tile-map`）：沒有房間的範圍（只問要不要讀入），
 * 帶的「1 格幾 px」照平面圖的做法改房間遮罩 ZIP 的格子大小。房間的範圍只收平面圖帶的。
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
/** 收得下的寄件工具（2026-11-05 加世界地圖產生器、圖塊地圖編輯器） */
export const HANDOFF_SOURCES: readonly string[] = [HANDOFF_FROM, 'world-map', 'tile-map'];

/** 介面上的稱呼（平面圖用原本的文字） */
const textsFor = (from: string | null | undefined) =>
  from === 'world-map' ? S.handoff.world : from === 'tile-map' ? S.handoff.tile : S.handoff;

/** 這個寄件的工具帶來的東西收不收：房間的範圍只收平面圖的；「1 格幾 px」收平面圖與圖塊地圖的 */
const takesRooms = (from: string) => from === HANDOFF_FROM;
const takesGrid = (from: string) => from === HANDOFF_FROM || from === 'tile-map';

/** 網址的 # 裡寫的寄件工具（沒寫時當平面圖） */
function hashSource(hash: string): string {
  const from = new URLSearchParams(hash.replace(/^#/, '')).get('from');
  return from && HANDOFF_SOURCES.includes(from) ? from : HANDOFF_FROM;
}

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
  const [waiting, setWaiting] = useState<string | null>(null);
  useEffect(() => {
    if (started) return;
    started = true;
    const apply = async (h: Handoff) => {
      const T = textsFor(h.from);
      const hasImage = !!docNow().image;
      const title = hasImage ? T.replaceTitle : T.loadTitle;
      /* 房間的範圍（F85）：有效的房間數、做得出來的遮罩數（框的上限） */
      const rooms = takesRooms(h.from) ? readHandoffRooms(h.meta) : null;
      const n = rooms?.list.length ?? 0;
      const made = Math.min(n, LIMITS.frames);
      let withRooms = false;
      if (rooms && n > 0) {
        const how = await choose({
          title,
          description: S.handoff.descRooms(
            h.name,
            hasImage,
            n,
            made,
            LIMITS.frames,
            rooms.list.some((r) => r.gm),
          ),
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
      const raw = takesGrid(h.from) ? h.meta?.gridPx : undefined;
      const grid = typeof raw === 'number' ? snapRange('grid', raw, -1) : -1;
      const notes: string[] = [];
      if (masks.length) notes.push(S.handoff.madeMasks(masks.length));
      if (grid > 0 && grid === raw) {
        setPrefs({ grid });
        notes.push(h.from === 'tile-map' ? S.handoff.tile.grid(grid) : S.handoff.grid(grid));
      }
      if (!r.persisted) notes.push(S.imageNotSaved);
      toast({
        title: T.loaded(h.name),
        description: notes.join('') || undefined,
        tone: r.persisted ? 'success' : 'warning',
      });
    };
    void (async () => {
      const id = readHandoffId(location.hash);
      if (!id) {
        const h = await takeHandoff(HANDOFF_TO);
        if (h && HANDOFF_SOURCES.includes(h.from)) await apply(h);
        return;
      }
      const from = hashSource(location.hash);
      const T = textsFor(from);
      clearHash();
      setWaiting(T.waiting);
      const r = await waitHandoff(HANDOFF_TO, id);
      setWaiting(null);
      if (r.status === 'ok') {
        if (HANDOFF_SOURCES.includes(r.handoff.from)) await apply(r.handoff);
        return;
      }
      toast({
        title: r.status === 'failed' ? T.failedTitle : T.timeoutTitle,
        description: T.retry,
        tone: 'warning',
        duration: 10_000,
      });
    })();
  }, [confirm, choose, toast]);
  return waiting ? (
    <div data-testid="handoff-waiting">
      <Notice tone="progress">{waiting}</Notice>
    </div>
  ) : null;
}
