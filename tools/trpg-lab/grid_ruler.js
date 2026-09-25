(function () {
    'use strict';

    /* ================================================================
   カラーユーティリティ
================================================================ */
    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => {
            const k = (n + h / 30) % 12;
            const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * c)
                .toString(16)
                .padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }
    function lerpI(a, b, t) {
        return Math.round(a + (b - a) * t);
    }
    function interpolateHex(c1, c2, t) {
        const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
        const [r1, g1, b1] = p(c1),
            [r2, g2, b2] = p(c2);
        return `#${lerpI(r1, r2, t).toString(16).padStart(2, '0')}${lerpI(g1, g2, t).toString(16).padStart(2, '0')}${lerpI(b1, b2, t).toString(16).padStart(2, '0')}`;
    }
    // {r,g,b,a} → rgba文字列（グローバル不透明度を乗算）
    function toRgba(col, mul) {
        const baseA = typeof col.a === 'number' && !isNaN(col.a) ? col.a : 1;
        const a = baseA * (mul !== undefined ? mul : 1);
        return `rgba(${Math.round(col.r)},${Math.round(col.g)},${Math.round(col.b)},${a.toFixed(4)})`;
    }
    // hex → {r,g,b,a:1}
    function hexToCol(hex) {
        return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), a: 1.0 };
    }
    // Pickr color → {r,g,b,a}
    function pickrToCol(color) {
        const [r, g, b, a] = color.toRGBA();
        return { r, g, b, a };
    }
    // {r,g,b,a} → Pickr が受け付ける rgba 文字列
    function colToPickrStr(col) {
        return `rgba(${Math.round(col.r)},${Math.round(col.g)},${Math.round(col.b)},${col.a.toFixed(4)})`;
    }

    // スキーム関数（hex を返す）
    const SCHEMES = {
        rainbow: (d, maxD) => (d === 0 ? '#ffffff' : maxD <= 1 ? '#ff6464' : hslToHex(((d - 1) / (maxD - 1)) * 270, 100, 70)),
        heat: (d, maxD) => (d === 0 ? '#ffffff' : maxD <= 1 ? '#ff4040' : interpolateHex('#ff4040', '#ffee40', (d - 1) / (maxD - 1))),
        cold: (d, maxD) => (d === 0 ? '#ffffff' : maxD <= 1 ? '#64d4ff' : interpolateHex('#64d4ff', '#4040ee', (d - 1) / (maxD - 1))),
        mono: (d, maxD) => (d === 0 ? '#ffffff' : maxD <= 1 ? '#aaaaaa' : interpolateHex('#dddddd', '#444444', (d - 1) / (maxD - 1))),
    };
    // スキームから {r,g,b,a} を得る（'none' は完全透明）
    function schemeCol(d, range, scheme) {
        if (scheme === 'none') return { r: 0, g: 0, b: 0, a: 0 };
        return hexToCol(SCHEMES[scheme] ? SCHEMES[scheme](d, range) : '#aaaaaa');
    }

    /* ================================================================
   状態
================================================================ */
    const customCells = new Map(); // key:"x,y" → {text, color:{r,g,b,a}, textColor:{r,g,b,a}, fontSize}
    let editingCell = null;

    let distColors = []; // {r,g,b,a}[]
    let distPickrs = [];
    let textPickr, strokePickr, popupCellPickr, popupTextPickr;

    // グローバル色オブジェクト
    let textCol = { r: 0, g: 0, b: 0, a: 1.0 };
    let strokeCol = { r: 255, g: 255, b: 255, a: 1.0 };
    // ポップアップ用（変更のたびに更新）
    let popupCellCol = { r: 255, g: 100, b: 100, a: 1.0 };
    let popupTextCol = { r: 0, g: 0, b: 0, a: 1.0 };

    let suppressPopupChange = false;

    /* ================================================================
   ゲッター（0=0 バグ修正：isNaN チェック）
================================================================ */
    function getCellSize() { return Math.max(10, parseInt(document.getElementById('cellSize').value) || 48); }
    function getRange() {
        return Math.max(1, parseInt(document.getElementById('range').value) || 5);
    }
    function getCellOpacity() {
        const v = parseInt(document.getElementById('cellOpacity').value);
        return (isNaN(v) ? 100 : v) / 100;
    }
    function getTextOpacity() {
        const v = parseInt(document.getElementById('textOpacity').value);
        return (isNaN(v) ? 100 : v) / 100;
    }
    function getGlobalFontSize() {
        return Math.max(6, parseInt(document.getElementById('fontSize').value) || 40);
    }

    /* ================================================================
   距離計算
================================================================ */
    function calcDist(x, y, method) {
        if (method === 'chebyshev') return Math.max(Math.abs(x), Math.abs(y));
        const raw = Math.sqrt(x * x + y * y);
        if (method === 'ceil') return Math.ceil(raw);
        if (method === 'round') return Math.round(raw);
        if (method === 'floor') return Math.floor(raw);
        return Math.abs(x) + Math.abs(y);
    }

    /* ================================================================
   スライダー ↔ number 双方向同期
================================================================ */
    function syncPair(slId, nmId) {
        const sl = document.getElementById(slId);
        const nm = document.getElementById(nmId);
        sl.addEventListener('input', () => {
            nm.value = sl.value;
            render();
        });
        nm.addEventListener('input', () => {
            const v = Math.min(parseFloat(nm.max), Math.max(parseFloat(nm.min), parseFloat(nm.value) || 0));
            sl.value = v;
            render();
        });
    }

    /* ================================================================
   距離ごとカラーピッカー構築
================================================================ */
    /* 各距離顏色列的標籤。切換語言時只改這段文字，不重建 Pickr（重建會把自訂的顏色洗回配色）。 */
    function distLabel(d) {
        return d === 0 ? T('dist.center') : T('dist.label', d);
    }

    function buildColorPickers() {
        distPickrs.forEach((p) => {
            try {
                p.destroyAndRemove();
            } catch (e) {}
        });
        distPickrs = [];
        distColors = [];

        const range = getRange();
        const scheme = document.getElementById('colorScheme').value;
        const wrap = document.getElementById('colorPickerWrap');
        wrap.innerHTML = '';

        for (let d = 0; d <= range; d++) {
            const col = schemeCol(d, range, scheme);
            distColors[d] = col;

            const row = document.createElement('div');
            row.className = 'color-row';
            const label = document.createElement('span');
            label.className = 'color-d-label';
            label.textContent = distLabel(d);
            const pickrEl = document.createElement('div');
            row.appendChild(label);
            row.appendChild(pickrEl);
            wrap.appendChild(row);

            (function (idx, el, initCol) {
                const p = Pickr.create({
                    el,
                    theme: 'nano',
                    default: colToPickrStr(initCol),
                    components: { preview: true, opacity: true, hue: true, interaction: { input: true, save: true } },
                    i18n: { 'btn:save': T('picker.save') },
                });
                p.on('change', (color) => {
                    distColors[idx] = pickrToCol(color);
                    render();
                }).on('save', (_, inst) => inst.hide());
                distPickrs[idx] = p;
            })(d, pickrEl, col);
        }
    }

    function applyScheme() {
        const range = getRange();
        const scheme = document.getElementById('colorScheme').value;
        if (scheme === 'custom') return;
        for (let d = 0; d <= range; d++) {
            const col = schemeCol(d, range, scheme);
            distColors[d] = col;
            distPickrs[d]?.setColor(colToPickrStr(col));
        }
    }

    /* ================================================================
   メイン描画
================================================================ */
    function render() {
        const range = getRange();
        const method = document.getElementById('distanceMethod').value;
        const cellOpacityMul = getCellOpacity();
        const textOpacityMul = getTextOpacity();
        const strokeOn = document.getElementById('strokeEnabled').checked;
        const globalFontSize = getGlobalFontSize();

        const cs = getCellSize();
        const gridSize = range * 2 + 1;
        const canvas = document.getElementById('rulerCanvas');
        canvas.width = canvas.height = gridSize * cs;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let cy = -range; cy <= range; cy++) {
            for (let cx = -range; cx <= range; cx++) {
                const d = calcDist(cx, cy, method);
                if (d > range) continue;

                const key = `${cx},${cy}`;
                const custom = customCells.get(key);
                const px = (cx + range) * cs;
                const py = (cy + range) * cs;

                // セルの色（カスタム優先、グローバル不透明度を乗算）
                const cellCol = custom?.color ?? distColors[d] ?? { r: 128, g: 128, b: 128, a: 0 };
                const effCellA = cellCol.a * cellOpacityMul;
                if (effCellA > 0) {
                    ctx.fillStyle = toRgba(cellCol, cellOpacityMul);
                    ctx.fillRect(px, py, cs, cs);
                }

                // 境界線
                const isEditing = editingCell && editingCell.x === cx && editingCell.y === cy;
                ctx.strokeStyle = isEditing ? 'rgba(0,229,255,0.9)' : 'rgba(0,0,0,0.2)';
                ctx.lineWidth = isEditing ? 3 : 1;
                ctx.strokeRect(px + (isEditing ? 1.5 : 0), py + (isEditing ? 1.5 : 0), cs - (isEditing ? 3 : 0), cs - (isEditing ? 3 : 0));

                // テキスト
                const text = custom?.text !== undefined && custom.text !== '' ? custom.text : String(d);
                const fontSize = custom?.fontSize ?? globalFontSize;
                const tCol = custom?.textColor ?? textCol;

                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const tx = px + cs / 2;
                const ty = py + cs / 2;

                if (strokeOn) {
                    ctx.save();
                    ctx.strokeStyle = toRgba(strokeCol, textOpacityMul);
                    ctx.lineWidth = Math.max(2, fontSize * 0.18);
                    ctx.lineJoin = 'round';
                    ctx.strokeText(text, tx, ty);
                    ctx.restore();
                }
                ctx.fillStyle = toRgba(tCol, textOpacityMul);
                ctx.fillText(text, tx, ty);
            }
        }
    }

    /* ================================================================
   カスタムセル編集
================================================================ */
    function applyCellEdit() {
        if (!editingCell) return;
        const key = `${editingCell.x},${editingCell.y}`;
        customCells.set(key, {
            text: document.getElementById('cp-text').value,
            color: { r: popupCellCol.r, g: popupCellCol.g, b: popupCellCol.b, a: popupCellCol.a ?? 1 },
            textColor: { r: popupTextCol.r, g: popupTextCol.g, b: popupTextCol.b, a: popupTextCol.a ?? 1 },
            fontSize: Math.max(6, parseInt(document.getElementById('cp-fontSize').value) || getGlobalFontSize()),
        });
        updateCustomCount();
        render();
    }

    function showCellPopup(x, y, screenX, screenY, defaultDist) {
        editingCell = { x, y, defaultDist };
        const custom = customCells.get(`${x},${y}`);

        document.getElementById('cp-text').value = custom?.text ?? String(defaultDist);
        renderCoordLabel();

        // セルの色デフォルト
        const defaultCellCol = distColors[defaultDist] ?? { r: 128, g: 128, b: 128, a: 1 };
        popupCellCol = custom?.color ? { ...custom.color } : { ...defaultCellCol };

        // 文字色デフォルト
        popupTextCol = custom?.textColor ? { ...custom.textColor } : { ...textCol };

        // 文字サイズ
        document.getElementById('cp-fontSize').value = custom?.fontSize ?? getGlobalFontSize();

        // Pickr をサイレント更新
        suppressPopupChange = true;
        popupCellPickr?.setColor(colToPickrStr(popupCellCol));
        popupTextPickr?.setColor(colToPickrStr(popupTextCol));
        suppressPopupChange = false;

        // 表示・位置
        const popup = document.getElementById('cell-popup');
        popup.style.display = 'block';
        const pw = popup.offsetWidth || 230;
        const ph = popup.offsetHeight || 240;
        let left = screenX + 14;
        let top = screenY + 14;
        if (left + pw > window.innerWidth - 8) left = screenX - pw - 14;
        if (top + ph > window.innerHeight - 8) top = screenY - ph - 14;
        popup.style.left = Math.max(8, left) + 'px';
        popup.style.top = Math.max(8, top) + 'px';

        render();
    }

    /* 浮動視窗上方的「格子 (x, y)／預設距離」。切換語言時也從這裡重寫。 */
    function renderCoordLabel() {
        if (!editingCell) return;
        document.getElementById('cpCoord').textContent = T('popup.coord', editingCell.x, editingCell.y, editingCell.defaultDist);
    }

    function closeCellPopup() {
        editingCell = null;
        document.getElementById('cell-popup').style.display = 'none';
        render();
    }

    function updateCustomCount() {
        document.getElementById('customCount').textContent = customCells.size;
    }

    /* ================================================================
   キャンバスクリック
================================================================ */
    document.getElementById('cvWrap').addEventListener('click', function (e) {
        const canvas = document.getElementById('rulerCanvas');
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        const range = getRange();
        const method = document.getElementById('distanceMethod').value;
        const cs = getCellSize();
        const col = Math.floor(canvasX / cs);
        const row = Math.floor(canvasY / cs);
        const cx = col - range;
        const cy = row - range;
        const d = calcDist(cx, cy, method);

        if (d > range || col < 0 || row < 0 || col > range * 2 || row > range * 2) {
            closeCellPopup();
            return;
        }
        showCellPopup(cx, cy, e.clientX, e.clientY, d);
    });

    /* ================================================================
   Pickr 初期化
================================================================ */
    function initGlobalPickrs() {
        textPickr = Pickr.create({
            el: document.getElementById('textColorPicker'),
            theme: 'nano',
            default: colToPickrStr(textCol),
            components: { preview: true, opacity: true, hue: true, interaction: { input: true, save: true } },
            i18n: { 'btn:save': T('picker.save') },
        });
        textPickr
            .on('change', (color) => {
                textCol = pickrToCol(color);
                render();
            })
            .on('save', (_, p) => p.hide());

        strokePickr = Pickr.create({
            el: document.getElementById('strokeColorPicker'),
            theme: 'nano',
            default: colToPickrStr(strokeCol),
            components: { preview: true, opacity: true, hue: true, interaction: { input: true, save: true } },
            i18n: { 'btn:save': T('picker.save') },
        });
        strokePickr
            .on('change', (color) => {
                strokeCol = pickrToCol(color);
                render();
            })
            .on('save', (_, p) => p.hide());
    }

    function initPopupPickrs() {
        popupCellPickr = Pickr.create({
            el: document.getElementById('popupCellColorPicker'),
            theme: 'nano',
            default: colToPickrStr(popupCellCol),
            components: { preview: true, opacity: true, hue: true, interaction: { input: true, save: true } },
            i18n: { 'btn:save': T('picker.save') },
        });
        popupCellPickr
            .on('change', (color) => {
                if (suppressPopupChange) return;
                popupCellCol = pickrToCol(color);
                applyCellEdit();
            })
            .on('save', (_, p) => p.hide());

        popupTextPickr = Pickr.create({
            el: document.getElementById('popupTextColorPicker'),
            theme: 'nano',
            default: colToPickrStr(popupTextCol),
            components: { preview: true, opacity: true, hue: true, interaction: { input: true, save: true } },
            i18n: { 'btn:save': T('picker.save') },
        });
        popupTextPickr
            .on('change', (color) => {
                if (suppressPopupChange) return;
                popupTextCol = pickrToCol(color);
                applyCellEdit();
            })
            .on('save', (_, p) => p.hide());
    }

    /* ================================================================
   イベントリスナー
================================================================ */
    document.addEventListener('DOMContentLoaded', () => {
        if (window.IKLab?.initNumSpinners) IKLab.initNumSpinners();

        initGlobalPickrs();
        initPopupPickrs();
        buildColorPickers();

        syncPair('cellOpacity', 'cellOpacityNum');
        syncPair('textOpacity', 'textOpacityNum');

        document.getElementById('cellSize').addEventListener('input', render);
        document.getElementById('range').addEventListener('input', () => {
            buildColorPickers();
            render();
        });
        document.getElementById('distanceMethod').addEventListener('change', render);
        document.getElementById('fontSize').addEventListener('input', render);

        document.getElementById('colorScheme').addEventListener('change', () => {
            buildColorPickers();
            applyScheme();
            render();
        });

        // 縁取りトグル
        const strokeToggle = document.getElementById('strokeEnabled');
        const strokeRow = document.getElementById('strokeColorRow');
        strokeToggle.addEventListener('change', () => {
            const on = strokeToggle.checked;
            strokeRow.style.opacity = on ? '1' : '0.3';
            strokeRow.style.pointerEvents = on ? '' : 'none';
            render();
        });

        // ポップアップ（自動適用）
        document.getElementById('cp-text').addEventListener('input', applyCellEdit);
        document.getElementById('cp-fontSize').addEventListener('input', applyCellEdit);
        document.getElementById('cpClose').addEventListener('click', closeCellPopup);
        document.getElementById('cpReset').addEventListener('click', () => {
            if (!editingCell) return;
            customCells.delete(`${editingCell.x},${editingCell.y}`);
            updateCustomCount();
            closeCellPopup();
        });

        document.getElementById('clearCustomBtn').addEventListener('click', () => {
            customCells.clear();
            updateCustomCount();
            closeCellPopup();
        });

        document.getElementById('downloadBtn').addEventListener('click', () => {
            const canvas = document.getElementById('rulerCanvas');
            const range = getRange();
            const dim = range * 2 + 1;
            const link = document.createElement('a');
            link.download = `grid_ruler_${dim}x${dim}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });

        render();

        /* 靜態文字由共用引擎重套；這裡處理 JS 產生的部分：各距離的標籤、
         * 浮動視窗的座標列，以及 Pickr 自己產生的「確定」按鈕。
         * Pickr 不重建，只改按鈕文字，選好的顏色就不會跑掉。
         * 畫布上的字是距離數字或使用者輸入的文字，與語言無關，不必重畫。 */
        I18N.onChange(() => {
            document.querySelectorAll('#colorPickerWrap .color-d-label').forEach((el, d) => {
                el.textContent = distLabel(d);
            });
            renderCoordLabel();
            [textPickr, strokePickr, popupCellPickr, popupTextPickr, ...distPickrs].forEach((p) => {
                const save = p?.getRoot()?.interaction?.save;
                if (save) save.value = T('picker.save');
            });
        });
    });
})();

