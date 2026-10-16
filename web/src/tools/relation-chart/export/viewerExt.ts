/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 互動網頁第三批的部分（原作 buildViewerHtml 的 anyInfo／anyRadar／anyViews 段）：角色卡的「資訊 ›」「雷達 ›」、
 * 右側的文件窗格（角色資訊、每份範本的圖與「比較對象」）、看法氣泡（聚焦角色＝對他寫過看法的人頭上各一個；
 * 聚焦一條線＝兩端各浮對彼此的）、線的提示卡多兩端的看法。
 * 和 viewerRuntime 一樣整個函式以 toString() 放進 HTML（不能引用模組、外部變數）；圖表的畫法（rcCharts）另外傳進來。
 * 有用到才放進檔案：沒有資訊、數值、看法的圖，輸出逐位元組不變。
 */
import type { ChartKit, ChartTpl } from '../engine/charts';
import type { ViewerData } from './viewerRuntime';

export interface ViewerExtSheet {
  /** 角色 id → 文件索引 */
  cinfo?: Record<string, number>;
  /** 角色 id → 自訂外框色＋各狀態（範本、狀態名、數值） */
  crad?: Record<string, { c: string; s: { t: number; s: string; v: Record<string, number> }[] }>;
  /** 說話者 id → { 對象 id → 看法 } */
  views?: Record<string, Record<string, string>>;
  /** 同上，畫好的氣泡（SVG 片段，文字已跳脫） */
  vbub?: Record<string, Record<string, string>>;
}

export interface ViewerExtText {
  info: string;
  radar: string;
  cmp: string;
  none: string;
  untitled: string;
  axisPre: string;
  axisSuf: string;
  stateN: string;
  legendTip: string;
}

export interface ViewerExtData {
  sheets: ViewerExtSheet[];
  /** 文件裡的圖（rcimg:N） */
  rimgs?: string[];
  radar?: { tpls: Record<string, ChartTpl & { name: string }>; pal: string[] };
  txt: ViewerExtText;
}

/** 檢視程式（viewerRuntime）在聚焦、提示卡、縮放、換分頁時叫的鉤子 */
export interface ViewerHooks {
  node(c: Element, id: number, cur: number): void;
  edge(c: Element, from: number, to: number, cur: number): void;
  clear(c: Element): void;
  charBtns(id: number, cur: number): string;
  edgeTip(from: number, to: number, cur: number): string;
  zoom(s: number): void;
  tab(cur: number): void;
}

export function rcViewerExt(E: ViewerExtData, RC: ChartKit | null, D: ViewerData): ViewerHooks {
  const doc = document;
  const NS = 'http://www.w3.org/2000/svg';
  let cur = 0;
  const escT = (s: unknown) => {
    const d = doc.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };
  const tip = doc.getElementById('tipV') as HTMLElement;
  const pane = doc.getElementById('loreV');
  const paneTitle = doc.getElementById('loreVTitle');
  const names = (): Record<string, string> => D.sheets[cur].chars;

  /* ---- 文件窗格 ---- */
  function paneShow(attr: string, val: string | number, title: string) {
    if (!pane || !paneTitle) return;
    const ds = pane.querySelectorAll('.loreDoc');
    for (let i = 0; i < ds.length; i++)
      (ds[i] as HTMLElement).hidden = ds[i].getAttribute(attr) !== String(val);
    paneTitle.textContent = title;
    pane.classList.add('show');
  }
  function paneClose() {
    if (pane) pane.classList.remove('show');
  }
  if (pane) {
    const x = doc.getElementById('loreVClose');
    if (x) x.onclick = paneClose;
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') paneClose();
    });
    /* 文件裡的圖：同一張只放一次（rcimg:N），載入時換回 */
    const rim = E.rimgs || [];
    const im = pane.querySelectorAll('img');
    for (let i = 0; i < im.length; i++) {
      const s = im[i].getAttribute('src') || '';
      if (s.indexOf('rcimg:') === 0) im[i].setAttribute('src', rim[+s.slice(6)] || '');
    }
  }

  /* ---- 看法氣泡（畫好的片段插進說話者的節點群組＝跟著聚焦的透明度） ---- */
  function addBubble(c: Element, speaker: string, markup: string) {
    const n = c.querySelector(`.node[data-id="${speaker}"]`);
    if (!n) return;
    n.classList.add('focusedV');
    const g = doc.createElementNS(NS, 'g');
    g.innerHTML = markup;
    while (g.firstChild) n.appendChild(g.firstChild);
  }

  /* ---- 數值（每份有數值的範本：圖、狀態晶片、比較對象） ---- */
  let rdCur = 0;
  let rdHide: Record<string, boolean> = {};
  let rdCmp: Record<string, number> = {};
  function rdSeries(
    id: number,
    tid: number,
    pre: string,
  ): {
    key: string;
    name: string;
    own: string;
    vals: Record<string, number>;
    hidden: boolean;
    color?: string;
  }[] {
    const ent = E.sheets[cur].crad?.[id];
    if (!ent) return [];
    const list = ent.s.filter((x) => x.t === tid);
    return list.map((x, i) => {
      const k = `${pre}:${i}`;
      const nm = x.s || (list.length > 1 ? E.txt.stateN + (i + 1) : '');
      return {
        key: k,
        name: (names()[id] || '') + (nm ? `・${nm}` : ''),
        own: i === 0 && ent.c ? ent.c : '',
        vals: x.v,
        hidden: !!rdHide[k],
      };
    });
  }
  function rdRender() {
    const host = doc.getElementById('radarDocV');
    const crad = E.sheets[cur].crad || {};
    const ent = crad[rdCur];
    if (!host || !RC || !E.radar) return;
    if (!ent) {
      host.innerHTML = '';
      return;
    }
    const tpls: number[] = [];
    for (const x of ent.s) if (tpls.indexOf(x.t) < 0) tpls.push(x.t);
    let h = '';
    for (const tid of tpls) {
      const tp = E.radar.tpls[tid];
      if (!tp) continue;
      const other = rdCmp[tid] || 0;
      const ser = RC.assignColors(
        rdSeries(rdCur, tid, `a:${tid}`).concat(other ? rdSeries(other, tid, `b:${tid}`) : []),
        E.radar.pal,
      );
      let opts = `<option value="0">${escT(E.txt.none)}</option>`;
      for (const cid in crad) {
        if (+cid === rdCur) continue;
        if (!crad[cid].s.some((x) => x.t === tid)) continue;
        opts += `<option value="${cid}"${+cid === other ? ' selected' : ''}>${escT(names()[cid] || '')}</option>`;
      }
      const chips = ser
        .map(
          (sr) =>
            `<button type="button" class="rdv-chip${sr.hidden ? ' off' : ''}" data-k="${escT(sr.key)}" title="${escT(E.txt.legendTip)}"><i style="background:${escT(sr.color)}"></i>${escT(sr.name)}</button>`,
        )
        .join('');
      const svg = RC.chartSvg(tp, ser, {
        pal: E.radar.pal,
        axisName: (i: number) => E.txt.axisPre + (i + 1) + E.txt.axisSuf,
      });
      h += `<div class="rdv-sec"><div class="rdv-title">${escT(tp.name || E.txt.untitled)}</div><div class="rdv-chart">${svg}</div><div class="rdv-legend">${chips}</div><label class="rdv-cmp">${escT(E.txt.cmp)}<select class="rd-cmp" data-t="${tid}">${opts}</select></label></div>`;
    }
    host.innerHTML = h;
  }
  const rdHost = doc.getElementById('radarDocV');
  if (rdHost) {
    rdHost.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      const c = t?.closest ? t.closest('.rdv-chip') : null;
      if (!c) return;
      const k = c.getAttribute('data-k') || '';
      rdHide[k] = !rdHide[k];
      rdRender();
    });
    rdHost.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement | null;
      const sl = t?.closest ? (t.closest('select.rd-cmp') as HTMLSelectElement | null) : null;
      if (!sl) return;
      rdCmp[sl.getAttribute('data-t') || ''] = +sl.value;
      rdRender();
    });
  }

  /* 角色卡的「資訊 ›」「雷達 ›」（卡片內容是 innerHTML 重建的：委派） */
  doc.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    const b = t?.closest ? t.closest('.ti-btn') : null;
    if (!b) return;
    const ii = b.getAttribute('data-info');
    if (ii !== null) {
      const k = E.sheets[cur].cinfo?.[ii];
      if (k === undefined) return;
      tip.style.display = 'none';
      paneShow('data-k', k, names()[ii] || '');
      return;
    }
    const rr = b.getAttribute('data-radar');
    if (rr !== null && RC) {
      rdCur = +rr;
      rdHide = {};
      rdCmp = {};
      tip.style.display = 'none';
      rdRender();
      paneShow('data-r', 1, names()[rr] || '');
    }
  });

  return {
    node(c, id, cu) {
      cur = cu;
      const vb = E.sheets[cu].vbub;
      if (!vb) return;
      for (const a in vb) if (+a !== id && vb[a][id]) addBubble(c, a, vb[a][id]);
    },
    edge(c, from, to, cu) {
      cur = cu;
      const vb = E.sheets[cu].vbub;
      if (!vb || from === to) return;
      const a = vb[from]?.[to];
      const b = vb[to]?.[from];
      if (a) addBubble(c, String(from), a);
      if (b) addBubble(c, String(to), b);
    },
    clear(c) {
      const l = c.querySelectorAll('.view-bubble');
      for (let i = 0; i < l.length; i++) l[i].remove();
    },
    charBtns(id, cu) {
      cur = cu;
      const s = E.sheets[cu];
      let h = '';
      if (s.cinfo && s.cinfo[id] !== undefined)
        h += `<button type="button" class="ti-btn" data-info="${id}">${escT(E.txt.info)}</button>`;
      if (RC && s.crad?.[id])
        h += `<button type="button" class="ti-btn" data-radar="${id}">${escT(E.txt.radar)}</button>`;
      return h;
    },
    edgeTip(from, to, cu) {
      const v = E.sheets[cu].views;
      if (!v || from === to) return '';
      const ch = D.sheets[cu].chars;
      const a = v[from]?.[to];
      const b = v[to]?.[from];
      let h = '';
      if (a) h += `<div class="tvw">${escT(ch[from] ?? '?')}：「${escT(a)}」</div>`;
      if (b) h += `<div class="tvw">${escT(ch[to] ?? '?')}：「${escT(b)}」</div>`;
      return h;
    },
    zoom(s) {
      const k = String(1 / Math.min(1, s));
      const list = doc.querySelectorAll('.chart');
      for (let i = 0; i < list.length; i++) (list[i] as SVGElement).style.setProperty('--vb-k', k);
    },
    tab(cu) {
      cur = cu;
      paneClose();
    },
  };
}
