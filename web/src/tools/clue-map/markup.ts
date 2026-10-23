/**
 * 遊玩畫面的樣式與設定（規格 3.2）：`clueMapCss`（以元件的 id 為範圍的 CSS，試玩、分享連結、互動 HTML 共用）、
 * `playConfig`（內容 → 引擎的設定，圖片網址由呼叫端給）、進度的儲存鍵。純函式。
 */
import { readableTextColor } from '@/core/color';
import type { ClueMapConfig, PlaySpot } from './engine';
import {
  type ClueMapState,
  effectiveRequires,
  type ImageRef,
  imageKey,
  type SceneRef,
  type Spot,
} from './model';
import { S } from './strings';

/** 字型：有裝的就用，不載入字型 */
export const PLAY_FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

/** 圖片網址的來源：上傳的圖是物件網址或 data URL、網址照樣、內建場景是畫好的 data URL；讀不到時空字串 */
export type SrcOf = (ref: SceneRef | ImageRef) => string;

/** 32 位元 FNV-1a（8 位十六進位） */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const spotSignature = (s: Spot): unknown[] => [
  s.id,
  s.name,
  s.shape,
  s.x,
  s.y,
  s.w,
  s.h,
  s.text,
  s.check,
  s.image ? imageKey(s.image) : '',
  effectiveRequires(s),
  s.mode,
  s.hidden,
];

/** 內容的指紋（遊玩進度的儲存鍵用：內容改了就不沿用舊進度；不含 KP 備註和遊玩設定） */
export function contentFingerprint(
  d: Pick<ClueMapState, 'title' | 'intro' | 'scene' | 'spots'>,
): string {
  return fnv1a(JSON.stringify([d.title, d.intro, imageKey(d.scene), d.spots.map(spotSignature)]));
}

/** 互動 HTML 與分享連結的遊玩進度鍵 */
export const progressKey = (d: Pick<ClueMapState, 'title' | 'intro' | 'scene' | 'spots'>): string =>
  `trpg-toolkit:clue-map:progress:${contentFingerprint(d)}`;

/**
 * 內容 → 引擎的設定。出現條件用有效的（沒開啟或沒指定＝空）；KP 備註不放進來（規格 D6）。
 * 圖片放在一張圖片表裡（同一張只放一份），熱點與場景用索引。
 */
export function playConfig(
  d: Pick<ClueMapState, 'title' | 'intro' | 'scene' | 'spots' | 'look'>,
  srcOf: SrcOf,
  {
    storageKey = null,
    initialFound,
    initialReveal,
    initialOpen,
  }: {
    storageKey?: string | null;
    initialFound?: string[];
    initialReveal?: boolean;
    initialOpen?: string | null;
  } = {},
): ClueMapConfig {
  const images: string[] = [];
  const index = new Map<string, number>();
  const add = (ref: SceneRef | ImageRef): number => {
    const key = imageKey(ref);
    let i = index.get(key);
    if (i === undefined) {
      i = images.length;
      images.push(srcOf(ref));
      index.set(key, i);
    }
    return i;
  };
  const scene = add(d.scene);
  const spots: PlaySpot[] = d.spots.map((s, i) => ({
    id: s.id,
    n: i + 1,
    name: s.name.trim(),
    shape: s.shape,
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h,
    text: s.text,
    check: s.check.trim(),
    image: s.image ? add(s.image) : -1,
    req: effectiveRequires(s),
    mode: s.mode,
    hidden: s.hidden,
  }));
  const l = d.look;
  return {
    title: d.title.trim(),
    intro: d.intro.trim(),
    images,
    scene,
    spots,
    look: {
      theme: l.theme,
      marker: l.marker,
      accent: l.accent,
      accentFg: readableTextColor(l.accent),
      foundColor: l.foundColor,
      foundFg: readableTextColor(l.foundColor),
      foundMark: l.foundMark,
      names: l.names,
      progress: l.progress,
      reveal: l.reveal,
    },
    labels: { ...S.player },
    storageKey,
    ...(initialFound ? { initialFound } : {}),
    ...(initialReveal ? { initialReveal } : {}),
    ...(initialOpen ? { initialOpen } : {}),
  };
}

/**
 * 遊玩畫面的 CSS。scope 是元件的選擇器（`#cm-xxxx`）；顏色由引擎設在元件上的 CSS 變數與 data-theme 決定。
 * 窄版面：場景在上、線索卡與清單在下；元件寬 ≥ 720 px 時左右排列（container query，不看視窗寬）。
 */
export function clueMapCss(scope: string): string {
  const s = scope;
  return [
    `${s}{box-sizing:border-box;container-type:inline-size;width:100%;max-width:1100px;margin:0 auto;padding:16px;border-radius:14px;background:var(--cm-bg);color:var(--cm-fg);font-family:${PLAY_FONT};font-size:15px;line-height:1.6;text-align:left}`,
    `${s}[data-theme="dark"]{--cm-bg:#15181d;--cm-panel:#1e232a;--cm-panel-2:#272e37;--cm-fg:#e8e6e1;--cm-muted:#a3acb6;--cm-border:#333b46}`,
    `${s}[data-theme="light"]{--cm-bg:#f4f1ea;--cm-panel:#ffffff;--cm-panel-2:#ece7da;--cm-fg:#1f2328;--cm-muted:#5b6670;--cm-border:#d8d2c4}`,
    `${s} *,${s} *::before,${s} *::after{box-sizing:border-box}`,
    `${s} .cm-head{margin:0 0 12px}`,
    `${s} .cm-title{margin:0;font-size:22px;line-height:1.35;font-weight:700;letter-spacing:.02em;overflow-wrap:anywhere}`,
    `${s} .cm-intro{margin:6px 0 0;color:var(--cm-muted);white-space:pre-line;overflow-wrap:anywhere}`,
    `${s} .cm-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 12px;min-height:36px}`,
    `${s} .cm-progress{display:inline-block;padding:3px 14px;border-radius:999px;background:var(--cm-panel);border:1px solid var(--cm-border);font-weight:700;font-variant-numeric:tabular-nums}`,
    `${s}[data-complete] .cm-progress{border-color:var(--cm-found);background:color-mix(in srgb,var(--cm-found) 20%,var(--cm-panel))}`,
    `${s} .cm-note{font-size:14px;color:var(--cm-muted)}`,
    `${s} .cm-note:empty{display:none}`,
    `${s} .cm-tools{display:flex;flex-wrap:wrap;gap:8px;margin-left:auto}`,
    `${s} .cm-btn{margin:0;padding:6px 14px;border-radius:8px;border:1px solid var(--cm-border);background:var(--cm-panel);color:var(--cm-fg);font:inherit;font-size:14px;line-height:1.4;cursor:pointer;touch-action:manipulation}`,
    `${s} .cm-btn:hover{background:var(--cm-panel-2)}`,
    `${s} .cm-btn[aria-pressed="true"]{background:var(--cm-accent);border-color:var(--cm-accent);color:var(--cm-accent-fg)}`,
    `${s} .cm-btn[data-confirm]{border-color:#e5484d;color:#e5484d}`,
    `${s} .cm-btn:focus-visible,${s} .cm-found-item:focus-visible,${s} .cm-close:focus-visible{outline:2px solid var(--cm-accent);outline-offset:2px}`,
    `${s} .cm-main{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}`,
    `@container (min-width:720px){${s} .cm-main{grid-template-columns:minmax(0,1fr) 320px;align-items:start}}`,
    `${s} .cm-scene{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--cm-border);background:#0b0d10;line-height:0;user-select:none;-webkit-user-select:none}`,
    `${s} .cm-img{display:block;width:100%;height:auto;-webkit-user-drag:none}`,
    `${s} .cm-blank{padding-top:66.667%}`,
    `${s} .cm-layer,${s} .cm-tags{position:absolute;inset:0;pointer-events:none}`,
    `${s} .cm-spot{position:absolute;display:block;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;transform:translate(-50%,-50%);pointer-events:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;outline:none}`,
    `${s} .cm-spot::before{content:"";position:absolute;left:50%;top:50%;width:100%;height:100%;min-width:28px;min-height:28px;transform:translate(-50%,-50%);pointer-events:auto}`,
    `${s} .cm-spot[hidden]{display:none}`,
    `${s} .cm-spot[data-shape="ellipse"]::before{clip-path:ellipse(50% 50% at 50% 50%)}`,
    `${s} .cm-spot[data-state="locked"]{cursor:default}`,
    `${s} .cm-spot[data-hidden="1"][data-state="ready"]{cursor:default}`,
    `${s} .cm-spot:focus-visible::after{content:"";position:absolute;left:50%;top:50%;width:100%;height:100%;min-width:28px;min-height:28px;transform:translate(-50%,-50%);border-radius:4px;box-shadow:inset 0 0 0 3px #fff,inset 0 0 0 5px #111}`,
    `${s} .cm-spot[data-shape="ellipse"]:focus-visible::after{border-radius:50%}`,
    `${s} .cm-ring,${s} .cm-dot,${s} .cm-mark,${s} .cm-badge{position:absolute;display:none;pointer-events:none}`,
    `${s} .cm-ring{inset:0;border:2px solid var(--cm-accent);border-radius:4px;background:rgba(255,255,255,.1);background:color-mix(in srgb,var(--cm-accent) 14%,transparent);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),0 0 0 1px rgba(0,0,0,.35)}`,
    `${s} .cm-spot[data-shape="ellipse"] .cm-ring{border-radius:50%}`,
    `${s} .cm-spot[data-vis="ring"] .cm-ring{display:block;animation:cm-breathe 2.4s ease-in-out infinite}`,
    `${s} .cm-dot{left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--cm-accent);box-shadow:0 0 0 2px rgba(255,255,255,.85),0 0 0 4px rgba(0,0,0,.25)}`,
    `${s} .cm-spot[data-vis="dot"] .cm-dot{display:block;animation:cm-pulse 2.4s ease-in-out infinite}`,
    `${s} .cm-spot[data-tone="found"] .cm-ring{border-color:var(--cm-found);background:rgba(255,255,255,.1);background:color-mix(in srgb,var(--cm-found) 18%,transparent);animation:none}`,
    `${s} .cm-spot[data-tone="found"] .cm-dot{background:var(--cm-found);animation:none}`,
    `${s} .cm-spot[data-tone="locked"] .cm-ring{border-color:#9aa3ad;background:rgba(120,130,140,.2);animation:none}`,
    `${s} .cm-spot[data-dashed] .cm-ring{border-style:dashed}`,
    `${s} .cm-mark{left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;padding:4px;border-radius:50%;background:var(--cm-accent);color:var(--cm-accent-fg);box-shadow:0 0 0 2px rgba(255,255,255,.85)}`,
    `${s} .cm-mark svg{display:block;width:100%;height:100%}`,
    `${s} .cm-spot[data-tone="found"] .cm-mark{background:var(--cm-found);color:var(--cm-found-fg)}`,
    `${s} .cm-spot[data-check="1"] .cm-mark{display:block}`,
    `${s} .cm-badge{left:50%;top:50%;min-width:20px;height:20px;padding:0 5px;border-radius:10px;transform:translate(-50%,-50%);background:var(--cm-accent);color:var(--cm-accent-fg);font-size:12px;font-weight:700;line-height:20px;text-align:center;box-shadow:0 0 0 2px rgba(255,255,255,.85)}`,
    `${s} .cm-spot[data-tone="locked"] .cm-badge{background:#9aa3ad;color:#111}`,
    `${s} .cm-spot[data-num] .cm-badge{display:block}`,
    `${s} .cm-spot[data-num] .cm-mark,${s} .cm-spot[data-num] .cm-dot{display:none}`,
    `${s} .cm-spot[data-new]{animation:cm-in .4s ease-out}`,
    `${s} .cm-spot[data-flash] .cm-ring{display:block;animation:cm-flash .9s ease-out 1}`,
    `${s} .cm-spot[data-flash] .cm-dot{animation:cm-flash .9s ease-out 1}`,
    `${s} .cm-tag{position:absolute;transform:translate(-50%,4px);max-width:60%;padding:1px 8px;border-radius:999px;background:rgba(15,18,22,.82);color:#fff;font-size:12px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `${s} .cm-tag[hidden]{display:none}`,
    `${s} .cm-side{display:flex;flex-direction:column;gap:12px;min-width:0}`,
    `${s} .cm-card,${s} .cm-found{background:var(--cm-panel);border:1px solid var(--cm-border);border-radius:10px;padding:14px;min-width:0}`,
    `${s} .cm-card[data-empty]{padding:22px 14px;color:var(--cm-muted);text-align:center}`,
    `${s} .cm-empty{margin:0}`,
    `${s} .cm-card-head{display:flex;align-items:center;gap:10px;margin:0 0 10px}`,
    `${s} .cm-num{flex:none;display:inline-block;min-width:26px;height:26px;padding:0 6px;border-radius:13px;background:var(--cm-accent);color:var(--cm-accent-fg);font-size:13px;font-weight:700;line-height:26px;text-align:center;font-variant-numeric:tabular-nums}`,
    `${s} .cm-card-title{flex:1;min-width:0}`,
    `${s} .cm-kicker{display:block;font-size:12px;color:var(--cm-muted);letter-spacing:.06em}`,
    `${s} .cm-card-name{margin:0;font-size:18px;line-height:1.35;overflow-wrap:anywhere}`,
    `${s} .cm-close{flex:none;width:32px;height:32px;margin:0;padding:0;border:0;border-radius:8px;background:transparent;color:var(--cm-muted);font:inherit;font-size:22px;line-height:1;cursor:pointer}`,
    `${s} .cm-close:hover{background:var(--cm-panel-2);color:var(--cm-fg)}`,
    `${s} .cm-card-img{display:block;width:100%;max-height:260px;margin:0 0 10px;border-radius:8px;background:var(--cm-panel-2);object-fit:contain}`,
    `${s} .cm-text{margin:0 0 .8em;overflow-wrap:anywhere}`,
    `${s} .cm-flavor{margin:0;color:var(--cm-muted)}`,
    `${s} .cm-check{margin:10px 0 0;padding:8px 12px;border-radius:8px;background:var(--cm-panel-2);font-size:14px;overflow-wrap:anywhere}`,
    `${s} .cm-found-title{margin:0 0 8px;font-size:14px;font-weight:700;color:var(--cm-muted)}`,
    `${s} .cm-found-empty{margin:0;font-size:14px;color:var(--cm-muted)}`,
    `${s} .cm-found-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}`,
    `${s} .cm-found-item{display:flex;align-items:center;gap:10px;width:100%;margin:0;padding:6px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:15px;text-align:left;cursor:pointer}`,
    `${s} .cm-found-item:hover{background:var(--cm-panel-2)}`,
    `${s} .cm-found-item[aria-current]{border-color:var(--cm-accent)}`,
    `${s} .cm-found-name{min-width:0;overflow-wrap:anywhere}`,
    '@keyframes cm-breathe{0%,100%{opacity:1}50%{opacity:.65}}',
    '@keyframes cm-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}',
    '@keyframes cm-in{from{opacity:0;transform:translate(-50%,-50%) scale(.8)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}',
    '@keyframes cm-flash{0%{background:var(--cm-accent);opacity:1;transform:scale(1.15)}100%{opacity:1;transform:scale(1)}}',
    `@media (prefers-reduced-motion:reduce){${s} .cm-spot,${s} .cm-ring,${s} .cm-dot{animation:none!important}}`,
  ].join('\n');
}
