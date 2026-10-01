// @vitest-environment jsdom
/** text-fx 移植時新增或擴充的共用元件：AnchorPicker、ExportPanel（handle、extra、details）、Transport（markers、legend）、TemplateGallery（sm、defaultTag） */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AnchorPicker,
  type AnchorValue,
  animationFormats,
  ExportPanel,
  type ExportPanelHandle,
  Field,
  TemplateGallery,
  Transport,
  UiProvider,
} from '@/ui';

describe('AnchorPicker', () => {
  function Demo() {
    const [v, setV] = useState<AnchorValue>('mc');
    return (
      <Field label="位置">
        <AnchorPicker value={v} onChange={setV} />
      </Field>
    );
  }

  it('九格 radio，點選與方向鍵移動', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const group = screen.getByRole('radiogroup', { name: '位置' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(9);
    expect(screen.getByRole('radio', { name: '正中央' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: '左上' }));
    expect(screen.getByRole('radio', { name: '左上' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(screen.getByRole('radio', { name: '左側中央' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: '正中央' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '正中央' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: '右下' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('ExportPanel 的擴充', () => {
  it('ref.exportNow 指定格式匯出；extra 與 details 顯示在面板與結果卡', async () => {
    const ref = createRef<ExportPanelHandle>();
    const onExport = vi.fn(async () => ({
      blob: new Blob([new Uint8Array(10)], { type: 'image/png' }),
      fileName: '測試.png',
      width: 10,
      height: 10,
      details: [{ label: '色數', value: '256 色（減色）' }],
    }));
    render(
      <UiProvider>
        <ExportPanel
          ref={ref}
          formats={animationFormats(['apng', 'png', 'zip'])}
          onExport={onExport}
          defaultSettings={{ format: 'png', plays: 1 }}
          maxPlays={999}
          loopHint="播放一次會停在最後一格"
          extra={<p>額外設定</p>}
        />
      </UiProvider>,
    );
    expect(screen.getByText('額外設定')).toBeInTheDocument();
    await act(async () => {
      ref.current?.exportNow('apng');
    });
    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'apng' }),
      expect.anything(),
    );
    expect(await screen.findByTestId('export-result')).toHaveTextContent('256 色（減色）');
    expect(screen.getByRole('radio', { name: 'APNG' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('播放一次會停在最後一格')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '播放次數' })).toHaveAttribute(
      'aria-valuemax',
      '999',
    );
  });
});

describe('Transport 的標記與圖例', () => {
  it('標記；legend=false 時不顯示圖例', () => {
    const noop = () => {};
    const { container } = render(
      <UiProvider>
        <Transport
          time={1}
          duration={4}
          playing={false}
          onTimeChange={noop}
          onPlayingChange={noop}
          segments={[{ id: 'a', label: '登場', start: 0, end: 1 }]}
          markers={[{ time: 1, label: '代表畫面' }]}
          legend={false}
        />
      </UiProvider>,
    );
    expect(container.querySelector('[data-marker="代表畫面"]')).not.toBeNull();
    expect(screen.queryByRole('list', { name: '階段' })).toBeNull();
  });
});

describe('TemplateGallery 的小卡與預設標籤', () => {
  it('sm：說明放在提示；defaultTag：一開始只列那個分類', () => {
    render(
      <UiProvider>
        <TemplateGallery
          size="sm"
          defaultTag="戰鬥"
          confirm={false}
          onApply={() => {}}
          templates={[
            { id: 'a', name: '戰鬥開始', description: '戰鬥開始／BATTLE', tags: ['戰鬥'], data: 1 },
            { id: 'b', name: '探索開始', description: '探索', tags: ['探索'], data: 2 },
          ]}
        />
      </UiProvider>,
    );
    expect(screen.getByRole('button', { name: /戰鬥開始/ })).toHaveAttribute(
      'title',
      '戰鬥開始／BATTLE',
    );
    expect(screen.queryByRole('button', { name: /探索開始/ })).toBeNull();
    expect(screen.getByRole('radio', { name: '戰鬥' })).toHaveAttribute('aria-checked', 'true');
  });
});
