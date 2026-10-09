/**
 * 刮刮卡的塗層程式（規格 3.4、3.5）：畫塗層、刮、粉屑、刮開判定、彩帶、彈出動畫、等比縮小。
 *
 * 工具的預覽、分享連結的畫面、匯出的互動 HTML 用的是**同一份**：匯出時 `mountScratch.toString()` 原樣放進 `<script>`。
 * 所以這個函式**不可以用到函式外面的任何東西**（import、模組層的常數與函式）；型別宣告會在編譯時拿掉，可以放在外面。
 */

export interface ScratchPiece {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 圓形（以外接方形表示）；false 是方形 */
  round: boolean;
}

export interface ScratchConfig {
  /** 卡片內容區的寬高（塗層畫布的像素） */
  width: number;
  height: number;
  /** 刮開區（整數） */
  zone: { x: number; y: number; w: number; h: number };
  color: string;
  text: string;
  brush: number;
  /** CSS 的 font-family（塗層文字用） */
  font: string;
  /** 個別塗層（空的：整個刮開區） */
  pieces: ScratchPiece[];
  /** 彈出動畫的 class（null：不播） */
  popClass: string | null;
  confetti: boolean;
  /** 卡片等比縮小到外層元素的寬（外層是卡片的 parentElement） */
  fit: boolean;
}

export interface ScratchHooks {
  onReveal?: () => void;
}

export interface ScratchHandle {
  /** 重新蓋上塗層（結果不變） */
  recover(): void;
  /** 直接刮開 */
  reveal(): void;
  isRevealed(): boolean;
  destroy(): void;
}

export function mountScratch(
  card: HTMLElement,
  cfg: ScratchConfig,
  hooks?: ScratchHooks,
): ScratchHandle {
  interface Dust {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    life: number;
    decay: number;
  }
  const W = cfg.width;
  const H = cfg.height;
  const z = cfg.zone;
  const pieces = cfg.pieces;
  const cover = card.querySelector('canvas[data-scx="cover"]') as HTMLCanvasElement;
  const dustCanvas = card.querySelector('canvas[data-scx="dust"]') as HTMLCanvasElement;
  const result = card.querySelector('[data-scx="result"]');
  cover.width = W;
  cover.height = H;
  dustCanvas.width = W;
  dustCanvas.height = H;
  const ctx = cover.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const dctx = dustCanvas.getContext('2d') as CanvasRenderingContext2D;
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const font = `bold 24px ${cfg.font}`;
  let alive = true;
  let drawing = false;
  let pointer = -1;
  let lastX = 0;
  let lastY = 0;
  let revealed = false;
  let touched = false;
  let dust: Dust[] = [];
  let raf = 0;
  const bursts: { canvas: HTMLCanvasElement; raf: number }[] = [];

  function setState() {
    card.setAttribute('data-state', revealed ? 'revealed' : 'covered');
    if (result) result.setAttribute('aria-hidden', revealed ? 'false' : 'true');
  }

  function drawText(x: number, y: number, alpha: number) {
    if (!cfg.text) return;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.text, x, y);
  }

  /** 重畫整張塗層（3.4） */
  function paint() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = cfg.color;
    if (pieces.length) {
      for (const p of pieces) {
        if (p.round) {
          ctx.beginPath();
          ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(p.x, p.y, p.w, p.h);
      }
      /* 字只畫在已經有塗層的地方 */
      ctx.globalCompositeOperation = 'source-atop';
      drawText(W / 2, H / 2, 0.4);
    } else {
      ctx.fillRect(z.x, z.y, z.w, z.h);
      drawText(z.x + z.w / 2, z.y + z.h / 2, 0.3);
      for (let i = 0; i < z.w * z.h * 0.03; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
        ctx.fillRect(z.x + Math.random() * z.w, z.y + Math.random() * z.h, 2, 2);
      }
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    card.setAttribute('data-progress', '0');
  }

  function pop() {
    const cls = cfg.popClass;
    if (!cls || reduced) return;
    card.querySelectorAll('[data-scx-pop]').forEach((el) => {
      el.classList.remove(cls);
      void (el as HTMLElement).offsetWidth;
      el.classList.add(cls);
    });
  }

  /* ---------- 粉屑 ---------- */

  function tick() {
    raf = 0;
    if (!alive) return;
    dctx.clearRect(0, 0, W, H);
    for (const p of dust) {
      p.vy += 0.2;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life > 0) {
        dctx.globalAlpha = p.life;
        dctx.fillStyle = cfg.color;
        dctx.beginPath();
        dctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        dctx.fill();
      }
    }
    dust = dust.filter((p) => p.life > 0);
    dctx.globalAlpha = 1;
    if (dust.length) raf = requestAnimationFrame(tick);
  }

  function spawn(x: number, y: number) {
    const spread = cfg.brush / 2;
    dust.push({
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 1) * 3,
      size: Math.random() * 2 + 1,
      life: 1,
      decay: Math.random() * 0.02 + 0.01,
    });
  }

  /* ---------- 彩帶 ---------- */

  function confetti() {
    const r = cover.getBoundingClientRect();
    const ox = r.left + (z.x + z.w / 2) * (r.width / W);
    const oy = r.top + (z.y + z.h / 2) * (r.height / H);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-scx', 'confetti');
    canvas.style.cssText =
      'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000';
    document.body.appendChild(canvas);
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.scale(dpr, dpr);
    const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
    const bits: {
      x: number;
      y: number;
      a: number;
      v: number;
      w: number;
      ws: number;
      t: number;
      ts: number;
      s: number;
      c: string;
      round: boolean;
    }[] = [];
    for (let i = 0; i < 120; i++) {
      bits.push({
        x: ox,
        y: oy,
        a: ((-90 + (Math.random() - 0.5) * 80) * Math.PI) / 180,
        v: 22.5 + Math.random() * 45,
        w: Math.random() * 10,
        ws: 0.05 + Math.random() * 0.06,
        t: Math.random() * Math.PI,
        ts: (Math.random() - 0.5) * 0.3,
        s: 8 + Math.random() * 4,
        c: colors[Math.floor(Math.random() * colors.length)],
        round: Math.random() < 0.3,
      });
    }
    const burst = { canvas, raf: 0 };
    bursts.push(burst);
    let n = 0;
    const step = () => {
      n++;
      g.clearRect(0, 0, vw, vh);
      g.globalAlpha = Math.max(0, 1 - n / 200);
      for (const b of bits) {
        b.x += Math.cos(b.a) * b.v;
        b.y += Math.sin(b.a) * b.v + 3;
        b.v *= 0.9;
        b.w += b.ws;
        b.t += b.ts;
        g.save();
        g.translate(b.x + 6 * Math.cos(b.w), b.y);
        g.rotate(b.t);
        g.fillStyle = b.c;
        if (b.round) {
          g.beginPath();
          g.ellipse(
            0,
            0,
            b.s / 2,
            (b.s / 2) * Math.max(0.2, Math.abs(Math.cos(b.w))),
            0,
            0,
            Math.PI * 2,
          );
          g.fill();
        } else
          g.fillRect(
            -b.s / 2,
            (-b.s / 4) * Math.abs(Math.cos(b.w)),
            b.s,
            (b.s / 2) * Math.abs(Math.cos(b.w)) + 1,
          );
        g.restore();
      }
      if (n < 200) burst.raf = requestAnimationFrame(step);
      else {
        canvas.remove();
        bursts.splice(bursts.indexOf(burst), 1);
      }
    };
    burst.raf = requestAnimationFrame(step);
  }

  /* ---------- 刮開判定 ---------- */

  /** 這個範圍裡（每 stride ÷ 4 個像素取一個）已經刮掉（不透明度 < 20）的比例 */
  function clearedRatio(x: number, y: number, w: number, h: number, stride: number) {
    const d = ctx.getImageData(x, y, w, h).data;
    let t = 0;
    for (let i = 3; i < d.length; i += stride) if (d[i] < 20) t++;
    return t / (d.length / stride);
  }

  /**
   * 刮開的程度：整區＝刮開區的比例；個別形狀＝每一塊（外接方形，夾在卡片內）裡最小的比例。
   * 寫在卡片的 data-progress（測試、除錯用）。
   */
  function progress(): number {
    if (!pieces.length) return z.w > 0 && z.h > 0 ? clearedRatio(z.x, z.y, z.w, z.h, 100) : 0;
    let min = 1;
    for (const b of pieces) {
      const bx = Math.max(0, Math.floor(b.x));
      const by = Math.max(0, Math.floor(b.y));
      const bw = Math.min(W - bx, Math.ceil(b.w));
      const bh = Math.min(H - by, Math.ceil(b.h));
      if (bw <= 0 || bh <= 0) continue;
      min = Math.min(min, clearedRatio(bx, by, bw, bh, 40));
    }
    return min;
  }

  /** 整區：大於 0.8；個別形狀：每一塊都不小於 0.7 */
  function check() {
    if (revealed) return;
    try {
      const p = progress();
      card.setAttribute('data-progress', p.toFixed(3));
      if (pieces.length ? p >= 0.7 : p > 0.8) reveal();
    } catch {
      /* 讀不了像素時不判定 */
    }
  }

  function reveal() {
    if (revealed || !alive) return;
    revealed = true;
    drawing = false;
    if (pieces.length) for (const b of pieces) ctx.clearRect(b.x, b.y, b.w, b.h);
    else ctx.clearRect(z.x, z.y, z.w, z.h);
    setState();
    if (cfg.confetti && !reduced) confetti();
    if (hooks?.onReveal) hooks.onReveal();
  }

  /* ---------- 刮 ---------- */

  function position(e: PointerEvent) {
    const r = cover.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / (r.width || W)),
      y: (e.clientY - r.top) * (H / (r.height || H)),
    };
  }

  function stroke(p: { x: number; y: number }) {
    touched = true;
    let skip = false;
    try {
      if (ctx.getImageData(p.x, p.y, 1, 1).data[3] < 20) skip = true;
    } catch {
      /* 畫布外 */
    }
    ctx.lineWidth = cfg.brush;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!skip && !reduced) {
      const dist = Math.hypot(p.x - lastX, p.y - lastY);
      const count = Math.max(1, Math.min(10, Math.floor(dist / 5)));
      for (let i = 0; i < count; i++) {
        const t = Math.random();
        spawn(lastX + (p.x - lastX) * t, lastY + (p.y - lastY) * t);
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    lastX = p.x;
    lastY = p.y;
    if (Math.random() < 0.1) check();
  }

  function onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    drawing = true;
    pointer = e.pointerId;
    try {
      cover.setPointerCapture(e.pointerId);
    } catch {
      /* 合成的事件 */
    }
    const p = position(e);
    lastX = p.x;
    lastY = p.y;
    stroke(p);
  }

  function onMove(e: PointerEvent) {
    if (!drawing || e.pointerId !== pointer) return;
    e.preventDefault();
    stroke(position(e));
  }

  function onUp(e: PointerEvent) {
    if (!drawing || e.pointerId !== pointer) return;
    drawing = false;
    pointer = -1;
    check();
  }

  cover.addEventListener('pointerdown', onDown);
  cover.addEventListener('pointermove', onMove);
  cover.addEventListener('pointerup', onUp);
  cover.addEventListener('pointercancel', onUp);
  cover.addEventListener('lostpointercapture', onUp);

  /* ---------- 等比縮小到外層的寬 ---------- */

  const host = card.parentElement;
  let observer: ResizeObserver | null = null;
  function fitToHost() {
    if (!host) return;
    const ow = card.offsetWidth;
    const oh = card.offsetHeight;
    const k = ow > 0 ? Math.min(1, host.clientWidth / ow) : 1;
    card.style.transformOrigin = '0 0';
    card.style.transform = k < 1 ? `scale(${k})` : '';
    host.style.height = k < 1 ? `${oh * k}px` : '';
  }
  if (cfg.fit && host) {
    fitToHost();
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(fitToHost);
      observer.observe(host);
    } else window.addEventListener('resize', fitToHost);
  }

  /* ---------- 開始 ---------- */

  paint();
  setState();
  pop();
  /* 字型還沒下載好時先用備用字型畫；下載好而且還沒開始刮時重畫一次 */
  if (cfg.text && typeof document !== 'undefined' && document.fonts?.load) {
    document.fonts.load(font, cfg.text).then(
      () => {
        if (alive && !touched && !revealed) paint();
      },
      () => undefined,
    );
  }

  return {
    recover() {
      if (!alive) return;
      revealed = false;
      touched = false;
      drawing = false;
      dust = [];
      dctx.clearRect(0, 0, W, H);
      paint();
      setState();
      pop();
    },
    reveal,
    isRevealed: () => revealed,
    destroy() {
      alive = false;
      cover.removeEventListener('pointerdown', onDown);
      cover.removeEventListener('pointermove', onMove);
      cover.removeEventListener('pointerup', onUp);
      cover.removeEventListener('pointercancel', onUp);
      cover.removeEventListener('lostpointercapture', onUp);
      if (raf) cancelAnimationFrame(raf);
      for (const b of bursts) {
        cancelAnimationFrame(b.raf);
        b.canvas.remove();
      }
      bursts.length = 0;
      if (observer) observer.disconnect();
      else if (cfg.fit) window.removeEventListener('resize', fitToHost);
    },
  };
}
