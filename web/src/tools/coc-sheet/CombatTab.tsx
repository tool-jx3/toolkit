/**
 * 戰鬥分頁（規格 F38～F42）：武器清單（名稱、使用的技能或直接填技能值、傷害、射程、攻擊次數、裝彈數、故障；
 * 新增、刪除、上下移）、傷害加值、體格、閃避。
 */

import type { Draft } from 'immer';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  Field,
  FieldRow,
  IconButton,
  ItemListEditor,
  OptionalNumberInput,
  Section,
  Select,
  TextInput,
} from '@/ui';
import { addWeapon, moveWeapon, removeWeapon, step, updateSheet } from './actions';
import { AutoNumberField, AutoTextField } from './controls';
import { type Sheet, WEAPON_SLOTS, type Weapon } from './model';
import {
  autoDerived,
  derived,
  skillDisplayName,
  skillValue,
  thresholds,
  weaponValue,
} from './rules';
import { S } from './strings';

const MANUAL = '__manual__';

function updateWeapon(id: string, recipe: (w: Draft<Weapon>) => void) {
  updateSheet((s) => {
    const w = s.weapons.find((x) => x.id === id);
    if (w) recipe(w);
  });
}

function WeaponDetails({ weapon, sheet }: { weapon: Weapon; sheet: Sheet }) {
  const W = S.combat;
  const name = weapon.name.trim() || W.unnamedWeapon;
  const options = sheet.skills
    .filter((s) => skillDisplayName(s))
    .map((s) => {
      const v = skillValue(s, sheet.stats);
      return { value: s.id, label: `${skillDisplayName(s)}${v === null ? '' : `（${v}）`}` };
    });
  const linked = weapon.skillId && sheet.skills.some((s) => s.id === weapon.skillId);
  const v = weaponValue(weapon, sheet);
  const t = thresholds(v);
  const text = (key: 'damage' | 'range' | 'attacks' | 'ammo' | 'malfunction', label: string) => (
    <Field label={label}>
      <TextInput
        aria-label={`${label}（${name}）`}
        value={weapon[key]}
        onChange={(e) =>
          updateWeapon(weapon.id, (w) => {
            w[key] = e.target.value;
          })
        }
      />
    </Field>
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FieldRow columns={2}>
        <Field label={W.skill}>
          <Select
            aria-label={`${W.skill}（${name}）`}
            value={linked ? (weapon.skillId as string) : MANUAL}
            onValueChange={(id) =>
              step(() =>
                updateWeapon(weapon.id, (w) => {
                  w.skillId = id === MANUAL ? null : id;
                }),
              )
            }
            options={[{ value: MANUAL, label: W.skillManual }, ...options]}
          />
        </Field>
        <Field
          label={W.value}
          hint={t.hard === null ? undefined : S.stats.halfFifth(t.hard, t.extreme)}
        >
          {linked ? (
            <span
              className="flex h-8 items-center rounded-md border border-border px-2.5 text-sm tabular-nums text-muted"
              data-testid="weapon-linked-value"
            >
              <span className="sr-only">{`${W.value}（${name}）：`}</span>
              {v ?? '—'}
            </span>
          ) : (
            <OptionalNumberInput
              aria-label={`${W.value}（${name}）`}
              value={weapon.value}
              min={0}
              max={999}
              onChange={(n) =>
                updateWeapon(weapon.id, (w) => {
                  w.value = n;
                })
              }
            />
          )}
        </Field>
      </FieldRow>
      <FieldRow columns={2}>
        {text('damage', W.damage)}
        {text('range', W.range)}
      </FieldRow>
      <FieldRow columns={3}>
        {text('attacks', W.attacks)}
        {text('ammo', W.ammo)}
        {text('malfunction', W.malfunction)}
      </FieldRow>
    </div>
  );
}

export function CombatTab({ sheet }: { sheet: Sheet }) {
  const W = S.combat;
  const a = autoDerived(sheet);
  const d = derived(sheet);
  const dodge = d.dodge;
  const dt = thresholds(dodge);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={W.weapons} fixed>
        <ItemListEditor<Weapon>
          aria-label={W.weaponsAria}
          items={sheet.weapons}
          getId={(w) => w.id}
          getName={(w) => w.name}
          placeholder={W.unnamedWeapon}
          renameLabel={W.name}
          onRename={(id, name) =>
            updateWeapon(id, (w) => {
              w.name = name;
            })
          }
          onAdd={() => addWeapon()}
          addLabel={W.add}
          onRemove={removeWeapon}
          emptyText={W.empty}
          renderActions={(w) => {
            const i = sheet.weapons.indexOf(w);
            const name = w.name.trim() || W.unnamedWeapon;
            return (
              <>
                <IconButton
                  size="sm"
                  label={W.up(name)}
                  icon={<ArrowUp />}
                  disabled={i <= 0}
                  onClick={() => moveWeapon(w.id, -1)}
                />
                <IconButton
                  size="sm"
                  label={W.down(name)}
                  icon={<ArrowDown />}
                  disabled={i >= sheet.weapons.length - 1}
                  onClick={() => moveWeapon(w.id, 1)}
                />
              </>
            );
          }}
          renderDetails={(w) => <WeaponDetails weapon={w} sheet={sheet} />}
        />
        {sheet.weapons.length > WEAPON_SLOTS ? (
          <p className="m-0 text-sm text-warning">{W.printLimit(sheet.weapons.length)}</p>
        ) : null}
      </Section>
      <Section title={W.combat} persistKey="coc-sheet:combat">
        <FieldRow columns={2}>
          <AutoTextField
            label={W.db}
            value={sheet.db}
            auto={a.db}
            formula={W.dbFormula}
            onChange={(v) =>
              updateSheet((s) => {
                s.db = v;
              })
            }
          />
          <AutoNumberField
            label={W.build}
            value={sheet.build}
            auto={a.build}
            formula={W.dbFormula}
            min={-9}
            max={99}
            onChange={(v) =>
              updateSheet((s) => {
                s.build = v;
              })
            }
          />
        </FieldRow>
        <Field label={W.dodge} hint={W.dodgeHint(dodge === null ? '—' : String(dodge))}>
          <span
            className="flex h-8 items-center rounded-md border border-border px-2.5 text-sm tabular-nums text-muted"
            data-testid="combat-dodge"
          >
            {dodge === null ? '—' : `${dodge}（${S.stats.halfFifth(dt.hard, dt.extreme)}）`}
          </span>
        </Field>
      </Section>
    </div>
  );
}
