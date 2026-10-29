/**
 * 讀入（規格 F76、F79）：CSV／TSV 的事件表（選檔、貼上、拖進視窗）、拖進視窗的專案檔。
 * 要問「加入／取代」「開啟專案檔？」的對話框在 ToolShell 裡，由 ImportBridge 接上。
 */
import { useEffect, useState } from 'react';
import { decodeText, pickFiles, readAsBytes } from '@/core/files';
import { ProjectFileError, parseProjectBytes } from '@/core/storage';
import {
  Button,
  type ChoiceOptions,
  type ConfirmOptions,
  Dialog,
  DialogClose,
  Field,
  TextArea,
  useChoice,
  useConfirm,
} from '@/ui';
import { CsvHeaderError, parseEventsTable } from '../model/csv';
import { LIMITS, normalizeDoc } from '../model/types';
import { notify } from '../notify';
import { applyImport, docNow, guard, replaceDoc, TOOL_ID, useUi } from '../store';
import { S } from '../strings';

let chooseImpl: (<V extends string>(o: ChoiceOptions<V>) => Promise<V | null>) | null = null;
let confirmImpl: ((o: ConfirmOptions) => Promise<boolean>) | null = null;

export function ImportBridge(): null {
  const choose = useChoice();
  const confirm = useConfirm();
  useEffect(() => {
    chooseImpl = choose as typeof chooseImpl;
    confirmImpl = confirm;
    return () => {
      if (chooseImpl === (choose as typeof chooseImpl)) chooseImpl = null;
      if (confirmImpl === confirm) confirmImpl = null;
    };
  }, [choose, confirm]);
  return null;
}

/** 讀入事件表的文字 */
export async function startCsvImport(text: string): Promise<number> {
  if (!guard()) return 0;
  const doc = docNow();
  let result: ReturnType<typeof parseEventsTable>;
  try {
    result = parseEventsTable(text, doc);
  } catch (e) {
    notify({
      title: S.importNone,
      description: e instanceof CsvHeaderError ? e.message : String(e),
      tone: 'danger',
      duration: 7000,
    });
    return 0;
  }
  const errors = result.errors
    .slice(0, 20)
    .map((x) => `第 ${x.row} 列：${x.message}`)
    .join('；');
  if (!result.events.length) {
    notify({
      title: S.importNone,
      description: errors ? S.importErrors(errors) : undefined,
      tone: 'warning',
      duration: 7000,
    });
    return 0;
  }
  const how = chooseImpl
    ? await chooseImpl<'append' | 'replace'>({
        title: S.importTitle(result.events.length),
        description:
          S.importDesc(result.lanes.length, result.categories.length, result.errors.length) ||
          undefined,
        choices: [
          { value: 'append', label: S.importAppend },
          { value: 'replace', label: S.importReplace, variant: 'danger' },
        ],
      })
    : 'append';
  if (!how) return 0;
  /* 取代時，新增的泳道、分類只留用得到的 */
  const n = applyImport(result.events, result.lanes, result.categories, how === 'replace');
  const notes: string[] = [];
  if (errors) notes.push(S.importErrors(errors));
  if (n < result.events.length) notes.push(S.importFull(LIMITS.events));
  notify({
    title: S.imported(n),
    description: notes.join('\n') || undefined,
    tone: notes.length ? 'warning' : 'success',
    duration: notes.length ? 8000 : 2600,
  });
  return n;
}

/** 選檔讀入 CSV */
export async function pickCsv(): Promise<void> {
  if (!guard()) return;
  const files = await pickFiles({
    accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain',
    multiple: false,
  });
  if (files.length) await importFiles(files);
}

/** 讀入一個檔案：專案檔（JSON、ZIP）→ 開啟；CSV／TSV／TXT → 事件表；其他 → 看不懂 */
export async function importFiles(files: readonly File[]): Promise<void> {
  const file = files[0];
  if (!file) return;
  const bytes = await readAsBytes(file).catch(() => null);
  if (!bytes) {
    notify({ title: S.unknownFile, description: file.name, tone: 'danger' });
    return;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith('.json') || name.endsWith('.zip')) {
    try {
      const project = parseProjectBytes(bytes, TOOL_ID);
      const doc = normalizeDoc(project.data);
      if (!doc) throw new ProjectFileError(S.badProject);
      if (!guard()) return;
      const ok = confirmImpl
        ? await confirmImpl({
            title: S.openConfirmTitle,
            description: S.openConfirmDesc,
            confirmLabel: S.openConfirmLabel,
          })
        : true;
      if (!ok) return;
      replaceDoc({ ...doc, sample: false });
      notify({ title: S.opened, description: file.name, tone: 'success' });
    } catch (e) {
      notify({
        title: S.unknownFile,
        description: e instanceof Error ? e.message : file.name,
        tone: 'danger',
      });
    }
    return;
  }
  if (/\.(csv|tsv|txt)$/.test(name) || file.type.startsWith('text/')) {
    const { text } = decodeText(bytes);
    await startCsvImport(text);
    return;
  }
  notify({ title: S.unknownFile, description: file.name, tone: 'danger' });
}

/** 貼上表格的對話框 */
export function PasteDialog() {
  const open = useUi((s) => s.pasteOpen);
  const [text, setText] = useState('');
  const close = () => useUi.setState({ pasteOpen: false });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={S.pasteTitle}
      description={S.pasteDesc}
      size="md"
      dismissOnOutside={false}
      footer={
        <>
          <DialogClose>{S.pasteCancel}</DialogClose>
          <Button
            variant="primary"
            disabled={!text.trim()}
            data-testid="paste-read"
            onClick={() => {
              const t = text;
              close();
              setText('');
              void startCsvImport(t);
            }}
          >
            {S.pasteRead}
          </Button>
        </>
      }
    >
      <Field label={S.pasteLabel}>
        <TextArea
          value={text}
          rows={10}
          data-field="paste"
          className="font-mono text-xs"
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
    </Dialog>
  );
}
