/**
 * 卡片圖片的延遲載入：卡片捲到看得到的地方（上下各多 300 px）才畫。
 * 素材面板的家具圖示（規格 D50、7.16）與範本對話框的縮圖（D55、7.18）共用這一套。
 *
 * - `IntersectionObserver` 的 `root` 要指定成捲動容器（素材面板、對話框的捲動區；往上找最近的會捲動的祖先）：
 *   沒指定時觀察範圍是整個畫面、又會被捲動容器裁掉，「多 300 px」完全沒作用，捲動時新出現的圖會先空白幾幀。
 * - 同一個捲動容器的卡片共用一個觀察器（381 張卡片不各開一個）。
 * - 在畫面內的圖馬上畫；只是預先畫的（範圍外 300 px 內）排隊，每個 frame 只花一小段時間（離畫面近的先畫），
 *   清空搜尋、跳著捲動時不會一次卡住主執行緒。
 * - 一張要畫很久的（範本縮圖，每張幾十 ms）傳 `{ paced: true }`：在畫面內的也不在通知裡一次全畫，
 *   一樣排隊、看得到的排最前面，一個 frame 只畫到時間上限（至少一張），畫的中間讓出主執行緒給輸入與繪製。
 */

/** 預先畫的範圍：捲動容器上下各多這麼多 px */
export const LAZY_MARGIN_PX = 300;
/** 預先畫的圖示每個 frame 最多花的時間（ms）；在畫面內的不受限 */
export const FRAME_BUDGET_MS = 6;

interface Job {
  el: Element;
  draw: () => void;
  /** 畫很久：在畫面內的也受每個 frame 的時間上限限制 */
  paced: boolean;
}

export interface LazyOptions {
  /** 一張要畫很久（幾十 ms，例如範本縮圖）：在畫面內的也排隊、一個 frame 只畫到時間上限（預設 false：在畫面內的馬上畫） */
  paced?: boolean;
}

interface Group {
  io: IntersectionObserver;
  jobs: Map<Element, Job>;
}

const groups = new Map<Element | null, Group>();
let queue: Job[] = [];
let frame = 0;

/** 問過的祖先（卡片的父層，和往上走過的每一層）的答案只問一次 */
const rootOfParent = new WeakMap<Element, Element | null>();

/** 最近的、會捲動的祖先（素材面板、對話框的捲動區）；沒有就是 null（用整個畫面） */
export function scrollParent(el: Element): Element | null {
  if (typeof getComputedStyle === 'undefined') return null;
  const parent = el.parentElement;
  if (!parent) return null;
  if (rootOfParent.has(parent)) return rootOfParent.get(parent) ?? null;
  let found: Element | null = null;
  const walked: Element[] = [];
  for (let p: Element | null = parent; p; p = p.parentElement) {
    /* 走過的祖先也記下來：範本縮圖每張的父層都不同，但上面幾層是同一批 */
    if (rootOfParent.has(p)) {
      found = rootOfParent.get(p) ?? null;
      break;
    }
    walked.push(p);
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll' || o === 'overlay') {
      found = p;
      break;
    }
  }
  for (const p of walked) rootOfParent.set(p, found);
  return found;
}

const viewRect = (root: Element | null): { top: number; bottom: number } => {
  if (root) {
    const r = root.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  }
  return { top: 0, bottom: typeof innerHeight === 'number' ? innerHeight : 0 };
};

/** 圖離畫面（捲動容器的可見範圍）有多遠（0＝在畫面內）、在畫面上的位置 */
const place = (
  el: Element,
  v: { top: number; bottom: number },
): { gap: number; top: number; left: number } => {
  const r = el.getBoundingClientRect();
  return { gap: Math.max(0, v.top - r.bottom, r.top - v.bottom), top: r.top, left: r.left };
};
const gap = (el: Element, v: { top: number; bottom: number }): number => place(el, v).gap;

function flush(): void {
  frame = 0;
  const t0 = performance.now();
  /* 離畫面近的先畫（一樣近的由上而下、由左而右）；已經不在文件裡的（卡片被搜尋濾掉）略過 */
  const live = queue.filter((j) => j.el.isConnected);
  const views = new Map<Element | null, { top: number; bottom: number }>();
  const where = new Map<Job, { gap: number; top: number; left: number }>();
  for (const j of live) {
    const root = scrollParent(j.el);
    let v = views.get(root);
    if (!v) {
      v = viewRect(root);
      views.set(root, v);
    }
    where.set(j, place(j.el, v));
  }
  const at = (j: Job) => where.get(j) ?? { gap: 0, top: 0, left: 0 };
  live.sort((a, b) => {
    const pa = at(a);
    const pb = at(b);
    return pa.gap - pb.gap || pa.top - pb.top || pa.left - pb.left;
  });
  let i = 0;
  for (; i < live.length; i++) {
    /* 至少畫一個，其餘看時間；在畫面內的一定畫（畫很久的 paced 除外：也看時間） */
    const limited = live[i].paced || at(live[i]).gap > 0;
    if (i > 0 && limited && performance.now() - t0 > FRAME_BUDGET_MS) break;
    live[i].draw();
  }
  queue = live.slice(i);
  if (queue.length) frame = requestAnimationFrame(flush);
}

function enqueue(job: Job): void {
  queue.push(job);
  if (!frame) frame = requestAnimationFrame(flush);
}

/**
 * 圖捲到看得到（含上下 300 px）時呼叫 `draw`（只呼叫一次）。回傳取消的函式。
 * 沒有 IntersectionObserver 的環境馬上畫。
 */
export function lazyDraw(el: HTMLElement, draw: () => void, opts: LazyOptions = {}): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    draw();
    return () => {};
  }
  const root = scrollParent(el);
  let g = groups.get(root);
  if (!g) {
    const jobs = new Map<Element, Job>();
    const io = new IntersectionObserver(
      (entries) => {
        const v = viewRect(root);
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const job = jobs.get(e.target);
          if (!job) continue;
          jobs.delete(e.target);
          io.unobserve(e.target);
          if (!job.paced && gap(e.target, v) === 0) job.draw();
          else enqueue(job);
        }
        if (!jobs.size && groups.get(root)?.io === io) {
          io.disconnect();
          groups.delete(root);
        }
      },
      { root, rootMargin: `${LAZY_MARGIN_PX}px 0px` },
    );
    g = { io, jobs };
    groups.set(root, g);
  }
  const job: Job = { el, draw, paced: opts.paced === true };
  g.jobs.set(el, job);
  g.io.observe(el);
  const group = g;
  return () => {
    group.jobs.delete(el);
    group.io.unobserve(el);
    queue = queue.filter((j) => j !== job);
    if (!group.jobs.size && groups.get(root) === group) {
      group.io.disconnect();
      groups.delete(root);
    }
  };
}

/** 測試用：目前有幾個觀察器、幾張排隊中的 */
export const lazyStats = () => ({ observers: groups.size, queued: queue.length });
