/**
 * 工具列：套用到（文字／背景）、樣式、經典 8 色、自訂 8 色、效果。
 * 按鈕按下時不搶走編輯區的焦點（選取範圍留著），按一下就套用到選取的文字。
 */
import { type PointerEvent, type ReactNode, useId } from 'react';
import { cn, Segmented, Tooltip, withShortcut } from '@/ui';
import { BG_CODES, FG_CODES, STYLE_CODES } from './ansi';
import type { Target } from './model';
import {
  CLASSIC_INDEXES,
  EFFECT_IDS,
  type EffectColors,
  type EffectId,
  THEMES,
  type ThemeId,
} from './palette';
import { S } from './strings';

export interface ToolbarProps {
  target: Target;
  onTarget: (t: Target) => void;
  theme: ThemeId;
  custom: readonly string[];
  colors: EffectColors;
  /** 樣式與經典色（代碼已依「套用到」換好） */
  onCode: (code: number) => void;
  onCustom: (hex: string) => void;
  onEffect: (effect: EffectId) => void;
}

/** 不搶焦點：選取範圍留在編輯區 */
const keepFocus = (e: PointerEvent) => e.preventDefault();

const SHORTCUT_OF: Record<number, string | undefined> = { 1: 'mod+b', 3: 'mod+i', 4: 'mod+u' };

const STYLE_LOOK: Record<number, string> = {
  0: '',
  1: 'font-bold',
  3: 'italic',
  4: 'underline',
  9: 'line-through',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-12 shrink-0 text-xs font-semibold text-muted">{label}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: 一列按鈕的分組 */}
      <div role="group" aria-label={label} className="flex min-w-0 flex-1 flex-wrap gap-1">
        {children}
      </div>
    </div>
  );
}

const swatchClass =
  'h-7 w-8 shrink-0 rounded-sm border border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:scale-105 transition-transform duration-(--duration-fast)';

function effectBackground(effect: EffectId, colors: EffectColors): string {
  if (effect === 'rainbow') return 'linear-gradient(in hsl longer hue 90deg, #E44, #E44)';
  if (effect === 'gradient')
    return `linear-gradient(90deg, ${colors.gradient[0]}, ${colors.gradient[1]})`;
  return `repeating-linear-gradient(90deg, ${colors.zebra[0]} 0 4px, ${colors.zebra[1]} 4px 8px)`;
}

export function Toolbar({
  target,
  onTarget,
  theme,
  custom,
  colors,
  onCode,
  onCustom,
  onEffect,
}: ToolbarProps) {
  const palette = THEMES[theme].ansi;
  const fg = target === 'fg';
  const targetLabel = useId();
  return (
    <div
      role="toolbar"
      aria-label={S.toolbar}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span id={targetLabel} className="w-12 shrink-0 text-xs font-semibold text-muted">
          {S.target}
        </span>
        <Segmented<Target>
          aria-labelledby={targetLabel}
          size="sm"
          value={target}
          onValueChange={onTarget}
          options={[
            { value: 'fg', label: S.targetFg },
            { value: 'bg', label: S.targetBg },
          ]}
        />
        <span className="min-w-0 flex-1 text-xs text-muted">{S.targetHint}</span>
      </div>
      <Row label={S.rowStyle}>
        {STYLE_CODES.map((c) => {
          const combo = SHORTCUT_OF[c];
          const tip = combo ? withShortcut(S.styleTips[c], combo) : S.styleTips[c];
          return (
            <Tooltip key={c} content={tip}>
              <button
                type="button"
                data-code={c}
                onPointerDown={keepFocus}
                onClick={() => onCode(c)}
                className="inline-flex h-7 items-center rounded-md border border-border bg-surface-2 px-2.5 text-xs text-fg hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className={STYLE_LOOK[c]}>{S.styles[c]}</span>
              </button>
            </Tooltip>
          );
        })}
      </Row>
      <Row label={S.rowClassic}>
        {CLASSIC_INDEXES.map((i) => {
          const name = S.classicNames[i];
          const c = fg ? FG_CODES[i] : BG_CODES[i];
          return (
            <Tooltip key={i} content={name}>
              <button
                type="button"
                aria-label={S.classicLabel(name)}
                data-code={c}
                onPointerDown={keepFocus}
                onClick={() => onCode(c)}
                className={swatchClass}
                style={{ background: palette[i] }}
              />
            </Tooltip>
          );
        })}
      </Row>
      <Row label={S.rowCustom}>
        {custom.map((hex, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 固定 8 格，位置就是身分
          <Tooltip key={i} content={hex}>
            <button
              type="button"
              aria-label={S.customLabel(i, hex)}
              data-hex={hex}
              onPointerDown={keepFocus}
              onClick={() => onCustom(hex)}
              className={swatchClass}
              style={{ background: hex }}
            />
          </Tooltip>
        ))}
      </Row>
      <Row label={S.rowEffect}>
        {EFFECT_IDS.map((id) => (
          <Tooltip key={id} content={S.effectTips[id]}>
            <button
              type="button"
              data-effect={id}
              onPointerDown={keepFocus}
              onClick={() => onEffect(id)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 text-xs text-fg hover:bg-surface-3',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              )}
            >
              <span
                aria-hidden
                className="inline-block h-3.5 w-7 rounded-sm border border-border"
                style={{ background: effectBackground(id, colors) }}
              />
              {S.effects[id]}
            </button>
          </Tooltip>
        ))}
      </Row>
    </div>
  );
}
