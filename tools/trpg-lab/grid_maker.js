(function () {
    'use strict';

    /* ================================================================
       カラー状態（Pickrが更新、0-255 / 0-1）
    ================================================================ */
    const lineCol = { r: 0, g: 229, b: 255, a: 1.0 };
    const coordCol = { r: 0, g: 229, b: 255, a: 1.0 };

    /* ================================================================
       ユーティリティ
    ================================================================ */
    function toRgba(col, overrideA) {
        const a = overrideA !== undefined ? overrideA : col.a;
        return `rgba(${Math.round(col.r)},${Math.round(col.g)},${Math.round(col.b)},${a.toFixed(4)})`;
    }

    function applyDash(ctx, ls, lw) {
        if (ls === 'dashed') ctx.setLineDash([lw * 4, lw * 3]);
        else if (ls === 'dotted') ctx.setLineDash([lw, lw * 2.5]);
        else ctx.setLineDash([]);
    }

    /* ================================================================
       設定取得
    ================================================================ */
    function getS() {
        const scale = Math.min(100, Math.max(10, parseInt(document.getElementById('gridScale').value) || 100)) / 100;
        return {
            cols: Math.max(1, parseInt(document.getElementById('cols').value) || 10),
            rows: Math.max(1, parseInt(document.getElementById('rows').value) || 10),
            cellSize: Math.max(10, parseInt(document.getElementById('cellSize').value) || 80),
            lw: Math.max(1, parseInt(document.getElementById('lineWidth').value) || 2),
            ls: document.querySelector('input[name="ls"]:checked').value,
            glow: document.getElementById('glowEffect').checked,
            scale,
            cornerRadius: Math.max(0, parseInt(document.getElementById('cornerRadius').value) || 0),
            showCoords: document.getElementById('showCoords').checked,
            coordFmt: document.getElementById('coordFmt').value,
            coordOrigin: document.getElementById('coordOrigin').value,
            coordStart: parseInt(document.querySelector('input[name="cstart"]:checked').value),
            coordPos: document.querySelector('input[name="cpos"]:checked').value,
            coordOffset: parseInt(document.getElementById('coordOffset').value) || 0,
            coordFontSize: Math.max(6, parseInt(document.getElementById('coordFontSize').value) || 14),
        };
    }

    /* ================================================================
       座標計算
    ================================================================ */
    function calcCoord(c, r, s) {
        const flipC = s.coordOrigin === 'tr' || s.coordOrigin === 'br';
        const flipR = s.coordOrigin === 'bl' || s.coordOrigin === 'br';
        return {
            dc: flipC ? s.cols - 1 - c : c,
            dr: flipR ? s.rows - 1 - r : r,
        };
    }

    function toLetters(n) {
        let s = '';
        n += 1;
        while (n > 0) {
            const rem = (n - 1) % 26;
            s = String.fromCharCode(65 + rem) + s;
            n = Math.floor((n - 1) / 26);
        }
        return s;
    }

    function formatCoord(dc, dr, s) {
        const c = dc + s.coordStart;
        const r = dr + s.coordStart;
        switch (s.coordFmt) {
            case 'comma':
                return `${c},${r}`;
            case 'zero': {
                const pad = (n) => String(Math.max(0, n)).padStart(2, '0');
                return `${pad(c)}${pad(r)}`;
            }
            case 'letter':
                return `${toLetters(dc)}${r}`;
            case 'serial':
                return `${dr * s.cols + dc + s.coordStart}`;
            default:
                return `${c}-${r}`;
        }
    }

    /* ================================================================
       メイン描画
    ================================================================ */
    function generateGrid() {
        const s = getS();
        const canvas = document.getElementById('gridCanvas');
        const ctx = canvas.getContext('2d');

        canvas.width = s.cols * s.cellSize;
        canvas.height = s.rows * s.cellSize;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        /* 線設定 */
        ctx.strokeStyle = toRgba(lineCol);
        ctx.lineWidth = s.lw;
        applyDash(ctx, s.ls, s.lw);

        if (s.glow) {
            ctx.shadowColor = toRgba(lineCol, 1);
            ctx.shadowBlur = s.lw * 7;
        } else {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        /* 描画モード切り替え
           scale=100% かつ cornerRadius=0 → ライン描画（高速・辺の重複なし）
           それ以外 → セル個別描画（roundRect） */
        const useLines = s.scale >= 0.999 && s.cornerRadius === 0;

        if (useLines) {
            /* ---- ライン描画モード ---- */
            for (let x = 0; x <= s.cols; x++) {
                ctx.beginPath();
                ctx.moveTo(x * s.cellSize, 0);
                ctx.lineTo(x * s.cellSize, canvas.height);
                ctx.stroke();
            }
            for (let y = 0; y <= s.rows; y++) {
                ctx.beginPath();
                ctx.moveTo(0, y * s.cellSize);
                ctx.lineTo(canvas.width, y * s.cellSize);
                ctx.stroke();
            }
        } else {
            /* ---- セル個別描画モード ---- */
            const margin = (s.cellSize * (1 - s.scale)) / 2;
            const w = s.cellSize * s.scale;
            const h = s.cellSize * s.scale;
            const rad = Math.min(s.cornerRadius, w / 2, h / 2);

            for (let c = 0; c < s.cols; c++) {
                for (let r = 0; r < s.rows; r++) {
                    const x = c * s.cellSize + margin;
                    const y = r * s.cellSize + margin;
                    ctx.beginPath();
                    ctx.roundRect(x, y, w, h, rad);
                    ctx.stroke();
                }
            }
        }

        /* ---- 座標ラベル ---- */
        if (s.showCoords) {
            /* グロー・破線をリセットしてから描画 */
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.setLineDash([]);
            ctx.fillStyle = toRgba(coordCol);
            ctx.font = `${s.coordFontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            /* 縮小後のセル高さの半分（位置計算用） */
            const halfDrawnH = (s.cellSize * s.scale) / 2;

            for (let c = 0; c < s.cols; c++) {
                for (let r = 0; r < s.rows; r++) {
                    const { dc, dr } = calcCoord(c, r, s);
                    const cx = c * s.cellSize + s.cellSize / 2;
                    const cyCenter = r * s.cellSize + s.cellSize / 2;

                    let cy;
                    if (s.coordPos === 'top') {
                        cy = cyCenter - halfDrawnH + s.coordOffset;
                    } else if (s.coordPos === 'bottom') {
                        cy = cyCenter + halfDrawnH - s.coordOffset;
                    } else {
                        cy = cyCenter;
                    }

                    ctx.fillText(formatCoord(dc, dr, s), cx, cy);
                }
            }
        }
    }

    /* ================================================================
       ダウンロード
    ================================================================ */
    window.downloadGrid = function () {
        const s = getS();
        const canvas = document.getElementById('gridCanvas');
        const link = document.createElement('a');
        link.download = `grid_${s.cols}x${s.rows}_${s.cellSize}px.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    /* ================================================================
       スライダー ↔ number 双方向同期
    ================================================================ */
    function syncPair(slId, nmId) {
        const sl = document.getElementById(slId);
        const nm = document.getElementById(nmId);
        sl.addEventListener('input', () => {
            nm.value = sl.value;
            generateGrid();
        });
        nm.addEventListener('input', () => {
            const v = Math.min(parseFloat(nm.max), Math.max(parseFloat(nm.min), parseFloat(nm.value) || 0));
            sl.value = v;
            generateGrid();
        });
    }

    /* ================================================================
       Pickr 初期化
    ================================================================ */
    function rgbaToHex(r, g, b, a) {
        const toHex = (v) => Math.round(v).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(Math.round(a * 255))}`;
    }

    function initPickr(elId, colObj) {
        Pickr.create({
            el: `#${elId}`,
            theme: 'nano',
            default: rgbaToHex(colObj.r, colObj.g, colObj.b, colObj.a),
            components: {
                preview: true,
                opacity: true,
                hue: true,
                interaction: { input: true, save: true },
            },
            i18n: { 'btn:save': '確定' },
        })
            .on('change', (color) => {
                const [r, g, b, a] = color.toRGBA();
                colObj.r = r;
                colObj.g = g;
                colObj.b = b;
                colObj.a = a;
                generateGrid();
            })
            .on('save', (_, p) => p.hide());
    }

    /* ================================================================
       DOMContentLoaded
    ================================================================ */
    document.addEventListener('DOMContentLoaded', () => {
        /* Pickr 初期化 */
        initPickr('lineColorPicker', lineCol);
        initPickr('coordColorPicker', coordCol);

        /* 通常 input（number / checkbox） */
        ['cols', 'rows', 'cellSize', 'lineWidth', 'cornerRadius', 'coordFontSize', 'coordOffset', 'showCoords', 'glowEffect'].forEach((id) =>
            document.getElementById(id).addEventListener('input', generateGrid)
        );

        /* select */
        ['coordFmt', 'coordOrigin'].forEach((id) => document.getElementById(id).addEventListener('change', generateGrid));

        /* ラジオ（ls / cstart） */
        ['ls', 'cstart'].forEach((n) => document.querySelectorAll(`input[name="${n}"]`).forEach((el) => el.addEventListener('change', generateGrid)));

        /* スライダー同期 */
        syncPair('gridScale', 'gridScaleNum');

        /* 座標オプション 表示制御（座標ON/OFFに連動） */
        const showCEl = document.getElementById('showCoords');
        const coordOptEls = [document.getElementById('coordOpts'), document.getElementById('coordColorRow')];
        function updateCoordVis() {
            const on = showCEl.checked;
            coordOptEls.forEach((el) => {
                el.style.opacity = on ? '1' : '0.3';
                el.style.pointerEvents = on ? '' : 'none';
                el.style.transition = 'opacity 0.25s';
            });
        }
        showCEl.addEventListener('change', updateCoordVis);
        updateCoordVis();

        /* オフセット行: 上/下のときのみ有効 */
        const offsetRow = document.getElementById('coordOffsetRow');
        function updateOffsetVis() {
            const pos = document.querySelector('input[name="cpos"]:checked').value;
            const show = pos === 'top' || pos === 'bottom';
            offsetRow.style.opacity = show ? '1' : '0.3';
            offsetRow.style.pointerEvents = show ? '' : 'none';
            offsetRow.style.transition = 'opacity 0.25s';
        }
        document.querySelectorAll('input[name="cpos"]').forEach((el) =>
            el.addEventListener('change', () => {
                updateOffsetVis();
                generateGrid();
            })
        );
        updateOffsetVis();

        generateGrid();
    });
})();

