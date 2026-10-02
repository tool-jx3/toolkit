/**
 * 小說樣式（規格 3.3）：台詞與敘述連成散文段落。旁白是段落、對話是「名稱｜台詞」兩欄、擲骰是方框、
 * 閒聊收成一組（摺疊或全部顯示）、內容是「***」的一則變成置中的場景分隔；分頁配色時連續的同分頁內容包成色塊。
 */
import type { LogEntry } from '../classify';
import {
  type ChunkContext,
  charCount,
  type Decls,
  esc,
  type FontSetup,
  hexAlpha,
  illustrationHtml,
  inlineStyle,
  isHidden,
  isSceneBreak,
  NAME_WRAP_CHARS,
  numAttr,
  systemName,
  tabColorOf,
  walk,
  wrapsName,
} from './common';

/** 名稱欄寬（em）：這個檔裡所有發言者（含 system 與閒聊的人）名稱的最大字數；沒有發言者時 5 */
export function novelNameColumnEm(entries: readonly LogEntry[], longNameWrap: boolean): number {
  let max = 0;
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.speaker)) continue;
    seen.add(e.speaker);
    max = Math.max(max, charCount(e.speaker));
  }
  const em = seen.size ? max : 5;
  return longNameWrap ? Math.min(em, NAME_WRAP_CHARS) : em;
}

export function novelBody(ctx: ChunkContext): string {
  const { o } = ctx;
  let out = '';
  let chat: LogEntry[] = [];
  let sectionTab: string | null = null;
  let sectionOpen = false;

  const closeSection = () => {
    if (sectionOpen) out += '</div>';
    sectionOpen = false;
    sectionTab = null;
  };
  const openSection = (tab: string) => {
    sectionTab = tab;
    const c = tabColorOf(ctx, tab);
    if (!c) return;
    out += `<div class="lc-tabsec"${inlineStyle({ 'background-color': c.bg, color: c.text })}>`;
    sectionOpen = true;
  };

  const flushChat = () => {
    if (!chat.length) return;
    const group = chat;
    chat = [];
    if (o.chatMode === 'hide') return;
    const c = tabColorOf(ctx, group[0].tab);
    const textStyle: Decls = { color: c?.text };
    const items = group
      .map((e) => `<p><b>${esc(e.speaker)}:</b> ${e.lines.join('<br>')}</p>`)
      .join('');
    if (o.chatMode === 'collapse') {
      const summary = o.showChatCount ? o.labels.chatSummary(group.length) : '';
      out += `<details class="lc-chat"${inlineStyle({ 'background-color': c?.bg })}><summary${inlineStyle(textStyle)}>${esc(summary)}</summary><div class="lc-chat-body"${inlineStyle(textStyle)}>${items}</div></details>`;
    } else {
      out += `<div class="lc-chat lc-chat-open"${inlineStyle({ 'background-color': c?.bg, ...textStyle })}>${items}</div>`;
    }
  };

  const nameSpan = (e: LogEntry) =>
    `<span class="lc-name${wrapsName(ctx, e.speaker) ? ' lc-wrapname' : ''}"${inlineStyle({ color: o.nameColors[e.speaker] })}>${esc(e.speaker)}</span>`;

  const dialogue = (e: LogEntry, italic: boolean) =>
    `<div class="lc-dlg"${numAttr(ctx, e)}>${nameSpan(e)}<div class="lc-lines${italic ? ' lc-it' : ''}">${e.lines.map((l) => `<div>${l}</div>`).join('')}</div></div>`;

  const narration = (e: LogEntry, italic: boolean, color?: string) =>
    `<div class="lc-narr${italic ? ' lc-it' : ''}"${numAttr(ctx, e)}${inlineStyle({ color })}>${e.lines.join('<br>')}</div>`;

  walk(
    ctx,
    (e) => {
      if (isHidden(ctx, e)) return;
      if (e.kind === 'system') {
        /* 系統訊息先把閒聊組輸出（第 5 節第 3 項修正：維持原本的順序） */
        closeSection();
        flushChat();
        if (!o.hideSystem)
          out += `<div class="lc-dice"${numAttr(ctx, e)}><div class="lc-dice-head">${ctx.icons.use('dice', 16)}<span>${esc(systemName(ctx, e.speaker))}</span></div><div class="lc-dice-body">${e.lines.join('<br>')}</div></div>`;
        return;
      }
      if (e.kind === 'chat') {
        closeSection();
        chat.push(e);
        return;
      }
      flushChat();
      if (o.tabColors && e.tab !== sectionTab) {
        closeSection();
        openSection(e.tab);
      }
      if (isSceneBreak(e)) {
        out += `<div class="lc-scene"${numAttr(ctx, e)}>***</div>`;
        return;
      }
      if (e.kind === 'narration') {
        out += narration(e, false);
        return;
      }
      const sub = o.subNarrators[e.speaker];
      if (!sub) out += dialogue(e, false);
      else if (sub.style === 'italic-dialogue') out += dialogue(e, true);
      else if (sub.style === 'italic-narration') out += narration(e, true);
      else if (sub.style === 'colored-narration') out += narration(e, false, sub.color);
      else out += narration(e, false);
    },
    (ill) => {
      closeSection();
      flushChat();
      out += illustrationHtml(ctx, ill);
    },
  );
  closeSection();
  flushChat();
  return out;
}

export function novelRules(ctx: ChunkContext, f: FontSetup): [string, Decls][] {
  const { o } = ctx;
  const p = o.palette;
  const col = novelNameColumnEm(ctx.entries, o.longNameWrap);
  const muted = '#9ca3af';
  const rules: [string, Decls][] = [
    [
      '&',
      {
        display: 'block',
        'box-sizing': 'border-box',
        background: p.pageBg,
        color: p.text,
        'font-family': f.serif,
        'font-size': `${o.fontSize}px`,
        'line-height': o.lineHeight,
        padding: '20px',
        margin: '0',
        'text-align': 'left',
      },
    ],
    ['& *', { 'box-sizing': 'border-box', 'text-shadow': 'none', 'text-transform': 'none' }],
    [
      '& .lc-box',
      {
        'max-width': `${o.pageWidth}px`,
        margin: '40px auto',
        'background-color': p.containerBg,
        border: `1px solid ${p.accent}`,
        'box-shadow': `0 8px 32px ${hexAlpha(p.accent, 0.4)}`,
        padding: '50px 60px',
        'box-sizing': 'content-box',
      },
    ],
    [
      '& .lc-head',
      {
        'border-bottom': `2px solid ${p.accent}`,
        'padding-bottom': '20px',
        'margin-bottom': '50px',
      },
    ],
    [
      '& .lc-head h1',
      {
        'font-family': f.serif,
        'font-size': '2.5em',
        'font-weight': 700,
        'line-height': 1.3,
        margin: '0',
        color: p.text,
      },
    ],
    [
      '& .lc-head .lc-sub',
      { 'font-family': f.sans, 'font-size': '1.1em', color: muted, margin: '15px 0 0' },
    ],
    [
      '& .lc-head .lc-sum',
      {
        'font-family': f.sans,
        'font-size': '0.95em',
        color: muted,
        margin: '15px 0 0',
        'line-height': 1.6,
      },
    ],
    ['& .lc-narr', { margin: '0 0 1.5em', color: p.text }],
    ['& .lc-it', { 'font-style': 'italic' }],
    [
      '& .lc-dlg',
      {
        display: 'grid',
        'grid-template-columns': `${col}em 1fr`,
        'column-gap': '0.5em',
        margin: '0.8em 0',
        color: p.text,
      },
    ],
    [
      '& .lc-dlg .lc-name',
      { 'font-weight': 700, 'white-space': 'nowrap', 'text-align': 'right', 'align-self': 'start' },
    ],
    [
      '& .lc-dlg .lc-name.lc-wrapname',
      { 'white-space': 'normal', 'word-break': 'keep-all', 'overflow-wrap': 'anywhere' },
    ],
    ['& .lc-lines', { 'align-self': 'start', 'min-width': '0', color: 'inherit' }],
    ['& .lc-lines > div', { margin: '0' }],
    [
      '& .lc-scene',
      { 'text-align': 'center', margin: '3em 0', color: muted, 'letter-spacing': '0.5em' },
    ],
    [
      '& .lc-dice',
      {
        margin: '1em 0',
        padding: '10px 14px',
        'background-color': p.systemBg,
        border: `2px solid ${p.systemBorder}`,
        'border-radius': '6px',
        'font-family': f.sans,
        'font-size': '0.95em',
        color: p.systemText,
      },
    ],
    ['& .lc-dice-head', { 'font-weight': 700, 'margin-bottom': '6px', color: p.systemText }],
    ['& .lc-dice-head svg', { 'vertical-align': '-0.15em', 'margin-right': '4px' }],
    ['& .lc-dice-body', { color: p.systemText, 'line-height': 1.5 }],
    [
      '& .lc-chat',
      {
        margin: '2em 0',
        'font-family': f.sans,
        'font-size': '0.9em',
        border: `1px dashed ${p.accent}`,
        'border-radius': '4px',
        'background-color': '#2a2a2a',
        color: muted,
      },
    ],
    [
      '& .lc-chat summary',
      {
        padding: '8px 12px',
        color: muted,
        'font-weight': 700,
        cursor: 'pointer',
        display: 'list-item',
      },
    ],
    ['& .lc-chat-body', { padding: '0 12px 12px', color: muted }],
    ['& .lc-chat-open', { padding: '10px' }],
    ['& .lc-chat p', { margin: '0 0 5px' }],
    ['& .lc-tabsec', { padding: '1em', 'border-radius': '6px', margin: '1em 0' }],
    ['& .lc-tabsec .lc-narr, & .lc-tabsec .lc-dlg, & .lc-tabsec .lc-scene', { color: 'inherit' }],
    ['& .lc-ill', { display: 'flex', margin: '1.5em 0' }],
    [
      '& .lc-ill img',
      {
        width: '100%',
        height: 'auto',
        'border-radius': '8px',
        'box-shadow': '0 4px 6px rgba(0,0,0,0.3)',
        display: 'block',
      },
    ],
    [
      '& .lc-foot',
      {
        'text-align': 'center',
        'margin-top': '40px',
        'padding-top': '20px',
        'border-top': `1px solid ${p.accent}`,
        'font-family': f.sans,
        color: muted,
        'font-size': '0.9em',
      },
    ],
  ];
  if (o.novelTypography) {
    rules.push(
      [
        '& .lc-narr',
        { 'text-indent': '1em', 'letter-spacing': '-0.01em', 'word-spacing': '0.05em' },
      ],
      ['& .lc-lines > div', { 'letter-spacing': '-0.01em', 'word-spacing': '0.05em' }],
    );
  }
  return rules;
}
