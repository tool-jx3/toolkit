/**
 * 錯誤資訊：出錯時整理成一段文字，使用者按「複製錯誤資訊」（`@/ui` 的 CopyDiagnostics）貼給維護者。
 * 內容是哪一步失敗、瀏覽器回報的錯誤、檔案大小與類型、瀏覽器與裝置（一般網站都讀得到的資訊）；不含圖片內容。
 *
 * ```ts
 * const details = await diagnosticText({
 *   tool: '立繪去背工具',
 *   summary: '無法讀取：IMG_0001.jpg',
 *   items: [{ title: 'IMG_0001.jpg', fields: [['步驟', '解碼'], ['錯誤', errorText(e)]] }],
 * });
 * setNote({ tone: 'danger', text: '無法讀取：IMG_0001.jpg', details });
 * ```
 */
import { formatBytes } from '../files';

export { errorText } from './error';

export type DiagnosticField = readonly [label: string, value: string];

export interface DiagnosticItem {
  /** 例如檔名 */
  title?: string;
  fields: readonly DiagnosticField[];
}

export interface DiagnosticReport {
  /** 工具名稱 */
  tool: string;
  /** 畫面上的訊息 */
  summary: string;
  /** 每個出錯的對象（例如每個讀不進來的檔案）各一段 */
  items?: readonly DiagnosticItem[];
  /** 整體的補充（例如處理方式） */
  fields?: readonly DiagnosticField[];
}

/** 檔案的基本資料：大小與類型（瀏覽器回報的 MIME；沒有時「未提供」） */
export function fileFields(file: Blob): DiagnosticField[] {
  return [
    ['大小', `${formatBytes(file.size)}（${file.size.toLocaleString('en-US')} 位元組）`],
    ['類型', file.type || '未提供'],
  ];
}

interface UaData {
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

/** 瀏覽器與裝置（Chrome 的 User-Agent 不寫手機型號與 Android 版本，另外問 userAgentData） */
export async function environmentFields(): Promise<DiagnosticField[]> {
  const out: DiagnosticField[] = [];
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  out.push(['時間', new Date().toISOString()]);
  if (typeof location !== 'undefined') out.push(['網址', `${location.origin}${location.pathname}`]);
  if (nav) {
    out.push(['瀏覽器', nav.userAgent]);
    const ua = (nav as Navigator & { userAgentData?: UaData }).userAgentData;
    if (ua?.getHighEntropyValues) {
      try {
        const v = await ua.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList']);
        const list = Array.isArray(v.fullVersionList)
          ? (v.fullVersionList as { brand: string; version: string }[])
              .filter((b) => !/not.?a.?brand/i.test(b.brand))
              .map((b) => `${b.brand} ${b.version}`)
              .join('、')
          : '';
        const platform = typeof v.platform === 'string' ? v.platform : '';
        const version = typeof v.platformVersion === 'string' ? v.platformVersion : '';
        if (v.model) out.push(['裝置型號', String(v.model)]);
        if (platform || version) out.push(['系統', `${platform} ${version}`.trim()]);
        if (list) out.push(['瀏覽器版本', list]);
      } catch {
        /* 不提供就算了 */
      }
    }
    const mem = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
    out.push([
      '裝置記憶體',
      typeof mem === 'number' ? `約 ${mem} GB（瀏覽器回報的概數）` : '未提供',
    ]);
    out.push(['CPU 核心', nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : '未提供']);
  }
  if (typeof screen !== 'undefined') {
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    out.push(['螢幕', `${screen.width} × ${screen.height}，縮放 ${dpr}`]);
  }
  return out;
}

const line = ([k, v]: DiagnosticField) => `${k}：${v}`;

/** 整理成要複製的文字（環境資訊在最後） */
export async function diagnosticText(r: DiagnosticReport): Promise<string> {
  const parts = [`【${r.tool}】錯誤資訊`, `訊息：${r.summary}`];
  for (const f of r.fields ?? []) parts.push(line(f));
  for (const it of r.items ?? []) {
    parts.push('', `— ${it.title ?? '詳細'} —`);
    for (const f of it.fields) parts.push(line(f));
  }
  parts.push('', '— 瀏覽器與裝置 —');
  for (const f of await environmentFields()) parts.push(line(f));
  return parts.join('\n');
}
