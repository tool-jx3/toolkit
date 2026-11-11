/**
 * 「推理」分頁（第五批；參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的「ミステリー支援・自動解析」，規格 1.22、F131～F135）：
 * 不在場證明空白、同席調書、時間切片、聚光、遊戲中的段階公開。
 * 分析都照目前的檢視（GM／PL、人物別）看得到的資料；PL 檢視的頁面上不會出現真相、完全保密的東西（段階公開只在 GM 檢視列出）。
 */
import { Copy, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { copyText } from '@/core/files';
import { Button, cn, Field, Section, Select, Toggle } from '@/ui';
import { reportLabels, reportTitle, sliceLabels, sliceValue } from '../export/render';
import { GAP_MIN, gapsSupported, tvAt } from '../model/alibi';
import { alibiReport, type ReportLine, reportText, sliceReport } from '../model/alibiReport';
import { spotOptions, validSpot } from '../model/spotlight';
import { lockables } from '../model/stage';
import { formatLong } from '../model/time';
import { notify } from '../notify';
import {
  type AnalysisPrefs,
  resetUnlocks,
  setAnalysis,
  setSpot,
  setUnlock,
  spotOf,
  undo,
  useDoc,
  usePrefs,
} from '../store';
import { S } from '../strings';
import { centerTime, useVisibleDoc } from '../view/shared';
import { TimeField } from './TimeField';

const toneClass = (tone?: ReportLine['tone']) =>
  tone === 'muted'
    ? 'text-muted'
    : tone === 'alert'
      ? 'text-danger'
      : tone === 'truth'
        ? 'text-warning'
        : 'text-fg';

function Lines({ lines, testId }: { lines: readonly ReportLine[]; testId: string }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs" data-testid={testId}>
      {lines.map((ln, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 同一份清單的行，順序固定
        <li key={i} className={cn('break-words', toneClass(ln.tone))} data-tone={ln.tone}>
          {ln.text}
        </li>
      ))}
    </ul>
  );
}

const NO_ANALYSIS: AnalysisPrefs = {};

async function copy(text: string, done: string) {
  if (await copyText(text)) notify({ title: done, tone: 'success' });
}

export function AnalysisTab() {
  const vdoc = useVisibleDoc();
  const doc = useDoc((s) => s.data);
  const a = usePrefs((s) => s.data.analysis) ?? NO_ANALYSIS;
  const viewMode = usePrefs((s) => s.data.viewMode);
  const spotRaw = usePrefs((s) => spotOf(s.data));
  const pl = viewMode === 'pl';
  const povName = vdoc.pov
    ? vdoc.lanes.find((l) => l.id === vdoc.pov)?.name.trim() || S.untitled
    : '';
  const report = useMemo(() => alibiReport(vdoc, reportLabels()), [vdoc]);
  const gapsBlock = report.find((b) => b.key === 'gaps');
  const contactBlocks = report.filter((b) => b.key !== 'gaps');
  const supported = gapsSupported(vdoc.mode);
  const sliceOn = !!a.slice?.on;
  const sliceV = sliceOn ? sliceValue(doc, a.slice?.time) : null;
  const slice = useMemo(
    () => (sliceV === null ? null : sliceReport(vdoc, sliceV, sliceLabels())),
    [vdoc, sliceV],
  );
  const options = useMemo(
    () =>
      spotOptions(vdoc, {
        none: S.anSpotNone,
        truth: S.anSpotTruth,
        lane: S.anSpotLane,
        place: S.anSpotPlace,
        untitled: S.untitled,
      }),
    [vdoc],
  );
  const spot = validSpot(vdoc, spotRaw);

  return (
    <div className="flex flex-col gap-3" data-testid="analysis-tab">
      <p className="m-0 text-xs text-muted" data-testid="analysis-intro">
        {povName ? S.anIntroPov(povName) : S.anIntro}
      </p>

      <Section title={S.anGapsTitle} persistKey="scenario-timeline:an-gaps">
        <Field
          label={S.anGapsShow}
          layout="inline"
          hint={supported ? S.anGapsHint(GAP_MIN) : S.anGapsYear}
        >
          <Toggle
            checked={!!a.gaps && supported}
            disabled={!supported}
            onCheckedChange={(v) => setAnalysis({ gaps: v })}
          />
        </Field>
        {gapsBlock && supported ? <Lines lines={gapsBlock.lines} testId="an-gaps" /> : null}
      </Section>

      <Section
        title={S.anContactsTitle}
        persistKey="scenario-timeline:an-contacts"
        description={S.anContactsHint}
      >
        {contactBlocks.map((b) => (
          <div key={b.key} className="flex flex-col gap-1">
            <h4 className="m-0 text-xs font-semibold text-fg">{b.heading}</h4>
            <Lines lines={b.lines} testId={`an-contacts-${b.key}`} />
          </div>
        ))}
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={<Copy />}
            data-testid="an-copy"
            onClick={() => void copy(reportText(reportTitle(vdoc), report), S.anCopied)}
          >
            {S.anCopy}
          </Button>
        </div>
      </Section>

      <Section title={S.anSliceTitleSection} persistKey="scenario-timeline:an-slice">
        <Field label={S.anSliceOn} layout="inline" hint={S.anSliceHint}>
          <Toggle
            checked={sliceOn}
            onCheckedChange={(v) =>
              setAnalysis({
                slice: { on: v, time: a.slice?.time || (v ? centerTime() : '') },
              })
            }
          />
        </Field>
        {sliceOn ? (
          <TimeField
            label={S.anSliceTime}
            value={a.slice?.time ?? ''}
            mode={doc.mode}
            era={doc}
            data-field="slice-time"
            onCommit={(t) => setAnalysis({ slice: { on: true, time: t } })}
          />
        ) : null}
        {slice && sliceV !== null ? (
          <div className="flex flex-col gap-2" data-testid="an-slice">
            <h4 className="m-0 text-xs font-semibold text-fg">
              {S.anSliceTitle(formatLong(vdoc.mode, tvAt(vdoc, sliceV), vdoc))}
            </h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {slice.blocks.map((b) => (
                <div
                  key={b.heading}
                  data-slice-room={b.heading}
                  data-together={b.together || undefined}
                  className={cn(
                    'min-w-0 rounded-md border p-2',
                    b.together ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                  )}
                >
                  <p className="m-0 mb-1 text-xs font-semibold text-fg">{b.heading}</p>
                  <Lines lines={b.lines} testId="an-slice-room" />
                </div>
              ))}
            </div>
            {slice.footer.length ? <Lines lines={slice.footer} testId="an-slice-footer" /> : null}
            <div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Copy />}
                data-testid="an-slice-copy"
                onClick={() =>
                  void copy(
                    reportText(
                      S.anSliceTitle(formatLong(vdoc.mode, tvAt(vdoc, sliceV), vdoc)),
                      slice.blocks,
                      slice.footer,
                    ),
                    S.anSliceCopied,
                  )
                }
              >
                {S.anSliceCopy}
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section title={S.anSpotTitle} persistKey="scenario-timeline:an-spot">
        <Field label={S.anSpot} hint={S.anSpotHint}>
          <Select
            value={spot || '__none'}
            data-field="spot"
            onValueChange={(v) => setSpot(v === '__none' ? '' : v)}
            options={options.map((o) => ({ value: o.value || '__none', label: o.label }))}
          />
        </Field>
      </Section>

      <Section
        title={S.anStageTitle}
        persistKey="scenario-timeline:an-stage"
        description={S.anStageHint}
      >
        {pl ? (
          <p className="m-0 text-xs text-muted" data-testid="an-stage-gm-only">
            {S.anStageGmOnly}
          </p>
        ) : (
          <StageList />
        )}
      </Section>
    </div>
  );
}

/** 段階公開的清單（GM 檢視才有） */
function StageList() {
  const doc = useDoc((s) => s.data);
  const items = useMemo(() => lockables(doc, S.untitled), [doc]);
  if (!items.length)
    return (
      <p className="m-0 text-xs text-muted" data-testid="an-stage-none">
        {S.anStageNone}
      </p>
    );
  const open = items.filter((x) => x.unlocked && !x.revealed).length;
  const total = items.filter((x) => !x.revealed).length;
  const shown = items.slice(0, 300);
  return (
    <div className="flex flex-col gap-2" data-testid="an-stage">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted" data-testid="an-stage-count">
          {S.anStageCount(open, total)}
        </span>
        <Button
          size="sm"
          variant="secondary"
          icon={<RotateCcw />}
          className="ml-auto"
          disabled={!items.some((x) => x.unlocked)}
          data-testid="an-stage-reset"
          onClick={() => {
            const n = resetUnlocks();
            if (n)
              notify({
                title: S.anStageResetDone(n),
                tone: 'success',
                action: { label: S.undoAction, onClick: () => undo() },
              });
          }}
        >
          {S.anStageReset}
        </Button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {shown.map((x) => {
          const on = x.unlocked || x.revealed;
          return (
            <li
              key={`${x.kind}:${x.id}`}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1"
              data-stage-item={x.id}
              data-stage-open={on || undefined}
            >
              <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 text-[11px] leading-5 text-muted">
                {S.anStageFace[x.face]}
              </span>
              <span
                className={cn('min-w-0 flex-1 truncate text-xs', on ? 'text-fg' : 'text-muted')}
                title={x.label}
              >
                {x.label}
              </span>
              {x.revealed ? (
                <span className="shrink-0 text-[11px] text-muted">{S.anStageAuthored}</span>
              ) : (
                <Button
                  size="sm"
                  variant={x.unlocked ? 'secondary' : 'primary'}
                  aria-label={
                    x.unlocked ? S.anStageCloseLabel(x.label) : S.anStageOpenLabel(x.label)
                  }
                  aria-pressed={x.unlocked}
                  onClick={() => {
                    setUnlock(x.kind, x.id, !x.unlocked);
                    notify({
                      title: x.unlocked ? S.anStageClosed : S.anStageOpened,
                      tone: 'success',
                      action: { label: S.undoAction, onClick: () => undo() },
                    });
                  }}
                >
                  {x.unlocked ? S.anStageClose : S.anStageOpen}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
