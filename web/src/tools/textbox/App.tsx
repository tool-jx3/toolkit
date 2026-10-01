import { useMemo } from 'react';
import { createToolStore } from '@/core/storage';
import {
  Field,
  FieldRow,
  NativeNumberInput,
  Section,
  Segmented,
  TextArea,
  TextInput,
  Toggle,
  ToolShell,
  UsageSection,
} from '@/ui';
import {
  BOX_WIDTH_RANGE,
  type Calibration,
  CUSTOM_RATIO_MAX,
  DEFAULT_INPUT,
  type LineStyle,
  type Mode,
  type PadStyle,
  renderTextbox,
  TABLE_WIDTH_RANGE,
  type TextboxInput,
  type WarningField,
} from './layout';
import { OutputPanel } from './OutputPanel';
import { S } from './strings';

/** 規格 F28：不保留任何輸入或設定，重新整理後回到預設 */
const useTextbox = createToolStore<TextboxInput>('textbox', DEFAULT_INPUT, { persist: false });

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

export function App() {
  const d = useTextbox((s) => s.data);
  const patch = useTextbox((s) => s.patch);
  const result = useMemo(() => renderTextbox(d), [d]);
  const warn = (field: WarningField) =>
    result.warnings.find((w) => w.field === field)?.message ?? undefined;
  const set =
    <K extends keyof TextboxInput>(key: K) =>
    (value: TextboxInput[K]) =>
      patch({ [key]: value } as Partial<TextboxInput>);

  const isBox = d.mode === 'box';
  const usage = <Usage />;

  const settings = (
    <>
      <Section title={S.sectionContent} fixed>
        <Field label={S.mode}>
          <Segmented<Mode>
            value={d.mode}
            onValueChange={set('mode')}
            fullWidth
            options={[
              { value: 'box', label: S.modeBox },
              { value: 'table', label: S.modeTable },
            ]}
          />
        </Field>
        {isBox ? (
          <>
            <Field label={S.title} hint={S.titleHint}>
              <TextInput
                value={d.title}
                placeholder={S.titlePlaceholder}
                onChange={(e) => set('title')(e.target.value)}
              />
            </Field>
            <Field label={S.body} hint={S.bodyHint}>
              <TextArea
                value={d.body}
                rows={7}
                placeholder={S.bodyPlaceholder}
                onChange={(e) => set('body')(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field label={S.table} hint={S.tableHint} error={warn('table')}>
            <TextArea
              value={d.table}
              rows={8}
              placeholder={S.tablePlaceholder}
              onChange={(e) => set('table')(e.target.value)}
            />
          </Field>
        )}
      </Section>

      <Section title={S.sectionLayout}>
        <Field label={S.calibration} hint={S.calibrationHint}>
          <Segmented<Calibration>
            value={d.calibration}
            onValueChange={set('calibration')}
            fullWidth
            options={[
              { value: 'ccfolia', label: S.calibrationCcfolia },
              { value: 'mono', label: S.calibrationMono },
              { value: 'custom', label: S.calibrationCustom },
            ]}
          />
        </Field>
        {/* 數值欄一直掛著、只是隱藏：原生數字欄裡打到一半的無效文字（例如「5-」）切回來時還在 */}
        <div
          className="flex flex-col gap-1.5"
          data-testid="custom-ratio"
          hidden={d.calibration !== 'custom'}
        >
          <FieldRow columns={2}>
            <Field label={S.customWide} error={warn('customWide')}>
              <NativeNumberInput
                value={d.customWide}
                onChange={set('customWide')}
                min={0.01}
                max={CUSTOM_RATIO_MAX}
                step={0.01}
                stepLabels={{ up: S.stepUp(S.customWide), down: S.stepDown(S.customWide) }}
              />
            </Field>
            <Field label={S.customBorder} error={warn('customBorder')}>
              <NativeNumberInput
                value={d.customBorder}
                onChange={set('customBorder')}
                min={0.01}
                max={CUSTOM_RATIO_MAX}
                step={0.01}
                stepLabels={{ up: S.stepUp(S.customBorder), down: S.stepDown(S.customBorder) }}
              />
            </Field>
          </FieldRow>
          <p className="m-0 text-xs text-muted">{S.customHint}</p>
        </div>
        <Field label={S.line}>
          <Segmented<LineStyle>
            value={d.line}
            onValueChange={set('line')}
            fullWidth
            options={[
              { value: 'single', label: S.lineSingle },
              { value: 'double', label: S.lineDouble },
            ]}
          />
        </Field>
        <Field label={S.pad} hint={S.padHint}>
          <Segmented<PadStyle>
            value={d.pad}
            onValueChange={set('pad')}
            fullWidth
            options={[
              { value: 'fullwidth', label: S.padFull },
              { value: 'halfwidth', label: S.padHalf },
            ]}
          />
        </Field>
        <Field label={S.sides} hint={S.sidesHint} layout="inline">
          <Toggle checked={d.sides} onCheckedChange={set('sides')} />
        </Field>
        <div hidden={!isBox}>
          <Field label={S.boxWidth} hint={S.boxWidthHint} error={warn('boxWidth')}>
            <NativeNumberInput
              value={d.boxWidth}
              onChange={set('boxWidth')}
              min={BOX_WIDTH_RANGE.min}
              max={BOX_WIDTH_RANGE.max}
              step={1}
              unit={S.unitChars}
              stepLabels={{ up: S.stepUp(S.boxWidth), down: S.stepDown(S.boxWidth) }}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-3" hidden={isBox}>
          <Field label={S.tableWidth} hint={S.tableWidthHint}>
            <NativeNumberInput
              value={d.tableWidth}
              onChange={set('tableWidth')}
              min={TABLE_WIDTH_RANGE.min}
              max={TABLE_WIDTH_RANGE.max}
              step={1}
              unit={S.unitChars}
              stepLabels={{ up: S.stepUp(S.tableWidth), down: S.stepDown(S.tableWidth) }}
            />
          </Field>
          <Field label={S.header} hint={S.headerHint} layout="inline">
            <Toggle checked={d.header} onCheckedChange={set('header')} />
          </Field>
        </div>
      </Section>

      <UsageSection>{usage}</UsageSection>
    </>
  );

  return (
    <ToolShell
      toolId="textbox"
      usage={usage}
      settings={settings}
      preview={<OutputPanel text={result.text} />}
    />
  );
}
