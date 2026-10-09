/**
 * 四象限的設定：這一頁（標題、四個軸名）、契合度（兩個角色／全體平均）、座標碼（複製、加入）。
 */
import { ClipboardCopy, ClipboardPaste } from 'lucide-react';
import { useState } from 'react';
import { copyText } from '@/core/files';
import {
  Button,
  Field,
  FieldRow,
  Section,
  Segmented,
  Select,
  TextArea,
  TextInput,
  useToast,
} from '@/ui';
import { decodeBackupCode } from './legacy';
import {
  type AxisKey,
  type ChartState,
  formatScore,
  groupReport,
  pageShareCode,
  pairReport,
  parseShareCode,
  type ScoreRow,
  scoreTone,
} from './model';
import {
  applyShare,
  type CompareMode,
  chartNow,
  currentPageIndex,
  gesture,
  pageIndexOf,
  setPageText,
  useChart,
  usePrefs,
} from './store';
import { S } from './strings';

function usePageIndex(): number {
  const page = usePrefs((s) => s.data.page);
  return useChart((s) => pageIndexOf(s.data, page));
}

export function PageSection() {
  const index = usePageIndex();
  const page = useChart((s) => s.data.pages[index]);
  const count = useChart((s) => s.data.pages.length);
  const axisField = (k: AxisKey) => (
    <Field label={S.axis[k]}>
      <TextInput
        aria-label={S.axisLabel(k)}
        value={page.labels[k]}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => setPageText(index, k, e.target.value)}
      />
    </Field>
  );
  return (
    <Section title={S.sectionPage} description={S.pageOf(index + 1, count)}>
      <div className="flex flex-col gap-3" data-testid="page-panel" data-page={page.id}>
        <Field label={S.axis.title} hint={S.pageHint}>
          <TextInput
            value={page.title}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => setPageText(index, 'title', e.target.value)}
          />
        </Field>
        <FieldRow columns={2}>
          {axisField('top')}
          {axisField('bottom')}
        </FieldRow>
        <FieldRow columns={2}>
          {axisField('left')}
          {axisField('right')}
        </FieldRow>
      </div>
    </Section>
  );
}

const TONE_CLASS = {
  high: 'font-bold text-accent',
  low: 'text-warning',
  normal: 'text-fg',
} as const;

function ScoreTable({
  rows,
  average,
  averageLabel,
  colLabel,
}: {
  rows: ScoreRow[];
  average: number | null;
  averageLabel: string;
  colLabel: string;
}) {
  return (
    <table className="w-full border-collapse text-sm" data-testid="score-table">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted">
          <th className="py-1.5 font-medium">{S.colPage}</th>
          <th className="py-1.5 text-right font-medium">{colLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.pageId}
            className={
              r.score === null ? 'border-b border-border opacity-55' : 'border-b border-border'
            }
            data-score={r.score === null ? '' : r.score.toFixed(1)}
          >
            <td className="max-w-0 truncate py-1.5 pr-2" title={r.title}>
              {r.title || S.untitled}
            </td>
            <td
              className={`py-1.5 text-right tabular-nums ${r.score === null ? 'text-muted' : TONE_CLASS[scoreTone(r.score)]}`}
            >
              {formatScore(r.score)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td className="pt-2">{averageLabel}</td>
          <td className="pt-2 text-right tabular-nums text-accent" data-testid="score-average">
            {formatScore(average)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function ScoreSection() {
  const d = useChart((s) => s.data);
  const prefs = usePrefs((s) => s.data);
  const set = (p: Partial<typeof prefs>) => usePrefs.getState().patch(p);
  const ids = new Set(d.characters.map((c) => c.id));
  const a = ids.has(prefs.pairA) ? prefs.pairA : '';
  const b = ids.has(prefs.pairB) ? prefs.pairB : '';
  const options = d.characters.map((c) => ({ value: c.id, label: c.name || S.noName }));
  return (
    <Section title={S.sectionScore}>
      <div className="flex flex-col gap-3" data-testid="score-panel">
        <Segmented<CompareMode>
          aria-label={S.compare}
          value={prefs.compare}
          onValueChange={(v) => set({ compare: v })}
          fullWidth
          options={[
            { value: 'pair', label: S.compares.pair },
            { value: 'group', label: S.compares.group },
          ]}
        />
        {prefs.compare === 'pair' ? (
          <>
            <FieldRow columns={2}>
              <Field label={S.pickA}>
                <Select
                  value={a}
                  placeholder={S.pickPlaceholder}
                  options={options}
                  onValueChange={(v) => set({ pairA: v })}
                />
              </Field>
              <Field label={S.pickB}>
                <Select
                  value={b}
                  placeholder={S.pickPlaceholder}
                  options={options}
                  onValueChange={(v) => set({ pairB: v })}
                />
              </Field>
            </FieldRow>
            <PairResult d={d} a={a} b={b} />
          </>
        ) : (
          <GroupResult d={d} />
        )}
        <p className="m-0 text-xs text-muted">{S.scoreNote}</p>
      </div>
    </Section>
  );
}

function Message({ children, tone }: { children: string; tone?: 'danger' }) {
  return (
    <p
      className={`m-0 rounded-md bg-surface-2 px-3 py-4 text-center text-sm ${tone === 'danger' ? 'text-danger' : 'text-muted'}`}
      data-testid="score-message"
    >
      {children}
    </p>
  );
}

function PairResult({ d, a, b }: { d: ChartState; a: string; b: string }) {
  if (!a || !b) return <Message>{S.pickTwo}</Message>;
  if (a === b) return <Message tone="danger">{S.pickDifferent}</Message>;
  const r = pairReport(d, a, b);
  return (
    <ScoreTable rows={r.rows} average={r.average} averageLabel={S.average} colLabel={S.colScore} />
  );
}

function GroupResult({ d }: { d: ChartState }) {
  if (d.characters.length < 2) return <Message>{S.needTwo}</Message>;
  const r = groupReport(d);
  return (
    <>
      <p className="m-0 text-xs text-muted">{S.groupNote}</p>
      <ScoreTable
        rows={r.rows}
        average={r.average}
        averageLabel={S.groupAverage}
        colLabel={S.colAverage}
      />
    </>
  );
}

/** 貼到座標碼欄的是原作的全部備份碼（提醒改用「貼上原作的備份碼…」） */
function looksLikeBackup(text: string): boolean {
  try {
    decodeBackupCode(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareSection() {
  const toast = useToast();
  const [text, setText] = useState('');
  const copy = async () => {
    const d = chartNow();
    const code = pageShareCode(d, d.pages[currentPageIndex()]);
    setText(code);
    const ok = await copyText(code);
    toast(
      ok
        ? { title: S.shareCopied, tone: 'success', replace: true }
        : { title: S.shareCopyFailed, tone: 'warning', replace: true },
    );
  };
  const apply = () => {
    const raw = text.trim();
    if (!raw) {
      toast({ title: S.shareEmpty, tone: 'warning', replace: true });
      return;
    }
    let entries: ReturnType<typeof parseShareCode>;
    try {
      entries = parseShareCode(raw);
    } catch {
      toast({
        title: looksLikeBackup(raw) ? S.shareIsBackup : S.shareBad,
        tone: 'danger',
        replace: true,
      });
      return;
    }
    const r = applyShare(entries);
    toast({
      title: S.shareResult(r.added, r.updated, r.skipped),
      tone: r.added || r.updated ? 'success' : 'info',
      replace: true,
    });
    setText('');
  };
  return (
    <Section title={S.sectionShare} defaultOpen={false} persistKey="char-chart:share">
      <Field label={S.shareLabel} hint={S.shareHint}>
        <TextArea
          rows={3}
          value={text}
          placeholder={S.sharePlaceholder}
          spellCheck={false}
          className="font-mono text-xs"
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button icon={<ClipboardCopy />} onClick={() => void copy()}>
          {S.copyShare}
        </Button>
        <Button icon={<ClipboardPaste />} onClick={apply}>
          {S.applyShare}
        </Button>
      </div>
    </Section>
  );
}
