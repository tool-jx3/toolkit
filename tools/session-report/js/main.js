(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const REPORT_PENDING_IMPORT_KEY = 'trpgWebTools.sessionReportGenerator.pendingImport';

  let isResetting = false;
  let lastPreviewSelection = { start: 0, end: 0 };
  let historyStack = [];
  let redoStack = [];
  let isApplyingHistory = false;
  let manualPreviewHeight = null;
  let isPreviewDirty = false;
  let lastGeneratedPreview = '';

  // 名稱與提示在使用時才取字典（labelKey／tipKey）
  const FONT_VARIANTS = [
    { id: 'sansBoldItalic', labelKey: 'font.sansBoldItalic', tipKey: 'font.sansBoldItalicTip', chipClass: 'f-sans-bi' },
    { id: 'sansBold', labelKey: 'font.sansBold', tipKey: 'font.sansBoldTip', chipClass: 'f-sans-b' },
    { id: 'sansItalic', labelKey: 'font.sansItalic', tipKey: 'font.sansItalicTip', chipClass: 'f-sans-i' },
    { id: 'serifBoldItalic', labelKey: 'font.serifBoldItalic', tipKey: 'font.serifBoldItalicTip', chipClass: 'f-serif-bi' },
    { id: 'serifBold', labelKey: 'font.serifBold', tipKey: 'font.serifBoldTip', chipClass: 'f-serif-b' },
    { id: 'serifItalic', labelKey: 'font.serifItalic', tipKey: 'font.serifItalicTip', chipClass: 'f-serif-i' },
    { id: 'smallCaps', labelKey: 'font.smallCaps', tipKey: 'font.smallCapsTip', chipClass: 'f-smallcaps' },
    { id: 'typewriter', labelKey: 'font.typewriter', tipKey: 'font.typewriterTip', chipClass: 'f-typewriter' },
    { id: 'modernSans', labelKey: 'font.modernSans', tipKey: 'font.modernSansTip', chipClass: 'f-modern' },
    { id: 'plain', labelKey: 'font.plain', tipKey: 'font.plainTip', chipClass: 'f-plain' }
  ];

  const FONT_MAPS = {
    sansBoldItalic: { upper: 0x1D63C, lower: 0x1D656, digit: 0x1D7EC },
    sansBold: { upper: 0x1D5D4, lower: 0x1D5EE, digit: 0x1D7EC },
    sansItalic: { upper: 0x1D608, lower: 0x1D622, digit: null },
    serifBoldItalic: { upper: 0x1D468, lower: 0x1D482, digit: 0x1D7CE },
    serifBold: { upper: 0x1D400, lower: 0x1D41A, digit: 0x1D7CE },
    serifItalic: { upper: 0x1D434, lower: 0x1D44E, digit: null, lowerExceptions: { h: 'ℎ' } },
    typewriter: { upper: 0x1D670, lower: 0x1D68A, digit: 0x1D7F6 },
    modernSans: { upper: 0x1D5A0, lower: 0x1D5BA, digit: 0x1D7E2 },
    smallCaps: {
      chars: {
        A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'ꞯ',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ',
        a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ꞯ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'
      }
    }
  };

  // 系統名稱會寫進團報：依產生當下的語言取字典（null 表示兩種語言相同，不查字典）
  const SYSTEM_NAMES = {
    call_of_cthulhu: 'Call of Cthulhu',
    coc: 'CoC',
    coc6: 'CoC6',
    coc7: 'CoC7',
    new_coc: null,
    emoklore_en: 'emoklore-trpg',
    emoklore_ja: null,
    madamisu: null,
    shinobigami: null,
    insane: null,
    double_cross: null,
    sword_world_25: null,
    futari_sousa: null
  };

  function systemName(key) {
    if (!Object.prototype.hasOwnProperty.call(SYSTEM_NAMES, key)) return key;
    return SYSTEM_NAMES[key] ?? T(`system.${key}`);
  }

  // 同一個 key 在每一種語言的名稱（讀入跑團紀錄簿的資料時用來比對系統）
  function systemNamesInAllLocales(key) {
    if (SYSTEM_NAMES[key]) return [SYSTEM_NAMES[key]];
    return Object.values(I18N.messages).map(table => table[`system.${key}`]).filter(Boolean);
  }

  function cp(ch, start, base) {
    return base === null ? ch : String.fromCodePoint(base + ch.charCodeAt(0) - start);
  }

  function normalizeStyleSource(text) {
    const small = {
      'ᴀ':'A','ʙ':'B','ᴄ':'C','ᴅ':'D','ᴇ':'E','ꜰ':'F','ɢ':'G','ʜ':'H','ɪ':'I','ᴊ':'J','ᴋ':'K','ʟ':'L','ᴍ':'M','ɴ':'N','ᴏ':'O','ᴘ':'P','ꞯ':'Q','ʀ':'R','ꜱ':'S','ᴛ':'T','ᴜ':'U','ᴠ':'V','ᴡ':'W','ʏ':'Y','ᴢ':'Z'
    };
    return Array.from(String(text || '')).map(ch => small[ch] || ch).join('');
  }

  function styleText(text, variant) {
    const map = FONT_MAPS[variant];
    const source = normalizeStyleSource(text);
    if (!map || variant === 'plain') return source;
    return Array.from(source.normalize('NFKD')).map(ch => {
      if (map.chars) return map.chars[ch] || ch;
      if (/[A-Z]/.test(ch)) return cp(ch, 65, map.upper);
      if (/[a-z]/.test(ch)) return map.lowerExceptions?.[ch] || cp(ch, 97, map.lower);
      if (/[0-9]/.test(ch)) return cp(ch, 48, map.digit);
      return ch;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function populateReportStyles() {
    const select = $('reportStyle');
    const styles = window.ReportTemplate?.REPORT_STYLES || [];
    select.innerHTML = styles.map(style => `<option value="${escapeHtml(style.id)}">${escapeHtml(style.label)}</option>`).join('');
  }

  function populateFontVariants() {
    const select = $('fontVariant');
    select.innerHTML = FONT_VARIANTS.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(T(item.labelKey))}</option>`).join('');
    select.value = 'sansBoldItalic';
  }

  let chipTooltipEl = null;

  function ensureChipTooltip() {
    if (chipTooltipEl && chipTooltipEl.isConnected) return chipTooltipEl;
    chipTooltipEl = document.createElement('div');
    chipTooltipEl.className = 'font-chip-tooltip';
    chipTooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(chipTooltipEl);
    return chipTooltipEl;
  }

  function showChipTooltip(chip) {
    const text = chip?.dataset.tooltip || '';
    if (!text) return;
    const tip = ensureChipTooltip();
    tip.textContent = text;
    tip.classList.add('is-visible');
    const cr = chip.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = cr.left + cr.width / 2 - tr.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    let top = cr.top - tr.height - 8;
    if (top < 4) top = cr.bottom + 8;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function hideChipTooltip() {
    if (chipTooltipEl) chipTooltipEl.classList.remove('is-visible');
  }

  function renderFontToolbar() {
    const toolbar = $('fontToolbar');
    if (!toolbar) return;
    toolbar.innerHTML = '';
    FONT_VARIANTS.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `font-chip ${item.chipClass}`;
      button.dataset.variant = item.id;
      button.dataset.tooltip = T(item.tipKey);
      button.setAttribute('aria-label', T(item.tipKey));
      button.textContent = 'A';
      button.addEventListener('click', () => {
        pushHistory();
        $('fontVariant').value = item.id;
        updateFontToolbarActive();
        previewSelectedStyle();
      });
      button.addEventListener('mouseenter', () => showChipTooltip(button));
      button.addEventListener('mouseleave', hideChipTooltip);
      button.addEventListener('focus', () => showChipTooltip(button));
      button.addEventListener('blur', hideChipTooltip);
      toolbar.appendChild(button);
    });
    toolbar.addEventListener('scroll', hideChipTooltip, { passive: true });
    window.addEventListener('scroll', hideChipTooltip, { passive: true, capture: true });
    window.addEventListener('resize', hideChipTooltip);
    updateFontToolbarActive();
  }

  function updateFontToolbarActive() {
    const value = $('fontVariant')?.value;
    document.querySelectorAll('.font-chip').forEach(button => {
      button.classList.toggle('is-active', button.dataset.variant === value);
    });
  }

  function renderAsciiArtButtons() {
    const container = $('asciiArtContainer');
    const collection = window.ReportTemplate?.ASCII_ART_COLLECTION;
    if (!container || !collection) return;

    container.innerHTML = '';
    Object.entries(collection).forEach(([groupKey, groupData]) => {
      const group = document.createElement('div');
      group.className = 'ascii-group';
      group.dataset.group = groupKey;

      const title = document.createElement('div');
      title.className = 'ascii-group-title';
      title.textContent = groupData.label || groupKey.toUpperCase();

      const buttons = document.createElement('div');
      buttons.className = 'ascii-buttons';

      (groupData.items || []).forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        button.title = item.value;
        button.dataset.decoration = item.value;
        if (String(item.value).length > 20) button.classList.add('ascii-chip-line');
        if (String(item.label).length > 10) button.classList.add('ascii-chip-wide');
        button.addEventListener('click', () => insertDecorationAtPreviewCursor(item.value));
        buttons.appendChild(button);
      });

      group.appendChild(title);
      group.appendChild(buttons);
      container.appendChild(group);
    });
  }

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function setTodayPlaceholder() {
    $('dateText').placeholder = getTodayString();
  }

  function getSystemName() {
    const key = $('systemSelect').value;
    if (key === 'custom') return $('customSystemText').value.trim() || T('sample.systemName');
    return systemName(key);
  }

  // 敬稱勾選框的值是 none／sama／san，實際加上的字依產生當下的語言而定
  function getSuffix() {
    const value = document.querySelector('input[name="suffixChoice"]:checked')?.value || 'none';
    if (value === 'sama') return T('suffix.sama');
    if (value === 'san') return T('suffix.san');
    return 'none';
  }

  function addSuffix(name, suffix) {
    const text = String(name || '').trim();
    if (!text || suffix === 'none' || text.endsWith(suffix)) return text;
    return text + suffix;
  }

  // 「作：〇〇様」這一行依產生當下的語言組成；敬稱的判斷兩種語言的寫法都認得
  function addAuthorSuffix(name) {
    const text = String(name || '').trim().replace(/\s+(様|さん|氏|先生|樣|桑|老師)$/, '$1');
    if (!text) return '';
    if (/^(作|作者)[:：]/.test(text)) return text.replace(/^(作|作者):/, '$1：');
    const creditedName = /(?:様|さん|氏|先生|樣|桑|老師)$/.test(text) ? text : `${text}${T('author.honorific')}`;
    return `${T('author.prefix')}${creditedName}`;
  }

  function sampleName(index, type) {
    const letters = ['A','B','C','D','E','F','G','H','I'];
    return T(type === 'pc' ? 'sample.pc' : 'sample.pl', letters[index] || index + 1);
  }

  function addGM(value = '', role = 'KP') {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div>
        <label class="gm-role-label"></label>
        <select class="gm-role">
          <option value="KP">KP</option>
          <option value="DL">DL</option>
          <option value="GM">GM</option>
          <option value="KPC/KP">KPC/KP</option>
          <option value="SKP">SKP</option>
          <option value="作/KP">作/KP</option>
          <option value="進行"></option>
        </select>
      </div>
      <div>
        <label class="gm-name-label"></label>
        <input class="gm-name" value="${escapeHtml(value)}">
      </div>
      <button class="icon-button add-inline" type="button">＋</button>
      <button class="icon-button danger-inline" type="button">×</button>
    `;
    localizeGmRow(row);
    $('gmContainer').appendChild(row);
    row.querySelector('.gm-role').value = role;
    row.querySelector('.add-inline').addEventListener('click', () => addGM());
    row.querySelector('.danger-inline').addEventListener('click', () => {
      row.remove();
      previewSelectedStyle();
    });
  }

  // 程式產生的列：文字另外填入，切換語言時再呼叫一次（不動使用者輸入的值）
  function localizeGmRow(row) {
    row.querySelector('.gm-role-label').textContent = T('gm.role');
    row.querySelector('.gm-role option[value="進行"]').textContent = T('role.facilitator');
    row.querySelector('.gm-name-label').textContent = T('gm.name');
    row.querySelector('.gm-name').placeholder = T('gm.namePlaceholder');
    row.querySelector('.add-inline').setAttribute('aria-label', T('gm.add'));
    row.querySelector('.danger-inline').setAttribute('aria-label', T('gm.remove'));
  }

  function localizePlayerRow(row) {
    row.querySelector('.slot-label').textContent = T('player.slot');
    row.querySelector('.ho-label').textContent = T('player.ho');
    row.querySelector('.ho-name').placeholder = T('player.hoPlaceholder');
    row.querySelector('.pc-label').textContent = T('player.pc');
    row.querySelector('.pc-name').placeholder = T('player.pcPlaceholder');
    row.querySelector('.pl-label').textContent = T('player.pl');
    row.querySelector('.pl-name').placeholder = T('player.plPlaceholder');
  }

  // 標記選項的值是固定的正規值（「自由」不會寫進團報），只有顯示的名稱跟著語言
  function slotLabel(value) {
    return value === '自由' ? T('slot.free') : value;
  }

  function baseSlot() {
    return document.querySelector('#playerContainer .participant-row .player-slot')?.value || 'HO1';
  }

  function slotFor(index) {
    const base = baseSlot();
    if (/^PC\d+$/i.test(base)) return `PC${index}`;
    if (/^HO\d+$/i.test(base)) return `HO${index}`;
    return base;
  }

  function buildSlotOptions(selected, isFirst) {
    const options = isFirst ? ['PC','PC1','HO1','PC/PL','PL/PC','自由'] : [selected];
    return options.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(slotLabel(value))}</option>`).join('');
  }

  function syncSlots() {
    Array.from(document.querySelectorAll('#playerContainer .participant-row')).forEach((row, index) => {
      const select = row.querySelector('.player-slot');
      if (!select) return;
      if (index === 0) {
        select.innerHTML = buildSlotOptions(select.value || 'HO1', true);
        select.disabled = false;
      } else {
        const slot = slotFor(index + 1);
        select.innerHTML = buildSlotOptions(slot, false);
        select.value = slot;
        select.disabled = true;
      }
    });
  }

  function updateNameOrder() {
    const order = $('nameInputOrder').value;
    document.querySelectorAll('.participant-row').forEach(row => {
      row.classList.toggle('name-order-plpc', order === 'plpc');
      row.classList.toggle('name-order-pcpl', order === 'pcpl');
    });
  }

  function addPlayer(pl = '', pc = '', slot = '', ho = '') {
    const index = document.querySelectorAll('#playerContainer .participant-row').length + 1;
    const isFirst = index === 1;
    const selected = slot || slotFor(index);
    const row = document.createElement('div');
    row.className = `participant-row name-order-${$('nameInputOrder').value}`;
    row.innerHTML = `
      <div class="slot-field">
        <label class="slot-label"></label>
        <select class="player-slot" ${isFirst ? '' : 'disabled'}>${buildSlotOptions(selected, isFirst)}</select>
      </div>
      <div class="ho-field">
        <label class="ho-label"></label>
        <input class="ho-name" value="${escapeHtml(ho)}">
      </div>
      <div class="pc-field">
        <label class="pc-label"></label>
        <input class="pc-name" value="${escapeHtml(pc)}">
      </div>
      <div class="pl-field">
        <label class="pl-label"></label>
        <input class="pl-name" value="${escapeHtml(pl)}">
      </div>
      <button class="danger delete-field" type="button">×</button>
    `;
    localizePlayerRow(row);
    $('playerContainer').appendChild(row);
    row.querySelector('.player-slot').addEventListener('change', () => {
      syncSlots();
      previewSelectedStyle();
    });
    row.querySelector('.delete-field').addEventListener('click', () => {
      row.remove();
      syncSlots();
      previewSelectedStyle();
    });
    syncSlots();
    updateNameOrder();
  }

  function collectData(useSample = true) {
    const suffix = getSuffix();
    let gms = Array.from(document.querySelectorAll('#gmContainer .row')).map((row, index) => {
      const raw = row.querySelector('.gm-name')?.value.trim() || '';
      return {
        role: row.querySelector('.gm-role')?.value || 'KP',
        name: addSuffix(raw || (useSample && index === 0 ? T('sample.kp') : ''), suffix)
      };
    }).filter(item => item.name);

    let players = Array.from(document.querySelectorAll('#playerContainer .participant-row')).map((row, index) => {
      const rawPc = row.querySelector('.pc-name')?.value.trim() || '';
      const rawPl = row.querySelector('.pl-name')?.value.trim() || '';
      return {
        slot: row.querySelector('.player-slot')?.value || 'HO1',
        ho: row.querySelector('.ho-name')?.value.trim() || '',
        pc: rawPc || (useSample ? sampleName(index, 'pc') : ''),
        pl: addSuffix(rawPl || (useSample ? sampleName(index, 'pl') : ''), suffix)
      };
    }).filter(item => item.pc || item.pl || item.ho);

    if (useSample && !gms.length) gms = [{ role: 'KP', name: T('sample.kp') }];
    if (useSample && !players.length) players = [{ slot: 'HO1', ho: '', pc: T('sample.pc', 'A'), pl: T('sample.pl', 'A') }];

    return {
      style: $('reportStyle').value || 'classic',
      fontVariant: $('fontVariant').value || 'sansBoldItalic',
      styleText,
      system: getSystemName(),
      scenario: $('scenarioTitle').value.trim() || (useSample ? T('sample.scenario') : ''),
      author: addAuthorSuffix($('authorText').value.trim()),
      result: $('resultText').value.trim() || (useSample ? T('sample.result') : ''),
      date: $('dateText').value.trim() || (useSample ? $('dateText').placeholder || getTodayString() : ''),
      hashtags: $('hashtagText').value.trim(),
      memo: $('memoText')?.value.trim() || '',
      nameOrder: $('nameInputOrder')?.value || 'pcpl',
      gms,
      players
    };
  }

  function insertAuthorLine(output, data) {
    const author = data.author || '';
    const scenario = data.scenario || '';
    if (!author || !scenario || output.includes(author)) return output;
    const lines = String(output || '').split('\n');
    const index = lines.findIndex(line => line.includes(scenario));
    if (index < 0) return output;
    lines.splice(index + 1, 0, author);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function mergeManualPreviewEdits(base, edited, next) {
    if (!base || edited === base) return next;
    let start = 0;
    const minStart = Math.min(base.length, edited.length);
    while (start < minStart && base[start] === edited[start]) start += 1;

    let baseEnd = base.length;
    let editedEnd = edited.length;
    while (baseEnd > start && editedEnd > start && base[baseEnd - 1] === edited[editedEnd - 1]) {
      baseEnd -= 1;
      editedEnd -= 1;
    }

    const manualSegment = edited.slice(start, editedEnd);
    const nextEnd = Math.max(start, next.length - (base.length - baseEnd));
    return `${next.slice(0, start)}${manualSegment}${next.slice(nextEnd)}`;
  }

  function renderPreview(text = null, push = false) {
    const preview = $('tweetPreview');
    if (!preview) return;
    if (push) pushHistory();
    const data = collectData(true);
    const generated = text !== null ? text : insertAuthorLine(window.ReportTemplate.renderParts(data), data);
    const output = text === null && isPreviewDirty
      ? mergeManualPreviewEdits(lastGeneratedPreview, preview.value, generated)
      : generated;
    preview.value = output;
    lastGeneratedPreview = generated;
    isPreviewDirty = output !== generated;
    savePreviewSelection();
    updateCount();
    fitPreviewTextBox();
  }

  function previewSelectedStyle() {
    if (isResetting) return;
    renderPreview();
  }

  function pushHistory() {
    if (isApplyingHistory) return;
    const preview = $('tweetPreview');
    if (!preview) return;
    const current = preview.value;
    if (!historyStack.length || historyStack[historyStack.length - 1] !== current) {
      historyStack.push(current);
      if (historyStack.length > 80) historyStack.shift();
    }
    redoStack = [];
  }

  function undoPreview() {
    const preview = $('tweetPreview');
    if (!preview || !historyStack.length) return;
    isApplyingHistory = true;
    redoStack.push(preview.value);
    preview.value = historyStack.pop();
    updateCount();
    savePreviewSelection();
    isApplyingHistory = false;
  }

  function redoPreview() {
    const preview = $('tweetPreview');
    if (!preview || !redoStack.length) return;
    isApplyingHistory = true;
    historyStack.push(preview.value);
    preview.value = redoStack.pop();
    updateCount();
    savePreviewSelection();
    isApplyingHistory = false;
  }

  function savePreviewSelection() {
    const preview = $('tweetPreview');
    if (!preview) return;
    lastPreviewSelection = {
      start: preview.selectionStart ?? preview.value.length,
      end: preview.selectionEnd ?? preview.value.length
    };
  }

  function insertDecorationAtPreviewCursor(text) {
    const preview = $('tweetPreview');
    if (!preview) return;
    pushHistory();
    const hasFocus = document.activeElement === preview;
    const start = hasFocus ? preview.selectionStart ?? preview.value.length : lastPreviewSelection.start ?? preview.value.length;
    const end = hasFocus ? preview.selectionEnd ?? preview.value.length : lastPreviewSelection.end ?? preview.value.length;
    preview.value = preview.value.slice(0, start) + text + preview.value.slice(end);
    const next = start + String(text).length;
    preview.focus();
    preview.selectionStart = next;
    preview.selectionEnd = next;
    lastPreviewSelection = { start: next, end: next };
    updateCount();
  }

  function clearPreview() {
    pushHistory();
    $('tweetPreview').value = '';
    isPreviewDirty = true;
    lastPreviewSelection = { start: 0, end: 0 };
    updateCount();
    $('tweetPreview').focus();
  }

  async function copyTweet() {
    const preview = $('tweetPreview');
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.value);
      alert(T('preview.copied'));
    } catch (e) {
      preview.select();
      document.execCommand('copy');
      alert(T('preview.copied'));
    }
  }

  function postToX() {
    const preview = $('tweetPreview');
    if (!preview) return;
    const text = preview.value.trim();
    if (!text) {
      alert(T('preview.nothingToPost'));
      return;
    }
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  function tweetLength(text) {
    let total = 0;
    for (const ch of Array.from(String(text || '').normalize('NFC'))) {
      const code = ch.codePointAt(0);
      total += (code <= 0x10FF || (code >= 0x2000 && code <= 0x201F) || (code >= 0x2032 && code <= 0x2037)) ? 1 : 2;
    }
    return total;
  }

  function updateCount() {
    const count = tweetLength($('tweetPreview').value);
    $('charCount').textContent = `${count} / 280`;
    $('limitStatus').textContent = count <= 280 ? 'OK' : T('preview.over', count - 280);
    $('limitStatus').className = count <= 280 ? 'count-ok' : 'count-bad';
  }

  function fitPreviewTextBox() {
    const text = $('tweetPreview');
    const panel = document.querySelector('.preview-panel');
    const card = document.querySelector('.twitter-card');
    if (!text || !panel || !card || window.innerWidth <= 920 || manualPreviewHeight) return;
    const h2 = panel.querySelector('h2')?.offsetHeight || 0;
    const head = card.querySelector('.tweet-head')?.offsetHeight || 0;
    const toolbar = card.querySelector('.font-toolbar')?.offsetHeight || 0;
    const count = card.querySelector('.count-line')?.offsetHeight || 0;
    const actions = card.querySelector('.preview-actions')?.offsetHeight || 0;
    const hint = panel.querySelector('.hint')?.offsetHeight || 0;
    const available = panel.clientHeight - h2 - head - toolbar - count - actions - hint - 54;
    text.style.height = `${Math.max(140, Math.min(620, available))}px`;
  }

  function bindPreviewResizer() {
    const handle = $('previewResizeHandle');
    const preview = $('tweetPreview');
    if (!handle || !preview) return;

    let startY = 0;
    let startH = 0;

    function move(e) {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      manualPreviewHeight = Math.max(180, Math.min(720, startH + clientY - startY));
      preview.style.height = `${manualPreviewHeight}px`;
    }

    function end() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
    }

    function start(e) {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startY = clientY;
      startH = preview.offsetHeight;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', end);
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end);
      e.preventDefault();
    }

    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive: false });
  }

  function updateCustomSystemInput() {
    $('customSystemText').classList.toggle('is-active', $('systemSelect').value === 'custom');
  }

  function resetAll() {
    isResetting = true;
    document.querySelectorAll('.input-panel input:not([type="checkbox"])').forEach(input => { input.value = ''; });
    $('systemSelect').value = 'call_of_cthulhu';
    $('reportStyle').value = 'classic';
    $('fontVariant').value = 'sansBoldItalic';
    document.querySelectorAll('input[name="suffixChoice"]').forEach(input => { input.checked = input.value === 'none'; });
    $('nameInputOrder').value = 'pcpl';
    $('gmContainer').innerHTML = '';
    $('playerContainer').innerHTML = '';
    addGM();
    addPlayer();
    setTodayPlaceholder();
    updateCustomSystemInput();
    historyStack = [];
    redoStack = [];
    manualPreviewHeight = null;
    $('tweetPreview').style.height = '';
    isPreviewDirty = false;
    isResetting = false;
    updateFontToolbarActive();
    renderPreview('');
  }


  function closeHeaderPanels() {
    const panels = ['usagePanel', 'shortcutPanel'];
    const buttons = ['usageToggleButton', 'shortcutToggleButton'];
    panels.forEach(id => {
      const panel = $(id);
      if (panel) panel.hidden = true;
    });
    buttons.forEach(id => {
      const button = $(id);
      if (button) {
        button.classList.remove('is-active');
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function toggleHeaderPanel(panelId, buttonId) {
    const panel = $(panelId);
    const button = $(buttonId);
    if (!panel || !button) return;

    const willOpen = panel.hidden;
    closeHeaderPanels();

    if (willOpen) {
      panel.hidden = false;
      button.classList.add('is-active');
      button.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(fitPreviewTextBox);
    }
  }

  function cycleReportStyle(direction) {
    const select = $('reportStyle');
    if (!select || !select.options.length) return;

    const count = select.options.length;
    const current = select.selectedIndex < 0 ? 0 : select.selectedIndex;
    select.selectedIndex = (current + direction + count) % count;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function cycleFontVariant(direction) {
    const select = $('fontVariant');
    if (!select || !select.options.length) return;

    const count = select.options.length;
    const current = select.selectedIndex < 0 ? 0 : select.selectedIndex;
    select.selectedIndex = (current + direction + count) % count;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function regeneratePreview() {
    pushHistory();
    isPreviewDirty = false;
    renderPreview();
    $('tweetPreview')?.focus();
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function bindHeaderHelpEvents() {
    const usageButton = $('usageToggleButton');
    const shortcutButton = $('shortcutToggleButton');

    if (usageButton) {
      usageButton.addEventListener('click', () => toggleHeaderPanel('usagePanel', 'usageToggleButton'));
    }

    if (shortcutButton) {
      shortcutButton.addEventListener('click', () => toggleHeaderPanel('shortcutPanel', 'shortcutToggleButton'));
    }

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeHeaderPanels();
        return;
      }

      // ?（不在文字欄時）：開關快捷鍵面板
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        toggleHeaderPanel('shortcutPanel', 'shortcutToggleButton');
        return;
      }

      const isMacShortcut = event.metaKey && event.altKey;
      const isWinShortcut = event.ctrlKey && event.altKey;
      if (!(isMacShortcut || isWinShortcut)) return;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        cycleReportStyle(-1);
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        cycleReportStyle(1);
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleFontVariant(-1);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycleFontVariant(1);
      }

      // Cmd/Ctrl + Opt/Alt + R：捨棄手動編輯，依輸入內容重新產生預覽
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        regeneratePreview();
      }
    });
  }

  function bindEvents() {
    window.clearAll = resetAll;
    window.addEventListener('resize', fitPreviewTextBox);
    bindHeaderHelpEvents();

    document.querySelectorAll('input[name="suffixChoice"]').forEach(input => {
      input.addEventListener('change', () => {
        document.querySelectorAll('input[name="suffixChoice"]').forEach(item => { item.checked = item === input; });
        previewSelectedStyle();
      });
    });

    $('addPlayerButton').addEventListener('click', () => addPlayer());
    $('generateButton').addEventListener('click', postToX);
    $('clearAllButton').addEventListener('click', resetAll);
    $('copyButton').addEventListener('click', copyTweet);
    $('undoButton').addEventListener('click', undoPreview);
    $('redoButton').addEventListener('click', redoPreview);
    $('clearPreviewButton').addEventListener('click', clearPreview);

    $('reportStyle').addEventListener('change', previewSelectedStyle);
    $('fontVariant').addEventListener('change', () => {
      updateFontToolbarActive();
      previewSelectedStyle();
    });
    $('nameInputOrder').addEventListener('change', () => {
      updateNameOrder();
      previewSelectedStyle();
    });
    $('systemSelect').addEventListener('change', () => {
      updateCustomSystemInput();
      if (['emoklore_en', 'emoklore_ja'].includes($('systemSelect').value)) {
        document.querySelectorAll('.gm-role').forEach(role => { role.value = 'DL'; });
      }
      previewSelectedStyle();
    });

    document.querySelector('.input-panel').addEventListener('input', previewSelectedStyle);
    document.querySelector('.input-panel').addEventListener('change', previewSelectedStyle);

    const preview = $('tweetPreview');
    preview.addEventListener('beforeinput', pushHistory);
    preview.addEventListener('input', () => {
      isPreviewDirty = true;
      savePreviewSelection();
      updateCount();
    });
    ['click', 'keyup', 'select', 'mouseup'].forEach(eventName => preview.addEventListener(eventName, savePreviewSelection));

    // 在預覽區內 Ctrl/⌘+Z = 復原／Ctrl/⌘+Shift+Z（或 Ctrl+Y）= 重做
    document.querySelector('.preview-panel')?.addEventListener('keydown', event => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
      const isUndo = key === 'z' && !event.shiftKey;
      if (!isUndo && !isRedo) return;
      event.preventDefault();
      (isRedo ? redoPreview : undoPreview)();
    });

    // 整個頁面的指令類快捷鍵
    document.addEventListener('keydown', event => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();

      // Ctrl/⌘+Shift+P = 貼到 𝕏
      if (event.shiftKey && key === 'p') {
        event.preventDefault();
        postToX();
        return;
      }
      // Ctrl/⌘+Shift+C／Ctrl/⌘+Enter = 複製預覽內文
      if ((event.shiftKey && key === 'c') || (!event.shiftKey && event.key === 'Enter')) {
        event.preventDefault();
        copyTweet();
        return;
      }
      // Ctrl/⌘+E = 把游標移到預覽編輯欄
      if (!event.shiftKey && key === 'e') {
        event.preventDefault();
        const preview = $('tweetPreview');
        if (preview) {
          preview.focus();
          preview.setSelectionRange(preview.value.length, preview.value.length);
        }
      }
    });
  }

  function readPendingReportImport() {
    const raw = localStorage.getItem(REPORT_PENDING_IMPORT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  function clearPendingReportImport() {
    localStorage.removeItem(REPORT_PENDING_IMPORT_KEY);
  }

  function showToast(message, duration = 3200) {
    let stack = document.getElementById('toastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toastStack';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.classList.add('is-visible'), 10);
    const dismiss = () => {
      if (toast.dataset.dismissed) return;
      toast.dataset.dismissed = '1';
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 240);
    };
    setTimeout(dismiss, duration);
    toast.addEventListener('click', dismiss);
  }

  function handlePendingReportImport() {
    let payload = null;
    try {
      payload = readPendingReportImport();
    } catch (error) {
      console.error(error);
      if (confirm(T('pending.broken'))) {
        clearPendingReportImport();
      }
      return;
    }
    if (!payload?.items?.length) return;

    // 要輸入的回答也跟著目前的語言
    const answerLoad = T('pending.load');
    const answerLater = T('pending.later');
    const answerDiscard = T('pending.discard');
    const action = prompt([
      T('pending.question'),
      '',
      T('pending.detail'),
      T('pending.editable'),
      '',
      T('pending.answers', answerLoad, answerLater, answerDiscard)
    ].join('\n'), answerLoad);

    if (action === null || action === answerLater) return;
    if (action === answerDiscard) {
      clearPendingReportImport();
      return;
    }
    if (action !== answerLoad) return;

    applyReportImportItems(payload.items);
    clearPendingReportImport();
    showToast(T('pending.loaded'));
  }

  function applyReportImportItems(items) {
    const item = Array.isArray(items) ? items[0] : items;
    if (!item) return;
    applyImportedSystem(item.system);
    $('scenarioTitle').value = item.scenario || '';
    $('dateText').value = item.latestDate || (Array.isArray(item.dates) ? item.dates.join(' / ') : '');
    $('hashtagText').value = formatImportedHashtags(item.hashtags);
    if ($('memoText')) $('memoText').value = item.memo || '';

    $('gmContainer').innerHTML = '';
    addGM(item.gm || '', inferGmRole(item.system));

    $('playerContainer').innerHTML = '';
    const players = Array.isArray(item.players) && item.players.length ? item.players : [{ pl: '', pc: '' }];
    players.forEach(player => addPlayer(player.pl || '', player.pc || ''));

    dispatchFormRefresh();
    renderPreview(null, true);
  }

  function applyImportedSystem(systemName) {
    const name = String(systemName || '').trim();
    const aliases = {
      'CoC 6版': 'coc6',
      'CoC6': 'coc6',
      'CoC 7版': 'coc7',
      'CoC7': 'coc7',
      '新クトゥルフ神話TRPG': 'new_coc',
      'エモクロア': 'emoklore_ja',
      'エモクロアTRPG': 'emoklore_ja',
      'マダミス': 'madamisu',
      'マーダーミステリー': 'madamisu',
      // 跑團紀錄簿繁中版的顯示名稱
      'Emoklore': 'emoklore_ja'
    };
    const matched = aliases[name] || Object.keys(SYSTEM_NAMES).find(key => systemNamesInAllLocales(key).some(label => label === name || label.toLowerCase() === name.toLowerCase()));
    $('systemSelect').value = matched || 'custom';
    $('customSystemText').value = matched ? '' : name;
    updateCustomSystemInput();
  }

  function formatImportedHashtags(hashtags) {
    if (Array.isArray(hashtags)) return hashtags.map(tag => String(tag || '').trim()).filter(Boolean).map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
    return String(hashtags || '').trim();
  }

  function inferGmRole(systemName) {
    const text = String(systemName || '');
    if (text.includes('エモクロア') || /emoklore/i.test(text)) return 'DL';
    if (text.includes('クトゥルフ') || text.includes('克蘇魯') || /coc/i.test(text)) return 'KP';
    return 'GM';
  }

  function dispatchFormRefresh() {
    document.querySelectorAll('input, textarea, select').forEach(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // 切換語言：重畫程式產生的文字，並依新語言重新產生團報（手動編輯照常合併）
  function handleLocaleChange() {
    const style = $('reportStyle').value;
    const font = $('fontVariant').value;
    populateReportStyles();
    $('reportStyle').value = style;
    populateFontVariants();
    $('fontVariant').value = font;
    renderFontToolbar();
    hideChipTooltip();
    document.querySelectorAll('#gmContainer .row').forEach(localizeGmRow);
    document.querySelectorAll('#playerContainer .participant-row').forEach(localizePlayerRow);
    syncSlots();
    previewSelectedStyle();
    updateCount();
  }

  function init() {
    I18N.mountSwitcher($('localeSelect'));
    I18N.onChange(handleLocaleChange);
    populateReportStyles();
    populateFontVariants();
    renderFontToolbar();
    renderAsciiArtButtons();
    addGM();
    addPlayer();
    setTodayPlaceholder();
    updateCustomSystemInput();
    bindPreviewResizer();
    bindEvents();
    renderPreview();
    handlePendingReportImport();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
