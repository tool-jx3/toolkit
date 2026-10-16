/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 互動網頁的檢視程式（原作 buildViewerHtml 的樣板程式）：整個函式以 toString() 放進匯出的 HTML，
 * 所以**不能引用任何模組、外部變數**，只能用參數 D 與瀏覽器的 API。
 * 拖曳平移、滾輪／雙指縮放、滑過／點選聚焦、角色卡（關係清單、標籤、找關係路徑）、線的資訊、
 * 圖例（只看某一種關係／聚焦角色）、名冊搜尋與標籤篩選、分頁籤。
 */

export interface ViewerRel {
  id: number;
  from: number;
  to: number;
  type: number;
  label: string;
  both: boolean;
  note: string;
}

export interface ViewerSheetData {
  chars: Record<string, string>;
  rels: ViewerRel[];
  /** 角色 id → 標籤 id */
  clbl: Record<string, number[]>;
}

export interface ViewerText {
  self: string;
  pathBtn: string;
  pathHint: string;
  pathNone: string;
  pathSteps: string;
  rosterNone: string;
}

export interface ViewerData {
  sheets: ViewerSheetData[];
  /** 標籤 id → 文字 */
  lnames: Record<string, string>;
  /** 圖片（SVG 裡寫成 rcimg:N） */
  imgs: string[];
  txt: ViewerText;
}

export function rcViewer(D: ViewerData): void {
  const doc = document;
  const $ = (id: string) => doc.getElementById(id) as HTMLElement;
  const stage = $('stageV');
  const tip = $('tipV');
  const rosterEl = $('rosterV');
  const rvList = $('rvList');
  const rvChips = $('rvChips');
  const rvSearch = $('rvSearch') as HTMLInputElement;
  const T = D.txt;
  let cur = 0;
  /** 鎖定的聚焦：角色 id；-1＝鎖定但不是角色（線、圖例、標籤、路徑）；null＝沒有鎖定 */
  let lockedId: number | null = null;
  let lockedType: number | null = null;
  let rvLbl: number | null = null;
  let pathFrom: number | null = null;
  let view = { s: 1, x: 0, y: 0 };

  /* 圖片：同一張只放一次（SVG 裡寫 rcimg:N，載入時換回） */
  const imgs = doc.querySelectorAll('image');
  for (let i = 0; i < imgs.length; i++) {
    const el = imgs[i];
    const h = el.getAttribute('href') || '';
    if (h.indexOf('rcimg:') === 0) el.setAttribute('href', D.imgs[+h.slice(6)] || '');
  }

  const sheetEl = () => doc.querySelectorAll('.sheetV')[cur] as HTMLElement;
  const chartEl = () => sheetEl().querySelector('svg') as SVGSVGElement;
  const zoomerEl = () => sheetEl().querySelector('.zoomer') as HTMLElement;
  const S = () => D.sheets[cur];
  const closest = (t: EventTarget | null, sel: string): HTMLElement | null =>
    t && (t as Element).closest ? ((t as Element).closest(sel) as HTMLElement | null) : null;
  const each = (root: ParentNode, sel: string, fn: (el: HTMLElement) => void) => {
    const list = root.querySelectorAll(sel);
    for (let i = 0; i < list.length; i++) fn(list[i] as HTMLElement);
  };
  const escT = (s: unknown) => {
    const d = doc.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };

  function applyView() {
    zoomerEl().style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`;
  }
  function resetView() {
    view = { s: 1, x: 0, y: 0 };
    applyView();
  }
  function zoomAt(cx: number, cy: number, f: number) {
    const ns = Math.max(0.15, Math.min(8, view.s * f));
    const k = ns / view.s;
    const r = stage.getBoundingClientRect();
    view.x = cx - r.left - (cx - r.left - view.x) * k;
    view.y = cy - r.top - (cy - r.top - view.y) * k;
    view.s = ns;
    applyView();
  }

  function markLegend(attr: string, id: number | null) {
    each(chartEl(), `.legend-item[${attr}]`, (el) => {
      el.classList.toggle('legend-on', id !== null && +(el.getAttribute(attr) || 'NaN') === id);
    });
  }
  function startFocus() {
    const c = chartEl();
    c.classList.add('focus-active');
    each(c, '.focusedV', (el) => el.classList.remove('focusedV'));
    return c;
  }
  function clearFocus() {
    lockedId = null;
    lockedType = null;
    rvLbl = null;
    pathFrom = null;
    const c = chartEl();
    c.classList.remove('focus-active');
    each(c, '.focusedV', (el) => el.classList.remove('focusedV'));
    markLegend('data-legend-type', null);
    markLegend('data-legend-char', null);
    tip.style.display = 'none';
    if (rvList.children.length) renderRoster();
  }
  function lightNodes(c: Element, keep: Record<number, 1>) {
    each(c, '.node', (n) => {
      if (keep[+(n.dataset.id || 'NaN')]) n.classList.add('focusedV');
    });
  }
  function focusNode(id: number) {
    const c = startFocus();
    markLegend('data-legend-type', null);
    markLegend('data-legend-char', id);
    const keep: Record<number, 1> = {};
    keep[id] = 1;
    each(c, '.edge', (eg) => {
      const f = +(eg.dataset.from || 'NaN');
      const t = +(eg.dataset.to || 'NaN');
      if (f === id || t === id) {
        eg.classList.add('focusedV');
        keep[f] = 1;
        keep[t] = 1;
      }
    });
    lightNodes(c, keep);
  }
  function focusType(tid: number) {
    const c = startFocus();
    const keep: Record<number, 1> = {};
    each(c, '.edge', (eg) => {
      if (+(eg.dataset.type || 'NaN') !== tid) return;
      eg.classList.add('focusedV');
      keep[+(eg.dataset.from || 'NaN')] = 1;
      keep[+(eg.dataset.to || 'NaN')] = 1;
    });
    lightNodes(c, keep);
    markLegend('data-legend-type', tid);
    markLegend('data-legend-char', null);
  }
  function focusLabel(lid: number) {
    const c = startFocus();
    markLegend('data-legend-type', null);
    markLegend('data-legend-char', null);
    const keep: Record<number, 1> = {};
    const cl = S().clbl;
    for (const k in cl) if (cl[k].indexOf(lid) >= 0) keep[+k] = 1;
    lightNodes(c, keep);
    each(c, '.edge', (eg) => {
      if (keep[+(eg.dataset.from || 'NaN')] && keep[+(eg.dataset.to || 'NaN')])
        eg.classList.add('focusedV');
    });
  }
  function focusEdge(relid: number) {
    const c = startFocus();
    markLegend('data-legend-type', null);
    markLegend('data-legend-char', null);
    const keep: Record<number, 1> = {};
    each(c, '.edge', (eg) => {
      if (+(eg.dataset.relid || 'NaN') !== relid) return;
      eg.classList.add('focusedV');
      keep[+(eg.dataset.from || 'NaN')] = 1;
      keep[+(eg.dataset.to || 'NaN')] = 1;
    });
    lightNodes(c, keep);
  }

  function placeTip(cx: number, cy: number) {
    tip.style.display = 'block';
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = `${Math.max(6, Math.min(cx + 14, window.innerWidth - w - 6))}px`;
    tip.style.top = `${Math.max(6, Math.min(cy - h - 10, window.innerHeight - h - 6))}px`;
  }
  const relById = (id: number) => {
    const rs = S().rels;
    for (let i = 0; i < rs.length; i++) if (rs[i].id === id) return rs[i];
    return null;
  };
  function showEdgeTip(relid: number, cx: number, cy: number) {
    const rel = relById(relid);
    if (!rel) return;
    const ch = S().chars;
    const arrow = rel.both ? ' ⇄ ' : ' → ';
    tip.innerHTML = `${escT(ch[rel.from] ?? '?')}${arrow}<b>${escT(rel.label)}</b>${arrow}${escT(ch[rel.to] ?? '?')}${rel.note ? `<div class="tn">${escT(rel.note)}</div>` : ''}`;
    placeTip(cx, cy);
  }
  function showCharTip(id: number, cx: number, cy: number) {
    const sh = S();
    const ch = sh.chars;
    let rows = '';
    for (const r of sh.rels) {
      if (r.from !== id && r.to !== id) continue;
      const self = r.from === r.to;
      const mine = r.from === id;
      const other = self ? T.self : ch[mine ? r.to : r.from];
      if (other === undefined) continue;
      const arrow = self ? ' ↻ ' : r.both ? ' ⇄ ' : mine ? ' → ' : ' ← ';
      rows += `<div class="tr"><span class="ta">${escT(arrow)}</span><b>${escT(r.label)}</b><span class="to">${escT(other)}</span></div>`;
    }
    let chips = '';
    for (const lid of sh.clbl[id] || []) {
      const t = D.lnames[lid];
      if (t !== undefined) chips += `<span class="tl" data-lbl="${lid}">${escT(t)}</span>`;
    }
    const pb = sh.rels.length
      ? `<button type="button" class="ti-btn" data-path="${id}">${escT(T.pathBtn)}</button>`
      : '';
    if (!rows && !chips && !pb) {
      tip.style.display = 'none';
      return;
    }
    tip.innerHTML = `<b>${escT(ch[id] ?? '')}</b>${rows ? `<div class="trs">${rows}</div>` : ''}${chips ? `<div class="tls">${chips}</div>` : ''}${pb}`;
    placeTip(cx, cy);
  }

  /* 找關係路徑：不分方向的 BFS（自我關係不算） */
  function runPath(a: number, b: number, cx: number, cy: number) {
    const sh = S();
    const adj: Record<number, ViewerRel[]> = {};
    for (const r of sh.rels) {
      if (r.from === r.to) continue;
      if (!adj[r.from]) adj[r.from] = [];
      if (!adj[r.to]) adj[r.to] = [];
      adj[r.from].push(r);
      adj[r.to].push(r);
    }
    const prev: Record<number, { from: number; e: ViewerRel } | null> = {};
    prev[a] = null;
    const q = [a];
    let found = false;
    while (q.length && !found) {
      const cn = q.shift() as number;
      for (const ed of adj[cn] || []) {
        const nx = ed.from === cn ? ed.to : ed.from;
        if (prev[nx] !== undefined) continue;
        prev[nx] = { from: cn, e: ed };
        if (nx === b) {
          found = true;
          break;
        }
        q.push(nx);
      }
    }
    const ch = sh.chars;
    lockedId = -1;
    lockedType = null;
    const c = chartEl();
    each(c, '.focusedV', (el) => el.classList.remove('focusedV'));
    markLegend('data-legend-type', null);
    markLegend('data-legend-char', null);
    const head = `<b>${escT(ch[a] ?? '?')} ⋯ ${escT(ch[b] ?? '?')}</b>`;
    if (!found) {
      c.classList.remove('focus-active');
      tip.innerHTML = `${head}<div class="tn">${escT(T.pathNone)}</div>`;
      placeTip(cx, cy);
      return;
    }
    const steps: { to: number; e: ViewerRel }[] = [];
    let n = b;
    for (let p = prev[n]; p; p = prev[n]) {
      steps.unshift({ to: n, e: p.e });
      n = p.from;
    }
    c.classList.add('focus-active');
    const keep: Record<number, 1> = {};
    keep[a] = 1;
    const rid: Record<number, 1> = {};
    for (const s of steps) {
      keep[s.to] = 1;
      rid[s.e.id] = 1;
    }
    each(c, '.edge', (eg) => {
      if (rid[+(eg.dataset.relid || 'NaN')]) eg.classList.add('focusedV');
    });
    lightNodes(c, keep);
    let rows = '';
    for (const s of steps)
      rows += `<div class="tr"><span class="ta">—</span><b>${escT(s.e.label)}</b><span class="to">${escT(ch[s.to] ?? '?')}</span></div>`;
    tip.innerHTML = `${head}<div class="tsub">${steps.length}${escT(T.pathSteps)}</div><div class="trs">${rows}</div>`;
    placeTip(cx, cy);
  }

  doc.addEventListener('click', (e) => {
    const pbEl = closest(e.target, '.ti-btn[data-path]');
    if (pbEl) {
      pathFrom = +(pbEl.getAttribute('data-path') || 'NaN');
      tip.innerHTML = `<b>${escT(S().chars[pathFrom] ?? '')} ⋯ ?</b><div class="tn">${escT(T.pathHint)}</div>`;
      return;
    }
    const tl = closest(e.target, '#tipV .tl[data-lbl]');
    if (tl) {
      const lid = +(tl.getAttribute('data-lbl') || 'NaN');
      tip.style.display = 'none';
      pathFrom = null;
      lockedId = -1;
      lockedType = null;
      focusLabel(lid);
    }
  });

  /* ---- 名冊（搜尋框的下拉清單）---- */
  function rosterData() {
    const sh = S();
    const deg: Record<number, number> = {};
    for (const r of sh.rels) {
      deg[r.from] = (deg[r.from] || 0) + 1;
      if (r.to !== r.from) deg[r.to] = (deg[r.to] || 0) + 1;
    }
    const out: { id: number; name: string; deg: number }[] = [];
    each(chartEl(), '.node[data-id]', (n) => {
      const id = +(n.dataset.id || 'NaN');
      out.push({ id, name: sh.chars[id] ?? '', deg: deg[id] || 0 });
    });
    return out;
  }
  function renderChips() {
    const cl = S().clbl;
    const present: Record<string, 1> = {};
    for (const k in cl) for (const l of cl[k]) present[l] = 1;
    const lids = Object.keys(D.lnames).filter((l) => present[l]);
    if (!lids.length) {
      rvChips.style.display = 'none';
      rvChips.innerHTML = '';
      return;
    }
    rvChips.style.display = '';
    rvChips.innerHTML = lids
      .map(
        (l) =>
          `<button type="button" class="rv-chip${rvLbl === +l ? ' on' : ''}" data-rvl="${l}">${escT(D.lnames[l])}</button>`,
      )
      .join('');
  }
  function renderRoster() {
    renderChips();
    const q = (rvSearch.value || '').trim().toLowerCase();
    const cl = S().clbl;
    const rows = rosterData().filter(
      (r) =>
        (!q || r.name.toLowerCase().indexOf(q) >= 0) &&
        (rvLbl === null || (cl[r.id] || []).indexOf(rvLbl) >= 0),
    );
    if (!rows.length) {
      rvList.innerHTML = `<div class="rv-empty">${escT(T.rosterNone)}</div>`;
      return;
    }
    rvList.innerHTML = rows
      .map(
        (r) =>
          `<button type="button" class="rv-item${lockedId === r.id ? ' on' : ''}" data-rv="${r.id}"><span class="rv-name">${escT(r.name)}</span><span class="rv-deg">${r.deg}</span></button>`,
      )
      .join('');
  }
  function centerOnNode(id: number) {
    const n = chartEl().querySelector(`.node[data-id="${id}"]`);
    if (!n) return;
    const r = n.getBoundingClientRect();
    const st = stage.getBoundingClientRect();
    if (!r.width && !r.height) return;
    view.x += st.left + st.width / 2 - (r.left + r.width / 2);
    view.y += st.top + st.height / 2 - (r.top + r.height / 2);
    applyView();
  }
  function toggleRoster(on?: boolean) {
    const show = on === undefined ? !rosterEl.classList.contains('show') : on;
    rosterEl.classList.toggle('show', show);
    if (!show) return;
    renderRoster();
    const r = rvSearch.getBoundingClientRect();
    const w = rosterEl.getBoundingClientRect().width;
    rosterEl.style.top = `${r.bottom + 6}px`;
    rosterEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  }
  function pickRoster(id: number) {
    tip.style.display = 'none';
    pathFrom = null;
    lockedId = id;
    lockedType = null;
    focusNode(id);
    centerOnNode(id);
    renderRoster();
    if (window.innerWidth < 640) {
      toggleRoster(false);
      rvSearch.blur();
    }
  }
  rosterEl.addEventListener('click', (e) => {
    const it = closest(e.target, '.rv-item');
    if (it) {
      pickRoster(+(it.dataset.rv || 'NaN'));
      return;
    }
    const chip = closest(e.target, '.rv-chip');
    if (!chip) return;
    const lid = +(chip.dataset.rvl || 'NaN');
    tip.style.display = 'none';
    pathFrom = null;
    if (rvLbl === lid) {
      clearFocus();
      renderRoster();
      return;
    }
    rvLbl = lid;
    lockedId = -1;
    lockedType = null;
    focusLabel(lid);
    renderRoster();
  });
  rvSearch.addEventListener('focus', () => toggleRoster(true));
  rvSearch.addEventListener('input', () => {
    toggleRoster(true);
    renderRoster();
  });
  rvSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleRoster(false);
      rvSearch.blur();
      return;
    }
    if (e.key !== 'Enter') return;
    const first = rvList.querySelector('.rv-item') as HTMLElement | null;
    if (first) pickRoster(+(first.dataset.rv || 'NaN'));
  });
  doc.addEventListener(
    'pointerdown',
    (e) => {
      if (!rosterEl.classList.contains('show')) return;
      if (e.target === rvSearch || closest(e.target, '#rosterV')) return;
      toggleRoster(false);
    },
    true,
  );

  /* ---- 滑過＝暫時聚焦（沒有鎖定時）---- */
  stage.addEventListener('pointerover', (e) => {
    if (lockedId !== null || lockedType !== null || pathFrom !== null) return;
    const n = closest(e.target, '.node');
    if (n) focusNode(+(n.dataset.id || 'NaN'));
  });
  stage.addEventListener('pointerout', (e) => {
    if (lockedId !== null || lockedType !== null || pathFrom !== null) return;
    const n = closest(e.target, '.node');
    if (n && !closest(e.relatedTarget, '.node')) clearFocus();
  });

  /* ---- 平移、縮放、點擊 ---- */
  const pts = new Map<number, { x: number; y: number; t: EventTarget | null }>();
  let panStart: { x: number; y: number } | null = null;
  let pinchD = 0;
  let moved = false;
  stage.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.target });
    moved = false;
    if (pts.size === 1) {
      panStart = { x: e.clientX - view.x, y: e.clientY - view.y };
      stage.classList.add('panning');
    } else if (pts.size === 2) {
      const a = Array.from(pts.values());
      pinchD = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      panStart = null;
    }
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (_err) {
      /* 捕捉失敗不影響其他操作 */
    }
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) moved = true;
    if (!moved && pts.size === 1) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 1 && panStart) {
      view.x = e.clientX - panStart.x;
      view.y = e.clientY - panStart.y;
      applyView();
    } else if (pts.size === 2) {
      const a = Array.from(pts.values());
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if (pinchD > 0 && d > 0) zoomAt((a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2, d / pinchD);
      pinchD = d;
    }
  });
  function endPt(e: PointerEvent) {
    const p = pts.get(e.pointerId);
    const wasTap = !!p && !moved && pts.size === 1;
    const tgt = p ? p.t : null;
    pts.delete(e.pointerId);
    if (!pts.size) {
      panStart = null;
      stage.classList.remove('panning');
    }
    if (!wasTap) return;
    if (pathFrom !== null) {
      const pn = closest(tgt, '.node[data-id]');
      const pf = pathFrom;
      pathFrom = null;
      if (pn && +(pn.dataset.id || 'NaN') !== pf) {
        runPath(pf, +(pn.dataset.id || 'NaN'), e.clientX, e.clientY);
        return;
      }
      clearFocus();
      return;
    }
    const lgt = closest(tgt, '.legend-item[data-legend-type]');
    const lgc = closest(tgt, '.legend-item[data-legend-char]');
    const n = closest(tgt, '.node');
    const eg = closest(tgt, '.edge');
    tip.style.display = 'none';
    if (lgt) {
      const tid = +(lgt.getAttribute('data-legend-type') || 'NaN');
      if (lockedType === tid) clearFocus();
      else {
        lockedType = tid;
        lockedId = -1;
        focusType(tid);
      }
    } else if (lgc) {
      const cid = +(lgc.getAttribute('data-legend-char') || 'NaN');
      if (lockedId === cid) clearFocus();
      else {
        lockedId = cid;
        lockedType = null;
        focusNode(cid);
      }
    } else if (n) {
      const id = +(n.dataset.id || 'NaN');
      if (lockedId === id) clearFocus();
      else {
        lockedId = id;
        lockedType = null;
        focusNode(id);
        showCharTip(id, e.clientX, e.clientY);
      }
    } else if (eg) {
      const rid = +(eg.dataset.relid || 'NaN');
      lockedId = -1;
      lockedType = null;
      focusEdge(rid);
      showEdgeTip(rid, e.clientX, e.clientY);
    } else clearFocus();
  }
  stage.addEventListener('pointerup', endPt);
  stage.addEventListener('pointercancel', (e) => {
    pts.delete(e.pointerId);
    if (!pts.size) {
      panStart = null;
      stage.classList.remove('panning');
    }
  });
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    },
    { passive: false },
  );
  stage.addEventListener('dblclick', resetView);
  const zoomCenter = (f: number) => {
    const r = stage.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  };
  $('zIn').onclick = () => zoomCenter(1.25);
  $('zOut').onclick = () => zoomCenter(1 / 1.25);
  $('zReset').onclick = resetView;
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && doc.activeElement !== rvSearch) clearFocus();
  });
  each(doc, '.tabV', (b) => {
    b.onclick = () => {
      clearFocus();
      cur = +(b.dataset.i || '0');
      each(doc, '.tabV', (x) => x.classList.toggle('active', x === b));
      const all = doc.querySelectorAll('.sheetV');
      for (let i = 0; i < all.length; i++) all[i].classList.toggle('active', i === cur);
      rvSearch.value = '';
      rvList.innerHTML = '';
      resetView();
    };
  });
  applyView();
}
