// @vitest-environment jsdom
/**
 * Stage 的 onViewportDoubleClick（anime-rig 對等驗證後加的）：開了 dragPan 時 pointerdown 會捕捉指標，
 * 瀏覽器把 dblclick 送到舞台區域本身（內容收不到）；在 pointerdown 時 stopPropagation 的子元素（控點）上按兩下不算。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stage, UiProvider } from '@/ui';

function Demo({ dragPan, onDbl }: { dragPan: boolean; onDbl: () => void }) {
  return (
    <UiProvider>
      <Stage width={200} height={100} dragPan={dragPan} onViewportDoubleClick={onDbl}>
        <div data-testid="content">
          <button
            type="button"
            data-testid="handle"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            控點
          </button>
        </div>
      </Stage>
    </UiProvider>
  );
}

const viewport = () => screen.getByRole('region', { name: '預覽' });

describe('Stage：按兩下舞台區域', () => {
  it('dragPan：在內容上按下（指標被舞台捕捉）後，dblclick 送到舞台區域本身也會呼叫', () => {
    const onDbl = vi.fn();
    render(<Demo dragPan onDbl={onDbl} />);
    for (let i = 0; i < 2; i++) {
      fireEvent.pointerDown(screen.getByTestId('content'), { button: 0, pointerId: 1 });
      fireEvent.pointerUp(viewport(), { button: 0, pointerId: 1 });
    }
    fireEvent.doubleClick(viewport());
    expect(onDbl).toHaveBeenCalledTimes(1);
    /* 空白處 */
    fireEvent.pointerDown(viewport(), { button: 0, pointerId: 1 });
    fireEvent.pointerUp(viewport(), { button: 0, pointerId: 1 });
    fireEvent.doubleClick(viewport());
    expect(onDbl).toHaveBeenCalledTimes(2);
  });

  it('在 pointerdown 時 stopPropagation 的子元素（控點）上按兩下不呼叫', () => {
    const onDbl = vi.fn();
    render(<Demo dragPan onDbl={onDbl} />);
    fireEvent.pointerDown(screen.getByTestId('handle'), { button: 0, pointerId: 1 });
    fireEvent.doubleClick(screen.getByTestId('handle'));
    expect(onDbl).not.toHaveBeenCalled();
  });

  it('沒開 dragPan 時，dblclick 落在內容上也會呼叫', () => {
    const onDbl = vi.fn();
    render(<Demo dragPan={false} onDbl={onDbl} />);
    fireEvent.pointerDown(screen.getByTestId('content'), { button: 0, pointerId: 1 });
    fireEvent.doubleClick(screen.getByTestId('content'));
    expect(onDbl).toHaveBeenCalledTimes(1);
  });
});
