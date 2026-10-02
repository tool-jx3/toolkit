/**
 * 劇本文字的分割與標題（規格 3.4；不依賴 React）。劇本文字只存在工具與專案檔裡，不輸出到 ZIP（D14 維持）。
 */
import { NAMES } from './model';

/**
 * 自動標題：第一個非空白行去頭尾空白後，以 `#` 開頭時取其後的文字，否則取前 10 個字（UTF-16 單位）；
 * 整段空白時＝預設名＋序號。
 */
export function storyAutoTitle(text: string, fallbackNo: number): string {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const first = lines.find((l) => l.trim())?.trim() ?? '';
  if (!first) return NAMES.storyNumbered(fallbackNo);
  const m = first.match(/^#\s*(\S.*)$/);
  return m ? m[1].trim() : first.slice(0, 10);
}

/** 一筆模式的標題：標題欄去頭尾空白後非空就用它，否則自動標題 */
export const storySingleTitle = (title: string, text: string, nextNo: number): string =>
  String(title ?? '').trim() || storyAutoTitle(text, nextNo);

/**
 * 依分隔切成段落：「去頭尾空白後等於分隔字串」的行、或（splitBlank 時）空白行是分割點（分割點本身丟掉）；
 * 分隔字串去頭尾空白後為空時不以它分割。
 */
export function splitStory(text: string, splitBlank: boolean, delimiter: string): string[] {
  const delim = String(delimiter ?? '').trim();
  const out: string[] = [];
  let cur: string[] = [];
  for (const line of String(text ?? '').split('\n')) {
    if ((delim && line.trim() === delim) || (splitBlank && !line.trim())) {
      if (cur.length) {
        out.push(cur.join('\n'));
        cur = [];
      }
    } else cur.push(line);
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

export interface StoryEntry {
  title: string;
  body: string;
}

/**
 * 批次登錄（3.4）：先把 `\r\n` 換成 `\n` 再分割；每段第一個非空白行若是「# 標題」（`#` 前後可有空白）就當標題並從正文移除，
 * 否則標題自動產生；去掉後正文全空白的段不登錄。
 */
export function storyBulkEntries(
  text: string,
  splitBlank: boolean,
  delimiter: string,
): StoryEntry[] {
  return splitStory(String(text ?? '').replace(/\r\n?/g, '\n'), splitBlank, delimiter)
    .filter((t) => t.trim())
    .map((t, index): StoryEntry | null => {
      const lines = t.split('\n');
      const first = lines.findIndex((l) => l.trim());
      if (first < 0) return null;
      const m = lines[first].match(/^\s*#\s*(\S.*)$/);
      if (m) {
        lines.splice(first, 1);
        return { title: m[1].trim(), body: lines.join('\n') };
      }
      return { title: storyAutoTitle(t, index + 1), body: t };
    })
    .filter((x): x is StoryEntry => !!x && x.body.trim() !== '');
}
