/**
 * 元件展示頁「立繪工作台」分頁（G3 共用層）的設定欄。預覽欄（右邊）在 G3Preview.tsx。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { moveItem } from '@/core/compose';
import { limitResolution, type OutlineStyle, type PatternKind } from '@/core/image';
import { historyGesture, useUndoRedo } from '@/core/storage';
import {
  ColorField,
  Field,
  IconButton,
  LayerList,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  TextInput,
  Toggle,
} from '@/ui';
import { FIGURE_COLORS, makeFigure } from './art';
import { G3ListsDemo } from './G3ListsDemo';
import { G3PartsDemo } from './G3PartsDemo';
import { G3SamplerDemo } from './G3SamplerDemo';
import { useG3, useG3Preview } from './store';

const PATTERNS: { value: PatternKind | 'none'; label: string }[] = [
  { value: 'none', label: '無' },
  { value: 'dots', label: '圓點' },
  { value: 'stripes', label: '斜線' },
  { value: 'checker', label: '格紋' },
  { value: 'grid', label: '細格' },
];

const EFFECTS: { value: OutlineStyle | 'none'; label: string }[] = [
  { value: 'none', label: '不加效果' },
  { value: 'stroke', label: '實線描邊' },
  { value: 'glow-soft', label: '柔和光暈' },
  { value: 'glow-strong', label: '強烈光暈' },
  { value: 'shadow', label: '陰影' },
];

function UndoButtons() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useG3);
  return (
    <>
      <IconButton
        size="sm"
        label="復原（立繪工作台）"
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        size="sm"
        label="重做（立繪工作台）"
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
    </>
  );
}

function LayoutControls() {
  const s = useG3((st) => st.data);
  const update = useG3((st) => st.update);
  const g = useMemo(() => historyGesture(useG3), []);
  return (
    <Section
      title="版面編輯 LayoutEditor"
      persistKey="_gallery:g3:layout"
      actions={<UndoButtons />}
    >
      <p className="m-0 text-xs text-muted">
        右邊「頭像版面」：點選圖片、名字牌、HO
        牌，拖曳移動、拖右下角控點改大小，拖曳中有中心與邊線參考線和距離標籤； 方向鍵移動
        0.2%（Shift 2%）、Delete 取消選取、Esc 隱藏參考線。一次拖曳算一步復原。
      </p>
      <Field label="背景花紋">
        <Segmented
          value={s.pattern}
          onValueChange={(v) =>
            update((d) => {
              d.pattern = v;
            })
          }
          options={PATTERNS}
          size="sm"
        />
      </Field>
      <Field label="外框粗細">
        <Slider
          value={s.frameWidth}
          onChange={g.live((v) =>
            update((d) => {
              d.frameWidth = v;
            }),
          )}
          onCommit={g.commit}
          min={6}
          max={42}
          unit="px"
        />
      </Field>
    </Section>
  );
}

function BoardControls() {
  const chars = useG3((st) => st.data.characters);
  const update = useG3((st) => st.update);
  const selected = useG3Preview((st) => st.data.boardSelected);
  const setPreview = useG3Preview((st) => st.patch);
  const g = useMemo(() => historyGesture(useG3), []);
  const [filter, setFilter] = useState('');
  const [onlyShown, setOnlyShown] = useState(false);
  const [compact, setCompact] = useState(false);
  const thumbs = useMemo(
    () => FIGURE_COLORS.map((c, i) => makeFigure(120, 240, c, { hat: i === 2 })),
    [],
  );
  /* 清單最上面＝最前面（資料是由後往前畫的順序，所以反過來列） */
  const ordered = [...chars].reverse();
  const q = filter.trim().toLowerCase();
  const rows = ordered.filter(
    (c) => (!q || c.name.toLowerCase().includes(q)) && (!onlyShown || c.visible),
  );
  const filtering = !!q || onlyShown;
  const n = chars.length;
  const res = limitResolution(100, { width: 40, height: 180 });
  return (
    <Section title="身高板 PanZoomViewport＋LayerList" persistKey="_gallery:g3:board">
      <p className="m-0 text-xs text-muted">
        右邊「身高板」：世界座標以 cm 計，左側尺規只跟著縱向捲動（core/ruler 依間距抽稀數字）。
        下面的清單是 LayerList：拖曳或 Alt＋↑↓ 調整前後順序（整次拖曳算一步復原），篩選中不能排序。
      </p>
      <Field label="篩選名稱">
        <TextInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="輸入名稱"
        />
      </Field>
      <div className="flex flex-wrap gap-4">
        <Toggle label="只列顯示中" checked={onlyShown} onCheckedChange={setOnlyShown} />
        <Toggle label="緊密列距" checked={compact} onCheckedChange={setCompact} />
      </div>
      <p className="m-0 text-xs text-muted" data-testid="layer-list-title">
        角色 {filtering ? `${rows.length}／${n}` : n}
        {filtering ? '（篩選中，現在不能調整順序）' : ''}
      </p>
      <LayerList
        aria-label="角色清單"
        items={rows.map((c) => ({
          id: c.id,
          name: c.name,
          thumbnail: c.assetId ? null : thumbs[c.art % thumbs.length],
          visible: c.visible,
          value: c.height,
          meta: `x ${c.x.toFixed(1)} cm`,
        }))}
        selectedId={selected}
        onSelect={(id) => setPreview({ boardSelected: id })}
        sortDisabled={filtering}
        compact={compact}
        onMoveStart={g.begin}
        onMoveEnd={g.commit}
        onMove={(from, to) =>
          update((d) => {
            d.characters = moveItem(d.characters, n - 1 - from, n - 1 - to);
          })
        }
        onVisibleChange={(id, v) =>
          update((d) => {
            const c = d.characters.find((x) => x.id === id);
            if (c) c.visible = v;
          })
        }
        number={{
          label: '身高',
          unit: 'cm',
          min: 1,
          max: 1000,
          step: 0.1,
          onChange: g.live((id: string, v: number) =>
            update((d) => {
              const c = d.characters.find((x) => x.id === id);
              if (c) c.height = v;
            }),
          ),
          onCommit: () => g.commit(),
        }}
        empty="沒有符合的角色。"
        className="max-h-80 overflow-auto"
      />
      <p className="m-0 text-xs text-muted">
        大圖匯出的解析度上限（limitResolution）：40 × 180 cm 的盤面想要 100 px/cm 時，受 4,000
        萬像素限制只能用 {res.toFixed(1)} px/cm。
      </p>
    </Section>
  );
}

function CropControls() {
  const s = useG3((st) => st.data);
  const update = useG3((st) => st.update);
  const g = useMemo(() => historyGesture(useG3), []);
  const slider = (key: 'range' | 'effectWidth' | 'effectBlur' | 'effectOffset') => ({
    value: s[key],
    onChange: g.live((v: number) =>
      update((d) => {
        d[key] = v;
      }),
    ),
    onCommit: g.commit,
  });
  return (
    <Section title="裁切框與剪影效果 CropFrame" persistKey="_gallery:g3:crop">
      <p className="m-0 text-xs text-muted">
        右邊「裁切框」：框高＝角色高度 × 裁切範圍，上緣貼齊頭頂、水平中心是頭部（上方約 35%
        的左右界中點）。 效果畫在角色後面，角色本身與半透明的邊原封不動。
      </p>
      <Field label="比例">
        <Segmented
          value={s.aspect}
          onValueChange={(v) =>
            update((d) => {
              d.aspect = v;
              d.offset = 0;
            })
          }
          options={[
            { value: '3:4', label: '3:4' },
            { value: '1:1', label: '1:1' },
          ]}
          size="sm"
        />
      </Field>
      <Field label="裁切範圍">
        <Slider {...slider('range')} min={10} max={100} unit="%" />
      </Field>
      <Field label="效果">
        <Select
          value={s.effect}
          onValueChange={(v) =>
            update((d) => {
              d.effect = v;
            })
          }
          options={EFFECTS}
        />
      </Field>
      <Show when={s.effect !== 'none'}>
        <Field label="顏色">
          <ColorField
            value={s.effectColor}
            onChange={(c) =>
              update((d) => {
                d.effectColor = c;
              })
            }
          />
        </Field>
        <Field label="粗細">
          <Slider {...slider('effectWidth')} min={1} max={30} unit="px" />
        </Field>
        <Field label="模糊" hidden={s.effect === 'stroke'}>
          <Slider {...slider('effectBlur')} min={0} max={40} unit="px" />
        </Field>
        <Field label="位移" hidden={s.effect !== 'shadow'}>
          <Slider {...slider('effectOffset')} min={0} max={30} unit="px" />
        </Field>
        <Field label="不透明度">
          <Slider
            value={Math.round(s.effectOpacity * 100)}
            onChange={g.live((v: number) =>
              update((d) => {
                d.effectOpacity = v / 100;
              }),
            )}
            onCommit={g.commit}
            min={0}
            max={100}
            unit="%"
          />
        </Field>
      </Show>
    </Section>
  );
}

export function G3Demo() {
  return (
    <div className="flex flex-col gap-3">
      <LayoutControls />
      <BoardControls />
      <CropControls />
      <G3ListsDemo />
      <G3SamplerDemo />
      <G3PartsDemo />
    </div>
  );
}
