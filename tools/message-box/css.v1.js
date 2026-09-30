/*!
 * css.v1.js - state -> custom CSS for an OBS browser source (no UI)
 *
 * Target page: https://ccfolia.com/rooms/{room}  (the room screen itself; /chat has no message box)
 * DOM of the message box, read from CCFOLIA's bundle (1.37.4, main.09686af1.js, 2026-09-25):
 *
 *   div.MuiPaper-root[role="status"][aria-live="polite"][aria-label="メッセージ"]   (Paper elevation 6, inside MUI Slide)
 *     img                          portrait; only when the message has one. absolute, bottom 100%, left 8px, z-index -1
 *     div.MuiPaper-root            the box. relative, z-index 1, background rgba(22, 22, 22, 0.84)
 *       div                        dice images (absolute, bottom 100%, right 16px); only with the room setting
 *                                  "旧ダイス演出を利用する" (hidden3dDice). Otherwise 3D dice roll on the board, which is hidden.
 *       div.MuiToolbar-root.MuiToolbar-dense
 *         h6.MuiTypography-subtitle2               name (no character color)
 *         p.MuiTypography-body2.css-<hash>         "🎲 ＞ 成功" (dice only; color primary / secondary / textSecondary)
 *         div                                      flex-grow spacer
 *         button.MuiIconButton-root x2             skip / close
 *       div                        text area: padding 0 24px 16px, height 80px, overflow-y auto (scrolled to the end per character)
 *         p.MuiTypography-root     text, typed one character at a time (80ms, 800ms after 。、,. and line breaks)
 *
 * The component is never re-created per message (only its text, image and dice change), and the
 * last message stays until "close". So per-message CSS animations cannot work.
 * Closing slides it out and MUI then sets an inline visibility: hidden, which the rule that shows
 * the box must not override.
 *
 * Everything else on the room screen is hidden with visibility, which children can switch back on:
 * body is hidden and only the message box is visible again. No need to know the board's DOM.
 */
(function () {
  "use strict";

  const P = window.MboxPresets, R = P.RESULT_CLASS;
  /* TRPG Toolkit 合輯：這個檔案有幾處把 st.text 取名為 T（textShadow(T) 也是），
   * 直接呼叫全域的 T() 會被區域變數蓋掉。譯文一律經由 TX() 取。 */
  const TX = (key, ...args) => window.T(key, ...args);

  const ROOT = '[role="status"][aria-live="polite"]';
  const SEL = {
    root: ROOT,
    open: `${ROOT}:not([style*="visibility: hidden"])`,
    portrait: `${ROOT} > img`,
    box: `${ROOT} > .MuiPaper-root`,
    dice: `${ROOT} > .MuiPaper-root > div:first-child`,
    head: `${ROOT} > .MuiPaper-root > .MuiToolbar-root`,
    name: `${ROOT} > .MuiPaper-root > .MuiToolbar-root > .MuiTypography-subtitle2`,
    result: `${ROOT} > .MuiPaper-root > .MuiToolbar-root > .MuiTypography-body2`,
    spacer: `${ROOT} > .MuiPaper-root > .MuiToolbar-root > div`,
    buttons: `${ROOT} > .MuiPaper-root > .MuiToolbar-root > .MuiIconButton-root`,
    content: `${ROOT} > .MuiPaper-root > div:last-child`,
    text: `${ROOT} > .MuiPaper-root > div:last-child > p`,
  };

  // ---------------------------------------------------------------- values

  const round = (v, k) => Math.round(v * (k || 100)) / (k || 100);
  const px = v => `${round(v, 10)}px`;

  function hexToRgb(hex) {
    let h = String(hex || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const v = parseInt(h.slice(0, 6), 16) || 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function rgba(hex, alpha) {
    const a = Math.max(0, Math.min(1, alpha == null ? 1 : alpha));
    return a >= 1 ? String(hex).toLowerCase() : `rgba(${hexToRgb(hex).join(", ")}, ${round(a)})`;
  }

  // Dark text on light colors, white text on dark ones.
  function contrastText(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#15161a" : "#ffffff";
  }

  function cssString(text) {
    return '"' + String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\A ") + '"';
  }

  const safeComment = text => String(text).replace(/\*\//g, "* /");

  // ---------------------------------------------------------------- fonts

  const font = key => P.FONTS[key] || P.FONTS.notosans;

  function weightOf(key, wanted) {
    const list = font(key).weights;
    if (!list) return wanted;
    return list.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), list[0]);
  }

  const pcName = name => String(name || "").replace(/[\r\n]+/g, " ").trim();

  // name: the typed family for the "pc" font (a font installed on the PC; no import).
  function family(key, name) {
    const f = font(key);
    if (key !== "pc") return `"${f.family}", ${f.stack}`;
    const typed = pcName(name);
    return typed ? `${cssString(typed)}, ${f.stack}` : f.stack;
  }

  // uses: [key, weight, typedName]. A PC font shows up only if OBS's PC has it too.
  function pcFontNote(uses) {
    const names = [...new Set(uses.filter(([key]) => key === "pc").map(([, , name]) => pcName(name)).filter(Boolean))];
    if (!names.length) return [];
    return [`   ■ ${TX("css.head.pcFont")}`, `       ${safeComment(names.join(" / "))}`];
  }

  function fontImports(uses) {
    const map = new Map();
    for (const [key, weight] of uses) {
      const f = font(key);
      if (!f.weights) continue;
      if (!map.has(f.family)) map.set(f.family, new Set());
      map.get(f.family).add(weightOf(key, weight));
    }
    return [...map].map(([name, set]) => {
      const weights = [...set].sort((a, b) => a - b).join(";");
      return `@import url("https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@${weights}&display=swap");`;
    });
  }

  function textShadow(t) {
    const c = rgba(t.outlineColor, t.outlineAlpha);
    if (t.outline === "shadow") return `0 0 3px ${c}, 0 1px 2px ${c}, 1px 0 2px ${c}, -1px 0 2px ${c}`;
    if (t.outline === "glow") return `0 0 4px ${c}, 0 0 10px ${c}, 0 0 18px ${c}`;
    if (t.outline === "stroke") {
      const steps = t.outlineW <= 1 ? 8 : 16, list = [];
      for (let i = 0; i < steps; i++) {
        const a = Math.PI * 2 * i / steps;
        list.push(`${px(Math.cos(a) * t.outlineW)} ${px(Math.sin(a) * t.outlineW)} 0 ${c}`);
      }
      return list.join(", ");
    }
    return "none";
  }

  // Dark specks as an SVG data URL. alpha 0..1 (same as the status bar maker)
  function grainUrl(alpha, size) {
    const s = size || 140, k = round(alpha * 3);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'>`
      + "<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>"
      + `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${k} 0 0 0 ${round(-alpha * 1.35)}'/></filter>`
      + "<rect width='100%' height='100%' filter='url(#g)'/></svg>";
    return `url("data:image/svg+xml,${svg.replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
  }

  // ---------------------------------------------------------------- writer

  function Writer() {
    this.out = [];
  }
  Writer.prototype.add = function (selectors, decls) {
    const lines = Object.entries(decls)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `  ${k}: ${v} !important;`);
    if (!lines.length) return;
    const sel = Array.isArray(selectors) ? selectors.join(",\n") : selectors;
    this.out.push(`${sel} {\n${lines.join("\n")}\n}`);
  };
  Writer.prototype.comment = function (text) {
    this.out.push(`\n/* ---------- ${safeComment(text)} ---------- */`);
  };
  Writer.prototype.raw = function (text) {
    this.out.push(text);
  };

  // ---------------------------------------------------------------- derived sizes

  const isPlate = st => st.name.show && st.name.style === "plate";
  // How far the name plate sinks into the top of the box.
  // How far the plate reaches down into the box. Raising the plate (plateLift) can take it above the box.
  const plateSink = st => Math.round(st.name.size * 0.7) - Math.round(st.name.plateLift || 0);
  const minus = n => n >= 0 ? `- ${px(n)}` : `+ ${px(-n)}`;
  // The header row stays in the box only while it has something to show.
  const headInBox = st => !isPlate(st) && (st.name.show || st.result.show || st.box.buttons === "show");

  // ---------------------------------------------------------------- parts

  function pageRules(w) {
    w.comment(TX("css.page"));
    w.add("html, body, #root", { background: "transparent", "background-color": "transparent", "background-image": "none" });
    w.add("html, body", { overflow: "hidden" });
    // visibility, not display: the children can turn it back on, so the box stays and the board goes.
    w.add("body", { visibility: "hidden" });
    w.add([SEL.open, `${SEL.open} *`], { visibility: "visible" });
    w.add("::-webkit-scrollbar", { display: "none" });
  }

  function layoutRules(st, w) {
    const L = st.layout;
    const margin = { center: "0 auto", left: "0 auto 0 0", right: "0 0 0 auto" }[L.align] || "0 auto";
    w.comment(TX("css.layout"));
    // position: fixed puts it against the browser source, whatever the width of the chat drawer.
    w.add(SEL.root, {
      position: "fixed", left: px(L.side), right: px(L.side), bottom: px(L.bottom), top: "auto",
      width: "auto", "max-width": px(L.width), margin, padding: "0", "z-index": "102",
      background: "transparent", "background-image": "none", "box-shadow": "none", border: "none", "border-radius": "0",
      overflow: "visible", color: st.text.color,
    });
    if (L.enter === "none") {
      // MUI's Slide moves it with an inline transform; an !important rule wins over inline styles.
      // Closing still works: MUI sets visibility: hidden when the (now instant) exit is over.
      w.add(SEL.root, { transform: "none", transition: "none" });
    }
  }

  function boxRules(st, w) {
    const B = st.box;
    const images = [], sizes = [];
    let color = rgba(B.bg, B.bgAlpha);
    if (B.texture === "paper") {
      images.push("radial-gradient(ellipse at 50% 35%, rgba(255, 255, 255, 0.22), transparent 60%)",
        "radial-gradient(ellipse at center, transparent 45%, rgba(90, 55, 20, 0.32) 100%)", grainUrl(0.22, 160));
      sizes.push("100% 100%", "100% 100%", "160px 160px");
    }
    if (B.texture === "grain") {
      images.push(grainUrl(0.35, 140));
      sizes.push("140px 140px");
    }
    if (B.texture === "gradient") {
      images.push(`linear-gradient(180deg, ${rgba(B.bg, B.bgAlpha * 0.45)}, ${rgba(B.bg, Math.min(1, B.bgAlpha * 1.12))})`);
      sizes.push("100% 100%");
      color = "transparent";
    }
    w.comment(TX("css.box"));
    w.add(SEL.box, {
      position: "relative", "z-index": "1", margin: "0", padding: "0", "box-sizing": "border-box", overflow: "visible",
      "background-color": color, "background-image": images.length ? images.join(", ") : "none",
      "background-size": sizes.length ? sizes.join(", ") : undefined,
      border: B.borderW > 0 ? `${px(B.borderW)} solid ${rgba(B.borderColor, B.borderAlpha)}` : "none",
      "border-radius": px(B.radius),
      "box-shadow": B.shadow > 0 ? `0 4px 18px rgba(0, 0, 0, ${round(B.shadow)})` : "none",
      color: st.text.color,
    });

    const layers = [];
    if (B.texture === "scanlines") layers.push("repeating-linear-gradient(180deg, rgba(0, 0, 0, 0.28) 0 1px, transparent 1px 3px)");
    if (B.corners) {
      const c = rgba(B.cornerColor, B.cornerAlpha), len = "18px", thick = px(Math.max(2, B.borderW + 1));
      const bar = (pos, size) => `linear-gradient(${c}, ${c}) ${pos} / ${size} no-repeat`;
      for (const pos of ["left top", "right top", "left bottom", "right bottom"]) layers.push(bar(pos, `${len} ${thick}`), bar(pos, `${thick} ${len}`));
    }
    if (layers.length) {
      w.add(`${SEL.box}::after`, {
        content: '""', position: "absolute", inset: "0", "pointer-events": "none", "z-index": "40",
        "border-radius": "inherit", background: layers.join(", "),
      });
    }
  }

  function headRules(st, w) {
    const B = st.box, N = st.name, RS = st.result;
    const right = RS.place === "right";
    w.comment(TX(isPlate(st) ? "css.headRowPlate" : "css.headRow"));
    if (isPlate(st)) {
      w.add(SEL.head, {
        display: "flex", "align-items": "flex-end", position: "absolute", left: px(N.plateX), right: px(N.plateX),
        bottom: `calc(100% ${minus(plateSink(st))})`, top: "auto", "min-height": "0", margin: "0", padding: "0",
        gap: "8px", background: "none", "z-index": "2",
      });
    } else if (headInBox(st)) {
      w.add(SEL.head, {
        display: "flex", "align-items": "center", position: "static", "min-height": "0", margin: "0",
        padding: `${px(B.padY)} ${px(B.padX)} ${px(N.gap)}`, gap: "0", background: "none",
      });
    } else {
      w.add(SEL.head, { display: "none" });
    }
    // Order: name, spacer, result when the result goes to the right end; buttons last.
    w.add(SEL.name, { order: "0" });
    w.add(SEL.spacer, { display: "block", "flex-grow": "1", order: right ? "1" : "3", "min-width": "0" });
    w.add(SEL.result, { order: right ? "2" : "1" });
    if (B.buttons === "hide") {
      w.add(SEL.buttons, { display: "none" });
      return;
    }
    const button = { display: "inline-flex", order: "4", padding: "6px", margin: "0", color: "inherit", "font-size": "22px" };
    if (B.buttons === "show") {
      w.add(SEL.buttons, button);
      return;
    }
    // Only while the mouse is over the page, which happens only in OBS's "Interact" window.
    w.comment(TX("css.hoverButtons"));
    w.add(`html:not(:hover) ${SEL.buttons}`, { display: "none" });
    w.add(`html:hover ${SEL.buttons}`, Object.assign({}, button, { background: "rgba(0, 0, 0, 0.7)", color: "#ffffff" }));
  }

  function nameRules(st, w) {
    const N = st.name, T = st.text;
    w.comment(TX("css.name"));
    if (!N.show) {
      w.add(SEL.name, { display: "none" });
      return;
    }
    const decls = {
      display: "block", "font-family": family(N.font, N.fontName), "font-size": px(N.size), "font-weight": weightOf(N.font, N.weight),
      color: N.color, "-webkit-text-fill-color": N.color, "line-height": "1.35", "letter-spacing": "0.04em",
      margin: "0", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis", "min-width": "0", "flex-shrink": "1",
    };
    if (isPlate(st)) {
      Object.assign(decls, {
        padding: "0.28em 0.95em 0.3em", background: rgba(N.plateBg, N.plateAlpha), "border-radius": px(N.plateRadius),
        border: N.plateBorderW > 0 ? `${px(N.plateBorderW)} solid ${N.plateBorderColor}` : "none",
        "text-shadow": "none", "box-shadow": "0 2px 6px rgba(0, 0, 0, 0.25)",
      });
    } else {
      Object.assign(decls, { padding: "0", background: "none", "text-shadow": textShadow(T) });
    }
    w.add(SEL.name, decls);
  }

  function resultRules(st, w) {
    const RS = st.result, N = st.name, T = st.text, plate = isPlate(st);
    w.comment(TX("css.result"));
    if (!RS.show) {
      w.add(SEL.result, { display: "none" });
      return;
    }
    const decls = {
      display: "block", "font-family": family(RS.font, RS.fontName), "font-size": px(RS.size), "font-weight": weightOf(RS.font, RS.weight),
      "line-height": "1.35", "letter-spacing": "0.02em", "white-space": "nowrap", margin: "0",
      "margin-left": RS.place === "right" || plate ? "0" : "0.8em", "flex-shrink": "0",
    };
    const boxed = plate || RS.style !== "text";
    if (boxed) Object.assign(decls, { padding: "0.22em 0.7em 0.24em 0.5em", "border-radius": px(plate ? N.plateRadius : 5) });
    // Above the box a plain result would float over the scene, so it gets the plate's background.
    if (plate && RS.style !== "fill") decls.background = rgba(N.plateBg, N.plateAlpha);
    w.add(SEL.result, decls);

    for (const kind of ["success", "failure", "neutral"]) {
      const c = RS[kind];
      const d = { color: c, "-webkit-text-fill-color": c, "text-shadow": plate || T.outline === "none" ? "none" : textShadow(T) };
      if (RS.style === "badge") Object.assign(d, { border: `1.5px solid ${c}` }, plate ? {} : { background: rgba(c, 0.12) });
      if (RS.style === "fill") {
        const ink = contrastText(c);
        Object.assign(d, { background: c, color: ink, "-webkit-text-fill-color": ink, "text-shadow": "none" });
      }
      w.add(`${SEL.result}.${R[kind]}`, d);
    }
  }

  function textRules(st, w) {
    const T = st.text, B = st.box;
    const N = st.name;
    const top = isPlate(st) ? B.padY + Math.max(0, plateSink(st)) + Math.round(N.plateGap || 0) : headInBox(st) ? 0 : B.padY;
    w.comment(TX("css.text", B.lines));
    w.add(SEL.content, {
      display: "block", height: px(B.lines * T.size * T.lineHeight), "box-sizing": "content-box", margin: "0",
      padding: `${px(top)} ${px(B.padX)} ${px(B.padY)}`, "overflow-y": "auto", "overflow-x": "hidden", "scrollbar-width": "none",
      // The top padding scrolls along with the text, so a long message sent down line by line would climb
      // into it and under the name plate. Clipping it keeps the text below the line where it starts.
      "clip-path": top > 0 ? `inset(${px(top)} 0 0 0)` : undefined,
    });
    w.add(SEL.text, {
      "font-family": family(T.font, T.fontName), "font-size": px(T.size), "font-weight": weightOf(T.font, T.weight),
      color: T.color, "-webkit-text-fill-color": T.color, "line-height": String(T.lineHeight), "letter-spacing": `${T.spacing}em`,
      "text-shadow": textShadow(T), margin: "0", padding: "0", "white-space": "pre-wrap", "overflow-wrap": "anywhere",
    });
  }

  function portraitRules(st, w) {
    const PT = st.portrait;
    w.comment(TX("css.portrait"));
    if (!PT.show) {
      w.add(SEL.portrait, { display: "none" });
      return;
    }
    const left = PT.side !== "right";
    w.add(SEL.portrait, {
      display: "block", position: "absolute", bottom: `calc(100% - ${px(PT.y)})`, top: "auto",
      left: left ? px(PT.x) : "auto", right: left ? "auto" : px(PT.x),
      width: px(PT.width), height: "auto", "max-height": px(PT.maxH), "object-fit": "contain",
      "object-position": `${left ? "left" : "right"} bottom`, margin: "0",
      transform: PT.flip ? "scaleX(-1)" : "none", "transform-origin": "bottom center",
      "z-index": PT.layer === "front" ? "2" : "-1",
    });
  }

  function diceRules(st, w) {
    const D = st.dice, PT = st.portrait;
    w.comment(TX("css.dice"));
    if (!D.show) {
      w.add(SEL.dice, { display: "none" });
      return;
    }
    // Away from the portrait, and above the name plate's row when there is one.
    const onLeft = PT.show && PT.side === "right";
    const lift = isPlate(st) ? Math.round(st.name.size * 1.9) : 4;
    w.add(SEL.dice, {
      display: "flex", "flex-wrap": "wrap-reverse", "justify-content": "center", position: "absolute",
      bottom: `calc(100% + ${px(lift)})`, top: "auto", left: onLeft ? "16px" : "auto", right: onLeft ? "auto" : "16px",
      margin: "0", "z-index": "-1",
    });
    w.add(`${SEL.dice} > img`, { width: px(D.size), height: px(D.size) });
  }

  // ---------------------------------------------------------------- build

  function build(st, opts) {
    opts = opts || {};
    const w = new Writer();
    const design = P.DESIGNS[st.design];
    const uses = [[st.text.font, st.text.weight, st.text.fontName]];
    if (st.name.show) uses.push([st.name.font, st.name.weight, st.name.fontName]);
    if (st.result.show) uses.push([st.result.font, st.result.weight, st.result.fontName]);

    w.raw([
      "/* ==========================================================================",
      `   ${TX("css.head.title")}`,
      `   ${design ? TX("css.head.madeWithDesign", safeComment(TX(design.label))) : TX("css.head.madeWith")}`,
      "   --------------------------------------------------------------------------",
      `   ■ ${TX("css.head.url")}`,
      `       ${safeComment(opts.url || TX("css.head.urlSample"))}`,
      `   ■ ${TX("css.head.size", st.source.w, st.source.h)}`,
      `   ■ ${TX("css.head.only")}`,
      `       ${TX("css.head.only1")}`,
      ...(st.box.buttons === "hover" ? [`       ${TX("css.head.close")}`] : []),
      ...(st.dice.show ? [`   ■ ${TX("css.head.dice")}`] : []),
      `   ■ ${TX("css.head.audio1")}`,
      `       ${TX("css.head.audio2")}`,
      ...pcFontNote(uses),
      "   ========================================================================== */",
    ].join("\n"));

    const imports = fontImports(uses);
    if (imports.length) w.raw(imports.join("\n"));

    pageRules(w);
    layoutRules(st, w);
    boxRules(st, w);
    headRules(st, w);
    nameRules(st, w);
    resultRules(st, w);
    textRules(st, w);
    portraitRules(st, w);
    diceRules(st, w);
    return w.out.join("\n") + "\n";
  }

  window.MboxCss = { build, SEL, rgba, weightOf, family, contrastText };
})();
