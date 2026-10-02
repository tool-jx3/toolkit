/**
 * 「圖層」分頁：新增圖片與文字（F30、F32）、圖層清單（F33）、選取中圖層的設定（F34～F46）。
 */
import { Copy, ImagePlus, Trash2, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pickFiles } from '@/core/files';
import { Button, Field, FontPicker, Section, Segmented, Select, TextArea, TextInput } from '@/ui';
import {
  addImageFiles,
  addTextLayer,
  duplicateLayer,
  moveLayer,
  removeLayer,
  updateLayer,
} from '../actions';
import { ColorRefField, NumField, PctField, ToggleField } from '../controls';
import { LOCAL_PRESETS } from '../fonts';
import {
  BLEND_MODES,
  type BlendMode,
  type ImageFit,
  type ImageLayer,
  type Layer,
  type TextLayer,
} from '../model';
import { assets, select, useFrame, useSession } from '../store';
import { S } from '../strings';
import { StackRow, VariantVisibility } from './common';

function AssetThumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    assets
      .url(id)
      .then((u) => alive && setUrl(u ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <span className="checker flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border">
      {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : null}
    </span>
  );
}

const Badge = ({ children }: { children: string }) => (
  <span
    aria-hidden
    className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-3 text-xs font-bold text-muted"
  >
    {children}
  </span>
);

export const layerDisplayName = (l: Layer): string =>
  l.name || (l.kind === 'text' ? l.text.split('\n')[0] : S.layer.badgeImage);

function TextProps({ l }: { l: TextLayer }) {
  const set = (recipe: (x: TextLayer) => void) =>
    updateLayer(l.id, (x) => {
      if (x.kind === 'text') recipe(x);
    });
  return (
    <>
      <Field label={S.layer.text} hint={S.layer.textHint}>
        <TextArea
          value={l.text}
          rows={2}
          onChange={(e) =>
            set((x) => {
              x.text = e.target.value;
            })
          }
        />
      </Field>
      <Field label={S.layer.font}>
        <FontPicker
          value={l.font}
          onChange={(font) =>
            set((x) => {
              x.font = { ...font, weight: x.bold ? 700 : 400 };
            })
          }
          showWeight={false}
          localPresets={LOCAL_PRESETS}
          localTabNote={S.fonts.localNote}
          previewText={S.fonts.previewText}
        />
      </Field>
      <NumField
        label={S.layer.fontSize}
        value={l.size}
        min={8}
        max={400}
        onChange={(v) =>
          set((x) => {
            x.size = v;
          })
        }
      />
      <ToggleField
        label={S.layer.bold}
        checked={l.bold}
        onChange={(v) =>
          set((x) => {
            x.bold = v;
            x.font.weight = v ? 700 : 400;
          })
        }
      />
      <ToggleField
        label={S.layer.vertical}
        checked={l.vertical}
        onChange={(v) =>
          set((x) => {
            x.vertical = v;
          })
        }
      />
      <Field label={S.layer.align} hidden={l.vertical}>
        <Segmented
          value={l.align}
          onValueChange={(v) =>
            set((x) => {
              x.align = v;
            })
          }
          options={(['left', 'center', 'right'] as const).map((a) => ({
            value: a,
            label: S.layer.aligns[a],
          }))}
          fullWidth
        />
      </Field>
      <NumField
        label={S.layer.spacing}
        value={l.spacing}
        min={-0.2}
        max={1}
        step={0.02}
        precision={2}
        onChange={(v) =>
          set((x) => {
            x.spacing = v;
          })
        }
      />
      <ColorRefField
        label={S.layer.color}
        value={l.color}
        onChange={(v) =>
          set((x) => {
            x.color = v;
          })
        }
      />
      <NumField
        label={S.layer.stroke}
        value={l.strokeWidth}
        min={0}
        max={24}
        onChange={(v) =>
          set((x) => {
            x.strokeWidth = v;
          })
        }
      />
      <ColorRefField
        label={S.layer.strokeColor}
        hidden={!(l.strokeWidth > 0)}
        value={l.strokeColor}
        onChange={(v) =>
          set((x) => {
            x.strokeColor = v;
          })
        }
      />
      <NumField
        label={S.layer.shadow}
        value={l.shadow}
        min={0}
        max={40}
        onChange={(v) =>
          set((x) => {
            x.shadow = v;
          })
        }
      />
    </>
  );
}

function ImageProps({ l }: { l: ImageLayer }) {
  const set = (recipe: (x: ImageLayer) => void) =>
    updateLayer(l.id, (x) => {
      if (x.kind === 'image') recipe(x);
    });
  return (
    <>
      <Field label={S.layer.fit}>
        <Select<ImageFit>
          value={l.fit}
          onValueChange={(v) =>
            set((x) => {
              x.fit = v;
            })
          }
          options={(['free', 'stretch', 'cover', 'tile'] as const).map((f) => ({
            value: f,
            label: S.layer.fits[f],
          }))}
        />
      </Field>
      <ColorRefField
        label={S.layer.recolor}
        allowNone
        value={l.recolor}
        onChange={(v) =>
          set((x) => {
            x.recolor = v;
          })
        }
      />
    </>
  );
}

function LayerProps({ l }: { l: Layer }) {
  const set = (recipe: (x: Layer) => void) => updateLayer(l.id, recipe);
  const positioned = l.kind === 'text' || l.fit === 'free' || l.fit === 'tile';
  const sized = l.kind === 'image' && (l.fit === 'free' || l.fit === 'tile');
  const flippable = l.kind === 'text' || l.fit === 'free';
  return (
    <Section title={S.layer.selected} fixed persistKey="foreground-frame:layer-props">
      <div className="flex flex-col gap-3" data-testid="layer-props">
        <Field label={S.layer.name}>
          <TextInput
            value={l.name}
            onChange={(e) =>
              set((x) => {
                x.name = e.target.value;
              })
            }
          />
        </Field>
        {l.kind === 'text' ? <TextProps l={l} /> : <ImageProps l={l} />}
        <NumField
          label={S.layer.x}
          hidden={!positioned}
          value={Math.round(l.x * 1000) / 10}
          min={-20}
          max={120}
          step={0.1}
          precision={1}
          unit="%"
          onChange={(v) =>
            set((x) => {
              x.x = Math.round(v * 10) / 1000;
            })
          }
        />
        <NumField
          label={S.layer.y}
          hidden={!positioned}
          value={Math.round(l.y * 1000) / 10}
          min={-20}
          max={120}
          step={0.1}
          precision={1}
          unit="%"
          onChange={(v) =>
            set((x) => {
              x.y = Math.round(v * 10) / 1000;
            })
          }
        />
        <NumField
          label={S.layer.rotation}
          hidden={!positioned}
          value={l.rotation}
          min={-180}
          max={180}
          unit="°"
          onChange={(v) =>
            set((x) => {
              x.rotation = v;
            })
          }
        />
        <PctField
          label={S.layer.scale}
          hidden={!sized}
          value={l.scale}
          min={0.02}
          max={4}
          onChange={(v) =>
            set((x) => {
              x.scale = v;
            })
          }
        />
        <ToggleField
          label={S.layer.flip}
          hidden={!flippable}
          checked={l.flip}
          onChange={(v) =>
            set((x) => {
              x.flip = v;
            })
          }
        />
        <PctField
          label={S.layer.opacity}
          value={l.opacity}
          onChange={(v) =>
            set((x) => {
              x.opacity = v;
            })
          }
        />
        <Field label={S.layer.blend}>
          <Select<BlendMode>
            value={l.blend}
            onValueChange={(v) =>
              set((x) => {
                x.blend = v;
              })
            }
            options={BLEND_MODES.map((b) => ({ value: b, label: S.layer.blends[b] }))}
          />
        </Field>
        <Field label={S.layer.order} hint={S.layer.orderHint}>
          <Segmented
            value={l.order}
            onValueChange={(v) =>
              set((x) => {
                x.order = v;
              })
            }
            options={(['front', 'back'] as const).map((o) => ({
              value: o,
              label: S.layer.orders[o],
            }))}
            fullWidth
          />
        </Field>
        <Field label={S.layer.clip}>
          <Segmented
            value={l.clip}
            onValueChange={(v) =>
              set((x) => {
                x.clip = v;
              })
            }
            options={(['none', 'frame', 'window'] as const).map((c) => ({
              value: c,
              label: S.layer.clips[c],
            }))}
            fullWidth
          />
        </Field>
        <VariantVisibility
          hideIn={l.hideIn}
          testId="layer-show-in"
          onChange={(vid, show) =>
            set((x) => {
              if (show) delete x.hideIn[vid];
              else x.hideIn[vid] = true;
            })
          }
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Copy />} onClick={() => duplicateLayer(l.id)}>
            {S.layer.duplicate}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => removeLayer(l.id)}>
            {S.layer.remove}
          </Button>
        </div>
      </div>
    </Section>
  );
}

export function LayersPanel() {
  const layers = useFrame((st) => st.data.layers);
  const selectedId = useSession((st) => st.selected);
  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const rows = layers.map((l, i) => ({ l, i })).reverse();
  return (
    <div className="flex flex-col gap-3 pt-3">
      <Section
        title={S.layer.section}
        description={S.layer.addHint}
        persistKey="foreground-frame:layers"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<ImagePlus />}
            onClick={async () => {
              const files = await pickFiles({ accept: 'image/*', multiple: true });
              if (files.length) await addImageFiles(files);
            }}
          >
            {S.layer.addImage}
          </Button>
          <Button icon={<Type />} onClick={addTextLayer}>
            {S.layer.addText}
          </Button>
        </div>
        <Field label={S.layer.list}>
          {layers.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="layer-list">
              {rows.map(({ l, i }) => {
                const name = layerDisplayName(l);
                return (
                  <StackRow
                    key={l.id}
                    testId="layer-row"
                    selected={l.id === selectedId}
                    onSelect={() => select(l.id)}
                    visible={l.visible}
                    visibleLabel={S.layer.show(name)}
                    onVisibleChange={(on) =>
                      updateLayer(l.id, (x) => {
                        x.visible = on;
                      })
                    }
                    leading={
                      l.kind === 'image' ? (
                        <AssetThumb id={l.asset} />
                      ) : (
                        <Badge>{S.layer.badgeText}</Badge>
                      )
                    }
                    name={name}
                    tag={l.order === 'back' ? S.layer.badgeBack : undefined}
                    canForward={i < layers.length - 1}
                    canBackward={i > 0}
                    onForward={() => moveLayer(l.id, 1)}
                    onBackward={() => moveLayer(l.id, -1)}
                    forwardLabel={S.layer.forward(name)}
                    backwardLabel={S.layer.backward(name)}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted">{S.layer.empty}</p>
          )}
        </Field>
      </Section>
      {selected ? <LayerProps key={selected.id} l={selected} /> : null}
    </div>
  );
}
