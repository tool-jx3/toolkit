/**
 * 另開視窗給玩家看（2026-11，先攻與戰鬥追蹤的「玩家視圖」第一個用）：GM 的分頁把要給玩家看的內容（已經拿掉 GM 才能看的部分）
 * 用 BroadcastChannel 送到同一個瀏覽器的另一個視窗；那個視窗只負責顯示，可以拿去分享畫面（Discord、OBS 的視窗擷取）。
 *
 * - GM 的分頁：`const host = createMirrorHost<T>('combat-tracker')`，內容一變就 `host.publish(snapshot)`；
 *   關頁時（pagehide）自動送「已關閉」。
 * - 玩家的視窗：`createMirrorView<T>('combat-tracker', { state, closed })`：開始時先問一次（hello），GM 的分頁回最新的內容；
 *   之後每次 publish 都收到。GM 的分頁關掉時呼叫 `closed`，重新打開後又會收到。
 * - 頻道名稱 `trpg-toolkit:mirror:<topic>`；只在同一個瀏覽器、同一個網站內（BroadcastChannel 的範圍），不經過網路。
 * - 沒有 BroadcastChannel 的瀏覽器（很舊的 Safari）：`mirrorSupported()` 為 false，兩邊都什麼都不做。
 *
 * 訊息只放可以 structured clone 的資料。同一個 topic 開了好幾個 GM 分頁時，玩家的視窗顯示最後送來的。
 */

export type MirrorMessage<T> =
  | { type: 'state'; seq: number; data: T }
  | { type: 'hello' }
  | { type: 'bye' };

export const mirrorChannelName = (topic: string): string => `trpg-toolkit:mirror:${topic}`;

export function mirrorSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

function open(topic: string): BroadcastChannel | null {
  if (!mirrorSupported()) return null;
  try {
    return new BroadcastChannel(mirrorChannelName(topic));
  } catch {
    return null;
  }
}

function isMessage(m: unknown): m is MirrorMessage<unknown> {
  if (!m || typeof m !== 'object') return false;
  const t = (m as { type?: unknown }).type;
  return t === 'state' || t === 'hello' || t === 'bye';
}

export interface MirrorHost<T> {
  /** 送出最新的內容（玩家的視窗開著才收得到；之後打開的視窗會先問，拿到最後這一份） */
  publish: (data: T) => void;
  /** 停止（送「已關閉」並關閉頻道） */
  close: () => void;
}

export function createMirrorHost<T>(topic: string): MirrorHost<T> {
  const ch = open(topic);
  let last: { data: T } | null = null;
  let seq = 0;
  const post = (m: MirrorMessage<T>) => {
    try {
      ch?.postMessage(m);
    } catch {
      /* 不能 clone 的資料或頻道已關閉：略過 */
    }
  };
  const send = () => {
    if (last) post({ type: 'state', seq: ++seq, data: last.data });
  };
  if (ch)
    ch.onmessage = (e: MessageEvent) => {
      if (isMessage(e.data) && e.data.type === 'hello') send();
    };
  const onHide = () => post({ type: 'bye' });
  const onShow = () => send();
  if (ch && typeof window !== 'undefined') {
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
  }
  return {
    publish: (data) => {
      last = { data };
      send();
    },
    close: () => {
      if (!ch) return;
      post({ type: 'bye' });
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onHide);
        window.removeEventListener('pageshow', onShow);
      }
      ch.onmessage = null;
      ch.close();
    },
  };
}

export interface MirrorViewHandlers<T> {
  /** 收到 GM 分頁送來的內容 */
  state: (data: T) => void;
  /** GM 的分頁關掉了（或重新整理中） */
  closed?: () => void;
}

export interface MirrorView {
  /** 再問一次（例如從背景回到前景時） */
  ping: () => void;
  close: () => void;
}

export function createMirrorView<T>(topic: string, on: MirrorViewHandlers<T>): MirrorView {
  const ch = open(topic);
  let lastSeq = -1;
  if (ch)
    ch.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (!isMessage(m)) return;
      if (m.type === 'state') {
        /* 同一個 GM 分頁的舊訊息晚到時不蓋掉新的；GM 分頁重新整理後 seq 從頭算，所以變小時也收 */
        if (m.seq !== lastSeq) {
          lastSeq = m.seq;
          on.state(m.data as T);
        }
      } else if (m.type === 'bye') {
        lastSeq = -1;
        on.closed?.();
      }
    };
  const ping = () => {
    try {
      ch?.postMessage({ type: 'hello' } satisfies MirrorMessage<T>);
    } catch {
      /* 頻道已關閉 */
    }
  };
  ping();
  return {
    ping,
    close: () => {
      if (!ch) return;
      ch.onmessage = null;
      ch.close();
    },
  };
}
