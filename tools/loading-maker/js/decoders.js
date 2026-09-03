(function (global) {
  'use strict';

  const NS = global.CocoLoadingMaker = global.CocoLoadingMaker || {};
  const { Utils } = NS;

  const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const u16le = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
  const u16be = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];
  const u24le = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  const u32le = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  const u32be = (bytes, offset) => ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  async function bitmapFromRgba(rgba, width, height) {
    const data = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
    return createImageBitmap(new ImageData(data, width, height));
  }

  function concatParts(parts) {
    return Utils.concatUint8(parts.map((part) => part instanceof Uint8Array ? part : new Uint8Array(part)));
  }

  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  }

  function unfilterPng(inflated, width, height, bytesPerPixel) {
    const rowBytes = width * bytesPerPixel;
    const output = new Uint8Array(rowBytes * height);
    let sourceOffset = 0;
    for (let y = 0; y < height; y += 1) {
      const filter = inflated[sourceOffset++];
      const rowOffset = y * rowBytes;
      const previousOffset = (y - 1) * rowBytes;
      for (let x = 0; x < rowBytes; x += 1) {
        const raw = inflated[sourceOffset++];
        const left = x >= bytesPerPixel ? output[rowOffset + x - bytesPerPixel] : 0;
        const up = y > 0 ? output[previousOffset + x] : 0;
        const upLeft = y > 0 && x >= bytesPerPixel ? output[previousOffset + x - bytesPerPixel] : 0;
        let value = raw;
        if (filter === 1) value = raw + left;
        else if (filter === 2) value = raw + up;
        else if (filter === 3) value = raw + Math.floor((left + up) / 2);
        else if (filter === 4) value = raw + paeth(left, up, upLeft);
        else if (filter !== 0) throw new Error(T('err.png.filter', filter));
        output[rowOffset + x] = value & 255;
      }
    }
    return output;
  }

  function pngBytesPerPixel(colorType, bitDepth) {
    if (bitDepth !== 8) throw new Error(T('err.png.bitDepth', bitDepth));
    if (colorType === 6) return 4;
    if (colorType === 2) return 3;
    if (colorType === 3) return 1;
    if (colorType === 4) return 2;
    if (colorType === 0) return 1;
    throw new Error(T('err.png.colorType', colorType));
  }

  function pngRawToRgba(raw, width, height, colorType, palette, transparency) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    let source = 0;
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const target = pixel * 4;
      if (colorType === 6) {
        rgba[target] = raw[source++];
        rgba[target + 1] = raw[source++];
        rgba[target + 2] = raw[source++];
        rgba[target + 3] = raw[source++];
      } else if (colorType === 2) {
        const r = raw[source++]; const g = raw[source++]; const b = raw[source++];
        rgba[target] = r; rgba[target + 1] = g; rgba[target + 2] = b;
        if (transparency && transparency.length >= 6) {
          const tr = u16be(transparency, 0) & 255;
          const tg = u16be(transparency, 2) & 255;
          const tb = u16be(transparency, 4) & 255;
          rgba[target + 3] = r === tr && g === tg && b === tb ? 0 : 255;
        } else rgba[target + 3] = 255;
      } else if (colorType === 3) {
        const index = raw[source++];
        rgba[target] = palette[index * 3] || 0;
        rgba[target + 1] = palette[index * 3 + 1] || 0;
        rgba[target + 2] = palette[index * 3 + 2] || 0;
        rgba[target + 3] = transparency && index < transparency.length ? transparency[index] : 255;
      } else if (colorType === 4) {
        const gray = raw[source++];
        rgba[target] = gray; rgba[target + 1] = gray; rgba[target + 2] = gray; rgba[target + 3] = raw[source++];
      } else {
        const gray = raw[source++];
        rgba[target] = gray; rgba[target + 1] = gray; rgba[target + 2] = gray;
        rgba[target + 3] = transparency && transparency.length >= 2 && gray === (u16be(transparency, 0) & 255) ? 0 : 255;
      }
    }
    return rgba;
  }

  async function decodeAPNG(bytes, onProgress) {
    if (!global.pako || typeof global.pako.inflate !== 'function') throw new Error(T('err.apng.noPako'));
    if (ascii(bytes, 1, 3) !== 'PNG') throw new Error(T('err.png.signature'));

    let width = 0; let height = 0; let bitDepth = 8; let colorType = 6; let interlace = 0;
    let palette = null; let transparency = null;
    const frames = [];
    const defaultData = [];
    let current = null;
    let offset = 8;

    const finishCurrent = () => {
      if (current && current.data.length) frames.push(current);
      current = null;
    };

    while (offset + 12 <= bytes.length) {
      const length = u32be(bytes, offset);
      const type = ascii(bytes, offset + 4, 4);
      const payload = bytes.subarray(offset + 8, offset + 8 + length);
      if (type === 'IHDR') {
        width = u32be(payload, 0); height = u32be(payload, 4);
        bitDepth = payload[8]; colorType = payload[9]; interlace = payload[12];
      } else if (type === 'PLTE') palette = payload.slice();
      else if (type === 'tRNS') transparency = payload.slice();
      else if (type === 'fcTL') {
        finishCurrent();
        const delayNumerator = u16be(payload, 20);
        const delayDenominator = u16be(payload, 22) || 100;
        current = {
          width: u32be(payload, 4), height: u32be(payload, 8),
          x: u32be(payload, 12), y: u32be(payload, 16),
          delay: Math.max(10, Math.round(delayNumerator / delayDenominator * 1000) || 100),
          dispose: payload[24], blend: payload[25], data: [],
        };
      } else if (type === 'IDAT') {
        if (current) current.data.push(payload.slice()); else defaultData.push(payload.slice());
      } else if (type === 'fdAT') {
        if (!current) throw new Error(T('err.apng.fdatOrder'));
        current.data.push(payload.slice(4));
      } else if (type === 'IEND') {
        finishCurrent();
        break;
      }
      offset += 12 + length;
    }

    if (interlace !== 0) throw new Error(T('err.apng.interlace'));
    if (!frames.length) throw new Error(T('err.apng.noFrames'));
    if (frames.length > 500) throw new Error(T('err.tooManyFrames'));
    const bpp = pngBytesPerPixel(colorType, bitDepth);
    const composition = makeCanvas(width, height);
    const ctx = composition.getContext('2d', { alpha: true, willReadFrequently: true });
    const outputFrames = [];
    const durations = [];

    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      if (onProgress) onProgress(0.1 + (index / frames.length) * 0.85, T('progress.apngDecode', index + 1, frames.length));
      const compressed = concatParts(frame.data);
      const inflated = global.pako.inflate(compressed);
      const raw = unfilterPng(inflated, frame.width, frame.height, bpp);
      const rgba = pngRawToRgba(raw, frame.width, frame.height, colorType, palette, transparency);
      const frameBitmap = await bitmapFromRgba(rgba, frame.width, frame.height);
      let previous = null;
      if (frame.dispose === 2) previous = ctx.getImageData(0, 0, width, height);
      if (frame.blend === 0) ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
      ctx.drawImage(frameBitmap, frame.x, frame.y);
      outputFrames.push(await createImageBitmap(composition));
      durations.push(frame.delay);
      if (frame.dispose === 1) ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
      else if (frame.dispose === 2 && previous) ctx.putImageData(previous, 0, 0);
      frameBitmap.close();
      if (index % 8 === 0) await Utils.nextFrame();
    }
    return { frames: outputFrames, durations, width, height };
  }

  function readGifSubBlocks(bytes, start) {
    const parts = [];
    let offset = start;
    while (offset < bytes.length) {
      const size = bytes[offset++];
      if (size === 0) break;
      parts.push(bytes.slice(offset, offset + size));
      offset += size;
    }
    return { data: concatParts(parts), offset };
  }

  function gifLzwDecode(data, minCodeSize, expectedLength) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    let bitPosition = 0;
    let table = [];

    const reset = () => {
      table = new Array(4096);
      for (let i = 0; i < clearCode; i += 1) table[i] = new Uint8Array([i]);
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    };
    const readCode = () => {
      let value = 0;
      for (let bit = 0; bit < codeSize; bit += 1) {
        const byteIndex = bitPosition >> 3;
        if (byteIndex >= data.length) return -1;
        value |= ((data[byteIndex] >> (bitPosition & 7)) & 1) << bit;
        bitPosition += 1;
      }
      return value;
    };

    reset();
    const output = new Uint8Array(expectedLength);
    let outputOffset = 0;
    let previous = null;
    while (outputOffset < expectedLength) {
      const code = readCode();
      if (code < 0 || code === endCode) break;
      if (code === clearCode) {
        reset();
        previous = null;
        continue;
      }
      let entry = code < nextCode ? table[code] : null;
      if (!entry && code === nextCode && previous) {
        entry = new Uint8Array(previous.length + 1);
        entry.set(previous, 0);
        entry[entry.length - 1] = previous[0];
      }
      if (!entry) throw new Error(T('err.gif.lzw'));
      const count = Math.min(entry.length, expectedLength - outputOffset);
      output.set(entry.subarray(0, count), outputOffset);
      outputOffset += count;
      if (previous && nextCode < 4096) {
        const combined = new Uint8Array(previous.length + 1);
        combined.set(previous, 0);
        combined[combined.length - 1] = entry[0];
        table[nextCode++] = combined;
        if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
      }
      previous = entry;
    }
    return output;
  }

  function deinterlaceGif(indices, width, height) {
    const output = new Uint8Array(indices.length);
    let sourceRow = 0;
    [[0, 8], [4, 8], [2, 4], [1, 2]].forEach(([start, step]) => {
      for (let y = start; y < height; y += step) {
        output.set(indices.subarray(sourceRow * width, (sourceRow + 1) * width), y * width);
        sourceRow += 1;
      }
    });
    return output;
  }

  async function decodeGIF(bytes, onProgress) {
    if (!/^GIF8[79]a$/.test(ascii(bytes, 0, 6))) throw new Error(T('err.gif.signature'));
    const width = u16le(bytes, 6);
    const height = u16le(bytes, 8);
    const packed = bytes[10];
    let offset = 13;
    let globalPalette = null;
    if (packed & 0x80) {
      const count = 1 << ((packed & 7) + 1);
      globalPalette = bytes.slice(offset, offset + count * 3);
      offset += count * 3;
    }

    const composition = makeCanvas(width, height);
    const ctx = composition.getContext('2d', { alpha: true, willReadFrequently: true });
    const outputFrames = [];
    const durations = [];
    let gce = { disposal: 0, delay: 100, transparent: false, transparentIndex: 0 };
    let parsedFrames = 0;

    while (offset < bytes.length) {
      const marker = bytes[offset++];
      if (marker === 0x3B) break;
      if (marker === 0x21) {
        const label = bytes[offset++];
        if (label === 0xF9) {
          const blockSize = bytes[offset++];
          const control = bytes[offset];
          gce = {
            disposal: (control >> 2) & 7,
            delay: Math.max(20, u16le(bytes, offset + 1) * 10 || 100),
            transparent: Boolean(control & 1),
            transparentIndex: bytes[offset + 3],
          };
          offset += blockSize;
          if (bytes[offset] === 0) offset += 1;
        } else {
          const headerSize = bytes[offset++];
          offset += headerSize;
          offset = readGifSubBlocks(bytes, offset).offset;
        }
        continue;
      }
      if (marker !== 0x2C) throw new Error(T('err.gif.block', marker.toString(16)));

      const x = u16le(bytes, offset);
      const y = u16le(bytes, offset + 2);
      const frameWidth = u16le(bytes, offset + 4);
      const frameHeight = u16le(bytes, offset + 6);
      const descriptorPacked = bytes[offset + 8];
      offset += 9;
      let palette = globalPalette;
      if (descriptorPacked & 0x80) {
        const count = 1 << ((descriptorPacked & 7) + 1);
        palette = bytes.slice(offset, offset + count * 3);
        offset += count * 3;
      }
      if (!palette) throw new Error(T('err.gif.palette'));
      const minCodeSize = bytes[offset++];
      const blocks = readGifSubBlocks(bytes, offset);
      offset = blocks.offset;
      let indices = gifLzwDecode(blocks.data, minCodeSize, frameWidth * frameHeight);
      if (descriptorPacked & 0x40) indices = deinterlaceGif(indices, frameWidth, frameHeight);

      const rgba = new Uint8ClampedArray(frameWidth * frameHeight * 4);
      for (let i = 0; i < indices.length; i += 1) {
        const colorIndex = indices[i];
        const target = i * 4;
        rgba[target] = palette[colorIndex * 3] || 0;
        rgba[target + 1] = palette[colorIndex * 3 + 1] || 0;
        rgba[target + 2] = palette[colorIndex * 3 + 2] || 0;
        rgba[target + 3] = gce.transparent && colorIndex === gce.transparentIndex ? 0 : 255;
      }
      const frameBitmap = await bitmapFromRgba(rgba, frameWidth, frameHeight);
      let previous = null;
      if (gce.disposal === 3) previous = ctx.getImageData(0, 0, width, height);
      ctx.drawImage(frameBitmap, x, y);
      outputFrames.push(await createImageBitmap(composition));
      durations.push(gce.delay);
      if (gce.disposal === 2) ctx.clearRect(x, y, frameWidth, frameHeight);
      else if (gce.disposal === 3 && previous) ctx.putImageData(previous, 0, 0);
      frameBitmap.close();
      parsedFrames += 1;
      if (parsedFrames > 500) throw new Error(T('err.tooManyFrames'));
      if (onProgress) onProgress(Math.min(0.95, 0.08 + parsedFrames * 0.015), T('progress.gifDecode', parsedFrames));
      if (parsedFrames % 8 === 0) await Utils.nextFrame();
      gce = { disposal: 0, delay: 100, transparent: false, transparentIndex: 0 };
    }
    if (!outputFrames.length) throw new Error(T('err.gif.noFrames'));
    return { frames: outputFrames, durations, width, height };
  }

  function riffChunk(type, payload) {
    const result = new Uint8Array(8 + payload.length + (payload.length & 1));
    Utils.writeAscii(result, 0, type);
    Utils.writeUint32LE(result, 4, payload.length);
    result.set(payload, 8);
    return result;
  }

  function buildStillWebP(frameData, width, height) {
    let hasAlpha = false;
    let offset = 0;
    while (offset + 8 <= frameData.length) {
      const type = ascii(frameData, offset, 4);
      const size = u32le(frameData, offset + 4);
      if (type === 'ALPH' || type === 'VP8L') hasAlpha = true;
      offset += 8 + size + (size & 1);
    }
    const vp8x = new Uint8Array(10);
    vp8x[0] = hasAlpha ? 0x10 : 0;
    Utils.writeUint24LE(vp8x, 4, width - 1);
    Utils.writeUint24LE(vp8x, 7, height - 1);
    const payload = concatParts([riffChunk('VP8X', vp8x), frameData]);
    const riff = new Uint8Array(12 + payload.length);
    Utils.writeAscii(riff, 0, 'RIFF');
    Utils.writeUint32LE(riff, 4, 4 + payload.length);
    Utils.writeAscii(riff, 8, 'WEBP');
    riff.set(payload, 12);
    return new Blob([riff], { type: 'image/webp' });
  }

  async function decodeAnimatedWebP(bytes, onProgress) {
    if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') throw new Error(T('err.webp.signature'));
    let width = 0; let height = 0;
    const frameRecords = [];
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = ascii(bytes, offset, 4);
      const size = u32le(bytes, offset + 4);
      const payloadStart = offset + 8;
      const payloadEnd = payloadStart + size;
      if (payloadEnd > bytes.length) break;
      const payload = bytes.slice(payloadStart, payloadEnd);
      if (type === 'VP8X') {
        width = u24le(payload, 4) + 1;
        height = u24le(payload, 7) + 1;
      } else if (type === 'ANMF') {
        frameRecords.push({
          x: u24le(payload, 0) * 2,
          y: u24le(payload, 3) * 2,
          width: u24le(payload, 6) + 1,
          height: u24le(payload, 9) + 1,
          delay: Math.max(10, u24le(payload, 12) || 100),
          blend: (payload[15] >> 1) & 1,
          dispose: payload[15] & 1,
          data: payload.slice(16),
        });
      }
      offset = payloadEnd + (size & 1);
    }
    if (!width || !height || !frameRecords.length) throw new Error(T('err.webp.noFrames'));
    if (frameRecords.length > 500) throw new Error(T('err.tooManyFrames'));

    const composition = makeCanvas(width, height);
    const ctx = composition.getContext('2d', { alpha: true, willReadFrequently: true });
    const outputFrames = [];
    const durations = [];
    for (let index = 0; index < frameRecords.length; index += 1) {
      const frame = frameRecords[index];
      if (onProgress) onProgress(0.1 + (index / frameRecords.length) * 0.85, T('progress.webpDecode', index + 1, frameRecords.length));
      const frameBitmap = await createImageBitmap(buildStillWebP(frame.data, frame.width, frame.height));
      if (frame.blend === 1) ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
      ctx.drawImage(frameBitmap, frame.x, frame.y);
      outputFrames.push(await createImageBitmap(composition));
      durations.push(frame.delay);
      if (frame.dispose === 1) ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
      frameBitmap.close();
      if (index % 5 === 0) await Utils.nextFrame();
    }
    return { frames: outputFrames, durations, width, height };
  }

  async function decode(file, mime, onProgress) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length >= 8 && ascii(bytes, 1, 3) === 'PNG') return decodeAPNG(bytes, onProgress);
    if (bytes.length >= 6 && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return decodeGIF(bytes, onProgress);
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return decodeAnimatedWebP(bytes, onProgress);
    throw new Error(T('err.decoder.unsupported', mime || file.type || T('err.decoder.thisFormat')));
  }

  NS.AnimationDecoders = { decode, decodeAPNG, decodeGIF, decodeAnimatedWebP };
}(window));
