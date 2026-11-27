/**
 * 「從哪個舞台開始」：繼續這台電腦上的作業、新的縱向斷面、新的橫向車廂（第二批）、開啟專案檔、
 * 縱向的四個範例與橫向的兩個範例（縮圖）。換掉之後可以復原。開頁時不自動打開（編輯列的「範例與新的」打開）。
 */
import { FolderOpen, Plus, TrainFront } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { Dialog } from '@/ui';
import { docThumb } from '../draw/thumbs';
import { SAMPLE_IDS, type SampleId, sampleDoc, TRAIN_SAMPLE_IDS } from '../model/samples';
import { S } from '../strings';
import * as act from './actions';
import { pickAndOpen } from './files';
import { setEditor, useDoc, useEditor } from './store';

function Card({
  title,
  desc,
  image,
  icon,
  onClick,
  disabled,
  testId,
}: {
  title: string;
  desc: string;
  image?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface text-left enabled:hover:border-accent focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-55"
    >
      {image ? (
        <img src={image} alt="" className="aspect-[4/3] w-full bg-surface-2 object-contain" />
      ) : null}
      <span className="flex min-w-0 items-center gap-2 p-2">
        {icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted [&_svg]:size-5">
            {icon}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col gap-0.5">
          <b className="text-sm">{title}</b>
          <small className="text-xs text-muted">{desc}</small>
        </span>
      </span>
    </button>
  );
}

function Samples({
  ids,
  label,
  testId,
}: {
  ids: readonly SampleId[];
  label: string;
  testId: string;
}) {
  const thumbs = useMemo(
    () =>
      ids.map((id) => {
        const d = sampleDoc(id);
        return docThumb(
          d,
          360,
          { audience: 'gm', env: d.env, flood: d.flood ? d.floodLevel : 0, crop: 'map' },
          `sample:${id}`,
        );
      }),
    [ids],
  );
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <h3 className="m-0 text-sm font-medium">{label}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid={testId}>
        {ids.map((id, i) => (
          <Card
            key={id}
            testId={`sample-${id}`}
            title={S.samples[id].name}
            desc={S.samples[id].desc}
            image={thumbs[i]}
            onClick={() => act.applySample(id)}
          />
        ))}
      </div>
    </section>
  );
}

function Body() {
  const title = useDoc((s) => s.data.title);
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setEditor({ startOpen: false })}
        data-testid="start-resume"
        className="flex min-w-0 items-center gap-3 rounded-md border border-accent bg-accent-soft px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1">
          <small className="block text-xs text-muted">{S.start.resume}</small>
          <b className="block truncate text-sm">{title}</b>
        </span>
        <span className="shrink-0 text-sm font-medium">{S.start.resumeAction}</span>
      </button>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Card
          testId="start-blank"
          title={S.start.blank}
          desc={S.start.blankDesc}
          icon={<Plus />}
          onClick={act.newBlank}
        />
        <Card
          testId="start-train"
          title={S.start.train}
          desc={S.start.trainDesc}
          icon={<TrainFront />}
          onClick={act.newTrain}
        />
        <Card
          testId="start-open"
          title={S.start.open}
          desc={S.start.openDesc}
          icon={<FolderOpen />}
          onClick={() => {
            setEditor({ startOpen: false });
            void pickAndOpen();
          }}
        />
      </div>
      <Samples ids={SAMPLE_IDS} label={S.start.samples} testId="samples" />
      <Samples ids={TRAIN_SAMPLE_IDS} label={S.start.trainSamples} testId="train-samples" />
    </div>
  );
}

export function StartDialog() {
  const open = useEditor((s) => s.startOpen);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setEditor({ startOpen: o })}
      title={S.start.title}
      description={S.start.desc}
      size="xl"
    >
      {open ? <Body /> : null}
    </Dialog>
  );
}
