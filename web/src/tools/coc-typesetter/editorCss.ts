/**
 * 文字欄的分色與格式按鈕的顏色（規格 3.6）。深色為預設，淺色主題另一組。
 * 只改底色、字色與左側色條，不改粗細與字級（上色層要和文字欄對齊）。
 */
export const EDITOR_CSS = `
.coc-ed{
  --fmt-h2:#d7dbe0;--fmt-h3:#9aa1a8;--fmt-desc:#7f9fd6;--fmt-judge:#e0a85a;--fmt-kp:#ad95dc;--fmt-pl:#5fb8a6;
  --fmt-note:#b9b2a4;--fmt-warn:#e78a72;--fmt-san:#ee9a88;--fmt-table:#9aa6b1;--fmt-pb:#6f767d;
  --hl-head-bg:rgba(255,255,255,.07);--hl-desc:#a9c2ee;--hl-desc-bg:rgba(110,150,220,.11);--hl-judge:#ebbd78;
  --hl-mark:#8e959c;--hl-table:#b5bec7;--hl-code:#8e959c;--hl-pb-a:rgba(255,255,255,.05);
  --hl-in-kp:rgba(160,130,220,.11);--hl-in-pl:rgba(90,180,160,.10);--hl-in-note:rgba(185,178,164,.08);--hl-in-warn:rgba(230,120,100,.11);
  --hl-skill-bg:rgba(255,255,255,.11);--hl-san:#f3a594;--hl-san-bg:rgba(240,120,100,.17);--hl-flash:rgba(240,200,80,.35)
}
:root[data-theme='light'] .coc-ed{
  --fmt-h2:#2a2f34;--fmt-h3:#80868c;--fmt-desc:#6f8fc4;--fmt-judge:#d99a48;--fmt-kp:#9a80c8;--fmt-pl:#4f9c8e;
  --fmt-note:#b3ad9f;--fmt-warn:#d4735b;--fmt-san:#dd8a78;--fmt-table:#8a939b;--fmt-pb:#b9bdc1;
  --hl-head-bg:#eeeeea;--hl-desc:#35507a;--hl-desc-bg:#f1f5fb;--hl-judge:#8f520c;
  --hl-mark:#7e848a;--hl-table:#4f575d;--hl-code:#767b80;--hl-pb-a:#f1f0ec;
  --hl-in-kp:#f7f3fc;--hl-in-pl:#eff7f4;--hl-in-note:#f7f6f2;--hl-in-warn:#fdf2ee;
  --hl-skill-bg:rgba(0,0,0,.07);--hl-san:#ad3f29;--hl-san-bg:#fbe7e1;--hl-flash:#fff0b0
}
.coc-ed [data-highlight-layer]>[data-ln]::before{content:"";position:absolute;left:-14px;top:0;bottom:0;width:3px;border-radius:2px;background:var(--bar,transparent)}
.coc-ed .ln-h1,.coc-ed .ln-h2{background:var(--hl-head-bg)}
.coc-ed .ln-h3{--bar:var(--fmt-h3)}
.coc-ed .ln-desc{color:var(--hl-desc);background:var(--hl-desc-bg);--bar:var(--fmt-desc)}
.coc-ed .ln-judge{color:var(--hl-judge)}
.coc-ed .ln-jbody{--bar:color-mix(in srgb,var(--fmt-judge) 55%,transparent)}
.coc-ed .ln-box-open,.coc-ed .ln-box-close{color:var(--hl-mark)}
.coc-ed .ln-b-kp{--bar:var(--fmt-kp)}.coc-ed .ln-inbox.ln-b-kp{background:var(--hl-in-kp)}
.coc-ed .ln-b-pl{--bar:var(--fmt-pl)}.coc-ed .ln-inbox.ln-b-pl{background:var(--hl-in-pl)}
.coc-ed .ln-b-note{--bar:var(--fmt-note)}.coc-ed .ln-inbox.ln-b-note{background:var(--hl-in-note)}
.coc-ed .ln-b-warn{--bar:var(--fmt-warn)}.coc-ed .ln-inbox.ln-b-warn{background:var(--hl-in-warn)}
.coc-ed .ln-pb{color:var(--hl-mark);background:repeating-linear-gradient(135deg,var(--hl-pb-a) 0 6px,transparent 6px 12px)}
.coc-ed .ln-table{color:var(--hl-table)}
.coc-ed .ln-code{color:var(--hl-code)}
.coc-ed .hl-skill{background:var(--hl-skill-bg);border-radius:3px}
.coc-ed .hl-san{color:var(--hl-san);background:var(--hl-san-bg);border-radius:3px}
.coc-ed .ln-flash{animation:coc-flash 1.2s ease-out}
@keyframes coc-flash{from{background:var(--hl-flash)}}
@media (prefers-reduced-motion:reduce){.coc-ed .ln-flash{animation-duration:.01s}}
.coc-ed .fmt-dot{display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--dot)}
`;
