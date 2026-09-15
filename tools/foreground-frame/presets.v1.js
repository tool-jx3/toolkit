/*!
 * presets.v1.js - static data: design templates, variant kinds, decorations, effects
 *
 * Lengths are virtual pixels (canvas treated as 1080 tall). Palettes are
 * [frame1, frame2, accent, text]; time palettes add [tint, tintAlpha].
 */
(function () {
  "use strict";

  const margins = n => ({ t: n, r: n, b: n, l: n });
  const corners = (type, size) => [0, 1, 2, 3].map(() => ({ type, size }));
  const line = (on, width, gap, extra) => Object.assign({ on, width, gap, double: false, color: "accent" }, extra);
  const shadow = (size, opacity, color) => ({ on: true, size, opacity, color: color || "#000000" });
  const ornament = (type, size, gap, width) => ({ type, size, gap, width, color: "accent" });
  const opening = (m, cornerType, cornerSize, extra) => Object.assign({
    shape: "rect", margin: typeof m === "number" ? margins(m) : m, linkMargin: typeof m === "number",
    corners: corners(cornerType, cornerSize), linkCorners: true, outerRadius: 0,
  }, extra);
  const frame = (fill, extra) => Object.assign({
    fill, angle: 180, opacity: 1, grain: 0, innerLine: line(true, 3, 10), outerLine: line(false, 3, 12),
    shadow: shadow(28, 0.35), ornament: ornament("none", 44, 12, 3),
  }, extra);

  const BASE_TIMES = {
    morning: ["#fbf1e3", "#efcdb0", "#d9825a", "#5b4032", "#ffc98a", 0.06],
    day: ["#f2f8fc", "#c3dff1", "#3a8fcb", "#274760", "#ffffff", 0],
    evening: ["#f3bf98", "#9c5277", "#e8733f", "#fff3e6", "#ff7a33", 0.12],
    night: ["#262d4f", "#0d1126", "#d6bf72", "#e8eaf6", "#10205a", 0.28],
  };

  // A design replaces shape, colors and decorations. Layers (images / text) are kept.
  const DESIGNS = {
    simple: {
      get label() { return T("design.simple.label"); }, get desc() { return T("design.simple.desc"); },
      opening: opening(36, "round", 28), frame: frame("linear"),
      palette: ["#f2f8fc", "#c3dff1", "#3a8fcb", "#274760"], times: BASE_TIMES,
      indicator: { style: "badge", pos: "tl", font: "gothic" }, decorations: [],
    },
    mansion: {
      get label() { return T("design.mansion.label"); }, get desc() { return T("design.mansion.desc"); },
      opening: opening(58, "scoop", 46),
      frame: frame("radial", { grain: 0.3, innerLine: line(true, 2, 12, { double: true }), outerLine: line(true, 3, 14),
        shadow: shadow(40, 0.5), ornament: ornament("flourish", 64, 16, 3) }),
      palette: ["#efe6d2", "#c4ab80", "#8a6a35", "#3a2a15"],
      times: {
        morning: ["#e9dcc3", "#b39468", "#7a5a2e", "#3e2c17", "#ffd59a", 0.06],
        day: ["#efe6d2", "#c4ab80", "#8a6a35", "#3a2a15", "#ffffff", 0],
        evening: ["#8a4332", "#3a1c1a", "#e3a35a", "#fbe7cf", "#ff7a33", 0.14],
        night: ["#2e2436", "#120d17", "#c9a85a", "#efe3c8", "#1a1030", 0.3],
      },
      indicator: { style: "label", pos: "tc", font: "mincho" }, decorations: [],
    },
    forest: {
      get label() { return T("design.forest.label"); }, get desc() { return T("design.forest.desc"); },
      opening: opening(56, "round", 34),
      frame: frame("radial", { grain: 0.45, innerLine: line(true, 2, 8), shadow: shadow(44, 0.55) }),
      palette: ["#7c8270", "#3f4538", "#d8c98f", "#f3eedc"],
      indicator: { style: "label", pos: "tc", font: "mincho" },
      decorations: [
        { type: "ivy", placement: "all", coverage: 0.8, density: 0.65 },
        { type: "flowers", placement: "all", density: 0.35 },
      ],
    },
    horror: {
      get label() { return T("design.horror.label"); }, get desc() { return T("design.horror.desc"); },
      opening: opening(46, "notch", 18),
      frame: frame("linear", { grain: 0.5, innerLine: line(true, 2, 6, { color: "#5e1216" }), shadow: shadow(60, 0.75) }),
      palette: ["#2b1719", "#0b0607", "#9b1c1c", "#e9dcd2"],
      indicator: { style: "label", pos: "tc", font: "mincho", bgAlpha: 0 },
      decorations: [
        { type: "drips", placement: "top", density: 0.55 },
        { type: "cobweb", placement: "corners", size: 1.2 },
      ],
    },
    steampunk: {
      get label() { return T("design.steampunk.label"); }, get desc() { return T("design.steampunk.desc"); },
      opening: opening(54, "round", 18),
      frame: frame("radial", { grain: 0.25, innerLine: line(true, 3, 10, { double: true }), outerLine: line(true, 3, 12),
        shadow: shadow(36, 0.55), ornament: ornament("dots", 36, 12, 2) }),
      palette: ["#a07a45", "#3e2c1a", "#e2b45a", "#f7e8c9"],
      indicator: { style: "badge", pos: "tr", font: "serif" },
      decorations: [
        { type: "gears", placement: "corners", size: 1.1 },
        { type: "chain", placement: "top", density: 0.6 },
      ],
    },
    winter: {
      get label() { return T("design.winter.label"); }, get desc() { return T("design.winter.desc"); },
      opening: opening(48, "round", 36),
      frame: frame("linear", { innerLine: line(true, 2, 10), shadow: shadow(30, 0.3, "#34506a") }),
      palette: ["#eef4f9", "#a9c1d4", "#4f7fa6", "#23384a"],
      indicator: { style: "badge", pos: "tl", font: "gothic" },
      decorations: [{ type: "snowcap", placement: "top", density: 0.7 }],
    },
    sakura: {
      get label() { return T("design.sakura.label"); }, get desc() { return T("design.sakura.desc"); },
      opening: opening(40, "round", 26),
      frame: frame("linear", { innerLine: line(true, 2, 8), shadow: shadow(26, 0.25, "#6b3446") }),
      palette: ["#fbeef1", "#e7bfca", "#c25b7c", "#4a2b35"],
      indicator: { style: "label", pos: "tc", font: "mincho" },
      decorations: [{ type: "sakura", placement: "topcorners", size: 1.1, density: 0.6 }],
    },
    cinema: {
      get label() { return T("design.cinema.label"); }, get desc() { return T("design.cinema.desc"); },
      opening: opening({ t: 120, r: 0, b: 120, l: 0 }, "square", 0),
      frame: frame("solid", { innerLine: line(false, 2, 0), shadow: shadow(48, 0.55) }),
      palette: ["#060606", "#060606", "#9fd3ff", "#f4f7fa"],
      times: {
        morning: ["#060606", "#060606", "#f3b37a", "#f4efe8", "#ffc98a", 0.06],
        day: ["#060606", "#060606", "#9fd3ff", "#f4f7fa", "#ffffff", 0],
        evening: ["#060606", "#060606", "#ff8e5a", "#fbe9dc", "#ff7a33", 0.14],
        night: ["#060606", "#060606", "#9aa8ff", "#e3e6ff", "#0a1440", 0.32],
      },
      indicator: { style: "label", pos: "br", font: "mincho", bgAlpha: 0 }, decorations: [],
    },
    novel: {
      get label() { return T("design.novel.label"); }, get desc() { return T("design.novel.desc"); },
      opening: opening({ t: 28, r: 28, b: 250, l: 28 }, "round", 20),
      frame: frame("linear", { innerLine: line(true, 2, 8), shadow: shadow(24, 0.3), ornament: ornament("diamond", 18, 8, 2) }),
      palette: ["#f2f8fc", "#c3dff1", "#3a8fcb", "#274760"], times: BASE_TIMES,
      indicator: { style: "tabs", pos: "br", font: "gothic" }, decorations: [],
    },
    cyber: {
      get label() { return T("design.cyber.label"); }, get desc() { return T("design.cyber.desc"); },
      opening: opening(42, "chamfer", 44),
      frame: frame("linear", { angle: 135, innerLine: line(true, 2, 8), outerLine: line(true, 2, 12),
        shadow: shadow(30, 0.6, "accent"), ornament: ornament("bracket", 64, 4, 4) }),
      palette: ["#122236", "#081221", "#5ef2ff", "#d8fbff"],
      times: {
        morning: ["#10202e", "#06101a", "#5ef2ff", "#d8fbff", "#5ef2ff", 0.05],
        day: ["#122236", "#081221", "#7cf8a8", "#e4ffee", "#ffffff", 0],
        evening: ["#261532", "#12091c", "#ff7ad9", "#ffe6f7", "#ff5ab4", 0.1],
        night: ["#0b0d1e", "#03040c", "#8f7bff", "#e5e0ff", "#1a1260", 0.3],
      },
      indicator: { style: "dial", pos: "tr", font: "sans" },
      decorations: [{ type: "circuit", placement: "sides", density: 0.5 }],
    },
    wa: {
      get label() { return T("design.wa.label"); }, get desc() { return T("design.wa.desc"); },
      opening: opening(48, "notch", 22),
      frame: frame("solid", { grain: 0.35, innerLine: line(true, 2, 10, { double: true }), shadow: shadow(26, 0.35),
        ornament: ornament("dots", 40, 12, 2) }),
      palette: ["#f1ead8", "#d8ccb0", "#2f5d50", "#2b2620"],
      times: {
        morning: ["#efe4cf", "#d9c7a4", "#b5493b", "#3b2e25", "#ffd59a", 0.06],
        day: ["#f1ead8", "#d8ccb0", "#2f5d50", "#2b2620", "#ffffff", 0],
        evening: ["#b8563d", "#6e2c22", "#f2c46b", "#fbeee0", "#ff7a33", 0.14],
        night: ["#1f2733", "#11161e", "#c9a24f", "#e9e1cf", "#0d1a3a", 0.3],
      },
      indicator: { style: "label", pos: "tr", font: "mincho" }, decorations: [],
    },
  };

  // item: [id, name, sub, icon, on, { colors, tint, effect, amount }]
  const VARIANT_KINDS = {
    time: {
      get label() { return T("variantKind.time.label"); }, get desc() { return T("variantKind.time.desc"); }, ownColors: true,
      items: [
        ["morning", "variantKind.time.morning", "MORNING", "sunrise", true], ["day", "variantKind.time.day", "DAYTIME", "sun", true],
        ["evening", "variantKind.time.evening", "EVENING", "sunset", false], ["night", "variantKind.time.night", "NIGHT", "moon", true],
      ],
    },
    weather: {
      get label() { return T("variantKind.weather.label"); }, get desc() { return T("variantKind.weather.desc"); }, ownColors: false,
      items: [
        ["sunny", "variantKind.weather.sunny", "SUNNY", "sun", true, {}],
        ["cloudy", "variantKind.weather.cloudy", "CLOUDY", "cloud", true, { tint: ["#8a929c", 0.12], effect: "fog", amount: 0.25 }],
        ["rain", "variantKind.weather.rain", "RAIN", "rain", true, { tint: ["#5c6f86", 0.18], effect: "rain", amount: 0.6 }],
        ["snow", "variantKind.weather.snow", "SNOW", "snow", true, { tint: ["#dfe8f2", 0.1], effect: "snow", amount: 0.6 }],
        ["fog", "variantKind.weather.fog", "FOG", "fog", false, { tint: ["#c9ced4", 0.12], effect: "fog", amount: 0.75 }],
        ["storm", "variantKind.weather.storm", "STORM", "bolt", false, { tint: ["#1f2533", 0.3], effect: "storm", amount: 0.7 }],
      ],
    },
    season: {
      get label() { return T("variantKind.season.label"); }, get desc() { return T("variantKind.season.desc"); }, ownColors: true,
      items: [
        ["spring", "variantKind.season.spring", "SPRING", "flower", true, { colors: ["#fbeef1", "#e7bfca", "#c25b7c", "#4a2b35"], effect: "petals", amount: 0.45 }],
        ["summer", "variantKind.season.summer", "SUMMER", "sun", true, { colors: ["#eaf7fb", "#9fd6e6", "#1f8fb8", "#123c4d"], effect: "sparkle", amount: 0.25 }],
        ["autumn", "variantKind.season.autumn", "AUTUMN", "leaf", true, { colors: ["#f4e0c4", "#c07a3c", "#b2452a", "#3d2414"], tint: ["#ff9a3c", 0.06], effect: "leaves", amount: 0.45 }],
        ["winter", "variantKind.season.winter", "WINTER", "snow", true, { colors: ["#eef4f9", "#a9c1d4", "#4f7fa6", "#23384a"], tint: ["#dfe8f2", 0.08], effect: "snow", amount: 0.4 }],
      ],
    },
    scene: {
      get label() { return T("variantKind.scene.label"); }, get desc() { return T("variantKind.scene.desc"); }, ownColors: false,
      items: [
        ["daily", "variantKind.scene.daily", "DAILY", "heart", true, {}],
        ["explore", "variantKind.scene.explore", "EXPLORE", "search", true, { effect: "dust", amount: 0.3 }],
        ["battle", "variantKind.scene.battle", "BATTLE", "swords", true, { tint: ["#a01818", 0.06], effect: "vignette", amount: 0.55 }],
        ["crisis", "variantKind.scene.crisis", "ALERT", "alert", false, { effect: "alert", amount: 0.7 }],
        ["memory", "variantKind.scene.memory", "MEMORY", "clock", true, { effect: "sepia", amount: 0.6 }],
      ],
    },
    sanity: {
      get label() { return T("variantKind.sanity.label"); }, get desc() { return T("variantKind.sanity.desc"); }, ownColors: false,
      items: [
        ["sane", "variantKind.sanity.sane", "SANE", "eye", true, {}],
        ["shaken", "variantKind.sanity.shaken", "SHAKEN", "eye", true, { tint: ["#2a0f24", 0.1], effect: "vignette", amount: 0.7 }],
        ["madness", "variantKind.sanity.madness", "MADNESS", "skull", true, { tint: ["#5a0010", 0.14], effect: "glitch", amount: 0.7 }],
      ],
    },
    chapter: {
      get label() { return T("variantKind.chapter.label"); }, get desc() { return T("variantKind.chapter.desc"); }, ownColors: false,
      items: [
        ["prologue", "variantKind.chapter.prologue", "PROLOGUE", "book", true], ["ch1", "variantKind.chapter.ch1", "CHAPTER 1", "book", true],
        ["ch2", "variantKind.chapter.ch2", "CHAPTER 2", "book", true], ["ch3", "variantKind.chapter.ch3", "CHAPTER 3", "book", false],
        ["epilogue", "variantKind.chapter.epilogue", "EPILOGUE", "book", true],
      ],
    },
    custom: {
      get label() { return T("variantKind.custom.label"); }, get desc() { return T("variantKind.custom.desc"); }, ownColors: false,
      items: [["p1", "variantKind.custom.p1", "PATTERN 1", "none", true], ["p2", "variantKind.custom.p2", "PATTERN 2", "none", true]],
    },
  };

  const EFFECTS = [
    ["none", "effect.none"], ["rain", "effect.rain"], ["storm", "effect.storm"], ["snow", "effect.snow"], ["fog", "effect.fog"],
    ["petals", "effect.petals"], ["leaves", "effect.leaves"], ["sparkle", "effect.sparkle"], ["dust", "effect.dust"],
    ["vignette", "effect.vignette"], ["alert", "effect.alert"], ["glitch", "effect.glitch"],
    ["scanlines", "effect.scanlines"], ["sepia", "effect.sepia"],
  ];

  const ICONS = [
    ["none", "icon.none"], ["sunrise", "icon.sunrise"], ["sun", "icon.sun"], ["sunset", "icon.sunset"], ["moon", "icon.moon"], ["star", "icon.star"],
    ["cloud", "icon.cloud"], ["rain", "icon.rain"], ["snow", "icon.snow"], ["fog", "icon.fog"], ["bolt", "icon.bolt"], ["flower", "icon.flower"],
    ["leaf", "icon.leaf"], ["heart", "icon.heart"], ["search", "icon.search"], ["swords", "icon.swords"], ["alert", "icon.alert"],
    ["eye", "icon.eye"], ["skull", "icon.skull"], ["clock", "icon.clock"], ["book", "icon.book"], ["custom", "icon.custom"],
  ];

  const PLACEMENTS = [
    ["all", "placement.all"], ["top", "placement.top"], ["bottom", "placement.bottom"], ["topbottom", "placement.topbottom"], ["sides", "placement.sides"],
    ["corners", "placement.corners"], ["topcorners", "placement.topcorners"], ["bottomcorners", "placement.bottomcorners"],
  ];

  // uses: which sliders apply to the type. 顯示文字（名稱、說明、兩個顏色欄的標籤）
  // 一律由 id 推出 i18n key，並以 getter 取值，切換語言時才會跟著更新。
  const deco = (id, uses, defaults) => ({
    get label() { return T(`deco.${id}.label`); },
    get desc() { return T(`deco.${id}.desc`); },
    get colorNames() { return [T(`deco.${id}.color1`), T(`deco.${id}.color2`)]; },
    uses, defaults: Object.assign({
      placement: "all", size: 1, density: 0.5, coverage: 1, offset: 0, color: "#3f6b3a", color2: "#79a85a",
    }, defaults),
  });
  const ALONG = "placement size density coverage offset";
  const AT_CORNERS = "placement size density offset";

  const DECO_TYPES = {
    ivy: deco("ivy", ALONG,
      { coverage: 0.75, density: 0.6, color: "#3b5f33", color2: "#6f9f4e" }),
    flowers: deco("flowers", ALONG,
      { density: 0.4, color: "#f6c9d6", color2: "#ffd66b" }),
    thorns: deco("thorns", ALONG,
      { coverage: 0.8, color: "#2f2622", color2: "#8a2c3a" }),
    sakura: deco("sakura", ALONG,
      { placement: "topcorners", density: 0.6, coverage: 0.7, color: "#4a3328", color2: "#f7c6d4" }),
    grass: deco("grass", ALONG,
      { placement: "bottom", density: 0.6, color: "#3f6a33", color2: "#86b35d" }),
    stars: deco("stars", ALONG,
      { density: 0.5, color: "accent", color2: "#ffffff" }),
    cobweb: deco("cobweb", AT_CORNERS,
      { placement: "corners", density: 0.5, color: "#e6e6e6", color2: "#161616" }),
    chain: deco("chain", ALONG,
      { placement: "top", density: 0.6, color: "#b9bec3", color2: "#3d4146" }),
    gears: deco("gears", AT_CORNERS,
      { placement: "corners", density: 0.6, color: "accent", color2: "frame2" }),
    circuit: deco("circuit", ALONG,
      { placement: "sides", color: "accent", color2: "text" }),
    snowcap: deco("snowcap", ALONG,
      { placement: "topbottom", density: 0.6, color: "#f7fbfe", color2: "#b9d3e6" }),
    drips: deco("drips", ALONG,
      { placement: "top", density: 0.5, color: "#6e0b10", color2: "#e0525a" }),
  };

  const LAYOUTS = {
    thin: { get label() { return T("layout.thin"); }, margin: margins(20) },
    normal: { get label() { return T("layout.normal"); }, margin: margins(40) },
    thick: { get label() { return T("layout.thick"); }, margin: margins(80) },
    cinema: { get label() { return T("layout.cinema"); }, margin: { t: 120, r: 0, b: 120, l: 0 } },
    novel: { get label() { return T("layout.novel"); }, margin: { t: 28, r: 28, b: 250, l: 28 } },
    side: { get label() { return T("layout.side"); }, margin: { t: 28, r: 260, b: 28, l: 260 } },
  };

  const SIZES = [
    { key: "1920x1080", get label() { return T("size.1920x1080"); } },
    { key: "1280x720", get label() { return T("size.1280x720"); } },
    { key: "1152x648", get label() { return T("size.1152x648"); } },
    { key: "1440x1080", get label() { return T("size.1440x1080"); } },
    { key: "960x720", get label() { return T("size.960x720"); } },
    { key: "1080x1080", get label() { return T("size.1080x1080"); } },
    { key: "custom", get label() { return T("size.customLabel"); } },
  ];

  const FONTS = {
    gothic: { get label() { return T("font.gothic"); }, stack: '"Yu Gothic UI","Yu Gothic","Hiragino Kaku Gothic ProN","Meiryo",sans-serif' },
    mincho: { get label() { return T("font.mincho"); }, stack: '"Yu Mincho","YuMincho","Hiragino Mincho ProN","BIZ UDPMincho","MS PMincho",serif' },
    kyokasho: { get label() { return T("font.kyokasho"); }, stack: '"UD Digi Kyokasho NK-R","UD デジタル 教科書体 NK-R","Yu Mincho",serif' },
    serif: { get label() { return T("font.serif"); }, stack: 'Georgia,"Times New Roman",serif' },
    sans: { get label() { return T("font.sans"); }, stack: '"Segoe UI","Helvetica Neue",Arial,sans-serif' },
    /* TRPG Toolkit collection: Traditional Chinese stacks. The five above name
       Japanese system fonts, which a Taiwanese machine does not have, so the
       renderer silently drops to the generic fallback. These name the fonts
       that are actually installed there. Like the rest of this table they are
       installed fonts, not webfonts — the renderer draws straight to canvas
       and never waits for a font to load. */
    tcgothic: { get label() { return T("font.tcgothic"); }, stack: '"Microsoft JhengHei","微軟正黑體","PingFang TC","Heiti TC",sans-serif' },
    tcmincho: { get label() { return T("font.tcmincho"); }, stack: '"PMingLiU","新細明體","Songti TC",serif' },
    tckai: { get label() { return T("font.tckai"); }, stack: '"DFKai-SB","標楷體","BiauKai","Kaiti TC",serif' },
  };

  const COLOR_REFS = [["accent", "colorRef.accent"], ["text", "colorRef.text"], ["frame1", "colorRef.frame1"], ["frame2", "colorRef.frame2"]];

  window.FramePresets = {
    DESIGNS, VARIANT_KINDS, EFFECTS, ICONS, PLACEMENTS, DECO_TYPES, LAYOUTS, SIZES, FONTS, COLOR_REFS, BASE_TIMES,
  };
})();
