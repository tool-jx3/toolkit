/**
 * 匯出（規格 F42～F52）：格式（WebP／APNG／影片）、尺寸、背景（透明／單色）、播放（重複／一次）、容量的預估；
 * 匯出選取的一人、全員 ZIP、CCFOLIA 房間 ZIP；進度、取消、結果訊息。
 */
import { Download, FolderArchive, Square, Users } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import { formatBytes } from '@/core/files';
import { Button, ColorField, Field, Notice, ProgressBar, Section, Segmented } from '@/ui';
import { cancelExport, exportAll, exportRoom, exportSelected } from './actions';
import { CUTIN_LIMIT, estimateShot, loadShotFonts } from './exporter';
import { type Doc, type OutSettings, rivalActor } from './model';
import { batchEntries } from './names';
import { previewHero, shotOf } from './shot';
import { assets, update, useDoc, usePrefs, useUi } from './store';
import { S } from './strings';

const setOut = (fn: (o: OutSettings) => void): void =>
  update((d) => {
    fn(d.out);
  });

/** 容量的預估：設定停下來約 0.7 秒後算一次（匯出中不算） */
function useEstimate(d: Doc, selected: string | null) {
  const hero = previewHero(d, selected);
  const rival = d.kind === 'versus' ? rivalActor(d) : null;
  const ids = [hero?.image, rival?.image].filter((x): x is string => !!x);
  const { bitmaps, pending } = useAssetBitmaps(assets, ids);
  const busy = useUi((u) => !!u.busy);
  const key = JSON.stringify([
    d.out,
    d.kind,
    d.styles[d.kind],
    d.impactText,
    d.mysteryName,
    hero,
    rival,
    pending,
    d.actors.length,
  ]);
  const run = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已經包含會影響大小的設定
  useEffect(() => {
    const id = ++run.current;
    if (!hero || pending || busy) {
      useUi.setState({ estimate: null });
      return;
    }
    useUi.setState({ estimate: S.estimating });
    const timer = setTimeout(async () => {
      try {
        const shot = shotOf(d, hero, bitmaps);
        await loadShotFonts(shot);
        const r = await estimateShot(shot, d.out);
        if (id !== run.current) return;
        const n = batchEntries(d).length;
        const one = r.capped ? S.estimateCapped : S.about(formatBytes(r.bytes));
        const all = n > 1 ? formatBytes((r.capped ? CUTIN_LIMIT : r.bytes) * n) : null;
        useUi.setState({ estimate: S.estimate(one, all) });
      } catch {
        if (id === run.current) useUi.setState({ estimate: null });
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [key, busy]);
}

export function ExportSection() {
  const d = useDoc((s) => s.data);
  const selected = usePrefs((s) => s.data.selected);
  const busy = useUi((u) => u.busy);
  const status = useUi((u) => u.status);
  const estimate = useUi((u) => u.estimate);
  useEstimate(d, selected);
  const o = d.out;
  const video = o.format === 'video';
  const n = d.actors.length;
  const none = !n;
  return (
    <Section title={S.exportTitle} persistKey="char-cutin:export">
      <Field label={S.fFormat} hint={S.formatNote[o.format]}>
        <Segmented
          value={o.format}
          onValueChange={(v) =>
            setOut((x) => {
              x.format = v as OutSettings['format'];
            })
          }
          options={(['webp', 'apng', 'video'] as const).map((f) => ({
            value: f,
            label: S.formats[f],
          }))}
        />
      </Field>
      {video ? (
        <Field label={S.fSize}>
          <Segmented
            value={o.videoSize}
            onValueChange={(v) =>
              setOut((x) => {
                x.videoSize = v as OutSettings['videoSize'];
              })
            }
            options={(['720', '1080'] as const).map((s) => ({ value: s, label: S.videoSizes[s] }))}
          />
        </Field>
      ) : (
        <Field label={S.fSize} hint={S.sizeNote[o.size]}>
          <Segmented
            value={o.size}
            onValueChange={(v) =>
              setOut((x) => {
                x.size = v as OutSettings['size'];
              })
            }
            options={(['small', 'large'] as const).map((s) => ({ value: s, label: S.sizes[s] }))}
          />
        </Field>
      )}
      <Field label={S.fBackground}>
        <Segmented
          value={video ? 'color' : o.background}
          onValueChange={(v) =>
            setOut((x) => {
              x.background = v as OutSettings['background'];
            })
          }
          options={[
            { value: 'clear', label: S.backgrounds.clear, disabled: video },
            { value: 'color', label: S.backgrounds.color },
          ]}
        />
      </Field>
      {video || o.background === 'color' ? (
        <Field label={S.fBackgroundColor}>
          <ColorField
            value={o.color}
            onChange={(v) =>
              setOut((x) => {
                x.color = v.slice(0, 7).toLowerCase();
              })
            }
          />
        </Field>
      ) : null}
      <Field
        label={S.fPlay}
        hint={video ? S.videoNoLoop : o.once ? S.playNote.once : S.playNote.loop}
      >
        <Segmented
          value={video ? 'once' : o.once ? 'once' : 'loop'}
          onValueChange={(v) =>
            setOut((x) => {
              x.once = v === 'once';
            })
          }
          options={[
            { value: 'loop', label: S.plays.loop, disabled: video },
            { value: 'once', label: S.plays.once, disabled: video },
          ]}
        />
      </Field>
      {estimate ? (
        <p className="m-0 text-sm text-muted" data-testid="estimate" role="status">
          {estimate}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          disabled={none || !!busy}
          onClick={() => void exportSelected()}
        >
          {S.exportOne}
        </Button>
        <Button icon={<Users />} disabled={n < 2 || !!busy} onClick={() => void exportAll()}>
          {S.exportAll(n)}
        </Button>
        <Button
          icon={<FolderArchive />}
          disabled={none || !!busy || video}
          onClick={() => void exportRoom()}
          title={video ? S.roomNoVideo : undefined}
        >
          {S.exportRoom}
        </Button>
        <p className="m-0 text-xs text-muted">{video ? S.roomNoVideo : S.exportRoomHint}</p>
      </div>
      {busy ? (
        <div className="flex items-center gap-2" data-testid="export-busy">
          <div className="min-w-0 flex-1">
            <p className="m-0 mb-1 text-sm">{busy.label}</p>
            <ProgressBar value={busy.ratio} label={busy.label} />
          </div>
          <Button size="sm" icon={<Square />} onClick={cancelExport}>
            {S.cancel}
          </Button>
        </div>
      ) : null}
      {status ? (
        <Notice key={status.seq} tone={status.tone}>
          <span data-testid="export-status">{status.text}</span>
        </Notice>
      ) : null}
    </Section>
  );
}
