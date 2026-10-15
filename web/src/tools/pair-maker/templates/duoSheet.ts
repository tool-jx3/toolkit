/**
 * 雙人資料卡（1920 × 1080）：左右兩個角色鏡像排列。
 * 共用：背景（單色，或圖片＋模糊；2026-10）。
 * 每人：全身圖（外側直長、圖片本身往內淡出）、頭像（圓）、名字＋標語（字型可選、可縮小）、資料卡（兩段可以改標題的說明、
 * Q 版圖、身高、萌化、髮色與瞳色）、追加圖片 3 張、一句話說明。版面為本專案自行設計。
 */
import type { SceneNode } from '@/core/scene';
import {
  bool,
  citeId,
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
  citeNode,
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
/** 預設的底色（單色的預設值、圖片模式的底） */
export const DUO_BG = '#f3f1ec';
/** 背景圖的模糊（標準差；原作 Konva 的模糊半徑 10） */
export const DUO_BG_BLUR = 5;
const SIDES = ['left', 'right'] as const;
/**
 * 全身圖的寬與往內淡出的範圍（左邊的角色；右邊左右相反）：圖片從 x 252 起變透明、到格子內緣 x 340 剛好透明（同原作，7.2）；
 * 空格子的深色底維持以前的範圍（到 x 360 才透明），預設畫面逐像素不變。
 */
const FULL_W = 340;
const FADE_FROM = 252;
const EMPTY_FADE_TO = 360;

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
        { id: f('outfitTitle'), label: L.outfitTitle, type: 'text' },
        { id: f('outfit'), label: L.outfitBody, type: 'textarea' },
        { id: f('featuresTitle'), label: L.featuresTitle, type: 'text' },
        { id: f('features'), label: L.featuresBody, type: 'textarea' },
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

/** 共用：背景（單色／圖片；圖片時可以模糊） */
function commonGroups(): GroupDef[] {
  const isImage = { id: 'c.bgMode', is: 'image' } as const;
  return [
    {
      id: 'backdrop',
      label: L.backdrop,
      fields: [
        {
          id: 'c.bgMode',
          label: L.bgMode,
          type: 'radio',
          options: [
            { value: 'color', label: L.bgSolid },
            { value: 'image', label: L.bgImage },
          ],
        },
        { id: 'c.bgColor', label: L.bgColor, type: 'color', when: { id: 'c.bgMode', is: 'color' } },
        { id: 'c.bgBlur', label: L.bgBlur, type: 'checkbox', when: isImage },
      ],
      slots: [{ id: 'c.bg', label: L.bgSlot, width: W, height: H, when: isImage, after: true }],
    },
  ];
}

/** 2026-10（資料版本 2）新增的欄位與預設值 */
function addedIn2(): Record<string, Value> {
  const v: Record<string, Value> = { 'c.bgMode': 'color', 'c.bgColor': DUO_BG, 'c.bgBlur': false };
  for (const side of SIDES) {
    v[`${side}.outfitTitle`] = L.outfit;
    v[`${side}.featuresTitle`] = L.features;
  }
  return v;
}

function defaults(): Record<string, Value> {
  const v: Record<string, Value> = addedIn2();
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
    text(tx, 268, 270, 28, str(v, f('outfitTitle')), labelFont, '#323232', {
      align,
      shrink: 0.5,
      hit: h('looks', L.looks),
    }),
    text(tx, 300, 270, 84, str(v, f('outfit')), bodyFont, '#323232', {
      align,
      wrap: 'char',
      lineHeight: 1.45,
      hit: h('looks', L.looks),
    }),
    text(tx, 400, 270, 28, str(v, f('featuresTitle')), labelFont, '#323232', {
      align,
      shrink: 0.5,
      hit: h('looks', L.looks),
    }),
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

/**
 * 背景：單色時整張背景色；圖片時預設底色＋蓋滿的背景圖（模糊時四周用邊上的像素延伸），出處在下緣中央。
 * 整張是點選區（開啟「共用 背景」），上面的元素各自優先。
 */
function backdrop(d: Draft, env: SceneEnv): SceneNode[] {
  const v = d.v;
  const image = str(v, 'c.bgMode') === 'image';
  const nodes: SceneNode[] = [
    {
      kind: 'rect',
      x: 0,
      y: 0,
      w: W,
      h: H,
      fill: image ? DUO_BG : str(v, 'c.bgColor') || DUO_BG,
      hit: hit('common', 'backdrop', `${T.common}：${L.backdrop}`),
    },
  ];
  const img = image ? env.image('c.bg') : null;
  if (!img) return nodes;
  nodes.push({
    kind: 'image',
    x: 0,
    y: 0,
    w: W,
    h: H,
    image: img,
    ...(bool(v, 'c.bgBlur') ? { blur: DUO_BG_BLUR, blurEdge: 'clamp' as const } : {}),
  });
  const cite = str(v, citeId('c.bg')).trim();
  if (cite) nodes.push(citeNode(cite, W / 2 - 300, 0, 600, H));
  return nodes;
}

/**
 * 全身圖：圖片本身往畫布內側變透明，到格子內緣剛好透明（背景是顏色或圖片都會透出來，沒有直階）；
 * 空格子的深色底同樣淡出，範圍與 2026-10 以前「蓋一層底色漸層」相同（規格 3.11）。出處畫在淡出之後。
 */
function fullNodes(d: Draft, env: SceneEnv, side: string): SceneNode[] {
  const right = side === 'right';
  const x = right ? W - FULL_W : 0;
  const img = env.image(`${side}.full`);
  /* 空格子的淡出範圍（畫布座標）：左邊 252 → 360，右邊 1668 → 1560 */
  const x0 = right ? W - EMPTY_FADE_TO : FADE_FROM;
  const x1 = right ? W - FADE_FROM : EMPTY_FADE_TO;
  /* 圖片的淡出（格子內的比例）：左邊 252 → 340，右邊 1580 → 1668 */
  const solid = (FULL_W - FADE_FROM) / FULL_W;
  const dark = DARK_SLOT.empty;
  const clear = 'rgba(58,58,64,0)';
  const nodes: SceneNode[] = [
    {
      kind: 'rect',
      x,
      y: 0,
      w: FULL_W,
      h: H,
      fill: img
        ? 'rgba(0,0,0,0)'
        : {
            linear: {
              x0,
              y0: 0,
              x1,
              y1: 0,
              stops: right
                ? [
                    [0, clear],
                    [1, dark],
                  ]
                : [
                    [0, dark],
                    [1, clear],
                  ],
            },
          },
      hit: hit(side, 'full', `${sideLabel(side)}：${L.full}`),
    },
  ];
  if (img)
    nodes.push({
      kind: 'image',
      x,
      y: 0,
      w: FULL_W,
      h: H,
      image: img,
      fade: right
        ? { axis: 'x', from: 0, to: solid, reverse: true }
        : { axis: 'x', from: FADE_FROM / FULL_W, to: 1 },
    });
  else
    nodes.push(
      text(x, 0, FULL_W, H, '+', { family: SANS, weight: 300, size: 30 }, DARK_SLOT.plus, {
        align: 'center',
        valign: 'middle',
      }),
    );
  const cite = str(d.v, citeId(`${side}.full`)).trim();
  if (img && cite) nodes.push(citeNode(cite, x, 0, FULL_W, H, { citeBottom: 28 }));
  return nodes;
}

export const duoSheet: TemplateDef = {
  id: 'duo-sheet',
  name: L.name,
  tag: '資料整理',
  tip: L.tip,
  kind: 'fixed',
  initial: () => ({ v: defaults(), touched: {}, images: {}, stickers: [] }),
  size: () => ({ width: W, height: H }),
  sides: (): SideDef[] => [
    { id: 'common', label: T.common, groups: commonGroups() },
    ...SIDES.map((side) => ({
      id: side,
      label: sideLabel(side),
      heading: sideShort(side),
      groups: groups(side),
    })),
  ],
  defaults: () => defaults(),
  scene: (d, env) => [
    ...backdrop(d, env),
    ...fullNodes(d, env, 'left'),
    ...fullNodes(d, env, 'right'),
    { kind: 'line', points: [960, 170, 960, 1040], color: '#aaa59b', width: 1, dash: [14, 12] },
    ...sideNodes(d, env, 'left'),
    ...sideNodes(d, env, 'right'),
  ],
  stickerArea: () => ({ x: 0, y: 0, width: W, height: H }),
  /* 版本 1 沒有背景與段落標題：補上預設值（畫面與以前相同） */
  migrate: (raw) => ({ ...raw, v: { ...addedIn2(), ...raw.v } }),
};
