/**
 * Stage 的「示意場景」背景：一張本站自己畫的 16:9 奇幻風景（黃昏的天空、月亮、遠山、湖面、城堡剪影、樹與營火），
 * 顏色豐富、明暗都有，方便檢查半透明的轉場、遮罩疊在畫面上的樣子。只供預覽，不會匯出。
 * 以 SVG（data URI）提供，CSS 以 cover 鋪滿。
 */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#1d1b4a"/><stop offset="0.38" stop-color="#5b3d8c"/>
<stop offset="0.62" stop-color="#d9708a"/><stop offset="0.8" stop-color="#f6b26b"/>
</linearGradient>
<radialGradient id="moon" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="#fff8dc"/><stop offset="0.7" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/>
</radialGradient>
<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="#ffe7b0" stop-opacity="0.55"/><stop offset="1" stop-color="#ffe7b0" stop-opacity="0"/>
</radialGradient>
<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#f2a073"/><stop offset="0.35" stop-color="#7a4f8f"/><stop offset="1" stop-color="#1a2547"/>
</linearGradient>
<radialGradient id="fire" cx="0.5" cy="0.6" r="0.5">
<stop offset="0" stop-color="#fff3a0"/><stop offset="0.45" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="1600" height="900" fill="url(#sky)"/>
<g fill="#fff6d8">
<circle cx="140" cy="90" r="2.5"/><circle cx="310" cy="160" r="2"/><circle cx="460" cy="70" r="3"/>
<circle cx="610" cy="130" r="1.8"/><circle cx="820" cy="60" r="2.4"/><circle cx="980" cy="150" r="1.6"/>
<circle cx="1490" cy="110" r="2.6"/><circle cx="1380" cy="200" r="1.8"/><circle cx="250" cy="260" r="1.6"/>
<circle cx="720" cy="230" r="2"/><circle cx="1540" cy="300" r="1.5"/><circle cx="60" cy="330" r="2"/>
</g>
<circle cx="1180" cy="230" r="190" fill="url(#halo)"/>
<circle cx="1180" cy="230" r="92" fill="url(#moon)"/>
<path d="M0 560 L170 430 L300 520 L470 380 L640 520 L780 450 L930 540 L1090 410 L1260 520 L1420 440 L1600 540 L1600 640 L0 640 Z" fill="#6b4a8e" opacity="0.85"/>
<path d="M0 600 L120 520 L260 590 L420 500 L560 600 L700 540 L860 610 L1000 530 L1150 610 L1320 540 L1480 600 L1600 560 L1600 660 L0 660 Z" fill="#433469"/>
<rect y="640" width="1600" height="260" fill="url(#lake)"/>
<g fill="#ffe9b8" opacity="0.55">
<rect x="1130" y="670" width="100" height="4" rx="2"/><rect x="1110" y="700" width="140" height="4" rx="2"/>
<rect x="1150" y="735" width="60" height="3" rx="1.5"/><rect x="1125" y="770" width="110" height="3" rx="1.5"/>
</g>
<path d="M0 640 C 220 600 420 610 560 640 Z" fill="#2a2148"/>
<g fill="#21183d">
<path d="M330 640 L330 470 L352 470 L352 450 L366 450 L366 470 L388 470 L388 430 L402 400 L416 430 L416 470 L440 470 L440 520 L470 520 L470 455 L486 425 L502 455 L502 520 L530 520 L530 640 Z"/>
<rect x="398" y="440" width="10" height="16" fill="#ffd36b"/>
<rect x="482" y="470" width="9" height="14" fill="#ffd36b"/>
<rect x="356" y="500" width="9" height="14" fill="#ffd36b"/>
</g>
<g fill="#1b2a35">
<path d="M1500 640 L1530 540 L1560 640 Z"/><path d="M1440 640 L1478 520 L1516 640 Z"/>
<path d="M1380 640 L1410 560 L1440 640 Z"/><path d="M60 640 L90 560 L120 640 Z"/>
<path d="M0 640 L28 540 L56 640 Z"/>
</g>
<path d="M0 820 C 300 780 600 800 820 900 L0 900 Z" fill="#162033"/>
<path d="M900 900 C 1050 830 1300 810 1600 840 L1600 900 Z" fill="#141c2e"/>
<circle cx="1260" cy="826" r="46" fill="url(#fire)"/>
<path d="M1240 850 L1280 836 M1238 838 L1282 852" stroke="#4a2c22" stroke-width="7" stroke-linecap="round"/>
</svg>`;

let cached: string | null = null;

/** 示意場景的 data URI（第一次呼叫時產生） */
export function stageSceneUrl(): string {
  if (!cached) cached = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
  return cached;
}

/** 原始 SVG（測試、匯出示範用） */
export const STAGE_SCENE_SVG = SVG;
