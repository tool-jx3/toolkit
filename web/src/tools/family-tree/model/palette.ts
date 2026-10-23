/**
 * 色分類的常用色（本站自己的 9 色；規格 D15）：新分類依序取用，也是顏色欄的常用色。
 * 卡片上混 14% 當底、60% 當框線，深淺色主題都看得清楚。
 */
export const CAT_PALETTE: readonly string[] = [
  '#d64545', // 朱紅
  '#e07b28', // 柿橙
  '#c9a227', // 芥黃
  '#4f9a52', // 苔綠
  '#2c9c94', // 青碧
  '#3f77c8', // 靛藍
  '#8a5cc2', // 藤紫
  '#d0569a', // 梅紅
  '#8a7d6e', // 石灰褐
];

/** 匯出（一律淺色，規格 3.3、D13） */
export const EXPORT_COLORS = {
  bg: '#ffffff',
  text: '#1c1b19',
  muted: '#5b5751',
  border: '#d6d1c7',
  edge: '#9a948a',
  chip: '#f6f4f0',
  symbol: '#1c1b19',
} as const;
