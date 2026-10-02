/**
 * 巢狀書式（行首記號）組成 HTML（規格 3.4.1）。ranger(a, z) 負責畫出「原本文字的第 a～z 字」，
 * 所以切開成清單、表格時註解與注音的位置不會錯亂。
 */
import { richKind } from '../model/rich';
import { escapeHtml, rubyHtml, rubyRange } from '../model/text';
import type { Block } from '../model/types';

export type Ranger = (a: number, z: number) => string;

export interface RichOptions {
  /** 段落的 class（預設 rp） */
  pTag?: string;
  /** 彈出視窗的舊式文字：# 標題 */
  heads?: boolean;
  /** 「＠名稱」的按鈕 */
  popRef?: (name: string) => string;
}

interface Span {
  a: number;
  z: number;
}

export function richBodyHtml(text: string, ranger: Ranger, opt: RichOptions = {}): string {
  const src = String(text ?? '');
  const P = opt.pTag ?? 'rp';
  let out = '';
  let para: Span[] = [];
  let nest: { lb: string; body: Span[] } | null = null;
  let list: {
    mk: 'box' | 'disc' | 'num';
    items: { lv: number; mk: string; no?: string; on?: boolean; a: number; z: number }[];
  } | null = null;
  let tbl: Span[][] = [];
  let note: Span[] | null = null;

  const flushP = () => {
    if (para.length) {
      out += `<div class="${P}">${para.map((x) => ranger(x.a, x.z)).join('\n')}</div>`;
      para = [];
    }
  };
  const flushN = () => {
    if (nest) {
      out += `<div class="rin"><div class="blb">${escapeHtml(nest.lb)}</div><div class="rp">${nest.body
        .map((x) => ranger(x.a, x.z))
        .join('\n')}</div></div>`;
      nest = null;
    }
  };
  const flushNote = () => {
    if (note) {
      out += `<div class="rn">${note.map((x) => ranger(x.a, x.z)).join('\n')}</div>`;
      note = null;
    }
  };
  const flushL = () => {
    if (list) {
      let n = 0;
      out += `<ul class="ls ls-${list.mk}">${list.items
        .map((it) => {
          if (it.lv === 0) n++;
          const mk =
            it.mk === 'num'
              ? it.lv === 0
                ? `${it.no || n}.`
                : '‣'
              : it.mk === 'box'
                ? it.on
                  ? '☑'
                  : '□'
                : it.lv
                  ? '‣'
                  : '・';
          return `<li class="lv${it.lv}"><span class="mk">${mk}</span><span class="tx">${ranger(it.a, it.z)}</span></li>`;
        })
        .join('')}</ul>`;
      list = null;
    }
  };
  const flushT = () => {
    if (tbl.length) {
      out += `<table class="rtbl">${tbl
        .map(
          (r, i) =>
            `<tr>${r.map((c) => (i === 0 ? `<th>${ranger(c.a, c.z)}</th>` : `<td>${ranger(c.a, c.z)}</td>`)).join('')}</tr>`,
        )
        .join('')}</table>`;
      tbl = [];
    }
  };
  const flushAll = (keep?: 'p' | 'nest' | 'li' | 'note' | 'tbl') => {
    if (keep !== 'p') flushP();
    if (keep !== 'nest') flushN();
    if (keep !== 'li') flushL();
    if (keep !== 'note') flushNote();
    if (keep !== 'tbl') flushT();
  };

  let at = 0;
  for (const ln of src.split('\n')) {
    const a = at;
    const z = at + ln.length;
    at = z + 1;
    const k = richKind(ln, { heads: opt.heads });
    switch (k.k) {
      case 'h': {
        flushAll();
        out += `<div class="rh${k.lv}">${k.lv === 3 ? '<span class="h3mk">◆ </span>' : ''}${ranger(a + k.ofs, z)}</div>`;
        continue;
      }
      case 'head':
        flushAll();
        out += `<div class="rh">${ranger(a + k.ofs, z)}</div>`;
        continue;
      case 'heads':
        flushAll();
        out += `<div class="rhs">${ranger(a + k.ofs, z)}</div>`;
        continue;
      case 'pop':
        flushAll();
        out += opt.popRef ? opt.popRef(src.slice(a + k.ofs, z)) : '';
        continue;
      case 'note':
        flushAll('note');
        if (!note) note = [];
        note.push({ a: a + k.ofs, z });
        continue;
      case 'nest': {
        flushAll('nest');
        const body = src.slice(a + k.ofs, z);
        const ci = body.indexOf('：') >= 0 ? body.indexOf('：') : body.indexOf(':');
        if (!nest)
          nest =
            ci > 0
              ? { lb: body.slice(0, ci).trim(), body: [{ a: a + k.ofs + ci + 1, z }] }
              : { lb: '技能檢定', body: [{ a: a + k.ofs, z }] };
        else nest.body.push({ a: a + k.ofs, z });
        continue;
      }
      case 'li': {
        flushAll('li');
        if (list && list.mk !== k.mk) flushL();
        if (!list) list = { mk: k.mk, items: [] };
        list.items.push({ lv: k.lv, mk: k.mk, no: k.no, on: k.on, a: a + k.ofs, z });
        continue;
      }
      case 'tbl': {
        flushAll('tbl');
        const inner = ln.replace(/^\s*[|｜]/, '').replace(/[|｜]\s*$/, '');
        if (/^[\s|｜\-ー－]*$/.test(inner) && /-{2,}/.test(inner)) continue;
        const cells: Span[] = [];
        let p = a + (ln.length - ln.replace(/^\s*/, '').length) + 1;
        for (const c of inner.split(/[|｜]/)) {
          const cs = p + (c.length - c.replace(/^\s*/, '').length);
          const ce = p + c.replace(/\s*$/, '').length;
          cells.push({ a: cs, z: Math.max(cs, ce) });
          p += c.length + 1;
        }
        tbl.push(cells);
        continue;
      }
      case 'talk':
        flushAll();
        out += `<div class="rt">${k.sp ? `<span class="spk">${escapeHtml(k.sp)}</span>` : ''}${ranger(a + k.ofs, z)}</div>`;
        continue;
      default:
        flushAll('p');
        if (!ln.trim()) flushP();
        else para.push({ a, z });
    }
  }
  flushAll();
  return out;
}

/** 段落用（含註解與文字顏色） */
export function richBlockHtml(b: Block, popRef?: (name: string) => string): string {
  return richBodyHtml(b.text, (a, z) => rubyRange(b, a, z), { popRef });
}

/** 單純的文字用（舊式彈出視窗的內容） */
export function richTextHtml(text: string, opt: RichOptions = {}): string {
  const t = String(text ?? '');
  return richBodyHtml(t, (a, z) => rubyHtml(t.slice(a, z)), opt);
}
