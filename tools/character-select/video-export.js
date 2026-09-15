"use strict";

// Offline, silent video export. Each requested frame is rendered and encoded before
// the file is offered for download; wall-clock playback never determines the count.
// Format references (the implementation below has no runtime dependencies):
// https://learn.microsoft.com/en-us/windows/win32/directshow/avi-riff-file-reference
// https://www.w3.org/TR/webcodecs/#latency-mode
// https://www.w3.org/TR/webcodecs-avc-codec-registration/
// https://developer.apple.com/documentation/quicktime-file-format/sample_atoms
(() => {
  const MAX_FILE_BYTES = 1024 * 1024 * 1024;
  /* 訊息在拋出時才取譯文，語言切換後不會留著舊的。 */
  const MP4_UNAVAILABLE = () => T("video.err.mp4Unavailable");
  const TOO_LARGE = () => T("video.err.tooLarge");
  const ascii = text => Uint8Array.from(text, character => character.charCodeAt(0));
  const zeros = length => new Uint8Array(length);
  const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

  function concat(parts) {
    const result = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.byteLength;
    }
    return result;
  }

  function numbers(values, bytes = 4, littleEndian = false) {
    const result = new Uint8Array(values.length * bytes);
    const view = new DataView(result.buffer);
    values.forEach((value, index) => {
      if (bytes === 2) view.setUint16(index * bytes, value, littleEndian);
      else view.setUint32(index * bytes, value, littleEndian);
    });
    return result;
  }

  const be32 = (...values) => numbers(values);
  const be16 = (...values) => numbers(values, 2);
  const le32 = (...values) => numbers(values, 4, true);
  const le16 = (...values) => numbers(values, 2, true);

  function checkCancelled(check) {
    if (check && check()) {
      const error = new Error(T("video.err.cancelled"));
      error.name = "AbortError";
      throw error;
    }
  }

  function validateOptions(options, mp4 = false) {
    const { width, height, fps, frameCount, renderFrame } = options;
    if (![width, height, fps, frameCount].every(Number.isInteger)
      || width < 1 || height < 1 || width > 32767 || height > 32767
      || fps < 1 || fps > 120 || frameCount < 1 || frameCount > 1000000
      || typeof renderFrame !== "function") {
      throw new Error(T("video.err.badOptions"));
    }
    if (mp4 && (width % 2 || height % 2)) {
      throw new Error(T("video.err.oddSize"));
    }
    checkCancelled(options.checkCancelled);
  }

  async function getFrame(options, index) {
    checkCancelled(options.checkCancelled);
    const canvas = await options.renderFrame(index);
    checkCancelled(options.checkCancelled);
    if (!canvas || canvas.width !== options.width || canvas.height !== options.height) {
      throw new Error(T("video.err.frameSize"));
    }
    return canvas;
  }

  // RIFF chunks store little-endian lengths and pad odd payloads to a WORD boundary.
  function riffChunk(type, data) {
    return concat([ascii(type), le32(data.byteLength), data, zeros(data.byteLength % 2)]);
  }

  function riffList(type, parts) {
    return riffChunk("LIST", concat([ascii(type), ...parts]));
  }

  function aviHeader(width, height, fps, frameCount, largestFrame) {
    const avih = riffChunk("avih", le32(
      Math.round(1000000 / fps), Math.min(0xffffffff, (largestFrame + 9) * fps),
      0, 0x10, frameCount, 0, 1, largestFrame, width, height, 0, 0, 0, 0
    ));
    const strh = riffChunk("strh", concat([
      ascii("vidsMJPG"), le32(0), le16(0, 0),
      le32(0, 1, fps, 0, frameCount, largestFrame, 0xffffffff, 0),
      le16(0, 0, width, height)
    ]));
    const strf = riffChunk("strf", concat([
      le32(40, width, height), le16(1, 24), ascii("MJPG"),
      le32(width * height * 3, 0, 0, 0, 0)
    ]));
    return riffList("hdrl", [avih, riffList("strl", [strh, strf])]);
  }

  async function jpegBlob(canvas) {
    let blob;
    if (typeof canvas.convertToBlob === "function") {
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
    } else {
      blob = await new Promise((resolve, reject) => {
        try {
          canvas.toBlob(resolve, "image/jpeg", 0.95);
        } catch (error) {
          reject(error);
        }
      });
    }
    if (!blob || blob.type !== "image/jpeg" || !blob.size) {
      throw new Error(T("video.err.jpeg"));
    }
    return blob;
  }

  async function encodeAVI(options) {
    validateOptions(options);
    const { width, height, fps, frameCount, onProgress } = options;
    const frames = [];
    const index = new Uint8Array(frameCount * 16);
    const indexView = new DataView(index.buffer);
    let movieSize = 0;
    let largestFrame = 0;
    for (let i = 0; i < frameCount; i += 1) {
      const frame = await jpegBlob(await getFrame(options, i));
      checkCancelled(options.checkCancelled);
      const paddedSize = frame.size + frame.size % 2;
      if (movieSize + paddedSize + 8 + index.byteLength + 256 > MAX_FILE_BYTES) throw new Error(TOO_LARGE());
      // idx1 offsets point at each 00dc chunk header, relative to the movi FOURCC.
      index.set(ascii("00dc"), i * 16);
      indexView.setUint32(i * 16 + 4, 0x10, true);
      indexView.setUint32(i * 16 + 8, movieSize + 4, true);
      indexView.setUint32(i * 16 + 12, frame.size, true);
      frames.push(ascii("00dc"), le32(frame.size), frame);
      if (frame.size % 2) frames.push(zeros(1));
      movieSize += 8 + paddedSize;
      largestFrame = Math.max(largestFrame, frame.size);
      onProgress?.(i + 1, frameCount);
      if ((i + 1) % 8 === 0) await nextTask();
    }
    checkCancelled(options.checkCancelled);
    const header = aviHeader(width, height, fps, frameCount, largestFrame);
    const fileSize = 12 + header.byteLength + 12 + movieSize + 8 + index.byteLength;
    if (fileSize > MAX_FILE_BYTES) throw new Error(TOO_LARGE());
    return new Blob([
      ascii("RIFF"), le32(fileSize - 8), ascii("AVI "), header,
      ascii("LIST"), le32(movieSize + 4), ascii("movi"), ...frames,
      ascii("idx1"), le32(index.byteLength), index
    ], { type: "video/x-msvideo" });
  }

  // A single video track, constant frame duration, all samples independently
  // decodable. Thus presentation order equals decode order and ctts is unnecessary.
  const box = (type, ...parts) => concat([
    be32(8 + parts.reduce((length, part) => length + part.byteLength, 0)), ascii(type), ...parts
  ]);
  const fullBox = (type, flags, ...parts) => box(type, be32(flags), ...parts);
  const matrix = () => be32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);

  function makeMovie(samples, description, width, height, fps, dataOffset) {
    const count = samples.length;
    const mvhd = fullBox("mvhd", 0,
      be32(0, 0, fps, count, 0x10000), be16(0x100, 0), zeros(8),
      matrix(), zeros(24), be32(2)
    );
    const tkhd = fullBox("tkhd", 7,
      be32(0, 0, 1, 0, count), zeros(8), be16(0, 0, 0, 0),
      matrix(), be32(width * 65536, height * 65536)
    );
    const mdhd = fullBox("mdhd", 0, be32(0, 0, fps, count), be16(0x55c4, 0));
    const hdlr = fullBox("hdlr", 0, be32(0), ascii("vide"), zeros(12), ascii("Video\0"));
    const avc1 = box("avc1",
      zeros(6), be16(1), zeros(16), be16(width, height),
      be32(0x480000, 0x480000, 0), be16(1), zeros(32), be16(24, 0xffff),
      box("avcC", description)
    );
    const sizes = numbers(samples.map(sample => sample.size));
    const keyframes = new Uint8Array(count * 4);
    const keyframeView = new DataView(keyframes.buffer);
    for (let i = 0; i < count; i += 1) keyframeView.setUint32(i * 4, i + 1);
    const stbl = box("stbl",
      fullBox("stsd", 0, be32(1), avc1),
      fullBox("stts", 0, be32(1, count, 1)),
      fullBox("stsc", 0, be32(1, 1, count, 1)),
      fullBox("stsz", 0, be32(0, count), sizes),
      fullBox("stco", 0, be32(1, dataOffset)),
      fullBox("stss", 0, be32(count), keyframes)
    );
    const dinf = box("dinf", fullBox("dref", 0, be32(1), fullBox("url ", 1)));
    const minf = box("minf", fullBox("vmhd", 1, be16(0, 0, 0, 0)), dinf, stbl);
    return box("moov", mvhd, box("trak", tkhd, box("mdia", mdhd, hdlr, minf)));
  }

  async function findMP4Config({ width, height, fps }) {
    if (typeof globalThis.VideoEncoder !== "function" || typeof globalThis.VideoFrame !== "function"
      || !Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(fps)
      || width < 2 || height < 2 || width % 2 || height % 2 || fps < 1 || fps > 120) return null;
    const blocks = Math.ceil(width / 16) * Math.ceil(height / 16);
    const bitrate = Math.round(Math.min(50000000, Math.max(2000000, width * height * fps * 0.6)));
    // H.264 level limits: level_idc, MaxFS, MaxMBPS, baseline/main MaxBR (bits/s).
    const levels = [
      [30, 1620, 40500, 10000000], [31, 3600, 108000, 14000000],
      [32, 5120, 216000, 20000000], [40, 8192, 245760, 20000000],
      [41, 8192, 245760, 50000000], [42, 8704, 522240, 50000000],
      [50, 22080, 589824, 135000000], [51, 36864, 983040, 240000000],
      [52, 36864, 2073600, 240000000]
    ];
    for (const [level, maxBlocks, maxBlockRate, maxBitrate] of levels) {
      if (blocks > maxBlocks || blocks * fps > maxBlockRate || bitrate > maxBitrate) continue;
      for (const profile of ["4200", "4d00", "6400"]) {
        const config = {
          codec: `avc1.${profile}${level.toString(16).padStart(2, "0")}`,
          width, height, framerate: fps, bitrate,
          bitrateMode: "variable", latencyMode: "quality",
          hardwareAcceleration: "no-preference", avc: { format: "avc" }
        };
        try {
          const support = await VideoEncoder.isConfigSupported(config);
          if (support.supported) return config;
        } catch (_) {
          // Unsupported profiles/configurations are expected on some browsers.
        }
      }
    }
    return null;
  }

  const supportsMP4 = async options => Boolean(await findMP4Config(options));

  function copyDescription(description) {
    if (ArrayBuffer.isView(description)) {
      return new Uint8Array(description.buffer, description.byteOffset, description.byteLength).slice();
    }
    return new Uint8Array(description).slice();
  }

  // Flush completes a bounded batch and delivers all pending output. Poll only for
  // cancellation/error responsiveness; no frame timing is based on this interval.
  async function flushEncoder(encoder, check, getError) {
    let timer;
    const deadline = Date.now() + 60000;
    try {
      await new Promise((resolve, reject) => {
        timer = setInterval(() => {
          try {
            checkCancelled(check);
            if (getError()) throw getError();
            if (Date.now() > deadline) throw new Error(T("video.err.noResponse"));
          } catch (error) {
            reject(error);
          }
        }, 50);
        encoder.flush().then(resolve, reject);
      });
    } finally {
      clearInterval(timer);
    }
    checkCancelled(check);
    if (getError()) throw getError();
  }

  async function encodeMP4(options) {
    validateOptions(options, true);
    const { width, height, fps, frameCount, onProgress } = options;
    const config = await findMP4Config(options);
    checkCancelled(options.checkCancelled);
    if (!config) throw new Error(MP4_UNAVAILABLE());
    const samples = new Array(frameCount);
    let description = null;
    let failure = null;
    let encodedCount = 0;
    let mediaSize = 0;
    let encoder;
    try {
      encoder = new VideoEncoder({
        output(chunk, metadata) {
          if (failure) return;
          try {
            checkCancelled(options.checkCancelled);
            const index = Math.round(chunk.timestamp * fps / 1000000);
            if (index < 0 || index >= frameCount || samples[index]
              || chunk.timestamp !== Math.round(index * 1000000 / fps) || chunk.type !== "key") {
              throw new Error(T("video.err.frameOrder"));
            }
            if (metadata?.decoderConfig?.description) {
              const nextDescription = copyDescription(metadata.decoderConfig.description);
              if (nextDescription.length < 7 || nextDescription[0] !== 1) {
                throw new Error(T("video.err.noConfig"));
              }
              if (description && (description.length !== nextDescription.length
                || description.some((byte, i) => byte !== nextDescription[i]))) {
                throw new Error(T("video.err.configChanged"));
              }
              description = nextDescription;
            }
            if (!chunk.byteLength) throw new Error(T("video.err.emptyChunk"));
            mediaSize += chunk.byteLength;
            if (mediaSize + frameCount * 8 + 2048 > MAX_FILE_BYTES) throw new Error(TOO_LARGE());
            const bytes = new Uint8Array(chunk.byteLength);
            chunk.copyTo(bytes);
            samples[index] = { blob: new Blob([bytes]), size: bytes.byteLength };
            encodedCount += 1;
          } catch (error) {
            failure = error;
          }
        },
        error(error) {
          failure = new Error(T("video.err.encodeFailed", error.message));
        }
      });
      encoder.configure(config);
      for (let i = 0; i < frameCount; i += 1) {
        if (failure) throw failure;
        const canvas = await getFrame(options, i);
        if (failure) throw failure;
        const timestamp = Math.round(i * 1000000 / fps);
        const duration = Math.round((i + 1) * 1000000 / fps) - timestamp;
        const frame = new VideoFrame(canvas, { timestamp, duration, alpha: "discard" });
        try {
          // quality forbids deadline-based frame dropping; IDR frames remove all
          // reordering dependencies and make every exported frame seekable.
          encoder.encode(frame, { keyFrame: true });
        } finally {
          frame.close();
        }
        if ((i + 1) % 8 === 0 || i + 1 === frameCount) {
          await flushEncoder(encoder, options.checkCancelled, () => failure);
          if (encodedCount !== i + 1) {
            throw new Error(T("video.err.dropped", encodedCount, i + 1));
          }
          onProgress?.(encodedCount, frameCount);
          await nextTask();
        }
      }
      checkCancelled(options.checkCancelled);
      if (encodedCount !== frameCount || samples.includes(undefined) || !description) {
        throw new Error(T("video.err.incomplete"));
      }
      const ftyp = box("ftyp", ascii("isom"), be32(0x200), ascii("isomiso2avc1mp41"));
      const temporaryMovie = makeMovie(samples, description, width, height, fps, 0);
      const dataOffset = ftyp.byteLength + temporaryMovie.byteLength + 8;
      const movie = makeMovie(samples, description, width, height, fps, dataOffset);
      if (dataOffset + mediaSize > MAX_FILE_BYTES) throw new Error(TOO_LARGE());
      return new Blob([
        ftyp, movie, be32(mediaSize + 8), ascii("mdat"), ...samples.map(sample => sample.blob)
      ], { type: "video/mp4" });
    } catch (error) {
      if (error.name === "NotSupportedError" || error.name === "SecurityError") throw new Error(MP4_UNAVAILABLE());
      throw error;
    } finally {
      if (encoder && encoder.state !== "closed") encoder.close();
    }
  }

  globalThis.StudioVideoExport = Object.freeze({ encodeAVI, encodeMP4, supportsMP4 });
})();
