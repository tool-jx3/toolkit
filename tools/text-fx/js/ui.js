/* 文字演出產生器：設定面板的表單產生器
 * 每個欄位綁一個設定路徑（例如 "stroke.width"），改了就寫回設定並通知重畫；
 * 設定被整批換掉（切換範本、模式）時呼叫 refresh() 把畫面同步回來。 */

let uid = 0;
const nextId = p => `${p}-${++uid}`;

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const fmt = (v, digits) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return digits != null ? n.toFixed(digits) : String(Math.round(n * 1000) / 1000);
};

/* api: { get(path), set(path, value, meta), cfg() } */
export class Form {
  constructor(api) {
    this.api = api;
    this.items = [];
  }

  /* 所有欄位依目前設定重畫（值、顯示與否、選項） */
  refresh() {
    const cfg = this.api.cfg();
    for (const it of this.items) {
      const show = it.show ? !!it.show(cfg) : true;
      it.wrap.hidden = !show;
      if (show && it.sync) it.sync(cfg);
    }
  }

  track(wrap, sync, show) {
    this.items.push({ wrap, sync, show });
    return wrap;
  }

  section(title, kids, opts = {}) {
    const body = h('div', { class: 'sec-body' }, kids);
    const el = h('section', { class: `sec${opts.class ? ' ' + opts.class : ''}` },
      title ? h('h3', { class: 'sec-title' }, title, opts.aside || null) : null, body);
    return this.track(el, null, opts.show);
  }

  row(kids, opts = {}) {
    return this.track(h('div', { class: `row${opts.class ? ' ' + opts.class : ''}` }, kids), null, opts.show);
  }

  note(textOrFn, opts = {}) {
    const el = h('p', { class: `note${opts.class ? ' ' + opts.class : ''}` });
    const sync = cfg => {
      const v = typeof textOrFn === 'function' ? textOrFn(cfg) : textOrFn;
      if (opts.html) el.innerHTML = v; else el.textContent = v;
    };
    sync(this.api.cfg());
    return this.track(el, sync, opts.show);
  }

  /* 滑桿＋數字。scale：顯示倍率（例如字距存 0.08，顯示 8%） */
  range(path, label, o = {}) {
    const id = nextId('rg');
    const scale = o.scale || 1;
    const slider = h('input', { type: 'range', id, min: o.min * scale, max: o.max * scale, step: (o.step || 0.01) * scale, 'aria-label': label });
    const num = h('input', { type: 'number', min: o.min * scale, max: o.max * scale, step: (o.step || 0.01) * scale, class: 'num', 'aria-label': `${label}（數值）` });
    const write = (raw, final) => {
      let v = Number(raw);
      if (!Number.isFinite(v)) return;
      v = Math.min(o.max * scale, Math.max(o.min * scale, v)) / scale;
      this.api.set(path, v, { final });
      if (o.after) o.after(v);
    };
    slider.addEventListener('input', () => { num.value = fmt(slider.value, o.digits); write(slider.value, false); });
    slider.addEventListener('change', () => write(slider.value, true));
    num.addEventListener('change', () => { write(num.value, true); slider.value = num.value; });
    const wrap = h('div', { class: 'field range' + (o.class ? ' ' + o.class : '') },
      h('label', { for: id }, label),
      h('div', { class: 'ctl' }, slider, h('span', { class: 'num-wrap' }, num, o.unit ? h('span', { class: 'unit' }, o.unit) : null)));
    if (o.hint) wrap.title = o.hint;
    const sync = () => {
      const v = this.api.get(path);
      const d = Number(v) * scale;
      if (document.activeElement !== num) num.value = fmt(d, o.digits);
      if (document.activeElement !== slider) slider.value = d;
    };
    sync();
    return this.track(wrap, sync, o.show);
  }

  select(path, label, options, o = {}) {
    const id = nextId('sel');
    const sel = h('select', { id });
    const fill = cfg => {
      const opts = typeof options === 'function' ? options(cfg) : options;
      const sig = JSON.stringify(opts);
      if (sel._sig === sig) return;
      sel._sig = sig;
      sel.textContent = '';
      for (const op of opts) {
        if (op.group) {
          const g = h('optgroup', { label: op.group });
          for (const [v, l] of op.items) g.append(h('option', { value: v }, l));
          sel.append(g);
        } else sel.append(h('option', { value: op[0] }, op[1]));
      }
    };
    const read = () => (o.toValue ? o.toValue(sel.value) : sel.value);
    sel.addEventListener('change', () => {
      const v = read();
      if (o.onPick) o.onPick(v);
      else this.api.set(path, v, { final: true });
    });
    const wrap = h('div', { class: 'field select' + (o.class ? ' ' + o.class : '') },
      label ? h('label', { for: id }, label) : null, h('div', { class: 'ctl' }, sel, o.extra || null));
    const sync = cfg => {
      fill(cfg);
      const v = o.fromValue ? o.fromValue(this.api.get(path), cfg) : this.api.get(path);
      sel.value = String(v);
    };
    sync(this.api.cfg());
    return this.track(wrap, sync, o.show);
  }

  /* 分段按鈕 */
  seg(path, label, options, o = {}) {
    const box = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
    const btns = options.map(([v, l]) => {
      const b = h('button', { type: 'button', role: 'radio', 'data-v': String(v) }, l);
      b.addEventListener('click', () => {
        const val = typeof v === 'number' ? v : v === 'true' ? true : v === 'false' ? false : v;
        if (o.onPick) o.onPick(val); else this.api.set(path, val, { final: true });
      });
      return b;
    });
    box.append(...btns);
    const wrap = h('div', { class: 'field seg-field' + (o.class ? ' ' + o.class : '') }, label ? h('span', { class: 'lbl' }, label) : null, box);
    const sync = cfg => {
      const v = String(o.fromValue ? o.fromValue(this.api.get(path), cfg) : this.api.get(path));
      for (const b of btns) { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
      if (o.labels) btns.forEach((b, i) => { b.textContent = o.labels(cfg)[i]; });
    };
    sync(this.api.cfg());
    return this.track(wrap, sync, o.show);
  }

  check(path, label, o = {}) {
    const id = nextId('ck');
    const box = h('input', { type: 'checkbox', id });
    box.addEventListener('change', () => this.api.set(path, box.checked, { final: true }));
    const wrap = h('div', { class: 'field check' + (o.class ? ' ' + o.class : '') }, box, h('label', { for: id }, label));
    if (o.hint) wrap.title = o.hint;
    const sync = () => { box.checked = !!this.api.get(path); };
    sync();
    return this.track(wrap, sync, o.show);
  }

  color(path, label, o = {}) {
    const id = nextId('col');
    const inp = h('input', { type: 'color', id });
    const txt = h('input', { type: 'text', class: 'hex', maxlength: 7, spellcheck: 'false', 'aria-label': `${label}（色碼）` });
    inp.addEventListener('input', () => { txt.value = inp.value; this.api.set(path, inp.value, { final: false }); });
    inp.addEventListener('change', () => this.api.set(path, inp.value, { final: true }));
    txt.addEventListener('change', () => {
      let v = txt.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) { inp.value = v; this.api.set(path, v.toLowerCase(), { final: true }); }
      else if (o.allowEmpty && v === '#') this.api.set(path, '', { final: true });
      else txt.value = this.api.get(path) || '';
    });
    const wrap = h('div', { class: 'field color' }, h('label', { for: id }, label), h('div', { class: 'ctl' }, inp, txt, o.extra || null));
    const sync = () => {
      const v = this.api.get(path) || '';
      if (/^#[0-9a-f]{6}$/i.test(v)) inp.value = v;
      if (document.activeElement !== txt) txt.value = v;
    };
    sync();
    return this.track(wrap, sync, o.show);
  }

  text(path, label, o = {}) {
    const id = nextId('tx');
    const inp = o.multiline
      ? h('textarea', { id, rows: o.rows || 3, spellcheck: 'false', placeholder: o.placeholder || '' })
      : h('input', { type: 'text', id, placeholder: o.placeholder || '', spellcheck: 'false' });
    inp.addEventListener('input', () => this.api.set(path, inp.value, { final: false, typing: true }));
    inp.addEventListener('change', () => this.api.set(path, inp.value, { final: true }));
    const wrap = h('div', { class: 'field text' + (o.multiline ? ' multi' : '') }, label ? h('label', { for: id }, label) : null, inp, o.extra || null);
    const sync = () => { const v = this.api.get(path) ?? ''; if (inp.value !== v && document.activeElement !== inp) inp.value = v; };
    sync();
    this.track(wrap, sync, o.show);
    wrap.input = inp;
    return wrap;
  }

  custom(el, sync, show) {
    if (sync) sync(this.api.cfg());
    return this.track(el, sync, show);
  }
}
