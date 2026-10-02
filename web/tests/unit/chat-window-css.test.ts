/**
 * 聊天視窗產生器的 CSS 產生：每個選項對輸出的影響、跳脫、開頭說明、字型載入、OBS 31 的退路。
 * （套用後的畫面另由 e2e 在模擬頁上檢查）
 */
import { describe, expect, it } from 'vitest';
import { CHAT, DICE_RESULT_CLASS } from '@/ccfolia';
import {
  bracketThickness,
  bubbleTailTop,
  buildChatCss,
  dividerOffset,
  enterKeyframes,
  fadeDelay,
  obsFeatures,
  roundedAvatarRadius,
} from '@/tools/chat-window/css';
import type { ChatSettings } from '@/tools/chat-window/settings';
import { getTemplate, initialSettings, TEMPLATES } from '@/tools/chat-window/templates';

const base = (patch: Partial<ChatSettings> = {}): ChatSettings => ({
  ...initialSettings(),
  ...patch,
});
const css = (patch: Partial<ChatSettings> = {}, templateName?: string | null) =>
  buildChatCss(base(patch), { templateName });

/** 某個選擇器（完全相同）的所有宣告區塊（接在一起） */
function block(text: string, selector: string): string {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const i = text.indexOf(`${selector} {`, from);
    if (i < 0) break;
    /* 前面必須是行首（不是更長選擇器的一部分） */
    if (i === 0 || text[i - 1] === '\n' || text[i - 1] === ' ') {
      const j = text.indexOf('}', i);
      out.push(text.slice(i, j + 1));
      from = j;
    } else from = i + 1;
  }
  return out.join('\n');
}

/** 開頭說明註解 */
const header = (text: string) => text.slice(0, text.indexOf('*/') + 2);

const ITEM = CHAT.item;

describe('整體', () => {
  it('每個範本都產生語法完整的 CSS（大括號成對、註解沒有提早結束）', () => {
    for (const t of TEMPLATES) {
      const text = buildChatCss({ ...initialSettings(), ...t.data }, { templateName: t.name });
      const open = (text.match(/\{/g) ?? []).length;
      const close = (text.match(/\}/g) ?? []).length;
      expect(open, t.id).toBe(close);
      expect((text.match(/\/\*/g) ?? []).length).toBe((text.match(/\*\//g) ?? []).length);
    }
  });

  it('頁面透明、沒有捲軸、去掉外圍留白、不顯示通知條與輸入區（3.4.1）', () => {
    const t = css();
    expect(block(t, 'html,\nbody')).toContain('background: transparent !important');
    expect(block(t, 'html,\nbody')).toContain('overflow: hidden !important');
    expect(block(t, CHAT.wrapper)).toContain('padding: 0 !important');
    expect(block(t, CHAT.snackbar)).toContain('display: none !important');
    expect(t).toContain(`${CHAT.form} > :not(header) {`);
    expect(t).toMatch(
      /\.MuiListItemText-root \+ div,[\s\S]*?\.MuiTypography-caption,[\s\S]*?display: none/,
    );
  });

  it('會被動畫改動的屬性不加 !important（進場、消失、捲動、閃一下才不會失效）', () => {
    const t = css({ enter: 'blur', fade: true, scroll: true, count: 1, resultFlash: true });
    for (const prop of ['opacity', 'transform', 'filter', 'max-height', 'margin-top']) {
      const bad = new RegExp(`\\n\\s+${prop}: [^;]*!important;`, 'g');
      const hits = [...t.matchAll(bad)].map((m) => m[0].trim());
      /* 例外：虛擬捲動內層的 transform: none、系統訊息內文的 opacity、視窗的 max-height（都不是動畫元素） */
      expect(
        hits.filter((h) => !/transform: none|opacity: 0\.75|max-height: none/.test(h)),
        prop,
      ).toEqual([]);
    }
  });
});

describe('開頭說明（F02、F85、3.4.13）', () => {
  it('寫明工具名稱、範本、網址、來源大小；說明裡的使用者輸入不會提早結束註解', () => {
    let h = header(css({}, '夜色聊天窗'));
    expect(h).toContain('聊天視窗產生器');
    expect(h).toContain('以範本「夜色聊天窗」為基礎');
    expect(h).toContain('https://ccfolia.com/rooms/<房間ID>/chat');
    expect(h).toContain('/chat 結尾');
    expect(h).toContain('寬 480 × 高 460');
    h = header(css({ room: 'https://ccfolia.com/rooms/AbC_d-12xyz', width: 640, height: 240 }));
    expect(h).toContain('https://ccfolia.com/rooms/AbC_d-12xyz/chat');
    expect(h).toContain('寬 640 × 高 240');
    expect(h).not.toContain('以範本');
    h = header(css({}, '壞*/範本'));
    expect(h).toContain('壞* /範本');
    expect(h.match(/\*\//g)).toHaveLength(1);
  });

  it('需要 OBS 31 的功能與長訊息捲動的提醒、切換分頁的方法', () => {
    expect(header(css())).not.toContain('OBS 31');
    expect(header(css({ diceOnly: true }))).toContain('需要 OBS 31 以上：只列出擲骰訊息');
    expect(header(css({ hideSystem: true }))).toContain('隱藏系統訊息');
    expect(header(css({ diceOnly: true, hideSystem: true }))).not.toContain('隱藏系統訊息');
    expect(header(css({ accent: 'outcome' }))).toContain('依擲骰成敗上色');
    expect(header(css({ outcomeGlow: true, boxShape: 'card' }))).toContain('成敗時外框發光');
    expect(header(css({ outcomeGlow: true, boxShape: 'none' }))).not.toContain('外框發光');
    expect(header(css({ scroll: true, count: 1 }))).toContain('長訊息慢慢捲動需要 OBS 31');
    expect(header(css({ scroll: true, count: 3 }))).not.toContain('長訊息慢慢捲動');
    expect(header(css())).toContain('右鍵選「互動」');
    expect(obsFeatures(base({ diceOnly: true, accent: 'outcome' }))).toEqual([
      '只列出擲骰訊息',
      '依擲骰成敗上色的左側線條',
    ]);
  });

  it('電腦字型：列出用到的名稱（不重複），不載入', () => {
    const local = { source: 'local' as const, family: '源樣黑體', weight: 700 };
    const t = css({ bodyFont: local, resultFont: local, nameFont: { ...local, family: 'Meiryo' } });
    expect(header(t)).toContain('電腦字型：源樣黑體、Meiryo');
    expect(t).not.toContain('family=%E6');
  });
});

describe('字型（F81、F82、3.4.13、3.5）', () => {
  it('每套 Google 字型一條、只載入用到的字重（換成實有的、由小到大、同字型合併）', () => {
    const t = css({
      titleMode: 'none',
      bodyFont: { source: 'google', family: 'Klee One', weight: 700 },
      resultFont: { source: 'google', family: 'Klee One', weight: 400 },
      nameFont: { source: 'google', family: 'Zen Maru Gothic', weight: 600 },
    });
    const imports = t.match(/@import url\("([^"]+)"\);/g) ?? [];
    expect(imports).toHaveLength(2);
    expect(imports[0]).toContain('family=Klee+One:wght@400;600');
    expect(imports[1]).toContain('family=Zen+Maru+Gothic:wght@500');
    /* 字重換成實有的（距離相同取較細的） */
    expect(t).toMatch(/font-weight: 600 !important/);
  });

  it('名稱不顯示時不載入名稱字型；標題不顯示且沒有參加者前綴時不載入標題字型', () => {
    const t = css({
      name: false,
      titleMode: 'none',
      nameFont: { source: 'google', family: 'Orbitron', weight: 700 },
      titleFont: { source: 'google', family: 'Cinzel', weight: 700 },
    });
    expect(t).not.toContain('Orbitron');
    expect(t).not.toContain('Cinzel');
    const t2 = css({
      titleMode: 'none',
      participants: true,
      participantPrefix: '參加者',
      titleFont: { source: 'google', family: 'Cinzel', weight: 700 },
    });
    expect(t2).toContain('family=Cinzel');
  });

  it('字型名稱：指定字型 → 後備 → 通用字族；自行輸入的名稱會清理', () => {
    const t = css({ bodyFont: { source: 'local', family: 'Evil"; } body{', weight: 400 } });
    const b = block(t, `${CHAT.listItem} > .MuiListItemText-root > .MuiListItemText-secondary`);
    expect(b).toContain('font-family: "Evil body", "Microsoft JhengHei"');
    expect(b).toMatch(/sans-serif !important/);
  });
});

describe('要顯示的訊息（F03～F07、3.4.3）', () => {
  it('則數：隱藏較舊的訊息', () => {
    expect(css({ count: 7 })).toContain(`${ITEM}:not(:nth-last-child(-n + 7)) {`);
  });

  it('只列擲骰：從有結果的訊息中取最新 N 則；舊 OBS 退回最新 N 則', () => {
    const t = css({ diceOnly: true, count: 3 });
    expect(t).toContain(
      `${ITEM}:not(:nth-last-child(-n + 3 of :has(${CHAT.result}))) {\n  display: none !important;`,
    );
    expect(t).toMatch(
      /@supports not \(selector\(:has\(a\)\) and selector\(:nth-child\(1 of a\)\)\) \{\s+ul\.MuiList-root\[role="log"\] div\[data-index\]:not\(:nth-last-child\(-n \+ 3\)\)/,
    );
  });

  it('隱藏系統訊息：只在沒有只列擲骰時作用', () => {
    expect(css({ hideSystem: true, count: 4 })).toContain(
      ':nth-last-child(-n + 4 of :not(:has(.MuiListItemAvatar-root > div:empty)))',
    );
    expect(css({ hideSystem: true, diceOnly: true })).not.toContain('div:empty)))');
  });

  it('排列順序：最新在下（切上方）／最新在上（反向、切下方）；間距', () => {
    const bottom = css({ order: 'newest-bottom', gap: 9 });
    expect(block(bottom, CHAT.log)).toContain('justify-content: flex-end');
    expect(block(bottom, CHAT.virtualInner)).toContain('flex-direction: column !important');
    expect(block(bottom, CHAT.virtualInner)).toContain('gap: 9px');
    const top = css({ order: 'newest-top' });
    expect(block(top, CHAT.log)).toContain('justify-content: flex-start');
    expect(block(top, CHAT.virtualInner)).toContain('column-reverse');
  });

  it('清單：至少 1px 高、不保留捲動位置的裁切；虛擬捲動的位移不影響排列', () => {
    const t = css();
    expect(block(t, CHAT.log)).toContain('min-height: 1px');
    expect(block(t, CHAT.log)).toContain('overflow: clip');
    expect(block(t, CHAT.virtualInner)).toContain('transform: none !important');
    expect(block(t, CHAT.virtualInner)).toContain('position: static');
    expect(block(t, CHAT.virtualOuter)).toContain('height: auto');
  });

  it('不夠填滿時擠到靠齊的一邊', () => {
    expect(block(css({ anchor: 'bottom' }), CHAT.virtualOuter)).toContain('margin: auto 0 0');
    expect(block(css({ anchor: 'top' }), CHAT.virtualOuter)).toContain('margin: 0 0 auto');
  });
});

describe('視窗（F10～F19、3.4.2）', () => {
  it('填滿來源／隨內容伸縮；靠下／靠上；外側留白', () => {
    let b = block(css({ sizeMode: 'fill', margin: 14 }), CHAT.paper);
    expect(b).toContain('top: 14px');
    expect(b).toContain('bottom: 14px');
    expect(b).toContain('left: 14px');
    expect(b).toContain('max-height: none');
    b = block(css({ sizeMode: 'fit', anchor: 'bottom', margin: 10 }), CHAT.paper);
    expect(b).toContain('top: auto');
    expect(b).toContain('bottom: 10px');
    expect(b).toContain('max-height: calc(100% - 20px)');
    b = block(css({ sizeMode: 'fit', anchor: 'top', margin: 20 }), CHAT.paper);
    expect(b).toContain('top: 20px');
    expect(b).toContain('bottom: auto');
    expect(block(css({ sizeMode: 'fill' }), CHAT.log)).toContain('flex: 1 1 0');
    expect(block(css({ sizeMode: 'fit' }), CHAT.log)).toContain('flex: 0 1 auto');
  });

  it('長訊息捲動生效時一律填滿', () => {
    const b = block(css({ sizeMode: 'fit', scroll: true, count: 1, margin: 8 }), CHAT.paper);
    expect(b).toContain('top: 8px');
    expect(b).toContain('bottom: 8px');
  });

  it('內側留白、背景、外框、圓角、陰影', () => {
    const b = block(
      css({
        padding: 16,
        bg: '#10203080',
        borderWidth: 3,
        borderColor: '#ff000080',
        radius: 22,
        shadow: 35,
      }),
      CHAT.paper,
    );
    expect(b).toContain('padding: 16px');
    expect(b).toContain('background-color: rgba(16, 32, 48, 0.502)');
    expect(b).toContain('border: 3px solid rgba(255, 0, 0, 0.502)');
    expect(b).toContain('border-radius: 22px');
    expect(b).toContain('box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35)');
    const none = block(css({ borderWidth: 0, shadow: 0 }), CHAT.paper);
    expect(none).toContain('border: none');
    expect(none).toContain('box-shadow: none');
  });

  it('視窗內預設文字色＝內文顏色', () => {
    expect(block(css({ bodyColor: '#abcdef' }), CHAT.paper)).toContain('color: #abcdef');
  });

  it('質感：紙張、顆粒在內容之下；掃描線蓋在內容之上', () => {
    expect(block(css({ texture: 'paper' }), CHAT.paper)).toContain('radial-gradient');
    expect(block(css({ texture: 'grain' }), CHAT.paper)).toContain('data:image/svg+xml');
    const s = css({ texture: 'scanlines' });
    expect(block(s, CHAT.paper)).toContain('background-image: none');
    expect(block(s, `${CHAT.paper}::before`)).toContain('repeating-linear-gradient');
    expect(block(s, `${CHAT.paper}::before`)).toContain('pointer-events: none');
    expect(css({ texture: 'none' })).not.toContain(`${CHAT.paper}::before`);
  });

  it('四角括號：粗細 max(2, 外框＋1)、貼在外框內側、蓋在內容之上', () => {
    expect(bracketThickness(0)).toBe(2);
    expect(bracketThickness(1)).toBe(2);
    expect(bracketThickness(4)).toBe(5);
    const b = block(
      css({ brackets: true, borderWidth: 3, bracketColor: '#00ff00' }),
      `${CHAT.paper}::after`,
    );
    expect(b).toContain('inset: 0');
    expect(b).toContain('18px 4px no-repeat');
    expect(b).toContain('#00ff00');
    expect(css({ brackets: false })).not.toContain(`${CHAT.paper}::after`);
  });
});

describe('標題（F20～F31、3.4.9）', () => {
  it('不顯示：標頭整個隱藏（沒有參加者頭像時）', () => {
    const t = css({ titleMode: 'none', participants: false });
    expect(block(t, CHAT.header)).toContain('display: none');
    expect(block(t, CHAT.inputPaper)).toContain('display: none');
  });

  it('自訂文字：標頭列換成使用者的文字（跳脫引號、反斜線、換行）', () => {
    const t = css({ titleMode: 'text', titleText: '他說"嗨"\\\n第二行', titleSize: 20 });
    expect(block(t, `${CHAT.titleText}::before`)).toContain('content: "他說\\"嗨\\"\\\\ 第二行"');
    expect(block(t, `${CHAT.titleText}::before`)).toContain('font-size: 20px');
    expect(block(t, `${CHAT.titleText}::before`)).toContain('text-overflow: ellipsis');
    expect(t).toContain(`${CHAT.titleToolbar} > button,`);
  });

  it('分頁名稱：輸入區移到最上方，只留被選的分頁；滑鼠在頁面上時恢復成分頁列', () => {
    const t = css({ titleMode: 'tab', hoverTabs: true, titleLock: false });
    expect(block(t, `html:not(:hover) ${CHAT.inputPaper}`)).toContain('order: -1');
    expect(t).toContain(':not(.Mui-selected) {');
    expect(t).toContain(`html:hover ${CHAT.inputPaper} {`);
    expect(t).toMatch(/\.MuiBox-root > svg \{\s+display: none/);
    const off = css({ titleMode: 'tab', hoverTabs: false });
    expect(off).not.toContain('html:hover');
    expect(block(off, CHAT.inputPaper)).toContain('order: -1');
  });

  it('分頁名稱的標題清掉輸入區 form 自帶的半透明背景（F20）', () => {
    for (const titleMode of ['tab', 'text-tab'] as const) {
      expect(block(css({ titleMode, hoverTabs: true }), `html:not(:hover) ${CHAT.form}`)).toContain(
        'background: none !important',
      );
      expect(block(css({ titleMode, hoverTabs: false }), CHAT.form)).toContain(
        'background: none !important',
      );
    }
    /* 不含分頁名稱時整個輸入區不顯示，不必清 */
    expect(css({ titleMode: 'text', hoverTabs: false })).not.toContain(`${CHAT.form} {`);
  });

  it('滑鼠移上時的分頁列：在視窗頂端、只有視窗寬（F86）', () => {
    const hover = block(
      css({ titleMode: 'none', hoverTabs: true }),
      `html:hover ${CHAT.inputPaper}`,
    );
    expect(hover).toContain('position: absolute');
    expect(hover).not.toContain('position: fixed');
    expect(hover).toContain('top: 0');
    expect(hover).toContain('left: 0');
    expect(hover).toContain('right: 0');
    /* 視窗（固定定位）就是它的定位基準 */
    expect(block(css({ titleMode: 'none', hoverTabs: true }), CHAT.paper)).toContain(
      'position: fixed',
    );
  });

  it('自訂文字＋分頁名稱：文字緊接在分頁名稱前', () => {
    const t = css({ titleMode: 'text-tab', titleText: '密談：' });
    expect(t).toMatch(/\.Mui-selected::before \{\s+content: "密談："/);
  });

  it('樣式：底色帶、下底線、頁籤（自動選字色）、左右延伸線', () => {
    const band = css({
      titleMode: 'text',
      titleStyle: 'band',
      padding: 12,
      titleBandColor: '#ff000080',
    });
    expect(block(band, CHAT.titleToolbar)).toContain('margin: -12px -12px 0');
    expect(block(band, CHAT.titleToolbar)).toContain('padding: 0.45em 12px');
    expect(block(band, CHAT.titleToolbar)).toContain('rgba(255, 0, 0, 0.502)');
    const ul = css({ titleMode: 'text', titleStyle: 'underline', titleLineColor: '#00ff00' });
    expect(block(ul, CHAT.titleToolbar)).toContain('border-bottom: 2px solid #00ff00');
    const tab = css({ titleMode: 'text', titleStyle: 'tab', titleLineColor: '#ffee00' });
    expect(block(tab, `${CHAT.titleText}::before`)).toContain('color: #15161a');
    expect(block(tab, `${CHAT.titleText}::before`)).toContain('border-radius: 0.4em 0.4em 0 0');
    const tabDark = css({ titleMode: 'text', titleStyle: 'tab', titleLineColor: '#202060' });
    expect(block(tabDark, `${CHAT.titleText}::before`)).toContain('color: #ffffff');
    const lines = css({ titleMode: 'text', titleStyle: 'lines', titleAlign: 'left' });
    expect(lines).toContain(`${CHAT.titleToolbar}::before,`);
    expect(block(lines, CHAT.titleToolbar)).toContain('justify-content: center');
  });

  it('對齊、下方間距', () => {
    const t = css({ titleMode: 'text', titleAlign: 'right', titleGap: 13 });
    expect(block(t, CHAT.titleToolbar)).toContain('justify-content: flex-end');
    expect(block(t, CHAT.titleToolbar)).toContain('margin-bottom: 13px');
  });
});

describe('參加者頭像（F32～F37、3.4.10）', () => {
  it('不顯示：那一列隱藏', () => {
    expect(
      block(css({ participants: false, titleMode: 'text' }), CHAT.participantsToolbar),
    ).toContain('display: none');
  });

  it('前綴、大小、間隔、外圈；在標題下方間隔 6px', () => {
    const t = css({
      titleMode: 'text',
      titleGap: 10,
      participants: true,
      participantPrefix: '參加者"',
      participantPrefixSize: 15,
      participantSize: 30,
      participantGap: -8,
      participantRing: 3,
      participantRingColor: '#ff0000',
    });
    expect(block(t, CHAT.participantsToolbar)).toContain('margin: -4px 0 10px');
    expect(block(t, `${CHAT.participantsToolbar}::before`)).toContain('content: "參加者\\""');
    expect(block(t, `${CHAT.participantsToolbar}::before`)).toContain('font-size: 15px');
    const av = block(t, CHAT.participantAvatar);
    expect(av).toContain('width: 30px');
    expect(av).toContain('border: 3px solid #ff0000');
    expect(av).toContain('margin: 0 0 0 -8px');
    expect(av).toContain('font-size: 14px');
    expect(css({ participants: true, participantPrefix: '' })).not.toContain(
      `${CHAT.participantsToolbar}::before`,
    );
    expect(
      block(css({ titleMode: 'none', participants: true, titleGap: 7 }), CHAT.participantsToolbar),
    ).toContain('margin: 0 0 7px');
  });

  it('分頁名稱的標題到頭像列間隔 8px（F32）', () => {
    for (const titleMode of ['tab', 'text-tab'] as const) {
      expect(
        block(css({ titleMode, titleGap: 10, participants: true }), CHAT.participantsToolbar),
      ).toContain('margin: -2px 0 10px');
    }
  });

  it('自訂文字＋下底線＋頭像：底線畫在頭像列下方（F32）', () => {
    const t = css({
      titleMode: 'text',
      titleStyle: 'underline',
      titleLineColor: '#00ff00',
      titleSize: 20,
      titleGap: 10,
      participants: true,
    });
    const head = block(t, CHAT.header);
    expect(head).toContain('border-bottom: 2px solid #00ff00');
    expect(head).toContain('padding-bottom: 0.3em');
    expect(head).toContain('font-size: 20px');
    expect(head).toContain('margin-bottom: 10px');
    const row = block(t, CHAT.titleToolbar);
    expect(row).toContain('border-bottom: 0');
    expect(row).toContain('padding-bottom: 0');
    expect(block(t, CHAT.participantsToolbar)).toContain('margin: -4px 0 0');
    /* 沒有頭像時底線照舊緊貼標題 */
    const solo = css({ titleMode: 'text', titleStyle: 'underline', participants: false });
    expect(block(solo, CHAT.titleToolbar)).toContain('border-bottom: 2px solid');
    expect(block(solo, CHAT.header)).not.toContain('border-bottom');
  });
});

describe('方框、頭像、名稱（F38～F56、3.4.4～3.4.6）', () => {
  const LI = `${ITEM} > .MuiListItem-root`;
  const TXT = `${LI} > .MuiListItemText-root`;
  const NAME = `${TXT} > .MuiListItemText-primary`;

  it('每一框：背景、外框、圓角、陰影、內側留白（含左側線條）', () => {
    const b = block(
      css({
        boxShape: 'card',
        boxBg: '#ffffff20',
        boxBorderWidth: 2,
        boxBorderColor: '#00ff00',
        boxRadius: 9,
        boxShadow: 40,
        boxPadX: 14,
        boxPadY: 9,
        accent: 'none',
      }),
      LI,
    );
    expect(b).toContain('padding: 9px 14px 9px 14px');
    expect(b).toContain('border: 2px solid #00ff00');
    expect(b).toContain('border-radius: 9px');
    expect(b).toContain('box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4)');
    const withLine = block(
      css({ boxShape: 'card', boxPadX: 14, accent: 'custom', accentWidth: 4 }),
      LI,
    );
    expect(withLine).toContain(
      `padding: ${initialSettings().boxPadY}px 14px ${initialSettings().boxPadY}px 18px`,
    );
  });

  it('對話泡泡：框只包住文字欄、尾巴位置', () => {
    expect(bubbleTailTop(40)).toBe(13);
    expect(bubbleTailTop(60)).toBe(14);
    expect(bubbleTailTop(26)).toBe(8);
    expect(bubbleTailTop(16)).toBe(8);
    const t = css({ boxShape: 'bubble', avatarSize: 40, boxBorderWidth: 0 });
    expect(block(t, TXT)).toContain('background-color');
    expect(block(t, `${TXT}::after`)).toContain('top: 13px');
    expect(block(t, `${TXT}::after`)).toContain('width: 7px');
  });

  it('無框：沒有背景；有左側線條時左留白多 6px', () => {
    const b = block(
      css({ boxShape: 'none', boxPadX: 5, boxPadY: 3, accent: 'custom', accentWidth: 2 }),
      LI,
    );
    expect(b).toContain('background: none');
    expect(b).toContain('padding: 3px 5px 3px 13px');
  });

  it('左側線條：角色色用名稱的行內顏色、指定色、依成敗（OBS 31）', () => {
    expect(block(css({ accent: 'character' }), `${NAME}::before`)).toContain(
      'background: currentColor',
    );
    expect(block(css({ accent: 'custom', accentColor: '#123456' }), `${NAME}::before`)).toContain(
      'background: #123456',
    );
    const t = css({ accent: 'outcome', successColor: '#00ff00' });
    expect(t).toContain(
      `${ITEM}:has(${CHAT.result}.${DICE_RESULT_CLASS.success}) > .MuiListItem-root > .MuiListItemText-root > .MuiListItemText-primary::before {\n  background: #00ff00`,
    );
    expect(css({ accent: 'none' })).not.toContain(`${NAME}::before`);
    /* 系統訊息沒有行內顏色：線條用內文顏色（不加 important，行內的角色色優先） */
    expect(block(css({ bodyColor: '#eeeeee' }), NAME)).toContain('color: #eeeeee;');
  });

  it('成敗時外框發光（每則一框、泡泡；無框時沒有）', () => {
    const t = css({ boxShape: 'card', outcomeGlow: true, failureColor: '#ff0000', boxShadow: 0 });
    expect(t).toContain(
      `${ITEM}:has(${CHAT.result}.${DICE_RESULT_CLASS.failure}) > .MuiListItem-root {\n  border-color: #ff0000 !important;\n  box-shadow: 0 0 12px #ff0000`,
    );
    expect(css({ boxShape: 'none', outcomeGlow: true })).not.toContain('0 0 12px');
  });

  it('成敗發光取代方框陰影，不疊加（F46）', () => {
    for (const boxShape of ['card', 'bubble'] as const) {
      const t = css({ boxShape, outcomeGlow: true, successColor: '#00ff00', boxShadow: 100 });
      const sel =
        boxShape === 'card'
          ? `${ITEM}:has(${CHAT.result}.${DICE_RESULT_CLASS.success}) > .MuiListItem-root`
          : `${ITEM}:has(${CHAT.result}.${DICE_RESULT_CLASS.success}) > .MuiListItem-root > .MuiListItemText-root`;
      const glow = block(t, sel);
      expect(glow, boxShape).toContain('box-shadow: 0 0 12px #00ff00 !important');
      expect(glow, boxShape).not.toContain('0 2px 10px');
    }
  });

  it('長訊息捲動時左側線條仍貼在方框左緣（F71）', () => {
    const scroll = { scroll: true, count: 1 } as const;
    const card = block(
      css({
        ...scroll,
        boxShape: 'card',
        accent: 'character',
        accentWidth: 4,
        boxPadX: 14,
        boxPadY: 9,
        avatar: true,
        avatarSize: 50,
        avatarGap: 10,
      }),
      `${NAME}::before`,
    );
    /* 文字欄左緣離方框內緣＝左右留白 14＋線條 4＋頭像 50＋間距 10 */
    expect(card).toContain('left: -78px');
    expect(card).toContain('top: -9px');
    expect(card).toContain('bottom: -100cqh');
    const noAvatar = block(
      css({
        ...scroll,
        boxShape: 'card',
        accent: 'custom',
        accentWidth: 3,
        boxPadX: 12,
        avatar: false,
      }),
      `${NAME}::before`,
    );
    expect(noAvatar).toContain('left: -15px');
    const none = block(
      css({
        ...scroll,
        boxShape: 'none',
        accent: 'custom',
        accentWidth: 3,
        boxPadX: 12,
        avatar: false,
      }),
      `${NAME}::before`,
    );
    expect(none).toContain('left: -21px');
    /* 對話泡泡：線條跟著泡泡；沒有捲動時照原本貼在方框左緣 */
    expect(
      block(css({ ...scroll, boxShape: 'bubble', accent: 'custom' }), `${NAME}::before`),
    ).not.toContain('100cqh');
    const still = block(css({ boxShape: 'card', accent: 'custom' }), `${NAME}::before`);
    expect(still).toContain('left: 0');
    expect(still).not.toContain('100cqh');
  });

  it('分隔線：相鄰兩則之間（最新在下時最新那則、最新在上時最舊那則不畫）', () => {
    expect(dividerOffset(9)).toBe(4.5);
    expect(dividerOffset(2)).toBe(2);
    const b = css({ divider: true, boxPadY: 10, order: 'newest-bottom' });
    expect(block(b, `${ITEM} > hr.MuiDivider-root`)).toContain('margin: 5px 0 0');
    expect(b).toContain(`${ITEM}:last-child > hr.MuiDivider-root {`);
    const t = css({ divider: true, order: 'newest-top', count: 4 });
    expect(t).toContain(`${ITEM}:nth-last-child(4) > hr.MuiDivider-root,`);
    expect(t).toContain(`${ITEM}:first-child > hr.MuiDivider-root {`);
    expect(css({ divider: true, diceOnly: true })).toContain(
      `:nth-last-child(1 of :has(${CHAT.result})) > hr.MuiDivider-root`,
    );
    expect(block(css({ divider: false }), `${ITEM} > hr.MuiDivider-root`)).toContain(
      'display: none',
    );
  });

  it('頭像：不顯示時不佔位置；大小、形狀、外框、間距、垂直對齊', () => {
    const AV = `${LI} > .MuiListItemAvatar-root`;
    expect(block(css({ avatar: false }), AV)).toContain('display: none');
    expect(roundedAvatarRadius(50)).toBe(9);
    const t = css({
      avatarSize: 50,
      avatarShape: 'rounded',
      avatarBorder: 2,
      avatarBorderColor: '#ffffff',
      avatarGap: 7,
      avatarAlign: 'center',
    });
    expect(block(t, `${AV} > div`)).toContain('border-radius: 9px');
    expect(block(t, `${AV} > div`)).toContain('border: 2px solid #ffffff');
    expect(block(t, AV)).toContain('margin: 0 7px 0 0');
    expect(block(t, AV)).toContain('align-self: center');
    expect(block(t, `${AV} img`)).toContain('object-position: center top');
    expect(block(css({ avatarShape: 'circle' }), `${AV} > div`)).toContain('border-radius: 50%');
    /* 長訊息捲動時一律上緣 */
    expect(block(css({ avatarAlign: 'center', scroll: true, count: 1 }), AV)).toContain(
      'align-self: flex-start',
    );
    expect(block(css(), `${AV} > div:empty`)).toContain('height: 0');
  });

  it('名稱：不顯示時不佔高度但保留元素；樣式、顏色、時間', () => {
    expect(block(css({ name: false }), NAME)).toContain('height: 0');
    const ul = block(
      css({ nameStyle: 'underline', nameColorMode: 'custom', nameColor: '#00ff00' }),
      NAME,
    );
    expect(ul).toContain('border-bottom: 2px solid currentColor');
    expect(ul).toContain('-webkit-text-fill-color: #00ff00');
    const pill = block(css({ nameStyle: 'pill', nameColorMode: 'character' }), NAME);
    expect(pill).toContain('background-color: currentColor');
    expect(pill).toContain('-webkit-text-fill-color: #15161a');
    expect(pill).toContain('text-shadow: none');
    const prefix = css({ nameStyle: 'prefix', time: true });
    expect(block(prefix, NAME)).toContain('display: inline');
    expect(block(prefix, `${NAME}::after`)).toContain('content: "："');
    expect(block(prefix, `${NAME} > .MuiTypography-caption`)).toContain('display: none');
    const time = block(
      css({ time: true, timeColor: '#ff000080' }),
      `${NAME} > .MuiTypography-caption`,
    );
    expect(time).toContain('font-size: 0.78em');
    expect(time).toContain('rgba(255, 0, 0, 0.502)');
    expect(block(css({ time: false }), `${NAME} > .MuiTypography-caption`)).toContain(
      'display: none',
    );
    const n = block(css({ nameSize: 19, nameGap: 4 }), NAME);
    expect(n).toContain('font-size: 19px');
    expect(n).toContain('margin: 0 0 4px');
    expect(n).toContain('text-overflow: ellipsis');
  });
});

describe('內文與擲骰結果（F57～F68、3.4.7、3.4.8）', () => {
  const BODY = `${ITEM} > .MuiListItem-root > .MuiListItemText-root > .MuiListItemText-secondary`;
  const RES = `${BODY} > .MuiTypography-body2`;

  it('內文：字型、大小、顏色、行高、字距、保留換行', () => {
    const b = block(
      css({ bodySize: 18, bodyColor: '#010203', lineHeight: 1.75, letterSpacing: 0.05 }),
      BODY,
    );
    expect(b).toContain('font-size: 18px');
    expect(b).toContain('color: #010203');
    expect(b).toContain('line-height: 1.75');
    expect(b).toContain('letter-spacing: 0.05em');
    expect(b).toContain('white-space: pre-wrap');
  });

  it('文字效果同時套用到名稱與擲骰結果', () => {
    const t = css({ effect: 'glow', effectColor: '#ff0000' });
    const glow = '0 0 4px #ff0000, 0 0 10px #ff0000, 0 0 18px #ff0000';
    for (const sel of [
      BODY,
      RES,
      `${ITEM} > .MuiListItem-root > .MuiListItemText-root > .MuiListItemText-primary`,
    ])
      expect(block(t, sel)).toContain(`text-shadow: ${glow}`);
    const stroke = block(css({ effect: 'stroke', effectWidth: 1 }), BODY);
    expect((stroke.match(/0 rgba|0 #/g) ?? []).length).toBe(8);
    expect(block(css({ effect: 'none' }), BODY)).toContain('text-shadow: none');
  });

  it('長訊息截斷：1～10 行截斷；0 不截斷；名稱前綴時無效', () => {
    expect(block(css({ clampLines: 3 }), BODY)).toContain('-webkit-line-clamp: 3');
    expect(block(css({ clampLines: 0 }), BODY)).not.toContain('line-clamp');
    expect(block(css({ clampLines: 3, nameStyle: 'prefix' }), BODY)).not.toContain('line-clamp');
  });

  it('擲骰結果：字型、樣式、換行、三色、發光', () => {
    const r = block(css({ resultSize: 21, resultBreak: true, resultStyle: 'outline' }), RES);
    expect(r).toContain('font-size: 21px');
    expect(r).toContain('display: block');
    expect(r).toContain('width: fit-content');
    expect(r).toContain('word-break: keep-all');
    expect(r).toContain('padding: 0.05em 0.55em 0.08em 0.3em');
    const inline = block(css({ resultBreak: false, resultStyle: 'outline' }), RES);
    expect(inline).toContain('display: inline');
    expect(inline).toContain('margin-left: 0.2em');
    const t = css({ resultStyle: 'outline', successColor: '#00ff00', resultGlow: true });
    const ok = block(t, `${RES}.${DICE_RESULT_CLASS.success}`);
    expect(ok).toContain('color: #00ff00');
    expect(ok).toContain('border: 1.5px solid #00ff00');
    expect(ok).toContain('rgba(0, 255, 0, 0.12)');
    expect(ok).toContain('0 0 6px rgba(0, 255, 0, 0.85), 0 0 14px rgba(0, 255, 0, 0.5)');
    expect(block(t, `${RES}.${DICE_RESULT_CLASS.other}`)).not.toContain('0 0 6px');
    const solid = css({ resultStyle: 'solid', successColor: '#ffff00', failureColor: '#200020' });
    expect(block(solid, `${RES}.${DICE_RESULT_CLASS.success}`)).toContain('color: #15161a');
    expect(block(solid, `${RES}.${DICE_RESULT_CLASS.failure}`)).toContain('color: #ffffff');
  });

  it('實心色塊＋成敗發光：色塊不發光（F67）', () => {
    const t = css({ resultStyle: 'solid', resultGlow: true, successColor: '#00ff00' });
    for (const o of ['success', 'failure', 'other'] as const) {
      const b = block(t, `${RES}.${DICE_RESULT_CLASS[o]}`);
      expect(b, o).toContain('box-shadow: none');
      expect(b, o).not.toContain('0 0 6px');
    }
  });

  it('出現瞬間閃一下：亮度 2.2 倍 → 原本，1.4 秒、先快後慢', () => {
    const t = css({ resultFlash: true });
    expect(t).toMatch(/@keyframes tk-chat-flash \{\s+from \{\s+filter: brightness\(2\.2\);/);
    expect(t).toContain('animation: tk-chat-flash 1.4s ease-out both');
    expect(css({ resultFlash: false })).not.toContain('tk-chat-flash');
  });
});

describe('動態（F70～F72、3.4.12）', () => {
  it('八種進場：起點與時長', () => {
    expect(enterKeyframes('none')).toBeNull();
    expect(enterKeyframes('fade')).toEqual({ from: { opacity: 0 }, to: { opacity: 1 } });
    expect(enterKeyframes('up')?.from).toEqual({ opacity: 0, transform: 'translateY(18px)' });
    expect(enterKeyframes('down')?.from.transform).toBe('translateY(-18px)');
    expect(enterKeyframes('left')?.from.transform).toBe('translateX(40px)');
    expect(enterKeyframes('right')?.from.transform).toBe('translateX(-40px)');
    expect(enterKeyframes('pop')?.['60%']).toMatchObject({ transform: 'scale(1.05)', opacity: 1 });
    expect(enterKeyframes('blur')?.from).toEqual({ opacity: 0, filter: 'blur(8px)' });
    expect(css({ enter: 'fade', enterDuration: 0.65 })).toContain(
      'animation: tk-chat-in 0.65s ease-out both',
    );
    expect(css({ enter: 'none' })).not.toContain('tk-chat-in');
  });

  it('消失：停留後淡出再收起；捲動時從捲完才開始計時', () => {
    const s = base({ fade: true, fadeStay: 5, fadeDuration: 1.2, gap: 8 });
    expect(fadeDelay(s)).toBe(5);
    expect(fadeDelay({ ...s, scroll: true, count: 1, scrollDelay: 2, scrollDuration: 10 })).toBe(
      17,
    );
    expect(fadeDelay({ ...s, scroll: true, count: 2, scrollDelay: 2, scrollDuration: 10 })).toBe(5);
    const t = buildChatCss(s);
    expect(t).toContain('tk-chat-out 1.2s linear 5s forwards');
    expect(t).toMatch(/75% \{\s+opacity: 0;/);
    expect(t).toMatch(/100% \{\s+opacity: 0;\s+max-height: 0;\s+margin-top: -8px;/);
    expect(buildChatCss({ ...s, order: 'newest-top' })).toContain('margin-bottom: -8px');
  });

  it('長訊息捲動：只在則數 1 時產出；位移只往上', () => {
    const t = css({
      scroll: true,
      count: 1,
      scrollDelay: 2,
      scrollDuration: 10,
      boxShape: 'card',
      boxPadY: 7,
      boxBorderWidth: 1,
    });
    expect(t).toContain('translateY(min(0px, 100cqh - 16px - 100%))');
    expect(t).toContain('tk-chat-scroll 10s linear 2s both');
    expect(block(t, CHAT.log)).toContain('container-type: size');
    expect(css({ scroll: true, count: 2 })).not.toContain('tk-chat-scroll');
    expect(css({ scroll: true, count: 1, boxShape: 'bubble' })).toContain('100cqh - 0px - 100%');
  });
});

describe('範本名稱（F02）', () => {
  it('範本名稱寫進開頭說明', () => {
    const t = getTemplate('dice')!;
    expect(
      header(buildChatCss({ ...initialSettings(), ...t.data }, { templateName: t.name })),
    ).toContain('以範本「擲骰紀錄」為基礎');
  });
});
