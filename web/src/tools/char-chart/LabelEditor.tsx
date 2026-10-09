/**
 * 在圖上直接改字（按兩下標題或軸名時出現）：輸入欄疊在那個字上，Enter 或離開欄位時套用、Esc 取消。
 * 欄位維持固定的螢幕大小（預覽縮小時不會跟著變小）。
 */
import { useEffect, useRef, useState } from 'react';
import { TextInput, useStageScale } from '@/ui';

export function LabelEditor({
  x,
  y,
  value,
  label,
  maxLength,
  wide,
  align = 'center',
  onCommit,
  onClose,
}: {
  /** 字的位置（畫布 px）：align='center' 時是中心，'left' 時是左緣的中點 */
  x: number;
  y: number;
  value: string;
  label: string;
  maxLength: number;
  wide?: boolean;
  align?: 'center' | 'left';
  onCommit: (value: string) => void;
  onClose: () => void;
}) {
  const k = 1 / useStageScale();
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (apply: boolean) => {
    if (done.current) return;
    done.current = true;
    if (apply && text !== value) onCommit(Array.from(text).slice(0, maxLength).join(''));
    onClose();
  };
  return (
    <div
      className="absolute z-10"
      data-testid="label-editor"
      style={{
        left: x,
        top: y,
        transform: `translate(${align === 'center' ? '-50%' : '0'}, -50%) scale(${k})`,
        transformOrigin: align === 'center' ? 'center' : 'left center',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <TextInput
        ref={input}
        aria-label={label}
        value={text}
        className={wide ? 'w-72 text-center text-base shadow-2' : 'w-40 text-center shadow-2'}
        onChange={(e) => setText(Array.from(e.target.value).slice(0, maxLength).join(''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
      />
    </div>
  );
}
