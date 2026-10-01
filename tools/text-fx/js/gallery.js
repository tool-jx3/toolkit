/* 文字演出產生器：效果一覽（用使用者目前的文字，同時播放每種效果） */
import { deepClone } from './core.js';
import { buildScene } from './scene.js';
import { INTRO, OUTRO, HOLD } from './motion.js';
import { introOf, outroOf } from './library.js';
import { h } from './ui.js';

const TILE_W = 288;

/* 把整組設定等比例縮到小畫布（所有 px 值跟著縮，看起來跟大畫面一樣） */
function miniCfg(src, ratio) {
  const c = deepClone(src);
  const r = v => v * ratio;
  c.canvasW = Math.round(src.canvasW * ratio);
  c.canvasH = Math.round(src.canvasH * ratio);
  c.size = r(src.size); c.minSize = Math.max(3, r(src.minSize));
  c.marginX = r(src.marginX); c.marginY = r(src.marginY); c.offsetX = r(src.offsetX); c.offsetY = r(src.offsetY);
  c.stroke.width = r(src.stroke.width); c.outer.width = r(src.outer.width);
  c.shadow.blur = r(src.shadow.blur); c.shadow.x = r(src.shadow.x); c.shadow.y = r(src.shadow.y);
  c.glow.spread = r(src.glow.spread);
  c.deco.lineWidth = r(src.deco.lineWidth); c.deco.tapeWidth = r(src.deco.tapeWidth); c.deco.tapeSpeed = r(src.deco.tapeSpeed);
  c.flow.speed = r(src.flow.speed);
  return c;
}

function firstPage(text) {
  const pages = String(text || '').split(/\n[ \t　]*\n/);
  const p = (pages.find(x => x.trim()) || '').split('\n').slice(0, 3);
  return p.map(l => Array.from(l).slice(0, 18).join('')).join('\n');
}

function itemsFor(kind, c) {
  switch (kind) {
    case 'intro': return Object.entries(INTRO).map(([id, d]) => [id, d.name, d.unit === 'block' ? '整塊' : '逐字']);
    case 'outro': return Object.entries(OUTRO).map(([id, d]) => [id, d.name, d.unit === 'block' ? '整塊' : '逐字']);
    case 'hold': return Object.entries(HOLD).map(([id, d]) => [id, d.name, '']);
    case 'char': return Object.entries(INTRO).filter(([, d]) => d.unit === 'glyph' && !d.shortOnly).map(([id, d]) => [id, d.name, '']);
    case 'flow': return [['seq', '逐字打出'], ['big', '中央逐字'], ['stack', '中央展開'], ['line', '逐行'], ['scan', '流動掃過'], ['all', '整段浮現'], ['scroll', '向上捲動']].map(x => [...x, '']);
    default: return [];
  }
}

function variant(kind, id, base) {
  const c = deepClone(base);
  c.preBlank = 0.15;
  c.postBlank = 0.1;
  if (c.mode === 'long') { c.text = firstPage(c.text); c.paging = false; }
  if (kind === 'intro') {
    const keepDir = INTRO[id].dirs && INTRO[id].dirs.some(x => x[0] === c.intro.dir);
    c.intro = introOf(id, { order: c.intro.order, dir: keepDir ? c.intro.dir : undefined });
    if (!c.intro.dir) c.intro.dir = INTRO[id].dirs ? INTRO[id].dirs[0][0] : 'left';
    c.hold.fx = 'none'; c.holdTime = 0.9; c.outroOn = false;
  } else if (kind === 'outro') {
    c.outroOn = true;
    c.outro = outroOf(id);
    if (c.mode !== 'long') c.intro = introOf('fade', { dur: 0.25 }); else { c.flow.kind = 'all'; c.flow.charFx = 'fade'; c.flow.charDur = 0.25; }
    c.hold.fx = 'none'; c.holdTime = 0.5;
  } else if (kind === 'hold') {
    c.hold.fx = id; c.holdTime = 3.2; c.outroOn = false;
    if (id === 'breathe' && !c.glow.on) c.glow.on = true;
    if (c.mode !== 'long') c.intro = introOf('fade', { dur: 0.3 }); else { c.flow.kind = 'all'; c.flow.charFx = 'fade'; c.flow.charDur = 0.3; }
  } else if (kind === 'flow') {
    c.flow.kind = id; c.outroOn = false; c.holdTime = 0.9; c.hold.fx = 'none';
    if (id === 'scroll') { c.flow.speed = Math.max(c.flow.speed, 140); }
  } else if (kind === 'char') {
    if (['big', 'stack', 'scroll'].includes(c.flow.kind)) c.flow.kind = 'seq';
    c.flow.charFx = id;
    c.flow.charDur = INTRO[id].instant ? 0 : Math.max(0.4, c.flow.charDur || 0.4);
    c.outroOn = false; c.holdTime = 0.8; c.hold.fx = 'none';
  }
  return c;
}

const TITLES = { intro: '登場效果一覽', outro: '退場效果一覽', hold: '停留中效果一覽', char: '每個字的出現方式', flow: '長文顯示流程一覽' };

let session = 0;

export async function openGallery(kind, app) {
  const dlg = document.getElementById('gallery');
  const box = document.getElementById('galleryTiles');
  document.getElementById('galleryTitle').textContent = TITLES[kind] || '效果一覽';
  const my = ++session;
  const base = app.cfg();
  const current = { intro: base.intro.fx, outro: base.outro.fx, hold: base.hold.fx, char: base.flow.charFx, flow: base.flow.kind }[kind];
  const pick = { intro: app.pickIntro, outro: app.pickOutro, hold: app.pickHold, char: app.pickChar, flow: app.pickFlow }[kind];
  const ratio = TILE_W / base.canvasW;
  const tiles = [];
  box.textContent = '';
  for (const [id, name, tag] of itemsFor(kind, base)) {
    const cv = h('canvas', { width: Math.round(base.canvasW * ratio), height: Math.round(base.canvasH * ratio) });
    const btn = h('button', { type: 'button', class: `tile${id === current ? ' on' : ''}`, 'data-id': id }, cv, h('span', {}, name), tag ? h('small', {}, tag) : null);
    btn.addEventListener('click', () => { pick(id); dlg.close(); });
    box.append(btn);
    tiles.push({ id, cv, x: cv.getContext('2d'), scene: null });
  }
  if (!dlg.open) dlg.showModal();

  const t0 = performance.now();
  const loop = now => {
    if (my !== session || !dlg.open) return;
    for (const t of tiles) {
      if (!t.scene) continue;
      const D = t.scene.duration + 0.35;
      const tt = ((now - t0) / 1000) % D;
      t.scene.draw(t.x, Math.min(tt, t.scene.duration));
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  /* 一個一個建，讓畫面保持流暢 */
  for (const t of tiles) {
    if (my !== session || !dlg.open) return;
    try {
      t.scene = await buildScene(miniCfg(variant(kind, t.id, base), ratio), { waitFonts: true, fontTimeout: 4000 });
    } catch (e) { console.warn(e); }
    await new Promise(r => setTimeout(r, 0));
  }
}

document.getElementById('gallery')?.addEventListener('close', () => { session++; });
