(function (global) {
  'use strict';

  const NS = global.CocoLoadingMaker = global.CocoLoadingMaker || {};
  const { Utils } = NS;

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function pngChunk(type, payload) {
    const data = payload || new Uint8Array(0);
    const typeBytes = new Uint8Array(4);
    Utils.writeAscii(typeBytes, 0, type);
    const chunk = new Uint8Array(12 + data.length);
    Utils.writeUint32BE(chunk, 0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    const crcInput = new Uint8Array(4 + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, 4);
    Utils.writeUint32BE(chunk, 8 + data.length, crc32(crcInput));
    return chunk;
  }

  function rgbaToPngScanlines(rgba, width, height) {
    const stride = width * 4;
    const raw = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
      const target = y * (stride + 1);
      raw[target] = 0;
      raw.set(rgba.subarray(y * stride, (y + 1) * stride), target + 1);
    }
    return raw;
  }

  function canEncodeAPNG() {
    if (global.pako && typeof global.pako.deflate === 'function') return true;
    if (typeof global.CompressionStream !== 'function') return false;
    try {
      new global.CompressionStream('deflate');
      return true;
    } catch (_) {
      return false;
    }
  }

  async function deflatePngData(bytes) {
    if (global.pako && typeof global.pako.deflate === 'function') {
      const compressed = global.pako.deflate(bytes, { level: 6 });
      return compressed instanceof Uint8Array ? compressed : Uint8Array.from(compressed);
    }
    if (typeof global.CompressionStream === 'function') {
      let stream;
      try {
        stream = new Blob([bytes]).stream().pipeThrough(new global.CompressionStream('deflate'));
      } catch (_) {
        stream = null;
      }
      if (stream) {
        const reader = stream.getReader();
        const chunks = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) chunks.push(value);
        }
        return Utils.concatUint8(chunks);
      }
    }
    throw new Error(T('err.apng.unsupported'));
  }

  async function encodeAPNG(options) {
    const {
      width, height, frameCount, delayMs, loopCount, getFrame, onProgress, isCancelled,
    } = options;
    if (!canEncodeAPNG()) throw new Error(T('err.apng.unavailable'));

    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
    const ihdr = new Uint8Array(13);
    Utils.writeUint32BE(ihdr, 0, width);
    Utils.writeUint32BE(ihdr, 4, height);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    parts.push(pngChunk('IHDR', ihdr));

    const actl = new Uint8Array(8);
    Utils.writeUint32BE(actl, 0, frameCount);
    Utils.writeUint32BE(actl, 4, loopCount >>> 0);
    parts.push(pngChunk('acTL', actl));

    let sequence = 0;
    for (let i = 0; i < frameCount; i += 1) {
      if (isCancelled && isCancelled()) throw new DOMException(T('err.exportCancelled'), 'AbortError');
      const imageData = await getFrame(i);
      const fctl = new Uint8Array(26);
      Utils.writeUint32BE(fctl, 0, sequence++);
      Utils.writeUint32BE(fctl, 4, width);
      Utils.writeUint32BE(fctl, 8, height);
      Utils.writeUint32BE(fctl, 12, 0);
      Utils.writeUint32BE(fctl, 16, 0);
      const numerator = Math.max(1, Math.min(65535, Math.round(delayMs)));
      Utils.writeUint16BE(fctl, 20, numerator);
      Utils.writeUint16BE(fctl, 22, 1000);
      fctl[24] = 0;
      fctl[25] = 0;
      parts.push(pngChunk('fcTL', fctl));

      const scanlines = rgbaToPngScanlines(imageData.data, width, height);
      const compressed = await deflatePngData(scanlines);
      if (i === 0) {
        parts.push(pngChunk('IDAT', compressed));
      } else {
        const fdat = new Uint8Array(4 + compressed.length);
        Utils.writeUint32BE(fdat, 0, sequence++);
        fdat.set(compressed, 4);
        parts.push(pngChunk('fdAT', fdat));
      }
      if (onProgress) onProgress((i + 1) / frameCount, T('progress.apngEncode', i + 1, frameCount));
      if (i % 2 === 0) await Utils.nextFrame();
    }
    parts.push(pngChunk('IEND', new Uint8Array(0)));
    return new Blob([Utils.concatUint8(parts)], { type: 'image/png' });
  }

  function makeGifPalette() {
    const palette = new Uint8Array(256 * 3);
    palette[0] = 0; palette[1] = 0; palette[2] = 0;
    const levels = [0, 51, 102, 153, 204, 255];
    let index = 1;
    for (let r = 0; r < 6; r += 1) {
      for (let g = 0; g < 6; g += 1) {
        for (let b = 0; b < 6; b += 1) {
          palette[index * 3] = levels[r];
          palette[index * 3 + 1] = levels[g];
          palette[index * 3 + 2] = levels[b];
          index += 1;
        }
      }
    }
    for (; index < 256; index += 1) {
      const gray = Math.round(((index - 217) / 38) * 255);
      palette[index * 3] = gray;
      palette[index * 3 + 1] = gray;
      palette[index * 3 + 2] = gray;
    }
    return palette;
  }

  function rgbaToGifIndices(rgba, alphaThreshold) {
    const output = new Uint8Array(rgba.length / 4);
    for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
      const alpha = rgba[i + 3];
      if (alpha <= alphaThreshold) {
        output[p] = 0;
        continue;
      }
      const r = rgba[i]; const g = rgba[i + 1]; const b = rgba[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 15) {
        output[p] = 217 + Math.min(38, Math.round(((r + g + b) / 3 / 255) * 38));
      } else {
        const rl = Math.min(5, Math.round(r / 51));
        const gl = Math.min(5, Math.round(g / 51));
        const bl = Math.min(5, Math.round(b / 51));
        output[p] = 1 + rl * 36 + gl * 6 + bl;
      }
    }
    return output;
  }

  class GifBitWriter {
    constructor() {
      this.bytes = [];
      this.current = 0;
      this.bitCount = 0;
    }

    write(code, size) {
      this.current |= code << this.bitCount;
      this.bitCount += size;
      while (this.bitCount >= 8) {
        this.bytes.push(this.current & 255);
        this.current >>>= 8;
        this.bitCount -= 8;
      }
    }

    finish() {
      if (this.bitCount > 0) this.bytes.push(this.current & 255);
      return new Uint8Array(this.bytes);
    }
  }

  function gifLzwEncode(indices, minCodeSize = 8) {
    // A deliberately conservative stream: emit literal palette indices and
    // clear the dictionary before the 9-bit code table can grow. This is
    // larger than aggressive LZW, but is deterministic and broadly compatible.
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    const codeSize = minCodeSize + 1;
    const writer = new GifBitWriter();
    const resetInterval = 240;
    let literalsSinceClear = 0;

    writer.write(clearCode, codeSize);
    for (let i = 0; i < indices.length; i += 1) {
      writer.write(indices[i], codeSize);
      literalsSinceClear += 1;
      if (literalsSinceClear >= resetInterval && i < indices.length - 1) {
        writer.write(clearCode, codeSize);
        literalsSinceClear = 0;
      }
    }
    writer.write(endCode, codeSize);
    return writer.finish();
  }

  function gifSubBlocks(bytes) {
    const parts = [];
    for (let offset = 0; offset < bytes.length; offset += 255) {
      const size = Math.min(255, bytes.length - offset);
      parts.push(new Uint8Array([size]));
      parts.push(bytes.subarray(offset, offset + size));
    }
    parts.push(new Uint8Array([0]));
    return Utils.concatUint8(parts);
  }

  async function encodeGIF(options) {
    const {
      width, height, frameCount, delayMs, loopCount, alphaThreshold, getFrame, onProgress, isCancelled,
    } = options;
    if (width > 65535 || height > 65535) throw new Error(T('err.gif.size'));
    const parts = [];
    const header = new Uint8Array(13);
    Utils.writeAscii(header, 0, 'GIF89a');
    Utils.writeUint16LE(header, 6, width);
    Utils.writeUint16LE(header, 8, height);
    header[10] = 0xF7;
    header[11] = 0;
    header[12] = 0;
    parts.push(header);
    parts.push(makeGifPalette());

    const appExt = new Uint8Array(19);
    appExt.set([0x21, 0xFF, 0x0B], 0);
    Utils.writeAscii(appExt, 3, 'NETSCAPE2.0');
    appExt[14] = 0x03;
    appExt[15] = 0x01;
    Utils.writeUint16LE(appExt, 16, loopCount);
    appExt[18] = 0;
    parts.push(appExt);

    const delayCs = Math.max(2, Math.min(65535, Math.round(delayMs / 10)));
    for (let i = 0; i < frameCount; i += 1) {
      if (isCancelled && isCancelled()) throw new DOMException(T('err.exportCancelled'), 'AbortError');
      const imageData = await getFrame(i);
      const indices = rgbaToGifIndices(imageData.data, alphaThreshold);

      const gce = new Uint8Array([0x21, 0xF9, 0x04, 0x09, 0, 0, 0, 0]);
      Utils.writeUint16LE(gce, 4, delayCs);
      parts.push(gce);

      const descriptor = new Uint8Array(10);
      descriptor[0] = 0x2C;
      Utils.writeUint16LE(descriptor, 1, 0);
      Utils.writeUint16LE(descriptor, 3, 0);
      Utils.writeUint16LE(descriptor, 5, width);
      Utils.writeUint16LE(descriptor, 7, height);
      descriptor[9] = 0;
      parts.push(descriptor);
      parts.push(new Uint8Array([8]));
      parts.push(gifSubBlocks(gifLzwEncode(indices, 8)));

      if (onProgress) onProgress((i + 1) / frameCount, T('progress.gifEncode', i + 1, frameCount));
      if (i % 2 === 0) await Utils.nextFrame();
    }
    parts.push(new Uint8Array([0x3B]));
    return new Blob([Utils.concatUint8(parts)], { type: 'image/gif' });
  }

  function riffChunk(type, payload) {
    const size = payload.length;
    const output = new Uint8Array(8 + size + (size & 1));
    Utils.writeAscii(output, 0, type);
    Utils.writeUint32LE(output, 4, size);
    output.set(payload, 8);
    return output;
  }

  function readUint32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function extractWebPFrameChunks(bytes) {
    if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF'
      || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') {
      throw new Error(T('err.webp.frame'));
    }
    const chunks = [];
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const size = readUint32LE(bytes, offset + 4);
      const padded = size + (size & 1);
      if (offset + 8 + padded > bytes.length) break;
      if (type === 'ALPH' || type === 'VP8 ' || type === 'VP8L') {
        chunks.push(bytes.slice(offset, offset + 8 + padded));
      }
      offset += 8 + padded;
    }
    if (!chunks.some((chunk) => {
      const type = String.fromCharCode(...chunk.subarray(0, 4));
      return type === 'VP8 ' || type === 'VP8L';
    })) throw new Error(T('err.webp.chunk'));
    return Utils.concatUint8(chunks);
  }

  function canvasToWebPBytes(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        try {
          if (!blob || blob.type !== 'image/webp') throw new Error(T('err.webp.canvas'));
          resolve(new Uint8Array(await blob.arrayBuffer()));
        } catch (error) {
          reject(error);
        }
      }, 'image/webp', quality);
    });
  }

  async function encodeAnimatedWebP(options) {
    const {
      width, height, frameCount, delayMs, loopCount, quality, renderCanvas, onProgress, isCancelled,
    } = options;
    if (width > 16777216 || height > 16777216) throw new Error(T('err.webp.size'));

    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x12;
    Utils.writeUint24LE(vp8x, 4, width - 1);
    Utils.writeUint24LE(vp8x, 7, height - 1);

    const anim = new Uint8Array(6);
    anim[0] = 0; anim[1] = 0; anim[2] = 0; anim[3] = 0;
    Utils.writeUint16LE(anim, 4, loopCount);

    const chunks = [riffChunk('VP8X', vp8x), riffChunk('ANIM', anim)];
    for (let i = 0; i < frameCount; i += 1) {
      if (isCancelled && isCancelled()) throw new DOMException(T('err.exportCancelled'), 'AbortError');
      const canvas = await renderCanvas(i);
      const stillBytes = await canvasToWebPBytes(canvas, quality);
      const frameData = extractWebPFrameChunks(stillBytes);
      const header = new Uint8Array(16);
      Utils.writeUint24LE(header, 0, 0);
      Utils.writeUint24LE(header, 3, 0);
      Utils.writeUint24LE(header, 6, width - 1);
      Utils.writeUint24LE(header, 9, height - 1);
      Utils.writeUint24LE(header, 12, Math.max(1, Math.min(0xFFFFFF, Math.round(delayMs))));
      header[15] = 0x02;
      chunks.push(riffChunk('ANMF', Utils.concatUint8([header, frameData])));
      if (onProgress) onProgress((i + 1) / frameCount, T('progress.webpEncode', i + 1, frameCount));
      await Utils.nextFrame();
    }

    const payload = Utils.concatUint8(chunks);
    const riff = new Uint8Array(12 + payload.length);
    Utils.writeAscii(riff, 0, 'RIFF');
    Utils.writeUint32LE(riff, 4, 4 + payload.length);
    Utils.writeAscii(riff, 8, 'WEBP');
    riff.set(payload, 12);
    return new Blob([riff], { type: 'image/webp' });
  }

  class AnimationExporter {
    constructor(renderer, store, media) {
      this.renderer = renderer;
      this.store = store;
      this.media = media;
      this.cancelled = false;
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    }

    cancel() {
      this.cancelled = true;
    }

    estimate() {
      const state = this.store.get();
      const duration = Utils.getAnimationDuration(state);
      const frameCount = Math.max(2, Math.round(duration * state.export.fps));
      const rawBytes = state.canvas.width * state.canvas.height * 4 * frameCount;
      return { frameCount, rawBytes, delayMs: duration * 1000 / frameCount, duration };
    }

    async export(onProgress) {
      this.cancelled = false;
      const state = NS.normalizeState(this.store.serialize());
      const width = state.canvas.width;
      const height = state.canvas.height;
      const duration = Utils.getAnimationDuration(state);
      const frameCount = Math.max(2, Math.round(duration * state.export.fps));
      const delayMs = duration * 1000 / frameCount;
      this.canvas.width = width;
      this.canvas.height = height;

      // Loop loaders use a half-open [0, duration) sample range. Including the
      // exact end would duplicate the first pose and create a visible pause at
      // the seam. Progress loaders keep the final endpoint so every image or
      // completion effect reaches its finished state.
      const loopingLoader = state.loader.type === 'loop'
        || (state.loader.type === 'image-row' && state.loader.rowMode === 'loop');
      const timeForIndex = loopingLoader
        ? (index) => (index / frameCount) * duration
        : (index) => frameCount <= 1 ? 0 : (index / (frameCount - 1)) * duration;
      let capturedNativeFrames = null;
      if (this.media.source.kind === 'native-animation') {
        capturedNativeFrames = [];
        await this.media.restartNativeAnimation();
        await Utils.nextFrame();
        const started = performance.now();
        for (let i = 0; i < frameCount; i += 1) {
          if (this.cancelled) throw new DOMException(T('err.exportCancelled'), 'AbortError');
          const target = started + i * delayMs;
          const wait = target - performance.now();
          if (wait > 1) await Utils.sleep(wait);
          this.renderer.renderToCanvas(this.canvas, timeForIndex(i), state);
          capturedNativeFrames.push(this.ctx.getImageData(0, 0, width, height));
          if (onProgress) onProgress((i + 1) / frameCount, T('progress.liveCapture', i + 1, frameCount));
        }
      }
      const renderImageData = async (index) => {
        if (capturedNativeFrames) return capturedNativeFrames[index];
        const time = timeForIndex(index);
        this.renderer.renderToCanvas(this.canvas, time, state);
        return this.ctx.getImageData(0, 0, width, height);
      };
      const renderCanvas = async (index) => {
        if (capturedNativeFrames) {
          this.ctx.clearRect(0, 0, width, height);
          this.ctx.putImageData(capturedNativeFrames[index], 0, 0);
          return this.canvas;
        }
        const time = timeForIndex(index);
        this.renderer.renderToCanvas(this.canvas, time, state);
        return this.canvas;
      };
      const common = {
        width,
        height,
        frameCount,
        delayMs,
        loopCount: state.export.loopCount,
        onProgress,
        isCancelled: () => this.cancelled,
      };

      if (state.export.format === 'gif') {
        return encodeGIF({
          ...common,
          alphaThreshold: state.export.gifAlphaThreshold,
          getFrame: renderImageData,
        });
      }
      if (state.export.format === 'webp') {
        return encodeAnimatedWebP({
          ...common,
          quality: state.export.quality,
          renderCanvas,
        });
      }
      return encodeAPNG({ ...common, getFrame: renderImageData });
    }
  }

  NS.AnimationExporter = AnimationExporter;
  NS.canEncodeAPNG = canEncodeAPNG;
  NS.deflatePngData = deflatePngData;
  NS.encodeAPNG = encodeAPNG;
  NS.encodeGIF = encodeGIF;
  NS.encodeAnimatedWebP = encodeAnimatedWebP;
}(window));
