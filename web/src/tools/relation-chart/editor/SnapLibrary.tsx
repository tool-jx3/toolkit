/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 快照頁籤（F015；原作的 renderSnapList、renderLibSide 的 snaps 分支、openSnapPanel）：
 * 左欄＝說明、名稱欄＋「建立快照」（Enter＝建立）、寫入失敗的紅字、匯出全部、匯入備份、備份說明、用量；
 * 點右欄的一份＝左欄換成那一份的面板：還原整份專案、只取其中一個分頁、命名、刪除（確認）。
 * 右欄＝快照清單（新 → 舊；圖示：自動＝時鐘、手動＝書籤；「N 個分頁・M 位角色 · 時間」；搜尋比對名稱與拍照時的分頁名）。
 */
import { ArrowLeft, Bookmark, Camera, Clock, Download, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadBytes, pickFiles } from '@/core/files';
import { Button, Notice, TextInput, useConfirm, useToast } from '@/ui';
import {
  deleteSnapshot,
  exportSnapshots,
  importSnapshots,
  loadSnaps,
  renameSnapshot,
  restoreSnapshot,
  type SnapMeta,
  snapLabel,
  snapsAvailable,
  snapUsage,
  takeSheetFromSnapshot,
  takeSnapshot,
  useSnaps,
} from '../state/snapshots';
import { setUi, useUi } from '../state/store';
import { S } from '../strings';
import { EntryList, type EntryRow, useThumbSize } from './LibEntries';
import { shortTime } from './SheetLibrary';

const T = S.snap;
const label = (m: Pick<SnapMeta, 'name' | 'auto'>) =>
  snapLabel(m, { auto: T.autoName, manual: T.manualName });
const meta = (m: SnapMeta) =>
  `${T.summary(m.summary.sheets, m.summary.chars)} · ${shortTime(m.savedAt)}`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 建立快照（選單與頁籤共用）：成功＝通知；失敗的紅字留在頁籤上 */
export async function takeSnapshotNow(
  name: string,
  notify: (m: string, warn?: boolean) => void,
): Promise<boolean> {
  const ok = await takeSnapshot(name, false);
  if (ok) notify(T.taken);
  else notify(useSnaps.getState().fail === 'quota' ? T.failFull : T.fail, true);
  return ok;
}

function SnapPanel({ m }: { m: SnapMeta }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(m.name);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(m.name), [m.name]);
  const notify = (title: string, warn?: boolean) =>
    toast({ title, tone: warn ? 'warning' : 'success' });
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3" data-testid="snap-panel">
      <Button
        size="sm"
        variant="ghost"
        icon={<ArrowLeft />}
        className="self-start"
        onClick={() => setUi({ snapPick: null })}
        data-testid="snap-back"
      >
        {T.back}
      </Button>
      <div>
        <h3 className="text-sm font-semibold" data-testid="snap-panel-name">
          {label(m)}
        </h3>
        <p className="text-xs text-muted">{meta(m)}</p>
      </div>
      <div className="flex flex-col gap-1">
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await restoreSnapshot(m.id, T.preRestore);
              if (r === 'ok') notify(T.restored);
              else notify(r === 'gone' ? T.gone : T.restoreFail, true);
            })
          }
          data-testid="snap-restore"
        >
          {T.restoreAll}
        </Button>
        <p className="text-xs text-muted">{T.restoreNote}</p>
      </div>
      <section className="flex flex-col gap-1" aria-label={T.pickSec}>
        <h4 className="text-xs font-semibold text-muted">{T.pickSec}</h4>
        {m.sheetNames.map((nm, i) => (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: 拍照時的分頁順序
            key={i}
            size="sm"
            disabled={busy}
            className="justify-start"
            onClick={() =>
              void run(async () => {
                const r = await takeSheetFromSnapshot(m.id, i);
                if (r === 'ok') notify(T.sheetTaken);
                else notify(r === 'gone' ? T.gone : T.restoreFail, true);
              })
            }
            data-testid="snap-pick-sheet"
          >
            {nm}
          </Button>
        ))}
      </section>
      <section className="flex flex-col gap-1.5" aria-label={T.manageSec}>
        <h4 className="text-xs font-semibold text-muted">{T.manageSec}</h4>
        <TextInput
          value={name}
          maxLength={80}
          placeholder={T.namePh}
          aria-label={T.nameLabel}
          onChange={(e) => setName(e.target.value)}
          data-testid="snap-rename-input"
        />
        <Button size="sm" onClick={() => void renameSnapshot(m.id, name)} data-testid="snap-rename">
          {T.rename}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() =>
            void (async () => {
              const ok = await confirm({
                title: T.delTitle,
                description: T.delConfirm(label(m)),
                confirmLabel: T.delOk,
                danger: true,
              });
              if (!ok) return;
              await deleteSnapshot(m.id);
              setUi({ snapPick: null });
            })()
          }
          data-testid="snap-delete"
        >
          {T.del}
        </Button>
      </section>
    </div>
  );
}

export function SnapSide() {
  const pick = useUi((u) => u.snapPick);
  const list = useSnaps((s) => s.list);
  const fail = useSnaps((s) => s.fail);
  const toast = useToast();
  const [name, setName] = useState('');
  useEffect(() => {
    void loadSnaps();
  }, []);
  const m = pick ? list?.find((x) => x.id === pick) : undefined;
  if (m) return <SnapPanel m={m} />;
  const notify = (title: string, warn?: boolean) =>
    toast({ title, tone: warn ? 'warning' : 'success' });
  const take = async () => {
    if (await takeSnapshotNow(name, notify)) setName('');
  };
  const usage = snapUsage(list ?? []);
  return (
    <div className="flex flex-col gap-2.5" data-testid="snap-side">
      <p className="text-xs text-muted">{T.hint}</p>
      {snapsAvailable() ? (
        <>
          <div className="flex flex-col gap-1.5">
            <TextInput
              value={name}
              maxLength={80}
              placeholder={T.namePh}
              aria-label={T.nameLabel}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void take();
                }
              }}
              data-testid="snap-name"
            />
            <Button
              size="sm"
              variant="primary"
              icon={<Camera />}
              onClick={() => void take()}
              data-testid="snap-take"
            >
              {T.take}
            </Button>
          </div>
          {fail ? (
            <Notice tone="danger" data-testid="snap-fail">
              <b>{fail === 'quota' ? T.failFull : T.fail}</b>
              <br />
              {T.failHelp}
            </Notice>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              icon={<Download />}
              onClick={() =>
                void (async () => {
                  const r = await exportSnapshots();
                  if (!r) {
                    notify(T.expEmpty, true);
                    return;
                  }
                  downloadBytes(r.bytes, `${T.expName}_${today()}.zip`, 'application/zip');
                  notify(T.expDone(r.count));
                })()
              }
              data-testid="snap-export"
            >
              {T.exportAll}
            </Button>
            <Button
              size="sm"
              icon={<Upload />}
              onClick={() =>
                void (async () => {
                  const [f] = await pickFiles({ accept: '.zip,application/zip' });
                  if (!f) return;
                  const r = await importSnapshots(new Uint8Array(await f.arrayBuffer()));
                  if (!r) notify(T.impBad, true);
                  else notify(T.impDone(r.added, r.skipped), !r.added);
                })()
              }
              data-testid="snap-import"
            >
              {T.importZip}
            </Button>
          </div>
          <p className="text-xs text-muted">{T.backupHint}</p>
          <p className="text-xs text-muted" data-testid="snap-usage">
            {T.usage(usage.n, usage.mb)}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">{T.noIdb}</p>
      )}
    </div>
  );
}

export function SnapList({ query }: { query: string }) {
  const list = useSnaps((s) => s.list);
  const pick = useUi((u) => u.snapPick);
  const thumb = useThumbSize();
  useEffect(() => {
    void loadSnaps();
  }, []);
  if (!snapsAvailable()) return <p className="text-sm text-muted">{T.noIdb}</p>;
  const q = query.trim().toLowerCase();
  /* 清單的列用序號當 id（快照的 id 是字串） */
  const ids = (list ?? []).filter(
    (m) =>
      !q ||
      label(m).toLowerCase().includes(q) ||
      m.sheetNames.some((n) => n.toLowerCase().includes(q)),
  );
  const rows: EntryRow[] = ids.map((m, i) => {
    const Icon = m.auto ? Clock : Bookmark;
    return {
      id: i + 1,
      name: label(m),
      thumb: (
        <span
          className="grid shrink-0 place-items-center rounded-md bg-surface-3 text-muted"
          style={{ width: thumb, height: thumb }}
          title={m.auto ? T.autoTip : T.manualTip}
          aria-hidden
        >
          <Icon className="size-[60%]" />
        </span>
      ),
      meta: meta(m),
      onSheet: false,
      sheets: [],
    };
  });
  const pickedIdx = pick ? ids.findIndex((m) => m.id === pick) : -1;
  return (
    <EntryList
      rows={rows}
      sheets={[]}
      grouped={false}
      sig={`snaps|${q}`}
      empty={list?.length ? S.sheetLib.noMatch : T.empty}
      label={T.list}
      sortable={false}
      picked={pickedIdx >= 0 ? pickedIdx + 1 : null}
      onClick={(n) => {
        const m = ids[n - 1];
        if (m) setUi({ snapPick: m.id });
      }}
      onReorder={() => {}}
      onDeleteMany={() => {}}
      groupDelText={() => ''}
    />
  );
}
