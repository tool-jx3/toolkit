/**
 * 卡片上的字（畫面與匯出共用；規格 3.2、3.3）：名字（女兒的寫法）、讀音、說明行（過繼、外孫、婚姻、別名）、
 * 印記（入、狀態）、GM 的標記。規則照原作：
 * - 說明行：過繼的人「生父 ○○ · 繼子」→ 母系外孫「外孫 · 母 ○○」→ 別人連過來的婚姻「婚姻 · ○○」→ 別名；
 *   說明行不是別名、又有別名時，下面再一行別名（只顯示第一行）。
 * - 「入」：有繼父（繼父不是成員時也畫，原作同）。
 */
import { S } from '../strings';
import { adoptKindOf, daughterHusband, linkOf, marriedTo, maternalMother, shownOf } from './tree';
import type { LifeStatus, Member, People, Person, Spouse } from './types';

const nameOf = (p: Person | undefined) => (p?.name ? p.name : S.unnamed);

export interface MemberText {
  /** 名字那一欄的字（空白時 ''：畫面顯示提示，匯出寫「（未命名）」） */
  name: string;
  /** 讀音那一欄的字 */
  reading: string;
  /**
   * 女兒寫成「女（適 丈夫）」：名字、讀音是丈夫的（husband：就地編輯改的丈夫；沒有丈夫時 null、不能就地編輯）；
   * editName、editReading：就地編輯時的值（丈夫的名字、讀音）
   */
  daughter: { husband: Spouse | null; editName: string; editReading: string } | null;
  /** 說明行（null：沒有） */
  meta: string | null;
  /** 說明行就是別名（多行、最多 2 行） */
  metaIsAlias: boolean;
  /** 說明行不是別名時，下面再一行別名 */
  alias: string | null;
  /** 「入」字印記 */
  adopted: boolean;
  status: Exclude<LifeStatus, 'alive'> | null;
}

/** 成員卡片的字；lb＝linkedBy(people) */
export function memberText(
  people: People,
  p: Member,
  lb: Map<string, Member[]>,
  daughterName: boolean,
): MemberText {
  let name = p.name;
  let reading = p.reading ?? '';
  let daughter: MemberText['daughter'] = null;
  if (daughterName && p.gender === 'F') {
    const h = daughterHusband(people, p);
    const src = h ? shownOf(people, h) : null;
    name = h ? S.daughterLabel(nameOf(src ?? undefined)) : S.daughterSelf(nameOf(p));
    reading = src ? (src.reading ?? '') : (p.reading ?? '');
    daughter = { husband: h, editName: src?.name ?? '', editReading: src?.reading ?? '' };
  }
  let meta: string | null = null;
  if (p.adopt?.fatherId) {
    const bf = p.fatherId ? people[p.fatherId] : undefined;
    meta = S.birthFatherMeta(bf ? nameOf(bf) : null, S.adoptWord[adoptKindOf(p)]);
  } else {
    const mo = maternalMother(people, p);
    if (mo) meta = S.maternalMeta(nameOf(mo));
    else {
      const wed = marriedTo(people, p, lb);
      if (wed.length) meta = S.marriedMeta(wed.map(nameOf).join('、'));
    }
  }
  const alias = p.alias ? p.alias : null;
  const metaIsAlias = !meta && !!alias;
  return {
    name,
    reading,
    daughter,
    meta: meta ?? alias,
    metaIsAlias,
    alias: meta && alias ? alias : null,
    adopted: !!p.adopt?.fatherId,
    status: p.status === 'dead' || p.status === 'missing' ? p.status : null,
  };
}

/** 「出」字小卡的字：名字與「→ 繼父 的繼子」（to：繼父的名字） */
export function stubText(people: People, p: Member): { name: string; meta: string; to: string } {
  const to = nameOf(p.adopt?.fatherId ? people[p.adopt.fatherId] : undefined);
  return { name: nameOf(p), meta: S.stubMeta(to, S.adoptWord[adoptKindOf(p)]), to };
}

/** 配偶卡片：「妻／夫」（連結時加「 · 連結」）、顯示誰的資料 */
export function chipText(
  people: People,
  host: Member,
  s: Spouse,
): { rel: string; linked: boolean; src: Person } {
  const linked = !!linkOf(people, s);
  return {
    rel: host.gender === 'F' ? S.husband : S.wife,
    linked,
    src: shownOf(people, s),
  };
}

/** 狀態的印記文字 */
export const statusSeal = (s: MemberText['status']): string | null => (s ? S.statusSeal[s] : null);

/**
 * 頭像的佔位字：名字有空格時取最後一段的第一個字（「綾瀬 冬子」→「冬」：同一家人的姓都一樣），
 * 否則第一個字；沒有名字時空白。
 */
export function initialOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return Array.from(parts[parts.length - 1] ?? '')[0] ?? '';
}
