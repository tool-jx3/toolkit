/**
 * 背景與物品分頁（規格 F43～F46）：背景故事 10 項、裝備與隨身物品、現金與資產、備註。
 */
import { FieldRow, Section } from '@/ui';
import { updateSheet } from './actions';
import { TextAreaField, TextField } from './controls';
import { ASSET_LINES, MEMO_LINES, type Sheet, STORY_KEYS, STORY_LINES } from './model';
import { S, SHEET } from './strings';

export function StoryTab({ sheet }: { sheet: Sheet }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.story.backstory} fixed>
        {STORY_KEYS.map((k) => (
          <TextAreaField
            key={k}
            label={SHEET.story[k]}
            hint={S.story.lines(STORY_LINES[k])}
            rows={2}
            value={sheet.story[k]}
            onChange={(v) =>
              updateSheet((s) => {
                s.story[k] = v;
              })
            }
          />
        ))}
      </Section>
      <Section title={S.story.gear} persistKey="coc-sheet:gear">
        <TextAreaField
          label={S.story.gear}
          hint={S.story.gearHint}
          rows={6}
          value={sheet.gear}
          onChange={(v) =>
            updateSheet((s) => {
              s.gear = v;
            })
          }
        />
      </Section>
      <Section title={S.story.assets} persistKey="coc-sheet:assets">
        <FieldRow columns={3}>
          <TextField
            label={S.story.spending}
            value={sheet.assets.spending}
            onChange={(v) =>
              updateSheet((s) => {
                s.assets.spending = v;
              })
            }
          />
          <TextField
            label={S.story.cash}
            value={sheet.assets.cash}
            onChange={(v) =>
              updateSheet((s) => {
                s.assets.cash = v;
              })
            }
          />
          <TextField
            label={S.story.assetsLabel}
            value={sheet.assets.assets}
            onChange={(v) =>
              updateSheet((s) => {
                s.assets.assets = v;
              })
            }
          />
        </FieldRow>
        <TextAreaField
          label={S.story.otherAssets}
          hint={S.story.otherAssetsHint}
          rows={ASSET_LINES - 3}
          value={sheet.assets.other}
          onChange={(v) =>
            updateSheet((s) => {
              s.assets.other = v;
            })
          }
        />
      </Section>
      <Section title={S.story.memo} persistKey="coc-sheet:memo">
        <TextAreaField
          label={S.story.memo}
          hint={S.story.memoHint}
          rows={Math.round(MEMO_LINES / 3)}
          value={sheet.memo}
          onChange={(v) =>
            updateSheet((s) => {
              s.memo = v;
            })
          }
        />
      </Section>
    </div>
  );
}
