/*!
 * presets.v1.js - static data: fonts, option lists, design templates, sample messages
 *
 * Adding things:
 *   - a font:    add an entry to FONTS (weights must exist on Google Fonts, or the whole import fails)
 *   - a design:  add an entry to DESIGNS; it is merged over BASE_LOOK
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

  // Same list as the status bar maker. weights: verified against fonts.googleapis.com/css2 (2026-09-14).
  // null = installed font, no import.
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
    /* TRPG Toolkit 合輯：繁體中文字型。字重同樣對 fonts.googleapis.com/css2 逐一驗過。 */
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

  const PANEL_MODES = [["fixed", "panelMode.fixed"], ["fit", "panelMode.fit"]];
  const ANCHORS = [["bottom", "anchor.bottom"], ["top", "anchor.top"]];
  const ORDERS = [["newBottom", "order.newBottom"], ["newTop", "order.newTop"]];
  const TEXTURES = [["none", "texture.none"], ["paper", "texture.paper"], ["grain", "texture.grain"], ["scanlines", "texture.scanlines"]];

  const TITLE_SOURCES = [["none", "titleSource.none"], ["text", "titleSource.text"], ["tab", "titleSource.tab"], ["textTab", "titleSource.textTab"]];
  const TITLE_STYLES = [["text", "titleStyle.text"], ["bar", "titleStyle.bar"], ["underline", "titleStyle.underline"], ["tab", "titleStyle.tab"], ["lines", "titleStyle.lines"]];
  const ALIGNS = [["left", "align.left"], ["center", "align.center"], ["right", "align.right"]];

  const CARD_STYLES = [["card", "cardStyle.card"], ["bubble", "cardStyle.bubble"], ["plain", "cardStyle.plain"]];
  const ACCENTS = [["none", "accent.none"], ["char", "accent.char"], ["fixed", "accent.fixed"], ["result", "accent.result"]];
  const AVATAR_SHAPES = [["square", "avatarShape.square"], ["rounded", "avatarShape.rounded"], ["circle", "avatarShape.circle"]];
  const AVATAR_ALIGNS = [["top", "avatarAlign.top"], ["center", "avatarAlign.center"]];

  const NAME_COLORS = [["char", "nameColor.char"], ["fixed", "nameColor.fixed"]];
  const NAME_STYLES = [["text", "nameStyle.text"], ["underline", "nameStyle.underline"], ["badge", "nameStyle.badge"], ["colon", "nameStyle.colon"]];
  const OUTLINES = [["shadow", "outline.shadow"], ["stroke", "outline.stroke"], ["glow", "outline.glow"], ["none", "outline.none"]];

  const RESULT_STYLES = [["text", "resultStyle.text"], ["badge", "resultStyle.badge"], ["fill", "resultStyle.fill"]];

  const ENTERS = [
    ["none", "enter.none"], ["fade", "enter.fade"], ["slideUp", "enter.slideUp"], ["slideDown", "enter.slideDown"],
    ["slideLeft", "enter.slideLeft"], ["slideRight", "enter.slideRight"], ["pop", "enter.pop"], ["blur", "enter.blur"],
  ];

  // Dice result colors are emotion classes: css-<hash of the Typography styles>. Computed with the
  // hash function in CCFOLIA's bundle (2026-09-15) and matching classes used by existing OBS CSS.
  //   body2 + primary.main #2196f3   -> success (成功 / スペシャル / roll.success)
  //   body2 + secondary.main #dc004e -> failure (失敗 / roll.failure)
  //   body2 + text.secondary         -> anything else
  const RESULT_CLASS = { success: "css-1l6qhgm", failure: "css-1j13mke", neutral: "css-ucj12" };

  // The look of the default design. Other designs are patches over this.
  const BASE_LOOK = {
    panel: { mode: "fit", anchor: "bottom", margin: 10, pad: 10, bg: "#0c0e14", bgAlpha: 0.7, borderW: 1, borderColor: "#ffffff", borderAlpha: 0.14,
      radius: 10, shadow: 0.35, texture: "none", corners: false, cornerColor: "#ffffff", cornerAlpha: 0.8 },
    title: { source: "none", text: "DICE", style: "text", font: "notosans", weight: 700, size: 14, color: "#f2efe6", accent: "#c8a45c",
      bg: "#000000", bgAlpha: 0.45, align: "left", gap: 8, lock: true },
    list: { count: 5, order: "newBottom", diceOnly: false, hideSystem: true, gap: 6 },
    // Icons of the users in a private tab (CCFOLIA shows them in the chat header).
    members: { show: false, size: 24, spacing: -6, ringW: 2, ringColor: "#121212", ringAlpha: 1, label: "", labelSize: 12 },
    card: { style: "card", bg: "#000000", bgAlpha: 0.35, borderW: 0, borderColor: "#ffffff", borderAlpha: 0.2, radius: 8, padX: 10, padY: 8,
      shadow: 0, accent: "none", accentColor: "#c8a45c", accentW: 3, divider: false, dividerColor: "#ffffff", dividerAlpha: 0.15, resultBorder: false },
    avatar: { show: true, size: 36, shape: "rounded", borderW: 0, borderColor: "#ffffff", borderAlpha: 0.5, gap: 10, align: "top" },
    name: { show: true, font: "notosans", weight: 700, size: 13, colorMode: "char", color: "#f2efe6", style: "text",
      time: false, timeColor: "#ffffff", timeAlpha: 0.5, gap: 2 },
    text: { font: "notosans", weight: 400, size: 15, color: "#f2efe6", lineHeight: 1.55, spacing: 0.02,
      outline: "shadow", outlineColor: "#000000", outlineAlpha: 0.8, outlineW: 2, clamp: 0 },
    result: { font: "notosans", weight: 700, size: 16, newLine: true, style: "text",
      success: "#5cc8ff", failure: "#ff5c7a", neutral: "#e8e4da", glow: false, flash: false },
    motion: { enter: "slideUp", enterDur: 0.35, exit: false, exitAfter: 12, exitDur: 0.6 },
  };

  const DESIGNS = {
    dicebox: {
      label: "design.dicebox", desc: "design.dicebox.desc",
      title: { source: "text", text: "DICE ROLL", style: "underline", font: "chakra", size: 13, color: "#cfd6e6", accent: "#5cc8ff" },
      list: { count: 4, diceOnly: true },
      card: { bg: "#10131b", bgAlpha: 0.82, radius: 6, accent: "result", accentColor: "#8a93a8", accentW: 4, padX: 12 },
      avatar: { size: 34 },
      text: { size: 13, color: "#aeb6c8", outline: "none" },
      result: { font: "chakra", size: 19, weight: 700 },
      motion: { enter: "slideLeft", enterDur: 0.35 },
    },
    dicepop: {
      label: "design.dicepop", desc: "design.dicepop.desc",
      panel: { bgAlpha: 0, borderW: 0, shadow: 0, pad: 4 },
      list: { count: 1, diceOnly: true },
      card: { bg: "#08090d", bgAlpha: 0.86, radius: 14, borderW: 2, borderColor: "#ffffff", borderAlpha: 0.2, padX: 16, padY: 12, shadow: 0.5, resultBorder: true },
      avatar: { size: 64, shape: "rounded", gap: 14, align: "center" },
      name: { size: 15, style: "badge" },
      text: { size: 14, color: "#d4d0c6", outline: "none" },
      result: { font: "mplusround", weight: 800, size: 26, style: "text", glow: true, flash: true },
      motion: { enter: "pop", enterDur: 0.45, exit: true, exitAfter: 10, exitDur: 0.6 },
    },
    secretLetter: {
      label: "design.secretLetter", desc: "design.secretLetter.desc",
      panel: { mode: "fixed", bg: "#efe4cb", bgAlpha: 0.97, borderW: 1, borderColor: "#6b5130", borderAlpha: 0.7, radius: 3, pad: 16, texture: "paper", shadow: 0.45 },
      title: { source: "tab", style: "lines", font: "shippori", weight: 700, size: 17, color: "#3a2a1a", accent: "#6b5130", align: "center", gap: 10 },
      members: { show: true, size: 24, spacing: 4, ringW: 1, ringColor: "#6b5130", ringAlpha: 0.7, label: "design.secretLetter.to", labelSize: 12 },
      list: { count: 12, gap: 0 },
      card: { style: "plain", padX: 2, padY: 9, divider: true, dividerColor: "#6b5130", dividerAlpha: 0.3 },
      avatar: { size: 32, shape: "circle", borderW: 1, borderColor: "#6b5130", borderAlpha: 0.6 },
      name: { font: "shippori", size: 13, colorMode: "fixed", color: "#6b3b22", time: true, timeColor: "#3a2a1a", timeAlpha: 0.45 },
      text: { font: "shippori", weight: 500, size: 15, color: "#2e2116", lineHeight: 1.75, outline: "none" },
      result: { font: "shippori", size: 15, success: "#1f4e8a", failure: "#8a1f1f", neutral: "#4a3a2a" },
      motion: { enter: "fade", enterDur: 0.6 },
    },
    secretHud: {
      label: "design.secretHud", desc: "design.secretHud.desc",
      panel: { mode: "fixed", bg: "#03101a", bgAlpha: 0.88, borderW: 1, borderColor: "#6ff3ff", borderAlpha: 0.55, radius: 0, pad: 12,
        texture: "scanlines", shadow: 0, corners: true, cornerColor: "#6ff3ff", cornerAlpha: 0.95 },
      title: { source: "textTab", text: "SECRET // ", style: "bar", font: "chakra", size: 13, color: "#dffbff", bg: "#6ff3ff", bgAlpha: 0.16, gap: 10 },
      members: { show: true, size: 22, spacing: 3, ringW: 1, ringColor: "#6ff3ff", ringAlpha: 0.8, label: "ACCESS", labelSize: 11 },
      list: { count: 10, gap: 5 },
      card: { bg: "#6ff3ff", bgAlpha: 0.05, radius: 0, borderW: 1, borderColor: "#6ff3ff", borderAlpha: 0.18, accent: "char", accentW: 3, padY: 7 },
      avatar: { size: 32, shape: "square", borderW: 1, borderColor: "#6ff3ff", borderAlpha: 0.6 },
      name: { font: "chakra", size: 13 },
      text: { font: "zenkaku", size: 14, color: "#dffbff", outline: "glow", outlineColor: "#00c8ff", outlineAlpha: 0.35 },
      result: { font: "rajdhani", size: 19, success: "#63ffa8", failure: "#ff5a78", neutral: "#dffbff", glow: true },
      motion: { enter: "slideRight", enterDur: 0.3 },
    },
    simple: {
      label: "design.simple", desc: "design.simple.desc",
      panel: { mode: "fixed", bgAlpha: 0, borderW: 0, shadow: 0, pad: 6 },
      list: { count: 8, gap: 4 },
      card: { style: "plain", padX: 0, padY: 3 },
      avatar: { size: 28, shape: "circle" },
      name: { style: "colon", size: 15 },
      text: { size: 15, weight: 700, outline: "stroke", outlineColor: "#000000", outlineAlpha: 0.9, outlineW: 2 },
      result: { newLine: false, size: 15, weight: 800 },
      motion: { enter: "fade", enterDur: 0.4 },
    },
    bubble: {
      label: "design.bubble", desc: "design.bubble.desc",
      panel: { bgAlpha: 0, borderW: 0, shadow: 0, pad: 4 },
      list: { count: 4, gap: 10 },
      card: { style: "bubble", bg: "#ffffff", bgAlpha: 0.95, radius: 14, padX: 12, padY: 8, shadow: 0.3 },
      avatar: { size: 44, shape: "circle", borderW: 2, borderColor: "#ffffff", borderAlpha: 1 },
      name: { font: "zenmaru", size: 12, style: "text" },
      text: { font: "zenmaru", weight: 500, size: 15, color: "#3a3440", outline: "none" },
      result: { font: "zenmaru", size: 16, style: "fill", success: "#2f8fe0", failure: "#e0456a", neutral: "#6a6470" },
      motion: { enter: "pop", enterDur: 0.4 },
    },
    rpg: {
      label: "design.rpg", desc: "design.rpg.desc",
      panel: { mode: "fixed", anchor: "top", bg: "#000000", bgAlpha: 0.9, borderW: 3, borderColor: "#ffffff", borderAlpha: 1, radius: 6, pad: 14, shadow: 0 },
      list: { count: 4, gap: 6 },
      card: { style: "plain", padX: 0, padY: 2 },
      avatar: { show: false },
      name: { font: "dotgothic", weight: 400, size: 16, colorMode: "fixed", color: "#ffe066", style: "colon" },
      text: { font: "dotgothic", weight: 400, size: 16, color: "#ffffff", lineHeight: 1.6, spacing: 0.04, outline: "none" },
      result: { font: "dotgothic", weight: 400, size: 16, newLine: false, success: "#6fd3ff", failure: "#ff6b6b", neutral: "#ffffff" },
      motion: { enter: "none" },
    },
    horror: {
      label: "design.horror", desc: "design.horror.desc",
      panel: { mode: "fixed", bg: "#050203", bgAlpha: 0.8, borderW: 1, borderColor: "#6a0f0f", borderAlpha: 0.8, radius: 2, texture: "grain", shadow: 0.6 },
      list: { count: 6, gap: 8 },
      card: { style: "plain", padX: 4, padY: 4, divider: true, dividerColor: "#6a0f0f", dividerAlpha: 0.5 },
      avatar: { size: 34, shape: "square", borderW: 1, borderColor: "#6a0f0f", borderAlpha: 0.9 },
      name: { font: "yujiboku", weight: 400, size: 14, colorMode: "fixed", color: "#c9a8a0" },
      text: { font: "zenantique", size: 16, color: "#eadad6", outline: "glow", outlineColor: "#4a0000", outlineAlpha: 1 },
      result: { font: "zenantique", size: 17, success: "#d8d0c0", failure: "#ff2a2a", neutral: "#c9b3ad", glow: true },
      motion: { enter: "blur", enterDur: 1.2, exit: true, exitAfter: 20, exitDur: 1.5 },
    },
    archive: {
      label: "design.archive", desc: "design.archive.desc",
      panel: { mode: "fit", bg: "#e6d8b8", bgAlpha: 0.96, borderW: 1, borderColor: "#5a4326", borderAlpha: 0.8, radius: 2, pad: 14, texture: "paper",
        corners: true, cornerColor: "#5a4326", cornerAlpha: 0.85 },
      title: { source: "text", text: "design.archive.title", style: "underline", font: "shippori", weight: 800, size: 18, color: "#2b2118", accent: "#7a1f1a" },
      list: { count: 4, gap: 2 },
      card: { style: "plain", padX: 2, padY: 6, divider: true, dividerColor: "#5a4326", dividerAlpha: 0.35 },
      avatar: { show: false },
      name: { font: "shippori", weight: 800, size: 14, colorMode: "fixed", color: "#5a2a18" },
      text: { font: "shippori", weight: 500, size: 15, color: "#2b2118", outline: "none" },
      result: { font: "shippori", weight: 700, size: 15, style: "badge", success: "#1f3f6e", failure: "#8a1a1a", neutral: "#3b2a18" },
      motion: { enter: "fade", enterDur: 0.8 },
    },
  };

  // ---------------------------------------------------------------- sample messages (preview only)

  // hair / clothes colors feed the sample avatars drawn in mock.v1.js
  const SPEAKERS = {
    kp: { name: "KP", color: "#d9d4c7", hair: "#2c2a30", cloth: "#4a4658" },
    hinata: { name: "speaker.hinata", color: "#ffb74d", hair: "#8a5a3a", cloth: "#b8433f" },
    ren: { name: "speaker.ren", color: "#6fb6ff", hair: "#1e2433", cloth: "#2f4f7a" },
    shizuku: { name: "speaker.shizuku", color: "#c39cf0", hair: "#d8d4e8", cloth: "#5f4a8a" },
    system: { name: "", color: "" },
  };

  // kind: chat | success | failure | neutral | system | secret (someone else's secret dice)
  const SAMPLE_MESSAGES = {
    main: [
      // CCFOLIA posts "/system [ name ] label : old → new" when a status changes (":HP-2" etc.); "/system " is stripped.
      { who: "system", kind: "system", text: "sample.hpChange" },
      { who: "kp", kind: "chat", text: "sample.gate" },
      { who: "hinata", kind: "success", text: "sample.spot", result: "(1D100<=65) ＞ 23 ＞ 成功" },
      { who: "ren", kind: "failure", text: "sample.listen", result: "(1D100<=40) ＞ 88 ＞ 失敗" },
      { who: "shizuku", kind: "chat", text: "sample.door" },
      { who: "kp", kind: "neutral", text: "sample.damage", result: "(1D6) ＞ 4" },
      { who: "ren", kind: "success", text: "sample.library", result: "(1D100<=70) ＞ 1 ＞ 決定的成功/スペシャル" },
      // SAN checks have no critical / fumble, so a plain 1D100 roll.
      { who: "hinata", kind: "failure", text: "sample.sanCheck", result: "(1D100<=55) ＞ 97 ＞ 失敗" },
    ],
    secret: [
      { who: "kp", kind: "chat", text: "sample.secretTell" },
      { who: "hinata", kind: "chat", text: "sample.childhood" },
      { who: "kp", kind: "success", text: "sample.idea", result: "(1D100<=50) ＞ 12 ＞ 成功" },
      { who: "kp", kind: "chat", text: "sample.remember" },
      { who: "hinata", kind: "chat", text: "sample.keepQuiet" },
    ],
  };

  const SAMPLE_TABS = {
    /* 主分頁的名稱是 CCFOLIA 內建的，不翻。 */
    main: { label: "メイン", private: false },
    secret: { label: "sample.tab.secret", private: true },
  };

  // Lines added by the "send" buttons, in turn.
  const EXTRA_MESSAGES = {
    chat: [
      { who: "shizuku", text: "extra.sound" },
      { who: "ren", text: "extra.careful" },
      { who: "kp", text: "extra.corridor" },
      { who: "hinata", text: "extra.longLine" },
    ],
    success: [
      { who: "shizuku", text: "extra.firstAid", result: "(1D100<=60) ＞ 41 ＞ 成功" },
      { who: "ren", text: "extra.dodge", result: "(1D100<=75) ＞ 5 ＞ 決定的成功/スペシャル" },
    ],
    failure: [
      { who: "hinata", text: "extra.sneak", result: "(1D100<=45) ＞ 77 ＞ 失敗" },
      { who: "shizuku", text: "extra.occult", result: "(1D100<=30) ＞ 98 ＞ 致命的失敗" },
    ],
    neutral: [
      { who: "kp", text: "extra.sanLoss", result: "(1D3) ＞ 2" },
      { who: "ren", text: "2D6", result: "(2D6) ＞ 9[4,5] ＞ 9" },
    ],
    system: [
      { who: "system", text: "extra.sanChange" },
      { who: "system", text: "extra.days" },
    ],
    secret: [
      { who: "shizuku", text: "Secret dice 🎲" },
    ],
  };

  /* TRPG Toolkit 合輯：預覽用的範例內容存的是 i18n key。
   * SPEAKERS 與 SAMPLE_TABS 每次讀取都會重新取譯文（getter），所以切語言就會跟著換；
   * 範例訊息則維持存 key，由 app.v1.js 在交給預覽之前才取譯文——這樣切語言時，
   * 使用者自己送進預覽的訊息不會被一起洗掉。
   * 刻意不翻的有兩處：骰子的 result 是 BCDice 的輸出（成功／失敗／決定的成功…），
   * SAMPLE_TABS.main 是 CCFOLIA 內建的分頁名。翻了就不是使用者實際會看到的畫面。 */
  const tr = value => (value ? window.T(value) : value);

  window.ChatPresets = {
    FONTS, WEIGHTS, PANEL_MODES, ANCHORS, ORDERS, TEXTURES, TITLE_SOURCES, TITLE_STYLES, ALIGNS,
    CARD_STYLES, ACCENTS, AVATAR_SHAPES, AVATAR_ALIGNS, NAME_COLORS, NAME_STYLES, OUTLINES, RESULT_STYLES, ENTERS,
    RESULT_CLASS, BASE_LOOK, DESIGNS,
    get SPEAKERS() {
      return Object.fromEntries(Object.entries(SPEAKERS).map(([k, s]) => [k, { ...s, name: tr(s.name) }]));
    },
    SAMPLE_MESSAGES, EXTRA_MESSAGES,
    get SAMPLE_TABS() {
      return Object.fromEntries(Object.entries(SAMPLE_TABS).map(([k, t]) => [k, { ...t, label: tr(t.label) }]));
    },
  };
})();
