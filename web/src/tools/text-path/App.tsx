/**
 * 文字軌跡產生器：把文字沿著圓、螺旋、愛心或手繪的線排成文字圖案，輸出純文字。
 * 規格：docs/refactor/specs/text-path.md（繪製區固定以 634 × 300 計算，見第 7 節裁定）。
 */
import { ArrowLeftRight, Scaling, Trash2, WandSparkles } from 'lucide-react';
import { useId } from 'react';
import {
  Button,
  Field,
  PathPad,
  Section,
  Segmented,
  Slider,
  TextArea,
  TextOutputPanel,
  Toggle,
  ToolShell,
  UsageSection,
  useToast,
} from '@/ui';
import {
  COLS,
  charCount,
  FILL_KINDS,
  type FillKind,
  PAD_HEIGHT,
  PAD_WIDTH,
  resultCount,
  SHAPES,
  type Shape,
  SPACING,
  spacingLevel,
} from './logic';
import { type MessageKey, useTextPath } from './store';
import { S } from './strings';

/** 短暫訊息約 3 秒後淡出（規格 F29） */
const MESSAGE_MS = 3000;

/* 開發模式的測試入口（規格 3.7）：直接設定軌跡、讀狀態，例如
   `__textPath.getState().drawEnd([{ x: 40, y: 60 }, …])`。建置產物裡沒有這段。 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __textPath?: typeof useTextPath }).__textPath = useTextPath;
}

function useMessage() {
  const toast = useToast();
  return (key: MessageKey | null) => {
    if (!key) return;
    toast({
      title: S.messages[key],
      tone: key === 'fitted' ? 'success' : 'warning',
      duration: MESSAGE_MS,
    });
  };
}

function Usage() {
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

function TextSection() {
  const text = useTextPath((s) => s.text);
  const setText = useTextPath((s) => s.setText);
  return (
    <Section title={S.sectionText} fixed>
      <Field
        label={S.text}
        hint={S.textHint}
        labelSuffix={<span data-testid="char-count">{S.charCount(charCount(text))}</span>}
      >
        <TextArea
          value={text}
          rows={4}
          placeholder={S.textPlaceholder}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
    </Section>
  );
}

function LayoutSection() {
  const say = useMessage();
  const cols = useTextPath((s) => s.cols);
  const spacing = useTextPath((s) => s.spacing);
  const fill = useTextPath((s) => s.fill);
  const lineHead = useTextPath((s) => s.lineHead);
  const setCols = useTextPath((s) => s.setCols);
  const setSpacing = useTextPath((s) => s.setSpacing);
  const setFill = useTextPath((s) => s.setFill);
  const setLineHead = useTextPath((s) => s.setLineHead);
  const spacingText = S.spacingValue(S.spacingLevels[spacingLevel(spacing)], spacing);
  return (
    <Section title={S.sectionLayout} fixed>
      <Field
        label={S.cols}
        hint={S.colsHint}
        labelSuffix={<span data-testid="cols-value">{S.colsValue(cols)}</span>}
      >
        <Slider value={cols} onChange={setCols} min={COLS.min} max={COLS.max} step={COLS.step} />
      </Field>
      <Field
        label={S.spacing}
        hint={S.spacingHint}
        labelSuffix={<span data-testid="spacing-value">{spacingText}</span>}
      >
        <Slider
          value={spacing}
          onChange={setSpacing}
          min={SPACING.min}
          max={SPACING.max}
          step={SPACING.step}
          showInput={false}
          valueText={() => spacingText}
        />
      </Field>
      <Field label={S.fill} hint={S.fillHint}>
        <Segmented<FillKind>
          value={fill}
          onValueChange={(v) => say(setFill(v))}
          fullWidth
          options={FILL_KINDS.map((k) => ({ value: k, label: S.fillLabels[k] }))}
        />
      </Field>
      <Field label={S.lineHead} hint={S.lineHeadHint} layout="inline">
        <Toggle checked={lineHead} onCheckedChange={(v) => say(setLineHead(v))} />
      </Field>
    </Section>
  );
}

function DrawPanel() {
  const titleId = useId();
  const say = useMessage();
  const shape = useTextPath((s) => s.shape);
  const path = useTextPath((s) => s.path);
  const labels = useTextPath((s) => s.labels);
  const labelSize = useTextPath((s) => s.labelSize);
  const a = useTextPath.getState();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="m-0 text-sm font-semibold text-fg">
          {S.pad}
        </h2>
        <Segmented<Shape>
          aria-label={S.shape}
          value={shape}
          onValueChange={a.selectShape}
          onReselect={a.selectShape}
          size="sm"
          options={SHAPES.map((v) => ({ value: v, label: S.shapeLabels[v] }))}
        />
      </div>
      {/* 寬螢幕上以原尺寸（634 × 300）顯示，較窄時等比縮小（座標一律以 634 × 300 計算） */}
      <div className="mx-auto w-full" style={{ maxWidth: PAD_WIDTH }}>
        <PathPad
          aria-label={S.pad}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          points={path}
          minDistance={2}
          onDrawStart={a.drawStart}
          onChange={a.drawEnd}
          hint={shape === 'free' ? S.padHint : undefined}
          labels={labels}
          labelSize={labelSize}
        />
      </div>
      <p className="m-0 text-xs text-muted">{S.padNote}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<WandSparkles />} onClick={() => say(a.generate())}>
          {S.generate}
        </Button>
        <Button icon={<Scaling />} title={S.fitTip} onClick={() => say(a.fit())}>
          {S.fit}
        </Button>
        <Button icon={<ArrowLeftRight />} title={S.reverseTip} onClick={() => say(a.reverse())}>
          {S.reverse}
        </Button>
        <Button variant="ghost" icon={<Trash2 />} title={S.clearTip} onClick={a.clear}>
          {S.clear}
        </Button>
      </div>
    </section>
  );
}

function ResultPanel() {
  const result = useTextPath((s) => s.result);
  return (
    <TextOutputPanel
      text={result}
      title={S.output}
      count={(t) => (t ? S.outputCount(resultCount(t)) : null)}
      hint={S.outputHint}
      placeholder={S.outputPlaceholder}
      copyLabel={S.copy}
      font="mono"
      wrap="off"
      messageDuration={MESSAGE_MS}
      messages={{
        copied: S.messages.copied,
        failed: S.messages.copyFailed,
        failedHint: S.messages.copyFailedHint,
        empty: S.messages.copyEmpty,
      }}
    />
  );
}

export function App() {
  const usage = <Usage />;
  return (
    <ToolShell
      toolId="text-path"
      usage={usage}
      settings={
        <>
          <TextSection />
          <LayoutSection />
          <UsageSection>{usage}</UsageSection>
        </>
      }
      preview={
        <>
          <DrawPanel />
          <ResultPanel />
        </>
      }
    />
  );
}
