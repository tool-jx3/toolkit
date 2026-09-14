/*!
 * app.v1.js - 場景轉換素材產生器（瀏覽器版）
 *
 * Effects are not drawn one by one. Each one is a "progress field": a
 * greyscale image whose pixel value says when that pixel is reached
 * (0 = first, 255 = last). A per-frame lookup table turns the field into the
 * alpha channel, so wipes, irises and dissolves all share one renderer.
 *
 * The preset table mirrors apngtool/presets.py in the desktop version.
 */
(function () {
  "use strict";

  const DEFAULTS = {
    shape: "uniform", mode: "cover", size: [1280, 720], color: "#000000",
    duration: 0.7, hold: 0, fps: 24, ease: "in-out", feather: 40, band: 80,
    invert: false, direction: "right", axis: "y", count: 10, block: 1, seed: 7,
    center: [0.5, 0.5], iris: "circle", text: "", textColor: "#ffffff",
    fontSize: null, loop: 1,
  };

  const PRESETS = {
    "fade-out": { descKey: "preset.fade-out",
      shape: "uniform", mode: "cover", color: "#000000", duration: 0.7, hold: 0.6 },
    "fade-in": { descKey: "preset.fade-in",
      shape: "uniform", mode: "uncover", color: "#000000", duration: 0.7 },
    "white-out": { descKey: "preset.white-out",
      shape: "uniform", mode: "cover", color: "#ffffff", duration: 0.6, hold: 0.5 },
    "white-in": { descKey: "preset.white-in",
      shape: "uniform", mode: "uncover", color: "#ffffff", duration: 0.7 },
    "flash": { descKey: "preset.flash",
      shape: "uniform", mode: "sweep", color: "#ffffff", duration: 0.5, band: 255, ease: "out" },
    "wipe-right": { descKey: "preset.wipe-right",
      shape: "linear", mode: "cover", direction: "right", duration: 0.55, feather: 25, hold: 0.5 },
    "wipe-open-right": { descKey: "preset.wipe-open-right",
      shape: "linear", mode: "uncover", direction: "right", duration: 0.55, feather: 25 },
    "wipe-down": { descKey: "preset.wipe-down",
      shape: "linear", mode: "cover", direction: "down", duration: 0.55, feather: 25, hold: 0.5 },
    "diagonal-wipe": { descKey: "preset.diagonal-wipe",
      shape: "diagonal", mode: "cover", direction: "down-right", duration: 0.6, feather: 25, hold: 0.5 },
    "curtain-close": { descKey: "preset.curtain-close",
      shape: "split", mode: "cover", axis: "y", duration: 0.7, feather: 20, hold: 0.5 },
    "curtain-open": { descKey: "preset.curtain-open",
      shape: "split", mode: "uncover", axis: "y", invert: true, duration: 0.7, feather: 20 },
    "iris-out": { descKey: "preset.iris-out",
      shape: "radial", mode: "cover", invert: true, duration: 0.8, feather: 12, hold: 0.5 },
    "iris-in": { descKey: "preset.iris-in",
      shape: "radial", mode: "uncover", duration: 0.8, feather: 12 },
    "blinds": { descKey: "preset.blinds",
      shape: "blinds", mode: "cover", count: 10, axis: "y", duration: 0.6, feather: 15, hold: 0.5 },
    "dissolve": { descKey: "preset.dissolve",
      shape: "noise", mode: "cover", block: 6, seed: 7, duration: 0.8, feather: 70, hold: 0.5 },
    "mosaic": { descKey: "preset.mosaic",
      shape: "noise", mode: "cover", block: 24, seed: 3, duration: 0.8, feather: 50, hold: 0.5 },
    "band-sweep": { descKey: "preset.band-sweep",
      shape: "linear", mode: "sweep", direction: "right", color: "#000000",
      duration: 0.7, band: 70, ease: "linear" },
    "caption": { descKey: "preset.caption",
      shape: "uniform", mode: "cover", color: "#000000", duration: 1.0, hold: 1.6, get text() { return T("preset.caption.text"); } },
  };

  const EASINGS = {
    "linear": t => t,
    "in": t => t * t,
    "out": t => 1 - (1 - t) * (1 - t),
    "in-out": t => t * t * (3 - 2 * t),
  };

  const PREVIEW_WIDTH = 480;
  const FONT_STACK = '"Yu Gothic UI","Yu Gothic","Hiragino Kaku Gothic ProN","Meiryo",sans-serif';

  // ---------------------------------------------------------------- fields

  function ramp(n, reverse) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.round(255 * i / Math.max(1, n - 1));
    return reverse ? out.reverse() : out;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildField(spec) {
    const [w, h] = spec.size;
    const field = new Uint8Array(w * h);

    if (spec.shape === "linear") {
      const horizontal = spec.direction === "right" || spec.direction === "left";
      const line = ramp(horizontal ? w : h,
        spec.direction === "left" || spec.direction === "up");
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = horizontal ? line[x] : line[y];
      }
    } else if (spec.shape === "diagonal") {
      const across = ramp(w, spec.direction.includes("left"));
      const down = ramp(h, spec.direction.includes("up"));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = (across[x] + down[y]) >> 1;
      }
    } else if (spec.shape === "split") {
      const horizontal = spec.axis === "x";
      const n = horizontal ? w : h;
      const line = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        line[i] = Math.round(255 * (1 - Math.abs(2 * i / Math.max(1, n - 1) - 1)));
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = horizontal ? line[x] : line[y];
      }
    } else if (spec.shape === "blinds") {
      const horizontal = spec.axis === "x";
      const n = horizontal ? w : h;
      const segment = n / Math.max(1, spec.count);
      const line = new Uint8Array(n);
      for (let i = 0; i < n; i++) line[i] = Math.round(255 * ((i % segment) / segment));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = horizontal ? line[x] : line[y];
      }
    } else if (spec.shape === "radial") {
      const cx = spec.center[0] * w, cy = spec.center[1] * h;
      let rx, ry;
      if (spec.iris === "ellipse") {
        rx = Math.max(cx, w - cx) * Math.SQRT2;
        ry = Math.max(cy, h - cy) * Math.SQRT2;
      } else {
        rx = ry = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy),
          Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
      }
      for (let y = 0; y < h; y++) {
        const dy = (y - cy) / ry;
        for (let x = 0; x < w; x++) {
          const dx = (x - cx) / rx;
          field[y * w + x] = Math.min(255, Math.round(255 * Math.hypot(dx, dy)));
        }
      }
    } else if (spec.shape === "noise") {
      const block = Math.max(1, spec.block);
      const bw = Math.max(1, Math.floor(w / block)), bh = Math.max(1, Math.floor(h / block));
      const random = mulberry32(spec.seed == null ? 7 : spec.seed);
      const cells = new Uint8Array(bw * bh);
      for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(random() * 256);
      for (let y = 0; y < h; y++) {
        const row = Math.min(bh - 1, Math.floor(y * bh / h)) * bw;
        for (let x = 0; x < w; x++) {
          field[y * w + x] = cells[row + Math.min(bw - 1, Math.floor(x * bw / w))];
        }
      }
    }
    // "uniform" leaves the field at zero: every pixel changes together.

    let lo = 255, hi = 0;
    for (let i = 0; i < field.length; i++) {
      let v = field[i];
      if (spec.invert) { v = 255 - v; field[i] = v; }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return { field, lo, hi };
  }

  // ------------------------------------------------------------ frame maths

  const clamp8 = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  function coverLut(t, feather, lo, hi) {
    const f = Math.max(1, feather);
    const edge = lo + t * ((hi - lo) + f);
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = clamp8((edge - v) / f * 255);
    return lut;
  }

  function sweepLut(t, band, lo, hi) {
    const b = Math.max(1, band);
    const pos = lo - b + t * ((hi - lo) + 2 * b);
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = clamp8((1 - Math.abs(v - pos) / b) * 255);
    return lut;
  }

  function parseColor(value) {
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = "#000000";
    probe.fillStyle = value;
    const hex = probe.fillStyle;
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  function textLayer(spec) {
    const [w, h] = spec.size;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const size = spec.fontSize || Math.max(16, Math.round(h * 0.09));
    g.font = "bold " + size + "px " + FONT_STACK;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = spec.textColor;
    const lines = spec.text.split("\n");
    const lineHeight = size * 1.45;
    const top = h / 2 - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, i) => g.fillText(line, w / 2, top + i * lineHeight));
    return g.getImageData(0, 0, w, h).data;
  }

  function textAlpha(mode, p) {
    const v = mode === "uncover" ? (0.40 - p) / 0.25 : (p - 0.35) / 0.25;
    return clamp8(v * 255);
  }

  /** Draw the caption over the colour layer (plain source-over). */
  function compose(frame, layer, alpha) {
    for (let i = 0; i < frame.length; i += 4) {
      const sa = layer[i + 3] * alpha / 65025;
      if (sa <= 0) continue;
      const da = frame[i + 3] / 255;
      const out = sa + da * (1 - sa);
      if (out <= 0) continue;
      frame[i] = (layer[i] * sa + frame[i] * da * (1 - sa)) / out;
      frame[i + 1] = (layer[i + 1] * sa + frame[i + 1] * da * (1 - sa)) / out;
      frame[i + 2] = (layer[i + 2] * sa + frame[i + 2] * da * (1 - sa)) / out;
      frame[i + 3] = out * 255;
    }
  }

  function identical(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function renderFrames(spec) {
    const [w, h] = spec.size;
    const { field, lo, hi } = buildField(spec);
    const [r, g, b] = parseColor(spec.color);
    const ease = EASINGS[spec.ease] || EASINGS["in-out"];
    const layer = spec.text ? textLayer(spec) : null;
    const count = Math.max(2, Math.round(spec.duration * spec.fps));
    const frames = [], delays = [];

    for (let i = 0; i < count; i++) {
      const p = i / (count - 1);
      const t = ease(p);
      const lut = spec.mode === "sweep"
        ? sweepLut(t, spec.band, lo, hi) : coverLut(t, spec.feather, lo, hi);
      const uncover = spec.mode === "uncover";
      const pixels = new Uint8ClampedArray(w * h * 4);
      for (let k = 0, j = 0; k < field.length; k++, j += 4) {
        pixels[j] = r;
        pixels[j + 1] = g;
        pixels[j + 2] = b;
        pixels[j + 3] = uncover ? 255 - lut[field[k]] : lut[field[k]];
      }
      if (layer) {
        const alpha = textAlpha(spec.mode, p);
        if (alpha) compose(pixels, layer, alpha);
      }
      // A frame that changes nothing just extends the previous one's delay.
      if (frames.length && identical(frames[frames.length - 1], pixels)) {
        delays[delays.length - 1] += 1000 / spec.fps;
        continue;
      }
      frames.push(pixels);
      delays.push(1000 / spec.fps);
    }
    if (spec.hold > 0) delays[delays.length - 1] += spec.hold * 1000;
    return { frames, delays, width: w, height: h };
  }

  // ------------------------------------------------------------- previewing

  function shrink(spec) {
    const [w, h] = spec.size;
    if (w <= PREVIEW_WIDTH) return spec;
    const ratio = PREVIEW_WIDTH / w;
    return Object.assign({}, spec, {
      size: [PREVIEW_WIDTH, Math.max(2, Math.round(h * ratio))],
      block: Math.max(1, Math.round(spec.block * ratio)),
      fontSize: spec.fontSize ? Math.max(8, Math.round(spec.fontSize * ratio)) : null,
    });
  }

  class Player {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext("2d");
      this.timer = null;
    }
    load(render, loop) {
      this.stop();
      this.render = render;
      this.loop = loop;
      this.canvas.width = render.width;
      this.canvas.height = render.height;
      this.play();
    }
    play() {
      if (!this.render) return;
      this.stop();
      this.step(0);
    }
    step(index) {
      const { frames, delays, width, height } = this.render;
      this.context.putImageData(new ImageData(frames[index], width, height), 0, 0);
      const last = index === frames.length - 1;
      if (last && this.loop !== 0) return;              // hold the final frame
      this.timer = setTimeout(() => this.step(last ? 0 : index + 1), delays[index]);
    }
    stop() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // --------------------------------------------------------------------- UI

  const $ = id => document.getElementById(id);
  const el = {};
  for (const id of ["preset", "desc", "color", "size", "feather", "direction", "axis",
    "count", "block", "iris", "centerX", "centerY", "band", "duration", "hold", "ease",
    "fps", "loop", "text", "textColor", "fontSize", "mode", "invert"]) {
    el[id] = $(id);
  }
  const stage = $("stage"), status = $("status");
  const player = new Player($("preview"));
  const SHAPE_ROWS = {
    rowDirection: ["linear", "diagonal"],
    rowAxis: ["split", "blinds"],
    rowCount: ["blinds"],
    rowBlock: ["noise"],
    rowIris: ["radial"],
    rowCenter: ["radial"],
  };
  let timer = null;

  function preset(name) {
    return Object.assign({}, DEFAULTS, PRESETS[name]);
  }

  function applyPreset(name) {
    const p = preset(name);
    el.desc.textContent = T(p.descKey);
    el.color.value = p.color;
    el.textColor.value = p.textColor;
    el.size.value = p.size.join("x");
    el.feather.value = p.feather;
    el.direction.value = p.direction;
    el.axis.value = p.axis;
    el.count.value = Math.min(40, Math.max(2, p.count));
    el.block.value = Math.min(60, p.block);
    el.iris.value = p.iris;
    el.centerX.value = p.center[0];
    el.centerY.value = p.center[1];
    el.band.value = p.band;
    el.duration.value = p.duration;
    el.hold.value = p.hold;
    el.ease.value = p.ease;
    el.fps.value = p.fps;
    el.loop.checked = p.loop === 0;
    el.text.value = p.text;
    el.fontSize.value = p.fontSize || Math.round(p.size[1] * 0.09);
    el.mode.value = p.mode;
    el.invert.checked = p.invert;
    syncRows();
  }

  function syncRows() {
    const shape = preset(el.preset.value).shape;
    for (const [row, shapes] of Object.entries(SHAPE_ROWS)) {
      $(row).classList.toggle("hidden", !shapes.includes(shape));
    }
    $("rowBand").classList.toggle("hidden", el.mode.value !== "sweep");
    $("featherOut").value = el.feather.value;
    $("countOut").value = el.count.value;
    $("blockOut").value = el.block.value + "px";
    $("bandOut").value = el.band.value;
    $("durationOut").value = Number(el.duration.value).toFixed(2) + "s";
    $("holdOut").value = Number(el.hold.value).toFixed(1) + "s";
    $("fontSizeOut").value = el.fontSize.value;
  }

  function currentSpec() {
    const [w, h] = el.size.value.split("x").map(Number);
    return {
      shape: preset(el.preset.value).shape,
      mode: el.mode.value,
      size: [w, h],
      color: el.color.value,
      duration: Number(el.duration.value),
      hold: Number(el.hold.value),
      fps: Number(el.fps.value),
      ease: el.ease.value,
      feather: Number(el.feather.value),
      band: Number(el.band.value),
      invert: el.invert.checked,
      direction: el.direction.value,
      axis: el.axis.value,
      count: Number(el.count.value),
      block: Number(el.block.value),
      seed: preset(el.preset.value).seed,
      center: [Number(el.centerX.value), Number(el.centerY.value)],
      iris: el.iris.value,
      text: el.text.value.trim(),
      textColor: el.textColor.value,
      fontSize: Number(el.fontSize.value),
      loop: el.loop.checked ? 0 : 1,
    };
  }

  function refresh() {
    const spec = currentSpec();
    const render = renderFrames(shrink(spec));
    player.load(render, spec.loop);
    status.classList.remove("error");
    status.textContent = T("status.output", el.size.value, render.frames.length,
      (spec.duration + spec.hold).toFixed(2), T(spec.loop === 0 ? "status.loopForever" : "status.playOnce"));
  }

  function schedule() {
    syncRows();
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  }

  $("form").addEventListener("input", event => {
    if (event.target === el.preset) {
      applyPreset(el.preset.value);
      refresh();
    } else {
      schedule();
    }
  });
  $("replay").addEventListener("click", () => player.play());
  $("bgSeg").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    stage.className = "stage " + button.dataset.bg;
    for (const other of $("bgSeg").children) {
      other.setAttribute("aria-pressed", other === button);
    }
  });

  $("download").addEventListener("click", async () => {
    const button = $("download");
    button.disabled = true;
    status.classList.remove("error");
    status.textContent = T("status.exporting");
    await new Promise(resolve => setTimeout(resolve, 30));   // let the message paint
    try {
      const spec = currentSpec();
      const render = renderFrames(spec);
      const result = await APNG.encode(render.frames, render.width, render.height,
        render.delays, spec.loop);
      const name = el.preset.value + ".png";
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      status.textContent = T("status.saved", name, spec.size.join("x"), result.frames,
        (result.blob.size / 1024).toFixed(1));
    } catch (error) {
      status.classList.add("error");
      status.textContent = T("status.error", error.message);
    } finally {
      button.disabled = false;
    }
  });

  /* 選項文字取自字典（「名稱：說明」的前半段），切換語言時整批重建。 */
  function fillPresetOptions() {
    const value = el.preset.value;
    el.preset.textContent = "";
    for (const name of Object.keys(PRESETS)) {
      el.preset.append(new Option(name + " — " + T(PRESETS[name].descKey).split("：")[0], name));
    }
    if (value) el.preset.value = value;
  }
  fillPresetOptions();
  I18N.mountSwitcher(document.getElementById("localeSelect"));
  I18N.onChange(() => {
    fillPresetOptions();
    /* 只換說明文字，不呼叫 applyPreset()——那會把使用者調過的設定重設回預設值。 */
    el.desc.textContent = T(preset(el.preset.value).descKey);
    refresh();
  });
  el.preset.value = "fade-out";
  applyPreset("fade-out");
  refresh();

  window.SCENE_TOOL = { renderFrames, buildField, preset, PRESETS, DEFAULTS };
})();
