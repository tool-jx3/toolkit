// @vitest-environment jsdom
/**
 * G5 共用層：CCFOLIA 聊天日誌（ccfolia/log.ts）。
 * 對照 log-converter 規格 2.1～2.4 與附件 log-converter.examples.json 的樣本日誌、「載入後」的發言者與分頁清單。
 */
import { describe, expect, it } from 'vitest';
import {
  type CcfoliaLog,
  detectLogFormat,
  isAllTabLabel,
  LOG_DEFAULT_CHANNELS,
  logChannelName,
  mergeCcfoliaLogs,
  parseCcfoliaLog,
  parseLegacyLog,
  parseV2Log,
} from '@/ccfolia';
import LC from '../../../docs/refactor/specs/log-converter.examples.json';

const SAMPLES = (LC as unknown as { 樣本日誌: Record<string, string> }).樣本日誌;
interface Case {
  編號: string;
  輸入檔: string[];
  載入後: { 旁白角色選單: string[]; 閒聊分頁選單: string[] };
}
const CASES = (LC as unknown as { 案例: Case[] }).案例;
const caseOf = (id: string) => CASES.find((c) => c.編號 === id)!;

/** log-converter F12 的預設分頁名稱（新版文字） */
const DEFAULT_NAMES = { main: '主要', info: '情報', other: '閒聊' };
const speakersForMenu = (list: string[]) => list.filter((s) => s && s !== 'system');

describe('格式判斷（2.3）', () => {
  it('附件的樣本：舊格式與新格式', () => {
    expect(detectLogFormat(SAMPLES['[小芋、阿和] 霧港燈塔 [main].html'])).toBe('legacy');
    expect(detectLogFormat(SAMPLES['legacy-edge.html'])).toBe('legacy');
    expect(detectLogFormat(SAMPLES['霧港燈塔 [all].html'])).toBe('v2');
    expect(detectLogFormat(SAMPLES['無時間 [zz9].html'])).toBe('v2');
  });

  it('要有 article.message，而且有 data-channel 或 class="message-text"', () => {
    expect(detectLogFormat('<article class="message other">x</article>')).toBe('legacy');
    expect(
      detectLogFormat('<article class="message"><p class="message-text">x</p></article>'),
    ).toBe('v2');
    expect(detectLogFormat('<div data-channel="main" class="message"></div>')).toBe('legacy');
  });

  it('「全部」的分頁標籤（不分大小寫）', () => {
    for (const l of ['すべて', '全て', '전체', '全部', '所有', 'all', 'ALL', ' All ']) {
      expect(isAllTabLabel(l)).toBe(true);
    }
    expect(isAllTabLabel('メイン')).toBe(false);
    expect(isAllTabLabel(null)).toBe(false);
    expect(LOG_DEFAULT_CHANNELS).toEqual(['main', 'info', 'other']);
  });
});

describe('舊格式（2.1、2.4）', () => {
  const log = parseLegacyLog(SAMPLES['[小芋、阿和] 霧港燈塔 [main].html']);

  it('附件 L01：17 則（只有空白的略過）、發言者與分頁依第一次出現', () => {
    expect(log.format).toBe('legacy');
    expect(log.messages).toHaveLength(17);
    expect(speakersForMenu(log.speakers)).toEqual(caseOf('L01').載入後.旁白角色選單);
    expect(log.channels).toEqual(caseOf('L01').載入後.閒聊分頁選單);
    expect(log.speakers).toContain('system');
  });

  it('內容 HTML 照原文（實體保留，所以「cc<=」寫成 &lt;）；text 是純文字', () => {
    const roll = log.messages[4];
    expect(roll).toMatchObject({ channel: 'main', speaker: '林曉雨', system: false, roll: '' });
    expect(roll.html).toBe('CC&lt;=60 【偵查】 (1D100&lt;=60) ＞ 23 ＞ 成功');
    expect(roll.text).toBe('CC<=60 【偵查】 (1D100<=60) ＞ 23 ＞ 成功');
    expect(log.messages[1].html).toBe('<br>你們抵達燈塔下的小屋時，門是半開的。');
    expect(log.messages[1].text).toBe('\n你們抵達燈塔下的小屋時，門是半開的。');
    const amp = log.messages.find((m) => m.text.includes('防水袋'))!;
    expect(amp.html).toContain('&amp;');
    expect(amp.text).toBe('我把日誌收進防水袋 & 背起來。');
    const last = log.messages[16];
    expect(last.html).toBe('「等等，樓上有聲音。」<br>我抬頭看向樓梯。');
    expect(last.text).toBe('「等等，樓上有聲音。」\n我抬頭看向樓梯。');
  });

  it('system 列、段落顏色（第 7 節裁定：讀入當初始值）', () => {
    const sys = log.messages.find((m) => m.system)!;
    expect(sys).toMatchObject({ speaker: 'system', text: '[ 陳志明 ] SAN : 48 → 45' });
    expect(log.messages[0].color).toBe('#888888');
    expect(log.speakerColors).toEqual({
      GM: '#888888',
      林曉雨: '#e91e63',
      陳志明: '#2196f3',
      小芋: '#aaaaaa',
      阿和: '#aaaaaa',
      '蘇菲亞・范德比爾特三世': '#9c27b0',
    });
    expect(log.messages.every((m) => m.time === null && m.avatar === null)).toBe(true);
  });

  it('附件 L24、L26：第一位發言者不是 GM、HTML 標籤保留、繁中分頁名稱', () => {
    const edge = parseCcfoliaLog(SAMPLES['legacy-edge.html']);
    expect(edge.messages).toHaveLength(10);
    expect(speakersForMenu(edge.speakers)).toEqual(caseOf('L24').載入後.旁白角色選單);
    expect(edge.channels).toEqual(caseOf('L24').載入後.閒聊分頁選單);
    expect(edge.messages.find((m) => m.html.includes('<b>'))!.html).toBe(
      '<b>粗體</b> 與 <i>斜體</i>',
    );
    const short = parseCcfoliaLog(SAMPLES['legacy-short.html']);
    expect(speakersForMenu(short.speakers)).toEqual(caseOf('L26').載入後.旁白角色選單);
    expect(short.channels).toEqual(caseOf('L26').載入後.閒聊分頁選單);
  });

  it('段落的 data-image-url、少於 3 個 span 的段落不算', () => {
    const html =
      '<p data-image-url="x.png" style="color: rgb(255, 0, 0)"><span> [main]</span><span>A</span> : <span>hi</span></p>' +
      '<p><span>[main]</span><span>B</span></p>';
    const l = parseLegacyLog(html);
    expect(l.messages).toHaveLength(1);
    expect(l.messages[0]).toMatchObject({ avatar: 'x.png', color: '#ff0000', speaker: 'A' });
  });
});

describe('新格式（2.2、2.4）', () => {
  const all = parseV2Log(SAMPLES['霧港燈塔 [all].html']);

  it('標題：房間名與「全部」標籤；分頁代碼', () => {
    expect(all).toMatchObject({ format: 'v2', roomName: '霧港燈塔', tabLabel: 'すべて' });
    expect(all.channels).toEqual(['main', 'info', 'other', 'Xk3pQ9aZ']);
    expect(all.messages).toHaveLength(15);
    const single = parseV2Log(SAMPLES['霧港燈塔-單分頁.html']);
    expect(single).toMatchObject({ roomName: '霧港燈塔', tabLabel: null, title: '霧港燈塔' });
  });

  it('每則：br 換行、擲骰結果另外一欄、系統列、頭像、時間；空的訊息略過', () => {
    const first = all.messages[0];
    expect(first).toMatchObject({
      channel: 'main',
      speaker: 'GM',
      system: false,
      text: '霧從港口一路漫上來。\n燈塔的光在雲裡轉了一圈又一圈。',
      html: '霧從港口一路漫上來。<br>燈塔的光在雲裡轉了一圈又一圈。',
      roll: '',
      color: '#888888',
      time: '2026-09-27T12:00:00.000Z',
      timeMs: Date.parse('2026-09-27T12:00:00.000Z'),
    });
    expect(first.avatar?.startsWith('data:image/png;base64,')).toBe(true);
    const roll = all.messages[4];
    expect(roll).toMatchObject({ text: 'CC<=60 【偵查】', roll: '(1D100<=60) ＞ 23 ＞ 成功' });
    expect(roll.html).toBe('CC&lt;=60 【偵查】<br>(1D100&lt;=60) ＞ 23 ＞ 成功');
    /* avatar-image-1（林曉雨）與 avatar-image-0（GM）是不同的圖 */
    expect(roll.avatar?.startsWith('data:image/png;base64,')).toBe(true);
    expect(roll.avatar).not.toBe(first.avatar);
    const sys = all.messages[6];
    expect(sys).toMatchObject({
      speaker: 'system',
      system: true,
      text: '',
      roll: '[ 陳志明 ] SAN : 48 → 45',
      html: '[ 陳志明 ] SAN : 48 → 45',
      avatar: null,
      color: null,
    });
    /* 12:07 那則內文是空的 → 略過；下一則沒有時間 */
    expect(all.messages[7]).toMatchObject({
      speaker: '蘇菲亞・范德比爾特三世',
      time: null,
      timeMs: null,
    });
  });

  it('名字顏色取出現最多次的', () => {
    expect(all.speakerColors.林曉雨).toBe('#e91e63');
    expect(all.speakerColors.system).toBeUndefined();
  });
});

describe('多檔合併（2.4）', () => {
  const parse = (names: string[]): CcfoliaLog[] => names.map((n) => parseCcfoliaLog(SAMPLES[n]));

  it('V01：全分頁檔＋各分頁檔 → 只採用全分頁檔；分頁名稱取自單分頁檔的標題', () => {
    const c = caseOf('V01');
    const m = mergeCcfoliaLogs(parse(c.輸入檔), { defaultChannelNames: DEFAULT_NAMES });
    expect(m.sources).toEqual([0]);
    expect(m.droppedCovered).toEqual([1, 2, 3, 4]);
    expect(m.droppedMulti).toEqual([]);
    expect(m.messages).toHaveLength(15);
    expect(m.channels.map((ch) => logChannelName(m, ch))).toEqual(c.載入後.閒聊分頁選單);
    expect(speakersForMenu(m.speakers)).toEqual(c.載入後.旁白角色選單);
    expect(m.roomName).toBe('霧港燈塔');
  });

  it('V05：只有各分頁檔 → 全部採用，依時間排序', () => {
    const c = caseOf('V05');
    const m = mergeCcfoliaLogs(parse(c.輸入檔), { defaultChannelNames: DEFAULT_NAMES });
    expect(m.sources).toEqual([0, 1, 2, 3]);
    expect(m.channels.map((ch) => logChannelName(m, ch))).toEqual(c.載入後.閒聊分頁選單);
    expect(speakersForMenu(m.speakers)).toEqual(c.載入後.旁白角色選單);
    const times = m.messages.map((x) => x.sortMs ?? -1);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('V08：沒有時間的則沿用同檔前一則（開頭用該檔第一個時間），同時間依原順序', () => {
    const c = caseOf('V08');
    const m = mergeCcfoliaLogs(parse(c.輸入檔), { defaultChannelNames: DEFAULT_NAMES });
    expect(m.messages.map((x) => x.text)).toEqual([
      '支線分頁的訊息，時間較早',
      '沒有時間的第一則',
      '第二則',
      '沒有時間的第三則',
    ]);
    expect(m.messages.map((x) => x.source)).toEqual([1, 0, 0, 0]);
    expect(speakersForMenu(m.speakers)).toEqual(c.載入後.旁白角色選單);
    expect(m.channels.map((ch) => logChannelName(m, ch))).toEqual(c.載入後.閒聊分頁選單);
    expect(m.speakerColors).toEqual({ 甲: '#111111', 乙: '#222222', 丙: '#333333' });
  });

  it('V09：只有一個檔、標題沒有分頁 → 預設名稱', () => {
    const c = caseOf('V09');
    const m = mergeCcfoliaLogs(parse(c.輸入檔), { defaultChannelNames: DEFAULT_NAMES });
    expect(m.channels.map((ch) => logChannelName(m, ch))).toEqual(c.載入後.閒聊分頁選單);
    expect(speakersForMenu(m.speakers)).toEqual(c.載入後.旁白角色選單);
  });

  it('V10：兩個全分頁檔只採用則數最多的一個', () => {
    const c = caseOf('V10');
    const v2 = c.輸入檔.filter((n) => detectLogFormat(SAMPLES[n]) === 'v2');
    expect(v2).toHaveLength(2);
    const m = mergeCcfoliaLogs(parse(v2), { defaultChannelNames: DEFAULT_NAMES });
    expect(m.sources).toEqual([0]);
    expect(m.droppedMulti).toEqual([1]);
    expect(m.channels.map((ch) => logChannelName(m, ch))).toEqual(c.載入後.閒聊分頁選單);
  });

  it('代表頭像＝最常用的那張；頭像清單不重複；沒有預設名稱時用代碼本身', () => {
    const m = mergeCcfoliaLogs(parse(['霧港燈塔 [all].html']));
    expect(new Set(m.avatars).size).toBe(m.avatars.length);
    const lin = m.messages.filter((x) => x.speaker === '林曉雨' && x.avatar);
    const count = new Map<string, number>();
    for (const x of lin) count.set(x.avatar!, (count.get(x.avatar!) ?? 0) + 1);
    const best = Math.max(...count.values());
    expect(count.get(m.mainAvatars.林曉雨)).toBe(best);
    expect(m.mainAvatars.system).toBeUndefined();
    expect(logChannelName(m, 'main')).toBe('main');
  });

  it('後面的單分頁檔標籤蓋過前面的；「全部」標籤不算；沒有分頁代碼的檔一律採用', () => {
    const mk = (title: string, channel: string, text: string, time: string): string =>
      `<title>${title}</title><article class="message" data-channel="${channel}"><div class="message-content"><span class="speaker">A</span><time datetime="${time}"></time><p class="message-text">${text}</p></div></article>`;
    const files = [
      mk('房 [甲]', 'c1', '1', '2026-01-01T00:00:01Z'),
      mk('房 [乙]', 'c1', '2', '2026-01-01T00:00:02Z'),
      mk('房 [all]', 'c2', '3', '2026-01-01T00:00:03Z'),
      '<article class="message"><p class="message-text">無分頁</p></article>',
    ].map(parseCcfoliaLog);
    const m = mergeCcfoliaLogs(files);
    expect(m.channelNames).toEqual({ c1: '乙' });
    expect(m.sources).toEqual([0, 2, 3]);
    expect(m.droppedCovered).toEqual([1]);
    /* 沒有時間的檔排最前面 */
    expect(m.messages[0].text).toBe('無分頁');
    expect(m.channels).toEqual(['', 'c1', 'c2']);
  });
});
