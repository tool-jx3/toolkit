/**
 * 「裝飾」分頁：角飾（F23、F24）、沿框裝飾的新增、清單與設定（F25～F28、F45）。
 */
import { Copy, Plus, Shuffle, Trash2 } from 'lucide-react';
import { Button, Field, Section, Select, Tooltip } from '@/ui';
import { addDecoration, duplicateDeco, moveDeco, removeDeco, reseedDeco } from '../actions';
import { ColorRefField, NumField, PctField, ToggleField } from '../controls';
import type { Decoration, OrnamentType, Placement } from '../model';
import { ORNAMENT_USES_WIDTH } from '../ornaments';
import { DECO_TYPE_IDS, DECO_TYPES, ORNAMENT_TYPES, PLACEMENTS } from '../presets';
import { edit, selectDeco, useFrame, useSession } from '../store';
import { S } from '../strings';
import { StackRow, VariantVisibility } from './common';

function OrnamentSection() {
  const o = useFrame((st) => st.data.frame.ornament);
  const none = o.type === 'none';
  return (
    <Section
      title={S.ornament.section}
      description={S.ornament.hint}
      persistKey="foreground-frame:ornament"
    >
      <Field label={S.ornament.type}>
        <Select<OrnamentType>
          value={o.type}
          onValueChange={(v) =>
            edit((d) => {
              d.frame.ornament.type = v;
            })
          }
          options={ORNAMENT_TYPES.map((t) => ({ value: t, label: S.ornament.types[t] }))}
        />
      </Field>
      <NumField
        label={S.ornament.size}
        hidden={none}
        value={o.size}
        min={6}
        max={200}
        onChange={(v) =>
          edit((d) => {
            d.frame.ornament.size = v;
          })
        }
      />
      <NumField
        label={S.ornament.gap}
        hint={S.ornament.gapHint}
        hidden={none}
        value={o.gap}
        min={-60}
        max={120}
        onChange={(v) =>
          edit((d) => {
            d.frame.ornament.gap = v;
          })
        }
      />
      <NumField
        label={S.ornament.width}
        hidden={none || !ORNAMENT_USES_WIDTH.includes(o.type)}
        value={o.width}
        min={1}
        max={16}
        onChange={(v) =>
          edit((d) => {
            d.frame.ornament.width = v;
          })
        }
      />
      <ColorRefField
        label={S.ornament.color}
        hidden={none}
        value={o.color}
        onChange={(v) =>
          edit((d) => {
            d.frame.ornament.color = v;
          })
        }
      />
    </Section>
  );
}

const setDeco = (id: string, recipe: (d: Decoration) => void) =>
  edit((s) => {
    const d = s.decorations.find((x) => x.id === id);
    if (d) recipe(d);
  });

function DecoProps({ d }: { d: Decoration }) {
  const def = DECO_TYPES[d.type];
  const t = S.decoTypes[d.type];
  return (
    <Section
      title={`${S.deco.selected}：${t?.name ?? d.type}`}
      description={t?.desc}
      fixed
      persistKey="foreground-frame:deco-props"
    >
      <div className="flex flex-col gap-3" data-testid="deco-props">
        <Field label={S.deco.placement}>
          <Select<Placement>
            value={d.placement}
            onValueChange={(v) =>
              setDeco(d.id, (x) => {
                x.placement = v;
              })
            }
            options={PLACEMENTS.map((p) => ({ value: p, label: S.deco.placements[p] }))}
          />
        </Field>
        <NumField
          label={S.deco.size}
          value={d.size}
          min={0.3}
          max={2.5}
          step={0.05}
          precision={2}
          unit="×"
          onChange={(v) =>
            setDeco(d.id, (x) => {
              x.size = v;
            })
          }
        />
        <PctField
          label={S.deco.density}
          value={d.density}
          step={0.05}
          onChange={(v) =>
            setDeco(d.id, (x) => {
              x.density = v;
            })
          }
        />
        <PctField
          label={S.deco.coverage}
          hint={S.deco.coverageHint}
          hidden={def.kind !== 'along'}
          value={d.coverage}
          min={0.05}
          step={0.05}
          onChange={(v) =>
            setDeco(d.id, (x) => {
              x.coverage = v;
            })
          }
        />
        <NumField
          label={S.deco.offset}
          hint={S.deco.offsetHint}
          value={d.offset}
          min={-80}
          max={160}
          onChange={(v) =>
            setDeco(d.id, (x) => {
              x.offset = v;
            })
          }
        />
        <ColorRefField
          label={t?.c1 ?? S.deco.placement}
          value={d.color}
          onChange={(v) =>
            setDeco(d.id, (x) => {
              x.color = v;
            })
          }
        />
        <ColorRefField
          label={t?.c2 ?? S.deco.placement}
          value={d.color2}
          onChange={(v) =>
            setDeco(d.id, (x) => {
              x.color2 = v;
            })
          }
        />
        <ToggleField
          label={S.deco.clip}
          checked={d.clipFrame}
          onChange={(v) =>
            setDeco(d.id, (x) => {
              x.clipFrame = v;
            })
          }
        />
        <VariantVisibility
          hideIn={d.hideIn}
          testId="deco-show-in"
          onChange={(vid, show) =>
            setDeco(d.id, (x) => {
              if (show) delete x.hideIn[vid];
              else x.hideIn[vid] = true;
            })
          }
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Shuffle />} onClick={() => reseedDeco(d.id)}>
            {S.deco.reseed}
          </Button>
          <Button size="sm" icon={<Copy />} onClick={() => duplicateDeco(d.id)}>
            {S.deco.duplicate}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => removeDeco(d.id)}>
            {S.deco.remove}
          </Button>
        </div>
      </div>
    </Section>
  );
}

function DecoSection() {
  const decos = useFrame((st) => st.data.decorations);
  const selectedId = useSession((st) => st.decoSelected);
  const selected = decos.find((d) => d.id === selectedId) ?? null;
  /* 清單上方＝畫面前方（陣列的最後） */
  const rows = decos.map((d, i) => ({ d, i })).reverse();
  return (
    <>
      <Section
        title={S.deco.section}
        description={S.deco.addHint}
        persistKey="foreground-frame:deco"
      >
        <div className="flex flex-wrap gap-1.5" data-testid="deco-add">
          {DECO_TYPE_IDS.map((type) => (
            <Tooltip key={type} content={S.decoTypes[type]?.desc}>
              <Button
                size="sm"
                icon={<Plus />}
                aria-label={S.deco.addLabel(S.decoTypes[type]?.name ?? type)}
                onClick={() => addDecoration(type)}
              >
                {S.decoTypes[type]?.name ?? type}
              </Button>
            </Tooltip>
          ))}
        </div>
        <Field label={S.deco.list}>
          {decos.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="deco-list">
              {rows.map(({ d, i }) => {
                const name = S.decoTypes[d.type]?.name ?? d.type;
                return (
                  <StackRow
                    key={d.id}
                    testId="deco-row"
                    selected={d.id === selectedId}
                    onSelect={() => selectDeco(d.id)}
                    visible={d.on}
                    visibleLabel={S.deco.show(name)}
                    onVisibleChange={(on) =>
                      setDeco(d.id, (x) => {
                        x.on = on;
                      })
                    }
                    name={name}
                    canForward={i < decos.length - 1}
                    canBackward={i > 0}
                    onForward={() => moveDeco(d.id, 1)}
                    onBackward={() => moveDeco(d.id, -1)}
                    forwardLabel={S.deco.forward(name)}
                    backwardLabel={S.deco.backward(name)}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted" data-testid="deco-empty">
              {S.deco.empty}
            </p>
          )}
        </Field>
      </Section>
      {selected ? <DecoProps d={selected} /> : null}
    </>
  );
}

export function DecoPanel() {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <OrnamentSection />
      <DecoSection />
    </div>
  );
}
