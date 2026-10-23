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
  /* 第二批：出（紅）、入（藍）、婚姻連線（紫）、GM（琥珀）、狀態 */
  out: '#b3261e',
  outBg: '#fbeeed',
  in: '#2f62b3',
  inBg: '#eaf0fa',
  link: '#6d3fc0',
  gm: '#e3a63b',
  gmText: '#2b1f06',
  gmHatch: 'rgba(227, 166, 59, 0.28)',
  dead: '#5b5751',
  deadText: '#ffffff',
  deadMark: '#5b5751',
  missing: '#8a5a12',
  missingBg: '#fbf0d9',
  avatarBg: '#f0ede8',
} as const;
