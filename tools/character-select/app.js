"use strict";

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const sleepFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

  const DEFAULT_COLORS = ["#66ddff", "#ff668f", "#ffd45f", "#8df27a"];
  const DEMO_NAMES = ["ASTER", "BLAZE", "CYAN", "DUSK", "EMBER", "FROST", "GALE", "HALO"];
  const MAX_CUSTOM_WAYPOINTS = 24;
  const MAX_PLAYER_NUMBER = 99;
  function createDefaultState() {
    return {
      version: 2,
      canvas: { width: 960, height: 540 },
      background: {
        type: "gradient",
        colorA: "#111827",
        colorB: "#3b1d5a",
        angle: 135,
        imageSrc: "",
        imageDim: 24,
        vignette: 38,
        pattern: true
      },
      layout: {
        x: 64,
        y: 124,
        width: 832,
        height: 328,
        columns: 4,
        rows: 2,
        autoRows: true,
        autoGap: true,
        gap: 14,
        radius: 24,
        fit: "cover",
        borderWidth: 2,
        borderStyle: "solid"
      },
      text: {
        showTitle: true,
        title: "SELECT YOUR CHARACTER",
        subtitle: "CHOOSE YOUR FIGHTER",
        titleSize: 30,
        align: "center"
      },
      font: { family: "", fileName: "", src: "" },
      mainPanel: {
        enabled: false,
        effects: true,
        count: 1,
        columns: 1,
        slotGap: 16,
        position: "top",
        size: 62,
        gap: 24,
        fit: "contain",
        reveal: "confirm",
        showName: true,
        placeholder: T("comp.placeholderValue")
      },
      labels: {
        show: true,
        height: 46,
        fontSize: 17
      },
      idle: {
        mode: "grayscale",
        amount: 88,
        brightness: 68,
        saturation: 62,
        overlayAlpha: 18
      },
      selected: {
        tintMode: "player",
        tint: "#64e4ff",
        tintAlpha: 18,
        brightness: 108,
        saturation: 124,
        contrast: 108,
        scale: 1.06,
        glow: 30,
        borderWidth: 5
      },
      players: {
        count: 4,
        selectionMode: "sequence",
        singleNumber: 1,
        allowDuplicate: false,
        labels: ["", "", "", ""],
        colors: [...DEFAULT_COLORS],
        targets: [0, 1, 2, 3],
        starts: [null, null, null, null],
        pathModes: ["random", "random", "random", "random"],
        paths: [[], [], [], []]
      },
      animation: {
        initialHold: 650,
        searchDuration: 900,
        confirmDuration: 650,
        endHold: 1600,
        hops: 3,
        fps: 10,
        loop: true
      },
      export: {
        scale: 0.75,
        webpQuality: 0.9
      },
      ui: {
        showGuides: true
      },
      characters: []
    };
  }

  let state = createDefaultState();
  let backgroundImage = null;
  let editingPlayer = 0;
  let previewPlaying = true;
  let previewTime = 0;
  let previewEpoch = performance.now();
  let exportCancelled = false;
  let exportBusy = false;
  let generatedEmbedCode = "";
  let generatedStandaloneHtml = "";
  let pendingReplacementCharacter = null;
  let fontController = null;
  const imageReplacementRequests = new WeakMap();

  const previewCanvas = $("#previewCanvas");
  const previewCtx = previewCanvas.getContext("2d", { alpha: true });
  const exportCanvas = $("#exportCanvas");
  const exportCtx = exportCanvas.getContext("2d", { alpha: true, willReadFrequently: true });

  function getByPath(object, path) {
    return path.split(".").reduce((current, key) => current?.[key], object);
  }

  function setByPath(object, path, value) {
    const keys = path.split(".");
    const finalKey = keys.pop();
    let current = object;
    for (const key of keys) {
      if (!(key in current)) current[key] = {};
      current = current[key];
    }
    current[finalKey] = value;
  }

  function parseBoundValue(element) {
    if (element.type === "checkbox") return element.checked;
    const current = getByPath(state, element.dataset.bind);
    if (typeof current === "number") return Number(element.value);
    if (typeof current === "boolean") return element.value === "true";
    return element.value;
  }

  function sanitizeState() {
    state.version = 2;
    state.canvas.width = clamp(Math.round(Number(state.canvas.width) || 960), 240, 4096);
    state.canvas.height = clamp(Math.round(Number(state.canvas.height) || 540), 180, 4096);
    state.layout.columns = clamp(Math.round(Number(state.layout.columns) || 1), 1, 12);
    state.layout.rows = clamp(Math.round(Number(state.layout.rows) || 1), 1, 12);
    state.layout.autoGap = state.layout.autoGap === true;
    state.layout.radius = clamp(Number(state.layout.radius) || 0, 0, 120);
    state.layout.borderWidth = clamp(Number(state.layout.borderWidth) || 0, 0, 20);
    state.layout.borderStyle = ["solid", "corners", "dashed", "double"].includes(state.layout.borderStyle) ? state.layout.borderStyle : "solid";
    state.layout.width = clamp(Number(state.layout.width) || 20, 20, state.canvas.width * 2);
    state.layout.height = clamp(Number(state.layout.height) || 20, 20, state.canvas.height * 2);
    state.layout.x = Number(state.layout.x) || 0;
    state.layout.y = Number(state.layout.y) || 0;
    state.mainPanel.enabled = state.mainPanel.enabled === true;
    state.mainPanel.effects = state.mainPanel.effects !== false;
    state.font = StudioFonts.normalize(state.font);
    state.mainPanel.count = clamp(Math.round(Number(state.mainPanel.count) || 1), 1, 12);
    state.mainPanel.columns = clamp(Math.round(Number(state.mainPanel.columns) || 1), 1, state.mainPanel.count);
    state.mainPanel.slotGap = clamp(Number(state.mainPanel.slotGap) || 0, 0, 120);
    state.mainPanel.position = ["top", "left", "right"].includes(state.mainPanel.position) ? state.mainPanel.position : "top";
    state.mainPanel.size = clamp(Number(state.mainPanel.size) || 62, 35, 80);
    state.mainPanel.gap = clamp(Number(state.mainPanel.gap) || 0, 0, 120);
    state.mainPanel.fit = state.mainPanel.fit === "cover" ? "cover" : "contain";
    state.mainPanel.reveal = state.mainPanel.reveal === "hover" ? "hover" : "confirm";
    state.mainPanel.showName = state.mainPanel.showName !== false;
    state.mainPanel.placeholder = String(state.mainPanel.placeholder ?? "").slice(0, 100);
    updateLayoutGap();
    state.players.count = clamp(Math.round(Number(state.players.count) || 1), 1, MAX_PLAYER_NUMBER);
    state.players.selectionMode = state.players.selectionMode === "single" ? "single" : "sequence";
    state.players.singleNumber = clamp(Math.round(Number(state.players.singleNumber) || 1), 1, MAX_PLAYER_NUMBER);
    state.animation.fps = clamp(Math.round(Number(state.animation.fps) || 10), 1, 60);
    state.export.scale = clamp(Number(state.export.scale) || 1, 0.25, 2);
    state.export.webpQuality = clamp(Number(state.export.webpQuality) || 0.9, 0.1, 1);
    if (!Array.isArray(state.players.labels)) state.players.labels = ["", "", "", ""];
    if (!Array.isArray(state.players.colors)) state.players.colors = [...DEFAULT_COLORS];
    if (!Array.isArray(state.players.targets)) state.players.targets = [0, 1, 2, 3];
    if (!Array.isArray(state.players.starts)) state.players.starts = [null, null, null, null];
    if (!Array.isArray(state.players.pathModes)) state.players.pathModes = ["random", "random", "random", "random"];
    if (!Array.isArray(state.players.paths)) state.players.paths = [[], [], [], []];
    const slots = Math.min(MAX_PLAYER_NUMBER, Math.max(4, state.players.count, state.players.singleNumber,
      ...["labels", "colors", "targets", "starts", "pathModes", "paths"].map(key => state.players[key].length)));
    for (const key of ["labels", "colors", "targets", "starts", "pathModes", "paths"]) state.players[key].length = Math.min(slots, state.players[key].length);
    while (state.players.labels.length < slots) state.players.labels.push("");
    state.players.labels = state.players.labels.map(normalizePlayerLabel);
    while (state.players.colors.length < slots) state.players.colors.push(DEFAULT_COLORS[state.players.colors.length % DEFAULT_COLORS.length]);
    while (state.players.targets.length < slots) state.players.targets.push(state.players.targets.length);
    while (state.players.starts.length < slots) state.players.starts.push(null);
    while (state.players.pathModes.length < slots) state.players.pathModes.push("random");
    while (state.players.paths.length < slots) state.players.paths.push([]);
    const characterCount = state.characters.length;
    for (let player = 0; player < slots; player++) {
      const rawStart = state.players.starts[player];
      const numericStart = Number(rawStart);
      state.players.starts[player] = characterCount > 0
        && rawStart !== null
        && rawStart !== undefined
        && rawStart !== ""
        && rawStart !== "random"
        && Number.isFinite(numericStart)
          ? clamp(Math.round(numericStart), 0, characterCount - 1)
          : null;
      state.players.pathModes[player] = state.players.pathModes[player] === "custom" ? "custom" : "random";
      const sourcePath = Array.isArray(state.players.paths[player]) ? state.players.paths[player] : [];
      state.players.paths[player] = characterCount > 0
        ? sourcePath.slice(0, MAX_CUSTOM_WAYPOINTS).flatMap(value => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? [clamp(Math.round(numeric), 0, characterCount - 1)] : [];
          })
        : [];
    }
    normalizeTargets();
    normalizeStoredPlayerPaths();
  }

  function normalizeStoredPlayerPaths() {
    for (let player = 0; player < state.players.paths.length; player++) {
      const target = state.players.targets[player];
      const compacted = [];
      const source = Array.isArray(state.players.paths[player]) ? state.players.paths[player] : [];
      for (const index of source) {
        if (index === target || compacted[compacted.length - 1] === index) continue;
        compacted.push(index);
      }
      state.players.paths[player] = compacted;
    }
  }

  function normalizeTargets(changedPlayer = -1) {
    const count = Math.max(1, state.characters.length);
    for (let i = 0; i < state.players.targets.length; i++) {
      state.players.targets[i] = clamp(Math.round(Number(state.players.targets[i]) || 0), 0, count - 1);
    }
    if (!state.players.allowDuplicate && state.characters.length > 0) {
      const used = new Set();
      const active = getPlaybackPlayers();
      const order = active.includes(changedPlayer)
        ? [changedPlayer, ...active.filter(index => index !== changedPlayer)]
        : active;
      for (const player of order) {
        let target = state.players.targets[player];
        if (used.has(target)) {
          let candidate = target;
          for (let step = 1; step <= state.characters.length; step++) {
            const test = (target + step) % state.characters.length;
            if (!used.has(test)) {
              candidate = test;
              break;
            }
          }
          target = candidate;
          state.players.targets[player] = target;
        }
        used.add(target);
      }
    }
  }

  function normalizePlayerLabel(value) {
    return Array.from(String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()).slice(0, 24).join("");
  }

  function getPlayerLabel(player) {
    return normalizePlayerLabel(state.players.labels?.[player]) || `${player + 1}P`;
  }

  function getPlaybackPlayers() {
    return state.players.selectionMode === "single"
      ? [state.players.singleNumber - 1]
      : Array.from({ length: state.players.count }, (_, index) => index);
  }

  function getSelectionIssue() {
    const visible = getVisibleCharacterCount();
    return state.players.selectionMode === "sequence" && !state.players.allowDuplicate && visible > 0 && state.players.count > visible
      ? T("msg.notEnoughCharacters", visible, state.players.count)
      : "";
  }

  function syncEditingPlayer() {
    const active = getPlaybackPlayers();
    if (!active.includes(editingPlayer)) editingPlayer = active[0];
  }

  function makeDemoSvg(index, name, colorA, colorB) {
    const bodyColor = ["#bfdbfe", "#fecdd3", "#a5f3fc", "#ddd6fe", "#fed7aa", "#e0f2fe", "#bbf7d0", "#fef08a"][index % 8];
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 480" role="img" aria-label="${escapeHtml(T("demo.smileAria", name))}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colorA}"/><stop offset="1" stop-color="${colorB}"/></linearGradient>
        </defs>
        <rect width="600" height="480" fill="url(#bg)"/>
        <path d="M145 420 A155 155 0 0 1 455 420 Z" fill="${bodyColor}"/>
        <circle cx="300" cy="150" r="90" fill="#fff5df"/>
        <circle cx="270" cy="140" r="8" fill="#293348"/>
        <circle cx="330" cy="140" r="8" fill="#293348"/>
        <path d="M267 175 Q300 208 333 175" fill="none" stroke="#293348" stroke-width="8" stroke-linecap="round"/>
      </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(T("err.imageLoad")));
      image.src = src;
    });
  }

  async function makeCharacter({ id = "", name, src, scale = 1, offsetX = 0, offsetY = 0, moveRangeX = 100, moveRangeY = 100, mainCrop = null, listCrop = null, demo = false }) {
    const image = await loadImage(src);
    moveRangeX = clamp(Math.max(Number(moveRangeX) || 100, Math.abs(Number(offsetX) || 0)), 25, 500);
    moveRangeY = clamp(Math.max(Number(moveRangeY) || 100, Math.abs(Number(offsetY) || 0)), 25, 500);
    return {
      id: id || (crypto.randomUUID ? crypto.randomUUID() : `char-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      name,
      src,
      scale: clamp(Number(scale) || 1, .1, 5),
      offsetX: clamp(Number(offsetX) || 0, -moveRangeX, moveRangeX),
      offsetY: clamp(Number(offsetY) || 0, -moveRangeY, moveRangeY),
      moveRangeX,
      moveRangeY,
      mainCrop: StudioCrop.normalize(mainCrop),
      listCrop: StudioCrop.normalize(listCrop),
      demo,
      image
    };
  }

  async function loadDemoCharacters(replace = true) {
    const palette = [
      ["#2d6cdf", "#291957"], ["#d85a62", "#5d172a"], ["#188db0", "#123956"], ["#7357ca", "#241b50"],
      ["#d77837", "#592532"], ["#5f89bb", "#263b66"], ["#2d9b78", "#123d3d"], ["#bd8a32", "#4d2d3d"]
    ];
    if (replace) state.characters = [];
    const items = await Promise.all(DEMO_NAMES.map((name, index) => makeCharacter({
      name,
      src: makeDemoSvg(index, name, palette[index][0], palette[index][1]),
      demo: true,
      scale: 1,
      offsetY: 0
    })));
    state.characters.push(...items);
    state.players.targets = [0, 1, 2, 3];
    if (replace) {
      state.players.starts = [null, null, null, null];
      state.players.pathModes = ["random", "random", "random", "random"];
      state.players.paths = [[], [], [], []];
    }
    normalizeTargets();
    refreshInspector();
    resetPreview();
    toast(T("msg.demoLoaded"), "success");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error(T("err.fileRead")));
      reader.readAsDataURL(file);
    });
  }

  async function addCharacterFiles(fileList) {
    if (!fileList.length) return;
    const files = [...fileList].filter(file => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(file.name));
    if (!files.length) {
      toast(T("msg.noSupportedImage"), "error");
      return;
    }
    const targetState = state;
    const targetCharacters = state.characters;
    let loaded = 0;
    for (const file of files) {
      try {
        const src = await fileToDataUrl(file);
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || `CHARACTER ${state.characters.length + 1}`;
        const character = await makeCharacter({ name, src });
        if (state !== targetState || state.characters !== targetCharacters) return;
        state.characters.push(character);
        loaded++;
      } catch (error) {
        console.error(error);
        toast(T("msg.imageReadFailed", file.name), "error");
      }
    }
    normalizeTargets();
    refreshInspector();
    resetPreview();
    if (loaded) toast(T("msg.imagesAdded", loaded), "success");
  }

  function chooseReplacementImage(character) {
    if (!character) return;
    pendingReplacementCharacter = character;
    const input = $("#replaceCharacterFileInput");
    input.value = "";
    input.click();
  }

  async function replaceCharacterFile(character, file) {
    if (!character || !file || !state.characters.includes(character)) return;
    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(file.name)) {
      toast(T("msg.pickImage"), "error");
      return;
    }
    const request = Symbol("image replacement");
    imageReplacementRequests.set(character, request);
    try {
      const src = await fileToDataUrl(file);
      const image = await loadImage(src);
      // Apply only to the same living character and the newest replacement request.
      if (!state.characters.includes(character) || imageReplacementRequests.get(character) !== request) return;
      Object.assign(character, { src, image, demo: false, scale: 1, offsetX: 0, offsetY: 0, mainCrop: null, listCrop: null });
      renderCharacterList();
      redrawPreview();
      toast(T("msg.imageReplaced", character.name || T("word.character")), "success");
    } catch (error) {
      if (!state.characters.includes(character) || imageReplacementRequests.get(character) !== request) return;
      console.error(error);
      toast(T("msg.imageKeepOld"), "error");
    } finally {
      if (imageReplacementRequests.get(character) === request) imageReplacementRequests.delete(character);
    }
  }

  async function setBackgroundFile(file) {
    if (!file) return;
    try {
      const src = await fileToDataUrl(file);
      backgroundImage = await loadImage(src);
      state.background.imageSrc = src;
      state.background.type = "image";
      syncControlsFromState();
      redrawPreview();
      toast(T("msg.bgApplied"), "success");
    } catch (error) {
      console.error(error);
      toast(T("msg.bgFailed"), "error");
    }
  }

  function toast(message, type = "") {
    const node = document.createElement("div");
    node.className = `toast ${type}`.trim();
    node.textContent = message;
    $("#toastRegion").append(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(6px)";
      setTimeout(() => node.remove(), 220);
    }, 3200);
  }

  function formatOutput(path, value) {
    if (path === "mainPanel.size") return `${Math.round(value)}%`;
    if (path === "mainPanel.gap" || path === "mainPanel.slotGap") return `${Math.round(value)}px`;
    if (path.startsWith("animation.") && path !== "animation.hops" && path !== "animation.fps") return `${Math.round(value)}ms`;
    if (path === "animation.hops") return T("unit.times", Math.round(value));
    if (["background.angle"].includes(path)) return `${Math.round(value)}°`;
    if (["layout.radius", "selected.glow", "selected.borderWidth"].includes(path)) return `${Math.round(value)}px`;
    if (path === "selected.scale") return `${Number(value).toFixed(2)}×`;
    if (path.includes("brightness") || path.includes("saturation") || path.includes("Alpha")) return `${Math.round(value)}%`;
    return String(value);
  }

  function syncControlsFromState() {
    fontController?.sync();
    $$('[data-bind]').forEach(element => {
      const value = getByPath(state, element.dataset.bind);
      if (value === undefined) return;
      if (element.type === "checkbox") element.checked = Boolean(value);
      else element.value = String(value);
    });
    $$('[data-output]').forEach(output => {
      const path = output.dataset.output;
      output.textContent = formatOutput(path, getByPath(state, path));
    });
    updateContextControls();
  }

  function setEditorTab(name, { focus = false, scroll = false } = {}) {
    const selectedTab = $(`[data-editor-tab="${CSS.escape(name)}"]`);
    if (!selectedTab) return;
    $$('[data-editor-tab]').forEach(button => {
      const selected = button === selectedTab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      $(`#${button.getAttribute("aria-controls")}`).hidden = !selected;
    });
    const guides = {
      /* 值是 i18n key，顯示時才用 T() 取值，語言切換後會跟著變。 */
      characters: ["guide.title", "guide.copy"],
      appearance: ["guide.appearance.title", "guide.appearance.copy"],
      motion: ["guide.motion.title", "guide.motion.copy"],
      export: ["guide.export.title", "guide.export.copy"]
    };
    $("#guideTitle").textContent = T(guides[name][0]);
    $("#guideCopy").textContent = T(guides[name][1]);
    if (focus) selectedTab.focus({ preventScroll: true });
    if (scroll && matchMedia("(max-width: 800px)").matches) {
      $(".editor-panel").scrollIntoView({ block: "start", behavior: "instant" });
    }
  }

  function updateContextControls() {
    $$('[data-background-options]').forEach(element => {
      element.hidden = !element.dataset.backgroundOptions.split(" ").includes(state.background.type);
    });
    $("#backgroundFileLabel").textContent = T(state.background.imageSrc ? "bg.replaceImage" : "bg.pickImage");
    $("#clearBackgroundButton").disabled = !state.background.imageSrc;
    $("#fixedTintField").hidden = state.selected.tintMode !== "fixed";
    $("#previewDimensions").textContent = `${state.canvas.width} × ${state.canvas.height}`;
    const gapInput = $('[data-bind="layout.gap"]');
    gapInput.disabled = state.layout.autoGap;
    gapInput.value = String(state.layout.gap);
    $("#layoutRowsLabel").textContent = T(state.layout.autoRows ? "layout.rows" : "layout.rowsFixed");
    const capacityHelp = $("#layoutCapacityHelp");
    const visibleCount = getVisibleCharacterCount();
    capacityHelp.hidden = visibleCount >= state.characters.length;
    capacityHelp.textContent = T("msg.capacity", state.layout.columns, getEffectiveRows(), visibleCount);
    const single = state.players.selectionMode === "single";
    $("#singlePlayerSettings").hidden = !single;
    $("#sequencePlayerSettings").hidden = single;
    const selectionIssue = getSelectionIssue();
    $("#selectionIssue").hidden = !selectionIssue;
    $("#selectionIssueText").textContent = selectionIssue;
    if (selectionIssue && previewPlaying) {
      previewPlaying = false;
      updatePlayButton();
    }
    $$('[data-border-preset]').forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.borderPreset === state.layout.borderStyle));
    });
    $("#selectionModeBadge").textContent = single ? T("player.badge.only", getPlayerLabel(state.players.singleNumber - 1)) : T("player.badge.seqN", state.players.count);
    $("#timelineModeLabel").textContent = single ? T("preview.timeModeOne", getPlayerLabel(state.players.singleNumber - 1)) : T("preview.timeMode");
    $("#selectionModeHelp").textContent = single
      ? T("player.singleModeHelp", getPlayerLabel(state.players.singleNumber - 1))
      : T("player.seqHelpN", getPlayerLabel(0));
    $$('[data-single-number]').forEach(button => {
      const number = Number(button.dataset.singleNumber);
      button.setAttribute("aria-pressed", String(single && number === state.players.singleNumber));
      button.textContent = getPlayerLabel(number - 1);
      button.title = T("player.numberTitle", number, getPlayerLabel(number - 1));
    });
    $("#canvasStage").classList.toggle("is-transparent", state.background.type === "transparent");
    $("#mainPanelSettings").hidden = !state.mainPanel.enabled;
    const mainCount = state.mainPanel.count;
    const mainColumns = state.mainPanel.columns;
    $('[data-bind="mainPanel.columns"]').max = String(mainCount);
    $("#mainPanelRows").value = String(Math.ceil(mainCount / mainColumns));
    $("#mainPanelFillHelp").textContent = mainCount === 1
      ? T("comp.fillHelp")
      : T("comp.fillHelpMulti", mainCount);
    $$('[data-main-grid-preset]').forEach(button => {
      const [count, columns] = button.dataset.mainGridPreset.split(",").map(Number);
      button.setAttribute("aria-pressed", String(mainCount === count && mainColumns === columns));
    });
    $("#compositionBadge").textContent = T(state.mainPanel.enabled ? "comp.badge.main" : "comp.badge.grid");
    $("#layoutAreaLabel").textContent = T(state.mainPanel.enabled ? "layout.areaLabelMain" : "layout.areaLabel");
    $("#layoutGridHelp").hidden = !state.mainPanel.enabled;
    $$('[data-showcase-preset]').forEach(button => {
      const portrait = button.dataset.showcasePreset === "portrait";
      const active = state.mainPanel.enabled && state.mainPanel.position === (portrait ? "top" : "left")
        && state.canvas.width === (portrait ? 960 : 1280) && state.canvas.height === (portrait ? 1280 : 720);
      button.setAttribute("aria-pressed", String(active));
    });
    updateEditingPlayer();
  }

  function renderPreviewPlayers() {
    $("#previewPlayerButtons").innerHTML = getPlaybackPlayers().map(player =>
      `<button type="button" data-preview-player="${player}" aria-label="${escapeHtml(T("player.targetAria", getPlayerLabel(player)))}" aria-pressed="${player === editingPlayer}" style="--player-color:${escapeHtml(state.players.colors[player])}">${escapeHtml(getPlayerLabel(player))}</button>`
    ).join("");
    updateEditingPlayer();
  }

  function updateEditingPlayer() {
    $$(".player-row").forEach(row => {
      const active = Number(row.dataset.player) === editingPlayer;
      row.classList.toggle("is-editing", active);
      $(".player-tag", row).setAttribute("aria-pressed", String(active));
    });
    $$('[data-preview-player]').forEach(button => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.previewPlayer) === editingPlayer));
    });
    $("#canvasTip").textContent = state.characters.length
      ? state.mainPanel.enabled
        ? T("preview.hintMain", getPlayerLabel(editingPlayer))
        : T("preview.hintPick", getPlayerLabel(editingPlayer))
      : T("preview.hintEmpty");
  }

  function updatePlayButton() {
    $("#playButton").textContent = T(previewPlaying ? "preview.pause" : "preview.play");
    $("#playButton").setAttribute("aria-label", T(previewPlaying ? "preview.pauseAria" : "preview.playAria"));
  }

  function getCharacterOptionsMarkup() {
    return state.characters.length
      ? state.characters.map((character, index) => `<option value="${index}">${escapeHtml(character.name || `CHARACTER ${index + 1}`)}</option>`).join("")
      : `<option value="0">${T("player.noCharacter")}</option>`;
  }

  function getRouteSummary(player) {
    if (!state.characters.length) return T("player.addFirst");
    const target = clamp(state.players.targets[player] || 0, 0, state.characters.length - 1);
    const path = getSelectionPath(player, target, state.characters.length);
    return path.map(index => state.characters[index]?.name || `CHARACTER ${index + 1}`).join(" → ");
  }

  function renderPlayerList() {
    const container = $("#playerList");
    const expandedPlayers = new Set($$(".player-route-details[open]", container).map(details => details.closest(".player-row").dataset.player));
    container.innerHTML = "";
    const characterOptions = getCharacterOptionsMarkup();
    const startOptions = `<option value="random">${T("player.random")}</option>${characterOptions}`;
    for (const player of getPlaybackPlayers()) {
      const row = document.createElement("div");
      const customMode = state.players.pathModes[player] === "custom";
      const waypoints = Array.isArray(state.players.paths[player]) ? state.players.paths[player] : [];
      row.className = `player-row${player === editingPlayer ? " is-editing" : ""}`;
      row.dataset.player = String(player);
      row.style.setProperty("--player-color", state.players.colors[player]);
      const waypointMarkup = customMode
        ? waypoints.map((waypoint, waypointIndex) => `
            <div class="player-waypoint-row">
              <span class="waypoint-label">${T("route.waypoint", waypointIndex + 1)}</span>
              <select class="player-waypoint" data-waypoint-index="${waypointIndex}" aria-label="${escapeHtml(T("route.waypointAria", getPlayerLabel(player), waypointIndex + 1))}" ${state.characters.length ? "" : "disabled"}>${characterOptions}</select>
              <button type="button" class="mini-route-button" data-player-action="waypoint-up" data-waypoint-index="${waypointIndex}" aria-label="${T('route.moveUp')}" ${waypointIndex === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="mini-route-button" data-player-action="waypoint-down" data-waypoint-index="${waypointIndex}" aria-label="${T('route.moveDown')}" ${waypointIndex === waypoints.length - 1 ? "disabled" : ""}>↓</button>
              <button type="button" class="mini-route-button remove" data-player-action="remove-waypoint" data-waypoint-index="${waypointIndex}" aria-label="${T('route.remove')}">×</button>
            </div>`).join("") || '<div class="player-route-empty">${T("route.emptyCustom")}</div>'
        : '<div class="player-route-empty">${T("route.emptyAuto")}</div>';
      row.innerHTML = `
        <label class="field compact player-label-field"><span>${T("player.labelField", player + 1)}</span><input type="text" class="player-label-input" maxlength="24" value="${escapeHtml(state.players.labels[player])}" placeholder="${escapeHtml(T("player.labelPlaceholder", player + 1))}" aria-label="${escapeHtml(T("player.labelAria", player + 1))}"></label>
        <div class="player-row-head">
          <button type="button" class="player-tag" aria-label="${escapeHtml(T("player.targetAria", getPlayerLabel(player)))}" aria-pressed="${player === editingPlayer}">${escapeHtml(getPlayerLabel(player))}</button>
          <input type="color" class="player-color" value="${escapeHtml(state.players.colors[player])}" aria-label="${escapeHtml(T("player.colorAria", getPlayerLabel(player)))}">
          <label class="player-inline-field player-target-field"><span>${T("player.target")}</span><select class="player-target" aria-label="${escapeHtml(T("player.targetCharAria", getPlayerLabel(player)))}" ${state.characters.length ? "" : "disabled"}>${characterOptions}</select></label>
        </div>
        <details class="player-route-details" ${expandedPlayers.has(String(player)) ? "open" : ""}>
        <summary>${T("route.legend")} <span class="summary-hint">${T(customMode ? "route.custom" : "route.auto")}</span></summary>
        <div class="player-route-content"><div class="player-route-settings">
          <label class="player-inline-field"><span>${T("route.start")}</span><select class="player-start" aria-label="${escapeHtml(T("route.startAria", getPlayerLabel(player)))}" ${state.characters.length ? "" : "disabled"}>${startOptions}</select></label>
          <label class="player-inline-field"><span>${T("route.mode")}</span><select class="player-path-mode" aria-label="${escapeHtml(T("route.modeAria", getPlayerLabel(player)))}"><option value="random">${T("route.mode.auto")}</option><option value="custom">${T("route.mode.custom")}</option></select></label>
        </div>
        <div class="player-route-summary"><span>${T("route.summary")}</span><strong>${escapeHtml(getRouteSummary(player))}</strong></div>
        <div class="player-route-tools">
          <button type="button" class="route-button" data-player-action="capture-auto" ${!customMode && state.characters.length ? "" : "disabled"}>${T("route.capture")}</button>
          <button type="button" class="route-button" data-player-action="add-waypoint" ${customMode && state.characters.length && waypoints.length < MAX_CUSTOM_WAYPOINTS ? "" : "disabled"}>${T("route.addWaypoint")}</button>
        </div>
        <div class="player-path-editor">${waypointMarkup}</div></div></details>`;
      const targetSelect = $(".player-target", row);
      const startSelect = $(".player-start", row);
      const modeSelect = $(".player-path-mode", row);
      targetSelect.value = String(state.players.targets[player] ?? 0);
      startSelect.value = state.players.starts[player] === null ? "random" : String(state.players.starts[player]);
      modeSelect.value = customMode ? "custom" : "random";
      $$(".player-waypoint", row).forEach(select => {
        const waypointIndex = Number(select.dataset.waypointIndex);
        select.value = String(waypoints[waypointIndex] ?? 0);
      });
      container.append(row);
    }
    renderPreviewPlayers();
  }

  function renderCharacterList() {
    const container = $("#characterList");
    const expandedIds = new Set($$(".character-adjustments[open]", container).map(details => details.closest(".character-card").dataset.id));
    $("#characterCount").textContent = T("chara.countN", state.characters.length);
    if (!state.characters.length) {
      container.innerHTML = `<div class="empty-list">${T("chara.empty")}</div>`;
      return;
    }
    container.innerHTML = "";
    state.characters.forEach((character, index) => {
      const assigned = [];
      for (const player of getPlaybackPlayers()) {
        if (state.players.targets[player] === index) assigned.push(player);
      }
      const card = document.createElement("article");
      card.className = "character-card";
      card.dataset.id = character.id;
      card.dataset.index = String(index);
      card.innerHTML = `
        <div class="character-main">
          <img class="character-thumb" src="${escapeHtml(character.src)}" alt="">
          <div class="character-info">
            <input class="character-name" type="text" value="${escapeHtml(character.name)}" maxlength="60" aria-label="${escapeHtml(T("chara.nameAria", index + 1))}">
            <div class="character-meta"><span class="character-position">${String(index + 1).padStart(2, "0")} · ${T(character.demo ? "chara.kind.demo" : "chara.kind.own")}</span>${assigned.map(player => `<span class="assignment-dot" style="--dot-color:${state.players.colors[player]}">${escapeHtml(getPlayerLabel(player))}</span>`).join("")}</div>
          </div>
        </div>
        <div class="character-toolbar">
          <button type="button" class="replace-image-button" data-action="replace" aria-label="${escapeHtml(T("chara.replaceAria", character.name))}">${T("chara.replace")}</button>
          <div class="character-actions">
            <button type="button" data-action="up" title="${T('chara.up')}" aria-label="${escapeHtml(T("chara.upAria", character.name))}" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-action="down" title="${T('chara.down')}" aria-label="${escapeHtml(T("chara.downAria", character.name))}" ${index === state.characters.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-action="duplicate" title="${T('chara.duplicate')}" aria-label="${escapeHtml(T("chara.duplicateAria", character.name))}">⧉</button>
            <button type="button" class="remove" data-action="remove" title="${T('chara.delete')}" aria-label="${escapeHtml(T("chara.deleteAria", character.name))}">×</button>
          </div>
        </div>
        <details class="character-adjustments" ${expandedIds.has(character.id) ? "open" : ""}>
          <summary>${T("chara.tune")}</summary>
          <div class="character-tuning">
            <div class="character-crop-tools"><button type="button" class="button secondary small" data-action="crop-list">${T("chara.cropList")}</button><p class="help-text">${T(character.listCrop ? "chara.cropList.custom" : "chara.cropList.full")}</p></div>
            <p class="help-text">${T("chara.tuneHelp")}</p>
            <label class="tune-row"><span>${T("chara.scale")}</span><input type="range" min="0.1" max="5" step="0.01" data-tune="scale" value="${character.scale}"><output>${character.scale.toFixed(2)}×</output></label>
            <label class="tune-row"><span>${T("chara.offsetX")}</span><input type="range" min="${-character.moveRangeX}" max="${character.moveRangeX}" step="1" data-tune="offsetX" value="${character.offsetX}"><output>${Math.round(character.offsetX)}%</output></label>
            <label class="tune-row"><span>${T("chara.offsetY")}</span><input type="range" min="${-character.moveRangeY}" max="${character.moveRangeY}" step="1" data-tune="offsetY" value="${character.offsetY}"><output>${Math.round(character.offsetY)}%</output></label>
            <div class="movement-limits">
              <label class="field compact"><span>${T("chara.rangeX")}</span><input type="number" min="25" max="500" step="1" data-move-range="X" value="${character.moveRangeX}"></label>
              <label class="field compact"><span>${T("chara.rangeY")}</span><input type="number" min="25" max="500" step="1" data-move-range="Y" value="${character.moveRangeY}"></label>
            </div>
            <div class="character-crop-tools"><button type="button" class="button secondary small" data-action="crop-main">${T("chara.cropMain")}</button><p class="help-text">${T(character.mainCrop ? "chara.cropMain.custom" : "chara.cropMain.full")}</p></div>
          </div>
        </details>`;
      container.append(card);
    });
  }

  function refreshInspector() {
    sanitizeState();
    syncEditingPlayer();
    renderPlayerList();
    renderCharacterList();
    updateContextControls();
    updateExportEstimate();
    redrawPreview();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseHexColor(hex, alpha = 255) {
    const normalized = String(hex || "#000000").replace("#", "");
    const full = normalized.length === 3 ? normalized.split("").map(char => char + char).join("") : normalized.padEnd(6, "0").slice(0, 6);
    return {
      r: parseInt(full.slice(0, 2), 16) || 0,
      g: parseInt(full.slice(2, 4), 16) || 0,
      b: parseInt(full.slice(4, 6), 16) || 0,
      a: alpha
    };
  }

  function hexToRgba(hex, alpha) {
    const color = parseHexColor(hex);
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`;
  }

  function getEffectiveRows() {
    const minimum = Math.max(1, state.layout.rows);
    if (!state.layout.autoRows) return minimum;
    return Math.max(minimum, Math.ceil(Math.max(1, state.characters.length) / state.layout.columns));
  }

  function setTheme(theme) {
    const light = theme === "light";
    document.documentElement.dataset.theme = light ? "light" : "dark";
    const button = $("#themeToggleButton");
    button.textContent = T(light ? "top.themeDark" : "top.themeLight");
    button.setAttribute("aria-label", T(light ? "top.themeDarkAria" : "top.themeAria"));
    button.setAttribute("aria-pressed", String(light));
    try { localStorage.setItem("character-select-theme", light ? "light" : "dark"); } catch {}
  }

  function initializeTheme() {
    let theme = "dark";
    try { theme = localStorage.getItem("character-select-theme") || theme; } catch {}
    setTheme(theme);
    $("#themeToggleButton").addEventListener("click", () => {
      setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
    });
  }

  function getCompositionRects() {
    const { x, y, width, height } = state.layout;
    const bounds = { x, y, width, height };
    if (!state.mainPanel.enabled) return { main: null, grid: bounds };
    const vertical = state.mainPanel.position === "top";
    const length = vertical ? height : width;
    const gap = Math.min(state.mainPanel.gap, length * .2);
    const mainLength = (length - gap) * state.mainPanel.size / 100;
    const gridLength = length - gap - mainLength;
    if (vertical) return {
      main: { x, y, width, height: mainLength },
      grid: { x, y: y + mainLength + gap, width, height: gridLength }
    };
    const mainOnLeft = state.mainPanel.position === "left";
    return {
      main: { x: mainOnLeft ? x : x + gridLength + gap, y, width: mainLength, height },
      grid: { x: mainOnLeft ? x + mainLength + gap : x, y, width: gridLength, height }
    };
  }

  function getMainPanelRects() {
    const bounds = getCompositionRects().main;
    if (!bounds) return [];
    const count = state.mainPanel.count;
    const columns = state.mainPanel.columns;
    const rows = Math.ceil(count / columns);
    const gap = Math.min(state.mainPanel.slotGap, bounds.width / columns * .35, bounds.height / rows * .35);
    const width = (bounds.width - gap * (columns - 1)) / columns;
    const height = (bounds.height - gap * (rows - 1)) / rows;
    return Array.from({ length: count }, (_, index) => ({
      x: bounds.x + index % columns * (width + gap),
      y: bounds.y + Math.floor(index / columns) * (height + gap),
      width, height, index
    }));
  }

  function updateLayoutGap() {
    const columns = state.layout.columns;
    const rows = getEffectiveRows();
    const { width, height } = getCompositionRects().grid;
    // Keep a positive tile area even when a dense grid uses a manual gap.
    const maximumGap = Math.max(0, Math.floor(Math.min(
      120,
      columns > 1 ? (width - Math.min(width / 2, columns)) / (columns - 1) : 120,
      rows > 1 ? (height - Math.min(height / 2, rows)) / (rows - 1) : 120
    )));
    const automaticGap = Math.round(Math.min(
      width * 0.09 / (columns + 0.09 * (columns - 1)),
      height * 0.09 / (rows + 0.09 * (rows - 1))
    ));
    state.layout.gap = clamp(state.layout.autoGap ? automaticGap : Number(state.layout.gap) || 0, 0, maximumGap);
  }

  function getVisibleCharacterCount() {
    return Math.min(state.characters.length, state.layout.columns * getEffectiveRows());
  }

  function getTileRects() {
    const count = getVisibleCharacterCount();
    const columns = Math.max(1, state.layout.columns);
    const rows = getEffectiveRows();
    const gap = state.layout.gap;
    const grid = getCompositionRects().grid;
    const cellWidth = (grid.width - gap * (columns - 1)) / columns;
    const cellHeight = (grid.height - gap * (rows - 1)) / rows;
    const rects = [];
    for (let index = 0; index < count; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      rects.push({
        x: grid.x + column * (cellWidth + gap),
        y: grid.y + row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
        index
      });
    }
    return rects;
  }

  function getTimelineDuration() {
    return state.animation.initialHold
      + getPlaybackPlayers().length * (state.animation.searchDuration + state.animation.confirmDuration)
      + state.animation.endHold;
  }

  function getAutomaticStartIndex(player, target, count) {
    if (count <= 1) return 0;
    const configured = state.players.starts[player];
    if (configured !== null && configured !== undefined && configured !== "") {
      return clamp(Math.round(Number(configured) || 0), 0, count - 1);
    }
    const hops = clamp(Math.round(state.animation.hops), 0, 10);
    let start = (player * 2 + Math.max(0, target - hops - 1)) % count;
    if (start < 0) start += count;
    return start;
  }

  function compactSelectionPath(path, target, count) {
    const compacted = [];
    for (const rawIndex of path) {
      const index = clamp(Math.round(Number(rawIndex) || 0), 0, Math.max(0, count - 1));
      if (compacted[compacted.length - 1] !== index) compacted.push(index);
    }
    if (!compacted.length) compacted.push(clamp(target, 0, Math.max(0, count - 1)));
    if (compacted[compacted.length - 1] !== target) compacted.push(target);
    return compacted;
  }

  function getAutomaticSelectionPath(player, target, count) {
    if (count <= 1) return [0];
    const hops = clamp(Math.round(state.animation.hops), 0, 10);
    const start = getAutomaticStartIndex(player, target, count);
    const path = [start];
    for (let step = 0; step < hops; step++) {
      let candidate = (start + (step + 1) * (player + 2) + step * step + 1) % count;
      if (candidate === target && step < hops - 1) candidate = (candidate + 1) % count;
      if (candidate === path[path.length - 1]) candidate = (candidate + 1) % count;
      path.push(candidate);
    }
    return compactSelectionPath(path, target, count);
  }

  function getSelectionPath(player, target, count) {
    if (count <= 1) return [0];
    target = clamp(Math.round(Number(target) || 0), 0, count - 1);
    if (state.players.pathModes[player] !== "custom") {
      return getAutomaticSelectionPath(player, target, count);
    }
    const start = getAutomaticStartIndex(player, target, count);
    const waypoints = Array.isArray(state.players.paths[player]) ? state.players.paths[player] : [];
    return compactSelectionPath([start, ...waypoints.slice(0, MAX_CUSTOM_WAYPOINTS)], target, count);
  }

  function interpolateRect(a, b, t) {
    if (!a) return b || null;
    if (!b) return a;
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      width: lerp(a.width, b.width, t),
      height: lerp(a.height, b.height, t)
    };
  }

  function getSceneAt(rawTime) {
    const rects = getTileRects();
    const count = rects.length;
    const duration = Math.max(1, getTimelineDuration());
    let time = clamp(rawTime, 0, duration);
    const locked = [];
    if (!count) return { locked, activePlayer: -1, hoverIndex: -1, cursorRect: null, confirmProgress: 0, final: true };

    if (time < state.animation.initialHold) {
      const firstPlayer = getPlaybackPlayers()[0];
      const firstTarget = clamp(state.players.targets[firstPlayer] || 0, 0, count - 1);
      const firstPath = getSelectionPath(firstPlayer, firstTarget, count);
      const firstCursor = firstPath[0] ?? firstTarget;
      return { locked, activePlayer: firstPlayer, hoverIndex: firstCursor, cursorRect: rects[firstCursor], confirmProgress: 0, final: false, waiting: true };
    }
    time -= state.animation.initialHold;

    for (const player of getPlaybackPlayers()) {
      const target = clamp(state.players.targets[player] || 0, 0, count - 1);
      if (time < state.animation.searchDuration) {
        const progress = clamp(time / Math.max(1, state.animation.searchDuration), 0, 1);
        const path = getSelectionPath(player, target, count);
        if (path.length === 1) {
          return { locked, activePlayer: player, hoverIndex: target, cursorRect: rects[target], confirmProgress: 0, final: false };
        }
        const segmentPosition = progress * (path.length - 1);
        const segment = Math.min(path.length - 2, Math.floor(segmentPosition));
        const local = easeInOutCubic(segmentPosition - segment);
        const fromIndex = path[segment];
        const toIndex = path[segment + 1];
        return {
          locked,
          activePlayer: player,
          hoverIndex: local > 0.45 ? toIndex : fromIndex,
          cursorRect: interpolateRect(rects[fromIndex], rects[toIndex], local),
          confirmProgress: 0,
          final: false
        };
      }
      time -= state.animation.searchDuration;
      if (time < state.animation.confirmDuration) {
        const progress = clamp(time / Math.max(1, state.animation.confirmDuration), 0, 1);
        return {
          locked,
          activePlayer: player,
          hoverIndex: target,
          cursorRect: rects[target],
          confirmProgress: progress,
          confirming: true,
          final: false
        };
      }
      time -= state.animation.confirmDuration;
      locked.push({ player, target });
    }

    return { locked, activePlayer: -1, hoverIndex: -1, cursorRect: null, confirmProgress: 1, final: true };
  }

  function roundedRectPath(ctx, x, y, width, height, radius) {
    const r = clamp(radius, 0, Math.min(width, height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function strokeStyledBorder(ctx, rect, radius, style = state.layout.borderStyle) {
    const { x, y, width, height } = rect;
    const lineWidth = ctx.lineWidth;
    if (![x, y, width, height, lineWidth].every(Number.isFinite)
      || width <= 0 || height <= 0 || lineWidth <= 0) return;
    const side = Math.min(width, height);
    const r = clamp(Number(radius) || 0, 0, side / 2);
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.lineCap = "butt";
    if (style === "corners") {
      const length = Math.min(side * .22, 48);
      const cornerRadius = Math.min(r, length / 2);
      ctx.beginPath();
      // Four independent corner strokes leave the middle of every side empty.
      ctx.moveTo(x + length, y);
      ctx.lineTo(x + cornerRadius, y);
      ctx.arcTo(x, y, x, y + cornerRadius, cornerRadius);
      ctx.lineTo(x, y + length);
      ctx.moveTo(x + width - length, y);
      ctx.lineTo(x + width - cornerRadius, y);
      ctx.arcTo(x + width, y, x + width, y + cornerRadius, cornerRadius);
      ctx.lineTo(x + width, y + length);
      ctx.moveTo(x, y + height - length);
      ctx.lineTo(x, y + height - cornerRadius);
      ctx.arcTo(x, y + height, x + cornerRadius, y + height, cornerRadius);
      ctx.lineTo(x + length, y + height);
      ctx.moveTo(x + width, y + height - length);
      ctx.lineTo(x + width, y + height - cornerRadius);
      ctx.arcTo(x + width, y + height, x + width - cornerRadius, y + height, cornerRadius);
      ctx.lineTo(x + width - length, y + height);
      ctx.stroke();
    } else if (style === "double") {
      ctx.lineWidth = lineWidth / 2;
      roundedRectPath(ctx, x, y, width, height, r);
      ctx.stroke();
      const inset = Math.max(2, lineWidth * 1.5);
      if (width > inset * 2 && height > inset * 2) {
        roundedRectPath(ctx, x + inset, y + inset, width - inset * 2, height - inset * 2, Math.max(0, r - inset));
        ctx.stroke();
      }
    } else {
      if (style === "dashed") {
        const perimeter = 2 * (width + height - 4 * r) + 2 * Math.PI * r;
        const count = Math.max(4, Math.round(perimeter / (Math.max(3, lineWidth * 3) + Math.max(2, lineWidth * 2))));
        const step = perimeter / count;
        ctx.setLineDash([step * .6, step * .4]);
      }
      roundedRectPath(ctx, x, y, width, height, r);
      ctx.stroke();
    }
    ctx.restore();
  }

  function getMainPanelSelections(scene) {
    const selections = Array(state.mainPanel.count).fill(null);
    const players = getPlaybackPlayers();
    const place = selection => {
      const order = players.indexOf(selection.player);
      if (order >= 0) selections[order % selections.length] = selection;
    };
    scene.locked.forEach(place);
    if (scene.activePlayer >= 0 && scene.hoverIndex >= 0 && (scene.confirming
      || (state.mainPanel.reveal === "hover" && !scene.waiting))) {
      place({ player: scene.activePlayer, target: scene.hoverIndex });
    }
    return selections;
  }

  function drawMainPanel(ctx, scene) {
    const rects = getMainPanelRects();
    if (!rects.length) return;
    const selections = getMainPanelSelections(scene);
    rects.forEach((rect, index) => drawMainPanelSlot(ctx, rect, selections[index], scene));
  }

  const mainPanelImageLayer = document.createElement("canvas");
  const mainPanelImageContext = mainPanelImageLayer.getContext("2d");

  function drawStyledMainPanelImage(ctx, rect, baseRect, character, player, flash) {
    const transform = ctx.getTransform();
    const scaleX = Math.hypot(transform.a, transform.b);
    const scaleY = Math.hypot(transform.c, transform.d);
    const maxScale = Math.max(1, state.selected.scale * 1.2);
    const width = Math.ceil(baseRect.width * maxScale * scaleX) + 2;
    const height = Math.ceil(baseRect.height * maxScale * scaleY) + 2;
    if (mainPanelImageLayer.width !== width || mainPanelImageLayer.height !== height) {
      mainPanelImageLayer.width = width;
      mainPanelImageLayer.height = height;
    }
    const originX = Math.floor(rect.x * scaleX);
    const originY = Math.floor(rect.y * scaleY);
    mainPanelImageContext.setTransform(1, 0, 0, 1, 0, 0);
    mainPanelImageContext.clearRect(0, 0, width, height);
    mainPanelImageContext.save();
    mainPanelImageContext.setTransform(scaleX, 0, 0, scaleY, -originX, -originY);
    mainPanelImageContext.filter = getSelectedFilter();
    drawMainCharacterImage(mainPanelImageContext, character, rect);
    mainPanelImageContext.restore();
    applyCharacterImageEffects(mainPanelImageContext, {
      tint: getTintColor(player),
      tintAlpha: state.selected.tintAlpha / 100,
      flash
    });
    ctx.drawImage(mainPanelImageLayer, originX / scaleX, originY / scaleY, width / scaleX, height / scaleY);
  }

  function drawMainPanelSlot(ctx, rect, selection, scene) {
    const character = selection && state.characters[selection.target];
    const color = selection ? state.players.colors[selection.player] || state.selected.tint : "rgba(235,245,255,.3)";
    const effects = !!character && state.mainPanel.effects !== false;
    const active = selection && scene.activePlayer === selection.player && scene.hoverIndex === selection.target;
    const confirmProgress = effects && active ? scene.confirmProgress : 0;
    const pulse = confirmProgress > 0
      ? Math.sin(confirmProgress * Math.PI * 4) * (1 - confirmProgress) * .035
      : 0;
    const entrance = confirmProgress > 0
      ? 1 + (easeOutBack(Math.min(1, confirmProgress * 1.8)) - 1) * .6
      : 1;
    const panelScale = effects ? state.selected.scale * (1 + pulse) * entrance : 1;
    const drawRect = scaleRect(rect, panelScale);
    const radius = state.layout.radius * panelScale;
    ctx.save();
    roundedRectPath(ctx, drawRect.x, drawRect.y, drawRect.width, drawRect.height, radius);
    ctx.clip();
    if (character) {
      if (effects) {
        const flash = confirmProgress > 0 ? Math.max(0, 1 - confirmProgress * 2.2) * .34 : 0;
        drawStyledMainPanelImage(ctx, drawRect, rect, character, selection.player, flash);
      } else {
        ctx.save();
        ctx.filter = getSelectedFilter();
        drawMainCharacterImage(ctx, character, drawRect);
        ctx.restore();
      }
      if (state.mainPanel.showName) {
        const nameHeight = Math.min(70 * panelScale, drawRect.height * .22);
        const shade = ctx.createLinearGradient(0, drawRect.y + drawRect.height - nameHeight, 0, drawRect.y + drawRect.height);
        shade.addColorStop(0, "rgba(3,5,10,0)");
        shade.addColorStop(1, "rgba(3,5,10,.88)");
        ctx.fillStyle = shade;
        ctx.fillRect(drawRect.x, drawRect.y + drawRect.height - nameHeight, drawRect.width, nameHeight);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `850 ${Math.max(10 * panelScale, Math.min(26 * panelScale, drawRect.width * .04, nameHeight * .46))}px ${StudioFonts.getCanvasFamily(state.font)}`;
        ctx.fillText(`${getPlayerLabel(selection.player)} · ${character.name}`, drawRect.x + drawRect.width / 2,
          drawRect.y + drawRect.height - nameHeight * .38, Math.max(1, drawRect.width - 32 * panelScale));
      }
    } else if (state.mainPanel.placeholder) {
      ctx.fillStyle = "rgba(230,241,250,.55)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `650 ${Math.max(10, Math.min(22, rect.width * .038))}px ${StudioFonts.getCanvasFamily(state.font)}`;
      ctx.fillText(state.mainPanel.placeholder, rect.x + rect.width / 2,
        rect.y + rect.height / 2, Math.max(1, rect.width - 40));
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = color;
    const borderWidth = effects ? state.selected.borderWidth : character ? Math.max(2, state.layout.borderWidth) : 2;
    if (effects) {
      ctx.shadowColor = color;
      ctx.shadowBlur = state.selected.glow * (confirmProgress > 0 ? 1.25 : 1);
    }
    if (!character) ctx.setLineDash([8, 8]);
    if (borderWidth > 0) {
      ctx.lineWidth = borderWidth;
      if (character) strokeStyledBorder(ctx, drawRect, radius);
      else {
        roundedRectPath(ctx, drawRect.x, drawRect.y, drawRect.width, drawRect.height, radius);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawImageFit(ctx, image, rect, character, fit = "cover") {
    if (!image?.naturalWidth || !image?.naturalHeight) return;
    const crop = StudioCrop.normalize(character.listCrop);
    const imageRatio = image.naturalWidth * (crop?.width || 1) / (image.naturalHeight * (crop?.height || 1));
    const rectRatio = rect.width / rect.height;
    let drawWidth;
    let drawHeight;
    if ((fit === "cover" && imageRatio > rectRatio) || (fit === "contain" && imageRatio < rectRatio)) {
      drawHeight = rect.height;
      drawWidth = drawHeight * imageRatio;
    } else {
      drawWidth = rect.width;
      drawHeight = drawWidth / imageRatio;
    }
    drawWidth *= character.scale;
    drawHeight *= character.scale;
    const offsetX = character.offsetX / 100 * rect.width;
    const offsetY = character.offsetY / 100 * rect.height;
    const x = rect.x + (rect.width - drawWidth) / 2 + offsetX;
    const y = rect.y + (rect.height - drawHeight) / 2 + offsetY;
    if (crop) StudioCrop.draw(ctx, image, { x, y, width: drawWidth, height: drawHeight }, crop, "cover");
    else ctx.drawImage(image, x, y, drawWidth, drawHeight);
  }

  function drawMainCharacterImage(ctx, character, rect) {
    StudioCrop.draw(ctx, character.image, rect, character.mainCrop, state.mainPanel.fit);
  }

  function openCharacterCrop(character, target = "main") {
    if (!character || exportBusy) return;
    previewPlaying = false;
    updatePlayButton();
    const isList = target === "list";
    const property = isList ? "listCrop" : "mainCrop";
    const rect = (isList ? getTileRects() : getMainPanelRects())[0];
    StudioCrop.open({ name: character.name, src: character.src, image: character.image,
      target, crop: character[property], aspect: rect ? rect.width / rect.height : 1,
      fit: isList ? state.layout.fit : state.mainPanel.fit,
      onApply(crop, all) {
        if (!state.characters.includes(character)) return;
        for (const item of all ? state.characters : [character]) {
          item[property] = crop ? { ...crop } : null;
          if (isList) Object.assign(item, { scale: 1, offsetX: 0, offsetY: 0 });
        }
        renderCharacterList();
        redrawPreview();
        const label = T(isList ? "crop.short.listThumb" : "crop.target.main");
        toast(all ? T("msg.cropAppliedAll", label) : T("msg.cropApplied", label), "success");
      }
    });
  }

  function getIdleFilter() {
    const mode = state.idle.mode === "grayscale"
      ? `grayscale(${state.idle.amount}%)`
      : state.idle.mode === "sepia"
        ? `sepia(${state.idle.amount}%)`
        : "";
    return `${mode} brightness(${state.idle.brightness}%) saturate(${state.idle.saturation}%) contrast(104%)`.trim();
  }

  function getSelectedFilter() {
    return `brightness(${state.selected.brightness}%) saturate(${state.selected.saturation}%) contrast(${state.selected.contrast}%)`;
  }

  function getTintColor(player) {
    if (state.selected.tintMode === "none") return null;
    if (state.selected.tintMode === "fixed") return state.selected.tint;
    return state.players.colors[player] || state.selected.tint;
  }

  const characterImageLayer = document.createElement("canvas");
  const characterImageContext = characterImageLayer.getContext("2d");
  const characterTintLayer = document.createElement("canvas");
  const characterTintContext = characterTintLayer.getContext("2d");

  function applyCharacterImageEffects(ctx, { idleOverlay = 0, tint = null, tintAlpha = 0, flash = 0 } = {}) {
    const { width, height } = ctx.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-atop";
    if (idleOverlay > 0) {
      ctx.fillStyle = `rgba(4, 7, 14, ${idleOverlay})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (tint && tintAlpha > 0) {
      if (characterTintLayer.width < width || characterTintLayer.height < height) {
        characterTintLayer.width = Math.max(characterTintLayer.width, width);
        characterTintLayer.height = Math.max(characterTintLayer.height, height);
      }
      characterTintContext.clearRect(0, 0, width, height);
      characterTintContext.drawImage(ctx.canvas, 0, 0);
      characterTintContext.save();
      characterTintContext.globalCompositeOperation = "color";
      characterTintContext.fillStyle = tint;
      characterTintContext.fillRect(0, 0, width, height);
      characterTintContext.restore();
      // The opaque color blend is applied atop the source, retaining its alpha.
      ctx.globalAlpha = tintAlpha;
      ctx.drawImage(characterTintLayer, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  function drawStyledCharacterImage(ctx, rect, baseRect, character, isSelected, focusPlayer, flash) {
    const transform = ctx.getTransform();
    const scaleX = Math.hypot(transform.a, transform.b);
    const scaleY = Math.hypot(transform.c, transform.d);
    // Reserve the largest pulse size so switching tiles does not resize the buffers.
    const maxScale = Math.max(1, state.selected.scale * 1.2);
    const width = Math.ceil(baseRect.width * maxScale * scaleX) + 2;
    const height = Math.ceil(baseRect.height * maxScale * scaleY) + 2;
    if (characterImageLayer.width !== width || characterImageLayer.height !== height) {
      characterImageLayer.width = width;
      characterImageLayer.height = height;
    }
    const originX = Math.floor(rect.x * scaleX);
    const originY = Math.floor(rect.y * scaleY);
    characterImageContext.setTransform(1, 0, 0, 1, 0, 0);
    characterImageContext.clearRect(0, 0, width, height);
    characterImageContext.save();
    characterImageContext.setTransform(scaleX, 0, 0, scaleY, -originX, -originY);
    characterImageContext.filter = isSelected ? getSelectedFilter() : getIdleFilter();
    drawImageFit(characterImageContext, character.image, rect, character, state.layout.fit);
    characterImageContext.restore();
    applyCharacterImageEffects(characterImageContext, {
      idleOverlay: isSelected ? 0 : state.idle.overlayAlpha / 100,
      tint: isSelected ? getTintColor(focusPlayer) : null,
      tintAlpha: state.selected.tintAlpha / 100,
      flash
    });
    ctx.drawImage(characterImageLayer, originX / scaleX, originY / scaleY, width / scaleX, height / scaleY);
  }

  function scaleRect(rect, scale) {
    const width = rect.width * scale;
    const height = rect.height * scale;
    return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
  }

  function drawBackground(ctx) {
    const { width, height } = state.canvas;
    if (state.background.type === "transparent") return;
    if (state.background.type === "image" && backgroundImage) {
      drawImageCover(ctx, backgroundImage, { x: 0, y: 0, width, height });
      if (state.background.imageDim > 0) {
        ctx.fillStyle = `rgba(3, 6, 13, ${state.background.imageDim / 100})`;
        ctx.fillRect(0, 0, width, height);
      }
    } else if (state.background.type === "solid") {
      ctx.fillStyle = state.background.colorA;
      ctx.fillRect(0, 0, width, height);
    } else {
      const angle = state.background.angle * Math.PI / 180;
      const cx = width / 2;
      const cy = height / 2;
      const length = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
      const x1 = cx - Math.cos(angle) * length / 2;
      const y1 = cy - Math.sin(angle) * length / 2;
      const x2 = cx + Math.cos(angle) * length / 2;
      const y2 = cy + Math.sin(angle) * length / 2;
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, state.background.colorA);
      gradient.addColorStop(1, state.background.colorB);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    if (state.background.pattern) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      const step = Math.max(24, Math.min(width, height) / 18);
      for (let x = -height; x < width + height; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height, height);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (state.background.vignette > 0) {
      const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.72);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, `rgba(0,0,0,${state.background.vignette / 100})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function drawImageCover(ctx, image, rect) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const rectRatio = rect.width / rect.height;
    let width;
    let height;
    if (imageRatio > rectRatio) {
      height = rect.height;
      width = height * imageRatio;
    } else {
      width = rect.width;
      height = width / imageRatio;
    }
    ctx.drawImage(image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height);
  }

  function drawTitle(ctx) {
    if (!state.text.showTitle) return;
    const { width } = state.canvas;
    const align = state.text.align;
    const x = align === "left" ? state.layout.x : align === "right" ? state.layout.x + state.layout.width : width / 2;
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.font = `900 ${state.text.titleSize}px ${StudioFonts.getCanvasFamily(state.font)}`;
    ctx.fillText(state.text.title || "", x, Math.max(14, state.layout.y - state.text.titleSize - 48));
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(218,228,247,.68)";
    ctx.font = `700 ${Math.max(9, state.text.titleSize * 0.36)}px ${StudioFonts.getCanvasFamily(state.font)}`;
    ctx.fillText(state.text.subtitle || "", x, Math.max(42, state.layout.y - 33));
    ctx.restore();
  }

  function fitCanvasLabel(ctx, text, maxWidth) {
    if (maxWidth <= 0) return "";
    if (ctx.measureText(text).width <= maxWidth) return text;
    if (ctx.measureText("…").width > maxWidth) return "";
    const characters = Array.from(text);
    while (characters.length && ctx.measureText(characters.join("") + "…").width > maxWidth) characters.pop();
    return characters.join("") + "…";
  }

  function drawCharacterTile(ctx, rect, character, tileIndex, scene) {
    const lockedPlayers = scene.locked.filter(item => item.target === tileIndex).map(item => item.player);
    const isHovered = scene.hoverIndex === tileIndex;
    const isSelected = lockedPlayers.length > 0 || isHovered;
    const focusPlayer = isHovered ? scene.activePlayer : (lockedPlayers.at(-1) ?? -1);
    const confirmPulse = isHovered && scene.confirmProgress > 0
      ? Math.sin(scene.confirmProgress * Math.PI * 4) * (1 - scene.confirmProgress) * 0.035
      : 0;
    const entrance = isHovered && scene.confirmProgress > 0
      ? 1 + (easeOutBack(Math.min(1, scene.confirmProgress * 1.8)) - 1) * 0.6
      : 1;
    const tileScale = isSelected ? state.selected.scale * (1 + confirmPulse) * entrance : 1;
    const drawRect = scaleRect(rect, tileScale);
    const radius = state.layout.radius * tileScale;

    ctx.save();
    roundedRectPath(ctx, drawRect.x, drawRect.y, drawRect.width, drawRect.height, radius);
    ctx.clip();

    const flash = isHovered && scene.confirmProgress > 0
      ? Math.max(0, 1 - scene.confirmProgress * 2.2) * 0.34
      : 0;
    drawStyledCharacterImage(ctx, drawRect, rect, character, isSelected, focusPlayer, flash);

    if (state.labels.show && state.labels.height > 0) {
      const labelHeight = Math.min(drawRect.height * 0.42, state.labels.height * tileScale);
      const gradient = ctx.createLinearGradient(0, drawRect.y + drawRect.height - labelHeight * 1.5, 0, drawRect.y + drawRect.height);
      gradient.addColorStop(0, "rgba(4,6,12,0)");
      gradient.addColorStop(0.45, "rgba(4,6,12,.62)");
      gradient.addColorStop(1, "rgba(4,6,12,.9)");
      ctx.fillStyle = gradient;
      ctx.fillRect(drawRect.x, drawRect.y + drawRect.height - labelHeight * 1.55, drawRect.width, labelHeight * 1.55);
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `850 ${Math.max(8, state.labels.fontSize * tileScale)}px ${StudioFonts.getCanvasFamily(state.font)}`;
      ctx.shadowColor = "rgba(0,0,0,.7)";
      ctx.shadowBlur = 5;
      const text = String(character.name || `CHARACTER ${tileIndex + 1}`).slice(0, 28);
      ctx.fillText(text, drawRect.x + drawRect.width / 2, drawRect.y + drawRect.height - labelHeight * 0.46, drawRect.width - 18);
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = isSelected
      ? state.players.colors[focusPlayer] || state.selected.tint
      : "rgba(255,255,255,.2)";
    const borderWidth = isSelected ? state.selected.borderWidth : state.layout.borderWidth;
    if (isSelected) {
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = state.selected.glow * (scene.confirmProgress > 0 ? 1.25 : 1);
    }
    // Canvas ignores lineWidth = 0, so skip the stroke before assigning it.
    if (borderWidth > 0) {
      ctx.lineWidth = borderWidth;
      strokeStyledBorder(ctx, drawRect, radius);
    }
    ctx.restore();

    if (lockedPlayers.length) {
      const badgeHeight = clamp(drawRect.height * 0.12, 18, 30);
      const available = Math.max(1, drawRect.width - 16 - (isHovered ? drawRect.width * .5 : 0));
      const badgeSlots = Math.max(1, Math.floor((available + 5) / (badgeHeight * 1.5 + 5)));
      const badges = lockedPlayers.slice(0, lockedPlayers.length > badgeSlots ? badgeSlots - 1 : badgeSlots)
        .map(player => ({ text: getPlayerLabel(player), color: state.players.colors[player] }));
      if (badges.length < lockedPlayers.length) badges.push({ text: `+${lockedPlayers.length - badges.length}`, color: "#d9e2f3" });
      const maxBadgeWidth = Math.max(1, (available - 5 * (badges.length - 1)) / badges.length);
      let x = drawRect.x + 8;
      badges.forEach(({ text, color }) => {
        const y = drawRect.y + 8;
        ctx.save();
        ctx.font = `950 ${badgeHeight * 0.48}px ${StudioFonts.getCanvasFamily(state.font)}`;
        const badgeWidth = Math.min(maxBadgeWidth, Math.max(badgeHeight * 1.65, ctx.measureText(text).width + 14));
        roundedRectPath(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.fillStyle = "#071019";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `950 ${badgeHeight * 0.48}px ${StudioFonts.getCanvasFamily(state.font)}`;
        ctx.fillText(fitCanvasLabel(ctx, text, badgeWidth - 10), x + badgeWidth / 2, y + badgeHeight / 2 + 0.5);
        ctx.restore();
        x += badgeWidth + 5;
      });
    }
  }

  function drawCursor(ctx, scene) {
    if (!scene.cursorRect || scene.activePlayer < 0) return;
    const color = state.players.colors[scene.activePlayer] || state.selected.tint;
    const rect = scaleRect(scene.cursorRect, state.selected.scale + 0.012);
    const pulse = scene.confirmProgress > 0 ? 1 + Math.sin(scene.confirmProgress * Math.PI * 5) * 0.12 : 1;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, state.selected.borderWidth * 0.62 * pulse);
    ctx.shadowColor = color;
    ctx.shadowBlur = state.selected.glow * 1.25;
    strokeStyledBorder(ctx, rect, state.layout.radius * (state.selected.scale + .012));

    const tagHeight = clamp(rect.height * 0.13, 19, 32);
    const text = getPlayerLabel(scene.activePlayer);
    ctx.font = `950 ${tagHeight * 0.5}px ${StudioFonts.getCanvasFamily(state.font)}`;
    const sharesTile = scene.locked.some(item => item.target === scene.hoverIndex);
    const maxTagWidth = Math.max(1, sharesTile ? rect.width * .48 : rect.width - 16);
    const tagWidth = Math.min(maxTagWidth, Math.max(tagHeight * 1.82, ctx.measureText(text).width + 16));
    const tagX = rect.x + rect.width - tagWidth - 8;
    const tagY = rect.y + 8;
    roundedRectPath(ctx, tagX, tagY, tagWidth, tagHeight, tagHeight / 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#061017";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `950 ${tagHeight * 0.5}px ${StudioFonts.getCanvasFamily(state.font)}`;
    ctx.fillText(fitCanvasLabel(ctx, text, tagWidth - 10), tagX + tagWidth / 2, tagY + tagHeight / 2 + 0.5);
    ctx.restore();
  }

  function drawFooterStatus(ctx, scene) {
    const width = state.canvas.width;
    const height = state.canvas.height;
    const y = Math.min(height - 18, state.layout.y + state.layout.height + 27);
    const activePlayers = getPlaybackPlayers();
    const dotRadius = Math.max(3.5, Math.min(width, height) * .007);
    const compactProgress = activePlayers.length > 8;
    const progressWidth = compactProgress ? Math.max(48, width * .09) : activePlayers.length * dotRadius * 3;
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.max(10, Math.min(width, height) * .021)}px ${StudioFonts.getCanvasFamily(state.font)}`;
    if (scene.final) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,.82)";
      ctx.fillText("SELECTION COMPLETE", width / 2, y);
    } else if (scene.activePlayer >= 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = state.players.colors[scene.activePlayer];
      const dotsWidth = progressWidth;
      const available = Math.max(1, width - state.layout.x * 2 - dotsWidth - 12);
      const text = fitCanvasLabel(ctx, getPlayerLabel(scene.activePlayer), available * .55);
      const statusX = state.layout.x + Math.max(28, width * .038, ctx.measureText(text).width + 8);
      ctx.fillText(text, state.layout.x, y);
      ctx.fillStyle = "rgba(226,235,250,.72)";
      ctx.font = `700 ${Math.max(8, Math.min(width, height) * .015)}px ${StudioFonts.getCanvasFamily(state.font)}`;
      const status = scene.confirmProgress > 0 ? "  LOCKING IN..." : scene.waiting ? "  READY" : "  SELECTING...";
      ctx.fillText(fitCanvasLabel(ctx, status, available - (statusX - state.layout.x)), statusX, y);
    }

    if (compactProgress) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(226,235,250,.82)";
      ctx.font = `800 ${Math.max(10, Math.min(width, height) * .021)}px ${StudioFonts.getCanvasFamily(state.font)}`;
      ctx.fillText(`${scene.locked.length} / ${activePlayers.length}`, width - state.layout.x, y, progressWidth);
    } else {
      const x = width - state.layout.x - progressWidth;
      activePlayers.forEach((player, index) => {
        const locked = scene.locked.some(item => item.player === player);
        ctx.beginPath();
        ctx.arc(x + index * dotRadius * 3, y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = locked || scene.activePlayer === player ? state.players.colors[player] : "rgba(255,255,255,.22)";
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawGuides(ctx) {
    if (!state.ui.showGuides) return;
    const grid = getCompositionRects().grid;
    ctx.save();
    ctx.strokeStyle = "rgba(118,228,255,.62)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(grid.x - .5, grid.y - .5, grid.width + 1, grid.height + 1);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(7,13,22,.72)";
    ctx.fillRect(grid.x, Math.max(0, grid.y - 20), 118, 17);
    ctx.fillStyle = "rgba(149,233,255,.92)";
    ctx.font = `700 10px ${StudioFonts.getCanvasFamily(state.font)}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("GRID EXPORT AREA", grid.x + 6, Math.max(8.5, grid.y - 11.5));
    ctx.restore();
  }

  function renderSceneToCanvas(canvas, ctx, time, { guides = false } = {}) {
    const logicalWidth = state.canvas.width;
    const logicalHeight = state.canvas.height;
    const scaleX = canvas.width / logicalWidth;
    const scaleY = canvas.height / logicalHeight;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scaleX, scaleY);
    drawBackground(ctx);
    drawTitle(ctx);
    const scene = getSceneAt(time);
    drawMainPanel(ctx, scene);
    const rects = getTileRects();
    for (let index = 0; index < rects.length; index++) {
      drawCharacterTile(ctx, rects[index], state.characters[index], index, scene);
    }
    drawCursor(ctx, scene);
    drawFooterStatus(ctx, scene);
    if (guides) drawGuides(ctx);
    ctx.restore();
  }

  function resizePreviewCanvas() {
    const width = state.canvas.width;
    const height = state.canvas.height;
    if (previewCanvas.width !== width || previewCanvas.height !== height) {
      previewCanvas.width = width;
      previewCanvas.height = height;
    }
  }

  function redrawPreview() {
    resizePreviewCanvas();
    renderSceneToCanvas(previewCanvas, previewCtx, previewTime, { guides: state.ui.showGuides });
  }

  function resetPreview(autoplay = true) {
    previewTime = 0;
    previewEpoch = performance.now();
    previewPlaying = autoplay && !getSelectionIssue();
    updatePlayButton();
    redrawPreview();
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, milliseconds) / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const tenths = Math.floor((totalSeconds % 1) * 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function animatePreview(now) {
    const duration = Math.max(1, getTimelineDuration());
    if (previewPlaying && !exportBusy) {
      const elapsed = now - previewEpoch;
      if (state.animation.loop) {
        previewTime = elapsed % duration;
      } else {
        previewTime = Math.min(elapsed, duration);
        if (previewTime >= duration) {
          previewPlaying = false;
          updatePlayButton();
        }
      }
      redrawPreview();
    }
    $("#scrubber").value = String(Math.round(previewTime / duration * 1000));
    $("#timeReadout").textContent = `${formatTime(previewTime)} / ${formatTime(duration)}`;
    requestAnimationFrame(animatePreview);
  }

  function setPreviewTime(time) {
    previewTime = clamp(time, 0, getTimelineDuration());
    previewEpoch = performance.now() - previewTime;
    redrawPreview();
  }

  function findTileAtCanvasPoint(x, y) {
    return getTileRects().findIndex(rect => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);
  }

  function setPlayerTarget(player, target) {
    if (!state.characters.length) return;
    player = clamp(player, 0, state.players.targets.length - 1);
    target = clamp(target, 0, state.characters.length - 1);
    state.players.targets[player] = target;
    normalizeTargets(player);
    normalizeStoredPlayerPaths();
    renderPlayerList();
    renderCharacterList();
    if (state.mainPanel.enabled) {
      const order = Math.max(0, getPlaybackPlayers().indexOf(player));
      resetPreview(false);
      setPreviewTime(state.animation.initialHold + order * (state.animation.searchDuration + state.animation.confirmDuration)
        + state.animation.searchDuration);
    } else resetPreview();
  }

  function refreshPlayerRoute(player) {
    editingPlayer = clamp(player, 0, state.players.targets.length - 1);
    sanitizeState();
    renderPlayerList();
    resetPreview();
  }

  function setPlayerStart(player, value) {
    if (!state.characters.length) return;
    state.players.starts[player] = value === "random" ? null : clamp(Number(value), 0, state.characters.length - 1);
    refreshPlayerRoute(player);
  }

  function setPlayerPathMode(player, mode) {
    state.players.pathModes[player] = mode === "custom" ? "custom" : "random";
    refreshPlayerRoute(player);
  }

  function captureAutomaticPath(player) {
    if (!state.characters.length) return;
    const target = clamp(state.players.targets[player] || 0, 0, state.characters.length - 1);
    const path = getAutomaticSelectionPath(player, target, state.characters.length);
    state.players.starts[player] = path[0] ?? null;
    state.players.paths[player] = path.slice(1, -1);
    state.players.pathModes[player] = "custom";
    refreshPlayerRoute(player);
    toast(T("msg.routeCaptured", getPlayerLabel(player)), "success");
  }

  function addPlayerWaypoint(player) {
    if (!state.characters.length) return;
    const path = state.players.paths[player];
    if (path.length >= MAX_CUSTOM_WAYPOINTS) return;
    const target = clamp(state.players.targets[player] || 0, 0, state.characters.length - 1);
    const start = getAutomaticStartIndex(player, target, state.characters.length);
    const previous = path.length ? path[path.length - 1] : start;
    let candidate = (previous + 1) % state.characters.length;
    for (let step = 0; step < state.characters.length; step++) {
      if (candidate !== target && candidate !== previous) break;
      candidate = (candidate + 1) % state.characters.length;
    }
    if (candidate === target && state.characters.length <= 1) return;
    path.push(candidate);
    state.players.pathModes[player] = "custom";
    refreshPlayerRoute(player);
  }

  function setPlayerWaypoint(player, waypointIndex, value) {
    if (!state.characters.length || !state.players.paths[player]?.[waypointIndex] && state.players.paths[player]?.[waypointIndex] !== 0) return;
    state.players.paths[player][waypointIndex] = clamp(Number(value), 0, state.characters.length - 1);
    refreshPlayerRoute(player);
  }

  function movePlayerWaypoint(player, waypointIndex, direction) {
    const path = state.players.paths[player];
    const targetIndex = waypointIndex + direction;
    if (!Array.isArray(path) || targetIndex < 0 || targetIndex >= path.length) return;
    [path[waypointIndex], path[targetIndex]] = [path[targetIndex], path[waypointIndex]];
    refreshPlayerRoute(player);
  }

  function removePlayerWaypoint(player, waypointIndex) {
    const path = state.players.paths[player];
    if (!Array.isArray(path) || waypointIndex < 0 || waypointIndex >= path.length) return;
    path.splice(waypointIndex, 1);
    refreshPlayerRoute(player);
  }

  function buildFramePlan(requestedFps = state.animation.fps) {
    const fps = Math.max(1, requestedFps);
    const interval = 1000 / fps;
    const plan = [];
    let cursor = 0;
    if (state.animation.initialHold > 0) {
      plan.push({ time: 0, delay: state.animation.initialHold });
      cursor += state.animation.initialHold;
    }
    for (const player of getPlaybackPlayers()) {
      for (const duration of [state.animation.searchDuration, state.animation.confirmDuration]) {
        let elapsed = 0;
        while (elapsed < duration - 0.01) {
          const delay = Math.min(interval, duration - elapsed);
          plan.push({ time: cursor + elapsed + 0.01, delay });
          elapsed += delay;
        }
        cursor += duration;
      }
    }
    plan.push({ time: cursor + 0.01, delay: Math.max(20, state.animation.endHold) });
    return plan;
  }

  function buildVideoFramePlan() {
    const fps = state.animation.fps;
    const count = Math.max(1, Math.ceil(getTimelineDuration() * fps / 1000));
    return Array.from({ length: count }, (_, index) => ({ time: index * 1000 / fps, delay: 1000 / fps }));
  }

  function getExportDimensions() {
    return {
      width: Math.max(1, Math.round(state.canvas.width * state.export.scale)),
      height: Math.max(1, Math.round(state.canvas.height * state.export.scale))
    };
  }

  function updateExportEstimate() {
    const { width, height } = getExportDimensions();
    const frames = buildFramePlan().length;
    const seconds = getTimelineDuration() / 1000;
    const videoFrames = Math.max(1, Math.ceil(seconds * state.animation.fps));
    $("#exportEstimate").textContent = T("export.estimate", width, height, seconds.toFixed(2), frames, videoFrames, state.animation.fps);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function slugify(value) {
    const safe = String(value || "character-select")
      .normalize("NFKD")
      .replace(/[^\w\u3131-\uD79D-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return safe || "character-select";
  }

  function setExportProgress(label, current, total) {
    const percent = total ? clamp(Math.round(current / total * 100), 0, 100) : 0;
    $("#exportProgressLabel").textContent = label;
    $("#exportProgressPercent").textContent = `${percent}%`;
    $("#exportProgressBar").style.width = `${percent}%`;
  }

  const exportDisabledStates = new Map();

  function setExportBusy(busy) {
    exportBusy = busy;
    $("#exportProgress").hidden = !busy;
    if (busy) {
      $$('.editor-panel input, .editor-panel select, .editor-panel button, [data-editor-tab], [data-go-tab], [data-preview-player], #loadProjectButton, #projectFileInput, #resetProjectButton, #snapshotButton, #interactivePreviewButton, #playButton, #restartButton, #scrubber').forEach(element => {
        if (element.id === "cancelExportButton") return;
        exportDisabledStates.set(element, element.disabled);
        element.disabled = true;
      });
    } else {
      exportDisabledStates.forEach((disabled, element) => { element.disabled = disabled; });
      exportDisabledStates.clear();
      updateContextControls();
    }
    if (!busy) {
      $("#exportProgressBar").style.width = "0%";
      $("#exportProgressPercent").textContent = "0%";
    }
    fontController?.setDisabled(busy);
    const fontBusy = $("#fontControls").getAttribute("aria-busy") === "true";
    $$('#interactivePreviewButton, [data-export="html"]').forEach(button => { button.disabled = busy || fontBusy; });
  }

  async function runExport(label, exporter, video = false) {
    if (exportBusy) return;
    if (!state.characters.length) {
      toast(T("msg.addImageFirst"), "error");
      return;
    }
    const selectionIssue = getSelectionIssue();
    if (selectionIssue) {
      toast(selectionIssue, "error");
      setEditorTab("motion");
      return;
    }
    const dimensions = getExportDimensions();
    const plan = video ? buildVideoFramePlan() : buildFramePlan();
    const pixelWork = dimensions.width * dimensions.height * plan.length;
    if (pixelWork > 260_000_000) {
      const proceed = window.confirm(T("confirm.megapixels", (pixelWork / 1_000_000).toFixed(0)));
      if (!proceed) return;
    }
    exportCancelled = false;
    setExportBusy(true);
    setExportProgress(T("export.preparingFor", label), 0, plan.length);
    try {
      await fontController.ready();
      checkCancelled();
      await exporter(plan, dimensions);
    } catch (error) {
      console.error(error);
      if (error?.name === "AbortError" || exportCancelled) toast(T("msg.exportCancelled"));
      else toast(error?.message || T("msg.exportFailed", label), "error");
    } finally {
      setExportBusy(false);
      previewEpoch = performance.now() - previewTime;
    }
  }

  function checkCancelled() {
    if (exportCancelled) throw new DOMException("Export cancelled", "AbortError");
  }

  async function renderExportFrame(time, dimensions) {
    if (exportCanvas.width !== dimensions.width || exportCanvas.height !== dimensions.height) {
      exportCanvas.width = dimensions.width;
      exportCanvas.height = dimensions.height;
    }
    renderSceneToCanvas(exportCanvas, exportCtx, time, { guides: false });
    await Promise.resolve();
  }

  async function exportSnapshot() {
    if (!state.characters.length) {
      toast(T("msg.addImageFirst"), "error");
      return;
    }
    await fontController.ready();
    const { width, height } = getExportDimensions();
    await renderExportFrame(previewTime, { width, height });
    const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error(T("err.png"));
    downloadBlob(blob, `${slugify(state.text.title)}-frame.png`);
    toast(T("msg.pngSaved"), "success");
  }

  async function exportVideo(format, plan, dimensions) {
    const encode = format === "mp4" ? globalThis.StudioVideoExport?.encodeMP4 : globalThis.StudioVideoExport?.encodeAVI;
    if (!encode) throw new Error(T("err.videoModule"));
    const fps = state.animation.fps;
    const frozenState = { ...serializableState(), characters: state.characters.map(character => ({ ...character })) };
    const frozenBackground = backgroundImage;
    const width = dimensions.width + (format === "mp4" ? dimensions.width % 2 : 0);
    const height = dimensions.height + (format === "mp4" ? dimensions.height % 2 : 0);
    const sceneCanvas = document.createElement("canvas");
    sceneCanvas.width = dimensions.width;
    sceneCanvas.height = dimensions.height;
    const sceneContext = sceneCanvas.getContext("2d", { alpha: true });
    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameContext = frameCanvas.getContext("2d", { alpha: false });
    const blob = await encode({
      width, height, fps, frameCount: plan.length, checkCancelled,
      renderFrame: async index => {
        checkCancelled();
        const currentState = state;
        const currentBackground = backgroundImage;
        try {
          state = frozenState;
          backgroundImage = frozenBackground;
          renderSceneToCanvas(sceneCanvas, sceneContext, plan[index].time, { guides: false });
        } finally {
          state = currentState;
          backgroundImage = currentBackground;
        }
        frameContext.fillStyle = "#000000";
        frameContext.fillRect(0, 0, width, height);
        frameContext.drawImage(sceneCanvas, 0, 0);
        return frameCanvas;
      },
      onProgress: (done, total) => setExportProgress(T("export.savingFrames", format.toUpperCase(), done, total), done, total)
    });
    checkCancelled();
    downloadBlob(blob, `${slugify(frozenState.text.title)}.${format}`);
    toast(T("msg.videoSaved", format.toUpperCase(), plan.length), "success");
  }

  function concatUint8Arrays(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  function asciiBytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes;
  }

  function u16be(value) {
    return new Uint8Array([(value >>> 8) & 0xff, value & 0xff]);
  }

  function u16le(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function u24le(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff]);
  }

  function u32be(value) {
    return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
  }

  function u32le(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(parts) {
    let crc = 0xffffffff;
    for (const part of parts) {
      for (let i = 0; i < part.length; i++) crc = CRC_TABLE[(crc ^ part[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function pngChunk(type, data = new Uint8Array()) {
    const typeBytes = asciiBytes(type);
    return concatUint8Arrays([u32be(data.length), typeBytes, data, u32be(crc32([typeBytes, data]))]);
  }

  function adler32(data) {
    let a = 1;
    let b = 0;
    const MOD = 65521;
    for (let i = 0; i < data.length; i++) {
      a += data[i];
      b += a;
      if ((i & 4095) === 4095) {
        a %= MOD;
        b %= MOD;
      }
    }
    a %= MOD;
    b %= MOD;
    return ((b << 16) | a) >>> 0;
  }

  function zlibStored(data) {
    const parts = [new Uint8Array([0x78, 0x01])];
    let offset = 0;
    while (offset < data.length) {
      const length = Math.min(65535, data.length - offset);
      const final = offset + length >= data.length ? 1 : 0;
      parts.push(new Uint8Array([final]));
      parts.push(u16le(length));
      parts.push(u16le((~length) & 0xffff));
      parts.push(data.subarray(offset, offset + length));
      offset += length;
    }
    parts.push(u32be(adler32(data)));
    return concatUint8Arrays(parts);
  }

  async function zlibCompress(data) {
    if (typeof CompressionStream === "function") {
      try {
        const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (error) {
        console.warn("CompressionStream deflate failed; using stored zlib blocks.", error);
      }
    }
    return zlibStored(data);
  }

  function makePngScanlines(imageData) {
    const rowBytes = imageData.width * 4;
    const output = new Uint8Array((rowBytes + 1) * imageData.height);
    for (let y = 0; y < imageData.height; y++) {
      const destination = y * (rowBytes + 1);
      output[destination] = 0;
      output.set(imageData.data.subarray(y * rowBytes, (y + 1) * rowBytes), destination + 1);
    }
    return output;
  }

  function makeIHDR(width, height) {
    return concatUint8Arrays([
      u32be(width), u32be(height),
      new Uint8Array([8, 6, 0, 0, 0])
    ]);
  }

  function makeFcTL(sequence, width, height, delay) {
    const milliseconds = clamp(Math.round(delay), 1, 65535);
    return concatUint8Arrays([
      u32be(sequence), u32be(width), u32be(height),
      u32be(0), u32be(0),
      u16be(milliseconds), u16be(1000),
      new Uint8Array([0, 0])
    ]);
  }

  function splitBytes(data, chunkSize = 1_048_576) {
    const parts = [];
    for (let offset = 0; offset < data.length; offset += chunkSize) parts.push(data.subarray(offset, Math.min(data.length, offset + chunkSize)));
    return parts;
  }

  async function exportAPNG(plan, dimensions) {
    const chunks = [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", makeIHDR(dimensions.width, dimensions.height)),
      pngChunk("acTL", concatUint8Arrays([u32be(plan.length), u32be(state.animation.loop ? 0 : 1)]))
    ];
    let sequence = 0;
    for (let index = 0; index < plan.length; index++) {
      checkCancelled();
      const frame = plan[index];
      await renderExportFrame(frame.time, dimensions);
      const imageData = exportCtx.getImageData(0, 0, dimensions.width, dimensions.height);
      const scanlines = makePngScanlines(imageData);
      const compressed = await zlibCompress(scanlines);
      chunks.push(pngChunk("fcTL", makeFcTL(sequence++, dimensions.width, dimensions.height, frame.delay)));
      if (index === 0) {
        for (const part of splitBytes(compressed)) chunks.push(pngChunk("IDAT", part));
      } else {
        for (const part of splitBytes(compressed)) {
          chunks.push(pngChunk("fdAT", concatUint8Arrays([u32be(sequence++), part])));
        }
      }
      setExportProgress(T("export.apngCompressing"), index + 1, plan.length);
      if (index % 2 === 0) await nextTask();
    }
    chunks.push(pngChunk("IEND"));
    checkCancelled();
    const blob = new Blob(chunks, { type: "image/png" });
    downloadBlob(blob, `${slugify(state.text.title)}.apng`);
    toast(T("msg.apngSaved", (blob.size / 1024 / 1024).toFixed(2)), "success");
  }

  function readAscii(bytes, offset, length) {
    let text = "";
    for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[offset + i]);
    return text;
  }

  function readU32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function riffChunk(type, data) {
    const padding = data.length & 1 ? new Uint8Array([0]) : new Uint8Array();
    return concatUint8Arrays([asciiBytes(type), u32le(data.length), data, padding]);
  }

  function extractWebPFrameChunks(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 20 || readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WEBP") {
      throw new Error(T("err.webpFrame"));
    }
    const chunks = [];
    let alpha = false;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = readAscii(bytes, offset, 4);
      const size = readU32LE(bytes, offset + 4);
      const paddedSize = size + (size & 1);
      const end = offset + 8 + paddedSize;
      if (end > bytes.length) break;
      if (type === "ALPH" || type === "VP8 " || type === "VP8L") {
        chunks.push(bytes.slice(offset, end));
        if (type === "ALPH" || type === "VP8L") alpha = true;
      }
      offset = end;
    }
    if (!chunks.some(chunk => {
      const type = readAscii(chunk, 0, 4);
      return type === "VP8 " || type === "VP8L";
    })) throw new Error(T("err.webpBitstream"));
    return { chunks, alpha };
  }

  function makeVp8x(width, height, hasAlpha) {
    const data = new Uint8Array(10);
    data[0] = 0x02 | (hasAlpha ? 0x10 : 0x00);
    data.set(u24le(width - 1), 4);
    data.set(u24le(height - 1), 7);
    return riffChunk("VP8X", data);
  }

  function makeAnimChunk(loop) {
    const color = state.background.type === "transparent"
      ? { r: 0, g: 0, b: 0, a: 0 }
      : parseHexColor(state.background.colorA, 255);
    const data = new Uint8Array(6);
    data[0] = color.b;
    data[1] = color.g;
    data[2] = color.r;
    data[3] = color.a;
    data.set(u16le(loop ? 0 : 1), 4);
    return riffChunk("ANIM", data);
  }

  function makeAnmf(width, height, delay, frameChunks) {
    const header = new Uint8Array(16);
    header.set(u24le(0), 0);
    header.set(u24le(0), 3);
    header.set(u24le(width - 1), 6);
    header.set(u24le(height - 1), 9);
    header.set(u24le(clamp(Math.round(delay), 1, 0xffffff)), 12);
    header[15] = 0x02;
    return riffChunk("ANMF", concatUint8Arrays([header, ...frameChunks]));
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error(T("err.encodeUnsupported", type)));
      }, type, quality);
    });
  }

  async function exportAnimatedWebP(plan, dimensions) {
    if (dimensions.width > 16383 || dimensions.height > 16383) throw new Error(T("err.webpTooLarge"));
    const encodedFrames = [];
    let hasAlpha = state.background.type === "transparent";
    for (let index = 0; index < plan.length; index++) {
      checkCancelled();
      await renderExportFrame(plan[index].time, dimensions);
      const blob = await canvasToBlob(exportCanvas, "image/webp", state.export.webpQuality);
      if (blob.type !== "image/webp") throw new Error(T("err.webpUnsupported"));
      const extracted = extractWebPFrameChunks(await blob.arrayBuffer());
      hasAlpha ||= extracted.alpha;
      encodedFrames.push(makeAnmf(dimensions.width, dimensions.height, plan[index].delay, extracted.chunks));
      setExportProgress(T("export.webpEncoding"), index + 1, plan.length);
      if (index % 2 === 0) await nextTask();
    }
    checkCancelled();
    const body = concatUint8Arrays([
      asciiBytes("WEBP"),
      makeVp8x(dimensions.width, dimensions.height, hasAlpha),
      makeAnimChunk(state.animation.loop),
      ...encodedFrames
    ]);
    const file = concatUint8Arrays([asciiBytes("RIFF"), u32le(body.length), body]);
    const blob = new Blob([file], { type: "image/webp" });
    downloadBlob(blob, `${slugify(state.text.title)}.webp`);
    toast(T("msg.webpSaved", (blob.size / 1024 / 1024).toFixed(2)), "success");
  }

  // Use one palette for the animation so unchanged areas keep the same colors.
  // A bounded six-bit histogram stores actual RGB averages, not fixed cube colors.
  async function buildGifPalette(plan, dimensions, transparent) {
    const binCount = 64 * 64 * 64;
    const counts = new Float64Array(binCount);
    const reds = new Float64Array(binCount);
    const greens = new Float64Array(binCount);
    const blues = new Float64Array(binCount);
    const firstColor = transparent ? 1 : 0;
    let exactColors = new Set();
    for (let frame = 0; frame < plan.length; frame++) {
      checkCancelled();
      await renderExportFrame(plan[frame].time, dimensions);
      const { data } = exportCtx.getImageData(0, 0, dimensions.width, dimensions.height);
      const pixels = dimensions.width * dimensions.height;
      const samples = Math.min(pixels, 65536);
      const stride = pixels / samples;
      for (let sample = 0; sample < samples; sample++) {
        const offset = Math.floor((sample + 0.5) * stride) * 4;
        if (transparent && data[offset + 3] < 128) continue;
        const r = data[offset], g = data[offset + 1], b = data[offset + 2];
        if (exactColors) {
          exactColors.add((r << 16) | (g << 8) | b);
          if (exactColors.size > 256 - firstColor) exactColors = null;
        }
        const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        counts[key]++;
        reds[key] += r;
        greens[key] += g;
        blues[key] += b;
      }
      setExportProgress(T("export.gifAnalyzing"), frame + 1, plan.length * 2);
      await nextTask();
    }
    checkCancelled();
    if (exactColors) {
      const palette = new Uint8Array(256 * 3);
      let index = firstColor;
      for (const rgb of exactColors) palette.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255], index++ * 3);
      return { palette, firstColor, colorCount: Math.max(1, exactColors.size) };
    }
    const colors = [];
    for (let key = 0; key < binCount; key++) {
      const count = counts[key];
      if (count) colors.push({ rgb: [reds[key] / count, greens[key] / count, blues[key] / count], count });
    }

    function colorBox(items) {
      let weight = 0;
      const sum = [0, 0, 0], squares = [0, 0, 0];
      for (const { rgb, count } of items) {
        weight += count;
        for (let channel = 0; channel < 3; channel++) {
          sum[channel] += rgb[channel] * count;
          squares[channel] += rgb[channel] * rgb[channel] * count;
        }
      }
      const mean = sum.map(value => value / weight);
      const variance = squares.map((value, channel) => Math.max(0, value - sum[channel] * mean[channel]));
      const axis = variance.indexOf(Math.max(...variance));
      return { items, weight, mean, axis, error: items.length > 1 ? variance.reduce((a, b) => a + b, 0) : 0 };
    }

    const boxes = colors.length ? [colorBox(colors)] : [];
    while (boxes.length && boxes.length < 256 - firstColor) {
      let split = 0;
      for (let i = 1; i < boxes.length; i++) if (boxes[i].error > boxes[split].error) split = i;
      const box = boxes[split];
      if (!box.error) break;
      box.items.sort((a, b) => a.rgb[box.axis] - b.rgb[box.axis]);
      let weight = 0, middle = 0;
      while (middle < box.items.length - 1 && weight < box.weight / 2) weight += box.items[middle++].count;
      boxes.splice(split, 1, colorBox(box.items.slice(0, middle)), colorBox(box.items.slice(middle)));
      if (boxes.length % 16 === 0) { await nextTask(); checkCancelled(); }
    }
    const palette = new Uint8Array(256 * 3);
    boxes.forEach((box, index) => palette.set(box.mean.map(Math.round), (index + firstColor) * 3));
    // All-transparent frames still need a valid opaque lookup entry.
    return { palette, firstColor, colorCount: Math.max(1, boxes.length) };
  }

  function createGifColorLookup({ palette, firstColor, colorCount }) {
    const cache = new Int16Array(64 * 64 * 64).fill(-1);
    const exact = new Map();
    for (let index = firstColor; index < firstColor + colorCount; index++) {
      const offset = index * 3;
      exact.set((palette[offset] << 16) | (palette[offset + 1] << 8) | palette[offset + 2], index);
    }
    return (r, g, b) => {
      const match = exact.get((r << 16) | (g << 8) | b);
      if (match !== undefined) return match;
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      if (cache[key] !== -1) return cache[key];
      // Always query the bin center, so the cache is independent of frame order.
      const red = (r & 252) + 1.5, green = (g & 252) + 1.5, blue = (b & 252) + 1.5;
      let closest = firstColor, distance = Infinity;
      for (let index = firstColor; index < firstColor + colorCount; index++) {
        const offset = index * 3;
        const dr = red - palette[offset], dg = green - palette[offset + 1], db = blue - palette[offset + 2];
        const error = dr * dr + dg * dg + db * db;
        if (error < distance) { distance = error; closest = index; }
      }
      cache[key] = closest;
      return closest;
    };
  }

  async function rgbaToGifIndices(imageData, transparent, palette, lookup) {
    const { data: rgba, width, height } = imageData;
    const indices = new Uint8Array(width * height);
    // Serpentine Floyd–Steinberg diffusion softens gradients without adding
    // random noise or changing exact palette colors. Transparent pixels absorb
    // error instead of leaking it across cutout edges.
    let current = new Float32Array((width + 2) * 3);
    let next = new Float32Array((width + 2) * 3);
    for (let y = 0; y < height; y++) {
      const direction = y % 2 ? -1 : 1;
      for (let x = direction === 1 ? 0 : width - 1; x >= 0 && x < width; x += direction) {
        const pixel = y * width + x, offset = pixel * 4, errorOffset = (x + 1) * 3;
        if (transparent && rgba[offset + 3] < 128) continue;
        const r = clamp(Math.round(rgba[offset] + current[errorOffset]), 0, 255);
        const g = clamp(Math.round(rgba[offset + 1] + current[errorOffset + 1]), 0, 255);
        const b = clamp(Math.round(rgba[offset + 2] + current[errorOffset + 2]), 0, 255);
        const index = lookup(r, g, b);
        indices[pixel] = index;
        for (let channel = 0; channel < 3; channel++) {
          const error = (channel === 0 ? r : channel === 1 ? g : b) - palette[index * 3 + channel];
          const position = errorOffset + channel;
          current[position + direction * 3] += error * 7 / 16;
          next[position - direction * 3] += error * 3 / 16;
          next[position] += error * 5 / 16;
          next[position + direction * 3] += error / 16;
        }
      }
      [current, next] = [next, current];
      next.fill(0);
      if ((y + 1) % 64 === 0) { await nextTask(); checkCancelled(); }
    }
    return indices;
  }

  function buildGifFramePlan() {
    // GIF uses 10ms ticks; browsers commonly clamp delays below 20ms.
    // Bound sampling at 50FPS and round the cumulative time to avoid drift.
    const frames = buildFramePlan(Math.min(50, state.animation.fps));
    const result = [];
    let elapsed = 0, written = 0;
    for (const frame of frames) {
      elapsed += frame.delay;
      const end = Math.round(elapsed / 10);
      if (end - written < 2) continue;
      result.push({ time: frame.time, delay: (end - written) * 10 });
      written = end;
    }
    const remainder = Math.round(elapsed / 10) - written;
    if (result.length) result[result.length - 1].delay += remainder * 10;
    else result.push({ time: 0, delay: Math.max(20, Math.round(elapsed / 10) * 10) });
    return result;
  }

  class GifBitWriter {
    constructor() {
      this.bytes = [];
      this.current = 0;
      this.bitCount = 0;
    }
    write(code, size) {
      this.current |= code << this.bitCount;
      this.bitCount += size;
      while (this.bitCount >= 8) {
        this.bytes.push(this.current & 0xff);
        this.current >>>= 8;
        this.bitCount -= 8;
      }
    }
    finish() {
      if (this.bitCount > 0) this.bytes.push(this.current & 0xff);
      return new Uint8Array(this.bytes);
    }
  }

  function gifLzwEncode(indices, minimumCodeSize = 8) {
    const clearCode = 1 << minimumCodeSize;
    const endCode = clearCode + 1;
    let nextCode = endCode + 1;
    let codeSize = minimumCodeSize + 1;
    let dictionary = new Map();
    const writer = new GifBitWriter();

    const reset = () => {
      dictionary = new Map();
      nextCode = endCode + 1;
      codeSize = minimumCodeSize + 1;
    };

    writer.write(clearCode, codeSize);
    if (!indices.length) {
      writer.write(endCode, codeSize);
      return writer.finish();
    }

    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const value = indices[i];
      const key = prefix * 256 + value;
      const found = dictionary.get(key);
      if (found !== undefined) {
        prefix = found;
      } else {
        writer.write(prefix, codeSize);
        if (nextCode < 4096) {
          dictionary.set(key, nextCode++);
          if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
        } else {
          writer.write(clearCode, codeSize);
          reset();
        }
        prefix = value;
      }
    }
    writer.write(prefix, codeSize);
    writer.write(endCode, codeSize);
    return writer.finish();
  }

  function gifSubBlocks(data) {
    const parts = [];
    for (let offset = 0; offset < data.length; offset += 255) {
      const length = Math.min(255, data.length - offset);
      parts.push(new Uint8Array([length]), data.subarray(offset, offset + length));
    }
    parts.push(new Uint8Array([0]));
    return concatUint8Arrays(parts);
  }

  function makeGifGraphicControl(delayMs, transparent) {
    const delay = clamp(Math.round(delayMs / 10), 2, 65535);
    return new Uint8Array([
      0x21, 0xf9, 0x04,
      transparent ? 0x09 : 0x04,
      delay & 0xff, (delay >>> 8) & 0xff,
      0x00,
      0x00
    ]);
  }

  function makeGifImageBlock(width, height, indices) {
    const lzw = gifLzwEncode(indices, 8);
    return concatUint8Arrays([
      new Uint8Array([0x2c]),
      u16le(0), u16le(0), u16le(width), u16le(height),
      new Uint8Array([0x00, 0x08]),
      gifSubBlocks(lzw)
    ]);
  }

  async function exportGIF(plan, dimensions) {
    if (dimensions.width > 65535 || dimensions.height > 65535) throw new Error(T("err.gifTooLarge"));
    plan = buildGifFramePlan();
    const transparent = state.background.type === "transparent";
    const colors = await buildGifPalette(plan, dimensions, transparent);
    const lookup = createGifColorLookup(colors);
    const parts = [
      asciiBytes("GIF89a"),
      u16le(dimensions.width), u16le(dimensions.height),
      new Uint8Array([0xf7, 0x00, 0x00]),
      colors.palette
    ];
    if (state.animation.loop) {
      parts.push(new Uint8Array([0x21, 0xff, 0x0b]), asciiBytes("NETSCAPE2.0"), new Uint8Array([0x03, 0x01, 0x00, 0x00, 0x00]));
    }
    for (let index = 0; index < plan.length; index++) {
      checkCancelled();
      await renderExportFrame(plan[index].time, dimensions);
      const imageData = exportCtx.getImageData(0, 0, dimensions.width, dimensions.height);
      const indices = await rgbaToGifIndices(imageData, transparent, colors.palette, lookup);
      parts.push(makeGifGraphicControl(plan[index].delay, transparent));
      parts.push(makeGifImageBlock(dimensions.width, dimensions.height, indices));
      setExportProgress(T("export.gifEncoding"), plan.length + index + 1, plan.length * 2);
      await nextTask();
    }
    parts.push(new Uint8Array([0x3b]));
    checkCancelled();
    const blob = new Blob(parts, { type: "image/gif" });
    downloadBlob(blob, `${slugify(state.text.title)}.gif`);
    toast(T("msg.gifSaved", (blob.size / 1024 / 1024).toFixed(2)), "success");
  }

  function cssFilterIdleForEmbed() {
    const mode = state.idle.mode === "grayscale"
      ? `grayscale(${state.idle.amount}%)`
      : state.idle.mode === "sepia"
        ? `sepia(${state.idle.amount}%)`
        : "none";
    return `${mode} brightness(${state.idle.brightness}%) saturate(${state.idle.saturation}%) contrast(104%)`;
  }

  function cssBackgroundForEmbed() {
    if (state.background.type === "transparent") return "transparent";
    if (state.background.type === "solid") return state.background.colorA;
    if (state.background.type === "image" && state.background.imageSrc) {
      const dim = clamp(state.background.imageDim / 100, 0, 0.95);
      const safeUrl = state.background.imageSrc.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
      return `linear-gradient(rgba(3,6,13,${dim}),rgba(3,6,13,${dim})),url("${safeUrl}") center/cover no-repeat`;
    }
    return `linear-gradient(${state.background.angle}deg,${state.background.colorA},${state.background.colorB})`;
  }

  function generateInteractiveHtml() {
    if (!state.characters.length) throw new Error(T("err.noCharacterForHtml"));
    const selectionIssue = getSelectionIssue();
    if (selectionIssue) throw new Error(selectionIssue);
    const visibleCount = getVisibleCharacterCount();
    const playbackPlayers = getPlaybackPlayers();
    const { grid: gridRect, main: mainRect } = getCompositionRects();
    const mainSettings = state.mainPanel;
    const hasMainPanel = Boolean(mainSettings.enabled && mainRect);
    const mainRects = hasMainPanel ? getMainPanelRects() : [];
    const tileRects = getTileRects();
    const images = [];
    const imageIds = new Map();
    const idleFilter = cssFilterIdleForEmbed().replace(/^none\s+/, "");
    const selectedFilter = getSelectedFilter();
    function addImage(source) {
      let imageId = imageIds.get(source);
      if (imageId === undefined) {
        imageId = images.length;
        imageIds.set(source, imageId);
        images.push(source);
      }
      return imageId;
    }
    // Effects are baked into source-sized transparent PNGs before CSS fit/crop.
    // This keeps holes and partial alpha unchanged, including at contain margins;
    // stacking an alpha-masked tint over the original would increase its opacity.
    const characters = state.characters.slice(0, visibleCount).map(character => {
      const variants = new Map();
      const canvas = document.createElement("canvas");
      const listCrop = StudioCrop.normalize(character.listCrop);
      const sourceWidth = character.image.naturalWidth || character.image.width;
      const sourceHeight = character.image.naturalHeight || character.image.height;
      canvas.width = listCrop ? Math.max(1, Math.round(listCrop.width * sourceWidth)) : sourceWidth;
      canvas.height = listCrop ? Math.max(1, Math.round(listCrop.height * sourceHeight)) : sourceHeight;
      const context = canvas.getContext("2d");
      function styledImage(filter, effects) {
        const key = JSON.stringify([filter, effects]);
        if (variants.has(key)) return variants.get(key);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.filter = filter;
        if (listCrop) {
          StudioCrop.draw(context, character.image, { x: 0, y: 0, width: canvas.width, height: canvas.height }, listCrop, "cover");
        } else {
          context.drawImage(character.image, 0, 0);
        }
        context.filter = "none";
        applyCharacterImageEffects(context, effects);
        const imageId = addImage(canvas.toDataURL("image/png"));
        variants.set(key, imageId);
        return imageId;
      }
      function mainImages() {
        if (!hasMainPanel) return undefined;
        const crop = StudioCrop.normalize(character.mainCrop) || { x: 0, y: 0, width: 1, height: 1 };
        const sourceWidth = character.image.naturalWidth, sourceHeight = character.image.naturalHeight;
        const mainCanvas = document.createElement("canvas");
        mainCanvas.width = Math.max(1, Math.round(crop.width * sourceWidth));
        mainCanvas.height = Math.max(1, Math.round(crop.height * sourceHeight));
        const mainContext = mainCanvas.getContext("2d");
        const variants = new Map();
        const result = playbackPlayers.map(player => {
          const tint = mainSettings.effects ? getTintColor(player) : null;
          if (variants.has(tint)) return variants.get(tint);
          mainContext.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
          mainContext.filter = selectedFilter;
          StudioCrop.draw(mainContext, character.image, { x: 0, y: 0, width: mainCanvas.width, height: mainCanvas.height }, crop, "cover");
          mainContext.filter = "none";
          applyCharacterImageEffects(mainContext, { tint, tintAlpha: state.selected.tintAlpha / 100 });
          const imageId = addImage(mainCanvas.toDataURL("image/png"));
          variants.set(tint, imageId);
          return imageId;
        });
        mainCanvas.width = mainCanvas.height = 0;
        return result;
      }
      const result = {
        name: character.name,
        scale: character.scale,
        offsetX: character.offsetX,
        offsetY: character.offsetY,
        mainImage: hasMainPanel ? addImage(character.src) : undefined,
        mainImages: mainImages(),
        idleImage: styledImage(idleFilter, { idleOverlay: state.idle.overlayAlpha / 100 }),
        selectedImages: playbackPlayers.map(player => styledImage(selectedFilter, {
          tint: state.selected.tintMode === "none" ? null
            : state.selected.tintMode === "fixed" ? state.selected.tint : state.players.colors[player],
          tintAlpha: state.selected.tintMode === "none" ? 0 : state.selected.tintAlpha / 100
        }))
      };
      canvas.width = canvas.height = 0;
      return result;
    });
    const id = `cs-widget-${Math.random().toString(36).slice(2, 10)}`;
    const rows = getEffectiveRows();
    const titleY = Math.max(14, state.layout.y - state.text.titleSize - 48);
    const subtitleY = Math.max(42, state.layout.y - 33);
    const footerY = Math.min(state.canvas.height - 18, state.layout.y + state.layout.height + 27);
    const config = {
      players: playbackPlayers.length,
      playerNumbers: playbackPlayers.map(player => player + 1),
      playerLabels: playbackPlayers.map(getPlayerLabel),
      badgeLimit: clamp(Math.floor(((tileRects[0]?.height || 40) - 14) / 26), 1, 3),
      colors: playbackPlayers.map(player => state.players.colors[player]),
      starts: playbackPlayers.map(player => {
        const target = clamp(state.players.targets[player] || 0, 0, Math.max(0, visibleCount - 1));
        return getAutomaticStartIndex(player, target, visibleCount);
      }),
      columns: state.layout.columns,
      duplicate: state.players.allowDuplicate,
      mainPanel: hasMainPanel ? {
        count: mainRects.length,
        effects: mainSettings.effects,
        reveal: mainSettings.reveal,
        placeholder: mainSettings.placeholder
      } : null,
      characters: characters.map(({ name, idleImage, selectedImages, mainImage, mainImages }) => ({ name, idleImage, selectedImages, mainImage, mainImages })),
      images
    };
    const safeJson = JSON.stringify(config).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
    const titleAlign = state.text.align;
    const titleLeft = titleAlign === "left" ? state.layout.x / state.canvas.width * 100 : titleAlign === "right" ? (state.layout.x + state.layout.width) / state.canvas.width * 100 : 50;
    const titleTransform = titleAlign === "center" ? "translateX(-50%)" : "none";

    function borderGroup(rect, lineWidth, className) {
      if (lineWidth <= 0) return "";
      const { width, height } = rect;
      const radius = clamp(state.layout.radius, 0, Math.min(width, height) / 2);
      const style = state.layout.borderStyle;
      let shape;
      if (style === "corners") {
        const length = Math.min(Math.min(width, height) * .22, 48);
        const r = Math.min(radius, length / 2);
        const path = `M${length} 0H${r}A${r} ${r} 0 0 0 0 ${r}V${length} M${width - length} 0H${width - r}A${r} ${r} 0 0 1 ${width} ${r}V${length} M0 ${height - length}V${height - r}A${r} ${r} 0 0 0 ${r} ${height}H${length} M${width} ${height - length}V${height - r}A${r} ${r} 0 0 1 ${width - r} ${height}H${width - length}`;
        shape = `<path d="${path}"/>`;
      } else {
        const perimeter = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
        const count = Math.max(4, Math.round(perimeter / (Math.max(3, lineWidth * 3) + Math.max(2, lineWidth * 2))));
        const dash = style === "dashed" ? ` stroke-dasharray="${perimeter / count * .6} ${perimeter / count * .4}"` : "";
        shape = `<rect width="${width}" height="${height}" rx="${radius}"${dash}/>`;
        if (style === "double") {
          const inset = Math.max(2, lineWidth * 1.5);
          if (width > inset * 2 && height > inset * 2) {
            shape += `<rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${Math.max(0, radius - inset)}"/>`;
          }
        }
      }
      return `<g class="${className}" stroke-width="${style === "double" ? lineWidth / 2 : lineWidth}">${shape}</g>`;
    }
    function borderMarkup(rect, main = false) {
      const groups = main
        ? borderGroup(rect, mainSettings.effects !== false ? state.selected.borderWidth : Math.max(2, state.layout.borderWidth), "cs-border-main")
        : borderGroup(rect, state.layout.borderWidth, "cs-border-idle") + borderGroup(rect, state.selected.borderWidth, "cs-border-selected");
      return `<svg class="cs-border" data-border-style="${state.layout.borderStyle}" viewBox="0 0 ${rect.width} ${rect.height}" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-linecap="butt" aria-hidden="true" focusable="false">${groups}</svg>`;
    }

    const tiles = characters.map((character, index) => `
      <button class="cs-tile" type="button" data-index="${index}" aria-label="${escapeHtml(character.name)}" style="--zoom:${character.scale};--ox:${character.offsetX}%;--oy:${character.offsetY}%">
        <span class="cs-media"><img alt=""></span>
        ${borderMarkup(tileRects[index])}
        ${state.labels.show ? `<span class="cs-name">${escapeHtml(character.name)}</span>` : ""}
        <span class="cs-badges" aria-hidden="true"></span>
      </button>`).join("");

    const hasBackground = state.background.type !== "transparent";
    const patternCss = hasBackground && state.background.pattern ? `
      #${id}::before{content:"";position:absolute;inset:-40%;background:repeating-linear-gradient(45deg,rgba(255,255,255,.045) 0 1px,transparent 1px calc(28px * var(--cs-scale)));pointer-events:none}` : "";
    const vignetteCss = hasBackground && state.background.vignette > 0 ? `
      #${id}::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at center,transparent 30%,rgba(0,0,0,${state.background.vignette / 100}) 100%);pointer-events:none}` : "";
    const mainMarkup = mainRects.map((rect, slot) => {
      const side = Math.min(rect.width, rect.height);
      const placeholderSize = Math.max(mainRects.length === 1 ? 12 : 8, Math.min(20, side * .07));
      const nameSize = Math.max(mainRects.length === 1 ? 14 : 10, Math.min(28, side * .075));
      const inset = Math.max(3, Math.min(16, side * .08));
      const bottom = Math.max(3, Math.min(12, side * .06));
      const padding = Math.max(4, Math.min(18, side * .09));
      return `
  <div class="cs-main-panel is-empty" role="group" aria-label="${escapeHtml(mainSettings.placeholder)}" data-empty="true" data-slot="${slot}" style="left:${rect.x / state.canvas.width * 100}%;top:${rect.y / state.canvas.height * 100}%;width:${rect.width / state.canvas.width * 100}%;height:${rect.height / state.canvas.height * 100}%;--main-placeholder-size:${placeholderSize}px;--main-name-size:${nameSize}px;--main-inset:${inset}px;--main-bottom:${bottom}px;--main-padding:${padding}px">
    <span class="cs-main-media"><img class="cs-main-image" alt="" hidden></span>
    ${borderMarkup(rect, true)}
    <span class="cs-main-placeholder">${escapeHtml(mainSettings.placeholder)}</span>
    ${mainSettings.showName ? '<span class="cs-main-name" aria-live="polite" hidden></span>' : ""}
  </div>`;
    }).join("");
    const mainCss = hasMainPanel ? `
  #${id} .cs-main-panel{position:absolute;z-index:3;box-sizing:border-box;overflow:visible;border:0;border-radius:calc(${state.layout.radius}px * var(--cs-scale));background:transparent;isolation:isolate;pointer-events:none}
  #${id} .cs-main-panel.is-empty{border:calc(1px * var(--cs-scale)) dashed rgba(231,238,251,.26)}
  #${id} .cs-main-panel.is-empty>.cs-border{display:none}
  #${id} .cs-main-media{position:absolute;inset:0;overflow:hidden;border-radius:inherit}
  #${id} .cs-main-image{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:${mainSettings.fit};object-position:center;transform:none;filter:none}
  #${id} .cs-main-panel>.cs-border{color:var(--main-color,transparent)}
  ${mainSettings.effects !== false ? `#${id} .cs-main-panel.is-filled{transform:scale(${state.selected.scale})}
  #${id} .cs-main-panel.is-filled>.cs-border{filter:drop-shadow(0 0 calc(${state.selected.glow / 2}px * var(--cs-scale)) var(--main-color))}
  #${id} .cs-main-panel.is-filled.is-confirming{animation:${id}-main-confirm ${Math.max(1, state.animation.confirmDuration)}ms linear}
  #${id} .cs-main-panel.is-filled.is-confirming>.cs-border{filter:drop-shadow(0 0 calc(${state.selected.glow * .625}px * var(--cs-scale)) var(--main-color))}
  #${id} .cs-main-panel.is-confirming .cs-main-image{animation:${id}-main-flash ${Math.max(1, state.animation.confirmDuration)}ms linear}
  @keyframes ${id}-main-confirm{${Array.from({ length: 21 }, (_, step) => {
    const progress = step / 20;
    const pulse = Math.sin(progress * Math.PI * 4) * (1 - progress) * .035;
    const entrance = 1 + (easeOutBack(Math.min(1, progress * 1.8)) - 1) * .6;
    return `${step * 5}%{transform:scale(${state.selected.scale * (1 + pulse) * entrance})}`;
  }).join("")}}
  @keyframes ${id}-main-flash{0%{filter:brightness(1.34)}45.45%,100%{filter:brightness(1)}}` : ""}
  #${id} .cs-main-placeholder{position:absolute;inset:0;display:grid;place-items:center;padding:calc(var(--main-padding) * var(--cs-scale));box-sizing:border-box;color:rgba(231,238,251,.5);font-size:calc(var(--main-placeholder-size) * var(--cs-scale));font-weight:700;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere}
  #${id} .cs-main-name{position:absolute;left:calc(var(--main-inset) * var(--cs-scale));right:calc(var(--main-inset) * var(--cs-scale));bottom:calc(var(--main-bottom) * var(--cs-scale));color:var(--main-color,#fff);font-size:calc(var(--main-name-size) * var(--cs-scale));font-weight:950;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 calc(2px * var(--cs-scale)) calc(8px * var(--cs-scale)) rgba(0,0,0,.7)}
  #${id} .cs-main-panel [hidden]{display:none}` : "";

    const snippet = `<!-- Character Select Motion Studio: start -->
<div id="${id}" class="cs-widget" tabindex="0" role="application" aria-label="${T("html.widgetAria")}">
  ${state.text.showTitle ? `<div class="cs-title-wrap"><strong>${escapeHtml(state.text.title)}</strong><span>${escapeHtml(state.text.subtitle)}</span></div>` : ""}
  ${mainMarkup}
  <div class="cs-grid">${tiles}
  </div>
  <div class="cs-footer"><span class="cs-status" aria-live="polite"></span><span class="cs-help">${T("html.widgetHelp")}</span></div>
  <button class="cs-reset" type="button">RESET</button>
</div>
<style>
  ${StudioFonts.getEmbedCss(state.font)}
  #${id}{--cs-scale:1;--active-color:${config.colors[0]};position:relative;width:min(100%,${state.canvas.width}px);aspect-ratio:${state.canvas.width}/${state.canvas.height};overflow:hidden;margin:1.2em auto;border-radius:calc(16px * var(--cs-scale));background:${cssBackgroundForEmbed()};color:#fff;isolation:isolate;box-shadow:${hasBackground ? "0 calc(18px * var(--cs-scale)) calc(54px * var(--cs-scale)) rgba(0,0,0,.36)" : "none"};font-family:${StudioFonts.getCanvasFamily(state.font)};outline:none;user-select:none;-webkit-tap-highlight-color:transparent}
  #${id}:focus-visible{box-shadow:0 0 0 3px var(--active-color),0 calc(18px * var(--cs-scale)) calc(54px * var(--cs-scale)) rgba(0,0,0,.36)}
  ${patternCss}
  ${vignetteCss}
  ${mainCss}
  #${id} .cs-title-wrap{position:absolute;z-index:4;left:${titleLeft}%;top:${titleY / state.canvas.height * 100}%;transform:${titleTransform};text-align:${titleAlign};white-space:nowrap;text-shadow:0 2px 12px rgba(0,0,0,.45)}
  #${id} .cs-title-wrap strong{display:block;font-size:calc(${state.text.titleSize}px * var(--cs-scale));font-weight:950;line-height:1.05;letter-spacing:.02em}
  #${id} .cs-title-wrap span{display:block;margin-top:calc(5px * var(--cs-scale));font-size:calc(${Math.max(9, state.text.titleSize * .36)}px * var(--cs-scale));font-weight:750;color:rgba(232,239,252,.68);letter-spacing:.12em}
  #${id} .cs-grid{position:absolute;z-index:3;left:${gridRect.x / state.canvas.width * 100}%;top:${gridRect.y / state.canvas.height * 100}%;width:${gridRect.width / state.canvas.width * 100}%;height:${gridRect.height / state.canvas.height * 100}%;display:grid;grid-template-columns:repeat(${state.layout.columns},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));gap:calc(${state.layout.gap}px * var(--cs-scale))}
  #${id} .cs-tile{--pick-color:var(--active-color);position:relative;min-width:0;min-height:0;padding:0;overflow:visible;border:0;border-radius:calc(${state.layout.radius}px * var(--cs-scale));background:transparent;color:#fff;cursor:pointer;transition:transform .18s cubic-bezier(.2,.8,.2,1);outline:none}
  #${id} .cs-border{position:absolute;z-index:4;inset:0;display:block;width:100%;height:100%;overflow:visible;pointer-events:none;color:rgba(255,255,255,.2)}
  #${id} .cs-border-selected{display:none}
  #${id} .cs-tile.is-cursor .cs-border-idle,#${id} .cs-tile.is-picked .cs-border-idle{display:none}
  #${id} .cs-tile.is-cursor .cs-border-selected,#${id} .cs-tile.is-picked .cs-border-selected{display:inline}
  #${id} .cs-media{position:absolute;inset:0;overflow:hidden;border-radius:inherit;background:transparent}
  #${id} .cs-media img{width:100%;height:100%;display:block;object-fit:${state.layout.fit};transform:translate(var(--ox),var(--oy)) scale(var(--zoom));transition:transform .18s ease;pointer-events:none}
  #${id} .cs-tile.is-cursor,#${id} .cs-tile.is-picked{transform:scale(${state.selected.scale});z-index:5}
  #${id} .cs-tile.is-cursor>.cs-border,#${id} .cs-tile.is-picked>.cs-border{color:var(--pick-color);filter:drop-shadow(0 0 calc(${state.selected.glow / 2}px * var(--cs-scale)) var(--pick-color))}
  #${id} .cs-tile.is-cursor{--pick-color:var(--active-color)}
  #${id} .cs-tile.is-cursor .cs-media img,#${id} .cs-tile.is-picked .cs-media img{transform:translate(var(--ox),var(--oy)) scale(calc(var(--zoom) * 1.015))}
  #${id} .cs-tile.is-cursor>.cs-border{animation:${id}-cursor .7s ease-in-out infinite alternate}
  @keyframes ${id}-cursor{to{filter:drop-shadow(0 0 calc(${state.selected.glow * .675}px * var(--cs-scale)) var(--active-color))}}
  #${id} .cs-name{position:absolute;z-index:3;left:0;right:0;bottom:0;min-height:calc(${state.labels.height}px * var(--cs-scale));display:flex;align-items:flex-end;justify-content:center;padding:calc(6px * var(--cs-scale));border-radius:0 0 calc(${state.layout.radius}px * var(--cs-scale)) calc(${state.layout.radius}px * var(--cs-scale));background:linear-gradient(transparent,rgba(3,5,10,.9));font-size:calc(${state.labels.fontSize}px * var(--cs-scale));font-weight:900;text-align:center;text-shadow:0 2px 6px #000;pointer-events:none}
  #${id} .cs-badges{position:absolute;z-index:6;left:calc(7px * var(--cs-scale));right:calc(7px * var(--cs-scale));top:calc(7px * var(--cs-scale));display:flex;flex-wrap:wrap;align-content:flex-start;gap:calc(4px * var(--cs-scale));max-height:calc(100% - 14px * var(--cs-scale));overflow:hidden;pointer-events:none}
  #${id} .cs-badge{box-sizing:border-box;min-width:min(100%,calc(35px * var(--cs-scale)));max-width:100%;height:calc(22px * var(--cs-scale));line-height:calc(22px * var(--cs-scale));flex:0 1 auto;display:block;padding:0 calc(6px * var(--cs-scale));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-radius:999px;background:var(--badge-color);color:#061018;font-size:calc(11px * var(--cs-scale));font-weight:950;box-shadow:0 0 calc(12px * var(--cs-scale)) var(--badge-color)}
  #${id} .cs-footer{position:absolute;z-index:5;left:${state.layout.x / state.canvas.width * 100}%;right:${(state.canvas.width - state.layout.x - state.layout.width) / state.canvas.width * 100}%;top:${footerY / state.canvas.height * 100}%;display:flex;align-items:center;justify-content:space-between;min-width:0;gap:calc(10px * var(--cs-scale));font-size:calc(11px * var(--cs-scale));font-weight:800;color:rgba(231,238,251,.72)}
  #${id} .cs-status{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--active-color);font-size:calc(13px * var(--cs-scale));font-weight:950}
  #${id} .cs-help{flex:0 1 auto;min-width:0;max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(9px * var(--cs-scale));font-weight:650}
  #${id} .cs-reset{position:absolute;z-index:7;right:calc(10px * var(--cs-scale));bottom:calc(10px * var(--cs-scale));min-height:calc(26px * var(--cs-scale));padding:0 calc(9px * var(--cs-scale));border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(5,8,14,.68);color:rgba(255,255,255,.74);font-size:calc(9px * var(--cs-scale));font-weight:850;cursor:pointer}
  #${id} .cs-reset:hover{color:#fff;border-color:var(--active-color)}
  @media(max-width:520px){#${id} .cs-help{display:none}}
  @media(prefers-reduced-motion:reduce){#${id} .cs-tile,#${id} .cs-tile.is-cursor>.cs-border,#${id} .cs-media img,#${id} .cs-main-panel.is-filled.is-confirming,#${id} .cs-main-panel.is-confirming .cs-main-image{animation:none;transition:none}}
</style>
<script>
(() => {
  const root = document.getElementById(${JSON.stringify(id)});
  if (!root || root.dataset.ready === "1") return;
  root.dataset.ready = "1";
  const cfg = ${safeJson};
  const tiles = [...root.querySelectorAll(".cs-tile")];
  const status = root.querySelector(".cs-status");
  const reset = root.querySelector(".cs-reset");
  const mainPanels = [...root.querySelectorAll(".cs-main-panel")].map(panel => ({
    panel,
    image: panel.querySelector(".cs-main-image"),
    name: panel.querySelector(".cs-main-name"),
    placeholder: panel.querySelector(".cs-main-placeholder")
  }));
  const picked = Array(cfg.players).fill(-1);
  let player = 0;
  let cursor = -1;
  const mainSelections = Array(cfg.mainPanel?.count || 0).fill(null);

  function setScale() {
    root.style.setProperty("--cs-scale", String(root.clientWidth / ${state.canvas.width}));
  }
  function playerLabel(index) {
    return cfg.playerLabels?.[index] || cfg.playerNumbers[index] + "P";
  }
  function isUnavailable(index) {
    return !cfg.duplicate && picked.includes(index);
  }
  function nextAvailable(start, step) {
    if (player >= cfg.players) return -1;
    let index = start;
    for (let i = 0; i < tiles.length; i++) {
      index = (index + step + tiles.length) % tiles.length;
      if (!isUnavailable(index)) return index;
    }
    return start;
  }
  function getPlayerStart(playerIndex, fallback = -1) {
    const configured = Number(cfg.starts?.[playerIndex]);
    let candidate = Number.isInteger(configured) && configured >= 0 && configured < tiles.length
      ? configured
      : nextAvailable(fallback, 1);
    if (candidate >= 0 && isUnavailable(candidate)) candidate = nextAvailable(candidate - 1, 1);
    return candidate >= 0 ? candidate : 0;
  }
  function clearMainConfirmation(slot) {
    const entry = mainPanels[slot];
    if (!entry) return;
    clearTimeout(entry.confirmTimer);
    entry.confirmTimer = null;
    entry.panel.classList.remove("is-confirming");
  }
  function clearMainConfirmations() {
    mainPanels.forEach((entry, slot) => clearMainConfirmation(slot));
  }
  function confirmMain(slot) {
    if (!cfg.mainPanel || cfg.mainPanel.effects === false || !mainPanels[slot]) return;
    clearMainConfirmations();
    const entry = mainPanels[slot];
    void entry.panel.offsetWidth;
    entry.panel.classList.add("is-confirming");
    entry.confirmTimer = setTimeout(() => clearMainConfirmation(slot), ${Math.max(1, state.animation.confirmDuration)});
  }
  function updateMain() {
    mainPanels.forEach(({ panel: mainPanel, image: mainImage, name: mainName, placeholder: mainPlaceholder }, slot) => {
      const mainSelection = mainSelections[slot];
      const empty = mainSelection === null;
      mainPanel.classList.toggle("is-empty", empty);
      mainPanel.classList.toggle("is-filled", !empty);
      mainPanel.dataset.empty = String(empty);
      mainImage.hidden = empty;
      mainPlaceholder.hidden = !empty;
      if (mainName) mainName.hidden = empty;
      if (empty) {
        clearMainConfirmation(slot);
        mainImage.removeAttribute("src");
        mainImage.alt = "";
        delete mainImage.dataset.image;
        delete mainPanel.dataset.player;
        delete mainPanel.dataset.character;
        mainPanel.style.removeProperty("--main-color");
        mainPanel.setAttribute("aria-label", cfg.mainPanel.placeholder);
        if (mainName) mainName.textContent = "";
        return;
      }
      const character = cfg.characters[mainSelection.index];
      const number = cfg.playerNumbers[mainSelection.player];
      const label = playerLabel(mainSelection.player) + " · " + character.name;
      mainPanel.dataset.player = String(number);
      mainPanel.dataset.character = String(mainSelection.index);
      mainPanel.style.setProperty("--main-color", cfg.colors[mainSelection.player]);
      mainPanel.setAttribute("aria-label", label);
      const mainImageId = character.mainImages?.[mainSelection.player] ?? character.mainImage;
      if (mainImage.dataset.image !== String(mainImageId)) {
        mainImage.dataset.image = String(mainImageId);
        mainImage.src = cfg.images[mainImageId];
      }
      mainImage.alt = character.name;
      if (mainName) mainName.textContent = label;
    });
  }
  function update() {
    const complete = player >= cfg.players;
    const activeColor = cfg.colors[Math.min(player, cfg.colors.length - 1)] || "#66ddff";
    root.style.setProperty("--active-color", activeColor);
    tiles.forEach((tile, index) => {
      const isCursor = !complete && index === cursor;
      tile.classList.toggle("is-cursor", isCursor);
      const owners = [];
      picked.forEach((value, owner) => { if (value === index) owners.push(owner); });
      tile.classList.toggle("is-picked", owners.length > 0);
      tile.setAttribute("aria-pressed", owners.length ? "true" : "false");
      const badges = tile.querySelector(".cs-badges");
      const badgeLimit = Math.max(1, cfg.badgeLimit || 3);
      const visibleOwners = owners.length > badgeLimit ? owners.slice(0, badgeLimit - 1) : owners;
      const badgeItems = visibleOwners.map(owner => ({ owner, text: playerLabel(owner), title: playerLabel(owner) }));
      if (owners.length > badgeLimit) {
        const remaining = owners.slice(visibleOwners.length);
        badgeItems.push({ owner: remaining[remaining.length - 1], text: "+" + remaining.length, title: remaining.map(playerLabel).join(", ") });
      }
      badges.replaceChildren(...badgeItems.map(({ owner, text, title }) => {
        const badge = document.createElement("span");
        badge.className = "cs-badge";
        badge.style.setProperty("--badge-color", cfg.colors[owner]);
        badge.textContent = text;
        badge.title = title;
        return badge;
      }));
      const variantPlayer = isCursor ? player : owners.length ? owners[owners.length - 1] : Math.min(player, cfg.players - 1);
      tile.style.setProperty("--pick-color", cfg.colors[variantPlayer]);
      const character = cfg.characters[index];
      tile.setAttribute("aria-label", character.name + (owners.length ? " · " + owners.map(playerLabel).join(", ") : ""));
      const imageId = isCursor || owners.length ? character.selectedImages[variantPlayer] : character.idleImage;
      const image = tile.querySelector(".cs-media img");
      if (image.dataset.variant !== String(imageId)) {
        image.dataset.variant = String(imageId);
        image.src = cfg.images[imageId];
      }
    });
    status.textContent = complete ? (cfg.players === 1 ? playerLabel(0) + " SELECTION COMPLETE" : "SELECTION COMPLETE") : playerLabel(player) + " SELECTING";
    if (complete) status.style.color = "rgba(255,255,255,.9)";
    else status.style.color = activeColor;
    updateMain();
  }
  function setCursor(index) {
    if (player >= cfg.players || index < 0 || index >= tiles.length || isUnavailable(index)) return;
    clearMainConfirmations();
    cursor = index;
    if (cfg.mainPanel?.reveal === "hover") mainSelections[player % cfg.mainPanel.count] = { index, player };
    update();
  }
  function pick(index = cursor) {
    if (player >= cfg.players || index < 0 || index >= tiles.length || isUnavailable(index)) return;
    const mainSlot = cfg.mainPanel ? player % cfg.mainPanel.count : -1;
    if (mainSlot >= 0) mainSelections[mainSlot] = { index, player };
    picked[player] = index;
    player++;
    if (player < cfg.players) {
      cursor = getPlayerStart(player, index);
    }
    update();
    if (mainSlot >= 0) confirmMain(mainSlot);
  }
  function resetAll() {
    clearMainConfirmations();
    picked.fill(-1);
    mainSelections.fill(null);
    player = 0;
    cursor = getPlayerStart(0, -1);
    update();
    root.focus({ preventScroll: true });
  }
  tiles.forEach((tile, index) => {
    tile.addEventListener("pointerenter", () => setCursor(index));
    tile.addEventListener("click", event => {
      event.preventDefault();
      root.focus({ preventScroll: true });
      setCursor(index);
      pick(index);
    });
  });
  root.addEventListener("keydown", event => {
    if (player >= cfg.players && event.key.toLowerCase() !== "r") return;
    let handled = true;
    if (event.key === "ArrowRight") setCursor(nextAvailable(cursor, 1));
    else if (event.key === "ArrowLeft") setCursor(nextAvailable(cursor, -1));
    else if (event.key === "ArrowDown") setCursor(nextAvailable(cursor, cfg.columns));
    else if (event.key === "ArrowUp") setCursor(nextAvailable(cursor, -cfg.columns));
    else if (event.key === "Enter" || event.key === " ") pick();
    else if (event.key.toLowerCase() === "r") resetAll();
    else handled = false;
    if (handled) {
      event.preventDefault();
      update();
    }
  });
  reset.addEventListener("click", event => { event.stopPropagation(); resetAll(); });
  root.addEventListener("pointerdown", () => root.focus({ preventScroll: true }));
  if (window.ResizeObserver) new ResizeObserver(setScale).observe(root);
  else window.addEventListener("resize", setScale);
  setScale();
  cursor = getPlayerStart(0, -1);
  update();
})();
<\/script>
<!-- Character Select Motion Studio: end -->`;

    const standalone = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(state.text.title || "Character Select")}</title>
<style>html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:16px;box-sizing:border-box;background:${hasBackground ? "#080b13" : "transparent"}}</style>
</head>
<body>
${snippet}
</body>
</html>`;
    return { snippet, standalone };
  }

  function syncModalScrollLock() {
    document.body.style.overflow = $("#codeModal").hidden ? "" : "hidden";
  }

  function openCodeModal() {
    const generated = generateInteractiveHtml();
    generatedEmbedCode = generated.snippet;
    generatedStandaloneHtml = generated.standalone;
    $("#htmlCodeOutput").value = generatedEmbedCode;
    $("#codeModal").hidden = false;
    syncModalScrollLock();
    requestAnimationFrame(() => $("#closeCodeModalButton").focus());
  }

  function closeCodeModal() {
    $("#codeModal").hidden = true;
    syncModalScrollLock();
  }

  function openInteractivePreview() {
    const generated = generateInteractiveHtml();
    const blob = new Blob([generated.standalone], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) toast(T("msg.popupBlocked"), "error");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function serializableState() {
    const json = JSON.stringify(state, (key, value) => {
      if (key === "image") return undefined;
      if (typeof Element !== "undefined" && value instanceof Element) return undefined;
      if (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) return undefined;
      return value;
    });
    const snapshot = JSON.parse(json);
    snapshot.version = 2;
    return snapshot;
  }

  function saveProject() {
    try {
      const data = JSON.stringify(serializableState(), null, 2);
      downloadBlob(new Blob([data], { type: "application/json;charset=utf-8" }), `${slugify(state.text.title)}-project.json`);
      toast(T("msg.projectSaved"), "success");
    } catch (error) {
      console.error(error);
      toast(error.message || T("msg.projectSaveFailed"), "error");
    }
  }

  function mergeState(defaultValue, loadedValue) {
    if (Array.isArray(defaultValue)) return Array.isArray(loadedValue) ? loadedValue : defaultValue;
    if (defaultValue && typeof defaultValue === "object") {
      const result = { ...defaultValue };
      if (loadedValue && typeof loadedValue === "object") {
        for (const [key, value] of Object.entries(loadedValue)) {
          result[key] = key in defaultValue ? mergeState(defaultValue[key], value) : value;
        }
      }
      return result;
    }
    return loadedValue === undefined ? defaultValue : loadedValue;
  }

  async function loadProjectFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error(T("err.badProject"));
      const merged = mergeState(createDefaultState(), parsed);
      if (!Object.prototype.hasOwnProperty.call(parsed.layout || {}, "autoGap")) merged.layout.autoGap = false;
      const sourceCharacters = Array.isArray(merged.characters) ? merged.characters : [];
      merged.characters = [];
      const loadedCharacters = [];
      for (const character of sourceCharacters) {
        if (!character?.src) continue;
        try {
          loadedCharacters.push(await makeCharacter(character));
        } catch (error) {
          console.warn("Skipped broken character image", error);
        }
      }
      merged.characters = loadedCharacters;
      merged.font = StudioFonts.normalize(merged.font);
      await StudioFonts.ready(merged.font);
      state = merged;
      backgroundImage = null;
      if (state.background.imageSrc) {
        try { backgroundImage = await loadImage(state.background.imageSrc); }
        catch (error) { console.warn("Background image could not be restored", error); }
      }
      sanitizeState();
      editingPlayer = 0;
      syncControlsFromState();
      await fontController.ready();
      refreshInspector();
      resetPreview();
      toast(T("msg.projectOpened"), "success");
    } catch (error) {
      console.error(error);
      toast(error.message || T("msg.projectOpenFailed"), "error");
    }
  }

  async function resetProject() {
    const proceed = window.confirm(T("confirm.reset"));
    if (!proceed) return;
    state = createDefaultState();
    backgroundImage = null;
    editingPlayer = 0;
    syncControlsFromState();
    await loadDemoCharacters(true);
  }

  function applyStylePreset(preset) {
    if (preset === "gray") {
      Object.assign(state.idle, { mode: "grayscale", amount: 100, brightness: 65, saturation: 50, overlayAlpha: 18 });
      Object.assign(state.selected, { tintMode: "none", tintAlpha: 0, brightness: 108, saturation: 125, scale: 1.055, glow: 28 });
    } else if (preset === "sepia") {
      Object.assign(state.idle, { mode: "sepia", amount: 88, brightness: 72, saturation: 68, overlayAlpha: 15 });
      Object.assign(state.selected, { tintMode: "none", tintAlpha: 0, brightness: 108, saturation: 120, scale: 1.06, glow: 28 });
    } else if (preset === "playerTint") {
      Object.assign(state.idle, { mode: "grayscale", amount: 100, brightness: 62, saturation: 35, overlayAlpha: 22 });
      Object.assign(state.selected, { tintMode: "player", tintAlpha: 26, brightness: 112, saturation: 138, scale: 1.065, glow: 38 });
    }
    syncControlsFromState();
    redrawPreview();
  }

  function resizeCanvas(width, height) {
    const previousWidth = state.canvas.width;
    const previousHeight = state.canvas.height;
    state.canvas.width = clamp(Math.round(Number(width) || 960), 240, 4096);
    state.canvas.height = clamp(Math.round(Number(height) || 540), 180, 4096);
    const scaleX = state.canvas.width / previousWidth;
    const scaleY = state.canvas.height / previousHeight;
    state.layout.x = Math.round(state.layout.x * scaleX);
    state.layout.y = Math.round(state.layout.y * scaleY);
    state.layout.width = Math.round(state.layout.width * scaleX);
    state.layout.height = Math.round(state.layout.height * scaleY);
    state.layout.radius = Math.round(state.layout.radius * Math.min(scaleX, scaleY));
    sanitizeState();
  }

  function applyCanvasPreset(width, height, grid = null) {
    resizeCanvas(width, height);
    if (grid) {
      state.mainPanel.enabled = false;
      const [columns, rows] = grid;
      const marginX = Math.round(state.canvas.width / 15);
      Object.assign(state.layout, {
        columns, rows, autoRows: false, autoGap: true,
        x: marginX, y: 168,
        width: state.canvas.width - marginX * 2,
        height: state.canvas.height - 280,
        radius: 24
      });
      sanitizeState();
    }
    syncControlsFromState();
    refreshInspector();
    resetPreview();
  }

  function applyShowcasePreset(orientation) {
    const portrait = orientation === "portrait";
    state.canvas = portrait ? { width: 960, height: 1280 } : { width: 1280, height: 720 };
    Object.assign(state.mainPanel, { enabled: true, position: portrait ? "top" : "left", size: 62, gap: 24 });
    Object.assign(state.layout, {
      x: 64, y: portrait ? 152 : 128, width: portrait ? 832 : 1152,
      height: portrait ? 1020 : 496, columns: portrait ? 4 : 2, rows: portrait ? 2 : 4,
      autoRows: true, autoGap: true, radius: 18
    });
    sanitizeState();
    syncControlsFromState();
    refreshInspector();
    resetPreview(false);
  }

  function capturePlayerCharacterRefs() {
    return {
      targetIndices: [...state.players.targets],
      targetIds: state.players.targets.map(target => state.characters[target]?.id ?? null),
      startIds: state.players.starts.map(start => start === null ? null : state.characters[start]?.id ?? null),
      pathIds: state.players.paths.map(path => (Array.isArray(path) ? path : []).map(index => state.characters[index]?.id ?? null))
    };
  }

  function remapPlayerCharacterRefs(refs) {
    const maxIndex = Math.max(0, state.characters.length - 1);
    state.players.targets = refs.targetIds.map((id, player) => {
      const found = id ? state.characters.findIndex(character => character.id === id) : -1;
      return found >= 0 ? found : clamp(refs.targetIndices[player] || 0, 0, maxIndex);
    });
    state.players.starts = refs.startIds.map(id => {
      if (!id) return null;
      const found = state.characters.findIndex(character => character.id === id);
      return found >= 0 ? found : null;
    });
    state.players.paths = refs.pathIds.map(path => path
      .map(id => id ? state.characters.findIndex(character => character.id === id) : -1)
      .filter(index => index >= 0));
    sanitizeState();
  }

  async function duplicateCharacter(index) {
    const original = state.characters[index];
    if (!original) return;
    const refs = capturePlayerCharacterRefs();
    const copy = await makeCharacter({
      name: `${original.name} COPY`,
      src: original.src,
      scale: original.scale,
      offsetX: original.offsetX,
      offsetY: original.offsetY,
      moveRangeX: original.moveRangeX,
      moveRangeY: original.moveRangeY,
      mainCrop: original.mainCrop,
      listCrop: original.listCrop
    });
    state.characters.splice(index + 1, 0, copy);
    remapPlayerCharacterRefs(refs);
    refreshInspector();
  }

  function moveCharacter(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.characters.length) return;
    const refs = capturePlayerCharacterRefs();
    [state.characters[index], state.characters[targetIndex]] = [state.characters[targetIndex], state.characters[index]];
    remapPlayerCharacterRefs(refs);
    refreshInspector();
  }

  function removeCharacter(index) {
    if (!state.characters[index]) return;
    const refs = capturePlayerCharacterRefs();
    state.characters.splice(index, 1);
    remapPlayerCharacterRefs(refs);
    refreshInspector();
  }

  function bindEvents() {
    $$('[data-border-preset]').forEach(button => button.addEventListener("click", () => {
      state.layout.borderStyle = button.dataset.borderPreset;
      syncControlsFromState();
      updateContextControls();
      redrawPreview();
    }));
    $('[data-bind="players.count"]').addEventListener("change", event => {
      event.target.value = String(state.players.count);
    });
    $("#allowDuplicateButton").addEventListener("click", () => {
      state.players.allowDuplicate = true;
      syncControlsFromState();
      refreshInspector();
    });
    $$('[data-main-grid-preset]').forEach(button => button.addEventListener("click", () => {
      const [count, columns] = button.dataset.mainGridPreset.split(",").map(Number);
      Object.assign(state.mainPanel, { count, columns });
      sanitizeState();
      syncControlsFromState();
      refreshInspector();
    }));
    $$('[data-bind="mainPanel.count"], [data-bind="mainPanel.columns"]').forEach(input => {
      input.addEventListener("change", () => syncControlsFromState());
    });
    $$('[data-showcase-preset]').forEach(button => button.addEventListener("click", () => {
      applyShowcasePreset(button.dataset.showcasePreset);
    }));
    $$('[data-single-number]').forEach(button => button.addEventListener("click", () => {
      state.players.selectionMode = "single";
      state.players.singleNumber = Number(button.dataset.singleNumber);
      sanitizeState();
      syncControlsFromState();
      refreshInspector();
      resetPreview();
    }));
    $$('[data-editor-tab]').forEach(button => {
      button.addEventListener("click", () => setEditorTab(button.dataset.editorTab, { scroll: true }));
      button.addEventListener("keydown", event => {
        const tabs = $$('[data-editor-tab]');
        let next = tabs.indexOf(button);
        if (event.key === "ArrowRight") next = (next + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (next + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        setEditorTab(tabs[next].dataset.editorTab, { focus: true });
      });
    });
    $$('[data-go-tab]').forEach(button => button.addEventListener("click", () => {
      setEditorTab(button.dataset.goTab, { focus: true, scroll: true });
    }));
    $("#dropZone").addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      $("#characterFileInput").click();
    });
    $(".file-button").addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      $("#backgroundFileInput").click();
    });
    $("#previewPlayerButtons").addEventListener("click", event => {
      const button = event.target.closest("[data-preview-player]");
      if (!button) return;
      editingPlayer = Number(button.dataset.previewPlayer);
      updateEditingPlayer();
    });
    document.addEventListener("input", event => {
      const element = event.target.closest?.("[data-bind]");
      if (!element) return;
      const path = element.dataset.bind;
      if (path === "canvas.width" || path === "canvas.height") {
        const inputValue = element.value;
        resizeCanvas(path === "canvas.width" ? parseBoundValue(element) : state.canvas.width,
          path === "canvas.height" ? parseBoundValue(element) : state.canvas.height);
        syncControlsFromState();
        // Let partially typed dimensions remain editable while the layout stays valid.
        element.value = inputValue;
      } else {
        setByPath(state, path, parseBoundValue(element));
      }
      sanitizeState();
      const output = $(`[data-output="${CSS.escape(path)}"]`);
      if (output) output.textContent = formatOutput(path, getByPath(state, path));
      if (["players.count", "players.allowDuplicate", "players.selectionMode", "players.singleNumber"].includes(path)) {
        syncEditingPlayer();
        normalizeTargets();
        renderPlayerList();
        renderCharacterList();
        if (path === "players.selectionMode" || path === "players.singleNumber" || path === "players.count") resetPreview();
      } else if (path === "animation.hops") {
        renderPlayerList();
      }
      if (path === "mainPanel.count") $('[data-bind="mainPanel.columns"]').value = String(state.mainPanel.columns);
      if (path === "mainPanel.enabled" || path === "mainPanel.reveal") resetPreview(false);
      updateContextControls();
      updateExportEstimate();
      redrawPreview();
    });

    $("#characterFileInput").addEventListener("change", event => {
      addCharacterFiles(event.target.files);
      event.target.value = "";
    });
    $("#replaceCharacterFileInput").addEventListener("change", event => {
      const character = pendingReplacementCharacter;
      const file = event.target.files[0];
      pendingReplacementCharacter = null;
      event.target.value = "";
      if (file) replaceCharacterFile(character, file);
    });
    $("#replaceCharacterFileInput").addEventListener("cancel", () => {
      pendingReplacementCharacter = null;
    });
    $("#backgroundFileInput").addEventListener("change", event => {
      setBackgroundFile(event.target.files[0]);
      event.target.value = "";
    });
    $("#clearBackgroundButton").addEventListener("click", () => {
      backgroundImage = null;
      state.background.imageSrc = "";
      if (state.background.type === "image") state.background.type = "gradient";
      syncControlsFromState();
      redrawPreview();
    });

    const dropZone = $("#dropZone");
    ["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      dropZone.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    }));
    dropZone.addEventListener("drop", event => addCharacterFiles(event.dataTransfer.files));

    $("#demoButton").addEventListener("click", () => {
      if (!state.characters.length || confirm(T("confirm.restoreDemo"))) loadDemoCharacters(true);
    });
    $("#clearCharactersButton").addEventListener("click", () => {
      if (state.characters.length && !confirm(T("confirm.clearAll"))) return;
      state.characters = [];
      state.players.starts = [null, null, null, null];
      state.players.pathModes = ["random", "random", "random", "random"];
      state.players.paths = [[], [], [], []];
      sanitizeState();
      refreshInspector();
      resetPreview(false);
    });

    $$('[data-canvas-preset]').forEach(button => button.addEventListener("click", () => {
      const [width, height] = button.dataset.canvasPreset.split(",").map(Number);
      const grid = button.dataset.gridPreset?.split(",").map(Number) || null;
      applyCanvasPreset(width, height, grid);
    }));
    $$('[data-style-preset]').forEach(button => button.addEventListener("click", () => applyStylePreset(button.dataset.stylePreset)));

    $("#playerList").addEventListener("click", event => {
      const row = event.target.closest(".player-row");
      if (!row) return;
      editingPlayer = Number(row.dataset.player);
      updateEditingPlayer();
      const actionButton = event.target.closest("[data-player-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.playerAction;
      const waypointIndex = Number(actionButton.dataset.waypointIndex);
      if (action === "capture-auto") captureAutomaticPath(editingPlayer);
      else if (action === "add-waypoint") addPlayerWaypoint(editingPlayer);
      else if (action === "waypoint-up") movePlayerWaypoint(editingPlayer, waypointIndex, -1);
      else if (action === "waypoint-down") movePlayerWaypoint(editingPlayer, waypointIndex, 1);
      else if (action === "remove-waypoint") removePlayerWaypoint(editingPlayer, waypointIndex);
    });
    $("#playerList").addEventListener("input", event => {
      const row = event.target.closest(".player-row");
      if (!row) return;
      const player = Number(row.dataset.player);
      if (event.target.classList.contains("player-label-input")) {
        state.players.labels[player] = normalizePlayerLabel(event.target.value);
        const label = getPlayerLabel(player);
        const tag = $(".player-tag", row);
        tag.textContent = label;
        tag.title = label;
        tag.setAttribute("aria-label", T("player.targetAria", label));
        for (const [selector, suffixKey] of [[".player-color", "player.colorAria"], [".player-target", "player.targetCharAria"], [".player-start", "route.startAria"], [".player-path-mode", "route.modeAria"]]) {
          $(selector, row).setAttribute("aria-label", `${label} ${suffix}`);
        }
        $$(".player-waypoint", row).forEach(input => input.setAttribute("aria-label", T("route.waypointAria", label, Number(input.dataset.waypointIndex) + 1)));
        renderPreviewPlayers();
        renderCharacterList();
        updateContextControls();
        redrawPreview();
      } else if (event.target.classList.contains("player-color")) {
        state.players.colors[player] = event.target.value;
        row.style.setProperty("--player-color", event.target.value);
        renderPreviewPlayers();
        renderCharacterList();
        redrawPreview();
      }
    });
    $("#playerList").addEventListener("change", event => {
      const row = event.target.closest(".player-row");
      if (!row) return;
      const player = Number(row.dataset.player);
      editingPlayer = player;
      if (event.target.classList.contains("player-label-input")) event.target.value = state.players.labels[player];
      else if (event.target.classList.contains("player-target")) setPlayerTarget(player, Number(event.target.value));
      else if (event.target.classList.contains("player-start")) setPlayerStart(player, event.target.value);
      else if (event.target.classList.contains("player-path-mode")) setPlayerPathMode(player, event.target.value);
      else if (event.target.classList.contains("player-waypoint")) setPlayerWaypoint(player, Number(event.target.dataset.waypointIndex), event.target.value);
    });

    $("#characterList").addEventListener("input", event => {
      const card = event.target.closest(".character-card");
      if (!card) return;
      const index = Number(card.dataset.index);
      const character = state.characters[index];
      if (!character) return;
      if (event.target.classList.contains("character-name")) {
        character.name = event.target.value;
        renderPlayerList();
      } else if (event.target.dataset.tune) {
        const property = event.target.dataset.tune;
        character[property] = Number(event.target.value);
        const output = event.target.parentElement.querySelector("output");
        output.textContent = property === "scale" ? `${character[property].toFixed(2)}×` : `${Math.round(character[property])}%`;
      } else if (event.target.dataset.moveRange) {
        const axis = event.target.dataset.moveRange;
        const range = clamp(Number(event.target.value) || 100, 25, 500);
        character[`moveRange${axis}`] = range;
        character[`offset${axis}`] = clamp(character[`offset${axis}`], -range, range);
        const slider = card.querySelector(`[data-tune="offset${axis}"]`);
        slider.min = -range; slider.max = range; slider.value = character[`offset${axis}`];
        slider.parentElement.querySelector("output").textContent = `${Math.round(character[`offset${axis}`])}%`;
      }
      redrawPreview();
    });
    $("#characterList").addEventListener("click", event => {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;
      const card = actionButton.closest(".character-card");
      const index = Number(card.dataset.index);
      const action = actionButton.dataset.action;
      if (action === "replace") chooseReplacementImage(state.characters[index]);
      else if (action === "crop-main") openCharacterCrop(state.characters[index]);
      else if (action === "crop-list") openCharacterCrop(state.characters[index], "list");
      else if (action === "up") moveCharacter(index, -1);
      else if (action === "down") moveCharacter(index, 1);
      else if (action === "remove") removeCharacter(index);
      else if (action === "duplicate") duplicateCharacter(index);
    });

    $("#characterList").addEventListener("change", event => {
      const axis = event.target.dataset.moveRange;
      if (!axis) return;
      const character = state.characters[Number(event.target.closest(".character-card").dataset.index)];
      event.target.value = character[`moveRange${axis}`];
    });

    $("#playButton").addEventListener("click", () => {
      const selectionIssue = getSelectionIssue();
      if (selectionIssue) {
        toast(selectionIssue, "error");
        setEditorTab("motion");
        return;
      }
      previewPlaying = !previewPlaying;
      if (previewPlaying) previewEpoch = performance.now() - previewTime;
      updatePlayButton();
    });
    $("#restartButton").addEventListener("click", () => {
      const selectionIssue = getSelectionIssue();
      if (selectionIssue) {
        toast(selectionIssue, "error");
        setEditorTab("motion");
        return;
      }
      resetPreview(true);
    });
    $("#scrubber").addEventListener("input", event => {
      previewPlaying = false;
      updatePlayButton();
      setPreviewTime(Number(event.target.value) / 1000 * getTimelineDuration());
    });
    previewCanvas.addEventListener("click", event => {
      if (exportBusy) return;
      const rect = previewCanvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * state.canvas.width;
      const y = (event.clientY - rect.top) / rect.height * state.canvas.height;
      const tile = findTileAtCanvasPoint(x, y);
      if (tile >= 0) setPlayerTarget(editingPlayer, tile);
    });

    $("#snapshotButton").addEventListener("click", () => exportSnapshot().catch(error => {
      console.error(error);
      toast(error.message || T("msg.pngFailed"), "error");
    }));
    $("#interactivePreviewButton").addEventListener("click", () => {
      try { openInteractivePreview(); }
      catch (error) { toast(error.message, "error"); }
    });
    $$('[data-export]').forEach(button => button.addEventListener("click", () => {
      const format = button.dataset.export;
      if (format === "html") {
        try { openCodeModal(); }
        catch (error) { toast(error.message, "error"); }
      } else if (format === "apng") runExport("APNG", exportAPNG);
      else if (format === "webp") runExport("Animated WebP", exportAnimatedWebP);
      else if (format === "gif") runExport("GIF", exportGIF);
      else if (format === "mp4" || format === "avi") runExport(format.toUpperCase(), (plan, dimensions) => exportVideo(format, plan, dimensions), true);
    }));
    $("#cancelExportButton").addEventListener("click", () => { exportCancelled = true; });

    $("#saveProjectButton").addEventListener("click", saveProject);
    $("#loadProjectButton").addEventListener("click", () => $("#projectFileInput").click());
    $("#projectFileInput").addEventListener("change", event => {
      if (event.target.files[0]) loadProjectFile(event.target.files[0]);
      event.target.value = "";
    });
    $("#resetProjectButton").addEventListener("click", resetProject);

    $("#closeCodeModalButton").addEventListener("click", closeCodeModal);
    $("#codeModal").addEventListener("click", event => { if (event.target === $("#codeModal")) closeCodeModal(); });
    $("#copyHtmlButton").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("#htmlCodeOutput").value);
        toast(T("msg.htmlCopied"), "success");
      } catch {
        $("#htmlCodeOutput").select();
        document.execCommand("copy");
        toast(T("msg.htmlCopied"), "success");
      }
    });
    $("#downloadHtmlButton").addEventListener("click", () => {
      if (!generatedStandaloneHtml) return;
      downloadBlob(new Blob([generatedStandaloneHtml], { type: "text/html;charset=utf-8" }), `${slugify(state.text.title)}-interactive.html`);
    });
    $("#openHtmlPreviewButton").addEventListener("click", () => {
      if (!generatedStandaloneHtml) return;
      const url = URL.createObjectURL(new Blob([generatedStandaloneHtml], { type: "text/html;charset=utf-8" }));
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!$("#codeModal").hidden) closeCodeModal();
    });
  }

  async function initialize() {
    initializeTheme();
    fontController = StudioFonts.create({
      getValue: () => state.font,
      onChange: value => { state.font = value; redrawPreview(); },
      onReady: () => redrawPreview(),
      onBusy: busy => {
        $$('#interactivePreviewButton, [data-export="html"]').forEach(button => {
          button.disabled = busy || exportBusy;
        });
        $("#saveProjectButton").disabled = busy;
      },
      onError: error => toast(error.message || T("font.err.generic"), "error")
    });
    bindEvents();
    syncControlsFromState();
    await loadDemoCharacters(true);
    resizePreviewCanvas();
    updateExportEstimate();
    requestAnimationFrame(animatePreview);

    /* TRPG Toolkit 合輯：語言切換器。清單與面板的文字是 JS 組出來的，
     * 標記上沒有 data-i18n 掛勾，所以語言一變就整批重畫一次。 */
    I18N.mountSwitcher($("#localeSelect"));
    I18N.onChange(() => {
      /* 只重寫主題按鈕的文字，不要再綁一次 click。 */
      setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
      syncControlsFromState();
      renderCharacterList();
      renderPlayerList();
      renderPreviewPlayers();
      updateExportEstimate();
    });
  }

  initialize().catch(error => {
    console.error(error);
    toast(T("msg.initFailed"), "error");
  });
})();
