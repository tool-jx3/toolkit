/**
 * 「全體設定」分頁（規格 1.6）：盤面、棋子大小、給 NPC 的設定、共用的聊天面板、差分的 @ 名稱。
 */
import { Field, NumberInput, Section, Segmented, TextArea, Toggle } from '@/ui';
import { setOpts } from './actions';
import { SIZE_MAX, SIZE_MIN } from './model';
import { useDoc } from './store';
import { S } from './strings';

type Board = 'list' | 'board';

export function SettingsPanel() {
  const opts = useDoc((s) => s.data.opts);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.settingsTitle} fixed>
        <Field label={S.board} hint={S.boardHint}>
          <Segmented<Board>
            fullWidth
            value={opts.active ? 'board' : 'list'}
            onValueChange={(v) => setOpts({ active: v === 'board' })}
            options={[
              { value: 'list', label: S.boardOptions.list },
              { value: 'board', label: S.boardOptions.board },
            ]}
          />
        </Field>
        <Field label={S.size}>
          <NumberInput
            value={opts.size}
            onChange={(v) => setOpts({ size: v })}
            min={SIZE_MIN}
            max={SIZE_MAX}
            step={1}
            precision={0}
            unit={S.sizeUnit}
          />
        </Field>
      </Section>
      <Section title={S.npcTitle} fixed description={S.npcHint}>
        <Field label={S.secret} layout="inline">
          <Toggle checked={opts.secret} onCheckedChange={(v) => setOpts({ secret: v })} />
        </Field>
        <Field label={S.hideStatus} layout="inline">
          <Toggle checked={opts.hideStatus} onCheckedChange={(v) => setOpts({ hideStatus: v })} />
        </Field>
      </Section>
      <Section title={S.commonCommands} fixed>
        <Field label={S.commonCommands} hint={S.commonHint}>
          <TextArea
            rows={4}
            spellCheck={false}
            autoComplete="off"
            placeholder={S.commonPlaceholder}
            value={opts.commonCommands}
            onChange={(e) => setOpts({ commonCommands: e.target.value })}
            className="font-mono text-xs"
            data-testid="common-commands"
          />
        </Field>
        <Field label={S.faceCommands} layout="inline" hint={S.faceCommandsHint}>
          <Toggle
            checked={opts.faceCommands}
            onCheckedChange={(v) => setOpts({ faceCommands: v })}
          />
        </Field>
      </Section>
    </div>
  );
}
