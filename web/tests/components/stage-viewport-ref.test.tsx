// @vitest-environment jsdom
/**
 * Stage 的 viewportRef（screenshot-fx 第二批加的）：物件 ref 與函式 ref 都拿到可以捲動的舞台區域（role="region"），
 * 卸載時函式 ref 收到 null；不給時照舊。
 */
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Stage, UiProvider } from '@/ui';

describe('Stage：viewportRef', () => {
  it('物件 ref 拿到舞台區域', () => {
    const ref = createRef<HTMLElement | null>();
    render(
      <UiProvider>
        <Stage width={200} height={100} viewportRef={ref}>
          <div />
        </Stage>
      </UiProvider>,
    );
    expect(ref.current).toBe(screen.getByRole('region', { name: '預覽' }));
    expect(ref.current?.tagName).toBe('SECTION');
  });

  it('函式 ref：掛上時收到元素、卸載時收到 null', () => {
    const fn = vi.fn();
    const { unmount } = render(
      <UiProvider>
        <Stage width={200} height={100} viewportRef={fn}>
          <div />
        </Stage>
      </UiProvider>,
    );
    expect(fn).toHaveBeenCalledWith(screen.getByRole('region', { name: '預覽' }));
    unmount();
    expect(fn).toHaveBeenLastCalledWith(null);
  });

  it('不給時照常顯示', () => {
    render(
      <UiProvider>
        <Stage width={200} height={100}>
          <div data-testid="c" />
        </Stage>
      </UiProvider>,
    );
    expect(screen.getByTestId('c')).toBeTruthy();
  });
});
