/**
 * 線索道具產生器（handout-maker）的本文標記（規格 3.2）：
 * - 一般主題的 `||文字||` 塗黑：成對、落單照原樣、空的不畫、同一行裡才算、跳脫 `\|`、`\\`；
 * - 簡訊：一行一則、有 `||` 的是自己發的、空白行與拿掉標記後是空的略過、跳脫；
 * - 整段頭尾的空白去掉（同原作）。
 */
import { describe, expect, it } from 'vitest';
import { parseBody, parseCensorLine, parseSms, plainText } from '@/tools/handout-maker/markup';

const c = (text: string) => ({ text, censored: true });
const p = (text: string) => ({ text, censored: false });

describe('塗黑與跳脫（F11、F12）', () => {
  it('成對的 || 之間塗黑，可以有好幾段', () => {
    expect(parseCensorLine('致 ||H. L.||，永不分離')).toEqual([
      p('致 '),
      c('H. L.'),
      p('，永不分離'),
    ]);
    expect(parseCensorLine('||a||b||c||')).toEqual([c('a'), p('b'), c('c')]);
  });

  it('沒有成對的最後一個 || 照原樣顯示（同原作的規則：由左往右配對）', () => {
    expect(parseCensorLine('a||b||c||d')).toEqual([p('a'), c('b'), p('c||d')]);
    expect(parseCensorLine('只有開頭||沒有結尾')).toEqual([p('只有開頭||沒有結尾')]);
    expect(parseCensorLine('|||')).toEqual([p('|||')]);
  });

  it('||||（空的）不畫；三個 | 開頭時多的那個算在裡面（同原作）', () => {
    expect(parseCensorLine('前||||後')).toEqual([p('前後')]);
    expect(parseCensorLine('|||a|||')).toEqual([c('|a'), p('|')]);
    expect(parseCensorLine('||||||')).toEqual([p('||')]);
  });

  it('跳脫：\\| 是一般的 |（不算標記），\\\\ 是一個 \\，其他的 \\ 照原樣', () => {
    expect(parseCensorLine('\\|\\|不是標記\\|\\|')).toEqual([p('||不是標記||')]);
    expect(parseCensorLine('||a\\|b||')).toEqual([c('a|b')]);
    expect(parseCensorLine('路徑 C:\\temp')).toEqual([p('路徑 C:\\temp')]);
    expect(parseCensorLine('\\\\||x||')).toEqual([p('\\'), c('x')]);
  });

  it('標記不跨行：每一行各自配對', () => {
    expect(parseBody('a||b\nc||d')).toEqual([[p('a||b')], [p('c||d')]]);
  });

  it('整段頭尾的空白去掉；中間的空行保留成空的一行；全空白時沒有內容', () => {
    expect(parseBody('\n  第一行\n\n第三行  \n\n')).toEqual([[p('第一行')], [], [p('第三行')]]);
    expect(parseBody('  \n \n')).toEqual([]);
    expect(parseBody('a\r\nb')).toEqual([[p('a')], [p('b')]]);
  });

  it('plainText：留下所有字（塗黑的也留著），標記與跳脫拿掉', () => {
    expect(plainText('A||B||\\|C')).toBe('AB|C');
  });
});

describe('簡訊（F13）', () => {
  it('一行一則；有 || 的是自己發的（拿掉 || 後去頭尾空白）', () => {
    expect(parseSms('你到了嗎？\n||剛到，門是開著的||\n不要進去')).toEqual([
      { sent: false, text: '你到了嗎？' },
      { sent: true, text: '剛到，門是開著的' },
      { sent: false, text: '不要進去' },
    ]);
  });

  it('只要有一個 || 就算自己發的（同原作）', () => {
    expect(parseSms('||只有開頭')).toEqual([{ sent: true, text: '只有開頭' }]);
    expect(parseSms('中||間')).toEqual([{ sent: true, text: '中間' }]);
  });

  it('空白行、拿掉標記後是空的略過', () => {
    expect(parseSms('\n  \n||  ||\n內容\n')).toEqual([{ sent: false, text: '內容' }]);
  });

  it('跳脫的 \\|\\| 不算標記，照原樣顯示', () => {
    expect(parseSms('a\\|\\|b')).toEqual([{ sent: false, text: 'a||b' }]);
    expect(parseSms('||a\\|b||')).toEqual([{ sent: true, text: 'a|b' }]);
  });
});
