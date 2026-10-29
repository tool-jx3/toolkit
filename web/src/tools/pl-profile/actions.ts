/**
 * 修改狀態的動作（每個呼叫＝一步復原；文字欄由元件包 gesture，從進入到離開算一步）。
 */
import type { FramePlacement } from '@/core/image';
import { MAX_MEMBERS, MEMBER_NAME_MAX, type Member } from './compare';
import {
  type AvatarRef,
  type ContactEntry,
  type FieldKey,
  type LevelId,
  LIMITS,
  type Look,
  labelKey,
  multiLine,
  newId,
  normalizeAvatarPlacement,
  oneLine,
  type Profile,
  type SystemEntry,
  TAG_PRESETS,
  type TagGroupKey,
} from './model';
import { useProfile, useView } from './store';
import { TOPIC_INDEX } from './topics';

const update = useProfile.getState().update;

/* ---------- 自介卡 ---------- */

type TextKey =
  | 'nickname'
  | 'handle'
  | 'tagline'
  | 'avatarCredit'
  | 'expNote'
  | 'scheduleNote'
  | 'memo';

/** 文字欄的上限（打字時也拿掉控制字元、截斷；讀檔時 normalizeData 同樣處理） */
const TEXT_LIMITS: Record<TextKey, number> = {
  nickname: LIMITS.nickname,
  handle: LIMITS.handle,
  tagline: LIMITS.tagline,
  avatarCredit: LIMITS.avatarCredit,
  expNote: LIMITS.expNote,
  scheduleNote: LIMITS.scheduleNote,
  memo: LIMITS.memo,
};

export function setProfileText<K extends TextKey>(key: K, value: string): void {
  const clean =
    key === 'memo' ? multiLine(value, TEXT_LIMITS[key]) : oneLine(value, TEXT_LIMITS[key]);
  update((d) => {
    d.profile[key] = clean as Profile[K];
  });
}

export function setShow(key: FieldKey, on: boolean): void {
  update((d) => {
    d.show[key] = on;
  });
}

export function setAvatar(ref: AvatarRef | null): void {
  update((d) => {
    d.profile.avatar = ref;
    d.profile.avatarPlacement = null;
  });
}

export function setAvatarPlacement(p: FramePlacement | null): void {
  update((d) => {
    d.profile.avatarPlacement = normalizeAvatarPlacement(p, d.profile.avatar);
  });
}

export function togglePresetTag(group: TagGroupKey, id: string): void {
  update((d) => {
    const g = d.profile[group];
    const on = g.picked.includes(id);
    const next = on ? g.picked.filter((x) => x !== id) : [...g.picked, id];
    g.picked = TAG_PRESETS[group].filter((p) => next.includes(p));
  });
}

export type AddTagResult = 'ok' | 'empty' | 'dup' | 'full';

/** 自己加的標籤（同名〔或和預設選項同名〕時改成選取那一個） */
export function addExtraTag(
  group: TagGroupKey,
  label: string,
  presetNames: Record<string, string>,
): AddTagResult {
  const clean = oneLine(label, LIMITS.tagLabel).trim();
  if (!clean) return 'empty';
  const key = labelKey(clean);
  const g = useProfile.getState().data.profile[group];
  const preset = TAG_PRESETS[group].find((p) => labelKey(presetNames[p] ?? '') === key);
  if (preset) {
    if (g.picked.includes(preset)) return 'dup';
    togglePresetTag(group, preset);
    return 'ok';
  }
  if (g.extra.some((x) => labelKey(x) === key)) return 'dup';
  if (g.extra.length >= LIMITS.tagExtra) return 'full';
  update((d) => {
    d.profile[group].extra.push(clean);
  });
  return 'ok';
}

export function removeExtraTag(group: TagGroupKey, index: number): void {
  update((d) => {
    d.profile[group].extra.splice(index, 1);
  });
}

export function addSystem(name = ''): boolean {
  if (useProfile.getState().data.profile.systems.length >= LIMITS.systems) return false;
  update((d) => {
    d.profile.systems.push({ id: newId('s'), name, level: 'played', kp: false, note: '' });
  });
  return true;
}

export function updateSystem(id: string, patch: Partial<Omit<SystemEntry, 'id'>>): void {
  if (patch.name !== undefined) patch = { ...patch, name: oneLine(patch.name, LIMITS.systemName) };
  if (patch.note !== undefined) patch = { ...patch, note: oneLine(patch.note, LIMITS.systemNote) };
  update((d) => {
    const s = d.profile.systems.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  });
}

export function removeSystem(id: string): void {
  update((d) => {
    d.profile.systems = d.profile.systems.filter((x) => x.id !== id);
  });
}

export function moveSystem(id: string, dir: -1 | 1): void {
  update((d) => {
    const i = d.profile.systems.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.profile.systems.length) return;
    const [s] = d.profile.systems.splice(i, 1);
    d.profile.systems.splice(j, 0, s);
  });
}

export function addContact(): boolean {
  if (useProfile.getState().data.profile.contacts.length >= LIMITS.contacts) return false;
  update((d) => {
    d.profile.contacts.push({ id: newId('c'), kind: '', value: '' });
  });
  return true;
}

export function updateContact(id: string, patch: Partial<Omit<ContactEntry, 'id'>>): void {
  if (patch.kind !== undefined) patch = { ...patch, kind: oneLine(patch.kind, LIMITS.contactKind) };
  if (patch.value !== undefined)
    patch = { ...patch, value: oneLine(patch.value, LIMITS.contactValue) };
  update((d) => {
    const c = d.profile.contacts.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

export function removeContact(id: string): void {
  update((d) => {
    d.profile.contacts = d.profile.contacts.filter((x) => x.id !== id);
  });
}

/* ---------- 地雷表 ---------- */

/** 主題的程度（內建主題的 key 或自訂主題的 id；null＝清掉） */
export function setLevel(id: string, level: LevelId | null): void {
  update((d) => {
    if (TOPIC_INDEX.has(id)) {
      if (level) d.jirai.levels[id] = level;
      else delete d.jirai.levels[id];
      return;
    }
    const t = d.jirai.custom.find((x) => x.id === id);
    if (t) t.level = level;
  });
}

export function setTopicNote(id: string, text: string): void {
  const note = oneLine(text, LIMITS.topicNote);
  update((d) => {
    if (TOPIC_INDEX.has(id)) {
      if (note) d.jirai.notes[id] = note;
      else delete d.jirai.notes[id];
      return;
    }
    const t = d.jirai.custom.find((x) => x.id === id);
    if (t) t.note = note;
  });
}

export function addCustomTopic(cat: string, label: string): 'ok' | 'empty' | 'full' {
  const clean = oneLine(label, LIMITS.topicLabel).trim();
  if (!clean) return 'empty';
  if (useProfile.getState().data.jirai.custom.length >= LIMITS.customTopics) return 'full';
  update((d) => {
    d.jirai.custom.push({ id: newId('t'), cat, label: clean, level: null, note: '' });
  });
  return 'ok';
}

export function renameCustomTopic(id: string, text: string): void {
  const label = oneLine(text, LIMITS.topicLabel);
  update((d) => {
    const t = d.jirai.custom.find((x) => x.id === id);
    if (t) t.label = label;
  });
}

export function removeCustomTopic(id: string): void {
  update((d) => {
    d.jirai.custom = d.jirai.custom.filter((x) => x.id !== id);
  });
}

export function addCategory(name: string): string | null {
  if (useProfile.getState().data.jirai.cats.length >= LIMITS.customCats) return null;
  const id = newId('k');
  const clean = oneLine(name, LIMITS.catName).trim();
  update((d) => {
    d.jirai.cats.push({ id, name: clean });
  });
  return id;
}

export function renameCategory(id: string, text: string): void {
  const name = oneLine(text, LIMITS.catName);
  update((d) => {
    const c = d.jirai.cats.find((x) => x.id === id);
    if (c) c.name = name;
  });
}

/** 刪掉自訂分類（連同裡面的主題） */
export function removeCategory(id: string): void {
  update((d) => {
    d.jirai.cats = d.jirai.cats.filter((x) => x.id !== id);
    d.jirai.custom = d.jirai.custom.filter((x) => x.cat !== id);
  });
}

export function setJiraiMemo(text: string): void {
  const memo = multiLine(text, LIMITS.jiraiMemo);
  update((d) => {
    d.jirai.memo = memo;
  });
}

export function setAdult(on: boolean): void {
  update((d) => {
    d.jirai.adult = on;
  });
}

/** 沒填的主題（目前看得到的）設成「沒差」（ok） */
export function fillUnsetOk(ids: readonly string[]): void {
  update((d) => {
    for (const id of ids) {
      if (TOPIC_INDEX.has(id)) {
        if (!d.jirai.levels[id]) d.jirai.levels[id] = 'ok';
        continue;
      }
      const t = d.jirai.custom.find((x) => x.id === id);
      if (t && !t.level && t.label.trim()) t.level = 'ok';
    }
  });
}

/** 清掉所有程度與補充（自訂的主題與分類留著） */
export function clearJirai(): void {
  update((d) => {
    d.jirai.levels = {};
    d.jirai.notes = {};
    for (const t of d.jirai.custom) {
      t.level = null;
      t.note = '';
    }
  });
}

/* ---------- 外觀 ---------- */

export function setLook<K extends keyof Look>(key: K, value: Look[K]): void {
  update((d) => {
    d.look[key] = value;
  });
}

/* ---------- KP 對照表（不列入復原） ---------- */

const view = useView.getState;

export interface AddMembersResult {
  added: Member[];
  dupes: string[];
  over: number;
}

/** 加入成員（同一份內容不重複加入；超過上限的不加）；source 'self' 的取代原本的「我自己」 */
export function addMembers(list: readonly Member[]): AddMembersResult {
  let members = view().data.members.slice();
  const added: Member[] = [];
  const dupes: string[] = [];
  let over = 0;
  for (const m of list) {
    if (m.source === 'self') {
      const i = members.findIndex((x) => x.source === 'self');
      if (i >= 0) {
        members[i] = { ...m, id: members[i].id };
        added.push(m);
        continue;
      }
    }
    if (members.some((x) => x.sig && x.sig === m.sig)) {
      dupes.push(m.name);
      continue;
    }
    if (members.length >= MAX_MEMBERS) {
      over += 1;
      continue;
    }
    members = [...members, m];
    added.push(m);
  }
  view().patch({ members });
  return { added, dupes, over };
}

export function renameMember(id: string, text: string): void {
  const name = oneLine(text, MEMBER_NAME_MAX);
  view().update((v) => {
    const m = v.members.find((x) => x.id === id);
    if (m) m.name = name;
  });
}

/** 移出成員；回傳復原用的函式 */
export function removeMember(id: string): () => void {
  const before = view().data.members;
  const index = before.findIndex((x) => x.id === id);
  if (index < 0) return () => undefined;
  const removed = before[index];
  view().patch({ members: before.filter((x) => x.id !== id) });
  return () => {
    const now = view().data.members;
    if (now.some((x) => x.id === removed.id) || now.length >= MAX_MEMBERS) return;
    const next = now.slice();
    next.splice(Math.min(index, next.length), 0, removed);
    view().patch({ members: next });
  };
}

export function clearMembers(): void {
  view().patch({ members: [] });
}
