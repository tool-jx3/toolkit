/**
 * 圖層清單（規格 1.11）：上面在後、下面在前；縮圖、原名、角色；顯示／隱藏、拖曳或按鈕調整順序、
 * 展開調整濃度與深度、滑過時在預覽上標出範圍、重設圖層設定。
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
import { Button, Field, IconButton, Slider, SortableList, ThumbnailImage } from '@/ui';
import { moveLayer, resetLayers, setLayer } from './actions';
import type { LayerSetting } from './runtime';
import { SearchCtx } from './search';
import { type LayerInfo, useEdit, useSession } from './store';
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
}: {
  setting: LayerSetting;
  info: LayerInfo;
  index: number;
  count: number;
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
        </div>
      ) : null}
    </div>
  );
}

export function LayersPanel() {
  const model = useSession((s) => s.model);
  const layers = useEdit((s) => s.data.layers);
  const { q, all } = useContext(SearchCtx);
  if (!model) return <p className="m-0 text-sm text-muted">{S.layersEmpty}</p>;
  const infoById = new Map(model.layers.map((l) => [l.id, l]));
  const matches = (info: LayerInfo) =>
    !q || all || [info.source, info.name, layerRole(info)].some((t) => t.toLowerCase().includes(q));
  const items = layers.filter((l) => {
    const info = infoById.get(l.id);
    return info && matches(info);
  });
  const filtered = items.length !== layers.length;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button size="sm" variant="secondary" onClick={resetLayers}>
          {S.layersReset}
        </Button>
      </div>
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
          />
        )}
      />
    </div>
  );
}
