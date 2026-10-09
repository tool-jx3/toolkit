/**
 * 填字遊戲產生器：產生與原作（sotsotssi/text2crossword，commit 1031c06，MIT）對照的資料（規格 3.2～3.6）。
 *
 * 用 Node 的 vm 載入原作的 script.js（不需要瀏覽器；頁面的初始化不會執行），Math.random 換成固定種子的亂數，
 * 對幾段自己寫的文字（韓文日誌、英文、HTML 日誌、JSON、混合）在不同的設定下呼叫原作的
 * extractWords → getWeightedPool → generateCrosswordGrid，記下候選單字、候選池與盤面。
 * 結果寫到 tests/unit/fixtures/crossword-upstream.json；單元測試（tests/unit/crossword-parity.test.ts）
 * 用同樣的文字、同樣的亂數跑新版，逐項比對。
 *
 * 執行（web/ 底下）：node tests/parity/crossword/upstream.mjs
 * 原作的位置：CW_UPSTREAM（預設 /home/user/upstream/sotsotssi_text2crossword）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const UPSTREAM = process.env.CW_UPSTREAM ?? '/home/user/upstream/sotsotssi_text2crossword';
const FIXTURE = new URL('../../unit/fixtures/crossword-upstream.json', import.meta.url);

/** mulberry32（單元測試用同一個） */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const source = readFileSync(`${UPSTREAM}/script.js`, 'utf8');
const context = vm.createContext({
  document: { readyState: 'loading', addEventListener() {} },
  console,
});
/* 擺放順序要拿得到：盤面的回傳值多帶 placedWords（只加這一項，其他照原作） */
const RETURN = 'return { matrix, across, down, width, height };';
if (!source.includes(RETURN)) throw new Error('原作的 generateCrosswordGrid 回傳值和預期不同');
vm.runInContext(
  `${source.replace(RETURN, 'return { matrix, across, down, width, height, placedWords: bestGrid.placedWords };')}
;globalThis.__cw = { state, extractWords, getWeightedPool, generateCrosswordGrid, maskHint };`,
  context,
);
const cw = context.__cw;

const KO_LOG = `[메인] KP: 조사자들은 오래된 저택의 정문 앞에 도착했습니다.
[메인] KP: 저택의 창문은 모두 깨져 있고, 정원에는 잡초가 무성합니다.
민수: 문이 잠겨 있나요? 열쇠를 찾아볼게요.
(OOC: 잠깐 화장실 다녀올게요)
KP: 민수는 우편함 안에서 녹슨 열쇠를 발견합니다.
지은: 저택 안으로 들어가서 서재를 조사하고 싶어요.
KP: 서재의 책장에는 낡은 책과 일기장이 가득합니다. 일기장의 마지막 페이지에는 지하실이라는 단어가 적혀 있습니다.
민수: 지하실로 가는 계단을 찾아봅시다!
<시스템> 민수의 이성 판정: 1D100 → 42 성공
KP: 지하실의 문은 무거운 쇠사슬로 묶여 있습니다. 쇠사슬에는 오래된 자물쇠가 달려 있습니다.
지은: 열쇠로 자물쇠를 열어볼게요.
KP: 열쇠가 자물쇠에 딱 맞습니다. 문이 천천히 열리고, 차가운 바람이 계단 아래에서 불어옵니다.
KP: 계단 아래에는 촛불이 켜진 제단이 있습니다. 제단 위에는 검은 표지의 책이 놓여 있습니다.
지은: 그 책을 읽어도 될까요...?
KP: 책을 펼치자 이해할 수 없는 문자가 페이지 위에서 꿈틀거립니다. 이성 판정을 해 주세요.
(《네크로노미콘》. 이라는 제목이 보인다)
민수: 촛불을 끄고 저택에서 도망칩시다!!`;

const EN_STORY = `The investigators arrived at the old mansion on a rainy night.
The mansion had broken windows and an overgrown garden.
Alice found a rusty key inside the mailbox. The key opened the front door!
In the library, they discovered a diary hidden behind dusty books.
The last page of the diary mentioned a secret cellar beneath the kitchen.
Bob: "Let's find the stairs to the cellar."
(OOC: brb, getting snacks)
The cellar door was locked with a heavy chain and an old padlock.
The rusty key fit the padlock perfectly... The door creaked open.
A cold wind blew up from the darkness below. Something was waiting in the cellar.
Alice lit a candle and walked down the stairs [carefully] into the dark.
At the bottom, an altar stood in the middle of the cellar, covered with strange symbols.
Bob read the symbols aloud?! The candle went out.`;

const HTML_LOG = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>ccfolia - logs</title>
<style>
p { margin: 0 } .dice { color: #888888 }
</style>
<script>console.log("<p>not text</p>");</script>
</head>
<body>
<p style="color:#888888;"><span> [main]</span> <span>KP</span> : <span>조사자들은 등대 아래의 작은 마을에 도착했습니다.</span></p>
<p style="color:#e91e63;"><span> [main]</span> <span>하나</span> : <span>등대지기를 만나러 가 볼까요? 등대의 불이 꺼져 있어요.</span></p>
<p style="color:#888888;"><span> [main]</span> <span>KP</span> : <span>등대의 문에는 녹슨 자물쇠가 걸려 있습니다.<br>바닷바람이 차갑게 불어옵니다.</span></p>
<p style="color:#2196f3;"><span> [other]</span> <span>준</span> : <span>(잠깐 자리 비울게요)</span></p>
<p style="color:#2196f3;"><span> [main]</span> <span>준</span> : <span>등대지기의 일지를 찾아봅시다. 일지에는 무엇이 적혀 있을까요?</span></p>
<p style="color:#888888;"><span> [main]</span> <span>KP</span> : <span>일지의 마지막 장에는 "바다에서 노래가 들린다"라고 적혀 있습니다.</span></p>
<p style="color:#888888;"><span> [main]</span> <span>system</span> : <span>[ 하나 ] 이성 : 50 → 45</span></p>
<p style="color:#e91e63;"><span> [main]</span> <span>하나</span> : <span>노래라니... 바다로 가 봐요! 등대의 불을 다시 켜야 해요.</span></p>
</body>
</html>`;

const JSON_DOC = JSON.stringify({
  title: 'Night Train',
  scenes: [
    { text: 'The train left the station at midnight. Nobody remembered buying a ticket.' },
    { text: 'The conductor had no face. Every passenger held a silver ticket.' },
    { text: 'At the next station, the train stopped and the doors opened by themselves.' },
  ],
  npc: ['The conductor smiled without a mouth.', 'A girl asked for the next station?'],
  page: 3,
  notes: { 2: 'Number keys come first in property order.', a: 'The silver ticket is the key.' },
});

const MIXED = `KP: 이번 시나리오의 제목은 Silver Key 입니다. 플레이어는 Silver Key를 찾아야 합니다.
KP: The Silver Key opens the door of dreams. 꿈의 문은 Silver Key로만 열립니다.
(Cthulhu Mythos TRPG 7th edition)
유리: Dream door? 꿈의 문이 어디에 있나요?
KP: 꿈의 문은 도서관 지하에 있습니다. The library closes at midnight.
엔티티: &amp; &lt;script&gt; are not decoded in the original &quot;log&quot;.`;

const TEXTS = { koLog: KO_LOG, enStory: EN_STORY, htmlLog: HTML_LOG, json: JSON_DOC, mixed: MIXED };

const RUNS = [
  ['koLog', 50, 50, 50, 1],
  ['koLog', 10, 100, 0, 2],
  ['koLog', 5, 0, 100, 3],
  ['koLog', 100, 50, 50, 4],
  ['enStory', 50, 50, 50, 5],
  ['enStory', 20, 0, 0, 6],
  ['enStory', 8, 100, 100, 7],
  ['htmlLog', 50, 50, 50, 8],
  ['htmlLog', 12, 80, 20, 9],
  ['json', 50, 50, 50, 10],
  ['json', 6, 30, 70, 11],
  ['mixed', 50, 50, 50, 12],
  ['mixed', 15, 100, 0, 13],
  /* 原作的編號錯誤會出現的種子（規格 5. D5） */
  ['enStory', 50, 50, 50, 101],
  ['enStory', 100, 50, 50, 100],
];

/* 候選單字（依文字；與設定、亂數無關） */
const extracted = Object.fromEntries(
  Object.entries(TEXTS).map(([name, text]) => [
    name,
    cw.extractWords(text).map((w) => [w.answer, w.count, w.sentences]),
  ]),
);

const cases = RUNS.map(([text, target, freq, len, seed]) => {
  cw.state.wordCountTarget = target;
  cw.state.frequencyWeight = freq;
  cw.state.lengthWeight = len;
  const words = cw.extractWords(TEXTS[text]);
  cw.state.extractedWords = words;
  vm.runInContext('Math', context).random = mulberry32(seed);
  const pool = cw.getWeightedPool();
  const grid = cw.generateCrosswordGrid(pool, target);
  /* 原作的編號：同一個號碼是不是用在不同的起點（字串開頭比對的錯誤，規格 5. D5） */
  const starts = new Map();
  let numberingBug = false;
  for (const w of [...grid.across, ...grid.down]) {
    const at = `${w.rx},${w.ry}`;
    if (starts.has(w.num) && starts.get(w.num) !== at) numberingBug = true;
    starts.set(w.num, at);
  }
  const placed = grid.placedWords;
  return {
    text,
    target,
    freq,
    len,
    seed,
    pool: pool.map((w) => w.answer),
    width: grid.width,
    height: grid.height,
    rows: grid.matrix.map((row) => row.map((c) => (c ? c.char : '.')).join('')),
    numbers: grid.matrix.map((row) => row.map((c) => (c?.num ? c.num : 0))),
    /* 依擺放順序 */
    placed: placed.map((w) => ({
      answer: w.answer,
      hint: w.hint,
      x: w.rx,
      y: w.ry,
      dir: w.dir === 0 ? 'across' : 'down',
      num: w.num,
    })),
    numberingBug,
  };
});

/* 提示的遮蔽（題目：○；解答：標出答案） */
const masks = [
  ['조사자들은 오래된 저택의 정문 앞에 도착했습니다.', '저택'],
  ['The key opened the front door! The key fits.', 'key'],
  ['Silver Key and silver key', 'Silver'],
].map(([hint, answer]) => {
  cw.state.showAnswers = false;
  const q = cw.maskHint(hint, answer);
  cw.state.showAnswers = true;
  const a = cw.maskHint(hint, answer);
  return { hint, answer, question: q, answer_: a };
});

writeFileSync(
  FIXTURE,
  `${JSON.stringify({ source: 'sotsotssi/text2crossword@1031c06', texts: TEXTS, extracted, cases, masks })}\n`,
);
console.log(
  `wrote ${cases.length} cases`,
  cases.map(
    (c) =>
      `${c.text}/${c.target}: ${extracted[c.text].length} words, ${c.placed.length} placed${c.numberingBug ? ' (numbering bug)' : ''}`,
  ),
);
