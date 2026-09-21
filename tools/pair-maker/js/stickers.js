    import { decodeImage, notify, MAX_STICKERS } from './state.js';

    export function createStickers(stage, store, onSelect) {
    const getSize = () => store.definition.getSize?.(store.state) ?? store.definition.size;
    const Math_max = Math.max, Math_min = Math.min;
    const maxSize = () => { const size = getSize(); return Math_max(size.width, size.height) * 2; };
    const BUTTON_GAP = 2;
    const K = window.Konva, compact = matchMedia('(max-width: 1024px)');
    const layer = new K.Layer(); stage.add(layer);
    
    const transformer = new K.Transformer({
        rotateEnabled: true, keepRatio: true, flipEnabled: false,
        enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], anchorSize: compact.matches ? 16 : 10,
        rotateAnchorOffset: compact.matches ? 26 : 22, padding: 2, borderStroke: '#08b8ef', anchorStroke: '#08b8ef',
        anchorStyleFunc(anchor) { if (anchor.hasName('rotater')) anchor.setAttrs({ width: 24, height: 24, offsetX: 12, offsetY: 12, cornerRadius: 4, fill: '#fff' }); },
        boundBoxFunc(oldBox, newBox) { return Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12 || Math.abs(newBox.width) > maxSize() * stage.scaleX() || Math.abs(newBox.height) > maxSize() * stage.scaleX() ? oldBox : newBox; }
    });
    layer.add(transformer); 
    
    const nodes = new Map(), shadowButtons = new Map(), outlineButtons = new Map(); 
    let selected = null, epoch = 0;

    if (!document.getElementById('sticker-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'sticker-custom-styles';
        style.textContent = `
            @media (max-width: 1024px) {
                .sticker-list { padding-bottom: 150px !important; }
                /* 🔥 只有在貼紙卡片裡面時才把寬度限制在 104px */
                .sticker-card .mobile-citation-input {
                    width: 120px !important;
                    box-sizing: border-box !important;
                }
            }
            .sticker-outline-canvas { position: fixed; z-index: 140; }
        `;
        document.head.appendChild(style);
    }

    const rotateIcon = document.createElement('span'); rotateIcon.className = 'sticker-rotate-icon'; rotateIcon.setAttribute('aria-hidden', 'true'); rotateIcon.hidden = true;
    rotateIcon.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i>'; document.body.append(rotateIcon);
    
    function positionRotationIcon() {
        const anchor = transformer.findOne('.rotater');
        rotateIcon.hidden = !selected || !anchor || !transformer.visible(); if (rotateIcon.hidden) return;
        const r = anchor.getClientRect(), c = stage.container().getBoundingClientRect();
        rotateIcon.style.left = (c.left + r.x + r.width / 2) + 'px'; rotateIcon.style.top = (c.top + r.y + r.height / 2) + 'px';
    }
    layer.on('draw', positionRotationIcon);
    
    function toggleShadow(id) { store.change(s => { const item = s.stickers.find(i => i.id === id); if (item) item.shadow = !item.shadow; }, 'stickers'); }
    
    function toggleOutline(id) { 
        store.change(s => { 
            const item = s.stickers.find(i => i.id === id);
            if (item) item.outline = !item.outline; 
        }, 'stickers'); 
    }

    
    const initDragDrop = () => {
        const stickerList = document.querySelector('.sticker-list');
        if (!stickerList || stickerList._hasDragLogic) return;
        stickerList._hasDragLogic = true;

        stickerList.addEventListener('wheel', (e) => {
            // 只有在有垂直捲動量(deltaY)時才作用
            if (e.deltaY !== 0) {
                e.preventDefault(); // 避免整個網頁上下晃動
                stickerList.scrollLeft += e.deltaY; // 垂直滾輪滾多少，就橫向移動多少
            }
        }, { passive: false });
        
        let draggingCard = null;
        let placeholder = null;
        let startX = 0, startY = 0, initialX = 0, initialY = 0, startIndex = -1;

        stickerList.addEventListener('pointerdown', (e) => {
            const handle = e.target.closest('.sticker-drag-handle');
            if (!handle) return;
            if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return; // 只接受左鍵與觸控

            const card = handle.closest('.sticker-card');
            if (!card) return;

            e.preventDefault();
            handle.setPointerCapture(e.pointerId);

            draggingCard = card;
            const rect = card.getBoundingClientRect();
            
            const allCards = [...stickerList.querySelectorAll('.sticker-card:not(.add-sticker)')];
            startIndex = allCards.indexOf(card);

            startX = e.clientX;
            startY = e.clientY;
            initialX = rect.left;
            initialY = rect.top;

            placeholder = document.createElement('div');
            placeholder.className = 'sticker-card drag-placeholder';
            placeholder.style.width = rect.width + 'px';
            placeholder.style.height = rect.height + 'px';
            placeholder.style.flexShrink = '0';
            
            const computed = getComputedStyle(card);
            placeholder.style.margin = computed.margin;

            card.parentNode.insertBefore(placeholder, card.nextSibling);

            card.classList.add('is-dragging');
            card.style.position = 'fixed';
            card.style.left = initialX + 'px';
            card.style.top = initialY + 'px';
            card.style.width = rect.width + 'px';
            card.style.height = rect.height + 'px';
            card.style.zIndex = '99999';
            card.style.margin = '0';
        });

        stickerList.addEventListener('pointermove', (e) => {
            if (!draggingCard) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            draggingCard.style.left = (initialX + dx) + 'px';
            draggingCard.style.top = (initialY + dy) + 'px';

            // 碰到左右邊緣時清單自動捲動
            const listRect = stickerList.getBoundingClientRect();
            if (e.clientX < listRect.left + 50) stickerList.scrollLeft -= 15;
            else if (e.clientX > listRect.right - 50) stickerList.scrollLeft += 15;

            // 找出游標底下是哪張卡片
            draggingCard.style.pointerEvents = 'none'; 
            const target = document.elementFromPoint(e.clientX, e.clientY);
            
            if (!target) return;
            const targetCard = target.closest('.sticker-card:not(.is-dragging)');
            
            if (targetCard && targetCard !== placeholder) {
                const targetRect = targetCard.getBoundingClientRect();
                const pastMiddleX = e.clientX > targetRect.left + targetRect.width / 2;
                
                const siblings = [...stickerList.querySelectorAll('.sticker-card, .add-sticker')].filter(c => c !== draggingCard && c !== placeholder);
                const rects = siblings.map(c => ({ el: c, rect: c.getBoundingClientRect() }));

                if (pastMiddleX) {
                    targetCard.parentNode.insertBefore(placeholder, targetCard.nextSibling);
                } else {
                    targetCard.parentNode.insertBefore(placeholder, targetCard);
                }

                // FLIP 動畫手法（卡片會順順地滑開）
                rects.forEach(({ el, rect }) => {
                    const newRect = el.getBoundingClientRect();
                    const moveX = rect.left - newRect.left;
                    const moveY = rect.top - newRect.top;
                    if (moveX || moveY) {
                        el.style.transform = `translate(${moveX}px, ${moveY}px)`;
                        el.style.transition = 'none';
                        requestAnimationFrame(() => {
                            el.style.transform = '';
                            el.style.transition = 'transform 0.25s cubic-bezier(0.2, 1, 0.2, 1)';
                        });
                    }
                });
            }
        });

        const endDrag = (e) => {
            if (!draggingCard) return;
            
            const handle = draggingCard.querySelector('.sticker-drag-handle');
            if(handle) handle.releasePointerCapture(e.pointerId);

            draggingCard.classList.remove('is-dragging');
            draggingCard.style.position = '';
            draggingCard.style.left = '';
            draggingCard.style.top = '';
            draggingCard.style.width = '';
            draggingCard.style.height = '';
            draggingCard.style.zIndex = '';
            draggingCard.style.margin = '';
            draggingCard.style.pointerEvents = '';
            
            const allCards = [...stickerList.querySelectorAll('.sticker-card:not(.add-sticker)')].filter(c => c !== draggingCard);
            let newIndex = allCards.indexOf(placeholder);
            
            placeholder.parentNode.insertBefore(draggingCard, placeholder);
            placeholder.remove();
            
            const id = draggingCard.dataset.id;
            const oldIndex = startIndex;
            
            draggingCard = null;
            placeholder = null;

            // 順序有變的話就更新 store（狀態）。
            if (oldIndex !== newIndex && newIndex !== -1 && oldIndex !== -1) {
                const currentScroll = stickerList.scrollLeft;

                store.change(s => {
                    const item = s.stickers.splice(oldIndex, 1)[0];
                    s.stickers.splice(newIndex, 0, item);
                    // 🔥 [關鍵] 硬塞一個新陣列進去，好觸發儲存
                    s.stickers = [...s.stickers]; 
                }, 'stickers');
                
                render().then(() => {
                    select(id);
                    // 2. 等算繪完全結束後的那一瞬間，把捲動位置復原。
                    requestAnimationFrame(() => {
                        const currentList = document.querySelector('.sticker-list');
                        if (currentList) currentList.scrollLeft = currentScroll;
                    });
                });
            }
        };

        stickerList.addEventListener('pointerup', endDrag);
        stickerList.addEventListener('pointercancel', endDrag);
    };

    let isInjecting = false;
    let savedScrollLeft = 0; 
    
    const injectMobileButtons = () => {
        // 🔥 [解法 2] 拖曳（FLIP）途中 DOM 順序是亂的，所以完全停掉按鈕的更新。
        if (document.querySelector('.sticker-card.is-dragging')) return;
        if (isInjecting) return;
        isInjecting = true; 
        
        try { 
            const stickerList = document.querySelector('.sticker-list');
            if (stickerList) {
                if (stickerList.scrollLeft === 0 && savedScrollLeft > 0) {
                    stickerList.scrollLeft = savedScrollLeft;
                }
                if (!stickerList._hasScrollTracker) {
                    stickerList._hasScrollTracker = true;
                    stickerList.addEventListener('scroll', () => {
                        savedScrollLeft = stickerList.scrollLeft;
                    }, { passive: true });
                }
            }
            
            // 🔥 [解法 2] 過濾掉 FLIP 時產生的假方塊(drag-placeholder)，徹底當它不存在
            const cards = document.querySelectorAll('.sticker-list .sticker-card:not(.add-sticker):not(.drag-placeholder)');
            
            if (cards.length > 0) {
                store.state.stickers.forEach((item, i) => {
                    const card = cards[i];
                    if (!card) return;
                    
                    card.dataset.id = item.id; 

                    const hasOutline = !!item.outline;

                    const oldControls = card.querySelector('.mobile-layer-controls');
                    if (oldControls) oldControls.remove();

                    let mobileControls = card.querySelector('.mobile-controls-container');
                    if (!mobileControls) {
                        mobileControls = document.createElement('div');
                        mobileControls.className = 'mobile-controls-container';
                        mobileControls.style.position = 'absolute';
                        mobileControls.style.top = 'calc(100% + 8px)'; 
                        mobileControls.style.left = '50%';
                        mobileControls.style.transform = 'translateX(-50%)';
                        mobileControls.style.display = 'flex';
                        mobileControls.style.flexDirection = 'column';
                        mobileControls.style.gap = '6px'; 
                        // 🔥 [解法 1] 用 100% 把容器綁死，不讓它超過卡片的 120px
                        mobileControls.style.width = '100%'; 
                        mobileControls.style.alignItems = 'center';
                        card.appendChild(mobileControls);
                    }

                    let citationForm = card.querySelector('.mobile-citation-input');
                    // 🔥 [解法 3] 鍵盤列開著時會留下佔位元素，有的話就不要再生一個新表單
                    const isTyping = card.querySelector('.keyboard-input-placeholder');
                    
                    if (!citationForm && !isTyping) {
                        citationForm = document.createElement('input');
                        citationForm.type = 'text';
                        citationForm.className = 'sticker-citation-input mobile-citation-input';
                        citationForm.placeholder = T("form.004");
                        citationForm.style.margin = '0';
                        citationForm.style.position = 'static';
                        citationForm.style.transform = 'none';
                        // 🔥 刪掉那兩行 inline style——被拉進鍵盤列時它們會讓欄位縮掉
                        citationForm.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ctext x='0' y='13' font-size='13' font-family='sans-serif' fill='%23555'%3Eⓒ%3C/text%3E%3C/svg%3E")`;
                        citationForm.style.backgroundRepeat = 'no-repeat';
                        citationForm.style.backgroundPosition = '12px center'; // 固定在距離左邊 12px 的位置
                        citationForm.style.paddingLeft = '30px'; // 把文字推開，不要壓到 ⓒ
                        citationForm.style.textAlign = 'left'; // 靠左對齊，排起來比較自然
                        
                        mobileControls.appendChild(citationForm);
                    }
                    
                    // 表單值改變時的更新邏輯
                    if (citationForm && citationForm.tagName === 'INPUT') {
                        citationForm.value = item.citation || '';
                        citationForm.onclick = (e) => e.stopPropagation();
                        citationForm.oninput = (e) => {
                            store.change(s => {
                                const t = s.stickers.find(i => i.id === item.id);
                                if (t) t.citation = e.target.value;
                            }, 'silent');
                            render();
                        };
                    }

                    const shadowBtn = card.querySelector('.sticker-shadow-toggle:not(.mobile-outline-btn)');
                    if (shadowBtn && shadowBtn.parentNode !== mobileControls) {
                        shadowBtn.style.position = 'static';
                        shadowBtn.style.transform = 'none';
                        mobileControls.appendChild(shadowBtn);
                    }

                    let outlineBtn = card.querySelector('.mobile-outline-btn');
                    if (!outlineBtn) {
                        outlineBtn = document.createElement('button');
                        outlineBtn.type = 'button';
                        outlineBtn.className = 'sticker-shadow-toggle mobile-outline-btn';
                        mobileControls.appendChild(outlineBtn);
                    }
                    outlineBtn.onclick = (e) => { e.stopPropagation(); toggleOutline(item.id); };
                    const newText = hasOutline ? T("sticker.001") : T("sticker.002");
                    if (outlineBtn.textContent !== newText) outlineBtn.textContent = newText;
                    const newPressed = String(hasOutline);
                    if (outlineBtn.getAttribute('aria-pressed') !== newPressed) outlineBtn.setAttribute('aria-pressed', newPressed);

                    let dragHandle = card.querySelector('.sticker-drag-handle');
                    if (!dragHandle) {
                        dragHandle = document.createElement('div');
                        dragHandle.className = 'sticker-drag-handle';
                        dragHandle.innerHTML = '<i class="bi bi-list"></i>';
                        dragHandle.setAttribute('aria-label', T("sticker.003"));
                        card.appendChild(dragHandle);
                    }
                });
                
                initDragDrop();
            }
        } finally {
            isInjecting = false;
        }
    };

    store.subscribe((state, kind) => {
        if (kind === 'stickers') {
            queueMicrotask(injectMobileButtons);
        }
    });

    new MutationObserver(() => {
        injectMobileButtons();
    }).observe(document.body, { childList: true, subtree: true });
    
    const citationBtn = document.createElement('button');
    citationBtn.className = 'sticker-citation-btn'; citationBtn.type = 'button';
    citationBtn.hidden = true;
    document.body.append(citationBtn);

    const citationPcInput = document.createElement('input');
    citationPcInput.type = 'text'; citationPcInput.className = 'sticker-citation-input pc-citation-input';
    citationPcInput.hidden = true;
    citationPcInput.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ctext x='0' y='13' font-size='13' font-family='sans-serif' fill='%23555'%3Eⓒ%3C/text%3E%3C/svg%3E")`;
    citationPcInput.style.backgroundRepeat = 'no-repeat';
    citationPcInput.style.backgroundPosition = '12px center';
    citationPcInput.style.paddingLeft = '30px';
    citationPcInput.style.textAlign = 'left';
    
    document.body.append(citationPcInput);

    citationBtn.onclick = () => {
        citationPcInput.hidden = !citationPcInput.hidden;
        if (!citationPcInput.hidden) {
            const item = store.state.stickers.find(i => i.id === selected);
            citationPcInput.value = item?.citation || '';
            citationPcInput.focus();
        }
    };
    citationPcInput.oninput = (e) => {
        store.change(s => {
            const item = s.stickers.find(i => i.id === selected);
            if (item) item.citation = e.target.value;
        }, 'silent');
        render();
    };

    const deleteButton = document.createElement('button'); deleteButton.className = 'sticker-canvas-delete'; deleteButton.type = 'button';
    deleteButton.textContent = '×'; deleteButton.hidden = true; document.body.append(deleteButton);

    const layerUpBtn = document.createElement('button'); 
    layerUpBtn.className = 'sticker-layer-btn'; layerUpBtn.type = 'button';
    layerUpBtn.innerHTML = '<i class="bi bi-arrow-up-circle-fill"></i>'; layerUpBtn.hidden = true; document.body.append(layerUpBtn);
    
    const layerDownBtn = document.createElement('button'); 
    layerDownBtn.className = 'sticker-layer-btn'; layerDownBtn.type = 'button';
    layerDownBtn.innerHTML = '<i class="bi bi-arrow-down-circle-fill"></i>'; layerDownBtn.hidden = true; document.body.append(layerDownBtn);

    /* 這五個控制項只建立一次（之後只切換 hidden），切語言時不會經過任何重畫的
     * 路徑，所以標籤集中在這裡重套一次。其餘貼紙相關的文字都在 render() 裡，
     * 會跟著重畫。 */
    function applyStickerLabels() {
        citationBtn.textContent = T("sticker.004");
        citationBtn.setAttribute('aria-label', T("sticker.005"));
        citationPcInput.placeholder = T("form.004");
        deleteButton.setAttribute('aria-label', T("sticker.006"));
        layerUpBtn.setAttribute('aria-label', T("sticker.007"));
        layerDownBtn.setAttribute('aria-label', T("sticker.008"));
    }
    applyStickerLabels();
    I18N.onChange(applyStickerLabels);

    // 調整圖層順序的函式
    async function moveLayer(targetId, direction) {
        if (!targetId) return;
        let changed = false;
        store.change(s => {
            const idx = s.stickers.findIndex(i => i.id === targetId);
            
            // 用 splice，好讓偵測狀態變化的機制確實認得到這次變更。
            if (direction === 'up' && idx > 0) {
                const item = s.stickers.splice(idx, 1)[0];
                s.stickers.splice(idx - 1, 0, item);
                changed = true;
            } 
            else if (direction === 'down' && idx < s.stickers.length - 1) {
                const item = s.stickers.splice(idx, 1)[0];
                s.stickers.splice(idx + 1, 0, item);
                changed = true;
            }
            
            // 🔥 [關鍵] 真的有變動的話就換一層全新的陣列外殼，逼它存檔。
            if (changed) {
                s.stickers = [...s.stickers]; 
            }
        }, 'stickers');
        
        if (changed) {
            await render(); 
            select(targetId); 
        }
    }
    
    // 電腦版畫布按鈕的事件（傳入 selected ID）
    layerUpBtn.onclick = () => moveLayer(selected, 'up');
    layerDownBtn.onclick = () => moveLayer(selected, 'down');
    
    function positionDelete() {
        positionRotationIcon();
        const canvasRect = stage.container().getBoundingClientRect();
        for (const [id, button] of shadowButtons) {
        const target = nodes.get(id); 
        button.hidden = compact.matches || !target || id !== selected; 
        
        const outBtn = outlineButtons.get(id);
        if (outBtn) outBtn.hidden = button.hidden;

        if (button.hidden) continue;
        
        const rect = target.getClientRect({ skipShadow: true }); 

        const totalWidth = button.offsetWidth + 8 + (outBtn ? outBtn.offsetWidth : 0);
        const startX = canvasRect.left + rect.x + (rect.width / 2) - (totalWidth / 2);
        button.style.left = Math_max(8, Math_min(innerWidth - totalWidth - 8, startX)) + 'px';

        const stackHeight = button.offsetHeight + (id === selected ? 34 : 0);
        // 固定在圖片視覺邊界的下緣(rect.y + rect.height)往下剛好 8px 的位置。
        button.style.top = Math_max(8, Math_min(innerHeight - stackHeight - 8, canvasRect.top + rect.y + rect.height + 8)) + 'px';

        if (outBtn) {
            outBtn.style.left = (parseFloat(button.style.left) + button.offsetWidth + 8) + 'px';
            outBtn.style.top = button.style.top;
        }
        }
        
        const node = nodes.get(selected); deleteButton.hidden = compact.matches || !node;
        layerUpBtn.hidden = deleteButton.hidden;
        layerDownBtn.hidden = deleteButton.hidden;
        
        // 🔥 [解法 1] 把它提到 return 前面，確保出處按鈕也會被藏起來。
        citationBtn.hidden = deleteButton.hidden;
        if (citationBtn.hidden) {
            citationPcInput.hidden = true;
        }

        if (deleteButton.hidden) return;
        
        const button = shadowButtons.get(selected);
        const outBtn = outlineButtons.get(selected);
        const rect = button.getBoundingClientRect();
        
        if (outBtn) {
            const outRect = outBtn.getBoundingClientRect();
            deleteButton.style.left = ((rect.left + outRect.right) / 2 - 14) + 'px';
        } else {
            deleteButton.style.left = (rect.left + rect.width / 2 - 14) + 'px';
        }
        deleteButton.style.top = (rect.bottom + 6) + 'px';

        const tRect = node.getClientRect({ skipShadow: true });
        const rightX = canvasRect.left + tRect.x + tRect.width + 8; // 距離方框右緣 8px
        const topY = canvasRect.top + tRect.y; // 方框上緣的位置

        citationBtn.hidden = deleteButton.hidden;
        if (!citationBtn.hidden) {
            citationBtn.style.left = (canvasRect.left + tRect.x + tRect.width + 8) + 'px';
            citationBtn.style.top = (canvasRect.top + tRect.y + tRect.height - 28) + 'px';
            
            // 輸入框就放在 c 按鈕的右邊
            citationPcInput.style.left = (parseFloat(citationBtn.style.left) + 36) + 'px';
            citationPcInput.style.top = (parseFloat(citationBtn.style.top) - 2) + 'px';
        }

        layerUpBtn.style.left = rightX + 'px';
        layerUpBtn.style.top = topY + 'px';
        
        layerDownBtn.style.left = rightX + 'px';
        layerDownBtn.style.top = (topY + 34) + 'px'; // 排在 up 按鈕正下方，間隔 34px

        // 已經到頂或到底、不能再移動時，把按鈕變半透明並停用
        const idx = store.state.stickers.findIndex(i => i.id === selected);
        // 索引為 0 就是在最上層（最前面），所以停用 UP 按鈕
        layerUpBtn.classList.toggle('is-disabled', idx === 0);
        layerDownBtn.classList.toggle('is-disabled', idx === store.state.stickers.length - 1);
    }
    
    const main = document.querySelector('.editor-main');
    const transitions = new Set(); let layoutFrame = 0;
    function followLayout() { positionDelete(); layoutFrame = transitions.size ? requestAnimationFrame(followLayout) : 0; }
    main?.addEventListener('transitionrun', e => { if (e.target !== main) return; transitions.add(e.propertyName); if (!layoutFrame) followLayout(); });
    function endLayoutTransition(e) { if (e.target !== main) return; transitions.delete(e.propertyName); if (!transitions.size) { cancelAnimationFrame(layoutFrame); layoutFrame = 0; } positionDelete(); }
    main?.addEventListener('transitionend', endLayoutTransition);
    main?.addEventListener('transitioncancel', endLayoutTransition);
    window.addEventListener('resize', positionDelete);
    window.addEventListener('scroll', positionDelete, true);
    
    function select(id) { selected = nodes.has(id) ? id : null; transformer.nodes(selected ? [nodes.get(selected)] : []); transformer.moveToTop(); positionDelete(); layer.batchDraw(); onSelect?.(selected); }
    function remove(id) { if (!id) return; select(null); store.change(s => { s.stickers = s.stickers.filter(item => item.id !== id); }, 'stickers'); }
    deleteButton.onclick = () => remove(selected);
    
    function commit(node) {
        const size = getSize();
        const width = node.width() * node.scaleX(), height = node.height() * node.scaleY(); node.size({ width, height }); node.scale({ x: 1, y: 1 });
        const rect = node.getClientRect({ relativeTo: stage, skipShadow: true });
        if (rect.x + rect.width < 16) node.x(node.x() + 16 - rect.x - rect.width);
        if (rect.y + rect.height < 16) node.y(node.y() + 16 - rect.y - rect.height);
        if (rect.x > size.width - 16) node.x(node.x() + size.width - 16 - rect.x);
        if (rect.y > size.height - 16) node.y(node.y() + size.height - 16 - rect.y);
        store.change(s => { const item = s.stickers.find(item => item.id === node.id()); if (item) Object.assign(item, { x: node.x(), y: node.y(), width, height, rotation: node.rotation() }); }, 'stickers');
        positionDelete();
    }

    function createOutlineCanvas(img, d = 10) {
        const cvs = document.createElement('canvas');
        cvs.width = img.naturalWidth + d * 2;
        cvs.height = img.naturalHeight + d * 2;
        const ctx = cvs.getContext('2d');
        for (let dx = -d; dx <= d; dx++) {
            for (let dy = -d; dy <= d; dy++) {
                if (dx * dx + dy * dy <= d * d) {
                    ctx.drawImage(img, d + dx, d + dy);
                }
            }
        }
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        return cvs;
    }
    
    async function render() {
        const token = ++epoch, items = store.state.stickers;
        const decoded = await Promise.all(items.map(async item => [item, await decodeImage(item.src)]));
        if (token !== epoch) return;
        
        for (const [id, node] of nodes) {
            if (!items.some(i => i.id === id)) {
                node.destroy(); nodes.delete(id); 
                shadowButtons.get(id)?.remove(); shadowButtons.delete(id);
                outlineButtons.get(id)?.remove(); outlineButtons.delete(id);
            }
        }
        
        decoded.forEach(([item, img], index) => {
        let group = nodes.get(item.id);
        if (!group) {
            group = new K.Group({ id: item.id, draggable: true }); 
            layer.add(group); nodes.set(item.id, group);
            
            const outlineImg = new K.Image({ name: 'outline', listening: false });
            const mainImg = new K.Image({ name: 'main' }); 
            const textNode = new K.Text({ name: 'citation', listening: false }); // 加上文字節點
            group.add(outlineImg, mainImg, textNode);

            const button = document.createElement('button'); button.type = 'button'; button.className = 'sticker-shadow-toggle sticker-shadow-canvas'; button.onclick = () => toggleShadow(item.id); document.body.append(button); shadowButtons.set(item.id, button);
            const outBtn = document.createElement('button'); outBtn.type = 'button'; outBtn.className = 'sticker-shadow-toggle sticker-outline-canvas'; outBtn.onclick = () => toggleOutline(item.id); document.body.append(outBtn); outlineButtons.set(item.id, outBtn);
            
            group.on('click tap', e => { e.cancelBubble = true; select(item.id); });
            group.on('dragstart', () => select(item.id));

            // 1. 拖曳（移動）時按鈕就跟著走。
            group.on('dragmove', positionDelete);

            // 2. 旋轉或縮放途中先把按鈕藏起來。
            group.on('transform', () => { 
                const btn = shadowButtons.get(item.id);
                const outBtn = outlineButtons.get(item.id);
                if (btn) btn.hidden = true;
                if (outBtn) outBtn.hidden = true;
                deleteButton.hidden = true;

                layerUpBtn.hidden = true;
                layerDownBtn.hidden = true;
                
                // 🔥 [解法 2] 把電腦版的出處輸入框與按鈕藏起來。
                citationBtn.hidden = true;
                citationPcInput.hidden = true;

                // 藏起畫布上的文字（免得縮放／旋轉時變形）
                const citationNode = group.findOne('.citation');
                if (citationNode) citationNode.hide();
            });

            // 3. 操作結束後在 commit 裡重算位置，按鈕再出現。
            group.on('dragend transformend', () => commit(group));
        }
        
        group.setAttrs({ x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation, scaleX: 1, scaleY: 1 }); 
        group.setAttrs({ shadowEnabled: false });
        
        const main = group.findOne('.main');
        const outline = group.findOne('.outline');
        
        const hasShadow = !!item.shadow;
        const hasOutline = !!item.outline;

        main.clearCache();
        main.setAttrs({ 
            image: img, width: item.width, height: item.height,
            shadowEnabled: !hasOutline && hasShadow,
            shadowColor: '#000', shadowOpacity: 0.3, shadowOffsetX: 0, shadowOffsetY: 4, shadowBlur: 4 
        });

        outline.clearCache();
        const citationNode = group.findOne('.citation');
        if (item.citation && item.citation.trim() !== '') {
            citationNode.setAttrs({
                text: 'ⓒ ' + item.citation,
                fontSize: 11,
                fontFamily: 'pretendard',
                fill: '#5f5f5f', // 灰色文字
                shadowColor: '#000000', // 陰影顏色
                shadowOpacity: 0.25, // 陰影透明度（rgba 0.25）
                shadowBlur: 4, // 陰影模糊
                shadowOffsetX: 0, // 陰影的 X 位移
                shadowOffsetY: 0, // 陰影的 Y 位移
                align: 'center',
                width: item.width,
                scaleX: 1,
                scaleY: 1,
                visible: true
            });
            // 放在圖片底部中央往上 6px 的位置
            citationNode.y(item.height - 6 - citationNode.height());
        } else {
            citationNode.hide();
        }

        if (hasOutline) {
            if (!img._outlineCvs) img._outlineCvs = createOutlineCanvas(img, 10); // 外框線
            const scaleX = item.width / img.naturalWidth;
            const scaleY = item.height / img.naturalHeight;
            const d = 10; // 外框線
            outline.setAttrs({
                image: img._outlineCvs,
                x: -d * scaleX, y: -d * scaleY,
                width: item.width + (d * 2 * scaleX), height: item.height + (d * 2 * scaleY),
                visible: true,
                shadowEnabled: hasShadow,
                shadowColor: '#000', shadowOpacity: 0.3, shadowOffsetX: 0, shadowOffsetY: 4, shadowBlur: 4 
            });
            outline.cache();
        } else {
            outline.hide();
        }

        const button = shadowButtons.get(item.id); button.textContent = hasShadow ? T("form.014") : T("form.015"); button.setAttribute('aria-pressed', String(hasShadow)); button.setAttribute('aria-label', item.name + ' ' + button.textContent);
        const outBtn = outlineButtons.get(item.id); outBtn.textContent = hasOutline ? T("sticker.001") : T("sticker.002"); outBtn.setAttribute('aria-pressed', String(hasOutline)); outBtn.setAttribute('aria-label', item.name + ' ' + outBtn.textContent);
        }); // decoded.forEach 的結束點
        
        // 🔥 [解法邏輯] 等所有貼紙都上了畫布，再照順序一層層疊起來。
        // 從陣列最尾端（最底下）往最前面（索引 0）依序往上拉，最後第 0 個就會在最上層。
        for (let i = items.length - 1; i >= 0; i--) {
            const group = nodes.get(items[i].id);
            if (group) group.moveToTop();
        }
        
        if (selected && !nodes.has(selected)) selected = null;
        transformer.nodes(selected ? [nodes.get(selected)] : []); 
        transformer.moveToTop(); // 最後再把選取框拉到最上層
        positionDelete(); 
        layer.batchDraw();
    }
    
    compact.addEventListener('change', () => { transformer.anchorSize(compact.matches ? 16 : 10); positionDelete(); layer.batchDraw(); });
    stage.on('click tap', e => { if (e.target === stage || (!nodes.has(e.target.id()) && e.target.getParent() !== transformer)) select(null); });
    document.addEventListener('keydown', e => {
        if (!compact.matches && selected && !document.querySelector('dialog[open]') && !e.target.closest('input,textarea,select,[contenteditable="true"]') && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); remove(selected); }
    });
    
    return {
        layer, transformer, deleteButton, render, select, remove, positionDelete, toggleShadow,
        async add(src, name) {
        if (store.state.stickers.length >= MAX_STICKERS) throw new Error(T("sticker.009", MAX_STICKERS));
        const img = await decodeImage(src), scale = Math_min(300 / img.naturalWidth, 300 / img.naturalHeight);
        const id = crypto.randomUUID(), width = img.naturalWidth * scale, height = img.naturalHeight * scale;
        const size = getSize();
        
        store.change(s => s.stickers.unshift({ id, name, src, x: (size.width - width) / 2, y: (size.height - height) / 2, width, height, rotation: 0, shadow: false, outline: false, citation: '' }), 'stickers');
        await render(); select(id); notify(T("sticker.010"));
        }
    };
    }
