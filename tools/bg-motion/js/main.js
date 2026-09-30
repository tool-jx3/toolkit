/* bg-motion（動態背景產生器）主程式。
 * 上游：kumachansteps/trpg-web-tools 的 tools/haikei-motion-maker/js/main.js（v1.09）。
 * 收錄版的改動：介面文字改走合輯的 i18n 引擎（T()）、拿掉存取分析、範例圖改由程式繪製；
 * 動態效果、圖片處理與 WebP 輸出的邏輯沒有更動。 */
(() => {
  'use strict';

  const els = {
    body: document.body,
    toastHost: document.getElementById('toastHost'),
    helpBtn: document.getElementById('helpBtn'),
    shortcutBtn: document.getElementById('shortcutBtn'),
    themeBtn: document.getElementById('themeBtn'),
    helpDrawer: document.getElementById('helpDrawer'),
    shortcutDrawer: document.getElementById('shortcutDrawer'),
    drawerCloseButtons: document.querySelectorAll('[data-close-drawer]'),
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    imageInfo: document.getElementById('imageInfo'),
    loadSampleBtn: document.getElementById('loadSampleBtn'),
    effectGrid: document.getElementById('effectGrid'),
    motionTab: document.getElementById('motionTab'),
    imageEditTab: document.getElementById('imageEditTab'),
    motionPanel: document.getElementById('motionPanel'),
    imageEditPanel: document.getElementById('imageEditPanel'),
    imageEditGrid: document.getElementById('imageEditGrid'),
    previewCanvas: document.getElementById('previewCanvas'),
    canvasPlaceholder: document.getElementById('canvasPlaceholder'),
    transitionThumbPanel: document.getElementById('transitionThumbPanel'),
    transitionThumbList: document.getElementById('transitionThumbList'),
    fileNameInput: document.getElementById('fileNameInput'),
    secondsInput: document.getElementById('secondsInput'),
    qualityInput: document.getElementById('qualityInput'),
    sizeInput: document.getElementById('sizeInput'),
    loopInput: document.getElementById('loopInput'),
    playBtn: document.getElementById('playBtn'),
    exportWebpBtn: document.getElementById('exportWebpBtn'),
    exportWebp30Btn: document.getElementById('exportWebp30Btn'),
    exportWebp60Btn: document.getElementById('exportWebp60Btn'),
    exportNote: document.querySelector('.export-note'),
    exportStatus: document.getElementById('exportStatus'),
    previewPanel: document.querySelector('.preview-panel'),
    previewControls: document.getElementById('previewControls'),
    downloadLink: document.getElementById('downloadLink'),
    clearOutputBtn: document.getElementById('clearOutputBtn')
  };

  const ctx = els.previewCanvas.getContext('2d');
  const state = {
    image: null,
    images: [],
    imageFiles: [],
    imageName: '',
    sourceBaseName: '',
    imageWidth: 0,
    imageHeight: 0,
    effect: 'quakeY2',
    imageFilter: 'none',
    playing: false,
    rafId: null,
    playStart: 0,
    stillFrameTime: 0,
    draggedThumbIndex: null,
    fadeOrder: ['image', 'fill'],
    isExporting: false,
    cancelExportRequested: false,
    stillDownloadUrl: '',
    stillDownloadName: ''
  };

  /* 收錄版：範例圖改由程式繪製（見 drawSampleBackground()），這是它的檔名。 */
  const SAMPLE_IMAGE_NAME = 'sample_night_town.jpeg';
  const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
  const AUTO_LIGHT_FILE_BYTES = 1 * 1024 * 1024;
  const AUTO_PRESET_FILE_BYTES = 3 * 1024 * 1024;
  const AUTO_MINIMUM_FILE_BYTES = 6 * 1024 * 1024;
  const exportSizePresets = [
    { key: '16:9', value: '1280x720', baseLabel: '16：9' },
    { key: '8:5', value: '1280x800', baseLabel: '8：5' },
    { key: '4:3', value: '1024x768', baseLabel: '4：3' },
    { key: '3:2', value: '1200x800', baseLabel: '3：2' },
    { key: '1:1', value: '1024x1024', baseLabel: '1：1' }
  ];

  const qualitySettings = {
    minimum: {
      fps: 24,
      quality: 24,
      apngColors: 32,
      webpQuality: 0.62,
      get label() { return T('quality.minimum'); },
      sizeMap: {
        '16:9': { width: 768, height: 432 },
        '8:5': { width: 768, height: 480 },
        '4:3': { width: 640, height: 480 },
        '3:2': { width: 720, height: 480 },
        '1:1': { width: 640, height: 640 }
      }
    },
    light: {
      fps: 24,
      quality: 18,
      apngColors: 64,
      webpQuality: 0.72,
      get label() { return T('quality.light'); },
      sizeMap: {
        '16:9': { width: 960, height: 540 },
        '8:5': { width: 960, height: 600 },
        '4:3': { width: 800, height: 600 },
        '3:2': { width: 900, height: 600 },
        '1:1': { width: 800, height: 800 }
      }
    },
    standard: {
      fps: 24,
      quality: 12,
      apngColors: 128,
      webpQuality: 0.82,
      get label() { return T('quality.standard'); },
      sizeMap: {
        '16:9': { width: 1280, height: 720 },
        '8:5': { width: 1280, height: 800 },
        '4:3': { width: 1024, height: 768 },
        '3:2': { width: 1200, height: 800 },
        '1:1': { width: 1024, height: 1024 }
      }
    },
    high: {
      fps: 24,
      quality: 8,
      apngColors: 256,
      webpQuality: 0.92,
      get label() { return T('quality.high'); },
      sizeMap: {
        '16:9': { width: 1920, height: 1080 },
        '8:5': { width: 1920, height: 1200 },
        '4:3': { width: 1600, height: 1200 },
        '3:2': { width: 1800, height: 1200 },
        '1:1': { width: 1600, height: 1600 }
      }
    }
  };

  /* 收錄版：上游在這裡有 effectLabels／effectFileLabels／imageFilterLabels 三張日文對照表，
   * 以及 ja／en／ko 三語的 i18n 物件與自己的語言切換。介面文字改由合輯的 i18n 引擎提供
   * （字典在 i18n.bg-motion.js），這裡只留「依 key 取字串」的小函式，用到時才查，
   * 切換語言後自然會拿到新語言的字串。 */
  function tOr(key, fallback) {
    const value = T(key);
    return value === key ? fallback : value;
  }

  function effectLabel(effect) {
    return tOr(`effect.${effect}`, '');
  }

  function effectFileLabel(effect) {
    return tOr(`effectFile.${effect}`, '');
  }

  function filterLabel(filter) {
    return tOr(`filter.${filter}`, '');
  }

  function loopLabel(loop) {
    return loop ? T('msg.loop') : T('msg.noLoop');
  }

  /* 狀態訊息裡「 / 警告文字」這一段：沒有警告時整段省略（與上游相同）。 */
  function warningSuffix(warning) {
    return warning ? ` / ${warning}` : '';
  }

  /* 「24FPS WebP…」的前綴：有指定 FPS 時才加上「24FPS 」。 */
  function fpsPrefix(fpsLabel) {
    return fpsLabel ? `${fpsLabel} ` : '';
  }

  function setText(selector, text) {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  }

  /* X（Twitter）分享連結：分享文字跟著語言，網址維持上游原站。 */
  const SHARE_URL = 'https://kumachansteps.github.io/trpg-web-tools/tools/haikei-motion-maker/';

  function updateShareLink() {
    const link = document.getElementById('xShareLink');
    if (!link) return;
    link.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${T('share.text')} ${SHARE_URL}`)}`;
  }

  /* 切換語言時重畫 JS 寫進畫面的文字（上游 applyLanguage() 裡非靜態的部分）。
   * 靜態標記由引擎依 data-i18n 換掉。 */
  function applyLocaleText(options = {}) {
    document.body.dataset.lang = I18N.locale;
    updateThumbPanelText();
    refreshSizeInputLabels();

    els.playBtn.textContent = state.playing ? T('action.stop') : T('action.play');
    [[els.exportWebpBtn, 'webp24'], [els.exportWebp30Btn, 'webp30'], [els.exportWebp60Btn, 'webp60']].forEach(([button, key]) => {
      if (!button) return;
      button.dataset.tooltip = T(`tooltip.${key}`);
      button.setAttribute('aria-label', `${T(`action.${key}`)}. ${T(`tooltip.${key}`)}`);
    });
    els.clearOutputBtn.textContent = state.isExporting ? T('action.cancelExport') : T('action.clear');

    updateShareLink();
    syncThemeButton();
    updateOutputFileName();
    updateImageInfo(state.imageFiles);
    if (state.imageFiles.length) updateTransitionThumbs();
    if (!options.silent) setStatus('');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getSeconds() {
    const value = Number.parseFloat(els.secondsInput.value);
    return clamp(Number.isFinite(value) ? value : 3, 0.5, 12);
  }

  function getEffectDefaultSeconds(effect) {
    switch (effect) {
      case 'quakeY2':
      case 'quakeX2':
      case 'quakeXY2':
        return 2.5;
      case 'panX':
        return 4;
      case 'spinFallBlack':
      case 'fadeBlack':
      case 'fadeWhite':
      case 'fadeTransparent':
        return 2;
      case 'rise':
      case 'descend':
        return 1.5;
      default:
        return 3;
    }
  }

  function getLoopDefault(effect) {
    return !['zoomIn', 'zoomInWhite', 'zoomInBlack', 'zoomOut', 'zoomOutWhite', 'zoomOutBlack', 'spinFallBlack', 'suckInWhite', 'suckInBlack', 'rise', 'descend', 'fadeBlack', 'fadeWhite', 'fadeTransparent'].includes(effect);
  }

  function formatFileSize(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb >= 9.95 ? 1 : 2)}MB`;
  }

  function getBlobSizeWarning(blob) {
    if (blob.size > MAX_OUTPUT_BYTES) {
      return T('msg.sizeWarning', formatFileSize(blob.size));
    }
    return '';
  }

  function getSizeLimitLabel() {
    return T('msg.sizeLimit', formatFileSize(MAX_OUTPUT_BYTES));
  }

  function buildFrameDelaySequence(totalFrames, totalDurationMs) {
    const frames = Math.max(1, Number(totalFrames) || 1);
    const durationMs = Math.max(frames, Math.round(Number(totalDurationMs) || 0));
    const baseDelay = Math.floor(durationMs / frames);
    let remainder = durationMs - (baseDelay * frames);
    const delays = new Array(frames).fill(baseDelay);
    for (let i = 0; i < frames && remainder > 0; i += 1, remainder -= 1) {
      delays[i] += 1;
    }
    return delays;
  }



  function getCurrentQualitySetting() {
    return qualitySettings[els.qualityInput.value] || qualitySettings.standard;
  }

  function getCurrentSizeCatalog() {
    const quality = getCurrentQualitySetting();
    return exportSizePresets.map(preset => {
      const dims = quality.sizeMap[preset.key];
      return {
        ...preset,
        width: dims.width,
        height: dims.height,
        label: `${preset.baseLabel}（${dims.width} × ${dims.height}）`
      };
    });
  }

  function getSizePresetByValue(value) {
    return getCurrentSizeCatalog().find(preset => preset.value === value) || null;
  }

  function refreshSizeInputLabels() {
    const selected = els.sizeInput.value;
    const catalog = getCurrentSizeCatalog();
    [...els.sizeInput.options].forEach(option => {
      if (option.value === 'original') {
        option.textContent = T('size.original');
        return;
      }
      const preset = catalog.find(item => item.value === option.value);
      if (preset) option.textContent = preset.label;
    });
    els.sizeInput.value = selected;
  }


  function pickRecommendedSizePreset(sourceW, sourceH) {
    if (!sourceW || !sourceH) return null;
    const sourceAspect = sourceW / sourceH;
    const sourceArea = sourceW * sourceH;

    const candidates = getCurrentSizeCatalog().map(preset => {
      const aspect = preset.width / preset.height;
      const area = preset.width * preset.height;
      const aspectDiff = Math.abs(aspect - sourceAspect);
      const upscalePenalty = area > sourceArea ? 5 : 0;
      const areaPenalty = Math.abs(area - Math.min(sourceArea, 1024 * 1024)) / (1024 * 1024);
      return { ...preset, score: aspectDiff * 10 + areaPenalty + upscalePenalty };
    }).sort((a, b) => a.score - b.score);

    return candidates[0] || getCurrentSizeCatalog()[0] || null;
  }

  function applyRecommendedOutputSettingsForFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return { recommendedSize: null, autoQuality: null, maxFileSize: 0 };
    const maxFileSize = list.reduce((max, file) => Math.max(max, file?.size || 0), 0);
    const result = { recommendedSize: null, autoQuality: null, maxFileSize };
    const preset = pickRecommendedSizePreset(state.imageWidth, state.imageHeight);

    els.sizeInput.value = 'original';

    if (maxFileSize >= AUTO_MINIMUM_FILE_BYTES) {
      result.autoQuality = 'minimum';
      els.qualityInput.value = 'minimum';
      if (preset) {
        els.sizeInput.value = preset.value;
        result.recommendedSize = preset;
      }
      return result;
    }

    if (maxFileSize >= AUTO_PRESET_FILE_BYTES) {
      result.autoQuality = 'light';
      els.qualityInput.value = 'light';
      if (preset) {
        els.sizeInput.value = preset.value;
        result.recommendedSize = preset;
      }
      return result;
    }

    if (maxFileSize >= AUTO_LIGHT_FILE_BYTES) {
      result.autoQuality = 'light';
      els.qualityInput.value = 'light';
      return result;
    }

    result.autoQuality = 'standard';
    els.qualityInput.value = 'standard';
    return result;
  }




  function showToast(message, type = 'info', duration = 3600) {
    if (!els.toastHost) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
    toast.textContent = message;
    els.toastHost.appendChild(toast);

    window.requestAnimationFrame(() => toast.classList.add('is-visible'));

    const timeout = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      window.setTimeout(() => toast.remove(), 500);
    }, duration);

    toast.addEventListener('click', () => {
      window.clearTimeout(timeout);
      toast.classList.remove('is-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    });
  }

  function showExportSizeToast(kind, blob) {
    if (blob && blob.size > MAX_OUTPUT_BYTES) {
      showToast(T('msg.exportTooLarge', kind), 'warning', 7200);
      return;
    }
    showToast(T('msg.exportReady', kind), 'success', 4400);
  }

  function getOriginalBaseName() {
    return sanitizeFileName(state.sourceBaseName || 'haikei_motion');
  }

  function buildOutputBaseName() {
    const original = getOriginalBaseName();
    const effectName = sanitizeFileName(effectFileLabel(state.effect) || effectLabel(state.effect) || 'motion');
    const filterName = sanitizeFileName(filterLabel(state.imageFilter) || T('filter.none'));
    const loopName = loopLabel(els.loopInput.checked);
    return sanitizeFileName(`${original}_${effectName}_${filterName}_${loopName}`);
  }

  function updateOutputFileName() {
    els.fileNameInput.value = buildOutputBaseName();
  }

  function sanitizeFileName(name) {
    const fallback = 'haikei_motion';
    return (name || fallback)
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_') || fallback;
  }

  function setStatus(message) {
    els.exportStatus.textContent = message || '';
    requestPreviewPanelLayoutSync();
  }


  function getQualityRecommendationText() {
    const quality = els.qualityInput.value;
    return quality === 'standard' || quality === 'high' ? T('export.qualityRecommendation') : '';
  }

  /* 上游的 updateQualityRecommendation() 只是把 .export-note 換成字典裡的固定文字；
   * 收錄版改用 data-i18n 由引擎處理，因此拿掉。 */

  function isTransitionEffect(effect = state.effect) {
    return ['transition', 'transitionHardcut', 'transitionWipe'].includes(effect);
  }

  function isFadeEffect(effect = state.effect) {
    return ['fadeBlack', 'fadeWhite', 'fadeTransparent'].includes(effect);
  }

  function isTransparentFadeEffect(effect = state.effect) {
    return effect === 'fadeTransparent';
  }

  function normalizeFadeOrder() {
    if (!Array.isArray(state.fadeOrder) || state.fadeOrder.length !== 2 || !state.fadeOrder.includes('image') || !state.fadeOrder.includes('fill')) {
      state.fadeOrder = ['image', 'fill'];
    }
    return state.fadeOrder;
  }

  function getFadeFillColor(effect = state.effect) {
    if (effect === 'fadeWhite') return '#ffffff';
    if (effect === 'fadeBlack') return '#000000';
    return null;
  }

  function getFadeFillLabel(effect = state.effect) {
    return tOr(`fadeFill.${effect}`, effect);
  }

  function getFadeMotionAlphas(progress) {
    const mix = smootherStep(progress);
    const order = normalizeFadeOrder();
    const imageFirst = order[0] === 'image';
    return {
      imageAlpha: imageFirst ? 1 - mix : mix,
      fillAlpha: imageFirst ? mix : 1 - mix
    };
  }

  function stabilizeTransparentFadeAlphas(imageAlpha, fillAlpha, progress) {
    const fadeOut = normalizeFadeOrder()[0] === 'image';
    const endSnapThreshold = 0.985;
    let nextImageAlpha = imageAlpha;
    let nextFillAlpha = fillAlpha;

    if (fadeOut) {
      if (progress >= endSnapThreshold) {
        return { imageAlpha: 0, fillAlpha: 1 };
      }
      if (nextImageAlpha <= 0.06) nextImageAlpha = 0;
      else if (nextImageAlpha >= 0.995) nextImageAlpha = 1;
      if (nextFillAlpha <= 0.005) nextFillAlpha = 0;
      else if (nextFillAlpha >= 0.94) nextFillAlpha = 1;
    } else {
      if (progress >= endSnapThreshold) {
        return { imageAlpha: 1, fillAlpha: 0 };
      }
      if (nextImageAlpha <= 0.005) nextImageAlpha = 0;
      else if (nextImageAlpha >= 0.94) nextImageAlpha = 1;
      if (nextFillAlpha <= 0.06) nextFillAlpha = 0;
      else if (nextFillAlpha >= 0.995) nextFillAlpha = 1;
    }

    return {
      imageAlpha: Math.max(0, Math.min(1, nextImageAlpha)),
      fillAlpha: Math.max(0, Math.min(1, nextFillAlpha))
    };
  }

  function updateThumbPanelText() {
    const isFade = isFadeEffect(state.effect);
    setText('.transition-thumb-head strong', isFade ? T('thumbs.fadeOrder') : T('thumbs.transitionOrder'));
    setText('.transition-thumb-head span', isFade ? T('thumbs.fadeHint') : T('thumbs.transitionHint'));
    els.transitionThumbList?.setAttribute('aria-label', isFade ? T('thumbs.fadeAria') : T('thumbs.transitionAria'));
  }

  function getTransitionVerb(effect = state.effect) {
    return tOr(`transitionVerb.${effect}`, T('transitionVerb.transition'));
  }

  function setEffectSelectionStatus() {
    const orderHint = isTransitionEffect(state.effect)
      ? (state.images.length >= 2
          ? T('msg.transitionHintImages', state.images.length, getTransitionVerb(state.effect))
          : (shouldUseSingleImageFilterTransition()
              ? T('msg.transitionHintSingleFilter', filterLabel(state.imageFilter))
              : T('msg.transitionHintNeedImages')))
      : (isFadeEffect(state.effect) && state.image ? T('msg.fadeOrderHint') : '');
    setStatus(T('msg.effectSelected', effectLabel(state.effect), loopLabel(els.loopInput.checked), orderHint, getQualityRecommendationText()));
  }


  function hideDownload() {
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    if (state.stillDownloadUrl) URL.revokeObjectURL(state.stillDownloadUrl);
    state.downloadUrl = '';
    state.downloadName = '';
    state.stillDownloadUrl = '';
    state.stillDownloadName = '';
    els.downloadLink.classList.add('is-disabled');
    els.downloadLink.setAttribute('aria-disabled', 'true');
  }


  function clearOutputDisplay() {
    hideDownload();
    setStatus('');
    drawFrame(state.stillFrameTime, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
    return true;
  }

  function stopPreview() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.playing = false;
    state.rafId = null;
    state.playStart = 0;
    els.playBtn.textContent = T('action.play');
  }

  function resetImage() {
    stopPreview();
    hideDownload();
    state.image = null;
    state.images = [];
    state.imageFiles = [];
    state.imageName = '';
    state.sourceBaseName = '';
    state.imageWidth = 0;
    state.imageHeight = 0;
    state.stillFrameTime = 0;
    state.imageFilter = 'none';
    state.draggedThumbIndex = null;
    state.fadeOrder = ['image', 'fill'];
    if (els.imageEditGrid) {
      [...els.imageEditGrid.querySelectorAll('.image-edit-card')].forEach(card => card.classList.toggle('is-active', card.dataset.filter === 'none'));
    }
    els.fileInput.value = '';
    els.fileNameInput.value = 'haikei_motion';
    els.canvasPlaceholder.classList.remove('is-hidden');
    els.imageInfo.innerHTML = `<p class="empty-note">${T('upload.empty')}</p>`;
    updateTransitionThumbs();
    updateTransitionThumbs();
    syncPreviewCanvasSize();
    drawFrame(0, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
    setStatus(T('msg.imageReset'));
    return true;
  }

  function toggleDrawer(drawer) {
    const willOpen = drawer.hidden;
    els.helpDrawer.hidden = true;
    els.shortcutDrawer.hidden = true;
    drawer.hidden = !willOpen;
  }

  function closeDrawers() {
    els.helpDrawer.hidden = true;
    els.shortcutDrawer.hidden = true;
    return true;
  }

  function syncPreviewCanvasSize() {
    const rect = els.previewCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(320, Math.round(rect.width * dpr));
    const nextHeight = Math.max(180, Math.round(rect.height * dpr));

    if (els.previewCanvas.width !== nextWidth || els.previewCanvas.height !== nextHeight) {
      els.previewCanvas.width = nextWidth;
      els.previewCanvas.height = nextHeight;
      drawFrame(state.stillFrameTime, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
    }
  }

  function makeThumbDataUrl(image, width = 104, height = 58) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const thumbCtx = canvas.getContext('2d');
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = 'high';
    thumbCtx.fillStyle = '#000';
    thumbCtx.fillRect(0, 0, width, height);
    const naturalW = image.naturalWidth || image.width || width;
    const naturalH = image.naturalHeight || image.height || height;
    const ratio = Math.max(width / naturalW, height / naturalH);
    const drawW = naturalW * ratio;
    const drawH = naturalH * ratio;
    thumbCtx.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  function shouldShowTransitionThumbs() {
    return (isTransitionEffect(state.effect) && state.images && state.images.length >= 2)
      || (isFadeEffect(state.effect) && Boolean(state.image));
  }

  function shouldUseSingleImageFilterTransition(effect = state.effect) {
    const imageCount = state.images?.length || (state.image ? 1 : 0);
    return isTransitionEffect(effect) && imageCount === 1 && state.imageFilter && state.imageFilter !== 'none';
  }

  function updateTransitionThumbs() {
    if (!els.transitionThumbPanel || !els.transitionThumbList) return;
    updateThumbPanelText();
    const show = shouldShowTransitionThumbs();
    els.transitionThumbPanel.hidden = !show;
    els.transitionThumbPanel.classList.toggle('is-visible', show);
    if (!show) {
      els.transitionThumbList.innerHTML = '';
      requestPreviewPanelLayoutSync();
      return;
    }

    if (isFadeEffect(state.effect)) {
      const order = normalizeFadeOrder();
      const file = state.imageFiles[0];
      const imageName = escapeHtml(file?.name || state.imageName || 'image');
      const imageSrc = makeThumbDataUrl(state.image, 150, 84);
      const fillLabel = escapeHtml(getFadeFillLabel(state.effect));
      els.transitionThumbList.innerHTML = order.map((kind, index) => {
        const isImage = kind === 'image';
        const title = isImage ? imageName : fillLabel;
        const visual = isImage
          ? `<img src="${imageSrc}" alt="${title}" draggable="false" />`
          : `<span class="fade-thumb-fill ${state.effect === 'fadeBlack' ? 'fade-thumb-black' : state.effect === 'fadeWhite' ? 'fade-thumb-white' : 'fade-thumb-transparent'}" aria-hidden="true"></span>`;
        return `
          <button class="transition-thumb-card" type="button" draggable="true" data-index="${index}" title="${title}">
            <span class="thumb-order">${index + 1}</span>
            ${visual}
            <span class="thumb-name">${title}</span>
          </button>
        `;
      }).join('');
      requestPreviewPanelLayoutSync();
      return;
    }

    els.transitionThumbList.innerHTML = state.images.map((image, index) => {
      const file = state.imageFiles[index];
      const name = escapeHtml(file?.name || `image_${index + 1}`);
      const src = makeThumbDataUrl(image, 150, 84);
      return `
        <button class="transition-thumb-card" type="button" draggable="true" data-index="${index}" title="${name}">
          <span class="thumb-order">${index + 1}</span>
          <img src="${src}" alt="${name}" draggable="false" />
          <span class="thumb-name">${name}</span>
        </button>
      `;
    }).join('');
    requestPreviewPanelLayoutSync();
  }

  function reorderTransitionImages(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

    if (isFadeEffect(state.effect)) {
      const order = normalizeFadeOrder();
      if (fromIndex >= order.length || toIndex >= order.length) return;
      const [item] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, item);
      state.fadeOrder = order;
      updateTransitionThumbs();
      drawFrame(state.stillFrameTime, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
      hideDownload();
      setStatus(T('msg.fadeOrderChanged', getQualityRecommendationText()));
      return;
    }

    if (fromIndex >= state.images.length || toIndex >= state.images.length) return;

    const [image] = state.images.splice(fromIndex, 1);
    state.images.splice(toIndex, 0, image);
    const [file] = state.imageFiles.splice(fromIndex, 1);
    state.imageFiles.splice(toIndex, 0, file);
    state.image = state.images[0] || null;
    state.imageWidth = state.image?.naturalWidth || 0;
    state.imageHeight = state.image?.naturalHeight || 0;
    updateImageInfo(state.imageFiles);
    updateTransitionThumbs();
    drawFrame(state.stillFrameTime, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
    hideDownload();
    setStatus(T('msg.transitionOrderChanged', state.images.length, getTransitionVerb(state.effect), getQualityRecommendationText()));
  }

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || '').startsWith('image/')) {
        reject(new Error('invalid-image'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ file, img });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`load-failed:${file.name || ''}`));
      };
      img.src = url;
    });
  }

  /* 收錄版：上游在這裡還有 detectImageTransparency() 與一組 get…Bucket() 函式，
   * 只用來組存取分析的參數；拿掉存取分析後一併移除。 */

  async function loadFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file && String(file.type || '').startsWith('image/'));
    if (!files.length) {
      setStatus(T('msg.selectImage'));
      return;
    }

    try {
      const loaded = await Promise.all(files.map(loadImageFile));
      state.images = loaded.map(entry => entry.img);
      state.imageFiles = loaded.map(entry => entry.file);
      state.image = state.images[0] || null;
      state.imageName = loaded.length === 1 ? loaded[0].file.name : `${loaded[0].file.name.replace(/\.[^/.]+$/, '')}_and_${loaded.length - 1}_more`;
      state.sourceBaseName = loaded.length === 1
        ? loaded[0].file.name.replace(/\.[^/.]+$/, '')
        : `${loaded[0].file.name.replace(/\.[^/.]+$/, '')}_and_${loaded.length - 1}_more`;
      state.imageWidth = state.image?.naturalWidth || 0;
      state.imageHeight = state.image?.naturalHeight || 0;
      state.stillFrameTime = 0;
      state.fadeOrder = ['image', 'fill'];

      const autoSettings = applyRecommendedOutputSettingsForFiles(state.imageFiles);
      updateOutputFileName();
      els.canvasPlaceholder.classList.add('is-hidden');
      updateImageInfo(state.imageFiles);
      updateTransitionThumbs();
      updateTransitionThumbs();
      syncPreviewCanvasSize();
      drawFrame(0, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
      const autoMessages = autoSettings.autoQuality === 'minimum'
        ? T('msg.autoMinimumQuality', autoSettings.recommendedSize ? autoSettings.recommendedSize.label : T('size.original'))
        : autoSettings.autoQuality === 'light' && autoSettings.recommendedSize
          ? T('msg.autoLightPresetQuality', autoSettings.recommendedSize.label)
          : autoSettings.autoQuality === 'light'
            ? T('msg.autoLightQuality')
            : autoSettings.autoQuality === 'standard'
              ? T('msg.autoStandardQuality')
              : '';
      setStatus(loaded.length >= 2
        ? T('msg.imagesLoadedTransition', loaded.length, autoMessages)
        : T('msg.imageLoaded', autoMessages));
      hideDownload();
    } catch (error) {
      console.error(error);
      setStatus(T('msg.imageLoadFailed'));
    }
  }

  /* 收錄版：上游的「範例圖」是作者提供的照片（不收錄），改成當場用 canvas 畫一張中性的
   * 範例背景——黃昏的夜空、月亮、遠山與亮著窗燈的街景剪影。尺寸與上游範例同為 4:3，
   * 畫好後轉成 JPEG 檔，走和使用者上傳相同的載入流程。 */
  function drawSampleBackground() {
    const width = 2048;
    const height = 1536;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');

    /* 固定種子的亂數，每次畫出來都一樣。 */
    let seed = 20260930;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const horizon = height * 0.78;
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0a1030');
    sky.addColorStop(0.5, '#23306a');
    sky.addColorStop(0.8, '#6f5a92');
    sky.addColorStop(1, '#e89a78');
    c.fillStyle = sky;
    c.fillRect(0, 0, width, height);

    /* 星星 */
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 220; i += 1) {
      const starX = random() * width;
      const starY = random() * horizon * 0.62;
      const radius = 0.8 + random() * 2.2;
      c.globalAlpha = 0.35 + random() * 0.65;
      c.beginPath();
      c.arc(starX, starY, radius, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    /* 月亮與光暈 */
    const moonX = width * 0.76;
    const moonY = height * 0.2;
    const moonR = width * 0.055;
    const moonGlow = c.createRadialGradient(moonX, moonY, moonR * 0.8, moonX, moonY, moonR * 4);
    moonGlow.addColorStop(0, 'rgba(255, 240, 200, 0.45)');
    moonGlow.addColorStop(1, 'rgba(255, 240, 200, 0)');
    c.fillStyle = moonGlow;
    c.fillRect(moonX - moonR * 4, moonY - moonR * 4, moonR * 8, moonR * 8);
    c.fillStyle = '#fdf1cc';
    c.beginPath();
    c.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    c.fill();

    /* 遠山 */
    c.fillStyle = '#2b2c5a';
    c.beginPath();
    c.moveTo(0, horizon);
    for (let hillX = 0; hillX <= width; hillX += 32) {
      c.lineTo(hillX, horizon - height * 0.08 - Math.sin(hillX / 260) * height * 0.035 - Math.sin(hillX / 97) * height * 0.012);
    }
    c.lineTo(width, horizon);
    c.closePath();
    c.fill();

    /* 街景剪影與窗燈 */
    const street = height * 0.9;
    let buildingX = -20;
    while (buildingX < width) {
      const buildingW = 120 + random() * 170;
      const buildingH = height * (0.14 + random() * 0.28);
      const top = street - buildingH;
      c.fillStyle = random() < 0.5 ? '#161a3a' : '#1c2046';
      c.fillRect(buildingX, top, buildingW, buildingH);
      if (random() < 0.3) {
        c.beginPath();
        c.moveTo(buildingX, top);
        c.lineTo(buildingX + buildingW / 2, top - buildingH * 0.18);
        c.lineTo(buildingX + buildingW, top);
        c.closePath();
        c.fill();
      }
      for (let windowY = top + 28; windowY < street - 40; windowY += 46) {
        for (let windowX = buildingX + 18; windowX < buildingX + buildingW - 30; windowX += 38) {
          if (random() < 0.42) {
            c.fillStyle = random() < 0.8 ? 'rgba(255, 206, 120, 0.92)' : 'rgba(160, 210, 255, 0.85)';
            c.fillRect(windowX, windowY, 18, 24);
          }
        }
      }
      buildingX += buildingW + 6 + random() * 18;
    }

    /* 地面 */
    c.fillStyle = '#0b0d1e';
    c.fillRect(0, street, width, height - street);

    /* 路燈 */
    const lampX = width * 0.22;
    const lampTop = height * 0.62;
    c.fillStyle = '#07080f';
    c.fillRect(lampX - 7, lampTop, 14, street - lampTop);
    c.fillRect(lampX - 7, lampTop, 70, 10);
    const lampGlow = c.createRadialGradient(lampX + 58, lampTop + 22, 4, lampX + 58, lampTop + 22, 170);
    lampGlow.addColorStop(0, 'rgba(255, 226, 160, 0.9)');
    lampGlow.addColorStop(1, 'rgba(255, 226, 160, 0)');
    c.fillStyle = lampGlow;
    c.fillRect(lampX - 112, lampTop - 148, 340, 340);

    return canvas;
  }

  async function loadSampleImage() {
    try {
      const canvas = drawSampleBackground();
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => (result ? resolve(result) : reject(new Error('Sample image encoding failed.'))), 'image/jpeg', 0.9);
      });
      await loadFiles([new File([blob], SAMPLE_IMAGE_NAME, { type: 'image/jpeg' })]);
      setStatus(T('msg.sampleLoaded'));
    } catch (error) {
      console.warn('Sample image could not be created:', error);
      setStatus(T('msg.sampleFailed'));
      showToast(T('msg.sampleFailed'), 'warning', 4200);
    }
  }

  function updateImageInfo(files) {
    const list = Array.from(files || []);
    if (!list.length) {
      els.imageInfo.innerHTML = `<p class="empty-note">${T('upload.empty')}</p>`;
      updateTransitionThumbs();
      return;
    }

    const totalKb = Math.max(1, Math.round(list.reduce((sum, file) => sum + (file.size || 0), 0) / 1024));
    if (list.length === 1) {
      const file = list[0];
      els.imageInfo.innerHTML = `
        <strong>${escapeHtml(file.name)}</strong><br>
        ${state.imageWidth} × ${state.imageHeight}px<br>
        ${T('msg.approxKb', totalKb.toLocaleString())}
      `;
      return;
    }

    const previewNames = list.slice(0, 3).map(file => escapeHtml(file.name)).join('<br>');
    const moreLabel = list.length > 3 ? T('msg.moreImages', list.length - 3) : '';
    els.imageInfo.innerHTML = T('msg.multiImageInfo', list.length, state.imageWidth, state.imageHeight, totalKb.toLocaleString(), previewNames, moreLabel);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function smootherStep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function getTransitionPair(progress) {
    const images = state.images && state.images.length ? state.images : (state.image ? [state.image] : []);
    if (!images.length) {
      return { current: null, next: null, mix: 0, index: 0, nextIndex: 0 };
    }
    if (images.length === 1) {
      return {
        current: images[0],
        next: images[0],
        mix: shouldUseSingleImageFilterTransition() ? smootherStep(progress) : 0,
        index: 0,
        nextIndex: 0,
        singleFilterTransition: shouldUseSingleImageFilterTransition()
      };
    }

    // v0.97: one transition loop is one-way through the uploaded order.
    // 2 images: A -> B, not A -> B -> A.
    // 3 images: A -> B -> C, not A -> B -> C -> A.
    const segmentCount = Math.max(1, images.length - 1);
    const clampedProgress = Math.min(Math.max(progress, 0), 1);

    if (clampedProgress >= 1) {
      const lastIndex = images.length - 1;
      return {
        current: images[lastIndex - 1],
        next: images[lastIndex],
        mix: 1,
        index: lastIndex - 1,
        nextIndex: lastIndex
      };
    }

    const raw = clampedProgress * segmentCount;
    const index = Math.min(segmentCount - 1, Math.floor(raw));
    const local = raw - index;
    const nextIndex = Math.min(images.length - 1, index + 1);

    return {
      current: images[index],
      next: images[nextIndex],
      mix: smootherStep(local),
      index,
      nextIndex
    };
  }

  function getMotion(effect, progress) {
    const eased = easeInOut(progress);
    const t = progress * Math.PI * 2;
    const loopWave = Math.sin(t);
    const breath = (1 - Math.cos(t)) / 2;

    const motion = { x: 0, y: 0, scale: 1, rotate: 0, overlay: null, overlayAlpha: 0, mode: null, amount: 0, cropScale: 1 };

    switch (effect) {
      case 'quakeY':
        motion.y = loopWave * 14 + Math.sin(progress * Math.PI * 18) * 4;
        motion.scale = 1.035;
        break;
      case 'quakeX':
        motion.x = loopWave * 16 + Math.sin(progress * Math.PI * 20) * 5;
        motion.scale = 1.035;
        break;
      case 'quakeXY':
        motion.x = Math.sin(t * 4) * 10 + Math.sin(t * 9) * 4;
        motion.y = Math.cos(t * 3) * 8 + Math.sin(t * 7) * 3;
        motion.rotate = Math.sin(t * 3) * 0.012;
        motion.scale = 1.055;
        break;
      case 'quakeY2':
        motion.y = loopWave * 14 + Math.sin(progress * Math.PI * 18) * 4;
        motion.mode = 'shakeNoZoom';
        break;
      case 'quakeX2':
        motion.x = loopWave * 16 + Math.sin(progress * Math.PI * 20) * 5;
        motion.mode = 'shakeNoZoom';
        break;
      case 'quakeXY2':
        motion.x = Math.sin(t * 4) * 10 + Math.sin(t * 9) * 4;
        motion.y = Math.cos(t * 3) * 8 + Math.sin(t * 7) * 3;
        motion.rotate = Math.sin(t * 3) * 0.012;
        motion.mode = 'shakeNoZoom';
        break;
      case 'drunk':
        motion.x = Math.sin(t) * 7 + Math.sin(t * 2 + 0.6) * 2.5;
        motion.y = Math.cos(t - 0.4) * 5 + Math.sin(t * 3) * 1.8;
        motion.rotate = Math.sin(t - 0.8) * 0.018;
        motion.mode = 'shakeNoZoom';
        break;
      case 'breathe':
        motion.scale = 1 + breath * 0.04;
        motion.y = -breath * 2;
        break;
      case 'panX':
        motion.x = Math.sin(t) * 54;
        motion.mode = 'shakeNoZoom';
        break;
      case 'wave':
        motion.scale = 1.05;
        motion.mode = 'wave';
        motion.amount = progress;
        break;
      case 'fadeBlack':
      case 'fadeWhite':
      case 'fadeTransparent': {
        let fade = getFadeMotionAlphas(progress);
        if (effect === 'fadeTransparent') {
          fade = stabilizeTransparentFadeAlphas(fade.imageAlpha, fade.fillAlpha, progress);
        }
        motion.mode = 'fadeFill';
        motion.imageAlpha = fade.imageAlpha;
        motion.fillAlpha = fade.fillAlpha;
        motion.fillColor = getFadeFillColor(effect);
        motion.scale = 1;
        motion.cropScale = 1;
        motion.progress = progress;
        break;
      }
      case 'transition': {
        const pair = getTransitionPair(progress);
        motion.mode = 'transition';
        motion.currentImage = pair.current;
        motion.nextImage = pair.next;
        motion.mix = pair.mix;
        motion.scale = 1.01;
        motion.cropScale = 1.02;
        break;
      }
      case 'transitionHardcut': {
        const pair = getTransitionPair(progress);
        motion.mode = 'transitionHardcut';
        motion.currentImage = pair.current;
        motion.nextImage = pair.next;
        motion.mix = pair.mix;
        motion.scale = 1.01;
        motion.cropScale = 1.02;
        break;
      }
      case 'transitionWipe': {
        const pair = getTransitionPair(progress);
        motion.mode = 'transitionWipe';
        motion.currentImage = pair.current;
        motion.nextImage = pair.next;
        motion.mix = pair.mix;
        motion.scale = 1.01;
        motion.cropScale = 1.02;
        break;
      }
      case 'spinFallBlack':
        motion.scale = 1.02;
        motion.cropScale = 1 - eased * 0.78;
        motion.rotate = eased * 1.18;
        motion.y = eased * 52;
        motion.overlay = '#000000';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      case 'suckInWhite':
        motion.scale = 1 + eased * 0.52;
        motion.rotate = eased * 0.20;
        motion.overlay = '#ffffff';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      case 'suckInBlack':
        motion.scale = 1 + eased * 0.52;
        motion.rotate = eased * 0.20;
        motion.overlay = '#000000';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      case 'rise':
        motion.y = -eased * 130;
        motion.mode = 'shakeNoZoom';
        motion.overlay = '#000000';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      case 'descend':
        motion.y = eased * 130;
        motion.mode = 'shakeNoZoom';
        motion.overlay = '#000000';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      case 'zoomIn':
        motion.scale = 1 + eased * 0.30;
        break;
      case 'zoomInWhite':
        motion.scale = 1 + eased * 0.34;
        motion.overlay = '#ffffff';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      case 'zoomInBlack':
        motion.scale = 1 + eased * 0.34;
        motion.overlay = '#000000';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      case 'zoomOut':
        motion.scale = 1.34 - eased * 0.34;
        break;
      case 'zoomOutWhite':
        motion.scale = 1.36 - eased * 0.36;
        motion.overlay = '#ffffff';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      case 'zoomOutBlack':
        motion.scale = 1.36 - eased * 0.36;
        motion.overlay = '#000000';
        motion.overlayAlpha = fadeEnd(progress);
        break;
      default:
        break;
    }

    return motion;
  }

  function getEffectBounds(effect) {
    switch (effect) {
      case 'quakeY':
        return { maxScale: 1.035, maxX: 0, maxY: 18, padding: 0 };
      case 'quakeX':
        return { maxScale: 1.035, maxX: 21, maxY: 0, padding: 0 };
      case 'quakeXY':
        return { maxScale: 1.055, maxX: 18, maxY: 14, padding: 0 };
      case 'quakeY2':
        return { maxScale: 1.0, maxX: 0, maxY: 18, padding: 0 };
      case 'quakeX2':
        return { maxScale: 1.0, maxX: 21, maxY: 0, padding: 0 };
      case 'quakeXY2':
        return { maxScale: 1.0, maxX: 18, maxY: 14, padding: 0 };
      case 'drunk':
        return { maxScale: 1.0, maxX: 12, maxY: 9, padding: 0 };
      case 'breathe':
        return { maxScale: 1.04, maxX: 0, maxY: 2, padding: 0 };
      case 'panX':
        return { maxScale: 1.0, maxX: 58, maxY: 0, padding: 0 };
      case 'wave':
        return { maxScale: 1.05, maxX: 18, maxY: 0, padding: 0 };
      case 'transition':
      case 'transitionHardcut':
      case 'transitionWipe':
        return { maxScale: 1.03, maxX: 0, maxY: 0, padding: 0 };
      case 'spinFallBlack':
        return { maxScale: 1.02, maxX: 0, maxY: 54, padding: 0 };
      case 'suckInWhite':
      case 'suckInBlack':
        return { maxScale: 1.52, maxX: 0, maxY: 0, padding: 0 };
      case 'rise':
      case 'descend':
        return { maxScale: 1.0, maxX: 0, maxY: 145, padding: 0 };
      case 'zoomIn':
        return { maxScale: 1.30, maxX: 0, maxY: 0, padding: 0 };
      case 'zoomInWhite':
      case 'zoomInBlack':
      case 'zoomOut':
      case 'zoomOutWhite':
      case 'zoomOutBlack':
        return { maxScale: 1.36, maxX: 0, maxY: 0, padding: 0 };
      default:
        return { maxScale: 1.0, maxX: 0, maxY: 0, padding: 0 };
    }
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function fadeEnd(t) {
    return clamp((t - 0.68) / 0.32, 0, 1);
  }

  function getPreviewExportRect(canvasW, canvasH) {
    const { width, height } = getExportSize();
    const ratio = width / height;
    const outerPad = 32;
    const maxW = Math.max(1, canvasW - outerPad * 2);
    const maxH = Math.max(1, canvasH - outerPad * 2);

    let drawW = maxW;
    let drawH = drawW / ratio;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * ratio;
    }

    return {
      x: (canvasW - drawW) / 2,
      y: (canvasH - drawH) / 2,
      width: drawW,
      height: drawH
    };
  }

  function drawWaveImage(targetCtx, progress, base) {
    const strips = 72;
    const srcSliceH = state.imageHeight / strips;
    const destSliceH = base.drawH / strips;
    const amp = base.drawW * 0.018;
    const phase = progress * Math.PI * 2;

    for (let i = 0; i < strips; i++) {
      const v = i / (strips - 1);
      const xOffset = amp * Math.sin(v * Math.PI * 6 + phase) + amp * 0.35 * Math.sin(v * Math.PI * 12 - phase * 1.2);
      targetCtx.drawImage(
        state.image,
        0,
        srcSliceH * i,
        state.imageWidth,
        srcSliceH + 1,
        -base.drawW / 2 + xOffset,
        -base.drawH / 2 + destSliceH * i,
        base.drawW,
        destSliceH + 1.5
      );
    }
  }


  function addRectOverlay(targetCtx, frameRect, color, alpha) {
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.fillStyle = color;
    targetCtx.fillRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    targetCtx.restore();
  }

  function addDirectionalGradient(targetCtx, frameRect, fromColor, toColor, alpha, mode = 'vertical') {
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    const grad = mode === 'diagonal'
      ? targetCtx.createLinearGradient(frameRect.x, frameRect.y, frameRect.x + frameRect.width, frameRect.y + frameRect.height)
      : targetCtx.createLinearGradient(frameRect.x, frameRect.y, frameRect.x, frameRect.y + frameRect.height);
    grad.addColorStop(0, fromColor);
    grad.addColorStop(1, toColor);
    targetCtx.fillStyle = grad;
    targetCtx.fillRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    targetCtx.restore();
  }

  function addVignetteOverlay(targetCtx, frameRect, strength = 0.28, color = '0, 0, 0') {
    targetCtx.save();
    const cx = frameRect.x + frameRect.width / 2;
    const cy = frameRect.y + frameRect.height / 2;
    const radius = Math.max(frameRect.width, frameRect.height) * 0.74;
    const grad = targetCtx.createRadialGradient(cx, cy, radius * 0.18, cx, cy, radius);
    grad.addColorStop(0, `rgba(${color}, 0)`);
    grad.addColorStop(0.68, `rgba(${color}, 0.02)`);
    grad.addColorStop(1, `rgba(${color}, ${strength})`);
    targetCtx.fillStyle = grad;
    targetCtx.fillRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    targetCtx.restore();
  }

  function addGlowBlob(targetCtx, frameRect, cxRatio, cyRatio, radiusRatio, color, alpha) {
    targetCtx.save();
    const cx = frameRect.x + frameRect.width * cxRatio;
    const cy = frameRect.y + frameRect.height * cyRatio;
    const radius = Math.max(frameRect.width, frameRect.height) * radiusRatio;
    const grad = targetCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    targetCtx.globalAlpha = alpha;
    targetCtx.fillStyle = grad;
    targetCtx.fillRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    targetCtx.restore();
  }

  function createRegionCanvas(targetCtx, frameRect) {
    const x = Math.max(0, Math.round(frameRect.x));
    const y = Math.max(0, Math.round(frameRect.y));
    const w = Math.max(1, Math.round(frameRect.width));
    const h = Math.max(1, Math.round(frameRect.height));
    const region = document.createElement('canvas');
    region.width = w;
    region.height = h;
    region.getContext('2d').drawImage(targetCtx.canvas, x, y, w, h, 0, 0, w, h);
    return { region, x, y, w, h };
  }

  function addFilmGrainNoise(targetCtx, frameRect, amount = 18, mono = true) {
    const x = Math.max(0, Math.round(frameRect.x));
    const y = Math.max(0, Math.round(frameRect.y));
    const w = Math.max(1, Math.round(frameRect.width));
    const h = Math.max(1, Math.round(frameRect.height));
    let imageData;
    try {
      imageData = targetCtx.getImageData(x, y, w, h);
    } catch (error) {
      console.warn('Grain skipped:', error);
      return;
    }
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (mono) {
        const noise = (Math.random() - 0.5) * amount;
        data[i] = clamp(Math.round(data[i] + noise), 0, 255);
        data[i + 1] = clamp(Math.round(data[i + 1] + noise), 0, 255);
        data[i + 2] = clamp(Math.round(data[i + 2] + noise), 0, 255);
      } else {
        data[i] = clamp(Math.round(data[i] + (Math.random() - 0.5) * amount), 0, 255);
        data[i + 1] = clamp(Math.round(data[i + 1] + (Math.random() - 0.5) * amount), 0, 255);
        data[i + 2] = clamp(Math.round(data[i + 2] + (Math.random() - 0.5) * amount), 0, 255);
      }
    }
    targetCtx.putImageData(imageData, x, y);
  }

  function addChromaticAberration(targetCtx, frameRect, offset = 3) {
    const x = Math.max(0, Math.round(frameRect.x));
    const y = Math.max(0, Math.round(frameRect.y));
    const w = Math.max(1, Math.round(frameRect.width));
    const h = Math.max(1, Math.round(frameRect.height));
    let original;
    try {
      original = targetCtx.getImageData(x, y, w, h);
    } catch (error) {
      console.warn('Chromatic aberration skipped:', error);
      return;
    }
    const src = original.data;
    const out = new Uint8ClampedArray(src);
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) {
        const idx = (yy * w + xx) * 4;
        const leftX = clamp(xx - offset, 0, w - 1);
        const rightX = clamp(xx + offset, 0, w - 1);
        const upY = clamp(yy - Math.max(1, Math.floor(offset / 2)), 0, h - 1);
        const leftIdx = (yy * w + leftX) * 4;
        const rightIdx = (yy * w + rightX) * 4;
        const upIdx = (upY * w + xx) * 4;
        out[idx] = src[leftIdx];
        out[idx + 1] = src[upIdx + 1];
        out[idx + 2] = src[rightIdx + 2];
      }
    }
    targetCtx.putImageData(new ImageData(out, w, h), x, y);
  }

  function overlayBlurredRegion(targetCtx, frameRect, blurPx = 4, alpha = 0.35, brightness = 1.04) {
    const { region, x, y, w, h } = createRegionCanvas(targetCtx, frameRect);
    const temp = document.createElement('canvas');
    temp.width = w; temp.height = h;
    const tctx = temp.getContext('2d');
    tctx.filter = `blur(${blurPx}px) brightness(${brightness})`;
    tctx.drawImage(region, 0, 0);
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.drawImage(temp, x, y);
    targetCtx.restore();
  }

  function applyConvolutionRegion(targetCtx, frameRect, kernel, divisor = 1, offset = 0, mix = 1) {
    const x = Math.max(0, Math.round(frameRect.x));
    const y = Math.max(0, Math.round(frameRect.y));
    const w = Math.max(1, Math.round(frameRect.width));
    const h = Math.max(1, Math.round(frameRect.height));
    let imageData;
    try {
      imageData = targetCtx.getImageData(x, y, w, h);
    } catch (error) {
      console.warn('Convolution skipped:', error);
      return;
    }
    const src = imageData.data;
    const out = new Uint8ClampedArray(src);
    const size = Math.round(Math.sqrt(kernel.length));
    const half = Math.floor(size / 2);
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) {
        const idx = (yy * w + xx) * 4;
        for (let c = 0; c < 3; c += 1) {
          let sum = 0;
          for (let ky = 0; ky < size; ky += 1) {
            for (let kx = 0; kx < size; kx += 1) {
              const px = clamp(xx + kx - half, 0, w - 1);
              const py = clamp(yy + ky - half, 0, h - 1);
              const pidx = (py * w + px) * 4 + c;
              sum += src[pidx] * kernel[ky * size + kx];
            }
          }
          const conv = clamp(Math.round(sum / divisor + offset), 0, 255);
          out[idx + c] = clamp(Math.round(src[idx + c] * (1 - mix) + conv * mix), 0, 255);
        }
      }
    }
    targetCtx.putImageData(new ImageData(out, w, h), x, y);
  }

  function addRainStreaks(targetCtx, frameRect, count = 24) {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    targetCtx.clip();
    targetCtx.strokeStyle = 'rgba(190, 215, 255, 0.12)';
    targetCtx.lineWidth = 1.2;
    for (let i = 0; i < count; i += 1) {
      const sx = frameRect.x + Math.random() * frameRect.width;
      const sy = frameRect.y + Math.random() * frameRect.height;
      const len = 12 + Math.random() * 18;
      targetCtx.beginPath();
      targetCtx.moveTo(sx, sy);
      targetCtx.lineTo(sx - len * 0.22, sy + len);
      targetCtx.stroke();
    }
    targetCtx.restore();
  }


  function applyPixelateRegion(targetCtx, frameRect, pixelSize = 8) {
    const { region, x, y, w, h } = createRegionCanvas(targetCtx, frameRect);
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(w / pixelSize));
    small.height = Math.max(1, Math.round(h / pixelSize));
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'low';
    sctx.clearRect(0, 0, small.width, small.height);
    sctx.drawImage(region, 0, 0, small.width, small.height);
    targetCtx.save();
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.clearRect(x, y, w, h);
    targetCtx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    targetCtx.restore();
  }

  function buildEdgeCanvas(region, options = {}) {
    const w = region.width;
    const h = region.height;
    const rctx = region.getContext('2d');
    const srcData = rctx.getImageData(0, 0, w, h);
    const src = srcData.data;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const octx = outCanvas.getContext('2d');
    const outData = octx.createImageData(w, h);
    const out = outData.data;
    const invert = !!options.invert;
    const threshold = options.threshold ?? 26;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        const here = src[idx] * 0.299 + src[idx + 1] * 0.587 + src[idx + 2] * 0.114;
        const rx = Math.min(w - 1, x + 1);
        const by = Math.min(h - 1, y + 1);
        const ridx = (y * w + rx) * 4;
        const bidx = (by * w + x) * 4;
        const right = src[ridx] * 0.299 + src[ridx + 1] * 0.587 + src[ridx + 2] * 0.114;
        const down = src[bidx] * 0.299 + src[bidx + 1] * 0.587 + src[bidx + 2] * 0.114;
        const edge = Math.abs(here - right) + Math.abs(here - down);
        const edgeStrength = clamp((edge - threshold) * 3.2, 0, 255);
        const base = invert ? 0 : 255;
        const lineVal = invert ? edgeStrength : 255 - edgeStrength;
        out[idx] = invert ? lineVal : Math.min(base, lineVal);
        out[idx + 1] = invert ? lineVal : Math.min(base, lineVal);
        out[idx + 2] = invert ? lineVal : Math.min(base, lineVal);
        out[idx + 3] = 255;
      }
    }
    octx.putImageData(outData, 0, 0);
    return outCanvas;
  }

  function replaceWithEdgeCanvas(targetCtx, frameRect, options = {}) {
    const { region, x, y } = createRegionCanvas(targetCtx, frameRect);
    const edgeCanvas = buildEdgeCanvas(region, options);
    targetCtx.drawImage(edgeCanvas, x, y);
  }

  function overlayEdgeLines(targetCtx, frameRect, options = {}) {
    const { region, x, y } = createRegionCanvas(targetCtx, frameRect);
    const edgeCanvas = buildEdgeCanvas(region, options);
    targetCtx.save();
    targetCtx.globalAlpha = options.alpha ?? 0.85;
    targetCtx.globalCompositeOperation = options.blend || 'multiply';
    targetCtx.drawImage(edgeCanvas, x, y);
    targetCtx.restore();
  }

  function addScanlines(targetCtx, frameRect, alpha = 0.14, gap = 3) {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    targetCtx.clip();
    targetCtx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (let y = Math.round(frameRect.y); y < frameRect.y + frameRect.height; y += gap) {
      targetCtx.fillRect(frameRect.x, y, frameRect.width, 1);
    }
    targetCtx.restore();
  }

  function applyImageFilterToCanvas(targetCtx, frameRect, filter) {
    if (!filter || filter === 'none') return;
    const x = Math.max(0, Math.round(frameRect.x));
    const y = Math.max(0, Math.round(frameRect.y));
    const w = Math.max(1, Math.round(frameRect.width));
    const h = Math.max(1, Math.round(frameRect.height));
    let imageData;
    try {
      imageData = targetCtx.getImageData(x, y, w, h);
    } catch (error) {
      console.warn('Image filter skipped:', error);
      return;
    }
    const data = imageData.data;
    const posterizeStep = 64;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const highlight = clamp((luma - 112) / 143, 0, 1);
      const shadow = clamp((132 - luma) / 132, 0, 1);
      const satCenter = (r + g + b) / 3;
      const contrast = 1.18;

      if (filter === 'posterize') {
        r = Math.round(r / posterizeStep) * posterizeStep;
        g = Math.round(g / posterizeStep) * posterizeStep;
        b = Math.round(b / posterizeStep) * posterizeStep;
      } else if (filter === 'grayscale') {
        const gray = luma; r = g = b = gray;
      } else if (filter === 'sepia') {
        const nr = r * 0.393 + g * 0.769 + b * 0.189;
        const ng = r * 0.349 + g * 0.686 + b * 0.168;
        const nb = r * 0.272 + g * 0.534 + b * 0.131; r = nr; g = ng; b = nb;
      } else if (filter === 'contrastBoost') {
        r = (r - 128) * contrast + 128;
        g = (g - 128) * contrast + 128;
        b = (b - 128) * contrast + 128;
      } else if (filter === 'softFocus') {
        r = r * 1.02 + 6;
        g = g * 1.02 + 6;
        b = b * 1.03 + 8;
      } else if (filter === 'sharpen') {
        r = (r - 128) * 1.06 + 128;
        g = (g - 128) * 1.06 + 128;
        b = (b - 128) * 1.06 + 128;
      } else if (filter === 'sumiInk') {
        const gray = luma;
        r = gray * 0.95;
        g = gray * 0.95;
        b = gray * 0.95;
      } else if (filter === 'noiseBoost') {
        r = (r - 128) * 1.10 + 128;
        g = (g - 128) * 1.10 + 128;
        b = (b - 128) * 1.10 + 128;
      } else if (filter === 'crt') {
        r = r * 0.90 + 10;
        g = g * 0.98 + 14;
        b = b * 0.92 + 12;
      } else if (filter === 'vignette') {
        r = (r - satCenter) * 1.08 + satCenter;
        g = (g - satCenter) * 1.08 + satCenter;
        b = (b - satCenter) * 1.08 + satCenter;
      } else if (filter === 'chromaticAberration') {
        r = (r - 128) * 1.04 + 128;
        g = (g - 128) * 1.01 + 128;
        b = (b - 128) * 1.04 + 128;
      } else if (filter === 'morning') {
        r = r * 1.08 + 18;
        g = g * 1.04 + 10;
        b = b * 0.95 + 4;
      } else if (filter === 'midday') {
        r = r * 1.04 + 8;
        g = g * 1.04 + 8;
        b = b * 1.02 + 4;
      } else if (filter === 'evening') {
        r = r * 1.02 + 34 * highlight + 10;
        g = g * 0.97 + 12 * highlight + 2;
        b = b * 0.84 - 12 * highlight + 8 * shadow;
      } else if (filter === 'night') {
        r = r * 0.42 + luma * 0.05 + 2;
        g = g * 0.50 + luma * 0.07 + 4;
        b = b * 0.78 + 16 + luma * 0.03;
      } else if (filter === 'deepNight') {
        r = r * 0.24 + 1;
        g = g * 0.32 + 2;
        b = b * 0.62 + 16;
      } else if (filter === 'moonlight') {
        r = r * 0.48 + luma * 0.06 + 8;
        g = g * 0.58 + luma * 0.08 + 10;
        b = b * 0.88 + 22;
        if (highlight > 0.55) b += 10 * highlight;
      } else if (filter === 'horror') {
        const gray = luma;
        r = gray * 0.72 + r * 0.18 + 22 * highlight;
        g = gray * 0.84 + g * 0.20 + 6;
        b = gray * 0.72 + b * 0.10 + 10 * shadow;
      } else if (filter === 'fog') {
        r = (r - 128) * 0.78 + 150;
        g = (g - 128) * 0.78 + 154;
        b = (b - 128) * 0.78 + 160;
      } else if (filter === 'cyber') {
        r = r * 0.88 + 18 * highlight + 8;
        g = g * 0.86 + 10;
        b = b * 1.08 + 22;
      } else if (filter === 'underwater') {
        r = r * 0.55 + 6;
        g = g * 0.88 + 14;
        b = b * 1.02 + 16;
      } else if (filter === 'dream') {
        r = r * 1.03 + 12;
        g = g * 1.01 + 8;
        b = b * 1.06 + 14;
      } else if (filter === 'vintagePhoto') {
        const nr = r * 0.393 + g * 0.769 + b * 0.189;
        const ng = r * 0.349 + g * 0.686 + b * 0.168;
        const nb = r * 0.272 + g * 0.534 + b * 0.131;
        r = nr * 0.92 + 8;
        g = ng * 0.90 + 6;
        b = nb * 0.82 + 2;
      }

      data[i] = clamp(Math.round(r), 0, 255);
      data[i + 1] = clamp(Math.round(g), 0, 255);
      data[i + 2] = clamp(Math.round(b), 0, 255);
    }

    targetCtx.putImageData(imageData, x, y);

    if (filter === 'softFocus') {
      overlayBlurredRegion(targetCtx, frameRect, 5, 0.30, 1.05);
      addGlowBlob(targetCtx, frameRect, 0.5, 0.4, 0.42, 'rgba(255,245,230,1)', 0.10);
    } else if (filter === 'sharpen') {
      applyConvolutionRegion(targetCtx, frameRect, [0,-1,0,-1,5,-1,0,-1,0], 1, 0, 0.50);
    } else if (filter === 'lineExtract') {
      replaceWithEdgeCanvas(targetCtx, frameRect, { invert: false, threshold: 24 });
    } else if (filter === 'whiteLineExtract') {
      replaceWithEdgeCanvas(targetCtx, frameRect, { invert: true, threshold: 22 });
    } else if (filter === 'sumiInk') {
      applyConvolutionRegion(targetCtx, frameRect, [0,-1,0,-1,5,-1,0,-1,0], 1, 0, 0.32);
      overlayEdgeLines(targetCtx, frameRect, { invert: false, threshold: 22, alpha: 0.72, blend: 'multiply' });
      addVignetteOverlay(targetCtx, frameRect, 0.16, '20, 20, 20');
    } else if (filter === 'pixelate') {
      applyPixelateRegion(targetCtx, frameRect, 10);
    } else if (filter === 'noiseBoost') {
      addFilmGrainNoise(targetCtx, frameRect, 34, false);
      addVignetteOverlay(targetCtx, frameRect, 0.14, '10, 10, 10');
    } else if (filter === 'crt') {
      addChromaticAberration(targetCtx, frameRect, 3);
      addScanlines(targetCtx, frameRect, 0.16, 3);
      addRectOverlay(targetCtx, frameRect, '#0d1208', 0.05);
      addVignetteOverlay(targetCtx, frameRect, 0.22, '0, 0, 0');
    } else if (filter === 'vignette') {
      addVignetteOverlay(targetCtx, frameRect, 0.54, '0, 0, 0');
    } else if (filter === 'chromaticAberration') {
      addChromaticAberration(targetCtx, frameRect, 4);
      addVignetteOverlay(targetCtx, frameRect, 0.18, '10, 10, 10');
    } else if (filter === 'morning') {
      addRectOverlay(targetCtx, frameRect, '#fff3cf', 0.08);
      addGlowBlob(targetCtx, frameRect, 0.78, 0.22, 0.30, 'rgba(255,242,204,1)', 0.14);
    } else if (filter === 'midday') {
      addRectOverlay(targetCtx, frameRect, '#ffffff', 0.03);
    } else if (filter === 'evening') {
      addDirectionalGradient(targetCtx, frameRect, 'rgba(255,196,122,0.95)', 'rgba(44,44,96,0.00)', 0.22, 'vertical');
      addDirectionalGradient(targetCtx, frameRect, 'rgba(255,154,82,0.65)', 'rgba(0,0,0,0)', 0.14, 'diagonal');
      addVignetteOverlay(targetCtx, frameRect, 0.18, '50, 18, 0');
    } else if (filter === 'night') {
      addRectOverlay(targetCtx, frameRect, '#0a1733', 0.12);
      addDirectionalGradient(targetCtx, frameRect, 'rgba(36,62,132,0.50)', 'rgba(5,10,22,0.12)', 0.14, 'vertical');
      addVignetteOverlay(targetCtx, frameRect, 0.26, '3, 7, 18');
    } else if (filter === 'deepNight') {
      addRectOverlay(targetCtx, frameRect, '#050d1f', 0.22);
      addDirectionalGradient(targetCtx, frameRect, 'rgba(24,42,92,0.50)', 'rgba(0,0,0,0.12)', 0.16, 'vertical');
      addVignetteOverlay(targetCtx, frameRect, 0.40, '2, 5, 14');
    } else if (filter === 'moonlight') {
      addGlowBlob(targetCtx, frameRect, 0.76, 0.18, 0.32, 'rgba(196,224,255,1)', 0.18);
      addDirectionalGradient(targetCtx, frameRect, 'rgba(128,160,224,0.55)', 'rgba(8,14,28,0.00)', 0.14, 'diagonal');
      addVignetteOverlay(targetCtx, frameRect, 0.24, '4, 9, 20');
    } else if (filter === 'horror') {
      addRectOverlay(targetCtx, frameRect, '#182014', 0.10);
      addDirectionalGradient(targetCtx, frameRect, 'rgba(98,12,12,0.45)', 'rgba(0,0,0,0)', 0.12, 'diagonal');
      addVignetteOverlay(targetCtx, frameRect, 0.36, '6, 2, 2');
      addFilmGrainNoise(targetCtx, frameRect, 10);
    } else if (filter === 'fog') {
      addRectOverlay(targetCtx, frameRect, '#e8edf3', 0.10);
      addGlowBlob(targetCtx, frameRect, 0.24, 0.66, 0.42, 'rgba(255,255,255,1)', 0.14);
      addGlowBlob(targetCtx, frameRect, 0.72, 0.34, 0.38, 'rgba(255,255,255,1)', 0.12);
      addVignetteOverlay(targetCtx, frameRect, 0.12, '180, 190, 200');
    } else if (filter === 'cyber') {
      addDirectionalGradient(targetCtx, frameRect, 'rgba(255,0,140,0.24)', 'rgba(0,0,0,0)', 0.20, 'diagonal');
      addDirectionalGradient(targetCtx, frameRect, 'rgba(0,224,255,0.26)', 'rgba(0,0,0,0)', 0.18, 'vertical');
      addChromaticAberration(targetCtx, frameRect, 3);
      addVignetteOverlay(targetCtx, frameRect, 0.18, '5, 5, 12');
    } else if (filter === 'underwater') {
      addRectOverlay(targetCtx, frameRect, '#0b6b7e', 0.08);
      addDirectionalGradient(targetCtx, frameRect, 'rgba(135,255,244,0.16)', 'rgba(0,0,0,0)', 0.12, 'vertical');
      overlayBlurredRegion(targetCtx, frameRect, 2.8, 0.12, 1.00);
      addVignetteOverlay(targetCtx, frameRect, 0.18, '2, 24, 28');
    } else if (filter === 'dream') {
      overlayBlurredRegion(targetCtx, frameRect, 6, 0.34, 1.06);
      addGlowBlob(targetCtx, frameRect, 0.48, 0.38, 0.48, 'rgba(255,236,252,1)', 0.16);
      addDirectionalGradient(targetCtx, frameRect, 'rgba(255,221,244,0.22)', 'rgba(196,218,255,0.00)', 0.16, 'diagonal');
      addVignetteOverlay(targetCtx, frameRect, 0.12, '120, 110, 160');
    } else if (filter === 'vintagePhoto') {
      addFilmGrainNoise(targetCtx, frameRect, 16);
      addRectOverlay(targetCtx, frameRect, '#f5e2c2', 0.08);
      addVignetteOverlay(targetCtx, frameRect, 0.30, '40, 24, 6');
    }
  }


  function syncCardTabIndex(container, selector, activeButton) {
    if (!container) return;
    const buttons = [...container.querySelectorAll(selector)];
    const fallback = activeButton || buttons.find(button => !button.disabled) || null;
    buttons.forEach(button => {
      button.tabIndex = button === fallback ? 0 : -1;
    });
  }

  function getGridColumnCount(container) {
    if (!container) return 1;
    const style = window.getComputedStyle(container);
    const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length;
    return Math.max(1, cols || 1);
  }

  function moveCardSelection(container, selector, currentButton, step) {
    if (!container || !currentButton) return;
    const buttons = [...container.querySelectorAll(selector)].filter(button => !button.disabled);
    if (!buttons.length) return;
    const currentIndex = Math.max(0, buttons.indexOf(currentButton));
    const nextIndex = clamp(currentIndex + step, 0, buttons.length - 1);
    const nextButton = buttons[nextIndex];
    if (!nextButton || nextButton === currentButton) return;
    nextButton.focus();
    nextButton.click();
  }

  function attachCardKeyboardNavigation(container, selector) {
    if (!container) return;
    container.addEventListener('keydown', event => {
      const button = event.target.closest(selector);
      if (!button) return;
      const cols = getGridColumnCount(container);

      if (event.key === 'Tab') {
        event.preventDefault();
        moveCardSelection(container, selector, button, event.shiftKey ? -1 : 1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveCardSelection(container, selector, button, -1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveCardSelection(container, selector, button, 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveCardSelection(container, selector, button, -cols);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveCardSelection(container, selector, button, cols);
      }
    });
  }

  function updateExportNoteVisibility() {
    if (!els.exportNote) return;
    const hideNote = isTransitionEffect(state.effect) || isFadeEffect(state.effect);
    els.exportNote.hidden = hideNote;
    els.exportNote.classList.toggle('is-hidden', hideNote);
  }

  function syncViewportWorkspaceLayout() {
    const workspace = document.querySelector('.workspace');
    const header = document.querySelector('.app-header');
    const shell = document.querySelector('.app-shell');
    if (!workspace || !header || !shell) return;

    const isStackedLayout = window.matchMedia('(max-width: 1180px)').matches;
    const root = document.documentElement;

    if (isStackedLayout) {
      root.classList.remove('viewport-fit-workspace', 'viewport-short-workspace');
      root.style.removeProperty('--workspace-target-height');
      root.style.removeProperty('--preview-canvas-target-height');
      workspace.style.removeProperty('--workspace-target-height');
      return;
    }

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 900;
    const shellStyle = window.getComputedStyle(shell);
    const shellPadTop = parseFloat(shellStyle.paddingTop || '0');
    const shellPadBottom = parseFloat(shellStyle.paddingBottom || '0');
    const shellGap = parseFloat(shellStyle.rowGap || shellStyle.gap || '0');
    const headerHeight = Math.ceil(header.getBoundingClientRect().height || 0);

    const remainingHeight = Math.floor(viewportHeight - (shellPadTop + shellPadBottom + shellGap + headerHeight));
    const enoughViewportHeight = remainingHeight >= 640;
    const targetWorkspaceHeight = enoughViewportHeight
      ? Math.max(640, remainingHeight)
      : Math.max(560, viewportHeight);

    const targetCanvasHeight = enoughViewportHeight
      ? Math.max(250, Math.min(390, Math.round(targetWorkspaceHeight * 0.36)))
      : Math.max(210, Math.min(320, Math.round(viewportHeight * 0.31)));

    root.classList.toggle('viewport-fit-workspace', enoughViewportHeight);
    root.classList.toggle('viewport-short-workspace', !enoughViewportHeight);
    root.style.setProperty('--workspace-target-height', `${targetWorkspaceHeight}px`);
    root.style.setProperty('--preview-canvas-target-height', `${targetCanvasHeight}px`);
    workspace.style.setProperty('--workspace-target-height', `${targetWorkspaceHeight}px`);
  }

  function syncPreviewPanelLayout() {
    const panel = els.previewPanel;
    const canvasWrap = els.previewCanvas?.closest('.canvas-wrap');
    const controls = els.previewControls;
    const heading = panel?.querySelector('.panel-heading');
    const transitionPanel = els.transitionThumbPanel;
    if (!panel || !canvasWrap || !controls || !heading) return;

    syncViewportWorkspaceLayout();

    const isStackedLayout = window.matchMedia('(max-width: 1180px)').matches;
    const isShortViewportLayout = document.documentElement.classList.contains('viewport-short-workspace');

    if (isStackedLayout || isShortViewportLayout) {
      canvasWrap.style.height = '';
      canvasWrap.style.minHeight = '';
      canvasWrap.style.maxHeight = '';
      controls.style.maxHeight = '';
      panel.style.removeProperty('--preview-controls-height');
      return;
    }

    const style = window.getComputedStyle(panel);
    const panelPaddingTop = parseFloat(style.paddingTop || '0');
    const panelPaddingBottom = parseFloat(style.paddingBottom || '0');
    const gap = parseFloat(style.rowGap || style.gap || '0');
    const isTransitionVisible = transitionPanel && !transitionPanel.hidden;
    const visibleBlocks = [heading, canvasWrap, controls].filter(Boolean).length + (isTransitionVisible ? 1 : 0);
    const gapTotal = Math.max(0, visibleBlocks - 1) * gap;
    const shortLaptop = window.matchMedia('(max-height: 820px)').matches;
    const minPreviewHeight = shortLaptop ? 240 : 300;

    const fullControlsHeight = controls.scrollHeight || controls.offsetHeight;
    const transitionHeight = isTransitionVisible ? transitionPanel.offsetHeight : 0;
    const reserved = panelPaddingTop + panelPaddingBottom + heading.offsetHeight + transitionHeight + gapTotal;
    const available = panel.clientHeight - reserved;

    if (!Number.isFinite(available) || available <= 0) return;

    const controlsMaxHeight = Math.max(210, Math.min(fullControlsHeight, available - minPreviewHeight));
    const nextHeight = Math.max(minPreviewHeight, available - controlsMaxHeight);

    const nextControlsHeight = `${Math.floor(controlsMaxHeight)}px`;
    const nextCanvasHeight = `${Math.floor(nextHeight)}px`;

    if (controls.style.maxHeight !== nextControlsHeight) {
      controls.style.maxHeight = nextControlsHeight;
    }
    if (canvasWrap.style.height !== nextCanvasHeight) {
      canvasWrap.style.height = nextCanvasHeight;
      canvasWrap.style.minHeight = nextCanvasHeight;
    }
    panel.style.setProperty('--preview-controls-height', `${Math.ceil(controlsMaxHeight)}px`);
  }

  let previewLayoutSyncPending = false;

  function requestPreviewPanelLayoutSync() {
    if (previewLayoutSyncPending) return;
    previewLayoutSyncPending = true;
    window.requestAnimationFrame(() => {
      previewLayoutSyncPending = false;
      syncPreviewCanvasSize();
      syncPreviewPanelLayout();
      drawFrame(state.stillFrameTime, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
    });
  }

  function setActiveTab(panelName) {
    const showMotion = panelName !== 'imageEdit';
    els.motionTab?.classList.toggle('is-active', showMotion);
    els.imageEditTab?.classList.toggle('is-active', !showMotion);
    els.motionTab?.setAttribute('aria-selected', String(showMotion));
    els.imageEditTab?.setAttribute('aria-selected', String(!showMotion));
    if (els.motionPanel) { els.motionPanel.hidden = !showMotion; els.motionPanel.classList.toggle('is-active', showMotion); }
    if (els.imageEditPanel) { els.imageEditPanel.hidden = showMotion; els.imageEditPanel.classList.toggle('is-active', !showMotion); }
  }

  async function prepareFilteredStillDownload() {
    if (!state.image && !(state.images && state.images.length)) return;
    if (state.effect && state.effect !== 'none') return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = els.previewCanvas.width;
      canvas.height = els.previewCanvas.height;
      const c = canvas.getContext('2d', { willReadFrequently: true });

      drawFrame(state.stillFrameTime, c, canvas.width, canvas.height, { preview: false });

      const blob = await canvasToPngBlob(canvas);
      if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
      state.downloadUrl = URL.createObjectURL(blob);
      state.downloadName = `${buildOutputBaseName()}_still.png`;
      state.stillDownloadUrl = '';
      state.stillDownloadName = '';
      els.downloadLink.classList.remove('is-disabled');
      els.downloadLink.setAttribute('aria-disabled', 'false');
    } catch (error) {
      /* 上游在這裡只送出存取分析的錯誤事件，不另外提示使用者。 */
    }
  }

  function selectImageFilter(button) {
    if (!button || button.disabled) return;
    state.imageFilter = button.dataset.filter || 'none';
    [...els.imageEditGrid.querySelectorAll('.image-edit-card')].forEach(card => card.classList.remove('is-active'));
    button.classList.add('is-active');
    syncCardTabIndex(els.imageEditGrid, '.image-edit-card', button);
    updateOutputFileName();
    drawFrame(state.stillFrameTime, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
    const singleTransitionHint = shouldUseSingleImageFilterTransition()
      ? T('msg.transitionHintSingleFilter', filterLabel(state.imageFilter) || T('filter.none'))
      : '';
    setStatus(T('msg.filterSelected', filterLabel(state.imageFilter) || T('filter.none'), `${singleTransitionHint}${getQualityRecommendationText()}`));

    // Allow direct still-image download when only image editing is selected.
    if (state.imageFilter !== 'none' && (!state.effect || state.effect === 'none')) {
      prepareFilteredStillDownload();
    } else {
      hideDownload();
    }
  }

  function drawCoverImage(targetCtx, image, drawWidth, drawHeight, scale = 1, alpha = 1) {
    if (!image) return;
    const naturalW = image.naturalWidth || image.width || state.imageWidth;
    const naturalH = image.naturalHeight || image.height || state.imageHeight;
    const base = coverRect(naturalW, naturalH, drawWidth, drawHeight, scale);
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.drawImage(image, -base.drawW / 2, -base.drawH / 2, base.drawW, base.drawH);
    targetCtx.restore();
  }

  function drawFilteredCoverImage(targetCtx, image, drawWidth, drawHeight, scale = 1, alpha = 1) {
    if (!image || !state.imageFilter || state.imageFilter === 'none') return;
    const tempW = Math.max(1, Math.ceil(drawWidth));
    const tempH = Math.max(1, Math.ceil(drawHeight));
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempW;
    tempCanvas.height = tempH;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';
    tempCtx.fillStyle = '#000000';
    tempCtx.fillRect(0, 0, tempW, tempH);
    tempCtx.save();
    tempCtx.translate(tempW / 2, tempH / 2);
    drawCoverImage(tempCtx, image, tempW, tempH, scale, 1);
    tempCtx.restore();
    applyImageFilterToCanvas(tempCtx, { x: 0, y: 0, width: tempW, height: tempH }, state.imageFilter);

    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.drawImage(tempCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    targetCtx.restore();
  }

  function drawTransparencyChecker(targetCtx, rect, size = 16) {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(rect.x, rect.y, rect.width, rect.height);
    targetCtx.clip();
    for (let y = rect.y; y < rect.y + rect.height; y += size) {
      for (let x = rect.x; x < rect.x + rect.width; x += size) {
        const alt = ((Math.floor((x - rect.x) / size) + Math.floor((y - rect.y) / size)) % 2) === 0;
        targetCtx.fillStyle = alt ? 'rgba(255,255,255,0.36)' : 'rgba(148,163,184,0.28)';
        targetCtx.fillRect(x, y, size, size);
      }
    }
    targetCtx.restore();
  }

  function postprocessTransparentFadeFrame(targetCtx, rect, progress) {
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const fadeOut = normalizeFadeOrder()[0] === 'image';

    if (fadeOut && progress >= 0.992) {
      targetCtx.clearRect(x, y, w, h);
      return;
    }

    const imageData = targetCtx.getImageData(x, y, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        continue;
      }

      if (fadeOut) {
        if (alpha <= 20) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        } else if (alpha <= 144) {
          const factor = Math.pow(alpha / 255, 1.35);
          data[i] = Math.round(data[i] * factor);
          data[i + 1] = Math.round(data[i + 1] * factor);
          data[i + 2] = Math.round(data[i + 2] * factor);
        } else if (alpha >= 250) {
          data[i + 3] = 255;
        }
      } else {
        if (alpha <= 8) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        } else if (alpha <= 36) {
          const factor = alpha / 255;
          data[i] = Math.round(data[i] * factor);
          data[i + 1] = Math.round(data[i + 1] * factor);
          data[i + 2] = Math.round(data[i + 2] * factor);
        } else if (alpha >= 245) {
          data[i + 3] = 255;
        }
      }
    }
    targetCtx.putImageData(imageData, x, y);
  }

  function drawFrame(progress, targetCtx, width, height, options = {}) {
    const previewMode = Boolean(options.preview);
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.imageSmoothingQuality = 'high';
    targetCtx.clearRect(0, 0, width, height);

    const frameRect = previewMode
      ? getPreviewExportRect(width, height)
      : { x: 0, y: 0, width, height };

    const transparentCanvasMode = isTransparentFadeEffect(state.effect);
    if (!transparentCanvasMode) {
      targetCtx.fillStyle = '#000000';
      targetCtx.fillRect(0, 0, width, height);
    } else if (previewMode) {
      drawTransparencyChecker(targetCtx, frameRect);
    }

    if (!state.image && !(state.images && state.images.length)) {
      if (previewMode) {
        targetCtx.save();
        targetCtx.strokeStyle = 'rgba(255,255,255,0.55)';
        targetCtx.lineWidth = 2;
        targetCtx.strokeRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
        targetCtx.restore();
      }
      return;
    }

    const motion = getMotion(state.effect, progress);
    const singleFilterTransition = shouldUseSingleImageFilterTransition(state.effect);
    const bounds = getEffectBounds(state.effect);
    const requiredW = Math.max(1, frameRect.width + (bounds.maxX * 2) + (bounds.padding * 2));
    const requiredH = Math.max(1, frameRect.height + (bounds.maxY * 2) + (bounds.padding * 2));
    const referenceImage = ['transition', 'transitionHardcut', 'transitionWipe'].includes(motion.mode) ? (motion.currentImage || state.image || state.images[0]) : state.image;
    const useNoZoomBase = motion.mode === 'shakeNoZoom';
    const base = coverRect(
      referenceImage?.naturalWidth || state.imageWidth,
      referenceImage?.naturalHeight || state.imageHeight,
      useNoZoomBase ? frameRect.width : requiredW,
      useNoZoomBase ? frameRect.height : requiredH,
      motion.scale * (motion.cropScale || 1)
    );

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    targetCtx.clip();
    targetCtx.translate(frameRect.x + frameRect.width / 2 + motion.x, frameRect.y + frameRect.height / 2 + motion.y);
    targetCtx.rotate(motion.rotate);
    if (motion.mode === 'wave') {
      drawWaveImage(targetCtx, motion.amount, base);
    } else if (motion.mode === 'fadeFill') {
      const transparentFade = isTransparentFadeEffect(state.effect);
      if (motion.fillColor && motion.fillAlpha > 0) {
        targetCtx.save();
        targetCtx.globalAlpha = motion.fillAlpha;
        targetCtx.fillStyle = motion.fillColor;
        targetCtx.fillRect(-requiredW / 2, -requiredH / 2, requiredW, requiredH);
        targetCtx.restore();
      }
      if (motion.imageAlpha > 0 && (!transparentFade || motion.imageAlpha > 0.02)) {
        drawCoverImage(targetCtx, state.image || state.images[0], requiredW, requiredH, motion.scale * (motion.cropScale || 1), motion.imageAlpha);
      }
    } else if (motion.mode === 'transition') {
      const currentScale = motion.scale * (motion.cropScale || 1) * (1 + (1 - motion.mix) * 0.012);
      const nextScale = motion.scale * (motion.cropScale || 1) * (1 + motion.mix * 0.012);
      const currentImage = motion.currentImage || state.image || state.images[0];
      const nextImage = motion.nextImage || currentImage;
      drawCoverImage(targetCtx, currentImage, requiredW, requiredH, currentScale, 1 - motion.mix);
      if (singleFilterTransition) {
        drawFilteredCoverImage(targetCtx, currentImage, requiredW, requiredH, nextScale, motion.mix);
      } else {
        drawCoverImage(targetCtx, nextImage, requiredW, requiredH, nextScale, motion.mix);
      }
    } else if (motion.mode === 'transitionHardcut') {
      const currentImage = motion.currentImage || state.image || state.images[0];
      const nextImage = motion.nextImage || currentImage;
      if (singleFilterTransition && motion.mix >= 0.5) {
        drawFilteredCoverImage(targetCtx, currentImage, requiredW, requiredH, motion.scale * (motion.cropScale || 1), 1);
      } else {
        const cutImage = motion.mix < 0.5 ? currentImage : nextImage;
        drawCoverImage(targetCtx, cutImage, requiredW, requiredH, motion.scale * (motion.cropScale || 1), 1);
      }
    } else if (motion.mode === 'transitionWipe') {
      const currentScale = motion.scale * (motion.cropScale || 1);
      const nextScale = motion.scale * (motion.cropScale || 1);
      const currentImage = motion.currentImage || state.image || state.images[0];
      const nextImage = motion.nextImage || currentImage;
      drawCoverImage(targetCtx, currentImage, requiredW, requiredH, currentScale, 1);
      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.rect(-requiredW / 2, -requiredH / 2, requiredW * motion.mix, requiredH);
      targetCtx.clip();
      if (singleFilterTransition) {
        drawFilteredCoverImage(targetCtx, currentImage, requiredW, requiredH, nextScale, 1);
      } else {
        drawCoverImage(targetCtx, nextImage, requiredW, requiredH, nextScale, 1);
      }
      targetCtx.restore();
    } else {
      targetCtx.drawImage(
        state.image,
        -base.drawW / 2,
        -base.drawH / 2,
        base.drawW,
        base.drawH
      );
    }
    targetCtx.restore();

    if (!singleFilterTransition && !isTransparentFadeEffect(state.effect)) {
      applyImageFilterToCanvas(targetCtx, frameRect, state.imageFilter);
    }

    if (!previewMode && isTransparentFadeEffect(state.effect)) {
      postprocessTransparentFadeFrame(targetCtx, frameRect, progress);
    }

    if (motion.overlay && motion.overlayAlpha > 0) {
      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.rect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
      targetCtx.clip();
      targetCtx.globalAlpha = motion.overlayAlpha;
      targetCtx.fillStyle = motion.overlay;
      targetCtx.fillRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
      targetCtx.restore();
    }

    if (previewMode) {
      targetCtx.save();
      targetCtx.strokeStyle = 'rgba(255,255,255,0.72)';
      targetCtx.lineWidth = 2;
      targetCtx.strokeRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
      targetCtx.restore();
    }
  }

  function coverRect(imgW, imgH, canvasW, canvasH, scale = 1) {
    const canvasRatio = canvasW / canvasH;
    const imageRatio = imgW / imgH;
    let drawW;
    let drawH;

    if (imageRatio > canvasRatio) {
      drawH = canvasH * scale;
      drawW = drawH * imageRatio;
    } else {
      drawW = canvasW * scale;
      drawH = drawW / imageRatio;
    }

    return { drawW, drawH };
  }

  function animate(now) {
    if (!state.playing) return;

    if (!state.playStart) state.playStart = now;
    const seconds = getSeconds();
    const elapsed = (now - state.playStart) / 1000;
    let progress = (elapsed % seconds) / seconds;


    state.stillFrameTime = progress;
    drawFrame(progress, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
    state.rafId = requestAnimationFrame(animate);
  }

  function togglePlay() {
    if (!state.image && !(state.images && state.images.length)) {
      setStatus(T('msg.needImage'));
      return;
    }

    if (state.effect === 'none') {
      stopPreview();
      drawFrame(0, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
      setStatus(T('msg.noMotionPreview'));
      return;
    }

    state.playing = !state.playing;
    if (state.playing) {
      state.playStart = 0;
      els.playBtn.textContent = T('action.stop');
      state.rafId = requestAnimationFrame(animate);
    } else {
      stopPreview();
    }
  }

  function selectEffect(button) {
    if (!button || button.disabled) return;

    const wasActive = button.classList.contains('is-active');

    if (wasActive) {
      state.effect = 'none';
      [...els.effectGrid.querySelectorAll('.effect-card')].forEach(card => card.classList.remove('is-active'));
      syncCardTabIndex(els.effectGrid, '.effect-card', null);
      updateOutputFileName();
      updateTransitionThumbs();
      updateExportNoteVisibility();
      hideDownload();
      stopPreview();
      drawFrame(0, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
      setStatus(T('msg.noMotionSelected', getQualityRecommendationText()));
      return;
    }

    state.effect = button.dataset.effect;
    if (isFadeEffect(state.effect)) {
      state.fadeOrder = ['image', 'fill'];
    }
    [...els.effectGrid.querySelectorAll('.effect-card')].forEach(card => card.classList.remove('is-active'));
    button.classList.add('is-active');
    syncCardTabIndex(els.effectGrid, '.effect-card', button);
    els.loopInput.checked = getLoopDefault(state.effect);
    els.secondsInput.value = String(getEffectDefaultSeconds(state.effect));
    updateOutputFileName();
    updateTransitionThumbs();
    drawFrame(state.stillFrameTime, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
    setEffectSelectionStatus();
    updateTransitionThumbs();
    updateExportNoteVisibility();
    hideDownload();

    if (state.image) {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.playing = true;
      state.playStart = 0;
      els.playBtn.textContent = T('action.stop');
      state.rafId = requestAnimationFrame(animate);
    }
  }

  function getClosestSizeMapEntryForSource(sizeMap, sourceW, sourceH) {
    const entries = Object.values(sizeMap || {});
    if (!entries.length || !sourceW || !sourceH) return null;
    const sourceAspect = sourceW / sourceH;
    return entries
      .map(entry => ({
        ...entry,
        score: Math.abs((entry.width / entry.height) - sourceAspect)
      }))
      .sort((a, b) => a.score - b.score)[0] || null;
  }

  function scaleOriginalToQualityBounds(sourceW, sourceH, targetW, targetH) {
    if (!sourceW || !sourceH || !targetW || !targetH) {
      return { width: sourceW || 1280, height: sourceH || 720 };
    }
    const scale = Math.min(targetW / sourceW, targetH / sourceH, 1);
    return {
      width: Math.max(2, Math.round(sourceW * scale)),
      height: Math.max(2, Math.round(sourceH * scale))
    };
  }

  function getExportSize() {
    const selected = els.sizeInput.value;
    const sourceW = state.imageWidth || 1280;
    const sourceH = state.imageHeight || 720;
    const setting = qualitySettings[els.qualityInput.value] || qualitySettings.standard;

    if (selected === 'original') {
      if (els.qualityInput.value === 'high') {
        return { width: sourceW, height: sourceH, label: T('size.original') };
      }

      const closestBounds = getClosestSizeMapEntryForSource(setting.sizeMap, sourceW, sourceH);
      if (closestBounds) {
        const scaled = scaleOriginalToQualityBounds(sourceW, sourceH, closestBounds.width, closestBounds.height);
        return {
          width: scaled.width,
          height: scaled.height,
          label: T('size.originalRatio', scaled.width, scaled.height)
        };
      }

      return { width: sourceW, height: sourceH, label: T('size.original') };
    }

    const preset = getSizePresetByValue(selected);
    if (preset) {
      return {
        width: preset.width,
        height: preset.height,
        label: preset.label
      };
    }

    return { width: sourceW, height: sourceH, label: T('size.original') };
  }

  /* 上游自 v0.80 起暫停 APNG 輸出，原本的 exportApng() 以註解形式留在檔案裡（裡面寫死了日文訊息）。
   * 收錄版沒有收這段註解掉的程式碼；需要時請參考上游 js/main.js。 */
  function setExportButtonsDisabled(disabled) {
    els.exportWebpBtn.disabled = disabled;
    if (els.exportWebp30Btn) els.exportWebp30Btn.disabled = disabled;
    if (els.exportWebp60Btn) els.exportWebp60Btn.disabled = disabled;
    els.playBtn.disabled = disabled;
  }

  function updateClearButtonState() {
    els.clearOutputBtn.disabled = false;
    els.clearOutputBtn.textContent = state.isExporting ? T('action.cancelExport') : T('action.clear');
    els.clearOutputBtn.classList.toggle('is-cancel', state.isExporting);
  }

  function setExportRunning(running) {
    state.isExporting = running;
    if (!running) state.cancelExportRequested = false;
    setExportButtonsDisabled(running);
    updateClearButtonState();
  }

  function checkExportCancelled() {
    if (state.cancelExportRequested) {
      const error = new Error('EXPORT_CANCELLED');
      error.code = 'EXPORT_CANCELLED';
      throw error;
    }
  }

  function cancelCurrentExport() {
    if (!state.isExporting) return;
    state.cancelExportRequested = true;
    setStatus(T('msg.exportCancelling'));
    showToast(T('msg.exportCancelling'), 'warning', 2600);
  }

  async function canvasToWebpBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('WebP frame encoding failed.'));
      }, 'image/webp', quality);
    });
  }

  async function blobToUint8Array(blob) {
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('PNG frame encoding failed.'));
      }, 'image/png');
    });
  }

  function writeAscii(target, offset, text) {
    for (let i = 0; i < text.length; i++) target[offset + i] = text.charCodeAt(i);
  }

  function writeUint16LE(target, offset, value) {
    target[offset] = value & 255;
    target[offset + 1] = (value >> 8) & 255;
  }

  function writeUint24LE(target, offset, value) {
    target[offset] = value & 255;
    target[offset + 1] = (value >> 8) & 255;
    target[offset + 2] = (value >> 16) & 255;
  }

  function writeUint32LE(target, offset, value) {
    target[offset] = value & 255;
    target[offset + 1] = (value >> 8) & 255;
    target[offset + 2] = (value >> 16) & 255;
    target[offset + 3] = (value >> 24) & 255;
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes, start, length) {
    let crc = 0xffffffff;
    for (let i = start; i < start + length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function writeUint32BE(target, offset, value) {
    target[offset] = (value >>> 24) & 255;
    target[offset + 1] = (value >>> 16) & 255;
    target[offset + 2] = (value >>> 8) & 255;
    target[offset + 3] = value & 255;
  }

  function patchApngLoopCount(arrayBuffer, loop) {
    const bytes = new Uint8Array(arrayBuffer.slice(0));
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = readUint32BE(bytes, offset);
      const typeOffset = offset + 4;
      const type = String.fromCharCode(bytes[typeOffset], bytes[typeOffset + 1], bytes[typeOffset + 2], bytes[typeOffset + 3]);
      const dataOffset = offset + 8;
      if (type === 'acTL' && length >= 8) {
        writeUint32BE(bytes, dataOffset + 4, loop ? 0 : 1);
        const crc = crc32(bytes, typeOffset, 4 + length);
        writeUint32BE(bytes, dataOffset + length, crc);
        return bytes.buffer;
      }
      offset += 12 + length;
    }
    return arrayBuffer;
  }

  function makeChunk(name, payload) {
    const pad = payload.length % 2;
    const out = new Uint8Array(8 + payload.length + pad);
    writeAscii(out, 0, name);
    writeUint32LE(out, 4, payload.length);
    out.set(payload, 8);
    return out;
  }

  function extractWebpImageChunks(webpBytes) {
    const riff = String.fromCharCode(...webpBytes.slice(0, 4));
    const webp = String.fromCharCode(...webpBytes.slice(8, 12));
    if (riff !== 'RIFF' || webp !== 'WEBP') throw new Error('Invalid WebP frame.');
    let offset = 12;
    const chunks = [];
    while (offset + 8 <= webpBytes.length) {
      const name = String.fromCharCode(...webpBytes.slice(offset, offset + 4));
      const size = webpBytes[offset + 4] | (webpBytes[offset + 5] << 8) | (webpBytes[offset + 6] << 16) | (webpBytes[offset + 7] << 24);
      const padded = size + (size % 2);
      if (name === 'VP8 ' || name === 'VP8L' || name === 'ALPH') {
        chunks.push(webpBytes.slice(offset, offset + 8 + padded));
      }
      offset += 8 + padded;
    }
    if (!chunks.length) throw new Error('No WebP image chunks were found.');
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    chunks.forEach(chunk => { out.set(chunk, cursor); cursor += chunk.length; });
    return out;
  }

  function concatUint8(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach(part => { out.set(part, offset); offset += part.length; });
    return out;
  }

  function buildAnimatedWebp(frameChunks, width, height, delays, loop) {
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x02;
    writeUint24LE(vp8x, 4, width - 1);
    writeUint24LE(vp8x, 7, height - 1);

    const anim = new Uint8Array(6);
    anim[0] = 0x11; anim[1] = 0x18; anim[2] = 0x27; anim[3] = 0xff;
    writeUint16LE(anim, 4, loop ? 0 : 1);

    const chunks = [makeChunk('VP8X', vp8x), makeChunk('ANIM', anim)];
    frameChunks.forEach((imageData, index) => {
      const header = new Uint8Array(16);
      writeUint24LE(header, 0, 0);
      writeUint24LE(header, 3, 0);
      writeUint24LE(header, 6, width - 1);
      writeUint24LE(header, 9, height - 1);
      writeUint24LE(header, 12, Math.max(10, delays[index] || 100));
      header[15] = 0x02;
      chunks.push(makeChunk('ANMF', concatUint8([header, imageData])));
    });

    const payload = concatUint8(chunks);
    const riff = new Uint8Array(12 + payload.length);
    writeAscii(riff, 0, 'RIFF');
    writeUint32LE(riff, 4, 4 + payload.length);
    writeAscii(riff, 8, 'WEBP');
    riff.set(payload, 12);
    return riff;
  }


  async function exportPngZip() {
    if (!state.image && !(state.images && state.images.length)) {
      setStatus(T('msg.needImage'));
      return;
    }
    if (typeof JSZip === 'undefined') {
      setStatus(T('msg.pngZipLibraryMissing'));
      return;
    }

    if (state.playing) togglePlay();
    hideDownload();

    const seconds = getSeconds();
    const setting = qualitySettings[els.qualityInput.value] || qualitySettings.standard;
    const { width, height, label: sizeLabel } = getExportSize();
    const frames = Math.max(2, Math.round(seconds * setting.fps));
    const safeName = buildOutputBaseName();
    const zip = new JSZip();
    const folder = zip.folder(safeName);

    setExportRunning(true);
    setStatus(T('msg.pngZipStart', frames, getSizeLimitLabel()));

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    const padLength = String(frames).length;

    try {
      for (let i = 0; i < frames; i++) {
        checkExportCancelled();
        const progress = frames === 1 ? 1 : i / (frames - 1);
        drawFrame(progress, offCtx, width, height);
        const blob = await canvasToPngBlob(offscreen);
        checkExportCancelled();
        const fileName = `frame_${String(i + 1).padStart(padLength, '0')}.png`;
        folder.file(fileName, blob);
        if (i % 3 === 0 || i === frames - 1) {
          setStatus(T('msg.pngZipProgress', i + 1, frames));
          await new Promise(resolve => setTimeout(resolve, 0));
          checkExportCancelled();
        }
      }

      checkExportCancelled();
      setStatus(T('msg.pngZipCompressing'));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const outputName = `${safeName}${T('file.pngSeqSuffix')}.zip`;
      const outputSize = formatFileSize(blob.size);
      const sizeWarning = getBlobSizeWarning(blob);
      state.downloadUrl = url;
      state.downloadName = outputName;
      els.downloadLink.classList.remove('is-disabled');
      els.downloadLink.setAttribute('aria-disabled', 'false');
      setStatus(T('msg.pngZipComplete', outputName, outputSize, effectLabel(state.effect), seconds, setting.label, sizeLabel, warningSuffix(sizeWarning)));
    } catch (error) {
      if (error && error.code === 'EXPORT_CANCELLED') {
        setStatus(T('msg.exportCancelled'));
        showToast(T('msg.exportCancelled'), 'warning', 2800);
      } else {
        console.error(error);
        setStatus(T('msg.pngZipError'));
      }
    } finally {
      setExportRunning(false);
    }
  }

  async function exportWebp(options = {}) {
    const fpsOverride = options.fpsOverride || null;
    const fpsLabel = options.fpsLabel || null;
    showToast(T('msg.webpStart', fpsPrefix(fpsLabel)), 'info', 3200);
    if (!state.image && !(state.images && state.images.length)) {
      setStatus(T('msg.needImage'));
      return;
    }

    if (state.playing) togglePlay();
    hideDownload();

    const seconds = getSeconds();
    const setting = qualitySettings[els.qualityInput.value] || qualitySettings.standard;
    const outputFps = fpsOverride || setting.fps;
    const { width, height, label: sizeLabel } = getExportSize();
    const frames = Math.max(2, Math.round(seconds * outputFps));
    const totalDurationMs = Math.max(1, Math.round(seconds * 1000));
    const delays = buildFrameDelaySequence(frames, totalDurationMs);
    const safeName = buildOutputBaseName();
    const webpQuality = setting.webpQuality ?? 0.82;

    setExportRunning(true);
    setStatus(T('msg.webpProgressStart', fpsPrefix(fpsLabel), frames, getSizeLimitLabel()));

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    const frameChunks = [];

    try {
      for (let i = 0; i < frames; i++) {
        checkExportCancelled();
        const progress = frames === 1 ? 1 : i / (frames - 1);
        drawFrame(progress, offCtx, width, height);
        const blob = await canvasToWebpBlob(offscreen, webpQuality);
        checkExportCancelled();
        const bytes = await blobToUint8Array(blob);
        checkExportCancelled();
        frameChunks.push(extractWebpImageChunks(bytes));
        if (i % 4 === 0 || i === frames - 1) {
          setStatus(T('msg.webpProgress', fpsPrefix(fpsLabel), i + 1, frames));
          await new Promise(resolve => setTimeout(resolve, 0));
          checkExportCancelled();
        }
      }

      checkExportCancelled();
      const animatedBytes = buildAnimatedWebp(frameChunks, width, height, delays, els.loopInput.checked);
      const blob = new Blob([animatedBytes], { type: 'image/webp' });
      const url = URL.createObjectURL(blob);

      drawFrame(0, offCtx, width, height);
      const stillBlob = await canvasToPngBlob(offscreen);
      const stillUrl = URL.createObjectURL(stillBlob);

      const sizeWarning = getBlobSizeWarning(blob);
      const outputName = `${safeName}.webp`;
      const outputSize = formatFileSize(blob.size);
      state.downloadUrl = url;
      state.downloadName = outputName;
      state.stillDownloadUrl = stillUrl;
      state.stillDownloadName = `${safeName}_frame01.png`;
      els.downloadLink.classList.remove('is-disabled');
      els.downloadLink.setAttribute('aria-disabled', 'false');
      showExportSizeToast(fpsLabel ? `${fpsLabel} WebP` : 'WebP', blob);
      setStatus(`${T('msg.webpComplete', fpsPrefix(fpsLabel), outputName, outputSize, effectLabel(state.effect), loopLabel(els.loopInput.checked), seconds, outputFps, setting.label, sizeLabel, warningSuffix(sizeWarning))} ${T('msg.webpPlaybackNote')}`);
    } catch (error) {
      if (error && error.code === 'EXPORT_CANCELLED') {
        setStatus(T('msg.exportCancelled'));
        showToast(T('msg.exportCancelled'), 'warning', 2800);
      } else {
        console.error(error);
        setStatus(T('msg.webpError'));
      }
    } finally {
      setExportRunning(false);
    }
  }


  els.loopInput.checked = getLoopDefault(state.effect);
  updateOutputFileName();
  updateClearButtonState();

  function hideFloatingTooltip() {
    const tooltip = document.querySelector('.floating-tooltip');
    if (tooltip) tooltip.remove();
  }

  function showFloatingTooltip(button) {
    const text = button?.dataset.tooltip;
    if (!text) return;

    hideFloatingTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'floating-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = text;
    document.body.appendChild(tooltip);

    const rect = button.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const margin = 12;
    const preferredTop = rect.top - tipRect.height - 12;
    const top = preferredTop >= margin
      ? preferredTop
      : Math.min(window.innerHeight - tipRect.height - margin, rect.bottom + 12);
    const left = Math.min(
      window.innerWidth - tipRect.width - margin,
      Math.max(margin, rect.left + rect.width / 2 - tipRect.width / 2)
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
    window.requestAnimationFrame(() => tooltip.classList.add('is-visible'));
  }

  function bindFloatingTooltips() {
    document.querySelectorAll('.has-tooltip').forEach(button => {
      button.addEventListener('mouseenter', () => showFloatingTooltip(button));
      button.addEventListener('focus', () => showFloatingTooltip(button));
      button.addEventListener('mouseleave', hideFloatingTooltip);
      button.addEventListener('blur', hideFloatingTooltip);
    });
    window.addEventListener('scroll', hideFloatingTooltip, true);
    window.addEventListener('resize', hideFloatingTooltip);
  }

  /* 收錄版：語言切換交給合輯的語言選單。 */
  I18N.mountSwitcher(document.getElementById('localeSelect'));
  I18N.onChange(() => applyLocaleText());
  applyLocaleText({ silent: true });
  updateExportNoteVisibility();

  els.helpBtn.addEventListener('click', () => toggleDrawer(els.helpDrawer));
  els.shortcutBtn.addEventListener('click', () => toggleDrawer(els.shortcutDrawer));
  els.drawerCloseButtons.forEach(button => button.addEventListener('click', closeDrawers));
  bindFloatingTooltips();
  function syncThemeButton() {
    const isDark = els.body.classList.contains('is-dark');
    const thumb = els.themeBtn.querySelector('.theme-toggle-thumb');
    if (thumb) thumb.textContent = isDark ? '☾' : '☀️';
    els.themeBtn.setAttribute('aria-label', isDark ? T('theme.dark') : T('theme.light'));
    els.themeBtn.setAttribute('title', isDark ? T('theme.dark') : T('theme.light'));
    els.themeBtn.setAttribute('aria-pressed', String(isDark));
  }

  els.themeBtn.addEventListener('click', () => {
    els.body.classList.toggle('is-dark');
    syncThemeButton();
  });

  els.dropZone.addEventListener('dragover', event => {
    event.preventDefault();
    els.dropZone.classList.add('is-dragover');
  });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('is-dragover'));
  els.dropZone.addEventListener('drop', event => {
    event.preventDefault();
    els.dropZone.classList.remove('is-dragover');
    const files = Array.from(event.dataTransfer.files || []);
    loadFiles(files);
  });
  els.fileInput.addEventListener('change', event => loadFiles(Array.from(event.target.files || [])));

  els.loadSampleBtn?.addEventListener('click', () => {
    loadSampleImage();
  });


  els.motionTab?.addEventListener('click', () => setActiveTab('motion'));
  els.imageEditTab?.addEventListener('click', () => setActiveTab('imageEdit'));

  els.imageEditGrid?.addEventListener('click', event => {
    const button = event.target.closest('.image-edit-card');
    selectImageFilter(button);
  });

  els.effectGrid.addEventListener('click', event => {
    const button = event.target.closest('.effect-card');
    selectEffect(button);
  });

  attachCardKeyboardNavigation(els.effectGrid, '.effect-card');
  attachCardKeyboardNavigation(els.imageEditGrid, '.image-edit-card');

  els.transitionThumbList?.addEventListener('dragstart', event => {
    const button = event.target.closest('.transition-thumb-card');
    if (!button) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', button.dataset.index || '0');
    button.classList.add('is-dragging');
  });

  els.transitionThumbList?.addEventListener('dragend', event => {
    event.target.closest('.transition-thumb-card')?.classList.remove('is-dragging');
  });

  els.transitionThumbList?.addEventListener('dragover', event => {
    const button = event.target.closest('.transition-thumb-card');
    if (!button) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });

  els.transitionThumbList?.addEventListener('drop', event => {
    const button = event.target.closest('.transition-thumb-card');
    if (!button) return;
    event.preventDefault();
    const fromIndex = Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
    const toIndex = Number.parseInt(button.dataset.index || '0', 10);
    reorderTransitionImages(fromIndex, toIndex);
  });

  els.downloadLink.addEventListener('click', event => {
    event.preventDefault();
    const disabled = els.downloadLink.classList.contains('is-disabled') || !state.downloadUrl;
    if (disabled) {
      showToast(T('msg.downloadFirst'), 'warning', 4200);
      return;
    }

    const downloadTargets = [];
    if (state.stillDownloadUrl) {
      downloadTargets.push({ url: state.stillDownloadUrl, name: state.stillDownloadName || 'haikei_motion_frame01.png' });
    }
    downloadTargets.push({ url: state.downloadUrl, name: state.downloadName || 'haikei_motion' });

    downloadTargets.forEach(target => {
      const tempLink = document.createElement('a');
      tempLink.href = target.url;
      tempLink.download = target.name;
      document.body.appendChild(tempLink);
      tempLink.click();
      tempLink.remove();
    });
    showToast(T('msg.downloadDone'), 'success', 3200);
  });

  els.playBtn.addEventListener('click', togglePlay);
  els.exportWebpBtn.addEventListener('click', () => exportWebp({ fpsOverride: 24, fpsLabel: '24FPS' }));
  els.exportWebp30Btn?.addEventListener('click', () => exportWebp({ fpsOverride: 30, fpsLabel: '30FPS' }));
  els.exportWebp60Btn?.addEventListener('click', () => exportWebp({ fpsOverride: 60, fpsLabel: '60FPS' }));
  els.clearOutputBtn.addEventListener('click', () => {
    if (state.isExporting) {
      cancelCurrentExport();
      return;
    }
    resetImage();
  });

  [els.secondsInput, els.qualityInput, els.sizeInput, els.loopInput].forEach(input => {
    input.addEventListener('input', event => {
      if (event.currentTarget === els.qualityInput) {
        refreshSizeInputLabels();
      }
      updateOutputFileName();
      syncPreviewCanvasSize();
      drawFrame(state.stillFrameTime, ctx, els.previewCanvas.width, els.previewCanvas.height, { preview: true });
      hideDownload();
    });
  });

  function updateWorkspaceStickyState() {
    const workspace = document.querySelector('.workspace');
    if (!workspace || window.matchMedia('(max-width: 1180px)').matches) {
      workspace?.classList.remove('is-stuck');
      return;
    }
    const top = workspace.getBoundingClientRect().top;
    workspace.classList.toggle('is-stuck', top <= 9);
  }

  window.addEventListener('scroll', updateWorkspaceStickyState, { passive: true });

  window.addEventListener('resize', () => {
    syncViewportWorkspaceLayout();
    updateWorkspaceStickyState();
    requestPreviewPanelLayoutSync();
  });

  function clickShortcutButton(button) {
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }

  const shortcutApi = {
    openFile: () => {
      if (!els.fileInput) return false;
      closeDrawers();
      els.fileInput.value = '';
      if (typeof els.fileInput.showPicker === 'function') {
        els.fileInput.showPicker();
      } else {
        els.fileInput.click();
      }
      return true;
    },
    togglePlay: () => clickShortcutButton(els.playBtn),
    exportWebp: () => clickShortcutButton(els.exportWebpBtn),
    exportWebp30: () => clickShortcutButton(els.exportWebp30Btn),
    exportWebp60: () => clickShortcutButton(els.exportWebp60Btn),
    closeDrawers,
    clearOutputDisplay,
    resetImage: () => resetImage(),
    toggleTheme: () => clickShortcutButton(els.themeBtn),
    isDrawerOpen: () => Boolean((els.helpDrawer && !els.helpDrawer.hidden) || (els.shortcutDrawer && !els.shortcutDrawer.hidden))
  };
  window.HaikeiMotionMaker = shortcutApi;
  globalThis.HaikeiMotionMaker = shortcutApi;

  if (window.ResizeObserver) {
    const previewLayoutObserver = new ResizeObserver(() => {
      requestPreviewPanelLayoutSync();
    });
    if (els.previewPanel) previewLayoutObserver.observe(els.previewPanel);
    if (els.previewControls) previewLayoutObserver.observe(els.previewControls);
    if (els.transitionThumbPanel) previewLayoutObserver.observe(els.transitionThumbPanel);
  }

  refreshSizeInputLabels();
  syncCardTabIndex(els.effectGrid, '.effect-card', els.effectGrid?.querySelector('.effect-card.is-active'));
  syncCardTabIndex(els.imageEditGrid, '.image-edit-card', els.imageEditGrid?.querySelector('.image-edit-card.is-active'));
  updateTransitionThumbs();
  syncViewportWorkspaceLayout();
  updateWorkspaceStickyState();
  requestPreviewPanelLayoutSync();
})();
