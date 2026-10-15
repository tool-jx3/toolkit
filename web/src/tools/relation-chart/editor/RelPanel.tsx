/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 關係線的編輯面板（原作的「編輯關係」）：A ↓ 關係 ↓ B、換關係類型、備註、合併／拆開、反轉、捆綁、彎曲、
 * 特別顯示名稱／備註、磁力（只有這條線）、刪除。
 */
import { ArrowDown, ArrowLeftRight, ArrowUpDown, Combine, Split, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Checkbox, Field, Segmented, Select, Slider } from '@/ui';
import { displayName } from '../engine/geom';
import { typeLabel } from '../model/factory';
import {
  changeRelType,
  deleteRel,
  flipRel,
  mergeRel,
  pairInfo,
  reverseOf,
  setCurve,
  splitRel,
  toggleBundle,
  updateRel,
} from '../state/actions';
import { gesture } from '../state/store';
import { S } from '../strings';
import { useCtx, useSheet } from './hooks';
import { TypeSample } from './thumbs';
import { Block, LiveText } from './widgets';

export function RelPanel({ id }: { id: number }) {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const [warn, setWarn] = useState<string | null>(null);
  const r = sheet.rels.find((x) => x.id === id);
  if (!r) return null;
  const a = sheet.chars.find((c) => c.id === r.from);
  const b = sheet.chars.find((c) => c.id === r.to);
  const t = ctx.typeById.get(r.type);
  const self = r.from === r.to;
  const info = pairInfo(sheet, r);
  const rev = reverseOf(sheet, r);
  const typeMag = t && t.mag >= 1 && t.mag <= 5 ? t.mag : 3;
  return (
    <div className="flex flex-col gap-3" data-testid="rel-panel">
      <Block>
        <div className="flex flex-col items-center gap-1 rounded-md border border-border bg-surface-2 p-2 text-sm">
          <span className="font-semibold">{a ? displayName(a) : '?'}</span>
          {r.both ? (
            <ArrowUpDown className="size-4 text-muted" />
          ) : (
            <ArrowDown className="size-4 text-muted" />
          )}
          {t ? <TypeSample ctx={ctx} t={t} width={64} height={20} /> : null}
          <span>{t ? typeLabel(t, sheet.types) : '?'}</span>
          {r.both ? (
            <ArrowUpDown className="size-4 text-muted" />
          ) : (
            <ArrowDown className="size-4 text-muted" />
          )}
          <span className="font-semibold">{self ? S.char.self : b ? displayName(b) : '?'}</span>
        </div>
        <Field label={S.rel.type}>
          <Select
            value={String(r.type)}
            onValueChange={(v) => {
              setWarn(changeRelType(r.id, Number(v)) ? null : S.rel.typeDup);
            }}
            options={sheet.types.map((x) => ({
              value: String(x.id),
              label: typeLabel(x, sheet.types),
            }))}
            aria-label={S.rel.type}
            data-testid="rel-type"
          />
        </Field>
        {warn ? <p className="text-xs text-danger">{warn}</p> : null}
        <Field label={S.rel.note}>
          <LiveText
            multiline
            rows={2}
            value={r.note}
            placeholder={S.rel.notePh}
            onChange={(v) =>
              updateRel(r.id, (d) => {
                d.note = v.slice(0, 2000);
              })
            }
            data-testid="rel-note"
          />
        </Field>
      </Block>
      {self ? (
        <Block title={S.rel.selfLoop}>
          <p className="text-xs text-muted">{S.rel.selfHint}</p>
        </Block>
      ) : (
        <Block>
          <div className="flex flex-wrap gap-1">
            {rev ? (
              <Button
                size="sm"
                icon={<Combine />}
                onClick={() => mergeRel(r.id)}
                data-testid="rel-merge"
              >
                {S.rel.merge}
              </Button>
            ) : null}
            {r.both ? (
              <Button
                size="sm"
                icon={<Split />}
                onClick={() => splitRel(r.id)}
                data-testid="rel-split"
              >
                {S.rel.split}
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<ArrowLeftRight />}
                onClick={() => setWarn(flipRel(r.id) ? null : S.rel.flipDup)}
                data-testid="rel-flip"
              >
                {S.rel.flip}
              </Button>
            )}
          </div>
          {rev ? <p className="text-xs text-muted">{S.rel.mergeNote}</p> : null}
          {info.canBundle || info.trunkOn ? (
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                className="self-start"
                onClick={() => toggleBundle(r.id)}
                data-testid="rel-bundle"
              >
                {info.trunkOn ? S.rel.unbundle : S.rel.bundle}
              </Button>
              {!info.trunkOn ? <p className="text-xs text-muted">{S.rel.bundleNote}</p> : null}
            </div>
          ) : null}
          {info.pairList.length > 1 ? (
            <Checkbox
              checked={r.pairSkip || info.typeSkip}
              disabled={info.typeSkip}
              onCheckedChange={(v) =>
                updateRel(r.id, (d) => {
                  d.pairSkip = v;
                })
              }
              label={S.rel.pairSkip}
            />
          ) : null}
          {info.typeSkip ? <p className="text-xs text-muted">{S.rel.pairSkipType}</p> : null}
          <Field label={S.rel.curve}>
            <div data-testid="rel-curve">
              <Segmented
                size="sm"
                value={String(info.curve)}
                onValueChange={(v) => setCurve(r.id, Number(v) as 0 | 1 | -1)}
                options={[
                  { value: '0', label: S.rel.curveAuto },
                  { value: '1', label: S.rel.curvePos },
                  { value: '-1', label: S.rel.curveNeg },
                ]}
              />
            </div>
          </Field>
        </Block>
      )}
      <Block>
        <Checkbox
          checked={r.flipName}
          onCheckedChange={(v) =>
            updateRel(r.id, (d) => {
              d.flipName = v;
            })
          }
          label={S.rel.flipName}
        />
        <Checkbox
          checked={r.flipNote}
          onCheckedChange={(v) =>
            updateRel(r.id, (d) => {
              d.flipNote = v;
            })
          }
          label={S.rel.flipNote}
        />
        <p className="text-xs text-muted">{S.rel.flipTip}</p>
        {r.labelT !== null ? (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() =>
              updateRel(r.id, (d) => {
                d.labelT = null;
              })
            }
          >
            {S.rel.labelPosReset}
          </Button>
        ) : null}
        {!self ? (
          <Field
            label={S.rel.mag}
            hint={S.rel.magHint}
            labelSuffix={
              <span className="text-xs text-muted">
                {r.mag ? S.mag[r.mag] : S.rel.magFollow(S.mag[typeMag])}
              </span>
            }
          >
            <Slider
              min={0}
              max={5}
              step={1}
              value={r.mag}
              valueText={(v) => (v ? S.mag[v] : S.rel.magFollow(S.mag[typeMag]))}
              onChange={gesture.live((v: number) =>
                updateRel(r.id, (d) => {
                  d.mag = v;
                }),
              )}
              onCommit={gesture.commit}
              aria-label={S.rel.mag}
            />
          </Field>
        ) : null}
      </Block>
      <Button
        size="sm"
        variant="danger"
        className="self-start"
        icon={<Trash2 />}
        onClick={() => deleteRel(r.id)}
        data-testid="rel-delete"
      >
        {S.rel.remove}
      </Button>
    </div>
  );
}
