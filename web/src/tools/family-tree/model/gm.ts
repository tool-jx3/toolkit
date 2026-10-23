/**
 * GM 專用與 PL 版（本站，規格 F86、3.8）：PL 檢視與 PL 用的匯出看到的人物資料。
 *
 * 算秘密的東西：
 * - GM 筆記（secret）：一律拿掉。
 * - 只有 GM 看得到的人（gm）：成員連同所有子孫（含他們的配偶、生家那邊的「出」字小卡）一起拿掉；
 *   配偶只拿掉那張配偶卡片（孩子留著，父母欄指到他的清掉）。連到被拿掉的人的婚姻連結（兩邊的配偶卡片）也拿掉。
 * - 只有 GM 看得到的欄位（gmFields）：那幾欄拿掉；「過繼」是秘密時，PL 看到的是繼父的親生孩子
 *   （父親＝繼父、母親不寫，沒有「入」、生家沒有「出」）。
 * 專案檔、自動儲存一律是完整的（GM 的資料）。
 */
import { fixRefs } from './sanitize';
import { indexTree } from './tree';
import { type GmField, isMember, isSpouse, type Member, type People, type Person } from './types';

/** 有沒有任何 GM 專用的東西（沒有時 PL 版和 GM 版一樣） */
export function hasSecrets(people: People): boolean {
  for (const p of Object.values(people)) if (p.gm || p.secret || p.gmFields?.length) return true;
  return false;
}

/**
 * PL 版會拿掉的人（GM 檢視與 GM 用的匯出畫斜線的範圍）：只有 GM 看得到的成員連同子孫、他們的配偶、
 * 只有 GM 看得到的配偶、連到這些成員的婚姻（兩邊的配偶卡片）
 */
export function hiddenIds(people: People): Set<string> {
  const out = new Set<string>();
  /* 拿掉的人都從「只有 GM 看得到」的成員或配偶開始；沒有的話不用整理整棵樹 */
  if (!Object.values(people).some((p) => p.gm)) return out;
  const idx = indexTree(people);
  const stack: string[] = [];
  for (const p of idx.members) if (p.gm) stack.push(p.id);
  while (stack.length) {
    const id = stack.pop() as string;
    if (out.has(id)) continue;
    out.add(id);
    for (const k of idx.allKids.get(id) ?? []) stack.push(k.id);
  }
  for (const p of Object.values(people)) {
    if (!isSpouse(p)) continue;
    if (p.gm || out.has(p.spouseOf) || (p.link?.personId && out.has(p.link.personId)))
      out.add(p.id);
  }
  /* 成對的配偶：一邊是秘密時另一邊也是（同一段婚姻） */
  for (const p of Object.values(people)) {
    if (!isSpouse(p) || out.has(p.id) || !p.link) continue;
    const pair = p.link.pairId ? people[p.link.pairId] : undefined;
    if (pair && out.has(pair.id)) out.add(p.id);
  }
  return out;
}

const drop = (p: Person, f: GmField) => {
  const o = p as unknown as Record<string, unknown>;
  if (f === 'avatar') {
    delete o.avatar;
    delete o.avatarPos;
  } else delete o[f];
};

/** 一位人物在 PL 版裡的樣子（複本） */
function plPerson(p: Person, people: People): Person {
  const c: Person = isMember(p)
    ? { ...p, ...(p.adopt ? { adopt: { ...p.adopt } } : {}) }
    : { ...p, ...(p.link ? { link: { ...p.link } } : {}) };
  delete c.secret;
  delete c.gm;
  const fields = c.gmFields ?? [];
  delete c.gmFields;
  for (const f of fields) {
    if (f === 'adopt') {
      if (!isMember(c)) continue;
      const to = c.adopt?.fatherId;
      if (to && isMember(people[to])) {
        c.fatherId = to;
        delete c.motherId;
      }
      delete c.adopt;
    } else drop(c, f);
  }
  return c;
}

/** PL 版的人物資料（保留加入的順序；沒有秘密時回傳原本的物件） */
export function plPeople(people: People): People {
  if (!hasSecrets(people)) return people;
  const hidden = hiddenIds(people);
  const out: People = {};
  for (const [id, p] of Object.entries(people)) {
    if (hidden.has(id)) continue;
    out[id] = plPerson(p, people);
  }
  /* 指到被拿掉的人的父母、過繼、連結清掉 */
  for (const p of Object.values(out)) {
    if (isMember(p)) {
      if (p.fatherId && !out[p.fatherId]) delete p.fatherId;
      if (p.motherId && !out[p.motherId]) delete p.motherId;
    } else if (p.link?.pairId && !out[p.link.pairId]) delete p.link.pairId;
  }
  fixRefs(out);
  return out;
}

/** 這個欄位 PL 看不看得到 */
export const isGmField = (p: Person, f: GmField): boolean => !!p.gmFields?.includes(f);

/** 過繼是秘密（PL 版裡是繼父的親生孩子） */
export const adoptIsSecret = (p: Member): boolean => isGmField(p, 'adopt');
