/**
 * 調查熱點圖的遊玩畫面（規格 3.2、3.3）：場景與熱點、線索卡、已找到的線索、進度、顯示所有熱點、重來、記住進度。
 *
 * 工具的試玩、分享連結的畫面、匯出的互動 HTML 用的是**同一份**：匯出時 `mountClueMap.toString()` 原樣放進 `<script>`。
 * 所以這個函式**不可以用到函式外面的任何東西**（import、模組層的常數與函式）；型別宣告會在編譯時拿掉，可以放在外面。
 * 介面文字、圖片網址、設定都從 `cfg` 帶入；使用者的文字一律用 `textContent`。
 * 出現條件的規則（`unlocked`）在 model.ts 的 `isUnlocked` 有一份一樣的，單元測試比對。
 */

export interface PlaySpot {
  id: string;
  /** 編號（從 1 開始） */
  n: number;
  name: string;
  shape: 'rect' | 'ellipse';
  /** 相對於場景圖的 %（左上角與大小） */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  check: string;
  /** 圖片表的索引（-1：沒有圖片） */
  image: number;
  /** 出現條件：要先找到的熱點代號（空＝一開始就看得到） */
  req: string[];
  mode: 'all' | 'any';
  hidden: boolean;
}

export interface PlayLook {
  theme: 'dark' | 'light';
  marker: 'outline' | 'pin' | 'none';
  accent: string;
  /** 熱點顏色上的文字色（編號圓標） */
  accentFg: string;
  foundColor: string;
  foundFg: string;
  foundMark: 'both' | 'check' | 'color' | 'none';
  names: boolean;
  progress: 'count' | 'found' | 'off';
  reveal: boolean;
}

export interface PlayLabels {
  region: string;
  sceneLabel: string;
  sceneAlt: string;
  empty: string;
  noClue: string;
  check: string;
  close: string;
  cardLabel: string;
  clue: string;
  progress: string;
  progressFound: string;
  complete: string;
  reveal: string;
  reset: string;
  resetConfirm: string;
  foundTitle: string;
  foundEmpty: string;
  unlocked: string;
  lockedHint: string;
  anyOf: string;
  foundSuffix: string;
  spotDefault: string;
}

export interface ClueMapConfig {
  title: string;
  intro: string;
  /** 圖片表（src；同一張只放一份） */
  images: string[];
  /** 場景圖在圖片表裡的索引（-1：沒有圖） */
  scene: number;
  spots: PlaySpot[];
  look: PlayLook;
  labels: PlayLabels;
  /** 進度的儲存鍵（null：不記） */
  storageKey: string | null;
  /** 一開始就已經找到的（試玩重新掛載時帶回進度；給了就不讀儲存） */
  initialFound?: string[];
}

export interface ClueMapState {
  found: string[];
  revealing: boolean;
}

export interface ClueMapHooks {
  onChange?: (state: ClueMapState) => void;
}

export interface ClueMapHandle {
  /** 清除所有找到（不經過確認） */
  reset(): void;
  /** 顯示／隱藏所有熱點 */
  setReveal(on: boolean): void;
  isRevealing(): boolean;
  /** 已找到的熱點代號（找到的先後順序） */
  found(): string[];
  /** 翻出某個熱點的線索卡（沒找到的不會翻；null：關閉） */
  open(id: string | null): void;
  destroy(): void;
}

export function mountClueMap(
  root: HTMLElement,
  cfg: ClueMapConfig,
  hooks?: ClueMapHooks,
): ClueMapHandle {
  const doc = root.ownerDocument;
  const L = cfg.labels;
  const look = cfg.look;
  const spots = cfg.spots;
  const byId: Record<string, PlaySpot> = {};
  for (const s of spots) byId[s.id] = s;

  /* ---------- 狀態 ---------- */
  let found: string[] = [];
  let foundSet: Record<string, boolean> = {};
  let revealing = false;
  let current: string | null = null;
  let lastFocus: HTMLElement | null = null;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | null = null;
  const flashTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  let alive = true;

  const fmt = (t: string, o: Record<string, string | number>): string =>
    t.replace(/\{(\w+)\}/g, (_m, k: string) => (k in o ? String(o[k]) : ''));
  const nameOf = (s: PlaySpot): string => s.name || fmt(L.spotDefault, { n: s.n });

  /** 條件成立：all＝要求的熱點全部已找到；any＝至少一個已找到；沒有條件＝成立 */
  const unlocked = (s: PlaySpot): boolean => {
    const r = s.req;
    if (!r.length) return true;
    let n = 0;
    for (const id of r) if (foundSet[id]) n++;
    return s.mode === 'any' ? n > 0 : n === r.length;
  };
  const visible = (s: PlaySpot): boolean => !!foundSet[s.id] || unlocked(s);

  /** 線索文字分段：空行分段，段內的換行保留 */
  const splitParas = (t: string): string[] =>
    String(t || '')
      .replace(/\r\n?/g, '\n')
      .split(/\n[ \t]*\n(?:[ \t]*\n)*/)
      .map((p) => p.replace(/^\n+|\n+$/g, ''))
      .filter((p) => p.trim() !== '');

  /* ---------- 進度的儲存 ---------- */
  const save = (): void => {
    if (!cfg.storageKey) return;
    try {
      if (found.length) localStorage.setItem(cfg.storageKey, JSON.stringify({ v: 1, found }));
      else localStorage.removeItem(cfg.storageKey);
    } catch (_e) {
      /* 記不下來（隱私模式等）時照常玩 */
    }
  };
  const loadSaved = (): string[] => {
    if (cfg.initialFound) return cfg.initialFound;
    if (!cfg.storageKey) return [];
    try {
      const raw = localStorage.getItem(cfg.storageKey);
      if (!raw) return [];
      const d = JSON.parse(raw);
      return d && d.v === 1 && Array.isArray(d.found) ? d.found : [];
    } catch (_e) {
      return [];
    }
  };
  for (const id of loadSaved()) {
    if (typeof id === 'string' && byId[id] && !foundSet[id]) {
      foundSet[id] = true;
      found.push(id);
    }
  }

  /* ---------- 畫面 ---------- */
  const el = (tag: string, cls?: string, text?: string): HTMLElement => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const button = (cls: string, text?: string): HTMLButtonElement => {
    const b = el('button', cls, text) as HTMLButtonElement;
    b.type = 'button';
    return b;
  };
  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  root.textContent = '';
  root.classList.add('cm');
  root.setAttribute('data-cm', 'root');
  root.setAttribute('data-theme', look.theme);
  root.setAttribute('data-marker', look.marker);
  root.setAttribute('data-found-mark', look.foundMark);
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', cfg.title || L.region);
  root.style.setProperty('--cm-accent', look.accent);
  root.style.setProperty('--cm-accent-fg', look.accentFg);
  root.style.setProperty('--cm-found', look.foundColor);
  root.style.setProperty('--cm-found-fg', look.foundFg);

  if (cfg.title || cfg.intro) {
    const head = el('header', 'cm-head');
    if (cfg.title) head.appendChild(el('h2', 'cm-title', cfg.title));
    if (cfg.intro) head.appendChild(el('p', 'cm-intro', cfg.intro));
    root.appendChild(head);
  }

  const bar = el('div', 'cm-bar');
  const progressEl = el('span', 'cm-progress');
  progressEl.setAttribute('role', 'status');
  const noteEl = el('span', 'cm-note');
  noteEl.setAttribute('role', 'status');
  const tools = el('div', 'cm-tools');
  const revealBtn = button('cm-btn cm-reveal', L.reveal);
  revealBtn.setAttribute('aria-pressed', 'false');
  const resetBtn = button('cm-btn cm-reset', L.reset);
  if (look.reveal) tools.appendChild(revealBtn);
  tools.appendChild(resetBtn);
  if (look.progress !== 'off') bar.appendChild(progressEl);
  bar.appendChild(noteEl);
  bar.appendChild(tools);
  root.appendChild(bar);

  const main = el('div', 'cm-main');
  const scene = el('div', 'cm-scene');
  scene.setAttribute('role', 'group');
  scene.setAttribute('aria-label', L.sceneLabel);
  scene.setAttribute('data-cm', 'scene');
  const sceneSrc = cfg.scene >= 0 ? cfg.images[cfg.scene] : '';
  if (sceneSrc) {
    const img = el('img', 'cm-img') as HTMLImageElement;
    img.alt = L.sceneAlt;
    img.draggable = false;
    img.src = sceneSrc;
    scene.appendChild(img);
  } else {
    scene.appendChild(el('div', 'cm-blank'));
  }
  const layer = el('div', 'cm-layer');
  const tagLayer = el('div', 'cm-tags');
  tagLayer.setAttribute('aria-hidden', 'true');

  interface SpotNode {
    btn: HTMLButtonElement;
    tag: HTMLElement;
    dot: HTMLElement;
    ring: HTMLElement;
    mark: HTMLElement;
    badge: HTMLElement;
    lockedHint: string;
  }
  const nodes: Record<string, SpotNode> = {};
  for (const s of spots) {
    const btn = button('cm-spot');
    btn.setAttribute('data-spot', s.id);
    btn.setAttribute('data-shape', s.shape);
    btn.style.left = `${s.x + s.w / 2}%`;
    btn.style.top = `${s.y + s.h / 2}%`;
    btn.style.width = `${s.w}%`;
    btn.style.height = `${s.h}%`;
    const ring = el('span', 'cm-ring');
    const dot = el('span', 'cm-dot');
    const mark = el('span', 'cm-mark');
    mark.innerHTML = CHECK_SVG;
    const badge = el('span', 'cm-badge', String(s.n));
    btn.append(ring, dot, mark, badge);
    const tag = el('span', 'cm-tag', nameOf(s));
    tag.style.left = `${s.x + s.w / 2}%`;
    tag.style.top = `${s.y}%`;
    const names = s.req
      .map((id) => byId[id])
      .filter(Boolean)
      .map((r) => nameOf(r));
    const lockedHint = fmt(L.lockedHint, {
      names:
        s.mode === 'any' && names.length > 1
          ? fmt(L.anyOf, { names: names.join('、') })
          : names.join('、'),
    });
    nodes[s.id] = { btn, tag, dot, ring, mark, badge, lockedHint };
    btn.addEventListener('click', () => activate(s, btn));
    layer.appendChild(btn);
    tagLayer.appendChild(tag);
  }
  scene.append(layer, tagLayer);

  const side = el('aside', 'cm-side');
  const card = el('section', 'cm-card');
  card.setAttribute('data-cm', 'card');
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('aria-label', L.cardLabel);
  const foundBox = el('section', 'cm-found');
  foundBox.setAttribute('data-cm', 'found');
  side.append(card, foundBox);
  main.append(scene, side);
  root.appendChild(main);

  /* ---------- 繪製 ---------- */
  const renderProgress = (): void => {
    const total = spots.length;
    const complete = total > 0 && found.length === total;
    root.toggleAttribute('data-complete', complete);
    if (look.progress === 'off') return;
    progressEl.textContent = complete
      ? L.complete
      : look.progress === 'count'
        ? fmt(L.progress, { n: found.length, m: total })
        : fmt(L.progressFound, { n: found.length });
  };

  const renderSpots = (): void => {
    for (const s of spots) {
      const nd = nodes[s.id];
      const isFound = !!foundSet[s.id];
      const open = isFound || unlocked(s);
      const state = isFound ? 'found' : open ? 'ready' : 'locked';
      const secret = s.hidden && state === 'ready';
      let vis = 'none';
      let tone = 'accent';
      let dashed = false;
      let check = false;
      if (state === 'locked') {
        if (revealing) {
          vis = 'ring';
          tone = 'locked';
          dashed = true;
        }
      } else if (state === 'found') {
        if (look.foundMark === 'none') {
          if (!(s.hidden || look.marker === 'none')) vis = look.marker === 'pin' ? 'dot' : 'ring';
          else if (revealing) vis = 'ring';
          dashed = s.hidden && vis !== 'none';
        } else {
          vis = look.marker === 'pin' ? 'dot' : 'ring';
          tone = look.foundMark === 'check' ? 'accent' : 'found';
          check = look.foundMark === 'both' || look.foundMark === 'check';
        }
      } else if (s.hidden || look.marker === 'none') {
        if (revealing) {
          vis = 'ring';
          dashed = s.hidden;
        }
      } else {
        vis = look.marker === 'pin' ? 'dot' : 'ring';
      }
      const b = nd.btn;
      b.setAttribute('data-state', state);
      b.setAttribute('data-vis', vis);
      b.setAttribute('data-tone', tone);
      if (dashed) b.setAttribute('data-dashed', '1');
      else b.removeAttribute('data-dashed');
      if (check) b.setAttribute('data-check', '1');
      else b.removeAttribute('data-check');
      if (s.hidden) b.setAttribute('data-hidden', '1');
      else b.removeAttribute('data-hidden');
      b.toggleAttribute('data-num', revealing && vis !== 'none');
      /* 還沒解鎖：不在畫面上（顯示所有熱點時是灰色虛線，不能點） */
      const shown = state !== 'locked' || revealing;
      b.hidden = !shown;
      nd.tag.hidden = !(look.names && vis !== 'none' && state !== 'locked' && !secret);
      const interactive = state !== 'locked';
      b.setAttribute('aria-disabled', interactive ? 'false' : 'true');
      /* 隱藏熱點（沒找到）不在鍵盤順序、不給讀屏看；找到之後才是一般的按鈕 */
      if (!interactive || secret) b.tabIndex = -1;
      else b.removeAttribute('tabindex');
      if (secret) b.setAttribute('aria-hidden', 'true');
      else b.removeAttribute('aria-hidden');
      b.setAttribute('aria-label', isFound ? nameOf(s) + L.foundSuffix : nameOf(s));
      if (state === 'locked') b.title = nd.lockedHint;
      else b.removeAttribute('title');
    }
  };

  const renderFound = (): void => {
    foundBox.textContent = '';
    foundBox.appendChild(el('h3', 'cm-found-title', fmt(L.foundTitle, { n: found.length })));
    if (!found.length) {
      foundBox.appendChild(el('p', 'cm-found-empty', L.foundEmpty));
      return;
    }
    const ol = el('ol', 'cm-found-list');
    for (const id of found) {
      const s = byId[id];
      const li = el('li');
      const b = button('cm-found-item');
      b.setAttribute('data-found-item', id);
      if (current === id) b.setAttribute('aria-current', 'true');
      b.append(el('span', 'cm-num', String(s.n)), el('span', 'cm-found-name', nameOf(s)));
      b.addEventListener('click', () => {
        lastFocus = b;
        openCard(id);
        flash(id);
      });
      li.appendChild(b);
      ol.appendChild(li);
    }
    foundBox.appendChild(ol);
  };

  const renderCard = (): void => {
    card.textContent = '';
    const s = current ? byId[current] : null;
    if (!s) {
      card.setAttribute('data-empty', '1');
      card.appendChild(el('p', 'cm-empty', L.empty));
      return;
    }
    card.removeAttribute('data-empty');
    card.setAttribute('data-card', s.id);
    const head = el('div', 'cm-card-head');
    const titleBox = el('div', 'cm-card-title');
    titleBox.append(
      el('span', 'cm-kicker', fmt(L.clue, { n: s.n })),
      el('h3', 'cm-card-name', nameOf(s)),
    );
    const close = button('cm-close', '×');
    close.setAttribute('aria-label', L.close);
    close.addEventListener('click', () => closeCard());
    head.append(el('span', 'cm-num', String(s.n)), titleBox, close);
    card.appendChild(head);
    const src = s.image >= 0 ? cfg.images[s.image] : '';
    if (src) {
      const im = el('img', 'cm-card-img') as HTMLImageElement;
      im.alt = nameOf(s);
      im.src = src;
      card.appendChild(im);
    }
    const paras = splitParas(s.text);
    for (const para of paras) {
      const p = el('p', 'cm-text');
      para.split('\n').forEach((line, i) => {
        if (i) p.appendChild(doc.createElement('br'));
        p.appendChild(doc.createTextNode(line));
      });
      card.appendChild(p);
    }
    if (!paras.length && !src && !s.check) card.appendChild(el('p', 'cm-flavor', L.noClue));
    if (s.check) {
      const c = el('p', 'cm-check');
      c.append(el('strong', undefined, `${L.check}：`), doc.createTextNode(s.check));
      card.appendChild(c);
    }
  };

  const emit = (): void => {
    if (hooks?.onChange) hooks.onChange({ found: found.slice(), revealing });
  };

  const renderAll = (): void => {
    renderSpots();
    renderProgress();
    renderFound();
    renderCard();
    revealBtn.setAttribute('aria-pressed', revealing ? 'true' : 'false');
  };

  /* ---------- 動作 ---------- */
  const flash = (id: string): void => {
    const nd = nodes[id];
    if (!nd) return;
    nd.btn.removeAttribute('data-flash');
    void nd.btn.offsetWidth;
    nd.btn.setAttribute('data-flash', '1');
    if (flashTimers[id]) clearTimeout(flashTimers[id]);
    flashTimers[id] = setTimeout(() => nd.btn.removeAttribute('data-flash'), 900);
  };

  const showCardInView = (): void => {
    if (typeof card.scrollIntoView !== 'function') return;
    const a = scene.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    /* 左右排列時線索卡本來就看得到 */
    if (b.top < a.bottom - 1) return;
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };

  const openCard = (id: string | null): void => {
    if (id && !(byId[id] && foundSet[id])) return;
    current = id;
    renderFound();
    renderCard();
    if (id) showCardInView();
  };

  const closeCard = (): void => {
    current = null;
    renderFound();
    renderCard();
    const target = lastFocus;
    if (target && root.contains(target) && !target.hidden && target.tabIndex !== -1) target.focus();
  };

  const setNote = (text: string): void => {
    noteEl.textContent = text;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = text ? setTimeout(() => (noteEl.textContent = ''), 5000) : null;
  };

  const activate = (s: PlaySpot, from: HTMLElement | null): void => {
    if (!visible(s)) return;
    lastFocus = from;
    const first = !foundSet[s.id];
    let before: Record<string, boolean> | null = null;
    if (first) {
      before = {};
      for (const o of spots) before[o.id] = visible(o);
      foundSet[s.id] = true;
      found.push(s.id);
    }
    current = s.id;
    renderAll();
    if (first && before) {
      let fresh = 0;
      for (const o of spots) if (!before[o.id] && visible(o) && !o.hidden) fresh++;
      setNote(fresh ? fmt(L.unlocked, { n: fresh }) : '');
      for (const o of spots) {
        if (!before[o.id] && visible(o)) nodes[o.id].btn.setAttribute('data-new', '1');
      }
      save();
    }
    showCardInView();
    emit();
  };

  const doReset = (): void => {
    found = [];
    foundSet = {};
    current = null;
    revealing = false;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = null;
    resetBtn.textContent = L.reset;
    resetBtn.removeAttribute('data-confirm');
    setNote('');
    for (const s of spots) nodes[s.id].btn.removeAttribute('data-new');
    renderAll();
    save();
    emit();
  };

  revealBtn.addEventListener('click', () => {
    revealing = !revealing;
    renderAll();
    emit();
  });
  resetBtn.addEventListener('click', () => {
    if (!found.length && !revealing && !current) return;
    if (resetBtn.hasAttribute('data-confirm')) {
      doReset();
      return;
    }
    resetBtn.setAttribute('data-confirm', '1');
    resetBtn.textContent = L.resetConfirm;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetBtn.removeAttribute('data-confirm');
      resetBtn.textContent = L.reset;
    }, 3000);
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && current && !e.defaultPrevented) {
      e.preventDefault();
      closeCard();
    }
  };
  root.addEventListener('keydown', onKey);

  renderAll();

  return {
    reset: doReset,
    setReveal(on: boolean) {
      revealing = !!on;
      renderAll();
      emit();
    },
    isRevealing: () => revealing,
    found: () => found.slice(),
    open(id: string | null) {
      openCard(id);
    },
    destroy() {
      if (!alive) return;
      alive = false;
      if (resetTimer) clearTimeout(resetTimer);
      if (noteTimer) clearTimeout(noteTimer);
      for (const k of Object.keys(flashTimers)) clearTimeout(flashTimers[k]);
      root.removeEventListener('keydown', onKey);
      root.textContent = '';
      root.classList.remove('cm');
      for (const a of [
        'data-cm',
        'data-theme',
        'data-marker',
        'data-found-mark',
        'data-complete',
        'role',
        'aria-label',
      ])
        root.removeAttribute(a);
    },
  };
}
