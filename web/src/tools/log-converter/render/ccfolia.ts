/**
 * CCFOLIA 風格（規格 3.5）：接近 CCFOLIA 聊天欄的一列一則（左邊圓形頭像，右邊名稱與內容）。
 * 旁白有三種呈現（換底色、獨立區塊、同對話）；分頁可以標出分頁名稱或改用通知框；副旁白也作用在旁白角色本人。
 */
import type { LogEntry } from '../classify';
import {
  avatarFor,
  type ChunkContext,
  type Decls,
  dialogueSpeakers,
  esc,
  type FontSetup,
  hexAlpha,
  illustrationHtml,
  inlineStyle,
  isHidden,
  numAttr,
  systemName,
  tabColorOf,
  walk,
  wrapsName,
} from './common';

/** 旁白列的名稱沒有設定顏色時的金黃色、沒有頭像時的人形圖示顏色 */
const GOLD = '#fbbf24';
const MUTED = '#9ca3af';

export function ccfoliaBody(ctx: ChunkContext): string {
  const { o } = ctx;
  const withColor = new Set(dialogueSpeakers(ctx.entries));
  const block = o.narrationMode === 'block';
  let out = '';
  let chat: LogEntry[] = [];
  /** 獨立區塊：連續、同一位發言者、同一個分頁的旁白合成一塊 */
  let merged: { head: LogEntry; lines: string[] } | null = null;

  const fallbackIcon = (color: string) =>
    `<span class="lc-noav"${inlineStyle({ color })}>${ctx.icons.use('person', 40)}</span>`;

  const tabLabel = (e: LogEntry, colored: boolean) => {
    if ((o.tabStyles[e.tab] ?? 'none') !== 'label' || !e.tab) return '';
    const c = colored ? tabColorOf(ctx, e.tab) : null;
    return `<span class="lc-tablabel"${inlineStyle({ color: c?.text })}>[${esc(e.tab)}]</span>`;
  };

  const lineDivs = (e: LogEntry) => e.lines.map((l) => `<div>${l}</div>`).join('');

  const nameSpan = (e: LogEntry, cls: string, color: string | undefined) =>
    `<span class="${['lc-name', cls].filter(Boolean).join(' ')}${wrapsName(ctx, e.speaker) ? ' lc-wrapname' : ''}"${inlineStyle({ color })}>${esc(e.speaker)}</span>`;

  const flushBlock = () => {
    if (!merged) return;
    const { head, lines } = merged;
    merged = null;
    const c = tabColorOf(ctx, head.tab);
    out += `<div class="lc-row lc-narr lc-block"${inlineStyle({ 'background-color': c?.bg })}><div class="lc-main"><div class="lc-rowhead">${nameSpan(head, 'lc-gm', o.nameColors[head.speaker])}</div><div class="lc-text"${inlineStyle({ color: c?.text })}>${lines.join('')}</div></div></div>`;
  };

  const flushChat = () => {
    if (!chat.length) return;
    const group = chat;
    chat = [];
    if (o.chatMode === 'hide') return;
    const rows = group
      .map((e) => {
        const c = tabColorOf(ctx, e.tab);
        const av = ctx.avatars.html(o.profileImages[e.speaker], e.speaker, fallbackIcon(MUTED));
        const color = withColor.has(e.speaker) ? o.nameColors[e.speaker] : undefined;
        return `<div class="lc-row lc-chatrow"${inlineStyle({ 'background-color': c?.bg })}><div class="lc-pfp">${av}</div><div class="lc-main"><div class="lc-rowhead">${nameSpan(e, '', color)}${tabLabel(e, false)}</div><div class="lc-text"${inlineStyle({ color: c?.text })}>${lineDivs(e)}</div></div></div>`;
      })
      .join('');
    if (o.chatMode === 'collapse') {
      const first = tabColorOf(ctx, group[0].tab);
      const summary = o.showChatCount ? o.labels.chatFoldCount(group.length) : o.labels.chatFold;
      out += `<div class="lc-chatfold"><details><summary class="lc-chatsum"${inlineStyle({ color: first?.text })}>${esc(summary)}</summary><div class="lc-chatlist">${rows}</div></details></div>`;
    } else out += rows;
  };

  const systemRow = (icon: string, name: string, e: LogEntry, num: string) =>
    `<div class="lc-row lc-sys"${num}><div class="lc-pfp"><div class="lc-sysicon" aria-hidden="true">${icon}</div></div><div class="lc-main"><div class="lc-rowhead"><span class="lc-name lc-sysname">${esc(name)}</span></div><div class="lc-text lc-systext">${e.lines.join('<br>')}</div></div></div>`;

  /** 旁白類的列（旁白角色、旁白類的副旁白） */
  const narrationRow = (e: LogEntry, opts: { italic?: boolean; color?: string }) => {
    const c = tabColorOf(ctx, e.tab);
    const textDecls: Decls = {
      color: opts.color ?? c?.text,
      'font-style': opts.italic ? 'italic' : undefined,
    };
    if (block) {
      /* 獨立區塊：不顯示名稱和頭像（副旁白每則各自一塊） */
      out += `<div class="lc-row lc-narr lc-block"${inlineStyle({ 'background-color': c?.bg })}${numAttr(ctx, e)}><div class="lc-main"><div class="lc-rowhead">${nameSpan(e, 'lc-gm', o.nameColors[e.speaker])}</div><div class="lc-text"${inlineStyle(textDecls)}>${lineDivs(e)}</div></div></div>`;
      return;
    }
    const av = ctx.avatars.html(avatarFor(ctx, e), e.speaker, fallbackIcon(GOLD));
    out += `<div class="lc-row lc-narr"${inlineStyle({ 'background-color': c?.bg })}${numAttr(ctx, e)}><div class="lc-pfp">${av}</div><div class="lc-main"><div class="lc-rowhead">${nameSpan(e, 'lc-gm', o.nameColors[e.speaker])}${tabLabel(e, true)}</div><div class="lc-text"${inlineStyle(textDecls)}>${lineDivs(e)}</div></div></div>`;
  };

  const dialogueRow = (e: LogEntry, italic: boolean) => {
    const c = tabColorOf(ctx, e.tab);
    const av = ctx.avatars.html(avatarFor(ctx, e), e.speaker, fallbackIcon(MUTED));
    out += `<div class="lc-row lc-dlg"${inlineStyle({ 'background-color': c?.bg })}${numAttr(ctx, e)}><div class="lc-pfp">${av}</div><div class="lc-main"><div class="lc-rowhead">${nameSpan(e, '', o.nameColors[e.speaker])}${tabLabel(e, true)}</div><div class="lc-text"${inlineStyle({ color: c?.text, 'font-style': italic ? 'italic' : undefined })}>${lineDivs(e)}</div></div></div>`;
  };

  walk(
    ctx,
    (e) => {
      if (isHidden(ctx, e)) return;
      if (e.kind === 'system') {
        flushBlock();
        flushChat();
        if (!o.hideSystem) out += systemRow('🎲', systemName(ctx, e.speaker), e, numAttr(ctx, e));
        return;
      }
      if (e.kind === 'chat') {
        flushBlock();
        chat.push(e);
        return;
      }
      flushChat();
      if ((o.tabStyles[e.tab] ?? 'none') === 'notice') {
        flushBlock();
        out += systemRow('📌', e.speaker || o.labels.notice, e, '');
        return;
      }
      const sub = o.subNarrators[e.speaker];
      if (sub) {
        flushBlock();
        if (sub.style === 'italic-dialogue') dialogueRow(e, true);
        else if (sub.style === 'italic-narration') narrationRow(e, { italic: true });
        else if (sub.style === 'colored-narration')
          narrationRow(e, { color: tabColorOf(ctx, e.tab)?.text || sub.color });
        else narrationRow(e, {});
        return;
      }
      if (e.kind === 'narration') {
        if (o.narrationMode === 'block') {
          if (merged && (merged.head.speaker !== e.speaker || merged.head.tab !== e.tab))
            flushBlock();
          if (!merged) merged = { head: e, lines: [] };
          const num = numAttr(ctx, e);
          merged.lines.push(...e.lines.map((l, i) => `<div${i === 0 ? num : ''}>${l}</div>`));
          return;
        }
        narrationRow(e, {});
        return;
      }
      flushBlock();
      dialogueRow(e, false);
    },
    (ill) => {
      flushBlock();
      flushChat();
      out += illustrationHtml(ctx, ill);
    },
  );
  flushBlock();
  flushChat();
  return `<div class="lc-list">${out}</div>`;
}

export function ccfoliaRules(ctx: ChunkContext, f: FontSetup): [string, Decls][] {
  const { o } = ctx;
  const p = o.palette;
  const line = 'rgba(255,255,255,0.1)';
  const rules: [string, Decls][] = [
    [
      '&',
      {
        display: 'block',
        'box-sizing': 'border-box',
        'font-family': f.sans,
        'background-color': p.pageBg,
        color: p.text,
        'font-size': `${o.fontSize}px`,
        'line-height': o.lineHeight,
        margin: '0',
        padding: '0',
        'text-align': 'left',
      },
    ],
    ['& *', { 'box-sizing': 'border-box', 'text-shadow': 'none', 'text-transform': 'none' }],
    [
      '& .lc-box',
      { 'max-width': `${o.pageWidth}px`, margin: '0 auto', 'background-color': p.containerBg },
    ],
    [
      '& .lc-head',
      {
        padding: '20px 24px',
        'border-bottom': `1px solid ${line}`,
        'background-color': 'rgba(0,0,0,0.2)',
      },
    ],
    [
      '& .lc-head h1',
      {
        'font-size': '1.5em',
        'font-weight': 700,
        margin: '0 0 8px',
        color: p.accent,
        'line-height': 1.4,
      },
    ],
    ['& .lc-head .lc-sub', { 'font-size': '0.9em', color: MUTED, margin: '0' }],
    [
      '& .lc-head .lc-sum',
      { 'font-size': '0.85em', color: MUTED, margin: '8px 0 0', 'line-height': 1.5 },
    ],
    [
      '& .lc-row',
      {
        display: 'flex',
        padding: '16px 24px',
        'border-bottom': `1px solid ${line}`,
        transition: 'background-color 0.15s',
      },
    ],
    ['& .lc-row:hover', { 'background-color': 'rgba(255,255,255,0.03)' }],
    ['& .lc-pfp', { 'flex-shrink': '0', width: '40px', height: '40px', 'margin-right': '12px' }],
    [
      '& .lc-av',
      {
        width: '100%',
        height: '100%',
        'border-radius': '50%',
        'background-size': 'cover',
        'background-position': 'center top',
      },
    ],
    ['& .lc-noav', { display: 'block', width: '40px', height: '40px', color: MUTED }],
    ['& .lc-noav svg', { display: 'block' }],
    [
      '& .lc-sysicon',
      {
        width: '40px',
        height: '40px',
        'border-radius': '50%',
        'background-color': 'rgba(96,165,250,0.2)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'font-size': '20px',
        'line-height': 1,
      },
    ],
    ['& .lc-main', { flex: '1', 'min-width': '0' }],
    [
      '& .lc-rowhead',
      {
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        'margin-bottom': '4px',
        'flex-wrap': 'wrap',
      },
    ],
    ['& .lc-name', { 'font-weight': 700, 'font-size': '0.95em', color: p.text }],
    ['& .lc-name.lc-wrapname', { 'word-break': 'keep-all', 'overflow-wrap': 'anywhere' }],
    ['& .lc-name.lc-gm', { color: GOLD }],
    ['& .lc-name.lc-sysname', { color: p.systemText }],
    ['& .lc-tablabel', { 'font-size': '0.8em', color: MUTED }],
    ['& .lc-text', { color: p.text, 'overflow-wrap': 'break-word' }],
    ['& .lc-text > div', { margin: '2px 0' }],
    [
      '& .lc-text.lc-systext',
      {
        color: p.systemText,
        'background-color': p.systemBg,
        padding: '8px 12px',
        'border-radius': '6px',
        'border-left': `3px solid ${p.systemBorder}`,
        'font-size': '0.9em',
      },
    ],
    [
      '& .lc-chatfold',
      {
        padding: '12px 24px',
        'border-bottom': `1px solid ${line}`,
        'background-color': 'rgba(0,0,0,0.2)',
      },
    ],
    [
      '& .lc-chatsum',
      {
        display: 'list-item',
        'font-size': '0.9em',
        color: MUTED,
        'font-weight': 600,
        padding: '4px 0',
        cursor: 'pointer',
        'user-select': 'none',
      },
    ],
    ['& .lc-chatlist', { 'margin-top': '8px' }],
    [
      '& .lc-chatlist .lc-row',
      { padding: '12px 0', 'border-bottom': '1px solid rgba(255,255,255,0.05)' },
    ],
    ['& .lc-chatlist .lc-row:last-child', { 'border-bottom': 'none' }],
    ['& .lc-chatrow .lc-text', { color: '#d1d5db', opacity: 0.9 }],
    [
      '& .lc-ill',
      {
        display: 'flex',
        padding: '24px',
        'border-top': `1px solid ${line}`,
        'border-bottom': `1px solid ${line}`,
        margin: '0',
      },
    ],
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
        padding: '20px',
        color: MUTED,
        'font-size': '0.85em',
        'border-top': `1px solid ${line}`,
      },
    ],
  ];
  if (o.narrationMode !== 'plain') {
    rules.push(
      ['& .lc-row.lc-narr', { 'background-color': p.narrationBg }],
      ['& .lc-row.lc-narr .lc-text', { color: p.narrationText }],
    );
  }
  if (o.narrationMode === 'block') {
    rules.push(
      [
        '& .lc-row.lc-block',
        {
          display: 'block',
          margin: '14px 24px',
          padding: '16px 18px',
          border: `1px solid ${hexAlpha(p.narrationText, 0.25)}`,
          'border-radius': '6px',
        },
      ],
      ['& .lc-row.lc-block .lc-rowhead', { display: 'none' }],
      [
        '& .lc-row.lc-block .lc-text, & .lc-row.lc-block .lc-text *',
        { 'text-align': o.narrationCenter ? 'center' : 'left' },
      ],
    );
  }
  return rules;
}
