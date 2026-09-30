/*!
 * model.v1.js - project state: defaults, design templates, loading, CCFOLIA URLs
 *
 * A design ("look") replaces layout, box, name, result, text, portrait and dice.
 * The browser source size, the room and the preview settings belong to the user and
 * survive a design change.
 */
(function () {
  "use strict";

  const P = window.MboxPresets;
  const clone = value => JSON.parse(JSON.stringify(value));
  const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

  function deepMerge(base, patch) {
    const out = clone(base);
    for (const key of Object.keys(patch || {})) {
      out[key] = isObj(out[key]) && isObj(patch[key]) ? deepMerge(out[key], patch[key]) : clone(patch[key]);
    }
    return out;
  }

  function designLook(key) {
    const d = P.DESIGNS[key] || {};
    const look = {};
    for (const k of P.LOOK_KEYS) look[k] = deepMerge(P.BASE_LOOK[k], d[k]);
    return look;
  }

  function applyDesign(state, key) {
    if (!P.DESIGNS[key]) return;
    Object.assign(state, designLook(key));
    state.design = key;
  }

  function defaultState() {
    const state = {
      version: 1,
      design: "standard",
      source: { room: "", w: 1280, h: 720 },
      preview: { bg: "scene", raw: false, sample: "tall" },
      fileBase: "messagebox",
    };
    applyDesign(state, "standard");
    return state;
  }

  // ---------------------------------------------------------------- loading

  // Fill in keys missing from older or hand-edited project files.
  function mergeDefaults(base, loaded) {
    if (base === null) return loaded === undefined ? null : loaded;
    if (Array.isArray(base) || typeof base !== "object") {
      return loaded === undefined || typeof loaded !== typeof base ? base : loaded;
    }
    if (!isObj(loaded)) return base;
    const out = {};
    for (const key of Object.keys(base)) out[key] = mergeDefaults(base[key], loaded[key]);
    for (const key of Object.keys(loaded)) if (!(key in out)) out[key] = loaded[key];
    return out;
  }

  const clamp = (v, lo, hi, fallback) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || fallback));

  function normalize(input) {
    const loaded = isObj(input) ? input : {};
    const state = mergeDefaults(defaultState(), loaded);
    state.source.w = clamp(state.source.w, 320, 3840, 1280);
    state.source.h = clamp(state.source.h, 160, 2160, 720);
    state.box.lines = clamp(state.box.lines, 1, 10, 3);
    if (!P.DESIGNS[state.design]) state.design = "";
    return state;
  }

  // ---------------------------------------------------------------- CCFOLIA URLs

  const ID = /^[A-Za-z0-9_-]{4,}$/;

  function parseRoom(text) {
    const s = String(text || "").trim();
    const m = s.match(/rooms\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : ID.test(s) ? s : "";
  }

  // The message box is part of the room screen: the source opens the room itself, not /chat.
  function roomUrl(roomText) {
    const room = parseRoom(roomText);
    return room ? `https://ccfolia.com/rooms/${room}` : "";
  }

  window.MboxModel = { defaultState, applyDesign, designLook, normalize, clone, parseRoom, roomUrl };
})();
