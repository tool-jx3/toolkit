        const canvas = document.getElementById('output-canvas');
        const ctx = canvas.getContext('2d');
        const messageInput = document.getElementById('message-input');
        const btnGenerate = document.getElementById('btn-generate');
        const btnPng = document.getElementById('btn-png');
        const btnJpg = document.getElementById('btn-jpg');
        const btnCopy = document.getElementById('btn-copy');
        const btnCopyHtml = document.getElementById('btn-copy-html');
        const btnCopyRoll20 = document.getElementById('btn-copy-roll20');
        const btnAddFont = document.getElementById('btn-add-font');
        const btnAddColor = document.getElementById('btn-add-color');
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');

        const globalMinSizeInput = document.getElementById('global-min-size');
        const globalMaxSizeInput = document.getElementById('global-max-size');
        const canvasWidthInput = document.getElementById('canvas-width-input');
        const autoWidthCheckbox = document.getElementById('auto-width-checkbox');

        const currentFonts = [
            { name: 'Black Han Sans', checked: true },
            { name: 'Do Hyeon', checked: true },
            { name: 'DotGothic16', checked: true },
            { name: 'Jua', checked: true },
            { name: 'Permanent Marker', checked: true },
            { name: 'Rampart One', checked: true },
            { name: 'KCC-Chassam', checked: true },
            { name: 'GmarketSansMedium', checked: true },
            { name: 'MaplestoryOTFLight', checked: true },
            { name: 'UhBeeSe_hyun', checked: true },
            /* TRPG Toolkit 合輯追加的繁體中文字型。預設不勾選，讓隨機字型池
               維持與上游相同；要做中文拼貼信時自行勾起來即可。 */
            { name: 'Noto Sans TC', checked: false },
            { name: 'Noto Serif TC', checked: false },
            { name: 'LXGW WenKai TC', checked: false },
            { name: 'Chocolate Classical Sans', checked: false },
            { name: 'Cactus Classical Serif', checked: false }
        ];

        /* labelKey 對應字典中的 color.* key，於算繪時以 T() 取值，
         * 使切換語言時色彩標籤能即時更新（見檔尾 I18N.onChange）。 */
        const colorPaletteOptions = [
            { id: 'c1', labelKey: 'color.blackWhite', bg: '#000000', text: '#ffffff', checked: true },
            { id: 'c2', labelKey: 'color.whiteBlack', bg: '#ffffff', text: '#000000', checked: true },
            { id: 'c3', labelKey: 'color.redWhite', bg: '#e60012', text: '#ffffff', checked: true },
            { id: 'c4', labelKey: 'color.yellowBlack', bg: '#ffeb3b', text: '#000000', checked: true },
            { id: 'c5', labelKey: 'color.magentaWhite', bg: '#e91e63', text: '#ffffff', checked: true },
            { id: 'c6', labelKey: 'color.cyanBlack', bg: '#00bcd4', text: '#000000', checked: true },
            { id: 'c7', labelKey: 'color.grayBlack', bg: '#d3d3d3', text: '#000000', checked: true },
            { id: 'c8', labelKey: 'color.darkYellow', bg: '#222222', text: '#ffeb3b', checked: true }
        ];

        const CONFIG = {
            width: 800,
            paddingX: 40,
            paddingY: 40,
            minFontSize: 45,
            maxFontSize: 70,
            lineSpacing: 90
        };

        let layoutData = {
            width: CONFIG.width,
            height: 400,
            letters: []
        };

        function randInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        function showToast(msg) {
            toastMessage.textContent = msg;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }

        function renderColorOptions() {
            const container = document.getElementById('color-options');
            container.innerHTML = '';
            colorPaletteOptions.forEach((opt, idx) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex items-center gap-1 bg-gray-700 px-3 py-1.5 rounded-md text-sm hover:bg-gray-600 transition';

                const label = document.createElement('label');
                label.className = 'flex items-center gap-2 cursor-pointer select-none';
                label.innerHTML = `
                    <input type="checkbox" class="accent-red-500 w-4 h-4" data-idx="${idx}" ${opt.checked ? 'checked' : ''}>
                    <div class="flex shadow-sm rounded overflow-hidden border border-gray-500">
                        <span style="display:inline-block; width:16px; height:16px; background:${opt.bg};"></span>
                        <span style="display:inline-block; width:16px; height:16px; background:${opt.text};"></span>
                    </div>
                    <span class="text-gray-200">${T(opt.labelKey)}</span>
                `;
                label.querySelector('input').addEventListener('change', (e) => {
                    colorPaletteOptions[idx].checked = e.target.checked;
                });
                wrapper.appendChild(label);

                if (opt.custom) {
                    const delBtn = document.createElement('button');
                    delBtn.innerHTML = '×';
                    delBtn.title = T('action.delete');
                    delBtn.className = 'ml-1 text-gray-400 hover:text-red-500 font-bold px-1';
                    delBtn.onclick = () => {
                        colorPaletteOptions.splice(idx, 1);
                        renderColorOptions();
                    };
                    wrapper.appendChild(delBtn);
                }

                container.appendChild(wrapper);
            });
        }

        function renderFontOptions() {
            const container = document.getElementById('font-options');
            container.innerHTML = '';
            currentFonts.forEach((font, idx) => {
                const label = document.createElement('label');
                label.className = 'flex items-center gap-1.5 cursor-pointer bg-gray-700 px-2 py-1 rounded text-sm hover:bg-gray-600 transition select-none';
                label.innerHTML = `
                    <input type="checkbox" class="accent-red-500 w-3 h-3" data-idx="${idx}" ${font.checked ? 'checked' : ''}>
                    <span style="font-family: '${font.name}', sans-serif;" class="text-gray-200">${font.name}</span>
                `;
                label.querySelector('input').addEventListener('change', (e) => {
                    currentFonts[idx].checked = e.target.checked;
                });
                container.appendChild(label);
            });
        }

        function calculateLayout(text) {
            const isAutoWidth = autoWidthCheckbox.checked;
            const align = document.getElementById('text-alignment').value || 'center';
            const canvasAvailableWidth = CONFIG.width - (CONFIG.paddingX * 2);

            let activeColors = colorPaletteOptions.filter(c => c.checked);
            if (activeColors.length === 0) activeColors = [colorPaletteOptions[0]];

            let activeFonts = currentFonts.filter(f => f.checked).map(f => f.name);
            if (activeFonts.length === 0) activeFonts = ['sans-serif'];

            let lines = [];
            let currentLine = { width: 0, items: [] };

            for (let i = 0; i < text.length; i++) {
                const char = text[i];

                if (char === '\n') {
                    lines.push(currentLine);
                    currentLine = { width: 0, items: [] };
                    continue;
                }

                if (char === ' ') {
                    const spaceW = CONFIG.maxFontSize * 0.4;
                    if (!isAutoWidth && currentLine.width + spaceW > canvasAvailableWidth && currentLine.items.length > 0) {
                        lines.push(currentLine);
                        currentLine = { width: spaceW, items: [{ isSpace: true, relX: spaceW / 2 }] };
                    } else {
                        currentLine.items.push({ isSpace: true, relX: currentLine.width + spaceW / 2 });
                        currentLine.width += spaceW;
                    }
                    continue;
                }

                const font = activeFonts[randInt(0, activeFonts.length - 1)];
                const fontSize = randInt(CONFIG.minFontSize, CONFIG.maxFontSize);
                const colorPair = activeColors[randInt(0, activeColors.length - 1)];
                const angleDeg = randInt(-18, 18);
                const angle = (angleDeg * Math.PI) / 180;

                ctx.font = `${fontSize}px "${font}"`;
                const metrics = ctx.measureText(char);
                const charWidth = metrics.width || (fontSize * 0.8);
                const boxWidth = charWidth + randInt(20, 30);
                const boxHeight = fontSize + randInt(15, 30);

                if (!isAutoWidth && currentLine.width + boxWidth > canvasAvailableWidth && currentLine.items.length > 0) {
                    lines.push(currentLine);
                    currentLine = { width: 0, items: [] };
                }

                const hw = boxWidth / 2;
                const hh = boxHeight / 2;
                const jx = hw * 0.2;
                const jy = hh * 0.2;

                const r_tl_x = Math.random() * jx;
                const r_tl_y = Math.random() * jy;
                const r_tr_x = Math.random() * jx;
                const r_tr_y = Math.random() * jy;
                const r_br_x = Math.random() * jx;
                const r_br_y = Math.random() * jy;
                const r_bl_x = Math.random() * jx;
                const r_bl_y = Math.random() * jy;

                const polygon = [
                    { x: -hw + r_tl_x, y: -hh + r_tl_y },
                    { x: hw - r_tr_x,  y: -hh + r_tr_y },
                    { x: hw - r_br_x,  y: hh - r_br_y },
                    { x: -hw + r_bl_x, y: hh - r_bl_y }
                ];

                const cp_tl_x = (r_tl_x / boxWidth) * 100;
                const cp_tl_y = (r_tl_y / boxHeight) * 100;
                const cp_tr_x = ((boxWidth - r_tr_x) / boxWidth) * 100;
                const cp_tr_y = (r_tr_y / boxHeight) * 100;
                const cp_br_x = ((boxWidth - r_br_x) / boxWidth) * 100;
                const cp_br_y = ((boxHeight - r_br_y) / boxHeight) * 100;
                const cp_bl_x = (r_bl_x / boxWidth) * 100;
                const cp_bl_y = ((boxHeight - r_bl_y) / boxHeight) * 100;

                const clipPath = `polygon(${cp_tl_x.toFixed(1)}% ${cp_tl_y.toFixed(1)}%, ${cp_tr_x.toFixed(1)}% ${cp_tr_y.toFixed(1)}%, ${cp_br_x.toFixed(1)}% ${cp_br_y.toFixed(1)}%, ${cp_bl_x.toFixed(1)}% ${cp_bl_y.toFixed(1)}%)`;

                const borderRadius = `${randInt(2,12)}px ${randInt(2,12)}px ${randInt(2,12)}px ${randInt(2,12)}px`;

                currentLine.items.push({
                    char: char,
                    font: font,
                    fontSize: fontSize,
                    bg: colorPair.bg,
                    color: colorPair.text,
                    angle: angle,
                    angleDeg: angleDeg,
                    polygon: polygon,
                    clipPath: clipPath,
                    borderRadius: borderRadius,
                    relX: currentLine.width + (boxWidth / 2)
                });

                currentLine.width += boxWidth + randInt(2, 8);
            }
            lines.push(currentLine);

            let maxLineWidth = lines.reduce((max, line) => Math.max(max, line.width), 0);
            let finalCanvasWidth = isAutoWidth ? Math.ceil(maxLineWidth + (CONFIG.paddingX * 2)) : CONFIG.width;

            let letters = [];
            let currentY = CONFIG.paddingY + (CONFIG.maxFontSize / 2);

            lines.forEach(line => {
                let startX = CONFIG.paddingX;
                if (align === 'center') {
                    startX = (finalCanvasWidth - line.width) / 2;
                } else if (align === 'right') {
                    startX = finalCanvasWidth - CONFIG.paddingX - line.width;
                }

                if (startX < CONFIG.paddingX) startX = CONFIG.paddingX;

                if (line.items.length === 0) {
                    letters.push({ isNewline: true });
                } else {
                    line.items.forEach(item => {
                        if (item.isSpace) {
                            letters.push({ isSpace: true });
                        } else {
                            item.x = startX + item.relX;
                            item.y = currentY;
                            letters.push(item);
                        }
                    });
                    letters.push({ isNewline: true });
                }
                currentY += CONFIG.lineSpacing;
            });

            return {
                width: finalCanvasWidth,
                height: currentY,
                letters: letters
            };
        }

        function renderCanvas(drawPaperBg = false) {
            canvas.width = layoutData.width;
            canvas.height = layoutData.height;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (drawPaperBg) {
                ctx.fillStyle = '#f4ecd8';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
                const noiseAmount = (canvas.width * canvas.height) / 150;
                for (let i = 0; i < noiseAmount; i++) {
                    const nx = Math.random() * canvas.width;
                    const ny = Math.random() * canvas.height;
                    const nw = Math.random() * 2 + 1;
                    const nh = Math.random() * 2 + 1;
                    ctx.fillRect(nx, ny, nw, nh);
                }
            }

            layoutData.letters.forEach(l => {
                if (l.isSpace || l.isNewline) return;

                ctx.save();
                ctx.translate(l.x, l.y);
                ctx.rotate(l.angle);

                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 3;
                ctx.shadowOffsetY = 4;

                ctx.beginPath();
                ctx.moveTo(l.polygon[0].x, l.polygon[0].y);
                for (let i = 1; i < l.polygon.length; i++) {
                    ctx.lineTo(l.polygon[i].x, l.polygon[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = l.bg;
                ctx.fill();

                ctx.shadowColor = 'transparent';

                ctx.fillStyle = l.color;
                ctx.font = `${l.fontSize}px "${l.font}"`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(l.char, 0, 0);

                ctx.restore();
            });

            if(drawPaperBg) {
                canvas.style.backgroundColor = '#f4ecd8';
            } else {
                canvas.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)';
                canvas.style.backgroundSize = '20px 20px';
                canvas.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0px';
                canvas.style.backgroundColor = '#eee';
            }
        }

        function handleGenerate() {
            let minS = parseInt(globalMinSizeInput.value) || 45;
            let maxS = parseInt(globalMaxSizeInput.value) || 70;
            if (minS > maxS) {
                const temp = minS;
                minS = maxS;
                maxS = temp;
            }
            CONFIG.minFontSize = minS;
            CONFIG.maxFontSize = maxS;
            CONFIG.lineSpacing = Math.floor(maxS * 1.3);
            CONFIG.width = parseInt(canvasWidthInput.value) || 800;

            const text = messageInput.value || T('msg.fallbackText');
            layoutData = calculateLayout(text);

            canvas.style.backgroundImage = 'none';
            renderCanvas(false);
            showToast(T('msg.generated'));
        }

        function downloadPNG() {
            renderCanvas(false);
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `calling_card_${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
        }

        function downloadJPG() {
            renderCanvas(true);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            const link = document.createElement('a');
            link.download = `calling_card_${Date.now()}.jpg`;
            link.href = dataUrl;
            link.click();
            renderCanvas(false);
        }

        function copyToClipboard() {
            renderCanvas(false);
            canvas.toBlob(blob => {
                if (!blob) {
                    showToast(T('msg.copyImageFailed'));
                    return;
                }
                try {
                    const item = new ClipboardItem({ 'image/png': blob });
                    navigator.clipboard.write([item]).then(() => {
                        showToast(T('msg.imageCopied'));
                    }).catch(err => {
                        console.error('Clipboard write failed:', err);
                        fallbackCopy();
                    });
                } catch (err) {
                    console.error('Clipboard API not supported/failed:', err);
                    fallbackCopy();
                }
            }, 'image/png');
        }

        function fallbackCopy() {
            showToast(T('msg.clipboardUnsupported'));
        }

        function fallbackTextCopy(text, successMsg) {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast(successMsg);
            } catch (err) {
                showToast(T('msg.textCopyFailed'));
            }
            document.body.removeChild(textArea);
        }

        function copyHTMLCode() {
            if (layoutData.letters.length === 0) {
                showToast(T('msg.generateFirst'));
                return;
            }
            const align = document.getElementById('text-alignment').value || 'center';
            let html = `<div style="text-align:${align}; line-height:2.5; padding:20px; background:#2a2a2a; border-radius:10px;">\n`;
            layoutData.letters.forEach(l => {
                if (l.isNewline) html += `<br>\n`;
                else if (l.isSpace) html += `&nbsp;&nbsp;`;
                else {
                    let wrapperStyle = `display:inline-block; filter:drop-shadow(2px 3px 2px rgba(0,0,0,0.5)); transform:rotate(${l.angleDeg}deg); margin:2px 4px;`;
                    let innerStyle = `display:inline-block; font-family:'${l.font}', sans-serif; font-size:${Math.floor(l.fontSize * 0.55)}px; background-color:${l.bg}; color:${l.color}; clip-path:${l.clipPath}; padding:6px 12px; font-weight:900; text-shadow:none; line-height:1;`;

                    html += `<span style="${wrapperStyle}"><span style="${innerStyle}">${l.char}</span></span>`;
                }
            });
            html += `\n</div>`;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(html).then(() => showToast(T('msg.htmlCopied'))).catch(() => fallbackTextCopy(html, T('msg.htmlCopied')));
            } else {
                fallbackTextCopy(html, T('msg.htmlCopied'));
            }
        }

        function copyRoll20Code() {
            if (layoutData.letters.length === 0) {
                showToast(T('msg.generateFirst'));
                return;
            }

            const useBasicFont = document.getElementById('roll20-basic-font').checked;
            const roll20MinSize = parseInt(document.getElementById('roll20-min-size').value) || 16;
            const roll20MaxSize = parseInt(document.getElementById('roll20-max-size').value) || 24;
            const roll20Fonts = ['Batang', 'Dotum', 'Gungsuh'];

            let roll20 = ``;
            layoutData.letters.forEach(l => {
                if (l.isNewline) roll20 += `\n`;
                else if (l.isSpace) roll20 += `  `;
                else {
                    let finalFont = l.font.replace(/['"]/g, '');
                    if (useBasicFont) {
                        finalFont = roll20Fonts[Math.floor(Math.random() * roll20Fonts.length)];
                    }

                    let sizeRatio = 0;
                    if (CONFIG.maxFontSize > CONFIG.minFontSize) {
                        sizeRatio = (l.fontSize - CONFIG.minFontSize) / (CONFIG.maxFontSize - CONFIG.minFontSize);
                    }
                    let finalFontSize = Math.floor(roll20MinSize + (sizeRatio * (roll20MaxSize - roll20MinSize)));
                    if (isNaN(finalFontSize)) finalFontSize = roll20MinSize;

                    roll20 += `[${l.char}](#" style="text-decoration:none; display:inline-block; font-family:${finalFont}, sans-serif; font-size:${finalFontSize}px; line-height:1.2; background-color:${l.bg}; color:${l.color}; padding:5px; border-radius:${l.borderRadius}; margin:2px; font-weight:bold; box-shadow:2px 3px 5px #333333;")`;
                }
            });

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(roll20).then(() => showToast(T('msg.roll20Copied'))).catch(() => fallbackTextCopy(roll20, T('msg.roll20Copied')));
            } else {
                fallbackTextCopy(roll20, T('msg.roll20Copied'));
            }
        }

        function handleAddCustomFont() {
            const nameInput = document.getElementById('custom-font-name');
            const urlInput = document.getElementById('custom-font-url');
            const name = nameInput.value.trim();
            const url = urlInput.value.trim();

            if(!name || !url) {
                showToast(T('msg.fontFieldsRequired'));
                return;
            }

            if (url.includes('.css') || url.includes('googleapis.com')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                document.head.appendChild(link);
            } else {
                const style = document.createElement('style');
                style.innerHTML = `@font-face { font-family: '${name}'; src: url('${url}'); font-weight: normal; font-style: normal; }`;
                document.head.appendChild(style);
            }

            currentFonts.push({ name: name, checked: true });
            renderFontOptions();
            nameInput.value = '';
            urlInput.value = '';
            showToast(T('msg.fontAdded', name));
        }

        function handleAddCustomColor() {
            const bg = document.getElementById('custom-bg-color').value;
            const text = document.getElementById('custom-text-color').value;
            colorPaletteOptions.push({
                id: 'custom_' + Date.now(),
                labelKey: 'color.custom',
                bg: bg,
                text: text,
                checked: true,
                custom: true
            });
            renderColorOptions();
            showToast(T('msg.colorAdded'));
        }

        btnGenerate.addEventListener('click', handleGenerate);
        btnPng.addEventListener('click', downloadPNG);
        btnJpg.addEventListener('click', downloadJPG);
        btnCopy.addEventListener('click', copyToClipboard);
        btnCopyHtml.addEventListener('click', copyHTMLCode);
        btnCopyRoll20.addEventListener('click', copyRoll20Code);
        btnAddFont.addEventListener('click', handleAddCustomFont);
        btnAddColor.addEventListener('click', handleAddCustomColor);

        window.addEventListener('load', () => {
            renderColorOptions();
            renderFontOptions();

            autoWidthCheckbox.addEventListener('change', (e) => {
                canvasWidthInput.disabled = e.target.checked;
                if (e.target.checked) {
                    canvasWidthInput.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    canvasWidthInput.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            });

            btnGenerate.innerHTML = `<span data-i18n="msg.loadingFonts">${T('msg.loadingFonts')}</span>`;
            btnGenerate.disabled = true;

            document.fonts.ready.then(() => {
                btnGenerate.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.62,0L36.68,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l12.69-12.69,44.69,44.69Z"></path></svg>
                    <span data-i18n="btn.generate">${T('btn.generate')}</span>
                `;
                btnGenerate.disabled = false;

                messageInput.value = T('sample.defaultMessage');
                handleGenerate();
            });
        });

        I18N.mountSwitcher(document.getElementById('localeSelect'));
        I18N.onChange(() => { renderColorOptions(); /* 重繪動態色彩標籤 */ });
