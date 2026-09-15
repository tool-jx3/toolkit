/*!
 * presets.v1.js - static data: fonts, icons, shapes, decorations, design templates
 *
 * Adding things:
 *   - a font:       add an entry to FONTS (weights must exist on Google Fonts, or the whole import fails)
 *   - a shape:      add a label here and a path function in shapes.v1.js (BarShapes.PATHS)
 *   - a decoration: add an entry to DECO_TYPES and a CSS function in css.v1.js (BarCss.DECOS)
 *   - a design:     add an entry to DESIGNS; it is merged over BASE_LOOK
 */
(function () {
  "use strict";

  const SANS = '"Yu Gothic UI","Yu Gothic","Meiryo",sans-serif';
  const SERIF = '"Yu Mincho","YuMincho","Hiragino Mincho ProN",serif';
  /* TRPG Toolkit 合輯：繁體中文字型的後備堆疊。網頁字型載不到時，
     退回觀看者電腦上的台灣系統字型，而不是日文字型。 */
  const TC_SANS = '"Microsoft JhengHei","微軟正黑體","PingFang TC","Heiti TC",sans-serif';
  const TC_SERIF = '"PMingLiU","新細明體","Songti TC",serif';
  const TC_KAI = '"DFKai-SB","標楷體","BiauKai","Kaiti TC",serif';

  // weights: verified against fonts.googleapis.com/css2 (2026-09-14). null = installed font, no import.
  const FONTS = {
    notosans: { label: "font.notosans", family: "Noto Sans JP", weights: [400, 500, 700, 800, 900], stack: SANS },
    mplus: { label: "font.mplus", family: "M PLUS 1p", weights: [400, 500, 700, 800, 900], stack: SANS },
    mplusround: { label: "font.mplusround", family: "M PLUS Rounded 1c", weights: [400, 500, 700, 800, 900], stack: SANS },
    zenkaku: { label: "font.zenkaku", family: "Zen Kaku Gothic New", weights: [400, 500, 700, 900], stack: SANS },
    zenmaru: { label: "font.zenmaru", family: "Zen Maru Gothic", weights: [400, 500, 700, 900], stack: SANS },
    kosugimaru: { label: "font.kosugimaru", family: "Kosugi Maru", weights: [400], stack: SANS },
    bizud: { label: "font.bizud", family: "BIZ UDPGothic", weights: [400, 700], stack: SANS },
    murecho: { label: "font.murecho", family: "Murecho", weights: [400, 500, 700, 800, 900], stack: SANS },
    delagothic: { label: "font.delagothic", family: "Dela Gothic One", weights: [400], stack: SANS },
    mochiypop: { label: "font.mochiypop", family: "Mochiy Pop One", weights: [400], stack: SANS },
    dotgothic: { label: "font.dotgothic", family: "DotGothic16", weights: [400], stack: SANS },
    reggae: { label: "font.reggae", family: "Reggae One", weights: [400], stack: SANS },
    kiwimaru: { label: "font.kiwimaru", family: "Kiwi Maru", weights: [400, 500], stack: SANS },
    hachimaru: { label: "font.hachimaru", family: "Hachi Maru Pop", weights: [400], stack: SANS },
    klee: { label: "font.klee", family: "Klee One", weights: [400, 600], stack: SANS },
    notoserif: { label: "font.notoserif", family: "Noto Serif JP", weights: [400, 500, 700, 800, 900], stack: SERIF },
    shippori: { label: "font.shippori", family: "Shippori Mincho B1", weights: [400, 500, 600, 700, 800], stack: SERIF },
    zenold: { label: "font.zenold", family: "Zen Old Mincho", weights: [400, 500, 600, 700, 900], stack: SERIF },
    kaisei: { label: "font.kaisei", family: "Kaisei Decol", weights: [400, 500, 700], stack: SERIF },
    yujisyuku: { label: "font.yujisyuku", family: "Yuji Syuku", weights: [400], stack: SERIF },
    yujiboku: { label: "font.yujiboku", family: "Yuji Boku", weights: [400], stack: SERIF },
    zenantique: { label: "font.zenantique", family: "Zen Antique", weights: [400], stack: SERIF },
    kurenaido: { label: "font.kurenaido", family: "Zen Kurenaido", weights: [400], stack: SANS },
    // TRPG Toolkit 合輯追加：繁體中文。weights 同樣逐一對 fonts.googleapis.com/css2 驗證過
    notosanstc: { label: "font.notosanstc", family: "Noto Sans TC", weights: [400, 500, 700, 800, 900], stack: TC_SANS },
    notoseriftc: { label: "font.notoseriftc", family: "Noto Serif TC", weights: [400, 500, 700, 800, 900], stack: TC_SERIF },
    wenkaitc: { label: "font.wenkaitc", family: "LXGW WenKai TC", weights: [300, 400, 700], stack: TC_KAI },
    chocolatetc: { label: "font.chocolatetc", family: "Chocolate Classical Sans", weights: [400], stack: TC_SANS },
    cactustc: { label: "font.cactustc", family: "Cactus Classical Serif", weights: [400], stack: TC_SERIF },
    orbitron: { label: "font.orbitron", family: "Orbitron", weights: [400, 500, 700, 800, 900], stack: SANS },
    rajdhani: { label: "font.rajdhani", family: "Rajdhani", weights: [400, 500, 600, 700], stack: SANS },
    oswald: { label: "font.oswald", family: "Oswald", weights: [400, 500, 600, 700], stack: SANS },
    sharetech: { label: "font.sharetech", family: "Share Tech Mono", weights: [400], stack: SANS },
    chakra: { label: "font.chakra", family: "Chakra Petch", weights: [400, 500, 600, 700], stack: SANS },
    teko: { label: "font.teko", family: "Teko", weights: [400, 500, 600, 700], stack: SANS },
    bebas: { label: "font.bebas", family: "Bebas Neue", weights: [400], stack: SANS },
    russo: { label: "font.russo", family: "Russo One", weights: [400], stack: SANS },
    pressstart: { label: "font.pressstart", family: "Press Start 2P", weights: [400], stack: SANS },
    silkscreen: { label: "font.silkscreen", family: "Silkscreen", weights: [400, 700], stack: SANS },
    vt323: { label: "font.vt323", family: "VT323", weights: [400], stack: SANS },
    cinzel: { label: "font.cinzel", family: "Cinzel", weights: [400, 500, 600, 700, 800, 900], stack: SERIF },
    cormorant: { label: "font.cormorant", family: "Cormorant Garamond", weights: [400, 500, 600, 700], stack: SERIF },
    barlowcond: { label: "font.barlowcond", family: "Barlow Condensed", weights: [400, 500, 600, 700, 800, 900], stack: SANS },
    yugothic: { label: "font.yugothic", family: "Yu Gothic UI", weights: null, stack: SANS },
    meiryo: { label: "font.meiryo", family: "Meiryo", weights: null, stack: SANS },
    yumincho: { label: "font.yumincho", family: "Yu Mincho", weights: null, stack: SERIF },
  };

  const WEIGHTS = [[400, "weight.400"], [500, "weight.500"], [600, "weight.600"], [700, "weight.700"], [800, "weight.800"], [900, "weight.900"]];

  const ICONS = [
    ["none", "icon.none"], ["heart", "icon.heart"], ["drop", "icon.drop"], ["star", "icon.star"], ["sparkle", "icon.sparkle"],
    ["eye", "icon.eye"], ["moon", "icon.moon"], ["bolt", "icon.bolt"], ["shield", "icon.shield"], ["cross", "icon.cross"],
    ["clover", "icon.clover"], ["skull", "icon.skull"], ["flame", "icon.flame"], ["dot", "icon.dot"],
  ];

  const SHAPES = [
    ["rect", "shape.rect"], ["pill", "shape.pill"], ["slant", "shape.slant"],
    ["chamfer", "shape.chamfer"], ["arrow", "shape.arrow"], ["tag", "shape.tag"],
  ];

  const FILLS = [
    ["flat", "fill.flat"], ["vgrad", "fill.vgrad"], ["hgrad", "fill.hgrad"],
    ["gloss", "fill.gloss"], ["stripes", "fill.stripes"], ["neon", "fill.neon"],
  ];

  const TRACKS = [["dark", "track.dark"], ["tint", "track.tint"], ["none", "track.none"]];

  const TEXT_LAYOUTS = [
    ["overlay", "textLayout.overlay"], ["above", "textLayout.above"], ["below", "textLayout.below"],
    ["side", "textLayout.side"], ["labelSide", "textLayout.labelSide"],
  ];

  const ALIGNS = [["split", "textAlign.split"], ["valueCenter", "textAlign.valueCenter"], ["center", "textAlign.center"]];

  const VALUE_MODES = [["both", "valueMode.both"], ["current", "valueMode.current"], ["none", "valueMode.none"]];

  const OUTLINES = [["shadow", "outline.shadow"], ["stroke", "outline.stroke"], ["glow", "outline.glow"], ["none", "outline.none"]];

  const NAME_POS = [
    ["top", "namePos.top"], ["barsTop", "namePos.barsTop"], ["bottom", "namePos.bottom"],
    ["left", "namePos.left"], ["avatar", "namePos.avatar"], ["none", "namePos.none"],
  ];

  const NAME_STYLES = [
    ["plate", "nameStyle.plate"], ["text", "nameStyle.text"], ["underline", "nameStyle.underline"],
    ["sidebar", "nameStyle.sidebar"], ["tab", "nameStyle.tab"], ["badge", "nameStyle.badge"],
  ];

  // controls: [key, label, type, min, max, step, fmt]  type: range | color | check | select(options in min)
  const DECO_TYPES = {
    panel: {
      label: "deco.panel", desc: "deco.panel.desc",
      defaults: { on: false, color: "#0e1016", alpha: 0.85, radius: 10, borderW: 1, borderColor: "#ffffff", borderAlpha: 0.12, pad: 10, accentLine: false, texture: "none" },
      controls: [
        ["color", "deco.panel.color", "color"], ["alpha", "deco.panel.alpha", "range", 0, 1, 0.01, "pct"],
        ["radius", "deco.panel.radius", "range", 0, 40, 1], ["pad", "deco.panel.pad", "range", 0, 40, 1],
        ["borderW", "deco.panel.borderW", "range", 0, 6, 1], ["borderColor", "deco.panel.borderColor", "color"], ["borderAlpha", "deco.panel.borderAlpha", "range", 0, 1, 0.01, "pct"],
        ["accentLine", "deco.panel.accentLine", "check"],
        ["texture", "deco.panel.texture", "select", [["none", "decoOpt.none"], ["paper", "decoOpt.paper"], ["grain", "decoOpt.grain"]]],
      ],
    },
    frame: {
      label: "deco.frame", desc: "deco.frame.desc",
      defaults: { on: false, style: "solid", width: 2, color: "#ffffff", alpha: 0.8, useCharColor: false, offset: 6, radius: 8, len: 16 },
      controls: [
        ["style", "deco.frame.style", "select", [["solid", "decoOpt.solid"], ["double", "decoOpt.double"], ["dashed", "decoOpt.dashed"], ["glow", "decoOpt.glow"], ["corners", "decoOpt.corners"], ["lineCorners", "decoOpt.lineCorners"]]],
        ["width", "deco.frame.width", "range", 1, 8, 1],
        ["useCharColor", "deco.frame.useCharColor", "check"],
        ["color", "deco.frame.color", "color", null, null, null, null, "decos.frame.useCharColor=false"],
        ["alpha", "deco.frame.alpha", "range", 0.05, 1, 0.05, "pct"],
        ["offset", "deco.frame.offset", "range", -12, 24, 1],
        ["radius", "deco.frame.radius", "range", 0, 40, 1, null, "decos.frame.style=solid|double|dashed|glow"],
        ["len", "deco.frame.len", "range", 4, 60, 1, null, "decos.frame.style=corners|lineCorners"],
      ],
    },
    gloss: {
      label: "deco.gloss", desc: "deco.gloss.desc",
      defaults: { on: false, alpha: 0.3 },
      controls: [["alpha", "deco.gloss.alpha", "range", 0.05, 1, 0.05, "pct"]],
    },
    glow: {
      label: "deco.glow", desc: "deco.glow.desc",
      defaults: { on: false, size: 6, alpha: 0.6 },
      controls: [["size", "deco.glow.size", "range", 1, 20, 1], ["alpha", "deco.glow.alpha", "range", 0.05, 1, 0.05, "pct"]],
    },
    tip: {
      label: "deco.tip", desc: "deco.tip.desc",
      defaults: { on: false, alpha: 0.85 },
      controls: [["alpha", "deco.tip.alpha", "range", 0.1, 1, 0.05, "pct"]],
    },
    sheen: {
      label: "deco.sheen", desc: "deco.sheen.desc",
      defaults: { on: false, alpha: 0.35, duration: 4 },
      controls: [["alpha", "deco.sheen.alpha", "range", 0.05, 1, 0.05, "pct"], ["duration", "deco.sheen.duration", "range", 1, 12, 0.5]],
    },
    scanlines: {
      label: "deco.scanlines", desc: "deco.scanlines.desc",
      defaults: { on: false, alpha: 0.25, gap: 3 },
      controls: [["alpha", "deco.scanlines.alpha", "range", 0.05, 1, 0.05, "pct"], ["gap", "deco.scanlines.gap", "range", 2, 8, 1]],
    },
    ticks: {
      label: "deco.ticks", desc: "deco.ticks.desc",
      defaults: { on: false, div: 10, alpha: 0.5, color: "#ffffff" },
      controls: [["div", "deco.ticks.div", "range", 2, 20, 1], ["color", "deco.ticks.color", "color"], ["alpha", "deco.ticks.alpha", "range", 0.05, 1, 0.05, "pct"]],
    },
    grain: {
      label: "deco.grain", desc: "deco.grain.desc",
      defaults: { on: false, alpha: 0.3 },
      controls: [["alpha", "deco.grain.alpha", "range", 0.05, 1, 0.05, "pct"]],
    },
    brackets: {
      label: "deco.brackets", desc: "deco.brackets.desc",
      defaults: { on: false, color: "#6ff3ff", alpha: 0.9, len: 8, width: 2, offset: 4 },
      controls: [
        ["color", "deco.brackets.color", "color"], ["alpha", "deco.brackets.alpha", "range", 0.05, 1, 0.05, "pct"],
        ["len", "deco.brackets.len", "range", 3, 24, 1], ["width", "deco.brackets.width", "range", 1, 4, 1], ["offset", "deco.brackets.offset", "range", 0, 12, 1],
      ],
    },
  };

  const BAR_COLORS = [
    ["#e0563f", "#a51f22", "heart"], ["#4fa3e3", "#1f4f9c", "sparkle"], ["#b487e8", "#5f3a9c", "eye"],
    ["#e8c65a", "#a07c1f", "clover"], ["#5fcf8a", "#23804a", "bolt"], ["#f08fb4", "#a8406a", "shield"],
    ["#7fd6d6", "#2a8080", "moon"], ["#c9c9c9", "#6b6b6b", "dot"],
  ];

  // The look of the default design ("design.standard"). Other designs are patches over this.
  const BASE_LOOK = {
    layout: { direction: "column", columns: 2, width: 320, height: 34, gap: 6, textLayout: "overlay", align: "split",
      labelW: 52, valueW: 86, textGap: 4, pad: 10, outer: 10 },
    avatar: { show: false, pos: "left", w: 88, h: 88, radius: 6, borderW: 1, borderColor: "#ffffff", borderAlpha: 0.6,
      useCharColor: false, fit: "top", gap: 8, bg: "#000000", bgAlpha: 0.5 },
    initiative: { show: false, size: 24, color: "#1b1b1f", bg: "#f2efe6", corner: "tr" },
    bar: { shape: "rect", radius: 6, cut: 10, slant: 12, borderW: 1, borderColor: "#ffffff", borderAlpha: 0.28, double: false,
      track: "dark", trackColor: "#080a0e", trackAlpha: 0.78, tint: 0.25,
      fill: "vgrad", flow: false, segments: 0, segGap: 2, speed: 0.25, shadow: 0.45 },
    colors: BAR_COLORS.map(([c1, c2, icon]) => ({ c1, c2, icon })),
    icons: { show: false, size: 20, gap: 6 },
    text: { labelFont: "notosans", valueFont: "notosans", weight: 700, labelSize: 17, valueSize: 18, maxSize: 12, spacing: 0.04,
      color: "#f2efe6", subColor: "#f2efe6", subAlpha: 0.7, labelByBar: false,
      outline: "shadow", outlineColor: "#000000", outlineAlpha: 0.9, outlineW: 2, showLabel: true, valueMode: "both" },
    name: { pos: "top", style: "plate", font: "notosans", weight: 700, size: 17, color: "#f2efe6", bg: "#080a0e", bgAlpha: 0.88,
      accent: "#c8a45c", useCharColor: false, align: "left", vertical: false, fitHeight: true, overflow: "ellipsis", gap: 6 },
    alert: { red80: true, redColor: "#ff5b5b", redBlink: false,
      lowOn: true, lowAt: 25, lowColor: "#ff3b3b", lowFill: false, lowPulse: true, lowBlink: false, lowShake: false, lowText: true,
      zeroOn: true, zeroGray: true, zeroBlink: false },
    decos: Object.fromEntries(Object.entries(DECO_TYPES).map(([k, t]) => [k, Object.assign({}, t.defaults)])),
  };

  const on = (fields) => Object.assign({ on: true }, fields);
  const colors = list => list.map(([c1, c2, icon]) => ({ c1, c2, icon }));

  const DESIGNS = {
    standard: {
      label: "design.standard", desc: "design.standard.desc",
    },
    minimal: {
      label: "design.minimal", desc: "design.minimal.desc",
      layout: { width: 260, height: 7, gap: 10, textLayout: "above", textGap: 3 },
      bar: { shape: "pill", borderW: 0, track: "tint", trackColor: "#ffffff", trackAlpha: 0.18, tint: 0.3, fill: "flat", shadow: 0 },
      text: { labelFont: "zenkaku", valueFont: "zenkaku", weight: 500, labelSize: 13, valueSize: 17, maxSize: 11, subAlpha: 0.6, outline: "shadow", outlineAlpha: 0.7 },
      name: { style: "text", font: "zenkaku", weight: 700, size: 18, gap: 8 },
      alert: { lowPulse: false, lowText: true },
    },
    hud: {
      label: "design.hud", desc: "design.hud.desc",
      layout: { width: 330, height: 20, gap: 12, textLayout: "side", labelW: 44, valueW: 80, textGap: 8 },
      bar: { shape: "slant", slant: 9, borderW: 1, borderColor: "#6ff3ff", borderAlpha: 0.7, track: "dark", trackColor: "#031018", trackAlpha: 0.8,
        fill: "vgrad", segments: 16, segGap: 2, shadow: 0 },
      colors: colors([["#ff5a78", "#b3123a", "heart"], ["#3fdcff", "#0a6c9c", "bolt"], ["#c792ff", "#6a2bd1", "eye"], ["#ffd84a", "#a88400", "star"],
        ["#63ffa8", "#0f8f4d", "shield"], ["#ff9f43", "#b35a00", "flame"], ["#8af0ff", "#2a8a9c", "moon"], ["#d0d8e0", "#6b7580", "dot"]]),
      text: { labelFont: "orbitron", valueFont: "rajdhani", weight: 700, labelSize: 14, valueSize: 22, maxSize: 14, spacing: 0.08,
        color: "#dffbff", subColor: "#8fd9e8", subAlpha: 0.9, outline: "glow", outlineColor: "#00c8ff", outlineAlpha: 0.55 },
      name: { style: "sidebar", font: "chakra", weight: 700, size: 17, color: "#dffbff", bg: "#031018", bgAlpha: 0.75, accent: "#6ff3ff", gap: 10 },
      alert: { lowColor: "#ff2a4a", lowPulse: true, lowBlink: true, redColor: "#ff6b81" },
      decos: { scanlines: on({ alpha: 0.3, gap: 3 }), brackets: on({ color: "#6ff3ff", alpha: 0.85, len: 7, width: 2, offset: 4 }), tip: on({ alpha: 0.9 }) },
    },
    archive: {
      label: "design.archive", desc: "design.archive.desc",
      layout: { width: 300, height: 14, gap: 9, textLayout: "side", labelW: 48, valueW: 78, textGap: 8 },
      bar: { shape: "chamfer", cut: 4, borderW: 1, borderColor: "#3b2a18", borderAlpha: 0.85, track: "dark", trackColor: "#3b2a18", trackAlpha: 0.15,
        fill: "flat", shadow: 0 },
      colors: colors([["#9c2a22", "#6d1a14", "heart"], ["#2e4a6e", "#1c2f48", "star"], ["#5a3f73", "#2f2240", "eye"], ["#8a6a2a", "#5c4518", "clover"],
        ["#3f6a3a", "#233d20", "bolt"], ["#7a3a52", "#4a1f30", "shield"], ["#3a6a6a", "#1f3d3d", "moon"], ["#5a5048", "#332d28", "dot"]]),
      text: { labelFont: "shippori", valueFont: "shippori", weight: 700, labelSize: 16, valueSize: 19, maxSize: 13, spacing: 0.02,
        color: "#2b2118", subColor: "#2b2118", subAlpha: 0.65, outline: "none" },
      name: { style: "underline", font: "shippori", weight: 800, size: 21, color: "#2b2118", accent: "#7a1f1a", gap: 8 },
      alert: { redColor: "#8a1a1a", lowColor: "#7a0f0f", lowPulse: false, lowBlink: true, lowText: true },
      decos: { panel: on({ color: "#e6d8b8", alpha: 0.96, radius: 2, borderW: 1, borderColor: "#5a4326", borderAlpha: 0.8, pad: 14, texture: "paper" }),
        frame: on({ style: "lineCorners", width: 2, color: "#5a4326", alpha: 0.85, offset: -6, len: 18 }),
        grain: on({ alpha: 0.35 }) },
    },
    wafu: {
      label: "design.wafu", desc: "design.wafu.desc",
      layout: { width: 250, height: 24, gap: 7, textLayout: "overlay", pad: 9 },
      bar: { shape: "rect", radius: 0, borderW: 1, borderColor: "#c9a64a", borderAlpha: 0.95, double: true, track: "dark", trackColor: "#0a0807", trackAlpha: 0.7,
        fill: "vgrad", shadow: 0 },
      colors: colors([["#d0452f", "#8e2416", "flame"], ["#3d5f9e", "#1f3563", "drop"], ["#8a5aa8", "#4d2d66", "moon"], ["#c9a64a", "#7a6020", "clover"],
        ["#4f8a5a", "#28502f", "bolt"], ["#c25b7c", "#7a3048", "sparkle"], ["#5a9a9a", "#2f5a5a", "eye"], ["#9a9086", "#5a524a", "dot"]]),
      text: { labelFont: "zenold", valueFont: "zenold", weight: 700, labelSize: 15, valueSize: 18, maxSize: 12, color: "#f1e6cc", subColor: "#f1e6cc" },
      name: { pos: "left", style: "text", vertical: true, font: "zenold", weight: 900, size: 22, color: "#f1e6cc", gap: 12 },
      alert: { lowColor: "#ff4a2a", redColor: "#ff7a5a" },
      decos: { panel: on({ color: "#14110f", alpha: 0.86, radius: 0, borderW: 1, borderColor: "#c9a64a", borderAlpha: 0.7, pad: 12 }),
        frame: on({ style: "double", width: 1, color: "#c9a64a", alpha: 0.85, offset: 5, radius: 0 }) },
    },
    pop: {
      label: "design.pop", desc: "design.pop.desc",
      layout: { width: 290, height: 28, gap: 8, textLayout: "overlay", pad: 12 },
      bar: { shape: "pill", borderW: 3, borderColor: "#ffffff", borderAlpha: 1, track: "tint", trackColor: "#ffffff", trackAlpha: 0.75, tint: 0.22,
        fill: "stripes", flow: true, shadow: 0.3 },
      colors: colors([["#ff8a9a", "#ff6680", "heart"], ["#7cd0ff", "#4db4f7", "star"], ["#c3a6ff", "#a07ef7", "sparkle"], ["#ffd66b", "#ffbf2e", "clover"],
        ["#7fe0a8", "#4fcc85", "bolt"], ["#ffab7a", "#ff8a4d", "flame"], ["#8ee6e0", "#55cfc6", "drop"], ["#d6d6e0", "#b3b3c2", "dot"]]),
      icons: { show: true, size: 24, gap: 6 },
      text: { labelFont: "mplusround", valueFont: "mplusround", weight: 800, labelSize: 15, valueSize: 18, maxSize: 12, spacing: 0.02,
        color: "#ffffff", subColor: "#ffffff", subAlpha: 0.9, outline: "stroke", outlineColor: "#4a3a66", outlineAlpha: 1, outlineW: 2 },
      name: { style: "badge", font: "mplusround", weight: 800, size: 17, color: "#ffffff", useCharColor: true, accent: "#ff7fa0", gap: 8 },
      alert: { lowPulse: false, lowShake: true, lowText: false, red80: false },
      decos: { gloss: on({ alpha: 0.35 }) },
    },
    horror: {
      label: "design.horror", desc: "design.horror.desc",
      layout: { width: 300, height: 24, gap: 8, textLayout: "overlay", pad: 12 },
      bar: { shape: "tag", cut: 8, borderW: 1, borderColor: "#6a0f0f", borderAlpha: 0.9, track: "dark", trackColor: "#0a0506", trackAlpha: 0.85,
        fill: "vgrad", shadow: 0.6 },
      colors: colors([["#b3141b", "#5c0509", "heart"], ["#3b4a6b", "#1b2233", "drop"], ["#6a2d80", "#2a1033", "eye"], ["#8a7a3a", "#3d3410", "clover"],
        ["#3a6a3a", "#152a15", "bolt"], ["#7a2a4a", "#33101f", "skull"], ["#2a5a5a", "#0f2626", "moon"], ["#5a5050", "#262020", "dot"]]),
      text: { labelFont: "zenantique", valueFont: "zenantique", weight: 400, labelSize: 16, valueSize: 19, maxSize: 13,
        color: "#eadad6", subColor: "#c9b3ad", subAlpha: 0.85, outline: "glow", outlineColor: "#4a0000", outlineAlpha: 1 },
      name: { style: "text", font: "yujiboku", weight: 400, size: 23, color: "#e0cbc5", gap: 6 },
      alert: { lowColor: "#ff1e1e", lowPulse: true, lowShake: true, redColor: "#ff4a4a" },
      decos: { grain: on({ alpha: 0.4 }), glow: on({ size: 7, alpha: 0.45 }) },
    },
    retro: {
      label: "design.retro", desc: "design.retro.desc",
      layout: { width: 300, height: 14, gap: 8, textLayout: "side", labelW: 42, valueW: 92, textGap: 8 },
      bar: { shape: "rect", radius: 0, borderW: 2, borderColor: "#ffffff", borderAlpha: 1, track: "dark", trackColor: "#000000", trackAlpha: 1,
        fill: "flat", segments: 12, segGap: 2, speed: 0.15, shadow: 0 },
      colors: colors([["#3ddc5a", "#1f8f36", "heart"], ["#3da5ff", "#1f5fa8", "star"], ["#ffcc33", "#a88400", "eye"], ["#ff8c3d", "#a84f10", "clover"],
        ["#e05ae0", "#8a2a8a", "bolt"], ["#5ae0e0", "#2a8a8a", "shield"], ["#f0f0f0", "#9a9a9a", "moon"], ["#a0a0a0", "#5a5a5a", "dot"]]),
      text: { labelFont: "dotgothic", valueFont: "dotgothic", weight: 400, labelSize: 16, valueSize: 18, maxSize: 14, spacing: 0.04,
        color: "#ffffff", subColor: "#ffffff", subAlpha: 0.75, outline: "none" },
      name: { style: "text", font: "dotgothic", weight: 400, size: 18, color: "#ffffff", gap: 8 },
      alert: { lowFill: true, lowColor: "#ff3030", lowPulse: false, lowBlink: true, lowText: true, redColor: "#ffd23a" },
      decos: { panel: on({ color: "#000000", alpha: 0.88, radius: 0, borderW: 2, borderColor: "#ffffff", borderAlpha: 1, pad: 12 }) },
    },
    card: {
      label: "design.card", desc: "design.card.desc",
      layout: { width: 220, height: 22, gap: 5, textLayout: "overlay", pad: 8 },
      avatar: { show: true, pos: "left", w: 92, h: 92, radius: 8, borderW: 2, useCharColor: true, fit: "top", gap: 10 },
      initiative: { show: true, size: 24, corner: "tl" },
      bar: { radius: 5 },
      text: { labelSize: 14, valueSize: 16, maxSize: 11 },
      name: { pos: "barsTop", style: "text", size: 17, gap: 6 },
      decos: { panel: on({ color: "#0e1016", alpha: 0.86, radius: 12, borderW: 1, borderColor: "#ffffff", borderAlpha: 0.12, pad: 10, accentLine: true }),
        gloss: on({ alpha: 0.22 }) },
    },
  };

  /* 預覽用的範例狀態名。第一欄是 i18n key（HP・MP・SAN 沒有對應項目，T() 會原樣回傳），
   * 於取用時才取值，因此切換語言後重設，範例名稱也會跟著換。 */
  const SAMPLE_STATUS_DEFS = [["HP", 10, 12], ["MP", 11, 14], ["SAN", 52, 65], ["status.luck", 60, 99],
    ["status.endurance", 5, 10], ["status.spirit", 3, 8], ["status.faith", 40, 50], ["status.money", 120, 300]];

  const CHAR_COLORS = ["#e0563f", "#4fa3e3", "#8fd16a", "#e8c65a", "#b487e8", "#f08fb4", "#5fcfcf", "#f0a05a"];

  window.BarPresets = {
    FONTS, WEIGHTS, ICONS, SHAPES, FILLS, TRACKS, TEXT_LAYOUTS, ALIGNS, VALUE_MODES, OUTLINES,
    NAME_POS, NAME_STYLES, DECO_TYPES, BASE_LOOK, DESIGNS, CHAR_COLORS,
    get SAMPLE_STATUS() { return SAMPLE_STATUS_DEFS.map(([key, now, max]) => [T(key), now, max]); },
  };
})();
