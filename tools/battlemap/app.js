/* 戰鬥地圖產生器（battlemap-generator）。上游寫在 index.html 的 <script> 區塊，
 * 依慣例抽成獨立檔案；以 defer 在字典之後載入。 */
(function(){
  "use strict";
  const COLS = 22, ROWS = 16, SQ = 70;
  const W = COLS*SQ, H = ROWS*SQ;

  const PALETTES = {
    dungeon: { floor:[96,92,88], wall:[46,42,40], mortar:[30,28,26], crack:[20,18,17], rubble:[58,54,50], moss:null,        void:[10,9,9] },
    cave:    { floor:[84,74,60], wall:[48,40,32], mortar:[34,28,22], crack:[24,19,15], rubble:[66,56,44], moss:[70,96,54], void:[8,8,8]  },
    crypt:   { floor:[104,104,112], wall:[52,52,60], mortar:[36,36,42], crack:[22,22,26], rubble:[64,64,72], moss:[60,84,70], void:[6,6,9] }
  };

  // ---- 可指定種子的亂數產生器（mulberry32） ----
  function mulberry32(seed){
    return function(){
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function randInt(rng, min, maxExclusive){ return Math.floor(rng()*(maxExclusive-min))+min; }
  function randRange(rng, min, max){ return rng()*(max-min)+min; }

  // ---- 房間與走道的配置 ----
  function intersects(a,b,pad){
    pad = pad===undefined?1:pad;
    return !(a.x+a.w+pad<=b.x || b.x+b.w+pad<=a.x || a.y+a.h+pad<=b.y || b.y+b.h+pad<=a.y);
  }
  function hline(floor,y,x0,x1){ for(let x=x0;x<=x1;x++) floor[y*COLS+x]=1; }
  function vline(floor,x,y0,y1){ for(let y=y0;y<=y1;y++) floor[y*COLS+x]=1; }

  function generateLayout(rng){
    const floor = new Uint8Array(COLS*ROWS);
    const rooms = [];
    const target = randInt(rng,5,9);
    let attempts=0;
    while(rooms.length<target && attempts<200){
      attempts++;
      const w=randInt(rng,3,6), h=randInt(rng,3,6);
      const x=randInt(rng,1,COLS-w-1), y=randInt(rng,1,ROWS-h-1);
      const cand={x,y,w,h};
      if (rooms.some(r=>intersects(cand,r))) continue;
      rooms.push(cand);
      for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) floor[yy*COLS+xx]=1;
    }
    for(let i=1;i<rooms.length;i++){
      const a=rooms[i-1], b=rooms[i];
      const acx=a.x+Math.floor(a.w/2), acy=a.y+Math.floor(a.h/2);
      const bcx=b.x+Math.floor(b.w/2), bcy=b.y+Math.floor(b.h/2);
      if (rng()<0.5){
        hline(floor, acy, Math.min(acx,bcx), Math.max(acx,bcx));
        vline(floor, bcx, Math.min(acy,bcy), Math.max(acy,bcy));
      } else {
        vline(floor, acx, Math.min(acy,bcy), Math.max(acy,bcy));
        hline(floor, bcy, Math.min(acx,bcx), Math.max(acx,bcx));
      }
    }
    return {floor, rooms};
  }

  function wallMask(floor){
    const wall = new Uint8Array(COLS*ROWS);
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
      if (floor[y*COLS+x]) continue;
      let has=false;
      for(let dy=-1;dy<=1 && !has;dy++) for(let dx=-1;dx<=1;dx++){
        const nx=x+dx, ny=y+dy;
        if (nx>=0&&nx<COLS&&ny>=0&&ny<ROWS&&floor[ny*COLS+nx]){ has=true; break; }
      }
      if (has) wall[y*COLS+x]=1;
    }
    return wall;
  }

  // ---- 石材紋理：低解析度雜訊放大後上色 ----
  function makeNoiseCanvas(rng, sw, sh){
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(sw, sh);
    // 幾個均勻亂數相加，得到近似常態分布的值，再正規化到 0..255
    let vals = new Float32Array(sw*sh);
    let min=Infinity, max=-Infinity;
    for (let i=0;i<sw*sh;i++){
      let v=0; for(let k=0;k<3;k++) v += rng();
      v = v/3 - 0.5;
      vals[i]=v; if(v<min)min=v; if(v>max)max=v;
    }
    const range = (max-min)||1e-6;
    for (let i=0;i<sw*sh;i++){
      const g = Math.round(((vals[i]-min)/range)*255);
      img.data[i*4]=g; img.data[i*4+1]=g; img.data[i*4+2]=g; img.data[i*4+3]=255;
    }
    ctx.putImageData(img,0,0);
    return c;
  }

  function tintedTexture(rng, base, variance, cell){
    variance = variance===undefined?14:variance;
    cell = cell===undefined?5:cell;
    const sw = Math.max(2, Math.round(W/cell)), sh = Math.max(2, Math.round(H/cell));
    const noiseCanvas = makeNoiseCanvas(rng, sw, sh);
    const up = document.createElement('canvas');
    up.width = W; up.height = H;
    const uctx = up.getContext('2d');
    uctx.imageSmoothingEnabled = true;
    uctx.imageSmoothingQuality = 'high';
    uctx.drawImage(noiseCanvas, 0, 0, W, H);
    const imgData = uctx.getImageData(0,0,W,H);
    const d = imgData.data;
    for (let i=0;i<d.length;i+=4){
      const g = d[i]/255 - 0.5;
      d[i]   = Math.min(255, Math.max(0, base[0] + g*variance));
      d[i+1] = Math.min(255, Math.max(0, base[1] + g*variance));
      d[i+2] = Math.min(255, Math.max(0, base[2] + g*variance));
      d[i+3] = 255;
    }
    uctx.putImageData(imgData,0,0);
    return imgData;
  }

  function rgba(c,a){ return 'rgba('+c[0]+','+c[1]+','+c[2]+','+(a===undefined?1:a)+')'; }

  function drawMortarLines(ctx, rng, color){
    const rowH = SQ/2;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (let ry=0, y=0; y<H; y+=rowH, ry++){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
      const off = (ry%2) ? rowH : 0;
      for (let x=off; x<W; x+=rowH*2){
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x, Math.min(y+rowH,H)); ctx.stroke();
      }
    }
  }

  function scatterCracks(ctx, cells, rng, n, color){
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (let i=0;i<n;i++){
      if (!cells.length) return;
      const [cx,cy] = cells[randInt(rng,0,cells.length)];
      let x0 = cx*SQ + randInt(rng,10,SQ-10), y0 = cy*SQ + randInt(rng,10,SQ-10);
      let ang = randRange(rng,0,Math.PI*2);
      ctx.beginPath(); ctx.moveTo(x0,y0);
      const steps = randInt(rng,2,4);
      for (let s=0;s<steps;s++){
        ang += randRange(rng,-0.9,0.9);
        const len = randRange(rng,6,16);
        x0 += Math.cos(ang)*len; y0 += Math.sin(ang)*len;
        ctx.lineTo(x0,y0);
      }
      ctx.stroke();
    }
  }

  function scatterRubble(ctx, cells, rng, n, color){
    ctx.fillStyle = color;
    for (let i=0;i<n;i++){
      if (!cells.length) return;
      const [cx,cy] = cells[randInt(rng,0,cells.length)];
      const bx = cx*SQ + randInt(rng,8,SQ-8), by = cy*SQ + randInt(rng,8,SQ-8);
      const bits = randInt(rng,3,7);
      for (let b=0;b<bits;b++){
        const ox = bx + randInt(rng,-10,10), oy = by + randInt(rng,-10,10);
        const r = randInt(rng,2,5);
        ctx.beginPath(); ctx.ellipse(ox,oy,r,r,0,0,Math.PI*2); ctx.fill();
      }
    }
  }

  function scatterMoss(ctx, cells, rng, n, color){
    for (let i=0;i<n;i++){
      if (!cells.length) return;
      const [cx,cy] = cells[randInt(rng,0,cells.length)];
      const bx = cx*SQ + randInt(rng,4,SQ-4), by = cy*SQ + randInt(rng,4,SQ-4);
      const bits = randInt(rng,4,9);
      for (let b=0;b<bits;b++){
        const ox = bx + randInt(rng,-8,8), oy = by + randInt(rng,-8,8);
        const r = randInt(rng,2,6);
        ctx.fillStyle = rgba(color, randRange(rng,40,100)/255);
        ctx.beginPath(); ctx.ellipse(ox,oy,r,r,0,0,Math.PI*2); ctx.fill();
      }
    }
  }

  function torchGlow(ctx, spots, radius){
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (const [x,y] of spots){
      const grad = ctx.createRadialGradient(x,y,0, x,y,radius);
      grad.addColorStop(0, 'rgba(255,176,96,0.30)');
      grad.addColorStop(0.55, 'rgba(255,176,96,0.14)');
      grad.addColorStop(1, 'rgba(255,176,96,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(x,y,radius,radius,0,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  let lastRooms = 0, lastSeed = 0, lastTheme = 'dungeon';

  function render(theme, showGrid, showTorch, seed){
    const pal = PALETTES[theme];
    const rng = mulberry32(seed);

    const {floor, rooms} = generateLayout(rng);
    const wall = wallMask(floor);

    const floorCells = [], wallCells = [];
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
      if (floor[y*COLS+x]) floorCells.push([x,y]);
      else if (wall[y*COLS+x]) wallCells.push([x,y]);
    }

    const canvas = document.getElementById('mapCanvas');
    const ctx = canvas.getContext('2d');

    // 先把底色（空無一物的地方）塗滿
    ctx.fillStyle = rgba(pal.void);
    ctx.fillRect(0,0,W,H);

    const floorTex = tintedTexture(rng, pal.floor, 14, 5);
    const wallTex  = tintedTexture(rng, pal.wall, 10, 5);

    // 依格子遮罩從紋理貼出地板與牆（一格一格畫，最多 352 格，成本很低）
    for (const [x,y] of wallCells){
      ctx.drawImage(canvasFrom(wallTex), x*SQ, y*SQ, SQ, SQ, x*SQ, y*SQ, SQ, SQ);
    }
    for (const [x,y] of floorCells){
      ctx.drawImage(canvasFrom(floorTex), x*SQ, y*SQ, SQ, SQ, x*SQ, y*SQ, SQ, SQ);
    }

    drawMortarLines(ctx, rng, rgba(pal.mortar, 90/255));
    scatterCracks(ctx, floorCells, rng, Math.floor(floorCells.length/5), rgba(pal.crack, 130/255));
    scatterRubble(ctx, floorCells, rng, Math.floor(floorCells.length/8), rgba(pal.rubble, 160/255));
    if (pal.moss) scatterMoss(ctx, wallCells, rng, Math.floor(wallCells.length/4), pal.moss);

    if (showTorch){
      const spots = [];
      for (const r of rooms){
        if (r.w>=3 && r.h>=3) spots.push([(r.x+1)*SQ, (r.y+1)*SQ]);
      }
      if (spots.length) torchGlow(ctx, spots, SQ*2);
    }

    if (showGrid){
      ctx.strokeStyle = 'rgba(0,0,0,0.24)'; ctx.lineWidth = 1;
      for (let x=0;x<=W;x+=SQ){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y=0;y<=H;y+=SQ){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    }

    lastRooms = rooms.length; lastSeed = seed; lastTheme = theme;
    document.getElementById('seedLabel').textContent = seed;
    document.getElementById('roomLabel').textContent = rooms.length;
    document.getElementById('themeLabel').textContent = themeName(theme);
  }

  // 合輯：地形名稱改由字典提供（上游是把 id 首字母轉大寫，英文字典的值與它相同）。
  // 每次呼叫時才取字，切換語言後重寫一次即可。
  function themeName(theme){
    return { dungeon: T('theme.dungeon'), cave: T('theme.cave'), crypt: T('theme.crypt') }[theme];
  }

  // 小快取：不必每次 drawImage 都從 ImageData 重建一張離屏 canvas
  let _cacheData=null, _cacheCanvas=null;
  function canvasFrom(imageData){
    if (_cacheData === imageData && _cacheCanvas) return _cacheCanvas;
    const c = document.createElement('canvas');
    c.width = imageData.width; c.height = imageData.height;
    c.getContext('2d').putImageData(imageData,0,0);
    _cacheData = imageData; _cacheCanvas = c;
    return c;
  }

  // ---- 介面的事件綁定 ----
  let currentTheme = 'dungeon';
  const themeSeg = document.getElementById('themeSeg');
  themeSeg.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    [...themeSeg.children].forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentTheme = btn.dataset.theme;
    generate();
  });

  function generate(){
    const showGrid = document.getElementById('gridToggle').checked;
    const showTorch = document.getElementById('torchToggle').checked;
    const seed = Math.floor(Math.random()*1e9);
    render(currentTheme, showGrid, showTorch, seed);
  }

  document.getElementById('genBtn').addEventListener('click', generate);
  document.getElementById('gridToggle').addEventListener('change', ()=>render(lastTheme, document.getElementById('gridToggle').checked, document.getElementById('torchToggle').checked, lastSeed));
  document.getElementById('torchToggle').addEventListener('change', ()=>render(lastTheme, document.getElementById('gridToggle').checked, document.getElementById('torchToggle').checked, lastSeed));

  document.getElementById('dlBtn').addEventListener('click', ()=>{
    const canvas = document.getElementById('mapCanvas');
    const link = document.createElement('a');
    link.download = 'battlemap_'+lastTheme+'_'+lastSeed+'.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  window.addEventListener('keydown', (e)=>{
    // 合輯追加 SELECT：頁首多了語言選單，在選單上打字不該觸發產生或下載。
    if (e.target.tagName==='INPUT' || e.target.tagName==='SELECT') return;
    if (e.key==='g' || e.key==='G') generate();
    if (e.key==='d' || e.key==='D') document.getElementById('dlBtn').click();
  });

  // 合輯：語言切換器。地圖本身不畫任何文字，換語言不必重畫；
  // 程式寫進畫面的只有下方資訊列的地形名稱。
  I18N.mountSwitcher(document.getElementById('localeSelect'));
  I18N.onChange(() => {
    document.getElementById('themeLabel').textContent = themeName(lastTheme);
  });

  generate();
})();
