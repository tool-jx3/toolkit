/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 時間軸分頁的動作（F028；原作的 convertToTimeline、switchFrame、addFrame、duplicateFrameAt、deleteFrame、moveFrame、
 * tlToggleKey、tlSetLane、播放速度、影格播放時間）。資料的增刪改在 model/timeline.ts。
 * 切影格是檢視狀態：不記一步、不清空復原紀錄；其他每個動作一步復原（7.4 第 3 項；原作的速度、秒數、眼睛、鎖不進復原）。
 * 唯讀瀏覽時只能切影格與播放（7.4 第 10 項）。
 */
import type { Draft } from 'immer';
import {
  addFrame,
  clampDur,
  copyFrame,
  deleteFrame,
  fromTimeline,
  loadActive,
  moveFrame,
  nextSpeed,
  storeActive,
  toggleKey,
  toTimeline,
} from '../model/timeline';
import type { Sheet, TlLane } from '../model/types';
import { dropCharsFrom } from './actions';
import {
  activeSheet,
  setUi,
  syncProject,
  untracked,
  updateProject,
  useProject,
  useUi,
} from './store';

type DSheet = Draft<Sheet>;

const ro = (): boolean => useUi.getState().readonly;

/** 改目前分頁的時間軸（一般分頁或唯讀＝不動） */
function editTl(recipe: (s: Sheet, take: () => number) => void): void {
  if (ro() || !activeSheet().tl) return;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    if (s?.tl) recipe(s as Sheet, () => p.nextId++);
  });
}

/** 切影格、改影格時：結束建立關係、取消選取、關掉角色／關係／便利貼的面板（原作 switchFrame），回到編輯 */
function leaveFrame(): void {
  const u = useUi.getState();
  const keep =
    u.panel && (u.panel.kind === 'lore' || u.panel.kind === 'memo' || u.panel.kind === 'stats');
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    panel: keep ? u.panel : null,
    noteEdit: null,
    swap: u.swap ? { pick: null } : null,
    tlPos: null,
    tlPlaying: false,
  });
}

/** 編輯 › 時間軸分頁：一般 → 時間軸（現有內容成為第 1 格） */
export function convertToTimeline(): void {
  if (ro() || activeSheet().tl) return;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    if (s && !s.tl) toTimeline(s as Sheet, p.nextId++);
  });
  leaveFrame();
}

/** 時間軸 → 一般：只留目前這一格（只在其他影格出現的角色的群體關係、看法一起清） */
export function convertFromTimeline(): void {
  if (ro() || !activeSheet().tl) return;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    if (!s?.tl) return;
    const gone = fromTimeline(s as Sheet);
    if (gone.size) dropCharsFrom(s as DSheet, gone);
  });
  leaveFrame();
}

/** 切到第 k 格編輯（不記一步；拖曳、磁鐵還在動的位置先放回專案） */
export function switchFrame(k: number): void {
  const s = activeSheet();
  const tl = s.tl;
  if (!tl || k < 0 || k >= tl.frames.length) return;
  if (k === tl.active) {
    if (useUi.getState().tlPos !== null) setUi({ tlPos: null, tlPlaying: false });
    return;
  }
  syncProject();
  untracked(() =>
    useProject.getState().update((p) => {
      const d = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
      if (!d?.tl) return;
      storeActive(d as Sheet);
      loadActive(d as Sheet, k);
    }),
  );
  leaveFrame();
}

/** 新增影格（延續上一格）：插在目前影格後面、全部保持，切過去 */
export function addFrameAfter(): void {
  editTl((s, take) => addFrame(s, take()));
  leaveFrame();
}

/** 複製第 k 格（插在後面、全部關鍵影格），切過去 */
export function copyFrameAt(k: number): void {
  editTl((s, take) => copyFrame(s, k, take()));
  leaveFrame();
}

/** 刪除第 k 格（只剩 1 格時不動；回傳有沒有刪） */
export function deleteFrameAt(k: number): boolean {
  const tl = activeSheet().tl;
  if (ro() || !tl || tl.frames.length <= 1 || !tl.frames[k]) return false;
  editTl((s) => {
    deleteFrame(s, k);
  });
  leaveFrame();
  return true;
}

/** 拖曳影格換位置（放開記一步） */
export function moveFrameTo(from: number, to: number): void {
  editTl((s) => {
    moveFrame(s, from, to);
  });
}

/** 點格子：保持 ↔ 關鍵影格（第 1 格、鎖住的軌道不動） */
export function toggleFrameKey(k: number, lane: TlLane): void {
  const tl = activeSheet().tl;
  if (!tl || k <= 0 || tl.locked.includes(lane)) return;
  editTl((s) => {
    toggleKey(s, k, lane);
  });
}

/** 影格播放時間（null＝自動） */
export function setFrameDur(k: number, dur: number | null): void {
  const v = clampDur(dur);
  const f = activeSheet().tl?.frames[k];
  if (!f || f.dur === v) return;
  editTl((s) => {
    const d = s.tl?.frames[k];
    if (d) d.dur = v;
  });
}

/** 速度鈕：換下一檔 */
export function cycleTlSpeed(): void {
  editTl((s) => {
    if (s.tl) s.tl.speed = nextSpeed(s.tl.speed);
  });
}

/** 圖層的眼睛（hidden）與鎖（locked） */
export function setTlLane(kind: 'hidden' | 'locked', lane: TlLane, on: boolean): void {
  editTl((s) => {
    const tl = s.tl;
    if (!tl) return;
    const has = tl[kind].includes(lane);
    if (on && !has) tl[kind] = [...tl[kind], lane];
    else if (!on && has) tl[kind] = tl[kind].filter((l) => l !== lane);
  });
}

/** 預覽位置（null＝回到編輯）；拖桿與播放用 */
export function setTlPos(p: number | null, playing = false): void {
  const tl = activeSheet().tl;
  if (!tl || tl.frames.length < 2 || p === null) {
    setUi({ tlPos: null, tlPlaying: false });
    return;
  }
  const u = useUi.getState();
  const patch: Parameters<typeof setUi>[0] = {
    tlPos: Math.min(tl.frames.length - 1, Math.max(0, p)),
    tlPlaying: playing,
  };
  /* 進入預覽：結束建立關係、取消選取（原作 playTween） */
  if (u.tlPos === null) Object.assign(patch, { sel: [], link: null, hover: null, noteEdit: null });
  setUi(patch);
}
