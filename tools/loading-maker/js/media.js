(function (global) {
  'use strict';

  const NS = global.CocoLoadingMaker = global.CocoLoadingMaker || {};
  const { Utils } = NS;

  function inferMime(name, fallback = 'image/png') {
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.apng') || lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.avif')) return 'image/avif';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    return fallback;
  }

  function isLikelyAnimated(file) {
    const type = file.type || inferMime(file.name, '');
    const lower = String(file.name || '').toLowerCase();
    return type === 'image/gif' || type === 'image/webp' || type === 'image/png'
      || lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.apng');
  }

  function staleLoadError(message) {
    const error = new Error(message);
    error.name = 'AbortError';
    error.isStaleMediaLoad = true;
    return error;
  }

  class MediaManager {
    constructor() {
      this.sourceGeneration = 0;
      this.fontGeneration = 0;
      this.source = {
        kind: 'builtin',
        frames: [],
        durations: [],
        totalDuration: 0,
        width: 0,
        height: 0,
        records: [],
        image: null,
        objectURL: null,
        warning: '',
      };
      this.font = {
        family: '',
        name: '',
        blob: null,
        objectURL: null,
        face: null,
      };
    }

    get hasUpload() {
      return this.source.kind !== 'builtin';
    }

    get frameCount() {
      return this.source.frames.length || (this.source.image ? 1 : 0);
    }

    clearSource() {
      this.sourceGeneration += 1;
      (this.source.frames || []).forEach((frame) => {
        if (frame && typeof frame.close === 'function') {
          try { frame.close(); } catch (_) { /* ignored */ }
        }
      });
      if (this.source.image && this.source.image.parentNode) this.source.image.remove();
      if (this.source.objectURL) URL.revokeObjectURL(this.source.objectURL);
      this.source = {
        kind: 'builtin',
        frames: [],
        durations: [],
        totalDuration: 0,
        width: 0,
        height: 0,
        records: [],
        image: null,
        objectURL: null,
        warning: '',
      };
    }

    discardSourceData(source) {
      (source && source.frames || []).forEach((frame) => {
        if (frame && typeof frame.close === 'function') {
          try { frame.close(); } catch (_) { /* ignored */ }
        }
      });
      if (source && source.image && source.image.parentNode) source.image.remove();
      if (source && source.objectURL) URL.revokeObjectURL(source.objectURL);
    }

    invalidatePendingLoads() {
      this.sourceGeneration += 1;
      this.fontGeneration += 1;
    }

    commitSource(source, generation) {
      if (generation !== this.sourceGeneration) {
        this.discardSourceData(source);
        throw staleLoadError(T('err.staleImage'));
      }
      this.source = source;
      return this.source;
    }

    ensureSourceGeneration(generation) {
      if (generation !== this.sourceGeneration) {
        throw staleLoadError(T('err.staleImage'));
      }
    }

    reportSourceProgress(generation, onProgress, progress, message) {
      this.ensureSourceGeneration(generation);
      if (onProgress) onProgress(progress, message);
      this.ensureSourceGeneration(generation);
    }

    async loadFiles(fileList, onProgress) {
      const files = Array.from(fileList || [])
        .filter((file) => file && (String(file.type).startsWith('image/') || /\.(apng|png|gif|webp|jpe?g|bmp|avif)$/i.test(file.name)))
        .sort((a, b) => Utils.naturalCompare(a.name, b.name));
      if (!files.length) throw new Error(T('err.noImageFiles'));

      this.clearSource();
      const generation = this.sourceGeneration;
      if (files.length === 1) {
        return this.loadSingle(files[0], onProgress, generation);
      }
      return this.loadSequence(files, onProgress, generation);
    }

    async loadCollection(fileList, onProgress) {
      const files = Array.from(fileList || [])
        .filter((file) => file && (String(file.type).startsWith('image/') || /\.(png|webp|jpe?g|bmp|avif)$/i.test(file.name)))
        .sort((a, b) => Utils.naturalCompare(a.name, b.name));
      if (!files.length) throw new Error(T('err.noStaticImageFiles'));

      this.clearSource();
      const generation = this.sourceGeneration;
      const source = await this.loadSequence(files, onProgress, generation);
      source.kind = 'collection';
      return source;
    }

    async loadSingle(file, onProgress, generation = this.sourceGeneration) {
      const reportProgress = (progress, message) => {
        this.reportSourceProgress(generation, onProgress, progress, message);
      };
      reportProgress(0.05, T('progress.checkFormat'));
      const mime = file.type || inferMime(file.name);
      const record = { name: file.name || 'character', type: mime, blob: file };
      const animatedCandidate = await this.detectAnimatedContainer(file, mime);
      this.ensureSourceGeneration(generation);

      if ('ImageDecoder' in global && isLikelyAnimated(file)) {
        try {
          const decoded = await this.decodeWithImageDecoder(file, mime, reportProgress, generation);
          const source = {
            kind: decoded.frames.length > 1 ? 'decoded-animation' : 'sequence',
            frames: decoded.frames,
            durations: decoded.durations,
            totalDuration: decoded.durations.reduce((sum, value) => sum + value, 0),
            width: decoded.width,
            height: decoded.height,
            records: [record],
            image: null,
            objectURL: null,
            warning: '',
          };
          this.commitSource(source, generation);
          reportProgress(1, decoded.frames.length > 1 ? T('progress.framesLoaded', decoded.frames.length) : T('progress.imageLoaded'));
          return this.source;
        } catch (error) {
          if (generation !== this.sourceGeneration) {
            throw staleLoadError(T('err.staleImage'));
          }
          if (error && error.isStaleMediaLoad) throw error;
          console.warn('ImageDecoder decode failed:', error);
        }
      }

      if (animatedCandidate && NS.AnimationDecoders) {
        try {
          const decoded = await NS.AnimationDecoders.decode(file, mime, (progress, message) => {
            if (generation === this.sourceGeneration) reportProgress(progress, message);
          });
          const source = {
            kind: decoded.frames.length > 1 ? 'decoded-animation' : 'sequence',
            frames: decoded.frames,
            durations: decoded.durations,
            totalDuration: decoded.durations.reduce((sum, value) => sum + value, 0),
            width: decoded.width,
            height: decoded.height,
            records: [record],
            image: null,
            objectURL: null,
            warning: '',
          };
          this.commitSource(source, generation);
          reportProgress(1, T('progress.framesLoadedBuiltin', decoded.frames.length));
          return this.source;
        } catch (error) {
          if (generation !== this.sourceGeneration) {
            throw staleLoadError(T('err.staleImage'));
          }
          if (error && error.isStaleMediaLoad) throw error;
          console.warn('Built-in animation decoder failed:', error);
        }
      }

      if (!animatedCandidate) {
        try {
          const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
          const source = {
            kind: 'sequence', frames: [bitmap], durations: [125], totalDuration: 125,
            width: bitmap.width, height: bitmap.height, records: [record],
            image: null, objectURL: null, warning: '',
          };
          this.commitSource(source, generation);
          reportProgress(1, T('progress.imageLoaded'));
          return this.source;
        } catch (error) {
          if (generation !== this.sourceGeneration) {
            throw staleLoadError(T('err.staleImage'));
          }
          if (error && error.isStaleMediaLoad) throw error;
          console.warn('createImageBitmap failed:', error);
        }
      }

      const objectURL = URL.createObjectURL(file);
      let image;
      try {
        image = await this.loadHTMLImage(objectURL);
      } catch (error) {
        URL.revokeObjectURL(objectURL);
        if (generation !== this.sourceGeneration) {
          throw staleLoadError(T('err.staleImage'));
        }
        throw error;
      }
      this.attachNativeImage(image);
      const source = {
        kind: 'native-animation', frames: [], durations: [], totalDuration: 0,
        width: image.naturalWidth || image.width, height: image.naturalHeight || image.height,
        records: [record], image, objectURL,
        warning: 'warn.liveCapture', /* 交由 app.js 以 T() 顯示 */
      };
      this.commitSource(source, generation);
      reportProgress(1, T('progress.browserAnimation'));
      return this.source;
    }

    async detectAnimatedContainer(file, mime) {
      const type = mime || inferMime(file.name, '');
      const lower = String(file.name || '').toLowerCase();
      if (type === 'image/gif' || lower.endsWith('.gif') || lower.endsWith('.apng')) return true;
      if (type !== 'image/png' && type !== 'image/webp' && !lower.endsWith('.png') && !lower.endsWith('.webp')) return false;
      try {
        const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer());
        const needle = type === 'image/webp' || lower.endsWith('.webp') ? [65, 78, 73, 77] : [97, 99, 84, 76];
        for (let i = 0; i <= bytes.length - needle.length; i += 1) {
          let matched = true;
          for (let j = 0; j < needle.length; j += 1) {
            if (bytes[i + j] !== needle[j]) { matched = false; break; }
          }
          if (matched) return true;
        }
      } catch (_) { /* use extension fallback */ }
      return false;
    }

    attachNativeImage(image) {
      image.setAttribute('aria-hidden', 'true');
      image.style.position = 'fixed';
      image.style.left = '-10000px';
      image.style.top = '0';
      image.style.width = `${Math.max(1, image.naturalWidth || image.width)}px`;
      image.style.height = `${Math.max(1, image.naturalHeight || image.height)}px`;
      image.style.opacity = '0.001';
      image.style.pointerEvents = 'none';
      image.style.zIndex = '-1';
      document.body.appendChild(image);
    }

    async restartNativeAnimation() {
      if (this.source.kind !== 'native-animation' || !this.source.objectURL) return this.source.image;
      const previous = this.source.image;
      const image = await this.loadHTMLImage(this.source.objectURL);
      this.attachNativeImage(image);
      if (previous && previous.parentNode) previous.remove();
      this.source.image = image;
      this.source.width = image.naturalWidth || image.width;
      this.source.height = image.naturalHeight || image.height;
      return image;
    }

    async loadSequence(files, onProgress, generation = this.sourceGeneration) {
      const frames = [];
      const records = [];
      let width = 0;
      let height = 0;
      try {
        for (let i = 0; i < files.length; i += 1) {
          this.reportSourceProgress(generation, onProgress, i / files.length, T('progress.readImages', i + 1, files.length));
          const file = files[i];
          const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
          frames.push(bitmap);
          this.ensureSourceGeneration(generation);
          records.push({ name: file.name || `frame-${i + 1}.png`, type: file.type || inferMime(file.name), blob: file });
          width = Math.max(width, bitmap.width);
          height = Math.max(height, bitmap.height);
          if (i % 12 === 0) {
            await Utils.nextFrame();
            this.ensureSourceGeneration(generation);
          }
        }
      } catch (error) {
        frames.forEach((frame) => {
          if (frame && typeof frame.close === 'function') {
            try { frame.close(); } catch (_) { /* ignored */ }
          }
        });
        if (generation !== this.sourceGeneration) {
          throw staleLoadError(T('err.staleImage'));
        }
        throw error;
      }
      if (generation !== this.sourceGeneration) {
        frames.forEach((frame) => {
          if (frame && typeof frame.close === 'function') {
            try { frame.close(); } catch (_) { /* ignored */ }
          }
        });
        throw staleLoadError(T('err.staleImage'));
      }
      this.source = {
        kind: 'sequence', frames, durations: frames.map(() => 125), totalDuration: frames.length * 125,
        width, height, records, image: null, objectURL: null, warning: '',
      };
      this.reportSourceProgress(generation, onProgress, 1, T('progress.sequenceLoaded', frames.length));
      return this.source;
    }

    async decodeWithImageDecoder(file, mime, onProgress, generation = this.sourceGeneration) {
      const type = mime || inferMime(file.name);
      this.ensureSourceGeneration(generation);
      if (typeof ImageDecoder.isTypeSupported === 'function') {
        const supported = await ImageDecoder.isTypeSupported(type);
        this.ensureSourceGeneration(generation);
        if (!supported) throw new Error(T('err.imageDecoder', type));
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.ensureSourceGeneration(generation);
      const decoder = new ImageDecoder({ data: bytes, type, preferAnimation: true });
      const frames = [];
      const durations = [];
      let width = 0;
      let height = 0;

      try {
        await decoder.tracks.ready;
        this.ensureSourceGeneration(generation);
        const track = decoder.tracks.selectedTrack;
        if (!track) throw new Error(T('err.noImageTrack'));
        const frameCount = Math.max(1, Math.min(track.frameCount || 1, 500));
        for (let i = 0; i < frameCount; i += 1) {
          this.reportSourceProgress(generation, onProgress, 0.08 + (i / frameCount) * 0.86, T('progress.splitFrames', i + 1, frameCount));
          const result = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
          const image = result.image;
          try {
            this.ensureSourceGeneration(generation);
            const duration = Number(image.duration);
            const imageWidth = image.displayWidth || image.codedWidth;
            const imageHeight = image.displayHeight || image.codedHeight;
            const bitmap = await createImageBitmap(image);
            frames.push(bitmap);
            this.ensureSourceGeneration(generation);
            durations.push(Number.isFinite(duration) && duration > 0 ? Math.max(10, duration / 1000) : 100);
            width = Math.max(width, imageWidth || bitmap.width);
            height = Math.max(height, imageHeight || bitmap.height);
          } finally {
            image.close();
          }
          if (i % 10 === 0) {
            await Utils.nextFrame();
            this.ensureSourceGeneration(generation);
          }
        }
      } catch (error) {
        frames.forEach((frame) => { try { frame.close(); } catch (_) { /* ignored */ } });
        if (generation !== this.sourceGeneration && (!error || !error.isStaleMediaLoad)) {
          throw staleLoadError(T('err.staleImage'));
        }
        throw error;
      } finally {
        decoder.close();
      }
      return { frames, durations, width, height };
    }

    loadHTMLImage(url) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(T('err.imageParse')));
        image.src = url;
      });
    }

    getFrameAt(timeSeconds, characterState) {
      const source = this.source;
      if (source.kind === 'builtin') return null;
      if (source.kind === 'native-animation') return source.image;
      if (!source.frames.length) return null;
      if (source.frames.length === 1) return source.frames[0];

      const speed = Utils.clamp(characterState.speed, 0.05, 8);
      if (characterState.useOriginalTiming && source.totalDuration > 0 && source.durations.length === source.frames.length) {
        const timeMs = Utils.mod(timeSeconds * 1000 * speed, source.totalDuration);
        let cursor = 0;
        for (let i = 0; i < source.frames.length; i += 1) {
          cursor += source.durations[i];
          if (timeMs < cursor) return source.frames[i];
        }
        return source.frames[source.frames.length - 1];
      }
      const fps = Utils.clamp(characterState.frameFps, 1, 60);
      const index = Math.floor(timeSeconds * fps * speed) % source.frames.length;
      return source.frames[index];
    }

    getFrameByIndex(index) {
      const source = this.source;
      if (source.kind === 'builtin') return null;
      if (source.kind === 'native-animation') return source.image;
      if (!source.frames.length) return null;
      const safeIndex = Math.floor(Number(index) || 0);
      return source.frames[Utils.mod(safeIndex, source.frames.length)];
    }

    getSourceAspectAt(index) {
      const frame = this.getFrameByIndex(index);
      if (!frame) return 1;
      const width = frame.displayWidth || frame.videoWidth || frame.naturalWidth || frame.width || this.source.width;
      const height = frame.displayHeight || frame.videoHeight || frame.naturalHeight || frame.height || this.source.height;
      return width > 0 && height > 0 ? width / height : 1;
    }

    getSourceAspect() {
      if (this.source.width > 0 && this.source.height > 0) return this.source.width / this.source.height;
      return 1;
    }

    async serializeSource() {
      if (!this.hasUpload || !this.source.records.length) return null;
      const files = [];
      for (const record of this.source.records) {
        files.push({
          name: record.name,
          type: record.type || record.blob.type || inferMime(record.name),
          dataURL: await Utils.blobToDataURL(record.blob),
        });
      }
      return { files };
    }

    async restoreSource(payload, onProgress) {
      if (!payload || !Array.isArray(payload.files) || !payload.files.length) {
        this.clearSource();
        return this.source;
      }
      const files = payload.files.map((item, index) => {
        const blob = Utils.dataURLToBlob(item.dataURL);
        return new File([blob], item.name || `frame-${index + 1}`, { type: item.type || blob.type || inferMime(item.name) });
      });
      return this.loadFiles(files, onProgress);
    }

    async restoreCollection(payload, onProgress) {
      if (!payload || !Array.isArray(payload.files) || !payload.files.length) {
        this.clearSource();
        return this.source;
      }
      const files = payload.files.map((item, index) => {
        const blob = Utils.dataURLToBlob(item.dataURL);
        return new File([blob], item.name || `loader-image-${index + 1}.png`, { type: item.type || blob.type || inferMime(item.name) });
      });
      return this.loadCollection(files, onProgress);
    }

    clearFont() {
      this.fontGeneration += 1;
      if (this.font.face && document.fonts && typeof document.fonts.delete === 'function') {
        try { document.fonts.delete(this.font.face); } catch (_) { /* ignored */ }
      }
      if (this.font.objectURL) URL.revokeObjectURL(this.font.objectURL);
      this.font = { family: '', name: '', blob: null, objectURL: null, face: null };
    }

    async loadFontFile(file, requestedFamily = 'CocoUserFont') {
      if (!file) throw new Error(T('err.noFontFile'));
      this.clearFont();
      const generation = this.fontGeneration;
      const family = requestedFamily || 'CocoUserFont';
      const objectURL = URL.createObjectURL(file);
      let face = null;
      try {
        face = new FontFace(family, `url(${objectURL})`);
        await face.load();
        if (generation !== this.fontGeneration) {
          throw staleLoadError(T('err.staleFont'));
        }
        document.fonts.add(face);
        this.font = { family, name: file.name || 'local-font', blob: file, objectURL, face };
        return family;
      } catch (error) {
        if (face && document.fonts && typeof document.fonts.delete === 'function') {
          try { document.fonts.delete(face); } catch (_) { /* ignored */ }
        }
        URL.revokeObjectURL(objectURL);
        if (generation !== this.fontGeneration && (!error || !error.isStaleMediaLoad)) {
          throw staleLoadError(T('err.staleFont'));
        }
        throw error;
      }
    }

    async serializeFont() {
      if (!this.font.blob) return null;
      return {
        family: this.font.family,
        name: this.font.name,
        type: this.font.blob.type || 'font/woff2',
        dataURL: await Utils.blobToDataURL(this.font.blob),
      };
    }

    async restoreFont(payload) {
      if (!payload || !payload.dataURL) {
        this.clearFont();
        return '';
      }
      const blob = Utils.dataURLToBlob(payload.dataURL);
      const file = new File([blob], payload.name || 'project-font', { type: payload.type || blob.type });
      return this.loadFontFile(file, payload.family || 'CocoUserFont');
    }
  }

  NS.MediaManager = MediaManager;
  NS.inferMime = inferMime;
}(window));
