/* Magic circle Maker — local-first magic circle and signature motion editor.
 * Vanilla JavaScript and Canvas 2D. All image encoders are self-contained.
 */
const PROJECT_VERSION = 2;
const AUTOSAVE_KEY = 'magic-circle-maker-autosave-v2';
const MAX_HISTORY = 60;
const MAX_EDITOR_DPR = 2;
const MAX_EDITOR_PIXELS = 6_000_000;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const dom = {
  canvas: $('#editorCanvas'),
  canvasWrap: $('#canvasWrap'),
  emptyHint: $('#emptyHint'),
  snapBadge: $('#snapBadge'),
  activeToolName: $('#activeToolName'),
  toolHint: $('#toolHint'),
  toolOptions: $('#toolOptions'),
  zoomLabel: $('#zoomLabel'),
  statusMessage: $('#statusMessage'),
  cursorPosition: $('#cursorPosition'),
  selectionStatus: $('#selectionStatus'),
  layerList: $('#layerList'),
  alignmentPanel: $('#alignmentPanel'),
  alignmentReference: $('#alignmentReference'),
  alignmentSelectionCount: $('#alignmentSelectionCount'),
  alignmentHelp: $('#alignmentHelp'),
  alignmentLiveStatus: $('#alignmentLiveStatus'),
  timelinePanel: $('#timelinePanel'),
  timelineScroll: $('#timelineScroll'),
  timelineRuler: $('#timelineRuler'),
  timelineTracks: $('#timelineTracks'),
  timeReadout: $('#timeReadout'),
  playBtn: $('#playBtn'),
  exportDialog: $('#exportDialog'),
  helpDialog: $('#helpDialog'),
  licensesDialog: $('#licensesDialog'),
  modalBackdrop: $('#modalBackdrop'),
  exportPreview: $('#exportPreview'),
  exportPreviewLabel: $('#exportPreviewLabel'),
  exportProgressArea: $('#exportProgressArea'),
  exportProgress: $('#exportProgress'),
  exportProgressTitle: $('#exportProgressTitle'),
  exportProgressText: $('#exportProgressText'),
  exportSizeReadout: $('#exportSizeReadout'),
  toastRegion: $('#toastRegion')
};

const ctx = dom.canvas.getContext('2d', { alpha: true, desynchronized: true });

const TOOL_META = {
  select: { cursor: 'default' },
  pen: { cursor: 'crosshair' },
  freehand: { cursor: 'crosshair' },
  line: { cursor: 'crosshair' },
  circle: { cursor: 'crosshair' },
  polygon: { cursor: 'crosshair' },
  star: { cursor: 'crosshair' },
  text: { cursor: 'text' },
  pan: { cursor: 'grab' }
};
const toolName = tool => T(`tool.${tool}.name`);
const toolHint = tool => T(`tool.${tool}.hint`);

const RUNE_SETS = {
  elder: {
    runes: [
      ['ᚠ', 'f', 'Fehu'], ['ᚢ', 'u', 'Uruz'], ['ᚦ', 'th', 'Thurisaz'], ['ᚨ', 'a', 'Ansuz'],
      ['ᚱ', 'r', 'Raidho'], ['ᚲ', 'k', 'Kenaz'], ['ᚷ', 'g', 'Gebo'], ['ᚹ', 'w', 'Wunjo'],
      ['ᚺ', 'h', 'Hagalaz'], ['ᚾ', 'n', 'Nauthiz'], ['ᛁ', 'i', 'Isa'], ['ᛃ', 'j/y', 'Jera'],
      ['ᛇ', 'ei', 'Eihwaz'], ['ᛈ', 'p', 'Perthro'], ['ᛉ', 'z', 'Algiz'], ['ᛊ', 's', 'Sowilo'],
      ['ᛏ', 't', 'Tiwaz'], ['ᛒ', 'b', 'Berkano'], ['ᛖ', 'e', 'Ehwaz'], ['ᛗ', 'm', 'Mannaz'],
      ['ᛚ', 'l', 'Laguz'], ['ᛜ', 'ng', 'Ingwaz'], ['ᛞ', 'd', 'Dagaz'], ['ᛟ', 'o', 'Othala']
    ],
    map: {
      th: 'ᚦ', ng: 'ᛜ', ei: 'ᛇ', f: 'ᚠ', v: 'ᚠ', u: 'ᚢ', a: 'ᚨ', r: 'ᚱ', k: 'ᚲ', c: 'ᚲ', q: 'ᚲᚹ',
      g: 'ᚷ', w: 'ᚹ', h: 'ᚺ', n: 'ᚾ', i: 'ᛁ', j: 'ᛃ', y: 'ᛃ', p: 'ᛈ', z: 'ᛉ', s: 'ᛊ', x: 'ᚲᛊ',
      t: 'ᛏ', b: 'ᛒ', e: 'ᛖ', m: 'ᛗ', l: 'ᛚ', d: 'ᛞ', o: 'ᛟ'
    }
  },
  younger: {
    runes: [
      ['ᚠ', 'f/v', 'Fé'], ['ᚢ', 'u/w', 'Úr'], ['ᚦ', 'th', 'Þurs'], ['ᚬ', 'o', 'Óss'],
      ['ᚱ', 'r', 'Reið'], ['ᚴ', 'k/g', 'Kaun'], ['ᚼ', 'h', 'Hagall'], ['ᚾ', 'n', 'Nauðr'],
      ['ᛁ', 'i/e', 'Íss'], ['ᛅ', 'a', 'Ár'], ['ᛋ', 's', 'Sól'], ['ᛏ', 't/d', 'Týr'],
      ['ᛒ', 'b/p', 'Bjarkan'], ['ᛘ', 'm', 'Maðr'], ['ᛚ', 'l', 'Lögr'], ['ᛦ', 'y/r', 'Ýr']
    ],
    map: {
      th: 'ᚦ', f: 'ᚠ', v: 'ᚠ', u: 'ᚢ', w: 'ᚢ', o: 'ᚬ', r: 'ᚱ', k: 'ᚴ', c: 'ᚴ', q: 'ᚴ', g: 'ᚴ',
      h: 'ᚼ', n: 'ᚾ', i: 'ᛁ', e: 'ᛁ', a: 'ᛅ', s: 'ᛋ', z: 'ᛋ', x: 'ᚴᛋ', t: 'ᛏ', d: 'ᛏ',
      b: 'ᛒ', p: 'ᛒ', m: 'ᛘ', l: 'ᛚ', j: 'ᛦ', y: 'ᛦ'
    }
  },
  futhorc: {
    runes: [
      ['ᚠ', 'f', 'Feoh'], ['ᚢ', 'u', 'Ur'], ['ᚦ', 'th', 'Thorn'], ['ᚩ', 'o', 'Os'],
      ['ᚱ', 'r', 'Rad'], ['ᚳ', 'c/k', 'Cen'], ['ᚷ', 'g', 'Gyfu'], ['ᚹ', 'w', 'Wynn'],
      ['ᚻ', 'h', 'Hægl'], ['ᚾ', 'n', 'Nyd'], ['ᛁ', 'i', 'Is'], ['ᛄ', 'j', 'Ger'],
      ['ᛇ', 'eo', 'Eoh'], ['ᛈ', 'p', 'Peorð'], ['ᛉ', 'x', 'Eolh'], ['ᛋ', 's', 'Sigel'],
      ['ᛏ', 't', 'Tir'], ['ᛒ', 'b', 'Beorc'], ['ᛖ', 'e', 'Eh'], ['ᛗ', 'm', 'Mann'],
      ['ᛚ', 'l', 'Lagu'], ['ᛝ', 'ng', 'Ing'], ['ᛟ', 'oe', 'Ethel'], ['ᛞ', 'd', 'Dæg'],
      ['ᚪ', 'a', 'Ac'], ['ᚫ', 'ae', 'Æsc'], ['ᚣ', 'y', 'Yr'], ['ᛡ', 'io', 'Ior'], ['ᛠ', 'ea', 'Ear']
    ],
    map: {
      th: 'ᚦ', ng: 'ᛝ', eo: 'ᛇ', oe: 'ᛟ', ae: 'ᚫ', io: 'ᛡ', ea: 'ᛠ', f: 'ᚠ', v: 'ᚠ', u: 'ᚢ', o: 'ᚩ',
      r: 'ᚱ', c: 'ᚳ', k: 'ᚳ', q: 'ᚳᚹ', g: 'ᚷ', w: 'ᚹ', h: 'ᚻ', n: 'ᚾ', i: 'ᛁ', j: 'ᛄ', p: 'ᛈ',
      x: 'ᛉ', s: 'ᛋ', z: 'ᛋ', t: 'ᛏ', b: 'ᛒ', e: 'ᛖ', m: 'ᛗ', l: 'ᛚ', d: 'ᛞ', a: 'ᚪ', y: 'ᚣ'
    }
  }
};

for (const [key, runeSet] of Object.entries(RUNE_SETS)) {
  runeSet.key = key;
  runeSet.tokens = Object.keys(runeSet.map).sort((a, b) => b.length - a.length);
}
const runeSetLabel = runeSet => T(`rune.set.${runeSet.key}`);

const MOTION_MODES = ['none', 'draw', 'drawGlow', 'fadeIn', 'fadeOut', 'centerSpread', 'scaleIn', 'spinIn', 'pulse'];
const motionLabel = mode => (MOTION_MODES.includes(mode) ? T(`motion.${mode}`) : String(mode));

const ui = {
  tool: 'select',
  previousTool: 'select',
  zoom: 0.72,
  panX: 0,
  panY: 0,
  dpr: Math.min(window.devicePixelRatio || 1, MAX_EDITOR_DPR),
  canvasCssWidth: 1,
  canvasCssHeight: 1,
  draft: null,
  drag: null,
  hover: null,
  snapPoint: null,
  selectedNode: null,
  playing: false,
  playbackStart: 0,
  playbackOrigin: 0,
  lastPlaybackFrame: -1,
  raf: 0,
  resizeRaf: 0,
  editorRenderRaf: 0,
  inspectorRaf: 0,
  pendingInspectorDocument: false,
  exportPreviewRaf: 0,
  pendingEditorTime: 0,
  timelinePlayheads: [],
  timelineBars: new Map(),
  textSelectionStart: 0,
  textSelectionEnd: 0,
  textSelectionElement: null,
  selectedIds: new Set(),
  selectionPrimaryId: null,
  selectionAnchorId: null,
  selectionProject: null,
  showGuides: true,
  freehandTolerance: 2.2,
  polygonSides: 6,
  starPoints: 5,
  starInner: 0.46,
  fontPreset: 'serif',
  clipboardStyle: null,
  timelineDrag: null,
  exportAbort: false,
  exportBusy: false,
  lastPointer: { x: 0, y: 0 },
  spaceHeld: false,
  autosaveTimer: 0,
  autosaveIdle: 0,
  projectDirty: false
};

let project = createClassicProject();
let history = [];
let future = [];
let transactionSnapshot = null;
const geometryCache = new WeakMap();
const polylineMetricsCache = new WeakMap();
const copyRankCache = new Map();

function uid(prefix = 'el') {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rad(deg) { return deg * Math.PI / 180; }
function deg(radValue) { return radValue * 180 / Math.PI; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function sqrDist(a, b) { const dx = a.x - b.x; const dy = a.y - b.y; return dx * dx + dy * dy; }
function deepClone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function round(value, digits = 2) { const p = 10 ** digits; return Math.round(value * p) / p; }
function nowNameDate() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function safeFilename(name) {
  return String(name || 'arcana').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'arcana';
}
function convertLatinToRunes(value, setKey = 'elder') {
  const runeSet = RUNE_SETS[setKey] || RUNE_SETS.elder;
  const source = String(value ?? '');
  const comparable = source.replace(/[A-Z]/g, character => character.toLowerCase());
  let output = '';
  for (let index = 0; index < source.length;) {
    const token = runeSet.tokens.find(candidate => comparable.startsWith(candidate, index));
    if (token) {
      output += runeSet.map[token];
      index += token.length;
    } else {
      output += source[index];
      index++;
    }
  }
  return output;
}
function parseHexColor(value, fallback = '#ffffff') {
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text) || /^#[0-9a-f]{8}$/i.test(text)) return text.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) return (`#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`).toUpperCase();
  return fallback.toUpperCase();
}
function hexAlpha(hex, alpha = 1) {
  const h = parseHexColor(hex).slice(1, 7);
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function alphaFromHex(hex) {
  const h = String(hex || '');
  return h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1;
}
function colorWithoutAlpha(hex) { return parseHexColor(hex).slice(0, 7); }
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function cubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}
function easeValue(type, t) {
  t = clamp(t, 0, 1);
  switch (type) {
    case 'easeIn': return t * t * t;
    case 'easeOut': return 1 - Math.pow(1 - t, 3);
    case 'easeInOut': return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'overshoot': {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    default: return t;
  }
}
function formatTime(seconds) { return `${Number(seconds).toFixed(2)}${T('unit.sec')}`; }
function nextFrame() { return new Promise(resolve => requestAnimationFrame(resolve)); }

function defaultStyle(overrides = {}) {
  return {
    stroke: '#77D9FF',
    strokeWidth: 5,
    fillEnabled: false,
    fill: '#6F5BFF44',
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    dash: [],
    shadowColor: '#1C68FF',
    shadowBlur: 6,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    glowEnabled: true,
    glowColor: '#64DDFF',
    glowBlur: 24,
    glowStrength: 1.15,
    blendMode: 'screen',
    ...overrides
  };
}

function defaultAnimation(overrides = {}) {
  return {
    mode: 'draw',
    start: 0,
    duration: 1.2,
    easing: 'easeInOut',
    direction: 'forward',
    copyStagger: 0,
    copyOrder: 'clockwise',
    holdAfter: true,
    ...overrides
  };
}

function pathPoint(x, y, inPoint = null, outPoint = null, smooth = false) {
  return {
    x, y,
    inX: inPoint ? inPoint.x : x,
    inY: inPoint ? inPoint.y : y,
    outX: outPoint ? outPoint.x : x,
    outY: outPoint ? outPoint.y : y,
    smooth
  };
}

function createPathElement(points, options = {}) {
  return {
    id: uid('path'),
    name: options.name || T('name.path'),
    type: 'path',
    visible: true,
    locked: false,
    symmetry: options.symmetry ?? true,
    closed: options.closed ?? false,
    points: points.map(p => ({ ...p })),
    style: defaultStyle(options.style),
    animation: defaultAnimation(options.animation)
  };
}

function createCircleElement(x, y, rx, ry = rx, options = {}) {
  return {
    id: uid('circle'),
    name: options.name || T('name.circle'),
    type: 'circle',
    visible: true,
    locked: false,
    symmetry: options.symmetry ?? false,
    x, y, rx, ry,
    rotation: options.rotation || 0,
    style: defaultStyle(options.style),
    animation: defaultAnimation(options.animation)
  };
}

function createTextElement(x, y, text = 'ᚱ', options = {}) {
  return {
    id: uid('text'),
    name: options.name || T('name.text'),
    type: 'text',
    visible: true,
    locked: false,
    symmetry: options.symmetry ?? true,
    x, y, text,
    fontSize: options.fontSize || 54,
    fontFamily: options.fontFamily || 'serif',
    textAlign: options.textAlign || 'center',
    rotation: options.rotation || 0,
    style: defaultStyle({ fillEnabled: true, fill: '#A5F0FF', strokeWidth: 1.5, ...options.style }),
    animation: defaultAnimation({ mode: 'fadeIn', ...options.animation })
  };
}

function regularPolygonPoints(cx, cy, radius, sides, rotation = -Math.PI / 2) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + i * Math.PI * 2 / sides;
    points.push(pathPoint(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius));
  }
  return points;
}

function starPoints(cx, cy, outer, inner, count, rotation = -Math.PI / 2) {
  const points = [];
  for (let i = 0; i < count * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + i * Math.PI / count;
    points.push(pathPoint(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return points;
}

function baseProject(name = T('name.newProject'), width = 1000, height = 1000) {
  return {
    version: PROJECT_VERSION,
    document: { name, width, height, background: '#070A17', transparent: false },
    symmetry: { enabled: true, count: 8, mirror: false, centerX: width / 2, centerY: height / 2, offset: 0 },
    snap: { enabled: true, grid: true, gridSize: 25, center: true, radial: true, angles: true, angleStep: 15, threshold: 11 },
    animation: { duration: 4, fps: 24, loop: true, playhead: 4 },
    elements: [],
    selectedId: null
  };
}

function createClassicProject() {
  const p = baseProject(T('name.classicProject'), 1000, 1000);
  p.symmetry.count = 12;
  const c = { x: 500, y: 500 };
  const outer = createCircleElement(c.x, c.y, 378, 378, {
    name: T('name.classic.outerRing'), symmetry: false,
    style: { stroke: '#79E7FF', strokeWidth: 8, glowBlur: 34, glowStrength: 1.35 },
    animation: { mode: 'drawGlow', start: 0, duration: 1.15 }
  });
  const outer2 = createCircleElement(c.x, c.y, 354, 354, {
    name: T('name.classic.outerGuide'), symmetry: false,
    style: { stroke: '#7E7CFF', strokeWidth: 2.5, glowColor: '#7E7CFF', glowBlur: 18, dash: [13, 8] },
    animation: { mode: 'draw', start: .18, duration: 1.25 }
  });
  const inner = createCircleElement(c.x, c.y, 255, 255, {
    name: T('name.classic.innerRing'), symmetry: false,
    style: { stroke: '#C7B4FF', strokeWidth: 4, glowColor: '#9E83FF', glowBlur: 22 },
    animation: { mode: 'centerSpread', start: .45, duration: .85 }
  });
  const star = createPathElement(starPoints(c.x, c.y, 246, 96, 6), {
    name: T('name.classic.hexagram'), symmetry: false, closed: true,
    style: { stroke: '#8CEBFF', strokeWidth: 5, glowBlur: 26, fillEnabled: true, fill: '#5E4FFF12' },
    animation: { mode: 'drawGlow', start: .72, duration: 1.3 }
  });
  const spoke = createPathElement([
    pathPoint(500, 170), pathPoint(500, 128), pathPoint(520, 146), pathPoint(500, 95), pathPoint(480, 146), pathPoint(500, 128)
  ], {
    name: T('name.classic.radialRunes'), symmetry: true, closed: false,
    style: { stroke: '#B8F3FF', strokeWidth: 4, glowBlur: 20 },
    animation: { mode: 'drawGlow', start: 1.05, duration: .75, copyStagger: .055 }
  });
  const node = createCircleElement(500, 130, 7, 7, {
    name: T('name.classic.radialGems'), symmetry: true,
    style: { stroke: '#FFFFFF', strokeWidth: 2, fillEnabled: true, fill: '#7FEAFF', glowBlur: 28, glowStrength: 1.9 },
    animation: { mode: 'scaleIn', start: 1.25, duration: .45, copyStagger: .045 }
  });
  const center = createCircleElement(c.x, c.y, 48, 48, {
    name: T('name.classic.core'), symmetry: false,
    style: { stroke: '#FFFFFF', strokeWidth: 3, fillEnabled: true, fill: '#8C76FF44', glowColor: '#9B83FF', glowBlur: 44, glowStrength: 2 },
    animation: { mode: 'pulse', start: 1.8, duration: 1.2 }
  });
  p.elements = [outer, outer2, inner, star, spoke, node, center];
  p.selectedId = spoke.id;
  return p;
}

function createRuneProject() {
  const p = baseProject(T('name.runeProject'), 1000, 1000);
  p.document.background = '#100711';
  p.symmetry.count = 10;
  const colors = { stroke: '#FF9EEA', glowColor: '#FF58D0', shadowColor: '#C52E9E' };
  p.elements.push(
    createCircleElement(500, 500, 388, 388, { name: T('name.rune.outerCircle'), style: { ...colors, strokeWidth: 7, glowBlur: 34 }, animation: { mode: 'drawGlow', start: 0, duration: 1 } }),
    createCircleElement(500, 500, 308, 308, { name: T('name.rune.runeCircle'), style: { ...colors, strokeWidth: 3, glowBlur: 18, dash: [4, 10] }, animation: { mode: 'draw', start: .25, duration: 1.2 } }),
    createPathElement(regularPolygonPoints(500, 500, 292, 5), { name: T('name.rune.pentagon'), symmetry: false, closed: true, style: { ...colors, strokeWidth: 5, fillEnabled: true, fill: '#E945C010' }, animation: { mode: 'drawGlow', start: .65, duration: 1.3 } }),
    createTextElement(500, 162, 'ᛟ', { name: T('name.rune.glyph'), symmetry: true, fontSize: 52, style: { ...colors, fill: '#FFD4F6', stroke: '#FFD4F6' }, animation: { mode: 'fadeIn', start: 1.15, duration: .55, copyStagger: .08 } }),
    createCircleElement(500, 500, 74, 74, { name: T('name.rune.core'), style: { ...colors, strokeWidth: 3, fillEnabled: true, fill: '#FF64D944', glowBlur: 55, glowStrength: 2.1 }, animation: { mode: 'pulse', start: 1.9, duration: 1 } })
  );
  p.selectedId = p.elements[3].id;
  return p;
}

function createSigilProject() {
  const p = baseProject(T('name.sigilProject'), 1200, 600);
  p.document.transparent = true;
  p.document.background = '#0B0D18';
  p.symmetry.enabled = false;
  p.symmetry.count = 1;
  p.snap.grid = false;
  p.snap.radial = false;
  p.snap.angles = false;
  p.animation.duration = 3;
  p.animation.playhead = 3;
  const points = [
    pathPoint(185, 365), pathPoint(310, 180), pathPoint(410, 390), pathPoint(510, 215),
    pathPoint(620, 390), pathPoint(730, 190), pathPoint(820, 355), pathPoint(1015, 250)
  ];
  const smooth = catmullRomAnchors(points.map(p => ({ x: p.x, y: p.y })), false, .9);
  p.elements.push(createPathElement(smooth, {
    name: T('name.sigil.stroke'), symmetry: false,
    style: { stroke: '#F4F6FF', strokeWidth: 16, lineCap: 'round', lineJoin: 'round', glowColor: '#8774FF', glowBlur: 34, glowStrength: 1.7, shadowColor: '#442BB8', shadowBlur: 8, blendMode: 'screen' },
    animation: { mode: 'drawGlow', start: .15, duration: 2.15, easing: 'easeInOut' }
  }));
  p.selectedId = p.elements[0].id;
  return p;
}

function migrateProject(raw) {
  if (!raw || typeof raw !== 'object') throw new Error(T('msg.invalidProject'));
  const migrated = deepClone(raw);
  migrated.version = PROJECT_VERSION;
  migrated.document ||= { name: T('name.loadedProject'), width: 1000, height: 1000, background: '#070A17', transparent: false };
  migrated.document.width = clamp(Number(migrated.document.width) || 1000, 64, 4096);
  migrated.document.height = clamp(Number(migrated.document.height) || 1000, 64, 4096);
  migrated.document.name ||= T('name.loadedProject');
  migrated.document.background = parseHexColor(migrated.document.background || '#070A17').slice(0, 7);
  migrated.document.transparent = Boolean(migrated.document.transparent);
  migrated.symmetry = { enabled: true, count: 8, mirror: false, centerX: migrated.document.width / 2, centerY: migrated.document.height / 2, offset: 0, ...(migrated.symmetry || {}) };
  migrated.snap = { enabled: true, grid: true, gridSize: 25, center: true, radial: true, angles: true, angleStep: 15, threshold: 11, ...(migrated.snap || {}) };
  migrated.animation = { duration: 4, fps: 24, loop: true, playhead: 0, ...(migrated.animation || {}) };
  migrated.elements = Array.isArray(migrated.elements) ? migrated.elements : [];
  for (const el of migrated.elements) {
    el.id ||= uid(el.type || 'el');
    el.name ||= el.type === 'circle' ? T('name.circle') : el.type === 'text' ? T('name.textShort') : T('name.path');
    el.visible = el.visible !== false;
    el.locked = Boolean(el.locked);
    el.symmetry = el.symmetry !== false;
    el.style = defaultStyle(el.style || {});
    el.animation = defaultAnimation(el.animation || {});
    if (el.type === 'path') {
      el.closed = Boolean(el.closed);
      el.points = (el.points || []).map(p => pathPoint(
        Number(p.x) || 0, Number(p.y) || 0,
        { x: Number.isFinite(p.inX) ? p.inX : Number(p.x) || 0, y: Number.isFinite(p.inY) ? p.inY : Number(p.y) || 0 },
        { x: Number.isFinite(p.outX) ? p.outX : Number(p.x) || 0, y: Number.isFinite(p.outY) ? p.outY : Number(p.y) || 0 },
        Boolean(p.smooth)
      ));
    }
  }
  migrated.selectedId = migrated.elements.some(el => el.id === migrated.selectedId) ? migrated.selectedId : migrated.elements.at(-1)?.id || null;
  return migrated;
}

function reconcileElementSelection() {
  const validIds = new Set(project.elements.map(el => el.id));
  const primaryIsValid = project.selectedId != null && validIds.has(project.selectedId);
  if (!primaryIsValid) project.selectedId = null;
  if (ui.selectionProject !== project || ui.selectionPrimaryId !== project.selectedId) {
    ui.selectedIds = new Set(project.selectedId ? [project.selectedId] : []);
    ui.selectionAnchorId = project.selectedId;
  } else {
    for (const id of ui.selectedIds) if (!validIds.has(id)) ui.selectedIds.delete(id);
    if (project.selectedId) ui.selectedIds.add(project.selectedId);
  }
  if (ui.selectionAnchorId && !validIds.has(ui.selectionAnchorId)) ui.selectionAnchorId = project.selectedId;
  ui.selectionProject = project;
  ui.selectionPrimaryId = project.selectedId;
  return ui.selectedIds;
}

function setElementSelection(ids, primaryId = null, anchorId = primaryId) {
  const validIds = new Set(project.elements.map(el => el.id));
  ui.selectedIds = new Set([...ids].filter(id => validIds.has(id)));
  project.selectedId = primaryId && ui.selectedIds.has(primaryId) ? primaryId : [...ui.selectedIds].at(-1) || null;
  ui.selectionPrimaryId = project.selectedId;
  ui.selectionAnchorId = anchorId && validIds.has(anchorId) ? anchorId : project.selectedId;
  ui.selectionProject = project;
}

function selectedElement() { return project.elements.find(el => el.id === project.selectedId) || null; }
function selectedIndex() { return project.elements.findIndex(el => el.id === project.selectedId); }
function selectedElements() {
  const ids = reconcileElementSelection();
  return project.elements.filter(el => ids.has(el.id));
}
function movableSelectedElements() { return selectedElements().filter(el => !el.locked); }

function clearElementSelection(render = true) {
  setElementSelection([], null, null);
  ui.selectedNode = null;
  if (render) refreshAll();
}

function selectAllVisibleElements() {
  const elements = project.elements.filter(el => el.visible && !el.locked && isLayoutElement(el));
  if (!elements.length) { toast(T('msg.noSelectableElements')); return; }
  const current = selectedElement();
  const primary = current && elements.includes(current) ? current.id : elements.at(-1).id;
  setElementSelection(elements.map(el => el.id), primary, primary);
  ui.selectedNode = null;
  refreshAll();
  toast(T('msg.selectedAll', elements.length), 'success');
}

function setDirty() {
  ui.projectDirty = true;
  clearTimeout(ui.autosaveTimer);
  if (ui.autosaveIdle && typeof cancelIdleCallback === 'function') cancelIdleCallback(ui.autosaveIdle);
  ui.autosaveTimer = setTimeout(() => {
    const save = () => {
      ui.autosaveIdle = 0;
      try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project)); } catch (error) { console.warn('Autosave failed', error); }
    };
    if (typeof requestIdleCallback === 'function') ui.autosaveIdle = requestIdleCallback(save, { timeout: 1000 });
    else save();
  }, 450);
}

function snapshotProject() { return JSON.stringify(project); }
function beginTransaction() { if (!transactionSnapshot) transactionSnapshot = snapshotProject(); }
function commitTransaction({ renderAll = true } = {}) {
  if (transactionSnapshot && transactionSnapshot !== snapshotProject()) {
    history.push(transactionSnapshot);
    if (history.length > MAX_HISTORY) history.shift();
    future.length = 0;
    setDirty();
  }
  transactionSnapshot = null;
  if (renderAll) refreshAll();
  updateUndoRedoButtons();
}
function cancelTransaction() { transactionSnapshot = null; }
function pushHistory() {
  history.push(snapshotProject());
  if (history.length > MAX_HISTORY) history.shift();
  future.length = 0;
  setDirty();
  updateUndoRedoButtons();
}
function undo() {
  if (!history.length) return;
  future.push(snapshotProject());
  project = migrateProject(JSON.parse(history.pop()));
  ui.draft = null; ui.drag = null; ui.selectedNode = null;
  setDirty(); refreshAll(); updateUndoRedoButtons(); toast(T('msg.undone'));
}
function redo() {
  if (!future.length) return;
  history.push(snapshotProject());
  project = migrateProject(JSON.parse(future.pop()));
  ui.draft = null; ui.drag = null; ui.selectedNode = null;
  setDirty(); refreshAll(); updateUndoRedoButtons(); toast(T('msg.redone'));
}
function updateUndoRedoButtons() {
  $('#undoBtn').disabled = history.length === 0;
  $('#redoBtn').disabled = future.length === 0;
}

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  dom.toastRegion.append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(7px)'; el.style.transition = '.2s'; }, 2600);
  setTimeout(() => el.remove(), 2850);
}
function status(message) { dom.statusMessage.textContent = message; }

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------- Geometry and rendering ----------

function catmullRomAnchors(points, closed = false, tension = 1) {
  if (points.length < 2) return points.map(p => pathPoint(p.x, p.y));
  const result = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const current = points[i];
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const factor = tension / 6;
    const dx = (next.x - prev.x) * factor;
    const dy = (next.y - prev.y) * factor;
    const inPoint = i === 0 && !closed ? current : { x: current.x - dx, y: current.y - dy };
    const outPoint = i === n - 1 && !closed ? current : { x: current.x + dx, y: current.y + dy };
    result.push(pathPoint(current.x, current.y, inPoint, outPoint, true));
  }
  return result;
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (dx === 0 && dy === 0) return dist(point, lineStart);
  const t = clamp(((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return dist(point, { x: lineStart.x + t * dx, y: lineStart.y + t * dy });
}

function simplifyRDP(points, epsilon) {
  if (points.length < 3) return points.slice();
  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDistance) { index = i; maxDistance = d; }
  }
  if (maxDistance > epsilon) {
    const left = simplifyRDP(points.slice(0, index + 1), epsilon);
    const right = simplifyRDP(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function buildPath2D(el) {
  const path = new Path2D();
  if (el.type === 'path') {
    const points = el.points;
    if (!points.length) return path;
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], next = points[i];
      path.bezierCurveTo(prev.outX, prev.outY, next.inX, next.inY, next.x, next.y);
    }
    if (el.closed && points.length > 1) {
      const last = points.at(-1), first = points[0];
      path.bezierCurveTo(last.outX, last.outY, first.inX, first.inY, first.x, first.y);
      path.closePath();
    }
  } else if (el.type === 'circle') {
    path.ellipse(el.x, el.y, Math.abs(el.rx), Math.abs(el.ry), el.rotation || 0, 0, Math.PI * 2);
    path.closePath();
  }
  return path;
}

function flattenElement(el, quality = 1) {
  const points = [];
  let closed = false;
  if (el.type === 'path') {
    if (!el.points.length) return { points, closed: false };
    points.push({ x: el.points[0].x, y: el.points[0].y });
    const segmentCount = el.points.length - 1 + (el.closed ? 1 : 0);
    for (let seg = 0; seg < segmentCount; seg++) {
      const a = el.points[seg % el.points.length];
      const b = el.points[(seg + 1) % el.points.length];
      const chord = dist(a, b);
      const controlLength = dist(a, { x: a.outX, y: a.outY }) + dist(b, { x: b.inX, y: b.inY });
      const samples = clamp(Math.ceil((chord + controlLength) / (12 / quality)), 8, 70);
      for (let i = 1; i <= samples; i++) {
        points.push(cubicBezierPoint(a, { x: a.outX, y: a.outY }, { x: b.inX, y: b.inY }, b, i / samples));
      }
    }
    closed = Boolean(el.closed);
  } else if (el.type === 'circle') {
    const samples = clamp(Math.ceil(Math.max(el.rx, el.ry) * .55 * quality), 72, 240);
    const cosR = Math.cos(el.rotation || 0), sinR = Math.sin(el.rotation || 0);
    for (let i = 0; i <= samples; i++) {
      const a = i / samples * Math.PI * 2;
      const ex = Math.cos(a) * el.rx, ey = Math.sin(a) * el.ry;
      points.push({ x: el.x + ex * cosR - ey * sinR, y: el.y + ex * sinR + ey * cosR });
    }
    closed = true;
  }
  return { points, closed };
}

function invalidateElementGeometry(el) {
  if (el && typeof el === 'object') geometryCache.delete(el);
}

function geometryCacheEntry(el) {
  let cache = geometryCache.get(el);
  if (!cache) {
    cache = { flats: new Map() };
    geometryCache.set(el, cache);
  }
  return cache;
}

function cachedPath2D(el) {
  const cache = geometryCacheEntry(el);
  if (!cache.path) cache.path = buildPath2D(el);
  return cache.path;
}

function cachedFlattenElement(el, quality = 1) {
  const cache = geometryCacheEntry(el);
  if (!cache.flats.has(quality)) cache.flats.set(quality, flattenElement(el, quality));
  return cache.flats.get(quality);
}

function cachedTextLayout(el) {
  const cache = geometryCacheEntry(el);
  if (!cache.textLayout) {
    const fontSize = Math.max(4, Number(el.fontSize) || 54);
    cache.textLayout = {
      fontSize,
      font: `${fontSize}px ${el.fontFamily || 'serif'}`,
      lines: String(el.text ?? '').split(/\r\n?|\n/),
      lineHeight: fontSize * 1.2
    };
  }
  return cache.textLayout;
}

function pathLengthData(points) {
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1], points[i]);
    lengths.push(total);
  }
  return { lengths, total };
}

function polylineMetrics(points, reverse = false) {
  let cache = polylineMetricsCache.get(points);
  if (!cache) {
    cache = {};
    polylineMetricsCache.set(points, cache);
  }
  const key = reverse ? 'reverse' : 'forward';
  if (!cache[key]) {
    const source = reverse ? points.slice().reverse() : points;
    cache[key] = { source, ...pathLengthData(source) };
  }
  return cache[key];
}

function partialPolyline(points, progress, reverse = false) {
  if (!points.length) return [];
  const { source, lengths, total } = polylineMetrics(points, reverse);
  if (total <= 0 || progress >= 1) return source;
  if (progress <= 0) return [source[0]];
  const target = total * progress;
  const out = [source[0]];
  for (let i = 1; i < source.length; i++) {
    if (lengths[i] <= target) {
      out.push(source[i]);
      continue;
    }
    const segmentStart = lengths[i - 1];
    const segmentLength = lengths[i] - segmentStart;
    const t = segmentLength ? (target - segmentStart) / segmentLength : 0;
    out.push({ x: lerp(source[i - 1].x, source[i].x, t), y: lerp(source[i - 1].y, source[i].y, t) });
    break;
  }
  return out;
}

function drawPolyline(targetCtx, points, close = false) {
  if (!points.length) return;
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) targetCtx.lineTo(points[i].x, points[i].y);
  if (close) targetCtx.closePath();
}

function rotatePointAround(point, center, angle) {
  if (!angle) return { x: point.x, y: point.y };
  const x = point.x - center.x, y = point.y - center.y;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return { x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine };
}

function textElementUnrotatedBounds(el) {
  const cache = geometryCacheEntry(el);
  if (cache.textBounds) return cache.textBounds;
  const { fontSize, font, lines, lineHeight } = cachedTextLayout(el);
  const align = el.textAlign || 'center';
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  lines.forEach((line, index) => {
    const metrics = ctx.measureText(line || ' ');
    const width = metrics.width;
    const fallbackLeft = align === 'right' ? width : align === 'center' ? width / 2 : 0;
    const fallbackRight = align === 'left' ? width : align === 'center' ? width / 2 : 0;
    const measuredLeft = Number(metrics.actualBoundingBoxLeft);
    const measuredRight = Number(metrics.actualBoundingBoxRight);
    const left = Number.isFinite(measuredLeft) ? measuredLeft : fallbackLeft;
    const right = Number.isFinite(measuredRight) ? measuredRight : fallbackRight;
    const ascent = Math.max(fontSize * .8, Number(metrics.actualBoundingBoxAscent) || 0);
    const descent = Math.max(fontSize * .2, Number(metrics.actualBoundingBoxDescent) || 0);
    const baseline = index * lineHeight;
    minX = Math.min(minX, -left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, baseline - ascent);
    maxY = Math.max(maxY, baseline + descent);
  });
  ctx.restore();
  const minimumWidth = fontSize * .35;
  if (maxX - minX < minimumWidth) {
    if (align === 'left') maxX = minX + minimumWidth;
    else if (align === 'right') minX = maxX - minimumWidth;
    else {
      const center = (minX + maxX) / 2;
      minX = center - minimumWidth / 2;
      maxX = center + minimumWidth / 2;
    }
  }
  const strokePadding = Math.max(0, Number(el.style?.strokeWidth) || 0) / 2;
  cache.textBounds = {
    minX: el.x + minX - strokePadding,
    minY: el.y + minY - strokePadding,
    maxX: el.x + maxX + strokePadding,
    maxY: el.y + maxY + strokePadding
  };
  return cache.textBounds;
}

function elementBounds(el) {
  const cache = geometryCacheEntry(el);
  if (cache.bounds) return cache.bounds;
  let bounds;
  if (el.type === 'text') {
    const base = textElementUnrotatedBounds(el);
    const rotation = Number(el.rotation) || 0;
    if (!rotation) bounds = base;
    else {
      const corners = [
        { x: base.minX, y: base.minY }, { x: base.maxX, y: base.minY },
        { x: base.maxX, y: base.maxY }, { x: base.minX, y: base.maxY }
      ].map(point => rotatePointAround(point, el, rotation));
      bounds = {
        minX: Math.min(...corners.map(point => point.x)),
        minY: Math.min(...corners.map(point => point.y)),
        maxX: Math.max(...corners.map(point => point.x)),
        maxY: Math.max(...corners.map(point => point.y))
      };
    }
  } else {
    const flat = cachedFlattenElement(el, .65).points;
    if (!flat.length) bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    else {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of flat) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
      bounds = { minX, minY, maxX, maxY };
    }
  }
  cache.bounds = bounds;
  return bounds;
}

function elementCenter(el) {
  if (el.type === 'circle' || el.type === 'text') return { x: el.x, y: el.y };
  const b = elementBounds(el);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

function moveElement(el, dx, dy) {
  if (el.type === 'path') {
    for (const p of el.points) {
      p.x += dx; p.y += dy; p.inX += dx; p.inY += dy; p.outX += dx; p.outY += dy;
    }
  } else if (el.type === 'circle' || el.type === 'text') {
    el.x += dx; el.y += dy;
  }
  invalidateElementGeometry(el);
}

function boundsCenterPoint(bounds) {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

function unionBounds(boundsList) {
  const valid = boundsList.filter(bounds => bounds && [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite));
  if (!valid.length) return null;
  return {
    minX: Math.min(...valid.map(bounds => bounds.minX)),
    minY: Math.min(...valid.map(bounds => bounds.minY)),
    maxX: Math.max(...valid.map(bounds => bounds.maxX)),
    maxY: Math.max(...valid.map(bounds => bounds.maxY))
  };
}

function alignBoundsDelta(bounds, referenceBounds, mode) {
  const center = boundsCenterPoint(bounds);
  const referenceCenter = boundsCenterPoint(referenceBounds);
  if (mode === 'left') return { dx: referenceBounds.minX - bounds.minX, dy: 0 };
  if (mode === 'center-x') return { dx: referenceCenter.x - center.x, dy: 0 };
  if (mode === 'right') return { dx: referenceBounds.maxX - bounds.maxX, dy: 0 };
  if (mode === 'top') return { dx: 0, dy: referenceBounds.minY - bounds.minY };
  if (mode === 'center-y') return { dx: 0, dy: referenceCenter.y - center.y };
  if (mode === 'bottom') return { dx: 0, dy: referenceBounds.maxY - bounds.maxY };
  return { dx: 0, dy: 0 };
}

function distributeBounds(items, axis) {
  const horizontal = axis === 'x';
  const minKey = horizontal ? 'minX' : 'minY';
  const maxKey = horizontal ? 'maxX' : 'maxY';
  const valid = items.filter(item => item?.bounds && Number.isFinite(item.bounds[minKey]) && Number.isFinite(item.bounds[maxKey]));
  if (valid.length < 3) return [];
  const ordered = valid.slice().sort((a, b) => {
    const centerA = (a.bounds[minKey] + a.bounds[maxKey]) / 2;
    const centerB = (b.bounds[minKey] + b.bounds[maxKey]) / 2;
    return centerA - centerB || (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id));
  });
  const start = ordered[0].bounds[minKey];
  const end = ordered.at(-1).bounds[maxKey];
  const totalSize = ordered.reduce((sum, item) => sum + item.bounds[maxKey] - item.bounds[minKey], 0);
  const gap = (end - start - totalSize) / (ordered.length - 1);
  let cursor = start;
  return ordered.map(item => {
    const delta = cursor - item.bounds[minKey];
    cursor += item.bounds[maxKey] - item.bounds[minKey] + gap;
    return { id: item.id, delta };
  });
}

function normalizeRadians(value) {
  const fullTurn = Math.PI * 2;
  return ((value % fullTurn) + fullTurn) % fullTurn;
}

function nearestSymmetryAngle(angle, baseAngle, count, sectorCenter = false) {
  const step = Math.PI * 2 / Math.max(1, Math.round(count) || 1);
  const relative = (angle - baseAngle) / step;
  return baseAngle + (sectorCenter ? Math.floor(relative) + .5 : Math.round(relative)) * step;
}

function distributePolarAngles(items) {
  if (items.length < 3) return [];
  const sorted = items.map(item => ({ ...item, angle: normalizeRadians(item.angle) }))
    .sort((a, b) => a.angle - b.angle || (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));
  let largestGap = -1;
  let cutIndex = 0;
  for (let index = 0; index < sorted.length; index++) {
    const next = index === sorted.length - 1 ? sorted[0].angle + Math.PI * 2 : sorted[index + 1].angle;
    const gap = next - sorted[index].angle;
    if (gap > largestGap) { largestGap = gap; cutIndex = (index + 1) % sorted.length; }
  }
  const ordered = [];
  for (let offset = 0; offset < sorted.length; offset++) {
    const item = sorted[(cutIndex + offset) % sorted.length];
    let angle = item.angle;
    if (ordered.length && angle < ordered.at(-1).angle) angle += Math.PI * 2;
    ordered.push({ ...item, angle });
  }
  const first = ordered[0].angle;
  const step = (ordered.at(-1).angle - first) / (ordered.length - 1);
  return ordered.map((item, index) => ({ id: item.id, angle: first + step * index }));
}

function distributePolarRadii(items) {
  if (items.length < 3) return [];
  const ordered = items.slice().sort((a, b) => a.radius - b.radius || (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));
  const first = ordered[0].radius;
  const step = (ordered.at(-1).radius - first) / (ordered.length - 1);
  return ordered.map((item, index) => ({ id: item.id, radius: first + step * index }));
}

function copyCountFor(el) {
  return project.symmetry.enabled && el.symmetry ? clamp(Math.round(project.symmetry.count), 1, 64) : 1;
}

function copyAngle(index, count) {
  return rad(project.symmetry.offset || 0) + index * Math.PI * 2 / count;
}

function copySequenceRank(index, count, order, seedText) {
  if (count <= 1) return 0;
  if (order === 'counter') return (count - index) % count;
  if (order !== 'alternate' && order !== 'random') return index;
  const key = `${seedText}:${count}:${order}`;
  let ranks = copyRankCache.get(key);
  if (!ranks) {
    let sequence;
    if (order === 'alternate') {
      sequence = [0];
      for (let step = 1; sequence.length < count; step++) {
        if (step < count) sequence.push(step);
        if (sequence.length < count && count - step !== step) sequence.push(count - step);
      }
    } else {
      sequence = Array.from({ length: count }, (_, i) => i);
      const random = mulberry32(hashString(seedText));
      for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
      }
    }
    ranks = new Uint8Array(count);
    sequence.forEach((copyIndex, rank) => { ranks[copyIndex] = rank; });
    if (copyRankCache.size > 2048) copyRankCache.clear();
    copyRankCache.set(key, ranks);
  }
  return ranks[index];
}

function transformPointForCopy(point, index, count) {
  if (count === 1 && index === 0) return { x: point.x, y: point.y };
  const cx = project.symmetry.centerX, cy = project.symmetry.centerY;
  let x = point.x - cx, y = point.y - cy;
  if (project.symmetry.mirror && index % 2 === 1) x = -x;
  const a = copyAngle(index, count), c = Math.cos(a), s = Math.sin(a);
  return { x: cx + x * c - y * s, y: cy + x * s + y * c };
}

function applyCopyTransform(targetCtx, index, count) {
  if (count === 1 && index === 0) return;
  const cx = project.symmetry.centerX, cy = project.symmetry.centerY;
  targetCtx.translate(cx, cy);
  targetCtx.rotate(copyAngle(index, count));
  if (project.symmetry.mirror && index % 2 === 1) targetCtx.scale(-1, 1);
  targetCtx.translate(-cx, -cy);
}

function animationState(el, time, copyIndex, count) {
  const a = el.animation || defaultAnimation();
  if (a.mode === 'none') return { visible: true, alpha: 1, draw: 1, clip: 1, scale: 1, rotation: 0, glow: 1 };
  const rank = copySequenceRank(copyIndex, count, a.copyOrder, el.id);
  const localStart = Number(a.start) + rank * Number(a.copyStagger || 0);
  const duration = Math.max(.001, Number(a.duration) || 1);
  const raw = (time - localStart) / duration;

  if (a.mode === 'fadeOut') {
    if (raw < 0) return { visible: true, alpha: 1, draw: 1, clip: 1, scale: 1, rotation: 0, glow: 1 };
    if (raw >= 1) return { visible: false, alpha: 0, draw: 1, clip: 1, scale: 1, rotation: 0, glow: 0 };
    const p = easeValue(a.easing, raw);
    return { visible: true, alpha: 1 - p, draw: 1, clip: 1, scale: 1, rotation: 0, glow: 1 - p * .5 };
  }

  if (raw < 0) return { visible: false, alpha: 0, draw: 0, clip: 0, scale: 0, rotation: 0, glow: 0 };
  if (raw >= 1 && a.mode !== 'pulse') {
    if (!a.holdAfter) return { visible: false, alpha: 0, draw: 1, clip: 1, scale: 1, rotation: 0, glow: 0 };
    return { visible: true, alpha: 1, draw: 1, clip: 1, scale: 1, rotation: 0, glow: 1 };
  }

  if (a.mode === 'pulse') {
    if (raw >= 1 && !a.holdAfter) return { visible: false, alpha: 0, draw: 1, clip: 1, scale: 1, rotation: 0, glow: 0 };
    const phase = ((time - localStart) / duration) * Math.PI * 2;
    const pulse = .5 + .5 * Math.sin(phase - Math.PI / 2);
    return { visible: true, alpha: .72 + pulse * .28, draw: 1, clip: 1, scale: .98 + pulse * .04, rotation: 0, glow: .75 + pulse * 1.15 };
  }

  const p = easeValue(a.easing, raw);
  switch (a.mode) {
    case 'draw': return { visible: true, alpha: 1, draw: p, clip: 1, scale: 1, rotation: 0, glow: 1 };
    case 'drawGlow': return { visible: true, alpha: 1, draw: p, clip: 1, scale: 1, rotation: 0, glow: .7 + (1 - Math.abs(.5 - p) * 2) * 1.4 };
    case 'fadeIn': return { visible: true, alpha: p, draw: 1, clip: 1, scale: 1, rotation: 0, glow: p };
    case 'centerSpread': return { visible: true, alpha: clamp(p * 1.35, 0, 1), draw: 1, clip: p, scale: 1, rotation: 0, glow: .8 + p * .5 };
    case 'scaleIn': return { visible: true, alpha: clamp(p * 1.5, 0, 1), draw: 1, clip: 1, scale: Math.max(.001, p), rotation: 0, glow: 1 + (1 - p) * .8 };
    case 'spinIn': return { visible: true, alpha: clamp(p * 1.4, 0, 1), draw: 1, clip: 1, scale: .45 + p * .55, rotation: (1 - p) * -Math.PI * 1.3, glow: .8 + p * .4 };
    default: return { visible: true, alpha: 1, draw: 1, clip: 1, scale: 1, rotation: 0, glow: 1 };
  }
}

function applyStrokeStyle(targetCtx, style, alpha, glowMultiplier, forGlow = false) {
  targetCtx.globalCompositeOperation = style.blendMode || 'source-over';
  targetCtx.lineWidth = Math.max(.01, Number(style.strokeWidth) || 0);
  targetCtx.lineCap = style.lineCap || 'round';
  targetCtx.lineJoin = style.lineJoin || 'round';
  targetCtx.setLineDash(Array.isArray(style.dash) ? style.dash : []);
  targetCtx.globalAlpha = clamp(alpha, 0, 1);
  if (forGlow) {
    targetCtx.strokeStyle = colorWithoutAlpha(style.glowColor || style.stroke);
    targetCtx.shadowColor = colorWithoutAlpha(style.glowColor || style.stroke);
    targetCtx.shadowBlur = Math.max(0, Number(style.glowBlur) || 0) * glowMultiplier;
    targetCtx.shadowOffsetX = 0;
    targetCtx.shadowOffsetY = 0;
  } else {
    targetCtx.strokeStyle = colorWithoutAlpha(style.stroke);
    targetCtx.shadowColor = colorWithoutAlpha(style.shadowColor || '#000000');
    targetCtx.shadowBlur = Math.max(0, Number(style.shadowBlur) || 0);
    targetCtx.shadowOffsetX = Number(style.shadowOffsetX) || 0;
    targetCtx.shadowOffsetY = Number(style.shadowOffsetY) || 0;
  }
}

function strokeCurrentPath(targetCtx, style, baseAlpha, glowMultiplier) {
  if ((Number(style.strokeWidth) || 0) <= 0) return;
  if (style.glowEnabled && Number(style.glowStrength) > 0 && Number(style.glowBlur) > 0) {
    targetCtx.save();
    applyStrokeStyle(targetCtx, style, baseAlpha * .4 * Number(style.glowStrength), glowMultiplier, true);
    targetCtx.lineWidth = Math.max(.01, Number(style.strokeWidth)) * 1.35;
    targetCtx.stroke();
    targetCtx.shadowBlur *= .48;
    targetCtx.globalAlpha = baseAlpha * .22 * Number(style.glowStrength);
    targetCtx.stroke();
    targetCtx.restore();
  }
  targetCtx.save();
  applyStrokeStyle(targetCtx, style, baseAlpha * alphaFromHex(style.stroke), glowMultiplier, false);
  targetCtx.stroke();
  targetCtx.restore();
}

function fillCurrentPath(targetCtx, style, baseAlpha, glowMultiplier) {
  if (!style.fillEnabled) return;
  targetCtx.save();
  targetCtx.globalCompositeOperation = style.blendMode || 'source-over';
  targetCtx.globalAlpha = baseAlpha * alphaFromHex(style.fill);
  targetCtx.fillStyle = colorWithoutAlpha(style.fill);
  if (style.glowEnabled) {
    targetCtx.shadowColor = colorWithoutAlpha(style.glowColor || style.fill);
    targetCtx.shadowBlur = (Number(style.glowBlur) || 0) * glowMultiplier * .7;
  }
  targetCtx.fill();
  targetCtx.restore();
}

function renderTextElement(targetCtx, el, state) {
  const style = el.style;
  const baseAlpha = clamp((style.opacity ?? 1) * state.alpha, 0, 1);
  const { font, lines, lineHeight } = cachedTextLayout(el);
  const drawLines = method => lines.forEach((line, index) => targetCtx[method](line, 0, index * lineHeight));
  targetCtx.save();
  targetCtx.translate(el.x, el.y);
  targetCtx.rotate(el.rotation || 0);
  targetCtx.textAlign = el.textAlign || 'center';
  targetCtx.textBaseline = 'alphabetic';
  targetCtx.font = font;
  if (style.glowEnabled && style.glowStrength > 0) {
    targetCtx.save();
    targetCtx.globalCompositeOperation = style.blendMode || 'source-over';
    targetCtx.globalAlpha = baseAlpha * .5 * style.glowStrength;
    targetCtx.fillStyle = colorWithoutAlpha(style.glowColor || style.fill);
    targetCtx.shadowColor = colorWithoutAlpha(style.glowColor || style.fill);
    targetCtx.shadowBlur = style.glowBlur * state.glow;
    drawLines('fillText');
    targetCtx.restore();
  }
  if (style.fillEnabled) {
    targetCtx.globalCompositeOperation = style.blendMode || 'source-over';
    targetCtx.globalAlpha = baseAlpha * alphaFromHex(style.fill);
    targetCtx.fillStyle = colorWithoutAlpha(style.fill);
    targetCtx.shadowColor = colorWithoutAlpha(style.shadowColor || '#000000');
    targetCtx.shadowBlur = style.shadowBlur || 0;
    targetCtx.shadowOffsetX = style.shadowOffsetX || 0;
    targetCtx.shadowOffsetY = style.shadowOffsetY || 0;
    drawLines('fillText');
  }
  if (style.strokeWidth > 0) {
    targetCtx.globalAlpha = baseAlpha * alphaFromHex(style.stroke);
    targetCtx.strokeStyle = colorWithoutAlpha(style.stroke);
    targetCtx.lineWidth = style.strokeWidth;
    targetCtx.lineJoin = style.lineJoin;
    drawLines('strokeText');
  }
  targetCtx.restore();
}

function renderElementCopy(targetCtx, el, path, time, copyIndex, count) {
  const state = animationState(el, time, copyIndex, count);
  if (!state.visible || state.alpha <= .001) return;
  const style = el.style || defaultStyle();
  const baseAlpha = clamp((style.opacity ?? 1) * state.alpha, 0, 1);
  targetCtx.save();
  applyCopyTransform(targetCtx, copyIndex, count);

  const cx = project.symmetry.centerX, cy = project.symmetry.centerY;
  if (state.scale !== 1 || state.rotation) {
    targetCtx.translate(cx, cy);
    targetCtx.rotate(state.rotation || 0);
    targetCtx.scale(state.scale || .001, state.scale || .001);
    targetCtx.translate(-cx, -cy);
  }
  if (state.clip < .999) {
    const maxRadius = Math.hypot(project.document.width, project.document.height) * .72;
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, maxRadius * state.clip, 0, Math.PI * 2);
    targetCtx.clip();
  }

  if (el.type === 'text') {
    renderTextElement(targetCtx, el, state);
    targetCtx.restore();
    return;
  }

  const isTrimmed = state.draw < .999;
  if (isTrimmed) {
    const flat = cachedFlattenElement(el, 1);
    const reverse = (el.animation.direction || 'forward') === 'reverse';
    const partial = partialPolyline(flat.points, state.draw, reverse);
    drawPolyline(targetCtx, partial, false);
    strokeCurrentPath(targetCtx, style, baseAlpha, state.glow);
  } else {
    if (style.fillEnabled) {
      targetCtx.save();
      targetCtx.beginPath();
      // Path2D cannot become the current path, so fill/stroke are called directly below.
      targetCtx.globalCompositeOperation = style.blendMode || 'source-over';
      targetCtx.globalAlpha = baseAlpha * alphaFromHex(style.fill);
      targetCtx.fillStyle = colorWithoutAlpha(style.fill);
      if (style.glowEnabled) {
        targetCtx.shadowColor = colorWithoutAlpha(style.glowColor || style.fill);
        targetCtx.shadowBlur = (style.glowBlur || 0) * state.glow * .7;
      }
      targetCtx.fill(path);
      targetCtx.restore();
    }
    if (style.strokeWidth > 0) {
      if (style.glowEnabled && style.glowStrength > 0) {
        targetCtx.save();
        applyStrokeStyle(targetCtx, style, baseAlpha * .4 * style.glowStrength, state.glow, true);
        targetCtx.lineWidth = style.strokeWidth * 1.35;
        targetCtx.stroke(path);
        targetCtx.shadowBlur *= .48;
        targetCtx.globalAlpha = baseAlpha * .2 * style.glowStrength;
        targetCtx.stroke(path);
        targetCtx.restore();
      }
      targetCtx.save();
      applyStrokeStyle(targetCtx, style, baseAlpha * alphaFromHex(style.stroke), state.glow, false);
      targetCtx.stroke(path);
      targetCtx.restore();
    }
  }
  targetCtx.restore();
}

function renderElements(targetCtx, time) {
  for (const el of project.elements) {
    if (!el.visible) continue;
    const count = copyCountFor(el);
    const path = el.type === 'text' ? null : cachedPath2D(el);
    for (let copy = 0; copy < count; copy++) renderElementCopy(targetCtx, el, path, time, copy, count);
  }
}

function renderGrid(targetCtx) {
  const size = Math.max(2, Number(project.snap.gridSize) || 25);
  const stride = Math.max(1, Math.ceil(4 / Math.max(.001, size * ui.zoom)));
  const step = size * stride;
  targetCtx.save();
  targetCtx.lineWidth = 1 / ui.zoom;
  const drawLines = majorLines => {
    targetCtx.beginPath();
    for (let x = 0; x <= project.document.width; x += step) {
      if ((Math.round(x / size) % 4 === 0) !== majorLines) continue;
      targetCtx.moveTo(x, 0); targetCtx.lineTo(x, project.document.height);
    }
    for (let y = 0; y <= project.document.height; y += step) {
      if ((Math.round(y / size) % 4 === 0) !== majorLines) continue;
      targetCtx.moveTo(0, y); targetCtx.lineTo(project.document.width, y);
    }
    targetCtx.strokeStyle = majorLines ? 'rgba(139,147,198,.15)' : 'rgba(139,147,198,.055)';
    targetCtx.stroke();
  };
  drawLines(false);
  drawLines(true);
  targetCtx.restore();
}

function renderSymmetryGuides(targetCtx) {
  const s = project.symmetry;
  const cx = s.centerX, cy = s.centerY;
  const count = s.enabled ? clamp(Math.round(s.count), 1, 64) : 1;
  const radius = Math.hypot(project.document.width, project.document.height);
  targetCtx.save();
  targetCtx.lineWidth = 1 / ui.zoom;
  targetCtx.setLineDash([6 / ui.zoom, 5 / ui.zoom]);
  for (let i = 0; i < count; i++) {
    const a = copyAngle(i, count) - Math.PI / 2;
    targetCtx.strokeStyle = i === 0 ? 'rgba(87,216,255,.55)' : 'rgba(141,120,255,.25)';
    targetCtx.beginPath(); targetCtx.moveTo(cx, cy); targetCtx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); targetCtx.stroke();
  }
  targetCtx.setLineDash([]);
  targetCtx.fillStyle = '#57D8FF';
  targetCtx.beginPath(); targetCtx.arc(cx, cy, 4 / ui.zoom, 0, Math.PI * 2); targetCtx.fill();
  targetCtx.strokeStyle = 'rgba(87,216,255,.6)';
  targetCtx.beginPath(); targetCtx.arc(cx, cy, 11 / ui.zoom, 0, Math.PI * 2); targetCtx.stroke();
  targetCtx.restore();
}

function renderSecondarySelections(targetCtx) {
  const secondary = selectedElements().filter(el => el.id !== project.selectedId && el.visible);
  if (!secondary.length) return;
  targetCtx.save();
  targetCtx.lineWidth = 1.15 / ui.zoom;
  targetCtx.strokeStyle = 'rgba(141,120,255,.9)';
  targetCtx.setLineDash([4 / ui.zoom, 4 / ui.zoom]);
  for (const el of secondary) {
    const bounds = elementBounds(el);
    targetCtx.strokeRect(bounds.minX, bounds.minY, Math.max(.001, bounds.maxX - bounds.minX), Math.max(.001, bounds.maxY - bounds.minY));
  }
  targetCtx.restore();
}

function renderSelection(targetCtx) {
  const el = selectedElement();
  if (!el || !el.visible) return;
  targetCtx.save();
  targetCtx.lineWidth = 1.4 / ui.zoom;
  targetCtx.strokeStyle = 'rgba(255,197,91,.9)';
  targetCtx.fillStyle = '#FFD36A';
  targetCtx.setLineDash([5 / ui.zoom, 4 / ui.zoom]);

  if (el.type === 'path') {
    targetCtx.stroke(cachedPath2D(el));
    targetCtx.setLineDash([]);
    el.points.forEach((p, index) => {
      const selected = ui.selectedNode?.elementId === el.id && ui.selectedNode?.index === index;
      const handleSize = (selected ? 5.6 : 4.2) / ui.zoom;
      if (selected || dist({ x: p.inX, y: p.inY }, p) > .01 || dist({ x: p.outX, y: p.outY }, p) > .01) {
        targetCtx.strokeStyle = 'rgba(255,211,106,.55)';
        targetCtx.beginPath(); targetCtx.moveTo(p.inX, p.inY); targetCtx.lineTo(p.x, p.y); targetCtx.lineTo(p.outX, p.outY); targetCtx.stroke();
        targetCtx.fillStyle = '#6EE7FF';
        for (const hp of [{ x: p.inX, y: p.inY }, { x: p.outX, y: p.outY }]) {
          targetCtx.beginPath(); targetCtx.rect(hp.x - 3.2 / ui.zoom, hp.y - 3.2 / ui.zoom, 6.4 / ui.zoom, 6.4 / ui.zoom); targetCtx.fill();
        }
      }
      targetCtx.fillStyle = selected ? '#FFFFFF' : '#FFD36A';
      targetCtx.beginPath(); targetCtx.arc(p.x, p.y, handleSize, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.strokeStyle = '#6B4B00'; targetCtx.lineWidth = 1 / ui.zoom; targetCtx.stroke();
    });
  } else if (el.type === 'circle') {
    targetCtx.stroke(cachedPath2D(el));
    targetCtx.setLineDash([]);
    const handles = [{ x: el.x, y: el.y, kind: 'circle-center' }, { x: el.x + el.rx, y: el.y, kind: 'circle-rx' }, { x: el.x, y: el.y + el.ry, kind: 'circle-ry' }];
    handles.forEach((p, i) => {
      targetCtx.fillStyle = i === 0 ? '#FFD36A' : '#6EE7FF';
      targetCtx.beginPath(); targetCtx.arc(p.x, p.y, 4.7 / ui.zoom, 0, Math.PI * 2); targetCtx.fill();
    });
  } else if (el.type === 'text') {
    const b = textElementUnrotatedBounds(el);
    targetCtx.save();
    targetCtx.translate(el.x, el.y);
    targetCtx.rotate(el.rotation || 0);
    targetCtx.strokeRect(b.minX - el.x, b.minY - el.y, b.maxX - b.minX, b.maxY - b.minY);
    targetCtx.setLineDash([]);
    targetCtx.fillStyle = '#FFD36A'; targetCtx.beginPath(); targetCtx.arc(0, 0, 4.5 / ui.zoom, 0, Math.PI * 2); targetCtx.fill();
    targetCtx.restore();
  }
  targetCtx.restore();
}

function renderDraft(targetCtx) {
  if (!ui.draft) return;
  const draft = ui.draft;
  targetCtx.save();
  targetCtx.strokeStyle = '#FFE78C';
  targetCtx.fillStyle = '#FFE78C';
  targetCtx.lineWidth = 2 / ui.zoom;
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';
  targetCtx.shadowColor = '#FFB000';
  targetCtx.shadowBlur = 10;
  if (draft.type === 'path') {
    const points = draft.points || [];
    if (points.length) {
      targetCtx.beginPath(); targetCtx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        targetCtx.bezierCurveTo(a.outX, a.outY, b.inX, b.inY, b.x, b.y);
      }
      if (draft.preview) {
        const a = points.at(-1), b = draft.preview;
        targetCtx.bezierCurveTo(a.outX, a.outY, b.x, b.y, b.x, b.y);
      }
      targetCtx.stroke();
      targetCtx.shadowBlur = 0;
      for (const p of points) { targetCtx.beginPath(); targetCtx.arc(p.x, p.y, 3.8 / ui.zoom, 0, Math.PI * 2); targetCtx.fill(); }
      if (draft.handleIndex != null) {
        const p = points[draft.handleIndex];
        targetCtx.strokeStyle = '#6EE7FF';
        targetCtx.beginPath(); targetCtx.moveTo(p.inX, p.inY); targetCtx.lineTo(p.outX, p.outY); targetCtx.stroke();
      }
    }
  } else if (draft.type === 'freehand') {
    drawPolyline(targetCtx, draft.points || [], false); targetCtx.stroke();
  } else if (draft.type === 'shape' && draft.element) {
    const p = buildPath2D(draft.element); targetCtx.stroke(p);
  }
  targetCtx.restore();
}

function renderDocument(targetCtx, time, options = {}) {
  const { editor = false, transparent = project.document.transparent } = options;
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.rect(0, 0, project.document.width, project.document.height);
  targetCtx.clip();
  targetCtx.clearRect(0, 0, project.document.width, project.document.height);
  if (!transparent) {
    targetCtx.fillStyle = colorWithoutAlpha(project.document.background);
    targetCtx.fillRect(0, 0, project.document.width, project.document.height);
  }
  if (editor && ui.showGuides && project.snap.grid) renderGrid(targetCtx);
  renderElements(targetCtx, time);
  if (editor) {
    if (ui.showGuides) renderSymmetryGuides(targetCtx);
    renderDraft(targetCtx);
    if (ui.tool === 'select') {
      renderSecondarySelections(targetCtx);
      renderSelection(targetCtx);
    }
    if (ui.snapPoint) {
      targetCtx.save();
      targetCtx.strokeStyle = '#57D8FF'; targetCtx.fillStyle = '#57D8FF'; targetCtx.lineWidth = 1.5 / ui.zoom;
      targetCtx.beginPath(); targetCtx.arc(ui.snapPoint.x, ui.snapPoint.y, 6 / ui.zoom, 0, Math.PI * 2); targetCtx.stroke();
      targetCtx.beginPath(); targetCtx.moveTo(ui.snapPoint.x - 10 / ui.zoom, ui.snapPoint.y); targetCtx.lineTo(ui.snapPoint.x + 10 / ui.zoom, ui.snapPoint.y); targetCtx.moveTo(ui.snapPoint.x, ui.snapPoint.y - 10 / ui.zoom); targetCtx.lineTo(ui.snapPoint.x, ui.snapPoint.y + 10 / ui.zoom); targetCtx.stroke();
      targetCtx.restore();
    }
  }
  targetCtx.restore();
}

function viewMetrics() {
  const originX = ui.canvasCssWidth / 2 + ui.panX - project.document.width * ui.zoom / 2;
  const originY = ui.canvasCssHeight / 2 + ui.panY - project.document.height * ui.zoom / 2;
  return { originX, originY };
}

function docToScreen(point) {
  const { originX, originY } = viewMetrics();
  return { x: originX + point.x * ui.zoom, y: originY + point.y * ui.zoom };
}

function screenToDoc(point) {
  const { originX, originY } = viewMetrics();
  return { x: (point.x - originX) / ui.zoom, y: (point.y - originY) / ui.zoom };
}

function pointerCanvasPosition(event) {
  const rect = dom.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function scheduleEditorRender(time = project.animation.playhead || 0) {
  ui.pendingEditorTime = time;
  if (ui.editorRenderRaf) return;
  ui.editorRenderRaf = requestAnimationFrame(() => {
    ui.editorRenderRaf = 0;
    renderEditor(ui.pendingEditorTime);
  });
}

function scheduleInspectorRefresh(includeDocument = false) {
  ui.pendingInspectorDocument ||= includeDocument;
  if (ui.inspectorRaf) return;
  ui.inspectorRaf = requestAnimationFrame(() => {
    ui.inspectorRaf = 0;
    const includeDocumentNow = ui.pendingInspectorDocument;
    ui.pendingInspectorDocument = false;
    refreshInspectors(includeDocumentNow);
  });
}

function renderEditor(time = project.animation.playhead || 0) {
  if (ui.editorRenderRaf) {
    cancelAnimationFrame(ui.editorRenderRaf);
    ui.editorRenderRaf = 0;
  }
  const dpr = ui.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
  ctx.fillStyle = '#080910';
  ctx.fillRect(0, 0, dom.canvas.width, dom.canvas.height);
  const { originX, originY } = viewMetrics();
  ctx.setTransform(dpr * ui.zoom, 0, 0, dpr * ui.zoom, dpr * originX, dpr * originY);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 28 / ui.zoom; ctx.shadowOffsetY = 10 / ui.zoom;
  ctx.fillStyle = project.document.transparent ? 'rgba(13,15,26,.92)' : project.document.background;
  ctx.fillRect(0, 0, project.document.width, project.document.height);
  ctx.restore();
  renderDocument(ctx, time, { editor: true, transparent: project.document.transparent });
  ctx.save();
  ctx.strokeStyle = 'rgba(183,190,229,.3)'; ctx.lineWidth = 1 / ui.zoom;
  ctx.strokeRect(0, 0, project.document.width, project.document.height);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  dom.emptyHint.hidden = project.elements.length > 0 || Boolean(ui.draft);
}

function resizeCanvas() {
  const rect = dom.canvasWrap.getBoundingClientRect();
  ui.canvasCssWidth = Math.max(1, Math.floor(rect.width));
  ui.canvasCssHeight = Math.max(1, Math.floor(rect.height));
  const nativeDpr = Math.min(window.devicePixelRatio || 1, MAX_EDITOR_DPR);
  const pixelBudgetDpr = Math.sqrt(MAX_EDITOR_PIXELS / (ui.canvasCssWidth * ui.canvasCssHeight));
  ui.dpr = Math.max(1, Math.min(nativeDpr, pixelBudgetDpr));
  const width = Math.max(1, Math.round(ui.canvasCssWidth * ui.dpr));
  const height = Math.max(1, Math.round(ui.canvasCssHeight * ui.dpr));
  if (dom.canvas.width !== width || dom.canvas.height !== height) {
    dom.canvas.width = width; dom.canvas.height = height;
    dom.canvas.style.width = `${ui.canvasCssWidth}px`;
    dom.canvas.style.height = `${ui.canvasCssHeight}px`;
  }
  renderEditor();
}

function fitView() {
  const margin = 46;
  if (!ui.canvasCssWidth || !ui.canvasCssHeight) return;
  ui.zoom = clamp(Math.min((ui.canvasCssWidth - margin * 2) / project.document.width, (ui.canvasCssHeight - margin * 2) / project.document.height), .04, 8);
  ui.panX = 0; ui.panY = 0;
  updateZoomLabel(); scheduleEditorRender();
}

function setZoom(nextZoom, aroundScreen = null) {
  const oldZoom = ui.zoom;
  const clamped = clamp(nextZoom, .04, 8);
  if (Math.abs(clamped - oldZoom) < .0001) return;
  if (aroundScreen) {
    const before = screenToDoc(aroundScreen);
    ui.zoom = clamped;
    const after = docToScreen(before);
    ui.panX += aroundScreen.x - after.x;
    ui.panY += aroundScreen.y - after.y;
  } else ui.zoom = clamped;
  updateZoomLabel(); scheduleEditorRender();
}

function updateZoomLabel() { dom.zoomLabel.textContent = `${Math.round(ui.zoom * 100)}%`; }

// ---------- Snapping, hit testing, and editing ----------

function updateSnapBadge(screen, label = T('snap.badge')) {
  if (!screen || !ui.snapPoint) {
    dom.snapBadge.hidden = true;
    return;
  }
  dom.snapBadge.hidden = false;
  dom.snapBadge.textContent = label;
  dom.snapBadge.style.left = `${screen.x}px`;
  dom.snapBadge.style.top = `${screen.y}px`;
}

function snapDocPoint(rawPoint, options = {}) {
  const snap = project.snap;
  ui.snapPoint = null;
  if (!snap.enabled || options.disable) {
    updateSnapBadge(null);
    return { ...rawPoint };
  }
  const threshold = Math.max(1, snap.threshold) / ui.zoom;
  const candidates = [];
  const add = (point, label) => {
    const distance = dist(rawPoint, point);
    if (distance <= threshold) candidates.push({ point, label, distance });
  };

  if (snap.grid) {
    const size = Math.max(2, Number(snap.gridSize) || 25);
    add({ x: Math.round(rawPoint.x / size) * size, y: Math.round(rawPoint.y / size) * size }, T('snap.grid'));
  }
  if (snap.center) {
    const cx = project.symmetry.centerX, cy = project.symmetry.centerY;
    add({ x: cx, y: rawPoint.y }, T('snap.centerX'));
    add({ x: rawPoint.x, y: cy }, T('snap.centerY'));
    add({ x: cx, y: cy }, T('snap.center'));
  }
  if (snap.radial && project.symmetry.enabled) {
    const cx = project.symmetry.centerX, cy = project.symmetry.centerY;
    const dx = rawPoint.x - cx, dy = rawPoint.y - cy;
    const radius = Math.hypot(dx, dy);
    const count = clamp(Math.round(project.symmetry.count), 1, 64);
    const base = rad(project.symmetry.offset || 0) - Math.PI / 2;
    const angle = Math.atan2(dy, dx);
    const step = Math.PI * 2 / count;
    const nearest = base + Math.round((angle - base) / step) * step;
    const projected = { x: cx + Math.cos(nearest) * radius, y: cy + Math.sin(nearest) * radius };
    add(projected, T('snap.guide'));
  }
  if (snap.angles && options.anchor) {
    const dx = rawPoint.x - options.anchor.x, dy = rawPoint.y - options.anchor.y;
    const radius = Math.hypot(dx, dy);
    if (radius > .01) {
      const step = rad(Math.max(1, Number(snap.angleStep) || 15));
      const angle = Math.atan2(dy, dx);
      const snappedAngle = Math.round(angle / step) * step;
      add({ x: options.anchor.x + Math.cos(snappedAngle) * radius, y: options.anchor.y + Math.sin(snappedAngle) * radius }, `${snap.angleStep}°`);
    }
  }
  if (!candidates.length) {
    updateSnapBadge(null);
    return { ...rawPoint };
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  ui.snapPoint = { ...best.point };
  updateSnapBadge(docToScreen(best.point), best.label);
  return { ...best.point };
}

function inverseTransformPointForCopy(point, index, count) {
  if (count === 1 && index === 0) return { ...point };
  const cx = project.symmetry.centerX, cy = project.symmetry.centerY;
  const a = -copyAngle(index, count), c = Math.cos(a), s = Math.sin(a);
  const x = point.x - cx, y = point.y - cy;
  let rx = x * c - y * s, ry = x * s + y * c;
  if (project.symmetry.mirror && index % 2 === 1) rx = -rx;
  return { x: cx + rx, y: cy + ry };
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return dist(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return dist(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function hitControl(point) {
  const el = selectedElement();
  if (!el || el.locked || !el.visible) return null;
  const threshold = 10 / ui.zoom;
  if (el.type === 'path') {
    for (let i = 0; i < el.points.length; i++) {
      const p = el.points[i];
      if (dist(point, { x: p.inX, y: p.inY }) <= threshold && dist(p, { x: p.inX, y: p.inY }) > .01) return { kind: 'node-in', index: i };
      if (dist(point, { x: p.outX, y: p.outY }) <= threshold && dist(p, { x: p.outX, y: p.outY }) > .01) return { kind: 'node-out', index: i };
      if (dist(point, p) <= threshold) return { kind: 'node', index: i };
    }
  } else if (el.type === 'circle') {
    const controls = [
      { kind: 'circle-center', point: { x: el.x, y: el.y } },
      { kind: 'circle-rx', point: { x: el.x + el.rx, y: el.y } },
      { kind: 'circle-ry', point: { x: el.x, y: el.y + el.ry } }
    ];
    for (const control of controls) if (dist(point, control.point) <= threshold) return control;
  } else if (el.type === 'text') {
    if (dist(point, { x: el.x, y: el.y }) <= threshold) return { kind: 'text-origin' };
  }
  return null;
}

function hitElement(point) {
  const toleranceBase = 7 / ui.zoom;
  for (let i = project.elements.length - 1; i >= 0; i--) {
    const el = project.elements[i];
    if (!el.visible || el.locked) continue;
    const count = copyCountFor(el);
    const flat = el.type === 'text' ? null : cachedFlattenElement(el, .8);
    const path = el.type === 'text' ? null : cachedPath2D(el);
    for (let copy = 0; copy < count; copy++) {
      const local = inverseTransformPointForCopy(point, copy, count);
      if (el.type === 'text') {
        const textPoint = rotatePointAround(local, el, -(Number(el.rotation) || 0));
        const b = textElementUnrotatedBounds(el);
        if (textPoint.x >= b.minX - toleranceBase && textPoint.x <= b.maxX + toleranceBase && textPoint.y >= b.minY - toleranceBase && textPoint.y <= b.maxY + toleranceBase) return { el, copy };
        continue;
      }
      const tolerance = toleranceBase + Math.max(0, el.style.strokeWidth || 0) / 2;
      if (el.style.fillEnabled && ctx.isPointInPath(path, local.x, local.y)) return { el, copy };
      for (let j = 1; j < flat.points.length; j++) {
        if (pointSegmentDistance(local, flat.points[j - 1], flat.points[j]) <= tolerance) return { el, copy };
      }
    }
  }
  return null;
}

function restoreGeometry(target, original) {
  if (target.type === 'path') {
    target.points = original.points.map(p => ({ ...p }));
    target.closed = original.closed;
  } else if (target.type === 'circle') {
    target.x = original.x; target.y = original.y; target.rx = original.rx; target.ry = original.ry; target.rotation = original.rotation;
  } else if (target.type === 'text') {
    target.x = original.x; target.y = original.y; target.rotation = original.rotation;
  }
  invalidateElementGeometry(target);
}

function finishPenPath(closed = false) {
  const draft = ui.draft;
  if (!draft || draft.type !== 'path' || draft.points.length < 2) {
    ui.draft = null; renderEditor(); return;
  }
  pushHistory();
  const sourceStyle = selectedElement()?.style ? deepClone(selectedElement().style) : defaultStyle();
  const el = createPathElement(draft.points, {
    name: closed ? T('name.closedShape') : T('name.stroke'), closed, symmetry: true,
    style: sourceStyle,
    animation: { mode: 'drawGlow', start: Math.min(project.animation.duration - .2, project.elements.length * .08), duration: 1.1 }
  });
  project.elements.push(el);
  project.selectedId = el.id;
  ui.selectedNode = { elementId: el.id, index: el.points.length - 1 };
  ui.draft = null;
  setDirty(); refreshAll();
  status(T('msg.pathAdded'));
}

function cancelDraft() {
  if (!ui.draft) return;
  ui.draft = null; ui.drag = null; ui.snapPoint = null; updateSnapBadge(null); renderEditor();
  status(T('msg.drawCancelled'));
}

function addFreehandPath(points) {
  if (points.length < 2) return;
  const simplified = simplifyRDP(points, ui.freehandTolerance / ui.zoom);
  if (simplified.length < 2) return;
  const anchors = catmullRomAnchors(simplified, false, .9);
  pushHistory();
  const sourceStyle = selectedElement()?.style ? deepClone(selectedElement().style) : defaultStyle();
  sourceStyle.lineCap = 'round'; sourceStyle.lineJoin = 'round';
  const el = createPathElement(anchors, {
    name: project.symmetry.enabled ? T('name.symFreehand') : T('name.freehand'), symmetry: project.symmetry.enabled,
    style: sourceStyle,
    animation: { mode: 'drawGlow', start: Math.min(project.animation.duration - .2, project.elements.length * .08), duration: 1.25 }
  });
  project.elements.push(el); project.selectedId = el.id;
  ui.selectedNode = null; setDirty(); refreshAll();
}

function makeDraftShape(tool, start, current, event = {}) {
  const dx = current.x - start.x, dy = current.y - start.y;
  const radius = Math.hypot(dx, dy);
  const rotation = Math.atan2(dy, dx);
  let el;
  if (tool === 'line') {
    el = createPathElement([pathPoint(start.x, start.y), pathPoint(current.x, current.y)], { name: T('name.line'), symmetry: true });
  } else if (tool === 'circle') {
    if (event.altKey) {
      const cx = (start.x + current.x) / 2, cy = (start.y + current.y) / 2;
      el = createCircleElement(cx, cy, Math.abs(current.x - start.x) / 2, Math.abs(current.y - start.y) / 2, { name: T('name.ellipse'), symmetry: false });
    } else {
      el = createCircleElement(start.x, start.y, radius, radius, { name: T('name.circle'), symmetry: false });
    }
  } else if (tool === 'polygon') {
    el = createPathElement(regularPolygonPoints(start.x, start.y, radius, ui.polygonSides, rotation), { name: T('name.polygon', ui.polygonSides), closed: true, symmetry: true });
  } else {
    el = createPathElement(starPoints(start.x, start.y, radius, radius * ui.starInner, ui.starPoints, rotation), { name: T('name.star', ui.starPoints), closed: true, symmetry: true });
  }
  const sourceStyle = selectedElement()?.style ? deepClone(selectedElement().style) : defaultStyle();
  el.style = sourceStyle;
  el.animation = defaultAnimation({ mode: tool === 'circle' ? 'centerSpread' : 'drawGlow', start: Math.min(project.animation.duration - .2, project.elements.length * .08), duration: 1.1 });
  return el;
}

function finishDraftShape() {
  const draft = ui.draft;
  if (!draft?.element) { ui.draft = null; return; }
  const size = draft.type === 'shape' && draft.start && draft.current ? dist(draft.start, draft.current) : 0;
  if (size < 3 / ui.zoom) { ui.draft = null; renderEditor(); return; }
  pushHistory();
  project.elements.push(draft.element);
  project.selectedId = draft.element.id;
  ui.draft = null; setDirty(); refreshAll();
}

function selectElement(id, render = true, mode = 'replace') {
  if (!project.elements.some(el => el.id === id)) return;
  reconcileElementSelection();
  const nextIds = new Set(ui.selectedIds);
  let primaryId = id;
  let anchorId = id;
  if (mode === 'toggle') {
    if (nextIds.has(id)) {
      nextIds.delete(id);
      primaryId = project.selectedId === id ? [...nextIds].at(-1) || null : project.selectedId;
    } else nextIds.add(id);
  } else if (mode === 'range') {
    const anchorIndex = project.elements.findIndex(el => el.id === ui.selectionAnchorId);
    const targetIndex = project.elements.findIndex(el => el.id === id);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      nextIds.clear();
      const [start, end] = [Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex)];
      project.elements.slice(start, end + 1).forEach(el => nextIds.add(el.id));
      anchorId = ui.selectionAnchorId;
    } else {
      nextIds.clear(); nextIds.add(id);
    }
  } else if (mode === 'preserve') {
    nextIds.add(id);
    anchorId = ui.selectionAnchorId || id;
  } else {
    nextIds.clear(); nextIds.add(id);
  }
  setElementSelection(nextIds, primaryId, anchorId);
  ui.selectedNode = null;
  const el = selectedElement();
  const textLength = el?.type === 'text' ? String(el.text ?? '').length : 0;
  ui.textSelectionStart = ui.textSelectionEnd = textLength;
  ui.textSelectionElement = el?.type === 'text' ? el : null;
  if (render) refreshAll();
}

function deleteSelected() {
  const selected = selectedElements();
  if (!selected.length) return;
  const index = selectedIndex();
  const selectedIds = new Set(selected.map(el => el.id));
  pushHistory();
  project.elements = project.elements.filter(el => !selectedIds.has(el.id));
  const nextId = project.elements[Math.min(Math.max(0, index), project.elements.length - 1)]?.id || null;
  setElementSelection(nextId ? [nextId] : [], nextId, nextId);
  ui.selectedNode = null; setDirty(); refreshAll();
  toast(selected.length === 1 ? T('msg.deletedOne', selected[0].name) : T('msg.deletedMany', selected.length));
}

function duplicateSelected() {
  const selected = selectedElements();
  if (!selected.length) return;
  const selectedIds = new Set(selected.map(el => el.id));
  const primaryId = project.selectedId;
  pushHistory();
  const copies = [];
  const primaryCopies = new Map();
  const nextElements = [];
  for (const el of project.elements) {
    nextElements.push(el);
    if (!selectedIds.has(el.id)) continue;
    const copy = deepClone(el);
    copy.id = uid(el.type);
    copy.name = T('name.copy', el.name);
    moveElement(copy, 18, 18);
    copy.animation.start = Math.min(project.animation.duration, Number(copy.animation.start) + .1);
    nextElements.push(copy); copies.push(copy); primaryCopies.set(el.id, copy.id);
  }
  project.elements = nextElements;
  const nextPrimaryId = primaryCopies.get(primaryId) || copies.at(-1)?.id || null;
  setElementSelection(copies.map(el => el.id), nextPrimaryId, nextPrimaryId);
  setDirty(); refreshAll();
  toast(copies.length === 1 ? T('msg.duplicatedOne') : T('msg.duplicatedMany', copies.length), 'success');
}

function pointerDown(event) {
  if (ui.exportBusy || event.button > 1) return;
  dom.canvas.focus({ preventScroll: true });
  const screen = pointerCanvasPosition(event);
  const raw = screenToDoc(screen);
  ui.lastPointer = screen;
  dom.canvas.setPointerCapture?.(event.pointerId);

  if (event.button === 1 || ui.tool === 'pan' || ui.spaceHeld) {
    ui.drag = { kind: 'pan', startScreen: screen, panX: ui.panX, panY: ui.panY, pointerId: event.pointerId };
    if (ui.spaceHeld) ui.spaceDragged = true;
    dom.canvas.style.cursor = 'grabbing';
    event.preventDefault();
    return;
  }

  if (ui.tool === 'select') {
    const control = hitControl(raw);
    if (control) {
      const el = selectedElement();
      beginTransaction();
      ui.drag = { ...control, pointerId: event.pointerId, start: raw, original: deepClone(el), elementId: el.id };
      if (control.index != null) ui.selectedNode = { elementId: el.id, index: control.index };
      renderEditor();
      return;
    }
    const hit = hitElement(raw);
    if (hit) {
      const toggleSelection = event.shiftKey || event.ctrlKey || event.metaKey;
      if (toggleSelection) {
        selectElement(hit.el.id, false, 'toggle');
        refreshInspectors(); renderLayers(); renderTimeline(); renderEditor();
        return;
      }
      reconcileElementSelection();
      if (ui.selectedIds.has(hit.el.id) && ui.selectedIds.size > 1) selectElement(hit.el.id, false, 'preserve');
      else if (project.selectedId !== hit.el.id || ui.selectedIds.size !== 1) selectElement(hit.el.id, false);
      if (!hit.el.locked) {
        beginTransaction();
        const movable = movableSelectedElements();
        if (movable.length > 1) {
          ui.drag = {
            kind: 'element-group', pointerId: event.pointerId, start: raw, elementId: hit.el.id,
            center: elementCenter(hit.el), originals: movable.map(el => ({ id: el.id, value: deepClone(el) }))
          };
        } else {
          ui.drag = { kind: 'element', pointerId: event.pointerId, start: raw, original: deepClone(hit.el), elementId: hit.el.id, center: elementCenter(hit.el) };
        }
      }
      refreshInspectors(); renderLayers(); renderTimeline(); renderEditor();
    } else {
      clearElementSelection();
    }
    return;
  }

  if (ui.tool === 'pen') {
    if (event.detail >= 2 && ui.draft?.type === 'path') { finishPenPath(false); return; }
    const anchor = ui.draft?.points?.at(-1) || null;
    const point = snapDocPoint(raw, { anchor, disable: event.altKey });
    if (!ui.draft || ui.draft.type !== 'path') ui.draft = { type: 'path', points: [], preview: null, handleIndex: null };
    const points = ui.draft.points;
    if (points.length >= 3 && dist(point, points[0]) <= 12 / ui.zoom) { finishPenPath(true); return; }
    const p = pathPoint(point.x, point.y);
    points.push(p);
    ui.draft.handleIndex = points.length - 1;
    ui.drag = { kind: 'draft-handle', pointerId: event.pointerId, start: point, index: points.length - 1 };
    renderEditor();
    return;
  }

  if (ui.tool === 'freehand') {
    const point = snapDocPoint(raw, { disable: event.altKey });
    ui.draft = { type: 'freehand', points: [point] };
    ui.drag = { kind: 'freehand', pointerId: event.pointerId };
    renderEditor();
    return;
  }

  if (['line', 'circle', 'polygon', 'star'].includes(ui.tool)) {
    const point = snapDocPoint(raw, { disable: event.altKey });
    ui.draft = { type: 'shape', tool: ui.tool, start: point, current: point, element: makeDraftShape(ui.tool, point, point, event) };
    ui.drag = { kind: 'shape', pointerId: event.pointerId };
    renderEditor();
    return;
  }

  if (ui.tool === 'text') {
    const point = snapDocPoint(raw, { disable: event.altKey });
    pushHistory();
    const el = createTextElement(point.x, point.y, 'ᚱ', {
      symmetry: project.symmetry.enabled, fontFamily: ui.fontPreset,
      animation: { mode: 'fadeIn', start: Math.min(project.animation.duration - .2, project.elements.length * .08), duration: .65 }
    });
    project.elements.push(el); project.selectedId = el.id; setDirty();
    setTool('select'); switchPanel('geometry'); refreshAll();
    setTimeout(() => { $('#textContent').focus(); $('#textContent').select(); }, 50);
  }
}

function pointerMove(event) {
  const screen = pointerCanvasPosition(event);
  const raw = screenToDoc(screen);
  ui.lastPointer = screen;
  dom.cursorPosition.textContent = `X ${Math.round(raw.x)} · Y ${Math.round(raw.y)}`;

  if (!ui.drag) {
    if (ui.tool === 'pen' && ui.draft?.type === 'path') {
      ui.draft.preview = snapDocPoint(raw, { anchor: ui.draft.points.at(-1), disable: event.altKey });
      scheduleEditorRender();
    } else {
      ui.snapPoint = null; updateSnapBadge(null);
    }
    return;
  }

  if (ui.drag.kind === 'pan') {
    ui.panX = ui.drag.panX + screen.x - ui.drag.startScreen.x;
    ui.panY = ui.drag.panY + screen.y - ui.drag.startScreen.y;
    scheduleEditorRender();
    return;
  }

  if (ui.drag.kind === 'draft-handle') {
    const point = snapDocPoint(raw, { anchor: ui.drag.start, disable: event.altKey });
    const p = ui.draft.points[ui.drag.index];
    p.outX = point.x; p.outY = point.y;
    p.inX = p.x * 2 - point.x; p.inY = p.y * 2 - point.y;
    p.smooth = true;
    scheduleEditorRender();
    return;
  }

  if (ui.drag.kind === 'freehand') {
    const points = ui.draft.points;
    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const samples = coalesced.length ? coalesced : [event];
    for (const sample of samples) {
      const samplePoint = screenToDoc(pointerCanvasPosition(sample));
      if (!points.length || dist(points.at(-1), samplePoint) >= 1.4 / ui.zoom) points.push(samplePoint);
    }
    scheduleEditorRender();
    return;
  }

  if (ui.drag.kind === 'shape') {
    const anchor = ui.draft.start;
    const current = snapDocPoint(raw, { anchor, disable: event.altKey });
    ui.draft.current = current;
    ui.draft.element = makeDraftShape(ui.draft.tool, anchor, current, event);
    scheduleEditorRender();
    return;
  }

  if (ui.drag.kind === 'element-group') {
    const rawCenter = { x: ui.drag.center.x + raw.x - ui.drag.start.x, y: ui.drag.center.y + raw.y - ui.drag.start.y };
    const snappedCenter = snapDocPoint(rawCenter, { anchor: { x: project.symmetry.centerX, y: project.symmetry.centerY }, disable: event.altKey });
    const dx = snappedCenter.x - ui.drag.center.x;
    const dy = snappedCenter.y - ui.drag.center.y;
    for (const original of ui.drag.originals) {
      const target = project.elements.find(item => item.id === original.id);
      if (!target) continue;
      restoreGeometry(target, original.value);
      moveElement(target, dx, dy);
    }
    setDirty(); scheduleEditorRender(); scheduleInspectorRefresh();
    return;
  }

  const el = project.elements.find(item => item.id === ui.drag.elementId);
  if (!el) return;
  restoreGeometry(el, ui.drag.original);

  if (ui.drag.kind === 'element') {
    const rawCenter = { x: ui.drag.center.x + raw.x - ui.drag.start.x, y: ui.drag.center.y + raw.y - ui.drag.start.y };
    const snappedCenter = snapDocPoint(rawCenter, { anchor: { x: project.symmetry.centerX, y: project.symmetry.centerY }, disable: event.altKey });
    moveElement(el, snappedCenter.x - ui.drag.center.x, snappedCenter.y - ui.drag.center.y);
  } else if (ui.drag.kind === 'node') {
    const originalPoint = ui.drag.original.points[ui.drag.index];
    const point = snapDocPoint(raw, { disable: event.altKey });
    const dx = point.x - originalPoint.x, dy = point.y - originalPoint.y;
    const p = el.points[ui.drag.index];
    p.x = originalPoint.x + dx; p.y = originalPoint.y + dy;
    p.inX = originalPoint.inX + dx; p.inY = originalPoint.inY + dy;
    p.outX = originalPoint.outX + dx; p.outY = originalPoint.outY + dy;
  } else if (ui.drag.kind === 'node-in' || ui.drag.kind === 'node-out') {
    const point = snapDocPoint(raw, { anchor: el.points[ui.drag.index], disable: event.altKey });
    const p = el.points[ui.drag.index];
    if (ui.drag.kind === 'node-in') {
      p.inX = point.x; p.inY = point.y;
      if (p.smooth && !event.altKey) { p.outX = p.x * 2 - point.x; p.outY = p.y * 2 - point.y; }
    } else {
      p.outX = point.x; p.outY = point.y;
      if (p.smooth && !event.altKey) { p.inX = p.x * 2 - point.x; p.inY = p.y * 2 - point.y; }
    }
  } else if (ui.drag.kind === 'circle-center' || ui.drag.kind === 'text-origin') {
    const point = snapDocPoint(raw, { disable: event.altKey });
    const dx = point.x - ui.drag.start.x, dy = point.y - ui.drag.start.y;
    el.x = ui.drag.original.x + dx; el.y = ui.drag.original.y + dy;
  } else if (ui.drag.kind === 'circle-rx') {
    const point = snapDocPoint(raw, { anchor: { x: el.x, y: el.y }, disable: event.altKey });
    el.rx = Math.max(1, Math.abs(point.x - el.x));
  } else if (ui.drag.kind === 'circle-ry') {
    const point = snapDocPoint(raw, { anchor: { x: el.x, y: el.y }, disable: event.altKey });
    el.ry = Math.max(1, Math.abs(point.y - el.y));
  }
  setDirty(); invalidateElementGeometry(el); scheduleEditorRender(); scheduleInspectorRefresh();
}

function pointerUp(event) {
  if (!ui.drag) return;
  const kind = ui.drag.kind;
  if (kind === 'freehand') {
    const points = ui.draft?.points?.slice() || [];
    ui.drag = null; ui.draft = null; ui.snapPoint = null; updateSnapBadge(null);
    addFreehandPath(points);
    return;
  }
  if (kind === 'shape') {
    ui.drag = null; ui.snapPoint = null; updateSnapBadge(null); finishDraftShape(); return;
  }
  if (kind === 'draft-handle') {
    if (ui.draft) ui.draft.handleIndex = null;
    ui.drag = null; renderEditor(); return;
  }
  if (kind === 'pan') {
    ui.drag = null; dom.canvas.style.cursor = TOOL_META[ui.tool].cursor; return;
  }
  ui.drag = null; ui.snapPoint = null; updateSnapBadge(null);
  commitTransaction();
}

function pointerCancel() {
  if (ui.drag?.kind === 'element-group') {
    for (const original of ui.drag.originals) {
      const target = project.elements.find(item => item.id === original.id);
      if (target) restoreGeometry(target, original.value);
    }
    cancelTransaction();
  } else if (ui.drag && !['freehand', 'shape', 'draft-handle', 'pan'].includes(ui.drag.kind)) {
    const el = project.elements.find(item => item.id === ui.drag.elementId);
    if (el && ui.drag.original) restoreGeometry(el, ui.drag.original);
    cancelTransaction();
  }
  ui.drag = null; ui.snapPoint = null; updateSnapBadge(null); renderEditor();
}

function wheelZoom(event) {
  event.preventDefault();
  const screen = pointerCanvasPosition(event);
  const factor = Math.exp(-event.deltaY * .0015);
  setZoom(ui.zoom * factor, screen);
}

// ---------- UI rendering ----------

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function selectedRuneSet() {
  return RUNE_SETS[$('#runeSetSelect')?.value] || RUNE_SETS.elder;
}

function renderRunePalette() {
  const palette = $('#runePalette');
  if (!palette) return;
  const runeSet = selectedRuneSet();
  const query = String($('#runeSearchInput')?.value || '').trim().toLowerCase();
  const runes = runeSet.runes.filter(([glyph, sound, name]) => {
    if (!query) return true;
    return `${glyph} ${sound} ${name} ${T('rune.' + name)}`.toLowerCase().includes(query);
  });
  palette.innerHTML = runes.length ? runes.map(([glyph, sound, name], index) => {
    const reading = T('rune.' + name);
    return `<button class="rune-button" type="button" tabindex="${index === 0 ? 0 : -1}" data-rune="${escapeHtml(glyph)}" title="${escapeHtml(`${name} · ${reading} · ${sound}`)}" aria-label="${escapeHtml(`${name}, ${reading}, ${sound}, ${glyph}`)}"><span class="rune-glyph">${escapeHtml(glyph)}</span><small>${escapeHtml(sound)}</small></button>`;
  }).join('') : `<div class="rune-empty">${escapeHtml(T('rune.palette.empty'))}</div>`;
  $('#runePaletteStatus').textContent = T('rune.palette.status', runeSetLabel(runeSet), runes.length);
}

function updateRuneConversion() {
  const output = $('#runeConversionOutput');
  if (!output) return '';
  const converted = convertLatinToRunes($('#latinRuneInput')?.value || '', $('#runeSetSelect')?.value || 'elder');
  output.textContent = converted || '—';
  return converted;
}

function rememberTextSelection() {
  const input = $('#textContent');
  if (!input) return;
  ui.textSelectionElement = selectedElement();
  ui.textSelectionStart = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
  ui.textSelectionEnd = Number.isFinite(input.selectionEnd) ? input.selectionEnd : ui.textSelectionStart;
}

function applyRuneText(nextText, caret, message) {
  const el = selectedElement();
  if (!el || el.type !== 'text') {
    toast(T('msg.selectTextFirst'));
    return;
  }
  if (nextText === String(el.text ?? '')) return;
  pushHistory();
  el.text = nextText;
  invalidateElementGeometry(el);
  ui.textSelectionStart = ui.textSelectionEnd = clamp(caret, 0, nextText.length);
  const input = $('#textContent');
  input.value = nextText;
  input.setSelectionRange?.(ui.textSelectionStart, ui.textSelectionEnd);
  setDirty();
  afterGeometryChange();
  if (message) status(message);
}

function insertRuneText(text) {
  if (!text) return;
  const el = selectedElement();
  if (!el || el.type !== 'text') {
    toast(T('msg.selectTextFirst'));
    return;
  }
  const current = String(el.text ?? '');
  const start = clamp(ui.textSelectionStart, 0, current.length);
  const end = clamp(ui.textSelectionEnd, start, current.length);
  const next = current.slice(0, start) + text + current.slice(end);
  applyRuneText(next, start + text.length, T('msg.runeInserted'));
}

function wireRuneAssistant() {
  const palette = $('#runePalette');
  const setSelect = $('#runeSetSelect');
  const search = $('#runeSearchInput');
  const latinInput = $('#latinRuneInput');
  const textInput = $('#textContent');
  if (!palette || !setSelect || !search || !latinInput || !textInput) return;

  setSelect.addEventListener('change', () => {
    renderRunePalette();
    updateRuneConversion();
  });
  search.addEventListener('input', renderRunePalette);
  latinInput.addEventListener('input', updateRuneConversion);
  ['select', 'keyup', 'pointerup', 'input'].forEach(eventName => textInput.addEventListener(eventName, rememberTextSelection));
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === textInput) rememberTextSelection();
  });
  palette.addEventListener('focusin', event => {
    const focused = event.target.closest('.rune-button');
    if (!focused) return;
    $$('.rune-button', palette).forEach(button => { button.tabIndex = button === focused ? 0 : -1; });
  });
  palette.addEventListener('keydown', event => {
    const current = event.target.closest('.rune-button');
    if (!current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = $$('.rune-button', palette);
    let target = null;
    const index = buttons.indexOf(current);
    if (event.key === 'Home') target = buttons[0];
    else if (event.key === 'End') target = buttons.at(-1);
    else if (event.key === 'ArrowLeft') target = buttons[Math.max(0, index - 1)];
    else if (event.key === 'ArrowRight') target = buttons[Math.min(buttons.length - 1, index + 1)];
    else {
      const currentRect = current.getBoundingClientRect();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      target = buttons
        .filter(button => {
          const rect = button.getBoundingClientRect();
          return direction < 0 ? rect.bottom <= currentRect.top + 1 : rect.top >= currentRect.bottom - 1;
        })
        .sort((a, b) => {
          const rectA = a.getBoundingClientRect(), rectB = b.getBoundingClientRect();
          const scoreA = Math.abs(rectA.top - currentRect.top) * 10 + Math.abs(rectA.left - currentRect.left);
          const scoreB = Math.abs(rectB.top - currentRect.top) * 10 + Math.abs(rectB.left - currentRect.left);
          return scoreA - scoreB;
        })[0];
    }
    if (target) {
      event.preventDefault();
      target.focus();
    }
  });
  palette.addEventListener('click', event => {
    const button = event.target.closest('[data-rune]');
    if (button) insertRuneText(button.dataset.rune);
  });
  $('#replaceWithRunesBtn').addEventListener('click', () => {
    const converted = updateRuneConversion();
    if (!converted) { toast(T('msg.enterLatin')); return; }
    applyRuneText(converted, converted.length, T('msg.runeReplaced'));
  });
  $('#insertRunesBtn').addEventListener('click', () => {
    const converted = updateRuneConversion();
    if (!converted) { toast(T('msg.enterLatin')); return; }
    insertRuneText(converted);
  });
  renderRunePalette();
  updateRuneConversion();
}

function setTool(tool, preserveDraft = false) {
  if (!TOOL_META[tool]) return;
  if (!preserveDraft && ui.draft && tool !== ui.tool) cancelDraft();
  ui.previousTool = ui.tool;
  ui.tool = tool;
  $$('.tool-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
  dom.activeToolName.textContent = toolName(tool);
  dom.toolHint.textContent = toolHint(tool);
  dom.canvas.style.cursor = TOOL_META[tool].cursor;
  renderToolOptions();
  renderEditor();
}

function renderToolOptions() {
  const tool = ui.tool;
  if (tool === 'pen') {
    dom.toolOptions.innerHTML = `<button class="ui-btn tiny" data-tool-action="finish">${escapeHtml(T('toolOpt.finishPath'))}</button><button class="ui-btn tiny" data-tool-action="close">${escapeHtml(T('toolOpt.closePath'))}</button><span class="mini-note">${escapeHtml(T('toolOpt.penNote'))}</span>`;
  } else if (tool === 'freehand') {
    dom.toolOptions.innerHTML = `<label>${escapeHtml(T('toolOpt.simplify'))} <input id="freehandToleranceOption" type="range" min="0.5" max="8" step="0.1" value="${ui.freehandTolerance}"><output>${ui.freehandTolerance.toFixed(1)}</output></label>`;
  } else if (tool === 'polygon') {
    dom.toolOptions.innerHTML = `<label>${escapeHtml(T('toolOpt.polygonSides'))} <input id="polygonSidesOption" type="number" min="3" max="32" step="1" value="${ui.polygonSides}"></label>`;
  } else if (tool === 'star') {
    dom.toolOptions.innerHTML = `<label>${escapeHtml(T('toolOpt.starPoints'))} <input id="starPointsOption" type="number" min="3" max="24" step="1" value="${ui.starPoints}"></label><label>${escapeHtml(T('toolOpt.starInner'))} <input id="starInnerOption" type="range" min="0.05" max="0.95" step="0.01" value="${ui.starInner}"><output>${Math.round(ui.starInner * 100)}%</output></label>`;
  } else if (tool === 'select') {
    dom.toolOptions.innerHTML = `<button class="ui-btn tiny" data-tool-action="copy-style">${escapeHtml(T('toolOpt.copyStyle'))}</button><button class="ui-btn tiny" data-tool-action="paste-style" ${ui.clipboardStyle ? '' : 'disabled'}>${escapeHtml(T('toolOpt.pasteStyle'))}</button>`;
  } else if (tool === 'circle') {
    dom.toolOptions.innerHTML = `<span class="mini-note">${escapeHtml(T('toolOpt.circleNote'))}</span>`;
  } else if (tool === 'text') {
    dom.toolOptions.innerHTML = `<label>${escapeHtml(T('toolOpt.fontPreset'))} <input id="fontPresetOption" type="text" value="${escapeHtml(ui.fontPreset)}" placeholder="serif"></label>`;
  } else dom.toolOptions.innerHTML = '';
}

function updateLayerSelectionOnly() {
  const selectedIds = reconcileElementSelection();
  $$('.layer-row', dom.layerList).forEach(row => {
    const selected = selectedIds.has(row.dataset.id);
    row.classList.toggle('selected', selected);
    row.classList.toggle('primary', row.dataset.id === project.selectedId);
    const checkbox = $('.layer-select-check', row);
    if (checkbox) checkbox.checked = selected;
  });
  $$('.timeline-row', dom.timelineTracks).forEach(row => {
    row.classList.toggle('selected', selectedIds.has(row.dataset.id));
    row.classList.toggle('primary', row.dataset.id === project.selectedId);
  });
  const el = selectedElement();
  const selected = selectedElements();
  dom.selectionStatus.textContent = selected.length > 1
    ? T('status.multiSelect', selected.length, el?.name || T('common.none'))
    : el ? `${el.name} · ${el.type === 'path' ? T('geo.pointCount', el.points.length) : el.type === 'circle' ? T('name.circle') : T('name.textShort')}` : T('status.noSelection');
  updateAlignmentControls();
}

function updateSelectedSwatches() {
  const el = selectedElement();
  if (!el) return;
  const background = colorWithoutAlpha(el.style.stroke);
  const color = colorWithoutAlpha(el.style.glowColor || el.style.stroke);
  const swatches = [
    $('.layer-row.primary .layer-swatch', dom.layerList),
    $('.timeline-row.primary .layer-swatch', dom.timelineTracks)
  ];
  for (const swatch of swatches) {
    if (!swatch) continue;
    swatch.style.background = background;
    swatch.style.color = color;
  }
}

function renderLayers() {
  const selectedIds = reconcileElementSelection();
  if (!project.elements.length) {
    dom.layerList.innerHTML = `<div class="selection-placeholder">${escapeHtml(T('layers.empty'))}</div>`;
    updateLayerSelectionOnly();
    return;
  }
  dom.layerList.innerHTML = project.elements.slice().reverse().map(el => {
    const motion = motionLabel(el.animation.mode);
    const classes = `${selectedIds.has(el.id) ? 'selected' : ''} ${el.id === project.selectedId ? 'primary' : ''}`;
    return `<div class="layer-row ${classes}" data-id="${el.id}">
      <input class="layer-select-check" type="checkbox" data-layer-action="toggle" aria-label="${escapeHtml(T('layers.selectAria', el.name))}" ${selectedIds.has(el.id) ? 'checked' : ''} />
      <button data-layer-action="visible" title="${escapeHtml(T('layers.toggleVisible'))}">${el.visible ? '◉' : '○'}</button>
      <button data-layer-action="lock" title="${escapeHtml(T('layers.toggleLock'))}">${el.locked ? '▣' : '□'}</button>
      <button class="layer-main" data-layer-action="select" title="${escapeHtml(el.name)}"><strong>${escapeHtml(el.name)}</strong><small>${el.id === project.selectedId && selectedIds.size > 1 ? `${escapeHtml(T('layers.keyPrefix'))} · ` : ''}${el.symmetry && project.symmetry.enabled ? `${escapeHtml(T('layers.symPrefix', project.symmetry.count))} · ` : ''}${escapeHtml(motion)}</small></button>
      <span class="layer-swatch" style="background:${colorWithoutAlpha(el.style.stroke)};color:${colorWithoutAlpha(el.style.glowColor || el.style.stroke)}"></span>
    </div>`;
  }).join('');
  updateLayerSelectionOnly();
}

function setInputValue(id, value, { checked = false } = {}) {
  const input = $(`#${id}`);
  if (!input) return;
  if (checked) input.checked = Boolean(value);
  else if (document.activeElement !== input) input.value = value ?? '';
}

function refreshInspectors(includeDocument = true) {
  if (ui.inspectorRaf) {
    cancelAnimationFrame(ui.inspectorRaf);
    ui.inspectorRaf = 0;
    ui.pendingInspectorDocument = false;
  }
  const el = selectedElement();
  if (el?.type === 'text') {
    if (ui.textSelectionElement !== el) {
      ui.textSelectionStart = ui.textSelectionEnd = String(el.text ?? '').length;
      ui.textSelectionElement = el;
    }
  } else {
    ui.textSelectionStart = ui.textSelectionEnd = 0;
    ui.textSelectionElement = null;
  }
  $('#noStyleSelection').hidden = Boolean(el);
  $('#styleInspector').hidden = !el;
  $('#noGeometrySelection').hidden = Boolean(el);
  $('#geometryInspector').hidden = !el;
  $('#noAnimationSelection').hidden = Boolean(el);
  $('#animationInspector').hidden = !el;

  if (el) {
    const s = el.style;
    setInputValue('strokeColor', colorWithoutAlpha(s.stroke));
    setInputValue('strokeColorText', s.stroke);
    setInputValue('strokeWidth', round(s.strokeWidth, 2));
    setInputValue('styleOpacity', s.opacity);
    $('#styleOpacityOutput').value = `${Math.round(s.opacity * 100)}%`;
    setInputValue('fillEnabled', s.fillEnabled, { checked: true });
    setInputValue('fillColor', colorWithoutAlpha(s.fill));
    setInputValue('fillColorText', s.fill);
    $('#fillColorRow').style.opacity = s.fillEnabled ? '1' : '.42';
    setInputValue('lineCap', s.lineCap);
    setInputValue('lineJoin', s.lineJoin);
    setInputValue('dashPattern', (s.dash || []).join(', '));
    setInputValue('blendMode', s.blendMode);
    setInputValue('shadowColor', colorWithoutAlpha(s.shadowColor));
    setInputValue('shadowColorText', s.shadowColor);
    setInputValue('shadowBlur', s.shadowBlur);
    $('#shadowBlurOutput').value = `${Math.round(s.shadowBlur)}px`;
    setInputValue('shadowOffsetX', s.shadowOffsetX);
    setInputValue('shadowOffsetY', s.shadowOffsetY);
    setInputValue('glowEnabled', s.glowEnabled, { checked: true });
    setInputValue('glowColor', colorWithoutAlpha(s.glowColor));
    setInputValue('glowColorText', s.glowColor);
    setInputValue('glowBlur', s.glowBlur);
    $('#glowBlurOutput').value = `${Math.round(s.glowBlur)}px`;
    setInputValue('glowStrength', s.glowStrength);
    $('#glowStrengthOutput').value = `${round(s.glowStrength, 2)}×`;
    $$('.glow-group label:not(.switch)').forEach(label => label.style.opacity = s.glowEnabled ? '1' : '.42');

    setInputValue('elementName', el.name);
    setInputValue('elementSymmetry', el.symmetry, { checked: true });
    setInputValue('elementVisible', el.visible, { checked: true });
    setInputValue('elementLocked', el.locked, { checked: true });
    $('#pathGeometryGroup').hidden = el.type !== 'path';
    $('#circleGeometryGroup').hidden = el.type !== 'circle';
    $('#textGeometryGroup').hidden = el.type !== 'text';
    if (el.type === 'path') setInputValue('pathClosed', el.closed, { checked: true });
    if (el.type === 'circle') {
      setInputValue('circleX', round(el.x, 2)); setInputValue('circleY', round(el.y, 2));
      setInputValue('circleRX', round(el.rx, 2)); setInputValue('circleRY', round(el.ry, 2));
    }
    if (el.type === 'text') {
      setInputValue('textContent', el.text); setInputValue('fontSize', el.fontSize);
      setInputValue('fontFamily', el.fontFamily); setInputValue('textAlign', el.textAlign);
    }

    const a = el.animation;
    setInputValue('animationMode', a.mode);
    setInputValue('animationStart', round(a.start, 3));
    setInputValue('animationDuration', round(a.duration, 3));
    setInputValue('animationEasing', a.easing);
    setInputValue('animationDirection', a.direction);
    setInputValue('copyStagger', round(a.copyStagger, 3));
    setInputValue('copyOrder', a.copyOrder);
    setInputValue('holdAfter', a.holdAfter, { checked: true });
  }

  if (includeDocument) {
    setInputValue('documentName', project.document.name);
    setInputValue('documentWidth', project.document.width);
    setInputValue('documentHeight', project.document.height);
    setInputValue('transparentBackground', project.document.transparent, { checked: true });
    setInputValue('backgroundColor', colorWithoutAlpha(project.document.background));
    setInputValue('backgroundColorText', project.document.background);
    $('#backgroundColorRow').style.opacity = project.document.transparent ? '.42' : '1';
    setInputValue('symmetryEnabled', project.symmetry.enabled, { checked: true });
    setInputValue('symmetryCount', project.symmetry.count);
    setInputValue('symmetryOffset', project.symmetry.offset);
    setInputValue('symmetryMirror', project.symmetry.mirror, { checked: true });
    setInputValue('symmetryCenterX', round(project.symmetry.centerX, 2));
    setInputValue('symmetryCenterY', round(project.symmetry.centerY, 2));
    setInputValue('snapEnabled', project.snap.enabled, { checked: true });
    setInputValue('snapGrid', project.snap.grid, { checked: true });
    setInputValue('gridSize', project.snap.gridSize);
    setInputValue('snapCenter', project.snap.center, { checked: true });
    setInputValue('snapRadial', project.snap.radial, { checked: true });
    setInputValue('snapAngles', project.snap.angles, { checked: true });
    setInputValue('angleStep', project.snap.angleStep);
    setInputValue('snapThreshold', project.snap.threshold);
    setInputValue('durationInput', project.animation.duration);
    setInputValue('fpsInput', project.animation.fps);
    setInputValue('loopInput', project.animation.loop, { checked: true });
  }
}

function renderTimelineRuler() {
  const duration = Math.max(.1, project.animation.duration);
  const intervals = duration <= 3 ? 6 : duration <= 10 ? 10 : 12;
  dom.timelineRuler.innerHTML = Array.from({ length: intervals + 1 }, (_, i) => {
    const t = duration * i / intervals;
    return `<span class="ruler-tick" style="left:${i / intervals * 100}%">${round(t, 1)}</span>`;
  }).join('') + '<span class="timeline-playhead"></span>';
}

function renderTimeline() {
  const selectedIds = reconcileElementSelection();
  renderTimelineRuler();
  if (!project.elements.length) {
    dom.timelineTracks.innerHTML = `<div class="timeline-empty">${escapeHtml(T('tl.empty'))}</div>`;
    ui.timelineBars = new Map();
    ui.timelinePlayheads = $$('.timeline-playhead');
    updateTimelinePlayhead();
    return;
  }
  const total = Math.max(.05, project.animation.duration);
  dom.timelineTracks.innerHTML = project.elements.slice().reverse().map(el => {
    const a = el.animation;
    const isNone = a.mode === 'none';
    const start = isNone ? 0 : clamp(a.start, 0, total);
    const duration = isNone ? total : Math.max(.05, a.duration);
    const left = start / total * 100;
    const width = clamp(duration / total * 100, .8, 100 - left);
    const classes = `${selectedIds.has(el.id) ? 'selected' : ''} ${el.id === project.selectedId ? 'primary' : ''}`;
    return `<div class="timeline-row ${classes}" data-id="${el.id}">
      <button class="timeline-name-cell" data-timeline-select="${el.id}" title="${escapeHtml(el.name)}"><span class="layer-swatch" style="background:${colorWithoutAlpha(el.style.stroke)};color:${colorWithoutAlpha(el.style.glowColor || el.style.stroke)}"></span>${escapeHtml(el.name)}</button>
      <div class="timeline-track" data-track-id="${el.id}">
        <div class="timeline-bar ${isNone ? 'mode-none' : ''}" data-bar-id="${el.id}" style="left:${left}%;width:${width}%" title="${escapeHtml(T('tl.barTitle', round(start, 2), round(duration, 2)))}">
          ${isNone ? '' : '<i class="timeline-handle left" data-edge="left"></i>'}
          <span>${escapeHtml(motionLabel(a.mode))}</span>
          ${isNone ? '' : '<i class="timeline-handle right" data-edge="right"></i>'}
        </div>
        <span class="timeline-playhead"></span>
      </div>
    </div>`;
  }).join('');
  ui.timelineBars = new Map($$('[data-bar-id]', dom.timelineTracks).map(bar => [bar.dataset.barId, bar]));
  ui.timelinePlayheads = $$('.timeline-playhead');
  updateTimelinePlayhead();
}

function updateTimelineBar(el) {
  const bar = ui.timelineBars.get(el.id);
  if (!bar) return;
  const total = Math.max(.05, project.animation.duration);
  const start = clamp(Number(el.animation.start) || 0, 0, total);
  const duration = Math.max(.05, Number(el.animation.duration) || .05);
  const left = start / total * 100;
  const width = clamp(duration / total * 100, .8, 100 - left);
  bar.style.left = `${left}%`;
  bar.style.width = `${width}%`;
  bar.title = T('tl.barTitle', round(start, 2), round(duration, 2));
}

function updateTimelinePlayhead() {
  const percent = clamp((project.animation.playhead || 0) / Math.max(.001, project.animation.duration), 0, 1) * 100;
  if (!ui.timelinePlayheads.length) ui.timelinePlayheads = $$('.timeline-playhead');
  ui.timelinePlayheads.forEach(line => line.style.left = `${percent}%`);
  dom.timeReadout.textContent = T('tl.readout', (project.animation.playhead || 0).toFixed(2), project.animation.duration.toFixed(2));
}

function refreshAll() {
  renderLayers();
  refreshInspectors(true);
  renderTimeline();
  renderEditor();
  updateZoomLabel();
  updateUndoRedoButtons();
}

function switchPanel(tab) {
  $$('.panel-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  $$('.panel-page').forEach(page => page.classList.toggle('active', page.dataset.page === tab));
}

function beginBoundControl() { beginTransaction(); }
function commitBoundControl() { commitTransaction(); }

function bindControl(id, setter, options = {}) {
  const input = $(`#${id}`);
  if (!input) return;
  const eventName = options.event || (input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input');
  const parse = options.parse || (value => value);
  input.addEventListener('focus', beginBoundControl);
  input.addEventListener('pointerdown', beginBoundControl);
  input.addEventListener(eventName, () => {
    const raw = input.type === 'checkbox' ? input.checked : input.value;
    try { setter(parse(raw), input); } catch (error) { console.warn(error); }
    setDirty();
    options.afterInput?.();
    if (!options.afterInput) renderEditor();
    if (eventName === 'change') commitBoundControl();
  });
  if (eventName !== 'change') input.addEventListener('change', () => {
    options.afterChange?.();
    commitBoundControl();
  });
  input.addEventListener('blur', () => {
    if (transactionSnapshot) commitBoundControl();
  });
}

function bindColorPair(colorId, textId, getterTarget, prop, afterInput = renderEditor) {
  const apply = value => {
    const target = getterTarget();
    if (!target) return;
    target[prop] = parseHexColor(value, target[prop] || '#FFFFFF');
    afterInput();
  };
  bindControl(colorId, value => {
    const target = getterTarget(); if (!target) return;
    const alpha = String(target[prop] || '').length === 9 ? String(target[prop]).slice(7, 9) : '';
    target[prop] = parseHexColor(value) + alpha;
    setInputValue(textId, target[prop]); afterInput();
  }, { afterInput: () => {} });
  bindControl(textId, apply, { afterInput: () => {} });
}

function selectedStyle() { return selectedElement()?.style || null; }
function selectedAnimation() { return selectedElement()?.animation || null; }

function autoSequence(mode = 'layers') {
  const visible = project.elements.filter(el => el.visible);
  if (!visible.length) return;
  pushHistory();
  let ordered = visible.slice();
  if (mode === 'center') {
    const center = { x: project.symmetry.centerX, y: project.symmetry.centerY };
    ordered.sort((a, b) => dist(elementCenter(a), center) - dist(elementCenter(b), center));
  }
  const step = project.animation.duration / Math.max(ordered.length + .5, 1);
  const effectDuration = clamp(step * 1.65, .25, Math.max(.3, project.animation.duration * .55));
  ordered.forEach((el, index) => {
    el.animation.start = round(index * step, 3);
    el.animation.duration = round(Math.min(effectDuration, project.animation.duration - el.animation.start + .05), 3);
    if (el.animation.mode === 'none') el.animation.mode = el.type === 'text' ? 'fadeIn' : 'drawGlow';
  });
  setDirty(); refreshAll(); toast(mode === 'center' ? T('msg.sequencedCenter') : T('msg.sequencedLayer'), 'success');
}

function reverseSequence() {
  if (!project.elements.length) return;
  pushHistory();
  const total = project.animation.duration;
  for (const el of project.elements) {
    if (el.animation.mode === 'none') continue;
    el.animation.start = round(clamp(total - (el.animation.start + el.animation.duration), 0, total), 3);
  }
  setDirty(); refreshAll(); toast(T('msg.sequenceReversed'));
}

// ---------- Playback, timeline interaction, project actions ----------

function seekTime(time, render = true) {
  project.animation.playhead = clamp(Number(time) || 0, 0, project.animation.duration);
  updateTimelinePlayhead();
  if (render) scheduleEditorRender(project.animation.playhead);
  updateExportPreview();
}

function playbackFrame(timestamp) {
  if (!ui.playing) return;
  const elapsed = (timestamp - ui.playbackStart) / 1000;
  let time = ui.playbackOrigin + elapsed;
  const total = Math.max(.01, project.animation.duration);
  if (project.animation.loop) time %= total;
  else if (time >= total) {
    time = total;
    ui.playing = false;
    dom.playBtn.textContent = '▶';
  }
  project.animation.playhead = time;
  const playbackFps = clamp(Math.round(project.animation.fps) || 24, 1, 60);
  const frameIndex = Math.floor(time * playbackFps + 1e-7);
  if (!ui.playing || frameIndex !== ui.lastPlaybackFrame) {
    ui.lastPlaybackFrame = frameIndex;
    renderEditor(time);
    updateTimelinePlayhead();
  }
  if (ui.playing) ui.raf = requestAnimationFrame(playbackFrame);
}

function togglePlayback(force) {
  const shouldPlay = force ?? !ui.playing;
  if (shouldPlay === ui.playing) return;
  ui.playing = shouldPlay;
  cancelAnimationFrame(ui.raf);
  if (shouldPlay) {
    if (project.animation.playhead >= project.animation.duration - .001) project.animation.playhead = 0;
    ui.playbackStart = performance.now();
    ui.playbackOrigin = project.animation.playhead;
    ui.lastPlaybackFrame = -1;
    dom.playBtn.textContent = '❚❚';
    ui.raf = requestAnimationFrame(playbackFrame);
  } else {
    dom.playBtn.textContent = '▶';
    renderEditor(project.animation.playhead);
    updateTimelinePlayhead();
    updateExportPreview();
  }
}

function stopPlayback() {
  togglePlayback(false);
  seekTime(0);
}

function timelinePointerDown(event) {
  const bar = event.target.closest('.timeline-bar');
  if (bar) {
    const el = project.elements.find(item => item.id === bar.dataset.barId);
    if (!el || el.animation.mode === 'none') { if (el) selectElement(el.id); return; }
    selectElement(el.id, false);
    beginTransaction();
    const track = bar.parentElement;
    const rect = track.getBoundingClientRect();
    ui.timelineDrag = {
      id: el.id,
      kind: event.target.dataset.edge || 'move',
      startX: event.clientX,
      trackWidth: rect.width,
      originalStart: Number(el.animation.start),
      originalDuration: Number(el.animation.duration)
    };
    refreshInspectors(false); updateLayerSelectionOnly();
    event.preventDefault();
    return;
  }
  const track = event.target.closest('.timeline-track');
  if (track) {
    const rect = track.getBoundingClientRect();
    seekTime((event.clientX - rect.left) / rect.width * project.animation.duration);
    ui.timelineDrag = { kind: 'playhead', trackRect: rect };
    event.preventDefault();
  }
}

function timelinePointerMove(event) {
  if (!ui.timelineDrag) return;
  if (ui.timelineDrag.kind === 'playhead') {
    const rect = ui.timelineDrag.trackRect;
    seekTime((event.clientX - rect.left) / rect.width * project.animation.duration);
    return;
  }
  const el = project.elements.find(item => item.id === ui.timelineDrag.id);
  if (!el) return;
  const delta = (event.clientX - ui.timelineDrag.startX) / Math.max(1, ui.timelineDrag.trackWidth) * project.animation.duration;
  const minDuration = .05;
  if (ui.timelineDrag.kind === 'left') {
    const end = ui.timelineDrag.originalStart + ui.timelineDrag.originalDuration;
    const nextStart = clamp(ui.timelineDrag.originalStart + delta, 0, end - minDuration);
    el.animation.start = round(nextStart, 3);
    el.animation.duration = round(end - nextStart, 3);
  } else if (ui.timelineDrag.kind === 'right') {
    el.animation.duration = round(clamp(ui.timelineDrag.originalDuration + delta, minDuration, Math.max(minDuration, project.animation.duration - ui.timelineDrag.originalStart)), 3);
  } else {
    el.animation.start = round(clamp(ui.timelineDrag.originalStart + delta, 0, Math.max(0, project.animation.duration - minDuration)), 3);
  }
  setDirty(); updateTimelineBar(el); scheduleInspectorRefresh(); scheduleEditorRender();
}

function timelinePointerUp() {
  if (!ui.timelineDrag) return;
  const wasEdit = ui.timelineDrag.kind !== 'playhead';
  ui.timelineDrag = null;
  if (wasEdit) commitTransaction();
}

function saveProjectFile() {
  const data = JSON.stringify(project, null, 2);
  downloadBlob(new Blob([data], { type: 'application/json' }), `${safeFilename(project.document.name)}-${nowNameDate()}.arcana.json`);
  ui.projectDirty = false;
  status(T('msg.projectSavedStatus'));
  toast(T('msg.projectSaved'), 'success');
}

async function loadProjectFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const next = migrateProject(JSON.parse(text));
    pushHistory();
    project = next;
    ui.draft = null; ui.drag = null; ui.selectedNode = null;
    ui.projectDirty = false;
    fitView(); refreshAll();
    toast(T('msg.projectLoaded'), 'success');
  } catch (error) {
    console.error(error);
    toast(T('msg.loadFailed', error.message), 'error');
  }
}

function replaceProject(nextProject, message) {
  pushHistory();
  project = migrateProject(nextProject);
  ui.draft = null; ui.drag = null; ui.selectedNode = null;
  project.animation.playhead = project.animation.duration;
  setDirty(); fitView(); refreshAll();
  if (message) toast(message, 'success');
}

function applyTemplate(type) {
  if (type === 'classic') replaceProject(createClassicProject(), T('msg.templateClassic'));
  else if (type === 'rune') replaceProject(createRuneProject(), T('msg.templateRune'));
  else if (type === 'sigil') {
    replaceProject(createSigilProject(), T('msg.templateSigil'));
    setTool('freehand');
  } else if (type === 'blank') {
    const next = deepClone(project);
    next.elements = []; next.selectedId = null; next.animation.playhead = next.animation.duration;
    replaceProject(next, T('msg.templateBlank'));
  }
}

function newBlankProject() {
  const p = baseProject(T('name.newProject'), 1000, 1000);
  p.selectedId = null;
  replaceProject(p, T('msg.newDocument'));
}

function openModal(dialog) {
  dom.modalBackdrop.hidden = false;
  if (!dialog.open) dialog.showModal();
}

function closeModal(dialog) {
  if (dialog?.open) dialog.close();
}

function updateBackdrop() {
  const anyOpen = [dom.exportDialog, dom.helpDialog, dom.licensesDialog].some(dialog => dialog.open);
  dom.modalBackdrop.hidden = !anyOpen;
}

// ---------- Export ----------

class ExportCancelled extends Error { constructor() { super(T('export.cancelled')); this.name = 'ExportCancelled'; } }

function getExportOptions() {
  const scale = clamp(Number($('#exportScale').value) || 1, .1, 4);
  const duration = clamp(Number($('#exportDuration').value) || project.animation.duration, .1, 60);
  const fps = clamp(Math.round(Number($('#exportFps').value) || project.animation.fps), 1, 60);
  const quality = clamp(Math.round(Number($('#exportQuality').value) || 90), 1, 100);
  const width = Math.max(1, Math.round(project.document.width * scale));
  const height = Math.max(1, Math.round(project.document.height * scale));
  return { scale, duration, fps, quality, width, height, transparent: $('#exportTransparent').checked };
}

function syncExportSettings() {
  setInputValue('exportDuration', project.animation.duration);
  setInputValue('exportFps', project.animation.fps);
  setInputValue('exportTransparent', project.document.transparent, { checked: true });
  $('#exportQualityOutput').value = $('#exportQuality').value;
  updateExportSizeReadout();
}

function updateExportSizeReadout() {
  const opts = getExportOptions();
  dom.exportSizeReadout.textContent = `${opts.width.toLocaleString()} × ${opts.height.toLocaleString()} px`;
  dom.exportPreviewLabel.textContent = T('export.previewLabel', opts.width, opts.height, project.animation.playhead.toFixed(2));
}

function renderToCanvas(canvas, time, options) {
  const targetCtx = canvas.getContext('2d', { alpha: true, willReadFrequently: Boolean(options.readPixels) });
  targetCtx.setTransform(1, 0, 0, 1, 0, 0);
  const scaleX = canvas.width / project.document.width;
  const scaleY = canvas.height / project.document.height;
  targetCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  renderDocument(targetCtx, time, { editor: false, transparent: options.transparent });
  targetCtx.setTransform(1, 0, 0, 1, 0, 0);
  return targetCtx;
}

function updateExportPreview() {
  if (!dom.exportDialog.open) return;
  if (ui.exportPreviewRaf) return;
  ui.exportPreviewRaf = requestAnimationFrame(() => {
    ui.exportPreviewRaf = 0;
    renderExportPreview();
  });
}

function renderExportPreview() {
  if (!dom.exportDialog.open) return;
  const maxWidth = 390, maxHeight = 310;
  const scale = Math.min(maxWidth / project.document.width, maxHeight / project.document.height, 1);
  dom.exportPreview.width = Math.max(1, Math.round(project.document.width * scale));
  dom.exportPreview.height = Math.max(1, Math.round(project.document.height * scale));
  renderToCanvas(dom.exportPreview, project.animation.playhead, { transparent: $('#exportTransparent').checked, readPixels: false });
  updateExportSizeReadout();
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(T('export.encodeFailed', type))), type, quality));
}

function setExportProgress(value, title, detail = '') {
  dom.exportProgressArea.hidden = false;
  dom.exportProgress.value = clamp(value, 0, 1);
  dom.exportProgressTitle.textContent = title;
  dom.exportProgressText.textContent = detail || `${Math.round(value * 100)}%`;
}

function setExportBusy(busy) {
  ui.exportBusy = busy;
  $$('.format-btn').forEach(button => button.disabled = busy);
  $('#cancelExportBtn').disabled = !busy;
  if (!busy) setTimeout(() => { if (!ui.exportBusy) dom.exportProgressArea.hidden = true; }, 900);
}

function checkExportLimits(opts, format) {
  const frameCount = Math.ceil(opts.duration * opts.fps);
  if (opts.width > 8192 || opts.height > 8192) throw new Error(T('export.tooLarge'));
  if (frameCount > 900) throw new Error(T('export.tooManyFrames', frameCount));
  const pixelCount = opts.width * opts.height;
  const rawFrameBytes = pixelCount * 4;
  const normalizedFormat = String(format).toLowerCase();
  const retainedBytes = normalizedFormat === 'gif'
    ? pixelCount * 1.25 * frameCount
    : normalizedFormat === 'webp'
      ? pixelCount * 1.5 * frameCount
      : rawFrameBytes * frameCount;
  const workingBytes = normalizedFormat === 'apng' ? rawFrameBytes * 4 : rawFrameBytes * 2;
  const bytes = retainedBytes + workingBytes;
  const reportedMemoryGb = typeof navigator === 'object' ? Number(navigator.deviceMemory) || 0 : 0;
  const memoryLimit = reportedMemoryGb
    ? clamp(reportedMemoryGb * 1024 ** 3 * .12, 512 * 1024 ** 2, 768 * 1024 ** 2)
    : 512 * 1024 ** 2;
  if (bytes > memoryLimit) {
    const estimateMb = Math.ceil(bytes / 1024 / 1024);
    throw new Error(T('export.tooMuchMemory', estimateMb));
  }
  if (opts.width * opts.height > 16_800_000) {
    const ok = confirm(T('export.confirmHuge'));
    if (!ok) throw new ExportCancelled();
  }
  return frameCount;
}

function createExportCanvas(opts) {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width; canvas.height = opts.height;
  return canvas;
}

async function exportStatic(format, opts) {
  checkExportLimits({ ...opts, duration: 1, fps: 1 }, 'static');
  const canvas = createExportCanvas(opts);
  renderToCanvas(canvas, project.animation.playhead, { transparent: opts.transparent, readPixels: false });
  setExportProgress(.55, T('export.step.currentFrame'), format.toUpperCase());
  let blob, extension;
  if (format === 'png') {
    blob = await canvasToBlob(canvas, 'image/png'); extension = 'png';
  } else {
    blob = await canvasToBlob(canvas, 'image/webp', opts.quality / 100);
    if (blob.type !== 'image/webp') throw new Error(T('export.noStaticWebp'));
    extension = 'webp';
  }
  if (ui.exportAbort) throw new ExportCancelled();
  setExportProgress(1, T('export.step.ready'), `${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  downloadBlob(blob, `${safeFilename(project.document.name)}-${project.animation.playhead.toFixed(2)}s.${extension}`);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function asciiBytes(text) {
  const result = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) result[i] = text.charCodeAt(i) & 255;
  return result;
}

function uint16LE(value) {
  return new Uint8Array([value & 255, value >>> 8 & 255]);
}

function uint16BE(value) {
  return new Uint8Array([value >>> 8 & 255, value & 255]);
}

function uint24LE(value) {
  return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255]);
}

function uint32LE(value) {
  return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]);
}

function uint32BE(value) {
  return new Uint8Array([value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255]);
}

function setUint16BE(target, offset, value) {
  target[offset] = value >>> 8 & 255;
  target[offset + 1] = value & 255;
}

function setUint32BE(target, offset, value) {
  target[offset] = value >>> 24 & 255;
  target[offset + 1] = value >>> 16 & 255;
  target[offset + 2] = value >>> 8 & 255;
  target[offset + 3] = value & 255;
}

function readUint32LE(source, offset) {
  return (source[offset] | source[offset + 1] << 8 | source[offset + 2] << 16 | source[offset + 3] << 24) >>> 0;
}

function readFourCC(source, offset) {
  return String.fromCharCode(source[offset], source[offset + 1], source[offset + 2], source[offset + 3]);
}

// GIF: fixed palette + frequently reset 9-bit LZW stream. This intentionally
// favors reliability and low memory use over maximum compression.
function createGifPalette(hasTransparency) {
  const palette = new Uint8Array(256 * 3);
  let index = hasTransparency ? 1 : 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        const offset = index * 3;
        palette[offset] = Math.round(r * 255 / 5);
        palette[offset + 1] = Math.round(g * 255 / 5);
        palette[offset + 2] = Math.round(b * 255 / 5);
        index++;
      }
    }
  }
  const grayStart = index;
  while (index < 256) {
    const count = Math.max(1, 256 - grayStart - 1);
    const gray = Math.round((index - grayStart) * 255 / count);
    const offset = index * 3;
    palette[offset] = palette[offset + 1] = palette[offset + 2] = gray;
    index++;
  }
  return palette;
}

function rgbaToGifIndices(rgba, hasTransparency) {
  const pixels = new Uint8Array(rgba.length / 4);
  const base = hasTransparency ? 1 : 0;
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    if (hasTransparency && rgba[i + 3] < 128) {
      pixels[p] = 0;
      continue;
    }
    const r = Math.min(5, Math.round(rgba[i] * 5 / 255));
    const g = Math.min(5, Math.round(rgba[i + 1] * 5 / 255));
    const b = Math.min(5, Math.round(rgba[i + 2] * 5 / 255));
    pixels[p] = base + r * 36 + g * 6 + b;
  }
  return pixels;
}

function gifLiteralLzw(indices) {
  const codeCount = indices.length + Math.ceil(indices.length / 200) + 2;
  const bytes = new Uint8Array(Math.ceil(codeCount * 9 / 8) + 1);
  let byteLength = 0;
  let bitBuffer = 0;
  let bitCount = 0;
  const writeCode = code => {
    bitBuffer |= code << bitCount;
    bitCount += 9;
    while (bitCount >= 8) {
      bytes[byteLength++] = bitBuffer & 255;
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  const clearCode = 256;
  const endCode = 257;
  writeCode(clearCode);
  let literalsSinceClear = 0;
  for (let i = 0; i < indices.length; i++) {
    writeCode(indices[i]);
    literalsSinceClear++;
    // A clear code before the 9-bit dictionary fills keeps code width fixed.
    if (literalsSinceClear >= 200 && i < indices.length - 1) {
      writeCode(clearCode);
      literalsSinceClear = 0;
    }
  }
  writeCode(endCode);
  if (bitCount > 0) bytes[byteLength++] = bitBuffer & 255;
  return bytes.subarray(0, byteLength);
}

function gifSubBlocks(data) {
  const blockCount = Math.ceil(data.length / 255);
  const result = new Uint8Array(data.length + blockCount + 1);
  let targetOffset = 0;
  for (let sourceOffset = 0; sourceOffset < data.length; sourceOffset += 255) {
    const block = data.subarray(sourceOffset, Math.min(data.length, sourceOffset + 255));
    result[targetOffset++] = block.length;
    result.set(block, targetOffset);
    targetOffset += block.length;
  }
  result[targetOffset] = 0;
  return result;
}

function gifFrameDelay(index, fps) {
  const safeFps = clamp(Math.round(fps) || 1, 1, 60);
  const start = Math.round(index * 100 / safeFps);
  const end = Math.round((index + 1) * 100 / safeFps);
  return Math.max(1, end - start);
}

async function exportGif(opts) {
  const frameCount = checkExportLimits(opts, 'gif');
  const canvas = createExportCanvas(opts);
  const frameCtx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const palette = createGifPalette(opts.transparent);
  const parts = [
    asciiBytes('GIF89a'),
    uint16LE(opts.width), uint16LE(opts.height),
    new Uint8Array([0xF7, 0, 0]),
    palette
  ];
  if (project.animation.loop) {
    parts.push(
      new Uint8Array([0x21, 0xFF, 0x0B]), asciiBytes('NETSCAPE2.0'),
      new Uint8Array([0x03, 0x01, 0x00, 0x00, 0x00])
    );
  }
  for (let i = 0; i < frameCount; i++) {
    if (ui.exportAbort) throw new ExportCancelled();
    renderToCanvas(canvas, i / opts.fps, { transparent: opts.transparent, readPixels: true });
    const rgba = frameCtx.getImageData(0, 0, opts.width, opts.height).data;
    const indices = rgbaToGifIndices(rgba, opts.transparent);
    const compressed = gifLiteralLzw(indices);
    const packed = ((opts.transparent ? 2 : 1) << 2) | (opts.transparent ? 1 : 0);
    const delay = gifFrameDelay(i, opts.fps);
    parts.push(
      new Uint8Array([0x21, 0xF9, 0x04, packed]),
      uint16LE(delay),
      new Uint8Array([0, 0]),
      new Uint8Array([0x2C]),
      uint16LE(0), uint16LE(0), uint16LE(opts.width), uint16LE(opts.height),
      new Uint8Array([0, 8])
    );
    parts.push(gifSubBlocks(compressed));
    setExportProgress((i + 1) / frameCount * .98, T('export.step.gif'), `${i + 1} / ${frameCount}`);
    if (i % 2 === 0 || i === frameCount - 1) {
      await nextFrame();
      if (ui.exportAbort) throw new ExportCancelled();
    }
  }
  if (ui.exportAbort) throw new ExportCancelled();
  parts.push(new Uint8Array([0x3B]));
  const blob = new Blob(parts, { type: 'image/gif' });
  setExportProgress(1, T('export.step.gifReady'), `${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  downloadBlob(blob, `${safeFilename(project.document.name)}.gif`);
}

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = PNG_CRC_TABLE[(crc ^ data[i]) & 255] ^ crc >>> 8;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data = new Uint8Array()) {
  const typeBytes = asciiBytes(type);
  return concatBytes([uint32BE(data.length), typeBytes, data, uint32BE(crc32(concatBytes([typeBytes, data])))]);
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (let offset = 0; offset < data.length; offset += 5552) {
    const end = Math.min(data.length, offset + 5552);
    for (let i = offset; i < end; i++) {
      a += data[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function zlibStore(data) {
  const parts = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < data.length; offset += 65535) {
    const block = data.subarray(offset, Math.min(data.length, offset + 65535));
    const finalBlock = offset + block.length >= data.length;
    const length = block.length;
    parts.push(new Uint8Array([
      finalBlock ? 1 : 0,
      length & 255, length >>> 8 & 255,
      (~length) & 255, (~length) >>> 8 & 255
    ]), block);
  }
  parts.push(uint32BE(adler32(data)));
  return concatBytes(parts);
}

async function deflateZlib(data) {
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      console.warn(T('export.compressionFallback'), error);
    }
  }
  return zlibStore(data);
}

function rgbaToPngScanlines(frame, width, height) {
  const rowBytes = width * 4;
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const target = y * (rowBytes + 1);
    raw[target] = 0;
    raw.set(frame.subarray(y * rowBytes, (y + 1) * rowBytes), target + 1);
  }
  return raw;
}

async function exportApng(opts) {
  const frameCount = checkExportLimits(opts, 'apng');
  const canvas = createExportCanvas(opts);
  const frameCtx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const ihdr = new Uint8Array(13);
  setUint32BE(ihdr, 0, opts.width);
  setUint32BE(ihdr, 4, opts.height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const animationControl = concatBytes([uint32BE(frameCount), uint32BE(project.animation.loop ? 0 : 1)]);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('acTL', animationControl)
  ];
  let sequence = 0;
  for (let i = 0; i < frameCount; i++) {
    if (ui.exportAbort) throw new ExportCancelled();
    renderToCanvas(canvas, i / opts.fps, { transparent: opts.transparent, readPixels: true });
    const rgba = frameCtx.getImageData(0, 0, opts.width, opts.height).data;
    const frameControl = new Uint8Array(26);
    setUint32BE(frameControl, 0, sequence++);
    setUint32BE(frameControl, 4, opts.width);
    setUint32BE(frameControl, 8, opts.height);
    setUint32BE(frameControl, 12, 0);
    setUint32BE(frameControl, 16, 0);
    setUint16BE(frameControl, 20, 1);
    setUint16BE(frameControl, 22, opts.fps);
    frameControl[24] = 0; // dispose: none
    frameControl[25] = 0; // blend: source
    parts.push(pngChunk('fcTL', frameControl));
    const compressed = await deflateZlib(rgbaToPngScanlines(rgba, opts.width, opts.height));
    if (ui.exportAbort) throw new ExportCancelled();
    if (i === 0) parts.push(pngChunk('IDAT', compressed));
    else parts.push(pngChunk('fdAT', concatBytes([uint32BE(sequence++), compressed])));
    setExportProgress((i + 1) / frameCount * .98, T('export.step.apng'), `${i + 1} / ${frameCount}`);
    await nextFrame();
    if (ui.exportAbort) throw new ExportCancelled();
  }
  if (ui.exportAbort) throw new ExportCancelled();
  parts.push(pngChunk('IEND'));
  const blob = new Blob(parts, { type: 'image/apng' });
  setExportProgress(1, T('export.step.apngReady'), `${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  downloadBlob(blob, `${safeFilename(project.document.name)}.apng`);
}

function webpChunk(type, data) {
  const padding = data.length & 1 ? new Uint8Array([0]) : new Uint8Array();
  return concatBytes([asciiBytes(type), uint32LE(data.length), data, padding]);
}

function extractWebpFrameData(source) {
  if (readFourCC(source, 0) !== 'RIFF' || readFourCC(source, 8) !== 'WEBP') {
    throw new Error(T('export.badWebpFrame'));
  }
  const chunks = [];
  for (let offset = 12; offset + 8 <= source.length;) {
    const type = readFourCC(source, offset);
    const size = readUint32LE(source, offset + 4);
    const paddedEnd = offset + 8 + size + (size & 1);
    if (paddedEnd > source.length) throw new Error(T('export.corruptWebpFrame'));
    if (type === 'ALPH' || type === 'VP8 ' || type === 'VP8L') chunks.push(source.slice(offset, paddedEnd));
    offset = paddedEnd;
  }
  if (!chunks.some(chunk => {
    const type = readFourCC(chunk, 0);
    return type === 'VP8 ' || type === 'VP8L';
  })) throw new Error(T('export.noWebpBitstream'));
  return concatBytes(chunks);
}

function backgroundBgra(transparent) {
  if (transparent) return new Uint8Array([0, 0, 0, 0]);
  const color = parseHexColor(project.document.background).slice(1, 7);
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  return new Uint8Array([b, g, r, 255]);
}

async function exportAnimatedWebp(opts) {
  const frameCount = checkExportLimits(opts, 'webp');
  const canvas = createExportCanvas(opts);
  const frameChunks = [];
  const delay = Math.max(11, Math.round(1000 / opts.fps));
  for (let i = 0; i < frameCount; i++) {
    if (ui.exportAbort) throw new ExportCancelled();
    renderToCanvas(canvas, i / opts.fps, { transparent: opts.transparent, readPixels: false });
    const still = await canvasToBlob(canvas, 'image/webp', opts.quality / 100);
    if (ui.exportAbort) throw new ExportCancelled();
    if (still.type !== 'image/webp') throw new Error(T('export.noWebp'));
    const frameData = extractWebpFrameData(new Uint8Array(await still.arrayBuffer()));
    if (ui.exportAbort) throw new ExportCancelled();
    const header = concatBytes([
      uint24LE(0), uint24LE(0),
      uint24LE(opts.width - 1), uint24LE(opts.height - 1),
      uint24LE(delay),
      new Uint8Array([0x02]) // full-frame overwrite, no disposal
    ]);
    frameChunks.push(webpChunk('ANMF', concatBytes([header, frameData])));
    setExportProgress((i + 1) / frameCount * .92, T('export.step.webp'), `${i + 1} / ${frameCount}`);
    if (i % 2 === 0 || i === frameCount - 1) {
      await nextFrame();
      if (ui.exportAbort) throw new ExportCancelled();
    }
  }
  if (ui.exportAbort) throw new ExportCancelled();
  const vp8x = concatBytes([
    new Uint8Array([0x02 | (opts.transparent ? 0x10 : 0), 0, 0, 0]),
    uint24LE(opts.width - 1), uint24LE(opts.height - 1)
  ]);
  const anim = concatBytes([backgroundBgra(opts.transparent), uint16LE(project.animation.loop ? 0 : 1)]);
  const bodyParts = [asciiBytes('WEBP'), webpChunk('VP8X', vp8x), webpChunk('ANIM', anim), ...frameChunks];
  const bodyLength = bodyParts.reduce((sum, part) => sum + part.length, 0);
  const blob = new Blob([asciiBytes('RIFF'), uint32LE(bodyLength), ...bodyParts], { type: 'image/webp' });
  setExportProgress(1, T('export.step.webpReady'), `${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  downloadBlob(blob, `${safeFilename(project.document.name)}.webp`);
}


async function runExport(format) {
  if (ui.exportBusy) return;
  ui.exportAbort = false;
  setExportBusy(true);
  const opts = getExportOptions();
  try {
    if (format === 'png' || format === 'static-webp') await exportStatic(format === 'png' ? 'png' : 'webp', opts);
    else if (format === 'gif') await exportGif(opts);
    else if (format === 'apng') await exportApng(opts);
    else if (format === 'webp') await exportAnimatedWebp(opts);
    toast(T('export.done'), 'success');
  } catch (error) {
    if (error instanceof ExportCancelled) toast(T('export.cancelledToast'));
    else {
      console.error(error);
      toast(T('export.failed', error.message), 'error');
      setExportProgress(0, T('export.failedTitle'), error.message);
    }
  } finally {
    ui.exportAbort = false;
    setExportBusy(false);
  }
}

// ---------- Interaction wiring and presets ----------

function afterStyleChange({ layers = false } = {}) {
  const el = selectedElement();
  if (el?.type === 'text') invalidateElementGeometry(el);
  scheduleInspectorRefresh(false);
  if (layers) renderLayers();
  else updateSelectedSwatches();
  scheduleEditorRender();
  updateExportPreview();
}

function afterGeometryChange({ layers = false, timeline = false } = {}) {
  invalidateElementGeometry(selectedElement());
  scheduleInspectorRefresh(false);
  if (layers) renderLayers();
  if (timeline) renderTimeline();
  scheduleEditorRender();
  updateExportPreview();
}

function afterAnimationChange({ structure = false, layers = false } = {}) {
  scheduleInspectorRefresh(false);
  if (structure) renderTimeline();
  else {
    const el = selectedElement();
    if (el) updateTimelineBar(el);
  }
  if (layers) renderLayers();
  scheduleEditorRender();
  updateExportPreview();
}

function afterDocumentChange({ fit = false, layers = false, timeline = false } = {}) {
  scheduleInspectorRefresh(true);
  if (layers) renderLayers();
  if (timeline) renderTimeline();
  updateAlignmentControls();
  if (fit) fitView();
  else scheduleEditorRender();
  updateExportPreview();
}

function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mutateSelectedStyle(prop, value) {
  const style = selectedStyle();
  if (style) style[prop] = value;
}

function mutateSelectedAnimation(prop, value) {
  const animation = selectedAnimation();
  if (animation) animation[prop] = value;
}

function smoothSelectedNode() {
  const el = selectedElement();
  if (!el || el.type !== 'path' || !ui.selectedNode || ui.selectedNode.elementId !== el.id) {
    toast(T('msg.selectNodesFirst'));
    return;
  }
  const index = ui.selectedNode.index;
  const points = el.points;
  if (!points[index] || points.length < 2) return;
  pushHistory();
  const current = points[index];
  const previous = index > 0 ? points[index - 1] : (el.closed ? points.at(-1) : current);
  const next = index < points.length - 1 ? points[index + 1] : (el.closed ? points[0] : current);
  let tx = next.x - previous.x;
  let ty = next.y - previous.y;
  const tangentLength = Math.hypot(tx, ty) || 1;
  tx /= tangentLength; ty /= tangentLength;
  const inLength = previous === current ? 0 : dist(current, previous) / 3;
  const outLength = next === current ? 0 : dist(current, next) / 3;
  current.inX = current.x - tx * inLength;
  current.inY = current.y - ty * inLength;
  current.outX = current.x + tx * outLength;
  current.outY = current.y + ty * outLength;
  current.smooth = true;
  invalidateElementGeometry(el);
  setDirty(); refreshAll();
}

function cornerSelectedNode() {
  const el = selectedElement();
  if (!el || el.type !== 'path' || !ui.selectedNode || ui.selectedNode.elementId !== el.id) {
    toast(T('msg.selectNodesFirst'));
    return;
  }
  const point = el.points[ui.selectedNode.index];
  if (!point) return;
  pushHistory();
  point.inX = point.x; point.inY = point.y;
  point.outX = point.x; point.outY = point.y;
  point.smooth = false;
  invalidateElementGeometry(el);
  setDirty(); refreshAll();
}

function reverseSelectedPath() {
  const el = selectedElement();
  if (!el || el.type !== 'path' || el.points.length < 2) return;
  pushHistory();
  const oldNodeIndex = ui.selectedNode?.elementId === el.id ? ui.selectedNode.index : null;
  el.points.reverse();
  for (const point of el.points) {
    const oldInX = point.inX, oldInY = point.inY;
    point.inX = point.outX; point.inY = point.outY;
    point.outX = oldInX; point.outY = oldInY;
  }
  if (oldNodeIndex != null) ui.selectedNode = { elementId: el.id, index: el.points.length - 1 - oldNodeIndex };
  invalidateElementGeometry(el);
  setDirty(); refreshAll(); toast(T('msg.pathReversed'), 'success');
}

function applyStylePreset(name) {
  const style = selectedStyle();
  if (!style) return;
  const presets = {
    'arcane-blue': {
      stroke: '#7BE8FF', strokeWidth: 5, fillEnabled: false, fill: '#665CFF22', opacity: 1,
      shadowColor: '#2457FF', shadowBlur: 7, shadowOffsetX: 0, shadowOffsetY: 0,
      glowEnabled: true, glowColor: '#58DFFF', glowBlur: 28, glowStrength: 1.4, blendMode: 'screen'
    },
    'holy-gold': {
      stroke: '#FFE59A', strokeWidth: 5, fillEnabled: false, fill: '#FFD45A22', opacity: 1,
      shadowColor: '#C97B19', shadowBlur: 8, shadowOffsetX: 0, shadowOffsetY: 0,
      glowEnabled: true, glowColor: '#FFD35B', glowBlur: 32, glowStrength: 1.55, blendMode: 'screen'
    },
    'blood-red': {
      stroke: '#FF8A92', strokeWidth: 6, fillEnabled: false, fill: '#B70F3524', opacity: 1,
      shadowColor: '#71071F', shadowBlur: 10, shadowOffsetX: 0, shadowOffsetY: 0,
      glowEnabled: true, glowColor: '#FF315F', glowBlur: 30, glowStrength: 1.55, blendMode: 'screen'
    },
    ink: {
      stroke: '#161821', strokeWidth: 7, fillEnabled: false, fill: '#16182118', opacity: 1,
      lineCap: 'round', lineJoin: 'round', shadowColor: '#000000', shadowBlur: 0,
      shadowOffsetX: 0, shadowOffsetY: 0, glowEnabled: false, glowColor: '#000000',
      glowBlur: 0, glowStrength: 0, blendMode: 'source-over'
    }
  };
  if (!presets[name]) return;
  pushHistory();
  Object.assign(style, presets[name]);
  invalidateElementGeometry(selectedElement());
  setDirty(); refreshAll(); toast(T('msg.stylePresetApplied'), 'success');
}

function applyMotionPreset(name) {
  const animation = selectedAnimation();
  if (!animation) return;
  const presets = {
    trace: { mode: 'drawGlow', duration: 1.4, easing: 'easeInOut', direction: 'forward', copyStagger: .045, copyOrder: 'clockwise', holdAfter: true },
    burst: { mode: 'centerSpread', duration: .8, easing: 'overshoot', direction: 'forward', copyStagger: .025, copyOrder: 'alternate', holdAfter: true },
    summon: { mode: 'spinIn', duration: 1.05, easing: 'easeOut', direction: 'forward', copyStagger: .06, copyOrder: 'clockwise', holdAfter: true },
    vanish: { mode: 'fadeOut', duration: .85, easing: 'easeIn', direction: 'forward', copyStagger: .025, copyOrder: 'counter', holdAfter: false }
  };
  if (!presets[name]) return;
  pushHistory();
  Object.assign(animation, presets[name]);
  animation.duration = Math.min(animation.duration, Math.max(.05, project.animation.duration - animation.start));
  setDirty(); refreshAll(); toast(T('msg.motionPresetApplied'), 'success');
}

const ALIGNMENT_ACTIONS = [
  'align-left', 'align-center-x', 'align-right', 'align-top', 'align-center-y', 'align-bottom',
  'distribute-x', 'distribute-y', 'symmetry-center', 'symmetry-guide', 'symmetry-sector',
  'symmetry-radius', 'symmetry-angle-space', 'symmetry-radius-space'
];
const alignmentLabel = action => (ALIGNMENT_ACTIONS.includes(action) ? T(`align.action.${action}`) : '');

function isLayoutElement(el) {
  return Boolean(el && (el.type !== 'path' || el.points?.length));
}

function elementLayoutBounds(el) {
  const bounds = elementBounds(el);
  if (el.type === 'text') return { ...bounds };
  const padding = Math.max(0, Number(el.style?.strokeWidth) || 0) / 2;
  return { minX: bounds.minX - padding, minY: bounds.minY - padding, maxX: bounds.maxX + padding, maxY: bounds.maxY + padding };
}

function announceAlignment(message, type = '') {
  status(message);
  if (dom.alignmentLiveStatus) {
    dom.alignmentLiveStatus.textContent = '';
    requestAnimationFrame(() => { dom.alignmentLiveStatus.textContent = message; });
  }
  toast(message, type);
}

function updateAlignmentControls() {
  if (!dom.alignmentPanel) return;
  const selected = selectedElements();
  const layoutSelected = selected.filter(isLayoutElement);
  const movable = layoutSelected.filter(el => !el.locked);
  const keyElement = selectedElement();
  const reference = dom.alignmentReference?.value || 'canvas';
  const keyTargets = movable.filter(el => el.id !== keyElement?.id);
  const lockedCount = selected.filter(el => el.locked).length;
  dom.alignmentSelectionCount.textContent = selected.length
    ? (lockedCount ? T('align.count.movable', selected.length, movable.length) : T('align.count', selected.length))
    : T('align.count.none');
  $('#selectAllElementsBtn').disabled = !project.elements.some(el => el.visible && !el.locked && isLayoutElement(el));
  $('#clearElementSelectionBtn').disabled = selected.length === 0;

  const standardEnabled = reference === 'canvas'
    ? movable.length >= 1
    : reference === 'selection'
      ? layoutSelected.length >= 2 && movable.length >= 1
      : isLayoutElement(keyElement) && layoutSelected.length >= 2 && keyTargets.length >= 1;
  $$('[data-alignment-action]', dom.alignmentPanel).forEach(button => {
    const action = button.dataset.alignmentAction;
    let enabled = standardEnabled;
    if (action === 'distribute-x' || action === 'distribute-y') enabled = movable.length >= 3;
    else if (action === 'symmetry-center' || action === 'symmetry-guide') enabled = project.symmetry.enabled && movable.length >= 1;
    else if (action === 'symmetry-sector') enabled = project.symmetry.enabled && project.symmetry.count >= 2 && !project.symmetry.mirror && movable.length >= 1;
    else if (action === 'symmetry-radius') enabled = project.symmetry.enabled && isLayoutElement(keyElement) && keyTargets.length >= 1;
    else if (action === 'symmetry-angle-space') enabled = project.symmetry.enabled && project.symmetry.count >= 2 && !project.symmetry.mirror && movable.length >= 3;
    else if (action === 'symmetry-radius-space') enabled = project.symmetry.enabled && movable.length >= 3;
    button.disabled = !enabled;
    if ((action === 'symmetry-sector' || action === 'symmetry-angle-space') && project.symmetry.mirror) {
      button.title = T('align.mirrorDisabled.title');
    } else if (ALIGNMENT_ACTIONS.includes(action)) button.title = alignmentLabel(action);
  });

  if (selected.length > 1) {
    dom.alignmentHelp.textContent = T('align.help.key', keyElement?.name || T('common.none'));
  } else if (project.symmetry.mirror) {
    dom.alignmentHelp.textContent = T('align.help.mirror');
  } else {
    dom.alignmentHelp.textContent = T('align.help.default');
  }
}

function commitAlignmentMoves(plans, label) {
  const actionable = plans.filter(plan => plan.el && Number.isFinite(plan.dx) && Number.isFinite(plan.dy) && (Math.abs(plan.dx) > 1e-7 || Math.abs(plan.dy) > 1e-7));
  if (!actionable.length) {
    announceAlignment(plans.length ? T('align.msg.already', label) : T('align.msg.nothing'));
    return false;
  }
  pushHistory();
  actionable.forEach(plan => moveElement(plan.el, plan.dx, plan.dy));
  setDirty(); refreshAll();
  const lockedCount = selectedElements().filter(el => el.locked).length;
  announceAlignment(lockedCount ? T('align.msg.doneLocked', actionable.length, label, lockedCount) : T('align.msg.done', actionable.length, label), 'success');
  return true;
}

function performCartesianAlignment(action) {
  const selected = selectedElements().filter(isLayoutElement);
  const movable = selected.filter(el => !el.locked);
  const keyElement = selectedElement();
  const referenceMode = dom.alignmentReference.value;
  let referenceBounds;
  let targets = movable;
  if (referenceMode === 'canvas') {
    referenceBounds = { minX: 0, minY: 0, maxX: project.document.width, maxY: project.document.height };
  } else if (referenceMode === 'selection') {
    referenceBounds = unionBounds(selected.map(elementLayoutBounds));
  } else {
    if (!isLayoutElement(keyElement)) { announceAlignment(T('align.msg.needKey')); return; }
    referenceBounds = elementLayoutBounds(keyElement);
    targets = movable.filter(el => el.id !== keyElement.id);
  }
  if (!referenceBounds || !targets.length) { announceAlignment(T('align.msg.noTargets')); return; }
  const mode = action.slice('align-'.length);
  const plans = targets.map(el => ({ el, ...alignBoundsDelta(elementLayoutBounds(el), referenceBounds, mode) }));
  const referenceLabel = referenceMode === 'canvas' ? T('align.ref.canvas') : referenceMode === 'selection' ? T('align.ref.selection') : T('align.ref.keyName', keyElement.name);
  commitAlignmentMoves(plans, `${referenceLabel} ${alignmentLabel(action)}`);
}

function performDistribution(action) {
  const axis = action === 'distribute-x' ? 'x' : 'y';
  const movable = movableSelectedElements().filter(isLayoutElement);
  if (movable.length < 3) { announceAlignment(T('align.msg.needThree')); return; }
  const items = movable.map(el => ({ id: el.id, bounds: elementLayoutBounds(el), order: project.elements.indexOf(el) }));
  const layout = distributeBounds(items, axis);
  const byId = new Map(movable.map(el => [el.id, el]));
  const plans = layout.map(item => ({ el: byId.get(item.id), dx: axis === 'x' ? item.delta : 0, dy: axis === 'y' ? item.delta : 0 }));
  commitAlignmentMoves(plans, alignmentLabel(action));
}

function symmetryPlacement(el) {
  const sourceCenter = boundsCenterPoint(elementLayoutBounds(el));
  const count = copyCountFor(el);
  const displayCenter = transformPointForCopy(sourceCenter, 0, count);
  const center = { x: project.symmetry.centerX, y: project.symmetry.centerY };
  const dx = displayCenter.x - center.x;
  const dy = displayCenter.y - center.y;
  const radius = Math.hypot(dx, dy);
  const baseAngle = rad(project.symmetry.offset || 0) - Math.PI / 2;
  return { el, sourceCenter, displayCenter, center, count, radius, angle: radius > 1e-9 ? Math.atan2(dy, dx) : baseAngle };
}

function symmetryMovePlan(placement, targetDisplay) {
  const targetSource = inverseTransformPointForCopy(targetDisplay, 0, placement.count);
  return { el: placement.el, dx: targetSource.x - placement.sourceCenter.x, dy: targetSource.y - placement.sourceCenter.y };
}

function polarDisplayPoint(center, angle, radius) {
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function performSymmetryAlignment(action) {
  if (!project.symmetry.enabled) { announceAlignment(T('align.msg.needSymmetry')); return; }
  if (project.symmetry.mirror && (action === 'symmetry-sector' || action === 'symmetry-angle-space')) {
    announceAlignment(T('align.msg.mirrorBlocked')); return;
  }
  const movable = movableSelectedElements().filter(isLayoutElement);
  if (!movable.length) { announceAlignment(T('align.msg.nothing')); return; }
  const placements = movable.map(symmetryPlacement);
  const center = { x: project.symmetry.centerX, y: project.symmetry.centerY };
  const baseAngle = rad(project.symmetry.offset || 0) - Math.PI / 2;
  const count = clamp(Math.round(project.symmetry.count), 1, 64);
  let plans = [];

  if (action === 'symmetry-center') {
    plans = placements.map(placement => symmetryMovePlan(placement, center));
  } else if (action === 'symmetry-guide' || action === 'symmetry-sector') {
    const sectorCenter = action === 'symmetry-sector';
    plans = placements.map(placement => {
      const angle = nearestSymmetryAngle(placement.angle, baseAngle, count, sectorCenter);
      return symmetryMovePlan(placement, polarDisplayPoint(center, angle, placement.radius));
    });
  } else if (action === 'symmetry-radius') {
    const keyElement = selectedElement();
    if (!isLayoutElement(keyElement)) { announceAlignment(T('align.msg.needKey')); return; }
    const keyRadius = symmetryPlacement(keyElement).radius;
    plans = placements.filter(placement => placement.el.id !== keyElement.id)
      .map(placement => symmetryMovePlan(placement, polarDisplayPoint(center, placement.angle, keyRadius)));
  } else if (action === 'symmetry-angle-space') {
    if (placements.length < 3) { announceAlignment(T('align.msg.needThreeAngle')); return; }
    const layout = distributePolarAngles(placements.map((placement, order) => ({ id: placement.el.id, angle: placement.angle, order })));
    const byId = new Map(placements.map(placement => [placement.el.id, placement]));
    plans = layout.map(item => {
      const placement = byId.get(item.id);
      return symmetryMovePlan(placement, polarDisplayPoint(center, item.angle, placement.radius));
    });
  } else if (action === 'symmetry-radius-space') {
    if (placements.length < 3) { announceAlignment(T('align.msg.needThreeRadius')); return; }
    const layout = distributePolarRadii(placements.map((placement, order) => ({ id: placement.el.id, radius: placement.radius, order })));
    const byId = new Map(placements.map(placement => [placement.el.id, placement]));
    plans = layout.map(item => {
      const placement = byId.get(item.id);
      return symmetryMovePlan(placement, polarDisplayPoint(center, placement.angle, item.radius));
    });
  }
  commitAlignmentMoves(plans, alignmentLabel(action));
}

function performAlignment(action) {
  if (action.startsWith('align-')) performCartesianAlignment(action);
  else if (action.startsWith('distribute-')) performDistribution(action);
  else if (action.startsWith('symmetry-')) performSymmetryAlignment(action);
}

function moveSelectedLayer(direction) {
  const index = selectedIndex();
  if (index < 0) return;
  const next = index + direction;
  if (next < 0 || next >= project.elements.length) return;
  pushHistory();
  [project.elements[index], project.elements[next]] = [project.elements[next], project.elements[index]];
  setDirty(); refreshAll();
}

function nudgeSelected(dx, dy, step = 1) {
  const elements = movableSelectedElements().filter(isLayoutElement);
  if (!elements.length) { toast(T('msg.nothingToMove')); return; }
  let moveX = dx * step;
  let moveY = dy * step;
  if (dx === 0 && dy === 0) {
    const bounds = unionBounds(elements.map(elementLayoutBounds));
    const center = boundsCenterPoint(bounds);
    moveX = project.symmetry.centerX - center.x;
    moveY = project.symmetry.centerY - center.y;
  }
  if (Math.abs(moveX) <= 1e-7 && Math.abs(moveY) <= 1e-7) return;
  pushHistory();
  elements.forEach(el => moveElement(el, moveX, moveY));
  setDirty(); refreshAll();
}

function isTextEntryTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

function isNativeTextUndoTarget(target) {
  return Boolean(target?.closest?.('textarea, [contenteditable="true"], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"]'));
}

function anyDialogOpen() {
  return [dom.exportDialog, dom.helpDialog, dom.licensesDialog].some(dialog => dialog.open);
}

function wireInspectors() {
  // Element style.
  bindColorPair('strokeColor', 'strokeColorText', selectedStyle, 'stroke', afterStyleChange);
  bindControl('strokeWidth', value => mutateSelectedStyle('strokeWidth', clamp(value, 0, 200)), {
    parse: value => parseNumber(value), afterInput: afterStyleChange
  });
  bindControl('styleOpacity', value => mutateSelectedStyle('opacity', clamp(value, 0, 1)), {
    parse: value => parseNumber(value, 1), afterInput: afterStyleChange
  });
  bindControl('fillEnabled', value => mutateSelectedStyle('fillEnabled', value), { afterInput: afterStyleChange });
  bindColorPair('fillColor', 'fillColorText', selectedStyle, 'fill', afterStyleChange);
  bindControl('lineCap', value => mutateSelectedStyle('lineCap', value), { afterInput: afterStyleChange });
  bindControl('lineJoin', value => mutateSelectedStyle('lineJoin', value), { afterInput: afterStyleChange });
  bindControl('dashPattern', value => {
    const dash = String(value).split(/[ ,]+/).map(Number).filter(number => Number.isFinite(number) && number >= 0).slice(0, 16);
    mutateSelectedStyle('dash', dash);
  }, { afterInput: afterStyleChange });
  bindControl('blendMode', value => mutateSelectedStyle('blendMode', value), { afterInput: afterStyleChange });
  bindColorPair('shadowColor', 'shadowColorText', selectedStyle, 'shadowColor', afterStyleChange);
  bindControl('shadowBlur', value => mutateSelectedStyle('shadowBlur', clamp(value, 0, 100)), {
    parse: value => parseNumber(value), afterInput: afterStyleChange
  });
  bindControl('shadowOffsetX', value => mutateSelectedStyle('shadowOffsetX', clamp(value, -100, 100)), {
    parse: value => parseNumber(value), afterInput: afterStyleChange
  });
  bindControl('shadowOffsetY', value => mutateSelectedStyle('shadowOffsetY', clamp(value, -100, 100)), {
    parse: value => parseNumber(value), afterInput: afterStyleChange
  });
  bindControl('glowEnabled', value => mutateSelectedStyle('glowEnabled', value), { afterInput: afterStyleChange });
  bindColorPair('glowColor', 'glowColorText', selectedStyle, 'glowColor', afterStyleChange);
  bindControl('glowBlur', value => mutateSelectedStyle('glowBlur', clamp(value, 0, 120)), {
    parse: value => parseNumber(value), afterInput: afterStyleChange
  });
  bindControl('glowStrength', value => mutateSelectedStyle('glowStrength', clamp(value, 0, 3)), {
    parse: value => parseNumber(value), afterInput: afterStyleChange
  });

  // Geometry.
  bindControl('elementName', value => { const el = selectedElement(); if (el) el.name = String(value || T('name.unnamed')); }, {
    afterInput: () => afterGeometryChange({ layers: true, timeline: true })
  });
  bindControl('elementSymmetry', value => { const el = selectedElement(); if (el) el.symmetry = value; }, {
    afterInput: () => afterGeometryChange({ layers: true })
  });
  bindControl('elementVisible', value => { const el = selectedElement(); if (el) el.visible = value; }, {
    afterInput: () => afterGeometryChange({ layers: true, timeline: true })
  });
  bindControl('elementLocked', value => { const el = selectedElement(); if (el) el.locked = value; }, {
    afterInput: () => afterGeometryChange({ layers: true })
  });
  bindControl('pathClosed', value => { const el = selectedElement(); if (el?.type === 'path') el.closed = value; }, {
    afterInput: afterGeometryChange
  });
  bindControl('circleX', value => { const el = selectedElement(); if (el?.type === 'circle') el.x = value; }, {
    parse: value => parseNumber(value), afterInput: afterGeometryChange
  });
  bindControl('circleY', value => { const el = selectedElement(); if (el?.type === 'circle') el.y = value; }, {
    parse: value => parseNumber(value), afterInput: afterGeometryChange
  });
  bindControl('circleRX', value => { const el = selectedElement(); if (el?.type === 'circle') el.rx = Math.max(1, value); }, {
    parse: value => parseNumber(value, 1), afterInput: afterGeometryChange
  });
  bindControl('circleRY', value => { const el = selectedElement(); if (el?.type === 'circle') el.ry = Math.max(1, value); }, {
    parse: value => parseNumber(value, 1), afterInput: afterGeometryChange
  });
  bindControl('textContent', value => { const el = selectedElement(); if (el?.type === 'text') el.text = String(value); }, {
    afterInput: () => afterGeometryChange({ layers: false })
  });
  bindControl('fontSize', value => { const el = selectedElement(); if (el?.type === 'text') el.fontSize = clamp(value, 4, 600); }, {
    parse: value => parseNumber(value, 54), afterInput: afterGeometryChange
  });
  bindControl('fontFamily', value => { const el = selectedElement(); if (el?.type === 'text') el.fontFamily = String(value || 'serif'); }, {
    afterInput: afterGeometryChange
  });
  bindControl('textAlign', value => { const el = selectedElement(); if (el?.type === 'text') el.textAlign = value; }, {
    afterInput: afterGeometryChange
  });

  // Motion.
  bindControl('animationMode', value => mutateSelectedAnimation('mode', value), {
    afterInput: () => afterAnimationChange({ structure: true, layers: true })
  });
  bindControl('animationStart', value => mutateSelectedAnimation('start', clamp(value, 0, project.animation.duration)), {
    parse: value => parseNumber(value), afterInput: afterAnimationChange
  });
  bindControl('animationDuration', value => mutateSelectedAnimation('duration', clamp(value, .05, 60)), {
    parse: value => parseNumber(value, .05), afterInput: afterAnimationChange
  });
  bindControl('animationEasing', value => mutateSelectedAnimation('easing', value), { afterInput: afterAnimationChange });
  bindControl('animationDirection', value => mutateSelectedAnimation('direction', value), { afterInput: afterAnimationChange });
  bindControl('copyStagger', value => mutateSelectedAnimation('copyStagger', clamp(value, 0, 10)), {
    parse: value => parseNumber(value), afterInput: afterAnimationChange
  });
  bindControl('copyOrder', value => mutateSelectedAnimation('copyOrder', value), { afterInput: afterAnimationChange });
  bindControl('holdAfter', value => mutateSelectedAnimation('holdAfter', value), { afterInput: afterAnimationChange });

  // Document, symmetry, snapping, and timeline settings.
  bindControl('documentName', value => { project.document.name = String(value || T('name.newProject')); }, {
    afterInput: () => { refreshInspectors(true); status(T('status.documentName', project.document.name)); }
  });
  bindControl('documentWidth', value => {
    const old = project.document.width;
    const centerWasMiddle = Math.abs(project.symmetry.centerX - old / 2) < .001;
    project.document.width = clamp(Math.round(value), 64, 4096);
    if (centerWasMiddle) project.symmetry.centerX = project.document.width / 2;
  }, { parse: value => parseNumber(value, 1000), afterInput: afterDocumentChange });
  bindControl('documentHeight', value => {
    const old = project.document.height;
    const centerWasMiddle = Math.abs(project.symmetry.centerY - old / 2) < .001;
    project.document.height = clamp(Math.round(value), 64, 4096);
    if (centerWasMiddle) project.symmetry.centerY = project.document.height / 2;
  }, { parse: value => parseNumber(value, 1000), afterInput: afterDocumentChange });
  bindControl('transparentBackground', value => { project.document.transparent = value; }, { afterInput: afterDocumentChange });
  bindColorPair('backgroundColor', 'backgroundColorText', () => project.document, 'background', afterDocumentChange);
  bindControl('symmetryEnabled', value => { project.symmetry.enabled = value; }, {
    afterInput: () => afterDocumentChange({ layers: true })
  });
  bindControl('symmetryCount', value => { project.symmetry.count = clamp(Math.round(value), 1, 64); }, {
    parse: value => parseNumber(value, 1), afterInput: () => afterDocumentChange({ layers: true })
  });
  bindControl('symmetryOffset', value => { project.symmetry.offset = clamp(value, -360, 360); }, {
    parse: value => parseNumber(value), afterInput: afterDocumentChange
  });
  bindControl('symmetryMirror', value => { project.symmetry.mirror = value; }, { afterInput: afterDocumentChange });
  bindControl('symmetryCenterX', value => { project.symmetry.centerX = value; }, {
    parse: value => parseNumber(value), afterInput: afterDocumentChange
  });
  bindControl('symmetryCenterY', value => { project.symmetry.centerY = value; }, {
    parse: value => parseNumber(value), afterInput: afterDocumentChange
  });
  bindControl('snapEnabled', value => { project.snap.enabled = value; }, { afterInput: afterDocumentChange });
  bindControl('snapGrid', value => { project.snap.grid = value; }, { afterInput: afterDocumentChange });
  bindControl('gridSize', value => { project.snap.gridSize = clamp(Math.round(value), 2, 500); }, {
    parse: value => parseNumber(value, 25), afterInput: afterDocumentChange
  });
  bindControl('snapCenter', value => { project.snap.center = value; }, { afterInput: afterDocumentChange });
  bindControl('snapRadial', value => { project.snap.radial = value; }, { afterInput: afterDocumentChange });
  bindControl('snapAngles', value => { project.snap.angles = value; }, { afterInput: afterDocumentChange });
  bindControl('angleStep', value => { project.snap.angleStep = clamp(Math.round(value), 1, 90); }, {
    parse: value => parseNumber(value, 15), afterInput: afterDocumentChange
  });
  bindControl('snapThreshold', value => { project.snap.threshold = clamp(value, 2, 40); }, {
    parse: value => parseNumber(value, 11), afterInput: afterDocumentChange
  });
  bindControl('durationInput', value => {
    project.animation.duration = clamp(value, .5, 60);
    project.animation.playhead = Math.min(project.animation.playhead, project.animation.duration);
  }, { parse: value => parseNumber(value, 4), afterInput: () => afterDocumentChange({ timeline: true }) });
  bindControl('fpsInput', value => { project.animation.fps = clamp(Math.round(value), 1, 60); }, {
    parse: value => parseNumber(value, 24), afterInput: afterDocumentChange
  });
  bindControl('loopInput', value => { project.animation.loop = value; }, { afterInput: afterDocumentChange });
}

function wireButtons() {
  $$('.tool-btn').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
  $$('.panel-tab').forEach(button => button.addEventListener('click', () => switchPanel(button.dataset.tab)));

  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#newProjectBtn').addEventListener('click', newBlankProject);
  $('#saveProjectBtn').addEventListener('click', saveProjectFile);
  $('#loadProjectBtn').addEventListener('click', () => $('#projectFileInput').click());
  $('#projectFileInput').addEventListener('change', event => {
    loadProjectFile(event.target.files?.[0]);
    event.target.value = '';
  });
  $('#duplicateBtn').addEventListener('click', duplicateSelected);
  $('#deleteBtn').addEventListener('click', deleteSelected);
  $('#moveLayerUpBtn').addEventListener('click', () => moveSelectedLayer(1));
  $('#moveLayerDownBtn').addEventListener('click', () => moveSelectedLayer(-1));
  $('#selectAllElementsBtn').addEventListener('click', selectAllVisibleElements);
  $('#clearElementSelectionBtn').addEventListener('click', () => clearElementSelection());
  dom.alignmentReference.addEventListener('change', updateAlignmentControls);
  dom.alignmentPanel.addEventListener('click', event => {
    const button = event.target.closest('[data-alignment-action]');
    if (button && !button.disabled) performAlignment(button.dataset.alignmentAction);
  });

  $('#smoothNodeBtn').addEventListener('click', smoothSelectedNode);
  $('#cornerNodeBtn').addEventListener('click', cornerSelectedNode);
  $('#reversePathBtn').addEventListener('click', reverseSelectedPath);

  $('#centerSymmetryBtn').addEventListener('click', () => {
    pushHistory();
    project.symmetry.centerX = project.document.width / 2;
    project.symmetry.centerY = project.document.height / 2;
    setDirty(); refreshAll();
  });

  $('#zoomOutBtn').addEventListener('click', () => setZoom(ui.zoom / 1.18));
  $('#zoomInBtn').addEventListener('click', () => setZoom(ui.zoom * 1.18));
  $('#fitBtn').addEventListener('click', fitView);
  dom.zoomLabel.addEventListener('click', fitView);
  $('#guideToggleBtn').addEventListener('click', event => {
    ui.showGuides = !ui.showGuides;
    event.currentTarget.classList.toggle('toggle-on', ui.showGuides);
    event.currentTarget.setAttribute('aria-pressed', String(ui.showGuides));
    renderEditor();
  });

  dom.playBtn.addEventListener('click', () => togglePlayback());
  $('#stopBtn').addEventListener('click', stopPlayback);
  $('#autoSequenceBtn').addEventListener('click', () => autoSequence('layers'));
  $('#centerSequenceBtn').addEventListener('click', () => autoSequence('center'));
  $('#reverseSequenceBtn').addEventListener('click', reverseSequence);
  $('#collapseTimelineBtn').addEventListener('click', () => {
    dom.timelinePanel.classList.toggle('collapsed');
    requestAnimationFrame(resizeCanvas);
  });

  $('#helpBtn').addEventListener('click', () => openModal(dom.helpDialog));
  $('#licensesBtn').addEventListener('click', () => openModal(dom.licensesDialog));
  $('#exportBtn').addEventListener('click', () => {
    syncExportSettings();
    openModal(dom.exportDialog);
    requestAnimationFrame(updateExportPreview);
  });
  dom.modalBackdrop.addEventListener('click', () => {
    if (ui.exportBusy) return;
    closeModal(dom.exportDialog); closeModal(dom.helpDialog); closeModal(dom.licensesDialog);
  });

  $$('.style-presets button').forEach(button => button.addEventListener('click', () => applyStylePreset(button.dataset.stylePreset)));
  $$('.animation-presets button').forEach(button => button.addEventListener('click', () => applyMotionPreset(button.dataset.motionPreset)));
  $$('.template-grid button').forEach(button => button.addEventListener('click', () => applyTemplate(button.dataset.template)));
  $$('.nudge-grid button').forEach(button => button.addEventListener('click', event => {
    const [dx, dy] = event.currentTarget.dataset.nudge.split(',').map(Number);
    nudgeSelected(dx, dy, event.shiftKey ? 10 : 1);
  }));
}

function wireDelegatedInteractions() {
  dom.toolOptions.addEventListener('click', event => {
    const action = event.target.closest('[data-tool-action]')?.dataset.toolAction;
    if (!action) return;
    if (action === 'finish') finishPenPath(false);
    else if (action === 'close') finishPenPath(true);
    else if (action === 'copy-style') {
      const style = selectedStyle();
      if (!style) { toast(T('msg.selectStyleSource')); return; }
      ui.clipboardStyle = deepClone(style); renderToolOptions(); toast(T('msg.styleCopied'));
    } else if (action === 'paste-style') {
      const style = selectedStyle();
      if (!style || !ui.clipboardStyle) return;
      pushHistory(); Object.assign(style, deepClone(ui.clipboardStyle)); invalidateElementGeometry(selectedElement()); setDirty(); refreshAll(); toast(T('msg.stylePasted'), 'success');
    }
  });
  dom.toolOptions.addEventListener('input', event => {
    if (event.target.id === 'freehandToleranceOption') {
      ui.freehandTolerance = clamp(parseNumber(event.target.value, 2.2), .5, 8);
      event.target.nextElementSibling.value = ui.freehandTolerance.toFixed(1);
    } else if (event.target.id === 'polygonSidesOption') {
      ui.polygonSides = clamp(Math.round(parseNumber(event.target.value, 6)), 3, 32);
    } else if (event.target.id === 'starPointsOption') {
      ui.starPoints = clamp(Math.round(parseNumber(event.target.value, 5)), 3, 24);
    } else if (event.target.id === 'starInnerOption') {
      ui.starInner = clamp(parseNumber(event.target.value, .46), .05, .95);
      event.target.nextElementSibling.value = `${Math.round(ui.starInner * 100)}%`;
    } else if (event.target.id === 'fontPresetOption') ui.fontPreset = String(event.target.value || 'serif');
  });

  dom.layerList.addEventListener('click', event => {
    const row = event.target.closest('.layer-row');
    const actionButton = event.target.closest('[data-layer-action]');
    if (!row || !actionButton) return;
    const el = project.elements.find(item => item.id === row.dataset.id);
    if (!el) return;
    const action = actionButton.dataset.layerAction;
    if (action === 'select') {
      const mode = event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace';
      selectElement(el.id, true, mode);
    } else if (action === 'toggle') {
      selectElement(el.id, true, event.shiftKey ? 'range' : 'toggle');
    }
    else if (action === 'visible') {
      pushHistory(); el.visible = !el.visible; setDirty(); refreshAll();
    } else if (action === 'lock') {
      pushHistory(); el.locked = !el.locked; setDirty(); refreshAll();
    }
  });

  dom.timelinePanel.addEventListener('click', event => {
    const select = event.target.closest('[data-timeline-select]');
    if (select) {
      const mode = event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace';
      selectElement(select.dataset.timelineSelect, true, mode);
    }
  });
  dom.timelinePanel.addEventListener('pointerdown', timelinePointerDown);
  window.addEventListener('pointermove', timelinePointerMove);
  window.addEventListener('pointerup', timelinePointerUp);
  window.addEventListener('pointercancel', timelinePointerUp);
}

function wireCanvas() {
  dom.canvas.addEventListener('pointerdown', pointerDown);
  dom.canvas.addEventListener('pointermove', pointerMove);
  dom.canvas.addEventListener('pointerup', pointerUp);
  dom.canvas.addEventListener('pointercancel', pointerCancel);
  dom.canvas.addEventListener('lostpointercapture', event => {
    if (ui.drag?.pointerId === event.pointerId && ui.drag.kind !== 'pan') pointerCancel();
  });
  dom.canvas.addEventListener('wheel', wheelZoom, { passive: false });
  dom.canvas.addEventListener('contextmenu', event => event.preventDefault());
}

function wireExport() {
  ['exportScale', 'exportTransparent', 'exportDuration', 'exportFps'].forEach(id => {
    $(`#${id}`).addEventListener('input', () => { updateExportSizeReadout(); updateExportPreview(); });
    $(`#${id}`).addEventListener('change', () => { updateExportSizeReadout(); updateExportPreview(); });
  });
  $('#exportQuality').addEventListener('input', event => { $('#exportQualityOutput').value = event.target.value; });
  $$('.format-btn').forEach(button => button.addEventListener('click', () => runExport(button.dataset.export)));
  $('#cancelExportBtn').addEventListener('click', () => { ui.exportAbort = true; status(T('export.cancelling')); });
  [dom.exportDialog, dom.helpDialog, dom.licensesDialog].forEach(dialog => dialog.addEventListener('close', updateBackdrop));
}

function wireKeyboard() {
  window.addEventListener('keydown', event => {
    const control = event.ctrlKey || event.metaKey;
    const typing = isTextEntryTarget(event.target);

    if (control && !event.altKey) {
      const key = event.key.toLowerCase();
      if ((key === 'z' || key === 'y') && isNativeTextUndoTarget(event.target)) return;
      if ((key === 'z' || key === 'y' || key === 'n') && typing) document.activeElement?.blur?.();
      if (key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (key === 'y') { event.preventDefault(); redo(); return; }
      if (key === 's') { event.preventDefault(); saveProjectFile(); return; }
      if (key === 'n') { event.preventDefault(); newBlankProject(); return; }
      if (key === 'd' && !typing) { event.preventDefault(); duplicateSelected(); return; }
      if (key === 'a' && !typing && !anyDialogOpen()) { event.preventDefault(); selectAllVisibleElements(); return; }
    }
    if (typing || anyDialogOpen()) return;

    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) { ui.spaceHeld = true; ui.spaceDragged = false; dom.canvas.style.cursor = 'grab'; }
      return;
    }
    if (event.key === 'Enter' && ui.tool === 'pen') { event.preventDefault(); finishPenPath(false); return; }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (ui.draft) cancelDraft();
      else clearElementSelection();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); return; }

    const shortcut = {
      v: 'select', p: 'pen', b: 'freehand', l: 'line', o: 'circle', g: 'polygon', s: 'star', t: 'text', h: 'pan'
    }[event.key.toLowerCase()];
    if (shortcut) { event.preventDefault(); setTool(shortcut); }
  });

  window.addEventListener('keyup', event => {
    if (event.code !== 'Space') return;
    event.preventDefault();
    const dragged = ui.spaceDragged;
    ui.spaceHeld = false; ui.spaceDragged = false;
    dom.canvas.style.cursor = TOOL_META[ui.tool].cursor;
    if (!dragged && !anyDialogOpen() && !isTextEntryTarget(event.target)) togglePlayback();
  });
  window.addEventListener('blur', () => {
    ui.spaceHeld = false; ui.spaceDragged = false;
    if (ui.drag?.kind === 'pan') ui.drag = null;
    dom.canvas.style.cursor = TOOL_META[ui.tool].cursor;
  });
}

function restoreAutosave() {
  try {
    const stored = localStorage.getItem(AUTOSAVE_KEY);
    if (!stored) return false;
    project = migrateProject(JSON.parse(stored));
    project.animation.playhead = clamp(project.animation.playhead || 0, 0, project.animation.duration);
    return true;
  } catch (error) {
    console.warn('Autosave restore failed', error);
    return false;
  }
}

function wireLocale() {
  const select = $('#localeSelect');
  if (!select) return;
  I18N.mountSwitcher(select);
  // Re-render every string the app builds at runtime; applyStaticDom() has
  // already handled the markup that carries data-i18n hooks.
  I18N.onChange(() => {
    toast(T('msg.localeChanged'), 'success');
    setTool(ui.tool, true);
    renderRunePalette();
    refreshAll();
    updateExportPreview();
  });
}

function initialize() {
  const restored = restoreAutosave();
  wireInspectors();
  wireRuneAssistant();
  wireButtons();
  wireDelegatedInteractions();
  wireCanvas();
  wireExport();
  wireKeyboard();
  wireLocale();

  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(ui.resizeRaf);
    ui.resizeRaf = requestAnimationFrame(resizeCanvas);
  });
  resizeObserver.observe(dom.canvasWrap);
  window.addEventListener('resize', () => {
    cancelAnimationFrame(ui.resizeRaf);
    ui.resizeRaf = requestAnimationFrame(resizeCanvas);
  });
  window.addEventListener('beforeunload', () => {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project)); } catch (_) { /* ignore */ }
  });

  setTool('select', true);
  refreshAll();
  requestAnimationFrame(() => {
    resizeCanvas();
    fitView();
    updateExportPreview();
  });
  status(restored ? T('msg.autosaveRestoredStatus') : T('status.readyHint'));
  if (restored) setTimeout(() => toast(T('msg.autosaveRestored'), 'success'), 300);
}

initialize();
