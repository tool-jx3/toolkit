/**
 * 不依賴 React 的小規則：檔名、角色的網址與提示、預覽對象、測試值的預覽狀態列。
 */
import { characterUrlFrom, resolveCharacterRef } from '@/ccfolia';
import type { MockStatus } from '@/ccfolia/mock';
import type { CssTarget } from './css';
import {
  CHARACTER_COLORS,
  type Character,
  EXAMPLE_NAME,
  MAX_BARS,
  type PreviewData,
  type Settings,
} from './settings';

/** 預設的檔名主體 */
export const DEFAULT_FILE_NAME = 'statusbar';

/** Windows 不能用的字元 */
const BAD = /[\\/:*?"<>|]/g;

/** 檔名主體：不合法的字元換成底線、去掉前後空白；空白時用預設值（F101） */
export function cleanBaseName(name: string): string {
  const s = String(name ?? '')
    .replace(BAD, '_')
    .trim();
  return s || DEFAULT_FILE_NAME;
}

/** 專案檔的檔名：`<檔名主體>.statusbar.json`（不加日期；主體照 F101 的清理規則；F115 裁定） */
export const projectFileName = (name: string): string => `${cleanBaseName(name)}.statusbar.json`;

/** 檔名中的角色名：不合法的字元與空白換成底線（F102） */
export function cleanCharacterPart(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(BAD, '_')
    .replace(/\s+/g, '_');
}

/** 儲存 CSS 的檔名主體（不含 .css）：主體＋（預覽角色時）「_角色名」 */
export function cssFileBase(fileName: string, character: Pick<Character, 'name'> | null): string {
  const base = cleanBaseName(fileName);
  const who = character ? cleanCharacterPart(character.name) : '';
  return who ? `${base}_${who}` : base;
}

/** 角色要填進瀏覽器來源的網址（缺房間或角色 ID 時 null） */
export const characterSourceUrl = (c: Pick<Character, 'ref'>, room: string): string | null =>
  characterUrlFrom(c.ref, room);

export type CharacterHint = 'id' | 'room' | 'name' | null;

/**
 * 角色卡下方的提示（依序檢查）：沒有可用的角色 ID → 'id'；房間網址與角色欄都找不到房間 → 'room'；
 * 名稱空白 → 'name'；都沒問題 → null（F88）
 */
export function characterHint(c: Pick<Character, 'ref' | 'name'>, room: string): CharacterHint {
  const ref = resolveCharacterRef(c.ref, room);
  if (!ref.characterId) return 'id';
  if (!ref.roomId) return 'room';
  if (!c.name.trim()) return 'name';
  return null;
}

/** 新角色的顏色：依序從 8 色輪流 */
export function nextCharacterColor(existing: number): string {
  return CHARACTER_COLORS[existing % CHARACTER_COLORS.length];
}

/** 預覽中的角色（範例時 null；角色被刪掉時也 null） */
export function previewCharacter(s: Settings, target: string): Character | null {
  if (target === 'example') return null;
  return s.characters.find((c) => c.id === target) ?? null;
}

/** 預覽對象 → CSS 的對象（範例用範例名稱、以名稱強調色代替角色顏色） */
export function cssTargetFor(s: Settings, character: Character | null): CssTarget {
  if (!character) return { name: EXAMPLE_NAME, color: s.name.accent, url: null, example: true };
  return {
    name: character.name,
    color: character.color,
    url: characterSourceUrl(character, s.room),
    example: false,
  };
}

/** 模擬頁的狀態列：條數那麼多條（預覽多放兩條時再加，最多 8 條） */
export function previewStatuses(s: Settings, p: PreviewData): MockStatus[] {
  const n = Math.min(MAX_BARS, s.barCount + (p.showExtras ? 2 : 0));
  return p.tests.slice(0, n).map((t) => ({ label: t.label, value: t.value, max: t.max }));
}
