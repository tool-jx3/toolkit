/**
 * 對等驗證的案例：每個案例是一組「舊版格式」的設定配方，在舊版頁面用舊版的 library.js 組出設定，
 * 同一份 JSON 再交給新版（新版的 normalizeSettings 會轉換舊格式）。
 */

export interface Recipe {
  /** 案例代號（唯一） */
  id: string;
  /** 對應規格的功能編號 */
  f: string[];
  mode: 'title' | 'long' | 'caption';
  /** 從範本開始（否則從基礎預設＋示範文字開始） */
  tpl?: string;
  /** 套用文字風格（STYLE_KITS 的 id） */
  kit?: string;
  intro?: [string, Record<string, unknown>?];
  outro?: [string, Record<string, unknown>?];
  /** 依路徑設定值（'deco.kind': 'band'） */
  set?: Record<string, unknown>;
  text?: string;
  sub?: string;
}

export const TEXTS = {
  title: { text: '文字演出測試', sub: 'PARITY TEST 123' },
  caption: { text: '舊校舍・三樓走廊', sub: '23:47' },
  long: {
    text: '那年秋天，雨下了整整一個禮拜。\n你們收到一封信——「請在月亮升起之前抵達。」\n\n故事，就從那扇吱呀作響的門開始。',
    sub: '',
  },
};

const TITLE_TPLS = [
  ['battle-start', 'F007'],
  ['round-end', 'F008'],
  ['enemy', 'F009'],
  ['retreat', 'F010'],
  ['explore', 'F011'],
  ['clue', 'F012'],
  ['investigated', 'F013'],
  ['break', 'F014'],
  ['wrap-up', 'F015'],
  ['next-time', 'F016'],
  ['thanks', 'F017'],
  ['coc7-critical', 'F018'],
  ['coc7-extreme', 'F019'],
  ['coc7-hard', 'F020'],
  ['coc7-success', 'F021'],
  ['coc7-fail', 'F022'],
  ['coc7-fumble', 'F023'],
  ['coc7-san', 'F024'],
  ['coc6-critical', 'F025'],
  ['coc6-special', 'F026'],
  ['coc6-success', 'F027'],
  ['coc6-fail', 'F028'],
  ['coc6-fumble', 'F029'],
  ['coc6-san', 'F030'],
  ['gen-success', 'F031'],
  ['gen-fail', 'F032'],
  ['gen-hit', 'F033'],
  ['gen-dodge', 'F034'],
] as const;
const LONG_TPLS = [
  ['opening', 'F035'],
  ['preview', 'F036'],
  ['chapter', 'F037'],
  ['memory', 'F038'],
  ['narration', 'F039'],
  ['letter', 'F040'],
  ['system', 'F041'],
  ['credits', 'F042'],
] as const;
const CAPTION_TPLS = [
  ['place-time', 'F043'],
  ['day', 'F044'],
  ['merge', 'F045'],
  ['center-spread', 'F046'],
  ['flashback', 'F047'],
  ['typewriter', 'F048'],
  ['vertical-place', 'F049'],
  ['chapter-card', 'F050'],
] as const;

const INTROS: [string, string][] = [
  ['fade', 'F059'],
  ['rise', 'F060'],
  ['drop', 'F061'],
  ['zip', 'F062'],
  ['slide', 'F063'],
  ['converge', 'F064'],
  ['stack', 'F065'],
  ['focus', 'F066'],
  ['mist', 'F067'],
  ['pop', 'F068'],
  ['shrink', 'F069'],
  ['spin', 'F070'],
  ['flip', 'F071'],
  ['bounce', 'F072'],
  ['gather', 'F073'],
  ['type', 'F074'],
  ['flicker', 'F075'],
  ['impact', 'F076'],
  ['zoomBack', 'F077'],
  ['grow', 'F078'],
  ['wipe', 'F079'],
  ['slit', 'F080'],
  ['split', 'F081'],
  ['glitch', 'F082'],
  ['whiteHot', 'F083'],
];

const OUTROS: [string, string][] = [
  ['fadeOut', 'F140'],
  ['floatUp', 'F141'],
  ['sinkDown', 'F142'],
  ['part', 'F143'],
  ['slideOut', 'F144'],
  ['spread', 'F145'],
  ['blurOut', 'F146'],
  ['zoomFade', 'F147'],
  ['shrinkDot', 'F148'],
  ['scatter', 'F149'],
  ['backspace', 'F150'],
  ['flickerOut', 'F151'],
  ['toCamera', 'F152'],
  ['recede', 'F153'],
  ['wipeOut', 'F154'],
  ['slitClose', 'F155'],
  ['splitOut', 'F156'],
  ['glitchOut', 'F157'],
];

const HOLDS: [string, string][] = [
  ['none', 'F129'],
  ['float', 'F130'],
  ['wave', 'F131'],
  ['heartbeat', 'F132'],
  ['jitter', 'F133'],
  ['breathe', 'F134'],
  ['flickerHold', 'F135'],
  ['blink', 'F136'],
  ['glitchPulse', 'F137'],
];

const FLOWS: [string, string][] = [
  ['seq', 'F091'],
  ['big', 'F092'],
  ['stack', 'F093'],
  ['line', 'F094'],
  ['scan', 'F095'],
  ['all', 'F096'],
  ['scroll', 'F097'],
];

const CURVES: [string, string][] = [
  ['out', 'F121'],
  ['snap', 'F122'],
  ['smooth', 'F123'],
  ['back', 'F124'],
  ['spring', 'F125'],
  ['bounce', 'F126'],
  ['linear', 'F127'],
  ['in', 'F128'],
];

const KITS: [string, string][] = [
  ['classic', 'F176'],
  ['gold', 'F177'],
  ['fire', 'F178'],
  ['blood', 'F179'],
  ['ice', 'F180'],
  ['neon', 'F181'],
  ['toxic', 'F182'],
  ['ink', 'F183'],
  ['sepia', 'F184'],
  ['pastel', 'F185'],
  ['hollow', 'F186'],
];

const GRADIENTS: [string[], string][] = [
  [['#fff6cf', '#f4c64e', '#a76d12'], 'F204'],
  [['#ffffff', '#d5dbe3', '#808b99'], 'F205'],
  [['#fff3c4', '#ffae2b', '#d1300c'], 'F206'],
  [['#ffffff', '#bfe6ff', '#4d8fd6'], 'F207'],
  [['#ff6b6b', '#c3121b', '#4c0005'], 'F208'],
  [['#f1ffd2', '#88e04f', '#5b2a86'], 'F209'],
  [['#ffe3a3', '#ff8e6e', '#7b3f9e'], 'F210'],
  [['#d8fbff', '#3fb8d6', '#0b3a66'], 'F211'],
];

const DECOS: [string, string][] = [
  ['band', 'F218'],
  ['tape', 'F219'],
  ['roundBox', 'F220'],
  ['frame', 'F221'],
  ['rails', 'F222'],
  ['underline', 'F223'],
  ['dashes', 'F224'],
  ['sideBar', 'F225'],
  ['corners', 'F226'],
];

export function buildRecipes(): Recipe[] {
  const out: Recipe[] = [];
  /* 範本 */
  for (const [tpl, f] of TITLE_TPLS)
    out.push({ id: `tpl-title-${tpl}`, f: [f, 'F003'], mode: 'title', tpl });
  for (const [tpl, f] of LONG_TPLS)
    out.push({ id: `tpl-long-${tpl}`, f: [f, 'F003'], mode: 'long', tpl });
  for (const [tpl, f] of CAPTION_TPLS)
    out.push({ id: `tpl-caption-${tpl}`, f: [f, 'F003'], mode: 'caption', tpl });

  /* 登場效果（烈焰風格：漸層＋外框＋陰影＋光暈） */
  for (const [fx, f] of INTROS)
    out.push({ id: `intro-${fx}`, f: [f, 'F051'], mode: 'title', kit: 'fire', intro: [fx] });
  for (const dir of ['right', 'up', 'down'])
    out.push({
      id: `intro-slide-${dir}`,
      f: ['F053', 'F063'],
      mode: 'title',
      intro: ['slide', { dir }],
    });
  for (const dir of ['rtl', 'ttb', 'btt', 'center'])
    out.push({
      id: `intro-wipe-${dir}`,
      f: ['F053', 'F079'],
      mode: 'title',
      intro: ['wipe', { dir }],
    });
  out.push({
    id: 'intro-slit-h',
    f: ['F053', 'F080'],
    mode: 'title',
    intro: ['slit', { dir: 'h' }],
  });
  out.push({ id: 'intro-dur', f: ['F054'], mode: 'title', intro: ['rise', { dur: 2.2 }] });
  out.push({ id: 'intro-gap', f: ['F055'], mode: 'title', intro: ['rise', { gap: 0.3 }] });
  for (const order of ['reverse', 'center', 'edges', 'random'])
    out.push({ id: `intro-order-${order}`, f: ['F056'], mode: 'title', intro: ['pop', { order }] });
  for (const [curve, f] of CURVES)
    out.push({
      id: `curve-${curve}`,
      f: [f, 'F057'],
      mode: 'title',
      intro: ['rise', { curve, dur: 1.2 }],
    });
  out.push({ id: 'intro-power', f: ['F058'], mode: 'title', intro: ['spin', { power: 2.2 }] });
  out.push({
    id: 'intro-vertical-zip',
    f: ['F062', 'F162'],
    mode: 'title',
    intro: ['zip'],
    set: { vertical: true },
  });

  /* 副文字登場 */
  for (const sub of ['fade', 'rise', 'focus', 'converge', 'slide', 'slideOpp', 'type'])
    out.push({ id: `sub-${sub}`, f: ['F084', 'F088'], mode: 'caption', set: { subIntro: sub } });
  out.push({ id: 'sub-offset', f: ['F085'], mode: 'caption', set: { subOffset: 0.8 } });
  out.push({ id: 'sub-same-block', f: ['F086'], mode: 'title', intro: ['zoomBack'] });
  out.push({ id: 'sub-same-glyph', f: ['F087'], mode: 'title', intro: ['rise', { gap: 0.12 }] });
  out.push({
    id: 'sub-other-block',
    f: ['F086', 'F084'],
    mode: 'title',
    intro: ['impact'],
    set: { subIntro: 'rise' },
  });

  /* 長文流程 */
  for (const [kind, f] of FLOWS)
    out.push({ id: `flow-${kind}`, f: [f, 'F090'], mode: 'long', set: { 'flow.kind': kind } });
  out.push({ id: 'flow-cps', f: ['F098'], mode: 'long', set: { 'flow.cps': 30 } });
  out.push({ id: 'flow-punct', f: ['F099'], mode: 'long', set: { 'flow.punctPause': 1 } });
  out.push({ id: 'flow-linepause', f: ['F100'], mode: 'long', set: { 'flow.linePause': 1.2 } });
  out.push({ id: 'flow-cursor', f: ['F101'], mode: 'long', set: { 'flow.cursor': true } });
  out.push({
    id: 'flow-cursor-color',
    f: ['F102'],
    mode: 'long',
    kit: 'gold',
    set: { 'flow.cursor': true, 'flow.charFx': 'type', 'flow.charDur': 0 },
  });
  out.push({
    id: 'flow-cursor-vertical',
    f: ['F101', 'F102'],
    mode: 'long',
    set: { 'flow.cursor': true, 'flow.cursorColor': '#ff4060', vertical: true },
  });
  out.push({
    id: 'flow-big-params',
    f: ['F103', 'F104', 'F105'],
    mode: 'long',
    kit: 'blood',
    set: { 'flow.kind': 'big', 'flow.bigRatio': 0.3, 'flow.bigPause': 1, 'flow.impact': 2 },
  });
  out.push({
    id: 'flow-stack-params',
    f: ['F106', 'F107'],
    mode: 'long',
    set: { 'flow.kind': 'stack', 'flow.stackHold': 1.5, 'flow.spreadTime': 2 },
  });
  out.push({
    id: 'flow-linegap',
    f: ['F108'],
    mode: 'long',
    set: { 'flow.kind': 'line', 'flow.lineGap': 2 },
  });
  out.push({
    id: 'flow-scantime',
    f: ['F109'],
    mode: 'long',
    set: { 'flow.kind': 'scan', 'flow.scanTime': 3 },
  });
  out.push({
    id: 'flow-speed',
    f: ['F110'],
    mode: 'long',
    set: { 'flow.kind': 'scroll', 'flow.speed': 240 },
  });
  out.push({
    id: 'flow-edgefade-off',
    f: ['F111'],
    mode: 'long',
    set: { 'flow.kind': 'scroll', 'flow.edgeFade': false },
  });
  out.push({
    id: 'flow-scroll-vertical',
    f: ['F097', 'F162'],
    mode: 'long',
    set: { 'flow.kind': 'scroll', vertical: true },
  });
  for (const [fx, f] of INTROS.filter(
    ([id]) =>
      ![
        'stack',
        'impact',
        'zoomBack',
        'grow',
        'wipe',
        'slit',
        'split',
        'glitch',
        'whiteHot',
      ].includes(id),
  ))
    out.push({
      id: `char-${fx}`,
      f: ['F112', f],
      mode: 'long',
      set: { 'flow.charFx': fx, 'flow.charDur': fx === 'type' ? 0 : 0.6 },
    });
  out.push({ id: 'char-dur', f: ['F113'], mode: 'long', set: { 'flow.charDur': 1.5 } });
  out.push({
    id: 'char-dir-curve-power',
    f: ['F114'],
    mode: 'long',
    set: {
      'flow.kind': 'all',
      'flow.charFx': 'slide',
      'intro.dir': 'up',
      'intro.curve': 'back',
      'intro.power': 2,
    },
  });
  out.push({ id: 'paging-off', f: ['F115'], mode: 'long', set: { paging: false } });
  out.push({ id: 'page-gap', f: ['F116'], mode: 'long', set: { 'flow.pageGap': 1.5 } });

  /* 停留 */
  for (const [fx, f] of HOLDS)
    out.push({
      id: `hold-${fx}`,
      f: [f, 'F118'],
      mode: 'title',
      kit: 'ice',
      set: { 'hold.fx': fx, holdTime: 3.4 },
    });
  out.push({
    id: 'hold-power',
    f: ['F119'],
    mode: 'title',
    set: { 'hold.fx': 'wave', 'hold.power': 2.5, holdTime: 3 },
  });
  out.push({ id: 'hold-time', f: ['F120'], mode: 'title', set: { holdTime: 0 } });

  /* 退場 */
  out.push({ id: 'outro-off', f: ['F138'], mode: 'title', set: { outroOn: false } });
  out.push({ id: 'outro-off-long', f: ['F138', 'F115'], mode: 'long', set: { outroOn: false } });
  for (const [fx, f] of OUTROS)
    out.push({ id: `outro-${fx}`, f: [f, 'F139'], mode: 'title', kit: 'gold', outro: [fx] });
  for (const dir of ['right', 'up', 'down'])
    out.push({
      id: `outro-slide-${dir}`,
      f: ['F139', 'F144'],
      mode: 'title',
      outro: ['slideOut', { dir }],
    });
  for (const dir of ['rtl', 'ttb', 'btt', 'center'])
    out.push({
      id: `outro-wipe-${dir}`,
      f: ['F139', 'F154'],
      mode: 'title',
      outro: ['wipeOut', { dir }],
    });
  out.push({
    id: 'outro-slit-h',
    f: ['F139', 'F155'],
    mode: 'title',
    outro: ['slitClose', { dir: 'h' }],
  });
  out.push({
    id: 'outro-params',
    f: ['F139'],
    mode: 'title',
    outro: ['floatUp', { dur: 1.5, gap: 0.2, order: 'random', curve: 'spring', power: 2 }],
  });
  out.push({
    id: 'glitch-colors',
    f: ['F158'],
    mode: 'title',
    intro: ['glitch'],
    set: { glitchA: '#00ff00', glitchB: '#ffff00' },
  });

  /* 文字 */
  out.push({
    id: 'text-multiline',
    f: ['F159', 'F160'],
    mode: 'title',
    text: '第一行\n第二行比較長一點',
    sub: '副文字也有\n兩行',
  });
  out.push({ id: 'vertical', f: ['F162'], mode: 'caption', set: { vertical: true } });
  out.push({
    id: 'vertical-latin-upright',
    f: ['F163'],
    mode: 'title',
    text: '第7號ABC',
    set: { vertical: true, latinUpright: true },
  });
  out.push({
    id: 'vertical-punct',
    f: ['F164'],
    mode: 'long',
    set: { vertical: true, 'flow.kind': 'all' },
    text: '敬啟者，見字如面。\n「鑰匙」（藏在畫後）……\nっぁ、ー！？',
  });
  out.push({
    id: 'vertical-punct-center',
    f: ['F164'],
    mode: 'long',
    set: { vertical: true, punctCenter: true, 'flow.kind': 'all' },
    text: '敬啟者，見字如面。\n「鑰匙」（藏在畫後）……\nっぁ、ー！？',
  });
  for (const align of ['start', 'end'])
    out.push({
      id: `align-${align}`,
      f: ['F165'],
      mode: 'caption',
      set: { align },
      text: '第一行\n第二行比較長',
      sub: '副',
    });
  out.push({
    id: 'align-vertical-end',
    f: ['F165', 'F162'],
    mode: 'caption',
    set: { align: 'end', vertical: true },
  });
  out.push({ id: 'subpos-before', f: ['F166'], mode: 'caption', set: { subPos: 'before' } });
  out.push({
    id: 'subpos-before-vertical',
    f: ['F166'],
    mode: 'caption',
    set: { subPos: 'before', vertical: true },
  });
  for (const anchor of ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'])
    out.push({ id: `anchor-${anchor}`, f: ['F167'], mode: 'caption', set: { anchor } });
  out.push({
    id: 'margins',
    f: ['F168'],
    mode: 'caption',
    set: { anchor: 'tl', marginX: 200, marginY: 150 },
  });
  out.push({ id: 'offsets', f: ['F169'], mode: 'caption', set: { offsetX: -300, offsetY: 120 } });
  out.push({ id: 'wrap-chars', f: ['F170', 'F172'], mode: 'long', set: { wrapChars: 7 } });
  out.push({
    id: 'wrap-width',
    f: ['F171', 'F172'],
    mode: 'long',
    set: { size: 90 },
    text: '這是一段很長很長的文字，用來測試自動換行的禁則：「開括號」不放在行尾，句號。不放在行首，English words stay together！',
  });
  out.push({
    id: 'wrap-width-off',
    f: ['F171', 'F173'],
    mode: 'long',
    set: { size: 90, wrapWidth: false },
    text: '這是一段很長很長的文字，用來測試自動換行。',
  });
  out.push({ id: 'autoshrink', f: ['F173'], mode: 'title', set: { size: 320 } });
  out.push({
    id: 'autoshrink-off',
    f: ['F173'],
    mode: 'title',
    set: { size: 320, autoShrink: false },
  });
  out.push({ id: 'minsize', f: ['F174'], mode: 'title', set: { size: 320, minSize: 200 } });

  /* 樣式 */
  for (const [kit, f] of KITS) out.push({ id: `kit-${kit}`, f: [f, 'F175'], mode: 'title', kit });
  for (const family of [
    'Noto Sans TC',
    'LXGW WenKai TC',
    'Huninn',
    'Cinzel',
    'Bebas Neue',
    'Creepster',
  ])
    out.push({
      id: `font-${family}`,
      f: ['F187', 'F193'],
      mode: 'title',
      set: { font: { src: 'google', id: family } },
    });
  out.push({
    id: 'font-local',
    f: ['F187'],
    mode: 'title',
    set: { font: { src: 'local', id: 'DejaVu Sans' } },
  });
  for (const w of [400, 900])
    out.push({ id: `weight-${w}`, f: ['F188'], mode: 'title', set: { weight: w } });
  out.push({ id: 'italic', f: ['F189'], mode: 'title', set: { italic: true, subItalic: true } });
  out.push({ id: 'size', f: ['F190'], mode: 'title', set: { size: 60 } });
  out.push({ id: 'tracking', f: ['F191'], mode: 'title', set: { tracking: 0.6 } });
  out.push({ id: 'tracking-neg', f: ['F191'], mode: 'title', set: { tracking: -0.15 } });
  out.push({ id: 'leading', f: ['F192'], mode: 'long', set: { leading: 3 } });
  out.push({ id: 'korean', f: ['F193'], mode: 'title', text: '전투 시작', sub: '韓文替代字型' });
  out.push({
    id: 'sub-font',
    f: ['F194'],
    mode: 'title',
    set: { subFont: { src: 'google', id: 'Cinzel' }, subWeight: 700 },
  });
  out.push({ id: 'sub-scale', f: ['F195'], mode: 'title', set: { subScale: 0.8 } });
  out.push({ id: 'sub-tracking', f: ['F196'], mode: 'title', set: { subTracking: 1.2 } });
  out.push({ id: 'sub-gap', f: ['F197'], mode: 'title', set: { subGap: 1.2 } });
  out.push({
    id: 'sub-color',
    f: ['F198'],
    mode: 'title',
    kit: 'gold',
    set: { subColor: '#ff3366' },
  });
  out.push({
    id: 'fill-solid',
    f: ['F199', 'F200'],
    mode: 'title',
    set: { 'fill.color': '#66ccff' },
  });
  out.push({
    id: 'fill-gradient-v',
    f: ['F201', 'F202'],
    mode: 'title',
    set: { 'fill.mode': 'gradient' },
  });
  out.push({
    id: 'fill-gradient-2',
    f: ['F201'],
    mode: 'title',
    set: { 'fill.mode': 'gradient', 'fill.colors': ['#ff0000', '#0000ff', ''] },
  });
  for (const dir of ['h', 'd'])
    out.push({
      id: `fill-gradient-${dir}`,
      f: ['F202'],
      mode: 'caption',
      set: { 'fill.mode': 'gradient', 'fill.dir': dir },
    });
  out.push({
    id: 'fill-gradient-vertical',
    f: ['F202', 'F162'],
    mode: 'title',
    set: { 'fill.mode': 'gradient', vertical: true },
  });
  GRADIENTS.forEach(([cols, f], i) => {
    out.push({
      id: `gradient-kit-${i}`,
      f: [f, 'F203'],
      mode: 'title',
      set: { 'fill.mode': 'gradient', 'fill.colors': cols },
    });
  });
  out.push({ id: 'fill-opacity', f: ['F212'], mode: 'title', set: { 'fill.opacity': 0.4 } });
  out.push({
    id: 'stroke',
    f: ['F213'],
    mode: 'title',
    set: { 'stroke.width': 14, 'stroke.color': '#3355ff' },
  });
  out.push({ id: 'stroke-off', f: ['F213'], mode: 'title', set: { 'stroke.on': false } });
  out.push({
    id: 'outer',
    f: ['F214'],
    mode: 'title',
    set: { 'outer.on': true, 'outer.width': 12, 'outer.color': '#ffcc00' },
  });
  out.push({
    id: 'shadow',
    f: ['F215'],
    mode: 'title',
    set: {
      'shadow.color': '#ff0000',
      'shadow.opacity': 0.9,
      'shadow.blur': 30,
      'shadow.x': -20,
      'shadow.y': 25,
    },
  });
  out.push({ id: 'shadow-off', f: ['F215'], mode: 'title', set: { 'shadow.on': false } });
  out.push({
    id: 'glow',
    f: ['F216'],
    mode: 'title',
    set: { 'glow.on': true, 'glow.color': '#ff00ff', 'glow.spread': 60, 'glow.strength': 2.6 },
  });

  /* 裝飾 */
  for (const [kind, f] of DECOS) {
    out.push({
      id: `deco-${kind}`,
      f: [f, 'F217', 'F227'],
      mode: 'title',
      set: { 'deco.kind': kind },
    });
    out.push({
      id: `deco-${kind}-vertical`,
      f: [f, 'F162'],
      mode: 'caption',
      set: { 'deco.kind': kind, vertical: true },
    });
  }
  for (const anim of ['fade', 'none'])
    out.push({
      id: `deco-anim-${anim}`,
      f: ['F227'],
      mode: 'title',
      set: { 'deco.kind': 'frame', 'deco.anim': anim },
    });
  out.push({
    id: 'deco-params',
    f: ['F228', 'F229', 'F231', 'F232'],
    mode: 'title',
    set: {
      'deco.kind': 'frame',
      'deco.gap': 1,
      'deco.lineWidth': 8,
      'deco.lineColor': '#33ffaa',
      'deco.extend': 4,
      'deco.corner': 'square',
      'deco.animTime': 1.2,
    },
  });
  out.push({
    id: 'deco-outline',
    f: ['F230'],
    mode: 'title',
    set: { 'deco.kind': 'corners', 'deco.outline': true, 'outer.on': true },
  });
  out.push({
    id: 'deco-radius',
    f: ['F233', 'F234'],
    mode: 'title',
    set: {
      'deco.kind': 'roundBox',
      'deco.radius': 0.9,
      'deco.fillColor': '#2244aa',
      'deco.fillAlpha': 0.9,
    },
  });
  out.push({
    id: 'deco-band-soft',
    f: ['F235', 'F234'],
    mode: 'title',
    set: {
      'deco.kind': 'band',
      'deco.softEdge': 0.5,
      'deco.sideFade': 0.4,
      'deco.fillColor': '#aa0000',
    },
  });
  out.push({
    id: 'deco-tape-params',
    f: ['F236'],
    mode: 'title',
    set: {
      'deco.kind': 'tape',
      'deco.tapeWidth': 80,
      'deco.tapeSpeed': 300,
      'deco.tapeBlink': 1,
      'deco.tapeA': '#00ccff',
      'deco.tapeB': '#220044',
    },
  });

  /* 背景 */
  for (const [kind, f] of [
    ['solid', 'F238'],
    ['vignette', 'F239'],
    ['bottom', 'F240'],
    ['top', 'F241'],
  ] as const)
    out.push({
      id: `bg-${kind}`,
      f: [f, 'F237'],
      mode: 'title',
      set: { 'bg.kind': kind, 'bg.color': '#102040', 'bg.alpha': 0.8 },
    });
  out.push({
    id: 'bg-nosync',
    f: ['F242'],
    mode: 'title',
    set: { 'bg.kind': 'solid', 'bg.sync': false },
  });

  /* 尺寸與時間 */
  for (const [w, h] of [
    [1920, 1080],
    [1280, 360],
    [1080, 1920],
    [333, 222],
  ])
    out.push({ id: `size-${w}x${h}`, f: ['F243'], mode: 'title', set: { canvasW: w, canvasH: h } });
  out.push({ id: 'blank', f: ['F245'], mode: 'title', set: { preBlank: 1.2, postBlank: 2 } });
  return out;
}

/** 匯出的對等案例（APNG、PNG、ZIP） */
export interface ExportRecipe extends Recipe {
  kind: 'apng' | 'png' | 'zip';
  fps?: number;
}

export function buildExportRecipes(): ExportRecipe[] {
  return [
    {
      id: 'apng-battle-start',
      f: ['F253', 'F248', 'F249'],
      mode: 'title',
      tpl: 'battle-start',
      kind: 'apng',
    },
    { id: 'apng-clue-hold', f: ['F253', 'F248'], mode: 'title', tpl: 'clue', kind: 'apng' },
    { id: 'apng-break-loop', f: ['F247', 'F253'], mode: 'title', tpl: 'break', kind: 'apng' },
    { id: 'apng-coc6-san', f: ['F253'], mode: 'title', tpl: 'coc6-san', kind: 'apng', fps: 12 },
    { id: 'apng-opening', f: ['F253'], mode: 'long', tpl: 'opening', kind: 'apng', fps: 12 },
    { id: 'apng-typewriter', f: ['F253'], mode: 'caption', tpl: 'typewriter', kind: 'apng' },
    {
      id: 'apng-full-color',
      f: ['F248'],
      mode: 'title',
      tpl: 'coc7-success',
      kind: 'apng',
      set: { colors: 'full' },
    },
    {
      id: 'apng-no-still',
      f: ['F249'],
      mode: 'title',
      tpl: 'coc7-success',
      kind: 'apng',
      set: { stillFallback: false },
    },
    {
      id: 'apng-autocrop',
      f: ['F250'],
      mode: 'caption',
      tpl: 'place-time',
      kind: 'apng',
      set: { autoCrop: true },
    },
    {
      id: 'apng-count',
      f: ['F247', 'F244'],
      mode: 'title',
      tpl: 'gen-hit',
      kind: 'apng',
      set: { loop: 'count', loopCount: 3 },
      fps: 60,
    },
    {
      id: 'apng-no-outro',
      f: ['F138', 'F247'],
      mode: 'title',
      tpl: 'gen-success',
      kind: 'apng',
      set: { outroOn: false, loop: 'infinite' },
    },
    { id: 'png-still', f: ['F254'], mode: 'title', tpl: 'coc7-critical', kind: 'png' },
    {
      id: 'png-still-crop',
      f: ['F254', 'F250'],
      mode: 'caption',
      tpl: 'day',
      kind: 'png',
      set: { autoCrop: true },
    },
    { id: 'zip-sequence', f: ['F255'], mode: 'title', tpl: 'coc7-success', kind: 'zip', fps: 12 },
    {
      id: 'zip-sequence-crop',
      f: ['F255', 'F250'],
      mode: 'caption',
      tpl: 'place-time',
      kind: 'zip',
      fps: 12,
      set: { autoCrop: true },
    },
  ];
}
