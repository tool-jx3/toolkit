/**
 * 雙人資料卡（1920 × 1080）：左右兩個角色鏡像排列。
 * 每人：全身圖（外側直長、往內淡出）、頭像（圓）、名字＋標語（字型可選、可縮小）、資料卡（服裝、外觀、Q 版圖、身高、萌化、
 * 髮色與瞳色）、追加圖片 3 張、一句話說明。版面為本專案自行設計。
 */
import type { SceneNode } from '@/core/scene';
import {
  bool,
  type Draft,
  type FieldDef,
  font,
  type GroupDef,
  hit,
  type SceneEnv,
  type SideDef,
  str,
  type TemplateDef,
  type Value,
} from '../model';
import { T } from '../strings';
import {
  CARD_SHADOW,
  DARK_SLOT,
  mirrorX,
  SANS,
  SOFT_SHADOW,
  sansFont,
  sceneFont,
  slotNodes,
  text,
} from './kit';

const L = T.duoSheet;
const W = 1920;
const H = 1080;
const BG = '#f3f1ec';
const SIDES = ['left', 'right'] as const;

const sideLabel = (side: string) => (side === 'left' ? T.left : T.right);
const sideShort = (side: string) => (side === 'left' ? T.leftShort : T.rightShort);

function groups(side: string): GroupDef[] {
  const f = (key: string) => `${side}.${key}`;
  const bgFields = (key: string): FieldDef[] => [
    { id: f(`${key}.bg`), label: L.bg, type: 'checkbox' },
    { id: f(`${key}.bgColor`), label: L.bgColor, type: 'color', when: f(`${key}.bg`) },
  ];
  return [
    {
      id: 'profile',
      label: L.profile,
      slots: [{ id: f('profile'), width: 180, height: 180, shape: 'circle' }],
      fields: bgFields('profile'),
    },
    {
      id: 'name',
      label: L.nameGroup,
      fields: [
        { id: f('name'), label: L.charName, type: 'text' },
        { id: f('nameColor'), label: L.charNameColor, type: 'color' },
        { id: f('motto'), label: L.motto, type: 'text' },
        { id: f('mottoColor'), label: L.mottoColor, type: 'color' },
        { id: f('mottoFont'), label: L.mottoFont, type: 'font', sampleOf: f('motto') },
        { id: f('small'), label: L.small, type: 'checkbox' },
      ],
    },
    { id: 'full', label: L.full, slots: [{ id: f('full'), width: 340, height: 1080 }], fields: [] },
    {
      id: 'chibi',
      label: L.chibi,
      slots: [{ id: f('chibi'), width: 210, height: 290, shape: 'round' }],
      fields: [],
    },
    {
      id: 'looks',
      label: L.looks,
      fields: [
        { id: f('outfit'), label: L.outfit, type: 'textarea' },
        { id: f('features'), label: L.features, type: 'textarea' },
        { id: f('height'), label: L.height, type: 'text' },
        { id: f('moe'), label: L.moe, type: 'text' },
      ],
    },
    {
      id: 'colors',
      label: L.colors,
      fields: [
        { id: f('hair'), label: L.hair, type: 'color', row: 'c' },
        { id: f('eyeL'), label: L.eyeL, type: 'color', row: 'c' },
        { id: f('eyeR'), label: L.eyeR, type: 'color', row: 'c' },
      ],
    },
    ...[1, 2, 3].map(
      (i): GroupDef => ({
        id: `extra${i}`,
        label: L.extra(i),
        slots: [{ id: f(`extra${i}`), width: 176, height: 176, shape: 'round' }],
        fields: bgFields(`extra${i}`),
      }),
    ),
    {
      id: 'line',
      label: L.line,
      fields: [
        { id: f('line'), label: L.lineText, type: 'textarea' },
        { id: f('lineBg'), label: L.lineBg, type: 'color', row: 'l' },
        { id: f('lineColor'), label: L.lineColor, type: 'color', row: 'l' },
      ],
    },
  ];
}

function defaults(): Record<string, Value> {
  const v: Record<string, Value> = {};
  for (const side of SIDES) {
    for (const key of ['profile', 'extra1', 'extra2', 'extra3']) {
      v[`${side}.${key}.bg`] = false;
      v[`${side}.${key}.bgColor`] = '#ffffff';
    }
    Object.assign(v, {
      [`${side}.name`]: L.sampleName,
      [`${side}.nameColor`]: '#323232',
      [`${side}.motto`]: L.sampleMotto,
      [`${side}.mottoColor`]: '#323232',
      [`${side}.mottoFont`]: sansFont(800),
      [`${side}.small`]: false,
      [`${side}.outfit`]: L.sampleText,
      [`${side}.features`]: L.sampleText,
      [`${side}.height`]: '',
      [`${side}.moe`]: '',
      [`${side}.hair`]: '#3a3a3a',
      [`${side}.eyeL`]: '#3a3a3a',
      [`${side}.eyeR`]: '#3a3a3a',
      [`${side}.line`]: L.sampleText,
      [`${side}.lineBg`]: '#3a3a3a',
      [`${side}.lineColor`]: '#ffffff',
    });
  }
  return v;
}

function sideNodes(d: Draft, env: SceneEnv, side: string): SceneNode[] {
  const v = d.v;
  const f = (key: string) => `${side}.${key}`;
  const mx = (x: number, w: number) => mirrorX(side, x, w, W);
  const right = side === 'right';
  const align = right ? 'right' : 'left';
  const h = (group: string, label: string) => hit(side, group, `${sideLabel(side)}：${label}`);
  const nodes: SceneNode[] = [];
  /* 資料卡 */
  nodes.push({
    kind: 'rect',
    x: mx(370, 560),
    y: 240,
    w: 560,
    h: 480,
    radius: 16,
    fill: '#ffffff',
    shadow: CARD_SHADOW,
    hit: h('looks', L.looks),
  });
  nodes.push(
    ...slotNodes(env, d, {
      id: f('profile'),
      x: mx(370, 180),
      y: 40,
      w: 180,
      h: 180,
      shape: 'circle',
      hit: h('profile', L.profile),
      style: { ...DARK_SLOT, shadow: SOFT_SHADOW },
      bg: { on: f('profile.bg'), color: f('profile.bgColor') },
    }),
  );
  const small = bool(v, f('small'));
  const nameSize = small ? 26 : 34;
  const mottoSize = small ? 34 : 56;
  nodes.push(
    text(
      mx(570, 360),
      small ? 76 : 60,
      360,
      nameSize * 1.3,
      str(v, f('name')),
      { family: SANS, weight: 700, size: nameSize },
      str(v, f('nameColor')),
      {
        align,
        shrink: 0.5,
        hit: h('name', L.nameGroup),
      },
    ),
    text(
      mx(570, 370),
      small ? 116 : 104,
      370,
      mottoSize * 1.3,
      str(v, f('motto')),
      sceneFont(font(v, f('mottoFont'), sansFont(800)), mottoSize),
      str(v, f('mottoColor')),
      { align, shrink: 0.5, hit: h('name', L.nameGroup) },
    ),
  );
  /* 卡片內：服裝、外觀 */
  const labelFont = { family: SANS, weight: 700, size: 20 };
  const bodyFont = { family: SANS, weight: 400, size: 18 };
  const tx = mx(400, 270);
  nodes.push(
    text(tx, 268, 270, 28, L.outfit, labelFont, '#323232', { align, hit: h('looks', L.looks) }),
    text(tx, 300, 270, 84, str(v, f('outfit')), bodyFont, '#323232', {
      align,
      wrap: 'char',
      lineHeight: 1.45,
      hit: h('looks', L.looks),
    }),
    text(tx, 400, 270, 28, L.features, labelFont, '#323232', { align, hit: h('looks', L.looks) }),
    text(tx, 432, 270, 150, str(v, f('features')), bodyFont, '#323232', {
      align,
      wrap: 'char',
      lineHeight: 1.45,
      hit: h('looks', L.looks),
    }),
  );
  nodes.push(
    ...slotNodes(env, d, {
      id: f('chibi'),
      x: mx(696, 210),
      y: 268,
      w: 210,
      h: 290,
      shape: 'round',
      radius: 12,
      hit: h('chibi', L.chibi),
      style: DARK_SLOT,
    }),
  );
  const grey = '#7b7b7b';
  nodes.push(
    text(
      mx(696, 210),
      570,
      210,
      28,
      `${str(v, f('height'))} cm`,
      { family: SANS, weight: 400, size: 20 },
      grey,
      {
        align: 'center',
        shrink: 0.6,
        hit: h('looks', L.looks),
      },
    ),
    text(
      mx(696, 210),
      604,
      210,
      28,
      `${str(v, f('moe'))}${L.moeSuffix}`,
      { family: SANS, weight: 400, size: 20 },
      grey,
      {
        align: 'center',
        shrink: 0.6,
        hit: h('looks', L.looks),
      },
    ),
  );
  /* 髮色與瞳色 */
  const capFont = { family: SANS, weight: 700, size: 18 };
  nodes.push(
    text(mx(400, 60), 598, 60, 26, L.hairCaption, capFont, '#323232', {
      align: 'center',
      hit: h('colors', L.colors),
    }),
    text(mx(490, 114), 598, 114, 26, L.eyesCaption, capFont, '#323232', {
      align: 'center',
      hit: h('colors', L.colors),
    }),
  );
  for (const [key, x] of [
    ['hair', 404],
    ['eyeL', 490],
    ['eyeR', 552],
  ] as const)
    nodes.push({
      kind: 'rect',
      x: mx(x, 52),
      y: 630,
      w: 52,
      h: 52,
      radius: 12,
      fill: str(v, f(key)),
      shadow: { color: 'rgba(0,0,0,0.2)', blur: 4, y: 1 },
      hit: h('colors', L.colors),
    });
  /* 追加圖片 */
  for (const [i, x] of [370, 562, 754].entries())
    nodes.push(
      ...slotNodes(env, d, {
        id: f(`extra${i + 1}`),
        x: mx(x, 176),
        y: 745,
        w: 176,
        h: 176,
        shape: 'round',
        radius: 14,
        hit: h(`extra${i + 1}`, L.extra(i + 1)),
        style: { ...DARK_SLOT, shadow: SOFT_SHADOW },
        bg: { on: f(`extra${i + 1}.bg`), color: f(`extra${i + 1}.bgColor`) },
      }),
    );
  /* 一句話說明 */
  nodes.push(
    {
      kind: 'rect',
      x: mx(370, 560),
      y: 938,
      w: 560,
      h: 102,
      radius: 14,
      fill: str(v, f('lineBg')),
      shadow: SOFT_SHADOW,
      hit: h('line', L.line),
    },
    text(
      mx(390, 520),
      944,
      520,
      90,
      str(v, f('line')),
      { family: SANS, weight: 400, size: 21 },
      str(v, f('lineColor')),
      {
        align: 'center',
        valign: 'middle',
        wrap: 'char',
        lineHeight: 1.5,
      },
    ),
  );
  return nodes;
}

function fullNodes(d: Draft, env: SceneEnv, side: string): SceneNode[] {
  const right = side === 'right';
  const x = right ? W - 340 : 0;
  const nodes = slotNodes(env, d, {
    id: `${side}.full`,
    x,
    y: 0,
    w: 340,
    h: H,
    hit: hit(side, 'full', `${sideLabel(side)}：${L.full}`),
    style: { ...DARK_SLOT, citeBottom: 28 },
  });
  /* 往內淡出到背景色（蓋在全身圖上） */
  const fx = right ? W - 360 : 0;
  const stops: [number, string][] = right
    ? [
        [0, BG],
        [0.3, 'rgba(243,241,236,0)'],
      ]
    : [
        [0.7, 'rgba(243,241,236,0)'],
        [1, BG],
      ];
  /* 出處要在淡出層上面：先畫圖、再淡出、最後出處 */
  const cite = nodes.find((n) => n.kind === 'text' && n.text.startsWith('ⓒ'));
  const rest = nodes.filter((n) => n !== cite);
  return [
    ...rest,
    {
      kind: 'rect',
      x: fx,
      y: 0,
      w: 360,
      h: H,
      fill: { linear: { x0: fx, y0: 0, x1: fx + 360, y1: 0, stops } },
    },
    ...(cite ? [cite] : []),
  ];
}

export const duoSheet: TemplateDef = {
  id: 'duo-sheet',
  name: L.name,
  tag: '資料整理',
  tip: L.tip,
  kind: 'fixed',
  initial: () => ({ v: defaults(), touched: {}, images: {}, stickers: [] }),
  size: () => ({ width: W, height: H }),
  sides: (): SideDef[] =>
    SIDES.map((side) => ({
      id: side,
      label: sideLabel(side),
      heading: sideShort(side),
      groups: groups(side),
    })),
  defaults: () => defaults(),
  scene: (d, env) => [
    { kind: 'rect', x: 0, y: 0, w: W, h: H, fill: BG },
    ...fullNodes(d, env, 'left'),
    ...fullNodes(d, env, 'right'),
    { kind: 'line', points: [960, 170, 960, 1040], color: '#aaa59b', width: 1, dash: [14, 12] },
    ...sideNodes(d, env, 'left'),
    ...sideNodes(d, env, 'right'),
  ],
  stickerArea: () => ({ x: 0, y: 0, width: W, height: H }),
};
