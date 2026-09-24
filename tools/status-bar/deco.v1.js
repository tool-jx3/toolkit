/*!
 * deco.v1.js - decorations, the wearing-away effect and alerts, called from BarCss.build()
 *
 * Each decoration gets (ctx, options) and may:
 *   ctx.boxLayers.push({ image, size, position, repeat })   an overlay on the bar, clipped to its shape
 *   ctx.boxFilters.push("drop-shadow(...)")                  a filter on the bar box (outside the clip)
 *   Object.assign(ctx.rootDecls, {...})                      styles on the whole card (#root)
 *   ctx.rootExtent = n                                       pixels drawn outside #root (added to its margin)
 *   ctx.w.add(selector, decls, softProps)                    any other rule
 *   ctx.keyframe(name, body)                                 a @keyframes block
 *
 * Pseudo-elements in use, so decorations don't collide:
 *   bar box ::after  = border + boxLayers + cracks   fill ::before = sheen    fill ::after = tip
 *   row ::before     = icon or item strip (core)     row ::after   = brackets
 *   #root ::before   = frame                         #root ::after = (free)
 *   #root > div ::before / ::after, side ::before, badge ::after = name (core)
 */
(function () {
  "use strict";

  const DECOS = {
    panel(ctx, o) {
      const { rgba, px, S } = ctx;
      const images = [];
      if (o.texture === "paper") {
        images.push(
          { image: "radial-gradient(ellipse at 50% 35%, rgba(255, 255, 255, 0.22), transparent 60%)", size: "100% 100%" },
          { image: "radial-gradient(ellipse at center, transparent 45%, rgba(90, 55, 20, 0.32) 100%)", size: "100% 100%" },
          { image: S.grainUrl(0.22, 160), size: "160px 160px" });
      }
      if (o.texture === "grain") images.push({ image: S.grainUrl(0.35, 140), size: "140px 140px" });
      Object.assign(ctx.rootDecls, {
        padding: px(o.pad),
        "padding-left": o.accentLine ? px(o.pad + 4) : undefined,
        "background-color": rgba(o.color, o.alpha),
        "background-image": images.length ? images.map(i => i.image).join(", ") : "none",
        "background-size": images.length ? images.map(i => i.size).join(", ") : undefined,
        "border-radius": px(o.radius),
        border: o.borderW > 0 ? `${px(o.borderW)} solid ${rgba(o.borderColor, o.borderAlpha)}` : "none",
        "box-shadow": o.accentLine ? "inset 4px 0 0 var(--pc)" : "none",
      });
    },

    // A box around everything (#root::before), drawn outside the content without changing the layout.
    frame(ctx, o) {
      const { px, rgba } = ctx;
      const color = o.useCharColor
        ? (o.alpha >= 1 ? "var(--pc)" : `color-mix(in srgb, var(--pc) ${Math.round(o.alpha * 100)}%, transparent)`)
        : rgba(o.color, o.alpha);
      const w = Math.max(1, o.width);
      const corners = thick => {
        const bar = (pos, size) => `linear-gradient(${color}, ${color}) ${pos} / ${size} no-repeat`;
        return ["left top", "right top", "left bottom", "right bottom"]
          .flatMap(pos => [bar(pos, `${px(o.len)} ${px(thick)}`), bar(pos, `${px(thick)} ${px(o.len)}`)]).join(", ");
      };
      const decls = {
        content: '""', position: "absolute", top: px(-o.offset), right: px(-o.offset), bottom: px(-o.offset), left: px(-o.offset),
        "box-sizing": "border-box", "border-radius": px(Math.max(0, o.radius)), "pointer-events": "none",
        border: "none", background: "none", "box-shadow": "none",
      };
      let thick = w;
      switch (o.style) {
        case "double":
          thick = Math.max(3, w * 3);
          decls.border = `${px(thick)} double ${color}`;
          break;
        case "dashed":
          decls.border = `${px(w)} dashed ${color}`;
          break;
        case "glow":
          decls.border = `${px(w)} solid ${color}`;
          decls["box-shadow"] = `0 0 ${px(w * 5)} ${color}, inset 0 0 ${px(w * 4)} ${color}`;
          thick = w * 6;
          break;
        case "corners":
          decls.background = corners(w);
          decls["border-radius"] = "0";
          break;
        case "lineCorners":
          thick = w * 2;
          decls.border = `${px(Math.max(1, w / 2))} solid ${color}`;
          decls.background = corners(w * 2);
          decls["background-origin"] = "border-box";
          decls["border-radius"] = "0";
          break;
        default:
          decls.border = `${px(w)} solid ${color}`;
      }
      ctx.w.add("#root::before", decls);
      ctx.rootExtent = Math.max(ctx.rootExtent, o.offset + thick);
    },

    gloss(ctx, o) {
      const a = ctx.round(o.alpha);
      ctx.boxLayers.push({
        image: `linear-gradient(180deg, rgba(255, 255, 255, ${a}) 0%, rgba(255, 255, 255, ${ctx.round(o.alpha * 0.35)}) 46%, rgba(255, 255, 255, 0) 50%)`,
        size: "100% 100%", position: "0 0", repeat: "no-repeat",
      });
    },

    glow(ctx, o) {
      ctx.boxFilters.push(`drop-shadow(0 0 ${ctx.px(o.size)} color-mix(in srgb, var(--c1) ${Math.round(o.alpha * 100)}%, transparent))`);
    },

    tip(ctx, o) {
      ctx.w.add(ctx.SEL.row + ctx.PART.fill + "::after", {
        content: '""', position: "absolute", top: "0", right: "0", width: "3px", height: "100%", "pointer-events": "none",
        background: `rgba(255, 255, 255, ${ctx.round(o.alpha)})`, "box-shadow": "0 0 6px 2px color-mix(in srgb, var(--c1) 55%, #fff)",
      });
    },

    sheen(ctx, o) {
      const { px, g } = ctx;
      const band = Math.max(40, g.qW * 0.4);
      ctx.w.add(ctx.SEL.row + ctx.PART.fill + "::before", {
        content: '""', position: "absolute", left: "0", top: "0", width: px(band), height: "100%", "pointer-events": "none",
        background: `linear-gradient(100deg, transparent 15%, rgba(255, 255, 255, ${ctx.round(o.alpha)}) 50%, transparent 85%)`,
        transform: `translateX(${px(-band)})`, animation: `sb-sheen ${ctx.round(o.duration, 10)}s ease-in-out infinite`,
      }, ["transform"]);
      ctx.keyframe("sb-sheen", `0% { transform: translateX(${px(-band)}); } 40%, 100% { transform: translateX(${px(g.qW)}); }`);
    },

    scanlines(ctx, o) {
      ctx.boxLayers.push({
        image: `repeating-linear-gradient(180deg, rgba(0, 0, 0, ${ctx.round(o.alpha)}) 0 1px, transparent 1px ${ctx.px(o.gap)})`,
        size: "100% 100%", position: "0 0", repeat: "no-repeat",
      });
    },

    ticks(ctx, o) {
      const { px, g } = ctx;
      const step = g.qW / Math.max(2, o.div), c = ctx.rgba(o.color, o.alpha);
      ctx.boxLayers.push({
        image: `repeating-linear-gradient(90deg, transparent 0 ${px(step - 1)}, ${c} ${px(step - 1)} ${px(step)})`,
        size: `${px(g.qW)} 40%`, position: "left bottom", repeat: "no-repeat",
      });
    },

    grain(ctx, o) {
      ctx.boxLayers.push({ image: ctx.S.grainUrl(o.alpha, 100), size: "100px 100px", position: "0 0", repeat: "repeat" });
    },

    brackets(ctx, o) {
      const { px } = ctx;
      const c = ctx.rgba(o.color, o.alpha), len = px(o.len), thick = px(o.width);
      const bar = (pos, size) => `linear-gradient(${c}, ${c}) ${pos} / ${size} no-repeat`;
      const corners = ["left top", "right top", "left bottom", "right bottom"];
      ctx.w.add(ctx.SEL.row + "::after", {
        content: '""', "grid-area": "1 / 1 / -1 / -1", "align-self": "stretch", "justify-self": "stretch", margin: px(-o.offset),
        position: "relative", "z-index": "3", "pointer-events": "none",
        background: corners.flatMap(pos => [bar(pos, `${len} ${thick}`), bar(pos, `${thick} ${len}`)]).join(", "),
      });
    },
  };

  function decorate(ctx) {
    for (const [key, fn] of Object.entries(DECOS)) {
      const o = ctx.st.decos[key];
      if (o && o.on) fn(ctx, o);
    }
  }

  // ---------------------------------------------------------------- remaining ratio

  const ZERO = ':where([style^="width: 0%"])';

  // The fill's style is "width: 12.3456%;". below(b) matches every width under b percent (b: whole
  // number). Leading digits keep the list short: "width: 2" alone covers 2, 2.x and 20-29.x. Only
  // "width: 1…" also hits 100, so it excludes that. :where() gives every threshold rule the same
  // specificity, so among several matching thresholds the one written last wins.
  const pre = v => `[style^="width: ${v}"]`;

  function belowList(b) {
    b = Math.round(b);
    if (b <= 0) return [":not(*)"];
    if (b >= 101) return ["*"];
    if (b === 100) return [`:not(${pre(100)})`];
    const list = [pre(0)];
    // TN = tens digit (not T: that name is the global i18n function).
    const TN = Math.floor(b / 10), u = b % 10;
    for (let d = Math.max(1, TN); d <= Math.min(9, b - 1); d++) list.push(pre(d + "%"), pre(d + "."));
    for (let t = 1; t < TN; t++) list.push(t === 1 ? `${pre(1)}:not(${pre(100)})` : pre(t));
    if (TN >= 1) for (let v = 0; v < u; v++) list.push(TN === 1 && v === 0 ? `${pre(10)}:not(${pre(100)})` : pre(`${TN}${v}`));
    return list;
  }

  const below = b => `:where(${belowList(b).join(", ")})`;

  // The fill's width p <= t (t: any number from 0 to 100). A whole t is exact (below t, or exactly t);
  // otherwise it rounds up to the next whole number, off by less than 1 % of the bar.
  // eff orders the conditions: a condition holds whenever one with a smaller eff holds.
  function atMost(t) {
    if (t <= 0) return { eff: 0, sel: ZERO };
    const r = Math.round(t);
    if (Math.abs(t - r) < 1e-6) return { eff: r + 0.5, sel: `:where(${[...belowList(r), pre(r + "%")].join(", ")})` };
    return { eff: Math.ceil(t), sel: below(Math.ceil(t)) };
  }

  const fillIs = cond => `:has(> div:nth-child(2) > div:nth-child(2)${cond})`;

  // ---------------------------------------------------------------- wearing away

  // As the remaining ratio falls, the bar cracks (75 / 50 / 25 %, shattered at 0) and the items
  // beside it break one by one from the right. Each look is a range of the fill's width. Every range
  // uses its own animation name, so entering a range plays the "just broke" flash once.
  function damage(ctx) {
    const { st, w, SEL, PART, g } = ctx, D = st.damage, I = window.BarItems;
    if (!D || !I || (!D.cracks && !g.itemCount)) return;

    w.comment(T("css.comment.damage"));
    st.bars.slice(0, g.count).forEach((b, i) => {
      const vars = {};
      if (g.itemCount) I.frames(b.item, b).forEach((url, f) => { vars[`--i${f}`] = url; });
      if (D.cracks) for (let s = 1; s <= 4; s++) vars[`--k${s}`] = I.crackUrl(g.qW, st.layout.height, s, i + 1, D.crackColor, D.crackAlpha);
      w.add(ctx.row(i + 1), vars);
    });

    if (D.cracks) {
      w.comment(T("css.comment.cracks"));
      // Every stage restates the whole overlay; long images (the border) go into variables written once.
      const base = ctx.overlayLayers.map((l, i) => (l.image.startsWith("url(") ? Object.assign({}, l, { image: `var(--ov${i})`, raw: l.image }) : l));
      const saved = base.filter(l => l.raw);
      if (saved.length) w.add(SEL.row, Object.fromEntries(saved.map(l => [l.image.slice(4, -1), l.raw])));
      const at = st.bar.borderW > 0 ? 1 : 0;
      [[1, below(75)], [2, below(50)], [3, below(25)], [4, ZERO]].forEach(([s, cond]) => {
        const list = base.slice();
        list.splice(at, 0, { image: `var(--k${s})`, size: "100% 100%", position: "0 0", repeat: "no-repeat" });
        w.add(SEL.row + fillIs(cond) + PART.box + "::after", {
          "background-image": list.map(l => l.image).join(", "), "background-size": list.map(l => l.size).join(", "),
          "background-position": list.map(l => l.position).join(", "), "background-repeat": list.map(l => l.repeat).join(", "),
          animation: D.flash ? `sb-crack${s} 0.6s ease-out` : "none",
        });
        if (D.flash) ctx.keyframe(`sb-crack${s}`, "0% { filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 4px #fff) brightness(1.6); }");
      });
    }

    if (g.itemCount) {
      w.comment(T("css.comment.itemsBreak"));
      const n = g.itemCount, keys = [];
      // Item j (1..n) holds the share (j-1)/n .. j/n of the bar; f = how much of that share is left.
      // Frame k (1..4) begins when f <= (4-k)/4, i.e. when the remaining width p <= t.
      for (let j = 1; j <= n; j++) {
        for (let k = 1; k <= 4; k++) keys.push(Object.assign({ j, k }, atMost(100 * (j - 1 + (4 - k) / 4) / n)));
      }
      // Loosest condition first: when several hold, the tighter one written later wins.
      const bounds = [...new Map(keys.map(x => [x.eff, x.sel]))].sort((a, b) => b[0] - a[0]);
      bounds.forEach(([eff, sel], idx) => {
        const frames = Array.from({ length: n }, (_, j0) =>
          Math.max(0, ...keys.filter(x => x.j === j0 + 1 && x.eff >= eff).map(x => x.k)));
        w.add(SEL.row + fillIs(sel) + "::before", {
          "background-image": frames.map(f => `var(--i${f})`).join(", "),
          animation: D.flash ? `sb-item${idx} 0.5s ease-out` : "none",
        });
        if (D.flash) ctx.keyframe(`sb-item${idx}`, "0% { transform: scale(1.3); filter: brightness(1.8); }");
      });
    }
  }

  // ---------------------------------------------------------------- alerts

  const BLINK = "50% { opacity: 0.25; }";

  function alerts(ctx) {
    const { st, w, SEL, PART, row, g } = ctx, A = st.alert;

    w.comment(T("css.comment.red"));
    const red = `${SEL.row}${PART.current}[color="secondary"]`;
    if (A.red80) {
      w.add(red, { color: A.redColor, animation: A.redBlink ? "sb-blink 1.2s steps(1) infinite" : "none" });
      if (A.redBlink) ctx.keyframe("sb-blink", BLINK);
    } else {
      w.add(red, { color: st.text.color });
    }

    const targets = st.bars.slice(0, g.count).map((b, i) => (b.low ? i + 1 : 0)).filter(Boolean);
    if (A.lowOn && targets.length) {
      const at = Math.min(99, Math.max(1, Math.round(A.lowAt)));
      const has = fillIs(below(at));
      const rows = targets.length === g.count ? [SEL.row] : targets.map(i => row(i));
      const low = rows.map(s => s + has);
      w.comment(T("css.comment.low", at));
      if (A.lowFill) w.add(low, { "--c1": A.lowColor, "--c2": `color-mix(in srgb, ${A.lowColor} 55%, #000)` });
      if (A.lowText) w.add(low.flatMap(s => [s + PART.value, s + PART.current]), { color: A.lowColor });
      if (A.lowPulse) {
        w.add(low.map(s => s + PART.box), { animation: "sb-pulse 1.1s ease-in-out infinite" });
        const base = ctx.baseFilter === "none" ? "" : ctx.baseFilter + " ";
        ctx.keyframe("sb-pulse", `0%, 100% { filter: ${ctx.baseFilter}; } 50% { filter: ${base}drop-shadow(0 0 6px ${A.lowColor}) brightness(1.3); }`);
      }
      if (A.lowBlink) {
        w.add(low.map(s => s + PART.fill), { animation: [...ctx.fillAnimations, "sb-blink 0.9s steps(1) infinite"].join(", ") });
        ctx.keyframe("sb-blink", BLINK);
      }
      if (A.lowShake) {
        w.add(low, { animation: "sb-shake 0.35s linear infinite" });
        ctx.keyframe("sb-shake", "0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-1.5px, 0.5px); } 50% { transform: translate(1.5px, -0.5px); } 75% { transform: translate(-1px, -0.5px); }");
      }
    }

    if (A.zeroOn && (A.zeroGray || A.zeroBlink)) {
      const zero = SEL.row + fillIs(ZERO);
      w.comment(T("css.comment.zero"));
      if (A.zeroGray) w.add(zero, { filter: "grayscale(1) brightness(0.8)" });
      if (A.zeroBlink) {
        w.add([zero + PART.label, zero + PART.value], { animation: "sb-blink 1s steps(1) infinite" });
        ctx.keyframe("sb-blink", BLINK);
      }
    }
  }

  window.BarDeco = { DECOS, decorate, damage, alerts, below };
})();
