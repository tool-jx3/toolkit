function sanitizeAndParse(text) {
    const t = String(text).trim();
    const matched = t.match(/^[-+]?\d+/);
    if (!matched) return 0;
    const n = parseInt(matched[0], 10);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, n);
}

function adjustFont(span, sizes) {
    const len = (span.textContent || '').length;
    if (len <= 2) span.style.fontSize = sizes[0];
    else if (len === 3) span.style.fontSize = sizes[1];
    else span.style.fontSize = sizes[2];
}

function setupValueBox(box, classNames, fontSizes) {
    const leftSpan = box.querySelector(classNames.left);
    const halfSpan = box.querySelector(classNames.half);
    const fifthSpan = box.querySelector(classNames.fifth);

    function update() {
        const val = sanitizeAndParse(leftSpan.textContent || leftSpan.innerText);
        if (val) {
            halfSpan.textContent = Math.floor(val / 2);
            fifthSpan.textContent = Math.floor(val / 5);
        } else {
            halfSpan.textContent = '';
            fifthSpan.textContent = '';
        }

        adjustFont(leftSpan, fontSizes.left);
        adjustFont(halfSpan, fontSizes.right);
        adjustFont(fifthSpan, fontSizes.right);
    }

    leftSpan.addEventListener('input', update);
    leftSpan.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9+-].*/g, '');
        document.execCommand('insertText', false, text);
        setTimeout(update, 0);
    });

    update();
}

// abilitie 用
document.querySelectorAll('.roll-container').forEach((box) =>
    setupValueBox(
        box,
        {
            left: '.abilitie-regular',
            half: '.abilitie-hard',
            fifth: '.abilitie-extreme',
        },
        {
            left: ['22px', '17px', '13px'],
            right: ['14px', '12px', '10px'],
        }
    )
);

// skill 用
document.querySelectorAll('.skill-container').forEach((box) =>
    setupValueBox(
        box,
        {
            left: '.skill-regular',
            half: '.skill-hard',
            fifth: '.skill-extreme',
        },
        {
            left: ['18px', '14px', '11px'],
            right: ['10px', '8px', '7px'],
        }
    )
);

document.querySelectorAll('.weapon-data').forEach((box) =>
    setupValueBox(
        box,
        {
            left: '.weapon-regular',
            half: '.weapon-hard',
            fifth: '.weapon-extreme',
        },
        {
            left: ['14px', '14px', '14px'],
            right: ['14px', '14px', '14px'],
        }
    )
);


//自動改行
function attachAutoNext(el, options = {}) {
    const container = options.containerSelector || '.sentence';
    let composing = false;

    el.addEventListener('compositionstart', () => {
        composing = true;
    });
    el.addEventListener('compositionend', () => {
        composing = false;
        if (container === '.sentence') handleOverflow(el);
    });

    el.addEventListener('input', () => {
        if (!composing && container === '.sentence') handleOverflow(el);
    });

    // バックスペース時の削除処理
    el.addEventListener('keydown', (e) => {
        const cursorPos = getCursorPos(el);
        const sentence = el.closest(container);
        const spans = container === '.sentence' ? Array.from(sentence.querySelectorAll('span[contenteditable]')) : Array.from(sentence.querySelectorAll(':scope > span[contenteditable]'));
        const index = spans.indexOf(el);
        // カーソル先頭でのバックスペース
        if (e.key === 'Backspace' && cursorPos === 0 && index > 0 && container === '.sentence') {
            e.preventDefault();
            const prevSpan = spans[index - 1];
            const textToMove = el.textContent;
            const prevTextLength = prevSpan.textContent.length;
            prevSpan.textContent += textToMove;
            setCursorPos(prevSpan, prevTextLength);
            el.remove();
            handleOverflow(prevSpan);
            return;
        }
        if (e.key === 'Backspace' && el.textContent === '') {
            if (index >= 1) {
                e.preventDefault();
                const prevSpan = spans[index - 1];
                setCursorPos(prevSpan, prevSpan.textContent.length);
                el.remove();
            }
            distributeSpans();
        }

        if (e.key === 'Enter' && !composing) {
            e.preventDefault();

            const isSentence = container === '.sentence';
            const isItems = container === '.items';

            if (isSentence) {
                const sentence = el.closest('.sentence');
                const spans = Array.from(sentence.querySelectorAll('span[contenteditable]'));
                const index = spans.indexOf(el);

                const cursorPos = getCursorPos(el);
                const text = el.textContent;
                const before = text.slice(0, cursorPos);
                const after = text.slice(cursorPos);

                el.textContent = before;

                let nextSpan = spans[index + 1];
                if (!nextSpan) {
                    nextSpan = document.createElement('span');
                    nextSpan.setAttribute('contenteditable', 'true');
                    sentence.appendChild(nextSpan);
                    attachAutoNext(nextSpan);
                }

                nextSpan.textContent = after + nextSpan.textContent;
                setCursorPos(nextSpan, 0);
                handleOverflow(nextSpan);
            } else if (isItems) {
                const parent = el.parentElement;
                if (!parent) return;

                const newSpan = document.createElement('span');
                newSpan.setAttribute('contenteditable', 'true');
                attachAutoNext(newSpan, { containerSelector: '.items' });

                if (el.nextElementSibling) {
                    parent.insertBefore(newSpan, el.nextElementSibling);
                } else {
                    parent.appendChild(newSpan);
                }
                distributeSpans();

                placeCaretAtStart(newSpan);
            }
        }
    });
}

function getCursorPos(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
}

function setCursorPos(el, pos) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(true);

    let node = el.firstChild;
    let remaining = pos;
    while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.length >= remaining) {
                range.setStart(node, remaining);
                range.collapse(true);
                break;
            } else {
                remaining -= node.length;
            }
        }
        node = node.nextSibling;
    }

    sel.removeAllRanges();
    sel.addRange(range);
}

function handleOverflow(el) {
    const sentence = el.closest('.sentence');
    const spans = Array.from(sentence.querySelectorAll('span[contenteditable]'));
    let i = spans.indexOf(el);
    let cursorPos = getCursorPos(el);

    while (el.scrollWidth > el.clientWidth) {
        let text = el.textContent;
        let cutIndex = text.length;
        while (cutIndex > 0 && el.scrollWidth > el.clientWidth) {
            cutIndex--;
            el.textContent = text.slice(0, cutIndex);
        }

        const overflowText = text.slice(cutIndex);
        let nextSpan = spans[i + 1];

        if (!nextSpan) {
            nextSpan = document.createElement('span');
            nextSpan.setAttribute('contenteditable', 'true');
            sentence.appendChild(nextSpan);
            attachAutoNext(nextSpan);
            spans.push(nextSpan);
        }

        if (cursorPos > cutIndex) {
            nextSpan.textContent = overflowText + nextSpan.textContent;
            cursorPos -= cutIndex;
            el = nextSpan;
            i = spans.indexOf(el);
        } else {
            nextSpan.textContent = overflowText + nextSpan.textContent;
            break;
        }
    }

    setCursorPos(el, cursorPos);
}

function placeCaretAtStart(el) {
    el.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

function distributeSpans() {
    const L = document.getElementById('item-left');
    const R = document.getElementById('item-right');
    const spans = Array.from(L.querySelectorAll('span')).concat(Array.from(R.querySelectorAll('span')));

    L.innerHTML = '';
    R.innerHTML = '';

    const mid = Math.ceil(spans.length / 2);

    spans.forEach((span, i) => {
        if (i < mid) {
            L.appendChild(span);
        } else {
            R.appendChild(span);
        }
    });
}

document.querySelectorAll('.sentence span[contenteditable]').forEach((span) => attachAutoNext(span, { containerSelector: '.sentence' }));
document.querySelectorAll('.items > span[contenteditable]').forEach((span) => attachAutoNext(span, { containerSelector: '.items' }));


        const skillsContainer = document.getElementById('skill-grid');

        function createAddSkill() {
            const div = document.createElement('div');
            div.className = 'add-special-skill';
            div.innerHTML = `
<div class="skill-check"></div>
<label contenteditable="true" class="skill-name"></label>
<div class="skill-container">
	<div class="skill-box skill-regular" contenteditable="true"></div>
<div class="skill-box skill-hard"></div>
	<div class="skill-box skill-extreme"></div>
</div>`;
            attachEvents(div.querySelector('.skill-name'));
            return div;
        }

        function attachEvents(el) {
            let composing = false;
            el.addEventListener('compositionstart', () => (composing = true));
            el.addEventListener('compositionend', () => (composing = false));

            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !composing) {
                    e.preventDefault();
                    const parent = el.closest('.free-skill, .special-skill, .add-special-skill');
                    const newSkill = createAddSkill();
                    parent.insertAdjacentElement('afterend', newSkill);
                    newSkill.querySelector('.skill-name').focus();
                }

                if (e.key === 'Backspace' && el.textContent.trim() === '') {
                    const parent = el.closest('.add-special-skill');
                    if (parent) {
                        e.preventDefault();
                        const prev = parent.previousElementSibling;
                        parent.remove();
                        if (prev) {
                            const prevInput = prev.querySelector('.skill-name');
                            if (prevInput) prevInput.focus();
                        }
                    }
                }
            });
        }

        // 初期の .skill-name にイベントを付与
        document.querySelectorAll('.skill-name').forEach(attachEvents);


const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const clearBtn = document.getElementById('clearBtn');
const main = document.getElementById('main');
const saveList = document.getElementById('saveList');
const deleteBtn = document.getElementById('deleteBtn');
const printBtn = document.getElementById('printBtn');

const STORAGE_KEY = 'coc7_charasheet';
const AUTOSAVE_KEY = 'coc7_autosave';

// localStorageからデータを取得
function getAllSheets() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

// セレクト更新
function updateSelectList() {
    const sheets = getAllSheets();
    saveList.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = T('toolbar.saveList');
    saveList.appendChild(placeholder);
    for (const name of Object.keys(sheets)) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        saveList.appendChild(opt);
    }
}

// 保存ボタン
saveBtn.addEventListener('click', () => {
    const selectedName = saveList.value || '';

    // プロンプトで入力を求める（初期値に selectedName をセット）
    const name = prompt(T('msg.savePrompt'), selectedName);
    if (!name) return;

    const sheets = getAllSheets();

    // 同名確認
    if (sheets[name]) {
        const overwrite = confirm(T('msg.overwrite', name));
        if (!overwrite) return;
    }

    sheets[name] = main.innerHTML;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
    updateSelectList();
    saveList.value = name;
});

// 読み込みボタン
loadBtn.addEventListener('click', () => {
    const selected = saveList.value;
    if (!selected) {
        alert(T('msg.selectToLoad'));
        return;
    }
    if (!confirm(T('msg.confirmLoad', selected))) return;
    const sheets = getAllSheets();
    main.innerHTML = sheets[selected] || '';
    localStorage.setItem(AUTOSAVE_KEY, main.innerHTML); // オートセーブ更新
    localizeSheet();
    restoreAllEventListeners();
});

deleteBtn.addEventListener('click', () => {
    const selected = saveList.value;
    if (!selected) {
        alert(T('msg.selectToDelete'));
        return;
    }
    if (!confirm(T('msg.confirmDelete', selected))) return;
    const sheets = getAllSheets();
    delete sheets[selected];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
    updateSelectList();
    saveList.value = '';
});

// オートセーブ機能（入力検知）
let autosaveTimer;
main.addEventListener('input', () => {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        localStorage.setItem(AUTOSAVE_KEY, main.innerHTML);
        console.log('Autosave complete');
    }, 1000);
});

// ページ読み込み時：オートセーブ復元
window.addEventListener('DOMContentLoaded', () => {
    updateSelectList();
    const autosaveData = localStorage.getItem(AUTOSAVE_KEY);
    if (autosaveData) {
        main.innerHTML = autosaveData;
        localizeSheet();
        restoreAllEventListeners();
        console.log('Autosave restored');
    }
});

clearBtn.addEventListener('click', () => {
    if (!confirm(T('msg.confirmClear'))) return;
    localStorage.removeItem(AUTOSAVE_KEY);
    location.reload(); // ← ページ全体をリロード
});

printBtn.addEventListener('click', () => {
    window.print();
});

/* 收錄版的語言切換：
 * 角色卡上的預設標籤（姓名、技能名、「徒手」…）都掛了 data-i18n，切換語言時由共用引擎重套。
 * 但這些標籤多半可以直接點擊改寫（contenteditable），而且存檔與自動儲存都是把 main.innerHTML
 * 原樣存進 localStorage——掛勾會跟著存進去，讀回來時再依目前語言重套一次。
 * 使用者改寫過的標籤就拔掉掛勾，免得切換語言或讀檔時被蓋回預設文字。
 * 沒有掛勾的舊存檔（例如上游產生的）維持存檔當時的文字，照舊讀得進來。 */
const I18N_HOOK_ATTRS = ['data-i18n', 'data-i18n-html', 'data-i18n-node'];
main.addEventListener('input', (e) => {
    const el = e.target;
    if (el instanceof Element) I18N_HOOK_ATTRS.forEach((attr) => el.removeAttribute(attr));
});

function localizeSheet() {
    I18N.applyStaticDom(main);
}

/* 儲存清單的第一個選項由 updateSelectList() 產生，切換語言時重畫並保留目前的選取。 */
I18N.onChange(() => {
    const selected = saveList.value;
    updateSelectList();
    saveList.value = selected;
});

function restoreAllEventListeners() {
    // abilitie
    document.querySelectorAll('.roll-container').forEach((box) =>
        setupValueBox(
            box,
            {
                left: '.abilitie-regular',
                half: '.abilitie-hard',
                fifth: '.abilitie-extreme',
            },
            {
                left: ['22px', '17px', '13px'],
                right: ['14px', '12px', '10px'],
            }
        )
    );

    // skill
    document.querySelectorAll('.skill-container').forEach((box) =>
        setupValueBox(
            box,
            {
                left: '.skill-regular',
                half: '.skill-hard',
                fifth: '.skill-extreme',
            },
            {
                left: ['18px', '14px', '11px'],
                right: ['10px', '8px', '7px'],
            }
        )
    );

    // weapon
    document.querySelectorAll('.weapon-data').forEach((box) =>
        setupValueBox(
            box,
            {
                left: '.weapon-regular',
                half: '.weapon-hard',
                fifth: '.weapon-extreme',
            },
            {
                left: ['14px', '14px', '14px'],
                right: ['14px', '14px', '14px'],
            }
        )
    );

    // contenteditable 自動改行
    document.querySelectorAll('.sentence span[contenteditable]').forEach((span) => attachAutoNext(span, { containerSelector: '.sentence' }));
    document.querySelectorAll('.items > span[contenteditable]').forEach((span) => attachAutoNext(span, { containerSelector: '.items' }));

    // skill-name イベント
    document.querySelectorAll('.skill-name').forEach(attachEvents);

    setupImageEvents();
}

function setupImageEvents() {
    const selectBtn = document.getElementById('img-select-btn');
    const fileInput = document.getElementById('file-input');
    const modal = document.getElementById('image-modal');
    const imgWrapper = document.getElementById('img-container');
    const scaleFactor = 4; // HTML側とFabric側の比率
    const removeBtn = document.getElementById('img-remove-btn');

    let modalCanvas = null;
    let imgObject = null;
    let currentImg = null;

    /* -------------------------------------------------------
       モーダル全体を transform: scale() で縮小する
       Fabricキャンバス自体は 800×800px 固定を維持する。
       Fabric.js はポインター座標を getBoundingClientRect() で
       補正するため、縮小後もドラッグ・スケール操作は正確に動く。
    ------------------------------------------------------- */

    /* モーダルを開く */
    function openModal() {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        /* rAF で DOM 描画後に自然サイズを計測してスケール適用 */
        requestAnimationFrame(scaleModal);
    }

    /* #img-modal-content 全体をスケールする
       ・上下：画面内に必ず収める
       ・左右：モーダル幅の 1/3 まで飛び出し許可（横スクロールで補完） */
    function scaleModal() {
        const mc = document.getElementById('img-modal-content');
        if (!mc) return;

        /* 一旦スケールをリセットして等倍時の自然サイズを取得 */
        mc.style.transform = '';
        const naturalW = mc.offsetWidth;
        const naturalH = mc.offsetHeight;

        const marginV = 16; /* 上下の最低余白(px) */

        /* 高さ：画面内に必ず収める */
        const scaleH = (window.innerHeight - marginV * 2) / naturalH;

        /* 幅：1/3 まで飛び出し許可
           「見える幅 ≥ モーダル幅 × 2/3」を担保するスケール上限
           → scale ≤ viewportW × 3/2 / naturalW               */
        const scaleW = (window.innerWidth * 1.5) / naturalW;

        const scale = Math.min(scaleH, scaleW, 1);
        mc.style.transform = `scale(${scale})`;
    }

    /* モーダルを閉じる（canvas破棄含む） */
    function closeModal() {
        if (modalCanvas) {
            modalCanvas.dispose();
            modalCanvas = null;
        }
        imgObject = null;
        modal.classList.remove('open');
        document.body.style.overflow = '';
        /* スケールリセット */
        const mc = document.getElementById('img-modal-content');
        if (mc) mc.style.transform = '';
    }

    /* ウィンドウリサイズ時もモーダルが開いていれば再計算する */
    window.addEventListener('resize', () => {
        if (modal.classList.contains('open')) scaleModal();
    });

    /* 市松模様パターンを生成して Fabric.js キャンバスにセット */
    function applyCheckerboard(canvas) {
        const size = 16;
        const pc = document.createElement('canvas');
        pc.width = size * 2;
        pc.height = size * 2;
        const ctx = pc.getContext('2d');
        ctx.fillStyle = '#2a2e33';
        ctx.fillRect(0, 0, size * 2, size * 2);
        ctx.fillStyle = '#1a1e22';
        ctx.fillRect(0, 0, size, size);
        ctx.fillRect(size, size, size, size);
        canvas.setBackgroundColor({ source: pc, repeat: 'repeat' }, canvas.renderAll.bind(canvas));
    }

    // 画像選択ボタン
    selectBtn.addEventListener('click', () => fileInput.click());

    // 閉じるボタン（×ボタン）
    document.getElementById('img-modal-close-btn').addEventListener('click', closeModal);

    // オーバーレイクリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // ファイル選択時
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (f) {
            const imgData = f.target.result;

            openModal();

            // Fabric.js キャンバス初期化
            modalCanvas = new fabric.Canvas('modal-canvas', {
                width: 800,
                height: 800,
                selection: true,
            });

            // 市松模様の背景
            applyCheckerboard(modalCanvas);

            // 画像を読み込み
            fabric.Image.fromURL(imgData, (img) => {
                const scaleX = 520 / img.width;
                const scaleY = 640 / img.height;
                const scale = Math.min(scaleX, scaleY, 1);

                img.set({
                    left: 140 + 520 / 2,
                    top: 80 + 640 / 2,
                    originX: 'center',
                    originY: 'center',
                    scaleX: scale,
                    scaleY: scale,
                    cornerColor: '#00e5ff',
                    cornerStrokeColor: '#00e5ff',
                    borderColor: '#00e5ff',
                    borderScaleFactor: 2,
                });

                modalCanvas.add(img);
                modalCanvas.setActiveObject(img);
                imgObject = img;
            });

            // 決定ボタン
            document.getElementById('modal-ok').onclick = () => {
                if (!imgObject) return;

                const left = 140;
                const top = 80;
                const width = 520;
                const height = 640;
                modalCanvas.setBackgroundColor(null, () => {
                    // 枠内を切り抜き
                    const dataURL = modalCanvas.toDataURL({
                        left,
                        top,
                        width,
                        height,
                        format: 'png',
                    });

                    // img-wrapper 内に新しい <img> を作成して貼り付け
                    const images = imgWrapper.querySelectorAll('img');
                    images.forEach((img) => imgWrapper.removeChild(img));
                    const newImg = document.createElement('img');
                    newImg.src = dataURL;
                    newImg.width = width / scaleFactor;
                    newImg.height = height / scaleFactor;
                    imgWrapper.appendChild(newImg);
                    currentImg = newImg;

                    closeModal();

                    // ボタン切り替え
                    selectBtn.style.display = 'none';
                    removeBtn.style.display = 'inline-block';
                });
            };

            // キャンセルボタン
            document.getElementById('modal-cancel').onclick = closeModal;
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });

    // 削除ボタン
    removeBtn.addEventListener('click', () => {
        const images = imgWrapper.querySelectorAll('img');
        images.forEach((img) => imgWrapper.removeChild(img));
        selectBtn.style.display = 'inline-block';
        removeBtn.style.display = 'none';
    });
}
setupImageEvents();

