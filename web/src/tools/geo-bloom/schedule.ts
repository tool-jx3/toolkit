/**
 * 預覽的排程（規格 F54）：只畫最新的一組設定。
 * - 正在畫的時候送來的設定先放著（只留最新的一組），畫完才接著畫；
 * - 正在畫的那一組超過 staleMs、而且有待畫的設定時，呼叫 cancel（結束 Worker）直接改畫新的。
 *   不論新設定是在 staleMs 之前還是之後送來：之前送來的用計時器等到 staleMs 再判斷
 *   （對等驗證 7.1：剛開始不到 1 秒就又改設定、之後不再改時，原本要等舊的畫完）。
 * - 被放棄的那一次，結果晚到也不理。
 * 純排程，不碰 Worker 與 DOM；時鐘與計時器可以換（測試用假時鐘）。
 */

export interface LatestRunnerOptions<S, R> {
  /** 畫一組設定 */
  run: (value: S) => Promise<R>;
  /** 放棄正在畫的那一次（例如結束 Worker；之後的 run 要能照常進行） */
  cancel: () => void;
  onResult: (result: R, value: S) => void;
  onError: (error: unknown) => void;
  /** 正在畫的超過這麼久（毫秒）又有待畫的設定時放棄它 */
  staleMs: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface LatestRunner<S> {
  /** 要求畫這組設定（還沒開始的要求作廢） */
  request(value: S): void;
  /** 結束：放棄正在畫的、之後的要求都不理 */
  dispose(): void;
}

export function createLatestRunner<S, R>({
  run,
  cancel,
  onResult,
  onError,
  staleMs,
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}: LatestRunnerOptions<S, R>): LatestRunner<S> {
  let running: { started: number } | null = null;
  let pending: { value: S } | null = null;
  /** 放棄一次就加 1：舊的回覆一律不理 */
  let generation = 0;
  let timer: unknown = null;
  let disposed = false;

  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const abandon = () => {
    stopTimer();
    cancel();
    running = null;
    generation++;
  };

  /* 有待畫的設定時：正在畫的已經太久就放棄它，否則等到太久的那一刻再看一次 */
  const watch = () => {
    stopTimer();
    if (!running || !pending) return;
    const left = running.started + staleMs - now();
    if (left <= 0) {
      abandon();
      pump();
      return;
    }
    timer = setTimer(() => {
      timer = null;
      watch();
    }, left);
  };

  const pump = () => {
    if (disposed || running || !pending) return;
    const { value } = pending;
    pending = null;
    const gen = generation;
    running = { started: now() };
    let p: Promise<R>;
    try {
      p = run(value);
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      (r) => {
        if (gen === generation && !disposed) onResult(r, value);
      },
      (e) => {
        if (gen === generation && !disposed) onError(e);
      },
    ).finally(() => {
      if (gen !== generation) return;
      running = null;
      stopTimer();
      pump();
    });
  };

  return {
    request(value) {
      if (disposed) return;
      pending = { value };
      if (running) watch();
      else pump();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = null;
      abandon();
    },
  };
}
