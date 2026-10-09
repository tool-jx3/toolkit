/**
 * 遊戲的流程（規格 1.6）：開始 → 抽選（演出）→ 揭曉 → 選名次（再確認）→ 確定 → 下一位 … → 完成。
 * 出場順序在開始時就決定並存好，抽選的演出只是畫面：重新整理時直接揭曉同一位，不能重抽。
 */
import {
  AUTO_NEXT_MS,
  beginSpin,
  type ChooseResult,
  type Config,
  chooseRank,
  commitRank,
  cryptoRng,
  type Rng,
  type Run,
  randomInt,
  revealSpin,
  type StartProblem,
  spinInterval,
  spinPool,
  startProblem,
  startRun,
} from './model';
import { configNow, runNow, setRun, useSession } from './store';

let rng: Rng = cryptoRng;
/** 測試用：換掉亂數來源 */
export const setRng = (r: Rng | null): void => {
  rng = r ?? cryptoRng;
};

let token = 0;
let frame = 0;
let nextTimer: ReturnType<typeof setTimeout> | undefined;

/** 停掉進行中的抽選演出與自動抽下一位 */
export function stopAnimation(): void {
  token++;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  clearTimeout(nextTimer);
  nextTimer = undefined;
  if (useSession.getState().spinId !== null) useSession.setState({ spinId: null });
}

/** 開始：檢查設定 → 洗牌決定出場順序 → 抽第一位。有問題時回傳原因（不開始） */
export function startGame(narrow = false): StartProblem | null {
  if (runNow()) return null;
  const c = configNow();
  const problem = startProblem(c);
  if (problem) return problem;
  stopAnimation();
  useSession.setState({ placing: false, ...(narrow ? { focus: true } : {}) });
  setRun(startRun(c, rng));
  drawNext();
  return null;
}

/** 抽下一位（between 時）：演出 spinMs 毫秒後揭曉 */
export function drawNext(): void {
  const run = runNow();
  if (!run) return;
  const next = beginSpin(run);
  if (!next) return;
  clearTimeout(nextTimer);
  const c = configNow();
  const pool = spinPool(c, next);
  const my = ++token;
  useSession.setState({
    spinId: c.reducedMotion || !pool.length ? null : pool[randomInt(pool.length, rng)].id,
  });
  /* 先存好（出場順序早就決定了），再開始演出 */
  setRun(next);
  animate(my, next, c, pool);
}

function animate(my: number, run: Run, c: Config, pool: ReturnType<typeof spinPool>): void {
  const start = performance.now();
  const duration = c.spinMs;
  let lastSwap = Number.NEGATIVE_INFINITY;
  let lastId = useSession.getState().spinId;
  const tick = (now: number) => {
    if (my !== token || runNow() !== run) return;
    const elapsed = now - start;
    const t = Math.min(1, Math.max(0, elapsed / duration));
    if (t >= 1) {
      frame = 0;
      useSession.setState({ spinId: null });
      setRun(revealSpin(run));
      return;
    }
    if (!c.reducedMotion && pool.length && elapsed - lastSwap > spinInterval(t)) {
      let i = randomInt(pool.length, rng);
      if (pool.length > 1 && pool[i].id === lastId) i = (i + 1) % pool.length;
      lastId = pool[i].id;
      lastSwap = elapsed;
      useSession.setState({ spinId: lastId });
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

/** 確定之後：還有下一位、又開了「自動抽下一位」時 0.8 秒後自動抽 */
function afterCommit(run: Run): void {
  if (run.phase !== 'between' || !configNow().autoNext) return;
  const my = token;
  clearTimeout(nextTimer);
  nextTimer = setTimeout(() => {
    if (my === token && runNow() === run) drawNext();
  }, AUTO_NEXT_MS);
}

/** 選名次（點排行榜上的空格或名次按鈕）；回傳結果讓畫面決定要不要提醒 */
export function pickRank(index: number): ChooseResult['kind'] {
  const run = runNow();
  if (!run) return 'ignored';
  const r = chooseRank(run, index, configNow().confirmRank);
  if (r.kind === 'pending' || r.kind === 'commit') setRun(r.run);
  if (r.kind === 'commit') afterCommit(r.run);
  return r.kind;
}

/** 確定選好的名次 */
export function commitPending(): boolean {
  const run = runNow();
  if (!run) return false;
  const next = commitRank(run);
  if (!next) return false;
  setRun(next);
  afterCommit(next);
  return true;
}

/** 回到設定（清掉這一局） */
export function endGame(): void {
  stopAnimation();
  setRun(null);
  useSession.setState({ placing: false, focus: false });
}

/** 同樣設定再玩一次 */
export function restartGame(narrow = false): StartProblem | null {
  stopAnimation();
  setRun(null);
  return startGame(narrow);
}
