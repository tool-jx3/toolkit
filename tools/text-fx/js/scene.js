/* 文字演出產生器：場景（版面＋時間軸）與逐格繪製
 *
 * buildScene(設定) 會：載入字型 → 排版 → 自動縮小 → 逐字畫好 sprite → 排時間表，
 * 回傳的場景用 draw(ctx, t) 畫出任一時刻。draw 只依賴設定與 t，所以預覽與匯出逐格一致。 */
import { EASE, clamp, clamp01, hashSigned, timeSlot, seedOf, makeCanvas, rgba, CANVAS_FILTER_OK } from './core.js';
import { fontCss, fontInfo, nearestWeight, ensureFonts, fontsReadyNow } from './fonts.js';
import { Meter, breakText, layoutGroup, composeBlock, indexVisible, isWide, PAUSE_LONG, PAUSE_SHORT, CLOSERS } from './typeset.js';
import { paintGlyph } from './glyphs.js';
import { INTRO, OUTRO, HOLD, rankGlyphs, easeFor, stackPose, freshGlyphState, freshBlockState } from './motion.js';
import { decoShape, placeDeco, drawDeco, drawBackdrop, decoAlongReserve, WRAP_DECOS } from './ornament.js';

const ANCHOR_X = { l: 0, c: 0.5, r: 1 };
const ANCHOR_Y = { t: 0, m: 0.5, b: 1 };

/* 中央大字輪播最後「整句砸下」用的整塊效果 */
const SLAM = {
  apply(b, u, ease, env) {
    const dec = (1 - u) ** 3;
    b.s *= 1 + env.amp * dec;
    const slot = timeSlot(env.tLocal, 30);
    const sh = 0.03 * env.S * env.impact * (1 - Math.min(1, slot / 30 / 0.26)) ** 3;
    b.dx += hashSigned(slot, 21, env.seed) * sh;
    b.dy += hashSigned(slot, 22, env.seed) * sh;
    b.white = Math.max(b.white, Math.min(1, 0.6 * env.impact) * dec);
  }
};

/* 長文：依空白行分頁 */
export function splitPages(text, paging) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return [];
  if (!paging) return [lines.join('\n')];
  const pages = [];
  let cur = [];
  for (const l of lines) {
    if (!l.trim()) { if (cur.length) { pages.push(cur.join('\n')); cur = []; } } else cur.push(l);
  }
  if (cur.length) pages.push(cur.join('\n'));
  return pages;
}

function styleAt(cfg, k, which) {
  const f = cfg.fill;
  const fill = {
    type: f.mode === 'gradient' ? 'gradient' : 'solid',
    color: f.color, colors: (f.colors || []).slice(0, 3), dir: f.dir, opacity: clamp01(f.opacity)
  };
  if (which === 'sub' && cfg.subColor) { fill.type = 'solid'; fill.color = cfg.subColor; }
  return {
    fill,
    stroke: cfg.stroke.on && cfg.stroke.width > 0 ? { w: cfg.stroke.width * k, color: cfg.stroke.color } : null,
    outer: cfg.outer.on && cfg.outer.width > 0 ? { w: cfg.outer.width * k, color: cfg.outer.color } : null,
    shadow: cfg.shadow.on && cfg.shadow.opacity > 0
      ? { color: rgba(cfg.shadow.color, cfg.shadow.opacity), blur: cfg.shadow.blur * k, x: cfg.shadow.x * k, y: cfg.shadow.y * k } : null,
    glow: cfg.glow.on && cfg.glow.strength > 0 ? { color: cfg.glow.color, spread: cfg.glow.spread * k } : null
  };
}
function scaleStyle(st, f) {
  return {
    fill: st.fill,
    stroke: st.stroke && { ...st.stroke, w: st.stroke.w * f },
    outer: st.outer && { ...st.outer, w: st.outer.w * f },
    shadow: st.shadow && { ...st.shadow, blur: st.shadow.blur * f, x: st.shadow.x * f, y: st.shadow.y * f },
    glow: st.glow && { ...st.glow, spread: st.glow.spread * f }
  };
}

/* 外框、光暈、陰影往外擴的距離（px，字級比例 k） */
function paintPad(cfg, k) {
  const sw = (cfg.stroke.on ? cfg.stroke.width : 0) + (cfg.outer.on ? cfg.outer.width : 0);
  const glow = cfg.glow.on ? cfg.glow.spread * 1.0 : 0;
  const sh = cfg.shadow.on && cfg.shadow.opacity > 0 ? cfg.shadow.blur * 0.8 + Math.max(Math.abs(cfg.shadow.x), Math.abs(cfg.shadow.y)) : 0;
  return (sw + Math.max(glow, sh)) * k;
}

/* 主要入口 */
export async function buildScene(cfg, opts = {}) {
  const W = clamp(Math.round(cfg.canvasW), 16, 2048);
  const H = clamp(Math.round(cfg.canvasH), 16, 2048);
  const mode = cfg.mode;
  const long = mode === 'long';
  const flow = long ? cfg.flow : null;
  const flowKind = long ? flow.kind : null;
  const scroll = flowKind === 'scroll';
  const vertical = !!cfg.vertical;

  /* ---- 頁 ---- */
  let pageSrc;
  if (long) {
    pageSrc = splitPages(cfg.text, cfg.paging && !scroll).map(t => ({ main: t, sub: '' }));
  } else {
    const main = String(cfg.text || '').replace(/\r\n?/g, '\n').replace(/^\s*\n|\n\s*$/g, '');
    const sub = String(cfg.sub || '').replace(/\r\n?/g, '\n').trim();
    pageSrc = main.trim() || sub ? [{ main: main.trim() ? main : '', sub }] : [];
  }
  const allMain = pageSrc.map(p => p.main).join('\n');
  const allSub = pageSrc.map(p => p.sub).join('\n');

  /* ---- 字型 ---- */
  const mainRef = cfg.font;
  const subRef = cfg.subFont || cfg.font;
  const mainWeight = nearestWeight(fontInfo(mainRef).weights, cfg.weight);
  const subWeight = nearestWeight(fontInfo(subRef).weights, cfg.subWeight);
  const fontItems = [{ ref: mainRef, weight: mainWeight, italic: cfg.italic, text: allMain || '永' }];
  if (allSub.trim()) fontItems.push({ ref: subRef, weight: subWeight, italic: cfg.subItalic, text: allSub });
  let fontsPromise = null;
  if (opts.waitFonts === false) {
    if (!fontsReadyNow(fontItems)) fontsPromise = ensureFonts(fontItems);
  } else {
    await ensureFonts(fontItems, opts.fontTimeout || 12000);
  }

  const mx = clamp(cfg.marginX, 0, W / 2 - 1), my = clamp(cfg.marginY, 0, H / 2 - 1);
  const availW = Math.max(1, W - 2 * mx), availH = Math.max(1, H - 2 * my);
  const deco = scroll ? { ...cfg.deco, kind: 'none' } : cfg.deco;
  const textStyleRefs = { stroke: cfg.stroke, outer: cfg.outer };

  /* ---- 排版（S 是實際字級） ---- */
  const layoutPage = (page, S, fixed) => {
    const k = S / cfg.size;
    const cssM = fontCss(mainRef, mainWeight, cfg.italic, S, allMain);
    const meterM = new Meter(cssM, S, allMain);
    const track = cfg.tracking * S;
    const along = (vertical ? availH : availW) - decoAlongReserve(deco, S, k);
    const unitBy = (meter, Sx, tr) => ch => {
      if (cfg.wrapChars > 0) return isWide(ch) || (vertical && cfg.latinUpright) ? 1 : 0.5;
      if (vertical) return (isWide(ch) || cfg.latinUpright ? Sx : meter.get(ch).w) + tr;
      return meter.get(ch).w + tr;
    };
    const limit = cfg.wrapChars > 0 ? cfg.wrapChars : cfg.wrapWidth ? Math.max(S, along) + track : 0;
    const mainLines = fixed ? fixed.main : breakText(page.main, { limit, unit: unitBy(meterM, S, track) });
    const common = { vertical, latinUpright: cfg.latinUpright, punctCenter: cfg.punctCenter };
    const main = layoutGroup(mainLines, { ...common, S, meter: meterM, tracking: cfg.tracking, leading: cfg.leading });
    let sub = null, subLines = null, cssS = null, meterS = null;
    if (page.sub) {
      const S2 = S * cfg.subScale;
      cssS = fontCss(subRef, subWeight, cfg.subItalic, S2, allSub);
      meterS = new Meter(cssS, S2, allSub);
      const tr2 = cfg.subTracking * S2;
      const lim2 = cfg.wrapChars > 0 ? 0 : cfg.wrapWidth ? Math.max(S2, along) + tr2 : 0;
      subLines = fixed ? fixed.sub : breakText(page.sub, { limit: lim2, unit: unitBy(meterS, S2, tr2) });
      sub = layoutGroup(subLines, { ...common, S: S2, meter: meterS, tracking: cfg.subTracking, leading: cfg.leading });
    }
    const block = composeBlock(main, sub, { vertical, align: cfg.align, subPos: cfg.subPos, subGap: cfg.subGap * S });
    return { main, sub, block, lines: { main: mainLines, sub: subLines }, cssM, cssS, meterM, meterS, S };
  };

  const S0 = cfg.size;
  const L0 = pageSrc.map(p => layoutPage(p, S0));
  let k = 1;
  if (cfg.autoShrink && L0.length) {
    let need = 0;
    const pad = paintPad(cfg, 1);
    for (const L of L0) {
      const sh = decoShape(deco, L.block, S0, 1, vertical, textStyleRefs);
      const e = sh ? sh.ext : { l: 0, t: 0, r: 0, b: 0 };
      const cw = L.block.w + e.l + e.r, ch = L.block.h + e.t + e.b;
      let nx = Math.max(cw / availW, (cw + 2 * pad) / W);
      let ny = Math.max(ch / availH, (ch + 2 * pad) / H);
      if (scroll) { if (vertical) nx = 0; else ny = 0; }
      need = Math.max(need, nx, ny);
    }
    if (need > 1) k = (1 / need) * 0.985;
  }
  let S = S0 * k;
  const minSize = Math.max(4, cfg.minSize || 12);
  if (S < minSize) S = Math.min(S0, minSize);
  k = S / S0;
  const LP = k === 1 ? L0 : pageSrc.map((p, i) => layoutPage(p, S, L0[i].lines));

  /* ---- 樣式與 sprite ---- */
  const styleMain = styleAt(cfg, k, 'main');
  /* 副文字比較小：外框、陰影、光暈依字級比例的平方根縮細，避免小字被外框糊掉 */
  const styleSub = scaleStyle(styleAt(cfg, k, 'sub'), clamp(Math.sqrt(cfg.subScale), 0.45, 1));
  const keyMain = JSON.stringify(styleMain);
  const keySub = JSON.stringify(styleSub);
  const artCache = new Map();
  const glowStrength = cfg.glow.on ? cfg.glow.strength : 0;

  const makeArt = (g, css, meter, style, skey, italic, blockBox) => {
    if (g.space) return null;
    const Sg = meter.size;
    const penX = g.x - g.adv / 2;
    const baseY = g.y + meter.central;
    let grad = null, gkey = '';
    if (style.fill.type === 'gradient') {
      if (style.fill.dir === 'v') {
        grad = vertical || g.rot0
          ? { kind: 'v', y0: -meter.central - Sg / 2, y1: -meter.central + Sg / 2 }
          : { kind: 'v', y0: -g.lineInkA, y1: g.lineInkD };
        gkey = `v${grad.y0.toFixed(1)},${grad.y1.toFixed(1)}`;
      } else {
        const bx0 = blockBox.x - penX, bx1 = blockBox.x + blockBox.w - penX;
        const by0 = blockBox.y - baseY, by1 = blockBox.y + blockBox.h - baseY;
        grad = style.fill.dir === 'h'
          ? { kind: 'h', x0: bx0, y0: 0, x1: bx1, y1: 0 }
          : { kind: 'd', x0: bx0, y0: by0, x1: bx1, y1: by1 };
        gkey = `${grad.kind}${bx0.toFixed(1)},${by0.toFixed(1)}`;
      }
    }
    const key = `${g.ch}\u0001${css}\u0001${skey}\u0001${gkey}`;
    let art = artCache.get(key);
    if (art === undefined) {
      art = paintGlyph(g.ch, css, g.m, g.adv, meter.central, style, grad, italic);
      artCache.set(key, art);
    }
    return art;
  };

  /* ---- 時間 ---- */
  const outroOn = !!cfg.outroOn;
  const decoOn = deco.kind !== 'none';
  const decoDur = decoOn && deco.anim !== 'none' ? deco.animTime : 0;
  const holdFx = HOLD[cfg.hold.fx] || HOLD.none;
  const pages = [];
  let t = Math.max(0, cfg.preBlank);
  const preEnd = t;
  const bgSync = cfg.bg.kind !== 'none' && cfg.bg.sync;

  LP.forEach((L, pi) => {
    const isLast = pi === LP.length - 1;
    /* 擺到畫面上 */
    const sh0 = decoShape(deco, L.block, S, k, vertical, textStyleRefs);
    const e = sh0 ? sh0.ext : { l: 0, t: 0, r: 0, b: 0 };
    const cw = L.block.w + e.l + e.r, ch = L.block.h + e.t + e.b;
    const an = cfg.anchor || 'mc';
    let cx0 = mx + (availW - cw) * (ANCHOR_X[an[1]] ?? 0.5) + cfg.offsetX;
    let cy0 = my + (availH - ch) * (ANCHOR_Y[an[0]] ?? 0.5) + cfg.offsetY;
    if (cfg.autoShrink && !scroll) {
      /* 發光或陰影會超出畫面時往內推 */
      const pad = paintPad(cfg, k);
      if (cw + 2 * pad <= W) { if (cx0 - pad < 0) cx0 = pad; if (cx0 + cw + pad > W) cx0 = W - pad - cw; }
      if (ch + 2 * pad <= H) { if (cy0 - pad < 0) cy0 = pad; if (cy0 + ch + pad > H) cy0 = H - pad - ch; }
    }
    let bx = cx0 + e.l, by = cy0 + e.t;
    if (scroll) {
      if (vertical) bx = 0; else by = 0; // 捲動方向的位置由時間決定
    }
    const box = { x: bx, y: by, w: L.block.w, h: L.block.h };
    const mainBox = { ...L.block.mainBox, x: L.block.mainBox.x + bx, y: L.block.mainBox.y + by };
    const subBox = L.block.subBox ? { ...L.block.subBox, x: L.block.subBox.x + bx, y: L.block.subBox.y + by } : null;
    const decoPlaced = placeDeco(sh0, bx, by, W, H, mx, my);

    const prepGroup = (glyphs, name, css, meter, style, skey, italic) => {
      for (const g of glyphs) {
        g.x += bx; g.y += by;
        g.axisPos += vertical ? by : bx;
        g.lineCenter += vertical ? by : bx;
        g.lineStart += vertical ? by : bx;
      }
      indexVisible(glyphs);
      glyphs.forEach((g, i) => {
        g.seed = (pi * 8192 + (name === 'sub' ? 4096 : 0) + i) | 0;
        g.art = makeArt(g, css, meter, style, skey, italic, box);
      });
      return { name, glyphs, S: meter.size, box: name === 'main' ? mainBox : subBox };
    };
    const mainG = prepGroup(L.block.glyphs, 'main', L.cssM, L.meterM, styleMain, keyMain, cfg.italic);
    const groups = [mainG];
    let subG = null;
    if (L.sub) { subG = prepGroup(L.block.subGlyphs, 'sub', L.cssS, L.meterS, styleSub, keySub, cfg.subItalic); groups.push(subG); }

    const page = {
      index: pi, box, mainBox, subBox, groups, deco: decoPlaced, center: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
      t0: t, S
    };
    const wrapDelay = decoOn && WRAP_DECOS.has(deco.kind) && deco.anim !== 'none' ? Math.min(0.6 * decoDur, 0.3) : 0;
    page.textStart = t + wrapDelay;

    let introEnd;
    if (scroll) {
      const len = vertical ? box.w : box.h;
      const span = (vertical ? W : H) + len;
      const dur = span / Math.max(1, flow.speed);
      page.scroll = { start: t, speed: Math.max(1, flow.speed), len, dur };
      for (const g of groups) { g.inBlock = null; g.glyphs.forEach(x => { x.inStart = t; x.inDur = 0; }); }
      page.introEnd = t + dur / 2;
      page.holdEnd = t + dur;
      page.end = t + dur;
      page.visibleEnd = isLast && !outroOn ? Infinity : page.end;
      page.repTime = t + dur / 2;
      pages.push(page);
      t = page.end + (isLast ? 0 : Math.max(0, flow.pageGap));
      return;
    }

    if (!long) {
      introEnd = scheduleIntroShort(cfg, page, mainG, subG);
    } else {
      introEnd = scheduleIntroLong(cfg, page, mainG, { W, H, S, k, styleMain, bgSync, preEnd, LPage: L });
    }
    introEnd = Math.max(introEnd, page.t0 + decoDur);
    page.introEnd = introEnd;
    page.holdEnd = introEnd + Math.max(0, cfg.holdTime);

    if (outroOn) {
      const textOutEnd = scheduleOutro(cfg, page, groups);
      page.textOutEnd = textOutEnd;
      const decoOutStart = page.holdEnd + 0.35 * (textOutEnd - page.holdEnd);
      page.decoOut = decoOn ? { start: decoOutStart, dur: decoDur } : null;
      page.end = Math.max(textOutEnd, decoOn ? decoOutStart + decoDur : 0);
      page.visibleEnd = page.end;
    } else {
      for (const grp of groups) { grp.outBlock = null; grp.glyphs.forEach(g => { g.outStart = null; }); }
      page.decoOut = null;
      page.end = page.holdEnd;
      page.visibleEnd = isLast ? Infinity : page.holdEnd; // 中間的頁在停留結束時瞬間消失
    }
    page.decoIn = decoOn ? { start: page.t0, dur: decoDur } : null;
    page.repTime = page.introEnd;
    pages.push(page);
    t = page.end + (isLast ? 0 : Math.max(0, long ? flow.pageGap : 0));
  });

  const lastEnd = pages.length ? pages[pages.length - 1].end : t;
  const duration = Math.max(0.05, lastEnd + Math.max(0, cfg.postBlank));
  const repTime = pages.length ? Math.min(pages[0].repTime, duration) : 0;

  return new Scene({
    cfg, W, H, S, S0, k, vertical, pages, duration, repTime, lastEnd, preEnd, outroOn, holdFx, glowStrength,
    deco, decoOn, bgSync, empty: pages.length === 0, fontsPromise, flowKind,
    shrunk: k < 0.999 ? { from: S0, to: S } : null
  });
}

/* ---------- 短句（標語、字幕）的登場時間表 ---------- */
function introPlan(defs, fxId, o) {
  const fx = defs[fxId] || defs.fade || defs.fadeOut;
  return {
    fx, id: fxId, dur: fx.instant ? 0 : Math.max(0.05, o.dur), gap: Math.max(fx.minGap || 0, o.gap || 0),
    ease: easeFor(fx, o.curve), P: fx.power === false ? 1 : (o.power ?? 1), dir: o.dir, order: fx.forceOrder || o.order || 'normal',
    seed: seedOf(fxId)
  };
}
function validDir(fx, dir) {
  if (!fx.dirs) return dir;
  return fx.dirs.some(d => d[0] === dir) ? dir : fx.dirs[0][0];
}

function scheduleGlyphs(grp, plan, start) {
  grp.fxIn = plan.fx; grp.easeIn = plan.ease; grp.envIn = plan;
  const maxRank = rankGlyphs(grp.glyphs, plan.order, plan.seed + grp.glyphs.length);
  for (const g of grp.glyphs) {
    g.inStart = start + Math.max(0, g.rank) * plan.gap;
    g.inDur = plan.dur;
  }
  return start + maxRank * plan.gap + plan.dur;
}

const SUB_FX = { fade: 'fade', rise: 'rise', focus: 'focus', converge: 'converge', slide: 'slide', slideOpp: 'slide', type: 'type' };
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

function scheduleIntroShort(cfg, page, mainG, subG) {
  const io = cfg.intro;
  const fxDef = INTRO[io.fx] || INTRO.fade;
  const start = page.textStart;
  let mainEnd;
  const blockMode = fxDef.unit === 'block';
  if (blockMode) {
    const plan = introPlan(INTRO, io.fx, { ...io, dir: validDir(fxDef, io.dir) });
    const shared = !!subG && cfg.subIntro === 'same';
    const unionBox = page.box;
    mainG.inBlock = { ...plan, start, box: shared ? unionBox : mainG.box };
    mainG.glyphs.forEach(g => { g.inStart = start; g.inDur = 0; });
    rankGlyphs(mainG.glyphs, 'normal', 0);
    mainEnd = start + plan.dur;
    if (shared) {
      subG.inBlock = mainG.inBlock;
      subG.glyphs.forEach(g => { g.inStart = start; g.inDur = 0; });
      rankGlyphs(subG.glyphs, 'normal', 0);
      return mainEnd;
    }
  } else {
    const plan = introPlan(INTRO, io.fx, { ...io, dir: validDir(fxDef, io.dir) });
    mainG.inBlock = null;
    mainEnd = scheduleGlyphs(mainG, plan, start);
  }
  if (!subG) return mainEnd;
  /* 副文字：在主文字登場結束＋時差時開始，不早於文字開始 */
  const subStart = Math.max(start, mainEnd + cfg.subOffset);
  let plan;
  if (cfg.subIntro === 'same') {
    plan = introPlan(INTRO, io.fx, { ...io, gap: Math.min(io.gap, 0.05), dir: validDir(fxDef, io.dir) });
  } else {
    const id = SUB_FX[cfg.subIntro] || 'fade';
    const def = INTRO[id];
    let dir = 'left';
    if (id === 'slide') {
      const mainDir = io.fx === 'slide' ? io.dir : 'up';
      dir = cfg.subIntro === 'slideOpp' ? OPPOSITE[mainDir] || 'down' : (io.fx === 'slide' ? io.dir : 'left');
    }
    const gap = id === 'fade' ? 0 : id === 'type' ? 0.05 : 0.035;
    plan = introPlan(INTRO, id, { dur: def.dur, gap, curve: 'auto', power: 1, dir, order: 'normal' });
  }
  subG.inBlock = null;
  const subEnd = scheduleGlyphs(subG, plan, subStart);
  return Math.max(mainEnd, subEnd);
}

/* ---------- 長文的顯示流程 ---------- */
function scheduleIntroLong(cfg, page, grp, ctx) {
  const f = cfg.flow;
  const start = page.textStart;
  const glyphs = grp.glyphs;
  let charFx = f.charFx;
  if (!INTRO[charFx] || INTRO[charFx].unit !== 'glyph' || INTRO[charFx].shortOnly) charFx = 'fade';
  const cdef = INTRO[charFx];
  const charDur = cdef.instant ? 0 : Math.max(0, f.charDur);
  const plan = introPlan(INTRO, charFx, { dur: Math.max(0.0001, charDur), gap: 0, curve: cfg.intro.curve, power: cfg.intro.power, dir: validDir(cdef, cfg.intro.dir), order: 'normal' });
  if (charDur === 0) plan.dur = 0;
  grp.inBlock = null;
  grp.fxIn = plan.fx; grp.easeIn = plan.ease; grp.envIn = plan;
  rankGlyphs(glyphs, 'normal', 0);
  const beat = 1 / clamp(f.cps, 1, 60);
  let end = start;
  const setAll = (s, d) => glyphs.forEach(g => { g.inStart = s; g.inDur = d; });

  switch (f.kind) {
    case 'big': {
      /* 中央大字輪播 */
      let tt = start;
      if (ctx.bgSync && page.index === 0) tt = Math.max(tt, ctx.preEnd + 0.4); // 等背景完全淡入
      const seq = [];
      let blank = false;
      let prevLine = glyphs.length ? glyphs[0].line : 0;
      for (const g of glyphs) {
        if (g.line !== prevLine) { if (!blank) { tt += beat; blank = true; } prevLine = g.line; }
        if (g.space) { if (!blank) { tt += beat; blank = true; } continue; }
        seq.push({ g, start: tt, end: tt + beat });
        tt += beat;
        blank = false;
      }
      const slam = tt + Math.max(0, f.bigPause);
      const bigSize = clamp(f.bigRatio, 0.15, 0.9) * Math.min(ctx.W, ctx.H);
      const factor = bigSize / ctx.S;
      const bigStyle = scaleStyle(ctx.styleMain, factor);
      const skey = JSON.stringify(bigStyle);
      const cssBig = ctx.LPage.cssM.replace(/[\d.]+px/, `${bigSize.toFixed(2)}px`);
      const meterBig = new Meter(cssBig, bigSize, cfg.text);
      const arts = new Map();
      for (const e of seq) {
        const key = e.g.ch;
        if (!arts.has(key)) {
          const m = meterBig.get(key);
          const art = paintGlyph(key, cssBig, m, m.w, meterBig.central, bigStyle,
            bigStyle.fill.type === 'gradient' ? { kind: 'v', y0: -m.a, y1: m.d } : null, cfg.italic);
          /* 墨跡中心對齊畫面中心 */
          const inkX = (m.r - m.l) / 2 - m.w / 2;
          const inkY = (m.d - m.a) / 2 + meterBig.central;
          arts.set(key, { art, x: ctx.W / 2 - inkX, y: ctx.H / 2 - inkY, skey });
        }
        e.big = arts.get(key);
      }
      /* 整句砸下時的放大倍率：會超出畫面就降低 */
      const fit = Math.min(ctx.W / Math.max(1, page.box.w), ctx.H / Math.max(1, page.box.h));
      const imp = clamp(f.impact, 0, 2);
      const amp = Math.max(0, Math.min(0.2 * imp, fit - 1));
      page.big = { seq, slam };
      grp.inBlock = { fx: SLAM, start: slam, dur: 0.26, ease: EASE.linear, P: 1, S: ctx.S, amp, impact: imp, seed: 1234, box: page.box };
      setAll(slam, 0);
      end = slam + 0.26;
      break;
    }
    case 'stack': {
      const appear = 0.25, hold = Math.max(0, f.stackHold), spread = clamp(f.spreadTime, 0.1, 3);
      const dur = appear + hold + spread;
      const a = appear / dur, b = (appear + hold) / dur;
      const ease = cfg.intro.curve && cfg.intro.curve !== 'auto' ? EASE[cfg.intro.curve] || EASE.glide : EASE.glide;
      grp.fxIn = { apply: (st, u, _e, g, env) => stackPose(st, u, ease, g, env, a, b) };
      grp.easeIn = ease;
      grp.envIn = { ...plan, P: 1 };
      setAll(start, dur);
      end = start + dur;
      break;
    }
    case 'line': case 'scan': {
      const gapL = clamp(f.lineGap, 0.1, 4);
      const scan = clamp(f.scanTime, 0.2, 5);
      let li = -1, lastLine = null, lineStart = start;
      for (const g of glyphs) {
        if (g.line !== lastLine) { lastLine = g.line; li++; lineStart = start + li * gapL; }
        let s = lineStart;
        if (f.kind === 'scan' && g.lineLen > 0) s += clamp01((g.axisPos - g.adv / 2 - g.lineStart) / g.lineLen) * scan;
        g.inStart = s; g.inDur = plan.dur;
        end = Math.max(end, s + plan.dur);
      }
      break;
    }
    case 'all': {
      setAll(start, plan.dur);
      end = start + plan.dur;
      break;
    }
    default: {
      /* 依序逐字：空白也佔一拍；句讀、行尾有額外停頓。
       * 連在一起的句讀與閉括號（例如「。」」）只在最後一個之後停一次。 */
      const P = Math.max(0, f.punctPause);
      let tt = start;
      let pending = 0;
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        const next = glyphs[i + 1];
        g.inStart = tt; g.inDur = plan.dur;
        end = Math.max(end, tt + plan.dur);
        tt += beat;
        if (PAUSE_LONG.has(g.ch)) pending = Math.max(pending, P);
        else if (PAUSE_SHORT.has(g.ch)) pending = Math.max(pending, P / 2);
        const glued = next && next.line === g.line && (CLOSERS.has(next.ch) || PAUSE_LONG.has(next.ch) || PAUSE_SHORT.has(next.ch));
        if (pending && !glued) { tt += pending; pending = 0; }
        if (next && next.line !== g.line) tt += Math.max(0, f.linePause);
      }
      if (f.cursor) {
        const seq = glyphs.slice();
        page.cursor = { seq, typedAt: glyphs.length ? glyphs[glyphs.length - 1].inStart : start, start, color: f.cursorColor || '' };
      }
      break;
    }
  }
  return end;
}

/* ---------- 退場時間表（主文字與副文字各自從停留結束時開始排順序） ---------- */
function scheduleOutro(cfg, page, groups) {
  const oo = cfg.outro;
  const def = OUTRO[oo.fx] || OUTRO.fadeOut;
  const plan = introPlan(OUTRO, oo.fx, { ...oo, dir: validDir(def, oo.dir) });
  const start = page.holdEnd;
  let end = start;
  if (def.unit === 'block') {
    const ob = { ...plan, start, box: page.box };
    for (const grp of groups) { grp.outBlock = ob; grp.glyphs.forEach(g => { g.outStart = null; }); }
    return start + plan.dur;
  }
  for (const grp of groups) {
    grp.outBlock = null;
    grp.fxOut = plan.fx; grp.easeOut = plan.ease; grp.envOut = plan;
    /* 名次另外存，避免蓋掉登場用的名次 */
    const saved = grp.glyphs.map(g => g.rank);
    const maxRank = rankGlyphs(grp.glyphs, plan.order, plan.seed + 7 + grp.glyphs.length);
    grp.glyphs.forEach((g, i) => {
      g.outStart = start + Math.max(0, g.rank) * plan.gap;
      g.outDur = plan.dur;
      g.rank = saved[i];
    });
    end = Math.max(end, start + maxRank * plan.gap + plan.dur);
  }
  return end;
}

/* ---------- 場景 ---------- */
class Scene {
  constructor(o) {
    Object.assign(this, o);
    this._st = freshGlyphState();
    this._blk = freshBlockState();
    this._hold = freshBlockState();
    this.layers = null;
    this.phases = [];
    for (const p of this.pages) {
      this.phases.push({ kind: 'intro', a: p.t0, b: p.introEnd, page: p.index });
      if (p.scroll) continue;
      this.phases.push({ kind: 'hold', a: p.introEnd, b: p.holdEnd, page: p.index });
      if (this.outroOn) this.phases.push({ kind: 'outro', a: p.holdEnd, b: p.end, page: p.index });
    }
  }

  getLayers() {
    if (!this.layers) {
      const mk = () => { const c = makeCanvas(this.W, this.H); return { c, x: c.getContext('2d') }; };
      this.layers = { text: mk(), a: mk(), b: mk(), mix: mk() };
    }
    return this.layers;
  }

  pageAt(t) {
    for (const p of this.pages) if (t >= p.t0 && t < p.visibleEnd) return p;
    return null;
  }

  phaseAt(t) {
    for (const ph of this.phases) if (t >= ph.a && t < ph.b) return ph;
    return null;
  }

  /* 這個時刻畫面是不是完全空的（開始前、頁與頁之間、結束後） */
  isBlankAt(t) {
    return !this.pageAt(t) && !(this.cfg.bg.kind !== 'none' && this.backdropAmount(t) > 0.01);
  }

  backdropAmount(t) {
    if (this.cfg.bg.kind === 'none') return 0;
    if (!this.bgSync) return 1;
    if (t < this.preEnd) return 0;
    let a = EASE.out(clamp01((t - this.preEnd) / 0.4));
    if (this.outroOn) {
      if (t >= this.lastEnd) return 0;
      const u = clamp01((t - (this.lastEnd - 0.4)) / 0.4);
      a *= 1 - EASE.in(u);
    }
    return a;
  }

  draw(ctx, t) {
    const { W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (CANVAS_FILTER_OK) ctx.filter = 'none';
    ctx.clearRect(0, 0, W, H);
    drawBackdrop(ctx, this.cfg.bg, W, H, this.backdropAmount(t));
    const page = this.pageAt(t);
    if (!page) return;

    const S = this.S;
    /* 停留效果（整塊）：依絕對時間 */
    const hold = freshBlockState(this._hold);
    hold.decoAlpha = 1;
    const hEnv = {
      S, P: this.cfg.hold.power, seed: 777, vertical: this.vertical,
      introEnd: page.introEnd, holdEnd: this.outroOn || page.visibleEnd !== Infinity ? page.holdEnd : Infinity
    };
    if (this.holdFx.block) this.holdFx.block(hold, t, hEnv);

    const mainG = page.groups[0];
    const mainBlk = this.groupBlock(mainG, t, page, this._blk);

    /* 裝飾：跟著整塊位移一起動，只有圓角底框跟著縮放 */
    if (page.deco) {
      const d = this.deco;
      let pin = 1, pout = 0;
      if (page.decoIn && page.decoIn.dur > 0) pin = EASE.out(clamp01((t - page.decoIn.start) / page.decoIn.dur));
      if (page.decoOut && t >= page.decoOut.start) pout = page.decoOut.dur > 0 ? EASE.in(clamp01((t - page.decoOut.start) / page.decoOut.dur)) : 1;
      const visible = !(d.anim === 'none' && page.textOutEnd != null && t >= page.textOutEnd && this.outroOn);
      if (visible) {
        drawDeco(ctx, page.deco, d, this.cfg, {
          pin, pout, t, alpha: hold.decoAlpha,
          dx: hold.dx + mainBlk.dx, dy: hold.dy + mainBlk.dy,
          scale: hold.s * mainBlk.s, cx: page.center.x, cy: page.center.y
        });
      }
    }

    /* 中央大字輪播：整句砸下之前，畫面中央一次只有一個大字 */
    if (page.big && t < page.big.slam) {
      const e = page.big.seq.find(x => t >= x.start && t < x.end);
      if (e && e.big.art) {
        const b = (t - e.start) / (e.end - e.start);
        const s = 1 + 0.08 * (1 - b) ** 2;
        ctx.save();
        ctx.translate(e.big.x + hold.dx, e.big.y + hold.dy);
        ctx.scale(s * hold.s, s * hold.s);
        const art = e.big.art;
        ctx.globalAlpha = clamp01(hold.alpha);
        this.drawHalo(ctx, art, ctx.globalAlpha, this.glowStrength * hold.haloMul);
        ctx.drawImage(art.body, -art.px, -art.py);
        ctx.restore();
      }
      return;
    }

    this.drawGroup(ctx, mainG, mainBlk, hold, t, page);
    for (let i = 1; i < page.groups.length; i++) {
      const grp = page.groups[i];
      const blk = grp.inBlock === mainG.inBlock && grp.outBlock === mainG.outBlock ? mainBlk : this.groupBlock(grp, t, page, freshBlockState());
      this.drawGroup(ctx, grp, blk, hold, t, page);
    }
  }

  /* 一個字群在 t 時的整塊狀態（整塊登場／退場效果） */
  groupBlock(grp, t, page, out) {
    const b = freshBlockState(out);
    const box = (grp.inBlock && grp.inBlock.box) || grp.box || page.box;
    b.cx = box.x + box.w / 2; b.cy = box.y + box.h / 2;
    const ib = grp.inBlock;
    if (ib) {
      if (t < ib.start) { b.alpha = 0; return b; }
      if (t < ib.start + ib.dur) {
        const u = (t - ib.start) / ib.dur;
        ib.fx.apply(b, u, ib.ease, { S: page.S, P: ib.P, dir: ib.dir, seed: ib.seed, tLocal: t - ib.start, tAbs: t, dur: ib.dur, vertical: this.vertical, amp: ib.amp, impact: ib.impact });
        b.wipeBox = ib.box;
      }
    }
    const ob = grp.outBlock;
    if (ob && t >= ob.start) {
      if (t >= ob.start + ob.dur) { b.alpha = 0; return b; }
      const u = (t - ob.start) / ob.dur;
      b.cx = ob.box.x + ob.box.w / 2; b.cy = ob.box.y + ob.box.h / 2;
      ob.fx.apply(b, u, ob.ease, { S: page.S, P: ob.P, dir: ob.dir, seed: ob.seed + 3, tLocal: t - ob.start, tAbs: t, dur: ob.dur, vertical: this.vertical });
      b.wipeBox = ob.box;
    }
    return b;
  }

  drawHalo(ctx, art, alpha, amount) {
    if (!art.halo || amount <= 0.001) return;
    const base = ctx.globalAlpha;
    let left = amount;
    while (left > 0.001) {
      ctx.globalAlpha = alpha * Math.min(1, left);
      ctx.drawImage(art.halo, -art.px, -art.py);
      left -= 1;
    }
    ctx.globalAlpha = base;
  }

  drawGroup(ctx, grp, blk, hold, t, page) {
    const alphaB = blk.alpha * hold.alpha;
    if (alphaB <= 0.002) return;
    const glitch = Math.max(blk.glitch, hold.glitch);
    const edgeFade = page.scroll && this.cfg.flow.edgeFade;
    const needLayer = !!blk.wipe || Math.abs(blk.split) > 0.01 || glitch > 0.004 || edgeFade;
    const L = needLayer ? this.getLayers() : null;
    const target = needLayer ? L.text.x : ctx;
    if (needLayer) {
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = 1;
      target.clearRect(0, 0, this.W, this.H);
    }
    target.save();
    /* 停留效果的變形（以整段文字中心為準），再疊上整塊效果的變形 */
    const hc = page.center;
    target.translate(hc.x + hold.dx, hc.y + hold.dy);
    if (hold.s !== 1) target.scale(hold.s, hold.s);
    target.translate(-hc.x, -hc.y);
    target.translate(blk.cx + blk.dx, blk.cy + blk.dy);
    const bsx = blk.s * blk.sx, bsy = blk.s * blk.sy;
    if (bsx !== 1 || bsy !== 1) target.scale(bsx, bsy);
    target.translate(-blk.cx, -blk.cy);
    if (page.scroll) {
      const off = (t - page.scroll.start) * page.scroll.speed;
      if (this.vertical) target.translate(-page.scroll.len + off, 0);
      else target.translate(0, this.H - off);
    }

    const env = grp.envIn ? { S: grp.S, P: grp.envIn.P, dir: grp.envIn.dir, seed: grp.envIn.seed, vertical: this.vertical } : null;
    const envOut = grp.envOut ? { S: grp.S, P: grp.envOut.P, dir: grp.envOut.dir, seed: grp.envOut.seed, vertical: this.vertical } : null;
    const hEnv = { S: grp.S, P: this.cfg.hold.power, vertical: this.vertical };
    const haloAmt = this.glowStrength * blk.haloMul * hold.haloMul;
    const st = this._st;
    for (const g of grp.glyphs) {
      if (!g.art) continue;
      freshGlyphState(st);
      if (!grp.inBlock) {
        if (t < g.inStart) continue;
        if (g.inDur > 0 && t < g.inStart + g.inDur) grp.fxIn.apply(st, (t - g.inStart) / g.inDur, grp.easeIn, g, env);
      }
      if (g.outStart != null && t >= g.outStart) {
        if (g.outDur <= 0 || t >= g.outStart + g.outDur) continue;
        grp.fxOut.apply(st, (t - g.outStart) / g.outDur, grp.easeOut, g, envOut);
      }
      if (this.holdFx.glyph) this.holdFx.glyph(st, t, g, hEnv);
      const a = st.alpha * alphaB;
      if (a <= 0.002) continue;
      this.drawGlyph(target, g, st, a, blk.blur, blk.white, haloAmt);
    }
    if (grp.name === 'main' && page.cursor) this.drawCursor(target, page, grp, t, alphaB);
    target.restore();

    if (!needLayer) return;
    const lx = L.text.x;
    if (blk.wipe) this.applyWipe(lx, blk.wipe, blk.wipeBox || page.box, grp.S, hold);
    if (edgeFade) this.applyEdgeFade(lx);
    let src = L.text.c;
    if (Math.abs(blk.split) > 0.01) {
      const m = L.mix;
      m.x.setTransform(1, 0, 0, 1, 0, 0);
      m.x.clearRect(0, 0, this.W, this.H);
      /* 裂縫在主文字的正中間：上半往一邊、下半（連同副文字）往另一邊 */
      const mb = page.mainBox && page.mainBox.h > 0 ? page.mainBox : page.box;
      const cy = mb.y + mb.h / 2 + hold.dy;
      m.x.save(); m.x.beginPath(); m.x.rect(0, 0, this.W, cy); m.x.clip(); m.x.drawImage(src, -blk.split, 0); m.x.restore();
      m.x.save(); m.x.beginPath(); m.x.rect(0, cy, this.W, this.H - cy); m.x.clip(); m.x.drawImage(src, blk.split, 0); m.x.restore();
      src = m.c;
    }
    if (glitch > 0.004) this.drawGlitch(ctx, src, glitch, t, page, grp.S, hold);
    else ctx.drawImage(src, 0, 0);
  }

  drawGlyph(ctx, g, st, a, blockBlur, white, haloAmt) {
    const art = g.art;
    ctx.save();
    ctx.translate(g.x + st.dx, g.y + st.dy);
    if (st.rot) ctx.rotate(st.rot);
    const sx = st.s * st.sx, sy = st.s * st.sy;
    if (sx !== 1 || sy !== 1) ctx.scale(Math.max(1e-4, sx), Math.max(1e-4, sy));
    if (g.rot0) ctx.rotate(g.rot0);
    const blur = st.blur + blockBlur;
    if (blur > 0.3) {
      if (!CANVAS_FILTER_OK) { this.drawSoft(ctx, art, a, blur, white, haloAmt); ctx.restore(); return; }
      /* 在 sprite 原尺寸下模糊（半徑除以目前的放大倍率），再放大畫上去：
       * 大字放大很多倍時，比直接在畫面上模糊快十倍以上 */
      const m = ctx.getTransform();
      const scale = Math.max(1e-3, Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
      const img = this.blurredArt(art, blur / scale, haloAmt, white);
      ctx.globalAlpha = a;
      ctx.drawImage(img.c, 0, 0, img.w, img.h, -art.px - img.pad, -art.py - img.pad, img.w, img.h);
      ctx.restore();
      return;
    }
    ctx.globalAlpha = a;
    this.drawHalo(ctx, art, a, haloAmt);
    ctx.globalAlpha = a;
    ctx.drawImage(art.body, -art.px, -art.py);
    if (white > 0.002) {
      ctx.globalAlpha = a * Math.min(1, white);
      ctx.drawImage(art.flash(), -art.px, -art.py);
    }
    ctx.restore();
  }

  /* 一個字（光暈＋本體＋閃白）合成後在 sprite 座標下模糊，回傳暫存畫布 */
  blurredArt(art, r, haloAmt, white) {
    const pad = Math.ceil(r * 3) + 2;
    const w = art.w + pad * 2, h = art.h + pad * 2;
    const pool = this._blurPool || (this._blurPool = { a: makeCanvas(8, 8), b: makeCanvas(8, 8) });
    for (const c of [pool.a, pool.b]) if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
    const xa = pool.a.getContext('2d');
    xa.setTransform(1, 0, 0, 1, 0, 0);
    xa.globalAlpha = 1;
    xa.clearRect(0, 0, w, h);
    if (art.halo && haloAmt > 0.001) {
      let left = haloAmt;
      while (left > 0.001) { xa.globalAlpha = Math.min(1, left); xa.drawImage(art.halo, pad, pad); left -= 1; }
      xa.globalAlpha = 1;
    }
    xa.drawImage(art.body, pad, pad);
    if (white > 0.002) { xa.globalAlpha = Math.min(1, white); xa.drawImage(art.flash(), pad, pad); xa.globalAlpha = 1; }
    const xb = pool.b.getContext('2d');
    xb.setTransform(1, 0, 0, 1, 0, 0);
    xb.globalAlpha = 1;
    xb.clearRect(0, 0, w, h);
    xb.filter = `blur(${r.toFixed(2)}px)`;
    xb.drawImage(pool.a, 0, 0, w, h, 0, 0, w, h);
    xb.filter = 'none';
    return { c: pool.b, w, h, pad };
  }

  /* 不支援 canvas filter 的瀏覽器：縮小再放大的近似模糊 */
  drawSoft(ctx, art, a, blur, white, haloAmt) {
    const f = Math.max(1, blur / 1.5);
    const w = Math.max(1, Math.round(art.w / f)), h = Math.max(1, Math.round(art.h / f));
    const tmp = this._soft || (this._soft = makeCanvas(8, 8));
    if (tmp.width < w || tmp.height < h) { tmp.width = Math.max(tmp.width, w); tmp.height = Math.max(tmp.height, h); }
    const x = tmp.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, tmp.width, tmp.height);
    x.imageSmoothingQuality = 'high';
    if (art.halo && haloAmt > 0) { x.globalAlpha = Math.min(1, haloAmt); x.drawImage(art.halo, 0, 0, w, h); }
    x.globalAlpha = 1;
    x.drawImage(art.body, 0, 0, w, h);
    if (white > 0.002) { x.globalAlpha = Math.min(1, white); x.drawImage(art.flash(), 0, 0, w, h); }
    ctx.globalAlpha = a;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, 0, 0, w, h, -art.px, -art.py, art.w, art.h);
  }

  drawCursor(ctx, page, grp, t, alphaB) {
    const c = page.cursor;
    if (t < c.start || t >= page.holdEnd) return;
    let last = null;
    for (const g of c.seq) { if (g.inStart <= t) last = g; else break; }
    if (t >= c.typedAt + 1e-6) {
      const ph = (t - c.typedAt) % 0.9;
      if (ph >= 0.45) return;
    }
    const S = grp.S;
    const ref = last || c.seq[0];
    if (!ref) return;
    const color = c.color || (this.cfg.fill.mode === 'gradient' ? (this.cfg.fill.colors[0] || this.cfg.fill.color) : this.cfg.fill.color);
    ctx.save();
    ctx.globalAlpha = alphaB;
    ctx.fillStyle = color;
    const sw = this.cfg.stroke.on ? Math.max(1, this.cfg.stroke.width * this.k * 0.6) : 0;
    let x, y, w, h;
    if (!this.vertical) {
      w = 0.07 * S; h = S * 0.92;
      x = last ? ref.x + ref.adv / 2 + 0.08 * S : ref.x - ref.adv / 2 - w - 0.04 * S;
      y = ref.y - h / 2;
    } else {
      w = S * 0.92; h = 0.07 * S;
      x = ref.x - w / 2;
      y = last ? ref.y + ref.adv / 2 + 0.08 * S : ref.y - ref.adv / 2 - h - 0.04 * S;
    }
    if (sw > 0) { ctx.lineWidth = sw * 2; ctx.strokeStyle = this.cfg.stroke.color; ctx.lineJoin = 'round'; ctx.strokeRect(x, y, w, h); }
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /* 遮罩擦出／擦除：柔邊約 0.6 S，掃描範圍是文字框外擴 0.25 S */
  applyWipe(x, wp, box, S, hold) {
    const soft = Math.max(1, 0.6 * S * (wp.soft || 1));
    const pad = 0.25 * S;
    const bx = box.x + hold.dx, by = box.y + hold.dy;
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    let g;
    const v = clamp01(wp.v);
    const lin = (a0, a1, horiz) => {
      /* 進場：前緣從 a0 掃到 a1；a<前緣−柔邊 全部可見 */
      const lead = a0 + v * (a1 - a0);
      return horiz ? x.createLinearGradient(lead - soft, 0, lead, 0) : x.createLinearGradient(0, lead - soft, 0, lead);
    };
    const dir = wp.dir;
    if (dir === 'center') {
      /* 從中央往左右：進場是中央先出現、往兩側擴大；退場是中央先空 */
      const c = bx + box.w / 2;
      const R = (box.w / 2 + pad + soft) * v;
      const inner = wp.out ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)';
      const outer = wp.out ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)';
      if (R <= 0.5) {
        if (!wp.out) { x.fillStyle = outer; x.fillRect(0, 0, this.W, this.H); }
        x.restore();
        return;
      }
      g = x.createLinearGradient(c - R, 0, c + R, 0);
      const k = Math.min(0.5, soft / (2 * R));
      g.addColorStop(0, outer); g.addColorStop(k, inner); g.addColorStop(1 - k, inner); g.addColorStop(1, outer);
      x.fillStyle = g;
      x.fillRect(0, 0, this.W, this.H);
      x.restore();
      return;
    }
    const horiz = dir === 'ltr' || dir === 'rtl';
    const rev = dir === 'rtl' || dir === 'btt';
    const lo = (horiz ? bx : by) - pad;
    const hi = (horiz ? bx + box.w : by + box.h) + pad + soft;
    if (!rev) {
      g = lin(lo, hi, horiz);
      /* 進場：前緣左側可見；退場：前緣左側消失 */
      g.addColorStop(0, wp.out ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
      g.addColorStop(1, wp.out ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)');
    } else {
      const a0 = (horiz ? bx + box.w : by + box.h) + pad;
      const a1 = (horiz ? bx : by) - pad - soft;
      const lead = a0 + v * (a1 - a0);
      g = horiz ? x.createLinearGradient(lead, 0, lead + soft, 0) : x.createLinearGradient(0, lead, 0, lead + soft);
      g.addColorStop(0, wp.out ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)');
      g.addColorStop(1, wp.out ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
    }
    x.fillStyle = g;
    x.fillRect(0, 0, this.W, this.H);
    x.restore();
  }

  /* 捲動時畫面上下（直書左右）各約 14% 淡出 */
  applyEdgeFade(x) {
    const { W, H } = this;
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    const g = this.vertical ? x.createLinearGradient(0, 0, W, 0) : x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.14, 'rgba(0,0,0,1)');
    g.addColorStop(0.86, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    x.restore();
  }

  /* 雜訊外觀：洋紅往左、青色往右的兩份單色複本墊在後面，再加 2～6 條水平錯位切片。
   * 亂數每 1/20 秒換一次，不隨輸出 fps 變。 */
  drawGlitch(ctx, src, g, t, page, S, hold) {
    const L = this.getLayers();
    const { W, H } = this;
    const slot = timeSlot(t, 20);
    const seed = 4242;
    const u01 = (n) => (hashSigned(slot, n, seed) + 1) / 2;
    const off = S * (0.03 + 0.03 * u01(1)) * Math.min(g, 2.5);
    const tint = (layer, color) => {
      const x = layer.x;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      x.clearRect(0, 0, W, H);
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = color;
      x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
    };
    tint(L.a, this.cfg.glitchA || '#ff2a6d');
    tint(L.b, this.cfg.glitchB || '#23e5ff');
    /* 合成層：src 是 text 層時用 mix，src 已經是 mix（裂開效果）時改用 text 層 */
    const comp = src === L.mix.c ? L.text : L.mix;
    const m = comp.x;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.clearRect(0, 0, W, H);
    m.globalAlpha = 0.8 * clamp01(g * 2.5);
    m.drawImage(L.a.c, -off, 0);
    m.drawImage(L.b.c, off, 0);
    m.globalAlpha = 1;
    m.drawImage(src, 0, 0);
    /* 水平切片錯位：在另一層（L.a，已用完）組好，再整張畫到畫面上，不動到底下的背景與裝飾 */
    const out = L.a.x;
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.globalAlpha = 1;
    out.clearRect(0, 0, W, H);
    out.drawImage(comp.c, 0, 0);
    const box = page.box;
    const n = 2 + Math.floor(u01(2) * 5);
    for (let i = 0; i < n; i++) {
      const hgt = S * (0.03 + 0.14 * u01(20 + i));
      const y = Math.round(box.y + hold.dy - S * 0.2 + u01(10 + i) * (box.h + S * 0.4) - hgt / 2);
      const shift = Math.round(hashSigned(slot, 30 + i, seed) * 0.25 * S * Math.min(g, 2.5));
      const y0 = clamp(y, 0, H - 1);
      const y1 = clamp(y + Math.max(1, Math.round(hgt)), 0, H);
      if (y1 <= y0) continue;
      out.clearRect(0, y0, W, y1 - y0);
      out.drawImage(comp.c, 0, y0, W, y1 - y0, shift, y0, W, y1 - y0);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(L.a.c, 0, 0);
    ctx.restore();
  }
}
