/**
 * 角色卡的紙面（A4 兩頁）：預覽、列印、匯出 PNG 都用這個元件排出來的 DOM（樣式在 sheetCss.ts）。
 * 只有文字與框線，沒有互動；會被截掉的欄位標 `data-fit`（預覽量測後提醒，規格 F47）。
 */
import type { CSSProperties, ReactNode } from 'react';
import {
  ASSET_LINES,
  CUSTOM_LINES,
  GEAR_LINES,
  MEMO_LINES,
  type Sheet,
  SKILL_ROWS_PER_COLUMN,
  SKILL_SLOTS,
  type Skill,
  STAT_KEYS,
  STORY_KEYS,
  STORY_LINES,
  type StatKey,
  type StoryKey,
  WEAPON_SLOTS,
} from './model';
import { baseLabel, derived, skillValue, thresholds, weaponValue } from './rules';
import { SHEET_ROOT_CLASS } from './sheetCss';
import { SHEET } from './strings';

const digits = (v: number | string | null) => {
  const n = v === null ? 0 : String(v).length;
  return n >= 5 ? 'n5' : n === 4 ? 'n4' : n === 3 ? 'n3' : '';
};

const show = (v: number | null) => (v === null ? '' : String(v));

/** 一般／困難／極限 */
function Roll({ value }: { value: number | null }) {
  const t = thresholds(value);
  return (
    <span className="cs-roll">
      <span className={`cs-r ${digits(value)}`}>{show(value)}</span>
      <span className={`cs-h ${digits(t.hard)}`}>{show(t.hard)}</span>
      <span className={`cs-x ${digits(t.extreme)}`}>{show(t.extreme)}</span>
    </span>
  );
}

function Check({ on, off }: { on: boolean; off?: boolean }) {
  return <span className={off ? 'cs-check off' : 'cs-check'}>{on && !off ? '✓' : ''}</span>;
}

function Box({
  title,
  className,
  children,
  head,
}: {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
  head?: ReactNode;
}) {
  return (
    <div className={`cs-box ${className ?? ''}`}>
      {head ?? <div className="cs-head">{title}</div>}
      {children}
    </div>
  );
}

/** 一行文字欄位（放不下時截掉，標 data-fit） */
function Fit({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`cs-fit ${className ?? ''}`}
      data-fit={id}
      data-fit-axis="x"
      data-fit-label={label}
    >
      {children}
    </span>
  );
}

/** 有底線的多行文字（自動換行，超過 n 行截掉） */
function Lines({
  id,
  label,
  n,
  text,
  lead,
  className,
  style,
}: {
  id: string;
  label: string;
  n: number;
  text: string;
  lead?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`cs-lines ${className ?? ''}`}
      style={{ '--n': n, ...style } as CSSProperties}
      data-fit={id}
      data-fit-axis={className?.includes('cs-memo-text') ? 'xy' : 'y'}
      data-fit-label={label}
    >
      {lead}
      {text}
    </div>
  );
}

/** 數字軌道：from～to，目前值圈起來，超過上限的變淡 */
function Track({
  from,
  to,
  cols,
  label,
  span,
  now,
  max,
}: {
  from: number;
  to: number;
  cols: number;
  label?: string;
  span?: number;
  now: number | null;
  max: number | null;
}) {
  const cells: ReactNode[] = [];
  if (label)
    cells.push(
      <span key="label" className="cs-tlabel" style={{ '--span': span ?? 1 } as CSSProperties}>
        {label}
      </span>,
    );
  for (let i = from; i <= to; i++) {
    const cls = [i === now ? 'cs-now' : '', max !== null && i > max ? 'cs-over' : '']
      .filter(Boolean)
      .join(' ');
    cells.push(
      <span key={i} className={cls || undefined} data-n={i}>
        <i>{String(i).padStart(2, '0')}</i>
      </span>,
    );
  }
  return (
    <div className="cs-track" style={{ '--cols': cols } as CSSProperties}>
      {cells}
    </div>
  );
}

function SkillCell({ skill, sheet, odd }: { skill: Skill | null; sheet: Sheet; odd: boolean }) {
  const cls = `cs-sk${odd ? ' cs-odd' : ''}`;
  if (!skill) {
    return (
      <div className={cls}>
        <Check on={false} />
        <span className="cs-skl">
          <span className="cs-cus" />
        </span>
        <Roll value={null} />
      </div>
    );
  }
  const base = baseLabel(skill.base);
  const value = skillValue(skill, sheet.stats);
  let label: ReactNode;
  if (skill.kind === 'specialty') {
    label = (
      <>
        <span className="cs-cat">
          {skill.name}
          {base ? <span className="cs-base">（{base}）</span> : null}
        </span>
        <span className="cs-spec">{skill.specialty}</span>
      </>
    );
  } else if (skill.kind === 'custom') {
    label = (
      <span className="cs-cus">
        {skill.name}
        {base && skill.name ? <span className="cs-base">（{base}）</span> : null}
      </span>
    );
  } else {
    label = (
      <span>
        {skill.name}
        {base ? <span className="cs-base">（{base}）</span> : null}
      </span>
    );
  }
  return (
    <div className={cls} data-skill={skill.id}>
      <Check on={skill.checked} off={!skill.checkable} />
      <span className="cs-skl">{label}</span>
      <Roll value={value} />
    </div>
  );
}

function PageOne({ sheet, portraitUrl }: { sheet: Sheet; portraitUrl: string | null }) {
  const d = derived(sheet);
  const info = sheet.info;
  const I = SHEET.info;
  const field = (key: keyof typeof I, wide = true) => (
    <span className="cs-ifield" style={wide ? undefined : { flex: 1 }}>
      <span className="cs-lab">{I[key]}</span>
      <Fit id={`info.${key}`} label={I[key]} className="cs-v cs-u">
        {info[key]}
      </Fit>
    </span>
  );
  const stat = (key: StatKey) => {
    const alias = key === 'INT' ? SHEET.idea : key === 'EDU' ? SHEET.know : null;
    return (
      <div className="cs-stat" key={key} data-stat={key}>
        <span className="cs-stat-name">
          <b>{key}</b>
          {alias ? <i>{alias}</i> : null}
        </span>
        <Roll value={sheet.stats[key]} />
      </div>
    );
  };
  const slots: (Skill | null)[] = Array.from(
    { length: SKILL_SLOTS },
    (_, i) => sheet.skills[i] ?? null,
  );
  const weapons = Array.from({ length: WEAPON_SLOTS }, (_, i) => sheet.weapons[i] ?? null);
  const W = SHEET.weapon;
  return (
    <div className="cs-page" data-page="1">
      <div className="cs-top">
        <Box className="cs-info" head={<div className="cs-head cs-title">{SHEET.title}</div>}>
          <div className="cs-body">
            <div className="cs-irow">{field('name')}</div>
            <div className="cs-irow">{field('player')}</div>
            <div className="cs-irow">{field('occupation')}</div>
            <div className="cs-irow">
              {field('age', false)}
              {field('sex', false)}
            </div>
            <div className="cs-irow">{field('residence')}</div>
            <div className="cs-irow">{field('birthplace')}</div>
          </div>
        </Box>
        <Box className="cs-stats" title={SHEET.characteristics}>
          <div className="cs-body">
            {STAT_KEYS.map(stat)}
            <div className="cs-stat cs-mov" data-stat="MOV">
              <span className="cs-stat-name">
                <b>{SHEET.mov}</b>
              </span>
              <span className={`cs-oval ${digits(d.mov)}`}>{show(d.mov)}</span>
            </div>
          </div>
        </Box>
        <div className="cs-box cs-portrait">
          <div className="cs-portrait-frame">
            {portraitUrl ? <img src={portraitUrl} alt="" /> : null}
          </div>
        </div>
      </div>

      <div className="cs-status">
        <Box className="cs-custom" title={sheet.custom.title}>
          <div className="cs-body">
            <Lines
              id="custom"
              label={sheet.custom.title || SHEET.customTitle}
              n={CUSTOM_LINES}
              text={sheet.custom.text}
            />
          </div>
        </Box>
        <div className="cs-tracks">
          <div className="cs-trow cs-trow-1">
            <div className="cs-box cs-hp">
              <div className="cs-thead">
                <span className="cs-tname">{SHEET.hp}</span>
                <span className="cs-flag">
                  {SHEET.max}
                  <span className="cs-mini">{show(d.hpMax)}</span>
                </span>
              </div>
              <div className="cs-thead cs-thead-2">
                <span className="cs-flag">
                  {SHEET.majorWound}
                  <Check on={sheet.flags.majorWound} />
                </span>
                <span className="cs-flag">
                  {SHEET.dying}
                  <Check on={sheet.flags.dying} />
                </span>
                <span className="cs-flag">
                  {SHEET.unconscious}
                  <Check on={sheet.flags.unconscious} />
                </span>
              </div>
              <Track from={0} to={43} cols={11} now={sheet.hp.current} max={d.hpMax} />
            </div>
            <div className="cs-box cs-san">
              <div className="cs-thead">
                <span className="cs-tname">{SHEET.san}</span>
                <span className="cs-flag">
                  {SHEET.temporary}
                  <Check on={sheet.flags.temporary} />
                </span>
                <span className="cs-flag">
                  {SHEET.indefinite}
                  <Check on={sheet.flags.indefinite} />
                </span>
                <span className="cs-flag">
                  {SHEET.start}
                  <span className="cs-mini">{show(d.sanStart)}</span>
                </span>
                <span className="cs-flag">
                  {SHEET.max}
                  <span className="cs-mini">{show(d.sanMax)}</span>
                </span>
              </div>
              <Track
                from={1}
                to={99}
                cols={17}
                label={SHEET.insane}
                span={3}
                now={sheet.san.current}
                max={d.sanMax}
              />
            </div>
          </div>
          <div className="cs-trow cs-trow-2">
            <div className="cs-box cs-luck">
              <div className="cs-thead">
                <span className="cs-tname">{SHEET.luck}</span>
                <span className="cs-flag">
                  {SHEET.start}
                  <span className="cs-mini">{show(sheet.luck)}</span>
                </span>
              </div>
              <Track
                from={1}
                to={99}
                cols={21}
                label={SHEET.luckOut}
                span={6}
                now={sheet.luckNow}
                max={null}
              />
            </div>
            <div className="cs-box cs-mp">
              <div className="cs-thead">
                <span className="cs-tname">{SHEET.mp}</span>
                <span className="cs-flag">
                  {SHEET.max}
                  <span className="cs-mini">{show(d.mpMax)}</span>
                </span>
              </div>
              <Track from={0} to={23} cols={6} now={sheet.mp.current} max={d.mpMax} />
            </div>
          </div>
        </div>
      </div>

      <Box className="cs-skills" title={SHEET.skills}>
        <div className="cs-sgrid">
          {slots.map((s, i) => (
            <SkillCell
              key={s?.id ?? `empty-${i}`}
              skill={s}
              sheet={sheet}
              odd={(i % SKILL_ROWS_PER_COLUMN) % 2 === 1}
            />
          ))}
        </div>
      </Box>

      <div className="cs-bottom">
        <Box className="cs-weapons" title={SHEET.weapons}>
          <div className="cs-wtable">
            <div className="cs-wrow cs-whead">
              <span>{W.name}</span>
              <span>{W.regular}</span>
              <span>{W.hard}</span>
              <span>{W.extreme}</span>
              <span>{W.damage}</span>
              <span>{W.range}</span>
              <span>{W.attacks}</span>
              <span>{W.ammo}</span>
              <span>{W.malfunction}</span>
            </div>
            {weapons.map((w, i) => {
              const v = w ? weaponValue(w, sheet) : null;
              const t = thresholds(v);
              const cell = (key: string, text: string, num = false) => (
                <Fit
                  id={`weapon.${i}.${key}`}
                  label={SHEET.weaponRow(i + 1)}
                  className={`cs-wc${num ? ' cs-num' : ''}`}
                >
                  {text}
                </Fit>
              );
              return (
                <div className="cs-wrow" key={w?.id ?? `w-${i}`} data-weapon={i}>
                  {cell('name', w?.name ?? '')}
                  {cell('regular', show(v), true)}
                  {cell('hard', show(t.hard), true)}
                  {cell('extreme', show(t.extreme), true)}
                  {cell('damage', w?.damage ?? '')}
                  {cell('range', w?.range ?? '')}
                  {cell('attacks', w?.attacks ?? '')}
                  {cell('ammo', w?.ammo ?? '')}
                  {cell('malfunction', w?.malfunction ?? '')}
                </div>
              );
            })}
          </div>
        </Box>
        <Box className="cs-combat" title={SHEET.combat}>
          <div className="cs-body">
            <div className="cs-citem">
              <span className="cs-lab">{SHEET.db}</span>
              <span
                className={`cs-oval ${digits(d.db)}`}
                data-fit="db"
                data-fit-axis="x"
                data-fit-label={SHEET.db}
              >
                {d.db ?? ''}
              </span>
            </div>
            <div className="cs-citem">
              <span className="cs-lab">{SHEET.build}</span>
              <span className={`cs-oval ${digits(d.build)}`}>{show(d.build)}</span>
            </div>
            <div className="cs-citem">
              <span className="cs-lab">{SHEET.dodge}</span>
              <Roll value={d.dodge} />
            </div>
          </div>
        </Box>
      </div>
    </div>
  );
}

function storyLabel(key: StoryKey) {
  return SHEET.story[key];
}

function PageTwo({ sheet }: { sheet: Sheet }) {
  const column = (keys: readonly StoryKey[]) => (
    <div className="cs-scol">
      {keys.map((k) => (
        <Lines
          key={k}
          id={`story.${k}`}
          label={storyLabel(k)}
          n={STORY_LINES[k]}
          text={sheet.story[k]}
          lead={<span className="cs-lab">{storyLabel(k)}</span>}
        />
      ))}
    </div>
  );
  const gear = sheet.gear.split('\n');
  const half = GEAR_LINES / 2;
  const gearCol = (from: number) => (
    <div className="cs-lcol">
      {Array.from({ length: half }, (_, i) => (
        <Fit
          // biome-ignore lint/suspicious/noArrayIndexKey: 固定的行位置
          key={from + i}
          id={`gear.${from + i}`}
          label={SHEET.lineOf(SHEET.gear, from + i + 1)}
          className="cs-line"
        >
          {gear[from + i] ?? ''}
        </Fit>
      ))}
    </div>
  );
  const other = sheet.assets.other.split('\n');
  const assetLine = (key: 'spending' | 'cash' | 'assets', label: string) => (
    <Fit id={`assets.${key}`} label={label} className="cs-line">
      <span className="cs-lab">{label}</span>
      {sheet.assets[key]}
    </Fit>
  );
  return (
    <div className="cs-page" data-page="2">
      <Box className="cs-story" title={SHEET.backstory}>
        <div className="cs-body">
          {column(STORY_KEYS.slice(0, 5))}
          {column(STORY_KEYS.slice(5))}
        </div>
      </Box>
      <div className="cs-mid">
        <Box className="cs-gear" title={SHEET.gear}>
          <div className="cs-body">
            {gearCol(0)}
            {gearCol(half)}
          </div>
        </Box>
        <Box className="cs-assets" title={SHEET.assets}>
          <div className="cs-body">
            {assetLine('spending', SHEET.spending)}
            {assetLine('cash', SHEET.cash)}
            {assetLine('assets', SHEET.assetsLabel)}
            {Array.from({ length: ASSET_LINES }, (_, i) => (
              <Fit
                // biome-ignore lint/suspicious/noArrayIndexKey: 固定的行位置
                key={`o${i}`}
                id={`assets.other.${i}`}
                label={SHEET.lineOf(SHEET.assets, i + 4)}
                className="cs-line"
              >
                {other[i] ?? ''}
              </Fit>
            ))}
          </div>
        </Box>
      </div>
      <Box className="cs-memo" title={SHEET.memo}>
        <div className="cs-body">
          <Lines
            id="memo"
            label={SHEET.memo}
            n={MEMO_LINES / 2}
            text={sheet.memo}
            className="cs-memo-text"
          />
          <span className="cs-gap" />
        </div>
      </Box>
    </div>
  );
}

/** 兩頁角色卡（`screen` 加上畫面上的頁面陰影與間隔） */
export function SheetView({
  sheet,
  portraitUrl,
  screen = false,
}: {
  sheet: Sheet;
  portraitUrl: string | null;
  screen?: boolean;
}) {
  return (
    <div className={`${SHEET_ROOT_CLASS}${screen ? ' cs-screen' : ''}`}>
      <PageOne sheet={sheet} portraitUrl={portraitUrl} />
      <PageTwo sheet={sheet} />
    </div>
  );
}
