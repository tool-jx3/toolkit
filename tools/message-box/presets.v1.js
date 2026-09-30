/*!
 * presets.v1.js - static data: fonts, option lists, design templates, sample messages
 *
 * Adding things:
 *   - a font:    add an entry to FONTS (weights must exist on Google Fonts, or the whole import fails).
 *                The "pc" entry is special: its family is the name the user typed.
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
    // family comes from the typed name (name.fontName etc.)
    pc: { label: "font.pc", family: "", weights: null, stack: SANS },
  };

  const WEIGHTS = [[400, "weight.400"], [500, "weight.500"], [600, "weight.600"], [700, "weight.700"], [800, "weight.800"], [900, "weight.900"]];

  const ALIGNS = [["center", "align.center"], ["left", "align.left"], ["right", "align.right"]];
  const TEXTURES = [["none", "texture.none"], ["paper", "texture.paper"], ["grain", "texture.grain"], ["scanlines", "texture.scanlines"], ["gradient", "texture.gradient"]];
  const NAME_STYLES = [["inline", "nameStyle.inline"], ["plate", "nameStyle.plate"]];
  const OUTLINES = [["shadow", "outline.shadow"], ["stroke", "outline.stroke"], ["glow", "outline.glow"], ["none", "outline.none"]];
  const RESULT_PLACES = [["name", "resultPlace.name"], ["right", "resultPlace.right"]];
  const RESULT_STYLES = [["text", "resultStyle.text"], ["badge", "resultStyle.badge"], ["fill", "resultStyle.fill"]];
  const SIDES = [["left", "side.left"], ["right", "side.right"]];
  const LAYERS = [["back", "layer.back"], ["front", "layer.front"]];
  const ENTERS = [["slide", "enter.slide"], ["none", "enter.none"]];
  const BUTTONS = [["hover", "buttons.hover"], ["hide", "buttons.hide"], ["show", "buttons.show"]];

  // Dice result colors are emotion classes: css-<hash of the Typography styles>. The result in the
  // message box is Typography body2 with color primary / secondary / textSecondary, the same styles
  // as the chat log's result, so the same classes (see chat-window-maker's presets.v1.js).
  //   body2 + primary.main #2196f3   -> success (成功 / スペシャル)
  //   body2 + secondary.main #dc004e -> failure (失敗)
  //   body2 + text.secondary         -> anything else
  const RESULT_CLASS = { success: "css-1l6qhgm", failure: "css-1j13mke", neutral: "css-ucj12" };

  // The look of the default design. Other designs are patches over this.
  const BASE_LOOK = {
    // Where the box sits in the browser source. width: the box's max width.
    layout: { width: 760, align: "center", bottom: 16, side: 16, enter: "slide" },
    box: { bg: "#161616", bgAlpha: 0.86, borderW: 0, borderColor: "#ffffff", borderAlpha: 0.2, radius: 6, shadow: 0.4,
      texture: "none", corners: false, cornerColor: "#ffffff", cornerAlpha: 0.8, padX: 24, padY: 12, lines: 3, buttons: "hover" },
    name: { show: true, style: "inline", font: "notosans", fontName: "", weight: 700, size: 15, color: "#f5f5f5",
      plateBg: "#000000", plateAlpha: 0.8, plateRadius: 4, plateX: 16, plateBorderW: 0, plateBorderColor: "#ffffff", plateLift: 0, plateGap: 0, gap: 4 },
    result: { show: true, place: "name", style: "text", font: "notosans", fontName: "", weight: 700, size: 15,
      success: "#5cc8ff", failure: "#ff5c7a", neutral: "#c8c8c8" },
    text: { font: "notosans", fontName: "", weight: 400, size: 17, color: "#f5f5f5", lineHeight: 1.6, spacing: 0.02,
      outline: "none", outlineColor: "#000000", outlineAlpha: 0.8, outlineW: 2 },
    portrait: { show: true, width: 240, maxH: 480, side: "left", x: 8, y: 0, flip: false, layer: "back" },
    dice: { show: true, size: 64 },
  };
  const LOOK_KEYS = Object.keys(BASE_LOOK);

  const DESIGNS = {
    standard: {
      label: "design.standard", desc: "design.standard.desc",
    },
    novel: {
      label: "design.novel", desc: "design.novel.desc",
      layout: { width: 1100, bottom: 20 },
      box: { bg: "#0b0d18", bgAlpha: 0.78, borderW: 1, borderColor: "#ffffff", borderAlpha: 0.35, radius: 10, texture: "gradient", padX: 36, padY: 18, lines: 3 },
      name: { style: "plate", font: "mplusround", weight: 800, size: 18, plateBg: "#2b3a78", plateAlpha: 0.95, plateRadius: 8, plateX: 28,
        plateBorderW: 1, plateBorderColor: "#ffffff" },
      result: { font: "mplusround", size: 17, place: "right", style: "fill" },
      text: { font: "mplusround", weight: 500, size: 21, lineHeight: 1.65, outline: "shadow", outlineAlpha: 0.7 },
      portrait: { width: 300, maxH: 540, x: 24, y: 24 },
    },
    letter: {
      label: "design.letter", desc: "design.letter.desc",
      layout: { width: 820 },
      box: { bg: "#efe4cb", bgAlpha: 0.97, borderW: 1, borderColor: "#6b5130", borderAlpha: 0.7, radius: 3, shadow: 0.5, texture: "paper", padX: 30, padY: 16 },
      name: { style: "plate", font: "shippori", weight: 800, size: 16, color: "#f3ead6", plateBg: "#3a2a1a", plateAlpha: 0.95, plateRadius: 2, plateX: 22 },
      result: { font: "shippori", size: 16, style: "fill", success: "#2c5d9e", failure: "#a02828", neutral: "#6b5130" },
      text: { font: "shippori", weight: 500, size: 18, color: "#2e2116", lineHeight: 1.8 },
    },
    hud: {
      label: "design.hud", desc: "design.hud.desc",
      layout: { width: 860 },
      box: { bg: "#03101a", bgAlpha: 0.88, borderW: 1, borderColor: "#6ff3ff", borderAlpha: 0.55, radius: 0, shadow: 0, texture: "scanlines",
        corners: true, cornerColor: "#6ff3ff", cornerAlpha: 0.95, padX: 26 },
      name: { font: "chakra", weight: 700, size: 16, color: "#6ff3ff" },
      result: { font: "rajdhani", size: 19, place: "right", success: "#63ffa8", failure: "#ff5a78", neutral: "#dffbff" },
      text: { font: "zenkaku", weight: 500, size: 17, color: "#dffbff", outline: "glow", outlineColor: "#00c8ff", outlineAlpha: 0.35 },
      portrait: { side: "right", x: 16 },
    },
    horror: {
      label: "design.horror", desc: "design.horror.desc",
      box: { bg: "#050203", bgAlpha: 0.88, borderW: 1, borderColor: "#6a0f0f", borderAlpha: 0.8, radius: 2, shadow: 0.6, texture: "grain", padX: 28 },
      name: { style: "plate", font: "yujiboku", weight: 400, size: 17, color: "#e8d6d0", plateBg: "#3a0707", plateAlpha: 0.95, plateRadius: 0, plateX: 20,
        plateBorderW: 1, plateBorderColor: "#8a1a1a" },
      result: { font: "zenantique", size: 17, success: "#d8d0c0", failure: "#ff2a2a", neutral: "#c9b3ad" },
      text: { font: "zenantique", size: 18, color: "#eadad6", lineHeight: 1.7, outline: "glow", outlineColor: "#4a0000", outlineAlpha: 1 },
    },
    rpg: {
      label: "design.rpg", desc: "design.rpg.desc",
      layout: { width: 820, bottom: 24 },
      box: { bg: "#000000", bgAlpha: 0.92, borderW: 4, borderColor: "#ffffff", borderAlpha: 1, radius: 8, shadow: 0, padX: 26, padY: 14 },
      name: { font: "dotgothic", weight: 400, size: 18, color: "#ffe066" },
      result: { font: "dotgothic", weight: 400, size: 18, success: "#6fd3ff", failure: "#ff6b6b", neutral: "#ffffff" },
      text: { font: "dotgothic", weight: 400, size: 20, color: "#ffffff", lineHeight: 1.6, spacing: 0.04 },
      dice: { size: 56 },
    },
    pop: {
      label: "design.pop", desc: "design.pop.desc",
      layout: { width: 760 },
      box: { bg: "#ffffff", bgAlpha: 0.96, borderW: 3, borderColor: "#ff8fb1", borderAlpha: 1, radius: 22, shadow: 0.3, padX: 28, padY: 14 },
      name: { style: "plate", font: "zenmaru", weight: 700, size: 16, color: "#ffffff", plateBg: "#ff6f9c", plateAlpha: 1, plateRadius: 14, plateX: 26 },
      result: { font: "zenmaru", size: 16, style: "fill", success: "#2f8fe0", failure: "#e0456a", neutral: "#8a8490" },
      text: { font: "zenmaru", weight: 500, size: 18, color: "#3a3440" },
    },
  };

  // ---------------------------------------------------------------- sample messages (preview only)

  // Colors feed the sample portraits drawn in mock.v1.js. portrait: false = "発言時キャラクターを表示しない".
  const SPEAKERS = {
    kp: { name: "KP", hair: "#2c2a30", cloth: "#4a4658", skin: "#ecdfcc", portrait: false },
    hinata: { name: "speaker.hinata", hair: "#8a5a3a", cloth: "#b8433f", skin: "#f3dfc8" },
    ren: { name: "speaker.ren", hair: "#1e2433", cloth: "#2f4f7a", skin: "#ead8c2" },
    shizuku: { name: "speaker.shizuku", hair: "#d8d4e8", cloth: "#5f4a8a", skin: "#f5e6da" },
  };

  // result: the dice bot's text; CCFOLIA shows its last "＞ …" part. dice: [faces, value] images.
  const EXTRA_MESSAGES = {
    chat: [
      { who: "hinata", text: "sample.door" },
      { who: "ren", text: "sample.careful" },
      { who: "shizuku", text: "sample.sound" },
    ],
    success: [
      { who: "hinata", text: "sample.spot", result: "(1D100<=65) ＞ 23 ＞ 成功", dice: [[100, 23]] },
      { who: "ren", text: "sample.library", result: "(1D100<=70) ＞ 1 ＞ 決定的成功/スペシャル", dice: [[100, 1]] },
    ],
    failure: [
      { who: "ren", text: "sample.listen", result: "(1D100<=40) ＞ 88 ＞ 失敗", dice: [[100, 88]] },
      { who: "shizuku", text: "sample.occult", result: "(1D100<=30) ＞ 98 ＞ 致命的失敗", dice: [[100, 98]] },
    ],
    neutral: [
      { who: "ren", text: "sample.damage", result: "(2D6) ＞ 9[4,5] ＞ 9", dice: [[6, 4], [6, 5]] },
      { who: "kp", text: "sample.sanLoss", result: "(1D3) ＞ 2", dice: [] },
    ],
    // CCFOLIA replaces the text with "シークレットダイス" and shows no dice images and no result.
    secret: [
      { who: "shizuku", text: "sample.psychology", secret: true },
    ],
    // KP narration: no portrait, and longer than the box.
    long: [
      { who: "kp", text: "sample.narration" },
      { who: "kp", text: "sample.letter" },
    ],
  };

  // The first message the preview shows.
  const FIRST_MESSAGE = { who: "hinata", text: "sample.first" };

  /* TRPG Toolkit 合輯：預覽用的範例內容存的是 i18n key。
   * SPEAKERS 每次讀取都會重新取譯文（getter），所以切語言就會跟著換；
   * 範例訊息則維持存 key，由 mock.v1.js 在顯示的當下才取譯文——使用者自己送出的
   * 訊息不在字典裡，T() 會原樣傳回。
   * 刻意不翻的：骰子的 result 是 BCDice 的輸出（成功／失敗／決定的成功…），
   * 翻了就不是使用者實際會看到的畫面，預覽依成敗上色也是靠這幾個字判斷的。 */
  const tr = value => (value ? window.T(value) : value);

  window.MboxPresets = {
    FONTS, WEIGHTS, ALIGNS, TEXTURES, NAME_STYLES, OUTLINES, RESULT_PLACES, RESULT_STYLES, SIDES, LAYERS, ENTERS, BUTTONS,
    RESULT_CLASS, BASE_LOOK, LOOK_KEYS, DESIGNS,
    get SPEAKERS() {
      return Object.fromEntries(Object.entries(SPEAKERS).map(([k, s]) => [k, { ...s, name: tr(s.name) }]));
    },
    EXTRA_MESSAGES, FIRST_MESSAGE,
  };
})();
