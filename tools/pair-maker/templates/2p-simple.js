export const templateId = '2p-simple';
export const author = '@baegop157902';
export const size = {
    width: 1920,
    height: 1080
};
export const fonts = [
    /* TRPG Toolkit 合輯：上游的清單只有韓／英／日字型，繁中會掉回系統預設。
     * 這裡補上合輯其餘工具也在用的五套繁中網頁字型（見 editor.html 的 css2 連結）。 */
    'Noto Sans TC',
    'Noto Serif TC',
    'LXGW WenKai TC',
    'Chocolate Classical Sans',
    'Cactus Classical Serif',
    'Pretendard',
    'Apple SD Gothic Neo',
    'Black Han Sans',
    'Song Myung',
    'Cafe24 PRO UP',
    'Grandiflora One',
    'Tektur',
    'Lilita One',
    'GOFIRE',
    'Top Speed',
    'Orandakan Kana',
    'Iansui',
    'Dela Gothic One',
    'Kaisei Decol'
];

/* 下面幾個常數含 T()，寫成值就會凍在載入當下的語言；消費端本來就吃函式，
 * 所以一律改成箭頭函式，切語言時才會重新求值。 */
export const groups = () => [
    ['profile', T("simple.001")],
    ['name', T("simple.002")],
    ['LD', T("simple.003")],
    ['SD', T("simple.004")],
    ['description', T("simple.005")],
    ['colors', T("simple.006")],
    ['add-1', T("simple.007")],
    ['add-2', T("simple.008")],
    ['add-3', T("simple.009")],
    ['flat', T("simple.010")]
];

export const positions = {
    'left-LD-image': {
        x: 0,
        y: 0,
        width: 336,
        height: 1080
    },
    'right-LD-image': {
        x: 1584,
        y: 0,
        width: 336,
        height: 1080
    },
    'left-profile-image': {
        x: 285,
        y: 45,
        width: 194,
        height: 194
    },
    'right-profile-image': {
        x: 1440,
        y: 45,
        width: 194,
        height: 194
    },
    'left-SD-image': {
        x: 657,
        y: 216,
        width: 244,
        height: 338
    },
    'right-SD-image': {
        x: 1023,
        y: 216,
        width: 244,
        height: 338
    },
    'left-add-1': {
        x: 290,
        y: 712,
        width: 199,
        height: 199
    },
    'left-add-2': {
        x: 510,
        y: 712,
        width: 199,
        height: 199
    },
    'left-add-3': {
        x: 730,
        y: 712,
        width: 199,
        height: 199
    },
    'right-add-1': {
        x: 994,
        y: 712,
        width: 199,
        height: 199
    },
    'right-add-2': {
        x: 1213,
        y: 712,
        width: 199,
        height: 199
    },
    'right-add-3': {
        x: 1432,
        y: 712,
        width: 199,
        height: 199
    }
};

export function imageId(side, group) {
    return group.startsWith('add-') ? `${side}-${group}` : `${side}-${group}-image`;
}

export function fields(side, group) {
    const field = (key, label, type = 'text') => ({
        id: `${side}-${key}`,
        label,
        type
    });
    switch (group) {
        case 'profile':
        case 'add-1':
        case 'add-2':
        case 'add-3':
            return [
                field(`${group}-background-enabled`, T("simple.011"), 'checkbox'),
                { ...field(`${group}-background-color`, T("simple.012"), 'color'),
                    visibleWhen: `${side}-${group}-background-enabled` }
            ];
        case 'name':
            return [field('korea-name', T("simple.013")), field('korea-name-color', T("simple.014"), 'color'), field('etc-name', T("simple.015")), field('etc-name-color', T("simple.016"), 'color'), field('sub-font', T("simple.017"), 'font'), field('small-check', T("simple.018"), 'checkbox')];
        case 'description':
            return [field('clothes', T("simple.019"), 'textarea'), field('charac', T("simple.020"), 'textarea'), field('cm', T("simple.021")), field('animal', T("simple.022"))];
        case 'colors':
            return [field('hair', T("simple.023"), 'color'), field('left-eyes', T("simple.024"), 'color'), field('right-eyes', T("simple.025"), 'color')];
        case 'flat':
            return [field('flat', T("simple.010"), 'textarea'), field('flat-back-color', T("simple.026"), 'color'), field('flat-text-color', T("simple.027"), 'color')];
        default:
            return [];
    }
}

export function initialState(id = templateId) {
    const values = {};
    for (const side of ['left', 'right']) {
        for (const group of ['profile', 'add-1', 'add-2', 'add-3']) {
            values[`${side}-${group}-background-enabled`] = false;
            values[`${side}-${group}-background-color`] = '#ffffff';
        }
        Object.assign(values, {
            [`${side}-LD-image-citation`]: '',
            [`${side}-profile-image-citation`]: '',
            [`${side}-SD-image-citation`]: '',
            [`${side}-add-1-citation`]: '',
            [`${side}-add-2-citation`]: '',
            [`${side}-add-3-citation`]: '',

            [`${side}-korea-name`]: T("simple.013"),
            [`${side}-etc-name`]: 'Name',
            [`${side}-sub-font`]: 'Pretendard',
            [`${side}-small-check`]: false,
            [`${side}-korea-name-color`]: '#323232',
            [`${side}-etc-name-color`]: '#323232',
            [`${side}-clothes`]: T("simple.028"),
            [`${side}-charac`]: T("simple.028"),
            [`${side}-cm`]: '',
            [`${side}-animal`]: '',
            [`${side}-hair`]: '#323232',
            [`${side}-left-eyes`]: '#323232',
            [`${side}-right-eyes`]: '#323232',
            [`${side}-flat`]: T("simple.028"),
            [`${side}-flat-back-color`]: '#323232',
            [`${side}-flat-text-color`]: '#ffffff'
        });
    }
    return {
        schemaVersion: 1,
        templateId: id,
        values,
        touched: {},
        images: {},
        stickers: []
    };
}

export function createPairScene(stage, openEditor) {
    const K = window.Konva;
    const layer = new K.Layer();
    stage.add(layer);
    const bg = new K.Rect({
        ...size,
        fill: '#F6F6F6'
    });
    layer.add(bg);
    const ld = new K.Group(),
        gradients = new K.Group({
            listening: false
        }),
        boxes = new K.Group(),
        content = new K.Group();
    layer.add(ld, gradients, boxes, content);
    const imageNodes = new Map(),
        textBindings = [],
        nameSizeBindings = [],
        colorBindings = [];
    let currentValues = initialState().values;
    function updateBackground(id, item) {
        const side = id.startsWith('left-') ? 'left' : 'right';
        const group = id.slice(side.length + 1).replace(/-image$/, '');
        const supported = ['profile', 'add-1', 'add-2', 'add-3'].includes(group);
        const hasImage = !!item.image.image();
        const fill = !hasImage ? '#323232' : supported && currentValues[`${side}-${group}-background-enabled`]
            ? currentValues[`${side}-${group}-background-color`] : supported ? 'rgba(0,0,0,0)' : null;
        item.rect.fill(fill);
    }
    const shadow = {
        shadowColor: '#231705',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0
        },
        shadowOpacity: 0.26
    };

    function clickable(node, side, group) {
        node.on('click tap', e => {
            e.cancelBubble = true;
            openEditor(side, group, node);
        });
        node.on('mouseenter', () => {
            stage.container().style.cursor = 'pointer';
        });
        node.on('mouseleave', () => {
            stage.container().style.cursor = '';
        });
    }

    function addImage(id, parent) {
        const p = positions[id],
            round = id.includes('profile') ? p.width / 2 : id.includes('add') ? 10 : 0;
        const group = new K.Group({
            x: p.x,
            y: p.y
        });
        const rect = new K.Rect({
            width: p.width,
            height: p.height,
            fill: '#323232',
            cornerRadius: round,
            ...(round ? shadow : {})
        });
        const clip = new K.Group({
            clipFunc(ctx) {
                ctx.beginPath();
                ctx.roundRect(0, 0, p.width, p.height, round);
                ctx.closePath();
            }
        });
        const image = new K.Image({
            width: p.width,
            height: p.height,
            listening: false
        });
        clip.add(image);
        const plus = new K.Text({
            text: '+',
            width: p.width,
            height: p.height,
            align: 'center',
            verticalAlign: 'middle',
            fill: '#fff',
            fontSize: 28,
            listening: false
        });

        const citationText = new K.Text({
            width: p.width,
            y: p.height - 20, // 字級(14) ＋ 下方留白(6) ＝ 距離底部 20px
            align: 'center',
            fontSize: 14,
            fontFamily: 'Pretendard',
            fill: '#5f5f5f',
            stroke: '#ffffff',
            strokeWidth: 2,
            fillAfterStrokeEnabled: true,
            listening: false,
            visible: false
        });

        group.add(rect, clip, plus, citationText);
        parent.add(group);
        const side = id.startsWith('left') ? 'left' : 'right';
        const key = id.slice(side.length + 1).replace(/-image$/, '');
        clickable(group, side, key);
        imageNodes.set(id, {
            image,
            plus,
            rect,
            p,
            citationText
        });
    }
    addImage('left-LD-image', ld);
    addImage('right-LD-image', ld);
    gradients.add(new K.Line({
        points: [962, 190, 962, 1035],
        stroke: '#9A9A9A',
        strokeWidth: 1,
        dash: [14, 12]
    }));
    gradients.add(new K.Rect({
        x: 0,
        y: 0,
        width: 340,
        height: 1080,
        fillLinearGradientStartPoint: {
            x: 0,
            y: 0
        },
        fillLinearGradientEndPoint: {
            x: 340,
            y: 0
        },
        fillLinearGradientColorStops: [0.8, 'rgba(246,246,246,0)', 1, 'rgba(246,246,246,1)']
    }));
    gradients.add(new K.Rect({
        x: 1580,
        y: 0,
        width: 340,
        height: 1080,
        fillLinearGradientStartPoint: {
            x: 0,
            y: 0
        },
        fillLinearGradientEndPoint: {
            x: 340,
            y: 0
        },
        fillLinearGradientColorStops: [0, 'rgba(246,246,246,1)', 0.2, 'rgba(246,246,246,0)']
    }));
    for (const [side, x] of [
            ['left', 290],
            ['right', 994]
        ]) {
        boxes.add(new K.Rect({
            x,
            y: 186,
            width: 640,
            height: 480,
            fill: '#fff',
            cornerRadius: 10,
            ...shadow
        }));
        const flat = new K.Rect({
            x,
            y: 932,
            width: 640,
            height: 103,
            fill: '#323232',
            cornerRadius: 10,
            ...shadow
        });
        boxes.add(flat);
        clickable(flat, side, 'flat');
        colorBindings.push([flat, `${side}-flat-back-color`]);
    }
    Object.keys(positions).filter(id => !id.includes('-LD-')).forEach(id => addImage(id, content));

    function text(attrs, binding, side, group) {
        const node = new K.Text({
            fontFamily: 'Pretendard',
            fill: '#323232',
            fontSize: 18,
            ...attrs
        });
        content.add(node);
        if (binding) textBindings.push([node, binding]);
        if (side) clickable(node, side, group);
        return node;
    }
    for (const side of ['left', 'right']) {
        const left = side === 'left',
            x = left ? 500 : 994,
            align = left ? 'left' : 'right';
        const nameText = text({
            x,
            y: 80,
            width: 424,
            fontSize: 32,
            fontStyle: '600',
            wrap: 'none',
            align
        }, {
            text: `${side}-korea-name`,
            color: `${side}-korea-name-color`
        }, side, 'name');
        const catchphraseText = text({
            x,
            y: 122,
            width: 430,
            fontSize: 48,
            fontStyle: '800',
            wrap: 'none',
            verticalAlign: 'middle',
            align
        }, {
            text: `${side}-etc-name`,
            color: `${side}-etc-name-color`,
            font: `${side}-sub-font`
        }, side, 'name');
        nameSizeBindings.push({side, nameText, catchphraseText});
        text({
            x: left ? 333 : 1516,
            y: 269,
            text: T("simple.019"),
            fontSize: 20,
            fontStyle: '700'
        }, null, side, 'description');
        text({
            x: left ? 333 : 1516,
            y: 370,
            text: T("simple.020"),
            fontSize: 20,
            fontStyle: '700'
        }, null, side, 'description');
        text({
            x: left ? 333 : 1278,
            y: 296,
            width: 308,
            height: 52,
            align,
            wrap: 'char',
            lineHeight: 1.4
        }, {
            text: `${side}-clothes`
        }, side, 'description');
        text({
            x: left ? 333 : 1278,
            y: 398,
            width: 308,
            height: 150,
            align,
            wrap: 'char',
            lineHeight: 1.4
        }, {
            text: `${side}-charac`
        }, side, 'description');
        text({
            x: left ? 657 : 1023,
            y: 581,
            width: 244,
            align: 'center',
            fontSize: 20,
            fill: '#7B7B7B'
        }, {
            text: `${side}-cm`,
            suffix: ' cm'
        }, side, 'description');
        text({
            x: left ? 657 : 1023,
            y: 612,
            width: 244,
            align: 'center',
            fontSize: 20,
            fill: '#7B7B7B'
        }, {
            text: `${side}-animal`,
            suffix: T("simple.029")
        }, side, 'description');
        text({
            x: left ? 336 : 1344,
            y: 550,
            text: 'HAIR',
            fontSize: 20,
            fontStyle: '700'
        }, null, side, 'colors');
        text({
            x: left ? 492 : 1500,
            y: 550,
            text: 'EYES',
            fontSize: 20,
            fontStyle: '700'
        }, null, side, 'colors');
        for (const [key, cx] of [
                ['hair', left ? 333 : 1341],
                ['left-eyes', left ? 456 : 1464],
                ['right-eyes', left ? 526 : 1534]
            ]) {
            const node = new K.Rect({
                x: cx,
                y: 582,
                width: 52,
                height: 52,
                fill: '#323232',
                cornerRadius: 10,
                ...shadow,
                shadowBlur: 4,
                shadowOpacity: 0.2
            });
            content.add(node);
            colorBindings.push([node, `${side}-${key}`]);
            clickable(node, side, 'colors');
        }
        text({
            x: left ? 290 : 994,
            y: 932,
            width: 640,
            height: 103,
            align: 'center',
            verticalAlign: 'middle',
            fontSize: 21,
            wrap: 'char',
            lineHeight: 1.5
        }, {
            text: `${side}-flat`,
            color: `${side}-flat-text-color`
        }, side, 'flat');
    }
    return {
        layer,
        updateValues(values) {
            currentValues = values;
            for (const [id, item] of imageNodes) {
                updateBackground(id, item);
                
                if (item.citationText) {
                    const textVal = values[`${id}-citation`];
                    const hasImg = !!item.image.image();
                    if (hasImg && textVal && textVal.trim() !== '') {
                        item.citationText.text('ⓒ ' + textVal);
                        item.citationText.visible(true);
                    } else {
                        item.citationText.visible(false);
                    }
                }
            }
            for (const [node, b] of textBindings) {
                node.text(values[b.text] + (b.suffix || ''));
                if (b.color) node.fill(values[b.color]);
                if (b.font) node.fontFamily(values[b.font]);
            }
            for (const [node, key] of colorBindings) node.fill(values[key]);
            for (const {side, nameText, catchphraseText} of nameSizeBindings) {
                const small = values[`${side}-small-check`] === true;
                nameText.setAttrs({y: small ? 100 : 80, fontSize: small ? 24 : 32});
                catchphraseText.setAttrs({y: small ? 136 : 122, fontSize: small ? 28 : 48});
            }
            layer.batchDraw();
        },
        updateImage(id, img) {
            const item = imageNodes.get(id);
            if (!item) return;
            item.image.image(img || null);
            item.plus.visible(!img);
            updateBackground(id, item);

            if (img) {
                const r = Math.max(item.p.width / img.naturalWidth, item.p.height / img.naturalHeight);
                const w = item.p.width / r,
                    h = item.p.height / r;
                item.image.crop({
                    x: (img.naturalWidth - w) / 2,
                    y: (img.naturalHeight - h) / 2,
                    width: w,
                    height: h
                });
            }
            
            if (item.citationText) {
                const textVal = currentValues[`${id}-citation`];
                item.citationText.visible(!!img && !!textVal && textVal.trim() !== '');
            }
            layer.batchDraw();
        }
    };
}


export const fontLabels = () => ({
    'Noto Sans TC': T("simple.030"),
    'Noto Serif TC': T("simple.031"),
    'LXGW WenKai TC': T("simple.032"),
    'Chocolate Classical Sans': T("simple.033"),
    'Cactus Classical Serif': T("simple.034"),
    'Pretendard': T("simple.035"),
    'Apple SD Gothic Neo': T("simple.036"),
    'Black Han Sans': T("simple.037"),
    'Song Myung': T("simple.038"),
    'Cafe24 PRO UP': T("simple.039"),
    'Grandiflora One': T("simple.040"),
    'Tektur': T("simple.041"),
    'Lilita One': T("simple.042"),
    'GOFIRE': T("simple.043"),
    'Top Speed': T("simple.044"),
    'Orandakan Kana': T("simple.045"),
    'Iansui': T("simple.046"),
    'Dela Gothic One': T("simple.047"),
    'Kaisei Decol': T("simple.048")
});

export const tabs = () => [{
        id: 'left',
        label: T("simple.049"),
        heading: T("simple.050")
    },
    {
        id: 'right',
        label: T("simple.051"),
        heading: T("simple.052")
    },
    {
        id: 'stickers',
        label: T("state.018"),
        type: 'stickers'
    },
];
export function imageField(side, group) {
    const id = imageId(side, group);
    if (!positions[id]) return null;
    return {
        id,
        ...positions[id],
        round: group === 'profile',
        className: group === 'LD' ? 'image-upload-ld' : ''
    };
}
export function fontSample(side, group) {
    return group === 'name' ? {
        textId: `${side}-etc-name`,
        fontId: `${side}-sub-font`
    } : null;
}
export default {
    templateId,
    author,
    size,
    fonts,
    fontLabels,
    tabs,
    groups,
    fields,
    positions,
    imageField,
    fontSample,
    initialState,
    createScene: createPairScene
};
