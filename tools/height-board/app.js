// ===== CORE:BEGIN =====
// 純粋な計算ロジック。tests/code/ から抽出して単体テストする
const HeightBoardCore = (() => {
  'use strict';

  const ALPHA_THRESHOLD = 16;

  // 透過部分を除いた外接矩形を求める
  function computeAlphaBBox(data, width, height, threshold = ALPHA_THRESHOLD) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      const rowOff = y * width * 4;
      for (let x = 0; x < width; x++) {
        if (data[rowOff + x * 4 + 3] > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          maxY = y;
        }
      }
    }
    // 完全に透明な画像は画像全体を bbox とみなす
    if (maxX < 0) return { x: 0, y: 0, w: width, h: height };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  // 表示中のキャラだけを取り出す。
  // 非表示のキャラを目盛りや書き出しの計算に残すと、
  // 「誰もいないのに目盛りだけ高いまま」「左端に見えない余白が残る」といったことが起きる
  function visible(chars) {
    return chars.filter((ch) => !ch.hidden);
  }

  // キャラの描画寸法を cm 単位で求める
  function computeCharGeometry(ch) {
    const bh = ch.bbox.h;
    const span = Math.max(1e-9, (ch.bottomRatio - ch.topRatio) * bh);
    const cmPerPx = ch.heightCm / span;
    return {
      cmPerPx,
      widthCm: ch.bbox.w * cmPerPx,
      // bbox 上端／下端の高さ（床を 0cm とし、上を正とする）
      topCm: ch.bottomRatio * bh * cmPerPx,
      bottomCm: (ch.bottomRatio - 1) * bh * cmPerPx
    };
  }

  // 描画済みの矩形の中で、比率 ratio の位置が何 cm にあたるかを返す
  function markerCm(rect, ratio) {
    return rect.topCm - ratio * (rect.topCm - rect.bottomCm);
  }

  // 逆に、矩形の中で高さ yCm が何割の位置かを返す（ライン直接ドラッグ用）
  function ratioAt(rect, yCm) {
    const h = rect.topCm - rect.bottomCm;
    if (h <= 0) return 0;
    return (rect.topCm - yCm) / h;
  }

  // 縦方向の表示上限（cm）。10cm 単位に切り上げる
  function computeBoardTopCm(chars, minCm = 180, marginRatio = 0.06, step = 10) {
    let top = 0;
    for (const ch of visible(chars)) {
      const g = computeCharGeometry(ch);
      top = Math.max(top, g.topCm, ch.heightCm);
    }
    return Math.ceil(Math.max(minCm, top * (1 + marginRatio)) / step) * step;
  }

  // 床より下にはみ出す量（cm、0 以下）
  function computeBoardBottomCm(chars) {
    let bottom = 0;
    for (const ch of visible(chars)) bottom = Math.min(bottom, computeCharGeometry(ch).bottomCm);
    return bottom;
  }

  // 盤面全体の横幅（cm）。0cm を左端とした表示用の幅
  function computeBoardWidthCm(chars, minCm = 120, marginCm = 8) {
    let right = 0;
    for (const ch of visible(chars)) right = Math.max(right, ch.x + computeCharGeometry(ch).widthCm);
    return Math.max(minCm, right + marginCm);
  }

  // キャラが実際に占めている左右の範囲（cm）。書き出しの切り取りに使う
  function computeContentRangeCm(chars, marginCm = 8) {
    const shown = visible(chars);
    if (shown.length === 0) return { leftCm: 0, rightCm: Math.max(120, marginCm * 2) };
    let left = Infinity, right = -Infinity;
    for (const ch of shown) {
      const g = computeCharGeometry(ch);
      left = Math.min(left, ch.x);
      right = Math.max(right, ch.x + g.widthCm);
    }
    return { leftCm: left - marginCm, rightCm: right + marginCm };
  }

  // 与えられた順に左から詰めて配置する。id -> x の Map を返す
  function layoutSequential(ordered, gapCm = 5, startCm = 5) {
    const result = new Map();
    let cur = startCm;
    for (const ch of ordered) {
      result.set(ch.id, cur);
      cur += computeCharGeometry(ch).widthCm + gapCm;
    }
    return result;
  }

  // 現在の左右順を保ったまま等間隔に並べ直す
  function alignEven(chars, gapCm = 5, startCm = 5) {
    return layoutSequential(visible(chars).sort((a, b) => a.x - b.x), gapCm, startCm);
  }

  // 身長順に並べ直す
  function alignByHeight(chars, descending = true, gapCm = 5, startCm = 5) {
    const ordered = visible(chars).sort((a, b) =>
      descending ? b.heightCm - a.heightCm : a.heightCm - b.heightCm);
    return layoutSequential(ordered, gapCm, startCm);
  }

  // 前面のものから順に当たり判定する
  function hitTest(chars, xCm, yCm) {
    const ordered = visible(chars).sort((a, b) => b.z - a.z);
    for (const ch of ordered) {
      const g = computeCharGeometry(ch);
      if (xCm >= ch.x && xCm <= ch.x + g.widthCm && yCm >= g.bottomCm && yCm <= g.topCm) return ch;
    }
    return null;
  }

  // z 値を 0 から連番に振り直す
  function normalizeZ(chars) {
    [...chars].sort((a, b) => a.z - b.z).forEach((ch, i) => { ch.z = i; });
    return chars;
  }

  // 手前から順に並んだ id の配列を z に反映する（一覧のドラッグ並べ替え用）
  function applyOrderToZ(chars, idsFrontFirst) {
    // 実在する id だけを対象にし、z が 0 からの連番になるようにする
    const ids = idsFrontFirst.filter((id) => chars.some((c) => c.id === id));
    const n = ids.length;
    const rank = new Map(ids.map((id, i) => [id, n - 1 - i]));
    for (const ch of chars) if (rank.has(ch.id)) ch.z = rank.get(ch.id);
    return chars;
  }

  // 重なり順を隣とひとつ入れ替える（delta > 0 で手前へ）
  function shiftZ(chars, id, delta) {
    const ordered = [...chars].sort((a, b) => a.z - b.z);
    const i = ordered.findIndex((c) => c.id === id);
    const j = i + (delta > 0 ? 1 : -1);
    if (i < 0 || j < 0 || j >= ordered.length) return false;
    const tmp = ordered[i].z;
    ordered[i].z = ordered[j].z;
    ordered[j].z = tmp;
    return true;
  }

  // 目盛りを引く高さの一覧
  function rulerTicks(topCm, step = 10) {
    const out = [];
    for (let v = 0; v <= topCm + 1e-9; v += step) out.push(Math.round(v));
    return out;
  }

  // 目盛り線の強調度合い
  function tickWeight(cm, majorStep = 50) {
    if (cm === 0) return 'floor';
    return cm % majorStep === 0 ? 'major' : 'minor';
  }

  // 数値ラベルを何 cm ごとに出すか。縮小時に文字が詰まるのを防ぐ
  function labelStepFor(pxPerCm, tickStep = 10, minGapPx = 14) {
    for (const step of [tickStep, 50, 100]) {
      if (step * pxPerCm >= minGapPx) return step;
    }
    return 100;
  }

  // ファイル名から拡張子を除いた名前を得る
  function nameFromFilename(filename) {
    const base = String(filename).replace(/^.*[\\/]/, '');
    const i = base.lastIndexOf('.');
    const stem = i > 0 ? base.slice(0, i) : base;
    return stem || T('name.untitled');
  }

  // 書き出し解像度（1cm あたりの画素数）を決める。
  // 辺の長さで縛ると、人数が増えて横長になるほど縦の解像度が巻き添えで落ちるため、
  // 総画素数（面積）で制限する。1 辺の長さはブラウザのキャンバス上限に対する保険
  function computeExportPxPerCm(chars, maxArea = 40e6, maxSide = 16000, axisCm = 0) {
    const shown = visible(chars);
    if (shown.length === 0) return 4;
    let pxPerCm = 0;
    for (const ch of shown) pxPerCm = Math.max(pxPerCm, 1 / computeCharGeometry(ch).cmPerPx);
    // 左端の空白は書き出さないので、実際に占めている範囲で計算する
    const range = computeContentRangeCm(chars);
    const widthCm = (range.rightCm - range.leftCm) + axisCm;
    const heightCm = computeBoardTopCm(chars) - computeBoardBottomCm(chars);
    return Math.min(
      pxPerCm,                                   // 元画像より細かくしても意味がない
      Math.sqrt(maxArea / (widthCm * heightCm)), // 総画素数の上限
      maxSide / widthCm,
      maxSide / heightCm
    );
  }

  return {
    ALPHA_THRESHOLD, visible, computeAlphaBBox, computeCharGeometry, markerCm, ratioAt,
    computeBoardTopCm, computeBoardBottomCm, computeBoardWidthCm,
    computeContentRangeCm,
    layoutSequential, alignEven, alignByHeight, hitTest, normalizeZ, applyOrderToZ, shiftZ,
    rulerTicks, tickWeight, labelStepFor, nameFromFilename, computeExportPxPerCm
  };
})();
// ===== CORE:END =====

(() => {
  'use strict';

  const C = HeightBoardCore;
  const AXIS_W = 58;          // 目盛り軸の幅(px)
  const PAD_TOP = 14;         // 盤面上下の余白(px)
  const PAD_BOTTOM = 10;
  const DISPLAY_MAX_H = 1800; // 表示用キャッシュの最大高さ(px)
  const TICK_STEP = 10;       // 目盛り間隔(cm)
  const HANDLE_HIT_PX = 8;    // ライン掴み判定の許容幅(px)
  const EXPORT_MAX_AREA = 40e6;   // 書き出しの総画素数の上限
  const EXPORT_MAX_SIDE = 16000;  // 書き出しの 1 辺の上限（キャンバス上限への保険）
  const MIN_SPAN = 0.05;      // 頭頂ラインと足元ラインの最小間隔（比率）

  /** @type {Array} 盤面に並んでいるキャラ */
  let chars = [];
  /** セッション中に作られた全キャラ。Undo で復元するために保持する */
  const registry = new Map();

  let selectedId = null;
  let hoverId = null;
  let heightSortDesc = true;
  let persistOk = true;

  // 表示単位の状態（render のたびに更新）
  let view = {
    pxPerCm: 1, basePxPerCm: 1, topCm: 180, bottomCm: 0,
    canvasH: 0, originY: 0, viewportW: 0, viewportH: 0
  };
  // 表示倍率。1 で画面の高さいっぱいに収まる
  let zoom = 1;
  const ZOOM_MIN = 0.2, ZOOM_MAX = 4;

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const boardCanvas = $('board');
  const axisCanvas = $('axis');
  const bctx = boardCanvas.getContext('2d');
  const actx = axisCanvas.getContext('2d');
  const tooltip = $('tooltip');
  const listEl = $('char-list');

  const selected = () => chars.find((c) => c.id === selectedId) || null;
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatCm = (v) => (Math.round(v * 10) / 10).toString();

  // ============ IndexedDB ============
  const DB_NAME = 'trpg-height-board';
  const STORE = 'state';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
    return dbPromise;
  }

  function idbPut(key, value) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }));
  }

  function idbGet(key) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  let saveTimer = null;
  function scheduleSave() {
    if (!persistOk) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  async function save() {
    if (!persistOk) return;
    try {
      const payload = chars.map((ch) => ({
        id: ch.id, name: ch.name, heightCm: ch.heightCm, x: ch.x, z: ch.z,
        bbox: ch.bbox, topRatio: ch.topRatio, bottomRatio: ch.bottomRatio,
        hidden: !!ch.hidden, blob: ch.blob, srcW: ch.srcW, srcH: ch.srcH
      }));
      await idbPut('current', payload);
    } catch (e) {
      persistOk = false;
      showStatus('msg.noAutosaveWhy', (e && e.message ? e.message : e));
    }
  }

  async function load() {
    let payload;
    try {
      payload = await idbGet('current');
    } catch (e) {
      persistOk = false;
      showStatus('msg.noAutosave');
      return;
    }
    if (!Array.isArray(payload)) return;
    for (const rec of payload) {
      try {
        const display = await makeDisplayCanvas(rec.blob);
        const ch = Object.assign({}, rec, { display });
        ch.thumb = makeThumb(ch);
        registry.set(ch.id, ch);
        chars.push(ch);
      } catch (e) { /* 壊れたレコードは読み飛ばす */ }
    }
    C.normalizeZ(chars);
    renderAll();
  }

  /* 狀態訊息記住 key 與參數，切換語言時才能以新語言重寫。 */
  let lastStatus = null;

  function showStatus(key, ...args) {
    lastStatus = { key, args };
    renderStatus();
  }

  function renderStatus() {
    if (!lastStatus) return;
    const el = $('status');
    el.textContent = T(lastStatus.key, ...lastStatus.args);
    el.style.display = 'block';
  }

  function hideStatus() {
    lastStatus = null;
    $('status').style.display = 'none';
  }

  // ============ Undo / Redo ============

  const undoStack = [];
  const redoStack = [];
  const UNDO_LIMIT = 60;

  // 画像を除いた配置情報だけを控える
  function snapshot() {
    return chars.map((c) => ({
      id: c.id, name: c.name, heightCm: c.heightCm, x: c.x, z: c.z,
      topRatio: c.topRatio, bottomRatio: c.bottomRatio, hidden: !!c.hidden
    }));
  }

  function restore(snap) {
    chars = snap
      .map((s) => { const c = registry.get(s.id); return c ? Object.assign(c, s) : null; })
      .filter(Boolean);
    if (!chars.some((c) => c.id === selectedId)) selectedId = null;
  }

  // どこからも参照されなくなったキャラを registry から捨てて画像を解放する。
  // registry は Undo での復元用に保持しているだけなので、
  // 盤面にも履歴にも残っていないものを抱え続ける必要はない
  function pruneRegistry() {
    const alive = new Set(chars.map((c) => c.id));
    const addAll = (snap) => { if (snap) for (const s of snap) alive.add(s.id); };
    undoStack.forEach(addAll);
    redoStack.forEach(addAll);
    // 進行中の操作が持っているスナップショットも生きている
    addAll(editSnapshot);
    if (drag) addAll(drag.before);
    if (lineDrag) addAll(lineDrag.before);
    if (listDrag) addAll(listDrag.before);
    for (const id of [...registry.keys()]) if (!alive.has(id)) registry.delete(id);
  }

  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
    pruneRegistry();
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    updateUndoButtons();
    pruneRegistry();
    renderAll();
    scheduleSave();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    updateUndoButtons();
    pruneRegistry();
    renderAll();
    scheduleSave();
  }

  function updateUndoButtons() {
    $('btn-undo').disabled = undoStack.length === 0;
    $('btn-redo').disabled = redoStack.length === 0;
  }

  // 連続する入力をひとまとまりの操作として扱う
  let editToken = null;
  let editSnapshot = null;

  function beginEdit(token) {
    if (editToken === token) return;
    editToken = token;
    editSnapshot = snapshot();
  }

  // 実際に値が変わった時点で、編集開始時の状態を Undo に積む
  function commitEdit() {
    if (!editToken) return;
    const snap = editSnapshot;
    editToken = null;
    editSnapshot = null; // 使い終わったら手放す（registry の解放を妨げないため）
    recordUndo(snap);
  }

  // 何も変えずに編集を抜けたときは Undo に積まない
  function cancelEdit() {
    editToken = null;
    editSnapshot = null;
  }

  // ============ 画像処理 ============

  // Blob を ImageBitmap に復号する
  async function decode(blob) {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
    // 古い環境向けのフォールバック
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  // 表示用に縮小したキャンバスを作る
  async function makeDisplayCanvas(blob) {
    const bmp = await decode(blob);
    const scale = Math.min(1, DISPLAY_MAX_H / bmp.height);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * scale));
    cv.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    if (bmp.close) bmp.close();
    cv.scale = scale; // 元画像に対する倍率
    return cv;
  }

  // 透過部分を除いた外接矩形を求める
  async function detectBBox(blob) {
    const bmp = await decode(blob);
    const cv = document.createElement('canvas');
    cv.width = bmp.width;
    cv.height = bmp.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const bbox = C.computeAlphaBBox(data, cv.width, cv.height);
    const size = { w: bmp.width, h: bmp.height };
    if (bmp.close) bmp.close();
    return { bbox, size };
  }

  // 一覧用のサムネイルを作る
  function makeThumb(ch) {
    const cv = document.createElement('canvas');
    cv.width = 60;
    cv.height = 84;
    const ctx = cv.getContext('2d');
    const s = ch.display.scale || 1;
    const sw = ch.bbox.w * s, sh = ch.bbox.h * s;
    const k = Math.min(cv.width / sw, cv.height / sh);
    ctx.drawImage(ch.display, ch.bbox.x * s, ch.bbox.y * s, sw, sh,
      (cv.width - sw * k) / 2, cv.height - sh * k, sw * k, sh * k);
    return cv.toDataURL('image/png');
  }

  // ============ キャラの追加 ============

  const dlg = $('dlg-add');
  const dlgForm = dlg.querySelector('form');

  function askCharInfo(defaultName, previewUrl, indexLabel) {
    return new Promise((resolve) => {
      $('dlg-title').textContent = indexLabel ? T('add.titleN', indexLabel) : T('add.title');
      $('dlg-preview').src = previewUrl;
      $('dlg-name').value = defaultName;
      $('dlg-height').value = '';

      // close イベントが発火しないブラウザがあるため、submit / cancel でも確定させる
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        dlgForm.removeEventListener('submit', onSubmit);
        $('dlg-skip').removeEventListener('click', onSkip);
        dlg.removeEventListener('cancel', onCancel);
        dlg.removeEventListener('close', onClose);
        // 念のため閉じ残しを回収する
        queueMicrotask(() => { if (dlg.open) dlg.close(); });
        if (result !== 'ok') { resolve(null); return; }
        const name = $('dlg-name').value.trim() || defaultName;
        const h = parseFloat($('dlg-height').value);
        resolve(isFinite(h) && h > 0 ? { name, heightCm: h } : null);
      };
      // submit ボタンは「追加」だけなので、身長欄で Enter を押すとそのまま追加になる
      const onSubmit = (ev) => finish(ev.submitter ? ev.submitter.value : 'ok');
      const onSkip = () => finish('cancel');
      const onCancel = () => finish('cancel');
      const onClose = () => finish(dlg.returnValue);

      dlgForm.addEventListener('submit', onSubmit);
      $('dlg-skip').addEventListener('click', onSkip);
      dlg.addEventListener('cancel', onCancel);
      dlg.addEventListener('close', onClose);
      dlg.showModal();
      setTimeout(() => $('dlg-height').focus(), 0);
    });
  }

  // 複数枚をまとめて入力するダイアログ。1 枚ずつ聞くと枚数ぶん待たされるため
  const dlgBatch = $('dlg-batch');
  const dlgBatchForm = dlgBatch.querySelector('form');

  function askCharInfoBatch(files) {
    return new Promise((resolve) => {
      const rows = $('batch-rows');
      const urls = [];
      rows.innerHTML = '';
      $('dlg-batch-title').textContent = T('batch.titleN', files.length);

      for (const file of files) {
        const url = URL.createObjectURL(file);
        urls.push(url);
        const row = document.createElement('div');
        row.className = 'batch-row';
        row.innerHTML =
          '<img alt="">' +
          '<span class="b-name"><input type="text"></span>' +
          '<span class="b-height"><input type="number" min="1" max="1000" step="0.1" placeholder="' + escapeHtml(T('batch.heightPlaceholder')) + '"></span>';
        row.querySelector('img').src = url;
        row.querySelector('.b-name input').value = C.nameFromFilename(file.name);
        rows.appendChild(row);
      }

      // 身長欄の Enter は次の行の身長欄へ送る。
      // 「身長 → Enter → 身長 → Enter」で全行を流し込めるようにするため。
      // 最終行だけは移動先がないので既定の暗黙送信に任せ、そのまま「追加」になる。
      // 名前欄の Enter は同じ行の身長欄へ送る（ここで送信すると、まだ入力していない
      // 行が身長空欄のまま切り捨てられてしまう）
      const heightInputs = Array.from(rows.querySelectorAll('.b-height input'));
      const toNext = (target) => (ev) => {
        // IME の変換確定の Enter を拾わないようにする
        if (ev.key !== 'Enter' || ev.isComposing) return;
        ev.preventDefault();
        target().focus();
        target().select();
      };
      Array.from(rows.children).forEach((row, i) => {
        row.querySelector('.b-name input')
          .addEventListener('keydown', toNext(() => heightInputs[i]));
        if (i < heightInputs.length - 1) {
          heightInputs[i].addEventListener('keydown', toNext(() => heightInputs[i + 1]));
        }
      });

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        dlgBatchForm.removeEventListener('submit', onSubmit);
        $('dlg-batch-cancel').removeEventListener('click', onCancelClick);
        dlgBatch.removeEventListener('cancel', onCancel);
        dlgBatch.removeEventListener('close', onClose);
        queueMicrotask(() => { if (dlgBatch.open) dlgBatch.close(); });
        const out = result !== 'ok' ? [] : Array.from(rows.children).map((row, i) => {
          const h = parseFloat(row.querySelector('.b-height input').value);
          if (!isFinite(h) || h <= 0) return null; // 身長が空の行は追加しない
          return {
            file: files[i],
            name: row.querySelector('.b-name input').value.trim() || C.nameFromFilename(files[i].name),
            heightCm: h
          };
        }).filter(Boolean);
        for (const u of urls) URL.revokeObjectURL(u);
        resolve(out);
      };
      const onSubmit = (ev) => finish(ev.submitter ? ev.submitter.value : 'ok');
      const onCancelClick = () => finish('cancel');
      const onCancel = () => finish('cancel');
      const onClose = () => finish(dlgBatch.returnValue);

      dlgBatchForm.addEventListener('submit', onSubmit);
      $('dlg-batch-cancel').addEventListener('click', onCancelClick);
      dlgBatch.addEventListener('cancel', onCancel);
      dlgBatch.addEventListener('close', onClose);
      dlgBatch.showModal();
      setTimeout(() => {
        const first = rows.querySelector('.b-height input');
        if (first) first.focus();
      }, 0);
    });
  }

  let pendingDropCm = null;

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => /^image\//.test(f.type));
    if (files.length === 0) return;
    // ドロップ位置は非同期処理の前に確定させておく
    let dropCm = pendingDropCm;
    pendingDropCm = null;

    // 1 枚なら従来どおり、複数枚ならまとめて入力させる
    let entries;
    if (files.length === 1) {
      const url = URL.createObjectURL(files[0]);
      const info = await askCharInfo(C.nameFromFilename(files[0].name), url, '');
      URL.revokeObjectURL(url);
      entries = info ? [{ file: files[0], name: info.name, heightCm: info.heightCm }] : [];
    } else {
      entries = await askCharInfoBatch(files);
    }
    if (entries.length === 0) return;
    // 絞り込んだままだと、追加したキャラが一覧に出ず「何も起きなかった」ように見える
    if (listFilter !== '') setListFilter('');

    // まとめて追加するときは、1 体ごとに盤面を描き直さない。
    // 描画は表示中の体数に比例するため、毎回描くと追加時間が体数の 2 乗で悪化する
    // （実測：75 体から 100 体に増やすのに 68 秒かかっていた）
    const bulk = entries.length > 1;
    if (bulk) pushUndo(); // まとめての追加は 1 件の操作として扱う
    for (let i = 0; i < entries.length; i++) {
      const { file, name, heightCm } = entries[i];
      if (bulk) showStatus('msg.adding', i + 1, entries.length);
      const blob = file.slice(0, file.size, file.type);
      const [{ bbox, size }, display] = await Promise.all([detectBBox(blob), makeDisplayCanvas(blob)]);
      const ch = {
        id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + i,
        name, heightCm,
        bbox, srcW: size.w, srcH: size.h,
        topRatio: 0, bottomRatio: 1,
        x: 0, z: chars.reduce((m, c) => Math.max(m, c.z), -1) + 1,
        blob, display
      };
      const widthCm = C.computeCharGeometry(ch).widthCm;
      if (dropCm != null) {
        // 落とした位置を中心に置き、2 枚目以降は右に送る
        ch.x = Math.max(0, dropCm - widthCm / 2);
        dropCm = ch.x + widthCm + 5 + widthCm / 2;
      } else {
        ch.x = C.computeBoardWidthCm(chars, 0, 5);
      }
      ch.thumb = makeThumb(ch);

      if (!bulk) pushUndo();
      registry.set(ch.id, ch);
      chars.push(ch);
      selectedId = ch.id;
      if (!bulk) {
        renderAll();
        scheduleSave();
      }
    }
    // まとめて追加した場合は、最後に 1 回だけ描いて保存する
    if (bulk) {
      hideStatus();
      renderAll();
      scheduleSave();
    }
  }

  // ============ 描画 ============

  // スクロールバーの太さ。重ね表示（オーバーレイ）の環境では 0 になる。
  // 測る div にも #stage と同じ .nm-scroll を当てる。素の div は OS 既定の幅
  // （Chrome/Windows で 15px）を返し、CSS で 12px に細めた実寸と食い違うため。
  // ずれの向きは安全側（多めに引くのでバーは出ない）だが、盤面が 3px 狭くなる。
  // 代わりに実寸ちょうどを引くことになるので、縦の余裕は 0 になる：横バーが
  // 出ている場面では viewportH が clientHeight と一致し、はみ出しを防ぐ余裕は
  // layout() の切り上げ（-0.01）と倍率スナップだけが持つ
  function measureScrollbar() {
    const d = document.createElement('div');
    d.className = 'nm-scroll';
    d.style.cssText = 'position:absolute;visibility:hidden;overflow:scroll;width:100px;height:100px';
    document.body.appendChild(d);
    const w = d.offsetWidth - d.clientWidth;
    d.remove();
    return w;
  }
  // ブラウザのズームで変わるため、毎回の描画では測らずリサイズ時に測り直す
  let SCROLLBAR = measureScrollbar();

  function layout() {
    // ライン調整中は縮尺まで固定する（絵が動くと合わせる先を狙えないため）
    if (lineDrag) {
      view.topCm = lineDrag.view.topCm;
      view.bottomCm = lineDrag.view.bottomCm;
    } else {
      view.topCm = C.computeBoardTopCm(chars);
      view.bottomCm = C.computeBoardBottomCm(chars);
    }

    // 基準は #stage の実寸（ボーダーボックス）からスクロールバーぶんを差し引いた値。
    // - clientWidth/Height を使うと「バーが出る → 縮尺が変わる → 盤面の幅が変わる →
    //   バーが消える」というループになり、画面が細かく揺れ続ける
    // - ボーダーボックスは絶対配置の inset で決まるため、スクロールバーの有無に左右されない。
    //   CSS 側で余白を変えてもここが自動追従するので、余白の数値を二重管理せずに済む
    // - offsetWidth/Height ではなく rect を使い、切り捨てる。offsetWidth/Height は整数に
    //   丸めた値を返すので、表示スケール 125%／150% のように #stage の実寸が端数を持つ環境では
    //   切り上がり、実際の表示領域より大きい盤面を作ってしまう（例：実寸 464.667px →
    //   offsetHeight 465 → 盤面 453px に対し表示領域は 452.667px しかなく 0.33px はみ出す）。
    //   1px 未満のはみ出しでもバーは出るが、scrollHeight と clientHeight は丸めた整数を返すので
    //   JS からは差が 0 に見える。気づきにくいので必ず rect 側で測ること
    const rect = stage.getBoundingClientRect();
    view.viewportW = Math.max(80, Math.floor(rect.width) - SCROLLBAR);
    view.viewportH = Math.max(80, Math.floor(rect.height) - SCROLLBAR);

    const spanCm = view.topCm - view.bottomCm;
    const availH = Math.max(80, view.viewportH - PAD_TOP - PAD_BOTTOM);
    view.basePxPerCm = availH / spanCm;       // 倍率 100% のときの縮尺
    // 倍率の表示は四捨五入するので、1.004 でも「100%」と出る。一方、倍率 100% の盤面は
    // 縦にちょうど収まる寸法なので、1 をわずかでも超えると数 px はみ出して縦バーが出る。
    // 表示が 100% になる範囲は描画上は等倍として扱い、「余白があるのにスクロールバーが
    // 出る」状態を作らない。zoom そのものは連続値のまま持つ（ここで丸めてしまうと、
    // 1 目盛りが 0.15% しか動かないトラックパッドで 100% から抜け出せなくなる）
    view.pxPerCm = view.basePxPerCm * (Math.abs(zoom - 1) < 0.005 ? 1 : zoom);

    // 拡大して縦にはみ出す場合はキャンバスを伸ばす。縮小時は床を下端に合わせる。
    // 倍率 100% では contentH と viewportH は理論上一致するが、除算と乗算を挟むため
    // 浮動小数の誤差で contentH がごくわずかに上回ることがある。そのまま切り上げると
    // 1px だけはみ出して、余白が余っているのに縦スクロールバーが出てしまう
    const contentH = spanCm * view.pxPerCm + PAD_TOP + PAD_BOTTOM;
    view.canvasH = Math.max(view.viewportH, Math.ceil(contentH - 0.01));
    view.originY = view.canvasH - PAD_BOTTOM - spanCm * view.pxPerCm;
  }

  const cmToY = (cm) => view.originY + (view.topCm - cm) * view.pxPerCm;
  const cmToX = (cm) => cm * view.pxPerCm;
  const xToCm = (px) => px / view.pxPerCm;
  const yToCm = (px) => view.topCm - (px - view.originY) / view.pxPerCm;

  // ライン直接ドラッグ中は、掴んだ瞬間の描画位置に絵を固定する
  let lineDrag = null;

  function rectFor(ch) {
    if (lineDrag && lineDrag.id === ch.id) return lineDrag.frozen;
    return C.computeCharGeometry(ch);
  }

  function setupCanvas(cv, ctx, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    cv.width = Math.max(1, Math.round(cssW * dpr));
    cv.height = Math.max(1, Math.round(cssH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render() {
    layout();
    const cssH = view.canvasH;
    const boardW = Math.max(view.viewportW - AXIS_W,
      Math.ceil(cmToX(C.computeBoardWidthCm(chars))));

    setupCanvas(boardCanvas, bctx, boardW, cssH);
    drawScene(bctx, {
      widthPx: boardW, heightPx: cssH,
      pxPerCm: view.pxPerCm, topCm: view.topCm,
      padTop: view.originY, originX: 0,
      // 盤面は白い「紙」。周囲の道具（灰）と階調で分ける
      background: '#ffffff', interactive: true
    });

    setupCanvas(axisCanvas, actx, AXIS_W, cssH);
    drawAxis(actx, {
      widthPx: AXIS_W, heightPx: cssH,
      pxPerCm: view.pxPerCm, topCm: view.topCm, padTop: view.originY,
      fontPx: 11
    });

    $('zoom-label').textContent = Math.round(zoom * 100) + '%';
    $('empty-msg').style.display = chars.length === 0 ? 'flex' : 'none';
  }

  // 選択中のキャラが画面外にいるとき、見える位置まで寄せる（最小限のスクロール）
  function scrollBoardToSelected() {
    const ch = selected();
    if (!ch) return;
    const g = C.computeCharGeometry(ch);
    const pad = 24;

    const left = AXIS_W + cmToX(ch.x);
    const right = AXIS_W + cmToX(ch.x + g.widthCm);
    // 目盛り軸は左に貼り付いているので、その右側を可視範囲とみなす
    const viewL = stage.scrollLeft + AXIS_W;
    const viewR = stage.scrollLeft + view.viewportW;
    if (left - pad < viewL) stage.scrollLeft = left - pad - AXIS_W;
    else if (right + pad > viewR) stage.scrollLeft = right + pad - view.viewportW;

    const top = cmToY(g.topCm);
    const bottom = cmToY(g.bottomCm);
    if (top - pad < stage.scrollTop) stage.scrollTop = top - pad;
    else if (bottom + pad > stage.scrollTop + view.viewportH) {
      // 画面より背が高い場合は頭が見えるほうを優先する
      stage.scrollTop = Math.min(bottom + pad - view.viewportH, top - pad);
    }
  }

  // 一覧側でも選択行を見える位置に出す
  function scrollListToSelected() {
    const li = listEl.querySelector('li.sel');
    if (li) li.scrollIntoView({ block: 'nearest' });
  }

  // 盤面・一覧・インスペクタをまとめて更新する
  function renderAll() {
    render();
    renderList();
    syncInspector();
  }

  // 出力解像度に合わせた線の太さ（画面表示では 1px になる）
  const lineWidthFor = (pxPerCm) => Math.max(1, pxPerCm / 5);

  // 盤面の文字は UI と同じ丸ゴシックを使う。CSS の --font-ui をそのまま借りるので、
  // 書体を変えても片方だけ取り残されることがない。
  // 書き出す PNG も同じ書体にするため、exportPng() で読み込み完了を待つ
  const CANVAS_FONT = getComputedStyle(document.body).fontFamily;

  // ブラウザは「画面のどこかで実際に使われたウェイト」しか取りに行かない。
  // 目盛りの 500 は UI 側で使っていないため、明示的に読み込まないと合成太字のまま焼き込まれる。
  // 読み込めない環境（オフライン）でも解決させ、ローカル書体で描く
  const CANVAS_FONT_READY = document.fonts
    ? Promise.all(['400', '500', '700'].map((w) =>
        document.fonts.load(w + ' 16px ' + CANVAS_FONT))).catch(() => {})
    : Promise.resolve();

  // 目盛りは無彩色にする。UI 側が暖色なので、青みが残ると盤面だけ色相が浮く。
  // 輝度は従来の青灰と揃えてあるので、濃さの印象は変わらない
  const TICK_STYLE = {
    floor: { line: '#909090', text: '#404040', mul: 1.6 },
    major: { line: '#c7c7c7', text: '#515151', mul: 1.3 },
    minor: { line: '#e8e8e8', text: '#828282', mul: 1 }
  };

  // 目盛り軸（数値ラベル）を描く
  function drawAxis(ctx, o) {
    ctx.clearRect(0, 0, o.widthPx, o.heightPx);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, o.widthPx, o.heightPx);

    const k = o.fontPx / 11;              // 画面表示を基準とした拡大率
    const lw = lineWidthFor(o.pxPerCm);
    // 1px の線だけ半ピクセルずらしてにじみを防ぐ
    const snap = (y) => (lw <= 1 ? Math.round(y) + 0.5 : y);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const labelStep = C.labelStepFor(o.pxPerCm, TICK_STEP, o.fontPx * 1.7);
    for (const cm of C.rulerTicks(o.topCm, TICK_STEP)) {
      const w = C.tickWeight(cm);
      const st = TICK_STYLE[w];
      const y = snap(o.padTop + (o.topCm - cm) * o.pxPerCm);
      ctx.strokeStyle = st.line;
      ctx.lineWidth = lw * st.mul;
      ctx.beginPath();
      ctx.moveTo(o.widthPx - (w === 'minor' ? 6 : 9) * k, y);
      ctx.lineTo(o.widthPx, y);
      ctx.stroke();
      if (cm % labelStep !== 0) continue; // 詰まりすぎる場合はラベルを間引く
      // 500 は Web フォントで実際に読み込んでいるウェイト（600 は合成になる）
      ctx.font = (w === 'minor' ? '' : '500 ') + o.fontPx + 'px ' + CANVAS_FONT;
      ctx.fillStyle = st.text;
      ctx.fillText(String(cm), o.widthPx - 12 * k, y);
    }
    // 軸の縦線
    ctx.strokeStyle = '#bcbcbc';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(o.widthPx - lw / 2, 0);
    ctx.lineTo(o.widthPx - lw / 2, o.heightPx);
    ctx.stroke();
  }

  const sceneY = (o, cm) => o.padTop + (o.topCm - cm) * o.pxPerCm;
  const sceneX = (o, cm) => o.originX + cm * o.pxPerCm;

  // 背景と目盛り線だけを描く
  function drawBackdrop(ctx, o) {
    ctx.clearRect(0, 0, o.widthPx, o.heightPx);
    if (o.background) {
      ctx.fillStyle = o.background;
      ctx.fillRect(0, 0, o.widthPx, o.heightPx);
    }
    const lw = lineWidthFor(o.pxPerCm);
    for (const cm of C.rulerTicks(o.topCm, TICK_STEP)) {
      const st = TICK_STYLE[C.tickWeight(cm)];
      const y = lw <= 1 ? Math.round(sceneY(o, cm)) + 0.5 : sceneY(o, cm);
      ctx.strokeStyle = st.line;
      ctx.lineWidth = lw * st.mul;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(o.widthPx, y);
      ctx.stroke();
    }
  }

  // キャラ 1 体ぶんの絵を描く。srcScale は img が原寸に対して何倍か
  function drawCharImage(ctx, ch, img, srcScale, rect, o) {
    ctx.drawImage(
      img,
      ch.bbox.x * srcScale, ch.bbox.y * srcScale, ch.bbox.w * srcScale, ch.bbox.h * srcScale,
      sceneX(o, ch.x), sceneY(o, rect.topCm),
      rect.widthCm * o.pxPerCm, (rect.topCm - rect.bottomCm) * o.pxPerCm
    );
  }

  // 描画対象（表示中のキャラを背面から順に）
  const backToFront = () => C.visible(chars).sort((a, b) => a.z - b.z);

  // 画面表示用。目盛り線・キャラ・操作用のガイドをまとめて描く
  function drawScene(ctx, o) {
    drawBackdrop(ctx, o);

    for (const ch of backToFront()) {
      if (!ch.display) continue;
      drawCharImage(ctx, ch, ch.display, ch.display.scale || 1, rectFor(ch), o);
    }

    if (!o.interactive) return;
    const toY = (cm) => sceneY(o, cm);

    // ホバー中のキャラの身長を盤面いっぱいに引く（比較用）
    const hovered = chars.find((c) => c.id === hoverId);
    if (hovered && !lineDrag) {
      const y = toY(hovered.heightCm);
      ctx.save();
      // 比較用の線は無彩色にする。選択枠（コーラル）と役割が違うので色を分ける
      ctx.strokeStyle = 'rgba(74,58,52,.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(o.widthPx, y);
      ctx.stroke();
      ctx.restore();
    }

    // 選択中のキャラの外枠と、頭頂／足元ラインのつまみ（非表示なら描かない）
    const sel = selected();
    if (sel && !sel.hidden) drawGuides(ctx, sel);
  }

  const TAB_W = 30, TAB_H = 16;

  // 選択中キャラのガイド関連の画面座標をまとめて求める
  function guideMetrics(ch) {
    const rect = rectFor(ch);
    const dx = cmToX(ch.x);
    const dw = rect.widthCm * view.pxPerCm;
    // 盤面の左端に寄っていてつまみが画面外に出る場合は右側に置く
    const tabX = dx - (TAB_W + 6) >= 0 ? dx - (TAB_W + 6) : dx + dw + 6;
    return { rect, dx, dw, tabX };
  }

  // 選択中キャラのガイドとつまみを描く
  function drawGuides(ctx, ch) {
    const { rect, dx, dw, tabX } = guideMetrics(ch);
    const dy = cmToY(rect.topCm);
    const dh = (rect.topCm - rect.bottomCm) * view.pxPerCm;

    ctx.save();
    // 選択枠は UI と同じコーラル。頭頂／足元の赤いラインとは破線と実線で見分ける
    ctx.strokeStyle = 'rgba(232,103,127,.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.setLineDash([]);

    for (const kind of ['top', 'bottom']) {
      const ratio = kind === 'top' ? ch.topRatio : ch.bottomRatio;
      const y = cmToY(C.markerCm(rect, ratio));
      const active = lineDrag && lineDrag.id === ch.id && lineDrag.kind === kind;
      ctx.strokeStyle = active ? '#d62828' : 'rgba(226,84,84,.9)';
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(dx - 10, y);
      ctx.lineTo(dx + dw + 10, y);
      ctx.stroke();
      // 掴むためのつまみ
      ctx.fillStyle = active ? '#d62828' : 'rgba(226,84,84,.9)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tabX, y - TAB_H / 2, TAB_W, TAB_H, 4);
      else ctx.rect(tabX, y - TAB_H / 2, TAB_W, TAB_H);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 10px ' + CANVAS_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(T(kind === 'top' ? 'canvas.top' : 'canvas.foot'), tabX + TAB_W / 2, y);
    }
    ctx.restore();
  }

  // ============ 一覧 ============

  // ---- 一覧の絞り込み（表示上の設定なので保存しない） ----

  let listFilter = '';        // 名前の部分一致
  let listVisibleOnly = false; // 盤面に表示中のものだけ出す
  let listDense = false;       // 行を詰めて見渡せる数を増やす

  const isFiltering = () => listFilter.trim() !== '' || listVisibleOnly;

  function applyListFilter(ordered) {
    const q = listFilter.trim().toLowerCase();
    return ordered.filter((ch) =>
      (!listVisibleOnly || !ch.hidden) &&
      (q === '' || ch.name.toLowerCase().includes(q)));
  }

  function renderList() {
    const ul = $('char-list');
    const ordered = [...chars].sort((a, b) => b.z - a.z); // 手前が上
    const shown = applyListFilter(ordered);
    $('list-empty').hidden = chars.length > 0;
    $('list-none').hidden = chars.length === 0 || shown.length > 0;
    $('list-title').textContent = T(isFiltering() ? 'list.titleFiltered' : 'list.title');
    ul.classList.toggle('filtered', isFiltering());
    ul.classList.toggle('dense', listDense);
    // 一部だけ見ていることが分かるよう、絞り込み中は分母も出す
    $('list-count').textContent = chars.length === 0 ? ''
      : shown.length === chars.length ? String(chars.length)
      : shown.length + ' / ' + chars.length;

    // 並びが変わったときだけ作り直す（毎回だとサムネイルがちらつく）
    const ids = shown.map((c) => c.id).join(',');
    if (ul.dataset.ids !== ids) {
      ul.innerHTML = '';
      for (const ch of shown) {
        const li = document.createElement('li');
        li.dataset.id = ch.id;
        li.innerHTML = '<img alt=""><span class="nm"></span>' +
          '<input class="ht" type="number" min="1" max="1000" step="0.1" title="' + escapeHtml(T('field.height')) + '">' +
          '<button class="vis" type="button"><svg viewBox="0 0 24 24" fill="none" ' +
          'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
          'stroke-linejoin="round" aria-hidden="true"></svg></button>';
        // src に空文字を入れると、ブラウザは文書自身の URL を画像として読みに行く
        // （file:// では固有オリジン扱いでエラー、http:// では index.html を無駄に再取得する）
        const im = li.querySelector('img');
        if (ch.thumb) im.src = ch.thumb; else im.removeAttribute('src');
        ul.appendChild(li);
      }
      ul.dataset.ids = ids;
    }
    for (const li of ul.children) {
      const ch = registry.get(li.dataset.id);
      if (!ch) continue;
      li.className = (ch.id === selectedId ? 'sel' : '') + (ch.hidden ? ' is-hidden' : '');
      li.querySelector('.nm').textContent = ch.name;
      const ht = li.querySelector('.ht');
      if (document.activeElement !== ht) ht.value = formatCm(ch.heightCm);

      const btn = li.querySelector('.vis');
      btn.title = T(ch.hidden ? 'list.show' : 'list.hide');
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', ch.hidden ? 'true' : 'false');
      btn.querySelector('svg').innerHTML = ch.hidden ? EYE_OFF : EYE_ON;
    }
  }

  const EYE_ON = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/>' +
    '<circle cx="12" cy="12" r="3"/>';
  const EYE_OFF = '<path d="M4 4l16 16"/>' +
    '<path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/>' +
    '<path d="M6.3 7.5A16.7 16.7 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.85"/>' +
    '<path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';

  // ---- 絞り込みの操作 ----

  function syncFilterUi() {
    $('filter-clear').hidden = listFilter === '';
    const btn = $('filter-visible');
    btn.setAttribute('aria-pressed', listVisibleOnly ? 'true' : 'false');
    // 絵は「表示中」を指したまま変えない。入／切は押し込みの形と色で示す
    // （目を閉じた絵に替えると「非表示のものを出す」の意味に読めてしまう）
    btn.querySelector('svg').innerHTML = EYE_ON;

    const dens = $('list-density');
    dens.setAttribute('aria-pressed', listDense ? 'true' : 'false');
    dens.title = T(listDense ? 'list.denseOff' : 'list.denseOn');
    dens.setAttribute('aria-label', dens.title);
  }

  function setListFilter(text) {
    listFilter = text;
    if ($('list-filter').value !== text) $('list-filter').value = text;
    syncFilterUi();
    renderList();
  }

  $('list-filter').addEventListener('input', (ev) => setListFilter(ev.target.value));
  // Esc は「まず絞り込みを解く」。選択解除の既定動作までは通さない
  $('list-filter').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    if (listFilter !== '') setListFilter('');
    else $('list-filter').blur();
  });
  $('filter-clear').addEventListener('click', () => {
    setListFilter('');
    $('list-filter').focus();
  });
  $('filter-visible').addEventListener('click', () => {
    listVisibleOnly = !listVisibleOnly;
    syncFilterUi();
    renderList();
  });
  $('list-density').addEventListener('click', () => {
    listDense = !listDense;
    syncFilterUi();
    renderList();
    scrollListToSelected(); // 行の高さが変わるので、選択行を見える位置に戻す
  });
  syncFilterUi();

  // 盤面への表示・非表示を切り替える
  listEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.vis');
    if (!btn) return;
    const ch = registry.get(btn.closest('li').dataset.id);
    if (!ch) return;
    pushUndo();
    ch.hidden = !ch.hidden;
    renderAll();
    scheduleSave();
  });

  // 一覧の身長をその場で編集する
  listEl.addEventListener('input', (ev) => {
    const input = ev.target.closest('.ht');
    if (!input) return;
    const ch = registry.get(input.closest('li').dataset.id);
    if (!ch) return;
    commitEdit();
    const v = parseFloat(input.value);
    if (!isFinite(v) || v <= 0) return;
    ch.heightCm = v;
    render();
    if (ch.id === selectedId) syncInspector();
    scheduleSave();
  });
  listEl.addEventListener('focusin', (ev) => {
    const input = ev.target.closest('.ht');
    if (input) beginEdit('list-height-' + input.closest('li').dataset.id);
  });
  listEl.addEventListener('focusout', (ev) => {
    if (ev.target.closest('.ht')) cancelEdit();
  });

  // ---- 一覧のドラッグ並べ替え（重なり順を変える） ----

  let listDrag = null;
  const LIST_DRAG_THRESHOLD = 4;  // これ以上動いたら並べ替え開始(px)
  const LIST_EDGE = 24;           // 端に近づいたら自動スクロールする幅(px)

  // 現在の DOM の並び（上が手前）を z に反映する
  function applyZFromDom() {
    const ids = [...listEl.children].map((el) => el.dataset.id);
    C.applyOrderToZ(chars, ids);
    listEl.dataset.ids = ids.join(','); // 一覧の作り直しを避けるため揃えておく
  }

  listEl.addEventListener('pointerdown', (ev) => {
    // 入力欄と表示切り替えボタンはドラッグ開始にしない
    if (ev.target.closest('input, button')) return;
    const li = ev.target.closest('li');
    if (!li) return;
    // 絞り込み中は並べ替えを禁じる（見えていない行を飛び越え、結果が予測できないため）。
    // 選択はできるようにしたいので、掴んだこと自体は記録して locked だけ立てる
    listDrag = { id: li.dataset.id, li, startY: ev.clientY, active: false, before: null,
                 locked: isFiltering() };
    listEl.setPointerCapture(ev.pointerId);
  });

  listEl.addEventListener('pointermove', (ev) => {
    if (!listDrag || listDrag.locked) return;
    if (!listDrag.active) {
      if (Math.abs(ev.clientY - listDrag.startY) < LIST_DRAG_THRESHOLD) return;
      listDrag.active = true;
      listDrag.before = snapshot();
      // 並べ替え中は対象を選択状態にしておく（一覧は作り直さず class だけ差し替える）
      selectedId = listDrag.id;
      for (const el of listEl.children) el.classList.toggle('sel', el.dataset.id === selectedId);
      listDrag.li.classList.add('dragging');
      syncInspector();
    }

    // 一覧の端では自動でスクロールする
    const listRect = listEl.getBoundingClientRect();
    if (ev.clientY < listRect.top + LIST_EDGE) listEl.scrollTop -= 8;
    else if (ev.clientY > listRect.bottom - LIST_EDGE) listEl.scrollTop += 8;

    // 他の項目の中点を越えたら差し込み位置を移す
    let target = null;
    for (const el of listEl.children) {
      if (el === listDrag.li) continue;
      const r = el.getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) { target = el; break; }
    }
    if (target !== listDrag.li.nextElementSibling) {
      listEl.insertBefore(listDrag.li, target);
      applyZFromDom();
      render(); // 盤面にも即座に反映する
    }
  });

  function endListDrag(ev) {
    if (!listDrag) return;
    if (listDrag.active) {
      listDrag.li.classList.remove('dragging');
      applyZFromDom();
      recordUndo(listDrag.before);
      scheduleSave();
    } else {
      // 動かさなかった場合はただの選択。画面外にいるなら盤面を寄せる
      selectedId = listDrag.id;
      listDrag = null;
      try { listEl.releasePointerCapture(ev.pointerId); } catch (e) { /* noop */ }
      renderAll();
      scrollBoardToSelected();
      return;
    }
    listDrag = null;
    try { listEl.releasePointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    renderAll();
  }
  listEl.addEventListener('pointerup', endListDrag);
  listEl.addEventListener('pointercancel', endListDrag);

  // ============ 操作 ============

  let drag = null;

  function pointerPos(ev) {
    const rect = boardCanvas.getBoundingClientRect();
    return {
      px: ev.clientX - rect.left,
      py: ev.clientY - rect.top,
      xCm: xToCm(ev.clientX - rect.left),
      yCm: yToCm(ev.clientY - rect.top)
    };
  }

  // 選択中キャラの頭頂／足元ラインを掴んだかを調べる
  function handleAt(px, py) {
    const ch = selected();
    if (!ch || ch.hidden) return null;
    const { rect, dx, dw, tabX } = guideMetrics(ch);
    const left = Math.min(dx - 10, tabX) - 4;
    const right = Math.max(dx + dw + 10, tabX + TAB_W) + 4;
    if (px < left || px > right) return null;
    for (const kind of ['top', 'bottom']) {
      const ratio = kind === 'top' ? ch.topRatio : ch.bottomRatio;
      if (Math.abs(py - cmToY(C.markerCm(rect, ratio))) <= HANDLE_HIT_PX) return kind;
    }
    return null;
  }

  // 空白または中ボタンのドラッグで盤面を掴んで動かす（手のひらツール）
  let pan = null;
  const PAN_THRESHOLD = 3; // これ以上動いたらパン開始(px)

  function startPan(ev, deselectOnClick) {
    pan = {
      startX: ev.clientX, startY: ev.clientY,
      scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop,
      moved: false, deselectOnClick
    };
    boardCanvas.setPointerCapture(ev.pointerId);
  }

  boardCanvas.addEventListener('pointerdown', (ev) => {
    // 中ボタンはキャラの上でもパンにする（密集して空白が掴めない場合の逃げ道）
    if (ev.button === 1) {
      ev.preventDefault();
      startPan(ev, false);
      boardCanvas.style.cursor = 'grabbing';
      return;
    }
    if (ev.button !== 0) return;

    const p = pointerPos(ev);

    // まず頭頂／足元ラインの操作を優先する
    const kind = handleAt(p.px, p.py);
    if (kind) {
      const ch = selected();
      lineDrag = {
        id: ch.id, kind,
        frozen: C.computeCharGeometry(ch),
        view: { topCm: view.topCm, bottomCm: view.bottomCm },
        before: snapshot(), moved: false
      };
      boardCanvas.setPointerCapture(ev.pointerId);
      render();
      return;
    }

    const hit = C.hitTest(chars, p.xCm, p.yCm);
    if (!hit) {
      // 空白：動かせばパン、動かさなければ選択解除
      startPan(ev, true);
      boardCanvas.style.cursor = 'grabbing';
      return;
    }
    selectedId = hit.id;
    drag = { id: hit.id, offsetCm: p.xCm - hit.x, moved: false, before: snapshot() };
    boardCanvas.setPointerCapture(ev.pointerId);
    renderAll();
    scrollListToSelected(); // 一覧側も選択行まで送る
  });

  boardCanvas.addEventListener('pointermove', (ev) => {
    if (pan) {
      const dx = ev.clientX - pan.startX;
      const dy = ev.clientY - pan.startY;
      if (!pan.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      pan.moved = true;
      stage.scrollLeft = pan.scrollLeft - dx;
      stage.scrollTop = pan.scrollTop - dy;
      tooltip.style.display = 'none';
      return;
    }

    const p = pointerPos(ev);

    if (lineDrag) {
      const ch = registry.get(lineDrag.id);
      const r = C.ratioAt(lineDrag.frozen, p.yCm);
      if (lineDrag.kind === 'top') {
        ch.topRatio = Math.min(Math.max(r, 0), ch.bottomRatio - MIN_SPAN);
      } else {
        ch.bottomRatio = Math.max(Math.min(r, 1), ch.topRatio + MIN_SPAN);
      }
      lineDrag.moved = true;
      render();
      syncInspector();
      return;
    }

    if (drag) {
      const ch = registry.get(drag.id);
      if (ch) {
        ch.x = Math.max(0, p.xCm - drag.offsetCm); // 盤面の左端より外に出さない
        drag.moved = true;
        render();
      }
      return;
    }

    const hit = C.hitTest(chars, p.xCm, p.yCm);
    const nextHover = hit ? hit.id : null;
    const overHandle = handleAt(p.px, p.py);
    // 空白は手のひらツール、キャラの上は移動、ラインのつまみは縦方向の調整
    boardCanvas.style.cursor = overHandle ? 'ns-resize' : (hit ? 'move' : 'grab');
    if (nextHover !== hoverId) {
      hoverId = nextHover;
      render();
    }
    updateTooltip(ev, hit);
  });

  // 実際に動かしたときだけ Undo に積む
  function recordUndo(before) {
    undoStack.push(before);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
    pruneRegistry();
  }

  function endDrag(ev) {
    if (pan) {
      // 動かさずに離した空白クリックは、従来どおり選択解除として扱う
      const wasClick = !pan.moved && pan.deselectOnClick;
      pan = null;
      boardCanvas.style.cursor = 'grab';
      try { boardCanvas.releasePointerCapture(ev.pointerId); } catch (e) { /* noop */ }
      if (wasClick && selectedId !== null) {
        selectedId = null;
        renderAll();
      }
      return;
    }
    if (lineDrag) {
      if (lineDrag.moved) { recordUndo(lineDrag.before); scheduleSave(); }
      lineDrag = null;
      renderAll();
    } else if (drag) {
      if (drag.moved) { recordUndo(drag.before); scheduleSave(); }
      drag = null;
      render();
    } else {
      return;
    }
    try { boardCanvas.releasePointerCapture(ev.pointerId); } catch (e) { /* noop */ }
  }
  boardCanvas.addEventListener('pointerup', endDrag);
  boardCanvas.addEventListener('pointercancel', endDrag);
  // 中ボタンのオートスクロール（Windows のブラウザ既定）を抑える
  boardCanvas.addEventListener('mousedown', (ev) => { if (ev.button === 1) ev.preventDefault(); });
  boardCanvas.addEventListener('auxclick', (ev) => { if (ev.button === 1) ev.preventDefault(); });
  boardCanvas.addEventListener('pointerleave', () => {
    if (hoverId !== null) { hoverId = null; render(); }
    tooltip.style.display = 'none';
  });

  // ホイールの単位はブラウザによって px / 行 / ページと変わるため px に揃える
  function wheelDelta(ev) {
    const unit = ev.deltaMode === 1 ? 16 : (ev.deltaMode === 2 ? 400 : 1);
    return {
      x: ev.deltaX * unit,
      y: ev.deltaY * unit
    };
  }

  // ホイールで拡大縮小。Shift 併用のときだけ横スクロール
  stage.addEventListener('wheel', (ev) => {
    if (ev.ctrlKey) return; // ブラウザのズームは邪魔しない
    const d = wheelDelta(ev);
    if (ev.shiftKey) {
      const delta = Math.abs(d.x) > Math.abs(d.y) ? d.x : d.y;
      if (!delta) return;
      stage.scrollLeft += delta;
      ev.preventDefault();
      return;
    }
    const delta = d.y || d.x;
    if (!delta) return;
    ev.preventDefault();
    // カーソルの下にあるものが動かないように拡大縮小する
    setZoom(zoom * Math.pow(1.0015, -delta), ev.clientX, ev.clientY);
  }, { passive: false });

  function updateTooltip(ev, hit) {
    if (!hit || drag || lineDrag) { tooltip.style.display = 'none'; return; }
    const wrapRect = $('stage-wrap').getBoundingClientRect();
    tooltip.innerHTML = escapeHtml(hit.name) +
      ' <span class="h">' + formatCm(hit.heightCm) + ' cm</span>';
    tooltip.style.left = (ev.clientX - wrapRect.left) + 'px';
    tooltip.style.top = (ev.clientY - wrapRect.top - 12) + 'px';
    tooltip.style.display = 'block';
  }

  // ============ キーボード ============

  let lastNudge = 0;

  window.addEventListener('keydown', (ev) => {
    const t = ev.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing || dlg.open) return;

    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      ev.shiftKey ? redo() : undo();
      return;
    }
    if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
    if (mod) return;

    if (ev.key === 'Escape' && selectedId !== null) {
      ev.preventDefault();
      selectedId = null;
      renderAll();
      return;
    }

    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const ch = selected();
      if (!ch) return;
      ev.preventDefault();
      // 押しっぱなしの連続移動はひとまとまりの操作として扱う
      const now = performance.now();
      if (now - lastNudge > 800) pushUndo();
      lastNudge = now;
      const step = (ev.shiftKey ? 10 : 1) * (ev.key === 'ArrowLeft' ? -1 : 1);
      ch.x = Math.max(0, ch.x + step / view.pxPerCm);
      render();
      scheduleSave();
    }
  });

  // ============ インスペクタ ============

  function syncInspector() {
    const ch = selected();
    $('no-selection').hidden = !!ch;
    $('selection').hidden = !ch;
    if (!ch) return;
    if (document.activeElement !== $('in-name')) $('in-name').value = ch.name;
    if (document.activeElement !== $('in-height')) $('in-height').value = formatCm(ch.heightCm);
    $('in-top').value = (ch.topRatio * 100).toFixed(1);
    $('in-bottom').value = (ch.bottomRatio * 100).toFixed(1);
    $('val-top').textContent = (ch.topRatio * 100).toFixed(1) + '%';
    $('val-bottom').textContent = (ch.bottomRatio * 100).toFixed(1) + '%';
  }

  // 入力欄の編集開始を Undo の区切りにする
  for (const id of ['in-name', 'in-height', 'in-top', 'in-bottom']) {
    const el = $(id);
    el.addEventListener('focus', () => beginEdit(id));
    el.addEventListener('pointerdown', () => beginEdit(id));
    el.addEventListener('blur', cancelEdit);
  }

  function withSelected(fn, opt = {}) {
    const ch = selected();
    if (!ch) return;
    fn(ch);
    if (opt.list !== false) renderList();
    render();
    scheduleSave();
  }

  $('in-name').addEventListener('input', () => withSelected((ch) => {
    commitEdit();
    ch.name = $('in-name').value;
  }));
  $('in-height').addEventListener('input', () => withSelected((ch) => {
    commitEdit();
    const v = parseFloat($('in-height').value);
    if (isFinite(v) && v > 0) ch.heightCm = v;
  }));
  $('in-top').addEventListener('input', () => withSelected((ch) => {
    commitEdit();
    const v = parseFloat($('in-top').value) / 100;
    ch.topRatio = Math.min(v, ch.bottomRatio - MIN_SPAN);
    $('val-top').textContent = (ch.topRatio * 100).toFixed(1) + '%';
  }, { list: false }));
  $('in-bottom').addEventListener('input', () => withSelected((ch) => {
    commitEdit();
    const v = parseFloat($('in-bottom').value) / 100;
    ch.bottomRatio = Math.max(v, ch.topRatio + MIN_SPAN);
    $('val-bottom').textContent = (ch.bottomRatio * 100).toFixed(1) + '%';
  }, { list: false }));


  $('btn-reset-lines').addEventListener('click', () => withSelected((ch) => {
    pushUndo();
    ch.topRatio = 0;
    ch.bottomRatio = 1;
    syncInspector();
  }));

  // 立ち絵を描き直したとき、設定を保ったまま絵だけ入れ替える
  $('btn-replace-image').addEventListener('click', () => {
    if (!selected()) return;
    const targetId = selectedId;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      const ch = registry.get(targetId);
      if (!file || !ch) return;
      const btn = $('btn-replace-image');
      btn.disabled = true;
      btn.textContent = T('field.replacing');
      try {
        const blob = file.slice(0, file.size, file.type);
        const [{ bbox, size }, display] =
          await Promise.all([detectBBox(blob), makeDisplayCanvas(blob)]);
        pushUndo();
        // 名前・身長・位置・重なり順・ライン比率はそのまま引き継ぐ
        Object.assign(ch, { blob, display, bbox, srcW: size.w, srcH: size.h });
        ch.thumb = makeThumb(ch);
        listEl.dataset.ids = ''; // サムネイルを作り直させる
        renderAll();
        scheduleSave();
      } catch (e) {
        alert(T('msg.replaceFailed', (e && e.message ? e.message : e)));
      } finally {
        btn.disabled = false;
        btn.textContent = T('field.replaceTitle');
      }
    });
    input.click();
  });

  $('btn-duplicate').addEventListener('click', () => {
    const src = selected();
    if (!src) return;
    pushUndo();
    const copy = Object.assign({}, src, {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: src.name + T('name.copySuffix'),
      z: chars.reduce((m, c) => Math.max(m, c.z), -1) + 1
    });
    copy.x = src.x + C.computeCharGeometry(src).widthCm + 5;
    registry.set(copy.id, copy);
    chars.push(copy);
    selectedId = copy.id;
    renderAll();
    scheduleSave();
  });

  const zButton = (delta) => () => withSelected((ch) => {
    pushUndo();
    C.shiftZ(chars, ch.id, delta);
  });
  $('btn-forward').addEventListener('click', zButton(1));
  $('btn-backward').addEventListener('click', zButton(-1));

  $('btn-front').addEventListener('click', () => withSelected((ch) => {
    pushUndo();
    ch.z = chars.reduce((m, c) => Math.max(m, c.z), 0) + 1;
    C.normalizeZ(chars);
  }));
  $('btn-back').addEventListener('click', () => withSelected((ch) => {
    pushUndo();
    ch.z = chars.reduce((m, c) => Math.min(m, c.z), 0) - 1;
    C.normalizeZ(chars);
  }));

  // 1 体の削除は Ctrl+Z で戻せるので確認を挟まない
  $('btn-delete').addEventListener('click', () => {
    const ch = selected();
    if (!ch) return;
    pushUndo();
    chars = chars.filter((c) => c.id !== selectedId);
    C.normalizeZ(chars);
    selectedId = null;
    renderAll();
    scheduleSave();
  });

  // ============ ツールバー ============

  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);

  $('btn-add').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.addEventListener('change', () => addFiles(input.files));
    input.click();
  });

  function applyLayout(map) {
    if (chars.length === 0) return;
    pushUndo();
    for (const ch of chars) if (map.has(ch.id)) ch.x = map.get(ch.id);
    render();
    scheduleSave();
  }

  // ---- 表示倍率 ----

  // 基準点（既定は画面中央）に見えているものを保ったまま倍率を変える
  function setZoom(next, anchorClientX, anchorClientY) {
    const stageRect = stage.getBoundingClientRect();
    const ax = anchorClientX != null ? anchorClientX : stageRect.left + view.viewportW / 2;
    const ay = anchorClientY != null ? anchorClientY : stageRect.top + view.viewportH / 2;
    const boardRect = boardCanvas.getBoundingClientRect();
    const cmX = xToCm(ax - boardRect.left);
    const cmY = yToCm(ay - boardRect.top);

    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    render();

    // 同じ cm 位置が同じ画面位置に来るようスクロールを合わせ直す
    stage.scrollLeft = stageRect.left + AXIS_W + cmToX(cmX) - ax;
    stage.scrollTop = stageRect.top + cmToY(cmY) - ay;
  }

  $('btn-zoom-in').addEventListener('click', () => setZoom(zoom * 1.25));
  $('btn-zoom-out').addEventListener('click', () => setZoom(zoom / 1.25));
  $('zoom-label').addEventListener('click', () => setZoom(1));
  $('btn-zoom-fit').addEventListener('click', () => {
    if (chars.length === 0) { setZoom(1); return; }
    layout();
    // 盤面の全幅が画面に収まる倍率にする（等倍より拡大はしない）
    const need = (view.viewportW - AXIS_W - 8) / C.computeBoardWidthCm(chars);
    setZoom(Math.min(1, need / view.basePxPerCm));
    stage.scrollLeft = 0;
  });

  $('btn-align-even').addEventListener('click', () => applyLayout(C.alignEven(chars)));
  /* 按鈕文字會在正序與逆序之間切換，切語言時也要重寫，所以抽成一個函式。 */
  function syncSortButton() {
    $('btn-align-height').textContent = T(heightSortDesc ? 'tb.sortHeight' : 'tb.sortHeightAsc');
  }

  $('btn-align-height').addEventListener('click', () => {
    applyLayout(C.alignByHeight(chars, heightSortDesc));
    heightSortDesc = !heightSortDesc;
    syncSortButton();
  });

  // その他メニューは外側クリックと Esc で閉じる
  const moreMenu = $('more-menu');
  document.addEventListener('pointerdown', (ev) => {
    if (moreMenu.open && !moreMenu.contains(ev.target)) moreMenu.open = false;
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && moreMenu.open) moreMenu.open = false;
  });

  $('btn-about').addEventListener('click', () => {
    moreMenu.open = false;
    $('dlg-about').showModal();
  });

  $('btn-clear').addEventListener('click', () => {
    moreMenu.open = false;
    if (chars.length === 0) return;
    if (!confirm(T('confirm.deleteAll'))) return;
    pushUndo();
    chars = [];
    selectedId = null;
    renderAll();
    scheduleSave();
  });

  // ============ ファイルへの保存・読込 ============
  //
  // 形式（.hboard）：
  //   "THB1"(4B) + メタ長(uint32 LE) + メタ JSON(UTF-8) + 画像データを順に連結
  // 画像を base64 で JSON に埋めると 8MB 級の画像で文字列が肥大するため、
  // Blob をそのまま連結し、読み込み時は slice で切り出す。

  const FILE_MAGIC = 'THB1';
  const FILE_EXT = '.hboard';
  const FILE_VERSION = 1;

  // 書き出しのたびに (1) (2) が付いて区別できなくなるのを防ぐ
  function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function saveToFile() {
    const meta = {
      version: FILE_VERSION,
      chars: chars.map((ch) => ({
        id: ch.id, name: ch.name, heightCm: ch.heightCm, x: ch.x, z: ch.z,
        bbox: ch.bbox, topRatio: ch.topRatio, bottomRatio: ch.bottomRatio,
        hidden: !!ch.hidden, srcW: ch.srcW, srcH: ch.srcH,
        blobType: ch.blob.type || 'image/png', blobSize: ch.blob.size
      }))
    };
    const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
    const header = new Uint8Array(8);
    for (let i = 0; i < 4; i++) header[i] = FILE_MAGIC.charCodeAt(i);
    new DataView(header.buffer).setUint32(4, metaBytes.length, true);

    // Blob の連結はブラウザ側で扱われるため、全画像をメモリに載せずに済む
    const blob = new Blob([header, metaBytes, ...chars.map((c) => c.blob)],
      { type: 'application/octet-stream' });
    downloadBlob(blob, 'height-board_' + timestamp() + FILE_EXT);
  }

  async function loadFromFile(file) {
    const head = new DataView(await file.slice(0, 8).arrayBuffer());
    let magic = '';
    for (let i = 0; i < 4; i++) magic += String.fromCharCode(head.getUint8(i));
    if (magic !== FILE_MAGIC) throw new Error(T('file.notOurs'));

    const metaLen = head.getUint32(4, true);
    if (metaLen <= 0 || metaLen > file.size) throw new Error(T('file.corrupt'));
    const meta = JSON.parse(new TextDecoder().decode(await file.slice(8, 8 + metaLen).arrayBuffer()));
    if (!meta || !Array.isArray(meta.chars)) throw new Error(T('file.corrupt'));
    // 知らない形式を読み進めると、壊れた状態で復元してしまう
    if (meta.version !== FILE_VERSION) {
      throw new Error(T('file.badVersion', meta.version, FILE_VERSION));
    }

    let offset = 8 + metaLen;
    const loaded = [];
    for (const rec of meta.chars) {
      if (offset + rec.blobSize > file.size) throw new Error(T('file.corrupt'));
      const blob = file.slice(offset, offset + rec.blobSize, rec.blobType || 'image/png');
      offset += rec.blobSize;
      const ch = {
        id: rec.id, name: rec.name, heightCm: rec.heightCm, x: rec.x, z: rec.z,
        bbox: rec.bbox, topRatio: rec.topRatio, bottomRatio: rec.bottomRatio,
        hidden: !!rec.hidden, srcW: rec.srcW, srcH: rec.srcH,
        blob, display: await makeDisplayCanvas(blob)
      };
      ch.thumb = makeThumb(ch);
      loaded.push(ch);
    }

    // 読み込んだ内容で完全に置き換える。Undo 履歴は前の盤面のものなので捨てる
    chars = loaded;
    registry.clear();
    for (const ch of chars) registry.set(ch.id, ch);
    C.normalizeZ(chars);
    undoStack.length = 0;
    redoStack.length = 0;
    updateUndoButtons();
    selectedId = null;
    zoom = 1;
    renderAll();
    scheduleSave();
  }

  $('btn-save').addEventListener('click', () => {
    if (chars.length === 0) { alert(T('msg.noChars')); return; }
    saveToFile();
  });

  $('btn-load').addEventListener('click', () => {
    if (chars.length > 0 &&
        !confirm(T('confirm.load'))) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = FILE_EXT;
    input.addEventListener('change', async () => {
      if (!input.files || !input.files[0]) return;
      const btn = $('btn-load');
      btn.disabled = true;
      btn.textContent = T('tb.loading');
      try {
        await loadFromFile(input.files[0]);
      } catch (e) {
        alert(T('msg.loadFailed', (e && e.message ? e.message : e)));
      } finally {
        btn.disabled = false;
        btn.textContent = T('tb.load');
      }
    });
    input.click();
  });

  // ============ PNG 書き出し ============

  $('btn-export').addEventListener('click', async () => {
    if (chars.length === 0) { alert(T('msg.noChars')); return; }
    if (C.visible(chars).length === 0) { alert(T('msg.noVisible')); return; }
    const btn = $('btn-export');
    btn.disabled = true;
    btn.textContent = T('tb.exporting');
    try {
      await exportPng();
    } catch (e) {
      alert(T('msg.exportFailed', (e && e.message ? e.message : e)));
    } finally {
      btn.disabled = false;
      btn.textContent = T('tb.exportPng');
    }
  });

  async function exportPng() {
    // 目盛りを画面と同じ丸ゴシックで焼き込む。読み込み前だとフォールバックで描かれ、
    // 画面と PNG で書体が食い違う（読み込めない環境ではそのまま解決する）
    await CANVAS_FONT_READY;

    const axisCm = 14; // 書き出し時の軸幅（cm 換算）
    const pxPerCm = C.computeExportPxPerCm(chars, EXPORT_MAX_AREA, EXPORT_MAX_SIDE, axisCm);
    const topCm = C.computeBoardTopCm(chars);
    const bottomCm = C.computeBoardBottomCm(chars);
    // 左端の空白まで書き出すと、配置位置しだいで解像度が落ちてしまう。
    // 実際にキャラがいる範囲だけを切り取る
    const range = C.computeContentRangeCm(chars);
    const axisPx = Math.round(axisCm * pxPerCm);
    const axisFontPx = Math.max(10, Math.round(axisPx * 0.24));
    // 上下端の数値ラベルが切れないだけの余白を確保する
    const padTop = Math.ceil(axisFontPx * 0.75);
    const padBottom = padTop;
    const widthPx = Math.round((range.rightCm - range.leftCm) * pxPerCm) + axisPx;
    const heightPx = Math.round((topCm - bottomCm) * pxPerCm) + padTop + padBottom;

    const cv = document.createElement('canvas');
    cv.width = widthPx;
    cv.height = heightPx;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    const o = {
      widthPx, heightPx, pxPerCm, topCm, padTop,
      // 切り取った左端が目盛り軸のすぐ右に来るようずらす
      originX: axisPx - range.leftCm * pxPerCm,
      background: '#ffffff'
    };
    drawBackdrop(ctx, o);

    // 原寸の画像は 1 枚ずつ復号して描き、すぐ解放する
    // （全員ぶんを同時に展開すると、人数と画像サイズ次第でメモリが破綻するため）
    for (const ch of backToFront()) {
      const bmp = await decode(ch.blob);
      try {
        drawCharImage(ctx, ch, bmp, 1, C.computeCharGeometry(ch), o);
      } finally {
        if (bmp.close) bmp.close();
      }
    }

    drawAxis(ctx, { widthPx: axisPx, heightPx, pxPerCm, topCm, padTop, fontPx: axisFontPx });

    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    downloadBlob(blob, 'height-board_' + timestamp() + '.png');
  }

  // ============ ドラッグ&ドロップ ============

  // ドロップ地点を盤面座標(cm)に変換する。盤面の外なら null
  function dropPositionCm(ev) {
    const rect = boardCanvas.getBoundingClientRect();
    if (ev.clientX < rect.left || ev.clientX > rect.right ||
        ev.clientY < rect.top || ev.clientY > rect.bottom) return null;
    return xToCm(ev.clientX - rect.left);
  }

  let dragDepth = 0;
  window.addEventListener('dragenter', (ev) => {
    if (!Array.from(ev.dataTransfer.types || []).includes('Files')) return;
    dragDepth++;
    document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('dragging');
  });
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    if (!ev.dataTransfer || !ev.dataTransfer.files.length) return;
    pendingDropCm = dropPositionCm(ev);
    addFiles(ev.dataTransfer.files);
  });

  // ============ 起動 ============

  window.addEventListener('resize', () => {
    SCROLLBAR = measureScrollbar();
    render();
  });
  updateUndoButtons();
  /* 切換語言：一覽、盤面（目盛りの頭頂／足元）、工具列上由 JS 寫入的標籤，
   * 以及已顯示的狀態訊息都要重寫。其餘文字由引擎的 data-i18n 處理。 */
  I18N.mountSwitcher(document.getElementById('localeSelect'));
  I18N.onChange(() => {
    listEl.dataset.ids = '';   /* 縮圖連同 title 一起重做 */
    renderAll();
    renderStatus();
    syncSortButton();
  });

  renderAll();
  load();

  // Canvas は CSS と違い、フォントが後から届いても描き直されない。
  // 読み込み完了で一度描き直さないと、目盛りだけフォールバックの書体で残る
  CANVAS_FONT_READY.then(render);

  // テスト・動作確認用に内部状態を公開する
  window.__board = {
    core: C,
    getChars: () => chars,
    addFiles,
    render: renderAll,
    undo, redo,
    saveToFile, loadFromFile,
    getZoom: () => zoom,
    getPxPerCm: () => view.pxPerCm,
    getRegistrySize: () => registry.size,
    bumpHistory: () => pushUndo(), // 履歴の押し出しを確かめるためのもの
    setZoom,
    screenToCm: (px, py) => ({ xCm: xToCm(px), yCm: yToCm(py) }),
    setDropPosition: (cm) => { pendingDropCm = cm; },
    select: (id) => { selectedId = id; renderAll(); },
    handleScreenPos: (kind) => {
      const ch = selected();
      if (!ch) return null;
      const rect = rectFor(ch);
      const ratio = kind === 'top' ? ch.topRatio : ch.bottomRatio;
      return { x: cmToX(ch.x) + rect.widthCm * view.pxPerCm / 2, y: cmToY(C.markerCm(rect, ratio)) };
    }
  };
})();
