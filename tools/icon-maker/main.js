/* icon-maker（簡易頭像產生器）主程式。
 * 上游：kumachansteps/trpg-web-tools 的 tools/kantan-icon-maker/main.js（v0.1）。收錄版只把寫死的日文介面字串
 * 換成 T()，並在切換語言時重畫 JS 產生的文字；繪圖與輸出邏輯沒有更動。 */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const PRESETS = [
  { id: "red", label: "RED", solid: "#ef4444", frame: ["#dc2626", "#fb7185", "#fdba74"], bg: "#f8fafc" },
  { id: "ungra", label: "UNGRA", solid: "#1f2937", frame: ["#020617", "#475569", "#9ca3af"], bg: "#0f172a" },
  { id: "cute", label: "Cute", solid: "#f472b6", frame: ["#f9a8d4", "#fda4af", "#fde68a"], bg: "#fdf2f8" },
  { id: "gold", label: "ElegantGold", solid: "#f59e0b", frame: ["#fef08a", "#f59e0b", "#a16207"], bg: "#09090b" },
  { id: "neon", label: "ModernNeon", solid: "#22d3ee", frame: ["#67e8f9", "#e879f9", "#7c3aed"], bg: "#020617" },
  { id: "nature", label: "Nature", solid: "#10b981", frame: ["#6ee7b7", "#bef264", "#0f766e"], bg: "#ecfdf5" },
  { id: "secret", label: "SecretHO", solid: "#6d28d9", frame: ["#020617", "#7e22ce", "#818cf8"], bg: "#0f172a" },
  { id: "horror", label: "Horror", solid: "#450a0a", frame: ["#000000", "#450a0a", "#ef4444"], bg: "#09090b" },
  { id: "pop", label: "Pop", solid: "#38bdf8", frame: ["#7dd3fc", "#fde68a", "#f9a8d4"], bg: "#f0f9ff" },
];

const state = {
  frameMode: "solid",
  preset: PRESETS[0],
  backgroundType: "solid",
  frameWidth: 18,
  imageScale: 1,
  selected: "name",
  imageLoaded: false,
  imageFileName: "",
  imageObjectUrl: null,
  character: { x: 50, y: 56, w: 58, h: 58 },
  name: { x: 78, y: 8, w: 11, h: 48 },
  ho: { x: 7, y: 84, w: 20, h: 9 },
};

const els = {
  body: document.body,
  iconEditor: $("#iconEditor"),
  innerIcon: $("#innerIcon"),
  frameLayer: $("#frameLayer"),
  backgroundLayer: $("#backgroundLayer"),
  characterObject: $("#characterObject"),
  characterImage: $("#characterImage"),
  placeholderCharacter: $("#placeholderCharacter"),
  nameBox: $("#nameBox"),
  hoBadge: $("#hoBadge"),
  nameBoxText: $("#nameBoxText"),
  hoBadgeText: $("#hoBadgeText"),
  guideLayer: $("#guideLayer"),
  guideLabelX: $("#guideLabelX"),
  guideLabelY: $("#guideLabelY"),
  imageInput: $("#imageInput"),
  dropzone: $("#dropzone"),
  dropzoneLarge: $("#dropzoneLarge"),
  dropzoneCompact: $("#dropzoneCompact"),
  loadedFileName: $("#loadedFileName"),
  presetGrid: $("#presetGrid"),
  settingsGrid: $("#settingsGrid"),
};

function hexToRgba(hex, alpha = 1) {
  const value = hex.replace("#", "");
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeGradient(colors, direction = "135deg") {
  return `linear-gradient(${direction}, ${colors.join(", ")})`;
}

function renderPresets() {
  els.presetGrid.innerHTML = "";
  PRESETS.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `preset-card ${preset.id === state.preset.id ? "is-active" : ""}`;
    button.dataset.preset = preset.id;
    const swatchBackground = state.frameMode === "gradation"
      ? makeGradient(preset.frame, "90deg")
      : preset.solid;
    button.innerHTML = `<div class="preset-swatch" style="background:${swatchBackground}"></div>${preset.label}`;
    button.addEventListener("click", () => {
      state.preset = preset;
      render();
    });
    els.presetGrid.appendChild(button);
  });
}

function setCssVars() {
  const frameBackground = state.frameMode === "gradation"
    ? makeGradient(state.preset.frame)
    : state.preset.solid;

  let innerBackground = state.preset.bg;
  if (state.backgroundType === "gradation") {
    innerBackground = makeGradient([hexToRgba(state.preset.bg, 1), hexToRgba(state.preset.solid, 0.2), "#ffffff"], "135deg");
  }
  if (state.backgroundType === "transparent") {
    innerBackground = "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)";
    els.backgroundLayer.style.backgroundSize = "28px 28px";
    els.backgroundLayer.style.backgroundPosition = "0 0, 0 14px, 14px -14px, -14px 0px";
  } else {
    els.backgroundLayer.style.backgroundSize = "";
    els.backgroundLayer.style.backgroundPosition = "";
  }

  els.iconEditor.style.setProperty("--frame-width", `${state.frameWidth}px`);
  els.iconEditor.style.setProperty("--frame-background", frameBackground);
  els.iconEditor.style.setProperty("--inner-background", innerBackground);
  els.characterObject.style.setProperty("--image-scale", state.imageScale);

  els.backgroundLayer.classList.toggle("bg-dot", state.backgroundType === "dot");
  els.backgroundLayer.classList.toggle("bg-stripe", state.backgroundType === "stripe");
  els.backgroundLayer.classList.toggle("bg-check", state.backgroundType === "check");
}

function applyObjectLayout() {
  const setLayout = (element, data) => {
    element.style.left = `${data.x}%`;
    element.style.top = `${data.y}%`;
    element.style.width = `${data.w}%`;
    element.style.height = `${data.h}%`;
  };
  els.characterObject.style.left = `${state.character.x}%`;
  els.characterObject.style.top = `${state.character.y}%`;
  els.characterObject.style.width = `${state.character.w}%`;
  setLayout(els.nameBox, state.name);
  setLayout(els.hoBadge, state.ho);
}

function applyTextSettings() {
  els.nameBoxText.textContent = $("#nameText").value || T("name.fallback");
  els.hoBadgeText.textContent = $("#hoText").value || "HO";
  els.nameBox.classList.toggle("horizontal", $("#nameWritingMode").value === "horizontal");
  els.nameBox.classList.remove("font-serif", "font-sans", "font-rounded", "font-mono");
  els.nameBox.classList.add(`font-${$("#nameFont").value}`);
  els.hoBadge.classList.remove("glass", "ribbon");
  const hoStyle = $("#hoStyle").value;
  if (hoStyle !== "dark") els.hoBadge.classList.add(hoStyle);
}

function selectObject(objectName) {
  state.selected = objectName;
  $$(".editable-object").forEach((element) => element.classList.toggle("selected", element.dataset.object === objectName));
}

function renderSettings() {
  const rows = [
    [T("settings.preset"), state.preset.label],
    [T("settings.frame"), state.frameMode === "gradation" ? T("frame.gradation") : T("frame.solid")],
    [T("settings.bg"), $("#backgroundType").selectedOptions[0].textContent],
    [T("settings.border"), `${state.frameWidth}px`],
    [T("settings.scale"), `${Math.round(state.imageScale * 100)}%`],
    [T("settings.name"), $("#nameText").value || T("name.fallback")],
    [T("settings.ho"), $("#hoText").value || "HO"],
    [T("settings.selected"), state.selected === "character" ? T("selected.image") : state.selected === "name" ? T("selected.name") : T("selected.ho")],
  ];
  els.settingsGrid.innerHTML = rows.map(([key, value]) => `<div class="setting-row"><strong>${key}</strong><span>${value}</span></div>`).join("");
}

function render() {
  setCssVars();
  renderPresets();
  applyObjectLayout();
  applyTextSettings();
  renderSettings();
  $$("[data-frame-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.frameMode === state.frameMode));
}

function importImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (state.imageObjectUrl) URL.revokeObjectURL(state.imageObjectUrl);
  state.imageObjectUrl = URL.createObjectURL(file);
  state.imageLoaded = true;
  state.imageFileName = file.name;
  els.characterImage.src = state.imageObjectUrl;
  els.characterImage.classList.remove("hidden");
  els.placeholderCharacter.classList.add("hidden");
  els.dropzoneLarge.classList.add("hidden");
  els.dropzoneCompact.classList.remove("hidden");
  els.loadedFileName.textContent = file.name;
  selectObject("character");
  render();
}

function getPercentFromEvent(event) {
  const rect = els.innerIcon.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  return { x, y };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function showGuides(data) {
  const guide = els.guideLayer;
  guide.classList.remove("hidden");
  const left = data.x;
  const top = data.y;
  const right = data.x + data.w;
  const bottom = data.y + data.h;
  guide.querySelector(".object-left").style.left = `${left}%`;
  guide.querySelector(".object-right").style.left = `${right}%`;
  guide.querySelector(".object-top").style.top = `${top}%`;
  guide.querySelector(".object-bottom").style.top = `${bottom}%`;
  els.guideLabelX.style.left = `${clamp(left, 2, 82)}%`;
  els.guideLabelX.textContent = T("guide.x", Math.round(left), Math.round(100 - right));
  els.guideLabelY.style.top = `${clamp(top, 2, 88)}%`;
  els.guideLabelY.textContent = T("guide.y", Math.round(top), Math.round(100 - bottom));
}

function hideGuides() {
  els.guideLayer.classList.add("hidden");
}

function beginInteraction(event, objectName, mode = "drag") {
  event.preventDefault();
  event.stopPropagation();
  selectObject(objectName);
  const objectState = state[objectName];
  const start = getPercentFromEvent(event);
  const startState = { ...objectState };
  showGuides(objectName === "character" ? { x: state.character.x - state.character.w / 2, y: state.character.y - state.character.h / 2, w: state.character.w, h: state.character.h } : objectState);

  const move = (moveEvent) => {
    const current = getPercentFromEvent(moveEvent);
    const dx = current.x - start.x;
    const dy = current.y - start.y;

    if (objectName === "character") {
      state.character.x = clamp(startState.x + dx, -20, 120);
      state.character.y = clamp(startState.y + dy, -20, 120);
      showGuides({ x: state.character.x - state.character.w / 2, y: state.character.y - state.character.h / 2, w: state.character.w, h: state.character.h });
    } else if (mode === "resize") {
      objectState.w = clamp(startState.w + dx, 8, 80);
      objectState.h = clamp(startState.h + dy, 6, 80);
      showGuides(objectState);
    } else {
      objectState.x = clamp(startState.x + dx, -10, 110 - objectState.w);
      objectState.y = clamp(startState.y + dy, -10, 110 - objectState.h);
      showGuides(objectState);
    }
    applyObjectLayout();
    renderSettings();
  };

  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    hideGuides();
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function setupDragAndResize() {
  els.characterObject.addEventListener("pointerdown", (event) => beginInteraction(event, "character", "drag"));
  els.nameBox.addEventListener("pointerdown", (event) => {
    if (event.target.dataset.resize === "name") return;
    beginInteraction(event, "name", "drag");
  });
  els.hoBadge.addEventListener("pointerdown", (event) => {
    if (event.target.dataset.resize === "ho") return;
    beginInteraction(event, "ho", "drag");
  });
  $$("[data-resize]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => beginInteraction(event, handle.dataset.resize, "resize"));
  });
}

function setupInputs() {
  $("#chooseImageButton").addEventListener("click", () => els.imageInput.click());
  $("#replaceImageButton").addEventListener("click", () => {
    els.dropzoneCompact.classList.add("hidden");
    els.dropzoneLarge.classList.remove("hidden");
    els.imageInput.click();
  });
  els.imageInput.addEventListener("change", (event) => importImage(event.target.files[0]));

  ["dragenter", "dragover"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("is-dragover");
    });
  });
  els.dropzone.addEventListener("drop", (event) => importImage(event.dataTransfer.files[0]));

  $$("[data-frame-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.frameMode = button.dataset.frameMode;
      render();
    });
  });
  $("#backgroundType").addEventListener("change", (event) => {
    state.backgroundType = event.target.value;
    render();
  });
  $("#frameWidth").addEventListener("input", (event) => {
    state.frameWidth = Number(event.target.value);
    render();
  });
  ["#nameText", "#nameFont", "#nameWritingMode", "#hoText", "#hoStyle"].forEach((selector) => {
    $(selector).addEventListener("input", render);
    $(selector).addEventListener("change", render);
  });
  $("#zoomInButton").addEventListener("click", () => {
    state.imageScale = clamp(Number((state.imageScale + 0.08).toFixed(2)), 0.35, 3);
    render();
  });
  $("#zoomOutButton").addEventListener("click", () => {
    state.imageScale = clamp(Number((state.imageScale - 0.08).toFixed(2)), 0.35, 3);
    render();
  });
  $("#resetButton").addEventListener("click", resetLayout);
  $("#downloadButton").addEventListener("click", downloadPng);
  $("#copyButton").addEventListener("click", copyPngToClipboard);
  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("theme-night");
    document.body.classList.toggle("theme-light");
    syncThemeLabel();
  });
  $$("[data-panel-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = $(`#${button.dataset.panelTrigger}`);
      $$(".header-info-panel").forEach((panel) => {
        if (panel !== target) panel.classList.add("hidden");
      });
      target.classList.toggle("hidden");
    });
  });
  document.addEventListener("keydown", handleKeyboard);
}

/* 主題切換鈕顯示「切換過去」的模式名稱；切換語言時也要跟著重寫。 */
function syncThemeLabel() {
  $("#themeToggle").textContent = document.body.classList.contains("theme-night") ? T("theme.light") : T("theme.night");
}

/* 上傳區收合後顯示的檔名；還沒載入圖片時是預設說明文字。 */
function syncLoadedFileName() {
  els.loadedFileName.textContent = state.imageLoaded ? state.imageFileName : T("upload.minimized");
}

function handleKeyboard(event) {
  if (event.key === "Escape") {
    $$(".header-info-panel").forEach((panel) => panel.classList.add("hidden"));
    hideGuides();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    if (!["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      selectObject("");
    }
    return;
  }
  const selected = state.selected;
  if (!["name", "ho", "character"].includes(selected)) return;
  const keyMap = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!keyMap[event.key]) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  event.preventDefault();
  const amount = event.shiftKey ? 2 : 0.2;
  const [x, y] = keyMap[event.key];
  state[selected].x += x * amount;
  state[selected].y += y * amount;
  applyObjectLayout();
  renderSettings();
}

function resetLayout() {
  state.imageScale = 1;
  state.character = { x: 50, y: 56, w: 58, h: 58 };
  state.name = { x: 78, y: 8, w: 11, h: 48 };
  state.ho = { x: 7, y: 84, w: 20, h: 9 };
  selectObject("name");
  render();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function getCanvasGradient(ctx, colors, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
  return gradient;
}

function drawTextBox(ctx, data, text, options) {
  const x = data.x * 10.24;
  const y = data.y * 10.24;
  const w = data.w * 10.24;
  const h = data.h * 10.24;
  ctx.save();
  ctx.fillStyle = options.background;
  roundRect(ctx, x, y, w, h, 26);
  ctx.fill();
  ctx.fillStyle = options.color;
  ctx.font = `900 ${options.fontSize}px ${options.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (options.vertical) {
    const chars = Array.from(text);
    const step = Math.min(options.fontSize * 1.2, h / Math.max(chars.length, 1));
    const startY = y + h / 2 - (step * (chars.length - 1)) / 2;
    chars.forEach((char, index) => ctx.fillText(char, x + w / 2, startY + step * index));
  } else {
    ctx.fillText(text, x + w / 2, y + h / 2, w - 20);
  }
  ctx.restore();
}

function buildCanvas() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const frameFill = state.frameMode === "gradation" ? getCanvasGradient(ctx, state.preset.frame, size, size) : state.preset.solid;
  ctx.fillStyle = frameFill;
  roundRect(ctx, 0, 0, size, size, 74);
  ctx.fill();

  const inset = state.frameWidth * (1024 / els.iconEditor.getBoundingClientRect().width);
  const innerX = inset;
  const innerY = inset;
  const innerW = size - inset * 2;
  const innerH = size - inset * 2;
  ctx.save();
  roundRect(ctx, innerX, innerY, innerW, innerH, 50);
  ctx.clip();

  if (state.backgroundType === "gradation") {
    ctx.fillStyle = getCanvasGradient(ctx, [state.preset.bg, hexToRgba(state.preset.solid, 0.25), "#ffffff"], size, size);
  } else if (state.backgroundType === "transparent") {
    ctx.fillStyle = "#ffffff";
  } else {
    ctx.fillStyle = state.preset.bg;
  }
  ctx.fillRect(innerX, innerY, innerW, innerH);

  if (state.imageLoaded && els.characterImage.complete) {
    const rectW = (state.character.w / 100) * innerW * state.imageScale;
    const aspect = els.characterImage.naturalHeight / Math.max(els.characterImage.naturalWidth, 1);
    const rectH = rectW * aspect;
    const cx = innerX + (state.character.x / 100) * innerW;
    const cy = innerY + (state.character.y / 100) * innerH;
    ctx.drawImage(els.characterImage, cx - rectW / 2, cy - rectH / 2, rectW, rectH);
  } else {
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.arc(innerX + innerW * 0.5, innerY + innerH * 0.28, innerW * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#334155";
    roundRect(ctx, innerX + innerW * 0.29, innerY + innerH * 0.4, innerW * 0.42, innerH * 0.48, 260);
    ctx.fill();
  }

  const nameScale = Math.min(innerW, innerH) / 1024;
  const nameWritingMode = $("#nameWritingMode").value;
  const nameData = {
    x: state.name.x,
    y: state.name.y,
    w: state.name.w,
    h: state.name.h,
  };
  ctx.translate(innerX, innerY);
  ctx.scale(innerW / 1024, innerH / 1024);
  drawTextBox(ctx, nameData, $("#nameText").value || T("name.fallback"), {
    background: "rgba(255,255,255,0.78)",
    color: "#111827",
    fontSize: nameWritingMode === "vertical" ? 40 : 36,
    fontFamily: $("#nameFont").value === "serif" ? "serif" : "sans-serif",
    vertical: nameWritingMode === "vertical",
  });
  const hoStyle = $("#hoStyle").value;
  drawTextBox(ctx, state.ho, $("#hoText").value || "HO", {
    background: hoStyle === "glass" ? "rgba(255,255,255,0.62)" : hoStyle === "ribbon" ? "rgba(220,38,38,0.9)" : "rgba(0,0,0,0.75)",
    color: hoStyle === "glass" ? "#0f172a" : "#ffffff",
    fontSize: 38,
    fontFamily: "sans-serif",
    vertical: false,
  });
  ctx.restore();
  return canvas;
}

function downloadPng() {
  const canvas = buildCanvas();
  const link = document.createElement("a");
  link.download = "character-icon.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function copyPngToClipboard() {
  try {
    const canvas = buildCanvas();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    alert(T("msg.copied"));
  } catch (error) {
    alert(T("msg.copyFailed"));
  }
}

I18N.mountSwitcher(document.getElementById("localeSelect"));
/* 語言切換：靜態標記由引擎換掉，這裡重畫 JS 寫進畫面的文字（設定摘要、預設名字、主題鈕、檔名欄）。 */
I18N.onChange(() => {
  render();
  syncThemeLabel();
  syncLoadedFileName();
});

setupInputs();
setupDragAndResize();
syncThemeLabel();
syncLoadedFileName();
render();
