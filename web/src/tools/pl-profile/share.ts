/**
 * 分享連結（規格 F40～F42、3.5）：網址 `#p=` ＋ deflate 壓縮的 `{ v: 1, d: 內容 }`（共用 core/share）。
 * 內容＝自介卡與地雷表（沒有頭像；關掉眼睛的欄位清空；成人向關掉時拿掉成人向主題）＋外觀，
 * 預設值與空白的欄位省略。讀回時一律用 normalizeData 整理（網址是任何人都能編的輸入）。
 */
import { encodeShareHash, readShareHash } from '@/core/share';
import { type FieldKey, initialProfile, normalizeData, type ProfileData } from './model';
import { CATEGORIES } from './topics';

export const SHARE_KEY = 'p';
export const SHARE_VERSION = 1;
/** # 後面最多幾個字 */
export const SHARE_MAX_LENGTH = 8000;
/** 解壓縮後最多幾個位元組（超過當成讀不出來：很短的連結解出很大的資料） */
export const SHARE_MAX_BYTES = 256 * 1024;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 拿掉空字串、空陣列、空物件、null（布林值與數字留著） */
export function prune(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(prune);
  if (!isObj(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    const p = prune(x);
    if (p === '' || p === null || p === undefined) continue;
    if (Array.isArray(p) && p.length === 0) continue;
    if (isObj(p) && Object.keys(p).length === 0) continue;
    out[k] = p;
  }
  return out;
}

/** 分享（與 KP 對照表）用的內容：頭像拿掉、關掉眼睛的欄位清空、看不到的成人向主題拿掉 */
export function sharedData(d: ProfileData): ProfileData {
  const on = (k: FieldKey) => d.show[k];
  const p = d.profile;
  const empty = initialProfile();
  const profile = {
    ...p,
    avatar: null,
    avatarPlacement: null,
    handle: on('handle') ? p.handle : '',
    tagline: on('tagline') ? p.tagline : '',
    avatarCredit: on('avatar') ? p.avatarCredit : '',
    age: on('age') ? p.age : empty.age,
    plExp: on('experience') ? p.plExp : empty.plExp,
    kpExp: on('experience') ? p.kpExp : empty.kpExp,
    expNote: on('experience') ? p.expNote : '',
    systems: on('systems') ? p.systems.filter((s) => s.name.trim()) : [],
    styles: on('styles') ? p.styles : empty.styles,
    formats: on('formats') ? p.formats : empty.formats,
    tools: on('tools') ? p.tools : empty.tools,
    schedule: on('schedule') ? p.schedule : empty.schedule,
    scheduleNote: on('schedule') ? p.scheduleNote : '',
    contacts: on('contact') ? p.contacts.filter((c) => c.kind.trim() || c.value.trim()) : [],
    memo: on('memo') ? p.memo : '',
  };
  const adultKeys = new Set(
    CATEGORIES.filter((c) => c.adult).flatMap((c) => c.topics.map((t) => t.key)),
  );
  const keepTopic = (k: string) => d.jirai.adult || !adultKeys.has(k);
  const adultCats = new Set(CATEGORIES.filter((c) => c.adult).map((c) => c.key));
  const jirai = {
    ...d.jirai,
    levels: Object.fromEntries(Object.entries(d.jirai.levels).filter(([k]) => keepTopic(k))),
    notes: Object.fromEntries(Object.entries(d.jirai.notes).filter(([k]) => keepTopic(k))),
    custom: d.jirai.custom.filter(
      (t) => t.label.trim() && (d.jirai.adult || !adultCats.has(t.cat)),
    ),
  };
  return { ...d, profile, jirai };
}

/** 放進網址的物件（省略空白；清單項目的 id 拿掉，讀回時重新編） */
export function toSharePayload(d: ProfileData): unknown {
  const s = sharedData(d);
  const payload = {
    ...s,
    profile: {
      ...s.profile,
      systems: s.profile.systems.map(({ id: _id, ...rest }) => rest),
      contacts: s.profile.contacts.map(({ id: _id, ...rest }) => rest),
    },
  };
  return prune(payload);
}

/** 內容 → `#p=…`（含 #） */
export const encodeShare = (d: ProfileData): string =>
  encodeShareHash(toSharePayload(d), { version: SHARE_VERSION, key: SHARE_KEY });

/** 完整的分享網址（目前的網址換掉 #） */
export function shareUrlFor(d: ProfileData, base: string): string {
  const u = new URL(base);
  u.hash = encodeShare(d).slice(1);
  return u.toString();
}

export type ShareRead = 'none' | 'broken' | ProfileData;

/** 網址的 # → 分享的內容（沒有分享：'none'；讀不出來：'broken'） */
export function readShare(hash: string): ShareRead {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!new URLSearchParams(h).has(SHARE_KEY)) return 'none';
  const raw = readShareHash(hash, {
    version: SHARE_VERSION,
    key: SHARE_KEY,
    maxLength: SHARE_MAX_LENGTH,
    maxBytes: SHARE_MAX_BYTES,
  });
  if (!isObj(raw)) return 'broken';
  return normalizeData(raw);
}

/** 一段文字裡所有的分享內容（KP 對照表一次貼好幾個連結；每個 `#p=…` 一份） */
export function sharesInText(text: string): { found: number; data: ProfileData[]; broken: number } {
  const matches = text.match(/#(?:[^\s#]*&)?p=[A-Za-z0-9_-]+/g) ?? [];
  const data: ProfileData[] = [];
  let broken = 0;
  for (const m of matches) {
    const r = readShare(m);
    if (typeof r === 'object') data.push(r);
    else broken += 1;
  }
  return { found: matches.length, data, broken };
}
