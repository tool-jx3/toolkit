/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 關係類型的編輯面板（原作的「編輯關係」標籤面板）：名稱、顏色／外框、線條樣式、端點樣式、粗細、外框寬度、
 * 磁力、隱藏於圖例、捆綁忽略；使用數、複製、刪除。
 */
import { Copy, Trash2 } from 'lucide-react';
import { Button, Checkbox, Field, OptionalNumberInput, Select, Slider, useConfirm } from '@/ui';
import { typeLineColor, typeOutlineColor } from '../engine/geom';
import { CAP_STYLES, LINE_STYLES } from '../model/normalize';
import type { CapStyle, LineStyle } from '../model/types';
import { copyType, deleteType, updateType } from '../state/actions';
import { gesture, setUi } from '../state/store';
import { S } from '../strings';
import { useCtx, useSheet } from './hooks';
import { TypeSample } from './thumbs';
import { AutoNumber, Block, ColorPair, LiveText } from './widgets';

export function TypePanel({ id }: { id: number }) {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const confirm = useConfirm();
  const t = sheet.types.find((x) => x.id === id);
  if (!t) return null;
  const used = sheet.rels.filter((r) => r.type === t.id);
  const people = new Set(used.flatMap((r) => [r.from, r.to])).size;
  const remove = async () => {
    if (used.length) {
      const ok = await confirm({
        title: S.type.removeTitle(used.length),
        confirmLabel: S.type.removeConfirm,
        danger: true,
      });
      if (!ok) return;
    }
    deleteType(t.id);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="type-panel">
      <Block>
        <div className="flex items-center gap-2">
          <TypeSample ctx={ctx} t={t} width={96} height={28} />
          {t.hidden ? <span className="text-xs text-muted">{S.type.hidden}</span> : null}
        </div>
        <Field label={S.type.name}>
          <LiveText
            multiline
            rows={1}
            value={t.label}
            placeholder={S.type.namePh}
            onChange={(v) =>
              updateType(t.id, (d) => {
                d.label = v.slice(0, 200);
              })
            }
            data-testid="type-name"
          />
        </Field>
      </Block>
      <Block title={S.type.colors}>
        <ColorPair
          a={t.color}
          b={t.outlineColor}
          labels={[S.type.line, S.type.outline]}
          autoA={typeLineColor(ctx, { ...t, color: 'auto' })}
          autoB={typeOutlineColor(ctx, { ...t, outlineColor: 'auto' })}
          onA={(v) =>
            updateType(t.id, (d) => {
              d.color = v;
            })
          }
          onB={(v) =>
            updateType(t.id, (d) => {
              d.outlineColor = v;
            })
          }
          onSwap={() =>
            updateType(t.id, (d) => {
              const x = d.color;
              d.color = d.outlineColor;
              d.outlineColor = x;
            })
          }
          testId="type-colors"
        />
      </Block>
      <Block>
        <div className="grid grid-cols-2 gap-2">
          <Field label={S.type.lineStyle}>
            <Select
              size="sm"
              value={t.lineStyle}
              onValueChange={(v) =>
                updateType(t.id, (d) => {
                  d.lineStyle = v as LineStyle;
                })
              }
              options={LINE_STYLES.map((v) => ({ value: v, label: S.lineStyles[v] }))}
              data-testid="type-line-style"
            />
          </Field>
          <Field label={S.type.capStyle}>
            <Select
              size="sm"
              value={t.capStyle}
              onValueChange={(v) =>
                updateType(t.id, (d) => {
                  d.capStyle = v as CapStyle;
                })
              }
              options={CAP_STYLES.map((v) => ({ value: v, label: S.caps[v] }))}
              data-testid="type-cap-style"
            />
          </Field>
          <Field label={S.type.lineW} hint={S.type.lineWHint}>
            <AutoNumber
              value={t.lineW}
              min={1}
              max={60}
              unit="px"
              onChange={(v) =>
                updateType(t.id, (d) => {
                  d.lineW = v;
                })
              }
            />
          </Field>
          <Field label={S.type.outlineW} hint={S.type.outlineWHint}>
            <OptionalNumberInput
              size="sm"
              value={t.outlineW}
              min={0}
              max={30}
              unit="px"
              placeholder="1"
              aria-label={S.type.outlineW}
              onChange={(v) =>
                updateType(t.id, (d) => {
                  d.outlineW = v;
                })
              }
            />
          </Field>
        </div>
        <Field
          label={S.type.mag}
          hint={S.type.magHint}
          labelSuffix={<span className="text-xs text-muted">{S.mag[t.mag || 3]}</span>}
        >
          <Slider
            min={1}
            max={5}
            step={1}
            value={t.mag >= 1 && t.mag <= 5 ? t.mag : 3}
            valueText={(v) => S.mag[v]}
            onChange={gesture.live((v: number) =>
              updateType(t.id, (d) => {
                d.mag = v;
              }),
            )}
            onCommit={gesture.commit}
            aria-label={S.type.mag}
          />
        </Field>
        <Checkbox
          checked={t.hideInLegend}
          onCheckedChange={(v) =>
            updateType(t.id, (d) => {
              d.hideInLegend = v;
            })
          }
          label={S.type.hideInLegend}
        />
        <Checkbox
          checked={t.pairSkip}
          onCheckedChange={(v) =>
            updateType(t.id, (d) => {
              d.pairSkip = v;
            })
          }
          label={S.type.pairSkip}
        />
        <p className="text-xs text-muted">{S.type.pairSkipTip}</p>
      </Block>
      <p className="text-xs text-muted" data-testid="type-used">
        {S.type.used(used.length, people)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<Copy />}
          onClick={() => {
            const nid = copyType(t.id);
            if (nid) setUi({ panel: { kind: 'type', id: nid } });
          }}
          data-testid="type-copy"
        >
          {S.type.copy}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          onClick={() => void remove()}
          data-testid="type-delete"
        >
          {S.type.remove}
        </Button>
      </div>
    </div>
  );
}
