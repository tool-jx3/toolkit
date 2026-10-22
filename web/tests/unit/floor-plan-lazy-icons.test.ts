// @vitest-environment jsdom
/**
 * 室內平面圖產生器：素材面板圖示的延遲載入（規格 D50、7.16）。
 * - `IntersectionObserver` 的 root 是捲動容器（面板），rootMargin 上下 300 px；
 * - 同一個容器的卡片共用一個觀察器；
 * - 在畫面內的馬上畫、預先畫的排隊分批（離畫面近的先畫）；
 * - 取消後不畫、觀察器收掉；沒有 IntersectionObserver 時直接畫；
 * - 畫好的家具圖示有快取（再掛上時貼上去、不重畫）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawAssetIcon } from '@/tools/floor-plan/draw/icons';
import {
  FRAME_BUDGET_MS,
  LAZY_MARGIN_PX,
  lazyDraw,
  lazyStats,
  scrollParent,
} from '@/tools/floor-plan/editor/lazyIcons';

/** 每個測試結束都取消（模組的觀察器登記表是全域的） */
const cancels: (() => void)[] = [];
const lazy = (el: HTMLElement, draw: () => void) => {
  const off = lazyDraw(el, draw);
  cancels.push(off);
  return off;
};

/* ---------- 可控制的假 IntersectionObserver ---------- */

interface FakeIO {
  root: Element | null;
  rootMargin: string;
  targets: Set<Element>;
  disconnected: boolean;
  cb: IntersectionObserverCallback;
}
let ios: FakeIO[] = [];
const OriginalIO = globalThis.IntersectionObserver;

function installFakeIO() {
  ios = [];
  class Fake {
    private rec: FakeIO;
    constructor(cb: IntersectionObserverCallback, opts: IntersectionObserverInit = {}) {
      this.rec = {
        root: (opts.root as Element | null) ?? null,
        rootMargin: opts.rootMargin ?? '0px',
        targets: new Set(),
        disconnected: false,
        cb,
      };
      ios.push(this.rec);
    }
    observe(el: Element) {
      this.rec.targets.add(el);
    }
    unobserve(el: Element) {
      this.rec.targets.delete(el);
    }
    disconnect() {
      this.rec.disconnected = true;
      this.rec.targets.clear();
    }
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver = Fake as unknown as typeof IntersectionObserver;
}

const fire = (io: FakeIO, els: Element[]) =>
  io.cb(
    els.map((target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry),
    io as unknown as IntersectionObserver,
  );

/** 假的版面：面板 0～300 px；卡片的 top 由 data-top 決定（高 40） */
function layout(panel: HTMLElement, cards: HTMLElement[]) {
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 300,
    left: 0,
    right: 200,
    width: 200,
    height: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  for (const c of cards) {
    const top = Number(c.dataset.top);
    vi.spyOn(c, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom: top + 40,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
  }
}

function setup(tops: number[]) {
  const panel = document.createElement('div');
  panel.style.overflowY = 'auto';
  document.body.append(panel);
  const cards = tops.map((t) => {
    const c = document.createElement('canvas');
    c.dataset.top = String(t);
    panel.append(c);
    return c;
  });
  layout(panel, cards);
  return { panel, cards };
}

/* requestAnimationFrame 與時間：手動推進 */
let rafs: FrameRequestCallback[] = [];
let now = 0;
const runFrame = () => {
  const list = rafs;
  rafs = [];
  for (const f of list) f(now);
};

beforeEach(() => {
  installFakeIO();
  rafs = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => rafs.push(f));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  for (const off of cancels.splice(0)) off();
  globalThis.IntersectionObserver = OriginalIO;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('圖示延遲載入（D50、7.16）', () => {
  it('觀察範圍是捲動容器（面板），上下各多 300 px', () => {
    const { panel, cards } = setup([0, 50]);
    expect(scrollParent(cards[0])).toBe(panel);
    for (const c of cards) lazy(c, () => {});
    expect(ios.length).toBe(1);
    expect(ios[0].root).toBe(panel);
    expect(ios[0].rootMargin).toBe(`${LAZY_MARGIN_PX}px 0px`);
    expect(LAZY_MARGIN_PX).toBe(300);
  });

  it('每張卡片的父層不同（範本縮圖）：往上走過的祖先記下來，不是每張都從頭問一次', () => {
    const panel = document.createElement('div');
    panel.style.overflowY = 'auto';
    document.body.append(panel);
    const spy = vi.spyOn(window, 'getComputedStyle');
    const cards = Array.from({ length: 10 }, () => {
      const wrap = document.createElement('div');
      const card = document.createElement('span');
      wrap.append(card);
      panel.append(wrap);
      return card;
    });
    for (const c of cards) expect(scrollParent(c)).toBe(panel);
    /* 每張只問自己的父層一次（10 次），面板的答案共用（1 次） */
    expect(spy.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it('沒有捲動的祖先時 root 是 null（整個畫面）', () => {
    const c = document.createElement('canvas');
    document.body.append(c);
    expect(scrollParent(c)).toBeNull();
    const off = lazy(c, () => {});
    expect(ios[0].root).toBeNull();
    off();
  });

  it('同一個容器的卡片共用一個觀察器（381 張只有一個）', () => {
    const { cards: first } = setup(Array.from({ length: 40 }, (_, i) => i * 40));
    for (const c of first) lazy(c, () => {});
    expect(ios.length).toBe(1);
    expect(ios[0].targets.size).toBe(40);
    /* 另一個容器各自一個 */
    const b = setup([0]);
    lazy(b.cards[0], () => {});
    expect(ios.length).toBe(2);
    expect(lazyStats().observers).toBe(2);
  });

  it('在畫面內的馬上畫（同一個通知裡）；只畫一次、畫完就不再觀察', () => {
    const { cards } = setup([0, 100, 250]);
    const drawn: number[] = [];
    for (const [i, c] of cards.entries()) lazy(c, () => drawn.push(i));
    fire(ios[0], [cards[0], cards[1], cards[2]]);
    expect(drawn).toEqual([0, 1, 2]);
    expect(lazyStats().queued).toBe(0);
    fire(ios[0], [cards[0]]);
    expect(drawn).toEqual([0, 1, 2]);
  });

  it('預先畫的（在畫面外 300 px 內）排隊：先畫離畫面近的，每個 frame 只花一小段時間', () => {
    /* 面板 0～300：card 0 在畫面內；其餘在下面 320、400、500、600（畫面外） */
    const { cards } = setup([100, 600, 320, 500, 400]);
    const order: number[] = [];
    for (const [i, c] of cards.entries())
      lazy(c, () => {
        order.push(i);
        now += FRAME_BUDGET_MS / 2 + 0.5; /* 每張花 3.5 ms（預算 6 ms） */
      });
    fire(ios[0], cards);
    /* 畫面內的馬上畫 */
    expect(order).toEqual([0]);
    expect(lazyStats().queued).toBe(4);
    /* 下一個 frame：離畫面近的先畫（320→400→500→600）；超過預算就留到下一個 frame */
    runFrame();
    expect(order.slice(1)).toEqual([2, 4]);
    expect(lazyStats().queued).toBe(2);
    runFrame();
    expect(order.slice(1)).toEqual([2, 4, 3, 1]);
    expect(lazyStats().queued).toBe(0);
    expect(rafs.length).toBe(0);
  });

  it('排隊期間卡片被濾掉（離開文件）就不畫', () => {
    const { cards } = setup([400, 450]);
    const drawn: number[] = [];
    for (const [i, c] of cards.entries()) lazy(c, () => drawn.push(i));
    fire(ios[0], cards);
    expect(lazyStats().queued).toBe(2);
    cards[0].remove();
    runFrame();
    expect(drawn).toEqual([1]);
  });

  it('取消：還沒通知就不畫、不再觀察；最後一張取消時觀察器收掉', () => {
    const { cards } = setup([0, 40]);
    const drawn: number[] = [];
    const offs = cards.map((c, i) => lazy(c, () => drawn.push(i)));
    offs[0]();
    expect(ios[0].targets.has(cards[0])).toBe(false);
    fire(ios[0], [cards[0], cards[1]]);
    expect(drawn).toEqual([1]);
    expect(ios[0].disconnected).toBe(true);
    offs[1]();
    expect(lazyStats().observers).toBe(0);
  });

  it('排隊中的取消：不畫、從佇列拿掉', () => {
    const { cards } = setup([400]);
    const drawn: number[] = [];
    const off = lazy(cards[0], () => drawn.push(0));
    fire(ios[0], cards);
    expect(lazyStats().queued).toBe(1);
    off();
    expect(lazyStats().queued).toBe(0);
    runFrame();
    expect(drawn).toEqual([]);
  });

  it('沒有 IntersectionObserver 的環境：馬上畫', () => {
    // @ts-expect-error 測試：模擬舊瀏覽器
    delete globalThis.IntersectionObserver;
    const c = document.createElement('canvas');
    const drawn: number[] = [];
    lazy(c, () => drawn.push(1));
    expect(drawn).toEqual([1]);
  });
});

/* ---------- 畫很久的卡片（範本縮圖）---------- */

describe('畫很久的卡片（paced；範本縮圖，D55、7.18）', () => {
  const pacedLazy = (el: HTMLElement, draw: () => void) => {
    const off = lazyDraw(el, draw, { paced: true });
    cancels.push(off);
    return off;
  };

  it('同一個容器的 paced 與一般卡片共用一個觀察器，範圍一樣（容器＋上下 300 px）', () => {
    const { panel, cards } = setup([0, 50]);
    lazy(cards[0], () => {});
    pacedLazy(cards[1], () => {});
    expect(ios.length).toBe(1);
    expect(ios[0].root).toBe(panel);
    expect(ios[0].rootMargin).toBe(`${LAZY_MARGIN_PX}px 0px`);
  });

  it('在畫面內的也不在通知裡畫：排隊，下一個 frame 才畫；一個 frame 一張（每張都超過預算）', () => {
    const { cards } = setup([0, 80, 160, 240]);
    const order: number[] = [];
    for (const [i, c] of cards.entries())
      pacedLazy(c, () => {
        order.push(i);
        now += 50; /* 一張要畫 50 ms，遠超過 6 ms 的預算 */
      });
    fire(ios[0], cards);
    expect(order).toEqual([]);
    expect(lazyStats().queued).toBe(4);
    runFrame();
    expect(order).toEqual([0]);
    runFrame();
    expect(order).toEqual([0, 1]);
    runFrame();
    runFrame();
    expect(order).toEqual([0, 1, 2, 3]);
    expect(lazyStats().queued).toBe(0);
    expect(rafs.length).toBe(0);
  });

  it('很快畫完的 paced 卡片一個 frame 可以畫好幾張，但不超過預算', () => {
    const { cards } = setup([0, 40, 80, 120, 160]);
    const order: number[] = [];
    for (const [i, c] of cards.entries())
      pacedLazy(c, () => {
        order.push(i);
        now += 2; /* 2 ms 一張，預算 6 ms：一個 frame 4 張（第 4 張畫完時 8 ms > 6 ms） */
      });
    fire(ios[0], cards);
    runFrame();
    expect(order).toEqual([0, 1, 2, 3]);
    runFrame();
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('看得到的先畫、預先畫的（畫面外 300 px 內）接著畫，離畫面近的先', () => {
    /* 面板 0～300：card 3 在畫面內；其餘在下面（600、350、450） */
    const { cards } = setup([600, 350, 450, 100]);
    const order: number[] = [];
    for (const [i, c] of cards.entries())
      pacedLazy(c, () => {
        order.push(i);
        now += 50;
      });
    fire(ios[0], cards);
    for (let k = 0; k < 4; k++) runFrame();
    expect(order).toEqual([3, 1, 2, 0]);
  });

  it('一樣近的（都在畫面內）由上而下畫，不管通知的順序', () => {
    const { cards } = setup([100, 0, 200]);
    const order: number[] = [];
    for (const [i, c] of cards.entries())
      pacedLazy(c, () => {
        order.push(i);
        now += 50;
      });
    fire(ios[0], [cards[2], cards[0], cards[1]]);
    for (let k = 0; k < 3; k++) runFrame();
    expect(order).toEqual([1, 0, 2]);
  });

  it('預先畫的排著時，新捲進畫面的先畫', () => {
    const { cards } = setup([350, 400, 450, 900]);
    const order: number[] = [];
    for (const [i, c] of cards.entries())
      pacedLazy(c, () => {
        order.push(i);
        now += 50;
      });
    fire(ios[0], cards);
    runFrame();
    expect(order).toEqual([0]);
    /* 跳著捲：最遠的那張（900）現在在畫面內（100） */
    vi.spyOn(cards[3], 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    runFrame();
    expect(order).toEqual([0, 3]);
    runFrame();
    runFrame();
    expect(order).toEqual([0, 3, 1, 2]);
  });

  it('排隊中的取消：不畫、從佇列拿掉', () => {
    const { cards } = setup([0, 40]);
    const drawn: number[] = [];
    const offs = cards.map((c, i) => pacedLazy(c, () => drawn.push(i)));
    fire(ios[0], cards);
    expect(lazyStats().queued).toBe(2);
    offs[0]();
    expect(lazyStats().queued).toBe(1);
    runFrame();
    expect(drawn).toEqual([1]);
  });

  it('沒有 IntersectionObserver 的環境：paced 也馬上畫', () => {
    // @ts-expect-error 測試：模擬舊瀏覽器
    delete globalThis.IntersectionObserver;
    const c = document.createElement('canvas');
    const drawn: number[] = [];
    pacedLazy(c, () => drawn.push(1));
    expect(drawn).toEqual([1]);
  });
});

/* ---------- 圖示快取 ---------- */

describe('家具圖示的快取（D50、7.16）', () => {
  const protoGet = HTMLCanvasElement.prototype.getContext;
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = protoGet;
  });

  it('同一個代號第二次畫時貼上存好的圖，不重畫', () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_t, k: string) {
          return (...a: unknown[]) => {
            calls.push(k);
            return a.length ? undefined : undefined;
          };
        },
        set() {
          return true;
        },
      },
    );
    HTMLCanvasElement.prototype.getContext = (() =>
      ctx) as unknown as HTMLCanvasElement['getContext'];
    const a = document.createElement('canvas');
    drawAssetIcon(a, 'sofa2');
    const first = calls.length;
    expect(calls).toContain('arcTo'); /* 真的畫了（圓角矩形） */
    expect(calls.filter((c) => c === 'drawImage').length).toBe(1); /* 第一次：存一份 */
    calls.length = 0;
    const b = document.createElement('canvas');
    drawAssetIcon(b, 'sofa2');
    expect(calls.filter((c) => c === 'drawImage').length).toBe(1);
    expect(calls).not.toContain('arcTo');
    expect(calls.length).toBeLessThan(first / 4);
    expect(b.width).toBe(a.width);
    /* 別的代號照樣畫 */
    calls.length = 0;
    drawAssetIcon(document.createElement('canvas'), 'sofa3');
    expect(calls).toContain('arcTo');
  });
});
