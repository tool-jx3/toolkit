/**
 * 分頁「壓克力立牌」（規格 1.2）：正面圖、背面圖、外框模式、底座（形狀、大小、底面圖）。
 */
import { Field, Section, Segmented, Show, Slider, Toggle } from '@/ui';
import { ImageSlot } from './ImageSlot';
import { type BaseShape, type OutlineMode, RANGE } from './model';
import { edit, step, useSession, useSettings } from './store';
import { S } from './strings';

export function StandTab() {
  const st = useSettings((s) => s.data.stand);
  const exporting = useSession((s) => s.exporting);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.stand.images} persistKey="acrylic-goods:stand-images">
        <Field label={S.stand.front}>
          <ImageSlot
            label={S.stand.front}
            id={st.front}
            disabled={exporting}
            onChange={(id) =>
              step((d) => {
                d.stand.front = id;
              })
            }
          />
        </Field>
        <Field label={S.stand.back} hint={S.stand.backHint}>
          <ImageSlot
            label={S.stand.back}
            id={st.back}
            removable
            disabled={exporting}
            onChange={(id) =>
              step((d) => {
                d.stand.back = id;
              })
            }
          />
        </Field>
        <Field label={S.stand.outline} hint={S.stand.outlineHint}>
          <Segmented<OutlineMode>
            value={st.outline}
            onValueChange={(v) =>
              step((d) => {
                d.stand.outline = v;
              })
            }
            options={(['unified', 'separate'] as const).map((v) => ({
              value: v,
              label: S.stand.outlines[v],
            }))}
            fullWidth
          />
        </Field>
      </Section>
      <Section title={S.stand.base} persistKey="acrylic-goods:stand-base">
        <Field label={S.stand.baseOn} layout="inline" hint={S.stand.baseOnHint}>
          <Toggle
            checked={st.base}
            onCheckedChange={(v) =>
              step((d) => {
                d.stand.base = v;
              })
            }
          />
        </Field>
        <Show when={st.base}>
          <Field
            label={S.stand.shape}
            hint={st.baseShape === 'contour' ? S.stand.contourHint : undefined}
          >
            <Segmented<BaseShape>
              value={st.baseShape}
              onValueChange={(v) =>
                step((d) => {
                  d.stand.baseShape = v;
                })
              }
              options={(['circle', 'square', 'contour'] as const).map((v) => ({
                value: v,
                label: S.stand.shapes[v],
              }))}
              fullWidth
            />
          </Field>
          <Field label={S.stand.size} hidden={st.baseShape === 'contour'}>
            <Slider
              value={st.baseSize}
              onChange={(v) =>
                edit((d) => {
                  d.stand.baseSize = v;
                })
              }
              min={RANGE.baseSize[0]}
              max={RANGE.baseSize[1]}
              step={1}
              unit="px"
            />
          </Field>
          <Field label={S.stand.baseImage} hint={S.stand.baseImageHint}>
            <ImageSlot
              label={S.stand.baseImage}
              id={st.baseImage}
              removable
              disabled={exporting}
              onChange={(id) =>
                step((d) => {
                  d.stand.baseImage = id;
                })
              }
            />
          </Field>
        </Show>
      </Section>
    </div>
  );
}
