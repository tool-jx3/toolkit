/**
 * 不是 React 的程式（ops.ts）要開確認、輸入、選擇對話框時用的橋。App 掛載時換成共用元件的版本。
 */
import type { ConfirmOptions } from '@/ui';

export interface PromptOptions {
  title: string;
  description?: string;
  label: string;
  value?: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  confirmLabel?: string;
  /** 第二個欄位（例如樣板的標題語） */
  second?: { label: string; value?: string; maxLength?: number };
}

export interface PromptResult {
  value: string;
  second: string;
}

export interface ChoiceItem {
  value: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export const bridge = {
  confirm: async (o: ConfirmOptions): Promise<boolean> => window.confirm(String(o.title)),
  prompt: async (o: PromptOptions): Promise<PromptResult | null> => {
    const v = window.prompt(o.title, o.value ?? '');
    return v == null ? null : { value: v, second: o.second?.value ?? '' };
  },
  choose: async (o: {
    title: string;
    description?: string;
    choices: ChoiceItem[];
  }): Promise<string | null> => o.choices[0]?.value ?? null,
};
