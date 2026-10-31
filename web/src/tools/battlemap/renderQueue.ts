/**
 * 大地圖的繪製排程：Worker 一次只畫一張，畫的途中又換了設定時**只保留最新的一筆**——
 * 待送的那一筆被新的覆蓋，正在畫的那一張回來之後才送最新的；回來的結果已經不是目前要的就丟掉。
 * 所以連點、按住 ↑ 時最多等「正在畫的那一張＋最新的一張」，不會一張一張排隊畫完（規格 F42，2026-10-30 驗證後修訂）。
 *
 * 不依賴 React 與 DOM（Worker 與「之後再畫」由外面給），方便單元測試。
 */
import type { MapPixels, MapRequest, RenderedMap } from './mapRenderer';

export interface DrawWorker {
  draw(request: MapRequest): Promise<MapPixels>;
  terminate(): void;
}

export interface Job {
  key: string;
  request: MapRequest;
}

export interface RenderQueueOptions {
  /** 開一個 Worker；開不了時 null（改在主執行緒畫） */
  spawn: () => DrawWorker | null;
  /** 主執行緒畫（Worker 開不了或壞掉時） */
  drawHere: (request: MapRequest) => RenderedMap;
  /** 稍後執行（讓畫面先顯示「正在產生」）；主執行緒畫的時候用 */
  later: (fn: () => void) => void;
  /** 目前要的大地圖的 key（不是大地圖時 null） */
  wanted: () => string | null;
  /** 畫好（或畫不出來） */
  onResult: (key: string, map: RenderedMap | null, error: string | null) => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class RenderQueue {
  private readonly o: RenderQueueOptions;
  /** undefined＝還沒開；null＝開不了，改在主執行緒 */
  private worker: DrawWorker | null | undefined = undefined;
  /** 每次關掉就換一代，舊一代的 Worker 回來的東西一律不理 */
  private generation = 0;
  private busy = false;
  private next: Job | null = null;
  private lastDone: string | null = null;
  /** 統計（測試與量測用）：送進 Worker 幾次、畫好但已經過期而丟掉幾次 */
  readonly stats = { sent: 0, dropped: 0 };

  constructor(options: RenderQueueOptions) {
    this.o = options;
  }

  /** 要畫這一張（已經畫好、正在顯示的就不再畫） */
  request(job: Job): void {
    if (job.key === this.lastDone) {
      /* 換回正在顯示的那一張：等著送的那一筆也不要了 */
      this.next = null;
      return;
    }
    if (this.busy) {
      this.next = job;
      return;
    }
    if (this.worker === undefined) this.worker = this.o.spawn();
    const w = this.worker;
    if (!w) {
      this.drawLater(job);
      return;
    }
    const gen = this.generation;
    this.busy = true;
    this.stats.sent++;
    w.draw(job.request)
      .then(
        (out) => {
          if (gen === this.generation) this.deliver(job, { ...out, request: job.request }, null);
        },
        (e: unknown) => {
          if (gen !== this.generation) return;
          if (e instanceof Error && e.name === 'WorkerFailedError') {
            /* Worker 本身壞了（載不到等）：之後都在主執行緒畫 */
            this.worker = null;
            this.drawLater(job);
          } else this.deliver(job, null, errorText(e));
        },
      )
      .finally(() => {
        if (gen !== this.generation) return;
        this.busy = false;
        const n = this.next;
        this.next = null;
        /* 待送的那一筆還是目前要的才送 */
        if (n && n.key === this.o.wanted()) this.request(n);
      });
  }

  /** 結束 Worker（元件卸載時）；之後再要求會開新的 */
  close(): void {
    this.generation++;
    this.worker?.terminate();
    this.worker = undefined;
    this.busy = false;
    this.next = null;
    this.lastDone = null;
  }

  private deliver(job: Job, map: RenderedMap | null, error: string | null): void {
    if (job.key !== this.o.wanted()) {
      this.stats.dropped++;
      return;
    }
    this.lastDone = map ? job.key : null;
    this.o.onResult(job.key, map, error);
  }

  private drawLater(job: Job): void {
    const gen = this.generation;
    this.o.later(() => {
      /* 等的這段時間又換了設定：這一張不用畫了（新的那一筆自己會排） */
      if (gen !== this.generation || job.key !== this.o.wanted()) return;
      try {
        this.deliver(job, this.o.drawHere(job.request), null);
      } catch (e) {
        this.deliver(job, null, errorText(e));
      }
    });
  }
}
