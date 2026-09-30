/* Ccfolia & PSD Studio — TRPG Toolkit 收錄版。
 * 上游：fyam-hamu/F_Ccfolia-PSD-Studio（commit 718bb40）的 index.html 內嵌 <script>。
 * 合輯版的改動：介面文字改走 i18n 字典（T()），韓文註解譯成繁體中文，
 * 拿掉 Firebase 按讚鈕與 GGUNDY 分頁；其餘程式照上游。使用條款見 TERMS.md。 */

/* ==========================================================================
   1. Global State Management
   ========================================================================== */
const state = {
  mode: 'idle', // 'idle' | 'ccfolia' | 'image' | 'psd'
  activeTab: 'grid', // 'grid' | 'room'
  filesMap: new Map(), // filename -> { blob, imageElement, thumbElement, arrayBuffer, isApng, apngData, width, height, assetOffset, left, top }
  ccfoliaData: null, // parsed data.json object
  psdData: null, // parsed PSD object { width, height, layers }
  originalZip: null, // JSZip object if loaded from zip
  originalFileName: null, // 原始檔案／資料夾名稱（不含副檔名），產生匯出檔名時使用
  jsonFileName: 'data.json',
  selectedFileName: null,

  // Master Color Corrections
  master: {
    hue: 0,
    saturation: 100,
    brightness: 0,
    contrast: 0,
    exposure: 0,
    gradEnabled: false,
    gradOpacity: 100,
    blendMode: 'overlay',
    gradStops: [
      { pos: 0, color: '#0f172a' },
      { pos: 50, color: '#64748b' },
      { pos: 100, color: '#f8fafc' }
    ],
    activeStopIndex: 0
  },

  // Curves Control Points for RGB
  curves: {
    all: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    b: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  },
  activeCurveChannel: 'all',

  // Camera State for Room / PSD View
  roomCamera: {
    x: 0,
    y: 0,
    zoom: 1,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    showGrid: true
  },

  // Single Inspector State
  inspectorShowingOriginal: false
};

let cachedGradientLUT = null;
let cachedChannelLUT_R = null;
let cachedChannelLUT_G = null;
let cachedChannelLUT_B = null;

let isRefreshScheduled = false;

/* ==========================================================================
   2. Fast Color Engine & Precomputed LUTs
   ========================================================================== */

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.min(255, Math.max(0, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function buildGradientLUTFromStops(gradStops) {
  if (!gradStops || gradStops.length === 0) return null;
  const lut = new Array(256);
  const stops = [...gradStops].sort((a, b) => a.pos - b.pos);

  if (stops.length === 1) {
    stops.push({ pos: 100, color: stops[0].color });
  }

  if (stops[0].pos > 0) stops.unshift({ pos: 0, color: stops[0].color });
  if (stops[stops.length - 1].pos < 100) stops.push({ pos: 100, color: stops[stops.length - 1].color });

  for (let i = 0; i < 256; i++) {
    const pct = (i / 255) * 100;
    let left = stops[0];
    let right = stops[stops.length - 1];

    for (let j = 0; j < stops.length - 1; j++) {
      if (pct >= stops[j].pos && pct <= stops[j + 1].pos) {
        left = stops[j];
        right = stops[j + 1];
        break;
      }
    }

    const range = right.pos - left.pos;
    const t = range === 0 ? 0 : (pct - left.pos) / range;

    const c1 = hexToRgb(left.color);
    const c2 = hexToRgb(right.color);

    lut[i] = {
      r: c1.r * (1 - t) + c2.r * t,
      g: c1.g * (1 - t) + c2.g * t,
      b: c1.b * (1 - t) + c2.b * t
    };
  }
  return lut;
}

function updateGradientLUT() {
  if (!state.master.gradEnabled || state.master.gradOpacity === 0) {
    cachedGradientLUT = null;
    return;
  }
  cachedGradientLUT = buildGradientLUTFromStops(state.master.gradStops);
}

function getCurvePresetPoints(presetKey) {
  switch (presetKey) {
    case 'contrast': return [{ x: 0, y: 0 }, { x: 64, y: 30 }, { x: 192, y: 225 }, { x: 255, y: 255 }];
    case 'darken': return [{ x: 0, y: 0 }, { x: 128, y: 70 }, { x: 255, y: 255 }];
    case 'brighten': return [{ x: 0, y: 0 }, { x: 128, y: 180 }, { x: 255, y: 255 }];
    case 'linear': default: return [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  }
}

function buildCurveLUT(points) {
  const lut = new Uint8Array(256);
  const pts = [...points].sort((a, b) => a.x - b.x);

  for (let i = 0; i < 256; i++) {
    if (i <= pts[0].x) {
      lut[i] = pts[0].y;
      continue;
    }
    if (i >= pts[pts.length - 1].x) {
      lut[i] = pts[pts.length - 1].y;
      continue;
    }

    for (let j = 0; j < pts.length - 1; j++) {
      if (i >= pts[j].x && i <= pts[j + 1].x) {
        const t = (i - pts[j].x) / (pts[j + 1].x - pts[j].x);
        lut[i] = Math.min(255, Math.max(0, Math.round(pts[j].y * (1 - t) + pts[j + 1].y * t)));
        break;
      }
    }
  }
  return lut;
}

function updateChannelLUTs() {
  const masterLut = buildCurveLUT(state.curves.all);

  const computeForChan = (channelKey) => {
    const lut = new Uint8Array(256);
    const chanLut = buildCurveLUT(state.curves[channelKey] || state.curves.all);

    const br = state.master.brightness;
    const ct = state.master.contrast;
    const exp = state.master.exposure;

    const contrastFactor = (259 * (ct + 255)) / (255 * (259 - ct));
    const expFactor = Math.pow(2, exp / 50);

    for (let i = 0; i < 256; i++) {
      let v = i;
      v = v * expFactor;
      v = v + br;
      v = (v - 128) * contrastFactor + 128;
      v = Math.min(255, Math.max(0, v));

      v = masterLut[Math.round(v)];
      if (channelKey !== 'all') {
        v = chanLut[Math.round(v)];
      }
      lut[i] = Math.min(255, Math.max(0, Math.round(v)));
    }
    return lut;
  };

  cachedChannelLUT_R = computeForChan('r');
  cachedChannelLUT_G = computeForChan('g');
  cachedChannelLUT_B = computeForChan('b');
}

function blendColors(r1, g1, b1, r2, g2, b2, mode) {
  switch (mode) {
    case 'multiply':
      return { r: (r1 * r2) / 255, g: (g1 * g2) / 255, b: (b1 * b2) / 255 };
    case 'screen':
      return { r: 255 - ((255 - r1) * (255 - r2)) / 255, g: 255 - ((255 - g1) * (255 - g2)) / 255, b: 255 - ((255 - b1) * (255 - b2)) / 255 };
    case 'overlay':
      return {
        r: r1 < 128 ? (2 * r1 * r2) / 255 : 255 - (2 * (255 - r1) * (255 - r2)) / 255,
        g: g1 < 128 ? (2 * g1 * g2) / 255 : 255 - (2 * (255 - g1) * (255 - g2)) / 255,
        b: b1 < 128 ? (2 * b1 * b2) / 255 : 255 - (2 * (255 - b1) * (255 - b2)) / 255
      };
    case 'soft-light':
      return {
        r: r2 < 128 ? r1 - (128 - r2) * r1 * (255 - r1) / 32640 : r1 + (r2 - 128) * (Math.sqrt(r1 / 255) * 255 - r1) / 128,
        g: g2 < 128 ? g1 - (128 - g2) * g1 * (255 - g1) / 32640 : g1 + (g2 - 128) * (Math.sqrt(g1 / 255) * 255 - g1) / 128,
        b: b2 < 128 ? b1 - (128 - b2) * b1 * (255 - b1) / 32640 : b1 + (b2 - 128) * (Math.sqrt(b1 / 255) * 255 - b1) / 128
      };
    case 'color':
      const l1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
      const l2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
      const diff = l1 - l2;
      return { r: Math.max(0, Math.min(255, r2 + diff)), g: Math.max(0, Math.min(255, g2 + diff)), b: Math.max(0, Math.min(255, b2 + diff)) };
    case 'normal':
    default:
      return { r: r2, g: g2, b: b2 };
  }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
  h /= 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

function getAssetOffset(fileData) {
  if (!fileData) return null;
  if (!fileData.assetOffset) {
    fileData.assetOffset = {
      hue: 0,
      sat: 0,
      bri: 0,
      con: 0,
      exp: 0,
      gradEnabled: false,
      gradOpacity: 100,
      blendMode: 'overlay',
      gradStops: [
        { pos: 0, color: '#0f172a' },
        { pos: 50, color: '#64748b' },
        { pos: 100, color: '#f8fafc' }
      ],
      activeStopIndex: 0,
      curves: {
        all: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        b: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
      },
      activeCurveChannel: 'all'
    };
  }
  return fileData.assetOffset;
}

function applyColorFilter(imageData, assetOffset = null) {
  const data = imageData.data;
  const len = data.length;

  if (!cachedChannelLUT_R) updateChannelLUTs();

  let lutR = cachedChannelLUT_R;
  let lutG = cachedChannelLUT_G;
  let lutB = cachedChannelLUT_B;

  const hasAssetTone = assetOffset && (
    assetOffset.bri || assetOffset.con || assetOffset.exp || assetOffset.curves
  );

  if (hasAssetTone) {
    const br = state.master.brightness + (assetOffset.bri || 0);
    const ct = Math.min(100, Math.max(-100, state.master.contrast + (assetOffset.con || 0)));
    const exp = state.master.exposure + (assetOffset.exp || 0);

    const contrastFactor = (259 * (ct + 255)) / (255 * (259 - ct));
    const expFactor = Math.pow(2, exp / 50);

    const masterAllCurveLut = buildCurveLUT(state.curves.all);
    const assetAllCurveLut = buildCurveLUT(assetOffset.curves?.all || [{ x: 0, y: 0 }, { x: 255, y: 255 }]);

    const computeAssetChan = (channelKey) => {
      const lut = new Uint8Array(256);
      const masterChanLut = buildCurveLUT(state.curves[channelKey] || state.curves.all);
      const assetChanLut = buildCurveLUT(assetOffset.curves?.[channelKey] || [{ x: 0, y: 0 }, { x: 255, y: 255 }]);

      for (let i = 0; i < 256; i++) {
        let v = i;
        v = v * expFactor;
        v = v + br;
        v = (v - 128) * contrastFactor + 128;
        v = Math.min(255, Math.max(0, v));

        // Apply Master Curves
        v = masterAllCurveLut[Math.round(v)];
        if (channelKey !== 'all') v = masterChanLut[Math.round(v)];

        // Apply Asset Curves
        v = assetAllCurveLut[Math.round(v)];
        if (channelKey !== 'all') v = assetChanLut[Math.round(v)];

        lut[i] = Math.min(255, Math.max(0, Math.round(v)));
      }
      return lut;
    };

    lutR = computeAssetChan('r');
    lutG = computeAssetChan('g');
    lutB = computeAssetChan('b');
  }

  // Gradient Map Determination
  let useGrad = false;
  let gradOpacity = 0;
  let blendMode = 'overlay';
  let gradLUT = null;

  if (assetOffset && assetOffset.gradEnabled && assetOffset.gradStops && assetOffset.gradStops.length >= 2) {
    useGrad = true;
    gradOpacity = (assetOffset.gradOpacity !== undefined ? assetOffset.gradOpacity : 100) / 100;
    blendMode = assetOffset.blendMode || 'overlay';
    gradLUT = buildGradientLUTFromStops(assetOffset.gradStops);
  } else if (state.master.gradEnabled && cachedGradientLUT) {
    useGrad = true;
    gradOpacity = state.master.gradOpacity / 100;
    blendMode = state.master.blendMode;
    gradLUT = cachedGradientLUT;
  }

  const hueShift = (state.master.hue + (assetOffset?.hue || 0)) % 360;
  const assetSatRatio = assetOffset?.sat !== undefined ? (1 + assetOffset.sat / 100) : 1;
  const satScale = Math.max(0, (state.master.saturation / 100) * assetSatRatio);

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue;

    r = lutR[r];
    g = lutG[g];
    b = lutB[b];

    if (useGrad && gradOpacity > 0 && gradLUT) {
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const gColor = gradLUT[lum];
      if (gColor) {
        const blended = blendColors(r, g, b, gColor.r, gColor.g, gColor.b, blendMode);
        r = r * (1 - gradOpacity) + blended.r * gradOpacity;
        g = g * (1 - gradOpacity) + blended.g * gradOpacity;
        b = b * (1 - gradOpacity) + blended.b * gradOpacity;
      }
    }

    if (hueShift !== 0 || satScale !== 1) {
      const hsl = rgbToHsl(r, g, b);
      hsl.h = (hsl.h + hueShift + 360) % 360;
      hsl.s = Math.min(1, Math.max(0, hsl.s * satScale));
      const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      r = rgb.r; g = rgb.g; b = rgb.b;
    }

    data[i] = Math.min(255, Math.max(0, Math.round(r)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
  }
}

let recolorVersion = 0;

function invalidateRecolorCache() {
  recolorVersion++;
}

function createRecoloredCanvas(fileData, useFullResolution = false) {
  if (!useFullResolution && fileData._cachedThumbCanvas && fileData._cachedThumbVersion === recolorVersion) {
    return fileData._cachedThumbCanvas;
  }

  const sourceElement = useFullResolution ? fileData.imageElement : (fileData.thumbElement || fileData.imageElement);
  let cvs;
  if (!useFullResolution) {
    if (!fileData._cachedThumbCanvas) {
      fileData._cachedThumbCanvas = document.createElement('canvas');
    }
    cvs = fileData._cachedThumbCanvas;
  } else {
    cvs = document.createElement('canvas');
  }

  cvs.width = sourceElement.width;
  cvs.height = sourceElement.height;
  const ctx = cvs.getContext('2d');
  ctx.drawImage(sourceElement, 0, 0);

  const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
  applyColorFilter(imgData, fileData.assetOffset);
  ctx.putImageData(imgData, 0, 0);

  if (!useFullResolution) {
    fileData._cachedThumbVersion = recolorVersion;
  }

  return cvs;
}

/* ==========================================================================
   3. APNG Parsing & Re-Encoding Pipeline
   ========================================================================== */

function extractApngNumPlays(arrayBuffer) {
  if (!arrayBuffer) return 0;
  try {
    const data = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    if (data.length < 8) return 0;
    let pos = 8;
    while (pos < data.length - 12) {
      const len = view.getUint32(pos, false);
      const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
      if (type === 'acTL' && len >= 8) {
        return view.getUint32(pos + 12, false);
      }
      pos += 8 + len + 4;
    }
  } catch (e) { }
  return 0;
}

function calculateCRC32(uint8Array) {
  let table = window._crc32Table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    window._crc32Table = table;
  }
  let crc = -1;
  for (let i = 0; i < uint8Array.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ uint8Array[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function setApngLoopCount(arrayBuffer, numPlays) {
  if (!arrayBuffer) return arrayBuffer;
  try {
    const data = new Uint8Array(arrayBuffer.slice(0));
    const view = new DataView(data.buffer);
    if (data.length < 8) return arrayBuffer;
    let pos = 8;
    while (pos < data.length - 12) {
      const len = view.getUint32(pos, false);
      const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
      if (type === 'acTL' && len >= 8) {
        view.setUint32(pos + 12, numPlays, false);
        const chunkTypeAndData = data.subarray(pos + 4, pos + 4 + 4 + len);
        let crc = 0;
        if (typeof pako !== 'undefined' && pako.crc32) {
          crc = pako.crc32(chunkTypeAndData);
        } else {
          crc = calculateCRC32(chunkTypeAndData);
        }
        view.setUint32(pos + 4 + 4 + len, crc, false);
        return data.buffer;
      }
      pos += 8 + len + 4;
    }
  } catch (e) {
    console.error('Failed to set APNG loop count:', e);
  }
  return arrayBuffer;
}

function getTargetApngLoopCount(fileData) {
  if (!fileData) return 0;
  const assetMode = fileData.customLoopMode || 'global';
  if (assetMode !== 'global') {
    if (assetMode === 'keep') return fileData.origNumPlays !== undefined ? fileData.origNumPlays : 0;
    if (assetMode === 'once') return 1;
    if (assetMode === 'infinite') return 0;
    if (assetMode === 'custom') return Math.max(1, parseInt(fileData.customLoopCount) || 1);
  }
  const globalMode = document.getElementById('selectGlobalApngLoop')?.value || 'keep';
  if (globalMode === 'keep') {
    return fileData.origNumPlays !== undefined ? fileData.origNumPlays : 0;
  }
  if (globalMode === 'once') return 1;
  if (globalMode === 'infinite') return 0;
  if (globalMode === 'custom') {
    return Math.max(1, parseInt(document.getElementById('numGlobalApngLoopCount')?.value) || 1);
  }
  return fileData.origNumPlays !== undefined ? fileData.origNumPlays : 0;
}

async function parseAPNGIfPossible(arrayBuffer) {
  try {
    const parseAPNG = (window['apng-js'] && window['apng-js'].default) || window.parseAPNG || window['apng-js'];
    if (typeof parseAPNG !== 'function') return null;
    const apng = parseAPNG(arrayBuffer);
    if (apng instanceof Error || !apng.frames || apng.frames.length <= 1) {
      return null;
    }
    await apng.createImages();
    return apng;
  } catch (e) {
    return null;
  }
}

async function processAPNGRecolor(fileData, progressCb) {
  const apng = fileData.apngData;
  const width = apng.width;
  const height = apng.height;

  const offCanvas = document.createElement('canvas');
  offCanvas.width = width;
  offCanvas.height = height;
  const offCtx = offCanvas.getContext('2d');

  const framesRGBA = [];
  const delays = [];

  let prevFrame = null;
  let prevFrameData = null;

  for (let i = 0; i < apng.frames.length; i++) {
    if (progressCb) progressCb(i + 1, apng.frames.length);

    const frame = apng.frames[i];
    delays.push(frame.delay || 100);

    if (prevFrame && prevFrame.disposeOp === 1) {
      offCtx.clearRect(prevFrame.left, prevFrame.top, prevFrame.width, prevFrame.height);
    } else if (prevFrame && prevFrame.disposeOp === 2 && prevFrameData) {
      offCtx.putImageData(prevFrameData, prevFrame.left, prevFrame.top);
    }

    prevFrame = frame;
    prevFrameData = null;

    if (frame.disposeOp === 2) {
      prevFrameData = offCtx.getImageData(frame.left, frame.top, frame.width, frame.height);
    }

    if (frame.blendOp === 0) {
      offCtx.clearRect(frame.left, frame.top, frame.width, frame.height);
    }

    offCtx.drawImage(frame.imageElement, frame.left, frame.top);

    const fullImgData = offCtx.getImageData(0, 0, width, height);
    applyColorFilter(fullImgData, fileData.assetOffset);

    framesRGBA.push(fullImgData.data.buffer);
  }

  const apngBuffer = UPNG.encode(framesRGBA, width, height, 0, delays);
  const targetNumPlays = getTargetApngLoopCount(fileData);
  const patchedBuffer = setApngLoopCount(apngBuffer, targetNumPlays);
  return new Blob([patchedBuffer], { type: 'image/png' });
}

/* ==========================================================================
   4. PSD Parsing & Layer Extraction with Correct Reverse Z-Order (ag-psd)
   ========================================================================== */

function extractPsdLayers(psd) {
  const resultLayers = [];

  // Walk layers in REVERSE order so Bottom-most (Background) layers are extracted FIRST,
  // and Top-most (Foreground) layers are extracted LAST for accurate Photoshop Z-ordering!
  function walk(items) {
    if (!Array.isArray(items)) return;
    for (let i = items.length - 1; i >= 0; i--) {
      const layer = items[i];
      if (layer.hidden) continue; // Ignore hidden layers

      if (layer.children && layer.children.length > 0) {
        walk(layer.children);
      } else {
        let cvs = layer.canvas;
        const w = (layer.right !== undefined && layer.left !== undefined) ? (layer.right - layer.left) : (layer.width || 0);
        const h = (layer.bottom !== undefined && layer.top !== undefined) ? (layer.bottom - layer.top) : (layer.height || 0);

        if (!cvs && layer.image && w > 0 && h > 0) {
          cvs = document.createElement('canvas');
          cvs.width = w; cvs.height = h;
          const ctx = cvs.getContext('2d');
          ctx.putImageData(layer.image, 0, 0);
        }

        if (cvs && cvs.width > 0 && cvs.height > 0) {
          resultLayers.push({
            name: layer.name || `Layer_${resultLayers.length + 1}`,
            left: layer.left !== undefined ? layer.left : 0,
            top: layer.top !== undefined ? layer.top : 0,
            width: cvs.width,
            height: cvs.height,
            canvas: cvs
          });
        }
      }
    }
  }

  if (psd.children) walk(psd.children);
  return resultLayers;
}

async function loadPsdFile(file) {
  try {
    showModal(T('modal.psdParsing'), file.name);
    state.originalFileName = file.name.replace(/\.psd$/i, '');
    const arrayBuffer = await file.arrayBuffer();

    const agPsd = window.agPsd;
    if (!agPsd) throw new Error(T('error.agPsdMissing'));

    const psd = agPsd.readPsd(arrayBuffer, { skipLayerImageData: false, skipCompositeImageData: true });
    const layers = extractPsdLayers(psd);

    if (layers.length === 0) {
      hideModal();
      alert(T('alert.psdNoLayers'));
      return;
    }

    state.filesMap.clear();
    state.originalZip = null;
    state.ccfoliaData = null;
    state.psdData = { width: psd.width, height: psd.height, layers: layers };
    state.mode = 'psd';

    let count = 0;
    for (const layer of layers) {
      count++;
      updateModalProgress(T('progress.psdLayers', count, layers.length), layer.name);

      const blob = await new Promise(res => layer.canvas.toBlob(res, 'image/png'));
      const imgEl = await loadImageElement(blob);
      const thumbEl = await createDownscaledThumb(imgEl, 240);

      const layerFileName = `${layer.name.replace(/[\/\\?%*:|"<>]/g, '_')}.png`;

      state.filesMap.set(layerFileName, {
        name: layerFileName,
        layerName: layer.name,
        left: layer.left,
        top: layer.top,
        visible: true,
        solo: false,
        blob: blob,
        arrayBuffer: await blob.arrayBuffer(),
        imageElement: imgEl,
        thumbElement: thumbEl,
        isApng: false,
        apngData: null,
        width: layer.width,
        height: layer.height,
        assetOffset: null
      });
    }

    setModeBadge('psd', 'mode.psd');
    setActiveTab('room');
    updateUIState();
    hideModal();
  } catch (err) {
    hideModal();
    alert(T('alert.psdFailed', err.message));
  }
}

/* ==========================================================================
   5. File Ingestion & Downscaled Thumbnail Caching
   ========================================================================== */

async function createDownscaledThumb(imgEl, maxDim = 240) {
  if (imgEl.width <= maxDim && imgEl.height <= maxDim) return imgEl;

  const cvs = document.createElement('canvas');
  let w = imgEl.width;
  let h = imgEl.height;

  if (w > h) {
    h = Math.round((h * maxDim) / w);
    w = maxDim;
  } else {
    w = Math.round((w * maxDim) / h);
    h = maxDim;
  }

  cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, w, h);
  return cvs;
}

async function handleFileEntries(files) {
  showModal(T('modal.reading'), T('modal.readingSub'));

  let zipFile = null;
  let psdFile = null;
  const imageFiles = [];

  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.psd')) {
      psdFile = file;
      break;
    } else if (file.name.toLowerCase().endsWith('.zip')) {
      zipFile = file;
      break;
    } else if (file.type.startsWith('image/') || /\.(png|apng|jpg|jpeg|webp|gif)$/i.test(file.name)) {
      imageFiles.push(file);
    }
  }

  if (psdFile) {
    await loadPsdFile(psdFile);
  } else if (zipFile) {
    await loadZipFile(zipFile);
  } else if (imageFiles.length > 0) {
    await loadMultipleImageFiles(imageFiles);
  } else {
    hideModal();
    alert(T('alert.unsupported'));
  }
}

function getCcfoliaItems(jsonData) {
  if (!jsonData || typeof jsonData !== 'object') return [];
  const items = [];
  const processedElements = new Set();
  let orderCounter = 0;

  const processContainer = (container, defaultZ) => {
    if (!container) return;
    const elements = Array.isArray(container) ? container : (typeof container === 'object' ? Object.values(container) : []);
    for (const el of elements) {
      if (!el || typeof el !== 'object') continue;
      if (processedElements.has(el)) continue;
      processedElements.add(el);

      const img = el.imageUrl || el.image || el.pictureUrl || el.iconUrl || el.src;
      if (!img) continue;
      items.push({
        x: el.x !== undefined ? el.x : 0,
        y: el.y !== undefined ? el.y : 0,
        z: el.z !== undefined ? el.z : defaultZ,
        width: el.width !== undefined ? el.width : 4,
        height: el.height !== undefined ? el.height : 4,
        angle: el.angle !== undefined ? el.angle : 0,
        imageIdentifier: img,
        name: el.name || el.text || 'Item',
        order: orderCounter++,
        raw: el
      });
    }
  };

  const processBlock = (block) => {
    if (!block || typeof block !== 'object') return;
    const fw = block.fieldWidth || 80;
    const fh = block.fieldHeight || 45;

    if (block.backgroundUrl && !processedElements.has(block.backgroundUrl)) {
      processedElements.add(block.backgroundUrl);
      items.push({ x: -fw / 2, y: -fh / 2, z: -100, width: fw, height: fh, angle: 0, imageIdentifier: block.backgroundUrl, name: 'Background', order: orderCounter++ });
    }
    processContainer(block.boards, 1);
    processContainer(block.markers, 2);
    processContainer(block.items, 5);
    processContainer(block.characters, 10);
    if (block.foregroundUrl && !processedElements.has(block.foregroundUrl)) {
      processedElements.add(block.foregroundUrl);
      items.push({ x: -fw / 2, y: -fh / 2, z: 1000, width: fw, height: fh, angle: 0, imageIdentifier: block.foregroundUrl, name: 'Foreground', order: orderCounter++ });
    }
  };

  if (jsonData.data) processBlock(jsonData.data);
  if (jsonData.entities) {
    if (jsonData.entities.room) processBlock(jsonData.entities.room);
    processBlock(jsonData.entities);
  }
  processBlock(jsonData);

  return items;
}

async function loadZipFile(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    state.originalZip = zip;
    state.originalFileName = file.name.replace(/\.zip$/i, '');
    state.filesMap.clear();
    state.psdData = null;

    let ccfoliaJsonData = null;
    let jsonEntry = zip.file('data.json') || zip.file('__data.json');
    if (!jsonEntry) {
      const found = zip.file(/(^|\/)(data|__data|room)\.json$/i);
      if (found && found.length > 0) jsonEntry = found[0];
    }
    if (!jsonEntry) {
      const foundAll = zip.file(/\.json$/i);
      if (foundAll && foundAll.length > 0) jsonEntry = foundAll[0];
    }

    if (jsonEntry) {
      state.jsonFileName = jsonEntry.name.split('/').pop().split('\\').pop() || 'data.json';
      const jsonText = await jsonEntry.async('text');
      try { ccfoliaJsonData = JSON.parse(jsonText); } catch (e) { }
    }

    const entries = Object.keys(zip.files);
    let count = 0;

    for (const filename of entries) {
      const entry = zip.files[filename];
      if (entry.dir) continue;

      if (/\.(png|apng|jpg|jpeg|webp|gif)$/i.test(filename)) {
        count++;
        updateModalProgress(T('progress.zipImages', count), filename);
        const arrayBuffer = await entry.async('arraybuffer');
        const blob = new Blob([arrayBuffer]);
        const imageElement = await loadImageElement(blob);
        const thumbElement = await createDownscaledThumb(imageElement, 240);
        const apngData = await parseAPNGIfPossible(arrayBuffer);
        const origNumPlays = apngData ? extractApngNumPlays(arrayBuffer) : 0;

        state.filesMap.set(filename, {
          name: filename,
          blob: blob,
          arrayBuffer: arrayBuffer,
          imageElement: imageElement,
          thumbElement: thumbElement,
          isApng: !!apngData,
          apngData: apngData,
          origNumPlays: origNumPlays,
          customLoopMode: 'global',
          customLoopCount: 1,
          width: imageElement.width,
          height: imageElement.height,
          assetOffset: null
        });
      }
    }

    const roomItems = getCcfoliaItems(ccfoliaJsonData);
    if (ccfoliaJsonData && (roomItems.length > 0 || ccfoliaJsonData.data || ccfoliaJsonData.entities)) {
      state.mode = 'ccfolia';
      state.ccfoliaData = ccfoliaJsonData;
      setModeBadge('ccfolia', 'mode.ccfolia');
      setActiveTab('room');
    } else {
      state.mode = 'image';
      state.ccfoliaData = null;
      setModeBadge('image', 'mode.image');
      setActiveTab('grid');
    }

    updateUIState();
    hideModal();
  } catch (err) {
    hideModal();
    alert(T('alert.zipFailed', err.message));
  }
}

async function loadMultipleImageFiles(files) {
  if (state.mode !== 'image') {
    state.filesMap.clear();
    state.originalZip = null;
    state.ccfoliaData = null;
    state.psdData = null;
    state.mode = 'image';

    const firstFile = files[0];
    if (firstFile) {
      const relPath = firstFile.webkitRelativePath || firstFile.name;
      const rootFolder = relPath.includes('/') ? relPath.split('/')[0] : null;
      state.originalFileName = rootFolder || firstFile.name.replace(/\.[^/.]+$/, '');
    }
  }

  let count = 0;
  let lastAddedFileName = null;
  for (const file of files) {
    count++;
    updateModalProgress(T('progress.images', count, files.length), file.name);
    const relativePath = file.webkitRelativePath || file.name;

    // 產生唯一的 key，避免檔名重複
    let targetName = relativePath;
    if (state.filesMap.has(targetName)) {
      const lastDot = targetName.lastIndexOf('.');
      const base = lastDot !== -1 ? targetName.substring(0, lastDot) : targetName;
      const ext = lastDot !== -1 ? targetName.substring(lastDot) : '';
      let dupCounter = 1;
      while (state.filesMap.has(`${base}_${dupCounter}${ext}`)) {
        dupCounter++;
      }
      targetName = `${base}_${dupCounter}${ext}`;
    }
    lastAddedFileName = targetName;

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer]);
    const imageElement = await loadImageElement(blob);
    const thumbElement = await createDownscaledThumb(imageElement, 240);
    const apngData = await parseAPNGIfPossible(arrayBuffer);
    const origNumPlays = apngData ? extractApngNumPlays(arrayBuffer) : 0;

    state.filesMap.set(targetName, {
      name: targetName,
      blob: blob,
      arrayBuffer: arrayBuffer,
      imageElement: imageElement,
      thumbElement: thumbElement,
      isApng: !!apngData,
      apngData: apngData,
      origNumPlays: origNumPlays,
      customLoopMode: 'global',
      customLoopCount: 1,
      width: imageElement.width,
      height: imageElement.height,
      assetOffset: null
    });
  }

  setModeBadge('image', 'mode.image');
  setActiveTab('grid');
  updateUIState();
  if (lastAddedFileName) {
    selectAsset(lastAddedFileName);
  }
  hideModal();
  showAutoSaveToast(T('toast.imagesAdded', files.length));
}

function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decode error')); };
    img.src = url;
  });
}

/* ==========================================================================
   6. UI Rendering & View Switcher
   ========================================================================== */

/* 合輯版：第二個參數改傳字典 key，記下來，切換語言時才能重畫。 */
let modeBadgeKey = 'mode.idle';

function setModeBadge(modeType, labelKey) {
  const badge = document.getElementById('modeBadge');
  badge.className = 'mode-badge ' + (modeType === 'ccfolia' ? 'ccfolia' : modeType === 'image' ? 'image' : modeType === 'psd' ? 'psd' : '');
  modeBadgeKey = labelKey;
  renderModeBadge();
}

function renderModeBadge() {
  document.getElementById('modeBadgeText').textContent = T(modeBadgeKey);
}

function setActiveTab(tabKey) {
  state.activeTab = tabKey;
  const tabRoom = document.getElementById('tabRoomView');
  const tabGrid = document.getElementById('tabGridView');
  const containerRoom = document.getElementById('containerRoomView');
  const containerGrid = document.getElementById('containerGridView');

  if (tabKey === 'room') {
    if (state.mode === 'image') return;
    tabRoom.classList.add('active');
    tabGrid.classList.remove('active');
    containerRoom.classList.add('active');
    containerGrid.classList.remove('active');
    renderRoomView();
  } else {
    tabGrid.classList.add('active');
    tabRoom.classList.remove('active');
    containerGrid.classList.add('active');
    containerRoom.classList.remove('active');
    renderGridView();
  }
}

/* 合輯版：統計列、匯出鈕、房間分頁的文字抽成函式，切換語言時也會呼叫。 */
function renderStatusLabels() {
  const totalCount = state.filesMap.size;
  const statsText = document.getElementById('viewerStatsText');
  const btnExportLabel = document.getElementById('btnExportLabel');
  const tabRoomViewLabel = document.getElementById('tabRoomViewLabel');

  let modeStr = T('stats.kind.image');
  if (state.mode === 'ccfolia') modeStr = T('stats.kind.ccfolia');
  else if (state.mode === 'psd') modeStr = T('stats.kind.psd');

  statsText.textContent = T('stats.total', totalCount, modeStr);

  if (state.mode === 'psd') {
    btnExportLabel.textContent = T('export.psd');
    tabRoomViewLabel.textContent = T('tab.room.psd');
  } else if (state.mode === 'ccfolia') {
    btnExportLabel.textContent = T('export.default');
    tabRoomViewLabel.textContent = T('tab.room.ccfolia');
  } else {
    btnExportLabel.textContent = T('export.default');
    tabRoomViewLabel.textContent = T('tab.room.default');
  }
}

function updateUIState() {
  const totalCount = state.filesMap.size;
  const btnExport = document.getElementById('btnExportZip');
  const emptyState = document.getElementById('emptyState');
  const tabRoom = document.getElementById('tabRoomView');

  renderStatusLabels();
  btnExport.disabled = totalCount === 0;

  if (totalCount === 0) {
    emptyState.style.display = 'flex';
  } else {
    emptyState.style.display = 'none';
  }

  if (state.mode === 'image') {
    tabRoom.classList.add('disabled');
  } else {
    tabRoom.classList.remove('disabled');
  }

  renderGridView();
  if (state.mode === 'psd' || state.mode === 'ccfolia') renderPsdLayerPanel();
  if (state.mode === 'ccfolia' || state.mode === 'psd') renderRoomView();
  if (state.filesMap.size > 0) scheduleAutoSaveSession();
}

function renderGridView() {
  const wrapper = document.getElementById('gridTilesWrapper');
  wrapper.innerHTML = '';

  const filterText = document.getElementById('inputGridSearch').value.toLowerCase();

  for (const [filename, fileData] of state.filesMap.entries()) {
    if (filterText && !filename.toLowerCase().includes(filterText)) continue;

    const isEffVisible = isLayerEffectiveVisible(fileData);
    const tile = document.createElement('div');
    tile.className = 'grid-tile' + (state.selectedFileName === filename ? ' selected' : '') + (!isEffVisible ? ' hidden-layer' : '');

    tile.onclick = () => {
      selectAsset(filename);
      openSingleInspectorModal(filename);
    };

    const thumb = document.createElement('div');
    thumb.className = 'grid-tile-thumb';

    const canvas = createRecoloredCanvas(fileData, false);
    thumb.appendChild(canvas);

    if (!isEffVisible) {
      const hideBadge = document.createElement('span');
      hideBadge.className = 'tile-badge-hidden';
      hideBadge.textContent = T('badge.hidden');
      thumb.appendChild(hideBadge);
    }

    if (fileData.isApng) {
      const apngBadge = document.createElement('span');
      apngBadge.className = 'tile-badge-apng';
      apngBadge.textContent = 'APNG';
      thumb.appendChild(apngBadge);
    } else if (state.mode === 'psd') {
      const psdBadge = document.createElement('span');
      psdBadge.className = 'tile-badge-psd';
      psdBadge.textContent = 'PSD';
      thumb.appendChild(psdBadge);
    }

    if (fileData.assetOffset) {
      const modBadge = document.createElement('span');
      modBadge.className = 'tile-badge-modified';
      modBadge.textContent = T('badge.modified');
      thumb.appendChild(modBadge);
    }

    const info = document.createElement('div');
    info.className = 'grid-tile-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'grid-tile-name';
    nameEl.title = filename;
    nameEl.textContent = fileData.layerName || filename.split('/').pop();

    const metaEl = document.createElement('div');
    metaEl.className = 'grid-tile-meta';

    const metaSizeEl = document.createElement('span');
    metaSizeEl.textContent = `${fileData.width}×${fileData.height}`;

    const metaTypeEl = document.createElement('span');
    metaTypeEl.textContent = fileData.isApng ? fileData.apngData.frames.length + ' F' : state.mode === 'psd' ? T('meta.layer') : T('meta.static');

    metaEl.appendChild(metaSizeEl);
    metaEl.appendChild(metaTypeEl);

    info.appendChild(nameEl);
    info.appendChild(metaEl);

    tile.appendChild(thumb);
    tile.appendChild(info);
    wrapper.appendChild(tile);
  }
}

/* 合輯版：素材資訊與原檔循環次數的文字抽成函式，切換語言時也會呼叫。 */
function assetMetaText(fileData) {
  return `${fileData.width} × ${fileData.height} px | ${state.mode === 'psd' ? T('meta.psdLayerPos', fileData.left || 0, fileData.top || 0) : fileData.isApng ? 'APNG' : T('meta.staticImage')}`;
}

function origLoopText(fileData) {
  const origPlays = fileData.origNumPlays !== undefined ? fileData.origNumPlays : 0;
  if (origPlays === 1) return T('loop.orig.once');
  if (origPlays > 1) return T('loop.orig.n', origPlays);
  return T('loop.orig.infinite');
}

function selectAsset(filename) {
  state.selectedFileName = filename;

  const fileData = state.filesMap.get(filename);
  const noSelText = document.getElementById('assetNoSelectText');
  const selControls = document.getElementById('assetSelectedControls');

  if (!fileData) {
    noSelText.style.display = 'block';
    selControls.style.display = 'none';
    return;
  }

  noSelText.style.display = 'none';
  selControls.style.display = 'flex';

  document.getElementById('assetDetailName').textContent = fileData.layerName || filename.split('/').pop();
  document.getElementById('assetDetailMeta').textContent = assetMetaText(fileData);

  const prevCanvas = document.getElementById('assetPreviewCanvas');
  prevCanvas.width = fileData.thumbElement.width;
  prevCanvas.height = fileData.thumbElement.height;
  const ctx = prevCanvas.getContext('2d');
  const recCvs = createRecoloredCanvas(fileData, false);
  ctx.drawImage(recCvs, 0, 0);

  const offset = getAssetOffset(fileData);
  document.getElementById('sliderAssetHue').value = offset.hue || 0;
  document.getElementById('numAssetHue').value = offset.hue || 0;
  document.getElementById('sliderAssetSat').value = offset.sat || 0;
  document.getElementById('numAssetSat').value = offset.sat || 0;
  document.getElementById('sliderAssetBri').value = offset.bri || 0;
  document.getElementById('numAssetBri').value = offset.bri || 0;
  document.getElementById('sliderAssetCon').value = offset.con || 0;
  document.getElementById('numAssetCon').value = offset.con || 0;
  if (document.getElementById('sliderAssetExp')) document.getElementById('sliderAssetExp').value = offset.exp || 0;
  if (document.getElementById('numAssetExp')) document.getElementById('numAssetExp').value = offset.exp || 0;

  if (window.renderAssetGradientUI) window.renderAssetGradientUI();
  if (window.drawAssetCurveCanvas) window.drawAssetCurveCanvas();

  const numW = document.getElementById('numCanvasWidth');
  const numH = document.getElementById('numCanvasHeight');
  if (numW) numW.value = fileData.width;
  if (numH) numH.value = fileData.height;

  const numInspW = document.getElementById('numInspectorCanvasWidth');
  const numInspH = document.getElementById('numInspectorCanvasHeight');
  if (numInspW) numInspW.value = fileData.width;
  if (numInspH) numInspH.value = fileData.height;

  const apngLoopSec = document.getElementById('inspectorApngLoopSection');
  if (apngLoopSec) {
    if (fileData.isApng) {
      apngLoopSec.style.display = 'flex';
      if (document.getElementById('textAssetOrigLoopInfo')) {
        document.getElementById('textAssetOrigLoopInfo').textContent = origLoopText(fileData);
      }
      const selLoop = document.getElementById('selectAssetApngLoop');
      if (selLoop) selLoop.value = fileData.customLoopMode || 'global';
      const numLoop = document.getElementById('numAssetApngLoopCount');
      if (numLoop) {
        numLoop.value = fileData.customLoopCount || 1;
        numLoop.style.display = (fileData.customLoopMode === 'custom') ? 'inline-block' : 'none';
      }
    } else {
      apngLoopSec.style.display = 'none';
    }
  }
}

/* ==========================================================================
   7. Single Image Inspection Focused View Modal & APNG Animation Player
   ========================================================================== */

const apngPlayer = {
  animTimer: null,
  isPlaying: false,
  currentFrame: 0,
  speed: 1.0,
  fileData: null
};

function startApngPlayback(fileData) {
  stopApngPlayback();
  if (!fileData || !fileData.isApng || !fileData.apngData) return;

  apngPlayer.fileData = fileData;
  apngPlayer.currentFrame = 0;
  apngPlayer.isPlaying = true;

  const playerCtrl = document.getElementById('apngPlayerControls');
  if (playerCtrl) playerCtrl.style.display = 'flex';

  const frameSlider = document.getElementById('sliderApngFrame');
  if (frameSlider) {
    frameSlider.min = 0;
    frameSlider.max = fileData.apngData.frames.length - 1;
    frameSlider.value = 0;
  }

  const btnPlay = document.getElementById('btnApngPlayPause');
  if (btnPlay) btnPlay.textContent = T('apng.pause');

  scheduleApngNextFrame();
}

function stopApngPlayback() {
  if (apngPlayer.animTimer) {
    clearTimeout(apngPlayer.animTimer);
    apngPlayer.animTimer = null;
  }
  apngPlayer.isPlaying = false;
  apngPlayer.fileData = null;

  const playerCtrl = document.getElementById('apngPlayerControls');
  if (playerCtrl) playerCtrl.style.display = 'none';

  const btnPlay = document.getElementById('btnApngPlayPause');
  if (btnPlay) btnPlay.textContent = T('apng.play');
}

function toggleApngPlayback() {
  if (!apngPlayer.fileData || !apngPlayer.fileData.isApng) return;
  apngPlayer.isPlaying = !apngPlayer.isPlaying;
  const btnPlay = document.getElementById('btnApngPlayPause');
  if (btnPlay) btnPlay.textContent = apngPlayer.isPlaying ? T('apng.pause') : T('apng.play');

  if (apngPlayer.isPlaying) {
    scheduleApngNextFrame();
  } else if (apngPlayer.animTimer) {
    clearTimeout(apngPlayer.animTimer);
    apngPlayer.animTimer = null;
  }
}

function scheduleApngNextFrame() {
  if (!apngPlayer.isPlaying || !apngPlayer.fileData || !apngPlayer.fileData.apngData) return;

  const apng = apngPlayer.fileData.apngData;
  const frames = apng.frames;
  const currIdx = apngPlayer.currentFrame;

  renderApngSingleFrame(apngPlayer.fileData, currIdx);

  const delay = (frames[currIdx].delay || 100) / (apngPlayer.speed || 1.0);
  apngPlayer.currentFrame = (currIdx + 1) % frames.length;

  apngPlayer.animTimer = setTimeout(() => {
    scheduleApngNextFrame();
  }, Math.max(16, delay));
}

function renderApngSingleFrame(fileData, frameIdx) {
  if (!fileData || !fileData.isApng || !fileData.apngData) return;
  const apng = fileData.apngData;
  const frame = apng.frames[frameIdx];
  if (!frame) return;

  const cvs = document.getElementById('inspectorCanvas');
  if (!cvs) return;
  cvs.width = apng.width;
  cvs.height = apng.height;
  const ctx = cvs.getContext('2d');

  if (state.inspectorShowingOriginal) {
    ctx.drawImage(frame.imageElement, frame.left, frame.top);
  } else {
    const off = document.createElement('canvas');
    off.width = apng.width;
    off.height = apng.height;
    const offCtx = off.getContext('2d');
    offCtx.drawImage(frame.imageElement, frame.left, frame.top);

    const imgData = offCtx.getImageData(0, 0, apng.width, apng.height);
    applyColorFilter(imgData, fileData.assetOffset);
    offCtx.putImageData(imgData, 0, 0);

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.drawImage(off, 0, 0);
  }

  const txtFrame = document.getElementById('textApngFrameNum');
  if (txtFrame) txtFrame.textContent = `${frameIdx + 1} / ${apng.frames.length} F (${frame.delay || 100}ms)`;

  const frameSlider = document.getElementById('sliderApngFrame');
  if (frameSlider && parseInt(frameSlider.value) !== frameIdx) {
    frameSlider.value = frameIdx;
  }
}

/* 合輯版：記下最近一次的測試結果，切換語言時才能重畫明細。 */
let lastApngTestResult = null;

function renderApngTestDetails() {
  const result = lastApngTestResult;
  const el = document.getElementById('apngTestDetails');
  if (!result || !el) return;
  el.textContent = T('apng.test.details', Math.round(result.scale * 100), result.cnum, result.framesCount, result.frameSkipped ? T('apng.test.skipped') : '');
}

async function runApngCompressionTest() {
  if (!state.selectedFileName) return;
  const fileData = state.filesMap.get(state.selectedFileName);
  if (!fileData) return;

  const targetMB = parseFloat(document.getElementById('selectApngTargetMb')?.value || '4.8');
  const allowSkip = document.getElementById('chkApngFrameSkip')?.checked !== false;

  const btn = document.getElementById('btnTestApngCompress');
  const card = document.getElementById('apngTestResultCard');
  if (btn) btn.disabled = true;

  updateCompressStatus('status.apngTest', fileData.name);

  try {
    const result = await compressApngToTargetMB(fileData, targetMB, { allowFrameSkip: allowSkip });

    if (card) card.style.display = 'flex';

    const sizeMbStr = (result.compressedSize / (1024 * 1024)).toFixed(2) + ' MB';
    const origMbStr = (result.origSize / (1024 * 1024)).toFixed(2) + ' MB';

    document.getElementById('apngTestResultSize').textContent = sizeMbStr;
    document.getElementById('apngTestOrigSize').textContent = origMbStr;
    document.getElementById('apngTestRatio').textContent = result.ratio + '%';

    lastApngTestResult = result;
    renderApngTestDetails();

    showAutoSaveToast(T('toast.apngTestDone', origMbStr, sizeMbStr, result.ratio));
  } catch (err) {
    alert(T('alert.apngTestFailed', err.message));
  } finally {
    if (btn) btn.disabled = false;
    updateCompressStatus('');
  }
}

/* 合輯版：檢視器標題列的尺寸與種類抽成函式，切換語言時也會呼叫。 */
function inspectorMetaText(fileData) {
  return `${fileData.width} × ${fileData.height} px (${state.mode === 'psd' ? T('meta.psdLayer') : fileData.isApng ? 'APNG' : T('meta.static')})`;
}

function openSingleInspectorModal(filename) {
  stopApngPlayback();
  state.selectedFileName = filename;
  const fileData = state.filesMap.get(filename);
  if (!fileData) return;

  selectAsset(filename);

  document.getElementById('inspectorFileName').textContent = fileData.layerName || filename.split('/').pop();
  document.getElementById('inspectorMetaBadge').textContent = inspectorMetaText(fileData);

  const apngStudioSec = document.getElementById('inspectorApngStudioSection');
  const testCard = document.getElementById('apngTestResultCard');
  if (testCard) testCard.style.display = 'none';

  if (fileData.isApng && fileData.apngData) {
    if (apngStudioSec) apngStudioSec.style.display = 'flex';
    startApngPlayback(fileData);
  } else {
    if (apngStudioSec) apngStudioSec.style.display = 'none';
    renderInspectorCanvas();
  }

  document.getElementById('singleInspectorModal').classList.add('show');
}

function renderInspectorCanvas() {
  if (!state.selectedFileName) return;
  const fileData = state.filesMap.get(state.selectedFileName);
  if (!fileData) return;

  if (fileData.isApng && apngPlayer.isPlaying) {
    renderApngSingleFrame(fileData, apngPlayer.currentFrame);
    return;
  }

  const cvs = document.getElementById('inspectorCanvas');
  cvs.width = fileData.width;
  cvs.height = fileData.height;
  const ctx = cvs.getContext('2d');

  if (state.inspectorShowingOriginal) {
    ctx.drawImage(fileData.imageElement, 0, 0);
  } else {
    const recoloredCvs = createRecoloredCanvas(fileData, true);
    ctx.drawImage(recoloredCvs, 0, 0);
  }
}

function closeSingleInspectorModal() {
  stopApngPlayback();
  document.getElementById('singleInspectorModal').classList.remove('show');
}

function navigateInspector(dir) {
  stopApngPlayback();
  const keys = Array.from(state.filesMap.keys());
  if (keys.length === 0) return;
  let idx = keys.indexOf(state.selectedFileName);
  if (idx === -1) idx = 0;
  else idx = (idx + dir + keys.length) % keys.length;

  openSingleInspectorModal(keys[idx]);
}

/* ==========================================================================
   8. Photoshop-Style Interactive Gradient Map Widget
   ========================================================================== */

function setupPhotoshopGradientWidget() {
  const ramp = document.getElementById('psGradientRamp');
  const stopsBar = document.getElementById('psStopsBar');
  const rampContainer = document.getElementById('psGradientRampContainer');

  window.renderPhotoshopGradientUI = function () {
    updateGradientLUT();

    const stops = [...state.master.gradStops].sort((a, b) => a.pos - b.pos);
    const cssStops = stops.map(s => `${s.color} ${s.pos}%`).join(', ');
    ramp.style.background = `linear-gradient(to right, ${cssStops})`;

    stopsBar.innerHTML = '';
    stops.forEach((stop, idx) => {
      const handle = document.createElement('div');
      handle.className = 'ps-stop-handle' + (state.master.activeStopIndex === idx ? ' active' : '');
      handle.style.left = `${stop.pos}%`;

      const colorBox = document.createElement('div');
      colorBox.className = 'color-preview';
      colorBox.style.background = stop.color;
      handle.appendChild(colorBox);

      handle.onclick = (e) => {
        e.stopPropagation();
        state.master.activeStopIndex = idx;
        renderPhotoshopGradientUI();
        updateActiveStopControls();
      };

      handle.onmousedown = (e) => {
        e.stopPropagation();
        state.master.activeStopIndex = idx;
        renderPhotoshopGradientUI();
        updateActiveStopControls();

        const barRect = stopsBar.getBoundingClientRect();
        const onMouseMove = (moveEvent) => {
          const relX = moveEvent.clientX - barRect.left;
          let newPos = Math.round((relX / barRect.width) * 100);
          newPos = Math.min(100, Math.max(0, newPos));
          stop.pos = newPos;
          renderPhotoshopGradientUI();
          updateActiveStopControls();
          scheduleRefreshPreviews();
        };

        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      };

      stopsBar.appendChild(handle);
    });

    updateActiveStopControls();
  };

  function updateActiveStopControls() {
    const stops = state.master.gradStops;
    const activeIdx = state.master.activeStopIndex;

    if (activeIdx < 0 || activeIdx >= stops.length) {
      state.master.activeStopIndex = 0;
    }

    const activeStop = stops[state.master.activeStopIndex] || stops[0];
    if (!activeStop) return;

    document.getElementById('psStopColorPicker').value = activeStop.color;
    document.getElementById('psStopPosInput').value = activeStop.pos;
  }

  rampContainer.onclick = (e) => {
    const rect = rampContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pos = Math.min(100, Math.max(0, Math.round((clickX / rect.width) * 100)));

    if (cachedGradientLUT) {
      const lumIdx = Math.round((pos / 100) * 255);
      const gColor = cachedGradientLUT[lumIdx];
      const hex = rgbToHex(gColor.r, gColor.g, gColor.b);
      state.master.gradStops.push({ pos, color: hex });
    } else {
      state.master.gradStops.push({ pos, color: '#888888' });
    }

    state.master.activeStopIndex = state.master.gradStops.length - 1;
    renderPhotoshopGradientUI();
    scheduleRefreshPreviews();
  };

  document.getElementById('psStopColorPicker').oninput = (e) => {
    const activeStop = state.master.gradStops[state.master.activeStopIndex];
    if (activeStop) {
      activeStop.color = e.target.value;
      renderPhotoshopGradientUI();
      scheduleRefreshPreviews();
    }
  };

  document.getElementById('psStopPosInput').oninput = (e) => {
    const activeStop = state.master.gradStops[state.master.activeStopIndex];
    if (activeStop) {
      activeStop.pos = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
      renderPhotoshopGradientUI();
      scheduleRefreshPreviews();
    }
  };

  document.getElementById('psBtnDeleteStop').onclick = () => {
    if (state.master.gradStops.length <= 2) {
      alert(T('alert.gradMinStops'));
      return;
    }
    state.master.gradStops.splice(state.master.activeStopIndex, 1);
    state.master.activeStopIndex = 0;
    renderPhotoshopGradientUI();
    scheduleRefreshPreviews();
  };

  window.applyGradientPreset = function (presetKey) {
    state.master.gradEnabled = true;
    document.getElementById('toggleGrad').checked = true;

    switch (presetKey) {
      case 'bw':
        state.master.gradStops = [{ pos: 0, color: '#000000' }, { pos: 100, color: '#ffffff' }];
        break;
      case 'sepia':
        state.master.gradStops = [{ pos: 0, color: '#1a0f00' }, { pos: 50, color: '#704214' }, { pos: 100, color: '#ffebcd' }];
        break;
      case 'cyber':
        state.master.gradStops = [{ pos: 0, color: '#0f172a' }, { pos: 50, color: '#ec4899' }, { pos: 100, color: '#06b6d4' }];
        break;
      case 'sunset':
        state.master.gradStops = [{ pos: 0, color: '#1e1b4b' }, { pos: 40, color: '#be123c' }, { pos: 75, color: '#f97316' }, { pos: 100, color: '#fef08a' }];
        break;
      case 'duotone':
        state.master.gradStops = [{ pos: 0, color: '#311b92' }, { pos: 100, color: '#00e676' }];
        break;
    }
    state.master.activeStopIndex = 0;
    renderPhotoshopGradientUI();
    scheduleRefreshPreviews();
  };

  document.getElementById('presetGradBW').onclick = () => applyGradientPreset('bw');
  document.getElementById('presetGradSepia').onclick = () => applyGradientPreset('sepia');
  document.getElementById('presetGradCyber').onclick = () => applyGradientPreset('cyber');
  document.getElementById('presetGradSunset').onclick = () => applyGradientPreset('sunset');
  document.getElementById('presetGradDuotone').onclick = () => applyGradientPreset('duotone');

  renderPhotoshopGradientUI();
}

/* ==========================================================================
   9. Room & PSD Canvas 2D Renderer (Exact Photoshop Placement & Order)
   ========================================================================== */

function renderRoomView() {
  const roomCanvas = document.getElementById('roomCanvas');
  const wrapper = document.getElementById('roomCanvasWrapper');
  if (!roomCanvas || !wrapper) return;

  roomCanvas.width = wrapper.clientWidth;
  roomCanvas.height = wrapper.clientHeight;
  const ctx = roomCanvas.getContext('2d');
  ctx.clearRect(0, 0, roomCanvas.width, roomCanvas.height);

  const cam = state.roomCamera;

  // PSD Mode Rendering (Exact Photoshop canvas & layer placement)
  if (state.mode === 'psd' && state.psdData) {
    const psdW = state.psdData.width;
    const psdH = state.psdData.height;

    ctx.save();
    ctx.translate(roomCanvas.width / 2 + cam.x, roomCanvas.height / 2 + cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    // PSD Document Canvas Frame Boundary
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-psdW / 2, -psdH / 2, psdW, psdH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2 / cam.zoom;
    ctx.strokeRect(-psdW / 2, -psdH / 2, psdW, psdH);

    // Render Layers in order (state.filesMap contains Bottom-most layer first, Top-most layer last)
    for (const [filename, fileData] of state.filesMap.entries()) {
      if (!isLayerEffectiveVisible(fileData)) continue; // Skip non-effective visible layers

      const renderCanvas = createRecoloredCanvas(fileData, false);

      // Absolute layer top-left offset relative to PSD document center (-psdW/2, -psdH/2)
      const lx = -psdW / 2 + (fileData.left !== undefined ? fileData.left : 0);
      const ly = -psdH / 2 + (fileData.top !== undefined ? fileData.top : 0);

      ctx.drawImage(renderCanvas, lx, ly, fileData.width, fileData.height);

      if (state.selectedFileName === filename) {
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 3 / cam.zoom;
        ctx.strokeRect(lx, ly, fileData.width, fileData.height);
      }
    }

    ctx.restore();
    return;
  }

  // Ccfolia Room Mode Rendering
  const itemsToRender = getCcfoliaItems(state.ccfoliaData);
  if (!state.ccfoliaData || itemsToRender.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(T('room.noData'), roomCanvas.width / 2, roomCanvas.height / 2);
    return;
  }

  const gridUnit = 50 * cam.zoom;

  ctx.save();
  ctx.translate(roomCanvas.width / 2 + cam.x, roomCanvas.height / 2 + cam.y);

  if (cam.showGrid) {
    ctx.strokeStyle = 'rgba(17, 17, 17, 0.15)';
    ctx.lineWidth = 1;
    const startX = -Math.floor((roomCanvas.width / 2 + cam.x) / gridUnit) * gridUnit;
    const endX = Math.ceil((roomCanvas.width / 2 - cam.x) / gridUnit) * gridUnit;
    const startY = -Math.floor((roomCanvas.height / 2 + cam.y) / gridUnit) * gridUnit;
    const endY = Math.ceil((roomCanvas.height / 2 - cam.y) / gridUnit) * gridUnit;

    for (let x = startX; x <= endX; x += gridUnit) {
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridUnit) {
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
    }
  }

  itemsToRender.sort((a, b) => (a.z !== b.z ? a.z - b.z : (a.order || 0) - (b.order || 0)));

  const findFileData = (identifier) => {
    if (!identifier) return null;
    if (state.filesMap.has(identifier)) return state.filesMap.get(identifier);

    let cleanId = String(identifier).split('?')[0].split('#')[0];
    cleanId = cleanId.split('/').pop().split('\\').pop().toLowerCase();
    const baseId = cleanId.replace(/\.[^.]+$/, '');

    for (const [fn, fd] of state.filesMap.entries()) {
      let cleanFn = String(fn).split('/').pop().split('\\').pop().toLowerCase();
      let baseFn = cleanFn.replace(/\.[^.]+$/, '');

      if (cleanFn === cleanId || baseFn === baseId) return fd;
      if (cleanFn.length > 3 && cleanId.length > 3) {
        if (cleanFn.includes(baseId) || cleanId.includes(baseFn)) return fd;
      }
    }
    return null;
  };
  window.findFileData = findFileData;

  for (const item of itemsToRender) {
    const fileData = findFileData(item.imageIdentifier);
    if (!fileData) continue;
    if (!isLayerEffectiveVisible(fileData)) continue;

    const renderCanvas = createRecoloredCanvas(fileData, false);

    ctx.save();
    const pw = item.width * gridUnit;
    const ph = item.height * gridUnit;
    const cx = (item.x + item.width / 2) * gridUnit;
    const cy = (item.y + item.height / 2) * gridUnit;

    ctx.translate(cx, cy);
    if (item.angle) ctx.rotate((item.angle * Math.PI) / 180);

    ctx.drawImage(renderCanvas, -pw / 2, -ph / 2, pw, ph);

    if (state.selectedFileName === fileData.name) {
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 3;
      ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
    }

    ctx.restore();
  }

  ctx.restore();
}

/* ==========================================================================
   10. Export / Download Processing (ZIP Generation)
   ========================================================================== */

/* --------------------------------------------------------------------------
   CCFOLIA 4.8MB 強制壓縮演算法
   依序嘗試解析度（100%～40%）× 色數（256→32），回傳第一個 4.8MB 以下的緩衝區
-------------------------------------------------------------------------- */
const CCFOLIA_MAX_BYTES = 4.8 * 1024 * 1024; // 5,033,164 bytes

/* 合輯版：改傳字典 key 與參數（傳空字串就清除），記下來，切換語言時才能重畫。 */
let compressStatus = null;

function updateCompressStatus(key, ...args) {
  compressStatus = key ? { key, args } : null;
  renderCompressStatus();
}

function renderCompressStatus() {
  const el = document.getElementById('compressStatusText');
  if (!el) return;
  if (compressStatus) {
    el.textContent = T(compressStatus.key, ...compressStatus.args);
    el.classList.add('show');
  } else {
    el.textContent = '';
    el.classList.remove('show');
  }
}

/**
 * 分階段搜尋壓縮設定，讓 APNG 與圖片影格小於指定的目標 MB。
 * @param {Object} fileData       - 素材資料物件
 * @param {number} targetMaxMB    - 目標容量上限（MB，預設 4.8MB）
 * @param {Object} options        - { allowFrameSkip: boolean, compressStatic: boolean }
 * @returns {Promise<{ buffer: ArrayBuffer, scale: number, cnum: number, framesCount: number, origSize: number, compressedSize: number, ratio: string, frameSkipped: boolean }>}
 */
async function compressApngToTargetMB(fileData, targetMaxMB = 4.8, options = {}) {
  const targetMaxBytes = targetMaxMB * 1024 * 1024;
  const allowFrameSkip = options.allowFrameSkip !== false;

  const apng = fileData.apngData;
  const origWidth = apng ? apng.width : fileData.width;
  const origHeight = apng ? apng.height : fileData.height;
  const origSize = fileData.arrayBuffer ? fileData.arrayBuffer.byteLength : (fileData.blob ? fileData.blob.size : 0);

  if (!apng) {
    // 靜態圖片的壓縮處理
    const cvs = createRecoloredCanvas(fileData, true);
    const blob = await new Promise(r => cvs.toBlob(r, 'image/png'));
    const buf = await blob.arrayBuffer();
    if (buf.byteLength <= targetMaxBytes) {
      return {
        buffer: buf,
        scale: 1.0,
        cnum: 0,
        framesCount: 1,
        origSize: origSize || buf.byteLength,
        compressedSize: buf.byteLength,
        ratio: Math.max(0, ((1 - buf.byteLength / (origSize || buf.byteLength)) * 100)).toFixed(1),
        frameSkipped: false
      };
    }
    // 靜態圖片：用 UPNG 減少色數
    const ctx = cvs.getContext('2d');
    const imgData = ctx.getImageData(0, 0, origWidth, origHeight);
    for (const cnum of [256, 192, 128, 64, 32]) {
      const compBuf = UPNG.encode([imgData.data.buffer.slice(0)], origWidth, origHeight, cnum);
      if (compBuf.byteLength <= targetMaxBytes) {
        return {
          buffer: compBuf,
          scale: 1.0,
          cnum: cnum,
          framesCount: 1,
          origSize: origSize || compBuf.byteLength,
          compressedSize: compBuf.byteLength,
          ratio: Math.max(0, ((1 - compBuf.byteLength / (origSize || compBuf.byteLength)) * 100)).toFixed(1),
          frameSkipped: false
        };
      }
    }
    // 靜態圖片：縮小解析度
    const smallCvs = document.createElement('canvas');
    smallCvs.width = Math.max(1, Math.round(origWidth * 0.7));
    smallCvs.height = Math.max(1, Math.round(origHeight * 0.7));
    smallCvs.getContext('2d').drawImage(cvs, 0, 0, smallCvs.width, smallCvs.height);
    const smallImgData = smallCvs.getContext('2d').getImageData(0, 0, smallCvs.width, smallCvs.height);
    const finalBuf = UPNG.encode([smallImgData.data.buffer.slice(0)], smallCvs.width, smallCvs.height, 128);
    return {
      buffer: finalBuf,
      scale: 0.7,
      cnum: 128,
      framesCount: 1,
      origSize: origSize || finalBuf.byteLength,
      compressedSize: finalBuf.byteLength,
      ratio: Math.max(0, ((1 - finalBuf.byteLength / (origSize || finalBuf.byteLength)) * 100)).toFixed(1),
      frameSkipped: false
    };
  }

  // 取出 APNG 每一格的 RGBA 緩衝區
  const offCanvas = document.createElement('canvas');
  offCanvas.width = origWidth;
  offCanvas.height = origHeight;
  const offCtx = offCanvas.getContext('2d');

  const framesRGBA = [];
  const delays = [];
  let prevFrame = null;
  let prevFrameData = null;

  for (let i = 0; i < apng.frames.length; i++) {
    const frame = apng.frames[i];
    delays.push(frame.delay || 100);

    if (prevFrame && prevFrame.disposeOp === 1) {
      offCtx.clearRect(prevFrame.left, prevFrame.top, prevFrame.width, prevFrame.height);
    } else if (prevFrame && prevFrame.disposeOp === 2 && prevFrameData) {
      offCtx.putImageData(prevFrameData, prevFrame.left, prevFrame.top);
    }
    prevFrame = frame;
    prevFrameData = null;
    if (frame.disposeOp === 2) {
      prevFrameData = offCtx.getImageData(frame.left, frame.top, frame.width, frame.height);
    }
    if (frame.blendOp === 0) {
      offCtx.clearRect(frame.left, frame.top, frame.width, frame.height);
    }
    offCtx.drawImage(frame.imageElement, frame.left, frame.top);

    const fullImgData = offCtx.getImageData(0, 0, origWidth, origHeight);
    applyColorFilter(fullImgData, fileData.assetOffset);
    framesRGBA.push(fullImgData.data.buffer.slice(0));
  }

  const scaleSteps = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
  const cnumSteps = [256, 192, 128, 96, 64, 48, 32];

  // 策略 1：逐步縮小解析度 × 逐步減少色數（以 slice 深拷貝緩衝區）
  for (const scale of scaleSteps) {
    const targetW = Math.max(1, Math.round(origWidth * scale));
    const targetH = Math.max(1, Math.round(origHeight * scale));

    let currentFrames = framesRGBA;
    if (scale < 1.0) {
      currentFrames = [];
      for (const buf of framesRGBA) {
        const srcCvs = document.createElement('canvas');
        srcCvs.width = origWidth; srcCvs.height = origHeight;
        srcCvs.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf.slice(0)), origWidth, origHeight), 0, 0);

        const dstCvs = document.createElement('canvas');
        dstCvs.width = targetW; dstCvs.height = targetH;
        dstCvs.getContext('2d').drawImage(srcCvs, 0, 0, targetW, targetH);

        const dstId = dstCvs.getContext('2d').getImageData(0, 0, targetW, targetH);
        currentFrames.push(dstId.data.buffer);
      }
    }

    for (const cnum of cnumSteps) {
      updateCompressStatus('status.apngCompressing', Math.round(scale * 100), cnum);
      await new Promise(r => setTimeout(r, 5));

      // 避免 UPNG.encode 汙染記憶體：傳入 slice(0) 的副本
      const testBuffers = currentFrames.map(b => b.slice(0));
      const compBuf = UPNG.encode(testBuffers, targetW, targetH, cnum, delays);

      if (compBuf.byteLength <= targetMaxBytes) {
        const ratio = Math.max(0, ((1 - compBuf.byteLength / (origSize || compBuf.byteLength)) * 100)).toFixed(1);
        const targetNumPlays = apng ? getTargetApngLoopCount(fileData) : 0;
        const finalBuf = apng ? setApngLoopCount(compBuf, targetNumPlays) : compBuf;
        return {
          buffer: finalBuf,
          scale: scale,
          cnum: cnum,
          framesCount: apng.frames.length,
          origSize: origSize || compBuf.byteLength,
          compressedSize: compBuf.byteLength,
          ratio: ratio,
          frameSkipped: false
        };
      }
    }
  }

  // 策略 2：跳格（Frame Subsampling）——只取偶數格，並把延遲時間加總
  if (allowFrameSkip && framesRGBA.length >= 6) {
    updateCompressStatus('status.frameSkip');
    const skippedFrames = [];
    const skippedDelays = [];
    for (let i = 0; i < framesRGBA.length; i += 2) {
      skippedFrames.push(framesRGBA[i]);
      const d1 = delays[i] || 100;
      const d2 = (i + 1 < delays.length) ? delays[i + 1] : d1;
      skippedDelays.push(d1 + d2);
    }

    for (const scale of [0.9, 0.75, 0.6, 0.5]) {
      const targetW = Math.max(1, Math.round(origWidth * scale));
      const targetH = Math.max(1, Math.round(origHeight * scale));

      const currentFrames = [];
      for (const buf of skippedFrames) {
        const srcCvs = document.createElement('canvas');
        srcCvs.width = origWidth; srcCvs.height = origHeight;
        srcCvs.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf.slice(0)), origWidth, origHeight), 0, 0);

        const dstCvs = document.createElement('canvas');
        dstCvs.width = targetW; dstCvs.height = targetH;
        dstCvs.getContext('2d').drawImage(srcCvs, 0, 0, targetW, targetH);
        currentFrames.push(dstCvs.getContext('2d').getImageData(0, 0, targetW, targetH).data.buffer);
      }

      for (const cnum of [128, 64, 32]) {
        const testBuffers = currentFrames.map(b => b.slice(0));
        const compBuf = UPNG.encode(testBuffers, targetW, targetH, cnum, skippedDelays);

        if (compBuf.byteLength <= targetMaxBytes) {
          const ratio = Math.max(0, ((1 - compBuf.byteLength / (origSize || compBuf.byteLength)) * 100)).toFixed(1);
          const targetNumPlays = apng ? getTargetApngLoopCount(fileData) : 0;
          const finalBuf = apng ? setApngLoopCount(compBuf, targetNumPlays) : compBuf;
          return {
            buffer: finalBuf,
            scale: scale,
            cnum: cnum,
            framesCount: skippedFrames.length,
            origSize: origSize || compBuf.byteLength,
            compressedSize: compBuf.byteLength,
            ratio: ratio,
            frameSkipped: true
          };
        }
      }
    }
  }

  // 策略 3：退路（解析度 40%、32 色的最低設定）
  const fbW = Math.max(1, Math.round(origWidth * 0.4));
  const fbH = Math.max(1, Math.round(origHeight * 0.4));
  const fbFrames = [];
  for (const buf of framesRGBA) {
    const srcCvs = document.createElement('canvas');
    srcCvs.width = origWidth; srcCvs.height = origHeight;
    srcCvs.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf.slice(0)), origWidth, origHeight), 0, 0);
    const dstCvs = document.createElement('canvas');
    dstCvs.width = fbW; dstCvs.height = fbH;
    dstCvs.getContext('2d').drawImage(srcCvs, 0, 0, fbW, fbH);
    fbFrames.push(dstCvs.getContext('2d').getImageData(0, 0, fbW, fbH).data.buffer);
  }
  const fbBuf = UPNG.encode(fbFrames.map(b => b.slice(0)), fbW, fbH, 32, delays);
  const ratio = Math.max(0, ((1 - fbBuf.byteLength / (origSize || fbBuf.byteLength)) * 100)).toFixed(1);
  const targetNumPlays = apng ? getTargetApngLoopCount(fileData) : 0;
  const finalFbBuf = apng ? setApngLoopCount(fbBuf, targetNumPlays) : fbBuf;
  return {
    buffer: finalFbBuf,
    scale: 0.4,
    cnum: 32,
    framesCount: apng.frames.length,
    origSize: origSize || finalFbBuf.byteLength,
    compressedSize: finalFbBuf.byteLength,
    ratio: ratio,
    frameSkipped: false
  };
}

function scaleCcfoliaDataJson(jsonData, filename, scale) {
  // In Ccfolia, item width/height in data.json represent room grid units (tile spans).
  // Image resolution compression does not change room grid dimensions.
  return jsonData;
}

// 計算雜湊值的輔助函式
async function calculateSHA256(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function exportProcessedZip() {
  if (state.filesMap.size === 0) return;

  if (state.mode === 'ccfolia' && !state.originalZip) {
    alert(T('alert.sessionNoZip'));
    return;
  }

  const useCcfoliaCompress = document.getElementById('chkCcfoliaCompress')?.checked || false;
  const targetMB = parseFloat(document.getElementById('selectApngTargetMb')?.value || '4.8');
  const allowSkip = document.getElementById('chkApngFrameSkip')?.checked !== false;
  const compressStatic = document.getElementById('chkCompressStaticPng')?.checked || false;

  const title = state.mode === 'psd' ? T('modal.exportPsd') : T('modal.exportZip');
  showModal(title, T('modal.exportSub'));

  let modifiedCcfoliaData = state.ccfoliaData ? JSON.parse(JSON.stringify(state.ccfoliaData)) : null;

  let exportZip = state.originalZip;
  if (!exportZip || state.mode === 'psd') {
    exportZip = new JSZip();
  }

  let count = 0;
  const total = state.filesMap.size;
  const hashMapping = {}; // 記錄 { 舊雜湊: 新雜湊 } 的對應

  for (const [filename, fileData] of state.filesMap.entries()) {
    if (!isLayerEffectiveVisible(fileData)) continue;

    count++;
    updateModalProgress(T('progress.assets', count, total), filename);

    let finalBlob;

    if (fileData.isApng && useCcfoliaCompress) {
      updateCompressStatus('status.apngSearching', filename);
      const res = await compressApngToTargetMB(fileData, targetMB, { allowFrameSkip: allowSkip });
      finalBlob = new Blob([res.buffer], { type: 'image/png' });

      if (res.scale < 1.0 && modifiedCcfoliaData) {
        modifiedCcfoliaData = scaleCcfoliaDataJson(modifiedCcfoliaData, filename, res.scale);
      }
    } else if (fileData.isApng) {
      finalBlob = await processAPNGRecolor(fileData, (f, tf) => {
        updateModalProgress(T('progress.apngFrames', count, total), T('progress.frameOf', f, tf));
      });
    } else if (useCcfoliaCompress && compressStatic) {
      const res = await compressApngToTargetMB(fileData, targetMB, { allowFrameSkip: false });
      finalBlob = new Blob([res.buffer], { type: 'image/png' });
      if (res.scale < 1.0 && modifiedCcfoliaData) {
        modifiedCcfoliaData = scaleCcfoliaDataJson(modifiedCcfoliaData, filename, res.scale);
      }
    } else {
      const cvs = createRecoloredCanvas(fileData, true);
      finalBlob = await new Promise(res => cvs.toBlob(res, 'image/png'));
    }

    let arrayBuf = await finalBlob.arrayBuffer();
    if (fileData.isApng) {
      const targetNumPlays = getTargetApngLoopCount(fileData);
      arrayBuf = setApngLoopCount(arrayBuf, targetNumPlays);
    }

    if (state.mode === 'ccfolia') {
      // 1. 計算新圖片的 SHA-256 雜湊值
      const newHash = await calculateSHA256(arrayBuf);

      const oldFilename = filename.split('/').pop().split('\\').pop();
      const extIdx = oldFilename.lastIndexOf('.');
      const hasExt = extIdx !== -1;

      const oldHashBase = hasExt ? oldFilename.substring(0, extIdx) : oldFilename;
      const newFilename = hasExt ? `${newHash}${oldFilename.substring(extIdx)}` : newHash;

      // 記錄對應（雜湊本體、完整檔名、含路徑的完整名稱都要對應）
      hashMapping[oldHashBase] = newHash;
      hashMapping[oldFilename] = newFilename;
      hashMapping[filename] = filename.replace(oldFilename, newFilename);

      // 2. 從 ZIP 裡刪掉舊檔，再以新的雜湊檔名放回原本的路徑
      exportZip.remove(filename);
      const pathPrefix = filename.substring(0, filename.length - oldFilename.length);
      exportZip.file(pathPrefix + newFilename, arrayBuf);
    } else {
      const exportFileName = (state.mode === 'psd' && fileData.layerName)
        ? `${fileData.layerName.replace(/[\/\\?%*:"|<>]/g, '_')}.png`
        : filename;
      exportZip.file(exportFileName, arrayBuf);
    }
  }

  let exportedDataJsonStr = null;
  let jsonDownloadFileName = state.jsonFileName || 'data.json';

  // 3. 走訪 data.json／room.json 裡的物件，安全地替換（避免破壞結構）
  if (state.mode === 'ccfolia' && modifiedCcfoliaData) {
    // 替換時從較長的字串先換，避免誤換
    const sortedEntries = Object.entries(hashMapping).sort((a, b) => b[0].length - a[0].length);

    function replaceHashSafely(obj) {
      if (typeof obj === 'string') {
        let newStr = obj;
        for (const [oldH, newH] of sortedEntries) {
          if (oldH && newH) {
            if (newStr === oldH) {
              newStr = newH;
            } else if (newStr.includes(oldH)) {
              newStr = newStr.split(oldH).join(newH);
            }
          }
        }
        return newStr;
      } else if (Array.isArray(obj)) {
        return obj.map(item => replaceHashSafely(item));
      } else if (obj !== null && typeof obj === 'object') {
        const newObj = {};
        for (const key of Object.keys(obj)) {
          let newKey = key;
          for (const [oldH, newH] of sortedEntries) {
            if (oldH && newH) {
              if (newKey === oldH) {
                newKey = newH;
              } else if (newKey.includes(oldH)) {
                newKey = newKey.split(oldH).join(newH);
              }
            }
          }
          newObj[newKey] = replaceHashSafely(obj[key]);
        }
        return newObj;
      }
      return obj;
    }

    modifiedCcfoliaData = replaceHashSafely(modifiedCcfoliaData);
    exportedDataJsonStr = JSON.stringify(modifiedCcfoliaData, null, 2);

    let dataJsonPath = state.jsonFileName || 'data.json';
    if (state.originalZip) {
      const found = state.originalZip.file(/(^|\/)(data|__data|room)\.json$/i);
      if (found && found.length > 0) {
        dataJsonPath = found[0].name;
      }
    }
    jsonDownloadFileName = dataJsonPath.split('/').pop().split('\\').pop() || 'data.json';
    exportZip.file(dataJsonPath, exportedDataJsonStr);
  }

  updateModalProgress(T('progress.packing'), T('progress.packingSub'));
  const zipBlob = await exportZip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  updateCompressStatus('');

  // 下載 ZIP 檔案
  const downloadUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;

  const fallbackBase = state.mode === 'psd' ? 'psd_layers' : state.mode === 'ccfolia' ? 'ccfolia' : 'recolored_images';
  const baseName = (state.originalFileName && state.originalFileName.trim()) ? state.originalFileName.trim() : fallbackBase;
  const safeBaseName = baseName.replace(/[\\/:*?"<>|]+/g, '_');
  a.download = `${safeBaseName}_recolor.zip`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);


  showAutoSaveToast(T('toast.downloaded', a.download));

  hideModal();
}
/* ==========================================================================
   11. Modal & Debounced Refresh Helpers
   ========================================================================== */

function showModal(title, subtext) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalSubtext').textContent = subtext;
  document.getElementById('modalProgressBar').style.width = '0%';
  document.getElementById('processingModal').classList.add('show');
}

function updateModalProgress(title, subtext, percentage = null) {
  if (title) document.getElementById('modalTitle').textContent = title;
  if (subtext) document.getElementById('modalSubtext').textContent = subtext;
  if (percentage !== null) document.getElementById('modalProgressBar').style.width = percentage + '%';
}

function hideModal() {
  document.getElementById('processingModal').classList.remove('show');
}

function isLayerEffectiveVisible(fileData) {
  if (!fileData) return false;
  let hasAnySolo = false;
  for (const fd of state.filesMap.values()) {
    if (fd.solo) {
      hasAnySolo = true;
      break;
    }
  }

  if (hasAnySolo) {
    return !!fileData.solo;
  }
  return fileData.visible !== false;
}

window.toggleAllPsdLayers = function (visibleState) {
  for (const fd of state.filesMap.values()) {
    fd.visible = visibleState;
  }
  scheduleRefreshPreviews();
};

window.resetAllPsdSolo = function () {
  for (const fd of state.filesMap.values()) {
    fd.solo = false;
  }
  scheduleRefreshPreviews();
};

function renderPsdLayerPanel() {
  const floatPanel = document.getElementById('psdFloatingLayerPanel');

  if ((state.mode !== 'psd' && state.mode !== 'ccfolia') || state.filesMap.size === 0) {
    if (floatPanel) floatPanel.style.display = 'none';
    return;
  }

  if (floatPanel) floatPanel.style.display = 'flex';

  const floatHeaderSpan = floatPanel ? floatPanel.querySelector('.psd-layer-panel-header span') : null;
  const headerTitle = state.mode === 'ccfolia' ? T('layers.ccfolia') : T('layers.psd');
  if (floatHeaderSpan) floatHeaderSpan.textContent = headerTitle;

  const floatList = document.getElementById('psdFloatingLayerList');

  const populateList = (container) => {
    if (!container) return;
    container.innerHTML = '';

    let layerItems = [];
    const processedFileNames = new Set();

    if (state.mode === 'ccfolia' && state.ccfoliaData) {
      const roomItems = getCcfoliaItems(state.ccfoliaData);
      // Sort top-most Z level first for layer panel stack view
      roomItems.sort((a, b) => (b.z !== a.z ? b.z - a.z : (b.order || 0) - (a.order || 0)));

      for (const item of roomItems) {
        const fd = (window.findFileData || findFileData)(item.imageIdentifier);
        if (fd) {
          processedFileNames.add(fd.name);
          layerItems.push({
            fileData: fd,
            filename: fd.name,
            displayName: item.name && item.name !== 'Item' ? `${item.name} (${fd.layerName || fd.name.split('/').pop()})` : (fd.layerName || fd.name.split('/').pop()),
            metaText: `z:${item.z} | ${fd.width}×${fd.height}`
          });
        }
      }

      // Ensure ALL images from state.filesMap appear in the list even if not referenced in roomItems
      for (const [filename, fd] of state.filesMap.entries()) {
        if (!processedFileNames.has(filename)) {
          processedFileNames.add(filename);
          layerItems.push({
            fileData: fd,
            filename: filename,
            displayName: fd.layerName || filename.split('/').pop(),
            metaText: T('layers.assetMeta', fd.width, fd.height)
          });
        }
      }
    } else {
      // Reverse map entries so Top-most layer is at top of list, Bottom-most layer is at bottom!
      const entries = Array.from(state.filesMap.entries()).reverse();
      for (const [filename, fd] of entries) {
        layerItems.push({
          fileData: fd,
          filename: filename,
          displayName: fd.layerName || filename.split('/').pop(),
          metaText: `${fd.width}×${fd.height}`
        });
      }
    }

    for (const layerObj of layerItems) {
      const { fileData, filename, displayName, metaText } = layerObj;
      const isSelected = state.selectedFileName === filename;
      const isEffVisible = isLayerEffectiveVisible(fileData);
      const isVisible = fileData.visible !== false;
      const isSolo = !!fileData.solo;

      const item = document.createElement('div');
      item.className = 'psd-layer-item' + (isSelected ? ' selected' : '') + (!isEffVisible ? ' hidden-layer' : '');

      item.onclick = () => {
        selectAsset(filename);
        scheduleRefreshPreviews();
      };

      // Eye Icon Visibility Toggle
      const btnEye = document.createElement('button');
      btnEye.className = 'btn-vis-eye' + (!isVisible ? ' off' : '');
      btnEye.title = isVisible ? T('layer.hide') : T('layer.show');
      btnEye.innerHTML = isVisible
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
      btnEye.onclick = (e) => {
        e.stopPropagation();
        fileData.visible = !fileData.visible;
        scheduleRefreshPreviews();
      };

      // Solo Square Button
      const btnSolo = document.createElement('button');
      btnSolo.className = 'btn-solo-square' + (isSolo ? ' active' : '');
      btnSolo.textContent = 'S';
      btnSolo.title = isSolo ? T('layer.soloOff') : T('layer.soloOn');
      btnSolo.onclick = (e) => {
        e.stopPropagation();
        fileData.solo = !fileData.solo;
        scheduleRefreshPreviews();
      };

      // Thumbnail canvas
      const thumb = document.createElement('div');
      thumb.className = 'psd-layer-thumb';
      const recCanvas = createRecoloredCanvas(fileData, false);
      thumb.appendChild(recCanvas);

      // Layer info
      const nameEl = document.createElement('div');
      nameEl.className = 'psd-layer-name';
      nameEl.textContent = displayName;
      nameEl.title = displayName;

      const metaEl = document.createElement('div');
      metaEl.className = 'psd-layer-meta';
      metaEl.textContent = metaText;

      item.appendChild(btnEye);
      item.appendChild(btnSolo);
      item.appendChild(thumb);
      item.appendChild(nameEl);
      item.appendChild(metaEl);

      container.appendChild(item);
    }
  };

  populateList(floatList);
}

/* ==========================================================================
   Custom Preset Storage & Canvas Resize (Fit Margin) Functions
   ========================================================================== */

let customPresets = [];

function loadCustomPresets() {
  try {
    const data = localStorage.getItem('color_studio_custom_presets');
    if (data) customPresets = JSON.parse(data);
  } catch (e) {
    customPresets = [];
  }
  renderCustomPresetsUI();
}

function saveCustomPresets() {
  try {
    localStorage.setItem('color_studio_custom_presets', JSON.stringify(customPresets));
  } catch (e) { }
}

function renderCustomPresetsUI() {
  const container = document.getElementById('customPresetsList');
  if (!container) return;
  container.innerHTML = '';

  if (customPresets.length === 0) {
    container.innerHTML = `<span style="font-size:0.72rem; color: var(--text-dim);">${T('preset.none')}</span>`;
    return;
  }

  customPresets.forEach(preset => {
    const pill = document.createElement('div');
    pill.className = 'custom-preset-pill';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'preset-apply-btn';
    applyBtn.textContent = preset.name;
    applyBtn.onclick = () => applyCustomPreset(preset.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-xs-del';
    delBtn.textContent = '✕';
    delBtn.title = T('preset.delete');
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteCustomPreset(preset.id);
    };

    pill.appendChild(applyBtn);
    pill.appendChild(delBtn);
    container.appendChild(pill);
  });
}

function addCustomPreset(name) {
  name = (name || '').trim();
  if (!name) name = T('preset.defaultName', customPresets.length + 1);

  const newPreset = {
    id: 'preset_' + Date.now(),
    name: name,
    master: JSON.parse(JSON.stringify(state.master)),
    curves: JSON.parse(JSON.stringify(state.curves))
  };

  customPresets.push(newPreset);
  saveCustomPresets();
  renderCustomPresetsUI();

  const input = document.getElementById('inputCustomPresetName');
  if (input) input.value = '';

  showAutoSaveToast(T('toast.presetSaved', newPreset.name));
}

function applyCustomPreset(presetId) {
  const preset = customPresets.find(p => p.id === presetId);
  if (!preset) return;

  state.master = JSON.parse(JSON.stringify(preset.master));
  state.curves = JSON.parse(JSON.stringify(preset.curves));

  // Sync UI Sliders and Numbers
  document.getElementById('sliderHue').value = state.master.hue || 0;
  document.getElementById('numHue').value = state.master.hue || 0;
  document.getElementById('sliderSat').value = state.master.saturation !== undefined ? state.master.saturation : 100;
  document.getElementById('numSat').value = state.master.saturation !== undefined ? state.master.saturation : 100;
  document.getElementById('sliderBri').value = state.master.brightness || 0;
  document.getElementById('numBri').value = state.master.brightness || 0;
  document.getElementById('sliderCon').value = state.master.contrast || 0;
  document.getElementById('numCon').value = state.master.contrast || 0;
  document.getElementById('sliderExp').value = state.master.exposure || 0;
  document.getElementById('numExp').value = state.master.exposure || 0;
  document.getElementById('toggleGrad').checked = !!state.master.gradEnabled;
  document.getElementById('sliderGradOp').value = state.master.gradOpacity !== undefined ? state.master.gradOpacity : 100;
  document.getElementById('valGradOp').textContent = (state.master.gradOpacity !== undefined ? state.master.gradOpacity : 100) + '%';
  document.getElementById('selectGradBlend').value = state.master.blendMode || 'overlay';

  renderPhotoshopGradientUI();
  if (window.drawCurveCanvas) window.drawCurveCanvas();
  scheduleRefreshPreviews();

  showAutoSaveToast(T('toast.presetApplied', preset.name));
}

function deleteCustomPreset(presetId) {
  const preset = customPresets.find(p => p.id === presetId);
  if (!preset) return;
  if (confirm(T('confirm.presetDelete', preset.name))) {
    customPresets = customPresets.filter(p => p.id !== presetId);
    saveCustomPresets();
    renderCustomPresetsUI();
    showAutoSaveToast(T('toast.presetDeleted', preset.name));
  }
}

/**
 * Calculate 24-multiple fit margin dimensions.
 * Rules: Ceiling width and height to next 24-multiple if not divisible by 24.
 */
function getFitMarginDimensions(w, h) {
  const targetW = Math.ceil(w / 24) * 24;
  const targetH = Math.ceil(h / 24) * 24;
  return { width: targetW, height: targetH };
}

/**
 * Resizes an asset's canvas to newW x newH, centering original content.
 */
async function resizeAssetCanvas(fileData, newW, newH) {
  if (!fileData || newW <= 0 || newH <= 0) return;
  if (fileData.width === newW && fileData.height === newH) {
    showAutoSaveToast(T('toast.alreadySize', newW, newH));
    return;
  }

  showModal(T('modal.resizing'), `${fileData.name} (${fileData.width}x${fileData.height} → ${newW}x${newH}px)`);

  const oldW = fileData.width;
  const oldH = fileData.height;

  // Center offset
  const offsetX = Math.floor((newW - oldW) / 2);
  const offsetY = Math.floor((newH - oldH) / 2);

  // Handle APNG animation frame canvases if APNG
  if (fileData.isApng && fileData.apngData && fileData.apngData.frames) {
    for (const frame of fileData.apngData.frames) {
      if (frame.canvas) {
        const paddedCvs = document.createElement('canvas');
        paddedCvs.width = newW;
        paddedCvs.height = newH;
        const ctx = paddedCvs.getContext('2d');
        ctx.drawImage(frame.canvas, offsetX, offsetY);
        frame.canvas = paddedCvs;
      }
    }
  }

  // Create new centered master image canvas
  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(fileData.imageElement, offsetX, offsetY);

  const newBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const newImageEl = await loadImageElement(newBlob);
  const newThumbEl = await createDownscaledThumb(newImageEl, 240);
  const newDataUrl = await blobToDataURL(newBlob);
  const newArrayBuf = await newBlob.arrayBuffer();

  fileData.width = newW;
  fileData.height = newH;
  fileData.blob = newBlob;
  fileData.imageElement = newImageEl;
  fileData.thumbElement = newThumbEl;
  fileData.dataUrl = newDataUrl;
  fileData.arrayBuffer = newArrayBuf;

  // Update PSD layer left/top if PSD mode
  if (state.mode === 'psd') {
    fileData.left = (fileData.left || 0) - offsetX;
    fileData.top = (fileData.top || 0) - offsetY;
  }

  hideModal();
  selectAsset(fileData.name);
  if (document.getElementById('singleInspectorModal').classList.contains('show')) {
    renderInspectorCanvas();
  }
  scheduleRefreshPreviews();
  scheduleAutoSaveSession();
  showAutoSaveToast(T('toast.resized', newW, newH));
}

async function fitMarginForAsset(fileData) {
  if (!fileData) return;
  const { width: targetW, height: targetH } = getFitMarginDimensions(fileData.width, fileData.height);
  if (targetW === fileData.width && targetH === fileData.height) {
    showAutoSaveToast(T('toast.alreadyGrid', fileData.width, fileData.height));
    return;
  }
  await resizeAssetCanvas(fileData, targetW, targetH);
}

async function fitMarginForAllAssets() {
  if (state.filesMap.size === 0) return;

  showModal(T('modal.fitAll'), T('modal.fitAllSub'));

  let count = 0;
  const keys = Array.from(state.filesMap.keys());
  for (const fn of keys) {
    const fileData = state.filesMap.get(fn);
    if (!fileData) continue;
    const { width: targetW, height: targetH } = getFitMarginDimensions(fileData.width, fileData.height);
    if (targetW !== fileData.width || targetH !== fileData.height) {
      await resizeAssetCanvas(fileData, targetW, targetH);
      count++;
    }
  }

  hideModal();
  if (count === 0) {
    showAutoSaveToast(T('toast.allAlreadyGrid'));
  } else {
    showAutoSaveToast(T('toast.fitAllDone', count));
  }
}

/* ==========================================================================
   Auto-Save & Session Recovery (IndexedDB)
   ========================================================================== */

const DB_NAME = 'ColorStudioAutoSaveDB';
const DB_VERSION = 1;
const STORE_NAME = 'sessionStore';

function openAutoSaveDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataURL) {
  const parts = dataURL.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const uInt8Array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

let saveToastTimer = null;
function showAutoSaveToast(message) {
  const toast = document.getElementById('autoSaveToast');
  if (!toast) return;
  toast.textContent = '';
  const toastSpan = document.createElement('span');
  toastSpan.textContent = message;
  toast.appendChild(toastSpan);
  toast.classList.add('show');
  if (saveToastTimer) clearTimeout(saveToastTimer);
  saveToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function saveSessionSync() {
  try {
    if (state.filesMap.size === 0) return;

    const filesArray = [];
    for (const [filename, fileData] of state.filesMap.entries()) {
      if (!fileData.dataUrl) continue;
      filesArray.push({
        name: filename,
        layerName: fileData.layerName || null,
        left: fileData.left !== undefined ? fileData.left : 0,
        top: fileData.top !== undefined ? fileData.top : 0,
        visible: fileData.visible !== false,
        solo: !!fileData.solo,
        width: fileData.width,
        height: fileData.height,
        isApng: !!fileData.isApng,
        assetOffset: fileData.assetOffset ? { ...fileData.assetOffset } : null,
        dataUrl: fileData.dataUrl
      });
    }

    const payload = {
      mode: state.mode,
      master: JSON.parse(JSON.stringify(state.master)),
      curves: JSON.parse(JSON.stringify(state.curves)),
      roomCamera: { x: state.roomCamera.x, y: state.roomCamera.y, zoom: state.roomCamera.zoom, showGrid: state.roomCamera.showGrid },
      selectedFileName: state.selectedFileName,
      ccfoliaData: state.ccfoliaData ? JSON.parse(JSON.stringify(state.ccfoliaData)) : null,
      psdData: state.psdData ? { width: state.psdData.width, height: state.psdData.height } : null,
      files: filesArray,
      timestamp: Date.now()
    };

    const jsonStr = JSON.stringify(payload);
    if (jsonStr.length < 4800000) {
      localStorage.setItem('color_studio_session_backup', jsonStr);
    }
  } catch (e) { }
}

let saveDebounceTimer = null;
function scheduleAutoSaveSession() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    try {
      if (state.filesMap.size === 0) return;

      const filesArray = [];
      for (const [filename, fileData] of state.filesMap.entries()) {
        let dataUrl = fileData.dataUrl;
        if (!dataUrl && fileData.blob) {
          dataUrl = await blobToDataURL(fileData.blob);
          fileData.dataUrl = dataUrl;
        }

        filesArray.push({
          name: filename,
          layerName: fileData.layerName || null,
          left: fileData.left !== undefined ? fileData.left : 0,
          top: fileData.top !== undefined ? fileData.top : 0,
          visible: fileData.visible !== false,
          solo: !!fileData.solo,
          width: fileData.width,
          height: fileData.height,
          isApng: !!fileData.isApng,
          assetOffset: fileData.assetOffset ? { ...fileData.assetOffset } : null,
          dataUrl: dataUrl
        });
      }

      const payload = {
        mode: state.mode,
        master: JSON.parse(JSON.stringify(state.master)),
        curves: JSON.parse(JSON.stringify(state.curves)),
        roomCamera: { x: state.roomCamera.x, y: state.roomCamera.y, zoom: state.roomCamera.zoom, showGrid: state.roomCamera.showGrid },
        selectedFileName: state.selectedFileName,
        ccfoliaData: state.ccfoliaData ? JSON.parse(JSON.stringify(state.ccfoliaData)) : null,
        psdData: state.psdData ? { width: state.psdData.width, height: state.psdData.height } : null,
        files: filesArray,
        timestamp: Date.now()
      };

      // Save to IndexedDB (Unlimited size)
      const db = await openAutoSaveDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(payload, 'currentSession');

      // Backup to localStorage (Instant synchronous write)
      try {
        const jsonStr = JSON.stringify(payload);
        if (jsonStr.length < 4800000) {
          localStorage.setItem('color_studio_session_backup', jsonStr);
        }
      } catch (lsErr) { }

      showAutoSaveToast(T('toast.autosaved'));
    } catch (e) {
      console.error('AutoSave failed:', e);
    }
  }, 400);
}

async function restoreAutoSavedSession() {
  try {
    let payload = null;

    // 1. Try IndexedDB first
    try {
      const db = await openAutoSaveDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get('currentSession');

      payload = await new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
    } catch (idbErr) { }

    // 2. Fallback to localStorage backup if IndexedDB was empty
    if (!payload || !payload.files || payload.files.length === 0) {
      const lsData = localStorage.getItem('color_studio_session_backup');
      if (lsData) {
        try { payload = JSON.parse(lsData); } catch (pErr) { }
      }
    }

    if (!payload || !payload.files || payload.files.length === 0) return false;

    showModal(T('modal.restoring'), T('modal.restoringSub', payload.files.length));

    state.mode = payload.mode || 'image';
    if (payload.master) state.master = payload.master;
    if (payload.curves) state.curves = payload.curves;
    if (payload.roomCamera) state.roomCamera = { ...state.roomCamera, ...payload.roomCamera };
    state.ccfoliaData = payload.ccfoliaData;
    state.psdData = payload.psdData;
    state.selectedFileName = payload.selectedFileName;

    state.filesMap.clear();

    let count = 0;
    for (const f of payload.files) {
      count++;
      updateModalProgress(T('progress.restoring', count, payload.files.length), f.name);

      let blob = null;
      if (f.dataUrl) {
        try { blob = dataURLToBlob(f.dataUrl); } catch (e) { }
      } else if (f.blob && f.blob instanceof Blob) {
        blob = f.blob;
      }

      if (!blob) continue;

      try {
        const imageElement = await loadImageElement(blob);
        const thumbElement = await createDownscaledThumb(imageElement, 240);
        const arrayBuffer = await blob.arrayBuffer();
        const apngData = await parseAPNGIfPossible(arrayBuffer);

        state.filesMap.set(f.name, {
          name: f.name,
          layerName: f.layerName,
          left: f.left,
          top: f.top,
          visible: f.visible !== false,
          solo: !!f.solo,
          blob: blob,
          dataUrl: f.dataUrl,
          arrayBuffer: arrayBuffer,
          imageElement: imageElement,
          thumbElement: thumbElement,
          isApng: !!apngData,
          apngData: apngData,
          width: f.width || imageElement.width,
          height: f.height || imageElement.height,
          assetOffset: f.assetOffset || null
        });
      } catch (itemErr) {
        console.warn('Failed to restore item:', f.name, itemErr);
      }
    }

    // Bi-directional slider & number sync for restored values
    document.getElementById('sliderHue').value = state.master.hue || 0;
    document.getElementById('numHue').value = state.master.hue || 0;
    document.getElementById('sliderSat').value = state.master.saturation !== undefined ? state.master.saturation : 100;
    document.getElementById('numSat').value = state.master.saturation !== undefined ? state.master.saturation : 100;
    document.getElementById('sliderBri').value = state.master.brightness || 0;
    document.getElementById('numBri').value = state.master.brightness || 0;
    document.getElementById('sliderCon').value = state.master.contrast || 0;
    document.getElementById('numCon').value = state.master.contrast || 0;
    document.getElementById('sliderExp').value = state.master.exposure || 0;
    document.getElementById('numExp').value = state.master.exposure || 0;
    document.getElementById('toggleGrad').checked = !!state.master.gradEnabled;
    document.getElementById('sliderGradOp').value = state.master.gradOpacity !== undefined ? state.master.gradOpacity : 100;
    document.getElementById('valGradOp').textContent = (state.master.gradOpacity !== undefined ? state.master.gradOpacity : 100) + '%';
    document.getElementById('selectGradBlend').value = state.master.blendMode || 'overlay';

    renderPhotoshopGradientUI();
    setModeBadge(state.mode, state.mode === 'psd' ? 'mode.psd' : state.mode === 'ccfolia' ? 'mode.ccfolia' : 'mode.image');
    setActiveTab(state.mode === 'image' ? 'grid' : 'room');
    updateUIState();
    scheduleRefreshPreviews();
    hideModal();

    showAutoSaveToast(T('toast.restored'));
    return true;
  } catch (e) {
    console.error('Restore AutoSave failed:', e);
    hideModal();
    return false;
  } finally {
    hideModal();
  }
}

async function clearAutoSaveSession() {
  if (confirm(T('confirm.clearSession'))) {
    try {
      const db = await openAutoSaveDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete('currentSession');
    } catch (e) { }

    try { localStorage.removeItem('color_studio_session_backup'); } catch (e) { }

    state.filesMap.clear();
    state.mode = 'image';
    state.originalZip = null;
    state.originalFileName = null;
    state.ccfoliaData = null;
    state.psdData = null;
    state.selectedFileName = null;

    updateUIState();
    scheduleRefreshPreviews();
    showAutoSaveToast(T('toast.sessionCleared'));
  }
}

function updateSelectedAssetPreview(filename) {
  if (!filename) return;
  const fileData = state.filesMap.get(filename);
  if (!fileData) return;

  const prevCanvas = document.getElementById('assetPreviewCanvas');
  if (prevCanvas && fileData.thumbElement) {
    if (prevCanvas.width !== fileData.thumbElement.width) prevCanvas.width = fileData.thumbElement.width;
    if (prevCanvas.height !== fileData.thumbElement.height) prevCanvas.height = fileData.thumbElement.height;
    const ctx = prevCanvas.getContext('2d');
    const recCvs = createRecoloredCanvas(fileData, false);
    ctx.clearRect(0, 0, prevCanvas.width, prevCanvas.height);
    ctx.drawImage(recCvs, 0, 0);
  }
}

function scheduleRefreshPreviews() {
  if (isRefreshScheduled) return;
  isRefreshScheduled = true;
  invalidateRecolorCache();
  requestAnimationFrame(() => {
    isRefreshScheduled = false;
    updateChannelLUTs();
    updateGradientLUT();
    drawCurveCanvas();

    if (state.activeTab === 'grid' || state.mode === 'image') {
      renderGridView();
    }
    if (state.mode === 'psd' || state.mode === 'ccfolia') {
      renderPsdLayerPanel();
    }
    if (state.activeTab === 'room' && (state.mode === 'ccfolia' || state.mode === 'psd')) {
      renderRoomView();
    }
    if (state.selectedFileName) {
      updateSelectedAssetPreview(state.selectedFileName);
      if (document.getElementById('singleInspectorModal').classList.contains('show')) {
        renderInspectorCanvas();
      }
    }
    scheduleAutoSaveSession();
  });
}

/* ==========================================================================
   12. Event Listeners & Bi-directional Number/Slider Sync
   ========================================================================== */

function setupEventListeners() {
  const bindSliderAndNumInput = (sliderId, numId, key, minVal, maxVal, isAsset = false) => {
    const slider = document.getElementById(sliderId);
    const numInput = document.getElementById(numId);

    const updateVal = (val) => {
      val = Math.min(maxVal, Math.max(minVal, val));
      if (isAsset) {
        if (!state.selectedFileName) return;
        const fileData = state.filesMap.get(state.selectedFileName);
        if (!fileData) return;
        if (!fileData.assetOffset) fileData.assetOffset = { hue: 0, sat: 0, bri: 0, con: 0 };
        fileData.assetOffset[key] = val;
      } else {
        state.master[key] = val;
      }
      slider.value = val;
      numInput.value = val;
      scheduleRefreshPreviews();
    };

    slider.oninput = (e) => updateVal(parseInt(e.target.value) || 0);

    const handleNumChange = (e) => {
      let val = parseInt(e.target.value);
      if (isNaN(val)) val = 0;
      updateVal(val);
    };

    numInput.oninput = handleNumChange;
    numInput.onchange = handleNumChange;
  };

  bindSliderAndNumInput('sliderHue', 'numHue', 'hue', -180, 180);
  bindSliderAndNumInput('sliderSat', 'numSat', 'saturation', 0, 200);
  bindSliderAndNumInput('sliderBri', 'numBri', 'brightness', -100, 100);
  bindSliderAndNumInput('sliderCon', 'numCon', 'contrast', -100, 100);
  bindSliderAndNumInput('sliderExp', 'numExp', 'exposure', -100, 100);

  bindSliderAndNumInput('sliderAssetHue', 'numAssetHue', 'hue', -180, 180, true);
  bindSliderAndNumInput('sliderAssetSat', 'numAssetSat', 'sat', -100, 100, true);
  bindSliderAndNumInput('sliderAssetBri', 'numAssetBri', 'bri', -100, 100, true);
  bindSliderAndNumInput('sliderAssetCon', 'numAssetCon', 'con', -100, 100, true);
  bindSliderAndNumInput('sliderAssetExp', 'numAssetExp', 'exp', -100, 100, true);

  const chkAssetGrad = document.getElementById('chkAssetGrad');
  if (chkAssetGrad) {
    chkAssetGrad.onchange = (e) => {
      if (!state.selectedFileName) return;
      const fd = state.filesMap.get(state.selectedFileName);
      if (!fd) return;
      if (!fd.assetOffset) fd.assetOffset = { hue: 0, sat: 0, bri: 0, con: 0, exp: 0 };
      fd.assetOffset.gradEnabled = e.target.checked;
      if (!fd.assetOffset.gradStops) {
        fd.assetOffset.gradStops = [{ pos: 0, color: '#0f172a' }, { pos: 100, color: '#f8fafc' }];
      }
      scheduleRefreshPreviews();
    };
  }

  window.applyAssetGradPreset = function (presetKey) {
    if (!state.selectedFileName) return;
    const fd = state.filesMap.get(state.selectedFileName);
    if (!fd) return;
    if (!fd.assetOffset) fd.assetOffset = { hue: 0, sat: 0, bri: 0, con: 0, exp: 0 };
    fd.assetOffset.gradEnabled = true;
    if (chkAssetGrad) chkAssetGrad.checked = true;

    switch (presetKey) {
      case 'bw': fd.assetOffset.gradStops = [{ pos: 0, color: '#000000' }, { pos: 100, color: '#ffffff' }]; break;
      case 'sepia': fd.assetOffset.gradStops = [{ pos: 0, color: '#1a0f00' }, { pos: 50, color: '#704214' }, { pos: 100, color: '#ffebcd' }]; break;
      case 'cyber': fd.assetOffset.gradStops = [{ pos: 0, color: '#0f172a' }, { pos: 50, color: '#ec4899' }, { pos: 100, color: '#06b6d4' }]; break;
      case 'sunset': fd.assetOffset.gradStops = [{ pos: 0, color: '#1e1b4b' }, { pos: 40, color: '#be123c' }, { pos: 75, color: '#f97316' }, { pos: 100, color: '#fef08a' }]; break;
      case 'duotone': fd.assetOffset.gradStops = [{ pos: 0, color: '#311b92' }, { pos: 100, color: '#00e676' }]; break;
    }
    scheduleRefreshPreviews();
  };

  const selectAssetCurvePreset = document.getElementById('selectAssetCurvePreset');
  if (selectAssetCurvePreset) {
    selectAssetCurvePreset.onchange = (e) => {
      if (!state.selectedFileName) return;
      const fd = state.filesMap.get(state.selectedFileName);
      if (!fd) return;
      if (!fd.assetOffset) fd.assetOffset = { hue: 0, sat: 0, bri: 0, con: 0, exp: 0 };
      fd.assetOffset.curvePreset = e.target.value;
      scheduleRefreshPreviews();
    };
  }

  document.getElementById('toggleGrad').onchange = (e) => {
    state.master.gradEnabled = e.target.checked;
    scheduleRefreshPreviews();
  };
  document.getElementById('sliderGradOp').oninput = (e) => {
    state.master.gradOpacity = parseInt(e.target.value);
    document.getElementById('valGradOp').textContent = e.target.value + '%';
    scheduleRefreshPreviews();
  };
  document.getElementById('selectGradBlend').onchange = (e) => {
    state.master.blendMode = e.target.value;
    scheduleRefreshPreviews();
  };

  document.getElementById('btnResetMaster').onclick = () => {
    state.master = {
      hue: 0, saturation: 100, brightness: 0, contrast: 0, exposure: 0,
      gradEnabled: false, gradOpacity: 100, blendMode: 'overlay',
      gradStops: [{ pos: 0, color: '#0f172a' }, { pos: 50, color: '#64748b' }, { pos: 100, color: '#f8fafc' }],
      activeStopIndex: 0
    };
    state.curves = {
      all: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      b: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
    };
    document.getElementById('sliderHue').value = 0; document.getElementById('numHue').value = 0;
    document.getElementById('sliderSat').value = 100; document.getElementById('numSat').value = 100;
    document.getElementById('sliderBri').value = 0; document.getElementById('numBri').value = 0;
    document.getElementById('sliderCon').value = 0; document.getElementById('numCon').value = 0;
    document.getElementById('sliderExp').value = 0; document.getElementById('numExp').value = 0;
    document.getElementById('toggleGrad').checked = false;
    renderPhotoshopGradientUI();
    scheduleRefreshPreviews();
  };

  const resetAssetHandler = () => {
    if (!state.selectedFileName) return;
    const fileData = state.filesMap.get(state.selectedFileName);
    if (fileData) fileData.assetOffset = null;
    selectAsset(state.selectedFileName);
    scheduleRefreshPreviews();
  };
  document.getElementById('btnResetAsset').onclick = resetAssetHandler;
  document.getElementById('btnResetAssetSingle').onclick = resetAssetHandler;

  document.getElementById('btnOpenSingleInspector').onclick = () => {
    if (state.selectedFileName) openSingleInspectorModal(state.selectedFileName);
  };
  document.getElementById('sidePreviewClickArea').onclick = () => {
    if (state.selectedFileName) openSingleInspectorModal(state.selectedFileName);
  };
  document.getElementById('btnInspectorClose').onclick = closeSingleInspectorModal;
  document.getElementById('btnInspectorBack').onclick = closeSingleInspectorModal;
  document.getElementById('btnInspectorPrev').onclick = () => navigateInspector(-1);
  document.getElementById('btnInspectorNext').onclick = () => navigateInspector(1);

  const btnCompare = document.getElementById('btnInspectorCompareHold');
  btnCompare.onmousedown = () => { state.inspectorShowingOriginal = true; renderInspectorCanvas(); };
  btnCompare.onmouseup = () => { state.inspectorShowingOriginal = false; renderInspectorCanvas(); };
  btnCompare.onmouseleave = () => { state.inspectorShowingOriginal = false; renderInspectorCanvas(); };

  document.getElementById('btnTestApngCompress').onclick = runApngCompressionTest;
  document.getElementById('btnApngPlayPause').onclick = toggleApngPlayback;
  document.getElementById('btnApngPrevFrame').onclick = () => {
    if (!apngPlayer.fileData || !apngPlayer.fileData.apngData) return;
    apngPlayer.isPlaying = false;
    const btnPlay = document.getElementById('btnApngPlayPause');
    if (btnPlay) btnPlay.textContent = T('apng.play');
    const total = apngPlayer.fileData.apngData.frames.length;
    apngPlayer.currentFrame = (apngPlayer.currentFrame - 1 + total) % total;
    renderApngSingleFrame(apngPlayer.fileData, apngPlayer.currentFrame);
  };
  document.getElementById('btnApngNextFrame').onclick = () => {
    if (!apngPlayer.fileData || !apngPlayer.fileData.apngData) return;
    apngPlayer.isPlaying = false;
    const btnPlay = document.getElementById('btnApngPlayPause');
    if (btnPlay) btnPlay.textContent = T('apng.play');
    const total = apngPlayer.fileData.apngData.frames.length;
    apngPlayer.currentFrame = (apngPlayer.currentFrame + 1) % total;
    renderApngSingleFrame(apngPlayer.fileData, apngPlayer.currentFrame);
  };
  document.getElementById('sliderApngFrame').oninput = (e) => {
    if (!apngPlayer.fileData || !apngPlayer.fileData.apngData) return;
    apngPlayer.isPlaying = false;
    const btnPlay = document.getElementById('btnApngPlayPause');
    if (btnPlay) btnPlay.textContent = T('apng.play');
    apngPlayer.currentFrame = parseInt(e.target.value) || 0;
    renderApngSingleFrame(apngPlayer.fileData, apngPlayer.currentFrame);
  };
  document.getElementById('selectApngSpeed').onchange = (e) => {
    apngPlayer.speed = parseFloat(e.target.value) || 1.0;
  };

  document.getElementById('btnInspectorDownload').onclick = async () => {
    if (!state.selectedFileName) return;
    const fileData = state.filesMap.get(state.selectedFileName);
    if (!fileData) return;

    const useCompress = document.getElementById('chkCcfoliaCompress')?.checked || false;
    const targetMB = parseFloat(document.getElementById('selectApngTargetMb')?.value || '4.8');
    const allowSkip = document.getElementById('chkApngFrameSkip')?.checked !== false;
    const compressStatic = document.getElementById('chkCompressStaticPng')?.checked || false;

    showModal(T('modal.processingImage'), fileData.name);
    let blob;
    if (fileData.isApng && useCompress) {
      updateCompressStatus('status.apngProcessing', fileData.name);
      const res = await compressApngToTargetMB(fileData, targetMB, { allowFrameSkip: allowSkip });
      blob = new Blob([res.buffer], { type: 'image/png' });
      updateCompressStatus('status.compressDone', Math.round(res.scale * 100), (res.compressedSize / (1024 * 1024)).toFixed(2));
    } else if (fileData.isApng) {
      blob = await processAPNGRecolor(fileData);
    } else if (useCompress && compressStatic) {
      const res = await compressApngToTargetMB(fileData, targetMB, { allowFrameSkip: false });
      blob = new Blob([res.buffer], { type: 'image/png' });
    } else {
      const cvs = createRecoloredCanvas(fileData, true);
      blob = await new Promise(res => cvs.toBlob(res, 'image/png'));
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (fileData.layerName || fileData.name).split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    hideModal();
  };

  const rCanvasWrapper = document.getElementById('roomCanvasWrapper');
  rCanvasWrapper.onclick = (e) => {
    const roomCanvas = document.getElementById('roomCanvas');
    const rect = roomCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cam = state.roomCamera;

    // PSD Mode Canvas Click Selection (top-most visible layer first)
    if (state.mode === 'psd' && state.psdData) {
      const psdW = state.psdData.width;
      const psdH = state.psdData.height;
      const cx = roomCanvas.width / 2 + cam.x;
      const cy = roomCanvas.height / 2 + cam.y;

      const keys = Array.from(state.filesMap.keys());
      // Reverse search top to bottom
      for (let i = keys.length - 1; i >= 0; i--) {
        const fn = keys[i];
        const fileData = state.filesMap.get(fn);
        if (!isLayerEffectiveVisible(fileData)) continue; // Skip non-effective visible layers

        const lx = cx + (-psdW / 2 + (fileData.left || 0)) * cam.zoom;
        const ly = cy + (-psdH / 2 + (fileData.top || 0)) * cam.zoom;
        const lw = fileData.width * cam.zoom;
        const lh = fileData.height * cam.zoom;

        if (mouseX >= lx && mouseX <= lx + lw && mouseY >= ly && mouseY <= ly + lh) {
          selectAsset(fn);
          scheduleRefreshPreviews();
          return;
        }
      }
      return;
    }

    // Ccfolia Room Canvas Click Selection
    if (!state.ccfoliaData) return;
    const roomItems = getCcfoliaItems(state.ccfoliaData);
    if (roomItems.length === 0) return;

    const gridUnit = 50 * cam.zoom;
    const roomCx = roomCanvas.width / 2 + cam.x;
    const roomCy = roomCanvas.height / 2 + cam.y;

    roomItems.sort((a, b) => (b.z !== a.z ? b.z - a.z : (b.order || 0) - (a.order || 0)));
    for (let i = 0; i < roomItems.length; i++) {
      const item = roomItems[i];
      const itemCx = roomCx + (item.x + item.width / 2) * gridUnit;
      const itemCy = roomCy + (item.y + item.height / 2) * gridUnit;
      const pw = item.width * gridUnit;
      const ph = item.height * gridUnit;

      if (mouseX >= itemCx - pw / 2 && mouseX <= itemCx + pw / 2 && mouseY >= itemCy - ph / 2 && mouseY <= itemCy + ph / 2) {
        const findFn = window.findFileData || ((id) => {
          const cleanId = (id || '').split('?')[0].split('#')[0].split('/').pop().split('\\').pop().toLowerCase();
          for (const [fn, fd] of state.filesMap.entries()) {
            const cleanFn = fn.split('/').pop().split('\\').pop().toLowerCase();
            if (cleanFn.includes(cleanId) || cleanId.includes(cleanFn)) return fd;
          }
          return null;
        });
        const fileData = findFn(item.imageIdentifier);
        if (fileData) {
          openSingleInspectorModal(fileData.name);
          return;
        }
      }
    }
  };

  document.getElementById('tabRoomView').onclick = () => setActiveTab('room');
  document.getElementById('tabGridView').onclick = () => setActiveTab('grid');
  document.getElementById('btnExportZip').onclick = exportProcessedZip;
  document.getElementById('fileInputImages').onchange = (e) => { handleFileEntries(e.target.files); e.target.value = ''; };
  document.getElementById('fileInputFolder').onchange = (e) => { handleFileEntries(e.target.files); e.target.value = ''; };

  const dropzone = document.getElementById('dropzoneHeader');
  const emptyDropzone = document.getElementById('emptyStateDropzone');
  const centerDropOverlay = document.getElementById('centerAreaDropOverlay');

  if (emptyDropzone) {
    emptyDropzone.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
        document.getElementById('fileInputImages').click();
      }
    };
  }

  if (dropzone) {
    dropzone.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
        document.getElementById('fileInputImages').click();
      }
    };
    window.ondragover = (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
      if (emptyDropzone) emptyDropzone.classList.add('dragover');
      if (centerDropOverlay) centerDropOverlay.classList.add('show');
    };
    window.ondragleave = (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (emptyDropzone) emptyDropzone.classList.remove('dragover');
      if (centerDropOverlay) centerDropOverlay.classList.remove('show');
    };
    window.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (emptyDropzone) emptyDropzone.classList.remove('dragover');
      if (centerDropOverlay) centerDropOverlay.classList.remove('show');
      if (e.dataTransfer.files.length > 0) handleFileEntries(e.dataTransfer.files);
    };
  }

  rCanvasWrapper.onmousedown = (e) => {
    state.roomCamera.isDragging = true;
    state.roomCamera.lastMouseX = e.clientX;
    state.roomCamera.lastMouseY = e.clientY;
  };
  window.onmousemove = (e) => {
    if (state.roomCamera.isDragging) {
      state.roomCamera.x += e.clientX - state.roomCamera.lastMouseX;
      state.roomCamera.y += e.clientY - state.roomCamera.lastMouseY;
      state.roomCamera.lastMouseX = e.clientX;
      state.roomCamera.lastMouseY = e.clientY;
      renderRoomView();
    }
  };
  window.onmouseup = () => { state.roomCamera.isDragging = false; };
  rCanvasWrapper.onwheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 0.85;
    state.roomCamera.zoom = Math.min(10, Math.max(0.01, state.roomCamera.zoom * delta));
    renderRoomView();
  };

  const floatPanel = document.getElementById('psdFloatingLayerPanel');
  if (floatPanel) {
    floatPanel.onwheel = (e) => { e.stopPropagation(); };
    floatPanel.onmousedown = (e) => { e.stopPropagation(); };
    floatPanel.onclick = (e) => { e.stopPropagation(); };
  }

  document.getElementById('btnRoomZoomIn').onclick = () => { state.roomCamera.zoom = Math.min(10, state.roomCamera.zoom * 1.2); renderRoomView(); };
  document.getElementById('btnRoomZoomOut').onclick = () => { state.roomCamera.zoom = Math.max(0.01, state.roomCamera.zoom / 1.2); renderRoomView(); };
  document.getElementById('btnRoomResetView').onclick = () => { state.roomCamera.x = 0; state.roomCamera.y = 0; state.roomCamera.zoom = 1; renderRoomView(); };
  document.getElementById('toggleRoomGrid').onchange = (e) => { state.roomCamera.showGrid = e.target.checked; renderRoomView(); };

  document.getElementById('inputGridSearch').oninput = renderGridView;
  document.getElementById('btnClearSession').onclick = clearAutoSaveSession;

  // Custom Presets
  document.getElementById('btnSaveCustomPreset').onclick = () => {
    addCustomPreset(document.getElementById('inputCustomPresetName').value);
  };
  document.getElementById('inputCustomPresetName').onkeydown = (e) => {
    if (e.key === 'Enter') addCustomPreset(e.target.value);
  };

  // Canvas Resizing & Fit Margin (Right Panel)
  document.getElementById('btnApplyCanvasSize').onclick = () => {
    if (!state.selectedFileName) return;
    const fileData = state.filesMap.get(state.selectedFileName);
    const w = parseInt(document.getElementById('numCanvasWidth').value);
    const h = parseInt(document.getElementById('numCanvasHeight').value);
    if (fileData && w > 0 && h > 0) resizeAssetCanvas(fileData, w, h);
  };
  document.getElementById('btnFitMargin').onclick = () => {
    if (!state.selectedFileName) return;
    const fileData = state.filesMap.get(state.selectedFileName);
    if (fileData) fitMarginForAsset(fileData);
  };

  // Canvas Resizing & Fit Margin (Inspector Modal)
  document.getElementById('btnInspectorApplyCanvasSize').onclick = () => {
    if (!state.selectedFileName) return;
    const fileData = state.filesMap.get(state.selectedFileName);
    const w = parseInt(document.getElementById('numInspectorCanvasWidth').value);
    const h = parseInt(document.getElementById('numInspectorCanvasHeight').value);
    if (fileData && w > 0 && h > 0) resizeAssetCanvas(fileData, w, h);
  };
  document.getElementById('btnInspectorFitMargin').onclick = () => {
    if (!state.selectedFileName) return;
    const fileData = state.filesMap.get(state.selectedFileName);
    if (fileData) fitMarginForAsset(fileData);
  };

  // Batch Fit Margin (Toolbar)
  document.getElementById('btnFitMarginBatch').onclick = fitMarginForAllAssets;

  const selGlobalLoop = document.getElementById('selectGlobalApngLoop');
  if (selGlobalLoop) {
    selGlobalLoop.onchange = (e) => {
      const val = e.target.value;
      const numInput = document.getElementById('numGlobalApngLoopCount');
      if (numInput) numInput.style.display = (val === 'custom') ? 'inline-block' : 'none';
      if (typeof scheduleAutoSaveSession === 'function') scheduleAutoSaveSession();
    };
  }
  const numGlobalLoop = document.getElementById('numGlobalApngLoopCount');
  if (numGlobalLoop) {
    numGlobalLoop.oninput = () => {
      if (typeof scheduleAutoSaveSession === 'function') scheduleAutoSaveSession();
    };
  }
  const selAssetLoop = document.getElementById('selectAssetApngLoop');
  if (selAssetLoop) {
    selAssetLoop.onchange = (e) => {
      if (!state.selectedFileName) return;
      const fileData = state.filesMap.get(state.selectedFileName);
      if (!fileData) return;
      fileData.customLoopMode = e.target.value;
      const numInput = document.getElementById('numAssetApngLoopCount');
      if (numInput) numInput.style.display = (e.target.value === 'custom') ? 'inline-block' : 'none';
      if (typeof scheduleAutoSaveSession === 'function') scheduleAutoSaveSession();
    };
  }
  const numAssetLoop = document.getElementById('numAssetApngLoopCount');
  if (numAssetLoop) {
    numAssetLoop.oninput = (e) => {
      if (!state.selectedFileName) return;
      const fileData = state.filesMap.get(state.selectedFileName);
      if (!fileData) return;
      fileData.customLoopCount = Math.max(1, parseInt(e.target.value) || 1);
      if (typeof scheduleAutoSaveSession === 'function') scheduleAutoSaveSession();
    };
  }

  window.addEventListener('beforeunload', () => {
    if (state.filesMap.size > 0) {
      try {
        const filesArray = [];
        for (const [filename, fileData] of state.filesMap.entries()) {
          filesArray.push({
            name: filename,
            layerName: fileData.layerName || null,
            left: fileData.left !== undefined ? fileData.left : 0,
            top: fileData.top !== undefined ? fileData.top : 0,
            visible: fileData.visible !== false,
            solo: !!fileData.solo,
            width: fileData.width,
            height: fileData.height,
            isApng: !!fileData.isApng,
            origNumPlays: fileData.origNumPlays !== undefined ? fileData.origNumPlays : 0,
            customLoopMode: fileData.customLoopMode || 'global',
            customLoopCount: fileData.customLoopCount || 1,
            assetOffset: fileData.assetOffset ? { ...fileData.assetOffset } : null,
            dataUrl: fileData.dataUrl || null
          });
        }
        const payload = {
          mode: state.mode,
          master: JSON.parse(JSON.stringify(state.master)),
          curves: JSON.parse(JSON.stringify(state.curves)),
          roomCamera: { x: state.roomCamera.x, y: state.roomCamera.y, zoom: state.roomCamera.zoom, showGrid: state.roomCamera.showGrid },
          selectedFileName: state.selectedFileName,
          ccfoliaData: state.ccfoliaData ? JSON.parse(JSON.stringify(state.ccfoliaData)) : null,
          psdData: state.psdData ? { width: state.psdData.width, height: state.psdData.height } : null,
          files: filesArray,
          timestamp: Date.now()
        };
        const jsonStr = JSON.stringify(payload);
        if (jsonStr.length < 4800000) {
          localStorage.setItem('color_studio_session_backup', jsonStr);
        }
      } catch (e) { }
    }
  });
}

/* ==========================================================================
   13. Curve Canvas Interactive Widget
   ========================================================================== */

function setupCurveCanvasWidget() {
  const canvas = document.getElementById('curveCanvas');
  const ctx = canvas.getContext('2d');
  let draggingPointIndex = -1;

  const getPoints = () => state.curves[state.activeCurveChannel];

  window.drawCurveCanvas = function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(17,17,17,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo((canvas.width / 4) * i, 0); ctx.lineTo((canvas.width / 4) * i, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (canvas.height / 4) * i); ctx.lineTo(canvas.width, (canvas.height / 4) * i); ctx.stroke();
    }

    const pts = getPoints();
    const lut = buildCurveLUT(pts);

    ctx.strokeStyle = state.activeCurveChannel === 'r' ? '#ef4444' : state.activeCurveChannel === 'g' ? '#10b981' : state.activeCurveChannel === 'b' ? '#3b82f6' : '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
      const normX = Math.round((x / canvas.width) * 255);
      const normY = lut[normX];
      const cvsY = canvas.height - (normY / 255) * canvas.height;
      if (x === 0) ctx.moveTo(x, cvsY);
      else ctx.lineTo(x, cvsY);
    }
    ctx.stroke();

    for (let i = 0; i < pts.length; i++) {
      const cx = (pts[i].x / 255) * canvas.width;
      const cy = canvas.height - (pts[i].y / 255) * canvas.height;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  };

  canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const pts = getPoints();

    for (let i = 0; i < pts.length; i++) {
      const cx = (pts[i].x / 255) * canvas.width;
      const cy = canvas.height - (pts[i].y / 255) * canvas.height;
      if (Math.hypot(mouseX - cx, mouseY - cy) < 10) {
        draggingPointIndex = i;
        return;
      }
    }

    const normX = Math.min(255, Math.max(0, Math.round((mouseX / canvas.width) * 255)));
    const normY = Math.min(255, Math.max(0, Math.round(((canvas.height - mouseY) / canvas.height) * 255)));
    pts.push({ x: normX, y: normY });
    pts.sort((a, b) => a.x - b.x);
    drawCurveCanvas();
    scheduleRefreshPreviews();
  };

  canvas.onmousemove = (e) => {
    if (draggingPointIndex === -1) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const pts = getPoints();
    const pt = pts[draggingPointIndex];

    if (draggingPointIndex > 0 && draggingPointIndex < pts.length - 1) {
      pt.x = Math.min(255, Math.max(0, Math.round((mouseX / canvas.width) * 255)));
    }
    pt.y = Math.min(255, Math.max(0, Math.round(((canvas.height - mouseY) / canvas.height) * 255)));

    drawCurveCanvas();
    scheduleRefreshPreviews();
  };

  window.addEventListener('mouseup', () => { draggingPointIndex = -1; });

  document.getElementById('presetLinear').onclick = () => {
    state.curves[state.activeCurveChannel] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
    drawCurveCanvas(); scheduleRefreshPreviews();
  };
  document.getElementById('presetContrast').onclick = () => {
    state.curves[state.activeCurveChannel] = [{ x: 0, y: 0 }, { x: 64, y: 30 }, { x: 192, y: 225 }, { x: 255, y: 255 }];
    drawCurveCanvas(); scheduleRefreshPreviews();
  };
  document.getElementById('presetDarken').onclick = () => {
    state.curves[state.activeCurveChannel] = [{ x: 0, y: 0 }, { x: 128, y: 70 }, { x: 255, y: 255 }];
    drawCurveCanvas(); scheduleRefreshPreviews();
  };
  document.getElementById('presetBrighten').onclick = () => {
    state.curves[state.activeCurveChannel] = [{ x: 0, y: 0 }, { x: 128, y: 180 }, { x: 255, y: 255 }];
    drawCurveCanvas(); scheduleRefreshPreviews();
  };

  document.getElementById('selectCurveChannel').onchange = (e) => {
    state.activeCurveChannel = e.target.value;
    drawCurveCanvas();
  };

  drawCurveCanvas();
}



/* ==========================================================================
   14. Asset Photoshop Gradient & Curve Canvas Interactive Widgets
   ========================================================================== */

function setupAssetGradientWidget() {
  const ramp = document.getElementById('assetPsGradientRamp');
  const stopsBar = document.getElementById('assetPsStopsBar');
  const rampContainer = document.getElementById('assetPsGradientRampContainer');

  window.renderAssetGradientUI = function () {
    if (!state.selectedFileName) return;
    const fileData = state.filesMap.get(state.selectedFileName);
    if (!fileData) return;
    const offset = getAssetOffset(fileData);

    const stops = [...offset.gradStops].sort((a, b) => a.pos - b.pos);
    const cssStops = stops.map(s => `${s.color} ${s.pos}%`).join(', ');
    if (ramp) ramp.style.background = `linear-gradient(to right, ${cssStops})`;

    if (!stopsBar) return;
    stopsBar.innerHTML = '';
    stops.forEach((stop, idx) => {
      const handle = document.createElement('div');
      handle.className = 'ps-stop-handle' + (offset.activeStopIndex === idx ? ' active' : '');
      handle.style.left = `${stop.pos}%`;

      const colorBox = document.createElement('div');
      colorBox.className = 'color-preview';
      colorBox.style.background = stop.color;
      handle.appendChild(colorBox);

      handle.onclick = (e) => {
        e.stopPropagation();
        offset.activeStopIndex = idx;
        renderAssetGradientUI();
        updateActiveAssetStopControls();
      };

      handle.onmousedown = (e) => {
        e.stopPropagation();
        offset.activeStopIndex = idx;
        renderAssetGradientUI();
        updateActiveAssetStopControls();

        const barRect = stopsBar.getBoundingClientRect();
        const onMouseMove = (moveEvent) => {
          const relX = moveEvent.clientX - barRect.left;
          let newPos = Math.round((relX / barRect.width) * 100);
          newPos = Math.min(100, Math.max(0, newPos));
          stop.pos = newPos;
          renderAssetGradientUI();
          updateActiveAssetStopControls();
          scheduleRefreshPreviews();
        };

        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      };

      stopsBar.appendChild(handle);
    });

    updateActiveAssetStopControls();
  };

  function updateActiveAssetStopControls() {
    if (!state.selectedFileName) return;
    const fileData = state.filesMap.get(state.selectedFileName);
    if (!fileData) return;
    const offset = getAssetOffset(fileData);

    if (offset.activeStopIndex < 0 || offset.activeStopIndex >= offset.gradStops.length) {
      offset.activeStopIndex = 0;
    }

    const activeStop = offset.gradStops[offset.activeStopIndex] || offset.gradStops[0];
    if (!activeStop) return;

    if (document.getElementById('assetPsStopColorPicker')) document.getElementById('assetPsStopColorPicker').value = activeStop.color;
    if (document.getElementById('assetPsStopPosInput')) document.getElementById('assetPsStopPosInput').value = activeStop.pos;
    if (document.getElementById('chkAssetGrad')) document.getElementById('chkAssetGrad').checked = !!offset.gradEnabled;
    if (document.getElementById('sliderAssetGradOp')) document.getElementById('sliderAssetGradOp').value = offset.gradOpacity !== undefined ? offset.gradOpacity : 100;
    if (document.getElementById('valAssetGradOp')) document.getElementById('valAssetGradOp').textContent = (offset.gradOpacity !== undefined ? offset.gradOpacity : 100) + '%';
    if (document.getElementById('selectAssetGradBlend')) document.getElementById('selectAssetGradBlend').value = offset.blendMode || 'overlay';
  }

  if (rampContainer) {
    rampContainer.onclick = (e) => {
      if (!state.selectedFileName) return;
      const fileData = state.filesMap.get(state.selectedFileName);
      if (!fileData) return;
      const offset = getAssetOffset(fileData);

      const rect = rampContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pos = Math.min(100, Math.max(0, Math.round((clickX / rect.width) * 100)));

      offset.gradStops.push({ pos, color: '#888888' });
      offset.activeStopIndex = offset.gradStops.length - 1;
      renderAssetGradientUI();
      scheduleRefreshPreviews();
    };
  }

  if (document.getElementById('assetPsStopColorPicker')) {
    document.getElementById('assetPsStopColorPicker').oninput = (e) => {
      if (!state.selectedFileName) return;
      const fd = state.filesMap.get(state.selectedFileName);
      if (!fd) return;
      const offset = getAssetOffset(fd);
      const activeStop = offset.gradStops[offset.activeStopIndex];
      if (activeStop) {
        activeStop.color = e.target.value;
        renderAssetGradientUI();
        scheduleRefreshPreviews();
      }
    };
  }

  if (document.getElementById('assetPsStopPosInput')) {
    document.getElementById('assetPsStopPosInput').oninput = (e) => {
      if (!state.selectedFileName) return;
      const fd = state.filesMap.get(state.selectedFileName);
      if (!fd) return;
      const offset = getAssetOffset(fd);
      const activeStop = offset.gradStops[offset.activeStopIndex];
      if (activeStop) {
        activeStop.pos = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
        renderAssetGradientUI();
        scheduleRefreshPreviews();
      }
    };
  }

  if (document.getElementById('assetPsBtnDeleteStop')) {
    document.getElementById('assetPsBtnDeleteStop').onclick = () => {
      if (!state.selectedFileName) return;
      const fd = state.filesMap.get(state.selectedFileName);
      if (!fd) return;
      const offset = getAssetOffset(fd);
      if (offset.gradStops.length <= 2) {
        alert(T('alert.gradMinStops'));
        return;
      }
      offset.gradStops.splice(offset.activeStopIndex, 1);
      offset.activeStopIndex = 0;
      renderAssetGradientUI();
      scheduleRefreshPreviews();
    };
  }

  if (document.getElementById('sliderAssetGradOp')) {
    document.getElementById('sliderAssetGradOp').oninput = (e) => {
      if (!state.selectedFileName) return;
      const fd = state.filesMap.get(state.selectedFileName);
      if (!fd) return;
      const offset = getAssetOffset(fd);
      offset.gradOpacity = parseInt(e.target.value);
      if (document.getElementById('valAssetGradOp')) document.getElementById('valAssetGradOp').textContent = e.target.value + '%';
      scheduleRefreshPreviews();
    };
  }

  if (document.getElementById('selectAssetGradBlend')) {
    document.getElementById('selectAssetGradBlend').onchange = (e) => {
      if (!state.selectedFileName) return;
      const fd = state.filesMap.get(state.selectedFileName);
      if (!fd) return;
      const offset = getAssetOffset(fd);
      offset.blendMode = e.target.value;
      scheduleRefreshPreviews();
    };
  }

  window.applyAssetGradientPreset = function (presetKey) {
    if (!state.selectedFileName) return;
    const fd = state.filesMap.get(state.selectedFileName);
    if (!fd) return;
    const offset = getAssetOffset(fd);
    offset.gradEnabled = true;
    if (document.getElementById('chkAssetGrad')) document.getElementById('chkAssetGrad').checked = true;

    switch (presetKey) {
      case 'bw': offset.gradStops = [{ pos: 0, color: '#000000' }, { pos: 100, color: '#ffffff' }]; break;
      case 'sepia': offset.gradStops = [{ pos: 0, color: '#1a0f00' }, { pos: 50, color: '#704214' }, { pos: 100, color: '#ffebcd' }]; break;
      case 'cyber': offset.gradStops = [{ pos: 0, color: '#0f172a' }, { pos: 50, color: '#ec4899' }, { pos: 100, color: '#06b6d4' }]; break;
      case 'sunset': offset.gradStops = [{ pos: 0, color: '#1e1b4b' }, { pos: 40, color: '#be123c' }, { pos: 75, color: '#f97316' }, { pos: 100, color: '#fef08a' }]; break;
      case 'duotone': offset.gradStops = [{ pos: 0, color: '#311b92' }, { pos: 100, color: '#00e676' }]; break;
    }
    offset.activeStopIndex = 0;
    renderAssetGradientUI();
    scheduleRefreshPreviews();
  };

  if (document.getElementById('presetAssetGradBW')) document.getElementById('presetAssetGradBW').onclick = () => applyAssetGradientPreset('bw');
  if (document.getElementById('presetAssetGradSepia')) document.getElementById('presetAssetGradSepia').onclick = () => applyAssetGradientPreset('sepia');
  if (document.getElementById('presetAssetGradCyber')) document.getElementById('presetAssetGradCyber').onclick = () => applyAssetGradientPreset('cyber');
  if (document.getElementById('presetAssetGradSunset')) document.getElementById('presetAssetGradSunset').onclick = () => applyAssetGradientPreset('sunset');
  if (document.getElementById('presetAssetGradDuotone')) document.getElementById('presetAssetGradDuotone').onclick = () => applyAssetGradientPreset('duotone');
}

function setupAssetCurveWidget() {
  const canvas = document.getElementById('assetCurveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let draggingPointIndex = -1;

  const getPoints = () => {
    if (!state.selectedFileName) return [{ x: 0, y: 0 }, { x: 255, y: 255 }];
    const fd = state.filesMap.get(state.selectedFileName);
    if (!fd) return [{ x: 0, y: 0 }, { x: 255, y: 255 }];
    const offset = getAssetOffset(fd);
    const chan = offset.activeCurveChannel || 'all';
    return offset.curves[chan];
  };

  window.drawAssetCurveCanvas = function () {
    if (!canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(17,17,17,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo((canvas.width / 4) * i, 0); ctx.lineTo((canvas.width / 4) * i, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (canvas.height / 4) * i); ctx.lineTo(canvas.width, (canvas.height / 4) * i); ctx.stroke();
    }

    const pts = getPoints();
    const lut = buildCurveLUT(pts);

    let chan = 'all';
    if (state.selectedFileName) {
      const fd = state.filesMap.get(state.selectedFileName);
      if (fd && fd.assetOffset) chan = fd.assetOffset.activeCurveChannel || 'all';
    }

    ctx.strokeStyle = chan === 'r' ? '#ef4444' : chan === 'g' ? '#10b981' : chan === 'b' ? '#3b82f6' : '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
      const normX = Math.round((x / canvas.width) * 255);
      const normY = lut[normX];
      const cvsY = canvas.height - (normY / 255) * canvas.height;
      if (x === 0) ctx.moveTo(x, cvsY);
      else ctx.lineTo(x, cvsY);
    }
    ctx.stroke();

    for (let i = 0; i < pts.length; i++) {
      const cx = (pts[i].x / 255) * canvas.width;
      const cy = canvas.height - (pts[i].y / 255) * canvas.height;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  };

  canvas.onmousedown = (e) => {
    if (!state.selectedFileName) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const pts = getPoints();

    for (let i = 0; i < pts.length; i++) {
      const cx = (pts[i].x / 255) * canvas.width;
      const cy = canvas.height - (pts[i].y / 255) * canvas.height;
      if (Math.hypot(mouseX - cx, mouseY - cy) < 10) {
        draggingPointIndex = i;
        return;
      }
    }

    const normX = Math.min(255, Math.max(0, Math.round((mouseX / canvas.width) * 255)));
    const normY = Math.min(255, Math.max(0, Math.round(((canvas.height - mouseY) / canvas.height) * 255)));
    pts.push({ x: normX, y: normY });
    pts.sort((a, b) => a.x - b.x);
    drawAssetCurveCanvas();
    scheduleRefreshPreviews();
  };

  canvas.onmousemove = (e) => {
    if (draggingPointIndex === -1 || !state.selectedFileName) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const pts = getPoints();
    const pt = pts[draggingPointIndex];

    if (draggingPointIndex > 0 && draggingPointIndex < pts.length - 1) {
      pt.x = Math.min(255, Math.max(0, Math.round((mouseX / canvas.width) * 255)));
    }
    pt.y = Math.min(255, Math.max(0, Math.round(((canvas.height - mouseY) / canvas.height) * 255)));

    drawAssetCurveCanvas();
    scheduleRefreshPreviews();
  };

  window.addEventListener('mouseup', () => { draggingPointIndex = -1; });

  const setCurvePreset = (presetPts) => {
    if (!state.selectedFileName) return;
    const fd = state.filesMap.get(state.selectedFileName);
    if (!fd) return;
    const offset = getAssetOffset(fd);
    const chan = offset.activeCurveChannel || 'all';
    offset.curves[chan] = JSON.parse(JSON.stringify(presetPts));
    drawAssetCurveCanvas();
    scheduleRefreshPreviews();
  };

  if (document.getElementById('presetAssetLinear')) document.getElementById('presetAssetLinear').onclick = () => setCurvePreset([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
  if (document.getElementById('presetAssetContrast')) document.getElementById('presetAssetContrast').onclick = () => setCurvePreset([{ x: 0, y: 0 }, { x: 64, y: 30 }, { x: 192, y: 225 }, { x: 255, y: 255 }]);
  if (document.getElementById('presetAssetDarken')) document.getElementById('presetAssetDarken').onclick = () => setCurvePreset([{ x: 0, y: 0 }, { x: 128, y: 70 }, { x: 255, y: 255 }]);
  if (document.getElementById('presetAssetBrighten')) document.getElementById('presetAssetBrighten').onclick = () => setCurvePreset([{ x: 0, y: 0 }, { x: 128, y: 180 }, { x: 255, y: 255 }]);

  if (document.getElementById('selectAssetCurveChannel')) {
    document.getElementById('selectAssetCurveChannel').onchange = (e) => {
      if (!state.selectedFileName) return;
      const fd = state.filesMap.get(state.selectedFileName);
      if (!fd) return;
      const offset = getAssetOffset(fd);
      offset.activeCurveChannel = e.target.value;
      drawAssetCurveCanvas();
    };
  }
}

/* ==========================================================================
   15. Notice (FAQ/Help) Modal Widget
   ========================================================================== */

function setupNoticeWidget() {
  const btnNoticeOpen = document.getElementById('btnNoticeOpen');
  const btnNoticeClose = document.getElementById('btnNoticeClose');
  const noticeModal = document.getElementById('noticeModal');
  const tabNoticeCaution = document.getElementById('tabNoticeCaution');
  const tabNoticeFeatures = document.getElementById('tabNoticeFeatures');
  const paneNoticeCaution = document.getElementById('paneNoticeCaution');
  const paneNoticeFeatures = document.getElementById('paneNoticeFeatures');

  if (btnNoticeOpen && noticeModal) {
    btnNoticeOpen.onclick = () => {
      noticeModal.classList.add('show');
    };
  }
  if (btnNoticeClose && noticeModal) {
    btnNoticeClose.onclick = () => {
      noticeModal.classList.remove('show');
    };
  }
  if (noticeModal) {
    noticeModal.onclick = (e) => {
      if (e.target === noticeModal) {
        noticeModal.classList.remove('show');
      }
    };
  }

  const tabs = [
    { btn: tabNoticeCaution, pane: paneNoticeCaution },
    { btn: tabNoticeFeatures, pane: paneNoticeFeatures }
  ];

  tabs.forEach(tab => {
    if (tab.btn && tab.pane) {
      tab.btn.onclick = () => {
        tabs.forEach(t => {
          if (t.btn) t.btn.classList.remove('active');
          if (t.pane) t.pane.classList.remove('active');
        });
        tab.btn.classList.add('active');
        tab.pane.classList.add('active');
      };
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && noticeModal && noticeModal.classList.contains('show')) {
      noticeModal.classList.remove('show');
    }
  });
}

/* ==========================================================================
   合輯版：切換語言時，重畫程式寫進畫面的文字
   （吐司通知、處理中視窗、alert／confirm 是一次性的，不在此列）
   ========================================================================== */

function refreshLocaleTexts() {
  renderModeBadge();
  renderStatusLabels();
  renderGridView();
  if (state.mode === 'psd' || state.mode === 'ccfolia') renderPsdLayerPanel();
  if (state.activeTab === 'room' && (state.mode === 'ccfolia' || state.mode === 'psd')) renderRoomView();
  renderCustomPresetsUI();
  renderCompressStatus();
  renderApngTestDetails();

  const fileData = state.selectedFileName ? state.filesMap.get(state.selectedFileName) : null;
  if (fileData) {
    document.getElementById('assetDetailMeta').textContent = assetMetaText(fileData);
    if (fileData.isApng) document.getElementById('textAssetOrigLoopInfo').textContent = origLoopText(fileData);
    if (document.getElementById('singleInspectorModal').classList.contains('show')) {
      document.getElementById('inspectorMetaBadge').textContent = inspectorMetaText(fileData);
    }
  }

  const btnPlay = document.getElementById('btnApngPlayPause');
  if (btnPlay) btnPlay.textContent = apngPlayer.isPlaying ? T('apng.pause') : T('apng.play');
}

/* Init Application */
window.addEventListener('DOMContentLoaded', async () => {
  I18N.mountSwitcher(document.getElementById('localeSelect'));
  I18N.onChange(() => {
    refreshLocaleTexts();
  });
  renderModeBadge();
  setupEventListeners();
  setupCurveCanvasWidget();
  setupPhotoshopGradientWidget();
  setupAssetGradientWidget();
  setupAssetCurveWidget();
  setupNoticeWidget();
  loadCustomPresets();
  updateUIState();
  await restoreAutoSavedSession();
});
