let currentMode = 'box';

const styles = {
    light: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', ml: '├', mr: '┤', mh: '─', mt: '┬', mb: '┴', c: '┼' },
    double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', ml: '╠', mr: '╣', mh: '═', mt: '╦', mb: '╩', c: '╬' }
};

/* 合輯修正（字寬判斷）：
 * 上游的範圍已涵蓋一般中文——中日韓統一表意文字（含擴充 A）、注音符號、
 * 「，。、「」『』《》（）！？：；～」這些全形標點都算全形。漏掉的是：
 *   - 擴充 B 區以後的漢字（U+20000～），例如台語用字「𪜶」「𠢕」。它們在
 *     UTF-16 裡是兩個碼元，上游逐碼元計算，會被當成兩個半形字，換行時還可能
 *     從中間切開變成亂碼；
 *   - 直排標點、相容標點與小型標點（U+FE10～FE1F、U+FE30～FE6F，例如「︰」「﹏」「﹐」），
 *     以及全形符號 U+FFE0～FFE6（例如「￥」「￣」）。
 * 所以這裡改用 codePointAt 取整個字，並補上這幾段；各迴圈也改成逐「字」走訪
 * （for...of），不再逐碼元。只含基本多文種平面字元的文字，結果與上游完全相同。 */
function isFullWidth(char) {
    const code = char.codePointAt(0);
    return (
        (code >= 0x1100 && code <= 0x115F) || 
        (code >= 0x3130 && code <= 0x318F) || 
        (code >= 0xAC00 && code <= 0xD7A3) || 
        (code >= 0x2E80 && code <= 0x9FFF) || 
        (code >= 0x3040 && code <= 0x30FF) || 
        (code >= 0xF900 && code <= 0xFAFF) || 
        (code >= 0xFE10 && code <= 0xFE1F) || 
        (code >= 0xFE30 && code <= 0xFE6F) || 
        (code >= 0xFF00 && code <= 0xFF60) || 
        (code >= 0xFFE0 && code <= 0xFFE6) || 
        (code >= 0x20000 && code <= 0x3FFFD) || 
        char === '　' 
    );
}

function getCharVU(char, preset) {
    /* 合輯修正的配套：不是全形的補充平面字元（大多是表情符號），上游逐碼元算成
     * 兩個半形字的寬度；這裡照樣算兩份，維持上游的結果。 */
    if (char.length > 1 && !isFullWidth(char)) return 2 * getCharVU(char[0], preset);

    if (preset === 'cocoforia') {
        if (char === '　') return 155;
        if (char === ' ' || char === '\xa0') return 44; 
        
        const code = char.codePointAt(0);
        if ((code >= 0x1100 && code <= 0x115F) || (code >= 0x3130 && code <= 0x318F)) return 145;
        if (isFullWidth(char)) return 155;
        
        return 93;
    }
    if (preset === 'standard') return isFullWidth(char) ? 2 : 1;
    
    const korW = parseFloat(document.getElementById('kor-weight').value) || 2.0;
    return isFullWidth(char) ? korW : 1;
}

function getBorderVU(preset) {
    if (preset === 'cocoforia') return 119;
    if (preset === 'standard') return 1;
    return parseFloat(document.getElementById('border-weight').value) || 1.0;
}

function getSpaceVU(preset) {
    if (preset === 'cocoforia') return 44; 
    if (preset === 'standard') return 1;
    return 1;
}

function getFullSpaceVU(preset) {
    if (preset === 'cocoforia') return 155;
    if (preset === 'standard') return 2;
    return parseFloat(document.getElementById('kor-weight').value) || 2.0;
}

function toggleManual() {
    const preset = document.getElementById('preset-selector').value;
    const manualDiv = document.getElementById('manual-settings');
    if (preset === 'manual') {
        manualDiv.classList.remove('hidden');
    } else {
        manualDiv.classList.add('hidden');
    }
}

function switchTab(mode) {
    currentMode = mode;
    document.getElementById('tab-box').className = mode === 'box' ? 'flex-1 pb-3 text-center tab-active transition-colors' : 'flex-1 pb-3 text-center tab-inactive transition-colors';
    document.getElementById('tab-table').className = mode === 'table' ? 'flex-1 pb-3 text-center tab-active transition-colors' : 'flex-1 pb-3 text-center tab-inactive transition-colors';
    
    document.getElementById('mode-box').classList.toggle('hidden', mode !== 'box');
    document.getElementById('mode-table').classList.toggle('hidden', mode !== 'table');
    
    generateOutput();
}

function padString(str, targetVU, preset, padType) {
    let currentVU = 0;
    for (const char of str) {
        currentVU += getCharVU(char, preset);
    }

    let diffVU = targetVU - currentVU;
    if (diffVU <= 0) return str;

    let result = str;
    const fullVU = getFullSpaceVU(preset);
    const halfVU = getSpaceVU(preset);

    if (padType === 'full') {
        const numFull = Math.floor(diffVU / fullVU);
        result += '　'.repeat(numFull);
        diffVU -= numFull * fullVU;
    }

    const numHalf = Math.max(0, Math.round(diffVU / halfVU));
    result += ' '.repeat(numHalf);

    return result;
}

function wrapText(text, maxInnerVU, preset) {
    const lines = text.split('\n');
    const result = [];

    for (let line of lines) {
        if (line.trim() === '') {
            result.push('');
            continue;
        }

        let currentLine = "";
        let currentVU = 0;

        for (const char of line) {
            const charVU = getCharVU(char, preset);

            if (currentVU + charVU > maxInnerVU && currentLine.length > 0) {
                result.push(currentLine);
                currentLine = char;
                currentVU = charVU;
            } else {
                currentLine += char;
                currentVU += charVU;
            }
        }
        if (currentLine.length > 0) {
            result.push(currentLine);
        }
    }
    return result;
}

function generateBox(lineStyle, padType, preset) {
    const maxBorderCount = parseInt(document.getElementById('max-width').value, 10) || 24;
    const title = document.getElementById('box-title').value;
    const content = document.getElementById('box-content').value;
    
    const chars = styles[lineStyle];
    let result = '';

    const maxAllowedTargetVU = maxBorderCount * getBorderVU(preset);
    const maxAllowedInnerVU = maxAllowedTargetVU - (2 * getSpaceVU(preset)); 

    const titleWrapped = title ? wrapText(title, maxAllowedInnerVU, preset) : [];
    const contentWrapped = content ? wrapText(content, maxAllowedInnerVU, preset) : [];

    let actualMaxInnerVU = 0;
    const allLines = [...titleWrapped, ...contentWrapped];
    for (const line of allLines) {
        let lineVU = 0;
        for (const char of line) {
            lineVU += getCharVU(char, preset);
        }
        if (lineVU > actualMaxInnerVU) {
            actualMaxInnerVU = lineVU;
        }
    }

    if (actualMaxInnerVU === 0) {
        actualMaxInnerVU = 10 * getBorderVU(preset) - (2 * getSpaceVU(preset));
    }

    let actualBorderCount = Math.ceil((actualMaxInnerVU + 2 * getSpaceVU(preset)) / getBorderVU(preset));
    if (actualBorderCount > maxBorderCount) actualBorderCount = maxBorderCount;

    const actualTargetVU = actualBorderCount * getBorderVU(preset);
    const isLineOnly = !document.getElementById('wrap-box').checked;

    if (isLineOnly) {
        if (title) {
            result += chars.h.repeat(actualBorderCount) + '\n';
            titleWrapped.forEach(line => {
                result += padString(' ' + line, actualTargetVU, preset, padType) + '\n';
            });
            result += chars.h.repeat(actualBorderCount) + '\n';
        } else {
            result += chars.h.repeat(actualBorderCount) + '\n';
        }

        if (contentWrapped.length === 0) {
            result += padString('', actualTargetVU, preset, padType) + '\n';
        } else {
            contentWrapped.forEach(line => {
                result += padString(' ' + line, actualTargetVU, preset, padType) + '\n';
            });
        }

        result += chars.h.repeat(actualBorderCount);
    } else {
        if (title) {
            result += chars.tl + chars.h.repeat(actualBorderCount) + chars.tr + '\n';
            titleWrapped.forEach(line => {
                const padded = padString(' ' + line, actualTargetVU - getSpaceVU(preset), preset, padType);
                result += chars.v + padded + ' ' + chars.v + '\n';
            });
            result += chars.ml + chars.h.repeat(actualBorderCount) + chars.mr + '\n';
        } else {
            result += chars.tl + chars.h.repeat(actualBorderCount) + chars.tr + '\n';
        }

        if (contentWrapped.length === 0) {
            result += chars.v + padString('', actualTargetVU - 2 * getSpaceVU(preset), preset, padType) + chars.v + '\n';
        } else {
            contentWrapped.forEach(line => {
                const padded = padString(' ' + line, actualTargetVU - getSpaceVU(preset), preset, padType);
                result += chars.v + padded + ' ' + chars.v + '\n';
            });
        }

        result += chars.bl + chars.h.repeat(actualBorderCount) + chars.br;
    }
    
    return result;
}

function generateTable(lineStyle, padType, preset) {
    const rawContent = document.getElementById('table-content').value;
    const useHeader = document.getElementById('table-header').checked;
    const maxTableBorderCount = parseInt(document.getElementById('table-max-width').value, 10) || 30;
    const chars = styles[lineStyle];
    
    if (!rawContent.trim()) {
        const defaultW = Math.max(1, Math.round(10 / getBorderVU(preset)));
        return chars.tl + chars.h.repeat(defaultW) + chars.tr + '\n' + 
                chars.v + padString(' ', defaultW * getBorderVU(preset) - getSpaceVU(preset), preset, padType) + ' ' + chars.v + '\n' + 
                chars.bl + chars.h.repeat(defaultW) + chars.br;
    }

    const rows = rawContent.split('\n')
        .map(row => row.trim())
        .filter(row => row !== '')
        .map(row => {
            if (/^[-=─_]+$/.test(row)) return { isDivider: true };
            return { isDivider: false, cells: row.split(/[|]/).map(cell => cell.trim()) };
        });

    let numCols = 0;
    rows.forEach(r => { if(!r.isDivider) numCols = Math.max(numCols, r.cells.length); });

    rows.forEach(r => {
        if(!r.isDivider) {
            while(r.cells.length < numCols) r.cells.push('');
        }
    });

    const prefColVUs = new Array(numCols).fill(0);
    rows.forEach(row => {
        if (row.isDivider) return;
        row.cells.forEach((cell, i) => {
            let cellVU = 0;
            for(let c of cell) cellVU += getCharVU(c, preset);
            if (cellVU > prefColVUs[i]) prefColVUs[i] = cellVU;
        });
    });

    const minDashes = Math.max(1, Math.ceil((2 * getSpaceVU(preset)) / getBorderVU(preset))); 

    let colDashes = prefColVUs.map(vu => {
        return Math.max(minDashes, Math.ceil((vu + 2 * getSpaceVU(preset)) / getBorderVU(preset)));
    });

    let totalDashes = colDashes.reduce((a, b) => a + b, 0) + (numCols - 1);
    
    if (totalDashes > maxTableBorderCount) {
        while (totalDashes > maxTableBorderCount) {
            let maxDash = -1;
            let maxIdx = -1;
            for(let i=0; i<numCols; i++) {
                if (colDashes[i] > maxDash) {
                    maxDash = colDashes[i];
                    maxIdx = i;
                }
            }
            if (maxDash <= minDashes) break;
            colDashes[maxIdx]--;
            totalDashes--;
        }
    }

    const actualColVUs = colDashes.map(dashes => dashes * getBorderVU(preset));
    const maxInnerVUs = actualColVUs.map(vu => Math.max(1, vu - 2 * getSpaceVU(preset)));
    const isLineOnly = !document.getElementById('wrap-box').checked;
    const tableTotalDashes = colDashes.reduce((a, b) => a + b, 0) + (numCols - 1);

    let result = '';

    if (isLineOnly) {
        result += chars.h.repeat(tableTotalDashes) + '\n';

        rows.forEach((row, rowIndex) => {
            if (row.isDivider) {
                result += chars.h.repeat(tableTotalDashes) + '\n';
                return;
            }

            const wrappedCells = row.cells.map((cell, colIndex) => {
                const wrapped = wrapText(cell, maxInnerVUs[colIndex], preset);
                return wrapped.length > 0 ? wrapped : [''];
            });

            let maxLines = 1;
            wrappedCells.forEach(lines => {
                if (lines.length > maxLines) maxLines = lines.length;
            });

            for (let l = 0; l < maxLines; l++) {
                result += colDashes.map((d, colIndex) => {
                    const lineText = wrappedCells[colIndex][l] || '';
                    return padString(' ' + lineText, actualColVUs[colIndex] - getSpaceVU(preset), preset, padType) + ' ';
                }).join(chars.v) + '\n';
            }

            if (useHeader && rowIndex === 0 && rows.length > 1 && !rows[1].isDivider) {
                result += chars.h.repeat(tableTotalDashes) + '\n';
            }
        });

        result += chars.h.repeat(tableTotalDashes);
    } else {
        result += chars.tl;
        result += colDashes.map(d => chars.h.repeat(d)).join(chars.mt);
        result += chars.tr + '\n';

        rows.forEach((row, rowIndex) => {
            if (row.isDivider) {
                result += chars.ml;
                result += colDashes.map(d => chars.mh.repeat(d)).join(chars.c);
                result += chars.mr + '\n';
                return;
            }

            const wrappedCells = row.cells.map((cell, colIndex) => {
                const wrapped = wrapText(cell, maxInnerVUs[colIndex], preset);
                return wrapped.length > 0 ? wrapped : [''];
            });

            let maxLines = 1;
            wrappedCells.forEach(lines => {
                if (lines.length > maxLines) maxLines = lines.length;
            });

            for (let l = 0; l < maxLines; l++) {
                result += chars.v;
                result += colDashes.map((d, colIndex) => {
                    const lineText = wrappedCells[colIndex][l] || '';
                    return padString(' ' + lineText, actualColVUs[colIndex] - getSpaceVU(preset), preset, padType) + ' ';
                }).join(chars.v);
                result += chars.v + '\n';
            }

            if (useHeader && rowIndex === 0 && rows.length > 1 && !rows[1].isDivider) {
                result += chars.ml;
                result += colDashes.map(d => chars.mh.repeat(d)).join(chars.c);
                result += chars.mr + '\n';
            }
        });

        result += chars.bl;
        result += colDashes.map(d => chars.h.repeat(d)).join(chars.mb);
        result += chars.br;
    }

    return result;
}

function generateOutput() {
    const lineStyle = document.getElementById('line-style').value;
    const padType = document.getElementById('pad-char').value;
    const preset = document.getElementById('preset-selector').value;
    const outputArea = document.getElementById('result-output');
    
    if (currentMode === 'box') {
        outputArea.value = generateBox(lineStyle, padType, preset);
    } else {
        outputArea.value = generateTable(lineStyle, padType, preset);
    }
}

function copyResult() {
    const outputArea = document.getElementById('result-output');
    outputArea.select();
    document.execCommand('copy');
    
    const toast = document.getElementById('copy-toast');
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2000);
}

window.onload = () => {
    generateOutput();
};

/* 合輯：語言切換器。預覽裡只有使用者輸入的文字與框線字元，沒有介面文字；
 * 畫面上的字都掛了 data-i18n，由引擎換掉。這裡仍重算一次預覽，保持一致。 */
I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => {
    generateOutput();
});
