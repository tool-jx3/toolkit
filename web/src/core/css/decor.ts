/**
 * 三個 CCFOLIA 工具（狀態條、訊息框、聊天視窗）共用的裝飾產生器：文字外框線、質感、四角括號。
 * 外觀依各規格 3.x 的量測描述設計（不是任何原作的寫法）。
 */
import { num, px, rgba } from './values';

/* ---------- 文字外框線 ---------- */

/** 柔邊陰影／描邊／發光／無 */
export type TextOutlineKind = 'soft' | 'stroke' | 'glow' | 'none';

export interface TextOutlineOptions {
  /** 顏色的不透明度 0～100（預設 100） */
  opacity?: number;
  /** 描邊粗細 px（預設 2） */
  width?: number;
}

/**
 * 文字外框線 → text-shadow 的值：
 * - soft：四周約 3px 的柔邊，加上往下、往右、往左各 1px、模糊 2px 的三層（下方略重）。
 * - stroke：粗細 W 的實色外框，以 16 個方向（W ≤ 1 時 8 個方向）的位移影子組成。
 * - glow：三層不位移的模糊（約 4、10、18px）。
 * - none：'none'。
 */
export function textOutline(
  kind: TextOutlineKind,
  color: string,
  { opacity = 100, width = 2 }: TextOutlineOptions = {},
): string {
  const c = rgba(color, opacity / 100);
  switch (kind) {
    case 'soft':
      return `0 0 3px ${c}, 0 1px 2px ${c}, 1px 0 2px ${c}, -1px 0 2px ${c}`;
    case 'glow':
      return `0 0 4px ${c}, 0 0 10px ${c}, 0 0 18px ${c}`;
    case 'stroke':
      return strokeShadow(width, c, width <= 1 ? 8 : 16);
    default:
      return 'none';
  }
}

/**
 * 以 n 個方向等角度排列的位移影子組成實色外框（第一個方向朝右）。
 * strokeShadow(2, '#000', 8) → '2px 0 0 #000, 1.41px 1.41px 0 #000, …'
 */
export function strokeShadow(width: number, color: string, directions = 16): string {
  const w = Math.max(0, width);
  if (!w) return 'none';
  const parts: string[] = [];
  for (let k = 0; k < directions; k++) {
    const a = (2 * Math.PI * k) / directions;
    parts.push(`${offset(w * Math.cos(a))} ${offset(w * Math.sin(a))} 0 ${color}`);
  }
  return parts.join(', ');
}

/**
 * 8 個方向（上下左右與四個斜角）各位移 width 的實色影子（斜角是 ±width, ±width，不是單位圓）。
 * Discord 通話立繪的名字描邊用。
 */
export function strokeShadow8(width: number, color: string): string {
  const w = Math.max(0, width);
  if (!w) return 'none';
  const d = [
    [0, -w],
    [w, -w],
    [w, 0],
    [w, w],
    [0, w],
    [-w, w],
    [-w, 0],
    [-w, -w],
  ];
  return d.map(([x, y]) => `${offset(x)} ${offset(y)} 0 ${color}`).join(', ');
}

const offset = (v: number) => (Math.abs(v) < 0.005 ? '0' : px(v, 2));

/* ---------- 質感 ---------- */

/** 舊紙／顆粒／掃描線／漸深（由上往下） */
export type TextureKind = 'none' | 'paper' | 'grain' | 'scanlines' | 'deepen';

export interface NoiseOptions {
  /** 一格的大小 px（圖樣每隔這麼多重複） */
  tile?: number;
  /** 濃度 0～1 */
  opacity?: number;
  /** 固定的亂數種子（同樣的設定產生同樣的圖） */
  seed?: number;
  /** 顆粒粗細（feTurbulence 的 baseFrequency，越大越細） */
  frequency?: number;
}

/**
 * 暗色細顆粒雜訊的 SVG data URI（feTurbulence），可直接放在 background-image 的 url() 裡。
 * 平均讓底色暗約 opacity × 0.22。
 */
export function noiseDataUri({
  tile = 160,
  opacity = 0.3,
  seed = 7,
  frequency = 0.85,
}: NoiseOptions = {}): string {
  const t = Math.max(8, Math.round(tile));
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${t}' height='${t}'>` +
    `<filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='${num(frequency, 3)}' numOctaves='2' seed='${Math.round(seed)}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.2 0 0 0 -0.9'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)' opacity='${num(Math.min(1, Math.max(0, opacity)), 3)}'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export interface TextureOptions {
  /** 底色（漸深用）；預設黑 */
  color?: string;
  /** 底色的不透明度 0～1（漸深用；頂端約 0.45 倍、底端約 1.12 倍） */
  opacity?: number;
  /** 舊紙：亮斑、暗角（四角的濃度）、顆粒的濃度 0～1（預設 0.22、0.33、0.22） */
  spot?: number;
  vignette?: number;
  grain?: number;
  /** 顆粒一格的大小 px（舊紙預設 160、顆粒預設 140） */
  tile?: number;
  /** 掃描線：間隔 px（預設 3）與線的濃度 0～1（預設 0.28） */
  period?: number;
  lineOpacity?: number;
}

export interface TextureCss {
  /** background-image（多層，第一層在最上面） */
  backgroundImage: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundPosition?: string;
  /**
   * true：這層要疊在內容（含文字）之上，請放在 ::after 之類的覆蓋層（掃描線）。
   * false：鋪在背景色之上、內容之下。
   */
  overlay: boolean;
  /** true：漸深本身就是背景色，元素的 background-color 要設成透明 */
  replacesColor?: boolean;
}

/** 舊紙暗角的褐色 */
export const PAPER_VIGNETTE_COLOR = '#603c22';

/**
 * 質感 → 背景圖層。none 時回傳 null。
 * - paper（舊紙）：中央偏上的淡白亮斑、往四周漸變成褐色暗角，再疊一層細暗顆粒（約 160px 重複）。
 *   暗角是以方框中心為圓心、通過四角的橢圓（跟著方框的長寬比）：半徑 50% 以內沒有，往外線性加深，四角最深。
 *   依訊息框 F11 與聊天視窗 F15 的舊版量測調整（底色 #efe4cb 不透明時：平均約 (218,207,184)、
 *   亮度標準差約 16、左下角約 (186,167,143)、距上緣 35% 的中央約 (233,225,206)）。
 * - grain（顆粒）：一層暗色雜訊（約 140px 重複），讓底色整體略暗。
 * - scanlines（掃描線）：每 3px 一條 1px 的暗線，疊在內容之上。
 * - deepen（漸深）：由上往下，從 0.45 倍到 1.12 倍底色不透明度的漸層（取代背景色）。
 */
export function texture(kind: TextureKind, o: TextureOptions = {}): TextureCss | null {
  switch (kind) {
    case 'paper': {
      const tile = o.tile ?? 160;
      return {
        backgroundImage: [
          `radial-gradient(ellipse 70% 60% at 50% 35%, ${rgba('#ffffff', o.spot ?? 0.22)}, ${rgba('#ffffff', 0)} 70%)`,
          `radial-gradient(ellipse farthest-corner at 50% 50%, ${rgba(PAPER_VIGNETTE_COLOR, 0)} 50%, ${rgba(PAPER_VIGNETTE_COLOR, o.vignette ?? 0.33)} 100%)`,
          `url("${noiseDataUri({ tile, opacity: o.grain ?? 0.22, seed: 11 })}")`,
        ].join(', '),
        backgroundSize: `100% 100%, 100% 100%, ${tile}px ${tile}px`,
        backgroundRepeat: 'no-repeat, no-repeat, repeat',
        overlay: false,
      };
    }
    case 'grain': {
      const tile = o.tile ?? 140;
      return {
        backgroundImage: `url("${noiseDataUri({ tile, opacity: o.grain ?? 0.35, seed: 5, frequency: 0.95 })}")`,
        backgroundSize: `${tile}px ${tile}px`,
        backgroundRepeat: 'repeat',
        overlay: false,
      };
    }
    case 'scanlines': {
      const p = Math.max(2, o.period ?? 3);
      const c = rgba('#000000', o.lineOpacity ?? 0.28);
      return {
        backgroundImage: `repeating-linear-gradient(to bottom, ${c} 0px, ${c} 1px, transparent 1px, transparent ${px(p)})`,
        overlay: true,
      };
    }
    case 'deepen': {
      const color = o.color ?? '#000000';
      const a = o.opacity ?? 1;
      return {
        backgroundImage: `linear-gradient(to bottom, ${rgba(color, a * 0.45)}, ${rgba(color, Math.min(1, a * 1.12))})`,
        overlay: false,
        replacesColor: true,
      };
    }
    default:
      return null;
  }
}

/** TextureCss → 宣告物件（給 CssSheet.rule） */
export function textureDecls(t: TextureCss | null): Record<string, string | undefined> {
  if (!t) return {};
  return {
    'background-image': t.backgroundImage,
    'background-size': t.backgroundSize,
    'background-repeat': t.backgroundRepeat,
    'background-position': t.backgroundPosition,
  };
}

/* ---------- 四角括號 ---------- */

export interface CornerBracketOptions {
  /** 每臂的長度 px */
  length: number;
  /** 線的粗細 px */
  thickness: number;
  color: string;
}

/**
 * 四角各一個 L 形括號 → `background` 的值（8 層純色漸層）。放在一個蓋住目標的覆蓋層（例如 ::after，
 * 用 inset 決定括號離目標多遠），覆蓋層不用其他背景。
 */
export function cornerBrackets({ length, thickness, color }: CornerBracketOptions): string {
  const L = px(Math.max(0, length));
  const T = px(Math.max(0, thickness));
  const g = `linear-gradient(${color}, ${color})`;
  const corners = ['left top', 'right top', 'left bottom', 'right bottom'];
  return corners
    .flatMap((pos) => [`${g} ${pos} / ${L} ${T} no-repeat`, `${g} ${pos} / ${T} ${L} no-repeat`])
    .join(', ');
}
