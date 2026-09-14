/*!
 * model.v2.js - project state: defaults, design templates, variants, migration
 *
 * Every length is in "virtual pixels": the canvas is always treated as 1080
 * units tall, so a design keeps its proportions when the output size changes.
 *
 * v2 makes the frame itself the main thing. Variants (time of day, weather,
 * season...) are optional: a list of items, each able to override the colors,
 * tint the window and add an effect. v1 projects only had time slots;
 * normalize() converts them.
 */
(function () {
  "use strict";

  const P = window.FramePresets;
  const clone = value => JSON.parse(JSON.stringify(value));

  let counter = 0;
  function newId(prefix) {
    return prefix + Date.now().toString(36) + (counter++).toString(36);
  }

  // ---------------------------------------------------------------- colors

  function hexToRgb(hex) {
    let h = String(hex || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(rgb) {
    return "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  }

  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
  }

  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // How each time of day shifts a palette when the design has no hand-made one.
  const TIME_LOOKS = {
    morning: { toward: "#ffc38a", frame: 0.22, accent: 0.15, tint: ["#ffc98a", 0.06] },
    day: { toward: "#ffffff", frame: 0, accent: 0, tint: ["#ffffff", 0] },
    evening: { toward: "#b4462e", frame: 0.45, accent: 0.3, tint: ["#ff7a33", 0.12] },
    night: { toward: "#101634", frame: 0.68, accent: 0.2, tint: ["#10205a", 0.28] },
  };

  function samePalette(design, palette) {
    const mine = [palette.frame1, palette.frame2, palette.accent, palette.text];
    return design.palette.every((color, i) => String(color).toLowerCase() === String(mine[i]).toLowerCase());
  }

  function timePalette(state, id) {
    const design = P.DESIGNS[state.design], pal = state.palette;
    const table = design && design.times && samePalette(design, pal) ? design.times : null;
    if (table && table[id]) {
      const t = table[id];
      return { frame1: t[0], frame2: t[1], accent: t[2], text: t[3], tint: t[4], tintAlpha: t[5] };
    }
    const look = TIME_LOOKS[id] || TIME_LOOKS.day;
    const frame1 = mix(pal.frame1, look.toward, look.frame), frame2 = mix(pal.frame2, look.toward, look.frame);
    const bg = luminance(mix(frame1, frame2, 0.5));
    const text = Math.abs(bg - luminance(pal.text)) < 0.35 ? (bg > 0.5 ? "#1b1b1f" : "#f3f1ea") : pal.text;
    return { frame1, frame2, accent: mix(pal.accent, look.toward, look.accent), text, tint: look.tint[0], tintAlpha: look.tint[1] };
  }

  // ---------------------------------------------------------------- variants

  function variantItem(fields) {
    return Object.assign({
      id: newId("v"), on: true, name: T("variant.defaultName"), sub: "", icon: "none", iconAsset: null, useColors: false,
      frame1: "#f2f8fc", frame2: "#c3dff1", accent: "#3a8fcb", text: "#274760",
      tint: "#000000", tintAlpha: 0, effect: "none", effectAmount: 0.5,
    }, fields);
  }

  function variantItems(kind, state) {
    const K = P.VARIANT_KINDS[kind] || P.VARIANT_KINDS.custom;
    /* name 欄存的是 i18n key（見 presets.v1.js），在建立差分的當下取值。 */
    return K.items.map(([id, nameKey, sub, icon, on, opt]) => {
      opt = opt || {};
      const item = variantItem(Object.assign({ id, name: T(nameKey), sub, icon, on }, state.palette, {
        effect: opt.effect || "none", effectAmount: opt.amount == null ? 0.5 : opt.amount,
      }));
      if (kind === "time") Object.assign(item, timePalette(state, id), { useColors: true });
      if (opt.colors) {
        Object.assign(item, { useColors: true, frame1: opt.colors[0], frame2: opt.colors[1], accent: opt.colors[2], text: opt.colors[3] });
      }
      if (opt.tint) Object.assign(item, { tint: opt.tint[0], tintAlpha: opt.tint[1] });
      return item;
    });
  }

  // ---------------------------------------------------------------- decorations & layers

  function newDecoration(type, overrides) {
    const extra = Object.assign({}, overrides);
    delete extra.type;
    delete extra.id;
    return Object.assign({ id: newId("D"), type, on: true, seed: 1, clipFrame: false, hideIn: {} },
      clone(P.DECO_TYPES[type].defaults), extra);
  }

  function baseLayer(kind, name) {
    return { id: newId("L"), kind, name, visible: true, x: 0.5, y: 0.5, scale: 1, rotation: 0,
      opacity: 1, blend: "source-over", flip: false, order: "front", clip: "none", hideIn: {} };
  }

  function imageLayer(assetId, name) {
    return Object.assign(baseLayer("image", name || T("layer.defaultImageName")), { asset: assetId, fit: "free", recolor: "none" });
  }

  function textLayer() {
    return Object.assign(baseLayer("text", T("layer.defaultTextName")), {
      y: 0.88, text: T("layer.defaultText"), font: "mincho", fontName: "", size: 44, bold: true, vertical: false,
      spacing: 0.1, align: "center", color: "text", strokeWidth: 0, strokeColor: "#000000", shadow: 0,
    });
  }

  // ---------------------------------------------------------------- designs & defaults

  function applyDesign(state, key) {
    const d = P.DESIGNS[key];
    if (!d) return;
    state.design = key;
    state.opening = clone(d.opening);
    state.frame = clone(d.frame);
    const [frame1, frame2, accent, text] = d.palette;
    state.palette = { frame1, frame2, accent, text };
    state.decorations = (d.decorations || []).map(x => newDecoration(x.type, x));
    Object.assign(state.variants.label, { bgAlpha: 0.92 }, d.indicator);
    if (state.variants.kind === "time") {
      const timeIds = P.VARIANT_KINDS.time.items.map(t => t[0]);
      for (const item of state.variants.items) {
        if (timeIds.includes(item.id)) Object.assign(item, timePalette(state, item.id));
      }
    }
  }

  function defaultState() {
    const state = {
      version: 2,
      design: "simple",
      size: { w: 1920, h: 1080 },
      opening: null,
      frame: null,
      palette: null,
      decorations: [],
      variants: {
        enabled: false,
        kind: "time",
        current: "morning",
        items: [],
        label: { style: "badge", pos: "tl", x: 0.1, y: 0.1, scale: 1, bgAlpha: 0.92, showSub: true, font: "gothic", fontName: "" },
      },
      layers: [],
      preview: { bg: "scenery", grid: false, bgAsset: null },
      fileBase: "frame",
    };
    applyDesign(state, "simple");
    state.variants.items = variantItems("time", state);
    return state;
  }

  // ---------------------------------------------------------------- loading

  // Fill in keys missing from older or hand-edited project files.
  function mergeDefaults(base, loaded) {
    if (base === null) return loaded === undefined ? null : loaded;
    if (Array.isArray(base) || typeof base !== "object") {
      return loaded === undefined || typeof loaded !== typeof base ? base : loaded;
    }
    if (!loaded || typeof loaded !== "object") return base;
    const out = {};
    for (const key of Object.keys(base)) out[key] = mergeDefaults(base[key], loaded[key]);
    for (const key of Object.keys(loaded)) if (!(key in out)) out[key] = loaded[key];
    return out;
  }

  function migrateV1(v1) {
    const slots = Array.isArray(v1.time.slots) ? v1.time.slots.filter(Boolean) : [];
    const day = slots.find(s => s.id === "day") || slots[0] || {};
    const hidden = times => Object.fromEntries(Object.entries(times || {}).filter(([, v]) => v === false).map(([k]) => [k, true]));
    const out = Object.assign({}, v1, {
      version: 2,
      design: "",
      palette: { frame1: day.frame1, frame2: day.frame2, accent: day.accent, text: day.text },
      decorations: [],
      variants: {
        enabled: true,
        kind: "time",
        current: v1.time.current,
        items: slots.map(s => ({
          id: s.id, on: s.on !== false, name: s.name, sub: s.sub, icon: s.icon, iconAsset: s.iconAsset || null, useColors: true,
          frame1: s.frame1, frame2: s.frame2, accent: s.accent, text: s.text, tint: s.tint, tintAlpha: s.tintAlpha,
          effect: "none", effectAmount: 0.5,
        })),
        label: v1.time.indicator || {},
      },
      layers: (Array.isArray(v1.layers) ? v1.layers : []).filter(Boolean).map(l => {
        const copy = Object.assign({}, l, { hideIn: hidden(l.times) });
        delete copy.times;
        return copy;
      }),
      preview: Object.assign({}, v1.preview, { bg: !v1.preview || v1.preview.bg === "sky" ? "scenery" : v1.preview.bg }),
    });
    delete out.time;
    return out;
  }

  function normalize(input) {
    let loaded = input && typeof input === "object" ? input : {};
    if (!loaded.variants && loaded.time) loaded = migrateV1(loaded);
    const base = defaultState();
    const state = mergeDefaults(base, loaded);

    const corner = base.opening.corners[0];
    const cornerList = Array.isArray(loaded.opening?.corners) ? loaded.opening.corners : base.opening.corners;
    state.opening.corners = [0, 1, 2, 3].map(i => mergeDefaults(corner, cornerList[i]));

    const template = variantItem({ id: "" });
    const itemList = Array.isArray(loaded.variants?.items) ? loaded.variants.items.filter(i => i && typeof i.id === "string" && i.id) : [];
    state.variants.items = itemList.length ? itemList.map(i => mergeDefaults(template, i)) : base.variants.items;
    if (!state.variants.items.some(i => i.on)) state.variants.items[0].on = true;
    if (!P.VARIANT_KINDS[state.variants.kind]) state.variants.kind = "custom";

    const decoList = Array.isArray(loaded.decorations) ? loaded.decorations : [];
    state.decorations = decoList.filter(d => d && P.DECO_TYPES[d.type]).map(d => mergeDefaults(newDecoration(d.type), d));

    const layerList = Array.isArray(loaded.layers) ? loaded.layers : [];
    state.layers = layerList
      .filter(l => l && (l.kind === "image" || l.kind === "text"))
      .map(l => mergeDefaults(l.kind === "image" ? imageLayer(l.asset) : textLayer(), l));
    return state;
  }

  window.FrameModel = {
    defaultState, applyDesign, variantItems, variantItem, newDecoration, timePalette,
    normalize, imageLayer, textLayer, newId, clone,
  };
})();
