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

    const SCHEMES = {
        rainbow: (d, maxD) => (d === 0 ? '#ffffff' : maxD <= 1 ? '#ff6464' : hslToHex(((d - 1) / (maxD - 1)) * 270, 100, 70)),
        heat: (d, maxD) => (d === 0 ? '#ffffff' : maxD <= 1 ? '#ff4040' : interpolateHex('#ff4040', '#ffee40', (d - 1) / (maxD - 1))),
        cold: (d, maxD) => (d === 0 ? '#ffffff' : maxD <= 1 ? '#64d4ff' : interpolateHex('#64d4ff', '#4040ee', (d - 1) / (maxD - 1))),
        mono: (d, maxD) => (d === 0 ? '#ffffff' : maxD <= 1 ? '#aaaaaa' : interpolateHex('#dddddd', '#444444', (d - 1) / (maxD - 1))),
    };

    // {r,g,b,a} → rgba文字列（グローバル不透明度を乗算）
    function toRgba(col, mul) {
        const baseA = typeof col.a === 'number' && !isNaN(col.a) ? col.a : 1;
        const a = baseA * (mul !== undefined ? mul : 1);
        return `rgba(${Math.round(col.r)},${Math.round(col.g)},${Math.round(col.b)},${a.toFixed(4)})`;
    }
    function hexToCol(hex) {
        return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), a: 1.0 };
    }
    function pickrToCol(color) {
        const [r, g, b, a] = color.toRGBA();
        return { r, g, b, a };
    }
    function colToPickrStr(col) {
        return `rgba(${Math.round(col.r)},${Math.round(col.g)},${Math.round(col.b)},${col.a.toFixed(4)})`;
    }
    function schemeCol(d, range, scheme) {
        if (scheme === 'none') return { r: 0, g: 0, b: 0, a: 0 };
        return hexToCol(SCHEMES[scheme] ? SCHEMES[scheme](d, range) : '#aaaaaa');
    }

    /* ================================================================
       状態
    ================================================================ */
    let distColors = [];
    let distPickrs = [];
    let textPickr, strokePickr, popupCellPickr, popupTextPickr;
    let textCol = { r: 0, g: 0, b: 0, a: 1.0 };
    let strokeCol = { r: 255, g: 255, b: 255, a: 1.0 };
    let popupCellCol = { r: 255, g: 100, b: 100, a: 1.0 };
    let popupTextCol = { r: 0, g: 0, b: 0, a: 1.0 };
    let suppressPopupChange = false;

    const customCells = new Map(); // key:"c,r" → {text, color, textColor, fontSize}
    let editingCell = null;

    /* ================================================================
       ゲッター
    ================================================================ */
    function getCellSize() { return Math.max(10, parseInt(document.getElementById('cellSize').value) || 48); }
    function getRange() {
        return Math.max(1, parseInt(document.getElementById('range').value) || 5);
    }
    function isOri() {
        return document.querySelector('input[name="ori"]:checked').value === 'v';
    }
    function isMethod() {
        return document.querySelector('input[name="method"]:checked').value;
    }
    function isFitGrid() {
        return document.getElementById('fitGrid').checked;
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
        return Math.max(6, parseInt(document.getElementById('fontSize').value) || 20);
    }

    /* ================================================================
       距離計算
    ================================================================ */
    // c%2 が負になる問題を回避するヘルパー
    function colOdd(c) {
        return ((c % 2) + 2) % 2;
    }

    function calcDist(c, r, method) {
        if (method === 'manhattan') {
            // 立方座標での hex 距離 (odd-q offset)
            const cx = c;
            const cz = r - (c - (c & 1)) / 2;
            const cy = -cx - cz;
            return Math.max(Math.abs(cx), Math.abs(cy), Math.abs(cz));
        } else {
            // 直線距離（ピクセルベース近似）
            const odd = colOdd(c);
            return Math.round(Math.sqrt((c * c * 3) / 4 + ((r * 2 + odd) * (r * 2 + odd)) / 4) + 0.14);
        }
    }

    /* ================================================================
       ヘクス頂点計算 (flat-top)
    ================================================================ */
    function hexVertices(hx, hy, cellSizeX, cellSizeY, ori) {
        const v = [
            { x: hx, y: hy },
            { x: hx - cellSizeX / 3, y: hy + cellSizeY / 2 },
            { x: hx, y: hy + cellSizeY },
            { x: hx + (cellSizeX * 2) / 3, y: hy + cellSizeY },
            { x: hx + cellSizeX, y: hy + cellSizeY / 2 },
            { x: hx + (cellSizeX * 2) / 3, y: hy },
        ];
        if (ori)
            v.forEach((p) => {
                [p.x, p.y] = [p.y, p.x];
            });
        return v;
    }

    /* ================================================================
       メイン描画
    ================================================================ */
    function render() {
        const range = getRange();
        const ori = isOri();
        const method = isMethod();
        const fitGrid = isFitGrid();
        const cellOpMul = getCellOpacity();
        const textOpMul = getTextOpacity();
        const strokeOn = document.getElementById('strokeEnabled').checked;
        const globalFS = getGlobalFontSize();

        const cs = getCellSize();
        const cellSizeY = cs;
        const cellSizeX = fitGrid ? cs : (cs / 2) * Math.sqrt(3);

        let distX = range;
        let distY = range;
        if (method === 'euclidean') distX = Math.round((range * 2) / Math.sqrt(3));

        const canvasW = fitGrid ? (distX * 2 + 2) * cellSizeX : (distX * 2 + 1 + 1 / 3) * cellSizeX;
        const canvasH = (distY * 2 + 1) * cellSizeY;

        const canvas = document.getElementById('rulerCanvas');
        canvas.width = ori ? canvasH : canvasW;
        canvas.height = ori ? canvasW : canvasH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let r = -distY; r <= distY; r++) {
            for (let c = -distX; c <= distX; c++) {
                const d = calcDist(c, r, method);
                if (d > range) continue;

                const key = `${c},${r}`;
                const custom = customCells.get(key);
                const odd = colOdd(c);

                // ヘクス基準点
                let hx = fitGrid ? (c + distX + 1 / 6 + 0.5) * cellSizeX : (c + distX + 1 / 3) * cellSizeX;
                let hy = (r + distY + odd / 2) * cellSizeY;

                const verts = hexVertices(hx, hy, cellSizeX, cellSizeY, ori);

                // 塗りつぶし
                const cellCol = custom?.color ?? distColors[d] ?? { r: 128, g: 128, b: 128, a: 0 };
                const effA = (typeof cellCol.a === 'number' ? cellCol.a : 1) * cellOpMul;
                if (effA > 0) {
                    ctx.beginPath();
                    ctx.moveTo(verts[0].x, verts[0].y);
                    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
                    ctx.closePath();
                    ctx.fillStyle = toRgba(cellCol, cellOpMul);
                    ctx.fill();
                }

                // 境界線
                const isEditing = editingCell && editingCell.c === c && editingCell.r === r;
                ctx.beginPath();
                ctx.moveTo(verts[0].x, verts[0].y);
                for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
                ctx.closePath();
                ctx.strokeStyle = isEditing ? 'rgba(0,229,255,0.9)' : 'rgba(0,0,0,0.22)';
                ctx.lineWidth = isEditing ? 3 : 1;
                ctx.stroke();

                // テキスト中心
                let tx = hx + cellSizeX / 3;
                let ty = hy + cellSizeY / 2;
                if (ori) [tx, ty] = [ty, tx];

                // テキスト
                const text = custom?.text !== undefined && custom.text !== '' ? custom.text : String(d);
                const fontSize = custom?.fontSize ?? globalFS;
                const tCol = custom?.textColor ?? textCol;

                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                if (strokeOn) {
                    ctx.save();
                    ctx.strokeStyle = toRgba(strokeCol, textOpMul);
                    ctx.lineWidth = Math.max(2, fontSize * 0.18);
                    ctx.lineJoin = 'round';
                    ctx.strokeText(text, tx, ty);
                    ctx.restore();
                }
                ctx.fillStyle = toRgba(tCol, textOpMul);
                ctx.fillText(text, tx, ty);
            }
        }
    }

    /* ================================================================
       カスタムセル編集
    ================================================================ */
    function applyCellEdit() {
        if (!editingCell) return;
        const key = `${editingCell.c},${editingCell.r}`;
        customCells.set(key, {
            text: document.getElementById('cp-text').value,
            color: { r: popupCellCol.r, g: popupCellCol.g, b: popupCellCol.b, a: popupCellCol.a ?? 1 },
            textColor: { r: popupTextCol.r, g: popupTextCol.g, b: popupTextCol.b, a: popupTextCol.a ?? 1 },
            fontSize: Math.max(6, parseInt(document.getElementById('cp-fontSize').value) || getGlobalFontSize()),
        });
        updateCustomCount();
        render();
    }

    function showCellPopup(c, r, screenX, screenY, defaultDist) {
        editingCell = { c, r };
        const custom = customCells.get(`${c},${r}`);

        document.getElementById('cp-text').value = custom?.text ?? String(defaultDist);
        document.getElementById('cpCoord').textContent = `ヘクス (${c}, ${r})  / デフォルト距離: ${defaultDist}`;
        document.getElementById('cp-fontSize').value = custom?.fontSize ?? getGlobalFontSize();

        const defaultCellCol = distColors[defaultDist] ?? { r: 128, g: 128, b: 128, a: 1 };
        popupCellCol = custom?.color ? { ...custom.color } : { ...defaultCellCol };
        popupTextCol = custom?.textColor ? { ...custom.textColor } : { ...textCol };

        suppressPopupChange = true;
        popupCellPickr?.setColor(colToPickrStr(popupCellCol));
        popupTextPickr?.setColor(colToPickrStr(popupTextCol));
        suppressPopupChange = false;

        const popup = document.getElementById('cell-popup');
        popup.style.display = 'block';
        const pw = popup.offsetWidth || 230;
        const ph = popup.offsetHeight || 260;
        let left = screenX + 14;
        let top = screenY + 14;
        if (left + pw > window.innerWidth - 8) left = screenX - pw - 14;
        if (top + ph > window.innerHeight - 8) top = screenY - ph - 14;
        popup.style.left = Math.max(8, left) + 'px';
        popup.style.top = Math.max(8, top) + 'px';
        render();
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
       キャンバスクリック → 最近傍ヘクス
    ================================================================ */
    document.getElementById('cvWrap').addEventListener('click', function (e) {
        const canvas = document.getElementById('rulerCanvas');
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clickX = (e.clientX - rect.left) * scaleX;
        let clickY = (e.clientY - rect.top) * scaleY;

        const ori = isOri();
        const fitGrid = isFitGrid();
        const method = isMethod();
        const range = getRange();
        const cs = getCellSize();
        const cellSizeY = cs;
        const cellSizeX = fitGrid ? cs : (cs / 2) * Math.sqrt(3);
        let distX = range;
        if (method === 'euclidean') distX = Math.round((range * 2) / Math.sqrt(3));
        const distY = range;

        if (ori) [clickX, clickY] = [clickY, clickX];

        let best = null,
            bestDist2 = Infinity;
        for (let r = -distY; r <= distY; r++) {
            for (let c = -distX; c <= distX; c++) {
                const d = calcDist(c, r, method);
                if (d > range) continue;
                const odd = colOdd(c);
                const hx = fitGrid ? (c + distX + 1 / 6 + 0.5) * cellSizeX : (c + distX + 1 / 3) * cellSizeX;
                const hy = (r + distY + odd / 2) * cellSizeY;
                const cx = hx + cellSizeX / 3;
                const cy = hy + cellSizeY / 2;
                const dist2 = (clickX - cx) ** 2 + (clickY - cy) ** 2;
                if (dist2 < bestDist2) {
                    bestDist2 = dist2;
                    best = { c, r, d };
                }
            }
        }
        if (!best || bestDist2 > (cs * 0.65) ** 2) {
            closeCellPopup();
            return;
        }
        showCellPopup(best.c, best.r, e.clientX, e.clientY, best.d);
    });

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
            label.textContent = d === 0 ? '中心' : `距離 ${d}`;
            const pickrEl = document.createElement('div');
            row.appendChild(label);
            row.appendChild(pickrEl);
            wrap.appendChild(row);

            (function (idx, el, initCol) {
                const p = Pickr.create({
                    el: el,
                    theme: 'nano',
                    default: colToPickrStr(initCol),
                    components: { preview: true, opacity: true, hue: true, interaction: { input: true, save: true } },
                    i18n: { 'btn:save': '確定' },
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
       グローバル Pickr 初期化
    ================================================================ */
    function initGlobalPickrs() {
        textPickr = Pickr.create({
            el: document.getElementById('textColorPicker'),
            theme: 'nano',
            default: colToPickrStr(textCol),
            components: { preview: true, opacity: true, hue: true, interaction: { input: true, save: true } },
            i18n: { 'btn:save': '確定' },
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
            i18n: { 'btn:save': '確定' },
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
            i18n: { 'btn:save': '確定' },
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
            i18n: { 'btn:save': '確定' },
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
    document.querySelectorAll('input[name="ori"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            render();
        });
    });
    document.getElementById('cellSize').addEventListener('input', render);
    document.getElementById('range').addEventListener('input', () => {
        buildColorPickers();
        render();
    });
    document.querySelectorAll('input[name="method"]').forEach((r) => r.addEventListener('change', render));
    document.getElementById('fitGrid').addEventListener('change', render);
    document.getElementById('colorScheme').addEventListener('change', () => {
        buildColorPickers();
        applyScheme();
        render();
    });
    document.getElementById('fontSize').addEventListener('input', render);

    // 縁取りトグル
    const strokeToggle = document.getElementById('strokeEnabled');
    const strokeRow = document.getElementById('strokeColorRow');
    strokeToggle.addEventListener('change', () => {
        const on = strokeToggle.checked;
        strokeRow.style.opacity = on ? '1' : '0.3';
        strokeRow.style.pointerEvents = on ? '' : 'none';
        render();
    });

    // ポップアップ
    document.getElementById('cp-text').addEventListener('input', applyCellEdit);
    document.getElementById('cp-fontSize').addEventListener('input', applyCellEdit);
    document.getElementById('cpClose').addEventListener('click', closeCellPopup);
    document.getElementById('cpReset').addEventListener('click', () => {
        if (!editingCell) return;
        customCells.delete(`${editingCell.c},${editingCell.r}`);
        updateCustomCount();
        closeCellPopup();
    });

    // カスタム全解除
    document.getElementById('clearCustomBtn').addEventListener('click', () => {
        customCells.clear();
        updateCustomCount();
        closeCellPopup();
    });

    // ダウンロード
    document.getElementById('downloadBtn').addEventListener('click', () => {
        const canvas = document.getElementById('rulerCanvas');
        const fitGrid = isFitGrid();
        const link = document.createElement('a');
        if (fitGrid) {
            const cs = getCellSize();
            const cw = Math.round((canvas.width / cs) * 2);
            const ch = Math.round((canvas.height / cs) * 2);
            link.download = `hex_ruler_${cw}x${ch}.png`;
        } else {
            link.download = 'hex_ruler.png';
        }
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    /* ================================================================
       初期化
    ================================================================ */
    document.addEventListener('DOMContentLoaded', () => {
        if (window.IKLab?.initNumSpinners) IKLab.initNumSpinners();

        initGlobalPickrs();
        initPopupPickrs();
        buildColorPickers();

        syncPair('cellOpacity', 'cellOpacityNum');
        syncPair('textOpacity', 'textOpacityNum');

        render();
    });
})();

