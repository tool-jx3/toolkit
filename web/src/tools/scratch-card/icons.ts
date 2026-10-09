/**
 * 「隨機圖示」的 8 個圖示（本站自己畫的 24 × 24 向量圖，規格 F18、3.2）。
 * 順序和原作的 8 個位置對應（同一個種子抽到同樣的位置）。預覽、互動 HTML、分享連結都用同一份 SVG 字串。
 */

export interface ScratchIcon {
  name: string;
  color: string;
  /** <svg> 裡面的內容（viewBox 0 0 24 24） */
  body: string;
}

const W = (opacity: number) => `fill="#fff" fill-opacity="${opacity}"`;

const f2 = (n: number) => String(+n.toFixed(2));

/** 五角星的頂點（外半徑 R、內半徑 r） */
function starPoints(cx: number, cy: number, R: number, r: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const a = ((-90 + k * 36) * Math.PI) / 180;
    const rad = k % 2 === 0 ? R : r;
    pts.push(`${f2(cx + rad * Math.cos(a))},${f2(cy + rad * Math.sin(a))}`);
  }
  return pts.join(' ');
}

export const SCRATCH_ICONS: readonly ScratchIcon[] = [
  {
    name: '寶石',
    color: '#3b82f6',
    body: [
      '<polygon points="6,3 18,3 23,9 12,22 1,9" fill="#3b82f6"/>',
      `<polygon points="6,3 18,3 23,9 1,9" ${W(0.28)}/>`,
      `<polygon points="8.5,9 12,3 15.5,9" ${W(0.3)}/>`,
      `<polygon points="8.5,9 15.5,9 12,22" ${W(0.14)}/>`,
    ].join(''),
  },
  {
    name: '金幣',
    color: '#eab308',
    body: [
      '<circle cx="12" cy="12" r="10" fill="#eab308"/>',
      '<circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="1.5"/>',
      `<polygon points="12,7.5 15.5,12 12,16.5 8.5,12" ${W(0.6)}/>`,
    ].join(''),
  },
  {
    name: '皇冠',
    color: '#f59e0b',
    body: [
      '<path d="M2 8 L7 12.5 L12 4 L17 12.5 L22 8 L20 19.5 H4 Z" fill="#f59e0b"/>',
      `<rect x="4.2" y="16" width="15.6" height="2.4" ${W(0.4)}/>`,
      '<circle cx="12" cy="4" r="1.8" fill="#f59e0b"/>',
      '<circle cx="2.2" cy="8" r="1.5" fill="#f59e0b"/>',
      '<circle cx="21.8" cy="8" r="1.5" fill="#f59e0b"/>',
    ].join(''),
  },
  {
    name: '禮物',
    color: '#ef4444',
    body: [
      '<path d="M12 7.5 C9.5 2.5 4.5 3.5 7 7.5 Z" fill="#ef4444"/>',
      '<path d="M12 7.5 C14.5 2.5 19.5 3.5 17 7.5 Z" fill="#ef4444"/>',
      '<rect x="3.5" y="11" width="17" height="10" rx="1.5" fill="#ef4444"/>',
      '<rect x="2" y="7.5" width="20" height="4.5" rx="1" fill="#ef4444"/>',
      `<rect x="2" y="7.5" width="20" height="4.5" rx="1" ${W(0.18)}/>`,
      `<rect x="10.6" y="7.5" width="2.8" height="13.5" ${W(0.6)}/>`,
    ].join(''),
  },
  {
    name: '星星',
    color: '#facc15',
    body: [
      `<polygon points="${starPoints(12, 12.8, 11, 4.6)}" fill="#facc15"/>`,
      `<polygon points="${starPoints(12, 12.8, 5.5, 2.3)}" ${W(0.3)}/>`,
    ].join(''),
  },
  {
    name: '炸彈',
    color: '#475569',
    body: [
      '<path d="M16.6 5.6 Q18.2 2.6 21 3.4" fill="none" stroke="#a16207" stroke-width="1.5" stroke-linecap="round"/>',
      '<path d="M14.6 6.4 L17.6 9.4 L15.8 11.2 L12.8 8.2 Z" fill="#475569"/>',
      '<circle cx="10.5" cy="14" r="8" fill="#475569"/>',
      `<circle cx="7.6" cy="11.1" r="2.2" ${W(0.35)}/>`,
      `<polygon points="${starPoints(21.2, 3.2, 2.6, 1.1)}" fill="#f97316"/>`,
    ].join(''),
  },
  {
    name: '骰子',
    color: '#10b981',
    body: [
      '<rect x="3" y="3" width="18" height="18" rx="4" fill="#10b981"/>',
      ...[
        [8, 8],
        [16, 8],
        [12, 12],
        [8, 16],
        [16, 16],
      ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`),
    ].join(''),
  },
  {
    name: '愛心',
    color: '#ec4899',
    body: [
      '<path d="M12 21 C12 21 2.5 14.6 2.5 8.6 C2.5 5.4 4.9 3 7.8 3 C9.6 3 11.2 3.9 12 5.3 C12.8 3.9 14.4 3 16.2 3 C19.1 3 21.5 5.4 21.5 8.6 C21.5 14.6 12 21 12 21 Z" fill="#ec4899"/>',
      `<ellipse cx="7.4" cy="8" rx="1.7" ry="2.4" transform="rotate(-30 7.4 8)" ${W(0.4)}/>`,
    ].join(''),
  },
];

export const ICON_COUNT = SCRATCH_ICONS.length;

/** 一個圖示的 <svg>（寬高 100%，填滿外層的方形） */
export function iconSvg(index: number): string {
  const icon = SCRATCH_ICONS[index] ?? SCRATCH_ICONS[0];
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">${icon.body}</svg>`;
}
