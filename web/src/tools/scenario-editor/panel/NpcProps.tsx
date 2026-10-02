/**
 * NPC 卡的設定（F160）：系統、讀音、名字、立場、立繪、開啟角色卡、CCFOLIA。
 */
import { Button, Field, Section, Select, Slider, TextInput } from '@/ui';
import { bridge } from '../bridge';
import { copyCcfolia, useCcfUi } from '../dialogs/CcfDialogs';
import { pickImage } from '../images';
import { ensureNpc } from '../model/npc/model';
import type { Block, Npc, NpcSystem } from '../model/types';
import { editBlock, setUi } from '../store';
import { S } from '../strings';
import { PreviewButton } from './BlockPanel';

export const SYS_OPTIONS: { value: NpcSystem; label: string }[] = [
  { value: 'emoklore', label: 'Emoklore TRPG' },
  { value: 'dx3rd', label: 'Double Cross 3rd' },
  { value: 'coc', label: '克蘇魯神話 TRPG' },
];

export function editNpc(id: string, fn: (np: Npc) => void): void {
  editBlock(id, (b) => {
    const np = ensureNpc(b.npc);
    b.npc = np;
    fn(np);
  });
}

export async function addArt(id: string): Promise<void> {
  const img = await pickImage();
  if (!img) return;
  editNpc(id, (np) => {
    np.art = img.data;
  });
}

export async function removeArt(id: string): Promise<void> {
  if (!(await bridge.confirm({ title: S.confirm.removeArt, danger: true, confirmLabel: '移除' })))
    return;
  editNpc(id, (np) => {
    np.art = null;
  });
}

export function NpcProps({ b }: { b: Block }) {
  const np = b.npc;
  if (!np) return null;
  return (
    <Section title="NPC 卡" fixed>
      <Field label="系統">
        <Select
          size="sm"
          value={np.sys}
          onValueChange={(v) => editNpc(b.id, (x) => (x.sys = v))}
          options={SYS_OPTIONS}
        />
      </Field>
      {np.sys === 'coc' ? (
        <Field label="版本">
          <Select
            size="sm"
            value={np.coc.ver}
            onValueChange={(v) => editNpc(b.id, (x) => (x.coc.ver = v))}
            options={[
              { value: '7', label: '第 7 版' },
              { value: '6', label: '第 6 版' },
            ]}
          />
        </Field>
      ) : null}
      <Field label="讀音">
        <TextInput
          value={np.kana}
          onChange={(e) => editNpc(b.id, (x) => (x.kana = e.target.value))}
        />
      </Field>
      <Field label="名字">
        <TextInput
          value={np.name}
          onChange={(e) => editNpc(b.id, (x) => (x.name = e.target.value))}
        />
      </Field>
      <Field label="年齡・性別・職業／立場">
        <TextInput
          value={np.role}
          onChange={(e) => editNpc(b.id, (x) => (x.role = e.target.value))}
        />
      </Field>
      <Field label="立繪">
        <div className="flex flex-wrap items-center gap-1">
          {np.art ? (
            <img src={np.art} alt="" className="h-12 w-12 rounded-sm bg-surface-3 object-contain" />
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => void addArt(b.id)}>
            {np.art ? '更換立繪' : '加上立繪'}
          </Button>
          {np.art ? (
            <Button size="sm" variant="ghost" onClick={() => void removeArt(b.id)}>
              移除
            </Button>
          ) : null}
        </div>
      </Field>
      {np.art ? (
        <Field label="立繪的寬度" hint="卡片寬的百分比。">
          <Slider
            value={np.artW}
            min={15}
            max={50}
            unit="%"
            onChange={(v) => editNpc(b.id, (x) => (x.artW = Math.round(v)))}
          />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={() => setUi({ npcEdit: b.id })}>
          開啟角色卡
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void copyCcfolia(b.id)}>
          複製 CCFOLIA 棋子
        </Button>
        <Button size="sm" variant="secondary" onClick={() => useCcfUi.setState({ importId: b.id })}>
          讀入 CCFOLIA 棋子
        </Button>
        {np.sys === 'dx3rd' ? (
          <Button size="sm" variant="secondary" onClick={() => useCcfUi.setState({ ytId: b.id })}>
            讀入 Yutosheet 的表格
          </Button>
        ) : null}
        <PreviewButton id={b.id} />
      </div>
    </Section>
  );
}
