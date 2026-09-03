(function (global) {
  'use strict';

  const NS = global.CocoLoadingMaker;
  const {
    Utils, StateStore, DEFAULT_STATE, MediaManager, Renderer, AnimationExporter,
  } = NS;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /* 緩動與圖形的顯示名稱改以 i18n key 對照，切換語言時才會跟著更新。 */
  const EASING_KEYS = {
    linear: 'easing.linear',
    smooth: 'easing.smooth',
    'ease-in': 'easing.easeIn',
    'ease-out': 'easing.easeOut',
    'ease-in-out': 'easing.easeInOut',
    steps: 'easing.steps',
    bounce: 'easing.bounce',
    irregular: 'easing.irregular',
  };
  const SHAPE_KEYS = {
    circle: 'shape.circle',
    square: 'shape.square',
    diamond: 'shape.diamond',
    triangle: 'shape.triangle',
    star: 'shape.star',
    heart: 'shape.heart',
    hexagon: 'shape.hexagon',
  };

  function projectLoadAbortError() {
    const error = new Error(T('err.projectLoadAborted'));
    error.name = 'AbortError';
    error.isProjectLoadCancellation = true;
    return error;
  }

  class App {
    constructor() {
      this.store = new StateStore(DEFAULT_STATE);
      this.media = new MediaManager();
      this.rowMedia = new MediaManager();
      this.rowBaseMedia = new MediaManager();
      this.canvas = $('#previewCanvas');
      this.renderer = new Renderer(this.canvas, this.store, this.media, this.rowMedia, this.rowBaseMedia);
      this.exporter = new AnimationExporter(this.renderer, this.store, this.media);
      this.isExporting = false;
      this.isScrubbing = false;
      this.busyDepth = 0;
      this.projectLoadGeneration = 0;
      this.activeProjectLoad = null;
      this.dragSession = null;
      this.selectedElement = null;
      this.lastStatusTimer = 0;
      this.status = { key: 'msg.start', type: 'ready', args: [] };
      this.fontInfo = { key: 'font.info.default', args: [] };
      this.keyframeEditorSignature = '';
      this.gradientEditorSignature = '';
      this.rowShapeEditorSignature = '';
      this.bindControls();
      this.bindDynamicEditors();
      this.bindMediaControls();
      this.bindProjectControls();
      this.bindPreviewControls();
      this.bindExportControls();
      this.bindCanvasDragging();
      this.store.subscribe((state, reason, path) => {
        if (reason !== 'project-load') this.invalidateProjectLoad();
        this.onStateChanged(state, reason, path);
      });
      this.renderer.onTime = (time, duration) => this.onPreviewTime(time, duration);
      I18N.mountSwitcher($('#localeSelect'));
      I18N.onChange(() => this.onLocaleChanged());
      this.syncUI(this.store.get());
      this.updateCapabilityBadges();
      this.setStatus('msg.start', 'ready');
    }

    /* 切換語言：靜態標記由 i18n 引擎處理，這裡重繪由 JS 產生的文字。
     * 三個動態編輯器以簽章快取內容，需清空簽章才會重建。 */
    onLocaleChanged() {
      this.keyframeEditorSignature = '';
      this.gradientEditorSignature = '';
      this.rowShapeEditorSignature = '';
      const state = this.store.get();
      this.syncUI(state);
      this.updateCapabilityBadges();
      this.updateExportEstimate();
      this.updateSourceInfo();
      this.updateRowSourceInfo();
      this.updateRowBaseSourceInfo();
      this.applyFontInfo(this.fontInfo.key, ...this.fontInfo.args);
      this.onPreviewTime(this.renderer.currentTime, Utils.getAnimationDuration(state));
      this.renderStatus();
    }

    invalidateProjectLoad() {
      this.projectLoadGeneration += 1;
      const activeLoad = this.activeProjectLoad;
      if (activeLoad && Array.isArray(activeLoad.managers)) {
        activeLoad.managers.forEach((manager) => manager.invalidatePendingLoads());
      }
      return this.projectLoadGeneration;
    }

    bindControls() {
      const controls = $$('[data-bind]');
      controls.forEach((control) => {
        const eventName = control.matches('select, input[type="checkbox"], input[type="color"]') ? 'change' : 'input';
        control.addEventListener(eventName, () => {
          const value = this.readControlValue(control);
          this.store.setPath(control.dataset.bind, value, 'input');
        });
        if (eventName !== 'input' && control.matches('input[type="range"]')) {
          control.addEventListener('input', () => this.store.setPath(control.dataset.bind, this.readControlValue(control), 'input'));
        }
      });

      $('#sizePreset').addEventListener('change', (event) => {
        if (event.target.value === 'custom') return;
        const [width, height] = event.target.value.split('x').map(Number);
        this.store.patch({ canvas: { width, height } }, 'canvas-size');
      });

      $('#randomizeSeedButton').addEventListener('click', () => {
        this.store.setPath('loader.seed', Math.floor(Math.random() * 99999) + 1, 'seed');
      });
      $('#randomizeRowSeedButton').addEventListener('click', () => {
        this.store.setPath('loader.seed', Math.floor(Math.random() * 99999) + 1, 'row-seed');
      });

      $('#fitSeamlessLoopButton').addEventListener('click', () => this.fitSeamlessLoopDuration());
      $('#resetPercentPositionButton').addEventListener('click', () => {
        this.store.patch({ loader: { percentOffsetX: 0, percentOffsetY: 0 } }, 'percent-position-reset');
        this.setStatus('msg.percentPositionReset', 'success');
      });
    }

    fitSeamlessLoopDuration() {
      const state = this.store.get();
      if (state.loader.type !== 'loop') return;
      const result = Utils.getSeamlessLoopDuration(state);
      this.store.setPath('timing.duration', result.duration, 'seamless-loop-duration');
      this.renderer.seek(0);
      const durationLabel = Number(result.duration.toFixed(6)).toString();
      this.setStatus(result.extended ? 'msg.seamless.extended' : 'msg.seamless', 'success', result.cycles, durationLabel);
    }

    bindDynamicEditors() {
      const keyframeEditor = $('#progressKeyframeEditor');
      keyframeEditor.addEventListener('change', (event) => {
        const control = event.target.closest('[data-keyframe-field]');
        if (!control) return;
        const index = Number(control.dataset.index);
        const field = control.dataset.keyframeField;
        const points = Utils.deepClone(this.store.get().loader.progressKeyframes);
        if (!points[index]) return;
        points[index][field] = field === 'easing' ? control.value : Number(control.value);
        this.keyframeEditorSignature = JSON.stringify(points);
        this.store.setPath('loader.progressKeyframes', points, 'keyframe-edit');
      });
      keyframeEditor.addEventListener('click', (event) => {
        const button = event.target.closest('[data-remove-keyframe]');
        if (!button) return;
        const index = Number(button.dataset.removeKeyframe);
        const points = Utils.deepClone(this.store.get().loader.progressKeyframes);
        if (index <= 0 || index >= points.length - 1 || points.length <= 2) return;
        points.splice(index, 1);
        this.keyframeEditorSignature = '';
        this.store.setPath('loader.progressKeyframes', points, 'keyframe-remove');
      });
      $('#addKeyframeButton').addEventListener('click', () => this.addProgressKeyframe());
      $('#resetKeyframesButton').addEventListener('click', () => {
        this.keyframeEditorSignature = '';
        this.store.setPath('loader.progressKeyframes', [
          { time: 0, value: 0, easing: 'linear' },
          { time: 1, value: 30, easing: 'ease-out' },
          { time: 2, value: 70, easing: 'smooth' },
          { time: 3, value: 100, easing: 'ease-in-out' },
        ], 'keyframe-reset');
        this.setStatus('msg.keyframeReset', 'success');
      });

      const gradientEditor = $('#gradientStopsEditor');
      const updateGradientStop = (control) => {
        const index = Number(control.dataset.index);
        const field = control.dataset.gradientField;
        const stops = Utils.deepClone(this.store.get().loader.gradientStops);
        if (!stops[index]) return;
        stops[index][field] = field === 'position' ? Number(control.value) : control.value;
        this.gradientEditorSignature = JSON.stringify(stops);
        this.store.setPath('loader.gradientStops', stops, 'gradient-stop-edit');
      };
      gradientEditor.addEventListener('input', (event) => {
        const control = event.target.closest('[data-gradient-field="color"]');
        if (control) updateGradientStop(control);
      });
      gradientEditor.addEventListener('change', (event) => {
        const control = event.target.closest('[data-gradient-field]');
        if (control) updateGradientStop(control);
      });
      gradientEditor.addEventListener('click', (event) => {
        const button = event.target.closest('[data-remove-gradient-stop]');
        if (!button) return;
        const index = Number(button.dataset.removeGradientStop);
        const stops = Utils.deepClone(this.store.get().loader.gradientStops);
        if (stops.length <= 2 || !stops[index]) return;
        stops.splice(index, 1);
        this.gradientEditorSignature = '';
        this.store.setPath('loader.gradientStops', stops, 'gradient-stop-remove');
      });
      $('#addGradientStopButton').addEventListener('click', () => this.addGradientStop());

      const rowShapeEditor = $('#rowShapeEditor');
      rowShapeEditor.addEventListener('change', (event) => {
        const control = event.target.closest('[data-row-shape-index]');
        if (!control) return;
        const index = Number(control.dataset.rowShapeIndex);
        const shapes = Utils.deepClone(this.store.get().loader.rowShapes);
        if (!shapes[index]) return;
        shapes[index] = control.value;
        this.rowShapeEditorSignature = JSON.stringify(shapes);
        this.store.setPath('loader.rowShapes', shapes, 'row-shape-edit');
      });
      $('#applyRowShapeButton').addEventListener('click', () => {
        const shape = $('#rowShapeAll').value;
        const count = this.store.get().loader.rowCount;
        this.rowShapeEditorSignature = '';
        this.store.setPath('loader.rowShapes', Array.from({ length: count }, () => shape), 'row-shape-all');
        this.setStatus('msg.rowShapeAll', 'success');
      });

      $('#previewCompletionButton').addEventListener('click', () => {
        const state = this.store.get();
        const start = Utils.getCompletionStartTime(state);
        const duration = Utils.getAnimationDuration(state);
        this.renderer.currentTime = Math.min(duration, start + 0.001);
        this.renderer.startedAt = performance.now() - (this.renderer.currentTime / state.timing.previewSpeed) * 1000;
        this.renderer.render(this.renderer.currentTime);
        if (!this.renderer.playing) this.renderer.play();
        this.updatePlayButton(true);
      });
      $('#previewFadeInButton').addEventListener('click', () => {
        this.renderer.seek(0);
        if (!this.renderer.playing) this.renderer.play();
        this.updatePlayButton(true);
      });
    }

    addProgressKeyframe() {
      const points = Utils.deepClone(this.store.get().loader.progressKeyframes).sort((a, b) => a.time - b.time);
      if (points.length >= 16) {
        this.setStatus('msg.keyframeLimit', 'warning');
        return;
      }
      let insertAt = 1;
      let largestGap = -1;
      for (let index = 1; index < points.length; index += 1) {
        const gap = points[index].time - points[index - 1].time;
        if (gap > largestGap) {
          largestGap = gap;
          insertAt = index;
        }
      }
      const left = points[insertAt - 1];
      const right = points[insertAt];
      const ratio = 0.5;
      points.splice(insertAt, 0, {
        time: Number(Utils.lerp(left.time, right.time, ratio).toFixed(2)),
        value: Number(Utils.lerp(left.value, right.value, ratio).toFixed(1)),
        easing: 'smooth',
      });
      this.keyframeEditorSignature = '';
      this.store.setPath('loader.progressKeyframes', points, 'keyframe-add');
    }

    addGradientStop() {
      const stops = Utils.deepClone(this.store.get().loader.gradientStops).sort((a, b) => a.position - b.position);
      if (stops.length >= 7) {
        this.setStatus('msg.gradientLimit', 'warning');
        return;
      }
      let insertAt = 1;
      let largestGap = -1;
      for (let index = 1; index < stops.length; index += 1) {
        const gap = stops[index].position - stops[index - 1].position;
        if (gap > largestGap) {
          largestGap = gap;
          insertAt = index;
        }
      }
      const left = stops[insertAt - 1];
      const right = stops[insertAt];
      stops.splice(insertAt, 0, {
        position: Number(Utils.lerp(left.position, right.position, 0.5).toFixed(1)),
        color: Utils.mixHexColors(left.color, right.color, 0.5),
      });
      this.gradientEditorSignature = '';
      this.store.setPath('loader.gradientStops', stops, 'gradient-stop-add');
    }

    easingLabel(value) {
      return EASING_KEYS[value] ? T(EASING_KEYS[value]) : value;
    }

    renderProgressKeyframes(state) {
      const points = state.loader.progressKeyframes;
      const signature = JSON.stringify(points);
      if (signature !== this.keyframeEditorSignature) {
        const editor = $('#progressKeyframeEditor');
        editor.innerHTML = points.map((point, index) => {
          const first = index === 0;
          const last = index === points.length - 1;
          const options = NS.PROGRESS_EASINGS.map((value) => `<option value="${value}"${point.easing === value ? ' selected' : ''}>${this.escapeHTML(this.easingLabel(value))}</option>`).join('');
          return `<div class="keyframe-row" data-keyframe-index="${index}">
            <span class="editor-index">${index + 1}</span>
            <label class="editor-field"><span>${this.escapeHTML(T('keyframe.time'))}</span><input type="number" min="0" max="120" step="0.05" value="${point.time}" data-index="${index}" data-keyframe-field="time"${first ? ' disabled' : ''}></label>
            <label class="editor-field"><span>${this.escapeHTML(T('keyframe.value'))}</span><input type="number" min="0" max="100" step="0.1" value="${point.value}" data-index="${index}" data-keyframe-field="value"${first || last ? ' disabled' : ''}></label>
            <label class="editor-field editor-easing"><span>${this.escapeHTML(T(first ? 'keyframe.startPoint' : 'keyframe.easing'))}</span><select data-index="${index}" data-keyframe-field="easing"${first ? ' disabled' : ''}>${options}</select></label>
            <button type="button" class="icon-button" data-remove-keyframe="${index}" aria-label="${this.escapeHTML(T('keyframe.remove.aria', index + 1))}"${first || last || points.length <= 2 ? ' disabled' : ''}>×</button>
          </div>`;
        }).join('');
        this.keyframeEditorSignature = signature;
      }
      $('#progressKeyframeCount').textContent = T('keyframe.count', points.length);
      $('#addKeyframeButton').disabled = points.length >= 16;
      $('#progressKeyframeSummary').textContent = points
        .map((point) => T('keyframe.summary.item', Number(point.time).toFixed(2), Math.round(point.value)))
        .join('  →  ');
    }

    renderGradientStops(state) {
      const stops = state.loader.gradientStops;
      const signature = JSON.stringify(stops);
      if (signature !== this.gradientEditorSignature) {
        const editor = $('#gradientStopsEditor');
        editor.innerHTML = stops.map((stop, index) => `<div class="gradient-stop-row" data-gradient-index="${index}">
          <span class="editor-index">${index + 1}</span>
          <label class="editor-field"><span>${this.escapeHTML(T('gradient.stop.color'))}</span><input type="color" value="${stop.color}" data-index="${index}" data-gradient-field="color"></label>
          <label class="editor-field"><span>${this.escapeHTML(T('gradient.stop.position'))}</span><input type="number" min="0" max="100" step="0.5" value="${stop.position}" data-index="${index}" data-gradient-field="position"></label>
          <button type="button" class="icon-button" data-remove-gradient-stop="${index}" aria-label="${this.escapeHTML(T('gradient.remove.aria', index + 1))}"${stops.length <= 2 ? ' disabled' : ''}>×</button>
        </div>`).join('');
        this.gradientEditorSignature = signature;
      }
      $('#gradientStopCount').textContent = T('gradient.count', stops.length);
      $('#addGradientStopButton').disabled = stops.length >= 7;
    }

    rowShapeLabel(value) {
      return SHAPE_KEYS[value] ? T(SHAPE_KEYS[value]) : value;
    }

    renderRowShapes(state) {
      const shapes = state.loader.rowShapes;
      const signature = JSON.stringify(shapes);
      if (signature !== this.rowShapeEditorSignature) {
        const editor = $('#rowShapeEditor');
        editor.innerHTML = shapes.map((shape, index) => {
          const options = NS.ROW_SHAPES.map((value) => (
            `<option value="${value}"${shape === value ? ' selected' : ''}>${this.rowShapeLabel(value)}</option>`
          )).join('');
          const label = this.escapeHTML(T('rowShape.item', index + 1));
          return `<label class="row-shape-row"><span class="editor-index">${index + 1}</span><span>${label}</span><select data-row-shape-index="${index}" aria-label="${label}">${options}</select></label>`;
        }).join('');
        this.rowShapeEditorSignature = signature;
      }
      $('#rowShapeCount').textContent = state.loader.rowBaseMode === 'images'
        ? T('rowShape.count.images', shapes.length)
        : T('rowShape.count', shapes.length);
    }

    readControlValue(control) {
      if (control.type === 'checkbox') return control.checked;
      if (control.dataset.type === 'number' || control.type === 'range' || control.type === 'number') {
        return Number(control.value);
      }
      return control.value;
    }

    bindMediaControls() {
      const input = $('#characterFiles');
      const dropZone = $('#characterDropZone');
      input.addEventListener('change', () => this.loadCharacterFiles(input.files));
      $('#chooseCharacterButton').addEventListener('click', () => input.click());
      $('#clearCharacterButton').addEventListener('click', () => {
        this.invalidateProjectLoad();
        this.media.clearSource();
        this.store.setPath('character.sourceMode', 'builtin', 'source-clear');
        input.value = '';
        this.updateSourceInfo();
        this.setStatus('msg.characterCleared', 'success');
      });

      ['dragenter', 'dragover'].forEach((type) => {
        dropZone.addEventListener(type, (event) => {
          event.preventDefault();
          dropZone.classList.add('is-dragging');
        });
      });
      ['dragleave', 'drop'].forEach((type) => {
        dropZone.addEventListener(type, (event) => {
          event.preventDefault();
          dropZone.classList.remove('is-dragging');
        });
      });
      dropZone.addEventListener('drop', (event) => this.loadCharacterFiles(event.dataTransfer.files));
      dropZone.addEventListener('click', (event) => {
        if (!event.target.closest('button')) input.click();
      });
      dropZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          input.click();
        }
      });

      const rowInput = $('#rowImageFiles');
      const rowDropZone = $('#rowImageDropZone');
      rowInput.addEventListener('change', () => this.loadRowImageFiles(rowInput.files));
      $('#chooseRowImagesButton').addEventListener('click', () => rowInput.click());
      $('#clearRowImagesButton').addEventListener('click', () => {
        this.invalidateProjectLoad();
        this.rowMedia.clearSource();
        rowInput.value = '';
        this.updateRowSourceInfo();
        this.setStatus('msg.rowImagesCleared', 'success');
      });
      ['dragenter', 'dragover'].forEach((type) => {
        rowDropZone.addEventListener(type, (event) => {
          event.preventDefault();
          rowDropZone.classList.add('is-dragging');
        });
      });
      ['dragleave', 'drop'].forEach((type) => {
        rowDropZone.addEventListener(type, (event) => {
          event.preventDefault();
          rowDropZone.classList.remove('is-dragging');
        });
      });
      rowDropZone.addEventListener('drop', (event) => this.loadRowImageFiles(event.dataTransfer.files));
      rowDropZone.addEventListener('click', (event) => {
        if (!event.target.closest('button')) rowInput.click();
      });
      rowDropZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          rowInput.click();
        }
      });

      const rowBaseInput = $('#rowBaseImageFiles');
      const rowBaseDropZone = $('#rowBaseImageDropZone');
      rowBaseInput.addEventListener('change', () => this.loadRowBaseImageFiles(rowBaseInput.files));
      $('#chooseRowBaseImagesButton').addEventListener('click', () => rowBaseInput.click());
      $('#clearRowBaseImagesButton').addEventListener('click', () => {
        this.invalidateProjectLoad();
        this.rowBaseMedia.clearSource();
        rowBaseInput.value = '';
        this.updateRowBaseSourceInfo();
        this.setStatus('msg.rowBaseImagesCleared', 'success');
      });
      ['dragenter', 'dragover'].forEach((type) => {
        rowBaseDropZone.addEventListener(type, (event) => {
          event.preventDefault();
          rowBaseDropZone.classList.add('is-dragging');
        });
      });
      ['dragleave', 'drop'].forEach((type) => {
        rowBaseDropZone.addEventListener(type, (event) => {
          event.preventDefault();
          rowBaseDropZone.classList.remove('is-dragging');
        });
      });
      rowBaseDropZone.addEventListener('drop', (event) => this.loadRowBaseImageFiles(event.dataTransfer.files));
      rowBaseDropZone.addEventListener('click', (event) => {
        if (!event.target.closest('button')) rowBaseInput.click();
      });
      rowBaseDropZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          rowBaseInput.click();
        }
      });

      const fontInput = $('#fontFile');
      $('#chooseFontButton').addEventListener('click', () => fontInput.click());
      fontInput.addEventListener('change', async () => {
        const file = fontInput.files && fontInput.files[0];
        if (!file) return;
        this.invalidateProjectLoad();
        const media = this.media;
        try {
          this.setBusy(true, T('busy.font'));
          this.setStatus('busy.font', 'working');
          const family = await media.loadFontFile(file, 'CocoUserFont');
          this.store.patch({
            text: {
              top: { fontFamily: `'${family}', sans-serif` },
              bottom: { fontFamily: `'${family}', sans-serif` },
            },
          }, 'font');
          this.applyFontInfo('font.info.applied', file.name);
          this.setStatus('msg.fontApplied', 'success');
        } catch (error) {
          if (!error || !error.isStaleMediaLoad) this.showError(error);
        } finally {
          this.setBusy(false);
          fontInput.value = '';
        }
      });
    }

    async loadCharacterFiles(files) {
      if (!files || !files.length) return;
      this.invalidateProjectLoad();
      const media = this.media;
      try {
        this.setBusy(true, T('busy.image'));
        const source = await media.loadFiles(files, (progress, message) => {
          this.updateWorkProgress(progress, message);
        });
        this.store.setPath('character.sourceMode', 'upload', 'source-load');
        this.updateSourceInfo();
        if (source.warning) this.setStatus(source.warning, 'warning');
        else this.setStatus('msg.characterLoaded', 'success', media.frameCount);
      } catch (error) {
        if (!error || !error.isStaleMediaLoad) {
          media.clearSource();
          this.showError(error);
        }
      } finally {
        this.setBusy(false);
        $('#characterFiles').value = '';
      }
    }

    async loadRowImageFiles(files) {
      if (!files || !files.length) return;
      this.invalidateProjectLoad();
      const rowMedia = this.rowMedia;
      try {
        this.setBusy(true, T('busy.rowImages'));
        await rowMedia.loadCollection(files, (progress, message) => {
          this.updateWorkProgress(progress, message);
        });
        this.updateRowSourceInfo();
        this.setStatus('msg.rowImagesLoaded', 'success', rowMedia.frameCount);
      } catch (error) {
        if (!error || !error.isStaleMediaLoad) {
          rowMedia.clearSource();
          this.updateRowSourceInfo();
          this.showError(error);
        }
      } finally {
        this.setBusy(false);
        $('#rowImageFiles').value = '';
      }
    }

    async loadRowBaseImageFiles(files) {
      if (!files || !files.length) return;
      this.invalidateProjectLoad();
      const rowBaseMedia = this.rowBaseMedia;
      try {
        this.setBusy(true, T('busy.rowBaseImages'));
        await rowBaseMedia.loadCollection(files, (progress, message) => {
          this.updateWorkProgress(progress, message);
        });
        this.store.setPath('loader.rowBaseMode', 'images', 'row-base-source-load');
        this.updateRowBaseSourceInfo();
        this.setStatus('msg.rowBaseImagesLoaded', 'success', rowBaseMedia.frameCount);
      } catch (error) {
        if (!error || !error.isStaleMediaLoad) {
          rowBaseMedia.clearSource();
          this.updateRowBaseSourceInfo();
          this.showError(error);
        }
      } finally {
        this.setBusy(false);
        $('#rowBaseImageFiles').value = '';
      }
    }

    bindProjectControls() {
      $('#saveProjectButton').addEventListener('click', () => this.saveProject());
      $('#loadProjectButton').addEventListener('click', () => $('#projectFile').click());
      $('#projectFile').addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (file) await this.loadProject(file);
        event.target.value = '';
      });
      $('#resetProjectButton').addEventListener('click', () => {
        this.invalidateProjectLoad();
        this.media.clearSource();
        this.rowMedia.clearSource();
        this.rowBaseMedia.clearSource();
        this.media.clearFont();
        this.store.replace(DEFAULT_STATE, 'reset');
        this.updateSourceInfo();
        this.updateRowSourceInfo();
        this.updateRowBaseSourceInfo();
        this.applyFontInfo('font.info.default');
        this.setStatus('msg.projectReset', 'success');
      });
    }

    async saveProject() {
      this.invalidateProjectLoad();
      try {
        this.setBusy(true, T('busy.projectSave'));
        const includeAssets = this.store.get().ui.includeAssetsInProject;
        const state = this.store.serialize();
        const media = this.media;
        const rowMedia = this.rowMedia;
        const rowBaseMedia = this.rowBaseMedia;
        const [assets, rowAssets, rowBaseAssets, font] = includeAssets
          ? await Promise.all([
            media.serializeSource(),
            rowMedia.serializeSource(),
            rowBaseMedia.serializeSource(),
            media.serializeFont(),
          ])
          : [null, null, null, null];
        const payload = {
          app: 'coco-loading-maker',
          version: 3,
          savedAt: new Date().toISOString(),
          state,
          assets,
          rowAssets,
          rowBaseAssets,
          font,
        };
        const baseName = Utils.sanitizeFileName(state.export.fileName, 'loading-animation');
        Utils.downloadText(JSON.stringify(payload, null, 2), `${baseName}.project.json`);
        this.setStatus(includeAssets ? 'msg.projectSaved.assets' : 'msg.projectSaved', 'success');
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    }

    async loadProject(file) {
      if (this.isExporting) {
        this.setStatus('msg.loadWhileExporting', 'warning');
        return;
      }
      const loadGeneration = this.invalidateProjectLoad();
      const loadContext = { generation: loadGeneration, managers: [] };
      this.activeProjectLoad = loadContext;
      let nextMedia = null;
      let nextRowMedia = null;
      let nextRowBaseMedia = null;
      const ensureCurrentLoad = () => {
        if (loadGeneration !== this.projectLoadGeneration || this.activeProjectLoad !== loadContext) {
          throw projectLoadAbortError();
        }
      };
      try {
        this.setBusy(true, T('busy.projectLoad'));
        this.media.invalidatePendingLoads();
        this.rowMedia.invalidatePendingLoads();
        this.rowBaseMedia.invalidatePendingLoads();
        const raw = JSON.parse(await file.text());
        ensureCurrentLoad();
        const isEnvelope = raw && typeof raw === 'object' && !Array.isArray(raw);
        const isCurrentProject = isEnvelope && raw.app === 'coco-loading-maker'
          && Number(raw.version) === 3
          && raw.state && Number(raw.state.version) === 3;
        const isCurrentPreset = isEnvelope && raw.app === 'coco-loading-maker-preset'
          && Number(raw.version) === 3
          && raw.preset && raw.preset.state
          && Number(raw.preset.state.version) === 3;
        if (!isCurrentProject && !isCurrentPreset) {
          throw new Error(T('err.projectVersion'));
        }

        let state = raw.state;
        let assets = raw.assets;
        let rowAssets = raw.rowAssets;
        let rowBaseAssets = raw.rowBaseAssets;
        let font = raw.font;
        if (isCurrentPreset) {
          state = raw.preset.state;
          assets = null;
          rowAssets = null;
          rowBaseAssets = null;
          font = null;
        }

        const normalizedState = new StateStore(state).serialize();
        normalizedState.character.sourceMode = assets && assets.files && assets.files.length
          ? 'upload'
          : 'builtin';
        nextMedia = new MediaManager();
        nextRowMedia = new MediaManager();
        nextRowBaseMedia = new MediaManager();
        loadContext.managers = [nextMedia, nextRowMedia, nextRowBaseMedia];
        const updateProjectProgress = (progress, message) => {
          if (loadGeneration === this.projectLoadGeneration && this.activeProjectLoad === loadContext) {
            this.updateWorkProgress(progress, message);
          }
        };
        if (assets && assets.files && assets.files.length) {
          await nextMedia.restoreSource(assets, updateProjectProgress);
          ensureCurrentLoad();
        }
        if (rowAssets && rowAssets.files && rowAssets.files.length) {
          await nextRowMedia.restoreCollection(rowAssets, updateProjectProgress);
          ensureCurrentLoad();
        }
        if (rowBaseAssets && rowBaseAssets.files && rowBaseAssets.files.length) {
          await nextRowBaseMedia.restoreCollection(rowBaseAssets, updateProjectProgress);
          ensureCurrentLoad();
        }
        if (font) {
          await nextMedia.restoreFont(font);
          ensureCurrentLoad();
        }
        ensureCurrentLoad();

        this.media.clearSource();
        this.rowMedia.clearSource();
        this.rowBaseMedia.clearSource();
        this.media.clearFont();
        this.media = nextMedia;
        this.rowMedia = nextRowMedia;
        this.rowBaseMedia = nextRowBaseMedia;
        this.renderer.media = this.media;
        this.renderer.rowMedia = this.rowMedia;
        this.renderer.rowBaseMedia = this.rowBaseMedia;
        this.exporter.media = this.media;
        nextMedia = null;
        nextRowMedia = null;
        nextRowBaseMedia = null;
        this.store.replace(normalizedState, 'project-load');
        if (font) this.applyFontInfo('font.info.restored', font.name || T('font.project'));
        else this.applyFontInfo('font.info.default');
        this.updateSourceInfo();
        this.updateRowSourceInfo();
        this.updateRowBaseSourceInfo();
        this.setStatus('msg.projectLoaded', 'success');
      } catch (error) {
        const cancelled = loadGeneration !== this.projectLoadGeneration
          || this.activeProjectLoad !== loadContext
          || (error && (error.isProjectLoadCancellation || error.isStaleMediaLoad));
        if (!cancelled) this.showError(error);
      } finally {
        if (nextMedia) {
          nextMedia.clearSource();
          nextMedia.clearFont();
        }
        if (nextRowMedia) nextRowMedia.clearSource();
        if (nextRowBaseMedia) nextRowBaseMedia.clearSource();
        if (this.activeProjectLoad === loadContext) this.activeProjectLoad = null;
        this.updateSourceInfo();
        this.updateRowSourceInfo();
        this.updateRowBaseSourceInfo();
        this.setBusy(false);
      }
    }

    bindPreviewControls() {
      $('#playPauseButton').addEventListener('click', () => {
        const playing = this.renderer.toggle();
        this.updatePlayButton(playing);
      });
      const scrubber = $('#timeScrubber');
      scrubber.addEventListener('pointerdown', () => { this.isScrubbing = true; });
      scrubber.addEventListener('pointerup', () => { this.isScrubbing = false; });
      scrubber.addEventListener('input', () => this.renderer.seek(Number(scrubber.value) / 1000));

      $('#downloadPngButton').addEventListener('click', () => {
        this.renderer.render(this.renderer.currentTime);
        this.canvas.toBlob((blob) => {
          if (!blob) return;
          const name = Utils.sanitizeFileName(this.store.get().export.fileName, 'loading-preview');
          Utils.downloadBlob(blob, `${name}-frame.png`);
        }, 'image/png');
      });
    }

    bindExportControls() {
      $('#exportButton').addEventListener('click', () => this.exportAnimation());
      $('#cancelExportButton').addEventListener('click', () => {
        this.exporter.cancel();
        this.setStatus('msg.exportCancelRequested', 'warning');
      });
      this.updateExportEstimate();
    }

    async exportAnimation() {
      if (this.isExporting) return;
      this.invalidateProjectLoad();
      const estimate = this.exporter.estimate();
      const totalPixels = this.store.get().canvas.width * this.store.get().canvas.height * estimate.frameCount;
      if (totalPixels > 220000000) {
        this.setStatus('msg.tooHeavy', 'error');
        return;
      }
      try {
        this.isExporting = true;
        this.setBusy(true, T('busy.exportPrepare'));
        $('#cancelExportButton').hidden = false;
        $('#exportButton').disabled = true;
        const blob = await this.exporter.export((progress, message) => this.updateWorkProgress(progress, message));
        const state = this.store.get();
        const ext = Utils.extensionForFormat(state.export.format);
        const name = Utils.sanitizeFileName(state.export.fileName, 'loading-animation');
        Utils.downloadBlob(blob, `${name}.${ext}`);
        this.setStatus('msg.exported', 'success', state.export.format.toUpperCase(), Utils.formatBytes(blob.size));
      } catch (error) {
        if (error && error.name === 'AbortError') this.setStatus('msg.exportCancelled', 'warning');
        else this.showError(error);
      } finally {
        this.isExporting = false;
        this.setBusy(false);
        $('#cancelExportButton').hidden = true;
        $('#exportButton').disabled = false;
      }
    }

    bindCanvasDragging() {
      const canvas = this.canvas;
      const pointFromEvent = (event) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (event.clientX - rect.left) * canvas.width / rect.width,
          y: (event.clientY - rect.top) * canvas.height / rect.height,
        };
      };
      canvas.addEventListener('pointerdown', (event) => {
        const point = pointFromEvent(event);
        const state = this.store.get();
        const rect = canvas.getBoundingClientRect();
        const hitPadding = 5 * canvas.height / Math.max(1, rect.height);
        const target = this.renderer.hitTestElement(
          point.x,
          point.y,
          state,
          this.renderer.currentTime,
          null,
          hitPadding,
        );
        if (!target) return;
        const startBounds = this.renderer.getElementMetrics(target, state, this.renderer.currentTime);
        if (!startBounds) return;
        event.preventDefault();
        const wasPlaying = this.renderer.playing;
        if (wasPlaying) {
          this.renderer.pause();
          this.updatePlayButton(false);
        }
        this.selectedElement = target;
        this.dragSession = {
          target,
          pointerId: event.pointerId,
          point,
          startBounds,
          startState: Utils.deepClone(state),
          wasPlaying,
          snapLockX: null,
          snapLockY: null,
        };
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add('is-dragging');
      });
      canvas.addEventListener('pointermove', (event) => {
        if (!this.dragSession || this.dragSession.pointerId !== event.pointerId) return;
        const point = pointFromEvent(event);
        const dx = point.x - this.dragSession.point.x;
        const dy = point.y - this.dragSession.point.y;
        const desired = this.translateBounds(this.dragSession.startBounds, dx, dy);
        const snapped = this.snapDraggedBounds(this.dragSession.target, desired);
        this.applyDraggedPosition(
          this.dragSession.target,
          snapped.cx - this.dragSession.startBounds.cx,
          snapped.cy - this.dragSession.startBounds.cy,
          this.dragSession.startState,
        );
        this.showSnapGuides(snapped.guideX, snapped.guideY);
      });
      const endDrag = (event) => {
        if (!this.dragSession || this.dragSession.pointerId !== event.pointerId) return;
        const shouldResume = Boolean(this.dragSession.wasPlaying);
        this.dragSession = null;
        canvas.classList.remove('is-dragging');
        this.showSnapGuides(null, null);
        try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* ignored */ }
        if (shouldResume) {
          this.renderer.play();
          this.updatePlayButton(true);
        }
      };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
    }

    translateBounds(bounds, dx, dy) {
      return {
        ...bounds,
        cx: bounds.cx + dx,
        cy: bounds.cy + dy,
        left: bounds.left + dx,
        right: bounds.right + dx,
        top: bounds.top + dy,
        bottom: bounds.bottom + dy,
      };
    }

    snapDraggedBounds(targetId, desired) {
      const state = this.store.get();
      const rect = this.canvas.getBoundingClientRect();
      const thresholds = {
        x: 8 * this.canvas.width / Math.max(1, rect.width),
        y: 8 * this.canvas.height / Math.max(1, rect.height),
      };
      const exclusions = new Set([targetId]);
      if (targetId === 'loader') {
        exclusions.add('percent');
        if (this.renderer.isCharacterFollowingProgress(state)) exclusions.add('character');
      }
      const elementBounds = this.renderer.draggableElementIds(state)
        .filter((id) => !exclusions.has(id))
        .map((id) => this.renderer.getElementMetrics(id, state, this.renderer.currentTime))
        .filter(Boolean);
      const targetValues = { x: [], y: [] };
      if (state.ui.snapToCanvas) {
        targetValues.x.push(0, this.canvas.width / 2, this.canvas.width);
        targetValues.y.push(0, this.canvas.height / 2, this.canvas.height);
      }
      if (state.ui.snapToElements) {
        elementBounds.forEach((bounds) => {
          targetValues.x.push(bounds.left, bounds.cx, bounds.right);
          targetValues.y.push(bounds.top, bounds.cy, bounds.bottom);
        });
      }

      const snapAxis = (axis, sources, lockKey) => {
        const session = this.dragSession;
        const existing = session && session[lockKey];
        if (existing) {
          const delta = existing.value - sources[existing.sourceIndex];
          if (Math.abs(delta) <= thresholds[axis] * 1.5) return { delta, guide: existing.value };
          session[lockKey] = null;
        }
        let best = null;
        targetValues[axis].forEach((value) => {
          sources.forEach((source, sourceIndex) => {
            const delta = value - source;
            if (Math.abs(delta) > thresholds[axis]) return;
            if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, guide: value, sourceIndex };
          });
        });
        if (best && session) session[lockKey] = { value: best.guide, sourceIndex: best.sourceIndex };
        return best || { delta: 0, guide: null };
      };

      const snapX = snapAxis('x', [desired.left, desired.cx, desired.right], 'snapLockX');
      const snapY = snapAxis('y', [desired.top, desired.cy, desired.bottom], 'snapLockY');
      return {
        ...this.translateBounds(desired, snapX.delta, snapY.delta),
        guideX: snapX.guide,
        guideY: snapY.guide,
      };
    }

    applyDraggedPosition(targetId, dx, dy, startState) {
      const width = startState.canvas.width;
      const height = startState.canvas.height;
      const scale = height / 360;
      if (targetId === 'character') {
        if (this.renderer.isCharacterFollowingProgress(startState)) {
          this.store.patch({ character: {
            followOffsetX: startState.character.followOffsetX + dx / scale,
            followOffsetY: startState.character.followOffsetY + dy / scale,
          } }, 'drag-character-follow');
        } else {
          this.store.patch({ character: {
            x: startState.character.x + dx / width * 100,
            y: startState.character.y + dy / height * 100,
          } }, 'drag-character');
        }
        return;
      }
      if (targetId === 'loader') {
        this.store.patch({ loader: {
          x: startState.loader.x + dx / width * 100,
          y: startState.loader.y + dy / height * 100,
        } }, 'drag-loader');
        return;
      }
      if (targetId === 'percent') {
        this.store.patch({ loader: {
          percentOffsetX: startState.loader.percentOffsetX + dx / scale,
          percentOffsetY: startState.loader.percentOffsetY + dy / scale,
        } }, 'drag-percent');
        return;
      }
      const textKey = targetId === 'text.top' ? 'top' : targetId === 'text.bottom' ? 'bottom' : null;
      if (textKey) {
        this.store.patch({ text: { [textKey]: {
          x: startState.text[textKey].x + dx / width * 100,
          y: startState.text[textKey].y + dy / height * 100,
        } } }, `drag-${targetId}`);
      }
    }

    showSnapGuides(x, y) {
      const guideX = $('#snapGuideX');
      const guideY = $('#snapGuideY');
      guideX.hidden = x === null || x === undefined;
      guideY.hidden = y === null || y === undefined;
      if (!guideX.hidden) guideX.style.left = `${x / this.canvas.width * 100}%`;
      if (!guideY.hidden) guideY.style.top = `${y / this.canvas.height * 100}%`;
    }

    onStateChanged(state, reason, path) {
      if ((path && path.startsWith('canvas.')) || reason === 'canvas-size' || reason === 'project-load' || reason === 'reset') {
        this.renderer.resize();
      }
      if (path === 'timing.previewSpeed' && this.renderer.playing) {
        this.renderer.startedAt = performance.now() - (this.renderer.currentTime / state.timing.previewSpeed) * 1000;
      }
      const totalDuration = Utils.getAnimationDuration(state);
      if (this.renderer.currentTime > totalDuration) this.renderer.currentTime = totalDuration;
      this.syncUI(state, path);
      this.updateExportEstimate();
    }

    syncUI(state, changedPath) {
      $$('[data-bind]').forEach((control) => {
        if (document.activeElement === control && changedPath === control.dataset.bind) return;
        const value = this.getPath(state, control.dataset.bind);
        if (control.type === 'checkbox') control.checked = Boolean(value);
        else if (value !== undefined && String(control.value) !== String(value)) control.value = value;
      });
      $$('[data-value-for]').forEach((label) => {
        const value = this.getPath(state, label.dataset.valueFor);
        const digits = Number(label.dataset.digits || 0);
        const suffix = label.dataset.suffix || '';
        const prefix = label.dataset.prefix || '';
        label.textContent = `${prefix}${Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : value}${suffix}`;
      });
      $$('[data-visible]').forEach((element) => {
        const [path, expected] = element.dataset.visible.split(':');
        const actual = this.getPath(state, path);
        const allowed = expected.split('|').includes(String(actual));
        element.hidden = !allowed;
      });

      this.renderProgressKeyframes(state);
      this.renderGradientStops(state);
      this.renderRowShapes(state);
      const rowUsesRandom = state.loader.rowOrder === 'random'
        || state.loader.rowImageOrder === 'random'
        || (state.loader.rowBaseMode === 'images' && state.loader.rowBaseImageOrder === 'random');
      $('#rowRandomRepeatsWrap').hidden = state.loader.type !== 'image-row' || !rowUsesRandom;
      const keyframeMode = state.loader.type === 'bar' && state.loader.progressMode === 'keyframes';
      const progressDuration = Utils.getProgressDuration(state);
      const totalDuration = Utils.getAnimationDuration(state);
      $('#progressDurationField').hidden = keyframeMode;
      $('#keyframeDurationField').hidden = !keyframeMode;
      $('#keyframeDurationValue').textContent = T('unit.seconds', progressDuration.toFixed(2));
      $('#durationInputLabel').textContent = T(state.loader.type === 'bar'
        ? 'duration.label.bar'
        : state.loader.type === 'loop'
          ? 'duration.label.loop'
          : state.loader.type === 'image-row'
            ? (state.loader.rowMode === 'loop' ? 'duration.label.rowLoop' : 'duration.label.rowProgress')
            : 'duration.label.none');
      if (state.loader.type === 'bar') {
        const fadeInDuration = Utils.getFadeInDuration(state);
        const motionDuration = state.loader.completionMotion === 'none' ? 0 : state.loader.completionMotionDuration;
        const fadeInPart = fadeInDuration > 0 ? T('duration.fadeIn', fadeInDuration.toFixed(2)) : '';
        $('#durationBreakdown').innerHTML = T('duration.bar', fadeInPart, progressDuration.toFixed(2),
          state.loader.completionDelay.toFixed(2), motionDuration.toFixed(2), totalDuration.toFixed(2));
      } else if (state.loader.type === 'loop') {
        const rotations = totalDuration * Math.abs(state.loader.loopSpeed);
        const seamless = Math.abs(rotations - Math.round(rotations)) < 1e-8;
        $('#durationBreakdown').innerHTML = T('duration.loop',
          totalDuration.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''),
          rotations.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''),
          seamless ? T('duration.seamless') : '');
      } else if (state.loader.type === 'image-row') {
        const rounds = rowUsesRandom ? state.loader.rowRandomRepeats : 1;
        const alternating = state.loader.rowStartPattern !== 'all-base';
        const action = state.loader.rowMode === 'loop'
          ? T('duration.row.loop', rounds)
          : rounds > 1
            ? T('duration.row.random', rounds)
            : alternating
              ? T('duration.row.alternating')
              : T('duration.row.progress');
        $('#durationBreakdown').innerHTML = T('duration.row', state.loader.rowCount, action, totalDuration.toFixed(2));
      } else {
        $('#durationBreakdown').innerHTML = T('duration.total', totalDuration.toFixed(2));
      }
      $('#previewFadeInButton').disabled = !state.loader.fadeIn;
      $('#previewCompletionButton').disabled = state.loader.completionMotion === 'none';

      const wrapper = $('#canvasStage');
      wrapper.classList.toggle('is-transparent', state.canvas.transparent);
      wrapper.style.aspectRatio = `${state.canvas.width} / ${state.canvas.height}`;
      $('#canvasSizeLabel').textContent = `${state.canvas.width} × ${state.canvas.height}px`;
      const presetValue = `${state.canvas.width}x${state.canvas.height}`;
      $('#sizePreset').value = Array.from($('#sizePreset').options).some((option) => option.value === presetValue) ? presetValue : 'custom';
      this.updatePlayButton(this.renderer.playing);
    }

    updateSourceInfo() {
      const info = $('#sourceInfo');
      if (!this.media.hasUpload) {
        info.innerHTML = `<strong>${this.escapeHTML(T('char.info.builtin'))}</strong><span>${this.escapeHTML(T('char.info.builtinHint'))}</span>`;
        return;
      }
      const source = this.media.source;
      const names = source.records.map((record) => record.name).slice(0, 2).join(', ');
      const more = source.records.length > 2 ? T('info.more', source.records.length - 2) : '';
      info.innerHTML = `<strong>${this.escapeHTML(T('char.info.frames', this.media.frameCount, source.width, source.height))}</strong><span>${this.escapeHTML(names)}${this.escapeHTML(more)}</span>`;
    }

    updateRowSourceInfo() {
      const info = $('#rowImageInfo');
      if (!this.rowMedia.hasUpload) {
        info.innerHTML = `<strong>${this.escapeHTML(T('row.images.empty'))}</strong><span>${this.escapeHTML(T('row.images.emptyHint'))}</span>`;
        return;
      }
      const source = this.rowMedia.source;
      const names = source.records.map((record) => record.name).slice(0, 3).join(', ');
      const more = source.records.length > 3 ? T('info.more', source.records.length - 3) : '';
      info.innerHTML = `<strong>${this.escapeHTML(T('row.info.count', this.rowMedia.frameCount))}</strong><span>${this.escapeHTML(names)}${this.escapeHTML(more)}</span>`;
    }

    updateRowBaseSourceInfo() {
      const info = $('#rowBaseImageInfo');
      if (!this.rowBaseMedia.hasUpload) {
        info.innerHTML = `<strong>${this.escapeHTML(T('row.baseImages.empty'))}</strong><span>${this.escapeHTML(T('row.baseImages.emptyHint'))}</span>`;
        return;
      }
      const source = this.rowBaseMedia.source;
      const names = source.records.map((record) => record.name).slice(0, 3).join(', ');
      const more = source.records.length > 3 ? T('info.more', source.records.length - 3) : '';
      info.innerHTML = `<strong>${this.escapeHTML(T('row.info.count', this.rowBaseMedia.frameCount))}</strong><span>${this.escapeHTML(names)}${this.escapeHTML(more)}</span>`;
    }

    updateExportEstimate() {
      if (!this.exporter) return;
      const estimate = this.exporter.estimate();
      const state = this.store.get();
      const text = T('export.estimate', estimate.duration.toFixed(2), estimate.frameCount,
        Math.round(estimate.delayMs), Utils.formatBytes(estimate.rawBytes));
      $('#exportEstimate').textContent = text;
      const format = state.export.format.toUpperCase();
      $('#exportButtonLabel').textContent = T('export.make', format);
      $('[data-visible="export.format:gif"]').hidden = state.export.format !== 'gif';
      $('[data-visible="export.format:webp"]').hidden = state.export.format !== 'webp';
    }

    onPreviewTime(time, duration) {
      if (!this.isScrubbing) $('#timeScrubber').value = Math.round((time / Math.max(0.001, duration)) * 1000);
      $('#timeLabel').textContent = T('preview.time', time.toFixed(2), duration.toFixed(2));
    }

    updatePlayButton(playing) {
      $('#playPauseButton').textContent = T(playing ? 'preview.pause' : 'preview.play');
      $('#playPauseButton').setAttribute('aria-pressed', String(playing));
    }

    updateCapabilityBadges() {
      const badges = $('#capabilityBadges');
      const webpCanvas = (() => {
        try {
          const canvas = document.createElement('canvas');
          return canvas.toDataURL('image/webp').startsWith('data:image/webp');
        } catch (_) { return false; }
      })();
      const apngExport = typeof NS.canEncodeAPNG === 'function'
        ? NS.canEncodeAPNG()
        : Boolean(global.pako && typeof global.pako.deflate === 'function');
      const items = [
        ['cap.input', Boolean(NS.AnimationDecoders || ('ImageDecoder' in global))],
        ['cap.apng', apngExport],
        ['cap.webp', webpCanvas],
        ['cap.gif', true],
      ];
      badges.innerHTML = items.map(([key, ok]) => `<span class="capability ${ok ? 'is-ok' : 'is-limited'}">${ok ? '●' : '△'} ${this.escapeHTML(T(key))}</span>`).join('');
    }

    setBusy(busy, message) {
      this.busyDepth = busy ? this.busyDepth + 1 : Math.max(0, this.busyDepth - 1);
      const active = this.busyDepth > 0;
      document.body.classList.toggle('is-busy', active);
      document.body.setAttribute('aria-busy', String(active));
      if (message) this.updateWorkProgress(0, message);
      if (!active) {
        $('#workProgress').value = 0;
        $('#workProgressWrap').hidden = true;
      }
    }

    updateWorkProgress(progress, message) {
      const wrap = $('#workProgressWrap');
      const bar = $('#workProgress');
      wrap.hidden = false;
      bar.value = Utils.clamp(progress, 0, 1);
      $('#workProgressText').textContent = message || T('status.processing');
    }

    /* 狀態訊息保存 key 與參數，切換語言時才能以新語言重繪。 */
    setStatus(key, type = 'ready', ...args) {
      this.status = { key, text: '', type, args };
      this.renderStatus();
    }

    /* 例外訊息在拋出當下就已在地化，沒有 key 可保存，故另外處理。 */
    setStatusText(text, type = 'ready') {
      this.status = { key: '', text, type, args: [] };
      this.renderStatus();
    }

    renderStatus() {
      const status = $('#statusMessage');
      const { key, text, type, args } = this.status;
      status.textContent = key ? T(key, ...args) : text;
      status.dataset.type = type;
      global.clearTimeout(this.lastStatusTimer);
      if (type === 'success') {
        this.lastStatusTimer = global.setTimeout(() => {
          if (status.dataset.type === 'success') this.setStatus('status.idle', 'ready');
        }, 6000);
      }
    }

    applyFontInfo(key, ...args) {
      this.fontInfo = { key, args };
      $('#fontInfo').textContent = T(key, ...args);
    }

    showError(error) {
      console.error(error);
      this.setStatusText(error && error.message ? error.message : String(error), 'error');
    }

    getPath(object, path) {
      return String(path).split('.').reduce((value, key) => value && value[key], object);
    }

    escapeHTML(value) {
      return String(value).replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
      }[char]));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      global.cocoLoadingMakerApp = new App();
    } catch (error) {
      console.error(error);
      const status = document.getElementById('statusMessage');
      if (status) {
        status.textContent = T('err.init', error.message || error);
        status.dataset.type = 'error';
      }
    }
  });
}(window));
