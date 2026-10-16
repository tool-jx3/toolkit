/**
 * 角色身上的標籤：讀寫一律走這裡（第三批把標籤搬到角色的變體上時，只改這幾個函式）。
 * 資料目前放在角色的 `labels`（標籤 id，照角色自己的順序）。
 */
import type { Char } from './types';

type WithLabels = Pick<Char, 'labels'>;

/** 這位角色的標籤 id（照角色自己的順序；收合時歸屬看這個順序） */
export const charLabelIds = (c: WithLabels): readonly number[] => c.labels;

export const charHasLabel = (c: WithLabels, id: number): boolean => c.labels.includes(id);

/** 換掉整組標籤 */
export function setCharLabelIds(c: WithLabels, ids: readonly number[]): void {
  c.labels = [...ids];
}

/** 加上（已有就不動）／拿掉一個標籤 */
export function setCharLabel(c: WithLabels, id: number, on: boolean): void {
  const has = c.labels.includes(id);
  if (on && !has) c.labels.push(id);
  if (!on && has) c.labels = c.labels.filter((l) => l !== id);
}

/** 拿掉符合條件的標籤（沒有符合的就不動，免得復原紀錄多一筆） */
export function dropCharLabels(c: WithLabels, drop: (id: number) => boolean): void {
  if (c.labels.some(drop)) c.labels = c.labels.filter((l) => !drop(l));
}
