/**
 * 設定欄：去背方式、AI 模型（下載、運算方式、推論尺寸）、背景色（純色）、邊緣調整、筆刷修邊、使用方式。
 */
import { Brush, Eraser, Hand, Pipette, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OnnxBackendChoice } from '@/core/onnx/types';
import { historyGesture } from '@/core/storage';
import {
  Button,
  ColorField,
  Field,
  type ModelCache,
  ModelDownloadPanel,
  Notice,
  Section,
  Segmented,
  Select,
  Slider,
  Toggle,
  UsageSection,
} from '@/ui';
import { finishPick, pickFromImage } from './actions';
import { backendLabel, clearStrokes, resetAi, useWork } from './engine';
import { type BrushTool, type Mode, modelSpec, RANGE } from './model';
import { edit, setPreview, step, usePreview, useSettings } from './store';
import { S } from './strings';

const g = historyGesture(useSettings);

export function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

function MethodSection() {
  const mode = useSettings((st) => st.data.mode);
  return (
    <Section title={S.sectionMethod} fixed>
      <Field label={S.modeLabel} hint={S.modeHints[mode]}>
        <Segmented<Mode>
          value={mode}
          onValueChange={(v) =>
            step((d) => {
              d.mode = v;
            })
          }
          fullWidth
          options={(['ai', 'color'] as const).map((v) => ({ value: v, label: S.modes[v] }))}
        />
      </Field>
    </Section>
  );
}

function AiSection({ model }: { model: ModelCache }) {
  const backend = useSettings((st) => st.data.backend);
  const inUse = useWork((st) => st.backend);
  const fallback = useWork((st) => st.backendFallback);
  const running = useWork((st) => !!st.ai);
  return (
    <Section title={S.sectionAi} fixed>
      <ModelDownloadPanel
        spec={modelSpec()}
        {...model}
        deleteDisabled={running}
        remove={async () => {
          resetAi();
          await model.remove();
        }}
        readyExtra={
          inUse ? (
            <p className="m-0 text-xs text-muted" data-testid="backend-in-use">
              {S.backendInUse(backendLabel(inUse))}
              {fallback ? `（${S.backendFallback}）` : ''}
            </p>
          ) : null
        }
      />
      <Field label={S.backend} hint={S.backendHint}>
        <Select<OnnxBackendChoice>
          value={backend}
          disabled={running}
          onValueChange={(v) => {
            step((d) => {
              d.backend = v;
            });
            resetAi();
          }}
          options={(['auto', 'webgpu', 'wasm'] as const).map((v) => ({
            value: v,
            label: S.backends[v],
          }))}
        />
      </Field>
      <Field label={S.inferSize} hint={S.inferSizeHint}>
        <output className="flex h-8 items-center text-sm tabular-nums" data-testid="infer-size">
          {S.inferSizeValue}
        </output>
      </Field>
    </Section>
  );
}

function KeySection() {
  const s = useSettings((st) => st.data);
  const keyColor = useWork((st) => st.keyColor);
  const ratio = useWork((st) => st.keyRatio);
  const picking = useWork((st) => st.picking);
  const hasImage = useWork((st) => !!st.itemId);
  const pick = async () => {
    if (picking) {
      finishPick(null);
      return;
    }
    const hex = await pickFromImage();
    if (hex) {
      step((d) => {
        d.keyAuto = false;
        d.keyColor = hex;
      });
    }
  };
  return (
    <Section title={S.sectionKey} fixed>
      <Field label={S.keySource} hint={s.keyAuto ? S.keyAutoHint : undefined}>
        <Segmented<'auto' | 'manual'>
          value={s.keyAuto ? 'auto' : 'manual'}
          onValueChange={(v) =>
            step((d) => {
              d.keyAuto = v === 'auto';
              /* 從自動切到指定時，先用目前偵測到的顏色 */
              if (v === 'manual' && keyColor) d.keyColor = keyColor;
            })
          }
          fullWidth
          options={[
            { value: 'auto', label: S.keyAuto },
            { value: 'manual', label: S.keyManual },
          ]}
        />
      </Field>
      {s.keyAuto ? (
        keyColor ? (
          <p className="m-0 flex items-center gap-2 text-xs text-muted" data-testid="key-detected">
            <span
              aria-hidden
              className="inline-block h-3.5 w-5 shrink-0 rounded-sm border border-border-strong"
              style={{ background: keyColor }}
            />
            {S.detected(keyColor, ratio)}
          </p>
        ) : null
      ) : (
        <Field label={S.keyColor}>
          <ColorField
            value={s.keyColor}
            onChange={(v) =>
              edit((d) => {
                d.keyColor = v;
              })
            }
            pickFromCanvas={hasImage ? pickFromImage : undefined}
            pickFromCanvasLabel={S.pickFromImage}
          />
        </Field>
      )}
      <Button
        size="sm"
        icon={<Pipette />}
        onClick={() => void pick()}
        disabled={!hasImage}
        aria-pressed={picking}
        className="self-start"
      >
        {picking ? S.picking : S.pickFromImage}
      </Button>
      {s.keyAuto && keyColor && ratio < 0.5 ? <Notice tone="warning">{S.lowRatio}</Notice> : null}
      <Field label={S.tolerance} hint={S.toleranceHint}>
        <Slider
          value={s.tolerance}
          onChange={g.live((v) =>
            edit((d) => {
              d.tolerance = v;
            }),
          )}
          onCommit={g.commit}
          min={RANGE.tolerance.min}
          max={RANGE.tolerance.max}
          step={RANGE.tolerance.step}
        />
      </Field>
      <Field label={S.softness} hint={S.softnessHint}>
        <Slider
          value={s.softness}
          onChange={g.live((v) =>
            edit((d) => {
              d.softness = v;
            }),
          )}
          onCommit={g.commit}
          min={RANGE.softness.min}
          max={RANGE.softness.max}
          step={RANGE.softness.step}
        />
      </Field>
      <Field label={S.connected} hint={S.connectedHint} layout="inline">
        <Toggle
          checked={s.connected}
          onCheckedChange={(v) =>
            step((d) => {
              d.connected = v;
            })
          }
        />
      </Field>
      <Field label={S.despill} hint={S.despillHint} layout="inline">
        <Toggle
          checked={s.despill}
          onCheckedChange={(v) =>
            step((d) => {
              d.despill = v;
            })
          }
        />
      </Field>
    </Section>
  );
}

function EdgeSection() {
  const grow = useSettings((st) => st.data.grow);
  const feather = useSettings((st) => st.data.feather);
  return (
    <Section title={S.sectionEdge} fixed>
      <Field label={S.grow} hint={S.growHint}>
        <Slider
          value={grow}
          onChange={g.live((v) =>
            edit((d) => {
              d.grow = Math.round(v);
            }),
          )}
          onCommit={g.commit}
          min={RANGE.grow.min}
          max={RANGE.grow.max}
          step={RANGE.grow.step}
          unit="px"
        />
      </Field>
      <Field label={S.feather} hint={S.featherHint}>
        <Slider
          value={feather}
          onChange={g.live((v) =>
            edit((d) => {
              d.feather = v;
            }),
          )}
          onCommit={g.commit}
          min={RANGE.feather.min}
          max={RANGE.feather.max}
          step={RANGE.feather.step}
          unit="px"
        />
      </Field>
    </Section>
  );
}

const TOOL_ICONS: Record<BrushTool, ReactNode> = {
  move: <Hand />,
  erase: <Eraser />,
  restore: <Brush />,
};

function BrushSection() {
  const tool = usePreview((st) => st.data.tool);
  const size = usePreview((st) => st.data.brushSize);
  const hardness = usePreview((st) => st.data.brushHardness);
  const current = usePreview((st) => st.data.current);
  const strokes = useSettings(
    (st) =>
      (st.data.images.find((it) => it.id === current) ?? st.data.images[0])?.strokes.length ?? 0,
  );
  return (
    <Section title={S.sectionBrush} fixed>
      <Field label={S.tool} hint={S.toolHint}>
        <Segmented<BrushTool>
          value={tool}
          onValueChange={(v) => setPreview({ tool: v })}
          fullWidth
          options={(['move', 'erase', 'restore'] as const).map((v) => ({
            value: v,
            label: S.tools[v],
            icon: TOOL_ICONS[v],
          }))}
        />
      </Field>
      <Field label={S.brushSize}>
        <Slider
          value={size}
          onChange={(v) => setPreview({ brushSize: Math.round(v) })}
          min={RANGE.brushSize.min}
          max={RANGE.brushSize.max}
          step={RANGE.brushSize.step}
          unit="px"
        />
      </Field>
      <Field label={S.brushHardness} hint={S.brushHardnessHint}>
        <Slider
          value={hardness}
          onChange={(v) => setPreview({ brushHardness: Math.round(v) })}
          min={RANGE.brushHardness.min}
          max={RANGE.brushHardness.max}
          step={RANGE.brushHardness.step}
          unit="%"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 />}
          disabled={!strokes}
          onClick={clearStrokes}
        >
          {S.clearStrokes}
        </Button>
        <span className="text-xs text-muted" data-testid="stroke-count">
          {S.strokeCount(strokes)}
        </span>
      </div>
    </Section>
  );
}

export function SettingsPanel({ model }: { model: ModelCache }) {
  const mode = useSettings((st) => st.data.mode);
  return (
    <>
      <MethodSection />
      {mode === 'ai' ? <AiSection model={model} /> : <KeySection />}
      <EdgeSection />
      <BrushSection />
      <UsageSection persistKey="bg-remover">
        <Usage />
      </UsageSection>
      <p className="m-0 px-1 text-xs text-muted">{S.disclaimer}</p>
    </>
  );
}
