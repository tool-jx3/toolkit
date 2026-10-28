/**
 * 設定欄：壓縮等級（F07、F08）、進階設定（F09～F13）；頁首「說明」的內容（F32）。
 */
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_ADVANCED,
  DPI_RANGE,
  LEVELS,
  PDF_LEVELS,
  type PdfLevel,
  QUALITY_RANGE,
} from '@/core/pdf';
import { Button, Field, Notice, OptionalNumberInput, Section, Segmented, Toggle } from '@/ui';
import { viewer } from './actions';
import { useSettings } from './store';
import { S } from './strings';

const update = useSettings.getState().update;

export function LevelSection() {
  const level = useSettings((st) => st.data.level);
  return (
    <Section title={S.sectionLevel} fixed>
      <Field label={S.level} hint={S.levelHints[level]}>
        <Segmented<PdfLevel>
          value={level}
          onValueChange={(v) =>
            update((d) => {
              d.level = v;
            })
          }
          fullWidth
          size="sm"
          options={PDF_LEVELS.map((v) => ({ value: v, label: S.levels[v] }))}
          data-testid="level"
        />
      </Field>
      {level === 'raster' ? (
        <Notice tone="warning" className="mt-2">
          <span data-testid="raster-warning">{S.rasterWarning}</span>
        </Notice>
      ) : null}
    </Section>
  );
}

export function AdvancedSection() {
  const level = useSettings((st) => st.data.level);
  const adv = useSettings((st) => st.data.advanced);
  const spec = LEVELS[level];
  const base = spec.images[0] ?? null;
  const raster = spec.raster;
  const levelQuality = base?.quality ?? raster?.quality ?? null;
  const levelDpi = base?.dpi || raster?.dpi || null;
  const imageless = levelQuality === null;
  const dirty =
    adv.quality !== DEFAULT_ADVANCED.quality ||
    adv.dpi !== DEFAULT_ADVANCED.dpi ||
    adv.convertFlate !== DEFAULT_ADVANCED.convertFlate ||
    adv.verify !== DEFAULT_ADVANCED.verify;
  return (
    <Section title={S.sectionAdvanced} persistKey="pdf-compress:advanced" defaultOpen={false}>
      <Field label={S.quality} hint={S.qualityHint(levelQuality)}>
        <OptionalNumberInput
          value={adv.quality}
          onChange={(v) =>
            update((d) => {
              d.advanced.quality = v;
            })
          }
          min={QUALITY_RANGE.min}
          max={QUALITY_RANGE.max}
          placeholder={levelQuality === null ? '' : S.placeholderLevel(levelQuality)}
          disabled={imageless}
          data-testid="quality"
        />
      </Field>
      <Field label={S.dpi} hint={S.dpiHint(levelDpi, !!raster)}>
        <OptionalNumberInput
          value={adv.dpi}
          onChange={(v) =>
            update((d) => {
              d.advanced.dpi = v;
            })
          }
          min={DPI_RANGE.min}
          max={DPI_RANGE.max}
          unit="DPI"
          placeholder={levelDpi === null ? '' : S.placeholderLevel(levelDpi)}
          disabled={imageless}
          data-testid="dpi"
        />
      </Field>
      <Field
        label={S.convertFlate}
        layout="inline"
        hint={spec.lossy && !raster ? S.convertFlateHint : S.convertFlateOff}
      >
        <Toggle
          checked={adv.convertFlate}
          disabled={!spec.lossy || !!raster}
          onCheckedChange={(v) =>
            update((d) => {
              d.advanced.convertFlate = v;
            })
          }
        />
      </Field>
      <Field label={S.verify} layout="inline" hint={S.verifyHint}>
        <Toggle
          checked={adv.verify}
          onCheckedChange={(v) =>
            update((d) => {
              d.advanced.verify = v;
            })
          }
        />
      </Field>
      <Button
        size="sm"
        variant="ghost"
        icon={<RotateCcw />}
        disabled={!dirty}
        onClick={() =>
          update((d) => {
            d.advanced = { ...DEFAULT_ADVANCED };
          })
        }
      >
        {S.resetAdvanced}
      </Button>
    </Section>
  );
}

export function SettingsPanel() {
  return (
    <>
      <LevelSection />
      <AdvancedSection />
    </>
  );
}

/** 頁首「說明」 */
export function Usage() {
  const [libs, setLibs] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let alive = true;
    viewer()
      .info()
      .then((r) => {
        if (alive) setLibs([...r.libraries, `pdf.js ${r.pdfjs}（Apache-2.0）`]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageLevelsTitle}</p>
      <ul>
        {S.usageLevels.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {libs ? (
        <p className="mt-2 text-xs text-muted">
          {S.usageLibraries}
          {libs.join('、')}
        </p>
      ) : null}
    </>
  );
}
