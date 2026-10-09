/**
 * discord-color：格式樹 → ANSI（規格 3.2～3.5）。
 * - 對照值 `fixtures/discord-color-ansi.json` 是原作頁面算出來的（tests/parity/discord-color/gen-ansi-cases.ts 產生），
 *   新版必須逐字相同；
 * - 規格 3.4 的範例與 3.5 的三個怪癖（照原作）；修正模式（AnsiOptions.repair，規格 5. D1）不吃字、不吃換行，
 *   而且只在原作出錯的情況與原作不同。
 */
import { describe, expect, it } from 'vitest';
import {
  ANSI_OPTIONS,
  type AnsiNode,
  ansiMessage,
  br,
  code,
  lengthLevel,
  plainText,
  rgb,
  text,
  toAnsi,
} from '../../src/tools/discord-color/ansi';
import { defaultDoc } from '../../src/tools/discord-color/model';
import fixture from './fixtures/discord-color-ansi.json';

type Compact = string | number | Compact[];
const CASES = fixture as unknown as [Compact[], string][];

function decode(list: Compact[]): AnsiNode[] {
  return list.map((n): AnsiNode => {
    if (typeof n === 'string') return text(n);
    if (typeof n === 'number') return br();
    const [head, ...rest] = n as [number | string, ...Compact[]];
    if (typeof head === 'number') return code(head, decode(rest));
    return rgb(head, rest[0] === 1, decode(rest.slice(1) as Compact[]));
  });
}

const E = '\u001b';
/** 輸出裡看得到的文字（去掉程式碼區塊的頭尾與完整的控制碼） */
const visible = (message: string) =>
  message
    .slice('```ansi\n'.length, -'\n```'.length)
    .replace(new RegExp(`${E}\\[[0-9;]*m`, 'g'), '');

describe('原作的對照值', () => {
  it(`${CASES.length} 組隨機的格式樹逐字相同`, () => {
    expect(CASES.length).toBeGreaterThanOrEqual(150);
    for (const [compact, want] of CASES) expect(ansiMessage(decode(compact))).toBe(want);
  });

  it('工具預設照原作輸出（不修正）', () => {
    expect(ANSI_OPTIONS.repair).toBe(false);
  });
});

describe('規格 3.4 的範例', () => {
  const cases: [string, AnsiNode[], string][] = [
    ['經典色（前景）', [text('Hi '), code(31, [text('red')])], `Hi ${E}[7;31mred${E}[0m`],
    ['經典色（背景）', [code(41, [text('x')])], `${E}[7;41mx${E}[0m`],
    ['粗體', [code(1, [text('B')]), text('!')], `${E}[2;1;2mB${E}[0m!`],
    [
      '底線裡的粗體',
      [code(4, [code(1, [text('x')])]), text('y')],
      `${E}[2;4;2m${E}[2;4;1;2mx${E}[0m${E}[2;2m${E}[4;2m${E}[0my`,
    ],
    [
      '紅色裡的粗體',
      [code(31, [code(1, [text('使用')])])],
      `${E}[7;31m${E}[2;1;2m使用${E}[0m${E}[7;31m${E}[0m`,
    ],
    ['RGB 前景', [rgb('#DE4040', true, [text('x')])], `${E}[38;2;222;64;64mx${E}[0m`],
    ['RGB 背景', [rgb('#5865F2', false, [text('x')])], `${E}[48;2;88;101;242mx${E}[0m`],
    [
      '相鄰的兩個經典色：省掉中間的重設碼',
      [code(31, [text('a')]), code(32, [text('b')])],
      `${E}[7;31ma${E}[7;32mb${E}[0m`,
    ],
    [
      '相鄰的同一個顏色：不重複輸出',
      [code(31, [text('a')]), code(31, [text('b')])],
      `${E}[7;31mab${E}[0m`,
    ],
    [
      '相鄰的 RGB 前景',
      [rgb('#FF0000', true, [text('a')]), rgb('#00FF00', true, [text('b')])],
      `${E}[38;2;255;0;0ma${E}[38;2;0;255;0mb${E}[0m`,
    ],
    [
      '清除（重設碼）在紅色裡',
      [code(31, [text('a'), code(0, [text('b')]), text('c')])],
      `${E}[7;31ma${E}[2;0;2mb${E}[0m${E}[7;31mc${E}[0m`,
    ],
    ['沒有文字的格式略過', [text('a'), code(31, []), text('b')], 'ab'],
  ];
  for (const [name, doc, want] of cases)
    it(name, () => {
      expect(toAnsi(doc)).toBe(want);
      expect(ansiMessage(doc)).toBe(`\`\`\`ansi\n${want}\n\`\`\``);
    });

  it('開頁的範例', () => {
    expect(ansiMessage(defaultDoc())).toBe(
      '```ansi\n歡迎使用 ' +
        `${E}[48;2;88;101;242m${E}[38;2;255;255;255mDiscord${E}[0m${E}[48;2;88;101;242m${E}[0m ` +
        `${E}[2;1;2m${E}[7;31m彩${E}[2;2m${E}[1;2m${E}[7;32m色${E}[2;2m${E}[1;2m${E}[7;33m文` +
        `${E}[2;2m${E}[1;2m${E}[7;34m字${E}[2;2m${E}[1;2m${E}[7;35m產${E}[2;2m${E}[1;2m${E}[7;36m生` +
        `${E}[2;2m${E}[1;2m${E}[7;37m器${E}[0m${E}[2;2m${E}[1;2m${E}[0m！\n\`\`\``,
    );
  });
});

describe('規格 3.5：原作的怪癖（照原作）與修正模式', () => {
  const loseText = [code(31, [text('A')]), code(32, [text('ab'), code(34, [text('c')])])];
  const loseBreak = [code(31, [br(), code(34, [text('c')])])];
  const breakOnly = [
    rgb('#FF0000', true, [text('a')]),
    rgb('#00FF00', true, [br()]),
    rgb('#0000FF', true, [text('b')]),
  ];

  it('怪癖一：前一段同種顏色的重設碼在外層時，吃掉字', () => {
    expect(toAnsi(loseText)).toBe(`${E}[7;31mA${E}[7;32ma${E}[7;34mc${E}[0m${E}[7;32m${E}[0m`);
    expect(toAnsi(loseText, { repair: true })).toBe(
      `${E}[7;31mA${E}[7;32mab${E}[7;34mc${E}[0m${E}[7;32m${E}[0m`,
    );
  });

  it('怪癖二：同種顏色直接包在裡面、前面只有換行時，吃掉換行', () => {
    expect(toAnsi(loseBreak)).toBe(`${E}[7;31m${E}[7;34mc${E}[0m${E}[7;31m${E}[0m`);
    expect(toAnsi(loseBreak, { repair: true })).toBe(
      `${E}[7;31m\n${E}[7;34mc${E}[0m${E}[7;31m${E}[0m`,
    );
  });

  it('怪癖三：只有換行的格式（效果套在跨行的文字上）連換行一起略過', () => {
    expect(toAnsi(breakOnly)).toBe(`${E}[38;2;255;0;0ma${E}[38;2;0;0;255mb${E}[0m`);
    expect(toAnsi(breakOnly, { repair: true })).toBe(
      `${E}[38;2;255;0;0ma\n${E}[38;2;0;0;255mb${E}[0m`,
    );
  });

  it('修正模式：看得到的文字一定等於全文；原作沒出錯的情況輸出相同', () => {
    let differs = 0;
    for (const [compact, want] of CASES) {
      const doc = decode(compact);
      const fixed = ansiMessage(doc, { repair: true });
      expect(visible(fixed)).toBe(plainText(doc));
      if (visible(want) === plainText(doc)) expect(fixed).toBe(want);
      else differs++;
    }
    /* 對照值裡確實有原作出錯的情況 */
    expect(differs).toBeGreaterThan(0);
  });
});

describe('字數的分級', () => {
  it('2,000 字以內一般、4,000 字以內要 Nitro、超過送不出去', () => {
    expect(lengthLevel(0)).toBe('ok');
    expect(lengthLevel(2000)).toBe('ok');
    expect(lengthLevel(2001)).toBe('nitro');
    expect(lengthLevel(4000)).toBe('nitro');
    expect(lengthLevel(4001)).toBe('over');
  });
});
