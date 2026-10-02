/**
 * NPC 卡的資料：預設值、補齊舊資料、自動計算（只用有依據的公式，規格 3.7.2）、手動值優先。
 */
import { uid } from '../text';
import type { CocSkill, DxCombo, DxEffect, EmoSkill, Npc } from '../types';
import {
  dxSynByName,
  EMO_BASE_SKILLS,
  EMO_EMOTIONS,
  EMO_RES_SLOTS,
  type EmoAb,
  type EmoSkillDef,
  emoDefOf,
  emoDiv,
  emoNorm,
} from './data';

/** 習得技能的最少列數 */
export const EMO_SKILL_ROWS = 1;
/** 克蘇魯技能、武器的列數上限 */
export const COC_MAX_ROWS = 12;
/** DX3rd 效果、組合技的列數上限（實際上沒有限制） */
export const DX_MAX_ROWS = 99;

export const newEmoSkill = (): EmoSkill => ({ n: '', cat: '', arg: '', ref: '', lv: '', v: '' });
export const newDxEffect = (): DxEffect => ({
  id: uid(),
  kind: '',
  n: '',
  lv: '',
  timing: '',
  skill: '',
  dif: '',
  tgt: '',
  rng: '',
  enc: '',
  lim: '',
});
export const newDxCombo = (): DxCombo => ({
  n: '',
  cmb: '',
  pick: [],
  extra: '',
  timing: '',
  skill: '',
  hit: '',
  atk: '',
  tgt: '',
  rng: '',
  enc: '',
  cond: '',
  eff: '',
});
export const newCocSkill = (): CocSkill => ({ n: '', cat: '', arg: '', v: '', free: false });

export function newNpcData(): Npc {
  return {
    sys: 'emoklore',
    name: '',
    kana: '',
    role: '',
    memo: '',
    memoOpen: true,
    art: null,
    artW: 30,
    tabs: [],
    emoklore: {
      ab: { body: '', dex: '', mind: '', sense: '', int: '', cha: '', soc: '', luck: '' },
      hp: '',
      mp: '',
      skills: Array.from({ length: EMO_SKILL_ROWS }, newEmoSkill),
      base: {},
      baseOpen: false,
      kyomei: '1',
      kyodo: '',
      res: {
        omote: { attr: '', name: '' },
        ura: { attr: '', name: '' },
        root: { attr: '', name: '' },
      },
    },
    dx3rd: {
      breed: '',
      syn: '',
      syns: ['', '', ''],
      enc: '',
      ab: { body: '', sense: '', mind: '', soc: '' },
      act: '',
      hp: '',
      stock: '',
      skills: {
        melee: '',
        ranged: '',
        dodge: '',
        percept: '',
        will: '',
        rc: '',
        negotiate: '',
        procure: '',
        drive: '',
        ride: '',
        art: '',
        know: '',
        info: '',
      },
      sarg: { ride: '', art: '', know: '', info: '' },
      effects: [newDxEffect(), newDxEffect()],
      combos: [],
    },
    coc: {
      ver: '7',
      ab: { str: '', con: '', pow: '', dex: '', app: '', siz: '', int: '', edu: '' },
      sub: { hp: '', mp: '', san: '', idea: '', luck: '', know: '', build: '', db: '', mov: '' },
      skills: Array.from({ length: 6 }, newCocSkill),
      weapons: [{ n: '', v: '', dmg: '' }],
    },
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));

/** 補齊缺少的欄位、轉換舊格式（就地修改並回傳） */
export function ensureNpc(np: Partial<Npc> | null | undefined): Npc {
  const d = newNpcData();
  if (!np || typeof np !== 'object') return d;
  const o = np as Npc;
  o.sys = o.sys === 'dx3rd' || o.sys === 'coc' || o.sys === 'emoklore' ? o.sys : 'emoklore';
  for (const k of ['name', 'kana', 'role', 'memo'] as const)
    if (typeof o[k] !== 'string') o[k] = '';
  if (typeof o.art !== 'string') o.art = null;
  o.artW = Math.max(15, Math.min(50, Number.parseInt(String(o.artW), 10) || 30));
  o.tabs = Array.isArray(o.tabs)
    ? o.tabs.map((t) => ({
        id: t?.id || uid(),
        title: str(t?.title),
        text: str(t?.text),
        open: t?.open !== false,
      }))
    : [];
  if (typeof o.memoOpen !== 'boolean') o.memoOpen = true;

  const e = Object.assign(d.emoklore, o.emoklore ?? {});
  e.ab = Object.assign(newNpcData().emoklore.ab, e.ab ?? {});
  const res = (e.res ?? {}) as Record<string, unknown>;
  e.res = {
    omote: { attr: '', name: '' },
    ura: { attr: '', name: '' },
    root: { attr: '', name: '' },
  };
  for (const [slot] of EMO_RES_SLOTS) {
    const cur = res[slot];
    const r =
      typeof cur === 'string'
        ? { attr: '', name: cur }
        : {
            attr: str((cur as { attr?: unknown })?.attr),
            name: str((cur as { name?: unknown })?.name),
          };
    if (!r.attr && r.name) {
      const hit = EMO_EMOTIONS.find((a) => a.items.includes(r.name));
      if (hit) r.attr = hit.k;
    }
    e.res[slot] = r;
  }
  e.skills =
    Array.isArray(e.skills) && e.skills.length
      ? e.skills.map((s) => ({ ...newEmoSkill(), ...s }))
      : [newEmoSkill()];
  while (e.skills.length < EMO_SKILL_ROWS) e.skills.push(newEmoSkill());
  if (typeof e.base !== 'object' || !e.base) e.base = {};
  e.baseOpen = !!e.baseOpen;
  if (typeof e.kyomei !== 'string') e.kyomei = String(e.kyomei || '1');
  if (typeof e.kyodo !== 'string') e.kyodo = String(e.kyodo || '');
  o.emoklore = e;

  const x = Object.assign(d.dx3rd, o.dx3rd ?? {});
  x.ab = Object.assign(newNpcData().dx3rd.ab, x.ab ?? {});
  x.skills = Object.assign(newNpcData().dx3rd.skills, x.skills ?? {});
  x.sarg = Object.assign(newNpcData().dx3rd.sarg, x.sarg ?? {});
  x.effects = Array.isArray(x.effects)
    ? x.effects.map((f) => Object.assign(newDxEffect(), { id: '' }, f))
    : [newDxEffect(), newDxEffect()];
  for (const f of x.effects) if (!f.id) f.id = uid();
  x.combos = Array.isArray(x.combos)
    ? x.combos.map((f) => {
        const raw = f as DxCombo & { dice?: unknown; cv?: unknown; dif?: unknown; mod?: unknown };
        const c: DxCombo = { ...newDxCombo(), ...f };
        if (!c.hit && raw.dice) c.hit = String(raw.dice) + (raw.cv ? `@${raw.cv}` : '');
        for (const k of ['dif', 'dice', 'cv', 'mod'])
          delete (c as unknown as Record<string, unknown>)[k];
        c.pick = Array.isArray(c.pick) ? c.pick.map((p) => String(p ?? '')) : [];
        c.extra = str(c.extra);
        return c;
      })
    : [];
  x.syns = Array.isArray(x.syns) ? x.syns.slice(0, 3).map(str) : ['', '', ''];
  while (x.syns.length < 3) x.syns.push('');
  /* 舊資料：症候群原本是自由填寫的一行（以「／」「・」「、」分隔） */
  if (!x.syns.some(Boolean) && String(x.syn ?? '').trim()) {
    const parts = String(x.syn)
      .split(/[／/・、,＋+]/)
      .map((t) => t.trim())
      .filter(Boolean);
    parts.slice(0, 3).forEach((t, i) => {
      const hit = dxSynByName(t);
      if (hit) x.syns[i] = hit.k;
    });
    if (x.syns.some(Boolean) && !x.breed) {
      const n = x.syns.filter(Boolean).length;
      x.breed = n >= 3 ? 'tri' : n === 2 ? 'cross' : 'pure';
    }
  }
  o.dx3rd = x;

  const rawCoc = (o.coc ?? {}) as Partial<Npc['coc']>;
  const c = Object.assign(d.coc, rawCoc);
  c.ver = c.ver === '6' ? '6' : '7';
  c.ab = Object.assign(newNpcData().coc.ab, c.ab ?? {});
  c.sub = Object.assign(newNpcData().coc.sub, c.sub ?? {});
  if (!Array.isArray(rawCoc.weapons)) {
    const w = rawCoc.weapon;
    c.weapons =
      w && (w.n || w.v || w.dmg)
        ? [{ n: w.n || '', v: w.v || '', dmg: w.dmg || '' }]
        : [{ n: '', v: '', dmg: '' }];
  }
  c.weapons = c.weapons
    .map((w) => Object.assign({ n: '', v: '', dmg: '' }, w))
    .slice(0, COC_MAX_ROWS);
  delete c.weapon;
  c.skills = Array.isArray(rawCoc.skills)
    ? rawCoc.skills.map((s) => ({ ...newCocSkill(), ...s })).slice(0, COC_MAX_ROWS)
    : Array.from({ length: 6 }, newCocSkill);
  o.coc = c;
  return o;
}

/* ---------- 欄位的路徑 ---------- */

export function getNpcField(np: Npc, path: string): unknown {
  if (path.startsWith('tabtext.')) return np.tabs.find((t) => t.id === path.slice(8))?.text;
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), np);
}

export function setNpcField(np: Npc, path: string, val: unknown): void {
  if (path.startsWith('tabtext.')) {
    const t = np.tabs.find((x) => x.id === path.slice(8));
    if (t) t.text = String(val ?? '');
    return;
  }
  const parts = path.split('.');
  let obj = np as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = obj[parts[i]];
    if (next == null || typeof next !== 'object') return;
    obj = next as Record<string, unknown>;
  }
  obj[parts[parts.length - 1]] = val;
}

/* ---------- 自動計算（3.7.2） ---------- */

const num = (v: unknown): number | null => {
  const x = Number.parseFloat(String(v ?? '').trim());
  return Number.isNaN(x) ? null : x;
};

/** 參照能力的自動選擇：除過之後最高的，同值取先列的；都沒填取第一個 */
export function emoPickRef(def: EmoSkillDef | null, ab: Record<EmoAb, string>): EmoAb | '' {
  if (!def?.refs.length) return '';
  let best: EmoAb | '' = '';
  let bestVal = Number.NEGATIVE_INFINITY;
  for (const r of def.refs) {
    const raw = num(ab[r]);
    if (raw === null) continue;
    const v = Math.ceil(raw / emoDiv(def, r));
    if (v > bestVal) {
      bestVal = v;
      best = r;
    }
  }
  return best || def.refs[0];
}

export function emoSkillRef(sk: EmoSkill, ab: Record<EmoAb, string>): EmoAb | '' {
  const manual = String(sk.ref ?? '').trim();
  if (manual) return manual as EmoAb;
  return emoPickRef(emoDefOf(sk.n), ab);
}

/** 判定值＝Lv＋⌈參照能力 ÷ 除數⌉ */
export function emoSkillTarget(sk: EmoSkill, ab: Record<EmoAb, string>): number | '' {
  const ref = emoSkillRef(sk, ab);
  if (!ref) return '';
  const lv = num(sk.lv);
  const raw = num(ab[ref]);
  if (lv === null || raw === null) return '';
  return lv + Math.ceil(raw / emoDiv(emoDefOf(sk.n), ref));
}

/** 基本技能（Lv0）：⌈第一個參照能力 ÷ 除數⌉ */
export function emoBaseTarget(def: EmoSkillDef, ab: Record<EmoAb, string>): number | '' {
  const r = def.refs[0];
  if (!r) return '';
  const raw = num(ab[r]);
  if (raw === null) return '';
  return Math.ceil(raw / emoDiv(def, r));
}

export type AutoValues = Record<string, number | string>;

export function computeNpcAuto(np: Npc): AutoValues {
  const A: AutoValues = {};
  if (np.sys === 'emoklore') {
    const e = np.emoklore;
    const body = num(e.ab.body);
    const mind = num(e.ab.mind);
    const intel = num(e.ab.int);
    A['emoklore.hp'] = body != null ? body + 10 : '';
    A['emoklore.mp'] = mind != null && intel != null ? mind + intel : '';
    e.skills.forEach((sk, i) => {
      A[`emoklore.skills.${i}.v`] = emoSkillTarget(sk, e.ab);
    });
    for (const def of EMO_BASE_SKILLS)
      A[`emoklore.base.${emoNorm(def.n)}`] = emoBaseTarget(def, e.ab);
  } else if (np.sys === 'dx3rd') {
    const d = np.dx3rd;
    const sense = num(d.ab.sense);
    const mind = num(d.ab.mind);
    A['dx3rd.act'] = sense != null && mind != null ? sense * 2 + mind : '';
    const byId = new Map(d.effects.filter((f) => f.id).map((f) => [f.id, f]));
    d.combos.forEach((cb, i) => {
      const picked = (cb.pick ?? []).map((id) => byId.get(id)).filter((f): f is DxEffect => !!f);
      if (!picked.length) {
        for (const k of ['enc', 'skill', 'tgt', 'rng', 'timing']) A[`dx3rd.combos.${i}.${k}`] = '';
        return;
      }
      let sum = 0;
      let any = false;
      for (const f of picked) {
        const v = num(f.enc);
        if (v != null) {
          sum += v;
          any = true;
        }
      }
      A[`dx3rd.combos.${i}.enc`] = any ? sum : '';
      for (const k of ['skill', 'tgt', 'rng', 'timing'] as const) {
        const vals: string[] = [];
        for (const f of picked) {
          const t = String(f[k] ?? '').trim();
          if (!t || /^[—\-―ー]$/.test(t)) continue;
          if (!vals.includes(t)) vals.push(t);
        }
        A[`dx3rd.combos.${i}.${k}`] = vals.join('／');
      }
    });
  } else {
    const c = np.coc;
    const con = num(c.ab.con);
    const siz = num(c.ab.siz);
    const pow = num(c.ab.pow);
    const intel = num(c.ab.int);
    const edu = num(c.ab.edu);
    if (c.ver === '6') {
      A['coc.sub.hp'] = con != null && siz != null ? Math.ceil((con + siz) / 2) : '';
      A['coc.sub.mp'] = pow != null ? pow : '';
      A['coc.sub.san'] = pow != null ? pow * 5 : '';
      A['coc.sub.idea'] = intel != null ? intel * 5 : '';
      A['coc.sub.luck'] = pow != null ? pow * 5 : '';
      A['coc.sub.know'] = edu != null ? edu * 5 : '';
      A['coc.sub.mov'] = 8;
    } else {
      A['coc.sub.hp'] = con != null && siz != null ? Math.floor((con + siz) / 10) : '';
      A['coc.sub.mp'] = pow != null ? Math.floor(pow / 5) : '';
      A['coc.sub.san'] = pow != null ? pow : '';
    }
  }
  return A;
}

/** 有手動值就用手動值，沒有就用自動計算值 */
export function npcEff(np: Npc, A: AutoValues, path: string): string {
  const s = String(getNpcField(np, path) ?? '').trim();
  if (s !== '') return s;
  const a = A[path];
  return a == null || a === '' ? '' : String(a);
}
