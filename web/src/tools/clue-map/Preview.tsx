/**
 * 預覽欄：編輯／試玩切換、工具（選取／畫矩形／畫橢圓）、編輯舞台或遊玩畫面、輸出（互動 HTML、分享連結、總覽 PNG）。
 */
import { Circle, Code2, Download, MousePointer2, Share2, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import { downloadBlob, safeFileName } from '@/core/files';
import { Button, Notice, Segmented, useToast } from '@/ui';
import { HtmlDialog, isShareTooLong, ShareDialog } from './Dialogs';
import { refsOf, usePreviewSources } from './images';
import { playConfig } from './markup';
import { imageKey, sceneAspect, usesUploadedImages } from './model';
import { PlayView } from './PlayView';
import { estimateOverview, outputScale, renderOverviewPng } from './render';
import { StageEditor } from './StageEditor';
import {
  clueNow,
  type Mode,
  type OverviewScale,
  setTool,
  type Tool,
  useClue,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

function OutputSection() {
  const toast = useToast();
  const d = useClue((s) => s.data);
  const scale = usePrefs((s) => s.data.scale);
  const [htmlOpen, setHtmlOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const shareBlock = usesUploadedImages(d)
    ? S.shareUploaded
    : isShareTooLong(d)
      ? S.shareTooLong
      : null;

  /* 輸出尺寸的預估（還沒讀圖片：場景用比例推算） */
  const est = useMemo(() => estimateOverview(d), [d]);
  const s = outputScale(est.width, est.height, scale);
  const width = Math.max(1, Math.round(est.width * s));
  const height = Math.max(1, Math.round(est.height * s));

  const download = async () => {
    setBusy(true);
    try {
      const now = clueNow();
      const want = usePrefs.getState().data.scale;
      const r = await renderOverviewPng(now, want);
      const t = safeFileName(now.title.trim(), { fallback: '', maxLength: 40 });
      const name = t
        ? `${S.fileBase}_${t}_${S.fileOverview}.png`
        : `${S.fileBase}_${S.fileOverview}.png`;
      downloadBlob(r.blob, name);
      toast({ title: S.overviewDone(name), tone: 'success' });
      if (r.scale < want - 1e-6)
        toast({ title: S.overviewReduced(r.scale.toFixed(2)), tone: 'warning' });
      if (r.missing) toast({ title: S.overviewImageFailed, tone: 'warning' });
    } catch {
      toast({ title: S.overviewFailed, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="cm-output"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <h2 id="cm-output" className="m-0 text-sm font-semibold">
        {S.outputTitle}
      </h2>
      <p className="m-0 text-xs text-muted">{S.outputHint}</p>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Code2 />} onClick={() => setHtmlOpen(true)} data-testid="export-html">
          {S.exportHtml}
        </Button>
        <Button
          icon={<Share2 />}
          disabled={!!shareBlock}
          onClick={() => setShareOpen(true)}
          data-testid="export-share"
        >
          {S.shareLink}
        </Button>
      </div>
      {shareBlock ? (
        <p className="m-0 text-xs text-muted" data-testid="share-blocked">
          {shareBlock}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2" data-testid="export-bar">
        <Button
          variant="primary"
          icon={<Download />}
          loading={busy}
          disabled={busy}
          onClick={() => void download()}
          data-testid="download-overview"
        >
          {S.downloadOverview}
        </Button>
        <Segmented<'1' | '2'>
          aria-label={S.overviewScale}
          size="sm"
          value={String(scale) as '1' | '2'}
          onValueChange={(v) => usePrefs.getState().patch({ scale: Number(v) as OverviewScale })}
          options={[
            { value: '1', label: '1×', ariaLabel: S.overviewScaleAria(1) },
            { value: '2', label: '2×', ariaLabel: S.overviewScaleAria(2) },
          ]}
        />
        <span className="ml-auto text-sm tabular-nums text-muted" data-testid="overview-size">
          {S.overviewSize(width, height)}
        </span>
      </div>
      <HtmlDialog open={htmlOpen} onOpenChange={setHtmlOpen} data={d} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} data={d} />
    </section>
  );
}

export function PreviewArea() {
  const d = useClue((s) => s.data);
  const mode = useUi((s) => s.mode);
  const tool = useUi((s) => s.tool);
  const measured = useUi((s) => s.measured);

  const refKey = refsOf(d).map(imageKey).join('\n');
  // biome-ignore lint/correctness/useExhaustiveDependencies: refKey 代表用到的圖片
  const refs = useMemo(() => refsOf(d), [refKey]);
  const { srcOf, pending, missing } = usePreviewSources(refs);
  const aspect = sceneAspect(
    d.scene,
    d.scene.kind === 'url' && measured?.key === d.scene.url ? measured : null,
  );

  /* 試玩：設定一變（或切回試玩）就重新掛載；進度放在工具的狀態裡帶回去 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: mode 只用來在切回試玩時重算，帶回最新的進度
  const config = useMemo(() => {
    const u = useUi.getState();
    return playConfig(d, srcOf, {
      initialFound: u.found,
      initialReveal: u.revealing,
      initialOpen: u.open,
    });
  }, [d, srcOf, mode]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented<Mode>
          aria-label={S.modeLabel}
          value={mode}
          onValueChange={(m) => useUi.setState({ mode: m })}
          options={[
            { value: 'edit', label: S.modeEdit },
            { value: 'play', label: S.modePlay },
          ]}
        />
        {mode === 'edit' ? (
          <Segmented<Tool>
            aria-label={S.stage.toolsLabel}
            value={tool}
            onValueChange={setTool}
            options={[
              { value: 'select', label: S.stage.toolSelect, icon: <MousePointer2 /> },
              { value: 'rect', label: S.stage.toolRect, icon: <Square /> },
              { value: 'ellipse', label: S.stage.toolEllipse, icon: <Circle /> },
            ]}
          />
        ) : null}
      </div>
      {mode === 'edit' ? (
        <>
          <StageEditor
            src={srcOf(d.scene)}
            aspect={aspect}
            look={d.look}
            spots={d.spots}
            onImageSize={(width, height) => {
              if (d.scene.kind === 'url')
                useUi.setState({ measured: { key: d.scene.url, width, height } });
            }}
          />
          <p className="m-0 text-xs text-muted" data-testid="stage-hint">
            {tool === 'select' ? S.stage.hint : S.stage.drawHint}
          </p>
        </>
      ) : (
        <>
          <p className="m-0 text-xs text-muted">{S.playLead}</p>
          <PlayView
            config={config}
            hooks={{
              onChange: (s) =>
                useUi.setState({ found: s.found, revealing: s.revealing, open: s.open }),
            }}
          />
        </>
      )}
      {missing ? <Notice tone="warning">{S.imageMissing(missing)}</Notice> : null}
      {pending ? <Notice tone="progress">{S.imagesLoading}</Notice> : null}
      <OutputSection />
    </div>
  );
}
