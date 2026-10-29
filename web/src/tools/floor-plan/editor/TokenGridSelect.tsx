/**
 * 棋子方格的大小選單（不顯示／0.5／1／1.5／2／3 m）：地圖設定與匯出對話框共用，改的是地圖本身（一步復原）。
 */
import { Select } from '@/ui';
import { TOKEN_GRID_SIZES } from '../model/catalog';
import { S } from '../strings';
import { setTokenGrid } from './actions';
import { useProject } from './store';

/** offLabel：「不顯示」那一項的文字（VTT 用的匯出寫「1 m（不畫方格線）」，2026-10-29） */
export function TokenGridSelect({ testId, offLabel }: { testId: string; offLabel?: string }) {
  const size = useProject((s) => s.data.tokenGrid ?? 0);
  return (
    <Select
      value={String(size)}
      onValueChange={(v) => setTokenGrid(Number(v))}
      options={[
        { value: '0', label: offLabel ?? S.props.tokenGridOff },
        ...TOKEN_GRID_SIZES.map((n) => ({ value: String(n), label: S.props.tokenGridSizes[n] })),
      ]}
      data-testid={testId}
    />
  );
}
