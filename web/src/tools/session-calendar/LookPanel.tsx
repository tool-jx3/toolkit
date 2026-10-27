/**
 * 外觀與設定（F56～F61、F64）：標題、週的第一天、國定假日、月曆上的準備事項、背景（介面配色／漸層／花紋／圖片）、
 * 文字與框線的顏色與自動配色、截圖的寬度。改了立刻套用（可以復原）。
 */
import { Trash2 } from 'lucide-react';
import { addImageFile } from '@/core/assets';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  ImageDrop,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  TextInput,
  Toggle,
} from '@/ui';
import { autoColors } from './look';
import {
  type BgMode,
  IMAGE_FADE,
  IMAGE_MAX_SIDE,
  PATTERN_ALPHA,
  PATTERN_KINDS,
  PATTERN_SIZE,
  type PatternKind,
  SHOT_WIDTH_MAX,
  SHOT_WIDTH_MIN,
} from './model';
import { notify } from './notify';
import { assets, patchData, patchLook, useCal } from './store';
import { S } from './strings';

export function LookPanel() {
  const data = useCal((s) => s.data);
  const look = data.look;
  const custom = look.bg !== 'theme';
  const loadImage = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const r = await addImageFile(assets, file, { maxSide: IMAGE_MAX_SIDE });
      patchLook((l) => {
        l.bg = 'image';
        l.image.id = r.ref.id;
      });
      if (!r.persisted) notify({ title: S.look.imageNotSaved, tone: 'warning' });
    } catch {
      notify({ title: S.look.imageFailed, tone: 'danger' });
    }
  };
  return (
    <Section title={S.look.section} persistKey="session-calendar:look" defaultOpen={false}>
      <div className="flex flex-col gap-3" data-testid="look-panel">
        <Field label={S.look.title} hint={S.look.titleHint}>
          <TextInput
            value={data.title}
            maxLength={60}
            onChange={(e) => patchData({ title: e.target.value })}
          />
        </Field>
        <Field label={S.look.weekStart}>
          <Segmented
            value={String(data.weekStart)}
            onValueChange={(v) => patchData({ weekStart: v === '1' ? 1 : 0 })}
            options={[
              { value: '0', label: S.look.sunday },
              { value: '1', label: S.look.monday },
            ]}
          />
        </Field>
        <Field label={S.look.holidays} hint={S.look.holidaysHint} layout="inline">
          <Toggle
            checked={data.showHolidays}
            onCheckedChange={(v) => patchData({ showHolidays: v })}
          />
        </Field>
        <Field label={S.look.showTasks} layout="inline">
          <Toggle checked={data.showTasks} onCheckedChange={(v) => patchData({ showTasks: v })} />
        </Field>
        <Field label={S.look.bg} hint={look.bg === 'theme' ? S.look.bgThemeHint : undefined}>
          <Segmented
            value={look.bg}
            onValueChange={(v) =>
              patchLook((l) => {
                l.bg = v as BgMode;
              })
            }
            options={[
              { value: 'theme', label: S.look.bgTheme },
              { value: 'gradient', label: S.look.bgGradient },
              { value: 'pattern', label: S.look.bgPattern },
              { value: 'image', label: S.look.bgImage },
            ]}
            size="sm"
          />
        </Field>
        <Show when={look.bg === 'gradient'}>
          <FieldRow columns={3}>
            {[0, 1, 2].map((i) => (
              <Field key={i} label={S.look.gradientColor(i + 1)}>
                <ColorField
                  value={look.gradient.colors[i]}
                  showInput={false}
                  onChange={(c) =>
                    patchLook((l) => {
                      l.gradient.colors[i] = c;
                    })
                  }
                />
              </Field>
            ))}
          </FieldRow>
          <Field label={S.look.angle}>
            <Slider
              value={look.gradient.angle}
              min={0}
              max={360}
              unit="°"
              onChange={(v) =>
                patchLook((l) => {
                  l.gradient.angle = v;
                })
              }
            />
          </Field>
        </Show>
        <Show when={look.bg === 'pattern'}>
          <Field label={S.look.pattern}>
            <Select
              value={look.pattern.kind}
              onValueChange={(v) =>
                patchLook((l) => {
                  l.pattern.kind = v as PatternKind;
                })
              }
              options={PATTERN_KINDS.map((k) => ({ value: k, label: S.look.patterns[k] }))}
            />
          </Field>
          <FieldRow columns={2}>
            <Field label={S.look.patternBase}>
              <ColorField
                value={look.pattern.base}
                onChange={(c) =>
                  patchLook((l) => {
                    l.pattern.base = c;
                  })
                }
              />
            </Field>
            <Field label={S.look.patternColor}>
              <ColorField
                value={look.pattern.color}
                onChange={(c) =>
                  patchLook((l) => {
                    l.pattern.color = c;
                  })
                }
              />
            </Field>
          </FieldRow>
          <Field label={S.look.patternSize}>
            <Slider
              value={look.pattern.size}
              min={PATTERN_SIZE.min}
              max={PATTERN_SIZE.max}
              unit="px"
              onChange={(v) =>
                patchLook((l) => {
                  l.pattern.size = v;
                })
              }
            />
          </Field>
          <Field label={S.look.patternAlpha}>
            <Slider
              value={look.pattern.alpha}
              min={PATTERN_ALPHA.min}
              max={PATTERN_ALPHA.max}
              unit="%"
              onChange={(v) =>
                patchLook((l) => {
                  l.pattern.alpha = v;
                })
              }
            />
          </Field>
        </Show>
        <Show when={look.bg === 'image'}>
          <Field label={S.look.image} hint={S.look.imageHint}>
            <ImageDrop onFiles={(f) => void loadImage(f)} compact paste="off" />
          </Field>
          {look.image.id ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              className="self-start"
              onClick={() =>
                patchLook((l) => {
                  l.image.id = null;
                })
              }
            >
              {S.look.imageRemove}
            </Button>
          ) : null}
          <Field label={S.look.imageFade}>
            <Slider
              value={look.image.fade}
              min={IMAGE_FADE.min}
              max={IMAGE_FADE.max}
              unit="%"
              onChange={(v) =>
                patchLook((l) => {
                  l.image.fade = v;
                })
              }
            />
          </Field>
          <Field label={S.look.imageFit}>
            <Segmented
              value={look.image.fit}
              onValueChange={(v) =>
                patchLook((l) => {
                  l.image.fit = v === 'tile' ? 'tile' : 'cover';
                })
              }
              options={[
                { value: 'cover', label: S.look.fitCover },
                { value: 'tile', label: S.look.fitTile },
              ]}
              size="sm"
            />
          </Field>
        </Show>
        <Show when={custom}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{S.look.colors}</span>
            <Button
              size="sm"
              variant="secondary"
              data-testid="auto-colors"
              onClick={() => {
                patchLook((l) => {
                  l.colors = autoColors(l);
                });
                notify({ title: S.look.autoDone, tone: 'success' });
              }}
            >
              {S.look.auto}
            </Button>
          </div>
          <FieldRow columns={2}>
            {(['text', 'muted', 'border', 'card'] as const).map((k) => (
              <Field key={k} label={S.look[k]}>
                <ColorField
                  value={look.colors[k]}
                  onChange={(c) =>
                    patchLook((l) => {
                      l.colors[k] = c;
                    })
                  }
                />
              </Field>
            ))}
          </FieldRow>
          <Field label={S.look.cardAlpha}>
            <Slider
              value={look.colors.cardAlpha}
              min={0}
              max={100}
              unit="%"
              onChange={(v) =>
                patchLook((l) => {
                  l.colors.cardAlpha = v;
                })
              }
            />
          </Field>
        </Show>
        <Field label={S.look.shotWidth} hint={S.look.shotWidthHint}>
          <Slider
            value={data.shotWidth}
            min={SHOT_WIDTH_MIN}
            max={SHOT_WIDTH_MAX}
            step={20}
            unit="px"
            onChange={(v) => patchData({ shotWidth: v })}
          />
        </Field>
      </div>
    </Section>
  );
}
