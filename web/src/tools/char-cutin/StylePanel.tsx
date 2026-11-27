/**
 * 型與樣式（規格 F20～F36）：六種型、VS 的對手、重擊字、字型、顏色、速度與立繪放大、這個型回到初始值。
 * 顏色、字型、速度、立繪放大、重擊字的配置是每種型各自的（換型時跟著換）；重擊的字本身全部的型共用。
 */
import { RotateCcw } from 'lucide-react';
import {
  Button,
  ColorField,
  Field,
  FontPicker,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  TextInput,
  useConfirm,
} from '@/ui';
import { isDefaultStyle, resetKind, setKind } from './actions';
import {
  BASE_SWATCHES,
  CUT_KINDS,
  type CutKind,
  clipChars,
  graphemes,
  type KindStyle,
  MAIN_SWATCHES,
  MAX_CHARS,
  MYSTERY,
  RANGES,
} from './model';
import { seq2 } from './names';
import { gesture, update, useDoc, usePrefs } from './store';
import { S } from './strings';

const setStyle = (fn: (st: KindStyle) => void): void =>
  update((d) => {
    fn(d.styles[d.kind]);
  });

export function KindSection() {
  const kind = useDoc((s) => s.data.kind);
  return (
    <Section title={S.kindTitle} persistKey="char-cutin:kind">
      <Field label={S.kindLabel} hint={S.kinds[kind].note}>
        <Segmented
          value={kind}
          onValueChange={(v) => setKind(v as CutKind)}
          columns={3}
          options={CUT_KINDS.map((k) => ({ value: k, label: S.kinds[k].label }))}
        />
      </Field>
    </Section>
  );
}

export function RivalSection() {
  const kind = useDoc((s) => s.data.kind);
  const actors = useDoc((s) => s.data.actors);
  const rival = useDoc((s) => s.data.rival);
  const mysteryName = useDoc((s) => s.data.mysteryName);
  const selected = usePrefs((s) => s.data.selected);
  if (kind !== 'versus') return null;
  const sel = actors.find((a) => a.id === selected) ?? actors[0];
  return (
    <Section title={S.rivalTitle} persistKey="char-cutin:rival">
      <Field label={S.fRival} hint={S.rivalNote}>
        <Select
          value={rival}
          onValueChange={(v) =>
            update((d) => {
              d.rival = v;
            })
          }
          options={[
            { value: MYSTERY, label: S.mystery },
            ...actors.map((a, i) => ({
              value: a.id,
              label: `${seq2(i + 1)}　${a.name || S.unnamed}`,
            })),
          ]}
        />
      </Field>
      {rival === MYSTERY ? (
        <Field label={S.fMysteryName} hint={S.fMysteryNameHint}>
          <TextInput
            value={mysteryName}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) =>
              update((d) => {
                d.mysteryName = clipChars(e.target.value, MAX_CHARS.rivalName);
              })
            }
          />
        </Field>
      ) : null}
      {sel && sel.id === rival ? (
        <p className="m-0 text-xs text-warning" data-testid="rival-selected">
          {S.rivalIsSelected}
        </p>
      ) : null}
    </Section>
  );
}

export function ImpactSection() {
  const kind = useDoc((s) => s.data.kind);
  const text = useDoc((s) => s.data.impactText);
  const lay = useDoc((s) => s.data.styles.impact.impact);
  if (kind !== 'impact') return null;
  const R = RANGES;
  const chars = graphemes(text);
  const slider = (
    key: 'x' | 'y' | 'size' | 'track',
    label: string,
    r: { min: number; max: number; step: number },
  ) => (
    <Field label={label}>
      <Slider
        value={lay[key]}
        min={r.min}
        max={r.max}
        step={r.step}
        unit="%"
        onChange={gesture.live((v) =>
          setStyle((st) => {
            st.impact[key] = v;
          }),
        )}
        onCommit={gesture.commit}
      />
    </Field>
  );
  return (
    <Section title={S.impactTitle} persistKey="char-cutin:impact">
      <Field label={S.fImpactText} hint={S.fImpactTextHint}>
        <TextInput
          value={text}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) =>
            update((d) => {
              d.impactText = clipChars(e.target.value.replace(/\s+/g, ''), MAX_CHARS.impact);
            })
          }
        />
      </Field>
      {slider('x', S.fImpactX, R.impactX)}
      {slider('y', S.fImpactY, R.impactY)}
      {slider('size', S.fImpactSize, R.impactSize)}
      {slider('track', S.fImpactTrack, R.impactTrack)}
      <Field label={S.fImpactGaps} hint={S.fImpactGapsHint}>
        {chars.length < 2 ? (
          <p className="m-0 text-sm text-muted">{S.gapsNeedTwo}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2" data-testid="impact-gaps">
            {chars.map((ch, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 同一個字可以出現兩次；位置就是身分
              <span key={`${i}-${ch}`} className="flex items-center gap-1">
                <span className="text-base font-semibold">{ch}</span>
                {i < chars.length - 1 ? (
                  <NumberInput
                    aria-label={S.gapBetween(ch, chars[i + 1])}
                    value={lay.gaps[i] ?? 0}
                    min={R.impactGap.min}
                    max={R.impactGap.max}
                    step={R.impactGap.step}
                    className="w-20"
                    onChange={(v) =>
                      setStyle((st) => {
                        const g = [...st.impact.gaps];
                        while (g.length < i) g.push(0);
                        g[i] = v;
                        while (g.length && g[g.length - 1] === 0) g.pop();
                        st.impact.gaps = g;
                      })
                    }
                  />
                ) : null}
              </span>
            ))}
          </div>
        )}
      </Field>
      <Button
        size="sm"
        className="self-start"
        disabled={!lay.track && !lay.gaps.length}
        onClick={() =>
          setStyle((st) => {
            st.impact.track = 0;
            st.impact.gaps = [];
          })
        }
      >
        {S.resetGaps}
      </Button>
    </Section>
  );
}

export function FontSection() {
  const kind = useDoc((s) => s.data.kind);
  const st = useDoc((s) => s.data.styles[s.data.kind]);
  const impactText = useDoc((s) => s.data.impactText);
  return (
    <Section title={S.textTitle} persistKey="char-cutin:fonts">
      <Field label={S.fNameFont}>
        <FontPicker
          value={st.nameFont}
          previewText={S.sample.name}
          onChange={(v) =>
            setStyle((x) => {
              x.nameFont = v;
            })
          }
        />
      </Field>
      {kind !== 'versus' && kind !== 'impact' ? (
        <Field label={S.fQuoteFont}>
          <FontPicker
            value={st.quoteFont}
            previewText={S.sample.quote}
            onChange={(v) =>
              setStyle((x) => {
                x.quoteFont = v;
              })
            }
          />
        </Field>
      ) : null}
      {kind === 'impact' ? (
        <Field label={S.fImpactFont}>
          <FontPicker
            value={st.impactFont}
            previewText={impactText || '反擊'}
            onChange={(v) =>
              setStyle((x) => {
                x.impactFont = v;
              })
            }
          />
        </Field>
      ) : null}
    </Section>
  );
}

export function ColorSection() {
  const kind = useDoc((s) => s.data.kind);
  const st = useDoc((s) => s.data.styles[s.data.kind]);
  const color = (
    key: 'main' | 'base' | 'right',
    label: string,
    hint: string,
    swatches: readonly string[],
  ) => (
    <Field label={label} hint={hint}>
      <ColorField
        value={st[key]}
        swatches={swatches}
        onChange={(v) =>
          setStyle((x) => {
            x[key] = v.slice(0, 7).toLowerCase();
          })
        }
      />
    </Field>
  );
  return (
    <Section title={S.colorTitle} persistKey="char-cutin:colors">
      {color('main', S.fMain, S.fMainHint, MAIN_SWATCHES)}
      {color('base', S.fBase, S.fBaseHint, BASE_SWATCHES)}
      {kind === 'versus' ? color('right', S.fRight, S.fRightHint, MAIN_SWATCHES) : null}
    </Section>
  );
}

export function MotionSection() {
  const kind = useDoc((s) => s.data.kind);
  const st = useDoc((s) => s.data.styles[s.data.kind]);
  const isDefault = useDoc((s) => isDefaultStyle(s.data, s.data.kind));
  const confirm = useConfirm();
  const R = RANGES;
  return (
    <Section title={S.motionTitle} persistKey="char-cutin:motion">
      <Field label={S.fPace}>
        <Slider
          value={st.pace}
          min={R.pace.min}
          max={R.pace.max}
          step={R.pace.step}
          precision={2}
          unit="倍"
          onChange={gesture.live((v) =>
            setStyle((x) => {
              x.pace = Math.round(v * 100) / 100;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.fZoom} hint={S.fZoomHint}>
        <Slider
          value={st.zoom}
          min={R.zoom.min}
          max={R.zoom.max}
          step={R.zoom.step}
          unit="%"
          onChange={gesture.live((v) =>
            setStyle((x) => {
              x.zoom = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<RotateCcw />}
          disabled={isDefault}
          onClick={async () => {
            const label = S.kinds[kind].label;
            const ok = await confirm({
              title: S.resetKindTitle(label),
              description: S.resetKindDescription,
              confirmLabel: S.resetKindConfirm,
            });
            if (ok) resetKind(kind);
          }}
        >
          {S.resetKind}
        </Button>
        <span className="text-xs text-muted" data-testid="kind-state">
          {isDefault ? S.kindIsDefault : S.kindIsChanged}
        </span>
      </div>
    </Section>
  );
}
