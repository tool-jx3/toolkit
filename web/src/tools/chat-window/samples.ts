/**
 * 預覽用的範例訊息與測試訊息（本專案自己寫的 TRPG 情境，繁中）。
 * 主分頁約 8 則、秘匿分頁約 5 則；測試訊息每種輪流使用 2～4 則範例，時間每則往後一分鐘。
 */
import {
  chatTimestamp,
  type DiceOutcome,
  SECRET_DICE_CHAT_TEXT,
  systemStatusMessage,
} from '@/ccfolia';
import { mockAvatar } from '@/ccfolia/mock/assets';
import type {
  MockChatMessage,
  MockChatParticipant,
  MockChatSpeaker,
  MockChatTab,
} from '@/ccfolia/mock/chat';

export type PreviewTab = 'main' | 'secret';
export const PREVIEW_TABS: readonly PreviewTab[] = ['main', 'secret'];
export const tabIndex = (t: PreviewTab): number => (t === 'secret' ? 1 : 0);

export type TestKind = 'chat' | 'success' | 'failure' | 'other' | 'secret' | 'long' | 'system';
export const TEST_KINDS: readonly TestKind[] = [
  'chat',
  'success',
  'failure',
  'other',
  'secret',
  'long',
  'system',
];

/** 測試訊息是不是擲骰（有結果） */
export const isDiceKind = (k: TestKind): boolean =>
  k === 'success' || k === 'failure' || k === 'other';

/* ---------- 角色 ---------- */

export const SPEAKERS = {
  qing: { name: '林晴', color: '#f2a65a', avatar: mockAvatar(0) },
  carlos: { name: '卡洛斯', color: '#7ec8ff', avatar: mockAvatar(1) },
  aoi: { name: '小葵', color: '#ff8fb3', avatar: mockAvatar(6) },
  kp: { name: 'KP', color: '#d8d8d8', avatar: mockAvatar(7) },
} satisfies Record<string, MockChatSpeaker>;

export type SpeakerId = keyof typeof SPEAKERS;
export const SPEAKER_IDS = Object.keys(SPEAKERS) as SpeakerId[];

export const PARTICIPANTS: readonly MockChatParticipant[] = [
  { name: 'KP', avatar: mockAvatar(7) },
  { name: '林晴', avatar: mockAvatar(0) },
  { name: 'Momo', avatar: null },
];

export const SECRET_TAB_NAME = '密談';
export const MAIN_TAB_NAME = 'メイン';

/** 第 i 則的時間（21:00 起每則一分鐘） */
export function timeAt(i: number): string {
  return chatTimestamp(new Date(2026, 9, 1, 21, 0 + i));
}

type Draft = Omit<MockChatMessage, 'id' | 'time'>;

const MAIN: Draft[] = [
  { speaker: SPEAKERS.kp, text: '午夜十二點，舊校舍走廊的盡頭傳來拖著腳步的聲音。' },
  { speaker: SPEAKERS.qing, text: '我先躲到置物櫃後面，看看是誰。' },
  {
    speaker: SPEAKERS.qing,
    text: 'CC<=55 【聆聽】',
    result: '(1D100<=55) ＞ 31 ＞ 成功',
  },
  {
    speaker: SPEAKERS.carlos,
    text: 'CC<=40 【潛行】',
    result: '(1D100<=40) ＞ 88 ＞ 失敗',
  },
  { speaker: null, text: systemStatusMessage('卡洛斯', 'SAN', 58, 55) },
  { speaker: SPEAKERS.kp, text: '1D6 撞到桌角的傷害', result: '(1D6) ＞ 4' },
  { speaker: SPEAKERS.kp, text: '', secretOther: true },
  {
    speaker: SPEAKERS.aoi,
    text: 'CC<=70 【圖書館】',
    result: '(1D100<=70) ＞ 3 ＞ 決定的成功/スペシャル',
  },
];

const SECRET: Draft[] = [
  { speaker: SPEAKERS.kp, text: '（只有你聽得到）置物櫃裡，有東西在呼吸。' },
  { speaker: SPEAKERS.qing, text: '……我假裝沒聽到，慢慢往後退。' },
  {
    speaker: SPEAKERS.qing,
    text: 'CC<=45 【心理學】',
    result: '(1D100<=45) ＞ 12 ＞ 成功',
  },
  { speaker: SPEAKERS.kp, text: '1D3 SAN 值損失', result: '(1D3) ＞ 2' },
  { speaker: null, text: systemStatusMessage('林晴', 'SAN', 61, 59) },
];

const withIds = (tab: PreviewTab, list: Draft[]): MockChatMessage[] =>
  list.map((m, i) => ({ ...m, id: `${tab}-${i}`, time: timeAt(i) }));

/** 某個預覽分頁的初始範例訊息 */
export function sampleMessages(tab: PreviewTab): MockChatMessage[] {
  return withIds(tab, tab === 'main' ? MAIN : SECRET);
}

/** 預覽的兩個分頁（主分頁、有參加者的秘匿分頁） */
export function sampleTabs(): MockChatTab[] {
  return [
    { name: MAIN_TAB_NAME, messages: sampleMessages('main') },
    {
      name: SECRET_TAB_NAME,
      secret: true,
      participants: PARTICIPANTS,
      messages: sampleMessages('secret'),
    },
  ];
}

/* ---------- 測試訊息 ---------- */

const EXAMPLES: Record<TestKind, Draft[]> = {
  chat: [
    { speaker: SPEAKERS.aoi, text: '等等，那本畢業紀念冊上的名字……跟校長一樣耶。' },
    { speaker: SPEAKERS.carlos, text: '我把手電筒照過去，一邊小聲數著腳步。' },
    { speaker: SPEAKERS.qing, text: '大家先別出聲，我覺得它還沒走遠。' },
    { speaker: SPEAKERS.kp, text: '走廊的燈閃了兩下，然後整排熄滅。' },
  ],
  success: [
    { speaker: SPEAKERS.carlos, text: 'CC<=60 【閃避】', result: '(1D100<=60) ＞ 22 ＞ 成功' },
    { speaker: SPEAKERS.aoi, text: 'CC<=50 【偵查】', result: '(1D100<=50) ＞ 9 ＞ 困難成功' },
    { speaker: SPEAKERS.qing, text: 'CC<=65 【說服】', result: '(1D100<=65) ＞ 1 ＞ 大成功' },
  ],
  failure: [
    { speaker: SPEAKERS.qing, text: 'CC<=40 【攀爬】', result: '(1D100<=40) ＞ 73 ＞ 失敗' },
    { speaker: SPEAKERS.aoi, text: 'CC<=35 【鎖匠】', result: '(1D100<=35) ＞ 100 ＞ 致命的失敗' },
    { speaker: SPEAKERS.carlos, text: 'CC<=55 【急救】', result: '(1D100<=55) ＞ 91 ＞ 失敗' },
  ],
  other: [
    { speaker: SPEAKERS.kp, text: '2D6 怪物的傷害', result: '(2D6) ＞ 9[4,5] ＞ 9' },
    { speaker: SPEAKERS.carlos, text: '1D100 隨機事件', result: '(1D100) ＞ 47' },
    { speaker: SPEAKERS.aoi, text: '1D4+1 回復量', result: '(1D4+1) ＞ 3[3]+1 ＞ 4' },
  ],
  secret: [
    { speaker: SPEAKERS.kp, text: '', secretOther: true },
    { speaker: SPEAKERS.carlos, text: '', secretOther: true },
  ],
  long: [
    {
      speaker: SPEAKERS.aoi,
      text: '【舊日記的最後一頁】\n十月三日，雨。\n今天又聽見地下室傳來敲門聲，一共七下，跟昨天一樣。\n管理員說那裡早就封起來了，叫我別多問。\n可是我很確定，聲音是從門的「裡面」傳出來的。\n如果有人讀到這本日記，請不要在午夜之後靠近舊校舍。\n我把鑰匙藏在第三間教室的講台下面，\n萬一我回不來，至少有人能打開那扇門。',
    },
    {
      speaker: SPEAKERS.kp,
      text: '【一封沒有寄出的信】\n親愛的阿晴：\n當妳收到這封信的時候，我大概已經離開這座小鎮了。\n那天在燈塔看到的東西，我一直沒有告訴任何人。\n它不是船，也不是浪，它在看著我們。\n請替我照顧好那隻黑貓，牠比我們都更早察覺不對勁。\n不要來找我。\n——永遠的朋友 S.',
    },
  ],
  system: [
    { speaker: null, text: systemStatusMessage('林晴', 'HP', 11, 9) },
    { speaker: null, text: systemStatusMessage('卡洛斯', 'MP', 12, 10) },
    { speaker: null, text: systemStatusMessage('小葵', 'SAN', 64, 60) },
  ],
};

/** 測試訊息的範例數（每種 2～4 則） */
export const exampleCount = (k: TestKind): number => EXAMPLES[k].length;

let seq = 0;

/**
 * 第 n 次送出這種測試訊息（輪流使用範例），time 是這則的時間文字。
 */
export function testMessage(kind: TestKind, n: number, time: string): MockChatMessage {
  const list = EXAMPLES[kind];
  const m = list[((n % list.length) + list.length) % list.length];
  seq++;
  return { ...m, id: `t${seq}`, time };
}

/** 自訂測試訊息 */
export function customMessage(
  speaker: SpeakerId,
  kind: 'chat' | DiceOutcome,
  command: string,
  result: string | null,
  time: string,
): MockChatMessage {
  seq++;
  const base: MockChatMessage = { id: `c${seq}`, speaker: SPEAKERS[speaker], text: command, time };
  if (kind === 'chat') return { ...base, text: [command, result].filter(Boolean).join(' | ') };
  return { ...base, result, outcome: kind };
}

/** 這個分頁下一則訊息的時間（最後一則往後一分鐘） */
export function nextTime(messages: readonly MockChatMessage[]): string {
  return timeAt(messages.length);
}

/** 他人的秘密擲骰在聊天欄的內文（測試用） */
export const SECRET_TEXT = SECRET_DICE_CHAT_TEXT;
