/**
 * 預覽欄（規格 1.3、1.5、1.6、1.8）：共用的圖片演出預覽欄（@/ui/imagefx 的 ImageFxPreview：編輯區的工具列、舞台、編輯層、
 * 播放列、「完成的樣子」與複製圖片）＋截圖演出自己的畫框工具列（放大框、螢光筆、塗黑、編輯輔助線）與匯出區。
 */
import { Highlighter, SquareDashed, ZoomIn } from 'lucide-react';
import type { Ref } from 'react';
import type { ImageSource } from '@/core/imagefx';
import { type ExportPanelHandle, Segmented, Toggle } from '@/ui';
import { type FxPlayerHandle, fxFrameName, ImageFxExportArea, ImageFxPreview } from '@/ui/imagefx';
import { exporter, finalPng } from './exporter';
import type { Frame, FrameKind, FxState } from './model';
import { KIT } from './render';
import { APNG_COLORS, docNow, fx, setPrefs, useDoc, useLive, usePrefs } from './store';
import { S } from './strings';

export type PlayerHandle = FxPlayerHandle;

const KIND_ICON: Record<FrameKind, React.ReactNode> = {
  zoom: <ZoomIn />,
  marker: <Highlighter />,
  redact: <SquareDashed />,
};

/** 輔助線的顏色（只在預覽） */
const GUIDE_COLOR: Record<FrameKind, string> = {
  zoom: '#38bdf8',
  marker: '#facc15',
  redact: '#fb7185',
};

/* ---------- 工具列 ---------- */

function ToolBar() {
  const tool = usePrefs((p) => p.data.tool);
  const guides = usePrefs((p) => p.data.guides);
  const hasImage = useDoc((s) => !!s.data.image);
  const camera = useLive((l) => l.cameraPreview);
  return (
    <div className="flex flex-col gap-1.5" data-testid="tool-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<FrameKind>
          aria-label={S.toolLabel}
          value={tool}
          onValueChange={(v) => setPrefs({ tool: v })}
          options={(['zoom', 'marker', 'redact'] as const).map((k) => ({
            value: k,
            label: S.kinds[k],
            icon: KIND_ICON[k],
          }))}
          disabled={!hasImage || camera}
        />
        <Toggle
          label={S.guides}
          checked={guides}
          onCheckedChange={(on) => setPrefs({ guides: on })}
        />
      </div>
      <p className="m-0 text-xs text-muted">
        {S.kindHints[tool]}。{S.toolHint}
      </p>
    </div>
  );
}

/* ---------- 匯出 ---------- */

function ExportArea({
  s,
  image,
  exportRef,
}: {
  s: FxState;
  image: ImageSource | null;
  exportRef: Ref<ExportPanelHandle>;
}) {
  const settings = usePrefs((p) => p.data.export);
  return (
    <ImageFxExportArea<Frame, FxState>
      s={s}
      image={image}
      kit={KIT}
      exporter={exporter}
      settings={settings}
      onSettingsChange={(next) => setPrefs({ export: next })}
      exportRef={exportRef}
      text={S}
      colorOptions={APNG_COLORS}
      current={docNow}
    />
  );
}

/* ---------- 預覽欄 ---------- */

export function Preview({
  playerRef,
  exportRef,
  onSample,
}: {
  playerRef: Ref<PlayerHandle>;
  exportRef: Ref<ExportPanelHandle>;
  onSample: (demo: boolean) => void;
}) {
  return (
    <ImageFxPreview<Frame, FxState>
      fx={fx}
      kit={KIT}
      text={S}
      playerRef={playerRef}
      onSample={onSample}
      toolbar={<ToolBar />}
      frameName={(f, frames) => fxFrameName(S.kinds, f, frames)}
      guideColor={(f) => GUIDE_COLOR[f.kind]}
      finalPng={finalPng}
      exportArea={({ s, image }) => <ExportArea s={s} image={image} exportRef={exportRef} />}
    />
  );
}
