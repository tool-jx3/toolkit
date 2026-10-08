/**
 * 輸出：CCFOLIA 角色 JSON／聊天面板，「複製」與「擲骰並複製」。
 */
import { Dices } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { copyText } from '@/core/files';
import { Button, Segmented, selectAllInPlace, TextOutputPanel, useToast } from '@/ui';
import { getCurrent, rollAll } from './actions';
import { type Npc, type OutputKind, outputText } from './logic';
import { useView } from './store';
import { S } from './strings';

const KIND_OPTIONS: { value: OutputKind; label: string }[] = [
  { value: 'json', label: S.output.json },
  { value: 'palette', label: S.output.palette },
];

export function OutputPanel({ npc }: { npc: Npc }) {
  const kind = useView((v) => v.data.output);
  const patchView = useView((v) => v.patch);
  const toast = useToast();
  const text = useMemo(() => outputText(npc, kind), [npc, kind]);
  const box = useRef<HTMLDivElement>(null);

  /**
   * 擲骰並複製：走同一個「全部擲骰」（跳過看不懂的算式時通知裡說明），再複製擲完的輸出；
   * 之後和「複製」一樣把輸出全選（不捲動），剪貼簿不能用時可以直接 Ctrl＋C。
   */
  const rollAndCopy = async () => {
    const skipped = rollAll();
    const next = outputText(getCurrent(), useView.getState().data.output);
    const ok = await copyText(next);
    const area = box.current?.querySelector('textarea');
    if (area) selectAllInPlace(area);
    if (!ok) {
      toast({ title: S.output.copyFailed, description: S.output.copyFailedHint, tone: 'danger' });
    } else if (skipped.length) {
      toast({
        title: S.output.rollCopied,
        description: S.output.rollCopiedSkipped(skipped),
        tone: 'warning',
      });
    } else {
      toast({ title: S.output.rollCopied, tone: 'success', duration: 2000 });
    }
  };

  return (
    <div ref={box} className="flex min-w-0 flex-col gap-2" data-testid="npc-output">
      <Segmented
        aria-label={S.output.kind}
        fullWidth
        value={kind}
        onValueChange={(v) => patchView({ output: v as OutputKind })}
        options={KIND_OPTIONS}
      />
      <TextOutputPanel
        text={text}
        title={kind === 'json' ? S.output.jsonTitle : S.output.paletteTitle}
        count={null}
        hint={kind === 'json' ? S.output.jsonHint : S.output.paletteHint}
        wrap="off"
        font="mono"
        copyLabel={S.output.copy}
        messages={{ copied: S.output.copied }}
        actions={
          <Button icon={<Dices />} onClick={() => void rollAndCopy()}>
            {S.output.rollCopy}
          </Button>
        }
      />
    </div>
  );
}
