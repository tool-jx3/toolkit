/**
 * 輸出用的檢視（圖片、純文字、唯讀檢視共用）：自介卡只留打開眼睛、而且有內容的欄位；地雷表依程度或依分類分組。
 * 純函式（Node 可測）。
 */
import {
  type CategoryView,
  filledTopics,
  type GroupMode,
  jiraiCategories,
  LEVEL_OUTPUT_ORDER,
  type LevelId,
  type ProfileData,
  type SystemLevel,
  type TagGroupKey,
  type TopicView,
  tagLabels,
} from './model';
import { OUT } from './strings';

export interface SystemLine {
  name: string;
  levelId: SystemLevel;
  level: string;
  kp: boolean;
  note: string;
}

export interface ContactLine {
  kind: string;
  value: string;
}

export interface ProfileView {
  nickname: string;
  handle: string;
  tagline: string;
  /** 顯示頭像的位置（打開眼睛時；沒有圖片時畫預設的圓） */
  avatar: boolean;
  avatarCredit: string;
  age: string;
  experience: { pl: string; kp: string; note: string } | null;
  systems: SystemLine[];
  tags: { key: TagGroupKey; title: string; items: string[]; note: string }[];
  contacts: ContactLine[];
  memo: string;
}

const t = (s: string) => s.trim();

/** 自介卡的檢視（關掉眼睛、沒有內容的欄位拿掉；文字去頭尾空白） */
export function profileView(d: ProfileData): ProfileView {
  const p = d.profile;
  const on = d.show;
  const pl = p.plExp ? OUT.exp[p.plExp] : '';
  const kp = p.kpExp ? OUT.exp[p.kpExp] : '';
  const tags: ProfileView['tags'] = [];
  for (const key of ['styles', 'formats', 'tools', 'schedule'] as const) {
    if (!on[key]) continue;
    const items = tagLabels(p[key], key, OUT.tags[key]);
    const note = key === 'schedule' ? t(p.scheduleNote) : '';
    if (items.length || note) tags.push({ key, title: OUT.fields[key], items, note });
  }
  return {
    nickname: t(p.nickname),
    handle: on.handle ? t(p.handle) : '',
    tagline: on.tagline ? t(p.tagline) : '',
    avatar: on.avatar,
    avatarCredit: on.avatar ? t(p.avatarCredit) : '',
    age: on.age && p.age ? OUT.age[p.age] : '',
    experience: on.experience && (pl || kp || t(p.expNote)) ? { pl, kp, note: t(p.expNote) } : null,
    systems: on.systems
      ? p.systems
          .filter((s) => t(s.name))
          .map((s) => ({
            name: t(s.name),
            levelId: s.level,
            level: OUT.systemLevels[s.level],
            kp: s.kp,
            note: t(s.note),
          }))
      : [],
    tags,
    contacts: on.contact
      ? p.contacts
          .filter((c) => t(c.kind) || t(c.value))
          .map((c) => ({ kind: t(c.kind), value: t(c.value) }))
      : [],
    memo: on.memo ? p.memo.replace(/\s+$/, '').replace(/^\n+/, '') : '',
  };
}

/** 自介卡有沒有任何內容（暱稱以外） */
export function profileHasContent(v: ProfileView): boolean {
  return !!(
    v.nickname ||
    v.handle ||
    v.tagline ||
    v.age ||
    v.experience ||
    v.systems.length ||
    v.tags.length ||
    v.contacts.length ||
    v.memo
  );
}

/* ---------- 地雷表 ---------- */

export interface JiraiItem {
  label: string;
  note: string;
  level: LevelId;
}

export interface JiraiGroup {
  /** 依程度：程度；依分類：分類 */
  level: LevelId | null;
  title: string;
  items: JiraiItem[];
}

export interface JiraiView {
  mode: GroupMode;
  groups: JiraiGroup[];
  memo: string;
  /** 有沒有任何填了的主題 */
  any: boolean;
}

const item = (topic: TopicView, notes: boolean): JiraiItem => ({
  label: topic.label.trim(),
  note: notes ? topic.note.trim() : '',
  level: topic.level as LevelId,
});

/** 地雷表的檢視：只有填了程度的主題；issuesOnly 時只留 ng、ask 兩級 */
export function jiraiView(
  d: ProfileData,
  {
    mode = d.look.group,
    notes = d.look.notes,
    issuesOnly = false,
  }: { mode?: GroupMode; notes?: boolean; issuesOnly?: boolean } = {},
): JiraiView {
  const filled = filledTopics(d.jirai).filter(
    ({ topic }) => !issuesOnly || topic.level === 'ng' || topic.level === 'ask',
  );
  const memo = d.jirai.memo.replace(/\s+$/, '').replace(/^\n+/, '');
  if (mode === 'level') {
    const groups = LEVEL_OUTPUT_ORDER.map((level) => ({
      level,
      title: OUT.levels[level],
      items: filled.filter((f) => f.topic.level === level).map((f) => item(f.topic, notes)),
    })).filter((g) => g.items.length);
    return { mode, groups, memo, any: filled.length > 0 };
  }
  const groups: JiraiGroup[] = [];
  for (const c of jiraiCategories(d.jirai)) {
    const items = filled.filter((f) => f.category.id === c.id).map((f) => item(f.topic, notes));
    if (items.length) groups.push({ level: null, title: categoryTitle(c), items });
  }
  return { mode, groups, memo, any: filled.length > 0 };
}

export const categoryTitle = (c: CategoryView): string => c.name.trim() || OUT.untitledCategory;

/** 地雷表的標題（有暱稱時「〇〇的地雷表」） */
export const jiraiTitle = (d: ProfileData): string => {
  const nick = d.profile.nickname.trim();
  return nick ? OUT.jiraiOf(nick) : OUT.jiraiTitle;
};
