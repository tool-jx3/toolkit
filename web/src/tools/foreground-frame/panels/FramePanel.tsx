/**
 * 「框」分頁：設計範本（F01、F02）、輸出尺寸（F03～F05）、窗（F07～F13）、顏色與填色（F14～F19）、線條與陰影（F20～F22）。
 */
import { useEffect, useState } from 'react';
import { suggestGridCells } from '@/ccfolia';
import { Button, Field, FieldRow, NumberInput, Section, Segmented, Select } from '@/ui';
import {
  applyDesignById,
  applyLayout,
  setLinkCorners,
  setLinkMargin,
  setPaletteColor,
  setSize,
} from '../actions';
import { ColorFieldRow, ColorRefField, NumField, PctField, ToggleField } from '../controls';
import { windowInfo } from '../geometry';
import { colorsTarget, currentItem, type FillMode, PALETTE_KEYS } from '../model';
import { CORNER_TYPES, DESIGNS, LAYOUTS, SIZE_LIMITS, SIZE_PRESETS } from '../presets';
import { edit, useFrame, usePreview } from '../store';
import { S } from '../strings';

const sizeKey = (w: number, h: number) => `${w}x${h}`;

function DesignSection() {
  const design = useFrame((st) => st.data.design);
  const [picked, setPicked] = useState(
    DESIGNS.some((d) => d.id === design) ? design : DESIGNS[0].id,
  );
  const info = S.designs[picked];
  return (
    <Section title={S.design.section} persistKey="foreground-frame:design">
      <Field label={S.design.label} hint={info ? `${info.desc}${S.design.note}` : undefined}>
        <div className="flex min-w-0 gap-2">
          <Select
            value={picked}
            onValueChange={setPicked}
            options={DESIGNS.map((d) => ({ value: d.id, label: S.designs[d.id]?.name ?? d.id }))}
            className="min-w-0 flex-1"
          />
          <Button variant="primary" onClick={() => applyDesignById(picked)}>
            {S.design.apply}
          </Button>
        </div>
      </Field>
    </Section>
  );
}

function SizeSection() {
  const size = useFrame((st) => st.data.size);
  const known = SIZE_PRESETS.some((p) => p.w === size.w && p.h === size.h);
  const [customOpen, setCustomOpen] = useState(!known);
  const [w, setW] = useState(size.w);
  const [h, setH] = useState(size.h);
  useEffect(() => {
    setW(size.w);
    setH(size.h);
  }, [size.w, size.h]);
  useEffect(() => {
    if (!known) setCustomOpen(true);
  }, [known]);
  const value = customOpen || !known ? 'custom' : sizeKey(size.w, size.h);
  const cells = suggestGridCells(size.w, size.h);
  return (
    <Section title={S.size.section} persistKey="foreground-frame:size">
      <Field
        label={S.size.label}
        hint={
          <span data-testid="grid-hint">
            {S.size.cells(cells.width, cells.height)}
            {cells.approximate ? S.size.approx : ''}
          </span>
        }
      >
        <Select
          value={value}
          onValueChange={(v) => {
            if (v === 'custom') {
              setCustomOpen(true);
              return;
            }
            setCustomOpen(false);
            const [pw, ph] = v.split('x').map(Number);
            setSize(pw, ph);
          }}
          options={[
            ...SIZE_PRESETS.map((p) => ({
              value: sizeKey(p.w, p.h),
              label: `${p.w} × ${p.h}（${S.size.presetNote[sizeKey(p.w, p.h)]}）`,
            })),
            { value: 'custom', label: S.size.custom },
          ]}
        />
      </Field>
      {value === 'custom' ? (
        <>
          <FieldRow columns={2}>
            <Field label={S.size.width}>
              <NumberInput
                value={w}
                onChange={setW}
                onCommit={(v) => setSize(v, h)}
                min={SIZE_LIMITS.min}
                max={SIZE_LIMITS.max}
                step={1}
                precision={0}
                unit="px"
              />
            </Field>
            <Field label={S.size.height}>
              <NumberInput
                value={h}
                onChange={setH}
                onCommit={(v) => setSize(w, v)}
                min={SIZE_LIMITS.min}
                max={SIZE_LIMITS.max}
                step={1}
                precision={0}
                unit="px"
              />
            </Field>
          </FieldRow>
          <p className="m-0 text-xs text-muted">{S.size.customHint}</p>
        </>
      ) : null}
    </Section>
  );
}

function OpeningSection() {
  const s = useFrame((st) => st.data);
  const o = s.opening;
  const info = windowInfo(s);
  const sideMax = { t: 540, b: 540, l: 960, r: 960 } as const;
  return (
    <Section title={S.opening.section} persistKey="foreground-frame:opening">
      <Field label={S.opening.shape}>
        <Segmented
          value={o.shape}
          onValueChange={(v) =>
            edit((d) => {
              d.opening.shape = v;
            })
          }
          options={[
            { value: 'rect', label: S.opening.rect },
            { value: 'ellipse', label: S.opening.ellipse },
          ]}
          fullWidth
        />
      </Field>
      <Field label={S.opening.quick}>
        <div className="flex flex-wrap gap-1.5">
          {LAYOUTS.map((l) => (
            <Button key={l.id} size="sm" onClick={() => applyLayout(l.margin)}>
              {S.opening.layouts[l.id]}
            </Button>
          ))}
        </div>
      </Field>
      <ToggleField label={S.opening.link} checked={o.linkMargin} onChange={setLinkMargin} />
      {o.linkMargin ? (
        <NumField
          label={S.opening.all}
          value={o.margin.t}
          min={0}
          max={400}
          onChange={(v) =>
            edit((d) => {
              d.opening.margin = { t: v, r: v, b: v, l: v };
            })
          }
        />
      ) : (
        (['t', 'b', 'l', 'r'] as const).map((k) => (
          <NumField
            key={k}
            label={S.opening[k]}
            value={o.margin[k]}
            min={0}
            max={sideMax[k]}
            onChange={(v) =>
              edit((d) => {
                d.opening.margin[k] = v;
              })
            }
          />
        ))
      )}
      <p className="m-0 text-xs text-muted" data-testid="window-info">
        {S.opening.info(info.pxW, info.pxH, info.cellsW, info.cellsH, info.posX, info.posY)}
      </p>
      {o.shape === 'rect' ? (
        <>
          <ToggleField
            label={S.opening.linkCorners}
            checked={o.linkCorners}
            onChange={setLinkCorners}
          />
          {(o.linkCorners ? [0] : [0, 1, 2, 3]).map((i) => {
            const name = o.linkCorners ? S.opening.cornerAll : S.opening.cornerNames[i];
            const c = o.corners[i];
            return (
              <div key={i} className="flex flex-col gap-1.5" data-testid={`corner-${i}`}>
                <Field label={S.opening.cornerShape(name)}>
                  <Select
                    value={c.type}
                    onValueChange={(v) =>
                      edit((d) => {
                        d.opening.corners[i].type = v;
                      })
                    }
                    options={CORNER_TYPES.map((t) => ({
                      value: t,
                      label: S.opening.cornerTypes[t],
                    }))}
                  />
                </Field>
                <NumField
                  label={S.opening.cornerSize(name)}
                  value={c.size}
                  min={0}
                  max={300}
                  onChange={(v) =>
                    edit((d) => {
                      d.opening.corners[i].size = v;
                    })
                  }
                />
              </div>
            );
          })}
        </>
      ) : null}
      <NumField
        label={S.opening.outerRadius}
        hint={S.opening.outerHint}
        value={o.outerRadius}
        min={0}
        max={160}
        onChange={(v) =>
          edit((d) => {
            d.opening.outerRadius = v;
          })
        }
      />
    </Section>
  );
}

function ColorsSection() {
  const s = useFrame((st) => st.data);
  const current = usePreview((st) => st.data.current);
  const cur = currentItem(s, current);
  const target = colorsTarget(s, cur);
  const colors = target === 'variant' && cur ? cur : s.palette;
  const f = s.frame;
  return (
    <Section title={S.colors.section} persistKey="foreground-frame:colors">
      <FieldRow columns={2}>
        {PALETTE_KEYS.map((k) => (
          <ColorFieldRow
            key={k}
            label={S.colors[k]}
            value={colors[k]}
            onChange={(v) => setPaletteColor(k, v)}
          />
        ))}
      </FieldRow>
      <p className="m-0 text-xs text-muted" data-testid="colors-target">
        {target === 'variant' && cur
          ? S.colors.editingVariant(cur.name || S.variant.noName)
          : S.colors.editingGlobal}
      </p>
      <Field label={S.colors.fill} hint={S.colors.fillHint[f.fill]}>
        <Select<FillMode>
          value={f.fill}
          onValueChange={(v) =>
            edit((d) => {
              d.frame.fill = v;
            })
          }
          options={(['linear', 'radial', 'solid', 'none'] as const).map((v) => ({
            value: v,
            label: S.colors.fills[v],
          }))}
        />
      </Field>
      <NumField
        label={S.colors.angle}
        hint={S.colors.angleHint}
        hidden={f.fill !== 'linear'}
        value={f.angle}
        min={0}
        max={360}
        step={15}
        unit="°"
        onChange={(v) =>
          edit((d) => {
            d.frame.angle = v;
          })
        }
      />
      <PctField
        label={S.colors.opacity}
        hidden={f.fill === 'none'}
        value={f.opacity}
        onChange={(v) =>
          edit((d) => {
            d.frame.opacity = v;
          })
        }
      />
      <PctField
        label={S.colors.grain}
        hint={S.colors.grainHint}
        hidden={f.fill === 'none'}
        value={f.grain}
        step={0.05}
        onChange={(v) =>
          edit((d) => {
            d.frame.grain = v;
          })
        }
      />
    </Section>
  );
}

function LinesSection() {
  const f = useFrame((st) => st.data.frame);
  const il = f.innerLine;
  const ol = f.outerLine;
  const sh = f.shadow;
  return (
    <Section title={S.lines.section} persistKey="foreground-frame:lines">
      <ToggleField
        label={S.lines.inner}
        checked={il.on}
        onChange={(v) =>
          edit((d) => {
            d.frame.innerLine.on = v;
          })
        }
      />
      {il.on ? (
        <div className="flex flex-col gap-3 border-l-2 border-border pl-3">
          <NumField
            label={S.lines.innerWidth}
            value={il.width}
            min={1}
            max={24}
            onChange={(v) =>
              edit((d) => {
                d.frame.innerLine.width = v;
              })
            }
          />
          <NumField
            label={S.lines.innerGap}
            value={il.gap}
            min={0}
            max={120}
            onChange={(v) =>
              edit((d) => {
                d.frame.innerLine.gap = v;
              })
            }
          />
          <ToggleField
            label={S.lines.double}
            checked={il.double}
            onChange={(v) =>
              edit((d) => {
                d.frame.innerLine.double = v;
              })
            }
          />
          <ColorRefField
            label={S.lines.innerColor}
            value={il.color}
            onChange={(v) =>
              edit((d) => {
                d.frame.innerLine.color = v;
              })
            }
          />
        </div>
      ) : null}
      <ToggleField
        label={S.lines.outer}
        checked={ol.on}
        onChange={(v) =>
          edit((d) => {
            d.frame.outerLine.on = v;
          })
        }
      />
      {ol.on ? (
        <div className="flex flex-col gap-3 border-l-2 border-border pl-3">
          <NumField
            label={S.lines.outerWidth}
            value={ol.width}
            min={1}
            max={24}
            onChange={(v) =>
              edit((d) => {
                d.frame.outerLine.width = v;
              })
            }
          />
          <NumField
            label={S.lines.outerGap}
            value={ol.gap}
            min={0}
            max={120}
            onChange={(v) =>
              edit((d) => {
                d.frame.outerLine.gap = v;
              })
            }
          />
          <ColorRefField
            label={S.lines.outerColor}
            value={ol.color}
            onChange={(v) =>
              edit((d) => {
                d.frame.outerLine.color = v;
              })
            }
          />
        </div>
      ) : null}
      <ToggleField
        label={S.lines.shadow}
        hint={S.lines.shadowHint}
        checked={sh.on}
        onChange={(v) =>
          edit((d) => {
            d.frame.shadow.on = v;
          })
        }
      />
      {sh.on ? (
        <div className="flex flex-col gap-3 border-l-2 border-border pl-3">
          <NumField
            label={S.lines.shadowSize}
            value={sh.size}
            min={1}
            max={160}
            onChange={(v) =>
              edit((d) => {
                d.frame.shadow.size = v;
              })
            }
          />
          <PctField
            label={S.lines.shadowOpacity}
            value={sh.opacity}
            onChange={(v) =>
              edit((d) => {
                d.frame.shadow.opacity = v;
              })
            }
          />
          <ColorRefField
            label={S.lines.shadowColor}
            value={sh.color}
            onChange={(v) =>
              edit((d) => {
                d.frame.shadow.color = v;
              })
            }
          />
        </div>
      ) : null}
    </Section>
  );
}

export function FramePanel() {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <DesignSection />
      <SizeSection />
      <OpeningSection />
      <ColorsSection />
      <LinesSection />
    </div>
  );
}
