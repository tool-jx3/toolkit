/**
 * 作圖工具的屬性面板（1.5～1.11）：一般圖形、格子、地面、牆壁、房間、手繪、文字。裝飾在 DecorPanel.tsx。
 */
import {
  Bold,
  Eraser,
  Italic,
  PaintBucket,
  Pencil,
  Plus,
  SprayCan,
  Strikethrough,
  Underline,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { findGoogleFont } from '@/core/fonts';
import {
  Button,
  ColorField,
  Field,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  type SelectGroup,
} from '@/ui';
import { applyTextLook, setTextFont, setTextSize, toggleTextStyle } from '../engine/ops';
import { dashArray, joinAlpha, splitAlpha, styleOfDash } from '../geometry';
import {
  FREEHAND_BRUSHES,
  GROUND_TOOLS,
  type MapPrefs,
  ROOM_TOOLS,
  type StrokeStyle,
  WALL_TOOLS,
} from '../model';
import { getEngine } from '../runtime';
import {
  type CellMode,
  type Prefs,
  setMapPrefs,
  useEditor,
  useMapPrefs,
  usePrefs,
} from '../stores';
import { S } from '../strings';
import { PatternDetailFields, ShadowFields, type ShadowValues, StyleFields } from './fields';
import { PatternPicker } from './PatternPicker';

const patch = (p: Partial<Prefs>) => usePrefs.getState().patch(p);

/* ---------- 作圖用的陰影（F088） ---------- */

type ShadowCat = 'simple' | 'ground' | 'wall' | 'decor';

export function DrawShadow({ cat }: { cat: ShadowCat }) {
  const pr = usePrefs((s) => s.data);
  const decorOn = useMapPrefs((s) => s.decorShadowEnabled);
  const enabled =
    cat === 'ground'
      ? pr.shadowGround
      : cat === 'wall'
        ? pr.shadowWall
        : cat === 'decor'
          ? decorOn
          : pr.shadowSimple;
  const value: ShadowValues = {
    enabled,
    color: pr.shadowColor,
    blur: pr.shadowBlur,
    offsetX: pr.shadowOffsetX,
    offsetY: pr.shadowOffsetY,
  };
  return (
    <ShadowFields
      value={value}
      enabledLabel={S.shadow.enabledFor[cat]}
      persistKey="map-editor:shadow"
      note={S.shadow.note}
      onChange={(p) => {
        if (p.enabled !== undefined) {
          if (cat === 'decor') setMapPrefs({ decorShadowEnabled: p.enabled });
          else
            patch(
              cat === 'ground'
                ? { shadowGround: p.enabled }
                : cat === 'wall'
                  ? { shadowWall: p.enabled }
                  : { shadowSimple: p.enabled },
            );
        }
        const rest: Partial<Prefs> = {};
        if (p.color !== undefined) rest.shadowColor = p.color;
        if (p.blur !== undefined) rest.shadowBlur = p.blur;
        if (p.offsetX !== undefined) rest.shadowOffsetX = p.offsetX;
        if (p.offsetY !== undefined) rest.shadowOffsetY = p.offsetY;
        if (Object.keys(rest).length) patch(rest);
        if (cat === 'decor') getEngine()?.refreshDecorPreview();
      }}
    />
  );
}

/* ---------- 一般圖形（F070～F087） ---------- */

export function DrawPanel({ sub }: { sub: string }) {
  const pr = usePrefs((s) => s.data);
  return (
    <div className="flex flex-col gap-3" data-testid="draw-panel">
      <StyleFields
        values={{
          fill: pr.fill,
          stroke: pr.stroke,
          strokeWidth: pr.strokeWidth,
          strokeStyle: pr.strokeStyle,
          lineJoin: pr.lineJoin,
          lineCap: pr.lineCap,
          cornerRadius: pr.cornerRadius,
          ellipseMode: pr.ellipseMode,
        }}
        show={{
          fill: true,
          stroke: true,
          width: true,
          style: true,
          joinCap: true,
          radius: sub === 'rect' || sub === 'path' || sub === 'polygon',
          ellipseMode: sub === 'ellipse',
        }}
        onFill={(fill) => patch({ fill })}
        onStroke={(stroke) => patch({ stroke })}
        onStrokeWidth={(strokeWidth) => patch({ strokeWidth })}
        onStrokeStyle={(strokeStyle) => patch({ strokeStyle })}
        onJoin={(lineJoin) => patch({ lineJoin })}
        onCap={(lineCap) => patch({ lineCap })}
        onRadius={(cornerRadius) => patch({ cornerRadius })}
        onEllipseMode={(ellipseMode) => {
          patch({ ellipseMode });
          getEngine()?.resetDraw();
        }}
      />
      <DrawShadow cat="simple" />
    </div>
  );
}

/* ---------- 格子（F090～F094） ---------- */

const CELL_ICONS = { pen: <Pencil />, eraser: <Eraser />, fill: <PaintBucket /> } as const;

function CellModeField() {
  const mode = usePrefs((s) => s.data.cellMode);
  return (
    <Field label={S.cell.mode}>
      <Segmented
        value={mode}
        onValueChange={(cellMode: CellMode) => patch({ cellMode })}
        fullWidth
        size="sm"
        options={(['pen', 'eraser', 'fill'] as const).map((m) => ({
          value: m,
          label: S.cell.modes[m],
          icon: CELL_ICONS[m],
        }))}
      />
    </Field>
  );
}

export function CellPanel() {
  const fill = usePrefs((s) => s.data.fill);
  return (
    <div className="flex flex-col gap-3" data-testid="cell-panel">
      <p className="text-xs text-muted">{S.cell.hint}</p>
      <CellModeField />
      <Field label={S.cell.fillColor}>
        <ColorField value={fill} onChange={(v) => patch({ fill: v })} alpha eyedropper />
      </Field>
      <Button size="sm" icon={<Plus />} onClick={() => getEngine()?.createCellLayer(false)}>
        {S.cell.addLayer}
      </Button>
      <DrawShadow cat="simple" />
    </div>
  );
}

/* ---------- 地面、牆壁、房間（F100～F114） ---------- */

function useGroundDetail() {
  const mp = useMapPrefs();
  return {
    offX: mp.groundPatternOffsetX,
    offY: mp.groundPatternOffsetY,
    rot: mp.groundPatternRotation,
    scalePct: Math.round((mp.groundPatternScale ?? 1) * 100),
    onChange: (f: 'offX' | 'offY' | 'rot' | 'scale', v: number) =>
      setMapPrefs(
        f === 'offX'
          ? { groundPatternOffsetX: v }
          : f === 'offY'
            ? { groundPatternOffsetY: v }
            : f === 'rot'
              ? { groundPatternRotation: v }
              : { groundPatternScale: v / 100 },
      ),
  };
}

function useWallDetail() {
  const mp = useMapPrefs();
  return {
    offX: mp.wallPatternOffsetX,
    offY: mp.wallPatternOffsetY,
    rot: mp.wallPatternRotation,
    scalePct: Math.round((mp.wallPatternScale ?? 1) * 100),
    onChange: (f: 'offX' | 'offY' | 'rot' | 'scale', v: number) =>
      setMapPrefs(
        f === 'offX'
          ? { wallPatternOffsetX: v }
          : f === 'offY'
            ? { wallPatternOffsetY: v }
            : f === 'rot'
              ? { wallPatternRotation: v }
              : { wallPatternScale: v / 100 },
      ),
  };
}

function ShapeExtras({ sub }: { sub: string }) {
  const pr = usePrefs((s) => s.data);
  const radius = sub === 'rect' || sub === 'path' || sub === 'polygon';
  const ellipse = sub === 'ellipse';
  if (!radius && !ellipse) return null;
  return (
    <StyleFields
      values={{
        fill: null,
        stroke: null,
        strokeWidth: 0,
        strokeStyle: 'solid',
        lineJoin: 'miter',
        lineCap: 'butt',
        cornerRadius: pr.cornerRadius,
        ellipseMode: pr.ellipseMode,
      }}
      show={{ radius, ellipseMode: ellipse }}
      onRadius={(cornerRadius) => patch({ cornerRadius })}
      onEllipseMode={(ellipseMode) => {
        patch({ ellipseMode });
        getEngine()?.resetDraw();
      }}
    />
  );
}

export function GroundPanel() {
  const mp = useMapPrefs();
  const detail = useGroundDetail();
  return (
    <div className="flex flex-col gap-3" data-testid="ground-panel">
      <Field label={S.ground.subtool}>
        <Select
          value={mp.groundTool}
          onValueChange={(groundTool) => setMapPrefs({ groundTool })}
          options={GROUND_TOOLS.map((t) => ({ value: t, label: S.ground.tools[t] }))}
          size="sm"
        />
      </Field>
      {mp.groundTool === 'cell' ? (
        <>
          <CellModeField />
          <Button size="sm" icon={<Plus />} onClick={() => getEngine()?.createCellLayer(true)}>
            {S.ground.addLayer}
          </Button>
        </>
      ) : null}
      <ShapeExtras sub={mp.groundTool} />
      <PatternPicker
        label={S.pattern.groundTitle}
        value={mp.groundPattern}
        onChange={(groundPattern) => setMapPrefs({ groundPattern })}
        testId="ground-pattern"
      />
      <PatternDetailFields {...detail} persistKey="map-editor:ground-detail" />
      <DrawShadow cat="ground" />
    </div>
  );
}

export function WallPanel() {
  const mp = useMapPrefs();
  const pr = usePrefs((s) => s.data);
  const detail = useWallDetail();
  return (
    <div className="flex flex-col gap-3" data-testid="wall-panel">
      <Field label={S.wall.subtool}>
        <Select
          value={mp.wallTool}
          onValueChange={(wallTool) => setMapPrefs({ wallTool })}
          options={WALL_TOOLS.map((t) => ({ value: t, label: S.wall.tools[t] }))}
          size="sm"
        />
      </Field>
      <PatternPicker
        label={S.pattern.wallTitle}
        value={mp.wallPattern}
        onChange={(wallPattern) => setMapPrefs({ wallPattern })}
        testId="wall-pattern"
      />
      <StyleFields
        values={{
          fill: null,
          stroke: null,
          strokeWidth: mp.wallThickness,
          strokeStyle: pr.strokeStyle,
          lineJoin: pr.lineJoin,
          lineCap: pr.lineCap,
          cornerRadius: pr.cornerRadius,
          ellipseMode: pr.ellipseMode,
        }}
        show={{
          width: true,
          style: true,
          joinCap: true,
          radius: mp.wallTool === 'rect' || mp.wallTool === 'path' || mp.wallTool === 'polygon',
          ellipseMode: mp.wallTool === 'ellipse',
        }}
        widthLabel={S.style.wallThickness}
        widthRange={[1, 200]}
        onStrokeWidth={(wallThickness) => setMapPrefs({ wallThickness })}
        onStrokeStyle={(strokeStyle) => patch({ strokeStyle })}
        onJoin={(lineJoin) => patch({ lineJoin })}
        onCap={(lineCap) => patch({ lineCap })}
        onRadius={(cornerRadius) => patch({ cornerRadius })}
        onEllipseMode={(ellipseMode) => {
          patch({ ellipseMode });
          getEngine()?.resetDraw();
        }}
      />
      <PatternDetailFields {...detail} persistKey="map-editor:wall-detail" />
      <DrawShadow cat="wall" />
    </div>
  );
}

function roomShadow(mp: MapPrefs, kind: 'Ground' | 'Wall'): ShadowValues {
  return {
    enabled: mp[`room${kind}ShadowEnabled`],
    color: mp[`room${kind}ShadowColor`],
    blur: mp[`room${kind}ShadowBlur`],
    offsetX: mp[`room${kind}ShadowOffsetX`],
    offsetY: mp[`room${kind}ShadowOffsetY`],
  };
}

function setRoomShadow(kind: 'Ground' | 'Wall', p: Partial<ShadowValues>): void {
  const out: Partial<MapPrefs> = {};
  if (p.enabled !== undefined) out[`room${kind}ShadowEnabled`] = p.enabled;
  if (p.color !== undefined) out[`room${kind}ShadowColor`] = p.color;
  if (p.blur !== undefined) out[`room${kind}ShadowBlur`] = p.blur;
  if (p.offsetX !== undefined) out[`room${kind}ShadowOffsetX`] = p.offsetX;
  if (p.offsetY !== undefined) out[`room${kind}ShadowOffsetY`] = p.offsetY;
  setMapPrefs(out);
}

export function RoomPanel() {
  const mp = useMapPrefs();
  const gd = useGroundDetail();
  const wd = useWallDetail();
  const style = styleOfDash(mp.roomWallStrokeDashArray);
  return (
    <div className="flex flex-col gap-3" data-testid="room-panel">
      <Field label={S.room.subtool}>
        <Select
          value={mp.roomTool}
          onValueChange={(roomTool) => setMapPrefs({ roomTool })}
          options={ROOM_TOOLS.map((t) => ({ value: t, label: S.room.tools[t] }))}
          size="sm"
        />
      </Field>
      <ShapeExtras sub={mp.roomTool} />
      <Section title={S.room.ground} persistKey="map-editor:room-ground">
        <div className="flex flex-col gap-3">
          <PatternPicker
            label={S.pattern.groundTitle}
            value={mp.groundPattern}
            onChange={(groundPattern) => setMapPrefs({ groundPattern })}
            testId="room-ground-pattern"
          />
          <PatternDetailFields {...gd} persistKey="map-editor:ground-detail" />
          <ShadowFields
            value={roomShadow(mp, 'Ground')}
            onChange={(p) => setRoomShadow('Ground', p)}
            persistKey="map-editor:room-ground-shadow"
          />
        </div>
      </Section>
      <Section title={S.room.wall} persistKey="map-editor:room-wall">
        <div className="flex flex-col gap-3">
          <PatternPicker
            label={S.pattern.wallTitle}
            value={mp.wallPattern}
            onChange={(wallPattern) => setMapPrefs({ wallPattern })}
            testId="room-wall-pattern"
          />
          <StyleFields
            values={{
              fill: null,
              stroke: null,
              strokeWidth: mp.roomWallThickness,
              strokeStyle: style,
              lineJoin: mp.roomWallStrokeLineJoin,
              lineCap: mp.roomWallStrokeLineCap,
              cornerRadius: 0,
            }}
            show={{ width: true, style: true, joinCap: true }}
            widthLabel={S.style.wallThickness}
            widthRange={[1, 200]}
            onStrokeWidth={(roomWallThickness) =>
              setMapPrefs({
                roomWallThickness,
                roomWallStrokeDashArray: dashArray(style, roomWallThickness),
              })
            }
            onStrokeStyle={(s: StrokeStyle) =>
              setMapPrefs({ roomWallStrokeDashArray: dashArray(s, mp.roomWallThickness || 12) })
            }
            onJoin={(roomWallStrokeLineJoin) => setMapPrefs({ roomWallStrokeLineJoin })}
            onCap={(roomWallStrokeLineCap) => setMapPrefs({ roomWallStrokeLineCap })}
          />
          <PatternDetailFields {...wd} persistKey="map-editor:wall-detail" />
          <ShadowFields
            value={roomShadow(mp, 'Wall')}
            onChange={(p) => setRoomShadow('Wall', p)}
            persistKey="map-editor:room-wall-shadow"
          />
        </div>
      </Section>
    </div>
  );
}

/* ---------- 手繪（F140～F143） ---------- */

const BRUSH_ICONS = { pencil: <Pencil />, spray: <SprayCan />, eraser: <Eraser /> } as const;

export function FreehandPanel() {
  const mp = useMapPrefs();
  return (
    <div className="flex flex-col gap-3" data-testid="freehand-panel">
      <Field label={S.freehand.brush} hint={S.freehand.shiftHint}>
        <Segmented
          value={mp.freehandBrush}
          onValueChange={(freehandBrush) => setMapPrefs({ freehandBrush })}
          fullWidth
          size="sm"
          options={FREEHAND_BRUSHES.map((b) => ({
            value: b,
            label: S.freehand.brushes[b],
            icon: BRUSH_ICONS[b],
          }))}
        />
      </Field>
      <Field label={S.freehand.color}>
        <ColorField
          value={joinAlpha(mp.freehandColor, mp.freehandOpacity)}
          onChange={(v) => {
            const { hex, alpha } = splitAlpha(v);
            setMapPrefs({ freehandColor: hex, freehandOpacity: alpha });
          }}
          alpha
          eyedropper
        />
      </Field>
      <Field label={S.freehand.width}>
        <NumberInput
          value={mp.freehandWidth}
          onChange={(freehandWidth) => setMapPrefs({ freehandWidth })}
          min={1}
          max={100}
          unit="px"
        />
      </Field>
      <Field label={S.freehand.smoothing} hint={S.freehand.smoothingHint}>
        <NumberInput
          value={mp.freehandDecimation}
          onChange={(freehandDecimation) => setMapPrefs({ freehandDecimation })}
          min={0}
          max={20}
        />
      </Field>
      <Button size="sm" icon={<Plus />} onClick={() => getEngine()?.createFreehandLayer()}>
        {S.freehand.addLayer}
      </Button>
    </div>
  );
}

/* ---------- 文字（F150～F155） ---------- */

const FONT_GROUPS: { id: keyof typeof S.text.fontGroups; families: string[] }[] = [
  {
    id: 'tc',
    families: [
      'Noto Sans TC',
      'Noto Serif TC',
      'LXGW WenKai TC',
      'Chocolate Classical Sans',
      'Cactus Classical Serif',
    ],
  },
  {
    id: 'gothic',
    families: ['Noto Sans JP', 'Zen Kaku Gothic New', 'Sawarabi Gothic', 'M PLUS 1p'],
  },
  {
    id: 'mincho',
    families: [
      'Noto Serif JP',
      'Zen Old Mincho',
      'Shippori Mincho',
      'Sawarabi Mincho',
      'Hina Mincho',
    ],
  },
  { id: 'round', families: ['Zen Maru Gothic', 'Mochiy Pop One', 'Reggae One', 'Aoboshi One'] },
  {
    id: 'hand',
    families: ['Klee One', 'Yomogi', 'Zen Kurenaido', 'Yuji Syuku', 'Yuji Boku', 'Yusei Magic'],
  },
  { id: 'deco', families: ['Dela Gothic One', 'Kaisei Decol', 'DotGothic16', 'Stick'] },
  { id: 'fantasy', families: ['Cinzel', 'MedievalSharp', 'UnifrakturMaguntia', 'Pirata One'] },
  { id: 'horror', families: ['Special Elite', 'Eater', 'Orbitron'] },
  { id: 'mono', families: ['Share Tech Mono', 'Bebas Neue'] },
];

/** 文字工具的字型（37 套，依舊版分組） */
export const TEXT_FONTS: readonly string[] = FONT_GROUPS.flatMap((g) => g.families);

const FONT_OPTIONS: SelectGroup[] = FONT_GROUPS.map((g) => ({
  label: S.text.fontGroups[g.id],
  options: g.families.map((f) => ({ value: f, label: findGoogleFont(f)?.label ?? f })),
}));

export function TextPanel() {
  const pr = usePrefs((s) => s.data);
  const mp = useMapPrefs();
  const ts = useEditor((s) => s.textStyle);
  const eng = getEngine();
  const font = ts?.fontFamily ?? pr.textFont;
  const fontValue = TEXT_FONTS.includes(font) ? font : pr.textFont;
  const look = {
    fill: mp.textFill,
    fillOpacity: mp.textFillOpacity,
    stroke: mp.textStroke,
    strokeOpacity: mp.textStrokeOpacity,
    strokeWidth: mp.textStrokeWidth,
  };
  const setLook = (p: Partial<typeof look>) => {
    const next = { ...look, ...p };
    setMapPrefs({
      textFill: next.fill,
      textFillOpacity: next.fillOpacity,
      textStroke: next.stroke,
      textStrokeOpacity: next.strokeOpacity,
      textStrokeWidth: next.strokeWidth,
    });
    if (eng) applyTextLook(eng, next);
  };
  const styleBtn = (
    k: 'bold' | 'italic' | 'underline' | 'linethrough',
    icon: ReactNode,
    label: string,
  ) => (
    <IconButton
      size="sm"
      variant="ghost"
      icon={icon}
      label={label}
      pressed={!!ts?.[k]}
      disabled={!ts}
      onClick={() => eng && toggleTextStyle(eng, k)}
      data-text-style={k}
    />
  );
  return (
    <div className="flex flex-col gap-3" data-testid="text-panel">
      <p className="text-xs text-muted">{S.text.hint}</p>
      <Field label={S.text.font}>
        <Select
          value={fontValue}
          onValueChange={(f) => {
            patch({ textFont: f });
            if (eng) setTextFont(eng, f);
          }}
          options={FONT_OPTIONS}
          size="sm"
        />
      </Field>
      <Field label={S.text.size}>
        <NumberInput
          value={Math.round(ts?.fontSize ?? pr.textSize)}
          onChange={(v) => {
            patch({ textSize: v });
            if (eng) setTextSize(eng, v);
          }}
          min={6}
          max={500}
          unit="px"
        />
      </Field>
      <Field label={S.text.style}>
        <div className="flex gap-1">
          {styleBtn('bold', <Bold />, `${S.text.bold}（Ctrl＋B）`)}
          {styleBtn('italic', <Italic />, `${S.text.italic}（Ctrl＋I）`)}
          {styleBtn('underline', <Underline />, `${S.text.underline}（Ctrl＋U）`)}
          {styleBtn('linethrough', <Strikethrough />, S.text.linethrough)}
        </div>
      </Field>
      <Field label={S.text.fill}>
        <ColorField
          value={joinAlpha(look.fill, look.fillOpacity)}
          onChange={(v) => {
            const { hex, alpha } = splitAlpha(v);
            setLook({ fill: hex, fillOpacity: alpha });
          }}
          alpha
          eyedropper
        />
      </Field>
      <Field label={S.text.stroke}>
        <ColorField
          value={joinAlpha(look.stroke, look.strokeOpacity)}
          onChange={(v) => {
            const { hex, alpha } = splitAlpha(v);
            setLook({ stroke: hex, strokeOpacity: alpha });
          }}
          alpha
        />
      </Field>
      <Field label={S.text.strokeWidth}>
        <NumberInput
          value={look.strokeWidth}
          onChange={(strokeWidth) => setLook({ strokeWidth })}
          min={0}
          max={100}
          unit="px"
        />
      </Field>
    </div>
  );
}
