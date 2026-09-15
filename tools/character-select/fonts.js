"use strict";

// Browser-native, offline font loading. https://www.w3.org/TR/css-font-loading-3/
(() => {
  const MAX_BYTES = 20 * 1024 * 1024;
  /* 合輯追加繁中字型：介面改為繁體中文後，台灣的電腦上要有字可用。 */
  const FALLBACK = 'Inter, Pretendard, "Noto Sans KR", "Microsoft JhengHei", "PingFang TC", Arial, sans-serif';
  const GENERICS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);
  const formats = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" };
  const parsedSources = new Map();
  const faces = new Map();

  function cssString(value) {
    return '"' + String(value).replace(/["\\\x00-\x1f\x7f<>]/g,
      character => "\\" + character.charCodeAt(0).toString(16) + " ") + '"';
  }

  function hash(value) {
    let first = 2166136261;
    let second = 2246822519;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 3266489917);
    }
    return (first >>> 0).toString(16).padStart(8, "0")
      + (second >>> 0).toString(16).padStart(8, "0") + "_" + value.length;
  }

  function binaryFormat(bytes) {
    const signature = String.fromCharCode(...bytes.subarray(0, 4));
    if (signature === "wOFF") return "woff";
    if (signature === "wOF2") return "woff2";
    if (signature === "OTTO") return "otf";
    if (signature === "true" || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return "ttf";
    throw new Error(T("font.err.unsupported"));
  }

  function parseSource(source) {
    if (parsedSources.has(source)) return parsedSources.get(source);
    if (source.length > Math.ceil(MAX_BYTES / 3) * 4 + 64) throw new Error(T("font.err.tooBig"));
    const match = /^data:font\/(ttf|otf|woff|woff2);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
    if (!match || match[2].length % 4 !== 0) throw new Error(T("font.err.badData"));
    const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
    const size = match[2].length / 4 * 3 - padding;
    if (size < 12 || size > MAX_BYTES) throw new Error(T("font.err.emptyData"));
    let header;
    try { header = Uint8Array.from(atob(match[2].slice(0, 16)), character => character.charCodeAt(0)); }
    catch (_) { throw new Error(T("font.err.readData")); }
    if (binaryFormat(header) !== match[1]) throw new Error(T("font.err.formatMismatch"));
    const parsed = { format: match[1], base64: match[2], family: "StudioFont_" + hash(source) };
    parsedSources.set(source, parsed);
    if (parsedSources.size > 4) parsedSources.delete(parsedSources.keys().next().value);
    return parsed;
  }

  function normalize(value = {}) {
    const family = String(value?.family || "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 160);
    const source = value?.src == null ? "" : value.src;
    if (typeof source !== "string") throw new Error(T("font.err.badSource"));
    if (source) parseSource(source);
    const fileName = source ? String(value?.fileName || T("font.userFont")).split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200) : "";
    return { family, fileName, src: source };
  }

  function keyFor(value) {
    return value.src ? "file:" + value.src : value.family ? "local:" + value.family : "";
  }
  const sameValue = (a, b) => a && b && a.family === b.family && a.fileName === b.fileName && a.src === b.src;

  function familyFor(value) {
    if (value.src) return parseSource(value.src).family;
    if (!value.family || GENERICS.has(value.family)) return value.family;
    return "StudioLocal_" + hash(value.family);
  }

  function getCanvasFamily(value) {
    const font = normalize(value);
    const family = familyFor(font);
    if (!family) return FALLBACK;
    return (GENERICS.has(family) ? family : cssString(family)) + ", " + FALLBACK;
  }

  function getEmbedCss(value) {
    const font = normalize(value);
    if (!font.src && (!font.family || GENERICS.has(font.family))) return "";
    const source = font.src
      ? `url(${cssString(font.src)}) format(${cssString(formats[parseSource(font.src).format])})`
      : `local(${cssString(font.family)})`;
    return `@font-face{font-family:${cssString(familyFor(font))};src:${source};font-style:normal;font-weight:normal;font-display:block;}`;
  }

  async function ready(value) {
    const font = normalize(value);
    if (!font.src && (!font.family || GENERICS.has(font.family))) return font;
    if (typeof FontFace !== "function" || !document.fonts) throw new Error(T("font.err.noFontFace"));
    const key = keyFor(font);
    let entry = faces.get(key);
    if (!entry) {
      let source;
      if (font.src) {
        const binary = atob(parseSource(font.src).base64);
        source = Uint8Array.from(binary, character => character.charCodeAt(0));
      } else source = `local(${cssString(font.family)})`;
      const face = new FontFace(familyFor(font), source, { display: "block" });
      entry = { face, loaded: false, promise: null };
      faces.set(key, entry);
      let timer;
      entry.promise = Promise.race([
        face.load(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(T("font.err.timeout"))), 30000); })
      ]).then(() => {
        document.fonts.add(face);
        entry.loaded = true;
      }).catch(error => {
        if (faces.get(key) === entry) faces.delete(key);
        document.fonts.delete(face);
        throw new Error(font.src
          ? T("font.err.loadFile")
          : T("font.err.notInstalled", font.family),
        { cause: error });
      }).finally(() => clearTimeout(timer));
    }
    await entry.promise;
    return font;
  }

  function releaseUnused(value) {
    const active = normalize(value);
    const keep = keyFor(active);
    for (const [key, entry] of faces) {
      if (key !== keep && entry.loaded) {
        document.fonts.delete(entry.face);
        faces.delete(key);
      }
    }
    for (const source of parsedSources.keys()) {
      if (source !== active.src) parsedSources.delete(source);
    }
  }

  async function fromFile(file) {
    if (!file || !/\.(ttf|otf|woff|woff2)$/i.test(file.name)) throw new Error(T("font.err.pickFile"));
    if (!file.size || file.size > MAX_BYTES) throw new Error(T("font.err.tooBig"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength < 12 || bytes.byteLength > MAX_BYTES) throw new Error(T("font.err.emptyFile"));
    const format = binaryFormat(bytes);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return normalize({
      family: file.name.replace(/\.(ttf|otf|woff|woff2)$/i, ""), fileName: file.name,
      src: `data:font/${format};base64,${btoa(binary)}`
    });
  }

  function create({ getValue, onChange, onReady = () => {}, onError = () => {}, onBusy = () => {}, root = document }) {
    const query = selector => root.querySelector(selector);
    const elements = {
      container: query("#fontControls"), family: query("#fontFamilyInput"), apply: query("#applyFontFamilyButton"),
      file: query("#fontFileInput"), load: query("#loadFontFileButton"), reset: query("#resetFontButton"),
      status: query("#fontStatus"), fileName: query("#fontFileName"), sample: query("#fontSample")
    };
    if (Object.values(elements).some(element => !element)) throw new Error(T("font.err.noUi"));
    const controls = [elements.family, elements.apply, elements.file, elements.load, elements.reset];
    const listeners = [];
    let pending = null;
    let serial = 0;
    let observedFont = null;
    let busy = false;
    let externalDisabled = false;
    let disposed = false;

    function setStatus(message, kind = "normal") {
      elements.status.textContent = message;
      elements.status.dataset.kind = kind;
    }
    function setBusy(value) {
      busy = value;
      controls.forEach(control => { control.disabled = externalDisabled || busy; });
      elements.container.setAttribute("aria-busy", String(busy));
      onBusy(busy);
    }
    function renderControls(font) {
      elements.family.value = font.family;
      elements.fileName.textContent = font.fileName;
      elements.fileName.hidden = !font.src;
      elements.load.textContent = T(font.src ? "font.replaceFile" : "font.loadFile");
      elements.sample.style.fontFamily = getCanvasFamily(font);
    }
    function describe(font) {
      return font.src ? T("font.status.file", font.fileName)
        : font.family ? T("font.status.installed", font.family) : T("font.status.default");
    }
    function begin(produce, commit) {
      const token = ++serial;
      setBusy(true);
      setStatus(T("font.status.loading"), "loading");
      const task = (async () => {
        const next = normalize(await produce());
        await ready(next);
        if (token !== serial || disposed) return normalize(getValue());
        observedFont = next;
        if (commit) onChange(next);
        renderControls(next);
        releaseUnused(next);
        setStatus(describe(next), next.family || next.src ? "success" : "normal");
        onReady(next);
        return next;
      })().catch(error => {
        if (token === serial && !disposed) {
          renderControls(normalize(getValue()));
          setStatus(error.message || T("font.err.generic"), "error");
          onError(error);
        }
        throw error;
      }).finally(() => {
        if (token === serial) {
          pending = null;
          if (!disposed) setBusy(false);
        }
        releaseUnused(disposed ? {} : getValue());
      });
      pending = task;
      // UI handlers may ignore the return value; export callers can still await
      // the original rejecting task and avoid rendering with a fallback font.
      task.catch(() => {});
      return task;
    }
    function applyFamily() {
      if (busy || externalDisabled || disposed) return;
      const family = elements.family.value;
      begin(() => ({ family, fileName: "", src: "" }), true);
    }
    function listen(element, event, handler) {
      element.addEventListener(event, handler);
      listeners.push(() => element.removeEventListener(event, handler));
    }
    listen(elements.apply, "click", applyFamily);
    listen(elements.family, "keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      applyFamily();
    });
    listen(elements.load, "click", () => { if (!busy && !externalDisabled) elements.file.click(); });
    listen(elements.file, "change", () => {
      const file = elements.file.files?.[0];
      elements.file.value = "";
      if (file && !busy && !externalDisabled && !disposed) begin(() => fromFile(file), true);
    });
    listen(elements.reset, "click", () => {
      if (!busy && !externalDisabled && !disposed) begin(() => ({ family: "", fileName: "", src: "" }), true);
    });

    const controller = {
      sync() {
        const font = normalize(getValue());
        if (sameValue(font, observedFont)) return pending || ready(font);
        return begin(() => font, false);
      },
      async ready() {
        if (disposed) throw new Error(T("font.err.disposed"));
        while (pending) {
          const task = pending;
          const version = serial;
          try { await task; }
          catch (error) { if (version === serial) throw error; }
        }
        return ready(getValue());
      },
      setDisabled(value) {
        externalDisabled = Boolean(value);
        controls.forEach(control => { control.disabled = externalDisabled || busy; });
      },
      destroy() {
        disposed = true;
        serial += 1;
        listeners.forEach(remove => remove());
        releaseUnused({});
      }
    };
    controller.sync();
    return controller;
  }

  globalThis.StudioFonts = Object.freeze({ create, normalize, ready, getCanvasFamily, getEmbedCss, fromFile, releaseUnused });
})();
