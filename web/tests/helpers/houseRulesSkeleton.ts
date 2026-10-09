/**
 * CoC 房規表產生器的對照用「骨架」：把純文字／Markdown 輸出的每一行換成結構記號，
 * 原作（日文）與新版（繁中）的規則名稱、選項文字不同，但結構、符號值（○ × ※ —）、選項裡的數字、
 * 使用者自己打的注記與備註應該一樣。
 *
 * 原作的輸出是在本機開原作頁面（scratchpad 的對照腳本）產生後轉成骨架存進
 * tests/unit/fixtures/house-rules-upstream.json；fixture 只有骨架與輸入的狀態（規則與選項的 id、
 * 對照用自己寫的注記），沒有原作的文字。
 */

const SYMBOLS = ['○', '×', '※', '—'];

/** 設定值的記號：符號照寫；有數字的選項記數字；其他文字記 opt */
export function valueKey(value: string): string {
  const v = value.trim();
  if (SYMBOLS.includes(v)) return v;
  const digits = v.normalize('NFKC').match(/\d+/g);
  return digits ? `opt#${digits.join(',')}` : 'opt';
}

/** 純文字輸出的骨架（表頭資訊在第一個空行之前） */
export function textSkeleton(text: string): string[] {
  const lines = text.split('\n');
  let head = true;
  return lines.map((line, i) => {
    if (line === '') {
      head = false;
      return '';
    }
    if (i === 0 && line.startsWith('【')) return 'title';
    if (head) return 'meta';
    if (line.startsWith('■ ')) return 'section';
    if (line.startsWith('◆ ')) return 'category';
    if (line.startsWith('・')) return `row:${valueKey(line.slice(line.indexOf('：') + 1))}`;
    if (line.startsWith('　└ ')) return `note:${line.slice(3)}`;
    if (line.startsWith('　　')) return `note+:${line.slice(2)}`;
    if (line.startsWith('○ ')) return 'legend';
    return `text:${line}`;
  });
}

const cells = (line: string) =>
  line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

/** Markdown 輸出的骨架 */
export function markdownSkeleton(md: string): string[] {
  const lines = md.split('\n');
  return lines.map((line, i) => {
    if (line === '') return '';
    if (line.startsWith('### ')) return 'h3';
    if (line.startsWith('## ')) return 'h2';
    if (line.startsWith('# ')) return 'h1';
    if (line.startsWith('**')) return 'meta';
    if (line.startsWith('> ')) return 'legend';
    if (line.startsWith('| ---')) return line;
    if (line.startsWith('| ')) {
      const c = cells(line);
      if (lines[i + 1]?.startsWith('| ---')) return `head:${c.length}`;
      return `row:${valueKey(c[1] ?? '')}${c.length > 2 ? `:${c[2]}` : ''}`;
    }
    return `text:${line.replace(/ {2}$/, '')}`;
  });
}
