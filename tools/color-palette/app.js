/**
 * 狀態管理（State）
 */
const state = {
    bg: '#f3f4f6',
    thickness: 10,       
    baseLength: 300,    
    baseRatio: 160,     
    autoSize: true,     
    canvasW: 400,      
    canvasH: 500,      
    cropPadding: 80,    
    zoom: 1.0,
    isCanvasEditMode: false, // 直接在畫布上調整分段的模式
    chars: [
        {
            id: Date.now(),
            ratio: 160,
            segments: [
                { id: 1, color: '#ff6b6b', weight: 1 },
                { id: 2, color: '#feca57', weight: 1 },
                { id: 3, color: '#48dbfb', weight: 1 }
            ]
        }
    ],
    // 對話框的狀態
    targetCharIdForExtraction: null, 
    uploadedImage: null,
    modalTab: 'manual', // 'manual' | 'auto'
    modalZoom: 1.0,
    pickedPoints: [],   // 手動模式取到的顏色（含座標：{x, y, color}）
    segmentLines: []    // 分割線的位置，存的是 0～1 的比例
};

const MAX_CHARS = 24;
const GAP_BETWEEN_LINES = 60; // 每條之間的間距

// 主要的 DOM 元素
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const canvasWrapper = document.getElementById('canvasWrapper');
const canvasEditOverlay = document.getElementById('canvasEditOverlay');
const scrollContainer = document.getElementById('scrollContainer');

const elZoomSlider = document.getElementById('zoomSlider');
const elCanvasEditToggle = document.getElementById('canvasEditToggle');

/**
    * 初始化與事件綁定
    */
function init() {
    document.getElementById('bgColor').value = state.bg;
    document.getElementById('bgColorHex').value = state.bg;
    document.getElementById('thickness').value = state.thickness;
    document.getElementById('baseLength').value = state.baseLength;
    document.getElementById('baseRatio').value = state.baseRatio;
    
    document.getElementById('autoSizeToggle').checked = state.autoSize;
    document.getElementById('canvasW').value = state.canvasW;
    document.getElementById('canvasH').value = state.canvasH;
    document.getElementById('cropPadding').value = state.cropPadding;
    elZoomSlider.value = state.zoom;
    
    toggleSizeInputs();

    // 全域事件
    document.getElementById('bgColor').addEventListener('input', (e) => { state.bg = e.target.value; document.getElementById('bgColorHex').value = state.bg; renderCanvas(); });
    document.getElementById('thickness').addEventListener('input', (e) => { state.thickness = Number(e.target.value); renderCanvas(); });
    document.getElementById('baseLength').addEventListener('input', (e) => { state.baseLength = Number(e.target.value); renderCanvas(); });
    document.getElementById('baseRatio').addEventListener('input', (e) => { state.baseRatio = Number(e.target.value); renderCanvas(); });
    
    document.getElementById('autoSizeToggle').addEventListener('change', (e) => { state.autoSize = e.target.checked; toggleSizeInputs(); renderCanvas(); });
    document.getElementById('canvasW').addEventListener('input', (e) => { state.canvasW = Number(e.target.value); renderCanvas(); });
    document.getElementById('canvasH').addEventListener('input', (e) => { state.canvasH = Number(e.target.value); renderCanvas(); });
    document.getElementById('cropPadding').addEventListener('input', (e) => { state.cropPadding = Number(e.target.value); renderCanvas(); });
    
    elZoomSlider.addEventListener('input', handleZoom);
    elCanvasEditToggle.addEventListener('change', (e) => { state.isCanvasEditMode = e.target.checked; renderCanvas(); });

    document.getElementById('addCharBtn').addEventListener('click', addCharacter);
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);
    
    // 主畫面的縮放快速鍵（Ctrl＋滾輪）
    scrollContainer.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            state.zoom = Math.max(0.1, Math.min(3, state.zoom - e.deltaY * 0.005));
            elZoomSlider.value = state.zoom;
            handleZoom();
        }
    }, { passive: false });

    // 對話框裡的縮放快速鍵，與滑桿連動
    const imgScrollArea = document.getElementById('imageModalScroll');
    const modalZoomSlider = document.getElementById('modalZoomSlider');
    modalZoomSlider.addEventListener('input', (e) => {
        state.modalZoom = Number(e.target.value);
        applyModalZoom();
    });
    imgScrollArea.addEventListener('wheel', (e) => {
        if ((e.ctrlKey || e.metaKey) && !document.getElementById('imageModal').classList.contains('hidden')) {
            e.preventDefault();
            state.modalZoom = Math.max(0.2, Math.min(5, state.modalZoom - e.deltaY * 0.005));
            modalZoomSlider.value = state.modalZoom;
            applyModalZoom();
        }
    }, { passive: false });

    render();
}

function toggleSizeInputs() {
    const isAuto = state.autoSize;
    ['canvasW', 'canvasH'].forEach(id => {
        const el = document.getElementById(id);
        el.disabled = isAuto;
        el.classList.toggle('opacity-50', isAuto);
    });
}

function handleZoom() {
    state.zoom = Number(elZoomSlider.value);
    document.getElementById('zoomValue').textContent = Math.round(state.zoom * 100) + '%';
    applyZoomStyle();
}

function applyZoomStyle() {
    // 畫布真正的像素尺寸是一回事，畫面上看起來多大是另一回事，後者用 CSS 控制。
    const w = canvas.width * state.zoom;
    const h = canvas.height * state.zoom;
    canvasWrapper.style.width = `${w}px`;
    canvasWrapper.style.height = `${h}px`;
}

// 拖放的狀態
let dragState = { charId: null, segId: null };

function onDragStart(e, charId, segId) {
    dragState = { charId, segId };
    e.dataTransfer.effectAllowed = 'move';
    // 延後一點再改樣式：跟著滑鼠走的殘影要保持清楚，只讓原本那個元素變半透明。
    setTimeout(() => e.target.classList.add('opacity-40', 'border-dashed'), 0);
}

function onDragOver(e) {
    e.preventDefault(); // 不擋掉的話就不能放
    e.dataTransfer.dropEffect = 'move';
}

function onDragEnter(e) {
    e.preventDefault();
    const row = e.target.closest('div[draggable="true"]');
    if (row) row.classList.add('bg-blue-50', 'border-blue-300');
}

function onDragLeave(e) {
    const row = e.target.closest('div[draggable="true"]');
    // 滑到子元素（input 之類）時會閃，這裡擋掉
    if (row && !row.contains(e.relatedTarget)) {
        row.classList.remove('bg-blue-50', 'border-blue-300');
    }
}

function onDrop(e, targetCharId, targetSegId) {
    e.preventDefault();
    const row = e.target.closest('div[draggable="true"]');
    if (row) row.classList.remove('bg-blue-50', 'border-blue-300');

    if (dragState.charId === targetCharId && dragState.segId !== targetSegId) {
        const char = state.chars.find(c => c.id === dragState.charId);
        const fromIndex = char.segments.findIndex(s => s.id === dragState.segId);
        const toIndex = char.segments.findIndex(s => s.id === targetSegId);

        // 搬動陣列元素
        const [movedSeg] = char.segments.splice(fromIndex, 1);
        char.segments.splice(toIndex, 0, movedSeg);

        render();
    }
}

function onDragEnd(e) {
    e.target.classList.remove('opacity-40', 'border-dashed');
    dragState = { charId: null, segId: null };
}

/**
    * 畫面算繪（左側面板）
    */
function renderUI() {
    const charListEl = document.getElementById('characterList');
    document.getElementById('charCount').textContent = state.chars.length;
    charListEl.innerHTML = '';

    state.chars.forEach((char, index) => {
        const charEl = document.createElement('div');
        charEl.className = `bg-white border p-3 rounded shadow-sm relative transition-colors ${state.isCanvasEditMode ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`;
        
        let segmentsHtml = char.segments.map((seg) => `
            <div class="flex items-center gap-2 mb-1 p-1 rounded border border-transparent transition-colors hover:bg-gray-100"
                    draggable="true"
                    ondragstart="onDragStart(event, ${char.id}, ${seg.id})"
                    ondragover="onDragOver(event)"
                    ondragenter="onDragEnter(event)"
                    ondragleave="onDragLeave(event)"
                    ondrop="onDrop(event, ${char.id}, ${seg.id})"
                    ondragend="onDragEnd(event)">
                <div class="cursor-grab text-gray-400 hover:text-gray-700 font-bold select-none px-1" title="${T('seg.drag')}">⋮⋮</div>
                <input type="color" value="${seg.color}" onchange="updateSegment(${char.id}, ${seg.id}, 'color', this.value)" class="w-6 h-6 rounded cursor-pointer border border-gray-300 shrink-0">
                <div class="flex-1 flex items-center text-xs">
                    <span class="text-gray-500 mr-1">${T('seg.ratio')}</span>
                    <input type="number" min="0.01" step="0.1" value="${seg.weight}" onchange="updateSegment(${char.id}, ${seg.id}, 'weight', this.value)" class="w-full border border-gray-300 rounded px-1 py-0.5">
                </div>
                <button onclick="removeSegment(${char.id}, ${seg.id})" class="text-red-500 hover:text-red-700 text-xs px-1 shrink-0" title="${T('seg.delete')}">✕</button>
            </div>
        `).join('');

        charEl.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-semibold text-sm">${T('char.line', index + 1)}</span>
                <div class="flex gap-2">
                    <button onclick="openImageModal(${char.id})" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium">${T('char.fromImage')}</button>
                    <button onclick="removeCharacter(${char.id})" class="text-xs text-red-500 hover:underline">${T('char.delete')}</button>
                </div>
            </div>
            <div class="mb-3 flex items-center text-sm gap-2">
                <label class="text-gray-600 whitespace-nowrap">${T('char.ratio')}</label>
                <input type="number" min="1" step="0.1" value="${char.ratio}" onchange="updateCharRatio(${char.id}, this.value)" class="w-full border border-gray-300 rounded px-2 py-1">
            </div>
            <div class="bg-gray-50 p-2 rounded border border-gray-100">
                <div class="text-xs text-gray-500 mb-2 flex justify-between">
                    <span>${T('seg.heading')}</span>
                    <button onclick="addSegment(${char.id})" class="text-blue-600 hover:text-blue-800 font-medium">${T('seg.add')}</button>
                </div>
                <div class="max-h-40 overflow-y-auto pr-1">
                    ${segmentsHtml}
                    ${char.segments.length === 0 ? `<p class="text-xs text-gray-400 text-center py-2">${T('seg.empty')}</p>` : ''}
                </div>
            </div>
        `;
        charListEl.appendChild(charEl);
    });

    const addBtn = document.getElementById('addCharBtn');
    addBtn.disabled = state.chars.length >= MAX_CHARS;
    addBtn.className = state.chars.length >= MAX_CHARS 
        ? 'text-sm px-3 py-1 bg-gray-100 text-gray-400 rounded font-medium cursor-not-allowed' 
        : 'text-sm px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded font-medium transition';
}

/**
    * 畫布算繪與分段把手
    */
function renderCanvas() {
    const numChars = state.chars.length;
    
    // 算每條的長度
    let maxCharLength = 0;
    const lengths = state.chars.map(char => {
        const len = (state.baseLength / state.baseRatio) * char.ratio;
        if (len > maxCharLength) maxCharLength = len;
        return len;
    });

    const gap = GAP_BETWEEN_LINES;
    const contentWidth = (numChars * state.thickness) + ((numChars - 1) * Math.max(0, gap));
    const pad = state.cropPadding;

    // 設定尺寸
    if (state.autoSize) {
        canvas.width = Math.max(100, contentWidth + (pad * 2));
        canvas.height = Math.max(100, maxCharLength + (pad * 2));
    } else {
        canvas.width = state.canvasW;
        canvas.height = state.canvasH;
    }

    // 背景
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 算出對齊底部用的基準線 Y 座標
    const baseLineY = (canvas.height + maxCharLength) / 2;

    canvasEditOverlay.innerHTML = '';
    if (numChars === 0) {
        applyZoomStyle();
        return;
    }

    const startXOffset = (canvas.width - contentWidth) / 2;

    state.chars.forEach((char, index) => {
        const totalLength = lengths[index];
        const centerX = startXOffset + (index * (state.thickness + gap)) + (state.thickness / 2);
        
        // 以底部為準，決定每一段的起始高度
        const startY = baseLineY - totalLength;
        
        const thickness = state.thickness;
        const radius = thickness / 2;

        // 1) 畫上畫布（圓角線條的裁切）
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(centerX - radius, startY, thickness, totalLength, radius);
        } else {
            const x = centerX - radius, y = startY, w = thickness, h = totalLength;
            ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius); ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h); ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius); ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
        }
        ctx.clip(); 

        const totalWeight = char.segments.reduce((sum, seg) => sum + Number(seg.weight), 0);
        let currentY = startY;

        if (totalWeight > 0) {
            char.segments.forEach(seg => {
                const segHeight = (Number(seg.weight) / totalWeight) * totalLength;
                ctx.fillStyle = seg.color;
                ctx.fillRect(centerX - radius, currentY - 1, thickness, segHeight + 2);
                currentY += segHeight;
            });
        } else {
            ctx.fillStyle = '#cccccc';
            ctx.fillRect(centerX - radius, startY, thickness, totalLength);
        }
        ctx.restore();

        // 2) 建立直接調整分段的把手（開關打開時才有）
        if (state.isCanvasEditMode && totalWeight > 0) {
            canvasEditOverlay.classList.remove('hidden');
            let handleY = startY;
            const weightToPixelRatio = totalLength / totalWeight;

            char.segments.forEach((seg, sIdx) => {
                const segHeight = (Number(seg.weight) / totalWeight) * totalLength;
                handleY += segHeight;

                // 最後一段下面不需要把手
                if (sIdx < char.segments.length - 1) {
                    const handle = document.createElement('div');
                    // 把手的樣式
                    handle.className = 'absolute bg-white border-2 border-red-500 rounded-full cursor-ns-resize shadow-md pointer-events-auto hover:bg-red-100 hover:scale-125 transition-transform z-30';
                    const hw = Math.max(state.thickness + 12, 20); // 至少留 20px 寬，不然抓不到
                    const hh = 10;
                    
                    // 用百分比定位，縮放後位置才不會跑掉
                    handle.style.left = `calc(${(centerX / canvas.width) * 100}% - ${hw/2}px)`;
                    handle.style.top = `calc(${(handleY / canvas.height) * 100}% - ${hh/2}px)`;
                    handle.style.width = `${hw}px`;
                    handle.style.height = `${hh}px`;

                    // 拖曳
                    handle.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        let isDragging = true;
                        const startMouseY = e.clientY;
                        const initialWeightA = Number(char.segments[sIdx].weight);
                        const initialWeightB = Number(char.segments[sIdx+1].weight);
                        const localTotalW = initialWeightA + initialWeightB;

                        const onMouseMove = (moveEvent) => {
                            if (!isDragging) return;
                            // 除掉縮放倍率，才是真正移動了幾個像素
                            const deltaY = (moveEvent.clientY - startMouseY) / state.zoom;
                            const deltaWeight = deltaY / weightToPixelRatio;

                            let newWa = initialWeightA + deltaWeight;
                            let newWb = initialWeightB - deltaWeight;

                            // 防止互相蓋過去（每段至少保留 0.05 的權重）
                            const minW = 0.05;
                            if (newWa < minW) { newWa = minW; newWb = localTotalW - minW; }
                            if (newWb < minW) { newWb = minW; newWa = localTotalW - minW; }

                            char.segments[sIdx].weight = parseFloat(newWa.toFixed(3));
                            char.segments[sIdx+1].weight = parseFloat(newWb.toFixed(3));
                            
                            render();
                        };

                        const onMouseUp = () => {
                            isDragging = false;
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                        };

                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                    });

                    canvasEditOverlay.appendChild(handle);
                }
            });
        } else if (!state.isCanvasEditMode) {
            canvasEditOverlay.classList.add('hidden');
        }
    });

    applyZoomStyle();
}

function render() {
    renderUI();
    renderCanvas();
}

// 更新狀態的函式
function addCharacter() {
    if (state.chars.length >= MAX_CHARS) return;
    state.chars.push({ id: Date.now(), ratio: state.baseRatio, segments: [{ id: Date.now(), color: '#000000', weight: 1 }] });
    render();
}
function removeCharacter(id) { state.chars = state.chars.filter(c => c.id !== id); render(); }
function updateCharRatio(id, ratio) {
    const char = state.chars.find(c => c.id === id);
    if (char) { char.ratio = Number(ratio); renderCanvas(); }
}
function addSegment(charId) {
    const char = state.chars.find(c => c.id === charId);
    if (char) { char.segments.push({ id: Date.now(), color: '#333333', weight: 1 }); render(); }
}
function removeSegment(charId, segId) {
    const char = state.chars.find(c => c.id === charId);
    if (char) { char.segments = char.segments.filter(s => s.id !== segId); render(); }
}
function updateSegment(charId, segId, key, value) {
    const char = state.chars.find(c => c.id === charId);
    if (char) {
        const seg = char.segments.find(s => s.id === segId);
        if (seg) seg[key] = key === 'weight' ? Number(value) : value;
        renderCanvas(); 
    }
}

/**
    * 下載（含裁邊）
    */
function downloadPNG(isCrop) {
    if (state.chars.length === 0) { alert(T("save.empty")); return; }
    let exportCanvas = canvas;

    if (isCrop) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const pad = state.cropPadding;
        const contentW = (state.chars.length * state.thickness) + ((state.chars.length - 1) * GAP_BETWEEN_LINES);
        const startX = (canvas.width - contentW) / 2;

        // 算 maxCharLength
        let maxCharLength = 0;
        state.chars.forEach(char => {
            const len = (state.baseLength / state.baseRatio) * char.ratio;
            if (len > maxCharLength) maxCharLength = len;
        });
        const baseLineY = (canvas.height + maxCharLength) / 2;

        state.chars.forEach((char, idx) => {
            const len = (state.baseLength / state.baseRatio) * char.ratio;
            const cx = startX + (idx * (state.thickness + GAP_BETWEEN_LINES)) + (state.thickness / 2);
            const sy = baseLineY - len;

            if (cx - state.thickness/2 < minX) minX = cx - state.thickness/2;
            if (cx + state.thickness/2 > maxX) maxX = cx + state.thickness/2;
            if (sy < minY) minY = sy;
            if (sy + len > maxY) maxY = sy + len;
        });

        const cropW = (maxX - minX) + (pad * 2);
        const cropH = (maxY - minY) + (pad * 2);
        
        exportCanvas = document.createElement('canvas');
        exportCanvas.width = cropW; exportCanvas.height = cropH;
        const eCtx = exportCanvas.getContext('2d');
        eCtx.fillStyle = state.bg; eCtx.fillRect(0, 0, cropW, cropH);
        eCtx.drawImage(canvas, minX, minY, maxX - minX, maxY - minY, pad, pad, maxX - minX, maxY - minY);
    }

    const link = document.createElement('a');
    link.download = `palette_${isCrop ? 'crop' : 'full'}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}

/**
    * 從圖片取色的對話框（分頁、滴管、縮放與拖曳）
    */
const modal = document.getElementById('imageModal');
const overlayContainer = document.getElementById('imageOverlayContainer');
const modalImg = document.getElementById('modalPreviewImg');
const hiddenCanvas = document.getElementById('hiddenImageCanvas');
const handleContainer = document.getElementById('handleContainer');
const imgCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

let dragInfo = { isDragging: false, isDraggingPoint: false, index: -1 };

function switchTab(tab) {
    state.modalTab = tab;
    document.getElementById('tabManual').className = tab === 'manual' ? 'pb-1 border-b-2 border-blue-600 text-blue-600 font-bold transition' : 'pb-1 border-b-2 border-transparent text-gray-400 hover:text-gray-600 transition';
    document.getElementById('tabAuto').className = tab === 'auto' ? 'pb-1 border-b-2 border-blue-600 text-blue-600 font-bold transition' : 'pb-1 border-b-2 border-transparent text-gray-400 hover:text-gray-600 transition';
    
    document.getElementById('manualOptions').style.display = tab === 'manual' ? 'flex' : 'none';
    document.getElementById('autoOptions').style.display = tab === 'auto' ? 'block' : 'none';
    
    initSegmentLines(); // 重設狀態
}

function openImageModal(charId) {
    state.targetCharIdForExtraction = charId;
    modal.classList.remove('hidden');
    document.getElementById('imageInput').value = '';
    document.getElementById('imagePlaceholder').style.display = 'block';
    overlayContainer.classList.add('hidden');
    state.uploadedImage = null;
    state.modalZoom = 1.0;
    document.getElementById('modalZoomSlider').value = 1.0;
    initSegmentLines();
}

function closeImageModal() {
    modal.classList.add('hidden');
    state.targetCharIdForExtraction = null;
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
            state.uploadedImage = img;
            hiddenCanvas.width = img.width;
            hiddenCanvas.height = img.height;
            imgCtx.drawImage(img, 0, 0);

            modalImg.src = img.src;
            document.getElementById('imagePlaceholder').style.display = 'none';
            overlayContainer.classList.remove('hidden');

            applyModalZoom();
            initSegmentLines();
        }
        img.src = evt.target.result;
    }
    reader.readAsDataURL(file);
}

function applyModalZoom() {
    if (!state.uploadedImage) return;
    const w = state.uploadedImage.width * state.modalZoom;
    const h = state.uploadedImage.height * state.modalZoom;
    overlayContainer.style.width = `${w}px`;
    overlayContainer.style.height = `${h}px`;
}

// 取出圖片上某個像素的顏色
function getColorAt(x, y) {
    if (x < 0 || x >= hiddenCanvas.width || y < 0 || y >= hiddenCanvas.height) return '#000000';
    const pixel = imgCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return "#" + (1 << 24 | pixel[0] << 16 | pixel[1] << 8 | pixel[2]).toString(16).slice(1).toUpperCase();
}

// 手動模式的畫面（滴管取到的顏色格）
function renderSwatches() {
    const total = Number(document.getElementById('extractSegments').value);
    const container = document.getElementById('colorSwatches');
    container.innerHTML = '';
    
    for (let i = 0; i < total; i++) {
        const pt = state.pickedPoints[i];
        const div = document.createElement('div');
        div.className = 'w-6 h-6 rounded border border-gray-300 shadow-inner flex items-center justify-center text-xs font-bold transition';
        if (pt) {
            div.style.backgroundColor = pt.color;
        } else {
            div.style.backgroundColor = '#e5e7eb';
            div.textContent = '?';
            div.className += ' text-gray-400';
        }
        container.appendChild(div);
    }

    const statusText = document.getElementById('manualStatusText');
    if (state.pickedPoints.length < total) {
        statusText.textContent = T("ext.status", state.pickedPoints.length, total);
        statusText.className = 'text-blue-600 font-bold text-sm mb-1';
        overlayContainer.classList.add('cursor-crosshair');
    } else {
        statusText.textContent = T("ext.statusDone");
        statusText.className = 'text-green-600 font-bold text-sm mb-1';
        overlayContainer.classList.remove('cursor-crosshair');
    }
}

function renderPointMarkers() {
    if (state.modalTab !== 'manual') return;
    handleContainer.innerHTML = '';
    
    state.pickedPoints.forEach((pt, index) => {
        const marker = document.createElement('div');
        marker.className = 'point-marker pointer-events-auto';
        marker.style.left = `${(pt.x / hiddenCanvas.width) * 100}%`;
        marker.style.top = `${(pt.y / hiddenCanvas.height) * 100}%`;
        marker.style.backgroundColor = pt.color;

        marker.addEventListener('mousedown', (e) => {
            dragInfo.isDraggingPoint = true;
            dragInfo.index = index;
            e.preventDefault();
            e.stopPropagation();
        });
        
        handleContainer.appendChild(marker);
    });
}

function initSegmentLines() {
    state.pickedPoints = [];
    state.segmentLines = [];
    renderSwatches();
    handleContainer.innerHTML = '';
    
    if (!state.uploadedImage) return;
    
    const numSegments = Number(document.getElementById('extractSegments').value);
    if (numSegments < 1) return;

    if (state.modalTab === 'auto') {
        createDragHandles(numSegments);
    }
}

function createDragHandles(numSegments) {
    state.segmentLines = [];
    for (let i = 1; i < numSegments; i++) {
        state.segmentLines.push(i / numSegments);
    }
    
    handleContainer.innerHTML = '';
    state.segmentLines.forEach((ratio, index) => {
        const handle = document.createElement('div');
        handle.className = 'segment-handle pointer-events-auto';
        handle.style.top = `${ratio * 100}%`;
        
        handle.addEventListener('mousedown', (e) => {
            dragInfo.isDragging = true;
            dragInfo.index = index;
            handle.classList.add('dragging');
            e.preventDefault();
            e.stopPropagation(); // 別讓這一下變成滴管取色
        });
        
        handleContainer.appendChild(handle);
    });
}

// 對話框裡圖片的滑鼠事件（滴管與把手拖曳共用同一條路徑）
overlayContainer.addEventListener('mousedown', (e) => {
    // 滴管（手動模式，而且還沒選滿）
    const totalColors = Number(document.getElementById('extractSegments').value);
    if (state.modalTab === 'manual' && state.pickedPoints.length < totalColors && !dragInfo.isDragging && !dragInfo.isDraggingPoint) {
        const rect = overlayContainer.getBoundingClientRect();
        // 換算回原圖座標時要把縮放倍率算進去
        const x = (e.clientX - rect.left) / state.modalZoom;
        const y = (e.clientY - rect.top) / state.modalZoom;
        
        if (x >= 0 && x < hiddenCanvas.width && y >= 0 && y < hiddenCanvas.height) {
            state.pickedPoints.push({ x, y, color: getColorAt(x, y) });
            renderSwatches();
            renderPointMarkers();
        }
    }
});

// 拖動把手與取色標記
window.addEventListener('mousemove', (e) => {
    if (dragInfo.isDragging) {
        const rect = overlayContainer.getBoundingClientRect();
        let y = e.clientY - rect.top;
        y = Math.max(0, Math.min(y, rect.height));
        
        let newRatio = y / rect.height;
        const idx = dragInfo.index;
        const minGap = 0.02; 
        const prevRatio = idx > 0 ? state.segmentLines[idx - 1] : 0;
        const nextRatio = idx < state.segmentLines.length - 1 ? state.segmentLines[idx + 1] : 1;
        
        newRatio = Math.max(prevRatio + minGap, Math.min(nextRatio - minGap, newRatio));
        state.segmentLines[idx] = newRatio;
        handleContainer.children[idx].style.top = `${newRatio * 100}%`;
    } else if (dragInfo.isDraggingPoint) {
        const rect = overlayContainer.getBoundingClientRect();
        let x = (e.clientX - rect.left) / state.modalZoom;
        let y = (e.clientY - rect.top) / state.modalZoom;

        x = Math.max(0, Math.min(x, hiddenCanvas.width - 1));
        y = Math.max(0, Math.min(y, hiddenCanvas.height - 1));

        const newColor = getColorAt(x, y);
        state.pickedPoints[dragInfo.index].x = x;
        state.pickedPoints[dragInfo.index].y = y;
        state.pickedPoints[dragInfo.index].color = newColor;

        const marker = handleContainer.children[dragInfo.index];
        if (marker) {
            marker.style.left = `${(x / hiddenCanvas.width) * 100}%`;
            marker.style.top = `${(y / hiddenCanvas.height) * 100}%`;
            marker.style.backgroundColor = newColor;
        }
        renderSwatches();
    }
});

window.addEventListener('mouseup', () => {
    if (dragInfo.isDragging) {
        dragInfo.isDragging = false;
        Array.from(handleContainer.children).forEach(el => el.classList.remove('dragging'));
    }
    if (dragInfo.isDraggingPoint) {
        dragInfo.isDraggingPoint = false;
    }
});

document.getElementById('extractSegments').addEventListener('change', initSegmentLines);

// 套用取色
function applyExtraction() {
    if (!state.uploadedImage || !state.targetCharIdForExtraction) { alert(T("ext.noImage")); return; }
    
    const numSegments = Number(document.getElementById('extractSegments').value);
    const isManual = state.modalTab === 'manual';
    const extractedSegments = [];

    if (isManual) {
        if (state.pickedPoints.length < numSegments) {
            alert(T("ext.needAll", numSegments));
            return;
        }
        for (let i = 0; i < numSegments; i++) {
            extractedSegments.push({
                id: Date.now() + i,
                color: state.pickedPoints[i].color,
                weight: 1 // 手動模式一律給同樣的比例（1）
            });
        }
    } else {
        const imgH = state.uploadedImage.height;
        const imgW = state.uploadedImage.width;
        const bounds = [0, ...state.segmentLines, 1];
        const tolerance = Math.max(1, Math.floor((Number(document.getElementById('extractTolerance').value) / 50) * 100)); 

        for (let i = 0; i < bounds.length - 1; i++) {
            const startY = Math.floor(bounds[i] * imgH);
            const endY = Math.floor(bounds[i+1] * imgH);
            const segH = Math.max(1, endY - startY);
            const weight = (bounds[i+1] - bounds[i]).toFixed(3);
            
            const imgData = imgCtx.getImageData(0, startY, imgW, segH);
            const color = getDominantColor(imgData, tolerance);

            extractedSegments.push({ id: Date.now() + i, color: color, weight: Number(weight) });
        }
    }

    const char = state.chars.find(c => c.id === state.targetCharIdForExtraction);
    if (char) char.segments = extractedSegments;

    closeImageModal();
    render();
}

// 主色演算法（把彩度與明度當權重）
function getDominantColor(imgData, tolerance) {
    const buckets = {}; 
    let maxScore = -1; 
    let domRGB = [0, 0, 0];
    
    for (let i = 0; i < imgData.data.length; i += 16) {
        if (imgData.data[i + 3] < 128) continue; // 透明的不算
        
        const r = imgData.data[i];
        const g = imgData.data[i+1];
        const b = imgData.data[i+2];
        
        // 量化（分群）
        const qr = Math.floor(r / tolerance) * tolerance;
        const qg = Math.floor(g / tolerance) * tolerance;
        const qb = Math.floor(b / tolerance) * tolerance;
        const key = `${qr},${qg},${qb}`;
        
        // 估算彩度（chroma）與明度（lightness）
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        const lightness = (max + min) / 2;
        
        // 算權重：越鮮豔的給越高分
        let weight = 1;
        
        if (chroma < 20) {
            weight = 0.1; // 無彩色（黑、白、灰底之類）扣分
        } else {
            weight = 1 + (chroma / 255) * 2; // 彩度越高，權重最多加到三倍
        }
        
        // 太暗（線稿、深陰影）或太亮（高光）的都扣分
        if (lightness < 40 || lightness > 230) {
            weight *= 0.2;
        }
        
        if (!buckets[key]) {
            buckets[key] = { score: 0, maxChroma: -1, bestRGB: [r, g, b] };
        }
        
        buckets[key].score += weight;
        
        // 同一群裡，拿最鮮豔那個像素的原色當代表色
        if (chroma > buckets[key].maxChroma) {
            buckets[key].maxChroma = chroma;
            buckets[key].bestRGB = [r, g, b];
        }
        
        if (buckets[key].score > maxScore) {
            maxScore = buckets[key].score;
            domRGB = buckets[key].bestRGB;
        }
    }
    
    // 所有像素都被排除、算不出分數時回傳預設值
    if (maxScore === -1) return "#000000";
    
    return "#" + (1 << 24 | domRGB[0] << 16 | domRGB[1] << 8 | domRGB[2]).toString(16).slice(1).toUpperCase();
}

// 起動
init();
switchTab('manual'); // 預設停在手動分頁

/* 切語言：左側面板與畫布都由 render() 重畫。取色對話框裡那條狀態文字是程式
 * 寫進去的，對話框關著時也要一起換掉，不然再打開就是上一個語言的字。
 * renderSwatches() 只讀輸入框、只寫 DOM，任何時候呼叫都安全。 */
I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => {
    render();
    renderSwatches();
});
