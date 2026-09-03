(function (global) {
  'use strict';

  const NS = global.CocoLoadingMaker = global.CocoLoadingMaker || {};
  const { Utils } = NS;

  const PROGRESS_EASINGS = [
    'linear', 'smooth', 'ease-in', 'ease-out', 'ease-in-out', 'steps', 'bounce', 'irregular',
  ];
  const COMPLETION_MOTIONS = [
    'none', 'fade', 'sparkle', 'glitch', 'shards', 'pixel-dissolve',
    'shrink-pop', 'slide-up', 'wipe', 'spin-vanish', 'burst',
  ];
  const ROW_SHAPES = [
    'circle', 'square', 'diamond', 'triangle', 'star', 'heart', 'hexagon',
  ];

  const DEFAULT_STATE = {
    version: 3,
    canvas: {
      width: 640,
      height: 360,
      transparent: true,
      background: '#fff7fb',
    },
    character: {
      sourceMode: 'builtin',
      builtin: 'cloud-cat',
      x: 50,
      y: 47,
      size: 42,
      rotation: 0,
      opacity: 1,
      speed: 1,
      frameFps: 8,
      useOriginalTiming: true,
      motion: 'float',
      motionAmount: 7,
      motionSpeed: 1,
      followProgress: false,
      followPlacement: 'above',
      followGap: 8,
      followOffsetX: 0,
      followOffsetY: 0,
      followKeepInside: true,
      followSnapToSegments: false,
      followFlipX: false,
      shadow: true,
      shadowColor: '#9a7e9a',
      shadowBlur: 14,
      shadowOffsetY: 7,
    },
    loader: {
      type: 'bar',
      x: 50,
      y: 75,
      width: 58,
      height: 7,
      barStyle: 'rounded',
      progressMode: 'ease-in-out',
      progressStart: 0,
      progressEnd: 100,
      progressKeyframes: [
        { time: 0, value: 0, easing: 'linear' },
        { time: 1, value: 30, easing: 'ease-out' },
        { time: 2, value: 70, easing: 'smooth' },
        { time: 3, value: 100, easing: 'ease-in-out' },
      ],
      seed: 21,
      trackColor: '#eadfeb',
      fillColor: '#ff7ea8',
      fillMode: 'solid',
      gradientStops: [
        { position: 0, color: '#ff6f9f' },
        { position: 50, color: '#ffd166' },
        { position: 100, color: '#8d78ff' },
      ],
      gradientAngle: 0,
      gradientBlur: 0,
      gradientAnimate: false,
      gradientSpeed: 0.28,
      gradientDirection: 1,
      trackShimmer: true,
      borderColor: '#5a4058',
      borderWidth: 2,
      glow: true,
      glowColor: '#ffb0ca',
      glowBlur: 14,
      segments: 10,
      showPercent: false,
      percentColor: '#5a4058',
      percentFontSize: 14,
      percentOffsetX: 0,
      percentOffsetY: 0,
      fadeIn: false,
      fadeInDuration: 0.7,
      completionDelay: 0.35,
      completionMotion: 'fade',
      completionMotionDuration: 0.7,
      completionIntensity: 1,
      loopStyle: 'dots',
      loopCount: 10,
      loopRadius: 28,
      loopSize: 9,
      loopSpeed: 1.2,
      loopDirection: 1,
      loopTrail: true,
      loopPulse: true,
      rowMode: 'progress',
      rowCount: 8,
      rowLength: 68,
      rowSize: 28,
      rowShapes: ['circle', 'square', 'diamond', 'triangle', 'star', 'heart', 'hexagon', 'circle'],
      rowBaseMode: 'shape',
      rowBaseImageOrder: 'sequential',
      rowBaseImageFit: 'contain',
      rowStartPattern: 'all-base',
      rowOrder: 'sequential',
      rowImageOrder: 'sequential',
      rowRandomRepeats: 3,
      rowImageFit: 'contain',
    },
    text: {
      top: {
        enabled: true,
        /* text 為 getter 而非固定值：DEFAULT_STATE 每次被 deepClone 複製時都會
         * 重新呼叫 T()，確保切換語言後按「新專案」得到的是當下語言的範例文字，
         * 而非頁面載入當下那一種。（同 typewriter 的作法。） */
        get text() { return T('text.top.default'); },
        x: 50,
        y: 13,
        rotation: 0,
        fontFamily: 'Arial, sans-serif',
        fontSize: 25,
        fontWeight: 800,
        color: '#5a4058',
        strokeColor: '#ffffff',
        strokeWidth: 4,
        letterSpacing: 1,
        shadowColor: '#ffffff',
        shadowBlur: 0,
        align: 'center',
      },
      bottom: {
        enabled: true,
        get text() { return T('text.bottom.default'); },
        x: 50,
        y: 91,
        rotation: 0,
        fontFamily: 'Arial, sans-serif',
        fontSize: 16,
        fontWeight: 700,
        color: '#765d73',
        strokeColor: '#ffffff',
        strokeWidth: 3,
        letterSpacing: 0.5,
        shadowColor: '#ffffff',
        shadowBlur: 0,
        align: 'center',
      },
    },
    timing: {
      // For progress bars this is the time needed to reach the end. The final
      // hold and completion motion are added to the exported loop afterwards.
      duration: 3,
      previewSpeed: 1,
    },
    export: {
      format: 'apng',
      fps: 12,
      quality: 0.9,
      loopCount: 0,
      fileName: 'loading-animation',
      gifAlphaThreshold: 96,
    },
    ui: {
      includeAssetsInProject: true,
      snapToCanvas: true,
      snapToElements: true,
    },
  };

  function normalizeGradientStops(input) {
    let stops = Array.isArray(input) ? input.slice(0, 7) : [];
    stops = stops
      .filter((stop) => stop && typeof stop === 'object')
      .map((stop, index) => ({
        position: Utils.clamp(stop.position, 0, 100),
        color: Utils.normalizeHexColor(stop.color, DEFAULT_STATE.loader.gradientStops[index % 3].color),
      }))
      .sort((a, b) => a.position - b.position);

    if (stops.length < 2) stops = Utils.deepClone(DEFAULT_STATE.loader.gradientStops);
    if (stops.length > 7) stops.length = 7;
    return stops;
  }

  function normalizeProgressKeyframes(input, fallbackDuration) {
    const maxPoints = 16;
    const minGap = 0.05;
    const minDuration = 0.25;
    const maxDuration = 120;
    let points = Array.isArray(input) ? input.slice(0, maxPoints) : [];
    points = points
      .filter((point) => point && typeof point === 'object')
      .map((point) => ({
        time: Utils.clamp(point.time, 0, maxDuration),
        value: Utils.clamp(point.value, 0, 100),
        easing: PROGRESS_EASINGS.includes(point.easing) ? point.easing : 'linear',
      }))
      .sort((a, b) => a.time - b.time);

    if (points.length < 2) {
      const duration = Utils.clamp(fallbackDuration, minDuration, maxDuration);
      points = [
        { time: 0, value: 0, easing: 'linear' },
        { time: duration, value: 100, easing: 'ease-in-out' },
      ];
    }

    points[0].time = 0;
    points[0].value = 0;
    points[0].easing = 'linear';

    const lastIndex = points.length - 1;
    const minimumFinalTime = Math.max(minDuration, lastIndex * minGap);
    const finalTime = Utils.clamp(
      Math.max(points[lastIndex].time, minimumFinalTime),
      minimumFinalTime,
      maxDuration,
    );

    let previousTime = 0;
    let previousValue = 0;
    for (let index = 1; index < lastIndex; index += 1) {
      const minimumTime = previousTime + minGap;
      const maximumTime = finalTime - (lastIndex - index) * minGap;
      points[index].time = Utils.clamp(points[index].time, minimumTime, maximumTime);
      points[index].value = Math.max(previousValue, Utils.clamp(points[index].value, 0, 100));
      previousTime = points[index].time;
      previousValue = points[index].value;
    }

    points[lastIndex].time = finalTime;
    points[lastIndex].value = 100;
    points[lastIndex].easing = PROGRESS_EASINGS.includes(points[lastIndex].easing)
      ? points[lastIndex].easing
      : 'linear';
    return points;
  }

  function normalizeState(input) {
    const source = input && typeof input === 'object' ? input : {};
    const state = Utils.deepMerge(Utils.deepClone(DEFAULT_STATE), source);

    state.version = 3;
    state.canvas.width = Math.round(Utils.clamp(state.canvas.width, 64, 1920));
    state.canvas.height = Math.round(Utils.clamp(state.canvas.height, 64, 1920));
    state.canvas.transparent = Boolean(state.canvas.transparent);
    state.canvas.background = Utils.normalizeHexColor(state.canvas.background, DEFAULT_STATE.canvas.background);

    state.timing.duration = Utils.clamp(state.timing.duration, 0.25, 120);
    state.timing.previewSpeed = Utils.clamp(state.timing.previewSpeed, 0.1, 4);

    const ch = state.character;
    ch.x = Utils.clamp(ch.x, -50, 150);
    ch.y = Utils.clamp(ch.y, -50, 150);
    ch.size = Utils.clamp(ch.size, 5, 140);
    ch.rotation = Utils.clamp(ch.rotation, -360, 360);
    ch.opacity = Utils.clamp(ch.opacity, 0, 1);
    ch.speed = Utils.clamp(ch.speed, 0.05, 8);
    ch.frameFps = Utils.clamp(ch.frameFps, 1, 60);
    ch.motionAmount = Utils.clamp(ch.motionAmount, 0, 60);
    ch.motionSpeed = Utils.clamp(ch.motionSpeed, 0, 8);
    ch.followProgress = Boolean(ch.followProgress);
    if (!['above', 'center', 'below'].includes(ch.followPlacement)) ch.followPlacement = 'above';
    ch.followGap = Utils.clamp(ch.followGap, -120, 240);
    ch.followOffsetX = Utils.clamp(ch.followOffsetX, -320, 320);
    ch.followOffsetY = Utils.clamp(ch.followOffsetY, -240, 240);
    ch.followKeepInside = Boolean(ch.followKeepInside);
    ch.followSnapToSegments = Boolean(ch.followSnapToSegments);
    ch.followFlipX = Boolean(ch.followFlipX);
    ch.shadow = Boolean(ch.shadow);
    ch.shadowColor = Utils.normalizeHexColor(ch.shadowColor, DEFAULT_STATE.character.shadowColor);
    ch.shadowBlur = Utils.clamp(ch.shadowBlur, 0, 80);
    ch.shadowOffsetY = Utils.clamp(ch.shadowOffsetY, -50, 80);

    const loader = state.loader;
    if (!['bar', 'loop', 'image-row', 'none'].includes(loader.type)) loader.type = 'bar';
    loader.x = Utils.clamp(loader.x, -50, 150);
    loader.y = Utils.clamp(loader.y, -50, 150);
    loader.width = Utils.clamp(loader.width, 5, 140);
    loader.height = Utils.clamp(loader.height, 1, 40);
    if (!['rounded', 'segmented', 'pixel', 'hearts', 'bubbles'].includes(loader.barStyle)) loader.barStyle = 'rounded';
    if (![...PROGRESS_EASINGS, 'keyframes'].includes(loader.progressMode)) loader.progressMode = 'ease-in-out';
    loader.progressStart = Utils.clamp(loader.progressStart, 0, 100);
    loader.progressEnd = Utils.clamp(loader.progressEnd, 0, 100);
    if (loader.progressEnd < loader.progressStart) {
      const swap = loader.progressStart;
      loader.progressStart = loader.progressEnd;
      loader.progressEnd = swap;
    }
    loader.progressKeyframes = normalizeProgressKeyframes(loader.progressKeyframes, state.timing.duration);
    if (loader.progressMode === 'keyframes') {
      state.timing.duration = loader.progressKeyframes[loader.progressKeyframes.length - 1].time;
    }
    loader.seed = Math.round(Utils.clamp(loader.seed, 1, 99999));
    loader.trackColor = Utils.normalizeHexColor(loader.trackColor, DEFAULT_STATE.loader.trackColor);
    loader.fillColor = Utils.normalizeHexColor(loader.fillColor, DEFAULT_STATE.loader.fillColor);
    loader.fillMode = loader.fillMode === 'gradient' ? 'gradient' : 'solid';
    loader.gradientStops = normalizeGradientStops(loader.gradientStops);
    loader.gradientAngle = Utils.clamp(loader.gradientAngle, -360, 360);
    loader.gradientBlur = Utils.clamp(loader.gradientBlur, 0, 50);
    loader.gradientAnimate = Boolean(loader.gradientAnimate);
    loader.gradientSpeed = Utils.clamp(loader.gradientSpeed, 0.01, 4);
    loader.gradientDirection = Number(loader.gradientDirection) < 0 ? -1 : 1;
    loader.trackShimmer = Boolean(loader.trackShimmer);
    loader.borderColor = Utils.normalizeHexColor(loader.borderColor, DEFAULT_STATE.loader.borderColor);
    loader.borderWidth = Utils.clamp(loader.borderWidth, 0, 12);
    loader.glow = Boolean(loader.glow);
    loader.glowColor = Utils.normalizeHexColor(loader.glowColor, DEFAULT_STATE.loader.glowColor);
    loader.glowBlur = Utils.clamp(loader.glowBlur, 0, 80);
    loader.segments = Math.round(Utils.clamp(loader.segments, 2, 40));
    loader.showPercent = Boolean(loader.showPercent);
    loader.percentColor = Utils.normalizeHexColor(loader.percentColor, DEFAULT_STATE.loader.percentColor);
    loader.percentFontSize = Utils.clamp(loader.percentFontSize, 8, 64);
    loader.percentOffsetX = Utils.clamp(loader.percentOffsetX, -640, 640);
    loader.percentOffsetY = Utils.clamp(loader.percentOffsetY, -480, 480);
    loader.fadeIn = Boolean(loader.fadeIn);
    loader.fadeInDuration = Utils.clamp(loader.fadeInDuration, 0.1, 10);
    loader.completionDelay = Utils.clamp(loader.completionDelay, 0, 20);
    if (!COMPLETION_MOTIONS.includes(loader.completionMotion)) loader.completionMotion = 'none';
    loader.completionMotionDuration = Utils.clamp(loader.completionMotionDuration, 0.1, 10);
    loader.completionIntensity = Utils.clamp(loader.completionIntensity, 0.25, 2.5);
    loader.loopCount = Math.round(Utils.clamp(loader.loopCount, 3, 32));
    loader.loopRadius = Utils.clamp(loader.loopRadius, 6, 160);
    loader.loopSize = Utils.clamp(loader.loopSize, 2, 60);
    loader.loopSpeed = Utils.clamp(loader.loopSpeed, 0.05, 8);
    loader.loopDirection = Number(loader.loopDirection) < 0 ? -1 : 1;
    loader.loopTrail = Boolean(loader.loopTrail);
    loader.loopPulse = Boolean(loader.loopPulse);
    loader.rowMode = loader.rowMode === 'loop' ? 'loop' : 'progress';
    loader.rowCount = Math.round(Utils.clamp(loader.rowCount, 1, 30));
    loader.rowLength = Utils.clamp(loader.rowLength, 8, 140);
    loader.rowSize = Utils.clamp(loader.rowSize, 4, 80);
    loader.rowBaseMode = loader.rowBaseMode === 'images' ? 'images' : 'shape';
    loader.rowBaseImageOrder = ['sequential', 'alternating', 'random'].includes(loader.rowBaseImageOrder)
      ? loader.rowBaseImageOrder
      : 'sequential';
    loader.rowBaseImageFit = loader.rowBaseImageFit === 'cover' ? 'cover' : 'contain';
    loader.rowStartPattern = ['all-base', 'odd-base', 'odd-image'].includes(loader.rowStartPattern)
      ? loader.rowStartPattern
      : 'all-base';
    loader.rowOrder = ['sequential', 'alternating', 'random'].includes(loader.rowOrder)
      ? loader.rowOrder
      : 'sequential';
    loader.rowImageOrder = ['sequential', 'alternating', 'random'].includes(loader.rowImageOrder)
      ? loader.rowImageOrder
      : 'sequential';
    loader.rowRandomRepeats = Math.round(Utils.clamp(loader.rowRandomRepeats, 1, 12));
    loader.rowImageFit = loader.rowImageFit === 'cover' ? 'cover' : 'contain';
    const inputRowShapes = Array.isArray(loader.rowShapes) ? loader.rowShapes : [];
    loader.rowShapes = Array.from({ length: loader.rowCount }, (_, index) => {
      const candidate = inputRowShapes[index];
      return ROW_SHAPES.includes(candidate)
        ? candidate
        : DEFAULT_STATE.loader.rowShapes[index % DEFAULT_STATE.loader.rowShapes.length];
    });

    ['top', 'bottom'].forEach((position) => {
      const text = state.text[position];
      text.enabled = Boolean(text.enabled);
      text.x = Utils.clamp(text.x, -50, 150);
      text.y = Utils.clamp(text.y, -50, 150);
      text.rotation = Utils.clamp(text.rotation, -180, 180);
      text.fontSize = Utils.clamp(text.fontSize, 6, 160);
      text.fontWeight = Math.round(Utils.clamp(text.fontWeight, 100, 900));
      text.strokeWidth = Utils.clamp(text.strokeWidth, 0, 20);
      text.letterSpacing = Utils.clamp(text.letterSpacing, -5, 30);
      text.shadowBlur = Utils.clamp(text.shadowBlur, 0, 60);
      text.color = Utils.normalizeHexColor(text.color, DEFAULT_STATE.text[position].color);
      text.strokeColor = Utils.normalizeHexColor(text.strokeColor, DEFAULT_STATE.text[position].strokeColor);
      text.shadowColor = Utils.normalizeHexColor(text.shadowColor, DEFAULT_STATE.text[position].shadowColor);
      if (!['left', 'center', 'right'].includes(text.align)) text.align = 'center';
    });

    state.export.fps = Math.round(Utils.clamp(state.export.fps, 2, 60));
    state.export.quality = Utils.clamp(state.export.quality, 0.1, 1);
    state.export.loopCount = Math.round(Utils.clamp(state.export.loopCount, 0, 65535));
    state.export.gifAlphaThreshold = Math.round(Utils.clamp(state.export.gifAlphaThreshold, 0, 255));
    if (!['apng', 'webp', 'gif'].includes(state.export.format)) state.export.format = 'apng';

    state.ui.includeAssetsInProject = Boolean(state.ui.includeAssetsInProject);
    state.ui.snapToCanvas = Boolean(state.ui.snapToCanvas);
    state.ui.snapToElements = Boolean(state.ui.snapToElements);
    delete state.ui.preserveUploadOnPreset;
    return state;
  }

  class StateStore {
    constructor(initialState) {
      this.state = normalizeState(initialState);
      this.listeners = new Set();
    }

    get() {
      return this.state;
    }

    replace(nextState, reason = 'replace') {
      this.state = normalizeState(nextState);
      this.emit(reason);
    }

    patch(partial, reason = 'patch') {
      Utils.deepMerge(this.state, partial || {});
      this.state = normalizeState(this.state);
      this.emit(reason);
    }

    setPath(path, value, reason = 'input') {
      const keys = String(path).split('.');
      let cursor = this.state;
      for (let i = 0; i < keys.length - 1; i += 1) {
        if (!cursor[keys[i]] || typeof cursor[keys[i]] !== 'object') cursor[keys[i]] = {};
        cursor = cursor[keys[i]];
      }
      cursor[keys[keys.length - 1]] = value;
      this.state = normalizeState(this.state);
      this.emit(reason, path);
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(reason, path) {
      this.listeners.forEach((listener) => {
        try { listener(this.state, reason, path); } catch (error) { console.error(error); }
      });
    }

    serialize() {
      return Utils.deepClone(this.state);
    }
  }

  NS.DEFAULT_STATE = DEFAULT_STATE;
  NS.PROGRESS_EASINGS = PROGRESS_EASINGS;
  NS.COMPLETION_MOTIONS = COMPLETION_MOTIONS;
  NS.ROW_SHAPES = ROW_SHAPES;
  NS.normalizeState = normalizeState;
  NS.StateStore = StateStore;
}(window));
