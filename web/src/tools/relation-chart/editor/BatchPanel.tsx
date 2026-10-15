/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 批次編輯面板（選取 2 位以上；原作的「批次編輯」）：釘選、複製、刪除、對齊與分佈；
 * 頭像、形狀、外框、背景（不一致時「混合」，點一下全部拉齊）、顏色、尺寸、重要度、標籤。
 */
import { AlignCenterHorizontal, Copy, Lock, LockOpen, Trash2, X } from 'lucide-react';
import { Button, Field, Segmented, Toggle, useToast } from '@/ui';
import {
  borderFlags,
  charBgFillColor,
  charHasBg,
  charHasBorder,
  charLevel,
  charRingColor,
} from '../engine/geom';
import type { Char, ColorValue } from '../model/types';
import { copyChars, deleteChars, updateChars } from '../state/actions';
import { setUi } from '../state/store';
import { S } from '../strings';
import { LabelChips, LevelField } from './CharPanel';
import { useCtx, useSheet } from './hooks';
import { AutoNumber, Block, ColorPair } from './widgets';

/** 大家都一樣時回傳那個值，否則 null */
function same<T>(list: readonly Char[], f: (c: Char) => T): T | null {
  if (!list.length) return null;
  const v = f(list[0]);
  return list.every((c) => f(c) === v) ? v : null;
}

function MixedToggle({
  value,
  label,
  onChange,
}: {
  value: boolean | null;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Toggle checked={value === true} onCheckedChange={onChange} label={label} />
      {value === null ? <span className="text-xs text-warning">{S.batch.mixed}</span> : null}
    </div>
  );
}

export function BatchPanel({ ids }: { ids: readonly number[] }) {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const toast = useToast();
  const list = sheet.chars.filter((c) => ids.includes(c.id));
  if (list.length < 2) return null;
  const s = sheet.settings;
  const allLocked = list.every((c) => c.locked);
  const shape = same(list, (c) => c.shape || 'auto');
  const fill = same(list, (c) => c.nameColor);
  const ring = same(list, (c) => c.color);
  const size = same(list, (c) => c.size);
  const nameSize = same(list, (c) => c.nameSize);
  const borderW = same(list, (c) => c.borderW);
  const level = same(list, (c) => charLevel(c));
  const setColor = (key: 'color' | 'nameColor', v: ColorValue) =>
    updateChars(ids, (c) => {
      c[key] = v;
    });
  return (
    <div className="flex flex-col gap-3" data-testid="batch-panel">
      <Block>
        <p className="font-semibold" data-testid="batch-count">
          {S.batch.title(list.length)}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            icon={allLocked ? <LockOpen /> : <Lock />}
            onClick={() =>
              updateChars(ids, (c) => {
                c.locked = !allLocked;
              })
            }
            data-testid="batch-lock"
          >
            {allLocked ? S.batch.unlock : S.batch.lock}
          </Button>
          <Button
            size="sm"
            icon={<Copy />}
            onClick={() => {
              const out = copyChars(ids);
              setUi({ sel: out });
              toast({ title: S.msg.copied(out.length), tone: 'success' });
            }}
            data-testid="batch-copy"
          >
            {S.batch.copy}
          </Button>
          <Button
            size="sm"
            icon={<AlignCenterHorizontal />}
            onClick={() => setUi({ dialog: 'align' })}
          >
            {S.batch.align}
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 />}
            onClick={() => {
              deleteChars(ids);
              setUi({ sel: [] });
            }}
            data-testid="batch-delete"
          >
            {S.batch.remove}
          </Button>
          <Button size="sm" variant="ghost" icon={<X />} onClick={() => setUi({ sel: [] })}>
            {S.batch.clear}
          </Button>
        </div>
      </Block>
      <Block title={S.char.avatar}>
        <MixedToggle
          value={same(list, (c) => !c.noAvatar)}
          label={S.char.showAvatar}
          onChange={(v) =>
            updateChars(
              ids,
              (c) => {
                c.noAvatar = !v;
              },
              true,
            )
          }
        />
        <Field label={S.char.shape}>
          <Segmented
            size="sm"
            value={shape ?? 'mixed'}
            onValueChange={(v) =>
              updateChars(
                ids,
                (c) => {
                  c.shape = v === 'auto' ? '' : (v as Char['shape']);
                },
                true,
              )
            }
            onReselect={(v) =>
              updateChars(
                ids,
                (c) => {
                  c.shape = v === 'auto' ? '' : (v as Char['shape']);
                },
                true,
              )
            }
            options={[
              { value: 'auto', label: S.char.shapeAuto },
              { value: 'circle', label: S.char.shapeCircle },
              { value: 'square', label: S.char.shapeSquare },
            ]}
          />
        </Field>
        <MixedToggle
          value={same(list, (c) => charHasBorder(ctx, c))}
          label={S.char.border}
          onChange={(v) =>
            updateChars(ids, (c) => void Object.assign(c, borderFlags(s, 'border', v)))
          }
        />
        <MixedToggle
          value={same(list, (c) => charHasBg(ctx, c))}
          label={S.char.bg}
          onChange={(v) => updateChars(ids, (c) => void Object.assign(c, borderFlags(s, 'bg', v)))}
        />
        <p className="text-xs text-muted">{S.batch.mixedHint}</p>
      </Block>
      <Block title={S.char.colors}>
        <ColorPair
          a={fill ?? 'auto'}
          b={ring ?? 'auto'}
          labels={[S.char.fill, S.char.ring]}
          autoA={charBgFillColor(ctx, { ...list[0], nameColor: 'auto' })}
          autoB={charRingColor(ctx, { ...list[0], color: 'auto' })}
          onA={(v) => setColor('nameColor', v)}
          onB={(v) => setColor('color', v)}
          onSwap={() =>
            updateChars(ids, (c) => {
              const t = c.color;
              c.color = c.nameColor;
              c.nameColor = t;
            })
          }
        />
      </Block>
      <Block title={S.char.size}>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['size', S.char.avatarSize, size, 32, 2000],
              ['nameSize', S.char.nameSize, nameSize, 1, 400],
              ['borderW', S.char.borderW, borderW, 1, 100],
            ] as const
          ).map(([key, label, v, min, max]) => (
            <div key={key} className="flex flex-col gap-1 text-xs text-muted">
              {label}
              <AutoNumber
                value={v}
                min={min}
                max={max}
                aria-label={label}
                onChange={(n) =>
                  updateChars(
                    ids,
                    (c) => {
                      c[key] = n;
                    },
                    key === 'size',
                  )
                }
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">{S.batch.sizeHint}</p>
      </Block>
      <Block title={S.char.level}>
        <LevelField
          value={level}
          mixed={level === null}
          onSet={(v) =>
            updateChars(
              ids,
              (c) => {
                c.level = v;
              },
              true,
            )
          }
          onShift={(k) =>
            updateChars(
              ids,
              (c) => {
                c.level = charLevel(c as Char) + k;
              },
              true,
            )
          }
        />
        <p className="text-xs text-muted">{S.batch.levelHint}</p>
      </Block>
      <Block title={S.char.labels}>
        <LabelChips ids={ids} />
        <p className="text-xs text-muted">{S.batch.labelsHint}</p>
      </Block>
    </div>
  );
}
