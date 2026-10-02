// @vitest-environment jsdom
/**
 * 聊天視窗產生器的預覽資料：範例訊息（主分頁約 8 則、秘匿分頁約 5 則）、測試訊息（每種 2～4 則輪流、時間每則往後一分鐘）、
 * 自訂測試訊息的種類決定擲骰結果的配色 class（模擬頁的 outcome）。
 */
import { describe, expect, it } from 'vitest';
import { CHAT, classifyDiceResult, DICE_RESULT_CLASS } from '@/ccfolia';
import { createChatScene } from '@/ccfolia/mock';
import {
  customMessage,
  exampleCount,
  nextTime,
  SPEAKER_IDS,
  sampleMessages,
  sampleTabs,
  TEST_KINDS,
  testMessage,
  timeAt,
} from '@/tools/chat-window/samples';

describe('範例訊息（F74）', () => {
  it('主分頁 8 則、秘匿分頁 5 則，涵蓋聊天、成功、失敗、無成敗、系統訊息、特殊成功', () => {
    const main = sampleMessages('main');
    const secret = sampleMessages('secret');
    expect(main).toHaveLength(8);
    expect(secret).toHaveLength(5);
    const kinds = (list: typeof main) =>
      list.map((m) =>
        !m.speaker
          ? 'system'
          : m.secretOther
            ? 'secret'
            : m.result
              ? classifyDiceResult(m.result)
              : 'chat',
      );
    expect(new Set(kinds(main))).toEqual(
      new Set(['chat', 'success', 'failure', 'other', 'system', 'secret']),
    );
    expect(main.some((m) => m.result?.includes('スペシャル'))).toBe(true);
    expect(new Set(kinds(secret))).toEqual(new Set(['chat', 'success', 'other', 'system']));
    expect(main.map((m) => m.time)).toEqual(main.map((_, i) => timeAt(i)));
    const tabs = sampleTabs();
    expect(tabs[0].name).toBe(CHAT.mainTabName);
    expect(tabs[1]).toMatchObject({ secret: true });
    expect(tabs[1].participants?.length).toBe(3);
  });
});

describe('測試訊息（F78、F79）', () => {
  it('七種，每種 2～4 則範例輪流使用；時間每則往後一分鐘', () => {
    expect(TEST_KINDS).toEqual(['chat', 'success', 'failure', 'other', 'secret', 'long', 'system']);
    for (const k of TEST_KINDS) {
      expect(exampleCount(k)).toBeGreaterThanOrEqual(2);
      expect(exampleCount(k)).toBeLessThanOrEqual(4);
      const a = testMessage(k, 0, 'x');
      const b = testMessage(k, 1, 'x');
      const again = testMessage(k, exampleCount(k), 'x');
      expect(a.id).not.toBe(b.id);
      expect({ ...again, id: '' }).toEqual({ ...a, id: '' });
    }
    expect(testMessage('success', 0, 'x').result).toContain('成功');
    expect(classifyDiceResult(testMessage('failure', 1, 'x').result ?? '')).toBe('failure');
    expect(testMessage('other', 0, 'x').result).not.toMatch(/成功|失敗/);
    expect(testMessage('secret', 0, 'x').secretOther).toBe(true);
    expect(testMessage('system', 0, 'x').speaker).toBeNull();
    expect(testMessage('long', 0, 'x').text.split('\n').length).toBeGreaterThanOrEqual(6);
    expect(nextTime(sampleMessages('main'))).toBe(timeAt(8));
    expect(timeAt(8)).toBe(' - 今日 21:08');
    expect(timeAt(61)).toBe(' - 今日 22:01');
  });

  it('自訂測試訊息：種類決定配色；聊天時「|」後面也當內文', () => {
    expect(SPEAKER_IDS.length).toBeGreaterThanOrEqual(3);
    const chat = customMessage('qing', 'chat', '你好', '世界', 't');
    expect(chat).toMatchObject({ text: '你好 | 世界', time: 't' });
    expect(chat.result).toBeUndefined();
    const fail = customMessage('kp', 'failure', 'CC<=30', '(1D100<=30) ＞ 77', 't');
    expect(fail).toMatchObject({ text: 'CC<=30', result: '(1D100<=30) ＞ 77', outcome: 'failure' });

    /* 模擬頁：outcome 優先於結果文字的判斷 */
    const doc = document.implementation.createHTMLDocument('t');
    const scene = createChatScene({ tabs: [{ name: 'メイン', messages: [fail] }] });
    scene.mount(doc);
    const log = doc.querySelector(CHAT.log) as HTMLElement;
    log.getBoundingClientRect = () => ({ height: 300 }) as DOMRect;
    scene.refresh();
    const res = doc.querySelector(CHAT.result)!;
    expect(res.classList.contains(DICE_RESULT_CLASS.failure)).toBe(true);
  });
});
