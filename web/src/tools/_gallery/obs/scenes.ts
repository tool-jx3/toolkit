/**
 * 元件展示頁「OBS 疊加」分頁的模擬場景與範例資料（範例文字都是本專案自己寫的）。
 */
import {
  createCharacterScene,
  createChatScene,
  createRoomScene,
  createStreamkitScene,
  type MockChatMessage,
  type MockRoomMessage,
  mockAvatar,
  mockPortrait,
} from '@/ccfolia/mock';

export type DemoSceneKind = 'character' | 'room' | 'chat' | 'streamkit';

export const SCENE_SIZES: Record<DemoSceneKind, { width: number; height: number }> = {
  character: { width: 340, height: 180 },
  room: { width: 1280, height: 720 },
  chat: { width: 480, height: 460 },
  streamkit: { width: 1920, height: 1080 },
};

export const characterScene = createCharacterScene({
  statuses: [
    { label: 'HP', value: 10, max: 12 },
    { label: 'MP', value: 8, max: 14 },
    { label: 'SAN', value: 48, max: 60 },
  ],
  initiative: 12,
});

/* ---- 訊息框 ---- */

export const ROOM_SPEAKERS = [
  { value: 'erin', label: '艾琳', portrait: mockPortrait('full', 0) },
  { value: 'kai', label: '凱', portrait: mockPortrait('half', 1) },
  { value: 'gm', label: '主持人', portrait: null, description: '沒有立繪' },
] as const;

export const ROOM_EXAMPLES: MockRoomMessage[] = [
  { name: '艾琳', text: '門後好像有聲音……我先貼著門聽聽看。', portrait: ROOM_SPEAKERS[0].portrait },
  {
    name: '凱',
    text: '聆聽',
    portrait: ROOM_SPEAKERS[1].portrait,
    result: '(1D100<=60) ＞ 23 ＞ 成功',
    dice: [
      { faces: 10, value: 20 },
      { faces: 10, value: 3 },
    ],
  },
  {
    name: '主持人',
    text: '你們聽見遠處傳來鐘聲。一下、兩下、三下。\n然後，四周又安靜了下來，只剩下雨打在窗上的聲音。',
  },
];

export const roomScene = createRoomScene();

/* ---- 聊天視窗 ---- */

const erin = { name: '艾琳', color: '#ff9f6b', avatar: mockAvatar(0) };
const kai = { name: '凱', color: '#7fb6ff', avatar: mockAvatar(1) };
const gm = { name: '主持人', color: '#d9d9d9', avatar: mockAvatar(7) };

export const CHAT_MAIN: MockChatMessage[] = [
  { id: 'm1', speaker: gm, text: '雨夜，你們來到山腳下的旅館。' },
  { id: 'm2', speaker: erin, text: '先跟老闆打聽一下最近的怪事。' },
  { id: 'm3', speaker: kai, text: '說服', result: '(1D100<=55) ＞ 72 ＞ 失敗' },
  { id: 'm4', speaker: null, text: '[ 凱 ] SAN : 52 → 50' },
  { id: 'm5', speaker: erin, text: '2D6', result: '(2D6) ＞ 9[4,5] ＞ 9' },
  { id: 'm6', speaker: gm, text: '', secretOther: true },
  { id: 'm7', speaker: kai, text: '偵查', result: '(1D100<=70) ＞ 5 ＞ 決定的成功/スペシャル' },
];

export const CHAT_SECRET: MockChatMessage[] = [
  { id: 's1', speaker: gm, text: '（只有你看得到）床底下有一封信。' },
  { id: 's2', speaker: erin, text: '悄悄收起來。', own: true },
];

export const chatScene = createChatScene({
  tabs: [
    { name: 'メイン', messages: CHAT_MAIN },
    {
      name: '密談',
      secret: true,
      participants: [
        { name: '主持人', avatar: mockAvatar(7) },
        { name: 'Erin', avatar: null },
      ],
      messages: CHAT_SECRET,
    },
  ],
});

let chatSeq = 0;
/** 依序產生測試訊息（展示用） */
export function nextChatMessage(
  kind: 'chat' | 'success' | 'failure' | 'other' | 'system',
): MockChatMessage {
  chatSeq++;
  const id = `t${chatSeq}`;
  switch (kind) {
    case 'success':
      return { id, speaker: kai, text: '閃避', result: '(1D100<=40) ＞ 12 ＞ 成功' };
    case 'failure':
      return { id, speaker: erin, text: '圖書館', result: '(1D100<=65) ＞ 98 ＞ 致命的失敗' };
    case 'other':
      return { id, speaker: gm, text: '1D6', result: '(1D6) ＞ 4' };
    case 'system':
      return {
        id,
        speaker: null,
        text: `[ 艾琳 ] HP : ${12 - (chatSeq % 5)} → ${11 - (chatSeq % 5)}`,
      };
    default:
      return { id, speaker: erin, text: `測試訊息 ${chatSeq}：外面的雨好像停了。` };
  }
}

/* ---- Discord Streamkit ---- */

export const STREAMKIT_USERS = [
  { id: '123456789012345678', name: '艾琳' },
  { id: '223456789012345678', name: '凱' },
  { id: '323456789012345678', name: '沒設頭像的人', customAvatar: false },
];

export const streamkitScene = createStreamkitScene({ users: STREAMKIT_USERS });

export const TACHIE = mockPortrait('full', 2);
