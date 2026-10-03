/**
 * 設定欄：影片（換影片、範例影片、資訊）、裁切、尺寸與速度、逐格檢視、格式比較；還沒載入影片時的整頁載入區。
 */
import { Crop, Film, Images, Sparkles } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  Button,
  CropDialog,
  Field,
  FileDrop,
  Section,
  Segmented,
  Select,
  ThumbnailList,
  Toggle,
} from '@/ui';
import {
  loadSample,
  loadVideoFile,
  makeThumbnails,
  previewFrameBitmap,
  setCropOn,
  setCropPixels,
} from './actions';
import { cropPixels, outputSize, SCALE_CHOICES, SPEED_CHOICES, sourceRect } from './logic';
import { patchSettings, useSession, useSettings } from './store';
import { S } from './strings';

/** 選檔視窗列的類型（拖放時另外依副檔名判斷，見 isVideoFile） */
export const VIDEO_ACCEPT = 'video/*,.mp4,.m4v,.webm,.mov,.mkv,.ogv,.avi';

/* ---------- 還沒載入影片：整頁的載入區 ---------- */

export function Landing() {
  const loading = useSession((s) => s.loading);
  const sampling = useSession((s) => s.sampling);
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 py-2">
      <FileDrop
        onFiles={(files) => {
          if (files[0]) void loadVideoFile(files[0]);
        }}
        accept={VIDEO_ACCEPT}
        filterByAccept={false}
        paste="off"
        clickable
        icon={<Film />}
        label={S.dropLabel}
        buttonLabel={S.dropButton}
        hint={S.dropHint}
        disabled={loading}
        className="min-h-56 justify-center py-10"
        aria-label={S.dropLabel}
      />
      <ul className="m-0 flex list-none flex-wrap justify-center gap-2 p-0 text-xs text-muted">
        {S.dropBadges.map((b) => (
          <li key={b} className="rounded-full border border-border bg-surface-2 px-2.5 py-1">
            {b}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          icon={<Sparkles />}
          onClick={() => void loadSample()}
          loading={sampling}
          disabled={sampling || loading}
        >
          {S.sampleButton}
        </Button>
        <span className="text-xs text-muted">{loading ? S.loading : S.sampleHint}</span>
      </div>
      <FormatGuide />
    </div>
  );
}

/* ---------- 影片 ---------- */

export function VideoPanel() {
  const video = useSession((s) => s.video);
  const loading = useSession((s) => s.loading);
  const sampling = useSession((s) => s.sampling);
  const exporting = useSession((s) => s.exporting);
  return (
    <Section title={S.videoSection} fixed>
      <FileDrop
        compact
        onFiles={(files) => {
          if (files[0]) void loadVideoFile(files[0]);
        }}
        accept={VIDEO_ACCEPT}
        filterByAccept={false}
        paste="off"
        clickable
        icon={<Film />}
        label={S.replaceLabel}
        buttonLabel={S.dropButton}
        disabled={loading || exporting}
        aria-label={S.replaceLabel}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<Sparkles />}
          onClick={() => void loadSample()}
          loading={sampling}
          disabled={sampling || loading || exporting}
        >
          {S.sampleButton}
        </Button>
        {loading ? <span className="text-xs text-muted">{S.loading}</span> : null}
      </div>
      <p className="m-0 flex min-w-0 flex-col text-sm" data-testid="video-info">
        {video ? (
          <>
            <span className="truncate font-medium text-fg" title={video.name}>
              {video.name}
            </span>
            <span className="text-muted tabular-nums" data-testid="video-dims">
              {S.videoInfo(video.width, video.height, video.duration)}
            </span>
          </>
        ) : (
          <span className="text-muted">{S.noVideo}</span>
        )}
      </p>
    </Section>
  );
}

/* ---------- 裁切 ---------- */

export function CropPanel() {
  const video = useSession((s) => s.video);
  const cropOn = useSession((s) => s.cropOn);
  const crop = useSession((s) => s.crop);
  const exporting = useSession((s) => s.exporting);
  const [dialog, setDialog] = useState<ImageBitmap | null>(null);
  if (!video) return null;
  const px = cropPixels(crop, video.width, video.height);
  const openDialog = async () => {
    const bmp = await previewFrameBitmap();
    if (bmp) setDialog(bmp);
  };
  return (
    <Section title={S.cropToggle} persistKey="video-anim:crop">
      <Field label={S.cropToggle} layout="inline" hint={cropOn ? S.cropOnHint : S.cropOffHint}>
        <Toggle checked={cropOn} onCheckedChange={setCropOn} disabled={exporting} />
      </Field>
      {cropOn ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs text-muted tabular-nums" data-testid="crop-info">
            {S.cropInfo(px.x, px.y, px.width, px.height)}
          </p>
          <Button
            size="sm"
            icon={<Crop />}
            className="self-start"
            onClick={() => void openDialog()}
            disabled={exporting}
          >
            {S.cropAdjust}
          </Button>
        </div>
      ) : null}
      <CropDialog
        open={!!dialog}
        onOpenChange={(o) => {
          if (!o) {
            dialog?.close();
            setDialog(null);
          }
        }}
        image={dialog}
        title={S.cropDialogTitle}
        initialRect={px}
        freeDraw
        onConfirm={(r) => {
          setCropPixels(r);
          dialog?.close();
          setDialog(null);
        }}
      />
    </Section>
  );
}

/* ---------- 尺寸與速度 ---------- */

export function SizePanel() {
  const video = useSession((s) => s.video);
  const cropOn = useSession((s) => s.cropOn);
  const crop = useSession((s) => s.crop);
  const exporting = useSession((s) => s.exporting);
  const scale = useSettings((s) => s.data.scale);
  const speed = useSettings((s) => s.data.speed);
  if (!video) return null;
  const src = sourceRect(video, cropOn ? crop : null);
  const out = outputSize(src, scale);
  return (
    <Section title={`${S.scaleLabel}・${S.speedLabel}`} persistKey="video-anim:size">
      <Field label={S.scaleLabel} hint={S.scaleHint}>
        <Select
          value={String(scale)}
          onValueChange={(v) => patchSettings({ scale: Number(v) })}
          options={SCALE_CHOICES.map((k) => {
            const o = outputSize(src, k);
            return {
              value: String(k),
              label: S.scaleOption(Math.round(k * 100), o.width, o.height),
            };
          })}
          disabled={exporting}
        />
      </Field>
      <p className="m-0 text-xs text-muted tabular-nums" data-testid="output-size">
        {S.outputSize(out.width, out.height)}
      </p>
      <Field label={S.speedLabel} hint={S.speedHint}>
        <Segmented
          value={String(speed)}
          onValueChange={(v) => patchSettings({ speed: Number(v) })}
          options={SPEED_CHOICES.map((v) => ({ value: String(v), label: S.speedOption(v) }))}
          fullWidth
          disabled={exporting}
        />
      </Field>
    </Section>
  );
}

/* ---------- 逐格檢視 ---------- */

export function FramesPanel() {
  const video = useSession((s) => s.video);
  const thumbs = useSession((s) => s.thumbs);
  const busy = useSession((s) => s.thumbsBusy);
  const exporting = useSession((s) => s.exporting);
  if (!video) return null;
  const done = busy ? 0 : (thumbs?.length ?? 0);
  return (
    <Section
      title={S.framesSection}
      defaultOpen={false}
      actions={
        <span
          className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted tabular-nums"
          data-testid="frames-badge"
        >
          {S.framesBadge(done)}
        </span>
      }
    >
      <p className="m-0 text-xs text-muted">{S.framesNote}</p>
      <Button
        size="sm"
        icon={<Images />}
        className="self-start"
        onClick={() => void makeThumbnails()}
        loading={busy}
        disabled={busy || exporting}
      >
        {S.framesButton}
      </Button>
      {busy ? (
        <p className="m-0 text-xs text-accent" role="status">
          {S.framesBuilding}
        </p>
      ) : null}
      <ThumbnailList
        aria-label={S.framesAria}
        items={(thumbs ?? []).map((t, i) => ({
          id: String(i),
          name: S.framesTime(t.time),
          image: t.canvas,
        }))}
        thumbAspect={video.width / video.height}
        thumbFit="contain"
        minItemWidth={96}
        empty={<p className="m-0 py-4 text-center text-xs text-muted">{S.framesEmpty}</p>}
      />
    </Section>
  );
}

/* ---------- 格式比較 ---------- */

/**
 * 三種格式的比較。區塊夠寬（≥ 36rem，例如還沒載入影片時的整頁）是一張表；窄的時候（設定欄、手機）
 * 改成每種格式一張卡，所有欄位都看得到、不用橫向捲動。
 */
export function FormatGuide() {
  const formats = S.guideHead.slice(1);
  return (
    <Section title={S.guideSection} defaultOpen={false} persistKey="video-anim:guide">
      <div className="@container min-w-0">
        <table className="hidden w-full border-collapse text-left text-xs @xl:table">
          <thead>
            <tr className="border-b border-border text-muted">
              {S.guideHead.map((h) => (
                <th key={h || 'feature'} scope="col" className="px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {S.guideRows.map(([head, ...cells]) => (
              <tr key={head} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-2 py-1.5 font-medium text-fg">
                  {head}
                </th>
                {cells.map((c, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 固定的表格，欄位順序不變
                  <td key={i} className="px-2 py-1.5 text-muted">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 @xl:hidden" data-testid="guide-cards">
          {formats.map((name, i) => (
            <li key={name} className="rounded-md border border-border bg-surface-2 px-3 py-2">
              <h4 className="m-0 mb-1.5 text-sm font-semibold text-fg">{name}</h4>
              <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                {S.guideRows.map(([head, ...cells]) => (
                  <Fragment key={head}>
                    <dt className="font-medium text-fg">{head}</dt>
                    <dd className="m-0 text-muted">{cells[i]}</dd>
                  </Fragment>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
      <p className="m-0 text-xs text-muted">{S.guideNote}</p>
    </Section>
  );
}
