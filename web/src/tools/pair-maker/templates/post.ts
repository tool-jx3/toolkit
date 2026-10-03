/**
 * 置頂貼文（1920 × 1080）：背景（亮色／暗色主題或單色）、右側直長主要圖片（左半部漸漸透明）、
 * 名字・年齡、第二名字、標語、關鍵字，以及兩段格式化文字（角色性向、主人性向）。版面為本專案自行設計。
 */
import { plainDoc } from '@/core/richtext';
import type { SceneNode } from '@/core/scene';
import {
  type Draft,
  font,
  hit,
  rich,
  type SceneEnv,
  str,
  type TemplateDef,
  type Value,
} from '../model';
import { T } from '../strings';
import { CARD_SHADOW, citeNode, SANS, sansFont, sceneFont, text, themeImage } from './kit';

const L = T.post;
const W = 1920;
const H = 1080;
const SIDE = 'post';
const TEXT = '#363636';

function defaults(): Record<string, Value> {
  return {
    'p.mode': 'light',
    'p.bgColor': '#f3f3f3',
    'p.name': L.sampleName,
    'p.age': L.sampleAge,
    'p.nameColor': TEXT,
    'p.sub': L.sampleSub,
    'p.subFont': sansFont(300),
    'p.subColor': TEXT,
    'p.motto': L.sampleMotto,
    'p.mottoFont': sansFont(400),
    'p.mottoColor': TEXT,
    'p.kw': L.sampleKeyword,
    'p.kwColor': '#6d6d6d',
    'p.char': plainDoc(L.sampleChar, TEXT),
    'p.owner': plainDoc(L.sampleOwner, TEXT),
  };
}

function scene(d: Draft, env: SceneEnv): SceneNode[] {
  const v = d.v;
  const mode = str(v, 'p.mode') || 'light';
  const h = (g: string, label: string) => hit(SIDE, g, `${L.side}：${label}`);
  const nodes: SceneNode[] = [
    {
      kind: 'rect',
      x: 0,
      y: 0,
      w: W,
      h: H,
      fill: mode === 'solid' ? str(v, 'p.bgColor') : mode === 'dark' ? '#25262b' : '#f3f3f3',
      hit: h('back', L.back),
    },
  ];
  if (mode !== 'solid')
    nodes.push({
      kind: 'image',
      x: 0,
      y: 0,
      w: W,
      h: H,
      image: themeImage(mode === 'dark' ? 'post-dark' : 'post-light'),
    });
  /* 右側主要圖片 */
  const img = env.image('p.main');
  nodes.push({
    kind: 'rect',
    x: 1260,
    y: 0,
    w: 660,
    h: H,
    fill: img ? 'rgba(0,0,0,0)' : '#45454c',
    hit: h('image', L.image),
  });
  if (img)
    nodes.push({
      kind: 'image',
      x: 1260,
      y: 0,
      w: 660,
      h: H,
      image: img,
      fade: { axis: 'x', from: 0.5, to: 0 },
    });
  else
    nodes.push(
      text(1260, 0, 660, H, '+', { family: SANS, weight: 300, size: 30 }, '#ffffff', {
        align: 'center',
        valign: 'middle',
      }),
    );
  const cite = str(v, 'cite:p.main').trim();
  if (img && cite) nodes.push(citeNode(cite, 1270, 0, 640, H, { citeBottom: 30 }));
  /* 名字、標語 */
  const name = str(v, 'p.name');
  const age = str(v, 'p.age');
  const hi = h('info', L.info);
  nodes.push(
    text(
      48,
      40,
      700,
      48,
      name && age ? `${name} · ${age}` : name || age,
      { family: SANS, weight: 400, size: 36 },
      str(v, 'p.nameColor'),
      {
        letterSpacing: -0.9,
        shrink: 0.5,
        hit: hi,
      },
    ),
    text(
      44,
      88,
      760,
      116,
      str(v, 'p.sub'),
      sceneFont(font(v, 'p.subFont', sansFont(300)), 96),
      str(v, 'p.subColor'),
      {
        valign: 'middle',
        shrink: 0.4,
        hit: hi,
      },
    ),
    text(
      560,
      40,
      660,
      88,
      str(v, 'p.motto'),
      sceneFont(font(v, 'p.mottoFont', sansFont(400)), 64),
      str(v, 'p.mottoColor'),
      {
        align: 'right',
        valign: 'middle',
        shrink: 0.4,
        hit: hi,
      },
    ),
    text(
      560,
      136,
      660,
      34,
      str(v, 'p.kw'),
      { family: SANS, weight: 400, size: 24 },
      str(v, 'p.kwColor'),
      {
        align: 'right',
        shrink: 0.5,
        hit: hi,
      },
    ),
  );
  /* 介紹面板 */
  const hc = h('char', L.charText);
  const ho = h('owner', L.ownerText);
  const body = { family: SANS, weight: 400, size: 24 };
  nodes.push(
    {
      kind: 'rect',
      x: 48,
      y: 212,
      w: 1172,
      h: 822,
      radius: 12,
      fill: 'rgba(255,255,255,0.74)',
      shadow: CARD_SHADOW,
    },
    text(104, 248, 600, 44, L.charHeading, { family: SANS, weight: 500, size: 32 }, '#202020', {
      hit: hc,
    }),
    { kind: 'rect', x: 104, y: 302, w: 1060, h: 294, fill: 'rgba(0,0,0,0)', hit: hc },
    {
      kind: 'rich',
      x: 104,
      y: 302,
      w: 1060,
      h: 294,
      doc: rich(v, 'p.char'),
      font: body,
      lineHeight: 1.5,
      letterSpacing: -0.6,
    },
    { kind: 'line', points: [104, 628, 156, 628], color: '#202020', width: 1 },
    text(104, 662, 600, 44, L.ownerHeading, { family: SANS, weight: 500, size: 32 }, '#202020', {
      hit: ho,
    }),
    { kind: 'rect', x: 104, y: 716, w: 1060, h: 294, fill: 'rgba(0,0,0,0)', hit: ho },
    {
      kind: 'rich',
      x: 104,
      y: 716,
      w: 1060,
      h: 294,
      doc: rich(v, 'p.owner'),
      font: body,
      lineHeight: 1.5,
      letterSpacing: -0.6,
    },
  );
  return nodes;
}

export const post: TemplateDef = {
  id: 'pinned-post',
  name: L.name,
  tag: '置頂推文',
  tip: L.tip,
  kind: 'fixed',
  initial: () => ({ v: defaults(), touched: {}, images: {}, stickers: [] }),
  size: () => ({ width: W, height: H }),
  sides: () => [
    {
      id: SIDE,
      label: L.side,
      groups: [
        {
          id: 'back',
          label: L.back,
          fields: [
            {
              id: 'p.mode',
              label: L.mode,
              type: 'radio',
              options: [
                { value: 'light', label: L.light },
                { value: 'dark', label: L.dark },
                { value: 'solid', label: L.solid },
              ],
            },
            {
              id: 'p.bgColor',
              label: L.bgColor,
              type: 'color',
              when: { id: 'p.mode', is: 'solid' },
            },
          ],
        },
        {
          id: 'image',
          label: L.image,
          fields: [],
          slots: [{ id: 'p.main', width: 660, height: H }],
        },
        {
          id: 'info',
          label: L.info,
          fields: [
            { id: 'p.name', label: L.charName, type: 'text', row: 'n' },
            { id: 'p.age', label: L.age, type: 'text', row: 'n' },
            { id: 'p.nameColor', label: L.nameColor, type: 'color' },
            { id: 'p.sub', label: L.subName, type: 'text' },
            { id: 'p.subFont', label: L.subFont, type: 'font', sampleOf: 'p.sub' },
            { id: 'p.subColor', label: L.subColor, type: 'color' },
            { id: 'p.motto', label: L.motto, type: 'text' },
            { id: 'p.mottoFont', label: L.mottoFont, type: 'font', sampleOf: 'p.motto' },
            { id: 'p.mottoColor', label: L.mottoColor, type: 'color' },
            { id: 'p.kw', label: L.keyword, type: 'text' },
            { id: 'p.kwColor', label: L.keywordColor, type: 'color' },
          ],
        },
        {
          id: 'char',
          label: L.charText,
          fields: [{ id: 'p.char', label: L.charText, type: 'rich', clear: true, color: TEXT }],
        },
        {
          id: 'owner',
          label: L.ownerText,
          fields: [{ id: 'p.owner', label: L.ownerText, type: 'rich', clear: true, color: TEXT }],
        },
      ],
    },
  ],
  defaults: () => defaults(),
  scene,
  stickerArea: () => ({ x: 0, y: 0, width: W, height: H }),
};
