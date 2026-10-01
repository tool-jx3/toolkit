/**
 * 預覽用的佔位立繪（本專案自繪）：還沒有圖片時，畫一個標著「立繪」的虛線框與簡單的人形。
 * 寬 384（基準 1920 的 1/5）× 高 768。
 */
import { S } from './strings';

export const PLACEHOLDER_SIZE = { width: 384, height: 768 } as const;

export const PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='384' height='768' viewBox='0 0 384 768'>` +
    `<rect x='6' y='6' width='372' height='756' rx='18' fill='rgba(255,255,255,0.12)' stroke='#ffffff' stroke-width='6' stroke-dasharray='22 14'/>` +
    `<circle cx='192' cy='210' r='70' fill='rgba(255,255,255,0.55)'/>` +
    `<path d='M82 560 Q86 330 192 312 Q298 330 302 560 Z' fill='rgba(255,255,255,0.55)'/>` +
    `<text x='192' y='660' font-family='sans-serif' font-size='64' font-weight='700' text-anchor='middle' fill='#ffffff' stroke='#000000' stroke-width='3' paint-order='stroke'>${S.preview.placeholderText}</text>` +
    `</svg>`,
)}`;
