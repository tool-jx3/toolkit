/**
 * 純文字與 Markdown 的輸出（規格 3.3、3.4）。輸入是 model.ts 的表的模型。
 */
import { hasNotes, type TableModel } from './model';
import { OUT } from './strings';

export interface TextOptions {
  /** 包含注記（預設 true） */
  notes?: boolean;
  /** 包含圖例（預設 true） */
  legend?: boolean;
}

/**
 * 純文字：
 * ```
 * 【標題】
 * KP：…
 * 規則系統：…
 *
 * ■ 區塊
 * ◆ 分類
 * ・規則：設定
 * 　└ 注記第一行
 * 　　注記第二行
 *
 * ■ 其他備註
 * …
 *
 * ○ 採用　× 不採用　※ 有修改（見注記）
 * ```
 * 連續三個以上的換行縮成兩個、去頭尾空白，最後補一個換行。
 */
export function toText(model: TableModel, opts: TextOptions = {}): string {
  const out: string[] = [`【${model.title}】`];
  for (const [label, value] of model.meta) out.push(`${label}：${value}`);
  for (const sec of model.sections) {
    out.push('', `■ ${sec.title}`);
    for (const cat of sec.cats) {
      out.push(`◆ ${cat.title}`);
      for (const row of cat.rows) {
        out.push(`・${row.name}：${row.value}`);
        if (opts.notes !== false && row.note)
          row.note.split('\n').forEach((line, i) => {
            out.push(`${i ? '　　' : '　└ '}${line}`);
          });
      }
    }
  }
  if (model.remarks) out.push('', `■ ${OUT.remarks}`, ...model.remarks.split('\n'));
  if (opts.legend !== false) out.push('', OUT.legend);
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

/** Markdown 一般文字的跳脫（標題、表頭資訊、備註） */
export const mdLine = (text: string) => String(text ?? '').replace(/([\\`*_#[\]<>|])/g, '\\$1');

/** Markdown 表格的一格：跳脫後換行改成 <br> */
export const mdCell = (text: string) => mdLine(text).replace(/\r?\n/g, '<br>');

/**
 * Markdown：標題（#）→ 表頭資訊（**標籤**：內容，行尾兩個空白換行）→ 每個區塊（##）、分類（###）一張表
 * （規則｜設定（置中）｜注記；整張表沒有任何注記或不包含注記時沒有注記欄）→ 其他備註（##）→ 圖例（> 引用）。
 */
export function toMarkdown(model: TableModel, opts: TextOptions = {}): string {
  const out: string[] = [`# ${mdLine(model.title)}`];
  if (model.meta.length)
    out.push(
      '',
      model.meta.map(([label, value]) => `**${mdLine(label)}**：${mdLine(value)}`).join('  \n'),
    );
  const withNotes = opts.notes !== false && hasNotes(model);
  const { rule, value, note } = OUT.cols;
  for (const sec of model.sections) {
    out.push('', `## ${mdLine(sec.title)}`);
    for (const cat of sec.cats) {
      out.push('', `### ${mdLine(cat.title)}`, '');
      out.push(withNotes ? `| ${rule} | ${value} | ${note} |` : `| ${rule} | ${value} |`);
      out.push(withNotes ? '| --- | :---: | --- |' : '| --- | :---: |');
      for (const row of cat.rows) {
        const cells = [mdCell(row.name), mdCell(row.value)];
        if (withNotes) cells.push(mdCell(row.note));
        out.push(`| ${cells.join(' | ')} |`);
      }
    }
  }
  if (model.remarks)
    out.push(
      '',
      `## ${mdLine(OUT.remarks)}`,
      '',
      model.remarks.split('\n').map(mdLine).join('  \n'),
    );
  if (opts.legend !== false) out.push('', `> ${OUT.legend}`);
  return `${out.join('\n')}\n`;
}
