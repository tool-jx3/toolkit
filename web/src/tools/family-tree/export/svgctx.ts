/**
 * 把 canvas 2D 的畫法記成 SVG（SVG 匯出用，規格 F88、3.3）：匯出的畫法（drawExport）同一份程式，
 * PNG 畫在真的 canvas 上、SVG 畫在這個記錄器上，所以兩種輸出的版面完全相同。
 * 只支援匯出用到的部分：平移與等比縮放、矩形、路徑（直線、arcTo、arc、三次貝茲）、填色、描邊、虛線、
 * 透明度、剪裁（clip）、文字（fillText；measureText 用真的 canvas 量）、貼圖（drawImage 一張畫布）。
 */

type Measure = Pick<CanvasRenderingContext2D, 'measureText' | 'font' | 'textBaseline'>;

interface State {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  dash: number[];
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  tx: number;
  ty: number;
  s: number;
  clip: string | null;
}

const num = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export const escXml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 字型字串（「600 14px "Noto Sans TC", sans-serif」）→ 粗細、大小、字型 */
export function parseFont(font: string): { weight: string; size: number; family: string } {
  const m = /^\s*(?:(normal|italic)\s+)?(\d{3}|bold|normal)?\s*([\d.]+)px\s+(.+)$/.exec(font);
  if (!m) return { weight: '400', size: 10, family: 'sans-serif' };
  return { weight: m[2] ?? '400', size: Number(m[3]), family: m[4] };
}

export class SvgContext {
  private st: State = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    dash: [],
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    tx: 0,
    ty: 0,
    s: 1,
    clip: null,
  };
  private stack: State[] = [];
  private path: string[] = [];
  private cur: { x: number; y: number } | null = null;
  private start: { x: number; y: number } | null = null;
  private out: string[] = [];
  private defs: string[] = [];
  private clipN = 0;
  /** 用到的字（依粗細；嵌入字型的子集用） */
  readonly chars = new Map<string, Set<string>>();
  /** 「字型＋textBaseline」→ alphabetic 基準線相對於 y 的位移（量過的快取；量不到時 null） */
  private readonly shifts = new Map<string, number | null>();

  constructor(private readonly measurer: Measure) {}

  /* ---- 狀態 ---- */
  get fillStyle() {
    return this.st.fillStyle;
  }
  set fillStyle(v: string) {
    this.st.fillStyle = String(v);
  }
  get strokeStyle() {
    return this.st.strokeStyle;
  }
  set strokeStyle(v: string) {
    this.st.strokeStyle = String(v);
  }
  get lineWidth() {
    return this.st.lineWidth;
  }
  set lineWidth(v: number) {
    this.st.lineWidth = v;
  }
  get globalAlpha() {
    return this.st.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.st.globalAlpha = v;
  }
  get font() {
    return this.st.font;
  }
  set font(v: string) {
    this.st.font = v;
  }
  get textAlign() {
    return this.st.textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.st.textAlign = v;
  }
  get textBaseline() {
    return this.st.textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.st.textBaseline = v;
  }
  /** 畫圖的品質設定（SVG 沒有意義，照收） */
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = 'high';

  save() {
    this.stack.push({ ...this.st, dash: [...this.st.dash] });
  }
  restore() {
    const s = this.stack.pop();
    if (s) this.st = s;
  }
  translate(x: number, y: number) {
    this.st.tx += x * this.st.s;
    this.st.ty += y * this.st.s;
  }
  /** 只支援等比縮放（取 x 的倍率） */
  scale(sx: number, _sy: number) {
    this.st.s *= sx;
  }
  setLineDash(d: number[]) {
    this.st.dash = [...d];
  }

  private X(x: number) {
    return x * this.st.s + this.st.tx;
  }
  private Y(y: number) {
    return y * this.st.s + this.st.ty;
  }

  /* ---- 路徑 ---- */
  beginPath() {
    this.path = [];
    this.cur = null;
    this.start = null;
  }
  moveTo(x: number, y: number) {
    this.path.push(`M${num(this.X(x))} ${num(this.Y(y))}`);
    this.cur = { x, y };
    this.start = { x, y };
  }
  lineTo(x: number, y: number) {
    if (!this.cur) return this.moveTo(x, y);
    this.path.push(`L${num(this.X(x))} ${num(this.Y(y))}`);
    this.cur = { x, y };
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    if (!this.cur) this.moveTo(c1x, c1y);
    this.path.push(
      `C${num(this.X(c1x))} ${num(this.Y(c1y))} ${num(this.X(c2x))} ${num(this.Y(c2y))} ${num(this.X(x))} ${num(this.Y(y))}`,
    );
    this.cur = { x, y };
  }
  /** canvas 的 arcTo：從目前的點往 (x1, y1) 走，以半徑 r 轉向 (x2, y2) */
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    const p0 = this.cur;
    if (!p0) return this.moveTo(x1, y1);
    const v1x = p0.x - x1;
    const v1y = p0.y - y1;
    const v2x = x2 - x1;
    const v2y = y2 - y1;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    const cross = v1x * v2y - v1y * v2x;
    if (r <= 0 || l1 === 0 || l2 === 0 || Math.abs(cross) < 1e-9) return this.lineTo(x1, y1);
    const cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    const d = r / Math.tan(ang / 2);
    const t1 = { x: x1 + (v1x / l1) * d, y: y1 + (v1y / l1) * d };
    const t2 = { x: x1 + (v2x / l2) * d, y: y1 + (v2y / l2) * d };
    if (Math.hypot(t1.x - p0.x, t1.y - p0.y) > 1e-9) this.lineTo(t1.x, t1.y);
    const R = num(r * this.st.s);
    this.path.push(`A${R} ${R} 0 0 ${cross < 0 ? 1 : 0} ${num(this.X(t2.x))} ${num(this.Y(t2.y))}`);
    this.cur = t2;
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false) {
    const pt = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const s = pt(a0);
    if (this.cur) this.lineTo(s.x, s.y);
    else this.moveTo(s.x, s.y);
    const R = num(r * this.st.s);
    let sweep = ccw ? a0 - a1 : a1 - a0;
    if (sweep >= Math.PI * 2 - 1e-9) {
      /* 整圈：分成兩半 */
      const m = pt(a0 + (ccw ? -Math.PI : Math.PI));
      const f = ccw ? 0 : 1;
      this.path.push(`A${R} ${R} 0 1 ${f} ${num(this.X(m.x))} ${num(this.Y(m.y))}`);
      this.path.push(`A${R} ${R} 0 1 ${f} ${num(this.X(s.x))} ${num(this.Y(s.y))}`);
      this.cur = s;
      return;
    }
    sweep = ((sweep % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const e = pt(a1);
    this.path.push(
      `A${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${num(this.X(e.x))} ${num(this.Y(e.y))}`,
    );
    this.cur = e;
  }
  closePath() {
    this.path.push('Z');
    if (this.start) this.cur = { ...this.start };
  }

  private clipAttr() {
    return this.st.clip ? ` clip-path="url(#${this.st.clip})"` : '';
  }
  private alphaAttr(kind: 'fill' | 'stroke') {
    return this.st.globalAlpha < 1 ? ` ${kind}-opacity="${num(this.st.globalAlpha)}"` : '';
  }

  fill() {
    if (!this.path.length) return;
    this.out.push(
      `<path d="${this.path.join('')}" fill="${escXml(this.st.fillStyle)}"${this.alphaAttr('fill')}${this.clipAttr()}/>`,
    );
  }
  stroke() {
    if (!this.path.length) return;
    const dash = this.st.dash.length
      ? ` stroke-dasharray="${this.st.dash.map((d) => num(d * this.st.s)).join(' ')}"`
      : '';
    this.out.push(
      `<path d="${this.path.join('')}" fill="none" stroke="${escXml(this.st.strokeStyle)}" stroke-width="${num(this.st.lineWidth * this.st.s)}"${dash}${this.alphaAttr('stroke')}${this.clipAttr()}/>`,
    );
  }
  /** 剪裁：目前的路徑變成 clipPath，之後畫的東西套用它（到 restore 為止） */
  clip() {
    const id = `c${++this.clipN}`;
    const parent = this.st.clip ? ` clip-path="url(#${this.st.clip})"` : '';
    this.defs.push(`<clipPath id="${id}"><path d="${this.path.join('')}"${parent}/></clipPath>`);
    this.st.clip = id;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.out.push(
      `<rect x="${num(this.X(x))}" y="${num(this.Y(y))}" width="${num(w * this.st.s)}" height="${num(h * this.st.s)}" fill="${escXml(this.st.fillStyle)}"${this.alphaAttr('fill')}${this.clipAttr()}/>`,
    );
  }

  /* ---- 文字 ---- */
  measureText(t: string): TextMetrics {
    this.measurer.font = this.st.font;
    return this.measurer.measureText(t);
  }
  fillText(t: string, x: number, y: number) {
    if (!t) return;
    const f = parseFont(this.st.font);
    const set = this.chars.get(f.weight) ?? new Set<string>();
    for (const ch of t) set.add(ch);
    this.chars.set(f.weight, set);
    const anchor =
      this.st.textAlign === 'center'
        ? 'middle'
        : this.st.textAlign === 'right' || this.st.textAlign === 'end'
          ? 'end'
          : 'start';
    /*
     * 垂直對齊：canvas 的 textBaseline middle／top… 會把字畫在「alphabetic 基準線 ＝ y − alphabeticBaseline」的位置
     * （在同一個 canvas 設好字型與 textBaseline 後量；middle 時是負的）。SVG 的 dominant-baseline central／hanging
     * 的基準算法不同（差約 1 px），所以一律用 alphabetic 加上量出來的位移，兩邊的字才在同一個高度。
     * 量不到（沒有 alphabeticBaseline 的環境）時才退回 dominant-baseline。
     */
    const shift = this.baselineShift(t);
    const base =
      shift === null
        ? this.st.textBaseline === 'middle'
          ? ' dominant-baseline="central"'
          : this.st.textBaseline === 'top'
            ? ' dominant-baseline="hanging"'
            : ''
        : '';
    const y0 = this.Y(y) + (shift ?? 0) * this.st.s;
    /* canvas 連前後的空白一起算寬（置中、靠右時也是）；SVG 預設會把前後的空白吃掉，位置就差半個空白以上（「1976 – 」） */
    const keepSpace = /^\s|\s$|\s\s/.test(t) ? ' style="white-space:pre"' : '';
    this.out.push(
      `<text x="${num(this.X(x))}" y="${num(y0)}" font-family="${escXml(f.family)}" font-size="${num(f.size * this.st.s)}" font-weight="${f.weight}" fill="${escXml(this.st.fillStyle)}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${base}${keepSpace}${this.alphaAttr('fill')}${this.clipAttr()}>${escXml(t)}</text>`,
    );
  }

  /** canvas 在這個 textBaseline 畫字時，alphabetic 基準線在 y 往下多少 px（alphabetic 本身是 0；量不到 null） */
  private baselineShift(t: string): number | null {
    const bl = this.st.textBaseline;
    if (bl === 'alphabetic') return 0;
    const key = `${this.st.font}|${bl}`;
    const hit = this.shifts.get(key);
    if (hit !== undefined) return hit;
    const m = this.measurer;
    m.font = this.st.font;
    m.textBaseline = bl;
    const ab = m.measureText(t).alphabeticBaseline;
    m.textBaseline = 'alphabetic';
    const v = typeof ab === 'number' && Number.isFinite(ab) ? -ab || 0 : null;
    this.shifts.set(key, v);
    return v;
  }

  /* ---- 圖 ---- */
  drawImage(img: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
    let href = '';
    try {
      href = img.toDataURL('image/png');
    } catch {
      return;
    }
    this.out.push(
      `<image href="${href}" x="${num(this.X(x))}" y="${num(this.Y(y))}" width="${num(w * this.st.s)}" height="${num(h * this.st.s)}" preserveAspectRatio="none"${this.st.globalAlpha < 1 ? ` opacity="${num(this.st.globalAlpha)}"` : ''}${this.clipAttr()}/>`,
    );
  }

  /** 整份 SVG（style：放在 <defs> 裡的 <style>，例如嵌入的字型） */
  toSvg(width: number, height: number, style = '', title = ''): string {
    const w = num(width);
    const h = num(height);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xml:space="preserve">`,
      title ? `<title>${escXml(title)}</title>` : '',
      `<defs>${style ? `<style>${style}</style>` : ''}${this.defs.join('')}</defs>`,
      ...this.out,
      '</svg>',
    ].join('\n');
  }
}
