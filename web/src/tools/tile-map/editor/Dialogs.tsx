/**
 * 小對話框：新地圖、地圖設定（大小與背景色）、整張移動會裁掉圖塊時的確認、圖形的大小、重新命名圖層。
 */
import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  ColorField,
  Dialog,
  DialogClose,
  Field,
  FieldRow,
  Notice,
  NumberInput,
  TextInput,
} from '@/ui';
import { LayerEdit } from '../model/edit';
import { countCropped, validSize } from '../model/map';
import { centeredBox } from '../model/shapes';
import { DEFAULT_SIZE, LIMITS } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { mapNow, setEditor, useEditor, useMap, usePrefs } from './store';
import { shapeLabel } from './ToolStrip';

const close = () => setEditor({ dialog: null });

export function NewMapDialog() {
  const open = useEditor((s) => s.dialog === 'new');
  const [name, setName] = useState(S.defaultMapName);
  const [w, setW] = useState<number>(DEFAULT_SIZE.width);
  const [h, setH] = useState<number>(DEFAULT_SIZE.height);
  useEffect(() => {
    if (open) {
      setName(S.defaultMapName);
      setW(DEFAULT_SIZE.width);
      setH(DEFAULT_SIZE.height);
    }
  }, [open]);
  const ok = validSize(w, h);
  const submit = () => {
    if (ok && act.newMap(name || S.defaultMapName, w, h)) close();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={S.newMap.title}
      description={S.newMap.desc}
      size="sm"
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button variant="primary" disabled={!ok} onClick={submit} data-testid="new-map-create">
            {S.newMap.create}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={S.newMap.name}>
          <TextInput
            value={name}
            maxLength={LIMITS.maxName}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.settings.width}>
            <NumberInput
              value={w}
              onChange={setW}
              min={LIMITS.minSide}
              max={LIMITS.maxSide}
              step={1}
              unit={S.settings.cells}
            />
          </Field>
          <Field label={S.settings.height}>
            <NumberInput
              value={h}
              onChange={setH}
              min={LIMITS.minSide}
              max={LIMITS.maxSide}
              step={1}
              unit={S.settings.cells}
            />
          </Field>
        </FieldRow>
        <p className={ok ? 'm-0 text-xs text-muted' : 'm-0 text-xs text-danger'}>
          {ok ? S.settings.sizeHint : S.settings.badSize}
        </p>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function MapSettingsDialog() {
  const open = useEditor((s) => s.dialog === 'settings');
  const map = useMap((s) => s.data);
  const [w, setW] = useState(map.width);
  const [h, setH] = useState(map.height);
  const [bg, setBg] = useState(map.background);
  const [crop, setCrop] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 打開時才帶入目前的值
  useEffect(() => {
    if (open) {
      setW(map.width);
      setH(map.height);
      setBg(map.background);
      setCrop(false);
    }
  }, [open]);
  const ok = validSize(w, h);
  const cropped = ok ? countCropped(map, w, h, 0, 0) : 0;
  const submit = () => {
    if (!ok || (cropped && !crop)) return;
    if (
      act.applySettings(w, h, bg.slice(0, 7).toLowerCase(), crop) ||
      (w === map.width && h === map.height)
    )
      close();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={S.settings.title}
      size="sm"
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button
            variant="primary"
            disabled={!ok || (cropped > 0 && !crop)}
            onClick={submit}
            data-testid="settings-apply"
          >
            {S.settings.apply}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FieldRow columns={2}>
          <Field label={S.settings.width}>
            <NumberInput
              value={w}
              onChange={setW}
              min={LIMITS.minSide}
              max={LIMITS.maxSide}
              step={1}
              unit={S.settings.cells}
            />
          </Field>
          <Field label={S.settings.height}>
            <NumberInput
              value={h}
              onChange={setH}
              min={LIMITS.minSide}
              max={LIMITS.maxSide}
              step={1}
              unit={S.settings.cells}
            />
          </Field>
        </FieldRow>
        <p className={ok ? 'm-0 text-xs text-muted' : 'm-0 text-xs text-danger'}>
          {ok ? S.settings.sizeHint : S.settings.badSize}
        </p>
        {cropped > 0 ? (
          <Notice tone="warning">
            <span data-testid="crop-warning">{S.settings.crop(cropped)}</span>
            <span className="mt-1 block">
              <Checkbox
                checked={crop}
                onCheckedChange={(v) => setCrop(v === true)}
                label={S.settings.allowCrop}
              />
            </span>
          </Notice>
        ) : null}
        <Field label={S.settings.background}>
          <ColorField value={bg} onChange={setBg} />
        </Field>
      </div>
    </Dialog>
  );
}

export function MoveDialog() {
  const d = useEditor((s) =>
    s.dialog && typeof s.dialog === 'object' && s.dialog.kind === 'move' ? s.dialog : null,
  );
  return (
    <Dialog
      open={!!d}
      onOpenChange={(o) => !o && close()}
      title={S.move.title}
      description={d ? S.move.desc(d.count) : undefined}
      size="sm"
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button
            variant="danger"
            onClick={() => d && act.confirmShift(d.dx, d.dy)}
            data-testid="move-confirm"
          >
            {S.move.confirm}
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  );
}

export function ShapeSizeDialog() {
  const d = useEditor((s) =>
    s.dialog && typeof s.dialog === 'object' && s.dialog.kind === 'shape' ? s.dialog : null,
  );
  const shape = usePrefs((s) => s.data.shape);
  const outline = usePrefs((s) => s.data.outline);
  const w = usePrefs((s) => s.data.shapeW);
  const h = usePrefs((s) => s.data.shapeH);
  const patch = usePrefs((s) => s.patch);
  const height = shape === 'circle' ? w : h;
  const place = () => {
    if (!d) return;
    const map = mapNow();
    const box = centeredBox(d.x, d.y, w, height);
    if (box.x0 < 0 || box.y0 < 0 || box.x1 >= map.width || box.y1 >= map.height) {
      act.notify(S.shapes.leave, 'warning');
      return;
    }
    const b = act.brushNow();
    const li = act.activeIndex(map);
    const layer = map.layers[li];
    if (!b || !layer) return;
    const edit = new LayerEdit(map.width, map.height, layer.cells);
    edit.shape(box.x0, box.y0, box.x1, box.y1, shape, outline, b.brush);
    const cells = edit.result();
    if (cells) act.commitLayerCells(li, cells);
    close();
  };
  return (
    <Dialog
      open={!!d}
      onOpenChange={(o) => !o && close()}
      title={S.shapes.sizeTitle(shapeLabel(shape))}
      description={S.shapes.sizeDesc}
      size="sm"
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button variant="primary" onClick={place} data-testid="shape-place">
            {S.shapes.place}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          place();
        }}
      >
        <FieldRow columns={2}>
          <Field label={S.shapes.width}>
            <NumberInput
              value={w}
              onChange={(v) => patch({ shapeW: v })}
              min={1}
              max={LIMITS.maxShape}
              step={1}
              unit={S.settings.cells}
            />
          </Field>
          <Field label={S.shapes.height}>
            <NumberInput
              value={height}
              onChange={(v) => patch({ shapeH: v })}
              min={1}
              max={LIMITS.maxShape}
              step={1}
              unit={S.settings.cells}
              disabled={shape === 'circle'}
            />
          </Field>
        </FieldRow>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function RenameLayerDialog() {
  const d = useEditor((s) =>
    s.dialog && typeof s.dialog === 'object' && s.dialog.kind === 'rename-layer' ? s.dialog : null,
  );
  const [name, setName] = useState('');
  useEffect(() => {
    if (d) setName(mapNow().layers.find((l) => l.id === d.id)?.name ?? '');
  }, [d]);
  const ok = !!name.trim() && Array.from(name.trim()).length <= LIMITS.maxName;
  const submit = () => {
    if (d && ok && act.patchLayer(d.id, { name })) close();
    else if (d && ok) close();
  };
  return (
    <Dialog
      open={!!d}
      onOpenChange={(o) => !o && close()}
      title={S.layers.renameTitle}
      size="sm"
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button variant="primary" disabled={!ok} onClick={submit} data-testid="rename-layer-ok">
            {S.sets.rename}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={S.layers.name}>
          <TextInput
            value={name}
            maxLength={LIMITS.maxName}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            data-testid="rename-layer-input"
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
