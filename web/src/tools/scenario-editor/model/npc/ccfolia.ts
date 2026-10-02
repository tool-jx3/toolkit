/**
 * NPC 卡與外部格式：輸出 CCFOLIA 棋子（3.7.3）、讀入 CCFOLIA 棋子（3.7.4）、讀入 Yutosheet 的表格（3.7.6）。
 * 指令裡的日文字串（正気度ロール、アイデア、ダメージ判定、コンボ…）是格式的一部分，讀回時也靠它們，不翻譯。
 */
import type { CocSkill, DxCombo, DxEffect, EmoSkill, Npc, NpcSystem } from '../types';
import {
  COC_AB,
  cocCatOf,
  cocNeedsArg,
  cocSkillsOf,
  DX3RD_AB,
  DX3RD_KIND,
  DX3RD_SKILL_DEFS,
  dxKindOf,
  dxSynByName,
  dxSynText,
  EMO_BASE_SKILLS,
  EMO_EMOTIONS,
  EMO_RES_SLOTS,
  EMO_SKILL_MAP,
  EMOKLORE_AB,
  emoNorm,
  emoSkillName,
  withArg,
} from './data';
import {
  COC_MAX_ROWS,
  computeNpcAuto,
  EMO_SKILL_ROWS,
  newDxCombo,
  newDxEffect,
  newEmoSkill,
  npcEff,
} from './model';

export interface CcfStatus {
  label: string;
  value: number;
  max: number;
}

export interface CcfParam {
  label: string;
  value: string;
}

export interface CcfCharacter {
  kind: 'character';
  data: {
    name: string;
    memo: string;
    initiative: number;
    externalUrl: string;
    iconUrl: null;
    commands: string;
    status: CcfStatus[];
    params: CcfParam[];
    faces: [];
  };
}

/** NPC 卡 → CCFOLIA 棋子 */
export function npcToCcfolia(np: Npc): CcfCharacter {
  const A = computeNpcAuto(np);
  const V = (p: string) => npcEff(np, A, p);
  const N = (p: string) => {
    const x = Number.parseFloat(V(p));
    return Number.isNaN(x) ? 0 : x;
  };
  const status: CcfStatus[] = [];
  const params: CcfParam[] = [];
  const cmds: string[] = [];
  const put = (label: string, v: unknown) => {
    const t = String(v ?? '').trim();
    if (t !== '') params.push({ label, value: t });
  };
  let initiative = 0;

  if (np.sys === 'emoklore') {
    const hp = N('emoklore.hp');
    const mp = N('emoklore.mp');
    status.push({ label: 'HP', value: hp, max: hp });
    status.push({ label: 'MP', value: mp, max: mp });
    for (const [k, l] of EMOKLORE_AB) put(l, V(`emoklore.ab.${k}`) || '0');
    const kyo = Number.parseInt(V('emoklore.kyomei'), 10);
    status.push({ label: '共鳴', value: Number.isNaN(kyo) ? 1 : kyo, max: 9 });
    put('強度', V('emoklore.kyodo') || '0');
    cmds.push('{共鳴}DM<={強度} 〈∞共鳴〉');
    cmds.push('({共鳴}+1)DM<={強度} 〈∞共鳴〉ルーツ属性一致');
    cmds.push('({共鳴}*2)DM<={強度} 〈∞共鳴〉完全一致');
    np.emoklore.skills.forEach((sk, i) => {
      const nm = emoSkillName(sk).trim();
      if (!nm) return;
      const tv = V(`emoklore.skills.${i}.v`);
      if (!tv) return;
      const lv = Number.parseInt(V(`emoklore.skills.${i}.lv`), 10);
      cmds.push(`${Number.isNaN(lv) || lv < 1 ? 1 : lv}DM<=${tv} ${nm}`);
    });
    for (const def of EMO_BASE_SKILLS) {
      const tv = V(`emoklore.base.${emoNorm(def.n)}`);
      cmds.push(`1DM<=${tv || '0'} 〈＊${emoNorm(def.n)}〉`);
    }
  } else if (np.sys === 'dx3rd') {
    const hp = N('dx3rd.hp');
    if (hp) status.push({ label: 'HP', value: hp, max: hp });
    status.push({ label: '侵蝕率', value: N('dx3rd.enc'), max: 100 });
    initiative = N('dx3rd.act');
    for (const [k, l] of DX3RD_AB) put(l, V(`dx3rd.ab.${k}`) || '0');
    put('行動値', V('dx3rd.act'));
    for (const def of DX3RD_SKILL_DEFS) {
      const v = V(`dx3rd.skills.${def.k}`);
      if (!v) continue;
      const nm = def.arg ? withArg(def.n, np.dx3rd.sarg?.[def.k]) : def.n;
      cmds.push(`${v}dx@10 【${nm}】`);
    }
    const synTxt = dxSynText(np.dx3rd);
    if (synTxt) put('シンドローム', synTxt);
    for (const f of np.dx3rd.effects) {
      const nm = String(f.n ?? '').trim();
      const kd = dxKindOf(f.kind);
      if (nm)
        cmds.push(
          `// ${kd ? `[${kd.n}] ` : ''}${nm}${f.lv ? ` Lv${f.lv}` : ''}${f.timing ? ` / ${f.timing}` : ''}`,
        );
    }
    np.dx3rd.combos.forEach((cb, ci) => {
      const nm = String(cb.n ?? '').trim();
      const en = V(`dx3rd.combos.${ci}.enc`);
      if (nm)
        cmds.push(
          `// コンボ：${nm}${cb.hit ? ` / ${cb.hit}` : ''}${cb.atk ? ` / 攻撃力${cb.atk}` : ''}${en ? ` / 侵蝕${en}` : ''}`,
        );
    });
  } else {
    const v6 = np.coc.ver === '6';
    const cc = v6 ? 'CCB' : 'CC';
    const hp = N('coc.sub.hp');
    const mp = N('coc.sub.mp');
    const san = N('coc.sub.san');
    const luck = N('coc.sub.luck');
    status.push({ label: 'HP', value: hp, max: hp });
    status.push({ label: 'MP', value: mp, max: mp });
    status.push({ label: 'SAN', value: san, max: san });
    if (!v6) status.push({ label: '幸運', value: luck, max: luck });
    initiative = N('coc.ab.dex');
    for (const [k, l] of COC_AB) put(l, V(`coc.ab.${k}`) || '0');
    if (!v6) {
      put('BLD', V('coc.sub.build') || '0');
      put('MOV', V('coc.sub.mov') || '0');
    }
    cmds.push(`${v6 ? '1d100<={SAN}' : 'CC<={SAN}'} 【正気度ロール】`);
    cmds.push(`${cc}<=${V('coc.sub.idea') || '0'} 【アイデア】`);
    cmds.push(v6 ? `CCB<=${V('coc.sub.luck') || '0'} 【幸運】` : 'CC<={幸運} 【幸運】');
    cmds.push(`${cc}<=${V('coc.sub.know') || '0'} 【知識】`);
    np.coc.skills.forEach((sk, i) => {
      const nm = withArg(String(sk.n ?? '').trim(), sk.arg);
      if (!String(sk.n ?? '').trim()) return;
      cmds.push(`${cc}<=${V(`coc.skills.${i}.v`) || '0'} 【${nm}】`);
    });
    for (const w of np.coc.weapons) {
      const wn = String(w.n ?? '').trim();
      if (wn) cmds.push(`${cc}<=${String(w.v ?? '').trim() || '0'} 【${wn}】`);
    }
    const dbRaw = String(V('coc.sub.db') ?? '').trim();
    const db =
      dbRaw === '' || dbRaw === '0' || dbRaw === '±0'
        ? ''
        : /^[+-]/.test(dbRaw)
          ? dbRaw
          : `+${dbRaw}`;
    for (const d of ['1d3', '1d4', '1d6']) cmds.push(`${d}${db} 【ダメージ判定】`);
    for (const [, l] of COC_AB)
      cmds.push(v6 ? `CCB<={${l}}*5 【${l} × 5】` : `CC<={${l}}　【${l}】`);
  }

  const memo = [np.kana, np.role]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join('\n');
  return {
    kind: 'character',
    data: {
      name: String(np.name ?? '').trim() || 'NPC',
      memo,
      initiative,
      externalUrl: '',
      iconUrl: null,
      commands: cmds.join('\n'),
      status,
      params,
      faces: [],
    },
  };
}

/** 輸出的文字（1 格縮排） */
export const ccfoliaText = (np: Npc): string => JSON.stringify(npcToCcfolia(np), null, 1);

/* ---------- 讀入 CCFOLIA 棋子（3.7.4） ---------- */

export interface CcfData {
  name?: unknown;
  memo?: unknown;
  commands?: unknown;
  params?: unknown;
  status?: unknown;
}

export function ccfParse(text: string): CcfData | null {
  const t = String(text ?? '').trim();
  if (!t) return null;
  let j: unknown = null;
  try {
    j = JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const z = t.lastIndexOf('}');
    if (a < 0 || z <= a) return null;
    try {
      j = JSON.parse(t.slice(a, z + 1));
    } catch {
      return null;
    }
  }
  if (!j || typeof j !== 'object') return null;
  const o = j as { data?: unknown };
  const d = (o.data && typeof o.data === 'object' ? o.data : j) as CcfData;
  return d && typeof d === 'object' && (d.name != null || d.params || d.status || d.commands)
    ? d
    : null;
}

interface CcfMaps {
  P: Record<string, string>;
  ST: Record<string, { value?: unknown; max?: unknown }>;
}

function ccfMaps(d: CcfData): CcfMaps {
  const P: Record<string, string> = {};
  const ST: CcfMaps['ST'] = {};
  for (const x of Array.isArray(d.params) ? d.params : []) {
    const k = String(x?.label ?? '').trim();
    if (k) P[k] = String(x?.value != null ? x.value : '').trim();
  }
  for (const x of Array.isArray(d.status) ? d.status : []) {
    const k = String(x?.label ?? '').trim();
    if (k) ST[k] = x;
  }
  return { P, ST };
}

/** 從參數的組成判斷是哪個系統 */
export function ccfSys(d: CcfData): NpcSystem | null {
  const { P, ST } = ccfMaps(d);
  const hp = (k: string) => Object.hasOwn(P, k);
  const hs = (k: string) => Object.hasOwn(ST, k);
  if (hp('肉体') && hp('感覚')) return 'dx3rd';
  if (hs('侵蝕率')) return 'dx3rd';
  if (hp('身体') || hp('五感') || hp('運勢')) return 'emoklore';
  if (hp('STR') || hp('CON') || hp('EDU') || hs('SAN')) return 'coc';
  return null;
}

const ccfNum = (v: unknown): string => {
  const t = String(v ?? '').trim();
  return /^[+-]?\d+(\.\d+)?$/.test(t) ? t : '';
};
const ccfStat = (ST: CcfMaps['ST'], k: string): string =>
  ST[k] && ST[k].max != null ? ccfNum(ST[k].max) : ST[k] ? ccfNum(ST[k].value) : '';

/** 「名字 (讀音)」拆開 */
export function ccfSplitName(v: unknown): { name: string; kana: string } {
  const t = String(v ?? '').trim();
  const m = t.match(/^(.+?)[\s　]*[（(]([^（()）]+)[）)]\s*$/);
  if (!m) return { name: t, kana: '' };
  return { name: m[1].trim(), kana: m[2].trim() };
}

function ccfMemo(v: unknown): { kana: string; role: string[]; res: Record<string, string> } {
  const out = { kana: '', role: [] as string[], res: {} as Record<string, string> };
  for (const ln of String(v ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)) {
    const m = ln.match(/^([^:：]{1,16})[:：]\s*(.+)$/);
    if (!m) {
      out.role.push(ln);
      continue;
    }
    const k = m[1].trim();
    const val = m[2].trim();
    if (/^(ふりがな|フリガナ|よみ|読み|ヨミ)$/.test(k)) {
      out.kana = val;
      continue;
    }
    const mr = k.match(/^共鳴感情[・･]?(表|裏|ルーツ)$/);
    if (mr) {
      out.res[{ 表: 'omote', 裏: 'ura', ルーツ: 'root' }[mr[1] as '表' | '裏' | 'ルーツ']] = val;
      continue;
    }
    out.role.push(ln);
  }
  return out;
}

function ccfRes(v: string): { name: string; attr: string } {
  const t = String(v ?? '').trim();
  const m = t.match(/^(.+?)[\s　]*[（(]([^（()）]+)[）)]\s*$/);
  const name = (m ? m[1] : t).trim();
  const lab = m ? m[2].trim() : '';
  let attr = EMO_EMOTIONS.find((a) => a.label === lab)?.k ?? '';
  if (!attr) attr = EMO_EMOTIONS.find((a) => a.items.includes(name))?.k ?? '';
  return { name, attr };
}

/** 技能名稱附帶的專業領域（「藝術:攝影」或「製作（料理）」） */
export function ccfArg(v: string): { base: string; arg: string } {
  const t = String(v ?? '').trim();
  let m = t.match(/^([^:：]+)[:：]\s*(.+)$/);
  if (m) return { base: m[1].trim(), arg: m[2].trim() };
  m = t.match(/^(.+?)[\s　]*[（(]([^（()）]+)[）)]\s*$/);
  if (m) return { base: m[1].trim(), arg: m[2].trim() };
  return { base: t, arg: '' };
}

const ccfVar = (v: unknown) => /^\{/.test(String(v ?? '').trim());

function ccfName(line: string): string {
  let m = line.match(/【([^】]+)】/);
  if (m) return m[1].trim();
  m = line.match(/〈([^〉]+)〉/);
  if (m) return m[1].trim();
  return '';
}

export interface CcfReport {
  name: boolean;
  sys: NpcSystem | null;
  skills: number;
  effects: number;
  combos: number;
  unread: number;
  over: number;
}

/** 把棋子資料填進 NPC 卡（就地修改）；回傳讀入的報告 */
export function ccfApply(np: Npc, d: CcfData): CcfReport {
  const sys = ccfSys(d);
  const { P, ST } = ccfMaps(d);
  const lines = String(d.commands ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const rep: CcfReport = {
    name: false,
    sys: sys ?? np.sys,
    skills: 0,
    effects: 0,
    combos: 0,
    unread: 0,
    over: 0,
  };
  const nm = ccfSplitName(d.name);
  if (nm.name) {
    np.name = nm.name;
    rep.name = true;
  }
  if (nm.kana) np.kana = nm.kana;
  const mm = ccfMemo(d.memo);
  if (mm.kana) np.kana = mm.kana;
  if (mm.role.length) np.role = mm.role.join(' ');
  if (!sys) {
    rep.sys = null;
    return rep;
  }
  np.sys = sys;

  if (sys === 'emoklore') {
    const e = np.emoklore;
    for (const [k, l] of EMOKLORE_AB)
      if (P[l] != null && ccfNum(P[l]) !== '') e.ab[k] = ccfNum(P[l]);
    const hp = ccfStat(ST, 'HP');
    const mp = ccfStat(ST, 'MP');
    if (hp) e.hp = hp;
    if (mp) e.mp = mp;
    if (ccfNum(P.強度) !== '') e.kyodo = ccfNum(P.強度);
    if (ST.共鳴) {
      const kv = ccfNum(ST.共鳴.value);
      if (kv) e.kyomei = kv;
    }
    for (const [slot] of EMO_RES_SLOTS) {
      const raw = mm.res[slot];
      if (!raw) continue;
      const r = ccfRes(raw);
      if (r.name) e.res[slot] = { attr: r.attr, name: r.name };
    }
    const got: EmoSkill[] = [];
    for (const ln of lines) {
      const mv = ln.match(/^[^\s]*DM\s*<=\s*([^\s〈【]*)/i);
      if (mv && (ccfVar(mv[1]) || /^\{/.test(ln))) continue;
      const m = ln.match(/^(\d+)\s*DM\s*<=\s*([^\s〈【]*)/i);
      const nmx = ccfName(ln);
      if (!m || !nmx) {
        if (!/^\/\//.test(ln)) rep.unread++;
        continue;
      }
      const tv = ccfNum(m[2]);
      if (/[*＊]/.test(nmx)) {
        if (tv) e.base[emoNorm(nmx)] = tv;
        continue;
      }
      const cut = ccfArg(nmx.replace(/[*＊★☆∞]/g, ''));
      const def = EMO_SKILL_MAP[emoNorm(nmx)];
      got.push({
        ...newEmoSkill(),
        n: def ? def.n : cut.base,
        cat: def ? def.cat : '',
        arg: def?.arg ? cut.arg : '',
        lv: m[1],
        v: tv,
      });
    }
    if (got.length) {
      e.skills = got.slice(0, 24);
      rep.skills = got.length;
    }
    while (e.skills.length < EMO_SKILL_ROWS) e.skills.push(newEmoSkill());
  } else if (sys === 'dx3rd') {
    const x = np.dx3rd;
    for (const [k, l] of DX3RD_AB) if (ccfNum(P[l]) !== '') x.ab[k] = ccfNum(P[l]);
    if (ccfNum(P.行動値) !== '') x.act = ccfNum(P.行動値);
    const hp = ccfStat(ST, 'HP');
    if (hp) x.hp = hp;
    if (ST.侵蝕率) {
      const v = ccfNum(ST.侵蝕率.value);
      if (v) x.enc = v;
    }
    const syn = String(P.シンドローム ?? '').trim();
    if (syn) {
      const parts = syn
        .split(/[／/・、,＋+]/)
        .map((t) => t.trim())
        .filter(Boolean);
      x.syns = ['', '', ''];
      parts.slice(0, 3).forEach((t, i) => {
        const hit = dxSynByName(t);
        if (hit) x.syns[i] = hit.k;
      });
      const n = x.syns.filter(Boolean).length;
      if (n) x.breed = n >= 3 ? 'tri' : n === 2 ? 'cross' : 'pure';
    }
    const effs: DxEffect[] = [];
    const combos: DxCombo[] = [];
    for (const ln of lines) {
      const mc = ln.match(/^\/\/\s*コンボ[：:]\s*(.+)$/);
      if (mc) {
        const seg = mc[1].split('/').map((t) => t.trim());
        const cb = newDxCombo();
        cb.n = seg[0] ?? '';
        for (const t of seg.slice(1)) {
          const ma = t.match(/^攻撃力\s*(.+)$/);
          if (ma) {
            cb.atk = ma[1];
            continue;
          }
          if (!cb.hit) cb.hit = t;
        }
        if (cb.n) combos.push(cb);
        continue;
      }
      const me = ln.match(/^\/\/\s*(.+)$/);
      if (me) {
        let t = me[1].trim();
        const f = newDxEffect();
        const mk = t.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (mk) {
          const kd = DX3RD_KIND.find((y) => y.n === mk[1].trim());
          if (kd) f.kind = kd.k;
          t = mk[2].trim();
        }
        const parts = t.split('/').map((y) => y.trim());
        t = parts[0] ?? '';
        if (parts[1]) f.timing = parts[1];
        const ml = t.match(/^(.*?)\s*Lv\s*(\d+)\s*$/i);
        if (ml) {
          f.n = ml[1].trim();
          f.lv = ml[2];
        } else f.n = t;
        if (f.n) effs.push(f);
        continue;
      }
      const ms = ln.match(/^(\d+)\s*dx\s*@?\s*(\d*)/i);
      const nmx = ccfName(ln);
      if (ms && nmx) {
        const cut = nmx.split(/[:：]/);
        const base = cut[0].trim();
        const arg = (cut[1] ?? '').trim();
        const def = DX3RD_SKILL_DEFS.find((y) => y.n === base);
        if (def) {
          x.skills[def.k] = ms[1];
          if (def.arg && arg) x.sarg[def.k] = arg;
          rep.skills++;
        } else rep.unread++;
        continue;
      }
      rep.unread++;
    }
    if (effs.length) {
      x.effects = effs;
      rep.effects = effs.length;
    }
    if (combos.length) {
      x.combos = combos;
      rep.combos = combos.length;
    }
  } else {
    const c = np.coc;
    const v6 =
      lines.some((ln) => /^CCB\s*<=/i.test(ln)) && !lines.some((ln) => /^CC\s*<=/i.test(ln));
    c.ver = v6 ? '6' : '7';
    for (const [k, l] of COC_AB) if (ccfNum(P[l]) !== '') c.ab[k] = ccfNum(P[l]);
    if (ccfNum(P.BLD) !== '') c.sub.build = ccfNum(P.BLD);
    if (ccfNum(P.MOV) !== '') c.sub.mov = ccfNum(P.MOV);
    for (const k of ['HP', 'MP', 'SAN'] as const) {
      const v = ccfStat(ST, k);
      if (v) c.sub[k.toLowerCase() as 'hp' | 'mp' | 'san'] = v;
    }
    const lk = ccfStat(ST, '幸運');
    if (lk) c.sub.luck = lk;
    const SKIP = ['正気度ロール', 'アイデア', '幸運', '知識', 'ダメージ判定'];
    const abL = COC_AB.map(([, l]) => l as string);
    const got: CocSkill[] = [];
    for (const ln of lines) {
      const md = ln.match(/^\d+d\d+\s*([+-][^\s【]+)?\s*【ダメージ判定】/i);
      if (md) {
        if (md[1] && !String(c.sub.db ?? '').trim()) c.sub.db = md[1];
        continue;
      }
      const m = ln.match(/^(?:CCB?|1d100)\s*<=\s*([^\s【〈]*)/i);
      const nmx = ccfName(ln);
      if (!m || !nmx) {
        if (!/^\d+d\d+/i.test(ln)) rep.unread++;
        continue;
      }
      const v = ccfVar(m[1]) ? '' : ccfNum(m[1]);
      const plain = nmx.replace(/\s*[×xX]\s*5\s*$/, '').trim();
      if (abL.includes(plain)) continue;
      if (SKIP.includes(plain)) {
        if (v && plain === 'アイデア') c.sub.idea = v;
        if (v && plain === '知識') c.sub.know = v;
        if (v && plain === '幸運') c.sub.luck = v;
        continue;
      }
      const all = cocSkillsOf(c.ver, '');
      if (all.includes(plain)) {
        got.push({ n: plain, cat: cocCatOf(c.ver, plain), arg: '', v, free: false });
      } else {
        const cut = ccfArg(plain);
        got.push(
          all.includes(cut.base)
            ? {
                n: cut.base,
                cat: cocCatOf(c.ver, cut.base),
                arg: cocNeedsArg(c.ver, cut.base) ? cut.arg : '',
                v,
                free: false,
              }
            : { n: plain, cat: '', arg: '', v, free: true },
        );
      }
    }
    if (got.length) {
      c.skills = got.slice(0, COC_MAX_ROWS);
      rep.skills = Math.min(got.length, COC_MAX_ROWS);
      if (got.length > COC_MAX_ROWS) rep.over = got.length - COC_MAX_ROWS;
    }
  }
  return rep;
}

/* ---------- 讀入 Yutosheet 的表格（3.7.6） ---------- */

const YT_HEADS = ['コンボ名', '種別', '名称', 'エフェクト名'];

function ytUnesc(v: string): string {
  return String(v ?? '')
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function ytParse(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of String(text ?? '').split('\n')) {
    let ln = String(raw ?? '')
      .replace(/\t/g, ' ')
      .trim();
    if (!ln) continue;
    ln = ln.replace(/^[|｜]\s*/, '').replace(/[|｜]\s*$/, '');
    const f = ln.split('/').map(ytUnesc);
    if (f.length < 5) continue;
    if (YT_HEADS.includes(f[0])) continue;
    if (!f[0]) continue;
    rows.push(f);
  }
  return rows;
}

export function ytGuess(rows: readonly string[][]): 'combo' | 'effect' | null {
  if (!rows.length) return null;
  let cb = 0;
  let ef = 0;
  for (const f of rows) {
    if (/[〈《]/.test(f[1] ?? '') && /[+＋]/.test(f[1] ?? '')) cb++;
    if (/^\d{1,2}$/.test(String(f[2] ?? '').trim())) ef++;
    if (DX3RD_KIND.some((k) => k.n === String(f[0] ?? '').trim())) ef++;
  }
  return cb >= ef ? 'combo' : 'effect';
}

/** 取代效果表或組合技表（系統改成 DX3rd）；回傳讀入幾筆 */
export function ytApply(np: Npc, rows: readonly string[][], mode: 'combo' | 'effect'): number {
  if (np.sys !== 'dx3rd') np.sys = 'dx3rd';
  const d = np.dx3rd;
  const at = (f: readonly string[], i: number) => String(f[i] ?? '').trim();
  if (mode === 'combo') {
    const list = rows
      .map((f) => ({
        ...newDxCombo(),
        n: at(f, 0),
        cmb: at(f, 1),
        skill: at(f, 2),
        hit: at(f, 3),
        atk: at(f, 4),
        tgt: at(f, 5),
        rng: at(f, 6),
        enc: at(f, 7),
        cond: at(f, 8),
        eff: f.length > 10 ? f.slice(9).join(' / ').trim() : at(f, 9),
      }))
      .filter((x) => x.n);
    if (!list.length) return 0;
    d.combos = list;
    return list.length;
  }
  const list = rows
    .map((f) => {
      const kd = DX3RD_KIND.find((k) => k.n === at(f, 0));
      return {
        ...newDxEffect(),
        kind: kd ? kd.k : '',
        n: at(f, 1),
        lv: at(f, 2),
        timing: at(f, 3),
        skill: at(f, 4),
        dif: at(f, 5),
        tgt: at(f, 6),
        rng: at(f, 7),
        enc: at(f, 8),
        lim: at(f, 9),
      };
    })
    .filter((x) => x.n);
  if (!list.length) return 0;
  d.effects = list;
  return list.length;
}

export const SYS_SHORT: Record<NpcSystem, string> = {
  emoklore: 'Emoklore',
  dx3rd: 'Double Cross 3rd',
  coc: '克蘇魯',
};
