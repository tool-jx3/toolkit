/**
 * NPC 卡在紙面、列印與匯出時的樣子（唯讀）。收合的區塊不輸出，空白的列不輸出（規格 F160～F166）。
 */
import {
  COC_AB,
  DX3RD_AB,
  DX3RD_BREEDS,
  DX3RD_SKILL_DEFS,
  dxBreedN,
  dxKindOf,
  dxSynOf,
  dxSynText,
  EMO_AB_LABEL,
  EMO_RES_SLOTS,
  EMOKLORE_AB,
  emoAttrOf,
  emoSkillName,
  withArg,
} from '../model/npc/data';
import { type AutoValues, computeNpcAuto, emoSkillRef, npcEff } from '../model/npc/model';
import { escapeHtml as esc, rubyHtml } from '../model/text';
import type { Npc } from '../model/types';

export const SYS_LABEL: Record<Npc['sys'], string> = {
  emoklore: 'Emoklore TRPG',
  dx3rd: 'Double Cross 3rd(RC)',
  coc: '克蘇魯神話 TRPG',
};

/** 唯讀的值：空白時顯示淡色的提示 */
function ro(v: unknown, ph = ''): string {
  const t = String(v ?? '').trim();
  return t ? esc(t) : `<span class="npc-ph">${esc(ph)}</span>`;
}

const cell = (label: string, inner: string) =>
  `<div class="npc-cell"><span class="k">${esc(label)}</span><span class="v">${inner}</span></div>`;
const fld = (label: string, inner: string) =>
  `<span class="fld"><span class="k">${esc(label)}</span><span class="v">${inner}</span></span>`;
const sub = (title: string) => `<div class="npc-sub">${esc(title)}</div>`;

function emokloreHtml(np: Npc, A: AutoValues): string {
  const e = np.emoklore;
  const abCells = EMOKLORE_AB.map(([k, l]) => cell(l, ro(e.ab[k]))).join('');
  const resCells = EMO_RES_SLOTS.map(([slot, label]) => {
    const r = e.res[slot] ?? { attr: '', name: '' };
    const attr = emoAttrOf(r.attr);
    const txt = r.name ? r.name + (attr ? `（${attr.label}）` : '') : '';
    return cell(label, ro(txt, '—'));
  }).join('');
  const rows = e.skills
    .map((sk, i) => ({ sk, i }))
    .filter((r) => String(r.sk.n ?? '').trim())
    .map(({ sk, i }) => {
      const ref = emoSkillRef(sk, e.ab);
      return `<tr><td class="tl">${ro(emoSkillName(sk), '—')}</td><td>${ro(ref ? EMO_AB_LABEL[ref] : '', '—')}</td><td>${ro(sk.lv)}</td><td>${ro(npcEff(np, A, `emoklore.skills.${i}.v`))}</td></tr>`;
    })
    .join('');
  return (
    `<div class="npc-grid c8">${abCells}</div>` +
    `<div class="npc-row">${fld('HP', ro(npcEff(np, A, 'emoklore.hp')))}${fld('MP', ro(npcEff(np, A, 'emoklore.mp')))}${fld('初始共鳴等級', ro(e.kyomei))}</div>` +
    sub('共鳴感情') +
    `<div class="npc-grid c3">${resCells}</div>` +
    sub('習得技能') +
    `<table class="npc-table npc-skilltable"><tr><th>技能</th><th>參照能力</th><th>Lv</th><th>判定值</th></tr>${rows}</table>`
  );
}

function dx3rdHtml(np: Npc, A: AutoValues): string {
  const d = np.dx3rd;
  const groups = DX3RD_AB.map(([abk, abl]) => {
    const cells = DX3RD_SKILL_DEFS.filter((x) => x.ab === abk)
      .map((def) => {
        const label = def.arg ? `${def.n}:` : def.n;
        const arg = def.arg
          ? `<span class="dxargv">${ro(d.sarg?.[def.k], '○○')}</span>`
          : '<span class="dxsp"></span>';
        return `<span class="dxsk"><span class="k">${esc(label)}</span>${arg}<span class="dxvalv">${ro(d.skills[def.k])}</span></span>`;
      })
      .join('');
    return `<div class="dxrow"><span class="dxab"><span class="k">${esc(abl)}</span><span class="dxsp"></span><span class="dxvalv">${ro(d.ab[abk])}</span></span>${cells}</div>`;
  }).join('');
  const F = ['lv', 'timing', 'skill', 'dif', 'tgt', 'rng', 'enc', 'lim'] as const;
  const rows = d.effects
    .filter((f) => String(f.n ?? '').trim())
    .map((f) => {
      const kd = dxKindOf(f.kind);
      return `<tr class="dxeff"${kd ? ` style="--kc:${kd.c}"` : ''}><td class="tl dxeffn">${kd ? `<span class="dxkind">${esc(kd.n)}</span>` : ''}${ro(f.n, '—')}</td>${F.map((k) => `<td>${ro(f[k], '—')}</td>`).join('')}</tr>`;
    })
    .join('');
  const CB: readonly (readonly [keyof (typeof d.combos)[number], string, boolean])[] = [
    ['timing', '時機', true],
    ['skill', '技能', true],
    ['hit', '命中', false],
    ['atk', '攻擊力', false],
    ['tgt', '對象', true],
    ['rng', '射程', true],
    ['enc', '侵蝕值', true],
  ];
  const cbText = (cb: (typeof d.combos)[number]) => {
    const names = (cb.pick ?? [])
      .map((id) => String(d.effects.find((x) => x.id === id)?.n ?? '').trim())
      .filter(Boolean);
    const ex = String(cb.extra ?? '').trim();
    if (names.length) return names.map((x) => `〈${x}〉`).join('＋') + (ex ? `＋${ex}` : '');
    return String(cb.cmb ?? '').trim() || ex;
  };
  const foot = (cb: (typeof d.combos)[number], k: 'cond' | 'eff', l: string) =>
    String(cb[k] ?? '').trim()
      ? `<div class="dxcb-f"><span class="k">${esc(l)}</span>${ro(cb[k], '—')}</div>`
      : '';
  const combos = d.combos
    .map((cb, i) => ({ cb, i }))
    .filter((r) => String(r.cb.n ?? '').trim())
    .map(
      ({ cb, i }) =>
        `<div class="dxcb"><div class="dxcb-h">${rubyHtml(cb.n || '—')}</div>` +
        (cbText(cb)
          ? `<div class="dxcb-f"><span class="k">組合</span>${rubyHtml(cbText(cb))}</div>`
          : '') +
        `<div class="dxcb-g">${CB.map(
          ([k, l, auto]) =>
            `<span class="dxcb-c"><span class="k">${esc(l)}</span><span class="v">${ro(auto ? npcEff(np, A, `dx3rd.combos.${i}.${String(k)}`) : cb[k], '—')}</span></span>`,
        ).join('')}</div>${foot(cb, 'cond', '條件')}${foot(cb, 'eff', '效果')}</div>`,
    )
    .join('');
  const nSyn = dxBreedN(d.breed) || 1;
  const breed = ro(DX3RD_BREEDS.find((x) => x[0] === d.breed)?.[1], '—');
  const syns = dxSynText(d)
    ? (d.syns ?? [])
        .slice(0, nSyn)
        .map((k) => dxSynOf(k))
        .filter((x) => !!x)
        .map((x) => `<span class="dxsyn" style="--kc:${x.c}">${esc(x.n)}</span>`)
        .join('')
    : ro('', '—');
  return (
    `<div class="npc-row dxhead">${fld('血統', breed)}${fld('症候群', syns)}${fld('侵蝕率（固定）', ro(d.enc))}</div>` +
    sub('能力值與技能') +
    `<div class="dxgrid">${groups}</div>` +
    `<div class="npc-row">${fld('行動值', ro(npcEff(np, A, 'dx3rd.act')))}${fld('HP 最大值', ro(d.hp))}${fld('常備化 Pt', ro(d.stock))}</div>` +
    sub('效果') +
    (rows
      ? `<table class="npc-table npc-dxeff"><tr><th>名稱</th><th>Lv</th><th>時機</th><th>技能</th><th>難度</th><th>對象</th><th>射程</th><th>侵蝕值</th><th>限制</th></tr>${rows}</table>`
      : '') +
    (combos ? `${sub('組合技')}<div class="dxcbs">${combos}</div>` : '')
  );
}

function cocHtml(np: Npc, A: AutoValues): string {
  const c = np.coc;
  const v6 = c.ver === '6';
  const abCells = COC_AB.map(([k, l]) => cell(l, ro(c.ab[k]))).join('');
  const subDefs: readonly (readonly [keyof typeof c.sub, string])[] = v6
    ? [
        ['hp', '耐久值'],
        ['mp', 'MP'],
        ['san', '理智'],
        ['idea', '靈感'],
        ['luck', '幸運'],
        ['know', '知識'],
        ['db', 'DB'],
        ['mov', 'MOV'],
      ]
    : [
        ['hp', '耐久值'],
        ['mp', 'MP'],
        ['san', '理智'],
        ['luck', '幸運'],
        ['build', '體格'],
        ['db', 'DB'],
        ['mov', 'MOV'],
      ];
  const subCells = subDefs.map(([k, l]) => cell(l, ro(npcEff(np, A, `coc.sub.${k}`)))).join('');
  const rows = c.skills
    .filter((s) => String(s.n ?? '').trim())
    .map((s) => `<tr><td class="tl">${ro(withArg(s.n, s.arg), '—')}</td><td>${ro(s.v)}</td></tr>`)
    .join('');
  const wrows = c.weapons
    .filter((w) => String(w.n ?? '').trim() || String(w.dmg ?? '').trim())
    .map(
      (w) => `<tr><td class="tl">${ro(w.n, '—')}</td><td>${ro(w.v)}</td><td>${ro(w.dmg)}</td></tr>`,
    )
    .join('');
  return (
    `<div class="npc-grid c8">${abCells}</div>` +
    `<div class="npc-grid" style="grid-template-columns:repeat(${subDefs.length},1fr)">${subCells}</div>` +
    sub('主要技能') +
    (rows ? `<table class="npc-table"><tr><th>技能</th><th>％</th></tr>${rows}</table>` : '') +
    (wrows
      ? `${sub('武器')}<table class="npc-table"><tr><th>武器</th><th>技能％</th><th>傷害</th></tr>${wrows}</table>`
      : '')
  );
}

/** NPC 卡的內容（唯讀） */
export function npcHtml(np: Npc): string {
  const A = computeNpcAuto(np);
  const sys = np.sys;
  const tag = `<span class="npc-tag">${esc(SYS_LABEL[sys])}${sys === 'coc' ? (np.coc.ver === '6' ? '・第 6 版' : '・第 7 版') : ''}</span>`;
  const body =
    sys === 'emoklore' ? emokloreHtml(np, A) : sys === 'dx3rd' ? dx3rdHtml(np, A) : cocHtml(np, A);
  const head =
    `<div class="npc-head"><div class="npc-nameblk"><span class="npc-kana">${esc(String(np.kana ?? '').trim())}</span>` +
    `<span class="npc-name">${ro(np.name, '（NPC 名稱）')}</span></div><span class="npc-role">${ro(np.role, '')}</span>${tag}</div>`;
  const memo =
    np.memoOpen !== false && String(np.memo ?? '').trim()
      ? `${sub('備忘')}<div class="npc-memo">${esc(np.memo)}</div>`
      : '';
  const tabs = (np.tabs ?? [])
    .filter((t) => t.open && String(t.text ?? '').trim())
    .map((t) => `${sub(t.title || '（未命名的分頁）')}<div class="npc-memo">${esc(t.text)}</div>`)
    .join('');
  const inner = head + body + memo + tabs;
  if (!np.art) return inner;
  return `<div class="npc-arwrap"><div class="npc-arbody">${inner}</div><div class="npc-art" style="flex:0 0 ${np.artW || 30}%"><img src="${esc(np.art)}" alt=""></div></div>`;
}
