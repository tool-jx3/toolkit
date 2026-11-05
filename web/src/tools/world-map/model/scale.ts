/**
 * 比例尺：「地圖上 100 px 是幾 km」。外框右下的比例尺取最接近 140 px 的整齊長度（1、2、5、10 × 10 的次方 km）。
 * 路線的總長也用同一個比例（第一批只顯示總長；旅程的日數在第二批）。
 */
import { polylineLength, sampleCurve } from './geometry';
import type { MapPath } from './types';

export interface ScaleBar {
  /** 比例尺代表的距離（km） */
  km: number;
  /** 在地圖上的長度（px） */
  px: number;
}

export function niceScaleBar(kmPer100: number): ScaleBar {
  const raw = kmPer100 * 1.4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const best = [1, 2, 5, 10]
    .map((v) => v * mag)
    .reduce((a, b) =>
      Math.abs((a / kmPer100) * 100 - 140) <= Math.abs((b / kmPer100) * 100 - 140) ? a : b,
    );
  return { km: best, px: (best / kmPer100) * 100 };
}

/** km 的寫法：最多 4 位小數、千分位 */
export const formatKm = (v: number): string =>
  v.toLocaleString('zh-TW', { maximumFractionDigits: 4 });

/** 路線的總長（km；沿著畫出來的曲線量） */
export function pathKm(p: Pick<MapPath, 'points' | 'smooth' | 'kind'>, kmPer100: number): number {
  const pts = sampleCurve(p.points, p.kind === 'wall' ? false : p.smooth);
  return (polylineLength(pts) * kmPer100) / 100;
}

/** 總長的顯示：0.1 未滿寫「不到 0.1」，其他到小數 1 位 */
export const formatLength = (km: number): string =>
  km > 0 && km < 0.1 ? '不到 0.1' : km.toLocaleString('zh-TW', { maximumFractionDigits: 1 });
