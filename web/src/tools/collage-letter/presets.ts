/**
 * 內建配色與字型（本站自做）。
 *
 * 配色：8 組「紙片底色＋字色」，深底淺字 4 組、淺底深字 4 組；底色中無彩色 4 組、高彩度 4 組（規格 3.2）。
 * 字型（規格 3.3＋主控裁定）：
 * - 繁中 5 套放在最前面；預設勾選其中 3 套粗字重的（思源黑體 900、思源宋體 900、霞鶩文楷 700），中文不會全退回系統字型。
 * - 舊版的 6 套 Google 字型照用；4 套不在 Google Fonts 的韓文字型改用外觀相近的 Google 字型（Gothic A1、Sunflower、
 *   Gamja Flower、Gaegu）。
 */
import { defineFontChoices } from '@/core/fonts';
import type { ColorPairItem, FontPoolItem } from '@/ui';
import { S } from './strings';

export const DEFAULT_PALETTES: readonly ColorPairItem[] = [
  { id: 'ink', name: S.palettes.ink, a: '#161616', b: '#f4efe4', enabled: true },
  { id: 'newsprint', name: S.palettes.newsprint, a: '#f6f3ea', b: '#1b1b1b', enabled: true },
  { id: 'ash', name: S.palettes.ash, a: '#c8c8c2', b: '#242424', enabled: true },
  { id: 'lead', name: S.palettes.lead, a: '#4b4b4d', b: '#f2f2f0', enabled: true },
  { id: 'vermilion', name: S.palettes.vermilion, a: '#d42a1f', b: '#fff6e5', enabled: true },
  { id: 'lemon', name: S.palettes.lemon, a: '#f5d327', b: '#171717', enabled: true },
  { id: 'magenta', name: S.palettes.magenta, a: '#d81b7f', b: '#ffffff', enabled: true },
  { id: 'teal', name: S.palettes.teal, a: '#33c3c8', b: '#0f2a2c', enabled: true },
];

const CHOICES = defineFontChoices<{ enabled: boolean }>([
  /* 繁中（主控裁定：預設勾選幾套） */
  { family: 'Noto Sans TC', weight: 900, label: S.fontLabels.notoSansTc, data: { enabled: true } },
  {
    family: 'Noto Serif TC',
    weight: 900,
    label: S.fontLabels.notoSerifTc,
    data: { enabled: true },
  },
  { family: 'LXGW WenKai TC', weight: 700, data: { enabled: true } },
  { family: 'Chocolate Classical Sans', weight: 400, data: { enabled: false } },
  { family: 'Cactus Classical Serif', weight: 400, data: { enabled: false } },
  /* 舊版的 Google 字型 */
  { family: 'Black Han Sans', data: { enabled: true } },
  { family: 'Do Hyeon', data: { enabled: true } },
  { family: 'DotGothic16', data: { enabled: true } },
  { family: 'Jua', data: { enabled: true } },
  { family: 'Permanent Marker', data: { enabled: true } },
  { family: 'Rampart One', data: { enabled: true } },
  /* 4 套非 Google Fonts 韓文字型的替代（主控裁定） */
  { family: 'Gothic A1', weight: 500, data: { enabled: true } },
  { family: 'Sunflower', weight: 500, data: { enabled: true } },
  { family: 'Gamja Flower', data: { enabled: true } },
  { family: 'Gaegu', weight: 700, data: { enabled: true } },
]);

export const DEFAULT_FONTS: readonly FontPoolItem[] = CHOICES.map((c) => ({
  id: `builtin-${c.id}`,
  font: { source: 'google', family: c.font.family, weight: c.font.weight },
  label: c.label,
  enabled: c.data.enabled,
}));
