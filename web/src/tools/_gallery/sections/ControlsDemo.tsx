import { Bold, Italic, Plus, Save, Trash2, Underline } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Field,
  FieldRow,
  IconButton,
  NativeNumberInput,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  TextArea,
  TextInput,
  Toggle,
} from '@/ui';

/** 基本控制項的各種狀態 */
export function ControlsDemo() {
  const [on, setOn] = useState(true);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const [style, setStyle] = useState<'bold' | 'italic' | 'underline'>('bold');
  const [pick, setPick] = useState('d20');
  const [name, setName] = useState('艾琳・薇斯特');
  const [bad, setBad] = useState('abc');
  const [memo, setMemo] = useState('多行文字。\n第二行。');
  const [num, setNum] = useState(512);
  const [raw, setRaw] = useState('24');
  const [size, setSize] = useState(48);
  const [opacity, setOpacity] = useState(0.8);
  const [pressed, setPressed] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <Section title="按鈕 Button／IconButton">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Save />}>
            主要
          </Button>
          <Button>次要</Button>
          <Button variant="ghost">幽靈</Button>
          <Button variant="danger" icon={<Trash2 />}>
            刪除
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">小</Button>
          <Button size="md">中</Button>
          <Button size="lg">大</Button>
          <Button disabled>停用</Button>
          <Button loading>處理中</Button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <IconButton label="新增" icon={<Plus />} />
          <IconButton label="新增（次要）" icon={<Plus />} variant="secondary" />
          <IconButton
            label="粗體（切換）"
            icon={<Bold />}
            pressed={pressed}
            onClick={() => setPressed(!pressed)}
          />
          <IconButton label="停用" icon={<Trash2 />} disabled />
        </div>
      </Section>
      <Section title="開關 Toggle">
        <Toggle label="顯示陰影" checked={on} onCheckedChange={setOn} />
        <Toggle label="停用的開關" checked={false} onCheckedChange={() => {}} disabled />
        <Field label="放在 Field 裡（inline）" layout="inline" hint="標籤在左、開關在右。">
          <Toggle checked={on} onCheckedChange={setOn} />
        </Field>
      </Section>
      <Section title="分段選擇 Segmented">
        <Field label="對齊">
          <Segmented
            value={align}
            onValueChange={setAlign}
            options={[
              { value: 'left', label: '靠左' },
              { value: 'center', label: '置中' },
              { value: 'right', label: '靠右' },
            ]}
          />
        </Field>
        <Field label="只有圖示（小）">
          <Segmented
            size="sm"
            value={style}
            onValueChange={setStyle}
            options={[
              { value: 'bold', label: '', ariaLabel: '粗體', icon: <Bold /> },
              { value: 'italic', label: '', ariaLabel: '斜體', icon: <Italic /> },
              {
                value: 'underline',
                label: '',
                ariaLabel: '底線（停用）',
                icon: <Underline />,
                disabled: true,
              },
            ]}
          />
        </Field>
      </Section>
      <Section title="下拉選單 Select">
        <Field label="骰子">
          <Select
            value={pick}
            onValueChange={setPick}
            options={[
              {
                label: '常用',
                options: [
                  { value: 'd20', label: 'D20' },
                  { value: 'd100', label: 'D100', description: '百面骰（CoC）' },
                ],
              },
              {
                label: '其他',
                options: [
                  { value: 'd6', label: 'D6' },
                  { value: 'd4', label: 'D4（停用）', disabled: true },
                ],
              },
            ]}
          />
        </Field>
        <Field label="停用">
          <Select
            value="a"
            onValueChange={() => {}}
            options={[{ value: 'a', label: '無法選擇' }]}
            disabled
          />
        </Field>
      </Section>
      <Section title="文字輸入 TextInput／TextArea">
        <Field label="角色名稱" hint="最多 20 字。">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        </Field>
        <Field
          label="色碼（錯誤狀態）"
          error={/^#[0-9a-f]{6}$/i.test(bad) ? undefined : '請輸入 #rrggbb 格式'}
        >
          <TextInput value={bad} onChange={(e) => setBad(e.target.value)} />
        </Field>
        <Field label="停用">
          <TextInput value="不能編輯" disabled readOnly />
        </Field>
        <Field label="備註">
          <TextArea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} />
        </Field>
      </Section>
      <Section title="數字 NumberInput／NativeNumberInput／Slider">
        <FieldRow>
          <Field label="寬度">
            <NumberInput value={num} onChange={setNum} min={1} max={4096} unit="px" />
          </Field>
          <Field label="停用">
            <NumberInput value={42} onChange={() => {}} disabled />
          </Field>
        </FieldRow>
        <Field
          label="原生數字欄"
          labelSuffix={`值：「${raw}」`}
          hint="值就是瀏覽器數字欄的值字串：全形「１２」是 12，「5-」這類無效的寫法是空字串；微調照原生規則（10～100）。"
        >
          <NativeNumberInput
            value={raw}
            onChange={setRaw}
            min={10}
            max={100}
            unit="格"
            stepLabels={{ up: '原生數字欄：增加', down: '原生數字欄：減少' }}
          />
        </Field>
        <Field label="字級" hint="↑／↓ 調整，Shift 一次 10。">
          <Slider value={size} onChange={setSize} min={8} max={200} unit="px" />
        </Field>
        <Field label="不透明度（小數）">
          <Slider value={opacity} onChange={setOpacity} min={0} max={1} step={0.01} />
        </Field>
        <Field label="停用的滑桿">
          <Slider value={30} onChange={() => {}} min={0} max={100} unit="%" disabled />
        </Field>
      </Section>
    </div>
  );
}
