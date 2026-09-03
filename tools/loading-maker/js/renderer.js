(function (global) {
  'use strict';

  const NS = global.CocoLoadingMaker = global.CocoLoadingMaker || {};
  const { Utils } = NS;
  const TAU = Math.PI * 2;

  class Renderer {
    constructor(canvas, store, media, rowMedia, rowBaseMedia) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false });
      this.store = store;
      this.media = media;
      this.rowMedia = rowMedia || null;
      this.rowBaseMedia = rowBaseMedia || null;
      this.playing = true;
      this.currentTime = 0;
      this.startedAt = performance.now();
      this.raf = 0;
      this.onTime = null;
      this.buffers = Object.create(null);
      this.tick = this.tick.bind(this);
      this.resize();
      this.raf = requestAnimationFrame(this.tick);
    }

    destroy() {
      cancelAnimationFrame(this.raf);
    }

    resize() {
      const { canvas } = this.store.get();
      if (this.canvas.width !== canvas.width) this.canvas.width = canvas.width;
      if (this.canvas.height !== canvas.height) this.canvas.height = canvas.height;
      this.render(this.currentTime);
    }

    play() {
      if (this.playing) return;
      this.playing = true;
      const speed = this.store.get().timing.previewSpeed;
      this.startedAt = performance.now() - (this.currentTime / speed) * 1000;
    }

    pause() {
      this.playing = false;
    }

    toggle() {
      if (this.playing) this.pause(); else this.play();
      return this.playing;
    }

    animationDuration(state = this.store.get()) {
      return Utils.getAnimationDuration(state);
    }

    seek(normalized) {
      const state = this.store.get();
      const duration = this.animationDuration(state);
      this.currentTime = Utils.clamp(normalized, 0, 1) * duration;
      const speed = state.timing.previewSpeed;
      this.startedAt = performance.now() - (this.currentTime / speed) * 1000;
      this.render(this.currentTime);
      if (this.onTime) this.onTime(this.currentTime, duration);
    }

    tick(now) {
      const state = this.store.get();
      const duration = Math.max(0.1, this.animationDuration(state));
      if (this.playing) {
        const elapsed = ((now - this.startedAt) / 1000) * state.timing.previewSpeed;
        this.currentTime = Utils.mod(elapsed, duration);
      } else if (this.currentTime > duration) {
        this.currentTime = duration;
      }
      this.render(this.currentTime);
      if (this.onTime) this.onTime(this.currentTime, duration);
      this.raf = requestAnimationFrame(this.tick);
    }

    render(timeSeconds) {
      this.renderScene(this.ctx, this.store.get(), timeSeconds);
    }

    renderToCanvas(targetCanvas, timeSeconds, stateOverride) {
      const state = stateOverride || this.store.get();
      if (targetCanvas.width !== state.canvas.width) targetCanvas.width = state.canvas.width;
      if (targetCanvas.height !== state.canvas.height) targetCanvas.height = state.canvas.height;
      const ctx = targetCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
      this.renderScene(ctx, state, timeSeconds);
      return ctx;
    }

    ensureBuffer(name, width, height) {
      let canvas = this.buffers[name];
      if (!canvas) {
        canvas = document.createElement('canvas');
        this.buffers[name] = canvas;
      }
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      return canvas;
    }

    clearContext(ctx, width, height) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.clearRect(0, 0, width, height);
      ctx.restore();
    }

    renderScene(ctx, state, timeSeconds) {
      const width = state.canvas.width;
      const height = state.canvas.height;
      const fadeIn = this.fadeInPhase(state, timeSeconds);
      const contentTime = this.animationContentTime(state, timeSeconds);
      if (fadeIn.active) {
        const sourceCanvas = this.ensureBuffer('fade-in-source', width, height);
        const sourceCtx = sourceCanvas.getContext('2d', { alpha: true, willReadFrequently: false });
        this.renderBaseScene(sourceCtx, state, 0);
        this.clearContext(ctx, width, height);
        this.drawFadeIn(ctx, sourceCanvas, fadeIn.progress);
        return;
      }

      const completion = this.completionPhase(state, timeSeconds);
      if (!completion.active) {
        this.renderBaseScene(ctx, state, contentTime);
        return;
      }

      const sourceCanvas = this.ensureBuffer('completion-source', width, height);
      const sourceCtx = sourceCanvas.getContext('2d', { alpha: true, willReadFrequently: false });
      this.renderBaseScene(sourceCtx, state, contentTime);
      this.clearContext(ctx, width, height);
      this.drawCompletionEffect(ctx, sourceCanvas, state, completion.progress, contentTime);
    }

    animationContentTime(state, timeSeconds) {
      return Math.max(0, timeSeconds - Utils.getFadeInDuration(state));
    }

    fadeInPhase(state, timeSeconds) {
      const duration = Utils.getFadeInDuration(state);
      if (duration <= 0 || timeSeconds >= duration) {
        return { active: false, progress: 1, duration };
      }
      return {
        active: true,
        progress: Utils.clamp(timeSeconds / duration, 0, 1),
        duration,
      };
    }

    drawFadeIn(ctx, source, progress) {
      const alpha = Utils.easing('smooth', Utils.clamp(progress, 0, 1));
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(source, 0, 0);
      ctx.restore();
    }

    renderBaseScene(ctx, state, timeSeconds) {
      const width = state.canvas.width;
      const height = state.canvas.height;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.clearRect(0, 0, width, height);
      if (!state.canvas.transparent) {
        ctx.fillStyle = state.canvas.background;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // A progress-following character is composited after the bar so it
      // appears to ride on top of the filled edge instead of being covered by it.
      if (this.isCharacterFollowingProgress(state)) {
        this.drawLoader(ctx, state, timeSeconds);
        this.drawCharacter(ctx, state, timeSeconds);
      } else {
        this.drawCharacter(ctx, state, timeSeconds);
        this.drawLoader(ctx, state, timeSeconds);
      }
      this.drawTextBlock(ctx, state, state.text.top, width, height);
      this.drawTextBlock(ctx, state, state.text.bottom, width, height);
      ctx.restore();
    }

    completionPhase(state, timeSeconds) {
      const loader = state.loader;
      if (loader.type !== 'bar' || loader.completionMotion === 'none') {
        return { active: false, progress: 0 };
      }
      const start = Utils.getCompletionStartTime(state);
      if (timeSeconds < start) return { active: false, progress: 0 };
      return {
        active: true,
        progress: Utils.clamp((timeSeconds - start) / Math.max(0.1, loader.completionMotionDuration), 0, 1),
      };
    }

    isCharacterFollowingProgress(state) {
      return Boolean(state.character.followProgress && state.loader.type === 'bar');
    }

    calculateBarProgress(state, timeSeconds) {
      const loader = state.loader;
      if (loader.progressMode === 'keyframes' && Array.isArray(loader.progressKeyframes)) {
        const points = loader.progressKeyframes;
        if (!points.length) return 0;
        if (timeSeconds <= points[0].time) return Utils.clamp(points[0].value / 100, 0, 1);
        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1];
          const next = points[index];
          if (timeSeconds <= next.time) {
            const span = Math.max(0.000001, next.time - previous.time);
            const local = Utils.clamp((timeSeconds - previous.time) / span, 0, 1);
            const eased = Utils.easing(next.easing || 'linear', local, loader.seed + index * 97);
            return Utils.clamp(Utils.lerp(previous.value, next.value, eased) / 100, 0, 1);
          }
        }
        return Utils.clamp(points[points.length - 1].value / 100, 0, 1);
      }

      const duration = Math.max(0.001, Utils.getProgressDuration(state));
      const normalized = Utils.clamp(timeSeconds / duration, 0, 1);
      const eased = Utils.easing(loader.progressMode, normalized, loader.seed);
      return Utils.clamp(Utils.lerp(loader.progressStart / 100, loader.progressEnd / 100, eased), 0, 1);
    }

    progressBarMetrics(state) {
      const width = state.canvas.width;
      const height = state.canvas.height;
      const barWidth = width * state.loader.width / 100;
      const barHeight = Math.max(4, height * state.loader.height / 100);
      const cx = width * state.loader.x / 100;
      const cy = height * state.loader.y / 100;
      return {
        cx,
        cy,
        width: barWidth,
        height: barHeight,
        left: cx - barWidth / 2,
        right: cx + barWidth / 2,
        top: cy - barHeight / 2,
        bottom: cy + barHeight / 2,
      };
    }

    boundsFromCenter(cx, cy, width, height) {
      return {
        cx,
        cy,
        width,
        height,
        left: cx - width / 2,
        right: cx + width / 2,
        top: cy - height / 2,
        bottom: cy + height / 2,
      };
    }

    loopLoaderMetrics(state) {
      const width = state.canvas.width;
      const height = state.canvas.height;
      const scale = Math.min(width / 640, height / 360);
      const cx = width * state.loader.x / 100;
      const cy = height * state.loader.y / 100;
      const extent = (state.loader.loopRadius + state.loader.loopSize * 0.8) * scale;
      return this.boundsFromCenter(cx, cy, extent * 2, extent * 2);
    }

    imageRowLayout(state) {
      const width = state.canvas.width;
      const height = state.canvas.height;
      const loader = state.loader;
      const count = Math.max(1, Math.round(loader.rowCount));
      const totalWidth = Math.max(1, width * loader.rowLength / 100);
      const scale = height / 360;
      const requestedSize = Math.max(1, loader.rowSize * scale);
      const fittedSize = totalWidth / Math.max(1, count + Math.max(0, count - 1) * 0.22);
      const itemSize = Math.max(1, Math.min(requestedSize, fittedSize));
      const cx = width * loader.x / 100;
      const cy = height * loader.y / 100;
      const left = cx - totalWidth / 2;
      const centerSpan = Math.max(0, totalWidth - itemSize);
      const step = count > 1 ? centerSpan / (count - 1) : 0;
      return {
        count,
        totalWidth,
        itemSize,
        cx,
        cy,
        left,
        step,
        centerAt: (index) => count === 1 ? cx : left + itemSize / 2 + step * index,
      };
    }

    imageRowMetrics(state) {
      const layout = this.imageRowLayout(state);
      return this.boundsFromCenter(layout.cx, layout.cy, layout.totalWidth, layout.itemSize);
    }

    loaderMetrics(state) {
      if (state.loader.type === 'bar') return this.progressBarMetrics(state);
      if (state.loader.type === 'loop') return this.loopLoaderMetrics(state);
      if (state.loader.type === 'image-row') return this.imageRowMetrics(state);
      return null;
    }

    percentPosition(state) {
      if (state.loader.type !== 'bar' || !state.loader.showPercent) return null;
      const height = state.canvas.height;
      const scale = height / 360;
      const bounds = this.progressBarMetrics(state);
      const fontSize = state.loader.percentFontSize * scale;
      return {
        x: bounds.cx + state.loader.percentOffsetX * scale,
        y: bounds.cy + bounds.height * 0.95 + fontSize + state.loader.percentOffsetY * scale,
        fontSize,
      };
    }

    percentMetrics(state, timeSeconds = this.currentTime) {
      const position = this.percentPosition(state);
      if (!position) return null;
      const label = `${Math.round(this.calculateBarProgress(state, timeSeconds) * 100)}%`;
      this.ctx.save();
      this.ctx.font = `700 ${position.fontSize}px Arial, sans-serif`;
      const width = Math.max(position.fontSize * 1.7, this.ctx.measureText(label).width) + position.fontSize * 0.4;
      this.ctx.restore();
      return this.boundsFromCenter(position.x, position.y, width, position.fontSize * 1.45);
    }

    measureSpacedTextWidth(ctx, text, spacing, maxWidth) {
      const chars = Array.from(String(text));
      if (!chars.length) return 0;
      const rawWidth = chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0)
        + spacing * Math.max(0, chars.length - 1);
      return Math.min(maxWidth, Math.max(0, rawWidth));
    }

    textBlockMetrics(state, textState) {
      if (!textState || !textState.enabled || !String(textState.text || '').length) return null;
      const width = state.canvas.width;
      const height = state.canvas.height;
      const scale = height / 360;
      const anchorX = width * textState.x / 100;
      const anchorY = height * textState.y / 100;
      const fontSize = textState.fontSize * scale;
      const lineHeight = fontSize * 1.22;
      const lines = String(textState.text).split(/\r?\n/);
      const maxWidth = width * 0.92;
      this.ctx.save();
      this.ctx.font = `${textState.fontWeight} ${fontSize}px ${textState.fontFamily || 'sans-serif'}`;
      const textWidth = Math.max(fontSize * 0.7, ...lines.map((line) => (
        this.measureSpacedTextWidth(this.ctx, line, textState.letterSpacing * scale, maxWidth)
      )));
      this.ctx.restore();
      const padding = Math.max(4 * scale, textState.strokeWidth * scale);
      const textHeight = fontSize + Math.max(0, lines.length - 1) * lineHeight;
      const boxWidth = textWidth + padding * 2;
      const boxHeight = textHeight + padding * 2;
      let localCenterX = 0;
      if (textState.align === 'left') localCenterX = textWidth / 2;
      else if (textState.align === 'right') localCenterX = -textWidth / 2;
      const rotationRadians = (Number(textState.rotation) || 0) * Math.PI / 180;
      const cos = Math.cos(rotationRadians);
      const sin = Math.sin(rotationRadians);
      const cx = anchorX + localCenterX * cos;
      const cy = anchorY + localCenterX * sin;
      const bounds = this.boundsFromCenter(
        cx,
        cy,
        boxWidth * Math.abs(cos) + boxHeight * Math.abs(sin),
        boxWidth * Math.abs(sin) + boxHeight * Math.abs(cos),
      );
      return {
        ...bounds,
        anchorX,
        anchorY,
        rotationRadians,
        localLeft: localCenterX - boxWidth / 2,
        localRight: localCenterX + boxWidth / 2,
        localTop: -boxHeight / 2,
        localBottom: boxHeight / 2,
      };
    }

    characterMetrics(state, timeSeconds = this.currentTime) {
      const width = state.canvas.width;
      const height = state.canvas.height;
      const ch = state.character;
      const baseHeight = height * (ch.size / 100);
      const aspect = this.media.hasUpload ? this.media.getSourceAspect() : 1.08;
      const metrics = {
        cx: width * ch.x / 100,
        cy: height * ch.y / 100,
        width: baseHeight * aspect,
        height: baseHeight,
      };

      if (!this.isCharacterFollowingProgress(state)) return metrics;

      const bar = this.progressBarMetrics(state);
      let progress = this.calculateBarProgress(state, timeSeconds);
      if (ch.followSnapToSegments && ['segmented', 'pixel', 'hearts', 'bubbles'].includes(state.loader.barStyle)) {
        const segments = Math.max(2, Math.round(state.loader.segments));
        progress = progress >= 1 ? 1 : Math.floor(progress * segments + 1e-7) / segments;
      }

      const scale = height / 360;
      metrics.cx = bar.left + bar.width * progress + ch.followOffsetX * scale;
      if (ch.followPlacement === 'center') {
        metrics.cy = bar.cy;
      } else if (ch.followPlacement === 'below') {
        metrics.cy = bar.bottom + ch.followGap * scale + metrics.height / 2;
      } else {
        metrics.cy = bar.top - ch.followGap * scale - metrics.height / 2;
      }
      metrics.cy += ch.followOffsetY * scale;

      if (ch.followKeepInside) {
        const halfWidth = metrics.width / 2;
        const halfHeight = metrics.height / 2;
        metrics.cx = halfWidth * 2 <= width ? Utils.clamp(metrics.cx, halfWidth, width - halfWidth) : width / 2;
        metrics.cy = halfHeight * 2 <= height ? Utils.clamp(metrics.cy, halfHeight, height - halfHeight) : height / 2;
      }
      return metrics;
    }

    characterVisualMetrics(state, timeSeconds = this.currentTime) {
      const metrics = this.characterMetrics(state, timeSeconds);
      const motion = this.calculateCharacterMotion(state.character, timeSeconds, state.canvas.height);
      const scaledWidth = metrics.width * Math.abs(motion.scaleX);
      const scaledHeight = metrics.height * Math.abs(motion.scaleY);
      const radians = (state.character.rotation + motion.rotation) * Math.PI / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      return this.boundsFromCenter(
        metrics.cx + motion.x,
        metrics.cy + motion.y,
        scaledWidth * cos + scaledHeight * sin,
        scaledWidth * sin + scaledHeight * cos,
      );
    }

    getElementMetrics(elementId, state = this.store.get(), timeSeconds = this.currentTime) {
      const contentTime = this.animationContentTime(state, timeSeconds);
      switch (elementId) {
        case 'character': return this.characterVisualMetrics(state, contentTime);
        case 'loader': return this.loaderMetrics(state);
        case 'percent': return this.percentMetrics(state, contentTime);
        case 'text.top': return this.textBlockMetrics(state, state.text.top);
        case 'text.bottom': return this.textBlockMetrics(state, state.text.bottom);
        default: return null;
      }
    }

    draggableElementIds(state = this.store.get()) {
      const text = ['text.top', 'text.bottom'];
      if (this.isCharacterFollowingProgress(state)) return ['loader', 'percent', 'character', ...text];
      return ['character', 'loader', 'percent', ...text];
    }

    hitTestElement(canvasX, canvasY, state = this.store.get(), timeSeconds = this.currentTime, preferredId = null, padding = 0) {
      const contains = (metrics) => {
        if (!metrics) return false;
        if (Number.isFinite(metrics.rotationRadians) && Number.isFinite(metrics.anchorX)) {
          const dx = canvasX - metrics.anchorX;
          const dy = canvasY - metrics.anchorY;
          const cos = Math.cos(metrics.rotationRadians);
          const sin = Math.sin(metrics.rotationRadians);
          const localX = dx * cos + dy * sin;
          const localY = -dx * sin + dy * cos;
          return localX >= metrics.localLeft - padding
            && localX <= metrics.localRight + padding
            && localY >= metrics.localTop - padding
            && localY <= metrics.localBottom + padding;
        }
        return canvasX >= metrics.left - padding
          && canvasX <= metrics.right + padding
          && canvasY >= metrics.top - padding
          && canvasY <= metrics.bottom + padding;
      };
      if (preferredId && contains(this.getElementMetrics(preferredId, state, timeSeconds))) return preferredId;
      const ids = this.draggableElementIds(state).slice().reverse();
      return ids.find((id) => id !== preferredId && contains(this.getElementMetrics(id, state, timeSeconds))) || null;
    }

    hitCharacter(canvasX, canvasY) {
      const state = this.store.get();
      const metrics = this.getElementMetrics('character', state, this.currentTime);
      return canvasX >= metrics.left && canvasX <= metrics.right
        && canvasY >= metrics.top && canvasY <= metrics.bottom;
    }

    drawCharacter(ctx, state, timeSeconds) {
      const ch = state.character;
      const width = state.canvas.width;
      const height = state.canvas.height;
      const metrics = this.characterMetrics(state, timeSeconds);
      const motion = this.calculateCharacterMotion(ch, timeSeconds, height);

      ctx.save();
      ctx.translate(metrics.cx + motion.x, metrics.cy + motion.y);
      ctx.rotate((ch.rotation + motion.rotation) * Math.PI / 180);
      const flipX = this.isCharacterFollowingProgress(state) && ch.followFlipX ? -1 : 1;
      ctx.scale(motion.scaleX * flipX, motion.scaleY);
      ctx.globalAlpha = ch.opacity;
      if (ch.shadow) {
        ctx.shadowColor = ch.shadowColor;
        ctx.shadowBlur = ch.shadowBlur * (height / 360);
        ctx.shadowOffsetY = ch.shadowOffsetY * (height / 360);
      }

      const frame = this.media.getFrameAt(timeSeconds, ch);
      if (frame) {
        const sourceWidth = frame.displayWidth || frame.videoWidth || frame.naturalWidth || frame.width || this.media.source.width;
        const sourceHeight = frame.displayHeight || frame.videoHeight || frame.naturalHeight || frame.height || this.media.source.height;
        const targetHeight = metrics.height;
        const targetWidth = sourceHeight ? targetHeight * (sourceWidth / sourceHeight) : metrics.width;
        ctx.drawImage(frame, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
      } else {
        const scale = metrics.height / 100;
        ctx.scale(scale, scale);
        this.drawBuiltinCharacter(ctx, ch.builtin, timeSeconds);
      }
      ctx.restore();
    }

    calculateCharacterMotion(ch, timeSeconds, canvasHeight) {
      const amount = ch.motionAmount * (canvasHeight / 360);
      const phase = timeSeconds * ch.motionSpeed * TAU;
      const result = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
      switch (ch.motion) {
        case 'float':
          result.y = Math.sin(phase) * amount;
          result.rotation = Math.sin(phase * 0.5) * amount * 0.18;
          break;
        case 'bounce':
          result.y = -Math.abs(Math.sin(phase)) * amount;
          result.scaleX = 1 + Math.sin(phase * 2) * 0.035;
          result.scaleY = 1 - Math.sin(phase * 2) * 0.035;
          break;
        case 'sway':
          result.x = Math.sin(phase) * amount * 0.35;
          result.rotation = Math.sin(phase) * amount * 0.65;
          break;
        case 'squish':
          result.y = Math.sin(phase) * amount * 0.3;
          result.scaleX = 1 + Math.sin(phase) * amount * 0.007;
          result.scaleY = 1 - Math.sin(phase) * amount * 0.006;
          break;
        case 'step': {
          const step = Math.round(Math.sin(phase) * 2) / 2;
          result.y = step * amount * 0.55;
          result.rotation = Math.round(Math.sin(phase * 0.5)) * amount * 0.25;
          break;
        }
        case 'wiggle':
          result.rotation = Math.sin(phase * 2) * amount;
          break;
        default:
          break;
      }
      return result;
    }

    drawBuiltinCharacter(ctx, kind, timeSeconds) {
      const blink = Utils.mod(timeSeconds, 3.7) > 3.48;
      switch (kind) {
        case 'slime': this.drawSlime(ctx, timeSeconds, blink); break;
        case 'ghost': this.drawGhost(ctx, timeSeconds, blink); break;
        case 'star-bunny': this.drawStar(ctx, timeSeconds, blink); break;
        case 'pixel-chick': this.drawPixelChick(ctx, timeSeconds, blink); break;
        default: this.drawCloud(ctx, timeSeconds, blink); break;
      }
    }

    drawCloud(ctx, timeSeconds, blink) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#5d4459';
      ctx.lineWidth = 3.4;

      // Cloud body. A single outline avoids internal seams between the puffs.
      ctx.fillStyle = '#fff7fb';
      ctx.beginPath();
      ctx.moveTo(-43, 15);
      ctx.bezierCurveTo(-49, 3, -43, -10, -31, -15);
      ctx.bezierCurveTo(-29, -30, -15, -37, -3, -31);
      ctx.bezierCurveTo(8, -42, 27, -33, 27, -20);
      ctx.bezierCurveTo(42, -17, 48, -3, 41, 8);
      ctx.bezierCurveTo(50, 21, 38, 35, 24, 32);
      ctx.bezierCurveTo(14, 43, -2, 41, -9, 33);
      ctx.bezierCurveTo(-23, 43, -38, 34, -36, 25);
      ctx.bezierCurveTo(-43, 24, -47, 20, -43, 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Face.
      ctx.strokeStyle = '#5d4459';
      ctx.fillStyle = '#5d4459';
      ctx.lineWidth = 3.2;
      if (blink) {
        ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(-9, 0); ctx.moveTo(9, 0); ctx.lineTo(17, 0); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(-13, -1, 2.8, 4.3, 0, 0, TAU); ctx.ellipse(13, -1, 2.8, 4.3, 0, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(-5, 8); ctx.quadraticCurveTo(0, 13, 5, 8); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 126, 169, .38)';
      ctx.beginPath(); ctx.ellipse(-24, 9, 8, 4, 0, 0, TAU); ctx.ellipse(24, 9, 8, 4, 0, 0, TAU); ctx.fill();

      ctx.restore();
    }

    drawSlime(ctx, timeSeconds, blink) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#2f6e68';
      ctx.lineWidth = 3.5;
      ctx.fillStyle = '#71e0c8';
      ctx.beginPath();
      ctx.moveTo(-43, 19);
      ctx.bezierCurveTo(-47, -2, -35, -31, -7, -38);
      ctx.bezierCurveTo(22, -45, 43, -20, 44, 8);
      ctx.bezierCurveTo(45, 32, 26, 39, 0, 39);
      ctx.bezierCurveTo(-24, 39, -40, 34, -43, 19);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.ellipse(-18, -19, 10, 6, -0.45, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f6e68';
      if (blink) {
        ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(-8, 0); ctx.moveTo(8, 0); ctx.lineTo(17, 0); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(-12, 0, 3, 0, TAU); ctx.arc(12, 0, 3, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 10, 7, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      ctx.fillStyle = 'rgba(255,117,159,.42)';
      ctx.beginPath(); ctx.ellipse(-25, 9, 7, 3.5, 0, 0, TAU); ctx.ellipse(25, 9, 7, 3.5, 0, 0, TAU); ctx.fill();

      const bubble = Utils.mod(timeSeconds * 24, 48);
      ctx.strokeStyle = '#2f6e68'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(173,255,238,.5)';
      ctx.beginPath(); ctx.arc(34, 13 - bubble, 5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    drawGhost(ctx, timeSeconds, blink) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#44375f';
      ctx.lineWidth = 3.5;
      ctx.fillStyle = '#eeeaff';
      ctx.beginPath();
      ctx.moveTo(-37, 35);
      ctx.lineTo(-38, -1);
      ctx.bezierCurveTo(-38, -29, -21, -43, 0, -43);
      ctx.bezierCurveTo(22, -43, 38, -27, 38, -1);
      ctx.lineTo(38, 35);
      ctx.quadraticCurveTo(28, 44, 19, 32);
      ctx.quadraticCurveTo(9, 46, 0, 32);
      ctx.quadraticCurveTo(-10, 46, -19, 32);
      ctx.quadraticCurveTo(-29, 44, -37, 35);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#44375f';
      if (blink) {
        ctx.beginPath(); ctx.moveTo(-17, -6); ctx.lineTo(-8, -6); ctx.moveTo(8, -6); ctx.lineTo(17, -6); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(-13, -7, 3.3, 5, 0, 0, TAU); ctx.ellipse(13, -7, 3.3, 5, 0, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(0, 7, 5, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(176,154,255,.28)';
      ctx.beginPath(); ctx.ellipse(-25, 7, 8, 4, 0, 0, TAU); ctx.ellipse(25, 7, 8, 4, 0, 0, TAU); ctx.fill();

      const wave = Math.sin(timeSeconds * 5) * 4;
      ctx.strokeStyle = '#6c5a98'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-46, -10 + wave, 5, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(47, 5 - wave, 3, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    drawStar(ctx, timeSeconds, blink) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#4a466e';
      ctx.lineWidth = 3.4;
      ctx.fillStyle = '#ffd766';
      Utils.pathStar(ctx, 0, 3, 45, 27, 5, -Math.PI / 2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#4a466e';
      if (blink) {
        ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(-7, -3); ctx.moveTo(7, -3); ctx.lineTo(14, -3); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(-10, -3, 3, 0, TAU); ctx.arc(10, -3, 3, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(-4, 7); ctx.quadraticCurveTo(0, 11, 4, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,126,169,.45)';
      ctx.beginPath(); ctx.ellipse(-21, 7, 7, 3.5, 0, 0, TAU); ctx.ellipse(21, 7, 7, 3.5, 0, 0, TAU); ctx.fill();

      const sparkle = 1 + Math.sin(timeSeconds * 5) * 0.25;
      ctx.fillStyle = '#ffffff';
      Utils.pathStar(ctx, 31, -24, 6 * sparkle, 2.2 * sparkle, 4);
      ctx.fill();
      ctx.restore();
    }

    drawPixelChick(ctx, timeSeconds, blink) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      const u = 5;
      const fillBlocks = (color, blocks) => {
        ctx.fillStyle = color;
        blocks.forEach(([x, y, w = 1, h = 1]) => ctx.fillRect(x * u, y * u, w * u, h * u));
      };
      ctx.translate(-45, -45);
      fillBlocks('#2c423d', [[3, 2, 12, 1], [1, 4, 16, 10], [3, 1, 12, 16], [2, 15, 14, 1], [5, 17, 3, 1], [11, 17, 3, 1]]);
      fillBlocks('#ffe86b', [[3, 3, 12, 12], [2, 5, 14, 8], [4, 2, 10, 14], [5, 15, 8, 1]]);
      fillBlocks('#fff6b0', [[5, 4, 4, 2]]);
      fillBlocks('#ff9d58', [[8, 10, 3, 2], [5, 16, 3, 1], [11, 16, 3, 1]]);
      if (blink) {
        fillBlocks('#2c423d', [[5, 8, 2, 1], [11, 8, 2, 1]]);
      } else {
        fillBlocks('#2c423d', [[5, 7, 2, 2], [11, 7, 2, 2]]);
      }
      const wing = Math.round(Math.sin(timeSeconds * 10));
      fillBlocks('#f3ca4d', [[0, 8 + wing, 3, 3], [15, 8 - wing, 3, 3]]);
      ctx.restore();
    }

    drawLoader(ctx, state, timeSeconds) {
      const loader = state.loader;
      if (loader.type === 'none') return;
      if (loader.type === 'bar') {
        this.drawProgressBar(ctx, state, this.calculateBarProgress(state, timeSeconds), timeSeconds);
      } else if (loader.type === 'loop') {
        this.drawLoopLoader(ctx, state, timeSeconds);
      } else if (loader.type === 'image-row') {
        this.drawImageRowLoader(ctx, state, timeSeconds);
      }
    }

    drawProgressBar(ctx, state, progress, timeSeconds) {
      const loader = state.loader;
      const height = state.canvas.height;
      const bounds = this.progressBarMetrics(state);
      bounds.border = loader.borderWidth * (height / 360);
      bounds.radius = bounds.height / 2;
      const fillStyle = this.createBarFillStyle(ctx, state, timeSeconds, bounds);

      ctx.save();
      ctx.lineWidth = bounds.border;
      ctx.strokeStyle = loader.borderColor;
      if (loader.glow) {
        ctx.shadowColor = loader.glowColor;
        ctx.shadowBlur = loader.glowBlur * (height / 360);
      }
      this.drawBarTrack(ctx, state, bounds);
      ctx.restore();

      // A blurred duplicate keeps the actual gradient colours in the halo,
      // unlike the separate one-colour glow control above.
      if (loader.fillMode === 'gradient' && loader.gradientBlur > 0 && progress > 0) {
        ctx.save();
        ctx.globalAlpha = 0.72;
        if ('filter' in ctx) ctx.filter = `blur(${loader.gradientBlur * (height / 360)}px)`;
        this.drawBarFill(ctx, state, bounds, progress, fillStyle, true);
        ctx.restore();
      }

      ctx.save();
      if (loader.glow) {
        ctx.shadowColor = loader.glowColor;
        ctx.shadowBlur = loader.glowBlur * (height / 360);
      }
      this.drawBarFill(ctx, state, bounds, progress, fillStyle, false);
      ctx.restore();

      if (loader.showPercent) {
        const position = this.percentPosition(state);
        const fontSize = position.fontSize;
        ctx.save();
        ctx.font = `700 ${fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = loader.percentColor;
        ctx.strokeStyle = state.canvas.transparent ? 'rgba(255,255,255,.85)' : state.canvas.background;
        ctx.lineWidth = Math.max(2, fontSize * 0.18);
        const label = `${Math.round(progress * 100)}%`;
        ctx.strokeText(label, position.x, position.y);
        ctx.fillText(label, position.x, position.y);
        ctx.restore();
      }
    }

    drawBarTrack(ctx, state, bounds) {
      const loader = state.loader;
      const { left, top, width, height, cy, border } = bounds;
      ctx.fillStyle = loader.trackColor;
      ctx.strokeStyle = loader.borderColor;
      ctx.lineWidth = border;

      if (loader.barStyle === 'hearts') {
        const count = loader.segments;
        const gap = width / count;
        for (let index = 0; index < count; index += 1) {
          const cx = left + gap * (index + 0.5);
          Utils.pathHeart(ctx, cx, cy, Math.min(gap * 0.72, height * 1.2));
          ctx.fill();
          if (border > 0) ctx.stroke();
        }
        return;
      }

      if (loader.barStyle === 'bubbles') {
        const count = loader.segments;
        const gap = width / count;
        const radius = Math.min(gap * 0.32, height * 0.42);
        for (let index = 0; index < count; index += 1) {
          const cx = left + gap * (index + 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, TAU);
          ctx.fill();
          if (border > 0) ctx.stroke();
        }
        return;
      }

      if (loader.barStyle === 'segmented' || loader.barStyle === 'pixel') {
        const count = loader.segments;
        const gap = loader.barStyle === 'pixel' ? Math.max(2, width * 0.006) : Math.max(3, width * 0.009);
        const segmentWidth = (width - gap * (count - 1)) / count;
        for (let index = 0; index < count; index += 1) {
          const x = left + index * (segmentWidth + gap);
          this.roundRect(ctx, x, top, segmentWidth, height, loader.barStyle === 'pixel' ? 0 : height * 0.24);
          ctx.fill();
          if (border > 0) ctx.stroke();
        }
        return;
      }

      this.roundRect(ctx, left, top, width, height, bounds.radius);
      ctx.fill();
      if (border > 0) ctx.stroke();
    }

    drawBarFill(ctx, state, bounds, progress, fillStyle, blurred) {
      const loader = state.loader;
      const { left, top, width, height, cy, border } = bounds;
      const amount = Utils.clamp(progress, 0, 1);
      if (amount <= 0) return;
      ctx.fillStyle = fillStyle;
      ctx.strokeStyle = loader.borderColor;
      ctx.lineWidth = border;

      if (loader.barStyle === 'hearts') {
        const count = loader.segments;
        const gap = width / count;
        for (let index = 0; index < count; index += 1) {
          const local = Utils.clamp(amount * count - index, 0, 1);
          if (local <= 0) continue;
          const reveal = Utils.easing('smooth', local);
          const cx = left + gap * (index + 0.5);
          ctx.save();
          ctx.globalAlpha *= reveal;
          Utils.pathHeart(ctx, cx, cy, Math.min(gap * 0.72, height * 1.2) * (0.3 + reveal * 0.7));
          ctx.fill();
          if (!blurred && border > 0) ctx.stroke();
          ctx.restore();
        }
        return;
      }

      if (loader.barStyle === 'bubbles') {
        const count = loader.segments;
        const gap = width / count;
        const radius = Math.min(gap * 0.32, height * 0.42);
        for (let index = 0; index < count; index += 1) {
          const local = Utils.clamp(amount * count - index, 0, 1);
          if (local <= 0) continue;
          const reveal = Utils.easing('smooth', local);
          const cx = left + gap * (index + 0.5);
          const scale = 0.25 + reveal * 0.75;
          ctx.save();
          ctx.globalAlpha *= reveal;
          ctx.beginPath();
          ctx.arc(cx, cy, radius * scale, 0, TAU);
          ctx.fill();
          if (!blurred && border > 0) ctx.stroke();
          ctx.restore();
        }
        return;
      }

      if (loader.barStyle === 'segmented' || loader.barStyle === 'pixel') {
        const count = loader.segments;
        const gap = loader.barStyle === 'pixel' ? Math.max(2, width * 0.006) : Math.max(3, width * 0.009);
        const segmentWidth = (width - gap * (count - 1)) / count;
        for (let index = 0; index < count; index += 1) {
          const local = Utils.clamp(amount * count - index, 0, 1);
          if (local <= 0) continue;
          const x = left + index * (segmentWidth + gap);
          this.roundRect(ctx, x, top, segmentWidth * local, height, loader.barStyle === 'pixel' ? 0 : height * 0.24);
          ctx.fill();
        }
        return;
      }

      if (blurred) {
        this.roundRect(ctx, left, top, Math.max(0.5, width * amount), height, Math.min(bounds.radius, width * amount / 2));
        ctx.fill();
        return;
      }

      ctx.save();
      this.roundRect(
        ctx,
        left + border * 0.5,
        top + border * 0.5,
        Math.max(0, width - border),
        Math.max(0, height - border),
        bounds.radius,
      );
      ctx.clip();
      ctx.fillRect(left, top, width * amount, height);
      if (loader.trackShimmer) {
        const sheenWidth = width * 0.18;
        const sheenX = left - sheenWidth + (width + sheenWidth * 2) * amount;
        const sheen = ctx.createLinearGradient(sheenX, 0, sheenX + sheenWidth, 0);
        sheen.addColorStop(0, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.5, 'rgba(255,255,255,.45)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(sheenX, top, sheenWidth, height);
      }
      ctx.restore();
    }

    createBarFillStyle(ctx, state, timeSeconds, bounds) {
      const loader = state.loader;
      if (loader.fillMode !== 'gradient') return loader.fillColor;
      const stops = loader.gradientStops;
      const radians = (loader.gradientAngle || 0) * Math.PI / 180;
      const dx = Math.cos(radians);
      const dy = Math.sin(radians);
      const halfSpan = Math.max(1, Math.abs(dx) * bounds.width / 2 + Math.abs(dy) * bounds.height / 2);
      const x0 = bounds.cx - dx * halfSpan;
      const y0 = bounds.cy - dy * halfSpan;
      const x1 = bounds.cx + dx * halfSpan;
      const y1 = bounds.cy + dy * halfSpan;
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);

      if (!loader.gradientAnimate) {
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (first.position > 0) gradient.addColorStop(0, first.color);
        stops.forEach((stop) => gradient.addColorStop(Utils.clamp(stop.position / 100, 0, 1), stop.color));
        if (last.position < 100) gradient.addColorStop(1, last.color);
        return gradient;
      }

      const phase = Utils.mod(timeSeconds * loader.gradientSpeed * loader.gradientDirection, 1);
      const gradientLength = Math.max(1, halfSpan * 2);
      const blurPixels = loader.gradientBlur * (state.canvas.height / 360);
      const seamHalfWidth = Utils.clamp(blurPixels / gradientLength, 0, 0.24);
      const entries = this.createCyclicGradientEntries(stops, phase, seamHalfWidth);
      entries.forEach((entry) => gradient.addColorStop(Utils.clamp(entry.position, 0, 1), entry.color));
      return gradient;
    }

    createCyclicGradientEntries(stops, phase, requestedSeamHalfWidth) {
      const epsilon = 0.000001;
      const source = (Array.isArray(stops) ? stops : [])
        .map((stop, index) => ({
          position: Utils.clamp(Number(stop.position) / 100, 0, 1),
          color: Utils.normalizeHexColor(stop.color, index ? '#ffffff' : '#000000'),
          order: index,
        }))
        .sort((a, b) => a.position - b.position || a.order - b.order);
      if (!source.length) return [{ position: 0, color: '#000000' }, { position: 1, color: '#000000' }];
      if (source.length === 1) return [{ position: 0, color: source[0].color }, { position: 1, color: source[0].color }];

      const firstColor = source[0].color;
      const lastColor = source[source.length - 1].color;
      const interior = source.filter((stop) => stop.position > epsilon && stop.position < 1 - epsilon);
      const firstInteriorDistance = interior.length ? interior[0].position : 0.5;
      const lastInteriorDistance = interior.length ? 1 - interior[interior.length - 1].position : 0.5;
      const maximumSeamHalfWidth = Math.max(0, Math.min(0.24, firstInteriorDistance * 0.45, lastInteriorDistance * 0.45));
      const seamHalfWidth = Utils.clamp(requestedSeamHalfWidth, 0, maximumSeamHalfWidth);
      const expanded = [];

      // Each cycle owns one last→first seam. With a zero blur the two stops
      // intentionally share an offset (last first, then first); a positive blur
      // opens that edge into a transition whose width follows the UI setting.
      for (let cycle = -2; cycle <= 2; cycle += 1) {
        const seam = phase + cycle;
        expanded.push({ position: seam - seamHalfWidth, color: lastColor, order: -2 });
        expanded.push({ position: seam + seamHalfWidth, color: firstColor, order: -1 });
        interior.forEach((stop) => {
          expanded.push({ position: stop.position + phase + cycle, color: stop.color, order: stop.order });
        });
      }
      expanded.sort((a, b) => a.position - b.position || a.order - b.order);

      const sampleExpanded = (position, side) => {
        let rightIndex = expanded.findIndex((entry) => entry.position >= position);
        if (rightIndex < 0) return expanded[expanded.length - 1].color;
        if (rightIndex === 0) return expanded[0].color;
        if (expanded[rightIndex].position === position) {
          let firstAtPosition = rightIndex;
          let lastAtPosition = rightIndex;
          while (firstAtPosition > 0 && expanded[firstAtPosition - 1].position === position) firstAtPosition -= 1;
          while (lastAtPosition + 1 < expanded.length && expanded[lastAtPosition + 1].position === position) lastAtPosition += 1;
          return expanded[side === 'right' ? lastAtPosition : firstAtPosition].color;
        }
        const left = expanded[rightIndex - 1];
        const right = expanded[rightIndex];
        const span = Math.max(epsilon, right.position - left.position);
        return Utils.mixHexColors(left.color, right.color, (position - left.position) / span);
      };

      const entries = [{ position: 0, color: sampleExpanded(0, 'right') }];
      expanded.forEach((entry) => {
        if (entry.position > 0 && entry.position < 1) entries.push(entry);
      });
      entries.push({ position: 1, color: sampleExpanded(1, 'left') });
      return entries;
    }

    shuffledIndexes(count, seed) {
      const values = Array.from({ length: Math.max(0, count) }, (_, index) => index);
      for (let index = values.length - 1; index > 0; index -= 1) {
        const roll = Utils.hash01(seed, index * 37 + values.length * 101);
        const swapIndex = Math.min(index, Math.floor(roll * (index + 1)));
        const temporary = values[index];
        values[index] = values[swapIndex];
        values[swapIndex] = temporary;
      }
      return values;
    }

    imageRowOrder(loader, count, round) {
      if (loader.rowOrder === 'random') {
        return this.shuffledIndexes(count, loader.seed + round * 7919);
      }
      if (loader.rowOrder === 'alternating') {
        const values = [];
        let left = 0;
        let right = count - 1;
        while (left <= right) {
          values.push(left);
          if (right !== left) values.push(right);
          left += 1;
          right -= 1;
        }
        return values;
      }
      return Array.from({ length: count }, (_, index) => index);
    }

    imageRowCollectionIndex(orderMode, loader, slot, round, imageCount, seedOffset = 0) {
      if (imageCount <= 0) return -1;
      if (orderMode === 'alternating') {
        if (imageCount === 1) return 0;
        const period = imageCount * 2 - 2;
        const position = Utils.mod(slot, period);
        return position < imageCount ? position : period - position;
      }
      if (orderMode === 'random') {
        const cycle = Math.floor(slot / imageCount);
        const order = this.shuffledIndexes(
          imageCount,
          loader.seed + round * 104729 + cycle * 1543 + seedOffset,
        );
        return order[Utils.mod(slot, imageCount)];
      }
      return Utils.mod(slot, imageCount);
    }

    imageRowImageIndex(loader, slot, round, imageCount) {
      return this.imageRowCollectionIndex(loader.rowImageOrder, loader, slot, round, imageCount, 17);
    }

    imageRowBaseImageIndex(loader, slot, round, imageCount) {
      return this.imageRowCollectionIndex(loader.rowBaseImageOrder, loader, slot, round, imageCount, 3571);
    }

    imageRowStartsAsImage(loader, slot) {
      return loader.rowStartPattern === 'odd-base'
        ? slot % 2 === 1
        : loader.rowStartPattern === 'odd-image' && slot % 2 === 0;
    }

    imageRowPatternMix(loader, slot, rawMix) {
      return this.imageRowStartsAsImage(loader, slot) ? 1 - rawMix : rawMix;
    }

    imageRowStepMix(phase, rank, count) {
      const overlap = 1.45;
      const cursor = Utils.clamp(phase, 0, 1) * (Math.max(0, count - 1) + overlap);
      const local = Utils.clamp((cursor - rank) / overlap, 0, 1);
      return Utils.easing('smooth', local);
    }

    imageRowFrameState(state, timeSeconds) {
      const loader = state.loader;
      const count = Math.max(1, Math.round(loader.rowCount));
      const duration = Math.max(0.001, Utils.getAnimationDuration(state));
      const normalized = Utils.clamp(timeSeconds / duration, 0, 1);
      const usesRandom = loader.rowOrder === 'random'
        || loader.rowImageOrder === 'random'
        || (loader.rowBaseMode === 'images' && loader.rowBaseImageOrder === 'random');
      const rounds = usesRandom ? Math.max(1, Math.round(loader.rowRandomRepeats)) : 1;
      const roundPosition = normalized * rounds;
      const round = normalized >= 1 ? rounds - 1 : Math.min(rounds - 1, Math.floor(roundPosition));
      const local = normalized >= 1 ? 1 : roundPosition - round;
      const order = this.imageRowOrder(loader, count, round);
      const ranks = Array(count);
      order.forEach((slot, rank) => { ranks[slot] = rank; });

      let revealPhase = 0;
      let returning = false;
      const finalProgressRound = loader.rowMode === 'progress' && round === rounds - 1;
      if (finalProgressRound) {
        revealPhase = Utils.clamp(local / 0.9, 0, 1);
      } else if (local < 0.44) {
        revealPhase = local / 0.44;
      } else if (local <= 0.56) {
        revealPhase = 1;
      } else {
        revealPhase = (local - 0.56) / 0.44;
        returning = true;
      }

      const imageCount = this.rowMedia ? this.rowMedia.frameCount : 0;
      const baseImageCount = this.rowBaseMedia ? this.rowBaseMedia.frameCount : 0;
      const nextRound = loader.rowMode === 'loop'
        ? Utils.mod(round + 1, rounds)
        : Math.min(round + 1, rounds - 1);
      const atLoopEnd = loader.rowMode === 'loop' && returning && local >= 1;
      const slots = Array.from({ length: count }, (_, slot) => {
        const stepped = this.imageRowStepMix(revealPhase, ranks[slot], count);
        const rawMix = returning ? 1 - stepped : stepped;
        const startsAsImage = this.imageRowStartsAsImage(loader, slot);
        const baseMapRound = atLoopEnd
          ? nextRound
          : returning && !startsAsImage ? nextRound : round;
        const targetMapRound = atLoopEnd
          ? nextRound
          : returning && startsAsImage ? nextRound : round;
        return {
          slot,
          rank: ranks[slot],
          mix: this.imageRowPatternMix(loader, slot, rawMix),
          imageIndex: this.imageRowImageIndex(loader, slot, targetMapRound, imageCount),
          baseImageIndex: this.imageRowBaseImageIndex(loader, slot, baseMapRound, baseImageCount),
        };
      });
      return { round, rounds, local, order, slots };
    }

    buildImageRowShapePath(ctx, shape, size) {
      const radius = size / 2;
      if (shape === 'star') {
        Utils.pathStar(ctx, 0, 0, radius, radius * 0.43, 5);
        return;
      }
      if (shape === 'heart') {
        Utils.pathHeart(ctx, 0, 0, size * 0.98);
        return;
      }
      if (shape === 'square') {
        this.roundRect(ctx, -radius, -radius, size, size, size * 0.12);
        return;
      }
      if (shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(0, -radius);
        ctx.lineTo(radius, 0);
        ctx.lineTo(0, radius);
        ctx.lineTo(-radius, 0);
        ctx.closePath();
        return;
      }
      if (shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(0, -radius);
        ctx.lineTo(radius * 0.9, radius * 0.78);
        ctx.lineTo(-radius * 0.9, radius * 0.78);
        ctx.closePath();
        return;
      }
      if (shape === 'hexagon') {
        ctx.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = -Math.PI / 2 + index * TAU / 6;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        return;
      }
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.closePath();
    }

    drawImageRowFrame(ctx, frame, size, fit, shape) {
      const sourceWidth = frame.displayWidth || frame.videoWidth || frame.naturalWidth || frame.width || 1;
      const sourceHeight = frame.displayHeight || frame.videoHeight || frame.naturalHeight || frame.height || 1;
      const targetScale = fit === 'cover'
        ? Math.max(size / sourceWidth, size / sourceHeight)
        : Math.min(size / sourceWidth, size / sourceHeight);
      const drawWidth = Math.max(0.5, sourceWidth * targetScale);
      const drawHeight = Math.max(0.5, sourceHeight * targetScale);
      if (fit === 'cover') {
        this.buildImageRowShapePath(ctx, shape, size);
        ctx.clip();
      }
      ctx.drawImage(frame, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }

    drawImageRowLoader(ctx, state, timeSeconds) {
      const loader = state.loader;
      const layout = this.imageRowLayout(state);
      const frameState = this.imageRowFrameState(state, timeSeconds);
      const scale = state.canvas.height / 360;
      const borderWidth = Math.max(0, loader.borderWidth * scale);

      frameState.slots.forEach((slotState) => {
        const x = layout.centerAt(slotState.slot);
        const shape = loader.rowShapes[slotState.slot] || 'circle';
        const mix = Utils.clamp(slotState.mix, 0, 1);
        const frame = slotState.imageIndex >= 0 && this.rowMedia
          ? this.rowMedia.getFrameByIndex(slotState.imageIndex)
          : null;
        const baseFrame = loader.rowBaseMode === 'images'
          && slotState.baseImageIndex >= 0
          && this.rowBaseMedia
          ? this.rowBaseMedia.getFrameByIndex(slotState.baseImageIndex)
          : null;
        ctx.save();
        ctx.translate(x, layout.cy);
        if (loader.glow) {
          ctx.shadowColor = loader.glowColor;
          ctx.shadowBlur = loader.glowBlur * scale;
        }

        ctx.save();
        ctx.globalAlpha = 1 - mix;
        if (baseFrame) {
          const exitScale = 1 - mix * 0.08;
          ctx.scale(exitScale, exitScale);
          this.drawImageRowFrame(ctx, baseFrame, layout.itemSize, loader.rowBaseImageFit, shape);
        } else {
          ctx.fillStyle = loader.trackColor;
          ctx.strokeStyle = loader.borderColor;
          ctx.lineWidth = borderWidth;
          this.buildImageRowShapePath(ctx, shape, layout.itemSize);
          ctx.fill();
          if (borderWidth > 0) ctx.stroke();
        }
        ctx.restore();

        if (frame) {
          ctx.save();
          ctx.globalAlpha = mix;
          const entranceScale = 0.82 + mix * 0.18;
          ctx.scale(entranceScale, entranceScale);
          this.drawImageRowFrame(ctx, frame, layout.itemSize, loader.rowImageFit, shape);
          ctx.restore();
        } else if (mix > 0) {
          ctx.save();
          ctx.globalAlpha = mix;
          ctx.fillStyle = loader.fillColor;
          this.buildImageRowShapePath(ctx, shape, layout.itemSize * (0.84 + mix * 0.16));
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      });
    }

    drawLoopLoader(ctx, state, timeSeconds) {
      const loader = state.loader;
      const width = state.canvas.width;
      const height = state.canvas.height;
      const scale = Math.min(width / 640, height / 360);
      const cx = width * loader.x / 100;
      const cy = height * loader.y / 100;
      const radius = loader.loopRadius * scale;
      const size = loader.loopSize * scale;
      const phase = timeSeconds * loader.loopSpeed * loader.loopDirection;

      ctx.save();
      if (loader.glow) {
        ctx.shadowColor = loader.glowColor;
        ctx.shadowBlur = loader.glowBlur * scale;
      }
      if (loader.loopStyle === 'ring') {
        ctx.lineWidth = Math.max(3, size * 0.55);
        ctx.lineCap = 'round';
        ctx.strokeStyle = loader.trackColor;
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = loader.fillColor;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, phase * TAU - Math.PI / 2, phase * TAU + Math.PI * 0.85);
        ctx.stroke();
        ctx.restore();
        return;
      }

      const count = loader.loopCount;
      const head = Utils.mod(phase * count, count);
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU - Math.PI / 2;
        const distance = Utils.mod(head - i, count);
        const trail = loader.loopTrail ? Utils.clamp(1 - distance / Math.max(2, count * 0.75), 0.16, 1) : 1;
        const pulse = loader.loopPulse ? 0.8 + 0.28 * Math.cos((distance / count) * TAU) : 1;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.globalAlpha = trail;
        ctx.fillStyle = distance < 1.2 ? loader.fillColor : loader.trackColor;
        ctx.strokeStyle = loader.fillColor;
        ctx.lineWidth = Math.max(1, size * 0.12);
        this.drawLoaderShape(ctx, loader.loopStyle, size * pulse);
        ctx.restore();
      }
      ctx.restore();
    }

    drawLoaderShape(ctx, style, size) {
      switch (style) {
        case 'stars':
          Utils.pathStar(ctx, 0, 0, size * 0.62, size * 0.27, 5);
          ctx.fill();
          break;
        case 'petals':
          ctx.beginPath(); ctx.ellipse(0, -size * 0.2, size * 0.38, size * 0.68, 0, 0, TAU); ctx.fill();
          break;
        case 'squares':
          ctx.fillRect(-size * 0.48, -size * 0.48, size * 0.96, size * 0.96);
          break;
        case 'hearts':
          Utils.pathHeart(ctx, 0, 0, size * 1.05); ctx.fill();
          break;
        case 'bubbles':
          ctx.beginPath(); ctx.arc(0, 0, size * 0.5, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(-size * 0.15, -size * 0.18, size * 0.13, 0, TAU); ctx.fill();
          break;
        default:
          ctx.beginPath(); ctx.arc(0, 0, size * 0.5, 0, TAU); ctx.fill();
          break;
      }
    }

    drawCompletionEffect(ctx, source, state, progress, timeSeconds) {
      if (progress <= 0.0001) {
        ctx.drawImage(source, 0, 0);
        return;
      }
      if (progress >= 0.9999) return;
      const motion = state.loader.completionMotion;
      switch (motion) {
        case 'sparkle': this.drawSparkleCompletion(ctx, source, state, progress, timeSeconds); break;
        case 'glitch': this.drawGlitchCompletion(ctx, source, state, progress); break;
        case 'shards': this.drawShardsCompletion(ctx, source, state, progress); break;
        case 'pixel-dissolve': this.drawPixelCompletion(ctx, source, state, progress); break;
        case 'shrink-pop': this.drawShrinkPopCompletion(ctx, source, state, progress); break;
        case 'slide-up': this.drawSlideUpCompletion(ctx, source, state, progress); break;
        case 'wipe': this.drawWipeCompletion(ctx, source, state, progress); break;
        case 'spin-vanish': this.drawSpinCompletion(ctx, source, state, progress); break;
        case 'burst': this.drawBurstCompletion(ctx, source, state, progress); break;
        default: this.drawFadeCompletion(ctx, source, progress); break;
      }
    }

    completionColor(state, index) {
      const stops = state.loader.fillMode === 'gradient' ? state.loader.gradientStops : null;
      if (stops && stops.length) return stops[Math.abs(index) % stops.length].color;
      return state.loader.fillColor;
    }

    drawFadeCompletion(ctx, source, progress) {
      const alpha = 1 - Utils.easing('smooth', progress);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(source, 0, 0);
      ctx.restore();
    }

    drawSparkleCompletion(ctx, source, state, progress) {
      const width = source.width;
      const height = source.height;
      const intensity = state.loader.completionIntensity;
      const eased = Utils.easing('smooth', progress);
      const vanish = Math.pow(Math.max(0, 1 - progress), 0.72);
      ctx.save();
      ctx.globalAlpha = (1 - eased * 0.88) * vanish;
      ctx.drawImage(source, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const count = Math.round(26 + intensity * 18);
      for (let index = 0; index < count; index += 1) {
        const birth = Utils.hash01(state.loader.seed + 301, index) * 0.72;
        const life = 0.2 + Utils.hash01(state.loader.seed + 302, index) * 0.32;
        const local = (progress - birth) / life;
        if (local < 0 || local > 1) continue;
        const pulse = Math.sin(local * Math.PI);
        const size = (2.5 + Utils.hash01(state.loader.seed + 303, index) * 8) * pulse * intensity;
        const x = Utils.hash01(state.loader.seed + 304, index) * width;
        const baseY = Utils.hash01(state.loader.seed + 305, index) * height;
        const y = baseY - local * height * 0.08 * intensity;
        ctx.globalAlpha = pulse * vanish;
        ctx.fillStyle = this.completionColor(state, index);
        Utils.pathStar(ctx, x, y, size, Math.max(0.8, size * 0.34), index % 3 === 0 ? 4 : 5);
        ctx.fill();
      }
      ctx.restore();
    }

    drawGlitchCompletion(ctx, source, state, progress) {
      const width = source.width;
      const height = source.height;
      const intensity = state.loader.completionIntensity;
      const alpha = 1 - Utils.easing('smooth', progress);
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha * 0.72;
      ctx.drawImage(source, 0, 0);
      const strips = Math.round(16 + intensity * 10);
      for (let index = 0; index < strips; index += 1) {
        const y = Math.floor(Utils.hash01(state.loader.seed + 411, index) * height);
        const stripHeight = Math.max(1, Math.floor((2 + Utils.hash01(state.loader.seed + 412, index) * 18) * intensity));
        const direction = Utils.hash01(state.loader.seed + 413, index) * 2 - 1;
        const offset = direction * width * (0.025 + progress * 0.11) * intensity;
        ctx.globalAlpha = alpha * (0.42 + Utils.hash01(state.loader.seed + 414, index) * 0.42);
        ctx.drawImage(source, 0, y, width, stripHeight, offset, y, width, stripHeight);
      }
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = alpha * progress * 0.28;
      ctx.fillStyle = this.completionColor(state, 0);
      for (let index = 0; index < 8; index += 1) {
        const y = Utils.hash01(state.loader.seed + 415, index) * height;
        ctx.fillRect(0, y, width, Math.max(1, height * 0.004));
      }
      ctx.restore();
    }

    drawShardsCompletion(ctx, source, state, progress) {
      const width = source.width;
      const height = source.height;
      const intensity = state.loader.completionIntensity;
      if (progress <= 0.0001) {
        ctx.drawImage(source, 0, 0);
        return;
      }
      const columns = 6;
      const rows = 4;
      const cellWidth = width / columns;
      const cellHeight = height / rows;
      const travel = progress * progress;
      const alpha = 1 - Utils.easing('smooth', progress);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * cellWidth;
          const y = row * cellHeight;
          const cx = x + cellWidth / 2;
          const cy = y + cellHeight / 2;
          const baseAngle = Math.atan2(cy - height / 2, cx - width / 2);
          for (let triangle = 0; triangle < 2; triangle += 1) {
            const index = (row * columns + column) * 2 + triangle;
            const jitter = (Utils.hash01(state.loader.seed + 501, index) - 0.5) * 1.15;
            const angle = baseAngle + jitter;
            const distance = (40 + Utils.hash01(state.loader.seed + 502, index) * 170) * travel * intensity;
            const moveX = Math.cos(angle) * distance;
            const moveY = Math.sin(angle) * distance - travel * height * 0.04;
            const rotation = (Utils.hash01(state.loader.seed + 503, index) - 0.5) * progress * 2.2 * intensity;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(cx + moveX, cy + moveY);
            ctx.rotate(rotation);
            ctx.beginPath();
            if (triangle === 0) {
              ctx.moveTo(-cellWidth / 2, -cellHeight / 2);
              ctx.lineTo(cellWidth / 2, -cellHeight / 2);
              ctx.lineTo(-cellWidth / 2, cellHeight / 2);
            } else {
              ctx.moveTo(cellWidth / 2, -cellHeight / 2);
              ctx.lineTo(cellWidth / 2, cellHeight / 2);
              ctx.lineTo(-cellWidth / 2, cellHeight / 2);
            }
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(source, -cx, -cy);
            ctx.restore();
          }
        }
      }
    }

    drawPixelCompletion(ctx, source, state, progress) {
      const width = source.width;
      const height = source.height;
      const intensity = state.loader.completionIntensity;
      const block = Math.max(7, Math.round(Math.min(width, height) / (25 + intensity * 4)));
      const alpha = 1 - progress * progress;
      for (let y = 0, row = 0; y < height; y += block, row += 1) {
        for (let x = 0, column = 0; x < width; x += block, column += 1) {
          const index = row * 1000 + column;
          const threshold = Utils.hash01(state.loader.seed + 601, index);
          if (threshold <= progress * 1.04) continue;
          const w = Math.min(block, width - x);
          const h = Math.min(block, height - y);
          const drift = progress * progress * block * intensity;
          const dx = (Utils.hash01(state.loader.seed + 602, index) - 0.5) * drift * 2;
          const dy = (Utils.hash01(state.loader.seed + 603, index) - 0.25) * drift * 2;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.drawImage(source, x, y, w, h, x + dx, y + dy, w, h);
          ctx.restore();
        }
      }
    }

    drawShrinkPopCompletion(ctx, source, state, progress) {
      const width = source.width;
      const height = source.height;
      const intensity = state.loader.completionIntensity;
      let scale;
      if (progress < 0.18) {
        scale = 1 + Math.sin((progress / 0.18) * Math.PI) * 0.13 * intensity;
      } else {
        const local = (progress - 0.18) / 0.82;
        scale = Math.max(0, 1 - local * local);
      }
      const alpha = progress < 0.58 ? 1 : 1 - (progress - 0.58) / 0.42;
      ctx.save();
      ctx.globalAlpha = Utils.clamp(alpha, 0, 1);
      ctx.translate(width / 2, height / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(source, -width / 2, -height / 2);
      ctx.restore();
    }

    drawSlideUpCompletion(ctx, source, state, progress) {
      const height = source.height;
      const intensity = state.loader.completionIntensity;
      const eased = Utils.easing('smooth', progress);
      ctx.save();
      ctx.globalAlpha = 1 - eased;
      if ('filter' in ctx) ctx.filter = `blur(${eased * 7 * intensity}px)`;
      ctx.translate(0, -height * 0.42 * eased * intensity);
      ctx.drawImage(source, 0, 0);
      ctx.restore();
    }

    drawWipeCompletion(ctx, source, state, progress) {
      const width = source.width;
      const height = source.height;
      const eased = Utils.easing('smooth', progress);
      const remaining = Math.max(0, 1 - eased);
      if (remaining <= 0) return;
      const left = width * (1 - remaining) / 2;
      const right = width - left;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, 0, Math.max(0, right - left), height);
      ctx.clip();
      ctx.drawImage(source, 0, 0);
      ctx.restore();

      if (progress > 0.01 && progress < 0.99) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = this.completionColor(state, 0);
        ctx.lineWidth = Math.max(1, width * 0.004 * state.loader.completionIntensity);
        ctx.shadowColor = this.completionColor(state, 1);
        ctx.shadowBlur = 12 * state.loader.completionIntensity;
        ctx.beginPath();
        ctx.moveTo(left, 0); ctx.lineTo(left, height);
        ctx.moveTo(right, 0); ctx.lineTo(right, height);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawSpinCompletion(ctx, source, state, progress) {
      const width = source.width;
      const height = source.height;
      const intensity = state.loader.completionIntensity;
      const eased = progress * progress * (3 - 2 * progress);
      const scale = Math.max(0, 1 - eased);
      ctx.save();
      ctx.globalAlpha = 1 - eased;
      ctx.translate(width / 2, height / 2);
      ctx.rotate(eased * TAU * 1.3 * intensity);
      ctx.scale(scale, scale);
      ctx.drawImage(source, -width / 2, -height / 2);
      ctx.restore();
    }

    drawBurstCompletion(ctx, source, state, progress) {
      const width = source.width;
      const height = source.height;
      const intensity = state.loader.completionIntensity;
      const eased = Utils.easing('smooth', progress);
      ctx.save();
      ctx.globalAlpha = 1 - eased;
      ctx.translate(width / 2, height / 2);
      const scale = 1 + eased * 0.34 * intensity;
      ctx.scale(scale, scale);
      ctx.drawImage(source, -width / 2, -height / 2);
      ctx.restore();

      if (progress < 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = Math.sin((progress / 0.3) * Math.PI) * 0.62;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const count = Math.round(22 + intensity * 16);
      for (let index = 0; index < count; index += 1) {
        const birth = 0.04 + Utils.hash01(state.loader.seed + 701, index) * 0.2;
        const local = Utils.clamp((progress - birth) / Math.max(0.001, 1 - birth), 0, 1);
        if (local <= 0 || local >= 1) continue;
        const angle = Utils.hash01(state.loader.seed + 702, index) * TAU;
        const distance = local * Math.max(width, height) * (0.18 + Utils.hash01(state.loader.seed + 703, index) * 0.42) * intensity;
        const x = width / 2 + Math.cos(angle) * distance;
        const y = height / 2 + Math.sin(angle) * distance;
        const radius = (2 + Utils.hash01(state.loader.seed + 704, index) * 6) * (1 - local) * intensity;
        ctx.globalAlpha = Math.sin(local * Math.PI) * (1 - progress * 0.35);
        ctx.fillStyle = this.completionColor(state, index);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, radius), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawTextBlock(ctx, state, textState, width, height) {
      if (!textState.enabled || !String(textState.text || '').length) return;
      const scale = height / 360;
      const x = width * textState.x / 100;
      const y = height * textState.y / 100;
      const fontSize = textState.fontSize * scale;
      const lineHeight = fontSize * 1.22;
      const lines = String(textState.text).split(/\r?\n/);
      const totalHeight = (lines.length - 1) * lineHeight;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((Number(textState.rotation) || 0) * Math.PI / 180);
      ctx.font = `${textState.fontWeight} ${fontSize}px ${textState.fontFamily || 'sans-serif'}`;
      ctx.textAlign = textState.align;
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.fillStyle = textState.color;
      ctx.strokeStyle = textState.strokeColor;
      ctx.lineWidth = textState.strokeWidth * scale;
      ctx.shadowColor = textState.shadowColor;
      ctx.shadowBlur = textState.shadowBlur * scale;
      const maxWidth = width * 0.92;
      lines.forEach((line, index) => {
        const lineY = -totalHeight / 2 + index * lineHeight;
        if (ctx.lineWidth > 0) this.drawSpacedText(ctx, line, 0, lineY, textState.letterSpacing * scale, true, maxWidth);
        this.drawSpacedText(ctx, line, 0, lineY, textState.letterSpacing * scale, false, maxWidth);
      });
      ctx.restore();
    }

    drawSpacedText(ctx, text, x, y, spacing, stroke, maxWidth) {
      const chars = Array.from(String(text));
      if (!chars.length) return;
      const widths = chars.map((char) => ctx.measureText(char).width);
      const rawWidth = widths.reduce((sum, value) => sum + value, 0) + spacing * Math.max(0, chars.length - 1);
      const squeeze = rawWidth > maxWidth ? maxWidth / rawWidth : 1;
      if (Math.abs(spacing) < 0.01 && squeeze === 1) {
        if (stroke) ctx.strokeText(text, x, y); else ctx.fillText(text, x, y);
        return;
      }
      let cursor;
      if (ctx.textAlign === 'left') cursor = x;
      else if (ctx.textAlign === 'right') cursor = x - rawWidth * squeeze;
      else cursor = x - rawWidth * squeeze / 2;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.translate(cursor, y);
      ctx.scale(squeeze, 1);
      let localX = 0;
      chars.forEach((char, index) => {
        if (stroke) ctx.strokeText(char, localX, 0); else ctx.fillText(char, localX, 0);
        localX += widths[index] + spacing;
      });
      ctx.restore();
    }

    roundRect(ctx, x, y, width, height, radius) {
      const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  }

  NS.Renderer = Renderer;
}(window));
