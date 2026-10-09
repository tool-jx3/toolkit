/**
 * 排行榜產生器（rank-chart）：讀原作的設定檔時，標題三行和原作逐字相同（規格 F05、3.7；對等驗證 7.1）。
 * 17 份設定與原作的標題取自對等驗證的 vtitles（原作 commit f323b87 的標題預覽）。
 * 例外（規格寫明的差異，只有手寫的 JSON 才會碰到）：助詞值不合法時新版另外解讀、名字空白時新版用「我」。
 * 另外確認：讀進來的設定經過自動儲存再讀回（normalizeConfig）標題不變（接上助詞後不再截字數）。
 */
import { describe, expect, it } from 'vitest';
import { normalizeConfig, titleParts } from '@/tools/rank-chart/model';
import { importLegacy } from '@/tools/rank-chart/project';

const BASE = {
  name: 'Mia',
  nameParticle: 'none',
  intro: 'picks',
  subject: 'Night Market Crew',
  subjectParticle: 'none',
  question: 'Who goes first?',
  slots: 5,
  characters: ['Ash', 'Birch', 'Cedar', 'Dune', 'Ember'].map((name, i) => ({
    id: `v${i}`,
    name,
    source: '',
    thumbnail: '',
    crop: { zoom: 1, x: 0, y: 0 },
  })),
};

type Case = [string, Record<string, unknown>, [string, string, string]];
const Q = 'Who goes first?';
const CASES: Case[] = [
  [
    'ko-auto-default',
    {
      name: '김씨',
      nameParticle: 'auto',
      intro: '말아주는',
      subject: 'OOOO 등장인물',
      subjectParticle: 'with',
    },
    ['김씨가 말아주는', 'OOOO 등장인물과', Q],
  ],
  [
    'ascii-auto',
    {
      name: 'Kim',
      nameParticle: 'auto',
      intro: '말아주는',
      subject: 'Hero',
      subjectParticle: 'topic',
    },
    ['Kim이 말아주는', 'Hero는', Q],
  ],
  [
    'digit-auto-nointro',
    { name: '2024', nameParticle: 'auto', intro: '', subject: '고양이', subjectParticle: 'object' },
    ['2024가', '고양이를', Q],
  ],
  [
    'ascii-explicit-ga',
    {
      name: 'Lee',
      nameParticle: '가',
      intro: 'presents',
      subject: 'Cats',
      subjectParticle: 'subject',
    },
    ['Lee가 presents', 'Cats이', Q],
  ],
  [
    'kpop-auto',
    {
      name: 'K-pop',
      nameParticle: 'auto',
      intro: '말아주는',
      subject: 'Idol',
      subjectParticle: 'with',
    },
    ['K-pop가 말아주는', 'Idol과', Q],
  ],
  [
    'ko-none',
    { name: '지수', nameParticle: 'none', intro: 'x', subject: '친구들', subjectParticle: 'none' },
    ['지수 x', '친구들', Q],
  ],
  [
    'ko-punct-auto',
    {
      name: '민준!',
      nameParticle: 'auto',
      intro: '말아주는',
      subject: '팀',
      subjectParticle: 'topic',
    },
    ['민준!이 말아주는', '팀은', Q],
  ],
  [
    'ko-auto-nointro',
    { name: '김', nameParticle: 'auto', intro: '', subject: '책', subjectParticle: 'with' },
    ['김이', '책과', Q],
  ],
  [
    'intro40-none',
    {
      name: 'Ann',
      nameParticle: 'none',
      intro: 'abcdefghijklmnopqrstuvwxyz0123456789ABCD',
      subject: 'S',
      subjectParticle: 'none',
    },
    ['Ann abcdefghijklmnopqrstuvwxyz0123456789ABCD', 'S', Q],
  ],
  [
    'intro40-auto-ko',
    {
      name: '하나',
      nameParticle: 'auto',
      intro: '가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차',
      subject: 'S',
      subjectParticle: 'none',
    },
    ['하나가 가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차', 'S', Q],
  ],
  [
    'subject80-with',
    {
      name: '나',
      nameParticle: 'none',
      intro: '',
      subject: '가'.repeat(80),
      subjectParticle: 'with',
    },
    ['나', `${'가'.repeat(80)}와`, Q],
  ],
  [
    'missing-particles',
    {
      name: '민지',
      nameParticle: undefined,
      intro: '말아주는',
      subject: '사람',
      subjectParticle: undefined,
    },
    ['민지가 말아주는', '사람과', Q],
  ],
  [
    'emoji-name',
    {
      name: '🐱',
      nameParticle: 'auto',
      intro: 'and co',
      subject: 'Pets 🐶',
      subjectParticle: 'none',
    },
    ['🐱가 and co', 'Pets 🐶', Q],
  ],
  [
    'spaces',
    {
      name: '  Bob  ',
      nameParticle: 'none',
      intro: '   likes   ',
      subject: '  Tea  ',
      subjectParticle: 'none',
      question: '  ok?  ',
    },
    ['Bob likes', 'Tea', 'ok?'],
  ],
  /* 規格寫明的差異（原作：助詞值不合法時用預設 auto／with →「민지가 말아주는」「사람과」；名字空白 →「나가 말아주는」） */
  [
    'invalid-particles',
    {
      name: '민지',
      nameParticle: 'with',
      intro: '말아주는',
      subject: '사람',
      subjectParticle: 'auto',
    },
    ['민지와 말아주는', '사람이', Q],
  ],
  [
    'garbage-particles',
    {
      name: '민지',
      nameParticle: 'zzz',
      intro: '말아주는',
      subject: '사람',
      subjectParticle: 'zzz',
    },
    ['민지 말아주는', '사람', Q],
  ],
  [
    'empty-name',
    { name: '', nameParticle: 'auto', intro: '말아주는', subject: '사람', subjectParticle: 'with' },
    ['我가 말아주는', '사람과', Q],
  ],
];

const file = (over: Record<string, unknown>) => {
  const config: Record<string, unknown> = { ...BASE, ...over };
  for (const k of Object.keys(over)) if (over[k] === undefined) delete config[k];
  return JSON.stringify({ app: 'blind-pick-studio', version: 1, config });
};

describe('原作設定檔的標題（17 份）', () => {
  it.each(CASES)('%s', async (_name, over, expected) => {
    const { config } = await importLegacy(file(over));
    const t = titleParts(config);
    expect([t.first, t.second, t.third]).toEqual(expected);
    /* 自動儲存後再讀回：不再截字數，標題不變 */
    const again = titleParts(normalizeConfig(JSON.parse(JSON.stringify(config))));
    expect([again.first, again.second, again.third]).toEqual(expected);
  });
});
