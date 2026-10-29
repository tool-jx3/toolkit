/**
 * 環境音的目錄：分類、每個聲音的定義、參數的預設值與整理（網址、存檔讀回來時夾在範圍內）。
 */
import { FIRE_SOUNDS } from './sounds/fire';
import { INDOOR_SOUNDS } from './sounds/indoor';
import { LIFE_SOUNDS } from './sounds/life';
import { MOOD_SOUNDS } from './sounds/mood';
import { NOISE_SOUNDS } from './sounds/noise';
import { WATER_SOUNDS } from './sounds/water';
import { WEATHER_SOUNDS } from './sounds/weather';
import type { AmbienceCategoryId, AmbienceParams, AmbienceSoundDef } from './types';

export const AMBIENCE_CATEGORIES: readonly { id: AmbienceCategoryId; label: string }[] = [
  { id: 'weather', label: '雨與天氣' },
  { id: 'water', label: '水' },
  { id: 'fire', label: '火' },
  { id: 'indoor', label: '室內' },
  { id: 'life', label: '生物與人' },
  { id: 'mood', label: '氛圍' },
  { id: 'noise', label: '雜訊' },
];

/** 所有聲音（分類內的順序就是清單上的順序） */
export const AMBIENCE_SOUNDS: readonly AmbienceSoundDef[] = [
  ...WEATHER_SOUNDS,
  ...WATER_SOUNDS,
  ...FIRE_SOUNDS,
  ...INDOOR_SOUNDS,
  ...LIFE_SOUNDS,
  ...MOOD_SOUNDS,
  ...NOISE_SOUNDS,
];

const BY_ID = new Map(AMBIENCE_SOUNDS.map((s) => [s.id, s]));

export const AMBIENCE_SOUND_IDS: readonly string[] = AMBIENCE_SOUNDS.map((s) => s.id);

export function ambienceSound(id: string): AmbienceSoundDef | undefined {
  return BY_ID.get(id);
}

export const isAmbienceSoundId = (id: unknown): id is string =>
  typeof id === 'string' && BY_ID.has(id);

export function soundsInCategory(cat: AmbienceCategoryId): AmbienceSoundDef[] {
  return AMBIENCE_SOUNDS.filter((s) => s.category === cat);
}

/** 參數的預設值 */
export function defaultParams(def: AmbienceSoundDef): AmbienceParams {
  const out: AmbienceParams = {};
  for (const p of def.params) out[p.id] = p.default;
  return out;
}

/**
 * 整理參數：只留這個聲音有的參數，數值夾在範圍內、對齊間隔；選項的索引夾在選項數之內；缺的補預設值。
 */
export function sanitizeParams(def: AmbienceSoundDef, raw: unknown): AmbienceParams {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: AmbienceParams = {};
  for (const p of def.params) {
    const v = src[p.id];
    const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
    if (!Number.isFinite(num)) {
      out[p.id] = p.default;
      continue;
    }
    if (p.kind === 'choice') {
      out[p.id] = Math.max(0, Math.min(p.options.length - 1, Math.round(num)));
    } else {
      const stepped = p.min + Math.round((num - p.min) / p.step) * p.step;
      out[p.id] = Math.max(p.min, Math.min(p.max, Number(stepped.toFixed(6))));
    }
  }
  return out;
}

/** 參數是不是都是預設值 */
export function isDefaultParams(def: AmbienceSoundDef, params: AmbienceParams): boolean {
  return def.params.every((p) => params[p.id] === p.default);
}
