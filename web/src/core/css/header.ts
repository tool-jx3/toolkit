/**
 * CSS 開頭的說明註解（給把 CSS 貼進 OBS 的人看）：工具名稱、以哪個範本為基礎、瀏覽器來源網址與大小、
 * OBS 版本提醒、用到的電腦字型。使用者輸入的文字一律經過 cssCommentText，不會提早結束註解。
 */
import { cssComment } from './escape';

export interface CssHeaderOptions {
  /** 第一行（例：「狀態條（OBS 瀏覽器來源的自訂 CSS）」） */
  title: string;
  /** 工具名稱（例：「狀態條產生器」）；會寫成「由 TRPG Toolkit「…」製作」 */
  toolName: string;
  /** 最後套用的範本名稱（寫成「以範本「…」為基礎」） */
  template?: string | null;
  /** 瀏覽器來源網址；沒有時用 exampleUrl 並註明是範例 */
  url?: string | null;
  exampleUrl?: string;
  /** 網址那一行後面的補充（例：「不加 /chat」） */
  urlNote?: string;
  /** 瀏覽器來源的寬高 */
  size?: { width: number; height: number; note?: string };
  /** 有用到需要較新 OBS 的功能時：寫明版本與受影響的功能（例：{ version: 31, features: ['危急演出'] }） */
  obs?: { version: number; features?: readonly string[] } | null;
  /** 用到的電腦字型（提醒在跑 OBS 的電腦安裝） */
  localFonts?: readonly string[];
  /** 其他說明（每項一行） */
  notes?: readonly (string | null | false | undefined)[];
}

/** 產生開頭說明註解（多行 /* … *\/）。用 CssSheet 時直接呼叫 sheet.header(options) */
export function cssHeaderComment(o: CssHeaderOptions): string {
  return cssComment(cssHeaderLines(o));
}

/** 開頭說明的每一行（還沒包成註解） */
export function cssHeaderLines(o: CssHeaderOptions): string[] {
  const lines: string[] = [o.title];
  lines.push(
    `由 TRPG Toolkit「${o.toolName}」製作${o.template ? `（以範本「${o.template}」為基礎）` : ''}`,
  );
  lines.push('');
  if (o.url) lines.push(`瀏覽器來源網址：${o.url}${o.urlNote ? `（${o.urlNote}）` : ''}`);
  else if (o.exampleUrl)
    lines.push(
      `瀏覽器來源網址（範例，請換成自己的）：${o.exampleUrl}${o.urlNote ? `（${o.urlNote}）` : ''}`,
    );
  if (o.size)
    lines.push(
      `瀏覽器來源大小：寬 ${Math.round(o.size.width)} × 高 ${Math.round(o.size.height)}${o.size.note ? `（${o.size.note}）` : ''}`,
    );
  lines.push('貼上前先清空 OBS「自訂 CSS」欄原有的內容。');
  if (o.obs)
    lines.push(
      `需要 OBS ${o.obs.version} 以上${o.obs.features?.length ? `：${o.obs.features.join('、')}` : ''}（較舊的 OBS 只有這些效果不會動，其他照常顯示）。`,
    );
  if (o.localFonts?.length)
    lines.push(`電腦字型：${o.localFonts.join('、')}（跑 OBS 的電腦也要安裝同一套字型）`);
  for (const n of o.notes ?? []) if (n) lines.push(n);
  return lines;
}
