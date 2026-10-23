/**
 * 範例（規格 3.7）：CoC 風格的書房，8 個熱點——五個一開始就看得到、一個要先找到書架才出現（書桌抽屜）、
 * 一個要先找到掛畫和書桌抽屜才出現（牆後保險箱）、一個隱藏熱點（地毯下的暗格）。文字是本站自己寫的原創內容。
 * 熱點的位置來自 scenes.ts 的 STUDY_SPOTS（和畫面同一份座標）。
 */
import { type ClueMapState, DEFAULT_LOOK, newSpot, round2, type Spot } from './model';
import { STUDY_SPOTS } from './scenes';

/** px → %（書房是 1200 × 800） */
const pct = (r: { x: number; y: number; w: number; h: number }) => ({
  x: round2((r.x / 1200) * 100),
  y: round2((r.y / 800) * 100),
  w: round2((r.w / 1200) * 100),
  h: round2((r.h / 800) * 100),
});

/** 範例熱點的代號（固定，測試和出現條件用） */
export const SAMPLE_IDS = {
  desk: 'hdesk01',
  shelf: 'hshelf1',
  fireplace: 'hfire01',
  window: 'hwindow',
  painting: 'hpaint1',
  drawer: 'hdrawer',
  safe: 'hsafe01',
  hatch: 'hhatch1',
} as const;

export function sampleState(): ClueMapState {
  const spots: Spot[] = [
    newSpot(SAMPLE_IDS.desk, 'rect', pct(STUDY_SPOTS.desk), '書桌', {
      text: '桌上攤著一本皮面日記，筆還擱在墨水瓶旁，最後一頁的墨跡沒有乾透。\n\n日記的最後一頁被整張撕掉了，只剩下殘缺的紙邊，上面壓著幾道用力過度的筆痕。',
      check: '偵查 40%',
      memo: '筆痕可以用鉛筆斜拓出來：「他們不會讓我活到天亮」。失敗的話，改由 NPC 管家提到這件事。',
    }),
    newSpot(SAMPLE_IDS.shelf, 'rect', pct(STUDY_SPOTS.shelf), '書架', {
      text: '書依字母排得整整齊齊，唯獨一本《倫敦的霧》被倒著插了回去。\n\n抽出來一翻，書頁之間夾著一把小小的黃銅鑰匙。',
      check: '圖書館使用 50%',
      memo: '鑰匙可以打開書桌抽屜。就算檢定失敗，也讓有興趣翻書的 PC 找到。',
    }),
    newSpot(SAMPLE_IDS.fireplace, 'rect', pct(STUDY_SPOTS.fireplace), '壁爐', {
      text: '爐裡的灰燼還是溫的。撥開上層的灰，底下有一小片沒燒完的紙，上面只剩幾個字：\n\n「十一點，地窖」',
      check: '靈感 30%',
      memo: '地窖是下一幕的場景。',
    }),
    newSpot(SAMPLE_IDS.window, 'rect', pct(STUDY_SPOTS.window), '窗戶', {
      text: '窗外下著雨。窗閂從裡面扣得好好的，窗台上積著一層薄灰，沒有任何腳印或擦痕。\n\n沒有人從這扇窗離開過。',
      check: '偵查 30%',
      memo: '排除外人從窗戶進出的可能，把嫌疑留在屋子裡的人身上。',
    }),
    newSpot(SAMPLE_IDS.painting, 'rect', pct(STUDY_SPOTS.painting), '掛畫', {
      text: '畫中人的眼睛被什麼尖銳的東西劃掉了，畫框也有點歪。\n\n扶正畫框時，你摸到牆上有一塊不自然的凹陷，像是藏了什麼東西。',
      memo: '要打開牆後的保險箱，還需要先找到書桌抽屜裡的東西。',
    }),
    newSpot(SAMPLE_IDS.drawer, 'rect', pct(STUDY_SPOTS.drawer), '書桌抽屜', {
      text: '小鑰匙剛好插進鎖孔。抽屜裡有一張泛黃的合照，和一張典當單。\n\n合照裡的兩個人，其中一個正是畫中人。典當單上的日期是三天前。',
      check: '鎖匠 30%（有鑰匙就不用檢定）',
      memo: '典當單上有當鋪的地址，可以當作下一個調查地點。',
      locked: true,
      requires: [SAMPLE_IDS.shelf],
      mode: 'all',
    }),
    newSpot(SAMPLE_IDS.safe, 'rect', pct(STUDY_SPOTS.safe), '牆後保險箱', {
      text: '保險箱的密碼是合照背面寫的日期。門一開，裡面只有一封寫到一半的信：\n\n「如果你讀到這封信，代表我已經不在了。別相信管家。」',
      check: '圖書館使用 50%（認出信紙的來歷）',
      memo: '這是這一幕的關鍵線索。給 PL 看信的圖片也可以。',
      locked: true,
      requires: [SAMPLE_IDS.painting, SAMPLE_IDS.drawer],
      mode: 'all',
    }),
    newSpot(SAMPLE_IDS.hatch, 'ellipse', pct(STUDY_SPOTS.hatch), '地毯下的暗格', {
      text: '地毯的一角有被掀起過的痕跡。翻開來，下面的地板被人撬動過，鬆鬆地蓋著。\n\n暗格裡有一只生鏽的鐵盒，盒蓋上刻著三個字母。',
      check: '聆聽 35%',
      memo: '隱藏熱點：不要提示地毯。想到要掀地毯的 PL 才找得到。鐵盒的內容留給你決定。',
      hidden: true,
    }),
  ];
  return {
    title: '舊書房的調查',
    intro:
      '雨夜裡，你們被請到這間書房。屋主昨晚離奇失蹤，書房的門卻是從裡面鎖上的。\n點一點房間裡可疑的地方，找出他留下的線索。',
    scene: { kind: 'builtin', id: 'study' },
    spots,
    look: { ...DEFAULT_LOOK },
  };
}
