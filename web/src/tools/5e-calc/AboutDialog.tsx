/** 「關於規則內容」：用到的文件、署名（照原文）、授權與本站的翻譯修改 */
import { SRD_SOURCES, SRD_TRANSLATION_NOTE, type SrdSourceId } from '@/core/srd5/sources';
import { Dialog, DialogClose } from '@/ui';
import { S } from './strings';

const ORDER: readonly SrdSourceId[] = ['srd52', 'srd51', 'lgmrd'];

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.about.title}
      size="lg"
      footer={<DialogClose />}
    >
      <div className="flex flex-col gap-3 text-sm" data-testid="about-rules">
        <p className="m-0">{S.about.lead}</p>
        {ORDER.map((id) => {
          const src = SRD_SOURCES[id];
          return (
            <section
              key={id}
              className="rounded-md border border-border bg-surface-2 p-3"
              data-source={id}
            >
              <p className="m-0 font-semibold">
                <a
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  {src.name}
                </a>
                （
                <a
                  href={src.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  {src.license}
                </a>
                ）
              </p>
              <p className="m-0 mt-1 text-xs text-muted">{S.about.used[id]}</p>
              <p className="m-0 mt-1 font-mono text-xs leading-relaxed" lang="en">
                {src.attribution}
              </p>
            </section>
          );
        })}
        <p className="m-0 text-xs text-muted">{SRD_TRANSLATION_NOTE}</p>
        <p className="m-0 text-xs text-muted">{S.about.tool}</p>
      </div>
    </Dialog>
  );
}
