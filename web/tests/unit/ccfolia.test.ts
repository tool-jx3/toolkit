// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  barPartSelector,
  barsAfterSelector,
  CHAT,
  characterUrl,
  characterUrlFrom,
  chatUrlFrom,
  classifyDiceResult,
  classifyImageUrl,
  currentColorAttr,
  DICE_RESULT_CLASS,
  discordDefaultAvatarUrl,
  exampleCharacterUrl,
  exampleChatUrl,
  FILL_ZERO,
  fillBelowSelectors,
  fillStyleAttr,
  fillWidthValue,
  firstResultNumber,
  MESSAGE_BOX,
  messageBoxResultText,
  OBS_SELECTORS,
  parseCharacterId,
  parseDiscordUserId,
  parseRoomId,
  parseStreamkitVoiceUrl,
  resolveCharacterRef,
  roomUrlFrom,
  STREAMKIT,
  streamkitSelector,
  streamkitUserAvatar,
  streamkitUserSpeaking,
  streamkitVoiceUrl,
  systemStatusMessage,
  toCharacterClipboard,
} from '@/ccfolia';

describe('房間網址解析（規格 3.3／3.7／3.8）', () => {
  it('rooms/ 後面的 ID，或整段是 4 字元以上的 ID', () => {
    expect(parseRoomId('https://ccfolia.com/rooms/AbC_d-12xyz')).toBe('AbC_d-12xyz');
    expect(parseRoomId('  AbC_d-12xyz  ')).toBe('AbC_d-12xyz');
    expect(parseRoomId('https://ccfolia.com/rooms/Zz99/chat?x=1')).toBe('Zz99');
    expect(parseRoomId('abc')).toBeNull();
    expect(parseRoomId('hello world')).toBeNull();
    expect(parseRoomId('')).toBeNull();
    expect(parseRoomId(undefined)).toBeNull();
  });

  it('聊天頁網址：去掉 /chat 後面的東西、只貼 ID 也可以', () => {
    expect(chatUrlFrom('https://ccfolia.com/rooms/AbC_d-12xyz')).toBe(
      'https://ccfolia.com/rooms/AbC_d-12xyz/chat',
    );
    expect(chatUrlFrom('AbC_d-12xyz')).toBe('https://ccfolia.com/rooms/AbC_d-12xyz/chat');
    expect(chatUrlFrom('https://ccfolia.com/rooms/Zz99/chat?x=1')).toBe(
      'https://ccfolia.com/rooms/Zz99/chat',
    );
    expect(chatUrlFrom('abc')).toBeNull();
    expect(roomUrlFrom('https://ccfolia.com/rooms/Zz99/chat')).toBe(
      'https://ccfolia.com/rooms/Zz99',
    );
  });

  it('角色 ID 與角色網址：角色欄含房間時以角色欄的房間為準', () => {
    expect(parseCharacterId('https://ccfolia.com/rooms/R1234/characters/C_9876')).toBe('C_9876');
    expect(parseCharacterId('C_9876')).toBe('C_9876');
    expect(parseCharacterId('C9')).toBeNull();
    expect(
      resolveCharacterRef('https://ccfolia.com/rooms/ROOMA/characters/CHAR1', 'ROOMB'),
    ).toEqual({ roomId: 'ROOMA', characterId: 'CHAR1' });
    expect(resolveCharacterRef('CHAR1', 'https://ccfolia.com/rooms/ROOMB')).toEqual({
      roomId: 'ROOMB',
      characterId: 'CHAR1',
    });
    expect(characterUrlFrom('CHAR1', 'ROOMB')).toBe(
      'https://ccfolia.com/rooms/ROOMB/characters/CHAR1',
    );
    expect(characterUrlFrom('CHAR1', '')).toBeNull();
    expect(characterUrlFrom('', 'ROOMB')).toBeNull();
    expect(characterUrl('R', 'C')).toBe('https://ccfolia.com/rooms/R/characters/C');
  });

  it('範例網址（還沒填房間時）', () => {
    expect(exampleCharacterUrl()).toBe('https://ccfolia.com/rooms/{房間ID}/characters/{角色ID}');
    expect(exampleChatUrl('<房間ID>')).toBe('https://ccfolia.com/rooms/<房間ID>/chat');
  });
});

describe('Discord／Streamkit', () => {
  it('使用者 ID 只留數字', () => {
    expect(parseDiscordUserId(' 1234-5678abc9012345678 ')).toBe('123456789012345678');
    expect(parseDiscordUserId('abc')).toBeNull();
  });

  it('語音小工具網址的解析與組合', () => {
    const url = streamkitVoiceUrl('111', '222', { icon: true, text_size: 14 });
    expect(url).toBe('https://streamkit.discord.com/overlay/voice/111/222?icon=true&text_size=14');
    expect(parseStreamkitVoiceUrl(url)).toEqual({
      guildId: '111',
      channelId: '222',
      params: { icon: 'true', text_size: '14' },
    });
    expect(parseStreamkitVoiceUrl('https://example.com/overlay/voice/1/2')).toBeNull();
    expect(parseStreamkitVoiceUrl('not a url')).toBeNull();
  });

  it('圖片網址分類：data、可直接顯示、會過期、其他；格式不對時 valid=false', () => {
    expect(classifyImageUrl('data:image/png;base64,AAAA')).toEqual({ kind: 'data', valid: true });
    expect(classifyImageUrl('https://i.imgur.com/abc.png').kind).toBe('direct');
    expect(classifyImageUrl('https://cdn.discordapp.com/avatars/1/a.png').kind).toBe('direct');
    expect(
      classifyImageUrl('https://cdn.discordapp.com/attachments/1/2/a.png?ex=1&is=2&hm=3').kind,
    ).toBe('expiring');
    expect(classifyImageUrl('https://cdn.discordapp.com/ephemeral-attachments/1/a.png').kind).toBe(
      'expiring',
    );
    expect(classifyImageUrl('https://media.discordapp.net/attachments/1/a.png').kind).toBe(
      'expiring',
    );
    expect(classifyImageUrl('https://example.com/a.png')).toEqual({ kind: 'other', valid: true });
    expect(classifyImageUrl('not a url')).toEqual({ kind: 'other', valid: false });
    expect(classifyImageUrl('ftp://x/a.png').valid).toBe(false);
  });

  it('選擇器只用 class 前綴；以頭像網址的 /avatars/{ID}/ 認人', () => {
    expect(streamkitSelector('avatar')).toBe('[class*="Voice_avatar__"]');
    expect(streamkitUserAvatar('12-34')).toBe(
      'img[class*="Voice_avatar__"][src*="/avatars/1234/"]',
    );
    expect(streamkitUserSpeaking('1234')).toContain('[class*="Voice_avatarSpeaking__"]');
    expect(STREAMKIT.state).toBe('li[class*="Voice_voiceState__"]');
    /* 預設頭像不含 ID */
    expect(discordDefaultAvatarUrl(7)).toBe('https://cdn.discordapp.com/embed/avatars/1.png');
  });
});

describe('擲骰結果（CCFOLIA 的分類）', () => {
  it('成功含スペシャル、失敗含大失敗、沒有成敗是其他', () => {
    expect(classifyDiceResult('(1D100<=50) ＞ 3 ＞ 決定的成功/スペシャル')).toBe('success');
    expect(classifyDiceResult('＞ スペシャル')).toBe('success');
    expect(classifyDiceResult('＞ 23 ＞ 成功')).toBe('success');
    expect(classifyDiceResult('＞ 99 ＞ 致命的失敗')).toBe('failure');
    expect(classifyDiceResult('(2D6) ＞ 7')).toBe('other');
    expect(DICE_RESULT_CLASS).toEqual({
      success: 'css-1l6qhgm',
      failure: 'css-1j13mke',
      other: 'css-ucj12',
    });
  });

  it('訊息框只放最後一段；骰子圖的出目取第一個「＞ 數字」', () => {
    expect(messageBoxResultText('CC<=50 (1D100<=50) ＞ 23 ＞ 成功')).toBe('🎲 ＞ 成功');
    expect(messageBoxResultText('(2D6) ＞ 9')).toBe('🎲 ＞ 9');
    expect(firstResultNumber('(1D100<=50) ＞ 23 ＞ 成功')).toBe(23);
    expect(firstResultNumber('成功')).toBe(50);
    expect(systemStatusMessage('艾琳', 'HP', 12, 10)).toBe('[ 艾琳 ] HP : 12 → 10');
  });
});

describe('角色狀態頁的數值屬性', () => {
  it('填充寬度字串：最多 6 位有效數字，整數不帶小數點', () => {
    expect(fillWidthValue(10, 12)).toBe('83.3333%');
    expect(fillWidthValue(12, 12)).toBe('100%');
    expect(fillWidthValue(0, 12)).toBe('0%');
    expect(fillWidthValue(15, 12)).toBe('100%');
    expect(fillWidthValue(-3, 12)).toBe('0%');
    expect(fillWidthValue(1, 3)).toBe('33.3333%');
    expect(fillWidthValue(1, 12)).toBe('8.33333%');
    expect(fillStyleAttr(1, 2)).toBe('width: 50%;');
    expect(fillWidthValue(5, 0)).toBe('0%');
  });

  it('紅字：≤ 80% 時 secondary', () => {
    expect(currentColorAttr(11, 14)).toBe('secondary');
    expect(currentColorAttr(12, 14)).toBe('default');
    expect(currentColorAttr(8, 10)).toBe('secondary');
  });

  /** 用瀏覽器的選擇器引擎檢查：所有可能的值（0～400 / 400）都與數字比較一致 */
  function matches(threshold: number, inclusive: boolean, value: number, max: number): boolean {
    const el = document.createElement('div');
    el.setAttribute('style', fillStyleAttr(value, max));
    return fillBelowSelectors(threshold, inclusive).some((s) => el.matches(`div${s}`));
  }

  it.each([5, 10, 25, 50, 75, 95, 100])('剩餘比例 < %i%（低於，不含等於）', (t) => {
    for (const max of [3, 7, 12, 14, 100, 400]) {
      for (let v = 0; v <= max; v++) {
        const p = (v / max) * 100;
        const want = Number(p.toPrecision(6)) < t;
        expect(matches(t, false, v, max), `${v}/${max} (${fillWidthValue(v, max)}) < ${t}`).toBe(
          want,
        );
      }
    }
  });

  it('整數門檻 inclusive（≤）；非整數門檻用無條件進位後的「<」', () => {
    expect(matches(25, true, 3, 12)).toBe(true); // 25%
    expect(matches(25, false, 3, 12)).toBe(false);
    expect(matches(25, true, 4, 12)).toBe(false); // 33.3333%
    /* 37.5 → < 38 */
    expect(matches(37.5, true, 3, 8)).toBe(true); // 37.5%
    expect(matches(37.5, false, 375, 1000)).toBe(true);
    expect(matches(37.5, false, 38, 100)).toBe(false);
    expect(fillBelowSelectors(0)).toEqual([]);
    /* 0% 與 0.x% 分得開 */
    const zero = document.createElement('div');
    zero.setAttribute('style', fillStyleAttr(0, 5000));
    expect(zero.matches(`div${FILL_ZERO}`)).toBe(true);
    zero.setAttribute('style', fillStyleAttr(1, 5000));
    expect(zero.matches(`div${FILL_ZERO}`)).toBe(false);
  });

  it('條的選擇器', () => {
    expect(barPartSelector('fill', 2)).toBe(
      'div[variant="bar"] > div:nth-child(2) > div:nth-child(2) > div:nth-child(2)',
    );
    expect(barsAfterSelector(3)).toBe('div[variant="bar"] > div:nth-child(n + 4)');
  });
});

describe('其他', () => {
  it('向下相容：OBS_SELECTORS 與剪貼簿 JSON', () => {
    expect(OBS_SELECTORS.messageBox).toBe(MESSAGE_BOX.root);
    expect(OBS_SELECTORS.chatLog).toBe(CHAT.log);
    expect(JSON.parse(toCharacterClipboard({ name: 'A' }))).toEqual({
      kind: 'character',
      data: { name: 'A' },
    });
  });
});
