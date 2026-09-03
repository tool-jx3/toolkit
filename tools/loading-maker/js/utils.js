(function (global) {
  'use strict';

  const NS = global.CocoLoadingMaker = global.CocoLoadingMaker || {};

  const Utils = {
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || 0));
    },

    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    mod(value, divisor) {
      return ((value % divisor) + divisor) % divisor;
    },

    deepClone(value) {
      if (global.structuredClone) {
        try { return global.structuredClone(value); } catch (_) { /* fall through */ }
      }
      return JSON.parse(JSON.stringify(value));
    },

    deepMerge(target, source) {
      if (!source || typeof source !== 'object') return target;
      Object.keys(source).forEach((key) => {
        const incoming = source[key];
        if (Array.isArray(incoming)) {
          target[key] = incoming.slice();
        } else if (incoming && typeof incoming === 'object') {
          const base = target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
            ? target[key]
            : {};
          target[key] = Utils.deepMerge(base, incoming);
        } else {
          target[key] = incoming;
        }
      });
      return target;
    },

    debounce(fn, delay = 120) {
      let timer = 0;
      return function debounced(...args) {
        global.clearTimeout(timer);
        timer = global.setTimeout(() => fn.apply(this, args), delay);
      };
    },

    formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      const value = bytes / (1024 ** index);
      return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
    },

    naturalCompare(a, b) {
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    },

    sleep(ms) {
      return new Promise((resolve) => global.setTimeout(resolve, ms));
    },

    nextFrame() {
      return new Promise((resolve) => global.requestAnimationFrame(resolve));
    },

    async blobToDataURL(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error(T('err.fileRead')));
        reader.readAsDataURL(blob);
      });
    },

    dataURLToBlob(dataURL) {
      const [header, body = ''] = String(dataURL).split(',');
      const mimeMatch = header.match(/^data:([^;,]+)/i);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const isBase64 = /;base64/i.test(header);
      const binary = isBase64 ? atob(body) : decodeURIComponent(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    },

    downloadBlob(blob, fileName) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 1500);
    },

    downloadText(text, fileName, mime = 'application/json;charset=utf-8') {
      Utils.downloadBlob(new Blob([text], { type: mime }), fileName);
    },

    sanitizeFileName(name, fallback = 'loading-animation') {
      const cleaned = String(name || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
      return cleaned || fallback;
    },

    hexToRgba(hex, alpha = 1) {
      const raw = String(hex || '').trim();
      if (/^rgba?\(/i.test(raw) || /^hsla?\(/i.test(raw)) return raw;
      const short = raw.match(/^#([0-9a-f]{3,4})$/i);
      const long = raw.match(/^#([0-9a-f]{6,8})$/i);
      let r = 0; let g = 0; let b = 0; let embeddedAlpha = 1;
      if (short) {
        r = parseInt(short[1][0] + short[1][0], 16);
        g = parseInt(short[1][1] + short[1][1], 16);
        b = parseInt(short[1][2] + short[1][2], 16);
        if (short[1][3]) embeddedAlpha = parseInt(short[1][3] + short[1][3], 16) / 255;
      } else if (long) {
        r = parseInt(long[1].slice(0, 2), 16);
        g = parseInt(long[1].slice(2, 4), 16);
        b = parseInt(long[1].slice(4, 6), 16);
        if (long[1].length === 8) embeddedAlpha = parseInt(long[1].slice(6, 8), 16) / 255;
      } else {
        return `rgba(0, 0, 0, ${Utils.clamp(alpha, 0, 1)})`;
      }
      return `rgba(${r}, ${g}, ${b}, ${Utils.clamp(alpha * embeddedAlpha, 0, 1)})`;
    },


    normalizeHexColor(value, fallback = '#000000') {
      const raw = String(value || '').trim();
      const short = raw.match(/^#([0-9a-f]{3})$/i);
      if (short) return `#${Array.from(short[1]).map((char) => char + char).join('').toLowerCase()}`;
      const long = raw.match(/^#([0-9a-f]{6})$/i);
      return long ? `#${long[1].toLowerCase()}` : fallback;
    },

    hexToRgbObject(value) {
      const hex = Utils.normalizeHexColor(value, '#000000').slice(1);
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    },

    rgbToHex(r, g, b) {
      const part = (value) => Math.round(Utils.clamp(value, 0, 255)).toString(16).padStart(2, '0');
      return `#${part(r)}${part(g)}${part(b)}`;
    },

    mixHexColors(a, b, t) {
      const from = Utils.hexToRgbObject(a);
      const to = Utils.hexToRgbObject(b);
      const amount = Utils.clamp(t, 0, 1);
      return Utils.rgbToHex(
        Utils.lerp(from.r, to.r, amount),
        Utils.lerp(from.g, to.g, amount),
        Utils.lerp(from.b, to.b, amount),
      );
    },

    sampleGradientStops(stops, position, cyclic = false) {
      const source = (Array.isArray(stops) ? stops : [])
        .map((stop) => ({
          position: Utils.clamp(Number(stop.position) / 100, 0, 1),
          color: Utils.normalizeHexColor(stop.color, '#000000'),
        }))
        .sort((a, b) => a.position - b.position);
      if (!source.length) return '#000000';
      if (source.length === 1) return source[0].color;

      let x = Number(position) || 0;
      if (!cyclic) {
        x = Utils.clamp(x, 0, 1);
        if (x <= source[0].position) return source[0].color;
        if (x >= source[source.length - 1].position) return source[source.length - 1].color;
      } else {
        x = Utils.mod(x, 1);
      }

      for (let index = 1; index < source.length; index += 1) {
        const left = source[index - 1];
        const right = source[index];
        if (x <= right.position && x >= left.position) {
          const span = Math.max(0.000001, right.position - left.position);
          return Utils.mixHexColors(left.color, right.color, (x - left.position) / span);
        }
      }

      if (cyclic) {
        const left = source[source.length - 1];
        const right = source[0];
        const adjusted = x < right.position ? x + 1 : x;
        const span = Math.max(0.000001, right.position + 1 - left.position);
        return Utils.mixHexColors(left.color, right.color, (adjusted - left.position) / span);
      }
      return source[source.length - 1].color;
    },

    getProgressDuration(state) {
      const timingDuration = Utils.clamp(state && state.timing ? state.timing.duration : 3, 0.1, 120);
      const loader = state && state.loader ? state.loader : {};
      if (loader.type === 'bar' && loader.progressMode === 'keyframes' && Array.isArray(loader.progressKeyframes)) {
        const last = loader.progressKeyframes.reduce((maximum, point) => Math.max(maximum, Number(point.time) || 0), 0);
        if (last > 0) return Utils.clamp(last, 0.1, 120);
      }
      return timingDuration;
    },

    getFadeInDuration(state) {
      const loader = state && state.loader ? state.loader : {};
      if (loader.type !== 'bar' || !loader.fadeIn) return 0;
      return Utils.clamp(loader.fadeInDuration, 0.1, 10);
    },

    getCompletionStartTime(state) {
      const progressDuration = Utils.getProgressDuration(state);
      const loader = state && state.loader ? state.loader : {};
      if (loader.type !== 'bar') return progressDuration;
      const delay = Utils.clamp(loader.completionDelay, 0, 20);
      return Utils.getFadeInDuration(state) + progressDuration + delay;
    },

    getAnimationDuration(state) {
      const progressDuration = Utils.getProgressDuration(state);
      const loader = state && state.loader ? state.loader : {};
      if (loader.type !== 'bar') return progressDuration;
      const motionDuration = loader.completionMotion && loader.completionMotion !== 'none'
        ? Utils.clamp(loader.completionMotionDuration, 0.1, 10)
        : 0;
      return Math.max(0.1, Utils.getCompletionStartTime(state) + motionDuration);
    },

    getSeamlessLoopDuration(state) {
      const loader = state && state.loader ? state.loader : {};
      const timing = state && state.timing ? state.timing : {};
      const speed = Math.max(0.05, Math.abs(Number(loader.loopSpeed) || 1));
      const currentDuration = Utils.clamp(Number(timing.duration) || 3, 0.25, 120);
      const minimumCycles = Math.max(1, Math.ceil(0.25 * speed - 1e-9));
      const completedCycles = Math.floor(currentDuration * speed + 1e-9);
      const cycles = Math.max(minimumCycles, completedCycles);
      return {
        cycles,
        duration: cycles / speed,
        extended: completedCycles < minimumCycles,
      };
    },

    hash01(seed, index) {
      let value = (Number(seed) || 1) * 374761393 + index * 668265263;
      value = (value ^ (value >>> 13)) * 1274126177;
      value ^= value >>> 16;
      return (value >>> 0) / 4294967295;
    },

    easing(name, t, seed = 1) {
      const x = Utils.clamp(t, 0, 1);
      switch (name) {
        case 'ease-in': return x * x * x;
        case 'ease-out': return 1 - ((1 - x) ** 3);
        case 'ease-in-out': return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
        case 'smooth': return x * x * (3 - 2 * x);
        case 'steps': return Math.floor(x * 10) / 10;
        case 'bounce': {
          const n1 = 7.5625;
          const d1 = 2.75;
          let y = x;
          if (y < 1 / d1) return n1 * y * y;
          if (y < 2 / d1) { y -= 1.5 / d1; return n1 * y * y + 0.75; }
          if (y < 2.5 / d1) { y -= 2.25 / d1; return n1 * y * y + 0.9375; }
          y -= 2.625 / d1;
          return n1 * y * y + 0.984375;
        }
        case 'irregular': {
          const knots = 8;
          const scaled = x * knots;
          const index = Math.min(knots - 1, Math.floor(scaled));
          const local = scaled - index;
          const y0 = index === 0 ? 0 : Utils.irregularKnot(seed, index, knots);
          const y1 = index === knots - 1 ? 1 : Utils.irregularKnot(seed, index + 1, knots);
          const smoothLocal = local * local * (3 - 2 * local);
          return Utils.lerp(y0, y1, smoothLocal);
        }
        default: return x;
      }
    },

    irregularKnot(seed, index, count) {
      const knotCount = Math.max(1, Math.round(Number(count) || 1));
      const knotIndex = Math.round(Utils.clamp(index, 0, knotCount));
      if (knotIndex <= 0) return 0;
      if (knotIndex >= knotCount) return 1;

      // Build the curve from positive, seed-based interval weights. The old
      // independent jitter could place a later knot below an earlier one,
      // which briefly emptied a filled segment and looked like colour flicker.
      let partial = 0;
      let total = 0;
      for (let step = 1; step <= knotCount; step += 1) {
        const weight = 0.55 + Utils.hash01(seed + 7919, step) * 0.9;
        total += weight;
        if (step <= knotIndex) partial += weight;
      }
      return partial / total;
    },

    pathStar(ctx, cx, cy, outerRadius, innerRadius, points = 5, rotation = -Math.PI / 2) {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i += 1) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = rotation + (Math.PI * i) / points;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    },

    pathHeart(ctx, cx, cy, size) {
      const s = size / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.85);
      ctx.bezierCurveTo(cx - s * 1.35, cy + s * 0.05, cx - s * 0.95, cy - s * 1.05, cx, cy - s * 0.35);
      ctx.bezierCurveTo(cx + s * 0.95, cy - s * 1.05, cx + s * 1.35, cy + s * 0.05, cx, cy + s * 0.85);
      ctx.closePath();
    },

    writeAscii(target, offset, text) {
      for (let i = 0; i < text.length; i += 1) target[offset + i] = text.charCodeAt(i);
    },

    writeUint16LE(target, offset, value) {
      target[offset] = value & 255;
      target[offset + 1] = (value >>> 8) & 255;
    },

    writeUint24LE(target, offset, value) {
      target[offset] = value & 255;
      target[offset + 1] = (value >>> 8) & 255;
      target[offset + 2] = (value >>> 16) & 255;
    },

    writeUint32LE(target, offset, value) {
      target[offset] = value & 255;
      target[offset + 1] = (value >>> 8) & 255;
      target[offset + 2] = (value >>> 16) & 255;
      target[offset + 3] = (value >>> 24) & 255;
    },

    writeUint16BE(target, offset, value) {
      target[offset] = (value >>> 8) & 255;
      target[offset + 1] = value & 255;
    },

    writeUint32BE(target, offset, value) {
      target[offset] = (value >>> 24) & 255;
      target[offset + 1] = (value >>> 16) & 255;
      target[offset + 2] = (value >>> 8) & 255;
      target[offset + 3] = value & 255;
    },

    concatUint8(parts) {
      const total = parts.reduce((sum, part) => sum + part.length, 0);
      const result = new Uint8Array(total);
      let offset = 0;
      parts.forEach((part) => {
        result.set(part, offset);
        offset += part.length;
      });
      return result;
    },

    extensionForFormat(format) {
      if (format === 'apng') return 'png';
      if (format === 'webp') return 'webp';
      return 'gif';
    },
  };

  // Keep filenames ASCII-safe while still allowing Korean base names.
  Utils.sanitizeFileName = function sanitizeFileName(name, fallback = 'loading-animation') {
    const cleaned = String(name || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '');
    return cleaned || fallback;
  };

  NS.Utils = Utils;
}(window));
