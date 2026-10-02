// @vitest-environment jsdom
/**
 * G2 共用層的元件：EffectGrid（效果卡片：鍵盤、可取消選取、停用）、KeyframeTable（新增、刪除、整理、恢復預設）、
 * Transport（影格表逐格、預覽速度）、ExportPanel（預估列、處理量上限）、Stage（示意場景背景）。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Keyframe } from '@/core/timeline';
import {
  animationFormats,
  EffectGrid,
  type EffectGridItem,
  ExportPanel,
  KeyframeTable,
  Stage,
  type StageAnyBackgroundKind,
  Transport,
  UiProvider,
} from '@/ui';

type V = 'a' | 'b' | 'c' | 'd' | 'e';
const ITEMS: EffectGridItem<V>[] = [
  { value: 'a', label: '甲', group: '第一組' },
  { value: 'b', label: '乙', description: '說明', group: '第一組' },
  { value: 'c', label: '丙', group: '第一組', disabled: true },
  { value: 'd', label: '丁', group: '第二組' },
  { value: 'e', label: '戊', group: '第二組' },
];

function Grid({ allowDeselect = false, initial = 'a' as V | null, onChange = vi.fn() }) {
  const [v, setV] = useState<V | null>(initial);
  return (
    <UiProvider>
      <EffectGrid
        aria-label="效果"
        items={ITEMS}
        value={v}
        onValueChange={(x) => {
          setV(x);
          onChange(x);
        }}
        allowDeselect={allowDeselect}
        draw={() => {}}
      />
      <output data-testid="value">{v ?? '無'}</output>
    </UiProvider>
  );
}

describe('EffectGrid', () => {
  it('分組、radio 角色、選取中的可 Tab 聚焦，說明併進名稱', () => {
    render(<Grid />);
    const group = screen.getByRole('radiogroup', { name: '效果' });
    expect(within(group).getByText('第一組')).toBeInTheDocument();
    expect(within(group).getByText('第二組')).toBeInTheDocument();
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '甲' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '甲' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '乙：說明' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: '丙' })).toBeDisabled();
  });

  it('←→ 依序選取並跳過停用的、Home／End 到頭尾', () => {
    render(<Grid />);
    const a = screen.getByRole('radio', { name: '甲' });
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(screen.getByTestId('value')).toHaveTextContent('b');
    fireEvent.keyDown(screen.getByRole('radio', { name: '乙：說明' }), { key: 'ArrowRight' });
    /* 丙停用 → 跳到丁 */
    expect(screen.getByTestId('value')).toHaveTextContent('d');
    expect(screen.getByRole('radio', { name: '丁' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('radio', { name: '丁' }), { key: 'End' });
    expect(screen.getByTestId('value')).toHaveTextContent('e');
    fireEvent.keyDown(screen.getByRole('radio', { name: '戊' }), { key: 'Home' });
    expect(screen.getByTestId('value')).toHaveTextContent('a');
    fireEvent.keyDown(screen.getByRole('radio', { name: '甲' }), { key: 'ArrowLeft' });
    expect(screen.getByTestId('value')).toHaveTextContent('a');
  });

  it('allowDeselect：再點一次或空白鍵取消；沒有選取時第一張可 Tab 聚焦', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Grid allowDeselect initial={null} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: '甲' })).toHaveAttribute('tabindex', '0');
    await user.click(screen.getByRole('radio', { name: '丁' }));
    expect(screen.getByTestId('value')).toHaveTextContent('d');
    await user.click(screen.getByRole('radio', { name: '丁' }));
    expect(screen.getByTestId('value')).toHaveTextContent('無');
    const e = screen.getByRole('radio', { name: '戊' });
    e.focus();
    fireEvent.keyDown(e, { key: ' ' });
    expect(screen.getByTestId('value')).toHaveTextContent('e');
    fireEvent.keyDown(e, { key: 'Enter' });
    expect(screen.getByTestId('value')).toHaveTextContent('無');
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['d', null, 'e', null]);
  });

  it('沒有 allowDeselect 時再點一次不會取消', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    await user.click(screen.getByRole('radio', { name: '甲' }));
    expect(screen.getByTestId('value')).toHaveTextContent('a');
  });
});

const CURVES = [
  { value: 'linear', label: '等速' },
  { value: 'smoothstep', label: '平滑' },
];
const DEFAULTS: Keyframe[] = [
  { time: 0, value: 0, curve: 'linear' },
  { time: 2, value: 100, curve: 'smoothstep' },
];

function Table({ initial = DEFAULTS }: { initial?: Keyframe[] }) {
  const [keys, setKeys] = useState<Keyframe[]>(initial);
  return (
    <UiProvider>
      <KeyframeTable
        aria-label="節點"
        value={keys}
        onChange={setKeys}
        curves={CURVES}
        defaults={DEFAULTS}
      />
      <output data-testid="keys">{JSON.stringify(keys)}</output>
    </UiProvider>
  );
}
const keysOf = (): Keyframe[] => JSON.parse(screen.getByTestId('keys').textContent ?? '[]');

describe('KeyframeTable', () => {
  it('新增插在最大的間隔、刪除到最少 2 個為止、恢復預設', async () => {
    const user = userEvent.setup();
    render(<Table />);
    expect(screen.getByTestId('keyframe-count')).toHaveTextContent('2／16 個節點');
    /* 最少 2 個：不能刪 */
    expect(screen.getByRole('button', { name: '刪除第 2 個節點' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '新增節點' }));
    expect(keysOf().map((k) => k.time)).toEqual([0, 1, 2]);
    expect(keysOf()[1].value).toBeGreaterThan(0);
    expect(keysOf()[1].value).toBeLessThan(100);
    expect(screen.getByTestId('keyframe-count')).toHaveTextContent('3／16 個節點');
    /* 起點不能刪；中間的可以 */
    expect(screen.getByRole('button', { name: '刪除第 1 個節點' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '刪除第 2 個節點' }));
    expect(keysOf()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '新增節點' }));
    await user.click(screen.getByRole('button', { name: '恢復預設節點' }));
    expect(keysOf()).toEqual(DEFAULTS);
  });

  it('輸入時只改那一格，離開欄位才整理（排序、數值不倒退）', () => {
    render(
      <Table
        initial={[
          { time: 0, value: 0, curve: 'linear' },
          { time: 1, value: 40, curve: 'linear' },
          { time: 2, value: 70, curve: 'linear' },
          { time: 3, value: 100, curve: 'linear' },
        ]}
      />,
    );
    const t2 = screen.getByRole('spinbutton', { name: '第 2 個節點的時間（秒）' });
    fireEvent.change(t2, { target: { value: '2.5' } });
    /* 還沒離開：順序不變 */
    expect(keysOf().map((k) => k.time)).toEqual([0, 2.5, 2, 3]);
    fireEvent.blur(t2);
    const keys = keysOf();
    expect(keys.map((k) => k.time)).toEqual([0, 2, 2.5, 3]);
    /* 單調：值不倒退 */
    for (let i = 1; i < keys.length; i++)
      expect(keys[i].value).toBeGreaterThanOrEqual(keys[i - 1].value);
    expect(keys.at(-1)?.value).toBe(100);
    expect(screen.getByTestId('keyframe-summary').textContent).toContain('0 秒 0%');
  });
});

describe('Transport（G2 加的）', () => {
  it('有 onRateChange 才顯示預覽速度；影格表時 ←／→ 跳到每格開頭', () => {
    const onTime = vi.fn();
    const onRate = vi.fn();
    const props = {
      time: 0.05,
      duration: 1,
      playing: false,
      onTimeChange: onTime,
      onPlayingChange: () => {},
    };
    const { rerender } = render(
      <UiProvider>
        <Transport {...props} />
      </UiProvider>,
    );
    expect(screen.queryByRole('spinbutton', { name: '預覽速度' })).toBeNull();
    rerender(
      <UiProvider>
        <Transport
          {...props}
          rate={1.5}
          onRateChange={onRate}
          frames={[{ ms: 100 }, { ms: 300 }, { ms: 600 }]}
        />
      </UiProvider>,
    );
    expect(screen.getByRole('spinbutton', { name: '預覽速度' })).toHaveValue('1.5');
    const slider = screen.getByRole('slider', { name: '時間軸' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onTime).toHaveBeenLastCalledWith(0.1);
    rerender(
      <UiProvider>
        <Transport
          {...props}
          time={0.4}
          rate={1.5}
          onRateChange={onRate}
          frames={[{ ms: 100 }, { ms: 300 }, { ms: 600 }]}
        />
      </UiProvider>,
    );
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onTime).toHaveBeenLastCalledWith(0.1);
  });
});

describe('ExportPanel（G2 加的）', () => {
  it('預估列與處理量上限（超過時停用匯出並說明）', () => {
    const base = {
      formats: animationFormats(['apng']),
      onExport: vi.fn(),
      fixedFps: 24,
    };
    const { rerender } = render(
      <UiProvider>
        <ExportPanel
          {...base}
          estimate={{ width: 480, height: 270, frames: 24, duration: 1 }}
          pixelBudget={{ max: 220_000_000, message: '太大了' }}
        />
      </UiProvider>,
    );
    expect(screen.getByTestId('export-estimate')).toHaveTextContent(
      '1.00 秒 · 24 格 · 每格約 41.7 ms · 未壓縮 11.9 MB',
    );
    expect(screen.queryByTestId('export-over-budget')).toBeNull();
    expect(screen.getByRole('button', { name: '匯出 APNG' })).toBeEnabled();
    rerender(
      <UiProvider>
        <ExportPanel
          {...base}
          estimate={{ width: 1920, height: 1080, frames: 120, duration: 5 }}
          pixelBudget={{ max: 220_000_000, message: '太大了' }}
        />
      </UiProvider>,
    );
    expect(screen.getByTestId('export-over-budget')).toHaveTextContent('太大了');
    expect(screen.getByRole('button', { name: '匯出 APNG' })).toBeDisabled();
  });
});

describe('Stage（G2 加的示意場景）', () => {
  it("要在 backgrounds 列出 'scene' 才有；依 backgrounds 的順序排列", async () => {
    const { unmount } = render(
      <UiProvider>
        <Stage width={160} height={90}>
          <div />
        </Stage>
      </UiProvider>,
    );
    expect(screen.queryByRole('radio', { name: '示意場景（只供預覽）' })).toBeNull();
    unmount();
    render(
      <UiProvider>
        <Stage<StageAnyBackgroundKind>
          width={160}
          height={90}
          backgrounds={['scene', 'light', 'checker']}
          defaultBackground={{ kind: 'scene' }}
        >
          <div />
        </Stage>
      </UiProvider>,
    );
    const group = screen.getByRole('radiogroup', { name: '預覽背景' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAccessibleName('示意場景（只供預覽）');
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    await act(async () => {});
  });
});
