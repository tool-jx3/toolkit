/**
 * 圖層清單（規格 1.11）：上面在後、下面在前；縮圖、原名、角色；顯示／隱藏、拖曳或按鈕調整順序、
 * 展開調整濃度與深度、滑過時在預覽上標出範圍、重設圖層設定。
 * see-through 的深度（規格 1.15）：加入深度 PSD、開關、強度、對應的結果。
 */
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
} from 'lucide-react';
import { useContext, useState } from 'react';
import { historyGesture } from '@/core/storage';
import { Button, Field, IconButton, Slider, SortableList, ThumbnailImage, Toggle } from '@/ui';
import {
  depthMapOf,
  moveLayer,
  pickDepthFiles,
  removeSeeThrough,
  resetLayers,
  setLayer,
  setSeeThroughOn,
  setSeeThroughStrength,
} from './actions';
import type { LayerSetting } from './runtime';
import { hit, SearchCtx } from './search';
import { type LayerInfo, type ModelInfo, useEdit, useSession } from './store';
import { S } from './strings';

const g = historyGesture(useEdit);

/** 角色的說明：部位、左右、髮束、自動產生（規格 F70） */
export function layerRole(info: LayerInfo): string {
  const parts: string[] = [];
  const role = S.roles[info.bn];
  parts.push(role ?? (info.unknown ? S.unknown(info.group) : info.bn));
  if (info.side) parts.push(info.side === 'L' ? S.sideL : S.sideR);
  if (info.strands)
    parts.push(info.phys === 'sway' ? S.sway(info.strands) : S.strands(info.strands));
  if (info.synthetic) parts.push(S.synthetic);
  return parts.join(' · ');
}

function LayerRow({
  setting,
  info,
  index,
  count,
  depthNote,
}: {
  setting: LayerSetting;
  info: LayerInfo;
  index: number;
  count: number;
  /** see-through 的深度（有時） */
  depthNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const name = info.source || info.name;
  const title = info.source && info.source !== info.name ? `${info.source} → ${info.name}` : name;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 滑過時在預覽上標出範圍（只是提示）
    <div
      className={`flex flex-col gap-2 px-2 py-1.5 ${setting.visible ? '' : 'opacity-55'}`}
      data-layer={info.id}
      onMouseEnter={() => useSession.setState({ highlight: info.id })}
      onMouseLeave={() => {
        if (useSession.getState().highlight === info.id) useSession.setState({ highlight: null });
      }}
    >
      <div className="flex items-center gap-2">
        <span
          data-drag-handle
          aria-hidden
          className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
        >
          <GripVertical />
        </span>
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2 checker">
          {info.thumb ? <ThumbnailImage source={info.thumb} /> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-fg" title={title}>
            {name}
          </span>
          <span className={`truncate text-xs ${info.unknown ? 'text-warning' : 'text-muted'}`}>
            {layerRole(info)}
          </span>
        </div>
        <div className="flex shrink-0">
          <IconButton
            size="sm"
            label={`${S.layerBack}：${name}`}
            icon={<ArrowUp />}
            disabled={index === 0}
            onClick={() => moveLayer(index, index - 1)}
          />
          <IconButton
            size="sm"
            label={`${S.layerFront}：${name}`}
            icon={<ArrowDown />}
            disabled={index === count - 1}
            onClick={() => moveLayer(index, index + 1)}
          />
          <IconButton
            size="sm"
            label={S.layerShow(name)}
            icon={setting.visible ? <Eye /> : <EyeOff />}
            pressed={setting.visible}
            onClick={() => setLayer(info.id, { visible: !setting.visible })}
          />
          <IconButton
            size="sm"
            label={S.layerDetails(name)}
            icon={open ? <ChevronDown /> : <ChevronRight />}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          />
        </div>
      </div>
      {open ? (
        <div className="flex flex-col gap-2 pl-7" data-no-drag>
          <Field label={S.layerOpacity}>
            <Slider
              aria-label={`${name}的${S.layerOpacity}`}
              value={setting.opacity}
              onChange={g.live((v: number) => setLayer(info.id, { opacity: v }))}
              onCommit={g.commit}
              min={0}
              max={1}
              step={0.01}
              precision={2}
            />
          </Field>
          <Field label={S.layerDepth}>
            <Slider
              aria-label={`${name}的${S.layerDepth}`}
              value={setting.depth}
              onChange={g.live((v: number) => setLayer(info.id, { depth: v }))}
              onCommit={g.commit}
              min={0}
              max={2}
              step={0.01}
              precision={2}
            />
          </Field>
          {depthNote ? <p className="m-0 text-xs text-muted">{depthNote}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** 深度區塊裡可以搜尋的文字 */
export const DEPTH_TEXTS = [
  S.depth.title,
  S.depth.add,
  S.depth.on,
  S.depth.strength,
  'see-through',
];

/** see-through 的深度（規格 F103～F105） */
function DepthPanel({ model }: { model: ModelInfo }) {
  const st = useEdit((s) => s.data.seeThrough);
  const report = useSession((s) => s.depthReport);
  const busy = useSession((s) => s.depthBusy);
  const map = st ? depthMapOf(model, st) : null;
  const n = st ? Object.keys(st.values).length : 0;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border p-2"
      data-testid="depth-panel"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fg">{S.depth.title}</span>
        <span className="text-xs text-muted">{S.depth.hint}</span>
      </div>
      {st ? (
        <p className="m-0 text-xs text-fg" data-testid="depth-summary">
          {report
            ? S.depth.summary(report.file, report.matched, report.total)
            : S.depth.restored(n)}
          {map?.scale != null && map.face != null ? (
            <>
              <br />
              <span className="text-muted">{S.depth.scale(map.scale, map.face)}</span>
            </>
          ) : null}
        </p>
      ) : (
        <p className="m-0 text-xs text-muted">{S.depth.none}</p>
      )}
      {report?.error ? <p className="m-0 text-xs text-warning">{report.error}</p> : null}
      {report?.issues.map((i) => (
        <p key={i.code} className="m-0 text-xs text-warning" data-depth-issue={i.code}>
          {S.depth.issue(i)}
        </p>
      ))}
      {map?.reason ? (
        <p className="m-0 text-xs text-warning" data-depth-issue={map.reason}>
          {S.depth.mapFailed(S.depth.reasons[map.reason])}
        </p>
      ) : null}
      {st ? (
        <>
          <Field label={S.depth.on} layout="inline" hint={S.depth.onHint}>
            <Toggle checked={st.on} onCheckedChange={setSeeThroughOn} />
          </Field>
          <Field label={S.depth.strength} hint={S.depth.strengthHint}>
            <Slider
              aria-label={S.depth.strength}
              value={st.strength}
              disabled={!st.on}
              onChange={g.live((v: number) => setSeeThroughStrength(v))}
              onCommit={g.commit}
              min={0}
              max={1}
              step={0.05}
              precision={2}
            />
          </Field>
        </>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void pickDepthFiles()}>
          {S.depth.add}
        </Button>
        {st ? (
          <Button size="sm" variant="secondary" onClick={removeSeeThrough}>
            {S.depth.remove}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function LayersPanel() {
  const model = useSession((s) => s.model);
  const layers = useEdit((s) => s.data.layers);
  const st = useEdit((s) => s.data.seeThrough);
  const { q, all } = useContext(SearchCtx);
  if (!model) return <p className="m-0 text-sm text-muted">{S.layersEmpty}</p>;
  const mapped = st ? depthMapOf(model, st).mapped : null;
  const depthNote = (info: LayerInfo) => {
    const v = st?.values[info.id];
    return v === undefined
      ? undefined
      : S.depth.layerValue(v, mapped?.[info.id], info.defaultDepth);
  };
  const infoById = new Map(model.layers.map((l) => [l.id, l]));
  const matches = (info: LayerInfo) =>
    !q || all || [info.source, info.name, layerRole(info)].some((t) => t.toLowerCase().includes(q));
  const items = layers.filter((l) => {
    const info = infoById.get(l.id);
    return info && matches(info);
  });
  const filtered = items.length !== layers.length;
  const showDepth = !q || all || hit(q, ...DEPTH_TEXTS);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button size="sm" variant="secondary" onClick={resetLayers}>
          {S.layersReset}
        </Button>
      </div>
      {showDepth ? <DepthPanel model={model} /> : null}
      <SortableList<LayerSetting>
        aria-label={S.layersAria}
        items={items}
        getId={(l) => l.id}
        handleOnly
        sortDisabled={filtered}
        onMoveStart={() => useEdit.beginGesture()}
        onMoveEnd={() => useEdit.endGesture()}
        onMove={(from, to) => moveLayer(from, to)}
        renderItem={(l, { index }) => (
          <LayerRow
            setting={l}
            info={infoById.get(l.id) as LayerInfo}
            index={filtered ? layers.indexOf(l) : index}
            count={layers.length}
            depthNote={depthNote(infoById.get(l.id) as LayerInfo)}
          />
        )}
      />
    </div>
  );
}
