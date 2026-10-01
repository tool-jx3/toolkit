/**
 * 預覽用的自訂測試訊息列：發言者、種類（聊天／擲骰…）、文字欄、送出。
 * - 文字以第一個「|」（全形「｜」也可以）分隔「指令」與「結果」：`CC<=50 | (1D100<=50) ＞ 23 ＞ 成功`。
 * - 按送出或 Enter 送出（輸入法選字中的 Enter 不算），成功後清空文字欄。
 * - 文字空白 → 錯誤提示；需要結果的種類卻沒有「|」後面的結果 → 錯誤提示並舉例。
 */
import { Send } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { Select } from './Select';
import { TextInput } from './TextInput';

export interface ComposerOption {
  value: string;
  label: string;
  /** 補充說明（例如「沒有立繪」） */
  description?: string;
}

export interface ComposerKind extends ComposerOption {
  /** 這個種類需要「|」後面的結果（擲骰） */
  needsResult?: boolean;
}

export interface ComposedMessage {
  speaker: string;
  kind: string;
  /** 「|」前面（聊天時是整段內文） */
  command: string;
  /** 「|」後面；沒有時 null */
  result: string | null;
}

/** 以第一個「|」或「｜」分開指令與結果（各自去頭尾空白；結果空白時 null） */
export function parseComposerText(text: string): { command: string; result: string | null } {
  const s = String(text ?? '');
  const i = s.search(/[|｜]/);
  if (i < 0) return { command: s.trim(), result: null };
  const result = s.slice(i + 1).trim();
  return { command: s.slice(0, i).trim(), result: result || null };
}

export interface MessageComposerProps {
  speakers: readonly ComposerOption[];
  speaker: string;
  onSpeakerChange: (value: string) => void;
  kinds: readonly ComposerKind[];
  kind: string;
  onKindChange: (value: string) => void;
  onSend: (message: ComposedMessage) => void;
  placeholder?: string;
  /** 缺結果時錯誤訊息裡的例子 */
  resultExample?: string;
  sendLabel?: string;
  className?: string;
}

export function MessageComposer({
  speakers,
  speaker,
  onSpeakerChange,
  kinds,
  kind,
  onKindChange,
  onSend,
  placeholder = '內文；擲骰時在「|」後面寫結果',
  resultExample = 'CC<=50 | (1D100<=50) ＞ 23 ＞ 成功',
  sendLabel = '送出',
  className,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const k = kinds.find((x) => x.value === kind);

  const send = () => {
    const { command, result } = parseComposerText(text);
    if (!command && !result) return setError('請先輸入內容。');
    if (k?.needsResult && !result)
      return setError(`擲骰要在「|」後面寫結果，例如：${resultExample}`);
    setError(null);
    onSend({ speaker, kind, command, result });
    setText('');
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Select
          aria-label="發言者"
          value={speaker}
          onValueChange={onSpeakerChange}
          options={speakers.map((s) => ({
            value: s.value,
            label: s.label,
            description: s.description,
          }))}
          className="w-32 shrink-0"
          size="sm"
        />
        <Select
          aria-label="種類"
          value={kind}
          onValueChange={onKindChange}
          options={kinds.map((x) => ({
            value: x.value,
            label: x.label,
            description: x.description,
          }))}
          className="w-28 shrink-0"
          size="sm"
        />
      </div>
      <div className="flex min-w-0 gap-2">
        <TextInput
          aria-label="測試訊息"
          aria-describedby={error ? errorId : undefined}
          invalid={!!error}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            send();
          }}
          className="flex-1"
        />
        <Button variant="primary" icon={<Send />} onClick={send}>
          {sendLabel}
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="m-0 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
