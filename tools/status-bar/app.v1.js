/*!
 * app.v1.js - 狀態條產生器（UI）
 *
 * The whole project is one plain JSON object (`state`), so undo, autosave and
 * project files are all snapshots of it.
 *
 * Controls are wired declaratively from the HTML:
 *   data-bind="bar.radius"        read/write that path (array indexes allowed: "bars.2.c1")
 *   data-out="..." data-fmt="px"  shows the value next to a slider
 *   data-show="a=x|y&b!=z"        visible only while the condition holds
 *   data-options="SHAPES"         select filled from BarPresets
 *   data-nohistory                changes don't create an undo step (preview values)
 */
(function () {
  "use strict";

  const P = window.BarPresets, M = window.BarModel, C = window.BarCss, K = window.BarMock;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];

  const SAVE_KEY = "ccf-statusbar-maker.state";
  const TAB_KEY = "ccf-statusbar-maker.tab";
  const probeName = () => T("probe.name");

  let state = M.defaultState();
  let previewAvatar = null;
  let frameDoc = null;
  let lastSize = { w: 0, h: 0 };
  const history = { undo: [], redo: [], last: null };

  // ---------------------------------------------------------------- paths

  function resolveTarget(path) {
    const parts = path.split(".");
    let obj = state;
    for (let i = 0; i < parts.length - 1 && obj != null; i++) obj = obj[parts[i]];
    return obj == null ? null : { obj, key: parts[parts.length - 1] };
  }

  function getPath(path) {
    const t = resolveTarget(path);
    return t ? t.obj[t.key] : undefined;
  }

  function setPath(path, value) {
    const t = resolveTarget(path);
    if (t) t.obj[t.key] = value;
  }

  /* 狀態訊息記住 key 與參數，切換語言時才能以新語言重寫。 */
  let lastStatus = { key: "status.loading", args: [], isError: false };

  function status(key, ...args) {
    lastStatus = { key, args, isError: false };
    renderStatus();
  }

  function statusError(key, ...args) {
    lastStatus = { key, args, isError: true };
    renderStatus();
  }

  function renderStatus() {
    const el = $("#status");
    if (!lastStatus.key) return; /* 例外訊息沒有 key，維持原文 */
    el.textContent = T(lastStatus.key, ...lastStatus.args);
    el.classList.toggle("error", lastStatus.isError);
  }

  // ---------------------------------------------------------------- controls

  function readInput(el) {
    if (el.type === "checkbox") return el.checked;
    if (el.type === "range" || el.type === "number" || el.hasAttribute("data-number")) return Number(el.value);
    return el.value;
  }

  function labelFor(el) {
    if (el.getAttribute("aria-label")) return;
    const label = el.closest(".row")?.querySelector(":scope > label");
    if (label && label.textContent.trim()) el.setAttribute("aria-label", label.textContent.trim());
  }

  // dragging: a slider is still being dragged. Chromium drops the drag when rows around the slider
  // appear, disappear or get rebuilt, so those updates wait for the "change" event on release.
  function afterChange(path, dragging) {
    if (dragging) {
      updateOutputs();
      return;
    }
    if (path === "layout.count") {
      renderBarList();
      renderTester();
    } else if (/^preview\.statuses\.\d+\.2$/.test(path)) {
      const i = Number(path.split(".")[2]);
      const range = $(`[data-bind="preview.statuses.${i}.1"]`);
      if (range) range.max = String(Math.max(1, state.preview.statuses[i][2]));
    } else if (path.startsWith("characters.")) {
      updateCharNotes();
      fillPreviewSelect();
    }
    updateVisibility();
    updateOutputs();
  }

  function bindControls(root) {
    for (const el of root.querySelectorAll("[data-bind]")) {
      if (el.dataset.bound) continue;
      el.dataset.bound = "1";
      labelFor(el);
      const noHistory = el.hasAttribute("data-nohistory");
      const apply = commitAfter => () => {
        const value = readInput(el);
        if (typeof value === "number" && !Number.isFinite(value)) return;
        setPath(el.dataset.bind, value);
        afterChange(el.dataset.bind, el.type === "range" && !commitAfter);
        if (commitAfter) noHistory ? scheduleSave() : commit();
        requestRender();
      };
      if (el.type !== "number") el.addEventListener("input", apply(false));
      el.addEventListener("change", apply(true));
    }
  }

  function formatValue(value, fmt) {
    const r = Math.round(value * 100) / 100;
    switch (fmt) {
      case "pct": return Math.round(value * 100) + "%";
      case "px": return r + "px";
      case "sec": return value > 0 ? r + T("unit.sec") : T("unit.none");
      case "em": return r.toFixed(2);
      case "bars": return value + T("unit.bars");
      case "seg": return value > 1 ? value + T("unit.count") : T("unit.none");
      case "under": return value + T("unit.under");
      default: return String(r);
    }
  }

  function updateOutputs() {
    for (const out of $$("output[data-out]")) {
      const value = getPath(out.dataset.out);
      if (typeof value === "number") out.textContent = formatValue(value, out.dataset.fmt);
    }
  }

  // "a=x|y" : a is x or y.  "a!=x" : a is not x.  Joined with "&".
  // A "|" right after a value may also start a new clause: "name.style=plate|name.pos=avatar".
  function evalCondition(cond) {
    return cond.split("&").every(part => {
      const clauses = [];
      for (const piece of part.split("|")) {
        if (/^[\w.]+!?=/.test(piece)) clauses.push({ raw: piece, values: [] });
        else if (clauses.length) clauses[clauses.length - 1].values.push(piece);
      }
      return clauses.some(clause => {
        const m = clause.raw.match(/^([\w.]+)(!?=)(.*)$/);
        const hit = [m[3], ...clause.values].includes(String(getPath(m[1])));
        return m[2] === "=" ? hit : !hit;
      });
    });
  }

  function updateVisibility() {
    for (const el of $$("[data-show]")) el.hidden = !evalCondition(el.dataset.show);
  }

  function syncControls() {
    for (const el of $$("[data-bind]")) {
      const typing = el === document.activeElement && el.type === "text";
      if (typing) continue;
      const value = getPath(el.dataset.bind);
      if (value === undefined) continue;
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value;
    }
    for (const btn of $$("#bgSeg button")) btn.setAttribute("aria-pressed", String(btn.dataset.bg === state.preview.bg));
    $("#stage").className = "stage bg-" + state.preview.bg;
    $("#testInit").value = state.preview.initiative;
    updateVisibility();
    updateOutputs();
    updateHistoryButtons();
  }

  // ---------------------------------------------------------------- generated lists

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* 清單資料的第二欄存的是 i18n key（見 presets.v1.js）；未登錄的字串 T() 會原樣回傳，
   * 因此使用者自訂的名稱照樣能直接傳進來。 */
  function optionsHtml(list) {
    return list.map(([value, text]) => `<option value="${esc(value)}">${esc(T(text))}</option>`).join("");
  }

  function renderBarList() {
    const box = $("#barList");
    box.innerHTML = state.bars.slice(0, state.layout.count).map((b, i) => `
      <div class="bar-item">
        <span class="num">${i + 1}</span>
        <input type="text" data-bind="bars.${i}.label" placeholder="${esc(state.preview.statuses[i][0])}" aria-label="${esc(T("bars.aria.name", i + 1))}">
        <input type="color" data-bind="bars.${i}.c1" aria-label="${esc(T("bars.aria.color1", i + 1))}">
        <input type="color" data-bind="bars.${i}.c2" aria-label="${esc(T("bars.aria.color2", i + 1))}">
        <select data-bind="bars.${i}.icon" aria-label="${esc(T("bars.aria.icon", i + 1))}">${optionsHtml(P.ICONS)}</select>
        <input type="checkbox" data-bind="bars.${i}.low" aria-label="${esc(T("bars.aria.alert", i + 1))}">
      </div>`).join("");
    bindControls(box);
    syncControls();
  }

  function renderTester() {
    const box = $("#testRows");
    box.innerHTML = state.preview.statuses.slice(0, state.layout.count).map((s, i) => `
      <div class="test-row">
        <input type="text" data-bind="preview.statuses.${i}.0" data-nohistory aria-label="${esc(T("tester.aria.label", i + 1))}">
        <input type="range" data-bind="preview.statuses.${i}.1" data-nohistory min="0" max="${Math.max(1, s[2])}" step="1" aria-label="${esc(T("tester.aria.value", i + 1))}">
        <output data-out="preview.statuses.${i}.1"></output>
        <input type="number" data-bind="preview.statuses.${i}.2" data-nohistory min="1" max="9999" aria-label="${esc(T("tester.aria.max", i + 1))}">
      </div>`).join("");
    bindControls(box);
    syncControls();
  }

  // spec: [prop, label, type, min | options, max, step, fmt, showCondition]
  function decoControl(key, spec) {
    const [prop, label, type, min, max, step, fmt, show] = spec;
    const path = `decos.${key}.${prop}`;
    const row = `<div class="row"${show ? ` data-show="${esc(show)}"` : ""}>`;
    const text = T(label);
    if (type === "check") return `${row}<label></label><label class="check"><input type="checkbox" data-bind="${path}"> ${esc(text)}</label></div>`;
    if (type === "color") return `${row}<label>${esc(text)}</label><input type="color" data-bind="${path}"></div>`;
    if (type === "select") return `${row}<label>${esc(text)}</label><select data-bind="${path}">${optionsHtml(min)}</select></div>`;
    return `${row}<label>${esc(text)}</label><span class="with-value"><input type="range" data-bind="${path}" min="${min}" max="${max}" step="${step}">`
      + `<output data-out="${path}"${fmt ? ` data-fmt="${fmt}"` : ""}></output></span></div>`;
  }

  function renderDecoList() {
    $("#decoList").innerHTML = Object.entries(P.DECO_TYPES).map(([key, def]) => `
      <div class="deco">
        <label class="deco-head"><input type="checkbox" data-bind="decos.${key}.on"> ${esc(T(def.label))} <small>${esc(T(def.desc))}</small></label>
        <div data-show="decos.${key}.on=true">${def.controls.map(c => decoControl(key, c)).join("")}</div>
      </div>`).join("");
  }

  // ---------------------------------------------------------------- characters

  function renderCharList() {
    const box = $("#charList");
    box.innerHTML = state.characters.list.map((c, i) => `
      <div class="char" data-char="${esc(c.id)}">
        <div class="char-top">
          <input type="text" data-bind="characters.list.${i}.name" placeholder="${esc(T("chars.name.placeholder"))}" aria-label="${esc(T("chars.aria.name", i + 1))}">
          <input type="color" data-bind="characters.list.${i}.color" aria-label="${esc(T("chars.aria.color", i + 1))}">
          <button type="button" class="small danger" data-char-action="delete">${esc(T("action.delete"))}</button>
        </div>
        <input type="text" data-bind="characters.list.${i}.url" placeholder="${esc(T("chars.id.placeholder"))}" aria-label="${esc(T("chars.aria.id", i + 1))}">
        <div class="btns">
          <button type="button" data-char-action="css">${esc(T("export.copyCss"))}</button>
          <button type="button" data-char-action="url">${esc(T("chars.copyUrl"))}</button>
          <button type="button" data-char-action="preview">${esc(T("preview.label"))}</button>
        </div>
        <span class="warn" data-char-note></span>
      </div>`).join("");
    bindControls(box);
    syncControls();
    updateCharNotes();
  }

  function updateCharNotes() {
    const room = M.parseRoom(state.characters.room);
    for (const el of $$("[data-char]")) {
      const c = state.characters.list.find(x => x.id === el.dataset.char);
      if (!c) continue;
      const hasRoomInUrl = /rooms\//.test(c.url);
      let note = "";
      if (!M.parseCharacter(c.url)) note = T("chars.hint.needId");
      else if (!room && !hasRoomInUrl) note = T("chars.hint.needRoom");
      else if (!c.name.trim()) note = T("chars.hint.noName");
      el.querySelector("[data-char-note]").textContent = note;
    }
  }

  function fillPreviewSelect() {
    const select = $("#previewChar");
    const current = state.preview.character;
    select.innerHTML = "";
    select.add(new Option(T("preview.sample"), ""));
    for (const c of state.characters.list) select.add(new Option(c.name.trim() || T("chars.noName"), c.id));
    if (!state.characters.list.some(c => c.id === current)) state.preview.character = "";
    select.value = state.preview.character;
  }

  function currentChar() {
    return state.characters.list.find(c => c.id === state.preview.character) || null;
  }

  function charUrl(c) {
    return c ? M.characterUrl(state.characters.room, c.url) : "";
  }

  function onCharAction(ev) {
    const btn = ev.target.closest("[data-char-action]");
    if (!btn) return;
    const id = btn.closest("[data-char]").dataset.char;
    const index = state.characters.list.findIndex(c => c.id === id);
    const c = state.characters.list[index];
    if (!c) return;
    const action = btn.dataset.charAction;
    if (action === "delete") {
      state.characters.list.splice(index, 1);
      commit();
      renderCharList();
      fillPreviewSelect();
      requestRender();
    } else if (action === "url") {
      const url = charUrl(c);
      if (!url) { statusError("msg.needRoomAndId"); return; }
      copyText(url).then(ok => (ok ? status("msg.urlCopied", c.name || T("chars.noNameShort")) : statusError("msg.copyFailed")));
    } else if (action === "css" || action === "preview") {
      state.preview.character = c.id;
      fillPreviewSelect();
      renderNow();
      if (action === "css") copyCurrentCss();
    }
  }

  // ---------------------------------------------------------------- preview

  let renderQueued = false;

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderNow();
    });
  }

  function cssFor(c, size) {
    const sizeNote = size && !c ? T("size.fitsName", probeName().length) : "";
    return C.build(state, { name: c ? c.name : null, color: c ? c.color : null, url: charUrl(c), size, sizeNote });
  }

  function previewData(css) {
    return {
      css,
      statuses: state.preview.statuses.slice(0, state.layout.count),
      initiative: state.preview.initiative,
      avatar: previewAvatar,
    };
  }

  function renderNow() {
    if (!frameDoc) return;
    K.update(frameDoc, previewData(cssFor(currentChar(), null)));
    measureAndApply();
    // Web fonts change the size once they arrive.
    frameDoc.fonts.ready.then(measureAndApply);
  }

  // A registered character is sized for its own name. The sample is sized for a name of up to
  // probeName()'s length, since people paste the sample CSS and write their own name into it.
  function measureAndApply() {
    let size = K.measure(frameDoc);
    if (!currentChar()) {
      const real = frameDoc.getElementById("obs-custom").textContent;
      K.update(frameDoc, previewData(C.build(state, { name: probeName() })));
      const probe = K.measure(frameDoc);
      K.update(frameDoc, previewData(real));
      size = { w: Math.max(size.w, probe.w), h: Math.max(size.h, probe.h) };
    }
    applySize(size);
  }

  function applySize(size, force) {
    const changed = size.w !== lastSize.w || size.h !== lastSize.h;
    lastSize = size;
    const stage = $("#stage");
    const avail = Math.max(120, stage.clientWidth - 32);
    const k = Math.min(2, avail / size.w, 560 / size.h);
    if (changed || force) {
      const frame = $("#preview");
      frame.style.width = size.w + "px";
      frame.style.height = size.h + "px";
    }
    $("#frameBox").style.width = Math.round(size.w * k) + "px";
    $("#frameBox").style.height = Math.round(size.h * k) + "px";
    $("#preview").style.transform = `scale(${k})`;
    $("#stageInfo").textContent = T("stage.info", Math.round(k * 100));
    const hint = currentChar() ? "" : `<small style="color: var(--muted)">${esc(T("size.upToName", probeName().length))}</small>`;
    $("#sizeNote").innerHTML = T("size.note", size.w, size.h, hint);
    $("#cssOut").value = cssFor(currentChar(), size);
  }

  function setupFrame() {
    const frame = $("#preview");
    frame.style.width = "1200px";
    frame.style.height = "900px";
    frame.addEventListener("load", () => {
      frameDoc = frame.contentDocument;
      renderNow();
    });
    frame.srcdoc = K.documentHtml();
    new ResizeObserver(() => { if (frameDoc) applySize(lastSize, true); }).observe($("#stage"));
  }

  function testAction(kind) {
    const count = state.layout.count, at = state.alert.lowAt;
    state.preview.statuses.slice(0, count).forEach(s => {
      const max = Math.max(1, s[2]);
      if (kind === "-3") s[1] = Math.max(0, s[1] - 3);
      else if (kind === "+3") s[1] = Math.min(max, s[1] + 3);
      else if (kind === "half") s[1] = Math.round(max / 2);
      else if (kind === "low") s[1] = Math.max(0, Math.ceil(max * at / 100) - 1);
      else if (kind === "zero") s[1] = 0;
      else if (kind === "full") s[1] = max;
    });
    syncControls();
    scheduleSave();
    requestRender();
  }

  // ---------------------------------------------------------------- output

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function copyCurrentCss() {
    const c = currentChar();
    const css = cssFor(c, lastSize);
    copyText(css).then(ok => {
      if (!ok) { statusError("msg.copyCssFailed"); return; }
      const who = c ? T("msg.ofChar", c.name || T("chars.noNameShort")) : T("msg.ofSample");
      status("msg.cssCopied", who, lastSize.w, lastSize.h);
    });
  }

  function baseName() {
    return String(state.fileBase || "").replace(/[\\/:*?"<>|]/g, "_").trim() || "statusbar";
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function downloadCss() {
    const c = currentChar();
    const suffix = c && c.name.trim() ? "_" + c.name.trim().replace(/[\\/:*?"<>|\s]/g, "_") : "";
    const name = `${baseName()}${suffix}.css`;
    download(new Blob([cssFor(c, lastSize)], { type: "text/css" }), name);
    status("msg.saved", name);
  }

  // ---------------------------------------------------------------- history & saving

  function updateHistoryButtons() {
    $("#undo").disabled = !history.undo.length;
    $("#redo").disabled = !history.redo.length;
  }

  function commit() {
    const snap = JSON.stringify(state);
    if (snap === history.last) return;
    if (history.last !== null) {
      history.undo.push(history.last);
      if (history.undo.length > 150) history.undo.shift();
    }
    history.redo.length = 0;
    history.last = snap;
    updateHistoryButtons();
    scheduleSave();
  }

  // Preview values and the previewed character are not part of the design; keep them across undo.
  function restore(snap) {
    const preview = state.preview;
    state = JSON.parse(snap);
    state.preview = preview;
    history.last = snap;
    syncAll();
    scheduleSave();
  }

  function undo() {
    if (!history.undo.length) return;
    history.redo.push(history.last);
    restore(history.undo.pop());
  }

  function redo() {
    if (!history.redo.length) return;
    history.undo.push(history.last);
    restore(history.redo.pop());
  }

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (err) { /* storage may be blocked */ }
    }, 400);
  }

  function loadSaved() {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      return text ? M.normalize(JSON.parse(text)) : null;
    } catch (err) {
      return null;
    }
  }

  function loadState(next) {
    state = next;
    history.undo.length = 0;
    history.redo.length = 0;
    history.last = JSON.stringify(state);
    syncAll();
    scheduleSave();
  }

  function saveProject() {
    const data = { app: "ccf-statusbar-maker", version: 1, state };
    download(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }), baseName() + ".statusbar.json");
    status("msg.projectSaved");
  }

  async function openProjectFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== "ccf-statusbar-maker" || !data.state) throw new Error(T("msg.notProject"));
      loadState(M.normalize(data.state));
      status("msg.opened", file.name);
    } catch (err) {
      /* 例外自身的訊息沒有 key 可記，直接顯示。 */
      if (err instanceof SyntaxError) statusError("msg.readFailed");
      else { lastStatus = { key: "", args: [], isError: true }; $("#status").textContent = err.message; $("#status").classList.add("error"); }
    }
  }

  function syncAll() {
    $("#design").value = P.DESIGNS[state.design] ? state.design : "standard";
    showDesignDesc();
    renderBarList();
    renderTester();
    renderCharList();
    fillPreviewSelect();
    syncControls();
    requestRender();
  }

  // ---------------------------------------------------------------- setup

  function switchTab(name) {
    for (const btn of $$("[data-tab]")) btn.setAttribute("aria-selected", String(btn.dataset.tab === name));
    for (const panel of $$("[data-tab-panel]")) panel.hidden = panel.dataset.tabPanel !== name;
    try { localStorage.setItem(TAB_KEY, name); } catch (err) { /* storage may be blocked */ }
  }

  function showDesignDesc() {
    const d = P.DESIGNS[$("#design").value];
    $("#designDesc").textContent = d ? T(d.desc) + T("design.applyNote") : "";
  }

  function buildStaticUI() {
    const design = $("#design");
    design.innerHTML = optionsHtml(Object.entries(P.DESIGNS).map(([key, d]) => [key, d.label]));
    for (const select of $$("select[data-options]")) {
      const source = P[select.dataset.options];
      const list = Array.isArray(source) ? source : Object.entries(source).map(([key, v]) => [key, v.label]);
      select.innerHTML = optionsHtml(list);
    }
    renderDecoList();
    bindControls(document);
  }

  function wireEvents() {
    for (const btn of $$("[data-tab]")) btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    $("#design").addEventListener("change", showDesignDesc);
    $("#applyDesign").addEventListener("click", () => {
      const key = $("#design").value;
      M.applyDesign(state, key);
      commit();
      syncAll();
      status("msg.designApplied", T(P.DESIGNS[key].label));
    });
    $("#undo").addEventListener("click", undo);
    $("#redo").addEventListener("click", redo);
    document.addEventListener("keydown", ev => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.target.matches("input[type=text], textarea")) return;
      const key = ev.key.toLowerCase();
      if (key === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); }
      else if (key === "y" || (key === "z" && ev.shiftKey)) { ev.preventDefault(); redo(); }
    });

    for (const btn of $$("#bgSeg button")) {
      btn.addEventListener("click", () => {
        state.preview.bg = btn.dataset.bg;
        syncControls();
        scheduleSave();
      });
    }
    $("#previewChar").addEventListener("change", ev => {
      state.preview.character = ev.target.value;
      scheduleSave();
      requestRender();
    });
    for (const btn of $$("[data-test]")) btn.addEventListener("click", () => testAction(btn.dataset.test));
    $("#testInit").addEventListener("input", ev => {
      const v = Math.max(0, Math.min(99, Math.round(Number(ev.target.value)) || 0));
      state.preview.initiative = v;
      scheduleSave();
      requestRender();
    });
    $("#pickAvatar").addEventListener("click", () => { $("#avatarFile").value = ""; $("#avatarFile").click(); });
    $("#avatarFile").addEventListener("change", ev => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        previewAvatar = reader.result;
        requestRender();
        status("msg.avatarSwapped");
      };
      reader.readAsDataURL(file);
    });

    $("#copyCss").addEventListener("click", copyCurrentCss);
    $("#downloadCss").addEventListener("click", downloadCss);
    $("#addChar").addEventListener("click", () => {
      state.characters.list.push(M.newCharacter(state.characters.list.length));
      commit();
      renderCharList();
      fillPreviewSelect();
      const inputs = $$("#charList [data-bind$='.name']");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    $("#charList").addEventListener("click", onCharAction);

    $("#saveProject").addEventListener("click", saveProject);
    $("#openProject").addEventListener("click", () => { $("#projectFile").value = ""; $("#projectFile").click(); });
    $("#projectFile").addEventListener("change", ev => { if (ev.target.files[0]) openProjectFile(ev.target.files[0]); });
    $("#resetAll").addEventListener("click", () => {
      if (!confirm(T("confirm.reset"))) return;
      previewAvatar = null;
      loadState(M.defaultState());
      status("msg.reset");
    });
  }

  /* 切換語言：靜態標記由 i18n 引擎處理，這裡重繪由 JS 產生的選項、清單與訊息。 */
  function relabelUI() {
    buildStaticUI();
    syncAll();
    updateCharNotes();
    renderStatus();
  }

  function init() {
    I18N.mountSwitcher($("#localeSelect"));
    I18N.onChange(relabelUI);
    buildStaticUI();
    wireEvents();
    let tab = "layout";
    try { tab = localStorage.getItem(TAB_KEY) || tab; } catch (err) { /* storage may be blocked */ }
    switchTab($$("[data-tab]").some(b => b.dataset.tab === tab) ? tab : "layout");
    loadState(loadSaved() || M.defaultState());
    setupFrame();
    status("msg.ready");
  }

  init();
})();
