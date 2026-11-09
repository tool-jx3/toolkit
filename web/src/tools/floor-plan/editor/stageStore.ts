/**
 * 演出的畫面狀態（2026-11-09，F313～F328）：只在這一頁（不存、不列入復原）。演出的資料（藏起來的房間、路線）在地圖裡
 * （`Project.stage`，useProject）；這裡是「現在是不是在演出」「用哪個工具」「出發地」「播放到幾秒」「暫時公開了哪些」。
 *
 * 播放到幾秒由下方的時間軸（StageDock 的 usePlayback）推進，寫進這裡給畫布（controller）與快捷鍵用。
 *
 * **用到時才載入**（D131）：這個檔在主程式裡（輕的：狀態、開關、工具）；演出的面板、時間軸、畫法、路線的計算在
 * `stageModule.ts`，第一次按「演出」時才載入（載入中編輯列的按鈕轉圈）。地圖裡有演出、沒有打開演出時不載入。
 */
import { create } from 'zustand';
import { S } from '../strings';
import { flushNudge, notify, updateHint } from './actions';
import { setEditor } from './store';

/** 打開演出時才載入的那一包（stageModule.ts；這裡只用型別，不會被打包進主程式） */
export type StageModule = typeof import('./stageModule');

export type StageTool = 'hide' | 'route' | 'hand';

/** 播放的控制（時間軸掛上來；沒有掛時 null） */
export interface StagePlayer {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** 跳到 t 秒（暫停） */
  seek: (t: number) => void;
  /** 播放下一步就停 */
  next: () => void;
  /** 跳到上一步完成的樣子 */
  prev: () => void;
  /** 回到開頭（回到準備的樣子） */
  rewind: () => void;
  /** 跳到第 k 步完成的樣子 */
  jump: (k: number) => void;
  /** 停下來回到 0 秒（不改演出的畫面的開關；stopPreview 用） */
  reset: () => void;
}

export interface StageUi {
  /** 演出（編輯列的「演出」） */
  on: boolean;
  tool: StageTool;
  /** 移動路線的出發地 */
  start: { floor: string; room: string } | null;
  /** 演出的畫面（PL 用、照時間軸；播放、看某一步、全部公開、暫時公開時） */
  preview: boolean;
  time: number;
  playing: boolean;
  /** 在演出的畫面點了暫時公開的房間（鍵）、樓層（id） */
  openRooms: string[];
  openFloors: string[];
  /** 全部公開（暫時） */
  revealAll: boolean;
  exportOpen: boolean;
  /** 時間軸收起來了 */
  dockClosed: boolean;
  player: StagePlayer | null;
  /** 演出的程式載入中、載入好了 */
  loading: boolean;
  ready: boolean;
}

export const useStage = create<StageUi>(() => ({
  on: false,
  tool: 'hide',
  start: null,
  preview: false,
  time: 0,
  playing: false,
  openRooms: [],
  openFloors: [],
  revealAll: false,
  exportOpen: false,
  dockClosed: false,
  player: null,
  loading: false,
  ready: false,
}));

export const setStage = (patch: Partial<StageUi>): void => useStage.setState(patch);

export const stageOn = (): boolean => useStage.getState().on;

let loaded: StageModule | null = null;
let pending: Promise<StageModule> | null = null;

/** 載入好的演出程式（還沒載入時 null） */
export const stageModule = (): StageModule | null => loaded;

/** React 用：載入好之後重畫 */
export function useStageModule(): StageModule | null {
  useStage((s) => s.ready);
  return loaded;
}

/** 載入演出的程式（只載入一次；失敗時下次再試） */
export function loadStage(): Promise<StageModule> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import('./stageModule').then(
    (m) => {
      m.install();
      loaded = m;
      setStage({ ready: true });
      return m;
    },
    (err: unknown) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}

/* ---------- 開關、工具 ---------- */

/** 演出的開關：打開時放下編輯的工具、清掉選取（程式要先載入好） */
export function setStageMode(on: boolean): void {
  if (useStage.getState().on === on || (on && !loaded)) return;
  flushNudge();
  if (on) setEditor({ sel: [], tool: 'select', armed: null });
  stopPreview();
  setStage({ on, start: null, exportOpen: false });
  updateHint(false);
}

/** 編輯列的「演出」：第一次打開時先載入程式（載入中按鈕轉圈；失敗時通知） */
export function toggleStage(): void {
  const st = useStage.getState();
  if (st.loading) return;
  if (st.on) {
    setStageMode(false);
    return;
  }
  if (loaded) {
    setStageMode(true);
    return;
  }
  setStage({ loading: true });
  loadStage().then(
    () => {
      setStage({ loading: false });
      setStageMode(true);
    },
    () => {
      setStage({ loading: false });
      notify(S.stageEntry.loadFailed, 'danger');
    },
  );
}

export function setStageTool(tool: StageTool): void {
  setStage({ tool, ...(tool !== 'route' ? { start: null } : {}) });
  updateHint(false);
}

export function clearStart(): void {
  setStage({ start: null });
}

/** 回到準備的樣子（播放、暫時公開都取消） */
export function stopPreview(): void {
  const s = useStage.getState();
  s.player?.reset();
  setStage({
    preview: false,
    time: 0,
    playing: false,
    openRooms: [],
    openFloors: [],
    revealAll: false,
  });
}
