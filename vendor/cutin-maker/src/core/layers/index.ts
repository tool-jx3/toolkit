import type { Layer } from '../types';
import { bgFlashLayer } from './bgFlash';
import { confettiLayer } from './confetti';
import { radiateLayer } from './radiate';
import { ringLayer } from './ring';
import { sparkleLayer } from './sparkle';

/** 追加は 1ファイル + この 1行 */
const REGISTRY: Layer[] = [radiateLayer, sparkleLayer, bgFlashLayer, confettiLayer, ringLayer];

const BY_TYPE = new Map<string, Layer>(REGISTRY.map((l) => [l.type, l]));

export function getLayer(type: string): Layer | undefined {
  return BY_TYPE.get(type);
}

export const LAYER_TYPES = REGISTRY.map((l) => l.type);

/* 値は i18n key。表示側で t() を通す。 */
export const LAYER_LABELS: Record<string, string> = {
  radiate: 'layer.radiate',
  sparkle: 'layer.sparkle',
  bgFlash: 'layer.bgFlash',
  confetti: 'layer.confetti',
  ring: 'layer.ring',
};
