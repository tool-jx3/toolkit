/**
 * 狀態：
 * - useSettings：三種周邊的設定、材質、打光、背景、自動旋轉、匯出設定（自動保存、復原／重做；圖片只記 id）。
 *   第一次開啟、重設時是內建示範圖（規格 5. D10）。
 * - useSession：這次開頁的狀態（產生的結果、錯誤、匯出中、陀螺儀的沉浸模式、搖搖樂的亂數種子）。
 * - useView：目前的周邊種類（分頁）。自動保存，但不列入復原（換分頁不算一步）。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { demoId } from './demo';
import {
  defaultSettings,
  type Kind,
  newId,
  normalizeSettings,
  type Settings,
  TOOL_ID,
} from './model';
import type { BuildError, BuildInfo } from './scene';

export const PROJECT_VERSION = 1;

/** 預設值（示範圖） */
export function initialSettings(): Settings {
  const s = defaultSettings();
  s.stand.front = demoId('hero');
  s.stand.back = demoId('hero-back');
  s.shaker.parts = [
    { id: 'demo-star', image: demoId('star'), qty: 4, scale: 28 },
    { id: 'demo-heart', image: demoId('heart'), qty: 3, scale: 26 },
    { id: 'demo-d20', image: demoId('d20'), qty: 2, scale: 30 },
    { id: 'demo-moon', image: demoId('moon'), qty: 2, scale: 26 },
  ];
  s.diorama.layers = [
    { id: 'demo-hero', image: demoId('hero-small'), x: -110, y: 0, rotation: 0 },
    { id: 'demo-forest', image: demoId('forest'), x: 0, y: 0, rotation: 0 },
    { id: 'demo-castle', image: demoId('castle'), x: 0, y: 0, rotation: 0 },
  ];
  return s;
}

export const useSettings = createToolStore<Settings>(TOOL_ID, initialSettings(), {
  version: PROJECT_VERSION,
  migrate: (persisted) => normalizeSettings(persisted) ?? initialSettings(),
});

/* 存檔裡的值不合法時（被改壞、舊版本）修正一次 */
{
  const d = useSettings.getState().data;
  const fixed = normalizeSettings(d) ?? initialSettings();
  if (JSON.stringify(fixed) !== JSON.stringify(d)) {
    useSettings.temporal.getState().pause();
    useSettings.getState().replace(fixed);
    useSettings.temporal.getState().resume();
  }
  useSettings.temporal.getState().clear();
}

export const settingsNow = (): Settings => useSettings.getState().data;

export function edit(recipe: (d: Settings) => void): void {
  useSettings.getState().update(recipe);
}

/** 一次完成的動作（按鈕）：自己算一步，不和前後 0.4 秒內的變更合併 */
export function step(recipe: (d: Settings) => void): void {
  if (useSettings.inGesture()) {
    edit(recipe);
    return;
  }
  useSettings.beginGesture();
  try {
    edit(recipe);
  } finally {
    useSettings.endGesture();
  }
}

export const useView = createPreviewStore<{ kind: Kind }>(TOOL_ID, { kind: 'stand' });

export const kindNow = (): Kind => useView.getState().data.kind;

/** 換周邊種類（不列入復原） */
export function setKind(kind: Kind): void {
  if (kindNow() !== kind) useView.getState().replace({ kind });
}

export const addPartId = () => newId('p');
export const addLayerId = () => newId('l');

export interface Session {
  /** 目前畫面上的周邊（null＝沒有） */
  info: BuildInfo | null;
  /** 建不出來的原因 */
  error: BuildError | null;
  /** 畫面還沒跟上設定（拉桿還在動、讀圖、組場景） */
  building: boolean;
  /** 預覽蓋著「產生…中」的遮罩（讀圖、組場景；拉桿還在動時不蓋） */
  busy: boolean;
  exporting: boolean;
  /** 陀螺儀的沉浸模式 */
  immersive: boolean;
  /** 搖搖樂零件位置的亂數種子（「重新產生」時換） */
  seed: number;
  /** 「重新產生」的次數（預覽要重建並重設鏡頭） */
  rebuild: number;
}

export const useSession = create<Session>(() => ({
  info: null,
  error: null,
  building: false,
  busy: false,
  exporting: false,
  immersive: false,
  seed: 1,
  rebuild: 0,
}));

export function requestRebuild(): void {
  useSession.setState((s) => ({ seed: s.seed + 1, rebuild: s.rebuild + 1 }));
}

/* ---------- 拉桿的連續調整：停頓或放開才重建（規格 F07） ---------- */

/** 會改變形狀的拉桿、數字欄連續調整時，停頓這麼久（ms）才重建 */
export const REBUILD_IDLE_MS = 200;
let liveUntil = 0;

/**
 * 拉桿、數字欄的連續調整（拖曳、鍵盤、打字）：設定照改（畫面上的數字跟著動），
 * 但預覽等停頓 REBUILD_IDLE_MS 或放開滑鼠（releaseRebuildHold）才重建，大圖時拖曳不會一步一卡。
 */
export function editLive(recipe: (d: Settings) => void): void {
  liveUntil = performance.now() + REBUILD_IDLE_MS;
  edit(recipe);
}

/** 預覽還要等多久才重建（ms；0＝不用等） */
export const rebuildHoldMs = (): number => Math.max(0, liveUntil - performance.now());

/** 放開滑鼠（拉桿拖完）：不必等停頓；回傳原本是不是在等 */
export function releaseRebuildHold(): boolean {
  const held = liveUntil > performance.now();
  liveUntil = 0;
  return held;
}

/** 等畫面跟上目前的設定（拉桿停頓、讀圖、組場景都做完）；signal 取消時丟 AbortError */
export function whenBuilt(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!useSession.getState().building) {
      resolve();
      return;
    }
    const onAbort = () => {
      stop();
      reject(new DOMException('已取消', 'AbortError'));
    };
    const unsub = useSession.subscribe((st) => {
      if (st.building) return;
      stop();
      resolve();
    });
    const stop = () => {
      unsub();
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
