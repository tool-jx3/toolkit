/**
 * 時間軸樣式（規格 3.4）：左側一條直線串起每個項目的圓形圖示（旁白＝書、對話＝頭像、擲骰＝骰子、閒聊＝對話泡泡），
 * 連續的旁白合成一個項目；台詞版面有欄位對齊與接續兩種。
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

/**
 * 顯示寬度：諺文、假名、漢字、全形符號各算 2，英數算 1，空白算 0.5，其他算 1（3.4）。
 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (
      (c >= 0x3131 && c <= 0x318e) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0x3040 && c <= 0x30ff) ||
      (c >= 0x3400 && c <= 0x4dbf) ||
      (c >= 0x4e00 && c <= 0x9fff) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff01 && c <= 0xff60)
    )
      w += 2;
    else if (/[a-zA-Z0-9]/.test(ch)) w += 1;
    else if (/\s/.test(ch)) w += 0.5;
    else w += 1;
  }
  return w;
}

/** 名稱欄寬（em）：這個檔裡「對話」發言者名稱的最大顯示寬度 × 0.55，無條件進位；沒有對話時以 10 計 */
export function timelineNameColumnEm(entries: readonly LogEntry[], longNameWrap: boolean): number {
  const speakers = dialogueSpeakers(entries);
  let max = speakers.length ? Math.max(...speakers.map(displayWidth)) : 10;
  /* 名稱過長時換行：欄寬以 10 個全形字為上限，更長的名稱換行 */
  if (longNameWrap) max = Math.min(max, 20);
  return Math.ceil(max * 0.55);
}

const MUTED = '#9ca3af';

export function timelineBody(ctx: ChunkContext): string {
  const { o } = ctx;
  const p = o.palette;
  const withColor = new Set(dialogueSpeakers(ctx.entries));
  let out = '';
  let chat: LogEntry[] = [];
  let narr: string[] = [];
  let narrTab = '';

  /** 對話、副旁白的色塊：分頁配色時用分頁的背景（透明時用容器色）與文字色 */
  const contentStyle = (tab: string): Decls => {
    const c = tabColorOf(ctx, tab);
    if (c) return { 'background-color': c.bg ?? p.containerBg, color: c.text };
    return { 'background-color': p.containerBg, color: p.text };
  };

  /** 閒聊的名稱：這個人在同一個檔裡也有對話時用他的名稱顏色，否則沿用閒聊的文字色（預設灰色） */
  const chatName = (e: LogEntry, fallback?: string) =>
    `<b class="lc-chat-name"${inlineStyle({ color: withColor.has(e.speaker) ? o.nameColors[e.speaker] : fallback })}>${esc(e.speaker)}:</b>`;

  const flushChat = () => {
    if (!chat.length) return;
    const group = chat;
    chat = [];
    if (o.chatMode === 'hide') return;
    const c = tabColorOf(ctx, group[0].tab);
    const box = inlineStyle(
      c?.bg ? { 'background-color': c.bg, padding: '0.5em', 'border-radius': '6px' } : {},
    );
    const icon = `<div class="lc-icon">${ctx.icons.use('chat', 22)}</div>`;
    if (o.chatMode === 'collapse') {
      const summary = o.showChatCount ? o.labels.chatSummary(group.length) : '';
      const items = group.map((e) => `<p>${chatName(e)} ${e.lines.join('<br>')}</p>`).join('');
      out += `<div class="lc-item lc-chat-item">${icon}<div class="lc-content"${box}><details class="lc-chat"><summary${inlineStyle({ color: c?.text })}>${esc(summary)}</summary><div class="lc-chat-body"${inlineStyle({ color: c?.text })}>${items}</div></details></div></div>`;
    } else {
      for (const e of group)
        out += `<div class="lc-item lc-chat-item lc-chat-open">${icon}<div class="lc-content"${box}><p class="lc-chat-one"${inlineStyle({ color: c?.text })}>${chatName(e, c?.text ?? MUTED)} ${e.lines.join('<br>')}</p></div></div>`;
    }
  };

  const flushNarr = () => {
    if (!narr.length) return;
    const c = tabColorOf(ctx, narrTab);
    const style: Decls = c
      ? { 'background-color': c.bg ?? p.narrationBg, color: c.text || p.narrationText }
      : { 'background-color': p.narrationBg, color: p.narrationText };
    out += `<div class="lc-item lc-narr-item"><div class="lc-icon">${ctx.icons.use('book', 22)}</div><div class="lc-content lc-narr"${inlineStyle(style)}>${narr.join('')}</div></div>`;
    narr = [];
  };

  const dialogueItem = (e: LogEntry, italic: boolean) => {
    const icon = `<div class="lc-icon">${ctx.avatars.html(avatarFor(ctx, e), e.speaker, ctx.icons.use('person', 24))}</div>`;
    const name = `<span class="lc-name${wrapsName(ctx, e.speaker) ? ' lc-wrapname' : ''}"${inlineStyle({ color: o.nameColors[e.speaker] })}>${esc(e.speaker)}</span>`;
    const it = italic ? ' lc-it' : '';
    let inner: string;
    if (o.dialogueLayout === 'inline') {
      const [first = '', ...rest] = e.lines;
      inner = `<div class="lc-inline">${name}<span class="lc-sep">${esc(o.separator)}</span><div class="lc-msgs${it}"><span class="lc-first">${first}</span>${rest.map((l) => `<div>${l}</div>`).join('')}</div></div>`;
    } else {
      inner = `<div class="lc-grid">${name}<div class="lc-lines${it}">${e.lines.map((l) => `<div>${l}</div>`).join('')}</div></div>`;
    }
    out += `<div class="lc-item lc-dlg-item"${numAttr(ctx, e)}>${icon}<div class="lc-content lc-dlg"${inlineStyle(contentStyle(e.tab))}>${inner}</div></div>`;
  };

  walk(
    ctx,
    (e) => {
      if (isHidden(ctx, e)) return;
      if (e.kind === 'system') {
        flushNarr();
        flushChat();
        if (!o.hideSystem)
          out += `<div class="lc-item lc-sys-item"${numAttr(ctx, e)}><div class="lc-icon lc-dice-icon">${ctx.icons.use('dice', 20)}</div><div class="lc-content"><div class="lc-dicebox"><div class="lc-dice-head">${esc(systemName(ctx, e.speaker))}</div><div class="lc-dice-body">${e.lines.join('<br>')}</div></div></div></div>`;
        return;
      }
      if (e.kind === 'chat') {
        flushNarr();
        chat.push(e);
        return;
      }
      if (e.kind === 'narration') {
        flushChat();
        if (!narr.length) narrTab = e.tab;
        narr.push(`<p class="lc-msg"${numAttr(ctx, e)}>${e.lines.join('<br>')}</p>`);
        return;
      }
      const sub = o.subNarrators[e.speaker];
      if (sub && sub.style !== 'italic-dialogue') {
        /* 旁白類的副旁白：每則各自一個項目；先輸出還沒輸出的旁白（第 5 節第 2 項修正：依原本順序） */
        flushChat();
        flushNarr();
        const decls: Decls = {
          'font-style': sub.style === 'italic-narration' ? 'italic' : undefined,
          color: sub.style === 'colored-narration' ? sub.color : undefined,
        };
        out += `<div class="lc-item lc-sub-item"${numAttr(ctx, e)}><div class="lc-icon">${ctx.icons.use('book', 22)}</div><div class="lc-content lc-sub"${inlineStyle(contentStyle(e.tab))}><p class="lc-msg"${inlineStyle(decls)}>${e.lines.join('<br>')}</p></div></div>`;
        return;
      }
      flushNarr();
      flushChat();
      dialogueItem(e, sub?.style === 'italic-dialogue');
    },
    (ill) => {
      flushNarr();
      flushChat();
      out += illustrationHtml(ctx, ill);
    },
  );
  flushChat();
  flushNarr();
  return `<div class="lc-tl">${out}</div>`;
}

export function timelineRules(ctx: ChunkContext, f: FontSetup): [string, Decls][] {
  const { o } = ctx;
  const p = o.palette;
  const col = timelineNameColumnEm(ctx.entries, o.longNameWrap);
  const muted = MUTED;
  return [
    [
      '&',
      {
        display: 'block',
        'box-sizing': 'border-box',
        'font-family': f.sans,
        background: p.pageBg,
        color: p.text,
        margin: '0',
        padding: '20px',
        'font-size': `${o.fontSize}px`,
        'line-height': 'normal',
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
        'border-radius': '12px',
        'box-shadow': `0 8px 32px ${hexAlpha(p.accent, 0.4)}`,
        padding: '30px 40px',
        'box-sizing': 'content-box',
      },
    ],
    [
      '& .lc-head',
      {
        'border-bottom': `1px solid ${p.accent}`,
        'padding-bottom': '20px',
        'margin-bottom': '40px',
      },
    ],
    [
      '& .lc-head h1',
      {
        'font-family': f.serif,
        'font-size': '2.2em',
        'font-weight': 700,
        'line-height': 1.3,
        margin: '0',
        color: p.text,
      },
    ],
    ['& .lc-head .lc-sub', { 'font-size': '1.1em', color: muted, margin: '10px 0 0' }],
    [
      '& .lc-head .lc-sum',
      { 'font-size': '0.95em', color: muted, margin: '15px 0 0', 'line-height': 1.6 },
    ],
    ['& .lc-tl', { position: 'relative', padding: '20px 0' }],
    [
      '& .lc-tl::before',
      {
        content: "''",
        position: 'absolute',
        left: '20px',
        top: '0',
        bottom: '0',
        width: '2px',
        'background-color': p.accent,
      },
    ],
    ['& .lc-item', { position: 'relative', padding: '5px 0 25px 55px' }],
    [
      '& .lc-icon',
      {
        position: 'absolute',
        left: '0',
        top: '5px',
        width: '44px',
        height: '44px',
        'border-radius': '50%',
        'background-color': p.pageBg,
        border: `2px solid ${p.accent}`,
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        color: muted,
        overflow: 'hidden',
      },
    ],
    [
      '& .lc-icon.lc-dice-icon',
      { color: p.systemText, 'border-color': p.systemBorder, 'background-color': p.systemBg },
    ],
    [
      '& .lc-av',
      {
        width: '100%',
        height: '100%',
        'background-size': 'cover',
        'background-position': 'center top',
      },
    ],
    ['& .lc-content', { position: 'relative', padding: '0.8em', 'border-radius': '6px' }],
    ['& .lc-narr', { 'font-family': f.serif, padding: '10px' }],
    ['& .lc-sub', { 'font-family': f.serif }],
    ['& .lc-msg', { margin: '0', 'line-height': o.lineHeight }],
    ['& .lc-it', { 'font-style': 'italic' }],
    [
      '& .lc-grid',
      { display: 'grid', 'grid-template-columns': `${col}em 1fr`, 'column-gap': '0.5em' },
    ],
    ['& .lc-grid .lc-name', { 'text-align': 'right' }],
    [
      '& .lc-name',
      {
        'font-weight': 700,
        'white-space': 'nowrap',
        'flex-shrink': '0',
        'line-height': o.lineHeight,
      },
    ],
    [
      '& .lc-name.lc-wrapname',
      { 'white-space': 'normal', 'word-break': 'keep-all', 'overflow-wrap': 'anywhere' },
    ],
    [
      '& .lc-lines, & .lc-msgs',
      { 'min-width': '0', color: 'inherit', 'line-height': o.lineHeight },
    ],
    ['& .lc-lines > div, & .lc-msgs > div', { margin: '0' }],
    ['& .lc-inline', { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'baseline' }],
    ['& .lc-sep', { 'flex-shrink': '0', 'white-space': 'pre', 'line-height': o.lineHeight }],
    ['& .lc-msgs', { flex: '1' }],
    ['& .lc-first', { display: 'inline' }],
    ['& .lc-sys-item .lc-content', { padding: '0' }],
    [
      '& .lc-dicebox',
      {
        padding: '10px 14px',
        'background-color': p.systemBg,
        border: `2px solid ${p.systemBorder}`,
        'border-radius': '6px',
        'font-size': '0.95em',
        color: p.systemText,
      },
    ],
    ['& .lc-dice-head', { 'font-weight': 700, color: p.systemText, 'margin-bottom': '6px' }],
    ['& .lc-dice-body', { color: p.systemText, 'line-height': 1.5 }],
    ['& .lc-chat-item .lc-content', { padding: '0' }],
    ['& .lc-chat-item .lc-icon', { color: '#adb5bd' }],
    ['& .lc-chat', { 'border-left': `3px solid ${p.accent}`, 'padding-left': '10px' }],
    [
      '& .lc-chat summary',
      {
        display: 'list-item',
        'font-weight': 700,
        color: muted,
        cursor: 'pointer',
        padding: '5px 0',
      },
    ],
    ['& .lc-chat-body', { padding: '10px 0 0', 'font-size': '0.9em', color: muted }],
    ['& .lc-chat-body p', { margin: '0 0 5px' }],
    ['& .lc-chat-one', { margin: '0', 'line-height': o.lineHeight }],
    ['& .lc-ill', { display: 'flex', margin: '0 0 25px 55px' }],
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
        'margin-top': '30px',
        'padding-top': '20px',
        'border-top': `1px solid ${p.accent}`,
        color: muted,
        'font-size': '0.9em',
      },
    ],
  ];
}
