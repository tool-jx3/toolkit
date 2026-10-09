// @vitest-environment jsdom
/**
 * 刮刮卡的塗層程式（engine.ts，規格 3.4、3.5）：用一張只記不透明度的假畫布驗證
 * 塗層的範圍（整區／個別形狀）、刮（圓頭線條擦掉）、刮開判定的門檻（整區 > 0.8、個別每一塊 ≥ 0.7）、
 * 刮開後清掉塗層、再蓋一次、直接刮開、移除。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountScratch, type ScratchConfig } from '@/tools/scratch-card/engine';

/** 只記不透明度（0～255）的假 2D 畫布：夠用來驗證填色、擦掉與讀像素 */
class FakeCtx {
  alpha: Uint8ClampedArray;
  fillStyle = '#000';
  strokeStyle = '#000';
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  font = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  private path: { kind: 'arc'; cx: number; cy: number; r: number }[] = [];
  private seg: { x: number; y: number }[] = [];
  texts: { text: string; x: number; y: number; op: string }[] = [];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.alpha = new Uint8ClampedArray(w * h);
  }
  private paint(test: (x: number, y: number) => boolean) {
    const op = this.globalCompositeOperation;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!test(x + 0.5, y + 0.5)) continue;
        const i = y * this.w + x;
        if (op === 'destination-out') this.alpha[i] = 0;
        else if (op === 'source-atop') {
          /* 只畫在已經有的地方，不透明度不變 */
        } else this.alpha[i] = 255;
      }
  }
  clearRect(x: number, y: number, w: number, h: number) {
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.h, Math.ceil(y + h)); j++)
      for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.w, Math.ceil(x + w)); i++)
        this.alpha[j * this.w + i] = 0;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.paint((px, py) => px >= x && px < x + w && py >= y && py < y + h);
  }
  beginPath() {
    this.path = [];
    this.seg = [];
  }
  arc(cx: number, cy: number, r: number) {
    this.path.push({ kind: 'arc', cx, cy, r });
  }
  ellipse() {}
  fill() {
    for (const p of this.path) this.paint((x, y) => (x - p.cx) ** 2 + (y - p.cy) ** 2 <= p.r ** 2);
  }
  moveTo(x: number, y: number) {
    this.seg = [{ x, y }];
  }
  lineTo(x: number, y: number) {
    this.seg.push({ x, y });
  }
  stroke() {
    const r = this.lineWidth / 2;
    for (let k = 0; k < this.seg.length - 1; k++) {
      const a = this.seg[k];
      const b = this.seg[k + 1];
      this.paint((x, y) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len)) : 0;
        return (x - (a.x + t * dx)) ** 2 + (y - (a.y + t * dy)) ** 2 <= r * r;
      });
    }
  }
  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, x, y, op: this.globalCompositeOperation });
  }
  getImageData(x: number, y: number, w: number, h: number) {
    const sx = Math.trunc(x);
    const sy = Math.trunc(y);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const X = sx + i;
        const Y = sy + j;
        if (X >= 0 && Y >= 0 && X < this.w && Y < this.h)
          data[(j * w + i) * 4 + 3] = this.alpha[Y * this.w + X];
      }
    return { data, width: w, height: h };
  }
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  /** 某個範圍的不透明像素數 */
  opaque(x: number, y: number, w: number, h: number) {
    let n = 0;
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (this.alpha[j * this.w + i]) n++;
    return n;
  }
}

const W = 100;
const H = 60;
let ctxs: Map<HTMLCanvasElement, FakeCtx>;

function setup(patch: Partial<ScratchConfig> = {}) {
  document.body.innerHTML = `<div id="host"><div data-scx="card"><div data-scx="result" aria-hidden="true"><span data-scx-pop>a</span></div><canvas data-scx="cover"></canvas><canvas data-scx="dust"></canvas></div></div>`;
  const card = document.querySelector<HTMLElement>('[data-scx="card"]')!;
  const cover = card.querySelector<HTMLCanvasElement>('[data-scx="cover"]')!;
  const cfg: ScratchConfig = {
    width: W,
    height: H,
    zone: { x: 10, y: 10, w: 80, h: 40 },
    color: '#9ca3af',
    text: '刮刮看！',
    brush: 10,
    font: 'sans-serif',
    pieces: [],
    popClass: 'pop',
    confetti: false,
    fit: false,
    ...patch,
  };
  const onReveal = vi.fn();
  const handle = mountScratch(card, cfg, { onReveal });
  return { card, cover, ctx: ctxs.get(cover)!, handle, onReveal };
}

function pointer(el: HTMLElement, type: string, x: number, y: number) {
  const e = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  el.dispatchEvent(e);
}

/** 從 (x0, y) 橫著刮到 (x1, y)，一列一列往下，最後放開 */
function scratchRows(el: HTMLElement, x0: number, x1: number, ys: number[]) {
  pointer(el, 'pointerdown', x0, ys[0]);
  for (const y of ys) {
    pointer(el, 'pointermove', x0, y);
    pointer(el, 'pointermove', x1, y);
  }
  pointer(el, 'pointerup', x1, ys[ys.length - 1]);
}

beforeEach(() => {
  ctxs = new Map();
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    let c = ctxs.get(this);
    if (!c) {
      c = new FakeCtx(this.width, this.height);
      ctxs.set(this, c);
    }
    return c;
  } as unknown as HTMLCanvasElement['getContext'];
  /* 卡片沒有縮放：畫面位置＝畫布座標 */
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 }) as DOMRect;
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => undefined;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('塗層的範圍', () => {
  it('整區：只蓋刮開區；文字在中央（30% 白）；結果對螢幕閱讀器隱藏', () => {
    const { card, ctx } = setup();
    expect(ctx.opaque(10, 10, 80, 40)).toBe(80 * 40);
    expect(ctx.opaque(0, 0, W, H)).toBe(80 * 40);
    expect(ctx.texts[0]).toMatchObject({ text: '刮刮看！', x: 50, y: 30, op: 'source-over' });
    expect(card.dataset.state).toBe('covered');
    expect(card.querySelector('[data-scx="result"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(card.querySelector('[data-scx-pop]')?.classList.contains('pop')).toBe(true);
  });

  it('個別形狀：圓與方形；文字畫在卡片中央、只在形狀上（source-atop）', () => {
    const { ctx } = setup({
      pieces: [
        { x: 10, y: 10, w: 20, h: 20, round: true },
        { x: 60, y: 20, w: 30, h: 20, round: false },
      ],
    });
    expect(ctx.opaque(60, 20, 30, 20)).toBe(600);
    const circle = ctx.opaque(10, 10, 20, 20);
    expect(circle).toBeGreaterThan(300);
    expect(circle).toBeLessThan(330);
    expect(ctx.opaque(0, 0, 10, H)).toBe(0);
    expect(ctx.texts[0]).toMatchObject({ x: 50, y: 30, op: 'source-atop' });
  });

  it('塗層文字空白時不畫字', () => {
    const { ctx } = setup({ text: '' });
    expect(ctx.texts).toEqual([]);
  });
});

describe('刮與刮開判定', () => {
  it('刮：沿路徑以筆刷大小的圓頭線條擦掉', () => {
    const { cover, ctx } = setup();
    pointer(cover, 'pointerdown', 20, 30);
    pointer(cover, 'pointermove', 60, 30);
    pointer(cover, 'pointerup', 60, 30);
    /* 線寬 10：y 25～35 之間、x 15～65 之間都擦掉了 */
    expect(ctx.opaque(20, 26, 40, 8)).toBe(0);
    expect(ctx.opaque(20, 10, 40, 10)).toBe(400);
  });

  it('整區：放開時清掉的比例「大於 0.8」才刮開，清掉塗層並通知', () => {
    const { cover, card, ctx, onReveal } = setup();
    /* 刮 y＝15、25、35：約 3 × 10 ÷ 40 的高度 → 不到 0.8 */
    scratchRows(cover, 10, 90, [15, 25, 35]);
    expect(card.dataset.state).toBe('covered');
    const p = Number(card.dataset.progress);
    expect(p).toBeGreaterThan(0.6);
    expect(p).toBeLessThanOrEqual(0.8);
    scratchRows(cover, 10, 90, [44]);
    expect(Number(card.dataset.progress)).toBeGreaterThan(0.8);
    expect(card.dataset.state).toBe('revealed');
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(ctx.opaque(0, 0, W, H)).toBe(0);
    expect(card.querySelector('[data-scx="result"]')?.getAttribute('aria-hidden')).toBe('false');
  });

  it('個別形狀：每一塊都「不小於 0.7」才刮開（外接方形，圓的四角算已刮開）', () => {
    const { cover, card, onReveal } = setup({
      zone: { x: 0, y: 0, w: W, h: H },
      pieces: [
        { x: 10, y: 10, w: 30, h: 30, round: true },
        { x: 60, y: 10, w: 30, h: 30, round: false },
      ],
    });
    /* 只刮第一塊 */
    scratchRows(cover, 10, 40, [15, 25, 35]);
    expect(card.dataset.state).toBe('covered');
    expect(Number(card.dataset.progress)).toBeLessThan(0.7);
    scratchRows(cover, 60, 90, [15, 25, 35]);
    expect(card.dataset.state).toBe('revealed');
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('滑鼠右鍵不刮；拖曳中 1/10 的機率檢查', () => {
    const { cover, ctx, card } = setup();
    const e = new MouseEvent('pointerdown', { clientX: 50, clientY: 30, button: 2, bubbles: true });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    Object.defineProperty(e, 'pointerType', { value: 'mouse' });
    cover.dispatchEvent(e);
    expect(ctx.opaque(10, 10, 80, 40)).toBe(3200);
    /* Math.random < 0.1 時拖曳中也檢查（progress 會更新） */
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    pointer(cover, 'pointerdown', 20, 30);
    expect(Number(card.dataset.progress)).toBeGreaterThan(0);
  });
});

describe('再蓋一次、直接刮開、移除', () => {
  it('再蓋一次：重新畫上塗層、回到 covered、重播彈出動畫', () => {
    const { cover, card, ctx, handle } = setup();
    scratchRows(cover, 10, 90, [15, 25, 35, 44]);
    expect(card.dataset.state).toBe('revealed');
    const pop = card.querySelector('[data-scx-pop]')!;
    pop.classList.remove('pop');
    handle.recover();
    expect(card.dataset.state).toBe('covered');
    expect(card.dataset.progress).toBe('0');
    expect(ctx.opaque(10, 10, 80, 40)).toBe(3200);
    expect(pop.classList.contains('pop')).toBe(true);
    expect(handle.isRevealed()).toBe(false);
  });

  it('直接刮開：清掉塗層並通知；只通知一次', () => {
    const { card, ctx, handle, onReveal } = setup();
    handle.reveal();
    handle.reveal();
    expect(card.dataset.state).toBe('revealed');
    expect(ctx.opaque(0, 0, W, H)).toBe(0);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('移除後不再接收指標', () => {
    const { cover, ctx, handle } = setup();
    handle.destroy();
    pointer(cover, 'pointerdown', 50, 30);
    pointer(cover, 'pointermove', 80, 30);
    expect(ctx.opaque(10, 10, 80, 40)).toBe(3200);
  });

  it('彩帶：刮開時在畫面上放一張不接收指標的畫布，移除時拿掉', () => {
    const { handle } = setup({ confetti: true });
    handle.reveal();
    const c = document.querySelector<HTMLCanvasElement>('canvas[data-scx="confetti"]');
    expect(c).not.toBeNull();
    expect(c?.style.pointerEvents).toBe('none');
    handle.destroy();
    expect(document.querySelector('canvas[data-scx="confetti"]')).toBeNull();
  });
});
