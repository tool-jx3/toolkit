/**
 * 右側：小地圖、數量、選取的東西的屬性（名字與骰子、顏色、大小、字型、弧形文字、城牆、棧橋、GM 專用、複製與刪除）。
 * 文字欄從聚焦到離開算一步復原；滑桿按下到放開算一步；選單、開關每次改變算一步。
 */
import { Copy, Dices, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  GestureScope,
  IconButton,
  NumberInput,
  Select,
  Slider,
  TextInput,
  Toggle,
} from '@/ui';
import { assetIconUrl } from '../draw/thumbs';
import { assetDef } from '../model/assets';
import {
  CELL,
  DOCK_SIDES,
  LABEL_FONTS,
  LIMITS,
  type MapObject,
  type MapPath,
  type Note,
  RANGES,
  type Region,
  type SelRef,
} from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { Minimap } from './Minimap';
import { setEditor, useDoc, useEditor } from './store';
import { TravelPanel } from './TravelPanel';

const g = historyGesture(useDoc);

function Typing({ children }: { children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只追蹤裡面欄位的聚焦（復原的一步），不是互動元素
    <div className="contents" onFocus={g.begin} onBlur={g.commit}>
      {children}
    </div>
  );
}

function NameField({
  sel,
  label,
  value,
  max,
  testId,
}: {
  sel: SelRef;
  label: string;
  value: string;
  max: number;
  testId: string;
}) {
  return (
    <Field label={label}>
      <div className="flex min-w-0 gap-1">
        <Typing>
          <TextInput
            value={value}
            maxLength={max}
            className="min-w-0 flex-1"
            data-testid={testId}
            onChange={(e) =>
              act.patchItem(
                sel,
                sel.kind === 'note' ? { text: e.target.value } : { name: e.target.value },
              )
            }
          />
        </Typing>
        <IconButton
          icon={<Dices />}
          label={S.inspector.dice}
          variant="secondary"
          onPointerDown={(e) => {
            /* 先讓文字欄的這一步結束，再提案（兩步各自可以復原） */
            if (e.button === 0) e.preventDefault();
          }}
          onClick={() => act.rollName()}
          data-testid="dice"
        />
      </div>
    </Field>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        unit={unit}
        onChange={g.live(onChange)}
        onCommit={g.commit}
      />
    </Field>
  );
}

function LabelOffset({
  sel,
  dx,
  dy,
  lim,
}: {
  sel: SelRef;
  dx: number;
  dy: number;
  lim: { x: number; y: number };
}) {
  return (
    <FieldRow>
      <Field label={S.inspector.labelDx}>
        <NumberInput
          value={dx}
          min={-lim.x}
          max={lim.x}
          onChange={g.live((v) => act.patchItem(sel, { labelDx: v }))}
          onCommit={g.commit}
        />
      </Field>
      <Field label={S.inspector.labelDy}>
        <NumberInput
          value={dy}
          min={-lim.y}
          max={lim.y}
          onChange={g.live((v) => act.patchItem(sel, { labelDy: v }))}
          onCommit={g.commit}
        />
      </Field>
    </FieldRow>
  );
}

const fontOptions = LABEL_FONTS.map((f) => ({ value: f, label: S.inspector.fonts[f] }));

function FontAndCurve({ sel, font, curve }: { sel: SelRef; font: Region['font']; curve: number }) {
  return (
    <>
      <Field label={S.inspector.font}>
        <Select
          value={font}
          onValueChange={(v) => act.patchItem(sel, { font: v })}
          options={fontOptions}
        />
      </Field>
      <SliderField
        label={S.inspector.curve}
        value={curve}
        min={RANGES.curve.min}
        max={RANGES.curve.max}
        step={5}
        onChange={(v) => act.patchItem(sel, { curve: v })}
      />
    </>
  );
}

function RegionProps({ sel, r }: { sel: SelRef; r: Region }) {
  const doc = useDoc((s) => s.data);
  return (
    <>
      <NameField
        sel={sel}
        label={S.inspector.name}
        value={r.name}
        max={LIMITS.name}
        testId="prop-name"
      />
      <p className="m-0 text-xs text-muted">{S.inspector.vertexHint}</p>
      <Field label={S.inspector.wall} layout="inline">
        <Toggle checked={r.wall} onCheckedChange={(v) => act.patchItem(sel, { wall: v })} />
      </Field>
      {r.wall ? (
        <Button size="sm" onClick={act.addInnerWall} data-testid="inner-wall">
          {S.inspector.innerWall}
        </Button>
      ) : null}
      <Field label={S.inspector.color}>
        <GestureScope gesture={g}>
          <ColorField
            value={r.color}
            onChange={(v) => act.patchItem(sel, { color: v.slice(0, 7) })}
          />
        </GestureScope>
      </Field>
      <SliderField
        label={S.inspector.opacity}
        value={r.opacity}
        min={RANGES.opacity.min}
        max={RANGES.opacity.max}
        step={0.01}
        onChange={(v) => act.patchItem(sel, { opacity: v })}
      />
      <SliderField
        label={S.inspector.labelSize}
        value={r.labelSize}
        min={RANGES.regionLabel.min}
        max={RANGES.regionLabel.max}
        unit="px"
        onChange={(v) => act.patchItem(sel, { labelSize: v })}
      />
      <FontAndCurve sel={sel} font={r.font} curve={r.curve} />
      <LabelOffset
        sel={sel}
        dx={r.labelDx}
        dy={r.labelDy}
        lim={{ x: doc.cols * CELL, y: doc.rows * CELL }}
      />
    </>
  );
}

function ObjectProps({ sel, o }: { sel: SelRef; o: MapObject }) {
  return (
    <>
      <NameField
        sel={sel}
        label={S.inspector.name}
        value={o.name}
        max={LIMITS.name}
        testId="prop-name"
      />
      <SliderField
        label={S.inspector.size}
        value={o.size}
        min={RANGES.objectSize.min}
        max={RANGES.objectSize.max}
        unit="px"
        onChange={(v) => act.patchItem(sel, { size: v })}
      />
      <SliderField
        label={S.inspector.rotation}
        value={o.rotation}
        min={RANGES.rotation.min}
        max={RANGES.rotation.max}
        unit="°"
        onChange={(v) => act.patchItem(sel, { rotation: v })}
      />
      <Field label={S.inspector.flip} layout="inline">
        <Toggle checked={o.flip} onCheckedChange={(v) => act.patchItem(sel, { flip: v })} />
      </Field>
      {o.kind === 'port' ? (
        <Field label={S.inspector.dock} hint={S.inspector.dockHint}>
          <Select
            value={o.dock}
            onValueChange={(v) => act.patchItem(sel, { dock: v })}
            options={DOCK_SIDES.map((v) => ({ value: v, label: S.inspector.docks[v] }))}
          />
        </Field>
      ) : null}
      <LabelOffset
        sel={sel}
        dx={o.labelDx}
        dy={o.labelDy}
        lim={{ x: RANGES.labelOffset, y: RANGES.labelOffset }}
      />
    </>
  );
}

function NoteProps({ sel, n }: { sel: SelRef; n: Note }) {
  return (
    <>
      <NameField
        sel={sel}
        label={S.inspector.text}
        value={n.text}
        max={LIMITS.note}
        testId="prop-text"
      />
      <SliderField
        label={S.inspector.textSize}
        value={n.size}
        min={RANGES.noteSize.min}
        max={RANGES.noteSize.max}
        unit="px"
        onChange={(v) => act.patchItem(sel, { size: v })}
      />
      <SliderField
        label={S.inspector.rotation}
        value={n.rotation}
        min={RANGES.rotation.min}
        max={RANGES.rotation.max}
        unit="°"
        onChange={(v) => act.patchItem(sel, { rotation: v })}
      />
      <FontAndCurve sel={sel} font={n.font} curve={n.curve} />
    </>
  );
}

function PathProps({ sel, p }: { sel: SelRef; p: MapPath }) {
  return (
    <>
      <NameField
        sel={sel}
        label={S.inspector.pathName}
        value={p.name}
        max={LIMITS.name}
        testId="prop-name"
      />
      <TravelPanel sel={sel} p={p} />
      <SliderField
        label={p.kind === 'wall' ? S.inspector.wallWidth : S.inspector.width}
        value={p.width}
        min={RANGES.width.min}
        max={RANGES.width.max}
        unit="px"
        onChange={(v) => act.patchItem(sel, { width: v })}
      />
      {p.kind !== 'wall' ? (
        <Field label={S.inspector.smooth} layout="inline">
          <Toggle checked={p.smooth} onCheckedChange={(v) => act.patchItem(sel, { smooth: v })} />
        </Field>
      ) : null}
      {p.kind === 'river' ? (
        <p className="m-0 text-xs text-muted">{S.inspector.riverHint}</p>
      ) : null}
      <p className="m-0 text-xs text-muted">{S.inspector.vertexHint}</p>
    </>
  );
}

function Selection() {
  const sel = useEditor((s) => s.sel);
  const audience = useEditor((s) => s.audience);
  const doc = useDoc((s) => s.data);
  const item = sel ? act.getItem(doc, sel) : undefined;
  if (!sel || !item || audience === 'player')
    return <p className="m-0 text-xs leading-relaxed text-muted">{S.inspector.empty}</p>;
  const title =
    sel.kind === 'object'
      ? (assetDef((item as MapObject).kind)?.name ?? '')
      : sel.kind === 'path'
        ? S.pathNames[(item as MapPath).kind]
        : sel.kind === 'region'
          ? (item as Region).name || S.routes.unnamed
          : (item as Note).text || S.routes.unnamed;
  return (
    <div className="flex flex-col gap-2.5" data-testid="inspector">
      <div className="flex items-center gap-2">
        {sel.kind === 'object' ? (
          <img
            src={assetIconUrl((item as MapObject).kind, doc.theme)}
            alt=""
            className="size-9 shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs text-muted">{S.inspector.kinds[sel.kind]}</p>
          <p className="m-0 truncate font-semibold" data-testid="inspector-title">
            {title}
          </p>
        </div>
        <IconButton
          size="sm"
          variant="ghost"
          icon={<X />}
          label={S.inspector.deselect}
          onClick={() => setEditor({ sel: null })}
        />
      </div>
      {sel.kind === 'region' ? <RegionProps sel={sel} r={item as Region} /> : null}
      {sel.kind === 'object' ? <ObjectProps sel={sel} o={item as MapObject} /> : null}
      {sel.kind === 'note' ? <NoteProps sel={sel} n={item as Note} /> : null}
      {sel.kind === 'path' ? <PathProps sel={sel} p={item as MapPath} /> : null}
      {sel.kind !== 'region' ? (
        <Field label={S.inspector.secret} layout="inline">
          <Toggle
            checked={(item as MapObject).secret}
            onCheckedChange={(v) => act.patchItem(sel, { secret: v })}
          />
        </Field>
      ) : null}
      <div className="flex gap-1.5">
        <Button size="sm" icon={<Copy />} onClick={act.duplicateSelected} className="flex-1">
          {S.inspector.duplicate}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          onClick={act.deleteSelected}
          className="flex-1"
          data-testid="delete"
        >
          {S.inspector.delete}
        </Button>
      </div>
    </div>
  );
}

export function Inspector() {
  const regions = useDoc((s) => s.data.regions.length);
  const objects = useDoc((s) => s.data.objects.length);
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2.5 rounded-md border border-border bg-surface p-2.5 lg:overflow-y-auto">
      <Minimap />
      <div className="grid grid-cols-2 gap-1.5 text-center">
        <div className="rounded-md bg-surface-2 px-2 py-1">
          <p className="m-0 text-xs text-muted">{S.inspector.regions}</p>
          <p className="m-0 font-semibold tabular-nums" data-testid="region-count">
            {regions}
          </p>
        </div>
        <div className="rounded-md bg-surface-2 px-2 py-1">
          <p className="m-0 text-xs text-muted">{S.inspector.objects}</p>
          <p className="m-0 font-semibold tabular-nums" data-testid="object-count">
            {objects}
          </p>
        </div>
      </div>
      <hr className="m-0 border-border" />
      <Selection />
    </div>
  );
}
