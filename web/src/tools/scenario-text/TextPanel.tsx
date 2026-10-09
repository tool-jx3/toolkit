/**
 * 「文字」分頁：做法、文字欄（填入範例）、未登錄的說話者與差分、讀取方式（規格 1.2、1.3）。
 */
import { Sparkles, UserPlus } from 'lucide-react';
import type { Ref } from 'react';
import {
  Button,
  Field,
  Section,
  Segmented,
  Select,
  Show,
  TextArea,
  TextInput,
  Toggle,
  useConfirm,
} from '@/ui';
import { addFace, addSpeaker, fillSample, setOpts, setScript } from './actions';
import { entriesOf, lookupOf } from './derived';
import type { Mode, Narration, Style, Unit } from './model';
import { type ParsedEntry, unknownNames } from './parse';
import { missingFaces, withFace } from './resolve';
import { useDoc } from './store';
import { S } from './strings';

const MODES: Mode[] = ['script', 'heading'];
const UNITS: Unit[] = ['line', 'block'];
const STYLES: Style[] = ['auto', 'quote', 'colon'];
const NARRATIONS: Narration[] = ['include', 'skip'];

export function TextPanel({ textRef }: { textRef?: Ref<HTMLTextAreaElement> }) {
  const doc = useDoc((s) => s.data);
  const confirm = useConfirm();
  const { opts } = doc;
  const list = entriesOf(doc);
  const L = lookupOf(doc);
  const names = doc.edited ? [] : unknownNames(list as readonly ParsedEntry[]);
  const faces = missingFaces(list, L);

  const fill = async () => {
    if (
      doc.script.trim() &&
      !(await confirm({ title: S.replaceSampleTitle, confirmLabel: S.replaceSampleConfirm }))
    ) {
      return;
    }
    fillSample();
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.modeTitle} fixed>
        <Segmented
          aria-label={S.modeTitle}
          fullWidth
          value={opts.mode}
          onValueChange={(mode) => setOpts({ mode })}
          options={MODES.map((m) => ({ value: m, label: S.modes[m].label }))}
        />
        <p className="m-0 text-xs text-muted" data-testid="mode-hint">
          {S.modes[opts.mode].hint}
        </p>
      </Section>

      <Section
        title={<span id="scenario-text-title">{S.textTitle[opts.mode]}</span>}
        fixed
        actions={
          <Button size="sm" icon={<Sparkles />} onClick={() => void fill()}>
            {S.fillSample}
          </Button>
        }
      >
        <TextArea
          ref={textRef}
          aria-labelledby="scenario-text-title"
          data-testid="script"
          rows={12}
          spellCheck={false}
          autoComplete="off"
          value={doc.script}
          placeholder={S.textPlaceholder[opts.mode]}
          onChange={(e) => setScript(e.target.value)}
          className="min-h-48"
        />
        {names.length ? (
          <div
            className="flex flex-col gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning"
            data-testid="unknown-speakers"
          >
            <p className="m-0">{S.unknownSpeakers}</p>
            <div className="flex flex-wrap gap-1.5">
              {names.map((name) => (
                <Button key={name} size="sm" icon={<UserPlus />} onClick={() => addSpeaker(name)}>
                  {S.addSpeakerFor(name)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {faces.length ? (
          <div
            className="flex flex-col gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning"
            data-testid="unknown-faces"
          >
            <p className="m-0">{S.unknownFaces}</p>
            <div className="flex flex-wrap gap-1.5">
              {faces.map(({ speaker, face }) => (
                <Button
                  key={`${speaker.id}:${face}`}
                  size="sm"
                  icon={<UserPlus />}
                  onClick={() => addFace(speaker.id, face)}
                >
                  {S.addFaceFor(withFace(speaker.name, face))}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <p className="m-0 text-xs text-muted">{S.quoteHelp}</p>
      </Section>

      <Section title={S.readTitle} persistKey="scenario-text:read">
        <Show when={opts.mode === 'script'}>
          <Field label={S.unitLabel}>
            <Select
              value={opts.unit}
              onValueChange={(unit) => setOpts({ unit })}
              options={UNITS.map((u) => ({ value: u, label: S.units[u] }))}
            />
          </Field>
          <Field label={S.styleLabel}>
            <Select
              value={opts.style}
              onValueChange={(style) => setOpts({ style })}
              options={STYLES.map((s) => ({ value: s, label: S.styles[s] }))}
            />
          </Field>
          <Field label={S.keepQuotes} layout="inline">
            <Toggle
              checked={opts.keepQuotes}
              onCheckedChange={(keepQuotes) => setOpts({ keepQuotes })}
            />
          </Field>
          <Field label={S.narrationLabel}>
            <Segmented
              fullWidth
              value={opts.narration}
              onValueChange={(narration) => setOpts({ narration })}
              options={NARRATIONS.map((n) => ({ value: n, label: S.narrations[n] }))}
            />
          </Field>
        </Show>
        <Field
          label={S.narratorLabel[opts.mode]}
          hidden={opts.mode === 'script' && opts.narration === 'skip'}
        >
          <TextInput
            value={opts.narratorName}
            placeholder={S.narratorPlaceholder}
            onChange={(e) => setOpts({ narratorName: e.target.value })}
          />
        </Field>
        {opts.mode === 'heading' ? <p className="m-0 text-xs text-muted">{S.headingHelp}</p> : null}
        <p className="m-0 text-xs text-muted">{S.nameHelp}</p>
      </Section>
    </div>
  );
}
