// --- 常數與工具函式 ---
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function decomposeHangul(char) {
    const code = char.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
        const offset = code - 0xAC00;
        const jongIdx = offset % 28;
        const jungIdx = Math.floor((offset - jongIdx) / 28) % 21;
        const choIdx = Math.floor(Math.floor((offset - jongIdx) / 28) / 21);

        const steps = [];
        steps.push(CHO[choIdx]);
        steps.push(String.fromCharCode(0xAC00 + (choIdx * 21 * 28) + (jungIdx * 28)));
        if (jongIdx > 0) steps.push(char);
        return steps;
    }
    return [char];
}
// 用於故障效果的隨機萬國碼字元產生器
function getRandomGlitchChar(currentGlitchState) {
    let ranges = [];
    
    if (currentGlitchState.glitchRangeLatin) ranges.push([0x0021, 0x007E]);
    if (currentGlitchState.glitchRangeKana) ranges.push([0x3041, 0x3096], [0x30A1, 0x30FA]);
    if (currentGlitchState.glitchRangeHangul) ranges.push([0x3131, 0x318E], [0xAC00, 0xD7A3]);
    if (currentGlitchState.glitchRangeSymbols) ranges.push([0x2500, 0x257F], [0x25A0, 0x25FF]);
    
    if (ranges.length === 0) {
        ranges = [[0x0021, 0x007E]]; // 若未選取任何範圍，預設使用拉丁字母
    }

    const range = ranges[Math.floor(Math.random() * ranges.length)];
    const code = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    return String.fromCharCode(code);
}

// --- 狀態管理 ---
let currentTab = 'typing'; // 'typing', 'glitch', 'credit', 'karaoke'

const DEFAULT_STATE = {
    text: T('sample.typingText'), fontFamilySelect: "Noto Sans KR", fontFamilyCustom: "", fontFamily: "Noto Sans KR",
    fontSize: 48, scaleX: 100, letterSpacing: 0, lineHeight: 1.2, isBold: false, isItalic: false, isUnderline: false, isStrikethrough: false,
    writingMode: "horizontal", textAlign: "center", verticalAlign: "center", direction: "forward",
    shapeMode: "none", shapeSize: 100, shapeRotateSpeed: 0,
    useBackgroundColor: false, backgroundColor: "#000000", fillColor: "#ffffff", strokeColor: "#000000", strokeWidth: 4,
    shadowColor: "#000000", shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 2,
    fps: 12, holdLast: 2000, fadeMode: "none", fadeOutDuration: 1000, canvasWidth: 600, canvasHeight: 300, audioMode: "overlap", apngCompress: true
};

const GLITCH_DEFAULT_STATE = {
    text: T('sample.glitchText'), fontFamilySelect: "Noto Sans KR", fontFamilyCustom: "", fontFamily: "Noto Sans KR",
    fontSize: 48, scaleX: 100, letterSpacing: 0, lineHeight: 1.2, isBold: true, isItalic: false, isUnderline: false, isStrikethrough: false,
    writingMode: "horizontal", textAlign: "center", verticalAlign: "center",
    useBackgroundColor: false, backgroundColor: "#000000", fillColor: "#ff0033", strokeColor: "#000000", strokeWidth: 2,
    shadowColor: "#ff0033", shadowBlur: 8, shadowOffsetX: 0, shadowOffsetY: 0,
    glitchRangeLatin: true, glitchRangeKana: true, glitchRangeHangul: true, glitchRangeSymbols: true,
    simultaneousMode: false, // 新增的選項
    fps: 15, holdLast: 2000, glitchCount: 3, canvasWidth: 600, canvasHeight: 300, apngCompress: true
};

const CREDIT_DEFAULT_STATE = {
    text: T('sample.creditText'),
    fontFamilySelect: "Noto Sans KR", fontFamilyCustom: "", fontFamily: "Noto Sans KR",
    fontSize: 32, lineHeight: 1.5, textAlign: "center", isBold: false,
    useBackgroundColor: false, backgroundColor: "#000000", fillColor: "#ffffff", strokeColor: "#000000", strokeWidth: 2,
    shadowColor: "#000000", shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 2,
    fps: 12, totalDuration: 20, splitMode: false, canvasWidth: 720, canvasHeight: 400, silentAudioExtension: 0, apngCompress: true
};

const KARAOKE_DEFAULT_STATE = {
    text: T('sample.karaokeText'),
    fontFamilySelect: "Noto Sans KR", fontFamilyCustom: "", fontFamily: "Noto Sans KR",
    fontSize: 48, scaleX: 100, letterSpacing: 0, lineHeight: 1.5, isBold: true, isItalic: false,
    textAlign: "center", verticalAlign: "center",
    useBackgroundColor: false, backgroundColor: "#000000",
    fillColorBefore: "#ffffff", strokeColorBefore: "#333333",
    fillColorAfter: "#ffe66d", strokeColorAfter: "#ff2e63",
    strokeWidth: 6, shadowColor: "#000000", shadowBlur: 6, shadowOffsetX: 2, shadowOffsetY: 2,
    scanDirection: "ltr", scanSoftness: 14,
    scanGlow: true, scanGlowColor: "#ffffff", scanGlowWidth: 26,
    lineMode: "all", rollingLines: 2, lineFade: 0.25, timingMode: "chars",
    totalDuration: 8, leadIn: 0.5, holdLast: 1500,
    fps: 20, canvasWidth: 720, canvasHeight: 300, apngCompress: true
};

// 與匯出格式相關的共用設定（與分頁無關）
const EXPORT_DEFAULT_STATE = { webpLossless: true, webpQuality: 92 };

let state = { ...DEFAULT_STATE };
let glitchState = { ...GLITCH_DEFAULT_STATE };
let creditState = { ...CREDIT_DEFAULT_STATE };
let karaokeState = { ...KARAOKE_DEFAULT_STATE };
let exportState = { ...EXPORT_DEFAULT_STATE };

let loadedFonts = new Set();
let animationInterval = null;

let generatedFrames = []; // 打字效果用
let glitchGeneratedFrames = []; // 故障效果用
let karaokeFrames = []; // 卡拉OK效果用（僅保留各影格的播放時刻）
let rawTypingFrameCount = 0;

let creditFramesInfo = { totalFrames: 0, textBlock: "" }; 

let currentFrameIndex = 0;
let isPlaying = true;
let isFinished = false;

let audioCtx = null;
let uploadedAudioBuffer = null;
let generatedAudioBlobUrl = null;

// UI 元素快取
const inputs = Object.keys(DEFAULT_STATE).reduce((acc, key) => {
    const el = document.getElementById(`val-${key}`);
    if (el) acc[key] = el; return acc;
}, {});

const glitchInputs = Object.keys(GLITCH_DEFAULT_STATE).reduce((acc, key) => {
    const el = document.getElementById(`val-glitch-${key}`);
    if (el) acc[key] = el; return acc;
}, {});

const creditInputs = Object.keys(CREDIT_DEFAULT_STATE).reduce((acc, key) => {
    const el = document.getElementById(`val-credit-${key}`);
    if (el) acc[key] = el; return acc;
}, {});

const karaokeInputs = Object.keys(KARAOKE_DEFAULT_STATE).reduce((acc, key) => {
    const el = document.getElementById(`val-karaoke-${key}`);
    if (el) acc[key] = el; return acc;
}, {});

const exportInputs = Object.keys(EXPORT_DEFAULT_STATE).reduce((acc, key) => {
    const el = document.getElementById(`val-export-${key}`);
    if (el) acc[key] = el; return acc;
}, {});

const splitModeRadios = document.querySelectorAll('input[name="val-credit-splitMode"]');

const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const statusEl = document.getElementById('preview-status');
const exportOverlay = document.getElementById('export-overlay');

// --- 分頁切換邏輯 ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('text-white', 'border-[#89b4fa]', 'active');
            b.classList.add('text-gray-400', 'border-transparent');
        });
        e.target.classList.remove('text-gray-400', 'border-transparent');
        e.target.classList.add('text-white', 'border-[#89b4fa]', 'active');
        
        currentTab = e.target.getAttribute('data-target');
        
        ['typing', 'glitch', 'credit', 'karaoke'].forEach(name => {
            document.getElementById(`panel-${name}`).style.display = 'none';
        });
        document.getElementById(`panel-${currentTab}`).style.display = 'block';

        if (currentTab === 'typing') {
            canvas.width = state.canvasWidth; canvas.height = state.canvasHeight;
            updateStateFromUI();
        } else if (currentTab === 'glitch') {
            canvas.width = glitchState.canvasWidth; canvas.height = glitchState.canvasHeight;
            updateGlitchStateFromUI();
        } else if (currentTab === 'karaoke') {
            canvas.width = karaokeState.canvasWidth; canvas.height = karaokeState.canvasHeight;
            updateKaraokeStateFromUI();
        } else {
            canvas.width = creditState.canvasWidth; canvas.height = creditState.canvasHeight;
            updateCreditStateFromUI();
        }
    });
});

// --- 資料同步（打字效果） ---
function updateStateFromUI() {
    if (currentTab !== 'typing') return;
    for (const key in inputs) {
        const el = inputs[key];
        if (el.type === 'number') state[key] = parseFloat(el.value);
        else if (el.type === 'checkbox') state[key] = el.checked;
        else if (el.type !== 'file') state[key] = el.value;
    }
    if (state.fontFamilySelect === 'custom') { state.fontFamily = state.fontFamilyCustom || 'sans-serif'; document.getElementById('custom-font-container').style.display = 'block'; } 
    else { state.fontFamily = state.fontFamilySelect; document.getElementById('custom-font-container').style.display = 'none'; }

    loadFont(state.fontFamilySelect !== 'custom' ? state.fontFamilySelect : null);
    generateTypingFrames();
    playPreview();
}

// --- 資料同步（故障效果） ---
function updateGlitchStateFromUI() {
    if (currentTab !== 'glitch') return;
    for (const key in glitchInputs) {
        const el = glitchInputs[key];
        if (el.type === 'number') glitchState[key] = parseFloat(el.value);
        else if (el.type === 'checkbox') glitchState[key] = el.checked;
        else if (el.type !== 'file') glitchState[key] = el.value;
    }
    if (glitchState.fontFamilySelect === 'custom') { glitchState.fontFamily = glitchState.fontFamilyCustom || 'sans-serif'; document.getElementById('custom-glitch-font-container').style.display = 'block'; } 
    else { glitchState.fontFamily = glitchState.fontFamilySelect; document.getElementById('custom-glitch-font-container').style.display = 'none'; }

    loadFont(glitchState.fontFamilySelect !== 'custom' ? glitchState.fontFamilySelect : null);
    generateGlitchFrames();
    playPreview();
}

// --- 資料同步（片尾字幕） ---
function updateCreditStateFromUI() {
    if (currentTab !== 'credit') return;
    for (const key in creditInputs) {
        const el = creditInputs[key];
        if (el.type === 'number') creditState[key] = parseFloat(el.value);
        else if (el.type === 'checkbox') creditState[key] = el.checked;
        else if (el.type !== 'file' && el.type !== 'radio') creditState[key] = el.value;
    }
    const checkedRadio = document.querySelector('input[name="val-credit-splitMode"]:checked');
    if (checkedRadio) creditState.splitMode = checkedRadio.value === 'true';
    if (creditState.fontFamilySelect === 'custom') { creditState.fontFamily = creditState.fontFamilyCustom || 'sans-serif'; document.getElementById('custom-credit-font-container').style.display = 'block'; } 
    else { creditState.fontFamily = creditState.fontFamilySelect; document.getElementById('custom-credit-font-container').style.display = 'none'; }

    loadFont(creditState.fontFamilySelect !== 'custom' ? creditState.fontFamilySelect : null);
    generateCreditFrames();
    playPreview();
}

// --- 資料同步（卡拉OK效果） ---
function updateKaraokeStateFromUI() {
    if (currentTab !== 'karaoke') return;
    for (const key in karaokeInputs) {
        const el = karaokeInputs[key];
        if (el.type === 'number') karaokeState[key] = parseFloat(el.value);
        else if (el.type === 'checkbox') karaokeState[key] = el.checked;
        else if (el.type !== 'file') karaokeState[key] = el.value;
    }
    if (karaokeState.fontFamilySelect === 'custom') { karaokeState.fontFamily = karaokeState.fontFamilyCustom || 'sans-serif'; document.getElementById('custom-karaoke-font-container').style.display = 'block'; }
    else { karaokeState.fontFamily = karaokeState.fontFamilySelect; document.getElementById('custom-karaoke-font-container').style.display = 'none'; }
    syncKaraokeLineModeUI();

    loadFont(karaokeState.fontFamilySelect !== 'custom' ? karaokeState.fontFamilySelect : null);
    generateKaraokeFrames();
    playPreview();
}

// --- 資料同步（匯出格式共用設定） ---
function updateExportStateFromUI() {
    for (const key in exportInputs) {
        const el = exportInputs[key];
        if (el.type === 'number') exportState[key] = parseFloat(el.value);
        else if (el.type === 'checkbox') exportState[key] = el.checked;
        else exportState[key] = el.value;
    }
    if (exportInputs.webpQuality) exportInputs.webpQuality.disabled = !!exportState.webpLossless;
}

function updateUIFromState() {
    for (const key in inputs) { if (inputs[key]) { if (inputs[key].type === 'checkbox') inputs[key].checked = state[key]; else inputs[key].value = state[key]; } }
    if (state.fontFamilySelect === 'custom') { document.getElementById('custom-font-container').style.display = 'block'; state.fontFamily = state.fontFamilyCustom || 'sans-serif'; } 
    else { document.getElementById('custom-font-container').style.display = 'none'; state.fontFamily = state.fontFamilySelect; }

    for (const key in glitchInputs) { if (glitchInputs[key]) { if (glitchInputs[key].type === 'checkbox') glitchInputs[key].checked = glitchState[key]; else glitchInputs[key].value = glitchState[key]; } }
    if (glitchState.fontFamilySelect === 'custom') { document.getElementById('custom-glitch-font-container').style.display = 'block'; glitchState.fontFamily = glitchState.fontFamilyCustom || 'sans-serif'; } 
    else { document.getElementById('custom-glitch-font-container').style.display = 'none'; glitchState.fontFamily = glitchState.fontFamilySelect; }

    for (const key in creditInputs) { if (creditInputs[key]) { if (creditInputs[key].type === 'checkbox') creditInputs[key].checked = creditState[key]; else creditInputs[key].value = creditState[key]; } }
    splitModeRadios.forEach(radio => { if ((radio.value === 'true') === creditState.splitMode) radio.checked = true; });
    if (creditState.fontFamilySelect === 'custom') { document.getElementById('custom-credit-font-container').style.display = 'block'; creditState.fontFamily = creditState.fontFamilyCustom || 'sans-serif'; }
    else { document.getElementById('custom-credit-font-container').style.display = 'none'; creditState.fontFamily = creditState.fontFamilySelect; }

    for (const key in karaokeInputs) { if (karaokeInputs[key]) { if (karaokeInputs[key].type === 'checkbox') karaokeInputs[key].checked = karaokeState[key]; else karaokeInputs[key].value = karaokeState[key]; } }
    if (karaokeState.fontFamilySelect === 'custom') { document.getElementById('custom-karaoke-font-container').style.display = 'block'; karaokeState.fontFamily = karaokeState.fontFamilyCustom || 'sans-serif'; }
    else { document.getElementById('custom-karaoke-font-container').style.display = 'none'; karaokeState.fontFamily = karaokeState.fontFamilySelect; }
    syncKaraokeLineModeUI();

    for (const key in exportInputs) { if (exportInputs[key].type === 'checkbox') exportInputs[key].checked = exportState[key]; else exportInputs[key].value = exportState[key]; }
    if (exportInputs.webpQuality) exportInputs.webpQuality.disabled = !!exportState.webpLossless;

    syncColorHexFields();

    if (currentTab === 'typing') { loadFont(state.fontFamilySelect !== 'custom' ? state.fontFamilySelect : null); generateTypingFrames(); }
    else if (currentTab === 'glitch') { loadFont(glitchState.fontFamilySelect !== 'custom' ? glitchState.fontFamilySelect : null); generateGlitchFrames(); }
    else if (currentTab === 'karaoke') { loadFont(karaokeState.fontFamilySelect !== 'custom' ? karaokeState.fontFamilySelect : null); generateKaraokeFrames(); }
    else { loadFont(creditState.fontFamilySelect !== 'custom' ? creditState.fontFamilySelect : null); generateCreditFrames(); }
    playPreview();
}

function loadFont(fontFamily) {
    if (!fontFamily || loadedFonts.has(fontFamily)) return;
    const fontId = 'font-' + fontFamily.replace(/\s+/g, '-');
    if (!document.getElementById(fontId)) {
        const link = document.createElement('link');
        link.id = fontId; link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}&display=swap`;
        document.head.appendChild(link);
        loadedFonts.add(fontFamily);
    }
}

// --- 核心影格產生邏輯（打字） ---
function generateTypingFrames() {
    let fullText = state.text;
    if (!fullText) { generatedFrames = []; rawTypingFrameCount = 0; return; }

    let processText = state.direction === 'backward' ? fullText.split('').reverse().join('') : fullText;
    let framesList = []; let currentChars = [];

    for (let i = 0; i < processText.length; i++) {
        const char = processText[i];
        const origIdx = state.direction === 'backward' ? (processText.length - 1 - i) : i;

        if (char === '\n') {
            currentChars.push({ char: char, origIdx });
            framesList.push([...currentChars]);
            continue;
        }

        const steps = decomposeHangul(char);
        for (let j = 0; j < steps.length; j++) {
            framesList.push([...currentChars, { char: steps[j], origIdx }]);
        }
        currentChars.push({ char: char, origIdx });
    }

    if (state.direction === 'backward') {
        for (let f = 0; f < framesList.length; f++) { framesList[f].sort((a, b) => a.origIdx - b.origIdx); }
    }
    rawTypingFrameCount = framesList.length;

    let finishFrames = {};
    for (let i = 0; i < processText.length; i++) {
        const origIdx = state.direction === 'backward' ? (processText.length - 1 - i) : i;
        const finalChar = processText[i];
        for (let f = 0; f < framesList.length; f++) {
            const item = framesList[f].find(x => x.origIdx === origIdx);
            if (item && item.char === finalChar) { finishFrames[origIdx] = f; break; }
        }
    }

    const fadeFramesCount = Math.max(1, Math.round((state.fadeOutDuration / 1000) * state.fps));
    let finalFrames = [];

    for (let f = 0; f < framesList.length; f++) {
        let frameData = { chars: [], isHold: false, globalAlpha: 1.0 };
        for (let c of framesList[f]) {
            let alpha = 1.0;
            if (state.fadeMode === 'individual') {
                const finishedAt = finishFrames[c.origIdx];
                if (finishedAt !== undefined && f > finishedAt) {
                    const age = f - finishedAt;
                    alpha = Math.max(0, 1.0 - (age / fadeFramesCount));
                }
            }
            frameData.chars.push({ char: c.char, alpha: alpha, origIdx: c.origIdx });
        }
        finalFrames.push(frameData);
    }

    if (state.fadeMode === 'global') {
        finalFrames[finalFrames.length - 1].isHold = true;
        if (state.fadeOutDuration > 0) {
            const lastFrameChars = framesList[framesList.length - 1];
            for (let i = 1; i <= fadeFramesCount; i++) {
                finalFrames.push({ chars: lastFrameChars.map(c => ({...c, alpha: 1.0})), isHold: false, globalAlpha: Math.max(0, 1.0 - (i / fadeFramesCount)) });
            }
        }
    } else if (state.fadeMode === 'individual') {
        if (state.fadeOutDuration > 0) {
            const lastFrameChars = framesList[framesList.length - 1];
            for (let i = 1; i <= fadeFramesCount; i++) {
                let frameData = { chars: [], isHold: (i === fadeFramesCount), globalAlpha: 1.0 };
                const currentF = framesList.length - 1 + i;
                for (let c of lastFrameChars) {
                    const finishedAt = finishFrames[c.origIdx]; let alpha = 1.0;
                    if (finishedAt !== undefined && currentF > finishedAt) {
                        const age = currentF - finishedAt; alpha = Math.max(0, 1.0 - (age / fadeFramesCount));
                    }
                    frameData.chars.push({ char: c.char, alpha: alpha, origIdx: c.origIdx });
                }
                finalFrames.push(frameData);
            }
        } else { finalFrames[finalFrames.length - 1].isHold = true; }
    } else { finalFrames[finalFrames.length - 1].isHold = true; }

    if (state.shapeMode !== 'none' && state.shapeRotateSpeed !== 0) {
        let expandedFrames = [];
        for (let i = 0; i < finalFrames.length; i++) {
            const f = finalFrames[i];
            if (f.isHold) {
                const holdFramesCount = Math.max(1, Math.round((state.holdLast / 1000) * state.fps));
                for (let j = 0; j < holdFramesCount; j++) { expandedFrames.push({ chars: f.chars, globalAlpha: f.globalAlpha, isHold: false }); }
            } else { expandedFrames.push(f); }
        }
        finalFrames = expandedFrames;
    }
    generatedFrames = finalFrames;
}

// --- 核心影格產生邏輯（故障） ---
function generateGlitchFrames() {
    let fullText = glitchState.text;
    if (!fullText) { glitchGeneratedFrames = []; return; }

    let framesList = [];

    if (glitchState.simultaneousMode) {
        // 新模式：整段文字一次性以故障畫面輸出，再從頭依序解讀
        for (let i = 0; i < fullText.length; i++) {
            const actualChar = fullText[i];
            
            if (actualChar === '\n' || actualChar === ' ') continue;

            for (let g = 0; g < glitchState.glitchCount; g++) {
                let frameChars = [];
                for (let j = 0; j < fullText.length; j++) {
                    const charJ = fullText[j];
                    if (charJ === '\n' || charJ === ' ') {
                        frameChars.push({ char: charJ, alpha: 1.0, origIdx: j });
                    } else if (j < i) {
                        // 已解讀完成的前面字元
                        frameChars.push({ char: charJ, alpha: 1.0, origIdx: j });
                    } else {
                        // 尚未解讀或正在解讀中的字元
                        frameChars.push({ char: getRandomGlitchChar(glitchState), alpha: 1.0, origIdx: j });
                    }
                }
                framesList.push({ chars: frameChars, isHold: false, globalAlpha: 1.0 });
            }
        }
        
        // 最後一格（全部字元皆已還原完成的狀態）
        let finalChars = [];
        for (let j = 0; j < fullText.length; j++) {
            finalChars.push({ char: fullText[j], alpha: 1.0, origIdx: j });
        }
        framesList.push({ chars: finalChars, isHold: true, globalAlpha: 1.0 });

    } else {
        // 原始模式：逐字以故障畫面出現後定格
        let currentCorrectChars = [];

        for (let i = 0; i < fullText.length; i++) {
            const actualChar = fullText[i];
            
            if (actualChar === '\n' || actualChar === ' ') {
                currentCorrectChars.push({ char: actualChar, alpha: 1.0, origIdx: i });
                continue;
            }

            for (let g = 0; g < glitchState.glitchCount; g++) {
                let frameChars = [...currentCorrectChars];
                frameChars.push({ char: getRandomGlitchChar(glitchState), alpha: 1.0, origIdx: i });
                framesList.push({ chars: frameChars, isHold: false, globalAlpha: 1.0 });
            }

            currentCorrectChars.push({ char: actualChar, alpha: 1.0, origIdx: i });
            framesList.push({ chars: [...currentCorrectChars], isHold: false, globalAlpha: 1.0 });
        }

        if (framesList.length > 0) {
            framesList[framesList.length - 1].isHold = true;
        }
    }

    glitchGeneratedFrames = framesList;
}

// --- 核心影格產生邏輯（片尾字幕） ---
function generateCreditFrames() {
    const text = creditState.text;
    if (!text) { creditFramesInfo = { totalFrames: 0, textBlock: "" }; return; }
    const totalFrames = Math.max(2, Math.floor(creditState.totalDuration * creditState.fps));
    creditFramesInfo = { totalFrames: totalFrames, textBlock: text };
}

// --- 核心影格產生邏輯（卡拉OK） ---
// 歌詞一行 = 一句。可用「歌詞 | 2.5」的格式直接指定每行時間，
// 未指定時間的行，會依字數比例或平均方式分配剩餘時間。
function parseKaraokeLines(ks) {
    const parsed = String(ks.text || '').split('\n').map(raw => {
        const m = raw.match(/^(.*?)\s*\|\s*(\d*\.?\d+)\s*$/);
        return m ? { text: m[1], manual: parseFloat(m[2]) } : { text: raw, manual: null };
    });

    const singable = parsed.filter(l => l.text.trim().length > 0);
    const manualTotal = singable.reduce((acc, l) => acc + (l.manual || 0), 0);
    const autoLines = singable.filter(l => l.manual === null);
    const remain = Math.max(0, (ks.totalDuration || 0) - manualTotal);

    if (autoLines.length > 0) {
        if (ks.timingMode === 'equal') {
            const per = remain / autoLines.length;
            autoLines.forEach(l => { l.dur = per; });
        } else {
            const totalChars = autoLines.reduce((acc, l) => acc + Math.max(1, l.text.trim().length), 0);
            autoLines.forEach(l => { l.dur = remain * (Math.max(1, l.text.trim().length) / totalChars); });
        }
    }
    singable.forEach(l => { if (l.manual !== null) l.dur = l.manual; });

    let t = Math.max(0, ks.leadIn || 0);
    parsed.forEach((l, i) => {
        l.index = i;
        l.singable = l.text.trim().length > 0;
        l.start = t;
        if (!l.singable) { l.dur = 0; return; }
        t += (l.dur || 0);
    });

    return { lines: parsed, endTime: t };
}

function generateKaraokeFrames() {
    karaokeFrames = [];
    if (!String(karaokeState.text || '').trim()) return;

    const fps = Math.max(1, karaokeState.fps || 1);
    const { endTime } = parseKaraokeLines(karaokeState);
    const active = Math.max(1 / fps, endTime);
    const count = Math.max(2, Math.ceil(active * fps));

    for (let i = 0; i < count; i++) karaokeFrames.push({ t: i / fps, isHold: false });
    karaokeFrames.push({ t: endTime, isHold: true }); // 以完成狀態定格
}

function karaokeProgress(line, t) {
    if (!line.singable) return 0;
    if (!(line.dur > 0)) return t >= line.start ? 1 : 0;
    return Math.max(0, Math.min(1, (t - line.start) / line.dur));
}

function applyKaraokeFont(c, ks) {
    const fontStyle = ks.isItalic ? "italic " : "";
    const fontWeight = ks.isBold ? "bold " : "";
    c.font = `${fontStyle}${fontWeight}${ks.fontSize}px "${ks.fontFamily}", sans-serif`;
    c.textBaseline = 'top';
    c.textAlign = 'left';
    if (c.letterSpacing !== undefined) c.letterSpacing = `${ks.letterSpacing || 0}px`;
}

// 'rolling'/'page' 會固定畫面行數，並將下一句歌詞推入該位置，
// 與實際卡拉OK字幕相同的方式。其餘模式則是歌詞行數 = 畫面行數。
function isKaraokeStacked(ks) { return ks.lineMode === 'rolling' || ks.lineMode === 'page'; }
function syncKaraokeLineModeUI() {
    const box = document.getElementById('karaoke-rolling-container');
    if (box) box.style.display = isKaraokeStacked(karaokeState) ? 'grid' : 'none';
}
function karaokeSlotCount(ks) { return Math.max(1, Math.min(20, Math.round(ks.rollingLines || 1))); }
// 僅在固定行數演出時套用替換淡化（其餘模式的演出維持原樣）。
function karaokeFadeSec(ks) { return isKaraokeStacked(ks) ? Math.max(0, ks.lineFade || 0) : 0; }

// 決定各行所在的畫面行（row）與總行數。
function karaokeRowPlan(lines, ks) {
    const rowOf = new Map();
    if (!isKaraokeStacked(ks)) {
        lines.forEach((l, i) => rowOf.set(l.index, i));
        return { rowCount: Math.max(1, lines.length), rowOf };
    }
    const slots = karaokeSlotCount(ks);
    const singables = lines.filter(l => l.singable);
    singables.forEach((l, k) => rowOf.set(l.index, k % slots));
    return { rowCount: Math.max(1, Math.min(slots, singables.length)), rowOf };
}

// 計算各行停留在畫面上的區間 [visFrom, visTo)。（Infinity = 持續到最後）
function assignKaraokeWindows(layout, ks) {
    const INF = Infinity;
    const endOf = (l) => l.start + (l.dur || 0);
    layout.forEach(l => { l.visFrom = INF; l.visTo = INF; }); // 預設為「不顯示」

    const singables = layout.filter(l => l.singable);
    if (!singables.length) return;

    if (ks.lineMode === 'appear') {
        singables.forEach(l => { l.visFrom = l.start; l.visTo = INF; });
    } else if (ks.lineMode === 'active') {
        singables.forEach((l, k) => {
            l.visFrom = k === 0 ? -INF : l.start;
            l.visTo = k === singables.length - 1 ? INF : endOf(l);
        });
    } else if (ks.lineMode === 'page') {
        // 畫面上的行全部唱完後，會一次整頁替換。
        const n = karaokeSlotCount(ks);
        singables.forEach((l, k) => {
            const page = Math.floor(k / n);
            const pageLast = singables[Math.min(page * n + n - 1, singables.length - 1)];
            l.visFrom = page === 0 ? -INF : singables[page * n].start;
            l.visTo = (page + 1) * n >= singables.length ? INF : endOf(pageLast);
        });
    } else if (ks.lineMode === 'rolling') {
        // 使用同一位置、往前數 n 行的那一行結束後就會登場，自己這句結束後則退場。
        const n = karaokeSlotCount(ks);
        singables.forEach((l, k) => {
            l.visFrom = k < n ? -INF : endOf(singables[k - n]);
            l.visTo = k + n < singables.length ? endOf(l) : INF;
        });
    } else {
        singables.forEach(l => { l.visFrom = -INF; l.visTo = INF; }); // 'all'
    }

    // 淡化長度必須所有行都使用相同數值，替換的瞬間才不會錯位。
    // 句子非常短時，最多只使用可用時間的 1/3，避免演唱途中就淡化。
    let fade = karaokeFadeSec(ks);
    if (fade > 0) {
        let room = INF;
        singables.forEach(l => {
            if (l.visFrom === -INF) return;
            room = Math.min(room, Math.max(0, l.start - l.visFrom) + Math.max(0, l.dur || 0));
        });
        if (room !== INF) fade = Math.min(fade, room / 3);
    }
    layout.forEach(l => { l.fade = fade; });
}

// 為了讓退場的行完全消失後下一行才進場，同一位置的兩行
// 會前後緊接淡化區間，避免重疊。
function karaokeLineAlpha(l, t) {
    const fade = l.fade || 0;
    if (!(fade > 0)) return (t >= l.visFrom && t < l.visTo) ? 1 : 0;

    const outEnd = l.visTo === Infinity ? Infinity : l.visTo + fade;
    if (t < l.visFrom || t >= outEnd) return 0;

    const inStart = l.visFrom === -Infinity ? -Infinity : l.visFrom + fade; // 等待前一行完全消失
    const fadeIn = (t - inStart) / fade;
    const fadeOut = outEnd === Infinity ? 1 : (outEnd - t) / fade;
    return Math.max(0, Math.min(1, fadeIn, fadeOut));
}

// 計算各行的位置／寬度，以及遮罩使用的垂直區間（band）。
function layoutKaraokeLines(lines, ks, w, h, measureCtx) {
    measureCtx.save();
    measureCtx.setTransform(1, 0, 0, 1, 0, 0);
    applyKaraokeFont(measureCtx, ks);

    const spacingSupported = measureCtx.letterSpacing !== undefined;
    const lineHeightPx = ks.fontSize * ks.lineHeight;
    const sx = (ks.scaleX || 100) / 100;
    const originalW = w / (sx || 1);

    const plan = karaokeRowPlan(lines, ks);
    const totalHeight = plan.rowCount * lineHeightPx;
    let startY = 10;
    if (ks.verticalAlign === 'center') startY = (h - totalHeight) / 2 + (lineHeightPx - ks.fontSize) / 2;
    if (ks.verticalAlign === 'bottom') startY = h - totalHeight - 10;

    const layout = lines.map(l => {
        let width = measureCtx.measureText(l.text).width;
        // 套用字距後，最後一個字後方也會多出空白，因此要從實際墨色寬度中扣除。
        if (spacingSupported && l.text.length > 0) width = Math.max(0, width - (ks.letterSpacing || 0));

        let x = 10;
        if (ks.textAlign === 'center') x = originalW / 2 - width / 2;
        if (ks.textAlign === 'right') x = originalW - 10 - width;

        const row = plan.rowOf.has(l.index) ? plan.rowOf.get(l.index) : 0;
        const y = startY + row * lineHeightPx;
        return { ...l, row, x, y, width, center: y + ks.fontSize / 2 };
    });
    measureCtx.restore();

    // 垂直區間以行與行之間的中間值劃分，避免互相侵犯。
    layout.forEach(l => {
        const top = l.row === 0 ? Math.min(0, l.center - lineHeightPx) : l.center - lineHeightPx / 2;
        const bottom = l.row === plan.rowCount - 1 ? Math.max(h, l.center + lineHeightPx) : l.center + lineHeightPx / 2;
        l.band = [top, bottom];
    });

    assignKaraokeWindows(layout, ks);
    return layout;
}

// 重複使用暫存畫布（供圖層合成使用）
const karaokeScratch = {};
function getKaraokeScratch(key, w, h) {
    let item = karaokeScratch[key];
    if (!item) {
        const cv = document.createElement('canvas');
        item = karaokeScratch[key] = { canvas: cv, ctx: cv.getContext('2d') };
    }
    if (item.canvas.width !== w || item.canvas.height !== h) {
        item.canvas.width = w; item.canvas.height = h;
    }
    item.ctx.setTransform(1, 0, 0, 1, 0, 0);
    item.ctx.globalCompositeOperation = 'source-over';
    item.ctx.globalAlpha = 1;
    item.ctx.clearRect(0, 0, w, h);
    return item;
}

function drawKaraokeTextLayer(c, lines, ks, fillColor, strokeColor, withShadow) {
    c.save();
    applyKaraokeFont(c, ks);
    c.fillStyle = fillColor;
    c.strokeStyle = strokeColor;
    c.lineWidth = ks.strokeWidth;
    c.lineJoin = 'round';
    c.miterLimit = 2;

    if (withShadow) {
        c.shadowColor = ks.shadowColor;
        c.shadowBlur = ks.shadowBlur;
        c.shadowOffsetX = ks.shadowOffsetX;
        c.shadowOffsetY = ks.shadowOffsetY;
    }
    c.scale((ks.scaleX || 100) / 100, 1);

    for (const l of lines) {
        if (ks.strokeWidth > 0) c.strokeText(l.text, l.x, l.y);
        const keepShadow = c.shadowColor;
        if (ks.strokeWidth > 0) c.shadowColor = 'transparent';
        c.fillText(l.text, l.x, l.y);
        c.shadowColor = keepShadow;
    }
    c.restore();
}

// mode：'wipe' = 掃描已經過的整個區域，'band' = 掃描邊界周圍的窄帶
function drawKaraokeMask(c, lines, ks, t, mode) {
    c.save();
    c.scale((ks.scaleX || 100) / 100, 1);
    const pad = (ks.strokeWidth || 0) + Math.abs(ks.shadowBlur || 0) + 8;
    const rtl = ks.scanDirection === 'rtl';

    for (const l of lines) {
        const p = karaokeProgress(l, t);
        const [top, bottom] = l.band;
        const height = bottom - top;
        const left = l.x, right = l.x + l.width;
        const edge = rtl ? right - p * l.width : left + p * l.width;

        if (mode === 'band') {
            if (p <= 0 || p >= 1) continue;
            const half = Math.max(1, (ks.scanGlowWidth || 0) / 2);
            const g = c.createLinearGradient(edge - half, 0, edge + half, 0);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.5, 'rgba(255,255,255,1)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g;
            c.fillRect(edge - half, top, half * 2, height);
            continue;
        }

        if (p <= 0) continue;
        if (p >= 1) {
            c.fillStyle = '#ffffff';
            c.fillRect(left - pad, top, l.width + pad * 2, height);
            continue;
        }

        const soft = Math.max(0, ks.scanSoftness || 0);
        if (rtl) {
            const outer = right + pad;
            if (soft <= 0) { c.fillStyle = '#ffffff'; c.fillRect(edge, top, outer - edge, height); }
            else {
                const solidFrom = Math.min(outer, edge + soft);
                c.fillStyle = '#ffffff';
                c.fillRect(solidFrom, top, Math.max(0, outer - solidFrom), height);
                const g = c.createLinearGradient(edge, 0, edge + soft, 0);
                g.addColorStop(0, 'rgba(255,255,255,0)');
                g.addColorStop(1, 'rgba(255,255,255,1)');
                c.fillStyle = g;
                c.fillRect(edge, top, solidFrom - edge, height);
            }
        } else {
            const outer = left - pad;
            if (soft <= 0) { c.fillStyle = '#ffffff'; c.fillRect(outer, top, edge - outer, height); }
            else {
                const solidTo = Math.max(outer, edge - soft);
                c.fillStyle = '#ffffff';
                c.fillRect(outer, top, Math.max(0, solidTo - outer), height);
                const g = c.createLinearGradient(edge - soft, 0, edge, 0);
                g.addColorStop(0, 'rgba(255,255,255,1)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                c.fillStyle = g;
                c.fillRect(solidTo, top, edge - solidTo, height);
            }
        }
    }
    c.restore();
}

// 將透明度相同的行合成為同一批。半透明時，掃描前／後的圖層
// 為了避免互相透出，會將完成的畫面整體套用透明度後再疊加。
function drawKaraokeGroup(targetCtx, w, h, visible, ks, t, alpha) {
    const opaque = alpha >= 0.999;
    const group = opaque ? null : getKaraokeScratch('group', w, h);
    const c = opaque ? targetCtx : group.ctx;

    // 1. 先以掃描前色彩繪製整體（包含陰影）。
    drawKaraokeTextLayer(c, visible, ks, ks.fillColorBefore, ks.strokeColorBefore, true);

    // 2. 建立掃描後色彩圖層，僅保留掃描已經過的區域並疊加其上。
    const after = getKaraokeScratch('after', w, h);
    drawKaraokeTextLayer(after.ctx, visible, ks, ks.fillColorAfter, ks.strokeColorAfter, false);

    const mask = getKaraokeScratch('mask', w, h);
    drawKaraokeMask(mask.ctx, visible, ks, t, 'wipe');

    after.ctx.setTransform(1, 0, 0, 1, 0, 0);
    after.ctx.globalCompositeOperation = 'destination-in';
    after.ctx.drawImage(mask.canvas, 0, 0);
    after.ctx.globalCompositeOperation = 'source-over';
    c.drawImage(after.canvas, 0, 0);

    // 3. 在掃描邊界疊加發光帶。
    if (ks.scanGlow && ks.scanGlowWidth > 0) {
        const glow = getKaraokeScratch('after', w, h);
        drawKaraokeTextLayer(glow.ctx, visible, ks, ks.scanGlowColor, ks.scanGlowColor, false);

        const glowMask = getKaraokeScratch('mask', w, h);
        drawKaraokeMask(glowMask.ctx, visible, ks, t, 'band');

        glow.ctx.setTransform(1, 0, 0, 1, 0, 0);
        glow.ctx.globalCompositeOperation = 'destination-in';
        glow.ctx.drawImage(glowMask.canvas, 0, 0);
        glow.ctx.globalCompositeOperation = 'source-over';

        c.save();
        c.globalCompositeOperation = 'lighter';
        c.drawImage(glow.canvas, 0, 0);
        c.restore();
    }

    if (!opaque) {
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalAlpha = alpha;
        targetCtx.drawImage(group.canvas, 0, 0);
        targetCtx.restore();
    }
}

function renderKaraokeToCanvas(targetCtx, w, h, t, ks) {
    targetCtx.setTransform(1, 0, 0, 1, 0, 0);
    targetCtx.globalAlpha = 1;
    targetCtx.globalCompositeOperation = 'source-over';

    if (ks.useBackgroundColor) {
        targetCtx.fillStyle = ks.backgroundColor;
        targetCtx.fillRect(0, 0, w, h);
    } else {
        targetCtx.clearRect(0, 0, w, h);
    }

    if (!String(ks.text || '').trim()) return;

    const { lines } = parseKaraokeLines(ks);
    const layout = layoutKaraokeLines(lines, ks, w, h, targetCtx);

    // 將透明度相同的行歸為一組，盡量減少合成次數。
    const groups = new Map();
    for (const l of layout) {
        if (!l.singable) continue;
        const a = karaokeLineAlpha(l, t);
        if (a <= 0.004) continue;
        const key = Math.round(a * 255);
        if (!groups.has(key)) groups.set(key, { alpha: a, lines: [] });
        groups.get(key).lines.push(l);
    }
    if (!groups.size) return;

    for (const g of groups.values()) drawKaraokeGroup(targetCtx, w, h, g.lines, ks, t, g.alpha);
}

// --- 畫布繪製輔助函式 ---
function getShapePoint(mode, size, dist) {
    if (mode === 'circle') {
        const circum = 2 * Math.PI * size; const a = (dist / circum) * 2 * Math.PI - Math.PI / 2;
        return { x: Math.cos(a) * size, y: Math.sin(a) * size, rot: a + Math.PI / 2 };
    } else if (mode === 'square') {
        const p = 8 * size; const d = dist % p;
        if (d < 2 * size) return { x: -size + d, y: -size, rot: 0 };
        if (d < 4 * size) return { x: size, y: -size + (d - 2*size), rot: Math.PI / 2 };
        if (d < 6 * size) return { x: size - (d - 4*size), y: size, rot: Math.PI };
        return { x: -size, y: size - (d - 6*size), rot: Math.PI * 1.5 };
    } else if (mode === 'triangle') {
        const cos30 = Math.sqrt(3) / 2, sin30 = 0.5;
        const A = { x: 0, y: -size }; const B = { x: size * cos30, y: size * sin30 }; const C = { x: -size * cos30, y: size * sin30 };
        const sideLen = Math.sqrt(3) * size; const p = 3 * sideLen; const d = dist % p;
        if (d < sideLen) { const t = d / sideLen; return { x: A.x + t*(B.x - A.x), y: A.y + t*(B.y - A.y), rot: Math.atan2(B.y - A.y, B.x - A.x) }; } 
        else if (d < 2 * sideLen) { const t = (d - sideLen) / sideLen; return { x: B.x + t*(C.x - B.x), y: B.y + t*(C.y - B.y), rot: Math.atan2(C.y - B.y, C.x - B.x) }; } 
        else { const t = (d - 2 * sideLen) / sideLen; return { x: C.x + t*(A.x - C.x), y: C.y + t*(A.y - C.y), rot: Math.atan2(A.y - C.y, A.x - C.x) }; }
    }
    return { x: 0, y: 0, rot: 0 };
}

// 共用文字繪製（打字、故障分頁僅替換資料後共用）
function renderTextDataToCanvas(targetCtx, frameData, w, h, currentState, frameIndex = 0) {
    if (currentState.useBackgroundColor) {
        targetCtx.fillStyle = currentState.backgroundColor;
        targetCtx.fillRect(0, 0, w, h);
    } else {
        targetCtx.clearRect(0, 0, w, h);
    }
    targetCtx.save();

    const fontStyle = currentState.isItalic ? "italic " : "";
    const fontWeight = currentState.isBold ? "bold " : "";
    targetCtx.font = `${fontStyle}${fontWeight}${currentState.fontSize}px "${currentState.fontFamily}", sans-serif`;
    targetCtx.textBaseline = 'top';
    targetCtx.fillStyle = currentState.fillColor;
    targetCtx.strokeStyle = currentState.strokeColor;
    targetCtx.lineWidth = currentState.strokeWidth;
    targetCtx.lineJoin = 'round';

    targetCtx.shadowColor = currentState.shadowColor;
    targetCtx.shadowBlur = currentState.shadowBlur;
    targetCtx.shadowOffsetX = currentState.shadowOffsetX;
    targetCtx.shadowOffsetY = currentState.shadowOffsetY;

    if (targetCtx.letterSpacing !== undefined) {
        targetCtx.letterSpacing = `${currentState.letterSpacing}px`;
    }

    if (currentState.shapeMode && currentState.shapeMode !== 'none') {
        targetCtx.translate(w / 2, h / 2);
        const globalRotation = frameIndex * currentState.shapeRotateSpeed * (Math.PI / 180);
        targetCtx.rotate(globalRotation);
        targetCtx.textBaseline = 'bottom';
        targetCtx.textAlign = 'center';

        const shapeChars = frameData.chars.filter(c => c.char !== '\n');
        let currentDist = 0;

        for (let i = 0; i < shapeChars.length; i++) {
            const c = shapeChars[i];
            const charWidth = targetCtx.measureText(c.char).width + currentState.letterSpacing;
            const d = currentDist + charWidth / 2;
            const pt = getShapePoint(currentState.shapeMode, currentState.shapeSize, d);
            const finalAlpha = frameData.globalAlpha * c.alpha;

            if (finalAlpha > 0) {
                targetCtx.save();
                targetCtx.translate(pt.x, pt.y);
                targetCtx.rotate(pt.rot);
                targetCtx.globalAlpha = finalAlpha;

                if (currentState.strokeWidth > 0) targetCtx.strokeText(c.char, 0, 0);
                const tempShadow = targetCtx.shadowColor;
                if (currentState.strokeWidth > 0) targetCtx.shadowColor = 'transparent';
                targetCtx.fillText(c.char, 0, 0);
                
                if (currentState.isUnderline || currentState.isStrikethrough) {
                    const thickness = Math.max(1, currentState.fontSize * 0.06);
                    targetCtx.fillStyle = currentState.fillColor;
                    if (currentState.isUnderline) targetCtx.fillRect(-charWidth/2, currentState.fontSize * 0.1, charWidth, thickness);
                    if (currentState.isStrikethrough) targetCtx.fillRect(-charWidth/2, -currentState.fontSize * 0.4, charWidth, thickness);
                }

                targetCtx.shadowColor = tempShadow;
                targetCtx.restore();
            }
            currentDist += charWidth;
        }
        targetCtx.restore();
        return;
    }

    const lines = [];
    let currentLine = [];
    for (let c of frameData.chars) {
        if (c.char === '\n') { lines.push(currentLine); currentLine = []; }
        else { currentLine.push(c); }
    }
    lines.push(currentLine);

    const lineHeightPx = currentState.fontSize * currentState.lineHeight;

    if (currentState.writingMode === 'horizontal') {
        targetCtx.scale(currentState.scaleX / 100, 1);
        let originalW = w / (currentState.scaleX / 100);

        const totalHeight = lines.length * lineHeightPx;
        let startY = 10;
        if (currentState.verticalAlign === 'center') startY = (h - totalHeight) / 2 + (lineHeightPx - currentState.fontSize)/2;
        if (currentState.verticalAlign === 'bottom') startY = h - totalHeight - 10;

        lines.forEach((lineChars, index) => {
            const y = startY + (index * lineHeightPx);
            let lineWidth = 0;
            for(let c of lineChars) lineWidth += targetCtx.measureText(c.char).width + currentState.letterSpacing;
            if (lineChars.length > 0) lineWidth -= currentState.letterSpacing;

            let cx = 0;
            if (currentState.textAlign === 'left') cx = 10;
            if (currentState.textAlign === 'center') cx = originalW / 2 - lineWidth / 2;
            if (currentState.textAlign === 'right') cx = originalW - 10 - lineWidth;

            targetCtx.textAlign = 'left';

            for (let c of lineChars) {
                const finalAlpha = frameData.globalAlpha * c.alpha;
                if (finalAlpha > 0) {
                    targetCtx.globalAlpha = finalAlpha;
                    if (currentState.strokeWidth > 0) targetCtx.strokeText(c.char, cx, y);
                    const tempShadow = targetCtx.shadowColor;
                    if (currentState.strokeWidth > 0) targetCtx.shadowColor = 'transparent';
                    targetCtx.fillText(c.char, cx, y);
                    
                    if (currentState.isUnderline || currentState.isStrikethrough) {
                        const thickness = Math.max(1, currentState.fontSize * 0.06);
                        const charRenderWidth = targetCtx.measureText(c.char).width + currentState.letterSpacing;
                        targetCtx.fillStyle = currentState.fillColor;
                        if (currentState.isUnderline) targetCtx.fillRect(cx, y + currentState.fontSize * 1.05, charRenderWidth, thickness);
                        if (currentState.isStrikethrough) targetCtx.fillRect(cx, y + currentState.fontSize * 0.5, charRenderWidth, thickness);
                    }
                    targetCtx.shadowColor = tempShadow;
                }
                cx += targetCtx.measureText(c.char).width + currentState.letterSpacing;
            }
        });
    } else {
        targetCtx.textAlign = 'center';
        targetCtx.scale(currentState.scaleX / 100, 1);
        let originalW = w / (currentState.scaleX / 100);

        const totalWidth = lines.length * lineHeightPx;
        let startX = originalW - 10 - currentState.fontSize / 2; 
        if (currentState.textAlign === 'left') startX = 10 + totalWidth - currentState.fontSize / 2; 
        if (currentState.textAlign === 'center') startX = (originalW + totalWidth) / 2 - currentState.fontSize / 2;
        if (currentState.textAlign === 'right') startX = originalW - 10 - currentState.fontSize / 2;

        lines.forEach((lineChars, lineIndex) => {
            const currentX = startX - (lineIndex * lineHeightPx);
            const totalLineHeight = lineChars.length * (currentState.fontSize + currentState.letterSpacing) - currentState.letterSpacing;
            let startY = 10;
            if (currentState.verticalAlign === 'center') startY = (h - totalLineHeight) / 2;
            if (currentState.verticalAlign === 'bottom') startY = h - totalLineHeight - 10;

            for (let charIndex = 0; charIndex < lineChars.length; charIndex++) {
                const c = lineChars[charIndex];
                const y = startY + charIndex * (currentState.fontSize + currentState.letterSpacing);
                const finalAlpha = frameData.globalAlpha * c.alpha;
                
                if (finalAlpha > 0) {
                    targetCtx.globalAlpha = finalAlpha;
                    if (currentState.strokeWidth > 0) targetCtx.strokeText(c.char, currentX, y);
                    const tempShadow = targetCtx.shadowColor;
                    if (currentState.strokeWidth > 0) targetCtx.shadowColor = 'transparent';
                    targetCtx.fillText(c.char, currentX, y);
                    
                    if (currentState.isUnderline || currentState.isStrikethrough) {
                        const thickness = Math.max(1, currentState.fontSize * 0.06);
                        const charRenderHeight = currentState.fontSize + currentState.letterSpacing;
                        targetCtx.fillStyle = currentState.fillColor;
                        if (currentState.isUnderline) targetCtx.fillRect(currentX + currentState.fontSize * 0.55, y, thickness, charRenderHeight);
                        if (currentState.isStrikethrough) targetCtx.fillRect(currentX - thickness/2, y, thickness, charRenderHeight);
                    }
                    targetCtx.shadowColor = tempShadow;
                }
            }
        });
    }
    targetCtx.restore();
}

function renderCreditBlockToCanvas(targetCtx, w, h, frameIndex, totalFrames, textBlock) {
    if (creditState.useBackgroundColor) {
        targetCtx.fillStyle = creditState.backgroundColor;
        targetCtx.fillRect(0, 0, w, h);
    } else {
        targetCtx.clearRect(0, 0, w, h);
    }
    targetCtx.save();

    const fontWeight = creditState.isBold ? "bold " : "";
    targetCtx.font = `${fontWeight}${creditState.fontSize}px "${creditState.fontFamily}", sans-serif`;
    targetCtx.textBaseline = 'top';
    targetCtx.fillStyle = creditState.fillColor;
    targetCtx.strokeStyle = creditState.strokeColor;
    targetCtx.lineWidth = creditState.strokeWidth;
    targetCtx.lineJoin = 'round';
    targetCtx.shadowColor = creditState.shadowColor;
    targetCtx.shadowBlur = creditState.shadowBlur;
    targetCtx.shadowOffsetX = creditState.shadowOffsetX;
    targetCtx.shadowOffsetY = creditState.shadowOffsetY;

    const lines = textBlock.split('\n');
    const lineHeightPx = creditState.fontSize * creditState.lineHeight;
    const totalTextHeight = lines.length * lineHeightPx;

    const startY = h;
    const endY = -totalTextHeight;
    
    const progress = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 1;
    const currentY = startY + (endY - startY) * progress;

    lines.forEach((line, index) => {
        const y = currentY + (index * lineHeightPx);
        let cx = 0;
        const lineWidth = targetCtx.measureText(line).width;
        
        if (creditState.textAlign === 'left') cx = 20;
        else if (creditState.textAlign === 'center') cx = w / 2 - lineWidth / 2;
        else if (creditState.textAlign === 'right') cx = w - 20 - lineWidth;

        if (creditState.strokeWidth > 0) targetCtx.strokeText(line, cx, y);
        const tempShadow = creditState.shadowColor;
        if (creditState.strokeWidth > 0) targetCtx.shadowColor = 'transparent';
        targetCtx.fillText(line, cx, y);
        targetCtx.shadowColor = tempShadow;
    });

    targetCtx.restore();
}

// --- 整合動畫迴圈 ---
/* 保留最近一次的影格狀態讀數，供切換語言時重繪使用（見檔尾 I18N.onChange）。 */
let lastFrameStatus = [0, 0, '0.00'];
function renderFrameStatus(current, total, estimatedMB) {
    lastFrameStatus = [current, total, estimatedMB];
    statusEl.textContent = T('status.frame', current, total, estimatedMB);
}
function startAnimationLoop() {
    clearTimeout(animationInterval);
    isPlaying = true;
    isFinished = false;

    let totalFrames = 0;
    let frameDelayMs = 0;

    if (currentTab === 'typing') {
        if (generatedFrames.length === 0) return;
        totalFrames = generatedFrames.length;
        frameDelayMs = 1000 / state.fps;
    } else if (currentTab === 'glitch') {
        if (glitchGeneratedFrames.length === 0) return;
        totalFrames = glitchGeneratedFrames.length;
        frameDelayMs = 1000 / glitchState.fps;
    } else if (currentTab === 'karaoke') {
        if (karaokeFrames.length === 0) return;
        totalFrames = karaokeFrames.length;
        frameDelayMs = 1000 / karaokeState.fps;
    } else {
        if (!creditFramesInfo.totalFrames) return;
        totalFrames = creditFramesInfo.totalFrames;
        frameDelayMs = 1000 / creditState.fps;
    }

    let estimatedMB = "0.00";
    if (totalFrames > 0) {
        const rawBytes = canvas.width * canvas.height * 4 * totalFrames;
        let isCompressed = true;
        if (currentTab === 'typing') isCompressed = state.apngCompress;
        else if (currentTab === 'glitch') isCompressed = glitchState.apngCompress;
        else if (currentTab === 'karaoke') isCompressed = karaokeState.apngCompress;
        else if (currentTab === 'credit') isCompressed = creditState.apngCompress;

        const compressRatio = isCompressed ? 0.04 : 0.25; 
        estimatedMB = (rawBytes * compressRatio / (1024 * 1024)).toFixed(2);
    }

    function nextFrame() {
        if (!isPlaying) return;

        if (currentFrameIndex < totalFrames) {
            if (currentTab === 'typing') {
                const frameData = generatedFrames[currentFrameIndex];
                renderTextDataToCanvas(ctx, frameData, canvas.width, canvas.height, state, currentFrameIndex);
                let delay = frameData.isHold ? state.holdLast : frameDelayMs;
                animationInterval = setTimeout(nextFrame, delay);
            } else if (currentTab === 'glitch') {
                const frameData = glitchGeneratedFrames[currentFrameIndex];
                renderTextDataToCanvas(ctx, frameData, canvas.width, canvas.height, glitchState, currentFrameIndex);
                let delay = frameData.isHold ? glitchState.holdLast : frameDelayMs;
                animationInterval = setTimeout(nextFrame, delay);
            } else if (currentTab === 'karaoke') {
                const frameData = karaokeFrames[currentFrameIndex];
                renderKaraokeToCanvas(ctx, canvas.width, canvas.height, frameData.t, karaokeState);
                let delay = frameData.isHold ? karaokeState.holdLast : frameDelayMs;
                animationInterval = setTimeout(nextFrame, delay);
            } else {
                renderCreditBlockToCanvas(ctx, canvas.width, canvas.height, currentFrameIndex, creditFramesInfo.totalFrames, creditFramesInfo.textBlock);
                animationInterval = setTimeout(nextFrame, frameDelayMs);
            }
            
            renderFrameStatus(currentFrameIndex + 1, totalFrames, estimatedMB);
            currentFrameIndex++;
        } else {
            isFinished = true;
            animationInterval = setTimeout(() => {
                if (isPlaying) playPreview();
            }, frameDelayMs);
        }
    }
    
    nextFrame();
}

function playPreview() {
    clearTimeout(animationInterval);
    currentFrameIndex = 0;

    if (currentTab === 'typing') {
        canvas.width = state.canvasWidth; canvas.height = state.canvasHeight;
        if (generatedFrames.length === 0) {
            renderTextDataToCanvas(ctx, { chars: [], globalAlpha: 1.0 }, canvas.width, canvas.height, state, 0);
            renderFrameStatus(0, 0, '0.00');
            return;
        }
    } else if (currentTab === 'glitch') {
        canvas.width = glitchState.canvasWidth; canvas.height = glitchState.canvasHeight;
        if (glitchGeneratedFrames.length === 0) {
            renderTextDataToCanvas(ctx, { chars: [], globalAlpha: 1.0 }, canvas.width, canvas.height, glitchState, 0);
            renderFrameStatus(0, 0, '0.00');
            return;
        }
    } else if (currentTab === 'karaoke') {
        canvas.width = karaokeState.canvasWidth; canvas.height = karaokeState.canvasHeight;
        if (karaokeFrames.length === 0) {
            renderKaraokeToCanvas(ctx, canvas.width, canvas.height, 0, karaokeState);
            renderFrameStatus(0, 0, '0.00');
            return;
        }
    } else {
        canvas.width = creditState.canvasWidth; canvas.height = creditState.canvasHeight;
        if (!creditFramesInfo.totalFrames) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            renderFrameStatus(0, 0, '0.00');
            return;
        }
    }

    startAnimationLoop();
}

function pausePreview() { clearTimeout(animationInterval); isPlaying = false; }

function resumePreview() {
    if (isPlaying) return;
    let totalFrames = 0;
    if (currentTab === 'typing') totalFrames = generatedFrames.length;
    else if (currentTab === 'glitch') totalFrames = glitchGeneratedFrames.length;
    else if (currentTab === 'karaoke') totalFrames = karaokeFrames.length;
    else totalFrames = creditFramesInfo.totalFrames;
    if (isFinished || currentFrameIndex >= totalFrames) playPreview();
    else startAnimationLoop();
}

// 卡拉OK分頁可直接計算文字排版，因此不需像素掃描即可調整尺寸。
function autoSizeKaraokeCanvas() {
    if (!String(karaokeState.text || '').trim()) return alert(T('msg.noText'));

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    applyKaraokeFont(measureCtx, karaokeState);
    const spacingSupported = measureCtx.letterSpacing !== undefined;

    const { lines } = parseKaraokeLines(karaokeState);
    const sx = (karaokeState.scaleX || 100) / 100;
    let maxWidth = 0;
    for (const l of lines) {
        let width = measureCtx.measureText(l.text).width;
        if (spacingSupported && l.text.length > 0) width = Math.max(0, width - (karaokeState.letterSpacing || 0));
        maxWidth = Math.max(maxWidth, width * sx);
    }

    const margin = (karaokeState.strokeWidth || 0) * 2 + Math.abs(karaokeState.shadowBlur || 0) * 2 + 40;
    karaokeState.canvasWidth = Math.max(50, Math.ceil(maxWidth + margin));
    // 固定行數演出只需依畫面顯示的行數計算高度，而非依歌詞總行數。
    const rowCount = karaokeRowPlan(lines, karaokeState).rowCount;
    karaokeState.canvasHeight = Math.max(50, Math.ceil(rowCount * karaokeState.fontSize * karaokeState.lineHeight + margin));
    karaokeInputs['canvasWidth'].value = karaokeState.canvasWidth;
    karaokeInputs['canvasHeight'].value = karaokeState.canvasHeight;
    playPreview();
}

function autoSizeCanvas() {
    if (currentTab === 'karaoke') return autoSizeKaraokeCanvas();
    if (currentTab === 'credit') return alert(T('msg.notSupportedInCredit'));

    const frames = currentTab === 'typing' ? generatedFrames : glitchGeneratedFrames;
    const currentState = currentTab === 'typing' ? state : glitchState;

    if (frames.length === 0) return alert(T('msg.noText'));

    const tempW = 3000, tempH = 3000;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = tempW; offCanvas.height = tempH;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    const origAlign = currentState.textAlign, origVAlign = currentState.verticalAlign, origUseBg = currentState.useBackgroundColor;
    currentState.textAlign = 'center'; currentState.verticalAlign = 'center'; currentState.useBackgroundColor = false; 

    let maxCharsFrame = frames[0];
    for (let f of frames) {
        if (f.chars.length > maxCharsFrame.chars.length) maxCharsFrame = f;
    }
    let measureFrame = { globalAlpha: 1.0, chars: maxCharsFrame.chars.map(c => ({...c, alpha: 1.0})) };
    
    renderTextDataToCanvas(offCtx, measureFrame, tempW, tempH, currentState, 0);
    
    currentState.textAlign = origAlign; currentState.verticalAlign = origVAlign; currentState.useBackgroundColor = origUseBg;

    const imgData = offCtx.getImageData(0, 0, tempW, tempH);
    const data = imgData.data;
    let minX = tempW, minY = tempH, maxX = 0, maxY = 0;
    let found = false;

    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
            const pixelIndex = (i - 3) / 4;
            const x = pixelIndex % tempW, y = Math.floor(pixelIndex / tempW);
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            found = true;
        }
    }

    if (found) {
        const padding = 60;
        currentState.canvasWidth = Math.ceil(maxX - minX + padding);
        currentState.canvasHeight = Math.ceil(maxY - minY + padding);
        
        if (currentTab === 'typing') {
            inputs['canvasWidth'].value = currentState.canvasWidth;
            inputs['canvasHeight'].value = currentState.canvasHeight;
        } else {
            glitchInputs['canvasWidth'].value = currentState.canvasWidth;
            glitchInputs['canvasHeight'].value = currentState.canvasHeight;
        }
        playPreview();
    } else {
        alert(T('msg.textAreaNotFound'));
    }
}

// --- 匯出整合邏輯 ---
/* webp-muxer.js 是獨立、不在地化的函式庫，例外訊息一律是穩定的英文錯誤代碼
 * （例如 'WEBP_ERR_NO_FRAMES'），而非在地化文字，讓該檔案可獨立於本引擎重複使用。
 * 這裡在顯示前，將代碼對照為目前語言的訊息；找不到對照時原樣顯示（例如瀏覽器
 * 原生錯誤）。 */
const WEBP_ERROR_KEYS = {
    WEBP_ERR_PARSE: 'webpErr.parse',
    WEBP_ERR_NO_IMAGE_DATA: 'webpErr.noImageData',
    WEBP_ERR_NO_FRAMES: 'webpErr.noFrames',
    WEBP_ERR_INVALID_SIZE: 'webpErr.invalidSize',
    WEBP_ERR_SIZE_TOO_LARGE: 'webpErr.sizeTooLarge',
    WEBP_ERR_FRAME_OUT_OF_BOUNDS: 'webpErr.frameOutOfBounds',
    WEBP_ERR_ENCODE_FAILED: 'webpErr.encodeFailed',
    WEBP_ERR_UNSUPPORTED: 'webpErr.unsupported'
};
function describeExportError(e) {
    const key = e && WEBP_ERROR_KEYS[e.message];
    return key ? T(key) : (e && e.message ? e.message : e);
}
const nextTick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const setExportStatus = (text) => { exportOverlay.textContent = text; };

// 將目前分頁的狀態正規化為「要畫幾張圖、以什麼檔名儲存」。
// 如片尾字幕的分割儲存般，若結果有多個，會回傳多個工作項目。
function buildExportJobs() {
    const ts = new Date().getTime();

    if (currentTab === 'typing' || currentTab === 'glitch') {
        const frames = currentTab === 'typing' ? generatedFrames : glitchGeneratedFrames;
        const st = currentTab === 'typing' ? state : glitchState;
        if (frames.length === 0) return [];
        const frameDelayMs = 1000 / st.fps;
        return [{
            w: st.canvasWidth, h: st.canvasHeight, count: frames.length,
            compress: st.apngCompress, transparent: !st.useBackgroundColor,
            fileBase: `${currentTab}_${ts}`,
            delayAt: (i) => frames[i].isHold ? st.holdLast : frameDelayMs,
            renderAt: (c, i) => renderTextDataToCanvas(c, frames[i], st.canvasWidth, st.canvasHeight, st, i)
        }];
    }

    if (currentTab === 'karaoke') {
        if (karaokeFrames.length === 0) return [];
        const st = karaokeState;
        const frameDelayMs = 1000 / st.fps;
        return [{
            w: st.canvasWidth, h: st.canvasHeight, count: karaokeFrames.length,
            compress: st.apngCompress, transparent: !st.useBackgroundColor,
            fileBase: `karaoke_${ts}`,
            delayAt: (i) => karaokeFrames[i].isHold ? st.holdLast : frameDelayMs,
            renderAt: (c, i) => renderKaraokeToCanvas(c, st.canvasWidth, st.canvasHeight, karaokeFrames[i].t, st)
        }];
    }

    if (!creditState.text) return [];
    const blocks = creditState.splitMode ? creditState.text.split(/\n\s*\n/) : [creditState.text];
    const totalChars = blocks.reduce((acc, b) => acc + b.length, 0);
    const frameDelayMs = 1000 / creditState.fps;
    const jobs = [];

    blocks.forEach((raw, bIdx) => {
        const blockText = raw.trim();
        if (!blockText) return;

        let blockDuration = creditState.totalDuration;
        if (creditState.splitMode && totalChars > 0) {
            blockDuration = creditState.totalDuration * (blockText.length / totalChars);
        }
        const count = Math.max(2, Math.floor(blockDuration * creditState.fps));
        const snippet = blockText.split('\n')[0].substring(0, 10).replace(/[^a-zA-Z0-9가-힣]/g, '');

        jobs.push({
            w: creditState.canvasWidth, h: creditState.canvasHeight, count,
            compress: creditState.apngCompress, transparent: !creditState.useBackgroundColor,
            fileBase: creditState.splitMode ? `${bIdx + 1}_${snippet}_${ts}` : `credit_${ts}`,
            delayAt: () => frameDelayMs,
            renderAt: (c, i) => renderCreditBlockToCanvas(c, creditState.canvasWidth, creditState.canvasHeight, i, count, blockText)
        });
    });
    return jobs;
}

// format: 'apng' | 'gif' | 'webp'
async function exportAnimation(format) {
    const jobs = buildExportJobs();
    if (!jobs.length) return alert(T('msg.noText'));

    if (format === 'webp' && !WebPAnim.isSupported()) {
        return alert(T('msg.webpUnsupported'));
    }

    let workerUrl = null;
    if (format === 'gif') {
        try {
            const res = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
            workerUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'application/javascript' }));
        } catch (e) { return alert(T('msg.gifPrepFailed')); }
    }

    const label = format.toUpperCase();
    exportOverlay.classList.remove('hidden');

    try {
        for (let j = 0; j < jobs.length; j++) {
            const job = jobs[j];
            const suffix = jobs.length > 1 ? ` (${j + 1} / ${jobs.length})` : '';
            setExportStatus(T('export.rendering', label, suffix));
            await nextTick(50);

            const offCanvas = document.createElement('canvas');
            offCanvas.width = job.w; offCanvas.height = job.h;
            const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

            if (format === 'apng') {
                const buffers = [], delays = [];
                for (let i = 0; i < job.count; i++) {
                    job.renderAt(offCtx, i);
                    buffers.push(offCtx.getImageData(0, 0, job.w, job.h).data.buffer);
                    delays.push(job.delayAt(i));
                    if (i > 0 && i % 40 === 0) {
                        setExportStatus(T('export.apngFrameRendering', i + 1, job.count, suffix));
                        await nextTick();
                    }
                }
                setExportStatus(T('export.apngCompressing', suffix));
                await nextTick(30);
                const apngBuffer = UPNG.encode(buffers, job.w, job.h, job.compress ? 256 : 0, delays);
                downloadBlob(new Blob([apngBuffer], { type: 'image/png' }), `${job.fileBase}.png`);

            } else if (format === 'webp') {
                const quality = exportState.webpLossless
                    ? 1.0
                    : Math.min(100, Math.max(1, exportState.webpQuality || 92)) / 100;

                // 只裁切變動區域再編碼，可大幅縮小容量。
                const patchCanvas = document.createElement('canvas');
                const patchCtx = patchCanvas.getContext('2d');
                const frames = [];
                let prevData = null;

                for (let i = 0; i < job.count; i++) {
                    job.renderAt(offCtx, i);
                    const curData = offCtx.getImageData(0, 0, job.w, job.h);

                    let rect = { x: 0, y: 0, width: job.w, height: job.h };
                    if (prevData) {
                        const diff = WebPAnim.diffRect(prevData.data, curData.data, job.w, job.h);
                        // 若無變化，僅放入最小尺寸的補丁以維持影格數。
                        rect = diff || { x: 0, y: 0, width: Math.min(2, job.w), height: Math.min(2, job.h) };
                    }

                    let source = offCanvas;
                    if (rect.width !== job.w || rect.height !== job.h) {
                        patchCanvas.width = rect.width; patchCanvas.height = rect.height;
                        patchCtx.putImageData(curData, -rect.x, -rect.y);
                        source = patchCanvas;
                    }

                    const buffer = await WebPAnim.canvasToWebP(source, quality);
                    // 為相容各種檢視器，設定影格延遲時間的下限。
                    frames.push({ buffer, delay: Math.max(20, job.delayAt(i)), ...rect });
                    prevData = curData;

                    if (i % 10 === 0) setExportStatus(T('export.webpEncoding', i + 1, job.count, suffix));
                }
                setExportStatus(T('export.webpMuxing', suffix));
                await nextTick(30);
                const bytes = WebPAnim.encodeAnimation(frames, {
                    width: job.w, height: job.h, loop: 0, alpha: job.transparent
                });
                downloadBlob(new Blob([bytes], { type: 'image/webp' }), `${job.fileBase}.webp`);

            } else {
                const gif = new GIF({
                    workers: 2, quality: 10, workerScript: workerUrl,
                    width: job.w, height: job.h,
                    transparent: job.transparent ? 'rgba(0,0,0,0)' : null
                });
                for (let i = 0; i < job.count; i++) {
                    job.renderAt(offCtx, i);
                    gif.addFrame(offCanvas, { delay: job.delayAt(i), copy: true });
                }
                setExportStatus(T('export.gifCompressing', suffix));
                await new Promise((resolve, reject) => {
                    gif.on('finished', (blob) => { downloadBlob(blob, `${job.fileBase}.gif`); resolve(); });
                    gif.on('abort', () => reject(new Error(T('msg.gifAborted'))));
                    gif.render();
                });
            }

            if (j < jobs.length - 1) await nextTick(800);
        }
    } catch (e) {
        console.error(e);
        alert(T('msg.exportFailed', label) + describeExportError(e));
    } finally {
        if (workerUrl) URL.revokeObjectURL(workerUrl);
        exportOverlay.classList.add('hidden');
        setExportStatus(T('export.defaultStatus'));
    }
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- 音訊處理 ---
function audioBufferToWav(buffer) {
    let numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44,
        bufferArray = new ArrayBuffer(length), view = new DataView(bufferArray),
        channels = [], i, sample, offset = 0, pos = 0;

    function setUint16(data) { view.setUint16(offset, data, true); offset += 2; }
    function setUint32(data) { view.setUint32(offset, data, true); offset += 4; }

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16);
    setUint32(0x61746164); setUint32(length - pos - 4);

    for(i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while(pos < buffer.length) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos])); 
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; 
            view.setInt16(offset, sample, true); offset += 2;
        }
        pos++;
    }
    return new Blob([bufferArray], {type: "audio/wav"});
}

document.getElementById('input-audio').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        uploadedAudioBuffer = await audioCtx.decodeAudioData(await file.arrayBuffer());
        alert(T('msg.sfxLoaded'));
        document.getElementById('btn-generate-audio').disabled = false;
    } catch (err) { alert(T('msg.audioDecodeFailed')); }
});

document.getElementById('btn-generate-audio').addEventListener('click', async () => {
    if (!uploadedAudioBuffer) return alert(T('msg.uploadSfxFirst'));
    if (rawTypingFrameCount === 0) return alert(T('msg.noText'));

    exportOverlay.classList.remove('hidden');
    exportOverlay.textContent = T('audio.generatingSfx');
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const frameDelaySeconds = 1.0 / state.fps;
        const typingDuration = rawTypingFrameCount * frameDelaySeconds;
        const holdLastSeconds = state.holdLast / 1000;
        const fadeOutTime = 0.2;
        let totalDuration = typingDuration + holdLastSeconds;

        if (state.audioMode === 'smart') totalDuration = Math.max(totalDuration, typingDuration + fadeOutTime);
        else totalDuration = Math.max(totalDuration, typingDuration + uploadedAudioBuffer.duration);

        const offlineCtx = new OfflineAudioContext(uploadedAudioBuffer.numberOfChannels, Math.ceil(totalDuration * uploadedAudioBuffer.sampleRate), uploadedAudioBuffer.sampleRate);
        const globalGain = offlineCtx.createGain();
        globalGain.connect(offlineCtx.destination);

        if (state.audioMode === 'smart') {
            globalGain.gain.setValueAtTime(1.0, 0);
            globalGain.gain.setValueAtTime(1.0, typingDuration);
            globalGain.gain.linearRampToValueAtTime(0.0001, typingDuration + fadeOutTime);
        }

        let nextAllowedTime = 0;
        for (let i = 0; i < rawTypingFrameCount; i++) {
            const currentTime = i * frameDelaySeconds;
            if (state.audioMode === 'smart' && currentTime < nextAllowedTime) continue;
            if (state.audioMode === 'smart') nextAllowedTime = currentTime + uploadedAudioBuffer.duration;

            const source = offlineCtx.createBufferSource();
            source.buffer = uploadedAudioBuffer;
            source.connect(globalGain);
            source.start(currentTime);
        }

        const renderedBuffer = await offlineCtx.startRendering();
        if (generatedAudioBlobUrl) URL.revokeObjectURL(generatedAudioBlobUrl);
        generatedAudioBlobUrl = URL.createObjectURL(audioBufferToWav(renderedBuffer));

        const audioPreview = document.getElementById('audio-preview');
        audioPreview.src = generatedAudioBlobUrl;
        audioPreview.classList.remove('hidden');
        document.getElementById('btn-download-audio').classList.remove('hidden');
    } catch (err) { alert(T('msg.sfxGenerationFailed')); }
    finally { exportOverlay.classList.add('hidden'); }
});

document.getElementById('btn-download-audio').addEventListener('click', () => {
    if (generatedAudioBlobUrl) downloadBlob(generatedAudioBlobUrl, `sound_${new Date().getTime()}.wav`);
});

document.getElementById('btn-generate-silent-audio').addEventListener('click', async () => {
    if (!creditState.text) return alert(T('msg.noText'));
    exportOverlay.classList.remove('hidden');
    
    const blocks = creditState.splitMode ? creditState.text.split(/\n\s*\n/) : [creditState.text];
    const totalChars = blocks.reduce((acc, b) => acc + b.length, 0);
    const extension = creditState.silentAudioExtension || 0;
    
    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
        const blockText = blocks[bIdx].trim();
        if (!blockText) continue;

        exportOverlay.textContent = creditState.splitMode ? T('audio.silentRenderingProgress', bIdx + 1, blocks.length) : T('audio.silentRendering');
        await new Promise(resolve => setTimeout(resolve, 50));

        let blockDuration = creditState.totalDuration;
        if (creditState.splitMode && totalChars > 0) {
            blockDuration = creditState.totalDuration * (blockText.length / totalChars);
        }
        
        const totalDuration = blockDuration + extension;
        if (totalDuration <= 0) continue;

        try {
            const sampleRate = 44100;
            const offlineCtx = new OfflineAudioContext(1, Math.ceil(totalDuration * sampleRate), sampleRate);
            const renderedBuffer = await offlineCtx.startRendering();
            const wavBlob = audioBufferToWav(renderedBuffer);

            const firstLineSnippet = blockText.split('\n')[0].substring(0, 10).replace(/[^a-zA-Z0-9가-힣]/g, '');
            const timestamp = new Date().getTime();
            const fileName = creditState.splitMode ? `${bIdx + 1}_${firstLineSnippet}_${timestamp}.wav` : `silent_${timestamp}.wav`;
            
            downloadBlob(wavBlob, fileName);
            if (creditState.splitMode && bIdx < blocks.length - 1) await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) { alert(T('msg.silentAudioFailed')); }
    }
    exportOverlay.classList.add('hidden');
});

// --- 設定儲存／還原 ---
function collectAllSettings() {
    return { typing: state, glitch: glitchState, credit: creditState, karaoke: karaokeState, export: exportState };
}

// legacyRoot：也接受舊格式（JSON 根層級僅有打字效果設定）。
function applyAllSettings(data, legacyRoot = false) {
    if (!data || typeof data !== 'object') return;
    state = { ...DEFAULT_STATE, ...(data.typing || (legacyRoot ? data : {})) };
    glitchState = { ...GLITCH_DEFAULT_STATE, ...(data.glitch || {}) };
    creditState = { ...CREDIT_DEFAULT_STATE, ...(data.credit || {}) };
    karaokeState = { ...KARAOKE_DEFAULT_STATE, ...(data.karaoke || {}) };
    exportState = { ...EXPORT_DEFAULT_STATE, ...(data.export || {}) };
    updateUIFromState();
}

// --- 為色彩輸入欄加上 HEX 色碼輸入／複製功能 ---
function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy') ? resolve() : reject(new Error('ERR_COPY_FAILED')); }
        catch (e) { reject(e); }
        finally { document.body.removeChild(ta); }
    });
}

function normalizeHex(value) {
    let v = String(value || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(v)) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    return /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : null;
}

function enhanceColorInputs(root = document) {
    root.querySelectorAll('input[type="color"]').forEach(colorEl => {
        if (colorEl.dataset.hexEnhanced) return;
        colorEl.dataset.hexEnhanced = '1';

        const wrap = document.createElement('div');
        wrap.className = 'color-row';
        wrap.style.flex = '1 1 auto';
        colorEl.parentNode.insertBefore(wrap, colorEl);
        wrap.appendChild(colorEl);
        colorEl.classList.add('color-swatch');

        const hex = document.createElement('input');
        hex.type = 'text';
        hex.className = 'input-base color-hex';
        hex.spellcheck = false;
        hex.maxLength = 7;
        hex.title = T('color.hexInput.title');
        hex.value = colorEl.value.toUpperCase();

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary color-copy';
        btn.textContent = T('action.copy');
        btn.title = T('color.copyHex.title');

        wrap.appendChild(hex);
        wrap.appendChild(btn);
        colorEl._hexField = hex;

        colorEl.addEventListener('input', () => {
            if (document.activeElement !== hex) hex.value = colorEl.value.toUpperCase();
        });

        hex.addEventListener('input', () => {
            const normalized = normalizeHex(hex.value);
            if (normalized && normalized !== colorEl.value) {
                colorEl.value = normalized;
                colorEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        hex.addEventListener('blur', () => { hex.value = colorEl.value.toUpperCase(); });
        hex.addEventListener('focus', () => hex.select());

        btn.addEventListener('click', () => {
            copyTextToClipboard(colorEl.value.toUpperCase()).then(() => {
                btn.textContent = T('action.done');
                btn.classList.add('copied');
                setTimeout(() => { btn.textContent = T('action.copy'); btn.classList.remove('copied'); }, 900);
            }).catch(() => alert(T('msg.clipboardCopyFailed')));
        });
    });
}

// 以程式碼方式替換設定時（載入／重置等），重新同步 HEX 輸入欄。
function syncColorHexFields() {
    document.querySelectorAll('input[type="color"]').forEach(colorEl => {
        if (colorEl._hexField) colorEl._hexField.value = colorEl.value.toUpperCase();
    });
}

// --- 初始化與事件註冊 ---
document.addEventListener('DOMContentLoaded', () => {
    enhanceColorInputs();
    for (const key in inputs) { inputs[key].addEventListener('input', updateStateFromUI); inputs[key].addEventListener('change', updateStateFromUI); }
    for (const key in glitchInputs) { glitchInputs[key].addEventListener('input', updateGlitchStateFromUI); glitchInputs[key].addEventListener('change', updateGlitchStateFromUI); }
    for (const key in creditInputs) { creditInputs[key].addEventListener('input', updateCreditStateFromUI); creditInputs[key].addEventListener('change', updateCreditStateFromUI); }
    for (const key in karaokeInputs) { karaokeInputs[key].addEventListener('input', updateKaraokeStateFromUI); karaokeInputs[key].addEventListener('change', updateKaraokeStateFromUI); }
    for (const key in exportInputs) { exportInputs[key].addEventListener('input', updateExportStateFromUI); exportInputs[key].addEventListener('change', updateExportStateFromUI); }
    splitModeRadios.forEach(radio => radio.addEventListener('change', updateCreditStateFromUI));

    document.querySelectorAll('.karaoke-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            let preset;
            try { preset = JSON.parse(btn.dataset.preset); } catch (e) { return; }
            for (const key in preset) {
                if (!karaokeInputs[key]) continue;
                karaokeInputs[key].value = preset[key];
                karaokeState[key] = preset[key];
            }
            syncColorHexFields();
            generateKaraokeFrames();
            playPreview();
        });
    });

    if (!WebPAnim.isSupported()) {
        document.getElementById('webp-support-note').classList.remove('hidden');
        document.getElementById('btn-export-webp').disabled = true;
        document.getElementById('btn-export-webp').classList.add('opacity-50', 'cursor-not-allowed');
    }

    document.getElementById('btn-save-local').addEventListener('click', () => {
        localStorage.setItem('anim-text-settings', JSON.stringify(collectAllSettings()));
        alert(T('msg.settingsSaved'));
    });

    document.getElementById('btn-load-local').addEventListener('click', () => {
        const data = localStorage.getItem('anim-text-settings');
        if (data) {
            applyAllSettings(JSON.parse(data));
        } else alert(T('msg.noSavedSettings'));
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        if(confirm(T('msg.confirmReset'))) {
            state = { ...DEFAULT_STATE };
            glitchState = { ...GLITCH_DEFAULT_STATE };
            creditState = { ...CREDIT_DEFAULT_STATE };
            karaokeState = { ...KARAOKE_DEFAULT_STATE };
            exportState = { ...EXPORT_DEFAULT_STATE };
            updateUIFromState();
        }
    });

    document.getElementById('btn-export-json').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(collectAllSettings(), null, 2)], { type: 'application/json' });
        downloadBlob(blob, `settings_${new Date().getTime()}.json`);
    });

    document.getElementById('input-import-json').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                applyAllSettings(data, true);
                e.target.value = '';
            } catch (err) { alert(T('msg.invalidJson')); }
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-play-preview').addEventListener('click', playPreview);
    document.getElementById('btn-pause-preview').addEventListener('click', pausePreview);
    document.getElementById('btn-resume-preview').addEventListener('click', resumePreview);

    document.getElementById('btn-auto-size').addEventListener('click', autoSizeCanvas);
    document.getElementById('btn-glitch-auto-size').addEventListener('click', autoSizeCanvas);
    document.getElementById('btn-karaoke-auto-size').addEventListener('click', autoSizeCanvas);

    document.getElementById('btn-export-apng').addEventListener('click', () => exportAnimation('apng'));
    document.getElementById('btn-export-gif').addEventListener('click', () => exportAnimation('gif'));
    document.getElementById('btn-export-webp').addEventListener('click', () => exportAnimation('webp'));

    I18N.mountSwitcher(document.getElementById('localeSelect'));
    I18N.onChange(() => {
        /* 重繪以 T() 產生的動態字串：預覽影格讀數與色彩 HEX 輔助元件。 */
        statusEl.textContent = T('status.frame', ...lastFrameStatus);
        document.querySelectorAll('.color-hex').forEach(hex => { hex.title = T('color.hexInput.title'); });
        document.querySelectorAll('.color-copy').forEach(btn => {
            btn.textContent = T('action.copy');
            btn.title = T('color.copyHex.title');
            btn.classList.remove('copied');
        });
    });

    setTimeout(() => updateUIFromState(), 100);
});
