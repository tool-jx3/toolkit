/**
 * core/qr：編碼（模式、版本、UTF-8、漢字）、解碼（40 個版本 × 4 個等級來回、Reed–Solomon 修正、格式資訊的錯誤）、
 * 點與角的形狀、場景（格子、圖的大小〔原作的測試值〕、漸層方向、圓形外圍）、SVG（用 node-canvas 畫成點陣再讀回來）、
 * 對比與 Otsu 門檻；id-ticket 原本的 qrMatrix 結果不變。
 */
import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import {
  buildQrScene,
  checkQrPixels,
  cornerSquarePath,
  decodeQrMatrix,
  dotPath,
  encodeQr,
  functionMask,
  otsuThreshold,
  paintFill,
  type QrCode,
  type QrEcl,
  type QrStyle,
  qrAutoMode,
  qrImageSize,
  qrMatrix,
  qrPaintContrast,
  qrSceneToSvg,
} from '@/core/qr';
import { blockLayout } from '@/core/qr/tables';

const ECLS: QrEcl[] = ['L', 'M', 'Q', 'H'];

/** 第 v 版、這個等級的位元組模式放得下的最多字數（資料碼字 × 8 − 模式 4 位元 − 字數欄位） */
function byteCapacity(v: number, ecl: QrEcl): number {
  const fn = functionMask(v);
  let free = 0;
  for (const x of fn) if (!x) free++;
  const layout = blockLayout(v, ecl, Math.floor(free / 8));
  const data = layout.data.reduce((a, b) => a + b, 0);
  return Math.floor((data * 8 - 4 - (v <= 9 ? 8 : 16)) / 8);
}

/** 剛好塞滿第 v 版的文字（混一點不同的字，資料比較像真的） */
const textForVersion = (v: number, ecl: QrEcl): string =>
  Array.from({ length: byteCapacity(v, ecl) }, (_, i) =>
    String.fromCharCode(97 + ((i * 7) % 26)),
  ).join('');

const decodeCode = (code: QrCode) => decodeQrMatrix(code.size, code.dark);

describe('encodeQr', () => {
  it('自動選模式（同原作）', () => {
    expect(qrAutoMode('0123')).toBe('numeric');
    expect(qrAutoMode('HTTPS://A.B/C')).toBe('alphanumeric');
    expect(qrAutoMode('https://a.b')).toBe('byte');
    expect(qrAutoMode('中文')).toBe('byte');
  });

  it('空白、模式不能用的字、太長、指定的版本放不下', () => {
    expect(encodeQr('')).toEqual({ ok: false, error: { kind: 'empty' } });
    expect(encodeQr('12a', { mode: 'numeric' })).toEqual({
      ok: false,
      error: { kind: 'mode', mode: 'numeric', char: 'a' },
    });
    expect(encodeQr('abc', { mode: 'alphanumeric' })).toMatchObject({
      ok: false,
      error: { kind: 'mode', char: 'a' },
    });
    expect(encodeQr('漢字a', { mode: 'kanji' })).toMatchObject({
      ok: false,
      error: { kind: 'mode', mode: 'kanji', char: 'a' },
    });
    expect(encodeQr('x'.repeat(3000), { ecl: 'H' })).toEqual({
      ok: false,
      error: { kind: 'too-long' },
    });
    const r = encodeQr('x'.repeat(100), { version: 2, ecl: 'Q' });
    expect(r).toEqual({ ok: false, error: { kind: 'version', min: 8 } });
  });

  it('預設等級 Q、版本自動；指定版本時用那一版', () => {
    const a = encodeQr('hello');
    expect(a.ok && a.code.ecl).toBe('Q');
    expect(a.ok && a.code.version).toBe(1);
    const b = encodeQr('hello', { version: 7, ecl: 'L' });
    expect(b.ok && [b.code.version, b.code.size, b.code.ecl]).toEqual([7, 45, 'L']);
  });

  it('中文以 UTF-8 編碼（讀回來是同樣的字）', () => {
    const r = encodeQr('今晚八點開團！🎲', { ecl: 'M' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = decodeCode(r.code);
    expect(d.ok && d.text).toBe('今晚八點開團！🎲');
    expect(d.ok && d.modes).toEqual(['byte']);
  });

  it('漢字模式（Shift_JIS）', () => {
    const r = encodeQr('探索者の手記', { mode: 'kanji', ecl: 'L' });
    expect(r.ok && r.code.mode).toBe('kanji');
    if (!r.ok) return;
    const d = decodeCode(r.code);
    expect(d.ok && d.text).toBe('探索者の手記');
    expect(d.ok && d.modes).toEqual(['kanji']);
  });

  it('同樣的輸入回傳同一個結果（快取）', () => {
    expect(encodeQr('cache me', { ecl: 'H' })).toBe(encodeQr('cache me', { ecl: 'H' }));
  });
});

describe('qrMatrix（id-ticket 用，搬家前後相同）', () => {
  /* 搬家前 id-ticket/qr.ts 的做法 */
  const before = (text: string) => {
    const bytes = new TextEncoder().encode(text);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    const qr = qrcode(0, 'M');
    qr.addData(s, 'Byte');
    qr.make();
    return qr;
  };
  it.each(['EMPLOYEE', 'A-12345', '王小明 警視廳 搜查一課', 'https://example.com/ticket?id=9'])(
    '%s',
    (text) => {
      const m = qrMatrix(text);
      const q = before(text);
      expect(m?.size).toBe(q.getModuleCount());
      for (let r = 0; r < q.getModuleCount(); r++)
        for (let c = 0; c < q.getModuleCount(); c++) expect(m?.dark(r, c)).toBe(q.isDark(r, c));
    },
  );
  it('空白時 null', () => {
    expect(qrMatrix('')).toBeNull();
  });
});

describe('decodeQrMatrix', () => {
  it('40 個版本 × 4 個等級都讀得回來（塞滿那一版）', { timeout: 120_000 }, () => {
    for (let v = 1; v <= 40; v++)
      for (const ecl of ECLS) {
        const text = textForVersion(v, ecl);
        const r = encodeQr(text, { ecl, mode: 'byte', version: v });
        expect(r.ok, `v${v} ${ecl}`).toBe(true);
        /* 多一個字就放不下（真的塞滿了） */
        expect(encodeQr(`${text}z`, { ecl, mode: 'byte', version: v }).ok, `v${v} ${ecl} +1`).toBe(
          false,
        );
        if (!r.ok) continue;
        const d = decodeCode(r.code);
        expect(d.ok, `v${v} ${ecl}`).toBe(true);
        if (!d.ok) continue;
        expect(d.text).toBe(text);
        expect([d.version, d.ecl, d.corrected]).toEqual([v, ecl, 0]);
      }
  });

  it('數字、英數字模式；版本 10、27 的字數欄位長度', () => {
    for (const v of [2, 10, 27]) {
      const n = encodeQr('0123456789'.repeat(3), { version: v, ecl: 'M' });
      expect(n.ok && decodeCode(n.code)).toMatchObject({
        ok: true,
        text: '0123456789'.repeat(3),
        modes: ['numeric'],
      });
      const a = encodeQr('HTTPS://EXAMPLE.COM/$%*+-./: ', { version: v, ecl: 'M' });
      expect(a.ok && decodeCode(a.code)).toMatchObject({
        ok: true,
        text: 'HTTPS://EXAMPLE.COM/$%*+-./: ',
        modes: ['alphanumeric'],
      });
    }
  });

  it('資料區錯幾格：修得回來時回報修了幾個碼字；錯太多時讀不出來', () => {
    const r = encodeQr(textForVersion(5, 'Q'), { ecl: 'Q', version: 5 });
    if (!r.ok) throw new Error('encode');
    const fn = functionMask(5);
    const size = r.code.size;
    const flips = new Set<number>();
    /* 決定性的「亂數」：只翻資料區的格 */
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const damaged = (n: number) => {
      flips.clear();
      while (flips.size < n) {
        const i = next() % (size * size);
        if (!fn[i]) flips.add(i);
      }
      return (row: number, col: number) => r.code.dark(row, col) !== flips.has(row * size + col);
    };
    const light = decodeQrMatrix(size, damaged(6));
    expect(light.ok && light.text).toBe(textForVersion(5, 'Q'));
    expect(light.ok && light.corrected).toBeGreaterThan(0);
    expect(light.ok && light.worst).toBeGreaterThan(0);
    const heavy = decodeQrMatrix(size, damaged(400));
    expect(heavy.ok).toBe(false);
  });

  it('格式資訊錯 3 位元還讀得出來', () => {
    const r = encodeQr('format', { ecl: 'H' });
    if (!r.ok) throw new Error('encode');
    /* 第一份格式資訊的 3 格、第二份不動 */
    const bad = new Set(['0,8', '1,8', '8,3']);
    const d = decodeQrMatrix(
      r.code.size,
      (row, col) => r.code.dark(row, col) !== bad.has(`${row},${col}`),
    );
    expect(d.ok && d.text).toBe('format');
  });

  it('大小不對、全白時讀不出來', () => {
    expect(decodeQrMatrix(20, () => false)).toEqual({ ok: false, reason: 'size' });
    expect(decodeQrMatrix(21, () => false).ok).toBe(false);
  });
});

describe('形狀', () => {
  it('rounded：只有右邊有鄰居時左邊變圓（轉 180°）', () => {
    const d = dotPath('rounded', 10, 20, 10, (dx, dy) => dx === 1 && dy === 0);
    expect(d).toBe('M20 30L20 20L15 20A5 5 0 0 0 15 30Z');
  });
  it('rounded：沒有鄰居是圓、左右都有是方塊', () => {
    expect(dotPath('rounded', 0, 0, 10, () => false)).toBe('M0 5A5 5 0 1 0 10 5A5 5 0 1 0 0 5Z');
    expect(dotPath('rounded', 0, 0, 10, (dx) => dx !== 0)).toBe('M0 0H10V10H0Z');
  });
  it('classy：左上沒有鄰居時左上角變圓', () => {
    const d = dotPath('classy', 0, 0, 10, (dx, dy) => dx === 1 || dy === 1);
    /* 右上角圓的形狀轉 −90°：圓角在左上 */
    expect(d).toBe('M0 10L10 10L10 0L5 0A5 5 0 0 0 0 5Z');
  });
  it('角的外框：square、dot、extra-rounded 是有洞的整塊（evenodd）；點的樣式用 7 × 7 格', () => {
    expect(cornerSquarePath('square', 0, 0, 10)).toEqual({
      d: 'M0 0H70V70H0ZM10 10H60V60H10Z',
      rule: 'evenodd',
    });
    expect(cornerSquarePath('dot', 0, 0, 10).rule).toBe('evenodd');
    const dots = cornerSquarePath('dots', 0, 0, 10);
    expect(dots.rule).toBe('nonzero');
    expect(dots.d.match(/M/g)?.length).toBe(24);
  });
});

const BASE: QrStyle = {
  width: 300,
  height: 300,
  margin: 0,
  shape: 'square',
  dots: { type: 'square', paint: { kind: 'solid', color: '#000000' }, roundSize: true },
  cornerSquare: { type: null, paint: null },
  cornerDot: { type: null, paint: null },
  background: { paint: { kind: 'solid', color: '#ffffff' }, round: 0 },
  image: null,
};

describe('qrImageSize（原作 calculateImageSize 的測試值）', () => {
  it.each([
    [{ originalHeight: 0, originalWidth: 0, maxHiddenDots: 0, dotSize: 0 }, [0, 0, 0, 0]],
    [{ originalHeight: -1, originalWidth: 5, maxHiddenDots: 11, dotSize: -5 }, [0, 0, 0, 0]],
    [{ originalHeight: 20, originalWidth: 10, maxHiddenDots: 1, dotSize: 10 }, [10, 5, 1, 1]],
    [{ originalHeight: 10, originalWidth: 20, maxHiddenDots: 1, dotSize: 10 }, [5, 10, 1, 1]],
    [{ originalHeight: 1000, originalWidth: 2020, maxHiddenDots: 50, dotSize: 10 }, [45, 90, 5, 9]],
    [
      {
        originalHeight: 1000,
        originalWidth: 2020,
        maxHiddenDots: 50,
        dotSize: 10,
        maxHiddenAxisDots: 1,
      },
      [5, 10, 1, 1],
    ],
    [
      {
        originalHeight: 2020,
        originalWidth: 1000,
        maxHiddenDots: 50,
        dotSize: 10,
        maxHiddenAxisDots: 1,
      },
      [10, 5, 1, 1],
    ],
    [
      {
        originalHeight: 2020,
        originalWidth: 1000,
        maxHiddenDots: 50,
        dotSize: 10,
        maxHiddenAxisDots: 2,
      },
      [20, 10, 2, 1],
    ],
  ])('%o', (input, [height, width, hideYDots, hideXDots]) => {
    expect(qrImageSize(input)).toEqual({ height, width, hideYDots, hideXDots });
  });
});

describe('buildQrScene', () => {
  const code = (() => {
    const r = encodeQr('https://example.com/', { ecl: 'Q' });
    if (!r.ok) throw new Error('encode');
    return r.code;
  })();

  it('格子：一格取整數、置中（原作的 roundSize）', () => {
    const s = buildQrScene(code, 'Q', BASE);
    expect(s.ok && s.scene.grid).toEqual({ x: 0, y: 0, cell: 12, count: 25 });
  });

  it('邊距、長方形、不取整數', () => {
    const s = buildQrScene(code, 'Q', { ...BASE, width: 400, height: 300, margin: 20 });
    expect(s.ok && s.scene.grid).toEqual({ x: 75, y: 25, cell: 10, count: 25 });
    const f = buildQrScene(code, 'Q', { ...BASE, dots: { ...BASE.dots, roundSize: false } });
    expect(f.ok && f.scene.grid.cell).toBeCloseTo(12);
    expect(f.ok && f.scene.crisp).toBe(true);
  });

  it('太小時回報', () => {
    expect(buildQrScene(code, 'Q', { ...BASE, width: 20, height: 20 })).toEqual({
      ok: false,
      error: 'too-small',
    });
    expect(buildQrScene(code, 'Q', { ...BASE, margin: 140 }).ok).toBe(false);
  });

  it('角：跟著點時用點的填色；自己的顏色時每個角各自的漸層範圍；中心跟著外框', () => {
    const grad = {
      kind: 'gradient' as const,
      gradient: {
        kind: 'linear' as const,
        angle: 90,
        stops: [
          { offset: 0, color: '#ff0000' },
          { offset: 1, color: '#0000ff' },
        ],
      },
    };
    const s = buildQrScene(code, 'Q', {
      ...BASE,
      cornerSquare: { type: 'extra-rounded', paint: grad },
    });
    if (!s.ok) throw new Error('scene');
    const [dots, sq0, dot0, sq1] = s.scene.layers;
    expect(dots.fill).toEqual({ kind: 'solid', color: '#000000' });
    expect(sq0.fill).toMatchObject({ kind: 'linear', x1: 0, y1: 42, x2: 84, y2: 42 });
    expect(dot0.fill).toBe(sq0.fill);
    /* 右上角多轉 90°：由上往下 */
    expect(sq1.fill).toMatchObject({ kind: 'linear', x1: 258, y1: 0, x2: 258, y2: 84 });
  });

  it('中間的圖：依等級與大小拿掉格子（奇數、置中）', () => {
    const s = buildQrScene(code, 'Q', {
      ...BASE,
      image: { width: 100, height: 100, size: 0.4, margin: 0, hideBackgroundDots: true },
    });
    if (!s.ok) throw new Error('scene');
    /* 0.4 × 25% × 25² = 62 格 → 每邊 7 格 */
    expect(s.scene.hidden).toEqual({ r0: 9, r1: 16, c0: 9, c1: 16 });
    expect(s.scene.image).toEqual({ x: 108, y: 108, width: 84, height: 84 });
  });

  it('圓形：QR code 縮小 √2，外圍補點', () => {
    const sq = buildQrScene(code, 'Q', BASE);
    const ci = buildQrScene(code, 'Q', { ...BASE, shape: 'circle' });
    if (!sq.ok || !ci.ok) throw new Error('scene');
    expect(ci.scene.grid.cell).toBe(Math.floor(300 / Math.SQRT2 / 25));
    expect(ci.scene.layers[0].d.length).toBeGreaterThan(sq.scene.layers[0].d.length);
  });

  it('漸層方向（原作的算法：端點在範圍的邊上）', () => {
    const g = (angle: number) => ({
      kind: 'gradient' as const,
      gradient: {
        kind: 'linear' as const,
        angle,
        stops: [
          { offset: 0, color: '#000' },
          { offset: 1, color: '#fff' },
        ],
      },
    });
    expect(paintFill(g(90), 0, 0, 100, 100)).toMatchObject({ x1: 0, y1: 50, x2: 100, y2: 50 });
    expect(paintFill(g(180), 0, 0, 100, 100)).toMatchObject({ x1: 50, y1: 0, x2: 50, y2: 100 });
    expect(paintFill(g(135), 0, 0, 100, 100)).toMatchObject({ x1: 0, y1: 0, x2: 100, y2: 100 });
    expect(paintFill(g(270), 0, 0, 100, 100)).toMatchObject({ x1: 100, y1: 50, x2: 0, y2: 50 });
    expect(
      paintFill(
        {
          kind: 'gradient',
          gradient: {
            kind: 'radial',
            angle: 0,
            stops: [
              { offset: 1, color: '#000' },
              { offset: 0, color: '#fff' },
            ],
          },
        },
        0,
        0,
        300,
        200,
      ),
    ).toEqual({
      kind: 'radial',
      cx: 150,
      cy: 100,
      r: 150,
      stops: [
        { offset: 0, color: '#fff' },
        { offset: 1, color: '#000' },
      ],
    });
  });
});

describe('對比', () => {
  it('黑點白底 21:1；反色；漸層取最差的色標；透明背景當白底', () => {
    const solid = (color: string) => ({ kind: 'solid' as const, color });
    expect(qrPaintContrast([solid('#000000')], solid('#ffffff'))).toEqual({
      ratio: 21,
      inverted: false,
    });
    expect(qrPaintContrast([solid('#ffffff')], solid('#000000'))).toEqual({
      ratio: 21,
      inverted: true,
    });
    const grad = {
      kind: 'gradient' as const,
      gradient: {
        kind: 'linear' as const,
        angle: 90,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#cccccc' },
        ],
      },
    };
    expect(qrPaintContrast([grad], solid('#ffffff')).ratio).toBeLessThan(1.7);
    expect(qrPaintContrast([solid('#000000')], null).ratio).toBe(21);
  });
  it('Otsu：兩群的中間', () => {
    const t = otsuThreshold([10, 12, 11, 200, 210, 205]);
    expect(t).toBeGreaterThan(12);
    expect(t).toBeLessThan(200);
  });
});

/* ---------- SVG → 點陣 → 讀回來（node-canvas 有裝時） ---------- */

interface NodeCanvasModule {
  createCanvas(
    w: number,
    h: number,
  ): {
    getContext(k: '2d'): {
      fillStyle: string;
      fillRect(x: number, y: number, w: number, h: number): void;
      drawImage(img: unknown, x: number, y: number): void;
      getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
    };
  };
  loadImage(src: unknown): Promise<unknown>;
}
const canvasMod = await (async (): Promise<NodeCanvasModule | null> => {
  try {
    const name = 'canvas';
    const m = (await import(/* @vite-ignore */ name)) as Partial<NodeCanvasModule> & {
      default?: NodeCanvasModule;
    };
    const mod = (typeof m.loadImage === 'function' ? m : m.default) as NodeCanvasModule | undefined;
    return mod && typeof mod.loadImage === 'function' ? mod : null;
  } catch {
    return null;
  }
})();

/** Node 的 Buffer（單元測試的型別沒有 Node） */
const NodeBuffer = (globalThis as unknown as { Buffer: { from(s: string): unknown } }).Buffer;

/** 2 × 2 的紅色 PNG（中間的圖） */
const RED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP4z8DwnwGMgRQAH+4D/dJQfRoAAAAASUVORK5CYII=';

describe.runIf(canvasMod)('SVG 畫成點陣後讀得回來', () => {
  const text = 'https://example.com/scenario/克蘇魯';
  const solid = (color: string) => ({ kind: 'solid' as const, color });
  const cases: [string, Partial<QrStyle>][] = [
    ['預設', {}],
    [
      '圓點＋點狀的角',
      {
        dots: { type: 'dots', paint: solid('#1d2b53'), roundSize: true },
        cornerSquare: { type: 'dot', paint: null },
        cornerDot: { type: 'dot', paint: null },
      },
    ],
    [
      'rounded＋漸層',
      {
        dots: {
          type: 'rounded',
          roundSize: true,
          paint: {
            kind: 'gradient',
            gradient: {
              kind: 'linear',
              angle: 135,
              stops: [
                { offset: 0, color: '#3a0ca3' },
                { offset: 1, color: '#0b525b' },
              ],
            },
          },
        },
        cornerSquare: { type: 'extra-rounded', paint: solid('#7a0d0d') },
      },
    ],
    [
      'classy-rounded＋放射漸層背景',
      {
        dots: { type: 'classy-rounded', paint: solid('#2b1b0e'), roundSize: true },
        background: {
          paint: {
            kind: 'gradient',
            gradient: {
              kind: 'radial',
              angle: 0,
              stops: [
                { offset: 0, color: '#fffaf0' },
                { offset: 1, color: '#e9d8b4' },
              ],
            },
          },
          round: 0.2,
        },
      },
    ],
    [
      '圓形＋圖（拿掉後面的點）',
      {
        shape: 'circle',
        dots: { type: 'extra-rounded', paint: solid('#000000'), roundSize: true },
        background: { paint: solid('#ffffff'), round: 1 },
        image: { width: 2, height: 2, size: 0.4, margin: 2, hideBackgroundDots: true },
      },
    ],
    [
      'classy＋圖蓋在點上（不拿掉）',
      {
        dots: { type: 'classy', paint: solid('#000000'), roundSize: true },
        image: { width: 2, height: 2, size: 0.3, margin: 0, hideBackgroundDots: false },
      },
    ],
  ];
  it.each(cases)('%s', async (_name, patch) => {
    const r = encodeQr(text, { ecl: 'H' });
    if (!r.ok) throw new Error('encode');
    const style = { ...BASE, ...patch } as QrStyle;
    const s = buildQrScene(r.code, 'H', style);
    if (!s.ok) throw new Error('scene');
    const svg = qrSceneToSvg(s.scene, { imageHref: RED_PNG });
    const mod = canvasMod as NodeCanvasModule;
    const img = await mod.loadImage(NodeBuffer.from(svg));
    const c = mod.createCanvas(300, 300);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    /* librsvg 不畫 data: 網址的圖：自己在圖的位置塗上紅色（中間的圖蓋住格子） */
    const box = s.scene.image;
    if (box) {
      ctx.fillStyle = '#d02020';
      ctx.fillRect(box.x, box.y, box.width, box.height);
    }
    const pixels = ctx.getImageData(0, 0, 300, 300).data;
    const check = checkQrPixels({
      pixels,
      width: 300,
      height: 300,
      grid: s.scene.grid,
      expected: r.code,
    });
    expect(check.decoded.ok && check.decoded.text).toBe(text);
    if (!style.image) expect(check.wrong).toBe(0);
    if (style.image && !style.image.hideBackgroundDots) {
      expect(check.decoded.ok && check.decoded.corrected).toBeGreaterThan(0);
    }
  });

  it('SVG 的結構：漸層、evenodd、圖、crispEdges', () => {
    const r = encodeQr('svg', { ecl: 'M' });
    if (!r.ok) throw new Error('encode');
    const s = buildQrScene(r.code, 'M', {
      ...BASE,
      dots: {
        type: 'square',
        roundSize: false,
        paint: {
          kind: 'gradient',
          gradient: {
            kind: 'radial',
            angle: 0,
            stops: [
              { offset: 0, color: '#00000080' },
              { offset: 1, color: '#123456' },
            ],
          },
        },
      },
      cornerSquare: { type: 'square', paint: null },
      background: { paint: null, round: 0 },
      image: { width: 2, height: 2, size: 0.4, margin: 0, hideBackgroundDots: true },
    });
    if (!s.ok) throw new Error('scene');
    const svg = qrSceneToSvg(s.scene, { imageHref: RED_PNG, scale: 2 });
    expect(svg.startsWith('<?xml version="1.0" standalone="no"?>\n<svg ')).toBe(true);
    expect(svg).toContain(
      'width="600" height="600" viewBox="0 0 300 300" shape-rendering="crispEdges"',
    );
    expect(svg).toContain('<radialGradient id="qr-gradient-0"');
    expect(svg).toContain('stop-color="#000000" stop-opacity="0.502"');
    expect(svg).toContain('fill-rule="evenodd" fill="url(#qr-gradient-0)"');
    expect(svg).not.toContain('<rect');
    expect(svg).toContain(`<image href="${RED_PNG}"`);
    /* 同一個漸層只定義一次 */
    expect(svg.match(/<radialGradient/g)?.length).toBe(1);
  });
});
