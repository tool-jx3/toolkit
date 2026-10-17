/**
 * 設定欄（規格 1.2～1.8、1.10 的範本）：範本、畫布、數量上限、大小、機率、圖形的種類、重疊、樣式。
 * 每個設定改了就寫進 store（自動儲存、可以復原），預覽由 Preview 依最新的設定重畫。
 */
import { useEffect, useRef } from 'react';
import {
  Checkbox,
  ColorField,
  Field,
  FieldRow,
  NumberInput,
  Section,
  Segmented,
  Slider,
  TemplateGallery,
  Toggle,
} from '@/ui';
import { generateBloom } from './generate';
import { drawBloom } from './render';
import {
  clampValue,
  LINE_WIDTH_STEP,
  type NumericKey,
  OVERLAP_MODES,
  RANGE,
  resolveConfig,
  SHAPE_KINDS,
  type ShapeKind,
} from './settings';
import { setSetting, TOOL_ID, useSettings } from './store';
import { S } from './strings';
import { type BloomTemplate, matchTemplate, TEMPLATES, withTemplate } from './templates';

const UNIT: Partial<Record<NumericKey, string>> = {
  rootMin: 'px',
  rootMax: 'px',
  childMin: 'px',
  childMax: 'px',
  lineMin: 'px',
  lineMax: 'px',
  gap: 'px',
  lineWidth: 'px',
  shrink: '%',
  pShape: '%',
  pBranch: '%',
  pDot: '%',
  regularity: '%',
  pAccent: '%',
  pFill: '%',
};

function NumberSlider({ k, hint, disabled }: { k: NumericKey; hint?: string; disabled?: boolean }) {
  const value = useSettings((st) => st.data[k]);
  const [min, max] = RANGE[k];
  return (
    <Field label={S.labels[k]} hint={hint}>
      <Slider
        value={value}
        onChange={(v) => setSetting(k, clampValue(k, v))}
        min={min}
        max={max}
        step={k === 'lineWidth' ? LINE_WIDTH_STEP : 1}
        unit={UNIT[k]}
        disabled={disabled}
      />
    </Field>
  );
}

function CanvasSection() {
  const width = useSettings((st) => st.data.width);
  const height = useSettings((st) => st.data.height);
  return (
    <Section title={S.sections.canvas} persistKey={`${TOOL_ID}:canvas`}>
      <FieldRow columns={2}>
        <Field label={S.labels.width}>
          <NumberInput
            value={width}
            onChange={(v) => setSetting('width', clampValue('width', v))}
            min={RANGE.width[0]}
            max={RANGE.width[1]}
            step={1}
            precision={0}
            unit="px"
          />
        </Field>
        <Field label={S.labels.height}>
          <NumberInput
            value={height}
            onChange={(v) => setSetting('height', clampValue('height', v))}
            min={RANGE.height[0]}
            max={RANGE.height[1]}
            step={1}
            precision={0}
            unit="px"
          />
        </Field>
      </FieldRow>
      <p className="m-0 text-xs text-muted">{S.hints.canvas}</p>
    </Section>
  );
}

function LimitsSection() {
  return (
    <Section title={S.sections.limits} persistKey={`${TOOL_ID}:limits`}>
      <NumberSlider k="maxShapes" hint={S.hints.maxShapes} />
      <NumberSlider k="maxLines" hint={S.hints.maxLines} />
      <NumberSlider k="branchMin" />
      <NumberSlider k="branchMax" hint={S.hints.branch} />
      <NumberSlider k="maxDepth" hint={S.hints.maxDepth} />
      <NumberSlider k="maxRings" hint={S.hints.maxRings} />
    </Section>
  );
}

function SizesSection() {
  return (
    <Section title={S.sections.sizes} persistKey={`${TOOL_ID}:sizes`}>
      <NumberSlider k="rootMin" />
      <NumberSlider k="rootMax" hint={S.hints.root} />
      <NumberSlider k="childMin" />
      <NumberSlider k="childMax" hint={S.hints.child} />
      <NumberSlider k="shrink" hint={S.hints.shrink} />
      <NumberSlider k="lineMin" />
      <NumberSlider k="lineMax" hint={S.hints.line} />
    </Section>
  );
}

function ChancesSection() {
  return (
    <Section title={S.sections.chances} persistKey={`${TOOL_ID}:chances`}>
      <NumberSlider k="pShape" hint={S.hints.pShape} />
      <NumberSlider k="pBranch" hint={S.hints.pBranch} />
      <NumberSlider k="pDot" hint={S.hints.pDot} />
      <NumberSlider k="regularity" hint={S.hints.regularity} />
    </Section>
  );
}

function shapeIconBody(kind: ShapeKind) {
  switch (kind) {
    case 'circle':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </>
      );
    case 'rings':
      return (
        <>
          <circle cx="12" cy="12" r="9.5" />
          <circle cx="12" cy="12" r="6.5" />
          <circle cx="12" cy="12" r="3.5" />
        </>
      );
    case 'semi':
      return <path d="M3 9a9 9 0 0 0 18 0Z" />;
    case 'mix':
      return (
        <>
          <path d="M21.5 12a9.5 9.5 0 0 1-19 0" />
          <circle cx="12" cy="12" r="6" />
          <path d="M14.5 9.5a3.5 3.5 0 1 0 0 5" />
        </>
      );
    case 'square':
      return <rect x="5" y="5" width="14" height="14" transform="rotate(15 12 12)" />;
    case 'doubleSquare':
      return (
        <>
          <rect x="4.5" y="4.5" width="15" height="15" />
          <rect x="8" y="8" width="8" height="8" transform="rotate(45 12 12)" />
        </>
      );
  }
}

/** 種類的小圖示（本站自己畫，24 × 24） */
export function ShapeIcon({ kind }: { kind: ShapeKind }) {
  return (
    <svg
      aria-hidden="true"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      data-shape-icon={kind}
    >
      {shapeIconBody(kind)}
    </svg>
  );
}

function ShapesSection() {
  const shapes = useSettings((st) => st.data.shapes);
  return (
    <Section title={S.sections.shapes} persistKey={`${TOOL_ID}:shapes`}>
      {/* biome-ignore lint/a11y/useSemanticElements: 勾選框的群組，標題在 Section */}
      <div role="group" aria-label={S.sections.shapes} className="grid grid-cols-2 gap-x-3 gap-y-2">
        {SHAPE_KINDS.map((k) => (
          <Checkbox
            key={k}
            checked={shapes[k]}
            onCheckedChange={(on) =>
              useSettings.getState().update((d) => {
                d.shapes[k] = on;
              })
            }
            label={
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted">
                  <ShapeIcon kind={k} />
                </span>
                {S.shapeNames[k]}
              </span>
            }
          />
        ))}
      </div>
      <p className="m-0 text-xs text-muted">{S.hints.shapes}</p>
    </Section>
  );
}

const OVERLAP_OPTIONS = OVERLAP_MODES.map((value) => ({ value, label: S.overlapModes[value] }));

function OverlapSection() {
  const avoid = useSettings((st) => st.data.avoidOverlap);
  const mode = useSettings((st) => st.data.overlapMode);
  const lineAvoid = useSettings((st) => st.data.lineAvoid);
  const inBounds = useSettings((st) => st.data.inBounds);
  return (
    <Section title={S.sections.overlap} persistKey={`${TOOL_ID}:overlap`}>
      <Field label={S.avoidOverlap} hint={S.hints.avoidOverlap} layout="inline">
        <Toggle checked={avoid} onCheckedChange={(on) => setSetting('avoidOverlap', on)} />
      </Field>
      <Field label={S.overlapMode} hint={S.hints.overlapMode}>
        <Segmented
          fullWidth
          value={mode}
          onValueChange={(v) => setSetting('overlapMode', v)}
          options={OVERLAP_OPTIONS}
          disabled={!avoid}
        />
      </Field>
      <NumberSlider k="gap" hint={S.hints.gap} disabled={!avoid} />
      <Field label={S.lineAvoid} hint={S.hints.lineAvoid} layout="inline">
        <Toggle checked={lineAvoid} onCheckedChange={(on) => setSetting('lineAvoid', on)} />
      </Field>
      <Field label={S.inBounds} hint={S.hints.inBounds} layout="inline">
        <Toggle checked={inBounds} onCheckedChange={(on) => setSetting('inBounds', on)} />
      </Field>
    </Section>
  );
}

function StyleSection() {
  const s = useSettings((st) => st.data);
  return (
    <Section title={S.sections.style} persistKey={`${TOOL_ID}:style`}>
      <Field label={S.background}>
        <ColorField
          value={s.background}
          onChange={(v) => setSetting('background', v)}
          disabled={s.transparent}
        />
      </Field>
      <Field label={S.transparent} hint={S.hints.transparent} layout="inline">
        <Toggle checked={s.transparent} onCheckedChange={(on) => setSetting('transparent', on)} />
      </Field>
      <Field label={S.lineColor}>
        <ColorField value={s.lineColor} onChange={(v) => setSetting('lineColor', v)} />
      </Field>
      <Field label={S.accentColor}>
        <ColorField value={s.accentColor} onChange={(v) => setSetting('accentColor', v)} />
      </Field>
      <NumberSlider k="pAccent" hint={S.hints.pAccent} />
      <NumberSlider k="lineWidth" hint={S.hints.lineWidth} />
      <NumberSlider k="pFill" hint={S.hints.pFill} />
      <Field label={S.fromEdge} hint={S.hints.fromEdge} layout="inline">
        <Toggle checked={s.fromEdge} onCheckedChange={(on) => setSetting('fromEdge', on)} />
      </Field>
    </Section>
  );
}

/** 範本的縮圖：用範本的設定與示範種子畫一張小圖（主執行緒；範本的圖形不多） */
function TemplateThumb({ t }: { t: BloomTemplate }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const cfg = resolveConfig({ ...t.settings, seed: t.sampleSeed, lockSeed: false });
    const k = 240 / Math.max(cfg.width, cfg.height);
    canvas.width = Math.round(cfg.width * k);
    canvas.height = Math.round(cfg.height * k);
    drawBloom(ctx, cfg, generateBloom(cfg, t.sampleSeed), k);
  }, [t]);
  return <canvas ref={ref} className="block max-h-full max-w-full" />;
}

function TemplatesSection() {
  const active = useSettings((st) => matchTemplate(st.data));
  return (
    <Section
      title={S.sections.templates}
      description={S.templatesHint}
      persistKey={`${TOOL_ID}:templates`}
    >
      <TemplateGallery
        aria-label={S.templatesLabel}
        templates={TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          thumbnail: <TemplateThumb t={t} />,
          data: t,
        }))}
        activeId={active}
        confirm={S.templateConfirm}
        onApply={(item) => {
          const st = useSettings.getState();
          st.replace(withTemplate(st.data, item.data));
        }}
      />
    </Section>
  );
}

export function SettingsPanels() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TemplatesSection />
      <CanvasSection />
      <LimitsSection />
      <SizesSection />
      <ChancesSection />
      <ShapesSection />
      <OverlapSection />
      <StyleSection />
    </div>
  );
}
