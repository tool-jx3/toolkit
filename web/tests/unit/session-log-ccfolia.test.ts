// @vitest-environment jsdom
/**
 * 跑團紀錄簿的 CCFOLIA・紀錄匯入（3.8.6）：聊天紀錄（CCFOLIA 舊格式、新格式、其他平台的文字）、房間資料（JSON、ZIP）、
 * 角色剪貼簿、發言者的自動指定、單場表單與多場轉成格線。
 */
import { describe, expect, it } from 'vitest';
import { buildRoomZip, createRoom, createRoomCharacter, createRoomData } from '@/ccfolia';
import { localIsoDate, selfNameSet } from '@/core/sessions';
import {
  analyzeFiles,
  ccBaseName,
  chatLogLines,
  cleanRoomName,
  cleanSpeakerName,
  deriveScenarioFromFilename,
  detectLogSystem,
  formRow,
  isNoiseSpeaker,
  parseChatLog,
  roomClues,
  rowToCells,
  sessionForm,
  sessionRow,
  speakerList,
} from '../../src/tools/session-log/importCcfolia';

const SELF = selfNameSet('阿德');

/** CCFOLIA 舊格式（每則一個 p、三個 span） */
function legacyLog(title: string, lines: [string, string][]): string {
  const ps = lines
    .map(
      ([who, text]) =>
        `<p style="color:#888888;"><span> [main]</span><span>${who}</span> : <span>${text}</span></p>`,
    )
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body>${ps}</body></html>`;
}

/** CCFOLIA 新格式（article.message） */
function v2Log(title: string, lines: [string, string, string, string?][]): string {
  const as = lines
    .map(
      ([who, time, text, roll]) =>
        `<article class="message" data-channel="main"><div class="message-content"><span class="speaker" style="--speaker-color:#ffffff">${who}</span><time datetime="${time}"></time><p class="message-text">${text}</p>${roll ? `<div class="roll-result">${roll}</div>` : ''}</div></article>`,
    )
    .join('\n');
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1 class="log-title">${title}</h1>${as}</body></html>`;
}

const repeat = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

describe('名稱整理', () => {
  it('房間名稱、檔名、發言者', () => {
    expect(cleanRoomName('霧港的燈塔【CoC6】 / KP: 小林')).toBe('霧港的燈塔');
    expect(cleanRoomName('雨夜（新クトゥルフ神話TRPG） 募集中')).toBe('雨夜');
    expect(cleanRoomName('星砂 KP：ゆき')).toBe('星砂');
    expect(deriveScenarioFromFilename('霧港燈塔[all] 第2回.html')).toBe('霧港燈塔');
    expect(deriveScenarioFromFilename('rain_night-day3.txt')).toBe('rain night');
    expect(ccBaseName('霧港燈塔 [log].JSON')).toBe('霧港燈塔');
    expect(cleanSpeakerName('！ 溫書亭（ぬくしょてい）')).toBe('溫書亭');
    expect(isNoiseSpeaker('123')).toBe(true);
    expect(isNoiseSpeaker('【情報】')).toBe(true);
    expect(isNoiseSpeaker('HO1')).toBe(true);
    expect(isNoiseSpeaker('幕間')).toBe(true);
    expect(isNoiseSpeaker('阿德')).toBe(false);
  });

  it('系統：劇本名稱 → 內文的擲骰寫法', () => {
    expect(detectLogSystem('霧港 CoC7', '')).toBe('CoC 7版');
    expect(detectLogSystem('霧港', 'CCB<=50\nCCB<=60\nCC<=40')).toBe('CoC 6版');
    expect(detectLogSystem('霧港', 'CC<=50 CC(1)<=60 ccb<=1')).toBe('CoC 7版');
    expect(detectLogSystem('霧港', 'エモクロアのセッション')).toBe('エモクロア');
    expect(detectLogSystem('霧港', '沒有擲骰')).toBe('');
  });
});

describe('聊天紀錄 → 一場', () => {
  const legacy = legacyLog('霧港的燈塔【CoC6】 / KP: 小林', [
    ['KP', '導入開始'],
    ['KP', '請擲偵查'],
    ['system', '[ 阿德 ] HP : 10 → 9'],
    ...repeat(21, (i): [string, string] => ['米可', `CCB<=60 【目星】 (1D100<=60) > ${i} > 成功`]),
    ...repeat(20, (i): [string, string] => ['阿德', `CCB<=50 (1D100<=50) > ${i} > 成功`]),
    ['路人NPC', '你們好'],
    ['路人NPC', '再見'],
    ['只說一次', '嗨'],
  ]);

  it('CCFOLIA 舊格式：發言者、擲骰次數、系統；沒有時間時用檔案的修改日期', () => {
    const s = parseChatLog({
      name: 'x.html',
      text: legacy,
      mtime: new Date(2026, 3, 5, 12).getTime(),
    });
    expect(s.scenario).toBe('霧港的燈塔');
    expect(s.system).toBe('CoC 6版');
    expect(s.dateList).toEqual([]);
    expect(s.fallbackDate).toBe('2026-04-05');
    expect([...s.speakers.values()].map((x) => [x.name, x.msgCount, x.diceCount])).toEqual([
      ['KP', 2, 0],
      ['米可', 21, 21],
      ['阿德', 20, 20],
      ['路人NPC', 2, 0],
      ['只說一次', 1, 0],
    ]);
  });

  it('發言者清單與自動指定：身分標籤 → KP、NPC 排除、擲骰 20 次以上 → PC', () => {
    const s = parseChatLog({ name: 'x.html', text: legacy, mtime: 0 });
    const list = speakerList(s, SELF);
    expect(list.map((x) => [x.name, x.role])).toEqual([
      ['米可', 'pc'],
      ['阿德', 'pc'],
      ['KP', 'kp'],
      ['路人NPC', ''],
    ]);
    const { form, speakers, detected } = sessionForm(s, SELF);
    /* 「KP」也是內建的自己的名字 → 身分 KP；GM 欄不放身分標籤 */
    expect(form).toEqual({
      scenario: '霧港的燈塔',
      date: '',
      system: 'CoC 6版',
      role: 'KP',
      gm: '',
      players: '',
    });
    expect(formRow(form, speakers, detected)).toEqual({
      scenario: '霧港的燈塔',
      date: '',
      system: 'CoC 6版',
      role: 'KP',
      gm: '',
      players: '',
      pc: '米可 / 阿德',
    });
    /* 表單的劇本清空時退回偵測值；劇本、PC、GM 都沒有時 null */
    expect(formRow({ ...form, scenario: '' }, speakers, detected)?.scenario).toBe('霧港的燈塔');
    expect(
      formRow({ ...form, scenario: '' }, [], { scenario: '', date: '', system: '' }),
    ).toBeNull();
  });

  it('CCFOLIA 新格式：房間名稱、時間戳記（有擲骰的日子）、擲骰結果', () => {
    const html = v2Log('星砂的回聲 [すべて]', [
      ['芙蘭', '2026-03-21T11:00:00Z', '大家好'],
      ['芙蘭', '2026-03-21T11:05:00Z', '2DM<=5', '(2D10<=5) > 3 > 成功'],
      ['阿凱', '2026-03-21T15:30:00Z', '1d100', '1D100 > 42'],
      ['阿凱', '2026-03-22T13:00:00Z', '收尾'],
    ]);
    const { title, lines } = chatLogLines(html);
    expect(title).toBe('星砂的回聲');
    expect(lines[1].text).toBe('2DM<=5\n(2D10<=5) > 3 > 成功');
    /* 時間戳記以本地時間寫進整行文字（找日期用） */
    const t = new Date('2026-03-21T11:05:00Z');
    const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    expect(lines[1].full).toBe(`[${localIsoDate(t)} ${hm}] 芙蘭 : 2DM<=5 (2D10<=5) > 3 > 成功`);
    const s = parseChatLog({ name: 'a.html', text: html, mtime: 0 });
    expect(s.scenario).toBe('星砂的回聲');
    expect(s.dateList).toEqual(['2026-03-21']);
    expect([...s.speakers.values()].map((x) => [x.name, x.msgCount, x.diceCount])).toEqual([
      ['芙蘭', 2, 1],
      ['阿凱', 2, 1],
    ]);
  });

  it('其他平台的文字紀錄：「[時間] 名字：內容」', () => {
    const text = [
      '[2026-05-02 20:00] 小林: 開始',
      '[2026-05-02 20:01] 阿德: 1d100 > 30',
      '[2026-05-03 00:10] 阿德: 2d6 > 7',
      '[2026-05-03 00:20] 小林: 結束',
      'BCDice : (1D100) > 30',
    ].join('\n');
    const s = parseChatLog({ name: '雨夜 第1回.txt', text, mtime: 0 });
    expect(s.scenario).toBe('雨夜');
    expect(s.dateList).toEqual(['2026-05-02', '2026-05-03']);
    expect([...s.speakers.keys()]).toEqual(['小林', '阿德']);
    expect(s.speakers.get('阿德')?.diceCount).toBe(2);
  });
});

describe('房間資料與多個檔案', () => {
  it('CCFOLIA 房間資料（角色是物件）、角色剪貼簿、其他 JSON', () => {
    const room = createRoomData({
      room: createRoom({ name: '霧港的燈塔 / KP: 小林' }),
      characters: {
        c1: createRoomCharacter({ name: '溫書亭', roomId: 'r' }),
        c2: createRoomCharacter({ name: '林小滿', roomId: 'r' }),
      },
    } as never);
    expect(roomClues(JSON.parse(JSON.stringify(room)))).toEqual({
      roomName: '霧港的燈塔 / KP: 小林',
      characters: ['溫書亭', '林小滿'],
    });
    const clip = JSON.stringify({ kind: 'character', data: { name: ' 米可 ' } });
    expect(roomClues(JSON.parse(clip), clip)).toEqual({ roomName: '', characters: ['米可'] });
    expect(
      roomClues({
        kind: 'room',
        data: { name: '舊格式房間' },
        list: [{ characters: [{ name: 'A' }] }],
      }),
    ).toEqual({ roomName: '舊格式房間', characters: ['A'] });
  });

  it('只有房間資料（ZIP）→ 一場：劇本是房間名稱、棋子是 PC', () => {
    const data = createRoomData({
      room: createRoom({ name: '雨夜【CoC】' }),
      characters: { c1: createRoomCharacter({ name: '調查員甲' }) },
    } as never);
    const { bytes } = buildRoomZip(data, []);
    const sessions = analyzeFiles([
      { name: '雨夜.zip', text: '', bytes, mtime: new Date(2026, 0, 2).getTime() },
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].scenario).toBe('雨夜');
    expect(sessions[0].fallbackDate).toBe('2026-01-02');
    const { form, speakers } = sessionForm(sessions[0], SELF);
    expect(speakers.map((s) => [s.name, s.fromJson, s.role])).toEqual([['調查員甲', true, 'pc']]);
    expect(form.role).toBe('');
  });

  it('兩份聊天紀錄 → 兩場；房間資料的棋子套到檔名相同的那一場', () => {
    const a = legacyLog('ccfolia - logs', [
      ['小林', '開始'],
      ['小林', '結束'],
      ['阿德', 'CCB<=50'],
    ]);
    const b = legacyLog('ccfolia - logs', [
      ['阿德', 'CC<=50'],
      ['阿德', 'CC<=60'],
      ['米可', 'CC<=50'],
    ]);
    const roomB = JSON.stringify({ entities: { characters: { x: { name: '溫書亭' } } } });
    const sessions = analyzeFiles([
      { name: '霧港 第1回.html', text: a, mtime: 0 },
      { name: '霧港 第2回.html', text: b, mtime: 0 },
      { name: '霧港 第2回.json', text: roomB, mtime: 0 },
    ]);
    expect(sessions.map((s) => s.scenario)).toEqual(['霧港', '霧港']);
    expect(sessions.map((s) => s.system)).toEqual(['CoC 6版', 'CoC 7版']);
    /* 檔名的主幹：「霧港 第1回」≠「霧港 第2回」，房間資料只套到第二場 */
    expect([...sessions[1].speakers.keys()]).toContain('溫書亭');
    expect([...sessions[0].speakers.keys()]).not.toContain('溫書亭');
    /* 阿德是自己、擲骰不到 20 次 → KP・GM；米可擲骰不到 20 次 → 排除；棋子 → PC */
    const row = sessionRow(sessions[1], SELF);
    expect(row).toEqual({
      date: '',
      scenario: '霧港',
      system: 'CoC 7版',
      role: 'KP',
      gm: '阿德',
      players: '',
      pc: '溫書亭',
    });
    expect(sessionRow(sessions[1], selfNameSet('')).role).toBe('');
    expect(rowToCells({ ...row, date: '2026/1/2, 2026/1/9' }, SELF)).toEqual([
      '2026-01-02, 2026-01-09',
      '霧港',
      'CoC 7版',
      'KP',
      '阿德',
      '',
      '溫書亭',
    ]);
  });
});
