// @vitest-environment jsdom
/**
 * 產生的 CSS 與模擬房間畫面（@/ccfolia/mock）的對應：每條規則的選擇器都選得到該選的元素、
 * 「其他元素看不見」不會選到訊息框、關閉後根元素不再被設成可見；換範例立繪不重新打字（RoomScene.updateMessages）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MESSAGE_BOX as M } from '@/ccfolia';
import { createRoomScene, type MockRoomMessage, mockPortrait } from '@/ccfolia/mock';
import { buildMessageBoxCss, resultSelector } from '@/tools/message-box/css';
import { DEFAULT_SETTINGS } from '@/tools/message-box/settings';

function freshDoc(): Document {
  document.head.replaceChildren();
  const user = document.createElement('style');
  user.id = 'tk-user-css';
  document.head.append(user);
  document.body.replaceChildren();
  return document;
}

const MSG: MockRoomMessage = {
  name: '伊凡',
  text: 'CC<=65 【聆聽】',
  portrait: mockPortrait('full', 1),
  result: '(1D100<=65) ＞ 18 ＞ 成功',
  dice: [
    { faces: 10, value: 10 },
    { faces: 10, value: 8 },
  ],
};

/** CSS 裡的一般選擇器（不含偽元素、:hover、:has） */
function plainSelectors(css: string): string[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import url\("[^"]*"\);/g, '');
  const out: string[] = [];
  for (const m of body.matchAll(/([^{}]+)\{/g))
    for (const sel of m[1].split(',\n').map((s) => s.trim()))
      if (sel && !/::|:hover|:has\(/.test(sel)) out.push(sel);
  return out;
}

describe('CSS 的選擇器對應到模擬房間畫面', () => {
  beforeEach(() => freshDoc());

  it('每條規則都選得到元素（立繪、骰子圖、名稱、結果、按鈕、內文都在）', () => {
    const scene = createRoomScene({ instant: true });
    scene.mount(document);
    scene.send(MSG);
    const css = buildMessageBoxCss({ ...DEFAULT_SETTINGS, buttons: 'always', resultPos: 'end' });
    for (const sel of plainSelectors(css)) {
      /* 結果配色的三條規則各自只對應一種結果（下一個測試） */
      if (sel === 'html' || sel === 'body' || sel.includes('.css-')) continue;
      expect(document.querySelectorAll(sel).length, sel).toBeGreaterThan(0);
    }
    expect(document.querySelectorAll(M.diceImg)).toHaveLength(2);
    expect(document.querySelectorAll(M.buttons)).toHaveLength(2);
  });

  it('結果配色的規則依成功、失敗、其他各自選到結果', async () => {
    const scene = createRoomScene({ instant: true });
    scene.mount(document);
    for (const [outcome, result] of [
      ['success', '(1D100<=65) ＞ 5 ＞ 決定的成功/スペシャル'],
      ['failure', '(1D100<=65) ＞ 99 ＞ 致命的失敗'],
      ['other', '(2D6) ＞ 7[3,4] ＞ 7'],
    ] as const) {
      scene.send({ ...MSG, result });
      /* 立即模式下也要等「打完 → 下一則」的計時（0 ms）走完 */
      await new Promise((r) => setTimeout(r, 5));
      expect(document.querySelector(resultSelector(outcome)), outcome).not.toBeNull();
      for (const o of ['success', 'failure', 'other'] as const)
        if (o !== outcome) expect(document.querySelector(resultSelector(o))).toBeNull();
    }
  });

  it('「其他元素看不見」選得到盤面與聊天欄，選不到訊息框與它的子孫', () => {
    const scene = createRoomScene({ instant: true });
    scene.mount(document);
    scene.send(MSG);
    const hidden = new Set(document.querySelectorAll(`body *:not(:is(${M.root}, ${M.root} *))`));
    const root = document.querySelector(M.root)!;
    expect(hidden.has(root)).toBe(false);
    for (const el of root.querySelectorAll('*')) expect(hidden.has(el)).toBe(false);
    expect(hidden.has(document.querySelector('header')!)).toBe(true);
    expect(hidden.has(document.querySelector('.MuiDrawer-paper')!)).toBe(true);
  });

  it('關閉後 CCFOLIA 寫進 style 的 visibility: hidden 保持有效：根元素不再被設成可見', () => {
    const scene = createRoomScene({ instant: true });
    scene.mount(document);
    scene.send(MSG);
    const open = `${M.root}:not([style*="visibility: hidden"]):not([style*="visibility:hidden"])`;
    expect(buildMessageBoxCss(DEFAULT_SETTINGS)).toContain(`${open} {`);
    expect(document.querySelector(open)).not.toBeNull();
    scene.close();
    expect(document.querySelector(M.root)!.getAttribute('style')).toContain('visibility: hidden');
    expect(document.querySelector(open)).toBeNull();
    /* 下一則發言時再出現 */
    scene.send({ ...MSG, text: '下一則' });
    expect(document.querySelector(open)).not.toBeNull();
  });
});

describe('RoomScene.updateMessages（換範例立繪）', () => {
  beforeEach(() => freshDoc());

  it('目前這則立即換立繪，不重新打字；排隊中的也一起換', () => {
    const scene = createRoomScene();
    scene.mount(document);
    scene.send(MSG);
    scene.send({ ...MSG, text: '排隊中' });
    const img = () => document.querySelector(M.portrait) as HTMLImageElement;
    expect(img().getAttribute('src')).toBe(MSG.portrait);
    const typedBefore = document.querySelector(M.text)!.textContent;
    scene.updateMessages((m) => ({ ...m, portrait: 'data:image/png;base64,AAAA' }));
    expect(img().getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(document.querySelector(M.text)!.textContent).toBe(typedBefore);
    expect(scene.message?.portrait).toBe('data:image/png;base64,AAAA');
    /* 回傳同一個物件＝不變 */
    const cur = scene.message;
    scene.updateMessages((m) => m);
    expect(scene.message).toBe(cur);
    scene.dispose();
  });

  it('沒有立繪的訊息換成有立繪時，立繪成為第一個子元素', () => {
    const scene = createRoomScene({ instant: true });
    scene.mount(document);
    scene.send({ ...MSG, portrait: null });
    expect(document.querySelector(M.portrait)).toBeNull();
    scene.updateMessages((m) => ({ ...m, portrait: mockPortrait('half', 0) }));
    expect(document.querySelector(M.root)!.firstElementChild?.tagName).toBe('IMG');
  });
});
