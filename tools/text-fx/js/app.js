/* 文字演出產生器：主程式（設定保存、預覽播放、匯出、快捷鍵）
 * TRPG Toolkit 原創工具，MIT 授權。 */
import { deepClone, deepMerge, getPath, setPath, clamp } from './core.js';
import { buildScene } from './scene.js';
import { exportApng, exportStill, exportSequence, frameCount, MAX_FRAMES } from './exporter.js';
import { baseSettings, settingsFromTemplate, templateById, TEMPLATES, MODES } from './library.js';
import { INTRO, OUTRO, HOLD } from './motion.js';
import { DECO_CHOICES, BACKDROP_CHOICES } from './ornament.js';
import { restoreUserFonts, addUserFont, removeUserFont, fontInfo, nearestWeight, DEFAULT_FONT, userFontList } from './fonts.js';
import { buildPanels } from './panels.js';
import { openGallery } from './gallery.js';

const STORE_KEY = 'trpg-toolkit:text-fx:v1';
const $ = sel => document.querySelector(sel);

export const FLOW_NAMES = {
  seq: '逐字打出', big: '中央逐字', stack: '中央展開', line: '逐行', scan: '流動掃過', all: '整段浮現', scroll: '向上捲動'
};

/* ---------- 狀態 ---------- */
const state = {
  mode: 'title',
  modes: {},
  memo: { title: {}, long: {}, caption: null },
  names: { title: '', long: '', caption: '' },
  view: { bg: 'checker', color: '#3a4a5c', loop: true }
};

function normalizeSettings(mode, s) {
  const out = deepMerge(baseSettings(mode), s || {});
  out.mode = mode;
  if (!out.font || !out.font.src) out.font = { ...DEFAULT_FONT };
  out.weight = nearestWeight(fontInfo(out.font).weights, out.weight);
  out.canvasW = clamp(Math.round(out.canvasW) || 1280, 16, 2048);
  out.canvasH = clamp(Math.round(out.canvasH) || 720, 16, 2048);
  /* 舊版或壞掉的存檔：不認得的效果名稱改回預設 */
  if (!INTRO[out.intro.fx]) out.intro.fx = 'fade';
  if (!OUTRO[out.outro.fx]) out.outro.fx = 'fadeOut';
  if (!HOLD[out.hold.fx]) out.hold.fx = 'none';
  if (!INTRO[out.flow.charFx]) out.flow.charFx = 'fade';
  if (!FLOW_NAMES[out.flow.kind]) out.flow.kind = 'seq';
  if (!DECO_CHOICES.some(d => d[0] === out.deco.kind)) out.deco.kind = 'none';
  if (!BACKDROP_CHOICES.some(d => d[0] === out.bg.kind)) out.bg.kind = 'none';
  if (![12, 15, 20, 24, 30, 60].includes(out.fps)) out.fps = 24;
  return out;
}

function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { saved = null; }
  if (saved && typeof saved === 'object') {
    if (MODES.some(m => m[0] === saved.mode)) state.mode = saved.mode;
    if (saved.memo) {
      state.memo.title = saved.memo.title || {};
      state.memo.long = saved.memo.long || {};
      state.memo.caption = saved.memo.caption || null;
    }
    if (saved.names) Object.assign(state.names, saved.names);
    if (saved.view) Object.assign(state.view, saved.view);
    for (const [m] of MODES) {
      const e = saved.modes && saved.modes[m];
      if (e && e.s) state.modes[m] = { tpl: templateById(m, e.tpl).id, s: normalizeSettings(m, e.s) };
    }
  }
  for (const [m] of MODES) if (!state.modes[m]) applyTemplate(m, TEMPLATES[m][0].id, { quiet: true });
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1, mode: state.mode, modes: state.modes, memo: state.memo, names: state.names,
        view: { bg: state.view.bg === 'image' ? 'checker' : state.view.bg, color: state.view.color, loop: state.view.loop }
      }));
    } catch { /* 儲存空間不可用 */ }
  }, 300);
}

const cfg = () => state.modes[state.mode].s;

/* 套用範本：畫面尺寸與退場開關保留使用者的設定，其他回到「基礎預設＋範本差異」 */
function applyTemplate(mode, id, { quiet = false, ignoreMemo = false } = {}) {
  const tpl = templateById(mode, id);
  const prev = state.modes[mode] && state.modes[mode].s;
  const s = normalizeSettings(mode, settingsFromTemplate(mode, tpl));
  if (prev) { s.canvasW = prev.canvasW; s.canvasH = prev.canvasH; s.outroOn = prev.outroOn; }
  if (!ignoreMemo) {
    if (mode === 'caption') {
      if (state.memo.caption) { s.text = state.memo.caption.text; s.sub = state.memo.caption.sub; }
    } else {
      const m = state.memo[mode][tpl.id];
      if (m) { s.text = m.text; if (mode !== 'long') s.sub = m.sub || ''; }
    }
  }
  state.modes[mode] = { tpl: tpl.id, s };
  if (!quiet) { save(); afterBulkChange(true); }
}

function rememberText() {
  const s = cfg();
  if (state.mode === 'caption') state.memo.caption = { text: s.text, sub: s.sub };
  else state.memo[state.mode][state.modes[state.mode].tpl] = state.mode === 'long' ? { text: s.text } : { text: s.text, sub: s.sub };
}

/* ---------- 預覽 ---------- */
const view = $('#view');
const vctx = view.getContext('2d');
let scene = null;
let curT = 0;
let playing = true;
let lastNow = 0;
let dirty = true;
let buildSeq = 0;
let buildTimer = 0;

function requestBuild(delay = 60, opts = {}) {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(() => rebuild(opts), delay);
}

async function rebuild({ replay = false, afterFonts = false } = {}) {
  const seq = ++buildSeq;
  const conf = deepClone(cfg());
  let sc;
  try {
    sc = await buildScene(conf, { waitFonts: false });
  } catch (e) {
    console.warn(e);
    return;
  }
  if (seq !== buildSeq) return;
  setScene(sc, replay);
  $('#loading').hidden = !sc.fontsPromise || afterFonts;
  if (sc.fontsPromise && !afterFonts) {
    sc.fontsPromise.then(() => { if (seq === buildSeq) rebuild({ afterFonts: true }); });
  }
}

function setScene(sc, replay) {
  const wasBlank = scene ? scene.isBlankAt(curT) : true;
  scene = sc;
  if (view.width !== sc.W || view.height !== sc.H) { view.width = sc.W; view.height = sc.H; }
  if (replay) { curT = 0; playing = true; }
  else {
    curT = Math.min(curT, sc.duration);
    /* 暫停中改設定時，畫面是空的就跳到完成狀態 */
    if (!playing && (sc.isBlankAt(curT) || wasBlank)) curT = sc.repTime;
  }
  dirty = true;
  updatePlayBtn();
  drawTimeline();
  updateHints();
  updateMeta();
  panels && panels.refreshDerived();
}

function tickLoop(now) {
  const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
  lastNow = now;
  if (scene && playing) {
    curT += dt;
    if (curT >= scene.duration) {
      if (state.view.loop) curT = curT % scene.duration;
      else { curT = scene.duration; playing = false; updatePlayBtn(); }
    }
    dirty = true;
  }
  if (scene && dirty) {
    scene.draw(vctx, curT);
    dirty = false;
    updateClock();
  }
  requestAnimationFrame(tickLoop);
}

function updatePlayBtn() {
  const b = $('#playBtn');
  b.classList.toggle('playing', playing);
  b.setAttribute('aria-label', playing ? '暫停（空白鍵）' : '播放（空白鍵）');
}
function togglePlay() {
  if (!scene) return;
  if (!playing && curT >= scene.duration - 1e-6) curT = 0;
  playing = !playing;
  updatePlayBtn();
}
function replay() { curT = 0; playing = true; dirty = true; updatePlayBtn(); }
function seek(t) { if (!scene) return; curT = clamp(t, 0, scene.duration); playing = false; dirty = true; updatePlayBtn(); }

const PHASE_NAMES = { intro: '登場', hold: '停留', outro: '退場' };
function updateClock() {
  if (!scene) return;
  $('#clock').textContent = `${curT.toFixed(2)} / ${scene.duration.toFixed(2)} 秒`;
  const ph = scene.phaseAt(curT);
  let label = '';
  if (ph) label = (scene.pages.length > 1 ? `第 ${ph.page + 1} 頁・` : '') + (scene.flowKind === 'scroll' ? '捲動' : PHASE_NAMES[ph.kind]);
  else if (curT < scene.preEnd) label = '開始前空白';
  else if (scene.pageAt(curT)) label = scene.outroOn ? '' : '完成狀態';
  else label = curT >= scene.lastEnd ? '結束後空白' : '換頁空白';
  $('#phaseLabel').textContent = label;
  const pct = scene.duration > 0 ? curT / scene.duration : 0;
  $('#tlHead').style.left = `calc(${(pct * 100).toFixed(3)}% - 1px)`;
  const sc = $('#scrub');
  if (document.activeElement !== sc) sc.value = Math.round(pct * 1000);
}

function drawTimeline() {
  const box = $('#tlPhases');
  box.textContent = '';
  if (!scene) return;
  const D = scene.duration;
  for (const ph of scene.phases) {
    const a = Math.max(0, ph.a), b = Math.min(D, ph.b === Infinity ? D : ph.b);
    if (b <= a) continue;
    const el = document.createElement('span');
    el.className = ph.kind;
    el.style.left = `${(a / D) * 100}%`;
    el.style.width = `${((b - a) / D) * 100}%`;
    el.title = `${PHASE_NAMES[ph.kind]} ${a.toFixed(2)}～${b.toFixed(2)} 秒`;
    box.append(el);
  }
  const rep = document.createElement('span');
  rep.className = 'rep';
  rep.style.left = `${(scene.repTime / D) * 100}%`;
  rep.title = `代表畫面（完成狀態）${scene.repTime.toFixed(2)} 秒`;
  box.append(rep);
}

function updateMeta() {
  if (!scene) return;
  const s = cfg();
  const n = frameCount(scene.duration, s.fps);
  const pages = s.mode === 'long' && scene.pages.length > 1 ? `・${scene.pages.length} 頁` : '';
  $('#metaLine').textContent = `${scene.W}×${scene.H}・${s.fps} fps・${scene.duration.toFixed(2)} 秒・${n} 格${pages}`;
  $('#topMode').innerHTML = '';
  const tpl = templateById(state.mode, state.modes[state.mode].tpl);
  const b = document.createElement('b');
  b.textContent = MODES.find(m => m[0] === state.mode)[1];
  $('#topMode').append(b, ` ／ ${tpl.name}`);
}

function hint(kind, text, action) {
  const el = document.createElement('div');
  el.className = `hint ${kind}`;
  el.append(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'small';
    b.textContent = action[0];
    b.addEventListener('click', action[1]);
    el.append(b);
  }
  return el;
}

function updateHints() {
  const box = $('#hints');
  box.textContent = '';
  if (!scene) return;
  const s = cfg();
  if (scene.empty) box.append(hint('bad', '還沒有文字：請在「文字」分頁輸入內容。'));
  if (scene.shrunk) box.append(hint('', `文字放不下，已自動縮小：${Math.round(scene.shrunk.from)} px → ${Math.round(scene.shrunk.to)} px`));
  if (s.hold.fx !== 'none' && !(s.mode === 'long' && s.flow.kind === 'scroll')) box.append(hint('warn', '已選停留效果：每一格畫面都不同，檔案會變大。'));
  if (s.hold.fx === 'breathe' && !s.glow.on) {
    box.append(hint('warn', '「呼吸發光」需要先開啟光暈。', ['開啟光暈', () => app.set('glow.on', true, { final: true })]));
  }
  if (!s.outroOn && s.loop === 'infinite') {
    box.append(hint('warn', '退場關閉又設成無限循環：播完會直接從頭開始。', ['改成播放一次', () => app.set('loop', 'once', { final: true })]));
  }
  const n = frameCount(scene.duration, s.fps);
  if (n > MAX_FRAMES) box.append(hint('bad', `影格數 ${n} 超過上限 ${MAX_FRAMES}：請縮短時長或降低 fps。`));
}

/* ---------- 設定變更 ---------- */
let panels = null;

function afterBulkChange(replayNow) {
  panels.refresh();
  rebuild({ replay: replayNow });
  updateMeta();
}

const app = {
  state,
  cfg,
  mode: () => state.mode,
  tplId: () => state.modes[state.mode].tpl,
  get: path => getPath(cfg(), path),
  set(path, value, meta = {}) {
    setPath(cfg(), path, value);
    if (path === 'text' || path === 'sub') rememberText();
    if (path === 'loop' || path === 'outroOn') syncTransport();
    save();
    requestBuild(meta.typing ? 140 : meta.final ? 20 : 50);
    if (meta.final !== false || meta.typing) panels.refresh();
    if (path === 'fps' || path === 'loop') { updateHints(); updateMeta(); }
  },
  /* 一次改好幾個值（套用文字風格、選效果時帶入預設值） */
  patch(fn) {
    fn(cfg());
    save();
    panels.refresh();
    requestBuild(20);
    syncTransport();
  },
  setMode(m) {
    if (m === state.mode || !state.modes[m]) return;
    state.mode = m;
    save();
    syncTransport();
    afterBulkChange(true);
  },
  applyTemplate(id) { applyTemplate(state.mode, id); syncTransport(); },
  resetTemplate() {
    const id = state.modes[state.mode].tpl;
    if (state.mode === 'caption') state.memo.caption = null; else delete state.memo[state.mode][id];
    applyTemplate(state.mode, id, { ignoreMemo: true });
    syncTransport();
  },
  scene: () => scene,
  replay,
  openGallery: kind => openGallery(kind, app),
  /* 檔名 */
  manualName: () => state.names[state.mode] || '',
  setManualName(v) { state.names[state.mode] = v.trim(); save(); panels.refresh(); },
  autoName: () => autoFileName(cfg()),
  /* 字型 */
  userFonts: userFontList,
  async addFont(file) {
    const f = await addUserFont(file);
    app.patch(c => { c.font = { src: 'user', id: f.id }; c.weight = 400; });
    return f;
  },
  async removeFont(id) {
    await removeUserFont(id);
    for (const [m] of MODES) {
      const c = state.modes[m].s;
      if (c.font.src === 'user' && c.font.id === id) c.font = { ...DEFAULT_FONT };
      if (c.subFont && c.subFont.src === 'user' && c.subFont.id === id) c.subFont = null;
    }
    save();
    panels.refresh();
    requestBuild(10);
  },
  exportApng: () => runExport('apng'),
  exportPng: () => runExport('png'),
  exportZip: () => runExport('zip'),
  busy: () => busy
};

/* ---------- 檔名 ---------- */
function textHead(text) {
  const line = String(text || '').split(/\r?\n/).map(l => l.trim()).find(Boolean) || '';
  const chars = Array.from(line);
  const LIMIT = 14;
  if (chars.length <= LIMIT) return line.replace(/[—―…‥・\-]+$/u, '');
  let cut = -1;
  for (let i = Math.min(chars.length, LIMIT + 1) - 1; i >= 3; i--) {
    if (/[，。、！？!?,.；;：:—―…]/.test(chars[i])) { cut = i; break; }
  }
  let head;
  if (cut > 0) head = chars.slice(0, cut).join('');
  else {
    head = chars.slice(0, LIMIT).join('');
    if (/[A-Za-z]$/.test(head) && /[A-Za-z]/.test(chars[LIMIT] || '')) {
      const sp = head.lastIndexOf(' ');
      if (sp > 3) head = head.slice(0, sp);
    }
  }
  return head.replace(/[—―…‥・\-\s]+$/u, '');
}

function autoFileName(c) {
  const fx = c.mode === 'long' ? FLOW_NAMES[c.flow.kind] : (INTRO[c.intro.fx] || INTRO.fade).name;
  const parts = [textHead(c.text) || textHead(c.sub) || '文字演出', fx];
  if (!c.outroOn) parts.push('無退場');
  if (c.loop === 'infinite') parts.push('循環');
  return sanitizeName(parts.join('_'));
}

function sanitizeName(s) {
  const out = Array.from(String(s).replace(/\s+/g, '_').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, ''));
  return out.slice(0, 48).join('') || '文字演出';
}

function baseName() {
  const manual = state.names[state.mode];
  return manual ? sanitizeName(manual.replace(/\.png$/i, '')) : autoFileName(cfg());
}

/* ---------- 匯出 ---------- */
let busy = false;
let abortCtl = null;
let lastUrl = null;

function showProgress(on) {
  $('#progress').hidden = !on;
  $('#qExport').disabled = on;
  panels && panels.setBusy(on);
}
function setProgress(p, label) {
  $('#progressBar').style.width = `${Math.round(clamp(p, 0, 1) * 100)}%`;
  $('#progressText').textContent = `${label}… ${Math.round(clamp(p, 0, 1) * 100)}%`;
}
const fmtSize = n => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function runExport(kind) {
  if (busy) return;
  const conf = deepClone(cfg());
  const hasText = conf.text.trim() || (conf.mode !== 'long' && conf.sub.trim());
  if (!hasText) { flash('請先輸入文字，再匯出。'); return; }
  busy = true;
  abortCtl = new AbortController();
  showProgress(true);
  setProgress(0, '載入字型');
  const pausedAt = playing ? null : curT;
  try {
    const sc = await buildScene(conf, { waitFonts: true });
    const plays = conf.loop === 'infinite' ? 0 : conf.loop === 'count' ? clamp(Math.round(conf.loopCount), 1, 999) : 1;
    const name = baseName();
    let res, blob, fileName, info;
    if (kind === 'apng') {
      res = await exportApng(sc, { fps: conf.fps, plays, colors: conf.colors, still: conf.stillFallback, autoCrop: conf.autoCrop }, {
        signal: abortCtl.signal, onProgress: setProgress
      });
      blob = new Blob([res.bytes], { type: 'image/png' });
      fileName = `${name}.png`;
      const colorText = res.colors.mode === 256
        ? `256 色${res.colors.lossless ? '（無損：實際只用了 ' + res.colors.count + ' 色）' : '（減色）'}`
        : '全彩（RGBA）';
      info = [
        ['檔案大小', fmtSize(res.bytes.length)],
        ['尺寸', `${res.width}×${res.height}${conf.autoCrop ? '（已裁掉透明邊）' : ''}`],
        ['影格', `實際儲存 ${res.framesStored} 張／共 ${res.framesTotal} 格（${res.fps} fps）`],
        ['長度', `${res.duration.toFixed(2)} 秒`],
        ['色數', colorText],
        ['循環', plays === 0 ? '無限循環' : plays === 1 ? '播放一次（停在最後一格）' : `${plays} 次`],
        ['預設圖', conf.stillFallback ? '完成狀態（不支援 APNG 時顯示）' : '第一格'],
        ['匯出時間', `${(res.ms / 1000).toFixed(2)} 秒`]
      ];
    } else if (kind === 'png') {
      /* 暫停中存目前那一格；那一格是空的或正在播放，就存完成狀態 */
      let t = sc.repTime;
      if (pausedAt != null && !sc.isBlankAt(pausedAt)) t = pausedAt;
      res = await exportStill(sc, t, { autoCrop: conf.autoCrop });
      blob = new Blob([res.bytes], { type: 'image/png' });
      fileName = `${name}_靜止.png`;
      info = [['檔案大小', fmtSize(res.bytes.length)], ['尺寸', `${res.width}×${res.height}`], ['時間點', `${t.toFixed(2)} 秒${t === sc.repTime ? '（完成狀態）' : ''}`]];
    } else {
      res = await exportSequence(sc, { fps: conf.fps, autoCrop: conf.autoCrop, baseName: name }, { signal: abortCtl.signal, onProgress: setProgress });
      blob = new Blob([res.bytes], { type: 'application/zip' });
      fileName = `${name}_連番.zip`;
      info = [['檔案大小', fmtSize(res.bytes.length)], ['張數', `${res.count} 張（${conf.fps} fps）`], ['尺寸', `${res.width}×${res.height}`]];
    }
    showResult(kind, blob, fileName, info);
  } catch (e) {
    if (e && e.name === 'AbortError') flash('已取消匯出。');
    else { console.error(e); flash(`匯出失敗：${e && e.message ? e.message : e}`); }
  } finally {
    busy = false;
    showProgress(false);
  }
}

function showResult(kind, blob, fileName, info) {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const box = $('#result');
  box.hidden = false;
  box.textContent = '';
  const left = document.createElement('div');
  if (kind !== 'zip') {
    const img = document.createElement('img');
    img.className = 'shot';
    img.alt = '匯出結果預覽';
    img.src = lastUrl;
    left.append(img);
  } else {
    left.textContent = '連番 PNG 已打包成 ZIP。';
    left.className = 'note';
  }
  const right = document.createElement('div');
  const dl = document.createElement('dl');
  for (const [k, v] of [['檔名', fileName], ...info]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  right.append(dl);
  const a = document.createElement('a');
  a.href = lastUrl;
  a.download = fileName;
  a.className = 'dl primary-link';
  a.textContent = `下載 ${fileName}`;
  right.append(a);
  if (blob.size > 5 * 1024 * 1024) {
    const p = document.createElement('p');
    p.className = 'warn';
    p.textContent = '檔案超過 5 MB，可能超過 CCFOLIA 等平台的圖片上傳上限。建議改用 256 色、降低 fps、縮小畫面尺寸，或拿掉停留效果。';
    right.append(p);
  }
  box.append(left, right);
  box.dataset.kind = kind;
  box.dataset.size = String(blob.size);
}

let flashTimer = 0;
function flash(text) {
  const box = $('#hints');
  const el = hint('bad', text);
  el.dataset.flash = '1';
  box.prepend(el);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.remove(), 4000);
}

/* ---------- 預覽工具列 ---------- */
function syncTransport() {
  $('#outroToggle').checked = !!cfg().outroOn;
  $('#loopToggle').checked = !!state.view.loop;
  const vb = $('#viewBg');
  vb.value = state.view.bg;
  $('#viewer').dataset.bg = state.view.bg;
  $('#viewColor').hidden = state.view.bg !== 'color';
  $('#viewer').style.setProperty('--view-color', state.view.color);
  $('#viewColor').value = state.view.color;
}

function bindTransport() {
  $('#playBtn').addEventListener('click', togglePlay);
  $('#replayBtn').addEventListener('click', replay);
  $('#outroToggle').addEventListener('change', e => app.set('outroOn', e.target.checked, { final: true }));
  $('#loopToggle').addEventListener('change', e => { state.view.loop = e.target.checked; save(); });
  $('#viewBg').addEventListener('change', e => {
    const v = e.target.value;
    if (v === 'image') { $('#viewImage').click(); return; }
    state.view.bg = v;
    save();
    syncTransport();
  });
  $('#viewColor').addEventListener('input', e => { state.view.color = e.target.value; $('#viewer').style.setProperty('--view-color', e.target.value); save(); });
  $('#viewImage').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) { syncTransport(); return; }
    /* 背景圖只供預覽，不會進輸出 */
    const url = URL.createObjectURL(f);
    $('#viewer').style.setProperty('--view-image', `url("${url}")`);
    state.view.bg = 'image';
    syncTransport();
    e.target.value = '';
  });
  const scrub = $('#scrub');
  scrub.addEventListener('input', () => { if (scene) seek((scrub.value / 1000) * scene.duration); });
  $('#qExport').addEventListener('click', () => app.exportApng());
  $('#cancelBtn').addEventListener('click', () => { if (abortCtl) abortCtl.abort(); });
  $('#keysBtn').addEventListener('click', () => $('#keys').showModal());
}

/* ---------- 快捷鍵（輸入框聚焦時不觸發） ---------- */
function bindKeys() {
  document.addEventListener('keydown', e => {
    const el = document.activeElement;
    const typing = el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range', 'color'].includes(el.type)) || el.isContentEditable);
    if (typing) return;
    if ((e.key === ' ' || e.key === 'Enter') && el && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.type === 'checkbox')) return;
    if (document.querySelector('dialog[open]') && e.key !== 'Escape') {
      if (e.key === '?') e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); app.exportApng(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replay(); }
    else if (e.key === '1' || e.key === '2' || e.key === '3') { e.preventDefault(); app.setMode(MODES[Number(e.key) - 1][0]); }
    else if (e.key === '?') { e.preventDefault(); $('#keys').showModal(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (!scene || el && el.type === 'range') return;
      e.preventDefault();
      const step = 1 / cfg().fps;
      seek(curT + (e.key === 'ArrowRight' ? step : -step));
    }
  });
}

/* ---------- 啟動 ---------- */
async function start() {
  await restoreUserFonts();
  load();
  panels = buildPanels(app);
  bindTransport();
  bindKeys();
  syncTransport();
  panels.refresh();
  await rebuild({ replay: true });
  requestAnimationFrame(tickLoop);
  /* 測試與除錯用：目前的場景與設定 */
  window.__textFx = { app, get scene() { return scene; }, get t() { return curT; }, seek, setPlaying: v => { playing = !!v; updatePlayBtn(); } };
}

start();
