/* 文字演出產生器：匯出（APNG、單張 PNG、連番 PNG ZIP）
 *
 * 影格數＝總長度×fps 無條件進位；第 i 格取 i÷fps 的畫面，最後一格固定取在總長度的最後一刻。
 * 連續相同的畫面合併成一格並延長顯示時間；每一格只存跟前一格不同的矩形範圍。 */
import { makeCanvas } from './core.js';
import { packImage, assembleApng, encodePng } from './png.js';
import { ColorStats, buildPalette } from './palette.js';
import { makeZip } from './zip.js';

export const MAX_FRAMES = 1800; // 約 60 fps × 30 秒
const KEEP_BYTES = 420 * 1024 * 1024; // 第一輪的變化範圍最多留這麼多在記憶體裡，超過就第二輪重畫

export function frameCount(duration, fps) {
  return Math.max(1, Math.ceil(duration * fps - 1e-9));
}
export function frameTime(i, n, duration, fps) {
  return i === n - 1 ? duration : i / fps;
}

class Cancelled extends Error { constructor() { super('已取消'); this.name = 'AbortError'; } }
const tick = () => new Promise(r => setTimeout(r, 0));

function grab(scene) {
  const c = makeCanvas(scene.W, scene.H);
  const x = c.getContext('2d', { willReadFrequently: true });
  return { c, x };
}
const readAll = (g, W, H) => new Uint32Array(g.x.getImageData(0, 0, W, H).data.buffer);

/* 兩格之間有變化的矩形（沒有變化回傳 null） */
function diffRect(a, b, w, h) {
  let y0 = -1, y1 = -1, x0 = w, x1 = -1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let first = -1;
    for (let x = 0; x < w; x++) if (a[o + x] !== b[o + x]) { first = x; break; }
    if (first < 0) continue;
    let last = first;
    for (let x = w - 1; x > first; x--) if (a[o + x] !== b[o + x]) { last = x; break; }
    if (y0 < 0) y0 = y;
    y1 = y;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
  }
  if (y0 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* 不透明像素的範圍 */
function opaqueBox(u32, w, r, box) {
  for (let y = r.y; y < r.y + r.h; y++) {
    const o = y * w;
    for (let x = r.x; x < r.x + r.w; x++) {
      if (u32[o + x] >>> 24) {
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
      }
    }
  }
}

function cropFrom(box, W, H) {
  if (box.x1 < box.x0) return { x: 0, y: 0, w: W, h: H };
  const x = Math.max(0, box.x0 - 2), y = Math.max(0, box.y0 - 2);
  const x1 = Math.min(W, box.x1 + 3), y1 = Math.min(H, box.y1 + 3);
  return { x, y, w: x1 - x, h: y1 - y };
}

function copyRect(u32, stride, r) {
  const out = new Uint32Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) out.set(u32.subarray((r.y + y) * stride + r.x, (r.y + y) * stride + r.x + r.w), y * r.w);
  return out;
}

/* ---------- APNG ---------- */
export async function exportApng(scene, opt, hooks = {}) {
  const { W, H } = scene;
  const fps = opt.fps;
  const total = scene.duration;
  const N = frameCount(total, fps);
  if (N > MAX_FRAMES) throw new Error(`影格數 ${N} 超過上限 ${MAX_FRAMES}，請縮短時長或降低 fps。`);
  const signal = hooks.signal;
  const report = hooks.onProgress || (() => {});
  const check = () => { if (signal && signal.aborted) throw new Cancelled(); };
  const g = grab(scene);
  const t0 = performance.now();
  const timing = {};
  const paletted = opt.colors === 256;

  /* 第一輪：逐格畫出來，記下跟前一格不同的範圍（記憶體夠就連像素一起留著），
   * 同時統計顏色、找出所有影格的不透明範圍 */
  const stats = paletted ? new ColorStats() : null;
  const box = { x0: W, y0: H, x1: -1, y1: -1 };
  const changes = [];   // 每格：null（跟前一格相同）或 { r, px }
  let kept = 0, keepAll = true;
  let prev = null;
  for (let i = 0; i < N; i++) {
    check();
    scene.draw(g.x, frameTime(i, N, total, fps));
    const u32 = readAll(g, W, H);
    const r = prev ? diffRect(prev, u32, W, H) : { x: 0, y: 0, w: W, h: H };
    if (r) {
      if (stats) stats.addRect(u32, W, r.x, r.y, r.x + r.w, r.y + r.h);
      opaqueBox(u32, W, r, box);
      let px = null;
      if (keepAll && kept + r.w * r.h * 4 <= KEEP_BYTES) { px = copyRect(u32, W, r); kept += px.byteLength; } else keepAll = false;
      changes.push({ r, px });
    } else changes.push(null);
    prev = u32;
    report((i + 1) / N * 0.5, '分析影格');
    if (i % 4 === 3) await tick();
  }
  /* 完成狀態（代表畫面）是觀眾看最久的畫面：減色時給它跟停留時間相當的份量，
   * 避免調色盤被一閃而過的淡入中間色占走，造成漸層與光暈出現色帶 */
  scene.draw(g.x, scene.repTime);
  const rep = readAll(g, W, H);
  if (stats) stats.add(rep, 0, rep.length, Math.max(4, Math.round(N * 0.35)));
  const still = opt.still ? rep : null;
  if (still) opaqueBox(still, W, { x: 0, y: 0, w: W, h: H }, box);
  const crop = opt.autoCrop ? cropFrom(box, W, H) : { x: 0, y: 0, w: W, h: H };
  timing.scan = performance.now() - t0;

  let pal = null;
  if (paletted) {
    const tp = performance.now();
    pal = buildPalette(stats, 256);
    timing.palette = performance.now() - tp;
    await tick();
  }

  /* 第二輪：轉成調色盤索引（或 RGBA），只存變化範圍 */
  const t2 = performance.now();
  const cw = crop.w, ch = crop.h;
  /* 目前畫面（裁切後）的索引或 RGBA，用來在減色後再比一次，減色後相同的格也合併 */
  const curIdx = pal ? new Uint8Array(cw * ch) : null;
  const frames = [];
  let full = null; // 沒留像素時用：重畫的整張
  let lastV = -1, lastI = 0;
  const idxOf = v => { if (v !== lastV) { lastV = v; lastI = pal.indexOf(v); } return lastI; };
  for (let i = 0; i < N; i++) {
    check();
    const c = changes[i];
    if (!c) { frames[frames.length - 1].count++; continue; }
    let src, stride, sr;
    if (c.px) { src = c.px; stride = c.r.w; sr = { x: 0, y: 0 }; }
    else { scene.draw(g.x, frameTime(i, N, total, fps)); full = readAll(g, W, H); src = full; stride = W; sr = { x: c.r.x, y: c.r.y }; }
    /* 變化範圍換算到裁切後的座標 */
    const rx0 = Math.max(c.r.x, crop.x), ry0 = Math.max(c.r.y, crop.y);
    const rx1 = Math.min(c.r.x + c.r.w, crop.x + cw), ry1 = Math.min(c.r.y + c.r.h, crop.y + ch);
    if (rx1 <= rx0 || ry1 <= ry0) { if (frames.length) { frames[frames.length - 1].count++; continue; } }
    const rw = Math.max(1, rx1 - rx0), rh = Math.max(1, ry1 - ry0);
    const first = frames.length === 0;
    let out;
    let rect = { x: rx0 - crop.x, y: ry0 - crop.y, w: rw, h: rh };
    if (pal) {
      /* 對應成索引，同時找出減色後真的有變的範圍 */
      let mx0 = rw, my0 = rh, mx1 = -1, my1 = -1;
      const tmp = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) {
        const so = (ry0 - c.r.y + sr.y + y) * stride + (rx0 - c.r.x + sr.x);
        const co = (rect.y + y) * cw + rect.x;
        for (let x = 0; x < rw; x++) {
          const id = idxOf(src[so + x]);
          tmp[y * rw + x] = id;
          if (first || curIdx[co + x] !== id) {
            if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y;
            curIdx[co + x] = id;
          }
        }
      }
      if (!first && mx1 < 0) { frames[frames.length - 1].count++; continue; }
      if (first) { mx0 = 0; my0 = 0; mx1 = rw - 1; my1 = rh - 1; }
      const nw = mx1 - mx0 + 1, nh = my1 - my0 + 1;
      out = new Uint8Array(nw * nh);
      for (let y = 0; y < nh; y++) out.set(tmp.subarray((my0 + y) * rw + mx0, (my0 + y) * rw + mx0 + nw), y * nw);
      rect = { x: rect.x + mx0, y: rect.y + my0, w: nw, h: nh };
    } else {
      out = new Uint8Array(rw * rh * 4);
      const o32 = new Uint32Array(out.buffer);
      for (let y = 0; y < rh; y++) {
        const so = (ry0 - c.r.y + sr.y + y) * stride + (rx0 - c.r.x + sr.x);
        o32.set(src.subarray(so, so + rw), y * rw);
      }
    }
    if (first && (rect.w !== cw || rect.h !== ch)) throw new Error('第一格必須是整張畫面');
    const data = await packImage(out, rect.w, rect.h, !!pal);
    frames.push({ ...rect, data, count: 1 });
    report(0.5 + (i + 1) / N * 0.5, '編碼影格');
    if (i % 3 === 2) await tick();
  }
  for (const f of frames) { f.delayNum = f.count; f.delayDen = fps; }

  let stillData = null;
  if (still) {
    const px = copyRect(still, W, crop);
    let out;
    if (pal) { out = new Uint8Array(px.length); for (let k = 0; k < px.length; k++) out[k] = idxOf(px[k]); }
    else out = new Uint8Array(px.buffer);
    stillData = await packImage(out, cw, ch, !!pal);
  }
  timing.encode = performance.now() - t2;
  const bytes = assembleApng({ width: cw, height: ch, palette: pal ? pal.colors : null, plays: opt.plays, still: stillData, frames });
  report(1, '完成');
  return {
    bytes, width: cw, height: ch, crop,
    framesTotal: N, framesStored: frames.length,
    colors: pal ? { mode: 256, lossless: pal.lossless, count: pal.count } : { mode: 'full' },
    plays: opt.plays, fps, duration: total, ms: performance.now() - t0, timing: { ...timing, keptMB: kept / 1048576, reRendered: !keepAll }
  };
}

/* ---------- 單張 PNG ---------- */
export async function exportStill(scene, t, opt = {}) {
  const { W, H } = scene;
  const g = grab(scene);
  scene.draw(g.x, t);
  let r = { x: 0, y: 0, w: W, h: H };
  if (opt.autoCrop) {
    const box = { x0: W, y0: H, x1: -1, y1: -1 };
    opaqueBox(readAll(g, W, H), W, r, box);
    r = cropFrom(box, W, H);
  }
  const data = new Uint8Array(g.x.getImageData(r.x, r.y, r.w, r.h).data.buffer);
  return { bytes: await encodePng(data, r.w, r.h), width: r.w, height: r.h };
}

/* ---------- 連番 PNG（ZIP） ---------- */
export async function exportSequence(scene, opt, hooks = {}) {
  const { W, H } = scene;
  const fps = opt.fps;
  const total = scene.duration;
  const N = frameCount(total, fps);
  if (N > MAX_FRAMES) throw new Error(`影格數 ${N} 超過上限 ${MAX_FRAMES}，請縮短時長或降低 fps。`);
  const g = grab(scene);
  const report = hooks.onProgress || (() => {});
  const check = () => { if (hooks.signal && hooks.signal.aborted) throw new Cancelled(); };
  let crop = { x: 0, y: 0, w: W, h: H };
  if (opt.autoCrop) {
    const box = { x0: W, y0: H, x1: -1, y1: -1 };
    for (let i = 0; i < N; i++) {
      check();
      scene.draw(g.x, frameTime(i, N, total, fps));
      opaqueBox(readAll(g, W, H), W, { x: 0, y: 0, w: W, h: H }, box);
      report((i + 1) / (2 * N), '計算範圍');
      if (i % 4 === 3) await tick();
    }
    crop = cropFrom(box, W, H);
  }
  const files = [];
  const base = opt.baseName || 'frames';
  for (let i = 0; i < N; i++) {
    check();
    scene.draw(g.x, frameTime(i, N, total, fps));
    const data = new Uint8Array(g.x.getImageData(crop.x, crop.y, crop.w, crop.h).data.buffer);
    files.push({ name: `${base}_${String(i + 1).padStart(4, '0')}.png`, data: await encodePng(data, crop.w, crop.h) });
    report((opt.autoCrop ? 0.5 : 0) + (i + 1) / (N * (opt.autoCrop ? 2 : 1)), '輸出 PNG');
    if (i % 2 === 1) await tick();
  }
  const info = [
    '文字演出產生器　連番 PNG',
    `FPS：${fps}`,
    `張數：${N}`,
    `尺寸：${crop.w}×${crop.h}`,
    `長度：${total.toFixed(2)} 秒`,
    `檔名：${base}_0001.png ～ ${base}_${String(N).padStart(4, '0')}.png`
  ].join('\r\n') + '\r\n';
  files.push({ name: `${base}_資訊.txt`, data: new TextEncoder().encode(info) });
  return { bytes: makeZip(files), count: N, width: crop.w, height: crop.h };
}
