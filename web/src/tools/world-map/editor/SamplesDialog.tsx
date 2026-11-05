/**
 * 範本與自動產生：三張範本（縮圖）、空白的海、自動產生世界。換上之後可以復原。
 */
import { Plus, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { Dialog, Field, Segmented } from '@/ui';
import { docThumbUrl } from '../draw/thumbs';
import { SAMPLE_IDS, sampleDoc } from '../model/samples';
import { MAP_SIZE_IDS } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { setEditor, useEditor, usePrefs } from './store';

function Card({
  title,
  desc,
  image,
  icon,
  onClick,
  testId,
}: {
  title: string;
  desc: string;
  image?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface text-left hover:border-accent focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
    >
      {image ? (
        <img src={image} alt="" className="aspect-[1536/960] w-full object-cover" />
      ) : (
        <span className="flex aspect-[1536/960] w-full items-center justify-center bg-surface-2 text-muted [&_svg]:size-8">
          {icon}
        </span>
      )}
      <span className="flex flex-col gap-0.5 p-2">
        <b className="text-sm">{title}</b>
        <small className="text-xs text-muted">{desc}</small>
      </span>
    </button>
  );
}

function Cards() {
  const size = usePrefs((s) => s.data.mapSize);
  const thumbs = useMemo(
    () => SAMPLE_IDS.map((id) => docThumbUrl(sampleDoc(id), 320, `sample:${id}`)),
    [],
  );
  return (
    <div className="flex flex-col gap-3">
      <Field label={S.samples.size} hint={S.samples.sizeHint}>
        <Segmented
          size="sm"
          columns={2}
          value={size}
          onValueChange={(v) => usePrefs.getState().patch({ mapSize: v })}
          options={MAP_SIZE_IDS.map((v) => ({ value: v, label: S.samples.sizes[v] }))}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="samples">
        {SAMPLE_IDS.map((id, i) => (
          <Card
            key={id}
            testId={`sample-${id}`}
            title={S.samples.items[id].name}
            desc={S.samples.items[id].desc}
            image={thumbs[i]}
            onClick={() => act.applySample(id)}
          />
        ))}
        <Card
          testId="sample-blank"
          title={S.samples.blank}
          desc={S.samples.blankDesc}
          icon={<Plus />}
          onClick={() => act.newBlank(size)}
        />
        <Card
          testId="sample-generate"
          title={S.samples.generate}
          desc={S.samples.generateDesc}
          icon={<Sparkles />}
          onClick={() => {
            setEditor({ samplesOpen: false });
            act.generate(Math.random, size);
          }}
        />
      </div>
    </div>
  );
}

export function SamplesDialog() {
  const open = useEditor((s) => s.samplesOpen);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setEditor({ samplesOpen: o })}
      title={S.samples.title}
      description={S.samples.desc}
      size="xl"
    >
      {open ? <Cards /> : null}
    </Dialog>
  );
}
