/**
 * 選效果（帶入該效果的預設值）與效果一覽用的示範設定。
 */

import { setCfg } from './controls';
import { introOf, outroOf } from './library';
import { INTRO, OUTRO } from './motion';
import { deepClone, type Settings } from './settings';
import { updateCfg } from './store';

/** 選登場效果：帶入預設時長、字間隔，曲線回到自動、強度回到 1，方向不適用時改成第一個 */
export function pickIntro(id: string): void {
  updateCfg((c) => {
    const d = INTRO[id];
    const keepDir = !!d.dirs?.some((x) => x[0] === c.intro.dir);
    c.intro = {
      ...c.intro,
      fx: id,
      dur: d.dur || c.intro.dur,
      gap: d.gap || 0,
      curve: 'auto',
      power: 1,
      dir: d.dirs ? (keepDir ? c.intro.dir : d.dirs[0][0]) : c.intro.dir,
    };
  });
}

export function pickOutro(id: string): void {
  updateCfg((c) => {
    const d = OUTRO[id];
    const keepDir = !!d.dirs?.some((x) => x[0] === c.outro.dir);
    c.outro = {
      ...c.outro,
      fx: id,
      dur: d.dur || c.outro.dur,
      gap: d.gap || 0,
      curve: 'auto',
      power: 1,
      dir: d.dirs ? (keepDir ? c.outro.dir : d.dirs[0][0]) : c.outro.dir,
    };
  });
}

/** 長文：每個字怎麼出現 */
export function pickChar(id: string): void {
  updateCfg((c) => {
    const d = INTRO[id];
    c.flow.charFx = id;
    if (d.instant) c.flow.charDur = 0;
    else if (!(c.flow.charDur > 0)) c.flow.charDur = 0.4;
    c.intro.curve = 'auto';
    c.intro.power = 1;
    if (d.dirs && !d.dirs.some((x) => x[0] === c.intro.dir)) c.intro.dir = d.dirs[0][0];
  });
}

export const pickHold = (id: string): void => setCfg('hold.fx', id);
export const pickFlow = (id: string): void => setCfg('flow.kind', id);

export type GalleryKind = 'intro' | 'outro' | 'hold' | 'char' | 'flow';

export const PICKERS: Record<GalleryKind, (id: string) => void> = {
  intro: pickIntro,
  outro: pickOutro,
  hold: pickHold,
  char: pickChar,
  flow: pickFlow,
};

/** 長文的第一頁（最多 3 行、每行 18 字） */
function firstPage(text: string): string {
  const pages = String(text || '').split(/\n[ \t　]*\n/);
  const p = (pages.find((x) => x.trim()) || '').split('\n').slice(0, 3);
  return p.map((l) => Array.from(l).slice(0, 18).join('')).join('\n');
}

/** 效果一覽的示範設定 */
export function galleryVariant(kind: GalleryKind, id: string, base: Settings): Settings {
  const c = deepClone(base);
  c.preBlank = 0.15;
  c.postBlank = 0.1;
  /* 登場效果、長文流程、每個字的一覽一定要有登場動畫（登場關閉時也示範） */
  if (kind === 'intro' || kind === 'flow' || kind === 'char') c.introOn = true;
  if (c.mode === 'long') {
    c.text = firstPage(c.text);
    c.paging = false;
  }
  if (kind === 'intro') {
    const keepDir = !!INTRO[id].dirs?.some((x) => x[0] === c.intro.dir);
    c.intro = introOf(id, { order: c.intro.order, ...(keepDir ? { dir: c.intro.dir } : {}) });
    c.hold.fx = 'none';
    c.holdTime = 0.9;
    c.outroOn = false;
  } else if (kind === 'outro') {
    c.outroOn = true;
    c.outro = outroOf(id);
    if (c.mode !== 'long') c.intro = introOf('fade', { dur: 0.25 });
    else {
      c.flow.kind = 'all';
      c.flow.charFx = 'fade';
      c.flow.charDur = 0.25;
    }
    c.hold.fx = 'none';
    c.holdTime = 0.5;
  } else if (kind === 'hold') {
    c.hold.fx = id;
    c.holdTime = 3.2;
    c.outroOn = false;
    if (id === 'breathe' && !c.glow.on) c.glow.on = true;
    if (c.mode !== 'long') c.intro = introOf('fade', { dur: 0.3 });
    else {
      c.flow.kind = 'all';
      c.flow.charFx = 'fade';
      c.flow.charDur = 0.3;
    }
  } else if (kind === 'flow') {
    c.flow.kind = id;
    c.outroOn = false;
    c.holdTime = 0.9;
    c.hold.fx = 'none';
    if (id === 'scroll') c.flow.speed = Math.max(c.flow.speed, 140);
  } else if (kind === 'char') {
    if (['big', 'stack', 'scroll'].includes(c.flow.kind)) c.flow.kind = 'seq';
    c.flow.charFx = id;
    c.flow.charDur = INTRO[id].instant ? 0 : Math.max(0.4, c.flow.charDur || 0.4);
    c.outroOn = false;
    c.holdTime = 0.8;
    c.hold.fx = 'none';
  }
  return c;
}
