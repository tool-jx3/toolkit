/**
 * 依序編號房間（規格 F219、D32）：替一層的房間放上 1、2、3…的圓標文字。
 *
 * - 順序：房間的上緣由上到下，上緣一樣時左緣由左到右。PL 看得到的房間先編；GM 專用的房間與在它裡面的房間接在後面，
 *   圓標也設成 GM 專用（PL 檢視、PL 用的圖與連結裡的編號是連續的）。「不顯示名字」的房間不編。
 * - 位置：房間左上角往內 0.25 格；房間的寬或深不到 2 格時放在中央。
 * - 這一層原本純數字的圓標先全部拿掉再重編；其他文字不動。
 * - 外觀層打開「顯示內部」時（F230）呼叫端傳外觀層自己留下來的那一份（ownFloor）：疊上來的房間與拿掉的屋頂不編。
 */
import { BADGE_DIAMETER, BADGE_PAD } from './catalog';
import { round2, uid } from './geometry';
import { roomContainsRoom, roomMainRect } from './shape';
import type { Floor, Room, TextLabel } from './types';

/** 編號圓標的字級（格） */
export const NUMBER_SIZE = 0.6;
/** 估計數字的寬度（字級的倍數，一個數字）與左右的留白（字級的倍數），用來讓兩位數的圓標也在房間裡 */
const DIGIT_W = 0.6;
const INSET = 0.25;

/** 純數字的圓標（自動編號的）：前後的空白不算；全形數字也算（7.7） */
export const isRoomNumber = (t: Pick<TextLabel, 'text' | 'badge'>): boolean =>
  !!t.badge && /^[0-9０-９]+$/.test(t.text.trim());

const byPosition = (a: Room, b: Room) => a.y - b.y || a.x - b.x;

/** 圓標的中心：左上角往內一點；小房間放中央。L 形房間用最大的那一塊長方形（2026-10-29） */
function badgeAt(room: Room, label: string): { x: number; y: number } {
  const r = roomMainRect(room);
  if (Math.min(r.w, r.h) < 2) return { x: round2(r.x + r.w / 2), y: round2(r.y + r.h / 2) };
  const d = NUMBER_SIZE * BADGE_DIAMETER;
  const w = Math.max(d, NUMBER_SIZE * (label.length * DIGIT_W + BADGE_PAD));
  return { x: round2(r.x + INSET + w / 2), y: round2(r.y + INSET + d / 2) };
}

export interface Numbered {
  /** 新的圓標（編號順序） */
  badges: TextLabel[];
  /** 新的文字清單（這一層原本的純數字圓標拿掉、新的接在後面） */
  texts: TextLabel[];
  /** 編了幾間 */
  count: number;
  /** 其中只有 GM 看得到的 */
  gm: number;
}

/**
 * 替這一層的房間編號；沒有可以編的房間時 null。
 * 外觀層打開「顯示內部」時傳進來的是外觀層自己留下來的那一份（ownFloor），疊上來的房間與拿掉的屋頂不算（F230）。
 */
export function numberRooms(floor: Floor): Numbered | null {
  const hidden = floor.rooms.filter((r) => r.gm);
  const isGm = (r: Room) => !!r.gm || hidden.some((g) => g !== r && roomContainsRoom(g, r));
  const target = floor.rooms.filter((r) => !r.hideLabel);
  if (!target.length) return null;
  const visible = target.filter((r) => !isGm(r)).sort(byPosition);
  const gmOnly = target.filter(isGm).sort(byPosition);
  const badges: TextLabel[] = [...visible, ...gmOnly].map((r, i) => {
    const text = String(i + 1);
    const t: TextLabel = {
      id: uid('t'),
      ...badgeAt(r, text),
      text,
      size: NUMBER_SIZE,
      badge: true,
    };
    if (isGm(r)) t.gm = true;
    return t;
  });
  return {
    badges,
    texts: [...floor.texts.filter((t) => !isRoomNumber(t)), ...badges],
    count: badges.length,
    gm: gmOnly.length,
  };
}
