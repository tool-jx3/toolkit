"use strict";

(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  function normalize(value) {
    if (!value || typeof value !== "object") return null;
    const width = clamp(finite(value.width, 1), .02, 1);
    const height = clamp(finite(value.height, 1), .02, 1);
    return { x: clamp(finite(value.x, 0), 0, 1 - width), y: clamp(finite(value.y, 0), 0, 1 - height), width, height };
  }
  function draw(ctx, image, rect, crop, fit = "contain") {
    const region = normalize(crop) || { x: 0, y: 0, width: 1, height: 1 };
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    if (!iw || !ih) return;
    const sw = region.width * iw, sh = region.height * ih;
    const ratio = fit === "cover" ? Math.max(rect.width / sw, rect.height / sh) : Math.min(rect.width / sw, rect.height / sh);
    const dw = sw * ratio, dh = sh * ratio;
    const dx = rect.x + (rect.width - dw) / 2, dy = rect.y + (rect.height - dh) / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
    ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
    // Draw the whole source at its destination size. SVGs without explicit
    // dimensions may use a different source viewport in the nine-argument form.
    ctx.drawImage(image, dx - region.x * iw * ratio, dy - region.y * ih * ratio, iw * ratio, ih * ratio);
    ctx.restore();
  }
  let dialog, current, draft, drag;
  const $ = selector => dialog.querySelector(selector);
  function build() {
    dialog = document.createElement("dialog");
    dialog.id = "cropEditor";
    dialog.className = "crop-editor";
    dialog.setAttribute("aria-labelledby", "cropEditorTitle");
    dialog.innerHTML = `
      <header class="crop-header"><div><h2 id="cropEditorTitle">${T("crop.title", T("crop.target.main"))}</h2><p id="cropCharacterName"></p></div><button type="button" class="icon-button" data-crop-action="cancel" aria-label="${T("crop.close")}">×</button></header>
      <p class="help-text" id="cropEditorDescription">${T("crop.desc") + T("crop.desc.keepList")}</p>
      <div class="crop-workspace">
        <div class="crop-source-area"><div class="crop-stage"><img id="cropSourceImage" alt="${T("crop.sourceAlt")}" draggable="false"><div id="cropSelection" class="crop-selection" tabindex="0" role="group" aria-label="${T("crop.selectionAria", T("crop.target.main"))}">
          ${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(handle => `<span class="crop-handle" data-crop-handle="${handle}" aria-hidden="true"></span>`).join("")}
        </div></div></div>
        <div class="crop-result"><strong id="cropPreviewTitle">${T("crop.previewTitle", T("crop.target.main"))}</strong><canvas id="cropPreviewCanvas"></canvas><p class="help-text" id="cropPreviewDescription">${T("crop.previewDesc", T("crop.short.main"))}</p></div>
      </div>
      <div class="crop-coordinate-grid">
        ${[["x", "crop.field.x"], ["y", "crop.field.y"], ["width", "crop.field.w"], ["height", "crop.field.h"]].map(([key, labelKey]) => `<label class="field compact"><span>${T(labelKey)} (%)</span><input type="number" data-crop-field="${key}" min="${key === "width" || key === "height" ? 2 : 0}" max="100" step="0.1"></label>`).join("")}
      </div>
      <div class="crop-tools"><button type="button" class="button ghost small" data-crop-action="ratio">${T("crop.fitRatio", T("crop.short.main"))}</button><button type="button" class="button ghost small" data-crop-action="reset">${T("crop.resetAll")}</button><span class="help-text">${T("crop.copyNote")}</span></div>
      <p class="help-text" id="cropApplyNote" hidden>${T("crop.applyNote")}</p>
      <footer class="crop-actions"><button type="button" class="button ghost" data-crop-action="cancel">${T("crop.cancel")}</button><button type="button" class="button secondary" data-crop-action="apply-all">${T("crop.applyAll")}</button><button type="button" class="button primary" data-crop-action="apply">${T("crop.applyOne")}</button></footer>`;
    document.body.append(dialog);
    dialog.addEventListener("click", event => {
      const action = event.target.closest("[data-crop-action]")?.dataset.cropAction;
      if (action === "cancel") close();
      if (action === "reset") { draft = null; refresh(); }
      if (action === "ratio") {
        const sourceAspect = current.image.naturalWidth / current.image.naturalHeight;
        const normalizedAspect = current.aspect / sourceAspect;
        const width = Math.min(1, normalizedAspect), height = Math.min(1, 1 / normalizedAspect);
        draft = normalize({ x: (1 - width) / 2, y: (1 - height) / 2, width, height }); refresh();
      }
      if (action === "apply" || action === "apply-all") {
        current.onApply(normalize(draft), action === "apply-all"); close();
      }
    });
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("input", event => {
      const key = event.target.dataset.cropField;
      if (!key) return;
      const next = { ...(draft || { x: 0, y: 0, width: 1, height: 1 }) };
      next[key] = Number(event.target.value) / 100;
      if (key === "x") next.x = clamp(next.x, 0, 1 - next.width);
      if (key === "y") next.y = clamp(next.y, 0, 1 - next.height);
      draft = normalize(next); refresh(event.target);
    });
    dialog.addEventListener("change", event => { if (event.target.dataset.cropField) refresh(); });
    $("#cropSelection").addEventListener("keydown", event => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!direction) return;
      event.preventDefault();
      const value = draft || { x: 0, y: 0, width: 1, height: 1 };
      const step = event.shiftKey ? .05 : .005;
      draft = normalize({ ...value, x: value.x + direction[0] * step, y: value.y + direction[1] * step }); refresh();
    });
    $("#cropSelection").addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const box = $(".crop-stage").getBoundingClientRect();
      drag = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, box,
        handle: event.target.dataset.cropHandle || "move", start: { ...(draft || { x: 0, y: 0, width: 1, height: 1 }) } };
      $("#cropSelection").focus({ preventScroll: true });
      $("#cropSelection").setPointerCapture(event.pointerId);
    });
    $("#cropSelection").addEventListener("pointermove", event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      const dx = (event.clientX - drag.clientX) / drag.box.width, dy = (event.clientY - drag.clientY) / drag.box.height;
      const { start, handle } = drag;
      if (handle === "move") draft = normalize({ ...start, x: start.x + dx, y: start.y + dy });
      else {
        let left = start.x, top = start.y, right = left + start.width, bottom = top + start.height;
        if (handle.includes("w")) left = clamp(start.x + dx, 0, right - .02);
        if (handle.includes("e")) right = clamp(start.x + start.width + dx, left + .02, 1);
        if (handle.includes("n")) top = clamp(start.y + dy, 0, bottom - .02);
        if (handle.includes("s")) bottom = clamp(start.y + start.height + dy, top + .02, 1);
        draft = normalize({ x: left, y: top, width: right - left, height: bottom - top });
      }
      refresh();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) $("#cropSelection").addEventListener(type, () => { drag = null; });
  }
  function refresh(activeInput) {
    const value = draft || { x: 0, y: 0, width: 1, height: 1 };
    Object.assign($("#cropSelection").style, { left: `${value.x * 100}%`, top: `${value.y * 100}%`, width: `${value.width * 100}%`, height: `${value.height * 100}%` });
    for (const input of dialog.querySelectorAll("[data-crop-field]")) if (input !== activeInput) input.value = String(Math.round(value[input.dataset.cropField] * 1000) / 10);
    const canvas = $("#cropPreviewCanvas");
    canvas.width = Math.round(320 * Math.min(1, current.aspect));
    canvas.height = Math.round(320 / Math.max(1, current.aspect));
    draw(canvas.getContext("2d"), current.image, { x: 0, y: 0, width: canvas.width, height: canvas.height }, draft, current.fit);
  }
  function close() { dialog.close(); current = null; drag = null; }
  function open(options) {
    if (!dialog) build();
    current = options;
    current.aspect = Math.max(.05, Math.min(20, options.aspect || 1));
    const isList = options.target === "list";
    const label = T(isList ? "crop.target.list" : "crop.target.main");
    const shortLabel = T(isList ? "crop.short.list" : "crop.short.main");
    dialog.dataset.cropTarget = isList ? "list" : "main";
    $("#cropEditorTitle").textContent = T("crop.title", label);
    $("#cropEditorDescription").textContent = T("crop.desc")
      + T(isList ? "crop.desc.keepMain" : "crop.desc.keepList");
    $("#cropSelection").setAttribute("aria-label", T("crop.selectionAria", label));
    $("#cropPreviewTitle").textContent = T("crop.previewTitle", label);
    $("#cropPreviewDescription").textContent = T("crop.previewDesc", shortLabel);
    $('[data-crop-action="ratio"]').textContent = T("crop.fitRatio", shortLabel);
    $("#cropApplyNote").hidden = !isList;
    draft = normalize(options.crop);
    $("#cropCharacterName").textContent = options.name;
    $("#cropSourceImage").src = options.src;
    const ratio = options.image.naturalWidth / options.image.naturalHeight;
    $(".crop-stage").style.width = `min(100%, ${ratio * 42}vh)`;
    $(".crop-stage").style.aspectRatio = String(ratio);
    dialog.showModal(); refresh();
  }
  globalThis.StudioCrop = Object.freeze({ normalize, draw, open });
})();
