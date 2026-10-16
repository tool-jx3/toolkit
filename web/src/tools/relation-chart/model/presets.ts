/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 設定集（F174；原作的整體設定庫 GS_KEYS、sanitizeGsPreset、gsNextUnnamedName）：分頁外觀設定的一組值。
 * 涵蓋的鍵＝原作的 43 個（本站都有）＋畫布配色（D3；7.4 第 13 項）。不含排列（陣型、重要度反向、換排人數、
 * 取消錯位、排列不出界）、磁鐵、圖例位置。整理（presetValues、normalizePreset）在 normalize.ts。
 */
import type { SettingsPreset, SheetSettings } from './types';

export const PRESET_KEYS = [
  'showLegend',
  'showNames',
  'showRelName',
  'showRelNote',
  'showLabelNodes',
  'zoneOutline',
  'zoneEdgeW',
  'zoneFillOp',
  'showZones',
  'zoneLink',
  'zoneThick',
  'zoneBlend',
  'showLblLegend',
  'lblNodeScale',
  'gridStep',
  'focusDim',
  'defNoBorder',
  'defNoBg',
  'showCharLegend',
  'bgMode',
  'noCollision',
  'gridSnap',
  'shapeSquare',
  'defFrame',
  'defCharSize',
  'defBorderW',
  'defNameSize',
  'defRelNameSize',
  'defNoteSize',
  'defStickySize',
  'colAvatarRing',
  'colAvatarBg',
  'colNameStroke',
  'colNameText',
  'colRelLine',
  'colRelText',
  'colRelOutline',
  'edgeStraight',
  'bridgeMode',
  'defLineW',
  'relOpacity',
  'spacingPct',
  'edgeGapPx',
  'palette',
] as const satisfies readonly (keyof SheetSettings)[];

export type PresetKey = (typeof PRESET_KEYS)[number];

/** 「未命名設定集 N」（N＝現有最大編號＋1；原作的 gsNextUnnamedName） */
export function nextPresetName(lib: readonly SettingsPreset[], prefix: string): string {
  let max = 0;
  for (const g of lib) {
    if (!g.name.startsWith(prefix)) continue;
    const rest = g.name.slice(prefix.length).trim();
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return `${prefix}${max + 1}`;
}

/** 最愛排最前面（同一群照原本的順序） */
export const sortedPresets = (lib: readonly SettingsPreset[]): SettingsPreset[] => [
  ...lib.filter((g) => g.fav),
  ...lib.filter((g) => !g.fav),
];
