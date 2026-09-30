function renderTypeSelectOptions() {
  const optionsHtml = Object.entries(INFO_TYPES)
    .map(([key, info]) => `<option value="${key}">${info.marker} ${info.label}</option>`)
    .join("");

  newCardType.innerHTML = optionsHtml;
  selectionCardType.innerHTML = optionsHtml;

  if (!newCardType.value || !INFO_TYPES[newCardType.value]) newCardType.value = "scene";
  if (!selectionCardType.value || !INFO_TYPES[selectionCardType.value]) selectionCardType.value = "memo";
}

function renderTypeFilters() {
  const allButton = `
    <button
      class="type-filter-btn ${activeFilter === "all" ? "active" : ""}"
      style="--icon-color: #334155;"
      data-filter="all"
      type="button"
    >${T("filter.all")}</button>
  `;

  const typeButtons = Object.entries(INFO_TYPES)
    .map(([key, info]) => `
      <button
        class="type-filter-btn ${activeFilter === key ? "active" : ""} ${key.startsWith("ho") ? "ho-filter" : ""}"
        style="--icon-color: ${info.color};"
        data-filter="${key}"
        title="${info.label}"
        type="button"
      >${info.marker} ${info.label}</button>
    `)
    .join("");

  typeFilterRow.innerHTML = allButton + typeButtons;
}

function renderCards() {
  cardsList.innerHTML = "";

  const visibleCards = activeFilter === "all"
    ? cards
    : cards.filter(card => card.type === activeFilter);

  visibleCards.forEach(card => {
    const typeInfo = INFO_TYPES[card.type] || INFO_TYPES.memo;
    const cardEl = document.createElement("div");

    cardEl.className = "card";
    cardEl.dataset.cardId = card.id;
    cardEl.style.setProperty("--card-color", typeInfo.color);

    cardEl.innerHTML = `
      <div class="card-header">
        <div class="card-type-wrap">
          <div class="card-type-label">${typeInfo.marker} ${getCardHeaderLabel(card.type)}</div>
          <button
            class="card-drag-handle"
            data-action="dragHandle"
            data-id="${escapeAttribute(card.id)}"
            title="${T("card.dragTitle")}"
            draggable="true"
            type="button"
          >☰</button>
        </div>
        <div class="card-copy-group">
          <button class="card-copy-btn" data-action="copy" data-id="${escapeAttribute(card.id)}" type="button">${T("card.copy")}</button>
          <button
            class="card-mini-btn card-ccfolia-btn"
            data-action="ccfoliaCard"
            data-id="${escapeAttribute(card.id)}"
            title="${T("card.ccfTitle")}"
            type="button"
          >${T("card.ccfSend")}</button>
        </div>
      </div>

      <div class="card-utility-row">
        <div class="type-icon-row">
          ${Object.entries(INFO_TYPES).map(([key, info]) => `
            <button
              class="type-icon-btn ${key === card.type ? "active" : ""}"
              style="--icon-color: ${info.color};"
              title="${info.label}"
              data-action="typeIcon"
              data-type="${key}"
              data-id="${escapeAttribute(card.id)}"
              type="button"
            >${info.marker}</button>
          `).join("")}
        </div>
        <div class="card-actions">
          <button data-action="duplicate" data-id="${escapeAttribute(card.id)}" type="button">${T("card.duplicate")}</button>
          <button class="danger" data-action="delete" data-id="${escapeAttribute(card.id)}" type="button">${T("card.delete")}</button>
        </div>
      </div>

      <div class="card-title-row ${card.type === "skill" ? "skill-title-row" : ""}">
        <div class="card-title-marker">${typeInfo.marker}</div>
        <span class="card-title-prefix">${getTitlePrefix(card.type)}</span>
        <input
          class="card-title-input"
          type="text"
          data-action="title"
          data-id="${escapeAttribute(card.id)}"
          value="${escapeAttribute(card.title)}"
          placeholder="${getTitlePlaceholder(card.type)}"
        >
        <span class="card-title-suffix">${getTitleSuffix(card.type)}</span>
        ${card.type === "skill" ? `
          <input
            class="card-title-input"
            type="text"
            data-action="extra"
            data-id="${escapeAttribute(card.id)}"
            value="${escapeAttribute(card.extra || "")}"
            placeholder="${T("card.skillExtraPlaceholder")}"
          >
        ` : ""}
      </div>

      <textarea
        class="card-body-textarea"
        data-action="body"
        data-id="${escapeAttribute(card.id)}"
        placeholder="${T("card.bodyPlaceholder")}"
        rows="4"
      >${escapeHtml(card.body)}</textarea>
    `;

    cardsList.appendChild(cardEl);

    const bodyTextarea = cardEl.querySelector(".card-body-textarea");
    if (bodyTextarea) adjustCardTextareaHeight(bodyTextarea);
  });
}

function adjustCardTextareaHeight(textarea) {
  if (!textarea) return;

  const computed = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(computed.lineHeight) || 17.4;
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const paddingBottom = parseFloat(computed.paddingBottom) || 0;
  const minHeight = lineHeight * 4 + paddingTop + paddingBottom;
  const defaultMaxHeight = lineHeight * 6 + paddingTop + paddingBottom;
  const currentHeight = textarea.offsetHeight || 0;

  if (currentHeight > defaultMaxHeight + 4) {
    textarea.style.overflowY = "auto";
    return;
  }

  textarea.style.height = "auto";

  const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), defaultMaxHeight);

  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > defaultMaxHeight ? "auto" : "hidden";
}

function buildCardOutput(card) {
  const typeInfo = INFO_TYPES[card.type] || INFO_TYPES.memo;
  const title = (card.title || typeInfo.label).trim();
  const body = (card.body || "").trim();

  /* 複製出去的固定字樣（資料：「」、》成功：、秘匿：）依按下複製當下的語言。 */
  if (card.type === "document") return `${typeInfo.marker} ${T("fmt.docPrefix")}${title}」\n\n${body}`;
  if (card.type === "location") return `${typeInfo.marker}【${title}】\n\n${body}`;
  if (card.type === "skill") return `${typeInfo.marker}《${title}${T("fmt.skillSuffix")}${(card.extra || "").trim()}\n\n${body}`;
  if (card.type === "npc") return `${typeInfo.marker} ${title}\n\n${body}`;
  if (["ho1", "ho2", "ho3", "ho4"].includes(card.type)) return `${typeInfo.marker}${getHoPrefix(card.type)}${title}\n\n${body}`;

  return `${typeInfo.marker}${title}\n\n${body}`;
}

function buildCcfCardPayload(card) {
  return {
    source: "scenario-snippet-builder",
    mode: "ccfoliaCard",
    title: getCcfTitle(card),
    text: getCcfText(card),
    cardType: card.type,
    typeLabel: getCardHeaderLabel(card.type),
    marker: (INFO_TYPES[card.type] || INFO_TYPES.memo).marker
  };
}

function buildCcfDeckPayload() {
  return {
    source: "scenario-snippet-builder",
    mode: "ccfoliaDeck",
    version: "2.7",
    projectName: getCurrentProjectName ? getCurrentProjectName() : "",
    exportedAt: new Date().toISOString(),
    cards: cards.map(card => ({
      id: card.id,
      title: getCcfTitle(card),
      text: getCcfText(card),
      cardType: card.type,
      typeLabel: getCardHeaderLabel(card.type),
      marker: (INFO_TYPES[card.type] || INFO_TYPES.memo).marker
    }))
  };
}

function getCcfTitle(card) {
  const typeInfo = INFO_TYPES[card.type] || INFO_TYPES.memo;
  return (card.title || typeInfo.label).trim();
}

function getCcfText(card) {
  return (card.body || "").trim();
}

function getCardHeaderLabel(type) {
  if (type === "scene") return T("type.sceneHeader");
  if (["ho1", "ho2", "ho3", "ho4"].includes(type)) return T("type.hoHeader", type.replace("ho", "HO"));
  return (INFO_TYPES[type] || INFO_TYPES.memo).label;
}

function getTitlePrefix(type) {
  if (type === "document") return T("fmt.docPrefix");
  if (type === "location") return "【";
  if (type === "skill") return "《";
  if (["ho1", "ho2", "ho3", "ho4"].includes(type)) return getHoPrefix(type);
  return "";
}

function getTitleSuffix(type) {
  if (type === "document") return "」";
  if (type === "location") return "】";
  if (type === "skill") return T("fmt.skillSuffix");
  return "";
}

function getTitlePlaceholder(type) {
  if (type === "document") return T("placeholder.document");
  if (type === "location") return T("placeholder.location");
  if (type === "skill") return T("placeholder.skill");
  if (type === "npc") return T("placeholder.npc");
  if (["ho1", "ho2", "ho3", "ho4"].includes(type)) return T("placeholder.ho");
  return T("placeholder.default");
}

function getHoPrefix(type) {
  return T("fmt.hoPrefix", type.replace("ho", "HO"));
}
