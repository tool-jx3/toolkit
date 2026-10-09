/**
 * 設定欄：答案來源（自己列答案／從文字擷取、產生）與外觀（標題、空格、字型）。
 */
import { Eraser, FileText, ListPlus, Shuffle } from 'lucide-react';
import { useMemo } from 'react';
import { decodeText, readAsBytes } from '@/core/files';
import {
  Button,
  Checkbox,
  ColorField,
  Field,
  FileDrop,
  FontPicker,
  GestureScope,
  Notice,
  Section,
  Segmented,
  Slider,
  TextArea,
  TextInput,
  useToast,
  withShortcut,
} from '@/ui';
import { parseList } from './generate';
import {
  AUTOSAVE_TEXT_LIMIT,
  FONT_ROLES,
  inputKey,
  type SourceMode,
  WEIGHT,
  WORD_COUNT,
} from './model';
import { commit, gesture, loadText, puzzleToList, step, useCrossword } from './store';
import { S } from './strings';

/** 讀得進來的文字檔（原作：.txt .html .htm .json .md） */
export const TEXT_ACCEPT =
  '.txt,.html,.htm,.json,.md,text/plain,text/html,text/markdown,application/json';

/** 產生按鈕（設定欄與快捷鍵共用） */
export interface GenerateControl {
  run: () => void;
  busy: boolean;
}

function ListSource() {
  const list = useCrossword((s) => s.data.list);
  const parsed = useMemo(() => parseList(list), [list]);
  const issues = [
    parsed.tooShort.length ? S.source.listIssues.tooShort(parsed.tooShort) : null,
    parsed.duplicates.length ? S.source.listIssues.duplicates(parsed.duplicates) : null,
    parsed.noHint.length ? S.source.listIssues.noHint(parsed.noHint.length) : null,
  ].filter((s): s is string => !!s);
  return (
    <Field
      label={S.source.listLabel}
      hint={S.source.listHint}
      labelSuffix={
        <span className="text-xs text-muted tabular-nums" data-testid="list-count">
          {S.source.listCount(parsed.entries.length)}
        </span>
      }
    >
      <div className="flex flex-col gap-1.5">
        <TextArea
          value={list}
          rows={12}
          spellCheck={false}
          placeholder={S.source.listPlaceholder}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => {
            const v = e.target.value;
            commit((d) => {
              d.list = v;
            });
          }}
          className="min-h-48 text-sm"
          data-testid="list-input"
        />
        {issues.length ? (
          <ul
            className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-warning"
            data-testid="list-issues"
          >
            {issues.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

function TextSource() {
  const toast = useToast();
  const text = useCrossword((s) => s.data.text);
  const fileName = useCrossword((s) => s.data.fileName);
  const wordCount = useCrossword((s) => s.data.wordCount);
  const freqWeight = useCrossword((s) => s.data.freqWeight);
  const lenWeight = useCrossword((s) => s.data.lenWeight);
  const hasHan = useMemo(() => /\p{Script=Han}/u.test(text.slice(0, 20_000)), [text]);

  const readFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const decoded = decodeText(await readAsBytes(file));
      loadText(decoded.text, file.name);
      toast({
        title: decoded.lossy
          ? S.source.fileLoadedLossy(file.name)
          : decoded.encoding === 'big5'
            ? S.source.fileLoadedBig5(file.name)
            : S.source.fileLoaded(file.name),
        tone: decoded.lossy ? 'warning' : 'success',
      });
    } catch {
      toast({ title: S.source.fileFailed(file.name), tone: 'danger' });
    }
  };

  const setNumber = (key: 'wordCount' | 'freqWeight' | 'lenWeight') => (v: number) =>
    commit((d) => {
      d[key] = v;
    });

  return (
    <>
      <FileDrop
        accept={TEXT_ACCEPT}
        paste="off"
        compact
        icon={<FileText />}
        label={S.source.dropLabel}
        buttonLabel={S.source.dropButton}
        hint={S.source.dropHint}
        onFiles={(files) => void readFile(files)}
        onReject={(files) =>
          toast({
            title: S.source.fileRejected(files.map((f) => f.name).join('、')),
            tone: 'danger',
          })
        }
      />
      <Field
        label={S.source.textLabel}
        labelSuffix={
          <span className="text-xs text-muted tabular-nums" data-testid="text-count">
            {S.source.textCount(text.length)}
          </span>
        }
        hint={
          <>
            {fileName ? <span className="block">{S.source.currentFile(fileName)}</span> : null}
            {text.length > AUTOSAVE_TEXT_LIMIT ? (
              <span className="block text-warning">{S.source.textTooLong}</span>
            ) : null}
            {hasHan ? (
              <span className="block" data-testid="han-note">
                {S.source.hanNote}
              </span>
            ) : null}
          </>
        }
      >
        <TextArea
          value={text}
          rows={12}
          spellCheck={false}
          placeholder={S.source.textPlaceholder}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => {
            const v = e.target.value;
            commit((d) => {
              d.text = v;
            });
          }}
          className="min-h-48 text-sm"
          data-testid="text-input"
        />
      </Field>
      <div className="-mt-1 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          icon={<Eraser />}
          disabled={!text && !fileName}
          onClick={() => {
            step((d) => {
              d.text = '';
              d.fileName = '';
            });
            toast({ title: S.source.textCleared, tone: 'info' });
          }}
        >
          {S.source.clearText}
        </Button>
      </div>
      <Field label={S.source.wordCount} hint={S.source.wordCountHint}>
        <Slider
          value={wordCount}
          onChange={gesture.live(setNumber('wordCount'))}
          onCommit={gesture.commit}
          min={WORD_COUNT.min}
          max={WORD_COUNT.max}
          step={1}
        />
      </Field>
      <Field label={S.source.freqWeight} hint={S.source.freqWeightHint}>
        <Slider
          value={freqWeight}
          onChange={gesture.live(setNumber('freqWeight'))}
          onCommit={gesture.commit}
          min={WEIGHT.min}
          max={WEIGHT.max}
          step={1}
          unit="%"
        />
      </Field>
      <Field label={S.source.lenWeight} hint={S.source.lenWeightHint}>
        <Slider
          value={lenWeight}
          onChange={gesture.live(setNumber('lenWeight'))}
          onCommit={gesture.commit}
          min={WEIGHT.min}
          max={WEIGHT.max}
          step={1}
          unit="%"
        />
      </Field>
    </>
  );
}

/** 產生的結果（最後一次產生的統計；來源或設定改過時提醒） */
function GenerateStatus() {
  const toast = useToast();
  const mode = useCrossword((s) => s.data.mode);
  const stats = useCrossword((s) => s.data.stats);
  const puzzle = useCrossword((s) => s.data.puzzle);
  const key = useCrossword((s) =>
    inputKey({
      mode: s.data.mode,
      text: s.data.text,
      list: s.data.list,
      wordCount: s.data.wordCount,
      freqWeight: s.data.freqWeight,
      lenWeight: s.data.lenWeight,
    }),
  );
  if (!stats || !puzzle) return null;
  const placed = puzzle.words.length;
  return (
    <div className="flex flex-col gap-1.5" data-testid="generate-status">
      <Notice
        tone={stats.unplaced.length ? 'warning' : 'success'}
        action={
          stats.mode === 'text' && mode === 'text' ? (
            <Button
              size="sm"
              icon={<ListPlus />}
              title={S.status.toListTitle}
              onClick={() => toast({ title: S.status.toListDone(puzzleToList()), tone: 'success' })}
            >
              {S.status.toList}
            </Button>
          ) : undefined
        }
      >
        <p className="m-0">
          {stats.mode === 'text'
            ? S.status.textResult(placed, stats.found)
            : S.status.listResult(placed, stats.found)}
        </p>
        {stats.unplaced.length ? (
          <p className="m-0 mt-0.5" data-testid="unplaced">
            {S.status.unplaced(stats.unplaced)}
          </p>
        ) : null}
      </Notice>
      {stats.key && stats.key !== key ? (
        <Notice tone="info">
          <span data-testid="stale">{S.status.stale}</span>
        </Notice>
      ) : null}
    </div>
  );
}

export function SourceSection({ generate }: { generate: GenerateControl }) {
  const mode = useCrossword((s) => s.data.mode);
  return (
    <Section title={S.source.title} fixed>
      <div className="flex flex-col gap-3">
        <Segmented<SourceMode>
          aria-label={S.source.modeLabel}
          value={mode}
          onValueChange={(v) =>
            step((d) => {
              d.mode = v;
            })
          }
          options={(['list', 'text'] as const).map((m) => ({ value: m, label: S.source.modes[m] }))}
          fullWidth
        />
        {mode === 'list' ? <ListSource /> : <TextSource />}
        <div className="flex flex-col gap-1.5">
          <Button
            variant="primary"
            size="lg"
            icon={<Shuffle />}
            loading={generate.busy}
            disabled={generate.busy}
            onClick={generate.run}
            title={withShortcut(S.source.generate, 'mod+enter')}
            data-testid="generate"
          >
            {generate.busy ? S.source.generating : S.source.generate}
          </Button>
          <p className="m-0 text-xs text-muted">{S.source.generateHint}</p>
        </div>
        <GenerateStatus />
      </div>
    </Section>
  );
}

export function DesignSection() {
  const d = useCrossword((s) => s.data);
  return (
    <Section title={S.design.title} persistKey="crossword:design">
      <div className="flex flex-col gap-3">
        <Field label={S.design.sheetTitle}>
          <TextInput
            value={d.title}
            placeholder={S.design.sheetTitlePlaceholder}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => {
              const v = e.target.value;
              commit((x) => {
                x.title = v;
              });
            }}
            data-testid="title-input"
          />
        </Field>
        <Field label={S.design.emptyColor} hint={S.design.emptyTransparentHint}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <GestureScope gesture={gesture}>
              <ColorField
                value={d.emptyColor}
                disabled={d.emptyTransparent}
                onChange={(v) =>
                  commit((x) => {
                    x.emptyColor = v;
                  })
                }
                className="min-w-0 flex-1"
              />
            </GestureScope>
            <Checkbox
              checked={d.emptyTransparent}
              onCheckedChange={(v) =>
                step((x) => {
                  x.emptyTransparent = v;
                })
              }
              label={S.design.emptyTransparent}
            />
          </div>
        </Field>
        <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-semibold text-fg">{S.design.fontsTitle}</legend>
          {FONT_ROLES.map((role) => (
            <Field key={role} label={S.design.fonts[role]}>
              <FontPicker
                value={d.fonts[role]}
                previewText={S.design.fontPreview[role]}
                showWeight={false}
                onChange={(v) =>
                  step((x) => {
                    x.fonts[role] = { ...v };
                  })
                }
              />
            </Field>
          ))}
        </fieldset>
      </div>
    </Section>
  );
}
