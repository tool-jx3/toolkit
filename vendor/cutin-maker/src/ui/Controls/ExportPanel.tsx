import { CCFOLIA_SIZE_PRESETS, fmtBytes, type ExportTarget } from '../../core/targets';
import type { OutputFormat, RenderParams } from '../../core/types';
import { t } from '../../i18n';
import { Advanced, Choice, Field, NumberInput, Section, Slider } from '../kit';

interface Props {
  params: RenderParams;
  target: ExportTarget;
  onSize: (w: number, h: number) => void;
  onFrames: (n: number) => void;
  onFps: (n: number) => void;
  onFormat: (f: OutputFormat) => void;
  onContentScale: (v: number) => void;
  onOutput: (patch: Partial<RenderParams['output']>) => void;
}

const FORMAT_LABELS: Record<OutputFormat, string> = { apng: 'format.apng', gif: 'format.gif', png: 'format.png' };

export function ExportPanel({ params, target, onSize, onFrames, onFps, onFormat, onContentScale, onOutput }: Props) {
  const sizePreset = CCFOLIA_SIZE_PRESETS.find((p) => p.w === params.canvas.w && p.h === params.canvas.h)?.id ?? '';

  return (
    <div>
      <Section title={t('export.format')}>
        <Choice
          columns={1}
          value={params.output.format}
          onChange={onFormat}
          items={(['apng', 'gif', 'png'] as OutputFormat[]).map((f) => ({
            id: f,
            label: t(FORMAT_LABELS[f]),
            sub: target.formats.includes(f) ? undefined : t('export.unsupported', target.label),
            disabled: !target.formats.includes(f),
          }))}
        />
      </Section>

      <Section title={t('export.size')}>
        {target.fixedSize ? (
          <p className="text-[11px] text-neutral-400">
            {t('export.fixedNote', target.label, target.fixedSize.w, target.fixedSize.h)}
          </p>
        ) : (
          <Choice
            columns={2}
            value={sizePreset}
            onChange={(id) => {
              const p = CCFOLIA_SIZE_PRESETS.find((x) => x.id === id)!;
              onSize(p.w, p.h);
              onFrames(p.frames);
              onFps(p.fps);
              onContentScale(p.contentScale ?? 1);
            }}
            items={CCFOLIA_SIZE_PRESETS.map((p) => ({ id: p.id, label: p.label, sub: `${p.w}×${p.h}` }))}
          />
        )}
        <p className="mt-2 text-[11px] text-neutral-500">
          {t('export.current', params.canvas.w, params.canvas.h, params.frameCount, params.fps, (params.frameCount / params.fps).toFixed(2), fmtBytes(target.maxBytes))}
        </p>
      </Section>

      <Advanced>
        <Section title={t('export.dimensions')}>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('export.width')}>
              <NumberInput value={params.canvas.w} min={64} max={1600} step={8} onChange={(v) => onSize(Math.round(v), params.canvas.h)} />
            </Field>
            <Field label={t('export.height')}>
              <NumberInput value={params.canvas.h} min={64} max={1600} step={8} onChange={(v) => onSize(params.canvas.w, Math.round(v))} />
            </Field>
          </div>
          <Slider label={t('export.frames')} value={params.frameCount} min={2} max={60} step={1} onChange={(v) => onFrames(Math.round(v))} />
          <Slider label="fps" value={params.fps} min={5} max={30} step={1} onChange={(v) => onFps(Math.round(v))} format={(v) => `${v} fps`} />
          <Slider
            label={t('export.contentScale')}
            value={params.contentScale ?? 1}
            min={0.4}
            max={1}
            step={0.02}
            onChange={onContentScale}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Section>

        <Section title={t('export.encode')}>
          <Slider
            label={t('export.colors')}
            value={params.output.colors}
            min={0}
            max={256}
            step={16}
            onChange={(v) => onOutput({ colors: Math.round(v) })}
            format={(v) => (v === 0 ? t('export.lossless') : t('export.colorCount', v))}
          />
          {params.output.format === 'gif' && (
            <Field label={t('export.matte')} hint={params.output.matte ?? t('export.keepAlpha')}>
              <div className="flex items-center gap-2">
                <input type="color" value={params.output.matte ?? '#313338'} onChange={(e) => onOutput({ matte: e.target.value })} />
                <button type="button" className="text-xs text-neutral-400 underline" onClick={() => onOutput({ matte: null })}>
                  {t('export.keepAlpha')}
                </button>
                <button type="button" className="text-xs text-neutral-400 underline" onClick={() => onOutput({ matte: '#313338' })}>
                  {t('export.discordDark')}
                </button>
              </div>
            </Field>
          )}
        </Section>
      </Advanced>
    </div>
  );
}
