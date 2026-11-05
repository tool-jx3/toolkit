/**
 * 錄影帶畫面產生器：沒用到 2026-11-05 跟進原作加的功能（場景、開場與收尾、日期戳記、字幕的樣式、色調、效果的開關…）時，
 * 匯出 PNG、GIF、APNG、WebP 畫出來的指令、交給編碼器的設定與每一格的延遲，和加入之前完全相同
 * （指令相同＝像素相同＝輸出逐位元組相同；規格 1.10、D16）。
 *
 * 基準檔 `fixtures/vhs-frame-golden.json` 是**加入之前**的程式（commit 05ed1f9）用這個檔案產生的：
 * 幾組舊版就有的內容（照片、位置、字幕、左上文字、時間碼、字型、磨損度、比例）× 四種格式（動畫大小、播放次數、減色）
 * × 畫布支援／不支援濾鏡，每一組的畫布指令（每張畫布各自編號；量字是固定寬度，和字型、環境無關）、編碼器設定、
 * 影格延遲與匯出結果的說明的 SHA-256。
 * 要刻意改變外觀時，用 `VHS_FRAME_GOLDEN_WRITE=1 npx vitest run tests/unit/vhs-frame-golden.test.ts` 重新產生並在規格寫明。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bytesToHex, sha256Sync } from '@/core/files';

/* ---------- 記錄畫布指令的假畫布（每張畫布一個編號，所有畫布記在同一份紀錄裡） ---------- */

const rec = vi.hoisted(() => {
  const state = {
    log: [] as unknown[],
    seq: 0,
    prefix: 'c',
    filter: true,
  };
  /* ImageData 的內容：FNV-1a（putImageData 的雜訊顆粒、調色後的像素） */
  const fnv = (d: ArrayLike<number>): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) {
      h ^= d[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  };
  const arg = (v: unknown): unknown => {
    if (v && typeof v === 'object') {
      const o = v as { __id?: string; data?: unknown };
      if (o.__id) return o.__id;
      if (o.data instanceof Uint8ClampedArray) return `imagedata:${fnv(o.data)}`;
      return 'object';
    }
    return v;
  };
  const makeCtx = (canvas: { __id: string; width: number; height: number }) => {
    let props: Record<string, unknown> = { globalAlpha: 1 };
    const stack: Record<string, unknown>[] = [];
    let grad = 0;
    const id = canvas.__id;
    const push = (...a: unknown[]) => state.log.push([id, ...a]);
    const methods: Record<string, (...a: unknown[]) => unknown> = {
      save() {
        stack.push({ ...props });
        push('save');
      },
      restore() {
        props = stack.pop() ?? props;
        push('restore');
      },
      createLinearGradient: (...a) => {
        const gid = `${id}:linear#${++grad}`;
        push('linear', ...a, gid);
        return { __id: gid, addColorStop: (o: number, c: string) => push('stop', gid, o, c) };
      },
      createRadialGradient: (...a) => {
        const gid = `${id}:radial#${++grad}`;
        push('radial', ...a, gid);
        return { __id: gid, addColorStop: (o: number, c: string) => push('stop', gid, o, c) };
      },
      createPattern: (...a) => {
        const pid = `${id}:pattern#${++grad}`;
        push('pattern', ...a.map(arg), pid);
        return { __id: pid };
      },
      measureText: (s) => ({ width: String(s).length * 10 }),
      createImageData: (w, h) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray((w as number) * (h as number) * 4),
      }),
      getImageData: (...a) => {
        push('getImageData', ...a);
        const w = a[2] as number;
        const h = a[3] as number;
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i++) data[i] = (i * 7) & 255;
        return { width: w, height: h, data };
      },
    };
    const reset = () => {
      props = { globalAlpha: 1 };
      stack.length = 0;
    };
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, key) {
        if (key === 'canvas') return canvas;
        if (typeof key !== 'string') return undefined;
        if (key in methods) return methods[key];
        if (key in props) return props[key];
        return (...a: unknown[]) => push(key, ...a.map(arg));
      },
      set(_t, key, value) {
        props[key as string] = value;
        push('=', key, arg(value));
        return true;
      },
    });
    return { ctx, reset };
  };
  const canvas = (w: number, h: number) => {
    const c = {
      __id: `${state.prefix}${state.seq++}`,
      _w: Math.max(1, Math.ceil(w)),
      _h: Math.max(1, Math.ceil(h)),
      get width() {
        return this._w;
      },
      set width(v: number) {
        this._w = v;
        state.log.push([this.__id, 'width', v]);
        this._ctx?.reset();
      },
      get height() {
        return this._h;
      },
      set height(v: number) {
        this._h = v;
        state.log.push([this.__id, 'height', v]);
        this._ctx?.reset();
      },
      _ctx: null as null | { ctx: unknown; reset: () => void },
      getContext() {
        if (!this._ctx) this._ctx = makeCtx(this);
        return this._ctx.ctx;
      },
    };
    return c;
  };
  return { state, canvas };
});

vi.mock('@/core/image', async (orig) => ({
  ...(await orig<typeof import('@/core/image')>()),
  makeCanvas: (w: number, h: number) => rec.canvas(w, h),
  canvasToBlob: async (c: { __id: string }, type?: string) => {
    rec.state.log.push(['toBlob', c.__id, type]);
    return new Blob([]);
  },
}));
vi.mock('@/core/scene', async (orig) => ({
  ...(await orig<typeof import('@/core/scene')>()),
  canvasFilterSupported: () => rec.state.filter,
}));
vi.mock('@/core/encode', () => ({
  createEncoder: (spec: { format: string }) => {
    rec.state.log.push(['encoder', spec]);
    let n = 0;
    return {
      addFrame: async (_px: unknown, delay: number) => {
        n++;
        rec.state.log.push(['addFrame', delay]);
      },
      finish: async () => ({
        bytes: new Uint8Array(0),
        mime: `image/${spec.format}`,
        frames: n,
        storedFrames: n,
        colors: spec.format === 'gif' ? { count: 64, lossless: false } : undefined,
      }),
      abort: () => {},
    };
  },
}));

const { runExport } = await import('@/tools/vhs-frame/exporter');
const { initialState } = await import('@/tools/vhs-frame/model');
const { noiseTiles } = await import('@/tools/vhs-frame/render');
type VhsState = import('@/tools/vhs-frame/model').VhsState;

const FS = 'node:fs';
const { existsSync, readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, enc: 'utf8') => string;
  writeFileSync: (p: string, data: string) => void;
};
const ENV =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const WRITE = ENV.VHS_FRAME_GOLDEN_WRITE === '1';
/** 對不上時找差異用：VHS_FRAME_GOLDEN_DUMP=<資料夾> 把每一組的指令寫成 JSON */
const DUMP = ENV.VHS_FRAME_GOLDEN_DUMP;
const FIXTURE = new URL('./fixtures/vhs-frame-golden.json', import.meta.url).pathname;

const hash = (v: unknown) => bytesToHex(sha256Sync(new TextEncoder().encode(JSON.stringify(v))));

/* ---------- 舊版就有的內容 ---------- */

const photoOf = (w: number, h: number, name: string) => ({
  ref: { id: `p${w}x${h}`, name, width: w, height: h },
  src: { __id: `photo${w}x${h}`, width: w, height: h } as unknown as CanvasImageSource,
});
const WIDE = photoOf(1600, 1000, 'shot.jpg');
const TALL = photoOf(900, 1600, 'tall.png');

type Case = { s: VhsState; photo: CanvasImageSource | null };

function cases(): Record<string, Case> {
  const d = initialState();
  return {
    default: { s: d, photo: null },
    photo: {
      s: {
        ...d,
        photo: WIDE.ref,
        view: { zoom: 1.3, x: 0.05, y: -0.02 },
        caption: '凌晨三點十四分\n走廊的門自己打開了',
        osd: 'REC ●',
        wear: 80,
      },
      photo: WIDE.src,
    },
    wide169: {
      s: {
        ...d,
        photo: WIDE.ref,
        view: { zoom: 2.2, x: -0.1, y: 0.08 },
        caption: '第一行\n第二行\n第三行不會畫',
        osd: '',
        osdFont: 'pixel',
        timecode: { mode: 'clock', tape: 14, clock: '2026-12-31 23:59:58' },
        wear: 100,
        aspect: '16:9',
      },
      photo: WIDE.src,
    },
    tall: {
      s: {
        ...d,
        photo: TALL.ref,
        view: { zoom: 0.5625, x: 0, y: 0 },
        caption: '\n只有第二行',
        osd: 'CAM 01',
        timecode: { mode: 'off', tape: 14, clock: d.timecode.clock },
        wear: 0,
      },
      photo: TALL.src,
    },
    long: {
      s: {
        ...d,
        caption: '這一行字幕非常非常長，長到一定會超出畫面的寬度，所以要縮小才放得下',
        osd: '▶ PLAY',
        timecode: { mode: 'tape', tape: 3599, clock: d.timecode.clock },
        wear: 33,
      },
      photo: null,
    },
  };
}

interface Job {
  format: 'png' | 'gif' | 'apng' | 'webp';
  animSize: number;
  plays: number;
  quantize: boolean;
  tapeTime: number;
  pngSize?: number;
  gifColors?: number;
}

const JOBS: Record<string, Job> = {
  'png@0': { format: 'png', animSize: 0, plays: 0, quantize: false, tapeTime: 0 },
  'png@7.25': { format: 'png', animSize: 0, plays: 0, quantize: false, tapeTime: 7.25 },
  'png@13.375': { format: 'png', animSize: 0, plays: 0, quantize: false, tapeTime: 13.375 },
  gif: { format: 'gif', animSize: 0, plays: 0, quantize: false, tapeTime: 3 },
  'gif-large-3': { format: 'gif', animSize: 2, plays: 3, quantize: false, tapeTime: 0 },
  'apng-mid': { format: 'apng', animSize: 1, plays: 0, quantize: true, tapeTime: 0 },
  webp: { format: 'webp', animSize: 0, plays: 1, quantize: false, tapeTime: 0 },
};

/** 匯出一次，回傳畫布指令與結果的說明 */
async function exportRaw(c: Case, job: Job, filter = true) {
  rec.state.filter = filter;
  rec.state.log = [];
  rec.state.seq = 0;
  rec.state.prefix = 'c';
  const out = await runExport(c.s, c.photo, job, {
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  const { blob: _blob, ...meta } = out;
  return { log: rec.state.log as unknown[][], meta };
}

/** 匯出一次：畫布指令＋編碼器＋結果的說明（不含檔案內容；指令相同時檔案相同） */
async function exportLog(key: string, c: Case, job: Job, filter: boolean): Promise<string> {
  const { log, meta } = await exportRaw(c, job, filter);
  if (DUMP)
    writeFileSync(
      `${DUMP}/${key.replace(/\//g, '_')}.json`,
      JSON.stringify([log, meta]).replace(/\],\[/g, '],\n['),
    );
  return hash([log, meta]);
}

async function all(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, c] of Object.entries(cases()))
    for (const [jn, job] of Object.entries(JOBS))
      out[`${name}/${jn}`] = await exportLog(`${name}/${jn}`, c, job, true);
  /* 畫布不支援濾鏡（逐像素調色，D13） */
  for (const name of ['photo', 'wide169']) {
    const key = `${name}/png@7.25/no-filter`;
    out[key] = await exportLog(key, cases()[name], JOBS['png@7.25'], false);
  }
  return out;
}

describe('vhs-frame：沒用新功能時匯出的畫法不變', () => {
  let noiseLog = '';
  beforeAll(() => {
    /* 雜訊顆粒在第一次畫的時候做好、之後共用：先做好（內容也記下來），各組的畫布編號才不受先後影響 */
    rec.state.prefix = 'noise';
    rec.state.seq = 0;
    rec.state.log = [];
    expect(noiseTiles()).toHaveLength(6);
    noiseLog = hash(rec.state.log);
  });

  it('PNG、GIF、APNG、WebP 的畫布指令、編碼器設定與影格延遲和加入新功能之前相同', async () => {
    const got: Record<string, string> = { noise: noiseLog, ...(await all()) };
    if (WRITE || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, `${JSON.stringify(got, null, 2)}\n`);
      if (!WRITE) throw new Error('基準檔不存在，已產生；請確認後再跑一次');
    }
    const want = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, string>;
    expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
    for (const k of Object.keys(want)) expect(got[k], k).toBe(want[k]);
  });
});

/* ---------- 新功能有作用（同一個記錄器） ---------- */

/** 指令裡的文字（fillText 的字、填色、對齊） */
const texts = (log: unknown[][]) =>
  log
    .filter((e) => e[1] === 'fillText')
    .map((e) => e[2] as string)
    .filter((t) => t !== 'NO SIGNAL');
const has = (log: unknown[][], pred: (e: unknown[]) => boolean) => log.some(pred);

describe('vhs-frame：新功能有作用', () => {
  const base = () => cases().photo;
  const png = JOBS['png@7.25'];
  const gif = JOBS.gif;
  beforeAll(() => {
    rec.state.prefix = 'noise';
    noiseTiles();
  });

  it('預設值明寫（PNG 1280、GIF 64 色）時和基準相同', async () => {
    const want = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, string>;
    expect(await exportLog('x', base(), { ...png, pngSize: 1 }, true)).toBe(want['photo/png@7.25']);
    expect(await exportLog('x', base(), { ...gif, gifColors: 64 }, true)).toBe(want['photo/gif']);
  });

  it('日期戳記：右下兩行（時間、日期），橘色；開著時下方的字幕往上 0.075H', async () => {
    const c = base();
    const off = await exportRaw(c, png);
    const on = await exportRaw(
      { ...c, s: { ...c.s, stamp: { ...c.s.stamp, on: true, value: '1999-08-14 16:20' } } },
      png,
    );
    expect(texts(on.log)).toEqual(expect.arrayContaining(['PM 4:20', 'AUG. 14 1999']));
    expect(has(on.log, (e) => e[1] === '=' && e[2] === 'fillStyle' && e[3] === '#FFB23E')).toBe(
      true,
    );
    const capY = (log: unknown[][]) =>
      log.find((e) => e[1] === 'strokeText' && e[2] === '走廊的門自己打開了')?.[4] as number;
    expect(capY(off.log) - capY(on.log)).toBeCloseTo(960 * 0.075, 6);
  });

  it('字幕：黑底（不描邊）、黃字、明體、上方、大小', async () => {
    const c = base();
    const run = (style: Partial<VhsState['captionStyle']>) =>
      exportRaw({ ...c, s: { ...c.s, captionStyle: { ...c.s.captionStyle, ...style } } }, png);
    const box = await run({ look: 'box' });
    expect(has(box.log, (e) => e[1] === 'strokeText')).toBe(false);
    expect(has(box.log, (e) => e[1] === '=' && e[3] === 'rgba(0,0,0,0.62)')).toBe(true);
    const yellow = await run({ look: 'yellow' });
    expect(has(yellow.log, (e) => e[1] === '=' && e[3] === '#FFE45C')).toBe(true);
    const serif = await run({ font: 'serif' });
    expect(has(serif.log, (e) => e[1] === '=' && String(e[3]).includes('Noto Serif TC'))).toBe(
      true,
    );
    const top = await run({ position: 'top' });
    const y = top.log.find((e) => e[1] === 'strokeText')?.[4] as number;
    /* 有左上文字：round(0.15H) ＋ 字級 60 */
    expect(y).toBe(Math.round(960 * 0.15) + 60);
    const big = await run({ size: 140 });
    expect(
      has(
        big.log,
        (e) => e[1] === '=' && String(e[3]).startsWith(`700 ${Math.round(960 * 0.062 * 1.4)}px`),
      ),
    ).toBe(true);
  });

  it('色調、亮度、左右反轉：照片層的濾鏡、夜視的綠色、鏡射', async () => {
    const c = base();
    const night = await exportRaw(
      { ...c, s: { ...c.s, picture: { ...c.s.picture, tone: 'night', brightness: 110 } } },
      png,
    );
    expect(
      has(
        night.log,
        (e) =>
          e[2] === 'filter' &&
          e[3] === 'grayscale(1) contrast(1.2) brightness(1.15) brightness(1.1)',
      ),
    ).toBe(true);
    expect(has(night.log, (e) => e[3] === '#6DFF8E')).toBe(true);
    const flip = await exportRaw({ ...c, s: { ...c.s, flip: true } }, png);
    expect(has(flip.log, (e) => e[1] === 'scale' && e[2] === -1 && e[3] === 1)).toBe(true);
  });

  it('弧面 0、暗角 0、沒有圓角、效果全關：不伸長、不畫暗角、不裁圓角、不畫雜訊與掃描線', async () => {
    const c = base();
    const plain = await exportRaw(
      {
        ...c,
        s: {
          ...c.s,
          picture: { ...c.s.picture, curve: 0, vignette: 0, corners: false },
          effects: {
            chroma: false,
            tear: false,
            dropout: false,
            tracking: false,
            noise: false,
            scan: false,
            hum: false,
            flicker: false,
          },
        },
      },
      png,
    );
    expect(has(plain.log, (e) => e[1] === 'radial')).toBe(false);
    expect(has(plain.log, (e) => e[3] === 'destination-in')).toBe(false);
    expect(has(plain.log, (e) => e[3] === 'overlay')).toBe(false);
    expect(has(plain.log, (e) => e[1] === 'pattern')).toBe(false);
    /* 弧面 0：輸出只畫一次訊號層 */
    expect(plain.log.filter((e) => e[0] === 'c0' && e[1] === 'drawImage')).toHaveLength(1);
  });

  it('閃爍、「●」閃爍與暫停的雜訊帶', async () => {
    const c = base();
    const flick = await exportRaw(
      { ...c, s: { ...c.s, effects: { ...c.s.effects, flicker: true } } },
      png,
    );
    expect(
      has(flick.log, (e) => e[2] === 'fillStyle' && /^rgba\(0,0,0,0\.\d{3}\)$/.test(String(e[3]))),
    ).toBe(true);
    /* t＝0.7：「●」暗的那一下（不畫）；關掉動態時照畫 */
    const at = { ...png, tapeTime: 0.7 };
    const blink = await exportRaw({ ...c, s: { ...c.s, osdMotion: true } }, at);
    expect(texts(blink.log)).not.toContain('●');
    expect(texts((await exportRaw(c, at)).log)).toContain('●');
    /* PAUSE：追蹤條不畫（t＝5 時本來有）、多一條裁切的雜訊帶 */
    const t5 = { ...png, tapeTime: 5 };
    const pause = await exportRaw({ ...c, s: { ...c.s, osd: 'PAUSE', osdMotion: true } }, t5);
    const plain = await exportRaw({ ...c, s: { ...c.s, osd: 'PAUSE' } }, t5);
    expect(has(plain.log, (e) => e[1] === 'drawImage' && e[2] === 'c7')).toBe(true);
    expect(has(pause.log, (e) => e[1] === 'clip')).toBe(true);
    expect(has(plain.log, (e) => e[1] === 'clip')).toBe(false);
  });

  it('右上角的頻道', async () => {
    const c = base();
    const ch = await exportRaw(
      { ...c, s: { ...c.s, channel: '12', timecode: { ...c.s.timecode, mode: 'channel' } } },
      png,
    );
    expect(texts(ch.log)).toContain('CH 12');
  });

  it('動畫：開場 18 格＋收尾 8 格（共 50 格、4.5 秒）；開場有頻道與收訊格，收尾整張重畫後再裁圓角', async () => {
    const c = base();
    const s = { ...c.s, anim: { ...c.s.anim, intro: true, outro: true } };
    const out = await exportRaw({ ...c, s }, gif);
    expect(out.log.filter((e) => e[0] === 'addFrame')).toHaveLength(50);
    expect(out.meta.duration).toBeCloseTo(4.5, 9);
    expect(texts(out.log)).toEqual(expect.arrayContaining(['CH 01', 'CH 02', 'CH 03']));
    expect(has(out.log, (e) => e[3] === '#030406')).toBe(true);
    expect(has(out.log, (e) => e[2] === 'shadowColor')).toBe(true);
  });

  it('場景：GIF 依序換場景；PNG 用選的場景', async () => {
    const c = base();
    const s = { ...c.s, caption: '第一個場景\n\n第二個場景', scene: 1 };
    const g = await exportRaw({ ...c, s }, gif);
    expect(g.log.filter((e) => e[0] === 'addFrame')).toHaveLength(32);
    const t = texts(g.log);
    expect(t).toContain('第一個場景');
    expect(t).toContain('第二個場景');
    expect(t.indexOf('第一個場景')).toBeLessThan(t.indexOf('第二個場景'));
    const p = await exportRaw({ ...c, s }, png);
    expect(texts(p.log)).toContain('第二個場景');
    expect(texts(p.log)).not.toContain('第一個場景');
  });

  it('PNG 1920 寬、GIF 256 色', async () => {
    const big = await exportRaw(base(), { ...png, pngSize: 2 });
    expect([big.meta.width, big.meta.height]).toEqual([1920, 1440]);
    const g = await exportRaw(base(), { ...gif, gifColors: 256 });
    const enc = g.log.find((e) => e[0] === 'encoder')?.[1] as { options: { maxColors: number } };
    expect(enc.options.maxColors).toBe(256);
  });
});
