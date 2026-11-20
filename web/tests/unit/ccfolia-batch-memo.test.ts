/**
 * CCFOLIA 角色批次產生器：「速記・從劇本貼上」的讀法（規格 3.2、3.3）。
 * 日文的案例照原作 _dev/test.js 的預期（聊天面板換成本站的寫法：不加【】、傷害寫「名稱（傷害）」、有 SAN 時第一行理智檢定）；
 * 繁中、簡中的案例是本站補的寫法。
 */
import { describe, expect, it } from 'vitest';
import {
  commandLabel,
  type MemoOptions,
  readNpcText,
  rollPrefix,
} from '@/tools/ccfolia-batch/memo';
import { chipText, memoHintText } from '@/tools/ccfolia-batch/strings';
import { wordKey } from '@/tools/ccfolia-batch/words';

const O: MemoOptions = {
  roll: 'auto',
  secretRoll: false,
  suffix: 'alpha',
  proseToMemo: false,
  abilityChecks: false,
  labels: {},
};
const read = (text: string, o: Partial<MemoOptions> = {}) => readNpcText(text, { ...O, ...o });
const one = (text: string, o: Partial<MemoOptions> = {}) =>
  read(`X\n${text}`, { roll: 'ccb', ...o }).pieces[0];
const sum = (c: ReturnType<typeof one>) => [
  c.status.map((s) => `${s.label} ${s.value}/${s.max}`).join(),
  c.params.map((p) => `${p.label} ${p.value}`).join(),
  c.commands,
];

describe('速記（原作的範例）', () => {
  const text = [
    'アリス',
    'HP 12  MP 10  SAN 55/99',
    'STR 50 DEX 60　DB +1d4',
    '回避 30 / こぶし 50 1d3+DB／図書館：65％、目星=70',
    'メモ: 大学生',
    '好奇心が強い。',
    '立ち絵: alice_base',
    '1d100 【幸運】',
    'https://example.com/sheet',
    '',
    '',
    '黒い影 ×3',
    'HP 20, DEX 80, 装甲 2',
    'かぎ爪 70 1d6+1d4',
    'イニシアチブ 99',
    '',
    '名前: Alex2',
    'HP 5',
  ].join('\n');

  it('狀態、參數、技能、×N、先攻、網址、立繪', () => {
    const { pieces, hints } = read(text, { roll: 'ccb' });
    expect(hints).toEqual([]);
    expect(pieces.map((c) => c.name)).toEqual(['アリス', '黒い影A', '黒い影B', '黒い影C', 'Alex2']);
    const a = pieces[0];
    expect(a.status).toEqual([
      { label: 'HP', value: 12, max: 12 },
      { label: 'MP', value: 10, max: 10 },
      { label: 'SAN', value: 55, max: 99 },
    ]);
    expect(a.params).toEqual([
      { label: 'STR', value: '50' },
      { label: 'DEX', value: '60' },
      { label: 'DB', value: '+1d4' },
    ]);
    /* +DB 換成參照 {DB}（DB 的值帶正負號）；有 SAN 時第一行是理智檢定 */
    expect(a.commands).toBe(
      [
        'CCB<={SAN} 理智檢定',
        'CCB<=30 回避',
        'CCB<=50 こぶし',
        '1d3{DB} こぶし（傷害）',
        'CCB<=65 図書館',
        'CCB<=70 目星',
        '1d100 【幸運】',
      ].join('\n'),
    );
    /* 說明的文字預設不放進備註（其他玩家看得到） */
    expect(a.memo).toBe('大学生');
    expect(read(text, { roll: 'ccb', proseToMemo: true }).pieces[0].memo).toBe(
      '大学生\n好奇心が強い。',
    );
    expect([a.imageName, a.externalUrl, a.initiative, a.line]).toEqual([
      'alice_base',
      'https://example.com/sheet',
      60,
      1,
    ]);
    const b = pieces[2];
    expect([b.imageName, b.initiative, b.line]).toEqual(['黒い影', 99, 12]);
    /* 装甲 讀成本站的「護甲」 */
    expect(b.params).toEqual([
      { label: 'DEX', value: '80' },
      { label: '護甲', value: '2' },
    ]);
    expect(b.commands).toBe('CCB<=70 かぎ爪\n1d6+1d4 かぎ爪（傷害）');
  });

  it('其他判定的寫法、數字的複本、×N 的上限', () => {
    expect(read('A\n回避 40', { roll: 'cc' }).pieces[0].commands).toBe('CC<=40 回避');
    expect(read('A\n回避 40', { roll: 'd100' }).pieces[0].commands).toBe('1d100<=40 回避');
    const none = read('A\n回避 40 1d3', { roll: 'none' }).pieces[0];
    expect([none.params, none.commands, none.initiative]).toEqual([
      [{ label: '回避', value: '40' }],
      '1d3 回避（傷害）',
      0,
    ]);
    expect(read('ゾンビ x2', { suffix: 'number' }).pieces.map((c) => c.name)).toEqual([
      'ゾンビ1',
      'ゾンビ2',
    ]);
    /* 英數結尾的名字加空白 */
    expect(read('Zombie x2').pieces.map((c) => c.name)).toEqual(['Zombie A', 'Zombie B']);
    const many = read('群れ ×999');
    expect(many.pieces).toHaveLength(100);
    expect(many.hints).toEqual([{ code: 'too-many', line: 1, name: '群れ', max: 100 }]);
    expect(many.pieces[26].name).toBe('群れ27');
    const db = read('A\nSTR 50  DEX 60  DB +0\nMOV ８').pieces[0];
    expect([db.params.map((p) => `${p.label}=${p.value}`).join(), db.initiative, db.memo]).toEqual([
      'STR=50,DEX=60,DB=+0,MOV=8',
      60,
      '',
    ]);
  });
});

describe('各作者的寫法（原作的案例）', () => {
  it('黏在一起、括號、全形 %、成功值、成對的標籤', () => {
    expect(sum(one('STR50、CON45、HP11、宿り点12'))).toEqual([
      'HP 11/11,宿り点 12/12',
      'STR 50,CON 45',
      '',
    ]);
    expect(one('〈回避〉60％、《鍵開け》55% ＜キック＞成功値70').commands).toBe(
      'CCB<=60 回避\nCCB<=55 鍵開け\nCCB<=70 キック',
    );
    expect(sum(one('HP11、STR／DEX 60／50、回避25%')).slice(0, 2)).toEqual([
      'HP 11/11',
      'STR 60,DEX 50',
    ]);
    expect(sum(one('STR / CON | 80 / 65'))[1]).toBe('STR 80,CON 65');
  });

  it('傷害：括號裡、後面、下一行、7 版、另一種傷害', () => {
    /* 括號附註裡的傷害（本站新增：原作不讀） */
    expect(one('〈噛みつく〉60％（ダメージ1D6、対象はランダム）').commands).toBe(
      'CCB<=60 噛みつく\n1D6 噛みつく（傷害：対象はランダム）',
    );
    expect(one('〈噛みつく〉成功値60　1d6のダメージ').commands).toBe(
      'CCB<=60 噛みつく\n1d6 噛みつく（傷害）',
    );
    expect(one('〈ハサミ〉成功値70\n1d6のダメージおよび〈組みつき〉').commands).toBe(
      'CCB<=70 ハサミ\n1d6 ハサミ（傷害）',
    );
    expect(
      one('DB +1d4\n近接戦闘(格闘) 50%(25/10)、ダメージ 1D3+DB\n回避 35%(17/7)', { roll: 'auto' })
        .commands,
    ).toBe('CC<=50 近接戦闘(格闘)\n1D3{DB} 近接戦闘(格闘)（傷害）\nCC<=35 回避');
    expect(one('射撃(32口径拳銃) 50%、ダメージ 1D8\nもしくは1D3+1（銃床で殴る）').commands).toBe(
      'CCB<=50 射撃(32口径拳銃)\n1D8 射撃(32口径拳銃)（傷害）\n1D3+1 射撃(32口径拳銃)（傷害：銃床で殴る）',
    );
  });

  it('PDF：拆開的字與數字、斷到下一行的值、跨行的括號', () => {
    expect(sum(one('S TR:8 5(17) D EX: 6 5\n耐久力\n1 4 MP:06')).slice(0, 2)).toEqual([
      'HP 14/14,MP 6/6',
      'STR 85,DEX 65',
    ]);
    expect(one('〈製作（木材製品）〉\n7 5\n（〈こぶし\n〉 80 〈頭突き〉 5 0').commands).toBe(
      'CCB<=75 製作(木材製品)\nCCB<=80 こぶし\nCCB<=50 頭突き',
    );
  });

  it('另外列的武器、不是資料的行、寫好的聊天面板', () => {
    const w = one(
      '日本刀 90%\n武器:\n日本刀\nダメージ1D10 + DB、耐久力20\n呪文:\n旧き印(基本P.280)\n年齢は30代。好物は甘いもの。',
    );
    expect([w.commands, w.status.length]).toEqual(['CCB<=90 日本刀\n1D10+DB 日本刀（傷害）', 0]);
    /* 寫好的聊天面板照原文，同名的技能不重複寫 */
    expect(
      one(
        'こぶし 60 回避 50\n【ココフォリア用チャパレ】\nsCCB<=60 【こぶし】 sCCB<=50 【回避】 1d3 【こぶし】',
      ).commands,
    ).toBe('sCCB<=60 【こぶし】\nsCCB<=50 【回避】\n1d3 【こぶし】');
    expect(one('CCB<=80 触肢\n2d3 触肢威力').commands).toBe('CCB<=80 触肢\n2d3 触肢威力');
    expect(one('触肢 80\nCCB<=80 触肢').commands).toBe('CCB<=80 触肢');
  });

  it('名字的寫法', () => {
    const names = (t: string) => read(`${t}\nHP 1`).pieces.map((c) => c.name);
    expect(names('【山田 太郎(やまだ たろう)】170cm 誕生日:4/1')).toEqual(['山田 太郎']);
    expect(names('▼怪しい店主─佐藤はな(さとうはな)')).toEqual(['佐藤はな']);
    expect(names('鈴木 一郎(40 歳)、市役所 職員')).toEqual(['鈴木 一郎']);
    expect(names('《陳 明(チェン・ミン)》')).toEqual(['陳 明']);
    expect(names('◆エネミーデータ：兵隊')).toEqual(['兵隊']);
    expect(names('屍食鬼*2（PL人数に合わせて調整）')).toEqual(['屍食鬼A', '屍食鬼B']);
    expect(names('高橋みお\n、旧家の跡取り')).toEqual(['高橋みお']);
  });

  it('版本、秘密骰、改讀法、提示', () => {
    const seven = read('A\nSTR 55 CON 55 SIZ 50 DEX 55\n回避 30').pieces[0];
    expect([seven.edition, seven.commands]).toEqual([7, 'CC<=30 回避']);
    expect(read('A\n回避 30', { secretRoll: true }).pieces[0].commands).toBe('sCCB<=30 回避');
    const k = wordKey('警戒値');
    const r = read('A\n警戒値 6 回避 30', {
      roll: 'ccb',
      labels: { [k]: 'param', [wordKey('回避')]: 'ignore' },
    });
    expect([r.pieces[0].params, r.pieces[0].commands]).toEqual([
      [{ label: '警戒値', value: '6' }],
      '',
    ]);
    expect(r.labels.find((l) => l.key === k)).toMatchObject({
      auto: 'status',
      kind: 'param',
      known: false,
    });
    expect(r.labels.find((l) => l.label === '回避')).toMatchObject({ kind: 'ignore', known: true });
    const h = read('A\nSTR 10\nB\nSTR 12\n\nHP 3\n\nC\n命中 / 80').hints;
    expect(h.map((x) => x.code)).toEqual(['joined', 'no-name', 'unread', 'nothing']);
    expect(h.map(memoHintText)).toEqual([
      'A：能力值出現了 2 次。好幾個 NPC 連在一起時，請在 NPC 之間空一行。',
      '第 6 行開始的 NPC 沒有名字。請在第一行寫名字。',
      'C：第 9 行有讀不出的數字。寫成「標籤 數字」（例：偵查 60）就讀得到。',
      'C：讀不到任何數值。',
    ]);
  });
});

describe('繁中、簡中的劇本', () => {
  const zh = [
    '■ 陳老闆（54歲），雜貨店老闆',
    'STR 60 CON 50 SIZ 65 DEX 40 APP 45 INT 70 POW 55 EDU 60',
    'HP 11 MP 11 SAN 55 DB 0 MOV 6',
    '技能：閃避 30%、鬥毆 50%（1D3+DB）、偵查 60%、心理學 45%',
    '武器：菜刀 40%，傷害 1D4+DB',
    '他總是笑瞇瞇地招呼客人，但其實在暗中觀察調查員。',
  ].join('\n');

  it('能力值、狀態、小標、括號裡的傷害、武器的傷害、說明的文字', () => {
    const { pieces, hints } = read(zh);
    expect(hints).toEqual([]);
    const c = pieces[0];
    expect(c.name).toBe('陳老闆');
    expect(c.edition).toBe(7);
    expect(c.initiative).toBe(40);
    expect(sum(c).slice(0, 2)).toEqual([
      'HP 11/11,MP 11/11,SAN 55/55',
      'STR 60,CON 50,SIZ 65,DEX 40,APP 45,INT 70,POW 55,EDU 60,DB +0,MOV 6',
    ]);
    expect(c.commands.split('\n')).toEqual([
      'CC<={SAN} 理智檢定',
      'CC<=30 閃避',
      'CC<=50 鬥毆',
      '1D3{DB} 鬥毆（傷害）',
      'CC<=60 偵查',
      'CC<=45 心理學',
      'CC<=40 菜刀',
      '1D4{DB} 菜刀（傷害）',
    ]);
    /* 武器清單後面的說明不是武器的名字（不讀） */
    expect(c.source.map((s) => s.state)).toEqual(['name', 'read', 'read', 'read', 'read', 'skip']);
    /* 說明的文字放進備註時用原文（全形標點不換成半形） */
    expect(read(zh, { proseToMemo: true }).pieces[0].memo).toBe(
      '雜貨店老闆\n(54歲)\n他總是笑瞇瞇地招呼客人，但其實在暗中觀察調查員。',
    );
  });

  it('中文的能力值名稱、生命值、護甲、7 版的另一版值、傷害加值與體格', () => {
    const t = [
      '深潛者 ×2',
      '力量 80（16） 體質 65 體型 90 敏捷 40 意志 50',
      '生命值：16 護甲：1（皮膚）',
      '格鬥（爪擊） 45%（22/9），傷害 1D6+DB',
      '閃避 20%（10/4）',
      '傷害加值：+1D4　體格：1',
    ].join('\n');
    const { pieces, labels } = read(t);
    expect(pieces.map((c) => [c.name, c.imageName])).toEqual([
      ['深潛者A', '深潛者'],
      ['深潛者B', '深潛者'],
    ]);
    const c = pieces[0];
    expect(c.edition).toBe(7);
    expect(sum(c)).toEqual([
      'HP 16/16',
      'STR 80,CON 65,SIZ 90,DEX 40,POW 50,護甲 1,DB +1D4,體格 1',
      'CC<=45 格鬥(爪擊)\n1D6{DB} 格鬥(爪擊)（傷害）\nCC<=20 閃避',
    ]);
    expect(labels.find((l) => l.written === '力量')).toMatchObject({ label: 'STR', known: true });
  });

  it('角色備註、另一種傷害（或）、讀音、簡中的名稱、「點傷害」', () => {
    const t = [
      '黑影 ×3',
      'HP 20  DEX 80  護甲 2',
      '爪擊 70 1d6+1d4 / 閃避 40',
      '角色備註：在巷子裡出沒，怕光',
      '',
      '【李明（Li Ming）】警察',
      'STR：65 CON：70 POW：50 DEX：60',
      '理智：50/99 生命：13 魔力：10',
      '手槍 50%，傷害 1D10',
      '或 1D3+DB（用警棍打）',
      '',
      '王小美',
      '體力 10 理智值 45',
      '说服 60 / 闪避 35 / 斗殴 40 1d3',
      '',
      '怪物',
      '擒抱 60',
      '1D6點傷害',
    ].join('\n');
    const { pieces } = read(t);
    expect(pieces.map((c) => c.name)).toEqual([
      '黑影A',
      '黑影B',
      '黑影C',
      '李明',
      '王小美',
      '怪物',
    ]);
    expect(pieces[0].memo).toBe('在巷子裡出沒，怕光');
    expect(pieces[3].commands.split('\n')).toEqual([
      'CC<={SAN} 理智檢定',
      'CC<=50 手槍',
      '1D10 手槍（傷害）',
      '1D3+DB 手槍（傷害：用警棍打）',
    ]);
    expect(sum(pieces[4]).slice(0, 1)).toEqual(['HP 10/10,SAN 45/45']);
    expect(pieces[4].commands).toContain('CCB<=40 斗殴\n1d3 斗殴（傷害）');
    expect(pieces[5].commands).toBe('CCB<=60 擒抱\n1D6 擒抱（傷害）');
  });

  it('能力值也寫成判定（6 版 ×5、7 版照值）', () => {
    expect(read('A\nSTR 12 DEX 14\n閃避 28', { abilityChecks: true }).pieces[0].commands).toBe(
      'CCB<=60 STR\nCCB<=70 DEX\nCCB<=28 閃避',
    );
    expect(
      read('A\nSTR 60 CON 50 DEX 70\n閃避 35', { abilityChecks: true }).pieces[0].commands,
    ).toBe('CC<=60 STR\nCC<=50 CON\nCC<=70 DEX\nCC<=35 閃避');
    /* 不寫成判定時不加 */
    expect(read('A\nSTR 60', { abilityChecks: true, roll: 'none' }).pieces[0].commands).toBe('');
  });

  it('寫好的指令裡已經有 SAN 的檢定時不另外加理智檢定', () => {
    expect(read('A\nSAN 50\nCCB<={SAN} 正気度ロール').pieces[0].commands).toBe(
      'CCB<={SAN} 正気度ロール',
    );
  });
});

describe('名字行、傷害、狀態的細節', () => {
  it('名字行：括號裡的逗號不切（全形、半形、【】〈〉《》「」）', () => {
    const name = (line: string) => read(`${line}\nHP 10`, { proseToMemo: true }).pieces[0];
    expect([name('老人（72 歲，退休教師）').name, name('老人（72 歲，退休教師）').memo]).toEqual([
      '老人',
      '(72 歲,退休教師)',
    ]);
    expect(name('老人（72 歲，退休教師），村長').name).toBe('老人');
    expect(name('老人（72 歲，退休教師），村長').memo).toBe('村長\n(72 歲,退休教師)');
    expect(name('傑克〈開膛手，倫敦〉、殺人魔').name).toBe('傑克〈開膛手,倫敦〉');
    expect(name('瑪莉「女僕、管家」').name).toBe('瑪莉「女僕、管家」');
    expect(name('陳老闆，雜貨店老闆').name).toBe('陳老闆');
  });

  it('傷害加值、伤害加成、ダメボ 寫在算式裡：換成 {DB}（有 DB 參數時），不變成附註', () => {
    const t = (rows: string) => one(`DB +1D4\n${rows}`).commands.split('\n');
    expect(t('鬥毆 60%，傷害 1D3+傷害加值')).toEqual(['CCB<=60 鬥毆', '1D3{DB} 鬥毆（傷害）']);
    expect(t('斗殴 55% 伤害 1d3+伤害加值')).toEqual(['CCB<=55 斗殴', '1d3{DB} 斗殴（傷害）']);
    expect(t('格鬥 50%（1D6 + 傷害加成）')).toEqual(['CCB<=50 格鬥', '1D6{DB} 格鬥（傷害）']);
    expect(t('こぶし 50 1d3+ダメボ')).toEqual(['CCB<=50 こぶし', '1d3{DB} こぶし（傷害）']);
    /* 沒有 DB 參數時照寫成 +DB */
    expect(one('斗殴 55% 伤害 1d3+伤害加值').commands).toBe('CCB<=55 斗殴\n1d3+DB 斗殴（傷害）');
  });

  it('括號裡的附註照原文（不插空白）', () => {
    expect(one('手槍 40%（1D10，射程15米）').commands).toBe(
      'CCB<=40 手槍\n1D10 手槍（傷害：射程15米）',
    );
  });

  it('技能下一行只有括號的骰子式：那個技能的傷害（上一行最後是技能時）', () => {
    const c = one('DB +1D4\n鬥毆 60%\n（1D3+DB）\nHP 10\n（1D6）');
    expect(c.commands).toBe('CCB<=60 鬥毆\n1D3{DB} 鬥毆（傷害）');
    expect(c.source.map((s) => s.state)).toEqual(['name', 'read', 'read', 'read', 'read', 'skip']);
    /* 中間隔了別的行時不接 */
    expect(one('鬥毆 60%\nHP 10\n（1D3）').commands).toBe('CCB<=60 鬥毆');
  });

  it('SAN、MP、HP 的中文寫法（繁中、簡中）', () => {
    const { labels } = read(
      [
        'X',
        '理智點 50 魔力點 10 體力 12',
        '理智值 40 SAN 值 30 魔法值 5 耐久值 8 生命值 9',
        '理智点 20 魔力点 3 体力 4',
      ].join('\n'),
    );
    expect(labels.map((l) => `${l.written}→${l.label}`)).toEqual([
      '理智點→SAN',
      '魔力點→MP',
      '體力→HP',
      '理智值→SAN',
      'SAN 值→SAN',
      '魔法值→MP',
      '耐久值→HP',
      '生命值→HP',
      '理智点→SAN',
      '魔力点→MP',
      '体力→HP',
    ]);
  });

  it('幸運（幸运、LUK）是狀態，聊天面板在理智檢定後面加「判定{幸運} 幸運」', () => {
    const c = one('SAN 50 幸運 60\n閃避 40');
    expect(sum(c)[0]).toBe('SAN 50/50,幸運 60/60');
    expect(c.commands.split('\n')).toEqual([
      'CCB<={SAN} 理智檢定',
      'CCB<={幸運} 幸運',
      'CCB<=40 閃避',
    ]);
    expect(one('幸运 45').status).toEqual([{ label: '幸運', value: 45, max: 45 }]);
    expect(one('LUK 55').commands).toBe('CCB<={幸運} 幸運');
    /* 寫好的指令裡已經有時不加；0 時不加 */
    expect(one('LUK 60\nCCB<=60 幸運').commands).toBe('CCB<=60 幸運');
    expect(one('幸運 0').commands).toBe('');
  });

  it('SAN 是 0 時不加理智檢定', () => {
    expect(one('SAN 0/0 HP 5\n回避 30').commands).toBe('CCB<=30 回避');
    expect(one('理智：0\n回避 30').commands).toBe('CCB<=30 回避');
  });

  it('行首的項目符號與編號（- • · ・ * 1. 1、）', () => {
    const c = read(
      '- 艾莉絲\n• HP 10\n・閃避 40%\n1. 鬥毆 50%\n2、偵查 60%\n* 聆聽 50\n· 心理學 30',
    ).pieces[0];
    expect(c.name).toBe('艾莉絲');
    expect(sum(c)).toEqual([
      'HP 10/10',
      '',
      'CCB<=40 閃避\nCCB<=50 鬥毆\nCCB<=60 偵查\nCCB<=50 聆聽\nCCB<=30 心理學',
    ]);
    /* 「---」「1.5 倍」不是項目符號 */
    expect(read('A\n---\n1.5 倍', { proseToMemo: true }).pieces[0].memo).toBe('---');
  });
});

describe('原文的讀法（畫面上的逐行列表）', () => {
  it('每一行的狀態與讀到的東西', () => {
    const c = read('黑影 ×2\nHP 20 X 3\n說明的文字\n命中 / 80\n技能：\n閃避 40').pieces[0];
    expect(c.source.map((s) => [s.line, s.state])).toEqual([
      [1, 'name'],
      [2, 'read'],
      [3, 'skip'],
      [4, 'unread'],
      [5, 'section'],
      [6, 'read'],
    ]);
    expect(c.source[0].read.map(chipText)).toEqual(['名字：黑影 ×2']);
    expect(c.source[1].read.map(chipText)).toEqual(['HP 20', 'X 3']);
    expect(c.source[3].read.map(chipText)).toEqual(['讀不出：80']);
  });
});

describe('小工具', () => {
  it('判定的指令', () => {
    expect(rollPrefix('auto', false, 6)).toBe('CCB<=');
    expect(rollPrefix('auto', false, 7)).toBe('CC<=');
    expect(rollPrefix('auto', true, 7)).toBe('sCC<=');
    expect(rollPrefix('d100', true, 6)).toBe('s1d100<=');
    expect(rollPrefix('none', true, 6)).toBe('');
  });

  it('指令的標籤', () => {
    expect(commandLabel('CCB<=80 【触肢】')).toBe('触肢');
    expect(commandLabel('CC<=50 閃避')).toBe('閃避');
    expect(commandLabel('1d100')).toBe('');
  });
});
