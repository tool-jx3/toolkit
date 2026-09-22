import { parseGIF, decompressFrames } from 'https://esm.sh/gifuct-js@2.1.2';

// --- 全域狀態 ---
let gifItems = [];
let workspaceParams = { width: 800, height: 600 };
let zIndexCounter = 10;
let gifWorkerUrl = '';
let workspaceZoom = 1.0;
const animationStartTime = Date.now();

// 拖曳與吸附用的全域狀態
let activeDragItem = null;
let activeResizeItem = null;
let startX, startY, initialX, initialY, initialW, initialH;

// --- DOM 元素 ---
const workspace = document.getElementById('workspace');
const workspaceSizer = document.getElementById('workspaceSizer');
const workspaceContainer = document.getElementById('workspaceContainer');
const canvasWidthInput = document.getElementById('canvasWidth');
const canvasHeightInput = document.getElementById('canvasHeight');
const gridColsInput = document.getElementById('gridCols');
const gridRowsInput = document.getElementById('gridRows');
const applyGridBtn = document.getElementById('applyGridBtn');
const autoFitBtn = document.getElementById('autoFitBtn');
const tightFitBtn = document.getElementById('tightFitBtn');
const fileList = document.getElementById('fileList');
const fileInput = document.getElementById('fileInput');
const generateBtn = document.getElementById('generateBtn');
const outputDurationInput = document.getElementById('outputDuration');
const outputScaleInput = document.getElementById('outputScale');
const resultContainer = document.getElementById('resultContainer');
const resultImg = document.getElementById('resultImg');
const downloadBtn = document.getElementById('downloadBtn');

// 縮放相關的 DOM
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomFitBtn = document.getElementById('zoomFitBtn');
const zoomLabel = document.getElementById('zoomLabel');

// --- 初始化 ---
async function init() {
    // gif.js 的 worker 在別的網域，直接當 workerScript 會踩到 CORS；
    // 先抓成文字再包成 Blob URL。
    try {
        const res = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
        const text = await res.text();
        const blob = new Blob([text], {type: 'application/javascript'});
        gifWorkerUrl = URL.createObjectURL(blob);
    } catch (error) {
        console.error("worker 載入失敗", error);
    }

    // 綁事件
    canvasWidthInput.addEventListener('change', updateWorkspaceSize);
    canvasHeightInput.addEventListener('change', updateWorkspaceSize);
    applyGridBtn.addEventListener('click', applyGridArrangement);
    autoFitBtn.addEventListener('click', autoFitCanvas);
    tightFitBtn.addEventListener('click', tightFitCanvas);
    fileInput.addEventListener('change', handleFileUpload);
    generateBtn.addEventListener('click', generateGif);

    // 縮放
    zoomOutBtn.addEventListener('click', () => setZoom(workspaceZoom - 0.1));
    zoomInBtn.addEventListener('click', () => setZoom(workspaceZoom + 0.1));
    zoomFitBtn.addEventListener('click', fitZoomToContainer);

    // 全域滑鼠事件（拖曳、調大小、吸附）
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', () => {
        activeDragItem = null;
        activeResizeItem = null;
    });

    updateWorkspaceSize();
    fitZoomToContainer(); // 一開始就縮到整個畫面看得完
    requestAnimationFrame(renderPreviewLoop);
}

// --- 更新工作區 ---
function updateWorkspaceSize() {
    workspaceParams.width = parseInt(canvasWidthInput.value) || 800;
    workspaceParams.height = parseInt(canvasHeightInput.value) || 600;
    workspace.style.width = `${workspaceParams.width}px`;
    workspace.style.height = `${workspaceParams.height}px`;
    updateZoomWrapper();
}

function setZoom(level) {
    workspaceZoom = Math.max(0.1, Math.min(3.0, level));
    zoomLabel.innerText = Math.round(workspaceZoom * 100) + '%';
    workspace.style.transform = `scale(${workspaceZoom})`;
    updateZoomWrapper();
}

function updateZoomWrapper() {
    // 縮放時同步改佔位層的尺寸，捲軸與置中才不會跟著跑掉
    const scaledWidth = workspaceParams.width * workspaceZoom;
    const scaledHeight = workspaceParams.height * workspaceZoom;
    
    if (workspaceSizer) {
        workspaceSizer.style.width = `${scaledWidth}px`;
        workspaceSizer.style.height = `${scaledHeight}px`;
    }
}

function fitZoomToContainer() {
    // 扣掉內距，算出剛好塞得進容器的倍率
    const padding = 32;
    const availableW = workspaceContainer.clientWidth - padding;
    const availableH = workspaceContainer.clientHeight - padding;
    const scaleX = availableW / workspaceParams.width;
    const scaleY = availableH / workspaceParams.height;
    setZoom(Math.min(scaleX, scaleY, 1.0)); // 自動縮放最多到 100%，不會主動放大
}

// --- 自動填建議的播放時間 ---
function updateDurationSuggestion() {
    if (gifItems.length === 0) return;
    const maxDuration = Math.max(...gifItems.map(item => item.totalDuration));
    outputDurationInput.value = maxDuration;
}

// --- 檔案清單的畫面、排序與刪除 ---
function updateFileListUI() {
    fileList.innerHTML = '';
    gifItems.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center text-xs p-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'truncate w-32';
        nameSpan.textContent = item.file.name;
        nameSpan.title = item.file.name;

        const btnGroup = document.createElement('div');
        btnGroup.className = 'flex gap-1 items-center';

        const upBtn = document.createElement('button');
        upBtn.textContent = '▲';
        upBtn.className = 'px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-600 disabled:opacity-30 disabled:hover:bg-gray-200 cursor-pointer';
        upBtn.onclick = () => moveItem(index, -1);
        if (index === 0) upBtn.disabled = true;

        const downBtn = document.createElement('button');
        downBtn.textContent = '▼';
        downBtn.className = 'px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-600 disabled:opacity-30 disabled:hover:bg-gray-200 cursor-pointer';
        downBtn.onclick = () => moveItem(index, 1);
        if (index === gifItems.length - 1) downBtn.disabled = true;

        // 單獨刪除的按鈕
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'ml-1 px-1.5 py-0.5 bg-red-100 hover:bg-red-200 rounded text-red-600 cursor-pointer font-bold';
        delBtn.title = T("file.delete");
        delBtn.onclick = () => {
            gifItems = gifItems.filter(i => i.id !== item.id);
            if (item.uiElement) item.uiElement.remove();
            updateDurationSuggestion();
            updateFileListUI();
        };

        btnGroup.appendChild(upBtn);
        btnGroup.appendChild(downBtn);
        btnGroup.appendChild(delBtn);

        li.appendChild(nameSpan);
        li.appendChild(btnGroup);
        fileList.appendChild(li);
    });
}

function moveItem(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= gifItems.length) return;
    
    // 調整陣列裡的順序
    const temp = gifItems[index];
    gifItems[index] = gifItems[newIndex];
    gifItems[newIndex] = temp;
    
    updateFileListUI();
    
    // 重排 z-index（排在後面的畫在上面）
    gifItems.forEach((item, idx) => {
        item.zIndex = zIndexCounter + idx;
        if (item.uiElement) item.uiElement.style.zIndex = item.zIndex;
    });
    zIndexCounter += gifItems.length;
}

// --- 1:1 比例自動塞入 ---
function autoFitCanvas() {
    const cols = parseInt(gridColsInput.value) || 1;
    const rows = parseInt(gridRowsInput.value) || 1;
    const baseSize = 250; // 基準格子大小（px）
    
    canvasWidthInput.value = cols * baseSize;
    canvasHeightInput.value = rows * baseSize;
    
    updateWorkspaceSize();
    fitZoomToContainer();
    applyGridArrangement();
}

// --- 不留邊填滿（Tight Fit）---
function tightFitCanvas() {
    if (gifItems.length === 0) return;
    const cols = parseInt(gridColsInput.value) || 1;
    const rows = parseInt(gridRowsInput.value) || 1;

    // 以第一張上傳的圖的原始尺寸當基準
    const baseW = gifItems[0].originalWidth;
    const baseH = gifItems[0].originalHeight;

    canvasWidthInput.value = cols * baseW;
    canvasHeightInput.value = rows * baseH;
    
    updateWorkspaceSize();
    fitZoomToContainer();

    gifItems.forEach((item, index) => {
        const colIndex = index % cols;
        const rowIndex = Math.floor(index / cols);

        // 強制對齊基準尺寸，把留白擠掉
        item.width = baseW;
        item.height = baseH;
        item.x = colIndex * baseW;
        item.y = rowIndex * baseH;

        if (item.uiElement) {
            item.uiElement.style.left = `${item.x}px`;
            item.uiElement.style.top = `${item.y}px`;
            item.uiElement.style.width = `${item.width}px`;
            item.uiElement.style.height = `${item.height}px`;
        }
    });
}

// --- 格線自動排列 ---
function applyGridArrangement() {
    if (gifItems.length === 0) return;

    const cols = parseInt(gridColsInput.value) || 1;
    const rows = parseInt(gridRowsInput.value) || 1;
    
    const cellWidth = workspaceParams.width / cols;
    const cellHeight = workspaceParams.height / rows;

    gifItems.forEach((item, index) => {
        const colIndex = index % cols;
        const rowIndex = Math.floor(index / cols);

        // 不破壞原比例（contain），置中放進格子
        const scaleX = cellWidth / item.originalWidth;
        const scaleY = cellHeight / item.originalHeight;
        const scale = Math.min(scaleX, scaleY);

        item.width = Math.round(item.originalWidth * scale);
        item.height = Math.round(item.originalHeight * scale);

        // 在格子裡置中
        item.x = Math.round((colIndex * cellWidth) + (cellWidth - item.width) / 2);
        item.y = Math.round((rowIndex * cellHeight) + (cellHeight - item.height) / 2);

        if (item.uiElement) {
            item.uiElement.style.left = `${item.x}px`;
            item.uiElement.style.top = `${item.y}px`;
            item.uiElement.style.width = `${item.width}px`;
            item.uiElement.style.height = `${item.height}px`;
        }
    });
}

// --- 處理檔案上傳 ---
async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length) return;

    for (let file of files) {
        try {
            await processGifFile(file);
        } catch (err) {
            console.error("GIF 處理失敗:", err);
            alert(T("file.error", file.name));
        }
    }
    fileInput.value = ''; // 清掉，同一個檔案才選得第二次
}

// --- 解析 GIF 並算繪每一格 ---
async function processGifFile(file) {
    const buffer = await file.arrayBuffer();
    const gif = parseGIF(buffer);
    const frames = decompressFrames(gif, true);

    const width = gif.lsd.width;
    const height = gif.lsd.height;

    // 每一格都合成成獨立的 canvas 圖（處理 GIF 的 disposal method）
    const renderedFrames = renderGifFrames(frames, width, height);
    const totalDuration = renderedFrames.reduce((acc, f) => acc + f.delay, 0);

    const item = {
        id: 'gif_' + Date.now() + Math.floor(Math.random() * 1000),
        file: file,
        originalWidth: width,
        originalHeight: height,
        width: width,
        height: height,
        x: (workspaceParams.width - width) / 2, // 置中放
        y: (workspaceParams.height - height) / 2,
        zIndex: zIndexCounter++,
        frames: renderedFrames,
        totalDuration: totalDuration,
        previewCanvas: null,
        uiElement: null
    };

    gifItems.push(item);
    createItemUi(item);
    updateDurationSuggestion();
    updateFileListUI();
}

function renderGifFrames(frames, width, height) {
    const renderedFrames = [];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const backupCanvas = document.createElement('canvas');
    backupCanvas.width = width;
    backupCanvas.height = height;
    const backupCtx = backupCanvas.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const dims = frame.dims;

        if (i > 0) {
            const prevFrame = frames[i-1];
            const disposal = prevFrame.disposalType;
            if (disposal === 2) {
                ctx.clearRect(prevFrame.dims.left, prevFrame.dims.top, prevFrame.dims.width, prevFrame.dims.height);
            } else if (disposal === 3) {
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(backupCanvas, 0, 0);
            }
        }

        if (frame.disposalType === 3) {
            backupCtx.clearRect(0, 0, width, height);
            backupCtx.drawImage(canvas, 0, 0);
        }

        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = dims.width;
        patchCanvas.height = dims.height;
        const patchCtx = patchCanvas.getContext('2d');
        
        const imageData = new ImageData(
            new Uint8ClampedArray(frame.patch),
            dims.width,
            dims.height
        );
        patchCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(patchCanvas, dims.left, dims.top);

        const savedCanvas = document.createElement('canvas');
        savedCanvas.width = width;
        savedCanvas.height = height;
        savedCanvas.getContext('2d').drawImage(canvas, 0, 0);

        renderedFrames.push({
            canvas: savedCanvas,
            delay: Math.max(20, frame.delay || 100) 
        });
    }
    return renderedFrames;
}

// --- 建立畫面元素與滑鼠事件 ---
function createItemUi(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'gif-item absolute border-2 border-transparent hover:border-blue-400 group cursor-move';
    wrapper.style.left = `${item.x}px`;
    wrapper.style.top = `${item.y}px`;
    wrapper.style.width = `${item.width}px`;
    wrapper.style.height = `${item.height}px`;
    wrapper.style.zIndex = item.zIndex;

    // 畫布上的刪除按鈕
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '×';
    deleteBtn.className = 'absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm transform translate-x-1/2 -translate-y-1/2 hidden group-hover:flex z-20 shadow-sm cursor-pointer';
    deleteBtn.onmousedown = (e) => e.stopPropagation(); // 別讓按刪除變成拖曳
    deleteBtn.onclick = () => {
        gifItems = gifItems.filter(i => i.id !== item.id);
        wrapper.remove();
        updateDurationSuggestion();
        updateFileListUI();
    };

    // 調整大小的把手
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle hidden group-hover:block';

    // 預覽用的 canvas
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = item.originalWidth;
    previewCanvas.height = item.originalHeight;
    previewCanvas.style.width = '100%';
    previewCanvas.style.height = '100%';
    previewCanvas.style.pointerEvents = 'none'; // 事件交給外層 wrapper 收

    wrapper.appendChild(previewCanvas);
    wrapper.appendChild(deleteBtn);
    wrapper.appendChild(resizeHandle);
    workspace.appendChild(wrapper);

    item.previewCanvas = previewCanvas;
    item.uiElement = wrapper;

    // 準備拖曳
    wrapper.addEventListener('mousedown', (e) => {
        if (e.target === resizeHandle || e.target === deleteBtn) return;
        activeDragItem = item;
        startX = e.clientX;
        startY = e.clientY;
        initialX = item.x;
        initialY = item.y;
        
        // 點到就移到最上層
        item.zIndex = ++zIndexCounter;
        wrapper.style.zIndex = item.zIndex;
    });

    // 準備調大小
    resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        activeResizeItem = item;
        startX = e.clientX;
        startY = e.clientY;
        initialW = item.width;
        initialH = item.height;
    });
}

// --- 全域的拖曳與吸附處理 ---
function handleGlobalMouseMove(e) {
    const SNAP_DIST = 15; // 吸附（磁性）生效的距離（px）

    // 滑鼠移動距離要除以 workspaceZoom，縮放之後才不會位移得比手快或比手慢
    if (activeDragItem) {
        const item = activeDragItem;
        const dx = (e.clientX - startX) / workspaceZoom;
        const dy = (e.clientY - startY) / workspaceZoom;
        let newX = initialX + dx;
        let newY = initialY + dy;
        
        let snappedX = false;
        let snappedY = false;

        // 1. 吸附畫布邊緣
        if (Math.abs(newX) < SNAP_DIST) { newX = 0; snappedX = true; }
        else if (Math.abs(newX + item.width - workspaceParams.width) < SNAP_DIST) { newX = workspaceParams.width - item.width; snappedX = true; }

        if (Math.abs(newY) < SNAP_DIST) { newY = 0; snappedY = true; }
        else if (Math.abs(newY + item.height - workspaceParams.height) < SNAP_DIST) { newY = workspaceParams.height - item.height; snappedY = true; }

        // 2. 吸附其他項目
        gifItems.forEach(other => {
            if (other.id === item.id) return;
            
            const targetsX = [other.x, other.x + other.width];
            const myEdgesX = [newX, newX + item.width];
            if (!snappedX) {
                for (let mx of myEdgesX) {
                    for (let tx of targetsX) {
                        if (Math.abs(mx - tx) < SNAP_DIST) {
                            newX += (tx - mx);
                            snappedX = true; break;
                        }
                    }
                    if (snappedX) break;
                }
            }

            const targetsY = [other.y, other.y + other.height];
            const myEdgesY = [newY, newY + item.height];
            if (!snappedY) {
                for (let my of myEdgesY) {
                    for (let ty of targetsY) {
                        if (Math.abs(my - ty) < SNAP_DIST) {
                            newY += (ty - my);
                            snappedY = true; break;
                        }
                    }
                    if (snappedY) break;
                }
            }
        });

        item.x = newX;
        item.y = newY;
        item.uiElement.style.left = `${item.x}px`;
        item.uiElement.style.top = `${item.y}px`;
    }

    if (activeResizeItem) {
        const item = activeResizeItem;
        const dx = (e.clientX - startX) / workspaceZoom;
        const dy = (e.clientY - startY) / workspaceZoom;
        let newW = initialW + dx;
        let newH = initialH + dy;
        
        let snappedW = false;
        let snappedH = false;

        // 1. 吸附畫布邊緣（調大小時）
        if (Math.abs(item.x + newW - workspaceParams.width) < SNAP_DIST) {
            newW = workspaceParams.width - item.x; snappedW = true;
        }
        if (Math.abs(item.y + newH - workspaceParams.height) < SNAP_DIST) {
            newH = workspaceParams.height - item.y; snappedH = true;
        }

        // 2. 吸附其他項目（調大小時）
        gifItems.forEach(other => {
            if (other.id === item.id) return;
            
            const targetsX = [other.x, other.x + other.width];
            if (!snappedW) {
                for (let tx of targetsX) {
                    if (Math.abs(item.x + newW - tx) < SNAP_DIST) {
                        newW = tx - item.x; snappedW = true; break;
                    }
                }
            }

            const targetsY = [other.y, other.y + other.height];
            if (!snappedH) {
                for (let ty of targetsY) {
                    if (Math.abs(item.y + newH - ty) < SNAP_DIST) {
                        newH = ty - item.y; snappedH = true; break;
                    }
                }
            }
        });

        item.width = Math.max(20, newW);
        item.height = Math.max(20, newH);
        item.uiElement.style.width = `${item.width}px`;
        item.uiElement.style.height = `${item.height}px`;
    }
}

// --- 預覽的動畫迴圈 ---
function renderPreviewLoop() {
    const now = Date.now();
    const elapsed = now - animationStartTime;

    gifItems.forEach(item => {
        if (!item.previewCanvas) return;
        const ctx = item.previewCanvas.getContext('2d');
        
        const tLocal = elapsed % item.totalDuration;
        let currentT = 0;
        let currentFrame = item.frames[0];

        for (let i = 0; i < item.frames.length; i++) {
            currentT += item.frames[i].delay;
            if (tLocal < currentT) {
                currentFrame = item.frames[i];
                break;
            }
        }

        ctx.clearRect(0, 0, item.originalWidth, item.originalHeight);
        ctx.drawImage(currentFrame.canvas, 0, 0);
    });

    requestAnimationFrame(renderPreviewLoop);
}

// --- 合成最後的 GIF ---
async function generateGif() {
    if (gifItems.length === 0) {
        alert(T("gen.empty"));
        return;
    }

    generateBtn.disabled = true;
    generateBtn.innerText = T("gen.preparing");
    resultContainer.classList.add('hidden');

    const fps = parseInt(document.getElementById('outputFps').value) || 20;
    const delayMs = Math.floor(1000 / fps);
    const totalDuration = parseInt(outputDurationInput.value) || 3000;
    
    const bgColor = document.getElementById('bgColor').value;
    // const isTransparent = document.getElementById('isTransparent').checked;

    // 套用輸出倍率
    const outputScale = (parseInt(outputScaleInput.value) || 100) / 100;
    const finalWidth = Math.round(workspaceParams.width * outputScale);
    const finalHeight = Math.round(workspaceParams.height * outputScale);

    const gifOptions = {
        workers: 2,
        quality: 10,
        width: finalWidth,
        height: finalHeight,
        workerScript: gifWorkerUrl || undefined
    };

    // if (isTransparent) {
    //     gifOptions.transparent = bgColor; 
    // }

    const gif = new GIF(gifOptions);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = finalWidth;
    tempCanvas.height = finalHeight;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

    // 以共用的時間軸 t 一格一格往前推
    for (let t = 0; t < totalDuration; t += delayMs) {
        // 填背景
        tempCtx.fillStyle = bgColor;
        tempCtx.fillRect(0, 0, finalWidth, finalHeight);

        // 照 z-index 排序後才畫
        const sortedItems = [...gifItems].sort((a, b) => a.zIndex - b.zIndex);

        sortedItems.forEach(item => {
            const tLocal = t % item.totalDuration;
            let currentT = 0;
            let currentFrame = item.frames[0];

            for (let i = 0; i < item.frames.length; i++) {
                currentT += item.frames[i].delay;
                if (tLocal < currentT) {
                    currentFrame = item.frames[i];
                    break;
                }
            }

            // 用套過輸出倍率的尺寸與座標畫上畫布
            tempCtx.drawImage(
                currentFrame.canvas,
                0, 0, item.originalWidth, item.originalHeight,
                item.x * outputScale, item.y * outputScale, item.width * outputScale, item.height * outputScale
            );
        });

        gif.addFrame(tempCtx, { copy: true, delay: delayMs });
    }

    // 事件
    gif.on('progress', function(p) {
        generateBtn.innerText = T("gen.progress", Math.round(p * 100));
    });

    gif.on('finished', function(blob) {
        const url = URL.createObjectURL(blob);
        resultImg.src = url;
        downloadBtn.href = url;
        downloadBtn.download = 'combined.gif';
        
        resultContainer.classList.remove('hidden');
        generateBtn.disabled = false;
        generateBtn.innerText = T("gen.run");

        // 捲到結果區
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    });

    // 開始算繪
    setTimeout(() => {
        gif.render();
    }, 50);
}

// 起動
document.addEventListener('DOMContentLoaded', init);

/* 切語言：畫面上的固定文字由引擎處理，這兩處是程式自己寫進去的——
 * 產生鈕的字在合成途中會被進度覆寫，所以只在閒置時才重寫；檔案清單整份重建。 */
I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => {
    if (!generateBtn.disabled) generateBtn.innerText = T('gen.run');
    updateFileListUI();
});
