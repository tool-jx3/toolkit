// @vitest-environment jsdom
/**
 * 室內平面圖產生器：範本對話框的縮圖延遲載入（規格 D55、F239、7.18）。
 * - 縮圖和素材面板的圖示共用同一套（lazyIcons.ts）：`IntersectionObserver` 的 root 是對話框的捲動區、
 *   上下各多 300 px，56 張縮圖共用一個觀察器；
 * - 看得到的先畫、預先畫的接著畫（離畫面近的先）、一個 frame 不超過時間上限（畫很久的 paced）；
 * - 關掉對話框：沒畫的取消、觀察器收掉。
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyStats } from '@/tools/floor-plan/editor/lazyIcons';
import { UiProvider } from '@/ui';

const drawn = vi.hoisted(() => [] as string[]);

vi.mock('@/tools/floor-plan/templates', async (orig) => {
  const m = await orig<typeof import('@/tools/floor-plan/templates')>();
  return {
    ...m,
    instantiateTemplate: (id: string) => {
      drawn.push(id);
      return m.instantiateTemplate(id);
    },
  };
});
vi.mock('@/tools/floor-plan/draw/export', async (orig) => {
  const m = await orig<typeof import('@/tools/floor-plan/draw/export')>();
  return {
    ...m,
    exportLayout: () => ({ width: 20, height: 15 }),
    renderImage: () => ({ toDataURL: () => 'data:image/png;base64,AA==' }),
  };
});

import { setEditor } from '@/tools/floor-plan/editor/store';
import { TemplateDialog } from '@/tools/floor-plan/editor/TemplateDialog';
import { TEMPLATES } from '@/tools/floor-plan/templates';

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

/* requestAnimationFrame 手動推進 */
let rafs: FrameRequestCallback[] = [];
const runFrame = () => {
  const list = rafs;
  rafs = [];
  act(() => {
    for (const f of list) f(0);
  });
};

/** 假的版面：捲動區 0～300 px；第 n 張卡片的 top 是 n × 100（高 80） */
function fakeLayout() {
  const rect = (top: number, bottom: number) =>
    ({
      top,
      bottom,
      left: 0,
      right: 100,
      width: 100,
      height: bottom - top,
      x: 0,
      y: top,
    }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('overflow-auto')) return rect(0, 300);
    const li = this.closest('li');
    if (li) {
      const n = [...(li.parentElement?.children ?? [])].indexOf(li);
      return rect(n * 100, n * 100 + 80);
    }
    return rect(0, 0);
  });
}

let style: HTMLStyleElement;
beforeEach(() => {
  installFakeIO();
  rafs = [];
  drawn.length = 0;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => rafs.push(f));
  /* Tailwind 的 class 在 jsdom 沒有樣式：補上捲動區要用的那一條 */
  style = document.createElement('style');
  style.textContent = '.overflow-auto{overflow-y:auto}';
  document.head.append(style);
  fakeLayout();
});

afterEach(() => {
  style.remove();
  globalThis.IntersectionObserver = OriginalIO;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fire = (io: FakeIO, els: Element[]) =>
  act(() => {
    io.cb(
      els.map(
        (target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry,
      ),
      io as unknown as IntersectionObserver,
    );
  });

describe('範本對話框的縮圖（D55、F239、7.18）', () => {
  it('觀察範圍是對話框的捲動區（上下多 300 px）、56 張共用一個觀察器；看得到的先畫、接著畫預先畫的', async () => {
    render(
      <UiProvider>
        <TemplateDialog />
      </UiProvider>,
    );
    act(() => setEditor({ templatesOpen: true }));
    const dialog = await screen.findByTestId('template-dialog');
    const scroller = dialog.closest('.overflow-auto');
    expect(scroller).not.toBeNull();

    /* 一個觀察器：root＝捲動區、rootMargin 上下 300 px、觀察 56 張縮圖（空白地圖沒有縮圖） */
    expect(ios.length).toBe(1);
    expect(ios[0].root).toBe(scroller);
    expect(ios[0].rootMargin).toBe('300px 0px');
    expect(ios[0].targets.size).toBe(TEMPLATES.length);
    expect(lazyStats().observers).toBe(1);

    /* 卡片的順序 → 範本代號 */
    const items = [...dialog.querySelectorAll('ul > li')];
    const idOf = (li: Element) => {
      const name = li.querySelector('.truncate')?.textContent;
      return TEMPLATES.find((t) => t.name === name)?.id ?? '';
    };
    const thumbOf = (n: number) =>
      [...ios[0].targets].find((el) => el.closest('li') === items[n]) as Element;
    const ids = items.slice(0, 8).map(idOf);
    expect(ids.every(Boolean)).toBe(true);

    /* 通知：第 0～7 張進入觀察範圍（捲動區 0～300：0～3 在畫面內，4～6 在預先畫的 300 px 內，7 在更遠） */
    fire(ios[0], [7, 6, 5, 4, 3, 2, 1, 0].map(thumbOf));
    /* 還沒到下一個 frame 一張都不畫 */
    expect(drawn).toEqual([]);
    expect(dialog.querySelectorAll('img').length).toBe(0);
    for (let k = 0; k < 20 && rafs.length; k++) runFrame();
    /* 畫的順序：看得到的（0～3，照卡片順序），再依離畫面的遠近（4、5、6、7） */
    expect(drawn).toEqual(ids.slice(0, 8));
    expect(dialog.querySelectorAll('img').length).toBe(8);
    expect(lazyStats().queued).toBe(0);
    /* 畫好的不再觀察 */
    expect(ios[0].targets.size).toBe(TEMPLATES.length - 8);

    /* 關掉對話框：剩下的取消、觀察器收掉 */
    act(() => setEditor({ templatesOpen: false }));
    expect(lazyStats()).toEqual({ observers: 0, queued: 0 });
    expect(ios[0].disconnected).toBe(true);
  });

  it('再打開：畫過的直接貼上，不再畫', async () => {
    render(
      <UiProvider>
        <TemplateDialog />
      </UiProvider>,
    );
    act(() => setEditor({ templatesOpen: true }));
    const dialog = await screen.findByTestId('template-dialog');
    /* 上一個測試畫好的 8 張有圖，其餘還沒 */
    expect(dialog.querySelectorAll('img').length).toBe(8);
    expect(ios[0].targets.size).toBe(TEMPLATES.length - 8);
    act(() => setEditor({ templatesOpen: false }));
  });
});
