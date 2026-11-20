/**
 * CCFOLIA 角色批次產生器：「貼上試算表」與「從角色卡網站貼上」的讀法（規格 3.4、3.5）。
 * 日文、英文的案例照原作 _dev/test.js 的預期。
 */
import { describe, expect, it } from 'vitest';
import { parsePieces } from '@/tools/ccfolia-batch/pieces';
import { SAMPLES, tableHintText } from '@/tools/ccfolia-batch/strings';
import { parseTable } from '@/tools/ccfolia-batch/table';

describe('貼上試算表', () => {
  it('TSV，引號包住的多行格', () => {
    const text =
      '名前\tHP\tMP\tDEX\tチャットパレット\tメモ\nアリス\t10/12\t５\t60\t"CCB<=60 【回避】\n1d3 ""こぶし"""\t学生\n\nボブ\t14\t\t45\t\t\n';
    const { columns, pieces, hints } = parseTable(text);
    expect(columns.map((c) => c.kind)).toEqual([
      'name',
      'status',
      'status',
      'param',
      'commands',
      'memo',
    ]);
    expect(pieces).toHaveLength(2);
    expect(pieces[0].status).toEqual([
      { label: 'HP', value: 10, max: 12 },
      { label: 'MP', value: 5, max: 5 },
    ]);
    expect(pieces[0].params).toEqual([{ label: 'DEX', value: '60' }]);
    expect(pieces[0].commands).toBe('CCB<=60 【回避】\n1d3 "こぶし"');
    expect(pieces[1].status).toEqual([{ label: 'HP', value: 14, max: 14 }]);
    /* 列號照試算表（空列也算一列） */
    expect(pieces[1].line).toBe(4);
    expect(hints).toEqual([]);
  });

  it('CSV、前綴、開關、顏色、改用途', () => {
    const text =
      'name,ステータス:気力,パラメータ:HP,差分:笑顔,盤面,色,サイズ,装甲\nA,3/5,99,A笑顔,○,#FF0000,6,2\nB,x,1,,×,red,big,';
    const r = parseTable(text, { 装甲: 'status' });
    expect(r.columns.map((c) => c.kind)).toEqual([
      'name',
      'status',
      'param',
      'face',
      'active',
      'color',
      'size',
      'status',
    ]);
    const [a, b] = r.pieces;
    expect(a.status).toEqual([
      { label: '気力', value: 3, max: 5 },
      { label: '装甲', value: 2, max: 2 },
    ]);
    expect(a.params).toEqual([{ label: 'HP', value: '99' }]);
    expect(a.faces).toEqual([{ label: '笑顔', imageId: null, imageName: 'A笑顔' }]);
    expect([a.active, a.color, a.size]).toEqual([true, '#ff0000', 6]);
    expect([b.active, b.color, b.size]).toEqual([false, '#888888', null]);
    expect(r.hints.map((h) => h.code)).toEqual(['not-status', 'not-color', 'not-number']);
    expect(r.hints.map(tableHintText)).toEqual([
      '第 3 列「ステータス:気力」的「x」請寫成「10」或「10/12」（先當成 0）。',
      '第 3 列「色」的「red」不是顏色（#888888 這樣的色碼）。',
      '第 3 列「サイズ」的「big」不是數字。',
    ]);
  });

  it('中文的標題與前綴', () => {
    const text = [
      '名稱\t生命值\t狀態:氣力\t參數:HP\t先攻值\t聊天面板\t備註\t立繪\t差分:笑\t放到盤面\t狀態不公開\t棋子大小',
      '艾莉絲\t12\t3/5\t99\t15\tCC<=50 閃避\t學生\talice\talice_smile\t是\t否\t200',
    ].join('\n');
    const { columns, pieces } = parseTable(text);
    expect(columns.map((c) => c.kind)).toEqual([
      'name',
      'status',
      'status',
      'param',
      'initiative',
      'commands',
      'memo',
      'image',
      'face',
      'active',
      'secret',
      'size',
    ]);
    const c = pieces[0];
    expect(c.status).toEqual([
      { label: '生命值', value: 12, max: 12 },
      { label: '氣力', value: 3, max: 5 },
    ]);
    expect([c.initiative, c.commands, c.memo, c.imageName, c.active, c.secret, c.size]).toEqual([
      15,
      'CC<=50 閃避',
      '學生',
      'alice',
      true,
      false,
      100,
    ]);
    expect(c.faces).toEqual([{ label: '笑', imageId: null, imageName: 'alice_smile' }]);
  });

  it('沒有名稱的欄、空白', () => {
    const r = parseTable('キャラ\tHP\nA\t1');
    expect(r.columns[0].kind).toBe('name');
    expect(r.pieces[0].name).toBe('A');
    expect(r.hints).toEqual([{ code: 'no-name-column' }]);
    expect(parseTable('').pieces).toEqual([]);
    expect(parseTable('名前\tHP\n').pieces).toEqual([]);
  });

  it('範例', () => {
    const { pieces, hints } = parseTable(SAMPLES.table);
    expect(hints).toEqual([]);
    expect(pieces.map((c) => [c.name, c.initiative, c.status.length, c.params])).toEqual([
      [
        '艾莉絲',
        12,
        3,
        [
          { label: 'DEX', value: '60' },
          { label: '閃避', value: '30' },
        ],
      ],
      [
        '鮑伯',
        9,
        3,
        [
          { label: 'DEX', value: '45' },
          { label: '閃避', value: '22' },
        ],
      ],
      [
        '黑影',
        16,
        1,
        [
          { label: 'DEX', value: '80' },
          { label: '閃避', value: '40' },
        ],
      ],
    ]);
    expect(pieces[0].commands).toBe('CCB<={閃避} 閃避\n1d3 鬥毆');
  });
});

describe('從角色卡網站貼上', () => {
  const one = {
    kind: 'character',
    data: {
      name: '探索者',
      initiative: 12,
      externalUrl: 'https://iachara.com/view/1',
      iconUrl: 'https://example.com/a.png',
      commands: 'CCB<=50 【目星】',
      status: [{ label: 'HP', value: 11, max: 11 }],
      params: [{ label: 'STR', value: '10' }],
      color: '#ff0000',
      width: 6,
      secret: true,
    },
  };

  it('一個、陣列、接著貼、包成字串、不是角色資料', () => {
    const r = parsePieces(JSON.stringify(one));
    const [c] = r.pieces;
    expect([c.name, c.initiative, c.color, c.size, c.secret, c.commands, c.from]).toEqual([
      '探索者',
      12,
      '#ff0000',
      6,
      true,
      'CCB<=50 【目星】',
      'paste',
    ]);
    expect(r.withIcon).toBe(1);
    expect(c.status).toEqual([{ label: 'HP', value: 11, max: 11 }]);
    expect(c.params).toEqual([{ label: 'STR', value: '10' }]);
    expect(parsePieces(JSON.stringify([one, one])).pieces).toHaveLength(2);
    expect(parsePieces(`${JSON.stringify(one)}\n${JSON.stringify(one)}`).pieces).toHaveLength(2);
    expect(parsePieces(JSON.stringify(JSON.stringify(one))).pieces).toHaveLength(1);
    expect(parsePieces('名前\tHP').pieces).toHaveLength(0);
    expect(parsePieces('{"kind":"other","data":{}}').pieces).toHaveLength(0);
  });

  it('數值寫成文字也讀、顏色不對時用預設', () => {
    const { pieces } = parsePieces(
      JSON.stringify({
        kind: 'character',
        data: {
          name: 'B',
          initiative: '８',
          color: 'red',
          status: [{ label: 'HP', value: '7', max: 'x' }],
        },
      }),
    );
    expect([pieces[0].initiative, pieces[0].color, pieces[0].status]).toEqual([
      8,
      '#888888',
      [{ label: 'HP', value: 7, max: 0 }],
    ]);
  });
});
