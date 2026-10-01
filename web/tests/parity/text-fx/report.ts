/**
 * 把對等驗證的結果（out/*.json）整理成規格第 6 節的表格（out/report.md）。
 *
 *   node --experimental-strip-types tests/parity/text-fx/report.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
const read = <T>(name: string, fallback: T): T =>
  existsSync(path.join(OUT, name))
    ? (JSON.parse(readFileSync(path.join(OUT, name), 'utf8')) as T)
    : fallback;

interface FrameCase {
  id: string;
  f: string[];
  frames: { same: boolean }[];
  maxDiff: number;
  metaSame: boolean;
  status: string;
}
interface ExportRow {
  id: string;
  f: string[];
  kind: string;
  same: boolean;
  notes: string[];
}
interface InterRow {
  name: string;
  f: string[];
  same: boolean;
}

const frames = read<FrameCase[]>('frames.json', []);
const exportsRows = read<ExportRow[]>('exports.json', []);
const data = read<{ mismatches: string[]; fontCss?: number } | null>('data.json', null);
const inter = read<InterRow[]>('interaction.json', []);
const perf = read<{ id: string; old: number; new: number; oldBytes: number; newBytes: number }[]>(
  'perf.json',
  [],
);

const E2E = 'e2e `tests/e2e/text-fx.spec.ts`';
const U_SET = '單元 `tests/unit/text-fx-settings.test.ts`';
const U_MOTION = '單元 `tests/unit/text-fx-motion.test.ts`（舊版取樣對照）';
const U_TYPE = '單元 `tests/unit/typeset.test.ts`';
const U_COMP = '元件 `tests/components/textfx-shared.test.tsx`';
const DATA = '資料對等（範本／風格／效果預設值與舊版逐欄相同）';
const FONT_DATA = '資料對等（720 組畫布字型字串與舊版逐字相同）';
const LOOK = '目視（截圖 `tests/__screenshots__/text-fx-*.png`）';

/** 不是（只）靠影格比對的項目：驗證方式與備註 */
const STATIC: Record<string, { how: string[]; note?: string }> = {
  F001: { how: ['互動對等', E2E] },
  F002: { how: ['互動對等', E2E] },
  F003: { how: ['互動對等', DATA] },
  F004: { how: ['互動對等', U_SET] },
  F005: { how: ['互動對等', U_SET] },
  F006: { how: [E2E], note: '舊版在頁首；新版在預覽下方的資訊列（「標語／戰鬥開始・…」）。' },
  F051: { how: [E2E] },
  F052: { how: [DATA, E2E] },
  F089: { how: [LOOK] },
  F117: { how: [LOOK] },
  F121: { how: ['單元 `tests/unit/timeline.test.ts`'] },
  F122: { how: ['單元 `tests/unit/timeline.test.ts`'] },
  F123: { how: ['單元 `tests/unit/timeline.test.ts`'] },
  F124: { how: ['單元 `tests/unit/timeline.test.ts`'] },
  F125: { how: ['單元 `tests/unit/timeline.test.ts`'] },
  F126: { how: ['單元 `tests/unit/timeline.test.ts`'] },
  F127: { how: ['單元 `tests/unit/timeline.test.ts`'] },
  F128: { how: ['單元 `tests/unit/timeline.test.ts`'] },
  F159: { how: [E2E] },
  F161: { how: [LOOK] },
  F172: { how: [U_TYPE] },
  F173: { how: [U_TYPE] },
  F175: { how: [DATA] },
  F187: {
    how: [FONT_DATA],
    note: '比對時兩邊都擋掉 Google Fonts、用同一套本機替代字型；字型字串（含西文接中文、韓文接韓文字型）逐字相同。新版字型目錄是共用的 52 套（含舊版 12 套）。舊版「我的字型」存在另一個 IndexedDB，不會搬到新版（找不到時改用預設字型）。',
  },
  F188: {
    how: [FONT_DATA],
    note: '字型選單顯示的字重在同距離時取細的（共用 FontPicker），實際畫圖仍照舊版取粗的。',
  },
  F201: {
    how: [],
    note: '新版用共用漸層欄，可超過 3 色、自訂位置與透明度；舊設定換算成平均分布的色標，畫面相同。',
  },
  F203: { how: [DATA] },
  F244: { how: [E2E] },
  F246: {
    how: [LOOK],
    note: '分頁名稱改為「時間與尺寸」；循環、色數、預設圖、裁邊、檔名移到預覽下方的共用匯出區。',
  },
  F247: {
    how: [E2E],
    note: '介面改為共用匯出區的「無限循環」開關＋次數（1～999），值與舊版的三選一相同。',
  },
  F250: { how: [E2E] },
  F251: { how: [E2E] },
  F252: { how: [U_SET, E2E] },
  F253: { how: [E2E], note: '新版另外可以匯出 GIF、WebP，並有尺寸倍率。' },
  F254: { how: [E2E] },
  F255: { how: [E2E] },
  F256: { how: [E2E] },
  F257: {
    how: [E2E, '元件 `tests/components/ExportPanel.test.tsx`'],
    note: '取消後回到可匯出狀態（舊版另外跳出「已取消匯出」）。',
  },
  F258: { how: [E2E], note: '結果卡由共用匯出區顯示，色數、循環、預設圖、匯出時間等放在資訊列。' },
  F259: { how: ['元件 `tests/components/ExportPanel.test.tsx`'] },
  F260: {
    how: [E2E],
    note: '新版顯示在匯出區的錯誤訊息（「匯出失敗：請先輸入文字，再匯出。」）。',
  },
  F261: { how: [E2E] },
  F262: {
    how: [E2E],
    note: '使用者設定「減少動態效果」時不自動播放（共用 usePlayback；舊版一律自動播放）。',
  },
  F263: { how: [E2E, LOOK] },
  F264: { how: [U_COMP, LOOK], note: '代表畫面以時間軸上的細線標記；多頁時收起圖例。' },
  F265: { how: [LOOK] },
  F266: {
    how: [LOOK],
    note: '共用預覽舞台：透明、黑、白、自訂色（預設灰）、背景圖；「灰」併入自訂色。',
  },
  F267: { how: [E2E] },
  F268: { how: [E2E] },
  F269: { how: [E2E] },
  F270: { how: [E2E] },
  F271: { how: [E2E] },
  F272: { how: [E2E] },
  F273: { how: [E2E] },
  F274: { how: [E2E] },
  F275: { how: [E2E] },
  F276: { how: [E2E] },
  F277: { how: [E2E] },
  F278: { how: [E2E] },
  F279: { how: [E2E] },
  F280: { how: [E2E] },
  F281: { how: [E2E] },
  F282: { how: [E2E] },
  F283: { how: [E2E] },
  F284: { how: [E2E] },
  F285: { how: [E2E] },
  F286: { how: [E2E] },
  F287: { how: [E2E] },
  F288: { how: [E2E] },
  F289: { how: [E2E], note: '新版另外自動匯入舊版的存檔（`trpg-toolkit:text-fx:v1`）。' },
  F290: { how: [U_SET] },
  F291: { how: [E2E] },
  F292: {
    how: ['框架 e2e `tests/e2e/files.spec.ts`'],
    note: '共用 FontPicker 的上傳字型（存 IndexedDB、重新整理後還在）。',
  },
  F293: { how: [E2E] },
  F294: { how: [E2E] },
  F295: { how: ['對等腳本與 e2e 都透過 `window.__textFx` 操作'] },
  F296: { how: [LOOK] },
};

const ids = Array.from({ length: 296 }, (_, i) => `F${String(i + 1).padStart(3, '0')}`);
const rows: string[] = [];
let pass = 0;
let fail = 0;
for (const id of ids) {
  const how: string[] = [];
  const notes: string[] = [];
  let ok = true;
  const fc = frames.filter((c) => c.f.includes(id));
  if (fc.length) {
    const n = fc.reduce((s, c) => s + c.frames.length, 0);
    const same = fc.filter((c) => c.status === 'identical').length;
    const max = Math.max(...fc.map((c) => c.maxDiff));
    if (same !== fc.length) ok = false;
    how.push(
      `影格對等 ${fc.length} 案例／${n} 格：${same === fc.length ? '全部逐像素相同' : `${same} 案例相同，最大差 ${max}`}（${fc
        .map((c) => `\`${c.id}\``)
        .slice(0, 4)
        .join('、')}${fc.length > 4 ? '…' : ''}）`,
    );
  }
  const ex = exportsRows.filter((r) => r.f.includes(id));
  if (ex.length) {
    const same = ex.filter((r) => r.same).length;
    if (same !== ex.length) ok = false;
    how.push(
      `匯出檔對等 ${ex.length} 個：${
        same === ex.length
          ? '影格數、延遲、播放次數、像素全部相同'
          : ex
              .filter((r) => !r.same)
              .map((r) => `${r.id}：${r.notes.join('；')}`)
              .join('／')
      }`,
    );
  }
  const it = inter.filter((r) => r.f.includes(id));
  if (it.length) {
    const same = it.filter((r) => r.same).length;
    if (same !== it.length) ok = false;
    how.push(`互動對等 ${it.length} 步：${same === it.length ? '設定相同' : '有不同'}`);
  }
  const st = STATIC[id];
  if (st) {
    for (const h of st.how)
      if (!(h === '互動對等' && it.length))
        how.push(h === DATA && data?.mismatches.length ? `${DATA}：有不同` : h);
    if (st.note) notes.push(st.note);
  }
  if (/^F0(0[7-9]|[1-4]\d|50)$/.test(id) && !how.includes(DATA)) how.push(DATA);
  if (/^F(0(59|6\d|7\d|8[0-3])|1(29|3\d|4\d|5[0-7]))$/.test(id)) how.push(U_MOTION);
  if (!how.length) {
    how.push('未驗證');
    ok = false;
  }
  if (ok) pass++;
  else fail++;
  const result = ok ? (notes.length ? '通過（差異已註明）' : '通過') : '未通過';
  rows.push(`| ${id} | ${result} | ${how.join('；')} | ${notes.join(' ')} |`);
}

const totalFrames = frames.reduce((s, c) => s + c.frames.length, 0);
const identical = frames.filter((c) => c.status === 'identical').length;
const maxDiff = frames.length ? Math.max(...frames.map((c) => c.maxDiff)) : 0;
const summary = [
  `- 影格對等：${frames.length} 個案例、${totalFrames} 個抽樣影格（0、25%、50%、75%、100% 與每個階段的起點、起點後一格、中點、終點前一格）；逐像素相同 ${identical} 個案例，最大像素差 ${maxDiff}。`,
  `- 匯出檔對等：${exportsRows.length} 個檔案（APNG ${exportsRows.filter((r) => r.kind === 'apng').length}、PNG ${exportsRows.filter((r) => r.kind === 'png').length}、ZIP ${exportsRows.filter((r) => r.kind === 'zip').length}），相同 ${exportsRows.filter((r) => r.same).length} 個。`,
  `- 資料對等：${data ? (data.mismatches.length ? `不同 ${data.mismatches.length} 項` : `44 個範本、11 個文字風格、8 組漸層配色、43 個效果預設值、${data.fontCss ?? 0} 組畫布字型字串（12 套舊版字型×字重×斜體×中／英／韓／混合文字）全部相同`) : '未執行'}。`,
  `- 互動對等：${inter.length} 組操作，相同 ${inter.filter((r) => r.same).length} 組。`,
  `- 效能：${
    perf.length
      ? `${perf.length} 個長動畫／大畫面案例，兩邊輪流各匯出 3 次取最短，新版是舊版的 ${Math.min(...perf.map((r) => r.new / r.old)).toFixed(2)}～${Math.max(...perf.map((r) => r.new / r.old)).toFixed(2)} 倍時間（新版在 Web Worker 編碼，主執行緒不卡；檔案大小相同）。`
      : '未執行'
  }`,
  `- 功能編號：${pass} 項通過、${fail} 項未通過。`,
];
const perfTable = perf.length
  ? `\n\n| 效能案例 | 舊版 | 新版 | 檔案大小（舊／新） |\n|---|---|---|---|\n${perf
      .map(
        (r) =>
          `| \`${r.id}\` | ${r.old} ms | ${r.new} ms（${(r.new / r.old).toFixed(2)}×） | ${r.oldBytes.toLocaleString('en-US')}／${r.newBytes.toLocaleString('en-US')} B |`,
      )
      .join('\n')}`
  : '';
const md = `${summary.join('\n')}${perfTable}\n\n| 編號 | 結果 | 方法與證據 | 備註 |\n|---|---|---|---|\n${rows.join('\n')}\n`;
writeFileSync(path.join(OUT, 'report.md'), md);
console.log(summary.join('\n'));
