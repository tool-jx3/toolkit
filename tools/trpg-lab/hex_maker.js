(function () {
    'use strict';

    /* ================================================================
   カラー状態（Pickrが更新、0-255 / 0-1）
================================================================ */
    const hexCol = { r: 0, g: 229, b: 255, a: 1.0 };
    const coordCol = { r: 0, g: 229, b: 255, a: 1.0 };

    /* ================================================================
   ユーティリティ
================================================================ */
    function toRgba(col, overrideA) {
        const a = overrideA !== undefined ? overrideA : col.a;
        return `rgba(${Math.round(col.r)},${Math.round(col.g)},${Math.round(col.b)},${a.toFixed(4)})`;
    }

    /* ================================================================
   設定取得
================================================================ */
    function getS() {
        const sc = Math.min(100, Math.max(10, parseInt(document.getElementById('hexScale').value) || 100)) / 100;
        return {
            ori: document.querySelector('input[name="ori"]:checked').value,
            lw: Math.max(1, parseInt(document.getElementById('lineWidth').value) || 2),
            ls: document.querySelector('input[name="ls"]:checked').value,
            glow: document.getElementById('glowEffect').checked,
            size: Math.max(10, parseInt(document.getElementById('cellSize').value) || 90),
            cols: Math.max(1, parseInt(document.getElementById('cols').value) || 15),
            rows: Math.max(1, parseInt(document.getElementById('rows').value) || 15),
            fit: document.getElementById('fitGridCheck').checked,
            shift: document.getElementById('shiftCheck').checked,
            outer: document.getElementById('drawOuter').checked,
            sc,
            showC: document.getElementById('showCoords').checked,
            cMode: document.querySelector('input[name="cmode"]:checked').value,
            cOri: document.getElementById('coordOrigin').value,
            cSt: parseInt(document.querySelector('input[name="cstart"]:checked').value),
            cPos: document.querySelector('input[name="cpos"]:checked').value,
            cOffset: parseInt(document.getElementById('coordOffset').value) || 0,
            cFnt: Math.max(6, parseInt(document.getElementById('coordFontSize').value) || 20),
            cFmt: document.getElementById('coordFmt').value,
        };
    }

    /* ================================================================
   線種適用
================================================================ */
    function applyDash(ctx, ls, lw) {
        if (ls === 'dashed') ctx.setLineDash([lw * 4, lw * 3]);
        else if (ls === 'dotted') ctx.setLineDash([lw, lw * 2.5]);
        else ctx.setLineDash([]);
    }

    /* ================================================================
   ヘクス頂点計算
   center = (gx + csx/3, gy + size/2)
   dx = csx/3, dy = size/2
   v0(-dx,-dy)  v1(-2dx,0)  v2(-dx,+dy)
   v3(+dx,+dy)  v4(+2dx,0)  v5(+dx,-dy)
================================================================ */
    function hexVerts(gx, gy, csx, size, scale, ori) {
        const mcx = gx + csx / 3,
            mcy = gy + size / 2;
        const dx = csx / 3,
            dy = size / 2;
        const off = [
            [-dx, -dy],
            [-2 * dx, 0],
            [-dx, dy],
            [dx, dy],
            [2 * dx, 0],
            [dx, -dy],
        ];
        const v = off.map(([ox, oy]) => ({ x: mcx + ox * scale, y: mcy + oy * scale }));
        return ori ? v.map((p) => ({ x: p.y, y: p.x })) : v;
    }

    /* ================================================================
   ヘクス存在チェック
   スキップ条件: s.shift === ((r+2)%2 === (c+2)%2)
   存在: スキップしない
================================================================ */
    function hexExists(c, r, cFrom, cTo, rFrom, rTo, shift) {
        if (c < cFrom || c >= cTo || r < rFrom || r >= rTo) return false;
        return shift !== ((r + 2) % 2 === (c + 2) % 2);
    }

    /* ================================================================
   座標番号計算
================================================================ */
    function calcCoord(c, r, s, cols, rows) {
        const flipC = s.cOri === 'tr' || s.cOri === 'br';
        const flipR = s.cOri === 'bl' || s.cOri === 'br';

        if (s.cMode === 'seq') {
            /* 連番: floor(r/2) で行を整数化 */
            const sr = Math.floor(r / 2);
            const dc = flipC ? cols - 1 - c : c;
            const dr = flipR ? Math.ceil(rows / 2) - 1 - sr : sr;
            return { dc, dr };
        } else {
            /* 飛び飛び: 内部インデックスそのまま + 起点反転 */
            const dc = flipC ? cols - 1 - c : c;
            /* 行反転: 同パリティを保ちながら最大値から折り返す */
            const colParity = (c + 2) % 2 === 0 ? 0 : 1;
            /* その列に存在する行の最大値 */
            const candidateMax = rows % 2 === 0 ? rows - 2 + colParity : rows - 1;
            /* 厳密に最大r（その列のパリティが合う最大値）*/
            const maxR = candidateMax % 2 === colParity ? candidateMax : candidateMax - 1;
            const dr = flipR ? maxR - r + 2 * colParity : r;
            return { dc, dr };
        }
    }

    /* ================================================================
   線分を1本描く（dashをリセットしない）
================================================================ */
    function drawSeg(ctx, a, b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }

    /* ================================================================
   座標フォーマット
================================================================ */
    function toLetters(n) {
        /* 0-indexed → A, B, ... Z, AA, AB, ... */
        let s = '';
        n += 1; // 1-based
        while (n > 0) {
            const rem = (n - 1) % 26;
            s = String.fromCharCode(65 + rem) + s;
            n = Math.floor((n - 1) / 26);
        }
        return s;
    }

    function formatCoord(dc, dr, s) {
        const c = dc + s.cSt;
        const r = dr + s.cSt;
        switch (s.cFmt) {
            case 'comma':
                return `${c},${r}`;
            case 'zero': {
                const pad = (n) => String(Math.max(0, n)).padStart(2, '0');
                return `${pad(c)}${pad(r)}`;
            }
            case 'letter':
                return `${toLetters(dc)}${r}`;
            case 'serial': {
                const totalRows = s.rows;
                const totalCols = s.cols;
                const n = dc * Math.ceil(totalRows / 2) - (totalRows % 2) * (Math.floor(dc / 2) + Number(s.cOri === 'bl' || s.cOri === 'br') * (dc % 2)) + dr + s.cSt;
                return `${n}`;
            }
            default:
                return `${c}-${r}`;
        }
    }

    /* ================================================================
   メイン描画
================================================================ */
    function generateHex() {
        const s = getS();
        const canvas = document.getElementById('hexCanvas');
        const ctx = canvas.getContext('2d');
        const ori = s.ori === 'vertical';

        const csx = s.fit ? s.size : (s.size / 2) * Math.sqrt(3);
        const offL = s.fit ? 1 / 6 : 1 / 3;

        let cols = s.cols,
            rows = s.rows;
        if (ori) [cols, rows] = [rows, cols];

        /* グリッド余白: fit モード時、ヘクスの端切れを防ぐため列方向に半マスずつ追加 */
        const gridPad = s.fit ? csx / 2 : 0;

        /* キャンバスサイズ */
        let cw = s.fit ? csx * cols + csx : csx * (cols + 1 / 3);
        let ch = (s.size * (rows + 1)) / 2;
        if (ori) [cw, ch] = [ch, cw];

        canvas.width = Math.round(cw);
        canvas.height = Math.round(ch);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        /* 線設定 */
        ctx.strokeStyle = toRgba(hexCol);
        ctx.lineWidth = s.lw;
        applyDash(ctx, s.ls, s.lw);

        if (s.glow) {
            ctx.shadowColor = toRgba(hexCol, 1);
            ctx.shadowBlur = s.lw * 7;
        } else {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        /* ループ範囲 */
        const cFrom = s.outer ? -1 : 0;
        const cTo = s.outer ? cols + 1 : cols;
        const rFrom = s.outer ? -1 : 0;
        const rTo = s.outer ? rows + 1 : rows;

        /* 縮小100%かどうかで半辺/全辺を切り替え */
        const halfEdge = s.sc >= 0.999;

        for (let c = cFrom; c < cTo; c++) {
            for (let r = rFrom; r < rTo; r++) {
                if (s.shift === ((r + 2) % 2 === (c + 2) % 2)) continue;

                const gx = (c + offL) * csx + gridPad;
                const gy = (r / 2) * s.size;
                const v = hexVerts(gx, gy, csx, s.size, s.sc, ori);

                if (!halfEdge) {
                    /* 縮小あり: 全6辺を描く */
                    ctx.beginPath();
                    ctx.moveTo(v[0].x, v[0].y);
                    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
                    ctx.closePath();
                    ctx.stroke();
                } else {
                    /* 縮小なし (scale≈100%): 3辺のみ描く
                   v5→v0 (上), v0→v1 (左上), v1→v2 (左下)
                */
                    ctx.beginPath();
                    ctx.moveTo(v[5].x, v[5].y);
                    ctx.lineTo(v[0].x, v[0].y);
                    ctx.lineTo(v[1].x, v[1].y);
                    ctx.lineTo(v[2].x, v[2].y);
                    ctx.stroke();

                    /* --- 境界補完 ---
                   欠けている3辺(v2→v3, v3→v4, v4→v5)を担当する隣接ヘクスが
                   ループ範囲外なら自分で描く
                   ・v2→v3 (下辺)     ← 担当: (c, r+2)
                   ・v3→v4 (右下辺)   ← 担当: (c+1, r+1)
                   ・v4→v5 (右上辺)   ← 担当: (c+1, r-1)
                */
                    if (!hexExists(c, r + 2, cFrom, cTo, rFrom, rTo, s.shift)) drawSeg(ctx, v[2], v[3]);
                    if (!hexExists(c + 1, r + 1, cFrom, cTo, rFrom, rTo, s.shift)) drawSeg(ctx, v[3], v[4]);
                    if (!hexExists(c + 1, r - 1, cFrom, cTo, rFrom, rTo, s.shift)) drawSeg(ctx, v[4], v[5]);
                }

                /* ---- 座標ラベル ---- */
                if (s.showC && c >= 0 && r >= 0 && c < cols && r < rows) {
                    ctx.shadowBlur = 0;
                    ctx.setLineDash([]);

                    const { dc, dr } = calcCoord(c, r, s, cols, rows);

                    ctx.fillStyle = toRgba(coordCol);
                    ctx.font = `${s.cFnt}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    /* セル中心（グリッドベース） */
                    let px = gx + csx / 3;
                    let py = gy + s.size / 2;
                    if (ori) [px, py] = [py, px];

                    /* 縮小後のヘクス端距離（セル中心からの距離） */
                    const halfY = ori ? (csx / 3) * s.sc : (s.size / 2) * s.sc;

                    if (s.cPos === 'top') {
                        /* 上端から正方向 = 中心方向（内側） */
                        py = py - halfY + s.cOffset;
                    } else if (s.cPos === 'bottom') {
                        /* 下端から正方向 = 中心方向（内側） */
                        py = py + halfY - s.cOffset;
                    }
                    /* middle: py そのまま */

                    ctx.fillText(formatCoord(dc, dr, s), px, py);

                    /* 線設定復元 */
                    applyDash(ctx, s.ls, s.lw);
                    if (s.glow) {
                        ctx.shadowColor = toRgba(hexCol, 1);
                        ctx.shadowBlur = s.lw * 7;
                    }
                }
            }
        }
    }

    /* ================================================================
   ダウンロード
================================================================ */
    window.downloadHex = function () {
        const canvas = document.getElementById('hexCanvas');
        const cs = parseInt(document.getElementById('cellSize').value);
        const fitGrid = document.getElementById('fitGridCheck').checked;
        const ori = document.querySelector('input[name="ori"]:checked').value === 'vertical';
        const link = document.createElement('a');
        if (fitGrid) {
            /* グリッド余白(1マス分=cs px)を差し引いてヘクス数を算出 */
            const w = ori ? canvas.width : canvas.width - cs;
            const h = ori ? canvas.height - cs : canvas.height;
            const c = Math.round((w / cs) * 2);
            const r = Math.round((h / cs) * 2);
            link.download = `hex_${c}x${r}.png`;
        } else {
            link.download = 'hex.png';
        }
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
            generateHex();
        });
        nm.addEventListener('input', () => {
            const v = Math.min(parseFloat(nm.max), Math.max(parseFloat(nm.min), parseFloat(nm.value) || 0));
            sl.value = v;
            generateHex();
        });
    }

    /* ================================================================
   Pickr 初期化
================================================================ */
    function rgbaToHex(r, g, b, a) {
        const toHex = (v) => Math.round(v).toString(16).padStart(2, '0');
        const alphaHex = toHex(Math.round(a * 255));
        return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`;
    }

    /* 收錄版：留住 Pickr 實例，切換語言時改寫「確定」鈕的文字（選好的顏色不受影響）。 */
    const pickrs = [];

    function initPickr(elId, colObj) {
        const pickr = Pickr.create({
            el: `#${elId}`,
            theme: 'nano',
            default: rgbaToHex(colObj.r, colObj.g, colObj.b, colObj.a), // ← HEX8形式 (#rrggbbaa)
            components: {
                preview: true,
                opacity: true,
                hue: true,
                interaction: { input: true, save: true },
            },
            i18n: { 'btn:save': T('pickr.save') },
        })
            .on('change', (color) => {
                const [r, g, b, a] = color.toRGBA();
                colObj.r = r;
                colObj.g = g;
                colObj.b = b;
                colObj.a = a;
                generateHex();
            })
            .on('save', (_, p) => p.hide());
        pickrs.push(pickr);
    }

    I18N.onChange(() => {
        for (const pickr of pickrs) {
            const save = pickr.getRoot()?.interaction?.save;
            if (save) save.value = T('pickr.save');
        }
    });
    /* ================================================================
   DOMContentLoaded
================================================================ */
    document.addEventListener('DOMContentLoaded', () => {
        /* ---- Pickr / その他の初期化 ---- */
        initPickr('hexColorPicker', hexCol);
        initPickr('coordColorPicker', coordCol);

        /* 通常 input */
        ['lineWidth', 'cellSize', 'cols', 'rows', 'fitGridCheck', 'shiftCheck', 'glowEffect', 'drawOuter', 'showCoords', 'coordFontSize', 'coordOffset', 'coordFmt'].forEach((id) =>
            document.getElementById(id).addEventListener('input', generateHex)
        );

        /* ラジオ・select */
        ['ori', 'ls', 'cmode', 'cstart', 'cpos'].forEach((n) => document.querySelectorAll(`input[name="${n}"]`).forEach((el) => el.addEventListener('change', generateHex)));
        document.getElementById('coordOrigin').addEventListener('change', generateHex);

        /* スライダー同期 */
        syncPair('hexScale', 'hexScaleNum');

        /* 座標オプション 全体の表示制御 */
        const showCEl = document.getElementById('showCoords');
        const coordEl = document.getElementById('coordOpts');
        function updateCoordVis() {
            coordEl.style.opacity = showCEl.checked ? '1' : '0.3';
            coordEl.style.pointerEvents = showCEl.checked ? '' : 'none';
            coordEl.style.transition = 'opacity 0.25s';
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
                generateHex();
            })
        );
        updateOffsetVis();

        const cmodeRow = document.getElementById('cmodeRow');
        function updateCmodeVis() {
            const isSerial = document.getElementById('coordFmt').value === 'serial';
            cmodeRow.style.opacity = isSerial ? '0.3' : '1';
            cmodeRow.style.pointerEvents = isSerial ? 'none' : '';
            cmodeRow.style.transition = 'opacity 0.25s';
            if (isSerial) {
                document.getElementById('cm-seq').checked = true;
            }
        }
        document.getElementById('coordFmt').addEventListener('change', () => {
            updateCmodeVis();
            generateHex();
        });
        updateCmodeVis();

        generateHex();
    });
})();

