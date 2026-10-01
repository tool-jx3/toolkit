/* 文字演出產生器：設定面板（模式／文字／樣式／裝飾／時間與匯出） */
import { Form, h } from './ui.js';
import { INTRO, OUTRO, HOLD, ORDER_CHOICES } from './motion.js';
import { CURVE_CHOICES, deepClone, deepMerge } from './core.js';
import { DECO_CHOICES, BACKDROP_CHOICES, LINE_DECOS } from './ornament.js';
import { FONT_GROUPS, fontInfo, nearestWeight } from './fonts.js';
import { TEMPLATES, MODES, STYLE_KITS, GRADIENT_KITS } from './library.js';
import { frameCount } from './exporter.js';

const FLOW_CHOICES = [
  ['seq', '逐字打出（打字機）'],
  ['big', '中央逐字（最後整段砸下）'],
  ['stack', '中央展開（先疊後散）'],
  ['line', '逐行'],
  ['scan', '流動掃過（行內依位置延遲）'],
  ['all', '整段浮現'],
  ['scroll', '向上捲動（片尾名單）']
];
const SUB_CHOICES = [
  ['same', '跟主文字相同'], ['fade', '淡入'], ['rise', '上浮淡入'], ['focus', '模糊對焦'],
  ['converge', '字距收攏'], ['slide', '滑入'], ['slideOpp', '反方向滑入（上下合流）'], ['type', '打字']
];
const WEIGHT_NAMES = { 100: '極細', 200: '特細', 300: '細', 400: '標準', 500: '中等', 600: '半粗', 700: '粗', 800: '特粗', 900: '極粗' };
const SIZE_PRESETS = [
  ['1920x1080', '1920×1080（16:9）'], ['1280x720', '1280×720（16:9）'], ['960x540', '960×540（16:9）'],
  ['1280x360', '1280×360（橫長帶狀）'], ['1024x256', '1024×256（橫長帶狀）'],
  ['1080x1080', '1080×1080（正方形）'], ['1080x1920', '1080×1920（直式）'], ['720x1280', '720×1280（直式）'],
  ['custom', '自訂…']
];
const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const ANCHOR_NAMES = { tl: '左上', tc: '上方中央', tr: '右上', ml: '左側中央', mc: '正中央', mr: '右側中央', bl: '左下', bc: '下方中央', br: '右下' };

const fxGroups = (defs, filter = () => true) => {
  const glyph = [], block = [];
  for (const [id, d] of Object.entries(defs)) {
    if (!filter(id, d)) continue;
    (d.unit === 'block' ? block : glyph).push([id, d.name]);
  }
  const out = [];
  if (glyph.length) out.push({ group: '逐字效果', items: glyph });
  if (block.length) out.push({ group: '整塊效果', items: block });
  return out;
};

export function buildPanels(app) {
  const form = new Form({ get: app.get, set: app.set, cfg: app.cfg });
  const pane = name => document.querySelector(`.pane[data-pane="${name}"]`);
  const isLong = c => c.mode === 'long';
  const isShort = c => c.mode !== 'long';
  const isScroll = c => c.mode === 'long' && c.flow.kind === 'scroll';
  const introDef = c => INTRO[c.intro.fx] || INTRO.fade;
  const outroDef = c => OUTRO[c.outro.fx] || OUTRO.fadeOut;
  const charDef = c => INTRO[c.flow.charFx] || INTRO.fade;
  const galleryBtn = kind => h('button', { type: 'button', class: 'small', onclick: () => app.openGallery(kind) }, '效果一覽');

  /* 選效果：帶入預設時長、字間隔，曲線回到自動、強度回到 1，方向不適用時改成第一個 */
  const pickIntro = id => app.patch(c => {
    const d = INTRO[id];
    const keepDir = d.dirs && d.dirs.some(x => x[0] === c.intro.dir);
    c.intro = { ...c.intro, fx: id, dur: d.dur || c.intro.dur, gap: d.gap || 0, curve: 'auto', power: 1, dir: d.dirs ? (keepDir ? c.intro.dir : d.dirs[0][0]) : c.intro.dir };
  });
  const pickOutro = id => app.patch(c => {
    const d = OUTRO[id];
    const keepDir = d.dirs && d.dirs.some(x => x[0] === c.outro.dir);
    c.outro = { ...c.outro, fx: id, dur: d.dur || c.outro.dur, gap: d.gap || 0, curve: 'auto', power: 1, dir: d.dirs ? (keepDir ? c.outro.dir : d.dirs[0][0]) : c.outro.dir };
  });
  const pickChar = id => app.patch(c => {
    const d = INTRO[id];
    c.flow.charFx = id;
    if (d.instant) c.flow.charDur = 0; else if (!(c.flow.charDur > 0)) c.flow.charDur = 0.4;
    c.intro.curve = 'auto'; c.intro.power = 1;
    if (d.dirs && !d.dirs.some(x => x[0] === c.intro.dir)) c.intro.dir = d.dirs[0][0];
  });
  app.pickIntro = pickIntro; app.pickOutro = pickOutro; app.pickChar = pickChar;
  app.pickHold = id => app.set('hold.fx', id, { final: true });
  app.pickFlow = id => app.set('flow.kind', id, { final: true });

  /* ================= 模式 ================= */
  {
    const p = pane('mode');
    const modeBox = h('div', { class: 'mode-seg', role: 'radiogroup', 'aria-label': '模式' });
    const desc = { title: '畫面中央的大字', long: '開場白、預告、旁白', caption: '地點、時間字幕' };
    const modeBtns = MODES.map(([m, name], i) => {
      const b = h('button', { type: 'button', role: 'radio', title: `${name}（${i + 1}）` }, h('b', {}, name), h('small', {}, desc[m]));
      b.addEventListener('click', () => app.setMode(m));
      b.dataset.m = m;
      return b;
    });
    modeBox.append(...modeBtns);
    p.append(form.section('模式', [form.custom(modeBox, () => modeBtns.forEach(b => {
      const on = b.dataset.m === app.mode();
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }))]));

    const tplBox = h('div', { class: 'tpl-wrap' });
    const syncTpl = () => {
      const mode = app.mode();
      const sig = mode;
      if (tplBox._sig !== sig) {
        tplBox._sig = sig;
        tplBox.textContent = '';
        const groups = new Map();
        for (const t of TEMPLATES[mode]) { if (!groups.has(t.group)) groups.set(t.group, []); groups.get(t.group).push(t); }
        for (const [g, list] of groups) {
          const ul = h('div', { class: 'tpl-list' });
          for (const t of list) {
            const b = h('button', { type: 'button', 'data-id': t.id, title: t.text.split('\n')[0] }, t.name);
            b.addEventListener('click', () => app.applyTemplate(t.id));
            ul.append(b);
          }
          tplBox.append(h('div', { class: 'tpl-group' }, h('h4', {}, g), ul));
        }
      }
      for (const b of tplBox.querySelectorAll('button[data-id]')) b.classList.toggle('on', b.dataset.id === app.tplId());
    };
    const resetBtn = h('button', { type: 'button', class: 'small', onclick: () => app.resetTemplate(), title: '把目前模式的所有設定（含文字）恢復成範本原樣' }, '重設為範本預設');
    p.append(form.section('範本', [
      form.note('每個範本是一組完整的設定，只是起點，套用後可以自由修改。切換範本時會保留畫面尺寸與退場開關。'),
      form.custom(tplBox, syncTpl)
    ], { aside: resetBtn }));

    /* 短句模式：登場 */
    p.append(form.section('登場效果', [
      form.select('intro.fx', '效果', () => fxGroups(INTRO), { onPick: pickIntro, extra: galleryBtn('intro') }),
      form.note(c => (introDef(c).unit === 'block' ? '整塊效果：整段文字一起動。' : '逐字效果：每個字依序錯開。時長比字間隔長很多時，看起來會是一道連續的波。')),
      form.select('intro.dir', '方向', c => introDef(c).dirs || [], { show: c => !!introDef(c).dirs }),
      form.range('intro.dur', '時長', { min: 0.05, max: 4, step: 0.01, unit: '秒', digits: 2, show: c => !introDef(c).instant }),
      form.range('intro.gap', '字間隔', { min: 0, max: 0.6, step: 0.005, unit: '秒', digits: 3, show: c => introDef(c).unit === 'glyph' }),
      form.select('intro.order', '順序', ORDER_CHOICES, { show: c => introDef(c).unit === 'glyph' }),
      form.select('intro.curve', '曲線', CURVE_CHOICES, { show: c => !introDef(c).instant && introDef(c).curve !== null }),
      form.range('intro.power', '強度', { min: 0.2, max: 2.5, step: 0.05, unit: '倍', digits: 2, show: c => introDef(c).power !== false && !introDef(c).instant })
    ], { show: isShort }));

    p.append(form.section('副文字登場', [
      form.select('subIntro', '方式', SUB_CHOICES),
      form.range('subOffset', '時差', { min: -2, max: 2, step: 0.05, unit: '秒', digits: 2, hint: '主文字登場結束後幾秒開始（負值＝提早）' }),
      form.note(c => (c.subIntro === 'same' && introDef(c).unit === 'block' ? '主文字是整塊效果：副文字跟主文字黏在一起動。' : '副文字在「主文字登場結束＋時差」開始，不會早於文字開始。'))
    ], { show: c => isShort(c) && !!c.sub.trim() }));

    /* 長文：顯示流程 */
    p.append(form.section('顯示流程', [
      form.select('flow.kind', '流程', FLOW_CHOICES, { extra: galleryBtn('flow') }),
      form.range('flow.cps', '每秒字數', { min: 2, max: 40, step: 1, unit: '字', digits: 0, show: c => ['seq', 'big'].includes(c.flow.kind) }),
      form.range('flow.punctPause', '句讀停頓', { min: 0, max: 1.5, step: 0.05, unit: '秒', digits: 2, show: c => c.flow.kind === 'seq', hint: '句號、問號、刪節號之後；逗號、頓號停一半' }),
      form.range('flow.linePause', '行尾停頓', { min: 0, max: 2, step: 0.05, unit: '秒', digits: 2, show: c => c.flow.kind === 'seq' }),
      form.check('flow.cursor', '顯示打字游標', { show: c => c.flow.kind === 'seq' }),
      form.color('flow.cursorColor', '游標顏色', { allowEmpty: true, show: c => c.flow.kind === 'seq' && c.flow.cursor, extra: h('button', { type: 'button', class: 'small', onclick: () => app.set('flow.cursorColor', '', { final: true }) }, '同文字') }),
      form.range('flow.bigRatio', '大字尺寸', { min: 0.15, max: 0.9, step: 0.01, scale: 100, unit: '%', digits: 0, show: c => c.flow.kind === 'big', hint: '畫面短邊的百分比' }),
      form.range('flow.bigPause', '整段出現前停頓', { min: 0, max: 2, step: 0.05, unit: '秒', digits: 2, show: c => c.flow.kind === 'big' }),
      form.range('flow.impact', '衝擊強度', { min: 0, max: 2, step: 0.05, unit: '倍', digits: 2, show: c => c.flow.kind === 'big' }),
      form.range('flow.stackHold', '疊合停留', { min: 0, max: 3, step: 0.05, unit: '秒', digits: 2, show: c => c.flow.kind === 'stack' }),
      form.range('flow.spreadTime', '展開時間', { min: 0.1, max: 3, step: 0.05, unit: '秒', digits: 2, show: c => c.flow.kind === 'stack' }),
      form.range('flow.lineGap', '行間隔', { min: 0.1, max: 4, step: 0.05, unit: '秒', digits: 2, show: c => ['line', 'scan'].includes(c.flow.kind) }),
      form.range('flow.scanTime', '一行掃完', { min: 0.2, max: 5, step: 0.05, unit: '秒', digits: 2, show: c => c.flow.kind === 'scan' }),
      form.range('flow.speed', '捲動速度', { min: 10, max: 400, step: 1, unit: 'px/秒', digits: 0, show: isScroll }),
      form.check('flow.edgeFade', '畫面邊緣淡出', { show: isScroll }),
      form.note('捲動模式沒有停留與退場，整段從畫面外捲進來再捲出去。', { show: isScroll })
    ], { show: isLong }));

    p.append(form.section('每個字怎麼出現', [
      form.select('flow.charFx', '效果', () => fxGroups(INTRO, (id, d) => d.unit === 'glyph' && !d.shortOnly), { onPick: pickChar, extra: galleryBtn('char') }),
      form.range('flow.charDur', '單字出現時間', { min: 0, max: 2, step: 0.01, unit: '秒', digits: 2, show: c => !charDef(c).instant }),
      form.select('intro.dir', '方向', c => charDef(c).dirs || [], { show: c => !!charDef(c).dirs }),
      form.select('intro.curve', '曲線', CURVE_CHOICES, { show: c => !charDef(c).instant }),
      form.range('intro.power', '強度', { min: 0.2, max: 2.5, step: 0.05, unit: '倍', digits: 2, show: c => charDef(c).power !== false && !charDef(c).instant })
    ], { show: c => isLong(c) && !['big', 'stack', 'scroll'].includes(c.flow.kind) }));

    p.append(form.section('換頁', [
      form.check('paging', '空白行＝換頁'),
      form.range('flow.pageGap', '頁與頁之間', { min: 0, max: 3, step: 0.05, unit: '秒', digits: 2, show: c => c.paging }),
      form.note('每一頁各自完成登場、停留、退場，再接下一頁。')
    ], { show: c => isLong(c) && !isScroll(c) }));

    /* 停留 */
    p.append(form.section('停留中效果', [
      form.select('hold.fx', '效果', () => Object.entries(HOLD).map(([id, d]) => [id, d.name]), { extra: galleryBtn('hold') }),
      form.note(c => (HOLD[c.hold.fx] && HOLD[c.hold.fx].note) || '登場完成後保持不動。'),
      form.range('hold.power', '強度', { min: 0.2, max: 3, step: 0.05, unit: '倍', digits: 2, show: c => c.hold.fx !== 'none' }),
      form.range('holdTime', '停留時間', { min: 0, max: 10, step: 0.1, unit: '秒', digits: 1, show: c => !isScroll(c) })
    ]));

    /* 退場 */
    p.append(form.section('退場效果', [
      form.check('outroOn', '要有退場（關掉時停在完成狀態，素材出現後一直留著）'),
      form.select('outro.fx', '效果', () => fxGroups(OUTRO), { onPick: pickOutro, extra: galleryBtn('outro'), show: c => c.outroOn }),
      form.select('outro.dir', '方向', c => outroDef(c).dirs || [], { show: c => c.outroOn && !!outroDef(c).dirs }),
      form.range('outro.dur', '時長', { min: 0.05, max: 4, step: 0.01, unit: '秒', digits: 2, show: c => c.outroOn && !outroDef(c).instant }),
      form.range('outro.gap', '字間隔', { min: 0, max: 0.6, step: 0.005, unit: '秒', digits: 3, show: c => c.outroOn && outroDef(c).unit === 'glyph' }),
      form.select('outro.order', '順序', ORDER_CHOICES, { show: c => c.outroOn && outroDef(c).unit === 'glyph' && !outroDef(c).forceOrder }),
      form.note('退格刪除一律從最後一個字往前刪。', { show: c => c.outroOn && !!outroDef(c).forceOrder }),
      form.select('outro.curve', '曲線', CURVE_CHOICES, { show: c => c.outroOn && !outroDef(c).instant }),
      form.range('outro.power', '強度', { min: 0.2, max: 2.5, step: 0.05, unit: '倍', digits: 2, show: c => c.outroOn && outroDef(c).power !== false && !outroDef(c).instant })
    ], { show: c => !isScroll(c) }));

    const usesGlitch = c => c.hold.fx === 'glitchPulse' || (isShort(c) && c.intro.fx === 'glitch') || (c.outroOn && c.outro.fx === 'glitchOut');
    p.append(form.section('雜訊顏色', [
      form.color('glitchA', '往左的分色'),
      form.color('glitchB', '往右的分色')
    ], { show: usesGlitch }));
  }

  /* ================= 文字 ================= */
  {
    const p = pane('text');
    const mainText = form.text('text', '主文字', { multiline: true, rows: 3, placeholder: '輸入要做成動畫的文字' });
    const syncRows = () => { mainText.input.rows = app.mode() === 'long' ? 10 : 3; };
    p.append(form.section('文字', [
      form.custom(mainText, syncRows),
      form.note(c => (c.mode === 'long' ? (c.paging && c.flow.kind !== 'scroll' ? '空一行＝換頁（翻頁時前一頁會先退場）。修改過的文字會依範本分別記住。' : '整段當作一頁。修改過的文字會依範本分別記住。') : c.mode === 'caption' ? '字幕模式的文字所有範本共用。' : '修改過的文字會依範本分別記住。')),
      form.text('sub', '副文字（可留空）', { placeholder: '例如英文標語、時間', show: isShort })
    ]));

    p.append(form.section('書寫方向', [
      form.seg('vertical', '方向', [['false', '橫書'], ['true', '直書']]),
      form.seg('latinUpright', '直書英數', [['false', '旋轉 90°'], ['true', '直立']], { show: c => c.vertical }),
      form.seg('punctCenter', '直書標點', [['false', '靠右上'], ['true', '置中']], { show: c => c.vertical }),
      form.note('直書時，，。、 移到字格右上（或置中）；「」（）…— 等符號轉 90°；！？ 保持直立。', { show: c => c.vertical })
    ]));

    p.append(form.section('排列', [
      form.seg('align', '對齊', [['start', '靠左'], ['center', '置中'], ['end', '靠右']], {
        labels: c => (c.vertical ? ['靠上', '置中', '靠下'] : ['靠左', '置中', '靠右'])
      }),
      form.seg('subPos', '副文字位置', [['before', '上方'], ['after', '下方']], {
        show: c => isShort(c) && !!c.sub.trim(),
        labels: c => (c.vertical ? ['右側（前）', '左側（後）'] : ['上方', '下方'])
      })
    ]));

    const grid = h('div', { class: 'anchor-grid', role: 'radiogroup', 'aria-label': '位置' });
    const abtns = ANCHORS.map(a => {
      const b = h('button', { type: 'button', role: 'radio', title: ANCHOR_NAMES[a], 'aria-label': ANCHOR_NAMES[a] });
      b.addEventListener('click', () => app.set('anchor', a, { final: true }));
      b.dataset.a = a;
      return b;
    });
    grid.append(...abtns);
    const anchorName = h('span', { class: 'note' });
    p.append(form.section('位置', [
      form.custom(h('div', { class: 'field' }, h('span', { class: 'lbl' }, '錨點'), h('div', { class: 'ctl' }, grid, anchorName)), c => {
        abtns.forEach(b => { const on = b.dataset.a === c.anchor; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        anchorName.textContent = ANCHOR_NAMES[c.anchor] || '';
      }),
      form.range('marginX', '左右邊距', { min: 0, max: 400, step: 1, unit: 'px', digits: 0 }),
      form.range('marginY', '上下邊距', { min: 0, max: 400, step: 1, unit: 'px', digits: 0 }),
      form.range('offsetX', '水平微調', { min: -800, max: 800, step: 1, unit: 'px', digits: 0 }),
      form.range('offsetY', '垂直微調', { min: -800, max: 800, step: 1, unit: 'px', digits: 0 })
    ]));

    p.append(form.section('換行與縮小', [
      form.range('wrapChars', '每行最多', { min: 0, max: 60, step: 1, unit: '字', digits: 0, hint: '0＝不依字數換行。半形英數約算半個字。' }),
      form.check('wrapWidth', '超出畫面寬度時自動換行', { show: c => !(c.wrapChars > 0) }),
      form.note('換行時套用禁則：，。、；：！？」』）等不放在行首，「『（ 等不放在行尾；英文單字不從中間斷開。'),
      form.check('autoShrink', '放不下時自動縮小（外框、光暈、陰影、裝飾都算進去）'),
      form.range('minSize', '最小字級', { min: 6, max: 120, step: 1, unit: 'px', digits: 0, show: c => c.autoShrink })
    ]));
  }

  /* ================= 樣式 ================= */
  {
    const p = pane('style');
    const kits = h('div', { class: 'swatch-row' });
    for (const k of STYLE_KITS) {
      const fill = k.patch.fill.mode === 'gradient' ? `linear-gradient(${k.patch.fill.colors.join(',')})` : k.patch.fill.color;
      const sw = h('i', {});
      sw.style.background = fill;
      sw.style.outline = `2px solid ${k.patch.stroke.on ? k.patch.stroke.color : 'transparent'}`;
      if (k.patch.glow.on) sw.style.boxShadow = `0 0 8px ${k.patch.glow.color}`;
      const b = h('button', { type: 'button', class: 'swatch', title: `套用「${k.name}」：塗色、外框、陰影、光暈` }, sw, k.name);
      b.addEventListener('click', () => app.patch(c => deepMerge(c, deepClone(k.patch))));
      kits.append(b);
    }
    p.append(form.section('文字風格（一鍵套用）', [form.custom(kits)]));

    /* 字型 */
    const fontOptions = () => {
      const out = FONT_GROUPS.map(g => ({ group: g.label, items: g.items.map(f => [`g:${f.id}`, f.label]) }));
      const mine = app.userFonts();
      if (mine.length) out.push({ group: '我的字型', items: mine.map(f => [`u:${f.id}`, f.name]) });
      out.push({ group: '其他', items: [['local', '電腦裡的字型（輸入名稱）']] });
      return out;
    };
    const fontVal = f => (!f ? '' : f.src === 'google' ? `g:${f.id}` : f.src === 'user' ? `u:${f.id}` : 'local');
    const toRef = (v, prev) => (v.startsWith('g:') ? { src: 'google', id: v.slice(2) } : v.startsWith('u:') ? { src: 'user', id: v.slice(2) } : { src: 'local', id: prev && prev.src === 'local' ? prev.id : '' });
    const upload = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', hidden: true });
    const upBtn = h('button', { type: 'button', class: 'small', onclick: () => upload.click() }, '上傳字型…');
    const fontMsg = h('p', { class: 'note' });
    upload.addEventListener('change', async () => {
      const f = upload.files && upload.files[0];
      upload.value = '';
      if (!f) return;
      fontMsg.textContent = '讀取中…';
      try { const info = await app.addFont(f); fontMsg.textContent = `已加入「${info.name}」，只存在這個瀏覽器裡。`; }
      catch (e) { fontMsg.textContent = `無法使用這個字型檔：${e.message || e}`; }
    });
    const myList = h('div', { class: 'font-list' });
    const syncMine = () => {
      const mine = app.userFonts();
      myList.textContent = '';
      for (const f of mine) {
        const del = h('button', { type: 'button', class: 'small', onclick: async () => { await app.removeFont(f.id); syncMine(); } }, '刪除');
        myList.append(h('div', { class: 'font-item' }, h('span', { title: f.name }, f.name), del));
      }
    };
    const localName = form.text('font.id', '電腦字型名稱', { placeholder: '例如：微軟正黑體、PingFang TC', show: c => c.font.src === 'local' });
    p.append(form.section('字型', [
      form.select('font', '字型', fontOptions, {
        fromValue: fontVal,
        onPick: v => app.patch(c => { c.font = toRef(v, c.font); c.weight = nearestWeight(fontInfo(c.font).weights, c.weight); })
      }),
      localName,
      form.select('weight', '粗細', c => fontInfo(c.font).weights.map(w => [String(w), `${w}・${WEIGHT_NAMES[w] || ''}`]), { toValue: Number }),
      form.check('italic', '斜體（中文字型沒有斜體時用傾斜代替）'),
      form.range('size', '字級', { min: 12, max: 400, step: 1, unit: 'px', digits: 0 }),
      form.range('tracking', '字距', { min: -0.2, max: 1.2, step: 0.01, scale: 100, unit: '%', digits: 0 }),
      form.range('leading', '行距', { min: 0.9, max: 3.2, step: 0.05, unit: '倍', digits: 2 }),
      form.custom(h('div', { class: 'row' }, upBtn, upload, h('span', { class: 'note' }, 'TTF／OTF／WOFF／WOFF2'))),
      form.custom(fontMsg),
      form.custom(myList, syncMine),
      form.note('中文字型沒有的韓文字會自動改用風格相近的 Noto Sans KR／Noto Serif KR；西文字型遇到中文字會自動改用思源黑體或思源宋體。網路字型只在選到時才下載，而且只下載用到的字。')
    ]));

    /* 副文字 */
    p.append(form.section('副文字', [
      form.select('subFont', '字型', () => [{ group: '跟主文字相同', items: [['', '（同主文字）']] }, ...fontOptions().filter(g => g.group !== '其他')], {
        fromValue: fontVal,
        onPick: v => app.patch(c => { c.subFont = v ? toRef(v, c.subFont) : null; c.subWeight = nearestWeight(fontInfo(c.subFont || c.font).weights, c.subWeight); })
      }),
      form.select('subWeight', '粗細', c => fontInfo(c.subFont || c.font).weights.map(w => [String(w), `${w}・${WEIGHT_NAMES[w] || ''}`]), { toValue: Number }),
      form.check('subItalic', '斜體'),
      form.range('subScale', '大小', { min: 0.1, max: 0.9, step: 0.01, scale: 100, unit: '%', digits: 0, hint: '主文字字級的百分比' }),
      form.range('subTracking', '字距', { min: -0.2, max: 1.5, step: 0.01, scale: 100, unit: '%', digits: 0 }),
      form.range('subGap', '與主文字間距', { min: 0, max: 1.5, step: 0.01, unit: '× 字級', digits: 2 }),
      form.color('subColor', '顏色', { allowEmpty: true, extra: h('button', { type: 'button', class: 'small', onclick: () => app.set('subColor', '', { final: true }) }, '同主文字') }),
      form.note(c => (c.subColor ? '' : '目前跟主文字使用相同的塗色。'))
    ], { show: c => isShort(c) && !!c.sub.trim() }));

    /* 塗色 */
    const gradKits = h('div', { class: 'swatch-row' });
    for (const [name, cols] of GRADIENT_KITS) {
      const sw = h('i', {});
      sw.style.background = `linear-gradient(${cols.join(',')})`;
      const b = h('button', { type: 'button', class: 'swatch' }, sw, name);
      b.addEventListener('click', () => app.patch(c => { c.fill.mode = 'gradient'; c.fill.colors = cols.slice(); }));
      gradKits.append(b);
    }
    p.append(form.section('塗色', [
      form.seg('fill.mode', '方式', [['solid', '單色'], ['gradient', '漸層']]),
      form.color('fill.color', '顏色', { show: c => c.fill.mode !== 'gradient' }),
      form.color('fill.colors.0', '第 1 色', { show: c => c.fill.mode === 'gradient' }),
      form.color('fill.colors.1', '第 2 色', { show: c => c.fill.mode === 'gradient' }),
      form.color('fill.colors.2', '第 3 色', {
        allowEmpty: true, show: c => c.fill.mode === 'gradient',
        extra: h('button', { type: 'button', class: 'small', onclick: () => app.set('fill.colors.2', '', { final: true }) }, '不用')
      }),
      form.seg('fill.dir', '方向', [['v', '縱向（每行）'], ['h', '橫向（整段）'], ['d', '斜向（整段）']], { show: c => c.fill.mode === 'gradient' }),
      form.custom(gradKits, null, c => c.fill.mode === 'gradient'),
      form.range('fill.opacity', '塗色不透明度', { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', digits: 0, hint: '0% 加上外框就是空心字' })
    ]));

    p.append(form.section('外框', [
      form.check('stroke.on', '外框'),
      form.range('stroke.width', '粗細', { min: 0.5, max: 30, step: 0.5, unit: 'px', digits: 1, show: c => c.stroke.on }),
      form.color('stroke.color', '顏色', { show: c => c.stroke.on }),
      form.check('outer.on', '外側外框（在外框更外面再描一圈）'),
      form.range('outer.width', '粗細', { min: 0.5, max: 40, step: 0.5, unit: 'px', digits: 1, show: c => c.outer.on }),
      form.color('outer.color', '顏色', { show: c => c.outer.on })
    ]));
    p.append(form.section('陰影', [
      form.check('shadow.on', '陰影'),
      form.color('shadow.color', '顏色', { show: c => c.shadow.on }),
      form.range('shadow.opacity', '不透明度', { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', digits: 0, show: c => c.shadow.on }),
      form.range('shadow.blur', '模糊', { min: 0, max: 80, step: 1, unit: 'px', digits: 0, show: c => c.shadow.on }),
      form.range('shadow.x', '水平位移', { min: -60, max: 60, step: 1, unit: 'px', digits: 0, show: c => c.shadow.on }),
      form.range('shadow.y', '垂直位移', { min: -60, max: 60, step: 1, unit: 'px', digits: 0, show: c => c.shadow.on })
    ]));
    p.append(form.section('光暈', [
      form.check('glow.on', '光暈（只在字的外側）'),
      form.color('glow.color', '顏色', { show: c => c.glow.on }),
      form.range('glow.spread', '擴散', { min: 2, max: 150, step: 1, unit: 'px', digits: 0, show: c => c.glow.on }),
      form.range('glow.strength', '強度', { min: 0.2, max: 3, step: 0.05, unit: '倍', digits: 2, show: c => c.glow.on })
    ]));
  }

  /* ================= 裝飾 ================= */
  {
    const p = pane('deco');
    const k = c => c.deco.kind;
    const on = c => k(c) !== 'none';
    const lineish = c => LINE_DECOS.has(k(c)) || k(c) === 'roundBox';
    p.append(form.section('裝飾', [
      form.select('deco.kind', '種類', DECO_CHOICES),
      form.note(c => ({
        none: '不加裝飾。',
        band: '橫貫畫面的半透明色帶，上下邊緣柔化。會先開場，文字晚一點出現。',
        tape: '文字上下各一條黃黑斜紋膠帶，斜紋會流動、閃爍。會先開場。',
        roundBox: '包住全部文字的圓角底框。會跟著整塊效果一起縮放。',
        frame: '只框住主文字、左右延伸的長框；外框線從左上角順時針一筆畫完。會先開場。',
        rails: '文字上下各一條橫線，從中央往兩端伸長。',
        underline: '主文字下方一條橫線（有副文字在下方時畫在兩者正中間）。',
        dashes: '主文字左右各一條短線。',
        sideBar: '文字左側一條直線（直書時改成上方橫線）。',
        corners: '四個角的 L 形角線，像取景框。'
      })[k(c)] || ''),
      form.seg('deco.anim', '動畫', [['grow', '生長'], ['fade', '淡入淡出'], ['none', '無']], { show: on }),
      form.range('deco.animTime', '動畫時間', { min: 0.1, max: 2.5, step: 0.05, unit: '秒', digits: 2, show: c => on(c) && c.deco.anim !== 'none' }),
      form.range('deco.gap', '與文字的距離', { min: 0, max: 2, step: 0.01, unit: '× 字級', digits: 2, show: on }),
      form.range('deco.lineWidth', '線寬', { min: 0, max: 16, step: 0.5, unit: 'px', digits: 1, show: lineish }),
      form.color('deco.lineColor', '線色', { show: lineish }),
      form.check('deco.outline', '線條也套用文字外框', { show: c => LINE_DECOS.has(k(c)) && (c.stroke.on || c.outer.on) }),
      form.range('deco.extend', '左右延伸', { min: 0, max: 12, step: 0.05, unit: '× 字級', digits: 2, show: c => ['frame', 'rails', 'underline', 'dashes'].includes(k(c)) }),
      form.select('deco.corner', '角落裝飾', [['none', '無'], ['square', '方塊'], ['diamond', '菱形']], { show: c => k(c) === 'frame' }),
      form.range('deco.radius', '圓角', { min: 0, max: 1, step: 0.01, unit: '× 字級', digits: 2, show: c => k(c) === 'roundBox' }),
      form.color('deco.fillColor', '填色', { show: c => ['band', 'roundBox', 'frame'].includes(k(c)) }),
      form.range('deco.fillAlpha', '填色濃度', { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', digits: 0, show: c => ['band', 'roundBox', 'frame'].includes(k(c)) }),
      form.range('deco.softEdge', '上下柔邊', { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', digits: 0, show: c => k(c) === 'band' }),
      form.range('deco.sideFade', '左右淡出', { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', digits: 0, show: c => k(c) === 'band' }),
      form.range('deco.tapeWidth', '膠帶粗細', { min: 8, max: 120, step: 1, unit: 'px', digits: 0, show: c => k(c) === 'tape' }),
      form.range('deco.tapeSpeed', '斜紋流動', { min: 0, max: 400, step: 5, unit: 'px/秒', digits: 0, show: c => k(c) === 'tape', hint: '0＝不流動' }),
      form.range('deco.tapeBlink', '閃爍變暗', { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', digits: 0, show: c => k(c) === 'tape' }),
      form.color('deco.tapeA', '底色', { show: c => k(c) === 'tape' }),
      form.color('deco.tapeB', '斜紋色', { show: c => k(c) === 'tape' }),
      form.note('捲動模式不使用裝飾。', { show: isScroll })
    ]));
    p.append(form.section('整張背景', [
      form.select('bg.kind', '種類', BACKDROP_CHOICES),
      form.color('bg.color', '顏色', { show: c => c.bg.kind !== 'none' }),
      form.range('bg.alpha', '濃度', { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', digits: 0, show: c => c.bg.kind !== 'none' }),
      form.check('bg.sync', '跟著文字淡入淡出', { show: c => c.bg.kind !== 'none' }),
      form.note('整張背景會畫進輸出的檔案裡（預覽底色則不會）。', { show: c => c.bg.kind !== 'none' })
    ]));
  }

  /* ================= 時間與匯出 ================= */
  const busyBtns = [];
  const totalNote = h('p', { class: 'note info' });
  {
    const p = pane('time');
    const sizeVal = c => {
      const key = `${c.canvasW}x${c.canvasH}`;
      return SIZE_PRESETS.some(s => s[0] === key) && !app._customSize ? key : 'custom';
    };
    p.append(form.section('畫面尺寸', [
      form.select('canvas', '尺寸', SIZE_PRESETS, {
        fromValue: (_, c) => sizeVal(c),
        onPick: v => {
          if (v === 'custom') { app._customSize = true; form.refresh(); return; }
          app._customSize = false;
          const [w, hh] = v.split('x').map(Number);
          app.patch(c => { c.canvasW = w; c.canvasH = hh; });
        }
      }),
      form.range('canvasW', '寬', { min: 16, max: 2048, step: 1, unit: 'px', digits: 0, show: c => sizeVal(c) === 'custom' }),
      form.range('canvasH', '高', { min: 16, max: 2048, step: 1, unit: 'px', digits: 0, show: c => sizeVal(c) === 'custom' })
    ]));

    p.append(form.section('時間', [
      form.seg('fps', 'fps', [[12, '12'], [15, '15'], [20, '20'], [24, '24'], [30, '30'], [60, '60']]),
      form.range('preBlank', '開始前空白', { min: 0, max: 3, step: 0.05, unit: '秒', digits: 2 }),
      form.range('intro.dur', '登場時長', { min: 0.05, max: 4, step: 0.01, unit: '秒', digits: 2, show: c => isShort(c) && !introDef(c).instant }),
      form.range('flow.charDur', '單字出現時間', { min: 0, max: 2, step: 0.01, unit: '秒', digits: 2, show: c => isLong(c) && !['big', 'stack', 'scroll'].includes(c.flow.kind) && !charDef(c).instant }),
      form.range('holdTime', '停留時間', { min: 0, max: 10, step: 0.1, unit: '秒', digits: 1, show: c => !isScroll(c) }),
      form.range('outro.dur', '退場時長', { min: 0.05, max: 4, step: 0.01, unit: '秒', digits: 2, show: c => c.outroOn && !isScroll(c) && !outroDef(c).instant }),
      form.range('postBlank', '結束後空白', { min: 0, max: 5, step: 0.05, unit: '秒', digits: 2 }),
      form.custom(totalNote)
    ]));

    const nameInput = h('input', { type: 'text', placeholder: '', spellcheck: 'false', 'aria-label': '檔名' });
    nameInput.addEventListener('change', () => app.setManualName(nameInput.value));
    const autoBtn = h('button', { type: 'button', class: 'small', onclick: () => { nameInput.value = ''; app.setManualName(''); } }, '自動命名');
    const nameField = h('div', { class: 'field text' }, h('label', {}, '檔名（留空＝自動命名）'), h('div', { class: 'row' }, nameInput, autoBtn));
    const mkBtn = (label, fn, cls = 'ghost') => { const b = h('button', { type: 'button', class: cls, onclick: fn }, label); busyBtns.push(b); return b; };
    p.append(form.section('匯出', [
      form.seg('loop', '循環', [['once', '播放一次'], ['infinite', '無限循環'], ['count', '指定次數']]),
      form.range('loopCount', '次數', { min: 1, max: 999, step: 1, unit: '次', digits: 0, show: c => c.loop === 'count' }),
      form.note('播放一次會停在最後一格：開著退場時最後一格是全透明，關掉退場時停在完成狀態。', { show: c => c.loop === 'once' }),
      form.seg('colors', '色數', [[256, '256 色（輕量）'], ['full', '全彩']], { fromValue: v => String(v) }),
      form.note('256 色：實際用到的顏色在 256 色以內時完全無損；超過時才減色（保留半透明邊緣）。全彩檔案約大 3 倍。'),
      form.check('stillFallback', '不支援 APNG 的環境顯示完成狀態'),
      form.check('autoCrop', '自動裁掉透明邊'),
      form.custom(nameField, c => { if (document.activeElement !== nameInput) nameInput.value = app.manualName(); nameInput.placeholder = app.autoName(); }),
      form.custom(h('div', { class: 'btn-row' },
        mkBtn('匯出 APNG', () => app.exportApng(), 'primary'),
        mkBtn('存成 PNG 靜止圖', () => app.exportPng()),
        mkBtn('連番 PNG（ZIP）', () => app.exportZip()))),
      form.note('PNG 靜止圖：暫停中存目前那一格；正在播放或那一格是空的時候，存完成狀態。')
    ]));
  }

  /* fps 分段按鈕的值是數字；色數也是 */
  const refreshDerived = () => {
    const sc = app.scene();
    const c = app.cfg();
    if (!sc) return;
    const n = frameCount(sc.duration, c.fps);
    totalNote.textContent = `總長 ${sc.duration.toFixed(2)} 秒・${c.fps} fps 共 ${n} 格` + (c.mode === 'long' ? `・${sc.pages.length} 頁` : '') + `・完成狀態在 ${sc.repTime.toFixed(2)} 秒`;
  };

  /* 分頁切換 */
  const tabs = [...document.querySelectorAll('#tabs [role="tab"]')];
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.setAttribute('aria-selected', x === t ? 'true' : 'false'));
    document.querySelectorAll('.pane').forEach(pn => { pn.hidden = pn.dataset.pane !== t.dataset.tab; });
    try { localStorage.setItem('trpg-toolkit:text-fx:tab', t.dataset.tab); } catch { /* 略過 */ }
  }));
  try {
    const saved = localStorage.getItem('trpg-toolkit:text-fx:tab');
    const t = tabs.find(x => x.dataset.tab === saved);
    if (t) t.click();
  } catch { /* 略過 */ }

  return {
    refresh: () => { form.refresh(); refreshDerived(); },
    refreshDerived,
    setBusy: on => busyBtns.forEach(b => { b.disabled = on; })
  };
}
