/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 磁鐵排列的模擬迴圈（原作的 simStep）：開著時每格走一步力導向（在 live 的工作副本上，畫面走快速路徑）；
 * 拖曳中 α 至少 0.3；平均移動 < 0.3 px 連續 24 格或 α < 0.02 時停下：解開重疊（separateAll）、寫回專案、整張重畫，
 * 整段記成一步復原。中途關掉（stopSim）＝就地停住，不解開重疊。
 * 第二批：標籤網開著或有「陣營框＋引力」的標籤時，標籤也參與（位置在工作副本的 labelPos）；拖著的標籤不動。
 */
import { forceStep, labelsInForce, SIM, type Velocities } from '../logic/force';
import { separateAll } from '../logic/layout';
import {
  activeSheet,
  holdHistory,
  projectNow,
  releaseHistory,
  setUi,
  useProject,
  useUi,
} from '../state/store';
import { beginLive, endLive, liveCtx, liveFrame, liveSheet } from './live';

let raf = 0;
/** 模擬中的分頁（換了分頁就停） */
let simSheet: number | null = null;
let alpha = 0;
let calm = 0;
const vel: Velocities = new Map();
/** 拖曳中的角色（模擬不動它） */
let pinned: ReadonlySet<number> = new Set();
/** 拖曳中的標籤 */
let pinnedLbl: number | null = null;

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

/** 掛在編輯畫面上：同一張分頁的角色數或關係數變了、標籤的引力與陣營框改了就加溫 */
export function watchReheat(): () => void {
  const keyOf = () => {
    const s = activeSheet();
    const lbl = projectNow()
      .labels.map((l) => `${l.id}${l.zone ? 'z' : ''}${l.noPull ? 'n' : ''}${l.hidden ? 'h' : ''}`)
      .join(',');
    return {
      id: s.id,
      n: `${s.chars.length}:${s.rels.length}:${s.settings.showLabelNodes ? 1 : 0}:${lbl}`,
    };
  };
  let prev = keyOf();
  return useProject.subscribe(() => {
    const k = keyOf();
    const changed = k.id === prev.id && k.n !== prev.n;
    prev = k;
    if (changed && !muted && activeSheet().settings.snapMode) kickSim(0.7);
  });
}

export function setSimPinned(ids: ReadonlySet<number>, lbl: number | null = null): void {
  pinned = ids;
  pinnedLbl = lbl;
  if (ids.size || lbl !== null) alpha = Math.max(alpha, SIM.dragAlpha);
}

/** 停下（中途關掉、復原、換分頁）：就地停住 */
export function stopSim(): void {
  finish(false);
}

function finish(settle: boolean): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  simSheet = null;
  alpha = 0;
  calm = 0;
  vel.clear();
  if (settle) {
    const s = liveSheet();
    if (s) separateAll(liveCtx(s));
  }
  endLive('sim');
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
  const cur = activeSheet();
  if (
    !cur.settings.snapMode ||
    (cur.chars.length < 2 && !labelsInForce(liveCtx(cur))) ||
    (simSheet !== null && simSheet !== cur.id)
  ) {
    stopSim();
    return;
  }
  simSheet = cur.id;
  holdHistory('sim');
  const s = beginLive('sim');
  const moved = forceStep(liveCtx(s), vel, alpha, pinned, pinnedLbl);
  liveFrame(Number.POSITIVE_INFINITY);
  alpha *= SIM.decay;
  const dragging = pinned.size > 0 || pinnedLbl !== null;
  if (dragging) alpha = Math.max(alpha, SIM.dragAlpha);
  const avg = moved / Math.max(1, s.chars.length);
  calm = !dragging && avg < SIM.calmMove ? calm + 1 : 0;
  if (dragging || (alpha >= SIM.minAlpha && calm < SIM.calmFrames)) {
    raf = requestAnimationFrame(frame);
    return;
  }
  /* 靜下來：解開重疊、寫回、一步復原（原作 simStep 的入睡） */
  finish(true);
}
