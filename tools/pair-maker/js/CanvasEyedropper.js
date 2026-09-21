export function createCanvasEyedropper(stage, stickers, waitForDraw) {
  const container = stage.container();
  let session = null;

  function cancel() { session?.finish(null); }

  function pick() {
    cancel();
    return new Promise(resolve => {
      const shield = document.createElement('div');
      shield.className = 'canvas-eyedropper-target';
      shield.setAttribute('aria-hidden', 'true');
      const controls = document.createElement('div');
      controls.className = 'canvas-eyedropper-controls';
      controls.setAttribute('role', 'dialog');
      controls.setAttribute('aria-label', T("eyedrop.001"));
      const message = document.createElement('span');
      message.setAttribute('role', 'status');
      message.textContent = T("eyedrop.002");
      const close = document.createElement('button');
      close.type = 'button'; close.textContent = T("crop.009");
      controls.append(message, close);
      const loupe = document.createElement('div');
      loupe.className = 'canvas-eyedropper-loupe'; loupe.hidden = true;
      loupe.setAttribute('aria-hidden', 'true');
      const zoom = document.createElement('canvas'); zoom.width = zoom.height = 120;
      const zoomContext = zoom.getContext('2d');
      const colorLabel = document.createElement('span');
      loupe.append(zoom, colorLabel);
      let snapshot = null, snapshotTask = null, snapshotVersion = 0;
      let cursor = null, zoomFrame = 0;
      let finished = false, busy = false, pointer = null;
      async function getSnapshot() {
        if (snapshot) return snapshot;
        if (snapshotTask) return snapshotTask;
        const version = snapshotVersion;
        const task = (async () => {
          await waitForDraw();
          if (finished) return null;
          const visible = stickers.transformer.visible();
          let result;
          try {
            stickers.transformer.hide(); stage.draw();
            result = stage.toCanvas({ pixelRatio: 1 });
          } finally {
            stickers.transformer.visible(visible); stage.draw(); stickers.positionDelete();
          }
          if (!result.width || !result.height) throw new Error(T("eyedrop.003"));
          if (version === snapshotVersion) snapshot = result;
          return result;
        })();
        snapshotTask = task;
        try { return await task; }
        finally { if (snapshotTask === task) snapshotTask = null; }
      }
      function readPixel(source, u, v) {
        const x = Math.min(source.width-1, Math.floor(u*source.width));
        const y = Math.min(source.height-1, Math.floor(v*source.height));
        const pixel = document.createElement('canvas'); pixel.width = pixel.height = 1;
        const context = pixel.getContext('2d', { willReadFrequently: true });
        context.fillStyle = '#fff'; context.fillRect(0, 0, 1, 1);
        context.drawImage(source, x, y, 1, 1, 0, 0, 1, 1);
        const rgb = context.getImageData(0, 0, 1, 1).data;
        return { x, y, hex: '#'+Array.from(rgb).slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('') };
      }
      function showError(error) {
        if (!finished) message.textContent = error.name === 'SecurityError'
          ? T("eyedrop.004")
          : T("eyedrop.005");
      }
      async function drawZoom() {
        zoomFrame = 0;
        try {
          const source = await getSnapshot();
          if (finished || !cursor || !source) return;
          const rect = container.getBoundingClientRect();
          const u = (cursor.x-rect.left)/rect.width, v = (cursor.y-rect.top)/rect.height;
          if (!(u>=0 && u<1 && v>=0 && v<1)) { loupe.hidden=true; return; }
          const {x,y,hex} = readPixel(source,u,v);
          // 把周圍 15×15 的像素放大 8 倍
          zoomContext.imageSmoothingEnabled = false;
          zoomContext.fillStyle='#fff'; zoomContext.fillRect(0,0,120,120);
          zoomContext.drawImage(source,x-7,y-7,15,15,0,0,120,120);
          zoomContext.strokeStyle='#fff'; zoomContext.lineWidth=3;
          zoomContext.strokeRect(56,56,8,8);
          zoomContext.strokeStyle='#111'; zoomContext.lineWidth=1;
          zoomContext.strokeRect(56,56,8,8);
          colorLabel.textContent=hex.toUpperCase();
          loupe.hidden=false;
          const w=loupe.offsetWidth,h=loupe.offsetHeight;
          let left=cursor.x+20,top=cursor.y-h-20;
          if(left+w>innerWidth-8)left=cursor.x-w-20;
          if(top<8)top=cursor.y+20;
          loupe.style.left=Math.max(8,Math.min(innerWidth-w-8,left))+'px';
          loupe.style.top=Math.max(8,Math.min(innerHeight-h-8,top))+'px';
        } catch(error) { loupe.hidden=true; showError(error); }
      }
      function scheduleZoom() { if(!zoomFrame && !finished)zoomFrame=requestAnimationFrame(drawZoom); }
      function invalidate() {
        snapshotVersion++;snapshot=null;snapshotTask=null;scheduleZoom();position();
      }
      function position() {
        const r = container.getBoundingClientRect();
        Object.assign(shield.style, { left: r.left+'px', top: r.top+'px', width: r.width+'px', height: r.height+'px' });
      }
      const observer = new ResizeObserver(position);
      const current = { finish(color) {
        if (finished) return;
        finished = true; observer.disconnect();
        cancelAnimationFrame(zoomFrame);
        container.removeEventListener('editor:resize', invalidate);
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        window.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('keydown', keydown, true);
        shield.remove(); controls.remove(); loupe.remove();
        document.body.classList.remove('is-eyedropping');
        if (session === current) session = null;
        resolve(color);
      }};
      session = current;
      function stop(e) { e.preventDefault(); e.stopImmediatePropagation(); }
      function outside(e) {
        if (shield.contains(e.target) || controls.contains(e.target)) return;
        stop(e); current.finish(null);
      }
      function keydown(e) {
        if (e.key === 'Escape') {
          stop(e);
          window.addEventListener('keyup', event => {
            if (event.key === 'Escape') stop(event);
          }, { capture: true, once: true });
          current.finish(null);
        }
        if (e.key === 'Tab') { stop(e); close.focus(); }
      }
      close.onclick = () => current.finish(null);
      shield.addEventListener('pointerdown', e => {
        stop(e);
        if (busy || pointer !== null || !e.isPrimary || e.button !== 0) return;
        pointer = e.pointerId; shield.setPointerCapture(pointer);
        cursor={x:e.clientX,y:e.clientY};scheduleZoom();
      });
      shield.addEventListener('pointermove', e => {
        if(!e.isPrimary || (pointer!==null && pointer!==e.pointerId))return;
        cursor={x:e.clientX,y:e.clientY};scheduleZoom();
      });
      shield.addEventListener('pointerleave',()=>{cursor=null;loupe.hidden=true;});
      shield.addEventListener('pointercancel', e => { stop(e); pointer = null; });
      shield.addEventListener('pointerup', async e => {
        stop(e);
        if (busy || pointer !== e.pointerId) return;
        pointer = null;
        if (shield.hasPointerCapture(e.pointerId)) shield.releasePointerCapture(e.pointerId);
        const rect = container.getBoundingClientRect();
        const u = (e.clientX-rect.left)/rect.width, v = (e.clientY-rect.top)/rect.height;
        if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return;
        busy = true; message.textContent = T("eyedrop.006");
        try {
          const source=await getSnapshot();
          if (finished || !source) return;
          current.finish(readPixel(source,u,v).hex);
        } catch (error) {
          showError(error);
        } finally { busy = false; }
      });
      for (const type of ['click', 'dblclick', 'contextmenu']) shield.addEventListener(type, stop);
      document.body.classList.add('is-eyedropping');
      document.body.append(shield, controls, loupe); position(); observer.observe(container);
      container.addEventListener('editor:resize',invalidate);
      window.addEventListener('resize', position);
      window.addEventListener('scroll', position, true);
      window.addEventListener('pointerdown', outside, true);
      window.addEventListener('keydown', keydown, true);
      close.focus({ preventScroll: true });
    });
  }
  return { pick, cancel, get active() { return session !== null; } };
}
