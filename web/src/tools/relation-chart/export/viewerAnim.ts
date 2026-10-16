/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 互動網頁的時間軸動畫（第五批，F028；原作的 buildViewerTweenFrames 與樣板裡的 animBar 程式）：
 * 有 2 格以上的時間軸分頁＝預先算好的一連串補間畫面（每段 clamp(round(240 ÷ (格數 − 1)), 4, 24) 步）＋下方播放列
 * （▶／❚❚、拖桿、「目前 / 總格數」）。播放照每段秒數與播放速度（原作算了卻沒放進網頁，7.4 第 7 項）；
 * 播到最後一格停、在結尾按播放＝從頭。動畫分頁不做聚焦、搜尋、圖例點擊、遠近簡化（原作）。
 * 整個函式以 toString() 放進匯出的 HTML（只有用到時才放），所以不能引用任何模組、外部變數。
 */

export interface ViewerAnimSheet {
  /** 每一步的 SVG（圖片寫成 data-rcimg="N"） */
  frames: string[];
  steps: number;
  n: number;
  /** 每一段（第 i 格 → 第 i + 1 格）的秒數（已除以播放速度） */
  durs: number[];
}

export interface ViewerAnimData {
  sheets: (ViewerAnimSheet | null)[];
  txt: { play: string; pause: string };
}

/** 給檢視程式的鉤子：這張分頁是動畫（不做聚焦）、換分頁 */
export interface ViewerAnimHooks {
  off(cur: number): boolean;
  tab(cur: number): void;
}

/** 每段幾步（原作：總步數約 240、每段 4～24 步） */
export const animSteps = (n: number): number =>
  Math.max(4, Math.min(24, Math.round(240 / Math.max(1, n - 1))));

export function rcViewerAnim(A: ViewerAnimData, IMGS: string[]): ViewerAnimHooks {
  const doc = document;
  const bar = doc.getElementById('animBar') as HTMLElement;
  const btn = doc.getElementById('animPlay') as HTMLButtonElement;
  const scrub = doc.getElementById('animScrub') as HTMLInputElement;
  const time = doc.getElementById('animTime') as HTMLElement;
  const search = doc.getElementById('rvSearch') as HTMLElement | null;
  let cur = 0;
  const st = { pos: 0, playing: false, raf: 0, last: 0 };
  const curAnim = () => A.sheets[cur] || null;
  const zoomer = () =>
    (doc.querySelectorAll('.sheetV')[cur] as HTMLElement).querySelector('.zoomer') as HTMLElement;
  function show() {
    const a = curAnim();
    if (!a) return;
    const total = (a.n - 1) * a.steps;
    const idx = Math.max(0, Math.min(total, Math.round(st.pos * a.steps)));
    const z = zoomer();
    if (z.getAttribute('data-fi') !== String(idx)) {
      z.innerHTML = a.frames[idx];
      const ims = z.querySelectorAll('image[data-rcimg]');
      for (let i = 0; i < ims.length; i++) {
        const el = ims[i];
        el.setAttribute('href', IMGS[+(el.getAttribute('data-rcimg') || 0)] || '');
        el.removeAttribute('data-rcimg');
      }
      z.setAttribute('data-fi', String(idx));
    }
    if (doc.activeElement !== scrub)
      scrub.value = String(a.n > 1 ? Math.round((st.pos / (a.n - 1)) * 1000) : 0);
    time.textContent = `${Math.min(a.n, Math.floor(st.pos + 1e-6) + 1)} / ${a.n}`;
  }
  function label() {
    btn.textContent = st.playing ? '❚❚' : '▶';
    btn.setAttribute('aria-label', st.playing ? A.txt.pause : A.txt.play);
    btn.title = st.playing ? A.txt.pause : A.txt.play;
  }
  function stop() {
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
    st.playing = false;
    label();
  }
  function step(ts: number) {
    const a = curAnim();
    if (!a || !st.playing) {
      stop();
      return;
    }
    if (!st.last) st.last = ts;
    const dt = Math.min(0.05, (ts - st.last) / 1000);
    st.last = ts;
    const seg = Math.min(a.n - 2, Math.max(0, Math.floor(st.pos)));
    const d = a.durs[seg] || 1 / 0.85;
    st.pos = Math.min(a.n - 1, st.pos + dt / d);
    show();
    if (st.pos >= a.n - 1 - 1e-6) {
      stop();
      return;
    }
    st.raf = requestAnimationFrame(step);
  }
  function play() {
    const a = curAnim();
    if (!a) return;
    if (st.pos >= a.n - 1 - 1e-6) st.pos = 0;
    st.playing = true;
    st.last = 0;
    label();
    st.raf = requestAnimationFrame(step);
  }
  btn.onclick = () => {
    if (st.playing) stop();
    else play();
  };
  scrub.addEventListener('input', () => {
    const a = curAnim();
    if (!a) return;
    stop();
    st.pos = (+scrub.value / 1000) * (a.n - 1);
    show();
  });
  function init() {
    stop();
    st.pos = 0;
    const a = curAnim();
    bar.classList.toggle('show', !!a);
    if (search) search.style.display = a ? 'none' : '';
    if (a) show();
  }
  init();
  return {
    off: (c: number) => !!A.sheets[c],
    tab: (c: number) => {
      cur = c;
      init();
    },
  };
}
