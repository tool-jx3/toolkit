    const STORAGE_KEY_RATIO = 'ccfolia_cropper_ratio';
    const STORAGE_KEY_PERCENT = 'ccfolia_cropper_percent';
    const STORAGE_KEY_CROP_BASIS = 'ccfolia_cropper_basis';

    // DOM Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const cropRange = document.getElementById('cropRange');
    const rangeVal = document.getElementById('rangeVal');
    const downloadBtn = document.getElementById('downloadBtn');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const centerHBtn = document.getElementById('centerHBtn');
    const ratioBtns = document.querySelectorAll('.btn-radio');
    const previewArea = document.getElementById('previewArea');
    const viewport = document.getElementById('viewport');
    const stage = document.getElementById('stage');
    const sourceCanvas = document.getElementById('sourceCanvas');
    const cropBox = document.getElementById('cropBox');
    const zoomVal = document.getElementById('zoomVal');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });

    // Nav DOM
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const fileIndexInfo = document.getElementById('fileIndexInfo');

    // Shadow DOM
    const shadowEnable = document.getElementById('shadowEnable');
    const shadowColor = document.getElementById('shadowColor');
    const shadowBlur = document.getElementById('shadowBlur');
    const blurVal = document.getElementById('blurVal');
    const cropBasis = document.getElementById('cropBasis');
    const applyBasisAll = document.getElementById('applyBasisAll');
    const outlineMode = document.getElementById('outlineMode');
    const outlineWidth = document.getElementById('outlineWidth');
    const outlineWidthVal = document.getElementById('outlineWidthVal');
    const outlineOpacity = document.getElementById('outlineOpacity');
    const outlineOpacityVal = document.getElementById('outlineOpacityVal');
    const shadowOffset = document.getElementById('shadowOffset');
    const shadowOffsetVal = document.getElementById('shadowOffsetVal');
    const outlineBlurRow = document.getElementById('outlineBlurRow');
    const shadowOffsetRow = document.getElementById('shadowOffsetRow');
    const outlineOpacityRow = document.getElementById('outlineOpacityRow');

    // State Variables
    let imageList = []; // { file, img, fileName, bounds, boxOffsetX, cropBasis }
    let currentIndex = -1;
    let targetRatio = [3, 4];
    let displayScale = 1;

    // Cropping Drag state
    let isBoxDragging = false;
    let boxStartX = 0;

    // Zoom & Pan state
    let zoomLevel = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    function initSettings() {
        const savedRatio = localStorage.getItem(STORAGE_KEY_RATIO) || '3:4';
        const savedPercent = localStorage.getItem(STORAGE_KEY_PERCENT) || '60';
        const savedBasis = localStorage.getItem(STORAGE_KEY_CROP_BASIS) || 'head';

        ratioBtns.forEach(btn => {
            if (btn.dataset.ratio === savedRatio) {
                btn.classList.add('active');
                const [w, h] = savedRatio.split(':').map(Number);
                targetRatio = [w, h];
            } else {
                btn.classList.remove('active');
            }
        });

        cropRange.value = savedPercent;
        rangeVal.textContent = `${savedPercent}%`;
        cropBasis.value = savedBasis;
    }

    initSettings();

    function updateCanvasFilter() {
        if (!shadowEnable.checked) {
            sourceCanvas.style.filter = 'none';
            return;
        }
        const mode = outlineMode.value;
        const color = hexToRgba(shadowColor.value, Number(outlineOpacity.value) / 100);
        const blur = Number(shadowBlur.value);
        const width = Number(outlineWidth.value);
        const offset = Number(shadowOffset.value);
        if (mode === 'shadow') {
            sourceCanvas.style.filter = `drop-shadow(${offset}px ${offset}px ${Math.max(1, blur)}px ${color})`;
        } else if (mode === 'glow') {
            sourceCanvas.style.filter = `drop-shadow(0 0 ${Math.max(1, width)}px ${color}) drop-shadow(0 0 ${Math.max(2, blur)}px ${color})`;
        } else if (mode === 'soft') {
            sourceCanvas.style.filter = `drop-shadow(0 0 ${Math.max(1, width / 2)}px ${color}) drop-shadow(0 0 ${Math.max(1, blur / 2)}px ${color})`;
        } else {
            sourceCanvas.style.filter = `drop-shadow(0 0 ${Math.max(1, width)}px ${color})`;
        }
    }

    function updateOutlineControls() {
        const mode = outlineMode.value;
        shadowOffsetRow.style.display = mode === 'shadow' ? 'flex' : 'none';
        outlineBlurRow.style.display = mode === 'solid' ? 'none' : 'flex';
        outlineOpacityRow.style.display = 'flex';
        updateCanvasFilter();
    }

    shadowEnable.addEventListener('change', updateCanvasFilter);
    shadowColor.addEventListener('input', updateCanvasFilter);
    shadowBlur.addEventListener('input', (e) => {
        blurVal.textContent = `${e.target.value}px`;
        updateCanvasFilter();
    });
    outlineWidth.addEventListener('input', (e) => {
        outlineWidthVal.textContent = `${e.target.value}px`;
        updateCanvasFilter();
    });
    outlineOpacity.addEventListener('input', (e) => {
        outlineOpacityVal.textContent = `${e.target.value}%`;
        updateCanvasFilter();
    });
    shadowOffset.addEventListener('input', (e) => {
        shadowOffsetVal.textContent = `${e.target.value}px`;
        updateCanvasFilter();
    });
    outlineMode.addEventListener('change', updateOutlineControls);
    updateOutlineControls();

    cropBasis.addEventListener('change', () => {
        localStorage.setItem(STORAGE_KEY_CROP_BASIS, cropBasis.value);
        if (currentIndex >= 0 && imageList[currentIndex]) {
            imageList[currentIndex].cropBasis = cropBasis.value;
            if (cropBasis.value !== 'manual') imageList[currentIndex].boxOffsetX = 0;
            updateCropView();
        }
    });

    applyBasisAll.addEventListener('change', () => {
        if (!applyBasisAll.checked) return;
        imageList.forEach(item => {
            item.cropBasis = cropBasis.value;
            if (cropBasis.value !== 'manual') item.boxOffsetX = 0;
        });
        updateCropView();
    });

    ratioBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            ratioBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const ratioStr = e.target.dataset.ratio;
            const [w, h] = ratioStr.split(':').map(Number);
            targetRatio = [w, h];
            
            localStorage.setItem(STORAGE_KEY_RATIO, ratioStr);
            resetBoxPosition();
            updateCropView();
        });
    });

    cropRange.addEventListener('input', (e) => {
        const val = e.target.value;
        rangeVal.textContent = `${val}%`;
        localStorage.setItem(STORAGE_KEY_PERCENT, val);
        updateCropView();
    });

    centerHBtn.addEventListener('click', () => {
        resetBoxPosition();
        updateCropView();
    });

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    downloadBtn.addEventListener('click', downloadCurrentCrop);
    downloadAllBtn.addEventListener('click', processBatchDownload);

    // 上一張／下一張按鈕事件
    prevBtn.addEventListener('click', () => navigateImage(-1));
    nextBtn.addEventListener('click', () => navigateImage(1));

    window.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
                    const pastedFile = new File([file], `clipboard_${timestamp}.png`, { type: 'image/png' });
                    handleFiles([pastedFile]);
                    break;
                }
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (!downloadBtn.disabled) downloadCurrentCrop();
        }

        if (e.key.toLowerCase() === 'c') {
            if (!centerHBtn.disabled) centerHBtn.click();
        }

        if (e.key.toLowerCase() === 'r') {
            resetViewport();
        }

        // A／D：切換上一張／下一張圖片
        if (e.key.toLowerCase() === 'a') {
            if (!prevBtn.disabled) navigateImage(-1);
        }
        if (e.key.toLowerCase() === 'd') {
            if (!nextBtn.disabled) navigateImage(1);
        }

        if (e.key === '[' || e.key === ']') {
            let currentVal = parseInt(cropRange.value);
            currentVal = e.key === '[' ? Math.max(10, currentVal - 5) : Math.min(100, currentVal + 5);
            
            cropRange.value = currentVal;
            rangeVal.textContent = `${currentVal}%`;
            localStorage.setItem(STORAGE_KEY_PERCENT, currentVal);
            updateCropView();
        }
    });

    // Zoom & Pan
    previewArea.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        zoomLevel = Math.max(0.2, Math.min(5.0, zoomLevel * zoomFactor));
        updateViewportTransform();
    }, { passive: false });

    previewArea.addEventListener('mousedown', (e) => {
        if (e.target === cropBox) {
            isBoxDragging = true;
            boxStartX = e.clientX;
            e.stopPropagation();
        } else {
            isPanning = true;
            panStartX = e.clientX - panX;
            panStartY = e.clientY - panY;
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isBoxDragging && currentIndex >= 0) {
            const deltaX = (e.clientX - boxStartX) / (displayScale * zoomLevel);
            boxStartX = e.clientX;
            imageList[currentIndex].boxOffsetX += deltaX;
            clampBoxOffset();
            applyBoxStyles();
        } else if (isPanning) {
            panX = e.clientX - panStartX;
            panY = e.clientY - panStartY;
            updateViewportTransform();
        }
    });

    window.addEventListener('mouseup', () => {
        isBoxDragging = false;
        isPanning = false;
    });

    resetZoomBtn.addEventListener('click', resetViewport);

    function updateViewportTransform() {
        viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        zoomVal.textContent = `${Math.round(zoomLevel * 100)}%`;
    }

    function resetViewport() {
        zoomLevel = 1;
        panX = 0;
        panY = 0;
        updateViewportTransform();
    }

    // 圖片載入與清單管理
    async function handleFiles(files) {
        const pngFiles = Array.from(files).filter(f => f.type === 'image/png');
        if (pngFiles.length === 0) {
            alert(T('msg.pngOnly'));
            return;
        }

        imageList = [];
        for (let i = 0; i < pngFiles.length; i++) {
            const item = await loadImageData(pngFiles[i]);
            imageList.push(item);
        }

        currentIndex = 0;
        displayCurrentImage();
    }

    function loadImageData(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0);

                const bounds = getAlphaBounds(tempCtx, img.width, img.height);
                resolve({
                    file: file,
                    img: img,
                    fileName: file.name,
                    bounds: bounds,
                    boxOffsetX: 0,
                    cropBasis: cropBasis.value
                });
            };
            img.src = URL.createObjectURL(file);
        });
    }

    function displayCurrentImage() {
        if (currentIndex < 0 || currentIndex >= imageList.length) return;

        const item = imageList[currentIndex];
        cropBasis.value = item.cropBasis || cropBasis.value;
        sourceCanvas.width = item.img.width;
        sourceCanvas.height = item.img.height;
        ctx.drawImage(item.img, 0, 0);

        stage.style.display = 'inline-block';
        downloadBtn.disabled = false;
        downloadAllBtn.disabled = imageList.length <= 1;
        centerHBtn.disabled = false;

        updateNavUI();
        resetViewport();
        updateCanvasFilter();

        requestAnimationFrame(() => {
            updateDisplayScale();
            updateCropView();
        });
    }

    function navigateImage(direction) {
        const newIndex = currentIndex + direction;
        if (newIndex >= 0 && newIndex < imageList.length) {
            currentIndex = newIndex;
            displayCurrentImage();
        }
    }

    function updateNavUI() {
        const total = imageList.length;
        fileIndexInfo.textContent = total > 0 ? `${currentIndex + 1} / ${total}` : `0 / 0`;
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= total - 1;
    }

    function getAlphaBounds(context, width, height) {
        const imgData = context.getImageData(0, 0, width, height).data;
        let top = height, bottom = 0, left = width, right = 0;
        let hasAlpha = false;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const alpha = imgData[(y * width + x) * 4 + 3];
                if (alpha > 0) {
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                    if (x < left) left = x;
                    if (x > right) right = x;
                    hasAlpha = true;
                }
            }
        }

        if (!hasAlpha) {
            return { top: 0, bottom: height, left: 0, right: width, headCenterX: width / 2 };
        }

        const charHeight = bottom - top;
        const upperLimitY = top + Math.max(20, Math.round(charHeight * 0.35)); 

        let upperLeft = width, upperRight = 0;
        let upperHasAlpha = false;

        for (let y = top; y <= upperLimitY && y < height; y++) {
            for (let x = 0; x < width; x++) {
                const alpha = imgData[(y * width + x) * 4 + 3];
                if (alpha > 0) {
                    if (x < upperLeft) upperLeft = x;
                    if (x > upperRight) upperRight = x;
                    upperHasAlpha = true;
                }
            }
        }

        const headCenterX = upperHasAlpha ? (upperLeft + upperRight) / 2 : (left + right) / 2;
        return { top, bottom, left, right, headCenterX, upperCenterX: upperHasAlpha ? (upperLeft + upperRight) / 2 : headCenterX };
    }

    function getCropAnchor(item) {
        const b = item.bounds;
        const basis = item.cropBasis || cropBasis.value;
        if (basis === 'image') {
            return { x: item.img.width / 2, y: item.img.height / 2 };
        }
        if (basis === 'character') {
            return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
        }
        if (basis === 'upper') {
            return { x: b.upperCenterX ?? b.headCenterX, y: b.top };
        }
        return { x: b.headCenterX, y: b.top };
    }

    function resetBoxPosition() {
        if (currentIndex >= 0 && imageList[currentIndex]) imageList[currentIndex].boxOffsetX = 0;
    }

    function clampBoxOffset() {
        if (currentIndex < 0) return;
        const item = imageList[currentIndex];
        const percentage = parseInt(cropRange.value) / 100;
        const characterHeight = item.bounds.bottom - item.bounds.top;
        const cropH = characterHeight * percentage;
        const cropW = cropH * (targetRatio[0] / targetRatio[1]);
        const anchor = getCropAnchor(item);
        let defaultLeft = anchor.x - cropW / 2;
        if ((item.cropBasis || cropBasis.value) === 'head' || (item.cropBasis || cropBasis.value) === 'upper') defaultLeft = anchor.x - cropW / 2;
        const minOffsetX = -defaultLeft;
        const maxOffsetX = item.img.width - cropW - defaultLeft;
        item.boxOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, item.boxOffsetX));
    }

    function updateDisplayScale() {
        if (!sourceCanvas.offsetWidth) return;
        displayScale = sourceCanvas.offsetWidth / sourceCanvas.width;
    }

    function updateCropView() {
        if (currentIndex < 0) return;
        updateDisplayScale();
        clampBoxOffset();
        applyBoxStyles();
    }

    function applyBoxStyles() {
        const item = imageList[currentIndex];
        const percentage = parseInt(cropRange.value) / 100;
        const characterHeight = item.bounds.bottom - item.bounds.top;
        const cropH = characterHeight * percentage;
        const cropW = cropH * (targetRatio[0] / targetRatio[1]);
        const anchor = getCropAnchor(item);
        let cropX = anchor.x - cropW / 2 + item.boxOffsetX;
        let cropY = (item.cropBasis === 'image' || item.cropBasis === 'character') ? anchor.y - cropH / 2 : item.bounds.top;
        cropX = Math.max(0, Math.min(item.img.width - cropW, cropX));
        cropY = Math.max(0, Math.min(item.img.height - cropH, cropY));

        cropBox.style.width = `${cropW * displayScale}px`;
        cropBox.style.height = `${cropH * displayScale}px`;
        cropBox.style.left = `${cropX * displayScale}px`;
        cropBox.style.top = `${cropY * displayScale}px`;
        cropBox.dataset.cropX = cropX;
        cropBox.dataset.cropY = cropY;
        cropBox.dataset.cropW = cropW;
        cropBox.dataset.cropH = cropH;
    }

    window.addEventListener('resize', () => {
        if (currentIndex >= 0) updateCropView();
    });

    function downloadCurrentCrop() {
        if (currentIndex < 0) return;
        const item = imageList[currentIndex];
        const x = parseFloat(cropBox.dataset.cropX);
        const y = parseFloat(cropBox.dataset.cropY);
        const w = parseFloat(cropBox.dataset.cropW);
        const h = parseFloat(cropBox.dataset.cropH);

        const croppedCanvas = createCroppedCanvas(item.img, x, y, w, h);
        saveCanvas(croppedCanvas, item.fileName.replace(/\.png$/i, '_crop.png'));
    }

    async function processBatchDownload() {
        if (imageList.length === 0) return;

        downloadAllBtn.disabled = true;
        downloadBtn.disabled = true;
        const originalText = downloadAllBtn.textContent;
        downloadAllBtn.textContent = T('msg.batchWorking');

        for (let i = 0; i < imageList.length; i++) {
            const item = imageList[i];
            if (applyBasisAll.checked) item.cropBasis = cropBasis.value;
            const percentage = parseInt(cropRange.value) / 100;
            const charH = item.bounds.bottom - item.bounds.top;
            const cropH = charH * percentage;
            const cropW = cropH * (targetRatio[0] / targetRatio[1]);
            
            const anchor = getCropAnchor(item);
            let cropX = anchor.x - cropW / 2 + item.boxOffsetX;
            let cropY = (item.cropBasis === 'image' || item.cropBasis === 'character') ? anchor.y - cropH / 2 : item.bounds.top;
            cropX = Math.max(0, Math.min(item.img.width - cropW, cropX));
            cropY = Math.max(0, Math.min(item.img.height - cropH, cropY));

            const resultCanvas = createCroppedCanvas(item.img, cropX, cropY, cropW, cropH);
            saveCanvas(resultCanvas, item.fileName.replace(/\.png$/i, '_crop.png'));
            
            await new Promise(r => setTimeout(r, 200));
        }

        downloadAllBtn.disabled = false;
        downloadBtn.disabled = false;
        downloadAllBtn.textContent = originalText;
        alert(T('msg.batchDone', imageList.length));
    }

    function hexToRgba(hex, alpha) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }

    function createCroppedCanvas(img, x, y, w, h) {
        const roundedW = Math.max(1, Math.round(w));
        const roundedH = Math.max(1, Math.round(h));
        const canvas = document.createElement('canvas');
        canvas.width = roundedW;
        canvas.height = roundedH;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.drawImage(img, Math.round(x), Math.round(y), roundedW, roundedH, 0, 0, roundedW, roundedH);

        if (!shadowEnable.checked) return canvas;

        const mode = outlineMode.value;
        const width = Number(outlineWidth.value);
        const blur = Number(shadowBlur.value);
        const opacity = Number(outlineOpacity.value) / 100;
        const offset = Number(shadowOffset.value);
        const color = shadowColor.value;

        // 以原圖的 alpha 擴張出剪影，再減去原圖，得到真正「環狀」的外框線。
        const mask = document.createElement('canvas');
        mask.width = roundedW; mask.height = roundedH;
        const mctx = mask.getContext('2d');
        mctx.fillStyle = '#fff';
        const steps = Math.max(8, Math.ceil(width * 6));
        for (let i = 0; i < steps; i++) {
            const a = (Math.PI * 2 * i) / steps;
            mctx.drawImage(canvas, Math.cos(a) * width, Math.sin(a) * width);
        }
        mctx.drawImage(canvas, 0, 0);

        // 移除原圖區域 → 只留下外框線
        mctx.globalCompositeOperation = 'destination-out';
        mctx.drawImage(canvas, 0, 0);
        mctx.globalCompositeOperation = 'source-over';

        if (mode === 'shadow') {
            const shadowLayer = document.createElement('canvas');
            shadowLayer.width = roundedW; shadowLayer.height = roundedH;
            const sctx = shadowLayer.getContext('2d');
            sctx.filter = `blur(${Math.max(0, blur)}px)`;
            sctx.drawImage(mask, offset, offset);
            sctx.filter = 'none';
            sctx.globalCompositeOperation = 'source-in';
            sctx.fillStyle = hexToRgba(color, opacity);
            sctx.fillRect(0, 0, roundedW, roundedH);
            context.drawImage(shadowLayer, 0, 0);
            context.drawImage(canvas, 0, 0);
            return canvas;
        }

        if (mode === 'soft' || mode === 'glow') {
            const glow = document.createElement('canvas');
            glow.width = roundedW; glow.height = roundedH;
            const gctx = glow.getContext('2d');
            gctx.filter = `blur(${Math.max(1, blur)}px)`;
            gctx.drawImage(mask, 0, 0);
            gctx.filter = 'none';
            gctx.globalCompositeOperation = 'source-in';
            gctx.fillStyle = hexToRgba(color, opacity);
            gctx.fillRect(0, 0, roundedW, roundedH);
            context.drawImage(glow, 0, 0);
        }

        const outlineLayer = document.createElement('canvas');
        outlineLayer.width = roundedW; outlineLayer.height = roundedH;
        const octx = outlineLayer.getContext('2d');
        octx.drawImage(mask, 0, 0);
        octx.globalCompositeOperation = 'source-in';
        octx.fillStyle = hexToRgba(color, opacity);
        octx.fillRect(0, 0, roundedW, roundedH);
        context.drawImage(outlineLayer, 0, 0);
        context.drawImage(canvas, 0, 0);
        return canvas;
    }

    function saveCanvas(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    /* TRPG Toolkit 合輯：語言切換器。裁切框上的提示由 CSS 的 content: attr(data-hint)
     * 顯示，::after 的內容拿不到 data-i18n 掛勾，因此在這裡跟著語言一起更新。 */
    function applyCropHint() { cropBox.dataset.hint = T('crop.dragHint'); }
    applyCropHint();
    I18N.onChange(applyCropHint);
    I18N.mountSwitcher(document.getElementById('localeSelect'));
