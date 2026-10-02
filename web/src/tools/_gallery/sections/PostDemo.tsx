/**
 * 貼文編輯欄（PostEditor）與 core/social 的示範：可以直接編輯的貼文、X 的字數、文字樣式（花式英數字）、在游標位置插入。
 */
import { useRef, useState } from 'react';
import { toUnicodeStyle, UNICODE_TEXT_STYLES, type UnicodeTextStyle } from '@/core/social';
import { Chips, IconButton, PostEditor, type PostEditorHandle, Section } from '@/ui';

const SOURCE = ['Call of Cthulhu', '《霧港燈塔》', '', 'KP｜阿德', 'END 2 全員生還'];

export function PostDemo() {
  const editor = useRef<PostEditorHandle>(null);
  const [style, setStyle] = useState<UnicodeTextStyle>('sansBoldItalic');
  const build = (s: UnicodeTextStyle) =>
    SOURCE.map((line, i) => (i === 0 || i === 4 ? toUnicodeStyle(line, s) : line)).join('\n');
  const [text, setText] = useState(() => build('sansBoldItalic'));
  return (
    <Section title="貼文編輯欄（PostEditor＋core/social）">
      <p className="m-0 text-sm text-muted">
        可以直接編輯；字數用 X 的簡易計算（全形算
        2）。上方按鈕換文字樣式（只換第一行與最後一行的英數字），下方按鈕在游標位置插入符號。
      </p>
      <PostEditor
        ref={editor}
        value={text}
        onChange={(v) => setText(v)}
        rows={6}
        postLabel={null}
        toolbar={
          <div className="flex flex-wrap gap-1">
            {UNICODE_TEXT_STYLES.map((st) => (
              <IconButton
                key={st.id}
                label={st.label}
                size="sm"
                variant="secondary"
                pressed={style === st.id}
                icon={<span className="font-ui text-[15px] leading-none">{st.sample}</span>}
                onClick={() => {
                  setStyle(st.id);
                  setText(build(st.id));
                }}
              />
            ))}
          </div>
        }
      />
      <Chips
        aria-label="插入符號"
        items={['★', '✦', '━━━━━━', '🎲']}
        onPick={(v) => editor.current?.insert(v)}
      />
    </Section>
  );
}
