/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 數值圖表的畫法（原作的 radarSvgHtml、chartBase、barSvgHtml、lineSvgHtml、pieSvgHtml、gaugeSvgHtml、
 * chartSvgHtml、radarAssignColors）：五種圖型共用同一份資料（範本＝類別＋上限、狀態＝一組數值）。
 * 整套包在 rcCharts() 裡、不引用外面的東西：互動網頁把它的原始碼整段放進 HTML（同 viewerRuntime）。
 */

export interface ChartAxis {
  id: number;
  label: string;
  max: number;
  unit: string;
}

export interface ChartTpl {
  chart?: string;
  shape?: string;
  rings?: number;
  valMode?: string;
  shared?: boolean;
  axes: ChartAxis[];
}

export interface ChartSeries {
  key?: string;
  name?: string;
  /** 角色自訂的外框色（只給第一個狀態） */
  own?: string;
  color?: string;
  vals: Record<string, number>;
  hidden?: boolean;
}

export interface ChartOpts {
  size?: number;
  pad?: number;
  /** 放在圖表節點裡的位置（第四批） */
  box?: { x: number; y: number; w: number; h: number };
  color?: string;
  /** 軸名空白時的名稱（「第 N 軸」） */
  axisName?: (i: number) => string;
  pal?: readonly string[];
}

export interface ChartKit {
  PALETTE: readonly string[];
  chartSvg: (tpl: ChartTpl, series: ChartSeries[], o?: ChartOpts) => string;
  assignColors: (series: ChartSeries[], pal: readonly string[]) => ChartSeries[];
}

/** 畫法的工具箱（純函式，不碰外面的變數） */
export function rcCharts(): ChartKit {
  const PALETTE = [
    '#e0605a',
    '#3b8bd6',
    '#4caf7d',
    '#e39a2f',
    '#9b6bd6',
    '#2bb5b5',
    '#d65a9c',
    '#8a8f2b',
  ];
  const esc2 = (s: unknown) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const fmt = (x: number) => String(Math.round(x * 100) / 100);
  const ringsOf = (tpl: ChartTpl) => Math.max(1, Math.min(8, (tpl.rings ?? 0) | 0 || 4));
  const openTag = (S: number, o: ChartOpts) =>
    o.box
      ? `<svg class="radar-svg" x="${o.box.x.toFixed(1)}" y="${o.box.y.toFixed(1)}" width="${o.box.w.toFixed(1)}" height="${o.box.h.toFixed(1)}" viewBox="0 0 ${S} ${S}" preserveAspectRatio="xMidYMid meet"${o.color ? ` color="${esc2(o.color)}"` : ''} style="overflow:visible;width:${o.box.w.toFixed(1)}px;height:${o.box.h.toFixed(1)}px">`
      : `<svg class="radar-svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" style="overflow:visible;max-width:100%;height:auto">`;

  function radar(tpl: ChartTpl, series: ChartSeries[], o: ChartOpts): string {
    const axes = tpl.axes || [];
    const n = axes.length;
    const S = o.size || 300;
    const cx = S / 2;
    const cy = S / 2;
    /* 放在圖表節點裡時軸名離圖近一點 */
    const R = S / 2 - (o.pad || (o.box ? 42 : 50));
    if (n < 3) return '';
    let maxAll = 0;
    for (let m = 0; m < n; m++) maxAll = Math.max(maxAll, +axes[m].max || 0);
    const lim = (i: number) => (tpl.shared ? maxAll || 1 : +axes[i].max || 1);
    const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i: number, r: number) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
    const anchor = (dx: number) => (dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle');
    const rings = ringsOf(tpl);
    let h = openTag(S, o);
    for (let k = 1; k <= rings; k++) {
      const rr = (R * k) / rings;
      const op = k === rings ? '.55' : '.22';
      if (tpl.shape === 'circle')
        h += `<circle cx="${cx}" cy="${cy}" r="${fmt(rr)}" fill="none" stroke="currentColor" stroke-opacity="${op}"/>`;
      else {
        const gp: string[] = [];
        for (let g = 0; g < n; g++) {
          const q = pt(g, rr);
          gp.push(`${fmt(q[0])},${fmt(q[1])}`);
        }
        h += `<polygon points="${gp.join(' ')}" fill="none" stroke="currentColor" stroke-opacity="${op}"/>`;
      }
    }
    for (let a = 0; a < n; a++) {
      const e = pt(a, R);
      h += `<line x1="${cx}" y1="${cy}" x2="${fmt(e[0])}" y2="${fmt(e[1])}" stroke="currentColor" stroke-opacity=".3"/>`;
    }
    const labels: { x: number; y: number; dx: number; t: string; c: string }[] = [];
    for (const sr of series) {
      if (sr.hidden) continue;
      const pts: number[][] = [];
      for (let b = 0; b < n; b++) {
        let raw = +sr.vals?.[axes[b].id];
        if (!Number.isFinite(raw)) raw = 0;
        const f = Math.max(0, Math.min(1, raw / lim(b)));
        const q2 = pt(b, R * f);
        pts.push(q2);
        if (tpl.valMode !== 'none') {
          const txt =
            tpl.valMode === 'pct'
              ? `${Math.round(f * 100)}%`
              : fmt(raw) + (axes[b].unit ? ` ${axes[b].unit}` : '');
          /* 靠外圈的值往內標、靠中心的往外標 */
          const dir = f > 0.18 ? -11 : 11;
          labels.push({
            x: q2[0] + Math.cos(ang(b)) * dir,
            y: q2[1] + Math.sin(ang(b)) * dir,
            dx: Math.cos(ang(b)) * (dir > 0 ? 1 : -1),
            t: txt,
            c: sr.color ?? '',
          });
        }
      }
      const ps = pts.map((q3) => `${fmt(q3[0])},${fmt(q3[1])}`).join(' ');
      h += `<polygon points="${ps}" fill="${esc2(sr.color)}" fill-opacity=".18" stroke="${esc2(sr.color)}" stroke-width="2" stroke-linejoin="round"/>`;
      for (const p of pts)
        h += `<circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="3" fill="${esc2(sr.color)}"/>`;
    }
    for (const L of labels)
      h += `<text x="${fmt(L.x)}" y="${fmt(L.y + 3.5)}" font-size="10" font-weight="700" fill="${esc2(L.c)}" text-anchor="${anchor(L.dx)}">${esc2(L.t)}</text>`;
    for (let x = 0; x < n; x++) {
      const dxl = Math.cos(ang(x));
      const lp = pt(x, R + 18);
      const lbl = axes[x].label || (o.axisName ? o.axisName(x) : `Axis ${x + 1}`);
      h += `<text x="${fmt(lp[0])}" y="${fmt(lp[1] + 4)}" font-size="12" fill="currentColor" text-anchor="${anchor(dxl)}">${esc2(lbl)}</text>`;
    }
    return `${h}</svg>`;
  }

  /** 四種新圖型共用的底座：尺寸、上限、標籤格式、開頭標籤 */
  function base(tpl: ChartTpl, series: ChartSeries[], o: ChartOpts) {
    const axes = tpl.axes || [];
    const n = axes.length;
    const S = o.size || 300;
    if (!n) return null;
    let maxAll = 0;
    for (let m = 0; m < n; m++) maxAll = Math.max(maxAll, +axes[m].max || 0);
    const lim = (i: number) => (tpl.shared ? maxAll || 1 : +axes[i].max || 1);
    const vis = series.filter((s) => !s.hidden);
    const val = (sr: ChartSeries, i: number) => {
      const raw = +sr.vals?.[axes[i].id];
      return Number.isFinite(raw) ? raw : 0;
    };
    const frac = (sr: ChartSeries, i: number) => Math.max(0, Math.min(1, val(sr, i) / lim(i)));
    const label = (sr: ChartSeries, i: number) => {
      if (tpl.valMode === 'none') return '';
      return tpl.valMode === 'pct'
        ? `${Math.round(frac(sr, i) * 100)}%`
        : fmt(val(sr, i)) + (axes[i].unit ? ` ${axes[i].unit}` : '');
    };
    const axName = (i: number) => axes[i].label || (o.axisName ? o.axisName(i) : `Axis ${i + 1}`);
    return {
      n,
      S,
      vis,
      val,
      frac,
      label,
      axName,
      open: openTag(S, o),
      rings: ringsOf(tpl),
      pal: o.pal || PALETTE,
    };
  }

  /** 橫向長條：一列一軸，同一軸的各序列並排 */
  function bar(tpl: ChartTpl, series: ChartSeries[], o: ChartOpts): string {
    const b = base(tpl, series, o);
    if (!b) return '';
    const { S, n } = b;
    const k = b.vis.length;
    const padT = 12;
    const padB = 12;
    const x0 = Math.round(S * 0.27);
    const x1 = S - Math.round(S * 0.17);
    const rowH = (S - padT - padB) / n;
    const f = fmt;
    let h = b.open;
    for (let g = 1; g <= b.rings; g++) {
      const gx = x0 + ((x1 - x0) * g) / b.rings;
      h += `<line x1="${f(gx)}" y1="${padT}" x2="${f(gx)}" y2="${S - padB}" stroke="currentColor" stroke-opacity=".18"/>`;
    }
    h += `<line x1="${x0}" y1="${padT}" x2="${x0}" y2="${S - padB}" stroke="currentColor" stroke-opacity=".5"/>`;
    for (let i = 0; i < n; i++) {
      const yc = padT + rowH * i + rowH / 2;
      h += `<text x="${x0 - 6}" y="${f(yc + 4)}" text-anchor="end" font-size="11" fill="currentColor">${esc2(b.axName(i))}</text>`;
      const bh = Math.min(16, Math.max(4, (rowH - 6) / Math.max(1, k)));
      const top = yc - (bh * k) / 2;
      for (let j = 0; j < k; j++) {
        const sr = b.vis[j];
        const w = (x1 - x0) * b.frac(sr, i);
        const y = top + bh * j;
        h += `<rect x="${x0}" y="${f(y)}" width="${f(w)}" height="${f(Math.max(1, bh - 1))}" fill="${esc2(sr.color)}" fill-opacity=".85"/>`;
        const lb = b.label(sr, i);
        if (lb)
          h += `<text x="${f(x0 + w + 4)}" y="${f(y + bh - 4)}" font-size="9" font-weight="700" fill="${esc2(sr.color)}">${esc2(lb)}</text>`;
      }
    }
    return `${h}</svg>`;
  }

  /** 折線：橫軸＝各軸，一序列一條線 */
  function line(tpl: ChartTpl, series: ChartSeries[], o: ChartOpts): string {
    const b = base(tpl, series, o);
    if (!b) return '';
    const { S, n } = b;
    const f = fmt;
    const x0 = Math.round(S * 0.08);
    const x1 = S - Math.round(S * 0.06);
    const y0 = 18;
    const y1 = S - Math.round(S * 0.16);
    const px = (i: number) => (n > 1 ? x0 + ((x1 - x0) * i) / (n - 1) : (x0 + x1) / 2);
    let h = b.open;
    for (let g = 0; g <= b.rings; g++) {
      const gy = y1 - ((y1 - y0) * g) / b.rings;
      h += `<line x1="${x0}" y1="${f(gy)}" x2="${x1}" y2="${f(gy)}" stroke="currentColor" stroke-opacity="${g === 0 ? '.5' : '.18'}"/>`;
    }
    for (let i = 0; i < n; i++) {
      const anc = n > 1 ? (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') : 'middle';
      h += `<text x="${f(px(i))}" y="${y1 + 14}" text-anchor="${anc}" font-size="11" fill="currentColor">${esc2(b.axName(i))}</text>`;
    }
    for (const sr of b.vis) {
      const pts: string[] = [];
      let marks = '';
      for (let a = 0; a < n; a++) {
        const x = px(a);
        const y = y1 - (y1 - y0) * b.frac(sr, a);
        pts.push(`${f(x)},${f(y)}`);
        marks += `<circle cx="${f(x)}" cy="${f(y)}" r="3" fill="${esc2(sr.color)}"/>`;
        const lb = b.label(sr, a);
        if (lb)
          marks += `<text x="${f(x)}" y="${f(y - 7)}" text-anchor="middle" font-size="9" font-weight="700" fill="${esc2(sr.color)}">${esc2(lb)}</text>`;
      }
      h += `<polyline points="${pts.join(' ')}" fill="none" stroke="${esc2(sr.color)}" stroke-width="2" stroke-linejoin="round"/>${marks}`;
    }
    return `${h}</svg>`;
  }

  /** 環圈：一序列一個環，切片＝各軸佔總和的比例（切片顏色依軸），序列名寫在中央 */
  function pie(tpl: ChartTpl, series: ChartSeries[], o: ChartOpts): string {
    const b = base(tpl, series, o);
    if (!b) return '';
    const { S, n } = b;
    const k = b.vis.length;
    const f = fmt;
    let h = b.open;
    const cols = k <= 1 ? 1 : k <= 4 ? 2 : 3;
    const rows = Math.max(1, Math.ceil(k / cols));
    const cell = Math.min(S / cols, S / rows);
    const arc = (cx: number, cy: number, R: number, r: number, a0: number, a1: number) => {
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rr: number, a: number) =>
        `${f(cx + rr * Math.cos(a))} ${f(cy + rr * Math.sin(a))}`;
      return `M ${p(R, a0)} A ${f(R)} ${f(R)} 0 ${big} 1 ${p(R, a1)} L ${p(r, a1)} A ${f(r)} ${f(r)} 0 ${big} 0 ${p(r, a0)} Z`;
    };
    for (let j = 0; j < k; j++) {
      const sr = b.vis[j];
      const cx = ((j % cols) + 0.5) * cell + (S - cols * cell) / 2;
      const cy = (Math.floor(j / cols) + 0.5) * cell + (S - rows * cell) / 2;
      const R = cell * 0.34;
      const r = cell * 0.19;
      let total = 0;
      for (let i = 0; i < n; i++) total += Math.max(0, b.val(sr, i));
      if (total <= 0) {
        h += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f((R + r) / 2)}" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="${f(R - r)}"/>`;
      } else {
        let a0 = -Math.PI / 2;
        for (let q = 0; q < n; q++) {
          const v = Math.max(0, b.val(sr, q));
          if (v <= 0) continue;
          const a1 = a0 + (v / total) * 2 * Math.PI - 1e-6;
          const col = b.pal[q % b.pal.length];
          h += `<path d="${arc(cx, cy, R, r, a0, a1)}" fill="${col}" fill-opacity=".85" stroke="currentColor" stroke-opacity=".15"/>`;
          if (v / total > 0.05) {
            const am = (a0 + a1) / 2;
            const lx = cx + (R + 9) * Math.cos(am);
            const ly = cy + (R + 9) * Math.sin(am);
            const dx = Math.cos(am);
            const txt =
              b.axName(q) +
              (tpl.valMode === 'none'
                ? ''
                : ` ${tpl.valMode === 'pct' ? `${Math.round((v / total) * 100)}%` : f(v)}`);
            h += `<text x="${f(lx)}" y="${f(ly + 3)}" font-size="9" fill="currentColor" text-anchor="${dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle'}">${esc2(txt)}</text>`;
          }
          a0 = a1 + 1e-6;
        }
      }
      h += `<text x="${f(cx)}" y="${f(cy + 3.5)}" text-anchor="middle" font-size="10" font-weight="700" fill="${esc2(sr.color)}">${esc2(sr.name || '')}</text>`;
    }
    return `${h}</svg>`;
  }

  /** 進度條：一軸一條軌道，各序列疊在同一條上（半透明＋末端刻線） */
  function gauge(tpl: ChartTpl, series: ChartSeries[], o: ChartOpts): string {
    const b = base(tpl, series, o);
    if (!b) return '';
    const { S, n } = b;
    const k = b.vis.length;
    const f = fmt;
    const padT = 12;
    const padB = 12;
    const x0 = Math.round(S * 0.27);
    const x1 = S - Math.round(S * 0.16);
    const rowH = (S - padT - padB) / n;
    let h = b.open;
    for (let i = 0; i < n; i++) {
      const yc = padT + rowH * i + rowH / 2;
      const th = Math.min(14, Math.max(6, rowH * 0.45));
      const ty = yc - th / 2;
      h += `<text x="${x0 - 6}" y="${f(yc + 4)}" text-anchor="end" font-size="11" fill="currentColor">${esc2(b.axName(i))}</text>`;
      h += `<rect x="${x0}" y="${f(ty)}" width="${x1 - x0}" height="${f(th)}" rx="${f(th / 2)}" fill="currentColor" fill-opacity=".12"/>`;
      for (let j = 0; j < k; j++) {
        const sr = b.vis[j];
        const w = (x1 - x0) * b.frac(sr, i);
        if (w > 0)
          h += `<rect x="${x0}" y="${f(ty)}" width="${f(w)}" height="${f(th)}" rx="${f(th / 2)}" fill="${esc2(sr.color)}" fill-opacity="${k > 1 ? '.45' : '.8'}"/>`;
        h += `<line x1="${f(x0 + w)}" y1="${f(ty - 2)}" x2="${f(x0 + w)}" y2="${f(ty + th + 2)}" stroke="${esc2(sr.color)}" stroke-width="2"/>`;
        const lb = b.label(sr, i);
        if (lb)
          h += `<text x="${f(x0 + w + 4)}" y="${f(ty + th + 2 + (j % 2 ? 10 : -th - 4))}" font-size="9" font-weight="700" fill="${esc2(sr.color)}">${esc2(lb)}</text>`;
      }
    }
    return `${h}</svg>`;
  }

  /** 依範本的圖型分派（不認得的＝雷達圖） */
  function chartSvg(tpl: ChartTpl, series: ChartSeries[], o: ChartOpts = {}): string {
    const t = tpl.chart || 'radar';
    if (t === 'bar') return bar(tpl, series, o);
    if (t === 'line') return line(tpl, series, o);
    if (t === 'pie') return pie(tpl, series, o);
    if (t === 'gauge') return gauge(tpl, series, o);
    return radar(tpl, series, o);
  }

  /** 配色：有自訂色的用自己的，其餘依序從調色盤取「圖上還沒出現過」的色 */
  function assignColors(series: ChartSeries[], pal: readonly string[]): ChartSeries[] {
    const used: Record<string, number> = {};
    let next = 0;
    for (const s of series)
      if (s.own) {
        s.color = s.own;
        used[String(s.own).toLowerCase()] = 1;
      }
    for (const s of series) {
      if (s.own) continue;
      let tries = 0;
      let c = pal[next % pal.length];
      while (used[c.toLowerCase()] && tries < pal.length) {
        next++;
        tries++;
        c = pal[next % pal.length];
      }
      s.color = c;
      used[c.toLowerCase()] = 1;
      next++;
    }
    return series;
  }

  return { PALETTE, chartSvg, assignColors };
}

/** 編輯器用的那一份 */
export const charts: ChartKit = rcCharts();
