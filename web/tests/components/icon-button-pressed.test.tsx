// @vitest-environment jsdom
/**
 * IconButton 的按下狀態（floor-plan 對等驗證後修正）：按下時換成強調色的底與框，
 * 不和變體的底色（ghost 的 bg-transparent 等）同時出現——兩個底色並存時哪個生效看 CSS 的順序，按下的樣子會被蓋掉。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconButton } from '@/ui';

const classesOf = (name: string) => screen.getByRole('button', { name }).className.split(/\s+/);

describe('IconButton pressed', () => {
  it.each(['ghost', 'secondary', 'primary'] as const)('%s：按下時只有強調色的底', (variant) => {
    render(
      <>
        <IconButton label="按下" icon={<span />} variant={variant} pressed noTooltip />
        <IconButton label="沒按下" icon={<span />} variant={variant} pressed={false} noTooltip />
      </>,
    );
    const on = classesOf('按下');
    expect(on).toContain('bg-accent-soft');
    expect(on.filter((c) => /^bg-/.test(c))).toEqual(['bg-accent-soft']);
    expect(on.filter((c) => /^text-(?!xs|sm|base)/.test(c))).toEqual(['text-accent']);
    const off = classesOf('沒按下');
    expect(off).not.toContain('bg-accent-soft');
  });
});
