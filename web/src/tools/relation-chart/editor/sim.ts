/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 磁鐵排列的模擬迴圈（原作的 simStep）：開著時每格走一步力導向；拖曳中 α 至少 0.3；
 * 平均移動 < 0.3 px 連續 24 格或 α < 0.02 時停止，整段記成一步復原。
 */
import { sheetCtx } from '../engine/geom';
import { forceStep, SIM, type Velocities } from '../logic/force';
import type { Sheet } from '../model/types';
import { activeSheet, holdHistory, releaseHistory, setUi, useProject, useUi } from '../state/store';

let raf = 0;
let alpha = 0;
let calm = 0;
const vel: Velocities = new Map();
/** 拖曳中的角色（模擬不動它） */
let pinned: ReadonlySet<number> = new Set();

/* 角色或關係增減時磁鐵重新起動（原作的 simReheat）；復原／重做時不要（會蓋掉重做的紀錄） */
let muted = false;
export function withoutReheat(fn: () => void): void {
  muted = true;
  try {
    fn();
  } finally {
    muted = false;
  }
}

/** 掛在編輯畫面上：同一張分頁的角色數或關係數變了就加溫 */
export function watchReheat(): () => void {
  const keyOf = () => {
    const s = activeSheet();
    return { id: s.id, n: `${s.chars.length}:${s.rels.length}` };
  };
  let prev = keyOf();
  return useProject.subscribe(() => {
    const k = keyOf();
    const changed = k.id === prev.id && k.n !== prev.n;
    prev = k;
    if (changed && !muted && activeSheet().settings.snapMode) kickSim(0.7);
  });
}

export function setSimPinned(ids: ReadonlySet<number>): void {
  pinned = ids;
  if (ids.size) alpha = Math.max(alpha, SIM.dragAlpha);
}

export function stopSim(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  alpha = 0;
  calm = 0;
  vel.clear();
  releaseHistory('sim');
  if (useUi.getState().simRunning) setUi({ simRunning: false });
}

/** 開始（或加溫）模擬 */
export function kickSim(a = 1): void {
  if (!activeSheet().settings.snapMode || typeof requestAnimationFrame === 'undefined') return;
  alpha = Math.max(alpha, a);
  calm = 0;
  if (raf) return;
  if (!useUi.getState().simRunning) setUi({ simRunning: true });
  raf = requestAnimationFrame(frame);
}

function frame(): void {
  raf = 0;
  const s = activeSheet();
  if (!s.settings.snapMode || s.chars.length < 2) {
    stopSim();
    return;
  }
  holdHistory('sim');
  let moved = 0;
  useProject.getState().update((p) => {
    const sh = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    moved = forceStep(sheetCtx(sh as Sheet), vel, alpha, pinned);
  });
  alpha *= SIM.decay;
  if (pinned.size) alpha = Math.max(alpha, SIM.dragAlpha);
  const avg = moved / Math.max(1, s.chars.length);
  calm = avg < SIM.calmMove ? calm + 1 : 0;
  if (!pinned.size && (calm >= SIM.calmFrames || alpha < SIM.minAlpha)) {
    stopSim();
    return;
  }
  raf = requestAnimationFrame(frame);
}
