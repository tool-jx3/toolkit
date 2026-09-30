(() => {
  'use strict';

  /* 差分名稱建議。顯示文字依目前語言從字典取（suggest.<id>），
   * 按下去寫進輸入欄之後就是使用者的資料，不再跟著語言變。 */
  const SUGGESTION_IDS = [
    'normal', 'smile', 'angry', 'cry', 'surprise', 'confused', 'shy', 'flustered',
    'grin', 'serious', 'sorrow', 'joy', 'exasperated', 'question', 'coy', 'anxious',
    'eyesClosed', 'halfLidded', 'wink', 'injured', 'battle', 'insane', 'despair'
  ];
  /* 在使用時才取字串，避免載入時就把語言凍結。 */
  function getSuggestions() {
    return SUGGESTION_IDS.map((id) => {
      const text = T(`suggest.${id}`);
      return { label: text, value: text };
    });
  }
  /* 檔名裡的羅馬字／英文 → 建議名稱的 id（上游對照表，值原本是日文名稱）。 */
  const ROMAN_TO_SUGGESTION = [
    ['tsuujou', 'normal'], ['normal', 'normal'], ['default', 'normal'],
    ['egao', 'smile'], ['smile', 'smile'], ['ikari', 'angry'], ['angry', 'angry'],
    ['nakigao', 'cry'], ['naki', 'cry'], ['cry', 'cry'],
    ['bikkuri', 'surprise'], ['surprise', 'surprise'], ['komari', 'confused'], ['komaku', 'confused'], ['tere', 'shy'],
    ['ase', 'flustered'], ['hohoemi', 'grin'], ['shinken', 'serious'], ['kanashimi', 'sorrow'], ['hiai', 'sorrow'],
    ['yorokobi', 'joy'], ['akire', 'exasperated'], ['gimon', 'question'], ['question', 'question'], ['kobi', 'coy'], ['fuan', 'anxious'], ['me_toji', 'eyesClosed'], ['metoji', 'eyesClosed'],
    ['jitome', 'halfLidded'], ['wink', 'wink'], ['wink', 'wink'], ['fusyou', 'injured'], ['fushou', 'injured'], ['damage', 'injured'],
    ['sentou', 'battle'], ['battle', 'battle'], ['hakkyo', 'insane'], ['zekubou', 'despair'], ['zetsubou', 'despair']
  ];
  const state = {
    items: [],
    activeId: null,
    draggingId: null,
  };

  /* 目前顯示中的狀態列訊息（key 與參數），切換語言時用來重畫。 */
  let lastStatus = { key: 'status.initial', args: [], type: '' };
  /* 提示框最後一次的訊息 key（淡出後文字仍留在 DOM 裡）。 */
  let lastToastKey = 'toast.done';
  /* 原站分享網址。intent 文字跟著語言換，網址不改。 */
  const SHARE_URL = 'https://kumachansteps.github.io/trpg-web-tools/tools/chara-sabun-kanri-tool/';

  const els = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    mainNameInput: document.getElementById('mainNameInput'),
    numberToggle: document.getElementById('numberToggle'),
    fileCountPill: document.getElementById('fileCountPill'),
    suggestionChips: document.getElementById('suggestionChips'),
    suggestionList: document.getElementById('sabunSuggestions'),
    thumbList: document.getElementById('thumbList'),
    largePreview: document.getElementById('largePreview'),
    previewImage: document.getElementById('previewImage'),
    activeNamePill: document.getElementById('activeNamePill'),
    filenamePreview: document.getElementById('filenamePreview'),
    paletteOutput: document.getElementById('paletteOutput'),
    exportZipBtn: document.getElementById('exportZipBtn'),
    copyPaletteBtn: document.getElementById('copyPaletteBtn'),
    resetAllBtn: document.getElementById('resetAllBtn'),
    statusLine: document.getElementById('statusLine'),
    usageToggleBtn: document.getElementById('usageToggleBtn'),
    shortcutToggleBtn: document.getElementById('shortcutToggleBtn'),
    usagePanel: document.getElementById('usagePanel'),
    shortcutPanel: document.getElementById('shortcutPanel'),
    toastMessage: document.getElementById('toastMessage'),
    xPostBtn: document.getElementById('xPostBtn'),
  };

  function init() {
    I18N.mountSwitcher(document.getElementById('localeSelect'));
    els.numberToggle.checked = true;
    els.thumbList.setAttribute('tabindex', '0');
    renderSuggestions();
    bindEvents();
    updateOutput();
    relabel();
    I18N.onChange(relabel);
  }

  /* JS 寫進畫面的文字全部在這裡依目前語言重畫。 */
  function relabel() {
    renderSuggestionChips();
    renderThumbnails();
    updateLargePreview();
    renderStatus();
    els.toastMessage.textContent = T(lastToastKey);
    els.xPostBtn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${T('share.text')}\n${SHARE_URL}`)}`;
  }

  function bindEvents() {
    els.fileInput.addEventListener('change', (event) => addFiles(event.target.files));

    ['dragenter', 'dragover'].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove('is-dragover');
      });
    });

    els.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

    els.mainNameInput.addEventListener('input', refreshNames);
    els.numberToggle.addEventListener('change', refreshNames);

    els.exportZipBtn.addEventListener('click', exportZip);
    els.copyPaletteBtn.addEventListener('click', copyPalette);
    els.resetAllBtn.addEventListener('click', confirmAndClearAll);

    els.usageToggleBtn.addEventListener('click', () => toggleDrawer('usage'));
    els.shortcutToggleBtn.addEventListener('click', () => toggleDrawer('shortcut'));

    document.addEventListener('keydown', handleShortcuts);
  }

  function handleShortcuts(event) {
    const isMod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (isAnyDrawerOpen()) {
        closeDrawers();
      } else {
        els.resetAllBtn.click();
      }
      return;
    }

    if (!isEditable(event.target) && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      if (state.items.length > 0) {
        event.preventDefault();
        selectItemByOffset(event.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }

    if (!isMod || !event.shiftKey) return;

    const key = event.key.toLowerCase();
    if (key === 'o') {
      event.preventDefault();
      els.fileInput.click();
    } else if (key === 'e') {
      event.preventDefault();
      exportZip();
    } else if (key === 'c') {
      event.preventDefault();
      copyPalette();
    } else if (key === 'n') {
      event.preventDefault();
      els.numberToggle.checked = !els.numberToggle.checked;
      refreshNames();
      setStatus('status.numbering', 'ok', els.numberToggle.checked ? 'ON' : 'OFF');
    }
  }

  function isEditable(target) {
    /* 收錄版多了語言選單（SELECT）：焦點在選單上時，上下鍵留給選單本身。 */
    return target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  function toggleDrawer(kind) {
    const panel = kind === 'usage' ? els.usagePanel : els.shortcutPanel;
    const button = kind === 'usage' ? els.usageToggleBtn : els.shortcutToggleBtn;
    const otherPanel = kind === 'usage' ? els.shortcutPanel : els.usagePanel;
    const otherButton = kind === 'usage' ? els.shortcutToggleBtn : els.usageToggleBtn;
    const willOpen = !panel.classList.contains('is-open');

    otherPanel.classList.remove('is-open');
    otherPanel.setAttribute('aria-hidden', 'true');
    otherButton.classList.remove('is-active');
    otherButton.setAttribute('aria-expanded', 'false');

    panel.classList.toggle('is-open', willOpen);
    panel.setAttribute('aria-hidden', String(!willOpen));
    button.classList.toggle('is-active', willOpen);
    button.setAttribute('aria-expanded', String(willOpen));
  }

  function closeDrawers() {
    [els.usagePanel, els.shortcutPanel].forEach((panel) => {
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
    });
    [els.usageToggleBtn, els.shortcutToggleBtn].forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function isAnyDrawerOpen() {
    return [els.usagePanel, els.shortcutPanel].some((panel) => panel.classList.contains('is-open'));
  }

  /* 建議按鈕與 datalist 的內容。切換語言時會重畫，所以和事件綁定分開。 */
  function renderSuggestionChips() {
    const suggestions = getSuggestions();
    els.suggestionList.innerHTML = suggestions.map((item) => `<option value="${escapeHtml(item.value)}"></option>`).join('');
    els.suggestionChips.innerHTML = suggestions.map((item) => (
      `<button type="button" class="chip" data-suggestion="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`
    )).join('');
  }

  function renderSuggestions() {
    renderSuggestionChips();

    els.suggestionChips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-suggestion]');
      if (!button) return;
      const activeItem = getActiveItem();
      if (!activeItem) return setStatus('status.selectFirst', 'warn');
      activeItem.sabunName = button.dataset.suggestion;
      renderThumbnails();
      updateOutput();
      updatePreviewMeta();
    });
  }

  function addFiles(fileList) {
    const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return setStatus('status.noImages', 'warn');

    const existingKeys = new Set(state.items.map((item) => `${item.file.name}_${item.file.size}_${item.file.lastModified}`));
    const newItems = imageFiles
      .filter((file) => !existingKeys.has(`${file.name}_${file.size}_${file.lastModified}`))
      .map((file, index) => ({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}_${index}`,
        file,
        objectUrl: URL.createObjectURL(file),
        sabunName: '',
      }));

    state.items.push(...newItems);

    if (!els.mainNameInput.value.trim() && state.items[0]) {
      els.mainNameInput.value = sanitizeName(removeExtension(state.items[0].file.name).replace(/[_-]?(tsuujou|egao|ikari|nakigao|bikkuri|komari|tere|ase|normal|default|smile|angry|cry|surprise)$/i, ''));
    }

    if (!state.activeId && state.items[0]) state.activeId = state.items[0].id;
    renderThumbnails();
    updateLargePreview();
    updateOutput();
    setStatus('status.added', 'ok', newItems.length);
    els.fileInput.value = '';
  }

  function inferSabunName(filename, index) {
    const base = removeExtension(filename).toLowerCase();
    const matched = ROMAN_TO_SUGGESTION.find(([roman]) => base.includes(roman.toLowerCase()));
    if (matched) return T(`suggest.${matched[1]}`);
    return SUGGESTION_IDS[index] ? T(`suggest.${SUGGESTION_IDS[index]}`) : T('name.fallback', index + 1);
  }

  function refreshNames() {
    renderThumbnails();
    updateOutput();
    updatePreviewMeta();
  }

  function renderThumbnails() {
    els.fileCountPill.textContent = T('files.count', state.items.length);

    if (state.items.length === 0) {
      els.thumbList.innerHTML = `<div class="empty-state">${escapeHtml(T('thumbs.empty'))}</div>`;
      return;
    }

    els.thumbList.innerHTML = state.items.map((item, index) => {
      const finalName = makeOutputFilename(item, index);
      const activeClass = item.id === state.activeId ? ' is-active' : '';
      return `
        <div class="thumb-item${activeClass}" data-id="${item.id}" draggable="true" role="button" tabindex="-1" aria-label="${escapeHtml(T('thumbs.selectAria', item.file.name))}">
          <button type="button" class="thumb-button" tabindex="-1" aria-label="${escapeHtml(T('thumbs.previewAria', item.file.name))}">
            <img src="${item.objectUrl}" alt="${escapeHtml(item.file.name)}" draggable="false" />
          </button>
          <div class="thumb-meta">
            <p class="source-name">${index + 1}. ${escapeHtml(item.file.name)}</p>
            <div class="thumb-controls">
              <input type="text" value="${escapeHtml(item.sabunName)}" list="sabunSuggestions" aria-label="${escapeHtml(T('thumbs.nameAria'))}" data-name-input />
              <div class="final-name">${escapeHtml(finalName)}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    els.thumbList.querySelectorAll('.thumb-item').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('[data-name-input]')) return;
        selectItemById(row.dataset.id);
      });

      row.addEventListener('dragstart', (event) => {
        if (event.target.closest('[data-name-input]')) {
          event.preventDefault();
          return;
        }
        state.draggingId = row.dataset.id;
        row.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', row.dataset.id);
      });

      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (state.draggingId && state.draggingId !== row.dataset.id) {
          row.classList.add('is-drop-target');
          event.dataTransfer.dropEffect = 'move';
        }
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('is-drop-target');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData('text/plain') || state.draggingId;
        const targetId = row.dataset.id;
        row.classList.remove('is-drop-target');
        reorderItems(draggedId, targetId);
      });

      row.addEventListener('dragend', () => {
        state.draggingId = null;
        els.thumbList.querySelectorAll('.thumb-item').forEach((item) => {
          item.classList.remove('is-dragging', 'is-drop-target');
        });
      });

      row.querySelector('[data-name-input]').addEventListener('focus', () => {
        state.activeId = row.dataset.id;
        updateLargePreview();
        renderActiveThumbnailState();
      });

      row.querySelector('[data-name-input]').addEventListener('click', (event) => {
        event.stopPropagation();
        state.activeId = row.dataset.id;
        updateLargePreview();
        renderActiveThumbnailState();
      });

      row.querySelector('[data-name-input]').addEventListener('input', (event) => {
        const item = state.items.find((candidate) => candidate.id === row.dataset.id);
        if (!item) return;
        item.sabunName = event.target.value;
        row.querySelector('.final-name').textContent = makeOutputFilename(item, state.items.indexOf(item));
        updateOutput();
        updatePreviewMeta();
      });
    });
  }

  function selectItemById(id, { keepFocus = true } = {}) {
    if (!state.items.some((item) => item.id === id)) return;
    state.activeId = id;
    renderThumbnails();
    updateLargePreview();
    updateOutput();
    scrollActiveThumbIntoView();
    if (keepFocus) els.thumbList.focus({ preventScroll: true });
  }

  function selectItemByOffset(offset) {
    const currentIndex = Math.max(0, state.items.findIndex((item) => item.id === state.activeId));
    const nextIndex = Math.min(state.items.length - 1, Math.max(0, currentIndex + offset));
    const nextItem = state.items[nextIndex];
    if (!nextItem || nextItem.id === state.activeId) return;
    selectItemById(nextItem.id);
  }

  function reorderItems(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const fromIndex = state.items.findIndex((item) => item.id === draggedId);
    const toIndex = state.items.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const [movedItem] = state.items.splice(fromIndex, 1);
    state.items.splice(toIndex, 0, movedItem);
    state.activeId = draggedId;
    state.draggingId = null;
    renderThumbnails();
    updateLargePreview();
    updateOutput();
    scrollActiveThumbIntoView();
    setStatus('status.reordered', 'ok');
  }

  function renderActiveThumbnailState() {
    els.thumbList.querySelectorAll('.thumb-item').forEach((row) => {
      row.classList.toggle('is-active', row.dataset.id === state.activeId);
    });
  }

  function scrollActiveThumbIntoView() {
    const activeRow = els.thumbList.querySelector('.thumb-item.is-active');
    if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
  }

  function updateLargePreview() {
    const activeItem = getActiveItem();
    if (!activeItem) {
      els.largePreview.classList.remove('has-image');
      els.previewImage.removeAttribute('src');
      els.activeNamePill.textContent = T('preview.noImage');
      els.filenamePreview.textContent = T('preview.filename', '-');
      return;
    }
    els.previewImage.src = activeItem.objectUrl;
    els.largePreview.classList.add('has-image');
    updatePreviewMeta();
  }

  function updatePreviewMeta() {
    const activeItem = getActiveItem();
    if (!activeItem) return;
    const index = state.items.indexOf(activeItem);
    els.activeNamePill.textContent = activeItem.sabunName || T('preview.unnamed');
    els.filenamePreview.textContent = T('preview.filename', makeOutputFilename(activeItem, index));
  }

  function updateOutput() {
    const validNames = state.items
      .map((item) => sanitizeName(item.sabunName))
      .filter(Boolean);

    els.paletteOutput.value = validNames.map((name) => `@${name}`).join('\n');
    els.exportZipBtn.disabled = state.items.length === 0;
    els.copyPaletteBtn.disabled = validNames.length === 0;
  }

  async function exportZip() {
    if (state.items.length === 0) return;
    if (typeof JSZip === 'undefined') return setStatus('status.noJszip', 'error');

    const mainName = getMainName();
    const usedNames = new Map();
    const zip = new JSZip();

    state.items.forEach((item, index) => {
      const filename = makeUniqueFilename(makeOutputFilename(item, index), usedNames);
      zip.file(filename, item.file);
    });

    zip.file('sabun-chatpalette.txt', els.paletteOutput.value);

    try {
      setStatus('status.zipping', 'warn');
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${mainName}_sabun.zip`);
      setStatus('status.zipStarted', 'ok');
      showToast('toast.zipDone');
    } catch (error) {
      console.error(error);
      setStatus('status.zipFailed', 'error');
    }
  }

  async function copyPalette() {
    const text = els.paletteOutput.value.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setStatus('status.copied', 'ok');
    } catch (error) {
      els.paletteOutput.removeAttribute('readonly');
      els.paletteOutput.select();
      document.execCommand('copy');
      els.paletteOutput.setAttribute('readonly', 'readonly');
      setStatus('status.copyFallback', 'warn');
    }
  }

  function confirmAndClearAll() {
    const ok = window.confirm(T('confirm.reset'));
    if (!ok) return;
    clearAll();
  }

  function clearAll() {
    state.items.forEach((item) => URL.revokeObjectURL(item.objectUrl));
    state.items = [];
    state.activeId = null;
    els.mainNameInput.value = '';
    els.numberToggle.checked = true;
    closeDrawers();
    renderThumbnails();
    updateLargePreview();
    updateOutput();
    setStatus('status.reset', 'ok');
  }

  function getActiveItem() {
    return state.items.find((item) => item.id === state.activeId) || state.items[0] || null;
  }

  function getMainName() {
    return sanitizeName(els.mainNameInput.value) || 'character';
  }

  function makeOutputFilename(item, fallbackIndex = 0) {
    const mainName = getMainName();
    const sabunName = sanitizeName(item.sabunName);
    const ext = getExtension(item.file.name) || 'png';
    const number = els.numberToggle.checked ? String(fallbackIndex + 1).padStart(2, '0') : '';
    return sabunName ? `${mainName}${number}_${sabunName}.${ext}` : `${mainName}${number}.${ext}`;
  }

  function makeUniqueFilename(filename, usedNames) {
    const count = usedNames.get(filename) || 0;
    usedNames.set(filename, count + 1);
    if (count === 0) return filename;

    const ext = getExtension(filename);
    const base = ext ? filename.slice(0, -(ext.length + 1)) : filename;
    return ext ? `${base}_${count + 1}.${ext}` : `${base}_${count + 1}`;
  }

  function sanitizeName(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function removeExtension(filename) {
    return filename.replace(/\.[^.]+$/, '');
  }

  function getExtension(filename) {
    const match = String(filename || '').match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /* 上游直接傳訊息字串；收錄版改傳字典 key，切換語言時才能重畫。 */
  function showToast(key = 'toast.done') {
    if (!els.toastMessage) return;
    lastToastKey = key;
    els.toastMessage.textContent = T(key);
    els.toastMessage.setAttribute('aria-hidden', 'false');
    els.toastMessage.classList.add('is-visible');

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      els.toastMessage.classList.remove('is-visible');
      els.toastMessage.setAttribute('aria-hidden', 'true');
    }, 2200);
  }

  /* 上游直接傳訊息字串；收錄版改傳字典 key 與參數，記下來以便切換語言時重畫。 */
  function setStatus(key, type = '', ...args) {
    lastStatus = { key, args, type };
    renderStatus();
  }

  function renderStatus() {
    els.statusLine.textContent = T(lastStatus.key, ...lastStatus.args);
    els.statusLine.className = `status-line ${lastStatus.type}`.trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  init();
})();
