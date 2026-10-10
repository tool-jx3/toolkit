/**
 * 設定欄：去背方式、AI 模型（下載、運算方式、推論尺寸）、背景色（純色背景、AI＋背景色）、邊緣調整、筆刷修邊、使用方式。
 */
import {
  Brush,
  Eraser,
  Hand,
  PaintBucket,
  Pipette,
  Plus,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { parseColor } from '@/core/color';
import { colorDistance } from '@/core/image';
import type { OnnxBackendChoice } from '@/core/onnx/types';
import { historyGesture } from '@/core/storage';
import {
  Button,
  ColorField,
  Field,
  IconButton,
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
import { addKeyColor, finishPick, pickFromImage, removeKeyColor } from './actions';
import { backendLabel, clearStrokes, type PickPurpose, resetAi, useWork } from './engine';
import {
  type BrushTool,
  isFillTool,
  MAX_KEY_COLORS,
  MODES,
  type Mode,
  modelSpec,
  RANGE,
  usesAi,
  usesKey,
} from './model';
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
          options={MODES.map((v) => ({ value: v, label: S.modes[v] }))}
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

const hexOf = (c: readonly number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** 建議的背景色和清單裡的顏色差這麼多（0～100）以內時當成已經有了（同四邊顏色分群的門檻） */
const SUGGEST_SAME = 12;

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-5 shrink-0 rounded-sm border border-border-strong"
      style={{ background: color }}
    />
  );
}

function KeySection() {
  const s = useSettings((st) => st.data);
  const keyColor = useWork((st) => st.keyColor);
  const ratio = useWork((st) => st.keyRatio);
  const suggestRaw = useWork((st) => st.keySuggest);
  const picking = useWork((st) => st.picking);
  const pickFor = useWork((st) => st.pickFor);
  const hasImage = useWork((st) => !!st.itemId);
  const combo = s.mode === 'combo';
  const count = 1 + s.keyExtra.length;
  const full = count >= MAX_KEY_COLORS;
  /* 建議：四邊常見、清單裡還沒有（也不接近清單裡的顏色）的顏色 */
  const listed = [s.keyAuto ? keyColor : s.keyColor, ...s.keyExtra]
    .map((h) => (h ? parseColor(h) : null))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const suggest = full
    ? []
    : suggestRaw
        .filter((c) =>
          listed.every(
            (l) =>
              colorDistance(c.color[0], c.color[1], c.color[2], [l.r, l.g, l.b]) > SUGGEST_SAME,
          ),
        )
        .slice(0, MAX_KEY_COLORS - count);
  /** 從圖上取色（再按一次同一個按鈕取消） */
  const pick = async (purpose: PickPurpose, apply: (hex: string) => void) => {
    if (picking && pickFor === purpose) {
      finishPick(null);
      return;
    }
    const hex = await pickFromImage(purpose);
    if (hex) apply(hex);
  };
  const pickFirst = () =>
    pick('first', (hex) =>
      step((d) => {
        d.keyAuto = false;
        d.keyColor = hex;
      }),
    );
  const tolKey = combo ? 'comboTolerance' : 'tolerance';
  const softKey = combo ? 'comboSoftness' : 'softness';
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
            <Swatch color={keyColor} />
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
            pickFromCanvas={hasImage ? () => pickFromImage('field') : undefined}
            pickFromCanvasLabel={S.pickFromImage}
          />
        </Field>
      )}
      <Button
        size="sm"
        icon={<Pipette />}
        onClick={() => void pickFirst()}
        disabled={!hasImage}
        aria-pressed={picking && pickFor === 'first'}
        className="self-start"
      >
        {picking && pickFor === 'first' ? S.picking : S.pickFromImage}
      </Button>
      {s.keyAuto && keyColor && ratio < 0.5 && !s.keyExtra.length ? (
        <Notice tone="warning">{S.lowRatio}</Notice>
      ) : null}
      <Field label={S.keyExtra} hint={full ? S.keyFull : S.keyExtraHint}>
        <div className="flex flex-col gap-2" data-testid="key-extra">
          {s.keyExtra.map((hex, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 位置就是身分（以色碼當 key 時，在調色盤裡改顏色會讓色彩欄重建、調色盤關掉）
            <div key={i} className="flex items-center gap-2">
              <ColorField
                value={hex}
                aria-label={S.keyColorN(i + 2)}
                className="min-w-0 flex-1"
                onChange={(v) =>
                  edit((d) => {
                    d.keyExtra[i] = v.toLowerCase();
                  })
                }
                pickFromCanvas={hasImage ? () => pickFromImage('field') : undefined}
                pickFromCanvasLabel={S.pickFromImage}
              />
              <IconButton
                label={S.removeKey(hex)}
                icon={<Trash2 />}
                size="sm"
                onClick={() => removeKeyColor(i)}
              />
            </div>
          ))}
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => void pick('add', (hex) => addKeyColor(hex))}
            disabled={!hasImage || full}
            aria-pressed={picking && pickFor === 'add'}
            className="self-start"
          >
            {picking && pickFor === 'add' ? S.addPicking : S.addPicked}
          </Button>
        </div>
      </Field>
      {suggest.length ? (
        <div className="flex flex-col gap-1.5" data-testid="key-suggest">
          <p className="m-0 text-xs text-muted">{S.suggestTitle}</p>
          {suggest.map((c) => {
            const hex = hexOf(c.color);
            return (
              <div key={hex} className="flex items-center gap-2 text-xs">
                <Swatch color={hex} />
                <span className="min-w-0 flex-1 tabular-nums">{S.suggestItem(hex, c.ratio)}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus />}
                  aria-label={S.addSuggestedLabel(hex)}
                  onClick={() => addKeyColor(hex)}
                >
                  {S.addSuggested}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}
      {count > 1 ? (
        <Field label={S.blend} hint={S.blendHint} layout="inline">
          <Toggle
            checked={s.keyBlend}
            onCheckedChange={(v) =>
              step((d) => {
                d.keyBlend = v;
              })
            }
          />
        </Field>
      ) : null}
      <Field label={S.tolerance} hint={S.toleranceHint}>
        <Slider
          value={s[tolKey]}
          onChange={g.live((v) =>
            edit((d) => {
              d[tolKey] = v;
            }),
          )}
          onCommit={g.commit}
          min={RANGE[tolKey].min}
          max={RANGE[tolKey].max}
          step={RANGE[tolKey].step}
        />
      </Field>
      <Field label={S.softness} hint={S.softnessHint}>
        <Slider
          value={s[softKey]}
          onChange={g.live((v) =>
            edit((d) => {
              d[softKey] = v;
            }),
          )}
          onCommit={g.commit}
          min={RANGE[softKey].min}
          max={RANGE[softKey].max}
          step={RANGE[softKey].step}
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
  const islands = useSettings((st) => st.data.islands);
  const islandKeep = useSettings((st) => st.data.islandKeep);
  return (
    <Section title={S.sectionEdge} fixed>
      <Field label={S.islands} hint={S.islandsHint} layout="inline">
        <Toggle
          checked={islands}
          onCheckedChange={(v) =>
            step((d) => {
              d.islands = v;
            })
          }
        />
      </Field>
      {islands ? (
        <Field label={S.islandKeep} hint={S.islandKeepHint}>
          <Slider
            value={islandKeep}
            onChange={g.live((v) =>
              edit((d) => {
                d.islandKeep = v;
              }),
            )}
            onCommit={g.commit}
            min={RANGE.islandKeep.min}
            max={RANGE.islandKeep.max}
            step={RANGE.islandKeep.step}
            unit="%"
          />
        </Field>
      ) : null}
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
  'fill-erase': <WandSparkles />,
  'fill-restore': <PaintBucket />,
};

const TOOLS: readonly BrushTool[] = ['move', 'erase', 'restore', 'fill-erase', 'fill-restore'];

function BrushSection() {
  const tool = usePreview((st) => st.data.tool);
  const size = usePreview((st) => st.data.brushSize);
  const hardness = usePreview((st) => st.data.brushHardness);
  const fillTolerance = usePreview((st) => st.data.fillTolerance);
  const fillContiguous = usePreview((st) => st.data.fillContiguous);
  const current = usePreview((st) => st.data.current);
  const strokes = useSettings(
    (st) =>
      (st.data.images.find((it) => it.id === current) ?? st.data.images[0])?.strokes.length ?? 0,
  );
  return (
    <Section title={S.sectionBrush} fixed>
      <Field label={S.tool} hint={isFillTool(tool) ? S.fillHint[tool] : S.toolHint}>
        <Segmented<BrushTool>
          value={tool}
          onValueChange={(v) => setPreview({ tool: v })}
          fullWidth
          options={TOOLS.map((v) => ({
            value: v,
            label: S.tools[v],
            icon: TOOL_ICONS[v],
          }))}
        />
      </Field>
      {isFillTool(tool) ? (
        <>
          <Field label={S.fillTolerance} hint={S.fillToleranceHint}>
            <Slider
              value={fillTolerance}
              onChange={(v) => setPreview({ fillTolerance: Math.round(v) })}
              min={RANGE.fillTolerance.min}
              max={RANGE.fillTolerance.max}
              step={RANGE.fillTolerance.step}
              unit="%"
            />
          </Field>
          <Field label={S.fillContiguous} hint={S.fillContiguousHint} layout="inline">
            <Toggle
              checked={fillContiguous}
              onCheckedChange={(v) => setPreview({ fillContiguous: v })}
            />
          </Field>
        </>
      ) : (
        <>
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
        </>
      )}
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
      {usesAi(mode) ? <AiSection model={model} /> : null}
      {usesKey(mode) ? <KeySection /> : null}
      <EdgeSection />
      <BrushSection />
      <UsageSection persistKey="bg-remover">
        <Usage />
      </UsageSection>
      <p className="m-0 px-1 text-xs text-muted">{S.disclaimer}</p>
    </>
  );
}
