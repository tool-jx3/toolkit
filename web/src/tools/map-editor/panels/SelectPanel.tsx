/**
 * 選取工具的面板（1.4）：選取資訊（名稱、X、Y、寬、高、旋轉）、填色與描邊、地面／牆壁／房間的圖樣、陰影。
 */
import { Field, FieldRow, NumberInput, Section } from '@/ui';
import {
  type PatternKind,
  patternInfo,
  setSelectedCornerRadius,
  setSelectedFill,
  setSelectedJoinCap,
  setSelectedPattern,
  setSelectedPatternDetail,
  setSelectedPosition,
  setSelectedShadow,
  setSelectedStroke,
  setSelectedStrokeStyle,
  setSelectedStrokeWidth,
} from '../engine/ops';
import { getEngine } from '../runtime';
import { useEditor, usePrefs } from '../stores';
import { S } from '../strings';
import { PatternDetailFields, ShadowFields, StyleFields } from './fields';
import { PatternPicker } from './PatternPicker';

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm tabular-nums text-muted">{value}</span>
    </div>
  );
}

function PatternSection({ kind }: { kind: PatternKind }) {
  const eng = getEngine();
  const info = eng ? patternInfo(eng, kind) : null;
  if (!eng || !info) return null;
  const label = S.sel.kinds[kind];
  const fill = kind === 'ground' || kind === 'room-ground';
  return (
    <div
      className="flex flex-col gap-2 border-t border-border pt-3"
      data-testid={`sel-pattern-${kind}`}
    >
      <PatternPicker
        label={fill ? S.sel.fillOf(label) : S.sel.strokeOf(label)}
        value={info.state}
        onChange={(st) => setSelectedPattern(eng, kind, st, label)}
      />
      <PatternDetailFields
        offX={info.offX}
        offY={info.offY}
        rot={info.rot}
        scalePct={info.scalePct}
        onChange={(f, v) => setSelectedPatternDetail(eng, kind, f, v, label)}
        persistKey={`map-editor:sel-${kind}-detail`}
      />
    </div>
  );
}

export function SelectPanel() {
  const sel = useEditor((s) => s.selection);
  const pr = usePrefs((s) => s.data);
  const eng = getEngine();
  if (!sel || !eng)
    return (
      <p className="text-sm text-muted" data-testid="sel-none">
        {S.sel.none}
      </p>
    );
  const single = sel.count === 1;
  return (
    <div className="flex flex-col gap-3" data-testid="select-panel">
      {single ? (
        <>
          <Readout label={S.sel.name} value={sel.name} />
          <FieldRow columns={2}>
            <Field label="X">
              <NumberInput
                value={sel.left}
                onChange={() => {}}
                onCommit={(v) => setSelectedPosition(eng, 'x', v)}
                unit="px"
                size="sm"
              />
            </Field>
            <Field label="Y">
              <NumberInput
                value={sel.top}
                onChange={() => {}}
                onCommit={(v) => setSelectedPosition(eng, 'y', v)}
                unit="px"
                size="sm"
              />
            </Field>
          </FieldRow>
          <div className="grid grid-cols-3 gap-2">
            <Readout label={S.sel.width} value={`${sel.width}`} />
            <Readout label={S.sel.height} value={`${sel.height}`} />
            <Readout label={S.sel.rotation} value={`${sel.angle}°`} />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted" data-testid="sel-count">
          {S.sel.count(sel.count)}
        </p>
      )}
      {sel.styleable ? (
        <Section title={S.sel.style} persistKey="map-editor:sel-style">
          <StyleFields
            values={{
              fill: sel.fill,
              stroke: sel.stroke,
              strokeWidth: sel.strokeWidth,
              strokeStyle: sel.strokeStyle,
              lineJoin: sel.lineJoin,
              lineCap: sel.lineCap,
              cornerRadius: sel.cornerRadius,
            }}
            show={{
              fill: true,
              stroke: true,
              width: true,
              style: true,
              joinCap: true,
              radius: sel.hasRect,
            }}
            onFill={(v) => setSelectedFill(eng, v)}
            onStroke={(v) => setSelectedStroke(eng, v)}
            onStrokeWidth={(v) => setSelectedStrokeWidth(eng, v)}
            onStrokeStyle={(v) => setSelectedStrokeStyle(eng, v)}
            onJoin={(v) => setSelectedJoinCap(eng, 'strokeLineJoin', v)}
            onCap={(v) => setSelectedJoinCap(eng, 'strokeLineCap', v)}
            onRadius={(v) => setSelectedCornerRadius(eng, v)}
          />
        </Section>
      ) : null}
      {sel.patternKinds.map((k) => (
        <PatternSection key={k} kind={k} />
      ))}
      <ShadowFields
        value={{
          enabled: !!sel.shadow,
          color: sel.shadow?.color ?? pr.shadowColor,
          blur: sel.shadow?.blur ?? pr.shadowBlur,
          offsetX: sel.shadow?.offsetX ?? pr.shadowOffsetX,
          offsetY: sel.shadow?.offsetY ?? pr.shadowOffsetY,
        }}
        onChange={(p) => {
          const cur = {
            enabled: !!sel.shadow,
            color: sel.shadow?.color ?? pr.shadowColor,
            blur: sel.shadow?.blur ?? pr.shadowBlur,
            offsetX: sel.shadow?.offsetX ?? pr.shadowOffsetX,
            offsetY: sel.shadow?.offsetY ?? pr.shadowOffsetY,
          };
          setSelectedShadow(eng, { ...cur, ...p });
        }}
        persistKey="map-editor:sel-shadow"
      />
    </div>
  );
}
