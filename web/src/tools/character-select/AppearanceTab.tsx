/**
 * 分頁 02「畫面樣式」（規格 1.4～1.8）：畫面構成、畫面尺寸與角色排列、背景、標題與名牌、選取前後的效果。
 */
import { ImageMinus, ImageUp } from 'lucide-react';
import { pickFiles } from '@/core/files';
import {
  Button,
  Chips,
  ColorField,
  Field,
  FieldRow,
  FontPicker,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  TextInput,
  Toggle,
} from '@/ui';
import {
  canvasPreset,
  clearBackground,
  setBackgroundFile,
  showcasePreset,
  stylePreset,
} from './actions';
import { IMAGE_ACCEPT } from './CharactersTab';
import {
  CANVAS_PRESETS,
  effectiveRows,
  MAIN_GRID_PRESETS,
  resizeCanvas,
  showcaseActive,
  visibleCount,
} from './layout';
import type { Settings } from './model';
import { edit, rewindPreview, useSession, useSettings } from './store';
import { S } from './strings';
import { DiagramButton, LandscapeDiagram, NextStep, PortraitDiagram } from './widgets';

type Edit = (recipe: (d: Settings) => void) => void;

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{children}</span>
  );
}

function CompositionSection({ s, set, disabled }: { s: Settings; set: Edit; disabled: boolean }) {
  const m = s.mainPanel;
  return (
    <Section
      title={S.comp.title}
      persistKey="character-select:comp"
      actions={<Badge>{m.enabled ? S.comp.badgeMain : S.comp.badgeGrid}</Badge>}
    >
      <Field label={S.comp.mode}>
        <Segmented
          value={m.enabled ? 'main' : 'grid'}
          onValueChange={(v) => {
            set((d) => {
              d.mainPanel.enabled = v === 'main';
            });
            rewindPreview();
          }}
          options={[
            { value: 'grid', label: S.comp.modeGrid },
            { value: 'main', label: S.comp.modeMain },
          ]}
          fullWidth
          disabled={disabled}
        />
      </Field>
      {/* biome-ignore lint/a11y/useSemanticElements: 一組相關的按鈕，不是表單分組 */}
      <div role="group" aria-label={S.comp.presetsAria} className="grid grid-cols-2 gap-2">
        <DiagramButton
          pressed={showcaseActive(s, 'portrait')}
          onClick={() => showcasePreset('portrait')}
          diagram={PortraitDiagram}
          title={S.comp.portrait}
          sub={S.comp.portraitSub}
          disabled={disabled}
        />
        <DiagramButton
          pressed={showcaseActive(s, 'landscape')}
          onClick={() => showcasePreset('landscape')}
          diagram={LandscapeDiagram}
          title={S.comp.landscape}
          sub={S.comp.landscapeSub}
          disabled={disabled}
        />
      </div>
      <Show when={m.enabled}>
        <p className="m-0 text-xs text-muted" data-testid="fill-help">
          {m.count === 1 ? S.comp.fillOne : S.comp.fillMany(m.count)}
        </p>
        <Field label={S.comp.slots}>
          <Chips
            aria-label={S.comp.slotsAria}
            items={MAIN_GRID_PRESETS.map((p) => ({ value: p.id, label: S.comp.slotPresets[p.id] }))}
            value={
              MAIN_GRID_PRESETS.find((p) => p.count === m.count && p.columns === m.columns)?.id ??
              null
            }
            onPick={(id) => {
              const p = MAIN_GRID_PRESETS.find((x) => x.id === id);
              if (p)
                set((d) => {
                  d.mainPanel.count = p.count;
                  d.mainPanel.columns = p.columns;
                });
            }}
            disabled={disabled}
          />
        </Field>
        <FieldRow columns={3}>
          <Field label={S.comp.count}>
            <NumberInput
              value={m.count}
              onChange={(v) =>
                set((d) => {
                  d.mainPanel.count = v;
                })
              }
              min={1}
              max={12}
              step={1}
              precision={0}
              disabled={disabled}
            />
          </Field>
          <Field label={S.comp.columns}>
            <NumberInput
              value={m.columns}
              onChange={(v) =>
                set((d) => {
                  d.mainPanel.columns = v;
                })
              }
              min={1}
              max={m.count}
              step={1}
              precision={0}
              disabled={disabled}
            />
          </Field>
          <Field label={S.comp.rows}>
            <output className="flex h-9 items-center text-sm tabular-nums" data-testid="main-rows">
              {Math.ceil(m.count / m.columns)}
            </output>
          </Field>
        </FieldRow>
        <p className="m-0 -mt-1 text-xs text-muted">{S.comp.slotsHint}</p>
        <Field label={S.comp.slotGap}>
          <Slider
            value={m.slotGap}
            onChange={(v) =>
              set((d) => {
                d.mainPanel.slotGap = v;
              })
            }
            min={0}
            max={120}
            step={1}
            unit="px"
            disabled={disabled}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.comp.position}>
            <Select
              value={m.position}
              onValueChange={(v) =>
                set((d) => {
                  d.mainPanel.position = v;
                })
              }
              options={(['top', 'left', 'right'] as const).map((v) => ({
                value: v,
                label: S.comp.positions[v],
              }))}
              disabled={disabled}
            />
          </Field>
          <Field label={S.comp.reveal}>
            <Select
              value={m.reveal}
              onValueChange={(v) => {
                set((d) => {
                  d.mainPanel.reveal = v;
                });
                rewindPreview();
              }}
              options={(['confirm', 'hover'] as const).map((v) => ({
                value: v,
                label: S.comp.reveals[v],
              }))}
              disabled={disabled}
            />
          </Field>
        </FieldRow>
        <Section title={S.comp.tune} defaultOpen={false} className="bg-surface-2">
          <Field label={S.comp.size}>
            <Slider
              value={m.size}
              onChange={(v) =>
                set((d) => {
                  d.mainPanel.size = v;
                })
              }
              min={35}
              max={80}
              step={1}
              unit="%"
              disabled={disabled}
            />
          </Field>
          <Field label={S.comp.gap}>
            <Slider
              value={m.gap}
              onChange={(v) =>
                set((d) => {
                  d.mainPanel.gap = v;
                })
              }
              min={0}
              max={120}
              step={1}
              unit="px"
              disabled={disabled}
            />
          </Field>
          <Field label={S.comp.fit} hint={S.comp.fitHint}>
            <Segmented
              value={m.fit}
              onValueChange={(v) =>
                set((d) => {
                  d.mainPanel.fit = v;
                })
              }
              options={(['contain', 'cover'] as const).map((v) => ({
                value: v,
                label: S.comp.fits[v],
              }))}
              disabled={disabled}
            />
          </Field>
          <Field label={S.comp.showName} layout="inline">
            <Toggle
              checked={m.showName}
              onCheckedChange={(v) =>
                set((d) => {
                  d.mainPanel.showName = v;
                })
              }
              disabled={disabled}
            />
          </Field>
          <Field label={S.comp.effects} layout="inline" hint={S.comp.effectsHint}>
            <Toggle
              checked={m.effects}
              onCheckedChange={(v) =>
                set((d) => {
                  d.mainPanel.effects = v;
                })
              }
              disabled={disabled}
            />
          </Field>
          <Field label={S.comp.placeholder} hint={S.comp.placeholderHint}>
            <TextInput
              value={m.placeholder}
              maxLength={100}
              onChange={(e) => {
                const v = e.currentTarget.value;
                set((d) => {
                  d.mainPanel.placeholder = v;
                });
              }}
              disabled={disabled}
            />
          </Field>
        </Section>
      </Show>
    </Section>
  );
}

function LayoutSection({ s, set, disabled }: { s: Settings; set: Edit; disabled: boolean }) {
  const L = s.layout;
  const rows = effectiveRows(s);
  const visible = visibleCount(s);
  const presetId = CANVAS_PRESETS.find(
    (p) =>
      p.width === s.canvas.width &&
      p.height === s.canvas.height &&
      (!p.grid || (L.columns === p.grid[0] && L.rows === p.grid[1] && !s.mainPanel.enabled)),
  )?.id;
  return (
    <Section title={S.layout.title} persistKey="character-select:layout" defaultOpen={false}>
      <FieldRow columns={2}>
        <Field label={S.layout.width}>
          <NumberInput
            value={s.canvas.width}
            onChange={(v) => set((d) => resizeCanvas(d, v, d.canvas.height))}
            min={240}
            max={4096}
            step={1}
            precision={0}
            unit="px"
            disabled={disabled}
          />
        </Field>
        <Field label={S.layout.height}>
          <NumberInput
            value={s.canvas.height}
            onChange={(v) => set((d) => resizeCanvas(d, d.canvas.width, v))}
            min={180}
            max={4096}
            step={1}
            precision={0}
            unit="px"
            disabled={disabled}
          />
        </Field>
      </FieldRow>
      <Chips
        aria-label={S.layout.presetsAria}
        items={CANVAS_PRESETS.map((p) => ({
          value: p.id,
          label: S.layout.presets[p.id],
          title: S.layout.presetTitle(p.width, p.height, p.grid),
        }))}
        value={presetId ?? null}
        onPick={(id) => {
          const p = CANVAS_PRESETS.find((x) => x.id === id);
          if (p) canvasPreset(p);
        }}
        disabled={disabled}
      />
      <p className="m-0 text-xs font-medium text-fg" data-testid="area-label">
        {s.mainPanel.enabled ? S.layout.areaMain : S.layout.area}
      </p>
      <FieldRow columns={4}>
        <Field label="X">
          <NumberInput
            value={L.x}
            onChange={(v) =>
              set((d) => {
                d.layout.x = v;
              })
            }
            step={1}
            precision={0}
            disabled={disabled}
          />
        </Field>
        <Field label="Y">
          <NumberInput
            value={L.y}
            onChange={(v) =>
              set((d) => {
                d.layout.y = v;
              })
            }
            step={1}
            precision={0}
            disabled={disabled}
          />
        </Field>
        <Field label={S.layout.width}>
          <NumberInput
            value={L.width}
            onChange={(v) =>
              set((d) => {
                d.layout.width = v;
              })
            }
            min={20}
            max={s.canvas.width * 2}
            step={1}
            precision={0}
            disabled={disabled}
          />
        </Field>
        <Field label={S.layout.height}>
          <NumberInput
            value={L.height}
            onChange={(v) =>
              set((d) => {
                d.layout.height = v;
              })
            }
            min={20}
            max={s.canvas.height * 2}
            step={1}
            precision={0}
            disabled={disabled}
          />
        </Field>
      </FieldRow>
      <FieldRow columns={3}>
        <Field label={S.layout.columns}>
          <NumberInput
            value={L.columns}
            onChange={(v) =>
              set((d) => {
                d.layout.columns = v;
              })
            }
            min={1}
            max={12}
            step={1}
            precision={0}
            disabled={disabled}
          />
        </Field>
        <Field label={L.autoRows ? S.layout.rowsMin : S.layout.rows}>
          <NumberInput
            value={L.rows}
            onChange={(v) =>
              set((d) => {
                d.layout.rows = v;
              })
            }
            min={1}
            max={12}
            step={1}
            precision={0}
            disabled={disabled}
          />
        </Field>
        <Field label={S.layout.gap}>
          <NumberInput
            value={L.gap}
            onChange={(v) =>
              set((d) => {
                d.layout.gap = v;
              })
            }
            min={0}
            max={120}
            step={1}
            precision={0}
            disabled={disabled || L.autoGap}
          />
        </Field>
      </FieldRow>
      <Field label={S.layout.autoGap} layout="inline">
        <Toggle
          checked={L.autoGap}
          onCheckedChange={(v) =>
            set((d) => {
              d.layout.autoGap = v;
            })
          }
          disabled={disabled}
        />
      </Field>
      <Field label={S.layout.autoRows} layout="inline">
        <Toggle
          checked={L.autoRows}
          onCheckedChange={(v) =>
            set((d) => {
              d.layout.autoRows = v;
            })
          }
          disabled={disabled}
        />
      </Field>
      {visible < s.characters.length ? (
        <p
          className="m-0 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning"
          data-testid="capacity"
          role="status"
        >
          {S.layout.capacity(L.columns, rows, visible)}
        </p>
      ) : null}
      <Field label={S.layout.radius}>
        <Slider
          value={L.radius}
          onChange={(v) =>
            set((d) => {
              d.layout.radius = v;
            })
          }
          min={0}
          max={120}
          step={1}
          unit="px"
          disabled={disabled}
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.layout.fit}>
          <Select
            value={L.fit}
            onValueChange={(v) =>
              set((d) => {
                d.layout.fit = v;
              })
            }
            options={(['cover', 'contain'] as const).map((v) => ({
              value: v,
              label: S.layout.fits[v],
            }))}
            disabled={disabled}
          />
        </Field>
        <Field label={S.layout.border}>
          <NumberInput
            value={L.borderWidth}
            onChange={(v) =>
              set((d) => {
                d.layout.borderWidth = v;
              })
            }
            min={0}
            max={20}
            step={1}
            precision={0}
            unit="px"
            disabled={disabled}
          />
        </Field>
      </FieldRow>
      <Field label={S.layout.guides} layout="inline">
        <Toggle
          checked={s.ui.showGuides}
          onCheckedChange={(v) =>
            set((d) => {
              d.ui.showGuides = v;
            })
          }
          disabled={disabled}
        />
      </Field>
    </Section>
  );
}

function BackgroundSection({ s, set, disabled }: { s: Settings; set: Edit; disabled: boolean }) {
  const b = s.background;
  const pick = async () => {
    const [file] = await pickFiles({ accept: IMAGE_ACCEPT });
    if (file) void setBackgroundFile(file);
  };
  return (
    <Section title={S.bg.title} persistKey="character-select:bg">
      <Field label={S.bg.type} hint={b.type === 'transparent' ? S.bg.transparentHint : undefined}>
        <Segmented
          value={b.type}
          onValueChange={(v) =>
            set((d) => {
              d.background.type = v;
            })
          }
          options={(['gradient', 'solid', 'image', 'transparent'] as const).map((v) => ({
            value: v,
            label: S.bg.types[v],
          }))}
          fullWidth
          size="sm"
          disabled={disabled}
        />
      </Field>
      <Show when={b.type === 'gradient' || b.type === 'solid'}>
        <FieldRow columns={2}>
          <Field label={b.type === 'solid' ? S.bg.color : S.bg.colorA}>
            <ColorField
              value={b.colorA}
              onChange={(v) =>
                set((d) => {
                  d.background.colorA = v;
                })
              }
              disabled={disabled}
            />
          </Field>
          <Field label={S.bg.colorB} hidden={b.type !== 'gradient'}>
            <ColorField
              value={b.colorB}
              onChange={(v) =>
                set((d) => {
                  d.background.colorB = v;
                })
              }
              disabled={disabled}
            />
          </Field>
        </FieldRow>
      </Show>
      <Show when={b.type === 'gradient'}>
        <Field label={S.bg.angle}>
          <Slider
            value={b.angle}
            onChange={(v) =>
              set((d) => {
                d.background.angle = v;
              })
            }
            min={0}
            max={360}
            step={1}
            unit="°"
            disabled={disabled}
          />
        </Field>
      </Show>
      <Show when={b.type === 'image'}>
        <div className="flex flex-wrap gap-2">
          <Button icon={<ImageUp />} onClick={() => void pick()} disabled={disabled}>
            {b.image ? S.bg.replace : S.bg.pick}
          </Button>
          <Button
            icon={<ImageMinus />}
            variant="ghost"
            onClick={clearBackground}
            disabled={disabled || !b.image}
          >
            {S.bg.clear}
          </Button>
        </div>
        <Field label={S.bg.dim}>
          <Slider
            value={b.imageDim}
            onChange={(v) =>
              set((d) => {
                d.background.imageDim = v;
              })
            }
            min={0}
            max={90}
            step={1}
            unit="%"
            disabled={disabled}
          />
        </Field>
      </Show>
      <Field label={S.bg.vignette}>
        <Slider
          value={b.vignette}
          onChange={(v) =>
            set((d) => {
              d.background.vignette = v;
            })
          }
          min={0}
          max={80}
          step={1}
          unit="%"
          disabled={disabled}
        />
      </Field>
      <Field label={S.bg.pattern} layout="inline">
        <Toggle
          checked={b.pattern}
          onCheckedChange={(v) =>
            set((d) => {
              d.background.pattern = v;
            })
          }
          disabled={disabled}
        />
      </Field>
    </Section>
  );
}

function TextSection({ s, set, disabled }: { s: Settings; set: Edit; disabled: boolean }) {
  const t = s.text;
  return (
    <Section title={S.text.title} persistKey="character-select:text" defaultOpen={false}>
      <Field label={S.text.font} hint={S.text.fontHint}>
        <FontPicker
          value={s.font}
          onChange={(v) =>
            set((d) => {
              d.font = v;
            })
          }
          previewText={S.text.fontSample}
          showWeight={false}
        />
      </Field>
      <Field label={S.text.showTitle} layout="inline">
        <Toggle
          checked={t.showTitle}
          onCheckedChange={(v) =>
            set((d) => {
              d.text.showTitle = v;
            })
          }
          disabled={disabled}
        />
      </Field>
      <Field label={S.text.main}>
        <TextInput
          value={t.title}
          maxLength={80}
          onChange={(e) => {
            const v = e.currentTarget.value;
            set((d) => {
              d.text.title = v;
            });
          }}
          disabled={disabled}
        />
      </Field>
      <Field label={S.text.sub}>
        <TextInput
          value={t.subtitle}
          maxLength={100}
          onChange={(e) => {
            const v = e.currentTarget.value;
            set((d) => {
              d.text.subtitle = v;
            });
          }}
          disabled={disabled}
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.text.size}>
          <NumberInput
            value={t.titleSize}
            onChange={(v) =>
              set((d) => {
                d.text.titleSize = v;
              })
            }
            min={10}
            max={120}
            step={1}
            precision={0}
            unit="px"
            disabled={disabled}
          />
        </Field>
        <Field label={S.text.align}>
          <Select
            value={t.align}
            onValueChange={(v) =>
              set((d) => {
                d.text.align = v;
              })
            }
            options={(['left', 'center', 'right'] as const).map((v) => ({
              value: v,
              label: S.text.aligns[v],
            }))}
            disabled={disabled}
          />
        </Field>
      </FieldRow>
      <Field label={S.text.showLabels} layout="inline">
        <Toggle
          checked={s.labels.show}
          onCheckedChange={(v) =>
            set((d) => {
              d.labels.show = v;
            })
          }
          disabled={disabled}
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.text.labelHeight}>
          <NumberInput
            value={s.labels.height}
            onChange={(v) =>
              set((d) => {
                d.labels.height = v;
              })
            }
            min={0}
            max={160}
            step={1}
            precision={0}
            unit="px"
            disabled={disabled}
          />
        </Field>
        <Field label={S.text.labelSize}>
          <NumberInput
            value={s.labels.fontSize}
            onChange={(v) =>
              set((d) => {
                d.labels.fontSize = v;
              })
            }
            min={8}
            max={60}
            step={1}
            precision={0}
            unit="px"
            disabled={disabled}
          />
        </Field>
      </FieldRow>
    </Section>
  );
}

function EffectsSection({ s, set, disabled }: { s: Settings; set: Edit; disabled: boolean }) {
  const i = s.idle;
  const a = s.selected;
  return (
    <Section title={S.fx.title} persistKey="character-select:fx" defaultOpen={false}>
      <h4 className="m-0 text-xs font-semibold text-muted">{S.fx.idle}</h4>
      <FieldRow columns={2}>
        <Field label={S.fx.mode}>
          <Select
            value={i.mode}
            onValueChange={(v) =>
              set((d) => {
                d.idle.mode = v;
              })
            }
            options={(['normal', 'grayscale', 'sepia'] as const).map((v) => ({
              value: v,
              label: S.fx.modes[v],
            }))}
            disabled={disabled}
          />
        </Field>
        <Field label={S.fx.amount}>
          <NumberInput
            value={i.amount}
            onChange={(v) =>
              set((d) => {
                d.idle.amount = v;
              })
            }
            min={0}
            max={100}
            step={1}
            precision={0}
            unit="%"
            disabled={disabled}
          />
        </Field>
      </FieldRow>
      <Field label={S.fx.brightness}>
        <Slider
          value={i.brightness}
          onChange={(v) =>
            set((d) => {
              d.idle.brightness = v;
            })
          }
          min={20}
          max={140}
          step={1}
          unit="%"
          disabled={disabled}
        />
      </Field>
      <Field label={S.fx.saturation}>
        <Slider
          value={i.saturation}
          onChange={(v) =>
            set((d) => {
              d.idle.saturation = v;
            })
          }
          min={0}
          max={180}
          step={1}
          unit="%"
          disabled={disabled}
        />
      </Field>
      <Field label={S.fx.overlay}>
        <Slider
          value={i.overlayAlpha}
          onChange={(v) =>
            set((d) => {
              d.idle.overlayAlpha = v;
            })
          }
          min={0}
          max={80}
          step={1}
          unit="%"
          disabled={disabled}
        />
      </Field>
      <h4 className="m-0 mt-1 border-t border-border pt-3 text-xs font-semibold text-muted">
        {S.fx.active}
      </h4>
      <Field label={S.fx.tintMode}>
        <Select
          value={a.tintMode}
          onValueChange={(v) =>
            set((d) => {
              d.selected.tintMode = v;
            })
          }
          options={(['none', 'fixed', 'player'] as const).map((v) => ({
            value: v,
            label: S.fx.tintModes[v],
          }))}
          disabled={disabled}
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.fx.tint} hidden={a.tintMode !== 'fixed'}>
          <ColorField
            value={a.tint}
            onChange={(v) =>
              set((d) => {
                d.selected.tint = v;
              })
            }
            disabled={disabled}
          />
        </Field>
        <Field label={S.fx.tintAlpha}>
          <NumberInput
            value={a.tintAlpha}
            onChange={(v) =>
              set((d) => {
                d.selected.tintAlpha = v;
              })
            }
            min={0}
            max={80}
            step={1}
            precision={0}
            unit="%"
            disabled={disabled}
          />
        </Field>
      </FieldRow>
      <FieldRow columns={2}>
        <Field label={S.fx.brightness}>
          <NumberInput
            value={a.brightness}
            onChange={(v) =>
              set((d) => {
                d.selected.brightness = v;
              })
            }
            min={20}
            max={180}
            step={1}
            precision={0}
            unit="%"
            disabled={disabled}
          />
        </Field>
        <Field label={S.fx.saturation}>
          <NumberInput
            value={a.saturation}
            onChange={(v) =>
              set((d) => {
                d.selected.saturation = v;
              })
            }
            min={0}
            max={240}
            step={1}
            precision={0}
            unit="%"
            disabled={disabled}
          />
        </Field>
      </FieldRow>
      <Field label={S.fx.scale}>
        <Slider
          value={a.scale}
          onChange={(v) =>
            set((d) => {
              d.selected.scale = v;
            })
          }
          min={1}
          max={1.18}
          step={0.005}
          precision={3}
          unit="×"
          disabled={disabled}
        />
      </Field>
      <Field label={S.fx.glow}>
        <Slider
          value={a.glow}
          onChange={(v) =>
            set((d) => {
              d.selected.glow = v;
            })
          }
          min={0}
          max={80}
          step={1}
          unit="px"
          disabled={disabled}
        />
      </Field>
      <Field label={S.fx.border}>
        <Slider
          value={a.borderWidth}
          onChange={(v) =>
            set((d) => {
              d.selected.borderWidth = v;
            })
          }
          min={1}
          max={16}
          step={1}
          unit="px"
          disabled={disabled}
        />
      </Field>
      <Field label={S.fx.borderStyle} hint={S.fx.borderHint}>
        <Segmented
          value={s.layout.borderStyle}
          onValueChange={(v) =>
            set((d) => {
              d.layout.borderStyle = v;
            })
          }
          options={(['solid', 'corners', 'dashed', 'double'] as const).map((v) => ({
            value: v,
            label: S.fx.borderStyles[v],
          }))}
          fullWidth
          size="sm"
          disabled={disabled}
        />
      </Field>
      <Chips
        aria-label={S.fx.presetsAria}
        items={(['gray', 'sepia', 'playerTint'] as const).map((v) => ({
          value: v,
          label: S.fx.presets[v],
        }))}
        onPick={(v) => stylePreset(v as 'gray' | 'sepia' | 'playerTint')}
        disabled={disabled}
      />
    </Section>
  );
}

export function AppearanceTab() {
  const s = useSettings((st) => st.data);
  const disabled = useSession((st) => st.exporting);
  return (
    <div className="flex flex-col gap-3">
      <CompositionSection s={s} set={edit} disabled={disabled} />
      <LayoutSection s={s} set={edit} disabled={disabled} />
      <BackgroundSection s={s} set={edit} disabled={disabled} />
      <TextSection s={s} set={edit} disabled={disabled} />
      <EffectsSection s={s} set={edit} disabled={disabled} />
      <NextStep to="motion" />
    </div>
  );
}
