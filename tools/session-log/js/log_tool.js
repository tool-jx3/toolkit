(function(){
  const STORAGE_KEY = "sessionLogTool.state.v1";
  const APP_VERSION = "v1.99";
  const REPORT_GENERATOR_URL = "../session-report/";
  const REPORT_PENDING_IMPORT_KEY = "trpgWebTools.sessionReportGenerator.pendingImport";
  const SELF_NAMES_KEY = "sessionLogTool.selfNames.v1";
  // 「自己」是繁中版範例資料裡代表自己的名字（對應上游的「自分」）
  const DEFAULT_SELF_NAMES = ["自分", "自分自身", "自己", "GM", "KP", "DL", "くま。", "Kuma", "KumachanSteps"];
  const SYSTEM_OPTIONS = ["CoC 7版", "CoC 6版", "エモクロア", "マダミス"];
  const ROLE_OPTIONS = ["PL", "KP", "GM", "DL"];
  const STATUS_OPTIONS = ["新規", "継続", "完結", "中止", "予定"];
  const SURVIVAL_OPTIONS = ["", "生還", "ロスト", "全生還", "全ロスト", "継続", "不明"];
  // 系統、狀態、生還欄存檔用的正規值沿用上游日文（存檔與 JSON 格式不變，兩種語言匯出的
  // 檔案可以互相讀入），畫面上再依目前語言換成字典裡的名稱。
  const SYSTEM_LABEL_KEYS = {
    "CoC 7版": "system.coc7",
    "CoC 6版": "system.coc6",
    "エモクロア": "system.emoklore",
    "マダミス": "system.madamisu",
    "シノビガミ": "system.shinobigami",
    "インセイン": "system.insane",
    "ダブルクロス The 3rd Edition": "system.doubleCross",
    "ソード・ワールド2.5": "system.swordWorld",
    "フタリソウサ": "system.futariSousa"
  };
  const STATUS_LABEL_KEYS = { "新規": "status.new", "継続": "status.continue", "完結": "status.done", "中止": "status.cancelled", "予定": "status.planned" };
  const SURVIVAL_LABEL_KEYS = { "生還": "survival.survived", "ロスト": "survival.lost", "全生還": "survival.allSurvived", "全ロスト": "survival.allLost", "継続": "survival.continue", "不明": "survival.unknown" };
  const COLUMN_DEFAULT_WIDTHS = {
    reported: 78,
    fav: 72,
    date: 136,
    scenario: 310,
    system: 124,
    role: 96,
    gm: 124,
    players: 170,
    pc: 170,
    status: 120,
    time: 84,
    note: 250,
    report: 116
  };
  const COLUMN_MIN_WIDTHS = {
    reported: 66,
    fav: 56,
    date: 112,
    scenario: 180,
    system: 108,
    role: 78,
    gm: 96,
    players: 110,
    pc: 110,
    status: 108,
    time: 72,
    note: 160,
    report: 116
  };
  const TABLE_TEXT_LIMITS = { scenario: 30, players: 15, pc: 15, note: 20 };
  const TABLE_TEXT_LIMIT_MAX = { scenario: 80, players: 60, pc: 60, note: 80 };

  // 範例資料依「建立當下」的語言產生；建立後就是使用者的資料，不再跟著語言變。
  function createDefaultRows(){
    const coPlayers = (...numbers)=>numbers.map(n=>T("sample.coplayer", n)).join("、");
    const investigators = (...letters)=>letters.map(l=>T("sample.investigator", l)).join(" / ");
    return [
      { id: cryptoId(), sample: true, date: "2026-05-13", dates: ["2026-05-13"], scenario: T("sample.scenario", "A"), system: "CoC 6版", role: "PL", gm: T("sample.gm"), players: coPlayers(1, 2), pc: investigators("A"), status: "新規", time: "4h", note: T("sample.noteA"), longNote: T("sample.longNote") },
      { id: cryptoId(), sample: true, date: "2026-04-20", dates: ["2026-04-20"], scenario: T("sample.scenario", "B"), system: "CoC 7版", role: "KP", gm: T("sample.self"), players: coPlayers(3, 4, 5), pc: investigators("B", "C", "D"), status: "新規", time: "5h", note: T("sample.noteB"), longNote: "" },
      { id: cryptoId(), sample: true, date: "2026-03-15", dates: ["2026-03-15"], scenario: T("sample.scenario", "C"), system: "エモクロア", role: "DL", gm: T("sample.self"), players: coPlayers(6, 7), pc: ["A", "B"].map(l=>T("sample.resonator", l)).join(" / "), status: "継続", time: "3.5h", note: T("sample.noteC"), longNote: "" },
      { id: cryptoId(), sample: true, date: "2026-02-28", dates: ["2026-02-28"], scenario: T("sample.campaign"), system: "マダミス", role: "PL", gm: T("sample.gm"), players: coPlayers(8, 9, 10), pc: "PC-E", status: "継続", time: "6h", note: T("sample.noteD"), longNote: "" }
    ];
  }
  // 欄位名稱用 getter 在使用時才取字典，切換語言後會跟著換。
  const defaultColumns = [
    { key: "reported", get label(){ return T("col.report"); }, locked: true, hideFixedLabel: true },
    { key: "date", get label(){ return T("col.date"); }, type: "date" },
    { key: "scenario", get label(){ return T("col.scenario"); } },
    { key: "system", get label(){ return T("col.system"); } },
    { key: "role", get label(){ return T("col.role"); } },
    { key: "gm", label: "GM" },
    { key: "players", label: "PL" },
    { key: "pc", label: "PC" },
    { key: "status", get label(){ return T("col.status"); } },
    { key: "time", get label(){ return T("col.time"); } },
    { key: "note", get label(){ return T("col.note"); } },
    { key: "report", get label(){ return T("col.report"); }, locked: true }
  ];

  const optionalColumns = [
    { key: "fav", get label(){ return T("col.fav"); }, get desc(){ return T("col.favDesc"); } },
    { key: "ho", label: "HO", get desc(){ return T("col.hoDesc"); } },
    { key: "ending", get label(){ return T("col.ending"); }, get desc(){ return T("col.endingDesc"); } },
    { key: "survival", get label(){ return T("col.survival"); }, get desc(){ return T("col.survivalDesc"); } },
    { key: "campaign", get label(){ return T("col.campaign"); }, get desc(){ return T("col.campaignDesc"); } },
    { key: "hashtag", get label(){ return T("col.hashtag"); }, get desc(){ return T("col.hashtagDesc"); } },
    { key: "sessionUrl", get label(){ return T("col.sessionUrl"); }, get desc(){ return T("col.sessionUrlDesc"); } },
    { key: "scenarioUrl", get label(){ return T("col.scenarioUrl"); }, get desc(){ return T("col.scenarioUrlDesc"); } },
    { key: "kansouUrl", get label(){ return T("col.kansouUrl"); }, get desc(){ return T("col.kansouUrlDesc"); } }
  ];

  let state = loadState();
  let activeId = state.rows[0]?.id || null;
  let draggingKey = null;
  let dragOverKey = null;
  let dragInsertSide = "before";
  let resizingColumn = null;
  let editingId = null;
  const EXPORT_MODES = ["all", "system", "role", "sessions"];
  let exportMode = "all";
  let exportQuery = "";

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init(){
    collectElements();
    I18N.mountSwitcher(document.getElementById("localeSelect"));
    bindEvents();
    renderAll();
    exposeApi();
    I18N.onChange(handleLocaleChange);
  }

  // 切換語言：重畫所有由程式產生的文字（對話框是強制回應視窗，開著時無法切換語言）
  function handleLocaleChange(){
    if(els.exportCopyBtn){
      clearTimeout(els.exportCopyBtn._flashTimer);
      delete els.exportCopyBtn.dataset.originalLabel;
    }
    renderAll();
  }

  // 正規值 → 目前語言的顯示名稱；不在清單裡的（使用者自己輸入的）原樣顯示
  function labelFor(map, value){
    const key = map[value];
    return key ? T(key) : (value || "");
  }

  // 任一語言的顯示名稱 → 正規值（例如在繁中版輸入「謀殺之謎」會存成上游的正規值）
  function canonicalFor(map, value){
    const text = String(value == null ? "" : value).trim();
    if(!text || Object.prototype.hasOwnProperty.call(map, text)) return value;
    for(const [canonical, key] of Object.entries(map)){
      if(Object.values(I18N.messages).some(table=>table[key] === text)) return canonical;
    }
    return value;
  }

  function collectElements(){
    ["tableHead","tableBody","searchInput","systemFilter","roleFilter","sortSelect","toggleFieldPanelBtn","toggleRemoveFieldPanelBtn","fieldPanel","removeFieldPanel","closeFieldPanelBtn","closeRemoveFieldPanelBtn","optionalFieldsList","visibleFieldsList","createCustomFieldBtn","resetFieldsBtn","jsonFileInput","importJsonBtn","exportJsonBtn","exportTextBtn","importDialog","closeImportDialogBtn","cancelImportBtn","runImportBtn","selfNameInput","downloadTemplateBtn","sheetFileInput","pickSheetFileBtn","sheetFileName","sheetPasteInput","sheetPasteWrap","sheetGridArea","sheetGrid","sheetGridCount","sheetAddRowBtn","sheetShowPasteBtn","importPreviewArea","importPreviewCount","importPreviewTable","sheetParseMsg","reportPasteInput","reportParseMsg","ccfoliaFileInput","pickCcfoliaBtn","ccfoliaFileName","ccfoliaForm","ccScenario","ccDate","ccSystem","ccRole","ccGm","ccPl","ccSpeakers","ccToSheetBtn","ccfoliaParseMsg","pickJsonBtn","jsonFileName","dupSkipInput","dupSkipWrap","textExportOutput","exportSearchInput","exportSearchClearBtn","exportCopyBtn","exportSearchHint","sampleNotice","clearSamplesBtn","kansouTab","drawerOverlay","kansouDrawer","drawerContent","closeDrawerBtn","drawerFooter","drawerSaveBtn","drawerCloseBtn2","drawerToReportBtn","sessionDialog","sessionForm","sessionFormFields","longNoteInput","sessionDialogTitle","deleteSessionBtn","addSessionTopBtn","floatingAddBtn","shortcutPanel"].forEach(id=>{
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents(){
    els.searchInput.addEventListener("input", renderTable);
    els.systemFilter.addEventListener("change", renderTable);
    els.roleFilter.addEventListener("change", renderTable);
    els.sortSelect.addEventListener("change", renderTable);
    els.toggleFieldPanelBtn.addEventListener("click",()=>toggleFieldPanel("add"));
    els.toggleRemoveFieldPanelBtn.addEventListener("click",()=>toggleFieldPanel("remove"));
    els.closeFieldPanelBtn.addEventListener("click",()=>{ els.fieldPanel.hidden = true; });
    els.closeRemoveFieldPanelBtn.addEventListener("click",()=>{ els.removeFieldPanel.hidden = true; });
    document.querySelector(".table-scroll")?.addEventListener("scroll", updateReportStickyState);
    document.getElementById("usageHelpBtn")?.addEventListener("click",()=>toggleHelpPanel("usagePanel"));
    document.getElementById("closeUsageBtn")?.addEventListener("click",()=>toggleHelpPanel("usagePanel", false));
    document.getElementById("themeToggleBtn")?.addEventListener("click",()=>document.body.classList.toggle("night-mode"));
    document.addEventListener("keydown", event=>{ if(event.key === "Escape") closePopups(); });
    els.createCustomFieldBtn.addEventListener("click", createCustomField);
    els.resetFieldsBtn.addEventListener("click",()=>{ state.columns = clone(defaultColumns); state.hiddenColumns = []; saveAndRender(); });
    els.importJsonBtn.addEventListener("click", openImportDialog);
    els.jsonFileInput.addEventListener("change", handleJsonFilePicked);
    els.exportJsonBtn.addEventListener("click", exportJson);
    els.closeImportDialogBtn?.addEventListener("click",()=>els.importDialog.close());
    els.cancelImportBtn?.addEventListener("click",()=>els.importDialog.close());
    els.runImportBtn?.addEventListener("click", runImport);
    els.pickJsonBtn?.addEventListener("click",()=>els.jsonFileInput.click());
    els.downloadTemplateBtn?.addEventListener("click", downloadImportTemplate);
    els.selfNameInput?.addEventListener("change",()=>{ setSelfNames(els.selfNameInput.value); refreshActivePreview(); });
    els.sheetPasteInput?.addEventListener("input", scheduleSheetParse);
    els.reportPasteInput?.addEventListener("input", scheduleReportParse);
    els.pickCcfoliaBtn?.addEventListener("click",()=>els.ccfoliaFileInput.click());
    els.ccfoliaFileInput?.addEventListener("change", handleCcfoliaFiles);
    ["ccScenario", "ccDate", "ccSystem", "ccRole", "ccGm", "ccPl"].forEach(id=>els[id]?.addEventListener("input", renderCcfoliaPreview));
    els.ccSpeakers?.addEventListener("change", event=>{
      const select = event.target.closest("select[data-speaker]");
      if(!select) return;
      const sp = importCcfolia.speakers[Number(select.dataset.speaker)];
      if(sp) sp.role = select.value;
      syncCcfoliaFieldsFromSpeakers();
      renderCcfoliaPreview();
    });
    els.ccToSheetBtn?.addEventListener("click", convertCcfoliaToSheet);
    els.sheetGrid?.addEventListener("change", event=>{
      const select = event.target.closest("select.sg-map");
      if(!select) return;
      importSheet.mapping[Number(select.dataset.col)] = select.value;
      renderSheetGrid();
    });
    els.sheetGrid?.addEventListener("input", event=>{
      const td = event.target.closest("td[contenteditable]");
      if(!td) return;
      const r = Number(td.dataset.row), c = Number(td.dataset.col);
      if(importSheet.rows[r]) importSheet.rows[r][c] = td.textContent.replace(/\s+/g, " ").trim();
      scheduleSheetSummary();
    });
    els.sheetGrid?.addEventListener("click", event=>{
      const del = event.target.closest(".sg-del");
      if(!del) return;
      importSheet.rows.splice(Number(del.dataset.row), 1);
      renderSheetGrid();
    });
    els.sheetAddRowBtn?.addEventListener("click",()=>{
      importSheet.rows.push(new Array(importSheet.columns.length).fill(""));
      renderSheetGrid();
    });
    els.sheetShowPasteBtn?.addEventListener("click", showSheetPaste);
    els.dupSkipInput?.addEventListener("change", refreshActivePreview);
    document.querySelectorAll('input[name="importTarget"]').forEach(radio=>radio.addEventListener("change", refreshActivePreview));
    els.importDialog?.querySelectorAll(".import-tab").forEach(tab=>tab.addEventListener("click",()=>switchImportTab(tab.dataset.importTab)));
    els.importDialog?.addEventListener("close", resetImportState);
    els.exportModeButtons = [...document.querySelectorAll("[data-export-mode]")];
    els.exportModeButtons.forEach(btn=>btn.addEventListener("click",()=>setExportMode(btn.dataset.exportMode)));
    els.exportTextBtn.addEventListener("click",()=>{
      renderExport();
      els.textExportOutput?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    els.exportSearchInput?.addEventListener("input",()=>{ exportQuery = els.exportSearchInput.value; renderExport(); });
    els.exportSearchClearBtn?.addEventListener("click",()=>{
      exportQuery = "";
      if(els.exportSearchInput) els.exportSearchInput.value = "";
      renderExport();
      els.exportSearchInput?.focus();
    });
    els.exportCopyBtn?.addEventListener("click", copyExportOutput);
    els.kansouTab.addEventListener("click", openDrawer);
    els.closeDrawerBtn.addEventListener("click", closeDrawer);
    els.drawerOverlay.addEventListener("click", closeDrawer);
    els.drawerSaveBtn?.addEventListener("click",()=>{
      saveState(); renderStats(); updateSampleNotice(); renderTable(); renderExport(); showLogToast(T("drawer.saved"));
    });
    els.drawerCloseBtn2?.addEventListener("click",()=>{ saveState(); renderAll(); closeDrawer(); });
    els.drawerToReportBtn?.addEventListener("click",()=>{
      const row = state.rows.find(r=>r.id === activeId);
      saveState();
      if(row) openReportGenerator(row);
    });
    els.addSessionTopBtn?.addEventListener("click",()=>openSessionDialog());
    els.floatingAddBtn?.addEventListener("click",()=>openSessionDialog());
    els.clearSamplesBtn?.addEventListener("click", clearSampleRows);
    els.pickSheetFileBtn?.addEventListener("click",()=>els.sheetFileInput?.click());
    els.sheetFileInput?.addEventListener("change", handleSheetFile);
    els.sessionForm.addEventListener("submit", handleSessionSave);
    els.sessionForm.addEventListener("click", handleDateFieldClick);
    els.sessionForm.addEventListener("change", handleSessionFormChange);
    document.getElementById("closeSessionDialogBtn")?.addEventListener("click",()=>els.sessionDialog.close());
    els.deleteSessionBtn.addEventListener("click", deleteEditingSession);
  }

  function renderAll(){
    normalizeState();
    renderFilters();
    renderOptionalFields();
    renderVisibleFields();
    renderStats();
    updateSampleNotice();
    renderTable();
    renderDrawer();
    renderExport();
  }

  function normalizeState(){
    if(!Array.isArray(state.columns)) state.columns = clone(defaultColumns);
    if(!Array.isArray(state.hiddenColumns)) state.hiddenColumns = [];
    if(!Array.isArray(state.customColumns)) state.customColumns = [];

    state.columns = state.columns.map(col=>{
      const normalized = { ...col, label: getColumnLabel(col) };
      normalized.width = clampColumnWidth(normalized.key, Number(normalized.width) || COLUMN_DEFAULT_WIDTHS[normalized.key] || 140);
      return normalized;
    });

    if(!state.migrations?.v14ColumnWidths){
      state.columns = state.columns.map(col=>{
        if(["scenario","players","pc","note"].includes(col.key)){
          return { ...col, width: COLUMN_DEFAULT_WIDTHS[col.key] };
        }
        return col;
      });
      state.migrations = { ...(state.migrations || {}), v14ColumnWidths: true };
      saveState();
    }

    state.rows.forEach(row=>{
      normalizeRowDates(row);
      if(row.system === "エモクロアTRPG") row.system = "エモクロア";
      if(row.system === "マルチシステム") row.system = "マダミス";
      if(row.role && normalizeRoleGroup(row.role) === "GM" && !ROLE_OPTIONS.includes(row.role)) row.role = "GM";
    });

    if(!state.migrations?.hashtagOptional){
      state.columns = state.columns.filter(col=>col.key !== "hashtag");
      state.migrations = { ...(state.migrations || {}), hashtagOptional: true };
      saveState();
    }
    if(!state.migrations?.reportedColumn){
      if(!state.columns.some(col=>col.key === "reported")){
        state.columns.unshift({ key: "reported", label: T("col.report"), locked: true, hideFixedLabel: true, width: COLUMN_DEFAULT_WIDTHS.reported });
      }
      state.rows.forEach(row=>{ if(typeof row.reported === "undefined") row.reported = false; });
      state.migrations = { ...(state.migrations || {}), reportedColumn: true };
      saveState();
    }
    if(!state.migrations?.timeUnitStripped){
      state.rows.forEach(row=>{ if(row.time) row.time = normalizeTimeValue(row.time); });
      state.migrations = { ...(state.migrations || {}), timeUnitStripped: true };
      saveState();
    }
    if(!state.rows.length){
      state.rows = [];
      activeId = null;
    } else if(!activeId || !state.rows.some(row=>row.id===activeId)){
      activeId = state.rows[0].id;
    }
  }

  function renderFilters(){
    const systemValue = els.systemFilter.value;
    const roleValue = els.roleFilter.value;
    const systems = unique([...SYSTEM_OPTIONS, ...state.rows.map(row=>row.system).filter(Boolean)]);
    els.systemFilter.innerHTML = `<option value="">${T("filter.allSystems")}</option>` + systems.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(labelFor(SYSTEM_LABEL_KEYS, v))}</option>`).join("");
    els.roleFilter.innerHTML = `
      <option value="">${T("filter.allRoles")}</option>
      <option value="PL">PL</option>
      <option value="GM">GM / KP / DL</option>
    `;
    els.systemFilter.value = systems.includes(systemValue) ? systemValue : "";
    els.roleFilter.value = ["", "PL", "GM"].includes(roleValue) ? roleValue : "";
  }

  function nonSampleRows(){ return state.rows.filter(row=>!row.sample); }

  function renderStats(){
    const rows = nonSampleRows();
    animateStat("statSessions", countSessionDates(rows));
    animateStat("statScenarios", countUniqueScenarios(rows));
    animateStat("statPlayedTime", sumHours(rows), "h");
    animateStat("statPlayedWith", countCoPlayers(rows));
  }

  function updateSampleNotice(){
    if(!els.sampleNotice) return;
    const n = state.rows.filter(row=>row.sample).length;
    els.sampleNotice.hidden = !n;
    const label = els.sampleNotice.querySelector("span");
    if(label) label.textContent = T("sample.notice", n);
  }

  async function handleSheetFile(event){
    const file = event.target.files && event.target.files[0];
    if(!file) return;
    if(els.sheetFileName) els.sheetFileName.textContent = file.name;
    try{
      const text = await file.text();
      if(els.sheetPasteInput) els.sheetPasteInput.value = text;
      if(els.sheetPasteWrap) els.sheetPasteWrap.hidden = false;
      parseSheetInput();
    }catch(_error){
      if(els.sheetParseMsg){ els.sheetParseMsg.hidden = false; els.sheetParseMsg.textContent = T("import.fileReadError"); }
    }
    event.target.value = "";
  }

  function clearSampleRows(){
    const removed = state.rows.filter(row=>row.sample).map(row=>row.id);
    if(!removed.length) return;
    state.rows = state.rows.filter(row=>!row.sample);
    if(removed.includes(activeId)) activeId = state.rows[0]?.id || null;
    saveAndRender();
  }

  function animateStat(id, target, suffix=""){
    const el = document.getElementById(id);
    if(!el) return;
    const numericTarget = Number(target) || 0;
    const last = Number(el.dataset.lastTarget);
    if(last === numericTarget && el.textContent) return;
    el.dataset.lastTarget = String(numericTarget);
    const duration = 700;
    const start = 0;
    const startedAt = performance.now();
    const hasDecimal = !Number.isInteger(numericTarget);
    function tick(now){
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = start + (numericTarget - start) * eased;
      el.textContent = `${hasDecimal ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}${suffix}`;
      if(progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderOptionalFields(){
    els.optionalFieldsList.innerHTML = "";
    getAllExtraColumns().forEach(col=>{
      const already = state.columns.some(c=>c.key===col.key);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "optional-field-button";
      button.disabled = already;
      button.innerHTML = `<span><strong>${escapeHtml(col.label)}</strong><small>${escapeHtml(col.desc)}</small></span><span class="add-chip">${already ? T("fields.added") : T("fields.add")}</span>`;
      button.addEventListener("click",()=>{
        if(already) return;
        showColumn(col);
        saveAndRender();
      });
      els.optionalFieldsList.appendChild(button);
    });
  }

  function renderVisibleFields(){
    if(!els.visibleFieldsList) return;
    els.visibleFieldsList.innerHTML = "";
    state.columns.filter(col=>!col.locked).forEach(col=>{
      const label = document.createElement("label");
      label.className = "visible-field-check";
      label.innerHTML = `<input type="checkbox" checked data-column-key="${escapeAttr(col.key)}" /><span>${escapeHtml(col.label)}</span>`;
      label.querySelector("input").addEventListener("change", event=>{
        if(!event.target.checked) hideColumn(col.key);
      });
      els.visibleFieldsList.appendChild(label);
    });
  }

  function toggleFieldPanel(mode){
    const add = mode === "add";
    els.fieldPanel.hidden = !add ? true : !els.fieldPanel.hidden;
    els.removeFieldPanel.hidden = add ? true : !els.removeFieldPanel.hidden;
  }

  function closePopups(){
    if(els.fieldPanel) els.fieldPanel.hidden = true;
    if(els.removeFieldPanel) els.removeFieldPanel.hidden = true;
    toggleHelpPanel("usagePanel", false);
    toggleHelpPanel("shortcutPanel", false);
  }

  function toggleHelpPanel(id, force){
    const panel = document.getElementById(id);
    if(!panel) return;
    const willOpen = typeof force === "boolean" ? force : panel.hidden || !panel.classList.contains("open");
    panel.hidden = !willOpen;
    requestAnimationFrame(()=>panel.classList.toggle("open", willOpen));
  }

  function showColumn(col){
    const reportIndex = state.columns.findIndex(c=>c.key === "report");
    const next = { ...col, width: clampColumnWidth(col.key, Number(col.width) || COLUMN_DEFAULT_WIDTHS[col.key] || 140) };
    if(reportIndex >= 0) state.columns.splice(reportIndex, 0, next);
    else state.columns.push(next);
    state.hiddenColumns = state.hiddenColumns.filter(c=>c.key !== col.key);
  }

  function hideColumn(key){
    const index = state.columns.findIndex(col=>col.key === key && !col.locked);
    if(index < 0) return;
    const [removed] = state.columns.splice(index, 1);
    if(!state.hiddenColumns.some(col=>col.key === key)) state.hiddenColumns.push(removed);
    saveAndRender();
  }

  function renderTable(){
    const rows = getFilteredRows();
    renderTableHead();
    requestAnimationFrame(updateReportStickyState);
    els.tableBody.innerHTML = "";
    rows.forEach(row=>{
      const tr = document.createElement("tr");
      tr.dataset.rowId = row.id;
      const isSelected = row.id === activeId;
      tr.className = [isSelected ? "selected-row" : "", row.sample ? "is-sample" : ""].filter(Boolean).join(" ");
      // 和 CSS 的 :not([hidden]) 那類情況一樣，曾發現某些環境下 .selected-row 的背景
      // CSS 不知為何沒有套用，為了保險也直接指定一次
      tr.style.backgroundColor = isSelected ? "var(--selected-row-bg)" : "";
      tr.addEventListener("click",()=>{ activeId = row.id; renderTable(); renderDrawer(); });
      tr.addEventListener("dblclick",()=>openSessionDialog(row.id));
      state.columns.forEach(col=>{
        const td = document.createElement("td");
        td.className = getCellClass(col.key);
        applyColumnWidth(td, col);
        td.appendChild(cellContent(row,col));
        tr.appendChild(td);
      });
      els.tableBody.appendChild(tr);
    });

    const addTr = document.createElement("tr");
    addTr.innerHTML = `<td class="add-row-cell" colspan="${state.columns.length}"><button class="add-row-button" type="button"><span>＋</span><span>${T("table.addSession")}</span></button></td>`;
    addTr.querySelector("button").addEventListener("click",()=>openSessionDialog());
    els.tableBody.appendChild(addTr);
  }

  function renderTableHead(){
    const tr = document.createElement("tr");
    state.columns.forEach(col=>{
      const th = document.createElement("th");
      th.dataset.key = col.key;
      th.draggable = false;
      th.className = `${col.locked ? "" : "draggable-header"} column-${cssSafeKey(col.key)}`.trim();
      th.title = col.locked ? T("table.lockedTitle") : T("table.dragTitle");
      applyColumnWidth(th, col);
      th.innerHTML = `
        <span class="header-content">
          ${col.locked ? "" : `<span class="drag-handle" draggable="true" title="${escapeAttr(T("table.dragHandle"))}">⋮⋮</span>`}
          <span class="header-label">${escapeHtml(col.label)}</span>
          ${col.locked && !col.hideFixedLabel ? `<span class="fixed-label">${escapeHtml(T("table.fixed"))}</span>` : ""}
        </span>
        ${col.locked ? "" : `<span class="col-resizer" title="${escapeAttr(T("table.resize"))}"></span>`}
      `;

      const dragHandle = th.querySelector(".drag-handle");
      dragHandle?.addEventListener("dragstart",event=>handleDragStart(event,col.key,th));
      dragHandle?.addEventListener("dragend",handleDragEnd);
      th.addEventListener("dragover",event=>handleDragOver(event,col.key,th));
      th.addEventListener("dragleave",event=>handleDragLeave(event,th));
      th.addEventListener("drop",event=>handleDrop(event,col.key,th));

      const resizer = th.querySelector(".col-resizer");
      resizer?.addEventListener("mousedown",event=>startColumnResize(event, col.key, th));
      tr.appendChild(th);
    });
    els.tableHead.innerHTML = "";
    els.tableHead.appendChild(tr);
  }

  function cellContent(row,col){
    if(col.key === "date") return html(`<span class="date-cell truncate-cell" title="${escapeAttr(getDateTitle(row))}">${escapeHtml(getDateDisplay(row))}</span>`);
    if(col.key === "scenario"){
      const wrap = document.createElement("span");
      wrap.className = "cell-scenario-wrap";
      wrap.appendChild(textCell(row.scenario, "cell-scenario", getDynamicTextLimit(col)));
      const open = document.createElement("button");
      open.type = "button";
      open.className = "scenario-open-btn";
      open.textContent = "OPEN";
      open.title = T("table.openTitle");
      open.addEventListener("click", event=>{ event.stopPropagation(); activeId = row.id; renderTable(); openDrawer(); });
      wrap.appendChild(open);
      return wrap;
    }
    if(col.key === "players") return textCell(row.players, "", getDynamicTextLimit(col));
    if(col.key === "pc") return textCell(row.pc, "", getDynamicTextLimit(col));
    if(col.key === "note") return textCell(row.note, "", getDynamicTextLimit(col));
    if(col.key === "system") return html(`<span class="system-pill ${systemClass(row.system)}">${escapeHtml(labelFor(SYSTEM_LABEL_KEYS, row.system || ""))}</span>`);
    if(col.key === "role") return html(`<span class="role-pill ${roleClass(row.role)}">${escapeHtml(row.role || "")}</span>`);
    if(col.key === "hashtag") return textCell(row.hashtag, "hashtag-cell", 18);
    if(col.key === "fav") return html(`<span>${row.fav ? "★" : "☆"}</span>`);
    if(col.key === "time") return document.createTextNode(timeDisplay(row.time));
    if(col.key === "status") return document.createTextNode(labelFor(STATUS_LABEL_KEYS, row.status || ""));
    if(col.key === "survival") return document.createTextNode(labelFor(SURVIVAL_LABEL_KEYS, row.survival || ""));
    if(col.key === "reported"){
      const label = document.createElement("label");
      label.className = "reported-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(row.reported);
      checkbox.title = row.reported ? T("table.reported") : T("table.notReported");
      checkbox.setAttribute("aria-label", T("table.reported"));
      checkbox.addEventListener("click", event=>event.stopPropagation());
      checkbox.addEventListener("change", event=>{
        row.reported = event.target.checked;
        checkbox.title = row.reported ? T("table.reported") : T("table.notReported");
        saveState();
      });
      label.appendChild(checkbox);
      return label;
    }
    if(col.key === "report"){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "report-button";
      btn.innerHTML = `<span class="report-button-arrow" aria-hidden="true">➜</span><span class="report-button-full">${escapeHtml(T("table.sendReport"))}</span>`;
      btn.addEventListener("click",event=>{ event.stopPropagation(); openReportGenerator(row); });
      return btn;
    }
    return document.createTextNode(row[col.key] || "");
  }

  function renderDrawer(){
    const row = state.rows.find(r=>r.id===activeId);
    if(els.drawerFooter) els.drawerFooter.hidden = !row;
    if(!row){
      els.drawerContent.innerHTML = `<p class="drawer-muted">${escapeHtml(T("drawer.empty"))}</p>`;
      return;
    }
    if(!Array.isArray(row.media)) row.media = [];
    if(!Array.isArray(row.cushionLinks)) row.cushionLinks = [];
    normalizeRowDates(row);

    const allSystems = unique([...SYSTEM_OPTIONS, ...state.rows.map(r=>r.system).filter(Boolean)]);
    const sysList = allSystems.map(s=>`<option value="${escapeAttr(labelFor(SYSTEM_LABEL_KEYS, s))}"></option>`).join("");
    const roleOpts = ["", ...ROLE_OPTIONS].map(r=>`<option value="${escapeAttr(r)}" ${r === (row.role || "") ? "selected" : ""}>${r || "—"}</option>`).join("");
    const statusOpts = ["", ...STATUS_OPTIONS].map(s=>`<option value="${escapeAttr(s)}" ${s === (row.status || "") ? "selected" : ""}>${s ? escapeHtml(labelFor(STATUS_LABEL_KEYS, s)) : "—"}</option>`).join("");

    els.drawerContent.innerHTML = `
      <div class="drawer-scenario">
        <p class="drawer-label">${escapeHtml(T("drawer.scenario"))}</p>
        <input class="drawer-title-input" data-field="scenario" value="${escapeAttr(row.scenario || "")}" placeholder="${escapeAttr(T("drawer.scenarioPlaceholder"))}" />
      </div>

      <div class="drawer-meta-grid">
        <label><span>${escapeHtml(T("drawer.dates"))}</span><input data-field="dateText" value="${escapeAttr((row.dates || []).join(", "))}" placeholder="2025-11-06, 2025-11-07" /></label>
        <label><span>${escapeHtml(T("col.system"))}</span><input data-field="system" list="drawerSysList" value="${escapeAttr(labelFor(SYSTEM_LABEL_KEYS, row.system || ""))}" /><datalist id="drawerSysList">${sysList}</datalist></label>
        <label><span>${escapeHtml(T("col.role"))}</span><select data-field="role">${roleOpts}</select></label>
        <label><span>${escapeHtml(T("drawer.status"))}</span><select data-field="status">${statusOpts}</select></label>
        <label><span>GM / KP / DL</span><input data-field="gm" value="${escapeAttr(row.gm || "")}" /></label>
        <label><span>${escapeHtml(T("drawer.players"))}</span><input data-field="players" value="${escapeAttr(row.players || "")}" /></label>
        <label><span>PC</span><input data-field="pc" value="${escapeAttr(row.pc || "")}" /></label>
        <label><span>${escapeHtml(T("col.time"))}</span><span class="field-with-unit"><input data-field="time" inputmode="decimal" value="${escapeAttr(normalizeTimeValue(row.time))}" placeholder="${escapeAttr(T("form.timePlaceholder"))}" /><span class="field-unit">${escapeHtml(T("form.hoursUnit"))}</span></span></label>
        <label><span>END</span><input data-field="ending" value="${escapeAttr(row.ending || "")}" /></label>
        <label><span>${escapeHtml(T("col.survival"))}</span><input data-field="survival" value="${escapeAttr(labelFor(SURVIVAL_LABEL_KEYS, row.survival || ""))}" /></label>
      </div>

      <div class="drawer-section">
        <div class="drawer-sec-head">
          <p class="drawer-label">${escapeHtml(T("drawer.media"))}</p>
          <span class="drawer-sec-actions">
            <button type="button" class="mini-button" data-media-url>${escapeHtml(T("drawer.addMedia"))}</button>
          </span>
        </div>
        <div class="drawer-media" data-media-list>${renderDrawerMedia(row)}</div>
        <p class="drawer-muted">${escapeHtml(T("drawer.mediaHint"))}</p>
      </div>

      <div class="drawer-section">
        <p class="drawer-label">${escapeHtml(T("drawer.result"))}</p>
        <textarea data-field="result" rows="4" placeholder="${escapeAttr(T("drawer.resultPlaceholder"))}">${escapeHtml(row.result || "")}</textarea>
      </div>

      <div class="drawer-section">
        <p class="drawer-label">${escapeHtml(T("drawer.kansou"))}</p>
        <textarea data-field="longNote" rows="8" placeholder="${escapeAttr(T("drawer.kansouPlaceholder"))}">${escapeHtml(row.longNote || "")}</textarea>
      </div>

      <div class="drawer-section">
        <div class="drawer-sec-head">
          <p class="drawer-label">${escapeHtml(T("drawer.cushionLinks"))}</p>
          <button type="button" class="mini-button" data-add-link>${escapeHtml(T("drawer.addLink"))}</button>
        </div>
        <div class="drawer-links" data-link-list>${renderDrawerLinks(row)}</div>
      </div>

      <div class="drawer-section">
        <p class="drawer-label">${escapeHtml(T("drawer.shortNote"))}</p>
        <textarea data-field="note" rows="2" placeholder="${escapeAttr(T("drawer.shortNotePlaceholder"))}">${escapeHtml(row.note || "")}</textarea>
      </div>

      <div class="drawer-actions">
        <button id="drawerDeleteBtn" class="danger-soft" type="button">${escapeHtml(T("drawer.delete"))}</button>
      </div>
    `;
    wireDrawer(row);
    loadTwitterWidgets();
  }

  function wireDrawer(row){
    const c = els.drawerContent;
    c.querySelectorAll("[data-field]").forEach(el=>{
      const handler = ()=>{
        const f = el.dataset.field;
        if(f === "dateText"){
          const list = splitImportDates(el.value);
          if(list.length){ row.dates = [...new Set(list)].sort(); row.date = row.dates[0]; }
          else if(!el.value.trim()){ row.dates = []; row.date = ""; }
        }else if(f === "time"){
          row.time = normalizeTimeValue(el.value);
        }else if(f === "system"){
          row.system = canonicalFor(SYSTEM_LABEL_KEYS, el.value);
        }else if(f === "survival"){
          row.survival = canonicalFor(SURVIVAL_LABEL_KEYS, el.value);
        }else{
          row[f] = el.value;
        }
        saveState();
      };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    });
    c.querySelector("[data-media-url]")?.addEventListener("click",()=>addDrawerMediaUrl(row));
    c.querySelector("[data-add-link]")?.addEventListener("click",()=>{ row.cushionLinks.push({ label: "", url: "" }); saveState(); refreshDrawerLinks(row); });
    c.querySelector("[data-media-list]")?.addEventListener("click",ev=>{
      const rm = ev.target.closest("[data-media-remove]");
      if(rm){ row.media.splice(Number(rm.dataset.mediaRemove), 1); saveState(); refreshDrawerMedia(row); }
    });
    c.querySelector("[data-media-list]")?.addEventListener("input",ev=>{
      const cap = ev.target.closest("[data-media-caption]");
      if(cap){ const i = Number(cap.dataset.mediaCaption); if(row.media[i]) row.media[i].caption = cap.value; saveState(); }
    });
    c.querySelector("[data-link-list]")?.addEventListener("click",ev=>{
      const rm = ev.target.closest("[data-link-remove]");
      if(rm){ row.cushionLinks.splice(Number(rm.dataset.linkRemove), 1); saveState(); refreshDrawerLinks(row); }
    });
    c.querySelector("[data-link-list]")?.addEventListener("input",ev=>{
      const el = ev.target.closest("[data-link-field]");
      if(!el) return;
      const i = Number(el.dataset.linkIndex);
      if(row.cushionLinks[i]) row.cushionLinks[i][el.dataset.linkField] = el.value;
      saveState();
    });
    document.getElementById("drawerDeleteBtn")?.addEventListener("click",()=>deleteRow(row.id));
  }

  const TWEET_URL_RE = /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/?#]+\/status(?:es)?\/\d+/i;

  function classifyMediaUrl(url){
    if(TWEET_URL_RE.test(url)) return "tweet";
    if(/\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i.test(url) || /^data:image\//.test(url)) return "image";
    return "link";
  }

  function mediaLinkLabel(url){
    try{
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if(/x\.com|twitter\.com/.test(host)) return T("drawer.xPost");
      return host;
    }catch(_e){ return String(url).slice(0, 40); }
  }

  let twitterWidgetsPromise = null;
  function loadTwitterWidgets(){
    if(!document.querySelector(".twitter-tweet")) return;
    if(window.twttr?.widgets){ window.twttr.widgets.load(); return; }
    if(!twitterWidgetsPromise){
      twitterWidgetsPromise = new Promise(resolve=>{
        const s = document.createElement("script");
        s.src = "https://platform.twitter.com/widgets.js";
        s.async = true;
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
    twitterWidgetsPromise.then(()=>window.twttr?.widgets?.load());
  }

  function renderDrawerMedia(row){
    if(!row.media.length) return `<p class="drawer-muted">${escapeHtml(T("drawer.none"))}</p>`;
    return row.media.map((m, i)=>{
      let body;
      if(m.type === "image"){
        body = `<img src="${escapeAttr(m.url)}" alt="" loading="lazy" />`;
      }else if(m.type === "tweet"){
        const tweetTheme = document.body.classList.contains("night-mode") ? "dark" : "light";
        body = `<blockquote class="twitter-tweet" data-dnt="true" data-theme="${tweetTheme}"><a href="${escapeAttr(m.url)}"></a></blockquote>`;
      }else{
        body = `<a class="drawer-media-link" href="${escapeAttr(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(mediaLinkLabel(m.url))} ↗</a>`;
      }
      return `<figure class="drawer-media-item drawer-media-item-${escapeAttr(m.type)}">
        <button type="button" class="drawer-media-x" data-media-remove="${i}" title="${escapeAttr(T("common.delete"))}">×</button>
        ${body}
        <input class="drawer-media-cap" data-media-caption="${i}" value="${escapeAttr(m.caption || "")}" placeholder="${escapeAttr(T("drawer.caption"))}" />
      </figure>`;
    }).join("");
  }

  function renderDrawerLinks(row){
    if(!row.cushionLinks.length) return `<p class="drawer-muted">${escapeHtml(T("drawer.none"))}</p>`;
    return row.cushionLinks.map((l, i)=>`
      <div class="drawer-link-row">
        <input data-link-field="label" data-link-index="${i}" value="${escapeAttr(l.label || "")}" placeholder="${escapeAttr(T("drawer.linkLabelPlaceholder"))}" />
        <input data-link-field="url" data-link-index="${i}" value="${escapeAttr(l.url || "")}" placeholder="https://..." />
        ${l.url ? `<a class="drawer-link-go" href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">↗</a>` : ""}
        <button type="button" class="drawer-link-x" data-link-remove="${i}">×</button>
      </div>`).join("");
  }

  function refreshDrawerMedia(row){
    const el = els.drawerContent.querySelector("[data-media-list]");
    if(el) el.innerHTML = renderDrawerMedia(row);
    loadTwitterWidgets();
  }
  function refreshDrawerLinks(row){
    const el = els.drawerContent.querySelector("[data-link-list]");
    if(el) el.innerHTML = renderDrawerLinks(row);
  }

  function addDrawerMediaUrl(row){
    const url = prompt(T("drawer.mediaPrompt"));
    if(!url) return;
    const clean = url.trim();
    if(!/^https?:\/\//i.test(clean)){ alert(T("drawer.badUrl")); return; }
    row.media.push({ type: classifyMediaUrl(clean), url: clean, caption: "" });
    saveState();
    refreshDrawerMedia(row);
  }

  function getFilteredRows(){
    const q = (els.searchInput.value || "").trim().toLowerCase();
    const system = els.systemFilter.value;
    const role = els.roleFilter.value;
    let rows = [...state.rows].filter(row=>{
      if(system && row.system !== system) return false;
      if(role && normalizeRoleGroup(row.role) !== role) return false;
      if(!q) return true;
      const labels = [labelFor(SYSTEM_LABEL_KEYS, row.system), labelFor(STATUS_LABEL_KEYS, row.status), labelFor(SURVIVAL_LABEL_KEYS, row.survival)];
      return [...Object.values(row), ...labels].join(" ").toLowerCase().includes(q);
    });
    rows.sort((a,b)=>{
      const sort = els.sortSelect.value;
      if(sort === "oldest") return getPrimaryDate(a).localeCompare(getPrimaryDate(b));
      if(sort === "scenario") return String(a.scenario).localeCompare(String(b.scenario),"ja");
      if(sort === "gm") return String(a.gm).localeCompare(String(b.gm),"ja");
      return getPrimaryDate(b).localeCompare(getPrimaryDate(a));
    });
    return rows;
  }

  function openSessionDialog(id){
    editingId = id || null;
    const today = new Date().toISOString().slice(0,10);
    const row = id ? state.rows.find(r=>r.id===id) : { id: cryptoId(), date: today, dates: [today], scenario:"", system:"CoC 6版", role:"PL", gm:"", players:"", pc:"", status:"新規", time:"", note:"", hashtag:"", longNote:"" };
    normalizeRowDates(row);
    els.sessionDialogTitle.textContent = id ? T("dialog.editTitle") : T("dialog.addTitle");
    els.deleteSessionBtn.hidden = !id;
    els.sessionFormFields.innerHTML = "";

    const columns = getDialogColumns();
    const groups = [
      { title: T("dialog.groupBasic"), keys: ["date", "scenario", "system", "role", "status", "time"] },
      { title: T("dialog.groupPeople"), keys: ["gm", "players", "pc"] },
      { title: T("dialog.groupNote"), keys: ["note"] }
    ];
    const used = new Set(groups.flatMap(group=>group.keys));
    const extraColumns = columns.filter(col=>!used.has(col.key));
    if(extraColumns.length) groups.push({ title: T("dialog.groupExtra"), columns: extraColumns });

    groups.forEach(group=>{
      const fieldset = document.createElement("fieldset");
      fieldset.className = "dialog-fieldset";
      fieldset.innerHTML = `<legend>${escapeHtml(group.title)}</legend><div class="dialog-fieldset-grid"></div>`;
      const grid = fieldset.querySelector(".dialog-fieldset-grid");
      const groupColumns = group.columns || group.keys.map(key=>columns.find(col=>col.key===key)).filter(Boolean);
      groupColumns.forEach(col=>{
        const label = document.createElement("label");
        label.className = ["note", "pc"].includes(col.key) ? "wide-field" : "";
        label.innerHTML = `<span>${escapeHtml(col.label)}</span>${fieldInputMarkup(col, row)}`;
        grid.appendChild(label);
      });
      els.sessionFormFields.appendChild(fieldset);
    });
    els.longNoteInput.value = row.longNote || "";
    els.sessionDialog.showModal();
  }

  function handleDateFieldClick(event){
    const addBtn = event.target.closest("[data-add-date]");
    if(addBtn){
      const container = addBtn.closest("[data-multi-date-field]");
      const row = document.createElement("div");
      row.className = "date-input-row";
      row.innerHTML = `<input type="date" name="dates" value="" /><button type="button" class="date-remove-button" data-remove-date>${escapeHtml(T("common.delete"))}</button>`;
      container.insertBefore(row, addBtn);
      updateDateRemoveButtons(container);
      row.querySelector("input")?.focus();
      return;
    }
    const removeBtn = event.target.closest("[data-remove-date]");
    if(removeBtn){
      const container = removeBtn.closest("[data-multi-date-field]");
      const rows = [...container.querySelectorAll(".date-input-row")];
      if(rows.length > 1){
        removeBtn.closest(".date-input-row")?.remove();
        updateDateRemoveButtons(container);
      }
    }
  }

  function handleSessionFormChange(event){
    if(event.target.matches("[data-system-select]")){
      const input = event.target.parentElement.querySelector("[data-system-custom]");
      if(input) input.hidden = event.target.value !== "__custom";
      if(input && !input.hidden) input.focus();
    }
  }

  function updateDateRemoveButtons(container){
    const rows = [...container.querySelectorAll(".date-input-row")];
    rows.forEach(row=>{
      const button = row.querySelector("[data-remove-date]");
      if(button) button.disabled = rows.length <= 1;
    });
  }

  function handleSessionSave(event){
    event.preventDefault();
    const form = new FormData(els.sessionForm);
    const row = editingId ? state.rows.find(r=>r.id===editingId) : { id: cryptoId() };
    getDialogColumns().filter(c=>c.key !== "date").forEach(col=>{
      if(col.key === "system") row.system = form.get("system") === "__custom" ? canonicalFor(SYSTEM_LABEL_KEYS, form.get("systemCustom") || "") : (form.get("system") || "");
      else if(col.key === "fav") row.fav = form.get("fav") ? "★" : "";
      else if(col.key === "time") row.time = normalizeTimeValue(form.get("time") || "");
      else row[col.key] = form.get(col.key) || "";
    });
    const dates = form.getAll("dates").map(v=>String(v || "").trim()).filter(Boolean).sort();
    row.dates = unique(dates);
    row.date = row.dates[0] || "";
    row.longNote = els.longNoteInput.value;
    delete row.sample; // 手動編輯過就不再當作範例
    if(!editingId) state.rows.push(row);
    activeId = row.id;
    els.sessionDialog.close();
    saveAndRender();
  }

  async function deleteEditingSession(){
    if(!editingId) return;
    if(!(await confirmAction(T("confirm.deleteRow")))) return;
    removeRowById(editingId);
    els.sessionDialog.close();
  }

  function removeRowById(id){
    state.rows = state.rows.filter(r=>r.id!==id);
    if(activeId === id) activeId = state.rows[0]?.id || null;
    saveAndRender();
  }

  async function deleteRow(id){
    if(!(await confirmAction(T("confirm.deleteRow")))) return;
    removeRowById(id);
    if(els.kansouDrawer?.classList.contains("open")) closeDrawer();
  }

  // 同一頁面多次呼叫 window.confirm() 時，瀏覽器有時會把它擋掉，
  // 所以刪除確認改用自己做的輕量強制回應視窗。重點是用 <dialog>+showModal() 實作：
  // 若只是 position:fixed 的 div，一定會畫在「編輯團資訊」等已經開著的 <dialog>
  // （位於瀏覽器的頂層）後面，點擊會落在原本的對話框而不是後面的 div，
  // 看起來就像「沒有反應」的錯誤。
  function confirmAction(message){
    return new Promise(resolve=>{
      const dlg = document.createElement("dialog");
      dlg.className = "mini-confirm-dialog";
      dlg.innerHTML = `
        <div class="mini-confirm" role="alertdialog">
          <p>${escapeHtml(message)}</p>
          <div class="mini-confirm-actions">
            <button type="button" class="mini-confirm-cancel">${escapeHtml(T("common.cancel"))}</button>
            <button type="button" class="mini-confirm-ok">${escapeHtml(T("confirm.ok"))}</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
      let finishResult = false;
      dlg.addEventListener("close",()=>{ dlg.remove(); resolve(finishResult); });
      dlg.querySelector(".mini-confirm-cancel").addEventListener("click",()=>{ finishResult = false; dlg.close(); });
      dlg.querySelector(".mini-confirm-ok").addEventListener("click",()=>{ finishResult = true; dlg.close(); });
      dlg.addEventListener("click", e=>{ if(e.target === dlg){ finishResult = false; dlg.close(); } });
      if(typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    });
  }

  function createCustomField(){
    const label = prompt(T("fields.customPrompt"));
    if(!label) return;
    const key = `custom_${Date.now()}`;
    const column = {key,label,width:COLUMN_DEFAULT_WIDTHS[key] || 140, custom:true};
    state.customColumns.push(column);
    state.columns.splice(Math.max(state.columns.length-1,0),0,column);
    saveAndRender();
  }

  function handleDragStart(event,key,headerEl){
    const col = state.columns.find(c=>c.key===key);
    if(col?.locked || resizingColumn){ event.preventDefault(); return; }
    draggingKey = key;
    dragOverKey = null;
    dragInsertSide = "before";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain",key);
    headerEl?.classList.add("dragging");
  }

  function handleDragOver(event,key,headerEl){
    if(!draggingKey || draggingKey === key || resizingColumn) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = headerEl.getBoundingClientRect();
    const side = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    if(dragOverKey !== key || dragInsertSide !== side){
      document.querySelectorAll("#tableHead th.drag-over-before, #tableHead th.drag-over-after").forEach(el=>el.classList.remove("drag-over-before","drag-over-after"));
      dragOverKey = key;
      dragInsertSide = side;
      headerEl?.classList.add(side === "before" ? "drag-over-before" : "drag-over-after");
    }
  }

  function handleDragLeave(event,headerEl){
    const related = event.relatedTarget;
    if(related && headerEl?.contains(related)) return;
    headerEl?.classList.remove("drag-over-before","drag-over-after");
  }

  function handleDrop(event,targetKey,headerEl){
    event.preventDefault();
    const sourceKey = event.dataTransfer.getData("text/plain") || draggingKey;
    const rect = headerEl?.getBoundingClientRect();
    const side = rect && event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
    headerEl?.classList.remove("drag-over-before","drag-over-after");
    if(sourceKey && targetKey && sourceKey !== targetKey){
      const sourceIndex = state.columns.findIndex(c=>c.key===sourceKey);
      const targetIndex = state.columns.findIndex(c=>c.key===targetKey);
      const sourceColumn = state.columns[sourceIndex];
      if(sourceIndex >= 0 && targetIndex >= 0 && !sourceColumn?.locked){
        const [moved] = state.columns.splice(sourceIndex,1);
        let insertIndex = state.columns.findIndex(c=>c.key===targetKey);
        if(side === "after") insertIndex += 1;
        const firstUnlockedIndex = state.columns.findIndex(c=>!c.locked);
        if(firstUnlockedIndex > 0) insertIndex = Math.max(insertIndex, firstUnlockedIndex);
        const trailingLockedIndex = state.columns.findIndex(c=>c.locked && c.key !== "reported");
        if(trailingLockedIndex >= 0) insertIndex = Math.min(insertIndex, trailingLockedIndex);
        state.columns.splice(Math.max(insertIndex,0),0,moved);
        saveState();
      }
    }
    handleDragEnd();
    renderTable();
  }

  function handleDragEnd(){
    draggingKey = null;
    dragOverKey = null;
    dragInsertSide = "before";
    document.querySelectorAll("#tableHead th.dragging, #tableHead th.drag-over-before, #tableHead th.drag-over-after").forEach(el=>el.classList.remove("dragging","drag-over-before","drag-over-after"));
  }

  function startColumnResize(event,key,headerEl){
    event.preventDefault();
    event.stopPropagation();
    const column = state.columns.find(c=>c.key === key);
    if(!column || column.locked) return;
    resizingColumn = {
      key,
      startX: event.clientX,
      startWidth: Number(column.width) || headerEl.getBoundingClientRect().width
    };
    document.body.classList.add("is-resizing-column");
    document.addEventListener("mousemove",handleColumnResizeMove);
    document.addEventListener("mouseup",stopColumnResize,{ once:true });
  }

  function handleColumnResizeMove(event){
    if(!resizingColumn) return;
    const column = state.columns.find(c=>c.key === resizingColumn.key);
    if(!column) return;
    const delta = event.clientX - resizingColumn.startX;
    column.width = clampColumnWidth(column.key, resizingColumn.startWidth + delta);
    renderTable();
  }

  function stopColumnResize(){
    if(resizingColumn){
      resizingColumn = null;
      document.body.classList.remove("is-resizing-column");
      document.removeEventListener("mousemove",handleColumnResizeMove);
      saveState();
    }
  }

  function openDrawer(){ els.kansouDrawer.classList.add("open"); els.drawerOverlay.hidden = false; els.kansouDrawer.setAttribute("aria-hidden","false"); els.kansouTab.classList.add("hide"); document.body.classList.add("drawer-open"); renderDrawer(); }
  function closeDrawer(){ els.kansouDrawer.classList.remove("open"); els.drawerOverlay.hidden = true; els.kansouDrawer.setAttribute("aria-hidden","true"); els.kansouTab.classList.remove("hide"); document.body.classList.remove("drawer-open"); }

  function openReportGenerator(row){
    if(!row) return;
    const willOverwrite = hasPendingReportImport();
    const confirmed = confirm([
      T("send.title"),
      "",
      T("send.lead"),
      willOverwrite ? T("send.overwrite") : "",
      "",
      T("send.itemsHead"),
      T("send.items"),
      "",
      T("send.after")
    ].filter(Boolean).join("\n"));
    if(!confirmed) return;

    const payload = createReportPendingImport(row);
    try{
      localStorage.setItem(REPORT_PENDING_IMPORT_KEY, JSON.stringify(payload));
    }catch(error){
      console.error(error);
      alert(T("send.storageError") + "\n\n" + JSON.stringify(payload, null, 2));
      return;
    }

    window.open(REPORT_GENERATOR_URL, "_blank", "noopener,noreferrer");
  }

  function hasPendingReportImport(){
    try{ return Boolean(localStorage.getItem(REPORT_PENDING_IMPORT_KEY)); }
    catch(_error){ return false; }
  }

  function createReportPendingImport(row){
    return {
      source: "session-log-tracker",
      version: "1.0",
      createdAt: new Date().toISOString(),
      items: [createReportImportItem(row)]
    };
  }

  function createReportImportItem(row){
    normalizeRowDates(row);
    const dates = Array.isArray(row.dates) ? row.dates : [];
    return {
      id: `report_import_${Date.now()}`,
      sourceLogId: row.id || "",
      reported: Boolean(row.reported),
      scenario: row.scenario || row.title || "",
      system: row.system || "",
      dates,
      latestDate: dates[dates.length - 1] || row.date || "",
      sessionCount: Math.max(dates.length, 1),
      gm: row.gm || row.keeper || "",
      players: pairPlayers(row.players, row.pc).map(([pl, pc])=>({ pl, pc, characterUrl: "" })),
      format: normalizeSessionFormat(row.format || row.sessionFormat || ""),
      status: normalizeSessionStatus(row.status || ""),
      memo: [row.note, row.result, row.longNote].map(v=>String(v || "").trim()).filter(Boolean).join("\n\n"),
      links: createReportLinks(row),
      hashtags: splitTags(row.hashtag || row.hashtags || row.tags || "")
    };
  }

  function pairPlayers(playersValue, pcValue){
    const pls = splitPeople(playersValue);
    const pcs = splitPeople(pcValue);
    const length = Math.max(pls.length, pcs.length, 1);
    return Array.from({ length }, (_, index)=>[pls[index] || "", pcs[index] || ""]);
  }

  function splitTags(value){
    if(Array.isArray(value)) return value.map(v=>String(v || "").replace(/^#/, "").trim()).filter(Boolean);
    return String(value || "").split(/[\s、,，]+/).map(v=>v.replace(/^#/, "").trim()).filter(Boolean);
  }

  function createReportLinks(row){
    const base = [
      { label: "Session", url: row.sessionUrl || "" },
      { label: "Scenario", url: row.scenarioUrl || "" },
      { label: "Kansou", url: row.kansouUrl || "" }
    ].filter(link=>link.url || ["Session", "Scenario"].includes(link.label));
    (Array.isArray(row.cushionLinks) ? row.cushionLinks : [])
      .filter(l=>l && l.url)
      .forEach(l=>base.push({ label: l.label || "Link", url: l.url }));
    return base;
  }

  function normalizeSessionFormat(value){
    const text = String(value || "").toLowerCase();
    if(text.includes("voice") || text.includes("ボイ") || text.includes("通話")) return "voice";
    if(text.includes("text") || text.includes("テキ")) return "text";
    if(text.includes("semi") || text.includes("半")) return "semi-text";
    return "";
  }

  function normalizeSessionStatus(value){
    const text = String(value || "");
    if(/完|済|end|completed/i.test(text)) return "completed";
    if(/継続|途中|予定|ongoing/i.test(text)) return "ongoing";
    return text;
  }

  function exportJson(){
    const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `session-log-tool-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ===== 匯入（試算表／JSON）=====

  // [欄位 key, 字典 key]；名稱在使用時才取字典
  const SHEET_TARGET_FIELDS = [
    ["date", "sheet.date"],
    ["scenario", "sheet.scenario"],
    ["system", "sheet.system"],
    ["role", "sheet.role"],
    ["roleKp", "sheet.roleKp"],
    ["rolePl", "sheet.rolePl"],
    ["gm", "sheet.gm"],
    ["players", "sheet.players"],
    ["pc", "sheet.pc"],
    ["status", "sheet.status"],
    ["time", "sheet.time"],
    ["note", "sheet.note"],
    ["longNote", "sheet.longNote"],
    ["campaign", "sheet.campaign"],
    ["hashtag", "sheet.hashtag"],
    ["ending", "sheet.ending"],
    ["survival", "sheet.survival"],
    ["sessionUrl", "sheet.sessionUrl"],
    ["scenarioUrl", "sheet.scenarioUrl"],
    ["kansouUrl", "sheet.kansouUrl"],
    ["scenarioCountKey", "sheet.scenarioCountKey"]
  ];
  // 選單與範本 CSV 只用到名稱的第一段（空白或括號之前）
  function sheetFieldShortLabel(field){
    const entry = SHEET_TARGET_FIELDS.find(f=>f[0] === field);
    return entry ? T(entry[1]).split(/[ (（]/)[0] : field;
  }
  const SHEET_HEADER_ALIASES = {
    date: ["日付", "日時", "開催日", "プレイ日", "セッション日", "通過日", "date", "日期", "跑團日期"],
    scenario: ["シナリオ", "シナリオ名", "題名", "タイトル", "作品名", "名前", "scenario", "title", "name", "劇本", "劇本名稱", "劇本名", "標題"],
    system: ["システム", "システム名", "ゲームシステム", "ルール", "system", "系統", "系統名稱", "規則"],
    role: ["ロール", "役割", "立場", "role", "plkp", "kppl", "身分", "身份"],
    gm: ["gm", "kp", "dl", "キーパー", "ゲームマスター", "マスター", "gmkp", "進行役", "進行", "回し手", "keeper", "kp名", "gm名", "主持", "主持人", "守密人", "kp名稱", "gm名稱"],
    players: ["pl", "プレイヤー", "同卓者", "参加者", "メンバー", "players", "player", "pcpl1", "pcpl2", "pcpl3", "pcpl4", "pcpl", "pl1", "pl2", "pl3", "pl4", "pl名", "玩家", "同團玩家", "參加者", "成員", "pl名稱"],
    pc: ["pc", "探索者", "キャラ", "キャラクター", "探索者名", "pc名", "自pc", "使用pc", "担当pc", "charactername", "characternames", "キャラクター名", "キャラ名", "調查員", "調查員名稱", "角色", "角色名稱", "pc名稱"],
    status: ["状態", "ステータス", "進捗", "新規継続", "newcont", "newcontinue", "status", "狀態", "進度"],
    time: ["時間", "所要時間", "プレイ時間", "セッション時間", "time", "hours", "遊玩時間", "時數"],
    note: ["メモ", "備考", "ノート", "コメント", "note", "memo", "備註", "備註簡短感想"],
    longNote: ["長文感想", "詳細メモ", "感想", "感想ネタバレ注意", "longnote", "長篇感想", "詳細備註"],
    campaign: ["キャンペーン", "シリーズ", "親アイテム", "campaign", "長團", "系列"],
    hashtag: ["ハッシュタグ", "タグ", "hashtag", "tag", "tags", "主題標籤", "標籤"],
    ending: ["エンディング", "結末", "ルート", "エンド", "end", "ending", "結局", "路線"],
    survival: ["生還", "生死", "ロスト", "生還ロスト", "survival", "撕卡", "生還撕卡"],
    sessionurl: ["セッションurl", "ログurl", "ログ", "セッションリンク", "sessionurl", "跑團紀錄網址", "紀錄網址"],
    scenariourl: ["シナリオurl", "配布ページ", "boothurl", "scenariourl", "劇本網址"],
    kansoururl: ["感想url", "感想リンク", "kansoururl", "感想網址", "感想連結"],
    scenariocountkey: ["シナリオキー", "集計キー", "scenariocountkey", "劇本計數鍵"]
  };

  const importSheet = { columns: [], rows: [], hasHeader: false, mapping: [] };
  const importReport = { rows: [] };
  const importCcfolia = { scenario: "", date: "", system: "", speakers: [] };
  let jsonImportPayload = null;
  let sheetParseTimer = null;
  let sheetSummaryTimer = null;
  let reportParseTimer = null;

  function openImportDialog(){
    resetImportState();
    if(els.selfNameInput) els.selfNameInput.value = localStorage.getItem(SELF_NAMES_KEY) || "";
    switchImportTab("sheet");
    if(typeof els.importDialog.showModal === "function") els.importDialog.showModal();
    else els.importDialog.setAttribute("open", "");
  }

  function resetImportState(){
    importSheet.columns = [];
    importSheet.rows = [];
    importSheet.hasHeader = false;
    importSheet.mapping = [];
    importReport.rows = [];
    importCcfolia.scenario = "";
    importCcfolia.date = "";
    importCcfolia.system = "";
    importCcfolia.speakers = [];
    jsonImportPayload = null;
    if(els.sheetPasteInput) els.sheetPasteInput.value = "";
    if(els.reportPasteInput) els.reportPasteInput.value = "";
    if(els.sheetFileName) els.sheetFileName.textContent = "";
    if(els.sheetFileInput) els.sheetFileInput.value = "";
    if(els.sheetGrid) els.sheetGrid.innerHTML = "";
    if(els.sheetGridArea) els.sheetGridArea.hidden = true;
    if(els.sheetPasteWrap) els.sheetPasteWrap.hidden = false;
    if(els.importPreviewArea) els.importPreviewArea.hidden = true;
    if(els.sheetParseMsg){ els.sheetParseMsg.hidden = true; els.sheetParseMsg.textContent = ""; }
    if(els.reportParseMsg){ els.reportParseMsg.hidden = true; els.reportParseMsg.textContent = ""; }
    if(els.ccfoliaParseMsg){ els.ccfoliaParseMsg.hidden = true; els.ccfoliaParseMsg.textContent = ""; }
    if(els.ccfoliaForm) els.ccfoliaForm.hidden = true;
    if(els.ccToSheetBtn) els.ccToSheetBtn.disabled = true;
    if(els.ccfoliaFileName) els.ccfoliaFileName.textContent = "";
    if(els.ccfoliaFileInput) els.ccfoliaFileInput.value = "";
    ["ccScenario", "ccDate", "ccSystem", "ccRole", "ccGm", "ccPl"].forEach(id=>{ if(els[id]) els[id].value = ""; });
    if(els.jsonFileName) els.jsonFileName.textContent = "";
    if(els.jsonFileInput) els.jsonFileInput.value = "";
    if(els.runImportBtn) els.runImportBtn.disabled = true;
  }

  function switchImportTab(tab){
    els.importDialog?.querySelectorAll(".import-tab").forEach(btn=>{
      btn.classList.toggle("is-active", btn.dataset.importTab === tab);
    });
    els.importDialog?.querySelectorAll(".import-tabpanel").forEach(panel=>{
      panel.hidden = panel.dataset.importPanel !== tab;
    });
    if(els.importPreviewArea) els.importPreviewArea.hidden = true;
    refreshActivePreview();
    updateRunImportEnabled();
  }

  function activeImportTab(){
    return els.importDialog?.querySelector(".import-tab.is-active")?.dataset.importTab || "sheet";
  }

  function getImportTarget(){
    return document.querySelector('input[name="importTarget"]:checked')?.value || "append";
  }

  function updateRunImportEnabled(){
    if(!els.runImportBtn) return;
    const tab = activeImportTab();
    let ready = false;
    if(tab === "json") ready = Boolean(jsonImportPayload);
    else if(tab === "text") ready = importReport.rows.length > 0;
    else if(tab === "ccfolia") ready = false; // CCFOLIA 要先轉成試算表格式再匯入
    else ready = importSheet.rows.length > 0 && importSheet.mapping.some(Boolean);
    els.runImportBtn.disabled = !ready;
    if(els.ccToSheetBtn) els.ccToSheetBtn.disabled = !ccfoliaRow();
  }

  function refreshActivePreview(){
    const tab = activeImportTab();
    if(tab === "sheet") refreshSheetPreview();
    else if(tab === "text") renderReportPreview();
    else if(tab === "ccfolia") renderCcfoliaPreview();
    else if(els.importPreviewArea) els.importPreviewArea.hidden = true;
  }

  function scheduleSheetParse(){
    clearTimeout(sheetParseTimer);
    sheetParseTimer = setTimeout(parseSheetInput, 180);
  }

  function scheduleReportParse(){
    clearTimeout(reportParseTimer);
    reportParseTimer = setTimeout(parseReportInput, 220);
  }

  function parseDelimitedText(text){
    const normalized = String(text || "").replace(/\r\n?/g, "\n").replace(/\n+$/,"");
    if(!normalized.trim()) return [];
    const firstLine = normalized.split("\n")[0];
    if(firstLine.includes("\t")){
      return normalized.split("\n").map(line=>line.split("\t"));
    }
    return parseCsvRows(normalized);
  }

  function parseCsvRows(text){
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for(let i = 0; i < text.length; i++){
      const ch = text[i];
      if(inQuotes){
        if(ch === '"'){
          if(text[i + 1] === '"'){ field += '"'; i++; }
          else inQuotes = false;
        }else field += ch;
      }else if(ch === '"'){ inQuotes = true; }
      else if(ch === ','){ row.push(field); field = ""; }
      else if(ch === '\n'){ row.push(field); rows.push(row); row = []; field = ""; }
      else field += ch;
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function normalizeHeaderCell(value){
    // Notion 有時會把標題寫成小型大寫字母（ᴛɪᴛʟᴇ 等）
    return desmallcaps(String(value || "")).normalize("NFKC").toLowerCase().replace(/[\s　_・／/]+/g, "").replace(/[()（）.]/g, "");
  }

  const BOOLISH_RE = /^(yes|no|true|false|✓|✔|✗|✘|はい|いいえ|有|無|○|◯|●|×|✕|y|n|1|0)$/i;

  function guessFieldForHeader(headerCell, samples){
    const key = normalizeHeaderCell(headerCell);
    if(!key) return "";
    const canonical = field => ({ sessionurl: "sessionUrl", scenariourl: "scenarioUrl", kansoururl: "kansouUrl", scenariocountkey: "scenarioCountKey", rolekp: "roleKp", rolepl: "rolePl" }[field] || field);
    // 「KP」／「PL」欄若是 Yes/No 勾選，就當作身分旗標（若是名字欄則照一般方式處理）
    if((key === "kp" || key === "pl") && Array.isArray(samples)){
      const vals = samples.map(v=>String(v || "").trim()).filter(Boolean);
      if(vals.length && vals.every(v=>BOOLISH_RE.test(v))) return key === "kp" ? "roleKp" : "rolePl";
    }
    const entries = Object.entries(SHEET_HEADER_ALIASES);
    for(const [field, aliases] of entries){
      if(aliases.includes(key)) return canonical(field);
    }
    for(const [field, aliases] of entries){
      if(aliases.some(alias=>alias.length >= 2 && key.includes(alias))) return canonical(field);
    }
    return "";
  }

  function parseSheetInput(){
    const grid = parseDelimitedText(els.sheetPasteInput.value)
      .map(cells=>cells.map(cell=>String(cell).trim()))
      .filter(cells=>cells.some(Boolean));
    if(!grid.length){
      if(els.sheetParseMsg) els.sheetParseMsg.hidden = true;
      updateRunImportEnabled();
      return;
    }
    const width = Math.max(...grid.map(r=>r.length));
    grid.forEach(r=>{ while(r.length < width) r.push(""); });

    const sampleRows = grid.slice(1, 8);
    const firstRowGuesses = grid[0].map((cell, i)=>guessFieldForHeader(cell, sampleRows.map(r=>r[i])));
    const hasHeader = firstRowGuesses.filter(Boolean).length >= Math.min(2, width);

    const columns = hasHeader
      ? grid[0].map((cell, i)=>cell || T("sheet.colN", i + 1))
      : grid[0].map((_, i)=>T("sheet.colN", i + 1));
    const mapping = hasHeader ? firstRowGuesses.slice() : new Array(width).fill("");
    const rows = hasHeader ? grid.slice(1) : grid.slice();

    setSheetData(columns, mapping, rows, hasHeader
      ? T("sheet.headerFound", rows.length)
      : T("sheet.noHeader", rows.length));
  }

  // ----- 可編輯的試算表格線 -----

  function setSheetData(columns, mapping, rows, msg){
    importSheet.columns = columns.slice();
    importSheet.mapping = mapping.slice();
    importSheet.hasHeader = true;
    importSheet.rows = rows.map(r=>{
      const cells = r.slice(0, columns.length);
      while(cells.length < columns.length) cells.push("");
      return cells.map(c=>String(c == null ? "" : c));
    });
    if(msg && els.sheetParseMsg){ els.sheetParseMsg.hidden = false; els.sheetParseMsg.textContent = msg; }
    if(els.sheetPasteWrap) els.sheetPasteWrap.hidden = true;
    if(els.sheetGridArea) els.sheetGridArea.hidden = false;
    if(els.importPreviewArea) els.importPreviewArea.hidden = true;
    renderSheetGrid();
  }

  function showSheetPaste(){
    importSheet.columns = [];
    importSheet.mapping = [];
    importSheet.rows = [];
    if(els.sheetPasteInput) els.sheetPasteInput.value = "";
    if(els.sheetGrid) els.sheetGrid.innerHTML = "";
    if(els.sheetGridArea) els.sheetGridArea.hidden = true;
    if(els.sheetParseMsg){ els.sheetParseMsg.hidden = true; els.sheetParseMsg.textContent = ""; }
    if(els.sheetPasteWrap) els.sheetPasteWrap.hidden = false;
    els.sheetPasteInput?.focus();
    updateRunImportEnabled();
  }

  function sheetExistingDupKeys(){
    return getImportTarget() === "overwrite"
      ? new Set()
      : new Set(state.rows.map(sessionDupKey).filter(Boolean));
  }

  function renderSheetGrid(){
    if(!els.sheetGrid) return;
    const cols = importSheet.columns;
    const optionsFor = index => [`<option value="">${escapeHtml(T("sheet.skip"))}</option>`]
      .concat(SHEET_TARGET_FIELDS.map(([key])=>
        `<option value="${escapeAttr(key)}" ${importSheet.mapping[index] === key ? "selected" : ""}>${escapeHtml(sheetFieldShortLabel(key))}</option>`))
      .join("");
    const existingKeys = sheetExistingDupKeys();
    const head = `<thead><tr><th class="sg-rownum"></th>${cols.map((_, i)=>
      `<th><select class="sg-map" data-col="${i}">${optionsFor(i)}</select></th>`).join("")}</tr></thead>`;
    const body = importSheet.rows.map((row, ri)=>{
      const built = normalizeImportedRow(applySelfRole(coerceImportValues(buildRowFromCells(row))));
      const dup = existingKeys.has(sessionDupKey(built));
      const tds = cols.map((_, ci)=>
        `<td contenteditable="true" data-row="${ri}" data-col="${ci}">${escapeHtml(row[ci] || "")}</td>`).join("");
      return `<tr class="${dup ? "is-dup" : ""}"><td class="sg-rownum"><button type="button" class="sg-del" data-row="${ri}" title="${escapeAttr(T("sheet.deleteRow"))}">✕</button>${dup ? `<span class="sg-dup">${escapeHtml(T("import.dup"))}</span>` : ""}</td>${tds}</tr>`;
    }).join("");
    els.sheetGrid.innerHTML = head + `<tbody>${body}</tbody>`;
    updateSheetSummary();
  }

  function scheduleSheetSummary(){
    clearTimeout(sheetSummaryTimer);
    sheetSummaryTimer = setTimeout(updateSheetSummary, 200);
  }

  function updateSheetSummary(){
    const built = buildSheetRows();
    const skipDup = Boolean(els.dupSkipInput?.checked);
    const seen = new Set(sheetExistingDupKeys());
    let dup = 0;
    built.forEach(row=>{
      const k = sessionDupKey(row);
      if(!k) return;
      if(seen.has(k)) dup++; else seen.add(k);
    });
    const willImport = skipDup ? built.length - dup : built.length;
    if(els.sheetGridCount){
      els.sheetGridCount.textContent =
        T("import.count", willImport) +
        (getImportTarget() === "overwrite" ? T("sheet.countOverwrite") : "") +
        (dup ? T("sheet.countDup", dup) : "");
    }
    updateRunImportEnabled();
  }

  const YESISH_RE = /^(yes|true|✓|✔|はい|有|○|◯|●|y|1|kp|pl|参加|通過|済)$/i;

  function buildRowFromCells(cells){
    const row = {};
    importSheet.mapping.forEach((key, i)=>{
      if(!key) return;
      const value = (cells[i] || "").trim();
      if(!value) return;
      if(key === "roleKp" || key === "rolePl"){
        if(!row.role && YESISH_RE.test(value)) row.role = key === "roleKp" ? "KP" : "PL";
        return;
      }
      row[key] = row[key] ? `${row[key]} / ${value}` : value;
    });
    return row;
  }

  const EN_MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
  };

  function toIsoDatePart(part){
    const s = String(part || "").trim().normalize("NFKC");
    // Notion 格式 "December 1, 2024" / "Dec 1 2024"
    let m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
    if(m && EN_MONTHS[m[1].toLowerCase()]){
      return `${m[3]}-${String(EN_MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    }
    m = s.match(/(\d{4})\s*[\/.\-年]\s*(\d{1,2})\s*[\/.\-月]\s*(\d{1,2})/);
    if(m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    return "";
  }

  function splitImportDates(value){
    const s = String(value || "").trim();
    if(!s) return [];
    // 範圍寫法（Notion 的日期區間等）取開始日與結束日
    if(/→|〜|~|–|—|\bto\b/i.test(s)){
      return [...new Set(s.split(/\s*(?:→|〜|~|–|—|\bto\b)\s*/i).map(toIsoDatePart).filter(Boolean))];
    }
    // 英文月份的 "December 1, 2024" 不以 "," 分割
    const hasEnMonth = /[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/.test(s);
    const parts = hasEnMonth ? s.split(/\s*[、；;]\s*|\s{2,}/) : s.split(/[、,，;；\s]+/);
    return [...new Set(parts.map(toIsoDatePart).filter(Boolean))];
  }

  const IMPORT_SYSTEM_MAP = {
    "エモクロアtrpg": "エモクロア", "エモクロア": "エモクロア",
    "マーダーミステリー": "マダミス", "マダミス": "マダミス", "マルチシステム": "マダミス",
    "新クトゥルフ神話trpg": "CoC 7版", "新クトゥルフ": "CoC 7版",
    "クトゥルフ神話trpg": "CoC 6版",
    "coc6": "CoC 6版", "coc 6": "CoC 6版", "coc6版": "CoC 6版", "coc 6版": "CoC 6版",
    "coc7": "CoC 7版", "coc 7": "CoC 7版", "coc7版": "CoC 7版", "coc 7版": "CoC 7版",
    // 繁中寫法
    "新克蘇魯神話trpg": "CoC 7版", "新克蘇魯": "CoC 7版", "克蘇魯神話trpg": "CoC 6版",
    "emoklore": "エモクロア", "emoklore trpg": "エモクロア", "謀殺之謎": "マダミス"
  };
  const IMPORT_ROLE_MAP = {
    "キーパー": "KP", "kp": "KP", "ゲームマスター": "GM", "マスター": "GM", "gm": "GM",
    "ディーラー": "DL", "dl": "DL", "プレイヤー": "PL", "pl": "PL",
    "主持人": "GM", "守密人": "KP", "玩家": "PL"
  };

  function coerceImportValues(row){
    if(row.date && (!Array.isArray(row.dates) || !row.dates.length)){
      const iso = splitImportDates(row.date);
      if(iso.length){ row.dates = iso.slice().sort(); row.date = row.dates[0]; }
    }
    if(row.system){
      const key = row.system.normalize("NFKC").trim().toLowerCase();
      if(IMPORT_SYSTEM_MAP[key]) row.system = IMPORT_SYSTEM_MAP[key];
      else row.system = canonicalFor(SYSTEM_LABEL_KEYS, row.system);
    }
    if(row.status) row.status = canonicalFor(STATUS_LABEL_KEYS, row.status);
    if(row.survival) row.survival = canonicalFor(SURVIVAL_LABEL_KEYS, row.survival);
    if(row.role){
      const raw = row.role.normalize("NFKC").trim();
      row.role = IMPORT_ROLE_MAP[raw] || IMPORT_ROLE_MAP[raw.toLowerCase()] || (ROLE_OPTIONS.includes(raw.toUpperCase()) ? raw.toUpperCase() : row.role);
    }
    if(row.time) row.time = normalizeTimeValue(row.time);
    // 全形直線「｜」分隔統一換成「、」（PC／PL／GM 的名單）
    ["players", "pc", "gm"].forEach(key=>{
      if(!row[key]) return;
      row[key] = String(row[key])
        .replace(/\s*[｜]\s*/g, "、")
        .replace(/、{2,}/g, "、")
        .replace(/^[、\s]+|[、\s]+$/g, "");
    });
    return row;
  }

  function applySelfRole(row){
    if(row.role) return row;
    const selfNames = getSelfNames();
    if(row.players && splitPeople(row.players).some(name=>selfNames.has(normalizePersonName(name)))){
      row.role = "PL";
      return row;
    }
    if(!row.gm) return row;
    const gmNames = splitPeople(row.gm);
    if(gmNames.length && gmNames.every(name=>selfNames.has(normalizePersonName(name)))) row.role = "KP";
    else row.role = "PL";
    return row;
  }

  function sessionDupKey(row){
    normalizeRowDates(row);
    const date = (row.dates && row.dates[0]) || row.date || "";
    const scenario = normalizeScenarioForCount(row.scenario || "").normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, "");
    return date && scenario ? `${date}|${scenario}` : "";
  }

  function buildSheetRows(){
    return importSheet.rows
      .map(cells=>normalizeImportedRow(applySelfRole(coerceImportValues(buildRowFromCells(cells)))))
      .filter(row=>row.scenario || row.date || row.pc || row.gm);
  }

  function buildReportRows(){
    return importReport.rows
      .map(partial=>normalizeImportedRow(applySelfRole(coerceImportValues({ ...partial }))))
      .filter(row=>row.scenario || row.date || row.pc || row.gm);
  }

  function refreshSheetPreview(){
    if(els.importPreviewArea) els.importPreviewArea.hidden = true;
    if(importSheet.rows.length){
      if(els.sheetPasteWrap) els.sheetPasteWrap.hidden = true;
      if(els.sheetGridArea) els.sheetGridArea.hidden = false;
      renderSheetGrid();
    }else{
      if(els.sheetGridArea) els.sheetGridArea.hidden = true;
      if(els.sheetPasteWrap) els.sheetPasteWrap.hidden = false;
      updateRunImportEnabled();
    }
  }

  function renderReportPreview(){
    if(!importReport.rows.length){
      if(els.importPreviewArea) els.importPreviewArea.hidden = true;
      updateRunImportEnabled();
      return;
    }
    renderImportPreview(buildReportRows());
  }

  function renderImportPreview(built){
    const target = getImportTarget();
    const skipDup = Boolean(els.dupSkipInput?.checked);
    const existingKeys = new Set(target === "overwrite" ? [] : state.rows.map(sessionDupKey).filter(Boolean));
    const dupSet = new Set(existingKeys);
    let dupCount = 0;
    built.forEach(row=>{
      const k = sessionDupKey(row);
      if(!k) return;
      if(dupSet.has(k)) dupCount++;
      else dupSet.add(k);
    });
    const willImport = skipDup ? built.length - dupCount : built.length;

    els.importPreviewArea.hidden = false;
    els.importPreviewCount.textContent =
      T("import.count", willImport) +
      (target === "overwrite" ? T("preview.overwrite") : "") +
      (dupCount ? T(skipDup ? "preview.dupSkip" : "preview.dupKeep", dupCount) : "");

    const cols = ["date", "scenario", "system", "role", "gm", "players", "pc"];
    const head = `<tr><th></th>${cols.map(c=>`<th>${escapeHtml(sheetFieldShortLabel(c))}</th>`).join("")}</tr>`;
    const body = built.slice(0, 10).map(row=>{
      const dup = existingKeys.has(sessionDupKey(row));
      const cells = cols.map(c=>`<td>${escapeHtml(c === "date" ? getDateDisplay(row) : (c === "time" ? timeDisplay(row.time) : (c === "system" ? labelFor(SYSTEM_LABEL_KEYS, row.system) : (row[c] || ""))))}</td>`).join("");
      return `<tr class="${dup ? "is-dup" : ""}"><td class="dup-mark">${dup ? escapeHtml(T("import.dup")) : ""}</td>${cells}</tr>`;
    }).join("");
    els.importPreviewTable.innerHTML = head + body + (built.length > 10 ? `<tr><td></td><td colspan="${cols.length}" class="preview-more">${escapeHtml(T("preview.more", built.length - 10))}</td></tr>` : "");

    updateRunImportEnabled();
  }

  // ----- 解析團報文字／文字清單 -----

  // 每一組都補上繁中寫法（含本工具與團報產生器繁中版輸出的系統名稱）
  const REPORT_SYSTEM_PATTERNS = [
    [/新クトゥルフ神話trpg|新クトゥルフ|新克蘇魯|new\s*coc|coc\s*7版?|coc7/i, "CoC 7版"],
    [/クトゥルフ神話trpg|克蘇魯神話trpg|coc\s*6版?|coc6/i, "CoC 6版"],
    [/call of cthulhu|クトゥルフ|克蘇魯|coc(?![0-9])/i, "CoC 7版"],
    [/エモクロア|emoklore/i, "エモクロア"],
    [/マーダーミステリー|マダミス|謀殺之謎|murder\s*mystery/i, "マダミス"],
    [/シノビガミ|忍神/i, "シノビガミ"],
    [/インセイン|\binsane\b/i, "インセイン"],
    [/ダブルクロス|雙重十字|double\s*cross/i, "ダブルクロス The 3rd Edition"],
    [/ソード・?ワールド|劍世界|sword\s*world/i, "ソード・ワールド2.5"],
    [/フタリソウサ|二人搜查/i, "フタリソウサ"]
  ];

  const SMALL_CAPS_MAP = { "ᴀ":"A","ʙ":"B","ᴄ":"C","ᴅ":"D","ᴇ":"E","ꜰ":"F","ɢ":"G","ʜ":"H","ɪ":"I","ᴊ":"J","ᴋ":"K","ʟ":"L","ᴍ":"M","ɴ":"N","ᴏ":"O","ᴘ":"P","ꞯ":"Q","ʀ":"R","ꜱ":"S","ᴛ":"T","ᴜ":"U","ᴠ":"V","ᴡ":"W","ʏ":"Y","ᴢ":"Z" };

  const SMALL_CAPS_RE = new RegExp(`[${Object.keys(SMALL_CAPS_MAP).join("")}]`, "g");
  function desmallcaps(text){
    return String(text || "").replace(SMALL_CAPS_RE, ch=>SMALL_CAPS_MAP[ch] || ch);
  }

  function detectSystemFromText(text){
    const t = desmallcaps(String(text || "")).normalize("NFKC");
    for(const [re, name] of REPORT_SYSTEM_PATTERNS){ if(re.test(t)) return name; }
    return "";
  }

  function stripReportLine(line){
    return String(line)
      .replace(/^[\s　|｜┊┗▹▸▶►▷➜➤‣・･\-–—―━─=*✦✧✼⟡◤◢◈❖◇◆‖†✩⋆★☆✮✯⚝⛦≛▮▎ᐧ.·°˖˚₊‧꙳⌜⌟୨୧꒰꒱ঌ໒⧉]+/u, "")
      .replace(/[\s　|｜┊◤◢⌜⌟୨୧‧₊˚꙳・.·°˖ ─—―━=✦✧]+$/u, "")
      .trim();
  }

  function parseReportInput(){
    importReport.rows = parseReportText(els.reportPasteInput.value);
    renderReportPreview();
    if(!els.reportParseMsg) return;
    els.reportParseMsg.hidden = false;
    els.reportParseMsg.textContent = importReport.rows.length
      ? T("report.parsed", importReport.rows.length)
      : T("report.failed");
  }

  function parseReportText(text){
    const raw = String(text || "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
    if(!raw) return [];
    const bodyLines = raw.split("\n").map(l=>l.trim()).filter(Boolean);
    const numbered = bodyLines.filter(l=>/^\d+[.．)]\s*\S/.test(l)).length;
    if(numbered >= 3 && numbered >= bodyLines.length * 0.4) return parseListExport(raw);

    const blocks = raw
      .split(/\n[ \t　]*\n[ \t　]*\n+|\n[ \t　]*[-=—―━─_]{3,}[ \t　]*\n/)
      .map(b=>b.trim())
      .filter(Boolean);
    return blocks.map(parseReportBlock).filter(row=>row && (row.scenario || row.gm || row.players || row.date));
  }

  const REPORT_ROLE_RE = /^(kpc\s*[\/／]\s*kp|作\s*[\/／]\s*kp|kpc|skp|kp|dl|gm|進行|主持|ゲームマスター|キーパー)\s*(?:[：:┊|｜・\/／]|\s)\s*(.+)$/i;

  function parseParticipants(lines, headerIdx){
    const bareHeader = headerIdx >= 0 ? lines[headerIdx].replace(/\s/g, "").toLowerCase() : "";
    let plFirst = /^pl/.test(bareHeader);
    let orderResolved = headerIdx >= 0;
    const pcs = [], pls = [], hos = [];
    const honor = /(さん|様|氏|ｻﾝ|樣|桑)\s*$/;
    const stopRe = /(^|\s)#|(20|19)\d{2}\s*[\/年.\-]|end\b|エンド|エンディング|クリア|scenario\s*clear|全?生還|全?ロスト|撕卡|グッドエンド|✧\s*$/i;
    for(let i = (headerIdx >= 0 ? headerIdx + 1 : 0); i < lines.length; i++){
      const line = lines[i];
      if(REPORT_ROLE_RE.test(line)){ if(pcs.length && headerIdx < 0) break; continue; }
      const hoM = line.match(/^(ho|pc)\s*(\d+)/i);
      const cleaned = line
        .replace(/^(ho\s*\d+|pc\s*\d+|pc|ho|自由)\s*[:：]?\s*/i, "")
        .replace(/^[┗▹▸➤‣・\-\s]+/, "")
        .trim();
      if(stopRe.test(cleaned)){ if(pcs.length || pls.length) break; continue; }
      const parts = cleaned.split(/\s*[\/／|｜┊]\s*/).map(p=>p.trim()).filter(Boolean);
      if(parts.length !== 2){ if((pcs.length || pls.length) && headerIdx < 0) break; continue; }
      if(headerIdx < 0 && !hoM && !pcs.length && !honor.test(parts[0]) && !honor.test(parts[1])) continue;
      if(!orderResolved){
        const l0 = honor.test(parts[0]), l1 = honor.test(parts[1]);
        if(l1 && !l0) plFirst = false;
        else if(l0 && !l1) plFirst = true;
        orderResolved = true;
      }
      if(plFirst){ pls.push(parts[0]); pcs.push(parts[1]); }
      else { pcs.push(parts[0]); pls.push(parts[1]); }
      if(hoM) hos.push(`${(hoM[1] || "HO").toUpperCase()}${hoM[2]}`);
    }
    return { pcs, pls, hos };
  }

  function parseReportBlock(block){
    const row = { longNote: block.trim() };
    const norm = desmallcaps(block).normalize("NFKC");
    const lines = norm.split("\n").map(stripReportLine).filter(Boolean);
    const joined = norm;

    const tags = joined.match(/#[^\s#、,，。]+/g) || [];
    if(tags.length) row.hashtag = [...new Set(tags)].join(" ");

    const dm = joined.match(/(20\d{2}|19\d{2})\s*[\/.\-年]\s*(\d{1,2})\s*[\/.\-月]\s*(\d{1,2})/);
    if(dm) row.date = `${dm[1]}-${String(dm[2]).padStart(2, "0")}-${String(dm[3]).padStart(2, "0")}`;

    row.system = detectSystemFromText(joined);

    for(const line of lines){
      const bm = line.match(/[「『【《〈](.+?)[」』】》〉]/);
      if(bm){
        const s = bm[1].trim();
        if(s && !detectSystemFromText(s) && !/^(kp|dl|gm|pl|pc|ho\d|end|作)/i.test(s)){ row.scenario = s; break; }
      }
    }
    if(!row.scenario){
      const sysIdx = lines.findIndex(l=>detectSystemFromText(l) && l.length < 30);
      if(sysIdx >= 0 && lines[sysIdx + 1]) row.scenario = lines[sysIdx + 1].replace(/[「『【《〈」』】》〉]/g, "").trim();
    }

    const gmNames = [];
    const participantHeaderRe = l=>{
      const bare = l.replace(/\s/g, "").toLowerCase();
      return /^(pc|pl)[・.:：/／┊|｜](pl|pc)/.test(bare) || bare === "pcpl" || bare === "plpc";
    };
    lines.forEach((line, i)=>{
      if(participantHeaderRe(line)) return;
      const m = line.match(REPORT_ROLE_RE);
      if(m){
        m[2].split(/[、,，\/／|｜]/).map(n=>n.replace(/(様|さん|氏|樣|桑)\s*$/, "").trim())
          .filter(n=>n && n.length < 24 && !REPORT_ROLE_RE.test(n) && !detectSystemFromText(n))
          .forEach(n=>gmNames.push(n));
      }
    });
    lines.forEach((line, i)=>{
      if(/^(kp|dl|gm|キーパー|ゲームマスター)…?\s*$/i.test(line) && lines[i + 1] && !REPORT_ROLE_RE.test(lines[i + 1]) && !/[「『]/.test(lines[i + 1]) && !participantHeaderRe(lines[i + 1])){
        const n = lines[i + 1].replace(/(様|さん|氏|樣|桑)\s*$/, "").trim();
        if(n && n.length < 24 && !detectSystemFromText(n)) gmNames.push(n);
      }
    });
    if(gmNames.length) row.gm = [...new Set(gmNames)].join("、");

    const headerIdx = lines.findIndex(participantHeaderRe);
    const { pcs, pls, hos } = parseParticipants(lines, headerIdx);
    if(pcs.length) row.pc = [...new Set(pcs.filter(Boolean))].join(" / ");
    if(pls.length) row.players = [...new Set(pls.filter(Boolean))].join("、");
    if(hos.length) row.ho = [...new Set(hos)].join(" ");

    const resLine = lines.find(l=>/(end\b|エンド|クリア|scenario\s*clear|生還|ロスト|撕卡|グッドエンド|ゲームクリア)/i.test(l) && l.length < 48 && !/[「『【]/.test(l));
    if(resLine){
      row.ending = resLine.replace(/^[-–—―─\s]+|[-–—―─\s]+$/g, "").trim();
      const s = resLine.match(/全員生還|全員撕卡|全生還|全ロスト|生還|ロスト|撕卡/);
      if(s) row.survival = canonicalFor(SURVIVAL_LABEL_KEYS, s[0]);
    }

    return row;
  }

  function parseListExport(raw){
    const rows = [];
    let groupSystem = "", groupGm = "", groupRole = "";
    raw.split("\n").map(l=>l.trim()).forEach(line=>{
      if(!line) return;
      const gh = line.match(/^【\s*(.+?)\s*】$/);
      if(gh){
        const g = gh[1];
        const sys = detectSystemFromText(g);
        if(sys) groupSystem = sys;
        else if(/^(pl|kp|gm|dl)/i.test(g)) groupRole = g.toUpperCase().slice(0, 2);
        else groupGm = g;
        return;
      }
      if(/^[◼◻■□▪▫◾◽]?\s*GM(した|担当)/.test(line)){ groupRole = "KP"; return; }
      const countHead = line.match(/^[◼◻■□▪▫◾◽]?[︎\s]*(\d+)\s*(pl|人)/i);
      if(countHead){ groupRole = ""; return; }
      const m = line.match(/^\d+[.．)]\s*(.+)$/);
      if(!m) return;
      const parts = m[1].split(/\s*[\/／]\s*/).map(p=>p.trim());
      const row = { scenario: parts[0].replace(/[「『【《〈」』】》〉]/g, "").trim() };
      if(parts[1]) row.system = detectSystemFromText(parts[1]) || parts[1];
      if(parts[2] && /^(pl|kp|gm|dl)$/i.test(parts[2])) row.role = parts[2].toUpperCase();
      if(parts[3]) row.date = parts[3];
      if(!row.system && groupSystem) row.system = groupSystem;
      if(!row.role && groupRole) row.role = groupRole;
      if(!row.gm && groupGm) row.gm = groupGm;
      if(row.scenario) rows.push(row);
    });
    return rows;
  }

  // ----- CCFOLIA 房間資料／聊天紀錄 -----

  const DICE_RE = /\b\d{0,2}[dD]\d{1,3}\b|ccb?<=|\bscc?\b|1d100|→\s*(決定的成功|致命的失敗|クリティカル|ファンブル|スペシャル|成功|失敗)|【\s*(判定|技能|SAN)/i;

  function walkJson(node, cb, depth){
    depth = depth || 0;
    if(node == null || depth > 8) return;
    if(Array.isArray(node)){ if(node.length < 4000) node.forEach(n=>walkJson(n, cb, depth + 1)); return; }
    if(typeof node === "object"){ cb(node, depth); Object.values(node).forEach(v=>walkJson(v, cb, depth + 1)); }
  }

  function cleanRoomName(name){
    return String(name || "")
      .replace(/[【\[（(]\s*(coc|coc6|coc7|新?クトゥルフ[^\]】）)]*|エモクロア|マダミス|シノビガミ|インセイン|dx3?|ダブルクロス|sw2\.?5?|ソード・?ワールド)\s*[】\]）)]/gi, "")
      .replace(/\s*[\/／|｜]\s*(kp|dl|gm)\s*[:：].*/i, "")
      .replace(/\s*(kp|dl|gm)\s*[:：]\s*\S+\s*$/i, "")
      .replace(/\s*[:：]?\s*(募集中?|満卓|クローズ|進行中|終了|済|完走).*/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function collectCharacterNames(data, into){
    walkJson(data, node=>{
      if((node.kind === "character" || node.type === "character") && node.data && typeof node.data.name === "string"){
        into.add(node.data.name.trim());
      }
      if(Array.isArray(node.characters)){
        node.characters.forEach(c=>{ if(c && typeof c.name === "string" && c.name.trim()) into.add(c.name.trim()); });
      }
    });
  }

  function findRoomName(data){
    let found = "";
    walkJson(data, node=>{
      if(found) return;
      if(node.kind === "room" && node.data && typeof node.data.name === "string"){ found = node.data.name; return; }
      if(typeof node.name === "string" && node.name.trim() && node.name.length < 120 &&
        (Array.isArray(node.characters) || node.mediaList || node.screenName || node.roomId || node.bgmUrl !== undefined)){
        found = node.name;
      }
    });
    if(!found && data && data.data && typeof data.data.name === "string") found = data.data.name;
    return found.trim();
  }

  function deriveScenarioFromFilename(fileName){
    return String(fileName || "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[\[［(（]\s*(all|全部?|完全版?|ログ|log|セッション\s*\d*|まとめ)\s*[\]］)）]/gi, "")
      .replace(/[\s_　-]*(?:第?\s*[0-9０-９一二三四五六七八九十百]+\s*(?:陣|回|話|日目|周目)|part\s*\d+|その\s*\d+|day\s*\d+)\s*$/i, "")
      .replace(/[\s_　:：\-–—]+$/, "")
      .replace(/[_　]+/g, " ")
      .trim();
  }

  function cleanSpeakerName(raw){
    return String(raw || "")
      .replace(/^[!！*＊・\s　:：]+/, "")
      .replace(/\s*[（(][\u3041-\u3093\u30A1-\u30F6\u309B\u309C\u30FC\s]+[)）]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isNoiseSpeaker(name){
    const n = cleanSpeakerName(name);
    if(!n) return true;
    if(!/[\u3041-\u3093\u30A1-\u30F6\u4E00-\u9FA0a-zA-Z]/.test(n)) return true;
    if(/^\d{1,3}$/.test(n)) return true;
    if(/^[＜〈《【▌■◆◇●○□★☆※▲△▼▽➤▸▶►◀]/.test(n)) return true;
    if(/[＜〈《][^＞〉》]{1,12}[＞〉》]/.test(n) && n.length <= 16) return true;
    if(/^ho\s*\d+\s*(主|副|表|裏|＜|:|：)?\s*$/i.test(n)) return true;
    if(/^(prologue|epilogue|opening|ending|op|ed|導入|クロージング|オープニング|エンディング|幕間|中入り|休憩)$/i.test(n)) return true;
    return false;
  }

  function chatLogLines(text){
    if(/<(p|body|html|div|table)\b/i.test(text)){
      const doc = new DOMParser().parseFromString(text, "text/html");
      const title = doc.querySelector("title")?.textContent?.trim() || "";
      const rows = [...doc.querySelectorAll("p, tr, div.log, .p-log__row")].map(el=>{
        const spans = [...el.querySelectorAll("span")].map(s=>s.textContent.replace(/\s+/g, " ").trim());
        const full = el.textContent.replace(/\s+/g, " ").trim();
        // CCFOLIA：<span>[分頁]</span><span>名字</span> : <span>內文</span>
        if(spans.length >= 3) return { name: spans[1], text: spans.slice(2).join(" "), full };
        if(spans.length === 2) return { name: spans[0], text: spans[1], full };
        return { name: "", text: full, full };
      }).filter(r=>r.full);
      return { title, rows };
    }
    return {
      title: "",
      rows: text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>({ name: "", text: l, full: l }))
    };
  }

  const CC_ISO_TS_RE = /^\s*[\[［]?\s*(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T]\d{1,2}:\d{2}/;
  const CC_ANY_TS_RE = /(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T]\d{1,2}:\d{2}/;

  function ccBaseName(name){
    return String(name || "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[\[［(（]\s*(all|全部?|完全版?|ログ|log)\s*[\]］)）]/gi, "")
      .replace(/[\s_　:：\-–—]+$/, "")
      .trim().toLowerCase();
  }

  // 從擲骰寫法推測系統（CCB→6版／CC→7版／六面骰池→Emoklore 等）
  function detectCcfoliaSystem(scenario, body){
    const named = detectSystemFromText(scenario);
    if(named) return named;
    const t = desmallcaps(String(body || "")).normalize("NFKC");
    if(/エモクロア|emoklore/i.test(t)) return "エモクロア";
    const ccb = (t.match(/(?:^|[^a-z])ccb\s*(?:<=|＜＝|\()/gi) || []).length;
    const cc  = (t.match(/(?:^|[^a-z])cc\s*(?:\([^)]*\))?\s*(?:<=|＜＝|\()/gi) || []).length;
    if(ccb || cc) return ccb >= cc ? "CoC 6版" : "CoC 7版";
    // Emoklore：以 2D6 骰池判定「成功數／大成功」
    const pool = (t.match(/\b[1-9]\s*d6\b/gi) || []).length;
    if(pool >= 6 && /成功数|決定的成功|フルスペック|◇+/.test(t)) return "エモクロア";
    return detectSystemFromText(t.slice(0, 20000));
  }

  // 把一份聊天紀錄當成一場團來解析
  function parseCcfoliaLog({ name, text, mtime }){
    const speakers = new Map();
    const diceDates = new Set();
    const allTsDates = new Set();
    let bodyText = "", firstTsDate = "";
    const { title, rows } = chatLogLines(text);
    let scenario = (title && title !== "ccfolia - logs") ? cleanRoomName(title) : "";
    // 時間戳記不一定在行首。行首或行內任一種達到一定數量就採用
    const isoTsCount = rows.filter(r=>CC_ISO_TS_RE.test(r.full)).length;
    const anyTsCount = rows.filter(r=>CC_ANY_TS_RE.test(r.full)).length;
    const useTimestamps = (isoTsCount >= 10 && isoTsCount >= rows.length * 0.4) || anyTsCount >= 3;
    rows.forEach(({ name: spName, text: body, full })=>{
      bodyText += full + "\n";
      let lineDate = "";
      if(useTimestamps){
        const m = full.match(CC_ANY_TS_RE);
        if(m){
          lineDate = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
          allTsDates.add(lineDate);
          if(!firstTsDate) firstTsDate = lineDate;
        }
      }
      let nm = cleanSpeakerName(spName);
      let msg = body;
      if(!nm){
        const cleaned = body
          .replace(/^\s*[\[［][^\]］]*[\]］]\s*/, "")
          .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*/, "");
        const m = cleaned.match(/^([^:：\n]{1,24}?)\s*[:：]\s+(\S.*)$/);
        if(!m) return;
        nm = cleanSpeakerName(m[1]);
        msg = m[2];
      }
      if(!nm || nm.length > 24) return;
      if(/^(system|システム|bcdice|dicebot|ダイスbot|ダイス(ロール)?|情報)$/i.test(nm)) return;
      if(isNoiseSpeaker(nm)) return;
      if(!speakers.has(nm)) speakers.set(nm, { name: nm, msgCount: 0, diceCount: 0 });
      const s = speakers.get(nm);
      s.msgCount++;
      if(DICE_RE.test(msg)){
        s.diceCount++;
        if(lineDate) diceDates.add(lineDate);
      }
    });
    const scen = scenario || deriveScenarioFromFilename(name);
    // 以有擲骰的日子為優先；沒有的話就用所有帶時間戳記的日期
    const dateList = (diceDates.size ? [...diceDates] : [...allTsDates]).sort();
    return {
      base: ccBaseName(name),
      scenario: scen,
      system: detectCcfoliaSystem(scen, bodyText),
      dateList,
      fallbackDate: firstTsDate || (mtime ? new Date(mtime).toISOString().slice(0, 10) : ""),
      speakers
    };
  }

  function ccSessionSpeakerList(session){
    const list = [...session.speakers.values()]
      .filter(s=>s.fromJson || s.msgCount >= 2 || s.diceCount >= 1)
      .sort((a, b)=> (b.diceCount - a.diceCount) || (b.msgCount - a.msgCount) || (b.fromJson ? 1 : 0) - (a.fromJson ? 1 : 0));
    autoAssignSpeakers(list);
    return list;
  }

  // 場次（已解析）→ 試算表用的列物件
  function ccSessionToRow(session){
    const list = ccSessionSpeakerList(session);
    const selfNames = getSelfNames();
    const kp = [...new Set(list.filter(s=>s.role === "kp").map(s=>s.name).filter(n=>!CC_ROLE_LABEL_RE.test(n)))];
    const pl = [...new Set(list.filter(s=>s.role === "pl").map(s=>s.name))];
    const pc = list.filter(s=>s.role === "pc").map(s=>s.name);
    let role = "";
    if(kp.some(n=>selfNames.has(normalizePersonName(n)))) role = "KP";
    else if(pc.concat(pl).some(n=>selfNames.has(normalizePersonName(n)))) role = "PL";
    else if(kp.length) role = "PL";
    return {
      date: session.dateList.length ? session.dateList.join(", ") : (session.fallbackDate || ""),
      scenario: session.scenario,
      system: session.system,
      role,
      gm: kp.join("、"),
      players: pl.join("、"),
      pc: pc.join(" / ")
    };
  }

  // [欄位 key, 字典 key]；GM／PL／PC 兩種語言相同，不查字典
  const CC_SHEET_COLS = [
    ["date", "col.date"], ["scenario", "col.scenario"], ["system", "col.system"],
    ["role", "col.role"], ["gm", ""], ["players", ""], ["pc", ""]
  ];
  function ccSheetColumnNames(){
    return CC_SHEET_COLS.map(([key, labelKey])=>labelKey ? T(labelKey) : ({ gm: "GM", players: "PL", pc: "PC" }[key]));
  }

  function ccRowToCells(row){
    const applied = normalizeImportedRow(applySelfRole(coerceImportValues({ ...row })));
    return CC_SHEET_COLS.map(([key])=>{
      if(key === "date") return (applied.dates && applied.dates.length ? applied.dates.join(", ") : (applied.date || ""));
      return applied[key] || "";
    });
  }

  async function handleCcfoliaFiles(event){
    const files = [...(event.target.files || [])];
    if(!files.length) return;
    els.ccfoliaFileName.textContent = files.map(f=>f.name).join("、");
    const loaded = await Promise.all(files.map(f=>f.text().then(text=>({ name: f.name, text, mtime: f.lastModified || 0 }))));

    const jsonFiles = [], logFiles = [];
    loaded.forEach(f=>{
      const looksJson = /\.json$/i.test(f.name) || /^\s*\{[\s\S]{0,600}"(kind|data|characters|name|params)"/.test(f.text);
      (looksJson ? jsonFiles : logFiles).push(f);
    });

    let jsonRoom = "";
    const jsonChars = new Set();
    const jsonCharsByBase = new Map();
    jsonFiles.forEach(jf=>{
      try{
        const data = JSON.parse(jf.text);
        const room = findRoomName(data);
        if(room && !jsonRoom) jsonRoom = cleanRoomName(room);
        const names = new Set();
        collectCharacterNames(data, names);
        const base = ccBaseName(jf.name);
        names.forEach(nm=>{
          const clean = cleanSpeakerName(nm);
          if(!clean || clean.length > 24 || isNoiseSpeaker(clean)) return;
          jsonChars.add(clean);
          if(!jsonCharsByBase.has(base)) jsonCharsByBase.set(base, new Set());
          jsonCharsByBase.get(base).add(clean);
        });
      }catch(_error){ /* 不是有效的 JSON，略過 */ }
    });

    let sessions = logFiles.map(parseCcfoliaLog);

    // 沒有聊天紀錄、只有房間資料 → 當成一場團
    if(!sessions.length && (jsonRoom || jsonChars.size)){
      const latestMtime = loaded.reduce((m, f)=>Math.max(m, f.mtime || 0), 0);
      sessions = [{
        base: "",
        scenario: jsonRoom,
        system: jsonRoom ? detectSystemFromText(jsonRoom) : "",
        dateList: [],
        fallbackDate: latestMtime ? new Date(latestMtime).toISOString().slice(0, 10) : "",
        speakers: new Map()
      }];
    }

    // 把房間資料的線索套用到每一場
    sessions.forEach(session=>{
      if(!session.scenario && jsonRoom) session.scenario = jsonRoom;
      if(!session.system && jsonRoom) session.system = detectSystemFromText(jsonRoom) || session.system;
      let chars = null;
      if(sessions.length === 1) chars = jsonChars;
      else if(jsonCharsByBase.has(session.base)) chars = jsonCharsByBase.get(session.base);
      if(chars) chars.forEach(nm=>{
        if(!session.speakers.has(nm)) session.speakers.set(nm, { name: nm, msgCount: 0, diceCount: 0, fromJson: true });
        else session.speakers.get(nm).fromJson = true;
      });
    });

    if(sessions.length >= 2){
      routeCcfoliaSessionsToSheet(sessions);
    }else{
      applyCcfoliaSessionToForm(sessions[0] || { scenario: "", system: "", dateList: [], fallbackDate: "", speakers: new Map() });
    }
    els.ccfoliaFileInput.value = "";
  }

  // 單一場次 → 原本的編輯表單
  function applyCcfoliaSessionToForm(session){
    importCcfolia.scenario = session.scenario;
    importCcfolia.system = session.system;
    importCcfolia.date = session.dateList.length
      ? session.dateList.join(", ")
      : (session.fallbackDate || "");
    importCcfolia.speakers = ccSessionSpeakerList(session);

    els.ccScenario.value = importCcfolia.scenario;
    els.ccDate.value = importCcfolia.date;
    els.ccSystem.value = importCcfolia.system;
    els.ccfoliaForm.hidden = false;
    renderSpeakerList();
    syncCcfoliaFieldsFromSpeakers();
    renderCcfoliaPreview();

    els.ccfoliaParseMsg.hidden = false;
    els.ccfoliaParseMsg.textContent = importCcfolia.speakers.length
      ? T("cc.speakersFound", importCcfolia.speakers.length)
      : T("cc.speakersNone");
  }

  // 多個場次 → 每一場各轉成試算表的一列
  function routeCcfoliaSessionsToSheet(sessions){
    if(els.ccfoliaForm) els.ccfoliaForm.hidden = true;
    const columns = ccSheetColumnNames();
    const mapping = CC_SHEET_COLS.map(c=>c[0]);
    const rows = sessions.map(session=>ccRowToCells(ccSessionToRow(session)));
    switchImportTab("sheet");
    setSheetData(columns, mapping, rows, T("cc.multiToSheet", sessions.length));
    if(els.ccfoliaParseMsg){
      els.ccfoliaParseMsg.hidden = false;
      els.ccfoliaParseMsg.textContent = T("cc.multiFound", sessions.length);
    }
  }

  const CC_PC_DICE_THRESHOLD = 20;

  function autoAssignSpeakers(list = importCcfolia.speakers){
    const selfNames = getSelfNames();
    list.forEach((s)=>{
      const isSelf = selfNames.has(normalizePersonName(s.name));
      // KP／DL／GM／戰鬥用 KP 這類標籤名稱不算 PC
      if(CC_ROLE_LABEL_RE.test(s.name)){ s.role = "kp"; return; }
      if(/\bNPC\b|ＮＰＣ|モブ|背景|エキストラ/i.test(s.name)){ s.role = ""; return; }
      if(s.fromJson){ s.role = "pc"; return; }
      if(isSelf && s.diceCount < CC_PC_DICE_THRESHOLD){ s.role = "kp"; return; }
      // 擲骰 20 次以上才算 PC
      s.role = s.diceCount >= CC_PC_DICE_THRESHOLD ? "pc" : "";
    });
  }

  function renderSpeakerList(){
    if(!els.ccSpeakers) return;
    els.ccSpeakers.innerHTML = importCcfolia.speakers.map((s, i)=>{
      const opts = [["pc", "PC"], ["pl", "PL"], ["kp", "KP / GM"], ["", T("cc.exclude")]]
        .map(([v, label])=>`<option value="${v}" ${s.role === v ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
      const parts = [];
      if(s.fromJson) parts.push(T("cc.piece"));
      if(s.msgCount) parts.push(T("cc.messages", s.msgCount));
      if(s.diceCount) parts.push(T("cc.dice", s.diceCount));
      const meta = escapeHtml(parts.join("・") || "—");
      return `<label class="cc-speaker"><span class="cc-speaker-name">${escapeHtml(s.name)}</span><span class="cc-speaker-meta">${meta}</span><select data-speaker="${i}">${opts}</select></label>`;
    }).join("");
  }

  // KP／DL／GM／戰鬥用 KP／副 KP／KP（戰鬥用）…不算 PC
  const CC_ROLE_LABEL_RE = /^\s*(?:sub|サブ|副|戦闘用?|バトル|裏方?|進行)?\s*(?:kpc?|skp|dl|gmc?|game\s*master|master|マスター|キーパー|ディーラー|ゲームマスター?|ゲームマスタ)\s*(?:[（(][^）)]*[）)])?\s*$/i;

  function derivedCcGm(){
    return importCcfolia.speakers.filter(s=>s.role === "kp").map(s=>s.name).filter(n=>!CC_ROLE_LABEL_RE.test(n));
  }
  function derivedCcPl(){
    return importCcfolia.speakers.filter(s=>s.role === "pl").map(s=>s.name);
  }
  function derivedCcRole(){
    const selfNames = getSelfNames();
    const kpNames = importCcfolia.speakers.filter(s=>s.role === "kp").map(s=>normalizePersonName(s.name));
    if(kpNames.some(n=>selfNames.has(n)) || (kpNames.length && !importCcfolia.speakers.some(s=>s.role === "pc" && selfNames.has(normalizePersonName(s.name))))) return "KP";
    if(importCcfolia.speakers.some(s=>(s.role === "pc" || s.role === "pl") && selfNames.has(normalizePersonName(s.name)))) return "PL";
    return kpNames.length ? "PL" : "";
  }

  function syncCcfoliaFieldsFromSpeakers(){
    if(els.ccGm) els.ccGm.value = [...new Set(derivedCcGm())].join("、");
    if(els.ccPl) els.ccPl.value = [...new Set(derivedCcPl())].join("、");
    if(els.ccRole) els.ccRole.value = derivedCcRole();
  }

  function ccfoliaRow(){
    const pcs = importCcfolia.speakers.filter(s=>s.role === "pc").map(s=>s.name);
    const scenario = (els.ccScenario?.value || importCcfolia.scenario || "").trim();
    const gm = (els.ccGm?.value || "").trim();
    if(!scenario && !pcs.length && !gm) return null;
    return {
      scenario,
      date: (els.ccDate?.value || importCcfolia.date || "").trim(),
      system: (els.ccSystem?.value || importCcfolia.system || "").trim(),
      role: (els.ccRole?.value || "").trim(),
      gm,
      players: (els.ccPl?.value || "").trim(),
      pc: pcs.join(" / ")
    };
  }

  function renderCcfoliaPreview(){
    const row = ccfoliaRow();
    if(els.ccToSheetBtn) els.ccToSheetBtn.disabled = !row;
    if(!row){
      if(els.importPreviewArea) els.importPreviewArea.hidden = true;
      updateRunImportEnabled();
      return;
    }
    renderImportPreview([normalizeImportedRow(applySelfRole(coerceImportValues({ ...row })))]);
  }

  function convertCcfoliaToSheet(){
    const row = ccfoliaRow();
    if(!row) return;
    const columns = ccSheetColumnNames();
    const mapping = CC_SHEET_COLS.map(c=>c[0]);
    switchImportTab("sheet");
    setSheetData(columns, mapping, [ccRowToCells(row)], T("cc.converted"));
  }

  function handleJsonFilePicked(event){
    const file = event.target.files?.[0];
    if(!file){ jsonImportPayload = null; updateRunImportEnabled(); return; }
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const parsed = JSON.parse(String(reader.result));
        if(!parsed || !Array.isArray(parsed.rows)) throw new Error("no rows");
        jsonImportPayload = parsed;
        if(els.jsonFileName) els.jsonFileName.textContent = T("json.fileRows", file.name, parsed.rows.length);
      }catch(error){
        console.error(error);
        jsonImportPayload = null;
        if(els.jsonFileName) els.jsonFileName.textContent = T("json.readError");
      }
      updateRunImportEnabled();
    };
    reader.readAsText(file);
  }

  function ensureColumnsForKeys(keys){
    keys.forEach(key=>{
      if(state.columns.some(col=>col.key === key)) return;
      const optional = optionalColumns.find(col=>col.key === key);
      if(optional) showColumn(optional);
    });
  }

  function runImport(){
    const target = getImportTarget();
    const tab = activeImportTab();
    let importedRows = [];
    let importedColumns = null;

    if(tab === "json"){
      if(!jsonImportPayload) return;
      importedRows = jsonImportPayload.rows.map(row=>normalizeImportedRow(row));
      importedColumns = Array.isArray(jsonImportPayload.columns) ? jsonImportPayload.columns : null;
    }else if(tab === "text"){
      importedRows = buildReportRows().map(row=>({ ...row, id: cryptoId() }));
      if(!importedRows.length){ alert(T("import.noReports")); return; }
    }else{
      importedRows = buildSheetRows().map(row=>({ ...row, id: cryptoId() }));
      if(!importedRows.length){ alert(T("import.noRows")); return; }
    }

    if(els.dupSkipInput?.checked){
      const seen = new Set(target === "overwrite" ? [] : state.rows.map(sessionDupKey).filter(Boolean));
      importedRows = importedRows.filter(row=>{
        const k = sessionDupKey(row);
        if(!k) return true;
        if(seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    importedRows = importedRows.map(row=>({ ...row, id: row.id || cryptoId() }));
    const importedIds = importedRows.map(row=>row.id);

    if(target === "overwrite"){
      state = {
        rows: importedRows,
        columns: importedColumns && importedColumns.length ? importedColumns : clone(defaultColumns),
        migrations: { ...(state.migrations || {}), hashtagOptional: true, reportedColumn: true }
      };
    }else{
      state.rows = [...state.rows, ...importedRows];
      if(importedColumns) state.columns = mergeColumns(state.columns, importedColumns);
    }

    if(tab === "sheet"){
      ensureColumnsForKeys([...new Set(importSheet.mapping.filter(Boolean))]);
    }else if(tab === "text"){
      const keys = new Set();
      importedRows.forEach(row=>["hashtag", "ending", "survival", "campaign", "ho"].forEach(k=>{ if(row[k]) keys.add(k); }));
      ensureColumnsForKeys([...keys]);
    }

    activeId = importedIds[0] || state.rows[0]?.id || null;
    saveAndRender();
    els.importDialog.close();
    revealImportedRows(importedIds);
  }

  function revealImportedRows(ids){
    const count = ids.length;
    showLogToast(count ? T("import.doneCount", count) : T("import.done"));
    if(!count) return;
    const idSet = new Set(ids);
    requestAnimationFrame(()=>{
      const findRows = ()=>[...(els.tableBody?.querySelectorAll("tr[data-row-id]") || [])]
        .filter(tr=>idSet.has(tr.dataset.rowId));
      let trs = findRows();
      if(!trs.length){
        // 匯入的列被目前的篩選條件藏起來了 → 解除篩選，讓使用者看得到
        if(els.searchInput) els.searchInput.value = "";
        if(els.systemFilter) els.systemFilter.value = "";
        if(els.roleFilter) els.roleFilter.value = "";
        renderTable();
        trs = findRows();
      }
      trs.forEach(tr=>{
        tr.classList.add("row-just-imported");
        setTimeout(()=>tr.classList.remove("row-just-imported"), 2400);
      });
      trs[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  let logToastTimer = null;
  function showLogToast(message){
    let el = document.getElementById("logToast");
    if(!el){
      el = document.createElement("div");
      el.id = "logToast";
      el.className = "log-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(logToastTimer);
    logToastTimer = setTimeout(()=>el.classList.remove("is-visible"), 2600);
  }

  function downloadImportTemplate(){
    const headers = SHEET_TARGET_FIELDS
      .filter(([key])=>!["longNote", "scenarioCountKey"].includes(key))
      .map(([key])=>sheetFieldShortLabel(key));
    const coPlayers = (...numbers)=>numbers.map(n=>T("sample.coplayer", n)).join("、");
    const examples = [
      ["2024-01-06", T("template.scenario", 1), labelFor(SYSTEM_LABEL_KEYS, "CoC 6版"), "PL", T("sample.gm"), coPlayers(1, 2), T("sample.investigator", 1), labelFor(STATUS_LABEL_KEYS, "完結"), "4", T("template.memo"), "", T("template.hashtag"), "END A", labelFor(SURVIVAL_LABEL_KEYS, "生還"), "", "", ""],
      ["2024/2/10, 2024/2/17", T("template.scenario", 2), labelFor(SYSTEM_LABEL_KEYS, "CoC 7版"), "KP", T("sample.self"), coPlayers(3, 4, 5), "", labelFor(STATUS_LABEL_KEYS, "継続"), "6", T("template.multiDates"), T("template.campaign"), "", "", "", "", "", ""]
    ];
    const csv = "﻿" + [headers, ...examples].map(cells=>cells.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "session-log-import-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function csvCell(value){
    const text = String(value == null ? "" : value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function normalizeImportedRow(row){
    const next = { ...row };
    if(!next.id) next.id = cryptoId();
    normalizeRowDates(next);
    if(!next.status) next.status = "新規";
    if(next.system === "エモクロアTRPG") next.system = "エモクロア";
    if(next.system === "マルチシステム") next.system = "マダミス";
    if(next.role && normalizeRoleGroup(next.role) === "GM" && !ROLE_OPTIONS.includes(next.role)) next.role = "GM";
    return next;
  }

  function mergeColumns(currentColumns, importedColumns){
    const merged = Array.isArray(currentColumns) && currentColumns.length ? [...currentColumns] : clone(defaultColumns);
    importedColumns.forEach(column=>{
      if(!column || !column.key) return;
      if(column.key === "hashtag") return;
      if(!merged.some(existing=>existing.key === column.key)){
        const reportIndex = merged.findIndex(existing=>existing.key === "report");
        const insertColumn = { ...column, width: clampColumnWidth(column.key, Number(column.width) || COLUMN_DEFAULT_WIDTHS[column.key] || 140) };
        if(reportIndex >= 0) merged.splice(reportIndex,0,insertColumn);
        else merged.push(insertColumn);
      }
    });
    return merged;
  }

  const SYSTEM_SORT_PRIORITY = ["CoC 6版", "CoC 7版", "エモクロア", "マダミス"];

  function setExportMode(mode){
    if(!EXPORT_MODES.includes(mode)) return;
    exportMode = mode;
    (els.exportModeButtons || []).forEach(btn=>btn.classList.toggle("is-active", btn.dataset.exportMode === mode));
    renderExport();
  }

  function renderExport(){
    if(!els.textExportOutput) return;
    const rows = getExportRows();
    let output = "";
    if(exportMode === "system") output = buildSystemText(rows);
    else if(exportMode === "role") output = buildRoleText(rows);
    else if(exportMode === "sessions") output = buildSessionsText(rows);
    else output = buildAllScenarioText(rows);
    els.textExportOutput.value = output;
    updateExportHint(rows);
  }

  function getExportRows(){
    const q = String(exportQuery || "").trim().toLocaleLowerCase("ja");
    const rows = state.rows.filter(row=>{
      if(row.sample) return false;
      if(!q) return true;
      return [row.scenario, row.gm, row.players, row.pc, row.note, row.campaign]
        .some(value=>String(value || "").toLocaleLowerCase("ja").includes(q));
    });
    return rows.sort((a,b)=>exportPrimaryDate(a).localeCompare(exportPrimaryDate(b)));
  }

  function exportPrimaryDate(row){
    return getPrimaryDate(row) || "9999-99-99";
  }

  function updateExportHint(rows){
    if(!els.exportSearchHint) return;
    const q = String(exportQuery || "").trim();
    if(!q){ els.exportSearchHint.textContent = ""; return; }
    if(!rows.length){ els.exportSearchHint.textContent = T("export.noMatch", q); return; }
    els.exportSearchHint.textContent = T("export.match", q, rows.length, uniqueScenarioList(rows).length);
  }

  function displayScenarioName(row){
    return normalizeScenarioForCount(row.scenario) || String(row.scenario || "").trim() || T("export.unset");
  }

  function plCountLabel(row){
    return `${Math.max(splitPeople(row.players).length, 1)}PL`;
  }

  // 分組用的 key 與畫面上的名稱分開，分組結果不會因語言而變
  function roleGroupKey(row){
    const group = normalizeRoleGroup(row.role);
    if(group === "GM" || group === "PL") return group;
    return "other";
  }

  function roleGroupDisplay(groupKey){
    if(groupKey === "GM") return "KP / GM";
    if(groupKey === "PL") return "PL";
    return T("export.roleOther");
  }

  // 把多列合併成不重複的劇本（以 scenarioCountKey 為 key），
  // 保留日期最早的那一列當代表，並計算玩過幾次。
  function uniqueScenarioList(rows){
    const map = new Map();
    rows.forEach(row=>{
      const key = scenarioCountKey(row).toLocaleLowerCase("ja");
      if(!key) return;
      const date = exportPrimaryDate(row);
      const existing = map.get(key);
      if(!existing){
        map.set(key, { row, count: 1, firstDate: date });
      }else{
        existing.count += 1;
        if(date < existing.firstDate){ existing.firstDate = date; existing.row = row; }
      }
    });
    return [...map.values()].sort((a,b)=>a.firstDate.localeCompare(b.firstDate));
  }

  function groupBy(items, keyFn){
    const groups = new Map();
    items.forEach(item=>{
      const key = keyFn(item) || T("export.unset");
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return groups;
  }

  function sortedSystemGroups(groups){
    return [...groups.entries()].sort((a,b)=>{
      const ia = SYSTEM_SORT_PRIORITY.indexOf(a[0]);
      const ib = SYSTEM_SORT_PRIORITY.indexOf(b[0]);
      if(ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return String(a[0]).localeCompare(String(b[0]), "ja");
    });
  }

  function plCountSections(entries){
    const byCount = groupBy(entries, entry=>plCountLabel(entry.row));
    return [...byCount.entries()]
      .sort((a,b)=>parseInt(a[0], 10) - parseInt(b[0], 10))
      .map(([count, items])=>{
        const lines = items.map((entry, index)=>`　　${index + 1}. ${displayScenarioName(entry.row)}`).join("\n");
        return `　${count}\n${lines}`;
      }).join("\n");
  }

  function buildAllScenarioText(rows){
    const list = uniqueScenarioList(rows);
    if(!list.length) return "";
    const header = T("export.allHead", list.length, rows.length);
    const lines = list.map((entry, index)=>{
      const times = entry.count > 1 ? `（×${entry.count}）` : "";
      return `${index + 1}. ${displayScenarioName(entry.row)}${times}　${entry.firstDate}`;
    });
    return `${header}\n\n${lines.join("\n")}`;
  }

  function buildSystemText(rows){
    const list = uniqueScenarioList(rows);
    if(!list.length) return "";
    const bySystem = groupBy(list, entry=>entry.row.system || T("export.noSystem"));
    return sortedSystemGroups(bySystem)
      .map(([system, entries])=>`${T("export.systemHead", labelFor(SYSTEM_LABEL_KEYS, system), entries.length)}\n${plCountSections(entries)}`)
      .join("\n\n");
  }

  function buildRoleText(rows){
    const byRole = groupBy(rows, roleGroupKey);
    const order = ["PL", "GM", "other"];
    return order
      .filter(roleKey=>byRole.get(roleKey)?.length)
      .map(roleKey=>{
        const list = uniqueScenarioList(byRole.get(roleKey));
        const bySystem = groupBy(list, entry=>entry.row.system || T("export.noSystem"));
        const body = sortedSystemGroups(bySystem)
          .map(([system, entries])=>`【${labelFor(SYSTEM_LABEL_KEYS, system)}】\n${plCountSections(entries)}`)
          .join("\n\n");
        return `${T("export.roleHead", roleGroupDisplay(roleKey), list.length)}\n${body}`;
      }).join("\n\n\n");
  }

  function buildSessionsText(rows){
    if(!rows.length) return "";
    const header = T("export.sessionsHead", rows.length);
    const blocks = rows.map((row, index)=>{
      const date = getDateDisplay(row) || T("export.noDate");
      const role = normalizeRoleGroup(row.role) === "GM" ? "KP/GM" : (row.role || "-");
      const head = `${index + 1}. ${date}　${row.system ? labelFor(SYSTEM_LABEL_KEYS, row.system) : "-"}　${role}　${String(row.scenario || "").trim() || T("export.unset")}`;
      const people = [];
      if(row.gm) people.push(`KP/GM: ${row.gm}`);
      if(row.players) people.push(`PL: ${row.players}`);
      if(row.pc) people.push(`PC: ${row.pc}`);
      return people.length ? `${head}\n　${people.join(" ／ ")}` : head;
    });
    return `${header}\n\n${blocks.join("\n")}`;
  }

  async function copyExportOutput(){
    const text = els.textExportOutput?.value || "";
    if(!text) return;
    try{
      await navigator.clipboard.writeText(text);
    }catch(_error){
      els.textExportOutput.select();
      document.execCommand("copy");
    }
    flashButtonLabel(els.exportCopyBtn, T("export.copied"));
  }

  function flashButtonLabel(button, message){
    if(!button) return;
    if(!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.textContent = message;
    clearTimeout(button._flashTimer);
    button._flashTimer = setTimeout(()=>{ button.textContent = button.dataset.originalLabel; }, 1400);
  }

  function getAllExtraColumns(){
    const map = new Map();
    [...optionalColumns, ...(state.customColumns || []), ...(state.hiddenColumns || []).filter(col=>col.custom)].forEach(col=>map.set(col.key, col));
    return [...map.values()];
  }

  function getDialogColumns(){
    const map = new Map();
    defaultColumns.filter(col=>col.key !== "report" && col.key !== "reported").forEach(col=>map.set(col.key, col));
    getAllExtraColumns().forEach(col=>map.set(col.key, col));
    state.columns.filter(col=>!col.locked).forEach(col=>map.set(col.key, col));
    return [...map.values()];
  }

  function getColumnLabel(col){
    const defaultColumn = defaultColumns.find(item=>item.key === col.key);
    const extraColumn = optionalColumns.find(item=>item.key === col.key);
    return extraColumn?.label || defaultColumn?.label || col.label || col.key;
  }

  function isUrlColumn(key){ return /Url$/.test(String(key || "")); }

  function updateReportStickyState(){
    const scroll = document.querySelector(".table-scroll");
    if(!scroll) return;
    const atEnd = Math.ceil(scroll.scrollLeft + scroll.clientWidth) >= scroll.scrollWidth - 8;
    scroll.classList.toggle("is-scrolled-end", atEnd);
  }

  function saveAndRender(){ saveState(); renderAll(); }
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw) return JSON.parse(raw);
    }catch(_error){}
    return { rows: createDefaultRows(), columns: clone(defaultColumns) };
  }
  function saveState(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function cryptoId(){ return `session_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
  function unique(values){ return [...new Set(values)]; }

  function getSelfNames(){
    const stored = localStorage.getItem(SELF_NAMES_KEY);
    const userNames = stored ? stored.split(/[、,\/\n]/).map(normalizePersonName).filter(Boolean) : [];
    return new Set([...DEFAULT_SELF_NAMES.map(normalizePersonName), ...userNames]);
  }

  function normalizePersonName(value){
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/[\s　]+/g, "")
      .replace(/[。．.]+$/g, "。");
  }

  function splitPeople(value){
    // 以「、」「,」為主要分隔符號。間隔號「・」「･」可能是
    // 「約翰・史密斯」這類外文名字的一部分，
    // 為了不把 PL／PC／GM 的人數切錯，不當作分隔符號。
    return String(value || "")
      .split(/[、,，\/／&＆＋+;；\n\r]+|\s+と\s+|\s+and\s+/i)
      .map(v=>v.trim())
      .filter(Boolean);
  }

  function countCoPlayers(rows){
    const selfNames = getSelfNames();
    const people = new Set();
    rows.forEach(row=>{
      // GM／KP／DL 與 PL 兩欄的人都算同團玩家。
      // 例：GM=「甲」、PL=「乙、丙」、自己=「乙」→ 計入「甲」與「丙」。
      [row.gm, row.players].forEach(fieldValue=>{
        splitPeople(fieldValue).forEach(name=>{
          const normalized = normalizePersonName(name);
          if(normalized && !selfNames.has(normalized)) people.add(normalized);
        });
      });
    });
    return people.size;
  }


  function fieldInputMarkup(col, row){
    const value = row[col.key] || "";
    if(col.key === "date") return dateInputsMarkup(row);
    if(col.key === "system"){
      const isKnown = SYSTEM_OPTIONS.includes(value);
      const options = SYSTEM_OPTIONS.map(option=>`<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(labelFor(SYSTEM_LABEL_KEYS, option))}</option>`).join("");
      return `<select name="system" data-system-select><option value="__custom" ${!isKnown && value ? "selected" : ""}>${escapeHtml(T("form.customSystem"))}</option>${options}</select><input name="systemCustom" data-system-custom value="${escapeAttr(isKnown ? "" : labelFor(SYSTEM_LABEL_KEYS, value))}" placeholder="${escapeAttr(T("form.systemPlaceholder"))}" ${isKnown || !value ? "hidden" : ""} />`;
    }
    if(col.key === "role") return `<select name="${escapeAttr(col.key)}">${ROLE_OPTIONS.map(option=>`<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
    if(col.key === "status") return `<select name="status">${STATUS_OPTIONS.map(option=>`<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(labelFor(STATUS_LABEL_KEYS, option))}</option>`).join("")}</select>`;
    if(col.key === "survival") return `<select name="survival">${SURVIVAL_OPTIONS.map(option=>`<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option ? labelFor(SURVIVAL_LABEL_KEYS, option) : T("export.unset"))}</option>`).join("")}</select>`;
    if(col.key === "fav") return `<label class="fav-input"><input type="checkbox" name="fav" value="★" ${value ? "checked" : ""} /> <span>☆ / ★</span></label>`;
    if(col.key === "time") return `<span class="field-with-unit"><input name="time" type="text" inputmode="decimal" value="${escapeAttr(normalizeTimeValue(value))}" placeholder="${escapeAttr(T("form.timePlaceholder"))}" /><span class="field-unit">${escapeHtml(T("form.hoursUnit"))}</span></span>`;
    if(isUrlColumn(col.key)) return `<input type="url" name="${escapeAttr(col.key)}" value="${escapeAttr(value)}" placeholder="https://" />`;
    return `<input name="${escapeAttr(col.key)}" value="${escapeAttr(value)}" />`;
  }

  function normalizeRoleGroup(role){
    const value = String(role || "").trim().toUpperCase();
    if(["GM", "KP", "DL"].includes(value)) return "GM";
    if(value === "PL") return "PL";
    return value;
  }

  function roleClass(role){
    return normalizeRoleGroup(role) === "GM" ? "role-gm" : normalizeRoleGroup(role) === "PL" ? "role-pl" : "role-other";
  }

  function systemClass(system){
    const value = String(system || "").trim();
    if(value === "CoC 6版") return "system-coc6";
    if(value === "CoC 7版") return "system-coc7";
    if(value === "エモクロア") return "system-emoklore";
    if(value === "マダミス") return "system-madamisu";
    return "system-other";
  }


  function normalizeRowDates(row){
    let dates = Array.isArray(row.dates) ? row.dates : [];
    if(!dates.length && row.date) dates = parseDateList(row.date);
    dates = unique(dates.map(v=>String(v || "").trim()).filter(isIsoDate)).sort();
    row.dates = dates;
    row.date = dates[0] || (isIsoDate(row.date) ? row.date : "");
  }

  function parseDateList(value){
    return String(value || "")
      .split(/[、,，/／・;；\n\r]+/)
      .map(v=>v.trim().replace(/\//g,"-"))
      .filter(Boolean);
  }

  function isIsoDate(value){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function getPrimaryDate(row){
    normalizeRowDates(row);
    const dates = row.dates || [];
    return dates.length ? dates[dates.length - 1] : (row.date || "");
  }

  function getDateDisplay(row){
    normalizeRowDates(row);
    const dates = row.dates || [];
    if(!dates.length) return "";
    const latest = dates[dates.length - 1];
    return dates.length === 1 ? latest : T("date.more", latest, dates.length - 1);
  }

  function getDateTitle(row){
    normalizeRowDates(row);
    return (row.dates || []).join(" / ");
  }

  function countUniqueScenarios(rows){
    return unique(rows.map(row=>scenarioCountKey(row)).filter(Boolean)).length;
  }

  function scenarioCountKey(row){
    const explicit = String(row.scenarioCountKey || "").trim();
    if(explicit) return explicit;
    return normalizeScenarioForCount(row.scenario);
  }

  function normalizeScenarioForCount(value){
    return String(value || "")
      .normalize("NFKC")
      .replace(/[＿_]/g," ")
      .replace(/第\s*[0-9０-９一二三四五六七八九十百]+\s*陣/g,"")
      .replace(/[0-9０-９一二三四五六七八九十百]+\s*日目/g,"")
      .replace(/前編|後編|上巻|下巻|作成会|キャラシ作成会|前篇|後篇|上篇|下篇/g,"")
      .replace(/\s+/g," ")
      .trim();
  }

  function countSessionDates(rows){
    return rows.reduce((sum,row)=>{
      normalizeRowDates(row);
      return sum + Math.max((row.dates || []).length, row.date ? 1 : 0);
    },0);
  }

  function dateInputsMarkup(row){
    normalizeRowDates(row);
    const dates = row.dates?.length ? row.dates : [new Date().toISOString().slice(0,10)];
    const inputs = dates.map((date,index)=>`
      <div class="date-input-row">
        <input type="date" name="dates" value="${escapeAttr(date)}" />
        <button type="button" class="date-remove-button" data-remove-date ${dates.length <= 1 ? "disabled" : ""}>${escapeHtml(T("common.delete"))}</button>
      </div>`).join("");
    return `<div class="multi-date-field" data-multi-date-field>${inputs}<button type="button" class="date-add-button" data-add-date>${escapeHtml(T("form.addDate"))}</button></div>`;
  }

  function sumHours(rows){ return rows.reduce((sum,row)=>sum + (parseFloat(String(row.time||"").match(/[\d.]+/)?.[0] || "0") || 0),0); }

  function normalizeTimeValue(value){
    const text = String(value == null ? "" : value).trim().normalize("NFKC");
    if(!text) return "";
    const hm = text.match(/^(\d+)\s*[:：時]\s*(\d{1,2})\s*分?$/);
    if(hm){
      const hours = Number(hm[1]) + Number(hm[2]) / 60;
      return String(Math.round(hours * 100) / 100);
    }
    const num = text.match(/\d+(?:\.\d+)?/);
    return num ? num[0] : "";
  }

  function timeDisplay(value){
    const num = normalizeTimeValue(value);
    return num ? T("time.hours", num) : "";
  }
  function getCellClass(key){ return `cell-${cssSafeKey(key)} ${["scenario","players","pc","note","hashtag","date"].includes(key) ? "truncate-td" : ""}`.trim(); }

  function applyColumnWidth(element,col){
    const width = clampColumnWidth(col.key, Number(col.width) || COLUMN_DEFAULT_WIDTHS[col.key] || 140);
    element.style.width = `${width}px`;
    element.style.minWidth = `${width}px`;
    element.style.maxWidth = `${width}px`;
  }

  function clampColumnWidth(key,width){
    const min = COLUMN_MIN_WIDTHS[key] || 72;
    const max = key === "scenario" || key === "note" ? 520 : 360;
    return Math.max(min, Math.min(max, Math.round(width)));
  }

  function getDynamicTextLimit(col){
    const key = col?.key;
    const base = TABLE_TEXT_LIMITS[key] || 0;
    if(!base) return 0;
    const defaultWidth = COLUMN_DEFAULT_WIDTHS[key] || 140;
    const width = Number(col.width) || defaultWidth;
    const limit = Math.floor(base * Math.max(1, width / defaultWidth));
    return Math.min(TABLE_TEXT_LIMIT_MAX[key] || limit, Math.max(base, limit));
  }

  function textCell(value,className="",limit=0){
    const raw = String(value || "");
    const span = document.createElement("span");
    span.className = `${className} truncate-cell`.trim();
    span.title = raw;
    span.textContent = limit ? truncateText(raw, limit) : raw;
    return span;
  }

  function truncateText(value,limit){
    const text = String(value || "");
    return [...text].length > limit ? `${[...text].slice(0, limit).join("")}…` : text;
  }

  function cssSafeKey(key){ return String(key || "").replace(/[^a-zA-Z0-9_-]/g,"-"); }
  function html(markup){ const span = document.createElement("span"); span.innerHTML = markup; return span; }
  function escapeHtml(value){ return String(value).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
  function escapeAttr(value){ return escapeHtml(value).replace(/'/g,"&#039;"); }
  function setSelfNames(names){
    const value = Array.isArray(names) ? names.join("、") : String(names || "");
    localStorage.setItem(SELF_NAMES_KEY, value);
    renderStats();
  }

  function exposeApi(){
    window.SessionLogApp = { exportJson, openSessionDialog, closeDrawer, setSelfNames, openImportDialog };
  }
})();
