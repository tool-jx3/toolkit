import { LAYER_LABELS } from '../../core/layers';
import { applyEffect, EFFECT_TEMPLATES } from '../../core/templates';
import type { MotionSpec, RenderParams } from '../../core/types';
import { t } from '../../i18n';
import { Advanced, Choice, Field, Section, Slider, ThumbChoice } from '../kit';

interface Props {
  params: RenderParams;
  axes: { effectId: string };
  onEffect: (id: string) => void;
  onLayerParam: (layerIndex: number, key: string, value: number | string | boolean) => void;
  onMotionType: (t: MotionSpec['type']) => void;
  onMotionAmount: (v: number) => void;
  onSeed: (seed: number) => void;
}

/* label は i18n key。描画のたびに t() を引くので言語切替に追従する。 */
const MOTIONS: Array<{ id: MotionSpec['type']; label: string }> =
  (['none', 'pulse', 'bounce', 'shake', 'rotate', 'wave'] as MotionSpec['type'][])
    .map((id) => ({ id, label: `motion.${id}` }));

/** レイヤーの数値パラメータは総当りでスライダーにする（追加時にUI改修が要らない） */
const RANGES: Record<string, { min: number; max: number; step: number; label: string }> = {
  count: { min: 4, max: 96, step: 1, label: 'range.count' },
  minLen: { min: 0.02, max: 0.4, step: 0.01, label: 'range.minLen' },
  maxLen: { min: 0.05, max: 0.6, step: 0.01, label: 'range.maxLen' },
  width: { min: 0.002, max: 0.05, step: 0.001, label: 'range.width' },
  gap: { min: 0, max: 0.3, step: 0.01, label: 'range.gap' },
  groups: { min: 1, max: 4, step: 1, label: 'range.groups' },
  jitter: { min: 0, max: 1, step: 0.05, label: 'range.jitter' },
  size: { min: 0.01, max: 0.2, step: 0.005, label: 'range.size' },
  twinkleSpeed: { min: 1, max: 6, step: 1, label: 'range.twinkleSpeed' },
  speed: { min: 1, max: 5, step: 1, label: 'range.speed' },
  saturation: { min: 0, max: 1, step: 0.05, label: 'range.saturation' },
  lightness: { min: 0, max: 1, step: 0.05, label: 'range.lightness' },
  alpha: { min: 0, max: 1, step: 0.05, label: 'range.alpha' },
};

export function MotionPanel({ params, axes, onEffect, onLayerParam, onMotionType, onMotionAmount, onSeed }: Props) {
  return (
    <div>
      <Section title={t('motion.effectSection')}>
        <ThumbChoice
          columns={3}
          size={88}
          value={axes.effectId}
          onChange={onEffect}
          items={EFFECT_TEMPLATES.map((e) => ({ id: e.id, label: e.label, params: applyEffect(params, e.id) }))}
        />
      </Section>

      <Section title={t('motion.section')}>
        <Choice columns={3} value={params.motion.type} onChange={onMotionType} items={MOTIONS.map((m) => ({ id: m.id, label: t(m.label) }))} />
        {params.motion.type !== 'none' && (
          <div className="mt-2">
            <Slider
              label={t('motion.amount')}
              value={params.motion.amount}
              min={params.motion.type === 'rotate' ? 1 : 0}
              max={params.motion.type === 'rotate' ? 3 : 0.2}
              step={params.motion.type === 'rotate' ? 1 : 0.005}
              onChange={onMotionAmount}
            />
          </div>
        )}
      </Section>

      <Advanced>
        {params.layers.map((layer, i) => (
          <Section key={`${layer.type}-${i}`} title={t('motion.layerTuning', t(LAYER_LABELS[layer.type] ?? layer.type))}>
            {Object.entries(layer.params).map(([key, value]) => {
              if (typeof value === 'number') {
                const r = RANGES[key] ?? { min: 0, max: 1, step: 0.01, label: key };
                return (
                  <Slider key={key} label={t(r.label)} value={value} min={r.min} max={r.max} step={r.step} onChange={(v) => onLayerParam(i, key, v)} />
                );
              }
              if (typeof value === 'boolean') {
                return (
                  <Field key={key} label={key === 'pulse' ? t('range.pulse') : key}>
                    <input type="checkbox" checked={value} onChange={(e) => onLayerParam(i, key, e.target.checked)} />
                  </Field>
                );
              }
              if (key === 'colorMode') {
                return (
                  <Field key={key} label={t('range.color')}>
                    <Choice
                      columns={2}
                      value={value as string}
                      onChange={(v) => onLayerParam(i, key, v)}
                      items={[{ id: 'rainbow', label: t('colorMode.rainbow') }, { id: 'solid', label: t('colorMode.solid') }]}
                    />
                    {value === 'solid' && (
                      <input
                        type="color"
                        className="mt-2"
                        value={typeof layer.params.color === 'string' ? layer.params.color : '#ffffff'}
                        onChange={(e) => onLayerParam(i, 'color', e.target.value)}
                      />
                    )}
                  </Field>
                );
              }
              // colorMode を持つレイヤーの色は上でまとめて出す
              if (key === 'color' && 'colorMode' in layer.params) return null;
              if (key === 'color') {
                return (
                  <Field key={key} label={t('range.color')}>
                    <input type="color" value={value as string} onChange={(e) => onLayerParam(i, key, e.target.value)} />
                  </Field>
                );
              }
              return null;
            })}
          </Section>
        ))}

        <Section title={t('motion.seedSection')}>
          <Slider label={t('motion.seed')} value={params.seed} min={1} max={99999} step={1} onChange={onSeed} />
        </Section>
      </Advanced>
    </div>
  );
}
