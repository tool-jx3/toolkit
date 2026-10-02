/**
 * 雙人配對・主題背景（1920 × 1080）：背景可選亮色／暗色主題（程式繪製）或自己的圖片，可模糊。
 * 共用：主要圖片（左側直長）、配對名稱、關鍵字、參考圖 3 組（圓形＋標題＋詳細內容）。
 * 左右角色：頭像、萌化圖、身高、動物化標籤、髮色與瞳色、其他事項。版面為本專案自行設計。
 */
import type { SceneNode } from '@/core/scene';
import {
  type Draft,
  type GroupDef,
  hit,
  type SceneEnv,
  type SideDef,
  str,
  type TemplateDef,
  type Value,
} from '../model';
import { T } from '../strings';
import { CARD_SHADOW, DARK_SLOT, SANS, SOFT_SHADOW, slotNodes, text, themeImage } from './kit';

const L = T.duoTheme;
const W = 1920;
const H = 1080;
const CHARS = ['left', 'right'] as const;
const PILL = '#45454c';

const charLabel = (side: string) => (side === 'left' ? T.left : T.right);

function commonGroups(): GroupDef[] {
  return [
    {
      id: 'backdrop',
      label: L.backdrop,
      fields: [
        {
          id: 'c.mode',
          label: L.mode,
          type: 'radio',
          options: [
            { value: 'light', label: L.light },
            { value: 'dark', label: L.dark },
            { value: 'image', label: L.image },
          ],
        },
        { id: 'c.bg', label: L.bgCheck, type: 'checkbox', when: { id: 'c.mode', is: 'image' } },
        { id: 'c.bgColor', label: L.bgColor, type: 'color', when: { id: 'c.mode', is: 'image' } },
        { id: 'c.blur', label: L.blur, type: 'checkbox' },
      ],
      slots: [
        { id: 'c.backdrop', width: W, height: H, when: { id: 'c.mode', is: 'image' }, after: true },
      ],
    },
    { id: 'main', label: L.main, fields: [], slots: [{ id: 'c.main', width: 520, height: H }] },
    {
      id: 'pair',
      label: L.mainInfo,
      fields: [
        { id: 'c.pair', label: L.pairName, type: 'text' },
        { id: 'c.pairBg', label: L.boxBg, type: 'color', row: 'p' },
        { id: 'c.pairColor', label: L.boxColor, type: 'color', row: 'p' },
      ],
    },
    {
      id: 'keyword',
      label: L.keyword,
      fields: [
        { id: 'c.kw', label: L.keyword, type: 'text' },
        { id: 'c.kwBg', label: L.boxBg, type: 'color', row: 'k' },
        { id: 'c.kwColor', label: L.boxColor, type: 'color', row: 'k' },
      ],
    },
    ...[1, 2, 3].map(
      (i): GroupDef => ({
        id: `ref${i}`,
        label: L.ref(i),
        slots: [{ id: `c.ref${i}`, width: 230, height: 230, shape: 'circle' }],
        fields: [
          { id: `c.ref${i}.bg`, label: L.bgCheck, type: 'checkbox' },
          { id: `c.ref${i}.bgColor`, label: L.bgColor, type: 'color', when: `c.ref${i}.bg` },
          { id: `c.ref${i}.title`, label: L.refTitle, type: 'text' },
          { id: `c.ref${i}.text`, label: L.refText, type: 'textarea' },
        ],
      }),
    ),
  ];
}

function charGroups(side: string): GroupDef[] {
  const f = (k: string) => `${side}.${k}`;
  return [
    {
      id: 'profile',
      label: L.profile,
      slots: [{ id: f('profile'), width: 124, height: 124, shape: 'circle' }],
      fields: [
        { id: f('profile.bg'), label: L.bgCheck, type: 'checkbox' },
        { id: f('profile.bgColor'), label: L.bgColor, type: 'color', when: f('profile.bg') },
      ],
    },
    {
      id: 'moe',
      label: L.moe,
      slots: [{ id: f('moe'), width: 230, height: 320 }],
      fields: [
        { id: f('height'), label: L.height, type: 'text' },
        { id: f('animal'), label: L.animal, type: 'text' },
        { id: f('animalBg'), label: L.animalBg, type: 'color', row: 'a' },
        { id: f('animalColor'), label: L.animalColor, type: 'color', row: 'a' },
        { id: f('hair'), label: L.hair, type: 'color', row: 'c' },
        { id: f('eyeL'), label: L.eyeL, type: 'color', row: 'c' },
        { id: f('eyeR'), label: L.eyeR, type: 'color', row: 'c' },
      ],
    },
    {
      id: 'notes',
      label: L.notes,
      fields: [{ id: f('notes'), label: L.notesText, type: 'textarea' }],
    },
  ];
}

function defaults(): Record<string, Value> {
  const v: Record<string, Value> = {
    'c.mode': 'light',
    'c.bg': false,
    'c.bgColor': '#ffffff',
    'c.blur': true,
    'c.pair': L.pairName,
    'c.pairBg': '#ffffff',
    'c.pairColor': '#323232',
    'c.kw': L.keyword,
    'c.kwBg': '#ffffff',
    'c.kwColor': '#323232',
  };
  for (const i of [1, 2, 3]) {
    v[`c.ref${i}.bg`] = false;
    v[`c.ref${i}.bgColor`] = '#ffffff';
    v[`c.ref${i}.title`] = L.sampleTitle;
    v[`c.ref${i}.text`] = L.sampleText;
  }
  for (const side of CHARS)
    Object.assign(v, {
      [`${side}.profile.bg`]: false,
      [`${side}.profile.bgColor`]: '#ffffff',
      [`${side}.height`]: L.height,
      [`${side}.animal`]: L.animal,
      [`${side}.animalBg`]: '#dfe3e6',
      [`${side}.animalColor`]: '#323232',
      [`${side}.hair`]: '#3a3a3a',
      [`${side}.eyeL`]: '#3a3a3a',
      [`${side}.eyeR`]: '#3a3a3a',
      [`${side}.notes`]: L.sampleNotes,
    });
  return v;
}

function backdrop(d: Draft, env: SceneEnv): SceneNode[] {
  const v = d.v;
  const mode = str(v, 'c.mode') || 'light';
  const blur = v['c.blur'] === true ? 10 : undefined;
  const h = hit('common', 'backdrop', `${T.common}：${L.backdrop}`);
  if (mode !== 'image')
    return [
      {
        kind: 'rect',
        x: 0,
        y: 0,
        w: W,
        h: H,
        fill: mode === 'dark' ? '#17181d' : '#f6f5f8',
        hit: h,
      },
      {
        kind: 'image',
        x: 0,
        y: 0,
        w: W,
        h: H,
        image: themeImage(mode === 'dark' ? 'duo-dark' : 'duo-light'),
        blur,
      },
    ];
  const img = env.image('c.backdrop');
  const nodes: SceneNode[] = [
    {
      kind: 'rect',
      x: 0,
      y: 0,
      w: W,
      h: H,
      fill: v['c.bg'] === true ? str(v, 'c.bgColor') : 'rgba(0,0,0,0)',
      hit: h,
    },
  ];
  if (img) nodes.push({ kind: 'image', x: 0, y: 0, w: W, h: H, image: img, blur });
  else
    nodes.push(
      text(1290, 0, 630, H, '+', { family: SANS, weight: 300, size: 30 }, '#8a8a92', {
        align: 'center',
        valign: 'middle',
      }),
    );
  const cite = str(v, 'cite:c.backdrop').trim();
  if (img && cite)
    nodes.push(
      text(
        10,
        H - 22,
        W - 20,
        undefined,
        `ⓒ ${cite}`,
        { family: SANS, weight: 400, size: 14 },
        '#5f5f5f',
        {
          align: 'right',
          stroke: { color: '#ffffff', width: 2 },
        },
      ),
    );
  return nodes;
}

function charNodes(d: Draft, env: SceneEnv, side: string): SceneNode[] {
  const v = d.v;
  const f = (k: string) => `${side}.${k}`;
  const left = side === 'left';
  const x0 = left ? 580 : 920;
  const h = (g: string, label: string) => hit(side, g, `${charLabel(side)}：${label}`);
  const nodes: SceneNode[] = [];
  /* 頭像＋字母徽章 */
  const px = left ? 588 : 1088;
  nodes.push(
    ...slotNodes(env, d, {
      id: f('profile'),
      x: px,
      y: 36,
      w: 124,
      h: 124,
      shape: 'circle',
      hit: h('profile', L.profile),
      style: { ...DARK_SLOT, shadow: SOFT_SHADOW, citeBottom: 22, citeInset: 0 },
      bg: { on: f('profile.bg'), color: f('profile.bgColor') },
    }),
    {
      kind: 'rect',
      x: px + 92,
      y: 36 + 90,
      w: 36,
      h: 36,
      circle: true,
      fill: PILL,
      shadow: SOFT_SHADOW,
    },
    text(
      px + 92,
      36 + 90,
      36,
      36,
      left ? 'A' : 'B',
      { family: SANS, weight: 700, size: 18 },
      '#ffffff',
      {
        align: 'center',
        valign: 'middle',
      },
    ),
  );
  /* 資料列 */
  const cap = { family: SANS, weight: 400, size: 14 };
  nodes.push(
    text(x0, 212, 44, 20, L.hairCaption, cap, '#6d6d6d', { align: 'center' }),
    text(x0 + 50, 212, 200, 20, `${str(v, f('height'))}${L.heightSuffix}`, cap, '#6d6d6d', {
      align: 'center',
      shrink: 0.6,
      hit: h('moe', L.moe),
    }),
    text(x0 + 256, 212, 44, 20, L.eyesCaption, cap, '#6d6d6d', { align: 'center' }),
    {
      kind: 'rect',
      x: x0 + 7,
      y: 238,
      w: 30,
      h: 30,
      circle: true,
      fill: str(v, f('hair')),
      hit: h('moe', L.moe),
    },
    {
      kind: 'rect',
      x: x0 + 50,
      y: 236,
      w: 200,
      h: 34,
      radius: 17,
      fill: str(v, f('animalBg')),
      hit: h('moe', L.moe),
    },
    text(
      x0 + 50,
      236,
      200,
      34,
      str(v, f('animal')),
      { family: SANS, weight: 600, size: 15 },
      str(v, f('animalColor')),
      {
        align: 'center',
        valign: 'middle',
        shrink: 0.5,
      },
    ),
    {
      kind: 'rect',
      x: x0 + 258,
      y: 244,
      w: 18,
      h: 18,
      circle: true,
      fill: str(v, f('eyeL')),
      hit: h('moe', L.moe),
    },
    {
      kind: 'rect',
      x: x0 + 280,
      y: 244,
      w: 18,
      h: 18,
      circle: true,
      fill: str(v, f('eyeR')),
      hit: h('moe', L.moe),
    },
  );
  nodes.push(
    ...slotNodes(env, d, {
      id: f('moe'),
      x: x0 + 35,
      y: 290,
      w: 230,
      h: 320,
      hit: h('moe', L.moe),
      style: DARK_SLOT,
    }),
  );
  /* 其他事項 */
  nodes.push(
    {
      kind: 'rect',
      x: x0 + 75,
      y: 766,
      w: 150,
      h: 34,
      radius: 17,
      fill: PILL,
      hit: h('notes', L.notes),
    },
    text(
      x0 + 75,
      766,
      150,
      34,
      L.notesCaption,
      { family: SANS, weight: 600, size: 15 },
      '#ffffff',
      {
        align: 'center',
        valign: 'middle',
      },
    ),
    text(
      x0 + 12,
      816,
      276,
      206,
      str(v, f('notes')),
      { family: SANS, weight: 400, size: 16 },
      '#323232',
      {
        wrap: 'char',
        lineHeight: 1.5,
        hit: h('notes', L.notes),
      },
    ),
  );
  return nodes;
}

function commonNodes(d: Draft, env: SceneEnv): SceneNode[] {
  const v = d.v;
  const h = (g: string, label: string) => hit('common', g, `${T.common}：${label}`);
  const nodes: SceneNode[] = [
    ...slotNodes(env, d, {
      id: 'c.main',
      x: 0,
      y: 0,
      w: 520,
      h: H,
      hit: h('main', L.main),
      style: { ...DARK_SLOT, citeBottom: 28 },
    }),
    /* 配對名稱與關鍵字 */
    {
      kind: 'rect',
      x: 740,
      y: 40,
      w: 320,
      h: 46,
      radius: 23,
      fill: str(v, 'c.pairBg'),
      shadow: CARD_SHADOW,
      hit: h('pair', L.mainInfo),
    },
    text(
      752,
      40,
      296,
      46,
      str(v, 'c.pair'),
      { family: SANS, weight: 600, size: 18 },
      str(v, 'c.pairColor'),
      {
        align: 'center',
        valign: 'middle',
        shrink: 0.5,
      },
    ),
    {
      kind: 'rect',
      x: 740,
      y: 98,
      w: 320,
      h: 66,
      radius: 12,
      fill: str(v, 'c.kwBg'),
      shadow: CARD_SHADOW,
      hit: h('keyword', L.keyword),
    },
    text(
      752,
      98,
      296,
      66,
      str(v, 'c.kw'),
      { family: SANS, weight: 400, size: 16 },
      str(v, 'c.kwColor'),
      {
        align: 'center',
        valign: 'middle',
        shrink: 0.5,
      },
    ),
    /* 兩張卡片 */
    {
      kind: 'rect',
      x: 560,
      y: 196,
      w: 680,
      h: 520,
      radius: 16,
      fill: '#ffffff',
      shadow: CARD_SHADOW,
    },
    { kind: 'line', points: [900, 220, 900, 692], color: '#b4b4b4', width: 1, dash: [10, 5] },
    {
      kind: 'rect',
      x: 560,
      y: 744,
      w: 680,
      h: 300,
      radius: 16,
      fill: '#ffffff',
      shadow: CARD_SHADOW,
    },
    { kind: 'line', points: [900, 770, 900, 1020], color: '#b4b4b4', width: 1, dash: [10, 5] },
    { kind: 'line', points: [1268, 60, 1268, 1020], color: '#b4b4b4', width: 1, dash: [10, 5] },
  ];
  /* 參考圖 */
  for (const i of [1, 2, 3]) {
    const y0 = 60 + (i - 1) * 340;
    const g = `ref${i}`;
    nodes.push(
      ...slotNodes(env, d, {
        id: `c.ref${i}`,
        x: 1300,
        y: y0,
        w: 230,
        h: 230,
        shape: 'circle',
        hit: h(g, L.ref(i)),
        style: { ...DARK_SLOT, shadow: SOFT_SHADOW, citeBottom: 34 },
        bg: { on: `c.ref${i}.bg`, color: `c.ref${i}.bgColor` },
      }),
      {
        kind: 'rect',
        x: 1556,
        y: y0 + 74,
        w: 316,
        h: 168,
        radius: 12,
        fill: '#ffffff',
        shadow: CARD_SHADOW,
        hit: h(g, L.ref(i)),
      },
      {
        kind: 'rect',
        x: 1584,
        y: y0 + 18,
        w: 260,
        h: 40,
        radius: 20,
        fill: PILL,
        shadow: SOFT_SHADOW,
        hit: h(g, L.ref(i)),
      },
      text(
        1594,
        y0 + 18,
        240,
        40,
        str(v, `c.ref${i}.title`),
        { family: SANS, weight: 600, size: 16 },
        '#ffffff',
        {
          align: 'center',
          valign: 'middle',
          shrink: 0.5,
        },
      ),
      text(
        1572,
        y0 + 90,
        284,
        140,
        str(v, `c.ref${i}.text`),
        { family: SANS, weight: 400, size: 16 },
        '#323232',
        {
          wrap: 'char',
          lineHeight: 1.5,
        },
      ),
    );
  }
  return nodes;
}

export const duoTheme: TemplateDef = {
  id: 'duo-theme',
  name: L.name,
  tag: '資料整理',
  tip: L.tip,
  kind: 'fixed',
  initial: () => ({ v: defaults(), touched: {}, images: {}, stickers: [] }),
  size: () => ({ width: W, height: H }),
  sides: (): SideDef[] => [
    { id: 'common', label: T.common, groups: commonGroups() },
    ...CHARS.map((side) => ({
      id: side,
      label: charLabel(side),
      heading: side === 'left' ? T.leftShort : T.rightShort,
      groups: charGroups(side),
    })),
  ],
  defaults: () => defaults(),
  scene: (d, env) => [
    ...backdrop(d, env),
    ...commonNodes(d, env),
    ...charNodes(d, env, 'left'),
    ...charNodes(d, env, 'right'),
  ],
  stickerArea: () => ({ x: 0, y: 0, width: W, height: H }),
};
