/**
 * 多人資料卡（1～30 人）：每人一張 615 × 694 的卡，一列最多 3 張；兩列以上的高度多 2 px（與舊版相同）。
 * 角色有編號（新增時取 1～30 沒用過的最小號），分頁名稱的預設號碼另外遞增（刪掉的號碼不會再用在預設名稱）。
 */
import type { SceneNode } from '@/core/scene';
import {
  type Draft,
  DraftError,
  type GroupDef,
  hit,
  type SceneEnv,
  type SideDef,
  str,
  type TemplateDef,
  type Value,
} from '../model';
import { T } from '../strings';
import { LIGHT_SLOT, SANS, slotNodes, text } from './kit';

const L = T.roster;
export const CARD_W = 615;
export const CARD_H = 694;
export const MAX_MEMBERS = 30;

export const memberSide = (n: number) => `m${n}`;
export const memberNo = (side: string): number | null => {
  const m = /^m(\d+)$/.exec(side);
  return m ? Number(m[1]) : null;
};

/** n 人時的畫布大小 */
export function rosterSize(count: number): { width: number; height: number } {
  const rows = Math.ceil(count / 3);
  return { width: Math.min(count, 3) * CARD_W, height: rows * CARD_H + (rows > 1 ? 2 : 0) };
}

/** 第 i 張（0 起算）的左上角 */
export function cardOrigin(i: number): { x: number; y: number } {
  const row = Math.floor(i / 3);
  return { x: (i % 3) * CARD_W, y: row * CARD_H + (row > 0 ? 2 : 0) };
}

/** 一個角色的預設值（no：分頁名稱的號碼） */
export function memberDefaults(n: number, no: number): Record<string, Value> {
  const s = memberSide(n);
  return {
    [`${s}.tab`]: L.member(no),
    [`${s}.mainBg`]: false,
    [`${s}.mainBgColor`]: '#ffffff',
    [`${s}.subBg`]: false,
    [`${s}.subBgColor`]: '#ffffff',
    [`${s}.extra`]: L.sampleExtra,
    [`${s}.name`]: L.sampleName,
    [`${s}.nameColor`]: '#ffffff',
    [`${s}.nameBg`]: '#3a3a40',
    [`${s}.height`]: '',
    [`${s}.hair`]: '#3a3a40',
    [`${s}.eyeL`]: '#3a3a40',
    [`${s}.eyeR`]: '#3a3a40',
    [`${s}.notes`]: L.sampleNotes,
  };
}

function groups(n: number): GroupDef[] {
  const s = memberSide(n);
  return [
    {
      id: 'main',
      label: L.main,
      slots: [{ id: `${s}.main`, width: 280, height: 400, shape: 'round' }],
      fields: [
        { id: `${s}.mainBg`, label: L.mainBg, type: 'checkbox' },
        { id: `${s}.mainBgColor`, label: L.mainBgColor, type: 'color', when: `${s}.mainBg` },
      ],
    },
    {
      id: 'sub',
      label: L.sub,
      slots: [{ id: `${s}.sub`, width: 256, height: 256, shape: 'circle' }],
      fields: [
        { id: `${s}.subBg`, label: L.subBg, type: 'checkbox' },
        { id: `${s}.subBgColor`, label: L.subBgColor, type: 'color', when: `${s}.subBg` },
      ],
    },
    {
      id: 'info',
      label: L.info,
      fields: [
        { id: `${s}.tab`, label: L.tab, type: 'text', max: 20, keep: true },
        { id: `${s}.extra`, label: L.extra, type: 'text', placeholder: L.extraPh },
        { id: `${s}.name`, label: L.charName, type: 'text' },
        { id: `${s}.nameColor`, label: L.nameColor, type: 'color', row: 'n' },
        { id: `${s}.nameBg`, label: L.nameBg, type: 'color', row: 'n' },
        {
          id: `${s}.height`,
          label: L.height,
          type: 'text',
          placeholder: L.heightPh,
          inputMode: 'decimal',
        },
        { id: `${s}.hair`, label: L.hair, type: 'color', row: 'c' },
        { id: `${s}.eyeL`, label: L.eyeL, type: 'color', row: 'c' },
        { id: `${s}.eyeR`, label: L.eyeR, type: 'color', row: 'c' },
        { id: `${s}.notes`, label: L.notes, type: 'textarea' },
      ],
    },
  ];
}

/** 身高：只寫數字（含小數）時加 cm，否則只顯示 cm */
export const heightText = (raw: string): string => {
  const t = raw.trim();
  return /^\d+(?:\.\d+)?$/.test(t) ? `${t}cm` : 'cm';
};

export const members = (d: Draft): number[] => (d.members?.length ? d.members : [1]);

function cardNodes(d: Draft, env: SceneEnv, n: number, x: number, y: number): SceneNode[] {
  const v = d.v;
  const s = memberSide(n);
  const tab = str(v, `${s}.tab`) || L.member(n);
  const h = (g: string, label: string) => hit(s, g, `${tab}：${label}`);
  const nodes: SceneNode[] = [
    /* 整張卡的點選範圍（資訊） */
    { kind: 'rect', x, y, w: CARD_W, h: CARD_H, fill: 'rgba(0,0,0,0)', hit: h('info', L.info) },
    /* 追加資訊的小標籤 */
    { kind: 'rect', x: x + 232, y: y + 24, w: 151, h: 42, radius: 21, fill: '#3a3a40' },
    text(
      x + 240,
      y + 24,
      135,
      42,
      str(v, `${s}.extra`),
      { family: SANS, weight: 600, size: 18 },
      '#ffffff',
      {
        align: 'center',
        valign: 'middle',
        shrink: 0.5,
      },
    ),
    /* 名字 */
    { kind: 'rect', x: x + 24, y: y + 80, w: 567, h: 60, radius: 30, fill: str(v, `${s}.nameBg`) },
    text(
      x + 44,
      y + 80,
      527,
      60,
      str(v, `${s}.name`),
      { family: SANS, weight: 700, size: 32 },
      str(v, `${s}.nameColor`),
      {
        align: 'center',
        valign: 'middle',
        shrink: 0.5,
      },
    ),
  ];
  nodes.push(
    ...slotNodes(env, d, {
      id: `${s}.main`,
      x: x + 24,
      y: y + 160,
      w: 280,
      h: 400,
      shape: 'round',
      radius: 24,
      hit: h('main', L.main),
      style: { ...LIGHT_SLOT, citeBottom: 26, citeInset: 18 },
      bg: { on: `${s}.mainBg`, color: `${s}.mainBgColor` },
    }),
    ...slotNodes(env, d, {
      id: `${s}.sub`,
      x: x + 330,
      y: y + 160,
      w: 256,
      h: 256,
      shape: 'circle',
      hit: h('sub', L.sub),
      style: { ...LIGHT_SLOT, citeBottom: 30, citeInset: 30 },
      bg: { on: `${s}.subBg`, color: `${s}.subBgColor` },
    }),
  );
  /* 其他事項 */
  nodes.push(
    {
      kind: 'rect',
      x: x + 330,
      y: y + 436,
      w: 261,
      h: 234,
      radius: 12,
      fill: 'rgba(255,255,255,0.6)',
      stroke: { color: '#b5b5b5', width: 1 },
      hit: h('info', L.info),
    },
    text(
      x + 350,
      y + 452,
      220,
      28,
      L.notesCaption,
      { family: SANS, weight: 400, size: 18 },
      '#8b8b8b',
    ),
    text(
      x + 350,
      y + 488,
      222,
      168,
      str(v, `${s}.notes`),
      { family: SANS, weight: 400, size: 18 },
      '#323232',
      {
        wrap: 'char',
        lineHeight: 1.45,
      },
    ),
  );
  /* 身高、髮色、瞳色 */
  const cap = { family: SANS, weight: 400, size: 18 };
  nodes.push(
    text(
      x + 24,
      y + 616,
      74,
      30,
      heightText(str(v, `${s}.height`)),
      { family: SANS, weight: 500, size: 20 },
      '#212121',
      {
        align: 'center',
        valign: 'middle',
        shrink: 0.5,
      },
    ),
    text(x + 104, y + 574, 56, 24, L.hairCaption, cap, '#8b8b8b', { align: 'center' }),
    text(x + 172, y + 574, 120, 24, L.eyesCaption, cap, '#8b8b8b', { align: 'center' }),
  );
  for (const [key, cx] of [
    ['hair', 104],
    ['eyeL', 172],
    ['eyeR', 236],
  ] as const)
    nodes.push({
      kind: 'rect',
      x: x + cx,
      y: y + 604,
      w: 56,
      h: 56,
      circle: true,
      fill: str(v, `${s}.${key}`),
    });
  return nodes;
}

/** 卡與卡之間的虛線 */
function separators(count: number, width: number): SceneNode[] {
  const out: SceneNode[] = [];
  const rows = Math.ceil(count / 3);
  for (let r = 0; r < rows; r++) {
    const y = r * CARD_H + (r > 0 ? 2 : 0);
    const cols = Math.min(3, count - r * 3);
    for (let c = 1; c < cols; c++)
      out.push({
        kind: 'line',
        points: [c * CARD_W, y + 41, c * CARD_W, y + 674],
        color: '#acacac',
        width: 1,
        dash: [12, 12],
      });
    if (r > 0)
      out.push({
        kind: 'line',
        points: [20, y - 3, width - 20, y - 3],
        color: '#acacac',
        width: 1,
        dash: [12, 12],
      });
  }
  return out;
}

/** 只看某一張時的場景（顯示用，不輸出） */
export function soloScene(d: Draft, env: SceneEnv, n: number): SceneNode[] {
  return [
    { kind: 'rect', x: 0, y: 0, w: CARD_W, h: CARD_H, fill: '#fbfbfb' },
    ...cardNodes(d, env, n, 0, 0),
  ];
}

export const roster: TemplateDef = {
  id: 'roster',
  name: L.name,
  tag: '資料整理',
  tip: L.tip,
  kind: 'roster',
  initial: () => ({
    v: memberDefaults(1, 1),
    touched: {},
    images: {},
    stickers: [],
    members: [1],
    nextNo: 2,
  }),
  size: (d) => rosterSize(members(d).length),
  sides: (d): SideDef[] =>
    members(d).map((n) => {
      const label = str(d.v, `${memberSide(n)}.tab`) || L.member(n);
      return { id: memberSide(n), label, groups: groups(n) };
    }),
  defaults: (d) => {
    const out: Record<string, Value> = {};
    for (const n of members(d)) {
      const s = memberSide(n);
      Object.assign(out, memberDefaults(n, n));
      /* 分頁名稱不自動清空；其餘欄位的預設值與號碼無關 */
      out[`${s}.tab`] = d.v[`${s}.tab`] ?? out[`${s}.tab`];
    }
    return out;
  },
  scene: (d, env) => {
    const list = members(d);
    const size = rosterSize(list.length);
    return [
      { kind: 'rect', x: 0, y: 0, w: size.width, h: size.height, fill: '#fbfbfb' },
      ...separators(list.length, size.width),
      ...list.flatMap((n, i) => {
        const o = cardOrigin(i);
        return cardNodes(d, env, n, o.x, o.y);
      }),
    ];
  },
  stickerArea: (d) => ({ x: 0, y: 0, ...rosterSize(members(d).length) }),
  restore: (raw) => {
    const list = raw.members;
    if (
      !Array.isArray(list) ||
      !list.length ||
      list.length > MAX_MEMBERS ||
      list.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_MEMBERS) ||
      new Set(list).size !== list.length
    )
      throw new DraftError('角色清單不正確。');
    const nextNo = raw.nextNo;
    if (typeof nextNo !== 'number' || !Number.isSafeInteger(nextNo) || nextNo < 2)
      throw new DraftError('角色編號不正確。');
    const v: Record<string, Value> = {};
    for (const n of list) Object.assign(v, memberDefaults(n, n));
    return { v, touched: {}, images: {}, stickers: [], members: [...list], nextNo };
  },
};

/* ---------- 角色的新增、刪除、移動（回傳新的 Draft；做不到時 null） ---------- */

export function addMember(d: Draft): { draft: Draft; side: string } | null {
  const list = members(d);
  if (list.length >= MAX_MEMBERS) return null;
  const n = Array.from({ length: MAX_MEMBERS }, (_, i) => i + 1).find((k) => !list.includes(k));
  if (!n) return null;
  const no = d.nextNo ?? list.length + 1;
  return {
    draft: { ...d, members: [...list, n], nextNo: no + 1, v: { ...d.v, ...memberDefaults(n, no) } },
    side: memberSide(n),
  };
}

export function removeMember(d: Draft, side: string): Draft | null {
  const list = members(d);
  const n = memberNo(side);
  if (n === null || list.length <= 1 || !list.includes(n)) return null;
  const prefix = `${side}.`;
  const keep = <T>(m: Record<string, T>) =>
    Object.fromEntries(
      Object.entries(m).filter(([k]) => !k.startsWith(prefix) && !k.startsWith(`cite:${prefix}`)),
    );
  return {
    ...d,
    members: list.filter((k) => k !== n),
    v: keep(d.v),
    touched: keep(d.touched) as Record<string, true>,
    images: keep(d.images),
  };
}

export function moveMember(d: Draft, side: string, dir: -1 | 1): Draft | null {
  const list = [...members(d)];
  const i = list.indexOf(memberNo(side) ?? -1);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return null;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...d, members: list };
}
