// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Hsv } from '@/core/color';
import { Field, HsvPanel, hsvToHex, Segmented } from '@/ui';

function Controlled({ initial }: { initial: Hsv }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <Field label="顏色面板">
        <HsvPanel value={v} onChange={setV} />
      </Field>
      <output data-testid="value">{`${Math.round(v.h)} ${v.s.toFixed(2)} ${v.v.toFixed(2)}`}</output>
      <output data-testid="hex">{hsvToHex(v)}</output>
    </>
  );
}

describe('HsvPanel', () => {
  it('初始位置由呼叫端指定（不從色碼反推），標記與色相滑桿反映目前的值', () => {
    render(<Controlled initial={{ h: 268, s: 0.3, v: 0.18 }} />);
    expect(screen.getByRole('group', { name: '顏色面板' })).toBeInTheDocument();
    const area = screen.getByRole('slider', { name: '彩度與明度' });
    expect(area).toHaveAttribute('aria-valuetext', '彩度 30%，明度 18%');
    expect(screen.getByRole('slider', { name: '色相' })).toHaveAttribute('aria-valuenow', '268');
    const marker = screen.getByTestId('hsv-marker');
    expect(marker.style.left).toBe('30%');
    expect(marker.style.top).toBe('82%');
  });

  it('方向鍵調整彩度與明度（Shift 一次 0.1），夾在 0～1', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={{ h: 120, s: 0.5, v: 0.5 }} />);
    expect(screen.getByTestId('hex')).toHaveTextContent('#408040');
    const area = screen.getByRole('slider', { name: '彩度與明度' });
    area.focus();
    await user.keyboard('{ArrowRight}{ArrowUp}{ArrowUp}');
    expect(screen.getByTestId('value')).toHaveTextContent('120 0.51 0.52');
    await user.keyboard(
      '{Shift>}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{/Shift}',
    );
    expect(screen.getByTestId('value')).toHaveTextContent('120 0.51 0.00');
  });

  it('按下拖曳選色，拖到面板外時夾在邊界', () => {
    render(<Controlled initial={{ h: 0, s: 0.5, v: 0.5 }} />);
    const area = screen.getByRole('slider', { name: '彩度與明度' });
    area.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
    fireEvent.pointerDown(area, { clientX: 60, clientY: 82, pointerId: 1 });
    expect(screen.getByTestId('value')).toHaveTextContent('0 0.30 0.18');
    expect(screen.getByTestId('hex')).toHaveTextContent('#2e2020');
    fireEvent.pointerDown(area, { clientX: 500, clientY: -40, pointerId: 1 });
    expect(screen.getByTestId('value')).toHaveTextContent('0 1.00 1.00');
  });

  it('色相滑桿：方向鍵改色相，彩度與明度不變', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={{ h: 268, s: 0.3, v: 0.18 }} />);
    screen.getByRole('slider', { name: '色相' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByTestId('value')).toHaveTextContent('270 0.30 0.18');
  });
});

describe('Segmented 的 onReselect', () => {
  it('再按一次已選的選項時呼叫 onReselect，值不變', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    function Demo() {
      const [v, setV] = useState<'a' | 'b'>('a');
      return (
        <Segmented
          aria-label="選項"
          value={v}
          onValueChange={(n) => {
            calls.push(`change:${n}`);
            setV(n);
          }}
          onReselect={(n) => calls.push(`again:${n}`)}
          options={[
            { value: 'a', label: '甲' },
            { value: 'b', label: '乙' },
          ]}
        />
      );
    }
    render(<Demo />);
    await user.click(screen.getByRole('radio', { name: '甲' }));
    await user.click(screen.getByRole('radio', { name: '乙' }));
    await user.click(screen.getByRole('radio', { name: '乙' }));
    expect(calls).toEqual(['again:a', 'change:b', 'again:b']);
    expect(screen.getByRole('radio', { name: '乙' })).toHaveAttribute('aria-checked', 'true');
  });
});
