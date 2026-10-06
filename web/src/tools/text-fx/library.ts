/**
 * 範本、文字風格、漸層配色（範本名稱、分組、範例文字皆由本站自寫，沒有沿用靈感來源的範本）。
 */
import { INTRO, OUTRO } from './motion';
import {
  baseSettings,
  deepClone,
  deepMerge,
  evenStops,
  type LoopMode,
  type Mode,
  type MotionSettings,
  type Settings,
} from './settings';

/** 選了某個效果時帶入它的預設時長與字間隔，曲線回到自動、強度回到 1 */
export function introOf(id: string, extra: Partial<MotionSettings> = {}): MotionSettings {
  const d = INTRO[id];
  return {
    fx: id,
    dur: d.dur || 0.6,
    gap: d.gap || 0,
    curve: 'auto',
    power: 1,
    dir: d.dirs ? d.dirs[0][0] : 'left',
    order: 'normal',
    ...extra,
  };
}

export function outroOf(id: string, extra: Partial<MotionSettings> = {}): MotionSettings {
  const d = OUTRO[id];
  return {
    fx: id,
    dur: d.dur || 0.6,
    gap: d.gap || 0,
    curve: 'auto',
    power: 1,
    dir: d.dirs ? d.dirs[0][0] : 'left',
    order: 'normal',
    ...extra,
  };
}

/* ---------- 文字風格（一鍵套用：塗色、外框、陰影、光暈） ---------- */

// biome-ignore lint/suspicious/noExplicitAny: 範本差異是任意深度的部分設定
type Patch = Record<string, any>;

export interface StyleKit {
  id: string;
  name: string;
  patch: Patch;
}

const off = { on: false };
const grad = (a: string, b: string, c: string) => ({
  mode: 'gradient',
  stops: evenStops([a, b, c]),
  dir: 'v',
  opacity: 1,
});

export const STYLE_KITS: readonly StyleKit[] = [
  {
    id: 'classic',
    name: '白字黑框',
    patch: {
      fill: { mode: 'solid', color: '#ffffff', opacity: 1 },
      stroke: { on: true, width: 5, color: '#1a1a1a' },
      outer: off,
      shadow: { on: true, color: '#000000', opacity: 0.6, blur: 12, x: 0, y: 5 },
      glow: off,
    },
  },
  {
    id: 'gold',
    name: '金色徽章',
    patch: {
      fill: grad('#fff6cf', '#f4c64e', '#a76d12'),
      stroke: { on: true, width: 4, color: '#3b2203' },
      outer: { on: true, width: 4, color: '#fff1c2' },
      shadow: { on: true, color: '#000000', opacity: 0.55, blur: 14, x: 0, y: 6 },
      glow: off,
    },
  },
  {
    id: 'fire',
    name: '烈焰',
    patch: {
      fill: grad('#fff3c4', '#ffae2b', '#d1300c'),
      stroke: { on: true, width: 5, color: '#200500' },
      outer: off,
      shadow: { on: true, color: '#000000', opacity: 0.6, blur: 14, x: 0, y: 6 },
      glow: { on: true, color: '#ff6a1a', spread: 26, strength: 0.8 },
    },
  },
  {
    id: 'blood',
    name: '血色驚悚',
    patch: {
      fill: grad('#ff5a5a', '#c3121b', '#5a0006'),
      stroke: { on: true, width: 4, color: '#0b0000' },
      outer: off,
      shadow: { on: true, color: '#000000', opacity: 0.75, blur: 16, x: 0, y: 6 },
      glow: { on: true, color: '#ff1f2d', spread: 22, strength: 0.6 },
    },
  },
  {
    id: 'ice',
    name: '冰冷銀藍',
    patch: {
      fill: grad('#ffffff', '#cfe6ff', '#7ea4cf'),
      stroke: { on: true, width: 4, color: '#0f1d33' },
      outer: off,
      shadow: { on: true, color: '#000000', opacity: 0.55, blur: 12, x: 0, y: 5 },
      glow: { on: true, color: '#7fd0ff', spread: 24, strength: 0.7 },
    },
  },
  {
    id: 'neon',
    name: '霓虹青光',
    patch: {
      fill: { mode: 'solid', color: '#f2feff', opacity: 1 },
      stroke: { on: true, width: 2.5, color: '#00c8ff' },
      outer: off,
      shadow: off,
      glow: { on: true, color: '#00c2ff', spread: 30, strength: 1.6 },
    },
  },
  {
    id: 'toxic',
    name: '瘋狂綠光',
    patch: {
      fill: grad('#f4ffd8', '#9dff6a', '#2f8f2a'),
      stroke: { on: true, width: 4, color: '#071a06' },
      outer: off,
      shadow: { on: true, color: '#000000', opacity: 0.6, blur: 12, x: 0, y: 5 },
      glow: { on: true, color: '#7dff4f', spread: 26, strength: 0.9 },
    },
  },
  {
    id: 'ink',
    name: '墨字白邊',
    patch: {
      fill: { mode: 'solid', color: '#1d1a17', opacity: 1 },
      stroke: { on: true, width: 5, color: '#fbf7ef' },
      outer: off,
      shadow: { on: true, color: '#000000', opacity: 0.35, blur: 10, x: 0, y: 3 },
      glow: off,
    },
  },
  {
    id: 'sepia',
    name: '泛黃回憶',
    patch: {
      fill: { mode: 'solid', color: '#f4e4c4', opacity: 1 },
      stroke: { on: true, width: 3, color: '#3a2a17' },
      outer: off,
      shadow: { on: true, color: '#1c1206', opacity: 0.5, blur: 14, x: 0, y: 4 },
      glow: { on: true, color: '#ffcf8a', spread: 20, strength: 0.5 },
    },
  },
  {
    id: 'pastel',
    name: '柔和粉彩',
    patch: {
      fill: { mode: 'solid', color: '#ffffff', opacity: 1 },
      stroke: { on: true, width: 5, color: '#f07aa2' },
      outer: off,
      shadow: { on: true, color: '#7a2c47', opacity: 0.35, blur: 10, x: 0, y: 4 },
      glow: { on: true, color: '#ffc2d6', spread: 22, strength: 0.8 },
    },
  },
  {
    id: 'hollow',
    name: '空心字',
    patch: {
      fill: { mode: 'solid', color: '#ffffff', opacity: 0 },
      stroke: { on: true, width: 4, color: '#ffffff' },
      outer: off,
      shadow: off,
      glow: off,
    },
  },
];

/** 漸層配色（一鍵套用三色） */
export const GRADIENT_KITS: readonly (readonly [string, readonly string[]])[] = [
  ['金', ['#fff6cf', '#f4c64e', '#a76d12']],
  ['銀', ['#ffffff', '#d5dbe3', '#808b99']],
  ['火焰', ['#fff3c4', '#ffae2b', '#d1300c']],
  ['冰晶', ['#ffffff', '#bfe6ff', '#4d8fd6']],
  ['血', ['#ff6b6b', '#c3121b', '#4c0005']],
  ['毒霧', ['#f1ffd2', '#88e04f', '#5b2a86']],
  ['黃昏', ['#ffe3a3', '#ff8e6e', '#7b3f9e']],
  ['深海', ['#d8fbff', '#3fb8d6', '#0b3a66']],
];

const K: Record<string, Patch> = Object.fromEntries(STYLE_KITS.map((k) => [k.id, k.patch]));
const kit = (id: string, more: Patch = {}): Patch => deepMerge(deepClone(K[id]), more);
const font = (family: string) => ({ source: 'google', family });

/* ---------- 範本 ----------
 * patch 只寫跟基礎預設不同的地方。loop: 'infinite' 表示預期會長時間留在畫面上。 */

export interface Template {
  id: string;
  group: string;
  name: string;
  text: string;
  sub?: string;
  loop?: LoopMode;
  patch: Patch;
}

export const TEMPLATES: Record<Mode, readonly Template[]> = {
  title: [
    /* 戰鬥 */
    {
      id: 'battle-start',
      group: '戰鬥',
      name: '戰鬥開始',
      text: '戰鬥開始',
      sub: 'BATTLE START',
      patch: {
        ...kit('fire'),
        weight: 900,
        intro: introOf('impact'),
        deco: { kind: 'band', fillAlpha: 0.6, gap: 0.32 },
        outro: outroOf('toCamera'),
        holdTime: 1.3,
      },
    },
    {
      id: 'round-end',
      group: '戰鬥',
      name: '回合結束',
      text: '回合結束',
      sub: 'END OF ROUND',
      patch: {
        ...kit('classic', { stroke: { color: '#14233a' } }),
        intro: introOf('slide', { dir: 'left' }),
        deco: { kind: 'rails', extend: 1.2 },
        outro: outroOf('slideOut', { dir: 'right' }),
      },
    },
    {
      id: 'enemy',
      group: '戰鬥',
      name: '敵人出現',
      text: '敵人出現',
      sub: 'WARNING',
      patch: {
        ...kit('blood'),
        weight: 900,
        intro: introOf('glitch'),
        deco: { kind: 'tape', gap: 0.45 },
        hold: { fx: 'glitchPulse', power: 1 },
        outro: outroOf('glitchOut'),
        holdTime: 1.8,
      },
    },
    {
      id: 'retreat',
      group: '戰鬥',
      name: '撤退',
      text: '撤　退',
      sub: 'RETREAT',
      patch: {
        ...kit('ice'),
        intro: introOf('slit'),
        deco: { kind: 'underline', extend: 1.5 },
        outro: outroOf('slitClose'),
      },
    },
    /* 探索 */
    {
      id: 'explore',
      group: '探索',
      name: '探索開始',
      text: '探索開始',
      sub: 'EXPLORATION',
      patch: {
        ...kit('classic', { glow: { on: true, color: '#9fd8ff', spread: 26, strength: 0.6 } }),
        intro: introOf('focus'),
        deco: { kind: 'corners' },
        outro: outroOf('blurOut'),
      },
    },
    {
      id: 'clue',
      group: '探索',
      name: '發現線索',
      text: '發現線索',
      sub: '— CLUE —',
      patch: {
        ...kit('gold', { glow: { on: true, color: '#ffd76a', spread: 30, strength: 0.9 } }),
        intro: introOf('pop'),
        deco: { kind: 'roundBox', fillAlpha: 0.5, lineWidth: 2, lineColor: '#f4c64e' },
        hold: { fx: 'breathe', power: 1 },
        outro: outroOf('zoomFade'),
      },
    },
    {
      id: 'investigated',
      group: '探索',
      name: '調查完成',
      text: '調查完成',
      sub: 'INVESTIGATION COMPLETE',
      patch: {
        ...kit('classic'),
        intro: introOf('wipe'),
        deco: { kind: 'rails', extend: 0.6 },
        outro: outroOf('wipeOut'),
      },
    },
    /* 主持 */
    {
      id: 'break',
      group: '主持',
      name: '休息時間',
      text: '休息時間',
      sub: '稍後回來，先去倒杯水吧',
      loop: 'infinite',
      patch: {
        ...kit('pastel'),
        font: font('Huninn'),
        weight: 400,
        subFont: font('Huninn'),
        subScale: 0.32,
        subTracking: 0.12,
        intro: introOf('rise'),
        deco: {
          kind: 'roundBox',
          fillColor: '#3b2430',
          fillAlpha: 0.45,
          lineWidth: 0,
          radius: 0.35,
        },
        hold: { fx: 'float', power: 1 },
        holdTime: 3,
      },
    },
    {
      id: 'wrap-up',
      group: '主持',
      name: '本日到此',
      text: '本日到此',
      sub: '今天的團就到這裡，辛苦了',
      patch: {
        ...kit('classic'),
        font: font('LXGW WenKai TC'),
        weight: 700,
        subFont: font('LXGW WenKai TC'),
        subTracking: 0.15,
        intro: introOf('fade', { dur: 1.2 }),
        deco: { kind: 'rails', extend: 0.4, lineWidth: 2 },
        holdTime: 2.5,
        outro: outroOf('fadeOut', { dur: 1 }),
      },
    },
    {
      id: 'next-time',
      group: '主持',
      name: '下次再見',
      text: '下次再見',
      sub: 'SEE YOU NEXT SESSION',
      patch: {
        ...kit('ice'),
        intro: introOf('converge'),
        deco: { kind: 'dashes', extend: 0.9 },
        outro: outroOf('spread'),
      },
    },
    {
      id: 'thanks',
      group: '主持',
      name: '感謝遊玩',
      text: '感謝遊玩',
      sub: 'THANK YOU FOR PLAYING',
      patch: {
        ...kit('gold'),
        font: font('LXGW WenKai TC'),
        weight: 700,
        intro: introOf('bounce'),
        deco: { kind: 'underline', extend: 0.8, lineColor: '#f4c64e' },
        outro: outroOf('floatUp'),
      },
    },
    /* 檢定：CoC 7 版 */
    {
      id: 'coc7-critical',
      group: 'CoC 7 版',
      name: '大成功',
      text: '大成功',
      sub: 'CRITICAL SUCCESS',
      patch: {
        ...kit('gold', { glow: { on: true, color: '#ffd24d', spread: 34, strength: 1.1 } }),
        weight: 900,
        intro: introOf('impact'),
        deco: { kind: 'corners', lineColor: '#ffe08a' },
        outro: outroOf('toCamera'),
      },
    },
    {
      id: 'coc7-extreme',
      group: 'CoC 7 版',
      name: '極限成功',
      text: '極限成功',
      sub: 'EXTREME SUCCESS',
      patch: {
        ...kit('gold', { glow: { on: true, color: '#fff0b0', spread: 30, strength: 1 } }),
        weight: 900,
        intro: introOf('whiteHot'),
        deco: { kind: 'rails', lineColor: '#fff0b0' },
        outro: outroOf('zoomFade'),
      },
    },
    {
      id: 'coc7-hard',
      group: 'CoC 7 版',
      name: '困難成功',
      text: '困難成功',
      sub: 'HARD SUCCESS',
      patch: {
        ...kit('ice'),
        intro: introOf('pop'),
        deco: { kind: 'dashes' },
        outro: outroOf('shrinkDot'),
      },
    },
    {
      id: 'coc7-success',
      group: 'CoC 7 版',
      name: '成功',
      text: '成功',
      sub: 'SUCCESS',
      patch: {
        ...kit('classic', { glow: { on: true, color: '#7cc8ff', spread: 26, strength: 0.7 } }),
        intro: introOf('rise'),
        deco: { kind: 'underline' },
      },
    },
    {
      id: 'coc7-fail',
      group: 'CoC 7 版',
      name: '失敗',
      text: '失敗',
      sub: 'FAILURE',
      patch: {
        ...kit('classic', { fill: { color: '#c9ced6' }, stroke: { color: '#22252b' } }),
        intro: introOf('drop'),
        outro: outroOf('sinkDown'),
      },
    },
    {
      id: 'coc7-fumble',
      group: 'CoC 7 版',
      name: '大失敗',
      text: '大失敗',
      sub: 'FUMBLE',
      patch: {
        ...kit('blood'),
        weight: 900,
        intro: introOf('glitch'),
        hold: { fx: 'glitchPulse', power: 1 },
        outro: outroOf('glitchOut'),
        deco: { kind: 'band', fillColor: '#1a0000', fillAlpha: 0.6 },
      },
    },
    {
      id: 'coc7-san',
      group: 'CoC 7 版',
      name: '理智檢定',
      text: '理智檢定',
      sub: 'SANITY CHECK',
      patch: {
        ...kit('toxic'),
        intro: introOf('flicker'),
        deco: { kind: 'band', fillColor: '#06140a', fillAlpha: 0.6 },
        hold: { fx: 'flickerHold', power: 1 },
        holdTime: 2,
        outro: outroOf('flickerOut'),
      },
    },
    /* 檢定：CoC 6 版 */
    {
      id: 'coc6-critical',
      group: 'CoC 6 版',
      name: '大成功',
      text: '大成功',
      sub: 'CRITICAL',
      patch: {
        ...kit('gold'),
        weight: 900,
        intro: introOf('shrink'),
        deco: {
          kind: 'frame',
          extend: 1.6,
          fillAlpha: 0.35,
          corner: 'diamond',
          lineColor: '#f4c64e',
        },
        outro: outroOf('zoomFade'),
      },
    },
    {
      id: 'coc6-special',
      group: 'CoC 6 版',
      name: '特殊',
      text: '特殊',
      sub: 'SPECIAL',
      patch: {
        ...kit('gold', {
          fill: { stops: evenStops(['#ffffff', '#e2c8ff', '#8a5cd6']) },
          stroke: { color: '#1e0f3a' },
          outer: { on: false },
          glow: { on: true, color: '#c39bff', spread: 26, strength: 0.8 },
        }),
        intro: introOf('spin'),
        outro: outroOf('scatter'),
      },
    },
    {
      id: 'coc6-success',
      group: 'CoC 6 版',
      name: '成功',
      text: '成功',
      sub: 'SUCCESS',
      patch: {
        ...kit('classic'),
        intro: introOf('zoomBack'),
        deco: { kind: 'underline' },
        outro: outroOf('toCamera'),
      },
    },
    {
      id: 'coc6-fail',
      group: 'CoC 6 版',
      name: '失敗',
      text: '失敗',
      sub: 'FAILURE',
      patch: {
        ...kit('classic', { fill: { color: '#bfc4cc' } }),
        intro: introOf('flip'),
        outro: outroOf('fadeOut'),
      },
    },
    {
      id: 'coc6-fumble',
      group: 'CoC 6 版',
      name: '大失敗',
      text: '大失敗',
      sub: 'FUMBLE',
      patch: {
        ...kit('blood'),
        weight: 900,
        intro: introOf('gather'),
        hold: { fx: 'jitter', power: 0.6 },
        outro: outroOf('scatter'),
      },
    },
    {
      id: 'coc6-san',
      group: 'CoC 6 版',
      name: 'SAN CHECK',
      text: 'SAN CHECK',
      sub: '理智判定',
      patch: {
        ...kit('toxic'),
        font: font('Cinzel'),
        weight: 900,
        subFont: font('Noto Serif TC'),
        subScale: 0.34,
        tracking: 0.12,
        intro: introOf('wipe', { dir: 'center' }),
        deco: { kind: 'rails', lineColor: '#9dff6a', extend: 0.5 },
        hold: { fx: 'flickerHold', power: 0.8 },
        outro: outroOf('wipeOut', { dir: 'center' }),
      },
    },
    /* 檢定：通用 */
    {
      id: 'gen-success',
      group: '通用',
      name: '成功',
      text: '成功',
      sub: 'SUCCESS',
      patch: {
        ...kit('classic', {
          stroke: { color: '#0e3b2a' },
          glow: { on: true, color: '#6dffb4', spread: 24, strength: 0.7 },
        }),
        intro: introOf('pop'),
        outro: outroOf('floatUp'),
      },
    },
    {
      id: 'gen-fail',
      group: '通用',
      name: '失敗',
      text: '失敗',
      sub: 'FAILURE',
      patch: {
        ...kit('classic', { fill: { color: '#d7d9de' }, stroke: { color: '#3b0f12' } }),
        intro: introOf('drop'),
        hold: { fx: 'none', power: 1 },
        outro: outroOf('sinkDown'),
      },
    },
    {
      id: 'gen-hit',
      group: '通用',
      name: '命中',
      text: '命中！',
      sub: 'HIT',
      patch: {
        ...kit('fire'),
        weight: 900,
        intro: introOf('impact', { power: 0.8 }),
        outro: outroOf('zoomFade'),
      },
    },
    {
      id: 'gen-dodge',
      group: '通用',
      name: '迴避',
      text: '迴避',
      sub: 'DODGE',
      patch: {
        ...kit('ice'),
        intro: introOf('slide', { dir: 'right', dur: 0.5 }),
        deco: { kind: 'dashes', extend: 0.6 },
        outro: outroOf('slideOut', { dir: 'left' }),
      },
    },
  ],

  long: [
    {
      id: 'opening',
      group: '開場與預告',
      name: '開場白',
      text: '那年秋天，雨下了整整一個禮拜。\n\n你們各自收到一封沒有署名的信，\n信上只寫了一個地址，和一句話——\n「請在月亮升起之前抵達。」\n\n故事，就從那扇吱呀作響的門開始。',
      patch: {
        weight: 600,
        stroke: { width: 4 },
        flow: { kind: 'seq', charFx: 'fade', charDur: 0.4 },
        bg: { kind: 'bottom', alpha: 0.55 },
        holdTime: 1.8,
        outro: outroOf('fadeOut', { dur: 0.8 }),
      },
    },
    {
      id: 'preview',
      group: '開場與預告',
      name: '預告（中央逐字）',
      text: '下回——\n霧散之前，誰也別想離開這座島。',
      patch: {
        ...kit('blood'),
        weight: 900,
        size: 52,
        flow: { kind: 'big', cps: 9, bigRatio: 0.5, bigPause: 0.45, impact: 1 },
        holdTime: 1.8,
        outro: outroOf('toCamera'),
      },
    },
    {
      id: 'chapter',
      group: '開場與預告',
      name: '章節（中央展開）',
      text: '第一章\n霧中的來信',
      patch: {
        ...kit('gold'),
        size: 88,
        leading: 1.6,
        flow: { kind: 'stack', stackHold: 0.45, spreadTime: 0.9 },
        holdTime: 1.6,
        outro: outroOf('blurOut', { gap: 0 }),
      },
    },
    {
      id: 'memory',
      group: '旁白',
      name: '回憶（流動）',
      text: '那天的蟬聲很吵。\n我們在廟口的榕樹下，\n約好了明年還要一起來。\n\n後來，只有我一個人回來。',
      patch: {
        ...kit('sepia'),
        font: font('LXGW WenKai TC'),
        weight: 400,
        flow: { kind: 'scan', charFx: 'mist', charDur: 0.9, lineGap: 1.1, scanTime: 1.2 },
        bg: { kind: 'vignette', color: '#1a1108', alpha: 0.6 },
        holdTime: 1.6,
        outro: outroOf('blurOut', { gap: 0 }),
      },
    },
    {
      id: 'narration',
      group: '旁白',
      name: '旁白（整段浮現）',
      text: '風停了。\n整座村子安靜得像是在屏住呼吸。',
      patch: {
        weight: 500,
        size: 50,
        flow: { kind: 'all', charFx: 'rise', charDur: 1.2 },
        intro: { power: 0.5 },
        bg: { kind: 'solid', alpha: 0.35 },
        holdTime: 2.2,
        outro: outroOf('fadeOut', { dur: 1 }),
      },
    },
    {
      id: 'letter',
      group: '信件與訊息',
      name: '信件（直書）',
      text: '敬啟者：\n見字如面。\n倘若您讀到這封信，\n代表我已經不在宅邸裡了。\n地下室的鑰匙，\n藏在第三幅肖像畫的背後。',
      patch: {
        ...kit('ink'),
        font: font('LXGW WenKai TC'),
        weight: 400,
        size: 50,
        leading: 1.7,
        vertical: true,
        align: 'start',
        paging: false,
        wrapWidth: false,
        flow: { kind: 'seq', cps: 10, charFx: 'focus', charDur: 0.5 },
        holdTime: 2.5,
      },
    },
    {
      id: 'system',
      group: '信件與訊息',
      name: '系統訊息',
      text: '【系統】連線已建立。\n正在讀取調查員資料……\n警告：偵測到未知的訊號來源。',
      patch: {
        ...kit('neon'),
        font: font('Noto Sans TC'),
        weight: 500,
        size: 40,
        align: 'start',
        anchor: 'ml',
        tracking: 0.04,
        flow: { kind: 'seq', cps: 22, charFx: 'type', charDur: 0, cursor: true, punctPause: 0.2 },
        holdTime: 2,
        outro: outroOf('glitchOut'),
      },
    },
    {
      id: 'credits',
      group: '片尾',
      name: '片尾名單（捲動）',
      text: '劇本\n〈霧中的來信〉\n\n主持人\n阿樹\n\n調查員\n小林　阿光　莉莉　老陳\n\n特別感謝\n每一位準時上線的你\n\n\n感謝遊玩',
      patch: {
        font: font('Noto Sans TC'),
        weight: 500,
        size: 40,
        leading: 1.8,
        paging: false,
        preBlank: 0,
        postBlank: 0,
        flow: { kind: 'scroll', speed: 90, edgeFade: true },
        stroke: { width: 3 },
      },
    },
  ],

  caption: [
    {
      id: 'place-time',
      group: '地點與時間',
      name: '地點＋時間（左下）',
      text: '舊校舍・三樓走廊',
      sub: '23:47',
      patch: {
        size: 56,
        anchor: 'bl',
        align: 'start',
        subScale: 0.6,
        subTracking: 0.1,
        subGap: 0.25,
        intro: introOf('slide', { dir: 'left' }),
        deco: { kind: 'sideBar', lineWidth: 5, gap: 0.3 },
        outro: outroOf('slideOut', { dir: 'left' }),
      },
    },
    {
      id: 'day',
      group: '地點與時間',
      name: '日期（右下）',
      text: '第二天　早上',
      sub: '天氣：陰',
      patch: {
        size: 54,
        anchor: 'br',
        align: 'end',
        subScale: 0.45,
        intro: introOf('mist'),
        deco: { kind: 'underline', extend: 0.3, gap: 0.25 },
        outro: outroOf('blurOut'),
      },
    },
    {
      id: 'merge',
      group: '地點與時間',
      name: '上下合流（下方中央）',
      text: '某處的地下室',
      sub: 'UNKNOWN BASEMENT',
      patch: {
        size: 60,
        anchor: 'bc',
        subIntro: 'slideOpp',
        subOffset: -0.6,
        intro: introOf('slide', { dir: 'up', gap: 0.03 }),
        deco: { kind: 'rails', extend: 0.5, lineWidth: 2 },
        outro: outroOf('fadeOut'),
      },
    },
    {
      id: 'center-spread',
      group: '場景',
      name: '中央展開（正中央）',
      text: '第三天　深夜',
      sub: '—— 暴風雨 ——',
      patch: {
        size: 80,
        intro: introOf('stack'),
        deco: { kind: 'frame', extend: 2.2, fillAlpha: 0.35 },
        outro: outroOf('spread'),
      },
    },
    {
      id: 'flashback',
      group: '場景',
      name: '回想（左上）',
      text: '十年前',
      sub: '夏天的廟口',
      patch: {
        ...kit('sepia'),
        font: font('LXGW WenKai TC'),
        weight: 700,
        size: 64,
        anchor: 'tl',
        align: 'start',
        subScale: 0.5,
        intro: introOf('converge'),
        deco: { kind: 'dashes', extend: 0.4 },
        outro: outroOf('spread'),
      },
    },
    {
      id: 'typewriter',
      group: '場景',
      name: '打字機（左下）',
      text: '調查紀錄　第 07 號',
      sub: '深夜 02:13　研究室',
      patch: {
        font: font('Noto Sans TC'),
        weight: 500,
        size: 46,
        anchor: 'bl',
        align: 'start',
        subScale: 0.6,
        subTracking: 0.08,
        intro: introOf('type'),
        subIntro: 'type',
        outro: outroOf('backspace'),
      },
    },
    {
      id: 'vertical-place',
      group: '場景',
      name: '直書地點（右上）',
      text: '山中古寺',
      sub: '子時・霧',
      patch: {
        size: 64,
        vertical: true,
        anchor: 'tr',
        align: 'start',
        subScale: 0.45,
        intro: introOf('mist'),
        deco: { kind: 'sideBar', lineWidth: 4 },
        outro: outroOf('blurOut'),
      },
    },
    {
      id: 'chapter-card',
      group: '章節',
      name: '章節標題（正中央）',
      text: '第一章',
      sub: '霧中的來信',
      patch: {
        ...kit('gold'),
        size: 96,
        subScale: 0.42,
        subTracking: 0.3,
        intro: introOf('wipe', { dir: 'center' }),
        deco: { kind: 'rails', extend: 1, lineColor: '#f4c64e' },
        outro: outroOf('wipeOut', { dir: 'center' }),
      },
    },
  ],
};

export function templateById(mode: Mode, id: string | null | undefined): Template {
  return TEMPLATES[mode].find((t) => t.id === id) ?? TEMPLATES[mode][0];
}

/** 基礎預設＋範本差異 */
export function settingsFromTemplate(mode: Mode, tpl: Template): Settings {
  const s = baseSettings(mode);
  deepMerge(s, deepClone(tpl.patch));
  s.text = tpl.text || '';
  s.sub = tpl.sub || '';
  s.loop = tpl.loop || 'once';
  return s;
}
