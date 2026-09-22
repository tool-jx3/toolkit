// 介面常數與小工具
const CANVAS_SIZE = 800;
const canvasEl = document.getElementById('main-canvas');
const overlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// WebM 影片按鈕隱藏起來
const btnExportVideo = document.getElementById('btnExportVideo');
if (btnExportVideo) {
    btnExportVideo.style.display = 'none';
}

// --- Three.js 與 Cannon.js 的全域設定 ---
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, preserveDrawingBuffer: true, alpha: true, logarithmicDepthBuffer: true });
renderer.setSize(CANVAS_SIZE, CANVAS_SIZE, false);
renderer.autoClear = false;

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.set(0, 200, 600);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); scene.add(ambientLight);
const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.5); dirLight1.position.set(200, 300, 200); scene.add(dirLight1);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3); dirLight2.position.set(-200, 100, -200); scene.add(dirLight2);

// 介面覆蓋層的場景（浮水印之類）
const uiScene = new THREE.Scene();
const uiCamera = new THREE.OrthographicCamera(-CANVAS_SIZE/2, CANVAS_SIZE/2, CANVAS_SIZE/2, -CANVAS_SIZE/2, 1, 10);
uiCamera.position.z = 5;
let wmSprite = null, wmTexture = null;

// 物理引擎（Cannon.js）
let physicsWorld = null;
let physicsObjects = [];

// 周邊資料的全域存放處
let currentTab = 'stand'; // 'stand' | 'shaker' | 'diorama'
let pivotContainer = null;

// ［立牌資料］
let standImgFront = null, standImgBack = null, standImgBase = null;

// ［搖搖樂資料］
let shakerBgImg = null, shakerFrontImg = null;
let shakerParts = []; // { id, img, qty, scale }
let shakerPartIdCounter = 0;

// ［立體透視資料］
let dioramaLayers = []; // { id, img, offsetX, offsetY, groupRef }
let dioramaLayerIdCounter = 0;

// --- 小工具函式 ---
function showLoading(text) { loadingText.innerHTML = text; overlay.style.display = 'flex'; }
function hideLoading() { overlay.style.display = 'none'; }
function fileToImage(file, callback) {
    if(!file) return callback(null);
    const reader = new FileReader();
    reader.onload = e => { const img = new Image(); img.onload = () => callback(img); img.src = e.target.result; };
    reader.readAsDataURL(file);
}

// --- 共用的介面事件 ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        const targetId = e.target.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
        currentTab = targetId.replace('tab-', '');
    });
});

document.querySelectorAll('.btn-clear').forEach(btn => {
    btn.addEventListener('click', e => {
        const targetId = e.target.getAttribute('data-target');
        document.getElementById(targetId).value = '';
        if(targetId === 'standBackInput') standImgBack = null;
        if(targetId === 'standBaseInput') standImgBase = null;
    });
});

['thickness', 'margin', 'baseSize', 'shakerAreaRatio', 'dioramaBaseMargin', 'dioramaGap', 'shakerBgSize'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', e => document.getElementById('val' + id.charAt(0).toUpperCase() + id.slice(1)).textContent = e.target.value);
});

document.getElementById('pivotType').addEventListener('change', e => {
    document.getElementById('baseOptionsPanel').style.display = e.target.value === 'bottom' ? 'block' : 'none';
});
document.getElementById('baseShapeType').addEventListener('change', e => {
    document.getElementById('baseSizeContainer').style.display = e.target.value === 'contour' ? 'none' : 'block';
});
document.getElementById('shakerBgType').addEventListener('change', e => {
    const type = e.target.value;
    document.getElementById('shakerBgImageUploadWrap').style.display = type === 'image' ? 'flex' : 'none';
    document.getElementById('shakerBgSizeWrap').style.display = type !== 'image' ? 'flex' : 'none';
});

// 背景與透明度
function updateBackground() {
    const isTransparent = document.getElementById('bgTransparent').checked;
    const color = document.getElementById('bgColor').value;
    if (isTransparent) { scene.background = null; renderer.setClearColor(0x000000, 0); canvasEl.classList.add('bg-checker'); canvasEl.style.backgroundColor = 'transparent'; } 
    else { scene.background = new THREE.Color(color); renderer.setClearColor(color, 1); canvasEl.classList.remove('bg-checker'); canvasEl.style.backgroundColor = color; }
    
    let isLight = true;
    if (!isTransparent) { const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16); isLight = (r*299 + g*587 + b*114)/1000 > 128; }
    const cvs = document.createElement('canvas'); cvs.width = 400; cvs.height = 60;
    const ctx = cvs.getContext('2d'); ctx.fillStyle = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(T('watermark'), 390, 35);
    if (!wmSprite) { wmTexture = new THREE.CanvasTexture(cvs); wmSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: wmTexture, transparent: true })); wmSprite.scale.set(400, 60, 1); wmSprite.position.set(CANVAS_SIZE/2 - 210, -CANVAS_SIZE/2 + 40, 0); uiScene.add(wmSprite); } 
    else { wmTexture.image = cvs; wmTexture.needsUpdate = true; }
}
document.getElementById('bgTransparent').addEventListener('change', updateBackground);
document.getElementById('bgColor').addEventListener('input', updateBackground);
updateBackground();

// 打光控制
const lightPad = document.getElementById('lightControlPad'); const lightHandle = document.getElementById('lightHandle');
let isDraggingLight = false;
function updateLightPosition(e) {
    const rect = lightPad.getBoundingClientRect(); let cx = e.clientX || e.touches[0].clientX, cy = e.clientY || e.touches[0].clientY;
    let dx = cx - rect.left - rect.width/2, dy = cy - rect.top - rect.height/2;
    const dist = Math.sqrt(dx*dx + dy*dy); if (dist > 33) { dx = (dx/dist)*33; dy = (dy/dist)*33; }
    lightHandle.style.left = `calc(50% + ${dx}px)`; lightHandle.style.top = `calc(50% + ${dy}px)`;
    dirLight1.position.x = dx * (400/33); dirLight1.position.z = dy * (400/33);
}
lightPad.addEventListener('mousedown', e => { isDraggingLight = true; updateLightPosition(e); });
window.addEventListener('mousemove', e => { if (isDraggingLight) updateLightPosition(e); }); window.addEventListener('mouseup', () => isDraggingLight = false);
lightPad.addEventListener('touchstart', e => { isDraggingLight = true; updateLightPosition(e); }, {passive:true});
window.addEventListener('touchmove', e => { if (isDraggingLight) { updateLightPosition(e); e.preventDefault(); } }, {passive:false}); window.addEventListener('touchend', () => isDraggingLight = false);
document.getElementById('lightIntensity').addEventListener('input', e => dirLight1.intensity = parseFloat(e.target.value));
document.getElementById('ambientIntensity').addEventListener('input', e => ambientLight.intensity = parseFloat(e.target.value));
document.getElementById('btnResetLight').addEventListener('click', () => { dirLight1.position.set(200,300,200); dirLight1.intensity = 0.5; ambientLight.intensity = 0.6; document.getElementById('lightIntensity').value = 0.5; document.getElementById('ambientIntensity').value = 0.6; lightHandle.style.left='calc(50% + 16.5px)'; lightHandle.style.top='calc(50% + 16.5px)'; });

// 把檔案輸入欄接到圖片上
document.getElementById('standFrontInput').addEventListener('change', e => fileToImage(e.target.files[0], img => standImgFront = img));
document.getElementById('standBackInput').addEventListener('change', e => fileToImage(e.target.files[0], img => standImgBack = img));
document.getElementById('standBaseInput').addEventListener('change', e => fileToImage(e.target.files[0], img => standImgBase = img));
document.getElementById('shakerBgInput').addEventListener('change', e => fileToImage(e.target.files[0], img => shakerBgImg = img));

// --- 拖放（只從把手拖）---
let draggedItemIndex = null;
function handleDragStart(e, index) { draggedItemIndex = index; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); }
function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function handleDragEnd(e) { e.currentTarget.classList.remove('dragging'); }
function handleDrop(e, targetIndex, arrayToUpdate, renderFn) {
    e.preventDefault(); e.currentTarget.classList.remove('drag-over');
    if (draggedItemIndex !== null && draggedItemIndex !== targetIndex) {
        const item = arrayToUpdate.splice(draggedItemIndex, 1)[0];
        arrayToUpdate.splice(targetIndex, 0, item);
        renderFn();
    }
}

// --- 動態清單：搖搖樂零件 ---
function renderShakerPartsUI() {
    const list = document.getElementById('shaker-parts-list'); list.innerHTML = '';
    shakerParts.forEach((p, index) => {
        const div = document.createElement('div'); div.className = 'panel-box mt-1 draggable-item'; div.style.padding = '12px';
        
        // 只有滑到把手上才打開 draggable，不然會跟滑桿打架
        div.addEventListener('mousedown', (e) => {
            if(e.target.classList.contains('drag-handle')) { div.draggable = true; } 
            else { div.draggable = false; }
        });

        div.addEventListener('dragstart', (e) => handleDragStart(e, index));
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('dragleave', handleDragLeave);
        div.addEventListener('dragend', handleDragEnd);
        div.addEventListener('drop', (e) => handleDrop(e, index, shakerParts, renderShakerPartsUI));

        div.innerHTML = `
            <div class="flex items-center gap-2 mb-2" style="justify-content: space-between;">
                <div class="flex items-center">
                    <span class="drag-handle" title="${T('list.drag')}">☰</span>
                    ${p.img ? `<img src="${p.img.src}" style="width:24px; height:24px; object-fit:contain; margin-right:8px; border-radius:4px; border:1px solid var(--border-color);">` : ''}
                    <label style="margin:0;">${T('shaker.partImage')}</label>
                </div>
                <button class="btn-danger" onclick="removeShakerPart(${p.id})" style="padding: 4px 8px;">${T('btn.delete')}</button>
            </div>
            <input type="file" onchange="updateShakerPartFile(event, ${p.id})" accept="image/png">
            <div class="flex gap-2 mt-2">
                <div class="flex-1"><label class="text-muted">${T('shaker.qty')}<span id="vQty${p.id}">${p.qty}</span>${T('unit.pieces')}</label>
                <input type="range" oninput="updateShakerPart(event, 'qty', ${p.id})" min="1" max="20" value="${p.qty}"></div>
                <div class="flex-1"><label class="text-muted">${T('base.size')}<span id="vScl${p.id}">${p.scale*100}</span>%</label>
                <input type="range" oninput="updateShakerPart(event, 'scale', ${p.id})" min="20" max="200" value="${p.scale*100}"></div>
            </div>
        `;
        list.appendChild(div);
    });
}
window.removeShakerPart = (id) => { shakerParts = shakerParts.filter(p => p.id !== id); renderShakerPartsUI(); };
window.updateShakerPartFile = (e, id) => { fileToImage(e.target.files[0], img => { const pt = shakerParts.find(x => x.id === id); if(pt) pt.img = img; renderShakerPartsUI(); }); };
window.updateShakerPart = (e, type, id) => { 
    const val = parseInt(e.target.value); const pt = shakerParts.find(x => x.id === id); 
    if(!pt) return;
    if(type === 'qty') { pt.qty = val; document.getElementById('vQty'+id).textContent = val; }
    else if(type === 'scale') { pt.scale = val/100; document.getElementById('vScl'+id).textContent = val; }
};
document.getElementById('btnAddShakerPart').addEventListener('click', () => { shakerParts.push({ id: shakerPartIdCounter++, img: null, qty: 1, scale: 1.0 }); renderShakerPartsUI(); });

// --- 動態清單：立體透視圖層 ---
function renderDioramaLayersUI() {
    const list = document.getElementById('diorama-layers-list'); list.innerHTML = '';
    dioramaLayers.forEach((l, index) => {
        const div = document.createElement('div'); div.className = 'panel-box mt-1 draggable-item'; div.style.padding = '12px';
        
        div.addEventListener('mousedown', (e) => {
            if(e.target.classList.contains('drag-handle')) { div.draggable = true; } 
            else { div.draggable = false; }
        });

        div.addEventListener('dragstart', (e) => handleDragStart(e, index));
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('dragleave', handleDragLeave);
        div.addEventListener('dragend', handleDragEnd);
        div.addEventListener('drop', (e) => handleDrop(e, index, dioramaLayers, renderDioramaLayersUI));

        div.innerHTML = `
            <div class="flex items-center gap-2 mb-2" style="justify-content: space-between;">
                <div class="flex items-center">
                    <span class="drag-handle" title="${T('list.drag')}">☰</span>
                    ${l.img ? `<img src="${l.img.src}" style="width:24px; height:24px; object-fit:contain; margin-right:8px; border-radius:4px; border:1px solid var(--border-color);">` : ''}
                    <label style="margin:0;"><span class="text-primary font-bold">[${index+1}]</span> ${T('dio.layerImage')}</label>
                </div>
                <button class="btn-danger" onclick="removeDioramaLayer(${l.id})" style="padding: 4px 8px;">${T('btn.delete')}</button>
            </div>
            <input type="file" onchange="updateDioramaFile(event, ${l.id})" accept="image/png" class="mb-2">
            <div class="flex gap-2">
                <div class="flex-1 flex items-center gap-2"><label class="text-muted m-0">X:</label>
                <input type="range" oninput="updateDioramaOffset(event, 'x', ${l.id})" min="-200" max="200" value="${l.offsetX}" class="flex-1 m-0">
                <input type="number" oninput="updateDioramaOffsetSync(event, 'x', ${l.id})" value="${l.offsetX}"></div>
                <div class="flex-1 flex items-center gap-2"><label class="text-muted m-0">Y:</label>
                <input type="range" oninput="updateDioramaOffset(event, 'y', ${l.id})" min="-200" max="200" value="${l.offsetY}" class="flex-1 m-0">
                <input type="number" oninput="updateDioramaOffsetSync(event, 'y', ${l.id})" value="${l.offsetY}"></div>
            </div>
            <div class="flex gap-2 mt-2">
                <div class="flex-1 flex items-center gap-2">
                    <label class="text-muted m-0" style="white-space: nowrap;">${T('dio.rotate')}</label>
                    <button onclick="updateDioramaRotation(${l.id}, -90)" style="flex:1; padding:2px; border:1px solid var(--border-color); background:var(--bg-panel); border-radius:4px; cursor:pointer;">-90°</button>
                    <span id="vRot${l.id}" style="width: 40px; text-align: center; font-size: 14px;">${l.rotationY || 0}°</span>
                    <button onclick="updateDioramaRotation(${l.id}, 90)" style="flex:1; padding:2px; border:1px solid var(--border-color); background:var(--bg-panel); border-radius:4px; cursor:pointer;">+90°</button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}
window.removeDioramaLayer = (id) => { dioramaLayers = dioramaLayers.filter(l => l.id !== id); renderDioramaLayersUI(); };
window.updateDioramaFile = (e, id) => { fileToImage(e.target.files[0], img => { const lr = dioramaLayers.find(x => x.id === id); if(lr) lr.img = img; renderDioramaLayersUI(); }); };
window.updateDioramaRotation = (id, delta) => { 
    const lr = dioramaLayers.find(x => x.id === id); 
    if(!lr) return;
    lr.rotationY = ((lr.rotationY || 0) + delta) % 360;
    if (lr.rotationY < 0) lr.rotationY += 360;
    document.getElementById('vRot'+id).textContent = lr.rotationY + '°';
    applyDioramaOffsets();
};
window.updateDioramaOffset = (e, axis, id) => { 
    const val = parseInt(e.target.value); const lr = dioramaLayers.find(x => x.id === id); 
    if(!lr) return;
    if(axis === 'x') lr.offsetX = val; else lr.offsetY = val;
    e.target.nextElementSibling.value = val;
    applyDioramaOffsets();
};
window.updateDioramaOffsetSync = (e, axis, id) => {
    const val = parseInt(e.target.value) || 0; const lr = dioramaLayers.find(x => x.id === id); 
    if(!lr) return;
    if(axis === 'x') lr.offsetX = val; else lr.offsetY = val;
    e.target.previousElementSibling.value = val;
    applyDioramaOffsets();
};
function applyDioramaOffsets() {
    if(currentTab !== 'diorama' || !pivotContainer) return;
    dioramaLayers.forEach(l => {
        if(l.groupRef && l.basePos) {
            l.groupRef.position.x = l.basePos.x + l.offsetX;
            l.groupRef.position.y = l.basePos.y + l.offsetY;
            l.groupRef.rotation.y = (l.rotationY || 0) * (Math.PI / 180);
        }
    });
}
document.getElementById('btnAddDioramaLayer').addEventListener('click', () => { dioramaLayers.push({ id: dioramaLayerIdCounter++, img: null, offsetX: 0, offsetY: 0, rotationY: 0, groupRef: null }); renderDioramaLayersUI(); });


// --- 形狀分析（三種周邊共用的核心）---
function getContour(imageData, width, height) {
    const data = imageData.data; const isSolid = (x, y) => (x>=0 && x<width && y>=0 && y<height) && data[(y*width+x)*4+3]>128;
    let startX = -1, startY = -1;
    for (let y=0; y<height; y++) { for (let x=0; x<width; x++) { if (isSolid(x, y)) { startX=x; startY=y; break; } } if (startX!==-1) break; }
    if (startX===-1) return [];
    const boundary = []; let currX = startX, currY = startY, backDir = 3;
    const dx = [1,1,0,-1,-1,-1,0,1], dy = [0,1,1,1,0,-1,-1,-1];
    let attempts = 0;
    do {
        boundary.push({x: currX, y: currY}); let found = false, searchDir = (backDir + 2) % 8;
        for (let i=0; i<8; i++) { let dir = (searchDir+i)%8; let nx = currX+dx[dir], ny = currY+dy[dir]; if (isSolid(nx, ny)) { currX=nx; currY=ny; backDir=(dir+4)%8; found=true; break; } }
        if (!found || attempts++ > width*height) break;
    } while (currX!==startX || currY!==startY);
    return boundary;
}
function smoothContour(points, windowSize=7) {
    if (points.length<windowSize) return points; const smoothed = [];
    for (let i=0; i<points.length; i++) {
        let sumX=0, sumY=0; for (let j=0; j<windowSize; j++) { let idx = (i+j-Math.floor(windowSize/2)+points.length)%points.length; sumX+=points[idx].x; sumY+=points[idx].y; }
        smoothed.push({ x:sumX/windowSize, y:sumY/windowSize });
    }
    const simplified = [smoothed[0]];
    for(let i=1; i<smoothed.length; i++){ const last=simplified[simplified.length-1]; const dx=smoothed[i].x-last.x, dy=smoothed[i].y-last.y; if(Math.sqrt(dx*dx+dy*dy)>2) simplified.push(smoothed[i]); }
    return simplified;
}

function createShapeFromImage(img, expandPx, maxDim=500) {
    let scale = 1; if (img.width>maxDim || img.height>maxDim) scale = maxDim/Math.max(img.width, img.height);
    const w = Math.floor(img.width*scale), h = Math.floor(img.height*scale), scaledExpand = Math.floor(expandPx*scale), cw = w+scaledExpand*2, ch = h+scaledExpand*2;
    const cvs1 = document.createElement('canvas'); cvs1.width = w; cvs1.height = h; cvs1.getContext('2d').drawImage(img, 0, 0, w, h);
    const cvs2 = document.createElement('canvas'); cvs2.width = cw; cvs2.height = ch; const ctx2 = cvs2.getContext('2d', {willReadFrequently:true});
    for(let angle=0; angle<Math.PI*2; angle+=Math.PI/8) ctx2.drawImage(cvs1, scaledExpand+Math.cos(angle)*scaledExpand, scaledExpand+Math.sin(angle)*scaledExpand);
    const imgData = ctx2.getImageData(0, 0, cw, ch);
    for(let i=0; i<imgData.data.length; i+=4) imgData.data[i+3] = imgData.data[i+3]>30 ? 255 : 0;
    ctx2.putImageData(imgData, 0, 0);
    
    let points = getContour(imgData, cw, ch); if(points.length===0) return null; points = smoothContour(points, 7);
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity; points.forEach(p=>{ if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y; });
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
    
    const mappedPoints = points.map(p => ({ x: (p.x-cx)/scale, y: -(p.y-cy)/scale })); // 換算成實際的 3D 世界座標
    
    const shape = new THREE.Shape(); 
    shape.moveTo(mappedPoints[0].x, mappedPoints[0].y);
    for(let i=1; i<mappedPoints.length; i++) shape.lineTo(mappedPoints[i].x, mappedPoints[i].y);
    
    return { 
        shape, mappedPoints, scale, 
        planeOffsetX: (cw/2-cx)/scale, planeOffsetY: (cy-ch/2)/scale, 
        bounds: { minX:(minX-cx)/scale, maxX:(maxX-cx)/scale, minY:-(maxY-cy)/scale, maxY:-(minY-cy)/scale } 
    };
}

// 建立材質（用 renderOrder 與 alphaTest 把破圖問題解掉）
function getMaterial(texture, isGlossy) {
    return isGlossy ? new THREE.MeshPhongMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5, shininess: 100, specular: 0xffffff })
                    : new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
}
function getAcrylicMaterial() {
    return new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
}

function resetCamera() {
    if(!pivotContainer) return;
    pivotContainer.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivotContainer);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(Math.sqrt(size.x*size.x + size.z*size.z), size.y);
    const cameraDist = (maxDim/2) / Math.tan(camera.fov*(Math.PI/180)/2) * 1.35;
    camera.position.set(0, center.y, cameraDist); controls.target.set(0, center.y, 0); controls.update();
}
document.getElementById('btnResetCamera').addEventListener('click', resetCamera);


// --- 陀螺儀（傾斜）與搖晃 ---
let shakeForceX = 0, shakeForceY = 0;
let lastShakeX = 0, lastShakeY = 0;
let isShaking = false;

// 陀螺儀變數
let isGyroEnabled = false;
let gyroGravityX = 0;
let gyroGravityY = 0;

// 進入手機的全螢幕沉浸模式
function enterGyroMode() {
    isGyroEnabled = true;
    document.getElementById('app-layout').classList.add('gyro-mode');
    document.getElementById('btnExitGyro').style.display = 'block';
    resetCamera();
    if(pivotContainer) pivotContainer.rotation.y = 0; // 轉回正面
}

document.getElementById('btnEnableGyro').addEventListener('click', async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceOrientationEvent.requestPermission();
            if (permissionState === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
                enterGyroMode();
            } else {
                alert(T("gyro.denied"));
            }
        } catch (error) {
            console.error(error);
            alert(T("gyro.noRequest"));
        }
    } else if ('DeviceOrientationEvent' in window) {
        // Android 之類不必請求權限就能用的裝置
        window.addEventListener('deviceorientation', handleOrientation);
        enterGyroMode();
    } else {
        alert(T("gyro.unsupported"));
    }
});

// 回到編輯模式
document.getElementById('btnExitGyro').addEventListener('click', () => {
    isGyroEnabled = false;
    window.removeEventListener('deviceorientation', handleOrientation);
    document.getElementById('app-layout').classList.remove('gyro-mode');
    document.getElementById('btnExitGyro').style.display = 'none';
});

function handleOrientation(event) {
    if (!isGyroEnabled || currentTab !== 'shaker') return;
    
    // 裝置的方向（X、Y 的傾斜量）
    let tiltX = event.gamma || 0; // -90 ～ 90（左右）
    let tiltY = event.beta || 0;  // -180 ～ 180（上下）

    // 濾掉過大的值
    tiltX = Math.max(-90, Math.min(90, tiltX));
    tiltY = Math.max(-90, Math.min(90, tiltY));
    
    // 把傾斜量換算成重力大小
    gyroGravityX = tiltX * 30;  // 手機往右傾，力就往右
    gyroGravityY = -tiltY * 30; // 手機立起來（beta=90）時 Y 是 -2700，零件會往下倒
}

// 用觸控或拖曳來搖
canvasEl.addEventListener('mousedown', e => { isShaking = true; lastShakeX = e.clientX; lastShakeY = e.clientY; });
window.addEventListener('mousemove', e => {
    if(isShaking) {
        shakeForceX += (e.clientX - lastShakeX) * 100;
        shakeForceY -= (e.clientY - lastShakeY) * 100;
        lastShakeX = e.clientX; lastShakeY = e.clientY;
    }
});
window.addEventListener('mouseup', () => isShaking = false);

canvasEl.addEventListener('touchstart', e => { isShaking = true; lastShakeX = e.touches[0].clientX; lastShakeY = e.touches[0].clientY; }, {passive:true});
window.addEventListener('touchmove', e => {
    if(isShaking) {
        shakeForceX += (e.touches[0].clientX - lastShakeX) * 100;
        shakeForceY -= (e.touches[0].clientY - lastShakeY) * 100;
        lastShakeX = e.touches[0].clientX; lastShakeY = e.touches[0].clientY;
    }
}, {passive:false});
window.addEventListener('touchend', () => isShaking = false);

// --- 算繪分流 ---
document.getElementById('btnGenerate').addEventListener('click', () => {
    if (currentTab === 'stand') generateStand();
    else if (currentTab === 'shaker') generateShaker();
    else generateDiorama();
});

// 清場
function cleanupScene() {
    if(pivotContainer) scene.remove(pivotContainer);
    if(physicsWorld) physicsWorld = null;
    physicsObjects = [];
    shakeForceX = 0; shakeForceY = 0; // 歸零外力
    pivotContainer = new THREE.Group();
    scene.add(pivotContainer);
}

// 1. 壓克力立牌
function generateStand() {
    if(!standImgFront) return alert(T("err.needFront"));
    showLoading(T("busy.stand"));
    setTimeout(() => {
        try {
            cleanupScene();
            const thickness = parseInt(document.getElementById('thickness').value), expandPx = parseInt(document.getElementById('margin').value);
            const frontData = createShapeFromImage(standImgFront, expandPx);
            if(!frontData) throw new Error(T("err.outline"));
            
            const hasBack = !!standImgBack, mode = document.getElementById('contourMode').value, isGlossy = document.getElementById('textureType').value === 'glossy';
            const backData = hasBack ? createShapeFromImage(standImgBack, expandPx) : frontData;
            const texLoader = new THREE.TextureLoader();
            const texFront = texLoader.load(standImgFront.src); const texBack = hasBack ? texLoader.load(standImgBack.src) : texFront;
            const acrylicMat = getAcrylicMaterial(), matFront = getMaterial(texFront, isGlossy), matBack = getMaterial(texBack, isGlossy);
            
            const mainGroup = new THREE.Group();
            
            if (mode === 'unified' || (!hasBack && mode === 'separate')) {
                const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(frontData.shape, {depth: thickness, bevelEnabled:false}), acrylicMat);
                mesh.position.z = -thickness/2; mesh.renderOrder = 0; mainGroup.add(mesh);
                
                const planeF = new THREE.Mesh(new THREE.PlaneGeometry(standImgFront.width, standImgFront.height), matFront);
                planeF.position.set(frontData.planeOffsetX, frontData.planeOffsetY, thickness/2 + 0.1); planeF.renderOrder = 1; mainGroup.add(planeF);
                
                const planeB = new THREE.Mesh(new THREE.PlaneGeometry(hasBack?standImgBack.width:standImgFront.width, hasBack?standImgBack.height:standImgFront.height), matBack);
                if (hasBack) planeB.position.set(-backData.planeOffsetX, backData.planeOffsetY, -thickness/2 - 0.1);
                else { planeB.position.set(frontData.planeOffsetX, frontData.planeOffsetY, -thickness/2 - 0.1); planeB.scale.x = -1; }
                planeB.rotation.y = Math.PI; planeB.renderOrder = 1; mainGroup.add(planeB);
            } else {
                const grpF = new THREE.Group(), grpB = new THREE.Group();
                const mF = new THREE.Mesh(new THREE.ExtrudeGeometry(frontData.shape, {depth: thickness, bevelEnabled:false}), acrylicMat);
                mF.position.z = -thickness/2; mF.renderOrder = 0; grpF.add(mF);
                const pf = new THREE.Mesh(new THREE.PlaneGeometry(standImgFront.width, standImgFront.height), matFront);
                pf.position.set(frontData.planeOffsetX, frontData.planeOffsetY, thickness/2 + 0.1); pf.renderOrder = 1; grpF.add(pf);
                mainGroup.add(grpF);
                
                const mB = new THREE.Mesh(new THREE.ExtrudeGeometry(backData.shape, {depth: thickness, bevelEnabled:false}), acrylicMat);
                mB.position.z = -thickness/2; mB.renderOrder = 0; grpB.add(mB);
                const pb = new THREE.Mesh(new THREE.PlaneGeometry(standImgBack.width, standImgBack.height), matBack);
                pb.position.set(backData.planeOffsetX, backData.planeOffsetY, thickness/2 + 0.1); pb.renderOrder = 1; grpB.add(pb);
                grpB.rotation.y = Math.PI; mainGroup.add(grpB);
                pivotContainer.userData = { mode: 'separate', frontGroup: grpF, backGroup: grpB };
            }

            if(document.getElementById('pivotType').value === 'bottom') {
                mainGroup.position.y = -frontData.bounds.minY; 
                const baseGroup = new THREE.Group();
                const baseRad = parseInt(document.getElementById('baseSize').value);
                const shapeType = document.getElementById('baseShapeType').value;
                let baseShape = new THREE.Shape();
                if(shapeType === 'contour' && standImgBase) baseShape = createShapeFromImage(standImgBase, expandPx).shape;
                else if(shapeType === 'square' || (shapeType==='contour'&&!standImgBase)) { baseShape.moveTo(-baseRad,-baseRad); baseShape.lineTo(baseRad,-baseRad); baseShape.lineTo(baseRad,baseRad); baseShape.lineTo(-baseRad,baseRad); }
                else baseShape.absarc(0,0,baseRad,0,Math.PI*2,false);
                
                const bMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(baseShape, {depth: thickness, bevelEnabled:false}), acrylicMat);
                bMesh.position.z = -thickness/2; bMesh.renderOrder = 0; baseGroup.add(bMesh);
                if (standImgBase) {
                    let pw = standImgBase.width, ph = standImgBase.height;
                    if(shapeType!=='contour') { const scale = (baseRad*1.8)/Math.max(pw,ph); pw*=scale; ph*=scale; }
                    const pMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), getMaterial(texLoader.load(standImgBase.src), isGlossy));
                    pMesh.position.z = thickness/2 + 0.1; pMesh.renderOrder = 1;
                    if(shapeType==='contour'){ const bd = createShapeFromImage(standImgBase,expandPx); pMesh.position.x=bd.planeOffsetX; pMesh.position.y=bd.planeOffsetY; }
                    baseGroup.add(pMesh);
                }
                baseGroup.rotation.x = -Math.PI/2; baseGroup.position.y = -thickness/2;
                pivotContainer.add(baseGroup);
            }

            pivotContainer.add(mainGroup); resetCamera(); unlockExports(); hideLoading();
        } catch(e) { hideLoading(); alert(e.message); }
    }, 100);
}

// 2. 壓克力搖搖樂
function generateShaker() {
    const bgType = document.getElementById('shakerBgType').value;
    if(bgType === 'image' && !shakerBgImg) return alert(T("err.needShakerBg"));
    
    let validParts = shakerParts.filter(p => p.img);
    if(validParts.length === 0) return alert(T("err.needPart"));
    showLoading(T("busy.shaker"));

    setTimeout(() => {
        try {
            cleanupScene();
            const thickness = parseInt(document.getElementById('thickness').value), expandPx = parseInt(document.getElementById('margin').value);
            const isGlossy = document.getElementById('textureType').value === 'glossy';
            const texLoader = new THREE.TextureLoader();
            const acrylicMat = getAcrylicMaterial();
            
            // 初始化 Cannon.js
            physicsWorld = new CANNON.World();
            physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
            
            const matPhys = new CANNON.Material();
            const matContact = new CANNON.ContactMaterial(matPhys, matPhys, { friction: 0.1, restitution: 0.6 });
            physicsWorld.addContactMaterial(matContact);

            // ［1］背板（背景外框） 
            let bgShape = new THREE.Shape();
            let bgData = null;
            let bw, bh, cx=0, cy=0;
            const bgRadius = parseInt(document.getElementById('shakerBgSize').value) / 2;

            if(bgType === 'image') {
                bgData = createShapeFromImage(shakerBgImg, expandPx);
                if(!bgData) throw new Error(T("err.outlineFrame"));
                bgShape = bgData.shape;
                bw = bgData.bounds.maxX - bgData.bounds.minX; bh = bgData.bounds.maxY - bgData.bounds.minY;
            } else if (bgType === 'circle') {
                bgShape.absarc(0,0,bgRadius,0,Math.PI*2,false);
                bw = bgRadius*2; bh = bgRadius*2;
            } else {
                bgShape.moveTo(-bgRadius,-bgRadius); bgShape.lineTo(bgRadius,-bgRadius); bgShape.lineTo(bgRadius,bgRadius); bgShape.lineTo(-bgRadius,bgRadius);
                bw = bgRadius*2; bh = bgRadius*2;
            }

            const frameDepth = thickness * 1.5;
            const bgMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(bgShape, {depth: frameDepth, bevelEnabled:false}), acrylicMat);
            bgMesh.position.z = -frameDepth/2; bgMesh.renderOrder = 0;
            pivotContainer.add(bgMesh);

            if(bgType === 'image' && shakerBgImg) {
                const texBg = texLoader.load(shakerBgImg.src);
                const planeBg = new THREE.Mesh(new THREE.PlaneGeometry(shakerBgImg.width, shakerBgImg.height), getMaterial(texBg, isGlossy));
                planeBg.position.set(bgData.planeOffsetX, bgData.planeOffsetY, frameDepth/2 + 0.1); planeBg.renderOrder = 1;
                pivotContainer.add(planeBg);
            }

            // ［2］前板（透明的玻璃蓋）
            const gapZ = thickness * 0.8; 
            const frontZ = frameDepth/2 + gapZ;
            
            const coverMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(bgShape, {depth: 2, bevelEnabled:false}), acrylicMat);
            coverMesh.position.z = frontZ; coverMesh.renderOrder = 0; pivotContainer.add(coverMesh);
            
            if(shakerFrontImg) {
                const fData = createShapeFromImage(shakerFrontImg, expandPx);
                const texFront = texLoader.load(shakerFrontImg.src);
                const planeFront = new THREE.Mesh(new THREE.PlaneGeometry(shakerFrontImg.width, shakerFrontImg.height), getMaterial(texFront, isGlossy));
                planeFront.position.set(fData ? fData.planeOffsetX : 0, fData ? fData.planeOffsetY : 0, frontZ + 2.1); planeFront.renderOrder = 1;
                pivotContainer.add(planeFront);
            }
            const areaRatio = parseInt(document.getElementById('shakerAreaRatio').value) / 100;
            let boundaryPoints = [];
            
            if(bgType === 'image') {
                boundaryPoints = bgData.mappedPoints.map(p => ({ x: p.x * areaRatio, y: p.y * areaRatio }));
            } else if (bgType === 'circle') {
                const steps = 32; // 把圓切成 32 邊形，滾起來才順
                for(let i=0; i<steps; i++) {
                    const a = (i/steps) * Math.PI * 2;
                    boundaryPoints.push({ x: Math.cos(a) * bgRadius * areaRatio, y: Math.sin(a) * bgRadius * areaRatio });
                }
            } else { // square
                const r = bgRadius * areaRatio;
                boundaryPoints = [ {x: -r, y: -r}, {x: r, y: -r}, {x: r, y: r}, {x: -r, y: r} ];
            }

            // 沿著線段建出物理牆的函式
            const makeSegmentWall = (p1, p2) => {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                if(len < 0.5) return; // 太短的線段不管
                
                const angle = Math.atan2(dy, dx);
                const midX = (p1.x + p2.x)/2;
                const midY = (p1.y + p2.y)/2;

                // 算出線段朝外的法線向量
                let nx = -dy; let ny = dx;
                const dot = nx * midX + ny * midY;
                if (dot < 0) { nx = -nx; ny = -ny; }
                const nLen = Math.sqrt(nx*nx + ny*ny) || 1;
                nx /= nLen; ny /= nLen;

                const wallThick = 400; // 牆做得很厚，零件才穿不過去
                // 把牆心往輪廓外推，內部才留得出空間
                const shiftX = nx * (wallThick / 2);
                const shiftY = ny * (wallThick / 2);

                const body = new CANNON.Body({ mass: 0, material: matPhys });
                // 給 len/2 + 5 讓相鄰的牆角重疊，避免死角與縫隙穿牆
                const box = new CANNON.Box(new CANNON.Vec3(len/2 + 5, wallThick/2, gapZ/2)); 
                body.addShape(box);
                
                body.position.set(midX + shiftX, midY + shiftY, frameDepth/2 + gapZ/2);
                
                const q = new CANNON.Quaternion();
                q.setFromAxisAngle(new CANNON.Vec3(0,0,1), angle);
                body.quaternion.copy(q);
                
                physicsWorld.addBody(body);
            };

            // 沿著整條輪廓立起多邊形的物理牆
            for(let i=0; i<boundaryPoints.length; i++) {
                makeSegmentWall(boundaryPoints[i], boundaryPoints[(i+1) % boundaryPoints.length]);
            }

            // ［4］產生內部的零件
            const iw = bw * 0.5, ih = bh * 0.5; // 限定生成範圍，讓零件安全地出現在中央一帶
            validParts.forEach(part => {
                const pData = createShapeFromImage(part.img, expandPx/2);
                if(!pData) return;
                const pThick = thickness * 0.4; 
                const pWidth = (pData.bounds.maxX - pData.bounds.minX) * part.scale;
                const pHeight = (pData.bounds.maxY - pData.bounds.minY) * part.scale;
                
                for(let i=0; i<part.qty; i++) {
                    const pMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(pData.shape, {depth: pThick, bevelEnabled:false}), acrylicMat);
                    pMesh.position.z = -pThick/2; pMesh.renderOrder = 0; 

                    const tex = texLoader.load(part.img.src);
                    const pPlane = new THREE.Mesh(new THREE.PlaneGeometry(part.img.width, part.img.height), getMaterial(tex, isGlossy));
                    pPlane.position.set(pData.planeOffsetX, pData.planeOffsetY, pThick/2 + 0.1); pPlane.renderOrder = 1; 
                    
                    const group = new THREE.Group(); group.add(pMesh); group.add(pPlane);
                    group.scale.set(part.scale, part.scale, 1);
                    
                    const startX = cx + (Math.random()-0.5)*iw;
                    const startY = cy + (Math.random()-0.5)*ih;
                    const startZ = frameDepth/2 + gapZ/2; 
                    
                    group.position.set(startX, startY, startZ);
                    pivotContainer.add(group);

                    // 用球體當物理碰撞體
                    const pRadius = Math.max(pWidth, pHeight) / 2 * 0.8; 
                    const body = new CANNON.Body({ mass: (pWidth*pHeight)/100, material: matPhys });
                    const shape = new CANNON.Sphere(pRadius);
                    body.addShape(shape);
                    
                    body.position.set(startX, startY, startZ);
                    
                    physicsWorld.addBody(body);
                    // 記下 startZ，每一格再手動壓回去
                    physicsObjects.push({ mesh: group, body: body, startZ: startZ });
                }
            });

            resetCamera(); unlockExports(); hideLoading();
        } catch (e) { hideLoading(); alert(e.message); }
    }, 100);
}

// 3. 壓克力立體透視
function generateDiorama() {
    let validLayers = dioramaLayers.filter(l => l.img);
    if(validLayers.length === 0) return alert(T("err.needLayer"));
    showLoading(T("busy.diorama"));

    setTimeout(() => {
        try {
            cleanupScene();
            const thickness = parseInt(document.getElementById('thickness').value), expandPx = parseInt(document.getElementById('margin').value);
            const isGlossy = document.getElementById('textureType').value === 'glossy';
            const gap = parseInt(document.getElementById('dioramaGap').value);
            const texLoader = new THREE.TextureLoader();
            const acrylicMat = getAcrylicMaterial();
            
            let globalMinY = Infinity, globalMinX = Infinity, globalMaxX = -Infinity;

            validLayers.forEach((layer, idx) => {
                const data = createShapeFromImage(layer.img, expandPx);
                if(data) {
                    if(data.bounds.minY < globalMinY) globalMinY = data.bounds.minY;
                    if(data.bounds.minX < globalMinX) globalMinX = data.bounds.minX;
                    if(data.bounds.maxX > globalMaxX) globalMaxX = data.bounds.maxX;
                    
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(data.shape, {depth: thickness, bevelEnabled:false}), acrylicMat);
                    mesh.position.z = -thickness/2; mesh.renderOrder = 0;
                    const tex = texLoader.load(layer.img.src);
                    const plane = new THREE.Mesh(new THREE.PlaneGeometry(layer.img.width, layer.img.height), getMaterial(tex, isGlossy));
                    plane.position.set(data.planeOffsetX, data.planeOffsetY, thickness/2 + 0.1); plane.renderOrder = 1;
                    
                    const group = new THREE.Group(); group.add(mesh); group.add(plane);
                    const zPos = - ((validLayers.length-1) * gap)/2 + ((validLayers.length - 1 - idx) * gap);
                    
                    layer.basePos = { x: 0, y: -data.bounds.minY, z: zPos }; 
                    group.position.set(layer.basePos.x + layer.offsetX, layer.basePos.y + layer.offsetY, layer.basePos.z);
                    group.rotation.y = (layer.rotationY || 0) * (Math.PI / 180);
                    
                    pivotContainer.add(group);
                    layer.groupRef = group;
                }
            });
            
            const bMargin = parseInt(document.getElementById('dioramaBaseMargin').value);
            const totalWidth = (globalMaxX - globalMinX) + bMargin*2;
            const totalDepth = ((validLayers.length-1) * gap) + thickness + bMargin*2;
            
            const baseShape = new THREE.Shape();
            baseShape.moveTo(-totalWidth/2, -totalDepth/2); baseShape.lineTo(totalWidth/2, -totalDepth/2);
            baseShape.lineTo(totalWidth/2, totalDepth/2); baseShape.lineTo(-totalWidth/2, totalDepth/2);
            
            const baseMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(baseShape, {depth: thickness, bevelEnabled:true, bevelThickness: 2, bevelSize: 2}), acrylicMat);
            baseMesh.rotation.x = -Math.PI/2;
            baseMesh.position.y = -thickness - 0.1; baseMesh.renderOrder = 0;
            pivotContainer.add(baseMesh);

            resetCamera(); unlockExports(); hideLoading();
        } catch (e) { hideLoading(); alert(e.message); }
    }, 100);
}

// --- 共用的動畫與算繪迴圈 ---
let lastTime = performance.now();

function animate(time) {
    requestAnimationFrame(animate);
    if (!time) time = performance.now();
    const dt = time - lastTime;
    lastTime = time;

    controls.update();

    if (pivotContainer) {
        const speed = parseInt(document.getElementById('rotationSpeed').value);
        if (speed > 0) pivotContainer.rotation.y += speed * 0.01;

        pivotContainer.updateMatrixWorld(true);

        if (pivotContainer.userData.mode === 'separate' && pivotContainer.userData.backGroup) {
            const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
            const centerPos = new THREE.Vector3(); pivotContainer.getWorldPosition(centerPos);
            const viewVec = camPos.sub(centerPos).normalize();
            const fwdVec = new THREE.Vector3(0,0,1).applyQuaternion(pivotContainer.quaternion);
            if (fwdVec.dot(viewVec) >= 0) { 
                pivotContainer.userData.frontGroup.visible = true; 
                pivotContainer.userData.backGroup.visible = false; 
            } else { 
                pivotContainer.userData.frontGroup.visible = false; 
                pivotContainer.userData.backGroup.visible = true; 
            }
        }
    }

    if (physicsWorld && currentTab === 'shaker' && pivotContainer) {
        let gx = shakeForceX;
        let gy = shakeForceY;

        if (isGyroEnabled) {
            gx += gyroGravityX;
            gy += gyroGravityY;
        } else {
            const worldDown = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
            const invQuat = pivotContainer.quaternion.clone().invert();
            const localDown = worldDown.applyQuaternion(invQuat);
            gx += localDown.x * 3000;
            gy += localDown.y * 3000;
        }
        
        gx = Math.max(Math.min(gx, 15000), -15000);
        gy = Math.max(Math.min(gy, 15000), -15000);

        physicsWorld.gravity.set(gx, gy, 0);
        
        shakeForceX *= 0.85; 
        shakeForceY *= 0.85;

        physicsWorld.step(1/60);
        for(let obj of physicsObjects) {
            
            obj.body.position.z = obj.startZ;
            obj.body.velocity.z = 0; 
            
            obj.body.angularVelocity.x = 0;
            obj.body.angularVelocity.y = 0;

            obj.body.wakeUp(); 
            obj.mesh.position.copy(obj.body.position);
            obj.mesh.quaternion.copy(obj.body.quaternion);
        }
    }

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(uiScene, uiCamera);
}
animate();


// --- 搖搖樂的動畫 ---
function getShakerAngle(progress) {
    const max = Math.PI / 3;
    
    let t = progress + 0.078 * Math.sin(progress * Math.PI * 4);
    
    return max * Math.sin(t * Math.PI * 2);
}


// --- 匯出 ---
function unlockExports() {
    // 按鈕已經移掉了，所以不再處理影片按鈕的解鎖
    document.getElementById('btnExportAPNG').disabled = false;
    document.getElementById('btnExportGIF').disabled = false;
    document.getElementById('btnExportGLTF').disabled = false;
}

document.getElementById('btnExportAPNG').addEventListener('click', async () => {
    if (!pivotContainer || typeof UPNG === 'undefined') return;
    
    const origSpeedStr = document.getElementById('rotationSpeed').value;
    const origSpeed = parseFloat(origSpeedStr);
    document.getElementById('rotationSpeed').value = 0;
    
    // 依使用者設的速度推算需要多久
    let recSpeed = origSpeed > 0 ? origSpeed : 4; 
    const durationSec = currentTab === 'shaker' ? 4.5 : ((Math.PI * 2) / (recSpeed * 0.6));
    
    // 以 20 fps 為基準決定張數（搖搖樂是 4.5 秒 × 20fps = 90 張）
    const totalFrames = currentTab === 'shaker' ? 90 : Math.round(durationSec * 20); 
    const frameDelay = 50; // 固定間隔（50ms = 20 FPS）

    showLoading(T("busy.apngCapture", totalFrames));
    
    const isTrans = document.getElementById('bgTransparent').checked;
    
    const frames = []; const delays = [];
    const tempCanvas = document.createElement('canvas'); tempCanvas.width = CANVAS_SIZE; tempCanvas.height = CANVAS_SIZE;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

    for(let frame = 0; frame < totalFrames; frame++) {
        
        let p = frame / totalFrames;
        if(currentTab === 'shaker') {
            // 換上自訂的等待動畫
            pivotContainer.rotation.z = getShakerAngle(p);
        } else {
            pivotContainer.rotation.y = p * Math.PI * 2;
        }
        
        if (pivotContainer) pivotContainer.updateMatrixWorld(true);
        if (pivotContainer && pivotContainer.userData.mode === 'separate' && pivotContainer.userData.backGroup) {
            const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
            const centerPos = new THREE.Vector3(); pivotContainer.getWorldPosition(centerPos);
            const viewVec = camPos.sub(centerPos).normalize();
            const fwdVec = new THREE.Vector3(0,0,1).applyQuaternion(pivotContainer.quaternion);
            if (fwdVec.dot(viewVec) >= 0) { pivotContainer.userData.frontGroup.visible = true; pivotContainer.userData.backGroup.visible = false; }
            else { pivotContainer.userData.frontGroup.visible = false; pivotContainer.userData.backGroup.visible = true; }
        }

        if (isTrans) renderer.setClearColor(0x000000, 0);
        renderer.clear(); renderer.render(scene, camera); renderer.clearDepth(); renderer.render(uiScene, uiCamera);
        
        tempCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE); tempCtx.drawImage(canvasEl, 0, 0);
        frames.push(tempCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data.buffer);
        delays.push(frameDelay);
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    loadingText.innerHTML = T("busy.apngEncode");
    setTimeout(() => {
        try {
            const apngBuffer = UPNG.encode(frames, CANVAS_SIZE, CANVAS_SIZE, 0, delays);
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([apngBuffer], { type: 'image/apng' })); a.download = 'acrylic-animated.png'; a.click();
        } catch (err) { alert(T("err.apng")); }
        if (pivotContainer) { pivotContainer.rotation.y = 0; pivotContainer.rotation.z = 0; }
        document.getElementById('rotationSpeed').value = origSpeedStr; updateBackground(); hideLoading();
    }, 100);
});

document.getElementById('btnExportGIF').addEventListener('click', () => {
    if (!pivotContainer) return;

    const origSpeedStr = document.getElementById('rotationSpeed').value;
    const origSpeed = parseFloat(origSpeedStr);
    document.getElementById('rotationSpeed').value = 0;
    
    let recSpeed = origSpeed > 0 ? origSpeed : 4; 
    const durationSec = currentTab === 'shaker' ? 4.5 : ((Math.PI * 2) / (recSpeed * 0.6));
    const totalFrames = currentTab === 'shaker' ? 90 : Math.round(durationSec * 20); 
    const frameDelay = 50; 

    showLoading(T("busy.gif"));
    
    const isTrans = document.getElementById('bgTransparent').checked;
    const workerBlob = new Blob([`importScripts('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');`], {type:'application/javascript'});
    const workerUrl = URL.createObjectURL(workerBlob);
    const gifOpt = {workers:2, quality:10, width:CANVAS_SIZE, height:CANVAS_SIZE, workerScript:workerUrl};
    if(isTrans) gifOpt.transparent = 0xFF00FF;
    const gif = new GIF(gifOpt);
    
    let frame = 0;
    
    function addFrame() {
        if(frame < totalFrames) { 
            let p = frame / totalFrames;
            
            if(currentTab === 'shaker') {
                // 換上自訂的等待動畫
                pivotContainer.rotation.z = getShakerAngle(p);
            } else {
                pivotContainer.rotation.y = p * Math.PI * 2;
            }
            
            if (pivotContainer) pivotContainer.updateMatrixWorld(true);
            if (pivotContainer && pivotContainer.userData.mode === 'separate' && pivotContainer.userData.backGroup) {
                const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
                const centerPos = new THREE.Vector3(); pivotContainer.getWorldPosition(centerPos);
                const viewVec = camPos.sub(centerPos).normalize();
                const fwdVec = new THREE.Vector3(0,0,1).applyQuaternion(pivotContainer.quaternion);
                if (fwdVec.dot(viewVec) >= 0) { pivotContainer.userData.frontGroup.visible = true; pivotContainer.userData.backGroup.visible = false; }
                else { pivotContainer.userData.frontGroup.visible = false; pivotContainer.userData.backGroup.visible = true; }
            }

            if(isTrans) { renderer.setClearColor(0xFF00FF,1); scene.background=new THREE.Color(0xFF00FF); }
            renderer.clear(); renderer.render(scene, camera); renderer.clearDepth(); renderer.render(uiScene, uiCamera);
            
            gif.addFrame(renderer.domElement, {copy:true, delay: frameDelay});
            frame++; requestAnimationFrame(addFrame);
        } else {
            loadingText.textContent = T("busy.gifEncode"); 
            updateBackground(); 
            gif.render();
        }
    }
    gif.on('finished', blob => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='acrylic-animated.gif'; a.click();
        if (pivotContainer) { pivotContainer.rotation.y = 0; pivotContainer.rotation.z = 0; }
        document.getElementById('rotationSpeed').value = origSpeedStr; hideLoading();
    });
    addFrame();
});

document.getElementById('btnExportGLTF').addEventListener('click', () => {
    if (!pivotContainer) return;
    showLoading(T("busy.glb"));
    new THREE.GLTFExporter().parse(pivotContainer, gltf => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([gltf], {type:'application/octet-stream'})); a.download='acrylic-goods.glb'; a.click(); hideLoading();
    }, { binary: true });
});

// --- 授權對話框 ---
const licenseModal = document.getElementById('licenseModal');
document.getElementById('btnLicenseInfo').addEventListener('click', () => licenseModal.classList.add('show'));
document.getElementById('btnCloseModal').addEventListener('click', () => licenseModal.classList.remove('show'));
licenseModal.addEventListener('click', e => { if (e.target === licenseModal) licenseModal.classList.remove('show'); });

/* 切語言：固定文字由引擎處理；兩份動態清單與畫布上的浮水印是程式畫出來的，
 * 所以一併重跑。3D 場景本身不含文字，不用重建。 */
I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => {
    renderShakerPartsUI();
    renderDioramaLayersUI();
    updateBackground();
});
