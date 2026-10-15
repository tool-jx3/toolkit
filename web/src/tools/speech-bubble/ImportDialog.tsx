/**
 * 整段貼上拆成泡泡（規格 F65）：貼上或開啟文字檔 → 辨識格式與每個人說了幾則 → 指定每個人在哪一側、
 * 要不要帶日期時間、要不要合併同一人連續的訊息 → 加在後面或取代目前的泡泡（一步復原）。
 */
import { ArrowLeftRight, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { pickFiles } from '@/core/files';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  Notice,
  Segmented,
  Select,
  TextArea,
  Toggle,
  useToast,
} from '@/ui';
import {
  buildImport,
  type ChatFormat,
  chooseSide,
  type DateMode,
  defaultSpeakerSides,
  parseChat,
  speakerCounts,
  swapSides,
} from './chatImport';
import { ALIGNS, type Align, MAX_BUBBLES } from './model';
import { edit, useSb, useUi } from './store';
import { CHAT_FORMAT_NAMES, DATE_MODE_NAMES, S, SIDE_NAMES } from './strings';

type Mode = 'append' | 'replace';
const FORMATS: readonly (ChatFormat | 'auto')[] = ['auto', 'colon', 'line', 'discord', 'plain'];

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const existing = useSb((s) => s.data.bubbles.length);
  const [text, setText] = useState('');
  const [format, setFormat] = useState<ChatFormat | 'auto'>('auto');
  const [sides, setSides] = useState<Record<string, Align>>({});
  const [dates, setDates] = useState<DateMode>('time');
  const [separators, setSeparators] = useState(false);
  const [merge, setMerge] = useState(false);
  const [mode, setMode] = useState<Mode>('replace');

  /* 每次打開都從空白開始 */
  useEffect(() => {
    if (!open) return;
    setText('');
    setFormat('auto');
    setSides({});
    setSeparators(false);
    setMerge(false);
    setMode('replace');
  }, [open]);

  const parsed = useMemo(() => parseChat(text, format), [text, format]);
  const counts = useMemo(() => speakerCounts(parsed.messages), [parsed]);
  const speakerKey = counts.map((c) => c.speaker).join('\u0000');
  /* 說話者換了：沒指定過的人用預設的位置 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在說話者的名單改變時重算
  useEffect(() => {
    setSides((prev) => {
      const def = defaultSpeakerSides(counts);
      const next: Record<string, Align> = {};
      for (const c of counts) next[c.speaker] = prev[c.speaker] ?? def[c.speaker] ?? 'left';
      return next;
    });
  }, [speakerKey]);

  const hasTime = parsed.messages.some((m) => m.time);
  const hasDate = parsed.messages.some((m) => m.date);
  const limit = mode === 'replace' ? MAX_BUBBLES : MAX_BUBBLES - existing;
  const plan = useMemo(
    () =>
      buildImport(
        parsed,
        {
          sides,
          dates: hasTime || hasDate ? dates : 'none',
          separators: hasDate && separators,
          merge,
        },
        useSb.getState().data.sides,
        limit,
      ),
    [parsed, sides, dates, separators, merge, limit, hasTime, hasDate],
  );

  const openFile = async () => {
    const [file] = await pickFiles({ accept: '.txt,text/plain' });
    if (!file) return;
    try {
      setText(await file.text());
    } catch {
      toast({ title: S.importReadFailed, tone: 'danger' });
    }
  };

  const run = () => {
    const { bubbles } = plan;
    if (!bubbles.length) return;
    edit((d) => {
      d.bubbles = mode === 'replace' ? bubbles : [...d.bubbles, ...bubbles];
    });
    useUi.setState({ selectedId: bubbles[0].id });
    toast({ title: S.imported(bubbles.length), tone: 'success' });
    onOpenChange(false);
  };

  const detectedName = CHAT_FORMAT_NAMES[parsed.format];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.importTitle}
      description={S.importDescription}
      size="lg"
      dismissOnOutside={false}
      footer={
        <>
          <DialogClose variant="ghost">{S.cancel}</DialogClose>
          <Button
            variant="primary"
            disabled={!plan.bubbles.length}
            onClick={run}
            data-testid="import-confirm"
          >
            {S.importConfirm(plan.bubbles.length)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="import-dialog">
        <Field label={S.importText}>
          <TextArea
            rows={8}
            value={text}
            placeholder={S.importPlaceholder}
            data-testid="import-text"
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Button size="sm" icon={<FileText />} onClick={() => void openFile()}>
            {S.importOpenFile}
          </Button>
          <div className="min-w-48 flex-1">
            <Field label={S.importFormat}>
              <Select
                value={format}
                onValueChange={setFormat}
                options={FORMATS.map((f) => ({ value: f, label: CHAT_FORMAT_NAMES[f] }))}
              />
            </Field>
          </div>
        </div>
        <p className="m-0 text-sm text-muted" role="status" data-testid="import-status">
          {parsed.messages.length
            ? S.importDetected(detectedName, parsed.messages.length)
            : S.importNone}
          {parsed.skipped ? ` ${S.importSkipped(parsed.skipped)}` : ''}
        </p>
        {counts.length ? (
          <fieldset className="m-0 flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-semibold">{S.importSpeakers}</legend>
            <p className="m-0 text-xs text-muted">{S.importSpeakersHint}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="import-speakers">
              {counts.map((c) => {
                const name = c.speaker || S.importNoName;
                return (
                  <li
                    key={c.speaker || '\u0000'}
                    className="flex flex-wrap items-center gap-2"
                    data-speaker={c.speaker}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-fg" title={name}>
                      {name}
                      <span className="ml-2 text-xs text-muted">{S.importCount(c.count)}</span>
                    </span>
                    <Segmented<Align>
                      size="sm"
                      aria-label={S.importSideLabel(name)}
                      value={sides[c.speaker] ?? 'left'}
                      onValueChange={(v) => setSides((p) => chooseSide(p, counts, c.speaker, v))}
                      options={ALIGNS.map((a) => ({ value: a, label: SIDE_NAMES[a] }))}
                    />
                  </li>
                );
              })}
            </ul>
            <div>
              <Button size="sm" icon={<ArrowLeftRight />} onClick={() => setSides(swapSides)}>
                {S.importSwap}
              </Button>
            </div>
          </fieldset>
        ) : null}
        <Field label={S.importDates} hint={S.importDatesHint} hidden={!hasTime && !hasDate}>
          <Segmented<DateMode>
            value={dates}
            onValueChange={setDates}
            options={(['none', 'time', 'datetime'] as const)
              .filter((v) => v !== 'datetime' || hasDate)
              .map((v) => ({ value: v, label: DATE_MODE_NAMES[v] }))}
            fullWidth
          />
        </Field>
        <Field label={S.importDateSeparators} layout="inline" hidden={!hasDate}>
          <Toggle checked={separators} onCheckedChange={setSeparators} />
        </Field>
        <Field label={S.importMerge} hint={S.importMergeHint} layout="inline">
          <Toggle checked={merge} onCheckedChange={setMerge} />
        </Field>
        <Field label={S.importMode}>
          <Segmented<Mode>
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'replace', label: S.importReplace },
              { value: 'append', label: S.importAppend },
            ]}
            fullWidth
          />
        </Field>
        {limit <= 0 ? (
          <Notice tone="warning">{S.importFull(MAX_BUBBLES)}</Notice>
        ) : plan.total > plan.bubbles.length ? (
          <Notice tone="warning">
            {S.importLimit(plan.bubbles.length, plan.total, MAX_BUBBLES)}
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}
