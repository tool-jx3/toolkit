/**
 * CoC 擲骰工具（舊版 trpg-lab 的「CoC 7 版擲骰工具」＋「BCDice 傷害自動計算工具」）：
 * - 「擲骰」分頁：技能檢定（獎勵骰／懲罰骰、成功等級）與自訂擲骰共用一個結果區與擲骰紀錄；
 * - 「傷害計算」分頁：貼上 BCDice 的擲骰結果，扣掉護甲後加總成 `:HP-總和` 指令。
 * 規格：docs/refactor/specs/coc-dice.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { parseDiceExpression, rollDiceTerms, rollPercentile } from '@/core/coc';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  withShortcut,
} from '@/ui';
import { DamageTab } from './DamageTab';
import {
  addLogEntry,
  appendDamageLine,
  appendQuickDice,
  clampBonus,
  customLogText,
  type DiceProject,
  formatClock,
  judgedLevel,
  newLogId,
  parseSkill,
  readProject,
  skillLogText,
  TOOL_ID,
} from './logic';
import type { RollOutcome } from './ResultView';
import { RollTab } from './RollTab';
import { type DiceTab, settingsStep, usePrefs, useSettings } from './store';
import { S } from './strings';

function Usage() {
  return (
    <ul>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function pushLog(text: string) {
  usePrefs.getState().update((p) => {
    p.log = addLogEntry(p.log, { id: newLogId(), time: formatClock(new Date()), text });
  });
}

export function App() {
  const tab = usePrefs((p) => p.data.tab);
  const patchPrefs = usePrefs((p) => p.patch);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useSettings);

  const [outcome, setOutcome] = useState<RollOutcome | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const rollId = useRef(0);

  /* 技能檢定（規格 F01～F09） */
  const rollSkill = useCallback(() => {
    const s = useSettings.getState().data;
    const roll = rollPercentile(clampBonus(s.bonus));
    const skill = parseSkill(s.skill);
    const level = judgedLevel(roll, skill);
    const log = skillLogText(roll, skill, level);
    rollId.current += 1;
    setOutcome({ kind: 'skill', id: rollId.current, roll, level, log });
    pushLog(log);
  }, []);

  /* 自訂擲骰（規格 F11～F20） */
  const rollCustom = useCallback(() => {
    const parsed = parseDiceExpression(useSettings.getState().data.expr);
    if (!parsed.ok) {
      setCustomError(parsed.error === 'empty' ? null : S.custom.errors[parsed.error]);
      return;
    }
    setCustomError(null);
    const result = rollDiceTerms(parsed.terms);
    const log = customLogText(parsed.normalized, result);
    rollId.current += 1;
    setOutcome({
      kind: 'custom',
      id: rollId.current,
      terms: result.terms,
      total: result.total,
      log,
    });
    pushLog(log);
  }, []);

  const setExpr = useCallback((expr: string) => {
    setCustomError(null);
    useSettings.getState().update((d) => {
      d.expr = expr;
    });
  }, []);

  const quickDice = useCallback(
    (token: string) =>
      settingsStep(() => setExpr(appendQuickDice(useSettings.getState().data.expr, token))),
    [setExpr],
  );

  /* 自訂擲骰的結果帶入傷害計算（規格 F38、5. D12） */
  const sendToDamage = useCallback((o: RollOutcome) => {
    settingsStep(() =>
      useSettings.getState().update((d) => {
        d.damageText = appendDamageLine(d.damageText, o.log);
      }),
    );
    setSentId(o.id);
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.keysGroup, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keysGroup, handler: redo },
      { keys: 'enter', label: S.enterSkill, group: S.rollGroup },
      { keys: 'enter', label: S.enterCustom, group: S.rollGroup },
    ],
    [undo, redo],
  );

  const headerActions = (
    <>
      <IconButton
        label={withShortcut(S.undo, 'mod+z')}
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        label={withShortcut(S.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
      <ProjectMenu<DiceProject>
        toolId={TOOL_ID}
        getData={() => ({
          settings: useSettings.getState().data,
          log: usePrefs.getState().data.log,
        })}
        onLoad={(raw) => {
          const project = readProject(raw);
          if (!project) return false;
          useSettings.getState().replace(project.settings);
          usePrefs.getState().patch({ log: project.log });
          return true;
        }}
        onReset={() => {
          resetToolStore(useSettings, { clearHistory: false });
          setCustomError(null);
        }}
        savedAt={savedAt}
        fileName={S.project.fileName}
        resetText={{
          label: S.project.resetLabel,
          title: S.project.resetTitle,
          description: S.project.resetDescription,
        }}
      />
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      body={
        <>
          <UsageSection persistKey={`${TOOL_ID}:usage`}>
            <Usage />
          </UsageSection>
          <Tabs<DiceTab>
            aria-label={S.tabsLabel}
            value={tab === 'damage' ? 'damage' : 'roll'}
            onValueChange={(v) => patchPrefs({ tab: v })}
            keepMounted
            items={[
              {
                value: 'roll',
                label: S.tabs.roll,
                content: (
                  <RollTab
                    outcome={outcome}
                    customError={customError}
                    onSkillRoll={rollSkill}
                    onCustomRoll={rollCustom}
                    onQuickDice={quickDice}
                    onExprChange={setExpr}
                    onSendToDamage={sendToDamage}
                    sentId={sentId}
                  />
                ),
              },
              { value: 'damage', label: S.tabs.damage, content: <DamageTab /> },
            ]}
          />
        </>
      }
    />
  );
}
