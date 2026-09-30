/* CCFOLIA 日誌轉換器（Eon-00/eon-ccfolia-log-converter）。上游寫在 index.html 的
 * <script> 區塊，依慣例抽成獨立檔案；介面文字一律經由 T() 取自 i18n.log-converter.js。
 *
 * 收錄時的改動（其餘照上游原樣）：
 * - 拿掉「用 Room ID 載入」。它呼叫 CCFOLIA 的 Firestore API，已被擋下無法使用，上游也
 *   已停用（ROOM_ID_ENABLED = false）並把分頁藏起來。CcfoliaAPI 類別、載入流程，以及只在
 *   那個模式下才會用到的程式（從 CCFOLIA 取頭像、一次套用 CCFOLIA 圖片等）一併移除。
 * - 產出 HTML 裡給讀者看的固定字樣（系統、閒聊訊息、通知、插圖的 alt、預設標題、
 *   <html lang>）依「轉換當下」的介面語言，見 buildOutputLabels()。
 * - 解析規則補上繁中別名：OOC_TAB_NAMES、isAllTabLabel()。
 * - 時間軸的名字欄寬把漢字、假名與全形符號也算成全形（見 getDisplayWidth）。
 */

/* 這個頁面沒有的語言（例如使用者在別的工具選了日文）先退回預設語言，
 * 下面初始化時寫進畫面的文字才會是正確的語言。 */
I18N.resolveLocale();

/* ---------- TRPG Toolkit 合輯：JS 寫進畫面的文字 ---------- */
/* JS 寫進畫面的文字不掛 data-i18n（切換語言時 applyStaticDom 會把它蓋回 HTML 裡的
 * 字串），改把字典 key 記在下列屬性上，由 relabelDynamic() 依目前語言重寫：
 *   data-lc="key"（參數放 data-lc-args，JSON 陣列） → textContent
 *   data-lc-html="key"                              → innerHTML（僅限開發者撰寫的標記）
 *   data-lc-title="key"                             → title
 *   data-lc-ph="key"                                → placeholder */
function lcEsc(text) {
    return String(text).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/* 模板字串用：回傳 data-lc 屬性字串。 */
function lcAttrs(key, ...args) {
    return `data-lc="${lcEsc(key)}"` + (args.length ? ` data-lc-args="${lcEsc(JSON.stringify(args))}"` : '');
}

/* 模板字串用：回傳帶 data-lc 的 <span>。 */
function lcSpan(key, ...args) {
    return `<span ${lcAttrs(key, ...args)}>${lcEsc(T(key, ...args))}</span>`;
}

function lcArgs(el) {
    try {
        return JSON.parse(el.dataset.lcArgs || '[]');
    } catch (e) {
        return [];
    }
}

/* 把元素的文字設成 T(key, ...args) 並記下 key；key 為空值則清空。
 * 用了這個函式的元素，之後的寫入也都要經過它（否則切換語言時會被舊訊息蓋回）。 */
function lcSet(el, key, ...args) {
    if (!el) return;
    delete el.dataset.lcHtml;
    if (!key) {
        delete el.dataset.lc;
        delete el.dataset.lcArgs;
        el.textContent = '';
        return;
    }
    el.dataset.lc = key;
    if (args.length) el.dataset.lcArgs = JSON.stringify(args);
    else delete el.dataset.lcArgs;
    el.textContent = T(key, ...args);
}

function lcSetHtml(el, key) {
    if (!el) return;
    delete el.dataset.lc;
    delete el.dataset.lcArgs;
    el.dataset.lcHtml = key;
    el.innerHTML = T(key);
}

function lcSetTitle(el, key) {
    if (!el) return;
    el.dataset.lcTitle = key;
    el.title = T(key);
}

/* 容器之後會被別的程式用 innerHTML 整個換掉時用：訊息包在子元素裡，容器本身不留 key，
 * 免得切換語言時把後來的內容蓋掉。 */
function lcSetChild(el, key, ...args) {
    if (!el) return;
    delete el.dataset.lc;
    delete el.dataset.lcArgs;
    delete el.dataset.lcHtml;
    el.innerHTML = lcSpan(key, ...args);
}

function relabelDynamic(root = document) {
    root.querySelectorAll('[data-lc]').forEach(el => { el.textContent = T(el.dataset.lc, ...lcArgs(el)); });
    root.querySelectorAll('[data-lc-html]').forEach(el => { el.innerHTML = T(el.dataset.lcHtml); });
    root.querySelectorAll('[data-lc-title]').forEach(el => { el.title = T(el.dataset.lcTitle); });
    root.querySelectorAll('[data-lc-ph]').forEach(el => { el.placeholder = T(el.dataset.lcPh); });
}

/* ---------- 產出 HTML 裡的固定字樣 ---------- */
/* 給讀者看的固定字樣依「轉換當下」的介面語言。按下轉換時取一次放進
 * customOptions.labels，之後的預覽與下載都沿用同一份，中途切換介面語言也不會前後不一。
 * 使用者日誌的內容一律原樣輸出。 */
function lcFormat(template) {
    return (...args) => template.replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : args[i]));
}

function buildOutputLabels() {
    return {
        lang: T('out.lang'),
        dateLocale: T('out.dateLocale'),
        defaultTitle: T('out.defaultTitle'),
        noParticipants: T('out.noParticipants'),
        system: T('out.system'),
        notice: T('out.notice'),
        chatTag: T('out.chatTag'),
        chatFold: T('out.chatFold'),
        /* 傳 '{0}' 進去拿回原樣的範本，現在就定下語言。 */
        chatFoldCount: lcFormat(T('out.chatFoldCount', '{0}')),
        chatSummaryCount: lcFormat(T('out.chatSummaryCount', '{0}')),
        illustrationAlt: T('out.illustrationAlt')
    };
}

function outLabels(customOptions) {
    return (customOptions && customOptions.labels) || buildOutputLabels();
}

/* ---------- 解析規則的別名 ---------- */
/* 載入日誌時自動當成閒聊分頁的分頁名稱。第一個是上游比對的韓文名稱（上游預設的閒聊分頁
 * 名稱，也是 CCFOLIA 韓文介面的分頁名稱；屬於解析規則，照原樣保留），其後是收錄版補上的
 * 繁中別名。 */
const OOC_TAB_NAMES = ['잡담', '閒聊', '雜談'];

function detectLogFormat(rawHtml) {
    if (typeof rawHtml !== 'string') return 'legacy';
    const hasArticle = /<article[^>]*class="[^"]*\bmessage\b/.test(rawHtml);
    const hasChannel = /data-channel\s*=/.test(rawHtml);
    const hasText = /class="message-text"/.test(rawHtml);
    return (hasArticle && (hasChannel || hasText)) ? 'ccfolia-v2' : 'legacy';
}


function textToHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\r?\n/g, '<br>');
}


function extractAvatarImages(doc) {
    const map = {};
    doc.querySelectorAll('style').forEach(styleEl => {
        const css = styleEl.textContent || '';
        const re = /\.avatar-image-(\d+)\s*\{[^}]*?background-image:\s*url\(\s*["']?(data:[^"')\s]+)["']?\s*\)/g;
        let m;
        while ((m = re.exec(css)) !== null) {
            map[`avatar-image-${m[1]}`] = m[2];
        }
    });
    return map;
}


function parseCcfoliaV2Log(rawHtml) {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

    
    
    const titleText = (doc.querySelector('.log-title')?.textContent || doc.title || '').trim();
    const titleMatch = titleText.match(/^(.*)\s*\[([^[\]]+)\]\s*$/);
    const roomTitle = titleMatch ? titleMatch[1].trim() : (titleText || null);
    const tabLabel = titleMatch ? titleMatch[2].trim() : null;

    const avatarCss = extractAvatarImages(doc);
    const avatars = {};        // dataUrl -> dataUrl（與 messageImages 同一種形式）
    const speakerColors = {};  // 發言者 -> 顏色（採用出現最多次的顏色）
    const colorTally = {};     // 發言者 -> { 顏色: 次數 }
    const channels = new Set();
    const logs = [];

    doc.querySelectorAll('article.message').forEach(article => {
        const tab = article.getAttribute('data-channel') || '';
        if (tab) channels.add(tab);

        const isSystemRow = article.classList.contains('system');
        const content = article.querySelector('.message-content');
        const textEl = (content || article).querySelector('.message-text');
        const rollEl = (content || article).querySelector('.roll-result');

        
        let bodyText = '';
        if (textEl) {
            const clone = textEl.cloneNode(true);
            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            bodyText = clone.textContent;
        }
        const rollText = rollEl ? rollEl.textContent.trim() : '';
        if (!bodyText.trim() && !rollText) return; // 略過空白訊息

        let message = textToHtml(bodyText.replace(/\s+$/, ''));
        if (rollText) {
            message += (message ? '<br>' : '') + textToHtml(rollText);
        }

        
        const speakerEl = (content || article).querySelector('.speaker');
        const speaker = isSystemRow ? 'system' : (speakerEl ? speakerEl.textContent.trim() : '');

        
        if (speakerEl && speaker) {
            const styleAttr = speakerEl.getAttribute('style') || '';
            const colorMatch = styleAttr.match(/--speaker-color:\s*([^;]+)/);
            const color = colorMatch ? colorMatch[1].trim() : '';
            if (color) {
                if (!colorTally[speaker]) colorTally[speaker] = {};
                colorTally[speaker][color] = (colorTally[speaker][color] || 0) + 1;
            }
        }

        
        let imageUrl = null;
        const avatarEl = article.querySelector('.avatar');
        if (avatarEl) {
            const cls = [...avatarEl.classList].find(c => /^avatar-image-\d+$/.test(c));
            const dataUrl = cls ? avatarCss[cls] : null;
            if (dataUrl) {
                imageUrl = dataUrl;
                avatars[dataUrl] = dataUrl;
            }
        }

        const timestamp = article.querySelector('time')?.getAttribute('datetime') || '';
        
        const parsedTime = timestamp ? Date.parse(timestamp) : NaN;

        logs.push({
            tab,
            speaker,
            message,
            type: (isSystemRow || rollText) ? 'SYSTEM' : 'DIALOGUE',
            imageUrl,
            timestamp,
            timestampMs: Number.isNaN(parsedTime) ? null : parsedTime
        });
    });

    
    for (const [name, tally] of Object.entries(colorTally)) {
        speakerColors[name] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    }

    return {
        roomTitle,
        tabLabel,
        channels: [...channels],
        avatars,
        speakerColors,
        logs
    };
}


function applyLogRoles(logs, narratorName = 'GM', oocTabName = '') {
    return logs.map(log => {
        if (log.type === 'SYSTEM') return { ...log };
        let type = 'DIALOGUE';
        if (oocTabName && log.tab === oocTabName) type = 'OOC';
        else if (narratorName && log.speaker === narratorName) type = 'NARRATION';
        return { ...log, type };
    });
}


function extractTabs(rawHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    
    const logEntries = doc.querySelectorAll('p, div');
    const tabs = new Set();

    logEntries.forEach(entry => {
        const spans = entry.querySelectorAll('span');
        if (spans.length >= 3) {
            const tab = spans[0].textContent.trim().replace(/\[|\]/g, '');
            if (tab) {
                tabs.add(tab);
            }
        }
    });

    return Array.from(tabs);
}

function parseCocLog(rawHtml, narratorName = 'GM', oocTabName = '') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    
    const logEntries = doc.querySelectorAll('p, div');
    const parsedLogs = [];

    logEntries.forEach(entry => {
        const spans = entry.querySelectorAll('span');
        if (spans.length >= 3) {
            const tab = spans[0].textContent.trim().replace(/\[|\]/g, '');
            const speaker = spans[1].textContent.trim();
            const message = spans[2].innerHTML.trim();

            
            const messageText = spans[2].textContent.trim();
            if (!messageText || messageText.length === 0) {
                console.info(T('log.skipEmpty', tab, speaker));
                return;
            }

            let type = 'DIALOGUE';

            if (oocTabName && tab === oocTabName) type = 'OOC';
            else if (speaker === narratorName) type = 'NARRATION';
            else if (speaker === 'system' || /cc<=|\d+d\d+/i.test(message)) type = 'SYSTEM';

            
            const imageUrl = entry.getAttribute('data-image-url') || null;

            parsedLogs.push({ tab, speaker, message, type, imageUrl });
        }
    });

    return parsedLogs;
}






class BaseGenerator {
    constructor() {
        this.colors = ['#d9480f', '#1c7ed6', '#2b6777', '#862e9c', '#5c940d'];
    }

    
    hexToRgba(hex, alpha = 1) {
        if (typeof hex !== 'string') return hex;
        const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!m) return hex;
        let h = m[1];
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    generateChunks(allLogs, fileName, profileImages, splitMethod, splitValue, customOptions = {}) {
        if (splitMethod === 'none' || !splitValue || splitValue <= 0) {
            return [this.buildChunk(allLogs, fileName, profileImages, 1, 1, customOptions)];
        }

        let logChunks = [];
        if (splitMethod === 'count') {
            for (let i = 0; i < allLogs.length; i += splitValue) {
                logChunks.push(allLogs.slice(i, i + splitValue));
            }
        } else if (splitMethod === 'size') {
            let currentChunkLogs = [];
            const sizeLimitBytes = splitValue * 1024;
            for (const log of allLogs) {
                currentChunkLogs.push(log);
                const tempHtml = this.buildChunk(currentChunkLogs, fileName, profileImages, 0, 0, customOptions);
                const currentSize = new Blob([tempHtml]).size;
                if (currentSize > sizeLimitBytes) {
                    if (currentChunkLogs.length > 1) {
                        
                        logChunks.push(currentChunkLogs.slice(0, -1));
                        currentChunkLogs = [log];
                    } else {
                        
                        console.warn(T('log.singleOverSize', splitValue));
                        logChunks.push(currentChunkLogs);
                        currentChunkLogs = [];
                    }
                }
            }
            if (currentChunkLogs.length > 0) logChunks.push(currentChunkLogs);
        } else if (splitMethod === 'files') {
            
            const fileCount = splitValue;
            const logsPerFile = Math.ceil(allLogs.length / fileCount);
            for (let i = 0; i < fileCount; i++) {
                const start = i * logsPerFile;
                const end = Math.min(start + logsPerFile, allLogs.length);
                if (start < allLogs.length) {
                    logChunks.push(allLogs.slice(start, end));
                }
            }
        }

        const totalParts = logChunks.length || 1;
        if(logChunks.length === 0 && allLogs.length > 0) {
            logChunks.push(allLogs);
        }

        return logChunks.map((logs, index) => this.buildChunk(logs, fileName, profileImages, index + 1, totalParts, customOptions));
    }

    extractMetadata(fileName, customOptions = {}) {
        const titleMatch = fileName.match(/\]\s*(.*?)\s*\[/);
        const extractedTitle = titleMatch ? titleMatch[1] : outLabels(customOptions).defaultTitle;
        const participantsMatch = fileName.match(/\[(.*?)\]/);
        const extractedParticipants = participantsMatch ? participantsMatch[1] : outLabels(customOptions).noParticipants;

        const title = customOptions.title || extractedTitle;
        const participants = customOptions.subtitle || null;
        const summary = customOptions.summary || null;

        return { title, participants, summary };
    }

    createSpeakerColorMap(speakers, useClassNames = true, customColors = null) {
        const speakerColorMap = {};
        speakers.forEach((speaker, index) => {
            if (useClassNames) {
                speakerColorMap[speaker] = `speaker-color-${(index % 5) + 1}`;
            } else {
                const color = customColors?.[speaker] || this.colors[index % this.colors.length];
                
                speakerColorMap[speaker] = `color: ${color} !important;`;
            }
        });
        return speakerColorMap;
    }

    buildChunk(logs, fileName, profileImages, partNum, totalParts, customOptions = {}) {
        throw new Error('buildChunk must be implemented by subclass');
    }

    
    
    buildImageCSS(profileImages, messageImages = {}) {
        const imageMap = new Map(); // dataUrl -> id (number)
        let counter = 0;

        
        for (const [speaker, dataUrl] of Object.entries(profileImages || {})) {
            if (!dataUrl) continue;
            if (!imageMap.has(dataUrl)) {
                imageMap.set(dataUrl, counter++);
            }
        }

        
        for (const [url, dataUrl] of Object.entries(messageImages || {})) {
            if (!dataUrl) continue;
            if (!imageMap.has(dataUrl)) {
                imageMap.set(dataUrl, counter++);
            }
        }

        
        let css = '';
        if (counter > 0) {
            const classSelectors = Array.from(imageMap.values()).map(id => `.pi-${id}`).join(',');
            css = `${classSelectors}{background-size:cover;background-position:center top;}\n`;
            for (const [dataUrl, id] of imageMap) {
                css += `.pi-${id}{background-image:url("${dataUrl}");}\n`;
            }
        }

        return { css, imageMap };
    }

    
    buildProfileImageHtml(dataUrl, speaker, imageMap, fallbackSvg, extraClass = '') {
        if (!dataUrl) return fallbackSvg;
        const id = imageMap ? imageMap.get(dataUrl) : undefined;
        if (id !== undefined) {
            const classes = `pi-${id}${extraClass ? ' ' + extraClass : ''}`;
            return `<div class="${classes}" role="img" aria-label="${speaker}"></div>`;
        }
        return `<div style="background-image:url('${dataUrl}');background-size:cover;background-position:center top;" class="${extraClass}" role="img" aria-label="${speaker}"></div>`;
    }

    buildFontImport(customOptions = {}) {
        if (customOptions.fontUrl) {
            const fontUrl = customOptions.fontUrl.trim();
            
            if (fontUrl.startsWith('@font-face')) {
                return fontUrl;
            } else if (fontUrl.startsWith('@import')) {
                return fontUrl;
            } else {
                return `@import url('${fontUrl}');`;
            }
        }
        return '';
    }

    
    buildFontLinkTag(fontImportStr) {
        if (!fontImportStr) return '';
        if (fontImportStr.startsWith('@font-face')) return ''; // 交給 <style> 處理
        const match = fontImportStr.match(/@import\s+url\(['"]?([^'")\s]+)['"]?\)/);
        if (match) return `<link href="${match[1]}" rel="stylesheet">`;
        return '';
    }

    
    buildFontStyleContent(fontImportStr) {
        if (!fontImportStr) return '';
        if (fontImportStr.startsWith('@font-face')) return fontImportStr;
        return ''; // @import 改用 <link>
    }

    buildFontFamily(customOptions = {}, defaultFont) {
        if (customOptions.fontFamily) {
            return `'${customOptions.fontFamily}',${defaultFont}`;
        }
        return defaultFont;
    }

    
    
    insertIllustrationsIntoLogs(logs, illustrations = [], offset = 0) {
        if (!illustrations || illustrations.length === 0) {
            
            return logs.map((log, index) => ({
                ...log,
                logNumber: index + 1 + offset
            }));
        }

        
        const sortedIllustrations = [...illustrations]
            .filter(ill => ill.position !== null && ill.position !== undefined && !isNaN(ill.position) && ill.position > 0 && ill.imageDataUrl)
            .sort((a, b) => a.position - b.position);

        const result = [];
        let illustrationIndex = 0;

        logs.forEach((log, index) => {
            const logNumber = index + 1 + offset;

            
            result.push({
                ...log,
                logNumber: logNumber
            });

            
            while (illustrationIndex < sortedIllustrations.length &&
                   sortedIllustrations[illustrationIndex].position === logNumber) {

                const illustration = sortedIllustrations[illustrationIndex];
                result.push({
                    type: 'ILLUSTRATION',
                    imageDataUrl: illustration.imageDataUrl,
                    size: illustration.size || 'medium',
                    align: illustration.align || 'center',
                    logNumber: null // 插圖不編號
                });
                illustrationIndex++;
            }
        });

        return result;
    }

    
    buildIllustrationHtml(imageDataUrl, size = 'medium', align = 'center', alt = outLabels().illustrationAlt) {
        
        const sizeMap = {
            small: '400px',
            medium: '600px',
            large: '800px',
            full: '100%'
        };
        const maxWidth = sizeMap[size] || '600px';

        
        const alignMap = {
            left: 'flex-start',
            center: 'center',
            right: 'flex-end'
        };
        const justifyContent = alignMap[align] || 'center';

        return `
            <div class="illustration-container" style="display: flex; justify-content: ${justifyContent};">
                <img src="${imageDataUrl}"
                     alt="${lcEsc(alt)}"
                     style="max-width: ${maxWidth}; width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            </div>
        `;
    }

    
    makeIdSuffix(seed) {
        let h = 5381;
        const text = String(seed ?? '');
        for (let i = 0; i < text.length; i++) {
            h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
        }
        
        
        h = (h ^ (h >>> 15)) >>> 0;
        h = Math.imul(h, 2246822507) >>> 0;
        h = (h ^ (h >>> 13)) >>> 0;
        
        return h.toString(36).padStart(7, '0').slice(-6);
    }

    
    namespaceWebUpload(html, idSuffix) {
        if (!idSuffix) return html;

        const idMatch = html.match(/id="(ccfolia-[a-z0-9-]*wrap)"/i);
        if (idMatch) {
            const oldId = idMatch[1];
            const newId = `${oldId}-${idSuffix}`;
            html = html.split(`#${oldId}`).join(`#${newId}`);
            html = html.split(`id="${oldId}"`).join(`id="${newId}"`);
        }

        
        html = html.replace(/\.pi-(\d+)/g, `.pi-${idSuffix}-$1`);
        html = html.replace(/class="pi-(\d+)/g, `class="pi-${idSuffix}-$1`);

        return html;
    }

    
    convertToWebUploadFormat(fullHtml, idSuffix = '') {
        
        let webUploadHtml = fullHtml.replace(/<!DOCTYPE[^>]*>/i, '');

        
        webUploadHtml = webUploadHtml.replace(/<html[^>]*>/i, '');
        webUploadHtml = webUploadHtml.replace(/<\/html>/i, '');

        
        const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        const styles = [];
        let match;
        while ((match = styleRegex.exec(webUploadHtml)) !== null) {
            styles.push(match[1]); // 只取內容（不含標籤）
        }

        
        webUploadHtml = webUploadHtml.replace(/<head[^>]*>[\s\S]*?<\/head>/i, '');

        
        webUploadHtml = webUploadHtml.replace(/<body[^>]*>/i, '');
        webUploadHtml = webUploadHtml.replace(/<\/body>/i, '');

        
        const scopedStyles = styles.map(css => this.scopeCssToContainer(css)).join('\n');

        
        webUploadHtml = `<meta charset="UTF-8">\n<style>\n${scopedStyles}\n</style>\n` + webUploadHtml;

        
        webUploadHtml = webUploadHtml.trim();

        
        webUploadHtml = this.namespaceWebUpload(webUploadHtml, idSuffix);

        console.info(T('log.webDone'));
        return webUploadHtml;
    }

    
    scopeCssToContainer(css) {
        
        
        
        
        css = css.replace(/\/\*[\s\S]*?\*\//g, '');

        
        
        css = css.replace(/:root\s*\{/gi, '.log-container {');

        
        
        css = css.replace(/\bbody\s*\{/gi, '.log-container {');

        
        css = css.replace(/\bhtml\s*\{/gi, '.log-container {');

        
        
        
        css = css.replace(/(^|[;\{\}]\s*)\*\s*\{/gm, '$1.log-container * {');

        
        
        
        css = this.prefixAllSelectors(css, '.log-container');

        return css;
    }

    
    prefixAllSelectors(css, containerSelector) {
        
        

        let result = '';
        let depth = 0;
        let currentSelector = '';
        let inBlock = false;

        for (let i = 0; i < css.length; i++) {
            const char = css[i];

            if (char === '{') {
                if (depth === 0) {
                    
                    const prefixedSelector = this.prefixSelector(currentSelector.trim(), containerSelector);
                    result += prefixedSelector + ' {';
                    currentSelector = '';
                    inBlock = true;
                } else {
                    result += char;
                }
                depth++;
            } else if (char === '}') {
                depth--;
                result += char;
                if (depth === 0) {
                    inBlock = false;
                }
            } else if (depth === 0) {
                currentSelector += char;
            } else {
                result += char;
            }
        }

        return result;
    }

    
    prefixSelector(selector, containerSelector) {
        if (!selector.trim()) return selector;

        
        if (selector.trim().startsWith('@')) {
            return selector;
        }

        
        return selector.split(',').map(sel => {
            sel = sel.trim();
            if (!sel) return sel;

            
            if (sel.includes(containerSelector)) {
                return sel;
            }

            
            if (sel === containerSelector || sel === containerSelector.substring(1)) {
                return sel;
            }

            
            
            if (sel.includes('#')) {
                return sel;
            }

            return `${containerSelector} ${sel}`;
        }).join(', ');
    }
}





class NovelGenerator extends BaseGenerator {
    buildChunk(logs, fileName, profileImages, partNum = 1, totalParts = 1, customOptions = {}) {
        const L = outLabels(customOptions); // 產出 HTML 的固定字樣（轉換當下的語言）
        
        const illustrations = customOptions.illustrations || [];
        logs = this.insertIllustrationsIntoLogs(logs, illustrations, customOptions.logNumberOffset || 0);

        const { title, participants, summary } = this.extractMetadata(fileName, customOptions);
        const speakers = [...new Set(logs.filter(l => l.type !== 'ILLUSTRATION').map(log => log.speaker))];
        const hasCustomColors = customOptions.characterColors && Object.keys(customOptions.characterColors).length > 0;
        const speakerColorMap = this.createSpeakerColorMap(speakers, !hasCustomColors, customOptions.characterColors);

        const maxNameLength = speakers.length > 0 ? Math.max(...speakers.map(s => s.length)) : 5;

        let bodyContent = '';
        let chatBuffer = [];

        const chatMode = customOptions.chatMode || 'collapse';
        const showChatCount = customOptions.showChatCount !== false;
        const hideSystem = customOptions.hideSystem || false;

        const flushChatBuffer = () => {
            if (chatBuffer.length > 0 && chatMode !== 'hide') {
                const oocTab = chatBuffer[0]?.tab;
                const chatTabColor = enableTabColors && oocTab && tabColors[oocTab] ? tabColors[oocTab] : null;
                const chatBgColor = chatTabColor?.bgColor && chatTabColor.bgColor !== 'transparent' ? chatTabColor.bgColor : null;
                const chatTextColor = chatTabColor?.textColor || null;
                const detailsBgStyle = chatBgColor ? ` style="background-color:${chatBgColor}!important;"` : '';
                const chatVisibleBgStyle = chatBgColor ? ` style="background-color:${chatBgColor}!important;padding:0.5em;border-radius:6px;"` : '';
                
                const textStyle = chatTextColor ? ` style="color:${chatTextColor}!important;"` : '';
                const summaryStyle = chatTextColor ? ` style="color:${chatTextColor}!important;"` : '';
                if (chatMode === 'collapse') {
                    const summaryText = showChatCount ? L.chatSummaryCount(chatBuffer.length) : '';
                    bodyContent += `<div class="collapsible-note"><details${detailsBgStyle}><summary${summaryStyle}>${summaryText}</summary><div class="note-content"${textStyle}>${chatBuffer.map(log => `<p><b>${log.speaker}:</b> ${log.message}</p>`).join('')}</div></details></div>`;
                } else if (chatMode === 'show') {
                    bodyContent += `<div class="chat-visible"${chatVisibleBgStyle}${textStyle}>${chatBuffer.map(log => `<p><b>${log.speaker}:</b> ${log.message}</p>`).join('')}</div>`;
                }
                chatBuffer = [];
            }
        };

        
        const subNarrators = customOptions.subNarrators || [];

        
        const tabColors = customOptions.tabColors || {};
        const enableTabColors = customOptions.enableTabColors || false;

        
        const tabStyles = customOptions.tabStyles || {};

        let currentTab = null;
        let currentTabBgColor = null;
        let tabSectionOpen = false;

        const closeTabSection = () => {
            if (tabSectionOpen) {
                bodyContent += `</div>`;
                tabSectionOpen = false;
            }
        };

        const openTabSection = (tab) => {
            if (enableTabColors && tabColors[tab]) {
                const { bgColor, textColor } = tabColors[tab];
                const hasBg = bgColor && bgColor !== 'transparent';
                const hasText = !!textColor;
                if (hasBg || hasText) {
                    const styleParts = [];
                    if (hasBg) styleParts.push(`background-color: ${bgColor}`);
                    if (hasText) styleParts.push(`color: ${textColor}`);
                    bodyContent += `<div class="tab-section" style="${styleParts.join('; ')}; padding: 1em; border-radius: 6px; margin: 1em 0;">`;
                    tabSectionOpen = true;
                    currentTabBgColor = hasBg ? bgColor : null;
                }
            }
        };

        logs.forEach(log => {
            
            const tabStyle = tabStyles[log.tab] || 'none';

            if (tabStyle === 'hide') {
                return; // 略過這則日誌
            }

            
            if (log.type === 'ILLUSTRATION') {
                closeTabSection();
                flushChatBuffer();
                bodyContent += this.buildIllustrationHtml(log.imageDataUrl, log.size, log.align, L.illustrationAlt);
                return;
            }

            
            if (log.type === 'SYSTEM') {
                closeTabSection();
                currentTab = null;
                if (!hideSystem) {
                    const speakerDisplay = log.speaker && log.speaker !== 'system' ? log.speaker : L.system;
                    const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';
                    bodyContent += `<div class="dice-box"${logNumAttr}><div class="dice-box-header"><svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9C6.67 9 6 8.33 6 7.5S6.67 6 7.5 6 9 6.67 9 7.5 8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-9c-.83 0-1.5-.67-1.5-1.5S15.67 6 16.5 6s1.5.67 1.5 1.5S17.33 9 16.5 9z"/></svg><span>${speakerDisplay}</span></div><div class="dice-box-content">${log.message}</div></div>`;
                }
                return;
            }

            
            if (log.type === 'OOC') {
                closeTabSection();
                currentTab = null;
                chatBuffer.push(log);
                return;
            }

            flushChatBuffer();

            
            if (log.tab !== currentTab) {
                closeTabSection();
                currentTab = log.tab;
                openTabSection(log.tab);
            }

            const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';

            if (log.message.includes('***')) {
                bodyContent += `<div class="scene-divider"${logNumAttr}>***</div>`;
            } else if (log.type === 'NARRATION') {
                bodyContent += `<div class="narration-block"${logNumAttr}>${log.message.split('|||').join('<br>')}</div>`;
            } else {
                
                const subNarratorConfig = subNarrators.find(n => n.speaker === log.speaker);

                if (subNarratorConfig) {
                    
                    switch (subNarratorConfig.style) {
                        case 'italic-narration':
                            bodyContent += `<div class="narration-block narration-block-italic"${logNumAttr}>${log.message.split('|||').join('<br>')}</div>`;
                            break;
                        case 'normal-narration':
                            bodyContent += `<div class="narration-block"${logNumAttr}>${log.message.split('|||').join('<br>')}</div>`;
                            break;
                        case 'italic-dialogue':
                            const colorValue = speakerColorMap[log.speaker] || '';
                            const messageLines = log.message.split('|||');
                            const allLines = messageLines.map(line => `<div style="font-style:italic;">${line}</div>`).join('');
                            const wrapStyle1 = (customOptions.longNameWrap && log.speaker.length > 10) ? 'white-space:normal;word-break:keep-all;overflow-wrap:break-word;' : '';
                            const combinedStyle1 = `${wrapStyle1}${colorValue}`;
                            if (hasCustomColors) {
                                bodyContent += `<div class="dialogue-block-grid"${logNumAttr}><span class="speaker-name-grid" style="${combinedStyle1}">${log.speaker}</span><div class="message-lines-grid">${allLines}</div></div>`;
                            } else {
                                bodyContent += `<div class="dialogue-block-grid ${colorValue}"${logNumAttr}><span class="speaker-name-grid" style="${wrapStyle1}">${log.speaker}</span><div class="message-lines-grid">${allLines}</div></div>`;
                            }
                            break;
                        case 'colored-narration':
                            const customColor = subNarratorConfig.color || '#9ca3af';
                            
                            bodyContent += `<div class="narration-block"${logNumAttr} style="color:${customColor}!important;">${log.message.split('|||').join('<br>')}</div>`;
                            break;
                        default:
                            bodyContent += `<div class="narration-block"${logNumAttr}>${log.message.split('|||').join('<br>')}</div>`;
                    }
                } else {
                    
                    const colorValue = speakerColorMap[log.speaker] || '';
                    const messageLines = log.message.split('|||');

                    const allLines = messageLines.map(line => `<div>${line}</div>`).join('');

                    
                    const wrapStyle = (customOptions.longNameWrap && log.speaker.length > 10) ? 'white-space:normal;word-break:keep-all;overflow-wrap:break-word;' : '';
                    const combinedStyle = `${wrapStyle}${colorValue}`;
                    if (hasCustomColors) {
                        bodyContent += `<div class="dialogue-block-grid"${logNumAttr}><span class="speaker-name-grid" style="${combinedStyle}">${log.speaker}</span><div class="message-lines-grid">${allLines}</div></div>`;
                    } else {
                        bodyContent += `<div class="dialogue-block-grid ${colorValue}"${logNumAttr}><span class="speaker-name-grid" style="${wrapStyle}">${log.speaker}</span><div class="message-lines-grid">${allLines}</div></div>`;
                    }
                }
            }
        });
        closeTabSection();
        flushChatBuffer();

        const partTitle = totalParts > 1 ? `${title} (Part ${partNum})` : title;
        const headerTitle = totalParts > 1 ? `${title} #${partNum}`: title;
        const footerIndicator = totalParts > 1 ? `<footer class="page-footer">Page ${partNum} of ${totalParts}</footer>` : '';

        const customFontImport = this.buildFontImport(customOptions);
        const rawFontImport = customFontImport || `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap');`;
        const fontLinkTag = this.buildFontLinkTag(rawFontImport);
        const defaultFontImport = this.buildFontStyleContent(rawFontImport);
        const fontMain = this.buildFontFamily(customOptions, `'Noto Sans KR',sans-serif`);
        const fontSerif = this.buildFontFamily(customOptions, `'Noto Serif KR',serif`);

        
        const fontSize = customOptions.fontSize || '17';
        const lineHeight = customOptions.lineHeight || '1.8';
        const pageWidth = customOptions.pageWidth || '750';

        
        const systemBgColor = customOptions.systemBgColor || '#2a0a0a';
        const systemBorderColor = customOptions.systemBorderColor || '#7f1d1d';
        const systemTextColor = customOptions.systemTextColor || '#1a1a1a';

        
        const themeBgColor = customOptions.themeBgColor || '#0a0a0a';
        const themeContainerColor = customOptions.themeContainerColor || '#1e1e1e';
        const themeTextColor = customOptions.themeTextColor || '#e5e7eb';
        const themeAccentColor = customOptions.themeAccentColor || '#7f1d1d';

        const summaryHtml = summary ? `<p class="summary">${summary}</p>` : '';
        const participantsHtml = participants ? `<p class="participants">${participants}</p>` : '';
        const gridColumnWidth = `${maxNameLength}em`;

        
        const typographyStyles = customOptions.novelTypography
            
            ? `#ccfolia-novel-wrap .narration-block{text-indent:1em!important;letter-spacing:-0.01em!important;word-spacing:0.05em!important;}#ccfolia-novel-wrap .dialogue-block-grid .message-lines-grid>div{letter-spacing:-0.01em!important;word-spacing:0.05em!important;}`
            : '';

        const cssBlock = `${defaultFontImport}#ccfolia-novel-wrap{--bg-color:${themeBgColor};--main-text-color:${themeTextColor};--secondary-text-color:#9ca3af;--border-color:${themeAccentColor};--system-bg-color:${systemBgColor};--system-border-color:${systemBorderColor};--system-text-color:${systemTextColor};--font-main:${fontMain};--font-serif:${fontSerif};font-family:var(--font-serif)!important;background:${themeBgColor}!important;color:var(--main-text-color)!important;display:block!important;padding:20px!important;font-size:${fontSize}px!important;line-height:${lineHeight}!important;}#ccfolia-novel-wrap .log-container{max-width:${pageWidth}px!important;margin:40px auto!important;background-color:${themeContainerColor}!important;position:relative!important;z-index:1!important;border:1px solid var(--border-color)!important;box-shadow:0 8px 32px ${this.hexToRgba(themeAccentColor, 0.4)}!important;padding:50px 60px!important;}#ccfolia-novel-wrap .header{text-align:center!important;border-bottom:2px solid var(--border-color)!important;padding-bottom:20px!important;margin-bottom:50px!important;}#ccfolia-novel-wrap .header h1{font-family:var(--font-serif)!important;font-size:2.5em!important;font-weight:700!important;margin:0!important;color:var(--main-text-color)!important;}#ccfolia-novel-wrap .header .participants{font-family:var(--font-main)!important;font-size:1.1em!important;color:var(--secondary-text-color)!important;margin-top:15px!important;}#ccfolia-novel-wrap .header .summary{font-family:var(--font-main)!important;font-size:0.95em!important;color:var(--secondary-text-color)!important;margin-top:15px!important;line-height:1.6!important;}#ccfolia-novel-wrap .narration-block{margin-bottom:1.5em!important;color:var(--main-text-color)!important;}#ccfolia-novel-wrap .narration-block-italic{font-style:italic!important;}#ccfolia-novel-wrap .dialogue-block{margin:0.8em 0!important;color:var(--main-text-color)!important;}#ccfolia-novel-wrap .dialogue-block .speaker-name{font-weight:700!important;display:inline!important;}#ccfolia-novel-wrap .dialogue-block .message-container{display:inline!important;}#ccfolia-novel-wrap .dialogue-block .msg-line.first-line{display:inline!important;}#ccfolia-novel-wrap .dialogue-block .msg-line{display:block!important;}#ccfolia-novel-wrap .dialogue-block-grid{display:grid!important;grid-template-columns:${gridColumnWidth} 1fr!important;margin:0.8em 0!important;column-gap:0.5em!important;color:var(--main-text-color)!important;}#ccfolia-novel-wrap .dialogue-block-grid .speaker-name-grid{font-weight:700!important;white-space:nowrap!important;align-self:start!important;text-align:right!important;}#ccfolia-novel-wrap .dialogue-block-grid .message-lines-grid{align-self:start!important;color:inherit!important;font-style:normal!important;}#ccfolia-novel-wrap .dialogue-block-grid .message-lines-grid>div{margin:0!important;color:inherit!important;}#ccfolia-novel-wrap .speaker-color-1 .speaker-name,#ccfolia-novel-wrap .speaker-color-1 .speaker-name-grid{color:#d9480f!important;}#ccfolia-novel-wrap .speaker-color-2 .speaker-name,#ccfolia-novel-wrap .speaker-color-2 .speaker-name-grid{color:#1c7ed6!important;}#ccfolia-novel-wrap .speaker-color-3 .speaker-name,#ccfolia-novel-wrap .speaker-color-3 .speaker-name-grid{color:#2b6777!important;}#ccfolia-novel-wrap .speaker-color-4 .speaker-name,#ccfolia-novel-wrap .speaker-color-4 .speaker-name-grid{color:#862e9c!important;}#ccfolia-novel-wrap .speaker-color-5 .speaker-name,#ccfolia-novel-wrap .speaker-color-5 .speaker-name-grid{color:#5c940d!important;}#ccfolia-novel-wrap .scene-divider{text-align:center!important;margin:3em 0!important;color:var(--secondary-text-color)!important;letter-spacing:0.5em!important;}#ccfolia-novel-wrap .dice-box{margin:1em 0;padding:10px 14px;background-color:var(--system-bg-color)!important;border:2px solid var(--system-border-color);border-radius:6px;font-family:var(--font-main);font-size:0.95em;}#ccfolia-novel-wrap .dice-box-header{font-weight:700;color:var(--system-text-color)!important;margin-bottom:6px;}#ccfolia-novel-wrap .dice-box-content{color:var(--system-text-color)!important;line-height:1.5;}#ccfolia-novel-wrap .system-message{margin:1em 0;padding:8px 12px;background-color:var(--system-bg-color)!important;border-left:3px solid var(--system-border-color);font-family:var(--font-main);font-size:0.9em;color:var(--system-text-color)!important;}#ccfolia-novel-wrap .system-message p{margin:0;}#ccfolia-novel-wrap .collapsible-note{margin:2em 0;font-family:var(--font-main);}#ccfolia-novel-wrap .collapsible-note details{border:1px dashed var(--border-color);border-radius:4px;background-color:#2a2a2a!important;font-size:0.9em;}#ccfolia-novel-wrap .collapsible-note summary{padding:8px 12px!important;color:var(--secondary-text-color)!important;font-weight:bold!important;cursor:pointer!important;list-style:revert!important;display:list-item!important;}#ccfolia-novel-wrap .collapsible-note summary::-webkit-details-marker{display:revert!important;}#ccfolia-novel-wrap .collapsible-note .note-content{padding:0 12px 12px;color:var(--secondary-text-color)!important;white-space:pre-wrap;}#ccfolia-novel-wrap .collapsible-note .note-content p{margin:0 0 5px;}#ccfolia-novel-wrap .chat-visible{margin:2em 0;padding:10px;border:1px dashed var(--border-color);background-color:#2a2a2a!important;font-family:var(--font-main);font-size:0.9em;color:var(--secondary-text-color)!important;}#ccfolia-novel-wrap .chat-visible p{margin:0 0 5px;}#ccfolia-novel-wrap .page-footer{text-align:center!important;margin-top:40px!important;padding-top:20px!important;border-top:1px solid var(--border-color)!important;font-family:var(--font-main)!important;color:var(--secondary-text-color)!important;font-size:0.9em!important;}#ccfolia-novel-wrap *{font-family:inherit!important;word-break:normal!important;text-align:left!important;text-indent:0!important;letter-spacing:normal!important;word-spacing:normal!important;text-shadow:none!important;text-transform:none!important;visibility:visible!important;}#ccfolia-novel-wrap .tab-section *:not(.speaker-name-grid):not(.speaker-name){color:inherit!important;}${typographyStyles}`;

        return `<!DOCTYPE html><html lang="${L.lang}"><head><meta charset="UTF-8"><title>${partTitle}</title></head><body><div id="ccfolia-novel-wrap">${fontLinkTag}<style>${cssBlock}</style><div class="log-container"><header class="header"><h1>${headerTitle}</h1>${participantsHtml}${summaryHtml}</header>${bodyContent}${footerIndicator}</div></div></body></html>`;
    }
}





class TimelineGenerator extends BaseGenerator {
    buildChunk(logs, fileName, profileImages, partNum = 1, totalParts = 1, customOptions = {}) {
        const L = outLabels(customOptions); // 產出 HTML 的固定字樣（轉換當下的語言）
        
        const illustrations = customOptions.illustrations || [];
        logs = this.insertIllustrationsIntoLogs(logs, illustrations, customOptions.logNumberOffset || 0);

        const { title, participants, summary } = this.extractMetadata(fileName, customOptions);
        
        const speakers = [...new Set(logs.filter(log => log.type === 'DIALOGUE' && log.speaker).map(log => log.speaker))];
        const speakerColorMap = this.createSpeakerColorMap(speakers, false, customOptions.characterColors);

        
        const getDisplayWidth = (str) => {
            let width = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str[i];
                /* 收錄版：上游只把諺文算成全形寬度，漢字、假名與全形符號會被算成半形，
                 * 名字欄太窄、名字溢出去蓋到頭像與台詞。一併算成全形。 */
                if (/[\u3131-\u318E\uAC00-\uD7A3\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF01-\uFF60]/.test(char)) {
                    
                    width += 2;
                } else if (/[a-zA-Z0-9]/.test(char)) {
                    
                    width += 1;
                } else if (/\s/.test(char)) {
                    
                    width += 0.5;
                } else {
                    
                    width += 1;
                }
            }
            return width;
        };

        const maxDisplayWidth = speakers.length > 0 ? Math.max(...speakers.map(s => getDisplayWidth(s))) : 10;

        
        const speakerLetterSpacing = {};
        speakers.forEach(speaker => {
            
            speakerLetterSpacing[speaker] = '';
        });

        
        const messageImages_all = customOptions.messageImages || {};
        const { css: imageCSS, imageMap } = this.buildImageCSS(profileImages, messageImages_all);

        let bodyContent = '';
        let chatBuffer = [];
        let narrationBuffer = [];
        let narrationBufferTab = null;

        const chatMode = customOptions.chatMode || 'collapse';
        const showChatCount = customOptions.showChatCount !== false;
        const hideSystem = customOptions.hideSystem || false;
        const subNarrators = customOptions.subNarrators || [];

        
        const dialogueLayoutMode = customOptions.dialogueLayoutMode || 'grid';
        const dialogueSeparatorType = customOptions.dialogueSeparatorType || 'space';
        const customSeparatorValue = customOptions.customSeparatorValue || ':';
        const isCompact = dialogueLayoutMode === 'compact';
        const separator = isCompact
            ? (dialogueSeparatorType === 'custom' ? customSeparatorValue + ' ' : ' ')
            : '';

        
        const tabColors = customOptions.tabColors || {};
        const enableTabColors = customOptions.enableTabColors || false;

        
        const svgChat   = `<svg fill="currentColor" style="width:22px;height:22px;"><use href="#ti-chat"/></svg>`;
        const svgNarr   = `<svg fill="currentColor" style="width:22px;height:22px;"><use href="#ti-narration"/></svg>`;
        const svgDice   = `<svg fill="currentColor" style="width:20px;height:20px;"><use href="#ti-dice"/></svg>`;
        const svgPerson = `<svg fill="currentColor" style="width:24px;height:24px;"><use href="#ti-person"/></svg>`;
        const svgDefs   = `<svg style="display:none" aria-hidden="true"><defs>`
            + `<symbol id="ti-chat" viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></symbol>`
            + `<symbol id="ti-narration" viewBox="0 0 24 24"><path fill="currentColor" d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></symbol>`
            + `<symbol id="ti-dice" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9C6.67 9 6 8.33 6 7.5S6.67 6 7.5 6 9 6.67 9 7.5 8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-9c-.83 0-1.5-.67-1.5-1.5S15.67 6 16.5 6s1.5.67 1.5 1.5S17.33 9 16.5 9z"/></symbol>`
            + `<symbol id="ti-person" viewBox="0 0 24 24"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></symbol>`
            + `</defs></svg>`;

        
        const tabStyles = customOptions.tabStyles || {};

        
        const themeBgColor = customOptions.themeBgColor || '#0a0a0a';
        const themeContainerColor = customOptions.themeContainerColor || '#1e1e1e';
        const themeTextColor = customOptions.themeTextColor || '#e5e7eb';
        const themeAccentColor = customOptions.themeAccentColor || '#7f1d1d';

        
        const systemBgColor = customOptions.systemBgColor || '#2a0a0a';
        const systemBorderColor = customOptions.systemBorderColor || '#7f1d1d';
        const systemTextColor = customOptions.systemTextColor || '#1a1a1a';

        
        const narrationBgColor = customOptions.narrationBgColor || '#2a2a2a';
        const narrationTextColor = customOptions.narrationTextColor || '#9ca3af';

        const flushChatBuffer = () => {
            if (chatBuffer.length > 0 && chatMode !== 'hide') {
                
                const oocTab = chatBuffer[0]?.tab;
                const chatTabColor = enableTabColors && oocTab && tabColors[oocTab] ? tabColors[oocTab] : null;
                const chatBgColor = chatTabColor?.bgColor && chatTabColor.bgColor !== 'transparent' ? chatTabColor.bgColor : null;
                const chatTextColor = chatTabColor?.textColor || null;

                if (chatMode === 'collapse') {
                    const summaryText = showChatCount ? L.chatSummaryCount(chatBuffer.length) : '';
                    const contentBgStyle = chatBgColor
                        ? ` style="background-color:${chatBgColor}!important;padding:0.5em;border-radius:6px;"`
                        : '';
                    const summaryColorStyle = chatTextColor ? ` style="color:${chatTextColor}!important;"` : '';
                    const chatContentColorStyle = chatTextColor ? ` style="color:${chatTextColor}!important;"` : '';
                    bodyContent += `<div class="timeline-entry chat-fold"><div class="timeline-icon">${svgChat}</div><div class="timeline-content"${contentBgStyle}><details><summary${summaryColorStyle}>${summaryText}</summary><div class="chat-content"${chatContentColorStyle}>${chatBuffer.map(log => `<p><b style="${speakerColorMap[log.speaker] || ''}">${log.speaker}:</b> ${log.message}</p>`).join('')}</div></details></div></div>`;
                } else if (chatMode === 'show') {
                    chatBuffer.forEach(log => {
                        const contentBgStyle = chatBgColor
                            ? ` style="background-color:${chatBgColor}!important;padding:0.5em;border-radius:6px;"`
                            : '';
                        bodyContent += `<div class="timeline-entry chat-visible"><div class="timeline-icon">${svgChat}</div><div class="timeline-content"${contentBgStyle}><p><b style="${speakerColorMap[log.speaker] || ''}">${log.speaker}:</b> ${log.message}</p></div></div>`;
                    });
                }
                chatBuffer = [];
            }
        };

        const flushNarrationBuffer = () => {
            if (narrationBuffer.length > 0) {
                
                let narrationBgStyle = '';
                if (enableTabColors && narrationBufferTab && tabColors[narrationBufferTab]) {
                    const narTabColor = tabColors[narrationBufferTab];
                    const hasBg = narTabColor.bgColor && narTabColor.bgColor !== 'transparent';
                    const bgPart = hasBg ? `background-color: ${narTabColor.bgColor} !important; ` : `background-color: ${narrationBgColor} !important; `;
                    const textPart = narTabColor.textColor ? `color: ${narTabColor.textColor} !important; ` : `color: ${narrationTextColor} !important; `;
                    narrationBgStyle = ` style="${bgPart}${textPart}padding: 0.8em; border-radius: 6px;"`;
                } else {
                    
                    narrationBgStyle = ` style="background-color: ${narrationBgColor} !important; padding: 10px; border-radius: 6px; color: ${narrationTextColor} !important;"`;
                }

                bodyContent += `<div class="timeline-entry narration"><div class="timeline-icon">${svgNarr}</div><div class="timeline-content"${narrationBgStyle}>`;
                narrationBuffer.forEach(msg => {
                    bodyContent += msg; // msg 已經含有 <p> 標籤與 data-log-num
                });
                bodyContent += `</div></div>`;
                narrationBuffer = [];
                narrationBufferTab = null;
            }
        };

        logs.forEach(log => {
            
            const tabStyle = tabStyles[log.tab] || 'none';

            if (tabStyle === 'hide') {
                return; // 略過這則日誌
            }

            
            if (log.type === 'ILLUSTRATION') {
                flushNarrationBuffer();
                flushChatBuffer();
                bodyContent += this.buildIllustrationHtml(log.imageDataUrl, log.size, log.align, L.illustrationAlt);
                return;
            }

            
            if (log.type === 'SYSTEM') {
                flushNarrationBuffer(); // 清空旁白緩衝
                flushChatBuffer(); // 清空閒聊緩衝

                if (!hideSystem) {
                    const speakerDisplay = log.speaker && log.speaker !== 'system' ? log.speaker : L.system;
                    const iconHtml = `<div class="timeline-icon dice-icon">${svgDice}</div>`;
                    const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';
                    bodyContent += `<div class="timeline-entry system"${logNumAttr}>${iconHtml}<div class="timeline-content"><div class="dice-box-inline"><div class="dice-box-header">${speakerDisplay}</div><div class="dice-box-content">${log.message}</div></div></div></div>`;
                }
                return;
            }

            
            if (log.type === 'OOC') {
                flushNarrationBuffer(); // 先輸出旁白
                chatBuffer.push(log);
                return;
            }

            
            let contentBgStyle = '';
            if (enableTabColors && tabColors[log.tab]) {
                const logTabColor = tabColors[log.tab];
                const hasBg = logTabColor.bgColor && logTabColor.bgColor !== 'transparent';
                const bgPart = hasBg ? `background-color: ${logTabColor.bgColor} !important; ` : `background-color: ${themeContainerColor} !important; `;
                const textPart = logTabColor.textColor ? `color: ${logTabColor.textColor} !important; ` : '';
                contentBgStyle = ` style="${bgPart}${textPart}padding: 0.8em; border-radius: 6px;"`;
            } else {
                
                contentBgStyle = ` style="background-color: ${themeContainerColor} !important; color: ${themeTextColor} !important; padding: 0.8em; border-radius: 6px;"`;
            }

            
            if (log.type === 'NARRATION') {
                flushChatBuffer(); // 先輸出閒聊
                
                if (narrationBuffer.length === 0) {
                    narrationBufferTab = log.tab;
                }
                const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';
                narrationBuffer.push(`<p class="message"${logNumAttr}>${log.message}</p>`);
            } else {
                
                const subNarratorConfig = subNarrators.find(n => n.speaker === log.speaker);

                if (subNarratorConfig) {
                    
                    flushChatBuffer();
                    const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';

                    switch (subNarratorConfig.style) {
                        case 'italic-narration':
                            bodyContent += `<div class="timeline-entry narration"${logNumAttr}><div class="timeline-icon">${svgNarr}</div><div class="timeline-content"${contentBgStyle}><p class="message" style="font-style:italic;">${log.message.split('|||').join('<br>')}</p></div></div>`;
                            break;
                        case 'normal-narration':
                            bodyContent += `<div class="timeline-entry narration"${logNumAttr}><div class="timeline-icon">${svgNarr}</div><div class="timeline-content"${contentBgStyle}><p class="message">${log.message.split('|||').join('<br>')}</p></div></div>`;
                            break;
                        case 'colored-narration':
                            const customColor = subNarratorConfig.color || '#9ca3af';
                            bodyContent += `<div class="timeline-entry narration"${logNumAttr}><div class="timeline-icon">${svgNarr}</div><div class="timeline-content"${contentBgStyle}><p class="message" style="color:${customColor};">${log.message.split('|||').join('<br>')}</p></div></div>`;
                            break;
                        case 'italic-dialogue':
                            flushNarrationBuffer();
                            
                            const useLogImages1 = customOptions.useLogImages || false;
                            const messageImages1 = customOptions.messageImages || {};
                            
                            const firstImageUrl1 = log.imageUrls?.[0] || log.imageUrl;
                            const messageImageUrl1 = useLogImages1 && firstImageUrl1 && messageImages1[firstImageUrl1];
                            const profileImgSrc1 = messageImageUrl1 || profileImages[log.speaker];
                            const fallbackSvg1 = svgPerson;
                            const profileInnerHtml1 = this.buildProfileImageHtml(profileImgSrc1, log.speaker, imageMap, fallbackSvg1, 'profile-image');
                            const iconHtml1 = `<div class="timeline-icon">${profileInnerHtml1}</div>`;
                            const messageLines1 = log.message.split('|||');
                            const wrapStyle1 = (customOptions.longNameWrap && log.speaker.length > 10) ? 'white-space:normal;word-break:keep-all;overflow-wrap:break-word;' : '';
                            const speakerStyle1 = `${wrapStyle1}${speakerColorMap[log.speaker] || ''}${speakerLetterSpacing[log.speaker] || ''}`;
                            if (isCompact) {
                                bodyContent += `<div class="timeline-entry dialogue"${logNumAttr}>${iconHtml1}<div class="timeline-content"${contentBgStyle}><div class="speaker-message-compact"><span class="speaker-name" style="${speakerStyle1}">${log.speaker}</span><span class="sep">${separator}</span><div class="msg-inline" style="font-style:italic;">`;
                                messageLines1.forEach((line, idx) => {
                                    bodyContent += idx === 0 ? `<span class="first-line">${line}</span>` : `<div>${line}</div>`;
                                });
                                bodyContent += `</div></div></div></div>`;
                            } else {
                                bodyContent += `<div class="timeline-entry dialogue"${logNumAttr}>${iconHtml1}<div class="timeline-content"${contentBgStyle}><div class="speaker-message-grid"><span class="speaker-name" style="${speakerStyle1}">${log.speaker}</span><div class="message-lines">`;
                                messageLines1.forEach(line => {
                                    bodyContent += `<div style="font-style:italic;">${line}</div>`;
                                });
                                bodyContent += `</div></div></div></div>`;
                            }
                            break;
                        default:
                            bodyContent += `<div class="timeline-entry narration"${logNumAttr}><div class="timeline-icon">${svgNarr}</div><div class="timeline-content"${contentBgStyle}><p class="message">${log.message.split('|||').join('<br>')}</p></div></div>`;
                    }
                } else {
                    
                    flushNarrationBuffer(); // 清空旁白緩衝
                    flushChatBuffer(); // 清空閒聊緩衝

                    
                    const useLogImages = customOptions.useLogImages || false;
                    const messageImages = customOptions.messageImages || {};
                    
                    const firstImageUrl = log.imageUrls?.[0] || log.imageUrl;
                    const messageImageUrl = useLogImages && firstImageUrl && messageImages[firstImageUrl];
                    const profileImgSrc = messageImageUrl || profileImages[log.speaker];
                    const fallbackSvg = svgPerson;
                    const profileInnerHtml = this.buildProfileImageHtml(profileImgSrc, log.speaker, imageMap, fallbackSvg, 'profile-image');
                    const iconHtml = `<div class="timeline-icon">${profileInnerHtml}</div>`;

                    const messageLines = log.message.split('|||');

                    const wrapStyle = (customOptions.longNameWrap && log.speaker.length > 10) ? 'white-space:normal;word-break:keep-all;overflow-wrap:break-word;' : '';
                    const speakerStyle = `${wrapStyle}${speakerColorMap[log.speaker] || ''}${speakerLetterSpacing[log.speaker] || ''}`;
                    const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';
                    if (isCompact) {
                        bodyContent += `<div class="timeline-entry dialogue"${logNumAttr}>${iconHtml}<div class="timeline-content"${contentBgStyle}><div class="speaker-message-compact"><span class="speaker-name" style="${speakerStyle}">${log.speaker}</span><span class="sep">${separator}</span><div class="msg-inline">`;
                        messageLines.forEach((line, idx) => {
                            bodyContent += idx === 0 ? `<span class="first-line">${line}</span>` : `<div>${line}</div>`;
                        });
                        bodyContent += `</div></div></div></div>`;
                    } else {
                        bodyContent += `<div class="timeline-entry dialogue"${logNumAttr}>${iconHtml}<div class="timeline-content"${contentBgStyle}><div class="speaker-message-grid"><span class="speaker-name" style="${speakerStyle}">${log.speaker}</span><div class="message-lines">`;
                        messageLines.forEach(line => {
                            bodyContent += `<div>${line}</div>`;
                        });
                        bodyContent += `</div></div></div></div>`;
                    }
                }
            }
        });
        flushChatBuffer();
        flushNarrationBuffer();

        const partTitle = totalParts > 1 ? `${title} (Part ${partNum})` : title;
        const headerTitle = totalParts > 1 ? `${title} #${partNum}`: title;
        const footerIndicator = totalParts > 1 ? `<footer class="page-footer">Page ${partNum} of ${totalParts}</footer>` : '';

        const customFontImport = this.buildFontImport(customOptions);
        const rawFontImport = customFontImport || `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;600&display=swap');`;
        const fontLinkTag = this.buildFontLinkTag(rawFontImport);
        const defaultFontImport = this.buildFontStyleContent(rawFontImport);
        const fontMain = this.buildFontFamily(customOptions, `'Noto Sans KR',sans-serif`);
        const fontSerif = this.buildFontFamily(customOptions, `'Noto Serif KR',serif`);

        
        const fontSize = customOptions.fontSize || '17';
        const lineHeight = customOptions.lineHeight || '1.8';
        const pageWidth = customOptions.pageWidth || '800';

        const summaryHtml = summary ? `<p class="summary">${summary}</p>` : '';
        const participantsHtml = participants ? `<p class="participants">${participants}</p>` : '';
        
        const gridColumnWidth = `${Math.ceil(maxDisplayWidth * 0.55)}em`;

        const cssBlock = `${defaultFontImport}${imageCSS}#ccfolia-timeline-wrap{font-family:${fontMain}!important;background:${themeBgColor}!important;color:${themeTextColor}!important;margin:0!important;padding:20px!important;font-size:${fontSize}px!important;}#ccfolia-timeline-wrap *{font-family:inherit!important;word-break:normal!important;text-align:left!important;text-indent:0!important;letter-spacing:normal!important;word-spacing:normal!important;text-shadow:none!important;text-transform:none!important;visibility:visible!important;}#ccfolia-timeline-wrap .log-container{max-width:${pageWidth}px!important;margin:40px auto!important;background-color:${themeContainerColor}!important;border-radius:12px!important;box-shadow:0 8px 32px ${this.hexToRgba(themeAccentColor, 0.4)}!important;padding:30px 40px!important;position:relative!important;z-index:1!important;}#ccfolia-timeline-wrap .header{text-align:center!important;border-bottom:1px solid ${themeAccentColor}!important;padding-bottom:20px!important;margin-bottom:40px!important;}#ccfolia-timeline-wrap .header h1{font-family:${fontSerif}!important;font-size:2.2em!important;margin:0!important;color:${themeTextColor}!important;}#ccfolia-timeline-wrap .header .participants{font-size:1.1em!important;color:#9ca3af!important;margin-top:10px!important;}#ccfolia-timeline-wrap .header .summary{font-size:0.95em!important;color:#9ca3af!important;margin-top:15px!important;line-height:1.6!important;}#ccfolia-timeline-wrap .timeline{position:relative!important;padding:20px 0!important;}#ccfolia-timeline-wrap .timeline::before{content:''!important;position:absolute!important;left:20px!important;top:0!important;bottom:0!important;width:2px!important;background-color:${themeAccentColor}!important;}#ccfolia-timeline-wrap .timeline-entry{position:relative!important;padding:5px 0 25px 55px!important;}#ccfolia-timeline-wrap .timeline-icon{position:absolute!important;left:0!important;top:5px!important;width:40px!important;height:40px!important;border-radius:50%!important;background-color:${themeBgColor}!important;border:2px solid ${themeAccentColor}!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:1.2em!important;color:#9ca3af!important;overflow:hidden!important;}#ccfolia-timeline-wrap .timeline-icon.dice-icon{color:${systemTextColor}!important;border-color:${systemBorderColor}!important;background-color:${systemBgColor}!important;}#ccfolia-timeline-wrap .timeline-icon .profile-image{width:100%!important;height:100%!important;background-size:cover!important;background-position:center top!important;}#ccfolia-timeline-wrap .timeline-entry.system .timeline-content .message{color:${systemTextColor}!important;}#ccfolia-timeline-wrap .timeline-content{position:relative!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message{display:flex!important;align-items:baseline!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-grid{display:grid!important;grid-template-columns:${gridColumnWidth} 1fr!important;column-gap:0.5em!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-grid .speaker-name{text-align:right!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-grid .message-lines{align-self:start!important;color:inherit!important;font-style:normal!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-grid .message-lines>div{margin:0!important;color:inherit!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-compact{display:flex!important;flex-wrap:wrap!important;align-items:baseline!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-compact .sep{flex-shrink:0!important;white-space:pre!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-compact .msg-inline{flex:1!important;min-width:0!important;color:inherit!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-compact .msg-inline .first-line{display:inline!important;}#ccfolia-timeline-wrap .timeline-content .speaker-message-compact .msg-inline>div{display:block!important;margin:0!important;color:inherit!important;}#ccfolia-timeline-wrap .timeline-content .speaker-name{font-weight:700!important;flex-shrink:0!important;white-space:nowrap!important;}#ccfolia-timeline-wrap .timeline-content .message{line-height:${lineHeight}!important;margin:0!important;flex:1!important;}#ccfolia-timeline-wrap .timeline-content .msg-line.first-line{display:inline!important;}#ccfolia-timeline-wrap .timeline-content .msg-line{display:block!important;}#ccfolia-timeline-wrap .narration .timeline-content{font-family:${fontSerif}!important;color:${narrationTextColor}!important;padding:10px!important;background-color:${narrationBgColor}!important;border-radius:6px!important;}#ccfolia-timeline-wrap .narration .timeline-icon{color:#9ca3af!important;}#ccfolia-timeline-wrap .chat-fold details{border:none!important;border-left:3px solid ${themeAccentColor}!important;padding-left:10px!important;}#ccfolia-timeline-wrap .chat-fold summary{list-style:revert!important;display:list-item!important;font-weight:bold!important;color:#9ca3af!important;cursor:pointer!important;padding:5px 0!important;}#ccfolia-timeline-wrap .chat-fold summary::-webkit-details-marker{display:revert!important;}#ccfolia-timeline-wrap .chat-fold .chat-content{padding:10px 0 0 0!important;font-size:0.9em!important;color:#9ca3af!important;}#ccfolia-timeline-wrap .chat-fold .chat-content p{margin:0 0 5px!important;}#ccfolia-timeline-wrap .chat-fold .timeline-icon{color:#adb5bd!important;}#ccfolia-timeline-wrap .dice-box{margin:1em 0!important;padding:10px 14px!important;background-color:${systemBgColor}!important;border:2px solid ${systemBorderColor}!important;border-radius:6px!important;font-family:${fontMain}!important;font-size:0.95em!important;}#ccfolia-timeline-wrap .dice-box-inline{padding:10px 14px!important;background-color:${systemBgColor}!important;border:2px solid ${systemBorderColor}!important;border-radius:6px!important;font-family:${fontMain}!important;font-size:0.95em!important;}#ccfolia-timeline-wrap .dice-box-header{font-weight:700!important;color:${systemTextColor}!important;margin-bottom:6px!important;}#ccfolia-timeline-wrap .dice-box-content{color:${systemTextColor}!important;line-height:1.5!important;}#ccfolia-timeline-wrap .page-footer{text-align:center!important;margin-top:30px!important;padding-top:20px!important;border-top:1px solid ${themeAccentColor}!important;font-family:${fontMain}!important;color:#9ca3af!important;font-size:0.9em!important;}`;

        return `<!DOCTYPE html><html lang="${L.lang}"><head><meta charset="UTF-8"><title>${partTitle}</title></head><body><div id="ccfolia-timeline-wrap">${fontLinkTag}${svgDefs}<style>${cssBlock}</style><div class="log-container"><header class="header"><h1>${headerTitle}</h1>${participantsHtml}${summaryHtml}</header><div class="timeline">${bodyContent}</div>${footerIndicator}</div></div></body></html>`;
    }
}





class ReportGenerator extends BaseGenerator {
    buildChunk(logs, fileName, profileImages, partNum = 1, totalParts = 1, customOptions = {}) {
        const L = outLabels(customOptions); // 產出 HTML 的固定字樣（轉換當下的語言）
        const { title, participants } = this.extractMetadata(fileName, customOptions);
        const speakers = [...new Set(logs.map(log => log.speaker))];
        const hasCustomColors = customOptions.characterColors && Object.keys(customOptions.characterColors).length > 0;
        const speakerColorMap = this.createSpeakerColorMap(speakers, !hasCustomColors, customOptions.characterColors);

        const chatMode = customOptions.chatMode || 'collapse';
        const hideSystem = customOptions.hideSystem || false;

        
        const tabStyles = customOptions.tabStyles || {};

        let bodyContent = '';
        logs.forEach(log => {
            
            const tabStyle = tabStyles[log.tab] || 'none';

            if (tabStyle === 'hide') {
                return; // 略過這則日誌
            }

            
            if (log.type === 'SYSTEM') {
                if (!hideSystem) {
                    const speakerDisplay = log.speaker && log.speaker !== 'system' ? log.speaker : L.system;
                    bodyContent += `<div class="dice-box"><div class="dice-box-header"><svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9C6.67 9 6 8.33 6 7.5S6.67 6 7.5 6 9 6.67 9 7.5 8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-9c-.83 0-1.5-.67-1.5-1.5S15.67 6 16.5 6s1.5.67 1.5 1.5S17.33 9 16.5 9z"/></svg><span>${speakerDisplay}</span></div><div class="dice-box-content">${log.message}</div></div>`;
                }
                return;
            }

            
            if (log.type === 'OOC') {
                if (chatMode !== 'hide') {
                    const colorValue = speakerColorMap[log.speaker] || '';
                    if (hasCustomColors) {
                        bodyContent += `<div class="log-entry chat-note"><p><strong>[${L.chatTag}]</strong> <strong style="${colorValue}">${log.speaker}:</strong> ${log.message}</p></div>`;
                    } else {
                        bodyContent += `<div class="log-entry chat-note"><p><strong>[${L.chatTag}]</strong> <strong class="${colorValue}">${log.speaker}:</strong> ${log.message}</p></div>`;
                    }
                }
                return;
            }

            if (log.type === 'NARRATION') {
                bodyContent += `<div class="log-entry narration-block"><p>${log.message.split('|||').join('<br>')}</p></div>`;
            } else {
                
                const colorValue = speakerColorMap[log.speaker] || '';
                const messageLines = log.message.split('|||');
                const allLines = messageLines.map((line, index) =>
                    index === 0 ? `<div class="msg-line first-line">${line}</div>` : `<div class="msg-line">${line}</div>`
                ).join('');

                const wrapStyle = (customOptions.longNameWrap && log.speaker.length > 10) ? 'white-space:normal;word-break:keep-all;overflow-wrap:break-word;' : '';
                const combinedStyle = `${wrapStyle}${colorValue}`;

                if (hasCustomColors) {
                    bodyContent += `<div class="log-entry"><span class="speaker" style="${combinedStyle}">${log.speaker}:</span> <div class="message">${allLines}</div></div>`;
                } else {
                    bodyContent += `<div class="log-entry"><span class="speaker ${colorValue}" style="${wrapStyle}">${log.speaker}:</span> <div class="message">${allLines}</div></div>`;
                }
            }
        });

        const partTitle = totalParts > 1 ? `${title} (Part ${partNum})` : title;
        const footerIndicator = totalParts > 1 ? `<footer class="page-footer">Page ${partNum} of ${totalParts}</footer>` : '';
        const stampText = customOptions.stampText || 'CLASSIFIED';

        const customFontImport = this.buildFontImport(customOptions);
        const defaultFontImport = customFontImport || `@import url('https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700&family=Nanum+Gothic+Coding:wght@400;700&display=swap');`;
        const fontTypewriter = this.buildFontFamily(customOptions, `'Nanum Gothic Coding',monospace`);
        const fontSerif = this.buildFontFamily(customOptions, `'Nanum Myeongjo',serif`);

        
        const fontSize = customOptions.fontSize || '16';
        const lineHeight = customOptions.lineHeight || '1.9';
        const pageWidth = customOptions.pageWidth || '850';

        
        const systemBgColor = customOptions.systemBgColor || '#2a0a0a';
        const systemBorderColor = customOptions.systemBorderColor || '#7f1d1d';
        const systemTextColor = customOptions.systemTextColor || '#1a1a1a';

        
        const themeBgColor = customOptions.themeBgColor || '#0a0a0a';
        const themeContainerColor = customOptions.themeContainerColor || '#1e1e1e';
        const themeTextColor = customOptions.themeTextColor || '#e5e7eb';
        const themeAccentColor = customOptions.themeAccentColor || '#7f1d1d';

        const participantsInfo = participants ? `<span><strong>SUBJECTS:</strong> ${participants}</span>` : '';

        return `<!DOCTYPE html><html lang="${L.lang}"><head><meta charset="UTF-8"><title>${partTitle}</title><style>${defaultFontImport}:root{--bg-color:${themeBgColor};--paper-color:${themeContainerColor};--main-text-color:${themeTextColor};--secondary-text-color:#9ca3af;--stamp-color:${themeAccentColor};--system-bg-color:${systemBgColor};--system-border-color:${systemBorderColor};--system-text-color:${systemTextColor};--font-typewriter:${fontTypewriter};--font-serif:${fontSerif};}body{font-family:var(--font-typewriter);background:${themeBgColor};color:var(--main-text-color);margin:0;padding:20px;font-size:${fontSize}px;line-height:${lineHeight};}.log-container{max-width:${pageWidth}px;margin:40px auto;background-color:var(--paper-color);box-shadow:0 8px 32px ${this.hexToRgba(themeAccentColor, 0.4)};padding:40px 50px;border:1px solid ${themeAccentColor};}.file-header{border:2px solid var(--main-text-color);padding:15px;margin-bottom:40px;position:relative;}.file-header h1{font-family:var(--font-typewriter);font-size:1.8em;text-align:center;letter-spacing:2px;margin:0;border-bottom:1px solid var(--main-text-color);padding-bottom:10px;}.file-header .info-grid{display:grid;grid-template-columns:1fr 1fr;margin-top:10px;font-size:0.9em;gap: 5px 10px;}.file-header .stamp{position:absolute;top:-15px;left:15px;font-family:var(--font-serif);font-size:1.5em;font-weight:700;color:var(--stamp-color);border:3px solid var(--stamp-color);padding:2px 8px;transform:rotate(-10deg);}.log-entry{display:flex;align-items:baseline;margin-bottom:1.2em;}.log-entry .speaker{font-weight:700;flex-shrink:0;}.log-entry .message{flex:1;}.log-entry .msg-line.first-line{display:inline;}.log-entry .msg-line{display:block;}.speaker-color-1{color:#B71C1C;}.speaker-color-2{color:#0D47A1;}.speaker-color-3{color:#004D40;}.speaker-color-4{color:#4A148C;}.speaker-color-5{color:#33691E;}.narration-block{padding:15px;background-color:#2a2a2a;border-left:3px solid var(--stamp-color);margin:2em 0;}.narration-block p {margin: 0;}.dice-box{margin:1em 0;padding:10px 14px;background-color:var(--system-bg-color);border:2px solid var(--system-border-color);border-radius:6px;font-family:var(--font-typewriter);font-size:0.95em;}.dice-box-header{font-weight:700;color:var(--system-text-color);margin-bottom:6px;}.dice-box-content{color:var(--system-text-color);line-height:1.5;}.system-note{text-align:center;margin:2em 0;}.system-note .stamp-box{display:inline-block;border:2px solid var(--system-border-color);color:var(--system-text-color);background-color:var(--system-bg-color);padding:8px 15px;font-weight:700;font-family:var(--font-serif);}.chat-note{font-size:0.9em;color:var(--secondary-text-color);padding:10px;border:1px dashed var(--stamp-color);background-color:#2a2a2a;}.chat-note p{margin:0 0 5px;}.page-footer{text-align:center;margin:top:40px;padding-top:20px;border-top:1px solid var(--stamp-color);font-family:var(--font-typewriter);color:var(--secondary-text-color);font-size:0.9em;}</style></head><body><div class="log-container"><header class="file-header"><div class="stamp">${stampText}</div><h1>INCIDENT REPORT #${partNum}</h1><div class="info-grid"><span><strong>CASE FILE:</strong> ${title.replace(/\s/g, '_')}</span><span><strong>DATE:</strong> ${new Date().toLocaleDateString(L.dateLocale)}</span>${participantsInfo}<span><strong>HANDLER:</strong> GM</span></div></header>${bodyContent}${footerIndicator}</div></body></html>`;
    }
}





class OriginalGenerator extends BaseGenerator {
    buildChunk(logs, fileName, profileImages, partNum = 1, totalParts = 1, customOptions = {}) {
        const L = outLabels(customOptions); // 產出 HTML 的固定字樣（轉換當下的語言）
        
        const illustrations = customOptions.illustrations || [];
        logs = this.insertIllustrationsIntoLogs(logs, illustrations, customOptions.logNumberOffset || 0);

        const { title, participants, summary } = this.extractMetadata(fileName, customOptions);
        const speakers = [...new Set(logs.filter(log => log.type === 'DIALOGUE' && log.speaker).map(log => log.speaker))];
        const speakerColorMap = this.createSpeakerColorMap(speakers, false, customOptions.characterColors);

        const chatMode = customOptions.chatMode || 'collapse';
        const showChatCount = customOptions.showChatCount !== false;
        const hideSystem = customOptions.hideSystem || false;
        const tabStyles = customOptions.tabStyles || {};
        const tabColors = customOptions.tabColors || {};
        const enableTabColors = customOptions.enableTabColors || false;

        
        
        const narrationMode = customOptions.narrationDisplayMode || 'highlight';
        const narrationAlign = customOptions.narrationCenter ? 'center' : 'left';

        
        const messageImages = customOptions.messageImages || {};
        const { css: imageCSS, imageMap } = this.buildImageCSS(profileImages, messageImages);

        let bodyContent = '';
        let chatBuffer = [];

        const flushChatBuffer = () => {
            if (chatBuffer.length > 0 && chatMode !== 'hide') {
                if (chatMode === 'collapse') {
                    const summaryText = showChatCount ? L.chatFoldCount(chatBuffer.length) : L.chatFold;
                    const firstOocTab = chatBuffer[0]?.tab;
                    const summaryTextColor = enableTabColors && firstOocTab && tabColors[firstOocTab]?.textColor
                        ? ` style="color: ${tabColors[firstOocTab].textColor};"` : '';
                    bodyContent += `<div class="chat-fold-container"><details><summary class="chat-fold-summary"${summaryTextColor}>${summaryText}</summary><div class="chat-fold-content">`;
                    chatBuffer.forEach(log => {
                        const tabStyle = tabStyles[log.tab] || 'none';
                        const tabLabel = tabStyle === 'label' && log.tab ? `<span class="tab-label">[${log.tab}]</span>` : '';
                        
                        const tabColor = enableTabColors && tabColors[log.tab] ? tabColors[log.tab] : null;
                        let itemStyleParts = [];
                        
                        if (tabColor?.bgColor && tabColor.bgColor !== 'transparent') itemStyleParts.push(`background-color: ${tabColor.bgColor} !important`);
                        const itemBgStyle = itemStyleParts.length ? ` style="${itemStyleParts.join(';')};"` : '';
                        const msgTextStyle = tabColor?.textColor ? ` style="--ccf-msg-color: ${tabColor.textColor};"` : '';
                        const chatFallbackSvg = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:40px;height:40px;color:#9ca3af;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                        const profileHtml = this.buildProfileImageHtml(profileImages[log.speaker], log.speaker, imageMap, chatFallbackSvg);
                        bodyContent += `<div class="message-item chat"${itemBgStyle}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name" style="${speakerColorMap[log.speaker] || ''}">${log.speaker}</span>${tabLabel}</div><div class="message-text"${msgTextStyle}>${log.message}</div></div></div>`;
                    });
                    bodyContent += `</div></details></div>`;
                } else if (chatMode === 'show') {
                    chatBuffer.forEach(log => {
                        const tabStyle = tabStyles[log.tab] || 'none';
                        const tabLabel = tabStyle === 'label' && log.tab ? `<span class="tab-label">[${log.tab}]</span>` : '';
                        
                        const tabColor = enableTabColors && tabColors[log.tab] ? tabColors[log.tab] : null;
                        let itemStyleParts = [];
                        
                        if (tabColor?.bgColor && tabColor.bgColor !== 'transparent') itemStyleParts.push(`background-color: ${tabColor.bgColor} !important`);
                        const itemBgStyle = itemStyleParts.length ? ` style="${itemStyleParts.join(';')};"` : '';
                        const msgTextStyle = tabColor?.textColor ? ` style="--ccf-msg-color: ${tabColor.textColor};"` : '';
                        const chatFallbackSvg = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:40px;height:40px;color:#9ca3af;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                        const profileHtml = this.buildProfileImageHtml(profileImages[log.speaker], log.speaker, imageMap, chatFallbackSvg);
                        bodyContent += `<div class="message-item chat"${itemBgStyle}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name" style="${speakerColorMap[log.speaker] || ''}">${log.speaker}</span>${tabLabel}</div><div class="message-text"${msgTextStyle}>${log.message}</div></div></div>`;
                    });
                }
                chatBuffer = [];
            }
        };

        
        
        let narrationBuffer = [];
        let narrationHead = null;
        const flushNarrationBlock = () => {
            if (narrationBuffer.length === 0) return;
            const head = narrationHead;
            const tabColor = enableTabColors && tabColors[head.tab] ? tabColors[head.tab] : null;
            const bgStyle = (tabColor?.bgColor && tabColor.bgColor !== 'transparent')
                ? ` style="background-color: ${tabColor.bgColor} !important;"` : '';
            const textStyle = tabColor?.textColor ? ` style="--ccf-msg-color: ${tabColor.textColor};"` : '';
            const nameColor = customOptions.characterColors?.[head.speaker];
            const nameStyle = nameColor ? ` style="--ccf-gm-color: ${nameColor};"` : '';
            bodyContent += `<div class="message-item narration"${bgStyle}><div class="profile-img"></div>`
                + `<div class="message-content"><div class="message-header">`
                + `<span class="speaker-name gm-name"${nameStyle}>${head.speaker}</span></div>`
                + `<div class="message-text"${textStyle}>${narrationBuffer.join('')}</div></div></div>`;
            narrationBuffer = [];
            narrationHead = null;
        };

        logs.forEach(log => {
            
            if (log.type === 'ILLUSTRATION') {
                flushNarrationBlock();
                flushChatBuffer();
                bodyContent += this.buildIllustrationHtml(log.imageDataUrl, log.size, log.align, L.illustrationAlt);
                return;
            }

            
            const tabStyle = tabStyles[log.tab] || 'none';

            
            if (tabStyle === 'hide') {
                return;
            }

            
            if (log.type === 'SYSTEM') {
                flushNarrationBlock();
                flushChatBuffer();
                if (!hideSystem) {
                    const speakerDisplay = log.speaker && log.speaker !== 'system' ? log.speaker : L.system;
                    const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';
                    bodyContent += `<div class="message-item system"${logNumAttr}><div class="profile-img"><div class="system-icon">🎲</div></div><div class="message-content"><div class="message-header"><span class="speaker-name system-name">${speakerDisplay}</span></div><div class="message-text system-text">${log.message}</div></div></div>`;
                }
                return;
            }

            
            if (log.type === 'OOC') {
                flushNarrationBlock();
                chatBuffer.push(log);
                return;
            }

            flushChatBuffer();

            
            let tabLabel = '';
            if (tabStyle === 'label' && log.tab) {
                let tabLabelStyle = '';
                if (enableTabColors && tabColors[log.tab]) {
                    const color = tabColors[log.tab].textColor || '#9ca3af';
                    tabLabelStyle = `style="color: ${color};"`;
                }
                tabLabel = `<span class="tab-label" ${tabLabelStyle}>[${log.tab}]</span>`;
            }
            

            
            const logTabColor = enableTabColors && tabColors[log.tab] ? tabColors[log.tab] : null;
            let itemBgStyle = '';
            if (logTabColor?.bgColor && logTabColor.bgColor !== 'transparent') {
                
                itemBgStyle = ` style="background-color: ${logTabColor.bgColor} !important;"`;
            }
            const msgTextStyle = logTabColor?.textColor ? ` style="--ccf-msg-color: ${logTabColor.textColor};"` : '';
            const speakerCustomColor = customOptions.characterColors?.[log.speaker];
            const gmNameStyle = speakerCustomColor ? ` style="--ccf-gm-color: ${speakerCustomColor};"` : '';

            
            if (tabStyle === 'system') {
                flushNarrationBlock();
                const speakerDisplay = log.speaker || L.notice;
                bodyContent += `<div class="message-item system"><div class="profile-img"><div class="system-icon">📌</div></div><div class="message-content"><div class="message-header"><span class="speaker-name system-name">${speakerDisplay}</span></div><div class="message-text system-text">${log.message}</div></div></div>`;
                return;
            }

            
            const subNarrators = customOptions.subNarrators || [];
            const subNarratorConfig = subNarrators.find(n => n.speaker === log.speaker);

            
            if (subNarratorConfig) {
                flushNarrationBlock();
                const useLogImages = customOptions.useLogImages || false;
                const firstImageUrl = log.imageUrls?.[0] || log.imageUrl;
                const messageImageUrl = useLogImages && firstImageUrl && messageImages[firstImageUrl];
                const profileImgSrc = messageImageUrl || profileImages[log.speaker];
                const fallbackSvg = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:40px;height:40px;color:#fbbf24;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                const profileHtml = this.buildProfileImageHtml(profileImgSrc, log.speaker, imageMap, fallbackSvg);
                const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';

                switch (subNarratorConfig.style) {
                    case 'italic-narration':
                        bodyContent += `<div class="message-item narration"${itemBgStyle}${logNumAttr}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name gm-name"${gmNameStyle}>${log.speaker}</span>${tabLabel}</div><div class="message-text narration-text"${msgTextStyle}>${log.message.split('|||').map(line => `<div>${line}</div>`).join('')}</div></div></div>`;
                        break;
                    case 'normal-narration':
                        bodyContent += `<div class="message-item narration"${itemBgStyle}${logNumAttr}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name gm-name"${gmNameStyle}>${log.speaker}</span>${tabLabel}</div><div class="message-text"${msgTextStyle}>${log.message.split('|||').map(line => `<div>${line}</div>`).join('')}</div></div></div>`;
                        break;
                    case 'italic-dialogue':
                        const messageLines1 = log.message.split('|||');
                        const messageHtml1 = messageLines1.map(line => `<div style="font-style:italic;">${line}</div>`).join('');
                        const wrapStyle1 = (customOptions.longNameWrap && log.speaker.length > 10) ? 'white-space:normal;word-break:keep-all;overflow-wrap:break-word;' : '';
                        const speakerColor1 = speakerColorMap[log.speaker] || (speakerCustomColor ? 'color: ' + speakerCustomColor + ';' : '');
                        const combinedStyle1 = `${wrapStyle1}${speakerColor1}`;
                        bodyContent += `<div class="message-item dialogue"${itemBgStyle}${logNumAttr}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name" style="${combinedStyle1}">${log.speaker}</span>${tabLabel}</div><div class="message-text"${msgTextStyle}>${messageHtml1}</div></div></div>`;
                        break;
                    case 'colored-narration':
                        const customColor = subNarratorConfig.color || '#9ca3af';
                        const narColor = logTabColor?.textColor || customColor;
                        bodyContent += `<div class="message-item narration"${itemBgStyle}${logNumAttr}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name gm-name"${gmNameStyle}>${log.speaker}</span>${tabLabel}</div><div class="message-text" style="--ccf-msg-color: ${narColor};">${log.message.split('|||').map(line => `<div>${line}</div>`).join('')}</div></div></div>`;
                        break;
                    default:
                        bodyContent += `<div class="message-item narration"${itemBgStyle}${logNumAttr}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name gm-name"${gmNameStyle}>${log.speaker}</span>${tabLabel}</div><div class="message-text"${msgTextStyle}>${log.message.split('|||').map(line => `<div>${line}</div>`).join('')}</div></div></div>`;
                }
                return;
            }

            
            if (log.type === 'NARRATION') {
                
                
                if (narrationMode === 'block') {
                    if (narrationHead && (narrationHead.speaker !== log.speaker || narrationHead.tab !== log.tab)) {
                        flushNarrationBlock();
                    }
                    if (!narrationHead) narrationHead = log;
                    const numAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';
                    narrationBuffer.push(log.message.split('|||')
                        .map((line, i) => `<div${i === 0 ? numAttr : ''}>${line}</div>`).join(''));
                    return;
                }
                const useLogImages = customOptions.useLogImages || false;
                const firstImageUrl = log.imageUrls?.[0] || log.imageUrl;
                const messageImageUrl = useLogImages && firstImageUrl && messageImages[firstImageUrl];
                const profileImgSrc = messageImageUrl || profileImages[log.speaker];
                const fallbackSvg = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:40px;height:40px;color:#fbbf24;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                const profileHtml = this.buildProfileImageHtml(profileImgSrc, log.speaker, imageMap, fallbackSvg);
                const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';
                bodyContent += `<div class="message-item narration"${itemBgStyle}${logNumAttr}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name gm-name"${gmNameStyle}>${log.speaker}</span>${tabLabel}</div><div class="message-text"${msgTextStyle}>${log.message.split('|||').map(line => `<div>${line}</div>`).join('')}</div></div></div>`;
            } else {
                
                flushNarrationBlock();
                const useLogImages = customOptions.useLogImages || false;
                const firstImageUrl = log.imageUrls?.[0] || log.imageUrl;
                const messageImageUrl = useLogImages && firstImageUrl && messageImages[firstImageUrl];
                const profileImgSrc = messageImageUrl || profileImages[log.speaker];
                const fallbackSvg = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:40px;height:40px;color:#9ca3af;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                const profileHtml = this.buildProfileImageHtml(profileImgSrc, log.speaker, imageMap, fallbackSvg);
                const messageLines = log.message.split('|||');
                const messageHtml = messageLines.map(line => `<div>${line}</div>`).join('');

                const wrapStyle = (customOptions.longNameWrap && log.speaker.length > 10) ? 'white-space:normal;word-break:keep-all;overflow-wrap:break-word;' : '';
                const combinedStyle = `${wrapStyle}${speakerColorMap[log.speaker] || ''}`;
                const logNumAttr = log.logNumber ? ` data-log-num="${log.logNumber}"` : '';
                bodyContent += `<div class="message-item dialogue"${itemBgStyle}${logNumAttr}><div class="profile-img">${profileHtml}</div><div class="message-content"><div class="message-header"><span class="speaker-name" style="${combinedStyle}">${log.speaker}</span>${tabLabel}</div><div class="message-text"${msgTextStyle}>${messageHtml}</div></div></div>`;
            }
        });
        flushNarrationBlock();
        flushChatBuffer();

        const partTitle = totalParts > 1 ? `${title} (Part ${partNum})` : title;
        const headerTitle = totalParts > 1 ? `${title} #${partNum}` : title;
        const footerIndicator = totalParts > 1 ? `<div class="page-footer">Page ${partNum} of ${totalParts}</div>` : '';

        const customFontImport = this.buildFontImport(customOptions);
        const rawFontImport = customFontImport || `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');`;
        const fontLinkTag = this.buildFontLinkTag(rawFontImport);
        const defaultFontImport = this.buildFontStyleContent(rawFontImport);
        const fontMain = this.buildFontFamily(customOptions, `'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`);

        
        const fontSize = customOptions.fontSize || '15';
        const lineHeight = customOptions.lineHeight || '1.6';
        const pageWidth = customOptions.pageWidth || '900';

        
        const systemBgColor = customOptions.systemBgColor || '#f0f9ff';
        const systemBorderColor = customOptions.systemBorderColor || '#0ea5e9';
        const systemTextColor = customOptions.systemTextColor || '#075985';

        
        const narrationBgColor = customOptions.narrationBgColor || '#2a2a2a';
        const narrationTextColor = customOptions.narrationTextColor || '#9ca3af';


        
        const themeBgColor = customOptions.themeBgColor || '#1e1e1e';
        const themeContainerColor = customOptions.themeContainerColor || '#2a2a2a';
        const themeTextColor = customOptions.themeTextColor || '#e5e7eb';
        const themeAccentColor = customOptions.themeAccentColor || '#60a5fa';

        const summaryHtml = summary ? `<p class="summary">${summary}</p>` : '';
        const participantsHtml = participants ? `<p class="participants">${participants}</p>` : '';

        
        
        let narrationCss = '';
        if (narrationMode === 'highlight') {
            narrationCss = `
        #ccfolia-original-wrap .message-item.narration {
            background-color: var(--narration-bg-color) !important;
        }

        #ccfolia-original-wrap .message-item.narration .message-text {
            color: var(--ccf-msg-color, var(--narration-text-color)) !important;
        }`;
        } else if (narrationMode === 'block') {
            
            
            narrationCss = `
        #ccfolia-original-wrap .message-item.narration {
            display: block !important;
            margin: 14px 24px !important;
            padding: 16px 18px !important;
            background-color: var(--narration-bg-color) !important;
            border: 1px solid ${this.hexToRgba(narrationTextColor, 0.25)} !important;
            border-radius: 6px !important;
        }

        #ccfolia-original-wrap .message-item.narration .profile-img { display: none !important; }
        #ccfolia-original-wrap .message-item.narration .message-header { display: none !important; }

        #ccfolia-original-wrap .message-item.narration .message-text {
            color: var(--ccf-msg-color, var(--narration-text-color)) !important;
        }

        /* 基準線直接對所有元素設定 text-align，所以內層的每一行（<div>）也要一起指定。
           只設在父層的話是繼承值，會輸給基準線的直接宣告。 */
        #ccfolia-original-wrap .message-item.narration .message-text,
        #ccfolia-original-wrap .message-item.narration .message-text * {
            text-align: ${narrationAlign} !important;
        }`;
        }

        const cssBlock = `
        ${defaultFontImport}
        ${imageCSS}

        #ccfolia-original-wrap {
            --bg-color: ${themeBgColor};
            --container-color: ${themeContainerColor};
            --text-color: ${themeTextColor};
            --accent-color: ${themeAccentColor};
            --border-color: rgba(255, 255, 255, 0.1);
            --system-bg-color: ${systemBgColor};
            --system-border-color: ${systemBorderColor};
            --system-text-color: ${systemTextColor};
            --narration-bg-color: ${narrationBgColor};
            --narration-text-color: ${narrationTextColor};
            --font-main: ${fontMain};
            font-family: var(--font-main) !important;
            background-color: var(--bg-color) !important;
            color: var(--text-color) !important;
            font-size: ${fontSize}px !important;
            line-height: ${lineHeight} !important;
            display: block !important;
        }

        #ccfolia-original-wrap * {
            margin: 0;
            padding: 0;
            box-sizing: border-box !important;
            font-family: inherit !important;
            word-break: normal !important;
            position: static;
            top: auto;
            right: auto;
            bottom: auto;
            left: auto;
            float: none;
            clear: none;
            transform: none;
            z-index: auto;
            border: 0;
            border-radius: 0;
            box-shadow: none;
            object-fit: fill;
        }

        /* 文字相關的基準線。
           權重是 (1,0,0)，部落格面板的 class 規則 (0,1,0) 就算加了 !important 也贏不了這裡，
           而本檔其他規則（1,1,0 以上）全都能蓋過它。
           不用手動維護 class 清單，所以選項再多也不會漏。
           font-style／text-decoration 為了不抹掉日誌本文裡的 <i>、<u>，
           只在下面承載文字的元素上另外設定。 */
        #ccfolia-original-wrap * {
            text-align: left !important;
            text-indent: 0 !important;
            letter-spacing: normal !important;
            word-spacing: normal !important;
            text-shadow: none !important;
            text-transform: none !important;
            visibility: visible !important;
        }

        #ccfolia-original-wrap .message-text,
        #ccfolia-original-wrap .speaker-name,
        #ccfolia-original-wrap .tab-label,
        #ccfolia-original-wrap .chat-fold-summary {
            font-style: normal !important;
            text-decoration: none !important;
        }

        /* 外部面板用了相同的 class 名稱（.profile-img 等）時，避免互相干擾 */
        #ccfolia-original-wrap .log-container,
        #ccfolia-original-wrap .header,
        #ccfolia-original-wrap .messages-container,
        #ccfolia-original-wrap .message-item,
        #ccfolia-original-wrap .profile-img,
        #ccfolia-original-wrap .system-icon,
        #ccfolia-original-wrap .message-content,
        #ccfolia-original-wrap .message-header,
        #ccfolia-original-wrap .speaker-name,
        #ccfolia-original-wrap .tab-label,
        #ccfolia-original-wrap .chat-fold-container,
        #ccfolia-original-wrap .chat-fold-summary,
        #ccfolia-original-wrap .chat-fold-content,
        #ccfolia-original-wrap .illustration-container,
        #ccfolia-original-wrap .page-footer {
            position: static !important;
            top: auto !important;
            right: auto !important;
            bottom: auto !important;
            left: auto !important;
            float: none !important;
            clear: none !important;
            transform: none !important;
            z-index: auto !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: none !important;
            object-fit: fill !important;
            max-width: none !important;
            min-width: 0 !important;
            max-height: none !important;
            min-height: 0 !important;
        }

        #ccfolia-original-wrap .log-container {
            max-width: ${pageWidth}px !important;
            margin: 0 auto !important;
            background-color: var(--container-color) !important;
            position: relative !important;
            z-index: 1 !important;
        }

        #ccfolia-original-wrap .header {
            padding: 20px 24px !important;
            border-bottom: 1px solid var(--border-color) !important;
            background-color: rgba(0, 0, 0, 0.2) !important;
        }

        #ccfolia-original-wrap .header h1 {
            font-size: 1.5em !important;
            font-weight: 700 !important;
            margin-bottom: 8px !important;
            color: var(--accent-color) !important;
        }

        #ccfolia-original-wrap .header .participants {
            font-size: 0.9em !important;
            color: #9ca3af !important;
        }

        #ccfolia-original-wrap .header .summary {
            font-size: 0.85em !important;
            color: #9ca3af !important;
            margin-top: 8px !important;
            line-height: 1.5 !important;
        }

        #ccfolia-original-wrap .messages-container {
            padding: 0;
        }

        #ccfolia-original-wrap .message-item {
            display: flex !important;
            padding: 16px 24px !important;
            border-bottom: 1px solid var(--border-color) !important;
            transition: background-color 0.15s;
        }

        #ccfolia-original-wrap .message-item:hover {
            background-color: rgba(255, 255, 255, 0.03) !important;
        }

        #ccfolia-original-wrap .profile-img {
            flex-shrink: 0 !important;
            width: 40px !important;
            height: 40px !important;
            margin-right: 12px !important;
        }

        #ccfolia-original-wrap .profile-img > div {
            width: 100% !important;
            height: 100% !important;
            border-radius: 50% !important;
            background-size: cover !important;
            background-position: center top !important;
        }

        #ccfolia-original-wrap .system-icon {
            width: 40px !important;
            height: 40px !important;
            border-radius: 50% !important;
            background-color: rgba(96, 165, 250, 0.2) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 20px !important;
        }

        #ccfolia-original-wrap .message-content {
            flex: 1 !important;
            min-width: 0 !important;
        }

        #ccfolia-original-wrap .message-header {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin-bottom: 4px !important;
        }

        #ccfolia-original-wrap .speaker-name {
            font-weight: 700 !important;
            font-size: 0.95em !important;
        }

        #ccfolia-original-wrap .speaker-name.system-name {
            color: var(--system-text-color) !important;
        }

        #ccfolia-original-wrap .speaker-name.gm-name {
            color: var(--ccf-gm-color, #fbbf24) !important;
        }

        #ccfolia-original-wrap .tab-label {
            font-size: 0.8em !important;
            color: #9ca3af !important;
        }

        #ccfolia-original-wrap .message-text {
            color: var(--ccf-msg-color, var(--text-color)) !important;
            word-wrap: break-word;
        }

        #ccfolia-original-wrap .message-text > div {
            margin: 2px 0;
        }

        #ccfolia-original-wrap .message-text.system-text {
            color: var(--system-text-color) !important;
            background-color: var(--system-bg-color) !important;
            padding: 8px 12px;
            border-radius: 6px;
            border-left: 3px solid var(--system-border-color);
            font-size: 0.9em;
        }

        #ccfolia-original-wrap .message-text.narration-text {
            /* 上面的基準線把 font-style 固定成 normal，這裡再翻回來 */
            font-style: italic !important;
            color: var(--ccf-msg-color, #d1d5db) !important;
        }

        /* 指定為旁白角色的發言者那幾行（依顯示方式而不同） */${narrationCss}

        /* 摺疊閒聊 */
        #ccfolia-original-wrap .chat-fold-container {
            padding: 12px 24px;
            border-bottom: 1px solid var(--border-color) !important;
            background-color: rgba(0, 0, 0, 0.2) !important;
        }

        #ccfolia-original-wrap .chat-fold-container details {
            cursor: pointer;
        }

        #ccfolia-original-wrap .chat-fold-summary {
            font-size: 0.9em;
            color: #9ca3af;
            font-weight: 600;
            padding: 4px 0;
            cursor: pointer;
            user-select: none;
            list-style: revert !important;
            display: list-item !important;
        }

        #ccfolia-original-wrap .chat-fold-summary::-webkit-details-marker {
            display: revert !important;
        }

        #ccfolia-original-wrap .chat-fold-summary:hover {
            color: #d1d5db;
        }

        #ccfolia-original-wrap .chat-fold-content {
            margin-top: 8px;
        }

        #ccfolia-original-wrap .chat-fold-content .message-item {
            padding: 12px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
        }

        #ccfolia-original-wrap .chat-fold-content .message-item:last-child {
            border-bottom: none !important;
        }

        /* 閒聊預設淡一點；但若用分頁顏色指定了文字色，就照那個顏色 */
        #ccfolia-original-wrap .message-item.chat .message-text {
            color: var(--ccf-msg-color, #d1d5db) !important;
            opacity: 0.9;
        }

        /* 插圖樣式 */
        #ccfolia-original-wrap .illustration-container {
            padding: 24px;
            border-top: 1px solid var(--border-color) !important;
            border-bottom: 1px solid var(--border-color) !important;
            margin: 0;
        }

        #ccfolia-original-wrap .illustration-container img {
            display: block;
            margin: 0 auto;
        }

        #ccfolia-original-wrap .page-footer {
            text-align: center !important;
            padding: 20px !important;
            color: #9ca3af !important;
            font-size: 0.85em !important;
            border-top: 1px solid var(--border-color) !important;
        }
        `;

        return `<!DOCTYPE html>
<html lang="${L.lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${partTitle}</title>
</head>
<body>
    <div id="ccfolia-original-wrap">
    ${fontLinkTag}<style>${cssBlock}</style>
    <div class="log-container">
        <header class="header">
            <h1>${headerTitle}</h1>
            ${participantsHtml}
            ${summaryHtml}
        </header>
        <div class="messages-container">
            ${bodyContent}
        </div>
        ${footerIndicator}
    </div>
    </div>
</body>
</html>`;
    }
}



class UIController {
    constructor() {
        this.profileImages = {};
        this.profileImageSources = {}; // 原始圖片來源 { speaker: { type: 'file'|'url'|'external', data: Blob|string } }
        this.characterColors = {};
        this.tabStyleSettings = {};
        this.tabColorSettings = {};
        this.subNarrators = [];
        this.convertedHtmlChunks = [];
        this.fileNameBase = 'session_log';
        this.customTitle = '';
        this.customSubtitle = '';
        this.illustrations = []; // { position: number, imageDataUrl: string }
        this.speakerIdMap = new Map(); // 發言者名稱 <-> 安全 ID 的對照
        this.v2Data = null; // 從新格式（付費 HTML）日誌讀出的資料
    }

    
    getSafeSpeakerId(speaker) {
        if (!this.speakerIdMap.has(speaker)) {
            
            const id = `speaker_${this.speakerIdMap.size}`;
            this.speakerIdMap.set(speaker, id);
        }
        return this.speakerIdMap.get(speaker);
    }

    
    
    escapeAttr(text) {
        return this.escapeHtml(text == null ? '' : String(text))
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getSafeTabId(tab) {
        if (!this.tabIdMap) this.tabIdMap = new Map();
        if (!this.tabIdMap.has(tab)) this.tabIdMap.set(tab, `tab_${this.tabIdMap.size}`);
        return this.tabIdMap.get(tab);
    }

    getSpeakerFromId(speakerId) {
        for (let [speaker, id] of this.speakerIdMap.entries()) {
            if (id === speakerId) return speaker;
        }
        return null;
    }

    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    
    getSafePlaceholder(speaker) {
        if (!speaker || !speaker.trim()) return '?';
        const firstChar = speaker.trim()[0];
        
        if (/[a-zA-Z0-9\uAC00-\uD7A3]/.test(firstChar)) {
            return firstChar;
        }
        return '?';
    }

    
    getImageQualityPreset() {
        const preset = document.getElementById('image-quality-preset')?.value || 'medium';

        if (preset === 'custom') {
            
            const sliderValue = parseInt(document.getElementById('custom-quality-slider')?.value) || 30;
            
            const profileSize = Math.round(64 + (sliderValue / 100) * (300 - 64));
            const expressionSize = Math.round(64 + (sliderValue / 100) * (600 - 64));
            const quality = 0.4 + (sliderValue / 100) * 0.55;
            return {
                profileSize,
                expressionSize,
                quality,
                format: sliderValue > 80 ? 'image/jpeg' : 'image/webp'
            };
        }

        const presets = {
            low: { profileSize: 100, expressionSize: 120, quality: 0.60, format: 'image/webp' },
            medium: { profileSize: 150, expressionSize: 200, quality: 0.75, format: 'image/webp' },
            high: { profileSize: 200, expressionSize: 400, quality: 0.85, format: 'image/jpeg' },
            original: { profileSize: 9999, expressionSize: 9999, quality: 1.0, format: 'image/png' }
        };
        return presets[preset] || presets.medium;
    }

    
    supportsWebP() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    }

    
    getBestImageFormat(preferredFormat) {
        if (preferredFormat === 'image/webp' && this.supportsWebP()) {
            return 'image/webp';
        }
        if (preferredFormat === 'image/png') {
            return 'image/png';
        }
        return 'image/jpeg';
    }

    
    async resizeImageFromDataUrl(dataUrl, maxWidth, maxHeight, quality, formatOverride = null) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onerror = () => reject(new Error(T('err.imageLoad')));
            img.onload = () => {
                try {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth || height > maxHeight) {
                        const aspectRatio = width / height;
                        if (width > height) {
                            width = maxWidth;
                            height = Math.round(width / aspectRatio);
                        } else {
                            height = maxHeight;
                            width = Math.round(height * aspectRatio);
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const preset = this.getImageQualityPreset();
                    const format = this.getBestImageFormat(formatOverride || preset.format);
                    resolve(canvas.toDataURL(format, quality));
                } catch (error) {
                    reject(new Error(T('err.resize', error.message)));
                }
            };
            img.src = dataUrl;
        });
    }

    
    async reprocessAllProfileImages(statusDiv) {
        const sources = Object.entries(this.profileImageSources);
        if (sources.length === 0) return;

        const shouldResize = document.getElementById('resize-profile-images')?.checked ?? true;
        const preset = this.getImageQualityPreset();
        let processed = 0;

        for (const [speaker, source] of sources) {
            try {
                if (statusDiv) {
                    lcSet(statusDiv, 'status.reprocessing', processed + 1, sources.length);
                }

                let imageDataUrl;

                if (source.type === 'external') {
                    
                    processed++;
                    continue;
                }

                if (!shouldResize) {
                    
                    if (source.type === 'dataurl') {
                        imageDataUrl = source.data;
                    } else if (source.type === 'url') {
                        imageDataUrl = await this.loadImageFromUrlAsDataUrl(source.data);
                    }
                } else {
                    
                    if (source.type === 'dataurl') {
                        imageDataUrl = await this.resizeImageFromDataUrl(source.data, preset.profileSize, preset.profileSize, preset.quality);
                    } else if (source.type === 'url') {
                        imageDataUrl = await this.loadAndResizeImageFromUrl(source.data, preset.profileSize, preset.profileSize, preset.quality);
                    }
                }

                if (imageDataUrl) {
                    this.profileImages[speaker] = imageDataUrl;
                    const speakerId = this.getSafeSpeakerId(speaker);
                    const preview = document.getElementById(`preview-${speakerId}`);
                    if (preview) preview.src = imageDataUrl;
                }
            } catch (error) {
                console.warn(T('log.reprocessOne', speaker), error);
            }
            processed++;
        }

        this.updateProfileImageStats();
        if (statusDiv) {
            lcSet(statusDiv, 'status.reprocessed', sources.length);
            setTimeout(() => { lcSet(statusDiv, null); }, 2000);
        }
        console.info(T('log.reprocessed', sources.length, preset.profileSize, Math.round(preset.quality * 100)));
    }

    
    sanitizeFileName(filename) {
        if (!filename) return 'session_log';
        
        
        let sanitized = filename.replace(/[\\/:*?"<>|]/g, '_').trim();
        
        sanitized = sanitized.replace(/_+/g, '_');
        
        sanitized = sanitized.replace(/^_+|_+$/g, '');
        return sanitized || 'session_log';
    }

    
    async fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error(T('err.fileRead')));
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    
    calculateDataUrlSizeKB(dataUrl) {
        if (!dataUrl) return 0;
        
        const base64Length = dataUrl.split(',')[1]?.length || 0;
        const sizeBytes = (base64Length * 3) / 4;
        return Math.round(sizeBytes / 1024);
    }

    
    checkImageSizeWarnings(splitSizeKB) {
        const warnings = [];

        
        Object.entries(this.profileImages).forEach(([speaker, dataUrl]) => {
            const sizeKB = this.calculateDataUrlSizeKB(dataUrl);
            if (sizeKB > splitSizeKB) {
                warnings.push({
                    type: 'profile',
                    name: T('warn.profileItem', speaker),
                    sizeKB: sizeKB
                });
            }
        });

        
        this.illustrations.forEach((ill, index) => {
            if (ill.imageDataUrl) {
                const sizeKB = this.calculateDataUrlSizeKB(ill.imageDataUrl);
                if (sizeKB > splitSizeKB) {
                    warnings.push({
                        type: 'illustration',
                        name: T('warn.illItem', index + 1, ill.position),
                        sizeKB: sizeKB
                    });
                }
            }
        });

        return warnings;
    }

    
    async resizeImage(file, maxWidth = 400, maxHeight = 400, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onerror = () => reject(new Error(T('err.fileRead')));

            reader.onload = (e) => {
                const img = new Image();

                img.onerror = () => reject(new Error(T('err.imageLoad')));

                img.onload = () => {
                    try {
                        
                        let width = img.width;
                        let height = img.height;

                        
                        if (width > maxWidth || height > maxHeight) {
                            const aspectRatio = width / height;
                            if (width > height) {
                                width = maxWidth;
                                height = Math.round(width / aspectRatio);
                            } else {
                                height = maxHeight;
                                width = Math.round(height * aspectRatio);
                            }
                        }

                        
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        
                        const preset = this.getImageQualityPreset();
                        const format = this.getBestImageFormat(preset.format);
                        const dataUrl = canvas.toDataURL(format, quality);

                        const formatName = format.split('/')[1].toUpperCase();
                        console.info(T('log.resized', img.width, img.height, width, height, formatName, Math.round(quality * 100)));
                        resolve(dataUrl);
                    } catch (error) {
                        reject(new Error(T('err.resize', error.message)));
                    }
                };

                img.src = e.target.result;
            };

            reader.readAsDataURL(file);
        });
    }

    
    async loadImageFromUrlAsDataUrl(url) {
        return new Promise(async (resolve, reject) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(T('err.imageFetch', response.status));
                }

                const blob = await response.blob();
                const reader = new FileReader();
                reader.onerror = () => reject(new Error(T('err.fileRead')));
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(blob);
            } catch (error) {
                reject(error);
            }
        });
    }

    async loadAndResizeImageFromUrl(url, maxWidth = 400, maxHeight = 400, quality = 0.85) {
        return new Promise(async (resolve, reject) => {
            try {
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(T('err.imageFetch', response.status));
                }

                const blob = await response.blob();

                
                const img = new Image();
                img.onerror = () => reject(new Error(T('err.imageLoad')));

                img.onload = () => {
                    try {
                        
                        let width = img.width;
                        let height = img.height;

                        
                        if (width > maxWidth || height > maxHeight) {
                            const aspectRatio = width / height;
                            if (width > height) {
                                width = maxWidth;
                                height = Math.round(width / aspectRatio);
                            } else {
                                height = maxHeight;
                                width = Math.round(height * aspectRatio);
                            }
                        }

                        
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        
                        const preset = this.getImageQualityPreset();
                        const format = this.getBestImageFormat(preset.format);
                        const dataUrl = canvas.toDataURL(format, quality);

                        const formatName = format.split('/')[1].toUpperCase();
                        console.info(T('log.resized', img.width, img.height, width, height, formatName, Math.round(quality * 100)));
                        resolve(dataUrl);
                    } catch (error) {
                        reject(new Error(T('err.resize', error.message)));
                    }
                };

                img.src = URL.createObjectURL(blob);
            } catch (error) {
                reject(error);
            }
        });
    }


    
    collectSettings(elements) {
        const colorPresetSelect = document.getElementById('color-preset');
        return {
            style: document.querySelector('input[name="style"]:checked')?.value || 'novel',
            narratorSelect: elements.narratorSelect.value,
            narrationDisplayMode: elements.narrationDisplayModeSelect?.value || 'highlight',
            narrationCenter: elements.narrationCenterCheckbox?.checked || false,
            oocTab: elements.oocTabSelect.value,
            customFontUrl: elements.customFontUrl.value,
            customFontFamily: elements.customFontFamily.value,
            mergeConsecutive: elements.mergeConsecutiveCheckbox.checked,
            fontSize: elements.fontSizeSelect.value,
            lineHeight: elements.lineHeightSelect.value,
            pageWidth: elements.pageWidthSelect.value,
            chatMode: elements.chatModeSelect.value,
            showChatCount: elements.showChatCountCheckbox.checked,
            systemMode: elements.systemModeSelect.value,
            colorPreset: colorPresetSelect?.value || 'black-red',
            themeBgColor: elements.themeBgColorInput.value,
            themeContainerColor: elements.themeContainerColorInput.value,
            themeTextColor: elements.themeTextColorInput.value,
            themeAccentColor: elements.themeAccentColorInput.value,
            systemBgColor: elements.systemBgColorInput.value,
            systemBorderColor: elements.systemBorderColorInput.value,
            systemTextColor: elements.systemTextColorInput.value,
            narrationBgColor: elements.narrationBgColorInput.value,
            narrationTextColor: elements.narrationTextColorInput.value,
            splitMethod: document.querySelector('input[name="split-method"]:checked')?.value || 'none',
            logLimitCount: elements.logLimitCountInput.value,
            logLimitSize: elements.logLimitSizeInput.value,
            logLimitFiles: elements.logLimitFilesInput.value,
            subNarrators: this.subNarrators,
            characterColors: this.characterColors,
            tabStyleSettings: this.tabStyleSettings,
            tabColorSettings: this.tabColorSettings,
            enableTabColors: document.getElementById('enable-tab-colors')?.checked || false,
            novelTypography: elements.novelTypographyToggle.checked,
            longNameWrap: elements.longNameWrapCheckbox?.checked || false,
            dialogueLayoutMode: elements.dialogueLayoutModeSelect?.value || 'grid',
            dialogueSeparatorType: elements.dialogueSeparatorTypeSelect?.value || 'space',
            customSeparatorValue: elements.customSeparatorValueInput?.value || ':',
            showLogNumbers: elements.showLogNumbersCheckbox?.checked ?? true
            
        };
    }

    
    saveSettings(elements) {
        const settings = this.collectSettings(elements);
        try {
            localStorage.setItem('ccfolia-converter-settings', JSON.stringify(settings));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.warn(T('log.quota'));
            } else {
                console.error(T('log.saveFailed'), e);
            }
        }
    }

    
    loadSettings(elements, settingsObj = null) {
        try {
            let settings;
            if (settingsObj) {
                settings = settingsObj;
            } else {
                const saved = localStorage.getItem('ccfolia-converter-settings');
                if (!saved) return;
                try {
                    settings = JSON.parse(saved);
                } catch (parseError) {
                    console.error(T('log.settingsParse'), parseError);
                    console.warn(T('log.settingsUnreadable'));
                    return;
                }
            }

            if (!settings || typeof settings !== 'object') {
                console.warn(T('log.settingsInvalid'));
                return;
            }

            
            try {
                
                if (settings.style) {
                    const styleRadio = document.querySelector(`input[name="style"][value="${settings.style}"]`);
                    if (styleRadio) styleRadio.checked = true;
                }
            } catch (e) { console.warn(T('log.restore.style'), e); }

            try {
                
                if (settings.customFontUrl && elements.customFontUrl)
                    elements.customFontUrl.value = settings.customFontUrl;
                if (settings.customFontFamily && elements.customFontFamily)
                    elements.customFontFamily.value = settings.customFontFamily;
                if (settings.mergeConsecutive !== undefined && elements.mergeConsecutiveCheckbox)
                    elements.mergeConsecutiveCheckbox.checked = settings.mergeConsecutive;
                if (settings.fontSize && elements.fontSizeSelect)
                    elements.fontSizeSelect.value = settings.fontSize;
                if (settings.lineHeight && elements.lineHeightSelect)
                    elements.lineHeightSelect.value = settings.lineHeight;
                if (settings.pageWidth && elements.pageWidthSelect)
                    elements.pageWidthSelect.value = settings.pageWidth;
            } catch (e) { console.warn(T('log.restore.fontLayout'), e); }

            try {
                
                if (settings.chatMode && elements.chatModeSelect)
                    elements.chatModeSelect.value = settings.chatMode;
                if (settings.showChatCount !== undefined && elements.showChatCountCheckbox)
                    elements.showChatCountCheckbox.checked = settings.showChatCount;
                if (settings.systemMode && elements.systemModeSelect)
                    elements.systemModeSelect.value = settings.systemMode;
                if (settings.oocTab !== undefined && elements.oocTabSelect)
                    elements.oocTabSelect.value = settings.oocTab;
                if (settings.narrationDisplayMode !== undefined && elements.narrationDisplayModeSelect) {
                    elements.narrationDisplayModeSelect.value = settings.narrationDisplayMode;
                    
                    elements.narrationDisplayModeSelect.dispatchEvent(new Event('change'));
                }
                if (settings.narrationCenter !== undefined && elements.narrationCenterCheckbox)
                    elements.narrationCenterCheckbox.checked = settings.narrationCenter;
            } catch (e) { console.warn(T('log.restore.display'), e); }

            try {
                
                const colorPresetSelect = document.getElementById('color-preset');
                if (settings.colorPreset && colorPresetSelect) {
                    colorPresetSelect.value = settings.colorPreset;
                    
                    if (settings.colorPreset !== 'custom') {
                        
                        colorPresetSelect.dispatchEvent(new Event('change'));
                    }
                }

                
                if (settings.colorPreset === 'custom') {
                    if (settings.themeBgColor && elements.themeBgColorInput)
                        elements.themeBgColorInput.value = settings.themeBgColor;
                    if (settings.themeContainerColor && elements.themeContainerColorInput)
                        elements.themeContainerColorInput.value = settings.themeContainerColor;
                    if (settings.themeTextColor && elements.themeTextColorInput)
                        elements.themeTextColorInput.value = settings.themeTextColor;
                    if (settings.themeAccentColor && elements.themeAccentColorInput)
                        elements.themeAccentColorInput.value = settings.themeAccentColor;
                    if (settings.systemBgColor && elements.systemBgColorInput)
                        elements.systemBgColorInput.value = settings.systemBgColor;
                    if (settings.systemBorderColor && elements.systemBorderColorInput)
                        elements.systemBorderColorInput.value = settings.systemBorderColor;
                    if (settings.systemTextColor && elements.systemTextColorInput)
                        elements.systemTextColorInput.value = settings.systemTextColor;
                    if (settings.narrationBgColor && elements.narrationBgColorInput)
                        elements.narrationBgColorInput.value = settings.narrationBgColor;
                    if (settings.narrationTextColor && elements.narrationTextColorInput)
                        elements.narrationTextColorInput.value = settings.narrationTextColor;
                }
            } catch (e) { console.warn(T('log.restore.color'), e); }

            try {
                
                if (settings.splitMethod) {
                    const splitRadio = document.querySelector(`input[name="split-method"][value="${settings.splitMethod}"]`);
                    if (splitRadio) splitRadio.checked = true;
                }
                if (settings.logLimitCount && elements.logLimitCountInput)
                    elements.logLimitCountInput.value = settings.logLimitCount;
                if (settings.logLimitSize && elements.logLimitSizeInput)
                    elements.logLimitSizeInput.value = settings.logLimitSize;
                if (settings.logLimitFiles && elements.logLimitFilesInput)
                    elements.logLimitFilesInput.value = settings.logLimitFiles;

                
                if (elements.logLimitCountInput && elements.logLimitSizeInput && elements.logLimitFilesInput) {
                    elements.logLimitCountInput.disabled = settings.splitMethod !== 'count';
                    elements.logLimitSizeInput.disabled = settings.splitMethod !== 'size';
                    elements.logLimitFilesInput.disabled = settings.splitMethod !== 'files';
                }
            } catch (e) { console.warn(T('log.restore.split'), e); }

            try {
                
                if (settings.subNarrators && Array.isArray(settings.subNarrators)) {
                    this.subNarrators = settings.subNarrators;
                }
            } catch (e) { console.warn(T('log.restore.subNarrator'), e); }

            try {
                
                if (settings.characterColors && typeof settings.characterColors === 'object') {
                    this.characterColors = settings.characterColors;
                }
            } catch (e) { console.warn(T('log.restore.charColor'), e); }

            try {
                
                if (settings.tabStyleSettings && typeof settings.tabStyleSettings === 'object') {
                    this.tabStyleSettings = settings.tabStyleSettings;

                    
                    Object.entries(settings.tabStyleSettings).forEach(([tab, style]) => {
                        const checkbox = document.querySelector(
                            `.tab-visibility-checkbox[data-tab="${CSS.escape(tab)}"]`);
                        if (checkbox) {
                            checkbox.checked = (style !== 'hide');
                        }

                        
                        const styleSelect = document.querySelector(`.tab-style-select[data-tab="${CSS.escape(tab)}"]`);
                        if (styleSelect && style !== 'hide') {
                            styleSelect.value = style;
                        }
                    });
                }
            } catch (e) { console.warn(T('log.restore.tabStyle'), e); }

            try {
                
                if (settings.tabColorSettings && typeof settings.tabColorSettings === 'object') {
                    this.tabColorSettings = settings.tabColorSettings;
                }
                const enableTabColorsCheckbox = document.getElementById('enable-tab-colors');
                if (settings.enableTabColors !== undefined && enableTabColorsCheckbox) {
                    enableTabColorsCheckbox.checked = settings.enableTabColors;
                    
                    const tabColorPicker = document.getElementById('tab-color-picker');
                    if (tabColorPicker) {
                        if (settings.enableTabColors) {
                            tabColorPicker.classList.remove('hidden');
                        } else {
                            tabColorPicker.classList.add('hidden');
                        }
                    }
                }
            } catch (e) { console.warn(T('log.restore.tabColor'), e); }

            try {
                
                if (settings.novelTypography !== undefined && elements.novelTypographyToggle) {
                    elements.novelTypographyToggle.checked = settings.novelTypography;
                }
            } catch (e) { console.warn(T('log.restore.typography'), e); }

            try {
                
                if (settings.longNameWrap !== undefined && elements.longNameWrapCheckbox) {
                    elements.longNameWrapCheckbox.checked = settings.longNameWrap;
                }
            } catch (e) { console.warn(T('log.restore.longName'), e); }

            try {
                
                if (settings.dialogueLayoutMode !== undefined && elements.dialogueLayoutModeSelect) {
                    elements.dialogueLayoutModeSelect.value = settings.dialogueLayoutMode;
                    elements.dialogueLayoutModeSelect.dispatchEvent(new Event('change'));
                }
                if (settings.dialogueSeparatorType !== undefined && elements.dialogueSeparatorTypeSelect) {
                    elements.dialogueSeparatorTypeSelect.value = settings.dialogueSeparatorType;
                    elements.dialogueSeparatorTypeSelect.dispatchEvent(new Event('change'));
                }
                if (settings.customSeparatorValue !== undefined && elements.customSeparatorValueInput) {
                    elements.customSeparatorValueInput.value = settings.customSeparatorValue;
                }
            } catch (e) { console.warn(T('log.restore.dialogue'), e); }

            try {
                
                if (settings.showLogNumbers !== undefined && elements.showLogNumbersCheckbox) {
                    elements.showLogNumbersCheckbox.checked = settings.showLogNumbers;
                }
            } catch (e) { console.warn(T('log.restore.logNumbers'), e); }

            

            console.info(T('log.restored'));
        } catch (error) {
            console.error(T('log.restoreError'), error);
            console.warn(T('log.restorePartial'));
        }
    }

    
    exportSettings(elements) {
        const settings = this.collectSettings(elements);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `ccfolia-preset-${timestamp}.json`;

        const jsonString = JSON.stringify(settings, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert(T('alert.exported', filename));
    }

    
    async importSettings(file, elements) {
        try {
            const text = await file.text();

            let settings;
            try {
                settings = JSON.parse(text);
            } catch (parseError) {
                console.error(T('log.jsonParse'), parseError);
                alert(T('alert.badFormat'));
                return;
            }

            if (!settings || typeof settings !== 'object') {
                console.error(T('log.settingsData'), settings);
                alert(T('alert.noData'));
                return;
            }

            
            this.loadSettings(elements, settings);

            try {
                
                const colorPresetSelect = document.getElementById('color-preset');
                if (colorPresetSelect && settings.colorPreset) {
                    colorPresetSelect.dispatchEvent(new Event('change'));
                }
            } catch (e) {
                console.warn(T('log.presetEvent'), e);
            }

            try {
                
                if (elements.logLimitCountInput && elements.logLimitSizeInput && elements.logLimitFilesInput) {
                    const splitMethod = settings.splitMethod || 'none';
                    elements.logLimitCountInput.disabled = splitMethod !== 'count';
                    elements.logLimitSizeInput.disabled = splitMethod !== 'size';
                    elements.logLimitFilesInput.disabled = splitMethod !== 'files';
                }
            } catch (e) {
                console.warn(T('log.splitUpdate'), e);
            }

            try {
                
                this.saveSettings(elements);
            } catch (e) {
                console.warn(T('log.saveFailed'), e);
            }

            console.info(T('log.imported'));
            alert(T('alert.imported'));
        } catch (error) {
            console.error(T('log.importError'), error);
            alert(T('alert.importError'));
        }
    }

    
    /* parts：空值表示清除；否則是一串回傳訊息的函式（各自呼叫 T()），
     * 記下來以便切換語言時用新語言重畫。 */
    showFileNotice(parts) {
        this.fileNoticeParts = (parts && parts.length) ? parts : null;
        this.renderFileNotice();
        if (this.fileNoticeParts) console.warn(this.fileNoticeText());
    }

    fileNoticeText() {
        return (this.fileNoticeParts || []).map(part => part()).join(' ');
    }

    renderFileNotice() {
        const el = document.getElementById('file-notice');
        if (!el) return;
        if (!this.fileNoticeParts) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = this.fileNoticeText();
        el.classList.remove('hidden');
    }

    
    showDetailSections(elements, tabs) {
        elements.characterColorSection.style.display = 'block';
        elements.subNarratorSection.classList.remove('hidden');

        const tabColorSection = document.getElementById('tab-color-section');
        const selectedStyle = document.querySelector('input[name="style"]:checked')?.value || 'novel';

        if (tabs.length > 1) {
            
            elements.tabVisibilitySection.classList.remove('hidden');
            
            if (selectedStyle === 'original') {
                elements.tabStyleSection.classList.remove('hidden');
            } else {
                elements.tabStyleSection.classList.add('hidden');
            }
            if (tabColorSection) tabColorSection.classList.remove('hidden');
        } else {
            
            this.tabColorSettings = {};
            this.tabStyleSettings = {};
            const enableTabColorsCheckbox = document.getElementById('enable-tab-colors');
            if (enableTabColorsCheckbox) enableTabColorsCheckbox.checked = false;
            elements.tabVisibilitySection.classList.add('hidden');
            elements.tabStyleSection.classList.add('hidden');
            if (tabColorSection) tabColorSection.classList.add('hidden');
            console.info(T('log.singleTab'));
        }

        if (selectedStyle === 'timeline' || selectedStyle === 'original') {
            elements.profileImageSection.classList.remove('hidden');
        }
    }

    
    
    

    
    static get DEFAULT_CHANNEL_NAMES() {
        /* 預設的分頁名稱依「載入檔案當下」的語言；載入後就是使用者的資料（可在「分頁名稱」改），
         * 不會跟著之後的語言切換改變。 */
        return { main: T('channel.main'), info: T('channel.info'), other: T('channel.other') };
    }

    
    isAllTabLabel(label) {
        /* 「全部分頁」那個檔案的標籤是 CCFOLIA 介面語言的字樣，屬於解析規則，照原樣比對；
         * 「全部」「所有」是收錄版補上的繁中別名。 */
        return !!label && /^(すべて|全て|전체|全部|所有|all)$/i.test(label.trim());
    }

    
    buildV2Data(parsedFiles) {
        const channelNames = { ...UIController.DEFAULT_CHANNEL_NAMES };
        parsedFiles.forEach(p => {
            if (p.channels.length === 1 && p.tabLabel && !this.isAllTabLabel(p.tabLabel)) {
                channelNames[p.channels[0]] = p.tabLabel;
            }
        });

        
        const multiChannel = parsedFiles.filter(p => p.channels.length > 1)
            .sort((a, b) => b.logs.length - a.logs.length);
        const singleChannel = parsedFiles.filter(p => p.channels.length <= 1);

        const sources = [];
        const covered = new Set();
        if (multiChannel.length > 0) {
            sources.push(multiChannel[0]);
            multiChannel[0].channels.forEach(c => covered.add(c));
        }
        singleChannel.forEach(p => {
            const ch = p.channels[0];
            if (!ch || !covered.has(ch)) {
                sources.push(p);
                if (ch) covered.add(ch);
            }
        });


        
        const hasTime = (log) => log.timestampMs !== null && log.timestampMs !== undefined;
        const merged = [];
        sources.forEach((p, fileIdx) => {
            
            let lastTs = p.logs.find(hasTime)?.timestampMs ?? null;
            p.logs.forEach((log, idx) => {
                if (hasTime(log)) lastTs = log.timestampMs;
                merged.push({ ...log, channelId: log.tab, _ts: lastTs, _f: fileIdx, _i: idx });
            });
        });
        merged.sort((a, b) => {
            if (a._ts !== b._ts) {
                if (a._ts === null) return -1;
                if (b._ts === null) return 1;
                return a._ts - b._ts;
            }
            if (a._f !== b._f) return a._f - b._f;
            return a._i - b._i;
        });

        
        if (!channelNames['']) channelNames[''] = T('channel.none');

        
        merged.forEach(log => { log.tab = channelNames[log.channelId] || log.channelId; });

        
        
        const avatarsOriginal = {};
        const avatarTally = {};
        merged.forEach(log => {
            if (!log.imageUrl) return;
            avatarsOriginal[log.imageUrl] = log.imageUrl;
            if (!log.speaker || log.speaker === 'system') return;
            if (!avatarTally[log.speaker]) avatarTally[log.speaker] = {};
            avatarTally[log.speaker][log.imageUrl] = (avatarTally[log.speaker][log.imageUrl] || 0) + 1;
        });

        
        const mainAvatarsOriginal = {};
        for (const [speaker, tally] of Object.entries(avatarTally)) {
            mainAvatarsOriginal[speaker] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
        }

        
        const speakerColors = {};
        sources.forEach(p => {
            for (const [name, color] of Object.entries(p.speakerColors || {})) {
                if (!speakerColors[name]) speakerColors[name] = color;
            }
        });

        const roomTitle = (sources.find(p => p.roomTitle) || {}).roomTitle || null;

        return {
            logs: merged,
            avatarsOriginal,
            mainAvatarsOriginal,
            
            
            avatars: { ...avatarsOriginal },
            mainAvatars: { ...mainAvatarsOriginal },
            speakerColors,
            channelNames,
            channelIds: [...new Set(merged.map(l => l.channelId))],
            roomTitle,
            sourceCount: sources.length,
            fileCount: parsedFiles.length,
            droppedAllLogFiles: Math.max(0, multiChannel.length - 1)
        };
    }

    
    async resizeV2Avatars(progressEl = null) {
        if (!this.v2Data) return;
        const originals = Object.keys(this.v2Data.avatarsOriginal || {});
        if (originals.length === 0) return;

        const shouldResize = document.getElementById('resize-profile-images')?.checked ?? true;
        const preset = this.getImageQualityPreset();

        if (!shouldResize || preset.profileSize >= 9999) {
            this.v2Data.avatars = { ...this.v2Data.avatarsOriginal };
            this.v2Data.mainAvatars = { ...this.v2Data.mainAvatarsOriginal };
            console.info(T('log.avatarsOriginal'));
        } else {
            
            const format = this.supportsWebP() ? 'image/webp' : 'image/png';
            const map = {};
            let done = 0;
            let failed = 0;

            for (const original of originals) {
                try {
                    map[original] = await this.resizeImageFromDataUrl(
                        original, preset.profileSize, preset.profileSize, preset.quality, format);
                } catch (error) {
                    map[original] = original; // 失敗就直接用原圖
                    failed++;
                }
                done++;
                if (progressEl && (done % 10 === 0 || done === originals.length)) {
                    lcSetChild(progressEl, 'status.optimizingAvatars', done, originals.length);
                }
            }

            this.v2Data.avatars = map;
            const main = {};
            for (const [speaker, original] of Object.entries(this.v2Data.mainAvatarsOriginal)) {
                main[speaker] = map[original] || original;
            }
            this.v2Data.mainAvatars = main;
            if (failed > 0) console.warn(T('log.avatarsFailed', failed));
        }

        
        Object.entries(this.v2Data.mainAvatars).forEach(([speaker, dataUrl]) => {
            if (this.profileImageSources[speaker]) return;
            this.profileImages[speaker] = dataUrl;
            const preview = document.getElementById(`preview-${this.getSafeSpeakerId(speaker)}`);
            if (preview) preview.src = dataUrl;
        });
        this.updateProfileImageStats();

        const totalBytes = Object.values(this.v2Data.avatars)
            .reduce((sum, url) => sum + this.getDataUrlSize(url), 0);
        const originalBytes = Object.keys(this.v2Data.avatarsOriginal)
            .reduce((sum, url) => sum + this.getDataUrlSize(url), 0);
        console.info(T('log.avatarsReady', originals.length,
            this.formatFileSize(originalBytes), this.formatFileSize(totalBytes)));
    }

    
    async addV2Files(files, elements, handlers) {
        if (!this.v2Data || !this.v2ParsedFiles) return;
        this.showFileNotice('');

        const texts = await Promise.all(files.map(f => f.text()));
        const v2Items = files
            .map((file, i) => ({ text: texts[i], name: file.name }))
            .filter(item => handlers.detectFormat(item.text) === 'ccfolia-v2');
        if (v2Items.length === 0) {
            this.showFileNotice([() => T('notice.addMismatch')]);
            return;
        }

        const added = v2Items.map(item => ({ ...handlers.parseV2(item.text), fileName: item.name }));
        const signature = (p) => `${[...p.channels].sort().join(',')}|${p.logs.length}`;
        const known = new Set(this.v2ParsedFiles.map(signature));
        const fresh = added.filter(p => !known.has(signature(p)));

        if (fresh.length === 0) {
            this.showFileNotice([() => T('notice.alreadyLoaded')]);
            return;
        }

        
        const styleBackup = { ...this.tabStyleSettings };
        const colorBackup = { ...this.tabColorSettings };
        const charBackup = { ...this.characterColors };

        await this.setupFromV2Files(null, elements, handlers,
            this.v2ParsedFiles.concat(fresh), charBackup);

        const tabs = [...new Set(this.v2Data.logs.map(l => l.tab))];
        this.restoreTabSettings(tabs, styleBackup, colorBackup, elements);
        this.showDetailSections(elements, tabs);

        const skipped = added.length - fresh.length;
        const excluded = texts.length - v2Items.length;
        const parts = [() => T('notice.added', fresh.length)];
        if (skipped > 0) parts.push(() => T('notice.skipped', skipped));
        if (v2Items.length !== texts.length) parts.push(() => T('notice.excluded', excluded));
        if (parts.length > 1) this.showFileNotice(parts);
        console.info(parts.map(part => part()).join(' '));
    }

    
    restoreTabSettings(tabs, styleBackup, colorBackup, elements) {
        this.setupTabStylePicker(tabs, elements.tabStylePicker);
        tabs.forEach(tab => {
            if (styleBackup[tab] === undefined) return;
            this.tabStyleSettings[tab] = styleBackup[tab];
            const select = elements.tabStylePicker.querySelector(
                `.tab-style-select[data-tab="${CSS.escape(tab)}"]`);
            if (select && styleBackup[tab] !== 'hide') select.value = styleBackup[tab];
        });

        this.tabColorSettings = {};
        tabs.forEach(tab => {
            if (colorBackup[tab]) this.tabColorSettings[tab] = colorBackup[tab];
        });
        this.setupTabColorPicker(tabs, document.getElementById('tab-color-picker'));

        
        this.setupTabVisibilityCheckboxes(tabs, elements.tabVisibilityCheckboxes);
    }

    
    updateLoadedFileUI(elements, handlers) {
        const btn = document.getElementById('add-log-file-btn');
        const list = document.getElementById('loaded-file-list');
        if (btn) btn.classList.toggle('hidden', !this.v2Data);
        if (!list) return;

        const files = this.v2ParsedFiles || [];
        if (!this.v2Data || files.length === 0) {
            list.classList.add('hidden');
            list.innerHTML = '';
            return;
        }

        list.classList.remove('hidden');
        list.innerHTML = `<p class="label-description">${lcEsc(T('files.loaded', files.length))}</p>` + files.map((p, i) => {
            const label = p.fileName || (p.tabLabel ? `[${p.tabLabel}]` : T('files.noName'));
            const tabNames = p.channels.map(c => this.v2Data.channelNames[c] || c).join(', ');
            return `
                <div class="flex items-center gap-2 text-xs py-1 px-2 rounded bg-gray-800">
                    <span class="flex-1 truncate" style="color:#d1d5db;">${this.escapeHtml(label)}</span>
                    <span class="text-muted whitespace-nowrap">${T('files.row', p.logs.length, this.escapeHtml(tabNames))}</span>
                    <button type="button" class="remove-log-file-btn px-1.5 text-gray-500 hover:text-red-400 transition-colors"
                            data-index="${i}" title="${this.escapeAttr(T('files.remove'))}">×</button>
                </div>`;
        }).join('');

        list.querySelectorAll('.remove-log-file-btn').forEach(button => {
            button.addEventListener('click', async () => {
                const index = parseInt(button.dataset.index, 10);
                try {
                    await this.removeV2File(index, elements, handlers);
                } catch (error) {
                    console.error(T('log.removeFailed'), error);
                    this.showFileNotice([() => T('notice.removeFailed', error.message || error)]);
                }
            });
        });
    }

    
    resetV2State(elements, handlers) {
        this.v2Data = null;
        this.v2ParsedFiles = null;
        const channelSection = document.getElementById('channel-name-section');
        if (channelSection) channelSection.classList.add('hidden');
        const channelList = document.getElementById('channel-name-list');
        if (channelList) channelList.innerHTML = '';
        this.resetLogImageOption();
        
        if (elements?.logFileInput) elements.logFileInput.value = '';
        this.updateLoadedFileUI(elements, handlers);
    }

    
    async removeV2File(index, elements, handlers) {
        if (!this.v2ParsedFiles || !this.v2ParsedFiles[index]) return;
        this.showFileNotice('');

        const removed = this.v2ParsedFiles[index];
        const removedLabel = removed.fileName || removed.tabLabel || T('files.noName');
        const remaining = this.v2ParsedFiles.filter((_, i) => i !== index);

        if (remaining.length === 0) {
            this.resetV2State(elements, handlers);
            this.showFileNotice([() => T('notice.allRemoved')]);
            return;
        }

        const styleBackup = { ...this.tabStyleSettings };
        const colorBackup = { ...this.tabColorSettings };
        const charBackup = { ...this.characterColors };

        await this.setupFromV2Files(null, elements, handlers, remaining, charBackup);

        const tabs = [...new Set(this.v2Data.logs.map(l => l.tab))];
        this.restoreTabSettings(tabs, styleBackup, colorBackup, elements);
        this.showDetailSections(elements, tabs);
        console.info(T('log.fileRemoved', removedLabel));
    }

    
    async setupFromV2Files(items, elements, handlers, preParsed = null, extraSpeakerColors = null) {
        const parsedFiles = preParsed
            || items.map(item => ({ ...handlers.parseV2(item.text), fileName: item.name }));
        this.v2ParsedFiles = parsedFiles;
        this.v2Data = this.buildV2Data(parsedFiles);

        const logs = this.v2Data.logs;
        if (logs.length === 0) {
            
            this.v2Data = null;
            throw new Error(T('err.noMessages'));
        }

        const speakers = [...new Set(logs.map(l => l.speaker).filter(s => s && s !== 'system'))];
        const tabs = [...new Set(logs.map(l => l.tab))];

        
        if (this.subNarrators && this.subNarrators.length > 0) {
            this.subNarrators = this.subNarrators.filter(c => speakers.includes(c.speaker));
        }

        
        Object.keys(this.profileImages).forEach(speaker => {
            if (!this.profileImageSources[speaker]) delete this.profileImages[speaker];
        });

        
        await this.resizeV2Avatars(elements.profileUploaderDiv);

        this.setupNarratorSelect(speakers, elements.narratorSelect);
        this.setupOocTabSelect(tabs, elements.oocTabSelect);
        this.setupProfileUploader(speakers, elements.profileUploaderDiv);
        
        this.setupCharacterColorPicker(speakers, elements.characterColorPicker,
            new Map(Object.entries({ ...this.v2Data.speakerColors, ...(extraSpeakerColors || {}) })));
        this.setupTabStylePicker(tabs, elements.tabStylePicker);
        this.setupTabVisibilityCheckboxes(tabs, elements.tabVisibilityCheckboxes);
        this.setupTabColorPicker(tabs, document.getElementById('tab-color-picker'));
        this.setupSubNarrators(speakers);
        this.setupIllustrations(elements);
        this.setupChannelNameEditor(elements, handlers);

        
        speakers.forEach(speaker => {
            const src = this.profileImages[speaker];
            if (!src) return;
            const preview = document.getElementById(`preview-${this.getSafeSpeakerId(speaker)}`);
            if (preview) preview.src = src;
        });
        this.updateProfileImageStats();

        
        if (this.v2Data.roomTitle && elements.customTitleInput && !elements.customTitleInput.value.trim()) {
            elements.customTitleInput.value = this.v2Data.roomTitle;
        }

        this.applyV2LogImageOption();
        this.updateLoadedFileUI(elements, handlers);

        console.info(T('log.v2Loaded', this.v2Data.fileCount, logs.length,
            tabs.length, Object.keys(this.v2Data.avatars).length));
    }

    
    applyV2LogImageOption() {
        const checkbox = document.getElementById('use-log-images');
        if (!checkbox) return;
        const label = checkbox.closest('label');
        checkbox.disabled = false;
        checkbox.checked = true; // 預設：每則訊息都用各自的表情
        if (label) {
            label.style.display = '';
            label.classList.remove('opacity-50', 'cursor-not-allowed');
            label.classList.add('cursor-pointer');
            lcSetTitle(label, 'img.v2.title');
            const span = label.querySelector('span');
            if (span) lcSet(span, 'img.v2.label');
        }
        const help = document.getElementById('log-image-help-line');
        if (help) {
            help.style.display = '';
            lcSetHtml(help, 'img.v2.help');
        }
    }

    
    resetLogImageOption() {
        const checkbox = document.getElementById('use-log-images');
        if (!checkbox) return;
        const label = checkbox.closest('label');

        checkbox.checked = false;
        checkbox.disabled = true;
        if (label) {
            /* 上游只在 Room ID 分頁藏起來時才隱藏這個選項；收錄版已拿掉 Room ID，一律隱藏。 */
            label.style.display = 'none';
            label.classList.add('opacity-50', 'cursor-not-allowed');
            label.classList.remove('cursor-pointer');
            lcSetTitle(label, 'img.legacy.title');
            const span = label.querySelector('span');
            if (span) lcSet(span, 'img.legacy.label');
        }
        const help = document.getElementById('log-image-help-line');
        if (help) {
            /* 收錄版：這行是隱藏的，內容照樣換成舊格式的說明，讓它和 HTML 的初始文字一致 */
            lcSetHtml(help, 'img.legacy.help');
            help.style.display = 'none';
        }
    }

    
    setupChannelNameEditor(elements, handlers) {
        const section = document.getElementById('channel-name-section');
        const list = document.getElementById('channel-name-list');
        if (!section || !list || !this.v2Data) return;

        section.classList.remove('hidden');
        list.innerHTML = '';

        this.v2Data.channelIds.forEach(id => {
            const name = this.v2Data.channelNames[id] || id;
            const count = this.v2Data.logs.filter(l => l.channelId === id).length;
            const row = document.createElement('div');
            row.className = 'color-card';
            row.innerHTML = `
                <div class="flex items-center gap-3">
                    <code class="text-xs text-muted" style="min-width:8rem;">${this.escapeHtml(id)}</code>
                    <input type="text" class="channel-name-input flex-1" value="${this.escapeAttr(name)}"
                           data-channel-id="${this.escapeAttr(id)}" placeholder="${this.escapeAttr(T('channel.placeholder'))}" data-lc-ph="channel.placeholder">
                    <span class="text-xs text-muted whitespace-nowrap" ${lcAttrs('channel.count', count)}>${lcEsc(T('channel.count', count))}</span>
                </div>`;
            list.appendChild(row);
        });

        list.querySelectorAll('.channel-name-input').forEach(input => {
            input.addEventListener('change', () => {
                const id = input.dataset.channelId;
                const newName = input.value.trim() || id;
                this.renameChannel(id, newName, elements, handlers);
            });
        });
    }

    
    renameChannel(channelId, newName, elements, handlers) {
        if (!this.v2Data) return;
        const oldName = this.v2Data.channelNames[channelId] || channelId;
        if (oldName === newName) return;

        
        const takenBy = Object.entries(this.v2Data.channelNames)
            .find(([id, name]) => id !== channelId && name === newName);
        if (takenBy) {
            console.warn(T('log.nameTaken', newName, takenBy[0]));
        }

        this.v2Data.channelNames[channelId] = newName;
        this.v2Data.logs.forEach(log => {
            if (log.channelId === channelId) log.tab = newName;
        });

        
        [this.tabStyleSettings, this.tabColorSettings].forEach(settings => {
            if (settings && Object.prototype.hasOwnProperty.call(settings, oldName)) {
                if (!takenBy) settings[newName] = settings[oldName];
                delete settings[oldName];
            }
        });

        const tabs = [...new Set(this.v2Data.logs.map(l => l.tab))];
        const prevOoc = elements.oocTabSelect.value === oldName ? newName : elements.oocTabSelect.value;
        this.setupOocTabSelect(tabs, elements.oocTabSelect);
        if ([...elements.oocTabSelect.options].some(o => o.value === prevOoc)) {
            elements.oocTabSelect.value = prevOoc;
        }

        
        this.restoreTabSettings(tabs, { ...this.tabStyleSettings }, { ...this.tabColorSettings }, elements);
        this.updateLoadedFileUI(elements, handlers);

        console.info(T('log.renamed', oldName, newName));
    }

    
    
    

    
    getSplitSettings(elements) {
        const splitMethod = document.querySelector('input[name="split-method"]:checked')?.value || 'none';
        let splitValue = 0;
        if (splitMethod === 'count') {
            const parsed = parseInt(elements.logLimitCountInput.value, 10);
            splitValue = (parsed > 0 && parsed <= 100000) ? parsed : 0;
        } else if (splitMethod === 'size') {
            const parsed = parseInt(elements.logLimitSizeInput.value, 10);
            splitValue = (parsed > 0 && parsed <= 100000) ? parsed : 0;
        } else if (splitMethod === 'files') {
            const parsed = parseInt(elements.logLimitFilesInput.value, 10);
            splitValue = (parsed >= 2 && parsed <= 1000) ? parsed : 2;
        }
        return { splitMethod, splitValue };
    }

    
    buildCustomOptions(elements, { useLogImages = false, messageImages = {} } = {}) {
        return {
            title: elements.customTitleInput.value || null,
            subtitle: elements.customSubtitleInput.value || null,
            summary: elements.customSummaryInput?.value || null,
            fontUrl: elements.customFontUrl.value || null,
            fontFamily: elements.customFontFamily.value || null,
            fontSize: elements.fontSizeSelect.value || '17',
            lineHeight: elements.lineHeightSelect.value || '1.8',
            pageWidth: elements.pageWidthSelect.value || '750',
            chatMode: elements.chatModeSelect.value || 'collapse',
            showChatCount: elements.showChatCountCheckbox?.checked || false,
            hideSystem: elements.systemModeSelect.value === 'hide',
            systemBgColor: elements.systemBgColorInput.value || null,
            systemBorderColor: elements.systemBorderColorInput.value || null,
            systemTextColor: elements.systemTextColorInput.value || null,
            narrationBgColor: elements.narrationBgColorInput.value || null,
            narrationTextColor: elements.narrationTextColorInput.value || null,
            narrationDisplayMode: elements.narrationDisplayModeSelect?.value || 'highlight',
            narrationCenter: elements.narrationCenterCheckbox?.checked || false,
            themeBgColor: elements.themeBgColorInput?.value || null,
            themeContainerColor: elements.themeContainerColorInput?.value || null,
            themeTextColor: elements.themeTextColorInput?.value || null,
            themeAccentColor: elements.themeAccentColorInput?.value || null,
            characterColors: this.characterColors,
            tabStyles: this.tabStyleSettings,
            tabColors: this.tabColorSettings,
            enableTabColors: document.getElementById('enable-tab-colors')?.checked || false,
            subNarrators: this.subNarrators,
            novelTypography: elements.novelTypographyToggle.checked,
            longNameWrap: elements.longNameWrapCheckbox?.checked || false,
            dialogueLayoutMode: elements.dialogueLayoutModeSelect?.value || 'grid',
            dialogueSeparatorType: elements.dialogueSeparatorTypeSelect?.value || 'space',
            customSeparatorValue: elements.customSeparatorValueInput?.value || ':',
            illustrations: this.illustrations,
            useLogImages: useLogImages,
            messageImages: messageImages,
            /* 產出 HTML 的固定字樣，在轉換當下定下語言 */
            labels: buildOutputLabels()
        };
    }

    
    pruneUnusedImages(logs, customOptions) {
        const tabStyles = customOptions.tabStyles || {};
        const chatMode = customOptions.chatMode || 'collapse';
        const hideSystem = !!customOptions.hideSystem;

        const usedSpeakers = new Set();
        const usedImages = new Set();
        logs.forEach(log => {
            if (log.type === 'ILLUSTRATION') return;
            if ((tabStyles[log.tab] || 'none') === 'hide') return;
            if (hideSystem && log.type === 'SYSTEM') return;
            if (chatMode === 'hide' && log.type === 'OOC') return;

            if (log.speaker) usedSpeakers.add(log.speaker);
            const urls = (log.imageUrls && log.imageUrls.length)
                ? log.imageUrls
                : (log.imageUrl ? [log.imageUrl] : []);
            urls.forEach(url => usedImages.add(url));
        });

        const profileImages = {};
        for (const [speaker, dataUrl] of Object.entries(this.profileImages || {})) {
            if (usedSpeakers.has(speaker)) profileImages[speaker] = dataUrl;
        }
        const messageImages = {};
        for (const [key, dataUrl] of Object.entries(customOptions.messageImages || {})) {
            if (usedImages.has(key)) messageImages[key] = dataUrl;
        }

        const droppedProfiles = Object.keys(this.profileImages || {}).length - Object.keys(profileImages).length;
        const droppedMessages = Object.keys(customOptions.messageImages || {}).length - Object.keys(messageImages).length;
        if (droppedProfiles > 0 || droppedMessages > 0) {
            console.info(T('log.pruned', droppedProfiles, droppedMessages));
        }
        return { profileImages, messageImages };
    }

    
    renderPreview(elements, handlers, startNumber = null) {
        const context = this.previewContext;
        if (!context) return;

        const total = context.logs.length;
        const startInput = document.getElementById('preview-start');
        const countSelect = document.getElementById('preview-count');

        let limit = parseInt(countSelect?.value ?? '500', 10);
        if (!Number.isFinite(limit) || limit < 0) limit = 500;

        let start = startNumber !== null ? startNumber : parseInt(startInput?.value ?? '1', 10);
        if (!Number.isFinite(start) || start < 1) start = 1;
        if (start > total) start = Math.max(1, total - (limit || total) + 1);
        if (startInput) startInput.value = String(start);

        const showAll = limit === 0;
        const sliced = showAll ? context.logs : context.logs.slice(start - 1, start - 1 + limit);
        const offset = showAll ? 0 : start - 1;

        
        const options = { ...context.customOptions, logNumberOffset: offset };
        const pruned = this.pruneUnusedImages(sliced, options);
        options.messageImages = pruned.messageImages;

        const chunks = handlers.generateHTML(context.selectedStyle, sliced, this.fileNameBase,
            pruned.profileImages, 'none', 0, options);
        const showLogNumbers = elements.showLogNumbersCheckbox?.checked ?? true;
        const html = this.addLogNumbersToPreview(chunks[0] || '', showLogNumbers);

        if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
        this.previewObjectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

        elements.previewFrame.classList.add('opacity-0');
        elements.previewFrame.onload = () => elements.previewFrame.classList.remove('opacity-0');
        elements.previewFrame.removeAttribute('srcdoc');
        elements.previewFrame.src = this.previewObjectUrl;

        
        const rangeBox = document.getElementById('preview-range');
        const info = document.getElementById('preview-range-info');
        if (rangeBox) rangeBox.classList.toggle('hidden', total === 0);
        if (info) {
            const last = showAll ? total : Math.min(total, start - 1 + sliced.length);
            if (showAll) lcSet(info, 'preview.infoAll', total.toLocaleString());
            else lcSet(info, 'preview.infoRange', start.toLocaleString(), last.toLocaleString(), total.toLocaleString());
        }
    }

    
    async runConversion(elements, handlers, selectedStyle, allParsedLogs, imageOpts = {}) {
        try {
            const { splitMethod, splitValue } = this.getSplitSettings(elements);

            
            if (splitMethod === 'size' && splitValue > 0) {
                const shouldResize = document.getElementById('resize-profile-images')?.checked ?? true;
                if (!shouldResize) {
                    const imageWarnings = this.checkImageSizeWarnings(splitValue);
                    if (imageWarnings.length > 0) {
                        const warningMessage = T('confirm.size.head', splitValue) +
                            imageWarnings.map(w => T('confirm.size.item', w.name, w.sizeKB)).join('\n') +
                            T('confirm.size.tail');
                        if (!confirm(warningMessage)) {
                            lcSet(elements.statusDiv, 'status.cancelled');
                            return;
                        }
                    }
                }
            }

            const customOptions = this.buildCustomOptions(elements, imageOpts);

            
            const pruned = this.pruneUnusedImages(allParsedLogs, customOptions);
            customOptions.messageImages = pruned.messageImages;

            this.convertedHtmlChunks = handlers.generateHTML(
                selectedStyle,
                allParsedLogs,
                this.fileNameBase,
                pruned.profileImages,
                splitMethod,
                splitValue,
                customOptions
            );

            if (this.convertedHtmlChunks.length > 0) {
                
                if (this.convertedHtmlChunks.length > 1) lcSet(elements.statusDiv, 'status.doneSplit', this.convertedHtmlChunks.length);
                else lcSet(elements.statusDiv, 'status.done');
                this.setupDownloadButtons(elements.downloadContainer);

                
                
                this.previewContext = { selectedStyle, logs: allParsedLogs, customOptions };
                this.renderPreview(elements, handlers, 1);
            }
        } catch (error) {
            console.error('===== Error during conversion =====');
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Stack trace:', error.stack);
            console.error('===================================');
            lcSet(elements.statusDiv, 'status.error', error.message || T('err.unknown'));
            alert(T('alert.convertError', error.message || T('err.unknown')));
        }
    }

    initEventListeners(elements, handlers) {
        
        this.loadSettings(elements);

        
        const autoSaveSettings = () => this.saveSettings(elements);

        
        elements.styleRadios.forEach(radio => radio.addEventListener('change', autoSaveSettings));
        elements.customFontUrl.addEventListener('input', autoSaveSettings);
        elements.customFontFamily.addEventListener('input', autoSaveSettings);
        elements.mergeConsecutiveCheckbox.addEventListener('change', autoSaveSettings);
        elements.fontSizeSelect.addEventListener('change', autoSaveSettings);
        elements.lineHeightSelect.addEventListener('change', autoSaveSettings);
        elements.pageWidthSelect.addEventListener('change', autoSaveSettings);
        elements.chatModeSelect.addEventListener('change', autoSaveSettings);
        elements.showChatCountCheckbox.addEventListener('change', autoSaveSettings);
        elements.systemModeSelect.addEventListener('change', autoSaveSettings);
        elements.themeBgColorInput.addEventListener('input', autoSaveSettings);
        elements.themeContainerColorInput.addEventListener('input', autoSaveSettings);
        elements.themeTextColorInput.addEventListener('input', autoSaveSettings);
        elements.themeAccentColorInput.addEventListener('input', autoSaveSettings);
        elements.systemBgColorInput.addEventListener('input', autoSaveSettings);
        elements.systemBorderColorInput.addEventListener('input', autoSaveSettings);
        elements.systemTextColorInput.addEventListener('input', autoSaveSettings);
        elements.narrationBgColorInput.addEventListener('input', autoSaveSettings);
        elements.narrationTextColorInput.addEventListener('input', autoSaveSettings);
        elements.splitMethodRadios.forEach(radio => radio.addEventListener('change', autoSaveSettings));
        elements.logLimitCountInput.addEventListener('input', autoSaveSettings);
        elements.logLimitSizeInput.addEventListener('input', autoSaveSettings);
        elements.logLimitFilesInput.addEventListener('input', autoSaveSettings);
        elements.oocTabSelect.addEventListener('change', autoSaveSettings);

        
        if (elements.narrationDisplayModeSelect) {
            elements.narrationDisplayModeSelect.addEventListener('change', () => {
                const isBlock = elements.narrationDisplayModeSelect.value === 'block';
                elements.narrationCenterSection?.classList.toggle('hidden', !isBlock);
                autoSaveSettings();
            });
            elements.narrationDisplayModeSelect.dispatchEvent(new Event('change'));
        }
        if (elements.narrationCenterCheckbox) {
            elements.narrationCenterCheckbox.addEventListener('change', autoSaveSettings);
        }
        elements.novelTypographyToggle.addEventListener('change', autoSaveSettings);
        if (elements.longNameWrapCheckbox) {
            elements.longNameWrapCheckbox.addEventListener('change', autoSaveSettings);
        }

        
        if (elements.dialogueLayoutModeSelect) {
            elements.dialogueLayoutModeSelect.addEventListener('change', () => {
                const isCompact = elements.dialogueLayoutModeSelect.value === 'compact';
                if (isCompact) {
                    elements.dialogueSeparatorSection?.classList.remove('hidden');
                } else {
                    elements.dialogueSeparatorSection?.classList.add('hidden');
                }
                autoSaveSettings();
            });
        }
        if (elements.dialogueSeparatorTypeSelect) {
            elements.dialogueSeparatorTypeSelect.addEventListener('change', () => {
                const isCustom = elements.dialogueSeparatorTypeSelect.value === 'custom';
                if (isCustom) {
                    elements.customSeparatorInputSection?.classList.remove('hidden');
                } else {
                    elements.customSeparatorInputSection?.classList.add('hidden');
                }
                autoSaveSettings();
            });
        }
        if (elements.customSeparatorValueInput) {
            elements.customSeparatorValueInput.addEventListener('input', autoSaveSettings);
        }

        
        const enableTabColorsCheckbox = document.getElementById('enable-tab-colors');
        if (enableTabColorsCheckbox) {
            enableTabColorsCheckbox.addEventListener('change', autoSaveSettings);
        }

        
        elements.styleRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const selectedStyle = document.querySelector('input[name="style"]:checked').value;

                
                if (selectedStyle === 'timeline' || selectedStyle === 'original') {
                    elements.profileImageSection.classList.remove('hidden');
                } else {
                    elements.profileImageSection.classList.add('hidden');
                }

                
                if (selectedStyle === 'novel') {
                    elements.novelTypographyOption.classList.remove('hidden');
                } else {
                    elements.novelTypographyOption.classList.add('hidden');
                }

                
                if (selectedStyle === 'timeline') {
                    elements.timelineDialogueLayoutSection?.classList.remove('hidden');
                } else {
                    elements.timelineDialogueLayoutSection?.classList.add('hidden');
                }

                
                
                const hasMultipleTabs = elements.tabVisibilitySection && !elements.tabVisibilitySection.classList.contains('hidden');

                if (selectedStyle === 'original' && hasMultipleTabs && elements.tabStyleSection) {
                    elements.tabStyleSection.classList.remove('hidden');
                } else if (elements.tabStyleSection) {
                    elements.tabStyleSection.classList.add('hidden');
                }
            });
        });

        
        elements.splitMethodRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                elements.logLimitCountInput.disabled = !elements.splitCountRadio.checked;
                elements.logLimitSizeInput.disabled = !elements.splitSizeRadio.checked;
                elements.logLimitFilesInput.disabled = !elements.splitFilesRadio.checked;
            });
        });

        
        if (elements.previewApplyBtn) {
            elements.previewApplyBtn.addEventListener('click', () => {
                this.renderPreview(elements, handlers);
            });
        }
        if (elements.previewCountSelect) {
            elements.previewCountSelect.addEventListener('change', () => {
                this.renderPreview(elements, handlers);
            });
        }
        if (elements.previewStartInput) {
            elements.previewStartInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') this.renderPreview(elements, handlers);
            });
        }

        
        if (elements.addLogFileBtn && elements.addLogFileInput) {
            elements.addLogFileBtn.addEventListener('click', () => elements.addLogFileInput.click());
            elements.addLogFileInput.addEventListener('change', async (event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = ''; // 清空，讓同一個檔案可以再選一次
                if (files.length === 0) return;
                try {
                    await this.addV2Files(files, elements, handlers);
                } catch (error) {
                    console.error(T('log.addFailed'), error);
                    this.showFileNotice([() => T('notice.addFailed', error.message || error)]);
                }
            });
        }

        
        elements.logFileInput.addEventListener('change', async (event) => {
            const files = Array.from(event.target.files || []);
            const file = files[0];
            if (!file) return;

            elements.profileSettingsSection.style.display = 'block';
            if (elements.outputOptionsSection) elements.outputOptionsSection.style.display = 'block';
            if (elements.splitOptionsSection) elements.splitOptionsSection.style.display = 'block';
            elements.profileUploaderDiv.innerHTML = `<p class="text-gray-500" ${lcAttrs('status.detecting')}>${lcEsc(T('status.detecting'))}</p>`;

            this.showFileNotice('');

            try {
                const texts = await Promise.all(files.map(f => f.text()));

                
                const v2Items = files
                    .map((file, i) => ({ text: texts[i], name: file.name }))
                    .filter(item => handlers.detectFormat(item.text) === 'ccfolia-v2');
                if (v2Items.length > 0) {
                    if (v2Items.length !== texts.length) {
                        const mixed = texts.length - v2Items.length;
                        this.showFileNotice([() => T('notice.mixed', mixed)]);
                    }
                    await this.setupFromV2Files(v2Items, elements, handlers);
                    if (this.v2Data?.droppedAllLogFiles > 0) {
                        const allFiles = this.v2Data.droppedAllLogFiles + 1;
                        this.showFileNotice([() => T('notice.multiAll', allFiles)]);
                    }
                    this.showDetailSections(elements, [...new Set(this.v2Data.logs.map(l => l.tab))]);
                    return;
                }

                
                this.v2Data = null;
                this.v2ParsedFiles = null;
                const channelSection = document.getElementById('channel-name-section');
                if (channelSection) channelSection.classList.add('hidden');
                const channelList = document.getElementById('channel-name-list');
                if (channelList) channelList.innerHTML = '';
                this.resetLogImageOption();
                this.updateLoadedFileUI(elements, handlers);

                if (files.length > 1) {
                    const firstName = files[0].name;
                    const rest = files.length - 1;
                    this.showFileNotice([() => T('notice.legacyOne', firstName, rest)]);
                }

                const rawHtml = texts[0];
                const parsedLogs = handlers.parseLog(rawHtml);
                const speakers = [...new Set(parsedLogs.map(log => log.speaker))];
                const tabs = handlers.extractTabs(rawHtml);

                
                if (this.subNarrators && this.subNarrators.length > 0) {
                    this.subNarrators = this.subNarrators.filter(config =>
                        speakers.includes(config.speaker)
                    );
                }

                this.setupNarratorSelect(speakers, elements.narratorSelect);
                this.setupOocTabSelect(tabs, elements.oocTabSelect);
                this.setupProfileUploader(speakers, elements.profileUploaderDiv);
                this.setupCharacterColorPicker(speakers, elements.characterColorPicker);
                this.setupTabStylePicker(tabs, elements.tabStylePicker);
                this.setupTabVisibilityCheckboxes(tabs, elements.tabVisibilityCheckboxes);
                this.setupTabColorPicker(tabs, document.getElementById('tab-color-picker'));
                this.setupSubNarrators(speakers);

                
                this.setupIllustrations(elements);

                
                this.extractTitleFromFilename(file.name, elements.customTitleInput, elements.customSubtitleInput);

                this.showDetailSections(elements, tabs);
            } catch (error) {
                elements.profileUploaderDiv.innerHTML = `<p class="text-red-500" ${lcAttrs('status.analyzeFailed')}>${lcEsc(T('status.analyzeFailed'))}</p>`;
                console.error("File parsing error:", error);
            }
        });

        
        elements.convertBtn.addEventListener('click', async () => {
            const file = elements.logFileInput.files[0];
            const selectedStyle = document.querySelector('input[name="style"]:checked').value;

            
            const hasV2Data = !!(this.v2Data && this.v2Data.logs.length > 0);

            if (!file && !hasV2Data) {
                alert(T('alert.selectFirst'));
                return;
            }

            
            const customTitle = elements.customTitleInput?.value?.trim();
            if (customTitle) {
                
                this.fileNameBase = this.sanitizeFileName(customTitle);
            } else if (hasV2Data && this.v2Data.roomTitle) {
                this.fileNameBase = this.sanitizeFileName(this.v2Data.roomTitle);
            } else {
                
                this.fileNameBase = file.name.replace('.html', '');
            }

            elements.resultSection.classList.remove('hidden');
            lcSet(elements.statusDiv, 'status.reading');
            elements.previewFrame.classList.add('opacity-0');
            elements.downloadContainer.innerHTML = '';

            
            if (hasV2Data) {
                try {
                    const narratorName = elements.narratorSelect.value;
                    const oocTabName = elements.oocTabSelect.value;
                    let allParsedLogs = handlers.applyRoles(this.v2Data.logs, narratorName, oocTabName);

                    if (elements.mergeConsecutiveCheckbox.checked) {
                        allParsedLogs = this.mergeConsecutiveSpeakers(allParsedLogs);
                    }

                    
                    const useLogImages = document.getElementById('use-log-images')?.checked ?? true;
                    const messageImages = useLogImages ? this.v2Data.avatars : {};

                    lcSet(elements.statusDiv, 'status.analyzed', allParsedLogs.length);

                    await this.runConversion(elements, handlers, selectedStyle, allParsedLogs, { useLogImages, messageImages });
                } catch (error) {
                    console.error('===== Error during conversion (v2) =====');
                    console.error(error);
                    lcSet(elements.statusDiv, 'status.error', error.message || T('err.unknown'));
                    alert(T('alert.convertErrorShort', error.message || T('err.unknown')));
                }
                return;
            }

            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const rawHtml = e.target.result;
                try {
                    const narratorName = elements.narratorSelect.value;
                    const oocTabName = elements.oocTabSelect.value;
                    let allParsedLogs = handlers.parseLog(rawHtml, narratorName, oocTabName);

                    
                    if (elements.mergeConsecutiveCheckbox.checked) {
                        allParsedLogs = this.mergeConsecutiveSpeakers(allParsedLogs);
                    }

                    lcSet(elements.statusDiv, 'status.analyzed', allParsedLogs.length);

                    
                    const useLogImages = document.getElementById('use-log-images')?.checked || false;
                    const messageImages = {};


                    await this.runConversion(elements, handlers, selectedStyle, allParsedLogs, { useLogImages, messageImages });

                } catch (error) {
                    console.error('===== Error during conversion =====');
                    console.error('Error name:', error.name);
                    console.error('Error message:', error.message);
                    console.error('Stack trace:', error.stack);
                    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
                    console.error('===================================');

                    lcSet(elements.statusDiv, 'status.error', error.message || T('err.unknown'));
                    alert(T('alert.convertError', error.message || T('err.unknown')));
                }
            };
            reader.readAsText(file, 'UTF-8');
        });

        
        const exportPresetBtn = document.getElementById('export-preset-btn');
        if (exportPresetBtn) {
            exportPresetBtn.addEventListener('click', () => {
                this.exportSettings(elements);
            });
        }

        
        const importPresetInput = document.getElementById('import-preset-input');
        if (importPresetInput) {
            importPresetInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (file) {
                    await this.importSettings(file, elements);
                    
                    event.target.value = '';
                }
            });
        }

        
        const resetSettingsBtn = document.getElementById('reset-settings-btn');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => {
                const confirmed = confirm(T('confirm.reset'));
                if (confirmed) {
                    try {
                        
                        localStorage.removeItem('ccfolia-converter-settings');
                        console.info(T('log.resetDone'));
                        
                        window.location.reload();
                    } catch (error) {
                        console.error(T('log.resetError'), error);
                        alert(T('alert.resetError'));
                    }
                }
            });
        }

        
        const initialStyle = document.querySelector('input[name="style"]:checked')?.value || 'novel';
        if (initialStyle === 'novel') {
            elements.novelTypographyOption.classList.remove('hidden');
        } else {
            elements.novelTypographyOption.classList.add('hidden');
        }

        if (initialStyle === 'timeline' || initialStyle === 'original') {
            elements.profileImageSection.classList.remove('hidden');
        } else {
            elements.profileImageSection.classList.add('hidden');
        }

        if (initialStyle === 'timeline') {
            elements.timelineDialogueLayoutSection?.classList.remove('hidden');
        } else {
            elements.timelineDialogueLayoutSection?.classList.add('hidden');
        }
    }

    setupNarratorSelect(speakers, selectElement) {
        
        while (selectElement.options.length > 1) {
            selectElement.remove(1);
        }

        
        speakers.forEach(speaker => {
            if (speaker !== 'system') {
                const option = document.createElement('option');
                option.value = speaker;
                if (speaker && speaker.trim()) option.textContent = speaker;
                else lcSet(option, 'speaker.empty');
                if (speaker === 'GM') {
                    selectElement.selectedIndex = selectElement.options.length - 1;
                }
                selectElement.appendChild(option);
            }
        });
    }

    setupOocTabSelect(tabs, selectElement) {
        
        while (selectElement.options.length > 1) {
            selectElement.remove(1);
        }

        
        tabs.forEach(tab => {
            const option = document.createElement('option');
            option.value = tab;
            option.textContent = tab;
            selectElement.appendChild(option);
        });

        
        /* 自動選閒聊分頁。上游只認韓文的名稱（OOC_TAB_NAMES 的第一個）；其餘是收錄版補上的
         * 繁中別名（本工具繁中介面的預設分頁名稱，以及 CCFOLIA 繁中介面可能用的名稱）。 */
        const oocTabName = OOC_TAB_NAMES.find(name => tabs.includes(name));
        if (oocTabName) {
            selectElement.value = oocTabName;
        } else if (tabs.includes('other')) {
            selectElement.value = 'other';
        } else {
            selectElement.selectedIndex = 0; // 「不使用」
        }
    }

    setupProfileUploader(speakers, containerElement) {
        containerElement.innerHTML = '';
        
        const previousProfileImages = { ...this.profileImages };
        this.profileImages = {};
        this.speakerIdMap.clear(); // 重設對照表

        
        speakers.forEach(speaker => {
            if (previousProfileImages[speaker]) {
                this.profileImages[speaker] = previousProfileImages[speaker];
            }
        });

        speakers.forEach(speaker => {
            const speakerId = this.getSafeSpeakerId(speaker); // 產生安全的 ID
            const displayName = speaker ? this.escapeHtml(speaker) : lcSpan('speaker.empty'); // HTML 跳脫
            const placeholderText = this.getSafePlaceholder(speaker); // 安全的預留字


            const uploaderHTML = `
                <div class="profile-card" data-speaker-id="${speakerId}">
                    <div class="flex items-center gap-3 mb-3">
                        <img id="preview-${speakerId}"
                             src="https://placehold.co/64x64/1a1a1a/666666?text=${encodeURIComponent(placeholderText)}"
                             alt="${this.escapeAttr(speaker)}"
                             class="w-14 h-14 rounded-full object-cover object-top border-2 border-gray-600">
                        <p class="font-semibold text-gray-200 flex-1">${displayName}</p>
                    </div>
                    <div class="space-y-2">
                        <div class="flex items-center gap-2">
                            <input type="radio" name="img-type-${speakerId}" value="file" id="file-${speakerId}" checked>
                            <label for="file-${speakerId}" class="text-sm cursor-pointer" ${lcAttrs('common.fileUpload')}>${lcEsc(T('common.fileUpload'))}</label>
                        </div>
                        <input type="file" accept="image/*" data-speaker-id="${speakerId}" class="profile-image-input w-full text-sm">

                        <div class="flex items-center gap-2">
                            <input type="radio" name="img-type-${speakerId}" value="url" id="url-${speakerId}">
                            <label for="url-${speakerId}" class="text-sm cursor-pointer" ${lcAttrs('profile.url')}>${lcEsc(T('profile.url'))}</label>
                        </div>
                        <input type="text" placeholder="https://example.com/image.jpg" data-speaker-id="${speakerId}" class="profile-url-input w-full" disabled>
                    </div>
                </div>`;
            containerElement.insertAdjacentHTML('beforeend', uploaderHTML);
        });

        
        document.querySelectorAll('[id^="file-"], [id^="url-"]').forEach(radio => {
            radio.addEventListener('change', async (event) => {
                const speakerId = event.target.name.replace('img-type-', '');
                const type = event.target.value;
                const speaker = this.getSpeakerFromId(speakerId);
                const fileInput = document.querySelector(`.profile-image-input[data-speaker-id="${speakerId}"]`);
                const urlInput = document.querySelector(`.profile-url-input[data-speaker-id="${speakerId}"]`);

                
                fileInput.disabled = type !== 'file';
                urlInput.disabled = type !== 'url';
            });
        });

        
        document.querySelectorAll('.profile-image-input').forEach(input => {
            input.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                const speakerId = event.target.dataset.speakerId;
                const speaker = this.getSpeakerFromId(speakerId); // 從 ID 取回原本的名稱

                if (file && speaker) {
                    try {
                        
                        const originalDataUrl = await this.fileToDataUrl(file);
                        this.profileImageSources[speaker] = { type: 'dataurl', data: originalDataUrl };

                        const shouldResize = document.getElementById('resize-profile-images')?.checked ?? true;
                        let imageDataUrl;

                        if (shouldResize) {
                            const preset = this.getImageQualityPreset();
                            imageDataUrl = await this.resizeImageFromDataUrl(originalDataUrl, preset.profileSize, preset.profileSize, preset.quality);
                            console.info(T('log.profileUploadedResized', speaker, preset.profileSize, preset.profileSize));
                        } else {
                            imageDataUrl = originalDataUrl;
                            console.info(T('log.profileUploadedOriginal', speaker));
                        }

                        this.profileImages[speaker] = imageDataUrl; // 以原本的名稱儲存
                        document.getElementById(`preview-${speakerId}`).src = imageDataUrl;
                        this.updateProfileImageStats(); // 更新容量
                    } catch (error) {
                        console.error(T('log.profileFailed', speaker), error);
                        alert(T('alert.imageError', error.message));
                        delete this.profileImages[speaker];
                        delete this.profileImageSources[speaker];
                        const placeholderText = this.getSafePlaceholder(speaker);
                        document.getElementById(`preview-${speakerId}`).src = `https://placehold.co/64x64/1a1a1a/666666?text=${encodeURIComponent(placeholderText)}`;
                        this.updateProfileImageStats(); // 更新容量
                    }
                }
            });
        });

        
        document.querySelectorAll('.profile-url-input').forEach(input => {
            input.addEventListener('input', async (event) => {
                const url = event.target.value.trim();
                const speakerId = event.target.dataset.speakerId;
                const speaker = this.getSpeakerFromId(speakerId); // 從 ID 取回原本的名稱

                if (url && speaker) {
                    
                    const keepExternalUrl = document.getElementById('keep-external-url')?.checked ?? false;

                    if (keepExternalUrl) {
                        
                        this.profileImages[speaker] = url; // 直接存原始網址
                        this.profileImageSources[speaker] = { type: 'external', data: url };
                        const preview = document.getElementById(`preview-${speakerId}`);
                        if (preview) preview.src = url;
                        console.info(T('log.profileExternal', speaker, url));
                        this.updateProfileImageStats(); // 更新容量（外部連結算作 0）
                    } else {
                        
                        try {
                            this.profileImageSources[speaker] = { type: 'url', data: url };

                            const shouldResize = document.getElementById('resize-profile-images')?.checked ?? true;
                            let imageDataUrl;

                            if (shouldResize) {
                                const preset = this.getImageQualityPreset();
                                imageDataUrl = await this.loadAndResizeImageFromUrl(url, preset.profileSize, preset.profileSize, preset.quality);
                                console.info(T('log.profileLoadedResized', speaker, preset.profileSize, preset.profileSize));
                            } else {
                                imageDataUrl = await this.loadImageFromUrlAsDataUrl(url);
                                console.info(T('log.profileLoadedOriginal', speaker));
                            }

                            this.profileImages[speaker] = imageDataUrl; // 以原本的名稱儲存
                            const preview = document.getElementById(`preview-${speakerId}`);
                            if (preview) preview.src = imageDataUrl;
                            this.updateProfileImageStats(); // 更新容量
                        } catch (error) {
                            console.error(T('log.urlFailed', url), error);
                            console.warn(T('log.cors'));
                            alert(T('alert.urlFailed', error.message));
                            delete this.profileImages[speaker];
                            delete this.profileImageSources[speaker];
                            const preview = document.getElementById(`preview-${speakerId}`);
                            if (preview) preview.src = 'https://placehold.co/64x64/EFEFEF/AAAAAA?text=PIC';
                            this.updateProfileImageStats(); // 更新容量
                        }
                    }
                } else if (speaker) {
                    delete this.profileImages[speaker];
                    delete this.profileImageSources[speaker];
                    const placeholderText = this.getSafePlaceholder(speaker);
                    const preview = document.getElementById(`preview-${speakerId}`);
                    if (preview) preview.src = `https://placehold.co/64x64/1a1a1a/666666?text=${encodeURIComponent(placeholderText)}`;
                    this.updateProfileImageStats(); // 更新容量
                }
            });
        });
    }

    
    getDataUrlSize(dataUrl) {
        if (!dataUrl || !dataUrl.startsWith('data:')) return 0;

        
        const base64Index = dataUrl.indexOf(',');
        if (base64Index === -1) return 0;

        const base64 = dataUrl.substring(base64Index + 1);
        
        
        const padding = (base64.match(/=/g) || []).length;
        return Math.floor((base64.length * 3) / 4) - padding;
    }

    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 KB';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    
    updateProfileImageStats() {
        const statsContainer = document.getElementById('profile-image-stats');
        const totalSizeElement = document.getElementById('profile-total-size');
        const splitSizeWarning = document.getElementById('split-size-warning');
        const splitSizeImageTotal = document.getElementById('split-size-image-total');

        let totalBytes = 0;
        const imageSizes = [];

        
        for (const [speaker, dataUrl] of Object.entries(this.profileImages)) {
            const size = this.getDataUrlSize(dataUrl);
            totalBytes += size;
            imageSizes.push({ speaker, size });
        }

        
        if (statsContainer && totalSizeElement) {
            if (totalBytes > 0) {
                statsContainer.classList.remove('hidden');
                totalSizeElement.textContent = this.formatFileSize(totalBytes);

                
                if (totalBytes > 5 * 1024 * 1024) { // 5MB 以上
                    totalSizeElement.className = 'text-sm font-mono text-red-400';
                } else if (totalBytes > 1 * 1024 * 1024) { // 1MB 以上
                    totalSizeElement.className = 'text-sm font-mono text-yellow-400';
                } else {
                    totalSizeElement.className = 'text-sm font-mono text-green-400';
                }

                console.info(T('log.profileTotal', this.formatFileSize(totalBytes), Object.keys(this.profileImages).length));
            } else {
                statsContainer.classList.add('hidden');
            }
        }

        
        if (splitSizeWarning && splitSizeImageTotal) {
            if (totalBytes > 0) {
                splitSizeWarning.classList.remove('hidden');
                const totalKB = Math.ceil(totalBytes / 1024);
                splitSizeImageTotal.textContent = `${totalKB} KB`;
            } else {
                splitSizeWarning.classList.add('hidden');
            }
        }

        
        this.totalProfileImageBytes = totalBytes;
    }


    setupCharacterColorPicker(speakers, containerElement, characterColorMap = null) {
        containerElement.innerHTML = '';
        this.characterColors = {};

        
        const defaultColors = ['#d9480f', '#1c7ed6', '#2b6777', '#862e9c', '#5c940d'];

        speakers.forEach((speaker, index) => {
            if (speaker === 'system') return; // 排除系統訊息

            const speakerId = this.getSafeSpeakerId(speaker); // 使用安全的 ID

            
            const ccfoliaColor = characterColorMap?.get(speaker);
            const initialColor = ccfoliaColor || defaultColors[index % defaultColors.length];

            const displayName = speaker && speaker.trim() ? this.escapeHtml(speaker) : lcSpan('speaker.empty'); // HTML 跳脫
            const colorSource = ccfoliaColor ? '' : ''; // 標示 CCFOLIA 的顏色

            const pickerHTML = `
                <div class="color-card">
                    <div class="flex items-center justify-between">
                        <p class="font-semibold text-gray-200">${displayName}${colorSource}</p>
                        <div class="flex items-center gap-2">
                            <input type="color"
                                   value="${initialColor}"
                                   data-speaker-id="${speakerId}"
                                   class="character-color-input w-12 h-10 rounded cursor-pointer"
                                   title="${lcEsc(T('color.pick'))}" data-lc-title="color.pick">
                            <code class="character-color-preview text-xs" style="color: ${initialColor}">${initialColor}</code>
                        </div>
                    </div>
                </div>`;
            containerElement.insertAdjacentHTML('beforeend', pickerHTML);
            this.characterColors[speaker] = initialColor; // 以原本的名稱儲存
        });

        
        document.querySelectorAll('.character-color-input').forEach(input => {
            input.addEventListener('input', (event) => {
                const speakerId = event.target.dataset.speakerId;
                const speaker = this.getSpeakerFromId(speakerId); // 從 ID 取回原本的名稱
                const color = event.target.value;

                if (speaker) {
                    this.characterColors[speaker] = color; // 以原本的名稱儲存

                    
                    const preview = event.target.nextElementSibling;
                    if (preview) {
                        preview.style.color = color;
                        preview.textContent = color;
                    }
                }
            });
        });
    }

    setupTabVisibilityCheckboxes(tabs, containerElement) {
        if (!containerElement) return;
        containerElement.innerHTML = '';

        tabs.forEach(tab => {
            
            const isHidden = this.tabStyleSettings[tab] === 'hide';
            
            const tabId = this.getSafeTabId(tab);

            const checkboxHTML = `
                <div class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-800 transition">
                    <input type="checkbox"
                           id="tab-visible-${tabId}"
                           data-tab="${this.escapeAttr(tab)}"
                           class="tab-visibility-checkbox"
                           ${!isHidden ? 'checked' : ''}>
                    <label for="tab-visible-${tabId}" class="cursor-pointer flex-1" style="color: #d1d5db;">
                        <span style="color: #fca5a5;">[${this.escapeHtml(tab)}]</span>
                    </label>
                </div>`;
            containerElement.insertAdjacentHTML('beforeend', checkboxHTML);
        });

        
        document.querySelectorAll('.tab-visibility-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const tab = e.target.dataset.tab;
                if (e.target.checked) {
                    
                    if (this.tabStyleSettings[tab] === 'hide') {
                        this.tabStyleSettings[tab] = 'none';
                    }
                } else {
                    
                    this.tabStyleSettings[tab] = 'hide';
                }

                console.log(T('log.tabVisibility', tab, e.target.checked ? T('log.shown') : T('log.hidden')));
            });
        });
    }

    setupTabStylePicker(tabs, containerElement) {
        containerElement.innerHTML = '';
        this.tabStyleSettings = {};

        tabs.forEach(tab => {
            
            const defaultStyle = 'none';

            const pickerHTML = `
                <div class="color-card" style="padding: 0.6rem 0.8rem;">
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-sm font-medium" style="color: #fca5a5;">[${this.escapeHtml(tab)}]</span>
                        <select data-tab="${this.escapeAttr(tab)}" class="tab-style-select text-sm px-2 py-1.5" style="flex: 1; max-width: 180px;">
                            <option value="none" selected ${lcAttrs('tabStyle.none')}>${lcEsc(T('tabStyle.none'))}</option>
                            <option value="label" ${lcAttrs('tabStyle.label')}>${lcEsc(T('tabStyle.label'))}</option>
                            <option value="system" ${lcAttrs('tabStyle.system')}>${lcEsc(T('tabStyle.system'))}</option>
                        </select>
                    </div>
                </div>`;
            containerElement.insertAdjacentHTML('beforeend', pickerHTML);
            this.tabStyleSettings[tab] = defaultStyle;
        });

        
        document.querySelectorAll('.tab-style-select').forEach(select => {
            select.addEventListener('change', (event) => {
                const tab = event.target.dataset.tab;
                const style = event.target.value;
                this.tabStyleSettings[tab] = style;
            });
        });
    }

    setupTabColorPicker(tabs, containerElement) {
        if (!containerElement) return;

        containerElement.innerHTML = '';

        tabs.forEach(tab => {
            
            const existingColor = this.tabColorSettings[tab] || { textColor: '#e5e7eb', bgColor: 'transparent' };

            const pickerHTML = `
                <div class="color-card">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-sm font-semibold" style="color: #fca5a5;">[${this.escapeHtml(tab)}]</span>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs mb-1.5 text-muted" ${lcAttrs('common.textColor')}>${lcEsc(T('common.textColor'))}</label>
                            <div class="flex items-center gap-2">
                                <input type="color"
                                       value="${existingColor.textColor}"
                                       data-tab="${this.escapeAttr(tab)}"
                                       data-type="text"
                                       class="tab-color-input"
                                       style="width: 3rem; height: 2.2rem;">
                                <code class="tab-color-preview-text text-xs" style="color: ${existingColor.textColor}">${existingColor.textColor}</code>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs mb-1.5 text-muted" ${lcAttrs('common.bgColor')}>${lcEsc(T('common.bgColor'))}</label>
                            <div class="flex items-center gap-2">
                                <input type="color"
                                       value="${existingColor.bgColor === 'transparent' ? '#000000' : existingColor.bgColor}"
                                       data-tab="${this.escapeAttr(tab)}"
                                       data-type="bg"
                                       class="tab-color-input"
                                       style="width: 3rem; height: 2.2rem;">
                                <code class="tab-color-preview-bg text-xs text-muted">${existingColor.bgColor}</code>
                            </div>
                        </div>
                    </div>
                </div>`;
            containerElement.insertAdjacentHTML('beforeend', pickerHTML);

            if (!this.tabColorSettings[tab]) {
                this.tabColorSettings[tab] = existingColor;
            }
        });

        
        document.querySelectorAll('.tab-color-input').forEach(input => {
            input.addEventListener('input', (event) => {
                const tab = event.target.dataset.tab;
                const type = event.target.dataset.type; // 'text' or 'bg'
                const color = event.target.value;

                if (!this.tabColorSettings[tab]) {
                    this.tabColorSettings[tab] = { textColor: '#e5e7eb', bgColor: 'transparent' };
                }

                if (type === 'text') {
                    this.tabColorSettings[tab].textColor = color;
                    
                    const preview = event.target.parentElement.querySelector('.tab-color-preview-text');
                    if (preview) {
                        preview.style.color = color;
                        preview.textContent = color;
                    }
                } else if (type === 'bg') {
                    this.tabColorSettings[tab].bgColor = color;
                    
                    const preview = event.target.parentElement.querySelector('.tab-color-preview-bg');
                    if (preview) {
                        preview.textContent = color;
                    }
                }
            });
        });
    }

    setupSubNarrators(speakers) {
        
        if (!this.subNarrators) {
            this.subNarrators = [];
        }

        
        this.availableSpeakers = speakers.filter(s => s !== 'system');

        
        const speakerSelect = document.getElementById('sub-narrator-speaker-select');
        const addBtn = document.getElementById('sub-narrator-add-btn');
        const listContainer = document.getElementById('sub-narrator-list');
        const emptyMessage = document.getElementById('sub-narrator-empty-message');

        
        this.updateSubNarratorDropdown();

        
        this.subNarrators.forEach(config => {
            this.addSubNarratorCard(config.speaker, config.style, config.color);
        });

        
        this.updateEmptyMessage();

        
        addBtn.addEventListener('click', () => {
            
            if (speakerSelect.selectedIndex === 0) {
                return;
            }
            const selectedSpeaker = speakerSelect.value;

            
            this.addSubNarratorCard(selectedSpeaker, 'italic-narration', '#9ca3af');

            
            this.subNarrators.push({
                speaker: selectedSpeaker,
                style: 'italic-narration',
                color: '#9ca3af'
            });

            
            this.updateSubNarratorDropdown();

            
            this.updateEmptyMessage();
        });
    }

    updateSubNarratorDropdown() {
        const speakerSelect = document.getElementById('sub-narrator-speaker-select');
        if (!speakerSelect) return;

        
        const addedSpeakers = this.subNarrators.map(n => n.speaker);
        const availableOptions = this.availableSpeakers.filter(s => !addedSpeakers.includes(s));

        
        speakerSelect.innerHTML = `<option value="" ${lcAttrs('subnar.pick')}>${lcEsc(T('subnar.pick'))}</option>`;
        availableOptions.forEach(speaker => {
            const option = document.createElement('option');
            option.value = speaker;
            if (speaker && speaker.trim()) option.textContent = speaker;
                else lcSet(option, 'speaker.empty');
            speakerSelect.appendChild(option);
        });

        
        const addBtn = document.getElementById('sub-narrator-add-btn');
        if (addBtn) {
            addBtn.disabled = availableOptions.length === 0;
        }
    }

    addSubNarratorCard(speaker, style, color) {
        const listContainer = document.getElementById('sub-narrator-list');
        if (!listContainer) return;

        const speakerDisplay = speaker && speaker.trim() ? speaker : lcSpan('speaker.empty');
        const cardHTML = `
            <div class="sub-narrator-card bg-gray-800 border border-gray-700 rounded transition-all duration-300" data-speaker="${this.escapeAttr(speaker)}" style="opacity:0; transform: translateY(-10px);">
                <div class="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                    <div class="font-semibold text-sm text-gray-200">${speakerDisplay}</div>
                    <button class="sub-narrator-remove-btn text-gray-500 hover:text-red-400 text-2xl leading-none transition-colors" data-speaker="${this.escapeAttr(speaker)}" title="${lcEsc(T('subnar.remove'))}" data-lc-title="subnar.remove">&times;</button>
                </div>
                <div class="p-3 flex items-center gap-3">
                    <select data-speaker="${this.escapeAttr(speaker)}" class="sub-narrator-style-select flex-1 bg-gray-700 border-gray-600 text-gray-200 text-xs px-2 py-1 rounded">
                        <option value="italic-narration" ${style === 'italic-narration' ? 'selected' : ''} ${lcAttrs('subnar.style.italicNarration')}>${lcEsc(T('subnar.style.italicNarration'))}</option>
                        <option value="normal-narration" ${style === 'normal-narration' ? 'selected' : ''} ${lcAttrs('subnar.style.normalNarration')}>${lcEsc(T('subnar.style.normalNarration'))}</option>
                        <option value="italic-dialogue" ${style === 'italic-dialogue' ? 'selected' : ''} ${lcAttrs('subnar.style.italicDialogue')}>${lcEsc(T('subnar.style.italicDialogue'))}</option>
                        <option value="colored-narration" ${style === 'colored-narration' ? 'selected' : ''} ${lcAttrs('subnar.style.coloredNarration')}>${lcEsc(T('subnar.style.coloredNarration'))}</option>
                    </select>
                    <div class="sub-narrator-color-picker ${style === 'colored-narration' ? 'flex' : 'hidden'} items-center gap-2">
                        <input type="color"
                               value="${color}"
                               data-speaker="${this.escapeAttr(speaker)}"
                               class="sub-narrator-color-input w-12 h-8 rounded cursor-pointer border border-gray-600"
                               title="${lcEsc(T('subnar.colorPick'))}" data-lc-title="subnar.colorPick">
                    </div>
                </div>
            </div>`;

        listContainer.insertAdjacentHTML('beforeend', cardHTML);

        
        const cardElement = listContainer.lastElementChild;

        
        setTimeout(() => {
            cardElement.style.opacity = '1';
            cardElement.style.transform = 'translateY(0)';
        }, 10);

        
        const card = cardElement;

        
        const styleSelect = card.querySelector('.sub-narrator-style-select');
        styleSelect.addEventListener('change', (event) => {
            const newStyle = event.target.value;
            const colorPicker = card.querySelector('.sub-narrator-color-picker');
            const colorInput = card.querySelector('.sub-narrator-color-input');

            
            if (newStyle === 'colored-narration') {
                colorPicker.classList.remove('hidden');
            } else {
                colorPicker.classList.add('hidden');
            }

            
            this.updateSubNarratorConfig(speaker, newStyle, colorInput.value);
        });

        
        const colorInput = card.querySelector('.sub-narrator-color-input');
        colorInput.addEventListener('input', (event) => {
            const newColor = event.target.value;
            const style = styleSelect.value;
            this.updateSubNarratorConfig(speaker, style, newColor);
        });

        
        const removeBtn = card.querySelector('.sub-narrator-remove-btn');
        removeBtn.addEventListener('click', () => {
            
            card.remove();

            
            this.subNarrators = this.subNarrators.filter(n => n.speaker !== speaker);

            
            this.updateSubNarratorDropdown();

            
            this.updateEmptyMessage();
        });
    }

    updateEmptyMessage() {
        const emptyMessage = document.getElementById('sub-narrator-empty-message');
        const listContainer = document.getElementById('sub-narrator-list');

        if (!emptyMessage || !listContainer) return;

        const hasCards = listContainer.querySelectorAll('.sub-narrator-card').length > 0;
        emptyMessage.style.display = hasCards ? 'none' : 'block';
    }

    updateSubNarratorConfig(speaker, style, color) {
        
        const existing = this.subNarrators.find(n => n.speaker === speaker);
        if (existing) {
            existing.style = style;
            existing.color = color;
        } else {
            this.subNarrators.push({ speaker, style, color });
        }
    }

    setupDownloadButtons(containerElement) {
        containerElement.innerHTML = '';

        
        const webUploadMode = document.getElementById('web-upload-mode')?.checked || false;

        
        if (this.convertedHtmlChunks.length > 1) {
            const zipButton = document.createElement('button');
            zipButton.className = 'btn-download';
            lcSet(zipButton, 'dl.zipAll');
            zipButton.onclick = async () => {
                try {
                    zipButton.disabled = true;
                    lcSet(zipButton, 'dl.zipping');

                    const zip = new JSZip();
                    this.convertedHtmlChunks.forEach((chunk, index) => {
                        const fileName = `${this.fileNameBase}_part${index + 1}.html`;
                        
                        const cleanedChunk = this.removeLogNumbersFromDownload(chunk);
                        zip.file(fileName, cleanedChunk);
                    });

                    const content = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(content);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${this.fileNameBase}_all.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    zipButton.disabled = false;
                    lcSet(zipButton, 'dl.zipAll');
                } catch (error) {
                    console.error(T('log.zipError'), error);
                    alert(T('alert.zipError'));
                    zipButton.disabled = false;
                    lcSet(zipButton, 'dl.zipAll');
                }
            };
            containerElement.appendChild(zipButton);

            
            if (webUploadMode) {
                const webUploadZipButton = document.createElement('button');
                webUploadZipButton.className = 'btn-download';
                webUploadZipButton.style.backgroundColor = '#ff6b35';
                webUploadZipButton.style.color = '#fff';
                lcSet(webUploadZipButton, 'dl.webZipAll');
                webUploadZipButton.onclick = async () => {
                    try {
                        webUploadZipButton.disabled = true;
                        lcSet(webUploadZipButton, 'dl.converting');

                        const zip = new JSZip();
                        const generator = new window.BaseGenerator();

                        this.convertedHtmlChunks.forEach((chunk, index) => {
                            const fileName = `${this.fileNameBase}_part${index + 1}_web.html`;
                            const cleanedChunk = this.removeLogNumbersFromDownload(chunk);
                            const webUploadHtml = generator.convertToWebUploadFormat(
                                cleanedChunk, generator.makeIdSuffix(`${this.fileNameBase}#${index + 1}`));
                            zip.file(fileName, webUploadHtml);
                        });

                        const content = await zip.generateAsync({ type: 'blob' });
                        const url = URL.createObjectURL(content);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${this.fileNameBase}_web_all.zip`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                        webUploadZipButton.disabled = false;
                        lcSet(webUploadZipButton, 'dl.webZipAll');
                    } catch (error) {
                        console.error(T('log.webZipError'), error);
                        alert(T('alert.webZipError'));
                        webUploadZipButton.disabled = false;
                        lcSet(webUploadZipButton, 'dl.webZipAll');
                    }
                };
                containerElement.appendChild(webUploadZipButton);
            }
        }

        
        this.convertedHtmlChunks.forEach((chunk, index) => {
            const button = document.createElement('button');
            button.className = 'btn-download';
            if (this.convertedHtmlChunks.length > 1) lcSet(button, 'dl.part', index + 1);
            else lcSet(button, 'dl.html');
            button.onclick = () => {
                
                const cleanedChunk = this.removeLogNumbersFromDownload(chunk);
                const blob = new Blob([cleanedChunk], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const partSuffix = this.convertedHtmlChunks.length > 1 ? `_part${index + 1}` : '';
                a.download = `${this.fileNameBase}${partSuffix}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
            containerElement.appendChild(button);

            
            if (webUploadMode) {
                const webUploadButton = document.createElement('button');
                webUploadButton.className = 'btn-download';
                webUploadButton.style.backgroundColor = '#ff6b35';
                webUploadButton.style.color = '#fff';
                if (this.convertedHtmlChunks.length > 1) lcSet(webUploadButton, 'dl.webPart', index + 1);
                else lcSet(webUploadButton, 'dl.web');
                webUploadButton.onclick = () => {
                    
                    const cleanedChunk = this.removeLogNumbersFromDownload(chunk);
                    const generator = new window.BaseGenerator();
                    const webUploadHtml = generator.convertToWebUploadFormat(
                        cleanedChunk, generator.makeIdSuffix(`${this.fileNameBase}#${index + 1}`));

                    const blob = new Blob([webUploadHtml], { type: 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const partSuffix = this.convertedHtmlChunks.length > 1 ? `_part${index + 1}` : '';
                    a.download = `${this.fileNameBase}${partSuffix}_web.html`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                };
                containerElement.appendChild(webUploadButton);
            }
        });
    }

    extractTitleFromFilename(filename, titleInput, subtitleInput) {
        
        
        const nameWithoutExt = filename.replace('.html', '');

        const titleMatch = nameWithoutExt.match(/\]\s*(.*?)\s*\[/);
        const title = titleMatch ? titleMatch[1] : nameWithoutExt;

        const participantsMatch = nameWithoutExt.match(/^\[(.*?)\]/);
        const subtitle = participantsMatch ? participantsMatch[1] : '';

        titleInput.value = title;
        subtitleInput.value = subtitle;
    }

    mergeConsecutiveSpeakers(logs) {
        if (logs.length === 0) return logs;

        const merged = [];
        let current = { ...logs[0] };
        
        current.imageUrls = current.imageUrl ? [current.imageUrl] : [];

        for (let i = 1; i < logs.length; i++) {
            const log = logs[i];

            
            if (log.speaker === current.speaker &&
                log.type === current.type &&
                log.type === 'DIALOGUE' &&
                log.tab === current.tab) {
                current.message += '|||' + log.message;
                
                if (log.imageUrl) {
                    current.imageUrls.push(log.imageUrl);
                }
            } else {
                merged.push(current);
                current = { ...log };
                current.imageUrls = current.imageUrl ? [current.imageUrl] : [];
            }
        }
        merged.push(current);

        return merged;
    }

    
    addLogNumbersToPreview(html, showLogNumbers) {
        if (!showLogNumbers) return html;

        
        
        
        
        
        const logNumberStyle = `
        <style id="log-number-preview-style">
            /* 日誌編號的樣式（僅預覽） */
            #ccfolia-original-wrap [data-log-num],
            #ccfolia-novel-wrap [data-log-num],
            #ccfolia-timeline-wrap [data-log-num] {
                position: relative !important;
            }
            [data-log-num]::after {
                content: "#" attr(data-log-num);
                position: absolute;
                top: -8px;
                right: -30px;
                color: #666;
                font-size: 0.7em;
                opacity: 0.5;
                font-weight: normal;
                font-family: monospace;
                background: rgba(0, 0, 0, 0.3);
                padding: 2px 6px;
                border-radius: 3px;
                pointer-events: none;
            }
            /* 格線版面在右側留出空間 */
            .dialogue-block-grid[data-log-num]::after {
                right: -35px;
            }
            /* CCFOLIA 風格的容器撐滿整個頁寬，外側沒有留白。
               編號放在外側會被切掉看不到，所以貼在內側。 */
            #ccfolia-original-wrap [data-log-num]::after {
                top: 4px;
                right: 8px;
            }
        </style>`;

        
        
        if (html.includes('</body>')) {
            return html.replace('</body>', logNumberStyle + '</body>');
        }
        return html.replace('</head>', logNumberStyle + '</head>');
    }

    
    removeLogNumbersFromDownload(html) {
        
        html = html.replace(/<style id="log-number-preview-style">[\s\S]*?<\/style>/g, '');

        
        html = html.replace(/\s+data-log-num="\d+"/g, '');

        
        html = html.replace(/\s+class="[^"]*log-number[^"]*"/g, '');

        console.info(T('log.numbersRemoved'));
        return html;
    }

    
    setupIllustrations(elements) {
        const { illustrationList, addIllustrationBtn, illustrationSection } = elements;

        
        if (illustrationSection) {
            illustrationSection.classList.remove('hidden');
        }

        
        if (addIllustrationBtn) {
            addIllustrationBtn.onclick = () => {
                this.addIllustrationItem(elements);
            };
        }

        
        this.renderIllustrations(elements);
    }

    
    addIllustrationItem(elements, illustration = null) {
        const { illustrationList } = elements;
        const id = illustration ? illustration.id : Date.now();
        const position = illustration ? illustration.position : '';
        const imageDataUrl = illustration ? illustration.imageDataUrl : '';
        const isUrl = illustration ? illustration.isUrl : false;
        const size = illustration ? illustration.size : 'medium';
        const align = illustration ? illustration.align : 'center';

        const itemDiv = document.createElement('div');
        itemDiv.className = 'p-3 bg-gray-800 rounded border border-gray-700';
        itemDiv.dataset.illustrationId = id;

        itemDiv.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="flex-1 space-y-2">
                    <div>
                        <label class="block text-xs mb-1 text-gray-400" ${lcAttrs('ill.position')}>${lcEsc(T('ill.position'))}</label>
                        <input type="number"
                               class="illustration-position w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm"
                               placeholder="${lcEsc(T('ill.positionPh'))}" data-lc-ph="ill.positionPh"
                               min="1"
                               value="${position}">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-xs mb-1 text-gray-400" ${lcAttrs('ill.size')}>${lcEsc(T('ill.size'))}</label>
                            <select class="illustration-size w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs">
                                <option value="small" ${size === 'small' ? 'selected' : ''} ${lcAttrs('ill.size.small')}>${lcEsc(T('ill.size.small'))}</option>
                                <option value="medium" ${size === 'medium' ? 'selected' : ''} ${lcAttrs('ill.size.medium')}>${lcEsc(T('ill.size.medium'))}</option>
                                <option value="large" ${size === 'large' ? 'selected' : ''} ${lcAttrs('ill.size.large')}>${lcEsc(T('ill.size.large'))}</option>
                                <option value="full" ${size === 'full' ? 'selected' : ''} ${lcAttrs('ill.size.full')}>${lcEsc(T('ill.size.full'))}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs mb-1 text-gray-400" ${lcAttrs('ill.align')}>${lcEsc(T('ill.align'))}</label>
                            <select class="illustration-align w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs">
                                <option value="left" ${align === 'left' ? 'selected' : ''} ${lcAttrs('ill.align.left')}>${lcEsc(T('ill.align.left'))}</option>
                                <option value="center" ${align === 'center' ? 'selected' : ''} ${lcAttrs('ill.align.center')}>${lcEsc(T('ill.align.center'))}</option>
                                <option value="right" ${align === 'right' ? 'selected' : ''} ${lcAttrs('ill.align.right')}>${lcEsc(T('ill.align.right'))}</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs mb-1 text-gray-400" ${lcAttrs('ill.source')}>${lcEsc(T('ill.source'))}</label>
                        <div class="flex gap-2 mb-2">
                            <label class="flex items-center cursor-pointer">
                                <input type="radio" name="img-source-${id}" value="file" class="img-source-radio mr-1" ${!isUrl ? 'checked' : ''}>
                                <span class="text-xs" ${lcAttrs('common.fileUpload')}>${lcEsc(T('common.fileUpload'))}</span>
                            </label>
                            <label class="flex items-center cursor-pointer">
                                <input type="radio" name="img-source-${id}" value="url" class="img-source-radio mr-1" ${isUrl ? 'checked' : ''}>
                                <span class="text-xs" ${lcAttrs('ill.sourceUrl')}>${lcEsc(T('ill.sourceUrl'))}</span>
                            </label>
                        </div>
                        <input type="file"
                               class="illustration-file w-full text-sm ${isUrl ? 'hidden' : ''}"
                               accept="image/*">
                        <input type="text"
                               class="illustration-url w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm ${!isUrl ? 'hidden' : ''}"
                               placeholder="https://example.com/image.jpg"
                               value="${isUrl ? imageDataUrl : ''}">
                        <p class="illustration-warning text-xs text-yellow-400 mt-1" ${lcAttrs(isUrl ? 'ill.warnUrl' : 'ill.warnFile')}>
                            ${lcEsc(T(isUrl ? 'ill.warnUrl' : 'ill.warnFile'))}
                        </p>
                    </div>
                    ${imageDataUrl && !isUrl ? `
                    <div class="illustration-preview mt-2">
                        <img src="${imageDataUrl}" class="max-w-full max-h-32 rounded border border-gray-600">
                    </div>
                    ` : ''}
                    ${imageDataUrl && isUrl ? `
                    <div class="illustration-preview mt-2">
                        <img src="${imageDataUrl}" class="max-w-full max-h-32 rounded border border-gray-600" onerror="this.parentElement.innerHTML='<p class=text-red-400 data-lc=ill.imgError>${lcEsc(T('ill.imgError'))}</p>'">
                    </div>
                    ` : ''}
                </div>
                <button class="remove-illustration-btn px-2 py-1 bg-red-900 hover:bg-red-800 text-red-200 text-xs rounded transition-colors">
                    ×
                </button>
            </div>
        `;

        
        const fileInput = itemDiv.querySelector('.illustration-file');
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    
                    const dataUrl = await this.resizeImage(file, 800, 800, 0.9);

                    
                    let previewDiv = itemDiv.querySelector('.illustration-preview');
                    if (!previewDiv) {
                        previewDiv = document.createElement('div');
                        previewDiv.className = 'illustration-preview mt-2';
                        fileInput.parentElement.appendChild(previewDiv);
                    }
                    previewDiv.innerHTML = `<img src="${dataUrl}" class="max-w-full max-h-32 rounded border border-gray-600">`;

                    
                    const positionInput = itemDiv.querySelector('.illustration-position');
                    const sizeSelect = itemDiv.querySelector('.illustration-size');
                    const alignSelect = itemDiv.querySelector('.illustration-align');
                    this.updateIllustration(id, parseInt(positionInput.value), dataUrl, false, sizeSelect.value, alignSelect.value);

                    console.info(T('log.illUploaded'));
                } catch (error) {
                    alert(T('alert.illUploadFailed', error.message));
                }
            }
        });

        
        const radioButtons = itemDiv.querySelectorAll('.img-source-radio');
        const urlInput = itemDiv.querySelector('.illustration-url');

        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isUrlMode = e.target.value === 'url';
                fileInput.classList.toggle('hidden', isUrlMode);
                urlInput.classList.toggle('hidden', !isUrlMode);

                
                const warningMsg = itemDiv.querySelector('.illustration-warning');
                if (warningMsg) {
                    if (isUrlMode) {
                        lcSet(warningMsg, 'ill.warnUrl');
                    } else {
                        lcSet(warningMsg, 'ill.warnFile');
                    }
                }
            });
        });

        
        urlInput.addEventListener('input', () => {
            const url = urlInput.value.trim();
            if (url) {
                
                let previewDiv = itemDiv.querySelector('.illustration-preview');
                if (!previewDiv) {
                    previewDiv = document.createElement('div');
                    previewDiv.className = 'illustration-preview mt-2';
                    urlInput.parentElement.appendChild(previewDiv);
                }
                previewDiv.innerHTML = `<img src="${url}" class="max-w-full max-h-32 rounded border border-gray-600" onerror="this.parentElement.innerHTML='<p class=text-red-400 data-lc=ill.imgError>${lcEsc(T('ill.imgError'))}</p>'">`;

                
                updateIllustrationData();
            }
        });

        
        const sizeSelect = itemDiv.querySelector('.illustration-size');
        const alignSelect = itemDiv.querySelector('.illustration-align');

        const updateIllustrationData = () => {
            const isUrlMode = itemDiv.querySelector('.img-source-radio:checked').value === 'url';
            let imageData = '';

            if (isUrlMode) {
                imageData = urlInput.value.trim();
            } else {
                const previewImg = itemDiv.querySelector('.illustration-preview img');
                imageData = previewImg ? previewImg.src : '';
            }

            this.updateIllustration(
                id,
                parseInt(positionInput.value),
                imageData,
                isUrlMode,
                sizeSelect.value,
                alignSelect.value
            );
        };

        
        const positionInput = itemDiv.querySelector('.illustration-position');
        positionInput.addEventListener('change', updateIllustrationData);

        
        sizeSelect.addEventListener('change', updateIllustrationData);

        
        alignSelect.addEventListener('change', updateIllustrationData);

        
        const removeBtn = itemDiv.querySelector('.remove-illustration-btn');
        removeBtn.addEventListener('click', () => {
            this.removeIllustration(id);
            itemDiv.remove();
        });

        illustrationList.appendChild(itemDiv);

        
        if (!illustration) {
            this.illustrations.push({ id, position: 0, imageDataUrl: '', isUrl: false, size: 'medium', align: 'center' });
        }
    }

    
    updateIllustration(id, position, imageDataUrl, isUrl = false, size = 'medium', align = 'center') {
        const index = this.illustrations.findIndex(ill => ill.id === id);
        if (index !== -1) {
            this.illustrations[index] = { id, position, imageDataUrl, isUrl, size, align };
        } else {
            this.illustrations.push({ id, position, imageDataUrl, isUrl, size, align });
        }
        const sourceType = isUrl ? 'URL' : 'Data URL';
        console.info(T('log.illUpdated', position, sourceType, size, align));
    }

    
    removeIllustration(id) {
        this.illustrations = this.illustrations.filter(ill => ill.id !== id);
    }

    
    renderIllustrations(elements) {
        const { illustrationList } = elements;
        illustrationList.innerHTML = '';

        this.illustrations.forEach(illustration => {
            this.addIllustrationItem(elements, illustration);
        });
    }
}


















const debugLogs = [];
let errorCount = 0;

const debugLogsContainer = document.getElementById('debug-logs');
const debugConsole = document.getElementById('debug-console');
const debugToggleBtn = document.getElementById('debug-toggle-btn');
const debugCopyBtn = document.getElementById('debug-copy-btn');
const debugClearBtn = document.getElementById('debug-clear-btn');
const debugErrorBadge = document.getElementById('debug-error-badge');


function addDebugLog(type, ...args) {
    const timestamp = new Date().toLocaleTimeString(T('debug.timeLocale'));
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');

    debugLogs.push({ type, timestamp, message });

    
    const typeColors = {
        log: 'text-gray-300',
        info: 'text-blue-400',
        warn: 'text-yellow-400',
        error: 'text-red-400'
    };

    const typeIcons = {
        log: T('debug.type.log'),
        info: T('debug.type.info'),
        warn: T('debug.type.warn'),
        error: T('debug.type.error')
    };

    const logElement = document.createElement('div');
    logElement.className = `${typeColors[type]} py-1 border-b border-gray-800`;
    logElement.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${typeIcons[type]} ${message}`;

    
    /* 上游比對提示文字的內容來找；文字會隨語言變，改用 class 找。 */
    const placeholder = debugLogsContainer.querySelector('.debug-empty');
    if (placeholder) {
        placeholder.remove();
    }

    debugLogsContainer.appendChild(logElement);
    debugLogsContainer.scrollTop = debugLogsContainer.scrollHeight;

    
    if (type === 'error') {
        errorCount++;
        debugErrorBadge.textContent = errorCount;
        debugErrorBadge.classList.remove('hidden');
        
        if (debugConsole.classList.contains('hidden')) {
            debugConsole.classList.remove('hidden');
        }
    }
}


const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
};


console.log = function(...args) {
    originalConsole.log.apply(console, args);
    addDebugLog('log', ...args);
};

console.info = function(...args) {
    originalConsole.info.apply(console, args);
    addDebugLog('info', ...args);
};

console.warn = function(...args) {
    originalConsole.warn.apply(console, args);
    addDebugLog('warn', ...args);
};

console.error = function(...args) {
    originalConsole.error.apply(console, args);
    addDebugLog('error', ...args);
};


debugToggleBtn.addEventListener('click', () => {
    debugConsole.classList.toggle('hidden');
});


debugCopyBtn.addEventListener('click', () => {
    const logText = debugLogs.map(log => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`).join('\n');
    navigator.clipboard.writeText(logText).then(() => {
        debugCopyBtn.textContent = T('debug.copied');
        setTimeout(() => {
            debugCopyBtn.textContent = T('debug.copy');
        }, 2000);
    }).catch(err => {
        alert(T('alert.copyFailed', err.message));
    });
});


debugClearBtn.addEventListener('click', () => {
    debugLogs.length = 0;
    debugLogsContainer.innerHTML = `<div class="text-gray-500 debug-empty" ${lcAttrs('debug.empty')}>${lcEsc(T('debug.empty'))}</div>`;
    errorCount = 0;
    debugErrorBadge.classList.add('hidden');
});


window.addEventListener('error', (event) => {
    console.error(T('log.globalError'), event.error?.message || event.message, event.error?.stack || '');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error(T('log.unhandled'), event.reason);
});


const elements = {
    logFileInput: document.getElementById('logFile'),
    addLogFileBtn: document.getElementById('add-log-file-btn'),
    addLogFileInput: document.getElementById('addLogFile'),
    previewRangeBox: document.getElementById('preview-range'),
    previewStartInput: document.getElementById('preview-start'),
    previewCountSelect: document.getElementById('preview-count'),
    previewApplyBtn: document.getElementById('preview-apply'),
    convertBtn: document.getElementById('convertBtn'),
    resultSection: document.getElementById('result'),
    statusDiv: document.getElementById('status'),
    previewFrame: document.getElementById('preview-frame'),
    downloadContainer: document.getElementById('download-container'),
    profileSettingsSection: document.getElementById('profile-settings'),
    profileUploaderDiv: document.getElementById('profile-uploader'),
    profileImageSection: document.getElementById('profile-image-section'),
    characterColorSection: document.getElementById('character-color-section'),
    characterColorPicker: document.getElementById('character-color-picker'),
    narratorSelect: document.getElementById('narrator-select'),
    narrationDisplayModeSelect: document.getElementById('narration-display-mode'),
    narrationCenterSection: document.getElementById('narration-center-section'),
    narrationCenterCheckbox: document.getElementById('narration-center'),
    oocTabSelect: document.getElementById('ooc-tab-select'),
    customTitleInput: document.getElementById('custom-title'),
    customSubtitleInput: document.getElementById('custom-subtitle'),
    customSummaryInput: document.getElementById('custom-summary'),
    customFontUrl: document.getElementById('custom-font-url'),
    customFontFamily: document.getElementById('custom-font-family'),
    mergeConsecutiveCheckbox: document.getElementById('merge-consecutive'),
    fontSizeSelect: document.getElementById('font-size'),
    lineHeightSelect: document.getElementById('line-height'),
    pageWidthSelect: document.getElementById('page-width'),
    chatModeSelect: document.getElementById('chat-mode'),
    showChatCountCheckbox: document.getElementById('show-chat-count'),
    systemModeSelect: document.getElementById('system-mode'),
    systemBgColorInput: document.getElementById('system-bg-color'),
    systemBorderColorInput: document.getElementById('system-border-color'),
    systemTextColorInput: document.getElementById('system-text-color'),
    narrationBgColorInput: document.getElementById('narration-bg-color'),
    narrationTextColorInput: document.getElementById('narration-text-color'),
    themeBgColorInput: document.getElementById('theme-bg-color'),
    themeContainerColorInput: document.getElementById('theme-container-color'),
    themeTextColorInput: document.getElementById('theme-text-color'),
    themeAccentColorInput: document.getElementById('theme-accent-color'),
    styleRadios: document.querySelectorAll('input[name="style"]'),
    splitMethodRadios: document.querySelectorAll('input[name="split-method"]'),
    logLimitCountInput: document.getElementById('log-limit-count'),
    logLimitSizeInput: document.getElementById('log-limit-size'),
    logLimitFilesInput: document.getElementById('log-limit-files'),
    splitCountRadio: document.getElementById('split-count'),
    splitSizeRadio: document.getElementById('split-size'),
    splitFilesRadio: document.getElementById('split-files'),
    outputOptionsSection: document.getElementById('output-options'),
    splitOptionsSection: document.getElementById('split-options'),
    tabVisibilitySection: document.getElementById('tab-visibility-section'),
    tabVisibilityCheckboxes: document.getElementById('tab-visibility-checkboxes'),
    tabStyleSection: document.getElementById('tab-style-section'),
    tabStylePicker: document.getElementById('tab-style-picker'),
    subNarratorSection: document.getElementById('sub-narrator-section'),
    novelTypographyOption: document.getElementById('novel-typography-option'),
    novelTypographyToggle: document.getElementById('novel-typography-toggle'),
    longNameWrapCheckbox: document.getElementById('long-name-wrap'),
    timelineDialogueLayoutSection: document.getElementById('timeline-dialogue-layout-section'),
    dialogueLayoutModeSelect: document.getElementById('dialogue-layout-mode'),
    dialogueSeparatorSection: document.getElementById('dialogue-separator-section'),
    dialogueSeparatorTypeSelect: document.getElementById('dialogue-separator-type'),
    customSeparatorInputSection: document.getElementById('custom-separator-input-section'),
    customSeparatorValueInput: document.getElementById('custom-separator-value'),
    showLogNumbersCheckbox: document.getElementById('show-log-numbers'),
    illustrationSection: document.getElementById('illustration-section'),
    illustrationList: document.getElementById('illustration-list'),
    addIllustrationBtn: document.getElementById('add-illustration-btn')
};


const generators = {
    novel: new NovelGenerator(),
    timeline: new TimelineGenerator(),
    original: new OriginalGenerator()
};


window.BaseGenerator = BaseGenerator;




const uiController = new UIController();




const handlers = {
    parseLog: parseCocLog,
    extractTabs: extractTabs,
    detectFormat: detectLogFormat,
    parseV2: parseCcfoliaV2Log,
    applyRoles: applyLogRoles,
    generateHTML: (style, logs, fileName, profileImages, splitMethod, splitValue, customOptions = {}) => {
        const generator = generators[style];
        if (!generator) {
            throw new Error(`Unknown style: ${style}`);
        }
        return generator.generateChunks(logs, fileName, profileImages, splitMethod, splitValue, customOptions);
    }
};




uiController.initEventListeners(elements, handlers);


const tabButtons = document.querySelectorAll('.tab-button');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetTabId = button.getAttribute('data-tab');
        const targetTab = document.getElementById(targetTabId);

        if (!targetTab) return; // 沒有對應的分頁就略過

        
        const tabContainer = button.closest('.tab-container');
        const containerButtons = tabContainer.querySelectorAll('.tab-button');
        const containerContents = tabContainer.querySelectorAll('.tab-content');

        
        containerButtons.forEach(btn => btn.classList.remove('active'));
        containerContents.forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });

        
        button.classList.add('active');
        targetTab.classList.add('active');
        targetTab.style.display = 'block';

    });
});


/* 上游在這裡用 applyRoomIdAvailability() 藏起 Room ID 分頁，並把「從日誌取得表情圖片」
 * 設為停用、隱藏。收錄版已拿掉 Room ID，直接套用同樣的初始狀態。 */
uiController.resetLogImageOption();




const enableTabColorsCheckbox = document.getElementById('enable-tab-colors');
const tabColorPicker = document.getElementById('tab-color-picker');

if (enableTabColorsCheckbox) {
    enableTabColorsCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            tabColorPicker.classList.remove('hidden');
        } else {
            tabColorPicker.classList.add('hidden');
        }
    });
}


const colorPresets = {
'black-red': {
        systemBg: '#ffeb7a',
        systemBorder: '#7f1d1d',
        systemText: '#383b8a',
        narrationBg: '#30364f',
        narrationText: '#bdc4d1',
        themeBg: '#121212',
        themeContainer: '#212431',
        themeText: '#e5e7eb',
        themeAccent: '#7f1d1d'
    },
    'judgment': {
        systemBg: '#eef2ff',
        systemBorder: '#ca2121',
        systemText: '#ef4444',
        narrationBg: '#dfe5ec',
        narrationText: '#435070',
        themeBg: '#a1b0bf',
        themeContainer: '#dfe5ec',
        themeText: '#2a2c32',
        themeAccent: '#3c6cdd'
    },
    'monochrome': {
        systemBg: '#f5f5f5',
        systemBorder: '#666666',
        systemText: '#1a1a1a',
        narrationBg: '#333333',
        narrationText: '#cccccc',
        themeBg: '#1a1a1a',
        themeContainer: '#2a2a2a',
        themeText: '#e0e0e0',
        themeAccent: '#555555'
    },
    'pastel': {
        systemBg: '#fff5f7',
        systemBorder: '#fbb6ce',
        systemText: '#831843',
        narrationBg: '#e6f7ff',
        narrationText: '#0c4a6e',
        themeBg: '#fef6fb',
        themeContainer: '#fef0f5',
        themeText: '#4a5568',
        themeAccent: '#ed64a6'
    },
    'ocean': {
        systemBg: '#e0f2fe',
        systemBorder: '#38bdf8',
        systemText: '#0c4a6e',
        narrationBg: '#1e3a5f',
        narrationText: '#93c5fd',
        themeBg: '#0c1e33',
        themeContainer: '#1e3a5f',
        themeText: '#e0f2fe',
        themeAccent: '#0284c7'
    },
    'pink': {
        systemBg: '#fef3f6',
        systemBorder: '#fcc6dd',
        systemText: '#9d174d',
        narrationBg: '#fef3f6',
        narrationText: '#9d174d',
        themeBg: '#fffbfc',
        themeContainer: '#fff0f5',
        themeText: '#9d174d',
        themeAccent: '#fbb6ce'
    },
    'spring': {
        systemBg: '#f0fdf4',
        systemBorder: '#86efac',
        systemText: '#166534',
        narrationBg: '#fef3f6',
        narrationText: '#be185d',
        themeBg: '#fefce8',
        themeContainer: '#fef9e7',
        themeText: '#4a5568',
        themeAccent: '#84cc16'
    },
    'summer': {
        systemBg: '#cffafe',
        systemBorder: '#22d3ee',
        systemText: '#0e7490',
        narrationBg: '#f0f9ff',
        narrationText: '#0284c7',
        themeBg: '#f0fdfa',
        themeContainer: '#ccfbf1',
        themeText: '#134e4a',
        themeAccent: '#14b8a6'
    },
    'autumn': {
        systemBg: '#fed7aa',
        systemBorder: '#fb923c',
        systemText: '#9a3412',
        narrationBg: '#fef3c7',
        narrationText: '#92400e',
        themeBg: '#fffbeb',
        themeContainer: '#fef3c7',
        themeText: '#78350f',
        themeAccent: '#f59e0b'
    },
    'winter': {
        systemBg: '#dbeafe',
        systemBorder: '#93c5fd',
        systemText: '#1e3a8a',
        narrationBg: '#f0f9ff',
        narrationText: '#075985',
        themeBg: '#f8fafc',
        themeContainer: '#f1f5f9',
        themeText: '#334155',
        themeAccent: '#60a5fa'
    },
    'ccfolia': {
        systemBg: '#e0f2fe',
        systemBorder: '#4297ae',
        systemText: '#0c4a6e',
        narrationBg: '#2a2a2a',
        narrationText: '#d1d5db',
        themeBg: '#1e1e1e',
        themeContainer: '#2a2a2a',
        themeText: '#e5e7eb',
        themeAccent: '#3f51b5'
    }
};


const colorPresetSelect = document.getElementById('color-preset');
if (colorPresetSelect) {
    colorPresetSelect.addEventListener('change', (e) => {
        const preset = colorPresets[e.target.value];
        if (preset) {
            elements.systemBgColorInput.value = preset.systemBg;
            elements.systemBorderColorInput.value = preset.systemBorder;
            elements.systemTextColorInput.value = preset.systemText;
            elements.narrationBgColorInput.value = preset.narrationBg;
            elements.narrationTextColorInput.value = preset.narrationText;
            elements.themeBgColorInput.value = preset.themeBg;
            elements.themeContainerColorInput.value = preset.themeContainer;
            elements.themeTextColorInput.value = preset.themeText;
            elements.themeAccentColorInput.value = preset.themeAccent;
        }
        
        uiController.saveSettings(elements);
    });
}


const colorInputs = [
    elements.systemBgColorInput,
    elements.systemBorderColorInput,
    elements.systemTextColorInput,
    elements.narrationBgColorInput,
    elements.narrationTextColorInput,
    elements.themeBgColorInput,
    elements.themeContainerColorInput,
    elements.themeTextColorInput,
    elements.themeAccentColorInput
];

colorInputs.forEach(input => {
    if (input) {
        input.addEventListener('input', () => {
            if (colorPresetSelect && colorPresetSelect.value !== 'custom') {
                colorPresetSelect.value = 'custom';
                
                uiController.saveSettings(elements);
            }
        });
    }
});







const resizeCheckbox = document.getElementById('resize-profile-images');
const qualityLabel = document.getElementById('image-quality-label');
const qualityPresetSelect = document.getElementById('image-quality-preset');
const customQualitySettings = document.getElementById('custom-quality-settings');

if (resizeCheckbox && qualityLabel) {
    const updateQualityVisibility = () => {
        const isResizeEnabled = resizeCheckbox.checked;
        qualityLabel.style.opacity = isResizeEnabled ? '1' : '0.4';
        qualityLabel.style.pointerEvents = isResizeEnabled ? 'auto' : 'none';
        
        if (!isResizeEnabled && customQualitySettings) {
            customQualitySettings.classList.add('hidden');
        }
    };
    resizeCheckbox.addEventListener('change', updateQualityVisibility);
    updateQualityVisibility();
}


let reprocessTimer = null;
const statusDiv = document.getElementById('status');

function scheduleReprocess(delay = 0) {
    if (reprocessTimer) clearTimeout(reprocessTimer);
    reprocessTimer = setTimeout(async () => {
        try {
            
            if (uiController.v2Data) {
                if (statusDiv) lcSet(statusDiv, 'status.reoptimizing');
                await uiController.resizeV2Avatars(statusDiv);
            }
            if (Object.keys(uiController.profileImageSources).length > 0) {
                await uiController.reprocessAllProfileImages(statusDiv);
            } else if (uiController.v2Data && statusDiv) {
                lcSet(statusDiv, 'status.optimized');
                setTimeout(() => { lcSet(statusDiv, null); }, 2000);
            }
        } catch (error) {
            console.error(T('log.reprocessError'), error);
            if (statusDiv) lcSet(statusDiv, 'status.reprocessError', error.message || error);
        }
    }, delay);
}

if (qualityPresetSelect && customQualitySettings) {
    qualityPresetSelect.addEventListener('change', () => {
        if (qualityPresetSelect.value === 'custom') {
            customQualitySettings.classList.remove('hidden');
        } else {
            customQualitySettings.classList.add('hidden');
            scheduleReprocess();
        }
    });
}


if (resizeCheckbox) {
    resizeCheckbox.addEventListener('change', () => {
        scheduleReprocess();
    });
}


const customQualitySlider = document.getElementById('custom-quality-slider');
const customQualityInfo = document.getElementById('custom-quality-info');

function updateCustomSliderInfo() {
    if (!customQualitySlider || !customQualityInfo) return;
    const v = parseInt(customQualitySlider.value);
    
    let estimate;
    if (v <= 15) estimate = T('quality.perImage', '~1KB');
    else if (v <= 30) estimate = T('quality.perImage', '~3KB');
    else if (v <= 50) estimate = T('quality.perImage', '~8KB');
    else if (v <= 70) estimate = T('quality.perImage', '~15KB');
    else if (v <= 85) estimate = T('quality.perImage', '~25KB');
    else estimate = T('quality.perImage', '~40KB');
    customQualityInfo.textContent = estimate;
}

if (customQualitySlider) {
    customQualitySlider.addEventListener('input', updateCustomSliderInfo);
    customQualitySlider.addEventListener('change', () => {
        scheduleReprocess(300);
    });
    updateCustomSliderInfo();
}

/* ---------- TRPG Toolkit 合輯：語言切換 ---------- */
/* HTML 上的固定文字由 applyStaticDom() 換掉；這裡重畫 JS 寫進畫面的部分。
 * 已經產出的 HTML（預覽與下載）維持轉換當下的語言，要換語言就再按一次轉換。 */
I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => {
    relabelDynamic();
    uiController.renderFileNotice();
    uiController.updateLoadedFileUI(elements, handlers);
    updateCustomSliderInfo();
});
