/**
 * 預覽用的範例角色與範例訊息（名稱、台詞、擲骰都是本專案自己寫的）。
 * 純資料＋純函式：立繪網址由呼叫端依「範例立繪形狀／自訂立繪」決定。
 */
import { firstResultNumber } from '@/ccfolia';
import type { MockDie, MockRoomMessage } from '@/ccfolia/mock/room';

export interface SampleSpeaker {
  id: string;
  name: string;
  /** 範例立繪的配色序號；null＝沒有立繪（例如主持人） */
  seed: number | null;
}

export const SPEAKERS: readonly SampleSpeaker[] = [
  { id: 'surui', name: '蘇芮', seed: 0 },
  { id: 'ivan', name: '伊凡', seed: 1 },
  { id: 'chen', name: '陳警官', seed: 4 },
  { id: 'kp', name: '主持人', seed: null },
];

export const speakerById = (id: string): SampleSpeaker =>
  SPEAKERS.find((s) => s.id === id) ?? SPEAKERS[0];
export const speakerByName = (name: string): SampleSpeaker | undefined =>
  SPEAKERS.find((s) => s.name === name);

export type SampleKind = 'chat' | 'success' | 'failure' | 'other' | 'secret' | 'long';

export const SAMPLE_KINDS: readonly SampleKind[] = [
  'chat',
  'success',
  'failure',
  'other',
  'secret',
  'long',
];

/** 一則範例：發言者、內文、擲骰結果全文、骰子圖 */
export interface Sample {
  speaker: string;
  text: string;
  result?: string;
  dice?: readonly MockDie[];
  secret?: boolean;
}

/** 1D100 的骰子圖：十位與個位兩顆十面骰（100 時兩顆都是 0） */
export function d100Dice(value: number): MockDie[] {
  const v = Math.max(1, Math.min(100, Math.round(value)));
  const tens = Math.floor((v % 100) / 10) * 10;
  return [
    { faces: 10, value: tens },
    { faces: 10, value: v % 10 },
  ];
}

export const SAMPLES: Readonly<Record<SampleKind, readonly Sample[]>> = {
  chat: [
    { speaker: 'surui', text: '這間圖書館的地下室，平常是不對外開放的吧？' },
    { speaker: 'ivan', text: '我在樓梯口把風。有人下來的話，我就咳兩聲。' },
    { speaker: 'chen', text: '別碰那本書。上一個翻開它的人，到現在還住在療養院裡。' },
  ],
  success: [
    {
      speaker: 'ivan',
      text: 'CC<=65 【聆聽】',
      result: '(1D100<=65) ＞ 18 ＞ 成功',
      dice: d100Dice(18),
    },
    {
      speaker: 'surui',
      text: 'CC<=80 【圖書館】',
      result: '(1D100<=80) ＞ 9 ＞ 極限成功',
      dice: d100Dice(9),
    },
  ],
  failure: [
    {
      speaker: 'chen',
      text: 'CC<=45 【說服】',
      result: '(1D100<=45) ＞ 77 ＞ 失敗',
      dice: d100Dice(77),
    },
    {
      speaker: 'ivan',
      text: 'CC<=50 【閃避】',
      result: '(1D100<=50) ＞ 99 ＞ 大失敗',
      dice: d100Dice(99),
    },
  ],
  other: [
    {
      speaker: 'surui',
      text: '2D6 【逃跑距離】',
      result: '(2D6) ＞ 9[4,5] ＞ 9',
      dice: [
        { faces: 6, value: 4 },
        { faces: 6, value: 5 },
      ],
    },
    {
      speaker: 'chen',
      text: '1D3+1 【拳擊傷害】',
      result: '(1D3+1) ＞ 2[2]+1 ＞ 3',
      dice: [{ faces: 3, value: 2 }],
    },
  ],
  secret: [
    { speaker: 'kp', text: 'SCC<=60 【心理學】', secret: true },
    { speaker: 'surui', text: 'SCC<=55 【靈感】', secret: true },
  ],
  long: [
    {
      speaker: 'kp',
      text:
        '地下室的燈閃了兩下，終於亮起。眼前是一排又一排的鐵書架，書脊上的燙金字早就磨得看不清楚。' +
        '最裡面的桌上攤著一本還沒闔上的筆記本，墨水看起來還是濕的。\n' +
        '就在這時，你們聽見頭頂的木板「嘎」地響了一聲。',
    },
    {
      speaker: 'kp',
      text:
        '雨下了一整夜。天亮的時候，旅館老闆在櫃台上留了一張字條，上面只寫著一行字：' +
        '「不要在日落之後走進東邊的樹林。」\n' +
        '字跡歪歪斜斜，像是用左手寫的。窗外，樹林的方向升起一縷灰色的煙。',
    },
  ],
};

/** 開頁時自動送出的第一則（有立繪的角色、聊天） */
export const FIRST_SAMPLE: Sample = SAMPLES.chat[0];

/** 依序輪流：第 n 次按某一類的按鈕送出哪一則 */
export const sampleAt = (kind: SampleKind, n: number): Sample => {
  const list = SAMPLES[kind];
  return list[((n % list.length) + list.length) % list.length];
};

/**
 * 範例 → 模擬頁的訊息。portraitOf(speaker) 回傳立繪網址（沒有立繪的角色不呼叫）。
 */
export function toRoomMessage(
  sample: Sample,
  portraitOf: (speaker: SampleSpeaker) => string,
): MockRoomMessage {
  const sp = speakerById(sample.speaker);
  return {
    name: sp.name,
    text: sample.text,
    portrait: sp.seed === null ? null : portraitOf(sp),
    result: sample.secret ? null : (sample.result ?? null),
    dice: sample.secret ? [] : (sample.dice ?? []),
    secret: !!sample.secret,
  };
}

/**
 * 自訂訊息（F61）→ 範例格式：骰子時骰子圖是一次 1D100（出目取結果中第一個「＞ 數字」，沒有時 50）。
 */
export function customSample(
  speaker: string,
  kind: 'chat' | 'dice',
  command: string,
  result: string | null,
): Sample {
  if (kind === 'dice' && result)
    return { speaker, text: command, result, dice: d100Dice(firstResultNumber(result, 50)) };
  return { speaker, text: result ? `${command}|${result}` : command };
}
