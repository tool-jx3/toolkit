/**
 * 開頁的範例（本站自己寫的）：一份答案清單（自己列答案，開頁的模式）與一段跑團日誌（從文字擷取），
 * 以及從答案清單用固定種子排好的盤面（每次開頁都一樣；按「產生」才重新隨機排列）。
 */
import { buildFromEntries, parseList, seededRng } from './generate';
import {
  type CrosswordData,
  DEFAULT_EMPTY_COLOR,
  DEFAULT_TITLE,
  defaultFonts,
  inputKey,
  WEIGHT,
  WORD_COUNT,
} from './model';

export const SAMPLE_TEXT = `[主場景] KP：深夜，調查員們來到海邊的小鎮。鎮上的教堂還亮著燈，神父站在大門前等著你們。
[主場景] 阿哲：神父，聽說鎮上的墓地最近怪事不斷？
[主場景] KP：神父點點頭：「每到午夜，墓地就會傳出敲打石頭的聲音。」
（場外：我去倒杯水，馬上回來）
[主場景] 小雯：我想先去圖書館查一下小鎮的歷史。
[主場景] KP：圖書館的書架上有一本古書，封面畫著奇怪的符號。古書裡夾著一張地下室的地圖。
[主場景] 阿哲：地圖上的地下室在哪裡？
[主場景] KP：就在教堂底下。地圖上還畫著一條從地下室通往海邊的下水道。
[系統] 阿哲的偵查檢定：1D100 → 23 成功
[主場景] KP：阿哲在教堂的書房裡發現一道暗門，暗門後面是往下的樓梯。
[主場景] 小雯：我點起蠟燭，跟著阿哲走進地下室。
[主場景] KP：地下室的牆上刻滿了和古書上相同的符號。牆角的電話忽然響了起來。
[主場景] 阿哲：……要接電話嗎？
[主場景] KP：電話的另一頭只有海浪聲。接著，下水道深處傳來沉重的腳步聲。請兩位進行理智檢定。`;

export const SAMPLE_LIST = `神父：在教堂裡為調查員祈禱，似乎知道些什麼的人。
克蘇魯神話：這類恐怖劇本的題材，源自洛夫克拉夫特的小說。
電話：午夜響起，接起來卻只聽得到海浪聲。
米斯卡塔尼克大學：阿卡姆的名校，圖書館藏著禁忌的書。
大學：教授與學生做研究的地方。
印斯茅斯：海邊的小鎮，居民的長相有些古怪。
大門：老宅正面那扇沉重的門。
暗門：藏在書架後面的入口。
暗室：沒有窗戶、伸手不見五指的房間。
地下室：日記警告「絕對不能打開」的地方。
下水道：城市底下錯綜複雜的通道。
墓地：教堂後方埋葬死者的地方。`;

/** 範例盤面的種子（12 個答案全部排進去、直式 9 × 12 格） */
export const SAMPLE_SEED = 1;

/** 開頁的資料（範例清單與排好的盤面） */
export function initialData(): CrosswordData {
  const entries = parseList(SAMPLE_LIST).entries;
  const built = buildFromEntries(entries, seededRng(SAMPLE_SEED));
  const data: CrosswordData = {
    mode: 'list',
    text: SAMPLE_TEXT,
    fileName: '',
    list: SAMPLE_LIST,
    wordCount: WORD_COUNT.def,
    freqWeight: WEIGHT.def,
    lenWeight: WEIGHT.def,
    title: DEFAULT_TITLE,
    emptyColor: DEFAULT_EMPTY_COLOR,
    emptyTransparent: false,
    fonts: defaultFonts(),
    layout: 'row',
    puzzle: built.puzzle,
    stats: {
      mode: 'list',
      found: built.found,
      target: entries.length,
      unplaced: built.unplaced,
      key: '',
    },
  };
  data.stats = data.stats && { ...data.stats, key: inputKey(data) };
  return data;
}
