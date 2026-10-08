/**
 * 輸出：CCFOLIA 角色 JSON／聊天面板，「複製」與「擲骰並複製」。
 */
import { Dices } from 'lucide-react';
import { useMemo } from 'react';
import { copyText } from '@/core/files';
import { Button, Segmented, TextOutputPanel, useToast } from '@/ui';
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

  /** 擲骰並複製：先全部擲骰，再複製擲完的輸出 */
  const rollAndCopy = async () => {
    rollAll();
    const next = outputText(getCurrent(), useView.getState().data.output);
    if (await copyText(next)) {
      toast({ title: S.output.rollCopied, tone: 'success', duration: 2000 });
    } else {
      toast({ title: S.output.copyFailed, description: S.output.copyFailedHint, tone: 'danger' });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="npc-output">
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
