// Global Application State
const state = {
    videoFile: null,
    videoUrl: null,
    videoDuration: 0,
    originalWidth: 0,
    originalHeight: 0,
    startTime: 0,
    endTime: 0,
    selectedFormat: 'apng', // apng, webp, gif
    isLossless: true,
    quality: 95,
    fps: 30,
    scale: 1.0,
    speed: 1.0,
    gifColors: 256,
    gifDither: 'floyd',
    crop: { enabled: false, x: 0, y: 0, w: 1, h: 1 }, // Normalized 0..1
    isConverting: false,
    shouldCancel: false,
    extractedFrames: [],
    convertedBlob: null,
    convertedUrl: null
};

// DOM Element Cache
const DOM = {
    dropZone: document.getElementById('dropZone'),
    videoFileInput: document.getElementById('videoFileInput'),
    studioWorkspace: document.getElementById('studioWorkspace'),
    mainVideo: document.getElementById('mainVideo'),
    cropCanvas: document.getElementById('cropOverlayCanvas'),
    btnToggleCrop: document.getElementById('btnToggleCrop'),
    cropStatusText: document.getElementById('cropStatusText'),
    videoScrubber: document.getElementById('videoScrubber'),
    trimTrackHighlight: document.getElementById('trimTrackHighlight'),
    lblStartTime: document.getElementById('lblStartTime'),
    lblCurrentTime: document.getElementById('lblCurrentTime'),
    lblEndTime: document.getElementById('lblEndTime'),
    lblDuration: document.getElementById('lblDuration'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    iconPlay: document.getElementById('iconPlay'),
    btnSetStart: document.getElementById('btnSetStart'),
    btnSetEnd: document.getElementById('btnSetEnd'),
    btnResetTrim: document.getElementById('btnResetTrim'),
    btnSampleVideo: document.getElementById('btnSampleVideo'),
    videoInfoBadge: document.getElementById('videoInfoBadge'),
    chkLossless: document.getElementById('chkLossless'),
    qualitySliderBox: document.getElementById('qualitySliderBox'),
    inputQuality: document.getElementById('inputQuality'),
    lblQualityVal: document.getElementById('lblQualityVal'),
    losslessDesc: document.getElementById('losslessDesc'),
    selectFps: document.getElementById('selectFps'),
    selectScale: document.getElementById('selectScale'),
    gifOptionsBox: document.getElementById('gifOptionsBox'),
    selectGifColors: document.getElementById('selectGifColors'),
    selectDither: document.getElementById('selectDither'),
    btnStartConvert: document.getElementById('btnStartConvert'),
    btnToggleInspector: document.getElementById('btnToggleInspector'),
    inspectorContent: document.getElementById('inspectorContent'),
    iconInspectChevron: document.getElementById('iconInspectChevron'),
    lblFrameCountBadge: document.getElementById('lblFrameCountBadge'),
    btnExtractFrames: document.getElementById('btnExtractFrames'),
    frameGallery: document.getElementById('frameGallery'),
    resultCard: document.getElementById('resultCard'),
    resultImagePreview: document.getElementById('resultImagePreview'),
    lblResFormat: document.getElementById('lblResFormat'),
    lblResFileSize: document.getElementById('lblResFileSize'),
    lblResDimFrames: document.getElementById('lblResDimFrames'),
    lblResEncodeTime: document.getElementById('lblResEncodeTime'),
    btnDownload: document.getElementById('btnDownload'),
    btnOpenNewTab: document.getElementById('btnOpenNewTab'),
    btnCopyDataUrl: document.getElementById('btnCopyDataUrl'),
    progressModal: document.getElementById('progressModal'),
    lblProgressStatus: document.getElementById('lblProgressStatus'),
    lblProgressPercent: document.getElementById('lblProgressPercent'),
    progressBarFill: document.getElementById('progressBarFill'),
    encodingLiveCanvas: document.getElementById('encodingLiveCanvas'),
    btnCancelConvert: document.getElementById('btnCancelConvert')
};

// Toast Notification System
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    const colors = {
        info: 'bg-slate-800 text-indigo-300 border-indigo-500/40',
        success: 'bg-slate-800 text-emerald-300 border-emerald-500/40',
        error: 'bg-slate-800 text-rose-300 border-rose-500/40'
    };
    toast.className = `px-4 py-2.5 rounded-xl border ${colors[type] || colors.info} text-xs shadow-xl backdrop-blur-md pointer-events-auto flex items-center gap-2 animate-bounce`;
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Initialize Drag & Drop and File Selection
DOM.dropZone.addEventListener('click', () => DOM.videoFileInput.click());
DOM.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.dropZone.classList.add('border-indigo-500', 'bg-indigo-500/10');
});
DOM.dropZone.addEventListener('dragleave', () => {
    DOM.dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
});
DOM.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadVideoFile(e.dataTransfer.files[0]);
    }
});
DOM.videoFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        loadVideoFile(e.target.files[0]);
    }
});

// Load Video File into Player
function loadVideoFile(file) {
    if (!file.type.startsWith('video/')) {
        showToast(T("toast.badFile"), 'error');
        return;
    }
    state.videoFile = file;
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(file);
    
    DOM.mainVideo.src = state.videoUrl;
    DOM.mainVideo.onloadedmetadata = () => {
        state.videoDuration = DOM.mainVideo.duration;
        state.originalWidth = DOM.mainVideo.videoWidth;
        state.originalHeight = DOM.mainVideo.videoHeight;
        state.startTime = 0;
        state.endTime = state.videoDuration;
        
        DOM.videoInfoBadge.innerText = T("video.info", state.originalWidth, state.originalHeight, state.videoDuration.toFixed(1));
        DOM.studioWorkspace.classList.remove('hidden');
        DOM.resultCard.classList.add('hidden');
        
        updateTrimUI();
        showToast(T("toast.loaded"), 'success');
    };
}

// Playback & Trim Timeline Updates
function updateTrimUI() {
    DOM.lblStartTime.innerText = `${state.startTime.toFixed(2)}s`;
    DOM.lblEndTime.innerText = `${state.endTime.toFixed(2)}s`;
    const duration = Math.max(0, state.endTime - state.startTime);
    DOM.lblDuration.innerText = `${duration.toFixed(2)}s`;

    // Update Track Highlight
    if (state.videoDuration > 0) {
        const leftPercent = (state.startTime / state.videoDuration) * 100;
        const rightPercent = 100 - ((state.endTime / state.videoDuration) * 100);
        DOM.trimTrackHighlight.style.left = `${leftPercent}%`;
        DOM.trimTrackHighlight.style.right = `${rightPercent}%`;
    }
}

DOM.mainVideo.addEventListener('timeupdate', () => {
    DOM.lblCurrentTime.innerText = `${DOM.mainVideo.currentTime.toFixed(2)}s`;
    if (state.videoDuration > 0) {
        DOM.videoScrubber.value = (DOM.mainVideo.currentTime / state.videoDuration) * 100;
    }
    // Loop in trim range
    if (DOM.mainVideo.currentTime >= state.endTime) {
        DOM.mainVideo.currentTime = state.startTime;
    }
});

DOM.videoScrubber.addEventListener('input', (e) => {
    const time = (parseFloat(e.target.value) / 100) * state.videoDuration;
    DOM.mainVideo.currentTime = time;
});

DOM.btnPlayPause.addEventListener('click', () => {
    if (DOM.mainVideo.paused) {
        DOM.mainVideo.play();
        DOM.iconPlay.className = 'fa-solid fa-pause';
    } else {
        DOM.mainVideo.pause();
        DOM.iconPlay.className = 'fa-solid fa-play';
    }
});

DOM.btnSetStart.addEventListener('click', () => {
    state.startTime = Math.min(DOM.mainVideo.currentTime, state.endTime - 0.2);
    updateTrimUI();
    showToast(T("toast.startSet", state.startTime.toFixed(2)));
});

DOM.btnSetEnd.addEventListener('click', () => {
    state.endTime = Math.max(DOM.mainVideo.currentTime, state.startTime + 0.2);
    updateTrimUI();
    showToast(T("toast.endSet", state.endTime.toFixed(2)));
});

DOM.btnResetTrim.addEventListener('click', () => {
    state.startTime = 0;
    state.endTime = state.videoDuration;
    updateTrimUI();
});

// Interactive Canvas Crop Selector
DOM.btnToggleCrop.addEventListener('click', () => {
    state.crop.enabled = !state.crop.enabled;
    if (state.crop.enabled) {
        DOM.cropCanvas.classList.remove('hidden');
        DOM.cropStatusText.innerText = T("crop.on");
        DOM.btnToggleCrop.classList.add('bg-indigo-600', 'text-white');
        initCropCanvas();
    } else {
        DOM.cropCanvas.classList.add('hidden');
        DOM.cropStatusText.innerText = T("crop.off");
        DOM.btnToggleCrop.classList.remove('bg-indigo-600', 'text-white');
    }
});

function initCropCanvas() {
    const canvas = DOM.cropCanvas;
    const video = DOM.mainVideo;
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    const ctx = canvas.getContext('2d');

    // Default normalized crop box (center 80%)
    state.crop.x = 0.1; state.crop.y = 0.1;
    state.crop.w = 0.8; state.crop.h = 0.8;

    let isDragging = false;
    let startX, startY;

    function drawCropBox() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Dim outer area
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const bx = state.crop.x * canvas.width;
        const by = state.crop.y * canvas.height;
        const bw = state.crop.w * canvas.width;
        const bh = state.crop.h * canvas.height;

        // Clear selection area
        ctx.clearRect(bx, by, bw, bh);

        // Draw bounding border
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(bx, by, bw, bh);

        // Corner Handles
        ctx.fillStyle = '#ffffff';
        ctx.setLineDash([]);
        const size = 8;
        ctx.fillRect(bx - size/2, by - size/2, size, size);
        ctx.fillRect(bx + bw - size/2, by - size/2, size, size);
        ctx.fillRect(bx - size/2, by + bh - size/2, size, size);
        ctx.fillRect(bx + bw - size/2, by + bh - size/2, size, size);
    }

    canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        isDragging = true;
    };

    canvas.onmousemove = (e) => {
        if (!isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;

        const left = Math.min(startX, curX) / canvas.width;
        const top = Math.min(startY, curY) / canvas.height;
        const width = Math.abs(curX - startX) / canvas.width;
        const height = Math.abs(curY - startY) / canvas.height;

        if (width > 0.05 && height > 0.05) {
            state.crop.x = left;
            state.crop.y = top;
            state.crop.w = width;
            state.crop.h = height;
            drawCropBox();
        }
    };

    canvas.onmouseup = () => { isDragging = false; };
    drawCropBox();
}

// Format Tab Selectors
document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.format-btn').forEach(b => {
            b.classList.remove('active', 'border-indigo-500', 'bg-indigo-600/10', 'text-white');
            b.classList.add('border-slate-700', 'bg-slate-800/50', 'text-slate-400');
        });
        btn.classList.add('active', 'border-indigo-500', 'bg-indigo-600/10', 'text-white');
        btn.classList.remove('border-slate-700', 'bg-slate-800/50', 'text-slate-400');

        state.selectedFormat = btn.dataset.format;
        if (state.selectedFormat === 'gif') {
            DOM.gifOptionsBox.classList.remove('hidden');
        } else {
            DOM.gifOptionsBox.classList.add('hidden');
        }
    });
});

// Lossless Toggle Event
DOM.chkLossless.addEventListener('change', (e) => {
    state.isLossless = e.target.checked;
    if (state.isLossless) {
        DOM.qualitySliderBox.classList.add('opacity-50', 'pointer-events-none');
        DOM.losslessDesc.innerText = T("opt.lossless.on");
    } else {
        DOM.qualitySliderBox.classList.remove('opacity-50', 'pointer-events-none');
        DOM.losslessDesc.innerText = T("opt.lossless.off");
    }
});

DOM.inputQuality.addEventListener('input', (e) => {
    state.quality = parseInt(e.target.value);
    DOM.lblQualityVal.innerText = `${state.quality}%`;
});

// Speed Multipliers
document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => {
            b.classList.remove('active', 'bg-indigo-600/20', 'border-indigo-500', 'text-white', 'font-bold');
            b.classList.add('bg-slate-800', 'border-slate-700', 'text-slate-300');
        });
        btn.classList.add('active', 'bg-indigo-600/20', 'border-indigo-500', 'text-white', 'font-bold');
        state.speed = parseFloat(btn.dataset.speed);
        DOM.mainVideo.playbackRate = state.speed;
    });
});

// Sample Video Generator (Procedural Animated Canvas stream)
DOM.btnSampleVideo.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    
    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const sampleFile = new File([blob], "sample_motion.webm", { type: 'video/webm' });
        loadVideoFile(sampleFile);
    };

    mediaRecorder.start();

    let frame = 0;
    const maxFrames = 90; // 3 seconds at 30fps
    
    function renderSampleFrame() {
        // Background Gradient
        const grad = ctx.createLinearGradient(0, 0, 640, 360);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#312e81');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 360);

        // Animated Bouncing Spheres
        const time = frame * 0.1;
        const x1 = 320 + Math.cos(time) * 180;
        const y1 = 180 + Math.sin(time * 1.5) * 80;
        
        ctx.beginPath();
        ctx.arc(x1, y1, 40, 0, Math.PI * 2);
        ctx.fillStyle = '#6366f1';
        ctx.fill();
        ctx.shadowColor = '#6366f1';
        ctx.shadowBlur = 20;

        const x2 = 320 + Math.sin(time * 0.8) * 150;
        const y2 = 180 + Math.cos(time) * 70;
        ctx.beginPath();
        ctx.arc(x2, y2, 30, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();

        // Text Overlay
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Sample', 320, 180);
        ctx.font = '14px Pretendard, sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`Frame: ${frame + 1} / ${maxFrames}`, 320, 210);

        frame++;
        if (frame < maxFrames) {
            requestAnimationFrame(renderSampleFrame);
        } else {
            mediaRecorder.stop();
        }
    }

    renderSampleFrame();
    showToast(T("toast.sampleMaking"), 'info');
});

// APNG Lossless Encoder (powered by UPNG.js)
async function encodeAPNG(frames, width, height, delays) {
    // frames: Array of Canvas ImageData or ArrayBuffers
    const rgbaBuffers = frames.map(f => f.data.buffer);
    // cnum: 0 guarantees 100% Lossless truecolor APNG
    const cnum = 0; 
    const apngBuffer = UPNG.encode(rgbaBuffers, width, height, cnum, delays);
    return new Blob([apngBuffer], { type: 'image/png' });
}

// Native Pure JS Animated WebP RIFF Assembler
async function encodeAnimatedWebP(frames, width, height, quality) {
    // Convert each frame ImageData to single WebP Blob chunk
    const webpChunks = [];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < frames.length; i++) {
        ctx.putImageData(frames[i].imageData, 0, 0);
        const q = state.isLossless ? 1.0 : (quality / 100);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', q));
        const buffer = new Uint8Array(await blob.arrayBuffer());
        webpChunks.push({ data: buffer, duration: frames[i].delay });
    }

    return assembleAnimatedWebPRIFF(webpChunks, width, height);
}

// RIFF Container Packer for Animated WebP
function assembleAnimatedWebPRIFF(frames, width, height) {
    let animPayloads = [];
    let hasAlpha = false;

    for (let f of frames) {
        let frameBuffer = f.data;
        let view = new DataView(frameBuffer.buffer, frameBuffer.byteOffset, frameBuffer.byteLength);
        let pos = 12; // Skip RIFF, size, WEBP
        let framePayload = [];

        while (pos < frameBuffer.length) {
            let chunk4 = String.fromCharCode(frameBuffer[pos], frameBuffer[pos+1], frameBuffer[pos+2], frameBuffer[pos+3]);
            let chunkSize = view.getUint32(pos + 4, true);
            let chunkDataStart = pos + 8;
            let paddedSize = chunkSize + (chunkSize % 2);

            if (chunk4 === 'VP8X') {
                let flags = frameBuffer[chunkDataStart];
                if (flags & 0x10) hasAlpha = true;
            } else if (chunk4 === 'VP8 ' || chunk4 === 'VP8L' || chunk4 === 'ALPH') {
                if (chunk4 === 'ALPH') hasAlpha = true;
                let chunkSlice = frameBuffer.subarray(pos, chunkDataStart + paddedSize);
                framePayload.push(chunkSlice);
            }
            pos += 8 + paddedSize;
        }

        let totalPayloadLen = framePayload.reduce((acc, slice) => acc + slice.length, 0);
        let mergedPayload = new Uint8Array(totalPayloadLen);
        let offset = 0;
        for (let slice of framePayload) {
            mergedPayload.set(slice, offset);
            offset += slice.length;
        }

        // Construct ANMF Chunk
        let anmfChunkLen = 16 + totalPayloadLen;
        let anmfPaddedLen = anmfChunkLen + (anmfChunkLen % 2);
        let anmf = new Uint8Array(8 + anmfPaddedLen);
        let anmfView = new DataView(anmf.buffer);

        // 'ANMF'
        anmf[0] = 0x41; anmf[1] = 0x4E; anmf[2] = 0x4D; anmf[3] = 0x46;
        anmfView.setUint32(4, anmfChunkLen, true);

        // Offset X=0, Y=0 (3 bytes each)
        anmf[8] = 0; anmf[9] = 0; anmf[10] = 0;
        anmf[11] = 0; anmf[12] = 0; anmf[13] = 0;

        // Width - 1 & Height - 1
        let w1 = width - 1;
        anmf[14] = w1 & 0xFF; anmf[15] = (w1 >> 8) & 0xFF; anmf[16] = (w1 >> 16) & 0xFF;
        let h1 = height - 1;
        anmf[17] = h1 & 0xFF; anmf[18] = (h1 >> 8) & 0xFF; anmf[19] = (h1 >> 16) & 0xFF;

        // Duration in ms
        let dur = Math.round(f.duration);
        anmf[20] = dur & 0xFF; anmf[21] = (dur >> 8) & 0xFF; anmf[22] = (dur >> 16) & 0xFF;

        // Disposal = 1, Blend = 0
        anmf[23] = 0x02;

        anmf.set(mergedPayload, 24);
        animPayloads.push(anmf);
    }

    // Construct Header Chunks
    let vp8x = new Uint8Array(18);
    let vp8xView = new DataView(vp8x.buffer);
    vp8x[0] = 0x56; vp8x[1] = 0x50; vp8x[2] = 0x38; vp8x[3] = 0x58; // VP8X
    vp8xView.setUint32(4, 10, true);
    vp8x[8] = 0x02 | (hasAlpha ? 0x10 : 0x00);
    let w1 = width - 1;
    vp8x[12] = w1 & 0xFF; vp8x[13] = (w1 >> 8) & 0xFF; vp8x[14] = (w1 >> 16) & 0xFF;
    let h1 = height - 1;
    vp8x[15] = h1 & 0xFF; vp8x[16] = (h1 >> 8) & 0xFF; vp8x[17] = (h1 >> 16) & 0xFF;

    let anim = new Uint8Array(14);
    let animView = new DataView(anim.buffer);
    anim[0] = 0x41; anim[1] = 0x4E; anim[2] = 0x49; anim[3] = 0x4D; // ANIM
    animView.setUint32(4, 6, true);
    animView.setUint16(12, 0, true); // Loop = 0 (infinite)

    let animPayloadsLen = animPayloads.reduce((acc, a) => acc + a.length, 0);
    let totalSize = 4 + vp8x.length + anim.length + animPayloadsLen;

    let riff = new Uint8Array(8 + totalSize);
    let riffView = new DataView(riff.buffer);
    riff[0] = 0x52; riff[1] = 0x49; riff[2] = 0x46; riff[3] = 0x46; // RIFF
    riffView.setUint32(4, totalSize, true);
    riff[8] = 0x57; riff[9] = 0x45; riff[10] = 0x42; riff[11] = 0x50; // WEBP

    let pos = 12;
    riff.set(vp8x, pos); pos += vp8x.length;
    riff.set(anim, pos); pos += anim.length;

    for (let chunk of animPayloads) {
        riff.set(chunk, pos);
        pos += chunk.length;
    }

    return new Blob([riff], { type: 'image/webp' });
}

// GIF Encoder (Gifshot Engine)
async function encodeGIF(framesImages, width, height, interval) {
    return new Promise((resolve, reject) => {
        if (typeof gifshot !== 'undefined') {
            gifshot.createGIF({
                images: framesImages,
                gifWidth: width,
                gifHeight: height,
                interval: interval / 1000,
                numWorkers: 2,
                sampleInterval: 10
            }, function (obj) {
                if (!obj.error) {
                    fetch(obj.image).then(r => r.blob()).then(resolve);
                } else {
                    reject(obj.error);
                }
            });
        } else {
            reject('GIF Encoder library not loaded');
        }
    });
}

// Main Conversion Engine Pipeline
DOM.btnStartConvert.addEventListener('click', async () => {
    if (!state.videoFile) return;

    state.isConverting = true;
    state.shouldCancel = false;
    
    state.fps = parseInt(DOM.selectFps.value);
    state.scale = parseFloat(DOM.selectScale.value);
    
    DOM.progressModal.classList.remove('hidden');
    DOM.lblProgressPercent.innerText = '0%';
    DOM.progressBarFill.style.width = '0%';
    DOM.lblProgressStatus.innerText = T("prog.prepare");

    const startTimePerf = performance.now();

    try {
        // Step 1: Calculate dimensions and frames
        let targetW = Math.round(state.originalWidth * state.scale);
        let targetH = Math.round(state.originalHeight * state.scale);

        // Apply Crop if enabled
        let cropX = 0, cropY = 0, cropW = state.originalWidth, cropH = state.originalHeight;
        if (state.crop.enabled) {
            cropX = Math.round(state.crop.x * state.originalWidth);
            cropY = Math.round(state.crop.y * state.originalHeight);
            cropW = Math.round(state.crop.w * state.originalWidth);
            cropH = Math.round(state.crop.h * state.originalHeight);
            targetW = Math.round(cropW * state.scale);
            targetH = Math.round(cropH * state.scale);
        }

        // Ensure dimensions are even integers for encoding standards
        targetW = targetW + (targetW % 2);
        targetH = targetH + (targetH % 2);

        const duration = Math.max(0.1, state.endTime - state.startTime);
        const step = (1 / state.fps) * state.speed;
        const totalFrames = Math.floor(duration / step);

        const extractedFrames = [];
        const delays = [];
        const imageURLs = [];

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const liveCanvas = DOM.encodingLiveCanvas;
        liveCanvas.width = targetW;
        liveCanvas.height = targetH;
        const liveCtx = liveCanvas.getContext('2d');

        // Step 2: Extract Frames from Video
        const video = DOM.mainVideo;
        video.pause();

        for (let i = 0; i < totalFrames; i++) {
            if (state.shouldCancel) throw new Error(T("err.cancelled"));

            const curTime = state.startTime + (i * step);
            video.currentTime = curTime;
            
            await new Promise(r => {
                const onSeek = () => {
                    video.removeEventListener('seeked', onSeek);
                    r();
                };
                video.addEventListener('seeked', onSeek);
            });

            // Render to Canvas with optional crop
            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
            liveCtx.drawImage(canvas, 0, 0);

            const imgData = ctx.getImageData(0, 0, targetW, targetH);
            const frameDelayMs = Math.round(step * 1000);

            extractedFrames.push({ imageData: imgData, data: imgData.data, delay: frameDelayMs });
            delays.push(frameDelayMs);
            imageURLs.push(canvas.toDataURL('image/png'));

            // Update UI Progress
            const pct = Math.round(((i + 1) / totalFrames) * 60);
            DOM.lblProgressPercent.innerText = `${pct}%`;
            DOM.progressBarFill.style.width = `${pct}%`;
            DOM.lblProgressStatus.innerText = T("prog.extract", i + 1, totalFrames);
        }

        // Step 3: Encode to Target Format
        DOM.lblProgressStatus.innerText = T("prog.encode", state.selectedFormat.toUpperCase());
        let finalBlob = null;

        if (state.selectedFormat === 'apng') {
            finalBlob = await encodeAPNG(extractedFrames, targetW, targetH, delays);
        } else if (state.selectedFormat === 'webp') {
            finalBlob = await encodeAnimatedWebP(extractedFrames, targetW, targetH, state.quality);
        } else if (state.selectedFormat === 'gif') {
            finalBlob = await encodeGIF(imageURLs, targetW, targetH, delays[0] || 33);
        }

        DOM.lblProgressPercent.innerText = '100%';
        DOM.progressBarFill.style.width = '100%';

        const totalTimeSec = ((performance.now() - startTimePerf) / 1000).toFixed(1);

        // Step 4: Present Result
        if (state.convertedUrl) URL.revokeObjectURL(state.convertedUrl);
        state.convertedBlob = finalBlob;
        state.convertedUrl = URL.createObjectURL(finalBlob);

        DOM.resultImagePreview.src = state.convertedUrl;
        DOM.btnDownload.href = state.convertedUrl;
        DOM.btnDownload.download = `converted_${state.selectedFormat}_${Date.now()}.${state.selectedFormat}`;

        // Keep the numbers so the labels can be rewritten when the locale changes.
        state.lastResult = { w: targetW, h: targetH, frames: extractedFrames.length, sec: totalTimeSec };
        DOM.lblResFileSize.innerText = `${(finalBlob.size / (1024 * 1024)).toFixed(2)} MB`;
        applyResultLabels();

        DOM.resultCard.classList.remove('hidden');
        DOM.resultCard.scrollIntoView({ behavior: 'smooth' });

        showToast(T("toast.done"), 'success');

    } catch (err) {
        showToast(err.message || T("toast.error"), 'error');
    } finally {
        DOM.progressModal.classList.add('hidden');
        state.isConverting = false;
    }
});

DOM.btnCancelConvert.addEventListener('click', () => {
    state.shouldCancel = true;
});

// Frame Inspector Expander Toggle
DOM.btnToggleInspector.addEventListener('click', () => {
    DOM.inspectorContent.classList.toggle('hidden');
    DOM.iconInspectChevron.classList.toggle('rotate-180');
});

// Frame Inspector Extraction Gallery
DOM.btnExtractFrames.addEventListener('click', async () => {
    if (!state.videoFile) return;
    DOM.frameGallery.innerHTML = `<p class="col-span-full text-center py-4 text-xs text-indigo-400">${T("frame.building")}</p>`;

    const duration = Math.max(0.1, state.endTime - state.startTime);
    const count = 12; // Sample 12 preview frames
    const step = duration / count;

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    
    DOM.frameGallery.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const curTime = state.startTime + (i * step);
        DOM.mainVideo.currentTime = curTime;

        await new Promise(r => setTimeout(r, 80));

        ctx.drawImage(DOM.mainVideo, 0, 0, 160, 90);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        const item = document.createElement('div');
        item.className = 'relative group bg-slate-800 rounded-lg overflow-hidden border border-slate-700';
        item.innerHTML = `
            <img src="${dataUrl}" class="w-full h-16 object-cover">
            <span class="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-slate-300">${curTime.toFixed(1)}s</span>
        `;
        DOM.frameGallery.appendChild(item);
    }

    state.lastFrameCount = count;
    DOM.lblFrameCountBadge.innerText = T("frame.countVal", count);
});

/* 結果卡上那四行是程式寫進去的，切語言時要照記下來的數字重寫一次。 */
function applyResultLabels() {
    if (!state.lastResult) return;
    DOM.lblResFormat.innerText = T("res.formatVal", state.selectedFormat.toUpperCase(),
        T(state.isLossless ? "res.lossless" : "res.lossy"));
    DOM.lblResDimFrames.innerText = T("res.dimVal", state.lastResult.w, state.lastResult.h,
        state.lastResult.frames);
    DOM.lblResEncodeTime.innerText = T("res.timeVal", state.lastResult.sec);
}

// Copy Data URL
DOM.btnCopyDataUrl.addEventListener('click', () => {
    if (!state.convertedBlob) return;
    const reader = new FileReader();
    reader.onloadend = () => {
        const textarea = document.createElement('textarea');
        textarea.value = reader.result;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(T("toast.copied"), 'success');
    };
    reader.readAsDataURL(state.convertedBlob);
});

// Open in New Tab
DOM.btnOpenNewTab.addEventListener('click', () => {
    if (state.convertedUrl) {
        window.open(state.convertedUrl, '_blank');
    }
});

/* 切語言：畫面上的固定文字由引擎處理，這幾處是程式自己寫進去的，要照現況重寫。
 * 轉換途中不動（那時 lblProgressStatus 正在跑進度，重寫會蓋掉）。 */
I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => {
    DOM.cropStatusText.innerText = T(state.crop.enabled ? 'crop.on' : 'crop.off');
    DOM.losslessDesc.innerText = T(state.isLossless ? 'opt.lossless.on' : 'opt.lossless.off');
    if (state.videoFile) {
        DOM.videoInfoBadge.innerText = T('video.info', state.originalWidth, state.originalHeight,
            state.videoDuration.toFixed(1));
    }
    DOM.lblFrameCountBadge.innerText = state.lastFrameCount
        ? T('frame.countVal', state.lastFrameCount) : T('frame.countZero');
    applyResultLabels();
});
