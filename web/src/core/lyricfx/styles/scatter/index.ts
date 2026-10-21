/**
 * 演出風格「散落」（lyric-fx 規格 1.4～1.8、3.3～3.7）：每一句落在畫面上的隨機位置、帶著傾斜與透視逐字打出、
 * 每個字抖動；唱完的句往上飄著淡出；同時在畫面上的幾句互相避開；可以預點亮下一、兩句。
 */
import type { LyricFxLine, LyricStyle } from '../../types';
import { drawScatter } from './draw';
import { type ScatterPlan, planScatter, scatterLock } from './plan';
import { normalizeScatter, SCATTER_CONTROLS, type ScatterSettings, scatterDefaults } from './settings';
import { SCATTER_TEXT } from './strings';

export const scatterStyle: LyricStyle<ScatterSettings, ScatterPlan> = {
  id: 'scatter',
  name: SCATTER_TEXT.name,
  description: SCATTER_TEXT.description,
  defaults: scatterDefaults,
  normalize: normalizeScatter,
  controls: SCATTER_CONTROLS,
  fonts: (s) => {
    const list = [s.font];
    if (s.latinFont && (s.latinFont.family !== s.font.family || s.latinFont.weight !== s.font.weight))
      list.push(s.latinFont);
    return list;
  },
  plan: planScatter,
  draw: drawScatter,
  lock: scatterLock,
  notes(lines: readonly LyricFxLine[], s) {
    const out: string[] = [];
    if (s.preview > 0 && lines.some((l) => l.tr)) out.push(SCATTER_TEXT.noteBoth);
    return out;
  },
  visibleAt(plan, key, t) {
    const p = plan.byKey.get(key);
    if (!p) return false;
    return t >= (p.slotBorn ?? p.start) && t < Math.max(p.fadeEnd, p.fadeStart);
  },
};

export * from './draw';
export * from './plan';
export * from './settings';
export { SCATTER_TEXT } from './strings';
