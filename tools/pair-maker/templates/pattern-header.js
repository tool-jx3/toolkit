export const templateId = 'pattern-header';
export const author = '@baegop157902';
export const size = {
    width: 1500,
    height: 500
};

/* 下面幾個常數含 T()，寫成值就會凍在載入當下的語言；消費端本來就吃函式，
 * 所以一律改成箭頭函式，切語言時才會重新求值。 */
export const tabs = () => [
    { id: 'common', label: T("header.001"), heading: T("header.001") },
    { id: 'stickers', label: T("state.018"), type: 'stickers' }
];

export const groups = () => [
    ['pattern', T("header.002")],
    ['img', T("pair1.014")]
];

export const positions = {
    'common-img-image': {
        x: 0,
        y: 0
    }
};

export function imageId(side, group) {
    return `${side}-${group}-image`;
}

export function fields(side, group) {
    const field = (key, label, type = 'text') => ({
        id: `${side}-${key}`,
        label,
        type
    });

    if (group === 'pattern') {
        return [
            {
                ...field('pattern-mode', T("header.003"), 'radio'),
                options: [
                    { value: 'tile1', label: T("header.004") },
                    { value: 'tile2', label: T("header.005") },
                    { value: 'solid', label: T("header.006") }
                ]
            },
            { ...field('tile1-color1', T("header.007"), 'color'), visibleWhen: { id: `${side}-pattern-mode`, value: 'tile1' } },
            { ...field('tile1-color2', T("header.008"), 'color'), visibleWhen: { id: `${side}-pattern-mode`, value: 'tile1' } },
            
            { ...field('tile2-thick-color', T("header.009"), 'color'), visibleWhen: { id: `${side}-pattern-mode`, value: 'tile2' } },
            { ...field('tile2-thin-color', T("header.010"), 'color'), visibleWhen: { id: `${side}-pattern-mode`, value: 'tile2' } },
            
            { ...field('pattern-scale', T("header.011"), 'number'), min: 0, max: 200, visibleWhen: {id: `${side}-pattern-mode`, notValue: 'solid'} },
            { ...field('pattern-rotation', T("header.012"), 'number'), min: -180, max: 180, visibleWhen: {id: `${side}-pattern-mode`, notValue: 'solid'} },
            { ...field('pattern-opacity', T("header.013"), 'number'), min: 0, max: 100, visibleWhen: {id: `${side}-pattern-mode`, notValue: 'solid'} },
            
            {...field('pattern-blur', T("header.014"), 'checkbox'), visibleWhen: {id: `${side}-pattern-mode`, notValue: 'solid'}},
            field('pattern-bg-color', T("header.015"), 'color')
        ];
    }

    if (group === 'img') {
        return [
            field('img-is-pattern', T("header.002"), 'checkbox'), // 最上方的圖樣開關
            { ...field('img-scale', T("header.016"), 'number'), min: 0, max: 200 },
            { ...field('img-x', T("header.017"), 'number'), min: 0, max: 100 }, // 位置滑桿
            { ...field('img-y', T("header.018"), 'number'), min: 0, max: 100 }, // 位置滑桿
            { ...field('img-rotation', T("header.019"), 'number'), min: -180, max: 180 },
            { ...field('img-opacity', T("header.020"), 'number'), min: 0, max: 100 },
            field('img-blur', T("header.021"), 'checkbox')
        ];
    }
    
    return [];
}

export function initialState(id = templateId) {
    const values = {
        'common-pattern-mode': 'tile1',
        'common-tile1-color1': '#ffffff',
        'common-tile1-color2': '#d1c2fa',
        'common-tile2-thick-color': '#83c76f',
        'common-tile2-thin-color': '#9cf1c2',
        'common-pattern-scale': 100,
        'common-pattern-rotation': 45,
        'common-pattern-opacity': 70,
        'common-pattern-blur': false,
        'common-pattern-bg-color': '#ffffff',
        
        'common-img-is-pattern': true, 
        'common-img-scale': 100,
        'common-img-x': 50,
        'common-img-y': 50,
        'common-img-rotation': 0,
        'common-img-opacity': 100,
        'common-img-blur': false,

        'common-img-image-citation': ''
    };

    return {
        schemaVersion: 1,
        templateId: id,
        values,
        touched: {},
        images: {},
        stickers: []
    };
}

export const formOptions = {desktopCategories: true, panelClass: 'is-pattern-editor', preservePanelPosition: true};

export function createScene(stage, openEditor) {
    const K = window.Konva;
    const layer = new K.Layer();
    stage.add(layer);


    let currentValues = initialState().values;

    const bgRect = new K.Rect({ ...size, fill: '#ffffff' });
    
    const patternRect = new K.Rect({
        ...size,
        fillPatternRepeat: 'repeat',
        fillPatternOffsetX: size.width / 2,
        fillPatternOffsetY: size.height / 2,
        x: size.width / 2,
        y: size.height / 2,
        offset: { x: size.width / 2, y: size.height / 2 }
    });

    const silhouetteRect = new K.Rect({
        ...size,
        fillPatternRepeat: 'repeat',
        fillPatternOffsetX: size.width / 2,
        fillPatternOffsetY: size.height / 2,
        x: size.width / 2,
        y: size.height / 2,
        offset: { x: size.width / 2, y: size.height / 2 },
        listening: false
    });

    const imgRect = new K.Rect({
        ...size,
        fillPatternRepeat: 'repeat',
        fillPatternOffsetX: size.width / 2,
        fillPatternOffsetY: size.height / 2,
        x: size.width / 2,
        y: size.height / 2,
        offset: { x: size.width / 2, y: size.height / 2 },
        listening: false
    });

    const imgCitationNode = new K.Text({
        width: size.width,
        y: size.height - 20,
        align: 'center',
        fontSize: 14,
        fontFamily: 'Pretendard',
        fill: '#5f5f5f', // 灰色文字
        stroke: '#ffffff',
        strokeWidth: 2,
        fillAfterStrokeEnabled: true,
        listening: false,
        visible: false
    });

    layer.add(bgRect, patternRect, silhouetteRect, imgRect, imgCitationNode);

    function createWhiteSilhouette(img) {
        if (!img) return null;
        const cvs = document.createElement('canvas');
        cvs.width = img.naturalWidth;
        cvs.height = img.naturalHeight;
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        return cvs;
    }

    function generateTile1(color1, color2) {
        const cvs = document.createElement('canvas');
        cvs.width = 80; cvs.height = 80;
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = color1; ctx.fillRect(0, 0, 80, 80);
        ctx.fillStyle = color2; ctx.globalAlpha = 0.5;
        ctx.fillRect(0, 0, 40, 80); ctx.fillRect(0, 0, 80, 40);
        return cvs;
    }

    function generateTile2(thickColor, thinColor) {
        const cvs = document.createElement('canvas');
        cvs.width = 120; cvs.height = 120;
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = thickColor; ctx.globalAlpha = 0.4;
        ctx.fillRect(15, 0, 25, 120); ctx.fillRect(0, 18, 120, 28);
        ctx.globalAlpha = 1.0; ctx.strokeStyle = thinColor; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(90, 0); ctx.lineTo(90, 120); ctx.moveTo(0, 90); ctx.lineTo(120, 90); ctx.stroke();
        return cvs;
    }

    let lastPattern = '', lastImage = '', imageRevision = 0, tileKey = '', tile = null;

    function applyProperties() {
        const pMode = currentValues['common-pattern-mode'];
        const pScale = currentValues['common-pattern-scale'] / 100;
        const pRotation = currentValues['common-pattern-rotation'];
        const pOpacity = currentValues['common-pattern-opacity'] / 100;
        const pBlur = currentValues['common-pattern-blur'];
        
        const iScale = currentValues['common-img-scale'] / 100;
        const iRotation = currentValues['common-img-rotation'];
        const iOpacity = currentValues['common-img-opacity'] / 100;
        const iBlur = currentValues['common-img-blur'];
        
        bgRect.fill(currentValues['common-pattern-bg-color']);
        
        const patternKey = JSON.stringify([pMode,pScale,pRotation,pOpacity,pBlur,
            currentValues['common-tile1-color1'],currentValues['common-tile1-color2'],
            currentValues['common-tile2-thick-color'],currentValues['common-tile2-thin-color']]);
        if(patternKey !== lastPattern){
        lastPattern = patternKey;
        patternRect.clearCache();
        patternRect.opacity(pOpacity);
        patternRect.fillPatternRotation(pRotation);
        patternRect.fillPatternScale({ x: pScale, y: pScale });

        const colors = pMode === 'tile1' ? [currentValues['common-tile1-color1'],currentValues['common-tile1-color2']]
            : [currentValues['common-tile2-thick-color'],currentValues['common-tile2-thin-color']];
        const nextTileKey = JSON.stringify([pMode,...colors]);
        if(nextTileKey !== tileKey){tileKey=nextTileKey;tile=pMode==='tile1'?generateTile1(...colors):pMode==='tile2'?generateTile2(...colors):null;}
        patternRect.fillPatternImage(tile);
        patternRect.visible(pMode !== 'solid' && pScale > 0);

        // 圖樣模糊
        if (pBlur && pMode !== 'solid') {
            patternRect.filters([K.Filters.Blur]);
            patternRect.blurRadius(10);
            patternRect.cache();
        } else {
            patternRect.filters([]);
        }

        }
        const imageKey = JSON.stringify([imageRevision,iScale,iRotation,iOpacity,iBlur,
            currentValues['common-img-is-pattern'],currentValues['common-img-x'],currentValues['common-img-y']]);
        if(imageKey !== lastImage){
        lastImage = imageKey;
        imgRect.visible(iScale > 0);silhouetteRect.visible(iScale > 0);
        imgRect.clearCache();
        silhouetteRect.clearCache();

        const iIsPattern = currentValues['common-img-is-pattern'] ?? true;
        const iX = currentValues['common-img-x'] ?? 50; 
        const iY = currentValues['common-img-y'] ?? 50;

        imgRect.opacity(iOpacity);
        imgRect.fillPatternRotation(iRotation);
        imgRect.fillPatternScale({ x: iScale, y: iScale });

        silhouetteRect.fillPatternRotation(iRotation);
        silhouetteRect.fillPatternScale({ x: iScale, y: iScale });
        
        const img = imgRect.fillPatternImage();
        if (img) {
            // 🔥 依圖樣勾選與否決定要不要重複鋪排(repeat)
            const repeatMode = iIsPattern ? 'repeat' : 'no-repeat';
            imgRect.fillPatternRepeat(repeatMode);
            silhouetteRect.fillPatternRepeat(repeatMode);

            // 縮放值很小時會跑出畫面，這是防呆
            const safeScale = iScale || 0.01;
            
            // 鋪排模式的預設 offset 是畫布中心；單張圖時則把圖的中心對到畫布中央
            const baseOffsetX = iIsPattern ? size.width / 2 : (img.width / 2 - (size.width / 2) / safeScale);
            const baseOffsetY = iIsPattern ? size.height / 2 : (img.height / 2 - (size.height / 2) / safeScale);

            // 算滑桿的位移量（以 50 為基準往兩側移動，依縮放比例維持一致的手感）
            const moveX = (50 - iX) * (size.width / 50) / safeScale;
            const moveY = (50 - iY) * (size.height / 50) / safeScale;

            // 套用最終位置
            imgRect.fillPatternOffsetX(baseOffsetX + moveX);
            imgRect.fillPatternOffsetY(baseOffsetY + moveY);
            
            silhouetteRect.fillPatternOffsetX(baseOffsetX + moveX);
            silhouetteRect.fillPatternOffsetY(baseOffsetY + moveY);
        }
        
        //
        if (iBlur && imgRect.fillPatternImage()) {
            imgRect.filters([K.Filters.Blur]);
            imgRect.blurRadius(5);
            imgRect.cache();
            
            silhouetteRect.filters([K.Filters.Blur]);
            silhouetteRect.blurRadius(5);
            silhouetteRect.cache();
        } else {
            imgRect.filters([]);
            silhouetteRect.filters([]);
        }

        }
        const citationText = currentValues['common-img-image-citation'];
        if (imgRect.fillPatternImage() && citationText && citationText.trim() !== '') {
            imgCitationNode.text('ⓒ ' + citationText);
            imgCitationNode.visible(true);
            imgCitationNode.moveToTop(); // 移到最上層，免得被其他元素蓋住
        } else {
            imgCitationNode.visible(false);
        }
        
        layer.batchDraw();


    }

    applyProperties();

    imgRect.on('click tap', e => { e.cancelBubble = true; openEditor('common', 'img', imgRect); });
    bgRect.on('click tap', e => { e.cancelBubble = true; openEditor('common', 'pattern', bgRect); });
    patternRect.on('click tap', e => { e.cancelBubble = true; openEditor('common', 'pattern', patternRect); });

    [bgRect, patternRect].forEach(node => {
        node.on('mouseenter', () => { stage.container().style.cursor = 'pointer'; });
        node.on('mouseleave', () => { stage.container().style.cursor = ''; });
    });

    return {
        layer,
        updateValues(values) {
            currentValues = values;
            applyProperties();
        },
        updateImage(id, img) {
            if (id === 'common-img-image') {
                imageRevision++;
                if (img) {
                    imgRect.fillPatternImage(img);
                    silhouetteRect.fillPatternImage(createWhiteSilhouette(img));
                    imgRect.listening(true);
                } else {
                    imgRect.fillPatternImage(null);
                    silhouetteRect.fillPatternImage(null);
                    imgRect.listening(false);
                }
                applyProperties();
                layer.batchDraw();
            }
        }
    };
}

export function imageField(side, group) {
    if (group !== 'img') return null; 
    return {
        id: 'common-img-image',
        ...positions['common-img-image'],
        width: undefined,
        height: undefined,
        aspectRatio: 0,
        freeCrop: true, 
        className: 'custom-img-upload',
        placement: 'beforeFields' 
    };
}

export default {
    templateId,
    formOptions,
    author,
    size,
    tabs,
    groups,
    fields,
    positions,
    imageField,
    initialState,
    createScene
};