/**
 * 目前的角色（表單的內容）。規格 F38：不保留狀態（persist: false），重新整理後回到開頁狀態。
 * 狀態、參數清單另外記一份 React 用的 key（拖曳排序、刪除時列不會錯位）；key 不會出現在輸出裡。
 */
import type { CcfoliaCharacter, CcfoliaParam, CcfoliaStatus } from '@/ccfolia';
import { createToolStore } from '@/core/storage';
import {
  applyImportDiffs,
  blankParam,
  blankStatus,
  type CharacterItem,
  type ImportDiff,
  initialCharacter,
  type ListKey,
  moveItem,
  reconcileKeys,
  removeAt,
} from './logic';

export const TOOL_ID = 'character-editor';

export interface EditorData {
  character: CcfoliaCharacter;
  keys: Record<ListKey, string[]>;
}

let seq = 0;
const newKey = () => `row-${++seq}`;

function initialData(): EditorData {
  const character = initialCharacter();
  return {
    character,
    keys: { status: character.status.map(newKey), params: character.params.map(newKey) },
  };
}

export const useEditor = createToolStore<EditorData>(TOOL_ID, initialData(), {
  persist: false,
  historyLimit: 1,
});

type EditableField =
  | 'name'
  | 'initiative'
  | 'externalUrl'
  | 'color'
  | 'memo'
  | 'width'
  | 'commands';

export function setField<K extends EditableField>(field: K, value: CcfoliaCharacter[K]): void {
  useEditor.getState().update((d) => {
    (d.character as Record<string, unknown>)[field] = value;
  });
}

export function setItem(list: ListKey, index: number, patch: Partial<CharacterItem>): void {
  useEditor.getState().update((d) => {
    const items = d.character[list] as Record<string, unknown>[];
    if (items[index]) Object.assign(items[index], patch);
  });
}

/** 在清單最後加一列空白項目（F27） */
export function addItem(list: ListKey): void {
  useEditor.getState().update((d) => {
    if (list === 'status') d.character.status.push(blankStatus());
    else d.character.params.push(blankParam());
    d.keys[list].push(newKey());
  });
}

/** 刪掉一列（F28） */
export function removeItem(list: ListKey, index: number): void {
  const { data, replace } = useEditor.getState();
  replace({
    character: {
      ...data.character,
      [list]: removeAt(data.character[list] as CharacterItem[], index),
    },
    keys: { ...data.keys, [list]: removeAt(data.keys[list], index) },
  });
}

/** 拖曳排序（F29） */
export function moveListItem(list: ListKey, from: number, to: number): void {
  const { data, replace } = useEditor.getState();
  replace({
    character: {
      ...data.character,
      [list]: moveItem(data.character[list] as CharacterItem[], from, to),
    },
    keys: { ...data.keys, [list]: moveItem(data.keys[list], from, to) },
  });
}

/** 套用勾選的差異（3.3） */
export function applyImport(
  incoming: CcfoliaCharacter,
  diffs: readonly ImportDiff[],
  selected: ReadonlySet<string> | readonly string[],
): void {
  const { data, replace } = useEditor.getState();
  const next = applyImportDiffs(data.character, incoming, diffs, selected);
  replace({
    character: next,
    keys: {
      status: reconcileKeys(data.character.status, data.keys.status, next.status, newKey),
      params: reconcileKeys(data.character.params, data.keys.params, next.params, newKey),
    },
  });
}

/** 重設（F36）：回到開頁狀態 */
export function resetCharacter(): void {
  useEditor.getState().replace(initialData());
}

export type { CcfoliaParam, CcfoliaStatus };
