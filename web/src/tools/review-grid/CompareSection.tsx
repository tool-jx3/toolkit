/**
 * 比較多人的心得（規格 1.8）：選 2 個以上的檔案（本工具的專案檔、原作的資料備份）→ 依劇本名稱分組畫成一張圖 →
 * 對話框裡預覽、下載 PNG。
 */
import { Download, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { Button, Dialog, DialogClose, FileDrop, Section, useToast } from '@/ui';
import { type CompareStrings, groupByTitle } from './compare';
import { readComparePeople } from './compareFiles';
import { type RenderResult, renderComparePng } from './render';
import { usePrefs } from './store';
import { S } from './strings';

export const COMPARE_STRINGS: CompareStrings = {
  title: S.compareImageTitle,
  people: S.comparePeople,
  anonymous: S.anonymous,
};

interface Result extends RenderResult {
  url: string;
  people: number;
  groups: number;
}

export function CompareSection() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  const run = async (files: File[]) => {
    if (files.length < 2) {
      toast({ title: S.compareNeedTwo, tone: 'warning', replace: true });
      return;
    }
    setBusy(true);
    try {
      const { people, failed } = await readComparePeople(files);
      if (failed.length) toast({ title: S.compareFailed(failed.join('、')), tone: 'danger' });
      if (people.length < 2) {
        toast({ title: S.compareNotEnough, tone: 'warning' });
        return;
      }
      const groups = groupByTitle(people);
      if (!groups.length) {
        toast({ title: S.compareNoTitle, tone: 'warning' });
        return;
      }
      const r = await renderComparePng(
        people,
        groups,
        COMPARE_STRINGS,
        usePrefs.getState().data.scale,
      );
      setResult({
        ...r,
        url: URL.createObjectURL(r.blob),
        people: people.length,
        groups: groups.length,
      });
    } catch {
      toast({ title: S.compareRenderFailed, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title={S.sectionCompare}
      description={S.compareHint}
      defaultOpen={false}
      persistKey="review-grid:compare"
    >
      <FileDrop
        aria-label={S.compareAria}
        accept=".zip,.json,application/zip,application/json"
        multiple
        paste="off"
        compact
        icon={<Users />}
        label={busy ? S.compareReading : S.compareDrop}
        buttonLabel={S.compareChoose}
        disabled={busy}
        onFiles={(f) => void run(f)}
      />
      {result ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setResult(null);
          }}
          title={S.compareTitle}
          description={S.compareSummary(result.people, result.groups)}
          size="lg"
          footer={
            <>
              <DialogClose>{S.compareClose}</DialogClose>
              <Button
                variant="primary"
                icon={<Download />}
                onClick={() => {
                  const name = `${S.compareFile}.png`;
                  downloadBlob(result.blob, name);
                  toast({ title: S.downloadDone(name), tone: 'success' });
                }}
              >
                {S.compareDownload}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2" data-testid="compare-result">
            <p className="m-0 text-xs text-muted tabular-nums" data-testid="compare-size">
              {S.exportSize(result.width, result.height)}
            </p>
            <div className="checker max-h-[60dvh] overflow-auto rounded-md border border-border">
              <img src={result.url} alt={S.comparePreviewAlt} className="block h-auto w-full" />
            </div>
          </div>
        </Dialog>
      ) : null}
    </Section>
  );
}
