import { useEffect, useState } from 'react';
import { ensureFont, FONTS } from '../../core/fonts';
import { applyDeco, applyTheme, COLOR_THEMES, DECO_TEMPLATES } from '../../core/templates';
import type { BackgroundSpec, ColorSpec, RenderParams } from '../../core/types';
import { t as tr } from '../../i18n';
import { Advanced, Choice, Field, Section, Slider, ThumbChoice } from '../kit';

interface Props {
  params: RenderParams;
  axes: { decoId: string; themeId: string };
  onFont: (id: string) => void;
  onDeco: (id: string) => void;
  onTheme: (id: string) => void;
  onBackground: (bg: BackgroundSpec) => void;
  onPatchText: (patch: Partial<RenderParams['text']>) => void;
}

/** 書体は名前から見た目が想像できないので、ラベルをその書体自身で描く */
function FontChoices({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [ready, setReady] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // 一覧はラベル数文字ぶんだけロードする（全書体プリロードは数MB×6になる）
    FONTS.forEach((f) => {
      ensureFont(f, f.label).then(() => setReady((r) => ({ ...r, [f.id]: true })));
    });
  }, []);
  return (
    <Choice
      columns={2}
      value={value}
      onChange={onChange}
      items={FONTS.map((f) => ({
        id: f.id,
        label: f.label,
        style: ready[f.id] ? { fontFamily: `${f.family}, sans-serif`, fontWeight: f.weight, fontSize: 16 } : undefined,
      }))}
    />
  );
}

export function LookPanel({ params, axes, onFont, onDeco, onTheme, onBackground, onPatchText }: Props) {
  const deco = DECO_TEMPLATES.find((d) => d.id === axes.decoId);
  const transparent = params.background.kind === 'transparent';
  const warnings = [
    deco?.compatible.background === 'dark' && transparent
      ? tr('look.warnDark')
      : null,
    deco?.needsOpaqueBackground && transparent
      ? tr('look.warnKnockout')
      : null,
  ].filter(Boolean) as string[];

  const decorations = params.text.decorations;
  const hasType = (type: 'fill' | 'stroke') => decorations.some((d) => d.type === type);
  const colorOf = (type: 'fill' | 'stroke') => {
    const hit = decorations.find((d) => d.type === type) as { color?: ColorSpec } | undefined;
    return hit?.color?.kind === 'solid' ? hit.color.color : '#ffffff';
  };
  /** 同じ種類の飾りをまとめて単色に塗り替える（虹グラデを単色で上書きする用） */
  const paint = (type: 'fill' | 'stroke', color: string) => {
    onPatchText({
      decorations: decorations.map((d) => (d.type === type ? { ...d, color: { kind: 'solid', color } } : d)),
    });
  };

  const backgroundSection = (
          <Section title={tr('look.background')}>
            <Choice
              columns={3}
              value={params.background.kind === 'transparent' ? 'transparent' : params.background.kind === 'rainbow' ? 'rainbow' : 'solid'}
              onChange={(k) => {
                if (k === 'transparent') onBackground({ kind: 'transparent' });
                else if (k === 'rainbow') onBackground({ kind: 'rainbow', saturation: 0.5, lightness: 0.6, cycles: 1, speed: 1, angle: 0 });
                else onBackground({ kind: 'solid', color: '#101216' });
              }}
              items={[
                { id: 'transparent', label: tr('bg.transparent') },
                { id: 'solid', label: tr('bg.solid') },
                { id: 'rainbow', label: tr('bg.rainbow') },
              ]}
            />
            {params.background.kind === 'solid' && (
              <div className="mt-2">
                <Field label={tr('look.backgroundColor')}>
                  <input type="color" value={params.background.color} onChange={(e) => onBackground({ kind: 'solid', color: e.target.value })} />
                </Field>
              </div>
            )}
            {transparent && (
              <p className="mt-2 text-[11px] text-neutral-500">{tr('look.transparentNote')}</p>
            )}
          </Section>
  );

  return (
    <div>
      <Section title={tr('look.font')}>
        <FontChoices value={params.text.fontId} onChange={onFont} />
      </Section>

      <Section title={tr('look.deco')}>
        <ThumbChoice
          columns={3}
          size={88}
          value={axes.decoId}
          onChange={onDeco}
          items={DECO_TEMPLATES.map((d) => ({ id: d.id, label: d.label, params: applyDeco(params, d.id, axes.themeId) }))}
        />
        {warnings.map((w) => (
          <p key={w} className="mt-2 text-[11px] text-amber-400">{w}</p>
        ))}
      </Section>

      <Section title={tr('look.color')}>
        <ThumbChoice
          columns={3}
          size={88}
          value={axes.themeId}
          onChange={onTheme}
          items={COLOR_THEMES.map((t) => ({ id: t.id, label: t.label, params: applyTheme(params, t.id, axes.decoId) }))}
        />
        <Advanced>
          <div className="mt-3 flex flex-wrap gap-4">
            {hasType('fill') && (
              <Field label={tr('look.fillColor')}>
                <input type="color" value={colorOf('fill')} onChange={(e) => paint('fill', e.target.value)} />
              </Field>
            )}
            {hasType('stroke') && (
              <Field label={tr('look.strokeColor')}>
                <input type="color" value={colorOf('stroke')} onChange={(e) => paint('stroke', e.target.value)} />
              </Field>
            )}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">{tr('look.colorNote')}</p>
        </Advanced>
      </Section>

      {/* くり抜きは背景ありきの装飾なので、かんたん表示でも背景を触れるようにする */}
      {deco?.needsOpaqueBackground ? backgroundSection : <Advanced>{backgroundSection}</Advanced>}

      <Advanced>
        <Section title={tr('look.typeset')}>
          <Slider label={tr('look.scale')} value={params.text.scale} min={0.5} max={1.2} step={0.01} onChange={(v) => onPatchText({ scale: v })} />
          <Slider label={tr('look.lineHeight')} value={params.text.lineHeight} min={1} max={1.4} step={0.01} onChange={(v) => onPatchText({ lineHeight: v })} />
          <Slider label={tr('look.letterSpacing')} value={params.text.letterSpacing} min={-0.1} max={0.3} step={0.005} onChange={(v) => onPatchText({ letterSpacing: v })} />
        </Section>
      </Advanced>
    </div>
  );
}
