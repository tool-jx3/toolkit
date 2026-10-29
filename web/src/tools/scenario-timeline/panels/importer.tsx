/**
 * 讀入（規格 F76、F79）：CSV／TSV 的事件表（選檔、貼上、拖進視窗）、拖進視窗的專案檔。
 * 要問「加入／取代」「開啟專案檔？」的對話框在 ToolShell 裡，由 ImportBridge 接上。
 */
import { useEffect, useState } from 'react';
import { decodeText, pickFiles, readAsBytes } from '@/core/files';
import { parseProjectBytes } from '@/core/storage';
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
import { emptyReport, LIMITS, normalizeDoc, type TimelineDoc } from '../model/types';
import { notify } from '../notify';
import { applyImport, DATA_VERSION, docNow, guard, replaceDoc, TOOL_ID, useUi } from '../store';
import { S } from '../strings';
import { tryVisValues } from './visImport';

let chooseImpl: (<V extends string>(o: ChoiceOptions<V>) => Promise<V | null>) | null = null;
let confirmImpl: ((o: ConfirmOptions) => Promise<boolean>) | null = null;

/** 問一個選擇（對話框還沒接上時回傳 fallback） */
export function askChoice<V extends string>(
  o: ChoiceOptions<V>,
  fallback: V | null,
): Promise<V | null> {
  return chooseImpl ? chooseImpl(o) : Promise.resolve(fallback);
}

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

/**
 * 專案檔的 data → 資料與提醒（略過或整理掉的東西；規格 3.2）。
 * 看不懂、內容是空的（沒有任何劇本時間表的欄位）時丟錯（訊息可以直接顯示）。
 * version 比這個版本新、時間寫法看不懂時也提醒（7.1 第 11 點）。
 */
export function readProjectData(
  data: unknown,
  version = DATA_VERSION,
): { doc: TimelineDoc; warnings: string[] } {
  const r = emptyReport();
  const doc = normalizeDoc(data, r);
  if (!doc) throw new Error(S.badProject);
  if (r.empty) throw new Error(S.emptyProject);
  const warnings = [
    version > DATA_VERSION ? S.projectNewer(version, DATA_VERSION) : '',
    r.unknownMode !== null ? S.projectUnknownMode(r.unknownMode) : '',
    r.eventsUnreadable ? S.projectEventsUnreadable : '',
    r.skippedEvents ? S.projectSkippedEvents(r.skippedEvents) : '',
    r.overEvents ? S.projectOver('事件', LIMITS.events, r.overEvents) : '',
    r.rangesToPoints ? S.projectRangesToPoints(r.rangesToPoints) : '',
    r.skippedMarkers ? S.projectSkippedMarkers(r.skippedMarkers) : '',
    r.overMarkers ? S.projectOver('標記', LIMITS.markers, r.overMarkers) : '',
    r.overLanes ? S.projectOver('泳道', LIMITS.lanes, r.overLanes) : '',
    r.overCategories ? S.projectOver('分類', LIMITS.categories, r.overCategories) : '',
    r.lanesFlattened ? S.projectLanesFlattened(r.lanesFlattened) : '',
    r.skippedLinks ? S.projectSkippedLinks(r.skippedLinks) : '',
    r.overLinks ? S.projectOver('關聯線', LIMITS.links, r.overLinks) : '',
  ].filter(Boolean);
  return { doc, warnings };
}

/** 對話框說明：一句一行（空的略過；全部空的時 undefined） */
function lines(list: string[]) {
  const shown = list.filter(Boolean);
  if (!shown.length) return undefined;
  return shown.map((t) => (
    <span key={t} className="block">
      {t}
    </span>
  ));
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
  /* 數字照實：超過上限沒讀的列、「加入」時還放得下幾個 */
  const over = Math.max(0, result.total - result.events.length - result.errors.length);
  const has = doc.events.length;
  const room = Math.max(0, Math.min(result.events.length, LIMITS.events - has));
  const limited = over > 0 || room < result.events.length;
  const how = chooseImpl
    ? await chooseImpl<'append' | 'replace'>({
        title: limited ? S.importTableTitle : S.importTitle(result.events.length),
        description: lines([
          S.importDesc(result.lanes.length, result.categories.length, result.errors.length),
          over ? S.importOver(over, LIMITS.events) : '',
          room < result.events.length ? S.importRoom(has, room) : '',
        ]),
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
  if (n < result.events.length || over) notes.push(S.importFull(LIMITS.events));
  if (!n) {
    notify({
      title: S.importNone,
      description: lines(notes),
      tone: 'warning',
      duration: 8000,
    });
    return 0;
  }
  notify({
    title: S.imported(n),
    description: lines(notes),
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
    let project: ReturnType<typeof parseProjectBytes>;
    try {
      project = parseProjectBytes(bytes, TOOL_ID);
    } catch (e) {
      /* 不是本工具的專案檔：也許是 vis-timeline 的資料（一起拖進來的 JSON 都算：items、groups 分開的檔案） */
      if (name.endsWith('.json') && (await tryVisFiles(files))) return;
      notify({
        title: S.unknownFile,
        description: e instanceof Error ? e.message : file.name,
        tone: 'danger',
      });
      return;
    }
    try {
      const { doc, warnings } = readProjectData(project.data, project.version);
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
      notify({
        title: S.opened,
        description: lines([file.name, ...warnings]),
        tone: warnings.length ? 'warning' : 'success',
        ...(warnings.length ? { duration: 8000 } : {}),
      });
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

/** 拖進來的 JSON 檔讀成 vis-timeline 的資料；認不出來時回傳 false */
export async function tryVisFiles(files: readonly File[]): Promise<boolean> {
  const values: unknown[] = [];
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.json')) continue;
    const bytes = await readAsBytes(f).catch(() => null);
    if (!bytes) continue;
    try {
      values.push(JSON.parse(decodeText(bytes).text));
    } catch {
      /* 壞掉的 JSON：略過 */
    }
  }
  return tryVisValues(values);
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
