/**
 * 表單用的小控制項：數字欄（打字中允許暫時空白、離開時才補 0）與顏色列（調色盤＋色碼欄＋聊天欄預覽）。
 */
import { type KeyboardEvent, useState } from 'react';
import { ColorField, cn, NativeNumberInput, TextInput, useFieldControl } from '@/ui';
import { colorCodeText, numberFieldValue, settleColorCode, typeColorCode } from './logic';
import { S } from './strings';

export interface NumberCellProps {
  value: number;
  onChange: (value: number) => void;
  'aria-label'?: string;
  unit?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * 數字欄（規格 F18；第 7 節裁定用共用數字欄）：照瀏覽器原生數字欄的規則解讀（「1e2」＝100、可小數與負數），
 * 欄位清空時輸出立刻當成 0，但欄位本身留白（可以先打負號），離開欄位時才顯示「0」。
 */
export function NumberCell({ value, onChange, unit, size, className, ...rest }: NumberCellProps) {
  /* 打字中的原生值字串；沒在打字時是 null，直接顯示目前的值 */
  const [draft, setDraft] = useState<string | null>(null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只是接住數字欄的離開（離開時改回顯示目前的值）
    <div className={cn('min-w-0', className)} onBlur={() => setDraft(null)}>
      <NativeNumberInput
        value={draft ?? String(value)}
        onChange={(raw) => {
          setDraft(raw);
          onChange(numberFieldValue(raw));
        }}
        aria-label={rest['aria-label']}
        unit={unit}
        size={size}
      />
    </div>
  );
}

/** CCFOLIA 深色聊天欄的底色（模擬頁 ccfolia/mock/chat.ts 的面板色疊在 #202020 上） */
const CHAT_PANEL_BACKGROUND = '#2a2a2a';

export interface ColorRowProps {
  color: string;
  onChange: (color: string) => void;
}

/**
 * 顏色（F20～F22）：色塊開調色盤（共用 ColorField，選色後是小寫 #rrggbb）、
 * 「#」＋色碼欄（規格 3.4）、聊天欄預覽（不能點）。
 */
export function ColorRow({ color, onChange }: ColorRowProps) {
  const field = useFieldControl({});
  const [text, setText] = useState(() => colorCodeText(color));
  const [shown, setShown] = useState(color);
  /* 顏色從外面改變（調色盤、套用匯入、重設、打到 6 位）時，色碼欄跟著顯示目前的值 */
  if (shown !== color) {
    setShown(color);
    setText(colorCodeText(color));
  }

  const settle = () => {
    const next = settleColorCode(text, color);
    if (next !== color) onChange(next);
    setText(colorCodeText(next));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ColorField
        value={color}
        onChange={onChange}
        showInput={false}
        aria-label={S.form.colorPicker}
        className="w-auto"
      />
      <div className="relative inline-flex w-[7.5rem] shrink-0 items-center">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 font-mono text-sm text-muted"
        >
          #
        </span>
        <TextInput
          id={field.id}
          aria-label={S.form.colorCode}
          aria-describedby={field['aria-describedby']}
          spellCheck={false}
          autoComplete="off"
          value={text}
          onChange={(e) => {
            const r = typeColorCode(e.target.value, text);
            setText(r.text);
            if (r.color && r.color !== color) {
              /* 打到 6 位時欄位保留打的大小寫，離開欄位才顯示目前顏色（與舊版相同） */
              setShown(r.color);
              onChange(r.color);
            }
          }}
          onBlur={settle}
          onKeyDown={onKeyDown}
          className="w-full pl-6 font-mono"
        />
      </div>
      <span
        role="img"
        aria-label={S.form.chatPreviewAria}
        data-testid="chat-preview"
        className="inline-flex h-8 shrink-0 cursor-default select-none items-center rounded-md border border-border px-3 text-sm font-bold"
        style={{ background: CHAT_PANEL_BACKGROUND, color }}
      >
        {S.form.chatPreview}
      </span>
    </div>
  );
}
