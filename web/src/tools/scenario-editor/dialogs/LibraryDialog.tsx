/**
 * 作品清單（F001～F009、F017）：清單、過去的版本、垃圾桶。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, cn, Dialog } from '@/ui';
import { bridge } from '../bridge';
import {
  busyIds,
  listTrash,
  listWorks,
  sizeText,
  trashDaysLeft,
  type WorkMeta,
  whenText,
} from '../library';
import {
  deleteWork,
  duplicateWork,
  flushNow,
  newWork,
  openWork,
  restoreFromTrash,
  restoreGen,
  useSession,
} from '../session';
import { say, setUi, useDoc, useUi } from '../store';
import { S } from '../strings';

type View = 'list' | 'gens' | 'trash';

export function LibraryDialog() {
  const open = useUi((s) => s.libraryOpen);
  const cur = useSession((s) => s.id);
  const idb = useSession((s) => s.idb);
  const title = useDoc((s) => s.data.title);
  const [view, setView] = useState<View>('list');
  const [works, setWorks] = useState<WorkMeta[]>([]);
  const [trash, setTrash] = useState<WorkMeta[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const openBtn = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    if (!useSession.getState().idb) return;
    await flushNow();
    const [w, t, b] = await Promise.all([
      listWorks(),
      listTrash(),
      busyIds(useSession.getState().id),
    ]);
    setWorks(w);
    setTrash(t);
    setBusy(b);
    setPicked((p) =>
      p && w.some((m) => m.id === p) ? p : (useSession.getState().id ?? w[0]?.id ?? null),
    );
  }, []);

  /* 開啟時：清單讀完後把焦點放在「開啟」（按 Enter 就繼續寫；F001、F008） */
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    setView('list');
    setNote('');
    setPicked(useSession.getState().id);
    let alive = true;
    void reload().then(() => {
      if (alive) setFocusTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [open, reload]);
  useEffect(() => {
    if (!focusTick || !useSession.getState().idb) return;
    let raf = 0;
    let tries = 0;
    const go = () => {
      const btn = openBtn.current;
      const list = listRef.current;
      /* 對話框的內容（Portal）還沒放上畫面時等下一格 */
      if (!btn && !list) {
        if (++tries < 30) raf = requestAnimationFrame(go);
        return;
      }
      /* 目前的作品被別的分頁鎖住（開啟停用）時改放在清單上，↑↓ 照樣能選 */
      if (btn && !btn.disabled) btn.focus();
      else list?.focus();
    };
    go();
    return () => cancelAnimationFrame(raf);
  }, [focusTick]);

  const close = () => setUi({ libraryOpen: false });
  const sel = works.find((m) => m.id === picked) ?? null;

  const doOpen = async (id: string | null = picked) => {
    if (!id) return;
    if (busy.has(id)) {
      setNote(S.status.lockedOther);
      return;
    }
    if (await openWork(id)) close();
    else {
      setNote(S.status.lockedOther);
      void reload();
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (view !== 'list' || !works.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = works.findIndex((m) => m.id === picked);
      const n = e.key === 'ArrowDown' ? Math.min(works.length - 1, i + 1) : Math.max(0, i - 1);
      setPicked(works[n].id);
      listRef.current
        ?.querySelector<HTMLElement>(`[data-work="${works[n].id}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && (e.target as HTMLElement).closest('[role="listbox"]')) {
      e.preventDefault();
      void doOpen();
    }
  };

  const body = !idb ? (
    <div className="flex flex-col gap-2 text-sm">
      <p className="m-0">{S.status.noIdb}</p>
      <p className="m-0">目前的作品：「{title}」</p>
    </div>
  ) : view === 'list' ? (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm text-muted">{works.length} 個作品，存在這個瀏覽器裡。</p>
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label="作品"
        aria-activedescendant={picked ? `work-${picked}` : undefined}
        className="flex max-h-[50dvh] flex-col gap-1 overflow-auto rounded-md border border-border p-1"
      >
        {works.map((m) => (
          <div
            key={m.id}
            id={`work-${m.id}`}
            role="option"
            aria-selected={m.id === picked}
            data-work={m.id}
            tabIndex={-1}
            onClick={() => setPicked(m.id)}
            onDoubleClick={() => void doOpen(m.id)}
            onKeyDown={() => undefined}
            className={cn(
              'flex cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-1.5 text-sm',
              m.id === picked ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-surface-3',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold">
                {m.title || '未命名的劇本'}
              </span>
              {m.id === cur ? <span className="text-xs text-accent">目前的作品</span> : null}
              {busy.has(m.id) ? (
                <span className="text-xs text-warning">正在別的分頁編輯</span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted">
              <span>更新：{whenText(m.updated)}</span>
              <span>檔案：{m.fileAt ? whenText(m.fileAt) : '未儲存'}</span>
              <span>{sizeText(m.size)}</span>
            </div>
          </div>
        ))}
      </div>
      {note ? <p className="m-0 text-sm text-warning">{note}</p> : null}
    </div>
  ) : view === 'gens' ? (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm text-muted">
        「{sel?.title}」保留的版本（開啟時、書寫中每 10 分鐘、全部清除之前各留一份，最多 10
        份）。還原會建立新的作品，目前的作品不變。
      </p>
      <ul className="m-0 flex max-h-[50dvh] list-none flex-col gap-1 overflow-auto p-0">
        {[...(sel?.gens ?? [])].reverse().map((g) => (
          <li
            key={g.t}
            className="flex items-center gap-2 rounded-sm border border-border px-2 py-1 text-sm"
          >
            <span className="flex-1">{whenText(g.t)}</span>
            <span className="text-xs text-muted">{sizeText(g.size)}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                if (!sel) return;
                const id = await restoreGen(sel.id, g.t);
                if (id) {
                  say(`已還原成新作品`);
                  setView('list');
                  await reload();
                  setPicked(id);
                }
              }}
            >
              還原成新作品
            </Button>
          </li>
        ))}
        {!sel?.gens?.length ? <li className="text-sm text-muted">還沒有保留的版本。</li> : null}
      </ul>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm text-muted">刪除的作品放在這裡 30 天，之後永久刪除。</p>
      <ul className="m-0 flex max-h-[50dvh] list-none flex-col gap-1 overflow-auto p-0">
        {trash.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-2 rounded-sm border border-border px-2 py-1 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{m.title || '未命名的劇本'}</span>
            <span className="text-xs text-muted">
              刪除：{whenText(m.deleted)}（剩 {trashDaysLeft(m.deleted ?? Date.now())} 天）
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await restoreFromTrash(m.id);
                await reload();
              }}
            >
              還原
            </Button>
          </li>
        ))}
        {!trash.length ? <li className="text-sm text-muted">垃圾桶是空的。</li> : null}
      </ul>
    </div>
  );

  const footer = !idb ? (
    <Button onClick={close}>關閉</Button>
  ) : view === 'list' ? (
    /* 焦點在下方按鈕（例如開啟時的「開啟」）時 ↑↓ 也移動清單的選取（按鈕上的 Enter 照常按下按鈕） */
    // biome-ignore lint/a11y/noStaticElementInteractions: 只是把 ↑↓ 轉給清單，按鈕本身照常操作
    <div className="contents" onKeyDown={onKey}>
      <Button variant="secondary" onClick={() => setView('trash')}>
        垃圾桶{trash.length ? `（${trash.length}）` : ''}
      </Button>
      <Button variant="secondary" disabled={!sel} onClick={() => setView('gens')}>
        過去的版本
      </Button>
      <Button
        variant="danger"
        disabled={!sel || busy.has(sel.id)}
        onClick={async () => {
          if (!sel) return;
          if (
            !(await bridge.confirm({
              title: S.confirm.deleteWork(sel.title),
              description: S.confirm.deleteWorkHint,
              danger: true,
              confirmLabel: S.confirm.del,
            }))
          )
            return;
          await deleteWork(sel.id);
          await reload();
        }}
      >
        刪除
      </Button>
      <Button
        variant="secondary"
        disabled={!sel}
        onClick={async () => {
          if (!sel) return;
          const id = await duplicateWork(sel.id);
          await reload();
          if (id) setPicked(id);
        }}
      >
        複製
      </Button>
      <Button
        variant="secondary"
        onClick={async () => {
          await newWork();
          close();
        }}
      >
        新建
      </Button>
      <Button ref={openBtn} disabled={!sel || busy.has(sel.id)} onClick={() => void doOpen()}>
        開啟
      </Button>
    </div>
  ) : (
    <Button variant="secondary" onClick={() => setView('list')}>
      回到清單
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={view === 'gens' ? '過去的版本' : view === 'trash' ? '垃圾桶' : '作品'}
      size="lg"
      initialFocus={openBtn}
      onEscapeKeyDown={(e) => {
        if (view !== 'list') {
          e.preventDefault();
          setView('list');
        }
      }}
      footer={footer}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ↑↓ 在整個清單畫面都能移動選取 */}
      <div onKeyDown={onKey} data-testid="se-library">
        {body}
      </div>
    </Dialog>
  );
}
