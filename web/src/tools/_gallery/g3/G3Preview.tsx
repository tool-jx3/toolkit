/**
 * 「立繪工作台」分頁的預覽欄：頭像版面（LayoutEditor）、身高板（PanZoomViewport）、裁切框（CropFrame＋剪影效果）。
 */
import { Segmented } from '@/ui';
import { BoardView } from './BoardView';
import { CropView } from './CropView';
import { LayoutView } from './LayoutView';
import { type G3View, useG3Preview } from './store';

const VIEWS: { value: G3View; label: string }[] = [
  { value: 'layout', label: '頭像版面' },
  { value: 'board', label: '身高板' },
  { value: 'crop', label: '裁切框' },
];

export function G3Preview() {
  const view = useG3Preview((s) => s.data.view);
  const setPreview = useG3Preview((s) => s.patch);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Segmented
        aria-label="立繪工作台預覽"
        value={view}
        onValueChange={(v) => setPreview({ view: v })}
        options={VIEWS}
        fullWidth
      />
      {view === 'layout' ? <LayoutView /> : view === 'board' ? <BoardView /> : <CropView />}
    </div>
  );
}
