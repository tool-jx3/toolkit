/**
 * 打開分享連結時的唯讀檢視（規格 F41）：卡片圖（下載、複製）、純文字；加到 KP 對照表；回到自己的編輯畫面。
 * 不會改到這個瀏覽器裡自己的內容。
 */
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Button, Notice, useToast } from '@/ui';
import { addMembers } from './actions';
import { MAX_MEMBERS, memberFrom } from './compare';
import type { ProfileData } from './model';
import { ImagesPreview, TextOutput } from './Output';
import { useView } from './store';
import { OUT, S } from './strings';

export function Viewer({ data, onExit }: { data: ProfileData; onExit: () => void }) {
  const toast = useToast();
  const count = useView((s) => s.data.members.length);
  const name = data.profile.nickname.trim() || OUT.noName;
  const addToCompare = () => {
    const m = memberFrom(data, 'link', `PL ${count + 1}`);
    const r = addMembers([m]);
    if (r.added.length)
      toast({
        title: S.viewer.added(m.name),
        description: S.viewer.addedHint,
        tone: 'success',
        replace: true,
      });
    else if (r.dupes.length)
      toast({ title: S.viewer.already(m.name), tone: 'info', replace: true });
    else toast({ title: S.viewer.full(MAX_MEMBERS), tone: 'warning', replace: true });
  };
  return (
    <div className="flex flex-col gap-4" data-testid="viewer">
      <Notice tone="info">
        <span>
          <strong className="mr-1.5">{S.viewer.badge}</strong>
          {S.viewer.lead}
        </span>
      </Notice>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-auto min-w-0 text-lg font-bold text-fg [overflow-wrap:anywhere]">
          {S.viewer.title(name)}
        </h2>
        <Button icon={<UserPlus />} onClick={addToCompare}>
          {S.viewer.addCompare}
        </Button>
        <Button variant="ghost" icon={<ArrowLeft />} onClick={onExit}>
          {S.viewer.makeOwn}
        </Button>
      </div>
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
        <div className="min-w-0">
          <ImagesPreview data={data} avatar={null} />
        </div>
        <div className="min-w-0 lg:sticky-pane">
          <TextOutput data={data} />
        </div>
      </div>
    </div>
  );
}
