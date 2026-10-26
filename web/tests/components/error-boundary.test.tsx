// @vitest-environment jsdom
/**
 * 共用的錯誤邊界（map-fx 第二批驗證 N1 新增）：裡面出錯時只有這一塊換成說明與「重試」，外面照常；
 * 重試先呼叫 onRetry 再重畫；resetKey 改變時自動重來；fallback 可以整個換掉；lazy 區塊下載失敗也接得住。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { lazy, Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/ui';

let broken = true;
function Fragile() {
  if (broken) throw new Error('boom');
  return <p>內容正常</p>;
}

describe('ErrorBoundary', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    broken = true;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('出錯時顯示說明與「重試」，外面照常；重試先呼叫 onRetry 再重畫', () => {
    const onRetry = vi.fn(() => {
      broken = false;
    });
    render(
      <div>
        <p>外面的內容</p>
        <ErrorBoundary description="3D 預覽載入失敗。" onRetry={onRetry}>
          <Fragile />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText('外面的內容')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('這一塊沒辦法顯示');
    expect(alert).toHaveTextContent('3D 預覽載入失敗。');
    expect(alert).not.toHaveTextContent('boom');
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('內容正常')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('resetKey 改變時清掉錯誤；fallback 可以整個換掉', () => {
    function Host() {
      const [k, setK] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setK((n) => n + 1)}>
            換
          </button>
          <ErrorBoundary resetKey={k} fallback={(e) => <p>自訂：{e.message}</p>}>
            <Fragile />
          </ErrorBoundary>
        </>
      );
    }
    render(<Host />);
    expect(screen.getByText('自訂：boom')).toBeInTheDocument();
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: '換' }));
    expect(screen.getByText('內容正常')).toBeInTheDocument();
  });

  it('lazy 區塊下載失敗也接得住，重試時換新的 lazy 就能載入', async () => {
    let fail = true;
    const load = () =>
      fail
        ? Promise.reject(new Error('Failed to fetch dynamically imported module'))
        : Promise.resolve({ default: () => <p>3D 載入完成</p> });
    function Host() {
      const [Lazy, setLazy] = useState(() => lazy(load));
      return (
        <ErrorBoundary onRetry={() => setLazy(() => lazy(load))}>
          <Suspense fallback={<p>載入中</p>}>
            <Lazy />
          </Suspense>
        </ErrorBoundary>
      );
    }
    render(<Host />);
    expect(await screen.findByRole('alert')).toHaveTextContent('這一塊沒辦法顯示');
    fail = false;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重試' }));
    });
    expect(await screen.findByText('3D 載入完成')).toBeInTheDocument();
  });
});
