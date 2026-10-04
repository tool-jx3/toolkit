/**
 * 分頁「壓克力立體透視」（規格 1.4）：底座邊距、圖層間距、圖層清單（圖、左右／上下位置、水平旋轉、排序、刪除）。
 */
import { Plus, Trash2 } from 'lucide-react';
import { moveItem } from '@/core/compose';
import { Button, Field, IconButton, Section, Slider, SortableList } from '@/ui';
import { ImageSlot } from './ImageSlot';
import { OFFSET_INPUT_MAX, RANGE, turn } from './model';
import { DragHandle } from './ShakerTab';
import { addLayerId, edit, step, useSession, useSettings } from './store';
import { S } from './strings';

export function DioramaTab() {
  const di = useSettings((s) => s.data.diorama);
  const exporting = useSession((s) => s.exporting);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.diorama.overall} persistKey="acrylic-goods:diorama-overall">
        <Field label={S.diorama.baseMargin} hint={S.diorama.baseMarginHint}>
          <Slider
            value={di.baseMargin}
            onChange={(v) =>
              edit((d) => {
                d.diorama.baseMargin = v;
              })
            }
            min={RANGE.baseMargin[0]}
            max={RANGE.baseMargin[1]}
            step={1}
            unit="px"
          />
        </Field>
        <Field label={S.diorama.gap} hint={S.diorama.gapHint}>
          <Slider
            value={di.gap}
            onChange={(v) =>
              edit((d) => {
                d.diorama.gap = v;
              })
            }
            min={RANGE.gap[0]}
            max={RANGE.gap[1]}
            step={1}
            unit="px"
          />
        </Field>
      </Section>
      <Section
        title={`${S.diorama.layers}（${di.layers.length}）`}
        persistKey="acrylic-goods:diorama-layers"
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() =>
              step((d) => {
                d.diorama.layers.push({ id: addLayerId(), image: null, x: 0, y: 0, rotation: 0 });
              })
            }
            disabled={exporting}
          >
            {S.diorama.addLayer}
          </Button>
        }
      >
        <p className="m-0 text-xs text-muted">{S.diorama.order}</p>
        <SortableList
          aria-label={S.diorama.layersAria}
          items={di.layers}
          getId={(l) => l.id}
          empty={S.diorama.layersEmpty}
          onMove={(from, to) =>
            edit((d) => {
              d.diorama.layers = moveItem(d.diorama.layers, from, to);
            })
          }
          onMoveStart={() => useSettings.beginGesture()}
          onMoveEnd={() => useSettings.endGesture()}
          renderItem={(l, { index }) => {
            const name = S.diorama.layerName(index + 1);
            const set = (fn: (x: (typeof di.layers)[number]) => void) =>
              edit((d) => {
                const x = d.diorama.layers.find((q) => q.id === l.id);
                if (x) fn(x);
              });
            return (
              <div className="flex flex-col gap-2 px-2 py-2" data-layer={l.id}>
                <div className="flex items-center gap-2">
                  <DragHandle />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    <span className="mr-1 font-bold text-accent tabular-nums">[{index + 1}]</span>
                    {name}
                  </span>
                  <IconButton
                    label={S.diorama.remove(name)}
                    icon={<Trash2 />}
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      step((d) => {
                        d.diorama.layers = d.diorama.layers.filter((x) => x.id !== l.id);
                      })
                    }
                    disabled={exporting}
                  />
                </div>
                <ImageSlot
                  label={`${name}的圖片`}
                  id={l.image}
                  disabled={exporting}
                  onChange={(id) =>
                    step((d) => {
                      const x = d.diorama.layers.find((q) => q.id === l.id);
                      if (x) x.image = id;
                    })
                  }
                />
                <Field label={S.diorama.x}>
                  <Slider
                    aria-label={`${name}的${S.diorama.x}`}
                    value={l.x}
                    onChange={(v) =>
                      set((x) => {
                        x.x = v;
                      })
                    }
                    min={RANGE.offset[0]}
                    max={RANGE.offset[1]}
                    inputMin={-OFFSET_INPUT_MAX}
                    inputMax={OFFSET_INPUT_MAX}
                    step={1}
                    unit="px"
                  />
                </Field>
                <Field label={S.diorama.y}>
                  <Slider
                    aria-label={`${name}的${S.diorama.y}`}
                    value={l.y}
                    onChange={(v) =>
                      set((x) => {
                        x.y = v;
                      })
                    }
                    min={RANGE.offset[0]}
                    max={RANGE.offset[1]}
                    inputMin={-OFFSET_INPUT_MAX}
                    inputMax={OFFSET_INPUT_MAX}
                    step={1}
                    unit="px"
                  />
                </Field>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-fg">{S.diorama.rotation}</span>
                  <Button
                    size="sm"
                    aria-label={`${name}：${S.diorama.rotation} ${S.diorama.rotateLeft}`}
                    onClick={() =>
                      step((d) => {
                        const x = d.diorama.layers.find((q) => q.id === l.id);
                        if (x) x.rotation = turn(x.rotation, -90);
                      })
                    }
                  >
                    {S.diorama.rotateLeft}
                  </Button>
                  <output
                    className="w-12 text-center text-sm tabular-nums"
                    data-testid="layer-rotation"
                    aria-label={`${name}的${S.diorama.rotation}`}
                  >
                    {l.rotation}°
                  </output>
                  <Button
                    size="sm"
                    aria-label={`${name}：${S.diorama.rotation} ${S.diorama.rotateRight}`}
                    onClick={() =>
                      step((d) => {
                        const x = d.diorama.layers.find((q) => q.id === l.id);
                        if (x) x.rotation = turn(x.rotation, 90);
                      })
                    }
                  >
                    {S.diorama.rotateRight}
                  </Button>
                </div>
              </div>
            );
          }}
        />
      </Section>
    </div>
  );
}
