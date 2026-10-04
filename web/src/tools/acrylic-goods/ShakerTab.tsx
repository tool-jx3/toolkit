/**
 * 分頁「壓克力搖搖樂」（規格 1.3）：外框（形狀、背景圖、大小、內部留白）、零件清單（圖、數量、大小、排序、刪除）、陀螺儀。
 */
import { GripVertical, Plus, Smartphone, Trash2 } from 'lucide-react';
import { moveItem } from '@/core/compose';
import {
  Button,
  Field,
  FieldRow,
  IconButton,
  Section,
  Segmented,
  Show,
  Slider,
  SortableList,
} from '@/ui';
import { enableGyro } from './actions';
import { ImageSlot } from './ImageSlot';
import { type FrameShape, RANGE } from './model';
import { addPartId, edit, step, useSession, useSettings } from './store';
import { S } from './strings';

export function ShakerTab() {
  const sh = useSettings((s) => s.data.shaker);
  const exporting = useSession((s) => s.exporting);
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
        {S.shaker.lead}
      </p>
      <Section title={S.shaker.frame} persistKey="acrylic-goods:shaker-frame">
        <Field label={S.shaker.frameShape}>
          <Segmented<FrameShape>
            value={sh.frame}
            onValueChange={(v) =>
              step((d) => {
                d.shaker.frame = v;
              })
            }
            options={(['circle', 'square', 'image'] as const).map((v) => ({
              value: v,
              label: S.shaker.frameShapes[v],
            }))}
            fullWidth
          />
        </Field>
        <Show when={sh.frame === 'image'}>
          <Field label={S.shaker.frameImage} hint={S.shaker.frameImageHint}>
            <ImageSlot
              label={S.shaker.frameImage}
              id={sh.frameImage}
              disabled={exporting}
              onChange={(id) =>
                step((d) => {
                  d.shaker.frameImage = id;
                })
              }
            />
          </Field>
        </Show>
        <Field label={S.shaker.frameSize} hidden={sh.frame === 'image'}>
          <Slider
            value={sh.frameSize}
            onChange={(v) =>
              edit((d) => {
                d.shaker.frameSize = v;
              })
            }
            min={RANGE.frameSize[0]}
            max={RANGE.frameSize[1]}
            step={1}
            unit="px"
          />
        </Field>
        <Field label={S.shaker.padding} hint={S.shaker.paddingHint}>
          <Slider
            value={sh.padding}
            onChange={(v) =>
              edit((d) => {
                d.shaker.padding = v;
              })
            }
            min={RANGE.padding[0]}
            max={RANGE.padding[1]}
            step={1}
            unit="%"
          />
        </Field>
      </Section>
      <Section
        title={`${S.shaker.parts}（${sh.parts.length}）`}
        persistKey="acrylic-goods:shaker-parts"
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() =>
              step((d) => {
                d.shaker.parts.push({ id: addPartId(), image: null, qty: 1, scale: 100 });
              })
            }
            disabled={exporting}
          >
            {S.shaker.addPart}
          </Button>
        }
      >
        <p className="m-0 text-xs text-muted">{S.shaker.dragHint}</p>
        <SortableList
          aria-label={S.shaker.partsAria}
          items={sh.parts}
          getId={(p) => p.id}
          empty={S.shaker.partsEmpty}
          onMove={(from, to) =>
            edit((d) => {
              d.shaker.parts = moveItem(d.shaker.parts, from, to);
            })
          }
          onMoveStart={() => useSettings.beginGesture()}
          onMoveEnd={() => useSettings.endGesture()}
          renderItem={(p, { index }) => {
            const name = S.shaker.partName(index + 1);
            return (
              <div className="flex flex-col gap-2 px-2 py-2" data-part={p.id}>
                <div className="flex items-center gap-2">
                  <DragHandle />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  <IconButton
                    label={S.shaker.remove(name)}
                    icon={<Trash2 />}
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      step((d) => {
                        d.shaker.parts = d.shaker.parts.filter((x) => x.id !== p.id);
                      })
                    }
                    disabled={exporting}
                  />
                </div>
                <ImageSlot
                  label={`${name}的${S.shaker.image}`}
                  id={p.image}
                  disabled={exporting}
                  onChange={(id) =>
                    step((d) => {
                      const x = d.shaker.parts.find((q) => q.id === p.id);
                      if (x) x.image = id;
                    })
                  }
                />
                <FieldRow columns={2}>
                  <Field label={S.shaker.qty}>
                    <Slider
                      aria-label={`${name}的${S.shaker.qty}`}
                      value={p.qty}
                      onChange={(v) =>
                        edit((d) => {
                          const x = d.shaker.parts.find((q) => q.id === p.id);
                          if (x) x.qty = v;
                        })
                      }
                      min={RANGE.qty[0]}
                      max={RANGE.qty[1]}
                      step={1}
                      unit={S.shaker.qtyUnit}
                    />
                  </Field>
                  <Field label={S.shaker.scale}>
                    <Slider
                      aria-label={`${name}的${S.shaker.scale}`}
                      value={p.scale}
                      onChange={(v) =>
                        edit((d) => {
                          const x = d.shaker.parts.find((q) => q.id === p.id);
                          if (x) x.scale = v;
                        })
                      }
                      min={RANGE.partScale[0]}
                      max={RANGE.partScale[1]}
                      step={1}
                      unit="%"
                    />
                  </Field>
                </FieldRow>
              </div>
            );
          }}
        />
      </Section>
      <Section title={S.shaker.gyro} persistKey="acrylic-goods:shaker-gyro">
        <p className="m-0 text-xs text-muted">{S.shaker.gyroHint}</p>
        <Button
          icon={<Smartphone />}
          onClick={() => void enableGyro()}
          disabled={exporting}
          className="self-start"
        >
          {S.shaker.gyroButton}
        </Button>
      </Section>
    </div>
  );
}

/** 拖曳排序的把手（觸控時只能從這裡拖） */
export function DragHandle() {
  return (
    <span
      data-drag-handle
      aria-hidden
      className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
    >
      <GripVertical />
    </span>
  );
}
