/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見上一層的 UPSTREAM_LICENSE。
 *
 * 範例（原作的 buildSample；規格 3.7）：故事人物、家族樹、屬性克制表、心智圖。頭像一律用內建圖示。
 * 回傳的是用區域 id 寫的分頁，加入專案時再換成專案的 id（store 的 addSheetFrom）。
 */

import { makeChar, makeRel, makeType } from '../model/factory';
import { newSettings } from '../model/normalize';
import type { Char, Rel, RelType, Sheet } from '../model/types';

export type SampleKey = 'story' | 'family' | 'types' | 'mind';

export const SAMPLES: readonly { key: SampleKey; name: string; desc: string }[] = [
  {
    key: 'story',
    name: '故事人物',
    desc: '主角與夥伴、宿敵——最典型的角色關係圖（含一條自我關係）。',
  },
  { key: 'family', name: '家族樹', desc: '三代家譜：夫妻與親子的階層排列（組織圖同理）。' },
  { key: 'types', name: '屬性克制表', desc: '節點不必是人：五種屬性互相克制的循環。' },
  { key: 'mind', name: '心智圖', desc: '中心主題放射展開，整理靈感用。' },
];

const C = makeChar;
const T = makeType;
const R = makeRel;

const sheet = (
  name: string,
  W: number,
  H: number,
  types: RelType[],
  chars: Char[],
  rels: Rel[],
): Sheet => ({
  id: 0,
  defNo: 0,
  name,
  W,
  H,
  chars,
  rels,
  types,
  bg: null,
  settings: newSettings(),
});

export function buildSample(key: SampleKey): Sheet {
  if (key === 'story')
    return sheet(
      '範例：故事人物',
      1100,
      900,
      [
        T(101, '戀愛', { color: '#e0607e' }),
        T(102, '友情', { color: '#58b368' }),
        T(103, '敵對', { color: '#c0392b', lineStyle: 'dashed' }),
        T(104, '師徒', { color: '#4a90d9' }),
        T(105, '監視', { color: '#8a8a8a', lineStyle: 'dotted' }),
      ],
      [
        C(1, '主角', 550, 430, { icon: 'star', level: 2 }),
        C(2, '戀人', 300, 300, { icon: 'heart' }),
        C(3, '摯友', 300, 620, { icon: 'sun' }),
        C(4, '宿敵', 800, 300, { icon: 'bolt' }),
        C(5, '導師', 810, 620, { icon: 'book' }),
        C(6, '神秘人', 550, 140, { icon: 'ghost' }),
      ],
      [
        R(11, 1, 2, 101, { both: true }),
        R(12, 3, 1, 102),
        R(13, 4, 1, 103, { both: true }),
        R(14, 5, 1, 104),
        R(15, 6, 1, 105),
        R(16, 6, 6, 105, { note: '我是誰？' }),
      ],
    );
  if (key === 'family')
    return sheet(
      '範例：家族樹',
      1100,
      900,
      [T(101, '夫妻', { color: '#e0607e' }), T(102, '親子', { color: '#4a90d9' })],
      [
        C(1, '祖父', 420, 150, { icon: 'crown' }),
        C(2, '祖母', 680, 150, { icon: 'flower' }),
        C(3, '父親', 300, 430),
        C(4, '母親', 550, 430),
        C(5, '叔叔', 820, 430, { icon: 'dice' }),
        C(6, '主角', 420, 700, { icon: 'star', level: 1 }),
        C(7, '妹妹', 680, 700, { icon: 'clover' }),
      ],
      [
        R(11, 1, 2, 101, { both: true }),
        R(12, 3, 4, 101, { both: true }),
        R(13, 1, 3, 102),
        R(14, 2, 5, 102),
        R(15, 3, 6, 102),
        R(16, 3, 7, 102),
        R(17, 4, 6, 102),
        R(18, 4, 7, 102),
      ],
    );
  if (key === 'types')
    return sheet(
      '範例：屬性克制表',
      1000,
      900,
      [T(101, '克制', { color: '#c0392b' })],
      [
        C(1, '火', 500, 160, { icon: 'flame', color: '#e74c3c' }),
        C(2, '草', 780, 380, { icon: 'leaf', color: '#27ae60' }),
        C(3, '水', 670, 700, { icon: 'drop', color: '#2980b9' }),
        C(4, '雷', 330, 700, { icon: 'bolt', color: '#f1c40f' }),
        C(5, '岩', 220, 380, { icon: 'gem', color: '#8d6e63' }),
      ],
      [
        R(11, 1, 2, 101),
        R(12, 2, 3, 101),
        R(13, 3, 1, 101),
        R(14, 4, 3, 101),
        R(15, 5, 1, 101),
        R(16, 3, 5, 101),
      ],
    );
  return sheet(
    '範例：心智圖',
    1100,
    900,
    [T(101, '關聯', { capStyle: 'none' })],
    [
      C(1, '新企劃', 550, 430, { icon: 'sun', level: 1 }),
      C(2, '世界觀', 550, 140, { icon: 'cloud' }),
      C(3, '角色', 830, 280, { icon: 'paw' }),
      C(4, '劇情', 830, 600, { icon: 'book' }),
      C(5, '靈感', 550, 720, { icon: 'moon' }),
      C(6, '待辦', 270, 600, { icon: 'flag' }),
      C(7, '參考', 270, 280, { icon: 'key' }),
    ],
    [
      R(11, 1, 2, 101),
      R(12, 1, 3, 101),
      R(13, 1, 4, 101),
      R(14, 1, 5, 101),
      R(15, 1, 6, 101),
      R(16, 1, 7, 101),
    ],
  );
}
