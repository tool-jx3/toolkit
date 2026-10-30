/**
 * 讀入 vis-timeline 的資料（規格 F94）：選檔（可以一次選 items、groups 兩個檔）、拖進視窗、貼上 JSON。
 * 轉換在 model/vis.ts；這裡問「加入／取代」、寫進資料、通知略過了什麼。
 */
import { useState } from 'react';
import { decodeText, pickFiles, readAsBytes } from '@/core/files';
import { Button, Dialog, DialogClose, Field, TextArea } from '@/ui';
import { LIMITS } from '../model/types';
import { convertVis, detectVis, type VisData } from '../model/vis';
import { notify } from '../notify';
import { applyImport, docNow, guard, prefsNow, setPrefs, useUi } from '../store';
import { S } from '../strings';
import { askChoice } from './importer';

function lines(list: string[]) {
  const shown = list.filter(Boolean);
  if (!shown.length) return undefined;
  return shown.map((t) => (
    <span key={t} className="block">
      {t}
    </span>
  ));
}

/** 讀入（已經認出來的資料）；回傳讀入的事件數 */
export async function startVisImport(data: VisData): Promise<number> {
  if (!guard()) return 0;
  const doc = docNow();
  const r = convertVis(data, doc);
  const skipped = r.skipped
    .slice(0, 20)
    .map((x) => S.visSkipItem(x.index, x.reason))
    .join('；');
  const ignored = r.ignored
    .slice(0, 8)
    .map(([k, n]) => `${k}（${n}）`)
    .join('、');
  const details = [
    skipped ? S.visSkipped(r.skipped.length, skipped) : '',
    ignored ? S.visIgnored(ignored) : '',
    ...r.notes,
  ];
  if (!r.events.length) {
    notify({
      title: S.importNone,
      description: lines(details),
      tone: 'warning',
      duration: 8000,
    });
    return 0;
  }
  const has = doc.events.length;
  const room = Math.max(0, Math.min(r.events.length, LIMITS.events - has));
  const how = await askChoice<'append' | 'replace'>(
    {
      title: S.visTitleN(r.events.length),
      description: lines([
        S.importDesc(r.lanes.length, r.categories.length, r.skipped.length),
        doc.mode !== 'date' ? S.visConvert(S.modes[doc.mode]) : '',
        room < r.events.length ? S.importRoom(has, room) : '',
      ]),
      choices: [
        { value: 'append', label: S.importAppend },
        { value: 'replace', label: S.importReplace, variant: 'danger' },
      ],
    },
    'append',
  );
  if (!how) return 0;
  const n = applyImport(r.events, r.lanes, r.categories, how === 'replace');
  /* showNested: false 的分組收合（這台裝置的畫面設定） */
  if (r.collapsed.length) {
    const c = { ...prefsNow().collapsed };
    for (const id of r.collapsed) c[id] = true;
    setPrefs({ collapsed: c });
  }
  if (n < r.events.length) details.push(S.importFull(LIMITS.events));
  const notes = details.filter(Boolean);
  notify({
    title: n ? S.imported(n) : S.importNone,
    description: lines(notes),
    tone: n && !notes.length ? 'success' : 'warning',
    duration: notes.length ? 9000 : 2600,
  });
  return n;
}

/** 讀進來的 JSON 值（好幾個檔案或貼上的文字）認得出來時讀入、回傳 true */
export async function tryVisValues(values: readonly unknown[]): Promise<boolean> {
  const data = detectVis(values);
  if (!data) return false;
  await startVisImport(data);
  return true;
}

/** 選檔（items、groups 可以一起選） */
export async function pickVis(): Promise<void> {
  if (!guard()) return;
  const files = await pickFiles({ accept: '.json,application/json', multiple: true });
  if (!files.length) return;
  const values: unknown[] = [];
  const bad: string[] = [];
  for (const f of files) {
    const bytes = await readAsBytes(f).catch(() => null);
    try {
      if (!bytes) throw new Error('read');
      values.push(JSON.parse(decodeText(bytes).text));
    } catch {
      bad.push(f.name);
    }
  }
  if (await tryVisValues(values)) return;
  notify({
    title: S.visUnknown,
    description: bad.length ? S.visBadJson(bad.join('、')) : S.visUnknownHint,
    tone: 'danger',
    duration: 7000,
  });
}

/** JSON 文字 → 值；空白時 undefined；壞掉時丟錯（訊息可以直接顯示） */
function parseJson(text: string, label: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(S.visJsonError(label, e instanceof Error ? e.message : String(e)));
  }
}

/** 貼上 JSON 的對話框：items（必填）與 groups（選填） */
export function VisDialog() {
  const open = useUi((s) => s.visOpen);
  const [items, setItems] = useState('');
  const [groups, setGroups] = useState('');
  const [error, setError] = useState('');
  const close = () => {
    useUi.setState({ visOpen: false });
    setError('');
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={S.visDialogTitle}
      description={S.visDialogDesc}
      size="md"
      dismissOnOutside={false}
      footer={
        <>
          <DialogClose>{S.pasteCancel}</DialogClose>
          <Button
            variant="primary"
            disabled={!items.trim()}
            data-testid="vis-read"
            onClick={() => {
              let values: unknown[];
              try {
                values = [parseJson(items, S.visItems), parseJson(groups, S.visGroups)].filter(
                  (v) => v !== undefined,
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                return;
              }
              const data = detectVis(values);
              if (!data) {
                setError(S.visUnknownHint);
                return;
              }
              close();
              setItems('');
              setGroups('');
              void startVisImport(data);
            }}
          >
            {S.pasteRead}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={S.visItems} error={error || undefined}>
          <TextArea
            value={items}
            rows={8}
            data-field="vis-items"
            className="font-mono text-xs"
            onChange={(e) => {
              setItems(e.target.value);
              setError('');
            }}
          />
        </Field>
        <Field label={S.visGroups} hint={S.visGroupsHint}>
          <TextArea
            value={groups}
            rows={5}
            data-field="vis-groups"
            className="font-mono text-xs"
            onChange={(e) => {
              setGroups(e.target.value);
              setError('');
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
