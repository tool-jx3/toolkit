/**
 * 範例圖板（規格 D4）：本站自己編的虛構家族「綾瀬家」——昭和年代山腰洋館的舊家，四代 13 人＋配偶 6 人。
 * 原作的範例是真實的歷史家族，不沿用。第二批加了狀態（冬子、透 死亡，清彦 失蹤）與兩則 GM 筆記（F85、F86）。
 */
import { type Board, type Member, newId, type People, type Spouse } from './types';

type M = Omit<Member, 'kind' | 'id'>;
type S = Omit<Spouse, 'kind' | 'id'>;

export const EXAMPLE_TITLE = '範例：綾瀬家';

export function exampleBoard(id = newId('b'), createdAt = new Date().toISOString()): Board {
  const people: People = {};
  const m = (pid: string, v: M) => {
    people[pid] = { id: pid, kind: 'member', ...v };
  };
  const s = (pid: string, v: S) => {
    people[pid] = { id: pid, kind: 'spouse', ...v };
  };
  m('ex-soichiro', {
    name: '綾瀬 宗一郎',
    reading: 'あやせ そういちろう',
    gender: 'M',
    gen: 1,
    order: 1,
    birth: '1889',
    death: '1951',
    alias: '初代當家\n號 霧庵',
    note: '靠製絲業致富，在山腰蓋了洋館。晚年幾乎不出書房。',
    cat: 'ex-head',
  });
  s('ex-chiyo', {
    name: '綾瀬 千代',
    spouseOf: 'ex-soichiro',
    order: 1,
    birth: '1895',
    death: '1960',
    origin: '舊姓 久世',
    note: '久世家的長女。',
  });
  s('ex-shino', {
    name: '綾瀬 志乃',
    spouseOf: 'ex-soichiro',
    order: 2,
    birth: '1902',
    death: '1944',
    origin: '後妻，出身不明',
    note: '和冬子同一年過世。',
    cat: 'ex-dead',
  });
  m('ex-masatsugu', {
    name: '綾瀬 正嗣',
    gender: 'M',
    order: 1,
    fatherId: 'ex-soichiro',
    motherId: 'ex-chiyo',
    birth: '1915',
    death: '1972',
    alias: '二代當家',
    cat: 'ex-head',
  });
  s('ex-kikue', {
    name: '綾瀬 菊江',
    spouseOf: 'ex-masatsugu',
    order: 1,
    birth: '1920',
    death: '1988',
    origin: '舊姓 早瀬',
  });
  m('ex-fuyuko', {
    name: '綾瀬 冬子',
    gender: 'F',
    order: 2,
    fatherId: 'ex-soichiro',
    motherId: 'ex-shino',
    birth: '1918',
    death: '1944',
    note: '二十六歲時在別館過世，死因沒有公開。',
    cat: 'ex-dead',
    status: 'dead',
    secret: '其實是被後妻志乃毒死的；志乃同一年在別館自縊。',
  });
  m('ex-kiyohiko', {
    name: '綾瀬 清彦',
    gender: 'M',
    order: 3,
    fatherId: 'ex-soichiro',
    motherId: 'ex-chiyo',
    birth: '1922',
    alias: '次男',
    note: '戰後下落不明，家裡沒有人提起他。',
    status: 'missing',
  });
  m('ex-chizuru', {
    name: '綾瀬 千鶴',
    gender: 'F',
    order: 4,
    fatherId: 'ex-soichiro',
    motherId: 'ex-chiyo',
    birth: '1925',
    death: '2010',
    alias: '嫁到鷺沼家',
  });
  s('ex-fumio', {
    name: '鷺沼 文雄',
    spouseOf: 'ex-chizuru',
    order: 1,
    birth: '1921',
    death: '1990',
    origin: '鷺沼商店',
  });
  m('ex-kazuomi', {
    name: '綾瀬 和臣',
    gender: 'M',
    order: 1,
    fatherId: 'ex-masatsugu',
    motherId: 'ex-kikue',
    birth: '1942',
    death: '2003',
    alias: '三代當家',
    cat: 'ex-head',
  });
  s('ex-sayoko', {
    name: '綾瀬 小夜子',
    spouseOf: 'ex-kazuomi',
    order: 1,
    birth: '1946',
    origin: '舊姓 白石',
  });
  m('ex-yukino', {
    name: '綾瀬 雪乃',
    gender: 'F',
    order: 2,
    fatherId: 'ex-masatsugu',
    motherId: 'ex-kikue',
    birth: '1947',
  });
  s('ex-makoto', {
    name: '三輪 誠',
    spouseOf: 'ex-yukino',
    order: 1,
    birth: '1943',
    death: '1999',
    origin: '三輪醫院',
  });
  m('ex-toru', {
    name: '綾瀬 透',
    gender: 'M',
    order: 3,
    fatherId: 'ex-masatsugu',
    motherId: 'ex-kikue',
    birth: '1950',
    death: '1968',
    note: '十八歲時在後山的池塘溺死。',
    cat: 'ex-dead',
    status: 'dead',
    secret: '池塘底下是舊的祭祀場，透是在那裡被拉下去的。',
  });
  m('ex-kiyoshi', {
    name: '綾瀬 清',
    gender: 'M',
    order: 1,
    fatherId: 'ex-kiyohiko',
    birth: '1948',
    alias: '在久世家長大',
    note: '清彦失蹤前留下的兒子，母親不詳。',
  });
  m('ex-haruka', {
    name: '綾瀬 遥',
    reading: 'あやせ はるか',
    gender: 'F',
    order: 1,
    fatherId: 'ex-kazuomi',
    motherId: 'ex-sayoko',
    birth: '1975',
    alias: '委託人',
    note: '委託調查祖父留下的洋館。',
    cat: 'ex-target',
  });
  m('ex-shingo', {
    name: '綾瀬 慎吾',
    gender: 'M',
    order: 2,
    fatherId: 'ex-kazuomi',
    motherId: 'ex-sayoko',
    birth: '1978',
    note: '在東京當記者。',
  });
  m('ex-aoi', {
    name: '三輪 葵',
    gender: 'F',
    order: 1,
    fatherId: 'ex-makoto',
    motherId: 'ex-yukino',
    birth: '1972',
  });
  m('ex-ritsu', {
    name: '綾瀬 律',
    gender: 'M',
    order: 1,
    fatherId: 'ex-kiyoshi',
    birth: '1976',
    note: '在大學研究民俗學。',
  });
  return {
    id,
    title: EXAMPLE_TITLE,
    createdAt,
    align: 'center',
    cats: [
      { id: 'ex-head', name: '當家', color: '#3f77c8' },
      { id: 'ex-dead', name: '死因不明', color: '#8a7d6e' },
      { id: 'ex-target', name: '調查對象', color: '#d64545' },
    ],
    people,
  };
}
