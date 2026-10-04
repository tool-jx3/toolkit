/**
 * 內建示範圖（規格 5. D10）：本站自己畫的 SVG（舊版沒有範例圖），開頁時三種周邊都有東西可以看。
 * 圖片 id 是 `demo:<名稱>`，執行時畫出來，不存進 IndexedDB、也不放進專案檔。
 */

export const DEMO_PREFIX = 'demo:';
export const isDemoImage = (id: string | null | undefined): boolean =>
  !!id && id.startsWith(DEMO_PREFIX);

const svg = (w: number, h: number, body: string, vw = w, vh = h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}">${body}</svg>`;

/** 冒險者（360 × 520 的原圖座標） */
const HERO = `
<path d="M95 250 Q80 400 66 476 L294 476 Q280 400 265 250 Z" fill="#8e2c48"/>
<path d="M108 262 Q100 380 92 452 L120 452 Q126 380 132 268 Z" fill="#a8405f"/>
<rect x="136" y="396" width="36" height="84" rx="12" fill="#3b3355"/>
<rect x="188" y="396" width="36" height="84" rx="12" fill="#3b3355"/>
<path d="M126 470 Q126 456 140 456 L172 456 Q182 456 182 470 L182 486 Q182 496 172 496 L132 496 Q124 496 124 488 Z" fill="#6b4226"/>
<path d="M178 470 Q178 456 192 456 L224 456 Q236 456 236 470 L236 488 Q236 496 228 496 L188 496 Q178 496 178 486 Z" fill="#6b4226"/>
<path d="M120 250 Q180 226 240 250 L256 420 Q180 442 104 420 Z" fill="#3f7cc7"/>
<path d="M150 246 L180 300 L210 246 Q180 238 150 246 Z" fill="#f4efe6"/>
<rect x="110" y="344" width="140" height="17" fill="#6b4226"/>
<rect x="169" y="340" width="24" height="25" rx="5" fill="#f2c14e" stroke="#b9862a" stroke-width="3"/>
<ellipse cx="110" cy="318" rx="21" ry="46" fill="#356bb0" transform="rotate(14 110 318)"/>
<ellipse cx="250" cy="318" rx="21" ry="46" fill="#356bb0" transform="rotate(-14 250 318)"/>
<rect x="268" y="150" width="11" height="330" rx="5.5" fill="#7a5230" transform="rotate(7 273 315)"/>
<circle cx="99" cy="362" r="16" fill="#f7d3b5"/>
<circle cx="262" cy="360" r="16" fill="#f7d3b5"/>
<circle cx="292" cy="150" r="24" fill="#7fdcf7" stroke="#2b8fbf" stroke-width="6"/>
<circle cx="284" cy="141" r="7" fill="#e9fbff"/>
<circle cx="180" cy="165" r="100" fill="#f7d3b5"/>
<path d="M78 172 Q66 58 180 52 Q294 58 282 172 Q262 112 226 116 Q204 92 180 122 Q152 92 132 118 Q98 110 78 172 Z" fill="#5b3a29"/>
<path d="M80 158 Q70 232 96 266 Q100 204 106 164 Z" fill="#5b3a29"/>
<path d="M280 158 Q290 232 264 266 Q260 204 254 164 Z" fill="#5b3a29"/>
<path d="M120 84 Q150 70 176 76" stroke="#7d5640" stroke-width="7" fill="none" stroke-linecap="round"/>
<ellipse cx="145" cy="186" rx="13" ry="18" fill="#2c2340"/>
<ellipse cx="215" cy="186" rx="13" ry="18" fill="#2c2340"/>
<circle cx="149" cy="179" r="5" fill="#fff"/>
<circle cx="219" cy="179" r="5" fill="#fff"/>
<ellipse cx="124" cy="216" rx="14" ry="8" fill="#f29ca3" opacity=".75"/>
<ellipse cx="236" cy="216" rx="14" ry="8" fill="#f29ca3" opacity=".75"/>
<path d="M168 226 Q180 238 192 226" stroke="#8a4b3a" stroke-width="5" fill="none" stroke-linecap="round"/>`;

/** 冒險者的背面 */
const HERO_BACK = `
<path d="M95 250 Q80 400 66 476 L294 476 Q280 400 265 250 Z" fill="#8e2c48"/>
<rect x="136" y="396" width="36" height="84" rx="12" fill="#3b3355"/>
<rect x="188" y="396" width="36" height="84" rx="12" fill="#3b3355"/>
<path d="M126 470 Q126 456 140 456 L172 456 Q182 456 182 470 L182 486 Q182 496 172 496 L132 496 Q124 496 124 488 Z" fill="#6b4226"/>
<path d="M178 470 Q178 456 192 456 L224 456 Q236 456 236 470 L236 488 Q236 496 228 496 L188 496 Q178 496 178 486 Z" fill="#6b4226"/>
<path d="M112 250 Q180 228 248 250 L258 430 Q180 448 102 430 Z" fill="#a8405f"/>
<path d="M180 262 L180 430" stroke="#8e2c48" stroke-width="6"/>
<rect x="81" y="150" width="11" height="330" rx="5.5" fill="#7a5230" transform="rotate(-7 87 315)"/>
<circle cx="68" cy="150" r="24" fill="#7fdcf7" stroke="#2b8fbf" stroke-width="6"/>
<circle cx="180" cy="165" r="100" fill="#5b3a29"/>
<path d="M84 150 Q70 236 100 270 L260 270 Q290 236 276 150 Z" fill="#5b3a29"/>
<path d="M150 90 Q180 120 210 90" stroke="#7d5640" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M140 150 Q180 175 220 150" stroke="#7d5640" stroke-width="6" fill="none" stroke-linecap="round"/>`;

const STAR = svg(
  160,
  160,
  `<path d="M80 8 L99 56 L151 59 L111 92 L124 143 L80 115 L36 143 L49 92 L9 59 L61 56 Z" fill="#ffc83d" stroke="#e39b12" stroke-width="7" stroke-linejoin="round"/>
<path d="M80 36 L91 62 L118 64" stroke="#fff3c4" stroke-width="7" fill="none" stroke-linecap="round"/>`,
);

const HEART = svg(
  160,
  150,
  `<path d="M80 140 C30 104 8 78 8 48 C8 22 28 8 50 8 C64 8 75 16 80 28 C85 16 96 8 110 8 C132 8 152 22 152 48 C152 78 130 104 80 140 Z" fill="#ff6f9a" stroke="#d94677" stroke-width="7" stroke-linejoin="round"/>
<path d="M38 40 Q44 26 58 26" stroke="#ffd3e1" stroke-width="8" fill="none" stroke-linecap="round"/>`,
);

const D20 = svg(
  160,
  170,
  `<path d="M80 6 L150 46 L150 124 L80 164 L10 124 L10 46 Z" fill="#5b8def" stroke="#2f5fc4" stroke-width="6" stroke-linejoin="round"/>
<path d="M80 6 L80 46 M10 46 L80 46 L150 46 M80 46 L40 112 L120 112 Z M10 124 L40 112 L80 164 L120 112 L150 124 M10 46 L40 112 M150 46 L120 112" stroke="#2f5fc4" stroke-width="5" fill="none" stroke-linejoin="round"/>
<path d="M80 54 L48 106 L112 106 Z" fill="#8fb4ff"/>`,
);

const MOON = svg(
  150,
  150,
  `<path d="M98 10 A66 66 0 1 0 140 104 A54 54 0 1 1 98 10 Z" fill="#b39dff" stroke="#7a5ce0" stroke-width="7" stroke-linejoin="round"/>
<circle cx="54" cy="66" r="7" fill="#d9ceff"/><circle cx="66" cy="102" r="5" fill="#d9ceff"/>`,
);

/** 立體透視：最後面的城堡與夜空（600 × 420） */
const CASTLE = svg(
  600,
  420,
  `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2a63"/><stop offset=".6" stop-color="#7b4f9e"/><stop offset="1" stop-color="#f29d72"/></linearGradient></defs>
<rect x="6" y="6" width="588" height="408" rx="36" fill="url(#sky)"/>
<circle cx="470" cy="96" r="44" fill="#fff4d6"/><circle cx="490" cy="84" r="40" fill="#5a3f8c" opacity=".35"/>
<g fill="#fff8e1"><circle cx="90" cy="70" r="3"/><circle cx="160" cy="120" r="2.5"/><circle cx="250" cy="60" r="3"/><circle cx="360" cy="110" r="2"/><circle cx="540" cy="190" r="2.5"/><circle cx="60" cy="170" r="2"/></g>
<path d="M150 414 L150 250 L170 250 L170 228 L186 228 L186 250 L214 250 L214 200 L200 200 L232 150 L264 200 L250 200 L250 270 L300 270 L300 180 L284 180 L320 120 L356 180 L340 180 L340 270 L390 270 L390 214 L376 214 L404 172 L432 214 L418 214 L418 250 L446 250 L446 228 L462 228 L462 250 L478 250 L478 414 Z" fill="#241c44"/>
<g fill="#ffd36e"><rect x="312" y="196" width="16" height="26" rx="8"/><rect x="226" y="222" width="12" height="20" rx="6"/><rect x="398" y="232" width="12" height="20" rx="6"/></g>
<path d="M6 360 Q150 330 300 352 Q450 374 594 340 L594 378 Q594 414 558 414 L42 414 Q6 414 6 378 Z" fill="#1b1533"/>`,
);

/** 立體透視：中間的樹林（600 × 300） */
const FOREST = svg(
  600,
  300,
  `<g fill="#2f7d4f" stroke="#1d5534" stroke-width="5" stroke-linejoin="round">
<path d="M70 280 L70 250 L20 250 L60 190 L34 190 L74 128 L52 128 L90 60 L128 128 L106 128 L146 190 L120 190 L160 250 L110 250 L110 280 Z"/>
<path d="M440 280 L440 240 L396 240 L432 186 L410 186 L446 130 L426 130 L462 70 L498 130 L478 130 L514 186 L492 186 L528 240 L484 240 L484 280 Z"/>
</g>
<g fill="#3f9a62" stroke="#226b40" stroke-width="5" stroke-linejoin="round">
<path d="M196 284 L196 262 L160 262 L190 216 L172 216 L202 168 L232 216 L214 216 L244 262 L208 262 L208 284 Z"/>
<path d="M552 284 L552 266 L524 266 L548 228 L534 228 L560 186 L586 228 L572 228 L596 266 L568 266 L568 284 Z"/>
</g>
<path d="M4 296 Q4 270 40 268 Q160 258 300 270 Q440 280 560 266 Q596 264 596 290 L596 296 Z" fill="#5c8f3a"/>`,
);

const DEMOS: Record<string, string> = {
  hero: svg(360, 520, HERO),
  'hero-back': svg(360, 520, HERO_BACK),
  'hero-small': svg(216, 312, HERO, 360, 520),
  star: STAR,
  heart: HEART,
  d20: D20,
  moon: MOON,
  castle: CASTLE,
  forest: FOREST,
};

export type DemoName = keyof typeof DEMOS;

export const demoId = (name: string) => `${DEMO_PREFIX}${name}`;

/** 示範圖的 SVG 原始碼；沒有這張時 null */
export function demoSvg(id: string): string | null {
  if (!isDemoImage(id)) return null;
  return DEMOS[id.slice(DEMO_PREFIX.length)] ?? null;
}
