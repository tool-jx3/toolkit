        let originalFiles = [];
        let processedImages = [];

        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const previewArea = document.getElementById('previewArea');
        const processBtn = document.getElementById('processBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        const clearBtn = document.getElementById('clearBtn');
        const convertWebPCheckbox = document.getElementById('convertWebP');
        const qualitySelect = document.getElementById('qualitySelect');
        const qualitySliderContainer = document.getElementById('qualitySliderContainer');
        const qualitySlider = document.getElementById('qualitySlider');
        const qualityValue = document.getElementById('qualityValue');
        const trimTransparentCheckbox = document.getElementById('trimTransparent');
        const unifyWidthCheckbox = document.getElementById('unifyWidth');
        const advancedToggle = document.getElementById('advancedToggle');
        const advancedPopup = document.getElementById('advancedPopup');
        const statusDiv = document.getElementById('status');
        const descriptionToggle = document.getElementById('descriptionToggle');
        const description = document.getElementById('description');
        const changelogLink = document.getElementById('changelogLink');

        /* 更新紀錄連結的點擊事件（目前未使用） */
        changelogLink.addEventListener('click', (e) => {
            e.preventDefault();
            alert(T('msg.noChangelog'));
            /* 之後也許會改成彈窗或另開頁面顯示更新紀錄 */
        });

        /* 說明的展開與收合 */
        descriptionToggle.addEventListener('click', () => {
            descriptionToggle.classList.toggle('active');
            description.classList.toggle('active');
        });

        /* 品質設定的切換 */
        qualitySelect.addEventListener('change', () => {
            if (qualitySelect.value === 'slider') {
                qualitySliderContainer.classList.add('active');
            } else {
                qualitySliderContainer.classList.remove('active');
            }
        });

        /* 更新滑桿旁邊顯示的數值 */
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value + '%';
        });


        /* 進階設定彈出視窗的開闔 */
        advancedToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            advancedToggle.classList.toggle('active');
            advancedPopup.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!advancedPopup.contains(e.target) && e.target !== advancedToggle) {
                advancedPopup.classList.remove('active');
                advancedToggle.classList.remove('active');
            }
        });

        /* 依載入與處理的狀況決定按鈕能不能按（狀態管理集中在這裡） */
        function updateButtons() {
            processBtn.disabled = originalFiles.length === 0;
            downloadBtn.disabled = processedImages.length === 0;
            clearBtn.disabled = originalFiles.length === 0;
        }

        uploadArea.addEventListener('click', () => fileInput.click());

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });

        /* 取得去掉副檔名的檔名 */
        function getFileNameBody(fileName) {
            return fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        }

        /* 先做出一張預覽的外框，內容稍後再填 */
        function createPreviewFrame() {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';

            const loading = document.createElement('div');
            loading.className = 'loading';
            loading.textContent = 'Loading...';
            previewItem.appendChild(loading);

            return previewItem;
        }

        /* 把圖片與檔名填進外框。
           檔名是透過 textContent／屬性寫入的，所以就算名稱裡含 HTML 也安全。 */
        function fillPreviewItem(previewItem, src, fileName, onRemove, suffix = '') {
            previewItem.textContent = '';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-remove';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', onRemove);

            const img = document.createElement('img');
            img.src = src;
            img.alt = fileName;

            const name = document.createElement('div');
            name.className = 'preview-name';
            name.title = fileName;
            name.textContent = fileName + suffix;

            previewItem.append(removeBtn, img, name);
        }

        /* 在最後面追加一張檔案的預覽。
           先擺好外框再非同步填內容，所以不會因為載入完成的先後而亂序。 */
        function appendPreview(file) {
            const previewItem = createPreviewFrame();
            previewArea.appendChild(previewItem);

            const reader = new FileReader();
            reader.onload = (e) => {
                fillPreviewItem(previewItem, e.target.result, file.name, () => removeFile(file));
            };
            reader.readAsDataURL(file);
        }

        /* 把整個預覽區重建成未處理的狀態 */
        function rebuildPreviews() {
            previewArea.textContent = '';
            previewArea.classList.toggle('active', originalFiles.length > 0);
            originalFiles.forEach((file) => appendPreview(file));
        }

        function handleFiles(files) {
            const newFiles = Array.from(files).filter(file =>
                file.type === 'image/png' || file.type === 'image/webp'
            );

            if (newFiles.length === 0) {
                showStatus('msg.wrongType', 'error');
                return;
            }

            /* 加進檔案清單 */
            const wasProcessed = processedImages.length > 0;
            originalFiles = [...originalFiles, ...newFiles];
            processedImages = [];

            if (wasProcessed) {
                /* 還留著處理完的預覽，改回未處理的顯示 */
                rebuildPreviews();
            } else {
                previewArea.classList.add('active');
                newFiles.forEach((file) => appendPreview(file));
            }

            updateButtons();
            showStatus('msg.loaded', 'success', originalFiles.length);
        }

        /* 由預覽的 × 按鈕呼叫（已處理的情況會退回未處理狀態） */
        function removeFile(file) {
            const index = originalFiles.indexOf(file);
            if (index === -1) return;

            originalFiles.splice(index, 1);
            processedImages = [];

            rebuildPreviews();
            updateButtons();

            if (originalFiles.length > 0) {
                showStatus('msg.loaded', 'success', originalFiles.length);
            } else {
                clearStatus();
            }
        }

        /* 切換語言時，把已顯示的狀態訊息以新語言重寫。其餘文字由引擎的 data-i18n 處理。 */
        I18N.mountSwitcher(document.getElementById('localeSelect'));
        I18N.onChange(renderStatus);

        processBtn.addEventListener('click', processImages);

async function processImages() {
            processBtn.disabled = true;
            showStatus('msg.processing', 'info');

            const shouldTrim = trimTransparentCheckbox.checked;
            const shouldUnifyWidth = unifyWidthCheckbox.checked;

            try {
                const imageDataList = [];
                const total = originalFiles.length;

                for (let i = 0; i < total; i++) {
                    const file = originalFiles[i];
                    showStatus('msg.processingAt', 'info', i + 1, total);
                    await new Promise(resolve => setTimeout(resolve, 0));

                    const img = await loadImage(file);
                    const canvas = shouldTrim ? trimTransparentPixels(img) : imageToCanvas(img);
                    imageDataList.push({
                        canvas,
                        fileName: file.name,
                        file
                    });
                }

                if (shouldUnifyWidth) {
                    const maxWidth = Math.max(...imageDataList.map(data => data.canvas.width));
                    processedImages = imageDataList.map(data => ({
                        canvas: addHorizontalPadding(data.canvas, maxWidth),
                        fileName: data.fileName,
                        file: data.file
                    }));
                } else {
                    processedImages = imageDataList;
                }

                previewArea.textContent = '';

                /* 按下 × 會退回「扣掉那張圖」的未處理狀態 */
                processedImages.forEach((data) => {
                    const previewItem = createPreviewFrame();
                    previewArea.appendChild(previewItem);
                    fillPreviewItem(
                        previewItem,
                        data.canvas.toDataURL(),
                        data.fileName,
                        () => removeFile(data.file),
                        T('preview.done')
                    );
                });

                showStatus('msg.processed', 'success');
            } catch (error) {
                console.error(error);
                processedImages = [];
                showStatus('msg.error', 'error', error.message);
            } finally {
                updateButtons();
            }
        }

        function loadImage(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = e.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        function imageToCanvas(img) {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            return canvas;
        }

        function trimTransparentPixels(img) {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            let top = 0, bottom = canvas.height, left = 0, right = canvas.width;

            outer: for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 0) {
                        top = y;
                        break outer;
                    }
                }
            }

            outer: for (let y = canvas.height - 1; y >= 0; y--) {
                for (let x = 0; x < canvas.width; x++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 0) {
                        bottom = y + 1;
                        break outer;
                    }
                }
            }

            outer: for (let x = 0; x < canvas.width; x++) {
                for (let y = 0; y < canvas.height; y++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 0) {
                        left = x;
                        break outer;
                    }
                }
            }

            outer: for (let x = canvas.width - 1; x >= 0; x--) {
                for (let y = 0; y < canvas.height; y++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 0) {
                        right = x + 1;
                        break outer;
                    }
                }
            }

            const trimmedWidth = right - left;
            const trimmedHeight = bottom - top;

            const trimmedCanvas = document.createElement('canvas');
            trimmedCanvas.width = trimmedWidth;
            trimmedCanvas.height = trimmedHeight;
            const trimmedCtx = trimmedCanvas.getContext('2d');

            trimmedCtx.drawImage(
                canvas,
                left, top, trimmedWidth, trimmedHeight,
                0, 0, trimmedWidth, trimmedHeight
            );

            return trimmedCanvas;
        }

        function addHorizontalPadding(canvas, targetWidth) {
            if (canvas.width >= targetWidth) {
                return canvas;
            }

            const paddedCanvas = document.createElement('canvas');
            paddedCanvas.width = targetWidth;
            paddedCanvas.height = canvas.height;
            const ctx = paddedCanvas.getContext('2d');

            const offsetX = Math.floor((targetWidth - canvas.width) / 2);
            ctx.drawImage(canvas, offsetX, 0);

            return paddedCanvas;
        }

        downloadBtn.addEventListener('click', downloadAllImages);
        async function downloadAllImages() {
            downloadBtn.disabled = true;
            showStatus('msg.downloading', 'info');

            const convertToWebP = convertWebPCheckbox.checked;
            const qualityMode = qualitySelect.value;
            let quality;

            if (qualityMode === 'lossless') {
                quality = 1.0;
            } else {
                quality = parseInt(qualitySlider.value) / 100;
            }

            try {
                for (let i = 0; i < processedImages.length; i++) {
                    const data = processedImages[i];
                    let fileName = data.fileName;
                    let mimeType, downloadQuality;

                    const nameBody = getFileNameBody(fileName);

                    if (convertToWebP) {
                        fileName = `${nameBody}.webp`;
                        mimeType = 'image/webp';
                        downloadQuality = quality;
                    } else {
                        /* 維持原本的格式輸出。判斷依據是實際格式，不是檔名的副檔名。
                           （避免沒有副檔名的 PNG 被當成 WebP 輸出）。 */
                        if (data.file.type === 'image/webp') {
                            mimeType = 'image/webp';
                            fileName = `${nameBody}.webp`;
                        } else {
                            mimeType = 'image/png';
                            fileName = `${nameBody}.png`;
                        }
                        downloadQuality = 1.0; /* PNG 之類不吃 quality，寫上只是保險 */
                    }

                    const blob = await new Promise(resolve => {
                        data.canvas.toBlob(resolve, mimeType, downloadQuality);
                    });

                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();

                    /* 釋放記憶體 */
                    setTimeout(() => URL.revokeObjectURL(url), 1000);

                    /* 為了避開瀏覽器的下載封鎖，等待時間拉長一些（100ms → 建議 500ms 以上） */
                    await new Promise(resolve => setTimeout(resolve, 500));

                    /* 顯示進度 */
                    showStatus('msg.downloadingAt', 'info', i + 1, processedImages.length);
                }

                showStatus('msg.downloaded', 'success');
            } catch (error) {
                console.error(error);
                showStatus('msg.downloadError', 'error', error.message);
            } finally {
                updateButtons();
            }
        }

        clearBtn.addEventListener('click', () => {
            originalFiles = [];
            processedImages = [];
            previewArea.textContent = '';
            previewArea.classList.remove('active');
            fileInput.value = '';
            updateButtons();
            clearStatus();
        });

        /* 狀態訊息記住 key 與參數，切換語言時才能以新語言重寫。 */
        let lastStatus = null;

        function showStatus(key, type, ...args) {
            lastStatus = { key, type, args };
            renderStatus();
        }

        function renderStatus() {
            if (!lastStatus) return;
            statusDiv.textContent = T(lastStatus.key, ...lastStatus.args);
            statusDiv.className = `status ${lastStatus.type}`;
        }

        function clearStatus() {
            lastStatus = null;
            statusDiv.textContent = '';
            statusDiv.className = 'status';
        }
