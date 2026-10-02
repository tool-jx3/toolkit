/**
 * 設定面板共用的小元件與 hook：基準元素、文字欄的「打字中保留原文、離開才整理」、復原的手勢。
 */
import { type ReactNode, useState } from 'react';
import { historyGesture } from '@/core/storage';
import { TextInput, type TextInputProps } from '@/ui';
import type { McElement } from './model';
import { useProject, useUi } from './store';

export const gesture = historyGesture(useProject);

/** 目前的基準元素（作品或選取改變時更新） */
export function usePrimary(): McElement | null {
  const id = useUi((s) => s.primary);
  return useProject((s) => (id ? (s.data.elements.find((el) => el.id === id) ?? null) : null));
}

/**
 * 文字欄：聚焦時保留使用者打的原文（例如「20,」不會被整理成「20」），每次輸入都交給 onText；
 * 離開時呼叫 onDone（例如空白時補預設名稱）。從聚焦到離開算一步復原。
 */
export function BufferedText({
  value,
  onText,
  onDone,
  ...rest
}: Omit<TextInputProps, 'value' | 'onChange' | 'onFocus' | 'onBlur'> & {
  value: string;
  onText: (text: string) => void;
  onDone?: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextInput
      {...rest}
      value={draft ?? value}
      onFocus={() => {
        gesture.begin();
        setDraft(value);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onText(e.target.value);
      }}
      onBlur={(e) => {
        const text = e.target.value;
        setDraft(null);
        onDone?.(text);
        gesture.commit();
      }}
    />
  );
}

/** 沒有選取時的提示 */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}
