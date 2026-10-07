// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileDrop, ThumbnailList, UiProvider } from '@/ui';

describe('ThumbnailList', () => {
  it('列出名稱（滑過看全名）、狀態標記、補充說明；沒有來源時顯示佔位', () => {
    render(
      <UiProvider>
        <ThumbnailList
          aria-label="已載入的立繪"
          items={[
            { id: 'a', name: '很長很長很長很長的檔名.png', image: 'blob:test/a', meta: '1.2 KB' },
            {
              id: 'b',
              name: '處理好的.png',
              image: 'blob:test/b',
              status: 'done',
              statusLabel: '已處理',
            },
            { id: 'c', name: '讀取中.png' },
          ]}
        />
      </UiProvider>,
    );
    const list = screen.getByRole('list', { name: '已載入的立繪' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('很長很長很長很長的檔名.png')).toHaveAttribute(
      'title',
      '很長很長很長很長的檔名.png',
    );
    expect(items[0]).toHaveTextContent('1.2 KB');
    expect(items[1]).toHaveAttribute('data-status', 'done');
    expect(items[1]).toHaveTextContent('已處理');
    expect(items[2].querySelector('[data-placeholder]')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('移除按鈕帶檔名，按下呼叫 onRemove', () => {
    const onRemove = vi.fn();
    render(
      <UiProvider>
        <ThumbnailList
          aria-label="清單"
          onRemove={onRemove}
          items={[{ id: 'x', name: '立繪.png', image: 'blob:test/x' }]}
        />
      </UiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '移除「立繪.png」' }));
    expect(onRemove).toHaveBeenCalledWith('x');
  });

  it('沒有項目時顯示 empty', () => {
    render(<ThumbnailList aria-label="清單" items={[]} empty="還沒有圖片" />);
    expect(screen.getByText('還沒有圖片')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('FileDrop filterByAccept', () => {
  const files = [
    new File(['x'], '沒有副檔名', { type: '' }),
    new File(['y'], 'a.png', { type: 'image/png' }),
  ];

  it('預設依 accept 過濾', async () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <FileDrop multiple accept="image/png" onFiles={onFiles} onReject={onReject} />,
    );
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files } });
    expect(onReject.mock.calls[0][0].map((f: File) => f.name)).toEqual(['沒有副檔名']);
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.png']);
  });

  it('預設先讀進記憶體再交出（內容、檔名、類型相同的新 File）；readNow={false} 直接交出原本的 File', async () => {
    const onFiles = vi.fn();
    const { container, rerender } = render(<FileDrop multiple onFiles={onFiles} />);
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files } });
    expect(onFiles).not.toHaveBeenCalled();
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    const got = onFiles.mock.calls[0][0] as File[];
    expect(got.map((f) => [f.name, f.type])).toEqual([
      ['沒有副檔名', ''],
      ['a.png', 'image/png'],
    ]);
    expect(got[1]).not.toBe(files[1]);
    expect(await got[1].text()).toBe('y');
    rerender(<FileDrop multiple readNow={false} onFiles={onFiles} />);
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files } });
    expect(onFiles).toHaveBeenCalledTimes(2);
    expect(onFiles.mock.calls[1][0][1]).toBe(files[1]);
  });

  it('filterByAccept={false}：全部交給 onFiles，accept 只用在選檔視窗', async () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <FileDrop
        multiple
        accept="image/png"
        filterByAccept={false}
        onFiles={onFiles}
        onReject={onReject}
      />,
    );
    const input = container.querySelector('input[type=file]')!;
    expect(input).toHaveAttribute('accept', 'image/png');
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0]).toHaveLength(2);
    expect(onReject).not.toHaveBeenCalled();
  });
});
