import { EASING_CHOICES, type EasingName } from '@/core/timeline';
import {
  ColorField,
  Field,
  FontPicker,
  GradientField,
  Section,
  Select,
  Slider,
  TextInput,
  Toggle,
} from '@/ui';
import { useDemo } from '../store';

/** 示範動畫的設定：實際工具的設定面板就是這樣組的（Section → Field → 控制項） */
export function DemoSettingsPanel() {
  const s = useDemo((st) => st.data);
  const update = useDemo((st) => st.update);
  return (
    <div className="flex flex-col gap-3">
      <Section title="文字" persistKey="_gallery:demo-text">
        <Field label="判定文字" hint="改了會自動存檔；Ctrl＋Z 復原。">
          <TextInput
            value={s.text}
            onChange={(e) =>
              update((d) => {
                d.text = e.target.value;
              })
            }
            maxLength={12}
          />
        </Field>
        <Field label="字型">
          <FontPicker
            value={s.font}
            onChange={(font) =>
              update((d) => {
                d.font = font;
              })
            }
            previewText="大成功！大失敗！"
          />
        </Field>
        <Field label="文字顏色">
          <ColorField
            value={s.textColor}
            onChange={(c) =>
              update((d) => {
                d.textColor = c;
              })
            }
            alpha
          />
        </Field>
        <Field label="外框顏色">
          <ColorField
            value={s.outlineColor}
            onChange={(c) =>
              update((d) => {
                d.outlineColor = c;
              })
            }
            alpha
          />
        </Field>
      </Section>
      <Section title="骰子" persistKey="_gallery:demo-die">
        <Field label="骰子漸層">
          <GradientField
            value={s.die}
            onChange={(g) =>
              update((d) => {
                d.die = g;
              })
            }
          />
        </Field>
      </Section>
      <Section title="動態" persistKey="_gallery:demo-motion">
        <Field label="落下的緩動曲線">
          <Select<EasingName>
            value={s.ease}
            onValueChange={(v) =>
              update((d) => {
                d.ease = v;
              })
            }
            options={EASING_CHOICES}
          />
        </Field>
        <Field label="停留時間">
          <Slider
            value={s.hold}
            onChange={(v) =>
              update((d) => {
                d.hold = v;
              })
            }
            min={0.2}
            max={4}
            step={0.1}
            unit="秒"
          />
        </Field>
        <Field label="星星" layout="inline">
          <Toggle
            checked={s.sparkles}
            onCheckedChange={(v) =>
              update((d) => {
                d.sparkles = v;
              })
            }
          />
        </Field>
        <Field label="星星數量">
          <Slider
            value={s.sparkleCount}
            onChange={(v) =>
              update((d) => {
                d.sparkleCount = v;
              })
            }
            min={0}
            max={40}
            disabled={!s.sparkles}
          />
        </Field>
        <Field label="亂數種子" hint="同一個種子，星星的位置與閃爍每次都一樣。">
          <TextInput
            value={s.seed}
            onChange={(e) =>
              update((d) => {
                d.seed = e.target.value;
              })
            }
          />
        </Field>
      </Section>
    </div>
  );
}
