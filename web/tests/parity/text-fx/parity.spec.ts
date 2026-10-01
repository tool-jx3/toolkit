/**
 * text-fx 對等驗證：同時開舊版（tools/text-fx/）與新版（next/text-fx/），
 * 每個案例在兩邊用同一份設定建場景，抽固定時間點（0、25%、50%、75%、100% 與各階段交界）畫出影格比對；
 * 匯出檔（APNG、PNG、ZIP）兩邊各匯出一次後解碼比對影格數、延遲與像素；
 * 另外量長動畫、大畫面的匯出時間（兩邊輪流跑，不搶 CPU）。
 *
 * 兩邊都把 Google Fonts 換成空樣式，所以都用同一套本機替代字型。
 * 結果：tests/parity/text-fx/out/results.json、report.md；有差異的影格存 old／new／diff 圖。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { composeApng, decodePixels, parseApng, parseChunks, readIhdr } from '../../helpers/png';
import { buildExportRecipes, buildRecipes, type ExportRecipe, type Recipe, TEXTS } from './cases';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
const ONLY = process.env.PARITY_ONLY ? new RegExp(process.env.PARITY_ONLY) : null;
/** 每像素（預乘 alpha 後 RGBA 最大差）超過這個值才算「不同」 */
const PX_TOL = 2;

/* ---------- PNG 小工具（Node 端） ---------- */

function decodePng(bytes: Uint8Array): { w: number; h: number; px: Uint8Array } {
  const chunks = parseChunks(bytes);
  const ih = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT');
  const all = new Uint8Array(idat.reduce((s, c) => s + c.data.length, 0));
  let o = 0;
  for (const c of idat) {
    all.set(c.data, o);
    o += c.data.length;
  }
  const plte = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;
  return {
    w: ih.width,
    h: ih.height,
    px: decodePixels(all, ih.width, ih.height, ih.colorType, plte, trns),
  };
}

const dataUrlBytes = (u: string) =>
  new Uint8Array(Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'));

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(px: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++)
    Buffer.from(px.subarray(y * w * 4, (y + 1) * w * 4)).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

interface DiffStats {
  maxDiff: number;
  diffPx: number;
  ratio: number;
}

/** 預乘 alpha 後逐像素比較；回傳統計與差異圖（紅＝不同） */
function diffPixels(
  a: Uint8Array,
  b: Uint8Array,
  w: number,
  h: number,
): DiffStats & { img: Uint8Array } {
  const img = new Uint8Array(w * h * 4);
  let maxDiff = 0;
  let diffPx = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const aa = a[o + 3];
    const ba = b[o + 3];
    let d = Math.abs(aa - ba);
    for (let k = 0; k < 3; k++)
      d = Math.max(d, Math.abs((a[o + k] * aa) / 255 - (b[o + k] * ba) / 255));
    d = Math.round(d);
    if (d > maxDiff) maxDiff = d;
    const g = Math.round((b[o] + b[o + 1] + b[o + 2]) / 3) * (ba / 255) * 0.5;
    if (d > PX_TOL) {
      diffPx++;
      img[o] = 255;
      img[o + 1] = 0;
      img[o + 2] = 0;
    } else {
      img[o] = g;
      img[o + 1] = g;
      img[o + 2] = g;
    }
    img[o + 3] = 255;
  }
  return { maxDiff, diffPx, ratio: diffPx / (w * h), img };
}

/* ---------- 頁面端的協助函式 ---------- */

async function openPages(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  const errors: string[] = [];
  const oldPage = await ctx.newPage();
  const newPage = await ctx.newPage();
  for (const [name, p] of [
    ['old', oldPage],
    ['new', newPage],
  ] as const) {
    p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`);
    });
  }
  await oldPage.goto('/tools/text-fx/');
  await newPage.goto('/next/text-fx/');
  await oldPage.waitForFunction(() => !!(window as unknown as { __textFx?: unknown }).__textFx);
  await newPage.waitForFunction(
    () => !!(window as unknown as { __textFx?: { lib?: unknown } }).__textFx?.lib,
  );
  /* 舊版：載入舊版的模組（與舊版頁面用的是同一份） */
  await oldPage.evaluate(async () => {
    const w = window as unknown as Record<string, unknown>;
    const scene = await import('./js/scene.js' as string);
    const lib = await import('./js/library.js' as string);
    const exporter = await import('./js/exporter.js' as string);
    w.__parityMods = { scene, lib, exporter };
  });
  for (const p of [oldPage, newPage]) {
    const side: 'old' | 'new' = p === oldPage ? 'old' : 'new';
    await p.evaluate<void, 'old' | 'new'>(installHelpers, side);
  }
  return { ctx, oldPage, newPage, errors };
}

/** 在頁面裡安裝 window.__parity（舊版、新版用同一段程式，差別只在建場景與匯出） */
function installHelpers(side: 'old' | 'new') {
  // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
  type Any = Record<string, any>;
  const w = window as unknown as Any;
  const deepMerge = (base: Any, patch: Any): Any => {
    for (const [k, v] of Object.entries(patch || {})) {
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        base[k] &&
        typeof base[k] === 'object' &&
        !Array.isArray(base[k])
      )
        deepMerge(base[k], v as Any);
      else base[k] = Array.isArray(v) ? v.slice() : v;
    }
    return base;
  };
  const setPath = (o: Any, p: string, v: unknown) => {
    const ks = p.split('.');
    let x = o;
    for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]];
    x[ks[ks.length - 1]] = v;
  };
  const cache = new Map<string, Any>();
  const build = async (cfg: Any): Promise<Any> => {
    const key = JSON.stringify(cfg);
    const hit = cache.get(key);
    if (hit) return hit;
    let sc: Any;
    if (side === 'old') {
      sc = await w.__parityMods.scene.buildScene(JSON.parse(key), { waitFonts: true });
    } else {
      const lib = w.__textFx.lib;
      const n = lib.normalizeSettings(cfg.mode, JSON.parse(key));
      await lib.loadFonts(lib.sceneFontLoads(n), 12000);
      sc = lib.buildScene(n);
    }
    cache.clear();
    cache.set(key, sc);
    return sc;
  };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const drawAt = (sc: Any, t: number) => {
    if (canvas.width !== sc.W || canvas.height !== sc.H) {
      canvas.width = sc.W;
      canvas.height = sc.H;
    }
    sc.draw(ctx, t);
  };
  const hashNow = () => {
    const u = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    let h = 2166136261;
    let h2 = 0;
    for (let i = 0; i < u.length; i++) {
      h = Math.imul(h ^ u[i], 16777619);
      h2 = (h2 + u[i] * (i + 1)) % 4294967291;
    }
    return `${(h >>> 0).toString(16)}-${h2.toString(16)}`;
  };
  const b64 = (bytes: Uint8Array) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  w.__parity = {
    /** 舊版：依配方組出設定（舊格式） */
    makeCfg(r: Any, texts: Any) {
      const lib = w.__parityMods.lib;
      let c: Any;
      if (r.tpl) c = lib.settingsFromTemplate(r.mode, lib.templateById(r.mode, r.tpl));
      else {
        c = lib.baseSettings(r.mode);
        c.text = texts[r.mode].text;
        c.sub = texts[r.mode].sub;
      }
      if (r.text !== undefined) c.text = r.text;
      if (r.sub !== undefined) c.sub = r.sub;
      if (r.kit)
        deepMerge(
          c,
          JSON.parse(JSON.stringify(lib.STYLE_KITS.find((k: Any) => k.id === r.kit).patch)),
        );
      if (r.intro) c.intro = lib.introOf(r.intro[0], r.intro[1] || {});
      if (r.outro) c.outro = lib.outroOf(r.outro[0], r.outro[1] || {});
      for (const [p, v] of Object.entries(r.set || {}))
        setPath(c, p, JSON.parse(JSON.stringify(v)));
      return c;
    },
    async meta(cfg: Any) {
      const sc = await build(cfg);
      return {
        W: sc.W,
        H: sc.H,
        S: Math.round(sc.S * 1000) / 1000,
        duration: Math.round(sc.duration * 1e6) / 1e6,
        repTime: Math.round(sc.repTime * 1e6) / 1e6,
        pages: sc.pages.length,
        phases: sc.phases.map((p: Any) => [
          p.kind,
          Math.round(p.a * 1e6) / 1e6,
          Math.round(p.b * 1e6) / 1e6,
        ]),
        empty: sc.empty,
        shrunk: !!sc.shrunk,
      };
    },
    async hashes(cfg: Any, times: number[]) {
      const sc = await build(cfg);
      return times.map((t) => {
        drawAt(sc, t);
        return hashNow();
      });
    },
    async png(cfg: Any, t: number) {
      const sc = await build(cfg);
      drawAt(sc, t);
      return canvas.toDataURL('image/png');
    },
    /** 匯出 APNG／PNG／ZIP，回傳 base64 */
    async exportFile(cfg: Any, kind: string, fps: number) {
      return b64(await w.__parity.exportRaw(cfg, kind, fps));
    },
    /** 匯出一次，回傳花費的毫秒數（含建場景）與檔案大小 */
    async timeExport(cfg: Any, kind: string, fps: number) {
      const t0 = performance.now();
      const bytes: Uint8Array = await w.__parity.exportRaw(cfg, kind, fps);
      return { ms: performance.now() - t0, bytes: bytes.length };
    },
    async exportRaw(cfg: Any, kind: string, fps: number): Promise<Uint8Array> {
      if (side === 'old') {
        const ex = w.__parityMods.exporter;
        const sc = await w.__parityMods.scene.buildScene(JSON.parse(JSON.stringify(cfg)), {
          waitFonts: true,
        });
        const plays =
          cfg.loop === 'infinite'
            ? 0
            : cfg.loop === 'count'
              ? Math.min(999, Math.max(1, Math.round(cfg.loopCount)))
              : 1;
        if (kind === 'apng') {
          const res = await ex.exportApng(sc, {
            fps,
            plays,
            colors: cfg.colors,
            still: cfg.stillFallback,
            autoCrop: cfg.autoCrop,
          });
          return res.bytes;
        }
        if (kind === 'png')
          return (await ex.exportStill(sc, sc.repTime, { autoCrop: cfg.autoCrop })).bytes;
        return (await ex.exportSequence(sc, { fps, autoCrop: cfg.autoCrop, baseName: 'parity' }))
          .bytes;
      }
      const lib = w.__textFx.lib;
      const n = lib.normalizeSettings(cfg.mode, JSON.parse(JSON.stringify(cfg)));
      return await lib.exportBytes(n, { format: kind, fps });
    },
  };
}

/* ---------- 比對 ---------- */

interface FrameResult {
  t: number;
  same: boolean;
  stats?: DiffStats;
}
interface CaseResult {
  id: string;
  f: string[];
  metaSame: boolean;
  metaOld: unknown;
  metaNew: unknown;
  frames: FrameResult[];
  /** 抽樣的影格裡有幾種不同的畫面（確認不是全空白） */
  distinct: number;
  maxDiff: number;
  worstRatio: number;
  status: 'identical' | 'near' | 'diff';
}

/** 抽樣時間：0、25%、50%、75%、100%，以及每個階段的起點、中點與終點前一格 */
function sampleTimes(meta: { duration: number; phases: [string, number, number][] }): number[] {
  const d = meta.duration;
  const set = new Set<number>();
  const add = (t: number) => set.add(Math.round(Math.min(d, Math.max(0, t)) * 1e4) / 1e4);
  for (const k of [0, 0.25, 0.5, 0.75, 1]) add(d * k);
  for (const [, a, b] of meta.phases) {
    const bb = Number.isFinite(b) ? Math.min(b, d) : d;
    add(a);
    add(a + 1 / 24);
    add((a + bb) / 2);
    add(bb - 1 / 24);
  }
  return [...set].sort((x, y) => x - y);
}

function statusOf(maxDiff: number, worstRatio: number): CaseResult['status'] {
  if (maxDiff === 0) return 'identical';
  return worstRatio < 0.001 ? 'near' : 'diff';
}

test.describe.configure({ mode: 'serial' });

test('影格對等：效果、範本、樣式、裝飾', async ({ browser }) => {
  mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  const { ctx, oldPage, newPage, errors } = await openPages(browser);
  const results: CaseResult[] = [];
  const recipes = buildRecipes().filter((r) => !ONLY || ONLY.test(r.id));
  for (const r of recipes) {
    const cfg = await oldPage.evaluate(
      ([rr, tx]) =>
        (
          window as unknown as { __parity: { makeCfg: (a: unknown, b: unknown) => unknown } }
        ).__parity.makeCfg(rr, tx),
      [r, TEXTS] as [Recipe, typeof TEXTS],
    );
    type Meta = { duration: number; phases: [string, number, number][] };
    const call = <T>(p: Page, fn: string, ...args: unknown[]) =>
      p.evaluate(
        ([f, a]) =>
          (
            window as unknown as { __parity: Record<string, (...x: unknown[]) => unknown> }
          ).__parity[f as string](...(a as unknown[])),
        [fn, args] as [string, unknown[]],
      ) as Promise<T>;
    const metaOld = await call<Meta>(oldPage, 'meta', cfg);
    const metaNew = await call<Meta>(newPage, 'meta', cfg);
    const times = sampleTimes(metaOld);
    const [hOld, hNew] = await Promise.all([
      call<string[]>(oldPage, 'hashes', cfg, times),
      call<string[]>(newPage, 'hashes', cfg, times),
    ]);
    const frames: FrameResult[] = [];
    let maxDiff = 0;
    let worstRatio = 0;
    for (let i = 0; i < times.length; i++) {
      if (hOld[i] === hNew[i]) {
        frames.push({ t: times[i], same: true });
        continue;
      }
      const [uo, un] = await Promise.all([
        call<string>(oldPage, 'png', cfg, times[i]),
        call<string>(newPage, 'png', cfg, times[i]),
      ]);
      const a = decodePng(dataUrlBytes(uo));
      const b = decodePng(dataUrlBytes(un));
      if (a.w !== b.w || a.h !== b.h) {
        frames.push({ t: times[i], same: false, stats: { maxDiff: 255, diffPx: -1, ratio: 1 } });
        maxDiff = 255;
        worstRatio = 1;
        continue;
      }
      const d = diffPixels(a.px, b.px, a.w, a.h);
      frames.push({
        t: times[i],
        same: false,
        stats: { maxDiff: d.maxDiff, diffPx: d.diffPx, ratio: d.ratio },
      });
      maxDiff = Math.max(maxDiff, d.maxDiff);
      worstRatio = Math.max(worstRatio, d.ratio);
      if (d.diffPx > 0) {
        const base = path.join(OUT, 'frames', `${r.id}@${times[i].toFixed(3)}`);
        writeFileSync(`${base}-old.png`, dataUrlBytes(uo));
        writeFileSync(`${base}-new.png`, dataUrlBytes(un));
        writeFileSync(`${base}-diff.png`, encodePng(d.img, a.w, a.h));
      }
    }
    const metaSame = JSON.stringify(metaOld) === JSON.stringify(metaNew);
    const res: CaseResult = {
      id: r.id,
      f: r.f,
      metaSame,
      metaOld,
      metaNew,
      frames,
      distinct: new Set(hOld).size,
      maxDiff,
      worstRatio,
      status: metaSame ? statusOf(maxDiff, worstRatio) : 'diff',
    };
    results.push(res);
    console.log(
      `${res.status.padEnd(9)} ${r.id.padEnd(28)} ${frames.length} 格（${res.distinct} 種畫面） maxDiff=${maxDiff} worst=${(worstRatio * 100).toFixed(3)}%${metaSame ? '' : ' meta 不同'}`,
    );
  }
  writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(results, null, 2));
  await ctx.close();
  expect(errors).toEqual([]);
  expect(results.filter((r) => r.status === 'diff').map((r) => r.id)).toEqual([]);
});

/* ---------- 匯出檔 ---------- */

interface ExportResultRow {
  id: string;
  f: string[];
  kind: string;
  same: boolean;
  notes: string[];
  maxDiff: number;
}

test('匯出檔對等：APNG、PNG、ZIP', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const { ctx, oldPage, newPage, errors } = await openPages(browser);
  const rows: ExportResultRow[] = [];
  for (const r of buildExportRecipes().filter((x) => !ONLY || ONLY.test(x.id))) {
    const cfg = (await oldPage.evaluate(
      ([rr, tx]) =>
        (
          window as unknown as { __parity: { makeCfg: (a: unknown, b: unknown) => unknown } }
        ).__parity.makeCfg(rr, tx),
      [r, TEXTS] as [ExportRecipe, typeof TEXTS],
    )) as { fps: number };
    const fps = r.fps ?? cfg.fps;
    const run = (p: Page) =>
      p.evaluate(
        ([c, k, f]) =>
          (
            window as unknown as {
              __parity: { exportFile: (a: unknown, b: unknown, c: unknown) => Promise<string> };
            }
          ).__parity.exportFile(c, k, f),
        [cfg, r.kind, fps] as [unknown, string, number],
      );
    const [bo, bn] = await Promise.all([run(oldPage), run(newPage)]);
    const old = new Uint8Array(Buffer.from(bo, 'base64'));
    const neu = new Uint8Array(Buffer.from(bn, 'base64'));
    const notes: string[] = [];
    let maxDiff = 0;
    const cmpPixels = (label: string, a: Uint8Array, b: Uint8Array, w: number, h: number) => {
      const d = diffPixels(a, b, w, h);
      maxDiff = Math.max(maxDiff, d.maxDiff);
      if (d.diffPx > 0) notes.push(`${label}：${d.diffPx} 像素不同（最大差 ${d.maxDiff}）`);
    };
    if (r.kind === 'apng') {
      const A = parseApng(old);
      const B = parseApng(neu);
      const head = (x: typeof A) => ({
        w: x.ihdr.width,
        h: x.ihdr.height,
        colorType: x.ihdr.colorType,
        frames: x.numFrames,
        plays: x.numPlays,
        still: !!x.stillIdat,
        delays: x.frames.map((f) => `${f.delayNum}/${f.delayDen}`).join(','),
      });
      const ha = head(A);
      const hb = head(B);
      for (const k of Object.keys(ha) as (keyof typeof ha)[])
        if (ha[k] !== hb[k])
          notes.push(`${k}：舊 ${String(ha[k]).slice(0, 80)}／新 ${String(hb[k]).slice(0, 80)}`);
      if (ha.w === hb.w && ha.h === hb.h) {
        const fa = composeApng(A);
        const fb = composeApng(B);
        /* 依時間對齊：把合併後的影格展開成 1/fps 一格 */
        const expand = (x: typeof A, frames: Uint8Array[]) => {
          const out: Uint8Array[] = [];
          x.frames.forEach((f, i) => {
            const n = Math.round((f.delayNum / f.delayDen) * fps);
            for (let k = 0; k < Math.max(1, n); k++) out.push(frames[i]);
          });
          return out;
        };
        const ea = expand(A, fa);
        const eb = expand(B, fb);
        if (ea.length !== eb.length) notes.push(`展開後格數：舊 ${ea.length}／新 ${eb.length}`);
        const n = Math.min(ea.length, eb.length);
        let worst = 0;
        let worstAt = -1;
        for (let i = 0; i < n; i++) {
          if (Buffer.compare(Buffer.from(ea[i]), Buffer.from(eb[i])) === 0) continue;
          const d = diffPixels(ea[i], eb[i], ha.w, ha.h);
          maxDiff = Math.max(maxDiff, d.maxDiff);
          if (d.diffPx > worst) {
            worst = d.diffPx;
            worstAt = i;
          }
        }
        if (worst > 0) notes.push(`影格像素：最多 ${worst} 像素不同（第 ${worstAt + 1} 格）`);
        if (A.stillIdat && B.stillIdat) {
          const sa = decodePixels(A.stillIdat, ha.w, ha.h, ha.colorType, A.plte, A.trns);
          const sb = decodePixels(B.stillIdat, hb.w, hb.h, hb.colorType, B.plte, B.trns);
          cmpPixels('預設圖', sa, sb, ha.w, ha.h);
        }
      }
    } else if (r.kind === 'png') {
      const a = decodePng(old);
      const b = decodePng(neu);
      if (a.w !== b.w || a.h !== b.h) notes.push(`尺寸：舊 ${a.w}×${a.h}／新 ${b.w}×${b.h}`);
      else cmpPixels('PNG', a.px, b.px, a.w, a.h);
    } else {
      const za = unzipSync(old);
      const zb = unzipSync(neu);
      const na = Object.keys(za).sort();
      const nb = Object.keys(zb).sort();
      if (na.join('|') !== nb.join('|'))
        notes.push(`檔名：舊 ${na.length} 個／新 ${nb.length} 個（${na[0]}…／${nb[0]}…）`);
      const info = na.find((x) => x.endsWith('.txt'));
      if (info && zb[info]) {
        const ta = Buffer.from(za[info]).toString('utf8');
        const tb = Buffer.from(zb[info]).toString('utf8');
        if (ta !== tb)
          notes.push(
            `資訊檔不同：舊「${ta.replace(/\r\n/g, '⏎')}」／新「${tb.replace(/\r\n/g, '⏎')}」`,
          );
      }
      for (const name of na.filter((x) => x.endsWith('.png'))) {
        if (!zb[name]) continue;
        const a = decodePng(za[name]);
        const b = decodePng(zb[name]);
        if (a.w !== b.w || a.h !== b.h) {
          notes.push(`${name} 尺寸不同`);
          break;
        }
        cmpPixels(name, a.px, b.px, a.w, a.h);
      }
    }
    const row = { id: r.id, f: r.f, kind: r.kind, same: notes.length === 0, notes, maxDiff };
    rows.push(row);
    console.log(
      `${row.same ? 'identical' : 'diff     '} ${r.id.padEnd(24)} 舊 ${old.length} B／新 ${neu.length} B ${notes.join('；')}`,
    );
    writeFileSync(path.join(OUT, `${r.id}-old.${r.kind === 'zip' ? 'zip' : 'png'}`), old);
    writeFileSync(path.join(OUT, `${r.id}-new.${r.kind === 'zip' ? 'zip' : 'png'}`), neu);
  }
  writeFileSync(path.join(OUT, 'exports.json'), JSON.stringify(rows, null, 2));
  await ctx.close();
  expect(errors).toEqual([]);
});

/* ---------- 範本、風格、效果預設值的資料對等 ---------- */

test('資料對等：範本、文字風格、漸層配色、效果預設值', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const { ctx, oldPage, newPage, errors } = await openPages(browser);
  /* 舊版：每個範本、每個風格（套在基礎預設上）、每個效果的預設值，都用舊版的 library.js 產生 */
  const oldData = await oldPage.evaluate(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
    const lib = (window as any).__parityMods.lib;
    const m = await import('./js/motion.js' as string);
    const f = await import('./js/fonts.js' as string);
    /* 畫布的 font 字串（舊版建場景時先取最接近的字重再組字串）：每套舊版字型 × 字重 × 斜體 × 中／英／韓／混合文字 */
    const fontCss: [string, number, boolean, string, string][] = [];
    const ids = [
      'Noto Serif TC',
      'Noto Sans TC',
      'LXGW WenKai TC',
      'Chocolate Classical Sans',
      'Cactus Classical Serif',
      'Huninn',
      'Iansui',
      'Cinzel',
      'Bebas Neue',
      'Special Elite',
      'Creepster',
      'UnifrakturMaguntia',
    ];
    for (const id of ids)
      for (const weight of [100, 400, 550, 700, 900])
        for (const italic of [false, true])
          for (const text of ['戰鬥開始', 'SAN CHECK', 'SAN 理智', '전투 개시', 'ROUND 1 ★', ''])
            fontCss.push([
              id,
              weight,
              italic,
              text,
              f.fontCss(
                { src: 'google', id },
                f.nearestWeight(f.fontInfo({ src: 'google', id }).weights, weight),
                italic,
                48.5,
                text,
              ),
            ]);
    // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
    const templates: Record<string, any> = {};
    for (const mode of ['title', 'long', 'caption'])
      for (const t of lib.TEMPLATES[mode])
        templates[`${mode}/${t.id}`] = lib.settingsFromTemplate(mode, t);
    const merge = (b: Record<string, unknown>, p: Record<string, unknown>) => {
      for (const [key, v] of Object.entries(p)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && b[key] && typeof b[key] === 'object')
          merge(b[key] as Record<string, unknown>, v as Record<string, unknown>);
        else b[key] = Array.isArray(v) ? v.slice() : v;
      }
    };
    // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
    const kits: Record<string, any> = {};
    for (const k of lib.STYLE_KITS) {
      const s = lib.baseSettings('title');
      merge(s, JSON.parse(JSON.stringify(k.patch)));
      kits[k.id] = { name: k.name, s };
    }
    const pick = (defs: Record<string, unknown>, of: (id: string) => unknown) =>
      Object.fromEntries(Object.keys(defs).map((id) => [id, of(id)]));
    return {
      templates,
      fontCss,
      groups: Object.fromEntries(
        ['title', 'long', 'caption'].map((mode) => [
          mode,
          // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
          lib.TEMPLATES[mode].map((t: any) => [
            t.id,
            t.group,
            t.name,
            t.text,
            t.sub ?? '',
            t.loop ?? 'once',
          ]),
        ]),
      ),
      kits,
      gradients: lib.GRADIENT_KITS,
      intro: pick(m.INTRO, lib.introOf),
      outro: pick(m.OUTRO, lib.outroOf),
    };
  });
  const mismatches = await newPage.evaluate((od) => {
    // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
    const lib = (window as any).__textFx.lib;
    const out: string[] = [];
    const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    for (const mode of ['title', 'long', 'caption']) {
      // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
      const list = lib.TEMPLATES[mode].map((t: any) => [
        t.id,
        t.group,
        t.name,
        t.text,
        t.sub ?? '',
        t.loop ?? 'once',
      ]);
      if (!eq(list, od.groups[mode])) out.push(`${mode} 範本清單不同`);
      for (const t of lib.TEMPLATES[mode]) {
        const a = lib.normalizeSettings(mode, od.templates[`${mode}/${t.id}`]);
        const b = lib.normalizeSettings(mode, lib.settingsFromTemplate(mode, t));
        if (!eq(a, b)) out.push(`範本 ${mode}/${t.id} 設定不同`);
      }
    }
    for (const k of lib.STYLE_KITS) {
      const s = lib.baseSettings('title');
      lib.deepMerge(s, JSON.parse(JSON.stringify(k.patch)));
      const o = od.kits[k.id];
      if (!o || o.name !== k.name) out.push(`風格 ${k.id} 名稱不同`);
      else if (!eq(lib.normalizeSettings('title', o.s), lib.normalizeSettings('title', s)))
        out.push(`風格 ${k.id} 設定不同`);
    }
    if (!eq(lib.GRADIENT_KITS, od.gradients)) out.push('漸層配色不同');
    for (const id of Object.keys(od.intro))
      if (!eq(lib.introOf(id), od.intro[id])) out.push(`登場 ${id} 預設值不同`);
    for (const id of Object.keys(od.outro))
      if (!eq(lib.outroOf(id), od.outro[id])) out.push(`退場 ${id} 預設值不同`);
    for (const [id, weight, italic, text, css] of od.fontCss) {
      const mine = lib.fontCssFor({ source: 'google', family: id }, weight, italic, 48.5, text);
      if (mine !== css)
        out.push(`字型字串 ${id}/${weight}/${italic}/「${text}」：舊 ${css}／新 ${mine}`);
    }
    return out;
  }, oldData);
  writeFileSync(
    path.join(OUT, 'data.json'),
    JSON.stringify({ mismatches, fontCss: oldData.fontCss.length }, null, 2),
  );
  console.log(
    mismatches.length
      ? mismatches.join('\n')
      : `範本、風格、漸層配色、效果預設值、${oldData.fontCss.length} 組字型字串全部相同`,
  );
  await ctx.close();
  expect(errors).toEqual([]);
  expect(mismatches).toEqual([]);
});

/* ---------- 互動對等（兩邊的測試掛鉤做同樣的操作，比對結果的設定） ---------- */

test('互動對等：模式、範本、文字記憶、重設', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const { ctx, oldPage, newPage, errors } = await openPages(browser);
  type Step = [string, ...unknown[]];
  const steps: { name: string; f: string[]; do: Step[] }[] = [
    { name: '切換到長文', f: ['F001', 'F002'], do: [['setMode', 'long']] },
    { name: '長文套用範本', f: ['F003'], do: [['applyTemplate', 'memory']] },
    {
      name: '切換到字幕並套用範本',
      f: ['F001', 'F003'],
      do: [
        ['setMode', 'caption'],
        ['applyTemplate', 'day'],
      ],
    },
    {
      name: '字幕文字所有範本共用',
      f: ['F004'],
      do: [
        ['set', 'text', '共用的地點'],
        ['set', 'sub', '共用時間'],
        ['applyTemplate', 'merge'],
      ],
    },
    {
      name: '標語依範本記住文字',
      f: ['F004'],
      do: [
        ['setMode', 'title'],
        ['applyTemplate', 'enemy'],
        ['set', 'text', '敵襲'],
        ['applyTemplate', 'clue'],
        ['applyTemplate', 'enemy'],
      ],
    },
    {
      name: '長文依範本記住文字',
      f: ['F004'],
      do: [
        ['setMode', 'long'],
        ['set', 'text', '改過的旁白'],
        ['applyTemplate', 'letter'],
        ['applyTemplate', 'memory'],
      ],
    },
    {
      name: '套用範本保留尺寸與退場開關',
      f: ['F003'],
      do: [
        ['setMode', 'title'],
        ['set', 'canvasW', 960],
        ['set', 'canvasH', 540],
        ['set', 'outroOn', false],
        ['applyTemplate', 'gen-hit'],
      ],
    },
    {
      name: '重設為範本預設',
      f: ['F005'],
      do: [['applyTemplate', 'enemy'], ['resetTemplate']],
    },
    {
      name: '模式各自保留設定',
      f: ['F002'],
      do: [
        ['setMode', 'caption'],
        ['setMode', 'title'],
      ],
    },
  ];
  const rows: { name: string; f: string[]; same: boolean; detail?: string }[] = [];
  for (const st of steps) {
    for (const p of [oldPage, newPage])
      await p.evaluate((list) => {
        // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
        const app = (window as any).__textFx.app;
        for (const [fn, ...args] of list) app[fn as string](...args);
      }, st.do);
    const oldCfg = await oldPage.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
      const app = (window as any).__textFx.app;
      return { mode: app.mode(), tpl: app.tplId(), cfg: JSON.parse(JSON.stringify(app.cfg())) };
    });
    const res = await newPage.evaluate((o) => {
      // biome-ignore lint/suspicious/noExplicitAny: 頁面端的動態物件
      const t = (window as any).__textFx;
      const a = t.lib.normalizeSettings(o.mode, o.cfg);
      const b = t.app.cfg();
      const same =
        JSON.stringify(a) === JSON.stringify(b) &&
        t.app.mode() === o.mode &&
        t.app.tplId() === o.tpl;
      return {
        same,
        detail: same
          ? ''
          : `${o.mode}/${o.tpl} vs ${t.app.mode()}/${t.app.tplId()}；文字 ${a.text}／${b.text}`,
      };
    }, oldCfg);
    rows.push({ name: st.name, f: st.f, ...res });
    console.log(`${res.same ? '相同' : '不同'} ${st.name} ${res.detail}`);
  }
  writeFileSync(path.join(OUT, 'interaction.json'), JSON.stringify(rows, null, 2));
  await ctx.close();
  expect(errors).toEqual([]);
  expect(rows.filter((r) => !r.same).map((r) => r.name)).toEqual([]);
});

/* ---------- 效能（長動畫、每格都不同的匯出時間） ---------- */

test('效能：長動畫與大畫面的匯出時間', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const { ctx, oldPage, newPage, errors } = await openPages(browser);
  const recipes: ExportRecipe[] = [
    { id: 'perf-long-opening', f: [], mode: 'long', tpl: 'opening', kind: 'apng', fps: 24 },
    {
      id: 'perf-hold-wave-full',
      f: [],
      mode: 'title',
      tpl: 'battle-start',
      kind: 'apng',
      set: { 'hold.fx': 'wave', colors: 'full' },
    },
    { id: 'perf-title-256', f: [], mode: 'title', tpl: 'coc7-critical', kind: 'apng' },
    { id: 'perf-zip', f: [], mode: 'caption', tpl: 'typewriter', kind: 'zip' },
  ];
  const rows: { id: string; old: number; new: number; oldBytes: number; newBytes: number }[] = [];
  for (const r of recipes.filter((x) => !ONLY || ONLY.test(x.id))) {
    const cfg = (await oldPage.evaluate(
      ([rr, tx]) =>
        (
          window as unknown as { __parity: { makeCfg: (a: unknown, b: unknown) => unknown } }
        ).__parity.makeCfg(rr, tx),
      [r, TEXTS] as [ExportRecipe, typeof TEXTS],
    )) as { fps: number };
    const fps = r.fps ?? cfg.fps;
    /* 一次只跑一邊（不搶 CPU）；各跑 3 次取最短 */
    const time = (p: Page) =>
      p.evaluate(
        ([c, k, f]) =>
          (
            window as unknown as {
              __parity: {
                timeExport: (
                  a: unknown,
                  b: unknown,
                  c: unknown,
                ) => Promise<{ ms: number; bytes: number }>;
              };
            }
          ).__parity.timeExport(c, k, f),
        [cfg, r.kind, fps] as [unknown, string, number],
      );
    const best = { old: Infinity, new: Infinity, oldBytes: 0, newBytes: 0 };
    for (let i = 0; i < 3; i++) {
      const a = await time(oldPage);
      const b = await time(newPage);
      best.old = Math.min(best.old, a.ms);
      best.new = Math.min(best.new, b.ms);
      best.oldBytes = a.bytes;
      best.newBytes = b.bytes;
    }
    const row = { id: r.id, ...best, old: Math.round(best.old), new: Math.round(best.new) };
    rows.push(row);
    console.log(
      `${r.id.padEnd(22)} 舊 ${row.old} ms／新 ${row.new} ms（${(row.new / row.old).toFixed(2)}×） 舊 ${row.oldBytes} B／新 ${row.newBytes} B`,
    );
  }
  writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(rows, null, 2));
  await ctx.close();
  expect(errors).toEqual([]);
  /* 不得明顯變慢：每個案例不超過舊版的 1.5 倍 */
  for (const r of rows) expect(r.new, r.id).toBeLessThan(r.old * 1.5 + 200);
});
