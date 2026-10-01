// @vitest-environment jsdom
/**
 * 模擬頁的 DOM 結構要符合規格 3.1 的外部事實：用 ccfolia/dom.ts 的選擇器去選，數量、屬性、文字都要對。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  barPartSelector,
  barSelector,
  barsAfterSelector,
  CHARACTER_PAGE,
  CHAT,
  DICE_RESULT_CLASS,
  MESSAGE_BOX,
  STREAMKIT,
  streamkitSelector,
  streamkitUserAvatar,
  streamkitUserSpeaking,
} from '@/ccfolia';
import {
  createCharacterScene,
  createChatScene,
  createRoomScene,
  createStreamkitScene,
  mockPortrait,
} from '@/ccfolia/mock';

/** 模擬 OBS：head 裡先放工具的自訂 CSS，再掛場景 */
function freshDoc(): Document {
  document.head.replaceChildren();
  const user = document.createElement('style');
  user.id = 'tk-user-css';
  document.head.append(user);
  document.body.replaceChildren();
  return document;
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];

describe('角色狀態頁', () => {
  it('階層、class、屬性與 3.1.2 相同', () => {
    const doc = freshDoc();
    const scene = createCharacterScene({
      statuses: [
        { label: 'HP', value: 10, max: 12 },
        { label: 'MP', value: 11, max: 14 },
        { label: 'SAN', value: 0, max: 60 },
      ],
      initiative: 12,
      snackbar: '已連線',
    });
    scene.mount(doc);
    /* CCFOLIA 的樣式在自訂 CSS 之後 */
    expect(doc.head.firstElementChild?.id).toBe('tk-user-css');
    expect(doc.head.lastElementChild?.getAttribute('data-mock')).toBe('ccfolia-character');
    expect($$(CHARACTER_PAGE.wrapper)).toHaveLength(1);
    expect($$(CHARACTER_PAGE.row)).toHaveLength(1);
    expect($(CHARACTER_PAGE.avatar)?.className).toContain('MuiAvatar-circular');
    expect($(CHARACTER_PAGE.avatarMiddle)?.className).not.toContain('Mui');
    expect($(CHARACTER_PAGE.avatarImg)?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect($(CHARACTER_PAGE.badge)?.textContent).toBe('12');
    expect($(CHARACTER_PAGE.column)?.firstElementChild?.getAttribute('variant')).toBe('bar');
    expect($$(barSelector())).toHaveLength(3);
    expect($(barPartSelector('label', 2))?.textContent).toBe('MP');
    const value = $(barPartSelector('value', 2))!;
    expect(value.childNodes).toHaveLength(3);
    expect(value.childNodes[1].textContent).toBe('/');
    expect(value.textContent).toBe('11/14');
    expect($(barPartSelector('current', 1))?.getAttribute('color')).toBe('default');
    expect($(barPartSelector('current', 2))?.getAttribute('color')).toBe('secondary');
    expect($(barPartSelector('fill', 1))?.getAttribute('style')).toBe('width: 83.3333%;');
    expect($(barPartSelector('fill', 3))?.getAttribute('style')).toBe('width: 0%;');
    expect($(barPartSelector('trough', 1))?.getAttribute('style')).toBeNull();
    /* 通知列在 #root 裡，但不會被「第一個 div」選到 */
    expect($(CHARACTER_PAGE.snackbar)?.textContent).toBe('已連線');
    expect($(CHARACTER_PAGE.snackbar)?.matches(CHARACTER_PAGE.wrapper)).toBe(false);
    /* 除了 MUI class 與 variant 以外只有假的雜湊 class */
    for (const el of $$('#root *'))
      for (const c of el.classList)
        expect(c.startsWith('Mui') || c.startsWith('css-tk'), c).toBe(true);
  });

  it('改數值時元素不重建，只改文字與屬性；先攻 0 時徽章加 MuiBadge-invisible；可增減條數', () => {
    const doc = freshDoc();
    const scene = createCharacterScene();
    scene.mount(doc);
    const fill = $(barPartSelector('fill', 1));
    scene.update({
      statuses: [
        { label: 'HP', value: 3, max: 12 },
        { label: 'MP', value: 8, max: 14 },
        { label: 'SAN', value: 48, max: 60 },
        { label: '幸運', value: 50, max: 99 },
        { label: '護甲', value: 2, max: 2 },
      ],
      initiative: 0,
    });
    expect($(barPartSelector('fill', 1))).toBe(fill);
    expect(fill?.getAttribute('style')).toBe('width: 25%;');
    expect($$(barSelector())).toHaveLength(5);
    expect($$(barsAfterSelector(3))).toHaveLength(2);
    expect($(CHARACTER_PAGE.badge)?.classList.contains(CHARACTER_PAGE.badgeInvisibleClass)).toBe(
      true,
    );
    scene.update({ statuses: [{ label: 'HP', value: 1, max: 1 }] });
    expect($$(barSelector())).toHaveLength(1);
  });
});

describe('房間訊息框', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('結構、逐字打出（每字 80 ms，「。」後停 800 ms）、打完 1.2 秒換下一則、最後一則留著', () => {
    const doc = freshDoc();
    const phases: string[] = [];
    const scene = createRoomScene({ onPhaseChange: (p) => phases.push(p) });
    scene.mount(doc);
    expect($(MESSAGE_BOX.root)).toBeNull();
    scene.send({
      name: '艾琳',
      text: '好。走吧',
      portrait: mockPortrait('full'),
      result: '(1D100<=50) ＞ 23 ＞ 成功',
      dice: [
        { faces: 10, value: 20 },
        { faces: 10, value: 3 },
      ],
    });
    scene.send({ name: '主持人', text: '下一則' });
    const root = $(MESSAGE_BOX.root)!;
    for (const [k, v] of Object.entries(MESSAGE_BOX.rootAttributes))
      expect(root.getAttribute(k)).toBe(v);
    expect(root.className).toContain('MuiPaper-elevation6');
    expect(root.firstElementChild?.tagName).toBe('IMG');
    expect($(MESSAGE_BOX.portrait)).toBe(root.firstElementChild);
    expect($$(MESSAGE_BOX.diceImg)).toHaveLength(2);
    expect($(MESSAGE_BOX.name)?.textContent).toBe('艾琳');
    const result = $(MESSAGE_BOX.result)!;
    expect(result.textContent).toBe('🎲 ＞ 成功');
    expect(result.classList.contains(DICE_RESULT_CLASS.success)).toBe(true);
    expect($(MESSAGE_BOX.skipButton)).not.toBeNull();
    expect($(MESSAGE_BOX.closeButton)).not.toBeNull();
    expect($(MESSAGE_BOX.body)?.lastElementChild?.className).toContain('MuiTypography-body1');
    const text = () => $(MESSAGE_BOX.text)?.textContent;
    expect(text()).toBe('');
    vi.advanceTimersByTime(80);
    expect(text()).toBe('好');
    vi.advanceTimersByTime(80);
    expect(text()).toBe('好。');
    vi.advanceTimersByTime(700);
    expect(text()).toBe('好。');
    vi.advanceTimersByTime(100);
    expect(text()).toBe('好。走');
    vi.advanceTimersByTime(80);
    expect(text()).toBe('好。走吧');
    expect(scene.phase).toBe('waiting');
    vi.advanceTimersByTime(1199);
    expect($(MESSAGE_BOX.name)?.textContent).toBe('艾琳');
    vi.advanceTimersByTime(1);
    /* 換下一則：沒有立繪、沒有結果、沒有骰子 */
    expect($(MESSAGE_BOX.name)?.textContent).toBe('主持人');
    expect($(MESSAGE_BOX.portrait)).toBeNull();
    expect($(MESSAGE_BOX.result)).toBeNull();
    expect($$(MESSAGE_BOX.diceImg)).toHaveLength(0);
    expect($(MESSAGE_BOX.root)).toBe(root);
    vi.advanceTimersByTime(80 * 3 + 1200);
    expect(scene.phase).toBe('shown');
    expect(text()).toBe('下一則');
    expect(phases).toContain('typing');
  });

  it('關閉：滑出後在 style 寫入 visibility: hidden；下一則發言時清掉再出現', () => {
    const doc = freshDoc();
    const scene = createRoomScene();
    scene.mount(doc);
    scene.send({ name: 'A', text: 'x' });
    const root = $(MESSAGE_BOX.root)!;
    expect(root.getAttribute('style')).toContain('transition: transform 225ms');
    vi.advanceTimersByTime(2000);
    scene.close();
    expect(root.getAttribute('style')).toContain('195ms');
    expect(root.matches(MESSAGE_BOX.closedRoot)).toBe(false);
    vi.advanceTimersByTime(195);
    expect(root.matches(MESSAGE_BOX.closedRoot)).toBe(true);
    scene.send({ name: 'B', text: 'y' });
    expect(root.matches(MESSAGE_BOX.closedRoot)).toBe(false);
    expect($(MESSAGE_BOX.name)?.textContent).toBe('B');
  });

  it('秘密骰：內文換掉、沒有骰子圖與結果；立即模式；重新開始會移除訊息框', () => {
    const doc = freshDoc();
    const scene = createRoomScene({ instant: true });
    scene.mount(doc);
    scene.send({
      name: 'A',
      text: '偷偷擲',
      result: '＞ 成功',
      dice: [{ faces: 6, value: 3 }],
      secret: true,
    });
    expect($(MESSAGE_BOX.text)?.textContent).toBe('シークレットダイス');
    expect($(MESSAGE_BOX.result)).toBeNull();
    expect($$(MESSAGE_BOX.diceImg)).toHaveLength(0);
    expect($(MESSAGE_BOX.root)?.getAttribute('style')).toBeNull();
    scene.reset();
    expect($(MESSAGE_BOX.root)).toBeNull();
    expect(scene.phase).toBe('empty');
  });
});

describe('聊天另開視窗', () => {
  const tabs = [
    {
      name: 'メイン',
      messages: [
        { id: 'a', speaker: { name: '艾琳', color: '#ff8800' }, text: '你好' },
        {
          id: 'b',
          speaker: { name: '凱', color: '#2299ff' },
          text: 'CC<=50',
          result: '(1D100<=50) ＞ 23 ＞ 成功',
        },
        { id: 'c', speaker: null, text: '[ 艾琳 ] HP : 12 → 10' },
        { id: 'd', speaker: { name: '主持人' }, text: '', secretOther: true, edited: true },
      ],
    },
    {
      name: '密談',
      secret: true,
      participants: [
        { name: '艾琳', avatar: null },
        { name: '凱', avatar: null },
      ],
      messages: [{ id: 'e', speaker: { name: '凱' }, text: '悄悄話', own: true }],
    },
  ];

  it('清單高度為 0 時不算繪任何訊息；有高度後才算繪', () => {
    const doc = freshDoc();
    const scene = createChatScene({ tabs });
    scene.mount(doc);
    expect($$(CHAT.item)).toHaveLength(0);
    expect($(CHAT.virtualOuter)?.style.height).toBe('0px');
    const log = $(CHAT.log)!;
    log.getBoundingClientRect = () =>
      ({
        height: 300,
        width: 300,
        top: 0,
        left: 0,
        right: 300,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON() {},
      }) as DOMRect;
    scene.refresh();
    expect($$(CHAT.item)).toHaveLength(4);
    expect($$(CHAT.item).map((e) => e.getAttribute('data-index'))).toEqual(['0', '1', '2', '3']);
  });

  it('階層、系統訊息、擲骰結果、秘密擲骰、分頁與參加者列', () => {
    const doc = freshDoc();
    const scene = createChatScene({ tabs, snackbar: '已重新連線' });
    scene.mount(doc);
    const log = $(CHAT.log)!;
    log.getBoundingClientRect = () => ({ height: 300 }) as DOMRect;
    scene.refresh();
    expect($$(CHAT.titleToolbar)).toHaveLength(1);
    expect($(CHAT.titleText)?.textContent).toBe('ルームチャット');
    expect($$(CHAT.titleButtons)).toHaveLength(2);
    expect($(CHAT.participantsToolbar)).toBeNull();
    expect($(CHAT.virtualInner)?.getAttribute('style')).toContain('position: absolute');
    const items = $$(CHAT.item);
    const [chat, dice, system, secret] = items;
    expect(chat.querySelector(CHAT.name)?.getAttribute('style')).toBe('color: #ff8800;');
    expect(chat.querySelector(CHAT.time)?.textContent).toMatch(/^ - 今日 \d\d:\d\d$/);
    expect(chat.querySelector(CHAT.avatarImg)).not.toBeNull();
    expect(chat.querySelector(CHAT.body)?.getAttribute('style')).toBe(
      'word-break: break-all; white-space: pre-wrap;',
    );
    const res = dice.querySelector(CHAT.result)!;
    expect(res.textContent).toBe(' (1D100<=50) ＞ 23 ＞ 成功');
    expect(res.classList.contains(DICE_RESULT_CLASS.success)).toBe(true);
    /* 系統訊息：頭像欄是空 div、名稱 span 是空的、沒有行內顏色 */
    const sysAvatar = system.querySelector(CHAT.avatarColumn)!;
    expect(sysAvatar.children).toHaveLength(1);
    expect(sysAvatar.firstElementChild?.childNodes).toHaveLength(0);
    expect(system.querySelector(CHAT.name)?.textContent).toBe('');
    expect(system.querySelector(CHAT.name)?.hasAttribute('style')).toBe(false);
    expect(secret.querySelector(CHAT.body)?.textContent).toBe('Secret dice 🎲[編集済]');
    expect(secret.querySelector(CHAT.result)).toBeNull();
    expect(secret.querySelector(CHAT.edited)?.textContent).toBe('[編集済]');
    expect(items.every((it) => it.querySelector(CHAT.divider))).toBe(true);
    /* 分頁：主分頁 role=tab、其他 role=button；被選的有 Mui-selected */
    const tabButtons = $$(CHAT.tab);
    expect(tabButtons[0].getAttribute('role')).toBe('tab');
    expect(tabButtons[1].getAttribute('role')).toBe('button');
    expect($$(CHAT.selectedTab)).toHaveLength(1);
    expect($(CHAT.snackbar)?.textContent).toBe('已重新連線');
    /* 切到有參加者的秘匿分頁 */
    scene.selectTab(1);
    scene.refresh();
    expect($$(CHAT.participantsToolbar)).toHaveLength(1);
    expect($$(CHAT.participantAvatar).map((a) => a.textContent)).toEqual(['艾', '凱']);
    expect($(CHAT.avatarGroup)?.getAttribute('role')).toBe('group');
    expect($(CHAT.selectedTab)?.querySelector(CHAT.tabLockBox)?.textContent).toBe('密談');
    expect($(CHAT.selectedTab)?.getAttribute('role')).toBe('button');
    expect($$(CHAT.item)).toHaveLength(1);
    expect($(CHAT.editButton)).not.toBeNull();
    /* 新增訊息 */
    scene.addMessage({ speaker: { name: '艾琳' }, text: '收到' });
    scene.refresh();
    expect($$(CHAT.item)).toHaveLength(2);
  });
});

describe('Streamkit 語音疊加層', () => {
  it('class 前綴、說話中的 class、以頭像網址認人、不在頻道就不在 DOM', () => {
    const doc = freshDoc();
    const scene = createStreamkitScene({
      users: [
        { id: '123456789012345678', name: '艾琳', speaking: true },
        { id: '223456789012345678', name: '凱' },
        { id: '323456789012345678', name: '沒頭像', customAvatar: false },
        { id: '423456789012345678', name: '離線', inChannel: false },
      ],
    });
    scene.mount(doc);
    expect($$(STREAMKIT.container)).toHaveLength(1);
    expect($$(STREAMKIT.states)).toHaveLength(1);
    expect($$(STREAMKIT.state)).toHaveLength(3);
    expect($$(STREAMKIT.avatar)).toHaveLength(3);
    expect($$(STREAMKIT.name).map((n) => n.textContent)).toEqual(['艾琳', '凱', '沒頭像']);
    expect($$(streamkitSelector('speaking'))).toHaveLength(1);
    expect($(streamkitUserSpeaking('123456789012345678'))).not.toBeNull();
    expect($(streamkitUserSpeaking('223456789012345678'))).toBeNull();
    expect($(streamkitUserAvatar('223456789012345678'))).not.toBeNull();
    /* 沒有自訂頭像：網址不含 ID，認不出來 */
    expect($(streamkitUserAvatar('323456789012345678'))).toBeNull();
    expect($(streamkitUserAvatar('423456789012345678'))).toBeNull();
    /* 雜湊是假的：完整 class 名不是只有前綴 */
    expect($(STREAMKIT.avatar)?.className).toMatch(/^Voice_avatar__\w+/);
    scene.setUser('223456789012345678', { speaking: true });
    expect($(streamkitUserSpeaking('223456789012345678'))).not.toBeNull();
    scene.setUser('123456789012345678', { inChannel: false });
    expect($$(STREAMKIT.state)).toHaveLength(2);
  });
});
