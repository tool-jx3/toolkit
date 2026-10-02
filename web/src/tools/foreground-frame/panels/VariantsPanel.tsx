/**
 * 「差分」分頁：製作差分開關（F55）、種類（F56）、清單（F57、F58）、目前差分的設定（F59～F64）、差分標籤（F66～F71）。
 */
import { ArrowDown, ArrowUp, ImagePlus, Palette, Plus, Trash2 } from 'lucide-react';
import { pickFiles } from '@/core/files';
import {
  Button,
  Checkbox,
  cn,
  Field,
  FieldRow,
  FontPicker,
  IconButton,
  Section,
  Select,
  TextInput,
} from '@/ui';
import {
  addVariant,
  changeKind,
  copyColorsToAll,
  moveVariant,
  removeVariant,
  setCurrent,
  setVariantExported,
  setVariantIconImage,
  updateVariant,
} from '../actions';
import { ColorFieldRow, NumField, PctField, ToggleField } from '../controls';
import { LOCAL_PRESETS } from '../fonts';
import {
  currentItem,
  type EffectId,
  type IconId,
  type LabelStyle,
  PALETTE_KEYS,
  type VariantItem,
  type VariantKind,
} from '../model';
import { EFFECT_IDS, ICON_IDS, LABEL_POSITIONS, LABEL_STYLES, VARIANT_KIND_IDS } from '../presets';
import { edit, useFrame, usePreview } from '../store';
import { S } from '../strings';

function VariantList() {
  const v = useFrame((st) => st.data.variants);
  const s = useFrame((st) => st.data);
  const current = usePreview((st) => st.data.current);
  const cur = currentItem(s, current);
  return (
    <Field label={S.variant.list} hint={S.variant.listHint}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="variant-list">
        {v.items.map((item, i) => {
          const name = item.name || S.variant.noName;
          const active = item.id === cur?.id;
          return (
            <li
              key={item.id}
              data-testid="variant-row"
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1',
                active ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2',
              )}
            >
              <Checkbox
                checked={item.on}
                onCheckedChange={(on) => setVariantExported(item.id, on)}
                aria-label={S.variant.exportOn(name)}
              />
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setCurrent(item.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 text-left text-sm text-fg hover:underline"
              >
                <span className="truncate">{name}</span>
                {!item.on ? (
                  <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 text-xs text-muted">
                    {S.variant.notExported}
                  </span>
                ) : null}
              </button>
              <IconButton
                label={S.variant.up(name)}
                icon={<ArrowUp />}
                size="sm"
                variant="ghost"
                disabled={i === 0}
                onClick={() => moveVariant(item.id, -1)}
              />
              <IconButton
                label={S.variant.down(name)}
                icon={<ArrowDown />}
                size="sm"
                variant="ghost"
                disabled={i === v.items.length - 1}
                onClick={() => moveVariant(item.id, 1)}
              />
              <IconButton
                label={S.variant.remove(name)}
                icon={<Trash2 />}
                size="sm"
                variant="ghost"
                onClick={() => removeVariant(item.id)}
              />
            </li>
          );
        })}
      </ul>
      <div>
        <Button size="sm" icon={<Plus />} onClick={addVariant}>
          {S.variant.add}
        </Button>
      </div>
    </Field>
  );
}

function VariantEditor({ item }: { item: VariantItem }) {
  const set = (recipe: (v: VariantItem) => void) => updateVariant(item.id, recipe);
  return (
    <Section
      title={S.variant.editing(item.name || S.variant.noName)}
      fixed
      persistKey="foreground-frame:variant-editor"
    >
      <div className="flex flex-col gap-3" data-testid="variant-editor">
        <FieldRow columns={2}>
          <Field label={S.variant.name}>
            <TextInput
              value={item.name}
              maxLength={20}
              onChange={(e) =>
                set((v) => {
                  v.name = e.target.value.slice(0, 20);
                })
              }
            />
          </Field>
          <Field label={S.variant.sub}>
            <TextInput
              value={item.sub}
              maxLength={30}
              onChange={(e) =>
                set((v) => {
                  v.sub = e.target.value.slice(0, 30);
                })
              }
            />
          </Field>
        </FieldRow>
        <Field label={S.variant.icon}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Select<IconId>
              value={item.icon}
              onValueChange={(icon) =>
                set((v) => {
                  v.icon = icon;
                })
              }
              options={ICON_IDS.map((id) => ({ value: id, label: S.icons[id] }))}
              className="w-40 shrink-0"
            />
            {item.icon === 'custom' ? (
              <Button
                size="sm"
                icon={<ImagePlus />}
                onClick={async () => {
                  const [f] = await pickFiles({ accept: 'image/*' });
                  if (f) await setVariantIconImage(item.id, f);
                }}
              >
                {item.iconAsset ? S.variant.iconPicked : S.variant.iconPick}
              </Button>
            ) : null}
          </div>
        </Field>
        <ToggleField
          label={S.variant.useColors}
          checked={item.useColors}
          onChange={(on) =>
            set((v) => {
              v.useColors = on;
            })
          }
        />
        {item.useColors ? (
          <FieldRow columns={2}>
            {PALETTE_KEYS.map((k) => (
              <ColorFieldRow
                key={k}
                label={S.colors[k]}
                value={item[k]}
                onChange={(c) =>
                  set((v) => {
                    v[k] = c;
                  })
                }
              />
            ))}
          </FieldRow>
        ) : null}
        <ColorFieldRow
          label={S.variant.tint}
          value={item.tint}
          onChange={(c) =>
            set((v) => {
              v.tint = c;
            })
          }
        />
        <PctField
          label={S.variant.tintAmount}
          value={item.tintAlpha}
          max={0.7}
          onChange={(a) =>
            set((v) => {
              v.tintAlpha = a;
            })
          }
        />
        <Field label={S.variant.effect} hint={S.variant.effectHint}>
          <Select<EffectId>
            value={item.effect}
            onValueChange={(e) =>
              set((v) => {
                v.effect = e;
              })
            }
            options={EFFECT_IDS.map((id) => ({ value: id, label: S.effects[id] }))}
          />
        </Field>
        <PctField
          label={S.variant.effectAmount}
          hidden={item.effect === 'none'}
          value={item.effectAmount}
          step={0.05}
          onChange={(a) =>
            set((v) => {
              v.effectAmount = a;
            })
          }
        />
        <div>
          <Button size="sm" icon={<Palette />} onClick={copyColorsToAll}>
            {S.variant.copyColors}
          </Button>
        </div>
      </div>
    </Section>
  );
}

function LabelSection() {
  const label = useFrame((st) => st.data.variants.label);
  const setLabel = (recipe: (l: typeof label) => void) =>
    edit((d) => {
      recipe(d.variants.label);
    });
  const none = label.style === 'none';
  return (
    <Section
      title={S.label.section}
      description={S.label.dragHint}
      persistKey="foreground-frame:label"
    >
      <Field label={S.label.style} hint={S.label.styleHint[label.style] || undefined}>
        <Select<LabelStyle>
          value={label.style}
          onValueChange={(v) =>
            setLabel((l) => {
              l.style = v;
            })
          }
          options={LABEL_STYLES.map((st) => ({ value: st, label: S.label.styles[st] }))}
        />
      </Field>
      <Field
        label={S.label.pos}
        hidden={none}
        hint={label.pos === 'free' ? S.label.free : undefined}
      >
        <div className="grid grid-cols-3 gap-1.5" data-testid="label-positions">
          {LABEL_POSITIONS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={label.pos === p ? 'primary' : 'secondary'}
              aria-pressed={label.pos === p}
              onClick={() =>
                setLabel((l) => {
                  l.pos = p;
                })
              }
            >
              {S.label.positions[p]}
            </Button>
          ))}
        </div>
      </Field>
      <NumField
        label={S.label.scale}
        hidden={none}
        value={label.scale}
        min={0.4}
        max={3}
        step={0.05}
        precision={2}
        unit="×"
        onChange={(v) =>
          setLabel((l) => {
            l.scale = v;
          })
        }
      />
      <PctField
        label={S.label.bgAlpha}
        hidden={none}
        value={label.bgAlpha}
        step={0.05}
        onChange={(v) =>
          setLabel((l) => {
            l.bgAlpha = v;
          })
        }
      />
      <ToggleField
        label={S.label.showSub}
        hidden={none || label.style === 'tabs'}
        checked={label.showSub}
        onChange={(v) =>
          setLabel((l) => {
            l.showSub = v;
          })
        }
      />
      <Field label={S.label.font} hidden={none}>
        <FontPicker
          value={label.font}
          onChange={(font) =>
            setLabel((l) => {
              l.font = { ...font, weight: 700 };
            })
          }
          showWeight={false}
          localPresets={LOCAL_PRESETS}
          localTabNote={S.fonts.localNote}
          previewText={S.fonts.previewText}
        />
      </Field>
    </Section>
  );
}

export function VariantsPanel() {
  const s = useFrame((st) => st.data);
  const current = usePreview((st) => st.data.current);
  const v = s.variants;
  const cur = currentItem(s, current);
  return (
    <div className="flex flex-col gap-3 pt-3">
      <Section title={S.variant.section} description={S.variant.enableHint} fixed>
        <ToggleField
          label={S.variant.enable}
          checked={v.enabled}
          onChange={(on) =>
            edit((d) => {
              d.variants.enabled = on;
            })
          }
        />
        {v.enabled ? (
          <>
            <Field
              label={S.variant.kind}
              hint={`${S.variantKinds[v.kind]?.desc ?? ''}${S.variant.kindHint}`}
            >
              <Select<VariantKind>
                value={v.kind}
                onValueChange={changeKind}
                options={VARIANT_KIND_IDS.map((k) => ({
                  value: k,
                  label: S.variantKinds[k]?.name ?? k,
                }))}
              />
            </Field>
            <VariantList />
          </>
        ) : null}
      </Section>
      {v.enabled && cur ? <VariantEditor key={cur.id} item={cur} /> : null}
      {v.enabled ? <LabelSection /> : null}
    </div>
  );
}
