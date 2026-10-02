/**
 * 首頁（F025～F032）：專案名稱大標題、回到上次的頁面、開啟專案檔、範例專案、圖片遺失警示、下一步建議、
 * 製作流程清單、目前房間統計。
 */
import { ArrowRight, FolderOpen, Pencil, Sparkles, TriangleAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button, cn, useConfirm } from '@/ui';
import { Card, Hint, useNotify, useRenameProject } from '../common';
import { brokenImages } from '../materials';
import { DEFAULT_PROJECT_NAME, NEW_PROJECT_NAME } from '../model';
import { pickAndOpen } from '../ops';
import { loadSample } from '../sample';
import { goPage, type PageId, setSession, useBlobs, useLayout, useProject } from '../store';
import { S } from '../strings';

export function HomePage() {
  const p = useProject((s) => s.data);
  const urls = useBlobs((s) => s.urls);
  const last = useLayout((s) => s.data.lastPage);
  const [rename, node] = useRenameProject();
  const confirm = useConfirm();
  const n = useNotify();
  const broken = brokenImages(p, (name) => !!urls[name]);
  const counts = useProject(
    useShallow((s) => ({
      markers: s.data.parts.filter((x) => x.kind === 'marker').length,
      panels: s.data.parts.filter((x) => x.kind === 'panel').length,
    })),
  );
  const untouched = p.name === DEFAULT_PROJECT_NAME || p.name === NEW_PROJECT_NAME;
  const ready = p.scenes.length > 0 && !broken.length;
  /* F030：依序判斷第一個成立的條件 */
  const next: { key: keyof typeof S.next; page: PageId | 'broken'; step: number } = broken.length
    ? { key: 'broken', page: 'broken', step: 5 }
    : untouched
      ? { key: 'name', page: 'room', step: 0 }
      : !p.materials.length
        ? { key: 'materials', page: 'materials', step: 1 }
        : !p.parts.length
          ? { key: 'parts', page: 'room', step: 2 }
          : !p.scenes.length
            ? { key: 'scenes', page: 'scenes', step: 3 }
            : { key: 'export', page: 'save', step: 5 };
  const go = (page: PageId | 'broken') => {
    if (page === 'broken') setSession({ modal: { kind: 'broken' } });
    else goPage(page);
  };
  const steps: { page: PageId; state: string }[] = [
    { page: 'room', state: S.stepState.board(p.room.fieldWidth, p.room.fieldHeight) },
    {
      page: 'materials',
      state: p.materials.length ? S.stepState.count(p.materials.length, '張') : S.stepState.none,
    },
    {
      page: 'room',
      state: p.parts.length ? S.stepState.count(p.parts.length, '個') : S.stepState.optional,
    },
    {
      page: 'scenes',
      state: p.scenes.length ? S.stepState.count(p.scenes.length, '個') : S.stepState.none,
    },
    {
      page: 'pieces',
      state: p.pieces.length ? S.stepState.count(p.pieces.length, '個') : S.stepState.optional,
    },
    { page: 'save', state: ready ? S.stepState.ready : S.stepState.notReady },
  ];
  const resume = () => goPage(last && last !== 'home' ? last : p.scenes.length ? 'scenes' : 'room');
  const sample = async () => {
    if (
      (!untouched || p.materials.length || p.scenes.length) &&
      !(await confirm({ title: S.homeSample, description: S.homeSampleConfirm }))
    )
      return;
    try {
      await loadSample();
      n(S.homeSampleDone, 'success');
    } catch (e) {
      n(S.homeSampleFailed(e instanceof Error ? e.message : String(e)), 'danger');
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="home-page">
      <Card>
        <button
          type="button"
          onClick={() => void rename()}
          className="flex max-w-full min-w-0 items-center gap-2 self-start rounded-sm text-left text-2xl font-semibold hover:text-accent focus-visible:focus-ring"
          data-testid="home-project-name"
        >
          <span className="min-w-0 truncate">{p.name}</span>
          <Pencil className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
        <Hint>{S.homeLead}</Hint>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<ArrowRight />} onClick={resume}>
            {S.homeResume}
          </Button>
          <Button icon={<FolderOpen />} onClick={() => void pickAndOpen(n)}>
            {S.homeOpen}
          </Button>
          <Button icon={<Sparkles />} onClick={() => void sample()}>
            {S.homeSample}
          </Button>
        </div>
        {node}
      </Card>
      {broken.length ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-warning bg-warning-soft p-3 text-sm"
        >
          <TriangleAlert className="size-4 text-warning" aria-hidden />
          <span>{S.brokenBar(broken.length)}</span>
          <Button size="sm" onClick={() => setSession({ modal: { kind: 'broken' } })}>
            {S.brokenOpen}
          </Button>
        </div>
      ) : null}
      <Card className="border-accent" data-testid="next-step">
        <h2 className="m-0 text-lg font-semibold">{S.next[next.key].title}</h2>
        <Hint>{S.next[next.key].text}</Hint>
        <div>
          <Button variant="primary" onClick={() => go(next.page)}>
            {S.next[next.key].go}
          </Button>
        </div>
      </Card>
      <Card title={S.stepsTitle}>
        <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
          {S.steps.map((st, i) => (
            <li key={st.title}>
              <button
                type="button"
                onClick={() => goPage(steps[i].page)}
                data-step={i + 1}
                className={cn(
                  'flex w-full min-w-0 items-start gap-3 rounded-md border border-border bg-surface-2 p-2 text-left hover:bg-surface-3 focus-visible:focus-ring',
                  next.step === i && 'border-accent ring-1 ring-accent',
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-sm">{st.title}</b>
                  <span className="text-xs text-muted">{st.text}</span>
                </span>
                <span className="shrink-0 text-xs text-muted" data-step-state>
                  {steps[i].state}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Card>
      <Card title={S.statsTitle}>
        <dl
          className="m-0 grid grid-cols-3 gap-2 text-center sm:grid-cols-6"
          data-testid="room-stats"
        >
          {(
            [
              ['materials', p.materials.length],
              ['scenes', p.scenes.length],
              ['markers', counts.markers],
              ['panels', counts.panels],
              ['tachie', p.tachie.length],
              ['pieces', p.pieces.length],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-md bg-surface-2 p-2">
              <dt className="text-xs text-muted">{S.stats[k]}</dt>
              <dd className="m-0 text-xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => goPage('scenes')}>
            {S.pages.scenes}
          </Button>
          <Button size="sm" onClick={() => goPage('materials')}>
            {S.pages.materials}
          </Button>
          <Button size="sm" onClick={() => goPage('room')}>
            {S.pages.room}
          </Button>
        </div>
        <Hint>{S.statsNote}</Hint>
      </Card>
    </div>
  );
}
