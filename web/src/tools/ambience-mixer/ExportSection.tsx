/**
 * 匯出：格式（MP3／WAV）與 MP3 的位元率、長度、取樣率、聲道、大小估計（超過 CCFOLIA 的音源上限時提醒）、
 * 匯出（進度、取消）、結果（循環試聽、下載）。
 */
import { Download, X } from 'lucide-react';
import { CCFOLIA_AUDIO_MAX_BYTES } from '@/ccfolia';
import {
  AudioPlayer,
  Button,
  Field,
  FieldRow,
  Notice,
  ProgressBar,
  Section,
  Segmented,
  Select,
} from '@/ui';
import { cancelExport, clearExportResult, exportMix } from './actions';
import {
  EXPORT_LENGTHS,
  EXPORT_RATES,
  type ExportRate,
  type ExportSettings,
  exportBytes,
  formatMb,
  lengthLabel,
  MP3_KBPS,
  type Mp3Kbps,
  mp3Kbps,
  PREVIEW_RATE,
  PREVIEW_SECONDS,
  TOOL_ID,
} from './model';
import { useMix, useRuntime } from './store';
import { S } from './strings';

const rateText = (r: number) => `${(r / 1000).toFixed(r % 1000 ? 2 : 0).replace(/0$/, '')} kHz`;

function setExport(fn: (e: ExportSettings) => void) {
  useMix.getState().update((d) => {
    fn(d.export);
  });
  clearExportResult();
}

function ResultCard() {
  const r = useRuntime((s) => s.result);
  if (!r) return null;
  const peak = Number.isFinite(r.peakDb) ? `${r.peakDb.toFixed(1)} dB` : '—';
  const label = S.exportPanel.formats[r.format];
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3"
      data-testid="export-result"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 break-all font-medium text-fg" data-testid="export-name">
          {r.name}
        </span>
        <span className="text-sm text-muted" data-testid="export-bytes">
          {formatMb(r.bytes)}
        </span>
      </div>
      <p className="m-0 text-xs text-muted" data-testid="export-details">
        {S.exportPanel.details({
          length: lengthLabel(r.seconds),
          rate: rateText(r.sampleRate),
          channels: r.channels === 1 ? S.exportPanel.mono : S.exportPanel.stereo,
          kbps: r.format === 'mp3' ? S.exportPanel.kbpsValue(r.kbps) : '',
          peak,
          ms: `${(r.ms / 1000).toFixed(1)} 秒`,
        })}
      </p>
      {r.skipped.length ? <Notice tone="warning">{S.exportPanel.skipped(r.skipped)}</Notice> : null}
      <AudioPlayer
        blob={r.blob}
        fileName={r.name}
        loop
        aria-label={S.exportPanel.listen}
        downloadLabel={S.exportPanel.download(label)}
      />
    </div>
  );
}

export function ExportSection() {
  const e = useMix((s) => s.data.export);
  const hasTracks = useMix((s) => s.data.tracks.some((t) => t.volume > 0));
  const hasSynth = useMix((s) => s.data.tracks.some((t) => t.kind === 'synth'));
  const rt = useRuntime();
  const bytes = exportBytes(e);
  const tooBig = bytes > CCFOLIA_AUDIO_MAX_BYTES;
  const same = e.seconds === PREVIEW_SECONDS && e.sampleRate === PREVIEW_RATE;
  const mp3 = e.format === 'mp3';
  const label = S.exportPanel.formats[e.format];
  return (
    <Section
      title={S.exportPanel.title}
      description={S.exportPanel.description}
      persistKey={`${TOOL_ID}:export`}
    >
      <div className="flex flex-col gap-3">
        <FieldRow columns={2}>
          <Field label={S.exportPanel.format}>
            <Segmented
              value={e.format}
              onValueChange={(v) =>
                setExport((x) => {
                  x.format = v;
                })
              }
              fullWidth
              options={[
                { value: 'mp3', label: S.exportPanel.formats.mp3 },
                { value: 'wav', label: S.exportPanel.formats.wav },
              ]}
            />
          </Field>
          <Field label={S.exportPanel.kbps} hidden={!mp3}>
            <Select
              value={String(e.kbps)}
              onValueChange={(v) =>
                setExport((x) => {
                  x.kbps = Number(v) as Mp3Kbps;
                })
              }
              options={MP3_KBPS.map((k) => ({
                value: String(k),
                label: S.exportPanel.kbpsLabel(mp3Kbps(k, e.sampleRate), k !== 128),
              }))}
            />
          </Field>
        </FieldRow>
        <p className="m-0 text-xs text-muted" data-testid="export-format-hint">
          {mp3 ? S.exportPanel.mp3Hint : S.exportPanel.wavHint}
        </p>
        <FieldRow columns={2}>
          <Field label={S.exportPanel.length}>
            <Select
              value={String(e.seconds)}
              onValueChange={(v) =>
                setExport((x) => {
                  x.seconds = Number(v);
                })
              }
              options={EXPORT_LENGTHS.map((s) => ({ value: String(s), label: lengthLabel(s) }))}
            />
          </Field>
          <Field label={S.exportPanel.rate}>
            <Select
              value={String(e.sampleRate)}
              onValueChange={(v) =>
                setExport((x) => {
                  x.sampleRate = Number(v) as ExportRate;
                })
              }
              options={EXPORT_RATES.map((r) => ({
                value: String(r),
                label: S.exportPanel.rateLabels[r],
              }))}
            />
          </Field>
        </FieldRow>
        <Field label={S.exportPanel.channels}>
          <Segmented
            value={String(e.channels)}
            onValueChange={(v) =>
              setExport((x) => {
                x.channels = v === '1' ? 1 : 2;
              })
            }
            options={[
              { value: '2', label: S.exportPanel.stereo },
              { value: '1', label: S.exportPanel.mono },
            ]}
          />
        </Field>
        <p className="m-0 text-sm text-muted" data-testid="export-size">
          {S.exportPanel.size(formatMb(bytes))}
          {hasSynth
            ? `・${same ? (mp3 ? S.exportPanel.sameAsPreviewMp3 : S.exportPanel.sameAsPreview) : S.exportPanel.differs}`
            : ''}
        </p>
        {tooBig ? (
          <Notice tone="warning">{S.exportPanel.tooBig(formatMb(CCFOLIA_AUDIO_MAX_BYTES))}</Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon={<Download />}
            loading={rt.exporting}
            disabled={!hasTracks || rt.exporting}
            onClick={() => void exportMix()}
            data-testid="export-run"
          >
            {S.exportPanel.button(label)}
          </Button>
          {rt.exporting ? (
            <Button icon={<X />} onClick={cancelExport}>
              {S.exportPanel.cancel}
            </Button>
          ) : null}
        </div>
        {rt.exporting ? (
          <div className="flex flex-col gap-1">
            <ProgressBar value={rt.progress} label={S.exportPanel.progress} />
            <span className="text-xs text-muted" role="status">
              {rt.stage}
            </span>
          </div>
        ) : null}
        {rt.exportError ? <Notice tone="danger">{rt.exportError}</Notice> : null}
        <ResultCard />
      </div>
    </Section>
  );
}
