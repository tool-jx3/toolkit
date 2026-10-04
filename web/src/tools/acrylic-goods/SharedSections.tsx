/**
 * 三種周邊共用的設定（規格 1.5～1.7）：壓克力（厚度、外框留白、表面質感）、打光（打光盤、主光、環境光、重設）、背景。
 */
import { RotateCcw } from 'lucide-react';
import { historyGesture } from '@/core/storage';
import { Button, ColorField, DirectionPad, Field, Section, Segmented, Slider, Toggle } from '@/ui';
import { DEFAULT_LIGHT, type Finish, RANGE } from './model';
import { edit, editLive, step, useSettings } from './store';
import { S } from './strings';

const gesture = historyGesture(useSettings);

export function MaterialSection() {
  const m = useSettings((s) => s.data.material);
  return (
    <Section title={S.material.title} persistKey="acrylic-goods:material">
      <Field label={S.material.thickness}>
        <Slider
          value={m.thickness}
          onChange={(v) =>
            editLive((d) => {
              d.material.thickness = v;
            })
          }
          min={RANGE.thickness[0]}
          max={RANGE.thickness[1]}
          step={1}
          unit="px"
        />
      </Field>
      <Field label={S.material.margin} hint={S.material.marginHint}>
        <Slider
          value={m.margin}
          onChange={(v) =>
            editLive((d) => {
              d.material.margin = v;
            })
          }
          min={RANGE.margin[0]}
          max={RANGE.margin[1]}
          step={1}
          unit="px"
        />
      </Field>
      <Field label={S.material.finish} hint={S.material.finishHint}>
        <Segmented<Finish>
          value={m.finish}
          onValueChange={(v) =>
            step((d) => {
              d.material.finish = v;
            })
          }
          options={(['glossy', 'matte'] as const).map((v) => ({
            value: v,
            label: S.material.finishes[v],
          }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}

export function LightSection() {
  const l = useSettings((s) => s.data.light);
  const isDefault =
    l.x === DEFAULT_LIGHT.x &&
    l.y === DEFAULT_LIGHT.y &&
    l.key === DEFAULT_LIGHT.key &&
    l.ambient === DEFAULT_LIGHT.ambient;
  return (
    <Section
      title={S.light.title}
      persistKey="acrylic-goods:light"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          aria-label={S.light.resetLabel}
          onClick={() =>
            step((d) => {
              d.light = { ...DEFAULT_LIGHT };
            })
          }
          disabled={isDefault}
        >
          {S.light.reset}
        </Button>
      }
    >
      <div className="flex items-start gap-4">
        <Field label={S.light.direction} className="shrink-0">
          <DirectionPad
            value={{ x: l.x, y: l.y }}
            onChange={gesture.live((v) =>
              edit((d) => {
                d.light.x = v.x;
                d.light.y = v.y;
              }),
            )}
            onCommit={gesture.commit}
            defaultValue={{ x: DEFAULT_LIGHT.x, y: DEFAULT_LIGHT.y }}
            valueText={(v) => S.light.directionText(v.x, v.y)}
          />
        </Field>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Field label={S.light.key}>
            <Slider
              value={l.key}
              onChange={(v) =>
                edit((d) => {
                  d.light.key = v;
                })
              }
              min={RANGE.light[0]}
              max={RANGE.light[1]}
              step={0.1}
            />
          </Field>
          <Field label={S.light.ambient}>
            <Slider
              value={l.ambient}
              onChange={(v) =>
                edit((d) => {
                  d.light.ambient = v;
                })
              }
              min={RANGE.light[0]}
              max={RANGE.light[1]}
              step={0.1}
            />
          </Field>
        </div>
      </div>
      <p className="m-0 text-xs text-muted">{S.light.directionHint}</p>
    </Section>
  );
}

export function BackgroundSection() {
  const bg = useSettings((s) => s.data.background);
  return (
    <Section title={S.bg.title} persistKey="acrylic-goods:bg">
      <Field label={S.bg.color}>
        <ColorField
          value={bg.color}
          onChange={(v) =>
            edit((d) => {
              d.background.color = v.slice(0, 7).toLowerCase();
            })
          }
          disabled={bg.transparent}
        />
      </Field>
      <Field label={S.bg.transparent} layout="inline" hint={S.bg.hint}>
        <Toggle
          checked={bg.transparent}
          onCheckedChange={(v) =>
            step((d) => {
              d.background.transparent = v;
            })
          }
        />
      </Field>
    </Section>
  );
}
